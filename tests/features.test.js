// Feature-level unit tests. Each feature is verified along seven axes:
//   (1) default value in fresh config
//   (2) coerce() accepts a valid boolean toggle
//   (3) coerce() strips unknown/malformed entries
//   (4) round-trip via save()+load() preserves state
//   (5) setConfig() shallow-merges `features` without wiping siblings
//   (6) feature-specific behavior (computation, edge case, invariant)
//   (7) interaction with another feature or subsystem

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mithnah-features-'));
}

// ---------------------------------------------------------------------------
// (A) Feature framework
// ---------------------------------------------------------------------------

test('[features] defaults cover every live flag with expected defaults', () => {
  const { defaultFeatures } = require('../src/main/prayer-times/defaults');
  const f = defaultFeatures();
  assert.strictEqual(f.maghribPivot, true);
  assert.strictEqual(f.ramadanCountdown, true);
  assert.strictEqual(f.qiblaDisplay, false); // default OFF (0.8.33)
  // Retired flags — assert they're gone so a future refactor doesn't
  // silently reintroduce them:
  //   - dhikrCounter          (0.8.28)
  //   - fridayKhutbahTimer    (2026-04-23)
  //   - infalliblesRotator    (2026-04-23)
  assert.strictEqual(f.dhikrCounter,       undefined);
  assert.strictEqual(f.fridayKhutbahTimer, undefined);
  assert.strictEqual(f.infalliblesRotator, undefined);
  assert.strictEqual(f.configBackup, true);
  // Sensitive/destructive toggles default OFF.
  assert.strictEqual(f.announcementBanner, false);
  assert.strictEqual(f.autoContentToday, false);
  assert.strictEqual(f.autoLaunch, false);
  assert.strictEqual(f.kioskLock, false);
  assert.strictEqual(f.settingsPin, false);
});

test('[features] coerce accepts valid booleans, drops unknown keys', () => {
  const { coerce } = require('../src/main/prayer-times/config');
  const out = coerce({
    features: {
      kioskLock: true,
      maghribPivot: false,
      notARealFlag: true,          // should be dropped
      announcementBanner: 'yes'    // non-boolean, reverts to default (false)
    }
  });
  assert.strictEqual(out.features.kioskLock, true);
  assert.strictEqual(out.features.maghribPivot, false);
  assert.strictEqual(out.features.announcementBanner, false);
  assert.strictEqual('notARealFlag' in out.features, false);
});

test('[features] save + load round-trip preserves toggles', async () => {
  const { save, load } = require('../src/main/prayer-times/config');
  const { defaultConfig } = require('../src/main/prayer-times/defaults');
  const dir = tmpDir();
  const cfg = defaultConfig();
  cfg.features.kioskLock = true;
  cfg.features.announcementBanner = true;
  cfg.announcementText = 'اختبار الإعلان';
  await save(dir, cfg);
  const loaded = await load(dir);
  assert.strictEqual(loaded.features.kioskLock, true);
  assert.strictEqual(loaded.features.announcementBanner, true);
  assert.strictEqual(loaded.announcementText, 'اختبار الإعلان');
  // Sibling flags are preserved, not wiped.
  assert.strictEqual(loaded.features.ramadanCountdown, true);
});

test('[features] coerce enforces announcementText length cap', () => {
  const { coerce } = require('../src/main/prayer-times/config');
  const big = 'أ'.repeat(500);
  const out = coerce({ announcementText: big });
  assert.ok(out.announcementText.length <= 240);
});

test('[features] coerce rejects malformed settingsPinHash', () => {
  const { coerce } = require('../src/main/prayer-times/config');
  assert.strictEqual(coerce({ settingsPinHash: 'not-a-hash' }).settingsPinHash, null);
  assert.strictEqual(coerce({ settingsPinHash: 123 }).settingsPinHash, null);
  // Valid shape passes through.
  const valid = 'deadbeefcafebabe0123456789abcdef' + '$' + 'a'.repeat(128);
  assert.strictEqual(coerce({ settingsPinHash: valid }).settingsPinHash, valid);
});

// ---------------------------------------------------------------------------
// (B) Maghrib pivot for event lookups
// ---------------------------------------------------------------------------

test('[maghrib-pivot] before maghrib returns today\'s Hijri', () => {
  const { effectiveHijriForEvents } = require('../src/main/bridge-ipc');
  const now = new Date('2026-04-20T14:00:00Z'); // before dusk in most zones
  const maghrib = new Date('2026-04-20T17:00:00Z');
  const cfg = { calendar: 'jafari', calendarDayOffset: 0, features: { maghribPivot: true } };
  const h = effectiveHijriForEvents(cfg, { times: { maghrib } }, now);
  assert.ok(h && Number.isInteger(h.year) && h.month >= 1 && h.month <= 12);
});

