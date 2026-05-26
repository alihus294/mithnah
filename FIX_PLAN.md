# Pre-Beta Fix Plan — Parallel Execution Edition
_Generated 2026-05-25. Reorganized so 4 agents can work simultaneously with **zero file overlap**.
Each item still carries its severity tag (Phase 1 = beta blocker, Phase 2 = important, Phase 3 = quality)._

---

## Parallel execution model

**Design rule:** every file is owned by exactly one agent. No two agents touch the same file in the same session. The 4 agents can run on independent git branches and merge cleanly in any order.

### Ownership matrix

| Agent | Files | Item count | Difficulty |
|-------|-------|------------|------------|
| **A — Main process + auth + Settings modals** | `src/main/index.js`, `src/main/app-features.js`, `src/renderer/components/SettingsOverlay.jsx` | 11 | High |
| **B — Updater + mobile-control phone UI** | `src/main/updater/index.js`, `build-output/mobile-control.html`, `build-output/mobile-control.js` | 5 | Medium |
| **C — Wall renderer (Dashboard, DuaPicker, styles)** | `src/renderer/components/Dashboard.jsx`, `src/renderer/components/DashboardFeatures.jsx`, `src/renderer/components/DuaPicker.jsx`, `src/renderer/styles.css` | 3 | Low |
| **D — Docs, CI, build config** | `README.md`, `docs/*`, `.github/workflows/*`, `package.json`, `vite.config.js`, `build/installer.nsh` | 8 | Medium |

**Verified non-overlap:** every file listed appears under exactly one agent. Cross-agent contracts that previously existed (1.6, 3.7) have been consolidated into the agent that owns the larger half — no inter-agent coordination needed.

### Suggested commit order

- **Agents A, B, C** can start immediately and commit in any internal order.
- **Agent D** should land all items EXCEPT 1.1 (Electron upgrade) first; do 1.1 LAST so its smoke test exercises the merged work from A/B/C on the new Electron baseline.
- **Final merge:** integrate D's 1.1 commit on top, run full `npm test` + `npm run dist:win`, smoke test the installer.

### Baseline expectations (every agent before opening a PR)

- `npm test` → 114/114 pass (no new failures).
- `npm run build:renderer` → succeeds with no errors.
- No new TODOs/FIXMEs in the diff.
- Each finding has a one-line commit message: `fix(area): <one sentence>  [§X.Y]`.

---

## Agent A — Main process IPC + auth + Settings modals

**Files owned:** `src/main/index.js`, `src/main/app-features.js`, `src/renderer/components/SettingsOverlay.jsx`.

**Items (11):**

| Item | Phase | Effort |
|------|-------|--------|
| A.1 Kiosk-lock recovery env var (was 1.4) | Phase 1 | 30 min |
| A.2 Mobile-control CSP — explicit `script-src` (was 1.5) | Phase 1 | 1 h |
| A.3 `app:set-settings-pin` verifies current PIN (was 1.6) | Phase 1 | 2 h |
| A.4 Mobile PIN — add random salt (was 2.2) | Phase 2 | 1 h |
| A.5 IP lockout — combine with client cookie (was 2.3) | Phase 2 | 2 h |
| A.6 GPS handoff — sanity-check vs prior location (was 2.4) | Phase 2 | 2 h |
| A.7 System-clock skew check at startup (was 2.6) | Phase 2 | 3 h |
| A.8 `/api/config` — strict string-only types (was 2.7) | Phase 2 | 30 min |
| A.9 Settings-PIN rate limit 8/10 → 5/15 (was 2.9) | Phase 2 | 5 min |
| A.10 PIN counter TOCTOU — increment-then-compare (was 2.10) | Phase 2 | 30 min |
| A.11 `importConfigFrom` — schemaVersion warning (was 3.7) | Phase 3 | 1 h |

**Total Agent A effort:** ~13 hours.

**Suggested internal order:** A.9 → A.8 → A.10 → A.4 → A.2 → A.5 → A.1 → A.6 → A.7 → A.3 → A.11. (Smallest first to build momentum; cross-file items A.3/A.11 last because they touch SettingsOverlay.jsx in addition to main.)

### A.1 Kiosk-lock recovery env var

**Why:** `src/main/index.js:1871-1888` `app:kiosk-quit` only accepts the saved settings PIN. Operator who forgets the PIN has only Task Manager as escape.

**Steps:**
1. In `src/main/index.js` `app:kiosk-quit` handler (line 1871): before calling `verifyPinAgainstHash`, check `process.env.MASJID_KIOSK_RESCUE === '1'`. If true, skip PIN check and log a warning: `[Mithnah] kiosk-quit: bypassed via MASJID_KIOSK_RESCUE`.
2. (No renderer change — operator sets the env var and the existing UI flow proceeds.)

**Acceptance:** With `MASJID_KIOSK_RESCUE=1` set, kiosk quit succeeds without correct PIN. Without it, behavior unchanged.

---

### A.2 Mobile-control CSP — explicit `script-src`

**Why:** Verified `src/main/index.js:570-578`. `default-src 'self' 'unsafe-inline'` with no `script-src` lets XSS execute scripts.

**Steps:**
1. Replace the CSP middleware (lines 570-578) with:
   ```js
   const evalClause = app.isPackaged ? '' : "'unsafe-eval' ";
   res.setHeader('Content-Security-Policy',
     `default-src 'self'; ` +
     `script-src 'self' ${evalClause}; ` +
     `style-src 'self' 'unsafe-inline'; ` +
     `img-src 'self' data: blob:; ` +
     `connect-src 'self' ws: wss:; ` +
     `font-src 'self' data:; ` +
     `frame-ancestors 'none'; ` +
     `base-uri 'self'; ` +
     `form-action 'self'`);
   ```
2. Manually open the phone page in a browser; check devtools console for any new CSP errors. Tighten/loosen as needed.

**Acceptance:** Phone page loads, no CSP violation reports. Temporarily injecting an inline `<script>` via mosqueName does NOT execute.

---

### A.3 `app:set-settings-pin` verifies current PIN

**Why:** Verified `src/main/index.js:1780-1796`. Handler writes new hash without verifying the old one — XSS can rotate the PIN.

**Steps:**
1. In `src/main/index.js` `app:set-settings-pin` handler: destructure `currentPin` from the input alongside `pin`. Before writing, if `cfg.settingsPinHash` exists, call `appFeatures.verifyPinAgainstHash(currentPin, cfg.settingsPinHash)`. If it returns false (or throws on rate-limit), return `{ok:false, error:'PIN الحالي غير صحيح'}`.
2. In `src/renderer/components/SettingsOverlay.jsx`: locate `finishPinSetup` (around line 757). Add a new stage `'current'` BEFORE the existing `'enter'` stage. The `'current'` stage asks for the existing PIN and calls `verifySettingsPin(currentPin)` — only on success do we advance to `'enter'`.
3. Store the typed `currentPin` in state so the eventual `setSettingsPin` call can include it.
4. When `cfg.settingsPinHash` is null (first-time PIN setup), skip the `'current'` stage.

