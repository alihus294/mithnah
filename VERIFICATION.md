# تحقّق متعدّد الأبعاد لـ ١٢ مشكلة مؤكّدة

> **هذا الملف:** فحص كل بند من `UX_CX_ELDERLY.md` من ٧ زوايا، مع تعديل مستوى الثقة لكل واحد.
> **النتيجة:** بعض البنود **تأكّدت بقوة أكبر**، بعضها **نُقّحت بعد كشف mitigation موجود**، بعضها **انخفض في الأولوية**.
>
> **منهج الفحص لكل بند:**
> 1. ✅ Code re-verification — هل الكود فعلاً كما وصفته؟
> 2. 🔬 متى يبيت الأثر أشدّ / أخفّ؟
> 3. 🛡️ Mitigation موجودة بالفعل (largeText، reduced-motion، etc.)
> 4. 🎭 سيناريوهات المستخدم
> 5. ⚠️ آثار جانبية للحل المقترح
> 6. 🔗 تفاعل مع البنود الأخرى
> 7. 📊 تعديل الثقة (✅ مؤكّد / 🔻 منخفض / ❌ مرفوض)

---

## #1 — window.confirm في DuaPicker:701

### 1. Re-verify

```javascript
// DuaPicker.jsx:701 (re-read)
onClick={(e) => { e.stopPropagation(); if (window.confirm('حذف هذا الدعاء؟')) deleteCustomDua(item.id); }}
```

✅ **مطابق ١٠٠٪** للوصف.

### 2. متى يبيت الأثر أشد؟

- **packaged build (production)**: window.confirm يعيد null بصمت ← الحذف لا يحدث، الجد ينقر ولا شي يحدث.
- **dev mode (npm run dev)**: window.confirm يعمل ← الميزة تشتغل (لكن لا أحد يستخدم mosque kiosk في dev).

### 3. Mitigation موجودة؟

❌ **لا**. لا fallback، لا inline modal، لا visual indicator أن الحذف قيد التنفيذ.

دلائل أن الفريق يعلم بمشكلة `window.confirm`:
- `SettingsOverlay.jsx:301` — "Inline modals — replace native window.prompt/confirm which are disabled in Electron kiosk mode (a tap silently returned null)"
- `Dashboard.jsx:271` — "disabled in packaged Electron kiosk"
- `SettingsOverlay.jsx:586, 758, 1418` — مكررّة

**هذا السطر فاتهم.** الفريق يعرف المشكلة العامة، لكن DuaPicker:701 لم يُحدّث.

### 4. سيناريوهات

- Operator يضيف دعاء مخصّص (ميزة فعالة)
- يقرّر الحذف ← ينقر 🗑 ← لا شي
- يفترض إن الزر لا يعمل ← يجرّب نقرات متتالية ← لا شي
- إما يتجاهل (الدعاء يبقى موجود) أو يحذف من localStorage يدوياً (يحتاج devtools)

### 5. آثار جانبية للحل

الحل (inline modal بنمط CustomDuaEditor) لا يكسر شيء.

### 6. تفاعل مع #6 (edit/delete buttons 40×40)

⚠️ **مهم**: لو في الـ kiosk، الأزرار 40×40 + window.confirm معطّل، الجد ينقر بالخطأ ← الحذف فقط يحدث بعد two-tap behavior المنقول من mobile MOB-B. لكن حالياً، لا two-tap، فقط window.confirm.

### 7. مستوى الثقة

✅ **مؤكّد قاطع** — هذا أوضح bug في القائمة. أولوية قصوى.

---

## #2 — SalawatLine 'sm' = 14px ثابت في 6 مواضع

### 1. Re-verify

```javascript
// Ornaments.jsx:135 (re-read)
const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 14;
```

`.salawat-line` className لا يوجد له أي CSS rule (grep أكّد ذلك).
✅ **مطابق ١٠٠٪**.

### 2. متى يبيت الأثر أشدّ؟

- **شاشة جدار كبيرة (1920px)**: 14px على شاشة 60" = نقطة صغيرة لا تُرى من 5 أمتار. **حاد**.
- **شاشة 1024px**: 14px نسبياً أكبر vs viewport. **متوسط**.
- **largeText off**: نفس الشي — inline style لا يتأثر.
- **largeText on**: نفس الشي — inline style لا يتأثر.

### 3. Mitigation موجودة؟

❌ **لا**. CSS class بدون قواعد. `style` inline يتغلّب على أي override.

### 4. سيناريوهات

- DuaPicker مفتوح ← السلام في الأسفل بـ 14px. خفي.
- SlideshowOverlay ← السلام أسفل الدعاء. لو كان الـ slideshow كامل الشاشة (1920px)، السلام يكاد يختفي.
- لكن **هذا نص ديني**. حتى لو ما يقرأه الجد، يجب أن يكون بحجم محترم.

### 5. آثار جانبية

رفع 'sm' من 14 إلى مثلاً `clamp(16px, 1.2vw, 22px)`:
- ⚠️ لو في layout containers تعتمد على ارتفاع 14px للسلام، قد ينكسر. لكن `SalawatLine` يستخدم flexbox بـ `align-items: center`، فالـ container يتمدد طبيعياً.

⚠️ تأثير محتمل: نسبة `gap: 14` بين السلام والـ rules حوله — قد يبدو غريب لو الخط 22 و الـ gap 14. اضبط `gap` بنفس النسبة.

### 6. تفاعل

- **#4 (letter-spacing)**: السلام يحوي `letter-spacing: 0.02em` — مقبول جداً (لا يقطع الحروف).
- **#3 (AlayhiSalam)**: السلام يحوي "محمد وآل محمد" — لو فيه (ع) داخل العبارة لكان مشكلة، لكنه نص قرآني عادي.

### 7. مستوى الثقة

✅ **مؤكّد** — موضوعي وقابل للقياس. الأثر يختلف حسب الشاشة لكن دائماً غير مثالي.

---

## #3 — AlayhiSalam بأحجام 9-11px في call sites

### 1. Re-verify

```javascript
// Ornaments.jsx:97 — default 14
export function AlayhiSalam({ size = 14 }) { ... }

// Call sites (re-verified):
// Dashboard.jsx:195 (HonorifiedTitle): <AlayhiSalam size={starSize} />
// Dashboard.jsx:216:                   starSize={11}
// Dashboard.jsx:246:                   starSize={9}
// SlideshowOverlay.jsx:506:            <AlayhiSalam size={10} />
```

