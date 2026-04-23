// Location detection. Offline-first: never phones home. Uses the system
// timezone (Intl.DateTimeFormat().resolvedOptions().timeZone) to guess a
// representative city, then lets the renderer override with precise HTML5
// geolocation or a manual entry via IPC.
//
// Detection strategies (in order of preference):
//   1. Explicit user choice — stored in prayer-config.json, never overridden.
//   2. HTML5 geolocation — the renderer or mobile-control UI can push precise
//      lat/lng via the `location:set` IPC.
//   3. System timezone — best offline guess. Works on fresh installs with no
//      network and no user input.

const { lookup, GLOBAL_FALLBACK } = require('./timezone-table');
const { nearestCity, approxDistanceKm } = require('./cities');

function getSystemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (_) {
    return null;
  }
}

// Detect a representative location from the system timezone. Returns a
// { lat, lng, name, nameAr, country, source } record. `source` is one of
// 'timezone', 'fallback' — helps callers decide whether to re-detect later.
function detectFromTimezone() {
  const tz = getSystemTimezone();
  const match = lookup(tz);
  if (match) {
    return { ...match, timezone: tz, source: 'timezone' };
  }
  return { ...GLOBAL_FALLBACK, timezone: tz, source: 'fallback' };
}

// Validate a lat/lng pair coming from the renderer (HTML5 geolocation, manual
// entry). Throws on bad input so IPC can return a structured error.
//
// Reject BOOLEAN and NULL before coercion — `Number(true) === 1` and
// `Number(null) === 0` both pass `Number.isFinite`, which silently placed
// the mosque at (1, 0) or (0, 0) for a UI that sent the wrong types. This
// strict pre-check also rejects arrays and objects (which coerce to NaN
// anyway, but fail loudly instead of silently).
function validateCoordinates(lat, lng) {
  for (const [name, v] of [['lat', lat], ['lng', lng]]) {
    if (v === null || v === undefined || typeof v === 'boolean') {
      throw new Error(`${name} must be a number, got ${v === null ? 'null' : typeof v}`);
    }
    if (typeof v === 'object') {
      throw new Error(`${name} must be a number, got ${Array.isArray(v) ? 'array' : 'object'}`);
    }
  }
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    throw new Error('lat/lng must be finite numbers');
  }
  if (la < -90 || la > 90)   throw new Error(`lat out of range: ${la}`);
  if (ln < -180 || ln > 180) throw new Error(`lng out of range: ${ln}`);
  // Reject exact (0, 0) — "Null Island" is almost always a UI bug, not a
  // real mosque location in the Gulf of Guinea.
  if (la === 0 && ln === 0) {
    throw new Error('lat/lng (0, 0) is not a valid mosque location');
  }
  return { lat: la, lng: ln };
}

