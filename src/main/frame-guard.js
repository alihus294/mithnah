// Frame guard — every privileged IPC handler should reject calls
// coming from a frame other than the trusted main-window renderer. We
// don't use webview/iframe today, but webSecurity is on, the renderer
// is sandboxed, and CSP `frame-ancestors 'none'` blocks embedding —
// this guard is the last layer of defense if any of those weaken in
// a future version.
//
// Usage:
//   const { register: registerGuard, requireMainWindow } = require('../frame-guard');
//   registerGuard(() => mainWindow);   // once, in main/index.js
//   ipcMain.handle('something:write', requireMainWindow((event, payload) => { ... }));

let _getMainWindow = () => null;

function register(getMainWindowFn) {
  if (typeof getMainWindowFn !== 'function') {
    throw new Error('frame-guard.register expects a function returning the main BrowserWindow');
  }
  _getMainWindow = getMainWindowFn;
}

function isFromMainWindow(event) {
  const win = _getMainWindow();
  return !!win && !win.isDestroyed() && event && event.sender && event.sender.id === win.webContents.id;
}

// Wrap an IPC handler so it returns `{ok: false, error: 'forbidden'}`
// when the caller isn't the trusted main window. Read-only handlers
// (list duas, get config, etc.) generally do NOT need to be wrapped;
// guard the writes.
function requireMainWindow(handler) {
  return async (event, ...args) => {
    if (!isFromMainWindow(event)) {
      return { ok: false, error: 'forbidden' };
    }
    return handler(event, ...args);
  };
}

module.exports = { register, isFromMainWindow, requireMainWindow };
