# Project Brief
_Generated: 2026-05-01_

## 1. TL;DR
**Mithnah (مئذنة, "minaret")** is an Electron desktop app — a free, open-source main-hall display for Shia Ithna Ashari (Twelver) mosques. Stack: Electron 28 + React 18 + Vite 5 + Express 5 + socket.io 4 (phone-control server) + the `adhan` library for prayer-time calc; pure JavaScript, no TypeScript. Status is **active early-stage at v0.1.5** — all 25 commits in the repo landed in the last ~30 days, solo-authored by `alihus294`. The app is offline-first by design (network blocked unless `MITHNAH_ALLOW_NETWORK=1`); persistence is JSON files in `%APPDATA%\Mithnah`. Current uncommitted work is a follow-up to the recent largeText accessibility default and a `schemaVersion: 1 → 2` bump in `src/main/prayer-times/defaults.js`. The user most likely wants help finishing v0.1.6, upgrading Electron from EOL'd 28, or shipping the next ROADMAP feature.

## 2. Identity & Purpose
- **Name:** Mithnah (Arabic مئذنة, "minaret"). `README.md:1`.
- **One-line description:** "A free, open-source mosque display for Shia Ithna Ashari (Twelver) communities. Fully offline, global-ready, and free forever." (`README.md:1-4`, `package.json#description`).
- **Problem solved:** Provides a Windows desktop app for a mosque's main-hall display — clock, Hijri date, all five daily prayer times with next-prayer countdown, Islamic-occasion banners, and a presenter-style slideshow of verified duas/ziyarat. Includes a phone-pairing remote (PIN + QR) for handing off GPS and controlling the slideshow from the floor (`README.md:6-34, 95`).
- **Target users:** Shia Twelver mosque operators (bundled Sunni methods support mixed communities). The operator audience is explicitly non-technical — the Arabic guide at `docs/FOR-MOSQUE-OPERATORS.md` is the entry point (`README.md:11-14, 44-48`).
- **Status:** Active early-stage. Latest tag `v0.1.5` (commit `25a125a`, `chore(release): v0.1.5`). Six tagged releases (`v0.1.0` → `v0.1.5`) all within the last ~30 days. README self-describes as "Personal-use project. Pull requests welcome but reviewed on a best-effort basis." (`README.md:152-155`). 79 tests passing per the README (we measured 84; see §10 — the gap is `npm install` not having run).
- **CLAUDE.md:** Not found.
- **/docs contents (listed only):** `DESIGN-PROMPT.md`, `FOR-MOSQUE-OPERATORS.md`, `RELEASE.md`, `ROADMAP.md`, `SIGNPATH-APPLICATION.md`, `SUSTAINABILITY.md`. **Note:** `README.md:93` references `docs/ARCHITECTURE.md` — that file does not exist (broken link).

## 3. Tech Stack
- **Languages:** JavaScript only — no TypeScript, no `tsconfig.json`, no JSDoc `checkJs`. Main process uses CommonJS `require()`; renderer uses ES modules + JSX.
- **Runtime:** Electron desktop, Windows x64 only (NSIS one-click installer; no macOS or Linux target). `engines` field is **missing** from `package.json`. CI uses Node 22 (`.github/workflows/test.yml`).
- **Package manager:** npm (lockfile is `package-lock.json`).
- **Direct dependencies (`package.json:23-39`):**
  - `electron` 28.3.3 (devDep) — desktop runtime. **Electron 28 reached EOL ~mid-2024; current is 33+.**
  - `react` 18.3.1 + `react-dom` 18.3.1 — renderer UI
  - `vite` 5.4.21 + `@vitejs/plugin-react` 4.3.4 — renderer dev/build
  - `express` 5.2.1 — in-process HTTP server, port 3100
  - `socket.io` 4.8.3 — real-time phone↔wall control
  - `adhan` 4.4.3 — prayer-time calculation engine
  - `qrcode` 1.5.4 — pairing QR
  - `electron-updater` 6.3.9 — opt-in auto-update via GitHub Releases
  - `electron-builder` 24.13.3 — packaging
  - `concurrently` 8.2.2, `cross-env` 7.0.3 — dev orchestration
