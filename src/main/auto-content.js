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

// Pick the best deck for today based on events + effective Hijri date.
// Returns { kind, id } or null.
function pickAutoDeck(todaysEvents) {
  if (!Array.isArray(todaysEvents) || todaysEvents.length === 0) return null;
  // Priority: shahadah > eid > significant > wiladah (mourning/celebration
  // always takes precedence over births — e.g. Ashura > anything else on
  // 10 Muharram would be a very rare collision, but just in case).
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
  return null;
}

module.exports = { pickAutoDeck, EVENT_TO_DECK };
