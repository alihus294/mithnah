# Agent Prompts — Round 2 Elderly UX Hardening

> Open 4 Claude Code sessions in `C:\Users\Ali\Coding projects\mithnah\` and paste one prompt per session. Agents can run in parallel — files are partitioned so no two agents touch the same file.


---

## Agent A — main process + Settings overlay

```
You are Agent A — main process + Settings overlay owner.

Your file ownership:
- src/main/index.js
- src/main/app-features.js
- src/renderer/components/SettingsOverlay.jsx

Do not touch any file outside this list. Other agents own everything else.

Your work this session is Round 2 only (1 item).

Read FIX_PLAN.md and find the section "Round 2 — Elderly UX Hardening (2026-05-26)". Execute item A.12 (PIN gate missing length hint).

The item gives you:
- Exact file:line
- The exact JSX to insert
- Acceptance criteria

Baseline rules:
- Don't break npm test (must stay at 114/114).
- One commit, message format: fix(ux-elderly): add 4-8 digits hint to settings PIN gate  [§A.12]
- Don't touch other agents' files (Dashboard.jsx, Ornaments.jsx, mobile-control.html, etc.).

Done when:
1. Hint "٤ إلى ٨ أرقام" visible in PIN unlock gate.
2. npm test passes.
3. Commit created.

Start by reading FIX_PLAN.md section "A.12 — PIN gate missing length hint" then implement.
```

---

## Agent B — updater + mobile-control phone UI

```
You are Agent B — updater + mobile-control phone UI owner.

Your file ownership:
- src/main/updater/index.js
- build-output/mobile-control.html
- build-output/mobile-control.js

Do not touch any file outside this list.

Your work this session is Round 2 only (2 items).

Read FIX_PLAN.md and find the section "Round 2 — Elderly UX Hardening (2026-05-26)". Execute items:

- B.7 — Mobile: remove letter-spacing from 5 Arabic styles in mobile-control.html (selectors: .card__eyebrow, .hero__label, .event__kind, .lib__count, .set-row__label). Also remove text-transform: uppercase from the same 5.
- B.8 — Mobile: enlarge nav tab labels from clamp(0.7rem, 3vw, 0.85rem) to clamp(0.95rem, 3.5vw, 1.05rem). Single line at .nav__btn (line 273).

Each item in FIX_PLAN.md gives exact line numbers, before/after CSS, and acceptance criteria.

Baseline rules:
- Don't break npm test.
- One commit per item:
  - fix(ux-elderly): remove letter-spacing from Arabic in mobile-control  [§B.7]
  - fix(ux-elderly): enlarge mobile nav tab labels to 15-19px  [§B.8]
- Don't touch src/renderer/* (that's Agent A and C).

Done when:
1. All 5 letter-spacing declarations removed from the listed selectors.
2. Nav tab font-size updated.
3. npm test passes.
4. 2 commits created.

Start by reading FIX_PLAN.md sections B.7 and B.8.
```

---

## Agent C — wall renderer (heaviest agent — 11 items)

```
You are Agent C — wall renderer (Dashboard, DuaPicker, styles, Ornaments, SlideshowOverlay).

Your file ownership (Round 2 extended):
- src/renderer/components/Dashboard.jsx
- src/renderer/components/DashboardFeatures.jsx
- src/renderer/components/DuaPicker.jsx
- src/renderer/components/Ornaments.jsx        (extended for Round 2)
- src/renderer/components/SlideshowOverlay.jsx (extended for Round 2)
- src/renderer/styles.css

Do not touch any file outside this list. No SettingsOverlay.jsx, no mobile-control.*, no main process.

Your work this session is Round 2 only (11 items).

Read FIX_PLAN.md section "Round 2 — Elderly UX Hardening (2026-05-26)". Execute items C.5 through C.15.

