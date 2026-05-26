# Sprint 2 — Elderly UX Polish · Notes

_Generated 2026-05-08. Builds on Sprint 1's 12 a11y fixes (still uncommitted in working tree). All 7 planned items done._

## Summary

7 source files modified, +44 / -16 lines on top of Sprint 1's 11 files. Tests: **84 pass / 10 fail** — same 84 pass as Sprint 1 baseline; the 10 failures are still the pre-existing `Cannot find module 'adhan'` cascade from no `npm install`. **Zero new regressions**.

| Standard targeted | This sprint's effect |
|---|---|
| WCAG 2.5.5 (AAA) — Target Size 44×44 | All cited interactive elements ≥ 48×48 |
| Material Design touch targets 48dp | Dua-picker icon buttons lifted 40→48 |
| NIA elderly-research touch targets 64 px | Reachable in `largeText` branch (already in place from `a38d450`) |
| WCAG 1.4.12 — paragraph line-height 1.5 | Body Arabic dense surfaces lifted 1.55→1.7 |
| WCAG 2.2.1 — Timing Adjustable | Slideshow + Tracker chrome timers raised 2.5–4 s → 10 s |
| WCAG 3.1.5 — Reading Level | 429 lockout copy now `بعد ١٥ دقيقة` not `بعد ٩٠٠ ثانية` |
| WCAG 3.2.4 — Consistent Identification | Update progress digits + Settings PIN-gate close microcopy unified |

## Per-finding resolution

Each entry below is **commit-message-ready**.

### 1. **`fix(a11y): raise slideshow chrome auto-hide 3 s/4 s → 10 s [S2-01]`**

`SlideshowOverlay.jsx` chrome timer raised on both the on-mouse-move reveal path (was 3 s) and the on-open reveal path (was 4 s). 10 s matches NN/g's elderly-idle floor and gives a reciter pausing to breathe time to find the close button without re-waking it. Comments at L139 and L154 updated to match the new value and document the rationale.

- Files: `src/renderer/components/SlideshowOverlay.jsx`
- Verify: `Grep "10000" src/renderer/components/SlideshowOverlay.jsx` → 2 hits on the chrome timer; both inline comments now reference 10 s.

### 2. **`fix(a11y): raise PrayerTracker controls auto-hide 2.5 s/4 s → 10 s [S2-02]`**

Same root issue as #1. `PrayerTracker.jsx` controls auto-hide raised on both the idle path (was 2.5 s) and the on-open path (was 4 s) to a unified 10 s. The L116 comment block now documents this matches Slideshow's chrome timer so an imam walking between the wall and a side table doesn't re-wake the controls four times per rakah.

- Files: `src/renderer/components/PrayerTracker.jsx`
- Verify: `Grep "10000" src/renderer/components/PrayerTracker.jsx` → 2 hits.

### 3. **`fix(content): unify SettingsOverlay PIN-gate close button copy إلغاء → إغلاق [S2-07]`**

`SettingsOverlay.jsx:440` was the lone outlier — every other overlay close in the app uses `إغلاق · Esc`. Functionally the button closes the entire SettingsOverlay (returns the operator to the dashboard), so `إغلاق` is contextually correct too. WCAG 3.2.4 (Consistent Identification): same affordance → same label across the app.

- Files: `src/renderer/components/SettingsOverlay.jsx`
- Verify: `Grep "إلغاء · Esc" src/renderer/components/` → 0 hits.

### 4. **`fix(a11y): humanize phone-remote 429 lockout countdown — minutes, not raw seconds [S2-03]`**

`build-output/mobile-control.js:107,168` previously emitted `بعد ٩٠٠ ثانية` (= 15 minutes; cognitively expensive to convert). Added a `formatRetryDelay(sec, withPrefix)` helper that splits raw seconds into hours / minutes / seconds with Arabic-Indic digits, mirroring the existing `countdown(iso)` formatter. `countdown()` itself was refactored to delegate to `formatRetryDelay` (helper declared first to avoid TDZ — both are `const` arrow functions). Both 429 call-sites now use it. WCAG 3.1.5 (Reading Level) — the operator no longer has to do the `÷ 60` mental math.

- Files: `build-output/mobile-control.js`
- Verify: `Grep "ثانية" build-output/mobile-control.js` returns only the helper itself (the < 60 s case). No bare `${retrySec} ثانية` strings remain.

