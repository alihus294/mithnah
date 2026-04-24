// Pluggable auto-updater. The project is **architected** to support silent
// background updates from any backend — GitHub Releases, a self-hosted
// electron-updater-compatible feed (latest.yml + blockmap + .exe), or a
// custom HTTP API — but the ACTUAL feed is configured separately and
// defaults to OFF. The operator opts in by populating `build.publish` in
// package.json OR by setting MITHNAH_UPDATE_FEED to a generic feed URL
// at runtime.
//
// State machine:
//   idle           — default; no checks running.
//   checking       — after start(), an initial check has been kicked off.
//   downloading    — a newer version is available; electron-updater is
//                    streaming the .exe + .blockmap to userData.
//   ready          — download complete; we prompt the user (AR+EN modal)
//                    to restart now or at next quit.
//   error          — last check/download failed; retried on the next tick.
//
// Events propagated to the renderer via IPC channel `updater:state` so the
// UI can show a "Update available" badge without hammering the module.

const { dialog } = require('electron');

// Scheduling policy (operator-requested, 2026-04-23):
//   • 10 s after launch: first check — catches an update that was
//     published while the wall was powered off overnight.
//   • While online: one check per day at local 00:00. The hall is
//     empty, the install (if any) downloads silently, and the restart
//     prompt is waiting when the caretaker walks in the next morning.
//   • While offline: retry every 2 minutes. The first retry that
//     succeeds is effectively "as soon as the Wi-Fi came back" — we
//     don't need a separate `online` event listener, the fast-retry
//     loop gets there first.
const INITIAL_CHECK_DELAY_MS = 10 * 1000;
const OFFLINE_RETRY_MS       = 2 * 60 * 1000;
// Substrings that identify a network error (as opposed to a 404 /
// parse error / code bug). When we see these we flip into the
// fast-retry loop; otherwise the daily schedule resumes unchanged.
const NETWORK_ERROR_PATTERNS = [
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED',
  'net::ERR_', 'getaddrinfo', 'unable to verify',
  'network', 'Network', 'offline'
];

const IPC_STATE_CHANNEL = 'updater:state';

let autoUpdater = null;
let scheduledTimer = null; // tracks EITHER the next-midnight timer OR the 2-min retry
let hasShownRestartPrompt = false;
let started = false;
let state = 'idle';
let lastInfo = null;
let lastCheckFailedNetwork = false;
let getMainWindow = () => null;

function safeRequireUpdater() {
  // Lazy-require so the dependency is only pulled when the updater is
  // actually started. A packaging environment that doesn't include
  // electron-updater can still run the rest of the app.
  if (autoUpdater) return autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.warn('[updater] electron-updater not available — auto-update disabled:', err.message);
    return null;
  }
}

function setState(next, info) {
  state = next;
  lastInfo = info || null;
  const win = getMainWindow && getMainWindow();
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send(IPC_STATE_CHANNEL, { state, info: lastInfo });
    } catch (_) { /* window closing, ignore */ }
  }
}

function wireEvents(logger = console) {
  const u = autoUpdater;
  if (!u) return;
  u.logger = {
    info:  (m) => logger.log('[updater]', m),
    warn:  (m) => logger.warn('[updater]', m),
    error: (m) => logger.error('[updater]', m),
    debug: () => {}
  };
  u.on('checking-for-update',   ()    => setState('checking'));
  u.on('update-available',      (info) => {
    // A real response from GitHub proves we're online again; clear the
    // offline flag so the next schedule hop goes back to daily cadence.
    lastCheckFailedNetwork = false;
    setState('downloading', info);
  });
  u.on('update-not-available',  (info) => {
    lastCheckFailedNetwork = false;
    setState('idle', info);
    // Successful check on the daily cadence (or first success after an
    // offline stretch) — line up the next one for the upcoming 00:00.
    scheduleNextDailyCheck(logger);
  });
  u.on('download-progress',     (p)   => setState('downloading', { percent: p.percent, transferred: p.transferred, total: p.total }));
  u.on('update-downloaded',     (info) => {
    lastCheckFailedNetwork = false;
    setState('ready', info);
    promptRestart(info, logger).catch(err => logger.error('[updater] prompt failed:', err));
  });
  u.on('error', (err) => {
    const msg = err && err.message ? String(err.message) : '';
    logger.error('[updater] error:', msg || err);
    setState('error', { message: msg });
    // Network errors → fast retry so we catch the moment Wi-Fi
    // comes back. Other errors (parse, signature, etc.) → treat as
    // transient and resume the normal daily schedule so we don't
    // hammer GitHub with retries for a software bug.
    const looksNetwork = NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p));
    lastCheckFailedNetwork = looksNetwork;
    if (looksNetwork) scheduleOfflineRetry(logger);
    else              scheduleNextDailyCheck(logger);
  });
}