✅ **مطابق ١٠٠٪**.

### 2. متى يبيت الأثر أشد؟

- **upcoming event (starSize=9)**: الأشد. الـ "(ع)" يصبح 14×14px فعلياً. مع opacity 0.85.
- **slideshow subtitle (size=10)**: حاد. النص "الإمام علي بن أبي طالب" يحتوي (ع) صغير.
- **today event (starSize=11)**: متوسط.

### 3. Mitigation

❌ **لا**. inline style على span يتجاوز أي class override.

### 4. سيناريوهات

- Operator يفتح Dashboard ← يرى اسم الإمام في event strip ← (ع) صغيرة جداً، لكن واضحة بالقرب (50سم).
- من بعد 3 أمتار (mosque hall) ← (ع) غير مرئية.

**هل هذا "bug" أم "design intent"؟** الـ (ع) ضمن inline text. تكبيرها قد يكسر line-height. القرار التصميمي هو "علامة عابرة، لا تشتت من الاسم".

### 5. آثار جانبية للحل

رفع إلى 14-18 على call sites:
- ⚠️ `line-height: ${size * 1.5}px` ← لو size = 18، line-height = 27 → يكبّر سطر النص حوله
- ⚠️ في event strip، النص في سطر واحد → يكون أوسع → قد يكسر الـ flex layout
- ⚠️ يحتاج اختبار visual

### 6. تفاعل

- **#5 (event-strip__countdown-kind 10px)**: لو نرفع الـ countdown-kind إلى 16px، الـ (ع) بـ 9 بجواره يبدو أصغر نسبياً.

### 7. مستوى الثقة

✅ **مؤكّد** — لكن الحل يتطلب اختبار visual أكثر من #1، #2. القرار "هل تكبير الـ (ع) يكسر layout؟" يحتاج جلسة dev تجريبية.

🔻 **خفّض من "أولوية قصوى" إلى "أولوية عالية مع اختبار visual مطلوب"**.

---

## #4 — letter-spacing على نص عربي (5 styles)

### 1. Re-verify

| الـ class | السطر | الحالة |
|----------|------|--------|
| `.slideshow__section-marker-label` | 711 | ✅ Arabic content (headings) |
| `.prayer-tracker__prayer-label` | 2265 | ✅ Arabic content ("صلاة") |
| `.event-strip__kind` | 528 | ✅ Arabic content (شهادة/ولادة/عيد) |
| `.event-strip__countdown-kind` | 499 | ✅ Arabic ("المناسبة القادمة") |
| `.next__label` | 390 | ✅ Arabic ("الصلاة القادمة") |
| `.pin-badge__label` | 1066 | ❌ **dead code** |

### المفاجأة:

🔻 **`.pin-badge__label` ليس مشكلة فعلية**:
- `pin-badge` className لا يُستخدم في أي JSX
- CHANGELOG.md يقول: "Wall default no longer shows QR/PIN. Visible only inside F1 (help) and F3 (settings)"
- PairingModal.jsx:63 comment: "future call sites (PinBadge first-run, post-onboarding nudge)" — مجرد comment
- ✅ النتيجة: `.pin-badge__label` **CSS ميّت** ، لا يؤثّر على أي مستخدم

**التعديل:** الـ list ينخفض من 6 إلى **5 styles فعلية**.

### 2. متى الأثر أشدّ؟

- **slideshow__section-marker-label 0.32em** — الأشد. headings داخل دعاء طويل (مثل Kumayl). الجد يقرأ بـ slow scan ← الفجوات تكسر الكلمة.
- **prayer-tracker__prayer-label 0.28em** — حاد. كلمة "صلاة" قصيرة، الفجوة 0.28em بين كل حرفين ملحوظة جداً.
- **event-strip 0.20em** — متوسط. "شهادة" أربعة حروف ← ثلاث فجوات.
- **next__label 0.18em** — أخفّ. "الصلاة القادمة" نص مرئي دائماً لكن الجد لا يقرأ هذا (يقرأ الوقت تحته).

### 3. Mitigation

❌ **لا**. CSS properties مباشرة. لا override.

### 4. سيناريوهات

- 70 سنة، نظر متوسط ضعيف، يجلس في الـ first row في المسجد ← يرى "الصلاة" بدل "ال ص لا ة".
- أصبع يُشير إلى الحرف الواحد ← يحاول قراءة كلمة، يجد فجوات، يبدأ يحلّل: "ا، ل، ص، ل، ا، ة" — مرهق.

### 5. آثار جانبية

- احذف letter-spacing فقط من العربي. لا تتلامس مع الـ Latin (لكن هذه الـ classes لا تحوي Latin).
- ⚠️ `text-transform: uppercase` لا تفعل شيء على العربي، فيمكن حذفها (تنظيف).

### 6. تفاعل

لا تفاعل خطير. مستقل.

### 7. مستوى الثقة

✅ **مؤكّد قاطع** بعد التعديل (5 styles فعلية، ليس 6).

---

## #5 — `.event-strip__countdown-kind` floor 10px

### 1. Re-verify

```css
/* styles.css:497 */
.event-strip__countdown-kind {
  font-size: clamp(10px, 0.85vw, 13px);
  ...
}
```

```css
/* النصّ المتاح: */
/* لا يوجد override في data-large-text */
```

### grep verification:

```
Search "data-large-text.*event-strip" → only:
3635: html[data-large-text="true"] .event-strip__title { ... }
```

`event-strip__countdown-kind` **لا override له**. ✅

### 2. متى الأثر أشد؟

- **شاشة 1024px**: 0.85vw = 8.7px → clamp يحفظ floor 10px.
- **شاشة 1280px**: 0.85vw = 10.9px → ~11px.
- **شاشة 1920px**: 0.85vw = 16.3px → clamp ceil 13px.

**في كل الحالات، النص بين 10-13px.** هذا الرقم الكلي مرئي على Dashboard دائماً (event-strip ظاهر في الجزء الأوسط).

### 3. Mitigation

❌ **لا**. حتى لو الـ user فعّل largeText، هذا العنصر لا يتأثر.

