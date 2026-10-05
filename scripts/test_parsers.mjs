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

console.log('=== TEST PARSING OVERALL SALES ===');
const overallGrid = parseFullCSV(dumped['Overall sales']);
console.log('Overall rows count:', overallGrid.length);

console.log('=== TEST PARSING GROUNDNUT SALES ===');
const groundnutGrid = parseFullCSV(dumped['Groundnut - Sales']);
console.log('Groundnut rows count:', groundnutGrid.length);

console.log('=== TEST PARSING ADS SPEND ===');
const adsGrid = parseFullCSV(dumped['Ads Spend']);
console.log('Ads rows count:', adsGrid.length);