// Milliseconds from `now` until the next local 00:00 (midnight). Never
// returns 0 — at exactly midnight we schedule for tomorrow's midnight,
// otherwise a just-fired timer could immediately re-fire.
function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // rolls over to tomorrow 00:00:00.000 local
  return Math.max(60_000, next.getTime() - now.getTime());
}

function clearScheduled() {
  if (scheduledTimer) { clearTimeout(scheduledTimer); scheduledTimer = null; }
}

function scheduleNextDailyCheck(logger) {
  clearScheduled();
  const delay = msUntilNextMidnight();
  const when = new Date(Date.now() + delay);
  logger.log(`[updater] next check scheduled for ${when.toISOString()} (local midnight, in ${Math.round(delay / 60_000)} min)`);
  scheduledTimer = setTimeout(() => runCheck(logger), delay);
}

function scheduleOfflineRetry(logger) {
  clearScheduled();
  logger.log(`[updater] offline — retrying in ${OFFLINE_RETRY_MS / 1000}s`);
  scheduledTimer = setTimeout(() => runCheck(logger), OFFLINE_RETRY_MS);
}

function runCheck(logger) {
  const u = autoUpdater;
  if (!u) return;
  u.checkForUpdates().catch((err) => {
    logger.error('[updater] scheduled check failed:', err && err.message ? err.message : err);
    // The 'error' event will have already fired and picked the right
    // reschedule branch — no need to double-schedule here.
  });
}

async function promptRestart(info, logger) {
  if (hasShownRestartPrompt) return;
  hasShownRestartPrompt = true;
  const win = getMainWindow && getMainWindow();
  const version = info && info.version ? info.version : '';
  const result = await dialog.showMessageBox(win || null, {
    type: 'info',
    title: 'تحديث جاهز / Update ready',
    message: `تحديث جديد للبرنامج جاهز للتثبيت (${version}).`,
    detail:
      '✓ بياناتك كلّها محفوظة (الموقع، الأئمة، الأدعية المضافة، الإعدادات، PIN). التثبيت يستبدل البرنامج فقط ولا يمسّ إعداداتك.\n\n' +
      '• "إعادة التشغيل الآن" — يُثبِّت التحديث الآن (حوالي دقيقة واحدة).\n' +
      '• "لاحقاً" — يُثبَّت تلقائياً في المرّة القادمة التي تُغلق فيها التطبيق.\n\n' +
      `A new version (${version}) is ready. Your settings, imam list, custom duas, location, and PIN are all preserved — the installer only replaces the program itself. "Restart now" installs immediately (~1 minute). "Later" installs automatically when you next close the app.`,
    buttons: ['إعادة التشغيل الآن / Restart now', 'لاحقاً / Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (result.response === 0) {
    logger.log('[updater] user chose restart — quitAndInstall');
    autoUpdater.quitAndInstall(false, true);
  } else {
    logger.log('[updater] user deferred — will install on app quit');
  }
}

// Recognizes a never-configured publish block so we can fail loudly
// instead of silently 404'ing against a placeholder GitHub URL.
const PLACEHOLDER_OWNERS = new Set([
  'REPLACE_ME_BEFORE_RELEASE',
  '<PLACEHOLDER_USERNAME>',
  'PLACEHOLDER',
  'YOUR_GITHUB_USERNAME',
  ''
]);

// Returns null when properly configured, or a diagnostic string when the
// feed is obviously unconfigured. Caller should refuse to start the
// updater in that case.
//
// Critical subtlety — electron-builder STRIPS the `build` field from
// the package.json it ships inside the packaged .exe (it bakes the
// publish config into resources/app-update.yml instead, which is
// what electron-updater actually reads at runtime). So in a packaged
// build `pkg.build` is always undefined, and this function would
// spuriously report "no build.publish block in package.json" — which
// is exactly what 0.1.3 did in the field, wedging the updater into
// an error state with a working feed. The isPackaged short-circuit
// restricts placeholder detection to development runs where the
// full package.json IS on disk.
function detectPlaceholderConfig() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) return null;
  } catch (_) { /* no electron module — proceed with dev check below */ }
  try {
    const pkg = require('../../../package.json');
    const publish = Array.isArray(pkg.build && pkg.build.publish)
      ? pkg.build.publish[0]
      : (pkg.build && pkg.build.publish) || null;
    if (!publish) return 'no build.publish block in package.json';
    if (publish.provider === 'github' && PLACEHOLDER_OWNERS.has(publish.owner)) {
      return `build.publish.owner is a placeholder (${publish.owner}); set it before enabling auto-update.`;
    }
    if (publish.provider === 'generic' && /PLACEHOLDER|REPLACE_ME/.test(publish.url || '')) {
      return `build.publish.url is a placeholder; set it before enabling auto-update.`;
    }
    return null;
  } catch (_) {
    return 'failed to read package.json publish config';
  }
}

