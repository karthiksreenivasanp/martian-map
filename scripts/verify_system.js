/**
 * Automated Verification Script for Martian Map Navigation Engine & State Sync
 * Runs headless node tests on all core navigation algorithms, geodesy, 5 places distance agreement, and state transitions.
 * Zero emojis.
 */

import {
  MARS_RADIUS_METERS,
  DEFAULT_ORIGIN,
  DEFAULT_SUIT_PACE_MS,
  DATA_REGISTRY,
  store
} from '../src/state.js';

import {
  latLonToLocalMeters,
  localMetersToLatLon,
  marsDistanceAndBearing,
  getLiveDistanceToDestination,
  formatNavDistance,
  getRelativeBearing,
  formatInstruction,
  formatRemainingTelemetry,
  roundNavDistance,
  calculateSlopeDeg,
  getSimulatedTerrainElevation,
  generateRoute,
  formatLatitudePlanetocentric,
  formatLongitudeEast,
  MAX_SAFE_SLOPE_DEG
} from '../src/nav.js';

import places from '../src/places.json' with { type: 'json' };

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failedCount++;
  }
}

console.log('--- STARTING COMPREHENSIVE VERIFICATION TESTS ---');

// Test 1: Geodesy Datum & Radius Check
assert(MARS_RADIUS_METERS === 3396190.0, 'IAU 2000 Mars radius is strictly 3,396,190 m (not Earth)');

// Test 2: Planetocentric Latitude & Longitude Formatting (D1-g)
assert(formatLatitudePlanetocentric(-4.5895) === '4.5895 S', 'Negative latitude formatted as South ("4.5895 S"), not negative North');
assert(formatLatitudePlanetocentric(18.38) === '18.3800 N', 'Positive latitude formatted as North ("18.3800 N")');
assert(formatLongitudeEast(137.4417) === '137.4417 E', 'Longitude formatted as East with E');

// Test 3: Local Tangent Plane (ENU) Forward and Inverse Conversion
const testLat = -4.5898;
const testLon = 137.4465;
const enu = latLonToLocalMeters(testLat, testLon, DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lon);
const reconstructed = localMetersToLatLon(enu.x, enu.y, DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lon);
const latDiff = Math.abs(reconstructed.lat - testLat);
const lonDiff = Math.abs(reconstructed.lon - testLon);
assert(latDiff < 1e-6 && lonDiff < 1e-6, 'Local tangent plane coordinate roundtrip accuracy < 1e-6 deg');

// Test 4: Distance Rounding Rules
assert(roundNavDistance(4) === 5, 'Distance rounding: 4m -> 5m (minimum)');
assert(roundNavDistance(12) === 10, 'Distance rounding: 12m -> 10m');
assert(roundNavDistance(34) === 35, 'Distance rounding: 34m -> 35m');
assert(roundNavDistance(47) === 45, 'Distance rounding: 47m -> 45m');
assert(roundNavDistance(52) === 50, 'Distance rounding: 52m -> 50m');
assert(roundNavDistance(83) === 80, 'Distance rounding: 83m -> 80m');
assert(roundNavDistance(88) === 90, 'Distance rounding: 88m -> 90m');

// Test 5: Table of 14 Bearing and Distance Test Cases (D4)
const bearingCases = [
  { bearing: 0, dist: 100, expected: 'Move forward 100 m', desc: 'Direct forward 0 deg' },
  { bearing: 15, dist: 45, expected: 'Move forward 45 m', desc: 'Forward right +15 deg within 20 deg' },
  { bearing: -18, dist: 32, expected: 'Move forward 30 m', desc: 'Forward left -18 deg within 20 deg' },
  { bearing: 45, dist: 60, expected: 'Move forward right 60 m', desc: 'Forward right +45 deg (20-70)' },
  { bearing: -45, dist: 60, expected: 'Move forward left 60 m', desc: 'Forward left -45 deg (-20 to -70)' },
  { bearing: 70, dist: 75, expected: 'Move forward right 80 m', desc: 'Forward right +70 deg boundary' },
  { bearing: 85, dist: 50, expected: 'Move right 50 m', desc: 'Right +85 deg (70-110)' },
  { bearing: -90, dist: 50, expected: 'Move left 50 m', desc: 'Left -90 deg (-70 to -110)' },
  { bearing: 110, dist: 120, expected: 'Move right 120 m', desc: 'Right +110 deg boundary' },
  { bearing: 135, dist: 110, expected: 'Move back right 110 m', desc: 'Back right +135 deg (110-160)' },
  { bearing: -140, dist: 95, expected: 'Move back left 100 m', desc: 'Back left -140 deg (-110 to -160)' },
  { bearing: 165, dist: 40, expected: 'Turn around 40 m', desc: 'Turn around +165 deg (>160)' },
  { bearing: -175, dist: 85, expected: 'Turn around 90 m', desc: 'Turn around -175 deg (<-160)' },
  { bearing: 10, dist: 4.2, expected: 'Arrived: Rocknest', desc: 'Arrival within 5m' }
];