- **Tests:** Node.js built-in test runner (`node --test`), assertions via `node:assert/strict`. No jest/vitest/mocha.
- **Lint/format/types:** None configured. Only `.editorconfig` (2-space, LF, UTF-8). No ESLint, Prettier, or TypeScript.
- **Databases / cache / queue:** None. Persistence is two JSON files under `app.getPath('userData')` (`%APPDATA%\Mithnah` on Windows): `prayer-config.json` (primary store) and `window-settings.json` (zoom + migrations).
- **External services (all opt-in or off by default):** Nominatim (reverse geocode + search), Overpass API (nearby places), GitHub Releases (electron-updater). Network is blocked at the Electron `session.webRequest` layer unless `MITHNAH_ALLOW_NETWORK=1`. Google Fonts and transparenttextures.com are silently redirected to vendored copies in `build-output/vendor/`.

## 4. Architecture

### Folder tree
```
.
├── docs/
├── scripts/
│   ├── copy-vendor-to-dist.js
│   └── generate-icon.js
├── src/
│   ├── main/
│   │   ├── hijri/
│   │   ├── location/
│   │   ├── marja/
│   │   ├── prayer-times/
│   │   ├── shia-content/
│   │   │   └── data/
│   │   ├── slideshow/
│   │   └── updater/
│   ├── public/
│   └── renderer/
│       ├── components/
│       └── lib/
└── tests/
```

### Entry points
- **Main process:** `src/main/index.js` — declared as `package.json#main`. Boots BrowserWindow, registers all IPC modules, runs the mobile-control HTTP/socket.io server on port 3100, manages single-instance lock, Chromium switches, and zoom persistence.
- **Preload bridge:** `src/main/preload.js` — `contextBridge.exposeInMainWorld('electron', {...})` exposing the `zoom`, `prayerTimes`, `hijri`, `location`, `shia`, `slideshow`, `updater`, `bridge`, `marja`, `app` namespaces.
- **Renderer HTML:** `src/renderer/index.html` (Vite root).
- **Renderer JS:** `src/renderer/main.jsx` — mounts `<App />` via React 18 `createRoot`.
- **React root:** `src/renderer/App.jsx` — composes `Dashboard` + 10 overlays, each individually wrapped in an `ErrorBoundary`.
- **Bundler config:** `vite.config.js` (renderer; root `src/renderer`, base `./`, outDir `dist/renderer`, dev port 5173); electron-builder config inline at `package.json#build` (NSIS, x64, GitHub publish, custom NSIS include at `build/installer.nsh`).
- **No CLI** (no `bin` field).

### Folder map
- `src/main/` — Electron main-process root; bootstrap, BrowserWindow, mobile-control HTTP/socket server, IPC wiring.
- `src/main/hijri/` — Hijri calendar conversion (Intl-based forward, binary-search inverse) + `hijri:*` IPC.
- `src/main/location/` — Offline-first location detection (timezone table, cities DB, geolocation override) + `location:*` IPC.
- `src/main/marja/` — Marja-taqlid registry presets (calc method + Hijri offset per marja) + `marja:*` IPC.
- `src/main/prayer-times/` — `adhan` wrapper, config persistence, cache, undo-stack + `prayer-times:*` IPC.
- `src/main/shia-content/` — Verified Shia duas/ziyarat/taqibat/tasbih/hijri-events registry + chunker + `shia:*` IPC.
- `src/main/shia-content/data/` — JSON content files for individual duas (Kumayl, Arafah, Iftitah, etc.).
- `src/main/slideshow/` — Presenter-style slideshow state machine (NEXT/PREV/FIRST/LAST/GOTO/BLANK/CLOSE/OPEN) + `slideshow:*` IPC.
- `src/main/updater/` — Pluggable electron-updater wrapper (off by default) + `updater:*` IPC.
- `src/renderer/` — React 18 SPA renderer root (entry, HTML, styles).
- `src/renderer/components/` — All React components (Dashboard, overlays, FloatingMenu, Settings, Slideshow, PrayerTracker, ornaments, ErrorBoundary).
- `src/renderer/lib/` — Renderer utilities (typed IPC wrapper, formatting, focus-trap/idle/modal hooks, error-translation helpers).
- `src/public/` — Static assets (icon.ico) bundled via `asarUnpack`.
- `scripts/` — Build helpers (`copy-vendor-to-dist.js`, `generate-icon.js`).
- `docs/` — Design, release, roadmap, sustainability, signpath docs.
- `tests/` — `node --test` suites mirroring main modules.

