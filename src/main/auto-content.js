// Auto-content selector — maps today's most significant Hijri event to a
// recommended dua/ziyarah that should be opened on the wall when
// `features.autoContentToday` is on. Runs once at boot, after the slideshow
// module is initialized. Deliberately conservative: only fires for events
// where the recommendation is unambiguous (Ashura → Ziyarat Ashura,
// Arafah → Dua Arafa, etc). A null return means "don't auto-open".

// Map from event id (in shia-content/hijri-events.js) to a suggested deck
// identified by { kind, id }. Kinds: 'ziyarah' | 'dua' | 'taqib'.
const EVENT_TO_DECK = {
  // Muharram — Ashura + 40 days after (Arbaeen)
  'ashura':  { kind: 'ziyarah', id: 'ashura' },
  'arbaeen': { kind: 'ziyarah', id: 'warith' },
  // Dhul-Hijjah
  'arafah':  { kind: 'dua',     id: 'arafah' },
  // Ghadir: imamate declaration of Imam Ali ع — Dua Kumayl (from Imam Ali)
  // is the strongest content tie in the current registry.
  'ghadir':  { kind: 'dua',     id: 'kumayl' },
  // Ramadan — Laylat al-Qadr probable nights → Dua Iftitah (recited nightly
  // in Ramadan by tradition).
  'laylat-al-qadr-19': { kind: 'dua', id: 'iftitah' },
  'laylat-al-qadr-21': { kind: 'dua', id: 'iftitah' },
  'laylat-al-qadr-23': { kind: 'dua', id: 'iftitah' },
  // Ali Shahadah (21 Ramadan) → Dua Kumayl.
  'ali-shahadah': { kind: 'dua', id: 'kumayl' },
  // Mid-Sha'ban — Imam Mahdi's birth → Ziyarat al-Hujja (greeting the Imam).
  'mahdi-birth': { kind: 'ziyarah', id: 'al-hujja' },
};

// Day-of-week defaults so "دعاء اليوم" actually OPENS something every
// day, not just on major Hijri events (operator 2026-04-23: "دعاء
// اليوم ما يشتغل"). Tied to Shia Twelver tradition:
//   • Thursday night → Dua Kumayl (recited ليلة الجمعة)
//   • Friday         → Dua Nudbah (recited صبيحة الجمعة)
//   • Saturday/Sun   → rotate through generic duas below
// JS day indices: Sun=0 Mon=1 … Sat=6.
const WEEKDAY_FALLBACK = {
  0: { kind: 'dua', id: 'sabah' },     // Sun
  1: { kind: 'dua', id: 'tawassul' },  // Mon
  2: { kind: 'dua', id: 'ahd' },       // Tue
  3: { kind: 'dua', id: 'faraj' },     // Wed
  4: { kind: 'dua', id: 'kumayl' },    // Thu (ليلة الجمعة)
  5: { kind: 'dua', id: 'nudbah' },    // Fri (صبيحة الجمعة)
  6: { kind: 'dua', id: 'jawshan-saghir' }, // Sat
};

// Pick the best deck for today.
//   1) If today carries a mapped Hijri event, use that (Ashura →
//      Ziyarat Ashura, Arafah → Dua Arafah, etc.).
//   2) During Ramadan every day gets Dua Iftitah (recited nightly).
//   3) Otherwise fall back to the weekday rotation above so the
//      caretaker ALWAYS sees something meaningful when they turn
//      autoContentToday on — the previous implementation returned
//      null on most days and made the feature look broken.
// Returns { kind, id } or null (very rare — only if the weekday
// mapping is somehow cleared).
function pickAutoDeck(todaysEvents, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const hijri = opts.hijri || null;
  // (1) Hijri-event match wins every time.
  if (Array.isArray(todaysEvents) && todaysEvents.length > 0) {
    const order = ['shahadah', 'eid', 'significant', 'wiladah'];
    const sorted = todaysEvents.slice().sort((a, b) => {
      const ai = order.indexOf(a.kind || 'significant');
      const bi = order.indexOf(b.kind || 'significant');
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    for (const ev of sorted) {
      const mapping = EVENT_TO_DECK[ev.id];
      if (mapping) return mapping;
    }
  }
  // (2) Ramadan → Iftitah. Hijri month 9 covers the whole month.
  if (hijri && hijri.month === 9) {
    return { kind: 'dua', id: 'iftitah' };
  }
  // (3) Weekday fallback.
  const weekday = now.getDay();
  return WEEKDAY_FALLBACK[weekday] || null;
}

module.exports = { pickAutoDeck, EVENT_TO_DECK, WEEKDAY_FALLBACK };
