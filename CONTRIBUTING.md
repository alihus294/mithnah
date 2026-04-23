# Contributing to Mithnah

Thanks for considering a contribution. Mithnah is a volunteer-maintained,
offline-first, MIT-licensed mosque display for Shia Ithna Ashari
(Twelver) communities. Contributions are welcome from anyone.

## Scope policy

Mithnah is **specifically** for Shia Twelver mosque displays. This
scope choice makes the project opinionated in ways that may seem
restrictive:

- Default prayer-time method is Jafari (Leva Institute).
- Default Hijri calendar is the jafari variant.
- The slideshow registry only contains Shia duas, ziyarat, taqibat.
- Marja picker lists Twelver marjas (with a "Custom" escape hatch).

Pull requests that broaden scope to "generic Muslim" or add Sunni
default content will be redirected to a fork. The engine does support
Sunni methods (UmmAlQura, Egyptian, etc.) as user-selectable options,
and operators can always flip those on — but the project's identity
stays Shia Twelver.

Pull requests that **deepen** Shia Twelver accuracy (more marjas, more
ziyarat from verified sources, tighter fiqh on edge cases) are
always welcome.

## Content contributions (duas, ziyarat, events)

All religious content must cite an authoritative Shia source. Preferred:

1. **مفاتيح الجنان — الشيخ عباس القمي** (primary)
2. **الصحيفة السجادية** — الإمام السجاد (ع)
3. **بحار الأنوار — العلامة المجلسي**
4. **الكافي — الكليني**
5. Marja-office publications when a specific marja's wording is used

Every PR adding a dua, ziyarah, or hijri event must:
- Include a `source` field citing the book + chapter or page.
- Be reviewed by a حوزوي طالب علم or a practicing sheikh before merge.
  If the PR author doesn't have such a reviewer, the maintainer will
  arrange one (typically 1-2 weeks).
- Match the exact Arabic text of the source — no paraphrasing.
- Include a `fiqh: 'shia'` tag (the registry's schema requires this).

Errors of transcription are the biggest risk in religious content;
tests can't catch them, so human review is mandatory.

## Code contributions

Standard GitHub flow:

1. Fork the repo.
2. Create a feature branch (`git checkout -b fix-prayer-times-edge-case`).
3. Make your changes.
4. Run `npm test` — all 79+ tests must pass.
5. Run `node --check` on every changed file.
6. Commit with a descriptive message explaining *why*, not just *what*.
7. Push + open a Pull Request.

### What CI checks

- `npm test` (Node built-in test runner).
- `node --check` on every main-process file.
- `npm run strip-bundle` audit (no forbidden external URLs present).

### Code style

- **CommonJS** for main process (not ESM) — Electron 28 support.
- **No build step** for main-process code — runs directly.
- **Pure functions where possible** — main process has minimal state.
- **Tests next to implementation** (`tests/<module>.test.js`).
- **Design tokens** (`var(--m-*)`) in widgets — no inline hex, rgba,
  or px values where a token exists. Token audit on each widget must
  show `#hex count: 0`.
- **JSDoc on public exports** is nice but not mandatory.
- **Inline comments explain WHY, not WHAT** — the code itself explains
  what it does; the comments explain why it does it that way.

### Testing philosophy

- Every new public function gets at least one happy-path + one failure
  test.
- Fiqh-relevant calculations get reference-value tests (known correct
  times for known locations/dates).
- HTTP endpoints get integration tests with supertest-like curl
  assertions.
- Widget DOM logic is tested where practical (escapeHtml, state
  machines); pure-presentational CSS is not unit-tested.

## Security issues

See `SECURITY.md`. Short version: don't open a public issue for a
security bug. Email the maintainer directly and allow 30 days for a
fix before public disclosure.

## Governance

The project has (currently) a single maintainer. Decisions are made
openly via GitHub Issues and Discussions. Large architectural changes
require a pre-implementation RFC (open as an Issue with the `rfc`
label, wait at least 7 days for comment).

When the project has ≥3 active contributors with ≥10 merged PRs each,
governance moves to a simple voting model documented in
`GOVERNANCE.md` (to be added at that time).

## Code of Conduct

Be respectful. This is a religious community project — assume good
faith, don't assume your fiqh is the only fiqh. Disagreements on
religious content are resolved by citing sources, not by consensus.

See `CODE_OF_CONDUCT.md` for the full text (Contributor Covenant v2.1).

---

Jazaakum Allahu khairan for your help.
