# Mithnah — UX / CX / UI for Elderly Operators

> **هذا الملف يستبدل ويصحّح** `AUDIT_UX_CX.md` + `AUDIT_DEEP.md` + `AUDIT_ULTIMATE.md`.
> الملفات السابقة فيها مبالغات وتخمينات. هذا الملف فقط ما يمكن إثباته بسطر كود.
>
> **النطاق:** UX / UI / CX فقط (لا architecture، لا security، لا tests).
> **المستخدم:** كبار السن — معلّموهم، أئمتهم، خدّامهم في المساجد.
> **منهج المراجعة:** كل بند هنا فُحص بقراءة الكود الفعلي قبل كتابته. الإدّعاءات التي لا أقدر إثباتها بسطر كود لم تُذكر.

---

## 🔁 تصحيحات من الملفات السابقة

| الادّعاء السابق | الحقيقة | المصدر |
|----------------|----------|--------|
| FloatingMenu opacity 0 بعد 12 ثانية | فعلاً 0.45 مع نبضة 0.45→0.58 لطيفة | `styles.css:3358-3372` فيه comment يوضّح المنطق |
| Slideshow hints RTL معكوسة | الـ hint **صحيح** — يطابق المنطق في الكود | `SlideshowOverlay.jsx:578` + `SlideshowOverlay.jsx:367` (ArrowLeft=NEXT متّسق مع "← التالي" في الـ hint) |
| معظم touch targets تحت 44px | معظمها يلبّي WCAG | `slideshow__close:52px`, `floating-menu__trigger:64-72px`, `dua-picker__star:44px`, `dua-picker__item:130px`, etc |
| `inline-modal__subtitle 15px` مشكلة لكبار السن | يرتفع إلى 17px في largeText (default ON) | `styles.css:3732` |
| `dua-picker__item-source/pages 14px` | يرتفع إلى 16px في largeText (default ON) | `styles.css:3681, 3688` |
| `prayer-tracker__mode-btn 13px` و `rakah-btn 16px` | يرتفع إلى 19px في largeText (default ON) | `styles.css:3720-3721` |
| `event auto-cycling كل 12 ثانية` مشكلة | نادر فعلياً — الـ comment يقول "typically ≤1 event" | `Dashboard.jsx:178` |

**الخلاصة:** الفريق فعلاً درس كبار السن. النظام `[data-large-text]` شامل و default ON.

---

## 🔴 مشاكل مؤكدة بدليل مباشر (8 بنود)

كل بند هنا فُحص. الكود الفعلي مذكور، والتأثير على كبار السن وقائعي.

---

### 1. `window.confirm` في DuaPicker يصمت في kiosk

**الموقع:** `src/renderer/components/DuaPicker.jsx:701`

**الكود الفعلي:**
```jsx
onClick={(e) => { e.stopPropagation(); if (window.confirm('حذف هذا الدعاء؟')) deleteCustomDua(item.id); }}
```

**الدليل أن هذا bug:** التطبيق نفسه يوثّق في 3 أماكن أن `window.confirm` معطّل في Electron kiosk mode:
- `SettingsOverlay.jsx:300` — "Inline modals — replace native window.prompt/confirm which are disabled in Electron kiosk mode"
- `SettingsOverlay.jsx:1477` — مثلها
- `styles.css:3877` — "Replaces native window.prompt/confirm which don't render in packaged Electron kiosk"

كل أماكن أخرى تستخدم inline-modal pattern. فقط هذا السطر باقي على `window.confirm`.

**التأثير على كبير السن:** يضغط 🗑 على دعاء مخصّص. لا يحدث شي مرئي. يفترض أن نقرته لم تُسجّل، يضغط مرتين/ثلاث. في النسخة المُحزمة (packaged kiosk)، الحذف لا يحدث أبداً.

**الحل:** استبدل بـ inline-modal pattern (مثل CustomDuaEditor في نفس الملف، السطر 761). أضف `confirmDelete` state، وعند النقر اعرض modal بـ "نعم، احذف" / "إلغاء".

---

### 2. `SalawatLine size='sm'` = 14px ثابت — 6 مواضع

**الموقع:** `src/renderer/components/Ornaments.jsx:134-135`

**الكود الفعلي:**
```jsx
export function SalawatLine({ size = 'sm', className = '', style = {} }) {
  const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 14;
  return (
    <div className={`salawat-line ${className}`} style={{ fontFamily: ..., fontSize, ... }}>
```

**استخدام بحجم 'sm' (14px):**
1. `DuaPicker.jsx:736` — أسفل مكتبة الأدعية
2. `HelpOverlay.jsx:209` — أسفل المساعدة
3. `OnboardingOverlay.jsx:318` — أسفل أول إعداد للموقع
4. `PrayerTracker.jsx:566` — أسفل متابع الصلاة
5. `SettingsOverlay.jsx:1414` — أسفل الإعدادات
6. `SlideshowOverlay.jsx:584` — أسفل عرض الدعاء

**النص:** "اللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّد"

