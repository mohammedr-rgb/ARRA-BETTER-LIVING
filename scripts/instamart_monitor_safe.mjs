import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_CITIES, TARGET_SKUS } from './instamart_monitor_config.mjs';
import { sendAlertNotifications } from './notify_alerts.mjs';

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

export function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\\r\\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function isFreshObservation(record, { now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!record || record.observationStatus !== 'VERIFIED' || !record.source || !record.observedAt) return false;
  const observedAt = Date.parse(record.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now || now - observedAt > maxAgeMs) return false;
  const hasPrice = Number.isFinite(record.sellingPrice) && record.sellingPrice > 0;
  const hasStock = typeof record.inStock === 'boolean';
  return hasPrice || hasStock;
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

  const snapshot = buildUnknownSnapshot(now);
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2) + '\\n', 'utf8');

  const historyData = sanitizeHistory(readJson(historyFile, { history: [] }));
  historyData.history.push({
    date: snapshot.date,
    timestamp: snapshot.lastUpdated,
    dataStatus: 'UNVERIFIED',
    totalCities: TARGET_CITIES.length,
    citySkuMatrix: snapshot.citySkuMatrix
  });
  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2) + '\\n', 'utf8');

  // Competitor data is usable only when it carries explicit, recent source evidence.
  const market = readJson(marketSnapshotFile, { records: [] });
  const marketRecords = Array.isArray(market?.records)
    ? market.records.filter(record => isFreshObservation(record, { now: Date.parse(snapshot.lastUpdated) }))
    : [];

  const rows = Object.values(snapshot.citySkuMatrix).map(record => {
    const competitors = marketRecords.filter(item =>
      item.city === record.cityId &&
      item.volumeMl === record.volumeMl &&
      item.brand !== "GEM'S GOLD" &&
      Number.isFinite(item.sellingPrice)
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
  fs.writeFileSync(csvFile, [CSV_HEADERS.map(escapeCsv).join(','), ...rows].join('\\n') + '\\n', 'utf8');

  // No verified observations means no stock/price alerts. Do not replay historical alerts.
  const notificationResults = await sendAlertNotifications([], snapshot.summary);
  console.log(JSON.stringify({
    status: snapshot.dataStatus,
    monitoredPairs: snapshot.summary.totalMonitoredPairs,
    unknownPairs: snapshot.summary.totalUnknown,
    alertsDispatched: 0,
    notificationResults,
    snapshotFile,
    historyFile,
    csvFile
  }, null, 2));
  return snapshot;
}

if (isDirectRun) {
  runInstamartMonitorAgent().catch(error => {
    console.error('Instamart monitor failed:', error?.message || error);
    process.exitCode = 1;
  });
}