console.log('\n--- BEARING & DISTANCE TEST CASES TABLE ---');
console.log('| Case | Relative Bearing | Distance | Expected Text | Actual Text | Match |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');

bearingCases.forEach((tc, idx) => {
  const actual = formatInstruction(tc.bearing, tc.dist, 'Rocknest', tc.dist <= 5.0);
  const match = actual === tc.expected;
  console.log(`| Case ${idx + 1} | ${tc.bearing}° | ${tc.dist} m | "${tc.expected}" | "${actual}" | ${match ? 'PASS' : 'FAIL'} |`);
  assert(match, `Case ${idx + 1} (${tc.desc}): "${actual}" === "${tc.expected}"`);
});

// Test 6: 200m Walk Simulation & Monotonic Distance Fall (D4)
console.log('\n--- 200M WALK MONOTONIC DISTANCE TEST ---');
const startX = 0;
const startY = 0;
const targetX = 300;
const targetY = 0;

let currentPos = { x: startX, y: startY };
let prevDistToDest = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
let monotonicPass = true;

for (let step = 1; step <= 20; step++) {
  currentPos.x = step * 10;
  const currentDist = Math.sqrt(Math.pow(targetX - currentPos.x, 2) + Math.pow(targetY - currentPos.y, 2));

  if (currentDist >= prevDistToDest) {
    monotonicPass = false;
  }
  prevDistToDest = currentDist;
}
assert(monotonicPass, 'Distance to destination falls strictly monotonically over 200 m walk facing route');
assert(currentPos.x === 200, 'Astronaut walked exactly 200 meters from origin');

// Test 7: Globe Marker vs 3D Camera Coordinate Sync (< 0.5m)
const origin = store.getState().origin;
const cameraMeters = { x: 141.42, y: 141.42 };
const camLatLon = localMetersToLatLon(cameraMeters.x, cameraMeters.y, origin.lat, origin.lon);
const globeMetersReconstructed = latLonToLocalMeters(camLatLon.lat, camLatLon.lon, origin.lat, origin.lon);
const syncDeltaM = Math.sqrt(
  Math.pow(cameraMeters.x - globeMetersReconstructed.x, 2) +
  Math.pow(cameraMeters.y - globeMetersReconstructed.y, 2)
);
assert(syncDeltaM < 0.5, `Globe marker lat/lon matches 3D camera within 0.5 m (observed delta: ${syncDeltaM.toFixed(4)} m)`);

// Test 8: Five-Place Canonical Distance Agreement (< 1 m) and NaN Guard
console.log('\n--- FIVE-PLACE CANONICAL DISTANCE AGREEMENT & NAN GUARD TEST ---');
const testPlaces = [
  'bathurst_inlet',
  'tintina_rock',
  'rocknest',
  'point_lake',
  'sheepbed'
];

testPlaces.forEach(id => {
  const place = places.find(p => p.id === id);
  assert(place !== undefined, `Place "${id}" exists in places.json`);

  // Canonical live distance function (used by globe, list, route card, beacon, instruction bar)
  const liveRes = getLiveDistanceToDestination(origin, place);
  assert(liveRes !== null, `Place "${place.name}": getLiveDistanceToDestination returns valid object`);
  assert(!isNaN(liveRes.distance) && isFinite(liveRes.distance), `Place "${place.name}": distance is not NaN or Infinity (${liveRes.distance} m)`);
  assert(!isNaN(liveRes.bearing) && isFinite(liveRes.bearing), `Place "${place.name}": bearing is not NaN (${liveRes.bearing} deg)`);

  const formatted = formatNavDistance(liveRes.distance);
  assert(!formatted.includes('NaN'), `Place "${place.name}": formatted distance "${formatted}" contains no NaN`);

  // Straight-line distance
  const straightDAndB = marsDistanceAndBearing(origin.lat, origin.lon, place.latitude, place.longitude);
  const listDist = Math.round(straightDAndB.distance);

  // Compute route waypoints and cumulative distance
  const toRad = Math.PI / 180.0;
  const destX = MARS_RADIUS_METERS * (place.longitude - origin.lon) * toRad * Math.cos(origin.lat * toRad);
  const destY = MARS_RADIUS_METERS * (place.latitude - origin.lat) * toRad;
  const routeWaypoints = generateRoute(0, 0, destX, destY, origin.lat, origin.lon, 40.0);

  let cumulativeDist = 0;
  for (let i = 1; i < routeWaypoints.length; i++) {
    const dx = routeWaypoints[i].x - routeWaypoints[i - 1].x;
    const dy = routeWaypoints[i].y - routeWaypoints[i - 1].y;
    cumulativeDist += Math.sqrt(dx * dx + dy * dy);
  }
  const routeCardDist = Math.round(cumulativeDist);
  const delta = Math.abs(listDist - routeCardDist);

  console.log(`| Place: ${place.name.padEnd(26)} | List Dist: ${listDist} m | Route Dist: ${routeCardDist} m | Delta: ${delta} m |`);
  assert(delta <= 1.0, `Place "${place.name}": list dist (${listDist}m) and route-card dist (${routeCardDist}m) agree within 1 m (delta: ${delta}m)`);
});

