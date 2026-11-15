import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LIVE_DIR = path.resolve('docs/live');

if (!fs.existsSync(LIVE_DIR)) {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
}

const delay = ms => new Promise(r => setTimeout(r, ms));
const LIVE_URL = 'https://www.karthiksreenivasanp.social/martian-map/';

async function runLiveVerification() {
  console.log(`=== RUNNING LIVE AUTOMATED TEST ON ${LIVE_URL} ===`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-watchdog']
  });

  const viewports = [
    { name: 'live_desktop_1280x800', width: 1280, height: 800 },
    { name: 'live_tablet_landscape_1024x768', width: 1024, height: 768 },
    { name: 'live_tablet_portrait_768x1024', width: 768, height: 1024 }
  ];

  let totalConsoleErrors = 0;
  let totalCspViolations = 0;
  let totalFailedRequests = 0;

  for (const vp of viewports) {
    console.log(`\nTesting Live Viewport: ${vp.name} (${vp.width}x${vp.height})`);
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
    const response = await page.goto(LIVE_URL, { waitUntil: 'networkidle0' });
    console.log(`Live HTTP Status: ${response.status()}`);

    await delay(2000);

    const violations = await page.evaluate(() => window.__cspViolations || []);
    cspViolations.push(...violations);

    await page.screenshot({ path: path.join(LIVE_DIR, `${vp.name}.png`) });
    console.log(`Saved screenshot: ${vp.name}.png`);

    console.log(`Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) console.log(consoleErrors);
    console.log(`CSP Violations: ${cspViolations.length}`);
    console.log(`Failed Requests: ${failedRequests.length}`);

    totalConsoleErrors += consoleErrors.length;
    totalCspViolations += cspViolations.length;
    totalFailedRequests += failedRequests.length;

    await page.close();
  }

  // 404 Route Test on live host
  console.log('\nTesting Live 404 Route...');
  const page404 = await browser.newPage();
  const res404 = await page404.goto(`${LIVE_URL}non-existent-page`, { waitUntil: 'networkidle0' });
  console.log(`Live Non-existent URL HTTP Status: ${res404.status()}`);
  await page404.close();

  await browser.close();

  console.log('\n=== LIVE TEST SUMMARY ===');
  console.log(`Total Console Errors across all 3 viewports: ${totalConsoleErrors}`);
  console.log(`Total CSP Violations across all 3 viewports: ${totalCspViolations}`);
  console.log(`Total Failed Requests across all 3 viewports: ${totalFailedRequests}`);
}

runLiveVerification().catch(err => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
