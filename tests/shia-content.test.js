const test = require('node:test');
const assert = require('node:assert/strict');
const shia = require('../src/main/shia-content');

test('listDuas returns Shia duas with all required fields and valid slides', () => {
  const duas = shia.listDuas();
  assert.ok(duas.length >= 12, 'at least 12 duas registered');
  const requiredIds = ['kumayl', 'nudbah', 'tawassul', 'ahd', 'faraj', 'iftitah', 'abu-hamza', 'arafah'];
  for (const id of requiredIds) {
    assert.ok(duas.find(d => d.id === id), `dua ${id} is present`);
  }
  for (const d of duas) {
    assert.ok(d.title && typeof d.title === 'string');
    assert.equal(d.fiqh, 'shia', `dua ${d.id} must be marked as shia`);
    assert.ok(d.source && d.source.length > 0, `dua ${d.id} has a source citation`);
    assert.ok(Array.isArray(d.slides) && d.slides.length > 0, `dua ${d.id} has slides`);
    for (const s of d.slides) {
      assert.ok(s.kind, `slide has kind`);
      assert.ok(s.ar, `slide has Arabic text`);
    }
  }
});

test('getDua(id) returns frozen copies — caller cannot mutate the registry', () => {
  const d = shia.getDua('kumayl');
  assert.ok(d);
  assert.ok(Object.isFrozen(d), 'returned dua is frozen');
  // In non-strict mode this is a silent no-op; in strict mode it throws.
  // Either way the registry must not be mutated on the next read.
  try { d.title = 'hacked'; } catch (_) { /* strict mode would throw */ }
  const d2 = shia.getDua('kumayl');
  assert.equal(d2.title, 'دعاء كُمَيْل', 'registry is unchanged after attempted mutation');
});

test('getDua returns null for unknown id', () => {
  assert.equal(shia.getDua('not-a-real-dua'), null);
});

test('Tasbih al-Zahra has the correct Shia counts (34/33/33)', () => {
  const t = shia.getTasbihZahra();
  assert.ok(t);
  assert.equal(t.phrases.length, 3);
  const counts = t.phrases.map(p => p.count);
  assert.deepEqual(counts, [34, 33, 33], 'Shia tasbih is 34 Allahu Akbar + 33 Alhamdulillah + 33 SubhanAllah');
  assert.equal(t.phrases[0].phrase, 'اللهُ أَكْبَرُ');
  assert.equal(t.totalCount, 100);
});

test('listZiyarat includes Ashura, Arbaeen, Warith, Hujja, Jamia Kabira', () => {
  const zs = shia.listZiyarat();
  const ids = zs.map(z => z.id);
  for (const required of ['ashura', 'arbaeen', 'warith', 'al-hujja', 'jamia-kabira']) {
    assert.ok(ids.includes(required), `ziyarah ${required} is present`);
  }
  for (const z of zs) {
    assert.equal(z.fiqh, 'shia');
    assert.ok(z.source.length > 0);
  }
});

test('listTaqibat includes common + per-prayer taqibat', () => {
  const ts = shia.listTaqibat();
  const ids = ts.map(t => t.id);
  assert.ok(ids.includes('common'), 'common taqib is present');
  for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    assert.ok(ids.includes(p), `taqib for ${p} is present`);
  }
});

test('listEvents includes core Shia liturgical dates', () => {
  const events = shia.listEvents();
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  // Core events that MUST be present in a Shia Twelver app.
  for (const required of [
    'ashura',       // 10 Muharram
    'arbaeen',      // 20 Safar
    'ghadir',       // 18 Dhul-Hijjah
    'mahdi-birth',  // 15 Shaban
    'prophet-birth',// 17 Rabi al-Awwal (Shia date)
    'ali-shahadah', // 21 Ramadan
    'mubahalah',    // 24 Dhul-Hijjah
    'arafah'        // 9 Dhul-Hijjah
  ]) {
    assert.ok(byId[required], `event ${required} is present`);
  }
  assert.equal(byId.ashura.month, 1);
  assert.equal(byId.ashura.day, 10);
  assert.equal(byId.arbaeen.month, 2);
  assert.equal(byId.arbaeen.day, 20);
  assert.equal(byId.ghadir.month, 12);
  assert.equal(byId.ghadir.day, 18);
  assert.equal(byId['mahdi-birth'].month, 8);
  assert.equal(byId['mahdi-birth'].day, 15);
});

test('eventsForHijriDate filters by month+day', () => {
  const ashura = shia.eventsForHijriDate(null, 1, 10);
  assert.ok(ashura.length >= 1);
  assert.ok(ashura.some(e => e.id === 'ashura'));
  const empty = shia.eventsForHijriDate(null, 5, 17);
  assert.ok(Array.isArray(empty));
});
