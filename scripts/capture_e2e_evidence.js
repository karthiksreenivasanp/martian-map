import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('dist/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runBrowserTests() {
  console.log('--- STARTING PUPPETEER E2E TEST & SCREENSHOT CAPTURE ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-watchdog']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error('[BROWSER ERROR]', text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text);
      console.warn('[BROWSER WARN]', text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
    console.error('[PAGE ERROR]', err);
  });

  // 1. Viewport 1280x800
  console.log('1. Testing Viewport: 1280x800');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await delay(2000);

  // Assert DOM values for Route and Instruction bar
  const instructionText = await page.$eval('#instruction-text', el => el.textContent);
  const instructionTele = await page.$eval('#instruction-telemetry', el => el.textContent);
  console.log(`Instruction Bar: "${instructionText}" | Telemetry: "${instructionTele}"`);

  if (instructionText.includes('NaN') || instructionTele.includes('NaN')) {
    throw new Error('NaN found in instruction bar!');
  }

  // Screenshot 1: HUD 1280x800
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_hud_1280x800.png') });
  console.log('Saved: after_hud_1280x800.png');

  // Trigger Directions Drawer
  console.log('Opening Directions Drawer...');
  await page.click('#btn-places');
  await delay(600);

  // Check drawer metrics
  const cardRouteDist = await page.$eval('#card-route-dist', el => el.textContent);
  const cardStraightDist = await page.$eval('#card-straight-dist', el => el.textContent);
  const cardRouteTime = await page.$eval('#card-route-time', el => el.textContent);
  console.log(`Route Card Metrics: Route: ${cardRouteDist}, Straight: ${cardStraightDist}, Time: ${cardRouteTime}`);

  if (cardRouteDist.includes('NaN') || cardStraightDist.includes('NaN') || cardRouteTime.includes('NaN')) {
    throw new Error('NaN found in route summary card!');
  }

  // Test Search Box & Clear Button
  await page.type('#dest-search-input', 'rock');
  await delay(300);
  const isClearVisible = await page.$eval('#btn-clear-search', el => !el.classList.contains('hidden'));
  console.log(`Search clear button visible: ${isClearVisible}`);

  // Screenshot 2: Directions Drawer 1280x800
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_drawer_1280x800.png') });
  console.log('Saved: after_drawer_1280x800.png');

  // Clear search and close drawer
  await page.click('#btn-clear-search');
  await delay(200);
  await page.click('#btn-close-directions-drawer');
  await delay(500);

  // Test Mini Map Style Picker
  console.log('Opening Map Style Picker...');
  await page.click('#btn-map-layer');
  await delay(400);

  // Screenshot 3: Minimap Styles 1280x800
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_minimap_styles_1280x800.png') });
  console.log('Saved: after_minimap_styles_1280x800.png');

  // Switch to Elevation style
  const styleBtns = await page.$$('.layer-tile');
  if (styleBtns.length >= 2) {
    await styleBtns[1].click(); // Elevation
    await delay(400);
  }

  // Close style picker
  await page.click('#btn-map-layer');
  await delay(300);

  // Open Globe Overlay
  console.log('Opening Globe Overlay...');
  await page.click('#globe-container');
  await delay(800);

  // Screenshot 4: Globe Overlay 1280x800
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_globe_1280x800.png') });
  console.log('Saved: after_globe_1280x800.png');

  // Close Globe Overlay
  await page.click('#btn-close-globe-overlay');
  await delay(400);

  // Test Toast Lane (Trigger arrival toast)
  console.log('Testing Toast Lane...');
  await page.evaluate(() => {
    const toast = document.getElementById('toast-container');
    if (toast) {
      toast.className = 'toast-container toast-success';
      toast.innerHTML = '<div class="toast-msg">Arrived at destination: Rocknest Sand Drift</div>';
      toast.classList.remove('hidden');
    }
  });
  await delay(400);

  // Screenshot 5: Toast Lane 1280x800 (verify no occlusion over HUD arrow or instruction bar)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_toast_1280x800.png') });
  console.log('Saved: after_toast_1280x800.png');

  // Dismiss toast
  await page.click('#toast-container');
  await delay(200);

  // 2. Viewport 1024x768
  console.log('2. Testing Viewport: 1024x768');
  await page.setViewport({ width: 1024, height: 768 });
  await delay(500);
  await page.click('#btn-map-layer');
  await delay(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_hud_1024x768.png') });
  console.log('Saved: after_hud_1024x768.png');
  await page.click('#btn-map-layer');
  await delay(200);

  // 3. Viewport 768x1024 (Portrait Tablet)
  console.log('3. Testing Viewport: 768x1024');
  await page.setViewport({ width: 768, height: 1024 });
  await delay(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_hud_768x1024.png') });
  console.log('Saved: after_hud_768x1024.png');

  // Open drawer on 768x1024 (bottom sheet)
  await page.click('#btn-places');
  await delay(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_drawer_768x1024.png') });
  console.log('Saved: after_drawer_768x1024.png');

  await browser.close();

  console.log('--- PUPPETEER TESTS FINISHED SUCCESSFULLY ---');
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`Console Warnings: ${consoleWarnings.length}`);

  if (consoleErrors.length > 0) {
    console.error('Errors observed:', consoleErrors);
    process.exit(1);
  }
}

runBrowserTests().catch(err => {
  console.error('[E2E FAILURE]', err);
  process.exit(1);
});
