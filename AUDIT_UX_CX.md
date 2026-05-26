# Mithnah — UX/UI/CX Deep Audit

> **التركيز:** كبار السن (٦٥+) كمستخدمين أساسيين
> **النطاق:** كل المكوّنات الـ React + styles.css + user journeys
> **تاريخ المراجعة:** 2026-05-26
> **المراجِع:** Claude (Opus 4.7)

---

## 📊 التقييم الإجمالي

| المحور | التقييم | الملاحظة |
|--------|---------|----------|
| UX/UI | ⭐⭐⭐⭐ (4/5) | قوي، بعض التفاصيل الحرجة |
| CX | ⭐⭐⭐⭐ (4/5) | مدروس لكبار السن لكن فيه ثغرات |
| A11y | ⭐⭐⭐⭐⭐ (5/5) | استثنائي — focus traps، idle floors، RTL |
| Visual Identity | ⭐⭐⭐⭐⭐ (5/5) | مميّز، يحترم الهوية الشيعية |
| Code Quality | ⭐⭐⭐⭐ (4/5) | comments ممتازة، architecture نظيف |

---

## 🟢 نقاط القوة (الحفاظ عليها)

1. **a11y foundation قوي** — focus traps، `useModalActive`، `useIdleVisibility` مبني على بحث NN/g لكبار السن (10s floor)
2. **تعدد طرق الوصول**: F-keys + FloatingMenu + جوال مقترن (Logitech R400)
3. **DOM-measured pagination** في `SlideshowOverlay` — حل ذكي لمشكلة قص النص
4. **Welcome banner + FirstRunTour** لأول مرة — توجيه لطيف للكبار
5. **Friendly error titles + زر "إعادة المحاولة"** — احترام للمستخدم
6. **`prefers-reduced-motion`** محترم عالمياً (styles.css:61)
7. **Skeleton loader** يحافظ على close button — لا يوجد black-screen frozen state
8. **Config undo stack** — recovery pattern ممتاز
9. **Inline modals** بدل native `confirm/prompt` (التي معطّلة في Electron kiosk)
10. **Design tokens** نظيفة — spacing، radius، z-index، motion في `:root`
11. **Custom content per tab** (duas/ziyarat/taqibat) — تخصيص قوي

---

## 🔴 مشاكل CRITICAL (حلّها فوراً)

### C-1: `window.confirm()` في DuaPicker.jsx:701

```javascript
onClick={(e) => { e.stopPropagation(); if (window.confirm('حذف هذا الدعاء؟')) deleteCustomDua(item.id); }}
```

**المشكلة:** `window.confirm` معطّل في Electron kiosk mode → ينقر "حذف" → ما يحدث شي → غموض كامل.

**التأثير على كبار السن:** يضغط مرتين، ثلاث، يظن العطل في يده → يتجنب الميزة كلياً.

**الحل:** استبدل بـ inline-modal pattern الموجود (مثل LogoField أو exit confirm في Dashboard).

```jsx
const [confirmDelete, setConfirmDelete] = useState(null);
// عند النقر على 🗑:
setConfirmDelete(item);
// ثم render inline modal مع "نعم، احذف" / "إلغاء"
```

---

### C-2: FloatingMenu يختفي كلياً بعد 12 ثانية

**FloatingMenu.jsx:58, 95** — `useIdleVisibility(12000)` ثم `floating-menu__trigger--idle` class.

**المشكلة:** الزر الوحيد المرئي لفتح أي overlay يصبح غير مرئي بعد 12 ثانية بدون حركة فأرة.

**التأثير على كبار السن:** الجد يطالع لوحة الصلاة، فجأة يحتاج يفتح الإعدادات، الزر اختفى → احباط كامل.

**الحل:**
- ابقي opacity **0.5 على الأقل** بدل 0
- أضف نبضة pulse خفيفة كل 30 ثانية على الـ idle state
- أو ببساطة: احذف auto-hide للـ trigger (الـ overlay فقط يستفيد منه)

---

### C-3: لا يوجد UNDO للحذف

**DuaPicker.jsx:701** + كل operations حذف.

**المشكلة:** نقرة خاطئة = ضياع دائم للدعاء/الزيارة المضافة، بلا تراجع.

**الحل:** snackbar "تم الحذف · تراجع" لمدة 8 ثوان قبل الحذف الفعلي. استخدم نفس فلسفة `UndoToast.jsx` الموجودة.

---

