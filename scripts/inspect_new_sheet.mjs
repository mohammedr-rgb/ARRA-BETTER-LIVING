async function inspectSpreadsheet() {
  const spreadsheetId = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE';
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
  
  try {
    const res = await fetch(url);
    const html = await res.text();
    console.log('HTML length:', html.length);
    
    // Look for sheet metadata in HTML
    // Google Sheets embeds bootstrap data like: "name":"Overall sales","id":0 or similar
    const matches = [...html.matchAll(/"name":"([^"]+)","sheetId":([0-9]+)/g)];
    if (matches.length) {
      console.log('Found sheets via sheetId regex:');
      matches.forEach(m => console.log(`- Sheet Name: "${m[1]}", GID: ${m[2]}`));
    } else {
      // try other regex patterns
      const matches2 = [...html.matchAll(/gid=([0-9]+)/g)];
      console.log('Found gids:', [...new Set(matches2.map(m => m[1]))]);
      
      const sheetNameMatches = [...html.matchAll(/\[[0-9]+,"([^"]+)",[0-9]+,/g)];
      console.log('Potential sheet names:', sheetNameMatches.map(m => m[1]).slice(0, 20));
    }
  } catch (e) {
    console.error('Error fetching spreadsheet HTML:', e);
  }
}

inspectSpreadsheet();