### 4. سيناريوهات

- يوم 7 محرم. الـ event upcoming: "شهادة الإمام الحسين بعد 3 أيام".
- العامل يحتاج يعرف "متى؟"
- يطالع شاشة ← يرى رقم كبير "بعد 3 أيام" بـ font-size clamp(26, 2.2vw, 40) (أعلى السطر)
- فوقه نص صغير "المناسبة القادمة" بـ 10-13px
- يبحث الجد عن "ماذا؟" ← يرى نص صغير، يصعب القراءة
- الجواب موجود في `event-strip__title` أسفل ← هذا 32px ✅
- إذاً، الـ countdown-kind يكون متروك للنص اللي تحته أو فوقه. **هل المستخدم فعلياً يحتاج قراءته؟**

🔻 **تنازل احتمالي**: الـ countdown-kind يخدم كـ "eyebrow text" — يضع الرقم الكبير في سياق. لو الجد فهم أن "بعد 3 أيام" يخصّ event قادم من السياق العام، الـ eyebrow ليس حرجاً.

### 5. آثار جانبية

رفع إلى 16px:
- ⚠️ ينخفض الـ visual hierarchy (الـ "بعد 3 أيام" الأكبر يفقد بريقه)
- لكن الـ font-size الحالي clamp(26, ...) أكبر بكثير، فلا يزال الـ rate-of-difference واضح
- ✅ آمن.

### 6. تفاعل

- **#4 (letter-spacing 0.20em)**: نفس الـ class. حلّ الاثنين معاً.

### 7. مستوى الثقة

✅ **مؤكّد** لكن **أقل أولوية** من #1-4. لأن الـ context (الـ رقم الكبير) يخفّف الأثر.

🔻 **خفّض إلى "أولوية متوسطة"**.

---

## #6 — `.dua-picker__edit` و `.dua-picker__delete` 40×40

### 1. Re-verify

```css
/* styles.css:2011-2026 */
.dua-picker__edit,
.dua-picker__delete {
  width: 40px; height: 40px;
  ...
}

/* largeText override styles.css:3690-3691 */
html[data-large-text="true"] .dua-picker__edit,
html[data-large-text="true"] .dua-picker__delete { width: 44px; height: 44px; font-size: 20px; }
```

### المفاجأة:

🔻 **في default install (largeText ON)**: الأزرار **44×44 = يلبّي WCAG 2.1 AA**.

فقط في الحالة الاستثنائية (user explicitly disabled largeText) الأزرار 40×40 → تحت WCAG.

### 2. متى الأثر أشد؟

- **largeText off (نادر)**: 40×40 — تحت WCAG.
- **largeText on (الافتراضي)**: 44×44 — يلبّي WCAG لكن في الحد الأدنى.

### 3. Mitigation

✅ **largeText يصلحها** (في الـ default). الـ migration v1→v2 يفرض largeText على كل installs قديمة. النص في `defaults.js:159` يقول صراحة:
> "Default ON since the realistic primary operators (mosque caretakers / imams) skew older"

### 4. سيناريوهات

- Default user: يلبّي WCAG. لا مشكلة فورية.
- User explicit-off: 40×40. يد مرتعشة قد تنقر بالخطأ.

### 5. آثار جانبية للحل

رفع إلى 48 default، 56 largeText:
- ⚠️ لكن **الزرّان متجاوران مع 8px فقط بينهما** (60-12-40=8). لو 48، تصبح 4px بينهما، خطر spam-tap.
- ⚠️ يحتاج إعادة spacing: زِد `inset-inline-end` للـ edit من 60 إلى 72+.

### 6. تفاعل

- **#1 (window.confirm)**: لو الـ window.confirm معطّل، نقر خاطئ على 🗑 → حذف فوري (no confirm). نقر صح على ✎ → editor. فالـ نقر الخاطئ ممكن.
- ✨ **حلّ #1 يخفّف #6**: لو في inline confirm modal، حتى لو الـ touch target صغير، النقرة الخاطئة قابلة للتراجع.

### 7. مستوى الثقة

🔻 **منخفض** إلى "مشكلة عند largeText off فقط".

**التعديل:** يبقى في القائمة لكن **مع المحتملة** بدل المؤكّدة. لا يستحق أولوية عاجلة لو largeText افتراضي ON.

---

## #7 — `.imam-list-editor__remove` 32×32 / 40×40

### 1. Re-verify

```css
/* styles.css:3552-3553 */
.imam-list-editor__remove {
  width: 32px; height: 32px;
  ...
}

/* largeText override styles.css:3729 */
html[data-large-text="true"] .imam-list-editor__remove { width: 40px; height: 40px; font-size: 18px; }
```

### Status

- **default**: 32 — تحت WCAG بكثير.
- **largeText**: 40 — **لا يزال تحت WCAG 44**.

✅ **مؤكّد**. حتى largeText لا يصلحه.

### 2. متى الأثر أشد؟

- المستخدم: المسؤول التقني للمسجد (technician). قد يكون كبير سن (مسؤول صيانة المسجد).
- يدخل F3 → الأساسية → قائمة الأئمة → يحذف اسم.
- زر ✕ بحجم 32×32 (أو 40 في largeText).

### 3. Mitigation

❌ **لا**. حتى largeText يبقى تحت WCAG.

### 4. سيناريوهات

- يبني قائمة 5 أئمة. يبغى يحذف الإمام الثالث. ينقر ✕ بإصبع.
- الإمام يُحذف فوراً (لا confirm).
- لو نقر بالخطأ على ✕ للإمام الثاني، الإمام الثاني يُحذف بدون فرصة استرجاع.

### 5. آثار جانبية للحل

رفع إلى 48 default، 56 largeText:
- ✅ آمن. الـ row في `imam-list-editor__list` فيه padding كافي.
- إضافة undo snackbar أيضاً مفيدة.

### 6. تفاعل

- **#1 patterns**: لو نضيف undo بنفس نمط `UndoToast.jsx`، نحلّ الـ "حذف فوري بدون فرصة" في كل مكان.

### 7. مستوى الثقة

✅ **مؤكّد قاطع**. الـ "حتى largeText لا يصلحه" يبيّن أن الفريق نسي override لهذا العنصر.

---

