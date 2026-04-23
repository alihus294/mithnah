const test = require('node:test');
const assert = require('node:assert/strict');
const { detectFromTimezone, validateCoordinates, getSystemTimezone } = require('../src/main/location');
const { TIMEZONES, lookup, GLOBAL_FALLBACK } = require('../src/main/location/timezone-table');

test('getSystemTimezone returns a non-empty string on a normal machine', () => {
  const tz = getSystemTimezone();
  // Won't assert a specific value — machine-dependent. Just that the API works.
  assert.ok(typeof tz === 'string' && tz.length > 0, 'got a timezone string');
});

test('TIMEZONES table covers the major Shia-majority regions', () => {
  for (const tz of ['Asia/Baghdad', 'Asia/Tehran', 'Asia/Beirut', 'Asia/Bahrain', 'Asia/Baku']) {
    assert.ok(lookup(tz), `timezone ${tz} is present in table`);
  }
  // Baghdad maps to Najaf (Shia-significant default), not Baghdad proper.
  assert.equal(TIMEZONES['Asia/Baghdad'].name, 'Najaf');
});

test('lookup returns null for unknown timezone', () => {
  assert.equal(lookup('Mars/Olympus'), null);
  assert.equal(lookup(''), null);
  assert.equal(lookup(null), null);
  assert.equal(lookup(undefined), null);
});

test('GLOBAL_FALLBACK is Najaf (Shia Twelver default for unrecognized timezone)', () => {
  assert.equal(GLOBAL_FALLBACK.name, 'Najaf');
  assert.equal(GLOBAL_FALLBACK.country, 'IQ');
  assert.ok(Number.isFinite(GLOBAL_FALLBACK.lat));
  assert.ok(Number.isFinite(GLOBAL_FALLBACK.lng));
});

test('detectFromTimezone returns a complete location record', () => {
  const r = detectFromTimezone();
  assert.ok(typeof r.lat === 'number');
  assert.ok(typeof r.lng === 'number');
  assert.ok(typeof r.name === 'string' && r.name.length > 0);
  assert.ok(typeof r.nameAr === 'string' && r.nameAr.length > 0);
  assert.ok(r.source === 'timezone' || r.source === 'fallback');
});

test('validateCoordinates accepts valid lat/lng pairs', () => {
  assert.deepEqual(validateCoordinates(32.0, 44.3), { lat: 32.0, lng: 44.3 });
  assert.deepEqual(validateCoordinates('32.0', '44.3'), { lat: 32.0, lng: 44.3 }, 'string numbers are coerced');
  assert.deepEqual(validateCoordinates(-33.8, 151.2), { lat: -33.8, lng: 151.2 }, 'southern hemisphere');
});

test('validateCoordinates rejects bad inputs', () => {
  assert.throws(() => validateCoordinates('x', 0), /finite numbers/);
  assert.throws(() => validateCoordinates(NaN, 0), /finite numbers/);
  assert.throws(() => validateCoordinates(91, 0), /lat out of range/);
  assert.throws(() => validateCoordinates(-91, 0), /lat out of range/);
  assert.throws(() => validateCoordinates(0, 181), /lng out of range/);
  assert.throws(() => validateCoordinates(0, -181), /lng out of range/);
});

test('validateCoordinates rejects Null Island (0, 0)', () => {
  assert.throws(() => validateCoordinates(0, 0), /Null Island|not a valid/);
});

test('validateCoordinates rejects booleans and null', () => {
  assert.throws(() => validateCoordinates(true, 44.3), /must be a number/);
  assert.throws(() => validateCoordinates(32, false), /must be a number/);
  assert.throws(() => validateCoordinates(null, 44.3), /must be a number/);
  assert.throws(() => validateCoordinates(32, null), /must be a number/);
  assert.throws(() => validateCoordinates(undefined, 44.3), /must be a number/);
});

test('validateCoordinates rejects arrays and objects', () => {
  assert.throws(() => validateCoordinates([32, 44], 0), /must be a number/);
  assert.throws(() => validateCoordinates({ lat: 32 }, 0), /must be a number/);
});