// Optional runtime feed override. Supports two forms:
//   MITHNAH_UPDATE_FEED=https://example.com/updates   (generic feed)
//   MITHNAH_UPDATE_FEED=github:owner/repo             (GitHub Releases)
function applyFeedOverride(logger) {
  const feed = process.env.MITHNAH_UPDATE_FEED;
  if (!feed) return false;
  if (feed.startsWith('github:')) {
    const [owner, repo] = feed.slice(7).split('/');
    if (owner && repo && !PLACEHOLDER_OWNERS.has(owner)) {
      autoUpdater.setFeedURL({ provider: 'github', owner, repo });
      logger.log(`[updater] feed override: github:${owner}/${repo}`);
      return true;
    }
    logger.warn(`[updater] MITHNAH_UPDATE_FEED=github:${owner}/${repo} looks like a placeholder — ignoring`);
    return false;
  }
  if (/^https?:\/\//.test(feed) && !/PLACEHOLDER|REPLACE_ME/.test(feed)) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    logger.log(`[updater] feed override: generic ${feed}`);
    return true;
  }
  logger.warn(`[updater] ignoring malformed MITHNAH_UPDATE_FEED: ${feed}`);
  return false;
}

// Called once from main/index.js. Safe to call even if electron-updater
// isn't installed — in that case it's a no-op.
function start({ getMainWindow: _getMainWindow, enabled, logger = console } = {}) {
  getMainWindow = _getMainWindow || (() => null);
  if (started) return;
  if (enabled === false) {
    logger.log('[updater] disabled by config — not starting');
    return;
  }
  const u = safeRequireUpdater();
  if (!u) return;

  u.autoDownload = true;
  u.autoInstallOnAppQuit = true;

  const feedFromEnv = applyFeedOverride(logger);
  if (!feedFromEnv) {
    // No env override — fall through to package.json build.publish. Check
    // it's actually configured before attempting any network call.
    const diag = detectPlaceholderConfig();
    if (diag) {
      logger.warn(`[updater] auto-update REFUSED: ${diag}`);
      logger.warn('[updater] to enable, either (a) edit package.json build.publish with a real GitHub owner, or (b) set MITHNAH_UPDATE_FEED=github:owner/repo or a generic HTTPS URL before launching.');
      setState('error', { message: diag, reason: 'placeholder-config' });
      return;
    }
  }

  wireEvents(logger);
  started = true;

  // First check 10 seconds after launch. The event handlers wired
  // above will take it from here — on success they queue the next
  // midnight; on network error they queue a 2-minute retry. No
  // setInterval loop needed.
  setTimeout(() => runCheck(logger), INITIAL_CHECK_DELAY_MS);

  const feedDesc = (() => {
    try { return u.getFeedURL ? u.getFeedURL() : 'configured feed'; }
    catch (_) { return 'default (package.json build.publish)'; }
  })();
  logger.log(`[updater] started — feed=${feedDesc || 'default'}, policy=daily-at-midnight + 2min-retry-while-offline`);
}

function stop() {
  clearScheduled();
  started = false;
}

function getState() { return { state, info: lastInfo }; }

// Force a check now (IPC-triggered). Returns a promise that resolves when
// the check completes. Same placeholder gate as `start()` so a "check
// now" tap doesn't phone home to a non-existent github.com/REPLACE_ME…
// repo, which would leak the install's IP fingerprint to the world.
async function checkNow(logger = console) {
  // detectPlaceholderConfig returns either null (feed looks valid)
  // or a diagnostic string. A prior revision dereferenced
  // `diag.isPlaceholder` / `diag.reason` which threw on the null
  // branch and silently no-op'd on the string branch — neither
  // did what the name promised.
  const diag = detectPlaceholderConfig();
  if (diag) {
    return { ok: false, error: `update feed not configured: ${diag}` };
  }
  const u = safeRequireUpdater();
  if (!u) throw new Error('electron-updater not available');
  try {
    const result = await u.checkForUpdates();
    // electron-updater returns `{ updateInfo, downloadPromise }`.
    // `updateInfo` is populated even when there's no update (it
    // reflects the remote latest.yml) — so we can't just check its
    // presence. The real signal is `downloadPromise`: it exists
    // only when an actual download has been kicked off (i.e. the
    // remote version beats the installed version per semver).
    return { ok: true, updateAvailable: Boolean(result && result.downloadPromise) };
  } catch (err) {
    logger.error('[updater] checkNow failed:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = { start, stop, getState, checkNow, IPC_STATE_CHANNEL };