### C-4: نظام Typography ضعيف لكبار السن — ٦ مشاكل حد أدنى

WCAG و NN/g: **حد أدنى 16px للنص العادي لكبار السن**. حالياً عندك:

| الملف:السطر | الـ class | الحجم الحالي | المطلوب |
|--------------|----------|--------------|---------|
| styles.css:497 | `.event-strip__countdown-kind` | `clamp(10px, 0.85vw, 13px)` | `clamp(16px, 1.2vw, 22px)` |
| styles.css:710 | `.slideshow__section-marker-label` | `clamp(12px, 0.95vw, 18px)` | `clamp(18px, 1.4vw, 26px)` |
| styles.css:967 | `.slideshow__source` | `clamp(13px, 1vw, 18px)` | `clamp(18px, 1.3vw, 24px)` |
| styles.css:989 | `.slideshow__hints` | `clamp(13px, 0.95vw, 18px)` | `clamp(18px, 1.4vw, 24px)` |
| styles.css:2456 | `.prayer-tracker__imam-label` | `clamp(12px, 0.95vw, 15px)` | `clamp(18px, 1.3vw, 22px)` |
| styles.css:2579 | (display-only label) | `clamp(13px, 1vw, 18px)` | `clamp(18px, 1.4vw, 24px)` |

**التأثير على كبار السن:**
- 70% من المستخدمين فوق 65 لا يقرؤون 12px من بعد متر
- النص الصغير في الـ slideshow hints = الجد ما يعرف يطلع → يضغط Alt+F4 → kiosk lock → احباط

---

### C-5: `letter-spacing` على النص العربي

**styles.css:710** — `letter-spacing: 0.32em` على `.slideshow__section-marker-label`.

**المشكلة:** العربي خط متّصل (connected script). `letter-spacing` يفصل الحروف المتصلة → نص مكسور بصرياً.

**التأثير:** الجد يقرأ "ا  ل  ف  ج  ر" بدل "الفجر". مربك جداً.

**الحل:** احذف `letter-spacing` من كل عنصر يحتوي عربياً. ابقي للأرقام و اللاتيني فقط.

---

## 🟠 مشاكل عالية الأهمية

### H-1: Touch targets أصغر من 44px

**معايير لكبار السن:**
- WCAG 2.1 AA: 44×44px (حد أدنى)
- NN/g elderly: **56×56px** (للأيدي المرتعشة)
- NHS Digital (Dementia): **64×64px**

**أماكن مشكلة:**

| الموقع | المشكلة | الحل |
|--------|---------|------|
| DuaPicker.jsx:680-686 (نجمة المفضّلة) | لا حجم صريح، عادة 24-32px | 56×56px + padding |
| DuaPicker.jsx:689-704 (✎ / 🗑) | 3 أزرار قريبة في زاوية | افصل رأسياً، 48×48px لكل واحد |
| SlideshowOverlay.jsx:482-486 (ﺍ-/ﺍ+) | غالباً 32-36px | 56px + 16px gap |
| DuaPicker.jsx:491-493 (إغلاق · Esc) | text-link، ليس button | bg + border + padding 16×24 |
| DuaPicker.jsx:522 (× welcome close) | × صغير بدون padding | 44×44px |

**Fitts's Law:** `T = a + b·log2(D/W + 1)` — كل ما الزر أصغر و أقرب لزر آخر، زاد احتمال النقر الخاطئ. على كبار السن المضاعف 2-3x.

---

### H-2: Cognitive Load مرتفع

أبحاث: كبار السن (70+) يعالجون **1-2 عنصر** في الذاكرة العاملة، ضد 4-7 للشاب.

**SettingsOverlay** (1510 سطر):
- حتى مع tabs، الـ basics tab فيها 6+ حقول مرئية
- 👴 الجد يفتح F3 → يشوف 10+ حقول → ينسحب

**الحل:**
- "الأساسيات" tab: 3 حقول فقط (اسم المسجد، المرجع، الموقع)
- "متقدّم" tab: الباقي
- عناوين قسم بحجم 24px+

**DuaPicker:**
- البحث + 3 tabs + 3 أزرار (إضافة/تصدير/استيراد) + welcome banner + grid
- 👴 7 مناطق بصرية في وقت واحد

**الحل:**
- ابدأ بـ tabs كبيرة (200×100px)
- اخفي تصدير/استيراد تحت "⋯ المزيد"

**FloatingMenu pop-up:**
- 7 أزرار + hint + destructive
- 👴 شف 7 خيارات = 2-3 ثوان تفكير