**التأثير على كبير السن:** الصلاة على النبي وآله نص ديني يُحرَص على إكرامه بصرياً. 14px أصغر من حد الإقراءة المريحة لكبير السن.

**`[data-large-text]` لا يصلحه:** الـ fontSize مكتوب inline في `style={{ fontSize }}` — overrides الـ CSS بـ specificity أعلى. لا يوجد override.

**الحل:** ارفع 'sm' من `14` إلى `clamp(18, 1.2vw, 24)`. أو افتح style class بدل inline.

---

### 3. `AlayhiSalam` يُستخدم بأحجام 9-11px (علامة دينية)

**الموقع:** `src/renderer/components/Ornaments.jsx:97-110`

**الكود:**
```jsx
export function AlayhiSalam({ size = 14 }) {
  return (
    <span style={{
      width: size * 1.6, height: size * 1.6,
      borderRadius: '50%',
      border: '1px solid currentColor',
      fontSize: size,
      ...
    }}>ع</span>
  );
}
```

**call sites:**
- `Dashboard.jsx:216` — `<AlayhiSalam size={starSize} />` حيث `starSize=11`
- `Dashboard.jsx:246` — `<AlayhiSalam size={starSize} />` حيث `starSize=9`
- `SlideshowOverlay.jsx:506` — `<AlayhiSalam size={10} />`

كل call sites تتجاوز الـ default (14) إلى قيم أصغر.

**الحجم البصري النهائي:**
- size=9 → دائرة 14.4×14.4px + حرف 9px داخلها
- size=10 → دائرة 16×16px + حرف 10px
- size=11 → دائرة 17.6×17.6px + حرف 11px

**التأثير على كبير السن:** "ع" هي علامة "عليه السلام" — مكرّمة ومهمّة دينياً. بحجم 9-11px لا تُقرأ من بعد متر. لكبار السن ذوي النظر الضعيف، تكاد تختفي.

**الحل:**
- ارفع الـ defaults في call sites: Dashboard.jsx event-strip من 9/11 إلى 14+، Slideshow من 10 إلى 18+
- أو ارفع الـ default في Ornaments من 14 إلى 18، وأزل الـ override من call sites

---

### 4. `letter-spacing` على نص عربي — 5 مواضع

**الخلفية:** العربي خط متّصل (connected script). `letter-spacing` يفصل الحروف المرتبطة، فيُكسر الكلمة بصرياً. "الصلاة" يصبح "ا ل ص ل ا ة".

**القياس:** فحصت كل letter-spacing > 0.04em في styles.css ووجدت 5 مواضع تطبّق على نص عربي:

| موقع | السطر | letter-spacing | محتوى النص |
|------|------|----------------|------------|
| `.slideshow__section-marker-label` | styles.css:711 | `0.32em` (الأشد) | عناوين أقسام الدعاء (e.g., "الفصل الأول") |
| `.prayer-tracker__prayer-label` | styles.css:2265 | `0.28em` + `text-transform: uppercase` | "صلاة" (Arabic) |
| `.event-strip__kind` | styles.css:528 | `0.20em` + uppercase | "شهادة" / "ولادة" / "عيد" |
| `.event-strip__countdown-kind` | styles.css:499 | `0.20em` + uppercase | "المناسبة القادمة" |
| `.next__label` | styles.css:390 | `0.18em` + uppercase | "الصلاة القادمة" |
| `.pin-badge__label` | styles.css:1066 | `0.12em` + uppercase | "الرابط" / "رمز PIN" (Pairing) |

**ملاحظة عن `text-transform: uppercase`:** لا يفعل شيئاً على العربي (لا يوجد upper/lower case)، لكنه دليل على أن النمط منسوخ من design pattern لاتيني بدون تكييف.

**التأثير على كبير السن:** صعوبة في قراءة عناوين الأقسام داخل الدعاء، اسم المناسبة، أو عبارة "الصلاة القادمة" — كلها معلومات load-bearing.

**الحل:**
- 0.32em و 0.28em: احذف letter-spacing كلياً.
- 0.20em و 0.18em: قلّل إلى 0 أو 0.02em (للأناقة بدون تكسير).
- 0.12em: مقبول لكنه يبقى ملحوظاً — راجعه.
- احذف `text-transform: uppercase` من كل عنصر يحوي عربياً (no-op + مضلّل للقارئ).

---

### 5. `event-strip__countdown-kind` floor 10px

**الموقع:** `src/renderer/styles.css:495-500`

**الكود:**
```css
.event-strip__countdown-kind {
  font-family: var(--m-font-body);
  font-size: clamp(10px, 0.85vw, 13px);
  color: var(--m-accent);
  letter-spacing: 0.20em;
  text-transform: uppercase;
}
```

**النص:** "المناسبة القادمة" — يظهر فوق العدّ التنازلي للحدث القادم.

**`[data-large-text]` override:** لا يوجد لـ `event-strip__countdown-kind` تحديداً (فقط `event-strip__title` على السطر 3635).

