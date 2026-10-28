import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_CITIES, TARGET_SKUS } from './instamart_monitor_config.mjs';
import { sendAlertNotifications } from './notify_alerts.mjs';
import { fetchAuthorizedInstamartFeed } from './instamart_feed.mjs';

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

export function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function isFreshObservation(record, { now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!record || record.observationStatus !== 'VERIFIED' || !record.source || !record.observedAt) return false;
  const observedAt = Date.parse(record.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now || now - observedAt > maxAgeMs) return false;
  const hasPrice = Number.isFinite(record.sellingPrice) && record.sellingPrice > 0;
  const hasStock = typeof record.inStock === 'boolean';
  return hasPrice || hasStock;
}

export function applyVerifiedObservations(snapshot, observations, now = new Date()) {
  const byKey = new Map(observations.map(item => [`${item.cityId}_${item.skuId}`, item]));
  for (const [key, row] of Object.entries(snapshot.citySkuMatrix)) {
    const item = byKey.get(key);
    if (!item || !isFreshObservation(item, { now: now.getTime() })) continue;
    row.sellingPrice = item.sellingPrice;
    row.mrp = item.mrp;
    row.pricePerLiter = Number.isFinite(item.sellingPrice) ? Math.round(item.sellingPrice * 1000 / row.volumeMl * 100) / 100 : null;
    row.discount = Number.isFinite(item.mrp) && item.mrp > 0 && Number.isFinite(item.sellingPrice)
      ? Math.max(0, Math.round((1 - item.sellingPrice / item.mrp) * 100)) : null;
    row.inStock = item.inStock;
    row.stockStatus = item.inStock === true ? 'In Stock' : item.inStock === false ? 'Out of Stock' : 'Unknown';
    row.observationStatus = 'VERIFIED';
    row.source = item.source;
    row.sourceUrl = item.sourceUrl;
    row.observedAt = item.observedAt;
    row.lastVerifiedAt = item.observedAt;
  }
  const rows = Object.values(snapshot.citySkuMatrix);
  const verified = rows.filter(row => row.observationStatus === 'VERIFIED');
  const inStock = rows.filter(row => row.inStock === true).length;
  const outOfStock = rows.filter(row => row.inStock === false).length;
  const bottlePrices = verified.filter(row => row.volumeMl === 1000 && Number.isFinite(row.sellingPrice)).map(row => row.sellingPrice);
  snapshot.dataStatus = verified.length === rows.length ? 'VERIFIED' : verified.length ? 'PARTIAL' : 'UNVERIFIED';
  snapshot.sourceStatus = verified.length ? 'AUTHORIZED_FEED_OK' : snapshot.sourceStatus;
  snapshot.lastObservationAt = verified.length ? verified.reduce((latest, row) => !latest || row.observedAt > latest ? row.observedAt : latest, null) : null;
  snapshot.statusMessage = verified.length
    ? `Verified observations for ${verified.length} of ${rows.length} city/SKU pairs from the configured authorized feed.`
    : snapshot.statusMessage;
  snapshot.summary = {
    totalMonitoredPairs: rows.length,
    totalInStock: inStock,
    totalOos: outOfStock,
    totalUnknown: rows.length - inStock - outOfStock,
    avgBottle1LPrice: bottlePrices.length ? Math.round(bottlePrices.reduce((sum, price) => sum + price, 0) / bottlePrices.length * 100) / 100 : null
  };
  return snapshot;
}

export function detectVerifiedChanges(previous, current, now = new Date()) {
  if (!previous || !previous.citySkuMatrix) return [];
  const alerts = [];
  for (const [key, row] of Object.entries(current.citySkuMatrix || {})) {
    if (row.observationStatus !== 'VERIFIED') continue;
    const old = previous.citySkuMatrix[key];
    if (!old || !isFreshObservation(old, { now: now.getTime() })) continue;
    const base = {
      city: row.cityName, sku: row.skuName, source: row.source,
      sourceUrl: row.sourceUrl, observedAt: row.observedAt, observationStatus: 'VERIFIED'
    };
    if (Number.isFinite(old.sellingPrice) && Number.isFinite(row.sellingPrice) && old.sellingPrice !== row.sellingPrice) {
      alerts.push({ ...base, type: 'PRICE_CHANGE', message: `${row.skuName}: ₹${old.sellingPrice} → ₹${row.sellingPrice}` });
    }
    if (typeof old.inStock === 'boolean' && typeof row.inStock === 'boolean' && old.inStock !== row.inStock) {
      alerts.push({ ...base, type: 'STOCK_CHANGE', message: `${row.skuName}: ${old.inStock ? 'In Stock' : 'Out of Stock'} → ${row.inStock ? 'In Stock' : 'Out of Stock'}` });
    }
  }
  return alerts;
}

