# مراجعة شاملة لمشروع Mithnah (مئذنة)

> هذا الملف يُنشأ تلقائياً لمراجعة سريعة لكل ما يحتاجه المطوّر للعمل على المشروع.
> تاريخ الإنشاء: 2026-05-30 | الإصدار الحالي: 0.5.0

---

## 1. نظرة عامة

**Mithnah** (مئذنة) — تطبيق سطح مكتب مجاني ومفتوح المصدر لشاشات المساجد الشيعية الاثني عشرية. يعمل offline بالكامل، ويحسب أوقات الصلاة محلياً بطريقة جعفري، ويدعم 13 مرجعاً، و5 متغيرات للتقويم الهجري، ويُتحكم به عبر الجوال عبر Wi-Fi.

| البند | التفاصيل |
|-------|----------|
| **المنصة** | Windows (Electron) |
| **الترخيص** | MIT |
| **المؤلف** | Ali Hussin |
| **الإصدار** | 0.5.0 |
| **Node** | >=20.10.0 <23 |
| **Electron** | 28.3.3 (مخطّر: 33+) |
| **React** | 18.3.1 |
| **Vite** | 5.4.21 (مخطّر: 7+) |

---

## 2. البنية المعمارية

### 2.1 تقسيم المشروع

```
mithnah/
├── src/main/           ← العملية الرئيسية (Electron + Express + Socket.IO)
├── src/renderer/       ← واجهة الحائط (React 18 + Vite)
├── src/public/         ← الأيقونة والأصول الثابتة
├── build-output/       ← واجهة الجوال (HTML/JS) + الخطوط المحلية + الـ widgets
├── tests/              ← 114 اختبار Node.js原生
├── docs/               ← توثيق المشروع
├── build/              ← NSIS installer script
└── dist/               ← مخرجات البناء (renderer + electron-builder)
```

### 2.2 العملية الرئيسية (`src/main/`)

| الملف/المجلد | الدور |
|-------------|-------|
| `index.js` | نقطة الدخول — إنشاء النافذة، Express server (3100)، Socket.IO، CSP، PIN auth، GPS handoff |
| `preload.js` | `contextBridge` — كل قنوات IPC متاحة للـ renderer |
| `ipc-handlers.js` | معالجات IPC المركزية |
| `app-features.js` | verifyPinAgainstHash، import/export config، ربط helpers |
| `lifecycle.js` | إدارة دورة حياة التطبيق |
| `remote-server.js` | Express API endpoints للجوال |
| `network-policy.js` | سياسة الشبكة — حظر كل الاتصالات الخارجية |
| `frame-guard.js` | حماية IPC من النوافذ غير الرئيسية |
| `bridge-ipc.js` | Snapshot مركّب (config + prayer + Hijri + events) |
| `auto-content.js` | توليد محتوى تلقائي |
| `prayer-times/` | حساب أوقات الصلاة عبر `adhan-js` |
| `hijri/` | 5 متغيرات للتقويم الهجري |
| `location/` | تحديد الموقع، قاعدة بيانات 100+ مدينة، reverse geocoding |
| `marja/` | 13 مرجعاً + preset مخصص |
| `shia-content/` | الأدعية، الزيارات، التعقيبات، التسبيح، المناسبات الهجرية |
| `slideshow/` | حالة الـ slideshow وإدارة الشرائح |
| `updater/` | Auto-update (معطل افتراضياً) |
| `window/` | إدارة النافذة، zoom، settings I/O |

### 2.3 Renderer (`src/renderer/`)

| الملف | الدور |
|-------|-------|
| `App.jsx` | جذر التطبيق — 12 overlay منفصل، كل واحد بـ `ErrorBoundary` |
| `components/Dashboard.jsx` | الشاشة الرئيسية (الساعة، الصلاة التالية، شريط المناسبات) |
| `components/SlideshowOverlay.jsx` | عرض الأدعية والزيارات fullscreen |
| `components/SettingsOverlay.jsx` | F3 — الإعدادات مع PIN gate |
| `components/DuaPicker.jsx` | F4 — اختيار الدعاء + محرر أدعية مخصصة |
| `components/PrayerTracker.jsx` | F5 — متابعة الصلاة والركعات |
| `components/Ornaments.jsx` | عناصر زخرفية (نجوم، محراب، صلوات) |
| `components/HelpOverlay.jsx` | F1 — مساعدة + اختصارات |
| `components/OnboardingOverlay.jsx` | التشغيل الأولي |
| `styles.css` | ~3700 سطر — التصميم الكامل |
| `lib/format.js` | تحويل الأرقام للعربية، تنسيق الوقت، العد التنازلي |
| `lib/ipc.js` | واجهة الاتصال مع العملية الرئيسية |

