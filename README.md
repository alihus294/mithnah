# Mithnah (مئذنة)

> A free, open-source mosque display for Shia Ithna Ashari (Twelver)
> communities. Fully offline, global-ready, and free forever.

Mithnah is a Windows desktop application that runs on a mosque's main-hall
display. It shows the clock, Hijri date, all five daily prayer times with a
next-prayer countdown, banners for today's Islamic occasions, and a
presenter-style slideshow for verified duas and ziyarat.

- **Shia Ithna Ashari (Twelver) first.** Default prayer-time method is
  Jafari (Leva Institute, Qom); Tehran Institute of Geophysics is also
  available. Eleven Sunni methods are bundled for mixed-community
  installations and only apply when the operator explicitly chooses them.
- **Thirteen marja presets.** Sistani, Khamenei, Sadr, Makarem, Wahid,
  Safi, Shubairi, Bashir-Najafi, Hakim, Fayyadh, Modarresi, Fadlallah,
  plus a fully custom profile.
- **Multi-variant Hijri calendar.** `jafari` (astronomical with optional
  day offset), `umm-al-qura`, `islamic-civil`, `islamic-tbla`, and pure
  `astronomical`. Five variants, `Intl.DateTimeFormat`-backed, zero deps.
- **Fully offline.** Every font, icon, and texture is bundled. The
  Electron main process enforces the policy via `session.webRequest` —
  all external HTTPS is blocked unless `MITHNAH_ALLOW_NETWORK=1`.
- **Phone control via GPS.** The caretaker authenticates with a PIN on
  any phone on the same Wi-Fi, then hands the wall the phone's GPS
  fix (far more accurate than timezone-based fallback). Reverse
  geocoding against a 100+ city Shia-weighted database happens
  locally.
- **Presenter slideshow.** Duas, ziyarat, taqibat, and Tasbih al-Zahra
  from Mafatih al-Jinan, ready for Friday prayer projection. Remote
  control via a Logitech presenter or the phone UI.
- **Event banners.** 30+ Hijri events (shahadah, wiladah, eid,
  significant) announced automatically with a "coming soon" ticker for
  upcoming dates.
- **Optional auto-update.** Disabled by default. Operator opts in by
  setting `MITHNAH_AUTO_UPDATE=1`.

**Name:** *Mithnah* — transliteration of **مئذنة**, the minaret.

**License:** MIT (see [`LICENSE`](./LICENSE)).

---

## For mosque operators (non-technical)

See [`docs/FOR-MOSQUE-OPERATORS.md`](./docs/FOR-MOSQUE-OPERATORS.md) —
a step-by-step Arabic guide: installing, changing calculation method and
location, what the phone remote is for, and what to expect from
automatic updates.

## For developers

### Quick start

```powershell
cd "path\to\mithnah\project"
npm install
npm run dev
```

This runs Vite on the renderer and Electron on the main process
concurrently, with devtools detached.

### Running tests

```powershell
npm test
```

Seventy-nine tests cover the prayer-times calculator, config persistence,
Hijri conversion, region detection, marja presets, city reverse-geocoding,
slideshow state machine, and more.

### Building an installer

```powershell
npm run dist:win
```

Produces `dist/electron-builder/Mithnah Setup X.Y.Z.exe` (~165 MB).

On a fresh Windows machine, electron-builder needs one of the following
to handle symlinks during NSIS packaging:

- Windows Developer Mode enabled (Settings → Privacy & Security → For developers), or
- An elevated PowerShell session, or
- A CI runner (`.github/workflows/build.yml`).

---

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Short version:

- **Main process** — `src/main/`. Electron + Express (port 3100) +
  socket.io. Registers IPC channels for prayer times, Hijri, location,
  marja presets, slideshow, updater, and the bridge dashboard API.
- **Renderer** — `src/renderer/` (Vite + React 18). Wall UI: clock,
  prayer list, next-prayer block, event banners, slideshow overlay,
  PIN/QR badge, F1 help overlay.
- **Phone UI** — `build-output/mobile-control.{html,js}`. Served by the
  main-process Express server. Authenticates with a per-device PIN and
  refreshes a snapshot of config + prayer times + Hijri + events from
  `/api/phone-dashboard` every 30s.
- **Widgets** — `build-output/vendor/mithnah-*.js`. Floating phone
  widgets for GPS handoff, slideshow control, and first-run onboarding.

## Prayer-time calculation

Thirteen methods, Jafari (Leva) as the default. Coarse lat/lng geofences
only select a regional Sunni method when the caller explicitly passes
`alignMethodToRegion: true` to `location:set`.

Shia methods:
- **Jafari** — Leva Institute of Qom. Fajr 16°, Isha 14°, Maghrib 4° below horizon.
- **Tehran** — Institute of Geophysics (Tehran). Fajr 17.7°, Isha 14°, Maghrib 4.5°.

Sunni methods: Umm al-Qura · Muslim World League · Egyptian General
Authority · University of Islamic Sciences, Karachi · Dubai · Qatar ·
Kuwait · Singapore · Turkey · ISNA · Moonsighting Committee.

Backed by [`adhan-js`](https://github.com/batoulapps/adhan-js). Jafari
uses `CalculationParameters` with Leva's angles; others use adhan-js
factories.

Config lives in `%APPDATA%\Mithnah\prayer-config.json`.

## Hijri calendar

Five variants via `hijri:*` IPC, all backed by V8's built-in Islamic
calendars:

- **jafari** — astronomical + optional `dayOffset` so a community whose
  marja announces sighting a day off from pure astronomical can pin to
  the right day.
- **umm-al-qura** — Saudi Arabia official (tabulated).
- **islamic-civil** — deterministic tabular civil Hijri.
- **islamic-tbla** — tabular with astronomical epoch.
- **astronomical** — pure astronomical new-moon.

## Offline-first network policy

Every outbound request is either:

1. **Loopback** (http://127.0.0.1, socket.io) — allowed.
2. **Known local vendor URL** (Google Fonts, transparenttextures.com)
   — silently redirected to `build-output/vendor/` local files.
3. **Anything else** — blocked, one log line per denied host.

Escape hatch: `MITHNAH_ALLOW_NETWORK=1`.

## Contributing

Personal-use project. Pull requests welcome but reviewed on a
best-effort basis.

## License

MIT. Prayer-time calculation is `adhan-js` (MIT). Fonts are Google Fonts
(SIL Open Font License) bundled locally.
