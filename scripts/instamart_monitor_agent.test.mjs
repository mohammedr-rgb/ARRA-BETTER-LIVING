import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnknownSnapshot, escapeCsv, isFreshObservation } from './instamart_monitor_safe.mjs';

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
  assert.equal(escapeCsv('two\\nlines'), '"two\\nlines"');
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
