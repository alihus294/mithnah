# Mithnah — DEEP Audit (تفاصيل التفاصيل)

> **هذا الملف يكمل و يصحح `AUDIT_UX_CX.md`**
> **النطاق:** كل المكوّنات (٢٠+ ملف React) + theme tokens + lib hooks + IPC layer + styles.css كامل + package config
> **التركيز:** كبار السن (٦٥+)، RTL/العربي، Electron kiosk mode
> **تاريخ المراجعة:** 2026-05-26
> **المراجِع:** Claude (Opus 4.7)

---

## 🔄 تصحيحات من الـ AUDIT الأول

بعد قراءة styles.css بعمق + theme tokens (`mithnah-design.css`) + رؤية الـ `[data-large-text]` overrides الشاملة:

### ✅ تصحيح C-2: FloatingMenu opacity ليست 0

**اعتذار** — قلت في الـ AUDIT الأول إن FloatingMenu يصير opacity 0 بعد 12 ثانية. **خطأ**.

الكود الفعلي (styles.css:3358-3372):

```css
.floating-menu__trigger--idle {
  /* 0.45 not 0.12: elderly operator needs to see the menu exists —
   * the old 0.12 made it functionally invisible at normal viewing
   * distance. */
  opacity: 0.45;
  animation: floatingMenuIdlePulse 4s ease-in-out infinite;
}
@keyframes floatingMenuIdlePulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 0.58; }
}
```

**التقييم الجديد:** ✅ ممتاز — opacity 0.45 مع نبضة لطيفة. تم التفكير في كبار السن مسبقاً. **C-2 يُلغى.**

⚠️ تحسين متبقّي: 0.45 قد تكون منخفضة لمن عنده ضعف نظر شديد. اقترح إضافة فحص `prefers-contrast: more` يرفع opacity إلى 0.65 على الأقل.

### ✅ تصحيح H-1: Touch targets

كثير من العناصر اللي ذكرتها كـ مشكلة فعلاً تلبي WCAG:

| العنصر | الحجم الفعلي | الحالة |
|--------|--------------|--------|
| `.dua-picker__star` | 44×44px (styles.css:1742) | ✅ WCAG AA |
| `.slideshow__close` | min-height: 52px | ✅ WCAG AA |
| `.slideshow__fontctl-btn` | 56-64px | ✅ NN/g elderly |
| `.floating-menu__trigger` | min-height: 64px (72px في largeText) | ✅ NHS Digital |
| `.inline-modal__btn` | min-height: 52px | ✅ WCAG AA |
| `.dua-picker__item` | min-height: 130px | ✅ ممتاز |

**التقييم الجديد:** ⚠️ متبقي مشاكل touch target معدودة لكن الجزء الأكبر صحيح.

**المتبقّي:**
- `imam-list-editor__remove` — حسب الـ largeText override: `width: 40px; height: 40px` — تحت WCAG AA (44px)
- `dua-picker__welcome-close` — لا حجم صريح في الـ markup
- `announcement-banner__close` — لا حجم صريح

### ✅ نظام Theme Tokens — اكتشاف رائع

**styles.css:25-32 + comments**:

```css
/* The muted/faint values used to be #9aa39a / #5d6a64 which gave
 * contrast ratios of 2.8:1 and 1.9:1 against the teal base — both
 * fail WCAG AA. Lifted to #b8c2b8 (~5.6:1) and #a0aaa4 (≥4.8:1) —
 * REVIEW D4-13. */
--m-text-muted:     #b8c2b8;   /* 5.6:1 — passes AA */
--m-text-faint:     #a0aaa4;   /* 4.83:1 on raised, 5.60 surface, 6.77 base */
```

✅ Light theme أيضاً تم إصلاحه (D4-10):
- `--m-text-muted`: كان 3.71:1 → الآن يفوق 4.5:1
- `--m-accent`: كان 3.77:1 → الآن `#8b5a1a` (passes AA)

**التقييم:** ⭐⭐⭐⭐⭐ فحص contrast جاد ومن مراجعة سابقة.

⚠️ ملاحظات متبقّية:
- النصوص ذات الـ `opacity` المضاف فوق اللون (مثل `dashboard__dates-dot opacity: 0.6`) لا تُحتسب في حساب الـ contrast — قد تفشل WCAG حتى مع tokens سليمة
- النصوص في `linear-gradient + text-fill: transparent` (مثل masthead title و prayer name) — حساب الـ contrast غير قابل للقياس بدقة

---