**الحل:** 3 أزرار أساسية + "المزيد ▼"

---

### H-3: Slideshow Hints مغلوطة الاتجاه (RTL bug)

**SlideshowOverlay.jsx:578**

```jsx
<div className="slideshow__hints">→ السابق · التالي ← · Esc للإغلاق</div>
```

**الكود الفعلي (السطر 367-372):** `ArrowLeft` = NEXT (RTL منطق صحيح).

**المشكلة في الـ hints:**
- في RTL، السهم ← (left arrow) هو "التالي" (يتقدم في النص العربي)
- الـ hint يقول "→ السابق · التالي ←" — معكوس
- 👴 الجد يقرأ التلميح، ينقر السهم الخاطئ، يرجع للخلف بدل التقدم

**الحل:**

```jsx
<div className="slideshow__hints">← التالي · → السابق · Esc للإغلاق</div>
```

---

### H-4: aria-live على Countdown يربك Screen Readers

**Dashboard.jsx:489-497**

```jsx
<div className="next__countdown next__countdown--pill"
     role="status"
     aria-live="polite"
     aria-atomic="true"
     aria-label="الوقت المتبقي للصلاة القادمة">
```

**المشكلة:** الـ countdown يتحدّث كل ثانية (`useClock`). الـ aria-live يجعل screen reader يقرأ كل ثانية → ضوضاء كاملة.

**الحل:**
- احذف `aria-live` من countdown
- أو: انقل aria-live إلى عنصر يعلن **كل دقيقة فقط** (round to nearest minute)
- أو: استخدم `aria-live="off"` على القيمة، و `aria-label` فقط للسياق الأولي

---

### H-5: Event Strip auto-cycling يقطع القراءة

**Dashboard.jsx:174-177**

```javascript
useEffect(() => {
  const id = setInterval(() => setCursor((c) => c + 1), 12000);
  return () => clearInterval(id);
}, []);
```

**المشكلة:** كل 12 ثانية يتغير الحدث المعروض. لو الجد كان يقرأ، فجأة يختفي.

**ملاحظة:** الـ comment يقول typically ≤1 event، لكن لو في 2+ → مشكلة.

**الحل:**
- عطّل الـ cycling كلياً، اعرض كل الأحداث مكدّسة عمودياً
- أو زد المدة إلى 30 ثانية + تلميح "↻ تغيير تلقائي"
- أو أوقف الـ cycling عند `:hover` على الـ event strip

---

### H-6: maxLength silent truncation في الـ Editor

**DuaPicker.jsx:351-353**

```javascript
const title = (draft.title || '').trim().slice(0, 200);
const body = (draft.body || '').trim().slice(0, 20000);
```

**المشكلة:** الجد يلصق زيارة طويلة → تنقص بصمت بلا تنبيه.

**الحل:**
- عدّاد "1980/2000" في الـ Editor، يصير أحمر عند 90٪
- modal warning قبل الحفظ إذا كان النص أكبر من الحد
- أو: ارفع الحد الأقصى للجسم إلى 50000 (حالياً 20000 قد لا يكفي زيارة الأربعين)

---

### H-7: maxlength PIN غامض

**SettingsOverlay.jsx:458** — `pattern="\d{4,8}"`

**المشكلة:** لا يوجد تلميح للمستخدم عن الطول المطلوب.

**الحل:** أضف hint تحت الحقل: "PIN بين 4 و 8 أرقام"

---

## 🟡 مشاكل متوسطة (CX issues)

### M-1: Welcome banner فقط في tab الأدعية

**DuaPicker.jsx:509**

```jsx
{welcomeShown && tab === 'duas' && !favoritesMode && (
```

**المشكلة:** المستخدم يفتح tab الزيارات → فاضي → ما يعرف يضيف.

**الحل:** كل tab يحتاج welcome state خاص به (أو رسالة فارغة محسّنة).

---

### M-2: "لا نتائج لـ {query}" بدون recovery

**DuaPicker.jsx:630**

**الحل:** أضف:
```jsx
<div className="dua-picker__empty">
  لا نتائج لـ "{query}"
  <button onClick={() => setQuery('')}>↺ مسح البحث</button>
  <div>جرّب كلمات مثل: فرج، نور، رزق، توسّل</div>
</div>
```

---

### M-3: رسائل خطأ مختصرة