### Data flow
The main process is the single source of truth. At boot, `src/main/index.js` initializes the prayer-times, hijri, location, shia-content, slideshow, updater, and marja modules, then registers each module's `ipc.js` against `ipcMain`. The renderer reaches main only through `window.electron.*` exposed in `src/main/preload.js` via `contextBridge` (preload uses `ipcRenderer.invoke` for request/response and `ipcRenderer.on` for push channels). For the dashboard, `src/renderer/components/Dashboard.jsx` calls helpers in `src/renderer/lib/ipc.js` (`getTodayAndNext`, `hijriToday`, `getConfig`); under the hood, `src/main/bridge-ipc.js` composes a single `mithnah-bridge:get-snapshot` (config + today's prayer times + Hijri + maghrib-pivoted Hijri for events) so the renderer never recomputes. Mutations flow the other way: the renderer calls `prayerTimes.setConfig(...)`, main persists, and `prayer-times/index.js` notifies subscribers; the slideshow follows the same pattern (`slideshow:state` push + `slideshow:command` invoke). The mobile-control phone hits an Express + socket.io server on port 3100, whose handlers translate remote commands into the same internal IPC paths — so wall and phone always see identical state.

### Key files
- `src/main/index.js` — Main bootstrapper: single-instance lock, Chromium switches, BrowserWindow, IPC registration for all modules, mobile-control HTTP/socket.io server with PIN + QR pairing, zoom persistence with one-shot migration.
- `src/main/preload.js` — Sole renderer↔main bridge; defines the entire `window.electron.*` surface (zoom, prayerTimes, hijri, location, shia, slideshow, updater, bridge, marja, app namespaces) with subscribe/unsubscribe semantics.
- `src/main/bridge-ipc.js` — Composed read-only snapshot endpoints (`mithnah-bridge:get-snapshot`, `mithnah-bridge:today-events`); implements the **maghrib-pivot rule** that flips event lookup to "tonight = tomorrow's Hijri date" after sunset.
- `src/main/prayer-times/index.js` — Lazy-singleton config + cache + undo stack (limit 10); pub-sub `subscribe()`/`_notify()` powers config-change broadcasts to renderers.
- `src/main/prayer-times/calculator.js` — Thin wrapper around the `adhan` library; defines `PrayerCalculationError` and the canonical `PRAYER_KEYS` order.
- `src/main/slideshow/index.js` — Slideshow state machine; state lives in main and is pushed to wall + phone via IPC + socket.io.
- `src/main/app-features.js` — Privileged main-process features: scrypt-hashed PIN gate (`N=16384 r=8 p=1`) with rate limiting, auto-launch toggle, config import/export, Qibla bearing.
- `src/main/auto-content.js` — Maps significant Hijri events to recommended duas/ziyarat (Ashura → Ziyarat Ashura, Arafah → Dua Arafa, Ghadir → Kumayl, Laylat al-Qadr → Iftitah) when `features.autoContentToday` is on.
- `src/main/network-policy.js` — Offline-first request gate: loopback/file:// pass, vendor URLs silently redirected to `build-output/vendor/`, all other hosts blocked unless `MITHNAH_ALLOW_NETWORK=1`; also installs the geolocation permission handler.
- `src/renderer/App.jsx` — React root; mounts Dashboard + 10 overlays, each individually error-bounded so one crash can't take down the wall.
- `src/renderer/components/Dashboard.jsx` — Wall view: 4-zone layout (header / mihrab+clock / event strip / 6-cell prayer row); subscribes to `onConfigChanged`/`onKioskUnlockRequest` and polls clock at 1Hz.
- `src/renderer/lib/ipc.js` — Typed promise-wrapper around `window.electron.*` with a consistent `unwrap(resp, label)` error format; also fires renderer-local `mithnah:config-changed` events for same-window instant reactivity.

