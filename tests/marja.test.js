const test = require('node:test');
const assert = require('node:assert/strict');
const marja = require('../src/main/marja');

test('listMarjas returns at least 12 real marjas + custom', () => {
  const list = marja.listMarjas();
  assert.ok(list.length >= 12, `expected ≥12 marjas, got ${list.length}`);
  const ids = list.map(m => m.id);
  for (const required of ['sistani', 'khamenei', 'sadr', 'makarem', 'wahid', 'custom']) {
    assert.ok(ids.includes(required), `marja ${required} is present`);
  }
});

test('every marja except "custom" has a preset with the expected keys', () => {
  for (const m of marja.listMarjas()) {
    if (m.id === 'custom') {
      assert.equal(m.preset, null);
      continue;
    }
    assert.ok(m.preset, `${m.id} has a preset`);
    assert.ok(['Jafari', 'Tehran'].includes(m.preset.method),
      `${m.id} method is a Shia method (${m.preset.method})`);
    assert.equal(m.preset.fiqh, 'shia');
    assert.equal(m.preset.calendar, 'jafari');
    assert.ok(m.preset.maghribDelayMinutes >= 0 && m.preset.maghribDelayMinutes <= 60,
      `${m.id} maghribDelay is in range (${m.preset.maghribDelayMinutes})`);
    assert.ok(m.ar && m.ar.length > 0, `${m.id} has Arabic name`);
    assert.ok(m.en && m.en.length > 0, `${m.id} has English name`);
  }
});

test('isValidMarjaId accepts all listed, rejects unknown', () => {
  assert.ok(marja.isValidMarjaId('sistani'));
  assert.ok(marja.isValidMarjaId('custom'));
  assert.ok(!marja.isValidMarjaId('not-a-marja'));
  assert.ok(!marja.isValidMarjaId(''));
  assert.ok(!marja.isValidMarjaId(null));
});

test('getMarja returns frozen-ish copy so registry is safe', () => {
  const s = marja.getMarja('sistani');
  assert.ok(s);
  // listMarjas spreads preset so mutating returned doesn't affect registry
  s.preset.method = 'HACK';
  const s2 = marja.getMarja('sistani');
  assert.notEqual(s2.preset.method, 'HACK', 'registry unchanged');
});

test('custom marja has preset: null (no auto-apply)', () => {
  const c = marja.getMarja('custom');
  assert.equal(c.preset, null);
});
