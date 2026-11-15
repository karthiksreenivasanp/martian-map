/**
 * Martian Map - User Interface Manager
 * Manages 400px Left Directions Drawer, live "Your location" coordinates and nearest feature,
 * unified Mars Solar Time Sheet (Allison & McEwen 2000 math, 60x playback),
 * Google Weather card layout (hourly 1-sol area chart, 8-sol forecast, C/F toggle),
 * Surface Distance & Profile Measure Tool (terrain dist, straight dist, profile chart),
 * single close control, Esc key handling, and 8-step Help Tour.
 * Zero emojis.
 */

import { store, MARS_RADIUS_METERS, DEFAULT_SUIT_PACE_MS, DATA_REGISTRY } from './state.js';
import { getIcon } from './icons.js';
import { getAssetUrl, debounce } from './assets.js';
import {
  marsDistanceAndBearing,
  getDestinationCoords,
  getLiveDistanceToDestination,
  formatNavDistance,
  getRelativeBearing,
  formatInstruction,
  formatRemainingTelemetry,
  calculateSlopeDeg,
  getSimulatedTerrainElevation,
  calculateHornSlope5m,
  calculateMarsSolarAngles,
  calculateMarsTemperature,
  calculateMarsPressure,
  calculateMarsWind,
  formatLocalSolarTime,
  computeElevationProfile,
  generateRoute,
  latLonToLocalMeters,
  localMetersToLatLon,
  formatLatitudePlanetocentric,
  formatLongitudeEast,
  MAX_SAFE_SLOPE_DEG
} from './nav.js';
import placesData from './places.json';

export class UIManager {
  constructor() {
    this.previewTimer = null;
    this.isPreviewing = false;
    this.offRouteToastShown = false;
    this.lastTriggerElement = null;
    this.toastTimer = null;
    this.hasArrived = false;
    this.arrivalLocation = null;
    this.timePlayTimer = null;
    this.currentInspectionIndex = 0;
    this.placesData = placesData;
    window.__marsUI = this;

    this.tourSteps = [
      {
        elementId: 'side-panel',
        title: 'Planetary Overview Globe',
        text: 'Displays Mars Viking 232m global mosaic, labeled 30-degree graticule, and real-time coordinates. Tap the globe to open the full planetary map overlay.'
      },
      {
        elementId: 'hud-arrow',
        title: 'Waypoint Direction Arrow',
        text: 'Points directly toward your immediate waypoint along your line of sight in the 3D HUD.'
      },
      {
        elementId: 'instruction-bar',
        title: 'Instruction Bar & Live Telemetry',
        text: 'Displays tactical turn vector, remaining distance, walking time at 1.4 m/s suit pace, and live DEM elevation and Horn ground slope.'
      },
      {
        elementId: 'minimap-container',
        title: '2D Surface Mini Map',
        text: 'High-resolution Gale Crater map (25 cm/px source HiRISE) with tactical route line. Tap to expand or toggle North-Up / Heading-Up.'
      },
      {
        elementId: 'layer-picker-card',
        title: 'Map Layer Picker',
        text: 'Switch between Satellite Ortho, Elevation Terrain (sun-driven hillshade), and Slope Hazard heatmaps (Horn >= 5m baseline).'
      },
      {
        elementId: 'btn-time',
        title: 'Mars Solar Time & Sun Geometry',
        text: 'Adjust Local True Solar Time (00:00 - 24:00 LTST) or run 60x playback. Drives 3D shadows, dynamic sky dome, forward-scattering blue sunset, and stars.'
      },
      {
        elementId: 'btn-climate',
        title: 'Weather of Mars (Google Weather Layout)',
        text: 'Curiosity REMS meteorology with hourly 1-sol diurnal area chart, 8-sol outlook, and Gale Crater rim depth analysis.'
      },
      {
        elementId: 'btn-measure',
        title: 'Surface Distance & Elevation Profile',
        text: 'Click two points on the mini map to measure surface terrain distance, 3D straight distance, elevation gain/loss, and interactive profile chart.'
      }
    ];

    this.currentTourIndex = 0;
    this.init();
  }

  init() {
    this.injectIcons();
    this.setupWindowControls();
    this.setupSidePanel();
    this.setupActionButtons();
    this.setupTimePanel();
    this.setupClimatePanel();
    this.setupMeasureTool();
    this.setupMovementControls();
    this.setupDirectionsDrawer();
    this.setupLayerPicker();
    this.setupHelpTour();
    this.setupRightEdgeControls();
    this.setupVexControls();
    this.setupInspectionDialog();

    store.subscribe((state, prevState) => this.onStateChange(state, prevState));

    // Calculate initial route to default nearby walkable destination (Rocknest)
    this.recomputeRoute(store.getState().destination);

    // Initial weather & time sync
    this.updateWeatherDisplay();
    this.updateTimeDisplay();
    this.updateLiveTelemetry();

    // Initial responsive check
    this.checkResponsive();
  }

  injectIcons() {
    const setIcon = (id, icon, size) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = getIcon(icon, size);
    };

    // Window frame icons
    setIcon('icon-minimize', 'minus', 16);
    setIcon('icon-maximize', 'maximize-2', 16);
    setIcon('icon-close', 'x', 16);

    // Side panel toggle
    setIcon('icon-side-toggle', 'chevron-left', 18);
    setIcon('icon-chevron', 'chevron-left', 18);

    // Map style / layers button, fit route, location re-center, and expand/collapse
    setIcon('icon-map-layer', 'layers', 20);
    setIcon('icon-map-fit-route', 'route', 20);
    setIcon('icon-orient', 'locate', 20);
    setIcon('icon-map-expand', 'maximize-2', 20);

    // Bottom right 5 round action buttons
    setIcon('icon-btn-help', 'circle-help', 24);
    setIcon('icon-btn-climate', 'cloud-sun', 24);
    setIcon('icon-btn-time', 'clock', 24);
    setIcon('icon-btn-measure', 'ruler', 24);
    setIcon('icon-btn-places', 'map-pin', 24);

    // 3D HUD Direction Arrow Icon
    setIcon('hud-arrow-icon', 'navigation', 30);

    // Movement D-pad icons
    setIcon('icon-step-forward', 'arrow-up', 22);
    setIcon('icon-step-back', 'arrow-down', 22);
    setIcon('icon-rotate-left', 'rotate-ccw', 20);
    setIcon('icon-rotate-right', 'rotate-cw', 20);

    // Directions drawer icons
    setIcon('icon-dir-origin', 'crosshair', 16);
    setIcon('icon-dir-dest', 'map-pin', 16);
    setIcon('icon-return-start', 'rotate-ccw', 14);
    setIcon('icon-close-drawer', 'x', 18);
    setIcon('icon-clear-search', 'x', 14);

    // Overlay modal close icons
    setIcon('icon-close-time', 'x', 18);
    setIcon('icon-close-climate', 'x', 18);
    setIcon('icon-close-measure', 'x', 18);
    setIcon('icon-close-globe', 'x', 18);
    setIcon('icon-close-tour', 'x', 18);
    setIcon('icon-close-inspection', 'x', 18);

    // Back to route icon
    setIcon('icon-back-to-route', 'navigation', 14);

    // Right-edge controls
    setIcon('icon-camera-view', 'camera', 20);
    setIcon('icon-compass-north', 'compass', 20);
    setIcon('icon-zoom-in', 'zoom-in', 20);
    setIcon('icon-zoom-out', 'zoom-out', 20);

    // Play icon for time control
    setIcon('icon-play-time', 'play', 16);

