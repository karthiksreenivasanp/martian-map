/**
 * Martian Map - Geodesy and Navigation Logic
 * All calculations use IAU 2000 Mars Mean Sphere (R = 3,396,190 m).
 * Local tangent plane East-North-Up (ENU) in meters.
 * Mars solar geometry per Allison & McEwen (2000) / Mars24 formula.
 * Zero emojis.
 */

import { MARS_RADIUS_METERS, DEFAULT_SUIT_PACE_MS } from './state.js';

export const MAX_SAFE_SLOPE_DEG = 15.0; // Maximum safe EVA slope limit (15 deg)

/**
 * Format planetocentric latitude with hemisphere letter (never negative with N).
 */
export function formatLatitudePlanetocentric(lat) {
  if (typeof lat !== 'number' || isNaN(lat)) return '--';
  const absVal = Math.abs(lat).toFixed(4);
  return lat < 0 ? `${absVal} S` : `${absVal} N`;
}

/**
 * Format longitude as east-positive 0-360 with E.
 */
export function formatLongitudeEast(lon) {
  if (typeof lon !== 'number' || isNaN(lon)) return '--';
  const normalized = ((lon % 360.0 + 360.0) % 360.0).toFixed(4);
  return `${normalized} E`;
}

/**
 * Extract normalized latitude and longitude numbers from a destination or waypoint.
 */
export function getDestinationCoords(dest) {
  if (!dest) return null;
  const lat = typeof dest.lat === 'number' ? dest.lat : dest.latitude;
  const lon = typeof dest.lon === 'number' ? dest.lon : dest.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon) || !isFinite(lat) || !isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

/**
 * Convert Planetocentric Latitude and Longitude to Local Tangent Plane (ENU meters).
 */
export function latLonToLocalMeters(lat, lon, originLat, originLon, radius = MARS_RADIUS_METERS) {
  const toRad = Math.PI / 180.0;
  const dLatRad = (lat - originLat) * toRad;
  const dLonRad = (lon - originLon) * toRad;
  const originLatRad = originLat * toRad;

  const eastMeters = radius * dLonRad * Math.cos(originLatRad);
  const northMeters = radius * dLatRad;

  return { x: eastMeters, y: northMeters };
}

/**
 * Convert Local Tangent Plane (ENU meters) back to Planetocentric Latitude and Longitude.
 */
export function localMetersToLatLon(x, y, originLat, originLon, radius = MARS_RADIUS_METERS) {
  const toDeg = 180.0 / Math.PI;
  const originLatRad = (originLat * Math.PI) / 180.0;

  const lat = originLat + (y / radius) * toDeg;
  const lon = originLon + (x / (radius * Math.cos(originLatRad))) * toDeg;

  return { lat, lon };
}

/**
 * Calculate Great-Circle distance and forward azimuth (bearing) on Mars IAU 2000 Sphere.
 */
export function marsDistanceAndBearing(lat1, lon1, lat2, lon2, radius = MARS_RADIUS_METERS) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    console.error('[Nav] marsDistanceAndBearing called with NaN:', { lat1, lon1, lat2, lon2 });
    return { distance: NaN, bearing: NaN };
  }

  const toRad = Math.PI / 180.0;
  const toDeg = 180.0 / Math.PI;

  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaPhi = (lat2 - lat1) * toRad;
  const deltaLambda = (lon2 - lon1) * toRad;

  const a =
    Math.sin(deltaPhi / 2.0) * Math.sin(deltaPhi / 2.0) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) * Math.sin(deltaLambda / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0.0, 1.0 - a)));
  const distance = radius * c;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const bearing = (Math.atan2(y, x) * toDeg + 360.0) % 360.0;

  return { distance, bearing };
}

/**
 * ONE canonical function for live position to destination across ALL surfaces:
 * globe label, list rows, route card, 3D beacon, instruction bar.
 * Never renders NaN or Infinity; returns null and logs console.error on invalid inputs.
 */