export function buildUnknownSnapshot(now = new Date()) {
  const runAt = now.toISOString();
  const date = runAt.slice(0, 10);
  const citySkuMatrix = {};
  for (const city of TARGET_CITIES) {
    for (const sku of TARGET_SKUS) {
      const key = `${city.id}_${sku.id}`;
      citySkuMatrix[key] = {
        date, cityId: city.id, cityName: city.name, area: city.area,
        deliveryMin: city.deliveryMin, state: city.state, lat: city.lat, lng: city.lng,
        radiusKm: city.radiusKm, darkStoreLocked: false,
        skuId: sku.id, skuName: sku.standardName, skuShortName: sku.shortName,
        packType: sku.packType, volumeMl: sku.volumeMl,
        mrp: null, sellingPrice: null, pricePerLiter: null, discount: null,
        inStock: null, stockStatus: 'Unknown', rating: null, isListed: null,
        observationStatus: 'UNVERIFIED', source: null, sourceUrl: null,
        observedAt: null, lastVerifiedAt: null, lastAttemptAt: runAt
      };
    }
  }
  return {
    lastUpdated: runAt,
    lastObservationAt: null,
    date,
    dataStatus: 'UNVERIFIED',
    sourceStatus: 'NO_LIVE_SOURCE_CONFIGURED',
    statusMessage: 'No authorized live Instamart data source is configured. Price, stock, listing and rating are unknown; no estimates are presented as observations.',
    targetCities: TARGET_CITIES,
    targetSkus: TARGET_SKUS,
    citySkuMatrix,
    alerts: [],
    summary: {
      totalMonitoredPairs: TARGET_CITIES.length * TARGET_SKUS.length,
      totalInStock: null,
      totalOos: null,
      totalUnknown: TARGET_CITIES.length * TARGET_SKUS.length,
      avgBottle1LPrice: null
    }
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sanitizeHistory(historyData) {
  const history = Array.isArray(historyData?.history) ? historyData.history : [];
  for (const entry of history) {
    if (entry.dataStatus === 'VERIFIED') continue;
    entry.dataStatus = 'LEGACY_UNVERIFIED';
    if (entry.citySkuMatrix && typeof entry.citySkuMatrix === 'object') {
      for (const row of Object.values(entry.citySkuMatrix)) {
        row.observationStatus = 'LEGACY_UNVERIFIED';
        row.lastVerifiedAt = null;
        row.mrp = null;
        row.darkStoreLocked = false;
        row.deliveryMin = null;
        row.radiusKm = null;
        delete row.premium;
        row.observedAt = null;
        row.sellingPrice = null;
        row.pricePerLiter = null;
        row.discount = null;
        row.inStock = null;
        row.stockStatus = 'Unknown';
        row.isListed = null;
        row.rating = null;
      }
    }
  }
  return { history };
}

const CSV_HEADERS = [
  'Date', 'City', 'Area', 'GPS_Latitude', 'GPS_Longitude', 'Coverage_Radius_KM',
  'Delivery_Time', 'SKU_ID', 'SKU_Name', 'Pack_Type', 'Volume_ML', 'MRP',
  'Selling_Price', 'Price_Per_Liter', 'Discount', 'Stock_Status',
  'Observation_Status', 'Observed_At', 'Source', 'Lowest_Competitor_Brand',
  'Lowest_Competitor_Price', 'Price_Difference', 'Competitor_Parity_Status'
];

export async function runInstamartMonitorAgent({ dataDir = path.resolve('public/data'), now = new Date() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const snapshotFile = path.join(dataDir, 'instamart_gems_gold_live.json');
  const historyFile = path.join(dataDir, 'instamart_daily_history.json');
  const csvFile = path.join(dataDir, 'instamart_gems_gold_25cities.csv');
  const marketSnapshotFile = path.join(dataDir, 'instamart_live_snapshot.json');
  const previousSnapshot = readJson(snapshotFile, null);
  let feedResult = { configured: false, observations: [], status: 'NO_AUTHORIZED_FEED_CONFIGURED' };
  let feedError = null;
  try {
    feedResult = await fetchAuthorizedInstamartFeed({
      cities: TARGET_CITIES, skus: TARGET_SKUS, now: now.getTime()
    });
  } catch (error) {
    feedError = error;
    console.error(`Authorized Instamart feed failed: ${error?.message || 'unknown error'}`);
  }

  const snapshot = buildUnknownSnapshot(now);
  snapshot.sourceStatus = feedError ? 'AUTHORIZED_FEED_ERROR' : feedResult.status;
  if (feedError) snapshot.statusMessage = 'The configured authorized feed could not be read. Current prices and stock are unknown; previous values are not carried forward.';
  if (feedResult.configured && !feedError) applyVerifiedObservations(snapshot, feedResult.observations, now);
  snapshot.alerts = detectVerifiedChanges(previousSnapshot, snapshot, now);
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  const competitorObservations = !feedError && feedResult.configured ? (feedResult.competitorObservations || []) : [];
  fs.writeFileSync(marketSnapshotFile, JSON.stringify({
    lastUpdated: snapshot.lastUpdated,
    dataStatus: competitorObservations.length ? 'VERIFIED' : 'UNVERIFIED',
    sourceStatus: feedError ? 'AUTHORIZED_FEED_ERROR' : feedResult.status,
    totalRecords: competitorObservations.length,
    records: competitorObservations
  }, null, 2) + '\n', 'utf8');

  const historyData = sanitizeHistory(readJson(historyFile, { history: [] }));
  historyData.history.push({
    date: snapshot.date, timestamp: snapshot.lastUpdated, dataStatus: snapshot.dataStatus,
    totalCities: TARGET_CITIES.length, citySkuMatrix: snapshot.citySkuMatrix
  });
  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2) + '\n', 'utf8');

  const market = readJson(marketSnapshotFile, { records: [] });
  const marketRecords = Array.isArray(market?.records)
    ? market.records.filter(record => isFreshObservation(record, { now: now.getTime() }))
    : [];
  const rows = Object.values(snapshot.citySkuMatrix).map(record => {
    const competitors = marketRecords.filter(item =>
      item.city === record.cityId && item.volumeMl === record.volumeMl &&
      item.brand !== "GEM'S GOLD" && Number.isFinite(item.sellingPrice)
    );
    const lowest = competitors.length
      ? competitors.reduce((min, item) => item.sellingPrice < min.sellingPrice ? item : min, competitors[0])
      : null;
    return [
      record.date, record.cityName, record.area, record.lat, record.lng, record.radiusKm,
      record.deliveryMin, record.skuId, record.skuName, record.packType, record.volumeMl,
      record.mrp, record.sellingPrice, record.pricePerLiter, record.discount, record.stockStatus,
      record.observationStatus, record.observedAt, record.source, lowest?.brand ?? '',
      lowest?.sellingPrice ?? '', '', 'N/A — unverified'
    ].map(escapeCsv).join(',');
  });
  fs.writeFileSync(csvFile, [CSV_HEADERS.map(escapeCsv).join(','), ...rows].join('\n') + '\n', 'utf8');

  const notificationResults = await sendAlertNotifications(snapshot.alerts, snapshot.summary);
  const report = {
    status: snapshot.dataStatus, sourceStatus: snapshot.sourceStatus,
    monitoredPairs: snapshot.summary.totalMonitoredPairs,
    verifiedPairs: Object.values(snapshot.citySkuMatrix).filter(row => row.observationStatus === 'VERIFIED').length,
    unknownPairs: snapshot.summary.totalUnknown, alertsDispatched: snapshot.alerts.length,
    notificationResults, snapshotFile, historyFile, csvFile
  };
  console.log(JSON.stringify(report, null, 2));
  if (feedError) process.exitCode = 1;
  return snapshot;
}
if (isDirectRun) {
  runInstamartMonitorAgent().catch(error => {
    console.error('Instamart monitor failed:', error?.message || error);
    process.exitCode = 1;
  });
}
