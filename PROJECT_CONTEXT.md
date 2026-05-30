# Mithnah Project Context

Generated: 2026-05-30

هذا الملف هو خريطة عملية للمشروع بعد فحص الشجرة المصدرية والإعدادات والاختبارات والوثائق وملفات الواجهة. الهدف منه أن يكون مرجعًا واحدًا لأي شخص يريد فهم المشروع أو إصلاحه أو إكماله بدون أن يبدأ من الصفر.

## الخلاصة السريعة

Mithnah تطبيق سطح مكتب للمساجد والحسينيات مبني على Electron + React + Vite. يركّز على عرض مواقيت الصلاة وفق إعدادات شيعية اثني عشرية، التاريخ الهجري، المناسبات، الأدعية والزيارات، وعرض شرائح كامل الشاشة، مع تحكم من الهاتف داخل الشبكة المحلية.

الحالة الحالية:

- التطبيق الأساسي منظم ومليء بوحدات واضحة: مواقيت، هجري، موقع، محتوى شيعي، شرائح، إعدادات، تحديثات، وتحكم عن بعد.
- الاختبارات الحالية نجحت: `125 passed`.
- توجد فجوات مهمة بين الوعود الموجودة في الوثائق وبين ما يتم تشغيله فعليًا.
- أعلى المخاطر الآن في: تحكم الهاتف، تفعيل سياسة الشبكة/CSP، تحقق PIN، وتشغيل المحتوى التلقائي.

## أوامر التشغيل

المتطلبات:

- Node.js: `>=20.10.0 <23`
- نظام الحزم: npm

الأوامر الأساسية:

```bash
npm install
npm run dev
npm test
npm run build
npm run dist:win
```

ملاحظات:

- `npm run dev` يشغّل Vite للواجهة وElectron للتطبيق.
- `npm test` يشغّل فقط ملفات `tests/**/*.test.js`.
- ملفات `src/main/__tests__/*.test.js` موجودة لكنها غير داخلة في أمر الاختبار الحالي.

## هوية المشروع

من `package.json`:

- الاسم: `mithnah`
- المنتج: `Mithnah`
- النسخة: `0.5.0`
- نقطة دخول Electron: `src/main/index.js`
- Electron: `28.3.3`
- React: `18.3.1`
- Vite: `5.4.21`
- Express: `5.2.1`
- Socket.IO: `4.8.3`
- مكتبة الحساب الفلكي للصلاة: `adhan`

## خريطة المجلدات

```text
.
├─ src/main                 Main process: Electron, IPC, prayer times, content, server
├─ src/renderer             React renderer: dashboard, settings, overlays, controls
├─ src/public               Static public assets used by the renderer
├─ build-output             Phone UI and vendor assets packaged with the app
├─ build                    Installer assets and scripts
├─ scripts                  Build helper scripts
├─ tests                    Test suite executed by npm test
├─ src/main/__tests__       Extra tests currently not executed by npm test
├─ .github/workflows        CI, build, release workflows
├─ dist                     Generated renderer output
└─ node_modules             Installed dependencies
```

## التدفق العام للتطبيق

1. Electron يبدأ من `src/main/index.js`.
2. `index.js` يجهّز المسارات والإعدادات وحقن الاعتمادات.
3. `lifecycle.js` يربط وحدات IPC ويُنشئ النافذة الرئيسية ويبدأ خادم التحكم عن بعد.
4. `window-manager.js` ينشئ نافذة العرض الرئيسية ويحمّل Vite في التطوير أو `dist/renderer/index.html` في الإنتاج.
5. `preload.js` يعرّض واجهة آمنة نسبيًا باسم `window.electron`.
6. React يبدأ من `src/renderer/main.jsx` ثم `App.jsx`.
7. `Dashboard.jsx` هو شاشة العرض الرئيسية، وباقي المكوّنات تظهر كطبقات: الإعدادات، اختيار الدعاء، الشرائح، التتبع، المساعدة، الربط مع الهاتف.