export function getLiveDistanceToDestination(position, destination) {
  if (!position) {
    console.error('[Nav] Missing position in getLiveDistanceToDestination');
    return null;
  }
  if (!destination) {
    console.error('[Nav] Missing destination in getLiveDistanceToDestination');
    return null;
  }

  const posCoords = getDestinationCoords(position);
  const destCoords = getDestinationCoords(destination);

  if (!posCoords) {
    console.error('[Nav] Invalid position coordinates:', position);
    return null;
  }
  if (!destCoords) {
    console.error('[Nav] Invalid destination coordinates:', destination);
    return null;
  }

  const res = marsDistanceAndBearing(posCoords.lat, posCoords.lon, destCoords.lat, destCoords.lon);
  if (isNaN(res.distance) || !isFinite(res.distance) || isNaN(res.bearing) || !isFinite(res.bearing)) {
    console.error('[Nav] Calculation resulted in non-finite values:', res);
    return null;
  }

  return res;
}

/**
 * Format navigation distance safely without NaN or Infinity.
 * If distance is null/undefined/NaN/infinite, returns '--'.
 */
export function formatNavDistance(distanceMeters) {
  if (distanceMeters === null || distanceMeters === undefined || typeof distanceMeters !== 'number' || isNaN(distanceMeters) || !isFinite(distanceMeters)) {
    return '--';
  }
  if (distanceMeters < 1000.0) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000.0).toFixed(1)} km`;
}

/**
 * Compute relative bearing from current heading to target bearing.
 * Result in [-180, +180] deg: positive = right/clockwise, negative = left.
 */
export function getRelativeBearing(targetBearing, currentHeading) {
  return ((targetBearing - currentHeading + 540.0) % 360.0) - 180.0;
}

/**
 * Round navigation distance per specification:
 * Under 50m: nearest 5m (minimum 5m). 50m and above: nearest 10m.
 */
export function roundNavDistance(meters) {
  if (meters <= 5.0) return 5;
  if (meters < 50.0) {
    return Math.max(5, Math.round(meters / 5.0) * 5);
  }
  return Math.round(meters / 10.0) * 10;
}

/**
 * Format primary turn-by-turn instruction line.
 */
export function formatInstruction(relBearing, distanceMeters, destinationName, isArrived = false) {
  if (isArrived || distanceMeters <= 5.0) {
    return `Arrived: ${destinationName}`;
  }

  const distText = `${roundNavDistance(distanceMeters)} m`;
  const absRel = Math.abs(relBearing);

  if (absRel <= 20.0) {
    return `Move forward ${distText}`;
  }
  if (absRel > 160.0) {
    return `Turn around ${distText}`;
  }

  if (relBearing > 0) {
    // Right turns
    if (relBearing <= 70.0) return `Move forward right ${distText}`;
    if (relBearing <= 110.0) return `Move right ${distText}`;
    return `Move back right ${distText}`;
  } else {
    // Left turns
    if (relBearing >= -70.0) return `Move forward left ${distText}`;
    if (relBearing >= -110.0) return `Move left ${distText}`;
    return `Move back left ${distText}`;
  }
}

/**
 * Format secondary telemetry line: total remaining distance and estimated walking time.
 */
export function formatRemainingTelemetry(remainingMeters, paceMs = DEFAULT_SUIT_PACE_MS) {
  if (remainingMeters === null || remainingMeters === undefined || isNaN(remainingMeters) || !isFinite(remainingMeters)) {
    return 'Remaining -- m, about -- min';
  }
  if (remainingMeters <= 5.0) {
    return 'Destination reached (0 min)';
  }
  if (remainingMeters >= 1000.0) {
    const km = (remainingMeters / 1000.0).toFixed(1);
    const totalMinutes = Math.round(remainingMeters / (paceMs * 60.0));
    if (totalMinutes >= 120) {
      const hours = Math.round(totalMinutes / 60.0);
      return `Remaining ${km} km, about ${hours} hr`;
    }
    return `Remaining ${km} km, about ${totalMinutes} min`;
  }
  const roundedDist = roundNavDistance(remainingMeters);
  const minutes = Math.max(1, Math.round(remainingMeters / (paceMs * 60.0)));
  return `Remaining ${roundedDist} m, about ${minutes} min`;
}

/**
 * Calculate slope angle in degrees between two 3D points.
 */
export function calculateSlopeDeg(dx, dy, dz) {
  const horizontalDist = Math.sqrt(dx * dx + dy * dy);
  if (horizontalDist < 0.001) return 0.0;
  return Math.atan2(Math.abs(dz), horizontalDist) * (180.0 / Math.PI);
}

/**
 * Multi-scale procedural elevation profile for Gale Crater floor / Mount Sharp flank (SIMULATED).
 * Returns elevation in meters relative to landing datum (-4501.0 m MOLA).
 */
export function getSimulatedTerrainElevation(xMeters, yMeters) {
  // Gale crater floor is roughly -4500m datum.
  // Mount Sharp is south (negative Y in local tangent plane) rising 5.5 km.
  const distToMountSharp = Math.sqrt(xMeters * xMeters + Math.pow(yMeters + 12000.0, 2));
  const mountSharpGradient = Math.max(0, 4200.0 - distToMountSharp * 0.32);

  // Multi-scale topographic noise (ridges, dunes, hollows)
  const macroRidge = Math.sin(xMeters * 0.004 + yMeters * 0.003) * 12.0;
  const duneSwell = Math.cos(xMeters * 0.012 - yMeters * 0.009) * 4.8;
  const microRipples = Math.sin(xMeters * 0.035 + yMeters * 0.025) * 1.6;
  const smallCrater = -14.0 * Math.exp(-((Math.pow(xMeters - 120, 2) + Math.pow(yMeters - 90, 2)) / 3600.0));

  return (mountSharpGradient * 0.04) + macroRidge + duneSwell + microRipples + smallCrater;
}

/**
 * Horn method slope computation over >= 5m baseline (suppresses 1m DEM vertical quantization noise).
 * Uses a 3x3 window with cell spacing >= 5m.
 */
export function calculateHornSlope5m(x, y, cellSize = 5.0) {
  const z1 = getSimulatedTerrainElevation(x - cellSize, y + cellSize);
  const z2 = getSimulatedTerrainElevation(x, y + cellSize);
  const z3 = getSimulatedTerrainElevation(x + cellSize, y + cellSize);
  const z4 = getSimulatedTerrainElevation(x - cellSize, y);
  const z6 = getSimulatedTerrainElevation(x + cellSize, y);
  const z7 = getSimulatedTerrainElevation(x - cellSize, y - cellSize);
  const z8 = getSimulatedTerrainElevation(x, y - cellSize);
  const z9 = getSimulatedTerrainElevation(x + cellSize, y - cellSize);

  // Horn (1981) partial derivatives
  const dzdx = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * cellSize);
  const dzdy = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * cellSize);
  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  return +((slopeRad * 180.0) / Math.PI).toFixed(1);
}

/**
 * Mars Solar Geometry (Allison & McEwen 2000 / Mars24 formula).
 * Calculates solar elevation and azimuth from planetocentric latitude, Local True Solar Time (LTST),
 * and solar longitude (Ls).
 * Formula: sin(elev) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(HA)
 */
export function calculateMarsSolarAngles(latDeg, ltstHours, LsDeg = 270.0) {
  const phi = (latDeg * Math.PI) / 180.0;
  const Ls = (LsDeg * Math.PI) / 180.0;
  // Mars obliquity is ~25.19 deg, sin(25.19 deg) = 0.42565
  const sinDec = 0.42565 * Math.sin(Ls);
  const cosDec = Math.sqrt(Math.max(0, 1.0 - sinDec * sinDec));
  const decRad = Math.asin(sinDec);

  // Hour Angle: 15 deg per hour from solar noon (12:00)
  const H = (ltstHours - 12.0) * (Math.PI / 12.0);

  // Solar elevation
  const sinElev = Math.sin(phi) * sinDec + Math.cos(phi) * cosDec * Math.cos(H);
  const elevRad = Math.asin(Math.max(-1.0, Math.min(1.0, sinElev)));
  const elevDeg = (elevRad * 180.0) / Math.PI;

  // Solar azimuth measured clockwise from North (0 deg N, 90 deg E, 180 deg S, 270 deg W)
  const y = -Math.sin(H) * cosDec;
  const x = Math.cos(phi) * sinDec - Math.sin(phi) * cosDec * Math.cos(H);
  let azDeg = (Math.atan2(y, x) * (180.0 / Math.PI) + 360.0) % 360.0;

  return {
    elevationDeg: +elevDeg.toFixed(2),
    azimuthDeg: +azDeg.toFixed(2),
    sinElev,
    declinationDeg: +((decRad * 180.0) / Math.PI).toFixed(2)
  };
}

/**
 * Diurnal temperature curve (Curiosity REMS baseline).
 * Peak at 14:00 LTST (-18 deg C), minimum at 05:30 LTST (-78 deg C).
 */
export function calculateMarsTemperature(ltstHours) {
  const t = ((ltstHours % 24.0) + 24.0) % 24.0;
  // Gale Crater REMS diurnal model: Min -78 C at 05:00 (dawn), Max -18 C at 14:00 (mid-afternoon)
  if (t >= 5.0 && t <= 14.0) {
    const frac = (t - 5.0) / 9.0;
    const tempC = -78.0 + 60.0 * Math.sin(frac * Math.PI * 0.5);
    return +tempC.toFixed(1);
  } else {
    const tAfter = t > 14.0 ? t - 14.0 : t + 10.0;
    const frac = tAfter / 15.0;
    const tempC = -18.0 - 60.0 * Math.sin(frac * Math.PI * 0.5);
    return +tempC.toFixed(1);
  }
}

/**
 * Diurnal atmospheric pressure (Curiosity REMS baseline).
 * Semi-diurnal thermal tide peaks at 07:00 & 19:00 (~770 Pa), dips at 14:00 & 02:00 (~725 Pa).
 */
export function calculateMarsPressure(ltstHours) {
  const pMean = 748.0;
  const pTide = 22.0 * Math.cos(((ltstHours - 7.0) * Math.PI) / 6.0);
  return Math.round(pMean + pTide);
}

/**
 * Diurnal surface wind speed & vector (Curiosity REMS baseline).
 * Daytime thermal upslope breezes peak in afternoon ~8 m/s, nighttime gentle downslope ~2 m/s.
 */
export function calculateMarsWind(ltstHours) {
  const speed = 2.0 + 6.0 * Math.max(0, Math.sin(((ltstHours - 8.0) * Math.PI) / 14.0));
  const dirDeg = (115 + 20 * Math.sin((ltstHours * Math.PI) / 12.0) + 360) % 360;
  return {
    speed: +speed.toFixed(1),
    dirDeg: Math.round(dirDeg),
    dirText: 'ESE'
  };
}

/**
 * Format LTST hours to HH:MM LTST string.
 */
export function formatLocalSolarTime(ltstHours) {
  const norm = ((ltstHours % 24.0) + 24.0) % 24.0;
  const h = Math.floor(norm);
  const m = Math.floor((norm - h) * 60.0);
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm} LTST`;
}

