# SignPath Foundation application — draft

Draft text for the user to submit to https://signpath.org/foundation-for-open-source-projects
once the repo is public.

---

## Project name
**Mithnah (مئذنة)**

## Repository
`https://github.com/OWNER/mithnah` *(replace OWNER once the repo is live)*

## Project description (Arabic + English)

Mithnah is a free, open-source, offline-first Windows desktop
application that displays prayer times, supplications (duas), ziyarat,
and Hijri-calendar events for Shia Ithna Ashari (Twelver) mosques.

Core features:
- Local prayer-time calculation using 13 established methods, with
  Jafari (Leva Institute) as the default.
- Multi-variant Hijri calendar (Jafari, Umm al-Qura, tabular civil,
  tabular astronomical, Intl ICU).
- Phone GPS handoff over LAN for accurate mosque positioning, with
  offline reverse geocoding against a 100+ city database weighted
  toward Shia communities.
- Marja-taqlid picker covering 13 Twelver marjas (Sistani, Khamenei,
  etc.) that auto-configure calculation method + maghrib delay.
- Curated Shia content registry (Mafatih al-Jinan sources): 13 duas,
  5 ziyarat, 6 taqibat, Tasbih al-Zahra, 30+ Hijri events.
- Presenter-style slideshow for the wall with Logitech-remote support.
- Strict offline-first network policy: blocks all non-loopback
  outbound traffic; external CDN URLs in the bundled renderer are
  redirected to local vendor files.
- PIN-authenticated mobile-control web UI on LAN with CSRF protection,
  rate-limited auth, CSP headers, and bounded session maps.

مئذنة تطبيق سطح مكتب ويندوز مجاني، مفتوح المصدر، يعمل بدون إنترنت،
يعرض أوقات الصلاة والأدعية والزيارات والمناسبات الهجرية في المساجد
الشيعية الإثنا عشرية. مبني على محرّك حساب محلي للطريقة الجعفرية مع
دعم ١٣ طريقة حساب، ومحتوى شيعي موثّق من مفاتيح الجنان.

## Why code signing matters for this project

Windows SmartScreen shows "Unknown publisher — Don't run" for every
unsigned installer download. The target user base is **elderly mosque
caretakers** who are not technical; a SmartScreen warning effectively
halts adoption — most close the installer and assume it's a virus.

Code signing with SignPath Foundation would:
1. Eliminate SmartScreen false-positives, enabling non-technical
   operators to install safely.
2. Establish authenticity — users can verify Mithnah binaries came
   from our SignPath-issued certificate.
3. Enable auto-update flows where signed binaries validate against
   the same certificate chain.
4. Signal active maintenance — unsigned projects often look abandoned.

Without code signing, the project remains effectively undistributable
to its core audience.

## License
MIT License. See [LICENSE](../LICENSE).

## Maintainer
*(fill in: name, GitHub profile, email, country)*

## Commit activity
*(fill in once repo is live: e.g. "~30 commits in first 2 weeks,
steady monthly cadence expected for patches + content updates")*

## Release cadence expectation
Quarterly minor releases + ad-hoc security patches. Each release:
1 Windows installer (.exe), 1 blockmap, 1 latest.yml.
Estimated signing volume: 4–12 signatures/year.

## Build reproducibility
- Built via GitHub Actions on `windows-latest` runners.
- Pinned Node.js version (20.x).
- `package-lock.json` committed.
- Electron-builder with `asar: true`.
- Deterministic output: identical source + deps → identical installer
  bytes (modulo electron-builder timestamp quirks).

## Binary safety signals
- No telemetry, no analytics, no remote config fetching (`session.
  webRequest` blocks it).
- Dependencies: adhan, electron-updater, express, idb, lucide-react,
  qrcode, react, react-dom, socket.io. All well-known OSS libraries.
- No cryptocurrency mining, no ad injection, no bundled adware.
- No dynamic code loading from the network.
- Security audit passes (`npm audit`), vulnerabilities are in the
  dev toolchain (Electron / electron-builder / vite), not runtime.

## Legal
- All code under MIT, author(s) consent.
- Arabic content sourced from public-domain religious works (Mafatih
  al-Jinan, ~1931, author d. 1940 → PD).
- Fonts bundled under OFL (Google Fonts).

## Technical contact
Same as maintainer. Available for clarifications during the review
period.