## Main Process

### `src/main/index.js`

هذا الملف ما زال نقطة الدخول الرئيسية ويحتوي على جزء كبير من السلوك القديم مع حقن وحدات مستخرجة. أهم ما يفعله:

- يحدد `USER_DATA_PATH`.
- يهيئ إعدادات مواقيت الصلاة.
- يربط IPC العام.
- يجهز خادم التحكم عن بعد.
- يجهز دورة حياة التطبيق.
- يحتوي على دوال مساعدة للشبكة، الجلسات، التكبير، والخروج من kiosk.

ملاحظة بنيوية: بعض المسؤوليات مكررة بين `index.js` ووحدات أحدث مثل `lifecycle.js` و`config/constants.js`. هذا يوحي بأن عملية التفكيك لم تكتمل بعد.

### `src/main/preload.js`

يعرّض للواجهة:

- `zoom`
- `remoteControl`
- `prayerTimes`
- `hijri`
- `location`
- `shia`
- `slideshow`
- `updater`
- `bridge`
- `marja`
- `app`

الواجهة الأمامية تعتمد على هذه القنوات بدل الوصول المباشر إلى Node.

### `src/main/ipc-handlers.js`

يسجل أوامر عامة مثل:

- إعداد/تأكيد PIN
- الخروج من kiosk
- تصدير/استيراد الإعدادات
- رفع شعار المسجد
- قراءة قدرات الشبكة
- جلب حالة التطبيق

يوجد هنا خلل أمني مهم موضح في قسم المخاطر.

### `src/main/lifecycle.js`

يربط الوحدات الأساسية:

- `prayer-times`
- `hijri`
- `location`
- `shia-content`
- `slideshow`
- `updater`
- `bridge`
- `marja`
- `remote-server`

ثم ينشئ النافذة ويبدأ خادم التحكم عن بعد. التحديثات التلقائية لا تعمل إلا إذا كانت البيئة تحتوي:

```bash
MITHNAH_AUTO_UPDATE=1
```

### `src/main/window/window-manager.js`

ينشئ نافذة Electron بإعدادات مهمة:

- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- `sandbox: false`
- ملء الشاشة
- منع فتح نوافذ جديدة داخل التطبيق وتحويل روابط http/https للخارج

## مواقيت الصلاة

المجلد: `src/main/prayer-times`

الملفات الرئيسية:

- `defaults.js`: الإعدادات الافتراضية.
- `config.js`: تحميل/حفظ/تهجير الإعدادات.
- `calculator.js`: حساب المواقيت.
- `methods.js`: كتالوج طرق الحساب.
- `index.js`: واجهة الوحدة وحالة الذاكرة والـ undo.
- `ipc.js`: قنوات IPC الخاصة بالمواقيت.

الإعدادات تحفظ في:

```text
%APPDATA%\Mithnah\prayer-config.json
```

الإعداد الافتراضي:

- الموقع: النجف
- `schemaVersion: 2`
- `largeText: true`
- `maghribPivot: true`
- `autoContentToday: false`
- `settingsPin: false`
- `kioskLock: false`

طرق الحساب:

- `Auto`
- `Jafari`
- `JafariWide`
- `QatifShia`
- `Tehran`
- عدة طرق سنية مدعومة كذلك

ملاحظات جيدة:

- يوجد تهجير schema من v1 إلى v2.
- يوجد نسخ احتياطي عند تلف ملف الإعدادات.
- يوجد حد لحجم ملف الإعدادات.
- `setConfig` يدمج `features` و`location` و`adjustmentsMinutes` بدل استبدالها بالكامل.

## التاريخ الهجري والمناسبات

المجلدات/الملفات:

- `src/main/hijri`
- `src/main/bridge-ipc.js`
- `src/main/shia-content/hijri-events.js`

التقاويم المدعومة:

- `jafari`
- `umm-al-qura`
- `islamic-civil`
- `islamic-tbla`
- `intl-islamic`