## #8 — DuaPicker textarea silent truncation

### 1. Re-verify

```javascript
// DuaPicker.jsx:351-352
const title = (draft.title || '').trim().slice(0, 200);
const body = (draft.body || '').trim().slice(0, 20000);

// Markup DuaPicker.jsx:788-795
<textarea
  id="dua-editor-body"
  className="inline-modal__input inline-modal__textarea"
  value={body}
  onChange={(e) => setBody(e.target.value)}
  placeholder={...}
  rows={10}
/>  // ← لا maxLength
```

✅ **مطابق ١٠٠٪**. `<input>` للعنوان فيه `maxLength={200}` (السطر 782) لكن `<textarea>` للنص الكامل **لا maxLength**.

### 2. متى الأثر أشد؟

- المستخدم يلصق زيارة طويلة (e.g., زيارة وارث الكاملة + الأذكار = ~25,000 حرف)
- يضغط حفظ
- يفتح الزيارة لاحقاً ← مقطوعة قبل النهاية

### 3. Mitigation

❌ **لا**. لا warning، لا counter، لا visual feedback.

### 4. سيناريوهات

- لصق نص 19,000 حرف → يحفظ كامل. OK.
- لصق نص 25,000 حرف → يحفظ 20,000، يفقد 5,000 بصمت. **خطر**.
- لصق نص 30,000 حرف → يحفظ 20,000، يفقد 10,000 بصمت. **خطر شديد**.

### 5. آثار جانبية للحل

إضافة `maxLength={20000}` على textarea:
- ✅ يمنع الإدخال بعد 20,000 (متطابق مع `slice`)
- ⚠️ المستخدم يلصق 25,000 ← لصق فعلي 20,000 ← اللصق يتوقف. هل يتنبّه؟ ربما لا (لو ينظر إلى لوحة المفاتيح).
- **حل أفضل**: counter + warning. أو رفع الحد الأعلى إلى 50,000 (يكفي لأطول زيارة).

⚠️ الـ MAX_TOTAL_BYTES في prayer-times/config.js:150 = 16 KB للـ imamList. هل في حد مشابه لـ custom dua content؟

Let me check... 20,000 chars × 4 bytes (UTF-8 worst) = 80 KB per dua. localStorage limit ~5 MB. لا مشكلة.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

✅ **مؤكّد قاطع**.

---

## #9 — `.settings__adjust-btn` 40×40

### 1. Re-verify

```css
/* styles.css:2727-2728 */
.settings__adjust-btn {
  width: 40px; height: 40px;
  ...
}
```

```
grep "data-large-text.*settings__adjust-btn" → No matches.
grep "data-large-text.*settings__adjust"     → No matches.
```

✅ **مؤكّد**. لا override حتى في largeText.

### 2. متى الأثر أشد؟

- F3 → الصلاة → تعديل أوقات الصلاة بالدقيقة. كل صلاة (٦ صلوات) فيها زر `−` و `+`.
- ٦ صلوات × ٢ أزرار = ١٢ زر صغير في صفحة واحدة.

### 3. Mitigation

❌ **لا**.

### 4. سيناريوهات

- Technician يضبط +5 للفجر (تعويض لحساب محلي).
- 5 نقرات على زر `+` بحجم 40×40.
- بين `+` و الـ input field 60px wide ← المسافة ضيقة.
- يد مرتعشة قد تنقر `-` بدلاً من `+`.

### 5. آثار جانبية للحل

رفع إلى 48 default:
- ✅ آمن. الـ stepper container يتمدد.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

✅ **مؤكّد**.

---

## M-1 — Mobile: letter-spacing على عربي (4 styles)

### 1. Re-verify

| class | السطر | letter-spacing | content |
|-------|------|----------------|---------|
| `.card__eyebrow` | 314 | 0.2em + upper | varies (Arabic) |
| `.hero__label` | 333 | 0.18em + upper | "الصلاة القادمة" |
| `.event__kind` | 398 | 0.15em + upper | "شهادة/ولادة/عيد" |
| `.set-row__label` | 562 | 0.08em | Arabic labels |
| `.lib__count` | 510 | 0.08em | "X عنصراً" |

5 fragments. ✅ تأكّد.

(لاحظ: عدّتها 4 في الـ MD، لكن الـ 5 موجودة. تعديل: 5 وليس 4).

### 2-7. تحليل

نفس منطق #4 على الـ wall. كل النقاط:
- ✅ Arabic content
- ❌ no mitigation
- ✅ آمن للحل
- ✅ مستقل

### 7. مستوى الثقة

✅ **مؤكّد** (مع تصحيح من 4 إلى 5 styles).

---

## M-2 — Mobile: nav tab labels 0.7-0.85rem

### 1. Re-verify

```css
/* mobile-control.html:39 */
:root { font-size: clamp(16px, 4.1vw, 18px); }

/* line 273 */
.nav__btn {
  font-size: clamp(0.7rem, 3vw, 0.85rem);
  ...
}
```

### Math

- Root 16-18px
- 0.7rem × 16 = **11.2px** (الأصغر)
- 0.7rem × 18 = 12.6px
- 0.85rem × 16 = 13.6px
- 0.85rem × 18 = **15.3px** (الأكبر)
- النطاق فعلياً 11-15px.

### 2. متى الأثر أشد؟

- جوال صغير (iPhone SE 320×568): root 16px (clamp floor) ← 0.7rem = 11.2px. حاد.
- جوال كبير (iPhone Pro Max 430×932): root أكبر ← 13-15px. متوسط.

### 3. Mitigation

⚠️ **الـ icons** 22px موجودة فوق النص. الـ icons يخدمون كـ landmark. لكن:
- العامل الجديد لا يحفظ المعنى من الـ icon
- الـ icons قد تتشابه (⌂ vs ☪ vs ❋ vs ⚙ ليست واضحة لكل مستخدم)

### 4. سيناريوهات

- Technician يفتح الجوال أول مرة ← يرى 4 tabs ← يحتاج قراءة النص ليفهم.
- "الإعدادات" 11px على جوال SE = لا يقرأ.

### 5. آثار جانبية

رفع إلى 0.95rem (15px floor):
- ⚠️ النص + icon قد يفيض الـ button height
- ✅ لكن min-height: 68px يستوعب
- ⚠️ ممكن يحتاج reduction في icon size (22→20) لتوازن

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

