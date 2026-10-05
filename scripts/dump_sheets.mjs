async function dumpFullSheets() {
  const spreadsheetId = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE';
  const sheets = ['Overall sales', 'Groundnut - Sales', 'Ads Spend'];

  for (const sheet of sheets) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(url);
    const text = await res.text();
    console.log(`\n======================================================`);
    console.log(`FULL DUMP FOR: ${sheet}`);
    console.log(`======================================================`);
    console.log(text);
  }
}

dumpFullSheets();
