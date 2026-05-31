# Architecture

> High-level guide to how Mithnah is built, how data flows, and where to look when something breaks.

## Overview

Mithnah is an Electron desktop app with three runtime surfaces:

1. **Main process** (`src/main/`) — Node.js + Electron APIs. Owns the window, the local Express server, and all IPC channels.
2. **Renderer** (`src/renderer/`) — Vite + React 18. The wall UI the congregation sees.
3. **Phone UI** (`build-output/mobile-control.{html,js}`) — Served by the Express server. Caretaker remote control.

Everything is offline-first. No cloud dependencies. No analytics.

---

## Folder tree

```
src/
  main/               # Electron main process
    index.js          # Entry point: window, Express, IPC wiring
    ipc-handlers.js   # IPC channel definitions
    remote-server.js  # Express + socket.io (port 3100)
    network-policy.js # Blocks all external HTTPS
    app-features.js   # PIN hashing, kiosk mode, config import/export
    preload.js        # Secure bridge: exposes only allow-listed APIs
    window/           # Window manager (create, bounds, kiosk)
    prayer-times/     # Calculation, config persistence, IPC
    hijri/            # 5-variant Hijri calendar, events
    location/         # GPS handoff, reverse geocoding, region detection
    marja/            # 13 marja presets + custom profile
    slideshow/        # State machine, remote control, presenter input
    shia-content/     # Dua/ziyarat data loader
    updater/          # Pluggable auto-update (disabled by default)
    bridge/           # Dashboard API for external integrations
    __tests__/        # Node --test suites
  renderer/           # React frontend
    App.jsx           # Root component
    components/       # Dashboard, overlays, settings, slideshow
    lib/              # IPC wrapper, formatting, hooks
    main.jsx          # Vite entry
build-output/
  mobile-control.html # Phone remote UI
  mobile-control.js   # Phone remote logic
  vendor/             # Bundled fonts, icons, textures
```

---

## Runtime model

```
┌─────────────────────────────────────────┐
│  Electron Main Process (Node.js)        │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ BrowserWindow│  │ Express ( :3100 ) │  │
│  │  (wall UI)   │  │  /api/phone       │  │
│  └──────┬──────┘  │  /api/config      │  │
│         │         │  /api/pin         │  │
│    preload.js     │  socket.io        │  │
│         │         └──────────────────┘  │
│    secure IPC bridge                    │
│         │                               │
│  ┌──────┴──────┐  ┌──────────────────┐  │
│  │  Renderer   │  │  Phone (any Wi-Fi)│  │
│  │  React 18   │  │  mobile-control   │  │
│  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Main process

`src/main/index.js` bootstraps in this order:

1. **Safety nets** — `unhandledRejection` / `uncaughtException` loggers.
2. **Clock-skew check** — NTP pool.ntp.org; warns if > 5 min off.
3. **Network policy** — `session.webRequest` blocks all external HTTPS unless `MITHNAH_ALLOW_NETWORK=1`.
4. **Protocol handler** — `mithnah://` custom scheme for deep links.
5. **Window creation** — `createWindow()` from `window/window-manager.js`.
6. **Express server** — `remote-server.js` on port 3100.
7. **IPC registration** — `initIpcHandlers()` wires all channels.
8. **Updater gating** — `updater.start()` only if `MITHNAH_AUTO_UPDATE=1`.

### Key modules

| Module | Responsibility |
|--------|---------------|
| `remote-server.js` | Express routes, socket.io, CSP headers, PIN rate limiting |
| `ipc-handlers.js` | All `ipcMain.handle()` channels |
| `network-policy.js` | Offline-first enforcement, vendor URL redirects |
| `app-features.js` | PIN bcrypt-like hashing, kiosk mode, config import/export |
| `frame-guard.js` | `isFromMainWindow` — rejects IPC from non-main windows |

---

## Preload bridge

`src/main/preload.js` is the only JavaScript that runs in both processes. It exposes a minimal API surface:

```js
contextBridge.exposeInMainWorld('mithnah', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
```

The renderer calls `window.mithnah.invoke('prayer:get', ...)` — never `require('electron')` directly.

---

## Renderer

Vite builds `src/renderer/` into `dist/renderer/`. Electron loads `index.html` from that folder in production, or from the Vite dev server in development.

### Component hierarchy

```
App.jsx
├── Dashboard.jsx          # Clock, prayer list, Hijri date, event banners
│   ├── EventStrip.jsx     # Scrolling ticker for today's events
│   ├── PrayerCell.jsx     # Individual prayer row
│   └── HonorifiedTitle.jsx # Imam name with honorifics
├── SlideshowOverlay.jsx   # Full-screen dua/ziyarat presenter
├── SettingsOverlay.jsx    # PIN auth, method, location, marja, updater
├── HelpOverlay.jsx        # F1 keyboard shortcuts
├── PairingModal.jsx       # QR code for phone pairing
└── FirstRunTour.jsx       # Onboarding for new installations
```