Suggested order (CSS-only first to reduce JSX edit conflicts):
1. C.8  — Remove letter-spacing from 5 wall Arabic styles in styles.css (lines 390, 499, 528, 711, 2265). Also remove text-transform: uppercase from same 5.
2. C.9  — Raise .event-strip__countdown-kind font-size floor 10→16px (styles.css:497).
3. C.10 — Enlarge .dua-picker__edit/delete 40→48 with adjusted spacing (styles.css:2015, 2026, 3690-3691, 1800).
4. C.11 — Enlarge .imam-list-editor__remove 32→48, largeText 40→56 (styles.css:3552-3553, 3729).
5. C.13 — Enlarge .settings__adjust-btn 40→48 + add largeText 56 override (styles.css:2727-2728, new override near line 3720).
6. C.14 — Enlarge .dua-picker__welcome-close 36→44 (styles.css:1873).
7. C.6  — Ornaments.jsx:135 — SalawatLine size='sm' fontSize 14→18.
8. C.5  — DuaPicker.jsx:701 — replace window.confirm with inline modal (use CustomDuaEditor in same file as the pattern).
9. C.12 — DuaPicker.jsx:788 — add maxLength={20000} to textarea + character counter UI.
10. C.7 — Dashboard.jsx:216 (starSize 11→14), :246 (9→12), SlideshowOverlay.jsx:506 (size 10→14). Manual visual test required.
11. C.15 — Dashboard.jsx:562-573 — swap kiosk-unlock button classes. Add .inline-modal__btn--danger style in styles.css.

Each item in FIX_PLAN.md has exact file:line, code snippets, and acceptance criteria.

Baseline rules:
- Don't break npm test (must stay at 114/114).
- One commit per item, message format: fix(ux-elderly): <one-sentence>  [§C.X]
- 11 commits total expected.

Done when:
1. All 11 items implemented per their acceptance criteria.
2. npm test passes.
3. 11 commits exist on the branch.
4. Manual visual check on C.7 (AlayhiSalam sizes) confirms event-strip layout still fits.

Start by reading FIX_PLAN.md Round 2 section, then execute in the order above.
```

---

## Agent D — docs/CI/build (no Round 2 items)

```
You are Agent D — docs, CI, and build config owner.

Your file ownership:
- README.md
- docs/*
- .github/workflows/*
- package.json
- vite.config.js
- build/installer.nsh

Round 2 (Elderly UX Hardening) has zero items assigned to you. The wall-renderer, mobile UI, and main-process work belong to Agents A/B/C.

However, FIX_PLAN.md Round 1 still has 8 items for you (D.1 through D.8):
- D.1 README ARCHITECTURE link fix
- D.2 Code-signing path (SignPath)
- D.3 engines field in package.json
- D.4 release.yml SHA256SUMS
- D.5 README test count 79 → 114
- D.6 PLACEHOLDER cleanup in docs
- D.7 Vite 5→7, electron-builder 24→25
- D.8 Electron 28→33 upgrade (do LAST — it smoke-tests everyone else's merged work)

If you have time this session, execute Round 1 items D.3, D.5, D.6, D.1 (the quick wins). Hold D.2/D.7/D.8 until A/B/C have merged their Round 1 + Round 2 work.

Baseline rules:
- Don't touch src/* (those belong to A, B, C).
- One commit per item: fix(docs/ci/build): <sentence>  [§D.X]
- npm test must stay green.

Done when:
1. The quick-win Round 1 items (D.3, D.5, D.6, D.1) are committed.
2. The bigger items (D.2 SignPath, D.7 dep bumps, D.8 Electron) are scheduled for a later session after Agents A/B/C merge.

Start by reading FIX_PLAN.md sections D.1-D.8.
```

---

## How to use these prompts

1. Open 4 Claude Code sessions in `C:\Users\Ali\Coding projects\mithnah\`.
2. Paste the prompt for Agent A into session 1. Hit enter.
3. Paste the prompt for Agent B into session 2. Hit enter.
4. Paste the prompt for Agent C into session 3. Hit enter.
5. Paste the prompt for Agent D into session 4. Hit enter.
6. All four work in parallel; each only touches its own files.

## Conflict guarantee

| Agent | Files touched |
|-------|---------------|
| A | `src/main/index.js`, `src/main/app-features.js`, `src/renderer/components/SettingsOverlay.jsx` |
| B | `src/main/updater/index.js`, `build-output/mobile-control.{html,js}` |
| C | `src/renderer/components/{Dashboard,DashboardFeatures,DuaPicker,Ornaments,SlideshowOverlay}.jsx`, `src/renderer/styles.css` |
| D | `README.md`, `docs/*`, `.github/workflows/*`, `package.json`, `vite.config.js`, `build/installer.nsh` |

No file appears in more than one row. The 4 agents can merge in any order without rebase conflicts.

## Merge order recommendation

1. A's commits.
2. B's commits.
3. C's commits.
4. D's quick wins (D.3, D.5, D.6, D.1).
5. D.7 (Vite/electron-builder bump) — run smoke test.
6. D.8 (Electron 28→33) — run full smoke test on packaged installer.
