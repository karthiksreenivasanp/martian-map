/**
 * Martian Map - 2D Mars Mini Map & Planetary Atlas (Leaflet)
 * Realized with Leaflet using Mars Equirectangular Coordinates [lat, lon] in L.CRS.Simple.
 * - Global Mars Equirectangular Basemap: [[-90, 0], [90, 360]]
 * - Local High-Resolution Gale Crater Quad (25 cm/px HiRISE): [[-4.62324, 137.40785], [-4.55576, 137.47555]]
 * Fixed at bottom-left; tapping map toggles enlarge / original size.
 * Seamless multi-scale zoom like NASA Mars Trek, revealing surrounding Mars landmarks on zoom-out.
 * Directional red arrow user location marker matching HUD arrow, clean solid blue route line (zero dots),
 * real distances in km (e.g. 23 km) or meters, working location re-center button.
 * Zero emojis.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { store, MARS_RADIUS_METERS } from './state.js';
import { getIcon } from './icons.js';
import { getAssetUrl } from './assets.js';
import {
  computeElevationProfile,
  formatNavDistance,
  getLiveDistanceToDestination,
  getSimulatedTerrainElevation,
  latLonToLocalMeters,
  localMetersToLatLon,
  marsDistanceAndBearing,
  formatLatitudePlanetocentric,
  formatLongitudeEast
} from './nav.js';

/**
 * Custom Mars Equirectangular GridLayer (Tiled Canvas)
 * Subdivides Mars planetary coordinate space into 256x256 canvases.
 * Prevents Chrome GPU compositing limits on massive image overlays,
 * completely eliminating grey voids at any zoom level from planetary overview to local crater.
 */
const MarsEquirectangularLayer = L.GridLayer.extend({
  initialize: function (options) {
    L.GridLayer.prototype.initialize.call(this, options);
    this.sourceImage = new Image();
    this.isLoaded = false;
    this.sourceImage.onload = () => {
      this.isLoaded = true;
      this.redraw();
    };
    if (options && options.url) {
      this.sourceImage.src = options.url;
    }
  },

  setImageUrl: function (url) {
    if (this.sourceImage && this.sourceImage.src && this.sourceImage.src.endsWith(url)) return;
    this.isLoaded = false;
    this.sourceImage = new Image();
    this.sourceImage.onload = () => {
      this.isLoaded = true;
      this.redraw();
    };
    this.sourceImage.src = url;
  },

  createTile: function (coords, done) {
    const tile = document.createElement('canvas');
    tile.width = 256;
    tile.height = 256;
    const ctx = tile.getContext('2d');

    if (!this.isLoaded || !this.sourceImage.naturalWidth) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, 256, 256);
      setTimeout(() => done(null, tile), 15);
      return tile;
    }

    const bounds = this._tileCoordsToBounds(coords);
    const minLon = bounds.getWest();
    const maxLon = bounds.getEast();
    const maxLat = bounds.getNorth();
    const minLat = bounds.getSouth();

    if (maxLon <= 0 || minLon >= 360 || maxLat <= -90 || minLat >= 90) {
      ctx.fillStyle = '#060810';
      ctx.fillRect(0, 0, 256, 256);
      done(null, tile);
      return tile;
    }

    const cMinLon = Math.max(0, Math.min(360, minLon));
    const cMaxLon = Math.max(0, Math.min(360, maxLon));
    const cMinLat = Math.max(-90, Math.min(90, minLat));
    const cMaxLat = Math.max(-90, Math.min(90, maxLat));

    const W = this.sourceImage.naturalWidth;
    const H = this.sourceImage.naturalHeight;

    const sx = (cMinLon / 360.0) * W;
    const sy = ((90.0 - cMaxLat) / 180.0) * H;
    const sWidth = Math.max(1, ((cMaxLon - cMinLon) / 360.0) * W);
    const sHeight = Math.max(1, ((cMaxLat - cMinLat) / 180.0) * H);

    const tileLonSpan = maxLon - minLon;
    const tileLatSpan = maxLat - minLat;

    const dx = tileLonSpan > 0 ? ((cMinLon - minLon) / tileLonSpan) * 256 : 0;
    const dy = tileLatSpan > 0 ? ((maxLat - cMaxLat) / tileLatSpan) * 256 : 0;
    const dWidth = tileLonSpan > 0 ? ((cMaxLon - cMinLon) / tileLonSpan) * 256 : 256;
    const dHeight = tileLatSpan > 0 ? ((cMaxLat - cMinLat) / tileLatSpan) * 256 : 256;

    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(this.sourceImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

    done(null, tile);
    return tile;
  }
});

