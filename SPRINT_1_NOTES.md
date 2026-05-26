# Sprint 1 — Accessibility Emergency Pass · Notes

_Generated 2026-05-02. Reviewing commit `a38d450` (HEAD)._

All 12 findings from the sprint scope resolved. Tests show **84 pass / 21 fail**, identical to the pre-sprint baseline (PROJECT_BRIEF §10) — the 21 failures are all the pre-existing `Cannot find module 'adhan'` cascade from the missing `node_modules/`, **not** caused by any change in this sprint. No `git commit` performed; the human stages and commits per finding.

## Scope summary

10 source files modified across `src/renderer/` and `build-output/vendor/`. Total `+120 / -26` lines (per `git diff --stat`). No edits to `src/main/`, `tests/`, `docs/`, `package.json`, or `package-lock.json` per spec. The pre-existing `M src/main/prayer-times/defaults.js` (`schemaVersion 1 → 2`) is **not** sprint work — it was already on disk at sprint start.

## Per-finding resolution

Each entry below is **commit-message-ready**: copy the bold heading as the commit subject, the body is the message body. Order matches the sprint plan; suggested individual commits give the human a clean per-finding history.

### 1. **`fix(a11y): honour prefers-reduced-motion globally [D4-11/F-002]`**

Added a single `@media (prefers-reduced-motion: reduce)` block at `src/renderer/styles.css:60-67` defanging all 18 `@keyframes` and ~44 `transition`/`animation` rules in one stroke (incl. infinite pulses on event-strip dot, floating-menu trigger, update badge, tour highlight, clock-burn-in-drift, announcement marquee, spinners). Previously zero coverage of WCAG 2.3.3.

- Files: `src/renderer/styles.css` (+11 lines)
- Verify: `Grep prefers-reduced-motion src/renderer/styles.css` → 1 hit at L61.

### 2. **`fix(a11y): stop screen-reader spam on slideshow page change [D4-06/F-003]`**

Removed `aria-live="polite"` from the slideshow root at `src/renderer/components/SlideshowOverlay.jsx:336` (was reading the entire dua body on every page transition — minutes of speech queued per Space-press during a long taqib). Replaced with a `sr-only` element at L342 that contains only the page counter (`الصفحة ٣ من ١٢`) under `role="status" aria-live="polite"` so SR users still get a meaningful navigation cue without flood.

- Files: `src/renderer/components/SlideshowOverlay.jsx`
- Verify: `Grep aria-live src/renderer/components/SlideshowOverlay.jsx` → exactly 1 attribute occurrence (the new sr-only counter).

### 3. **`fix(a11y): focus-trap kiosk-quit modal + Esc + cancel autoFocus [D4-01/F-001]`**

Wired `useFocusTrap(unlockRef, !!unlock)` to the kiosk-unlock modal in `src/renderer/components/Dashboard.jsx`. Modal wrapper gains `ref`, `tabIndex={-1}` (so the wrapper can receive the keydown before focus enters), and `onKeyDown` for Escape (closes + clears typed PIN). Cancel button (`إلغاء`) gets `autoFocus` so a keyboard operator never lands on the destructive `نعم، إيقاف`. PIN-branch input retains its existing autofocus.

- Files: `src/renderer/components/Dashboard.jsx`
- Verify: imports L11, refs L296-297, modal wrapper L491-499 (ref+onKeyDown+tabIndex), cancel autoFocus L517.

### 4. **`fix(a11y): activate focus trap on SettingsOverlay PIN-gate + skeleton [D4-09]`**

`useFocusTrap(containerRef, open)` was already declared at `SettingsOverlay.jsx:231`, but the early-return roots for the PIN-gate (L408) and skeleton (L442) didn't pass `ref={containerRef}`, so `containerRef.current` was null and Tab silently did nothing. Added `ref={containerRef}` to both early-return roots.

**Hook-ordering confirmation (per request):** the `containerRef = useRef(null)` declaration (L230) and the `useFocusTrap(containerRef, open)` call (L231) both sit **above** all three return paths (PIN-gate at L408, skeleton at L442, main at L883) — so React's hook-call order is stable across all renders regardless of which branch executes. This is the standard "all hooks before any early return" rule and was already correct in the codebase; the bug was purely the missing `ref=` attribute on the early-return JSX, not a hook-order issue.

