const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('ipc-handlers', () => {
  it('registers zoom handlers', () => {
    const registered = [];
    const ipcMock = {
      handle: (name) => registered.push(name),
      on: (name) => registered.push(name)
    };

    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') {
        return {
          ipcMain: ipcMock,
          dialog: {},
          app: { getVersion: () => '1.0.0', setLoginItemSettings: () => {}, getLoginItemSettings: () => ({}) }
        };
      }
      return originalLoad(request, parent, isMain);
    };

    // Clear require cache to force re-evaluation with new mock
    delete require.cache[require.resolve('../ipc-handlers')];
    const { initIpcHandlers } = require('../ipc-handlers');

    const deps = {
      mainWindow: () => null,
      isFromMainWindow: () => true,
      zoomState: { factor: 1.0, auto: true },
      setGlobalZoom: () => {},
      getSmartZoomFactor: () => 1.0,
      getRemoteControlStatusPayload: () => ({}),
      remoteSocketServer: () => null,
      setRemoteRendererState: () => {},
      networkCapabilities: {},
      prayerTimes: { getConfig: () => ({}), setConfig: () => Promise.resolve() },
      appFeatures: {
        makePinHash: (p) => `hash:${p}`,
        verifyPinAgainstHash: () => false,
        resetPinRateLimit: () => {},
        exportConfigTo: () => Promise.resolve(),
        importConfigFrom: () => Promise.resolve(),
        computeQibla: () => ({ angle: 45 })
      },
      configPathOf: () => '/tmp/config.json',
      USER_DATA_PATH: '/tmp/mithnah-test',
      updater: {}
    };

    initIpcHandlers(deps);

    Module._load = originalLoad;

    assert(registered.includes('zoom:get'), 'zoom:get should be registered');
    assert(registered.includes('zoom:set'), 'zoom:set should be registered');
    assert(registered.includes('app:kiosk-quit'), 'app:kiosk-quit should be registered');
  });
});
