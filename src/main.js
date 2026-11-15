/**
 * Martian Map - Main Application Entrypoint
 * Integrates 3D Terrain HUD, 2D Mini Map, Mars Planetary Globe, and UI Manager.
 * Zero emojis.
 */

import './style.css';
import { TerrainView } from './terrain.js';
import { MarsGlobeView } from './globe.js';
import { MiniMapView } from './minimap.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  if (import.meta.env.DEV) {
    console.log('[MartianMap] Initializing mission-critical EVA surface navigator...');
  }

  // Initialize UI Manager
  const ui = new UIManager();

  // Initialize 3D Terrain View with HUD Arrow and Constant Screen Size Beacon
  const terrainContainer = document.getElementById('terrain-container');
  const hudArrow = document.getElementById('hud-arrow');
  const beaconOverlay = document.getElementById('destination-beacon-overlay');
  const terrainView = new TerrainView(terrainContainer, hudArrow, beaconOverlay);
  window.__marsTerrain = terrainView;

  // Initialize Side Panel Mars Globe and Full Planetary Overlay
  const globeContainer = document.getElementById('globe-container');
  const globeOverlay = document.getElementById('globe-overlay');
  const globeView = new MarsGlobeView(globeContainer, globeOverlay);
  window.__marsGlobe = globeView;

  // Initialize 2D Mini Map (Leaflet on Mars CRS)
  const minimapContainer = document.getElementById('minimap-container');
  const minimapView = new MiniMapView(minimapContainer);
  window.__marsMinimap = minimapView;
  window.__marsMiniMap = minimapView;

  // Main 60 FPS Render Loop
  function animate(now) {
    requestAnimationFrame(animate);
    terrainView.render();
    globeView.render(now);
  }
  requestAnimationFrame(animate);

  if (import.meta.env.DEV) {
    console.log('[MartianMap] System online: IAU 2000 Mars Datum (R = 3,396,190 m).');
  }
});
