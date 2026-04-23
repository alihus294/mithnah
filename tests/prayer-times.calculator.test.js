const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateForDate, PrayerCalculationError } = require('../src/main/prayer-times/calculator');
const { listMethods } = require('../src/main/prayer-times/methods');

// Reference times sourced from running the adhan library against known inputs
// at authoring time (2026-04-18). Values are stable across adhan 4.4.x. If
// these ever drift, verify by cross-checking with the IslamicFinder or Aladhan
// API for the same day/method/madhab, then update the expected values.

test('Makkah, Umm al-Qura, Shafi — 2026-04-18', () => {
  const result = calculateForDate({
    lat: 21.4225, lng: 39.8262,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  // UTC times (Makkah is UTC+3). All in UTC because that's what adhan returns.
  assert.equal(result.timesIso.fajr,    '2026-04-18T01:40:00.000Z');
  assert.equal(result.timesIso.sunrise, '2026-04-18T02:59:00.000Z');
  assert.equal(result.timesIso.dhuhr,   '2026-04-18T09:20:00.000Z');
  assert.equal(result.timesIso.asr,     '2026-04-18T12:44:00.000Z');
  assert.equal(result.timesIso.maghrib, '2026-04-18T15:41:00.000Z');
  assert.equal(result.timesIso.isha,    '2026-04-18T17:11:00.000Z');
});

test('Riyadh, Umm al-Qura — different prayer times than Makkah', () => {
  const riyadh = calculateForDate({
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  const makkah = calculateForDate({
    lat: 21.4225, lng: 39.8262,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  // Riyadh is ~750 km east of Makkah — everything earlier in UTC.
  assert.ok(riyadh.times.fajr.getTime() < makkah.times.fajr.getTime(),
    'Riyadh fajr should be earlier in UTC than Makkah');
  assert.ok(riyadh.times.maghrib.getTime() < makkah.times.maghrib.getTime(),
    'Riyadh maghrib should be earlier in UTC than Makkah');
});

test('Different methods produce different Isha times at same location/date', () => {
  const base = {
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    madhab: 'Shafi'
  };
  const uaq = calculateForDate({ ...base, method: 'UmmAlQura' });
  const mwl = calculateForDate({ ...base, method: 'MuslimWorldLeague' });
  const isna = calculateForDate({ ...base, method: 'NorthAmerica' });

  const ishas = [uaq.timesIso.isha, mwl.timesIso.isha, isna.timesIso.isha];
  assert.equal(new Set(ishas).size, 3, 'Expected 3 distinct Isha times across methods');
});

test('Hanafi madhab shifts Asr later than Shafi', () => {
  const shafi = calculateForDate({
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  const hanafi = calculateForDate({
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Hanafi'
  });
  assert.ok(hanafi.times.asr.getTime() > shafi.times.asr.getTime(),
    'Hanafi Asr should be later than Shafi Asr');
});

test('Jafari (Leva) method — Najaf 2026-04-18, known reference times', () => {
  const result = calculateForDate({
    lat: 32.0256, lng: 44.3269,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'Jafari',
    madhab: 'Shafi'
  });
  assert.equal(result.timesIso.fajr,    '2026-04-18T01:15:00.000Z');
  assert.equal(result.timesIso.sunrise, '2026-04-18T02:31:00.000Z');
  assert.equal(result.timesIso.dhuhr,   '2026-04-18T09:02:00.000Z');
  assert.equal(result.timesIso.asr,     '2026-04-18T12:40:00.000Z');
  assert.equal(result.timesIso.maghrib, '2026-04-18T15:49:00.000Z');
  assert.equal(result.timesIso.isha,    '2026-04-18T16:39:00.000Z');
  // Jafari Maghrib must be AFTER sunset (sun is 4° below horizon, i.e. red
  // sky has disappeared). This is the distinguishing feature of Shia methods.
  assert.ok(result.times.maghrib.getTime() > result.times.sunrise.getTime() + 10 * 3600 * 1000,
    'Maghrib must be well after sunrise (late afternoon)');
});

test('Jafari vs Umm al-Qura — Maghrib differs (Shia = sunset + red-sky delay)', () => {
  const jafari = calculateForDate({
    lat: 32.0256, lng: 44.3269,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'Jafari',
    madhab: 'Shafi'
  });
  const uaq = calculateForDate({
    lat: 32.0256, lng: 44.3269,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  // Jafari delays Maghrib a few minutes past sunset (4° below horizon).
  // Umm al-Qura uses astronomical sunset for Maghrib. So Jafari > UAQ.
  assert.ok(jafari.times.maghrib.getTime() > uaq.times.maghrib.getTime(),
    'Jafari Maghrib should be later than UAQ Maghrib (red-sky delay)');
  const deltaMinutes = (jafari.times.maghrib.getTime() - uaq.times.maghrib.getTime()) / 60000;
  assert.ok(deltaMinutes >= 1 && deltaMinutes <= 25,
    `Jafari Maghrib is a few minutes later than UAQ due to 4° angle (actual delta: ${deltaMinutes.toFixed(1)} min)`);
});

test('Tehran method — different angles produce different Fajr than Jafari', () => {
  // Tehran: Fajr 17.7°, Jafari: Fajr 16°. At same location+date, Tehran's
  // Fajr should be slightly earlier (larger angle = darker = earlier).
  const base = {
    lat: 32.0256, lng: 44.3269,
    date: new Date(Date.UTC(2026, 3, 18)),
    madhab: 'Shafi'
  };
  const tehran = calculateForDate({ ...base, method: 'Tehran' });
  const jafari = calculateForDate({ ...base, method: 'Jafari' });
  assert.ok(tehran.times.fajr.getTime() < jafari.times.fajr.getTime(),
    'Tehran Fajr (17.7°) should be earlier than Jafari Fajr (16°)');
});

test('Manual adjustments shift times by exact minutes', () => {
  const base = calculateForDate({
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi'
  });
  const adjusted = calculateForDate({
    lat: 24.7136, lng: 46.6753,
    date: new Date(Date.UTC(2026, 3, 18)),
    method: 'UmmAlQura',
    madhab: 'Shafi',
    adjustmentsMinutes: { fajr: -5, isha: 10 }
  });
  assert.equal(
    adjusted.times.fajr.getTime() - base.times.fajr.getTime(),
    -5 * 60 * 1000,
    'Fajr should shift by -5 minutes'
  );
  assert.equal(
    adjusted.times.isha.getTime() - base.times.isha.getTime(),
    10 * 60 * 1000,
    'Isha should shift by +10 minutes'
  );
});

test('Polar-latitude input is rejected, not silently NaN', () => {
  assert.throws(() => {
    calculateForDate({
      lat: 78.2232, lng: 15.6267, // Longyearbyen, Svalbard
      date: new Date(Date.UTC(2026, 3, 18)),
      method: 'MuslimWorldLeague',
      madhab: 'Shafi'
    });
  }, (err) => err instanceof PrayerCalculationError && err.code === 'POLAR_LAT');
});

test('Invalid lat/lng types are rejected', () => {
  assert.throws(() => {
    calculateForDate({ lat: 'x', lng: 0, date: new Date(), method: 'UmmAlQura', madhab: 'Shafi' });
  }, (err) => err.code === 'BAD_LOCATION');
  assert.throws(() => {
    calculateForDate({ lat: 91, lng: 0, date: new Date(), method: 'UmmAlQura', madhab: 'Shafi' });
  }, (err) => err.code === 'BAD_LOCATION');
});

test('Unknown method is rejected', () => {
  assert.throws(() => {
    calculateForDate({
      lat: 24.7, lng: 46.7, date: new Date(), method: 'NotARealMethod', madhab: 'Shafi'
    });
  }, (err) => err.code === 'BAD_METHOD');
});

test('listMethods returns Auto + 15 concrete methods with required metadata', () => {
  const methods = listMethods();
  assert.equal(methods.length, 16, 'Auto + Jafari (Leva) + JafariWide + QatifShia + Tehran + 11 Sunni methods');
  for (const m of methods) {
    assert.ok(m.id, 'method has id');
    assert.ok(m.en, 'method has English name');
    assert.ok(m.ar, 'method has Arabic name');
    assert.ok(m.description, 'method has description');
    assert.ok(m.fiqh === 'shia' || m.fiqh === 'sunni' || m.fiqh === 'auto', 'method has fiqh');
    assert.ok(!('factory' in m), 'method factory must not be exported');
  }
  // First option is Auto (detect from GPS); four Shia variants come
  // next in order: Leva (Qom, 16°/14°/4°), JafariWide (astronomical
  // 18°/14°/4°), QatifShia (field-observed 15.5°/+90min/4°), Tehran
  // (Iran, 17.7°/14°/4.5°).
  assert.equal(methods[0].id, 'Auto');
  assert.equal(methods[1].id, 'Jafari');
  assert.equal(methods[2].id, 'JafariWide');
  assert.equal(methods[3].id, 'QatifShia');
  assert.equal(methods[4].id, 'Tehran');
});
