/**
 * Autonomous Instamart Price & Stock Monitor Agent
 * 
 * Features:
 * - Multi-city dark store geocoding & headless browser automation
 * - Extracts real-time MRP, Selling Price, Discounts, and Stock Status
 * - Categorizes and standardizes SKUs (Oils, Competitors, Pack Sizes)
 * - Outputs structured JSON for Dashboard (`public/data/instamart_live_snapshot.json`)
 * - Outputs CSV for Google Sheets sync (`public/data/instamart_parity_export.csv`)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Configuration: Target Hubs across Metros
const TARGET_HUBS = [
  { city: 'BANGALORE', area: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { city: 'CHENNAI', area: 'T Nagar', lat: 13.0418, lng: 80.2341 },
  { city: 'HYDERABAD', area: 'Gachibowli', lat: 17.4401, lng: 78.3489 },
  { city: 'MUMBAI', area: 'Andheri East', lat: 19.1136, lng: 72.8697 },
  { city: 'DELHI', area: 'South Delhi', lat: 28.5355, lng: 77.2500 }
];

// Target Search Keywords
const TARGET_QUERIES = [
  'wood pressed groundnut oil',
  'cold pressed coconut oil',
  'cold pressed sesame oil',
  'cold pressed mustard oil',
  'cold pressed sunflower oil'
];

// Extract SKU items recursively from nested Swiggy JSON
function extractItemsFromPayload(data) {
  const items = [];
  const seen = new Set();

  function recurse(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    // Check if this node is an Instamart item
    if (obj.skuId && obj.displayName) {
      if (!seen.has(obj.skuId)) {
        seen.add(obj.skuId);
        items.push(obj);
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      recurse(obj[key]);
    }
  }

  recurse(data);
  return items;
}

// Clean and normalize pack volume into Milliliters / Grams
function parsePackSize(str) {
  if (!str) return { raw: '1L', volumeMl: 1000 };
  const s = String(str).toLowerCase().trim();
  
  // 1 ltr x 2 = 2000ml
  const multiMatch = s.match(/([0-9.]+)\s*(?:ltr|l|liter|kg)\s*[x*]\s*([0-9]+)/);
  if (multiMatch) {
    const vol = parseFloat(multiMatch[1]) * 1000 * parseInt(multiMatch[2]);
    return { raw: str, volumeMl: vol };
  }

  // Liters
  const lMatch = s.match(/([0-9.]+)\s*(?:ltr|l|liter|litre)/);
  if (lMatch) {
    return { raw: str, volumeMl: parseFloat(lMatch[1]) * 1000 };
  }

  // ML
  const mlMatch = s.match(/([0-9]+)\s*ml/);
  if (mlMatch) {
    return { raw: str, volumeMl: parseFloat(mlMatch[1]) };
  }

  // KG
  const kgMatch = s.match(/([0-9.]+)\s*kg/);
  if (kgMatch) {
    return { raw: str, volumeMl: parseFloat(kgMatch[1]) * 1000 };
  }

  return { raw: str, volumeMl: 1000 };
}

// Determine standardized oil type
function detectOilType(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('groundnut') || t.includes('peanut')) return 'Groundnut Oil';
  if (t.includes('coconut')) return 'Coconut Oil';
  if (t.includes('sesame') || t.includes('gingelly') || t.includes('til')) return 'Sesame Oil';
  if (t.includes('mustard') || t.includes('sarson')) return 'Mustard Oil';
  if (t.includes('sunflower')) return 'Sunflower Oil';
  if (t.includes('olive')) return 'Olive Oil';
  if (t.includes('safflower') || t.includes('kardi')) return 'Safflower Oil';
  return 'Other Oil';
}

// Extract numeric price safely
function extractNumericPrice(priceObj) {
  if (!priceObj) return null;
  if (typeof priceObj === 'number') return priceObj;
  if (typeof priceObj === 'string') {
    const n = parseFloat(priceObj.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  }
  if (priceObj.units) {
    const u = parseFloat(priceObj.units);
    if (!isNaN(u)) {
      const nanos = priceObj.nanos ? priceObj.nanos / 1e9 : 0;
      return Math.round((u + nanos) * 100) / 100;
    }
  }
  return null;
}

async function runMonitorAgent() {
  const startTime = new Date();
  console.log(`\n======================================================`);
  console.log(`🤖 INSTAMART PRICE & STOCK MONITOR AGENT STARTED`);
  console.log(`📅 Timestamp: ${startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`🎯 Target Hubs: ${TARGET_HUBS.map(h => h.city).join(', ')}`);
  console.log(`🔍 Queries: ${TARGET_QUERIES.length} keywords`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const allRecords = [];

  for (const hub of TARGET_HUBS) {
    console.log(`\n------------------------------------------------------`);
    console.log(`📍 Processing Hub: ${hub.city} (${hub.area})`);
    console.log(`------------------------------------------------------`);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      geolocation: { latitude: hub.lat, longitude: hub.lng },
      permissions: ['geolocation']
    });

    for (const query of TARGET_QUERIES) {
      console.log(`  🔎 Searching [${hub.city}] for: "${query}"...`);
      const page = await context.newPage();
      let capturedPayload = null;

      const responseHandler = async (response) => {
        const url = response.url();
        if (url.includes('/api/instamart/search/v2') || (url.includes('/api/instamart/search') && !url.includes('suggestions'))) {
          try {
            const json = await response.json();
            if (json && json.data) {
              capturedPayload = json.data;
            }
          } catch {}
        }
      };

      page.on('response', responseHandler);

      try {
        const searchUrl = `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(2000);

        if (capturedPayload) {
          const rawItems = extractItemsFromPayload(capturedPayload);
          console.log(`     ✓ Found ${rawItems.length} items`);

          for (const item of rawItems) {
            const brand = (item.brandName || 'Generic').trim();
            const displayName = (item.displayName || '').trim();
            const packInfo = parsePackSize(item.quantityDescription);
            const oilType = detectOilType(displayName);

            const priceObj = item.price || item.pricing || {};
            const mrpUnits = extractNumericPrice(priceObj.mrp);
            const offerUnits = extractNumericPrice(priceObj.offerPrice) ?? mrpUnits;
            
            let discountDesc = priceObj.offerApplied?.listingDescription || '';
            if (!discountDesc && mrpUnits && offerUnits && mrpUnits > offerUnits) {
              const diffPct = Math.round(((mrpUnits - offerUnits) / mrpUnits) * 100);
              if (diffPct > 0) discountDesc = `${diffPct}% OFF`;
            }
            if (!discountDesc) discountDesc = '0%';
            
            const inStock = item.inventory?.inStock !== false;
            const lowStock = item.inventory?.lowStockText || '';
            const rating = item.rating?.value || null;
            const ratingCount = item.rating?.count || null;

            // Normalized Price per 1L (1000ml)
            let pricePerLiter = null;
            if (offerUnits && packInfo.volumeMl > 0) {
              pricePerLiter = Math.round((offerUnits / packInfo.volumeMl) * 1000);
            }

            allRecords.push({
              scanDate: startTime.toISOString().split('T')[0],
              scanTimestamp: startTime.toISOString(),
              platform: 'Instamart',
              city: hub.city,
              area: hub.area,
              query: query,
              skuId: item.skuId,
              brand: brand,
              productName: displayName,
              oilType: oilType,
              packSize: item.quantityDescription || packInfo.raw,
              volumeMl: packInfo.volumeMl,
              mrp: mrpUnits,
              sellingPrice: offerUnits,
              pricePerLiter: pricePerLiter,
              discount: discountDesc,
              inStock: inStock,
              stockStatus: inStock ? (lowStock ? `Low Stock (${lowStock})` : 'In Stock') : 'Out of Stock',
              rating: rating,
              ratingCount: ratingCount
            });
          }
        } else {
          console.log(`     ⚠️ No API response payload captured for "${query}" in ${hub.city}`);
        }
      } catch (err) {
        console.log(`     ❌ Query Error: ${err.message}`);
      } finally {
        await page.close();
      }

      // Polite delay between queries
      await new Promise(r => setTimeout(r, 1000));
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n======================================================`);
  console.log(`📊 TOTAL RECORDS EXTRACTED: ${allRecords.length}`);
  console.log(`======================================================\n`);

  // Deduplicate records by City + SkuId
  const uniqueRecordsMap = new Map();
  for (const r of allRecords) {
    const key = `${r.city}_${r.skuId}`;
    if (!uniqueRecordsMap.has(key)) {
      uniqueRecordsMap.set(key, r);
    }
  }
  const cleanRecords = Array.from(uniqueRecordsMap.values());
  console.log(`Unique SKU-City records after deduplication: ${cleanRecords.length}`);

  // Ensure public/data directory exists
  const dataDir = path.resolve('public/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 1. Write JSON Snapshot for Dashboard
  const snapshotFile = path.join(dataDir, 'instamart_live_snapshot.json');
  const snapshotData = {
    lastUpdated: startTime.toISOString(),
    totalRecords: cleanRecords.length,
    cities: TARGET_HUBS.map(h => h.city),
    records: cleanRecords
  };
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshotData, null, 2), 'utf8');
  console.log(`✅ Exported JSON snapshot to: ${snapshotFile}`);

  // 2. Write CSV for Google Sheets Parity Import
  const csvFile = path.join(dataDir, 'instamart_parity_export.csv');
  const csvHeaders = ['Date', 'City', 'Product', 'Brand', 'PackSize', 'MRP', 'SellingPrice', 'PricePerLiter', 'Discount', 'Availability', 'OilType', 'Platform'];
  const csvRows = cleanRecords.map(r => [
    r.scanDate,
    r.city,
    `"${r.productName.replace(/"/g, '""')}"`,
    `"${r.brand.replace(/"/g, '""')}"`,
    `"${r.packSize}"`,
    r.mrp || '',
    r.sellingPrice || '',
    r.pricePerLiter || '',
    `"${r.discount}"`,
    `"${r.stockStatus}"`,
    `"${r.oilType}"`,
    r.platform
  ]);
  const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
  fs.writeFileSync(csvFile, csvContent, 'utf8');
  console.log(`✅ Exported CSV to: ${csvFile}`);

  // 3. Print Market Intelligence Summary
  printExecutiveSummary(cleanRecords);
}

function printExecutiveSummary(records) {
  console.log(`\n======================================================`);
  console.log(`📈 INSTAMART MARKET INTELLIGENCE HIGHLIGHTS`);
  console.log(`======================================================`);

  // Brand count
  const brandMap = {};
  records.forEach(r => {
    brandMap[r.brand] = (brandMap[r.brand] || 0) + 1;
  });
  console.log('\nTop Brands in Instamart Catalog:');
  Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([b, cnt]) => console.log(` - ${b}: ${cnt} listings`));

  // City breakdown
  console.log('\nCity Listing Distribution:');
  const cityMap = {};
  records.forEach(r => {
    cityMap[r.city] = (cityMap[r.city] || 0) + 1;
  });
  Object.entries(cityMap).forEach(([c, cnt]) => console.log(` - ${c}: ${cnt} items`));

  // Price Parity Highlights
  const pricedItems = records.filter(r => r.sellingPrice > 0 && r.pricePerLiter > 0);
  if (pricedItems.length > 0) {
    const avgPricePerLiter = Math.round(pricedItems.reduce((s, r) => s + r.pricePerLiter, 0) / pricedItems.length);
    console.log(`\nAverage Selling Price per Liter (across all brands): ₹${avgPricePerLiter} / L`);
  }

  // Out of Stock items
  const oosItems = records.filter(r => !r.inStock || r.stockStatus.includes('Out of Stock'));
  console.log(`Total Out of Stock (OOS) items detected: ${oosItems.length} (${((oosItems.length / (records.length || 1)) * 100).toFixed(1)}%)`);

  console.log(`\n======================================================\n`);
}

runMonitorAgent().catch(err => {
  console.error('Fatal agent error:', err);
  process.exit(1);
});
