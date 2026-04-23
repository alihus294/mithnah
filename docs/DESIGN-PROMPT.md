# Mithnah — Full Design Brief for Claude Design

> Copy-paste-ready brief. Hand the whole file (or the sections you want)
> to Claude Design (https://claude.ai/design) so it can produce a
> cohesive visual system + per-screen designs for this Shia Ithna
> Ashari (Twelver) mosque display app.

---

## 1. Project context (read this first)

**Mithnah** (مئذنة, transliteration of *mi'dhanah* — the minaret, the
tower from which the adhan is called) is a Windows desktop mosque
display for Shia Ithna Ashari (Twelver) communities. It is a passive,
always-on wall display mounted on a 40"–55" TV in the main hall, in
landscape. No interaction at the wall itself — a caretaker controls
everything from a phone over local Wi-Fi.

**Audience at the wall:** the whole congregation — children, elders,
visitors. They read it from 3–10 metres away during prayer, before
adhan, during Friday khutbah, and during dua nights (Kumayl, Tawassul,
Nudbah, Iftitah). Typography must be large, high-contrast, calm.

**Mood:** dignified, sacred, warm, peaceful. Think of a 19th-century
Qajar mihrab, a Kashan tile wall, or the lantern-light glow on a
marble courtyard at Imam Hussain's shrine in Karbala. **Not** a
corporate dashboard. **Not** a sports-bar scoreboard. **Not** sterile
Material Design.

**Language:** Arabic (RTL). All Arabic numerals use the Arabic-Indic
variants (٠١٢٣٤٥٦٧٨٩), not Latin 0-9. Latin characters appear only
for URLs, PINs shown to the phone user (digits-only), or UI chrome.

**Tone:** reverent without being heavy. Quiet confidence.

---

## 2. Shia Islamic visual language (what "Islamic atmosphere" means here)

### Motifs that *fit*
- **Arabesque (أرابيسك)** — interlacing vegetal scrollwork.
  Traditional, timeless, non-sectarian.
- **Geometric girih** — star-and-polygon lattices, especially 8-point
  and 12-point stars.
- **Calligraphic headings** in Thuluth or Naskh style.
- **Mihrab / arch framing** — a pointed arch silhouette around the
  most sacred element (e.g., the clock or the current dua) signals "this
  is the focal point."
- **Lantern glow** — warm gold (like brass lantern light) as accent;
  avoid neon/cool accents.
- **Tile-work palette** — deep teal, Persian blue, turquoise, ivory,
  saffron gold, soft burgundy for mourning occasions.
- **Shia-specific touches (optional, subtle):**
  - *Salawat* footer: "اللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّد"
    on the wall at all times.
  - *Names of the Fourteen Infallibles* as a very subtle watermark
    (low-opacity calligraphy in the background corner).
  - *Colour cues by occasion:* shahadah (martyrdom) days get a
    restrained deep-burgundy accent; wiladah (birth) and eids get
    warmer gold.

### Motifs to avoid
- Crescent+star (overly political/flag-like for our audience).
- Realistic Kaaba photography (too literal; clashes with typography).
- Saudi-tabular "official" stencil look — our audience is specifically
  *not* Sunni Saudi, and visual cues should reflect that.
- Any AI-generated figurative art (figurative depictions of prophets,
  imams, or Allah are forbidden).
- Neon greens / electric blues / corporate purples.

### Reference aesthetic images to mention to Claude Design
- Interior of Imam Ali shrine (Najaf) — mirrored ceiling, gold halo.
- Imam Hussain shrine (Karbala) — tile bands, calligraphy friezes.
- Isfahan's Sheikh Lotfollah mosque — tile arabesques on dome.
- Safavid-era Quran illumination — gold rosettes, cobalt grounds.

---

## 3. Screens to design

There are **6 screens** total. All wall screens are 1920×1080 minimum
(design for 1920×1080, but use fluid units so it scales to 4K).
All phone screens are 390×844 (iPhone 13/14 portrait) baseline, but
should work at 360–430 wide.

### Screen 1 — Wall Dashboard (the main view, 99% of runtime)

Always on. Landscape. Full-screen Electron window.

**Data shown (live, refreshes automatically):**

| Element                  | Source                                | Example                              |
|--------------------------|---------------------------------------|--------------------------------------|
| Current time (HH:MM)     | system clock, 1-sec tick              | `١٢:٣٤`                              |
| Gregorian date           | system date, localised to Arabic      | `الأحد، ٢٠ أبريل ٢٠٢٦`                |
| Hijri date               | computed from config                  | `٣ ذو القعدة ١٤٤٧ هـ`                 |
| Next-prayer name (AR)    | computed from lat/lng + method        | `الظهر`                              |
| Next-prayer time (HH:MM) | same                                  | `١٢:٣٠`                              |
| Countdown to next prayer | recomputed each second                | `بعد ٤٥ دقيقة و ١٢ ثانية`             |
| Six prayer times         | today's schedule                      | فجر / شروق / ظهر / عصر / مغرب / عشاء  |
| Today's event (if any)   | Hijri-events registry                 | `شهادة الإمام الصادق ع`               |
| Upcoming event (if any)  | next 40 days ahead, one at a time     | `قريباً: ولادة الإمام الحسين ع — ٣ شعبان (بعد ١٢ يوماً)` |

**Corners:**
- Top-left: **PIN badge** (Screen 3 — a small always-visible card)
- Bottom-right: **Help hint** — a single 44×44 circle button showing "؟" (F1)

**Proportions guidance** (from the user's feedback, the current
implementation gets the balance wrong — the clock and next-prayer are
side-by-side on the middle row, which feels cramped):
- The **clock should dominate the visual hierarchy** — it is the thing
  people glance at from across the hall.
- The **next-prayer card** is the second-most-important. It should sit
  below the clock, centred, and use a warm golden accent to call
  attention.
- The **six prayer times** are a quick reference. They can run along
  the bottom as a horizontal row (one cell per prayer) or as a vertical
  list on the right, but must not fight the clock for attention.
- Event banners sit above the clock, small, pill-shaped, never
  dominant.

**Tone notes for this screen:**
- Background: very dark teal-ink (`#0f1e20` current) or Persian midnight
  blue. Mihrab-shaped radial halo of warm gold behind the clock.
- Clock numerals: thin-weight display font (Amiri or similar) at
  enormous size (12–15vw). Feels closer to illuminated manuscript than
  digital clock.
- Hijri date: Amiri/Scheherazade, gold.
- Gregorian date: Tajawal/Noto, muted.
- Next prayer name: Amiri display, warm gold.
- Next prayer time: display font, gold, large (6vw).
- Countdown: body font, secondary colour, one line.
- Prayer row cells: current prayer gets a **subtle gold-tinted
  highlight** with a soft glow, not a harsh box.
- Event banner: single-line pill with a coloured dot; crimson for
  shahadah, gold for wiladah/eid, teal for generic.

### Screen 2 — Slideshow Overlay

When the caretaker opens a dua or ziyarah from the phone, a fullscreen
overlay fades in on top of the wall dashboard. The dashboard is
blurred (backdrop-filter) behind.

**Deck metadata (top):**
- Title (Arabic) — e.g. `دعاء كميل`
- Subtitle — e.g. `دعاء ليلة الجمعة · عن أمير المؤمنين علي بن أبي طالب ع`

**Slide body (centre, scrollable):**
- Optional heading (section name, e.g. `المقطع الأول`)
- **Arabic text** — this is the hero. Scheherazade New or Amiri, large
  (3–4vw), tashkeel (diacritics) preserved. Line height generous (2.0).
  Text can be multi-paragraph.
- Optional Latin transliteration (italic, small, LTR, below the Arabic).
- Optional subtitle/explanation (small, muted).

**Footer:**
- Source (e.g. `المصدر: مفاتيح الجنان`)
- Slide counter (`٣ / ١٤`)
- Tiny hint about remote keys (optional)

**Keyboard/Logitech presenter remote navigates:**
→ / PgDn / Space = next slide
← / PgUp = prev
B / . = blank (dim the body text for a moment of silent dhikr)
Home / End = first / last
Esc = close slideshow

**Tone notes:**
- The slideshow is a *sacred reading space*. Strip all chrome that
  isn't needed. Borders are thin gold hairlines. A single ornamental
  crest (۞ or an 8-point girih star) at each corner of the frame.
- The Arabic text must **never** be crowded. Generous margins, large
  line height, centred. If a slide only has one ayah or one line of
  supplication, let it sit in serene white space.
- Blank state (B key pressed) fades the body to near-invisible but
  leaves the deck title visible — so congregation can still see which
  dua they're in.

### Screen 3 — PIN Badge (corner of wall)

Top-left corner, always visible. Compact. Tells a newcomer: *"scan
this to pair your phone."*

**Contents:**
- Small brand row: "م" glyph + "مئذنة" wordmark.
- **QR code** (140px) — encodes the LAN URL of the mobile-control
  server (e.g. `http://192.168.1.42:3100/`).
- Caption under QR: `امسح بكاميرا الجوال` ("scan with phone camera").
- URL row: label `الرابط` + short URL text.
- PIN row: label `رمز الدخول` + big spaced digits (`٧٣٨٤٣٨`) in warm
  gold.

**Proportions:** ~240px wide, ~330px tall. Glass-effect card with a
hair of gold border. Must be legible from 3 metres but never louder
than the clock.

### Screen 4 — Help Overlay (F1 modal)

Caretaker presses F1; a modal appears over the wall. Dismisses on F1
again or Esc.

**Contents, in order:**
1. Modal title: `مئذنة — المساعدة` + subtitle: `اضغط F1 أو Esc للإغلاق`.
2. Section: **"اختصارات لوحة المفاتيح"** — dl of shortcuts:
   - `Ctrl+=` → تكبير
   - `Ctrl+-` → تصغير
   - `Ctrl+0` → حجم افتراضي
   - `F1` → المساعدة
3. Section: **"ريموت العارض للشرائح"** — dl of slideshow shortcuts:
   - `→ / PgDn / Space` → التالي
   - `← / PgUp` → السابق
   - `B / .` → إعتام الشاشة
   - `Home / End` → الأولى / الأخيرة
   - `Esc` → إغلاق العرض
4. Section: **"إعدادات المسجد الحالية"** — dl of current config:
   - طريقة الحساب: `Jafari`
   - المرجع: `السيد السيستاني دام ظله`
   - المنطقة: `ديربورن`
   - الإحداثيات: `42.3106، -83.0460`
   - دقة GPS: `١٢ متر · ✓ ممتازة`
   - التقويم: `jafari`
   - إزاحة التقويم: `+٠`
   - تأخير المغرب: `+١٥ د`
5. A small "connect from phone" callout at the bottom — label +
   full URL + enormous PIN.

**Tone notes:**
- This is utility, so it can be more compact than the wall dashboard.
- Still use Amiri for headings to stay on-brand.
- Close button top-left (RTL) with "إغلاق · Esc".

### Screen 5 — Phone Auth

Served from the Electron main process at `http://<LAN IP>:3100/`.
Mobile portrait. Single card, centred.

**Contents:**
- Brand row at top: "م" glyph + "مئذنة" wordmark.
- Title: `التحكم من الجوال`.
- Subtitle: `أدخل رمز PIN لإدارة شاشة المسجد من هاتفك`.
- **PIN input** — numeric, 4–8 digits, password-masked, centred, huge
  letter-spacing so the digits feel ceremonial.
- Primary button: `دخول`.
- Status line for errors — rate-limit message, wrong-PIN, etc., in a
  restrained crimson on fail, warm gold on success.

**On wrong PIN:** small shake animation + crimson status.
**On rate-limit (429):** `محاولات متكررة — حاول بعد ١٥ دقيقة` in crimson.

### Screen 6 — Phone Dashboard (after auth)

Same device, same page, just a different visual state. Shows a live
mirror of the wall plus some extras.

**Top header (sticky):**
- "م" glyph + "مئذنة" wordmark.
- Two ghost buttons on the end: ⟳ (refresh) and "خروج" (logout).
- A status line below the header for "جاري التحديث…" or error states.

**Card 1 — Hijri date**
- Label: `التاريخ الهجري`.
- Big Arabic text: `٣ ذو القعدة ١٤٤٧ هـ`.
- Inline event/upcoming ticker below: either `اليوم: ولادة الإمام الصادق ع` or
  `قريباً: شهادة الإمام الرضا ع — ٣٠ صفر (بعد ١٢ يوماً)`.

**Card 2 — Today's event (only if one exists)**
- Left border in the event's colour (crimson/gold/teal).
- Tiny kind label (`شهادة` / `ولادة` / `عيد` / `مناسبة`) in that
  colour.
- Event title in a larger Amiri display font.

**Card 3 — Next prayer (hero card)**
- Subtle radial gold glow behind it.
- Label: `الصلاة القادمة` in small caps.
- Prayer name (e.g. `الظهر`) — Amiri display, 2rem.
- Time (`١٢:٣٠`) — display font, 2.5–3rem, gold.
- Countdown (`بعد ٤٥ دقيقة و ١٢ ثانية`) — one line, muted.

**Card 4 — Prayer list (today)**
- Section title: `مواعيد اليوم`.
- 6 rows (fajr, sunrise, dhuhr, asr, maghrib, isha). Each row:
  prayer name in Amiri on the right, time in display font on the left.
  The active (next) row has a gold-tinted highlight identical in spirit
  to the wall version.

**Card 5 — Mosque config**
- Section title: `إعدادات المسجد`.
- Read-only key-value list:
  - طريقة الحساب: `Jafari`
  - المرجع: `السيد السيستاني`
  - الموقع: `ديربورن`
  - دقة GPS: `١٢ متر · ممتازة`
  - التقويم: `jafari`
  - تأخير المغرب: `+١٥ د`

**Floating widgets (already written, just need to style-coordinate):**
- GPS handoff button (bottom-right, green circle with 📍 icon, opens a
  panel where the phone pushes its GPS fix to the wall).
- Slideshow control panel (bottom-left, purple circle with presenter
  icon; tabbed catalogue of duas / ziyarat / taqibat / tasbih from
  `src/main/shia-content/` — when tapped, opens the slideshow overlay
  on the wall with that deck).
- Onboarding wizard (first launch only, walks through PIN → marja → GPS).

**Tone notes:**
- Phone is more informational than ceremonial. Cards can be slightly
  more pragmatic, but still use Amiri for proper nouns and section
  titles so the visual language matches the wall.
- Single column, generous padding. Bottom safe-area for the floating
  widgets.

---

## 4. Design tokens available (you can change them)

The current token set lives in `build-output/vendor/mithnah-design.css`
with this structure (abbreviated):

```css
:root {
  /* DARK THEME — wall default */
  --m-bg-base:        #0f1e20;
  --m-bg-surface:     #172b2e;
  --m-bg-raised:      #203a3e;
  --m-text-primary:   #f0ebe0;
  --m-text-secondary: #c4cfcd;
  --m-text-muted:     #8a9795;

  --m-primary:        #4a9e96;  /* muted teal — "sahn" pool colour */
  --m-accent:         #d4a574;  /* warm sand/gold — "brass lantern" */

  /* LIGHT THEME — phone default, with [data-theme="light"] override */
  --m-bg-base:        #f7f3ea;
  --m-text-primary:   #1a2b2a;
  --m-text-secondary: #3a4c4a;
  /* ... */

  /* spacing scale (1–8) */
  --m-space-1: 4px;  --m-space-2: 8px;  --m-space-3: 12px;
  --m-space-4: 16px; --m-space-5: 24px; --m-space-6: 32px;
  --m-space-7: 48px; --m-space-8: 64px;

  /* radii */
  --m-radius-xs: 4px; --m-radius-sm: 8px; --m-radius-md: 12px;
  --m-radius-lg: 18px; --m-radius-xl: 24px; --m-radius-full: 999px;

  /* typography families (all bundled locally, no CDN) */
  --m-font-body:    'Tajawal', 'Cairo', 'Noto Sans Arabic', system-ui, sans-serif;
  --m-font-display: 'Changa', 'Tajawal', system-ui, sans-serif;
  --m-font-quranic: 'Amiri', 'Scheherazade New', serif;
  --m-font-latin:   'Be Vietnam Pro', system-ui, sans-serif;

  /* additional bundled */
  /* Material Symbols Outlined — for prayer-time icons, nav chevrons */
  /* Font Awesome — available, rarely used */
}
```

**You can propose new colour values**, a new accent scheme, or
additional tokens (e.g. `--m-mihrab-gradient`, `--m-shahadah-tint`,
`--m-salawat-glow`). Stick to values that can be expressed in CSS
without requiring external images.

---

## 5. Hard constraints

- **Fully offline.** Every asset (fonts, icons, textures) must be
  bundleable locally. No `<link href="https://...">`.
- **RTL.** Arabic runs right-to-left. All layouts assume `dir="rtl"`.
- **Arabic-Indic digits** for prayer times, Hijri dates, PINs,
  countdowns, and mosque config. Latin 0-9 only for URLs/ASCII.
- **No figurative imagery of prophets / imams / Allah.**
- **Readable from 5+ metres** on a wall-mounted 42"–55" TV.
- **CSS-only.** No SVG animations required; static SVG motifs welcome.
- **Budget for the whole bundle: ≤ 20 KB of CSS** (current is ~11 KB).
  Prefer gradients over images; if images are needed, inline as data
  URIs with low opacity.
- **Dark is the default theme** for the wall. Light is the default for
  the phone. Both themes should feel like the same family.

---

## 6. Deliverables

Please produce, in order:

1. A **visual moodboard** / reference palette with 4–6 images or
   pure-CSS swatches that capture the mood (Imam Ali shrine
   interior, Kashan tile, Safavid Quran illumination, etc.) and
   explain the choices in 2–3 sentences each.
2. A **revised design-token file** (`mithnah-design.css`) with any
   new colours / gradients / shadow variables you want to introduce.
3. **Per-screen mockups** for the six screens above (static HTML+CSS
   is fine; tell me if you need me to paste the current JSX of any
   component so you can match the class names).
4. A short **style guide** covering:
   - typography hierarchy (which font for what, at what size)
   - spacing rhythm (which tokens for what)
   - how to represent each event kind (shahadah/wiladah/eid/significant)
   - motion (if any — keep minimal for a passive wall)
5. Any **snippets** (e.g. an ornamental SVG crest, a mihrab-shaped
   clip-path, a girih lattice pattern) that should be reused across
   screens.

Keep the spirit: **dignified, sacred, warm, quietly confident**. When
in doubt, subtract chrome rather than add it.

---

## 7. Paste-at-the-end: JSX reference (if the designer wants exact
class names)