    // 360° Street View icons
    setIcon('icon-btn-streetview', 'streetview', 22);
    setIcon('icon-streetview-badge', 'streetview', 18);
    setIcon('icon-exit-streetview', 'x', 16);
  }

  setupWindowControls() {
    const minBtn = document.getElementById('btn-window-minimize');
    const maxBtn = document.getElementById('btn-window-maximize');
    const closeBtn = document.getElementById('btn-window-close');
    const appContainer = document.getElementById('app-container');

    if (minBtn) {
      minBtn.addEventListener('click', () => {
        const isMin = appContainer ? appContainer.classList.toggle('window-minimized') : false;
        store.setState({ panelStates: { windowMinimized: isMin } });
        this.showToast('info', isMin ? 'Session minimized to status tray.' : 'Session restored.');
      });
    }

    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        const isMax = appContainer ? appContainer.classList.toggle('window-maximized') : false;
        store.setState({ panelStates: { windowMaximized: isMax } });
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        this.showToast('info', isMax ? 'Full screen mode enabled.' : 'Standard window mode.');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const confirmEnd = window.confirm('Terminate Martian EVA Surface Navigation session?');
        if (confirmEnd) {
          store.setState({ panelStates: { sessionEnded: true } });
          document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#060810;color:#94a3b8;font-family:system-ui,sans-serif;">
              <div style="font-size:22px;font-weight:700;color:#ff7043;margin-bottom:12px;">EVA SESSION TERMINATED</div>
              <div style="font-size:14px;color:#94a3b8;margin-bottom:24px;">Telemetry logs archived to Habitat local database.</div>
              <button onclick="location.reload()" style="background:#00e5ff;color:#060810;border:none;padding:12px 24px;font-weight:700;border-radius:4px;cursor:pointer;">Restart Session</button>
            </div>
          `;
        }
      });
    }

    // Global Keyboard Navigation: WASD, Arrow Keys, and Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDirectionsDrawer();
        this.closeAllModals();
        if (this.isPreviewing) {
          this.toggleRoutePreview();
        }
        return;
      }

      // Do not intercept keystrokes when the user is typing in an input or textarea
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.stepAstronaut(8.0);
      } else if (key === 's' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.stepAstronaut(-8.0);
      } else if (key === 'a' || e.key === 'ArrowLeft') {
        e.preventDefault();
        this.rotateHeading(-10.0);
      } else if (key === 'd' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.rotateHeading(10.0);
      }
    });
  }

  closeAllModals() {
    ['climate-dialog', 'time-dialog', 'measure-dialog', 'globe-overlay', 'tour-dialog', 'inspection-dialog'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    store.setState({
      panelStates: {
        climateOpen: false,
        timeDialogOpen: false,
        measureOpen: false,
        globeOverlayOpen: false,
        helpTourActive: false,
        inspectionOpen: false
      }
    });
    if (window.__marsGlobe) {
      window.__marsGlobe.restoreMiniRenderer();
    }
  }

  openExclusiveModal(modalId) {
    this.dismissToast();
    const target = document.getElementById(modalId);
    if (!target) return;

    const isAlreadyOpen = !target.classList.contains('hidden');

    // Close all other modal dialogs and the directions drawer so no windows hover over each other (Requirement 12)
    this.closeAllModals();
    this.closeDirectionsDrawer();
    const picker = document.getElementById('layer-picker-card');
    if (picker) picker.classList.add('hidden');

    if (!isAlreadyOpen) {
      target.classList.remove('hidden');
    }
  }

  setupSidePanel() {
    const sidePanel = document.getElementById('side-panel');
    const toggleBtn = document.getElementById('btn-toggle-side');
    const toggleIcon = document.getElementById('icon-chevron');

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = sidePanel.classList.toggle('collapsed');
      toggleIcon.innerHTML = isCollapsed ? getIcon('chevron-right', 18) : getIcon('chevron-left', 18);
      store.setState({ panelStates: { sidePanelCollapsed: isCollapsed } });
      toggleBtn.setAttribute('aria-expanded', (!isCollapsed).toString());
    });
  }

  checkResponsive() {
    const isMobile = window.innerWidth < 900;
    const sidePanel = document.getElementById('side-panel');
    const toggleIcon = document.getElementById('icon-chevron');

    if (isMobile && !sidePanel.classList.contains('collapsed')) {
      sidePanel.classList.add('collapsed');
      if (toggleIcon) toggleIcon.innerHTML = getIcon('chevron-right', 18);
      store.setState({ panelStates: { sidePanelCollapsed: true } });
    }
  }

  setupActionButtons() {
    // Map layer toggle
    document.getElementById('btn-map-layer').addEventListener('click', (e) => {
      e.stopPropagation();
      const picker = document.getElementById('layer-picker-card');
      picker.classList.toggle('hidden');
    });

    // Climate / Weather Button (Mutually exclusive window - Requirement 12)
    document.getElementById('btn-climate').addEventListener('click', () => {
      this.openExclusiveModal('climate-dialog');
      const dialog = document.getElementById('climate-dialog');
      const isOpen = !dialog.classList.contains('hidden');
      store.setState({ panelStates: { climateOpen: isOpen } });
      if (isOpen) {
        this.updateWeatherDisplay();
      }
    });

    // Time Control Button & Top-bar pill (Mutually exclusive window - Requirement 12)
    const openTimeModal = () => {
      this.openExclusiveModal('time-dialog');
      const dialog = document.getElementById('time-dialog');
      const isOpen = !dialog.classList.contains('hidden');
      store.setState({ panelStates: { timeDialogOpen: isOpen } });
      if (isOpen) {
        this.updateTimeDisplay();
      }
    };

    document.getElementById('btn-time').addEventListener('click', openTimeModal);
    document.getElementById('header-ltst-time').addEventListener('click', openTimeModal);

    // Measure Tool Button (Mutually exclusive window - Requirement 12)
    document.getElementById('btn-measure').addEventListener('click', () => {
      this.openExclusiveModal('measure-dialog');
      const dialog = document.getElementById('measure-dialog');
      const isOpen = !dialog.classList.contains('hidden');
      store.setState({
        measure: { ...store.getState().measure, active: isOpen },
        panelStates: { measureOpen: isOpen }
      });
      if (isOpen) {
        this.updateMeasureDisplay();
      }
    });

    // Places Button (Opens Left Drawer - Mutually exclusive, closes other modals)
    const btnPlaces = document.getElementById('btn-places');
    btnPlaces.addEventListener('click', () => {
      this.closeAllModals();
      this.lastTriggerElement = btnPlaces;
      this.toggleDirectionsDrawer();
    });

    // Street View Button (Google Maps Style 360° Panoramic Surface Exploration)
    const btnStreetView = document.getElementById('btn-streetview');
    if (btnStreetView) {
      btnStreetView.addEventListener('click', () => {
        const state = store.getState();
        const dest = state.destination;
        const siteId = dest ? dest.id : 'rocknest';
        const siteName = dest ? dest.name : 'Rocknest Sand Drift';
        const pos = state.position;

        if (window.__marsTerrain) {
          window.__marsTerrain.enterStreetView(siteId);
        }

        const hud = document.getElementById('streetview-hud');
        if (hud) hud.classList.remove('hidden');

        const nameEl = document.getElementById('streetview-site-name');
        if (nameEl) nameEl.textContent = `${siteName} · 360° Street View`;

        const telemEl = document.getElementById('streetview-site-telemetry');
        if (telemEl) {
          telemEl.textContent = `${formatLatitudePlanetocentric(pos.lat)}, ${formatLongitudeEast(pos.lon)} · Mars Surface`;
        }
        this.showToast('info', `Exploring ${siteName} in 360° Street View`);
      });
    }

    const btnExitStreetView = document.getElementById('btn-exit-streetview');
    if (btnExitStreetView) {
      btnExitStreetView.addEventListener('click', () => {
        if (window.__marsTerrain) {
          window.__marsTerrain.exitStreetView();
        }
        const hud = document.getElementById('streetview-hud');
        if (hud) hud.classList.add('hidden');
        this.showToast('info', 'Returned to 3D Navigation');
      });
    }

    // Mini-map Location Recenter Button (Guarantee instant centering)
    const btnMapOrient = document.getElementById('btn-map-orientation');
    if (btnMapOrient) {
      btnMapOrient.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__marsMiniMap) {
          window.__marsMiniMap.centerOnUser();
        }
      });
    }

    // Help Tour Button (Mutually exclusive)
    document.getElementById('btn-help').addEventListener('click', () => {
      this.openExclusiveModal('tour-dialog');
      this.startHelpTour();
    });

    // Back to route pill button
    document.getElementById('btn-back-to-route').addEventListener('click', () => {
      this.realignHeadingToRoute();
    });
  }

  setupTimePanel() {
    const dialog = document.getElementById('time-dialog');
    const closeBtn = document.getElementById('btn-close-time');
    const slider = document.getElementById('slider-unified-time');
    const playBtn = document.getElementById('btn-play-time');
    const playLabel = document.getElementById('label-play-time');
    const playIcon = document.getElementById('icon-play-time');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        store.setState({ panelStates: { timeDialogOpen: false } });
      });
    }

    if (slider) {
      slider.addEventListener('input', (e) => {
        const ltst = parseFloat(e.target.value);
        this.setTime(ltst);
      });
    }

    // Quick Time Buttons
    document.querySelectorAll('.btn-time-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const timeVal = parseFloat(e.currentTarget.dataset.time);
        if (slider) slider.value = timeVal;
        this.setTime(timeVal);
      });
    });

    // Play/Pause 60x Speed Button
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        const isPlaying = !store.getState().isTimePlaying;
        store.setState({ isTimePlaying: isPlaying });

        if (isPlaying) {
          playLabel.textContent = 'Pause (60x)';
          playIcon.innerHTML = getIcon('pause', 16);
          this.startTimePlayback();
        } else {
          playLabel.textContent = 'Play (60x)';
          playIcon.innerHTML = getIcon('play', 16);
          this.stopTimePlayback();
        }
      });
    }
  }

  setTime(ltstHours) {
    const lat = store.getState().position.lat;
    const Ls = store.getState().solarLongitudeLs;
    const angles = calculateMarsSolarAngles(lat, ltstHours, Ls);
    const tempC = calculateMarsTemperature(ltstHours);
    const pressurePa = calculateMarsPressure(ltstHours);
    const wind = calculateMarsWind(ltstHours);

    store.setState({
      ltstHours,
      sunElevation: angles.elevationDeg,
      sunAzimuth: angles.azimuthDeg,
      climate: {
        ...store.getState().climate,
        tempC,
        pressurePa,
        windSpeedMs: wind.speed,
        windDirectionDeg: wind.dirDeg,
        windDirectionText: wind.dirText,
        localSolarTime: formatLocalSolarTime(ltstHours)
      }
    });

    this.updateTimeDisplay();
    this.updateWeatherDisplay();
  }

  startTimePlayback() {
    this.stopTimePlayback();
    let lastTime = performance.now();

    this.timePlayTimer = setInterval(() => {
      if (!store.getState().isTimePlaying) {
        this.stopTimePlayback();
        return;
      }
      const now = performance.now();
      const dtSec = (now - lastTime) / 1000.0;
      lastTime = now;

      // 60x speed: 1 second advances 60 seconds (1/60th of an hour)
      let currentLTST = store.getState().ltstHours;
      currentLTST = (currentLTST + (dtSec * 60.0) / 3600.0) % 24.0;
      
      const slider = document.getElementById('slider-unified-time');
      if (slider) slider.value = currentLTST.toFixed(1);
      this.setTime(currentLTST);
    }, 100);
  }

  stopTimePlayback() {
    if (this.timePlayTimer) {
      clearInterval(this.timePlayTimer);
      this.timePlayTimer = null;
    }
  }

  updateTimeDisplay() {
    const state = store.getState();
    const ltstStr = formatLocalSolarTime(state.ltstHours);

    // Top-bar pill: shows only {HH:MM} LTST
    const headerTime = document.getElementById('header-ltst-time');
    if (headerTime) headerTime.textContent = ltstStr;

    // Modal time displays
    const modalTime = document.getElementById('modal-time-display');
    const modalLabel = document.getElementById('modal-ltst-label');
    if (modalTime) modalTime.textContent = ltstStr;
    if (modalLabel) modalLabel.textContent = ltstStr.replace(' LTST', '');

    // Solar angles telemetry
    const angles = calculateMarsSolarAngles(state.position.lat, state.ltstHours, state.solarLongitudeLs);
    const teleElev = document.getElementById('tele-sun-elev');
    const teleAz = document.getElementById('tele-sun-az');
    const teleDec = document.getElementById('tele-sun-dec');

    if (teleElev) teleElev.textContent = `${angles.elevationDeg >= 0 ? '+' : ''}${angles.elevationDeg.toFixed(1)}°`;
    if (teleAz) teleAz.textContent = `${angles.azimuthDeg.toFixed(1)}° (${this.getCompassHeadingText(angles.azimuthDeg)})`;
    if (teleDec) teleDec.textContent = `${angles.declinationDeg >= 0 ? '+' : ''}${angles.declinationDeg.toFixed(1)}°`;
  }

  getCompassHeadingText(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((deg % 360) / 45)) % 8;
    return dirs[idx];
  }

  setupClimatePanel() {
    const dialog = document.getElementById('climate-dialog');
    const closeBtn = document.getElementById('btn-close-climate');
    const tauSlider = document.getElementById('slider-dust-tau');
    const btnUsePos = document.getElementById('btn-weather-use-pos');
    const btnTempToggle = document.getElementById('btn-toggle-temp-unit');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        store.setState({ panelStates: { climateOpen: false } });
      });
    }

    if (tauSlider) {
      tauSlider.addEventListener('input', (e) => {
        const tau = parseFloat(e.target.value);
        store.setState({ dustHazeTau: tau });
        const valEl = document.getElementById('val-dust-tau');
        const wValEl = document.getElementById('weather-tau-val');
        if (valEl) valEl.textContent = tau.toFixed(2);
        if (wValEl) wValEl.textContent = tau.toFixed(2);
      });
    }

    if (btnUsePos) {
      btnUsePos.addEventListener('click', () => {
        const pos = store.getState().position;
        const coordsSub = document.getElementById('weather-coords-sub');
        if (coordsSub) {
          coordsSub.textContent = `${formatLatitudePlanetocentric(pos.lat)}, ${formatLongitudeEast(pos.lon)} · Active Walk Position`;
        }
        this.showToast('info', 'Weather aligned to current astronaut position.');
      });
    }

    if (btnTempToggle) {
      btnTempToggle.addEventListener('click', () => {
        const currentUnit = store.getState().climate.tempUnit;
        const newUnit = currentUnit === 'C' ? 'F' : 'C';
        store.setState({ climate: { ...store.getState().climate, tempUnit: newUnit } });
        this.updateWeatherDisplay();
      });
    }

    // Weather Tabs Switching
    document.querySelectorAll('.weather-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.weather-tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tab = e.currentTarget.dataset.tab;
        store.setState({ climate: { ...store.getState().climate, activeTab: tab } });
        this.renderHourlyWeatherChart(tab);
      });
    });

    // Advanced science details toggle button
    const btnAdv = document.getElementById('btn-toggle-advanced-weather');
    const advSection = document.getElementById('weather-advanced-details');
    if (btnAdv && advSection) {
      btnAdv.addEventListener('click', () => {
        const isHidden = advSection.classList.toggle('hidden');
        btnAdv.textContent = isHidden
          ? 'Show Detailed Scientific Charts & Crater Depth'
          : 'Hide Scientific Charts & Depth';
      });
    }

    this.renderForecastSols();
  }

  updateWeatherDisplay() {
    const state = store.getState();
    const { climate, ltstHours, dustHazeTau, position } = state;
    const isFahrenheit = climate.tempUnit === 'F';

    // Temp formatting
    const tempVal = isFahrenheit ? ((climate.tempC * 9.0) / 5.0 + 32.0).toFixed(0) : climate.tempC.toFixed(0);
    const tempValEl = document.getElementById('weather-temp-val');
    const tempUnitEl = document.querySelector('.weather-temp-unit');
    if (tempValEl) tempValEl.textContent = tempVal;
    if (tempUnitEl) tempUnitEl.textContent = `°${climate.tempUnit}`;

    // Metrics
    const pressEl = document.getElementById('weather-pressure-val');
    const windEl = document.getElementById('weather-wind-val');
    const tauEl = document.getElementById('weather-tau-val');
    const ltstEl = document.getElementById('weather-ltst-val');
    const iconEl = document.getElementById('weather-current-icon');
    const descEl = document.getElementById('weather-condition-desc');

    if (pressEl) pressEl.textContent = `${climate.pressurePa} Pa (${(climate.pressurePa / 100.0).toFixed(2)} mbar)`;
    if (windEl) windEl.textContent = `${climate.windSpeedMs} m/s (${climate.windDirectionDeg}° ${climate.windDirectionText})`;
    if (tauEl) tauEl.textContent = dustHazeTau.toFixed(2);
    if (ltstEl) ltstEl.textContent = `${formatLocalSolarTime(ltstHours)} (Sol ${state.solNumber})`;

    // Condition description and icon
    const angles = calculateMarsSolarAngles(position.lat, ltstHours);
    if (iconEl) {
      if (angles.elevationDeg < 0) {
        iconEl.innerHTML = getIcon('circle-help', 44); // Night stars placeholder icon
      } else if (dustHazeTau > 1.2) {
        iconEl.innerHTML = getIcon('cloud-sun', 44);
      } else {
        iconEl.innerHTML = getIcon('sun', 44);
      }
    }
    if (descEl) {
      if (angles.elevationDeg < 0) {
        descEl.textContent = 'Cold Martian Night · Starlight · Sub-zero Cryo';
      } else if (dustHazeTau > 1.2) {
        descEl.textContent = 'Dust Haze · Low Optical Transmittance';
      } else {
        descEl.textContent = 'Sunny · Cold · Light Dust Haze';
      }
    }

    // Crater Rim status
    const rimStatus = document.getElementById('crater-rim-status');
    if (rimStatus) {
      const belowRim = Math.round(1000.0 - position.elevation);
      rimStatus.textContent = `You are ${belowRim.toLocaleString()} m below the crater rim (Current elevation: ${position.elevation.toFixed(0)} m datum)`;
    }

    // Re-render chart for current active tab
    this.renderHourlyWeatherChart(climate.activeTab || 'temp');
  }

  renderHourlyWeatherChart(tab = 'temp') {
    const container = document.getElementById('hourly-chart-container');
    const titleEl = document.getElementById('weather-chart-title');
    const markerEl = document.getElementById('chart-marker-label');
    if (!container) return;

    const currentLTST = store.getState().ltstHours;
    const isF = store.getState().climate.tempUnit === 'F';

    let dataPoints = [];
    let yMin = 0;
    let yMax = 0;
    let currentValStr = '';

    if (tab === 'temp') {
      if (titleEl) titleEl.textContent = `Diurnal Temperature Curve (${isF ? '°F' : '°C'})`;
      yMin = isF ? -110 : -80;
      yMax = isF ? 10 : -10;

      for (let h = 0; h <= 24; h += 0.5) {
        let val = calculateMarsTemperature(h);
        if (isF) val = (val * 9.0) / 5.0 + 32.0;
        dataPoints.push({ hour: h, val });
      }
      let curVal = calculateMarsTemperature(currentLTST);
      if (isF) curVal = (curVal * 9.0) / 5.0 + 32.0;
      currentValStr = `${curVal.toFixed(0)}°${isF ? 'F' : 'C'}`;
    } else if (tab === 'pressure') {
      if (titleEl) titleEl.textContent = 'Diurnal Semi-Tidal Atmospheric Pressure (Pa)';
      yMin = 710;
      yMax = 780;
      for (let h = 0; h <= 24; h += 0.5) {
        dataPoints.push({ hour: h, val: calculateMarsPressure(h) });
      }
      currentValStr = `${calculateMarsPressure(currentLTST)} Pa`;
    } else {
      if (titleEl) titleEl.textContent = 'Diurnal Thermal Wind Speed (m/s)';
      yMin = 0;
      yMax = 10;
      for (let h = 0; h <= 24; h += 0.5) {
        dataPoints.push({ hour: h, val: calculateMarsWind(h).speed });
      }
      currentValStr = `${calculateMarsWind(currentLTST).speed} m/s`;
    }

    if (markerEl) markerEl.textContent = `Current: ${formatLocalSolarTime(currentLTST)} (${currentValStr})`;

    // Generate SVG path coordinates (460 x 140 viewbox)
    const svgW = 460;
    const svgH = 140;
    const padX = 30;
    const padY = 20;
    const chartW = svgW - padX * 2;
    const chartH = svgH - padY * 2;

    const getX = (h) => padX + (h / 24.0) * chartW;
    const getY = (val) => svgH - padY - ((val - yMin) / (yMax - yMin)) * chartH;

    let pathD = `M ${getX(dataPoints[0].hour)} ${getY(dataPoints[0].val)}`;
    for (let i = 1; i < dataPoints.length; i++) {
      pathD += ` L ${getX(dataPoints[i].hour)} ${getY(dataPoints[i].val)}`;
    }
    const areaD = `${pathD} L ${getX(24)} ${svgH - padY} L ${getX(0)} ${svgH - padY} Z`;

    const currentX = getX(currentLTST);

    // SVG markup
    container.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#00e5ff" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <!-- Horizontal Grid Lines -->
        <line x1="${padX}" y1="${getY(yMin)}" x2="${svgW - padX}" y2="${getY(yMin)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        <line x1="${padX}" y1="${getY((yMin+yMax)/2)}" x2="${svgW - padX}" y2="${getY((yMin+yMax)/2)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${getY(yMax)}" x2="${svgW - padX}" y2="${getY(yMax)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        
        <!-- Y-Axis Labels -->
        <text x="${padX - 4}" y="${getY(yMax) + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="'JetBrains Mono',monospace">${yMax}</text>
        <text x="${padX - 4}" y="${getY(yMin) + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="'JetBrains Mono',monospace">${yMin}</text>
        
        <!-- Area Fill & Stroke Curve -->
        <path d="${areaD}" fill="url(#chartGrad)"/>
        <path d="${pathD}" fill="none" stroke="#00e5ff" stroke-width="2"/>

        <!-- Vertical Current LTST Marker Line -->
        <line x1="${currentX}" y1="${padY - 4}" x2="${currentX}" y2="${svgH - padY}" stroke="#ff7043" stroke-width="2" stroke-dasharray="4,2"/>
        <circle cx="${currentX}" cy="${getY(dataPoints.find(p => p.hour >= currentLTST)?.val || (yMin+yMax)/2)}" r="4" fill="#ff7043"/>

        <!-- X-Axis Hour Ticks -->
        <text x="${getX(0)}" y="${svgH - 6}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">00h</text>
        <text x="${getX(6)}" y="${svgH - 6}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">06h</text>
        <text x="${getX(12)}" y="${svgH - 6}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">12h</text>
        <text x="${getX(18)}" y="${svgH - 6}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">18h</text>
        <text x="${getX(24)}" y="${svgH - 6}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">24h</text>
      </svg>
    `;
  }

  renderForecastSols() {
    const grid = document.getElementById('forecast-sols-grid');
    if (!grid) return;

    const sols = [
      { sol: 3507, highC: -18, lowC: -76, cond: 'Sunny' },
      { sol: 3508, highC: -19, lowC: -77, cond: 'Sunny' },
      { sol: 3509, highC: -21, lowC: -78, cond: 'Hazy' },
      { sol: 3510, highC: -22, lowC: -79, cond: 'Hazy' },
      { sol: 3511, highC: -18, lowC: -75, cond: 'Sunny' },
      { sol: 3512, highC: -17, lowC: -74, cond: 'Sunny' },
      { sol: 3513, highC: -20, lowC: -77, cond: 'Clear' },
      { sol: 3514, highC: -19, lowC: -76, cond: 'Clear' }
    ];

    grid.innerHTML = sols.map(s => `
      <div class="forecast-sol-card">
        <span class="sol-card-name">Sol ${s.sol}</span>
        <div class="sol-card-icon">${getIcon(s.cond === 'Hazy' ? 'cloud-sun' : 'sun', 20)}</div>
        <div class="sol-card-temps">
          <span class="sol-high">${s.highC}°</span>
          <span class="sol-low">${s.lowC}°</span>
        </div>
      </div>
    `).join('');
  }

  setupMeasureTool() {
    const dialog = document.getElementById('measure-dialog');
    const closeBtn = document.getElementById('btn-close-measure');
    const btnDest = document.getElementById('btn-measure-current-dest');
    const btnClear = document.getElementById('btn-measure-clear');
    const mapCanvas = document.getElementById('measure-map-canvas');
    const canvas3D = document.getElementById('measure-3d-canvas');

    // Preload HiRISE Gale orthophoto for authentic 2D context
    this.measureMapImg = new Image();
    this.measureMapImg.src = getAssetUrl('data/map/satellite_4km.jpg');
    this.measureMapImg.onload = () => {
      if (dialog && !dialog.classList.contains('hidden')) {
        this.updateMeasureDisplay();
      }
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        store.setState({
          measure: { ...store.getState().measure, active: false },
          panelStates: { measureOpen: false }
        });
      });
    }

    if (mapCanvas) {
      mapCanvas.addEventListener('click', (e) => {
        const rect = mapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const w = rect.width || 280;
        const h = rect.height || 150;

        // Map window extent: 1600m x 857m centered around Bradbury Landing
        const meterSpanX = 1600.0;
        const meterSpanY = meterSpanX * (h / w);
        const mx = ((clickX - w / 2) / (w / 2)) * (meterSpanX / 2);
        const my = ((h / 2 - clickY) / (h / 2)) * (meterSpanY / 2);

        const origin = store.getState().origin;
        const { lat, lon } = localMetersToLatLon(mx, my, origin.lat, origin.lon);
        const z = getSimulatedTerrainElevation(mx, my);

        const pt = {
          x: mx,
          y: my,
          z,
          lat,
          lon,
          elevation_m: -4501.0 + z
        };

        const state = store.getState();
        if (!state.measure.pointA || (state.measure.pointA && state.measure.pointB)) {
          store.setState({ measure: { ...state.measure, pointA: pt, pointB: null } });
        } else {
          const res = computeElevationProfile(state.measure.pointA, pt, 40);
          store.setState({
            measure: {
              ...state.measure,
              pointB: pt,
              terrainDist_m: res.terrainDist,
              straightDist_m: res.straightDist,
              elevGain_m: res.elevGain,
              maxSlope_deg: res.maxSlope,
              profilePoints: res.points
            }
          });
        }
        this.updateMeasureDisplay();
      });
    }

    if (canvas3D) {
      canvas3D.addEventListener('mousemove', (e) => {
        const rect = canvas3D.getBoundingClientRect();
        this.measureHoverX = e.clientX - rect.left;
        this.renderMeasureCanvases(store.getState().measure);
      });
      canvas3D.addEventListener('mouseleave', () => {
        this.measureHoverX = null;
        this.measureHoverT = null;
        this.renderMeasureCanvases(store.getState().measure);
      });
    }

    if (btnDest) {
      btnDest.addEventListener('click', () => {
        const { position, destination } = store.getState();
        const ptA = {
          x: position.x,
          y: position.y,
          z: position.z,
          lat: position.lat,
          lon: position.lon,
          elevation_m: position.elevation
        };

        const destCoords = getDestinationCoords(destination);
        const origin = store.getState().origin;
        const localDest = latLonToLocalMeters(destCoords.lat, destCoords.lon, origin.lat, origin.lon);
        const zDest = getSimulatedTerrainElevation(localDest.x, localDest.y);

        const ptB = {
          x: localDest.x,
          y: localDest.y,
          z: zDest,
          lat: destCoords.lat,
          lon: destCoords.lon,
          elevation_m: -4501.0 + zDest
        };

        const res = computeElevationProfile(ptA, ptB, 40);
        store.setState({
          measure: {
            active: true,
            pointA: ptA,
            pointB: ptB,
            terrainDist_m: res.terrainDist,
            straightDist_m: res.straightDist,
            elevGain_m: res.elevGain,
            maxSlope_deg: res.maxSlope,
            profilePoints: res.points
          }
        });
        this.updateMeasureDisplay();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        store.setState({
          measure: {
            active: true,
            pointA: null,
            pointB: null,
            terrainDist_m: 0,
            straightDist_m: 0,
            elevGain_m: 0,
            maxSlope_deg: 0,
            profilePoints: []
          }
        });
        this.updateMeasureDisplay();
      });
    }
  }

  updateMeasureDisplay() {
    const { measure, position, destination } = store.getState();
    const origin = store.getState().origin;

    // Default Point A and Point B if uninitialized
    const ptA = measure.pointA || {
      x: position.x,
      y: position.y,
      z: position.z,
      lat: position.lat,
      lon: position.lon,
      elevation_m: position.elevation
    };

    let ptB = measure.pointB;
    if (!ptB) {
      const destCoords = getDestinationCoords(destination);
      const localDest = latLonToLocalMeters(destCoords.lat, destCoords.lon, origin.lat, origin.lon);
      const zDest = getSimulatedTerrainElevation(localDest.x, localDest.y);
      ptB = {
        x: localDest.x,
        y: localDest.y,
        z: zDest,
        lat: destCoords.lat,
        lon: destCoords.lon,
        elevation_m: -4501.0 + zDest
      };
    }

    const res = computeElevationProfile(ptA, ptB, 40);

    const ptAEl = document.getElementById('measure-pt-a');
    const ptBEl = document.getElementById('measure-pt-b');
    const terrDistEl = document.getElementById('val-terrain-dist');
    const strDistEl = document.getElementById('val-straight-dist');
    const elevGainEl = document.getElementById('val-elev-gain');
    const slopeEl = document.getElementById('val-max-slope');
    const craterDepthEl = document.getElementById('val-crater-depth');
    const depthBelowRimEl = document.getElementById('val-depth-below-rim');

    if (ptAEl) {
      ptAEl.textContent = `${formatLatitudePlanetocentric(ptA.lat)}, ${formatLongitudeEast(ptA.lon)} (${ptA.elevation_m.toFixed(1)} m)`;
    }
    if (ptBEl) {
      ptBEl.textContent = `${formatLatitudePlanetocentric(ptB.lat)}, ${formatLongitudeEast(ptB.lon)} (${ptB.elevation_m.toFixed(1)} m)`;
    }

    const terrainDist = measure.terrainDist_m || res.terrainDist;
    const straightDist = measure.straightDist_m || res.straightDist;
    const elevGain = measure.elevGain_m !== undefined ? measure.elevGain_m : res.elevGain;
    const maxSlope = measure.maxSlope_deg || res.maxSlope;

    if (terrDistEl) terrDistEl.textContent = formatNavDistance(terrainDist);
    if (strDistEl) strDistEl.textContent = formatNavDistance(straightDist);
    if (elevGainEl) elevGainEl.textContent = `+${elevGain.toFixed(1)} m`;
    if (slopeEl) slopeEl.textContent = `${maxSlope.toFixed(1)}° (${maxSlope < 15 ? 'Safe' : 'Caution'})`;

    if (craterDepthEl) craterDepthEl.textContent = '5,500 m';
    if (depthBelowRimEl) {
      const belowRim = Math.round(1000.0 - position.elevation);
      depthBelowRimEl.textContent = `${belowRim.toLocaleString()} m`;
    }

    this.renderElevationProfileChart(res.points);
    this.renderMeasureCanvases({ ...measure, pointA: ptA, pointB: ptB, profilePoints: res.points, terrainDist_m: terrainDist, straightDist_m: straightDist });
  }

  renderMeasureCanvases(measure) {
    const origin = store.getState().origin;
    const ptA = measure.pointA || { x: 0, y: 0, lat: origin.lat, lon: origin.lon, elevation_m: -4501.0 };
    const ptB = measure.pointB || { x: 284, y: 20, lat: -4.5898, lon: 137.4465, elevation_m: -4503.2 };

    // 1. 2D Crater Measurement Map Canvas (Real NASA HiRISE Orthophoto Context)
    const mapCanvas = document.getElementById('measure-map-canvas');
    if (mapCanvas) {
      const ctx = mapCanvas.getContext('2d');
      const w = mapCanvas.width;
      const h = mapCanvas.height;

      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, w, h);

      const meterSpanX = 1600.0;
      const meterSpanY = meterSpanX * (h / w); // 857.14 m

      // Draw real NASA HiRISE orthophoto if loaded
      if (this.measureMapImg && this.measureMapImg.complete && this.measureMapImg.naturalWidth > 0) {
        const img = this.measureMapImg;
        // Total terrain image represents 4000m x 4000m
        const pxPerMeter = img.naturalWidth / 4000.0;
        const cropW = meterSpanX * pxPerMeter;
        const cropH = meterSpanY * pxPerMeter;
        const cropX = img.naturalWidth / 2 - cropW / 2;
        const cropY = img.naturalHeight / 2 - cropH / 2;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, w, h);

        // Subtle dark gradient vignette for tactical contrast
        const vig = ctx.createLinearGradient(0, 0, 0, h);
        vig.addColorStop(0.0, 'rgba(8, 12, 20, 0.45)');
        vig.addColorStop(0.2, 'rgba(8, 12, 20, 0.10)');
        vig.addColorStop(0.8, 'rgba(8, 12, 20, 0.10)');
        vig.addColorStop(1.0, 'rgba(8, 12, 20, 0.60)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Fallback procedural tactical grid
        ctx.strokeStyle = '#1e3352';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, w - 20, h - 20);
      }

      // Map local meters to canvas coordinates
      const toCanvasX = (mx) => (w / 2) + (mx / (meterSpanX / 2)) * (w / 2);
      const toCanvasY = (my) => (h / 2) - (my / (meterSpanY / 2)) * (h / 2);

      const ax = toCanvasX(ptA.x);
      const ay = toCanvasY(ptA.y);
      const bx = toCanvasX(ptB.x);
      const by = toCanvasY(ptB.y);

      // Connecting measurement transect line
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance tag along line
      const midX = (ax + bx) / 2;
      const midY = (ay + by) / 2;
      const distLabel = formatNavDistance(measure.terrainDist_m || 284.6);
      ctx.fillStyle = 'rgba(10, 16, 28, 0.85)';
      ctx.fillRect(midX - 24, midY - 14, 48, 16);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - 24, midY - 14, 48, 16);
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(distLabel, midX, midY - 6);

      // Interactive hover position along transect line
      if (this.measureHoverT !== null && this.measureHoverT !== undefined) {
        const hx = ax + (bx - ax) * this.measureHoverT;
        const hy = ay + (by - ay) * this.measureHoverT;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Point A (Cyan Crosshair & Marker)
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(ax, ay, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('A', ax, ay - 8);

      // Point B (Orange Crosshair & Marker)
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText('B', bx, by - 8);

      // Map scale and context badge
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#8ab4f8';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('Surface Mosaic (25cm)', 6, h - 6);
      ctx.textAlign = 'right';
      ctx.fillText('1.6 km Window', w - 6, h - 6);
    }

    // 2. Surface Elevation Profiler Canvas
    const canvas3D = document.getElementById('measure-3d-canvas');
    if (canvas3D) {
      const ctx = canvas3D.getContext('2d');
      const w = canvas3D.width;
      const h = canvas3D.height;

      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, w, h);

      // Sample profile points from Point A to Point B
      const res = computeElevationProfile(ptA, ptB, 40);
      const points = res.points || [];

      if (points.length >= 2) {
        const padL = 46;
        const padR = 14;
        const padT = 28;
        const padB = 26;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        const maxDist = points[points.length - 1].distanceAlong || 1.0;
        let minElev = Math.min(...points.map(p => p.elevMola));
        let maxElev = Math.max(...points.map(p => p.elevMola));
        const span = maxElev - minElev;
        if (span < 4.0) {
          const mid = (minElev + maxElev) / 2;
          minElev = mid - 2.5;
          maxElev = mid + 2.5;
        } else {
          minElev -= span * 0.15;
          maxElev += span * 0.15;
        }

        const toPlotX = (d) => padL + (d / maxDist) * plotW;
        const toPlotY = (elev) => padT + plotH - ((elev - minElev) / (maxElev - minElev)) * plotH;

        // Header Title & Badges
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('ELEVATION TRANSECT PROFILE', padL, 8);

        ctx.fillStyle = '#ff9100';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('MOLA DATUM', w - padR, 8);

        // Horizontal Elevation Grid Lines & Labels
        const numGridY = 4;
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '8px "JetBrains Mono", monospace';

        for (let i = 0; i <= numGridY; i++) {
          const t = i / numGridY;
          const elevVal = minElev + (1 - t) * (maxElev - minElev);
          const py = padT + t * plotH;

          ctx.strokeStyle = (i === numGridY || i === 0) ? '#1c283c' : 'rgba(28, 40, 60, 0.45)';
          ctx.beginPath();
          ctx.moveTo(padL, py);
          ctx.lineTo(padL + plotW, py);
          ctx.stroke();

          ctx.fillStyle = '#6a8db5';
          ctx.fillText(`${elevVal.toFixed(0)}m`, padL - 4, py);
        }

        // Vertical Distance Grid Lines & Labels
        const numGridX = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= numGridX; i++) {
          const t = i / numGridX;
          const dVal = t * maxDist;
          const px = padL + t * plotW;

          ctx.strokeStyle = 'rgba(28, 40, 60, 0.35)';
          ctx.beginPath();
          ctx.moveTo(px, padT);
          ctx.lineTo(px, padT + plotH);
          ctx.stroke();

          ctx.fillStyle = '#6a8db5';
          ctx.fillText(formatNavDistance(dVal), px, padT + plotH + 4);
        }

        // Gradient Area Fill under the elevation profile curve
        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0.0, 'rgba(0, 229, 255, 0.35)');
        grad.addColorStop(0.5, 'rgba(255, 145, 0, 0.15)');
        grad.addColorStop(1.0, 'rgba(7, 10, 18, 0.05)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(toPlotX(points[0].distanceAlong), toPlotY(points[0].elevMola));
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(toPlotX(points[i].distanceAlong), toPlotY(points[i].elevMola));
        }
        ctx.lineTo(toPlotX(maxDist), padT + plotH);
        ctx.lineTo(toPlotX(0), padT + plotH);
        ctx.closePath();
        ctx.fill();

        // Stroke the Elevation Profile line
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(toPlotX(points[0].distanceAlong), toPlotY(points[0].elevMola));
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(toPlotX(points[i].distanceAlong), toPlotY(points[i].elevMola));
        }
        ctx.stroke();

        // Point A Marker
        const ax = toPlotX(0);
        const ay = toPlotY(points[0].elevMola);
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Point B Marker
        const bx = toPlotX(maxDist);
        const by = toPlotY(points[points.length - 1].elevMola);
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Interactive Hover Scrubber
        if (this.measureHoverX !== null && this.measureHoverX !== undefined) {
          const clampedX = Math.max(padL, Math.min(padL + plotW, this.measureHoverX));
          const t = (clampedX - padL) / plotW;
          this.measureHoverT = t;

          // Interpolate point along profile
          const idxFloat = t * (points.length - 1);
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(points.length - 1, i0 + 1);
          const frac = idxFloat - i0;
          const curDist = points[i0].distanceAlong + frac * (points[i1].distanceAlong - points[i0].distanceAlong);
          const curElev = points[i0].elevMola + frac * (points[i1].elevMola - points[i0].elevMola);
          const curPy = toPlotY(curElev);

          // Scrubber vertical line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(clampedX, padT);
          ctx.lineTo(clampedX, padT + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Intersection Dot
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(clampedX, curPy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Scrubber Tooltip Badge
          const badgeText = `${formatNavDistance(curDist)} · ${curElev.toFixed(1)}m`;
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          const badgeW = ctx.measureText(badgeText).width + 12;
          const badgeX = Math.max(padL, Math.min(padL + plotW - badgeW, clampedX - badgeW / 2));
          const badgeY = Math.max(padT + 4, curPy - 18);

          ctx.fillStyle = 'rgba(10, 16, 28, 0.90)';
          ctx.fillRect(badgeX, badgeY, badgeW, 14);
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(badgeX, badgeY, badgeW, 14);

          ctx.fillStyle = '#00e5ff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 7);
        } else {
          this.measureHoverT = null;
        }
      }
    }
  }

  renderElevationProfileChart(points = []) {
    const container = document.getElementById('measure-profile-container');
    if (!container) return;

    if (!points || points.length < 2) {
      container.innerHTML = `<div class="measure-chart-placeholder">Select two points on the Mini Map to plot topographic elevation profile</div>`;
      return;
    }

    const svgW = 460;
    const svgH = 120;
    const padX = 40;
    const padY = 20;
    const chartW = svgW - padX * 2;
    const chartH = svgH - padY * 2;

    const maxDist = points[points.length - 1].distanceAlong || 1.0;
    let minElev = Math.min(...points.map(p => p.elevMola));
    let maxElev = Math.max(...points.map(p => p.elevMola));
    if (maxElev - minElev < 2.0) {
      maxElev += 1.0;
      minElev -= 1.0;
    }

    const getX = (d) => padX + (d / maxDist) * chartW;
    const getY = (elev) => svgH - padY - ((elev - minElev) / (maxElev - minElev)) * chartH;

    let pathD = `M ${getX(points[0].distanceAlong)} ${getY(points[0].elevMola)}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${getX(points[i].distanceAlong)} ${getY(points[i].elevMola)}`;
    }
    const areaD = `${pathD} L ${getX(maxDist)} ${svgH - padY} L ${getX(0)} ${svgH - padY} Z`;

    container.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="profileGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff9100" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#ff9100" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <!-- Horizontal grid line -->
        <line x1="${padX}" y1="${getY(minElev)}" x2="${svgW - padX}" y2="${getY(minElev)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        <line x1="${padX}" y1="${getY(maxElev)}" x2="${svgW - padX}" y2="${getY(maxElev)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        
        <!-- Y-Labels -->
        <text x="${padX - 4}" y="${getY(maxElev) + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="'JetBrains Mono',monospace">${maxElev.toFixed(0)}m</text>
        <text x="${padX - 4}" y="${getY(minElev) + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="'JetBrains Mono',monospace">${minElev.toFixed(0)}m</text>

        <!-- Area & Profile Line -->
        <path d="${areaD}" fill="url(#profileGrad)"/>
        <path d="${pathD}" fill="none" stroke="#ff9100" stroke-width="2"/>

        <!-- Start & End dots -->
        <circle cx="${getX(0)}" cy="${getY(points[0].elevMola)}" r="4" fill="#00e5ff"/>
        <circle cx="${getX(maxDist)}" cy="${getY(points[points.length - 1].elevMola)}" r="4" fill="#ff7043"/>

        <!-- X-Labels -->
        <text x="${getX(0)}" y="${svgH - 4}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">0 m</text>
        <text x="${getX(maxDist)}" y="${svgH - 4}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono',monospace">${formatNavDistance(maxDist)}</text>
      </svg>
    `;
  }

  setupVexControls() {
    const vexBtn = document.getElementById('btn-vex');
    const vexBadge = document.getElementById('vex-badge');

    if (vexBtn) {
      vexBtn.addEventListener('click', () => {
        const currentVex = store.getState().verticalExaggeration;
        const nextVex = currentVex === 1 ? 2 : currentVex === 2 ? 3 : 1;
        store.setState({ verticalExaggeration: nextVex });
        vexBtn.textContent = `${nextVex}x`;
        if (nextVex > 1) {
          vexBadge.textContent = `VERT EXAG ${nextVex}X (SIMULATED)`;
          vexBadge.classList.remove('hidden');
        } else {
          vexBadge.classList.add('hidden');
        }
      });
    }
  }

  setupRightEdgeControls() {
    const btnCompass = document.getElementById('btn-compass-north');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnCamera = document.getElementById('btn-camera-view');

    if (btnCamera) {
      btnCamera.addEventListener('click', () => {
        if (window.__marsTerrain) {
          const mode = window.__marsTerrain.toggleCameraMode();
          const modeLabel = mode === 'thirdPerson' ? '3rd-Person (Curiosity Rover View)' : '1st-Person (EVA Helmet View)';
          this.showToast('info', `Camera switched to ${modeLabel}`);
        }
      });
    }

    if (btnCompass) {
      btnCompass.addEventListener('click', () => {
        store.setState({ heading: 0.0 });
        this.updateInstructionBar();
        this.showToast('info', 'Heading snapped to North (0 deg).');
      });
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        this.stepAstronaut(10.0);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        this.stepAstronaut(-10.0);
      });
    }
  }

  setupMovementControls() {
    document.getElementById('btn-step-forward').addEventListener('click', () => this.stepAstronaut(14.0));
    document.getElementById('btn-step-back').addEventListener('click', () => this.stepAstronaut(-14.0));
    document.getElementById('btn-rotate-left').addEventListener('click', () => this.rotateHeading(-15.0));
    document.getElementById('btn-rotate-right').addEventListener('click', () => this.rotateHeading(15.0));

    // Listen for mouse wheel / gesture stepping dispatched from 3D terrain canvas
    window.addEventListener('step-astronaut', (e) => {
      if (e.detail && typeof e.detail.distance === 'number') {
        this.stepAstronaut(e.detail.distance);
      }
    });
  }

  stepAstronaut(distanceMeters) {
    const { position, heading, route, activeWaypointIndex, destination } = store.getState();
    const headingRad = (heading * Math.PI) / 180.0;

    const dx = Math.sin(headingRad) * distanceMeters;
    const dy = Math.cos(headingRad) * distanceMeters;

    const candidateX = position.x + dx;
    const candidateY = position.y + dy;

    // Check terrain slope safety limit (Horn method over >= 5m baseline)
    const slopeDeg = calculateHornSlope5m(candidateX, candidateY);
    if (slopeDeg > MAX_SAFE_SLOPE_DEG) {
      if (!this.lastSlopeToastTime || Date.now() - this.lastSlopeToastTime > 6000) {
        this.showToast('caution', `Traversing steep slope: ${slopeDeg.toFixed(1)}° (>15° EVA limit).`);
        this.lastSlopeToastTime = Date.now();
      }
    }

    const origin = store.getState().origin;
    const { lat, lon } = localMetersToLatLon(candidateX, candidateY, origin.lat, origin.lon);
    const z = getSimulatedTerrainElevation(candidateX, candidateY);
    const newElevation = -4501.0 + z;

    store.setState({
      position: {
        x: candidateX,
        y: candidateY,
        z,
        lat,
        latitude: lat,
        lon,
        longitude: lon,
        elevation: newElevation,
        elevation_m: newElevation
      }
    });

    // Check arrival or clear toast if moved 10m away
    const liveRes = getLiveDistanceToDestination({ lat, lon }, destination);
    const currentDist = liveRes ? liveRes.distance : Infinity;

    if (currentDist <= 5.0) {
      if (!this.hasArrived) {
        this.hasArrived = true;
        this.arrivalLocation = { lat, lon, x: candidateX, y: candidateY };
        this.showToast('success', `Arrived at destination: ${destination.name}`);
      }
    } else if (this.hasArrived && this.arrivalLocation) {
      const movedAwayDist = Math.sqrt(Math.pow(candidateX - this.arrivalLocation.x, 2) + Math.pow(candidateY - this.arrivalLocation.y, 2));
      if (movedAwayDist >= 10.0) {
        this.dismissToast();
      }
    }

    if (route && route.length > 0) {
      const nextIndex = Math.min(activeWaypointIndex + 1, route.length - 1);
      const wp = route[nextIndex];
      const distToWp = Math.sqrt(Math.pow(wp.x - candidateX, 2) + Math.pow(wp.y - candidateY, 2));

      if (distToWp <= 5.0 && activeWaypointIndex < route.length - 1) {
        store.setState({ activeWaypointIndex: nextIndex });
      }
    }

    this.updateRouteCardMetrics(destination);
    this.updateInstructionBar();
    this.updateDrawerLocation();
    this.updateLiveTelemetry();
  }

  updateLiveTelemetry() {
    const { position } = store.getState();
    const elevSlopeEl = document.getElementById('live-elev-slope');
    if (elevSlopeEl) {
      const slopeDeg = calculateHornSlope5m(position.x, position.y);
      const isSafe = slopeDeg <= MAX_SAFE_SLOPE_DEG;
      elevSlopeEl.textContent = `Elev: ${position.elevation.toFixed(0)} m · Slope: ${slopeDeg}° (${isSafe ? 'Safe' : 'Caution'})`;
      elevSlopeEl.style.color = isSafe ? 'var(--status-safe)' : 'var(--status-caution)';
    }

    this.updateMinecraftCoords();
  }

  updateMinecraftCoords() {
    const { position, heading } = store.getState();
    const posValEl = document.getElementById('mc-pos-val');
    const elevValEl = document.getElementById('mc-elev-val');
    const facingValEl = document.getElementById('mc-facing-val');

    if (!posValEl) return;

    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((heading % 360 + 360) % 360) / 22.5) % 16;
    const facing = dirs[idx];

    const latStr = `${Math.abs(position.lat).toFixed(4)} ${position.lat < 0 ? 'S' : 'N'}`;
    const lonStr = `${position.lon.toFixed(4)} E`;

    posValEl.textContent = `${lonStr}, ${latStr}`;
    if (elevValEl) elevValEl.textContent = `(${position.elevation.toFixed(0)}m)`;
    if (facingValEl) facingValEl.textContent = `${facing} (${heading.toFixed(0)}°)`;
  }

  rotateHeading(deltaDeg) {
    const current = store.getState().heading;
    const next = (current + deltaDeg + 360.0) % 360.0;
    store.setState({ heading: next });
    this.updateInstructionBar();
    this.updateMinecraftCoords();
  }

  realignHeadingToRoute() {
    const { position, route, activeWaypointIndex } = store.getState();
    if (!route || route.length === 0) return;

    const nextIndex = Math.min(activeWaypointIndex + 1, route.length - 1);
    const targetWp = route[nextIndex];
    const dx = targetWp.x - position.x;
    const dy = targetWp.y - position.y;
    const targetBearing = (Math.atan2(dx, dy) * (180.0 / Math.PI) + 360.0) % 360.0;

    store.setState({ heading: targetBearing });
    this.updateInstructionBar();
    this.showToast('info', 'Realigned heading to route.');
  }

  updateInstructionBar() {
    const { position, heading, route, activeWaypointIndex, destination } = store.getState();
    const instEl = document.getElementById('instruction-text');
    const teleEl = document.getElementById('instruction-telemetry');
    const backPill = document.getElementById('btn-back-to-route');

    if (!instEl || !teleEl) return;

    if (this.hasArrived) {
      instEl.textContent = `Arrived: ${destination.name}`;
      teleEl.textContent = 'Destination reached (0 min)';
      if (backPill) backPill.classList.add('hidden');
      return;
    }

    const liveRes = getLiveDistanceToDestination(position, destination);
    if (!liveRes) {
      instEl.textContent = 'Standby: Calculating route...';
      teleEl.textContent = 'Remaining -- m, about -- min';
      return;
    }

    const totalRemaining = liveRes.distance;

    if (totalRemaining <= 5.0) {
      this.hasArrived = true;
      this.arrivalLocation = { lat: position.lat, lon: position.lon, x: position.x, y: position.y };
      instEl.textContent = `Arrived: ${destination.name}`;
      teleEl.textContent = 'Destination reached (0 min)';
      if (backPill) backPill.classList.add('hidden');
      return;
    }

    let targetBearing = liveRes.bearing;
    let distToWp = totalRemaining;

    // For local Gale Crater routes (<= 4000m), use waypoint-level guidance
    if (totalRemaining <= 4000.0 && route && route.length > 0) {
      const nextIndex = Math.min(activeWaypointIndex + 1, route.length - 1);
      const targetWp = route[nextIndex];
      const dx = targetWp.x - position.x;
      const dy = targetWp.y - position.y;
      distToWp = Math.sqrt(dx * dx + dy * dy);
      targetBearing = (Math.atan2(dx, dy) * (180.0 / Math.PI) + 360.0) % 360.0;
    }

    const relBearing = getRelativeBearing(targetBearing, heading);

    if (totalRemaining > 4000.0) {
      // Planetary target across Mars
      const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const idx = Math.round(((liveRes.bearing % 360 + 360) % 360) / 22.5) % 16;
      const card = dirs[idx];
      instEl.textContent = `Transit to ${destination.name} · Bearing ${Math.round(liveRes.bearing)}° (${card})`;
      teleEl.textContent = `Distance ${formatNavDistance(totalRemaining)} · View on Globe / Flat Map`;
    } else {
      instEl.textContent = formatInstruction(relBearing, distToWp, destination.name, false);
      teleEl.textContent = formatRemainingTelemetry(totalRemaining, DEFAULT_SUIT_PACE_MS);
    }

    if (Math.abs(relBearing) > 160.0) {
      if (backPill) backPill.classList.remove('hidden');
      if (!this.offRouteToastShown) {
        this.showToast('caution', 'Caution: Heading opposite to route (>160 deg).');
        this.offRouteToastShown = true;
      }
    } else {
      if (backPill) backPill.classList.add('hidden');
      this.offRouteToastShown = false;
    }
  }

  setupDirectionsDrawer() {
    const drawer = document.getElementById('directions-drawer');
    const closeBtn = document.getElementById('btn-close-directions-drawer');
    const returnStartBtn = document.getElementById('btn-return-start');
    const originInput = document.getElementById('origin-search-input');
    const clearOriginBtn = document.getElementById('btn-clear-origin');
    const originSuggestions = document.getElementById('origin-suggestions');
    const searchInput = document.getElementById('dest-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    const previewBtn = document.getElementById('btn-route-preview');
    const detailsBtn = document.getElementById('btn-route-details');

    const parseCoordinates = (str) => {
      if (!str || typeof str !== 'string') return null;
      try {
        const s = str.trim();
        const m1 = s.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
        if (m1) {
          const lat = parseFloat(m1[1]);
          const lon = parseFloat(m1[3]);
          if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90) {
            return { lat, lon: (lon % 360 + 360) % 360 };
          }
        }
        const m2 = s.match(/^(\d+(\.\d+)?)\s*([NSns])[,\s]+(\d+(\.\d+)?)\s*([EWew])$/);
        if (m2) {
          let lat = parseFloat(m2[1]);
          if (m2[3].toUpperCase() === 'S') lat = -lat;
          let lon = parseFloat(m2[4]);
          if (m2[6].toUpperCase() === 'W') lon = 360 - lon;
          if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90) {
            return { lat, lon: (lon % 360 + 360) % 360 };
          }
        }
      } catch (err) {
        return null;
      }
      return null;
    };

    const setCustomLocation = (lat, lon, name = null) => {
      const origin = store.getState().origin;
      const local = latLonToLocalMeters(lat, lon, origin.lat, origin.lon);
      const z = getSimulatedTerrainElevation(local.x, local.y);
      store.setState({
        position: {
          x: local.x,
          y: local.y,
          z,
          lat,
          latitude: lat,
          lon,
          longitude: lon,
          elevation: -4501.0 + z,
          elevation_m: -4501.0 + z
        }
      });
      this.recomputeRoute(store.getState().destination);
      this.updateDrawerLocation();
      const placeLabel = name || `${formatLatitudePlanetocentric(lat)}, ${formatLongitudeEast(lon)}`;
      this.showToast('info', `Location set to ${placeLabel}`);
      if (originInput) {
        originInput.value = '';
        if (clearOriginBtn) clearOriginBtn.classList.add('hidden');
      }
      if (originSuggestions) originSuggestions.classList.add('hidden');
    };

    if (originInput) {
      originInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = originInput.value.trim();
          const coords = parseCoordinates(val);
          if (coords) {
            setCustomLocation(coords.lat, coords.lon);
          } else {
            const match = placesData.find(p => p.name.toLowerCase().includes(val.toLowerCase()));
            if (match) {
              setCustomLocation(match.lat !== undefined ? match.lat : match.latitude, match.lon !== undefined ? match.lon : match.longitude, match.name);
            } else {
              this.showToast('caution', 'Enter coordinates (e.g. -4.59, 137.44 or 4.59 S, 137.44 E)');
            }
          }
        }
      });

      originInput.addEventListener('input', debounce((e) => {
        const val = e.target.value.trim().toLowerCase();
        if (clearOriginBtn) clearOriginBtn.classList.toggle('hidden', val.length === 0);
        if (val.length < 2) {
          if (originSuggestions) originSuggestions.classList.add('hidden');
          return;
        }
        const matches = placesData.filter(p => p.name.toLowerCase().includes(val)).slice(0, 5);
        if (matches.length > 0 && originSuggestions) {
          originSuggestions.innerHTML = matches.map(p => `
            <div class="dest-suggestion-item" data-orig-id="${p.id}" style="padding: 6px 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.06);">
              <span style="font-weight: bold; color: var(--accent-cyan); font-size: 11px;">${p.name}</span>
              <span style="font-size: 10px; color: var(--text-dim); display: block;">${formatLatitudePlanetocentric(p.lat !== undefined ? p.lat : p.latitude)}, ${formatLongitudeEast(p.lon !== undefined ? p.lon : p.longitude)}</span>
            </div>
          `).join('');
          originSuggestions.classList.remove('hidden');

          originSuggestions.querySelectorAll('.dest-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
              const place = placesData.find(p => p.id === item.dataset.origId);
              if (place) {
                setCustomLocation(place.lat !== undefined ? place.lat : place.latitude, place.lon !== undefined ? place.lon : place.longitude, place.name);
              }
            });
          });
        } else if (originSuggestions) {
          originSuggestions.classList.add('hidden');
        }
      }, 150));
    }

    if (clearOriginBtn) {
      clearOriginBtn.addEventListener('click', () => {
        if (originInput) {
          originInput.value = '';
          originInput.focus();
        }
        clearOriginBtn.classList.add('hidden');
        if (originSuggestions) originSuggestions.classList.add('hidden');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDirectionsDrawer());
    }

    if (returnStartBtn) {
      returnStartBtn.addEventListener('click', () => {
        const origin = store.getState().origin;
        store.setState({
          position: {
            x: 0,
            y: 0,
            z: 0,
            lat: origin.lat,
            latitude: origin.lat,
            lon: origin.lon,
            longitude: origin.lon,
            elevation: origin.elevation,
            elevation_m: origin.elevation
          },
          heading: 82.0
        });
        this.hasArrived = false;
        this.arrivalLocation = null;
        this.recomputeRoute(store.getState().destination);
        this.updateDrawerLocation();
        this.showToast('info', 'Returned to Bradbury Landing origin.');
      });
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = searchInput.value.trim();
          const coords = parseCoordinates(val);
          if (coords) {
            const customDest = {
              id: `custom_dest_${Date.now()}`,
              name: `Custom Target (${formatLatitudePlanetocentric(coords.lat)}, ${formatLongitudeEast(coords.lon)})`,
              lat: coords.lat,
              latitude: coords.lat,
              lon: coords.lon,
              longitude: coords.lon,
              elevation_m: -4501.0,
              walkable: true
            };
            this.recomputeRoute(customDest);
            this.showToast('info', `Destination set to ${customDest.name}`);
            searchInput.value = '';
            if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
            this.closeDirectionsDrawer();
          }
        }
      });

      searchInput.addEventListener('input', debounce((e) => {
        const val = e.target.value.trim().toLowerCase();
        if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', val.length === 0);
        this.renderPlacesList(val);
      }, 150));
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        clearSearchBtn.classList.add('hidden');
        this.renderPlacesList('');
      });
    }

    if (previewBtn) {
      previewBtn.addEventListener('click', () => this.toggleRoutePreview());
    }

    if (detailsBtn) {
      detailsBtn.addEventListener('click', () => {
        const turnList = document.getElementById('route-turn-list');
        if (turnList) turnList.classList.toggle('hidden');
      });
    }

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const filter = e.currentTarget.dataset.filter;
        this.renderPlacesList('', filter);
      });
    });

    this.renderPlacesList('');
  }

  toggleDirectionsDrawer() {
    const drawer = document.getElementById('directions-drawer');
    const isOpen = !drawer.classList.contains('hidden');

    if (isOpen) {
      this.closeDirectionsDrawer();
    } else {
      this.dismissToast();
      drawer.classList.remove('hidden');
      store.setState({ panelStates: { directionsDrawerOpen: true } });
      this.updateDrawerLocation();
      const searchInput = document.getElementById('dest-search-input');
      if (searchInput) searchInput.focus();
    }
  }

  closeDirectionsDrawer() {
    const drawer = document.getElementById('directions-drawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
      store.setState({ panelStates: { directionsDrawerOpen: false } });
      if (this.lastTriggerElement) {
        this.lastTriggerElement.focus();
        this.lastTriggerElement = null;
      }
    }
  }

  updateDrawerLocation() {
    const { position } = store.getState();
    const originCoords = document.getElementById('dir-origin-coords');
    if (!originCoords) return;

    // Find nearest named feature
    let nearest = null;
    let minDist = Infinity;

    placesData.forEach(p => {
      const res = getLiveDistanceToDestination(position, p);
      if (res && res.distance < minDist) {
        minDist = res.distance;
        nearest = p;
      }
    });

    const latStr = formatLatitudePlanetocentric(position.lat);
    const lonStr = formatLongitudeEast(position.lon);
    const nearStr = nearest ? ` · Near ${nearest.name} (${formatNavDistance(minDist)})` : '';

    originCoords.textContent = `${latStr}, ${lonStr}${nearStr}`;
  }

  recomputeRoute(destination) {
    if (!destination) return;
    const { position, origin } = store.getState();
    const destCoords = getDestinationCoords(destination);

    if (!destCoords) {
      console.error('[UI] Cannot compute route to destination without valid coords:', destination);
      return;
    }

    const localDest = latLonToLocalMeters(destCoords.lat, destCoords.lon, origin.lat, origin.lon);
    const waypoints = generateRoute(position.x, position.y, localDest.x, localDest.y, origin.lat, origin.lon);

    this.hasArrived = false;
    this.arrivalLocation = null;

    store.setState({
      destination: {
        ...destination,
        lat: destCoords.lat,
        latitude: destCoords.lat,
        lon: destCoords.lon,
        longitude: destCoords.lon
      },
      route: waypoints,
      activeWaypointIndex: 0
    });

    this.updateRouteCardMetrics(destination);
    this.updateInstructionBar();
    this.renderTurnByTurnList(waypoints);

    if (window.__marsMiniMap) {
      setTimeout(() => {
        if (window.__marsMiniMap) window.__marsMiniMap.fitRoute();
      }, 100);
    }
  }

  updateRouteCardMetrics(destination) {
    const { position, route } = store.getState();
    const destNameEl = document.getElementById('card-dest-name');
    const cardRouteEl = document.getElementById('card-route-dist');
    const cardStraightEl = document.getElementById('card-straight-dist');
    const cardTimeEl = document.getElementById('card-route-time');

    if (destNameEl) destNameEl.textContent = destination.name;

    const liveRes = getLiveDistanceToDestination(position, destination);
    if (!liveRes) {
      if (cardRouteEl) cardRouteEl.textContent = '--';
      if (cardStraightEl) cardStraightEl.textContent = '--';
      if (cardTimeEl) cardTimeEl.textContent = '--';
      return;
    }

    const isRoverTarget = !destination.walkable || liveRes.distance > 3000.0;
    const badgeEl = document.querySelector('.route-simulated-badge');
    const previewBtn = document.getElementById('btn-route-preview');
    if (badgeEl) {
      badgeEl.textContent = isRoverTarget ? 'ROVER EXPEDITION' : 'WALKING EVA';
      badgeEl.style.color = isRoverTarget ? '#00e5ff' : '#ff9800';
    }
    if (previewBtn) {
      previewBtn.textContent = isRoverTarget ? 'Preview Drive (4x)' : 'Preview Walk (4x)';
    }

    const distStr = formatNavDistance(liveRes.distance);

    if (cardRouteEl) cardRouteEl.textContent = distStr;
    if (cardStraightEl) cardStraightEl.textContent = distStr;
    if (cardTimeEl) {
      if (liveRes.distance <= 5.0) {
        cardTimeEl.textContent = 'Arrived (0 min)';
      } else if (isRoverTarget) {
        const km = liveRes.distance / 1000.0;
        if (km < 10) {
          const hrs = Math.max(1, Math.round(km / 0.1));
          cardTimeEl.textContent = `About ${hrs} hr drive`;
        } else {
          const driveDays = Math.max(1, Math.round(km / 25.0));
          cardTimeEl.textContent = `About ${driveDays} sols drive (${km.toFixed(1)} km)`;
        }
      } else {
        const minutes = Math.max(1, Math.round(liveRes.distance / (DEFAULT_SUIT_PACE_MS * 60.0)));
        cardTimeEl.textContent = `About ${minutes} min`;
      }
    }
  }

  renderTurnByTurnList(waypoints) {
    const list = document.getElementById('route-turn-list');
    if (!list || !waypoints) return;

    list.innerHTML = waypoints.map((wp, idx) => `
      <div class="turn-item ${idx === 0 ? 'turn-active' : ''}">
        <span class="turn-num">${idx + 1}</span>
        <div class="turn-text">
          <span class="turn-title">${idx === 0 ? 'Start Position' : idx === waypoints.length - 1 ? 'Target Destination' : `Waypoint ${idx}`}</span>
          <span class="turn-sub">${formatLatitudePlanetocentric(wp.lat)}, ${formatLongitudeEast(wp.lon)} (${wp.elevation.toFixed(1)} m)</span>
        </div>
      </div>
    `).join('');
  }

  renderPlacesList(searchQuery = '', filter = 'all') {
    const list = document.getElementById('places-list');
    if (!list) return;

    const { position } = store.getState();

    let filtered = placesData.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery) || (p.feature_type && p.feature_type.toLowerCase().includes(searchQuery));
      if (!matchSearch) return false;
      if (filter === 'rover') return !p.walkable;
      if (filter === 'walkable') return p.walkable;
      if (filter === 'verified') return p.is_source_verified;
      return true;
    });

    list.innerHTML = filtered.map(place => {
      const res = getLiveDistanceToDestination(position, place);
      const distStr = res ? formatNavDistance(res.distance) : '--';
      const isSelected = store.getState().destination.id === place.id;
      const isWalk = place.walkable;

      return `
        <div class="place-item ${isSelected ? 'selected' : ''}" data-id="${place.id}">
          <div class="place-header-row">
            <span class="place-name">${place.name}</span>
            <span class="place-dist">${distStr}</span>
          </div>
          <div class="place-sub-row">
            <span class="place-type">${place.feature_type || 'Feature'}</span>
            <span class="place-coords">${formatLatitudePlanetocentric(place.lat)}, ${formatLongitudeEast(place.lon)}</span>
          </div>
          <div class="place-chips-row">
            <span class="chip-status ${isWalk ? 'chip-walkable' : 'chip-rover'}">
              ${getIcon(isWalk ? 'footprints' : 'navigation', 14)} ${isWalk ? 'Walkable EVA' : 'Rover Expedition'}
            </span>
            <span class="chip-precision chip-approximate">
              ${getIcon('alert-triangle', 14)} +/- ${place.precision_m} m
            </span>
          </div>
          <p class="place-desc">${place.description}</p>
          <div class="place-actions-row">
            <button class="btn-pill btn-pill-primary btn-select-place" data-id="${place.id}">${isWalk ? 'Set Walking Target' : 'Set Rover Destination'}</button>
            <button class="btn-pill btn-show-globe" data-lat="${place.lat}" data-lon="${place.lon}">Show on Globe</button>
            <button class="btn-pill btn-inspect-place" data-id="${place.id}">Inspect Site</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to Set Destination buttons
    list.querySelectorAll('.btn-select-place').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const placeId = e.currentTarget.dataset.id;
        const target = placesData.find(p => p.id === placeId);
        if (target) {
          this.recomputeRoute(target);
          this.closeDirectionsDrawer();
          this.showToast('info', `Routing set to: ${target.name}`);
        }
      });
    });

    // Attach click listeners to Show on Globe buttons
    list.querySelectorAll('.btn-show-globe').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lat = parseFloat(e.currentTarget.dataset.lat);
        const lon = parseFloat(e.currentTarget.dataset.lon);
        const overlay = document.getElementById('globe-overlay');
        if (overlay) {
          overlay.classList.remove('hidden');
          store.setState({ panelStates: { globeOverlayOpen: true } });
          if (window.__marsGlobe) {
            window.__marsGlobe.rotateToCoordinate(lat, lon, true);
          }
        }
      });
    });

    // Attach click listeners to Inspect Site buttons
    list.querySelectorAll('.btn-inspect-place').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const placeId = e.currentTarget.dataset.id;
        this.openPlaceInspection(placeId);
      });
    });
  }

  setupLayerPicker() {
    const tiles = document.querySelectorAll('.layer-tile');
    tiles.forEach(tile => {
      tile.addEventListener('click', (e) => {
        tiles.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const style = e.currentTarget.dataset.style;
        store.setState({ mapStyle: style });
        const picker = document.getElementById('layer-picker-card');
        if (picker) picker.classList.add('hidden');
      });
    });
  }

  toggleRoutePreview() {
    if (this.isPreviewing) {
      clearInterval(this.previewTimer);
      this.isPreviewing = false;
      const btn = document.getElementById('btn-route-preview');
      if (btn) btn.textContent = 'Preview Walk (4x)';
      this.showToast('info', 'Walk preview paused.');
    } else {
      const { route } = store.getState();
      if (!route || route.length < 2) return;

      this.isPreviewing = true;
      const btn = document.getElementById('btn-route-preview');
      if (btn) btn.textContent = 'Pause Walk';
      this.showToast('info', 'Walk preview started (4x pace).');

      let step = 0;
      this.previewTimer = setInterval(() => {
        if (step >= route.length) {
          clearInterval(this.previewTimer);
          this.isPreviewing = false;
          if (btn) btn.textContent = 'Preview Walk (4x)';
          this.showToast('success', 'Destination reached in preview.');
          return;
        }

        const wp = route[step];
        const nextWp = route[Math.min(step + 1, route.length - 1)];
        const dx = nextWp.x - wp.x;
        const dy = nextWp.y - wp.y;
        const targetBearing = (Math.atan2(dx, dy) * (180.0 / Math.PI) + 360.0) % 360.0;

        store.setState({
          position: {
            x: wp.x,
            y: wp.y,
            z: wp.z,
            lat: wp.lat,
            latitude: wp.lat,
            lon: wp.lon,
            longitude: wp.lon,
            elevation: wp.elevation,
            elevation_m: wp.elevation
          },
          heading: targetBearing,
          activeWaypointIndex: step
        });

        this.updateInstructionBar();
        this.updateDrawerLocation();
        this.updateLiveTelemetry();
        step++;
      }, 400);
    }
  }

  setupHelpTour() {
    const btnNext = document.getElementById('btn-tour-next');
    const btnPrev = document.getElementById('btn-tour-prev');
    const btnClose = document.getElementById('btn-close-tour');

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (this.currentTourIndex < this.tourSteps.length - 1) {
          this.currentTourIndex++;
          this.renderTourStep();
        } else {
          this.endHelpTour();
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (this.currentTourIndex > 0) {
          this.currentTourIndex--;
          this.renderTourStep();
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.endHelpTour();
      });
    }
  }

  startHelpTour() {
    this.currentTourIndex = 0;
    const dialog = document.getElementById('tour-dialog');
    dialog.classList.remove('hidden');
    store.setState({ panelStates: { helpTourActive: true, helpTourStep: 0 } });
    this.renderTourStep();
  }

  renderTourStep() {
    const step = this.tourSteps[this.currentTourIndex];
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-text').textContent = step.text;
    document.getElementById('tour-step-counter').textContent = `Step ${this.currentTourIndex + 1} of ${this.tourSteps.length}`;

    // Update active highlight on target element
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    const targetEl = document.getElementById(step.elementId);
    if (targetEl) {
      targetEl.classList.add('tour-highlight');
    }

    const btnPrev = document.getElementById('btn-tour-prev');
    if (btnPrev) btnPrev.disabled = (this.currentTourIndex === 0);

    const btnNext = document.getElementById('btn-tour-next');
    if (btnNext) {
      btnNext.textContent = (this.currentTourIndex === this.tourSteps.length - 1) ? 'Finish Tour' : 'Next';
    }
  }

  endHelpTour() {
    const dialog = document.getElementById('tour-dialog');
    dialog.classList.add('hidden');
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    store.setState({ panelStates: { helpTourActive: false } });
    this.showToast('info', 'Guided navigation tour completed.');
  }

  setupInspectionDialog() {
    const dialog = document.getElementById('inspection-dialog');
    const closeBtn = document.getElementById('btn-close-inspection');
    const prevBtn = document.getElementById('btn-inspect-prev');
    const nextBtn = document.getElementById('btn-inspect-next');
    const setDestBtn = document.getElementById('btn-inspect-set-dest');
    const showGlobeBtn = document.getElementById('btn-inspect-show-globe');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeAllModals();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.navigateInspection(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.navigateInspection(1);
      });
    }

    if (setDestBtn) {
      setDestBtn.addEventListener('click', () => {
        const place = placesData[this.currentInspectionIndex];
        if (place) {
          this.recomputeRoute(place);
          this.closeAllModals();
          this.showToast('info', `Routing set to: ${place.name}`);
        }
      });
    }

    if (showGlobeBtn) {
      showGlobeBtn.addEventListener('click', () => {
        const place = placesData[this.currentInspectionIndex];
        if (place) {
          this.closeAllModals();
          const overlay = document.getElementById('globe-overlay');
          if (overlay) {
            overlay.classList.remove('hidden');
            store.setState({ panelStates: { globeOverlayOpen: true } });
            if (window.__marsGlobe) {
              window.__marsGlobe.rotateToCoordinate(place.lat, place.lon, true);
            }
          }
        }
      });
    }
  }

  navigateInspection(delta) {
    const len = placesData.length;
    if (len === 0) return;
    this.currentInspectionIndex = (this.currentInspectionIndex + delta + len) % len;
    this.renderInspectionContent();
  }

  openPlaceInspection(placeIdOrIndex) {
    if (typeof placeIdOrIndex === 'number') {
      this.currentInspectionIndex = Math.max(0, Math.min(placesData.length - 1, placeIdOrIndex));
    } else if (typeof placeIdOrIndex === 'string') {
      const q = placeIdOrIndex.toLowerCase();
      let idx = placesData.findIndex(p => p.id === q || p.name.toLowerCase() === q);
      if (idx === -1) {
        idx = placesData.findIndex(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
      }
      if (idx !== -1) {
        this.currentInspectionIndex = idx;
      }
    } else if (placeIdOrIndex && placeIdOrIndex.id) {
      let idx = placesData.findIndex(p => p.id === placeIdOrIndex.id || p.name.toLowerCase() === placeIdOrIndex.name?.toLowerCase());
      if (idx !== -1) {
        this.currentInspectionIndex = idx;
      }
    }

    this.renderInspectionContent();
    this.openExclusiveModal('inspection-dialog');
  }

  renderInspectionContent() {
    const place = placesData[this.currentInspectionIndex];
    if (!place) return;

    const nameEl = document.getElementById('inspection-place-name');
    const photoEl = document.getElementById('inspection-photo');
    const captionEl = document.getElementById('inspection-photo-caption');
    const indicatorsEl = document.getElementById('inspection-indicators');
    const narrativeEl = document.getElementById('inspection-narrative');
    const coordsEl = document.getElementById('inspection-coords');
    const elevationEl = document.getElementById('inspection-elevation');
    const typeEl = document.getElementById('inspection-type');
    const recordEl = document.getElementById('inspection-record');
    const trekLink = document.getElementById('btn-inspect-open-trek');

    if (nameEl) nameEl.textContent = place.name.toUpperCase();
    if (photoEl) {
      photoEl.src = getAssetUrl(place.image_url || 'data/places/images/bradbury_landing.jpg');
      photoEl.alt = `${place.name} surface view`;
    }
    if (captionEl) {
      captionEl.textContent = `${place.name} · ${place.feature_type || 'Geological Site'} · Precision ±${place.precision_m} m`;
    }
    if (narrativeEl) {
      narrativeEl.textContent = place.description || 'Martian surface feature documented by NASA orbiter and rover observations.';
    }
    if (coordsEl) {
      coordsEl.textContent = `${formatLatitudePlanetocentric(place.lat)}, ${formatLongitudeEast(place.lon)}`;
    }
    if (elevationEl) {
      elevationEl.textContent = (place.elevation_m !== undefined && place.elevation_m !== null) ? `${place.elevation_m} m Datum` : '--';
    }
    if (typeEl) {
      typeEl.textContent = place.feature_type || 'Martian Feature';
    }
    if (recordEl) {
      recordEl.textContent = place.is_source_verified ? 'Verified NASA / USGS PDS' : 'Simulated EVA Waypoint';
    }
    if (trekLink) {
      const marsTrekUrl = place.source_url && place.source_url.includes('trek.nasa.gov') 
        ? place.source_url 
        : `https://trek.nasa.gov/mars/#v=0.1&x=${place.lon}&y=${place.lat}&z=4&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905`;
      trekLink.href = marsTrekUrl;
    }

    if (indicatorsEl) {
      indicatorsEl.innerHTML = placesData.map((_, i) => {
        return `<span class="carousel-dot ${i === this.currentInspectionIndex ? 'active' : ''}" data-idx="${i}"></span>`;
      }).join('');

      indicatorsEl.querySelectorAll('.carousel-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.idx, 10);
          if (!isNaN(idx)) {
            this.currentInspectionIndex = idx;
            this.renderInspectionContent();
          }
        });
      });
    }
  }

  dismissToast() {
    clearTimeout(this.toastTimer);
    const toast = document.getElementById('toast-container');
    if (toast) toast.classList.add('hidden');
  }

  showToast(type, message) {
    const toast = document.getElementById('toast-container');
    if (!toast) return;

    clearTimeout(this.toastTimer);

    const iconName = type === 'caution' ? 'alert-triangle' : type === 'success' ? 'check' : 'info';

    toast.className = `toast-container toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${getIcon(iconName, 18)}</div>
      <div class="toast-msg">${message}</div>
    `;
    toast.onclick = () => this.dismissToast();
    toast.classList.remove('hidden');

    this.toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  onStateChange(state, prevState) {
    if (
      state.position.lat !== prevState.position.lat ||
      state.position.lon !== prevState.position.lon
    ) {
      document.getElementById('telemetry-lat').textContent = formatLatitudePlanetocentric(state.position.lat);
      document.getElementById('telemetry-lon').textContent = formatLongitudeEast(state.position.lon);
      document.getElementById('telemetry-elev').textContent = `${state.position.elevation.toFixed(0)} m`;
    }
  }
}
