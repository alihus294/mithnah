# Security policy

Mithnah is a mosque display app — it runs unattended on a public PC,
exposes an Express server on the LAN, accepts commands from phones on
the same network. Security matters.

## Reporting a vulnerability

**Do not open a public GitHub Issue for a security bug.**

Email the maintainer directly at (to be filled by the repo owner —
suggest: `security@mithnah.org` if custom domain, else maintainer's
GitHub-verified email).

Include:
- Description of the vulnerability.
- Steps to reproduce (ideally with a curl/HTTP payload or a test case).
- Expected vs actual behavior.
- Which version(s) are affected.
- Any proposed fix.

We aim to:
- Acknowledge within 72 hours.
- Triage + classify within 7 days.
- Ship a fix within 30 days for HIGH/CRITICAL, 90 days for MEDIUM.

You'll be credited in the release notes unless you prefer anonymity.

## Scope

In scope:
- Remote-code-execution / privilege escalation.
- Authentication bypass on Express routes or socket.io handshake.
- Persistent data tampering (bad input → bad config after save).
- Network policy bypass (external URL reached despite offline mode).
- XSS in any widget that renders untrusted data.
- Denial of service that requires < 100 packets.

Out of scope:
- LAN-only threats assuming an attacker with local PIN knowledge
  (these are "admin-level" operations — fix policy, not code).
- Attacks requiring Windows administrator access on the host machine.
- Issues in Electron itself — report to
  https://www.electronjs.org/docs/latest/tutorial/security.
- Issues in adhan-js / electron-updater / other dependencies — report
  to those projects; we'll bump the version once fixed upstream.

## Hardening defaults

Mithnah ships with these defaults:

- `session.webRequest` blocks all external HTTPS (offline-first).
- Express binds `0.0.0.0` (LAN-reachable) but requires PIN auth and
  rejects cross-origin POSTs via same-origin middleware.
- PIN rate-limited to 5 attempts/15-min/IP.
- PIN derived from per-device hash — different on every install.
- Socket.io accepts tokens only from the `auth` handshake field, never
  query string.
- CSP with `frame-ancestors 'none'` + X-Frame-Options DENY.
- Atomic config writes with unique tmp filenames per call.
- Auto-updater disabled by default; requires explicit opt-in + a
  non-placeholder feed URL.

See `docs/SECURITY-NOTES.md` (to be added) for operator-facing
guidance on LAN hardening.

## Known limitations

These are acknowledged and tracked, not hidden:

- `webSecurity: false` in the main BrowserWindow. Fixing requires a
  renderer rebuild — tracked in `docs/ROADMAP.md`.
- Electron 28 is EOL (Oct 2024). Upgrade to 33+ is tracked as a
  breaking change needing a dedicated QA cycle.
- No HTTPS on the LAN server. Operators on untrusted Wi-Fi should
  follow the guidance in `docs/SECURITY-NOTES.md`.
- Code signing is pending SignPath Foundation approval; early installs
  trigger SmartScreen "Unknown publisher".

Thank you for helping keep the mosques that use Mithnah safe.