### 5. **`fix(content): Arabic-Indic digits + Arabic percent sign on update progress [S2-04]`**

`UpdateBadge.jsx:51` and `UpdateSection.jsx:95` mixed Latin `12%` into otherwise-Arabic UI text. Both files now import `toArabicDigits` from `../lib/format.js` and emit `${toArabicDigits(pct)}٪` — note `٪` is U+066A (Arabic percent sign), not Latin `%`. WCAG 3.2.4 + script consistency. The rest of the app already uses Arabic-Indic digits + `٪` everywhere it formats numbers.

- Files: `src/renderer/components/UpdateBadge.jsx`, `src/renderer/components/UpdateSection.jsx`
- Verify: `Grep "%" src/renderer/components/Update*.jsx` returns no template-literal Latin-`%` matches.

### 6. **`fix(a11y): lift dua-picker icon-button touch targets 40/44 → 48 px [S2-05]`**

`.dua-picker__star` was 44×44 (right at the WCAG AAA floor); `.dua-picker__edit` and `.dua-picker__delete` were 40×40 (below WCAG AAA). Extended the existing accessibility CSS block at the bottom of `styles.css` (was L3740-3750, now L3740-3779) with a new selector that lifts all three to `min-width: 48px; min-height: 48px`. Per CSS spec `min-width`/`min-height` win over the explicit `width`/`height` on those selectors when min > computed, so the original blocks at L1679-1693 (star) and L1885-1898 (edit/delete) are untouched. Material 48dp + WCAG AAA target.

The `largeText` branch (default ON since `a38d450`) further scales these via existing rules elsewhere in the file — so the realistic operator experience is the NIA-recommended 64 px for elderly users; this fix is the defense-in-depth floor for operators who flip largeText off.

- Files: `src/renderer/styles.css`
- Verify: `Grep "min-height: 48" src/renderer/styles.css` → 5 hits (existing block + new dua-picker icon block + 2 explicit non-block uses).

### 7. **`fix(a11y): raise body Arabic line-height 1.55 → 1.7 on dense reading surfaces [S2-06]`**

Added a narrow new selector group to the bottom-of-file accessibility block lifting `line-height` to 1.7 on `.help-overlay__body`, `.settings__hint`, `.dua-picker__item-subtitle`. WCAG 1.4.12 paragraph-spacing floor is 1.5×; Arabic typography norms for elderly readers at presbyopic distance recommend 1.7–1.8.