### 2.4 واجهة الجوال (`build-output/`)

| الملف | الدور |
|-------|-------|
| `mobile-control.html` | صفحة الجوال — auth + dashboard + library + settings |
| `mobile-control.js` | منطق الجوال — polling كل 30s + Socket.IO |
| `vendor/mithnah-*.js` | Widgets عائمة (GPS، slideshow control، onboarding) |
| `vendor/mithnah-design.css` | Design tokens |
| `vendor/fonts/` | ~50 ملف خط محلي (Google Fonts bundled) |
| `vendor/textures/` | نقوش إسلامية |

---

## 3. قنوات IPC الرئيسية

### 3.1 من Preload (`window.electron.*`)

```
zoom:*              — تكبير/تصغير
remoteControl:*     — حالة التحكم عن بعد + الشبكة
prayerTimes:*       — أوقات الصلاة + config
hijri:*             — التقويم الهجري
location:*          — تحديد الموقع + البحث
shia:*              — محتوى شيعي (أدعية، زيارات...)
slideshow:*         — حالة + أوامر slideshow
updater:*           — التحديث التلقائي
bridge:*            — snapshot مركّب
marja:*             — المراجع
app:*               — PIN، auto-launch، import/export، Qibla، kiosk
```

### 3.2 Cross-Agent Contracts (مهمة!)

| العقد | المصدر | الهدف | القناة |
|-------|--------|-------|--------|
| GPS confirmation | A.6 | B.6 | HTTP 409 → re-POST with `confirmRelocation` |
| Clock skew toast | A.7 | C.4 | IPC `app:clock-skew` |

---

## 4. البيانات والتكوين

### 4.1 ملفات الإعدادات

| المسار | المحتوى |
|--------|---------|
| `%APPDATA%\Mithnah\prayer-config.json` | إعدادات الصلاة + الموقع + المرجع + الميزات |
| `%APPDATA%\Mithnah\window-settings.json` | zoom level + حالة النافذة |
| `%APPDATA%\Mithnah\pin-salt` | ملح عشوائي لحساب PIN (مخطّط: A.4) |

### 4.2 الإعدادات الافتراضية

- **الطريقة:** Jafari (Leva Institute, Qom) — Fajr 16°, Isha 14°, Maghrib 4°
- **المرجع:** null (مخصص)
- **الموقع:** النجف (31.99, 44.31)
- **التقويم:** jafari
- **المذهب:** Shafi (للعرض فقط — الجعفري مضمّن)
- **largeText:** true (v2 migration)

### 4.3 15 طريقة للحساب

**شيعية (4):** Jafari (Leva) · JafariWide (18°) · QatifShia (field-observed) · Tehran (Geophysics)
**سنية (11):** UmmAlQura · MuslimWorldLeague · Egyptian · Karachi · Dubai · Qatar · Kuwait · Singapore · Turkey · NorthAmerica · MoonsightingCommittee
**تلقائي:** Auto — تحديد حسب الإحداثيات

### 4.4 13 مرجعاً

السيستاني · الخامنئي · الصدر · مكارم · وحيد · صافي · شبيري · بشير النجفي · الحكيم · الفياض · المدرسي · فضل الله · مخصص

### 4.5 5 متغيرات هجرية

jafari · umm-al-qura · islamic-civil · islamic-tbla · astronomical

### 4.6 30+ مناسبة هجرية

مخزنة في `src/main/shia-content/hijri-events.js` — ولادات، شهادات، أعياد، أيام مهمّة.

---

## 5. الأمان والسياسات

### 5.1 سياسة الشبكة (Offline-First)

1. Loopback (127.0.0.1, socket.io) — مسموح
2. Vendor URLs معروفة — redirect محلي
3. أي شيء آخر — محظور (مع خطأ في اللوج)
4. Escape hatch: `MITHNAH_ALLOW_NETWORK=1`

### 5.2 CSP (Content Security Policy)