// Reverse geocode lat/lng via OpenStreetMap Nominatim. Free, no API key,
// includes village / hamlet / neighbourhood detail in Arabic — far more
// granular than our offline DB for small Shia settlements in Iraq, Iran,
// Bahrain, Eastern Province, Lebanon.
//
// Called only when the operator explicitly asks for "high-accuracy
// naming" in Settings — so the offline-first default stays intact.
// Rate-limit: Nominatim accepts 1 request per second per IP. We never
// loop — one call per manual GPS handoff is well within limits.
//
// Returns { name, components, source: 'nominatim' } or null on any
// network error (caller falls back to nearestCity()).
async function reverseGeocodeNominatim(lat, lng, { timeoutMs = 5000, userAgent = 'Mithnah/1.0 (mosque display)' } = {}) {
  const { lat: la, lng: ln } = validateCoordinates(lat, lng);
  const https = require('https');
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(la));
  url.searchParams.set('lon', String(ln));
  url.searchParams.set('zoom', '14'); // village / suburb level
  url.searchParams.set('accept-language', 'ar,en');
  url.searchParams.set('addressdetails', '1');

  return await new Promise((resolve) => {
    const req = https.get(url.toString(), {
      headers: {
        // Nominatim Terms require a descriptive User-Agent identifying the
        // application. We send the product name — no user-identifying data.
        'User-Agent': userAgent,
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) {
          req.destroy();
          resolve(null);
        }
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const addr = json.address || {};
          // Preference order: the most specific name available. Villages and
          // hamlets win over cities for Shia settlements like the هجرة villages
          // in Eastern Province.
          const name =
            addr.village || addr.hamlet || addr.neighbourhood || addr.suburb ||
            addr.town || addr.city || addr.municipality ||
            addr.county || addr.state || json.name || null;
          if (!name) { resolve(null); return; }
          resolve({
            name: String(name).trim().slice(0, 120),
            components: {
              village:      addr.village     || null,
              hamlet:       addr.hamlet      || null,
              neighbourhood:addr.neighbourhood || null,
              suburb:       addr.suburb      || null,
              town:         addr.town        || null,
              city:         addr.city        || null,
              county:       addr.county      || null,
              state:        addr.state       || null,
              country:      addr.country     || null,
              countryCode:  addr.country_code || null
            },
            source: 'nominatim'
          });
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Query Overpass API for all populated places within `radiusKm` of a point.
// Returns [{ id, name, nameAr, place, lat, lng, distanceKm }, ...] sorted
// by distance. "place" is one of city/town/village/hamlet/suburb/
// neighbourhood/isolated_dwelling. Arabic name preferred when OSM tags it.
//
// Uses the Overpass QL language with `around:` to get nodes of tag
// place=*. Free service, no API key, few-second typical response time.
// Falls back gracefully to [] on any network or parse error — caller
// should fall back to its offline city DB.
async function nearbyPlacesOverpass(lat, lng, { radiusKm = 10, timeoutMs = 12_000, userAgent = 'Mithnah/1.0' } = {}) {
  const { lat: la, lng: ln } = validateCoordinates(lat, lng);
  const https = require('https');
  const placeFilter = '["place"~"^(city|town|village|hamlet|suburb|neighbourhood|isolated_dwelling)$"]';
  const query =
    `[out:json][timeout:10];
     (node${placeFilter}(around:${Math.round(radiusKm * 1000)},${la},${ln}););
     out body;`;
  const url = 'https://overpass-api.de/api/interpreter';
  const body = 'data=' + encodeURIComponent(query);

  return await new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 1024 * 1024) { req.destroy(); resolve([]); }
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const elements = Array.isArray(json.elements) ? json.elements : [];
          const placeRank = { city: 5, town: 4, village: 3, hamlet: 2, suburb: 2, neighbourhood: 1, isolated_dwelling: 0 };
          const results = elements
            .filter((el) => el.type === 'node' && el.tags && el.tags.name)
            .map((el) => {
              const tags = el.tags || {};
              const nameAr = tags['name:ar'] || tags.name;
              const name   = tags.name || nameAr;
              const distanceKm = approxDistanceKm(la, ln, el.lat, el.lon);
              return {
                id: String(el.id),
                name, nameAr,
                place: tags.place || 'unknown',
                lat: el.lat, lng: el.lon,
                distanceKm,
                rank: placeRank[tags.place] ?? 0
              };
            })
            .sort((a, b) => a.distanceKm - b.distanceKm);
          resolve(results.slice(0, 40));
        } catch (_) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
}

// Free-text place search via OpenStreetMap Nominatim /search. Returns a
// distance-sorted list of matches with structured components (country,
// state, city, village, neighbourhood) so the caller can present them
// hierarchically. Used as the GPS-independent fallback when the operator
// wants to type "القطيف" or "الحيرة" instead of using coordinates.
async function searchPlacesNominatim(query, { limit = 10, timeoutMs = 8_000, userAgent = 'Mithnah/1.0' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const https = require('https');
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(Math.min(20, Math.max(1, limit))));
  url.searchParams.set('accept-language', 'ar,en');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('dedupe', '1');

  return await new Promise((resolve) => {
    const req = https.get(url.toString(), {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 512 * 1024) { req.destroy(); resolve([]); }
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!Array.isArray(json)) { resolve([]); return; }
          const results = json.map((it) => {
            const addr = it.address || {};
            const name =
              addr.village || addr.hamlet || addr.neighbourhood || addr.suburb ||
              addr.town || addr.city || addr.municipality ||
              addr.county || addr.state || it.display_name || it.name || '';
            return {
              id: String(it.place_id || `${it.lat},${it.lon}`),
              name: String(name).slice(0, 120),
              displayName: String(it.display_name || '').slice(0, 200),
              lat: Number(it.lat),
              lng: Number(it.lon),
              type: it.type || 'unknown',
              category: it.category || it.class || 'unknown',
              components: {
                country:        addr.country       || null,
                countryCode:    addr.country_code  || null,
                state:          addr.state         || null,
                region:         addr.region        || addr.county || null,
                city:           addr.city          || addr.town   || null,
                village:        addr.village       || addr.hamlet || null,
                neighbourhood:  addr.neighbourhood || addr.suburb || null,
              }
            };
          }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
          resolve(results);
        } catch (_) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

module.exports = {
  detectFromTimezone,
  validateCoordinates,
  getSystemTimezone,
  nearestCity,
  approxDistanceKm,
  reverseGeocodeNominatim,
  nearbyPlacesOverpass,
  searchPlacesNominatim
};