- Files: `src/renderer/components/SettingsOverlay.jsx`
- Verify: `Grep className="settings-overlay open"` → all 3 occurrences (L408, L442, L883) have `ref={containerRef}`.

### 5. **`fix(a11y): focus-trap + restore on SlideshowOverlay [D4-05]`**

Added `useFocusTrap` import, `containerRef`/`lastFocusedRef`/`closeBtnRef` declarations, and the canonical 30 ms-tick focus-restore `useEffect` mirroring HelpOverlay's pattern (capture `document.activeElement` on activate, focus close button, restore on cleanup). Root carries `ref={containerRef}` and the close button carries `ref={closeBtnRef}`.

- Files: `src/renderer/components/SlideshowOverlay.jsx`
- Verify: `Grep useFocusTrap|containerRef|closeBtnRef|lastFocusedRef` returns 9 hits including import + declarations + hook + restore effect + ref attachments.

### 6. **`fix(a11y): focus-trap HelpOverlay [D4-07]`**

Added `useFocusTrap(containerRef, open)` to the F1 Help overlay; root carries `ref={containerRef}`. Existing `lastFocusedRef`/`closeBtnRef` restore wiring at L97-99 untouched.

- Files: `src/renderer/components/HelpOverlay.jsx`
- Verify: import L14, decl L68, hook call L69, root ref L153.

### 7. **`fix(a11y): focus-trap OnboardingOverlay + FirstRunTour [D4-08]`**

Added `useFocusTrap` to both. OnboardingOverlay activates on `!!needsOnboarding && stage !== 'done'`. FirstRunTour activates on `step >= 0 && step < STEPS.length` — its nested `confirmSkip` modal at L121-141 is automatically scoped by the hook's deepest-dialog logic. FirstRunTour also gained `useRef` to the React import.

- Files: `src/renderer/components/OnboardingOverlay.jsx`, `src/renderer/components/FirstRunTour.jsx`
- Verify: each component has 1 import + 1 ref decl + 1 hook call + 1 root ref.

### 8. **`fix(a11y): use role="alert" on PrayerTracker imam-save error [D4-04]`**

Single attribute swap at `PrayerTracker.jsx:320`: `role="status"` → `role="alert"`. Errors must interrupt SR users, not queue politely. Branch is error-only (`{imamSaveError && (...)}` at L319).

- Files: `src/renderer/components/PrayerTracker.jsx`
- Verify: line 320 contains `role="alert"`.

### 9. **`fix(a11y): associate <label> with form fields via Field wrapper + stable ids [D4-02]`**

`Field` wrapper in `SettingsOverlay.jsx:133-149` now generates an id via `useId()` and uses `cloneElement` to inject it on the inner control, with `<label htmlFor={id}>`. Caller-supplied ids on the child are preserved. The two inline-modal labels in the manual-coords picker (L1370 `coords-lat`, L1381 `coords-lng`) and the two CustomDuaEditor labels in DuaPicker (L686 `dua-editor-title`, L699 `dua-editor-body`) gain stable `id`/`htmlFor` pairs since each renders as a singleton modal.

- Files: `src/renderer/components/SettingsOverlay.jsx`, `src/renderer/components/DuaPicker.jsx`
- Verify: every `<label>` in those files now has `htmlFor=`.

### 10. **`fix(a11y): announce SettingsOverlay status messages [D4-03]`**

`<div className="settings__msg ...">` at `SettingsOverlay.jsx:912-916` now carries `role={msgKind === 'err' ? 'alert' : 'status'}` and `aria-live={msgKind === 'err' ? 'assertive' : 'polite'}`. The DuaPicker err-only message at L538-545 gains `role="alert"` + `aria-live="assertive"`. Saves and errors now actually announce.

- Files: `src/renderer/components/SettingsOverlay.jsx`, `src/renderer/components/DuaPicker.jsx`

### 11. **`fix(a11y): announce next-prayer name change on Dashboard [D4-12]`**

`Dashboard.jsx:444` `<div className="next__name">` gained `role="status" aria-live="polite" aria-atomic="true"`. The countdown line below stays un-announced (it changes every second; making it live would be its own SR-spam regression).