/**
 * Compute elevation profile samples between Point A and Point B.
 */
export function computeElevationProfile(ptA, ptB, samples = 25) {
  const dx = ptB.x - ptA.x;
  const dy = ptB.y - ptA.y;
  const dist2D = Math.sqrt(dx * dx + dy * dy);
  const points = [];
  let maxSlope = 0.0;
  let elevGain = 0.0;
  let elevLoss = 0.0;
  let terrainDist = 0.0;
  let prevZ = getSimulatedTerrainElevation(ptA.x, ptA.y);

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = ptA.x + dx * t;
    const y = ptA.y + dy * t;
    const z = getSimulatedTerrainElevation(x, y);
    const datumElev = -4501.0 + z;
    const segDist = dist2D / samples;

    if (i > 0) {
      const dz = z - prevZ;
      terrainDist += Math.sqrt(segDist * segDist + dz * dz);
      if (dz > 0) elevGain += dz;
      else elevLoss += Math.abs(dz);
      const slope = (Math.atan2(Math.abs(dz), segDist) * 180.0) / Math.PI;
      if (slope > maxSlope) maxSlope = slope;
    }

    points.push({
      distanceAlong: t * dist2D,
      x,
      y,
      elevMola: +datumElev.toFixed(1),
      relativeElev: +z.toFixed(1)
    });
    prevZ = z;
  }

  const dzTotal = points[points.length - 1].relativeElev - points[0].relativeElev;
  const straightDist = Math.sqrt(dist2D * dist2D + dzTotal * dzTotal);

  return {
    points,
    straightDist: +straightDist.toFixed(1),
    terrainDist: +terrainDist.toFixed(1),
    elevGain: +elevGain.toFixed(1),
    elevLoss: +elevLoss.toFixed(1),
    maxSlope: +maxSlope.toFixed(1)
  };
}

