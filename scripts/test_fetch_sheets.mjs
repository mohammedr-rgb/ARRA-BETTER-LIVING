async function testSheetFetch() {
  const spreadsheetId = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE';
  const sheets = ['Overall sales', 'Groundnut - Sales', 'Ads Spend'];

  for (const sheet of sheets) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    try {
      const res = await fetch(url);
      console.log(`\n================== SHEET: ${sheet} (Status: ${res.status}) ==================`);
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        console.log(`Total lines: ${lines.length}`);
        console.log('First 10 lines:');
        lines.slice(0, 10).forEach((l, i) => console.log(`[${i+1}] ${l}`));
      } else {
        console.error(`Failed to fetch sheet: ${sheet}`);
      }
    } catch (e) {
      console.error(`Error fetching sheet ${sheet}:`, e.message);
    }
  }
}

testSheetFetch();
