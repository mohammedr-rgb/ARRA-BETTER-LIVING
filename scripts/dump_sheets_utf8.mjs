import fs from 'fs';

async function dumpFullSheets() {
  const spreadsheetId = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE';
  const sheets = ['Overall sales', 'Groundnut - Sales', 'Ads Spend'];
  const result = {};

  for (const sheet of sheets) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(url);
    const text = await res.text();
    result[sheet] = text;
  }

  fs.writeFileSync('scripts/dump_output_utf8.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('Saved to scripts/dump_output_utf8.json');
}

dumpFullSheets();