- `default-src 'self'`
- `script-src 'self'` (+ `'unsafe-eval'` في dev)
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: blob:`
- `connect-src 'self' ws: wss:`

### 5.3 PIN & Auth

- PIN افتراضي: 6 أرقام مشتقة من `sha256(hostname + username + salt + 'mithnah-pin-v1')`
- إمكانية التجاوز: `MASJID_KIOSK_RESCUE=1`
- Rate limit: 5 محاولات / 15 دقيقة (مخطّط)
- Session TTL: 12 ساعة

### 5.4 Auto-Update

- معطل افتراضياً — يُفعّل بـ `MITHNAH_AUTO_UPDATE=1`
- التغذية: GitHub releases (أو `MITHNAH_UPDATE_FEED`)
- يجب أن يكون HTTPS فقط (باستثناء localhost)

---

## 6. الاختبارات

**114 اختبار** عبر `node --test`:

```
tests/cities.test.js                — reverse geocoding
tests/features.test.js              — feature flags
tests/hijri.test.js                 — التقويم الهجري
tests/location.test.js              — تحديد الموقع
tests/marja.test.js                 — المراجع
tests/prayer-times.calculator.test.js — حساب أوقات الصلاة
tests/prayer-times.config.test.js   — config persistence
tests/renderer.format.test.js       — تنسيق الأرقام والوقت
tests/shia-content.test.js          — محتوى شيعي
tests/shia-upcoming.test.js         — المناسبات القادمة
 tests/slideshow.test.js             — حالة slideshow
```

**الأمر:** `npm test`

---

## 7. خطة الإصلاحات (FIX_PLAN.md)

### 7.1 الجولة 1 — إصلاحات أساسية

**Agent A (Main Process + Settings):** 11 عنصر — CSP، PIN salt، IP lockout، GPS sanity-check، clock skew، strict types، rate limit، TOCTOU، kiosk rescue، schemaVersion
**Agent B (Updater + Mobile):** 6 عناصر — signature validation، socket.io live state، 2-tap confirm، https-only feed، Wake Lock، 409 handler
**Agent C (Wall Renderer):** 4 عناصر — localStorage quota، React.memo، default-location badge، clock-skew toast
**Agent D (Docs/CI/Build):** 8 عناصر — ARCHITECTURE link، SignPath، engines field، SHA256SUMS، test count، PLACEHOLDER cleanup، Vite 7، Electron 33

### 7.2 الجولة 2 — تحسين UX لكبار السن

**Agent A:** A.12 — PIN gate hint (٤ إلى ٨ أرقام)
**Agent B:** B.7 + B.8 — إزالة letter-spacing من العربية + تكبير labels
**Agent C:** C.5–C.15 — 11 عنصر:
- C.5: inline modal بدل window.confirm
- C.6: SalawatLine 14→18px
- C.7: AlayhiSalam 9→12/14px
- C.8: إزالة letter-spacing من 5 selectors
- C.9: event-strip__countdown-kind 10→16px
- C.10: edit/delete buttons 40→48px
- C.11: remove button 32→48px
- C.12: textarea maxLength + counter
- C.13: adjust-btn 40→48px
- C.14: welcome-close 36→44px
- C.15: swap kiosk-unlock button classes (danger/primary)

### 7.3 ترتيب الدمج المُوصى به

1. A Round 1 + Round 2
2. B Round 1 + Round 2
3. C Round 1 + Round 2 (CSS أولاً)
4. D quick wins (D.3, D.5, D.6, D.1)
5. D.7 (Vite 7 + electron-builder 25)
6. D.8 (Electron 33) — smoke test شامل

---

## 8. الأوامر والسكريبتات

```bash
# تثبيت
npm install

# تشغيل التطوير
npm run dev              # Vite + Electron concurrently

# البناء
npm run build            # renderer + main
npm run build:renderer   # Vite build فقط
npm run dist:win         # بناء installer (.exe ~165MB)

# الاختبارات
npm test                 # 114 اختبار