### `App.jsx`
```jsx
export default function App() {
  const [slideshow, setSlideshow] = useState(null);
  useEffect(() => { const u = onSlideshowState(setSlideshow); return () => typeof u === 'function' && u(); }, []);
  return (
    <div className="app-root" dir="rtl">
      <Dashboard />
      <PinBadge />
      <HelpHint />
      <HelpOverlay />
      <SlideshowOverlay state={slideshow} />
    </div>
  );
}
```

### Dashboard class tree (current structure — redesign welcome)
```
.dashboard
├── .dashboard__top    → .event-banner (optional)
├── .dashboard__middle
│   ├── .clock-block
│   │   ├── .time (.sep)
│   │   └── .date-row (.date-hijri, .date-gregorian)
│   └── .next-prayer (.label, .name, .time, .countdown)
└── .dashboard__bottom
    ├── .prayer-list
    │   ├── .prayer-list__title
    │   └── .prayer-row (× 6, one gets .prayer-row--next)
    │       ├── .icon
    │       ├── .name
    │       └── .time
    └── .upcoming-banner (.upcoming-banner__label, __title, __days)
```

### Other components
- `.pin-badge` (__brand, __glyph, __name, __qr-wrap, __qr, __qr-caption,
  __divider, __row, __label, __url, __pin)