**التأثير على كبير السن:**
- على شاشة 1024px (نقطة floor الـ clamp): الخط فعلياً 10px
- على شاشة 1920px (0.85vw = 16.32px): الخط ~13px (cap)
- 10-13px مع letter-spacing 0.20em + uppercase no-op → نص شبه غير مقروء بصرياً

**الحل:** ارفع الحد الأدنى من 10px إلى 16px:
```css
font-size: clamp(16px, 1.2vw, 22px);
letter-spacing: 0;  /* See #4 */
text-transform: none;  /* See #4 */
```

---

### 6. أزرار حذف الدعاء/الزيارة المخصّصة 40×40px (تحت WCAG)

**الموقع:** `src/renderer/styles.css:2011-2026`

**الكود:**
```css
.dua-picker__edit,
.dua-picker__delete {
  position: absolute;
  bottom: 12px;
  width: 40px; height: 40px;
  ...
}
.dua-picker__delete { inset-inline-end: 12px; }
.dua-picker__edit   { inset-inline-end: 60px; }
```

في largeText mode (default ON):
```css
html[data-large-text="true"] .dua-picker__edit,
html[data-large-text="true"] .dua-picker__delete { width: 44px; height: 44px; font-size: 20px; }
```

**التحليل:**
- Default: 40×40px — **تحت WCAG 2.1 AA (44×44)**
- largeText: 44×44 — يلبّي WCAG لكن بالحدّ الأدنى فقط (NN/g توصي 56×56 لكبار السن)
- الزرّان متجاوران بفاصل 8px فقط (60-12-40=8) — يد مرتعشة قد تطبّق على الـ delete بدل edit أو العكس

**التأثير على كبير السن:** نقرة خاطئة بين ✎ و 🗑 على دعاء مخصّص — مع وجود مشكلة #1 (window.confirm صامت)، الحذف يحدث بدون تأكيد.

**الحل:** ارفع الحجم إلى 48×48 default / 56×56 في largeText، وزِد المسافة الأفقية إلى 16px.

---

### 7. زر حذف الإمام 32×32px (أقل بكثير من WCAG)

**الموقع:** `src/renderer/styles.css:3552-3557`

**الكود:**
```css
.imam-list-editor__remove {
  width: 32px; height: 32px;
  ...
}
```

largeText override (styles.css:3729):
```css
html[data-large-text="true"] .imam-list-editor__remove { width: 40px; height: 40px; font-size: 18px; }
```

**التحليل:**
- Default: 32×32px — **بعيد جداً عن WCAG 44**
- largeText: 40×40 — **لا يزال تحت WCAG**

ImamListEditor.jsx:54-56 — `aria-label={`حذف ${name}`}` ✅ لكن النقرة هي المشكلة.

**التأثير على كبير السن:** المسؤول التقني (technician) يضبط قائمة الأئمة في F3. إذا كان كبير السن (مسؤول صيانة المسجد العجوز)، فالنقر على ✕ صعب. الأخطر: لو نقر بالخطأ، لا يوجد undo. الإسم يُحذف فوراً.

**الحل:**
- ارفع إلى 48×48 default، 56×56 في largeText.
- أضف confirm modal أو UndoToast بعد الحذف (مثل النموذج في `src/renderer/components/UndoToast.jsx`).

---

### 8. DuaPicker يقصّ النص بصمت عند الحفظ

**الموقع:** `src/renderer/components/DuaPicker.jsx:349-353`

