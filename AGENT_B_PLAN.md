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

