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

const INITIAL_CHECK_DELAY_MS    = 10 * 1000;
const RECURRING_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const IPC_STATE_CHANNEL = 'updater:state';

let autoUpdater = null;
let recurringTimer = null;
let hasShownRestartPrompt = false;
let started = false;
let state = 'idle';
let lastInfo = null;
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
  u.on('update-available',      (info) => setState('downloading', info));
  u.on('update-not-available',  (info) => setState('idle', info));
  u.on('download-progress',     (p)   => setState('downloading', { percent: p.percent, transferred: p.transferred, total: p.total }));
  u.on('update-downloaded',     (info) => {
    setState('ready', info);
    promptRestart(info, logger).catch(err => logger.error('[updater] prompt failed:', err));
  });
  u.on('error', (err) => {
    logger.error('[updater] error:', err && err.message ? err.message : err);
    setState('error', { message: err && err.message });
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
      'اضغط "إعادة التشغيل الآن" لتثبيت التحديث، أو "لاحقاً" وسيتم التثبيت تلقائياً عند إغلاق البرنامج.\n\n' +
      `A new version (${version}) is ready. Click "Restart now" to install immediately, or "Later" to install on next app close.`,
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
function detectPlaceholderConfig() {
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

  setTimeout(() => {
    u.checkForUpdates().catch(err => {
      logger.error('[updater] initial check failed:', err && err.message ? err.message : err);
    });
  }, INITIAL_CHECK_DELAY_MS);

  recurringTimer = setInterval(() => {
    u.checkForUpdates().catch(err => {
      logger.error('[updater] recurring check failed:', err && err.message ? err.message : err);
    });
  }, RECURRING_CHECK_INTERVAL_MS);

  const feedDesc = (() => {
    try { return u.getFeedURL ? u.getFeedURL() : 'configured feed'; }
    catch (_) { return 'default (package.json build.publish)'; }
  })();
  logger.log(`[updater] started — feed=${feedDesc || 'default'}, interval=${RECURRING_CHECK_INTERVAL_MS / 3600000}h`);
}

function stop() {
  if (recurringTimer) { clearInterval(recurringTimer); recurringTimer = null; }
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
    return { ok: true, updateAvailable: Boolean(result && result.updateInfo && result.updateInfo.version) };
  } catch (err) {
    logger.error('[updater] checkNow failed:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = { start, stop, getState, checkNow, IPC_STATE_CHANNEL };