**الكود:**
```javascript
const saveCustomDua = (draft) => {
  const id = draft.id || `custom:${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const title = (draft.title || '').trim().slice(0, 200);
  const body = (draft.body || '').trim().slice(0, 20000);
  if (!title || !body) { setMsg('الرجاء إدخال العنوان والنص'); return; }
```

**Editor markup** (نفس الملف، السطر 775-795):
```jsx
<input ... maxLength={200} ... />
<textarea ... rows={10} />  // لا maxLength
```

**التحليل:**
- `<input>` يحد عند 200 (يمنع المزيد من الإدخال) ✅
- `<textarea>` لا يوجد maxLength — يستقبل أي طول، لكن `saveCustomDua` يقصّ عند 20000 بدون تنبيه
- زيارة الأربعين كاملة: ~18,000 حرف عربي. لو لصقها كبير السن، تحفظ. لو لصق "زيارة الإمام الحسين الكاملة" مع الأذكار: ~25,000 حرف — تنقص 5000 بصمت.

**التأثير على كبير السن:**
1. يلصق زيارة طويلة
2. ينقر "حفظ"
3. يفتح الزيارة لاحقاً ليكتشف أنها مقطوعة قبل النهاية
4. لا رسالة، لا تنبيه، يظن أن المصدر ناقص أو أن التطبيق "أكل" النص

**الحل:**
- أضف `maxLength={20000}` على الـ textarea ليتطابق مع saveCustomDua
- أضف عدّاد مرئي "X / 20,000" يصير أحمر عند 90٪
- أو ارفع الحد إلى 50,000 (زيارة الأربعين الكاملة < 30,000)

---

### 9. زر +/- في تعديل أوقات الصلاة 40×40px

**الموقع:** `src/renderer/styles.css:2727-2729`

**الكود:**
```css
.settings__adjust-btn {
  width: 40px; height: 40px;
  ...
}
```

**الاستخدام:** F3 → الصلاة → تعديل أوقات الصلاة بالدقيقة. لكل صلاة (٦ صلوات) زر `−` وزر `+` لتعديل دقيقة دقيقة.

**التحليل:**
- Default: 40×40px — تحت WCAG 2.1 AA (44×44)
- لا يوجد override في `[data-large-text]` لـ `.settings__adjust-btn`
- بين زرّي `−` و `+`: حقل input بعرض 60px، فالمسافة ضيقة

**التأثير على كبير السن:** المسؤول التقني يضبط تعويض الفجر +٥ دقيقة (مثلاً ليتطابق مع تقويم محلي). كل نقرة = ١ دقيقة. لو يبغى +١٠، يحتاج ١٠ نقرات على زر صغير. يد مرتعشة قد تنقر `−` بدلاً من `+`.

**الحل:**
- ارفع إلى 48×48 default، 56×56 في largeText
- أو أضف stepper بـ ×٥ / ×١٠ shortcuts

---

## 📱 Mobile Control — Phone UI (سطح منفصل)

**الملفات:** `build-output/mobile-control.html` (874 سطر) + `build-output/mobile-control.js` (881 سطر).

**السياق:** هذه واجهة الجوال — الاسطح يستخدمها المتطوّع/الإمام/المسؤول من جواله للتحكّم بشاشة المسجد (F5 tracker، slideshow navigation، GPS handoff، إعلانات).

**جودة عامة:** الواجهة مدروسة جداً — أفضل من واجهة الـ wall في بعض الجوانب (PIN reveal، two-tap confirm، guardedClick). لكن بها مشاكل متشابهة مع الـ wall في letter-spacing على العربي + أحجام بعض الخطوط.

---

### M-1: `letter-spacing` على عربي في 4 أنماط (Mobile)

**الموقع:** `build-output/mobile-control.html`

| الـ class | السطر | letter-spacing | محتوى النص |
|----------|------|----------------|------------|
| `.card__eyebrow` | 314 | `0.2em` + uppercase | إيبرو فوق العنوان (Arabic) |
| `.hero__label` | 333 | `0.18em` + uppercase | "الصلاة القادمة" (Arabic) |
| `.event__kind` | 398 | `0.15em` + uppercase | "شهادة" / "ولادة" / "عيد" (Arabic) |
| `.set-row__label` | 562 | `0.08em` | تسميات في تبويب الإعدادات (Arabic) |
| `.lib__count` | 510 | `0.08em` | "X عنصراً" (يحوي عربي) |

**نفس المشكلة كما في الـ wall:** العربي خط متّصل، letter-spacing يفصل الحروف.

**الحل:** نفس توصية #4 — احذف letter-spacing من نص عربي، احذف `text-transform: uppercase` (no-op).

---

### M-2: تسميات tab bar 0.7-0.85rem (تحت 16px)

**الموقع:** `build-output/mobile-control.html:273`

**الكود:**
```css
.nav__btn {
  ...
  font-size: clamp(0.7rem, 3vw, 0.85rem);
  ...
}
```

**Root font-size:** الـ `:root` بـ `font-size: clamp(16px, 4.1vw, 18px)` (السطر 39).

**الحجم النهائي:** 0.7-0.85rem × 16-18px root ≈ **11.2-15.3px**.

**التسميات:** "الرئيسية / التحكم / المكتبة / الإعدادات" — أسماء التبويبات الأربعة في القاع.

**التحليل:** الـ tab bar في الجوال يُلمس بالإبهام أثناء العمل. الـ icon (22px) يكفي للتعرّف، لكن النص الصغير تحت الـ icon يخدم كـ disambiguation للمستخدمين الجدد.

**التأثير على كبير السن:** يخلط بين "الرئيسية" و "الإعدادات" لأن النص غير مقروء، ينقر الإبهام على الـ icon فقط ويعتمد على الذاكرة.

**الحل:** ارفع إلى `clamp(0.95rem, 3.8vw, 1.05rem)` (~15-19px). أو حدد min-font 14px.

---

### M-3: `.lib__tab` (تصنيف المكتبة) 0.9-1rem حدّ كافي

**الموقع:** `build-output/mobile-control.html:481-488`

**الكود:**
```css
.lib__tab {
  min-height: 44px; padding: 10px;
  ...
  font-size: clamp(0.9rem, 3.8vw, 1rem);
}
```

**التحليل:** 14.4-18px — مقبول. لكن في `data-libtab` (Arabic labels: "الأدعية / الزيارات / التعقيبات"):
- نص + min-height 44 ✅
- ولكن min-height قد لا يتطابق مع NN/g 56px لكبار السن

**التأثير:** خفيف. التبويبات مرئية ومقروءة. مجرد ملاحظة أن الـ minimum touch target يكاد يكون 44 وليس 56.

**الحل:** ارفع min-height إلى 56px (يطابق `.ctrl-btn--big`).

---

## ✅ ممارسات Mobile Control الممتازة (للحفاظ)

هذه أنماط CX يجب نسخها إلى الـ wall renderer:

### MOB-A: PIN reveal مع 20s auto-mask

**`mobile-control.js:668-699`**

- النقر يكشف PIN
- ٢٠ ثانية بعد الكشف → auto-mask مع clearTimeout على cleanup
- نص "⟲ إخفاء" مرئي بجانب PIN المكشوف ليفهم المستخدم أن نقرة ثانية تُخفي (مو تحذف)
- comment يوضّح: "shoulder-surfing a large bright number in a mosque hall is easy otherwise"

### MOB-B: CLOSE = نقرتان للتأكيد

**`mobile-control.js:414-457`**

- زر "إنهاء العرض" — destructive
- نقرة أولى → النص يتغيّر إلى "تأكيد الإنهاء؟" لمدة 4 ثوان
- نقرة ثانية داخل الـ 4 ثوان → الإغلاق يحدث
- نقر زر آخر (NEXT/PREV/BLANK) → disarm
- 4 ثوان timeout → revert
- **هذا النمط بالضبط مطلوب لـ DuaPicker delete (#1)**

### MOB-C: guardedClick (spam-tap prevention)

**`mobile-control.js:367-386`**

- زر مخصّص لـ async action
- `_inflight` flag + disable + opacity 0.55 أثناء الفعل
- 150ms cooldown trailing — مرتبط بـ "iOS double-tap-zoom safety"
- بدون هذا، نقر سريع 10 مرات = 10 رركعات تتقدّم

### MOB-D: `announcementDirty` flag

**`mobile-control.js:611, 634`**

- يحرس textarea الإعلان من overwrite بـ refresh
- `document.activeElement` لا يكفي (focus قد يخرج لحظياً مع keyboard close)
- comment يوضّح: "a refresh in that gap would wipe the draft"

### MOB-E: GPS error code → Arabic explicit

**`mobile-control.js:750-753`**

```javascript
err.code === 1 ? 'رفضت المتصفّح الإذن بالموقع'
: err.code === 2 ? 'تعذّر تحديد الموقع (GPS معطّل؟)'
: err.code === 3 ? 'انتهت مهلة تحديد الموقع'
```

### MOB-F: Visibility change → stop polling

**`mobile-control.js:777-794`**

- Tab backgrounded → stops refresh + clock timers
- Tab visible → resume + immediate refresh
- Battery friendly + reduces server load
- ✨ هذا النمط ينقص في الـ wall renderer (الـ `useClock` يشتغل حتى لو النافذة في الخلفية)

### MOB-G: PIN attempts-left feedback

**`mobile-control.js:127-130`**

```javascript
if (Number.isFinite(remaining) && remaining >= 0) {
  throw new Error(`رمز PIN غير صحيح — تبقّى ${toArabicDigits(remaining)} محاولة`);
}
```

- بدلاً من "رمز PIN غير صحيح" الجاف
- يخبر المستخدم بعدد المحاولات المتبقّية قبل الحظر
- comment يقول: "they didn't know whether their next tap would lock them out for 15 minutes or not. UX audit 2026-04-24"

---

## 🟡 ملاحظات أقل تأكيداً — تستحق المراجعة

هذه ملاحظات أرى الكود يدعمها لكنها أقل وضوحاً كـ "bug" وقد تكون قرار تصميم متعمّد.

---

### 9. PIN gate بدون تلميح طول

**الموقع:** `src/renderer/components/SettingsOverlay.jsx:447-459`

**الكود:**
```jsx
<div className="help-overlay__subtitle">أدخل رمز PIN لفتح الإعدادات</div>
<form onSubmit={onSubmit}>
  <input
    type="password"
    placeholder="••••"
    pattern="\d{4,8}"   // يفرض 4-8 أرقام
    ...
  />
```

`pattern` يفرض 4-8 رقم، لكن المستخدم لا يرى هذا الحدّ في الواجهة. يبدأ بكتابة أقل من 4 → "فتح" مرفوض → لا يفهم لماذا.

**الحل:** أضف تلميح: `<div className="settings__hint">٤ إلى ٨ أرقام</div>`

---

### 10. `aria-live` على العدّ التنازلي يتحدّث كل ثانية

**الموقع:** `src/renderer/components/Dashboard.jsx:489-497`

**الكود:**
```jsx
<div
  className="next__countdown next__countdown--pill"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  aria-label="الوقت المتبقي للصلاة القادمة"
>
  <span className="next__countdown-value">بعد {formatCountdown(next.at, now.getTime())}</span>
</div>
```

`useClock` (Dashboard.jsx:23-30) يحدّث `now` كل ثانية → `next.__countdown-value` يتغيّر كل ثانية.

`aria-live="polite"` يؤخّر الإعلانات لحين هدوء المستخدم — يخفّف الأثر لكنه لا يلغيه.

**التأثير:** مستخدم screen reader يسمع تحديثات متكرّرة لمدّة لا تنتهي. ليس بحدّة `aria-assertive` لكنه مزعج.

**هل هذا فعلاً مشكلة في الواقع؟** الـ wall display نادراً ما يُستخدم مع screen reader (يُستخدم كـ "ambient" display). لكن لو فيه عجوز بصري في المسجد يحاول استخدام التطبيق على الجوال...

**الحل المقترح:** انقل aria-live إلى عنصر منفصل يتحدّث كل دقيقة فقط:
```jsx
<div className="sr-only" role="status" aria-live="polite">
  بقي {Math.ceil((next.at - now.getTime()) / 60000)} دقيقة على {next.name}
</div>
```

---

### 11. `dua-picker__welcome-close` بحجم 36×36

**الموقع:** `src/renderer/styles.css:1871-1875`

**الكود:**
```css
.dua-picker__welcome-close {
  flex: 0 0 auto;
  width: 36px; height: 36px;
  border-radius: var(--m-radius-full);
  ...
}
```

**التحليل:**
- 36×36 — تحت WCAG 44px
- يظهر مرة واحدة في حياة التطبيق (welcome banner أوّل فتح)
- نقرة خاطئة لا تكلّف شيئاً (الـ banner يختفي، يمكن إعادته بحذف localStorage)

**التأثير:** خفيف. لكن طالما باقي العناصر تلبّي WCAG، هذا شذوذ.

**الحل:** ارفع إلى 44×44.

---

### 12. Loading state بدون مؤشر بصري

**الموقع:** `src/renderer/components/DuaPicker.jsx:612`

**الكود:**
```jsx
{loading && <div className="dua-picker__empty">جاري التحميل...</div>}
```

نص فقط. لا spinner، لا nbsp، لا حركة. على hardware قديم في مسجد منعزل، التحميل قد يستغرق 2-3 ثوان لأول مرة.

**التأثير:** كبير السن يفتح F4، يرى "جاري التحميل..."، لا يعرف إن كان النظام يعمل أم متجمّد.

**الحل:** أضف ImamiStar متدوّرة أو dots animation. مثال:
```jsx
<div className="dua-picker__empty">
  <div className="loading-dots">جاري التحميل<span>.</span><span>.</span><span>.</span></div>
</div>
```

---

### 13. Search empty state بدون مخرج

**الموقع:** `src/renderer/components/DuaPicker.jsx:630`

**الكود:**
```jsx
return <div className="dua-picker__empty">لا نتائج لـ "{query}"</div>;
```

كبير السن يبحث، لا يجد، لا يعرف ماذا يفعل. لا زر "مسح البحث"، لا اقتراح كلمة بديلة.

**الحل:**
```jsx
return (
  <div className="dua-picker__empty">
    <div>لا نتائج لـ "{query}"</div>
    <button onClick={() => setQuery('')} className="settings__btn" style={{marginTop: 12}}>
      ↺ مسح البحث
    </button>
    <div style={{marginTop: 8, fontSize: 14}}>أو جرّب كلمات: فرج، نور، رزق</div>
  </div>
);
```

---

### 14. Kiosk-unlock primary button = destructive action

**الموقع:** `src/renderer/components/Dashboard.jsx:562-573`

**الكود:**
```jsx
<button
  type="button"
  className="inline-modal__btn inline-modal__btn--primary"
  onClick={() => submitKioskQuit('')}
>نعم، إيقاف</button>
<button
  type="button"
  className="inline-modal__btn"
  onClick={() => setUnlock(null)}
  autoFocus
>إلغاء</button>
```

**التحليل:**
- "نعم، إيقاف" بـ `--primary` style (gold background, prominent) — destructive action visually emphasized
- "إلغاء" بـ ghost style — visually less prominent
- ✅ `autoFocus` على إلغاء — Enter key يحفظ المستخدم
- ⚠️ لكن النقرة بالفأرة على الـ primary (الأكثر بصرياً) يُغلق التطبيق

**التأثير على كبير السن:** الـ visual hierarchy يدلّ كبير السن على نقر "نعم، إيقاف". إذا نقر، التطبيق يقفل. التطبيق kiosk display للمسجد — إغلاقه قد يُربك حتى إعادة تشغيل اليدوي.

**الحل:** اعكس الـ visual hierarchy:
- "إلغاء" يحصل على `--primary` (آمن، يبقي التطبيق)
- "نعم، إيقاف" بـ `--danger` style (red tint) أو ghost
- (autoFocus يبقى على إلغاء)

---

## 🟢 جوانب يجب الحفاظ عليها (ممارسات ممتازة)

هذه أمثلة جيدة على فهم كبار السن — يجب عدم التراجع عنها في تحديثات لاحقة.

### Wall Renderer

1. **`floating-menu__trigger--idle`** يبقى مرئياً بـ 0.45 opacity مع نبضة — `styles.css:3358`
2. **`useIdleVisibility(12000)`** الـ 12 ثانية مبني على بحث NN/g لكبار السن
3. **`useFocusTrap`** في كل overlay — keyboard users لا يضيعون
4. **FirstRunTour confirm-skip** — نقرة خاطئة على "تخطّي" لا تلغي التور بدون تأكيد ثانٍ
5. **`[data-large-text]` نظام override شامل** — defaults ON، يغطّي معظم العناصر
6. **Theme tokens** تم فحصها للـ contrast — D4-10 + D4-13 fixes
7. **Inline modals** بدل native `confirm/prompt` (إلا في DuaPicker:701 — راجع #1)
8. **Skeleton loader** في SettingsOverlay يبقي close button مرئياً أثناء التحميل
9. **`prefers-reduced-motion`** محترم عالمياً
10. **UndoToast** بمدّة 15 ثانية + countdown bar + pause-on-hover
11. **errors.js** يحوّل ECONNREFUSED إلى "تعذّر الاتصال بالإنترنت — التطبيق يعمل بدون انترنت"
12. **PairingModal** يرشد العامل لإعدادات Mobile Hotspot لو ما فيه Wi-Fi
13. **Per-overlay ErrorBoundary** — crash في overlay واحدة لا يهدم البقية
14. **Atomic config writes** — قطع كهرباء أثناء الحفظ لا يدمّر الإعدادات
15. **SettingsOverlay يحوي summary panel أعلى كل tab** — قيم حاليّة مرئية حتى لو inputs فاضية
16. **SettingsOverlay 4 tabs** (الأساسية / الصلاة / الموقع / متقدّم) — قسّم 1500-سطر form
17. **SettingsOverlay "آخر التغييرات" مع one-click undo** — تاريخ آخر ١٠ تعديلات
18. **GPS detect fallback** — لا auto-apply timezone (يخطئ ٤٠٠كم في السعودية حسب الـ comment)، بل يوجه المستخدم للجوال أو البحث اليدوي

### Mobile Phone UI

19. **PIN reveal مع 20s auto-mask** — shoulder-surfer safety
20. **CLOSE = two-tap confirm with 4s window** — يجب نسخ هذا للـ DuaPicker delete
21. **guardedClick** — يمنع spam-tap من خلق ٧ requests
22. **announcementDirty flag** — حماية textarea من overwrite بـ refresh
23. **GPS errors mapped لـ Arabic explicit messages** — مو "error code 2" بل "GPS معطّل؟"
24. **Visibility change → stops polling** — battery + server-friendly
25. **PIN failure response يخبر بعدد المحاولات المتبقّية** — "تبقّى 3 محاولات" بدل "خطأ"
26. **429 response مع Retry-After** يُترجم لـ Arabic readable time — "محاولات متكرّرة — حاول بعد ١٥ دقيقة"
27. **viewport `maximum-scale=5`** — يسمح pinch-zoom حتى 500% (WCAG 1.4.4)
28. **font-size 16px على inputs** — يمنع iOS auto-zoom (السطر 503، 617)

---

## 📊 ملخّص الأرقام (بعد كل المراجعات)

| الفئة | Wall | Mobile | المجموع |
|------|------|--------|---------|
| 🔴 مؤكدة (مع سطر كود) | 9 | 3 | **12** |
| 🟡 محتملة | 6 | — | 6 |
| 🟢 ممارسات ممتازة | 18 | 10 | **28** |
| ❌ مُتراجع عنها من السابق | 7 | — | 7 |

**صافي العمل المطلوب:**
- Wall: 9 إصلاحات مؤكّدة + 6 محتملة
- Mobile: 3 إصلاحات (letter-spacing + nav tab font + lib tab min-height)
- **مجموع: 12 إصلاحاً مؤكّداً + 6 مراجعات**

(مقارنة بـ 77 ادّعاء في الـ 3 ملفات السابقة → 12 منها مؤكّد فعلياً)

---

## 🔍 ما تمّ مراجعته في هذا الفحص

### Wall renderer (React app)
- ✅ App.jsx, Dashboard, DuaPicker, FloatingMenu, SlideshowOverlay, PrayerTracker (كاملة)
- ✅ SettingsOverlay (٩٠٠+ سطر مراجعة)
- ✅ HelpOverlay (٢١٠+ سطر كاملة)
- ✅ UpdateSection (١٣٠ سطر كاملة)
- ✅ FirstRunTour, OnboardingOverlay, PairingModal, ErrorBoundary, ErrorToast, UndoToast, HelpHint, UpdateBadge, ImamListEditor, Ornaments
- ✅ useFocusTrap, useIdleVisibility, useModalActive
- ✅ errors.js, format.js, ipc surface
- ✅ styles.css كامل (4245 سطر — قراءة مستهدفة بـ Grep)
- ✅ mithnah-design.css (theme tokens)

### Mobile phone UI
- ✅ mobile-control.html (874 سطر كاملة)
- ✅ mobile-control.js (881 سطر كاملة)

### Configuration
- ✅ package.json
- ✅ build/installer config
- ✅ prayer-times/defaults.js + config.js (schema + migrations)

### خارج النطاق (architecture / security / tests)
- ⚠️ main/index.js (1000+ سطر — قرأت ~200 سطر الأولى)
- ⚠️ slideshow state machine، prayer calculator، hijri logic
- ⚠️ network-policy، frame-guard، updater
- ⚠️ Tests folder

السبب: المستخدم طلب UX/UI/CX، وهذه الملفات لا تؤثر بصرياً على كبير السن مباشرة.

---

## ⏱️ تقدير وقت الإصلاح

### Wall renderer

| البند | الوقت | الصعوبة |
|------|------|---------|
| #1 window.confirm → inline modal | 30 دقيقة | منخفضة (CustomDuaEditor + MOB-B كمرجع) |
| #2 SalawatLine 'sm' floor | 5 دقائق | سهلة |
| #3 AlayhiSalam call sites | 10 دقائق | سهلة |
| #4 letter-spacing على عربي (5 styles) | 15 دقيقة | سهلة |
| #5 countdown-kind 10px floor | 5 دقائق | سهلة |
| #6 edit/delete 40→48 | 5 دقائق | سهلة |
| #7 imam-list remove 32→48 | 5 دقائق | سهلة |
| #8 textarea maxLength + counter | 20 دقيقة | متوسطة |
| #9 settings__adjust-btn 40→48 | 5 دقائق | سهلة |
| **wall المؤكّدة** | **~100 دقيقة** | جلسة واحدة |

### Mobile phone UI

| البند | الوقت | الصعوبة |
|------|------|---------|
| M-1 letter-spacing عربي (4 styles) | 10 دقائق | سهلة |
| M-2 nav tab labels 0.95rem+ | 5 دقائق | سهلة |
| M-3 lib__tab min-height 56 | 5 دقائق | سهلة |
| **mobile المؤكّدة** | **~20 دقيقة** | |

### المحتملة

| البند | الوقت | الصعوبة |
|------|------|---------|
| الـ 6 المحتملة | +60 دقيقة | يحتاج قرار تصميم |

**الإجمالي:** ~180 دقيقة (٣ ساعات) لكل المؤكّدة + المحتملة. **جلسة عمل واحدة كافية.**

---

## 🧪 خطة اختبار يدوية بعد الإصلاحات

كل بند يجب التحقق منه يدوياً قبل اعتباره منجزاً:

### Wall

1. **#1**: شغّل التطبيق packaged (مو dev)، أضف دعاء مخصّص، انقر 🗑 → يجب أن يظهر modal فعلي مع "نعم/إلغاء". انقر "إلغاء" → الدعاء يبقى. انقر "نعم" → الدعاء يُحذف.
2. **#2**: افتح أي overlay فيها SalawatLine sm — قِس عرض النص بـ DevTools. يجب أن يكون ≥ 18px.
3. **#3**: افتح Dashboard مع event-strip فعلي، تأكد "(ع)" بجانب اسم الإمام واضحة من بعد متر.
4. **#4**: افتح SlideshowOverlay على دعاء له headings — اقرأ "الفصل الأول" بدون فجوات بين الحروف.
5. **#5**: قلّص النافذة إلى 1024px ثم 1280px — قِس font-size للـ countdown-kind. يجب أن يكون ≥ 16px.
6. **#6**: حاول النقر بالفأرة على ✎ ثم على 🗑 على دعاء مخصّص بدون ميس. زِد المسافة لو ما يزال صعب.
7. **#7**: في F3 → Basics → قائمة الأئمة، أضف 3 أسماء، احذف الأوسط — يجب أن يكون touch-target واسع.
8. **#8**: الصق نص 25,000 حرف في الـ textarea. يجب أن:
   - يتوقف الإدخال عند 20,000 (مع maxLength)
   - يصبح العدّاد أحمر
   - النص لا يُقصّ عند الحفظ
9. **#9**: F3 → الصلاة → تعديل بالدقيقة. حاول النقر +/- بإصبع واحد بدون ميس على الـ input.

### Mobile

10. **M-1**: افتح الجوال، اقرأ "الصلاة القادمة" في الـ hero — يجب يكون الحرف متّصل بدون فجوات.
11. **M-2**: انظر إلى الـ bottom nav — كل تسمية ("الرئيسية" إلخ) يجب تكون قابلة للقراءة من ٤٠سم.
12. **M-3**: تبويب المكتبة، انقر على "الزيارات" بإصبع — يجب يكون 56px على الأقل.

---

**تم بحمد الله**

---

## ملاحظة منهجية

الملف السابق `AUDIT_UX_CX.md` كان يحوي 27 مشكلة، `AUDIT_DEEP.md` أضاف 22، و `AUDIT_ULTIMATE.md` 28. المجموع 77. **بعد التحقق الشامل (شمل الـ mobile UI أيضاً)، 12 منها فقط مؤكّدة كـ UX/CX bugs لكبار السن**. الباقي:
- مكرر بين الملفات
- مُتراجع عنه بعد قراءة الكود
- يصلحه نظام `[data-large-text]` الافتراضي
- ادّعاءات architecture/security/tests غير ضمن النطاق
- تخمينات سلوكية بدون دليل

هذا الملف هو المرجع الموثّق. الملفات الثلاثة السابقة يُنصح بحذفها أو تأشيرها archived.
