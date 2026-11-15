/**
 * Martian Map - Mini Mars Globe and Full Planetary Overlay
 * Displays Mars Viking Colorized Global Mosaic with labeled 30-degree graticule,
 * 1px unblurred orange rim, starfield, "You" cyan beacon, and destination amber pin
 * with screen-space separation leader line.
 * Loads official USGS Gazetteer planetary nomenclature features with level-of-detail declutter.
 * Enforces strict limit of AT MOST 2 WebGL contexts total by sharing a single WebGL renderer.
 * Zero emojis.
 */

import * as THREE from 'three';
import { store } from './state.js';
import { getAssetUrl, requestQueue } from './assets.js';
import {
  marsDistanceAndBearing,
  getLiveDistanceToDestination,
  formatNavDistance,
  formatLatitudePlanetocentric,
  formatLongitudeEast
} from './nav.js';

export class MarsGlobeView {
  constructor(containerElement, overlayContainerElement) {
    this.container = containerElement;
    this.overlayContainer = overlayContainerElement;

    // Single shared WebGL renderer (Context 2 of 2)
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.globeMesh = null;
    this.atmosphereRim = null;
    this.graticuleGroup = null;

    // 2D Flat canvas
    this.overlayFlatCanvas = null;
    this.isOverlayFlat = false;
    this.overlayZoom = 4.2;
    this.flatStyle = 'satellite';
    this.flatStyleImages = {};
    this.flatZoom = 1.0;
    this.flatPan = { x: 0, y: 0 };

    // Easing and interaction state
    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.isEasing = false;
    this.easeStartTime = 0;
    this.easeDuration = 600;

    this.isDragging = false;
    this.previousPointer = { x: 0, y: 0 };

    this.marsTexture = null;
    this.isPlaceholderTexture = false;

    // Nomenclature features from USGS
    this.nomenclatureData = [];
    this.activeFeatureCard = null;
    this.interactiveLabels = [];

    this.init();
  }

  init() {
    this.overlayCanvasContainer = this.overlayContainer.querySelector('.overlay-canvas-container');
    this.overlayFlatCanvas = this.overlayContainer.querySelector('#overlay-flat-canvas');

    this.loadNomenclatureData();
    this.initSharedWebGL();
    this.loadMarsTexture();
    this.setupEventListeners();

    store.subscribe((state, prevState) => this.onStateChange(state, prevState));
    this.updateMarkers(store.getState());
  }

  loadNomenclatureData() {
    requestQueue.fetch(getAssetUrl('data/places/mars_nomenclature.json'))
      .then(res => {
        if (!res.ok) throw new Error('Nomenclature file not found');
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid nomenclature format');
        this.nomenclatureData = data;
        this.drawOverlayFlat();
      })
      .catch(err => {
        console.warn('Could not load mars_nomenclature.json:', err.message);
      });
  }

  initSharedWebGL() {
    // Single shared WebGL Renderer for both mini-globe and full globe overlay
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1.0, 0.1, 100);
    this.camera.position.set(0, 0, 3.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.setSize(220, 220);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x060810, 1.0); // Deep space background

    // Attach initially to mini globe container
    this.container.appendChild(this.renderer.domElement);

    // Sparse Starfield
    this.createStarfield(this.scene, 120);