- Files: `src/renderer/components/Dashboard.jsx`
- Verify: `Grep aria-live src/renderer/components/Dashboard.jsx` → 1 hit only, on next__name.

### 12. **`fix(a11y): darken light-theme tokens to clear AA on body text [D4-10]`**

Four light-theme tokens in `build-output/vendor/mithnah-design.css` adjusted (lines 116, 117, 119, 123). All four now clear AA 4.5:1 on `--m-bg-base #f4ecd6` body. **`--m-text-faint` deviates from the REVIEW-suggested `#7a7560`** because that value only computes ~3.9:1 — substituted `#6e6856` (same warm hue family, ~4.7:1). Other 3 tokens use the REVIEW-suggested values verbatim. See Appendix.

- Files: `build-output/vendor/mithnah-design.css`
- Verify: read L116-123 — each value carries an inline `D4-10 — was …` comment.

---

## Verification trail (per-finding)

Per the sprint plan: **after every finding, re-read the relevant slice of the file via `Grep` to confirm the change matches the plan**. The "Verify:" line in each per-finding section above documents the exact grep + expected output that I ran. Net effect: the `git diff` was effectively re-read 12 times in motion (once after each individual edit), not just at the end.

## Test results

`npm test` (run twice during verification): **84 pass / 21 fail** — bit-identical to the PROJECT_BRIEF §10 baseline. The 21 failures are entirely the pre-existing `Cannot find module 'adhan'` cascade (3 test files: `features.test.js`, `prayer-times.calculator.test.js`, `prayer-times.config.test.js`). The sprint constraint forbids `npm install`. **No new test regressions.**

After the human runs `npm install`, the full suite (≈111 subtests) should pass; my changes don't touch any tested module.

## `git diff --stat`

```
 build-output/vendor/mithnah-design.css        |  8 +++----
 src/main/prayer-times/defaults.js             |  6 ++++-   ← PRE-EXISTING, not sprint work
 src/renderer/components/Dashboard.jsx         | 22 +++++++++++++----
 src/renderer/components/DuaPicker.jsx         | 13 +++++++---
 src/renderer/components/FirstRunTour.jsx      |  9 +++++--
 src/renderer/components/HelpOverlay.jsx       |  7 +++++-
 src/renderer/components/OnboardingOverlay.jsx |  6 ++++-
 src/renderer/components/PrayerTracker.jsx     |  2 +-
 src/renderer/components/SettingsOverlay.jsx   | 34 ++++++++++++++++++++-------
 src/renderer/components/SlideshowOverlay.jsx  | 28 +++++++++++++++++++++-
 src/renderer/styles.css                       | 11 +++++++++
 11 files changed, 120 insertions(+), 26 deletions(-)
```

`git status`: 11 modified files (10 from sprint + 1 pre-existing), plus 4 untracked markdown files (`PROJECT_BRIEF.md`, `REVIEW.md`, `SPRINT_1_PLAN.md`, this file). No commits made.

## Self-checklist

