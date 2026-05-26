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

