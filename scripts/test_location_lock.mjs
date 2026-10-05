import { chromium } from 'playwright';

async function testLocationLock() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
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
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('1. Going to Swiggy Instamart...');
    await page.goto('https://www.swiggy.com/instamart', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Look for location buttons like "Locate Me", "Get current location", "Set Location"
    console.log('2. Clicking location trigger...');
    const locateBtn = await page.$('text=/Locate Me|Use current location|Current location|Set Location/i');
    if (locateBtn) {
      console.log('Found Locate button! Clicking...');
      await locateBtn.click();
      await page.waitForTimeout(4000);
    } else {
      console.log('Looking for location header button...');
      const headerLoc = await page.$('[data-testid*="location"], [class*="Location"]');
      if (headerLoc) {
        await headerLoc.click();
        await page.waitForTimeout(2000);
        const autoDetect = await page.$('text=/Current location|Locate Me|Use my location/i');
        if (autoDetect) {
          console.log('Found Auto-Detect button in drawer! Clicking...');
          await autoDetect.click();
          await page.waitForTimeout(4000);
        }
      }
    }

    const cookies = await context.cookies();
    const latCookie = cookies.find(c => c.name.includes('lat') || c.name.includes('location') || c.name.includes('address'));
    console.log('Location Cookies Set:', cookies.map(c => c.name).join(', '));
    console.log('Page Title:', await page.title());

    // Check header text again
    const headerText = await page.evaluate(() => document.querySelector('header')?.innerText || '');
    console.log('Header text after location lock:', headerText.slice(0, 150));

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

testLocationLock();