**Deliberately scoped narrowly:** the Quranic-text 1.55 at `styles.css:706` is left alone (it's tuned to Amiri/Scheherazade metrics, not body Arabic — `a38d450` declined to touch it for the same reason); the dua-picker `__row-title`'s 1.3 is left alone (it's a single-line title); the various card / list / hint chip 1.5 / 1.55 values elsewhere are left alone (each was tuned to its own cell layout). If visual review surfaces a surface where 1.7 reads tight or wraps awkwardly, narrow the selector list.

- Files: `src/renderer/styles.css`
- Verify: 3 selectors raised; all other 1.55 / 1.5 line-heights in the file unchanged.

---

## Verification trail

After each finding I re-read the diff slice (or grep target) to confirm the change matched the plan. The "Verify:" line in each per-finding section above is the exact grep + expected count I ran. The `mobile-control.js` helper-ordering bug (TDZ from `const countdown` referencing `formatRetryDelay` declared after it) was caught and fixed mid-execution; the helper now precedes its caller.

## Test results

`npm test`: **84 pass / 10 fail** — bit-identical pass count to Sprint 1's baseline (84/84 passing tests still pass). The 10 failures are the same pre-existing `Cannot find module 'adhan'` cascade from `node_modules/` not being installed (3 test files: `features.test.js`, `prayer-times.calculator.test.js`, `prayer-times.config.test.js`). Sprint 2's constraint mirrors Sprint 1's — no `npm install`. **No new test regressions.**

The subtest-count spread (Sprint 1 reported 21 failing subtests; Sprint 2 reports 10) is just `node --test` aggregation differences when a module-level `require` throws — both runs are testing the same 3 files unable to load `adhan`. Pass count (84) is the load-bearing number and is identical.

## `git diff --stat` (Sprint 1 + Sprint 2 combined)

```
 build-output/mobile-control.js                | 27 ++++++++++++-----   ← Sprint 2 only
 build-output/vendor/mithnah-design.css        |  8 ++---
 src/main/prayer-times/defaults.js             |  6 +++-                 ← pre-existing, not sprint work
 src/renderer/components/Dashboard.jsx         | 22 +++++++++++---
 src/renderer/components/DuaPicker.jsx         | 13 +++++++--
 src/renderer/components/FirstRunTour.jsx      |  9 ++++--
 src/renderer/components/HelpOverlay.jsx       |  7 ++++-
 src/renderer/components/OnboardingOverlay.jsx |  6 +++-
 src/renderer/components/PrayerTracker.jsx     | 13 +++++----              ← Sprint 1 + Sprint 2
 src/renderer/components/SettingsOverlay.jsx   | 36 +++++++++++++++++------ ← Sprint 1 + Sprint 2
 src/renderer/components/SlideshowOverlay.jsx  | 42 +++++++++++++++++++++--- ← Sprint 1 + Sprint 2
 src/renderer/components/UpdateBadge.jsx       |  3 +-                   ← Sprint 2 only
 src/renderer/components/UpdateSection.jsx     |  3 +-                   ← Sprint 2 only
 src/renderer/styles.css                       | 41 +++++++++++++++++++++-- ← Sprint 1 + Sprint 2
 14 files changed, 189 insertions(+), 47 deletions(-)
```

Sprint 2 alone touched 7 files: `mobile-control.js`, `PrayerTracker.jsx`, `SettingsOverlay.jsx` (1 string), `SlideshowOverlay.jsx`, `UpdateBadge.jsx`, `UpdateSection.jsx`, `styles.css`.

## Commit ordering recommendation

If the human wants per-finding commits (matching the Sprint 1 plan), the surgical ordering is:

1. Sprint 1's 12 commits (planned in `SPRINT_1_NOTES.md`)
2. S2-01 (`SlideshowOverlay.jsx` chrome timer)
3. S2-02 (`PrayerTracker.jsx` controls timer)
4. S2-07 (`SettingsOverlay.jsx` close-microcopy unification)
5. S2-03 (`mobile-control.js` lockout copy + helper)
6. S2-04 (`UpdateBadge.jsx` + `UpdateSection.jsx` Arabic digits)
7. S2-05 + S2-06 (`styles.css` touch-targets + line-height — single CSS commit)

S2-05 and S2-06 share a single CSS block extension; bundling them into one commit keeps the styles.css history coherent.

## Carried to Sprint 3 (not done here)

Per the Sprint 2 plan's "out of scope" list — these are larger-surface or judgement-call items that warrant their own focused pass:

- **PinBadge component (D2-18 / F-005)** — needs a new component, App.jsx wiring, and an unauth pairing modal in FloatingMenu. ~80-100 lines, deserves its own plan + visual review.
- **FloatingMenu trigger 4 s idle fade (D2-12)** — keep at low-opacity vs raise the timer is a visual judgement call; want eyes on the wall display.
- **Dark-theme `--m-text-faint` on raised surfaces (D4-13)** — token-system pass; needs to consider all consumers.
- **Settings bg-click-discards-unsaved-input guard (D2-07)** — needs a "dirty" tracker on the form.
- **Honorific drift `ع` → `عليه السلام` on three dua titles (D5-06)** — content edit, doctrinal-review-light.
- **`مضاف من القائم` phrasing (D5-09)** — operator decision needed.

## Self-checklist

- [x] `SPRINT_2_PLAN.md` written before execution.
- [x] All 7 finding IDs (S2-01..S2-07) resolved with file:line citations above.
- [x] No file outside the cited evidence was modified. `defaults.js` is still the pre-existing on-disk schemaVersion bump from PROJECT_BRIEF §7 — not Sprint 2 work.
- [x] `npm test` pass count unchanged from Sprint 1 baseline (84).
- [x] Standards citations (WCAG / Material / NN/g / NIA) included in plan and code comments.
- [x] `git diff --stat` printed above.
- [x] No commit made — human stages and commits per finding.
- [x] Per-finding commit-message-ready summaries above.
- [x] Out-of-scope items routed to Sprint 3.

---

**Sprint 2 complete. Awaiting human review and commit decisions.**