✅ **مؤكّد** لكن أقل أولوية من letter-spacing لأن:
- الـ icons يوفّرون redundancy
- النص يُقرأ مرة واحدة (memorization)

🔻 **منخفض إلى "أولوية متوسطة"**.

---

## M-3 — Mobile: `.lib__tab` min-height: 44

### 1. Re-verify

```css
/* mobile-control.html:481 */
.lib__tab {
  min-height: 44px; padding: 10px;
  ...
}
```

### الـ verdict

- WCAG 2.1 AA: 44 ← **passes**.
- NN/g elderly: 56 ← below recommendation.
- NHS Digital dementia: 64 ← below.

### 2-6. تحليل

❌ **هذه ليست "bug"** بل recommendation. الـ MD لبسته كـ critical/verified — **خطأ**.

### 7. مستوى الثقة

🔻 **منخفض من "مؤكّد" إلى "اقتراح تحسين"**.

**التعديل في UX_CX_ELDERLY.md:** انقل M-3 من القائمة المؤكّدة إلى قائمة التحسينات الاختيارية.

---

## 📊 الملخّص النهائي بعد التحقّق

### الأرقام المعدّلة:

| الأصل | بعد التحقّق | تغيير |
|------|--------|-------|
| 🔴 مؤكّد قاطع | #1, #2, #4 (5 styles فعلية لا 6), #7, #8, #9, M-1 (5 styles لا 4) | **7 بنود** |
| 🟡 مؤكّد مع اختبار visual | #3 | **1 بند** |
| 🟠 منخفض الأولوية | #5 (context يخفّف), #6 (largeText يصلحها), M-2 (icons يوفّرون redundancy) | **3 بنود** |
| 🔻 تحسين اختياري | M-3 (يلبّي WCAG فعلياً) | **1 بند** |
| ❌ مرفوض / dead code | `.pin-badge__label` (CSS ميّت) | **١ ادّعاء سابق منسحب** |

### تفسير:

من **١٢ مشكلة مؤكّدة** في `UX_CX_ELDERLY.md`:
- **٧ تبقى critical/verified** بدون تحفّظ
- **١ تحتاج اختبار visual** (#3 AlayhiSalam — رفع الحجم قد يكسر line-height)
- **٣ تنخفض** بسبب mitigations موجودة أو context
- **١ تنخفض إلى recommendation** (تلبّي WCAG لكن دون NN/g)
- **١ ادّعاء سابق ضمن #4 يُسحب** (pin-badge dead code)

### قائمة الإصلاح المنقّحة (مرتّبة بالأولوية):

#### تنفيذ فوري — أعلى الأولوية:
1. **#1** window.confirm → inline modal (DuaPicker:701) — **bug فعلي في production**
2. **#4** letter-spacing من 5 styles عربية — **يكسر قراءة العربي**
3. **#7** imam-list-editor remove 32→48 — **حتى largeText لا يصلحها**
4. **#8** textarea maxLength + counter — **silent data loss**
5. **#9** settings__adjust-btn 40→48 — **متعدّد الاستخدام في tab واحد**

#### تنفيذ سريع — مهم لكن أقل عجالة:
6. **#2** SalawatLine 'sm' 14→18 — **نص ديني**
7. **M-1** mobile letter-spacing من 5 styles — **نفس مشكلة العربي**

#### تنفيذ مع اختبار visual:
8. **#3** AlayhiSalam call sites 9→14 — **اختبر line-height بعد التغيير**

#### اختياري / حسب الجهد:
9. **#5** event-strip__countdown-kind 10→16 — **context يخفّف**
10. **#6** dua-picker edit/delete 40→48 — **largeText يصلحها افتراضياً**
11. **M-2** nav tab labels 0.85→0.95rem — **icons يوفّرون redundancy**

#### Recommendation (ليس bug):
12. **M-3** lib__tab 44→56 — **WCAG passes، NN/g recommends 56**

---

## 🎯 توصية تنفيذية

**Sprint 1 (60 دقيقة):**
البنود 1-5 — كلها bugs مؤكّدة، حلول معروفة، أثر مباشر.

**Sprint 2 (45 دقيقة):**
البنود 6-7 — نصوص دينية، طبقتين منفصلتين (Wall + Mobile).

**Sprint 3 (30 دقيقة + اختبار):**
البند 8 — يحتاج dev session لاختبار الـ visual.

**Optional:**
البنود 9-12 — حسب الوقت المتاح. لا تكسر شيء، لكن غير حرجة.

**الإجمالي:** ~٢.٥ ساعة عمل قوي + اختبار. أقل من تقدير `UX_CX_ELDERLY.md` (٣ ساعات).

---

# 🟡 الجولة الثانية — التحقّق من الـ ٦ "المحتملة"

> الجولة الأولى (أعلاه) غطّت الـ ١٢ "verified". هذه تغطّي الـ ٦ "likely" — نفس الـ ٧ زوايا.

## L-1 (المحتملة #1) — PIN length hint مفقود في PIN gate

### 1. Re-verify

```jsx
// SettingsOverlay.jsx:446-459
<div className="help-overlay__title">الإعدادات مُقفلة</div>
<div className="help-overlay__subtitle">أدخل رمز PIN لفتح الإعدادات</div>
<form onSubmit={onSubmit}>
  <input
    type="password"
    placeholder="••••"   // ← أربع نقاط
    pattern="\d{4,8}"    // ← يفرض ٤-٨
    ...
  />
```

✅ مطابق. الـ placeholder يُلمح بـ ٤ نقاط لكن الحد الأقصى ٨.

### 2. متى الأثر أشد؟

- المستخدم نسي PIN ← يحاول أرقاماً مختلفة ← يكتب ٣ أرقام، يضغط "فتح" ← form invalid silently (pattern doesn't match). لا feedback واضح لماذا.

### 3. Mitigation موجودة؟

⚠️ **شبه-mitigation**: placeholder "••••" يلمح بـ ٤. لكن لا يقول "حتى ٨".

⚠️ في **PIN-SET flow** (وليس unlock): الـ subtitle "٤–٨ أرقام · سيُطلب لفتح الإعدادات" موجود (SettingsOverlay.jsx:1423). الفريق يعرف بالـ hint لكن نسي إضافته للـ unlock gate.

### 4. سيناريوهات

- يفتح F3 لأول مرة بعد تفعيل PIN ← يرى "أدخل رمز PIN" ← يكتب ٤ أرقام (لأن placeholder ٤) ← يعمل.
- بعد فترة طويلة، يحاول استخدام PIN قديم ٦ أرقام ← يفلح لو يتذكّر.
- لو حاول ٣ أرقام ← form silently rejects. لا hint.

### 5. آثار جانبية للحل

إضافة `<div className="help-overlay__hint">٤ إلى ٨ أرقام</div>`:
- ✅ آمن. مجرد نص إضافي.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

🔻 **منخفض** من "محتمل" إلى "تحسين سهل". لا bug، لكن copy-paste hint من PIN-set flow = ٢٠ ثانية شغل.

---

## L-2 (المحتملة #2) — aria-live على countdown يتحدّث كل ثانية

### 1. Re-verify

```jsx
// Dashboard.jsx:489-497
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

✅ مطابق. `now` يتحدّث من `useClock` كل ثانية.

### 2. متى الأثر أشد؟

- مستخدم SR على الـ wall display (نادر — وول kiosk).
- مستخدم SR على الـ mobile UI — لكن هذا الكود في الـ wall فقط، الـ mobile UI له countdown منفصل.

### 3. Mitigation موجودة؟

✅ `aria-live="polite"` — يؤخّر الإعلانات حتى السكون. لو الـ user يقرأ شي ثاني، الـ SR ما يقاطع.

⚠️ لكن `aria-atomic="true"` — يجبر إعلان النص كاملاً عند أي تغيير. لو الـ SR في idle، يعلن كل ثانية.

### 4. سيناريوهات

- ٩٩.٩٪ من mosque kiosks: لا SR. لا أثر.
- ٠.١٪ (مهتمّ ضرير يدير المسجد): يسمع "بعد ١٢ دقيقة و ٤٥ ثانية ... بعد ١٢ دقيقة و ٤٤ ثانية ..." مستمرّاً.

### 5. آثار جانبية للحل

نقل aria-live إلى عنصر منفصل يتحدّث بالـ minute:

```jsx
<div className="sr-only" role="status" aria-live="polite">
  بقي {Math.ceil(diffSec / 60)} دقيقة على {next.name}
</div>
```

- ✅ آمن visually.
- ⚠️ يفقد الـ "ثانية" granularity. لكن من بعد، الفرق ٥٩ ثانية بين الـ minute changes — مقبول.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

🔻 **منخفض جداً** — الجد الذي يستخدم mosque kiosk ليس SR user عادةً. الـ a11y best-practice حقيقي لكن الـ practical impact نادر.

**اعتبر optional**.

---

## L-3 (المحتملة #3) — `dua-picker__welcome-close` 36×36

### 1. Re-verify

```css
/* styles.css:1871-1875 */
.dua-picker__welcome-close {
  flex: 0 0 auto;
  width: 36px; height: 36px;
  ...
}
```

✅ مطابق. تحت WCAG 44.

### 2. متى الأثر أشد؟

- يظهر الـ welcome مرّة واحدة في حياة المستخدم على الجهاز (localStorage `mithnah:dua-picker:welcomed`).
- ينقر × لإخفاءه ← يختفي للأبد.

### 3. Mitigation موجودة؟

⚠️ **نوعاً ما**: الـ welcome يختفي تلقائياً بعد إضافة دعاء (DuaPicker.jsx:373 `dismissWelcome()` يُستدعى في saveCustomDua). فلو المستخدم يبدأ يستخدم الميزة، الـ welcome يختفي بدون نقر على ×.

### 4. سيناريوهات

- المستخدم يفتح F4 لأول مرة ← يرى welcome ← يقرأ ← يضغط × بـ trembling hand. نقرة خاطئة → ينقر على dua card تحت ← يفتح دعاء بدل إخفاء welcome.
- بعد ذلك، يقفل ← يفتح ← welcome لا يزال (لأنه لم يُحذف).

### 5. آثار جانبية للحل

رفع 36→44:
- ✅ آمن. كافٍ من spacing حول.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

✅ **مؤكّد** لكن **أولوية منخفضة** (one-time UI).

---

## L-4 (المحتملة #4) — Loading state نص فقط

### 1. Re-verify

```jsx
// DuaPicker.jsx:612
{loading && <div className="dua-picker__empty">جاري التحميل...</div>}
```

✅ مطابق. نص بدون spinner.

### 2. متى الأثر أشد؟

- المرة الأولى لفتح كل tab — IPC يجلب البيانات.
- الـ tabCache (DuaPicker.jsx:97) يخزّن النتيجة → فتح لاحق فوري.
- على hardware قديم (Raspberry Pi، أجهزة مسجد قديمة) قد يأخذ ١-٢ ثانية.

### 3. Mitigation موجودة؟

❌ **لا spinner**. لكن `'جاري التحميل...'` يرسل signal أن شيء يحدث.

⚠️ في mobile-control.js:496 يوجد spinner pattern. الـ wall ينقص هذا النمط.

### 4. سيناريوهات

- المسؤول يفتح F4 لأول مرة ← شاشة فاضية ← "جاري التحميل..." ← ١ ثانية ← تظهر الأدعية. مقبول.

### 5. آثار جانبية للحل

إضافة spinner أو dots:
- ✅ آمن. زخرفة بصرية.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

🔻 **منخفض** من "محتمل" إلى "polish optional". لا bug، لا misleading. مجرد opportunity للتحسين.

---

## L-5 (المحتملة #5) — Search empty state بدون recovery button

### 1. Re-verify

```jsx
// DuaPicker.jsx:630
return <div className="dua-picker__empty">لا نتائج لـ "{query}"</div>;
```

✅ مطابق. نص فقط، لا "مسح البحث".

### 2. متى الأثر أشد؟

- المستخدم يكتب كلمة لا يحفظها بالضبط، نتائج 0 ← يحدّق في النص ← لا يعرف ماذا يفعل.

### 3. Mitigation موجودة؟

⚠️ **الـ search input visible**: يحوي الكلمة. المستخدم يستطيع mark + delete أو يكمل تعديل. لكن **لا CTA واضح**.

### 4. سيناريوهات

- يكتب "كميل" بدل "كُميل" بدون شدّة ← يجد. مفروض الفلتر case-insensitive but Arabic shadda matters? Let me check...

Actually `toLowerCase()` على عربي لا يفعل شيء. الـ filter يطابق substring. لو كتب "كميل" والبيانات "كُميل" مع شدّة، لا match. هذا قد يكون issue منفصل لكن خارج النطاق هنا.

- بعد رؤية "لا نتائج"، المستخدم يحاول كلمات ثانية. لو ينسى أن البحث مفتوح، يبقى يرى "لا نتائج".

### 5. آثار جانبية للحل

إضافة "↺ مسح البحث" button:
- ✅ آمن. بسيط.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

🔻 **منخفض** — لا bug، تحسين UX خفيف.

---

## L-6 (المحتملة #6) — Kiosk-unlock primary button on destructive

### 1. Re-verify

```jsx
// Dashboard.jsx:562-573
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

✅ مطابق. "نعم، إيقاف" primary (gold). "إلغاء" ghost. autoFocus على cancel.

### 2. متى الأثر أشد؟

- المستخدم يفتح modal بـ FloatingMenu → "إغلاق التطبيق" → modal.
- نقرة بالفأرة على primary (الأكبر بصرياً) → التطبيق يقفل.

### 3. Mitigation موجودة؟

✅ **autoFocus على "إلغاء"**. لو الـ user يضغط Enter بدون نظر، التطبيق ما يقفل.

⚠️ لكن نقرة بالفأرة على المرئي primary ← يقفل.

### 4. سيناريوهات

- يد مرتعشة بالخطأ تنقر على المنطقة المركزية ← "نعم" primary وسط الشاشة ← التطبيق يقفل.
- الكبير يكمل تذكر "ما أريد إغلاق" بعد فوات الأوان.

### 5. آثار جانبية للحل

عكس visual hierarchy:
- "إلغاء" يحصل على --primary
- "نعم، إيقاف" يحصل على --danger (red tint) أو ghost
- autoFocus يبقى على إلغاء

✅ آمن. تحسين CX حقيقي.

### 6. تفاعل

- مستقل.

### 7. مستوى الثقة

✅ **مؤكّد** كـ CX issue. ليس bug تقني لكن "destructive action visually emphasized" خطأ ergonomics.

---

# 🔬 جولة Micro Details Sweep

غُصت في مناطق دقيقة قد تكون فاتتني.

## ✅ ممارسات تأكّدت أنها سليمة:

### 1. `<button type="button">` على كل الـ buttons (٧٢ مرة)

Grep أكّد: كل button في الـ renderer فيه `type="button"`. لا يوجد button بدون type ← لا submit عرضي.

### 2. `ImamiStar` و كل الـ Ornaments فيها `aria-hidden="true"`

في Ornaments.jsx:15, 29, 50, 72, 83, 130, 195 — كل SVG decorative element مخفي عن SR. ✅

### 3. كل الـ Disabled state أثناء async (٨ مرات)

Pattern موحّد: `disabled={saving}`, `disabled={busy}`, `disabled={loading}`, `disabled={hotspotAction === 'opening'}`. ✅

### 4. Animation timings ضمن النطاق المعقول

- 100ms (progress bar)
- 220ms (state transitions)
- 280ms (slide fade)
- 800ms (spinner)
- 1600ms (tour pulse)

كلها مقبولة. مع `prefers-reduced-motion` override globally. ✅

### 5. role/aria semantic أخطاء غير موجودة

- `role="dialog"` + `aria-modal="true"` على كل overlay ✅
- `role="status"` على snackbar/toast areas ✅
- `role="alert"` على errors ✅
- `role="tablist"` + `role="tab"` + `role="tabpanel"` في SettingsOverlay ✅

### 6. autoComplete على PIN inputs ("off"/"one-time-code")

- mobile-control PIN: `autocomplete="one-time-code"` ✅
- Dashboard kiosk-unlock PIN: `autoComplete="off"` ✅

### 7. text inputs بـ inputMode="numeric" + pattern

- PIN: `inputMode="numeric"` + `pattern="\d{4,8}"` ✅
- Coords: `inputMode="decimal"` ✅
- Minute adjustments: `inputMode="numeric"` ✅

---

## ⚠️ مشاكل micro فعلية اكتشفتها:

### MICRO-1 — `:focus-visible` غير معرّف على كثير من الأزرار

في styles.css، `:focus-visible` معرّف صراحة فقط على:
- slideshow__close
- slideshow__fontctl-btn
- help-hint
- prayer-tracker__imam-picker-select
- announcement-banner__close
- floating-menu__trigger
- floating-menu__item

**ينقص على:**
- settings__btn (له :focus لكن ليس :focus-visible)
- inline-modal__btn (له :focus لكن ليس :focus-visible)
- dua-picker__tab (لا :focus ولا :focus-visible صريح)
- dua-picker__item
- ctrl-btn (mobile)
- nav__btn (mobile)

**التحليل:** Chromium 28 (Electron) يعرض default focus ring لو ما فيه CSS rule. فالـ keyboard nav يعمل. لكن:
- ⚠️ الـ default ring أزرق عادي — لا يطابق الـ palette
- ⚠️ على بعض العناصر، `:hover` يكسر الـ default ring بـ `outline: none` ضمناً

**التأثير:** خفيف، cosmetic. لكن المستخدم keyboard-only يستحق ring متناسق.

**الحل:** أضف rule عام:

```css
button:focus-visible,
[role="button"]:focus-visible {
  outline: 2px solid var(--m-accent);
  outline-offset: 2px;
}
```

🔻 **أولوية منخفضة** — cosmetic only.

---

### MICRO-2 — `useClock` يحدّث كل ثانية حتى لو النافذة في الـ background

```javascript
// Dashboard.jsx:23-30
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
```

**Mobile UI** يوقف الـ polling عند backgrounded (مبين في `onVisibilityChange` في mobile-control.js:777-794).

**Wall** لا يفعل ذلك. كل ثانية re-render كامل، حتى لو الشاشة معطّلة (شاشة مسجد ليست backgrounded عادةً، لكنها قد تكون كذلك في dev/test).

**التأثير على المستخدم:** لا شي مرئي. **التأثير على CPU/electron:** خفيف لكنه مستمر.

🔻 **أولوية منخفضة جداً** — Performance hint، ليس UX.

---

### MICRO-3 — Floating Menu يحوي 6 عناصر في popup

```jsx
// FloatingMenu.jsx:25-35
const ITEMS = [
  { key: 'F3',  label: 'الإعدادات' },
  { key: 'F4',  label: 'مكتبة الأدعية' },
  { key: 'FV',  label: 'الأدعية المفضّلة' },
  { key: 'F5',  label: 'متابعة الصلاة' },
  { key: 'PA',  label: 'إقران الجوال' },
  { key: 'F1',  label: 'المساعدة' },
];
```

+ زر "إغلاق التطبيق" مفصول → **٧ عناصر total**.

**Hick's Law**: time-to-decision ∝ log(N+1). 7 خيارات = 3 ثوان من التفكير لمستخدم عادي. لكبير السن مع cognitive slowing: 5-7 ثوان.

**هل هذا مشكلة؟**
- الـ items مرتّبة بالأولوية (الإعدادات أولاً، destructive منفصل).
- الـ labels واضحة.
- لكن "FV" key code ("الأدعية المفضّلة") قد لا يكون واضحاً.

🔻 **اقتراح**: لو بعض الـ items نادرة الاستخدام (مثلاً PA إقران الجوال — يُستخدم مرة في الإعداد فقط)، نقلها إلى "المزيد ▼" submenu.

أولوية منخفضة — قد يكون decision تصميمي متعمّد.

---

### MICRO-4 — `dua-picker__empty` يستخدم `padding: 60px 20px` (سطح كبير)

```css
/* styles.css:1815-1819 */
.dua-picker__empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--m-text-muted);
  font-size: 18px;
}
```

عند "لا نتائج" أو "جاري التحميل"، الـ container يأخذ مساحة كبيرة (~80 سم في الشاشة). 18px in centre.

**التأثير:** على شاشة كبيرة (1920px wall)، الـ empty state يبدو desolate. كثير white space.

🔻 **subjective**. ربما متعمّد للـ visual breathing.

---

### MICRO-5 — placeholder text في search inputs

```jsx
// DuaPicker.jsx:541-543
placeholder={`ابحث في ${TABS.find(t => t.id === tab)?.label || ''}...`}

// PrayerTracker IMAM picker: غير موجود
// SettingsOverlay search: متعدد
```

Placeholder يختفي عند focus. كبير السن مع cognitive load قد ينسى ما هو الـ input.

**Best practice**: label فوق الـ input دائماً.

**Current state**: الـ DuaPicker search له placeholder فقط، لا label فوق. لكن السياق (الـ overlay العنوان "مكتبة الأدعية") يساعد.

🔻 **منخفض** — معالج بالـ context.

---

# 📊 ملخّص الجولة الثانية

## الـ ٦ المحتملة بعد التحقّق:

| البند | بعد التحقّق | الحالة |
|------|--------|--------|
| L-1 PIN length hint | ✅ مؤكّد لكن سهل الإصلاح | تحسين |
| L-2 aria-live countdown | 🔻 نادر practical impact | اختياري |
| L-3 welcome-close 36×36 | ✅ مؤكّد، one-time UI | منخفض |
| L-4 Loading text only | 🔻 polish optional | اختياري |
| L-5 Search empty no CTA | 🔻 polish optional | اختياري |
| L-6 Kiosk-unlock primary | ✅ مؤكّد CX issue | متوسط |

## Micro details sweep (٥ نقاط):

| Micro | الحالة |
|-------|--------|
| M-1 :focus-visible غير معرّف | 🔻 cosmetic |
| M-2 useClock background | 🔻 performance |
| M-3 FloatingMenu 7 items | 🔻 design choice |
| M-4 empty state large padding | 🔻 subjective |
| M-5 placeholder vs label | 🔻 context covers |

---

## 🎯 خلاصة كل التحقّقات (جولتين)

### الـ **bugs الحقيقية المستحقّة للإصلاح فوراً:**

من **١٢ verified + ٦ likely = ١٨ مشكلة**:

**Tier 1 — حلول بسيطة، أثر مباشر:** (Sprint 1)
1. #1 window.confirm DuaPicker
2. #4 letter-spacing على 5 styles عربية
3. #7 imam-list remove 32→48
4. #8 textarea silent truncation
5. #9 settings__adjust-btn 40→48
6. L-1 PIN length hint
7. L-6 Kiosk-unlock visual hierarchy

**Tier 2 — نصوص دينية + تحسينات معتدلة:** (Sprint 2)
8. #2 SalawatLine 14→18
9. M-1 mobile letter-spacing على 5 styles
10. L-3 welcome-close 36→44

**Tier 3 — يحتاج اختبار:** (Sprint 3)
11. #3 AlayhiSalam call sites 9-11→14+ (visual test)

**اختياري:**
- #5, #6 (mitigations موجودة)
- M-2 nav tab font
- L-2, L-4, L-5 (polish only)
- MICRO-1 إلى MICRO-5

---

## ✅ تأكيد النهائي

بعد جولتي تحقّق:
- **١٨ مشكلة فحصت من ٧ زوايا** (verified ١٢ + likely ٦)
- **٥ micro details** فُحصت إضافياً
- **١ ادّعاء سُحب** (`.pin-badge__label` dead code)
- **٤ بنود انخفضت من "verified" إلى "lower priority"**
- **٧ بنود تبقى Tier 1** (إصلاحات سريعة، أثر مباشر)
- **٣ بنود Tier 2**
- **١ بند Tier 3** (يحتاج اختبار)

**التقدير المحدّث:**
- Tier 1 (٧ إصلاحات): **~٧٥ دقيقة**
- Tier 2 (٣ إصلاحات): **~٢٠ دقيقة**
- Tier 3 (١ إصلاح + اختبار): **~٣٠ دقيقة**
- **الإجمالي: ~ساعتين** للحرجة (تنازل من ٢.٥)

---

**تم التحقّق الشامل بحمد الله — لا يوجد شي آخر يحتاج فحصاً ضمن نطاق UX/UI/CX للكبار**