**Acceptance:** Setting a new PIN while one already exists requires entering the old PIN first. First-time setup (no existing PIN) skips the new stage.

---

### A.4 Mobile PIN — add random salt to derivation

**Why:** Verified `src/main/index.js:86-102`. `defaultPin()` = sha256(hostname+username+'mithnah-pin-v1') first 6 hex digits mod 1e6. LAN attacker with hostname+username can compute it.

**Steps:**
1. Add a helper `loadOrCreatePinSalt()` near `defaultPin`: read `path.join(USER_DATA_PATH, 'pin-salt')`. If missing or unreadable, generate `crypto.randomBytes(32).toString('hex')`, write it (mode 0o600). Cache the value.
2. Modify `defaultPin()` to include the salt in the hash: `sha256(hostname + username + salt + 'mithnah-pin-v1')`.
3. Update `docs/FOR-MOSQUE-OPERATORS.md` (NOTE: this is Agent D's territory — open a coordination ticket, OR add a one-line `console.log` on first salt creation: `[Mithnah] generated per-install PIN salt — note your PIN from F1`).

**Acceptance:** Two installs on identical hostname+username produce different PINs. PIN persists across restarts.

---

### A.5 IP lockout — combine with client cookie

**Why:** Verified `src/main/index.js:600`. `pinFailures` keyed by IP only. NAT'd mosque Wi-Fi → one fumbling phone locks out everyone.

**Steps:**
1. In `/api/auth` handler (line 635): on every response (success or failure), set/refresh an HttpOnly cookie `mithnah_client` = `crypto.randomBytes(16).toString('hex')` if not already present.
2. Change the lockout key from `ip` to `${ip}:${req.cookies?.mithnah_client || 'no-cookie'}`. (Add `cookie-parser` middleware — `npm i cookie-parser` — OR parse manually: `req.headers.cookie?.match(/mithnah_client=([a-f0-9]+)/)?.[1]`.)
3. Update the sweep logic (line 605-628) accordingly — it iterates entries, so just the key format changes.

**Acceptance:** Two phones behind NAT (same IP) get independent failure counters.

---

### A.6 GPS handoff — sanity-check vs prior location

**Why:** Verified `src/main/index.js:1020-1078`. Accepts any continent jump. PIN-holder anywhere on the planet can silently relocate the wall.

**Steps:**
1. In `/api/location/set` (line 1071, before `prayerTimes.setConfig`): compute great-circle distance from `cfg.location` (current) to incoming `(lat, lng)` using haversine. Reuse `appFeatures.computeQibla`'s math or inline.
2. If `cfg.location?.lat` exists AND distance > 500 km AND `req.body?.confirmRelocation !== true`: respond `409 Conflict` with `{ok:false, requiresConfirmation:true, distanceKm: Math.round(dist), priorName: cfg.location?.name, message: 'الموقع الجديد بعد X كم...'}`.
3. (Phone-side change in `mobile-control.js` is **Agent B's** territory — Agent B has been assigned the matching 409 handler. Document the contract in Agent B's notes.)

**Cross-agent contract:** Phone-side on 409 should show a confirm dialog and re-POST with `confirmRelocation: true`. Agent B implements the phone half (added to Agent B's bucket as item B.6).

**Acceptance:** Phone in Toronto → Riyadh wall → 409. Phone in Qatif → Ahsa wall (distance ~100 km) → 200.

---

### A.7 System-clock skew check at startup

**Why:** Dead CMOS battery on an old PC → clock reset to year 2016 → wrong prayer times silently.

**Steps:**
1. After main window is created (somewhere in the `app.whenReady` block), kick off a one-shot HTTPS HEAD request to `https://api.github.com` (already whitelisted by the updater path; or add a one-off bypass).
2. Parse the `Date:` response header. If `Math.abs(serverTime - localTime) > 5 * 60 * 1000`: emit IPC `app:clock-skew` to the renderer with `{skewMs, serverIso}`.
3. Don't broadcast the IPC channel — let renderer subscribers handle the toast. Renderer Dashboard subscription is **Agent C's** responsibility (add it to Agent C's bucket as item C.4).
4. Skip the check silently if the network is unreachable — don't make it a hard requirement.

**Cross-agent contract:** Agent A pushes `app:clock-skew` IPC; Agent C consumes it in Dashboard.jsx to show the toast. **However** — to keep agents independent, Agent A can ship the IPC channel alone; Agent C's toast handler is a small Phase 3 addition. If Agent C doesn't pick it up, Agent A's logged warning in main-process console is the only visible signal (acceptable fallback).

**Acceptance:** Set system clock back 2 days → on next launch, console logs the skew. (Toast UX deferred to Agent C item C.4 if added.)

**NOTE:** This item depends on network access to one external host. The network-policy gate must allow it. Implementation may need to add `api.github.com` to the allowlist or use a localhost echo.

---

### A.8 `/api/config` — strict string-only types

**Why:** Verified `src/main/index.js:730`. Accepts `string | number | null` for text fields. A number sent for `mosqueName` silently resets to default.

**Steps:**
1. Change the type check on line 730 from `typeof v === 'string' || typeof v === 'number' || v === null` to a per-field validator:
   ```js
   const validators = {
     mosqueName:                  (v) => typeof v === 'string',
     announcementText:            (v) => typeof v === 'string',
     imamName:                    (v) => typeof v === 'string',
     supportContact:              (v) => typeof v === 'string',
     announcementAutoHideSeconds: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
   };
   if (validators[key]?.(v)) patch[key] = v;
   else rejected.push({ key, reason: 'bad-type', type: typeof v });
   ```

**Acceptance:** `POST {mosqueName: 12345}` → 400. `POST {announcementAutoHideSeconds: 30}` → 200.

---

### A.9 Settings-PIN rate limit 8/10 → 5/15

**Why:** Verified `src/main/app-features.js:14-15`. `PIN_WINDOW_MS = 10 min`, `PIN_MAX_FAILURES = 8`. Mobile uses 5/15, align Settings.

**Steps:**
1. `PIN_WINDOW_MS = 10 * 60 * 1000` → `15 * 60 * 1000`.
2. `PIN_MAX_FAILURES = 8` → `5`.

**Acceptance:** 5 wrong PIN attempts → 6th throws. Wait 15 min → reset.

---

### A.10 PIN counter TOCTOU — increment-then-compare

**Why:** Verified `src/main/index.js:635-661`. Parallel requests can all see `count=4`, all increment, all pass the lockout check.

**Steps:**
1. Move the `record.count++; record.lastFailure = now; pinFailures.set(...)` block to BEFORE the lockout check.
2. Compare with `record.count > PIN_MAX_FAILURES` (strict greater-than, since count was just incremented for this attempt).
3. Order: increment → lockout-check → PIN-check → on success `pinFailures.delete(ip)`.

**Acceptance:** 10 simultaneous wrong-PIN POSTs → at most 5 reach the PIN comparison; remaining 5 hit the 429 lockout response.

---

### A.11 `importConfigFrom` — schemaVersion warning

**Why:** Verified `src/main/app-features.js:111-124`. Silent migration, no operator warning when importing an older-version export.

**Steps:**
1. In `importConfigFrom`: after `JSON.parse`, read `parsed.schemaVersion`. Import `CURRENT_SCHEMA_VERSION` from `../prayer-times/config.js`.
2. If `parsed.schemaVersion > CURRENT_SCHEMA_VERSION`: throw `Error('ملف الإعدادات من نسخة أحدث (${parsed.schemaVersion}) من نسخة التطبيق (${CURRENT_SCHEMA_VERSION}). حدّث التطبيق أولاً.')`.
3. Return shape becomes `{config, path, fromVersion, currentVersion, upgraded}` where `upgraded = (parsed.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION`.
4. In `SettingsOverlay.jsx` `onImportConfig` (around line 634): if `result.upgraded`, set `msg` to `تم استيراد إعدادات نسخة أقدم (v${result.fromVersion || '?'}) — الحقول الجديدة أخذت قيمها الافتراضية. راجع F3 للتأكّد.`

**Acceptance:** Importing v1 export into v2 install → warning toast. Same-version → no warning. Future-version → error.

---

## Agent B — Updater + mobile-control phone UI

**Files owned:** `src/main/updater/index.js`, `build-output/mobile-control.html`, `build-output/mobile-control.js`.

**Items (5 + 1 cross-agent counterpart from A.6):**

| Item | Phase | Effort |
|------|-------|--------|
| B.1 Updater signature validation (was 1.3) | Phase 1 | 1 h (after cert lands; placeholder OK now) |
| B.2 Mobile-control: live state via socket (was 2.1) | Phase 2 | 3 h |
| B.3 Tracker reset/close — 2-tap confirm (was 2.5) | Phase 2 | 1 h |
| B.4 `MITHNAH_UPDATE_FEED` — https-only (was 2.8) | Phase 2 | 15 min |
| B.5 Wake Lock API for Controls tab (was 3.5) | Phase 3 | 1 h |
| B.6 Phone-side 409 handler for GPS confirmation (paired with A.6) | Phase 2 | 30 min |

**Total Agent B effort:** ~6.5 hours (excluding cert wait).

**Suggested internal order:** B.4 → B.3 → B.5 → B.6 → B.2 → B.1.

### B.1 Updater signature validation

**Why:** Verified `src/main/updater/index.js`. No publisherName check; with unsigned binaries the integrity gate is open.

**Steps (preparatory now; activate when SignPath cert lands):**
1. In `src/main/updater/index.js` `start()` around line 273: set `u.allowDowngrade = false` and `u.disableWebInstaller = true`.
2. Add a commented-out block:
   ```js
   // Activate once SignPath cert lands (see docs/SIGNPATH-APPLICATION.md):
   // u.requestHeaders = { ... };
   // After cert is installed, electron-updater validates publisherName
   // against the signed installer's Authenticode publisher field.
   ```
3. Document the dependency in `src/main/updater/index.js` top-of-file comment.

**Acceptance:** Once cert is wired (Agent D's 1.2 work), tampered installer fails verification. Until then, the comments make the path clear to future contributors.

---

### B.2 Mobile-control: live state via socket

**Why:** Verified — `grep -i socket build-output/` shows zero client. Phone polls every 30 s; wall pushes go to no listeners.

**Steps:**
1. Copy `node_modules/socket.io-client/dist/socket.io.min.js` to `build-output/vendor/socket.io.min.js`.
2. In `build-output/mobile-control.html`: add `<script src="vendor/socket.io.min.js"></script>` before `mobile-control.js`. **NOTE:** verify Agent A's CSP fix (A.2) allows `script-src 'self'` to load this file — it's served from the same origin, so OK.
3. In `mobile-control.js`: after successful PIN auth (around line 110), open `const socket = io({ auth: { token } })`.
4. Subscribe to `slideshow:state` and `state` → call `refresh()` (which re-renders all tabs from the latest snapshot).
5. Subscribe to `disconnect` → halve `currentRefreshMs` so polling resumes faster while socket is down.
6. Subscribe to `connect` → reset `currentRefreshMs` to `BASE_REFRESH_MS` and call `refresh()` once.
7. Keep all existing polling code as a fallback.

**Acceptance:** Wall NEXT → phone updates <1 s. Disable Wi-Fi → phone falls back to polling. Re-enable → phone updates instantly.

---

### B.3 Tracker reset/close — 2-tap confirm

**Why:** Verified `build-output/mobile-control.js:389-411`. Tracker actions go through `guardedClick` (150 ms cooldown only). Slideshow CLOSE has the 2-tap (lines 425-458) — tracker close/reset don't.

**Steps:**
1. Extract the 2-tap logic from the CLOSE handler (lines 425-458) into a reusable helper:
   ```js
   function armBeforeFire(btn, originalLabel, confirmLabel, fireFn) { /* ... */ }
   ```
2. In the tracker wiring loop (line 390): if `action === 'close' || action === 'reset'`, wrap with `armBeforeFire(btn, originalLabel, action === 'reset' ? 'تأكيد الإعادة؟' : 'تأكيد الإغلاق؟', fireFn)`.
3. Other tracker actions (open, next, prev, set-rakahs) keep single-tap.

**Acceptance:** Tap "إعادة" → button re-labels and asks confirm. Second tap within 4 s → reset fires. Tap elsewhere within 4 s → reverts.

---

### B.4 `MITHNAH_UPDATE_FEED` — https-only

**Why:** Verified `src/main/updater/index.js:252`. Regex `/^https?:\/\//` accepts plain HTTP — MITM risk if env var is set.

**Steps:**
1. Change line 252 from `if (/^https?:\/\//.test(feed) && !/PLACEHOLDER|REPLACE_ME/.test(feed))` to:
   ```js
   const isHttps = /^https:\/\//.test(feed);
   const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(feed);
   if ((isHttps || isLoopback) && !/PLACEHOLDER|REPLACE_ME/.test(feed)) { ... }
   ```
2. Update the warning log on line 257 to mention the new constraint.

**Acceptance:** `MITHNAH_UPDATE_FEED=http://attacker.com` → ignored with warning. `https://example.com` → accepted. `http://localhost:8080` → accepted (dev).

---

### B.5 Wake Lock API for Controls tab

**Why:** Verified — no Wake Lock anywhere in `build-output/`. Phone screen sleeps mid-prayer.

**Steps:**
1. In `mobile-control.js`: add module-level `let wakeLock = null`.
2. Helper `async function requestWakeLock() { if ('wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} } }`.
3. Call `requestWakeLock()` when the Controls tab becomes active. Release (`wakeLock?.release(); wakeLock = null;`) when leaving the tab.
4. Add `visibilitychange` listener to re-request on tab return (browser auto-releases on hide).

**Acceptance:** Open Controls tab → phone screen stays on indefinitely. Switch to Library tab → screen sleeps normally.

---

### B.6 Phone-side 409 handler for GPS confirmation (paired with A.6)

**Why:** Agent A adds a 409 response when GPS handoff target is >500 km from current. Phone needs to surface the confirm dialog and re-POST.

**Steps:**
1. In `mobile-control.js`, find the `/api/location/set` POST call. On response, check status: if 409 with `requiresConfirmation: true`, show a modal/confirm: `الموقع الجديد بعد ${distanceKm} كم عن «${priorName}». تأكّد؟`.
2. If operator confirms, re-POST same body with `confirmRelocation: true` appended.
3. If decline, show toast: `تمّ إلغاء تحديث الموقع`.

**Acceptance:** Triggering a long-distance GPS handoff from phone shows confirm; confirming applies the new location; declining leaves the wall's location unchanged.

---

## Agent C — Wall renderer

**Files owned:** `src/renderer/components/Dashboard.jsx`, `src/renderer/components/DashboardFeatures.jsx`, `src/renderer/components/DuaPicker.jsx`, `src/renderer/styles.css`.

**Items (3 + 1 optional from A.7):**

| Item | Phase | Effort |
|------|-------|--------|
| C.1 Custom-dua localStorage quota handling (was 3.4) | Phase 3 | 30 min |
| C.2 Dashboard re-render — memoize children (was 3.6) | Phase 3 | 2 h |
| C.3 Default-location badge on Dashboard (was 3.8) | Phase 3 | 1 h |
| C.4 (optional) Clock-skew toast handler (pairs with A.7) | Phase 3 | 30 min |

**Total Agent C effort:** ~3.5 hours (or 4 with C.4).

**Suggested internal order:** C.1 → C.3 → C.4 → C.2.

### C.1 Custom-dua localStorage quota handling

**Why:** Verified `src/renderer/components/DuaPicker.jsx:65-71`. `saveCustomForTab` has no try/catch around `localStorage.setItem`. At 100 entries × 20 KB × 3 tabs = 6 MB worst-case → can exceed Chromium's 5 MB quota.

**Steps:**
1. Wrap `localStorage.setItem(key, JSON.stringify(list.slice(0, 100)))` in try/catch.
2. On `QuotaExceededError` (or any error): set `msg` state to `تجاوز حدّ التخزين — احذف بعض الأدعية المضافة قبل إضافة جديد`.
3. Don't roll back in-memory `customByTab` — leave the new entry so the operator can copy the text out before deleting old entries. (`saveCustomForTab` is called after `setCustomByTab` so this is automatic.)

**Acceptance:** Manually fill localStorage near quota (devtools `Application > Storage > Clear` and re-fill), try to save another dua → toast appears, app doesn't crash.

---

### C.2 Dashboard re-render — memoize children

**Why:** Verified `Dashboard.jsx:23-30`. `useClock` triggers a render every second; no `React.memo` on children, so the entire tree re-evaluates.

**Steps:**
1. Wrap these components in `React.memo`:
   - `PrayerCell` (Dashboard.jsx:245)
   - `EventStrip` (Dashboard.jsx:195)
   - `HonorifiedTitle` (Dashboard.jsx:184)
   - `AnnouncementBanner`, `RamadanCountdown`, `QiblaBadge` from `DashboardFeatures.jsx`
2. Verify prop stability — they receive string/number props, which are reference-stable across renders.
3. Optional: profile with Chrome devtools Performance tab. 30-second recording; count `commit` phases.

**Acceptance:** React profiler shows `PrayerCell` rendering only when its `time` prop changes (minute roll-over), not every second.

---

### C.3 Default-location badge on Dashboard

**Why:** Verified — `Dashboard.jsx` has no visual indicator when the operator skipped onboarding and the wall shows default Najaf prayer times. Silent wrong-location risk.

**Steps:**
1. In `Dashboard.jsx`, compute `const isDefaultLocation = config?.locationSource === null && config?.onboardingCompleted === true`.
2. When true, render a yellow badge near the masthead location label:
   ```jsx
   {isDefaultLocation && (
     <div className="masthead__default-loc-warn" role="alert">
       📍 موقع افتراضي (النجف) — اضغط F3 لضبط موقع مسجدك
     </div>
   )}
   ```
3. In `src/renderer/styles.css` add `.masthead__default-loc-warn` with warning colors: light yellow background, dark yellow border, padding, small font, fades after 30 s of operator clicking dismiss (optional — keep visible until location is set is fine).
4. Confirm `isDefaultLocation` flips to false once F3's "تحديد الموقع بـ GPS" or city pick fires (`locationSource` becomes `'gps'`/`'manual'`/etc).

**Acceptance:** Fresh install → skip onboarding → badge visible. Set location via F3 → badge disappears.

---

### C.4 Clock-skew toast handler (optional — pairs with A.7)

**Why:** Agent A's A.7 emits `app:clock-skew` IPC when system clock is >5 min off. Renderer should surface it.

**Steps:**
1. In `Dashboard.jsx`, add a `useEffect` subscribing to `window.electron?.app?.onClockSkew?.((data) => {...})`.
2. Show a toast: `ساعة الجهاز ${data.skewMs > 0 ? 'متقدّمة' : 'متأخّرة'} بـ ${Math.abs(Math.round(data.skewMs/60000))} دقيقة. أوقات الصلاة قد تكون خاطئة — اضبط ساعة ويندوز.`
3. Toast persists until operator dismisses (no auto-hide).

**Acceptance:** With system clock skewed >5 min, toast appears within seconds of launch.

**Note:** Skip this item if Agent A's A.7 is deferred — they're paired.

---

## Agent D — Docs, CI, build config

**Files owned:** `README.md`, `docs/*`, `.github/workflows/*`, `package.json`, `vite.config.js`, `build/installer.nsh`.

**Items (8):**

| Item | Phase | Effort |
|------|-------|--------|
| D.1 README — fix broken `docs/ARCHITECTURE.md` link (was 1.7) | Phase 1 | 1 min (or 1 h if writing the file) |
| D.2 Code-signing path setup (was 1.2) | Phase 1 | 0.5 day (excluding SignPath wait) |
| D.3 `engines` field in package.json (was 2.11) | Phase 2 | 5 min |
| D.4 `release.yml` — publish SHA256SUMS (was 2.12) | Phase 2 | 15 min |
| D.5 README test count 79 → 114 (was 3.1) | Phase 3 | 1 min |
| D.6 PLACEHOLDER cleanup in RELEASE.md / ROADMAP.md (was 3.2) | Phase 3 | 10 min |
| D.7 Vite 5 → 7, electron-builder 24 → 25 (was 2.13) | Phase 2 | 1 h (bundle with D.8) |
| D.8 Electron 28 → 33 upgrade (was 1.1) | Phase 1 | 1 day (smoke testing) |

**Total Agent D effort:** ~1.5 days (excluding SignPath approval wait, ~1-2 weeks calendar).

**Suggested internal order:** D.3 → D.5 → D.6 → D.1 → D.4 → D.2 → D.7 → D.8. (Small doc/config fixes first; signing setup mid-stream; Electron upgrade LAST so its smoke test exercises everyone else's merged work.)

### D.1 README — fix broken `docs/ARCHITECTURE.md` link

**Why:** Verified `ls docs/ARCHITECTURE.md` returns "No such file". `README.md:93` references it. First impression breakage.

**Two options:**

**A. Remove the link:** change `README.md:93` to drop the "See ..." sentence; the inline bullets below already describe the architecture.

**B. Write the file:** distill the Architecture + Data flow + Key files sections from `PROJECT_BRIEF.md` into a clean ~150-line `docs/ARCHITECTURE.md`. Keep the link, the document now resolves.

**Recommendation:** B if you have an hour. A otherwise.

---

### D.2 Code-signing path setup

**Why:** Verified — `package.json#build.win` has no `certificateFile`. SmartScreen "Unknown publisher" on every install.

**Steps:**
1. Open `docs/SIGNPATH-APPLICATION.md`. Fill all `<PLACEHOLDER>` fields with real project values (owner, repo URL, purpose, expected install count).
2. Submit via signpath.io/free-open-source. Wait for approval (typically 1-2 weeks).
3. On approval, integrate the signing step in `.github/workflows/release.yml`:
   - After `npm run build` (current line 44) but before `npx electron-builder --publish always` (line 49): add the SignPath signing step per SignPath's GitHub Actions docs.
   - Add `SIGNPATH_API_TOKEN` to GitHub repo secrets.
4. In `package.json#build.win`: add the SignPath integration block.
5. Test by tagging `v0.1.7-test`, confirming installer in a clean VM shows the correct publisher.

**Acceptance:** Fresh install on Windows VM shows publisher name (not "Unknown"). SmartScreen does not appear.

**Alternative if SignPath delayed:** scope beta distribution to a closed test group; add a clear Arabic warning in `docs/FOR-MOSQUE-OPERATORS.md` explaining the SmartScreen workaround.

---

### D.3 `engines` field in package.json

**Why:** Verified — no `engines` field. CI uses Node 22 but contributors aren't pinned.

**Steps:**
1. In `package.json`, after `"private": true,` add:
   ```json
   "engines": {
     "node": ">=20.10.0 <23"
   },
   ```

**Acceptance:** `npm install` on Node 18 warns. Lockfile unchanged.

---

### D.4 `release.yml` — publish SHA256SUMS

**Why:** Verified `.github/workflows/release.yml`. No artifact integrity step. Adding SHA256SUMS lets cautious operators verify downloads.

**Steps:**
1. In `.github/workflows/release.yml`, after the `electron-builder` step (current lines 46-49), add:
   ```yaml
   - name: Compute SHA256 of installer artifacts
     shell: pwsh
     run: |
       Get-ChildItem dist/electron-builder/*.exe |
         ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash, $_.Name } |
         Out-File -FilePath dist/electron-builder/SHA256SUMS.txt -Encoding utf8
   ```
2. Verify electron-builder's `--publish always` (line 49) uploads SHA256SUMS.txt alongside the .exe — it uploads everything in `dist/electron-builder/`, so this should be automatic.

**Acceptance:** Next release on GitHub shows a `SHA256SUMS.txt` asset; its content matches `Get-FileHash` of the .exe.

---

### D.5 README test count 79 → 114

**Why:** Verified — `README.md:70` says "Seventy-nine tests cover...". Actual count is 114.

**Steps:**
1. Change line 70 from "Seventy-nine tests" to "One hundred and fourteen tests".

**Acceptance:** No further action.

---

### D.6 PLACEHOLDER cleanup in RELEASE.md / ROADMAP.md

**Why:** Verified — `docs/RELEASE.md:10` tells operator to replace `REPLACE_ME_BEFORE_RELEASE` (already done). `docs/ROADMAP.md:8,13` mentions firebase removal (firebase not in deps) and PLACEHOLDER replacement (done).

**Steps:**
1. In `docs/RELEASE.md`: remove the "Set the real GitHub username" step (around line 10). Renumber subsequent steps if needed.
2. In `docs/ROADMAP.md`: delete the "Evaluate firebase removal" bullet (lines 8-12) and the "Replace placeholder" bullet (lines 13-14).
3. `grep -rn "REPLACE_ME\|<PLACEHOLDER" docs/` — confirm no stale references remain (the matches in `src/main/updater/index.js` are legitimate defensive guards, leave alone).

**Acceptance:** docs accurately reflect the current state of package.json.

---

### D.7 Vite 5 → 7, electron-builder 24 → 25

**Why:** One major behind. Pair with D.8.

**Steps:**
1. In `package.json`: bump `"vite": "5.4.21"` → `"vite": "^7.x"`. Bump `"@vitejs/plugin-react": "4.3.4"` → `"^5.x"`. Bump `"electron-builder": "24.13.3"` → `"^25.x"`.
2. `npm install`.
3. `npm run build:renderer` — verify build still completes.
4. `npm run dev` — verify HMR still works (Vite 7 changed default dev-server port behavior; check `vite.config.js`).
5. `npm test`.

**Acceptance:** `npm run dist:win` (will be tested in D.8 too) produces a working installer.

---

### D.8 Electron 28 → 33 upgrade

**Why:** Verified — Electron 28 reached EOL mid-2024. Currently 33+. Public deployment with unsigned + outdated runtime + auto-update is a security liability.

**Steps:**
1. **Coordinate timing:** wait until Agents A/B/C have merged their changes (D.8 is a smoke test for everyone's work on the new Electron baseline).
2. In `package.json`: bump `"electron": "28.3.3"` → `"electron": "^33.x"` (latest stable in 33 LTS).
3. `npm install`.
4. `npm test` — 114/114 expected.
5. `npm run dev` — verify wall renders, all F-keys work, IPC succeeds, network-policy still intercepts external URLs.
6. Verify preload `contextBridge` still exposes `window.electron.*`.
7. Verify session.webRequest hooks still fire (test by trying to load `https://example.com` from devtools — should be blocked).
8. Verify slideshow renders (DOM measurer + 2-pass rebalance still works).
9. `npm run dist:win`. Install in a clean Windows VM. Open. Verify version, prayer times, F-keys, pairing, GPS handoff, kiosk lock.
10. If auto-update is configured: tag a temporary `v0.1.7-test`, push, install older 0.1.6, watch the updater detect + offer.

**Acceptance:** Full feature parity with current Electron 28 build. No regressions in slideshow, IPC, network-policy, or mobile-control.

**Effort:** ~1 day (mostly smoke testing). **Risk:** Medium — Electron major upgrades occasionally surface preload sandbox quirks.

---

## Out of scope

These items remain unverified or are explicit feature requests, not defects:

### Doctrinal review of Hijri event dates — EXTERNAL REVIEW required

I cannot authoritatively verify Shia doctrinal calendar dates. Forward `src/main/shia-content/hijri-events.js` to a knowledgeable scholar for review. The following entries have competing traditions:

- `imam-hadi-shahadah` — Dhul-Hijjah 3 vs. Rajab 3 vs. Jumada al-Akhirah 25
- `masumah-shahadah` — Dhul-Qa'dah 10 vs. Rabi al-Akhirah 12
- `imam-sajjad-birth` — Shaban 5 vs. Jumada al-Awwal 15

No code fix proposed. Action: send to scholar.

### Adhan audio playback

Already on `docs/ROADMAP.md`. Defer to v0.3+.

### Imsak / last-isha indicators

Feature request, not a defect. Open a separate issue for v0.2.

### Arabic-only mobile-control UI (was 3.3)

I confirmed `mobile-control.html` is Arabic-only. Decision deferred — recommendation in previous summary: defer to v0.2 unless beta audience is specifically diaspora. Re-prioritize and assign to Agent B if you decide to do it now.

---

## How to use this plan

1. **Spin up 4 agents** in parallel; hand each its agent letter (A, B, C, D) and the matching section of this document.
2. **Give each agent the same baseline rules:** keep `npm test` green; don't touch files outside your ownership list; one commit per item with the message format `fix(area): <one sentence>  [§X.Y]`.
3. **Merge order:** A, B, C can merge in any order. D merges its items EXCEPT D.8 first; D.8 merges last for the smoke-test pass.
4. **Cross-agent coordination points:** A.6 ↔ B.6 (GPS confirmation contract); A.7 ↔ C.4 (clock-skew IPC contract). Both contracts are documented inline above; no live coordination needed.
5. **Total estimated effort:** Agent A ~13 h, Agent B ~6.5 h, Agent C ~3.5 h, Agent D ~1.5 days. With 4 agents in parallel, calendar time = max(A, D) ≈ 2 days + SignPath wait.

---

# Round 2 — Elderly UX Hardening (2026-05-26)

_Source: `UX_CX_ELDERLY.md` + `VERIFICATION.md`. 14 problems verified from 7 angles (window.confirm:701 type bugs, letter-spacing-on-Arabic typography, touch targets below WCAG, religious text at 14px, silent data loss). All items have explicit `file:line` evidence._

## Ownership extension for this round

To absorb the wall-renderer typography work without breaking the parallel-execution rule, **Agent C's file ownership is extended** to add:
- `src/renderer/components/Ornaments.jsx` (was unowned)
- `src/renderer/components/SlideshowOverlay.jsx` (was unowned)

No other agent touches these files, so the no-conflict guarantee holds.

## Round 2 distribution

| Agent | New items | Files (additions only) | Extra effort |
|-------|-----------|------------------------|--------------|
| **A** | 1 (L-1) | (no new files — uses existing SettingsOverlay.jsx) | ~20 min |
| **B** | 2 (M-1, M-2) | (no new files — uses existing mobile-control.html) | ~20 min |
| **C** | 11 (#1, #2, #3, #4, #5, #6, #7, #8, #9, L-3, L-6) | +Ornaments.jsx, +SlideshowOverlay.jsx | ~2 h |
| **D** | 0 | — | 0 |

**Total Round 2 effort:** ~2.5 hours across all 4 agents. Can run in parallel with Round 1.

---

## Agent A — Round 2 addition (1 item)

### A.12 — PIN gate missing length hint

**Why:** Verified `src/renderer/components/SettingsOverlay.jsx:446-459`. PIN-unlock gate has `pattern="\d{4,8}"` enforcing 4-8 digits but no visible hint. Same overlay's PIN-SET flow (line 1423) has "٤–٨ أرقام" subtitle — the unlock gate was missed.

**Steps:**
1. In `SettingsOverlay.jsx` around line 447, after the `help-overlay__subtitle` div, add a hint paragraph between subtitle and form:
   ```jsx
   <div className="settings__hint" style={{ marginBottom: 16 }}>٤ إلى ٨ أرقام</div>
   ```

**Acceptance:** PIN gate now shows "٤ إلى ٨ أرقام" hint visible at all times. User who tries 3 digits sees the constraint upfront instead of silent form-rejection.

---

## Agent B — Round 2 additions (2 items)

### B.7 — Mobile: remove letter-spacing from Arabic text (5 styles)

**Why:** Verified `build-output/mobile-control.html`. Arabic is a connected script; letter-spacing breaks ligatures, rendering "الصلاة" as "ا ل ص ل ا ة" visually. Five styles apply ≥ 0.08em letter-spacing to Arabic content:

| Line | Selector | Spacing | Content |
|------|----------|---------|---------|
| 314 | `.card__eyebrow` | 0.2em + uppercase | Arabic eyebrow text |
| 333 | `.hero__label` | 0.18em + uppercase | "الصلاة القادمة" |
| 398 | `.event__kind` | 0.15em + uppercase | "شهادة/ولادة/عيد" |
| 510 | `.lib__count` | 0.08em | "X عنصراً" |
| 562 | `.set-row__label` | 0.08em | Arabic field labels |

**Steps:**
1. For each of the 5 selectors above, remove the `letter-spacing` property.
2. Remove `text-transform: uppercase` from the same selectors — it's a no-op on Arabic but signals copied-from-Latin patterns.

**Acceptance:** Visual check on iPhone SE viewport (320px): "الصلاة القادمة" reads as a connected word, not as separated letters.

---

### B.8 — Mobile: nav tab labels enlarge (11-15px → 15-19px)

**Why:** Verified `build-output/mobile-control.html:273`. `.nav__btn` uses `font-size: clamp(0.7rem, 3vw, 0.85rem)` against root `clamp(16px, 4.1vw, 18px)` — final size is **11.2-15.3px**. Below 16px elderly threshold. Affects all 4 bottom-nav labels ("الرئيسية", "التحكم", "المكتبة", "الإعدادات").

**Steps:**
1. Change line 273 from `font-size: clamp(0.7rem, 3vw, 0.85rem);` to `font-size: clamp(0.95rem, 3.5vw, 1.05rem);`.
2. (Optional) If text+icon now overflows `min-height: 68px`, reduce icon size on line 279 from 22px to 20px.

**Acceptance:** On iPhone SE (root font 16px), nav labels render ≥ 15px. Layout remains within `min-height: 68px`.

---

## Agent C — Round 2 additions (11 items)

**Ownership extension:** Agent C also owns `Ornaments.jsx` and `SlideshowOverlay.jsx` for this round.

**Suggested internal order:** C.5 → C.6 → C.7 → C.8 → C.9 → C.10 → C.11 → C.12 → C.13 → C.14 → C.15. (CSS-only fixes first since they're isolated and quick.)

---

### C.5 — DuaPicker: replace `window.confirm` with inline modal

**Why:** Verified `src/renderer/components/DuaPicker.jsx:701`. `window.confirm('حذف هذا الدعاء؟')` returns `null` silently in packaged Electron kiosk mode (documented in `SettingsOverlay.jsx:301`, `Dashboard.jsx:271`). Result: tapping 🗑 on a custom dua does nothing in production. The team's own pattern (CustomDuaEditor in same file) is the model.

**Steps:**
1. Add state near line 183: `const [confirmDelete, setConfirmDelete] = useState(null);`
2. Change line 701 onClick to: `onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: item.id, title: item.title_ar }); }}`.
3. After the `editor && ...` JSX block (around line 750), add an inline-modal that renders when `confirmDelete !== null`:
   - Title: `حذف ${singularLabel}`
   - Body: shows `confirmDelete.title`
   - Buttons: "نعم، احذف" (danger) + "إلغاء" (autoFocus, primary)
   - On confirm: `deleteCustomDua(confirmDelete.id); setConfirmDelete(null);`
   - On cancel/Esc/bg-click: `setConfirmDelete(null);`

**Acceptance:** In packaged build, tapping 🗑 opens a visible inline modal. Esc / "إلغاء" preserves the dua. "نعم، احذف" removes it.

---

### C.6 — Ornaments: raise `SalawatLine` size='sm' floor from 14px to 18px

**Why:** Verified `src/renderer/components/Ornaments.jsx:135`. Inline `style={{ fontSize }}` where `fontSize = 14` for size='sm' — used in 6 overlays (DuaPicker, HelpOverlay, OnboardingOverlay, PrayerTracker, SettingsOverlay, SlideshowOverlay). Religious text "اللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّد" rendering at 14px. Inline style means `[data-large-text]` cannot override.

**Steps:**
1. In `Ornaments.jsx:135`, change `const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 14;` to:
   ```js
   const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 18;
   ```
2. (Optional) Bump `gap: 14` on line 143 to `gap: 18` to keep visual rhythm with new font.

**Acceptance:** DevTools shows SalawatLine size='sm' rendering at 18px. All 6 call sites benefit.

---

### C.7 — Dashboard + Slideshow: enlarge `AlayhiSalam` call sites

**Why:** Verified. AlayhiSalam (religious mark "ع" inside circle) currently passed `size=9` at `Dashboard.jsx:246`, `size=11` at `Dashboard.jsx:216`, `size=10` at `SlideshowOverlay.jsx:506`. Result: 14-18px diameter circle with 9-11px character — invisible at hall distance. **Visual test required** because the component uses `lineHeight: ${size * 1.5}px` which affects surrounding flex layout.

**Steps:**
1. In `Dashboard.jsx:216` change `starSize={11}` (in EventStrip event-today branch) to `starSize={14}`.
2. In `Dashboard.jsx:246` change `starSize={9}` (in EventStrip upcoming branch) to `starSize={12}`.
3. In `SlideshowOverlay.jsx:506` change `<AlayhiSalam size={10} />` to `<AlayhiSalam size={14} />`.
4. **Manual visual test:** Open Dashboard with event-strip containing an imam name; confirm the (ع) is now readable from 1 meter and layout doesn't break (no overflow, no awkward line-height bumps).

**Acceptance:** All three call sites render (ع) with diameter ≥ 22px. EventStrip flex row still fits in its container.

---

### C.8 — styles.css: remove letter-spacing from 5 Arabic-text selectors

**Why:** Verified `src/renderer/styles.css`. Arabic connected-script breaks under letter-spacing. Five selectors apply ≥ 0.18em to Arabic content. (Note: `.pin-badge__label` styles exist but the pin-badge component is dead — confirmed via grep — so its letter-spacing is excluded.)

| Line | Selector | Spacing | Content |
|------|----------|---------|---------|
| 390 | `.next__label` | 0.18em + uppercase | "الصلاة القادمة" |
| 499 | `.event-strip__countdown-kind` | 0.20em + uppercase | "المناسبة القادمة" |
| 528 | `.event-strip__kind` | 0.20em + uppercase | "شهادة/ولادة/عيد" |
| 711 | `.slideshow__section-marker-label` | 0.32em | Dua section headings |
| 2265 | `.prayer-tracker__prayer-label` | 0.28em + uppercase | "صلاة" |

**Steps:**
1. For each of the 5 selectors above, remove the `letter-spacing` declaration.
2. Remove `text-transform: uppercase` from the same selectors (no-op on Arabic).

**Acceptance:** Visual check on Dashboard (event strip, next-prayer label) and Slideshow (section headings): Arabic words read as connected.

---

### C.9 — styles.css: raise `.event-strip__countdown-kind` font-size floor (10px → 16px)

**Why:** Verified `styles.css:497`. `font-size: clamp(10px, 0.85vw, 13px)` renders "المناسبة القادمة" at 10-13px. No `[data-large-text]` override exists for this class (verified by grep). Context (a 26-40px countdown sits next to it) softens but doesn't fix the eyebrow.

**Steps:**
1. Change line 497 from `font-size: clamp(10px, 0.85vw, 13px);` to:
   ```css
   font-size: clamp(16px, 1.2vw, 22px);
   ```

**Acceptance:** At 1024px viewport, "المناسبة القادمة" renders ≥ 16px instead of 10px.

---

### C.10 — styles.css: enlarge `.dua-picker__edit` and `.dua-picker__delete` (40×40 → 48×48)

**Why:** Verified `styles.css:2015`. Edit/delete buttons on custom-dua cards default to 40×40px, below WCAG 2.1 AA (44×44). Default-on `[data-large-text]` raises to 44×44 (`styles.css:3690-3691`) but only at the floor. The two buttons sit 8px apart (60-12-40=8) — high mis-tap risk for trembling hands.

**Steps:**
1. Change line 2015 from `width: 40px; height: 40px;` to:
   ```css
   width: 48px; height: 48px;
   ```
2. Adjust spacing — line 2026 has `.dua-picker__edit { inset-inline-end: 60px; }`. Change to `inset-inline-end: 72px;` to maintain visual gap.
3. Update the largeText override on lines 3690-3691 to `width: 56px; height: 56px;`.
4. Update the offset comment on line 1800 (`padding-inline-end: 112px`) to `padding-inline-end: 128px` to match the new total inset (12+48+16+48+4 = 128px).

**Acceptance:** Buttons render at 48×48 (default) and 56×56 (largeText). Visible gap remains between ✎ and 🗑.

---

### C.11 — styles.css: enlarge `.imam-list-editor__remove` (32×32 → 48×48)

**Why:** Verified `styles.css:3552-3553`. Default 32×32 — well below WCAG 44. `[data-large-text]` override at line 3729 raises to 40×40 — **still below WCAG**. Only touch target in the audit where even largeText doesn't reach WCAG.

**Steps:**
1. Change line 3552-3553 from `width: 32px; height: 32px;` to:
   ```css
   width: 48px; height: 48px;
   ```
2. Update the largeText override on line 3729 to `width: 56px; height: 56px; font-size: 22px;`.

**Acceptance:** Remove button renders at 48×48 (default) and 56×56 (largeText). Both meet WCAG.

---

### C.12 — DuaPicker: textarea maxLength + character counter

**Why:** Verified `src/renderer/components/DuaPicker.jsx:351-352, 788-795`. `saveCustomDua` silently truncates body to 20,000 chars via `slice(0, 20000)`. The `<textarea>` has no `maxLength`. A 25,000-char ziyarah (e.g., long Ashura zeerah with adhkar) gets clipped without any UI warning.

**Steps:**
1. In `DuaPicker.jsx` around line 788, add `maxLength={20000}` to the textarea element.
2. Below the textarea, add a live character counter:
   ```jsx
   <div className="inline-modal__hint" style={{ textAlign: 'end', fontSize: 14, color: body.length >= 18000 ? '#e89898' : 'var(--m-text-muted)' }}>
     {toArabicDigits(body.length)} / {toArabicDigits(20000)}
   </div>
   ```
3. Verify the existing `saveCustomDua` slice on line 352 still acts as a defensive cap (don't remove it).

**Acceptance:** Pasting 25,000-char text into the textarea: input stops at 20,000, counter turns red at 18,000+, save preserves all 20,000 chars (no further loss).

---

### C.13 — styles.css: enlarge `.settings__adjust-btn` (40×40 → 48×48)

**Why:** Verified `styles.css:2727-2728`. Prayer-time minute-adjustment `−`/`+` buttons render at 40×40px. No `[data-large-text]` override exists for this class (verified by grep). F3 → الصلاة tab shows 6 prayers × 2 buttons = 12 small buttons on one screen — high cumulative mis-tap risk.

**Steps:**
1. Change line 2727-2728 from `width: 40px; height: 40px;` to:
   ```css
   width: 48px; height: 48px;
   ```
2. Add a new override in the `[data-large-text]` section (around line 3720): `html[data-large-text="true"] .settings__adjust-btn { width: 56px; height: 56px; font-size: 22px; }`.

**Acceptance:** Adjust buttons render at 48×48 default, 56×56 in largeText. Adjacent input width (60px) still fits in the stepper container.

---

### C.14 — styles.css: enlarge `.dua-picker__welcome-close` (36×36 → 44×44)

**Why:** Verified `styles.css:1871-1875`. Welcome banner's × close button at 36×36, below WCAG 44. The welcome appears once per device — low impact frequency but high mis-tap risk for elderly's only-once interaction.

**Steps:**
1. Change line 1873 from `width: 36px; height: 36px;` to:
   ```css
   width: 44px; height: 44px;
   ```

**Acceptance:** Welcome banner close button renders at 44×44. Bordered area still fits inside the banner's padding.

---

### C.15 — Dashboard: reverse kiosk-unlock modal visual hierarchy

**Why:** Verified `src/renderer/components/Dashboard.jsx:562-573`. Destructive action "نعم، إيقاف" wears `--primary` style (gold, prominent). Safe action "إلغاء" wears ghost style. `autoFocus` is correctly on cancel (Enter key safe), but a mouse click on the visually dominant button shuts the kiosk. Same Dashboard.jsx file as C.7 — coordinate edits.

**Steps:**
1. In `Dashboard.jsx` around line 562-573, swap the class assignments:
   - "نعم، إيقاف" button: remove `inline-modal__btn--primary`, add a new class `inline-modal__btn--danger`.
   - "إلغاء" button: add `inline-modal__btn--primary`. Keep `autoFocus`.
2. In `styles.css` (extend existing `.inline-modal__btn--danger` if any, otherwise add):
   ```css
   .inline-modal__btn--danger {
     background: rgba(178, 86, 86, 0.14);
     border-color: rgba(178, 86, 86, 0.50);
     color: #ffb3a6;
   }
   .inline-modal__btn--danger:hover { background: rgba(178, 86, 86, 0.24); }
   ```

**Acceptance:** Kiosk-unlock modal: gold "إلغاء" button on the inline-end, muted-red "نعم، إيقاف" on the inline-start. autoFocus + Enter-key still triggers Cancel.

---

## Round 2 baseline expectations

Same as Round 1:
- `npm test` → 114/114 pass.
- `npm run build:renderer` → succeeds.
- One commit per item: `fix(ux-elderly): <one sentence>  [§C.5]` etc.

## Round 2 manual test plan (mosque-grade)

Before declaring Round 2 done, manually exercise:

1. **C.5**: Build packaged app (`npm run dist:win`), install in clean VM, add a custom dua, tap 🗑 → confirm modal appears with "نعم، احذف" / "إلغاء". Both paths work.
2. **C.6**: Open SettingsOverlay, scroll to Salawat footer, inspect — fontSize must be 18px (not 14).
3. **C.7**: Trigger an event-strip with an Imam name (e.g., shahadah event in upcoming) — (ع) must be readable from 1m.
4. **C.8**: Open Dashboard at 1280×800 — "الصلاة القادمة" reads as continuous Arabic, no character gaps.
5. **C.9**: Resize window to 1024×768 — "المناسبة القادمة" eyebrow renders at 16px minimum.
6. **C.10**: With largeText OFF (toggle in F3 → متقدّم), open DuaPicker, add a custom dua, hover ✎ and 🗑 — both 48×48, clear gap between them.
7. **C.11**: F3 → الأساسية → قائمة الأئمة, add 3 imams, tap ✕ on middle — touch target feels at least 1.2× larger than before.
8. **C.12**: Paste 25,000-char text into custom-dua editor — input stops at 20,000, counter goes red at 18,000.
9. **C.13**: F3 → الصلاة → tap +/- on Fajr adjustment 10 times rapidly — no mis-taps, larger target feels obvious.
10. **C.14**: Clear localStorage `mithnah:dua-picker:welcomed`, reopen F4 → welcome banner shows, × is 44×44.
11. **C.15**: FloatingMenu → "إغلاق التطبيق" → modal: "إلغاء" is the gold/primary button, "نعم، إيقاف" is muted red. Pressing Enter triggers Cancel.
12. **A.12**: F3 with PIN gate active → see "٤ إلى ٨ أرقام" hint visible before typing.
13. **B.7**: Mobile UI on iPhone SE viewport → "الصلاة القادمة" reads as connected.
14. **B.8**: Mobile bottom nav labels readable from 40cm.

## Cross-agent coordination for Round 2

No cross-agent contracts in Round 2 — every item is self-contained. Agents A, B, C can land their Round 2 items in any order, independently of Round 1 progress.

**Round 1 + Round 2 merge order recommendation:**
- A's Round 1 + Round 2 (single PR per agent is fine).
- B's Round 1 + Round 2.
- C's Round 1 + Round 2 — **CSS-only Round 2 items first** (C.6 through C.14), then JSX items (C.5, C.7, C.12, C.15). CSS edits won't fight with Round 1's `Dashboard.jsx` work.
- D's Round 1 last (D.8 Electron upgrade) — smoke-tests everyone's merged work.

## Round 2 dismissed items (do not implement)

These were earlier flagged but verified against code to be either dead, recommendations rather than bugs, or already mitigated. Listed here for traceability:

| Item | Reason dismissed |
|------|------------------|
| `.pin-badge__label` letter-spacing | `.pin-badge` className unused in any JSX — CSS is dead code |
| Mobile `.lib__tab` min-height 44 | Already meets WCAG 2.1 AA; NN/g 56px is a recommendation, not a standard |
| Slideshow hints RTL "reversal" | Re-verified; "→ السابق · التالي ←" already matches `ArrowLeft=NEXT` handler in RTL |
| Loading state plain text in DuaPicker | Polish only; tabCache makes second-open instant; first-open <1s on local IPC |
| aria-live on countdown every second | `polite` semantics + wall kiosks rarely have SR users → impact ~0 in practice |
| Search empty state no recovery button | Polish only; user can clear the input themselves |
| Touch targets 36×36 / 40×40 in some places | Already covered (C.10, C.11, C.14) where actionable |
