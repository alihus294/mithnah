const test = require('node:test');
const assert = require('node:assert/strict');
const { CITIES, nearestCity, approxDistanceKm } = require('../src/main/location/cities');

test('CITIES has >= 100 entries with required fields', () => {
  assert.ok(CITIES.length >= 100, `expected ≥100 cities, got ${CITIES.length}`);
  for (const c of CITIES) {
    assert.ok(Number.isFinite(c.lat) && c.lat >= -90 && c.lat <= 90, `${c.name} has valid lat`);
    assert.ok(Number.isFinite(c.lng) && c.lng >= -180 && c.lng <= 180, `${c.name} has valid lng`);
    assert.ok(c.name && c.nameAr, `${c.name} has bilingual names`);
    assert.ok(c.country && c.country.length === 2, `${c.name} has ISO country code`);
  }
});

test('CITIES includes Shia religious centers', () => {
  const names = CITIES.map(c => c.name);
  for (const required of ['Najaf', 'Karbala', 'Qom', 'Mashhad', 'Manama', 'Beirut',
                           'Sayyidah Zaynab', 'Kadhimiya', 'Samarra', 'Dearborn']) {
    assert.ok(names.includes(required), `city ${required} is present`);
  }
});

test('nearestCity finds Najaf for Najaf coordinates', () => {
  const r = nearestCity(32.0256, 44.3269);
  assert.ok(r);
  assert.equal(r.city.name, 'Najaf');
  assert.ok(r.distanceKm < 1, `distance from Najaf to Najaf is ${r.distanceKm} km`);
});

test('nearestCity finds Karbala for a point 2km from Karbala', () => {
  const r = nearestCity(32.62, 44.04);
  assert.ok(r);
  assert.equal(r.city.name, 'Karbala');
  assert.ok(r.distanceKm < 5);
});

test('nearestCity returns nearest even when far from any city', () => {
  // Point in the middle of the Sahara
  const r = nearestCity(22.0, 15.0);
  assert.ok(r);
  assert.ok(r.city.name, 'a city is returned');
  assert.ok(r.distanceKm > 500, 'acknowledged distance');
});

test('nearestCity returns null on invalid input', () => {
  assert.equal(nearestCity(null, null), null);
  assert.equal(nearestCity('abc', 'xyz'), null);
  assert.equal(nearestCity(NaN, NaN), null);
});

test('approxDistanceKm is symmetric and zero for same point', () => {
  const a = approxDistanceKm(32.0, 44.3, 35.7, 51.4);
  const b = approxDistanceKm(35.7, 51.4, 32.0, 44.3);
  assert.ok(Math.abs(a - b) < 0.01);
  assert.equal(approxDistanceKm(32, 44, 32, 44), 0);
});

test('approxDistanceKm matches known distances within 10%', () => {
  // Najaf → Karbala: ~77 km
  const najafToKarbala = approxDistanceKm(32.0256, 44.3269, 32.6149, 44.0240);
  assert.ok(najafToKarbala > 60 && najafToKarbala < 85,
    `Najaf→Karbala should be ~77 km, got ${najafToKarbala.toFixed(1)}`);
});
