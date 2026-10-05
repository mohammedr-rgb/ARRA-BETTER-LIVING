import { chromium } from 'playwright';

const testCities = [
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Tirupur', lat: 11.1085, lng: 77.3411 },
  { name: 'Salem', lat: 11.6643, lng: 78.1460 },
  { name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946 }
];

async function testScrape() {
  const browser = await chromium.launch({ headless: true });
  
  for (const city of testCities) {
    console.log(`\n======================================================`);
    console.log(`Testing City: ${city.name} (${city.lat}, ${city.lng})`);
    console.log(`======================================================`);
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      geolocation: { latitude: city.lat, longitude: city.lng },
      permissions: ['geolocation']
    });
    
    const page = await context.newPage();
    
    // Intercept API responses from Instamart/Swiggy dapi
    const capturedItems = [];
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('instamart') && (url.includes('search') || url.includes('layout') || url.includes('dapi') || url.includes('item'))) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await response.json().catch(() => null);
            if (json) {
              const str = JSON.stringify(json);
              if (str.toLowerCase().includes('gem') || str.toLowerCase().includes('gold') || str.toLowerCase().includes('groundnut')) {
                capturedItems.push({ url, length: str.length });
              }
            }
          }
        }
      } catch {}
    });

    try {
      console.log('1. Navigating to Instamart homepage to lock dark store...');
      await page.goto('https://www.swiggy.com/instamart', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);
      
      const title = await page.title();
      console.log('Page Title:', title);

      console.log('2. Searching for "GEMS GOLD groundnut oil"...');
      const searchUrl = `https://www.swiggy.com/instamart/search?custom_back=true&query=GEMS+GOLD+groundnut+oil`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);

      // Extract DOM content or items
      const itemElements = await page.$$('[data-testid*="item"], [class*="item_container"], [class*="ItemCard"], [class*="ProductCard"], [class*="product_card"], a[href*="/instamart/item/"]');
      console.log(`Found ${itemElements.length} product card elements`);

      const text = await page.evaluate(() => document.body.innerText);
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      console.log('Sample Page Text Lines:', lines.slice(0, 15).join(' | '));
      
      const gemsLines = lines.filter(l => /gem|gold|groundnut|oil/i.test(l));
      console.log('Gems/Groundnut lines found:', gemsLines.slice(0, 10));

    } catch (e) {
      console.error('Scrape error for', city.name, ':', e.message);
    } finally {
      await context.close();
    }
  }
  
  await browser.close();
}

testScrape();
