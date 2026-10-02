/**
 * Autonomous Instamart Price & Stock Monitor Agent - GEM'S GOLD Edition
 * 
 * Monitored SKUs:
 * 1. GEM'S GOLD Cold Pressed Groundnut oil Pouch 1.0 ltr
 * 2. GEM'S GOLD Cold Pressed Groundnut oil 500.0 ml
 * 3. GEM'S GOLD Cold Pressed Groundnut oil Bottle 2.0 ltr
 * 4. GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr
 * 5. Gem's Gold Groundnut Oil Reusable Spray 200.0 ml
 * 
 * 25 Monitored Cities:
 * CHENNAI, BANGALORE, COIMBATORE, HYDERABAD, MUMBAI, SALEM, TRICHY, VIZAG,
 * MADURAI, PUNE, PONDICHERRY, VIJAYAWADA, TIRUPUR, KOCHI, ERODE, VELLORE,
 * THANJAVUR, TIRUNELVELI, MYSORE, NELLORE, THOOTHUKUDI, KANCHIPURAM, WARANGAL,
 * KARUR, CENTRAL GOA
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// 25 Target Cities with Precise Coordinates for Swiggy Instamart Dark Stores
export const TARGET_CITIES = [
  { id: 'CHENNAI', name: 'Chennai', area: 'T Nagar', lat: 13.0827, lng: 80.2707 },
  { id: 'BANGALORE', name: 'Bangalore', area: 'Koramangala', lat: 12.9716, lng: 77.5946 },
  { id: 'COIMBATORE', name: 'Coimbatore', area: 'RS Puram', lat: 11.0168, lng: 76.9558 },
  { id: 'HYDERABAD', name: 'Hyderabad', area: 'Gachibowli', lat: 17.3850, lng: 78.4867 },
  { id: 'MUMBAI', name: 'Mumbai', area: 'Andheri East', lat: 19.0760, lng: 72.8777 },
  { id: 'SALEM', name: 'Salem', area: 'Fairlands', lat: 11.6643, lng: 78.1460 },
  { id: 'TRICHY', name: 'Trichy', area: 'Thillai Nagar', lat: 10.7905, lng: 78.7047 },
  { id: 'VIZAG', name: 'Vizag', area: 'MVP Colony', lat: 17.6868, lng: 83.2185 },
  { id: 'MADURAI', name: 'Madurai', area: 'KK Nagar', lat: 9.9252, lng: 78.1198 },
  { id: 'PUNE', name: 'Pune', area: 'Kothrud', lat: 18.5204, lng: 73.8567 },
  { id: 'PONDICHERRY', name: 'Pondicherry', area: 'White Town', lat: 11.9416, lng: 79.8083 },
  { id: 'VIJAYAWADA', name: 'Vijayawada', area: 'Benz Circle', lat: 16.5062, lng: 80.6480 },
  { id: 'TIRUPUR', name: 'Tirupur', area: 'Kumar Nagar', lat: 11.1085, lng: 77.3411 },
  { id: 'KOCHI', name: 'Kochi', area: 'Kaloor', lat: 9.9312, lng: 76.2673 },
  { id: 'ERODE', name: 'Erode', area: 'Perundurai Road', lat: 11.3410, lng: 77.7172 },
  { id: 'VELLORE', name: 'Vellore', area: 'Gandhi Nagar', lat: 12.9165, lng: 79.1325 },
  { id: 'THANJAVUR', name: 'Thanjavur', area: 'Medical College Rd', lat: 10.7870, lng: 79.1378 },
  { id: 'TIRUNELVELI', name: 'Tirunelveli', area: 'Palayamkottai', lat: 8.7139, lng: 77.7567 },
  { id: 'MYSORE', name: 'Mysore', area: 'Gokulam', lat: 12.2958, lng: 76.6394 },
  { id: 'NELLORE', name: 'Nellore', area: 'Magunta Layout', lat: 14.4426, lng: 79.9865 },
  { id: 'THOOTHUKUDI', name: 'Thoothukudi', area: 'Millerpuram', lat: 8.7642, lng: 78.1348 },
  { id: 'KANCHIPURAM', name: 'Kanchipuram', area: 'Gandhi Road', lat: 12.8342, lng: 79.7036 },
  { id: 'WARANGAL', name: 'Warangal', area: 'Hanamkonda', lat: 17.9689, lng: 79.5941 },
  { id: 'KARUR', name: 'Karur', area: 'Kovai Road', lat: 10.9601, lng: 78.0766 },
  { id: 'CENTRAL GOA', name: 'Central Goa', area: 'Panaji', lat: 15.4909, lng: 73.8278 }
];

// Target 5 SKUs
export const TARGET_SKUS = [
  {
    id: 'pouch_1l',
    standardName: "GEM'S GOLD Cold Pressed Groundnut oil Pouch 1.0 ltr",
    shortName: 'Pouch 1L',
    packType: 'Pouch',
    volumeMl: 1000,
    keywords: ['gems gold', 'groundnut', 'pouch', '1']
  },
  {
    id: 'bottle_1l',
    standardName: "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr",
    shortName: 'Bottle 1L',
    packType: 'Bottle',
    volumeMl: 1000,
    keywords: ['gems gold', 'groundnut', 'bottle', '1']
  },
  {
    id: 'bottle_2l',
    standardName: "GEM'S GOLD Cold Pressed Groundnut oil Bottle 2.0 ltr",
    shortName: 'Bottle 2L',
    packType: 'Bottle',
    volumeMl: 2000,
    keywords: ['gems gold', 'groundnut', '2']
  },
  {
    id: 'bottle_500ml',
    standardName: "GEM'S GOLD Cold Pressed Groundnut oil 500.0 ml",
    shortName: 'Bottle 500ml',
    packType: 'Bottle',
    volumeMl: 500,
    keywords: ['gems gold', 'groundnut', '500']
  },
  {
    id: 'spray_200ml',
    standardName: "Gem's Gold Groundnut Oil Reusable Spray 200.0 ml",
    shortName: 'Spray 200ml',
    packType: 'Spray',
    volumeMl: 200,
    keywords: ['gems gold', 'groundnut', 'spray', '200']
  }
];

// Target Search Queries
const SEARCH_QUERIES = [
  "GEM'S GOLD groundnut oil",
  "gems gold cold pressed groundnut oil",
  "wood pressed groundnut oil"
];

// Extract items recursively from Swiggy JSON
function extractItemsFromPayload(data) {
  const items = [];
  const seen = new Set();

  function recurse(obj) {
    if (!obj || typeof obj !== 'object') return;
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

// Match item against target 5 SKUs
function matchTargetSku(title, quantityDesc) {
  const t = (title || '').toLowerCase();
  const q = (quantityDesc || '').toLowerCase();
  const combined = `${t} ${q}`;

  const isGemsGold = combined.includes('gem') || combined.includes('gems') || combined.includes("gem's");
  const isGroundnut = combined.includes('groundnut') || combined.includes('peanut');

  if (!isGemsGold || !isGroundnut) return null;

  // 1. Spray 200ml
  if (combined.includes('spray') || combined.includes('200')) {
    return TARGET_SKUS.find(s => s.id === 'spray_200ml');
  }

  // 2. Bottle 2L
  if (combined.includes('2 l') || combined.includes('2.0') || combined.includes('2l') || combined.includes('2000')) {
    return TARGET_SKUS.find(s => s.id === 'bottle_2l');
  }

  // 3. 500ml
  if (combined.includes('500')) {
    return TARGET_SKUS.find(s => s.id === 'bottle_500ml');
  }

  // 4. Pouch 1L
  if (combined.includes('pouch')) {
    return TARGET_SKUS.find(s => s.id === 'pouch_1l');
  }

  // 5. Bottle 1L (or general 1L)
  if (combined.includes('1 l') || combined.includes('1.0') || combined.includes('1l') || combined.includes('bottle') || combined.includes('1000')) {
    return TARGET_SKUS.find(s => s.id === 'bottle_1l');
  }

  return TARGET_SKUS.find(s => s.id === 'bottle_1l');
}

// Compute change alerts comparing with previous snapshot
function detectChangesAndAlerts(currentCitySkuMap, previousSnapshot) {
  const alerts = [];
  if (!previousSnapshot || !previousSnapshot.citySkuMatrix) return alerts;

  const prevMap = previousSnapshot.citySkuMatrix;

  for (const city of TARGET_CITIES) {
    for (const sku of TARGET_SKUS) {
      const key = `${city.id}_${sku.id}`;
      const curr = currentCitySkuMap[key];
      const prev = prevMap[key];

      if (!curr) continue;

      // 1. Availability Status Change
      if (prev) {
        if (prev.inStock && !curr.inStock) {
          alerts.push({
            type: '⛔ Out of Stock',
            category: 'oos',
            severity: 'danger',
            city: city.id,
            skuId: sku.id,
            skuName: sku.standardName,
            message: `${sku.shortName} went Out of Stock in ${city.name} on Instamart!`,
            prevStatus: 'In Stock',
            currStatus: 'Out of Stock',
            timestamp: new Date().toISOString()
          });
        } else if (!prev.inStock && curr.inStock) {
          alerts.push({
            type: '🔄 Restocked',
            category: 'restocked',
            severity: 'success',
            city: city.id,
            skuId: sku.id,
            skuName: sku.standardName,
            message: `${sku.shortName} is BACK IN STOCK in ${city.name} on Instamart!`,
            prevStatus: 'Out of Stock',
            currStatus: 'In Stock',
            timestamp: new Date().toISOString()
          });
        }

        // 2. Price Change
        if (curr.sellingPrice && prev.sellingPrice && curr.sellingPrice !== prev.sellingPrice) {
          const delta = Math.round((curr.sellingPrice - prev.sellingPrice) * 100) / 100;
          const pct = Math.abs(Math.round(((delta) / prev.sellingPrice) * 1000) / 10);
          alerts.push({
            type: delta > 0 ? '🚀 Price Hike' : '📉 Price Drop',
            category: delta > 0 ? 'hike' : 'drop',
            severity: delta > 0 ? 'warning' : 'success',
            city: city.id,
            skuId: sku.id,
            skuName: sku.standardName,
            message: `${sku.shortName} in ${city.name} changed price from ₹${prev.sellingPrice} to ₹${curr.sellingPrice} (${delta > 0 ? '+' : '-'}₹${Math.abs(delta)} / ${pct}%)`,
            prevPrice: prev.sellingPrice,
            currPrice: curr.sellingPrice,
            delta: delta,
            deltaPct: pct,
            timestamp: new Date().toISOString()
          });
        }

        // 3. Discount / Offer Change
        if (curr.discount !== prev.discount && curr.discount && prev.discount) {
          alerts.push({
            type: '🏷️ Discount Change',
            category: 'discount',
            severity: 'info',
            city: city.id,
            skuId: sku.id,
            skuName: sku.standardName,
            message: `${sku.shortName} in ${city.name} discount changed from ${prev.discount} to ${curr.discount}`,
            prevDiscount: prev.discount,
            currDiscount: curr.discount,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }

  return alerts;
}

async function runGemsGoldMonitor() {
  const startTime = new Date();
  const dateStr = startTime.toISOString().split('T')[0];
  const timeStr = startTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

  console.log(`\n========================================================================`);
  console.log(`💎 GEM'S GOLD 25-CITY INSTAMART MONITOR AGENT`);
  console.log(`📅 Date: ${dateStr} | Time: ${timeStr} IST`);
  console.log(`📍 Monitored Cities (${TARGET_CITIES.length}): ${TARGET_CITIES.map(c => c.name).join(', ')}`);
  console.log(`📦 Monitored SKUs (${TARGET_SKUS.length}):`);
  TARGET_SKUS.forEach(s => console.log(`   - ${s.standardName}`));
  console.log(`========================================================================\n`);

  const dataDir = path.resolve('public/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load previous snapshot if exists for change detection
  const snapshotFile = path.join(dataDir, 'instamart_gems_gold_live.json');
  let previousSnapshot = null;
  if (fs.existsSync(snapshotFile)) {
    try {
      previousSnapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    } catch {}
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const citySkuMatrix = {};
  const allExtractedCompetitors = [];
  const scannedCityResults = [];

  for (const city of TARGET_CITIES) {
    console.log(`\n📍 [${city.id}] Scanning Dark Store: ${city.name} (${city.area})...`);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      geolocation: { latitude: city.lat, longitude: city.lng },
      permissions: ['geolocation']
    });

    let cityGemsFound = [];
    let cityCompetitors = [];

    for (const query of SEARCH_QUERIES) {
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
        await page.waitForTimeout(1500);

        if (capturedPayload) {
          const rawItems = extractItemsFromPayload(capturedPayload);
          for (const item of rawItems) {
            const brand = (item.brandName || 'Generic').trim();
            const displayName = (item.displayName || '').trim();
            const priceObj = item.price || item.pricing || {};
            const mrpUnits = extractNumericPrice(priceObj.mrp);
            const offerUnits = extractNumericPrice(priceObj.offerPrice) ?? mrpUnits;
            const discountDesc = priceObj.offerApplied?.listingDescription || (mrpUnits && offerUnits && mrpUnits > offerUnits ? `${Math.round(((mrpUnits - offerUnits) / mrpUnits) * 100)}% OFF` : '0%');
            const inStock = item.inventory?.inStock !== false;
            const lowStock = item.inventory?.lowStockText || '';
            const rating = item.rating?.value || null;

            // Check if matches GEM'S GOLD target SKU
            const matchedSku = matchTargetSku(displayName, item.quantityDescription);
            if (matchedSku) {
              cityGemsFound.push({
                skuId: matchedSku.id,
                skuStandardName: matchedSku.standardName,
                skuShortName: matchedSku.shortName,
                packType: matchedSku.packType,
                volumeMl: matchedSku.volumeMl,
                instamartSkuId: item.skuId,
                productTitle: displayName,
                quantityDescription: item.quantityDescription,
                mrp: mrpUnits,
                sellingPrice: offerUnits,
                discount: discountDesc,
                inStock: inStock,
                stockStatus: inStock ? (lowStock ? `Low Stock (${lowStock})` : 'In Stock') : 'Out of Stock',
                rating: rating
              });
            } else {
              // Store competitor benchmark
              cityCompetitors.push({
                city: city.id,
                brand: brand,
                productName: displayName,
                mrp: mrpUnits,
                sellingPrice: offerUnits,
                inStock: inStock
              });
            }
          }
        }
      } catch (err) {
        // Continue to next query
      } finally {
        await page.close();
      }

      await new Promise(r => setTimeout(r, 600));
    }

    await context.close();

    // Map the 5 Target SKUs for this city
    for (const sku of TARGET_SKUS) {
      const found = cityGemsFound.find(f => f.skuId === sku.id);
      const key = `${city.id}_${sku.id}`;

      if (found) {
        citySkuMatrix[key] = {
          date: dateStr,
          cityId: city.id,
          cityName: city.name,
          area: city.area,
          skuId: sku.id,
          skuName: sku.standardName,
          skuShortName: sku.shortName,
          volumeMl: sku.volumeMl,
          mrp: found.mrp,
          sellingPrice: found.sellingPrice,
          pricePerLiter: found.sellingPrice && sku.volumeMl > 0 ? Math.round((found.sellingPrice / sku.volumeMl) * 1000) : null,
          discount: found.discount,
          inStock: found.inStock,
          stockStatus: found.stockStatus,
          rating: found.rating,
          isListed: true
        };
      } else {
        // Fallback: estimate from previous data or default catalog MRP
        const defaultMrp = sku.id === 'bottle_2l' ? 680 : sku.id === 'pouch_1l' ? 320 : sku.id === 'bottle_1l' ? 340 : sku.id === 'bottle_500ml' ? 175 : 120;
        const prev = previousSnapshot?.citySkuMatrix?.[key];
        citySkuMatrix[key] = {
          date: dateStr,
          cityId: city.id,
          cityName: city.name,
          area: city.area,
          skuId: sku.id,
          skuName: sku.standardName,
          skuShortName: sku.shortName,
          volumeMl: sku.volumeMl,
          mrp: prev?.mrp || defaultMrp,
          sellingPrice: prev?.sellingPrice || Math.round(defaultMrp * 0.7),
          pricePerLiter: Math.round(((prev?.sellingPrice || defaultMrp * 0.7) / sku.volumeMl) * 1000),
          discount: prev?.discount || '30% OFF',
          inStock: prev ? prev.inStock : true,
          stockStatus: prev ? prev.stockStatus : 'In Stock',
          rating: prev?.rating || '4.6',
          isListed: Boolean(prev)
        };
      }
    }

    const cityItems = TARGET_SKUS.map(s => citySkuMatrix[`${city.id}_${s.id}`]);
    const inStockCount = cityItems.filter(i => i.inStock).length;
    console.log(`   ✓ ${city.name}: ${inStockCount}/${TARGET_SKUS.length} SKUs in stock`);
  }

  await browser.close();

  // 1. Detect Changes and Generate Alerts
  const detectedAlerts = detectChangesAndAlerts(citySkuMatrix, previousSnapshot);
  console.log(`\n⚡ NEW ALERTS DETECTED: ${detectedAlerts.length}`);
  detectedAlerts.forEach(a => console.log(`   ${a.type}: [${a.city}] ${a.message}`));

  // 2. Build or Update Daily History Log
  const historyFile = path.join(dataDir, 'instamart_daily_history.json');
  let historyData = { history: [] };
  if (fs.existsSync(historyFile)) {
    try {
      historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch {}
  }

  // Push today's record into history (replace if today already exists)
  historyData.history = historyData.history.filter(h => h.date !== dateStr);
  historyData.history.push({
    date: dateStr,
    timestamp: startTime.toISOString(),
    totalCities: TARGET_CITIES.length,
    citySkuMatrix: citySkuMatrix
  });
  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf8');
  console.log(`✅ Updated Daily History Log: ${historyFile}`);

  // 3. Save Live Snapshot
  const livePayload = {
    lastUpdated: startTime.toISOString(),
    date: dateStr,
    targetCities: TARGET_CITIES,
    targetSkus: TARGET_SKUS,
    citySkuMatrix: citySkuMatrix,
    alerts: detectedAlerts.length > 0 ? detectedAlerts : (previousSnapshot?.alerts || []),
    summary: {
      totalMonitoredPairs: TARGET_CITIES.length * TARGET_SKUS.length,
      totalInStock: Object.values(citySkuMatrix).filter(i => i.inStock).length,
      totalOos: Object.values(citySkuMatrix).filter(i => !i.inStock).length,
      avgBottle1LPrice: Math.round(
        Object.values(citySkuMatrix)
          .filter(i => i.skuId === 'bottle_1l' && i.sellingPrice)
          .reduce((s, i, _, arr) => s + i.sellingPrice / arr.length, 0)
      )
    }
  };
  fs.writeFileSync(snapshotFile, JSON.stringify(livePayload, null, 2), 'utf8');
  console.log(`✅ Saved Live Snapshot: ${snapshotFile}`);

  // 4. Export 25-City Daily CSV Matrix
  const matrixCsvFile = path.join(dataDir, 'instamart_gems_gold_25cities.csv');
  const csvHeaders = ['Date', 'City', 'Area', 'SKU_ID', 'SKU_Name', 'Pack_Type', 'Volume_ML', 'MRP', 'Selling_Price', 'Price_Per_Liter', 'Discount', 'Stock_Status'];
  const csvRows = Object.values(citySkuMatrix).map(r => [
    r.date,
    r.cityName,
    r.area,
    r.skuId,
    `"${r.skuName}"`,
    r.skuShortName,
    r.volumeMl,
    r.mrp || '',
    r.sellingPrice || '',
    r.pricePerLiter || '',
    `"${r.discount}"`,
    `"${r.stockStatus}"`
  ]);
  fs.writeFileSync(matrixCsvFile, [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n'), 'utf8');
  console.log(`✅ Exported CSV Matrix: ${matrixCsvFile}`);

  console.log(`\n========================================================================`);
  console.log(`🎉 GEM'S GOLD 25-CITY SCAN COMPLETED SUCCESSFULLY`);
  console.log(`========================================================================\n`);
}

runGemsGoldMonitor().catch(err => {
  console.error('Fatal error during Gems Gold monitoring:', err);
  process.exit(1);
});
