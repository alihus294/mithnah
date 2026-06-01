const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// ---------------------------------------------------------------------------
// Isolated harness with global/module monkeypatch cleanup
// ---------------------------------------------------------------------------

const activeHarnesses = new Set();

afterEach(() => {
  for (const harness of activeHarnesses) {
    harness.restore();
  }
  activeHarnesses.clear();
});

function createRemoteServerHarness(options = {}) {
  const originalLoad = Module._load;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  const timers = [];
  const clearedTimers = [];
  let nextTimerId = 1;
  let restored = false;
  let remote = null;

  global.setInterval = (fn, ms) => {
    const timer = {
      id: nextTimerId++,
      fn,
      ms,
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
      }
    };
    timers.push(timer);
    return timer;
  };

  global.clearInterval = (timer) => {
    clearedTimers.push(timer);
  };

  // -- Mocks --
  const listenCalls = [];
  const servers = [];
  const socketServers = [];
  const createdApps = [];
  const qrcodeCalls = [];
  const emittedCommands = [];
  const emittedStatuses = [];

  class MockHttpServer {
    constructor(app) {
      this.app = app;
      this.handlers = new Map();
      this.closed = false;
    }
    once(event, handler) {
      this.handlers.set(event, handler);
      return this;
    }
    off(event, handler) {
      if (this.handlers.get(event) === handler) {
        this.handlers.delete(event);
      }
      return this;
    }
    listen(port, host) {
      listenCalls.push({ port, host });
      const behavior = options.listenBehaviors?.[listenCalls.length - 1] || { type: 'success' };
      if (behavior.type === 'error') {
        const handler = this.handlers.get('error');
        assert(handler, 'server should register error handler before listen');
        handler(behavior.error);
        return this;
      }
      const handler = this.handlers.get('listening');
      assert(handler, 'server should register listening handler before listen');
      handler();
      return this;
    }
    close(cb) {
      this.closed = true;
      if (cb) cb();
    }
  }

  const httpMock = {
    createServer(app) {
      const server = new MockHttpServer(app);
      servers.push(server);
      return server;
    }
  };

  function createMockExpressApp() {
    const app = {
      disabled: [],
      uses: [],
      gets: [],
      posts: [],
      disable(name) { this.disabled.push(name); },
      use(pathOrHandler, maybeHandler) {
        if (typeof pathOrHandler === 'string') {
          this.uses.push({ path: pathOrHandler, handler: maybeHandler });
        } else {
          this.uses.push({ path: null, handler: pathOrHandler });
        }
      },
      get(path, handler) { this.gets.push({ path, handler }); },
      post(path, handler) { this.posts.push({ path, handler }); }
    };
    createdApps.push(app);
    return app;
  }

  function expressMock() {
    return createMockExpressApp();
  }
  expressMock.json = (opts) => {
    const middleware = (_req, _res, next) => next();
    middleware.opts = opts;
    return middleware;
  };
  expressMock.static = (root) => {
    const middleware = (_req, _res, next) => next();
    middleware.root = root;
    return middleware;
  };

  class MockSocketIOServer {
    constructor(server, opts) {
      this.server = server;
      this.opts = opts;
      this.handlers = new Map();
      this.engine = { clientsCount: 0 };
      this.closed = false;
    }
    on(event, handler) { this.handlers.set(event, handler); }
    close(cb) { this.closed = true; if (cb) cb(); }
  }

  const socketIoMock = {
    Server: class extends MockSocketIOServer {
      constructor(server, opts) {
        super(server, opts);
        socketServers.push(this);
      }
    }
  };

  const qrcodeMock = {
    async toDataURL(url, opts) {
      qrcodeCalls.push({ url, opts });
      return `data:image/png;base64,${Buffer.from(url).toString('base64')}`;
    }
  };

  const fsMock = {
    existsSync() {
      return options.staticExists ?? false;
    }
  };

  Module._load = function(request, parent, isMain) {
    if (request === 'http') return httpMock;
    if (request === 'express') return expressMock;
    if (request === 'socket.io') return socketIoMock;
    if (request === 'qrcode') return qrcodeMock;
    if (request === 'fs') return fsMock;
    return originalLoad(request, parent, isMain);
  };

  const modulePath = require.resolve('../src/main/remote-server');
  delete require.cache[modulePath];
  remote = require('../src/main/remote-server');

  const deps = makeDeps(options, emittedCommands, emittedStatuses);
  remote.initRemoteServer(deps);

  function restore() {
    if (restored) return;
    restored = true;
    try {
      if (remote && typeof remote.clearAllTimers === 'function') {
        remote.clearAllTimers();
      }
    } finally {
      Module._load = originalLoad;
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      delete require.cache[modulePath];
    }
  }

  const harness = {
    remote, deps, timers, clearedTimers,
    listenCalls, servers, socketServers, createdApps,
    emittedCommands, emittedStatuses, qrcodeCalls,
    restore
  };
  activeHarnesses.add(harness);
  return harness;
}

