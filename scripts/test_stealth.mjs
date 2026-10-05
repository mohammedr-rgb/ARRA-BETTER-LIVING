import { chromium } from 'playwright';

async function testStealth() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    geolocation: { latitude: 13.0827, longitude: 80.2707 },
    permissions: ['geolocation'],
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata'
  });

  const page = await context.newPage();
  
  // Stealth overrides
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'hi'] });
  });

  try {
    console.log('Visiting Swiggy Instamart with stealth...');
    await page.goto('https://www.swiggy.com/instamart', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log('Title:', title);
    
    // Check if location prompt appeared or if location was detected
    const locationText = await page.evaluate(() => {
      const locElem = document.querySelector('[data-testid*="location"], [class*="Location"], [class*="address"]');
      return locElem ? locElem.innerText : null;
    });
    console.log('Detected Location in Header:', locationText);

    // Try search
    console.log('Searching via UI input box...');
    const searchInput = await page.$('input[placeholder*="Search"], [data-testid*="search"]');
    if (searchInput) {
      await searchInput.fill('GEMS GOLD');
      await searchInput.press('Enter');
      await page.waitForTimeout(4000);
    } else {
      await page.goto('https://www.swiggy.com/instamart/search?query=groundnut+oil', { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(3000);
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body length:', bodyText.length);
    console.log('Snippet:', bodyText.slice(0, 300));
  } catch (e) {
    console.error('Stealth error:', e.message);
  } finally {
    await browser.close();
  }
}

testStealth();