## 🔴 مشاكل CRITICAL مؤكدة (لم تتغير)

### C-1 (لا يزال): `window.confirm()` في DuaPicker.jsx:701

كما في الـ AUDIT الأول. **BUG حقيقي** — معطّل في Electron kiosk mode.

```javascript
onClick={(e) => { e.stopPropagation(); if (window.confirm('حذف هذا الدعاء؟')) deleteCustomDua(item.id); }}
```

---

## 🔴 مشاكل CRITICAL جديدة من الحفر العميق

### NEW-C-1: `letter-spacing` على labels عربية (4 أماكن)

| الموقع | الـ class | letter-spacing |
|--------|----------|----------------|
| styles.css:710 | `.slideshow__section-marker-label` | `0.32em` |
| styles.css:2265 | `.prayer-tracker__prayer-label` | `0.28em` + `text-transform: uppercase` |
| styles.css:1066 | `.pin-badge__label` | `0.12em` + `text-transform: uppercase` |
| styles.css:991 | `.slideshow__hints` | `0.06em` (مقبول، لكن يتضمن عربي) |

**النص العربي خط مُتّصل** — `letter-spacing` يفصل الحروف المرتبطة.

مثال على الـ `prayer-tracker__prayer-label` — النص "الصلاة" يصبح "ا ل ص ل ا ة" بصرياً للقارئ العادي → كارثي لكبار السن.

**ملاحظة:** `text-transform: uppercase` لا يؤثر على العربي، لكنه واضح يدل أن النمط مأخوذ من design pattern لاتيني بدون تكييف.

**الحل:** أنشئ utility class:

```css
.label-tracked-latin {
  letter-spacing: 0.28em;
  text-transform: uppercase;
}
/* لا تطبّقها على نص عربي. */
```

---

### NEW-C-2: AlayhiSalam Component (ع) — حجم صغير افتراضياً

**Ornaments.jsx:97-111**

```jsx
export function AlayhiSalam({ size = 14 }) {
  return (
    <span style={{
      width: size * 1.6, height: size * 1.6,  // = 22.4px × 22.4px
      borderRadius: '50%',
      border: '1px solid currentColor',
      fontSize: size,                         // = 14px
      lineHeight: `${size * 1.5}px`,
      ...
    }}>ع</span>
  );
}
```

**المشكلة:**
- علامة "عليه السلام" هي علامة دينية مقدّسة في السياق الشيعي
- بحجم 14px × 22.4px دائرة، شبه غير مرئية لكبار السن
- تُستخدم في `Dashboard.jsx:216, 246`, `SlideshowOverlay.jsx:506`

**التأثير:** الجد يرى "الإمام الحسين" بدون "(ع)" واضحة → فقدان للإكرام الديني.

**الحل:**
- ارفع `size` الافتراضي إلى 18 على الأقل
- في الـ slideshow header استخدم size={28}+
- في `largeText` mode أضف override بـ size={26}+

---

### NEW-C-3: SalawatLine size='sm' = 14px

**Ornaments.jsx:135**

```jsx
const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 14;
```

**المشكلة:**
- size='sm' = 14px ثابت
- يُستخدم في **كل overlay** كنهاية (DuaPicker:736, SlideshowOverlay:584, Dashboard:540)
- النص: "اللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّد" — صلاة، نص ديني

**التأثير:** الجد يقرأ كل overlay، ينتهي بصلاة، الصلاة بـ 14px — يستهين بها بصرياً بدون قصد.

**الحل:**
- ارفع الـ floor إلى `clamp(16px, 1vw, 22px)` لـ size='sm'
- ولا يجب أن تكون أبداً تحت 16px لنص ديني

---

### NEW-C-4: PrayerTracker subtitle 12px

**styles.css:2220**

```css
.prayer-tracker__rakah-btn-sub {
  font-family: var(--m-font-body);
  font-size: 12px;
  color: var(--m-text-muted);
}
```

النص: "ركعتان", "ثلاث ركعات", "أربع ركعات" — يخبر العامل كم ركعة للصلاة المختارة.

**التأثير:** المعلومة الـ load-bearing (عدد الركعات) تظهر بأصغر خط في الـ UI. العامل يضغط زر الظهر، يتوقع 4 ركعات، يصير 2 لأنه ضغط الفجر بالخطأ.

⚠️ يوجد override في `[data-large-text]` (line 3720 يرفعه إلى 19px) — لكن `largeText` افتراضي ON الآن (وفقاً للـ comment في line 3661)، لذا في الإنتاج المستخدم يراه بـ 19px... ما لم يطفّيه. **التحقّق الفعلي مطلوب** بدون largeText.