function makeDeps(options, emittedCommands, emittedStatuses) {
  return {
    mainWindow: options.mainWindow || {},
    slideshow: options.slideshow || {
      getState: () => ({ current: 0 }),
      dispatch: () => {}
    },
    prayerTimes: options.prayerTimes || {},
    remoteRendererState: options.remoteRendererState || {},
    kioskQuitRequested: false,
    MOBILE_CONTROL_PORT: options.port || 3456,
    MOBILE_CONTROL_PIN: options.pin || '1234',
    PROJECT_ROOT: options.projectRoot || '/tmp/mithnah-test',
    IS_DEV: options.isDev ?? true,
    RENDERER_DEV_URL: options.rendererDevUrl || '',
    getLanIPv4Addresses: options.getLanIPv4Addresses || (() => ['192.168.1.10']),
    getPreferredLanIPv4Address: options.getPreferredLanIPv4Address || (() => '192.168.1.10'),
    getRemoteControlStaticRoot: options.getRemoteControlStaticRoot || (() => '/tmp/mithnah-mobile'),
    emitRemoteControlStatus: options.emitRemoteControlStatus || (() => emittedStatuses.push('status')),
    emitRemoteControlCommand: options.emitRemoteControlCommand || ((payload) => emittedCommands.push(payload)),
    getRemoteRendererStatePayload: options.getRemoteRendererStatePayload || (() => ({ mode: 'test' })),
    normalizeRemoteCommandPayload: options.normalizeRemoteCommandPayload || ((payload) => {
      if (!payload || typeof payload.command !== 'string') return null;
      return { command: payload.command };
    }),
    pruneExpiredRemoteSessions: options.pruneExpiredRemoteSessions || (() => {}),
    adjustZoomStep: () => {},
    getSmartZoomFactor: () => 1.0,
    setGlobalZoom: () => {},
    applyZoom: () => {}
  };
}

// -- Route invocation helpers --

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; }
  };
}

function runMiddlewares(app, req, res) {
  let index = 0;
  function next() {
    const layer = app.uses[index++];
    if (!layer) return;
    if (layer.path) return next();
    layer.handler(req, res, next);
  }
  next();
}

function invokePost(app, path, overrides = {}) {
  const res = makeRes();
  const defaultHeaders = {
    host: '192.168.1.10:3456',
    origin: 'http://192.168.1.10:3456'
  };
  const headers = overrides.headers === undefined
    ? defaultHeaders
    : overrides.headers;
  const req = {
    method: 'POST',
    headers,
    body: overrides.body || {},
    params: overrides.params || {},
    ip: overrides.ip || '192.168.1.55',
    connection: { remoteAddress: overrides.remoteAddress || '192.168.1.55' }
  };
  runMiddlewares(app, req, res);
  if (res.statusCode >= 400 && res.body) return res;
  const route = app.posts.find((c) => c.path === path);
  assert(route, `expected POST route ${path} to be registered`);
  route.handler(req, res);
  return res;
}

function invokeGet(app, path, overrides = {}) {
  const res = makeRes();
  const req = {
    method: 'GET',
    headers: {
      host: '192.168.1.10:3456',
      ...(overrides.headers || {})
    },
    body: overrides.body || {},
    params: overrides.params || {},
    ip: overrides.ip || '192.168.1.55',
    connection: { remoteAddress: overrides.remoteAddress || '192.168.1.55' }
  };
  runMiddlewares(app, req, res);
  const route = app.gets.find((c) => c.path === path);
  assert(route, `expected GET route ${path} to be registered`);
  route.handler(req, res);
  return res;
}

