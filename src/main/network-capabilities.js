// Network capability detection for the offline-pairing UX. The
// PairingModal asks for a snapshot of the host's networking state so it
// can decide whether to show the normal LAN QR or guide the operator to
// turn on Windows Mobile Hotspot.
//
// All checks are best-effort and short-timeout: this module is on the
// pairing-modal critical path so a slow PowerShell child shouldn't keep
// the modal stuck on a loading state. Any failure resolves to a
// permissive fallback (null fields, not an exception) so the renderer
// stays functional even if WMI / Get-NetAdapter is missing.
//
// This module does NOT enable or disable Windows Mobile Hotspot — that
// is deferred to a later phase. It only inspects state and offers an
// `openHotspotSettings()` shortcut that hands off to the Windows
// Settings deep-link.

const os = require('os');
const { execFile } = require('child_process');
const { shell } = require('electron');

const HOTSPOT_IPV4_PREFIX = '192.168.137.';
const HOTSPOT_HOST_IPV4   = '192.168.137.1';
const POWERSHELL_TIMEOUT_MS = 1500;
const CAPS_CACHE_TTL_MS = 8 * 1000;

let _capsCache = null;
let _capsCacheAt = 0;
let _inflightDetect = null;

function listLocalIpv4Addresses() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      out.push(entry.address);
    }
  }
  return out;
}

// Same scoring as src/main/index.js#getLanIPv4Addresses but with the
// hotspot subnet pushed to the bottom so the "best LAN" pick reflects a
// real router-managed network when both exist.
function scoreLanIpv4(addr) {
  if (addr.startsWith(HOTSPOT_IPV4_PREFIX)) return 99;
  if (addr.startsWith('192.168.')) return 1;
  if (addr.startsWith('10.')) return 2;
  const m = addr.match(/^172\.(\d+)\./);
  if (m) {
    const subnet = Number(m[1]);
    if (subnet >= 16 && subnet <= 31) return 3;
  }
  return 9;
}

function pickBestLanIpv4(addrs) {
  const sorted = [...new Set(addrs)]
    .filter((a) => !a.startsWith(HOTSPOT_IPV4_PREFIX))
    .sort((a, b) => scoreLanIpv4(a) - scoreLanIpv4(b));
  return sorted[0] || null;
}

function detectHotspotIpv4(addrs) {
  return addrs.includes(HOTSPOT_HOST_IPV4) ? HOTSPOT_HOST_IPV4 : null;
}

function runPowerShell(script, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 },
        (err, stdout) => {
          if (err) return finish(null);
          finish(typeof stdout === 'string' ? stdout : '');
        }
      );
      child.on('error', () => finish(null));
    } catch (_) {
      finish(null);
    }
  });
}

// Best-effort Wi-Fi adapter probe. Returns:
//   true  — at least one Wi-Fi NIC is present
//   false — definitely none
//   null  — could not determine (no PowerShell, slow, error)
async function detectWifiAdapterWin32() {
  if (process.platform !== 'win32') return null;
  // Get-NetAdapter is built-in since PowerShell 3 / Windows 8.
  // PhysicalMediaType 'Native 802.11' is the canonical Wi-Fi marker.
  const script =
    "(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | " +
    "Where-Object { $_.PhysicalMediaType -eq 'Native 802.11' } | " +
    "Measure-Object).Count";
  const out = await runPowerShell(script, POWERSHELL_TIMEOUT_MS);
  if (out === null) return null;
  const count = parseInt(String(out).trim(), 10);
  if (Number.isFinite(count)) return count > 0;
  return null;
}

async function computeCapabilities() {
  const platform = process.platform;
  const addrs = listLocalIpv4Addresses();
  const lanIpv4 = pickBestLanIpv4(addrs);
  const hotspotIpv4 = detectHotspotIpv4(addrs);
  const hasHotspotInterface = !!hotspotIpv4;
  const hasWifiAdapter = platform === 'win32' ? await detectWifiAdapterWin32() : null;
  const canOpenHotspotSettings = platform === 'win32';
  // Permissive: if we couldn't tell whether a Wi-Fi NIC exists, still
  // show the hotspot path. Worse to hide the only escape hatch than to
  // show a button that may not work.
  const hotspotLikelyAvailable = platform === 'win32' && hasWifiAdapter !== false;

  return {
    platform,
    lanIpv4,
    hotspotIpv4,
    hasHotspotInterface,
    hasWifiAdapter,
    hotspotLikelyAvailable,
    canOpenHotspotSettings,
    detectedAt: Date.now(),
  };
}

async function getNetworkCapabilities({ force = false } = {}) {
  const now = Date.now();
  if (!force && _capsCache && now - _capsCacheAt < CAPS_CACHE_TTL_MS) {
    return _capsCache;
  }
  // Coalesce concurrent callers onto one in-flight detection so a burst
  // of PairingModal renders doesn't fan out to N PowerShell children.
  if (_inflightDetect) return _inflightDetect;
  _inflightDetect = (async () => {
    try {
      const caps = await computeCapabilities();
      _capsCache = caps;
      _capsCacheAt = Date.now();
      return caps;
    } catch (err) {
      const fallback = {
        platform: process.platform,
        lanIpv4: null,
        hotspotIpv4: null,
        hasHotspotInterface: false,
        hasWifiAdapter: null,
        hotspotLikelyAvailable: false,
        canOpenHotspotSettings: process.platform === 'win32',
        detectedAt: Date.now(),
        error: String(err && err.message ? err.message : err),
      };
      return fallback;
    } finally {
      _inflightDetect = null;
    }
  })();
  return _inflightDetect;
}

async function openHotspotSettings() {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'not_supported_on_platform' };
  }
  try {
    await shell.openExternal('ms-settings:network-mobilehotspot');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function invalidateCache() {
  _capsCache = null;
  _capsCacheAt = 0;
}

module.exports = {
  getNetworkCapabilities,
  openHotspotSettings,
  invalidateCache,
  HOTSPOT_HOST_IPV4,
  HOTSPOT_IPV4_PREFIX,
  // Exported for unit tests.
  _scoreLanIpv4: scoreLanIpv4,
  _pickBestLanIpv4: pickBestLanIpv4,
  _detectHotspotIpv4: detectHotspotIpv4,
};