### State management

No Redux. Local React state + IPC calls:
- Prayer times: fetched once at mount, refreshed on `prayer:updated` event.
- Config: read via `app:get-config`, written via `app:set-config`.
- Slideshow: controlled via `slideshow:*` IPC from main or phone.

---

## Phone control server

The Express server in `remote-server.js` serves the phone UI and exposes a read-only dashboard API.

### Authentication

1. Wall shows QR code → `GET /api/pair` returns `{pairingCode, token}`.
2. Phone scans → opens `http://<wall-ip>:3100/mobile-control.html?token=...`.
3. Phone enters PIN → `POST /api/pin` verifies against bcrypt-like hash.
4. On success: phone receives socket.io `authenticated` event.

### Rate limiting

`/api/pin` is rate-limited by IP + client cookie (`x-mithnah-client` header). Prevents IP-hopping attacks.

### GPS handoff

Phone sends GPS fix → wall validates ±50 km sanity check → updates `prayer-config.json` → recalculates prayer times → broadcasts update to all connected phones.

---

## Data flow

### Prayer-time calculation

```
location:set (IPC or phone)
    ↓
location/ipc.js — validate ±50km, reverse geocode
    ↓
prayer-times/config.js — write prayer-config.json
    ↓
prayer-times/index.js — adhan-js with Jafari (Leva) params
    ↓
main/index.js — emit "prayer:updated"
    ↓
Dashboard.jsx — re-fetch and re-render
```

### Hijri events

```
hijri/ipc.js — effectiveHijriForEvents()
    ↓
hijri/index.js — Intl.DateTimeFormat with selected variant
    ↓
hijri/events-data.js — 30+ hard-coded occasions
    ↓
Dashboard.jsx — EventStrip shows banners + ticker
```

### Slideshow

```
Phone or presenter → slideshow/ipc.js
    ↓
slideshow/index.js — state machine (idle → playing → paused)
    ↓
shia-content/index.js — load dua/ziyarat text
    ↓
SlideshowOverlay.jsx — render with CSS transitions
```

---

## Offline-first policy

Every outbound request is classified:

1. **Loopback** (`127.0.0.1`, `localhost`, socket.io) — allowed.
2. **Known vendor URL** (Google Fonts, transparenttextures.com) — redirected to `build-output/vendor/`.
3. **Everything else** — blocked with one log line.

Escape hatch: `MITHNAH_ALLOW_NETWORK=1`.

---

## Persistence

| Data | Location | Format |
|------|----------|--------|
| Prayer config | `%APPDATA%\Mithnah\prayer-config.json` | JSON |
| Slideshow state | `%APPDATA%\Mithnah\slideshow-state.json` | JSON |
| App settings | `%APPDATA%\Mithnah\settings.json` | JSON |
| PIN hash | `%APPDATA%\Mithnah\pin-hash.json` | bcrypt-like |
| Logs | `%APPDATA%\Mithnah\logs\` | text files |

All writes go through `app-features.js` atomic-rename pattern (write to `.tmp`, then `fs.rename`).

---

## Testing

```bash
npm test          # node --test tests/*.test.js
```

126 tests covering:
- Prayer-time calculation (all 13 methods)
- Hijri conversion (5 variants)
- Config persistence (read/write/merge)
- Location reverse-geocoding
- Marja preset loading
- Slideshow state machine
- Remote server API (PIN, pairing, config)

---

## Build pipeline

```
npm run dev       # Vite dev server + Electron main
npm run build     # Vite production build
npm run dist:win  # electron-builder --win --x64
```

CI (`.github/workflows/build.yml`) runs on every push.
Release (`.github/workflows/release.yml`) triggers on `v*.*.*` tags.

---

## Key files for debugging

| Symptom | File to check |
|---------|--------------|
| Prayer times wrong | `src/main/prayer-times/index.js`, `prayer-config.json` |
| Phone can't pair | `src/main/remote-server.js`, firewall rules |
| PIN not working | `src/main/app-features.js`, `pin-hash.json` |
| Slideshow stuck | `src/main/slideshow/index.js`, `slideshow-state.json` |
| External images blocked | `src/main/network-policy.js` |
| Clock wrong | `src/main/index.js` (NTP check), system time |
| Update not found | `src/main/updater/index.js`, `latest.yml` |

---

## Design rules

1. **Never trust the renderer.** All validation happens in main.
2. **Never block the main thread.** Heavy work (prayer calc, geocoding) is synchronous but bounded; async for I/O only.
3. **Always fail closed.** Network blocked by default. Updater disabled by default. Kiosk mode requires PIN.
4. **Keep it local.** No cloud APIs, no telemetry, no external fonts at runtime.