function makeSocket(id = 'socket-1') {
  const handlers = new Map();
  const emitted = [];
  return {
    id,
    handlers,
    emitted,
    on(event, handler) { handlers.set(event, handler); },
    emit(event, payload) { emitted.push({ event, payload }); }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('remote-server', () => {
  it('startRemoteControlServer binds to 0.0.0.0 for LAN access and publishes preferred LAN URL', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();

      assert.strictEqual(h.listenCalls.length, 1);
      assert.deepStrictEqual(h.listenCalls[0], { port: 3456, host: '0.0.0.0' });
      assert.ok(h.remote.getServer());
      assert.ok(h.remote.getSocketServer());

      const state = h.remote.getState();
      assert.strictEqual(state.running, true);
      assert.strictEqual(state.ipAddress, '192.168.1.10');
      assert.strictEqual(state.port, 3456);
      assert.strictEqual(state.url, 'http://192.168.1.10:3456');
      assert.strictEqual(state.pin, '1234');
      assert.ok(state.qrCodeDataUrl.startsWith('data:image/png;base64,'));

      assert.strictEqual(h.qrcodeCalls.length, 1);
      assert.strictEqual(h.qrcodeCalls[0].url, 'http://192.168.1.10:3456');

      assert.strictEqual(h.timers.length, 2);
      assert.strictEqual(h.timers[0].ms, 60 * 1000);
      assert.strictEqual(h.timers[0].unrefCalled, true);
      assert.strictEqual(h.timers[1].ms, 8 * 1000);
      assert.strictEqual(h.timers[1].unrefCalled, true);

      assert.ok(h.emittedStatuses.length >= 1);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('startRemoteControlServer retries EADDRINUSE ports and binds the next available port on 0.0.0.0', async () => {
    const h = createRemoteServerHarness({
      listenBehaviors: [
        { type: 'error', error: Object.assign(new Error('in use'), { code: 'EADDRINUSE' }) },
        { type: 'success' }
      ]
    });
    try {
      await h.remote.startRemoteControlServer();

      assert.strictEqual(h.listenCalls.length, 2);
      assert.deepStrictEqual(h.listenCalls[0], { port: 3456, host: '0.0.0.0' });
      assert.deepStrictEqual(h.listenCalls[1], { port: 3457, host: '0.0.0.0' });

      const state = h.remote.getState();
      assert.strictEqual(state.running, true);
      assert.strictEqual(state.port, 3457);
      assert.strictEqual(state.url, 'http://192.168.1.10:3457');
      assert.ok(h.remote.getServer());
      assert.ok(h.remote.getSocketServer());
      assert.strictEqual(h.timers.length, 2);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('startRemoteControlServer leaves no server state or timers after a non-EADDRINUSE listen error', async () => {
    const h = createRemoteServerHarness({
      listenBehaviors: [
        { type: 'error', error: Object.assign(new Error('permission denied'), { code: 'EACCES' }) }
      ]
    });
    try {
      await assert.rejects(
        () => h.remote.startRemoteControlServer(),
        /permission denied/
      );

      assert.strictEqual(h.listenCalls.length, 1);
      assert.deepStrictEqual(h.listenCalls[0], { port: 3456, host: '0.0.0.0' });
      assert.strictEqual(h.remote.getServer(), null);
      assert.strictEqual(h.remote.getSocketServer(), null);
      assert.strictEqual(h.remote.getState().running, false);
      assert.strictEqual(h.remote.getState().clientCount, 0);
      assert.strictEqual(h.timers.length, 0);
      assert.strictEqual(h.clearedTimers.length, 0);
      assert.strictEqual(h.remote.getSessionTokens().size, 0);
      assert.strictEqual(h.qrcodeCalls.length, 0);
    } finally {
      h.restore();
    }
  });

  it('startRemoteControlServer leaves no server state or timers when all fallback ports are exhausted', async () => {
    const h = createRemoteServerHarness({
      listenBehaviors: Array.from({ length: 10 }, (_, i) => ({
        type: 'error',
        error: Object.assign(new Error(`port ${3456 + i} in use`), { code: 'EADDRINUSE' })
      }))
    });
    try {
      await assert.rejects(
        () => h.remote.startRemoteControlServer(),
        /in use/
      );

      assert.strictEqual(h.listenCalls.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(h.listenCalls[i].port, 3456 + i);
        assert.strictEqual(h.listenCalls[i].host, '0.0.0.0');
      }
      assert.strictEqual(h.remote.getServer(), null);
      assert.strictEqual(h.remote.getSocketServer(), null);
      assert.strictEqual(h.remote.getState().running, false);
      assert.strictEqual(h.remote.getState().clientCount, 0);
      assert.strictEqual(h.timers.length, 0);
      assert.strictEqual(h.clearedTimers.length, 0);
      assert.strictEqual(h.remote.getSessionTokens().size, 0);
      assert.strictEqual(h.qrcodeCalls.length, 0);
    } finally {
      h.restore();
    }
  });

  it('state-changing HTTP routes reject missing Origin before route handling', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const app = h.createdApps[0];
      const res = invokePost(app, '/api/command', {
        headers: { host: '192.168.1.10:3456' },
        body: { command: 'NEXT' }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.deepStrictEqual(res.body, { error: 'origin header required' });
      assert.strictEqual(h.emittedCommands.length, 0);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('state-changing HTTP routes reject cross-origin requests before authentication', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const app = h.createdApps[0];
      const res = invokePost(app, '/api/command', {
        headers: {
          host: '192.168.1.10:3456',
          origin: 'http://evil.example'
        },
        body: { command: 'NEXT' }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.deepStrictEqual(res.body, { error: 'cross-origin request rejected' });
      assert.strictEqual(h.emittedCommands.length, 0);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('HTTP command route requires a valid bearer token even with same-origin request', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const app = h.createdApps[0];
      const res = invokePost(app, '/api/command', {
        body: { command: 'NEXT' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { error: 'unauthorized' });
      assert.strictEqual(h.emittedCommands.length, 0);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('PIN route issues a session token and HTTP command route accepts that token', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const app = h.createdApps[0];

      const pinRes = invokePost(app, '/api/pin', {
        body: { pin: '1234' }
      });
      assert.strictEqual(pinRes.statusCode, 200);
      assert.strictEqual(pinRes.body.success, true);
      assert.strictEqual(typeof pinRes.body.token, 'string');
      assert.ok(h.remote.getSessionTokens().has(pinRes.body.token));

      const token = pinRes.body.token;
      const cmdRes = invokePost(app, '/api/command', {
        headers: {
          host: '192.168.1.10:3456',
          origin: 'http://192.168.1.10:3456',
          authorization: `Bearer ${token}`
        },
        body: { command: 'NEXT' }
      });
      assert.strictEqual(cmdRes.statusCode, 200);
      assert.deepStrictEqual(cmdRes.body, { success: true });
      assert.strictEqual(h.emittedCommands.length, 1);
      assert.strictEqual(h.emittedCommands[0].command, 'NEXT');
      assert.strictEqual(h.emittedCommands[0].source, 'http-api');
      assert.strictEqual(typeof h.emittedCommands[0].receivedAt, 'number');
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('stopRemoteControlServer clears timers tokens and servers but currently preserves pinFailures', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const app = h.createdApps[0];

      // Lock out an IP with 5 bad PINs — use a sticky clientToken so the
      // lockout key (ip#token) stays the same across all attempts
      const lockedClientToken = 'aaaabbbbccccddddaaaabbbbccccdddd';
      const lockedHeaders = {
        host: '192.168.1.10:3456',
        origin: 'http://192.168.1.10:3456',
        'x-mithnah-client': lockedClientToken
      };
      for (let i = 0; i < 5; i++) {
        invokePost(app, '/api/pin', {
          headers: lockedHeaders,
          body: { pin: 'wrong' },
          ip: '10.0.0.9',
          remoteAddress: '10.0.0.9'
        });
      }
      const locked = invokePost(app, '/api/pin', {
        headers: lockedHeaders,
        body: { pin: 'wrong' },
        ip: '10.0.0.9',
        remoteAddress: '10.0.0.9'
      });
      assert.strictEqual(locked.statusCode, 429);

      // Add a valid token to prove stop clears tokens
      const valid = invokePost(app, '/api/pin', {
        headers: { host: '192.168.1.10:3456', origin: 'http://192.168.1.10:3456' },
        body: { pin: '1234' },
        ip: '10.0.0.10',
        remoteAddress: '10.0.0.10'
      });
      assert.strictEqual(valid.statusCode, 200);
      assert.strictEqual(h.remote.getSessionTokens().size, 1);

      await h.remote.stopRemoteControlServer();

      assert.strictEqual(h.remote.getServer(), null);
      assert.strictEqual(h.remote.getSocketServer(), null);
      assert.strictEqual(h.remote.getState().running, false);
      assert.strictEqual(h.remote.getState().clientCount, 0);
      assert.strictEqual(h.remote.getSessionTokens().size, 0);
      assert.strictEqual(h.servers[0].closed, true);
      assert.ok(h.clearedTimers.length >= 2);

      // Restart and verify the locked IP is still rate-limited
      await h.remote.startRemoteControlServer();
      const app2 = h.createdApps[1];
      const stillLocked = invokePost(app2, '/api/pin', {
        headers: lockedHeaders,
        body: { pin: 'wrong' },
        ip: '10.0.0.9',
        remoteAddress: '10.0.0.9'
      });
      assert.strictEqual(stillLocked.statusCode, 429);
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it('clearAllTimers clears session cleanup, PIN sweeper, and IP refresh timers', () => {
    const h = createRemoteServerHarness();
    try {
      const sessionTimer = { name: 'session' };
      const pinTimer = { name: 'pin' };
      const ipTimer = { name: 'ip' };

      h.remote.setRemoteSessionCleanupTimer(sessionTimer);
      h.remote.setPinFailuresSweeper(pinTimer);
      h.remote.setIpRefreshTimer(ipTimer);

      h.remote.clearAllTimers();

      assert.ok(h.clearedTimers.includes(sessionTimer));
      assert.ok(h.clearedTimers.includes(pinTimer));
      assert.ok(h.clearedTimers.includes(ipTimer));

      h.remote.clearAllTimers();
      assert.strictEqual(h.clearedTimers.length, 3);
    } finally {
      h.restore();
    }
  });

  it('Socket.IO connection emits initial renderer and slideshow state', async () => {
    const h = createRemoteServerHarness();
    try {
      await h.remote.startRemoteControlServer();
      const io = h.remote.getSocketServer();
      const onConnection = io.handlers.get('connection');
      assert(onConnection, 'connection handler should be registered');

      const socket = makeSocket('socket-abc');
      io.engine.clientsCount = 1;
      onConnection(socket);

      assert.strictEqual(h.remote.getState().clientCount, 1);
      assert.ok(socket.handlers.has('command'));
      assert.ok(socket.handlers.has('slideshow-command'));
      assert.ok(socket.handlers.has('disconnect'));

      const stateEmit = socket.emitted.find((e) => e.event === 'state');
      assert.ok(stateEmit);
      assert.deepStrictEqual(stateEmit.payload, { mode: 'test' });

      const slideshowEmit = socket.emitted.find((e) => e.event === 'slideshow:state');
      assert.ok(slideshowEmit);
      assert.deepStrictEqual(slideshowEmit.payload, { current: 0 });
    } finally {
      await h.remote.stopRemoteControlServer().catch(() => {});
      h.restore();
    }
  });

  it.skip('TODO: Socket.IO command handler should reject unauthenticated commands', async () => {
    // TODO(security): The current Socket.IO "command" handler accepts commands
    // without proving possession of a remote session token. Do not enable this
    // assertion until remote-server.js adds Socket.IO authentication.
    //
    // Intended future assertion:
    // - connect socket without auth
    // - emit "command" with { command: "NEXT" }
    // - assert emitRemoteControlCommand is NOT called
  });
});
