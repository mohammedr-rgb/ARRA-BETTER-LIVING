import { chromium } from 'playwright';

async function testPlaywright() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    geolocation: { latitude: 11.1085, longitude: 77.3411 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  try {
    console.log('Navigating to Swiggy Instamart...');
    await page.goto('https://www.swiggy.com/instamart', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page title:', await page.title());
    await page.waitForTimeout(3000);
    const content = await page.content();
    console.log('Content length:', content.length);
  } catch (e) {
    console.error('Playwright error:', e.message);
  } finally {
    await browser.close();
  }
}

testPlaywright();