ميزة مهمة: عند تفعيل `maghribPivot` ينتقل يوم المناسبات بعد المغرب، وهذا مناسب لسياق المجالس والحسينيات.

## الموقع والوقت

المجلد: `src/main/location`

السلوك العام:

- يفضّل العمل بدون إنترنت.
- يستخدم timezone لاختيار مدينة قريبة.
- يحتوي جدول مدن واسع.
- يرفض الإحداثيات غير الصالحة مثل `0,0`.
- البحث العكسي والبحث عبر الإنترنت موجودان لكنهما اختياريان عند الاستدعاء.

الافتراضي العالمي عند عدم معرفة الموقع:

- النجف
- timezone: `Asia/Baghdad`

## المراجع

المجلد: `src/main/marja`

يوجد كتالوج مراجع مع presets جاهزة. كل preset يضبط:

- طريقة الحساب
- الفقه
- التقويم
- تأخير المغرب

الخيار `custom` موجود بدون preset تلقائي.

## المحتوى الشيعي

المجلد: `src/main/shia-content`

الأنواع:

- أدعية
- زيارات
- تعقيبات
- تسبيح
- مناسبات هجرية

مصادر الأدعية:

- ملفات JSON داخل `src/main/shia-content/data`
- يتم تحويل النص إلى شرائح عبر `chunker.js`

ملاحظات:

- يوجد alias لأسماء قديمة مثل `dua-kumail` إلى `kumayl`.
- في حال تعطل JSON معيّن، الوحدة تحاول توليد placeholder بدل إسقاط كل الكتالوج.
- `upcomingEvents` يحسب المناسبات القادمة بشكل تقريبي حسب التاريخ الهجري.

## الشرائح

المجلد: `src/main/slideshow`

الحالة الأساسية:

- `active`
- `deck`
- `index`
- `blank`
- `openedAt`

الأوامر:

- `OPEN`
- `CLOSE`
- `NEXT`
- `PREV`
- `FIRST`
- `LAST`
- `GOTO`
- `BLANK`

الواجهة تفتح شرائح من المحتوى الجاهز أو محتوى مخصص يكتبه المستخدم.

## الواجهة الأمامية

المجلد: `src/renderer`

### نقطة الدخول

- `main.jsx`
- `App.jsx`

### أهم المكونات

- `Dashboard.jsx`: شاشة العرض الأساسية.
- `SettingsOverlay.jsx`: إعدادات F3.
- `DuaPicker.jsx`: مكتبة الأدعية والزيارات F4.
- `SlideshowOverlay.jsx`: عرض الشرائح كامل الشاشة.
- `PrayerTracker.jsx`: متتبع الصلاة والتسبيح F5.
- `FloatingMenu.jsx`: القائمة العائمة.
- `PairingModal.jsx`: ربط الهاتف.
- `HelpOverlay.jsx`: المساعدة F1.
- `OnboardingOverlay.jsx`: إعداد أول تشغيل.
- `FirstRunTour.jsx`: جولة أولية.
- `UpdateBadge.jsx` و`UpdateSection.jsx`: التحديثات.
- `ErrorBoundary.jsx` و`ErrorToast.jsx`: عزل وعرض الأخطاء.

### مكتبات الواجهة

- `src/renderer/lib/ipc.js`: طبقة اتصال مع `window.electron`.
- `src/renderer/lib/format.js`: أرقام عربية، وقت، أسماء الصلوات.
- `src/renderer/lib/errors.js`: تحويل الأخطاء التقنية إلى رسائل عربية مفهومة.

### CSS

الملف `src/renderer/styles.css` كبير جدًا ويحتوي أغلب تصميم التطبيق. النمط العام داكن مع أخضر وذهبي. يوجد دعم لـ:

- الخط الكبير
- واجهات الإعدادات
- الشرائح
- شاشة الهاتف/الربط
- التلميحات والأخطاء

ملاحظة: يوجد تعليق قديم يقول إن `largeText` افتراضيًا off، بينما الكود يجعله on.

