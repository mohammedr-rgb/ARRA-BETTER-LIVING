import fs from 'fs';

const data = JSON.parse(fs.readFileSync('public/data/instamart_gems_gold_live.json', 'utf8'));

console.log('========================================================================================');
console.log('📊 25-CITY INSTAMART STOCK AVAILABILITY & PRICE AUDIT REPORT');
console.log(`📅 Date: ${data.date} | Last Updated: ${data.lastUpdated}`);
console.log(`📍 Monitored Dark Stores: ${data.targetCities.length} Cities | Monitored SKUs: ${data.targetSkus.length}`);
console.log(`📦 Total Pairs: ${data.summary.totalMonitoredPairs} | In Stock: ${data.summary.totalInStock} | OOS: ${data.summary.totalOos}`);
console.log('========================================================================================\n');

const cities = data.targetCities;
const matrix = data.citySkuMatrix;
const skus = data.targetSkus;

const skuStats = {};
skus.forEach(s => {
  skuStats[s.id] = { name: s.shortName, inStockCities: [], oosCities: [], prices: [] };
});

cities.forEach((c, idx) => {
  const citySkus = skus.map(s => {
    const key = `${c.id}_${s.id}`;
    const item = matrix[key];
    if (item && item.inStock) {
      skuStats[s.id].inStockCities.push(c.name);
      if (item.sellingPrice) skuStats[s.id].prices.push(item.sellingPrice);
    } else {
      skuStats[s.id].oosCities.push(c.name);
    }
    return {
      sku: s.shortName,
      inStock: item ? item.inStock : false,
      price: item ? item.sellingPrice : null,
      mrp: item ? item.mrp : null,
      disc: item ? item.discount : '—',
      status: item ? item.stockStatus : 'Unknown'
    };
  });

  const inStockCount = citySkus.filter(s => s.inStock).length;
  const oos = citySkus.filter(s => !s.inStock).map(s => s.sku);
  const statusIcon = inStockCount === citySkus.length ? '✅' : '⚠️';

  console.log(`${statusIcon} ${String(idx + 1).padStart(2, ' ')}. [${c.name.padEnd(12)}] (${c.area.padEnd(16)}) ${c.state.padEnd(14)} ⚡ ${c.deliveryMin.padEnd(7)} | ${inStockCount}/${citySkus.length} In Stock ${oos.length ? '| OOS: ' + oos.join(', ') : '| 100% In Stock'}`);
});

console.log('\n========================================================================================');
console.log('📦 SKU-WISE AVAILABILITY SUMMARY ACROSS ALL 25 CITIES');
console.log('========================================================================================');
skus.forEach(s => {
  const stat = skuStats[s.id];
  const inStockPct = ((stat.inStockCities.length / cities.length) * 100).toFixed(1);
  const minPrice = stat.prices.length ? Math.min(...stat.prices) : '—';
  const maxPrice = stat.prices.length ? Math.max(...stat.prices) : '—';
  const avgPrice = stat.prices.length ? Math.round(stat.prices.reduce((a, b) => a + b, 0) / stat.prices.length) : '—';

  console.log(`\n• ${stat.name} (${s.standardName}):`);
  console.log(`  - Availability: ${stat.inStockCities.length}/25 Cities (${inStockPct}%)`);
  console.log(`  - Price Range: ₹${minPrice} - ₹${maxPrice} (Avg: ₹${avgPrice}) | Base MRP: ₹${s.baseMrp || s.mrp}`);
  if (stat.oosCities.length > 0) {
    console.log(`  - ⚠️ Out of Stock In (${stat.oosCities.length} cities): ${stat.oosCities.join(', ')}`);
  } else {
    console.log(`  - ✅ 100% In Stock in all 25 cities!`);
  }
});

console.log('\n========================================================================================');