## 5. Commands (install / dev / test / build / deploy)
| Step | Command | Source |
|---|---|---|
| Install | `npm ci` (CI) or `npm install` (local) | `package-lock.json` |
| Dev | `npm run dev` (= `concurrently -k -n renderer,main "npm:dev:renderer" "npm:dev:main"`; renderer = `vite`, main = `cross-env NODE_ENV=development electron .`) | `package.json#scripts.dev` |
| Test | `npm test` (= `node --test --test-reporter=spec "tests/**/*.test.js"`) | `package.json#scripts.test` |
| Lint | **Not found** | — |
| Typecheck | **Not found** | — |
| Build | `npm run build` (= `npm run build:renderer && npm run build:main`; renderer = `vite build && node scripts/copy-vendor-to-dist.js`; main = no-op) | `package.json#scripts.build` |
| Package | `npm run dist` (cross-arch) or `npm run dist:win` (= `npm run build && electron-builder --win --x64`) → NSIS one-click installer in `dist/electron-builder/` | `package.json#scripts.dist`, `dist:win` |
| Deploy | Tag push (`v*.*.*`) → `.github/workflows/release.yml` runs `npx electron-builder --win --x64 --publish always` with `GH_TOKEN`; uploads `.exe`, `.exe.blockmap`, `latest.yml` to `alihus294/mithnah` GitHub Releases (consumed by `electron-updater`) | `.github/workflows/release.yml`, `package.json#build.publish` |

**CI/CD (`.github/workflows/`):**
- `test.yml` — push/PR to `main`; matrix `[ubuntu-latest, windows-latest]`, Node 22; `npm ci` → `node --check` every `src/main/*.js` → `npm test`.
- `build.yml` — `workflow_dispatch` only; Windows; `npm ci` → `npm test` → `npm run dist`; uploads installer artifact (7-day retention).
- `release.yml` — `v*.*.*` tag or `workflow_dispatch`; Windows; `npm ci` → `npm test` → `npm run build` → publishes to GitHub Releases.

**Docker:** Not found (not applicable — desktop app).

## 6. Environment Variables (names only)
No `.env.example` / `.env.sample` / `.env.template` exists. No `.env`/`secrets/`/`*.key`/`*.pem` files found. Documented or referenced env vars:
- `NODE_ENV` — set to `development` by `dev:main` script.
- `GH_TOKEN` — CI release workflow only, sourced from `secrets.GITHUB_TOKEN`.
- `MITHNAH_ALLOW_NETWORK` — set to `1` to disable the offline-first request gate (escape hatch documented in README:142-150).
- `MITHNAH_UPDATE_FEED` — overrides the default GitHub Releases auto-update feed with a custom HTTP feed URL (referenced by the updater module).

## 7. Recent Activity (git)
- **Branch:** `main` only. Local `main` is **1 commit ahead of `origin/main`** (unpushed: `a38d450 feat(a11y): default largeText ON…`).
- **Total commits in repo:** 25 (entire history). All in the last ~30 days.
- **Tags:** `v0.1.0` → `v0.1.5` (six releases, all within the last 30 days).
- **Sole contributor:** `alihus294`.
- **Uncommitted (modified, unstaged):**
  - `src/main/prayer-times/defaults.js` — bumps `schemaVersion` 1 → 2 with a "keep in lockstep with `CURRENT_SCHEMA_VERSION` in `config.js`" comment.
  - `src/renderer/components/Dashboard.jsx` — flips `featureOn('largeText', false)` fallback to `true` (completing the intent of `a38d450`).