## التحكم من الهاتف

الملفات:

- `build-output/mobile-control.html`
- `build-output/mobile-control.js`
- `src/main/remote-server.js`

الفكرة:

- خادم Express داخل التطبيق.
- Socket.IO للأحداث المباشرة.
- واجهة هاتف محلية عبر الشبكة.
- PIN للمصادقة.

الحالة الحالية فيها عدم تطابق حرج:

واجهة الهاتف تستدعي endpoints مثل:

- `/api/auth`
- `/api/phone-dashboard`
- `/api/tracker/command`
- `/api/shia/catalog`
- `/api/slideshow/open`
- `/api/config`
- `/api/location/set`

لكن `src/main/remote-server.js` يعرّف حاليًا:

- `GET /api/health`
- `GET /api/state`
- `POST /api/pin`
- `POST /api/command`
- `POST /api/slideshow/:cmd`

هذا يعني أن التحكم من الهاتف غالبًا لا يعمل كما تتوقع الواجهة الحالية، حتى لو الخادم نفسه بدأ بنجاح.

## الشبكة والأمان

الملف: `src/main/network-policy.js`

يوجد كود جاهز لـ:

- geolocation permission
- حظر الشبكة الخارجية افتراضيًا
- تحويل Google Fonts وملفات texture إلى نسخ محلية
- Content Security Policy
- escape hatch عبر:

```bash
MITHNAH_ALLOW_NETWORK=1
```

لكن الفحص وجد أن دوال التثبيت غير مستدعاة من باقي التطبيق:

- `installGeolocationPermission`
- `installOfflineNetworkPolicy`
- `installContentSecurityPolicy`

بالتالي الوثائق تقول إن الشبكة الخارجية محظورة افتراضيًا، لكن الكود الحالي لا يبدو أنه يفعّل السياسة.

## التحديثات

المجلد: `src/main/updater`

السلوك:

- يستخدم `electron-updater`.
- لا يبدأ تلقائيًا إلا مع `MITHNAH_AUTO_UPDATE=1`.
- يدعم override:

```bash
MITHNAH_UPDATE_FEED=github:owner/repo
MITHNAH_UPDATE_FEED=https://example.com/updates
```

يوجد حذر من placeholder feeds. الحالة تُرسل للواجهة عبر قنوات updater.

## الاختبارات

الأمر الحالي:

```bash
npm test
```

النتيجة بتاريخ إنشاء هذا الملف:

```text
125 passed
0 failed
```

ما تغطيه الاختبارات الحالية:

- المدن والموقع
- الميزات والإعدادات
- pivot بعد المغرب
- اتجاه القبلة
- PIN hash/verify/rate-limit على مستوى الدوال
- اختيار محتوى اليوم
- التقويم الهجري
- المراجع
- حسابات مواقيت الصلاة
- formatter في الواجهة
- المحتوى الشيعي
- محرك الشرائح

فجوات مهمة:

- اختبارات `src/main/__tests__/*.test.js` لا تعمل ضمن `npm test`.
- لا يوجد اختبار واضح لتطابق API الهاتف مع `remote-server.js`.
- لا يوجد اختبار يثبت أن سياسة الشبكة/CSP مركبة فعليًا.
- لا يوجد اختبار IPC يكشف مشكلة عدم انتظار `verifyPinAgainstHash`.
- لا يوجد اختبار دورة حياة يكشف أن `autoContent.start()` غير موجودة.

## CI وRelease

المجلد: `.github/workflows`

### `test.yml`

- يعمل على Ubuntu وWindows.
- يستخدم Node 22.
- يشغّل `npm ci`.
- يفحص syntax لبعض ملفات `src/main/*.js`.
- يشغّل `npm test`.

### `build.yml`

- يدوي.
- Windows.
- `npm ci`
- `npm test`
- `npm run dist`
- يرفع installer artifact.

### `release.yml`

- عند tags بالشكل `v*.*.*` أو يدويًا.
- Windows.
- يبني وينشر عبر electron-builder/GitHub releases.

