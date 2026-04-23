// Tasbih al-Zahra (تسبيح السيدة الزهراء عليها السلام) — the distinctive Shia
// post-prayer dhikr taught to Fatima al-Zahra by the Prophet ﷺ. Counts are
// 34 + 33 + 33, DIFFERENT from the Sunni 33/33/34. The order is:
//   1. ٣٤ × الله أكبر
//   2. ٣٣ × الحمد لله
//   3. ٣٣ × سبحان الله
//
// Source: مفاتيح الجنان، باب التعقيبات المشتركة. Narrated via multiple Shia
// chains including Imam al-Sadiq (Kafi 3:342) and Imam al-Baqir.

const TASBIH_ZAHRA = {
  id: 'tasbih-zahra',
  title: 'تسبيح السيدة الزهراء عليها السلام',
  subtitle: 'علّمها رسول الله ﷺ فاطمة الزهراء عليها السلام',
  source:   'مفاتيح الجنان، التعقيبات المشتركة',
  fiqh:     'shia',
  // The three phrases with their counts and recommended order.
  phrases: [
    { order: 1, count: 34, phrase: 'اللهُ أَكْبَرُ',     phraseLatin: 'Allahu akbar',    meaning: 'Allah is the Greatest' },
    { order: 2, count: 33, phrase: 'الْحَمْدُ لِلّٰهِ',  phraseLatin: 'Al-hamdu li-llah', meaning: 'Praise be to Allah' },
    { order: 3, count: 33, phrase: 'سُبْحانَ اللهِ',     phraseLatin: 'Subhan Allah',    meaning: 'Glory be to Allah' }
  ],
  totalCount: 100,
  note: 'يُقرأ بعد كل صلاة واجبة، ويعدل سبعينَ تسبيحة في غيره. العدد ١٠٠ مرة بالترتيب المذكور: ٣٤ تكبيراً، ثم ٣٣ تحميداً، ثم ٣٣ تسبيحاً.',
  // Authenticated Shia hadith on the virtue of this tasbih. Shown on
  // the tracker's tasbih stage so the congregation sees WHY this
  // dhikr matters, not just the count. Chain: Imam al-Sadiq (عليه
  // السلام) via Zurarah in al-Kafi, one of the four foundational
  // Shia hadith collections.
  virtue: {
    text: 'تَسْبِيحُ فاطِمَةَ الزَّهْراءِ عَلَيْها السَّلامُ في كُلِّ يَوْمٍ في دُبُرِ كُلِّ صَلاةٍ أَحَبُّ إِلَيَّ مِنْ صَلاةِ أَلْفِ رَكْعَةٍ في كُلِّ يَوْمٍ.',
    attribution: 'الإمام جعفر الصادق عليه السلام',
    source: 'الكافي، الكليني، ج٣ ص٣٤٣'
  }
};

module.exports = { TASBIH_ZAHRA };