---

### NEW-C-5: mode-btn 13px

**styles.css:2235** — `.prayer-tracker__mode-btn`

```css
font-size: 13px;
border: 1px dashed var(--m-hairline-faint);
```

النصوص: "تتبّع الركعات" و "عرض فقط" — وضع المتتبّع.

**التأثير:** الـ mode switcher صغير + border dashed (أصغر بصرياً) → عامل المسجد ما ينتبه له، يبقى في display-only mode ويضيع.

**الحل:** ارفع إلى 16px على الأقل + border solid.

---

### NEW-C-6: dua-picker source و pages بـ 14px

**styles.css:1783 + 1811**

```css
.dua-picker__item-source { font-size: 14px; color: var(--m-text-muted); }
.dua-picker__item-pages  { font-size: 14px; }
```

- **المصدر** ("المصدر: مفاتيح الجنان") — مهم لمصداقية المحتوى الديني
- **عدد الصفحات** ("١٢ صفحة") — يخبر المستخدم طول الدعاء

**التأثير:**
- بدون قراءة المصدر، المستخدم لا يميّز بين دعاء صحيح ودعاء مضاف من شخص
- بدون عدد الصفحات، يفتح دعاء طويل بالخطأ والكبار يحتاجون يعرفون

**الحل:** ارفع كلا الاثنين إلى 16-18px.

---

### NEW-C-7: inline-modal subtitle/label/error بـ 15px

**styles.css:3913, 3924, 3958**

```css
.inline-modal__subtitle { font-size: 15px; }
.inline-modal__label    { font-size: 15px; }
.inline-modal__error    { font-size: 15px; }
```

- الـ subtitle يحمل التعليمات (مثلاً: "أدخل رمز PIN لإيقاف التطبيق")
- الـ label فوق inputs
- الـ error يخبر المستخدم بالخطأ

**التأثير:** الجد لا يقرأ التعليمات، يقرأ فقط العنوان "إغلاق التطبيق" و الزرّين → يحدث خطأ.

✅ يوجد largeText override (15→17px) لكن غير كافٍ.

**الحل:** ارفع الـ defaults إلى 17-18px.

---

### NEW-C-8: aria-live على Announcement Banner

**DashboardFeatures.jsx:62**

```jsx
<div
  className={`announcement-banner announcement-banner--${dir}`}
  aria-live="polite"
  ...
```

**المشكلة:**
- الـ banner يتمرّر animations (CSS keyframes)
- النص نفسه لا يتغير، لكن لو operator F3 → غيّر النص → الـ aria-live يعلن
- لو النص طويل (50+ كلمة)، Screen Reader يقرأها كاملة كل تغيير

**التأثير على SR users:** تكرار إعلانات طويلة عند كل update.

**الحل:**
- استخدم `aria-live="off"` على marquee
- أو أعلن فقط النص الكامل مرة واحدة في عنصر `sr-only` خارج الـ banner

---

## 🟠 مشاكل عالية مؤكدة (نفس الـ AUDIT الأول)

من الـ AUDIT الأول، هذه لا تزال صالحة بعد التحقق:

- **H-3:** slideshow hints RTL مغلوطة (SlideshowOverlay.jsx:578)
- **H-4:** aria-live على Dashboard countdown (Dashboard.jsx:492) — يتحدّث كل ثانية
- **H-5:** Event auto-cycling 12s (Dashboard.jsx:174)
- **H-6:** maxLength silent truncation (DuaPicker.jsx:351-353)
- **H-7:** PIN length hint missing (SettingsOverlay.jsx:458)

---

## 🟡 مشاكل جديدة في formats / hooks / IPC

### NEW-M-1: `formatCountdown` بدون قواعد جمع عربية

**format.js:35-49**

```javascript
export const formatCountdown = (targetIso, nowMs = Date.now()) => {
  ...
  if (h > 0) {
    return `${toArabicDigits(h)} ساعة و ${toArabicDigits(m)} دقيقة`;
  }
  if (m > 0) {
    return `${toArabicDigits(m)} دقيقة و ${toArabicDigits(s)} ثانية`;
  }
  return `${toArabicDigits(s)} ثانية`;
};
```

**المشكلة:** العربية لها قواعد جمع معقدة:
- 1: "ساعة واحدة"
- 2: "ساعتان"
- 3-10: "ساعات" (مثلاً "٣ ساعات")
- 11-99: "ساعة" (مثلاً "١١ ساعة")
- 100+: "ساعة"

