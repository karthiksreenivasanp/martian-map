/**
 * Martian Map - Shared State Store (Single Source of Truth)
 * Subscribed to by 3D Terrain HUD, 2D Mini Map, and Mars Planetary Globe.
 * Zero emojis.
 */

import { getAssetUrl } from './assets.js';

export const MARS_RADIUS_METERS = 3396190.0; // IAU 2000 Mars Mean Radius
export const DEFAULT_SUIT_PACE_MS = 1.4; // 1.4 m/s EVA suited astronaut pace (SIMULATED)
export const MAX_SUIT_PACE_MS = 3.0; // Maximum emergency suit sprint pace

export const DATA_REGISTRY = {
  globe_imagery: {
    id: 'globe_imagery',
    name: 'Mars Viking Colorized Global Mosaic',
    status: 'REAL',
    resolution: '232 m/px',
    filePath: getAssetUrl('data/globe/mars_viking_color_4096.jpg'),
    source: 'NASA/USGS Viking Orbiter MDIM 2.1',
    citation: 'NASA/USGS Astrogeology Science Center'
  },
  nomenclature: {
    id: 'nomenclature',
    name: 'Planetary Nomenclature Gazetteer',
    status: 'REAL',
    resolution: '2,055 IAU Named Features',
    filePath: getAssetUrl('data/places/mars_nomenclature.json'),
    source: 'USGS Astrogeology Science Center / IAU',
    citation: 'USGS Gazetteer of Planetary Nomenclature'
  },
  satellite_map: {
    id: 'satellite_map',
    name: 'Gale Crater Color Orthophoto Mosaic',
    status: 'REAL',
    resolution: '25 cm/px source · 2 m/px local window',
    filePath: getAssetUrl('data/map/satellite_4km.jpg'),
    source: 'NASA/JPL-Caltech/Univ. of Arizona/USGS',
    citation: 'MSL Gale HiRISE-LRGB 78 Quads Orthophoto'
  },
  terrain_dem: {
    id: 'terrain_dem',
    name: 'Gale Crater Topographic Hillshade',
    status: 'REAL',
    resolution: '1.95 m/px local window',
    filePath: getAssetUrl('data/map/terrain_hillshade_4km.jpg'),
    source: 'Derived from Gale Crater DEM',
    citation: 'Gale Crater Topographic Hillshade'
  },
  slope_map: {
    id: 'slope_map',
    name: 'Surface Slope Hazard Heatmap',
    status: 'REAL',
    resolution: '1.95 m/px local window',
    filePath: getAssetUrl('data/map/slope_4km.jpg'),
    source: 'Derived from Gale Crater Elevation Gradient',
    citation: 'EVA Safety Slope Raster (15 deg Safe Limit)'
  },
  three_d_terrain: {
    id: 'three_d_terrain',
    name: 'Gale Crater Walkway Terrain',
    status: 'SIMULATED',
    resolution: 'Procedural DTM with real HiRISE color albedo mapping',
    filePath: getAssetUrl('data/map/satellite_4km.jpg'),
    source: 'Terrain: DEM 1 m + imagery 25 cm (real); micro-detail: SIMULATED',
    citation: 'Simulated Gale Floor Topography'
  },
  climate: {
    id: 'climate',
    name: 'Curiosity REMS Surface Meteorology',
    status: 'SIMULATED',
    resolution: 'Typical diurnal Gale Crater values',
    filePath: 'NONE',
    source: 'SIMULATED typical values (Curiosity REMS baseline)',
    citation: 'SIMULATED typical values'
  }
};

export const DEFAULT_ORIGIN = {
  id: 'bradbury_landing',
  name: 'Bradbury Landing',
  lat: -4.5895,
  latitude: -4.5895,
  lon: 137.4417,
  longitude: 137.4417,
  elevation: -4501.0,
  elevation_m: -4501.0
};

export const GALE_CRATER_INFO = {
  name: 'Gale Crater',
  feature_type: 'Impact Crater',
  diameter_km: 154.0, // USGS Gazetteer Feature 2154
  depth_m: 5500.0, // Robbins & Hynek (2012) Mars Crater Database
  rim_elevation_m: 1000.0, // Median top 10% rim
  floor_elevation_m: -4501.0, // Median bottom 10% floor
  citation_gazetteer: 'USGS Gazetteer of Planetary Nomenclature',
  citation_catalog: 'Robbins & Hynek (2012) Mars Crater Database'
};