    // Globe Sphere Geometry - Bright unshaded material like NASA Mars Trek
    const globeGeom = new THREE.SphereGeometry(1.2, 64, 64);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });
    this.globeMesh = new THREE.Mesh(globeGeom, globeMat);
    this.scene.add(this.globeMesh);

    // Labeled 30-degree graticule grid lines
    this.build3DGraticule();

    // 1px crisp orange atmosphere rim (no blur, no glow)
    const rimGeom = new THREE.RingGeometry(1.214, 1.226, 64);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xff7043,
      side: THREE.DoubleSide
    });
    this.atmosphereRim = new THREE.Mesh(rimGeom, rimMat);
    this.scene.add(this.atmosphereRim);

    // HTML Overlay marker layer for mini globe
    this.miniMarkerGroup = document.createElement('div');
    this.miniMarkerGroup.className = 'globe-markers-overlay';
    this.container.appendChild(this.miniMarkerGroup);

    // HTML Overlay marker layer for expanded overlay
    this.overlayMarkerGroup = document.createElement('div');
    this.overlayMarkerGroup.className = 'globe-markers-overlay overlay-markers';
    if (this.overlayCanvasContainer) {
      this.overlayCanvasContainer.appendChild(this.overlayMarkerGroup);
    }
  }

  build3DGraticule() {
    this.graticuleGroup = new THREE.Group();

    // Latitudes every 30 degrees (-60, -30, 0, 30, 60)
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = (90 - lat) * (Math.PI / 180.0);
      const r = 1.202 * Math.sin(phi);
      const y = 1.202 * Math.cos(phi);

      const circleGeom = new THREE.BufferGeometry();
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const theta = (i / 64) * Math.PI * 2;
        pts.push(r * Math.cos(theta), y, r * Math.sin(theta));
      }
      circleGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: lat === 0 ? 0.45 : 0.22
      });
      this.graticuleGroup.add(new THREE.Line(circleGeom, lineMat));
    }

    // Longitudes every 30 degrees (0 to 330)
    for (let lon = 0; lon < 360; lon += 30) {
      const theta = (lon * Math.PI) / 180.0;
      const meridianGeom = new THREE.BufferGeometry();
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const phi = (i / 64) * Math.PI;
        const r = 1.202;
        pts.push(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
      }
      meridianGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: lon === 0 ? 0.45 : 0.20
      });
      this.graticuleGroup.add(new THREE.Line(meridianGeom, lineMat));
    }

    this.globeMesh.add(this.graticuleGroup);
  }

  loadMarsTexture() {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      getAssetUrl('data/globe/mars_viking_color_4096.jpg'),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.marsTexture = tex;
        this.isPlaceholderTexture = false;
        this.applyTexture();
        const badge = document.getElementById('globe-texture-badge');
        if (badge) badge.classList.add('hidden');
        this.drawOverlayFlat();
      },
      undefined,
      () => {
        // Fallback procedural Mars canvas texture
        this.marsTexture = this.generateProceduralMarsTexture();
        this.isPlaceholderTexture = true;
        this.applyTexture();
        const badge = document.getElementById('globe-texture-badge');
        if (badge) {
          badge.textContent = 'PLACEHOLDER TEXTURE';
          badge.classList.remove('hidden');
        }
        this.drawOverlayFlat();
      }
    );
  }

  generateProceduralMarsTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base iron-oxide terrain tone
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#e5e9f0'); // North polar ice cap
    grad.addColorStop(0.08, '#a44d28');
    grad.addColorStop(0.5, '#bd582b'); // Equatorial region
    grad.addColorStop(0.92, '#a44d28');
    grad.addColorStop(1, '#e5e9f0'); // South polar ice cap
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dark volcanic provinces
    ctx.fillStyle = 'rgba(74, 38, 22, 0.45)';
    ctx.beginPath();
    ctx.ellipse(1500, 480, 240, 160, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(400, 320, 320, 140, -0.1, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  applyTexture() {
    if (!this.marsTexture || !this.globeMesh) return;
    this.globeMesh.material.map = this.marsTexture;
    this.globeMesh.material.needsUpdate = true;
  }

  createStarfield(scene, count = 100) {
    const starGeom = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 25.0 + Math.random() * 15.0;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65
    });
    scene.add(new THREE.Points(starGeom, starMat));
  }

  setOverlayMode(mode) {
    this.isOverlayFlat = (mode === 'flat');
    const flatCanvas = this.overlayFlatCanvas;
    const canvasContainer = this.overlayCanvasContainer;
    const flatControl = document.getElementById('flat-style-control');

    if (flatControl) {
      flatControl.classList.toggle('hidden', !this.isOverlayFlat);
    }

    if (this.isOverlayFlat) {
      if (canvasContainer) canvasContainer.classList.add('hidden');
      if (flatCanvas) {
        flatCanvas.classList.remove('hidden');
        this.drawOverlayFlat();
      }
    } else {
      if (flatCanvas) flatCanvas.classList.add('hidden');
      if (canvasContainer) {
        canvasContainer.classList.remove('hidden');
        if (this.renderer.domElement.parentElement !== canvasContainer) {
          canvasContainer.appendChild(this.renderer.domElement);
        }
        this.resizeOverlayRenderer();
      }
    }
  }

  setFlatStyle(style) {
    const normalizedStyle = style === 'elevation' || style === 'mola' ? 'depth' : style;
    this.flatStyle = normalizedStyle;
    if (!this.flatStyleImages) this.flatStyleImages = {};
    if (!this.flatStyleImages[normalizedStyle]) {
      const img = new Image();
      const urls = {
        satellite: getAssetUrl('data/map/mars_global_satellite.jpg'),
        depth: getAssetUrl('data/map/mars_global_mola.jpg'),
        threed: getAssetUrl('data/map/mars_global_mola.jpg'),
        slope: getAssetUrl('data/map/mars_global_slope.jpg'),
        elevation: getAssetUrl('data/map/mars_global_mola.jpg'),
        mola: getAssetUrl('data/map/mars_global_mola.jpg')
      };
      img.src = urls[normalizedStyle] || urls.satellite;
      img.onload = () => {
        this.flatStyleImages[normalizedStyle] = img;
        if (this.isOverlayFlat) this.drawOverlayFlat();
      };
    } else {
      if (this.isOverlayFlat) this.drawOverlayFlat();
    }
  }

  resizeOverlayRenderer() {
    if (!this.overlayCanvasContainer || !this.renderer) return;
    const rect = this.overlayCanvasContainer.getBoundingClientRect();
    const w = rect.width || 720;
    const h = rect.height || 480;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.render();
  }

  restoreMiniRenderer() {
    if (!this.container || !this.renderer) return;
    if (this.renderer.domElement.parentElement !== this.container) {
      this.container.appendChild(this.renderer.domElement);
    }
    this.camera.aspect = 1.0;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(220, 220);
    if (this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.updateMarkers(store.getState());
  }

  latLonToSphere(lat, lon, radius = 1.2) {
    const phi = (90 - lat) * (Math.PI / 180.0);
    const theta = (lon + 180) * (Math.PI / 180.0);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  rotateToCoordinate(lat, lon, animate = true) {
    const targetY = -((lon * Math.PI) / 180.0) + Math.PI / 2.0;
    const targetX = (lat * Math.PI) / 180.0;

    if (!animate) {
      this.currentRotation.x = targetX;
      this.currentRotation.y = targetY;
      this.applyRotation();
      return;
    }

    this.targetRotation = { x: targetX, y: targetY };
    this.easeStartTime = performance.now();
    this.isEasing = true;
  }

  applyRotation() {
    if (this.globeMesh) {
      this.globeMesh.rotation.x = this.currentRotation.x;
      this.globeMesh.rotation.y = this.currentRotation.y;
    }
  }

  updateEasing(now) {
    if (!this.isEasing) return;
    const elapsed = now - this.easeStartTime;
    const t = Math.min(1.0, elapsed / this.easeDuration);
    const easeOut = 1.0 - Math.pow(1.0 - t, 3.0);

    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * easeOut * 0.15;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * easeOut * 0.15;

    this.applyRotation();

    if (t >= 1.0) {
      this.isEasing = false;
      this.currentRotation.x = this.targetRotation.x;
      this.currentRotation.y = this.targetRotation.y;
      this.applyRotation();
    }
  }

  updateGlobePath(position, destination) {
    if (!this.globeMesh) return;
    if (this.globePathLine) {
      this.globeMesh.remove(this.globePathLine);
      if (this.globePathLine.geometry) this.globePathLine.geometry.dispose();
      this.globePathLine = null;
    }

    const destLat = destination.lat !== undefined ? destination.lat : destination.latitude;
    const destLon = destination.lon !== undefined ? destination.lon : destination.longitude;
    if (typeof destLat !== 'number' || typeof destLon !== 'number') return;

    // Build 3D great circle arc line on the globe surface
    const segments = 48;
    const pts = [];
    const p1 = this.latLonToSphere(position.lat, position.lon, 1.206);
    const p2 = this.latLonToSphere(destLat, destLon, 1.206);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = new THREE.Vector3().copy(p1).lerp(p2, t).normalize().multiplyScalar(1.206);
      pts.push(pt);
    }

    // Google Maps thick 3D navigation tube for true WebGL width
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeom = new THREE.TubeGeometry(curve, 48, 0.007, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x1a73e8, // Vibrant Google Maps blue
      depthWrite: false
    });

    this.globePathLine = new THREE.Mesh(tubeGeom, tubeMat);
    this.globeMesh.add(this.globePathLine);
  }

  updateMarkers(state) {
    const { position, destination } = state;
    if (!this.miniMarkerGroup) return;

    // Update 3D path line on the globe
    this.updateGlobePath(position, destination);

    const activeContainer = this.renderer.domElement.parentElement === this.container
      ? this.miniMarkerGroup
      : this.overlayMarkerGroup;

    if (!activeContainer) return;
    activeContainer.innerHTML = '';

    const youPos3D = this.latLonToSphere(position.lat, position.lon, 1.205);
    const destLat = destination.lat !== undefined ? destination.lat : destination.latitude;
    const destLon = destination.lon !== undefined ? destination.lon : destination.longitude;
    const destPos3D = this.latLonToSphere(destLat, destLon, 1.205);

    // Apply globe rotation to markers
    const rotEuler = new THREE.Euler(this.currentRotation.x, this.currentRotation.y, 0, 'XYZ');
    youPos3D.applyEuler(rotEuler);
    destPos3D.applyEuler(rotEuler);

    const isOverlay = activeContainer === this.overlayMarkerGroup;
    const w = this.renderer.domElement.clientWidth || (isOverlay ? 720 : 220);
    const h = this.renderer.domElement.clientHeight || (isOverlay ? 480 : 220);

    // You marker: Red pulsing beacon on globe
    if (youPos3D.z > -0.2) {
      const youScreen = this.toScreenPosition(youPos3D, w, h);
      const youEl = document.createElement('div');
      youEl.className = 'globe-beacon-you';
      youEl.style.left = `${youScreen.x.toFixed(1)}px`;
      youEl.style.top = `${youScreen.y.toFixed(1)}px`;
      youEl.innerHTML = `
        <div class="beacon-dot-you" style="background:#ff3333;box-shadow:0 0 10px #ff3333;"></div>
        <span class="beacon-label-you" style="background:rgba(20,8,8,0.85);border-color:#ff4444;color:#ffdddd;">You</span>
      `;
      activeContainer.appendChild(youEl);
    }

    // Destination Marker
    if (destPos3D.z > -0.2) {
      const destScreen = this.toScreenPosition(destPos3D, w, h);
      const youScreen = this.toScreenPosition(youPos3D, w, h);

      const dx = destScreen.x - youScreen.x;
      const dy = destScreen.y - youScreen.y;
      const screenDist = Math.sqrt(dx * dx + dy * dy);

      const destEl = document.createElement('div');
      destEl.className = 'globe-beacon-dest';

      const res = getLiveDistanceToDestination(position, destination);
      const distStr = res ? formatNavDistance(res.distance) : '--';

      if (screenDist < 48.0 && youPos3D.z > -0.2) {
        // Screen-space separation leader line
        const offsetAngle = Math.atan2(dy, dx) || 0.8;
        const offsetX = Math.cos(offsetAngle) * 32.0;
        const offsetY = Math.sin(offsetAngle) * 32.0;

        const posX = youScreen.x + offsetX;
        const posY = youScreen.y + offsetY;

        destEl.style.left = `${posX.toFixed(1)}px`;
        destEl.style.top = `${posY.toFixed(1)}px`;
        destEl.innerHTML = `
          <div class="leader-line" style="width: 32px; transform: rotate(${offsetAngle}rad);"></div>
          <div class="beacon-pin-dest"></div>
          <span class="beacon-label-dest" title="${destination.name}">${destination.name} (${distStr})</span>
        `;
      } else {
        destEl.style.left = `${destScreen.x.toFixed(1)}px`;
        destEl.style.top = `${destScreen.y.toFixed(1)}px`;
        destEl.innerHTML = `
          <div class="beacon-pin-dest"></div>
          <span class="beacon-label-dest" title="${destination.name}">${destination.name}</span>
        `;
      }
      activeContainer.appendChild(destEl);
    }

    // Dynamic Surrounding Places when zoomed in (Requirement 10)
    // When camera is zoomed in (position.z < 3.2), reveal surrounding features
    if (this.camera.position.z < 3.2 && this.nomenclatureData && this.nomenclatureData.length > 0) {
      const maxSurround = this.camera.position.z < 2.2 ? 10 : 5;
      let count = 0;

      for (const feat of this.nomenclatureData) {
        if (count >= maxSurround) break;
        // Check angular distance from astronaut position
        const dLat = feat.lat - position.lat;
        const dLon = feat.lon - position.lon;
        const angDist = Math.sqrt(dLat * dLat + dLon * dLon);

        if (angDist > 1.0 && angDist < 45.0) { // nearby but not directly under astronaut
          const fPos3D = this.latLonToSphere(feat.lat, feat.lon, 1.204);
          fPos3D.applyEuler(rotEuler);

          if (fPos3D.z > 0.05) { // Facing camera
            const fScreen = this.toScreenPosition(fPos3D, w, h);
            const fEl = document.createElement('div');
            fEl.className = 'globe-surround-place';
            fEl.style.position = 'absolute';
            fEl.style.left = `${fScreen.x.toFixed(1)}px`;
            fEl.style.top = `${fScreen.y.toFixed(1)}px`;
            fEl.style.pointerEvents = 'none';
            fEl.style.transform = 'translate(-50%, -100%)';
            fEl.style.display = 'flex';
            fEl.style.flexDirection = 'column';
            fEl.style.alignItems = 'center';
            fEl.style.gap = '2px';
            fEl.innerHTML = `
              <span style="font-family:'JetBrains Mono',monospace;font-size:9px;background:rgba(8,16,30,0.85);color:#70b0ff;border:1px solid #1c365d;padding:1px 4px;border-radius:3px;white-space:nowrap;">${feat.name}</span>
              <div style="width:4px;height:4px;background:#00d4ff;border-radius:50%;"></div>
            `;
            activeContainer.appendChild(fEl);
            count++;
          }
        }
      }
    }
  }

  toScreenPosition(vec3, width, height) {
    const proj = vec3.clone().project(this.camera);
    return {
      x: ((proj.x + 1) * width) / 2,
      y: ((-proj.y + 1) * height) / 2
    };
  }

  drawOverlayFlat() {
    if (!this.overlayFlatCanvas) return;
    const canvas = this.overlayFlatCanvas;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    canvas.width = (rect.width || 800) * window.devicePixelRatio;
    canvas.height = (rect.height || 480) * window.devicePixelRatio;

    ctx.save();
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    // Apply interactive zoom and pan
    ctx.translate(w / 2 + this.flatPan.x, h / 2 + this.flatPan.y);
    ctx.scale(this.flatZoom, this.flatZoom);
    ctx.translate(-w / 2, -h / 2);

    // Draw active background layer (Satellite, Terrain, Slope, MOLA)
    const activeImg = this.flatStyleImages && this.flatStyleImages[this.flatStyle];
    if (activeImg && activeImg.complete) {
      ctx.drawImage(activeImg, 0, 0, w, h);
    } else if (this.marsTexture && this.marsTexture.image) {
      ctx.drawImage(this.marsTexture.image, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#b85e33';
      ctx.fillRect(0, 0, w, h);
    }

    // 30-degree graticule
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#00e5ff';
    ctx.font = '11px "JetBrains Mono", monospace';

    // Latitudes
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      const latLabel = lat === 0 ? '0° EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
      ctx.fillText(latLabel, 12, y - 4);
    }

    // Longitudes
    for (let lon = 0; lon <= 360; lon += 30) {
      const x = (lon / 360) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      if (lon % 60 === 0 && lon < 360) {
        ctx.fillText(`${lon}°E`, x + 4, 18);
      }
    }

    // Nomenclature features with 2D Bounding-Box Collision Detection (max 25 prominent labels at global view)
    this.interactiveLabels = [];
    if (this.nomenclatureData && this.nomenclatureData.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';

      const majorKeywords = ['Olympus', 'Marineris', 'Hellas', 'Gale', 'Elysium', 'Vastitas', 'Alba', 'Tharsis', 'Isidis', 'Chryse', 'Curiosity', 'Perseverance', 'Jezero'];
      const candidates = this.nomenclatureData.filter(feat => {
        return majorKeywords.some(k => feat.name.includes(k)) || (feat.diameter_km && feat.diameter_km > 350);
      }).sort((a, b) => (b.diameter_km || 0) - (a.diameter_km || 0));

      const drawnBoxes = [];
      const maxLabels = 25;
      let labelCount = 0;

      for (const feat of candidates) {
        if (labelCount >= maxLabels) break;

        const px = ((feat.lon % 360) / 360) * w;
        const py = ((90 - feat.lat) / 180) * h;

        const textMetrics = ctx.measureText(feat.name);
        const textW = textMetrics.width;
        const box = {
          x: px - textW / 2 - 4,
          y: py - 16,
          w: textW + 8,
          h: 20
        };

        const collides = drawnBoxes.some(b => {
          return !(box.x + box.w < b.x || box.x > b.x + b.w || box.y + box.h < b.y || box.y > b.y + b.h);
        });

        if (!collides) {
          drawnBoxes.push(box);
          this.interactiveLabels.push({ ...box, feature: feat });

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.strokeText(feat.name, px, py - 4);
          ctx.fillText(feat.name, px, py - 4);

          ctx.fillStyle = '#ff7043';
          ctx.beginPath();
          ctx.arc(px, py, 3.0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';

          labelCount++;
        }
      }
    }

    // Destination & Route Path in Blue Lines (Requirement 9)
    const state = store.getState();
    const youX = ((state.position.lon % 360) / 360) * w;
    const youY = ((90 - state.position.lat) / 180) * h;

    const destLat = state.destination.lat !== undefined ? state.destination.lat : state.destination.latitude;
    const destLon = state.destination.lon !== undefined ? state.destination.lon : state.destination.longitude;

    if (typeof destLat === 'number' && typeof destLon === 'number') {
      const destX = ((destLon % 360) / 360) * w;
      const destY = ((90 - destLat) / 180) * h;

      // Draw Path in bright Google Maps blue
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(youX, youY);
      ctx.lineTo(destX, destY);
      ctx.stroke();

      // Destination pin marker
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.arc(destX, destY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(state.destination.name, destX + 10, destY + 4);
    }

    // Current Location Marker: Red Dot with white border
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(youX, youY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Subtle red outer pulse circle
    ctx.strokeStyle = 'rgba(255, 34, 34, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(youX, youY, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('You', youX + 18, youY + 4);

    ctx.restore();

    // Screen-space Legend Explainer for Depth and 3D Topography (NASA SVS 656)
    if (this.flatStyle === 'depth' || this.flatStyle === 'threed') {
      const legW = 460;
      const legH = 120;
      const legX = 14;
      const legY = h - legH - 14;

      ctx.save();
      ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
      ctx.strokeStyle = '#1c365d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(legX, legY, legW, legH, 6);
      else ctx.rect(legX, legY, legW, legH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const title = this.flatStyle === 'threed' ? 'MONS 3D / MOLA TOPOGRAPHIC ELEVATION' : 'CRATER DEPTH & ELEVATION (NASA SVS 656 MOLA)';
      ctx.fillText(title, legX + 14, legY + 20);

      // Gradient bar
      const grad = ctx.createLinearGradient(legX + 14, 0, legX + legW - 28, 0);
      grad.addColorStop(0.0, '#4a148c');
      grad.addColorStop(0.25, '#1976d2');
      grad.addColorStop(0.45, '#00acc1');
      grad.addColorStop(0.65, '#43a047');
      grad.addColorStop(0.85, '#fdd835');
      grad.addColorStop(1.0, '#d32f2f');
      ctx.fillStyle = grad;
      ctx.fillRect(legX + 14, legY + 28, legW - 28, 10);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.strokeRect(legX + 14, legY + 28, legW - 28, 10);

      // 4 Color chips explainers with large, legible typography
      ctx.font = 'bold 12px "JetBrains Mono", monospace';

      // Left Column
      ctx.fillStyle = '#7c4dff';
      ctx.fillRect(legX + 14, legY + 48, 12, 12);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('Purple: Floor (-8 to -4 km)', legX + 32, legY + 58);

      ctx.fillStyle = '#00acc1';
      ctx.fillRect(legX + 14, legY + 68, 12, 12);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('Cyan/Green: Lowlands (-4 to 0 km)', legX + 32, legY + 78);

      // Right Column
      ctx.fillStyle = '#fdd835';
      ctx.fillRect(legX + 250, legY + 48, 12, 12);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('Yellow: Rims (0 to +4 km)', legX + 268, legY + 58);

      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(legX + 250, legY + 68, 12, 12);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('Red: Peaks (> +4 km)', legX + 268, legY + 78);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('Datum: IAU 2000 Mars Mean Sphere (R: 3,396,190 m)', legX + 14, legY + 104);
      ctx.restore();
    } else if (this.flatStyle === 'slope') {
      const legW = 320;
      const legH = 76;
      const legX = 14;
      const legY = h - legH - 14;

      ctx.save();
      ctx.fillStyle = 'rgba(6, 12, 24, 0.90)';
      ctx.strokeStyle = '#1c365d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(legX, legY, legW, legH, 6);
      else ctx.rect(legX, legY, legW, legH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SURFACE SLOPE HAZARD (EVA SAFETY)', legX + 10, legY + 16);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(legX + 10, legY + 24, 8, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('<10° Safe & Walkable (1.4 m/s EVA Pace)', legX + 24, legY + 32);

      ctx.fillStyle = '#eab308';
      ctx.fillRect(legX + 10, legY + 38, 8, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('10°-15° Caution (Moderate grade on regolith)', legX + 24, legY + 46);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(legX + 10, legY + 52, 8, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('>15° Hazard (Exceeds EVA walking safety limit)', legX + 24, legY + 60);

      ctx.fillStyle = '#64748b';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('Horn Slope >= 5m baseline', legX + 10, legY + 70);
      ctx.restore();
    }
  }

  showFeatureCard(feat, clientX, clientY) {
    if (this.activeFeatureCard) {
      this.activeFeatureCard.remove();
      this.activeFeatureCard = null;
    }

    const card = document.createElement('div');
    card.className = 'feature-popup-card';
    card.style.position = 'absolute';
    card.style.left = `${Math.min(window.innerWidth - 240, Math.max(16, clientX - 100))}px`;
    card.style.top = `${Math.min(window.innerHeight - 180, Math.max(16, clientY + 12))}px`;
    card.style.zIndex = '500';
    card.innerHTML = `
      <div class="popup-title">${feat.name}</div>
      <div class="popup-type">${feat.type || 'Landmark'} · ${feat.diameter_km ? `${feat.diameter_km} km` : 'Geographic Feature'}</div>
      <div class="popup-coords">Lat: ${formatLatitudePlanetocentric(feat.lat)} | Lon: ${formatLongitudeEast(feat.lon)}</div>
      <div class="popup-desc">${feat.ethnicity || 'Approved IAU Martian nomenclature.'}</div>
      <button class="btn-pill btn-pill-primary popup-set-target" style="margin-top:8px; width:100%;">Set Destination</button>
      <button class="btn-pill popup-inspect-site" style="margin-top:4px; width:100%;">Inspect Site</button>
      <button class="popup-close-x" style="position:absolute;top:6px;right:6px;background:none;border:none;color:#8ba3c7;cursor:pointer;">&times;</button>
    `;

    card.querySelector('.popup-close-x').addEventListener('click', (e) => {
      e.stopPropagation();
      card.remove();
      this.activeFeatureCard = null;
    });

    const inspectBtn = card.querySelector('.popup-inspect-site');
    if (inspectBtn) {
      inspectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        card.remove();
        this.activeFeatureCard = null;
        if (window.__marsUI && window.__marsUI.openPlaceInspection) {
          window.__marsUI.openPlaceInspection(feat.id || feat.name);
        }
      });
    }

    card.querySelector('.popup-set-target').addEventListener('click', (e) => {
      e.stopPropagation();
      store.setState({
        destination: {
          id: `feat_${feat.name.toLowerCase().replace(/\\s+/g, '_')}`,
          name: feat.name,
          lat: feat.lat,
          latitude: feat.lat,
          lon: feat.lon,
          longitude: feat.lon,
          elevation_m: 0.0,
          walkable: false
        }
      });
      card.remove();
      this.activeFeatureCard = null;
    });

    this.overlayContainer.appendChild(card);
    this.activeFeatureCard = card;
  }

  setupEventListeners() {
    // Tap mini globe to expand overlay
    this.container.addEventListener('click', () => {
      const overlay = document.getElementById('globe-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        store.setState({ panelStates: { globeOverlayOpen: true } });
        this.setOverlayMode(this.isOverlayFlat ? 'flat' : 'globe');
        const pos = store.getState().position;
        this.rotateToCoordinate(pos.lat, pos.lon, true);
      }
    });

    // Close overlay button
    const btnClose = document.getElementById('btn-close-globe-overlay');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        const overlay = document.getElementById('globe-overlay');
        if (overlay) overlay.classList.add('hidden');
        store.setState({ panelStates: { globeOverlayOpen: false } });
        if (this.activeFeatureCard) {
          this.activeFeatureCard.remove();
          this.activeFeatureCard = null;
        }
        this.restoreMiniRenderer();
      });
    }

    // Escape key listener for globe overlay
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && store.getState().panelStates?.globeOverlayOpen) {
        const overlay = document.getElementById('globe-overlay');
        if (overlay) overlay.classList.add('hidden');
        store.setState({ panelStates: { globeOverlayOpen: false } });
        if (this.activeFeatureCard) {
          this.activeFeatureCard.remove();
          this.activeFeatureCard = null;
        }
        this.restoreMiniRenderer();
      }
    });

    // Globe | Flat toggle buttons
    const btnGlobe = document.getElementById('btn-overlay-globe');
    const btnFlat = document.getElementById('btn-overlay-flat');

    if (btnGlobe && btnFlat) {
      btnGlobe.addEventListener('click', () => {
        btnGlobe.classList.add('active');
        btnFlat.classList.remove('active');
        this.setOverlayMode('globe');
      });

      btnFlat.addEventListener('click', () => {
        btnFlat.classList.add('active');
        btnGlobe.classList.remove('active');
        this.setOverlayMode('flat');
      });
    }

    // Flat Map Style Buttons (Satellite, Terrain, Slope, MOLA)
    document.querySelectorAll('[data-flat-style]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-flat-style]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const style = e.currentTarget.dataset.flatStyle;
        this.setFlatStyle(style);
      });
    });

    // Pan and Zoom on Flat Map Canvas
    if (this.overlayFlatCanvas) {
      let isFlatDragging = false;
      let flatStart = { x: 0, y: 0 };

      this.overlayFlatCanvas.addEventListener('pointerdown', (e) => {
        isFlatDragging = true;
        flatStart = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('pointermove', (e) => {
        if (!isFlatDragging || !this.isOverlayFlat) return;
        const dx = e.clientX - flatStart.x;
        const dy = e.clientY - flatStart.y;
        flatStart = { x: e.clientX, y: e.clientY };
        this.flatPan.x += dx;
        this.flatPan.y += dy;
        this.drawOverlayFlat();
      });

      window.addEventListener('pointerup', () => {
        isFlatDragging = false;
      });

      this.overlayFlatCanvas.addEventListener('wheel', (e) => {
        if (!this.isOverlayFlat) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        this.flatZoom = Math.max(0.6, Math.min(8.0, this.flatZoom * factor));
        this.drawOverlayFlat();
      }, { passive: false });
    }

    // Click handler on flat canvas for feature cards
    if (this.overlayFlatCanvas) {
      this.overlayFlatCanvas.addEventListener('click', (e) => {
        if (Math.abs(this.flatPan.x) > 5 || Math.abs(this.flatPan.y) > 5) return;
        const rect = this.overlayFlatCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const hit = this.interactiveLabels.find(l => {
          return clickX >= l.x && clickX <= l.x + l.w && clickY >= l.y && clickY <= l.y + l.h;
        });

        if (hit) {
          this.showFeatureCard(hit.feature, e.clientX, e.clientY);
        } else if (this.activeFeatureCard) {
          this.activeFeatureCard.remove();
          this.activeFeatureCard = null;
        }
      });
    }

    // Drag to rotate globe
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.previousPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.previousPointer.x;
      const deltaY = e.clientY - this.previousPointer.y;
      this.previousPointer = { x: e.clientX, y: e.clientY };

      this.currentRotation.y += deltaX * 0.008;
      this.currentRotation.x = Math.max(-1.4, Math.min(1.4, this.currentRotation.x + deltaY * 0.008));
      this.applyRotation();
      this.updateMarkers(store.getState());
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Mouse Wheel & Trackpad Pinch Zoom (Requirement 1 & 10)
    const onWheelZoom = (e) => {
      e.preventDefault();
      // On trackpad pinch, e.ctrlKey is true, and deltaY is small
      const zoomFactor = e.ctrlKey ? 0.04 : 0.0035;
      const zoomDelta = e.deltaY * zoomFactor;
      this.camera.position.z = Math.max(1.4, Math.min(6.0, this.camera.position.z + zoomDelta));
      this.render();
      this.updateMarkers(store.getState());
    };

    this.renderer.domElement.addEventListener('wheel', onWheelZoom, { passive: false });
    this.container.addEventListener('wheel', onWheelZoom, { passive: false });
    if (this.overlayCanvasContainer) {
      this.overlayCanvasContainer.addEventListener('wheel', onWheelZoom, { passive: false });
    }

    // Touch pinch-to-zoom for tablets
    let initialPinchDist = null;
    let initialZoomZ = this.camera.position.z;

    this.renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.sqrt(dx * dx + dy * dy);
        initialZoomZ = this.camera.position.z;
      }
    }, { passive: true });

    this.renderer.domElement.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialPinchDist) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = initialPinchDist / Math.max(10, dist);
        this.camera.position.z = Math.max(1.4, Math.min(6.0, initialZoomZ * scale));
        this.render();
        this.updateMarkers(store.getState());
      }
    }, { passive: true });

    this.renderer.domElement.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
      }
    }, { passive: true });
  }

  onStateChange(state, prevState) {
    // If overlay was closed, immediately restore mini renderer
    if (prevState?.panelStates?.globeOverlayOpen && !state?.panelStates?.globeOverlayOpen) {
      this.restoreMiniRenderer();
    }

    if (
      state.position.lat !== prevState.position.lat ||
      state.position.lon !== prevState.position.lon ||
      state.destination.lat !== prevState.destination.lat ||
      state.destination.lon !== prevState.destination.lon ||
      state.destination.name !== prevState.destination.name
    ) {
      this.updateMarkers(state);
      if (
        state.destination &&
        state.destination.lat !== undefined &&
        (state.destination.lat !== prevState?.destination?.lat || state.destination.lon !== prevState?.destination?.lon)
      ) {
        const midLat = (state.position.lat + state.destination.lat) / 2.0;
        let midLon = (state.position.lon + state.destination.lon) / 2.0;
        if (Math.abs(state.position.lon - state.destination.lon) > 180) {
          midLon = (midLon + 180) % 360;
        }
        this.rotateToCoordinate(midLat, midLon, true);
      }
      if (this.isOverlayFlat) {
        this.drawOverlayFlat();
      }
    }
  }

  render(now = performance.now()) {
    this.updateEasing(now);
    const isOverlayOpen = store.getState().panelStates?.globeOverlayOpen;
    // Only skip 3D rendering if the full overlay is open AND currently set to Flat map mode
    if (isOverlayOpen && this.isOverlayFlat) {
      return;
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
      this.updateMarkers(store.getState());
    }
  }
}