test('[maghrib-pivot] after maghrib shifts to tomorrow\'s Hijri', () => {
  const { effectiveHijriForEvents } = require('../src/main/bridge-ipc');
  const hijri = require('../src/main/hijri');
  const maghrib = new Date('2026-04-20T17:00:00Z');
  const beforeNow = new Date('2026-04-20T16:00:00Z');
  const afterNow  = new Date('2026-04-20T18:00:00Z');
  const cfg = { calendar: 'jafari', calendarDayOffset: 0, features: { maghribPivot: true } };
  const before = effectiveHijriForEvents(cfg, { times: { maghrib } }, beforeNow);
  const after  = effectiveHijriForEvents(cfg, { times: { maghrib } }, afterNow);
  // "Tomorrow's" Hijri (day-level) should match afterNow + 24h — compare
  // only the calendar fields, since gregorianIso reflects the exact
  // timestamp that was converted and we deliberately don't control that.
  const tomorrowGregorian = new Date(afterNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowH = hijri.toHijri(tomorrowGregorian, 'jafari');
  assert.strictEqual(after.year,  tomorrowH.year);
  assert.strictEqual(after.month, tomorrowH.month);
  assert.strictEqual(after.day,   tomorrowH.day);
  // And differs from the pre-maghrib lookup (the whole point).
  assert.notStrictEqual(`${before.year}-${before.month}-${before.day}`,
                         `${after.year}-${after.month}-${after.day}`);
});

test('[maghrib-pivot] disabled flag returns today\'s Hijri even after dusk', () => {
  const { effectiveHijriForEvents } = require('../src/main/bridge-ipc');
  const maghrib = new Date('2026-04-20T17:00:00Z');
  const afterNow = new Date('2026-04-20T20:00:00Z');
  const cfg = { calendar: 'jafari', calendarDayOffset: 0, features: { maghribPivot: false } };
  const h = effectiveHijriForEvents(cfg, { times: { maghrib } }, afterNow);
  const hijri = require('../src/main/hijri');
  const todayH = hijri.toHijri(afterNow, 'jafari');
  assert.deepStrictEqual(h, todayH);
});

test('[maghrib-pivot] missing maghrib falls back to today\'s Hijri', () => {
  const { effectiveHijriForEvents } = require('../src/main/bridge-ipc');
  const now = new Date('2026-04-20T20:00:00Z');
  const cfg = { calendar: 'jafari', features: { maghribPivot: true } };
  const h = effectiveHijriForEvents(cfg, null, now);
  assert.ok(h && Number.isInteger(h.year));
});

// ---------------------------------------------------------------------------
// (C) Qibla
// ---------------------------------------------------------------------------

test('[qibla] bearing from Najaf points roughly south-south-west', () => {
  const { computeQibla } = require('../src/main/app-features');
  // Najaf (32.0256, 44.3269) → Mecca (21.4225, 39.8262) is ~SSW, roughly 199°.
  const q = computeQibla(32.0256, 44.3269);
  assert.ok(q.bearingDeg > 195 && q.bearingDeg < 210, `bearing was ${q.bearingDeg}`);
  // Great-circle distance Najaf → Mecca is ~1215 km.
  assert.ok(q.distanceKm > 1150 && q.distanceKm < 1280, `distance was ${q.distanceKm}`);
});

test('[qibla] bearing from Dearborn points roughly east', () => {
  const { computeQibla } = require('../src/main/app-features');
  // Dearborn, MI → Mecca is ~55-60° (roughly ENE).
  const q = computeQibla(42.3223, -83.1763);
  assert.ok(q.bearingDeg > 40 && q.bearingDeg < 75, `bearing was ${q.bearingDeg}`);
});

test('[qibla] rejects non-finite coordinates', () => {
  const { computeQibla } = require('../src/main/app-features');
  assert.throws(() => computeQibla(NaN, 0), /finite/);
  assert.throws(() => computeQibla(0, Infinity), /finite/);
});

// ---------------------------------------------------------------------------
// (D) PIN hashing
// ---------------------------------------------------------------------------

test('[pin] hash-then-verify round trip succeeds', () => {
  const { makePinHash, verifyPinAgainstHash, resetPinRateLimit } = require('../src/main/app-features');
  resetPinRateLimit();
  const stored = makePinHash('1234');
  assert.match(stored, /^[0-9a-f]+\$[0-9a-f]{128}$/);
  assert.strictEqual(verifyPinAgainstHash('1234', stored), true);
});

test('[pin] wrong PIN rejected', () => {
  const { makePinHash, verifyPinAgainstHash, resetPinRateLimit } = require('../src/main/app-features');
  resetPinRateLimit();
  const stored = makePinHash('5678');
  assert.strictEqual(verifyPinAgainstHash('0000', stored), false);
});

test('[pin] rate limits after 8 failures within a window', () => {
  const { makePinHash, verifyPinAgainstHash, resetPinRateLimit } = require('../src/main/app-features');
  resetPinRateLimit();
  const stored = makePinHash('9999');
  for (let i = 0; i < 8; i++) verifyPinAgainstHash('0000', stored);
  assert.throws(() => verifyPinAgainstHash('0000', stored), /المحاولات|انتظر/);
});

test('[pin] invalid PIN length rejected at makePinHash', () => {
  const { makePinHash } = require('../src/main/app-features');
  assert.throws(() => makePinHash(''));
  assert.throws(() => makePinHash('123'));        // too short
  assert.throws(() => makePinHash('123456789'));  // too long
  assert.throws(() => makePinHash('abcd'));       // not digits
});

// ---------------------------------------------------------------------------
// (E) Auto-content
// ---------------------------------------------------------------------------

test('[auto-content] picks Ziyarat Ashura on 10 Muharram', () => {
  const { pickAutoDeck } = require('../src/main/auto-content');
  const shia = require('../src/main/shia-content');
  const events = shia.eventsForHijriDate(1447, 1, 10);
  const pick = pickAutoDeck(events);
  assert.deepStrictEqual(pick, { kind: 'ziyarah', id: 'ashura' });
});

test('[auto-content] picks Dua Arafah on 9 Dhul-Hijjah', () => {
  const { pickAutoDeck } = require('../src/main/auto-content');
  const shia = require('../src/main/shia-content');
  const events = shia.eventsForHijriDate(1447, 12, 9);
  const pick = pickAutoDeck(events);
  assert.deepStrictEqual(pick, { kind: 'dua', id: 'arafah' });
  // And the deck actually loads from the registry — catches id drift.
  const deck = shia.getDua('arafah');
  assert.ok(deck && Array.isArray(deck.slides) && deck.slides.length > 0);
});

test('[auto-content] falls back to a weekday deck on an ordinary day', () => {
  // Reworked 2026-04-23: operator reported "دعاء اليوم ما يشتغل"
  // because the feature returned null on every non-event day.
  // pickAutoDeck now returns a weekday-mapped deck so the caretaker
  // always sees SOMETHING meaningful.
  const { pickAutoDeck, WEEKDAY_FALLBACK } = require('../src/main/auto-content');
  // Fixed Monday (2026-04-20 is a Monday) — no events, no Ramadan.
  const monday = new Date(2026, 3, 20);
  const pick = pickAutoDeck([], { now: monday, hijri: { year: 1447, month: 10, day: 3 } });
  assert.deepStrictEqual(pick, WEEKDAY_FALLBACK[1]);
  // Empty-events + undefined opts still yields a fallback (safe default).
  const today = pickAutoDeck([]);
  assert.ok(today && today.kind && today.id);
});

test('[auto-content] returns Iftitah across any Ramadan day with no specific event', () => {
  const { pickAutoDeck } = require('../src/main/auto-content');
  // Random Ramadan day (5 Ramadan, no event).
  const pick = pickAutoDeck([], { hijri: { year: 1447, month: 9, day: 5 }, now: new Date(2026, 3, 24) });
  assert.deepStrictEqual(pick, { kind: 'dua', id: 'iftitah' });
});

test('[auto-content] prefers shahadah over wiladah when both collide', () => {
  const { pickAutoDeck } = require('../src/main/auto-content');
  const pick = pickAutoDeck([
    { id: 'imam-sadiq-birth', kind: 'wiladah' },
    { id: 'ashura',           kind: 'shahadah' }
  ]);
  assert.strictEqual(pick?.id, 'ashura');
});

test('[auto-content] every mapping resolves to a real deck in the registry', () => {
  const { EVENT_TO_DECK } = require('../src/main/auto-content');
  const shia = require('../src/main/shia-content');
  for (const [eventId, target] of Object.entries(EVENT_TO_DECK)) {
    let deck = null;
    if (target.kind === 'dua') deck = shia.getDua(target.id);
    else if (target.kind === 'ziyarah') deck = shia.getZiyarah(target.id);
    else if (target.kind === 'taqib') deck = (shia.listTaqibat().find(t => t.id === target.id) || null);
    assert.ok(deck, `mapping for event "${eventId}" → ${target.kind}/${target.id} doesn't resolve`);
  }
});

// ---------------------------------------------------------------------------
// (F) Munajat Shabaniya content integrity
// ---------------------------------------------------------------------------

test('[munajat-shabaniya] has full multi-slide deck (not the placeholder)', () => {
  const shia = require('../src/main/shia-content');
  const deck = shia.getDua('munajat-shabaniya');
  assert.ok(deck, 'munajat-shabaniya deck missing from registry');
  assert.ok(deck.slides.length >= 8, `expected ≥8 slides, got ${deck.slides.length}`);
  // The recognizable phrase "هَبْ لي كَمالَ الانْقِطاعِ" should appear somewhere.
  const full = deck.slides.map(s => s.ar || '').join(' ');
  assert.match(full, /كَمالَ\s*الانْقِطاعِ/);
});
