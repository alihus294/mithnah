# Mithnah Comprehensive Review
_Generated: 2026-05-02 · Reviewing commit `a38d450` (one ahead of `origin/main`, plus two uncommitted edits)_

## Executive summary

- **Overall health:** Healthy. The codebase is well-organised, tightly scoped, defensively coded (frame-guard, scrypt PIN, atomic file writes, fail-closed size caps), and free of TODO/FIXME debt. The audit surfaced ~110 findings, but only **3 are Critical** and the rest are tractable polish/a11y work — not architecture problems.
- **Top 3 strengths (with evidence):**
  1. **Renderer error layering is consistently designed** — `friendlyError()` (`src/renderer/lib/errors.js`) plus per-overlay `ErrorBoundary` plus `unwrap()` envelope (`src/renderer/lib/ipc.js:12-18`) means most failures degrade gracefully even where the upstream IPC layer is sloppy.
  2. **Memory hygiene is excellent** — every `addEventListener` / `setInterval` / `ipcRenderer.on` audited has matching cleanup (`Dashboard.jsx:40,255`, `useFocusTrap.js:99`, `useIdleVisibility.js:24`, etc.). 24/7 wall operation will not leak.
  3. **Security defaults are solid for a desktop app** — `nodeIntegration:false`, `contextIsolation:true`, `webSecurity:true`, tight CSP (`network-policy.js:149-174`), scrypt-hashed PIN with rate-limit + lockout, fail-closed 256 KB / 1 MB caps on the two JSON stores.
- **Top 5 issues (severity-ordered):**
  1. **F-001 / Critical** — Kiosk-quit confirm modal has no focus trap, no Esc handler, no autoFocus; a keyboard operator can Tab into the destructive "نعم، إيقاف" button (D4-01).
  2. **F-002 / Critical** — `prefers-reduced-motion` is not honored anywhere; 18 `@keyframes` and ~44 `transition`/`animation` rules including infinite pulses on a 24/7 wall display (D1-03, D4-11).
  3. **F-003 / High** — Slideshow root has `aria-live="polite"`, so SRs read every page transition's full Arabic body — minutes of speech queued per Space-press during a long taqib (D4-06).
  4. **F-004 / High** — Bg-click on Settings overlay discards unsaved input with no "unsaved changes?" guard (D2-07).
  5. **F-005 / High** — PIN/QR pairing card is locked behind the Settings PIN gate, so an operator who forgot the mobile PIN cannot recover without disabling the settings PIN (D3-08).
