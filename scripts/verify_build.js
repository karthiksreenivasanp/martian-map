import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AFTER_DIR = path.resolve('docs/after');
const BASELINE_DIR = path.resolve('docs/baseline');

if (!fs.existsSync(AFTER_DIR)) {
  fs.mkdirSync(AFTER_DIR, { recursive: true });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runVerification() {
  console.log('=== RUNNING AUTOMATED BROWSER VERIFICATION ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-watchdog']
  });

  const viewports = [
    { name: 'desktop_1280x800', width: 1280, height: 800 },
    { name: 'tablet_landscape_1024x768', width: 1024, height: 768 },
    { name: 'tablet_portrait_768x1024', width: 768, height: 1024 }
  ];

  let totalConsoleErrors = 0;
  let totalCspViolations = 0;
  let totalFailedRequests = 0;

  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const page = await browser.newPage();
    const consoleErrors = [];
    const cspViolations = [];
    const failedRequests = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(err.toString());
    });

    page.on('requestfailed', req => {
      failedRequests.push({ url: req.url(), error: req.failure()?.errorText });
    });

    await page.evaluateOnNewDocument(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', e => {
        window.__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          originalPolicy: e.originalPolicy
        });
      });
    });

    await page.setViewport({ width: vp.width, height: vp.height });
    const response = await page.goto('http://127.0.0.1:4173/martian-map/', { waitUntil: 'networkidle0' });
    console.log(`HTTP Status: ${response.status()}`);

    await delay(1500);

    const violations = await page.evaluate(() => window.__cspViolations || []);
    cspViolations.push(...violations);

    await page.screenshot({ path: path.join(AFTER_DIR, `view_${vp.name}.png`) });
    console.log(`Saved screenshot: view_${vp.name}.png`);

    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`CSP Violations: ${cspViolations.length}`);
    console.log(`Failed Requests: ${failedRequests.length}`);

    totalConsoleErrors += consoleErrors.length;
    totalCspViolations += cspViolations.length;
    totalFailedRequests += failedRequests.length;

    await page.close();
  }

  // 404 Route Test
  console.log('\nTesting 404 Non-existent Route...');
  const page404 = await browser.newPage();
  const res404 = await page404.goto('http://127.0.0.1:4173/martian-map/non-existent-page', { waitUntil: 'networkidle0' });
  console.log(`Non-existent URL HTTP Status: ${res404.status()}`);
  await page404.close();

  // Regression Comparison with Step 1
  console.log('\nCapturing Step 6 After Regression Views at 1280x800...');
  const regPage = await browser.newPage();
  await regPage.setViewport({ width: 1280, height: 800 });
  await regPage.goto('http://127.0.0.1:4173/martian-map/', { waitUntil: 'networkidle0' });
  await delay(1500);

  // 01 Start View
  await regPage.screenshot({ path: path.join(AFTER_DIR, '01_start_view.png') });
  // 02 Places Drawer
  await regPage.click('#btn-places');
  await delay(600);
  await regPage.screenshot({ path: path.join(AFTER_DIR, '02_places_drawer.png') });
  // 03 Route Preview
  const previewBtn = await regPage.$('#btn-route-preview');
  if (previewBtn) {
    await previewBtn.click();
    await delay(1000);
    await regPage.screenshot({ path: path.join(AFTER_DIR, '03_route_preview.png') });
    await previewBtn.click();
    await delay(400);
  }
  const closeDrawer = await regPage.$('#btn-close-directions');
  if (closeDrawer) await closeDrawer.click();
  await delay(400);

  // 04 Layers Card
  const layerBtn = await regPage.$('#btn-map-layer');
  if (layerBtn) {
    await layerBtn.click();
    await delay(500);
    await regPage.screenshot({ path: path.join(AFTER_DIR, '04_layers_card.png') });
    await regPage.$eval('[data-style="depth"]', el => el.click());
    await delay(400);
  }

  // 05 Weather
  await regPage.$eval('#btn-climate', btn => btn.click());
  await delay(600);
  await regPage.screenshot({ path: path.join(AFTER_DIR, '05_weather.png') });
  await regPage.$eval('#btn-close-climate', btn => btn.click());
  await delay(400);

  // 06 Measure
  await regPage.$eval('#btn-measure', btn => btn.click());
  await delay(600);
  await regPage.screenshot({ path: path.join(AFTER_DIR, '06_measure.png') });
  await regPage.$eval('#btn-close-measure', btn => btn.click());
  await delay(400);

  await regPage.close();
  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log(`Total Console Errors across all 3 viewports: ${totalConsoleErrors}`);
  console.log(`Total CSP Violations across all 3 viewports: ${totalCspViolations}`);
  console.log(`Total Failed Requests across all 3 viewports: ${totalFailedRequests}`);
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