# تشغيل الإلكترون فقط
npm start
```

### 8.1 متغيرات البيئة

| المتغير | الوظيفة |
|---------|---------|
| `NODE_ENV=development` | وضع التطوير |
| `MASJID_RENDERER_DEV_PORT` | منفذ Vite (افتراضي: 5173) |
| `MASJID_REMOTE_PIN` | تخصيص PIN |
| `MASJID_KIOSK_RESCUE=1` | تخطي PIN عند الخروج من kiosk |
| `MITHNAH_AUTO_UPDATE=1` | تفعيل التحديث التلقائي |
| `MITHNAH_UPDATE_FEED` | رابط تغذية التحديث (HTTPS فقط) |
| `MITHNAH_ALLOW_NETWORK=1` | السماح بالاتصال الخارجي |

---

## 9. الاعتماديات الرئيسية

| الحزمة | الإصدار | الدور |
|--------|---------|-------|
| electron | 28.3.3 | إطار التطبيق |
| react | 18.3.1 | UI renderer |
| adhan | 4.4.3 | حساب أوقات الصلاة |
| express | 5.2.1 | خادم الجوال |
| socket.io | 4.8.3 | اتصال real-time |
| electron-updater | 6.3.9 | التحديث التلقائي |
| qrcode | 1.5.4 | QR code للزوج |
| vite | 5.4.21 | bundler |
| @vitejs/plugin-react | 4.3.4 | دعم React |
| electron-builder | 24.13.3 | بناء المثبت |

---

## 10. ملاحظات تشغيلية مهمة

### 10.1 للمساجد (غير تقني)
- الملف: `docs/FOR-MOSQUE-OPERATORS.md` — دليل عربي خطوة بخطوة
- F1 = مساعدة | F3 = إعدادات | F4 = أدعية | F5 = متابعة الصلاة
- التحكم من الجوال: افحص QR code أعلى اليسار

### 10.2 للمطورين
- كل overlay مستقل بـ `ErrorBoundary` — عطل واحد لا يسقط التطبيق كله
- `npm test` يجب أن يبقى 114/114
- كل تعديل = commit واحد بالصيغة: `fix(area): <وصف> [§X.Y]`
- لا تلمس ملفات وكيل آخر

### 10.3 قيود التصميم
- RTL فقط — `dir="rtl"`
- أرقام عربية فقط (٠١٢٣٤٥٦٧٨٩)
- لا صور لأشخاص (أنبياء / أئمة / الله)
- كل الأصول bundled محلياً — لا CDN
- CSS فقط — لا SVG animations
- ميزانية CSS: ≤20 KB

### 10.4 قيد البناء (electron-builder)
- يحتاج Windows Developer Mode أو PowerShell مرتفع لـ symlinks
- أو استخدم CI runner (`.github/workflows/build.yml`)

---

## 11. ملخص الملفات الحرجة

### يجب مراجعتها قبل أي تعديل:
1. `src/main/index.js` — نقطة الدخول الرئيسية (~543 سطر)
2. `src/main/preload.js` — IPC bridge (~126 سطر)
3. `src/renderer/App.jsx` — جذر React (~62 سطر)
4. `src/renderer/components/Dashboard.jsx` — الشاشة الرئيسية (~617 سطر)
5. `src/renderer/styles.css` — التصميم الكامل (~3700 سطر)
6. `FIX_PLAN.md` — خطة الإصلاحات الكاملة (~932 سطر)

### ملفات البيانات:
- `src/main/prayer-times/methods.js` — 15 طريقة
- `src/main/marja/index.js` — 13 مرجع
- `src/main/shia-content/hijri-events.js` — 30+ مناسبة
- `src/main/location/cities.js` — 100+ مدينة

---

## 12. روابط سريعة

| الملف | الغرض |
|-------|-------|
| `README.md` | نظرة عامة + quick start |
| `CLAUDE_SETUP.md` | تعليمات Claude Code (للتنفيذ الآلي) |
| `AGENT_PROMPTS.md` | توزيع المهام على 4 وكلاء |
| `docs/DESIGN-PROMPT.md` | موجز التصميم الكامل (6 شاشات) |
| `docs/FOR-MOSQUE-OPERATORS.md` | دليل المشغّل العربي |
| `docs/ROADMAP.md` | خارطة الطريق |
| `docs/RELEASE.md` | تعليمات الإصدار |
| `docs/SIGNPATH-APPLICATION.md` | طلب توقيع الشفرة |
| `FIX_PLAN.md` | خطة الإصلاحات التفصيلية |
| `package.json` | الاعتماديات والسكريبتات |
| `vite.config.js` | إعداد Vite |

---

> **ملاحظة:** هذا الملف للمراجعة السريعة فقط. للتفاصيل الدقيقة، ارجع إلى الملف الأصلي المذكور.