- **Recommended next 1–3 actions:** (1) one-evening **a11y emergency pass** (focus traps + reduced-motion + aria-live fix + PrayerTracker `role` swap — items #1, #2, #3 above plus D4-04, D4-07, D4-08, D4-09); (2) one-evening **docs reality alignment** (CHANGELOG renumber, OPERATORS.md `OWNER` placeholder, stale ROADMAP entries — D7-06, D7-15, D7-16, D7-17, D7-26, D7-27); (3) **pairing discoverability fix** — render `<PinBadge>` first-run or expose unauthenticated "show pairing" path (#5 above, D2-18, D2-19).

## Methodology

Seven subagents reviewed in parallel (one per dimension): design system, UX per surface, behavior/flow, accessibility, content, code-affects-UX, documentation. Each read only the files in its scope and returned findings with file:line evidence. The main reviewer (this synthesis) holds only the project brief, the design intent doc (`docs/DESIGN-PROMPT.md`), and the seven subagent reports. No raw file contents were paged into the synthesis context.

**What was reviewed:** the full `src/renderer/`, `src/main/`, `build-output/mobile-control.{html,js}`, `build-output/vendor/mithnah-design.css`, all top-level docs, `package.json`, last 30 git commits, the operator manual.

**What was NOT reviewed:** religious-doctrine correctness (out of scope by user policy — flagged with `[doctrinal-review]` for human decision); the actual rendered UI (no `npm install`, no app run); full `package-lock.json` (only spot-greps for specific dependencies); SignPath signing pipeline; performance under real load (no profiling).

**Scoring:** subagent severities re-harmonised against the user's strict rubric. CSS-budget overruns and token-doc drift downgraded to Medium because the brief explicitly permits the code to deviate from the design plan. CHANGELOG version mismatch kept at High (misleads downstream readers but not data-loss).

**Doctrinal items:** Two findings (D5-03 use of `ﷺ` glyph, D5-04 hadith citation chain) require the human to verify — see Open Questions and Appendix C.

---

## 1. Design system

CSS files total **136.7 KB** (`build-output/vendor/mithnah-design.css` 9.2 KB + `src/renderer/styles.css` 127.5 KB), against the DESIGN-PROMPT 20 KB budget. Per the user's policy this is a flagged deviation, not a failure — but the bulk is in `styles.css` (3,739 lines) and contains substantial duplication in the `large-text` rules. Token coverage is good in the abstract (588 `var(--m-*)` uses, 19 hardcoded hex justified for blank-screen `#000`, error reds, and a few brights), but **the shipped values diverge from the DESIGN-PROMPT spec** on nearly every primary token (D1-02): the doc says `--m-bg-base: #0f1e20` but the file uses `oklch(0.24 0.035 180)` (~`#092520`), `--m-text-primary` is `#f5ecd2` not `#f0ebe0`, fonts are Aref Ruqaa / Reem Kufi / Inter not Changa / Tajawal / Be Vietnam Pro. There is no `prefers-reduced-motion` block anywhere in the renderer CSS despite 18 keyframe animations including infinite pulses (D1-03 / D4-11 — F-002). Spacing has two parallel scales (`--m-space-1..9` in tokens + `--m-space-xs..3xl` redefined in styles.css) and ~40 off-scale `padding` values (5/7/14/22/26/30 px). `--m-text-faint` lands at exactly 4.80:1 on the dark base — passes AA-normal by margin but fails AAA. Typography is mostly clean: `font-feature-settings:'tnum'` correctly applied to clock/countdown/cell digits; line-height ≥ 1.7 only present on 4 selectors though. **Net assessment:** the system *exists* and is mostly enforced — what's missing is reduced-motion, the spacing-scale unification, and reconciliation with the design-intent doc.

## 2. UX per surface

### 2.1 Wall Ambient (`Dashboard.jsx`)

The "clock + next-prayer side-by-side feels cramped" complaint baked into DESIGN-PROMPT is **stale** — `Dashboard.jsx:418-445` already renders them as a vertical stack inside `.dashboard__clock-zone` (D2-01). The wall correctly carries no operator chrome by default. Real issues are downstream of Dashboard: the FloatingMenu trigger fades after 4s leaving no visible entry point to settings, and the only `<HelpHint />` "always-visible ؟ button" required by DESIGN-PROMPT screen 4 is **defined but never imported** (D2-02).

### 2.2 Wall Slideshow (`SlideshowOverlay.jsx`)

Strong functional layer (DOM-measured pagination works, Esc + close button + phone CLOSE all wired). The chrome auto-hides at 3s/4s idle (`SlideshowOverlay.jsx:144,152`) — too aggressive vs the codebase's own `UndoToast` 15s benchmark for elderly readers (D2-04). Font-control glyphs `ﺍ-` / `ﺍ+` use isolated-form Arabic which renders as garbled glyphs to most users, with `aria-label` as the only fallback (D2-05). The slideshow phone counter desyncs when the wall paginates locally (D3-05) — the phone shows base slide N/M, the wall shows sub-page X of N. The slideshow root carries `aria-live="polite"` causing screen-reader spam on every page transition (D4-06 — F-003).

### 2.3 Operator Settings (`SettingsOverlay.jsx`, `ImamListEditor.jsx`)

The 1422-line megaform has been broken into 4 tabs (الأساسية / الصلاة / الموقع / متقدّم) with an always-visible "القيم الحاليّة" summary — a real recovery from the prior monolith. **Two High findings here:** bg-click closes the entire overlay, silently discarding unsaved input from any non-`onBlur`-committed field (D2-07 — F-004); the `Field` wrapper at L133-141 renders `<label>` without `htmlFor`, so screen readers hear "edit text" / "combo box" with no label association (D4-02). The `useFocusTrap` hook is bypassed on the PIN-gate and skeleton states because the root `<div>` lacks `ref={containerRef}` — Tab silently does nothing on those screens (D4-09). Status messages render without `role="status"` / `aria-live`, so SRs get zero feedback after every save (D4-03). The location tab stacks four primary actions equally (D2-09); the close-button microcopy varies between `إغلاق · Esc` and `إلغاء · Esc` (D2-10).

### 2.4 FloatingMenu (`FloatingMenu.jsx`)

Single 4-item menu with strong primary action (gold-tinted "الإعدادات"). Ironically the trigger fades on 4s idle (D2-12) — the *only* visible entry point on a passive wall vanishes before an elderly caretaker walking up to the display can reach the mouse. Exit-app dispatches an event with no toast feedback (D2-13).

### 2.5 Phone remote (`build-output/mobile-control.{html,js}`)

Strongest surface in the app. Auth → 4-tab SPA, 44px hit targets, 16px input floor (no iOS zoom), focus-visible rings, 401→re-auth, 429+lockout countdown. Two real frictions: the slideshow CLOSE button has no confirm and a spam-tap kills a dua mid-recitation (D2-14); the Settings tab "show PIN" button is the only interactive control with no button styling (D2-15). 429 lockout text shows `بعد ٩٠٠ ثانية` instead of "15 دقيقة" — confusing for elderly users (D3-09). Phone Settings tab cannot change calculation method (`MOBILE_EDITABLE_FIELDS` excludes it — `index.js:695-701`) and the read-only field gives no hint why (D3-04). Phone polls `/api/phone-dashboard` every 30s rather than subscribing to the socket's `config-changed` event, so wall-side edits take up to 30s to appear on the phone (D3-19).

### 2.6 PIN / Pairing

**Significant gap.** DESIGN-PROMPT specifies a `.pin-badge` always-visible top-left card; CSS exists (`styles.css:951-1009`) plus a reserved z-index (`--m-z-pin-badge: 86`); **no JSX uses it** (D2-18). Pairing info exists only in `SettingsOverlay.jsx:1300-1322` ("الاتصال من الجوال" card in the متقدّم tab, last of 4) — and that entire overlay sits behind the optional Settings PIN gate. So an operator who set the Settings PIN, then forgot the mobile PIN, must enter the Settings PIN to look up the mobile PIN — circular discoverability (D3-08, D2-19 — F-005). When the LAN IP changes, `emitRemoteControlStatus` re-pushes a new QR but SettingsOverlay doesn't subscribe to `remote-control:status` events so a F3-open operator sees a stale QR through a Wi-Fi switch (D3-10).

## 3. Behavior & flow

The five traced flows (method change, slideshow open/close, phone pairing, network-toggle round-trip, schema migration) all execute correctly end-to-end. The risks live in feedback and recoverability, not correctness.

**Optimistic UI hides errors briefly** (D3-01) — `apply()` mutates local Settings state before IPC settles, so a frame-guard or coerce failure shows the new value momentarily then snaps back; no "تم الحفظ" success toast. **Sub-page index drift between wall and phone** during slideshow navigation (D3-05). **PIN-gate before pairing-info** (D3-08, F-005). **Lockout countdown surfaces seconds, not minutes** — `بعد ٩٠٠ ثانية` (D3-09). **Network-gate is module-load-only** (`network-policy.js:21`) — no live toggle, restart required (D3-12, by design but unsurfaced). **Offline place search returns empty rather than throwing** so `friendlyError()` can't surface "أنت بدون إنترنت" (D3-13). **Schema v1→v2 migration is silent** — fonts visibly grow on first launch with no "تم تكبير الخط" banner (D3-15).

**Cross-flow:** the most consequential finding is **D3-18 — no global IPC-failure toast in App.jsx**. Several Dashboard hooks `catch (_) {}` silently (`Dashboard.jsx:51-55,77-81,93-98`); on a sustained main-process restart the wall freezes the next-prayer count with zero operator signal. Recovery happens on the next poll cycle (60s for prayer times, 60min for Hijri) but the operator has no clue anything was wrong. Closely related: **D3-20** — the `mithnah:config-changed` window-event is dispatched by `setConfig`/`setMarja`/`setLocation`/`undoLastConfig` in `lib/ipc.js`, but NOT by `app:set-settings-pin` and other privileged `app.*` calls; same-window UI relies on the IPC round-trip alone for those, with brief lag risk.

## 4. Accessibility

**The most consequential dimension this review.** Computed contrast (Appendix A) is excellent on the dark wall theme (every primary text token ≥ 8:1 on `--m-bg-base`) and **badly broken on the light phone theme**: `--m-text-muted #6e7c75` 3.71:1, `--m-text-faint #a59c82` **2.32:1**, `--m-primary #2d8a82` 3.51:1, `--m-accent #9c6f2a` 3.77:1 — all fail AA on body text and all are used (auth__sub, auth__hint, dashboard buttons, hijri-card secondary lines).

**Critical findings:**
- **D4-01 (F-001)** — Kiosk-quit modal `Dashboard.jsx:486-506` has no focus trap, no autoFocus, no Escape handler. A keyboard operator can Tab into the destructive "نعم، إيقاف" with nothing catching them.
- **D4-11 (F-002)** — Zero `prefers-reduced-motion` blocks anywhere; 18 keyframes + 44 transitions including infinite `clock-burn-in-drift` (5-min loop), `floatingMenuIdlePulse`, `update-badge-pulse`, `tourHighlightPulse`, `announcement-scroll-rtl`. WCAG 2.3.3 fail.

**High findings:** `<label>` not associated with form fields (D4-02); status divs not announced (D4-03); PrayerTracker error has wrong `role="status"` (should be `alert` — D4-04); SlideshowOverlay no focus trap, no focus restore (D4-05); slideshow root `aria-live` causes massive SR spam (D4-06 — F-003); HelpOverlay (D4-07), OnboardingOverlay + FirstRunTour (D4-08) no focus traps; SettingsOverlay PIN-gate trap is silently broken (D4-09); next-prayer name change has no live region (D4-12); light-theme palette fails AA (D4-10).

**Medium:** dark-theme `--m-text-faint` fails AA on raised surfaces (D4-13); SettingsOverlay tab pattern incomplete — missing `aria-controls` / `aria-labelledby` / arrow-key cycling (D4-14); dua-picker icon buttons 40-44px should be 48+ on elderly target (D4-15); UndoToast announces full button labels via root live region (D4-16).

The renderer's `useFocusTrap` exists and works correctly inside SettingsOverlay/DuaPicker/PrayerTracker — but it's not used in HelpOverlay, OnboardingOverlay, FirstRunTour, SlideshowOverlay, the kiosk-quit modal, or on the SettingsOverlay PIN-gate sub-state. **Adopting it consistently is a small, surgical change.**

## 5. Content

Dominant tone is formal فصيح (MSA) with mild caretaker-friendly softening; terminology is **highly consistent** on load-bearing terms (مفاتيح الجنان, الإمام, زيارة, دعاء, عاشوراء all single-spelling across 14+ files — see Appendix C terminology table). The renderer's `format.js` correctly converts to Arabic-Indic digits everywhere it's called.

**High findings:** five renderer sites bypass `friendlyError()` and concatenate raw English `err.message` into Arabic UI (D5-01); update-progress percent renders as Latin `12%` not `١٢٪` in two places (D5-02); F1 HelpOverlay shows untranslated method/calendar IDs like `JafariWide` and `Tehran` instead of the Arabic labels (D5-05).

**`[doctrinal-review]` flags (per rubric — High by default until human resolves):**
- **D5-03** — The `ﷺ` ligature glyph (U+FDFA, encoding the Sunni `صلى الله عليه وسلم` formula) appears in 13 places: `hijri-events.js` ×10, `tasbih.js` ×2, `chunker.js` ×1. The Shia formula is `صلى الله عليه وآله`. Verify with operator whether the glyph is acceptable here or should be replaced.
- **D5-04** — `PrayerTracker.jsx:396-403` quotes a hadith with explicit chain (Imam al-Sadiq via Zurarah, al-Kafi vol. 3 p. 343). Verify text and citation against authoritative source.

**Medium:** honorific drift — three dua title slides use `ع` abbreviation while their top-level subtitles use full `عليه السلام` (D5-06); microcopy variance `إغلاق` vs `إلغاء` for closing the same overlay (D5-07); `رمز PIN` (dominant) vs `رمز الدخول` (one outlier at SettingsOverlay.jsx:1311) (D5-08); `مضاف من القائم` placeholder phrase is ambiguous — could read as "added by al-Qā'im" (the Imām Mahdi title) — recommend operator verify intended phrasing (D5-09).

## 6. Code-affects-UX

Mostly clean. **Memory hygiene confirmed clean** — every renderer listener and interval has cleanup; no leak risk over 24/7 operation. **Snapshot composer is cheap** — `bridge-ipc.js getSnapshot` is just object assembly against cached singletons, no per-call adhan-recalc or JSON re-parse. **Renderer-local fallback path** — `mithnah:config-changed` window event fires from every config writer in `lib/ipc.js`; no drift between paths.

**Real findings:**
- **D6-01 / Medium** — `src/main/shia-content/duas.js:33-59` reads and parses 12 dua JSON files (~395 KB total, arafah=88 KB, abu-hamza=85 KB, jawshan=45 KB) synchronously at module-require time. Boot path only — adds perceptible delay to first paint.
- **D6-02 / Medium** — `src/main/shia-content/index.js:11-21` deep-clones every event via `JSON.parse(JSON.stringify(...))` per IPC call. Allocation pressure on phone-dashboard polls.
- **D6-04 / Medium** — Five IPC handlers in `prayer-times/ipc.js:19-21` and `hijri/ipc.js:14-15` return raw values rather than the `{ok,error,code}` envelope; `lib/ipc.js:25-27` consequently special-cases `getConfig` to skip `unwrap()`. Convention drift.
- **D6-06 / Low** — `useClock` uses `setInterval(..., 1000)` which accumulates jitter; over hours the second visibly skips. Replace with self-rescheduling `setTimeout` aligned to second boundary.
- **D6-09 / Medium** — Dashboard hooks swallow IPC errors with `catch (_) {}` (`Dashboard.jsx:54,81,98,129`, `DashboardFeatures.jsx:121`, `Dashboard.jsx:275`). Silent-with-recovery, but operator gets no signal during the failure window.
- **D6-13 / Medium** — `sandbox: false` on the main BrowserWindow (`src/main/index.js:1320-1334`). `nodeIntegration:false` + `contextIsolation:true` is correct, but disabling the OS sandbox means a renderer compromise gets full process privileges. `sandbox:true` would still let `contextBridge` + `ipcRenderer` work.

## 7. Documentation

**Significant staleness across the doc surface.** `DESIGN_PLAN.md` (referenced as ground truth by the review brief) **does not exist anywhere in the repo** (D7-30). `docs/ARCHITECTURE.md` (referenced by `README.md:93`) does not exist (D7-31). `README.md:70` claims "Seventy-nine tests" — the actual count is **111 `test(` declarations** across 11 files (D7-01). `README.md` makes no mention of F3 Settings, F4 Dua Library, F5 Prayer Tracker, Qibla badge, mosque-logo upload, imam roster, custom ziyarat/taqibat, Tasbih hadith, large-text default, or DOM-measurement slideshow pagination — all of which shipped (D7-02).

**Operator manual** (`docs/FOR-MOSQUE-OPERATORS.md`):
- **D7-06 / High** — Still says `https://github.com/OWNER/mithnah/releases/latest` (lines 21, 190); owner is `alihus294` per `package.json:90`.
- **D7-07 / High** — Two consecutive `## ٤.` headings (lines 46, 72) — section numbering broken.
- **D7-08 / High** — Imam roster, mosque-logo upload, large-text default all undocumented.
- **D7-09 / Medium** — F4 Dua Library and F5 Prayer Tracker have no walkthrough, only one-line table mentions.
- **D7-12 / Medium** — Updater section says "حالياً يدوي … قريباً تحديث تلقائي"; auto-update shipped in 0.3.0 (commits `e1b3c33`, `ba19f23`).
- **D7-11 / Medium** — No "if X breaks" runbook (display went black, phone won't connect, router restarted).

**Roadmap:**
- **D7-15 / High** — `<PLACEHOLDER_USERNAME>` task is done (`package.json:90` is `alihus294`).
- **D7-16 / High** — "First real GitHub release (v0.1.0)" task is done (tags v0.1.0–v0.1.5 all exist).
- **D7-17 / High** — Firebase removal task is done — `package-lock.json` has zero `"firebase"` matches and CHANGELOG:177 confirms removal.

**CHANGELOG (the worst-affected doc):**
- **D7-26 / High** — Version headers `[0.8.x]`, `[0.5.0]`, `[0.3.0]`, `[0.2.0]`, `[0.1.0]` do not match released tags `v0.1.0` through `v0.1.5`. The 0.8.x / 0.5.0 / 0.3.0 entries appear to be drafts that landed under wrong version numbers.
- **D7-27 / High** — Releases `v0.1.1` through `v0.1.5` have no entries.
- **D7-29 / Medium** — Date `2026-04-20` repeats for three consecutive version headers — likely copy-paste.

**Other:** RELEASE.md still has `REPLACE_ME_BEFORE_RELEASE` for owner (D7-18) and example version `0.5.1` (D7-19); SUSTAINABILITY.md says "79 passing tests" (D7-22) and references the missing `GOVERNANCE.md` (D7-23); SIGNPATH-APPLICATION.md dependency list includes `idb` and `lucide-react` which are NOT in current `package.json` (D7-25).

---

## 8. Findings register

| ID | Sev | Surface | Dim | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|---|
| F-001 / D4-01 | Critical | Dashboard | A11y | Kiosk-quit modal: no focus trap, no autoFocus, no Esc | `Dashboard.jsx:486-506` | Add `useFocusTrap`, `autoFocus` on cancel, `onKeyDown Escape→close` |
| F-002 / D1-03+D4-11 | Critical | Global | Design+A11y | No `prefers-reduced-motion` block; 18 keyframes incl. infinite pulses | `styles.css` (no media query); `:290,455,2893,3136,3320,3580,2643,2651` | Add 10-line reduced-motion override at top of styles.css |
| D1-01 | Medium | Build | Design | CSS bundle 136.7 KB vs 20 KB DESIGN-PROMPT budget | `styles.css` 127.5 KB; `mithnah-design.css` 9.2 KB | Decide: update budget in doc, or compress (large-text dup at L3164-3284 is the easy win) |
| D1-02 | High | Tokens | Design | Shipped tokens diverge from DESIGN-PROMPT spec (`--m-bg-base`, primary/accent, font families) | `mithnah-design.css:28,95-99,163` vs `docs/DESIGN-PROMPT.md` §4 | Pick one source of truth; update the other |
| D1-04 | Medium | Tokens | Design | `--m-text-faint` 4.80:1 borderline; passes AA-normal but fails AAA | computed; see Appendix A | Lift to `~#a8b2ac` (~6.5:1) or restrict to ≥18pt |
| D1-05 | Medium | Tokens | Design | 19 hardcoded hex (13 reddish for errors) — missing `--m-error` token | `styles.css:1239,1500,1861,1867,1891,2828,2990,2997,3029,3093,3479,3562,3565,3589,3717` | Add `--m-error` / `--m-error-soft` / `--m-success-text` |
| D1-06 | Medium | Tokens | Design | Two parallel spacing scales + ~40 off-scale `padding` values | `mithnah-design.css:79`; `styles.css:70,393,407,420` | Pick one scale; 14→12/16, 22→24, 26→24 |
| D1-07 | Medium | Renderer | Design | 52 inline `style={{}}` across 11 components; SettingsOverlay 17, Ornaments 14 | grep `style={{ src/renderer/components` | Convert recurring patterns to classes |
| D1-08 | Medium | Settings/Tracker | Design+UX | Default touch targets 40-48px vs 64px elderly target; only `largeText` reaches 56 | `styles.css:3164,3204,3242` | Lift base `.settings__btn`, `.dua-picker__tab`, `.prayer-tracker__rakah-btn` to ≥56px |
| D1-09 | Medium | Build | Design | Both Material Symbols + Font Awesome shipped (FA = ~102 KB) | `index.html:41,43` | Drop Font Awesome — keep Material Symbols |
| D1-10 | Low | Dashboard | Design | Infinite `pulse 2s` on event-strip dot ungated by reduced-motion | `styles.css:455` | Resolved by F-002 |
| D1-11 | Low | Dashboard | Design | `tnum` covers 5 selectors; missing on `.event-strip__countdown-when` | `styles.css:443` | Add `font-feature-settings:'tnum'` |
| D1-12 | Low | Renderer | Design | Body Arabic line-height 1.5/1.55 in many surfaces; 1.7 only on 4 selectors | `styles.css:1126,1193,1361,1459,1490,1754,2375,2974` | Bump body Arabic surfaces to ≥1.65 |
| D2-01 | Low | Dashboard | UX | DESIGN-PROMPT "clock+next-prayer cramped" claim is obsolete | `Dashboard.jsx:418-445`; `styles.css:275` | Update the doc; no code change |
| D2-02 | Medium | App | UX | `<HelpHint />` defined but never imported | `HelpHint.jsx:3-18` vs `App.jsx:2-13` | Mount it in App.jsx, OR delete file |
| D2-03 | Low | Dashboard | UX | `clock-burn-in-drift` may parallax over `.dashboard__mihrab` ornament | `styles.css:328` | None |
| D2-04 | Medium | Slideshow | UX | Auto-hide chrome at 3s/4s — too fast vs UndoToast 15s baseline | `SlideshowOverlay.jsx:144,152` | Bump to 6-8s |
| D2-05 | Low | Slideshow | UX | Font-control glyphs `ﺍ-` `ﺍ+` use isolated-form Arabic, render garbled | `SlideshowOverlay.jsx:359-363` | Replace with `أ−` `أ+` plain |
| D2-06 | Low | Slideshow | UX | `Esc` token in RTL hint can flip; no `<bdi>` wrap | `SlideshowOverlay.jsx:455` | Wrap in `<bdi>Esc</bdi>` |
| F-004 / D2-07 | High | Settings | UX | Bg-click discards unsaved input with no guard | `SettingsOverlay.jsx:884,443,409` | Remove bg-onClick OR confirm when dirty |
| D2-08 | Medium | Settings | UX | Many fields commit on `onBlur` with no visible "saved" indicator | `SettingsOverlay.jsx:506,574` | Show inline "✓ محفوظ" on blur-commit |
| D2-09 | Medium | Settings/Loc | UX | Four primary actions in one row, no visual hierarchy | `SettingsOverlay.jsx:1183-1190` | Mark GPS as primary, group others under "خيارات أخرى" |
| D2-10 | Low | Settings | UX | Close-button microcopy varies (`إغلاق · Esc` vs `إلغاء · Esc`) | `SettingsOverlay.jsx:899,428,1379,713` | Pick one convention |
| D2-11 | Low | ImamList | UX | Icon-only `✕` delete with no native confirm; cap shown only as tooltip | `ImamListEditor.jsx:50-57,80` | Show "بقي N من ٤٠" inline |
| D2-12 | Medium | FloatingMenu | UX | Trigger fades fully invisible at 4s idle — only entry point disappears | `FloatingMenu.jsx:42` | Keep low-opacity OR raise to 12-15s |
| D2-13 | Low | FloatingMenu | UX | Exit-app dispatches event with no toast feedback | `FloatingMenu.jsx:110` | Show "جاري إغلاق التطبيق…" toast |
| D2-14 | Medium | Phone | UX | Slideshow CLOSE has no confirm; spam-tap kills dua mid-recitation | `mobile-control.html:767` | Hold-to-confirm OR inline "تأكيد الإنهاء؟" |
| D2-15 | Medium | Phone | UX | "Show PIN" inside read-only card has no button styling | `mobile-control.js:616-643` | Add faint background to `.set-row__pin-btn` |
| D2-16 | Low | Phone | UX | Library uses Load-more (60-at-a-time) — fine | `mobile-control.js:483-487` | None |
| D2-17 | Low | Phone | UX | Auth screen has no "where do I find PIN" guidance | `mobile-control.js:682` | Append "في زاوية الشاشة → القائمة → الإعدادات" |
| D2-18 | Medium | Pairing | UX | `.pin-badge` CSS exists (50+ lines) but no JSX renders it | `styles.css:951-1009`; `:109` | Ship `<PinBadge />` for first-run, OR delete CSS |
| F-005 / D2-19 | High | Pairing | UX | Pairing UI lives only in F3 → متقدّم — behind the very PIN you forgot | `SettingsOverlay.jsx:1300-1322` | Add unauth pairing entry in FloatingMenu OR mount PinBadge first-run |
| D3-01 | Medium | Settings | Flow | Optimistic UI hides setConfig errors briefly; no success toast on actual write | `SettingsOverlay.jsx:486-503` | Toast only after IPC resolves; revert on failure |
| D3-02 | Low | Settings | Flow | 200ms debounce can swallow last fast click on close | `SettingsOverlay.jsx:519` | Call `flushPendingConfig()` in onClose |
| D3-03 | Low | Settings | Flow | Method change shows "تم" before disk-write success confirmed | `SettingsOverlay.jsx` (race with D3-01) | Resolves with D3-01 |
| D3-04 | Medium | Phone | Flow | Phone cannot change calc method; field shown read-only with no hint | `index.js:695-701`; `mobile-control.js:571` | Add hint string on read-only field |
| D3-05 | Medium | Slideshow | Flow | Renderer sub-page index not pushed to phone — counter desyncs | `SlideshowOverlay.jsx:298-306`; `index.js:1564-1571` | Include effective sub-index in `remote-control:publish-state` |
| D3-06 | Low | Slideshow | Flow | OPEN-from-resume doesn't `emit()` after restore | `slideshow/index.js init` | Schedule `emit()` on next tick after restore |
| D3-07 | Low | Slideshow | Flow | End-of-deck press has no edge feedback | `slideshow/index.js next/prev/last` | Flash subtle "نهاية" on edge keypress |
| F-005 / D3-08 | High | Pairing | Flow | PIN+QR hidden behind Settings PIN gate — circular discoverability | `SettingsOverlay.jsx` PIN gate | Surface unauth `getRemoteStatus()` path in FloatingMenu |
| D3-09 | Medium | Phone | Flow | 429 lockout shows `بعد ٩٠٠ ثانية` instead of "15 دقيقة" | `mobile-control.js:107` | Convert >120s to "X دقيقة" |
| D3-10 | Medium | Settings | Flow | Settings doesn't subscribe to `remote-control:status`; QR stale on Wi-Fi switch | `SettingsOverlay.jsx:368` | Add `onStatus(setStatus)` in open effect |
| D3-11 | Low | Phone | Flow | `MAX_ACTIVE_SESSIONS=500` evicts oldest tokens silently | `index.js:382-396` | Log eviction reason |
| D3-12 | Medium | Network | Flow | Network gate is module-load-only; restart-only toggle | `network-policy.js:21` | Log gate state at boot |
| D3-13 | High | Settings/Loc | Flow | Offline `searchPlaces` returns `[]` rather than throwing — no offline message | `ipc.js:185-188` | Wrap IPC failure into thrown error so `friendlyErrorTitle` surfaces |
| D3-14 | Low | Settings/Loc | Flow | `locationFixedAt` not updated on online name-resolve | `prayer-times/index.js` | Update timestamp on `setLocation` with name |
| D3-15 | Medium | Migration | Flow | Schema v1→v2 silently grows fonts; no "تم تكبير الخط" banner | `prayer-times/config.js:202-233` | Detect upgrade in init; fire one-shot `mithnah:upgraded` IPC |
| D3-16 | Low | Migration | Flow | v3-from-future error doesn't include backup file path in friendly hint | `errors.js:51` | Include backup basename |
| D3-17 | Low | Config | Flow | `coerce()` strips unknown fields silently | `config.js:55-63` | Add field-rejection counter |
| D3-18 | High | Global | Flow | No global IPC-failure toast; Dashboard hooks `catch (_) {}` silently | `Dashboard.jsx:51-55,77-81,93-98` | Top-level `<ErrorToast>` listening to `mithnah:ipc-failed` |
| D3-19 | Medium | Phone | Flow | Phone polls every 30s; doesn't subscribe to socket `config-changed` | `mobile-control.js`; `index.js:1581` | Add `socket.on('config-changed', refresh)` |
| D3-20 | Medium | Privileged | Flow | `mithnah:config-changed` window event not fired by `app:set-settings-pin` | `lib/ipc.js setSettingsPin` | Mirror `setConfig` pattern: dispatch event on success |
| D3-21 | Low | Errors | Flow | `friendlyError` regex catches frame-guard "forbidden" as PIN error | `errors.js` | Tighten regex; add `forbidden` rule |
| D4-02 | High | Settings | A11y | `Field` wrapper renders `<label>` without `htmlFor`; SR hears unlabeled | `SettingsOverlay.jsx:133-141,1358,1368`; `DuaPicker.jsx:686,698` | Forward `id` to child; use `<label htmlFor>` |
| D4-03 | High | Settings | A11y | Status messages no `role`/`aria-live` — saves/errors not announced | `SettingsOverlay.jsx:904-906`; `DuaPicker.jsx:534` | Add `role={err?'alert':'status'}` + `aria-live` |
| D4-04 | High | Tracker | A11y | Imam-save error uses `role="status"` — should be `alert` | `PrayerTracker.jsx:320` | Change to `role="alert"` |
| D4-05 | High | Slideshow | A11y | No focus trap; no focus restore | `SlideshowOverlay.jsx` | Add `useFocusTrap`; focus close button on mount |
| F-003 / D4-06 | High | Slideshow | A11y | Root `aria-live="polite"` reads entire dua on every page change | `SlideshowOverlay.jsx:332-336` | Remove root live; add small `sr-only` live region for counter only |
| D4-07 | High | Help | A11y | HelpOverlay no focus trap | `HelpOverlay.jsx` | Add `useFocusTrap(cardRef, open)` |
| D4-08 | High | Onboarding | A11y | OnboardingOverlay + FirstRunTour no focus traps | `OnboardingOverlay.jsx:188`; `FirstRunTour.jsx:85` | Wrap container ref + `useFocusTrap` |
| D4-09 | High | Settings | A11y | Focus trap silently broken on PIN-gate/skeleton (no `containerRef`) | `SettingsOverlay.jsx:407-433,440-470,231` | Add `ref={containerRef}` to the root `<div>` of those returns |
| D4-10 | High | Phone | A11y | Light theme: 4 token pairs fail AA on body text | `mithnah-design.css:114-119` | Darken `--m-text-muted #586863`, `--m-text-faint #7a7560`, `--m-primary #1f6e68`, `--m-accent #8b5a1a` |
| D4-12 | High | Dashboard | A11y | Next-prayer name change has no live region | `Dashboard.jsx:439` | Wrap in `role="status" aria-live="polite" aria-atomic` |
| D4-13 | Medium | Tokens | A11y | Dark `--m-text-faint` 4.29:1 on surface, 3.69:1 on raised — fails AA | computed | Drop the token, OR lift to `≥#9aa4a0` |
| D4-14 | Medium | Settings | A11y | Tabs missing `aria-controls`/`aria-labelledby`/arrow cycling | `SettingsOverlay.jsx:911-932` | Wire ids and Left/Right handler |
| D4-15 | Medium | DuaPicker | A11y | Dua-picker star/edit/delete 40-44px; below 48 elderly target | `styles.css:1672,1875-1888,3214-3216` | Lift to 48 in largeText branch; raise base delete to 44 |
| D4-16 | Medium | Toast | A11y | UndoToast root `role="status" aria-live` announces buttons too | `UndoToast.jsx:75-82` | Limit live region to label `<span>` only |
| D4-17 | Low | Modals | A11y | Backdrop click-to-close not keyboard-reachable | many | Informational only — Esc + close button exist |
| D5-01 | High | Renderer | Content | Raw English `err.message` concatenated into Arabic UI in 5 places | `Dashboard.jsx:304`; `OnboardingOverlay.jsx:164,179`; `DuaPicker.jsx:253,368,422`; `UpdateSection.jsx:73,85` | Route through `friendlyErrorTitle()` |
| D5-02 | High | Update | Content | Latin `12%` in update progress | `UpdateBadge.jsx:51`; `UpdateSection.jsx:95` | Wrap in `toArabicDigits(pct)` + `٪` |
| D5-03 | High `[doctrinal-review]` | Content | Content | `ﷺ` glyph (Sunni صلى الله عليه وسلم) used in 13 places | `hijri-events.js:26,32,33,40,43`; `tasbih.js`; `chunker.js:38` | Verify with operator; if to change, replace with full `صلى الله عليه وآله` |
| D5-04 | High `[doctrinal-review]` | Tracker | Content | Hadith citation chain (al-Sadiq via Zurarah, al-Kafi vol.3 p.343) | `PrayerTracker.jsx:396-403` | Verify text + citation against authoritative source |
| D5-05 | Medium | Help | Content | F1 shows untranslated method/calendar IDs (Latin) | `HelpOverlay.jsx:136,141` | Use `methods.find(m=>m.id===config.method)?.ar` |
| D5-06 | Medium | Content | Content | Honorific drift — three slides use `ع` while subtitles use full | `arafah.json:11`, `faraj.json:11`, `kumayl.json:11` | Standardise on full `عليه السلام` |
| D5-07 | Medium | Settings | Content | `إلغاء` vs `إغلاق` for closing same overlay | `SettingsOverlay.jsx:428,454,900` | Verify intent; unify to `إغلاق · Esc` |
| D5-08 | Medium | Settings | Content | `رمز PIN` (dominant) vs `رمز الدخول` (one outlier) | `SettingsOverlay.jsx:1311` vs many | Pick one; `رمز الدخول` is more readable |
| D5-09 | Medium | DuaPicker | Content | `مضاف من القائم` may misread as the Imām Mahdi title | `DuaPicker.jsx:283,318` | Verify; likely `مضاف من القائم على المسجد` |
| D5-10 | Low | Settings | Content | Color-name labels poetic — `ذهب نحاسي`, `عقيق` | `SettingsOverlay.jsx:48-52` | Verify caretaker reading naturally |
| D5-11 | Low | Qibla | Content | Latin digits in qibla aria-label | `DashboardFeatures.jsx:133` | Wrap deg/km in `toArabicDigits()` |
| D5-12 | Low | Content | Content | Three different separators for "4–8 digits" | `errors.js:58`; `SettingsOverlay.jsx:730,1337`; `mobile-control.js:757` | Pick en-dash `٤–٨` |
| D5-13 | Low | Phone | Content | `محاولة` always singular regardless of count | `mobile-control.js:118` | Conditional plural |
| D6-01 | Medium | Boot | Code | Sync read+parse of 12 dua JSON (~395 KB) at module-require | `shia-content/duas.js:33-59` | Lazy `getDua(id)` cache |
| D6-02 | Medium | IPC | Code | Per-call `JSON.parse(JSON.stringify(...))` of all events | `shia-content/index.js:11-21,78` | Freeze source once; return refs |
| D6-03 | Low | Dashboard | Code | 12s cursor cycle re-renders even on single-event days | `Dashboard.jsx:140-143` | Gate interval on `events.length > 1` |
| D6-04 | Medium | IPC | Code | Five handlers return raw values, not `{ok,error,code}` envelope | `prayer-times/ipc.js:19-21`; `hijri/ipc.js:14-15`; `lib/ipc.js:25-27` | Wrap in envelope; route through `unwrap()` |
| D6-05 | Low | Boot | Code | `console.log` for routine boot info (not per-second spam) | `index.js:49,192,202,...` | None required |
| D6-06 | Low | Clock | Code | `setInterval(..., 1000)` drifts; second visibly skips over hours | `Dashboard.jsx:23-26` | Self-rescheduling `setTimeout(1000 - Date.now()%1000)` |
| D6-09 | Medium | Renderer | Code | Hooks swallow IPC errors with `catch (_) {}` | `Dashboard.jsx:54,81,98,129`; `DashboardFeatures.jsx:121` | Single transient toast on `getTodayAndNext`/`getConfig` failures |
| D6-10 | Low | Dashboard | Code | `documentElement.setAttribute` outside try/catch | `Dashboard.jsx:319-321` | None |
| D6-12 | Low | Onboarding | Code | Direct `setConfig` use — implicitly relies on lib/ipc dispatch | `OnboardingOverlay.jsx:155,175` | None today; flag for future |
| D6-13 | Medium | Security | Code | `sandbox: false` on main BrowserWindow | `src/main/index.js:1320-1334` | Set `sandbox: true`; verify preload still loads |
| D7-01 | High | Doc | Doc | README claims 79 tests; actual is 111 | `README.md:70`; `tests/*.test.js` | Replace with stable phrase |
| D7-02 | High | Doc | Doc | README missing F3/F4/F5 overlays + Qibla badge + recent features | `README.md:6-37` | Add "Operator overlays" bullet |
| D7-03 | High | Doc | Doc | Broken link to `docs/ARCHITECTURE.md` | `README.md:93` | Remove link OR write the file |
| D7-04 | Medium | Doc | Doc | No env-var section in README | `README.md:23,36,150` (scattered) | Add "Environment variables" subsection |
| D7-05 | Low | Doc | Doc | "Personal-use project" but `CONTRIBUTING.md` exists | `README.md:152-155` | Link to CONTRIBUTING |
| D7-06 | High | Doc | Doc | Operator manual still has `OWNER` placeholder | `FOR-MOSQUE-OPERATORS.md:21,190` | Replace with `alihus294` |
| D7-07 | High | Doc | Doc | Two consecutive `## ٤.` headings | `FOR-MOSQUE-OPERATORS.md:46,72` | Renumber ٥–١١ |
| D7-08 | High | Doc | Doc | Imam roster, mosque-logo upload, large-text default undocumented | per `SettingsOverlay.jsx:179-189,1011-1012`; commit `a38d450` | Add §6 subsection |
| D7-09 | Medium | Doc | Doc | F4 Dua Library + F5 Tracker no walkthrough | `FOR-MOSQUE-OPERATORS.md:52-53` | Add 4-6 line subsections |
| D7-10 | Medium | Doc | Doc | Custom ziyarat/taqibat undocumented | commit `9559990` | Mention briefly |
| D7-11 | Medium | Doc | Doc | No "if X breaks" runbook | manual lacks one | Add §٨½ "إذا حصلت مشكلة" |
| D7-12 | Medium | Doc | Doc | Updater section says "قريباً" but auto-update shipped 0.3.0 | `FOR-MOSQUE-OPERATORS.md:167-169` | Update to opt-in via env + manual button |
| D7-13 | Low | Doc | Doc | No screenshots referenced | — | Defer until UI stabilizes |
| D7-14 | Low | Doc | Doc | Forgot-PIN reuses Alt+F4 pattern from shutdown | `FOR-MOSQUE-OPERATORS.md:165,172` | Disambiguate |
| D7-15 | High | Doc | Doc | ROADMAP `<PLACEHOLDER_USERNAME>` task is done | `ROADMAP.md:13-15` vs `package.json:90` | Remove |
| D7-16 | High | Doc | Doc | "First real GitHub release (v0.1.0)" task is done | `ROADMAP.md:16-18` vs git tags | Remove |
| D7-17 | High | Doc | Doc | Firebase removal task is done | `ROADMAP.md:8-12` vs `package-lock.json` | Remove |
| D7-18 | Medium | Doc | Doc | RELEASE.md still has `REPLACE_ME_BEFORE_RELEASE` | `RELEASE.md:10` | Update to `alihus294` |
| D7-19 | Medium | Doc | Doc | RELEASE.md example version `0.5.1` vs current 0.1.5 | `RELEASE.md:34` | Update example |
| D7-20 | Medium | Doc | Doc | "Code-signing cert" not cross-linked to SIGNPATH-APPLICATION | `ROADMAP.md:24-27` | Add see-also |
| D7-21 | Medium | Doc | Doc | SUSTAINABILITY.md talks v0.4 cycle | `SUSTAINABILITY.md:67-70` | Refresh to v0.1.x |
| D7-22 | Medium | Doc | Doc | SUSTAINABILITY.md says "79 passing tests" | `SUSTAINABILITY.md:88` | Update or generalize |
| D7-23 | Medium | Doc | Doc | SUSTAINABILITY.md references missing `GOVERNANCE.md` | `SUSTAINABILITY.md:98` | Add or drop reference |
| D7-24 | Low | Doc | Doc | SIGNPATH `OWNER` placeholder | `SIGNPATH-APPLICATION.md:12,67,70` | Mark draft status |
| D7-25 | Low | Doc | Doc | SIGNPATH dep list lists `idb`, `lucide-react` not in `package.json` | `SIGNPATH-APPLICATION.md:90` | Match to actual runtime deps |
| D7-26 | High | CHANGELOG | Doc | Version headers `[0.8.x]`/`[0.5.0]`/`[0.3.0]` don't match released v0.1.x | `CHANGELOG.md:8,61,79,160,179` | Renumber to actual released line |
| D7-27 | High | CHANGELOG | Doc | v0.1.1–v0.1.5 entirely unrecorded | `CHANGELOG.md` | Add an entry per release |
| D7-28 | Medium | CHANGELOG | Doc | No "Unreleased" section | `CHANGELOG.md` | Add per Keep-a-Changelog spec |
| D7-29 | Medium | CHANGELOG | Doc | Date `2026-04-20` repeats for 3 consecutive headers | `CHANGELOG.md` | Verify dates from `git log` |
| D7-30 | High | Doc | Doc | `DESIGN_PLAN.md` referenced as ground truth — does not exist | review prompt | Author it OR update referrer (this review used DESIGN-PROMPT.md as fallback) |
| D7-31 | High | Doc | Doc | `docs/ARCHITECTURE.md` referenced by README — does not exist | `README.md:93` | Same as D7-03 |
| D7-32 | Medium | Doc | Doc | No `docs/TROUBLESHOOTING.md` for operators | — | Author per D7-11 |
| D7-33 | Medium | Doc | Doc | `GOVERNANCE.md` referenced but missing | `SUSTAINABILITY.md:98` | Author or drop |
| D7-34 | Low | Doc | Doc | No env-var reference doc | — | README section per D7-04 OR `docs/ENV.md` |
| D7-35 | Low | CHANGELOG | Doc | No "How to update" / Keep-a-Changelog format link | `CHANGELOG.md:3` | Add header |

Cross-cutting UX patterns (referenced as a cluster, not new IDs):
- **Auto-hide chrome under 4s** repeats across SlideshowOverlay (3s/4s), PrayerTracker (2.5s/4s), FloatingMenu (4s) — well below the codebase's own elderly benchmark of UndoToast 15s. Captured in D2-04 + D2-12. Recommend a shared `IDLE_REVEAL_MS = 7000`.
- **Bg-click-as-dismiss** with no unsaved-changes guard: SettingsOverlay (D2-07), DuaPicker (`DuaPicker.jsx:428`), inline modals.
- **Icon-only buttons with `aria-label` only**: ImamListEditor, DuaPicker (`✎🗑★☆×`), UndoToast (`×`).
- **Microcopy drift on close affordances**: 3+ patterns across overlays (D2-10).

---

## 9. Prioritized roadmap (top 10)

| # | Task | Resolves | Effort | Risk | Phase |
|---|---|---|---|---|---|
| 1 | **A11y emergency pass — focus traps + reduced-motion + slideshow live region** | F-001, F-002, F-003, D4-04, D4-05, D4-07, D4-08, D4-09 | M (2-4h) | Low | a11y sprint |
| 2 | **Settings data-loss prevention** — disable bg-click dismiss when dirty + visible save indicator + flush on close | F-004, D2-08, D3-02 | S (1h) | Low | polish sprint |
| 3 | **Light-theme contrast fix** — darken 4 token values in `mithnah-design.css:114-119` | D4-10 | S (30min) | Low — color values only | a11y sprint |
| 4 | **Form labelling + status announcements** — `Field` wrapper to use `htmlFor`; status divs add `role`/`aria-live` | D4-02, D4-03, D4-12, D4-14, D4-16 | M (2h) | Low | a11y sprint |
| 5 | **Pairing discoverability** — render `<PinBadge />` first-run OR add unauth "show pairing" entry in FloatingMenu | F-005, D2-18, D2-19 | S-M (1-3h) | Medium — touches PIN-gate flow | v0.1.6 |
| 6 | **Global IPC error toast** — top-level `<ErrorToast>` listening to `mithnah:ipc-failed` window event dispatched by `unwrap()` failures; replace silent `catch(_)` blocks | D3-18, D6-09, D5-01 | M (3h) | Low — additive | v0.1.6 |
| 7 | **Docs reality alignment** — CHANGELOG renumber + missing v0.1.1–v0.1.5 entries; OPERATORS.md OWNER placeholder + duplicate ٤. heading + F3/F4/F5 walkthroughs + updater section + troubleshooting; ROADMAP drop 3 stale items; README test count + features list + ARCHITECTURE link decision | D7-01, D7-02, D7-03, D7-06, D7-07, D7-08, D7-09, D7-12, D7-15, D7-16, D7-17, D7-22, D7-26, D7-27 | M (3-4h) | Zero — docs only | polish sprint |
| 8 | **Token + design-doc reconciliation** — pick one source of truth between DESIGN-PROMPT.md §4 and `mithnah-design.css`; add `--m-error*` tokens; unify spacing scale; fix touch-target defaults (lift to ≥56) | D1-02, D1-04, D1-05, D1-06, D1-08, D4-13 | M (3-4h) | Medium — visual review needed after token bumps | v0.1.6 |
| 9 | **Slideshow phone-state desync + 429 lockout copy** — push effective sub-index from renderer; convert >120s lockout to "X دقيقة"; phone subscribes to socket `config-changed` | D3-05, D3-09, D3-19 | M (2-3h) | Medium — touches socket emit shape | v0.1.6 |
| 10 | **`[doctrinal-review]` decision block** — operator must decide: (a) `ﷺ` glyph (13 places) vs `صلى الله عليه وآله`; (b) hadith citation in `PrayerTracker.jsx:396-403`; (c) `مضاف من القائم` phrasing | D5-03, D5-04, D5-09 | S after decision | Low — string-only edits | blocked on operator |

Items not making top-10 but worth scheduling: drop Font Awesome (D1-09, ~100 KB savings); Update progress Arabic-Indic digits (D5-02, micro); HelpOverlay method/calendar Arabic labels (D5-05); `sandbox:true` on BrowserWindow (D6-13, security uplift, modest verification cost); honorific drift in 3 dua JSONs (D5-06).

---

## 10. Open questions for the human (max 10)

1. **`ﷺ` glyph (D5-03)** — 13 occurrences in `hijri-events.js`, `tasbih.js`, `chunker.js`. The encoded formula is the Sunni `صلى الله عليه وسلم`. For a Shia-targeted app the doctrinally-aligned formula is `صلى الله عليه وآله`. Replace globally, leave as-is, or context-dependent?
2. **Hadith citation in `PrayerTracker.jsx:396-403` (D5-04)** — text plus chain (Imam al-Sadiq via Zurarah, al-Kafi vol. 3 p. 343). Verified against your authoritative source?
3. **`مضاف من القائم` placeholder (D5-09)** — intentional phrasing or shortened from `مضاف من القائم على المسجد`?
4. **DESIGN_PLAN.md status (D7-30)** — the review prompt referenced this file; it doesn't exist. Author it as ground truth, or rely on DESIGN-PROMPT.md going forward?
5. **CSS budget (D1-01)** — DESIGN-PROMPT specifies ≤20 KB; reality is 137 KB. Was the budget aspirational, or do you want a compression pass (the largeText duplication in `styles.css:3164-3284` is the easy win)?
6. **Token vs DESIGN-PROMPT drift (D1-02)** — the shipped colors and font families don't match DESIGN-PROMPT §4. Update the doc to reflect what shipped, or update the CSS to match the doc?
7. **CHANGELOG version numbers (D7-26, D7-27)** — entries are tagged `[0.8.x]`/`[0.5.0]`/`[0.3.0]` but the released line is v0.1.0–v0.1.5. Were these drafts that landed under wrong version numbers, or part of an internal-version scheme that diverged from public releases?
8. **PinBadge / pairing first-run UX (D2-18, F-005)** — the CSS exists but no JSX uses it. Was a first-run pairing screen planned and dropped, or is the omission unintentional?
9. **Settings PIN guarding pairing PIN (F-005)** — is the current "Settings PIN protects everything including pairing-info display" intentional (defense-in-depth), or did the pairing card simply land in the wrong tab?
10. **`sandbox: true` on the BrowserWindow (D6-13)** — security uplift, but requires verifying preload still loads in sandboxed mode. Worth scheduling, or deliberately deferred for some compatibility reason?

---

## Appendix A: contrast measurements

Computed via WCAG luminance formula. Dark backgrounds use `oklch()`; resolved sRGB approximations shown. AA = 4.5:1 normal text / 3.0 large text. AAA = 7:1 / 4.5:1.

| Foreground | Background | Resolved | Ratio | AA-norm | AAA-norm |
|---|---|---|---|---|---|
| `--m-text-primary` `#f5ecd2` | `--m-bg-base` (oklch) | ≈ `#092520` | **13.79:1** | ✅ | ✅ |
| `--m-text-secondary` `#d6cdb2` | `--m-bg-base` | | **10.24:1** | ✅ | ✅ |
| `--m-text-muted` `#b8c2b8` | `--m-bg-base` | | **8.86:1** | ✅ | ✅ |
| `--m-text-faint` `#8a948e` | `--m-bg-base` | | **5.19:1** | ✅ | ❌ |
| `--m-text-faint` `#8a948e` | `--m-bg-surface` (oklch) | ≈ `#17342e` | **4.29:1** | ❌ | ❌ |
| `--m-text-faint` `#8a948e` | `--m-bg-raised` (oklch) | ≈ `#233e39` | **3.69:1** | ❌ | ❌ |
| `--m-text-muted` | `--m-bg-raised` | | **6.30:1** | ✅ | ❌ |
| `--m-primary` `#4ec1b6` | `--m-bg-base` | | 7.45:1 | ✅ | ✅ |
| `--m-accent` `#d4a574` | `--m-bg-base` | | 7.30:1 | ✅ | ✅ |
| `--m-accent-bright` `#e6bc8e` | `--m-bg-base` | | 9.25:1 | ✅ | ✅ |
| `--m-shahadah-text` `#d49595` | `--m-bg-base` | | 6.11:1 | ✅ | ❌ |
| **Light theme (phone, `--m-bg-base #f4ecd6`)** | | | | | |
| `--m-text-primary` `#1a3530` | base | | **11.16:1** | ✅ | ✅ |
| `--m-text-secondary` `#355048` | base | | **7.45:1** | ✅ | ✅ |
| `--m-text-muted` `#6e7c75` | base | | **3.71:1** | ❌ | ❌ |
| `--m-text-faint` `#a59c82` | base | | **2.32:1** | ❌ | ❌ |
| `--m-primary` `#2d8a82` | base | | **3.51:1** | ❌ | ❌ |
| `--m-accent` `#9c6f2a` | base | | **3.77:1** | ❌ | ❌ |
| `--m-status-danger` `#8b3a3a` | base | | **6.45:1** | ✅ | ❌ |

Bold = surface that fails or is borderline. Dark theme is excellent overall. Light theme has 4 token pairs needing color adjustment (D4-10).

---

## Appendix B: tokens vs DESIGN-PROMPT §4

Quick check — DESIGN-PROMPT spec → shipped value → match.

| Token | DESIGN-PROMPT spec | Shipped value (`mithnah-design.css`) | Match |
|---|---|---|---|
| `--m-bg-base` (dark) | `#0f1e20` | `oklch(0.24 0.035 180)` ≈ `#092520` | ❌ |
| `--m-bg-surface` (dark) | `#172b2e` | `oklch(...)` ≈ `#17342e` | ≈ |
| `--m-bg-raised` (dark) | `#203a3e` | `oklch(...)` ≈ `#233e39` | ≈ |
| `--m-text-primary` (dark) | `#f0ebe0` | `#f5ecd2` | ❌ |
| `--m-text-secondary` (dark) | `#c4cfcd` | `#d6cdb2` | ❌ |
| `--m-text-muted` (dark) | `#8a9795` | `#b8c2b8` | ❌ |
| `--m-primary` (dark) | `#4a9e96` | `#4ec1b6` | ❌ |
| `--m-accent` (dark) | `#d4a574` | `#e2b76a` (root) / `#d4a574` (occasion=normal) | ⚠ split |
| `--m-bg-base` (light) | `#f7f3ea` | `#f4ecd6` | ≈ |
| `--m-text-primary` (light) | `#1a2b2a` | `#1a3530` | ≈ |
| `--m-text-secondary` (light) | `#3a4c4a` | `#355048` | ≈ |
| Spacing 1–8 | 4/8/12/16/24/32/48/64 | `--m-space-1..9` 4/8/12/16/24/32/48/64/96 + a *second* `xs/sm/md/lg/xl/2xl/3xl` redefinition | ⚠ split |
| Body font | `Tajawal,Cairo,Noto Sans Arabic` | `Aref Ruqaa, …` | ❌ |
| Display font | `Changa,Tajawal` | `Reem Kufi, …` | ❌ |
| Quranic font | `Amiri, Scheherazade New` | `Amiri, Scheherazade New` | ✅ |
| Latin font | `Be Vietnam Pro` | `Inter, …` | ❌ |
| CSS budget | ≤ 20 KB total | 136.7 KB (vendor 9.2 + renderer 127.5) | ❌ |

The system has clearly evolved past the prompt — the question is whether to update the doc or pull the system back. (Open question #5/#6.)

---

## Appendix C: strings flagged in §5

| File:line | Current text (shortened) | Suggested action |
|---|---|---|
| `Dashboard.jsx:304` | `'فشل: ' + err.message` | Wrap via `friendlyErrorTitle(err)` |
| `OnboardingOverlay.jsx:164` | `'فشل الحفظ: ' + err.message` | Same |
| `OnboardingOverlay.jsx:179` | `'تعذّر حفظ حالة الإعداد: ' + (err?.message || 'خطأ غير معروف')` | Same |
| `DuaPicker.jsx:253,368,422` | `'فشل التحميل: ' + err.message` | Same |
| `UpdateSection.jsx:73,85` | `err?.message || 'خطأ غير متوقّع'` | Same |
| `UpdateBadge.jsx:51` | `جاري تحميل التحديث · ${pct}%` | `toArabicDigits(pct) + '٪'` |
| `UpdateSection.jsx:95` | `جاري التنزيل · ${percent}%` | Same |
| `HelpOverlay.jsx:136` | `['طريقة الحساب', config.method \|\| '—']` | Use `methods.find(m => m.id === config.method)?.ar` |
| `HelpOverlay.jsx:141` | `['التقويم', config.calendar \|\| '—']` | Same pattern via `calendars` |
| `hijri-events.js:26,32,33,40,43`; `tasbih.js`; `chunker.js:38` | `… ﷺ …` | `[doctrinal-review]` — verify with operator; if to change, replace with `صلى الله عليه وآله` |
| `PrayerTracker.jsx:396-403` | hadith text + chain | `[doctrinal-review]` — verify against authoritative source |
| `arafah.json:11`, `faraj.json:11`, `kumayl.json:11` | `… ع` | Standardise on full `عليه السلام` |
| `SettingsOverlay.jsx:428` | `إلغاء · Esc` (PIN-gate cancel) | Verify intent; if "close" then `إغلاق · Esc` |
| `SettingsOverlay.jsx:1311` | `رمز الدخول` | Unify with dominant `رمز PIN` (or vice versa) |
| `DuaPicker.jsx:283,318` | `'مضاف من القائم'` | `[doctrinal-review]` light — likely `مضاف من القائم على المسجد`; verify |
| `SettingsOverlay.jsx:48-52` | `'عادي (ذهب نحاسي)'`, `'شهادة (عقيق)'`, `'ولادة (ذهب دافئ)'`, `'عيد (أخضر طازج)'` | Verify caretaker reading naturally; consider plain alternatives |
| `DashboardFeatures.jsx:133` | `aria-label` `${deg} درجة، ${km} كيلومتر` (Latin digits) | Wrap deg/km in `toArabicDigits()` |
| `errors.js:58`; `SettingsOverlay.jsx:730,1337`; `mobile-control.js:757` | `٤ إلى ٨ أرقام` / `٤–٨ أرقام` / `(٤-٨ أرقام)` | Pick en-dash `٤–٨` |
| `mobile-control.js:118` | `تبقّى ${remaining} محاولة` (singular always) | Conditional plural per Arabic count rules |