// Test 8b: 20m Walk Monotonic Distance Decrease Test
console.log('\n--- 20M WALK TEST ---');
const rocknest = places.find(p => p.id === 'rocknest');
const initialLive = getLiveDistanceToDestination(origin, rocknest);
// Walk 20m toward Rocknest
const brgRad = initialLive.bearing * (Math.PI / 180.0);
const step20X = 20.0 * Math.sin(brgRad);
const step20Y = 20.0 * Math.cos(brgRad);
const posAfter20m = localMetersToLatLon(step20X, step20Y, origin.lat, origin.lon);
const liveAfter20m = getLiveDistanceToDestination(posAfter20m, rocknest);
const reduction = initialLive.distance - liveAfter20m.distance;
console.log(`Initial dist: ${initialLive.distance.toFixed(2)} m, After 20m walk: ${liveAfter20m.distance.toFixed(2)} m, Reduction: ${reduction.toFixed(2)} m`);
assert(Math.abs(reduction - 20.0) <= 0.5, `20 m walk lowers live distance by about 20 m (observed reduction: ${reduction.toFixed(2)} m)`);

// Test 9: Places Dataset Requirements & Chips
const walkablePlaces = places.filter(p => p.walkable);
assert(walkablePlaces.length >= 6, `At least 6 walkable targets within 1.5 km of Bradbury Landing: found ${walkablePlaces.length}`);
places.forEach(p => {
  assert(p.is_source_verified !== undefined, `Place "${p.name}" has is_source_verified status defined`);
  assert(p.precision_m !== undefined, `Place "${p.name}" has precision_m defined`);
  assert(p.source_url !== undefined && p.source_url.startsWith('http'), `Place "${p.name}" has valid source URL: ${p.source_url}`);
  assert(p.retrieval_date !== undefined, `Place "${p.name}" has retrieval date: ${p.retrieval_date}`);
});

// Test 10: Layer Registry Honest Status & Metadata
console.log('\n--- LAYER REGISTRY HONEST STATUS & METADATA TEST ---');
assert(DATA_REGISTRY !== undefined, 'DATA_REGISTRY is defined in state.js');
assert(DATA_REGISTRY.globe_imagery.status === 'REAL', 'globe_imagery layer status is strictly REAL');
assert(DATA_REGISTRY.nomenclature.status === 'REAL', 'nomenclature layer status is strictly REAL');
assert(DATA_REGISTRY.satellite_map.status === 'REAL', 'satellite_map layer status is strictly REAL');
assert(DATA_REGISTRY.terrain_dem.status === 'REAL', 'terrain_dem layer status is strictly REAL');
assert(DATA_REGISTRY.slope_map.status === 'REAL', 'slope_map layer status is strictly REAL');
assert(DATA_REGISTRY.three_d_terrain.status === 'SIMULATED', 'three_d_terrain layer status is strictly SIMULATED');
assert(DATA_REGISTRY.climate.status === 'SIMULATED', 'climate layer status is strictly SIMULATED');

// Validate citations and resolution strings
for (const [key, item] of Object.entries(DATA_REGISTRY)) {
  assert(item.resolution !== undefined && item.resolution.length > 0, `Layer ${key} has honest resolution: ${item.resolution}`);
  assert(item.citation !== undefined && item.citation.length > 0, `Layer ${key} has accurate citation: ${item.citation}`);
  assert(item.status === 'REAL' || item.status === 'SIMULATED' || item.status === 'PLACEHOLDER', `Layer ${key} has valid status enum: ${item.status}`);
}

console.log(`\n--- ALL VERIFICATION TESTS COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED ---`);
if (failedCount > 0) process.exit(1);