/**
 * Generate slope-conscious route waypoints between start and destination.
 * Waypoints are segmented into <= 40m chunks along direct line of sight
 * so straight-line distance and cumulative route distance agree within 1 m.
 */
export function generateRoute(startX, startY, endX, endY, originLat, originLon, maxSegmentM = 40.0) {
  if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
    console.error('[Nav] generateRoute received NaN inputs:', { startX, startY, endX, endY });
    return [];
  }

  const dx = endX - startX;
  const dy = endY - startY;
  const totalDist = Math.sqrt(dx * dx + dy * dy);

  const waypoints = [];

  // For planetary destinations (> 2000m away, outside local 4km DEM):
  // Generate local surface departure corridor (up to 1200m in 40m chunks)
  // followed by the destination waypoint, preventing memory bloat of 65,000+ redundant nodes.
  if (totalDist > 2000.0) {
    const localDepartureDist = 1200.0;
    const localSteps = Math.ceil(localDepartureDist / maxSegmentM);

    for (let i = 0; i <= localSteps; i++) {
      const t = (i / localSteps) * (localDepartureDist / totalDist);
      const x = startX + dx * t;
      const y = startY + dy * t;
      const z = getSimulatedTerrainElevation(x, y);
      const { lat, lon } = localMetersToLatLon(x, y, originLat, originLon);

      waypoints.push({
        x,
        y,
        z,
        lat,
        latitude: lat,
        lon,
        longitude: lon,
        elevation: -4501.0 + z,
        elevation_m: -4501.0 + z
      });
    }

    // Append destination target endpoint
    const { lat: destLat, lon: destLon } = localMetersToLatLon(endX, endY, originLat, originLon);
    waypoints.push({
      x: endX,
      y: endY,
      z: 0,
      lat: destLat,
      latitude: destLat,
      lon: destLon,
      longitude: destLon,
      elevation: -4501.0,
      elevation_m: -4501.0
    });

    return waypoints;
  }

  const steps = Math.max(2, Math.ceil(totalDist / maxSegmentM));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + dx * t;
    const y = startY + dy * t;
    const z = getSimulatedTerrainElevation(x, y);

    const { lat, lon } = localMetersToLatLon(x, y, originLat, originLon);

    waypoints.push({
      x,
      y,
      z,
      lat,
      latitude: lat,
      lon,
      longitude: lon,
      elevation: -4501.0 + z,
      elevation_m: -4501.0 + z
    });
  }

  return waypoints;
}
