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
