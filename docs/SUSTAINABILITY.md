# Sustainability plan for Mithnah

Goal: keep Mithnah free, offline-first, and maintainable for a decade
with zero recurring infrastructure cost.

## Cost audit — the path to $0/year

| Service            | Paid default            | Free path Mithnah uses                     | Notes                                 |
| ------------------ | ----------------------- | ------------------------------------------ | ------------------------------------- |
| Code signing       | ~$300/year EV cert      | **SignPath.io Foundation**                 | Free for verified OSS projects        |
| Installer hosting  | CDN / S3                | **GitHub Releases**                        | Unlimited download bandwidth, public  |
| Auto-update feed   | Custom server           | **GitHub Releases** + `electron-updater`   | `latest.yml` is a release artifact    |
| CI builds          | $0.008/min paid         | **GitHub Actions** public-repo quota       | 2,000 min/month free, more than enough |
| Website            | Hosting + domain        | **GitHub Pages** on `*.github.io`          | Custom domain optional ($10-12/yr)    |
| Crash reporting    | Sentry / Bugsnag        | **None** — offline-first forbids telemetry | Operators report via GitHub Issues    |
| Content updates    | CMS                     | **None needed** — Hijri/prayer data is fixed | No dynamic content to serve          |
| Fonts              | TypeKit / Monotype      | **Bundled Google Fonts (OFL license)**     | One-time download, ship offline       |
| Translations       | Crowdin / Lokalise      | **In-repo JSON** (when we need en/fa/ur)   | Git PR-based contributions            |
| **Total recurring** | $300+/year             | **$0/year**                                |                                       |

Optional paid upgrades:
- Custom domain `mithnah.org` — ~$12/yr (domain registrar). Not needed
  if `github.io` subdomain is acceptable.
- EV code signing — ~$300/yr. **Not needed** if SignPath Foundation
  sponsorship is approved.

## Setting up SignPath Foundation (free code signing)

SignPath.io has a Foundation program that sponsors code signing for
verified open-source projects. Without this, every Windows install
shows SmartScreen "Unknown Publisher — Don't run" — which kills the
onboarding for a caretaker who isn't sure whether to trust the .exe.

**Prerequisites** (must be true before applying):
1. Public GitHub repository with clear README.
2. `LICENSE` file (Mithnah is MIT ✓).
3. Project is actively maintained (≥1 commit/month).
4. Binaries are built reproducibly from source on CI (GitHub Actions).
5. No malicious / unwanted-software signals.

**Application process:**
1. Register at https://signpath.io (free developer account).
2. Visit https://signpath.org/foundation-for-open-source-projects
3. Submit application referencing:
   - Repo URL (must be public)
   - Maintainer GitHub profile
   - Brief description of Mithnah's purpose (mosque display for Shia
     Ithna Ashari communities, offline, MIT licensed)
   - Expected signing cadence (4–12 releases/year)
4. Approval typically takes 1–3 weeks.
5. Once approved, they issue a certificate **they** hold; you upload
   binaries to their SignPath portal and download signed versions.
6. Integrate into `.github/workflows/release.yml` using the SignPath
   GitHub Action (`SignPath/github-action-submit-signing-request`).

Alternative if SignPath declines or delays:
- **Azure Trusted Signing**: ~$10/month, pay-as-you-go, official MS
  option, good compatibility. ~$120/yr.
- **Certum Open Source Code Signing**: €30/yr. Easier approval.
- **Unsigned**: $0 but every install shows SmartScreen. Loses ~70%
  of non-technical users at the warning dialog.

## Release cadence — optimize for maintenance cost

Aim for **quarterly** releases, not continuous deploys:

- **v0.4 (stable)** — ship after 1-2 weeks of real-mosque field testing
- **v0.4.1–v0.4.n** — patches only for 3 months
- **v0.5** — next minor with new features if volunteered
- Security patches for Electron Chromium CVEs as soon as upstream ships

Each release:
1. Bump version in `package.json`.
2. Update `CHANGELOG.md`.
3. Tag `v0.4.0`, push tag.
4. CI builds installer + latest.yml.
5. CI submits to SignPath, gets signed binary back.
6. CI creates GitHub Release with signed .exe + .blockmap + latest.yml.
7. Users receive auto-update within 6 hours of release.

No continuous deployment. No hotfixes without a tag.

## Community-maintainable without a core team

Mithnah should survive if the current maintainer becomes busy for a year.

- **Code is small and conventional** (~2000 lines main process, ~500
  test cases) — a new maintainer can read the whole thing in a weekend.
- **Tests are the contract** — 79 passing tests catch most regressions.
- **All modules are pure Node with no build step for main-process**.
- **Design system is self-documenting** via `mithnah-design.css`.
- **Content is data** — adding a new marja or dua is a JSON-style edit
  in `src/main/shia-content/` or `src/main/marja/index.js`, no code.
- **Git history is narrated** — every commit message explains *why*.

## Governance for long-term stability

See `GOVERNANCE.md` (to be added) for:
- Who can cut a release (maintainer list).
- PR review criteria (tests pass, fiqh content scholar-reviewed).
- Scope policy: Mithnah is for Shia Twelver mosque displays. Pull
  requests to add Sunni-specific content get redirected to a fork.
- Security incident response (how to report + who fixes + disclosure).
- EOL policy: if Electron 28 is truly EOL and no one upgrades to 33,
  the current version becomes a "legacy build" link and users are
  directed to newer Electron branches.

## What could break this plan

1. **SignPath Foundation rejects** — fall back to Certum (€30/yr) or
   accept unsigned (document the SmartScreen workaround for users).
2. **GitHub changes pricing** — unlikely for public repos, but
   contingency: migrate to Codeberg (gitea, free) or GitLab free tier.
3. **Electron ecosystem dies** — extremely unlikely, but main process
   is already portable; renderer can be rebuilt with any web stack.
4. **Maintainer burnout** — covered by community-maintainable principle
   above. Short of that, declare a "v1.0 final" and freeze.

## Operator-facing distribution

The caretaker's path to running Mithnah should be one click + one tap:

1. **Download the signed `.exe`** from https://github.com/OWNER/mithnah/releases/latest
2. **Double-click** — no SmartScreen warning (signed).
3. **App opens fullscreen** with QR code, PIN, and "قريباً" banner.
4. **Scan QR with phone** — enters mobile-control.
5. **Enter PIN, onboarding wizard** — 3 steps (PIN, marja, GPS).
6. **Done.** App runs autonomously, auto-updates every 6 hours.

Zero ongoing cost to the caretaker. Zero ongoing cost to the maintainer.
Free forever, sustainably.
