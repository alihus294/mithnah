const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('lifecycle', () => {
  it('registers app event handlers', () => {
    const events = [];
    const appMock = {
      requestSingleInstanceLock: () => true,
      quit: () => {},
      exit: () => {},
      whenReady: () => Promise.resolve(),
      on: (name) => events.push(name),
      commandLine: { appendSwitch: () => {} }
    };

    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') return { app: appMock };
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../lifecycle')];
    const { initLifecycle } = require('../lifecycle');

    const deps = {
      getMainWindow: () => null,
      createWindow: () => Promise.resolve({}),
      loadSettings: () => Promise.resolve(),
      remoteServer: { startRemoteControlServer: () => Promise.resolve() },
      updater: { start: () => {} },
      autoContent: { start: () => {}, stop: () => {} },
      emitRemoteControlStatus: () => {},
      getLanIPv4Addresses: () => ['192.168.1.10'],
      getPreferredLanIPv4Address: () => '192.168.1.10',
      remoteControlState: { ipAddress: '127.0.0.1', url: '', qrCodeDataUrl: null },
      setIpRefreshTimer: () => {},
      setRemoteSessionCleanupTimer: () => {},
      setPinFailuresSweeper: () => {},
      ipRefreshTimer: () => null,
      remoteSessionCleanupTimer: () => null,
      pinFailuresSweeper: () => null,
      MOBILE_CONTROL_PORT: 3100,
      QRCode: { toDataURL: () => Promise.resolve('data:image/png;base64,test') }
    };

    initLifecycle(deps);

    Module._load = originalLoad;

    assert(events.includes('second-instance'), 'second-instance should be registered');
    assert(events.includes('window-all-closed'), 'window-all-closed should be registered');
    assert(events.includes('before-quit'), 'before-quit should be registered');
    assert(events.includes('activate'), 'activate should be registered');
  });

  it('getIsQuitting defaults to false', () => {
    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') return { app: { whenReady: () => Promise.resolve(), on: () => {}, commandLine: { appendSwitch: () => {} }, requestSingleInstanceLock: () => true, quit: () => {}, exit: () => {} } };
      return originalLoad(request, parent, isMain);
    };
    delete require.cache[require.resolve('../lifecycle')];
    const { getIsQuitting } = require('../lifecycle');
    Module._load = originalLoad;
    assert.strictEqual(getIsQuitting(), false);
  });

  it('setIsQuitting updates value', () => {
    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') return { app: { whenReady: () => Promise.resolve(), on: () => {}, commandLine: { appendSwitch: () => {} }, requestSingleInstanceLock: () => true, quit: () => {}, exit: () => {} } };
      return originalLoad(request, parent, isMain);
    };
    delete require.cache[require.resolve('../lifecycle')];
    const { getIsQuitting, setIsQuitting } = require('../lifecycle');
    Module._load = originalLoad;
    setIsQuitting(true);
    assert.strictEqual(getIsQuitting(), true);
    setIsQuitting(false);
    assert.strictEqual(getIsQuitting(), false);
  });
});