- `.help-hint` (single button, "؟")
- `.help-card` (__close, .help-title, .help-subtitle, .help-section-title,
  .help-dl with dt/dd, .help-kbd, .help-pin with __label / __url / __code)
- `.slideshow.open` with `.slideshow__frame`, `__deck-title`,
  `__deck-subtitle`, `__body` (+.enter animation class), `__heading`,
  `__ar`, `__footer`, `__counter`, `__blank.on`

### Phone (mobile-control) DOM ids
- Auth layer: `#auth-screen` containing `#pin-input`, `#auth-submit`,
  `#auth-status`.
- Dashboard: `#dashboard` containing:
  - Header: `.dash-header` with `.dash-brand`, `.dash-actions` (`#btn-refresh`, `#btn-logout`)
  - `#dash-status-line`
  - `.hijri-card` with `#hijri-date` + `#event-inline`
  - `#today-event-card` (hidden when none) with `#today-event-kind`, `#today-event-title`
  - `.next-card` with `#next-name`, `#next-time`, `#next-countdown`
  - `.section-title` + `#prayer-list` (populated via innerHTML, each
    row is `.prayer-row-small`, the active one also has `.next`)
  - `.section-title` + `#config-list` (populated via innerHTML, each
    row is `.config-row` with `.k` and `.v`)

That's it — the designer has everything needed to produce a cohesive
Islamic-Shia design system for the whole project.
