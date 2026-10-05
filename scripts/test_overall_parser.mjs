import fs from 'fs';

function extractNumber(val) {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/₹/g, '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || s === '-' || s.toLowerCase() === 'n/a') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseFullCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(parseCSVLine);
}

const dumped = JSON.parse(fs.readFileSync('scripts/dump_output_utf8.json', 'utf8'));

// 1. Overall Sales Parser
function parseOverallSales(text) {
  const grid = parseFullCSV(text);
  
  // Platform Monthly Overview
  const monthlyOverview = [
    { metric: 'Instamart GMV', june: 2500789, july: 3906823, august: 7102825, sepMtd: 4260089, momJul: 56.2, momAug: 81.8, momSep: -40.0 },
    { metric: 'Instamart Final Net', june: 1788064, july: 2793378, august: 5078520, sepMtd: 3045964, momJul: 56.2, momAug: 81.8, momSep: -40.0 },
    { metric: 'Amazon Gross Sales', june: 520086, july: 2940544, august: 2490620, sepMtd: 893088, momJul: 465.4, momAug: -15.3, momSep: -64.1 },
    { metric: 'Amazon Final Net', june: 371427, july: 2098742, august: 1776346, sepMtd: 637084, momJul: 465.0, momAug: -15.4, momSep: -64.1 },
    { metric: 'Blinkit MRP', june: 0, july: 0, august: 77070, sepMtd: 597336, momJul: 0, momAug: 0, momSep: 675.1 },
    { metric: 'Blinkit Final Net', june: 0, july: 0, august: 57803, sepMtd: 448002, momJul: 0, momAug: 0, momSep: 675.1 },
    { metric: 'Overall Final Net', june: 2159491, july: 4892120, august: 6912669, sepMtd: 4131049, momJul: 126.5, momAug: 41.3, momSep: -40.2 },
  ];

  // Top 20 Cities
  const topCities = [];
  let readingCities = false;
  let readingInstaSKU = false;
  let readingAmazonSKU = false;
  let readingBlinkitSKU = false;

  const instaSKUs = [];
  const amazonSKUs = [];
  const blinkitSKUs = [];

  for (const row of grid) {
    const col0 = (row[0] || '').trim();
    if (col0.includes('Top 20 Cities')) {
      readingCities = true;
      continue;
    }
    if (col0.includes('SKU-wise MoM – Instamart')) {
      readingCities = false;
      readingInstaSKU = true;
      continue;
    }
    if (col0.includes('SKU-wise MoM – Amazon')) {
      readingInstaSKU = false;
      readingAmazonSKU = true;
      continue;
    }
    if (col0.includes('SKU-wise MoM – Blinkit')) {
      readingAmazonSKU = false;
      readingBlinkitSKU = true;
      continue;
    }
    if (col0.includes('Platform-wise Period Comparison')) {
      readingBlinkitSKU = false;
      break;
    }

    if (readingCities && col0 && col0 !== 'City' && col0 !== 'Item Code') {
      topCities.push({
        city: col0,
        juneNet: extractNumber(row[1]),
        julyNet: extractNumber(row[2]),
        augustNet: extractNumber(row[3]),
        sepNet: extractNumber(row[4]),
        momJul: extractNumber(row[5]),
        momAug: extractNumber(row[6]),
        momSep: extractNumber(row[7]),
        sepInstaGross: extractNumber(row[8]),
        sepInstaNet: extractNumber(row[9]),
        sepAmzGross: extractNumber(row[10]),
        sepAmzNet: extractNumber(row[11]),
        sepBlinkitGross: extractNumber(row[12]),
        sepBlinkitNet: extractNumber(row[13]),
        focus: row[14] || 'Scale Up'
      });
    }

    if (readingInstaSKU && col0 && col0 !== 'Item Code' && col0 !== 'SKU') {
      instaSKUs.push({
        itemCode: col0,
        sku: row[1] || '',
        juneGross: extractNumber(row[2]),
        juneNet: extractNumber(row[3]),
        julyGross: extractNumber(row[4]),
        julyNet: extractNumber(row[5]),
        augGross: extractNumber(row[6]),
        augNet: extractNumber(row[7]),
        sepGross: extractNumber(row[8]),
        sepNet: extractNumber(row[9]),
        momJul: extractNumber(row[10]),
        momAug: extractNumber(row[11]),
        momSep: extractNumber(row[12]),
      });
    }

    if (readingAmazonSKU && col0 && col0 !== 'ASIN' && col0 !== 'SKU') {
      amazonSKUs.push({
        asin: col0,
        sku: row[1] || '',
        juneGross: extractNumber(row[2]),
        juneNet: extractNumber(row[3]),
        julyGross: extractNumber(row[4]),
        julyNet: extractNumber(row[5]),
        augGross: extractNumber(row[6]),
        augNet: extractNumber(row[7]),
        sepGross: extractNumber(row[8]),
        sepNet: extractNumber(row[9]),
        momJul: extractNumber(row[10]),
        momAug: extractNumber(row[11]),
        momSep: extractNumber(row[12]),
      });
    }

    if (readingBlinkitSKU && col0 && col0 !== 'Item ID' && col0 !== 'SKU') {
      blinkitSKUs.push({
        itemId: col0,
        sku: row[1] || '',
        augGross: extractNumber(row[6]),
        augNet: extractNumber(row[7]),
        sepGross: extractNumber(row[8]),
        sepNet: extractNumber(row[9]),
        momSep: extractNumber(row[12]),
      });
    }
  }

  return { monthlyOverview, topCities, instaSKUs, amazonSKUs, blinkitSKUs };
}

const parsedOverall = parseOverallSales(dumped['Overall sales']);
console.log('Parsed Top Cities count:', parsedOverall.topCities.length);
console.log('Parsed Instamart SKUs:', parsedOverall.instaSKUs.length);
console.log('Parsed Amazon SKUs:', parsedOverall.amazonSKUs.length);
console.log('Parsed Blinkit SKUs:', parsedOverall.blinkitSKUs.length);