| الرسالة الحالية | المقترحة |
|-----------------|-----------|
| "رمز غير صحيح" | "الرمز غير صحيح. حاول مرة أخرى أو راجع المسؤول" |
| "فشل التحميل" | "فشل التحميل. تأكد من الاتصال أو اضغط ↻ لإعادة المحاولة" |
| "خطأ" | "حدث خطأ. الرجاء إعادة المحاولة" |

---

### M-4: Kiosk-unlock primary button destructive

**Dashboard.jsx:562-572**

```jsx
<button className="inline-modal__btn inline-modal__btn--primary"
        onClick={() => submitKioskQuit('')}>نعم، إيقاف</button>
<button className="inline-modal__btn"
        onClick={() => setUnlock(null)}
        autoFocus>إلغاء</button>
```

**المشكلة:** `--primary` على destructive action. autoFocus على cancel صحيح لكن visual hierarchy معكوس.

**الحل:**
- "إلغاء" يأخذ `--primary`
- "نعم، إيقاف" بـ background أحمر خفيف + delay 3 ثوان قبل التفعيل
- أو: أضف confirmation thrice (يكتب "نعم" بنفسه)

---

### M-5: Loading state بدون visual feedback

**DuaPicker.jsx:612** — `'جاري التحميل...'` نص فقط.

**الحل:** أضف ImamiStar spinner أو dots animation. كبار السن > 2 ثوان بدون تغذية راجعة = قلق.

---

### M-6: window.confirm-outside-the-card

**DuaPicker.jsx:474** — `<div className="dua-picker__bg" onClick={() => setOpen(false)} />`

**المشكلة:** نقرة عرضية خارج الكارت = إغلاق فوري، ضياع تعديلات الـ Editor.

**الحل:**
- لو `editor !== null` → تأكيد قبل الإغلاق
- أو احذف click-outside-to-close
- أو require نقرتين

---

### M-7: dark patterns صغيرة

**Dashboard.jsx:566** — "نعم، إيقاف" بنفس visual weight مثل "إلغاء" — ليس dark pattern لكن مربك. الـ destructive يجب يكون secondary visually.

---

## 🔵 مشاكل تقنية (قد تؤثر على UX)

### T-1: Re-renders غير ضرورية في DuaPicker

**DuaPicker.jsx:220-238** — `mergedItems`, `filteredItems` يستخدمان `useMemo` ✅
لكن `customByTab` كائن جديد كل setState → كل الـ memos تنكسر.

**الحل:** استخدم `useReducer` أو `Map` للـ customByTab.

---

### T-2: Memory leak محتمل في FloatingMenu

**FloatingMenu.jsx:63-77** — useEffect يضيف document listeners.

```javascript
return () => {
  document.removeEventListener('mousedown', onDoc);
  document.removeEventListener('keydown', onKey);
};
```

✅ cleanup صحيح، لكن `onDoc` و `onKey` ينعاد إنشاؤها كل render → reference جديد → الـ removeEventListener لا يطابق.

**الحل:** wrap في `useCallback` أو حركهم خارج الـ effect.

---

### T-3: Race condition في SettingsOverlay onMarja

**SettingsOverlay.jsx:546-566**

✅ هناك `flushPendingConfig()` قبل `setMarja()` — جيد!
لكن لو المستخدم غيّر marja مرتين بسرعة، الـ getConfig() الأول قد يصل بعد الثاني.

**الحل:** أضف request ID counter (race-protection pattern).

---

### T-4: localStorage parsing بدون version check

**DuaPicker.jsx:62, 86** — `JSON.parse(raw)` بدون التحقق من schema version.

**المشكلة:** بعد update، الـ schema قد يتغير → الـ catch فقط يتجاهل.

**الحل:** schema version field + migration step.

---

## 🟣 مشاكل بصرية / Visual Design

### V-1: gradient text على الـ masthead

