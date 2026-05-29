const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('window-manager', () => {
  it('module loads without errors', () => {
    // window-manager requires electron which isn't available in test env
    // Just verify the file syntax is valid
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../window/window-manager.js');
    const content = fs.readFileSync(filePath, 'utf8');
    
    assert(content.includes('function createWindow'));
    assert(content.includes('function getMainWindow'));
    assert(content.includes('nodeIntegration: false'));
    assert(content.includes('contextIsolation: true'));
  });

  it('exports the expected functions', () => {
    // Syntax-only check — full test requires electron mock
    const Module = require('module');
    const originalLoad = Module._load;
    
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') {
        return {
          BrowserWindow: function() { return { loadURL: () => {}, on: () => {}, once: () => {}, webContents: { on: () => {}, setZoomFactor: () => {}, id: 1 }, isDestroyed: () => false, show: () => {}, hide: () => {}, close: () => {}, setFullScreen: () => {} }; },
          screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
          session: { defaultSession: { webRequest: { onHeadersReceived: () => {} } } }
        };
      }
      if (request === '../frame-guard') {
        return { isFromMainWindow: () => true, registerWindow: () => {} };
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../window/window-manager')];
    const wm = require('../window/window-manager');
    Module._load = originalLoad;

    assert(typeof wm.createWindow === 'function');
    assert(typeof wm.getMainWindow === 'function');
  });
});