**الحالي:** يقول "٢ ساعة و ٣ دقيقة" — غير طبيعي. الجد يعلّق على الإحراج اللغوي.

**الحل:**

```javascript
function arabicPlural(n, [single, dual, plural3to10, pluralOver10]) {
  if (n === 1) return single;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${toArabicDigits(n)} ${plural3to10}`;
  return `${toArabicDigits(n)} ${pluralOver10}`;
}
// ساعة - ساعتان - ساعات - ساعة
arabicPlural(h, ['ساعة', 'ساعتان', 'ساعات', 'ساعة'])
```

---

### NEW-M-2: `useIdleVisibility` — 5 listeners على document

**useIdleVisibility.js:23**

```javascript
const events = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'];
events.forEach((e) => document.addEventListener(e, arm, { passive: true }));
```

**المشكلة:**
- 5 listeners على كل event (mousemove يطلق ~60 مرة/ثانية)
- الـ handler يفعّل `clearTimeout + setTimeout + setActive(true)` (لا يتغير state بعد أول مرة لكن re-render محتمل)

**الإصلاح:**
- استخدم `requestIdleCallback` للـ throttle
- أو فقط استخدم `mousemove + keydown + touchstart` (يكفي)
- أو استخدم `passive: true` (موجود ✅) + skip arm إذا كان `active === true` already

---

### NEW-M-3: `useModalActive` — module singleton race

**useModalActive.js:17**

```javascript
let _modalCount = 0;
```

**المشكلة:** module-level state. لو HMR (hot reload) في dev، module يُعاد تحميله ويبدأ من 0 بينما الـ overlays قد تكون مفتوحة → main process يظن لا modal مفتوح.

**التأثير:** developer pain فقط. في production OK.

**الحل (اختياري):** انقل إلى Context provider.

---

### NEW-M-4: `friendlyError` rule patterns غير شاملة

**errors.js:14-69**

تغطية:
- ✅ Network errors
- ✅ Geolocation
- ✅ Permission
- ✅ PIN
- ❌ **IPC errors generic** (مثل "no handler registered for..." → fallback)
- ❌ **JSON parse errors** على غير الـ schema (الحالي يطابق فقط schemaVersion)
- ❌ **Slideshow-specific errors** (deck not found, content corrupt)
- ❌ **Custom dua import** (file too large already handled outside)

**الحل:** أضف patterns:

```javascript
{ match: /no handler|invokeChannel|IPC/i,
  title: 'تعذّر التواصل مع التطبيق',
  hint: 'أعد تشغيل التطبيق' },
{ match: /deck not found|content.*missing/i,
  title: 'الدعاء غير موجود',
  hint: 'قد يكون محذوفاً أو تالفاً' },
```

---

### NEW-M-5: localStorage مستخدم في 4 مكوّنات بدون layer مشترك

DuaPicker, SlideshowOverlay, FirstRunTour, وآخر:

```javascript
// DuaPicker.jsx:90
function saveIdList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 50))); } catch (_) {}
}
```

**المشكلة:**
- لا layer abstraction
- لا quota checking
- لا migration support
- `catch (_) {}` يبتلع الأخطاء (مثل quota exceeded)

**الحل:** Create `src/renderer/lib/storage.js`:

```javascript
export const storage = {
  get(key, fallback) { ... },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (err) {
      if (err.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('mithnah:storage-full'));
      }
    }
  },
  remove(key) { ... },
  migrate(oldKey, newKey, transform) { ... }
};
```

---

## 🔵 مشاكل تقنية إضافية

### NEW-T-1: لا يوجد React testing

**package.json scripts:**

```json
"test": "node --test --test-reporter=spec \"tests/**/*.test.js\""
```

**المشكلة:** tests فقط للـ main process logic (cities, hijri, calculator, format). لا renderer/React tests.

**التأثير:** ٢٧ مشكلة UX/CX في الـ audit الأول لم تُكشف بأي CI test. التغييرات تنزل بدون regression catching.

**الحل:**
- أضف `vitest` + `@testing-library/react`
- اختبارات أساسية:
  - DuaPicker opens on F4
  - DuaPicker has correct touch target sizes
  - SettingsOverlay PIN gate works
  - Slideshow keyboard navigation matches RTL

---

### NEW-T-2: لا eslint / prettier

**devDependencies** — فيها فقط:
- @vitejs/plugin-react
- concurrently
- cross-env
- electron
- electron-builder
- vite

**لا يوجد:**
- ESLint (style consistency)
- Prettier (formatting)
- husky (pre-commit hooks)
- lint-staged (incremental lint)
- jsx-a11y plugin (would catch many issues!)

**التأثير:** style inconsistency يتراكم. أضفت كثير من inline styles في الـ components وuse PostCSS variables.

**الحل:**

```bash
npm i -D eslint eslint-plugin-react eslint-plugin-jsx-a11y prettier husky lint-staged
```

`.eslintrc.json`:
```json
{
  "extends": ["eslint:recommended", "plugin:react/recommended", "plugin:jsx-a11y/recommended"],
  "rules": {
    "jsx-a11y/no-noninteractive-element-interactions": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/no-static-element-interactions": "error"
  }
}
```

---

### NEW-T-3: Inline styles على Ornaments

**Ornaments.jsx — BrandMark, SalawatLine, AlayhiSalam كلها inline styles**

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
```