- **Themes (last 30 days, dominant first):**
  - Slideshow overhaul (8 commits): DOM-measurement pagination, fit-scale, edge-to-frame text, React #310 fix.
  - Layout / dashboard reclamation (4): main screen + overlays + tracker + phase-4 redesigns.
  - Multi-role audit / bug-fix sweeps (4): "3-role audit", "deep audit followups", reported-bug rollups.
  - Updater hardening (3): manual check button, daily-at-midnight schedule with offline retry, packaged-build placeholder fix.
  - Features (3): imam roster + custom ziyarat/taqibat + Tasbih hadith; mosque logo upload (#9); large-text accessibility default.
  - Refactor / chore (3): drop InfalliblesRotator + FridayKhutbahTimer; Node 20 → 22 in CI; `v0.1.5` release.
- **Active focus:** Accessibility for elderly operators (recent commit + uncommitted follow-up); prayer-times schema migration v1 → v2.

## 8. Conventions
- **Code style** (`.editorconfig`): 2-space indent, LF, UTF-8, final-newline trim, trailing-whitespace trim; CRLF override for `.ps1/.psm1/.psd1`; tab override for `Makefile`. Single quotes throughout source.
- **Naming:** camelCase for functions/vars; PascalCase for React components and classes; SCREAMING_SNAKE for constants (`PRAYER_KEYS`, `CHANNELS`, `RULES`); kebab-case file names for main-process modules; PascalCase `.jsx` files for components.
- **Imports:** Main = CommonJS `require()`; renderer = ES modules with explicit `.jsx`/`.js` extensions.
- **Lint/format/types:** None configured. Only `.editorconfig`.
- **Architecture pattern:** Electron context-isolated IPC bridge with feature folders. Each main-side feature folder contains `index.js` (domain logic) + `ipc.js` (channel registration), exposed via `preload.js` → `window.electron.*`. Channel naming convention: `feature:action` (`prayer-times:get-config`, `hijri:today`). Privileged writes are gated by a frame-guard (`requireMainWindow`) — see `src/main/prayer-times/ipc.js:28-41`.
- **State management (renderer):** Local React hooks only. **No Redux / Zustand / Context / Recoil / Jotai anywhere.** Custom hooks (`useClock`, `useIsNarrow`, `usePrayerTimes`, `useHijri`) + IPC subscribe/unsubscribe in `useEffect`. Cross-component sync via main-process IPC broadcasts (`onConfigChanged`) plus a renderer-local `window.dispatchEvent('mithnah:config-changed')` fallback.
- **Testing:** `node --test` + `node:assert/strict`; tests centralized in `tests/`, **not colocated**. 11 test files covering main-process pure logic plus one renderer-utility test (`renderer.format.test.js`). **No integration / e2e / React-component tests** — no Spectron / Playwright / WebDriver / RTL.
- **Error handling (3 layers):**
  1. Main IPC: `try/catch` around every handler returning `{ ok: true, data }` / `{ ok: false, error, code }`. Custom error classes carry `code` (e.g. `PrayerCalculationError` with `'BAD_LOCATION'`, `'POLAR_LAT'`). Top-level `process.on('unhandledRejection'|'uncaughtException')` log-and-continue handlers in `src/main/index.js:39-44`.
  2. Renderer: per-overlay `ErrorBoundary` (class at `src/renderer/components/ErrorBoundary.jsx`) wrapping every top-level subtree (`App.jsx:31-41`). IPC wrapper `unwrap()` (`src/renderer/lib/ipc.js:12-18`) throws on `!ok`.
  3. User-facing: regex-based `friendlyError()` in `src/renderer/lib/errors.js` maps technical errors (ECONNREFUSED, EACCES, PIN failures, schema corruption, etc.) to `{ title, hint }` Arabic messages with a `FALLBACK` default.

## 9. External Integrations
- **Prayer-time calc:** `adhan` 4.4.3 — local library, no API call. Methods: Jafari 16°, Qatif 15.5°, Tehran 17.7°, Umm al-Qura 18.5°.
- **External HTTP calls (all opt-in / user-triggered, never automatic):**
  - `https://nominatim.openstreetmap.org/reverse` — reverse geocoding (`src/main/location/index.js:92`).
  - `https://nominatim.openstreetmap.org/search` — place search (`src/main/location/index.js:253`).
  - `https://overpass-api.de/api/interpreter` — nearby places (`src/main/location/index.js:183`).
  - All gracefully degrade to the offline cities DB on failure.
- **Auto-update (opt-in):** `electron-updater` against GitHub Releases at `alihus294/mithnah` (default), or a custom HTTP feed via `MITHNAH_UPDATE_FEED`.
- **Vendor-redirected hosts (silent local cache):** `fonts.googleapis.com`, `gstatic.com`, `transparenttextures.com` → `build-output/vendor/`.
- **Webhooks / OAuth / payments / analytics:** None.
- **Auth:** Local PIN-based session for the mobile-control phone — 6-digit PIN (scrypt-hashed `N=16384 r=8 p=1`) → 12-hour bearer token (`REMOTE_SESSION_TTL_MS` in `src/main/index.js:95`) → all `/api/*` endpoints validate `Authorization: Bearer <token>` (`src/main/index.js:457-464`). Rate limit: 5 PIN failures per IP → 15-minute lockout (`src/main/index.js:570-610`). **No external auth provider** (no JWT / OAuth / Auth0 / Firebase / Passport).
- **Local API (`http://localhost:3100`, served by Express + socket.io):** `/api/auth`, `/api/health`, `/api/state`, `/api/config`, `/api/phone-dashboard`, `/api/slideshow/*`, `/api/tracker/*`, `/api/location/set`, `/api/shia/catalog`, `/api/picker/command`, `/api/marja/*`.

## 10. Known Issues & Tech Debt
- **TODO/FIXME/HACK/XXX comments:** **Zero in source.** The only matches in the repo are two test fixtures in `tests/marja.test.js:44-46` (asserting a registry can't be mutated to `'HACK'`). Tech-debt is instead encoded as **tombstone comments** in `src/renderer/styles.css` and `src/renderer/components/DashboardFeatures.jsx` recording retired features (`FridayKhutbahTimer`, `InfalliblesRotator`, `dhikrCounter`, etc.) so they aren't re-added.
- **GitHub issues:** `gh issue list --state all` returns empty. Zero open or closed issues on `https://github.com/alihus294/mithnah` (gh authenticated as `alihus294`).
- **Test status:** **Fails on a clean checkout.** Counts from `npm test`: 21 failures, 84 passes (subtest level). Root cause: `node_modules/` is not installed, so `require('adhan')` throws `MODULE_NOT_FOUND` in `src/main/prayer-times/methods.js:1`, cascading to `prayer-times.calculator.test.js`, `prayer-times.config.test.js`, and `features.test.js`. Tests not depending on `adhan` (slideshow, hijri, marja, cities, location, renderer.format, shia-content, shia-upcoming) pass cleanly. **Run `npm install` first; this is not a logic regression.**
- **Outdated deps:**
  - `electron` 28.3.3 — Electron 28 reached EOL ~mid-2024; current is 33+. **Notable upgrade lag with security implications.**
  - `vite` 5.4.21 — Vite 6/7 current.
  - `electron-builder` 24.13.3 — current is 25.x.
  - `react`, `react-dom`, `express`, `adhan`, `socket.io`, `qrcode` — recent / current.
  - **No `engines` field** in `package.json` (CI uses Node 22, but no enforcement on contributors' local installs).
- **Broken doc link:** `README.md:93` references `docs/ARCHITECTURE.md`, which does not exist.
- **Unpushed commit:** Local `main` is one ahead of `origin/main` (`a38d450 feat(a11y): default largeText ON`).

## 11. Domain Logic & Gotchas
- **Maghrib-pivot rule:** After sunset, event lookup flips to "tonight = tomorrow's Hijri date". Implemented in `src/main/bridge-ipc.js`. Critical for getting Ashura / Arafah / Ghadir banners to appear at the correct moment.
- **Offline-first by policy:** All external HTTPS is blocked at the `session.webRequest` layer (`src/main/network-policy.js`) unless the user sets `MITHNAH_ALLOW_NETWORK=1`. `fonts.googleapis.com`, `gstatic.com`, `transparenttextures.com` are silently redirected to vendored copies under `build-output/vendor/` — `scripts/copy-vendor-to-dist.js` is the post-build step that ships them.
- **Schema migration:** `src/main/prayer-times/config.js` carries `CURRENT_SCHEMA_VERSION = 2`; `src/main/prayer-times/defaults.js` has its own `schemaVersion: 2` literal that **must stay in lockstep** (the duplication is intentional, to break a circular dep). Migration v1 → v2 force-enables `largeText` for elderly operators. The uncommitted edit on disk is finishing this duplication.
- **Frame-guard:** Privileged main-process writes only accept events whose `event.senderFrame` is the main BrowserWindow's top frame (`requireMainWindow`). Prevents any future iframe / embedded content from issuing privileged IPC.
- **PIN security:** scrypt(`N=16384 r=8 p=1`); rate-limited to 5 attempts per IP per 15 minutes. Tokens are random opaque strings, 12-hour TTL, kept in memory only (renderer stores in `sessionStorage`, cleared on reload).
- **Strict-mode config writer:** `src/main/prayer-times/config.js:59-63` drops unknown top-level keys on write — protects against persistence-level poisoning by an authenticated writer.
- **Window-settings cap:** 256 KB hard cap on `window-settings.json` to prevent JSON-bomb OOM (`src/main/index.js:181`).
- **Auto-content rule:** When `features.autoContentToday` is on, `src/main/auto-content.js` maps Hijri events to recommended slideshows (Ashura → Ziyarat Ashura, Arafah → Dua Arafa, Ghadir → Kumayl, Laylat al-Qadr → Iftitah).
- **Renderer reactivity:** Same-window instant reactivity uses a renderer-local `window.dispatchEvent('mithnah:config-changed')` *in addition to* the main → renderer IPC broadcast — both layers are needed because IPC events skip the originating window.
- **Snapshot composition in main:** `src/main/bridge-ipc.js` composes a single read-only snapshot per renderer poll instead of the renderer recomputing — this is deliberate; do not move the prayer-time / Hijri / event computation into the renderer.
- **Persistence atomicity:** Config writes go through tmp-file + rename (`config.js:282-300`).
- **Retired features ("tombstones"):** `fridayKhutbahTimer`, `infalliblesRotator`, `dhikrCounter`, default-off Qibla badge — annotated in `src/main/prayer-times/defaults.js:140-145`, `src/renderer/styles.css`, `DashboardFeatures.jsx`. Don't reintroduce without checking the tombstone reasoning.

## 12. What's Missing
- **TypeScript:** Missing (`tsconfig.json` absent; pure JS/JSX project).
- **ESLint:** Missing (no `.eslintrc*`, no `eslint.config.*`, no `lint` script).
- **Prettier:** Missing (no `.prettierrc*`, no `prettier` dep).
- **Type checking on JS:** Missing (no `// @ts-check`, no JSDoc `checkJs`).
- **Integration / e2e / React-component tests:** Missing. Only main-process pure-logic unit tests + one renderer formatter unit test. No Playwright / Spectron / WebDriver / React Testing Library / IPC harness.
- **`engines` field in `package.json`:** Missing.
- **`docs/ARCHITECTURE.md`:** Missing (referenced by README:93 — broken link).
- **macOS / Linux build target:** Not configured. electron-builder is Windows-x64-NSIS only.
- **LICENSE:** Present (MIT).
- **CHANGELOG.md:** Present (~9.5 KB at repo root).
- **`.editorconfig`:** Present.
- **CI workflows:** Present (`test.yml`, `build.yml`, `release.yml`).
- **/docs:** Present (DESIGN-PROMPT, FOR-MOSQUE-OPERATORS, RELEASE, ROADMAP, SIGNPATH-APPLICATION, SUSTAINABILITY).

## 13. Open Questions for the User
1. **Electron 28 is EOL** (since ~mid-2024). Is there an upgrade plan to Electron 33+? If so, what's the priority — security/compatibility now, vs. risk to the v0.1.5 stability window?
2. The two **uncommitted modified files** (`prayer-times/defaults.js` schemaVersion bump, `Dashboard.jsx` largeText default flip) — are these meant to land as v0.1.6, or are they WIP you'd rather we not touch?
3. There's an **unpushed `a38d450` commit** on local `main`. Should that be pushed before any new work begins?
4. `README.md:93` references `docs/ARCHITECTURE.md`, which **doesn't exist**. Write it, remove the link, or leave it?
5. The test suite **fails on a clean checkout** until `npm install` runs — do you want a CONTRIBUTING.md / setup-checks added, or is this acceptable for a "personal-use project"?
6. `ROADMAP.md` exists in `/docs` but I haven't been told what's prioritized for v1.0. What are the next 1–2 features you want help with?
7. Is there interest in **macOS / Linux builds**, or is Windows-only intentional and durable?
8. **No ESLint / Prettier / TypeScript** is a deliberate choice in many small projects, but the codebase has grown enough (~11 main modules, ~11 test files) that it might be worth revisiting. Open to incremental adoption (e.g., JSDoc `@ts-check`, or dropping in `eslint:recommended` only)?
9. **No integration or e2e tests** — given the IPC complexity (10 namespaces, frame-guard, snapshot composer, slideshow state machine, Express+socket server), would a Playwright + Electron test harness be welcome?