## مشاكل حرجة ومهمة

### 1. تحقق PIN في IPC لا ينتظر الدالة async

الموقع:

- `src/main/ipc-handlers.js:106`
- `src/main/ipc-handlers.js:112`
- `src/main/ipc-handlers.js:176`
- `src/main/ipc-handlers.js:181`
- `src/main/app-features.js:71`

`verifyPinAgainstHash` دالة async، لكن في handler الخاص بـ `app:verify-settings-pin` و`app:kiosk-quit` يتم استخدامها بدون `await`. كائن Promise يعتبر truthy، لذلك قد يتم قبول PIN خاطئ في مسارات IPC.

الأولوية: حرجة.

الإصلاح المتوقع:

- جعل handlers async.
- استخدام `await appFeatures.verifyPinAgainstHash(...)`.
- إضافة اختبار IPC يغطي PIN صحيح وخاطئ.

### 2. واجهة الهاتف لا تطابق API الخادم

المواقع:

- `build-output/mobile-control.js:107`
- `build-output/mobile-control.js:254`
- `build-output/mobile-control.js:394`
- `build-output/mobile-control.js:498`
- `build-output/mobile-control.js:567`
- `build-output/mobile-control.js:705`
- `build-output/mobile-control.js:736`
- `src/main/remote-server.js:108`
- `src/main/remote-server.js:113`
- `src/main/remote-server.js:121`
- `src/main/remote-server.js:150`
- `src/main/remote-server.js:172`

الواجهة تطلب endpoints جديدة، والخادم يعرّف endpoints أقدم أو مختلفة. هذا يكسر تجربة التحكم من الهاتف.

الأولوية: حرجة.

الإصلاح المتوقع:

- إما تحديث `remote-server.js` ليدعم endpoints التي تطلبها الواجهة.
- أو تحديث `mobile-control.js` ليتعامل مع API الموجود.
- إضافة اختبار contract بسيط يحصر endpoints المتوقعة.

### 3. سياسة الشبكة/CSP مكتوبة لكنها غير مركبة

الموقع:

- `src/main/network-policy.js:91`
- `src/main/network-policy.js:113`
- `src/main/network-policy.js:149`
- `src/main/network-policy.js:178`
- `README.md:23`
- `README.md:150`

الوثائق تقول إن الشبكة الخارجية محظورة إلا مع `MITHNAH_ALLOW_NETWORK=1`، لكن دوال التثبيت لا تظهر مستدعاة من التطبيق.

الأولوية: عالية.

الإصلاح المتوقع:

- استدعاء دوال `network-policy.js` في مسار بدء التطبيق قبل تحميل النافذة.
- اختبار أن الطلبات الخارجية تُحظر وأن الأصول المحلية تعمل.

### 4. المحتوى التلقائي عند الإقلاع لا يملك start/stop

المواقع:

- `src/main/lifecycle.js:100`
- `src/main/lifecycle.js:142`
- `src/main/auto-content.js:82`

`lifecycle.js` يستدعي `deps.autoContent.start()` و`deps.autoContent.stop()`، لكن `auto-content.js` لا يصدّر هذه الدوال. الخطأ يتم ابتلاعه داخل `try/catch`، لذلك قد تبدو الميزة موجودة لكنها لا تعمل.

الأولوية: عالية.

الإصلاح المتوقع:

- إما إضافة `start/stop` للوحدة.
- أو إزالة الاستدعاء وتوصيل اختيار المحتوى التلقائي بمكان آخر واضح.
- إضافة اختبار lifecycle للميزة.

### 5. ملف `NUL` يسبب مشكلة Git على Windows

الملاحظة:

```text
git status --short
 M NUL
 M package.json
error: short read while indexing NUL
```

وجود ملف باسم `NUL` خطر على Windows لأنه اسم جهاز محجوز. هذا قد يجعل أوامر Git غير مستقرة.

الأولوية: عالية.

الإصلاح المتوقع:

