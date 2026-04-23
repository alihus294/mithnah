# Release playbook

How to cut a release of Mithnah that auto-update clients will consume.

## Prerequisites (one-time)

1. **Create the GitHub repo.** Public. Name it `mithnah` (matching
   `build.publish.repo` in `package.json`).
2. **Set the real GitHub username** in `package.json` →
   `build.publish.owner`. Replace `REPLACE_ME_BEFORE_RELEASE` with your
   actual username or organisation. Commit the change.
3. **No code signing yet.** The first installation will show a
   SmartScreen warning until the app accumulates reputation (or a
   SignPath Foundation cert is granted — see
   `docs/SIGNPATH-APPLICATION.md`). `docs/FOR-MOSQUE-OPERATORS.md`
   already explains the "unknown publisher" dialog to caretakers.
4. **GitHub Actions permissions.** In the repo Settings → Actions →
   General → Workflow permissions, set **Read and write**. The release
   workflow needs this to create releases and upload assets.

## Per-release procedure

All commands run from `project/`.

```powershell
# 1. Make sure the working tree is clean and tests pass locally.
git status    # expect "nothing to commit, working tree clean"
npm test

# 2. Bump the version. Follow semver:
#    - patch (0.5.0 -> 0.5.1): bug fixes only
#    - minor (0.5.x -> 0.6.0): new features, no breaking changes
#    - major (0.x.y -> 1.0.0): breaking changes
$newVersion = '0.5.1'  # ← edit this
npm version $newVersion --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): v$newVersion"

# 3. Local dry-run build. Catches electron-builder config problems
#    before CI wastes 10 minutes on the same failure.
npm run dist:win
# Produces dist/electron-builder/Mithnah Setup $newVersion.exe plus
# .blockmap and latest.yml. Install the .exe locally once and verify:
#   - The app opens with the new version in the title / about box.
#   - Console shows [Mithnah] init + [updater] initialized on startup.
# Then uninstall.

# 4. Tag and push.
git tag -a v$newVersion -m "Mithnah v$newVersion"
git push origin main
git push origin v$newVersion

# 5. Watch the Actions tab. The release workflow will:
#    - npm ci
#    - run tests
#    - electron-builder --publish always
#    - attach .exe + .exe.blockmap + latest.yml to the Release.

# 6. On the GitHub Releases page, the release starts as a draft. Edit
#    its description (changelog) and publish. Clients running Mithnah
#    will see the update within 6 hours of the next periodic check, or
#    immediately on the next launch.
```

## Rollback

If a release ships a broken build:

1. Delete or mark-as-pre-release the GitHub Release (don't just delete
   the tag; clients may have already cached `latest.yml`).
2. Cut a `v$newVersion+1` with the fix ASAP. electron-updater always
   prefers the newest release, so a higher-numbered fix supersedes the
   broken one on every client's next check.
3. For clients who already installed the broken build, ship a hotfix
   release ≥ their installed version. Auto-install on app quit will
   pick it up.

Never reuse a version number. Go forward, not back.