**المشكلة:**
- لا يستفيد من design tokens
- يصعب التغيير العام (مثلاً تكبير AlayhiSalam في كل المشروع)
- لا يعمل مع `[data-large-text]` overrides

**الحل:** انقل إلى class-based CSS تستخدم tokens.

---

### NEW-T-4: NSIS oneClick installer

**package.json:73**

```json
"nsis": {
  "oneClick": true,
  ...
}
```

**المشكلة:** `oneClick: true` يثبّت بدون أي خيارات للمستخدم. لكبار السن:
- يضغطون الـ .exe
- يثبّت ويفتح فوراً
- لا يعرفون أين تم التثبيت (مهم لو يحتاجون يحذفون laterأ)
- لا option لـ "Run as admin" — قد يحتاجون لـ kiosk permissions

**التقييم:** يعتمد على الجمهور. للـ technician اللي يثبّت في المسجد: مقبول. للجد اللي يثبّت بنفسه: مربك.

---

### NEW-T-5: ASAR enabled — debug صعب

**package.json:83** — `"asar": true`

✅ ممارسة قياسية، لا مشكلة
⚠️ لكن في حالة شكوى من المستخدم، الـ debugging أصعب. تأكد من logging جيد في production.

---

## 🟣 مشاكل بصرية إضافية

### NEW-V-1: `prayer-tracker__prayer-name` gradient على عربي كبير جداً

**styles.css:2362** (display-only mode):

