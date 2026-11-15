import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASELINE_DIR = path.resolve('docs/baseline');

if (!fs.existsSync(BASELINE_DIR)) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function captureBaseline() {
  console.log('=== CAPTURING BASELINE SCREENSHOTS ON PREVIEW (http://127.0.0.1:4173/) ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-watchdog']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
  });

  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:4173/martian-map/', { waitUntil: 'networkidle0' });
  await delay(1500);

  // 1. Start View
  await page.screenshot({ path: path.join(BASELINE_DIR, '01_start_view.png') });
  console.log('Saved 01_start_view.png');

  // 2. Places Drawer
  await page.click('#btn-places');
  await delay(600);
  await page.screenshot({ path: path.join(BASELINE_DIR, '02_places_drawer.png') });
  console.log('Saved 02_places_drawer.png');

  // 3. Route Preview
  const previewBtn = await page.$('#btn-route-preview');
  if (previewBtn) {
    await previewBtn.click();
    await delay(1000);
    await page.screenshot({ path: path.join(BASELINE_DIR, '03_route_preview.png') });
    console.log('Saved 03_route_preview.png');
    // Stop preview if playing
    await previewBtn.click();
    await delay(400);
  }

  // Close places drawer
  const closeDrawer = await page.$('#btn-close-directions');
  if (closeDrawer) await closeDrawer.click();
  await delay(400);

  // 4. Layers Card
  const layerBtn = await page.$('#btn-map-layer');
  if (layerBtn) {
    await layerBtn.click();
    await delay(500);
    await page.screenshot({ path: path.join(BASELINE_DIR, '04_layers_card.png') });
    console.log('Saved 04_layers_card.png');
    // Select depth to dismiss picker
    await page.$eval('[data-style="depth"]', el => el.click());
    await delay(400);
  }

  // 5. Weather / Climate
  await page.$eval('#btn-climate', btn => btn.click());
  await delay(600);
  await page.screenshot({ path: path.join(BASELINE_DIR, '05_weather.png') });
  console.log('Saved 05_weather.png');
  await page.$eval('#btn-close-climate', btn => btn.click());
  await delay(400);

  // 6. Measure
  await page.$eval('#btn-measure', btn => btn.click());
  await delay(600);
  await page.screenshot({ path: path.join(BASELINE_DIR, '06_measure.png') });
  console.log('Saved 06_measure.png');
  await page.$eval('#btn-close-measure', btn => btn.click());
  await delay(400);

  console.log('Total Console Errors:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('Errors:', consoleErrors);
  }

  await browser.close();
}

captureBaseline().catch(err => {
  console.error('Baseline capture failed:', err);
  process.exit(1);
});
