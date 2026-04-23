// Offline-first network policy. Every outbound request from the renderer
// is either:
//   1. Loopback / file:// / data: / blob: / devtools: — allowed freely.
//   2. Known vendor URL (Google Fonts / transparenttextures.com) —
//      silently redirected to the matching bundled file under
//      build-output/vendor/.
//   3. Any other host — blocked (with a one-line log per denied host).
//
// Escape hatch: `MITHNAH_ALLOW_NETWORK=1` passes unknown hosts through.
// Redirects still apply so offline parity is preserved even when the
// gate is open.
//
// This module also installs the geolocation permission handler —
// related, because geolocation is the only non-loopback capability the
// renderer is allowed to use on this app.

const path = require('path');
const url = require('url');
const { session } = require('electron');

const NETWORK_ALLOWED = process.env.MITHNAH_ALLOW_NETWORK === '1';
const deniedHostsLogged = new Set();

function fileUrl(p) {
  return url.format({ pathname: p, protocol: 'file:', slashes: true });
}

function buildRedirects(vendorRoot) {
  return [
    {
      pattern: /^https:\/\/www\.transparenttextures\.com\/patterns\/arabesque\.png/i,
      target: fileUrl(path.join(vendorRoot, 'textures', 'arabesque.png'))
    },
    {
      pattern: /^https:\/\/www\.transparenttextures\.com\/patterns\/islamic-art\.png/i,
      target: fileUrl(path.join(vendorRoot, 'textures', 'islamic-art.png'))
    },
    {
      pattern: /^https:\/\/www\.transparenttextures\.com\/patterns\/stardust\.png/i,
      target: fileUrl(path.join(vendorRoot, 'textures', 'stardust.png'))
    },
    // Google Fonts CSS catch-all — falls through to the bundled combined CSS.
    {
      pattern: /^https:\/\/fonts\.googleapis\.com\/css2\?/i,
      target: fileUrl(path.join(vendorRoot, 'google-renderer-bundle.css'))
    },
    // gstatic.com serves .woff2 files; if we don't cache a family, block
    // silently so the browser falls back to the next @font-face src.
    {
      pattern: /^https:\/\/fonts\.gstatic\.com\//i,
      target: null // null → cancel
    }
  ];
}

function isLocalUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'blob:' ||
        u.protocol === 'chrome-extension:' || u.protocol === 'devtools:' || u.protocol === 'chrome:') {
      return true;
    }
    const host = u.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch (_) {
    return false;
  }
}

function findRedirectOrCancel(rawUrl, redirects) {
  for (const r of redirects) {
    if (r.pattern.test(rawUrl)) {
      if (r.target === null) return { cancel: true };
      return { redirectURL: r.target };
    }
  }
  return null;
}

function logDeniedHost(rawUrl) {
  try {
    const host = new URL(rawUrl).host || rawUrl;
    if (!deniedHostsLogged.has(host)) {
      if (deniedHostsLogged.size >= 128) deniedHostsLogged.clear();
      deniedHostsLogged.add(host);
      console.log(`[Mithnah] network: blocked ${host} (set MITHNAH_ALLOW_NETWORK=1 to allow)`);
    }
  } catch (_) { /* best-effort log */ }
}

function installGeolocationPermission() {
  const allowed = new Set(['geolocation']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (!allowed.has(permission)) {
      callback(false);
      return;
    }
    try {
      const origin = details && details.requestingUrl ? new URL(details.requestingUrl) : null;
      const isLocalOrigin = !origin || origin.protocol === 'file:' ||
        origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '::1';
      callback(Boolean(isLocalOrigin));
    } catch (_) {
      callback(false);
    }
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowed.has(permission);
  });
  console.log('[Mithnah] geolocation permission: enabled for local origins');
}

function installOfflineNetworkPolicy(vendorRoot) {
  const redirects = buildRedirects(vendorRoot);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isLocalUrl(details.url)) {
      callback({ cancel: false });
      return;
    }
    const decision = findRedirectOrCancel(details.url, redirects);
    if (decision) {
      callback(decision);
      return;
    }
    if (NETWORK_ALLOWED) {
      callback({ cancel: false });
      return;
    }
    logDeniedHost(details.url);
    callback({ cancel: true });
  });
  console.log(
    NETWORK_ALLOWED
      ? '[Mithnah] network policy: ALLOW (MITHNAH_ALLOW_NETWORK=1) — known URLs still redirected locally'
      : '[Mithnah] network policy: OFFLINE (external hosts redirected to local vendor/ or blocked)'
  );
}

// Install Content-Security-Policy headers on every renderer response.
// `webSecurity: true` on the BrowserWindow already enforces same-origin,
// but a CSP layered on top blocks inline-script execution from any
// future XSS, restricts where styles/fonts can come from, and prevents
// connect-src exfiltration to anything but loopback.
//
// `'unsafe-inline'` for style-src is unavoidable: bundled vendor CSS
// (Google Fonts) uses inline @font-face style attributes. We DO NOT
// allow `'unsafe-inline'` for script-src — bundled JS goes through
// Vite which never emits inline scripts.
function installContentSecurityPolicy(isDev) {
  const evalClause = isDev ? "'unsafe-eval' " : '';
  const csp = [
    "default-src 'self' file: blob: data:",
    `script-src 'self' file: blob: ${evalClause}`,
    "style-src 'self' file: blob: data: 'unsafe-inline'",
    "font-src 'self' file: blob: data:",
    "img-src 'self' file: blob: data:",
    // connect-src: loopback only. SocketIO traffic is server-side.
    "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY']
      }
    });
  });
  console.log('[Mithnah] CSP installed for renderer session (dev=' + isDev + ')');
}

module.exports = {
  installGeolocationPermission,
  installOfflineNetworkPolicy,
  installContentSecurityPolicy,
  NETWORK_ALLOWED
};
