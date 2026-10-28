import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVerifiedObservations, buildUnknownSnapshot, detectVerifiedChanges, escapeCsv, isFreshObservation, upsertDailyHistory } from './instamart_monitor_safe.mjs';
import { normalizeAuthorizedFeedPayload } from './instamart_feed.mjs';
import { TARGET_CITIES, TARGET_SKUS } from './instamart_monitor_config.mjs';

test('monitor snapshot marks all target pairs unknown instead of fabricating observations', () => {
  const snapshot = buildUnknownSnapshot(new Date('2026-10-28T05:00:00.000Z'));
  assert.equal(snapshot.dataStatus, 'UNVERIFIED');
  assert.equal(snapshot.summary.totalMonitoredPairs, 125);
  assert.equal(snapshot.summary.totalUnknown, 125);
  assert.equal(snapshot.summary.totalInStock, null);
  assert.equal(snapshot.summary.totalOos, null);
  assert.equal(snapshot.summary.avgBottle1LPrice, null);
  for (const record of Object.values(snapshot.citySkuMatrix)) {
    assert.equal(record.sellingPrice, null);
    assert.equal(record.inStock, null);
    assert.equal(record.lastVerifiedAt, null);
    assert.equal(record.observationStatus, 'UNVERIFIED');
  }
  assert.deepEqual(snapshot.alerts, []);
});

test('CSV escaping handles commas, quotes and newlines', () => {
  assert.equal(escapeCsv('plain'), 'plain');
  assert.equal(escapeCsv('A, B'), '"A, B"');
  assert.equal(escapeCsv('say "hello"'), '"say ""hello"""');
  assert.equal(escapeCsv('two\nlines'), '"two\nlines"');
  assert.equal(escapeCsv(null), '');
});

test('freshness requires explicit verification, source and a recent observation time', () => {
  const now = Date.parse('2026-10-28T05:00:00.000Z');
  const good = {
    observationStatus: 'VERIFIED', source: 'authorized-feed',
    observedAt: '2026-10-28T04:00:00.000Z', sellingPrice: 199
  };
  assert.equal(isFreshObservation(good, { now }), true);
  assert.equal(isFreshObservation({ ...good, observedAt: '2026-10-26T00:00:00.000Z' }, { now }), false);
  assert.equal(isFreshObservation({ ...good, source: null }, { now }), false);
  assert.equal(isFreshObservation({ ...good, observationStatus: 'UNVERIFIED' }, { now }), false);
  assert.equal(isFreshObservation({ ...good, observedAt: '2026-10-29T00:00:00.000Z' }, { now }), false);
});

test('authorized feed accepts only fresh, matching city/SKU observations and keeps latest duplicate', () => {
  const now = Date.parse('2026-10-28T05:00:00.000Z');
  const payload = { observations: [
    { cityId: 'CHENNAI', skuId: 'pouch_1l', sellingPrice: 199, mrp: 249, inStock: true, observedAt: '2026-10-28T04:00:00.000Z', source: 'licensed-feed' },
    { cityId: 'CHENNAI', skuId: 'pouch_1l', sellingPrice: 189, mrp: 249, inStock: true, observedAt: '2026-10-28T04:30:00.000Z', source: 'licensed-feed' },
    { cityId: 'CHENNAI', skuId: 'pouch_1l', sellingPrice: 100, inStock: true, observedAt: '2026-10-20T00:00:00.000Z' },
    { cityId: 'UNKNOWN_CITY', skuId: 'pouch_1l', sellingPrice: 100, inStock: true, observedAt: '2026-10-28T04:00:00.000Z' },
    { cityId: 'CHENNAI', skuId: 'not-a-sku', sellingPrice: 100, inStock: true, observedAt: '2026-10-28T04:00:00.000Z' }
  ] };
  const observations = normalizeAuthorizedFeedPayload(payload, { cities: TARGET_CITIES, skus: TARGET_SKUS, now });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].sellingPrice, 189);
  assert.equal(observations[0].observationStatus, 'VERIFIED');
});

test('only verified observations populate the published snapshot', () => {
  const now = new Date('2026-10-28T05:00:00.000Z');
  const snapshot = buildUnknownSnapshot(now);
  const observation = {
    cityId: 'CHENNAI', skuId: 'pouch_1l', sellingPrice: 189, mrp: 249,
    inStock: true, observedAt: '2026-10-28T04:30:00.000Z',
    source: 'licensed-feed', sourceUrl: null, observationStatus: 'VERIFIED'
  };
  applyVerifiedObservations(snapshot, [observation], now);
  const row = snapshot.citySkuMatrix.CHENNAI_pouch_1l;
  assert.equal(row.sellingPrice, 189);
  assert.equal(row.inStock, true);
  assert.equal(row.observationStatus, 'VERIFIED');
  assert.equal(snapshot.dataStatus, 'PARTIAL');
  assert.equal(snapshot.summary.totalUnknown, 124);
});

test('price and stock alerts require a prior fresh verified observation', () => {
  const now = new Date('2026-10-28T05:00:00.000Z');
  const previous = buildUnknownSnapshot(now);
  const current = buildUnknownSnapshot(now);
  const old = previous.citySkuMatrix.CHENNAI_pouch_1l;
  Object.assign(old, { sellingPrice: 199, inStock: true, observationStatus: 'VERIFIED', source: 'licensed-feed', observedAt: '2026-10-28T04:00:00.000Z' });
  const row = current.citySkuMatrix.CHENNAI_pouch_1l;
  Object.assign(row, { sellingPrice: 189, inStock: false, observationStatus: 'VERIFIED', source: 'licensed-feed', observedAt: '2026-10-28T04:45:00.000Z' });
  const alerts = detectVerifiedChanges(previous, current, now);
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts.map(alert => alert.type).sort(), ['PRICE_CHANGE', 'STOCK_CHANGE']);
});

test('licensed competitor observations are validated and normalized separately', async () => {
  const { normalizeAuthorizedCompetitors } = await import('./instamart_feed.mjs');
  const now = Date.parse('2026-10-28T05:00:00.000Z');
  const records = normalizeAuthorizedCompetitors({
    competitors: [
      { cityId: 'COIMBATORE', brand: 'Example Oil', volumeMl: 1000, sellingPrice: 199, observedAt: '2026-10-28T04:00:00.000Z', source: 'licensed-provider' },
      { cityId: 'COIMBATORE', brand: "GEM'S GOLD", volumeMl: 1000, sellingPrice: 199, observedAt: '2026-10-28T04:00:00.000Z' },
      { cityId: 'COIMBATORE', brand: 'Stale Oil', volumeMl: 1000, sellingPrice: 199, observedAt: '2026-10-20T04:00:00.000Z' }
    ]
  }, { cities: TARGET_CITIES, now });
  assert.equal(records.length, 1);
  assert.equal(records[0].brand, 'Example Oil');
  assert.equal(records[0].observationStatus, 'VERIFIED');
});

test('target city IDs are normalized and daily history replaces same-day entries', () => {
  assert.equal(TARGET_CITIES.some(city => city.id === 'CENTRAL_GOA'), true);
  assert.equal(TARGET_CITIES.every(city => !city.id.includes(' ')), true);
  const first = buildUnknownSnapshot(new Date('2026-10-28T01:00:00.000Z'));
  const second = buildUnknownSnapshot(new Date('2026-10-28T02:00:00.000Z'));
  const history = upsertDailyHistory({ history: [] }, first);
  const updated = upsertDailyHistory(history, second);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].timestamp, second.lastUpdated);
});