- التعامل معه بحذر شديد وبشكل صريح.
- عدم حذفه أو نقله ضمن إصلاحات عشوائية.
- إزالة أثره من المستودع بطريقة مناسبة بعد موافقة صاحب المشروع.

### 6. اختبارات موجودة لكنها غير مشغلة

المواقع:

- `package.json:24`
- `src/main/__tests__/window-manager.test.js`
- `src/main/__tests__/lifecycle.test.js`
- `src/main/__tests__/ipc-handlers.test.js`
- `src/main/__tests__/integration.test.js`

أمر الاختبار الحالي يحصر التنفيذ في `tests/**/*.test.js`. هذا يترك اختبارات main process الإضافية خارج CI.

الأولوية: متوسطة إلى عالية.

الإصلاح المتوقع:

- توسيع سكربت الاختبار ليشمل `src/main/__tests__/**/*.test.js`.
- التأكد من أن هذه الاختبارات تعمل على Windows وUbuntu في CI.

## ملاحظات بنيوية أخرى

- يوجد `src/main/config/constants.js` يكرر ثوابت موجودة في `index.js` ولا يبدو أنه جزء أساسي من المسار الحالي.
- `index.js` و`lifecycle.js` يحتويان على تداخل في مسؤوليات single-instance lock وChromium switches.
- `PROJECT_BRIEF.md` مفيد لكنه قديم في عدة نقاط مثل النسخ وبعض الافتراضات.
- `README.md` يذكر سياسة الشبكة كأنها مفعّلة، وهذا يحتاج تصحيحًا بعد إصلاح التركيب أو تحديث النص.
- `remoteSessionTokens` يبدو أن شكل البيانات فيه اختلف بين كود قديم وكود الخادم المستخرج.
- `build-output/vendor` يحتوي ملفات legacy ما زالت تُحزم، وبعضها ربما لم يعد مستخدمًا من واجهة الهاتف.

## ترتيب الإصلاح المقترح

1. إصلاح `await` في تحقق PIN وإضافة اختبار IPC.
2. توحيد API تحكم الهاتف بين `mobile-control.js` و`remote-server.js`.
3. تركيب `network-policy.js` فعليًا أو تعديل الوثائق إذا تقرر عدم استخدامها.
4. إصلاح `autoContentToday` عبر start/stop أو مسار تشغيل واضح.
5. تعديل سكربت الاختبار ليشمل `src/main/__tests__`.
6. معالجة ملف `NUL` بموافقة صريحة.
7. تنظيف التكرارات القديمة بين `index.js` و`lifecycle.js` بعد استقرار السلوك.

## ما يجب الحذر منه عند التعديل

- لا تغيّر ملفات `build-output` وحدها إذا كانت مولدة من مصدر آخر غير موجود؛ تأكد هل هي المصدر الفعلي لواجهة الهاتف أم ناتج بناء.
- لا تعتمد على README وحده في فهم الشبكة، لأن التنفيذ الحالي لا يثبت تفعيل policy.
- لا تعتبر نجاح `npm test` ضمانًا لتحكم الهاتف أو سياسة الشبكة أو PIN IPC.
- حافظ على توافق Windows لأن التطبيق يستهدف Windows installer.
- عند تعديل IPC، اختبر من جهة الواجهة وليس الدوال فقط.

## أفضل نقطة بداية لمطور جديد

للفهم:

1. اقرأ `package.json`.
2. اقرأ `src/main/index.js`.
3. اقرأ `src/main/lifecycle.js`.
4. اقرأ `src/main/preload.js`.
5. اقرأ `src/renderer/App.jsx`.
6. اقرأ `src/renderer/lib/ipc.js`.
7. اقرأ `src/main/prayer-times/index.js`.
8. اقرأ `src/main/remote-server.js` و`build-output/mobile-control.js` معًا.

للإصلاح:

ابدأ بالمشاكل الحرجة أعلاه، لأنها تمس الأمان وتجربة الهاتف وصدق الوثائق.

