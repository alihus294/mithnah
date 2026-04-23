const test = require('node:test');
const assert = require('node:assert/strict');
const shia = require('../src/main/shia-content');

test('upcomingEvents returns an array, bounded by limit', () => {
  const today = { year: 1447, month: 1, day: 1 }; // 1 Muharram
  const r = shia.upcomingEvents(today, { daysAhead: 40, limit: 3 });
  assert.ok(Array.isArray(r));
  assert.ok(r.length <= 3);
});

test('upcomingEvents orders by days-away ascending', () => {
  const today = { year: 1447, month: 1, day: 1 };
  const r = shia.upcomingEvents(today, { daysAhead: 60, limit: 10 });
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].daysAway >= r[i - 1].daysAway,
      `result ${i} (${r[i].daysAway}d) is not-before result ${i-1} (${r[i-1].daysAway}d)`);
  }
});

test('upcomingEvents excludes today itself (delta === 0)', () => {
  // On 1 Muharram the only event on that day is "new-year".
  const today = { year: 1447, month: 1, day: 1 };
  const r = shia.upcomingEvents(today, { daysAhead: 40, limit: 10 });
  for (const it of r) {
    assert.ok(it.daysAway > 0, 'all upcoming are strictly in the future');
    assert.ok(!(it.event.month === 1 && it.event.day === 1), 'no same-day items leaked');
  }
});

test('upcomingEvents finds Ashura when today is 1 Muharram (9 days away)', () => {
  const today = { year: 1447, month: 1, day: 1 };
  const r = shia.upcomingEvents(today, { daysAhead: 15, limit: 5 });
  const ashura = r.find(it => it.event.id === 'ashura');
  assert.ok(ashura, 'Ashura should appear in the upcoming list');
  assert.equal(ashura.daysAway, 9);
  assert.equal(ashura.hijriTarget.month, 1);
  assert.equal(ashura.hijriTarget.day, 10);
});

test('upcomingEvents rolls to next Hijri year when event has passed', () => {
  // On 1 Dhul-Hijjah (month 12, day 1), the year's Ashura has passed
  // (month 1). Next Ashura is many months away. It should still appear
  // within a 400-day window.
  const today = { year: 1447, month: 12, day: 1 };
  const r = shia.upcomingEvents(today, { daysAhead: 400, limit: 20 });
  const ashura = r.find(it => it.event.id === 'ashura');
  assert.ok(ashura, 'next-year Ashura should appear');
  assert.ok(ashura.daysAway > 0);
  assert.equal(ashura.hijriTarget.year, today.year + 1);
});

test('upcomingEvents respects daysAhead cap', () => {
  const today = { year: 1447, month: 1, day: 1 };
  const near = shia.upcomingEvents(today, { daysAhead: 5, limit: 20 });
  for (const it of near) {
    assert.ok(it.daysAway <= 5, `${it.event.id} is ${it.daysAway}d away, within 5`);
  }
});

test('upcomingEvents handles invalid today gracefully', () => {
  assert.deepEqual(shia.upcomingEvents(null), []);
  assert.deepEqual(shia.upcomingEvents({}), []);
  assert.deepEqual(shia.upcomingEvents({ year: 1447, month: 'x', day: 1 }), []);
});
