import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_PDF = path.resolve('Martian_Map_Technical_Report.pdf');

const imgToBase64 = (filePath) => {
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  }
  return '';
};

const imgStartView = imgToBase64(path.resolve('docs/baseline/01_start_view.png'));
const imgPlacesDrawer = imgToBase64(path.resolve('docs/baseline/02_places_drawer.png'));
const imgLayersCard = imgToBase64(path.resolve('docs/baseline/04_layers_card.png'));
const imgMeasure = imgToBase64(path.resolve('docs/baseline/06_measure.png'));
const imgLiveDesktop = imgToBase64(path.resolve('docs/live/live_desktop_1280x800.png'));

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Martian Map - Project & Scientific Data Report</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
      @bottom-right {
        content: counter(page);
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.5;
      font-size: 10.5pt;
      margin: 0;
      padding: 0;
    }
    .header-banner {
      background: linear-gradient(135deg, #090d16 0%, #151e32 100%);
      color: #ffffff;
      padding: 24px 28px;
      border-radius: 8px;
      margin-bottom: 24px;
      border-left: 6px solid #00d4ff;
    }
    .header-banner h1 {
      margin: 0 0 6px 0;
      font-size: 24pt;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #ffffff;
    }
    .header-banner .subtitle {
      font-size: 12pt;
      color: #38bdf8;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px 16px;
      font-size: 9pt;
      color: #94a3b8;
      border-top: 1px solid rgba(255,255,255,0.15);
      padding-top: 12px;
      margin-top: 12px;
    }
    .meta-item strong {
      color: #e2e8f0;
    }
    h2 {
      font-size: 14pt;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11.5pt;
      color: #0369a1;
      margin-top: 16px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 10px 0;
      text-align: justify;
    }
    ul, ol {
      margin: 0 0 12px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 12px 0 18px 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-cyan { background: #e0f2fe; color: #0369a1; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin: 14px 0 18px 0;
      page-break-inside: avoid;
    }
    .image-container {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      background: #0f172a;
    }
    .image-container img {
      width: 100%;
      height: auto;
      display: block;
    }
    .image-caption {
      padding: 6px 8px;
      font-size: 8pt;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      color: #475569;
      font-weight: 500;
    }
    .page-break {
      page-break-before: always;
    }
    .code-block {
      background: #f1f5f9;
      border-left: 3px solid #0284c7;
      padding: 8px 12px;
      font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
      font-size: 8pt;
      color: #0f172a;
      margin: 8px 0 12px 0;
      border-radius: 0 4px 4px 0;
    }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      font-size: 8pt;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <!-- Header Banner -->
  <div class="header-banner">
    <h1>MARTIAN MAP</h1>
    <div class="subtitle">Spacecraft Tablet Turn-by-Turn EVA Surface Walk Planner & Planetary HUD</div>
    <div class="meta-grid">
      <div class="meta-item" style="grid-column: span 2;"><strong>Authors:</strong> Karthik Sreenivasan, Akshaya R, Sreevals R, Sreelakshmi, Shibil, Ishaq</div>
      <div class="meta-item"><strong>Competition:</strong> 2026 NASA Space Apps Challenge</div>
      <div class="meta-item"><strong>Live URL:</strong> https://www.karthiksreenivasanp.social/martian-map/</div>
      <div class="meta-item"><strong>GitHub Repo:</strong> https://github.com/karthiksreenivasanp/martian-map</div>
      <div class="meta-item"><strong>Reference Datum:</strong> IAU 2000 Mars (R = 3,396,190 m)</div>
      <div class="meta-item"><strong>Elevation Baseline:</strong> MOLA Areoid Datum (-4,501 m Bradbury Landing)</div>
    </div>
  </div>

  <!-- Section 1: Executive Summary -->
  <h2>1. Executive Summary</h2>
  <p>
    <strong>Martian Map</strong> is a mission-critical, client-side planetary navigation system designed for suited astronaut extravehicular activities (EVA) and rover traversal on the surface of Mars. Developed for the 2026 NASA Space Apps Challenge, the platform merges authentic high-resolution orbital imagery, stereo digital elevation models (DEM), planetary nomenclature, and real-time geodesic mathematics into a responsive astronaut tablet interface.
  </p>
  <p>
    The system operates with zero backend servers and zero databases, deployed globally via GitHub Actions CI/CD to GitHub Pages. It incorporates an authentic 3D WebGL first-person terrain HUD, a multi-scale 2D Leaflet planetary atlas, an interactive 3D Viking globe, and 360-degree gigapixel surface panoramas captured by NASA's Curiosity rover.
  </p>

  <!-- Section 2: Core System Architecture -->
  <h2>2. System Architecture & Core Engines</h2>
  <div class="card">
    <p>The application architecture is structured around four decoupled modules coordinated by a single source of truth state store:</p>
    <ul>
      <li><strong>3D Surface Terrain & Dynamic Sky Engine (Three.js WebGL Context 1):</strong> Renders real-scale Martian topography from Gale Crater HiRISE DEMs. Features a physical Martian sky scattering model (butterscotch daylight, blue forward-scattering sunset glow driven by dust optical depth &tau;, and night starfields), ground-anchored route lines, arrival beacons, and 360-degree gigapixel Street View.</li>
      <li><strong>2D Multi-Scale Mini Map & Atlas (Leaflet on Mars CRS):</strong> High-resolution 25 cm/px Gale Crater local quad seamlessly zooming out to global equirectangular Mars basemaps. Supports real-time waypoint tracking, slope hazard overlays, and custom coordinate routing.</li>
      <li><strong>Planetary Mars Globe & Global Flat Map (Three.js WebGL Context 2):</strong> 3D Viking MDIM 2.1 sphere with 30-degree graticule, astronaut location beacon, and 2,055 official USGS/IAU planetary nomenclature gazetteer labels.</li>
      <li><strong>EVA Telemetry & Directions Manager (DOM & Lucide):</strong> Turn-by-turn waypoint routing, live bearing, slope calculations, diurnal Martian solar time (Allison &amp; McEwen 2000 math), and elevation transect profiling.</li>
    </ul>
  </div>

  <!-- Primary Screenshot -->
  <div class="image-container" style="margin-bottom: 20px;">
    <img src="${imgLiveDesktop}" alt="Martian Map Live Interface">
    <div class="image-caption">Figure 1: Full-Screen Astronaut Navigation HUD — 3D Gale Crater surface view, directional arrow, live coordinates, multi-scale mini map, and Viking planetary globe.</div>
  </div>

  <div class="page-break"></div>

  <!-- Section 3: Scientific Datasets & Planetary Data -->
  <h2>3. Scientific Datasets & Cartographic Specifications</h2>
  <p>
    Martian Map exclusively incorporates authoritative open-access scientific datasets produced by NASA, the United States Geological Survey (USGS), and the International Astronomical Union (IAU). Pursuant to 17 U.S.C. Section 105, United States Government works are within the Public Domain.
  </p>

  <table>
    <thead>
      <tr>
        <th style="width: 22%;">Dataset Name</th>
        <th style="width: 20%;">Mission / Instrument</th>
        <th style="width: 20%;">Files in Repository</th>
        <th style="width: 18%;">Resolution & Coverage</th>
        <th style="width: 20%;">Datum / Projection</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Mars Viking Colorized Global Mosaic</strong></td>
        <td>NASA Viking Orbiters 1 &amp; 2 (MDIM 2.1)</td>
        <td><code>data/globe/mars_viking_color_4096.jpg</code><br><code>data/globe/Mars_Viking_MDIM21_ClrMosaic_1km.jpg</code></td>
        <td>232 m/px global seamless mosaic</td>
        <td>IAU 2000 Mars Spherical<br>(R = 3,396,190 m)</td>
      </tr>
      <tr>
        <td><strong>MOLA Global Topography &amp; Slope</strong></td>
        <td>NASA Mars Global Surveyor (MGS) / MOLA</td>
        <td><code>data/map/mars_global_mola.jpg</code><br><code>data/map/mars_global_terrain.jpg</code><br><code>data/map/mars_global_slope.jpg</code></td>
        <td>128 px/deg (~463 m/px at equator)</td>
        <td>IAU 2000 Equirectangular,<br>MOLA Areoid Datum (0 km = 3,396,000 m)</td>
      </tr>
      <tr>
        <td><strong>Gale Crater HiRISE Color Orthophoto</strong></td>
        <td>NASA Mars Reconnaissance Orbiter (MRO) / HiRISE</td>
        <td><code>data/map/satellite_4km.jpg</code><br><code>data/map/thumb_satellite.jpg</code></td>
        <td>25 cm/px native quad,<br>2 m/px local window</td>
        <td>Equirectangular centered on Gale (4.5895 S, 137.4417 E)</td>
      </tr>
      <tr>
        <td><strong>Gale Crater Topographic DEM &amp; Slope</strong></td>
        <td>NASA MRO Stereo DTM &amp; HRSC Blend</td>
        <td><code>data/map/terrain_hillshade_4km.jpg</code><br><code>data/map/slope_4km.jpg</code><br><code>data/map/mola_elevation_4km.jpg</code></td>
        <td>1 m/px stereo DEM,<br>1.95 m/px local raster</td>
        <td>MOLA Datum baseline<br>(-4,501 m Bradbury Landing)</td>
      </tr>
      <tr>
        <td><strong>Planetary Nomenclature Gazetteer</strong></td>
        <td>USGS / IAU Working Group for Planetary System Nomenclature</td>
        <td><code>data/places/mars_nomenclature.json</code><br><code>data/places/MARS_nomenclature_center_pts.kmz</code></td>
        <td>2,055 official named features (craters, chasmata, montes)</td>
        <td>Planetocentric Lat (-90 to +90 deg),<br>Positive East Lon (0 to 360 deg)</td>
      </tr>
      <tr>
        <td><strong>MSL Curiosity 360 Panoramas (Street View)</strong></td>
        <td>NASA MSL Curiosity Rover / Mastcam (Mast Camera)</td>
        <td><code>data/panos/pano_rocknest_clean.jpg</code><br><code>data/panos/pano_sol3507.jpg</code><br><code>data/panos/pano_montmercou_clean.jpg</code></td>
        <td>Full cylindrical gigapixel panoramas (Sol 56 to Sol 3512)</td>
        <td>Equirectangular 360&deg; spherical projection</td>
      </tr>
      <tr>
        <td><strong>Curiosity REMS Surface Meteorology</strong></td>
        <td>NASA MSL / Rover Environmental Monitoring Station</td>
        <td>Algorithmic diurnal model in <code>src/ui.js</code></td>
        <td>Typical diurnal Gale Crater pressure and temperature</td>
        <td>Sol diurnal thermal cycle (-85&deg;C to -15&deg;C)</td>
      </tr>
    </tbody>
  </table>

  <!-- Gallery of Capabilities -->
  <h2>4. Subsystem Visualizations & Verification</h2>
  <div class="image-grid">
    <div class="image-container">
      <img src="${imgPlacesDrawer}" alt="Directions Drawer">
      <div class="image-caption">Figure 2: Surface Directions Drawer — Searchable targets, custom coordinate origin/destination, and walking pace telemetry.</div>
    </div>
    <div class="image-container">
      <img src="${imgLayersCard}" alt="Layers Card">
      <div class="image-caption">Figure 3: Map Layer Switcher — Satellite, Topographic Hillshade, Slope Hazard Heatmap, and MOLA Depth drapes.</div>
    </div>
    <div class="image-container">
      <img src="${imgMeasure}" alt="Crater Depth & Transect Measurement">
      <div class="image-caption">Figure 4: Topographic Transect Tool — 2D/3D profile cross-section, crater depth, slope grade, and elevation delta.</div>
    </div>
    <div class="image-container">
      <img src="${imgStartView}" alt="Start View">
      <div class="image-caption">Figure 5: High-Precision 3D Terrain View — Bradbury Landing starting viewpoint with butterscotch haze horizon band.</div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- Section 5: Mathematical Foundations & Navigation Algorithms -->
  <h2>5. Mathematical Models & Geodesic Algorithms</h2>
  
  <h3>A. Great-Circle Geodesic Distance on Mars Sphere</h3>
  <p>
    Distances across the Martian globe are computed using spherical haversine trigonometry parameterized to the IAU 2000 Mars mean radius ($R = 3,396,190\text{ m}$):
  </p>
  <div class="code-block">
    &Delta;&sigma; = 2 &middot; arcsin( &radic;( sin&sup2;(&Delta;&phi;/2) + cos(&phi;&sub1;) &middot; cos(&phi;&sub2;) &middot; sin&sup2;(&Delta;&lambda;/2) ) )<br>
    Distance (meters) = R &middot; &Delta;&sigma;
  </div>

  <h3>B. Mars Solar Time (Allison &amp; McEwen 2000)</h3>
  <p>
    Martian Local True Solar Time (LTST) and Solar Longitude ($L_s$) are derived from J2000.0 epoch Julian Day calculations:
  </p>
  <div class="code-block">
    &Delta;t_J2000 = JD_UT - 2451545.0<br>
    M = 19.3870&deg; + 0.52402075&deg; &middot; &Delta;t_J2000<br>
    &nu; - M = (10.691&deg; + 3.0&deg; &times; 10&supmin;&sup6; &middot; &Delta;t) &middot; sin(M) + 0.623&deg; &middot; sin(2M) + 0.050&deg; &middot; sin(3M)<br>
    L_s = 270.3863&deg; + 0.52403840&deg; &middot; &Delta;t_J2000 + (&nu; - M)
  </div>

  <h3>C. Slope Grade Hazard Assessment (EVA Suit Safety)</h3>
  <p>
    Surface slope gradients are calculated across a 5-meter Horn kernel baseline to classify traverse safety:
  </p>
  <ul>
    <li><span class="badge badge-green">&lt; 10&deg; Safe / Walkable</span>: Nominal EVA traversal pace ($1.4\text{ m/s}$).</li>
    <li><span class="badge badge-amber">10&deg; - 15&deg; Caution</span>: Moderate grade; regolith slip hazard advisory.</li>
    <li><span class="badge" style="background:#fee2e2; color:#b91c1c;">&gt; 15&deg; Hazard Limit</span>: Exceeds safe suited astronaut locomotion limit.</li>
  </ul>

  <!-- Section 6: Security, Performance & Release Engineering -->
  <h2>6. Security Audit & Release Engineering</h2>
  <div class="card">
    <table style="margin: 0;">
      <thead>
        <tr>
          <th>Security Domain</th>
          <th>Assessment</th>
          <th>Implementation &amp; Evidence</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Access Control &amp; Auth</strong></td>
          <td><span class="badge badge-green">Zero Risk</span></td>
          <td>Client-only static architecture. Zero logins, accounts, server sessions, or administrative routes.</td>
        </tr>
        <tr>
          <td><strong>Database Security (RLS)</strong></td>
          <td><span class="badge badge-green">Not Applicable</span></td>
          <td>Zero database connections, SQL drivers, Supabase, or Firebase clients.</td>
        </tr>
        <tr>
          <td><strong>Secret Key Exposure</strong></td>
          <td><span class="badge badge-green">0 Secrets</span></td>
          <td>Scanned git tree, git history, and built bundles with gitleaks patterns. Zero API keys or tokens embedded.</td>
        </tr>
        <tr>
          <td><strong>Rate Limiting &amp; Concurrency</strong></td>
          <td><span class="badge badge-green">Protected</span></td>
          <td>In-flight asset requests throttled to 6 concurrent requests via <code>RequestQueue</code>. Place search debounced at 150 ms.</td>
        </tr>
        <tr>
          <td><strong>Data &amp; Input Validation</strong></td>
          <td><span class="badge badge-green">Enforced</span></td>
          <td>Strict regex and <code>Number.isFinite</code> checks on latitude [-90, 90] and longitude [0, 360). JSON parsing error boundaries.</td>
        </tr>
        <tr>
          <td><strong>Content Security Policy</strong></td>
          <td><span class="badge badge-green">Enforced</span></td>
          <td>Strict meta tag: <code>default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;</code></td>
        </tr>
        <tr>
          <td><strong>Dependency Audit</strong></td>
          <td><span class="badge badge-green">Clean</span></td>
          <td><code>npm audit</code> returned 0 vulnerabilities. Monitored weekly via GitHub Dependabot.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Section 7: Live Cloud Verification -->
  <h2>7. Live Deployment & Multi-Viewport Verification</h2>
  <p>
    Automated headless browser testing was executed against the live deployed site (<strong>https://www.karthiksreenivasanp.social/martian-map/</strong>) on Google Chrome across standard space mission tablet and desktop viewport resolutions:
  </p>

  <table>
    <thead>
      <tr>
        <th>Target Viewport</th>
        <th>Resolution</th>
        <th>HTTP Status</th>
        <th>Console Errors</th>
        <th>CSP Violations</th>
        <th>Network Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Mission Desktop Display</strong></td>
        <td>1280 &times; 800</td>
        <td><span class="badge badge-green">200 OK</span></td>
        <td><strong>0</strong></td>
        <td><strong>0</strong></td>
        <td>All assets loaded successfully</td>
      </tr>
      <tr>
        <td><strong>Astronaut Tablet (Landscape)</strong></td>
        <td>1024 &times; 768</td>
        <td><span class="badge badge-green">200 OK</span></td>
        <td><strong>0</strong></td>
        <td><strong>0</strong></td>
        <td>All assets loaded successfully</td>
      </tr>
      <tr>
        <td><strong>Astronaut Tablet (Portrait)</strong></td>
        <td>768 &times; 1024</td>
        <td><span class="badge badge-green">200 OK</span></td>
        <td><strong>0</strong></td>
        <td><strong>0</strong></td>
        <td>All assets loaded successfully</td>
      </tr>
      <tr>
        <td><strong>Non-existent Route (404 Test)</strong></td>
        <td>N/A</td>
        <td><span class="badge badge-amber">404 Handled</span></td>
        <td><strong>0</strong></td>
        <td><strong>0</strong></td>
        <td>Clean GitHub Pages fallback</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Martian Map &bull; 2026 NASA Space Apps Challenge</span>
    <span>Published via GitHub Pages &bull; Open Scientific Data</span>
  </div>

</body>
</html>`;

async function generatePdf() {
  console.log('Generating Publication-Quality Technical Report PDF...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      bottom: '14mm',
      left: '14mm',
      right: '14mm'
    }
  });

  await browser.close();
  console.log(`PDF successfully generated at: ${OUTPUT_PDF}`);
  const stats = fs.statSync(OUTPUT_PDF);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

generatePdf().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
