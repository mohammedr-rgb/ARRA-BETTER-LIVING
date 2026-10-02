async function testFetch() {
  const url = 'https://www.swiggy.com/dapi/instamart/search?query=cold+pressed+groundnut+oil&lat=11.1085&lng=77.3411';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.swiggy.com/instamart',
        'Origin': 'https://www.swiggy.com'
      }
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response preview:', text.slice(0, 300));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testFetch();
