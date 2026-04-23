const test = require('node:test');
const assert = require('node:assert/strict');
const { toHijri, fromHijri, today, listCalendars, getMonthName, HIJRI_MONTHS } = require('../src/main/hijri');

test('listCalendars returns 5 Hijri calendar variants with required fields', () => {
  const cals = listCalendars();
  assert.equal(cals.length, 5);
  const ids = cals.map(c => c.id);
  assert.ok(ids.includes('jafari'), 'jafari (Shia default)');
  assert.ok(ids.includes('umm-al-qura'));
  assert.ok(ids.includes('islamic-civil'));
  assert.ok(ids.includes('islamic-tbla'));
  assert.ok(ids.includes('intl-islamic'), 'intl-islamic (replaces former "astronomical")');
  for (const c of cals) {
    assert.ok(c.en && c.ar, `calendar ${c.id} has bilingual names`);
    assert.ok(c.intlCalendar, `calendar ${c.id} maps to an Intl calendar`);
  }
  // Jafari must be marked as the default for a Shia Twelver app.
  const jafari = cals.find(c => c.id === 'jafari');
  assert.equal(jafari.isDefault, true);
});

test('HIJRI_MONTHS has all 12 months with Arabic + English names', () => {
  assert.equal(HIJRI_MONTHS.length, 12);
  const expectedAr = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  HIJRI_MONTHS.forEach((m, i) => {
    assert.equal(m.index, i + 1);
    assert.equal(m.ar, expectedAr[i]);
    assert.ok(m.en, `month ${i + 1} has English name`);
  });
});

test('getMonthName returns Arabic by default, English on request', () => {
  assert.equal(getMonthName(9), 'رمضان');
  assert.equal(getMonthName(9, 'en'), 'Ramadan');
  assert.equal(getMonthName(99), null);
});

test('toHijri — known anchor dates across all calendars', () => {
  // 2026-04-19 is 2 Dhul-Qa'dah 1447 AH in most calendars (see calendar table).
  const d = new Date('2026-04-19T12:00:00Z');
  const jafari = toHijri(d, 'jafari');
  assert.equal(jafari.year, 1447);
  assert.equal(jafari.month, 11);
  assert.equal(jafari.day, 2);
  assert.equal(jafari.monthAr, 'ذو القعدة');

  const uaq = toHijri(d, 'umm-al-qura');
  assert.equal(uaq.year, 1447);
  assert.equal(uaq.month, 11);

  // islamic-tbla runs 1 day ahead of the others (astronomical base).
  const tbla = toHijri(d, 'islamic-tbla');
  assert.equal(tbla.day, 3);
});

test('toHijri — dayOffset shifts the resulting Hijri day', () => {
  const d = new Date('2026-04-19T12:00:00Z');
  const base = toHijri(d, 'jafari');
  const plusOne = toHijri(d, 'jafari', { dayOffset: 1 });
  // +1 day on the Gregorian input; Hijri day should match whatever the next
  // Gregorian day maps to (usually base.day + 1, except at month boundaries).
  const nextDay = toHijri(new Date(d.getTime() + 86400000), 'jafari');
  assert.equal(plusOne.day, nextDay.day);
  assert.equal(plusOne.month, nextDay.month);
  assert.equal(plusOne.year, nextDay.year);
});

test('toHijri — rejects unknown calendar id', () => {
  assert.throws(() => toHijri(new Date(), 'not-a-calendar'), /Unknown Hijri calendar/);
});

test('fromHijri — round-trip via known dates', () => {
  // 1 Muharram 1447 AH -> 2025-06-26 (umm-al-qura)
  const g = fromHijri(1447, 1, 1, 'umm-al-qura');
  assert.ok(g instanceof Date);
  const back = toHijri(g, 'umm-al-qura');
  assert.equal(back.year, 1447);
  assert.equal(back.month, 1);
  assert.equal(back.day, 1);
});

test('fromHijri — round-trip with jafari across multiple months', () => {
  for (const [y, m, d] of [[1447, 9, 15], [1447, 12, 10], [1448, 1, 1], [1500, 7, 5]]) {
    const g = fromHijri(y, m, d, 'jafari');
    assert.ok(g, `fromHijri(${y}/${m}/${d}) produced a date`);
    const back = toHijri(g, 'jafari');
    assert.equal(back.year, y, `year round-trips for ${y}/${m}/${d}`);
    assert.equal(back.month, m, `month round-trips for ${y}/${m}/${d}`);
    assert.equal(back.day, d, `day round-trips for ${y}/${m}/${d}`);
  }
});

test('fromHijri — rejects out-of-range values', () => {
  assert.throws(() => fromHijri(1447, 13, 1, 'jafari'), /month out of range/);
  assert.throws(() => fromHijri(1447, 0, 1, 'jafari'), /month out of range/);
  assert.throws(() => fromHijri(1447, 1, 31, 'jafari'), /day out of range/);
  assert.throws(() => fromHijri(1447, 1, 0, 'jafari'), /day out of range/);
  assert.throws(() => fromHijri('x', 1, 1, 'jafari'), /integers/);
});

test('today() returns a Hijri record matching toHijri(new Date())', () => {
  const t = today('jafari');
  const now = toHijri(new Date(), 'jafari');
  assert.equal(t.year, now.year);
  assert.equal(t.month, now.month);
  assert.equal(t.day, now.day);
});