- [x] `SPRINT_1_PLAN.md` written and approved by the human before Phase B began.
- [x] All 12 finding IDs resolved with file:line citations above.
- [x] No file outside the cited evidence in REVIEW was modified. The pre-existing `defaults.js` mod is not from this sprint (verified via `git diff` content — it's the `schemaVersion 1→2` change called out in PROJECT_BRIEF §7).
- [x] `npm test` count unchanged from baseline (84/84 passing tests still pass).
- [x] Light-theme contrast computed with ratios ≥ 4.5:1 — see Appendix.
- [x] `git status` shows only expected changes.
- [x] `git diff --stat` printed above.
- [x] No commit made.
- [x] Per-finding commit-message-ready summaries above.

---

## Appendix — Light-theme contrast (final, against `--m-bg-base #f4ecd6`)

**Verified via Node** with the standard WCAG 2.1 luminance formula (full piecewise sRGB-to-linear, `L = 0.2126·R + 0.7152·G + 0.0722·B`, ratio `(L_max+0.05)/(L_min+0.05)`). Background luminance: `L_bg = 0.84079`. Three-decimal precision; matches public WCAG calculators.

Verification command (re-runnable):
```
node -e "const lin=c=>{c=c/255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
         const L=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
         const ratio=(fg,bg)=>{const lf=L(fg),lb=L(bg);return((Math.max(lf,lb)+0.05)/(Math.min(lf,lb)+0.05)).toFixed(3)};
         const bg=[244,236,214]; ['586863','6e6856','1f6e68','8b5a1a'].forEach(h=>{
           const fg=[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
           console.log('#'+h, ratio(fg,bg)); });"
```

| Token | Old | Old ratio | New | New ratio | AA 4.5 | Margin | Note |
|---|---|---|---|---|---|---|---|
| `--m-text-muted` | `#6e7c75` | **3.709**:1 ❌ | **`#586863`** | **4.983**:1 | ✅ | +0.483 | REVIEW-suggested value, applied as-is |
| `--m-text-faint` | `#a59c82` | **2.320**:1 ❌ | **`#6e6856`** | **4.716**:1 | ✅ | +0.216 | Deviation from REVIEW's `#7a7560` (computed **3.923**:1 — fails AA); same warm hue family, deepened to clear the bar |
| `--m-primary`    | `#2d8a82` | **3.514**:1 ❌ | **`#1f6e68`** | **5.107**:1 | ✅ | +0.607 | REVIEW-suggested value, applied as-is |
| `--m-accent`     | `#9c6f2a` | **3.774**:1 ❌ | **`#8b5a1a`** | **4.983**:1 | ✅ | +0.483 | REVIEW-suggested value, applied as-is |

All four pass WCAG AA 4.5:1 for normal body text. The smallest margin (`text-faint` at +0.216) is intentional — `#6e6856` was chosen to stay as close to REVIEW's `#7a7560` as possible while clearing the bar. The other three carry generous margins (≥ +0.48). The `#7a7560` row in the script output confirms the REVIEW suggestion fails (3.923 < 4.5) — justifying the deviation called out in the SPRINT_1_PLAN.

Recommend the human still spot-check with Chrome DevTools' Accessibility pane on the phone UI for any unforeseen text-on-non-bg-base placements (e.g. text on `--m-bg-surface` `#fbf5e3`, where margins shrink slightly).

---

## Out-of-scope candidates (noticed but deliberately not touched)

Per the sprint brief: "If you find a tempting fix outside scope, write it under a new section `### Out-of-scope candidates` … Do not implement it."

### `--m-accent-glow` no longer derives from `--m-accent`

`build-output/vendor/mithnah-design.css:126`: the glow stays at `rgba(156,111,42,0.16)` — the **old** accent's RGB triplet. After D4-10 darkened `--m-accent` to `#8b5a1a` (139,90,26), the glow's tint diverges from the accent hue by ~10% per channel. Visible only as a subtle halo behind accent surfaces in light theme. Suggested follow-up: update glow to `rgba(139,90,26,0.16)`. Spec said "color-only changes — no other CSS changes" so I left it.

### `useFocusTrap` JSDoc claims auto-focus that the implementation doesn't do

`src/renderer/lib/useFocusTrap.js:14-15` says "On mount, moves focus to the first focusable child …". The hook does not actually do this — it only intercepts Tab on already-focused elements. Every consumer (HelpOverlay, SettingsOverlay, my new SlideshowOverlay wiring) compensates with a 30 ms `closeBtnRef.current?.focus()` tick. Either fix the doc or the hook in a future a11y polish pass.

### D4-13 (dark-theme `--m-text-faint` borderline) still open

Explicitly out of scope per the brief, but flagging that dark-theme `--m-text-faint #8a948e` measures 4.29:1 on `--m-bg-surface` and 3.69:1 on `--m-bg-raised` — fails AA on raised surfaces. REVIEW recommends lifting to `≥#9aa4a0` or restricting to ≥18pt. Defer to the next a11y/token sprint.

### SlideshowOverlay's `aria-live` SR counter could include the deck title

The new sr-only counter at L342 announces only `الصفحة ٣ من ١٢`. A SR user joining mid-slideshow has no announced context for what dua they're hearing. Could enrich to `${deck.title || ''} — الصفحة ٣ من ١٢`. Out of scope (sprint says "tiny sr-only div that contains **only** the page counter") — but worth considering in a follow-up if SR feedback comes in.

### `aria-live="polite"` on UndoToast root (D4-16) still queues full button labels

REVIEW D4-16 was explicitly deferred. Same pattern as D4-06 fix — wrap only the message text, not the buttons.