```css
font-size: clamp(120px, 11vw, 220px);
background: linear-gradient(180deg, var(--m-accent-bright) 0%, var(--m-accent) 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

**المشكلة:**
- اسم الصلاة (مثلاً "الظهر") بـ 120-220px مع gradient
- في display-only mode هذا الـ hero للمشاهد من الصف الأخير
- لكن gradient transparent text على خلفية معقدة (mihrab halo, star pattern) → contrast صعب القياس
- ممكن قارئ من بعيد لا يميّز الحروف بسبب الـ blending

**الحل:**
- وفّر fallback: في `prefers-contrast: more` استخدم `--m-accent` solid بدل gradient
- أو دائماً اجعل النص solid `--m-accent-bright` ودع الـ glow يحمل الـ richness

---

### NEW-V-2: prayer-tracker prayer-label uppercase Arabic

**styles.css:2266** — `text-transform: uppercase` على عربي.

العربي لا يدعم upper/lower case، لذا `text-transform: uppercase` لا يفعل شي بصرياً.

**لكن:** يدل أن النمط لاتيني الأصل. اللي حصل هو نسخ pattern من Tailwind/Bootstrap لـ "small caps" بدون تكييف.

**الحل:** احذف `text-transform` كلياً من أنماط النص العربي.

---

### NEW-V-3: `cursor: not-allowed` على disabled buttons

موجود في عدة أماكن. ✅ ممتاز للـ feedback البصري.

⚠️ لكن `cursor: default` على باقي العناصر non-interactive (مثل أرقام الصلوات). تأكد لا يوجد `cursor: pointer` على non-clickables.

---

### NEW-V-4: `box-shadow: 0 0 80px var(--m-accent-glow)` على prayer-name

**styles.css:2278** — text-shadow ضخم.

**المشكلة:** على blanked (Ctrl+B) أو reduced motion، الـ glow ممكن يكون مربك بصرياً.

⚠️ `prefers-reduced-motion` لا يلغي الـ shadows، فقط animations. مستخدمين فوتوفوبيا (حساسية ضوء) قد يتأذون.

**الحل:** أضف `@media (prefers-reduced-transparency)` يقلل أو يحذف الـ glow.

---

## 🧭 User Journeys إضافية

### Journey 6: Operator يستخدم phone للتحكّم

**الخطوات:**
1. يفتح FloatingMenu
2. ينقر "إقران الجوال"
3. PairingModal يفتح
4. لو في LAN: QR + PIN
5. لو offline + Windows + WiFi: hotspot wizard
6. ينقر "فتح إعدادات Mobile Hotspot"
7. Windows Settings يفتح، يفعّل الـ hotspot
8. الجوال ينضم → PairingModal يحدّث QR تلقائياً
9. يمسح QR على الجوال → mobile-control.html يفتح

**نقاط الاحتكاك:**
- ✅ flow ممتاز، تم التفكير في offline scenario
- ⚠️ الخطوة 6-7: الجد ينقر "فتح الإعدادات" → Windows Settings يفتح → ينسى أين هو في Mithnah → يضغط ALT+TAB → kiosk lock إذا مفعّل
- ⚠️ الرسالة "قد يقول الجوال 'لا يوجد إنترنت' — اختر 'البقاء متصلًا'" — تنبيه ممتاز لكن صغير الخط (`font-size: ?`)

**التوصية:**
- أضف "🔙 العودة لـ Mithnah" overlay button بعد فتح Windows Settings
- ضع الـ hint بحجم 18px+ مع icon ⚠️

---

### Journey 7: Operator يرى Update Badge

**الخطوات:**
1. التطبيق شغّال، التحديث ينزّل في الخلفية
2. UpdateBadge يظهر "جاري تحميل التحديث · ٢٠٪"
3. يكتمل → "تحديث جاهز — سيُثبَّت عند الإغلاق"
4. الجد يبص بالشاشة، يرى الـ badge، لا يفهم
5. يضغط Alt+F4 → kiosk lock → confirm → التطبيق يقفل → التحديث يثبّت

**نقاط الاحتكاك:**
- 🔴 الجد لا يعرف "ما هو التحديث؟"
- الرسالة "سيُثبَّت عند الإغلاق" قد لا يفهمها — يظن التطبيق سيقفل تلقائياً
- البادج بـ font-size: ? (تحقّق) و position bottom-right (تتداخل مع FloatingMenu؟)

**التوصية:**
- بدّل النص إلى "إصدار جديد ✦ سيظهر بعد إعادة فتح التطبيق"
- أو "نسخة جديدة جاهزة ✓ تطبق تلقائياً بعد إعادة الفتح"
- تجنّب كلمات تقنية ("تحديث") لكبار السن

---

### Journey 8: Operator يكوّن imam list

**الخطوات:**
1. F3 → Basics tab
2. يجد Field "قائمة الأئمة"
3. ImamListEditor فيه placeholder "أضف إماماً جديداً"
4. يكتب "الشيخ علي" → Enter
5. الإسم يضاف، الـ input ينمسح
6. يكرّر
7. يفتح F5 → الـ select يحوي الأسماء

**نقاط الاحتكاك:**
- ✅ flow بسيط ومباشر
- ⚠️ زر الحذف (✕) داخل كل row — لم أر حجمه الافتراضي. الـ largeText override يعطيه 40px (تحت WCAG 44px). الـ default قد يكون أصغر
- ⚠️ لا confirm على الحذف — نقرة على ✕ = إسم يختفي

**التوصية:**
- زر ✕ → 48×48px على الأقل
- أضف undo snackbar للحذف
- أو require نقرتين

---

### Journey 9: First-Run Tour, Operator يضغط "تخطّي" بالخطأ

**الحالي (FirstRunTour.jsx:47-49):**

```javascript
// Confirmation modal before skipping. A stray click on "تخطّي" used
// to dismiss the tour forever — elderly operators tap by accident.
// This layer gives them a second chance.
const [confirmSkip, setConfirmSkip] = useState(false);
```

✅ **ممتاز** — تمت معالجة الـ stray-tap بـ confirm layer. مثال على وعي CX للكبار.

---

## 📊 تحليل styles.css (4245 سطر)

### تقسيم:

| القسم | الأسطر | الحجم النسبي |
|------|--------|--------------|
| Tokens + globals | 1-148 | 3.5% |
| Animations | 138-148 | < 1% |
| Dashboard | 150-700 | 13% |
| Slideshow | 700-1020 | 7.5% |
| PIN badge | 1020-1100 | 2% |
| HelpOverlay | 1085-1300 | 5% |
| Settings | 1300-1700 | 9% |
| DuaPicker | 1700-2080 | 9% |
| PrayerTracker | 2080-2700 | 14.5% |
| OnboardingOverlay | 2700-2900 | 4.5% |
| FloatingMenu | 3325-3500 | 4% |
| Update + Tour + Modal | 3550-3990 | 10% |
| Announcement + misc | 4000-4245 | 5.5% |

### Observations:

✅ **Tokens systematic** — `--m-*` variables، عُمق منطقي
✅ **BEM-style** — `.block__element--modifier` متّبع consistently
✅ **clamp() everywhere** — responsive typography
✅ **inset-inline-** أحياناً (RTL aware)، لكن:

❌ **mixed `right/left` و `inset-inline-end/start`**:

```bash
# rough count
$ grep -c "inset-inline" styles.css  # ~80 matches
$ grep -c "^\s*\(right\|left\):" styles.css  # ~40 matches
```

في RTL، `right` يصبح "right" literal، بينما `inset-inline-end` ينعكس. التداخل خطر:

**مثال:** `.dashboard__corner--tr { top: 26px; right: 26px; }` — في RTL، الـ "tr" (top-right) يبقى يمين physical، لكن دلالياً "trailing" في RTL تكون يسار. هل هذا متعمّد؟

🔍 **توصية فحص:** اكتب unit test يفحص لو الـ dashboard على RTL يظهر الأركان في الـ logical positions الصحيحة.

---

## 🔎 تحليل theme tokens (mithnah-design.css)

### Light theme contrast — صحيح:

```css
[data-theme="light"] {
  --m-text-primary:   #1a3530;   /* dark forest على ivory bg ≈ 14:1 — AAA */
  --m-text-secondary: #355048;   /* ≈ 9.5:1 — AAA */
  --m-text-muted:     #586863;   /* 4.5:1+ — AA (D4-10 fix) */
  --m-text-faint:     #6e6856;   /* deepened to 4.5:1 — AA */
  --m-primary:        #1f6e68;   /* D4-10 fix from #2d8a82 */
  --m-accent:         #8b5a1a;   /* D4-10 fix from #9c6f2a */
}
```

✅ تم فحص الـ contrast جدياً
⚠️ Light theme يُستخدم على الجوال فقط — wall is always dark

### Dark theme — Karbala dome palette:

```css
--m-bg-base:        oklch(0.24 0.035 180);   /* deep teal */
--m-accent:         #e2b76a;   /* Najaf shrine gold */
--m-text-primary:   #f5ecd2;   /* manuscript ivory */
```

✅ هوية ثقافية مدروسة
✅ ivory text على teal bg ≈ 11:1 contrast — AAA
⚠️ Najaf gold #e2b76a على bg ≈ 4.5:1 — يمر AA بالكاد. على شاشة باهتة قد يبدو رمادي للجد

**الحل (اختياري):** أضف `[data-contrast="high"]` يدفع gold إلى #f0cf8c (4.83+:1)

---

## 🏗️ Architecture Observations

### ✅ ممتاز:

1. **Main process / Renderer separation نظيف**
   - Main: prayer-times, hijri, location, shia-content, slideshow, updater
   - Renderer: React components + lib hooks
   - IPC layer مفصول في `preload.js`

2. **Per-overlay ErrorBoundary** في App.jsx — كل overlay محمي
3. **bridge-ipc.js** — composite snapshot للـ dashboard (single source of truth)
4. **frame-guard.js** — security layer (لم أفحصها بعمق)
5. **network-policy.js** — security
6. **app-features.js** — feature flag system

### ⚠️ ملاحظات:

1. **`auto-content.js`** — لم أفحصها. تعمل تلقائياً (autoContentToday feature). تحقّق من logic
2. **`prayer-times/cache.js`** — caching strategy للأوقات. تحقّق من invalidation
3. **`network-capabilities.js`** — لم أفحصها. يجب يكون robust للـ Windows variations

---

## 🎯 الـ Sprint Plan المُحدّث (بناءً على الـ deep audit)

### Sprint 1 — Critical Fixes (FRESH)

- [ ] **C-1**: استبدل `window.confirm` في DuaPicker بـ inline modal
- [ ] **NEW-C-1**: احذف `letter-spacing` من 4 عناصر بنص عربي
- [ ] **NEW-C-2**: ارفع AlayhiSalam default size إلى 18+
- [ ] **NEW-C-3**: SalawatLine size='sm' floor 16px
- [ ] **NEW-C-4 to C-7**: ارفع font sizes الـ 12-15px إلى 16-18px
- [ ] **NEW-C-8**: aria-live على announcement banner
- [ ] **H-3**: slideshow hints RTL direction

### Sprint 2 — Polish & Plurals

- [ ] **NEW-M-1**: pluralization عربية في formatCountdown
- [ ] **NEW-M-4**: أضف error rules
- [ ] **NEW-M-5**: storage abstraction layer
- [ ] **NEW-V-1**: prayer-name solid color fallback
- [ ] **NEW-V-2**: احذف `text-transform: uppercase` من عربي
- [ ] **NEW-T-3**: انقل Ornaments inline styles إلى classes

### Sprint 3 — Testing & Tooling

- [ ] **NEW-T-1**: أضف vitest + React Testing Library
- [ ] **NEW-T-2**: أضف ESLint + jsx-a11y + Prettier
- [ ] أضف axe-core في CI لكشف a11y regressions

### Sprint 4 — Architecture

- [ ] فحص `auto-content.js` و `prayer-times/cache.js`
- [ ] فحص `frame-guard.js` للـ security
- [ ] فحص `network-capabilities.js` للـ edge cases
- [ ] فحص الـ `slideshow/index.js` state machine
- [ ] تأكد من logical RTL position (inset-inline-*) في كل الـ corners

---

## 📋 إحصائيات نهائية

### كود مفحوص:

- ✅ ٢٠ component React (كاملاً أو معظمها)
- ✅ ٣ hooks (useFocusTrap, useIdleVisibility, useModalActive)
- ✅ ٣ lib files (errors, format, ipc surface)
- ✅ styles.css (٤٢٤٥ سطر — قراءة targeted)
- ✅ mithnah-design.css (theme tokens)
- ✅ package.json
- ✅ preload.js
- ⚠️ main/* files (Bash لم تُفحص بعد بعمق — موعود في Sprint 4)

### مشاكل مكتشفة:

| النوع | الـ AUDIT الأول | NEW في deep audit | المجموع |
|------|-------------|-------|---------|
| 🔴 Critical | 5 | 8 | 13 |
| 🟠 High | 7 | — | 7 |
| 🟡 Medium | 7 | 5 | 12 |
| 🔵 Technical | 4 | 5 | 9 |
| 🟣 Visual | 4 | 4 | 8 |
| **المجموع** | **27** | **22** | **49** |

### نقاط القوة المُكتشفة:

- ✅ Theme tokens مع فحص contrast جدّي (D4-10, D4-13)
- ✅ FloatingMenu opacity 0.45 (ليس 0) — صح للكبار
- ✅ Touch targets أعلى من WCAG في معظم الأماكن
- ✅ Per-overlay ErrorBoundary
- ✅ Friendly errors في 13 rule pattern
- ✅ FirstRunTour confirm-skip layer
- ✅ Skeleton loader مع close button (لا يتم تجميد التطبيق)
- ✅ Inline modals بدل native (kiosk-safe)
- ✅ Comprehensive `[data-large-text]` overrides
- ✅ Logical CSS properties (inset-inline-*) في معظم الأماكن
- ✅ `prefers-reduced-motion` global override
- ✅ Config undo stack (15s window في UndoToast)
- ✅ Focus traps في كل overlay
- ✅ Per-overlay PIN gate (Settings) + per-feature flag

---

## 🏆 الخلاصة المُحدّثة

**التقييم الإجمالي:** ⭐⭐⭐⭐ → ⭐⭐⭐⭐½ بعد التصحيحات

المنتج **أفضل بكثير** مما ظهر في الـ AUDIT الأول. الفريق فعلاً فكّر في كبار السن من البداية، ووُجدت أدلة على cycles مراجعة سابقة (D4-10, D4-13, REVIEW F-005, REVIEW D4-13).

**لكن:** الشيطان في التفاصيل:
- 7+ مكان فيها font 12-15px (تحت معيار الكبار)
- letter-spacing على العربي في 4 أماكن
- AlayhiSalam (علامة دينية) صغيرة
- SalawatLine 14px غير مقبول لنص ديني

**الخلاصة:** المشروع قريب جداً من ممتاز. مع Sprint 1 (Critical Fixes — ٨ items) يصبح كامل الجاهزية لكبار السن.

---

**تم بحمد الله**