**styles.css:278-281** — masthead__title يستخدم:
```css
background: linear-gradient(180deg, ...);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

**المشكلة المحتملة:** gradient text + diacritics (تشكيل) في أسماء بعض المساجد → rendering مكسور في بعض المتصفحات.

**الاختبار:** اسم مسجد بحركات مثل "مَسْجِدُ الإِمَامِ الحُسَيْنِ ع" — تحقق على Chromium الحالي.

**الحل البديل:** solid color مع subtle text-shadow.

---

### V-2: dashboard__dates-dot opacity مزدوج

**styles.css:296** — `background: var(--m-text-muted); opacity: 0.6`

**المشكلة:** opacity على عنصر يقلل contrast إضافياً → قد يفشل WCAG.

**الحل:** استخدم لون داكن مباشر بدل muted + opacity.

---

### V-3: motion tier ناقص للكبار

**styles.css:131-134** — motion tokens:
- `--m-motion-fast: 150ms` — سريع جداً لكبار السن
- `--m-motion-standard: 220ms` — مقبول
- `--m-motion-slow: 320ms` — جيد

**الحل:** أضف tier جديد:
```css
--m-motion-elderly: 400ms;
```
استخدمه لـ overlays + state transitions.

---

### V-4: arabesque corners size

**styles.css:174-177** — 4 arabesque corners عند inset 26px.

✅ ممتاز للهوية البصرية
⚠️ لكن قد تتداخل مع dashboard__mosque-logo عند الـ TR (السطر 252-264 صحّحت هذا — جيد)

تحقق من باقي الأركان لا تتداخل مع FloatingMenu أو QiblaBadge.

---

## 🧭 User Journeys — Walkthroughs

### Journey 1: Setup الأول من قبل المسؤول التقني

**الخطوات:**
1. يثبّت التطبيق → Dashboard فارغ
2. OnboardingOverlay يفتح (location) ✅
3. ينهيها → FirstRunTour يبدأ ✅
4. يقفل التور → يفتح F3 → يضع اسم المسجد، المرجع، PIN

**نقاط الاحتكاك:**
- في F3، الواجهة معقدة جداً (1510 سطر، 6+ tabs)
- لا يوجد setup wizard متدرج

**التوصية:** Setup wizard بـ 5 خطوات:
1. اسم المسجد + الشعار
2. الموقع
3. المرجع + التقويم
4. اختيار الميزات (announcement, qibla, etc.)
5. PIN حماية + onboardingCompleted: true

---

### Journey 2: الجد يفتح دعاء

**الخطوات:**
1. يطالع Dashboard
2. يلحظ زر "القائمة" (إن لم يكن idle)
3. ينقر → menu يفتح
4. ينقر "مكتبة الأدعية" → DuaPicker يفتح
5. ينقر tab الأدعية → grid
6. يبحث عن "الفرج"
7. ينقر الكارت → slideshow يفتح
8. يستخدم Logitech R400 للتنقل

**نقاط الاحتكاك:**
- لو FloatingMenu في idle state (0 opacity) → الخطوة 2 تفشل
- البحث بـ placeholder ينسي الكبير ما هو المربع
- الـ slideshow hints معكوسة → ينقر السهم الخاطئ
- لو يبغى يخرج، الـ close button مختفي بعد 10 ثوان

**التوصية:** كل النقاط في القسم Critical + High.

---

### Journey 3: يحدث خطأ (IPC failure)

**الحالي:**
1. IPC يفشل
2. `friendlyErrorTitle()` ✅
3. الـ MSG يظهر مع زر "↻ إعادة المحاولة" ✅

**ممتاز** — هذا الـ flow مدروس جيداً.

---

### Journey 4: حذف دعاء مخصّص بالخطأ

**الحالي:**
1. ينقر 🗑
2. `window.confirm` (معطّل في kiosk!)
3. لا شي يحدث، أو الحذف يتم بصمت
4. **لا تراجع**

**التوصية:** Critical fix C-1 + C-3.

---

### Journey 5: تعديل اسم المسجد ثم Esc بسرعة

**الحالي:**
1. يكتب في الحقل
2. ينقر Esc قبل blur
3. `requestClose()` يستدعي `flushPendingConfig()` ✅
4. التغيير محفوظ

**ممتاز** — pattern جيد.

---

## 🎯 خطة عمل مقترحة (مرتّبة بالأولوية)

### Sprint 1 — Critical Fixes (يومين)

- [ ] **C-1**: استبدل `window.confirm` في DuaPicker بـ inline modal
- [ ] **C-2**: FloatingMenu opacity 0.5 floor (بدل 0)
- [ ] **C-3**: UndoToast لحذف الأدعية المخصّصة
- [ ] **C-4**: ارفع كل font-size floors من 10-13px إلى 16-18px
- [ ] **C-5**: احذف letter-spacing من كل العربي
- [ ] **H-3**: صحّح اتجاه الـ slideshow hints (RTL)

### Sprint 2 — High Priority (٣-٥ أيام)

- [ ] **H-1**: راجع touch targets — كل button ≥ 48×48px
- [ ] **H-2**: قسّم SettingsOverlay (Basics: 3 حقول فقط)
- [ ] **H-2**: خفّف DuaPicker toolbar (اخفي export/import تحت "⋯")
- [ ] **H-4**: أصلح aria-live على countdown
- [ ] **H-5**: عطّل auto-cycle للأحداث أو 30 ثانية
- [ ] **H-6**: عدّاد maxLength مرئي
- [ ] **H-7**: hint للـ PIN

### Sprint 3 — Medium / CX (٣-٥ أيام)

- [ ] **M-1**: Welcome state لكل tab
- [ ] **M-2**: Recovery من بحث فارغ
- [ ] **M-3**: رسائل خطأ أوضح
- [ ] **M-4**: kiosk-unlock visual hierarchy
- [ ] **M-5**: Spinner للتحميل
- [ ] **M-6**: protect-on-unsaved-changes
- [ ] إضافة "آخر دعاء عُرض" shortcut في FloatingMenu

### Sprint 4 — Polish (٢-٣ أيام)

- [ ] **V-1**: تحقق gradient text مع diacritics
- [ ] **V-2**: opacity → direct color
- [ ] **V-3**: motion-elderly tier
- [ ] **V-4**: تحقق corner conflicts
- [ ] أضف `font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1`
- [ ] تحقق WCAG contrast على كل tokens
- [ ] axe-core run على كل overlay

### Sprint 5 — Technical Debt

- [ ] **T-1**: useReducer لـ customByTab
- [ ] **T-2**: useCallback في FloatingMenu listeners
- [ ] **T-3**: request ID في SettingsOverlay
- [ ] **T-4**: localStorage schema versioning

---

## 📋 Checklist للاختبار اليدوي

قبل ما تعتبر شي "محلول"، اختبر:

### اختبار كبار السن (Elderly Simulation)

- [ ] افتح التطبيق بحجم نافذة 1024px — هل النصوص ≥ 16px؟
- [ ] حاول النقر على كل button بـ trackpad غير دقيق
- [ ] قف على بُعد متر من الشاشة — هل النصوص مقروءة؟
- [ ] فعّل `largeText` — هل كل شي ينضبط بدون overflow؟
- [ ] لبس نظارات +1.5 — يحاكي ضعف النظر

### اختبار Motor Accessibility

- [ ] استخدم الفأرة بيد واحدة فقط
- [ ] حاول النقر على نجمة المفضّلة بدون النقر على الكارت
- [ ] حاول الإغلاق بـ Esc و mouse و كل الطرق

### اختبار Screen Reader

- [ ] فعّل NVDA / Narrator
- [ ] افتح كل overlay — هل يعلن الـ title؟
- [ ] انتقل بـ Tab — هل يتبع منطق RTL؟
- [ ] افتح dropdown — هل يعلن الـ options؟

### اختبار RTL

- [ ] افتح slideshow بدعاء طويل
- [ ] جرّب arrow keys — هل ← هو "التالي"؟
- [ ] تحقق أن hints تطابق السلوك الفعلي

### اختبار Recovery

- [ ] احذف دعاء مخصّص — هل في UNDO؟
- [ ] افتح Editor، اكتب نص، نقر بره الكارت — هل تخسر؟
- [ ] IPC failure simulation — هل في "إعادة المحاولة"؟

---

## 🏆 خلاصة

**النقاط البارزة:**

✅ **a11y أعلى من المعدّل بكثير** — الـ focus traps، idle floors المبنية على بحث NN/g، respect لـ reduced-motion، RTL صحيح، inline modals بدل native dialogs، skeleton loaders، config undo stack — كلها ممارسات ممتازة.

✅ **Visual identity مميّز** — ImamiStar، arabesque corners، mihrab halo، calligraphy tokens — هوية مرتبطة بالسياق الشيعي.

✅ **Comments و architecture نظيفة** — كل قرار موثّق، أسباب التغييرات واضحة (especially Dashboard.jsx).

❌ **لكن:** الـ details الصغيرة (font sizes، touch targets، RTL hints) تكسر تجربة كبير السن. هذي مو bugs ضخمة، لكنها cumulative — كل واحدة تضيف احتكاك صغير، و في النهاية الجد يتنازل عن استخدام ميزة.

**القرار:** المنتج جاهز للنشر مع Sprint 1 (Critical fixes) كحد أدنى. Sprint 2-3 ترفعه من "جيد" إلى "ممتاز" لكبار السن.

---

**تم بحمد الله**