const initialState = {
  // Geodetic origin of the local tangent plane (Bradbury Landing, Gale Crater)
  origin: { ...DEFAULT_ORIGIN },

  // Astronaut real-time position
  position: {
    lat: -4.5895,
    latitude: -4.5895,
    lon: 137.4417,
    longitude: 137.4417,
    x: 0.0, // Easting in meters
    y: 0.0, // Northing in meters
    z: 0.0, // Relative elevation above landing datum
    elevation: -4501.0, // Absolute elevation in meters relative to MOLA datum
    elevation_m: -4501.0
  },

  // Heading in degrees: 0 = North, 90 = East, 180 = South, 270 = West
  heading: 82.0,

  // Selected destination (defaulting to nearby walkable Rocknest Sand Drift)
  destination: {
    id: 'rocknest',
    name: 'Rocknest Sand Drift',
    lat: -4.5898,
    latitude: -4.5898,
    lon: 137.4465,
    longitude: 137.4465,
    elevation: -4503.2,
    elevation_m: -4503.2,
    walkable: true
  },

  // Calculated route waypoints (segments <= 40m)
  route: [],
  activeWaypointIndex: 0,
  isRouteSimulated: true,
  walkingSpeedMs: DEFAULT_SUIT_PACE_MS,
  hasArrived: false,
  arrivalLocation: null,

  // Environment and map layers
  mapStyle: 'satellite', // 'satellite' | 'depth' | 'slope' | 'elevation' | 'mola'
  verticalExaggeration: 1, // 1 | 2 | 3
  
  // Mars Solar Time & Solar Geometry (Allison & McEwen 2000 / Mars24)
  ltstHours: 14.5, // 14:30 LTST
  solarLongitudeLs: 270.0, // Southern summer solstice Ls = 270 deg
  isTimePlaying: false,
  timeSpeed: 60.0, // 60x speed (1 hour per minute)
  solNumber: 3507,
  sunElevation: 35.0, // Elevation in degrees (driven by LTST)
  sunAzimuth: 135.0, // Azimuth in degrees (driven by LTST)
  dustHazeTau: 0.60, // Visible optical depth (0.10 to 3.00)

  // Surface telemetry (Curiosity REMS baseline model)
  climate: {
    tempC: -62.4,
    tempUnit: 'C', // 'C' | 'F'
    pressurePa: 748,
    windSpeedMs: 4.6,
    windDirectionDeg: 115,
    windDirectionText: 'ESE',
    localSolarTime: '14:30 LTST',
    isSimulated: true,
    activeTab: 'temp' // 'temp' | 'pressure' | 'wind'
  },

  // Measure Tool State
  measure: {
    active: false,
    pointA: null,
    pointB: null,
    terrainDist_m: 0,
    straightDist_m: 0,
    elevGain_m: 0,
    maxSlope_deg: 0,
    profilePoints: []
  },

  // Crater Info
  craterInfo: { ...GALE_CRATER_INFO },

  // Interface view states
  panelStates: {
    sidePanelCollapsed: typeof window !== 'undefined' ? window.innerWidth < 900 : false,
    miniMapExpanded: false,
    miniMapRotateWithHeading: false, // North-Up vs Heading-Up
    globeOverlayOpen: false,
    globeOverlayMode: 'globe', // 'globe' | 'flat'
    directionsDrawerOpen: false,
    recentPlaces: ['rocknest', 'bathurst_inlet', 'tintina_rock'],
    climateOpen: false,
    timeDialogOpen: false,
    measureOpen: false,
    helpTourActive: false,
    helpTourStep: 0,
    windowMinimized: false,
    windowMaximized: false,
    sessionEnded: false,
    isOffRoute: false
  },

  // Active toast notification: { type, message, id }
  toast: null,

  // Terrain status tag
  terrainDataMode: 'Terrain: DEM 1 m + imagery 25 cm (real); micro-detail: SIMULATED'
};

class StateStore {
  constructor(state) {
    this.state = state;
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    const prevState = { ...this.state };
    this.state = {
      ...this.state,
      ...partialState,
      panelStates: {
        ...this.state.panelStates,
        ...(partialState.panelStates || {})
      },
      position: {
        ...this.state.position,
        ...(partialState.position || {})
      },
      destination: partialState.destination ? {
        ...partialState.destination,
        lat: partialState.destination.lat !== undefined ? partialState.destination.lat : partialState.destination.latitude,
        latitude: partialState.destination.latitude !== undefined ? partialState.destination.latitude : partialState.destination.lat,
        lon: partialState.destination.lon !== undefined ? partialState.destination.lon : partialState.destination.longitude,
        longitude: partialState.destination.longitude !== undefined ? partialState.destination.longitude : partialState.destination.lon
      } : this.state.destination,
      climate: {
        ...this.state.climate,
        ...(partialState.climate || {})
      },
      measure: {
        ...this.state.measure,
        ...(partialState.measure || {})
      }
    };

    // Ensure latitude and longitude mirrors lat and lon
    if (this.state.position.lat !== undefined && this.state.position.latitude === undefined) {
      this.state.position.latitude = this.state.position.lat;
    }
    if (this.state.position.lon !== undefined && this.state.position.longitude === undefined) {
      this.state.position.longitude = this.state.position.lon;
    }

    this.notify(this.state, prevState);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(state, prevState) {
    for (const listener of this.listeners) {
      listener(state, prevState);
    }
  }
}

export const store = new StateStore(initialState);
