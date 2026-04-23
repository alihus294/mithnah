# Changelog

All notable changes to Mithnah are logged here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates use the Gregorian
calendar for tooling compatibility; the Hijri date is noted in parentheses
where meaningful.

## [0.8.x] — 2026-04-20 (3 ذو القعدة 1447)

### Added
- **F5 Prayer Tracker.** Fullscreen overlay the caretaker drives during
  jamaah prayer. Shows which rakah, which posture (قيام/ركوع/سجدة…),
  and the recommended dhikr for that posture. Auto-ends each prayer
  with Tasbih al-Zahra on a single page. Arrow keys + Logitech R400.
- **F4 Dua Library.** Modal catalog of all bundled duas, ziyarat, and
  taqibat from *Mafatih al-Jinan*. Click an item to open it as a
  slideshow on the wall. Debounced search; tab-level cache.
- **F3 Settings overlay.** Every mosque-configurable field with live
  save: mosque name, calculation method (incl. "Auto — detect from
  GPS"), marja (13 presets), calendar + day offset, maghrib delay,
  location (city picker / Nominatim search / manual coords / nearby-
  places via Overpass), occasion override, hide-asr / hide-isha,
  12/24-hour clock, per-prayer minute adjustments. QR + PIN display
  lives inside F3, never on the public wall view.
- **Nominatim + Overpass location search.** Village-level reverse
  geocoding (OpenStreetMap) for remote settlements not in the bundled
  city DB. Fetched only on operator action; offline-first default
  preserved.
- **v2 Shia Islamic design system.** 12-point Imami stars, arabesque
  corners, mihrab silhouette behind the clock, warm gold-on-teal
  palette, persistent salawat footer. Per-occasion tint variants
  (normal / shahadah / wiladah / eid).
- **Authoritative dua content.** Arabic text sourced from
  mafatih.duas.co, paginated one verse per slide (Quran-style rhythm).
  Kumayl 260 slides, Arafah 623, Abu Hamza 613, Jawshan Saghir 336,
  etc. Needs imam line-check against printed Mafatih before live use.

### Changed
- Wall default no longer shows QR/PIN. Visible only inside F1 (help)
  and F3 (settings) so the congregation never sees pairing credentials.
- Slideshow body uses a single clamped font size; dynamic per-slide
  scaling removed. Pure opacity fade between slides.

### Security
- CSP `unsafe-eval` now gated behind `!app.isPackaged` — dev builds
  keep it for Vite HMR; packaged builds drop it.
- State-changing POSTs require either same-origin Origin header OR
  `X-Requested-With: Mithnah`. CSRF-by-form attack now blocked.
- Socket.io slideshow-command payload sanitized — only `index:number`
  and `on:boolean` pass through, unbounded arrays rejected.
- PIN failure eviction now timestamp-based (oldest `lastFailure`),
  preventing junk-IP flood from evicting legitimate locked entries.

### Fixed
- F3 no longer appears to hang: per-IPC 3-second Promise.race timeout
  + skeleton card with a live close button from the first keystroke.
- `hijri.today()` null result no longer crashes `/api/phone-dashboard`.
- `config.save()` sweeps orphan `.tmp` files > 1 h old on every save.
- Dead `PinBadge.jsx` component deleted.

## [0.5.0] — 2026-04-20 (3 ذو القعدة 1447)

### Changed
- **Phone UI rewritten from scratch.** New `build-output/mobile-control.{html,js}`
  (~450 lines) uses the Mithnah design tokens and talks to a new single
  `/api/phone-dashboard` endpoint that composes config + prayer times +
  Hijri + events in one authed snapshot. Legacy command surface removed.
- **Wall renderer wired up.** `src/renderer/App.jsx` now composes the
  Dashboard, PIN/QR badge, help overlay, help hint, and slideshow
  overlay — replacing the placeholder stub.
- **Legacy runtime paths removed.** `USE_PREBUILT` mode, the bootstrap
  and asar-patching scripts, and `build-output/` asset + audio + icon
  bundles are gone. The app now loads only from `dist/renderer/` and
  the Mithnah-authored `build-output/mobile-control.*` + `vendor/`.
- **Legacy remote commands pruned.** Only `SET_APP_ZOOM` remains in
  the wall-level command whitelist. Slideshow keeps its own NAV_COMMANDS
  whitelist. The Quran/Dua/Mode-switcher commands are all removed.

## [0.3.0] — 2026-04-20 (3 ذو القعدة 1447)

### Added
- **Verified Shia content module** (`src/main/shia-content/`). Registry of Shia
  Ithna Ashari duas (Kumayl, Nudbah, Tawassul, Ahd, Faraj, Iftitah, Samat,
  Sabah), ziyarat (Ashura, Arbaeen, Warith, al-Hujja, Jamia Kabira), taqibat
  per prayer plus common, Tasbih al-Zahra with the correct Shia 34/33/33
  counts, and ~30 Hijri events (wiladat, shahadat, Ghadir, Mubahalah, Ashura,
  Arbaeen, mid-Sha'ban/Mahdi wiladah). All sourced from *Mafatih al-Jinan*.
- **Presenter-style slideshow** (`src/main/slideshow/`). Deck state machine
  with `OPEN / CLOSE / NEXT / PREV / FIRST / LAST / GOTO / BLANK` commands.
  Slideshow state pushed to all clients via IPC + socket.io so the wall
  display and phone stay in sync.
- **Physical presenter remote support.** Main window listens for
  ← → PageUp/PageDown Space Home End B . Esc — the keys a Logitech R400,
  Spotlight, or any HID presenter emits — and routes them through the same
  dispatch as the mobile-control phone buttons.
- **Mobile-control slideshow widget** (`build-output/vendor/mithnah-slideshow.js`).
  Floating purple panel on the phone UI with a tabbed catalog (duas / ziyarat /
  taqibat / tasbih), per-slide prev/next/blank/end buttons, live state sync.
- **Pluggable auto-updater** (`src/main/updater/`). `electron-updater`-backed
  module that's off by default; operator enables via `MITHNAH_AUTO_UPDATE=1`
  + a configured feed (`MITHNAH_UPDATE_FEED=github:owner/repo` or a generic
  HTTP feed URL, or `package.json → build.publish`). State exposed on IPC
  channel `updater:state`.
- **Shia-specific Maghrib delay option.** `config.maghribDelayMinutes`
  (0–60 min) lets marja-specific practice (ذهاب الحمرة المشرقية) override
  the angle-based maghrib without needing to pick a different calculation
  method.
- **Config schema version** (`schemaVersion: 1`) + atomic writes (write to
  `.tmp` then rename) + unknown-key preservation. Forward- and backward-safe.

### Security
- **PIN rate-limiting.** 5 failed attempts per IP locks that IP out of
  `/api/auth` for 15 minutes (HTTP 429 + `Retry-After`). Logs the lockout.
- **Geolocation permission handler.** Only local origins (`file://`,
  `localhost`, `127.0.0.1`, `::1`) may request `navigator.geolocation`.
- **PIN no longer persisted in localStorage.** GPS widget stores only the
  auth token in `sessionStorage`; PIN is re-prompted on each new browser
  session.
- **Atomic writes for `prayer-config.json` and `window-settings.json`.**
  Eliminates the half-written-file risk if the process is killed mid-write.

### Changed
- **Network policy is now redirect-first.** Known CDN URLs (Google Fonts,
  transparenttextures.com) are redirected to local `build-output/vendor/`
  files *regardless* of `MITHNAH_ALLOW_NETWORK` — so offline parity is
  always preserved. Only blocking of unknown hosts is gated by the env var.
- **Google Fonts redirect uses a wildcard** — any future
  `fonts.googleapis.com/css2?...` query that doesn't match a specific
  pattern falls back to the combined local bundle.
- **Network policy install happens BEFORE window load.** Catches renderer
  boot-time requests.
- `getTodayAndNext` now uses `>=` (was `>`). At `now === fajr` the Fajr
  prayer is treated as current, not skipped.
- `adjustZoomStep` no longer stalls when the current factor exactly matches
  a step.
- `cache.dayKey` uses UTC year/month/day (was local) so the cache stays
  valid across DST crossings.
- Polar-latitude rejection is now per-method — `MoonsightingCommittee` is
  exempt because it includes seasonal adjustments for high latitudes.
- Preload exposes six new IPC namespaces: `prayerTimes.*`, `hijri.*`,
  `location.*`, `shia.*`, `slideshow.*`, `updater.*`.

### Reliability
- `app.requestSingleInstanceLock()` prevents a second copy from clobbering
  port 3100; second launch focuses the existing window.
- `unhandledRejection` and `uncaughtException` handlers log instead of
  silently killing the main process.
- `app.whenReady().then(...).catch(app.exit(1))` — fatal init errors are
  no longer silent.
- Port fallback for the mobile-control server — tries `3100–3109` before
  giving up.
- Graceful shutdown on `before-quit` — flushes settings and tears down the
  Express server before the process exits.
- `window-settings.json` preserves unknown top-level keys across saves.

### Tests
- 20 new tests: 8 for `shia-content`, 12 for `slideshow`.
- Total: 56 passing (was 36).

## [0.2.0] — 2026-04-19

### Added
- Local prayer-time calculation with Jafari (Leva Institute) method as the
  default for the Shia Twelver positioning.
- Multi-variant Hijri calendar (`jafari`, `umm-al-qura`, `islamic-civil`,
  `islamic-tbla`, `astronomical`) via `Intl.DateTimeFormat`.
- Timezone-based first-run location detection (no network).
- Phone GPS handoff: `navigator.geolocation.getCurrentPosition` from the
  mobile-control page POSTs to `/api/location/set`.
- Offline-first network policy blocking all external hosts; local vendor
  bundle for fonts, Font Awesome, Tailwind, textures.

### Changed
- Default method `UmmAlQura` → `Jafari`; default location Makkah → Najaf.

### Removed
- `firebase`, `@google/genai`, `electron-updater` (all unused at the time).

## [0.1.0] — 2026-04-18

Initial release.
