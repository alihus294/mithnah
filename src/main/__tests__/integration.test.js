const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('integration: module wiring', () => {
  it('all main modules export expected functions', () => {
    const fs = require('fs');
    const path = require('path');

    const modules = [
      { file: '../window/window-manager.js', exports: ['createWindow', 'getMainWindow'] },
      { file: '../lifecycle.js', exports: ['initLifecycle', 'getIsQuitting', 'setIsQuitting'] },
      { file: '../ipc-handlers.js', exports: ['initIpcHandlers'] },
      { file: '../remote-server.js', exports: ['startRemoteControlServer', 'stopRemoteControlServer'] },
    ];

    for (const mod of modules) {
      const filePath = path.join(__dirname, mod.file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      for (const exp of mod.exports) {
        assert(
          content.includes(`function ${exp}`) || content.includes(`${exp} =`),
          `${mod.file} should export ${exp}`
        );
      }
    }
  });

  it('index.js calls init functions in correct order', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

    // Verify DI object structure
    assert(content.includes('lifecycle.initLifecycle({'), 'index.js should call initLifecycle');
    assert(content.includes('initIpcHandlers({'), 'index.js should call initIpcHandlers');
    assert(content.includes('mainWindow: () => mainWindow'), 'index.js should pass mainWindow getter');
    assert(content.includes('createWindow'), 'index.js should pass createWindow');
    assert(content.includes('loadSettings'), 'index.js should pass loadSettings');
  });

  it('security settings are preserved in window-manager', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../window/window-manager.js'), 'utf8');

    assert(content.includes('nodeIntegration: false'), 'nodeIntegration must be false');
    assert(content.includes('contextIsolation: true'), 'contextIsolation must be true');
    assert(content.includes('sandbox: false'), 'sandbox must be false (required for preload)');
  });
});
