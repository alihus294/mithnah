// Shia Islamic calendar events — wiladat (births), shahadat (martyrdoms),
// ayyam (significant days). Dates are in the Hijri calendar.
//
// Each event has:
//   - id, title (ar, en)
//   - month (1-12), day (1-30)
//   - kind: 'wiladah' | 'shahadah' | 'eid' | 'significant'
//   - figure: name of the personage (if applicable)
//   - description (ar): context for display
//
// Where Shia and Sunni traditions disagree on a date (e.g., Mawlid of the
// Prophet — Shia: 17 Rabi al-Awwal; Sunni: 12 Rabi al-Awwal), the Shia date
// is used. Marked with `shiaSpecific: true`.
//
// Source: مفاتيح الجنان، الوقائع والأيام. Cross-verified with Bihar al-Anwar
// and the standard Shia liturgical calendar.

const ALL = [
  // --- محرم ---
  { id: 'new-year',       month: 1, day: 1,  kind: 'significant', title_ar: 'رأس السنة الهجرية',                                description_ar: 'بداية السنة الهجرية الجديدة. يُستحب صيامها وقراءة أدعية خاصة.' },
  { id: 'ashura',         month: 1, day: 10, kind: 'shahadah',    figure: 'الإمام الحسين عليه السلام', title_ar: 'عاشوراء — استشهاد الإمام الحسين عليه السلام', description_ar: 'يوم استشهاد سيد الشهداء أبي عبد الله الحسين بن علي عليه السلام وأصحابه في كربلاء سنة ٦١ هـ. من أعظم المصائب في تاريخ الإسلام.' },
  { id: 'imam-sajjad-imamate', month: 1, day: 11, kind: 'significant', figure: 'الإمام السجاد عليه السلام', title_ar: 'بداية إمامة الإمام السجاد عليه السلام', description_ar: 'بعد استشهاد الإمام الحسين عليه السلام.' },

  // --- صفر ---
  { id: 'arbaeen',        month: 2, day: 20, kind: 'shahadah',    figure: 'الإمام الحسين عليه السلام', title_ar: 'الأربعين — أربعين الإمام الحسين', description_ar: 'مرور أربعين يوماً على استشهاد الإمام الحسين عليه السلام. تُقام زيارة الأربعين ومسيرة مليونية من النجف إلى كربلاء.' },
  { id: 'rasul-shahadah', month: 2, day: 28, kind: 'shahadah',    figure: 'النبي محمد ﷺ',             title_ar: 'وفاة رسول الله ﷺ',                         shiaSpecific: true, description_ar: 'يوم وفاة الرسول الأكرم محمد ﷺ في آخر صفر على المشهور عند الشيعة.' },
  { id: 'imam-hasan-shahadah', month: 2, day: 28, kind: 'shahadah', figure: 'الإمام الحسن عليه السلام', title_ar: 'شهادة الإمام الحسن المجتبى عليه السلام', description_ar: 'استشهاد الإمام الحسن بن علي عليه السلام بالسم في المدينة المنورة.' },
  { id: 'imam-rida-shahadah', month: 2, day: 30, kind: 'shahadah', figure: 'الإمام الرضا عليه السلام', title_ar: 'شهادة الإمام علي بن موسى الرضا عليه السلام', description_ar: 'استشهاد الإمام الرضا عليه السلام بالسم في طوس (مشهد) سنة ٢٠٣ هـ.' },

  // --- ربيع الأول ---
  { id: 'imam-mahdi-imamate', month: 3, day: 8, kind: 'significant', figure: 'الإمام المهدي عجّل الله فرجه', title_ar: 'بداية إمامة الإمام المهدي عجّل الله فرجه', description_ar: 'بدء إمامة صاحب العصر والزمان بعد استشهاد والده الإمام الحسن العسكري عليه السلام.' },
  { id: 'prophet-hijra',      month: 3, day: 8, kind: 'significant', figure: 'النبي محمد ﷺ',                title_ar: 'ليلة المبيت — هجرة رسول الله',            description_ar: 'ليلة بات فيها الإمام علي عليه السلام على فراش رسول الله ﷺ فداءً له.' },
  { id: 'prophet-birth',      month: 3, day: 17, kind: 'wiladah',    figure: 'النبي محمد ﷺ',                title_ar: 'مولد النبي محمد ﷺ',                         shiaSpecific: true, description_ar: 'مولد الرسول الأكرم ﷺ في السابع عشر من ربيع الأول، وفي هذا اليوم أيضاً مولد الإمام الصادق عليه السلام.' },
  { id: 'imam-sadiq-birth',   month: 3, day: 17, kind: 'wiladah',    figure: 'الإمام الصادق عليه السلام',  title_ar: 'مولد الإمام جعفر الصادق عليه السلام',       description_ar: 'مولد الإمام السادس من أئمة أهل البيت عليهم السلام.' },

  // --- ربيع الآخر ---
  { id: 'imam-askari-birth',  month: 4, day: 8,  kind: 'wiladah',    figure: 'الإمام العسكري عليه السلام', title_ar: 'مولد الإمام الحسن العسكري عليه السلام',    description_ar: 'مولد الإمام الحادي عشر سنة ٢٣٢ هـ.' },

  // --- جمادى الأولى ---
  { id: 'zahra-wiladah',      month: 6, day: 20, kind: 'wiladah',    figure: 'السيدة فاطمة الزهراء عليها السلام', title_ar: 'مولد السيدة فاطمة الزهراء عليها السلام', description_ar: 'مولد سيدة نساء العالمين فاطمة الزهراء عليها السلام، بنت رسول الله ﷺ.' },

  // --- جمادى الآخرة ---
  { id: 'zahra-shahadah',     month: 6, day: 3,  kind: 'shahadah',   figure: 'السيدة فاطمة الزهراء عليها السلام', title_ar: 'شهادة السيدة فاطمة الزهراء عليها السلام (رواية ٧٥ يوماً)', description_ar: 'استشهاد سيدة نساء العالمين عليها السلام بعد وفاة أبيها ﷺ بخمسة وسبعين يوماً على الرواية المشهورة.' },

  // --- رجب ---
  { id: 'imam-baqir-birth',   month: 7, day: 1,  kind: 'wiladah',    figure: 'الإمام الباقر عليه السلام',  title_ar: 'مولد الإمام محمد الباقر عليه السلام',       description_ar: 'مولد الإمام الخامس من أئمة أهل البيت عليهم السلام.' },
  { id: 'imam-hadi-birth',    month: 7, day: 2,  kind: 'wiladah',    figure: 'الإمام الهادي عليه السلام',  title_ar: 'مولد الإمام علي الهادي عليه السلام',         description_ar: 'مولد الإمام العاشر من أئمة أهل البيت.' },
  { id: 'imam-kazim-shahadah',month: 7, day: 25, kind: 'shahadah',   figure: 'الإمام الكاظم عليه السلام',  title_ar: 'شهادة الإمام موسى الكاظم عليه السلام',       description_ar: 'استشهاد الإمام السابع في سجن هارون الرشيد ببغداد سنة ١٨٣ هـ.' },
  { id: 'bitha',              month: 7, day: 27, kind: 'significant', figure: 'النبي محمد ﷺ',                title_ar: 'ليلة المبعث النبوي الشريف',                  description_ar: 'مبعث النبي الأكرم ﷺ بالرسالة. تُحيى ليلته بالعبادة والدعاء.' },

  // --- شعبان ---
  { id: 'imam-husayn-birth',  month: 8, day: 3,  kind: 'wiladah',    figure: 'الإمام الحسين عليه السلام', title_ar: 'مولد الإمام الحسين عليه السلام',             description_ar: 'مولد سيد الشهداء في شهر شعبان سنة ٤ هـ.' },
  { id: 'abbas-birth',        month: 8, day: 4,  kind: 'wiladah',    figure: 'أبو الفضل العباس عليه السلام', title_ar: 'مولد أبي الفضل العباس عليه السلام',      description_ar: 'مولد قمر بني هاشم، حامل لواء الإمام الحسين عليه السلام في كربلاء.' },
  { id: 'imam-sajjad-birth',  month: 8, day: 5,  kind: 'wiladah',    figure: 'الإمام السجاد عليه السلام', title_ar: 'مولد الإمام علي بن الحسين زين العابدين',    description_ar: 'مولد الإمام السجاد عليه السلام صاحب الصحيفة السجادية.' },
  { id: 'ali-akbar-birth',    month: 8, day: 11, kind: 'wiladah',    figure: 'علي الأكبر عليه السلام',    title_ar: 'مولد علي الأكبر ابن الإمام الحسين',          description_ar: 'الشاب الهاشمي الذي استُشهد في كربلاء، أشبه الناس خَلْقاً وخُلُقاً برسول الله ﷺ.' },
  { id: 'mahdi-birth',        month: 8, day: 15, kind: 'wiladah',    figure: 'الإمام المهدي عجّل الله فرجه', title_ar: 'مولد الإمام المهدي عجّل الله فرجه الشريف — ليلة النصف من شعبان', description_ar: 'مولد صاحب العصر والزمان في سامراء سنة ٢٥٥ هـ. تُحيى ليلته بالعبادة والدعاء، ومن أبرز أعمالها دعاء كميل.' },

  // --- رمضان ---
  { id: 'imam-hasan-birth',   month: 9, day: 15, kind: 'wiladah',    figure: 'الإمام الحسن عليه السلام',  title_ar: 'مولد الإمام الحسن المجتبى عليه السلام',      description_ar: 'مولد الإمام الثاني، السبط الأكبر لرسول الله ﷺ.' },
  { id: 'ali-shahadah',       month: 9, day: 21, kind: 'shahadah',   figure: 'الإمام علي عليه السلام',    title_ar: 'شهادة أمير المؤمنين علي بن أبي طالب عليه السلام', description_ar: 'استشهاد الإمام علي عليه السلام في محراب مسجد الكوفة بضربة ابن ملجم ليلة التاسع عشر، وانتقاله إلى رحمة ربه يوم الحادي والعشرين من رمضان سنة ٤٠ هـ.' },
  { id: 'laylat-al-qadr-19',  month: 9, day: 19, kind: 'significant', title_ar: 'ليلة القدر — ليلة الضربة', description_ar: 'إحدى ليالي القدر المحتملة، وفيها ضُرب الإمام علي عليه السلام.' },
  { id: 'laylat-al-qadr-21',  month: 9, day: 21, kind: 'significant', title_ar: 'ليلة القدر المحتملة',      description_ar: 'إحدى ليالي القدر.' },
  { id: 'laylat-al-qadr-23',  month: 9, day: 23, kind: 'significant', title_ar: 'ليلة القدر — الأرجح',      description_ar: 'الليلة الأرجح لليلة القدر في الرواية الشيعية.' },

  // --- شوال ---
  { id: 'eid-fitr',           month: 10, day: 1, kind: 'eid',        title_ar: 'عيد الفطر المبارك',         description_ar: 'أول أيام العيد بعد شهر رمضان المبارك. تُقام صلاة العيد.' },

  // --- ذو القعدة ---
  { id: 'imam-rida-birth',    month: 11, day: 11, kind: 'wiladah',   figure: 'الإمام الرضا عليه السلام', title_ar: 'مولد الإمام علي بن موسى الرضا عليه السلام', description_ar: 'مولد الإمام الثامن من أئمة أهل البيت عليهم السلام في المدينة سنة ١٤٨ هـ.' },
  { id: 'masumah-shahadah',   month: 11, day: 10, kind: 'shahadah',  figure: 'السيدة فاطمة المعصومة عليها السلام', title_ar: 'وفاة السيدة فاطمة المعصومة عليها السلام', description_ar: 'وفاة كريمة أهل البيت السيدة فاطمة بنت موسى بن جعفر عليها السلام في قم المقدسة.' },

  // --- ذو الحجة ---
  { id: 'arafah',             month: 12, day: 9, kind: 'significant', title_ar: 'يوم عرفة',                description_ar: 'يوم الوقوف بعرفة. يُستحب قراءة دعاء عرفة للإمام الحسين عليه السلام ودعاء الإمام السجاد في الصحيفة السجادية.' },
  { id: 'eid-adha',           month: 12, day: 10, kind: 'eid',       title_ar: 'عيد الأضحى المبارك',       description_ar: 'العيد الكبير وأول أيام النحر. تُقام صلاة العيد.' },
  { id: 'ghadir',             month: 12, day: 18, kind: 'eid',       figure: 'الإمام علي عليه السلام', title_ar: 'عيد الغدير الأغر', description_ar: 'يوم نصب النبي ﷺ علياً عليه السلام إماماً للمسلمين في غدير خم. عيد الله الأكبر عند الشيعة.', shiaSpecific: true },
  { id: 'mubahalah',          month: 12, day: 24, kind: 'significant', title_ar: 'يوم المباهلة',          description_ar: 'يوم المباهلة بين النبي ﷺ ونصارى نجران، وفيه أنزلت آية التطهير. يُستحب صيامه.', shiaSpecific: true },
  { id: 'imam-hadi-shahadah', month: 12, day: 3,  kind: 'shahadah',  figure: 'الإمام الهادي عليه السلام', title_ar: 'شهادة الإمام علي الهادي عليه السلام', description_ar: 'استشهاد الإمام العاشر في سامراء سنة ٢٥٤ هـ.' }
];

module.exports = { ALL };