export class MiniMapView {
  constructor(containerElement) {
    this.container = containerElement;
    this.map = null;
    this.imageOverlay = null;
    this.globalTileLayer = null;
    this.graticuleLayer = null;
    this.planetaryLabelsLayer = null;

    this.userMarker = null;
    this.headingCone = null;
    this.destMarker = null;
    this.routeHalo = null;
    this.routeCore = null;
    this.measureMarkers = [];
    this.measureLine = null;

    this.isExpanded = false;
    this.currentStyle = 'satellite';
    window.__marsMiniMap = this;

    // Local Gale Crater 4km quad layers
    this.layerUrls = {
      satellite: getAssetUrl('data/map/satellite_4km.jpg'),
      depth: getAssetUrl('data/map/mola_elevation_4km.jpg'),
      threed: getAssetUrl('data/map/mola_elevation_4km.jpg'),
      terrain: getAssetUrl('data/map/terrain_hillshade_4km.jpg'),
      slope: getAssetUrl('data/map/slope_4km.jpg'),
      elevation: getAssetUrl('data/map/mola_elevation_4km.jpg'),
      mola: getAssetUrl('data/map/mola_elevation_4km.jpg')
    };

    // Global Mars Equirectangular Atlas layers
    this.globalLayerUrls = {
      satellite: getAssetUrl('data/map/mars_global_satellite.jpg'),
      depth: getAssetUrl('data/map/mars_global_mola.jpg'),
      threed: getAssetUrl('data/map/mars_global_mola.jpg'),
      terrain: getAssetUrl('data/map/mars_global_terrain.jpg'),
      slope: getAssetUrl('data/map/mars_global_slope.jpg'),
      elevation: getAssetUrl('data/map/mars_global_mola.jpg'),
      mola: getAssetUrl('data/map/mars_global_mola.jpg')
    };

    this.init();
  }

  init() {
    this.initMap();
    this.setupControls();

    store.subscribe((state, prevState) => this.onStateChange(state, prevState));
    this.updateFromState(store.getState());
  }

  initMap() {
    // Mars Equirectangular Coordinates: Lat [-90, +90], Lon [0, 360]
    const globalBounds = L.latLngBounds([[-90, 0], [90, 360]]);
    // Local Gale Crater Quad (4000m x 4000m centered at Bradbury Landing -4.5895 S, 137.4417 E)
    const localBounds = L.latLngBounds([[-4.623241, 137.407850], [-4.555759, 137.475550]]);

    let mapDiv = this.container.querySelector('.leaflet-map-div');
    if (!mapDiv) {
      mapDiv = document.createElement('div');
      mapDiv.className = 'leaflet-map-div';
      this.container.appendChild(mapDiv);
    }

    this.map = L.map(mapDiv, {
      crs: L.CRS.Simple,
      minZoom: 1,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      zoomAnimation: true
    });

    // 1. Planetary Mars Tiled Equirectangular Basemap (Never grey void at any zoom level)
    this.globalTileLayer = new MarsEquirectangularLayer({
      url: this.globalLayerUrls.satellite,
      bounds: globalBounds,
      noWrap: true,
      minZoom: 1,
      maxZoom: 16
    }).addTo(this.map);

    // 2. High-Resolution Gale Crater Quad (Overlaid at true planetary latitude and longitude)
    this.imageOverlay = L.imageOverlay(this.layerUrls.satellite, localBounds, {
      opacity: 1.0,
      interactive: false
    }).addTo(this.map);

    // 3. Planetary Graticule & Surrounding Mars Trek Landmarks (Visible when zoomed out)
    this.setupPlanetaryOverlays();

    // Initial view centered at Bradbury Landing at local surface zoom
    const pos = store.getState().position;
    this.map.setView([pos.lat, pos.lon], 13);

    // Custom Mars Scale Bar and Data Resolution Badge
    this.createCustomScaleBar();

    // Map Click Handler (Supports Measure Tool Point Placement)
    this.map.on('click', (e) => {
      const state = store.getState();
      if (state.measure && state.measure.active) {
        this.handleMeasureMapClick(e.latlng);
      }
    });

    // Zoom listener to toggle planetary graticule / nomenclature LOD and layer visibility
    this.map.on('zoomend', () => {
      this.updateZoomLOD();
      this.updateScaleBar();
    });

    // Tap to expand when mini map is collapsed, tap to restore when expanded!
    this.container.addEventListener('click', (e) => {
      if (
        e.target.closest('.map-control-btn') ||
        e.target.closest('.layer-picker-card') ||
        e.target.closest('.map-legend-container')
      ) return;
      this.toggleExpand();
    });
  }

