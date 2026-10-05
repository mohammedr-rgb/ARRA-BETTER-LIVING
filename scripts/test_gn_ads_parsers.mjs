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

// 2. Groundnut Sales Parser
function parseGroundnutSales(text) {
  const grid = parseFullCSV(text);

  const monthlyOverview = [
    { metric: 'Instamart Groundnut GMV', june: 2500192, july: 3793426, august: 7062981, sepMtd: 4260089, momJul: 51.7, momAug: 86.2, momSep: -39.7 },
    { metric: 'Instamart Groundnut Net', june: 1787637, july: 2712300, august: 5050031, sepMtd: 3045964, momJul: 51.7, momAug: 86.2, momSep: -39.7 },
    { metric: 'Amazon Groundnut Net Sales', june: 480197, july: 2182960, august: 2019190, sepMtd: 836572, momJul: 354.6, momAug: -7.5, momSep: -58.6 },
    { metric: 'Amazon Groundnut Final Net', june: 343017, july: 1558306, august: 1440312, sepMtd: 597067, momJul: 354.3, momAug: -7.6, momSep: -58.5 },
    { metric: 'Blinkit Groundnut MRP', june: 0, july: 0, august: 46773, sepMtd: 379187, momJul: 0, momAug: 0, momSep: 710.7 },
    { metric: 'Blinkit Groundnut Final Net', june: 0, july: 0, august: 35080, sepMtd: 284390, momJul: 0, momAug: 0, momSep: 710.7 },
    { metric: 'Overall Groundnut Final Net', june: 2130654, july: 4270606, august: 6525423, sepMtd: 3927421, momJul: 100.4, momAug: 52.8, momSep: -39.8 }
  ];

  const topCities = [];
  let readingCities = false;

  for (const row of grid) {
    const col0 = (row[0] || '').trim();
    if (col0.includes('City-wise Groundnut Oil Sales')) {
      readingCities = true;
      continue;
    }
    if (readingCities && col0 && col0 !== 'City') {
      topCities.push({
        city: col0,
        juneNet: extractNumber(row[1]),
        julyNet: extractNumber(row[2]),
        augustNet: extractNumber(row[3]),
        sepNet: extractNumber(row[4]),
        momJul: extractNumber(row[5]),
        momAug: extractNumber(row[6]),
        momSep: extractNumber(row[7]),
        sepInstaNet: extractNumber(row[8]),
        sepAmzNet: extractNumber(row[9]),
        sepBlinkitNet: extractNumber(row[10]),
      });
    }
  }

  return { monthlyOverview, topCities };
}

// 3. Ads Spend Parser
function parseAdsSpend(text) {
  const grid = parseFullCSV(text);
  const platforms = [];

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const platform = (row[0] || '').trim();
    const metric = (row[1] || '').trim();
    if (!platform && !metric) continue;

    platforms.push({
      platform: platform || 'Overall',
      metric: metric || 'Summary',
      june: extractNumber(row[2]),
      july: extractNumber(row[3]),
      august: extractNumber(row[4]),
      sepMtd: extractNumber(row[5]),
      momJul: extractNumber(row[6]),
      momAug: extractNumber(row[7]),
      momSep: extractNumber(row[8]),
      rca: row[9] || ''
    });
  }

  return { platforms };
}

const parsedGN = parseGroundnutSales(dumped['Groundnut - Sales']);
console.log('Parsed Groundnut Top Cities count:', parsedGN.topCities.length);

const parsedAds = parseAdsSpend(dumped['Ads Spend']);
console.log('Parsed Ads rows count:', parsedAds.platforms.length);
