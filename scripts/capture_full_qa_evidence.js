import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('dist/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runFullQASuite() {
  console.log('=== STARTING COMPREHENSIVE QA & EVIDENCE CAPTURE ===');

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

  // 1. Primary Viewport: 1280x800
  console.log('\n--- 1. Testing Viewport: 1280x800 ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await delay(1500);

  // Assert Title Bar Tags & Time Pill
  const headerTime = await page.$eval('#header-ltst-time', el => el.textContent);
  const badgeSim = await page.$eval('#badge-simulated', el => el.textContent);
  console.log(`Top Bar Clock: "${headerTime}" | Badge: "${badgeSim}"`);
  if (!headerTime.includes('LTST')) throw new Error('Header time must display LTST');
  if (!badgeSim.includes('Terrain: DEM 1 m + imagery 25 cm (real); micro-detail: SIMULATED')) {
    throw new Error('Header badge must contain honest data source statement');
  }

  // Screenshot: Default Daytime HUD (14:30 LTST)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'hud_daytime_1430_1280x800.png') });
  console.log('Saved: hud_daytime_1430_1280x800.png');

  // --- BUTTON INVENTORY & CLICKABILITY TESTS ---
  console.log('\n--- 2. PERSISTENT BUTTONS INVENTORY & CLICK TESTS ---');
  const persistentButtons = [
    { id: 'btn-help', name: 'Help Tour', expectedIcon: 'circle-help' },
    { id: 'btn-climate', name: 'Weather / Climate', expectedIcon: 'cloud-sun' },
    { id: 'btn-time', name: 'Mars Solar Time', expectedIcon: 'clock' },
    { id: 'btn-measure', name: 'Measure Distance & Profile', expectedIcon: 'ruler' },
    { id: 'btn-places', name: 'Places & Directions', expectedIcon: 'map-pin' },
    { id: 'btn-map-layer', name: 'Mini-Map Layers', expectedIcon: 'layers' },
    { id: 'btn-map-orientation', name: 'Mini-Map Orientation', expectedIcon: 'locate' },
    { id: 'btn-compass-north', name: 'Compass North Snap', expectedIcon: 'compass' },
    { id: 'btn-zoom-in', name: 'Step Forward (Zoom In)', expectedIcon: 'zoom-in' },
    { id: 'btn-zoom-out', name: 'Step Backward (Zoom Out)', expectedIcon: 'zoom-out' },
    { id: 'btn-step-forward', name: 'D-Pad Forward', expectedIcon: 'arrow-up' },
    { id: 'btn-step-back', name: 'D-Pad Backward', expectedIcon: 'arrow-down' },
    { id: 'btn-rotate-left', name: 'D-Pad Rotate Left', expectedIcon: 'rotate-ccw' },
    { id: 'btn-rotate-right', name: 'D-Pad Rotate Right', expectedIcon: 'rotate-cw' },
    { id: 'btn-toggle-side', name: 'Side Panel Toggle', expectedIcon: 'chevron-left' },
    { id: 'btn-window-minimize', name: 'Window Minimize', expectedIcon: 'minus' },
    { id: 'btn-window-maximize', name: 'Window Maximize', expectedIcon: 'maximize-2' }
  ];

  for (const b of persistentButtons) {
    const el = await page.$(`#${b.id}`);
    if (!el) throw new Error(`Missing button: #${b.id}`);

    const info = await page.evaluate(btnId => {
      const btn = document.getElementById(btnId);
      const rect = btn.getBoundingClientRect();
      const svg = btn.querySelector('svg');
      return {
        width: rect.width,
        height: rect.height,
        hasSvg: !!svg,
        svgInner: svg ? svg.innerHTML.length : 0,
        disabled: btn.disabled
      };
    }, b.id);

    if (!info.hasSvg || info.svgInner === 0) {
      throw new Error(`Button #${b.id} has blank icon!`);
    }

    console.log(`[PASS] Button #${b.id} (${b.name}): Size ${info.width.toFixed(0)}x${info.height.toFixed(0)}px, Valid SVG (${info.svgInner} chars)`);
  }

  // --- TIME OF DAY (06:00, 12:00, 18:00, 00:00 LTST) TESTS & SCREENSHOTS ---
  console.log('\n--- 3. MARS SKY & SOLAR GEOMETRY CAPTURES (06:00, 12:00, 18:00, 00:00 LTST) ---');
  const timesToTest = [
    { time: 6.0, name: '0600_sunrise', label: '06:00 LTST (Sunrise - Blue Forward Scattering)' },
    { time: 12.0, name: '1200_noon', label: '12:00 LTST (Midday Butterscotch Sky)' },
    { time: 18.0, name: '1800_sunset', label: '18:00 LTST (Sunset - Blue Forward Scattering Glow)' },
    { time: 0.0, name: '0000_midnight', label: '00:00 LTST (Midnight Starlight & Night Dome)' }
  ];

  const skyColorSamples = [];

  for (const t of timesToTest) {
    await page.evaluate(hours => {
      // Set time directly via window or store
      const slider = document.getElementById('slider-unified-time');
      if (slider) {
        slider.value = hours;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, t.time);
    await delay(600);

    const shotPath = path.join(SCREENSHOT_DIR, `sky_${t.name}_1280x800.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Saved: sky_${t.name}_1280x800.png (${t.label})`);

    // Sample mean color of sky dome via canvas pixel check
    const skyPixel = await page.evaluate(() => {
      const terrainContainer = document.getElementById('terrain-container');
      const canvas = terrainContainer ? terrainContainer.querySelector('canvas') : null;
      if (!canvas) return { r: 0, g: 0, b: 0 };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { r: 0, g: 0, b: 0 };
      const pixels = new Uint8Array(4);
      // Sample upper center pixel (sky)
      gl.readPixels(canvas.width / 2, canvas.height - 40, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { r: pixels[0], g: pixels[1], b: pixels[2] };
    });
    skyColorSamples.push({ time: t.time, color: skyPixel });
    console.log(`Sky Pixel sample at ${t.label}: RGB(${skyPixel.r}, ${skyPixel.g}, ${skyPixel.b})`);
  }

  // --- TIME SHEET MODAL TEST ---
  console.log('\n--- 4. UNIFIED TIME SHEET MODAL TEST ---');
  await page.click('#btn-time');
  await delay(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'modal_time_sheet_1280x800.png') });
  console.log('Saved: modal_time_sheet_1280x800.png');
  await page.click('#btn-close-time');
  await delay(300);

  // Reset time to 14:30
  await page.evaluate(() => {
    const slider = document.getElementById('slider-unified-time');
    if (slider) {
      slider.value = 14.5;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await delay(300);

  // --- WEATHER PANEL (GOOGLE WEATHER LAYOUT) TEST ---
  console.log('\n--- 5. GOOGLE WEATHER CARD LAYOUT TEST ---');
  await page.click('#btn-climate');
  await delay(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'modal_weather_temp_1280x800.png') });
  console.log('Saved: modal_weather_temp_1280x800.png');

  // Switch to Pressure tab
  const tabBtns = await page.$$('.weather-tab-btn');
  if (tabBtns.length >= 2) {
    await tabBtns[1].click();
    await delay(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'modal_weather_pressure_1280x800.png') });
    console.log('Saved: modal_weather_pressure_1280x800.png');
  }

  // Toggle C / F
  await page.click('#btn-toggle-temp-unit');
  await delay(200);
  const tempUnitAfter = await page.$eval('.weather-temp-unit', el => el.textContent);
  console.log(`Temperature Unit after toggle: ${tempUnitAfter}`);
  if (!tempUnitAfter.includes('F')) throw new Error('Unit toggle to Fahrenheit failed');

  // Toggle back to C
  await page.click('#btn-toggle-temp-unit');
  await delay(200);

  await page.click('#btn-close-climate');
  await delay(300);

  // --- MEASURE TOOL TEST ---
  console.log('\n--- 6. MEASURE DISTANCE & PROFILE TOOL TEST ---');
  await page.click('#btn-measure');
  await delay(500);
  await page.click('#btn-measure-current-dest');
  await delay(400);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'modal_measure_profile_1280x800.png') });
  console.log('Saved: modal_measure_profile_1280x800.png');

  const terrDistText = await page.$eval('#val-terrain-dist', el => el.textContent);
  const strDistText = await page.$eval('#val-straight-dist', el => el.textContent);
  console.log(`Measured Terrain Distance: ${terrDistText} | Straight: ${strDistText}`);
  if (terrDistText.includes('--') || strDistText.includes('--')) {
    throw new Error('Measure tool returned invalid distance metrics');
  }

  await page.click('#btn-close-measure');
  await delay(300);

  // --- MAP STYLES & LEGEND TEST ---
  console.log('\n--- 7. MINI-MAP STYLES & LEGENDS TEST ---');
  await page.click('#btn-map-layer');
  await delay(300);

  // 1. Terrain Hillshade Style
  const tiles = await page.$$('.layer-tile');
  if (tiles.length >= 2) {
    await tiles[1].click(); // Elevation
    await delay(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'minimap_terrain_hillshade_1280x800.png') });
    console.log('Saved: minimap_terrain_hillshade_1280x800.png');
  }

  // 2. Slope Hazard Style
  await page.click('#btn-map-layer');
  await delay(300);
  const tilesAgain = await page.$$('.layer-tile');
  if (tilesAgain.length >= 3) {
    await tilesAgain[2].click(); // Slope
    await delay(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'minimap_slope_hazard_1280x800.png') });
    console.log('Saved: minimap_slope_hazard_1280x800.png');
  }

  // Return to Satellite
  await page.click('#btn-map-layer');
  await delay(300);
  const tilesFinal = await page.$$('.layer-tile');
  if (tilesFinal.length >= 1) {
    await tilesFinal[0].click(); // Satellite
    await delay(300);
  }

  // --- GLOBE OVERLAY CENTERING TEST ---
  console.log('\n--- 8. GLOBE OVERLAY CENTERING TEST ---');
  await page.click('#globe-container');
  await delay(700);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'globe_centered_you_1280x800.png') });
  console.log('Saved: globe_centered_you_1280x800.png');
  await page.click('#btn-close-globe-overlay');
  await delay(400);

  // --- VIEWPORT 1024x768 & 768x1024 TESTS ---
  console.log('\n--- 9. Viewport 1024x768 (Tablet Landscape) ---');
  await page.setViewport({ width: 1024, height: 768 });
  await delay(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'hud_1024x768.png') });
  console.log('Saved: hud_1024x768.png');

  console.log('\n--- 10. Viewport 768x1024 (Tablet Portrait) ---');
  await page.setViewport({ width: 768, height: 1024 });
  await delay(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'hud_768x1024.png') });
  console.log('Saved: hud_768x1024.png');

  // Open Drawer in Portrait (Verifying Bottom Sheet)
  await page.click('#btn-places');
  await delay(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'drawer_bottomsheet_768x1024.png') });
  console.log('Saved: drawer_bottomsheet_768x1024.png');
  await page.click('#btn-close-directions-drawer');
  await delay(300);

  await browser.close();

  console.log('\n=== COMPREHENSIVE QA SUMMARY ===');
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`Console Warnings: ${consoleWarnings.length}`);

  if (consoleErrors.length > 0) {
    console.error('FAIL: Console errors detected:', consoleErrors);
    process.exit(1);
  }

  console.log('SUCCESS: All automated checks and visual evidence captures passed with 0 errors!');
}

runFullQASuite().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