  setupPlanetaryOverlays() {
    this.graticuleLayer = L.layerGroup();
    this.planetaryLabelsLayer = L.layerGroup();

    // 30-degree graticule lines (NASA Mars Trek style)
    for (let lat = -60; lat <= 60; lat += 30) {
      const latLine = L.polyline([
        [lat, 0],
        [lat, 360]
      ], {
        color: 'rgba(0, 229, 255, 0.25)',
        weight: 1,
        dashArray: '3, 4',
        interactive: false
      });
      this.graticuleLayer.addLayer(latLine);
    }

    for (let lon = 0; lon <= 360; lon += 60) {
      const lonLine = L.polyline([
        [-80, lon],
        [80, lon]
      ], {
        color: 'rgba(0, 229, 255, 0.25)',
        weight: 1,
        dashArray: '3, 4',
        interactive: false
      });
      this.graticuleLayer.addLayer(lonLine);
    }

    // Prominent planetary landmark labels (NASA Mars Trek IAU Gazetteers)
    const landmarks = [
      { name: 'Olympus Mons', lat: 18.65, lon: 226.2, type: 'Shield Volcano' },
      { name: 'Elysium Planitia', lat: 3.0, lon: 154.7, type: 'Volcanic Plain' },
      { name: 'Valles Marineris', lat: -13.9, lon: 300.8, type: 'Canyon System' },
      { name: 'Hellas Planitia', lat: -42.7, lon: 70.0, type: 'Impact Basin' },
      { name: 'Utopia Planitia', lat: 46.7, lon: 117.5, type: 'Plain' },
      { name: 'Tharsis Montes', lat: 0.0, lon: 247.0, type: 'Volcanic Ridge' },
      { name: 'Amazonis Planitia', lat: 24.8, lon: 196.0, type: 'Plain' },
      { name: 'Arabia Terra', lat: 19.8, lon: 30.0, type: 'Highland' },
      { name: 'Chryse Planitia', lat: 28.4, lon: 319.7, type: 'Plain' },
      { name: 'Isidis Planitia', lat: 12.9, lon: 87.0, type: 'Impact Basin' },
      { name: 'Terra Sabaea', lat: 2.0, lon: 42.0, type: 'Highland' },
      { name: 'Noachis Terra', lat: -45.0, lon: 350.0, type: 'Highland' },
      { name: 'Terra Cimmeria', lat: -34.7, lon: 145.0, type: 'Highland' },
      { name: 'Terra Sirenum', lat: -39.7, lon: 210.0, type: 'Highland' },
      { name: 'Jezero Crater', lat: 18.38, lon: 77.58, type: 'Crater' },
      { name: 'Gusev Crater', lat: -14.57, lon: 175.47, type: 'Crater' },
      { name: 'Gale Crater', lat: -4.59, lon: 137.44, type: 'Impact Crater' }
    ];

    landmarks.forEach(lm => {
      const icon = L.divIcon({
        className: 'minimap-planetary-label',
        html: `<span class="lm-dot"></span><span>${lm.name}</span>`,
        iconSize: [110, 20],
        iconAnchor: [55, 10]
      });
      const marker = L.marker([lm.lat, lm.lon], { icon, interactive: true });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (window.__marsUI && window.__marsUI.setDestination) {
          window.__marsUI.setDestination({
            id: `feat_${lm.name.toLowerCase().replace(/\s+/g, '_')}`,
            name: lm.name,
            lat: lm.lat,
            latitude: lm.lat,
            lon: lm.lon,
            longitude: lm.lon,
            walkable: false
          });
        }
      });
      this.planetaryLabelsLayer.addLayer(marker);
    });

    this.graticuleLayer.addTo(this.map);
    this.planetaryLabelsLayer.addTo(this.map);
    this.updateZoomLOD();
  }

  updateZoomLOD() {
    if (!this.map) return;
    const currentZoom = this.map.getZoom();

    // Show planetary graticule and labels only at wide overview (zoom <= 9)
    if (currentZoom <= 9) {
      if (this.graticuleLayer && !this.map.hasLayer(this.graticuleLayer)) {
        this.graticuleLayer.addTo(this.map);
      }
      if (this.planetaryLabelsLayer && !this.map.hasLayer(this.planetaryLabelsLayer)) {
        this.planetaryLabelsLayer.addTo(this.map);
      }
      // When zoomed out, hide the local 4km quad overlay so there are NO square cut-offs
      if (this.imageOverlay) {
        this.imageOverlay.setOpacity(0.0);
      }
    } else {
      // Local surface view: hide planetary clutter and show high-res Gale quad
      if (this.graticuleLayer && this.map.hasLayer(this.graticuleLayer)) {
        this.map.removeLayer(this.graticuleLayer);
      }
      if (this.planetaryLabelsLayer && this.map.hasLayer(this.planetaryLabelsLayer)) {
        this.map.removeLayer(this.planetaryLabelsLayer);
      }
      if (this.imageOverlay) {
        this.imageOverlay.setOpacity(1.0);
      }
    }
  }

  handleMeasureMapClick(latlng) {
    const state = store.getState();
    const origin = state.origin;
    const { x, y } = latLonToLocalMeters(latlng.lat, latlng.lng, origin.lat, origin.lon);
    const z = getSimulatedTerrainElevation(x, y);

    const pt = {
      x,
      y,
      z,
      lat: latlng.lat,
      lon: latlng.lng,
      elevation_m: -4501.0 + z,
      label: state.measure.pointA ? 'Point B' : 'Point A'
    };

    if (!state.measure.pointA) {
      store.setState({
        measure: {
          ...state.measure,
          pointA: pt,
          pointB: null,
          profilePoints: []
        }
      });
    } else {
      const result = computeElevationProfile(state.measure.pointA, pt);
      store.setState({
        measure: {
          ...state.measure,
          pointB: pt,
          terrainDist_m: result.terrainDist,
          straightDist_m: result.straightDist,
          elevGain_m: result.elevGain,
          maxSlope_deg: result.maxSlope,
          profilePoints: result.points
        },
        panelStates: { measureOpen: true }
      });
    }
  }

  createCustomScaleBar() {
    const scaleEl = document.createElement('div');
    scaleEl.className = 'mars-scale-bar-container';
    scaleEl.innerHTML = `
      <div class="scale-bar-line"></div>
      <span class="scale-bar-text" id="mars-scale-text">50 m</span>
      <span class="scale-res-text" id="mars-res-badge">25 cm/px Surface</span>
    `;
    this.container.appendChild(scaleEl);
    this.scaleTextEl = scaleEl.querySelector('#mars-scale-text');
    this.scaleLineEl = scaleEl.querySelector('.scale-bar-line');
    this.resBadgeEl = scaleEl.querySelector('#mars-res-badge');

    this.map.on('zoomend', () => this.updateScaleBar());
    this.updateScaleBar();
  }

  updateScaleBar() {
    if (!this.map || !this.scaleLineEl || !this.scaleTextEl) return;

    // Sample distance across 60 pixels on the map
    const p1 = this.map.containerPointToLatLng([20, 20]);
    const p2 = this.map.containerPointToLatLng([80, 20]);
    if (!p1 || !p2) return;

    const { distance } = marsDistanceAndBearing(p1.lat, p1.lng, p2.lat, p2.lng);
    if (isNaN(distance) || distance <= 0) return;

    let targetMeters = distance;
    let unit = 'm';
    let displayVal = 50;
    let barWidthPx = 60;

    if (targetMeters >= 50000) {
      // Large planetary distances in km
      const km = targetMeters / 1000.0;
      displayVal = km >= 500 ? 500 : km >= 200 ? 200 : km >= 100 ? 100 : 50;
      barWidthPx = (displayVal / km) * 60;
      unit = 'km';
    } else if (targetMeters >= 1000) {
      const km = targetMeters / 1000.0;
      displayVal = km >= 20 ? 20 : km >= 10 ? 10 : km >= 5 ? 5 : 2;
      barWidthPx = (displayVal / km) * 60;
      unit = 'km';
    } else {
      displayVal = targetMeters >= 400 ? 500 : targetMeters >= 150 ? 200 : targetMeters >= 75 ? 100 : 50;
      barWidthPx = (displayVal / targetMeters) * 60;
      unit = 'm';
    }

    this.scaleLineEl.style.width = `${Math.round(Math.max(24, Math.min(140, barWidthPx)))}px`;
    this.scaleTextEl.textContent = `${displayVal} ${unit}`;

    if (this.resBadgeEl) {
      const zoom = this.map.getZoom();
      this.resBadgeEl.textContent = zoom >= 10 ? '25 cm/px Surface' : '232 m/px Global';
    }
  }

  setupControls() {
    // 1. Fit Entire Route button
    const btnFitRoute = this.container.querySelector('#btn-map-fit-route');
    if (btnFitRoute) {
      btnFitRoute.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fitRoute();
      });
    }

    // 2. Re-center on Astronaut Location button (Fix location recenter)
    const btnOrient = this.container.querySelector('#btn-map-orientation');
    if (btnOrient) {
      const handleOrient = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.centerOnUser();
      };
      btnOrient.addEventListener('click', handleOrient);
      btnOrient.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // 3. Dedicated Expand / Collapse mini-map button
    const btnExpand = this.container.querySelector('#btn-map-expand');
    if (btnExpand) {
      btnExpand.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand();
      });
    }
  }

  centerOnUser() {
    if (!this.map) return;
    const pos = store.getState().position;
    this.map.setView([pos.lat, pos.lon], 13, { animate: true });
    if (window.__marsUI && window.__marsUI.showToast) {
      window.__marsUI.showToast(
        'info',
        `Re-centered on astronaut location (${formatLatitudePlanetocentric(pos.lat)}, ${formatLongitudeEast(pos.lon)})`
      );
    }
  }

  fitRoute() {
    if (!this.map) return;
    const state = store.getState();
    const pos = state.position;
    const dest = state.destination;
    const route = state.route;

    if (dest && route && route.length > 0) {
      const destWp = route[route.length - 1];
      const bounds = L.latLngBounds([
        [pos.lat, pos.lon],
        [destWp.lat, destWp.lon]
      ]);
      this.map.fitBounds(bounds.pad(0.25), { maxZoom: 14, padding: [40, 40], animate: true });
      if (window.__marsUI && window.__marsUI.showToast) {
        window.__marsUI.showToast('info', `Framing route to ${dest.name}`);
      }
    } else {
      this.map.setView([pos.lat, pos.lon], 13, { animate: true });
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    this.container.classList.toggle('expanded', this.isExpanded);
    document.body.classList.toggle('minimap-is-expanded', this.isExpanded);
    store.setState({
      panelStates: { miniMapExpanded: this.isExpanded }
    });

    const btnExpand = this.container.querySelector('#btn-map-expand');
    const iconExpand = this.container.querySelector('#icon-map-expand');
    if (btnExpand) {
      btnExpand.title = this.isExpanded ? 'Collapse mini map' : 'Expand mini map';
    }
    if (iconExpand) {
      iconExpand.innerHTML = getIcon(this.isExpanded ? 'minimize-2' : 'maximize-2', 20);
    }

    this.container.title = this.isExpanded ? 'Surface Map (Expanded) · Tap to collapse' : 'Tap to expand mini map';

    if (this.currentStyle !== 'satellite') {
      this.updateMapLegend(this.currentStyle);
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        this.updateScaleBar();
      }
    }, 180);
  }

  updateLayers(style) {
    const normalizedStyle = (style === 'elevation' || style === 'mola') ? 'depth' : style;
    this.currentStyle = normalizedStyle;

    const localUrl = this.layerUrls[normalizedStyle] || this.layerUrls.depth || this.layerUrls.satellite;
    const globalUrl = this.globalLayerUrls[normalizedStyle] || this.globalLayerUrls.depth || this.globalLayerUrls.satellite;

    if (this.imageOverlay) this.imageOverlay.setUrl(localUrl);
    if (this.globalTileLayer) this.globalTileLayer.setImageUrl(globalUrl);
    this.updateMapLegend(normalizedStyle);
  }

  updateMapLegend(style) {
    const legendContainer = document.getElementById('map-legend-container');
    const legendContent = document.getElementById('map-legend-content');
    if (!legendContainer || !legendContent) return;

    if (this.legendTimeout) {
      clearTimeout(this.legendTimeout);
      this.legendTimeout = null;
    }

    if (style === 'satellite') {
      legendContainer.classList.add('hidden');
      legendContent.innerHTML = '';
      return;
    }

    const is3D = (style === 'threed');
    const titleText = is3D ? 'MONS 3D / MOLA TOPOGRAPHIC ELEVATION' : 'CRATER DEPTH & ELEVATION (NASA SVS 656 MOLA)';

    if (style === 'depth' || style === 'threed' || style === 'elevation' || style === 'mola') {
      legendContainer.classList.remove('hidden');
      legendContent.innerHTML = `
        <div class="legend-elevation-wrap" style="padding: 4px;">
          <div class="legend-title-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:700;font-size:14px;color:#00e5ff;letter-spacing:0.5px;">${titleText}</span>
            <button class="btn-legend-close" id="btn-legend-close" style="background:none;border:none;color:#70b0ff;cursor:pointer;font-size:16px;font-weight:bold;padding:0 6px;" aria-label="Close">x</button>
          </div>
          <div class="legend-mola-bar" style="height:12px;border-radius:3px;margin:6px 0 10px 0;background:linear-gradient(to right, #4a148c 0%, #1976d2 25%, #00acc1 45%, #43a047 65%, #fdd835 85%, #d32f2f 100%);border:1px solid rgba(255,255,255,0.3);"></div>
          <div class="legend-color-explainer" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:13px;color:#f1f5f9;margin-top:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:14px;height:14px;border-radius:3px;background:#4a148c;display:inline-block;border:1px solid #7c4dff;flex-shrink:0;"></span>
              <span style="font-size:13px;line-height:1.3;"><b style="color:#ffffff;">Purple/Blue:</b> Floor (-8 to -4 km)</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:14px;height:14px;border-radius:3px;background:#00acc1;display:inline-block;border:1px solid #26c6da;flex-shrink:0;"></span>
              <span style="font-size:13px;line-height:1.3;"><b style="color:#ffffff;">Cyan/Green:</b> Lowlands (-4 to 0 km)</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:14px;height:14px;border-radius:3px;background:#fdd835;display:inline-block;border:1px solid #ffee58;flex-shrink:0;"></span>
              <span style="font-size:13px;line-height:1.3;"><b style="color:#ffffff;">Yellow:</b> Rims / Uplands (0 to +4 km)</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:14px;height:14px;border-radius:3px;background:#d32f2f;display:inline-block;border:1px solid #ef5350;flex-shrink:0;"></span>
              <span style="font-size:13px;line-height:1.3;"><b style="color:#ffffff;">Red/White:</b> Mountain Peaks (&gt; +4 km)</span>
            </div>
          </div>
          <div class="legend-note-row" style="font-size:11px;color:#94a3b8;margin-top:8px;font-weight:500;">NASA MOLA Topography · Gale Crater Floor: -4,501 m Datum (IAU 2000 Mars R: 3,396,190 m)</div>
        </div>
      `;
    } else if (style === 'slope') {
      legendContainer.classList.remove('hidden');
      legendContent.innerHTML = `
        <div class="legend-slope-wrap" style="padding: 4px;">
          <div class="legend-title-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:700;font-size:14px;color:#00e5ff;letter-spacing:0.5px;">SURFACE SLOPE HAZARD (EVA SAFETY)</span>
            <button class="btn-legend-close" id="btn-legend-close" style="background:none;border:none;color:#70b0ff;cursor:pointer;font-size:16px;font-weight:bold;padding:0 6px;" aria-label="Close">x</button>
          </div>
          <div class="legend-color-explainer" style="display:flex;flex-direction:column;gap:6px;font-size:13px;margin-top:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="slope-chip slope-chip-safe" style="padding:3px 10px;border-radius:3px;font-weight:700;font-size:13px;">&lt;10° Green</span>
              <span style="color:#f1f5f9;font-size:13px;"><b style="color:#ffffff;">Safe / Walkable:</b> Nominal EVA walking pace (1.4 m/s)</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="slope-chip slope-chip-caution" style="padding:3px 10px;border-radius:3px;font-weight:700;font-size:13px;">10°-15° Amber</span>
              <span style="color:#f1f5f9;font-size:13px;"><b style="color:#ffffff;">Caution:</b> Moderate slope, maintain foot traction</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="slope-chip slope-chip-hazard" style="padding:3px 10px;border-radius:3px;font-weight:700;font-size:13px;">&gt;15° Red</span>
              <span style="color:#f1f5f9;font-size:13px;"><b style="color:#ffffff;">Hazard / Limit:</b> Steep crater wall, exceeds EVA safety limit</span>
            </div>
          </div>
          <div class="legend-note-row" style="font-size:11px;color:#94a3b8;margin-top:8px;font-weight:500;">Horn DEM Slope &gt;= 5m baseline · Safe walking limit: 15°</div>
        </div>
      `;
    }

    const closeBtn = document.getElementById('btn-legend-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        legendContainer.classList.add('hidden');
      });
    }

    if (!this.isExpanded) {
      this.legendTimeout = setTimeout(() => {
        legendContainer.classList.add('hidden');
      }, 7000);
    }
  }

  updateMarkers(state) {
    const { position, heading, destination, route, measure } = state;
    const posLatLng = [position.lat, position.lon];

    // 1. Directional Red Arrow Location Marker (Matching top-right HUD arrow)
    const arrowHtml = `
      <div class="minimap-user-arrow" style="transform: rotate(${heading}deg); transform-origin: 50% 50%;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L21 20L12 16L3 20L12 2Z" fill="#ff2222" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
      </div>
    `;

    if (!this.userMarker) {
      const arrowIcon = L.divIcon({
        className: 'minimap-arrow-container',
        html: arrowHtml,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      this.userMarker = L.marker(posLatLng, { icon: arrowIcon, interactive: false }).addTo(this.map);
    } else {
      this.userMarker.setLatLng(posLatLng);
      const el = this.userMarker.getElement();
      if (el) el.innerHTML = arrowHtml;
    }

    // 2. Heading Field-of-View Cone (calculated in spherical degrees)
    const headingRad = (heading * Math.PI) / 180.0;
    const toDeg = 180.0 / Math.PI;
    const dConeM = 65.0; // 65 meters forward cone
    const dLatDeg = (dConeM * Math.cos(headingRad)) / MARS_RADIUS_METERS * toDeg;
    const cosLat = Math.cos((position.lat * Math.PI) / 180.0) || 1.0;
    const dLonDeg = (dConeM * Math.sin(headingRad)) / (MARS_RADIUS_METERS * cosLat) * toDeg;

    const halfFov = (35.0 * Math.PI) / 180.0;
    const leftLatDeg = (dConeM * Math.cos(headingRad - halfFov)) / MARS_RADIUS_METERS * toDeg;
    const leftLonDeg = (dConeM * Math.sin(headingRad - halfFov)) / (MARS_RADIUS_METERS * cosLat) * toDeg;

    const rightLatDeg = (dConeM * Math.cos(headingRad + halfFov)) / MARS_RADIUS_METERS * toDeg;
    const rightLonDeg = (dConeM * Math.sin(headingRad + halfFov)) / (MARS_RADIUS_METERS * cosLat) * toDeg;

    const p1 = [position.lat, position.lon];
    const p2 = [position.lat + leftLatDeg, position.lon + leftLonDeg];
    const p3 = [position.lat + rightLatDeg, position.lon + rightLonDeg];

    if (!this.headingCone) {
      this.headingCone = L.polygon([p1, p2, p3], {
        color: '#00e5ff',
        weight: 1.5,
        fillColor: '#00e5ff',
        fillOpacity: 0.28,
        interactive: false
      }).addTo(this.map);
    } else {
      this.headingCone.setLatLngs([p1, p2, p3]);
    }

    // 3. Destination Pin (Universal: Works for Both Local and Planetary Targets)
    if (destination && destination.lat !== undefined && destination.lon !== undefined) {
      const destLatLng = [destination.lat, destination.lon];
      const liveRes = getLiveDistanceToDestination(position, destination);
      const distStr = liveRes ? formatNavDistance(liveRes.distance) : '';
      const pinHtml = `
        <div class="minimap-pin-glyph"></div>
        <span class="minimap-pin-label">${destination.name}${distStr ? ` · ${distStr}` : ''}</span>
      `;

      if (!this.destMarker) {
        const pinIcon = L.divIcon({
          className: 'minimap-destination-pin',
          html: pinHtml,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        this.destMarker = L.marker(destLatLng, { icon: pinIcon, interactive: false }).addTo(this.map);
      } else {
        this.destMarker.setLatLng(destLatLng);
        const el = this.destMarker.getElement();
        if (el) el.innerHTML = pinHtml;
      }
    } else {
      if (this.destMarker) {
        this.destMarker.remove();
        this.destMarker = null;
      }
    }

    // 4. Tactical Route Line (Only smooth solid blue line, ZERO dots)
    if (route && route.length > 1) {
      const allLatLngs = route.map(wp => [wp.lat, wp.lon]);

      if (allLatLngs.length > 1) {
        if (!this.routeHalo) {
          this.routeHalo = L.polyline(allLatLngs, {
            color: 'rgba(26, 115, 232, 0.45)',
            weight: 7,
            lineCap: 'round',
            interactive: false
          }).addTo(this.map);

          this.routeCore = L.polyline(allLatLngs, {
            color: '#1a73e8',
            weight: 3.5,
            lineCap: 'round',
            interactive: false
          }).addTo(this.map);
        } else {
          this.routeHalo.setLatLngs(allLatLngs);
          this.routeCore.setLatLngs(allLatLngs);
        }
      }
    } else {
      this.clearRoute();
    }

    // 5. Measure Tool Markers & Line
    this.measureMarkers.forEach(m => m.remove());
    this.measureMarkers = [];
    if (this.measureLine) {
      this.measureLine.remove();
      this.measureLine = null;
    }

    if (measure && measure.pointA) {
      const m1 = L.circleMarker([measure.pointA.lat, measure.pointA.lon], {
        radius: 6,
        color: '#ff9100',
        fillColor: '#ff9100',
        fillOpacity: 0.9,
        weight: 2
      }).addTo(this.map);
      this.measureMarkers.push(m1);

      if (measure.pointB) {
        const m2 = L.circleMarker([measure.pointB.lat, measure.pointB.lon], {
          radius: 6,
          color: '#ff9100',
          fillColor: '#ff9100',
          fillOpacity: 0.9,
          weight: 2
        }).addTo(this.map);
        this.measureMarkers.push(m2);

        this.measureLine = L.polyline(
          [[measure.pointA.lat, measure.pointA.lon], [measure.pointB.lat, measure.pointB.lon]],
          { color: '#ff9100', weight: 2, dashArray: '3, 4' }
        ).addTo(this.map);
      }
    }

    // Auto-pan map to user position if not expanded
    if (!this.isExpanded) {
      this.map.panTo(posLatLng, { animate: false });
    }
  }

  clearRoute() {
    if (this.routeHalo) {
      this.routeHalo.remove();
      this.routeHalo = null;
    }
    if (this.routeCore) {
      this.routeCore.remove();
      this.routeCore = null;
    }
  }

  onStateChange(state, prevState) {
    if (state.mapStyle !== prevState.mapStyle) {
      this.updateLayers(state.mapStyle);
    }

    if (
      state.destination?.lat !== prevState.destination?.lat ||
      state.destination?.lon !== prevState.destination?.lon ||
      state.destination?.name !== prevState.destination?.name
    ) {
      this.fitRoute();
    }

    if (
      state.position.lat !== prevState.position.lat ||
      state.position.lon !== prevState.position.lon ||
      state.heading !== prevState.heading ||
      state.destination !== prevState.destination ||
      state.route !== prevState.route ||
      state.measure !== prevState.measure
    ) {
      this.updateMarkers(state);
    }
  }

  updateFromState(state) {
    this.updateLayers(state.mapStyle);
    this.updateMarkers(state);
  }
}
