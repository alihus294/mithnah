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
  note: 'يُقرأ بعد كل صلاة واجبة، ويعدل سبعينَ تسبيحة في غيره. العدد ١٠٠ مرة بالترتيب المذكور: ٣٤ تكبيراً، ثم ٣٣ تحميداً، ثم ٣٣ تسبيحاً.'
};

module.exports = { TASBIH_ZAHRA };
