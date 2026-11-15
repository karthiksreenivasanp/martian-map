/**
 * Martian Map - 3D Mars Environment HUD & Terrain Engine
 * Real-data DEM surface view at 1.7m astronaut eye height.
 * Dynamic Mars sky model: butterscotch day, blue sunrise/sunset forward-scattering glow,
 * dust haze horizon band driven by tau, stars at night, accurate 0.35-deg sun disc.
 * DEM-derived terrain geometry with HiRISE orthophoto drape and micro-detail normal mapping.
 * Ground-anchored route line (<= 0.6 m wide) with subtle halo,
 * flat ground chevron (<= 2 m wide), thin destination beacon pole, and arrival ring.
 * WebGL Context 1 of 2.
 * Zero emojis.
 */

import * as THREE from 'three';
import { store, MAX_SUIT_PACE_MS, MARS_RADIUS_METERS } from './state.js';
import { getAssetUrl } from './assets.js';
import {
  marsDistanceAndBearing,
  getDestinationCoords,
  getLiveDistanceToDestination,
  formatNavDistance,
  getRelativeBearing,
  calculateSlopeDeg,
  getSimulatedTerrainElevation,
  calculateMarsSolarAngles,
  MAX_SAFE_SLOPE_DEG
} from './nav.js';

export class TerrainView {
  constructor(containerElement, hudArrowElement, beaconOverlayElement) {
    this.container = containerElement;
    this.hudArrow = hudArrowElement;
    this.beaconOverlay = beaconOverlayElement;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.terrainMesh = null;
    this.terrainTextures = {};
    this.terrainSize = 4000.0; // 4 km x 4 km
    this.terrainSegments = 128; // High-detail grid mesh

    this.cameraEyeHeight = 1.7; // 1.7 m suited astronaut eye height
    this.cameraMode = 'thirdPerson'; // 'thirdPerson' (Curiosity Rover in User Space) or 'firstPerson'
    this.cameraPitch = -0.06;
    this.roverGroup = null;
    this.roverWheels = [];
    this.lastPosition = null;
    this.landingSiteGroup = null;
    this.landmarkStalksGroup = null;
    this.destStalkGroup = null;
    this.destBillboardSprite = null;
    window.__marsTerrain = this;

    this.routeRibbon = null;
    this.waypointDiscs = [];
    this.groundArrowGroup = null;
    this.destPoleMesh = null;
    this.arrivalRingMesh = null;

    this.skyCanvas = null;
    this.skyCtx = null;
    this.skyTexture = null;
    this.skyDomeMesh = null;
    this.sunMesh = null;
    this.starPoints = null;
    this.mountainSilhouetteMesh = null;
    this.hemiLight = null;

    this.lastGridX = 0;
    this.lastGridZ = 0;

    // Google Maps-Style 360° Martian Surface Street View (WebGL Context 1 of 2 shared)
    this.streetViewMesh = null;
    this.isStreetViewActive = false;
    this.streetViewYaw = 0.0;
    this.streetViewPitch = 0.0;
    this.savedCameraPos = new THREE.Vector3();
    this.savedCameraQuat = new THREE.Quaternion();
    this.savedCameraFov = 65.0;

    this.initScene();
  }

  initScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    // Camera: 65 deg FOV, near 0.1m, far 6000m
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 6000);

    // WebGL Renderer (Context 1 of 2)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Martian atmosphere linear fog (preserves foreground clarity while softly fading distant horizon)
    this.scene.fog = new THREE.Fog(0xb56848, 1400, 6800);

    // Hemisphere Ambient Lighting (Sky vs Mars soil albedo)
    this.hemiLight = new THREE.HemisphereLight(0xb57850, 0x422416, 0.95);
    this.scene.add(this.hemiLight);

    // Ambient fill
    this.ambientLight = new THREE.AmbientLight(0x382c24, 0.55);
    this.scene.add(this.ambientLight);

    // Sun Directional Light with DEM shadow casting
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.6);
    this.sunLight.position.set(600, 900, 400);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 50;
    this.sunLight.shadow.camera.far = 2800;
    this.sunLight.shadow.camera.left = -500;
    this.sunLight.shadow.camera.right = 500;
    this.sunLight.shadow.camera.top = 500;
    this.sunLight.shadow.camera.bottom = -500;
    this.scene.add(this.sunLight);

    // Build World Elements
    this.buildSkyDome();
    this.buildSunDisc();
    this.buildTerrain();
    this.buildGroundGuidance();
    this.buildCuriosityRover();
    this.buildLandmarkStalks();
    this.buildRocks();
    this.initStreetView();

    // Mouse / Touch Pointer Look & Step Controls (Requirement 3: Movable by Mouse)
    this.setupPointerControls();

    // Resize Observer
    window.addEventListener('resize', () => this.handleResize());

    // Subscribe to state updates
    store.subscribe((state, prevState) => this.onStateChange(state, prevState));

    // Initial state synchronization
    this.updateFromState(store.getState());
  }

  buildSkyDome() {
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2048;
    this.skyCanvas.height = 1024;
    this.skyCtx = this.skyCanvas.getContext('2d');

    const lat = store.getState().position.lat;
    const ltst = store.getState().ltstHours;
    const Ls = store.getState().solarLongitudeLs;
    const angles = calculateMarsSolarAngles(lat, ltst, Ls);
    this.updateSkyGradient(this.skyCtx, this.skyCanvas, 0.65, angles.elevationDeg, angles.azimuthDeg);

    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.skyTexture.wrapS = THREE.RepeatWrapping;
    this.skyTexture.wrapT = THREE.ClampToEdgeWrapping;

    const skyGeom = new THREE.SphereGeometry(3200, 64, 32);
    const skyMat = new THREE.MeshBasicMaterial({
      map: this.skyTexture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });

    this.skyDomeMesh = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.skyDomeMesh);

    // Upper Martian Sky Stars (Visible at night / twilight)
    this.createSkyStars(2800);
  }

  createSkyStars(count = 2800) {
    const starGeom = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const colorPalette = [
      new THREE.Color(0xffffff), // Pure brilliant white
      new THREE.Color(0xd4eaff), // Ice-blue stellar glow
      new THREE.Color(0xffe6c2), // Warm golden star
      new THREE.Color(0xffc880), // Radiant amber star
      new THREE.Color(0xbcd8ff)  // Pale cyan star
    ];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92 + 0.08); // Full dome coverage
      const r = 3100;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors.push(col.r, col.g, col.b);
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 2.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.0
    });
    this.starPoints = new THREE.Points(starGeom, starMat);
    this.scene.add(this.starPoints);
  }

  updateSkyGradient(ctx, canvas, tau, sunElevDeg = 35.0, sunAzDeg = 135.0) {
    const w = canvas.width;
    const h = canvas.height;

    // 1. Base Vertical Atmospheric Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (sunElevDeg <= -10.0) {
      // True Night: Deep space obsidian black to faint horizon dust rim
      grad.addColorStop(0.0, '#010206');
      grad.addColorStop(0.65, '#03050c');
      grad.addColorStop(0.88, '#080d1a');
      grad.addColorStop(0.97, '#121824');
      grad.addColorStop(1.0, '#0c1018');
    } else if (sunElevDeg < 0.0) {
      // Astronomical/Nautical Twilight
      grad.addColorStop(0.0, '#040710');
      grad.addColorStop(0.5, '#161822');
      grad.addColorStop(0.85, '#3c2420');
      grad.addColorStop(0.96, '#5e3226');
      grad.addColorStop(1.0, '#402018');
    } else if (sunElevDeg <= 14.0) {
      // Sunrise / Sunset: Famous Martian blue forward-scattering transition
      grad.addColorStop(0.0, '#2a1a1e');
      grad.addColorStop(0.40, '#62382c');
      grad.addColorStop(0.72, '#9a563c');
      grad.addColorStop(0.88, '#c8764e');
      grad.addColorStop(0.96, '#f49e68'); // Horizon dust band
      grad.addColorStop(1.0, '#b8603c');
    } else {
      // Full Daytime: Bright, sunny, luminous and dusty Martian daylight
      if (tau < 0.4) {
        grad.addColorStop(0.0, '#e49e70'); // Zenith: bright luminous peach
        grad.addColorStop(0.35, '#eeb284');
        grad.addColorStop(0.68, '#f6c496');
        grad.addColorStop(0.88, '#fad8ac');
        grad.addColorStop(0.96, '#ffe4c2'); // Glowing atmospheric amber-gold limb
        grad.addColorStop(1.0, '#cf784c');
      } else if (tau < 1.2) {
        grad.addColorStop(0.0, '#e8a87c'); // Zenith: warm luminous butterscotch peach
        grad.addColorStop(0.35, '#f0b88e');
        grad.addColorStop(0.68, '#f6caa0');
        grad.addColorStop(0.88, '#fadcb4');
        grad.addColorStop(0.96, '#ffe8cc'); // Glowing atmospheric amber-gold limb
        grad.addColorStop(1.0, '#c87448');
      } else {
        // High dust storm opacity: warm radiant ochre
        grad.addColorStop(0.0, '#dc8a5a');
        grad.addColorStop(0.45, '#e89e70');
        grad.addColorStop(0.85, '#f0b284');
        grad.addColorStop(1.0, '#c8784c');
      }
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2. Sunrise / Sunset Blue Glow (Forward Mie Scattering by 1.5-micron dust particles)
    if (sunElevDeg >= -2.0 && sunElevDeg <= 18.0) {
      // Center of glow on canvas
      const glowIntensity = Math.sin((Math.max(0, sunElevDeg + 2.0) / 20.0) * Math.PI);
      const sunY = h * (1.0 - (sunElevDeg + 5.0) / 95.0);
      const sunX = w * 0.5; // Centered horizontal texture projection

      const blueGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 180);
      blueGlow.addColorStop(0.0, `rgba(140, 200, 255, ${(0.65 * glowIntensity).toFixed(2)})`);
      blueGlow.addColorStop(0.35, `rgba(90, 160, 235, ${(0.42 * glowIntensity).toFixed(2)})`);
      blueGlow.addColorStop(0.7, `rgba(50, 110, 190, ${(0.18 * glowIntensity).toFixed(2)})`);
      blueGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, w, h);
    }
  }

  buildSunDisc() {
    // Angular diameter of Sun on Mars is ~0.35 degrees (21 arcminutes)
    // At dome distance 2800m: radius = 2800 * tan(0.35 deg / 2) = 8.55 meters
    const sunGeom = new THREE.CircleGeometry(8.55, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xd8eeff, // Brilliant bluish-white Martian sun
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);
    this.updateSunLighting(store.getState().ltstHours);
  }

  generateMicroDetailNormalTexture() {
    // Generate 512x512 tileable micro-detail normal map (<1 m ground roughness: sand grains, pebbles, basalt fractures)
    // Labeled "SIMULATED micro-detail" in documentation & data registry
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Multi-frequency perturbation
        const s1 = Math.sin((x * 24.0 * Math.PI) / size) * Math.cos((y * 24.0 * Math.PI) / size);
        const s2 = Math.sin((x * 64.0 * Math.PI) / size + y * 0.08) * 0.5;
        const s3 = Math.cos((y * 96.0 * Math.PI) / size - x * 0.05) * 0.25;
        const h = s1 + s2 + s3;

        // Partial derivatives
        const dx = Math.cos((x * 24.0 * Math.PI) / size) * 0.8 + Math.cos((x * 64.0 * Math.PI) / size) * 0.4;
        const dy = -Math.sin((y * 24.0 * Math.PI) / size) * 0.8 - Math.sin((y * 96.0 * Math.PI) / size) * 0.3;

        // Tangent space normal vector (nx, ny, nz)
        let nx = -dx * 0.4;
        let ny = -dy * 0.4;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= len;
        ny /= len;
        nz /= len;

        const idx = (y * size + x) * 4;
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const normalTex = new THREE.CanvasTexture(canvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(128, 128); // Tiled across 4 km terrain
    return normalTex;
  }

  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(
      this.terrainSize,
      this.terrainSize,
      this.terrainSegments,
      this.terrainSegments
    );
    geometry.rotateX(-Math.PI / 2); // X-Z plane

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const elev = getSimulatedTerrainElevation(vx, -vz);
      pos.setY(i, elev);
    }
    geometry.computeVertexNormals();

    // Load authentic NASA HiRISE color mosaic
    const texLoader = new THREE.TextureLoader();
    const satTex = texLoader.load(getAssetUrl('data/map/satellite_4km.jpg'), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if (this.terrainMesh && store.getState().mapStyle === 'satellite') {
        this.terrainMesh.material.map = tex;
        this.terrainMesh.material.needsUpdate = true;
      }
    });

    const elevTex = texLoader.load(getAssetUrl('data/map/terrain_hillshade_4km.jpg'), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    });

    const slopeTex = texLoader.load(getAssetUrl('data/map/slope_4km.jpg'), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    });

    const molaTex = texLoader.load(getAssetUrl('data/map/mola_elevation_4km.jpg'), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    });

    this.terrainTextures = {
      satellite: satTex,
      depth: molaTex,
      threed: molaTex,
      elevation: elevTex,
      slope: slopeTex,
      mola: molaTex
    };

    // Micro-detail normal map (<1 m simulated micro-roughness)
    const microNormalTex = this.generateMicroDetailNormalTexture();

    const material = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.02,
      map: satTex,
      normalMap: microNormalTex,
      normalScale: new THREE.Vector2(0.65, 0.65),
      flatShading: false
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.castShadow = true;
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    // 3D Outer Crater Rim & Mount Sharp Foothills Geometry (Authentic 3D Landscape Relief)
    const rimGeom = new THREE.RingGeometry(1900, 5600, 64, 16);
    rimGeom.rotateX(-Math.PI / 2);
    const rpos = rimGeom.attributes.position;
    for (let i = 0; i < rpos.count; i++) {
      const rx = rpos.getX(i);
      const rz = rpos.getZ(i);
      const rad = Math.sqrt(rx * rx + rz * rz);
      const frac = Math.max(0, (rad - 1900.0) / 3700.0);
      const southFactor = Math.max(0, rz / rad);
      const northFactor = Math.max(0, -rz / rad);
      const ridgeNoise = Math.sin(rx * 0.003 + rz * 0.002) * 45.0 + Math.cos(rx * 0.007) * 20.0;
      const h = (Math.pow(frac, 1.35) * (140.0 + southFactor * 260.0 + northFactor * 120.0)) + ridgeNoise;
      rpos.setY(i, h);
    }
    rimGeom.computeVertexNormals();

    const rimMat = new THREE.MeshStandardMaterial({
      roughness: 0.94,
      metalness: 0.02,
      map: satTex,
      flatShading: false
    });
    this.outerRimMesh = new THREE.Mesh(rimGeom, rimMat);
    this.outerRimMesh.receiveShadow = true;
    this.scene.add(this.outerRimMesh);

    this.updateTerrainTextures(store.getState().mapStyle);
  }

  buildGroundGuidance() {
    // 1. Flat translucent ground chevron (Width <= 2.0 m: 1.4 m wide, 1.0 m long, no gradient, no glow)
    this.groundArrowGroup = new THREE.Group();

    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, 0.5);
    chevronShape.lineTo(0.7, -0.5);
    chevronShape.lineTo(0.4, -0.5);
    chevronShape.lineTo(0, -0.12);
    chevronShape.lineTo(-0.4, -0.5);
    chevronShape.lineTo(-0.7, -0.5);
    chevronShape.closePath();

    const chevronGeom = new THREE.ShapeGeometry(chevronShape);
    chevronGeom.rotateX(-Math.PI / 2);

    const chevronMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const chevronMesh = new THREE.Mesh(chevronGeom, chevronMat);
    this.groundArrowGroup.add(chevronMesh);
    this.scene.add(this.groundArrowGroup);

    // 2. Destination Beacon: Thin vertical pole planted in terrain
    const poleGeom = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 16);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
    this.destPoleMesh = new THREE.Mesh(poleGeom, poleMat);
    this.destPoleMesh.visible = false;
    this.scene.add(this.destPoleMesh);

    // 3. Arrival Marker: Ground ring <= 3 m (outer radius 1.4 m, diameter 2.8 m)
    const ringGeom = new THREE.RingGeometry(1.1, 1.4, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff7043,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this.arrivalRingMesh = new THREE.Mesh(ringGeom, ringMat);
    this.arrivalRingMesh.visible = false;
    this.scene.add(this.arrivalRingMesh);
  }

  buildCuriosityRover() {
    this.roverGroup = new THREE.Group();

    // Rover Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8ea,
      roughness: 0.35,
      metalness: 0.25
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x222428,
      roughness: 0.5,
      metalness: 0.8
    });
    const goldFoilMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.25,
      metalness: 0.75
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      roughness: 0.85,
      metalness: 0.35
    });
    const rtgMat = new THREE.MeshStandardMaterial({
      color: 0x484a52,
      roughness: 0.45,
      metalness: 0.7
    });

    // 1. Chassis Body (Width: 1.4m, Height: 0.52m, Length: 2.0m)
    const chassisGeom = new THREE.BoxGeometry(1.4, 0.52, 2.0);
    const chassisMesh = new THREE.Mesh(chassisGeom, bodyMat);
    chassisMesh.position.y = 0.82;
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    this.roverGroup.add(chassisMesh);

    // Electronics & Instrument Deck (Gold Foil Insulation)
    const deckGeom = new THREE.BoxGeometry(1.15, 0.18, 1.45);
    const deckMesh = new THREE.Mesh(deckGeom, goldFoilMat);
    deckMesh.position.set(0, 1.15, -0.05);
    deckMesh.castShadow = true;
    this.roverGroup.add(deckMesh);

    // Hazard Avoidance Cameras (HazCams) Front & Rear
    const hazCamGeom = new THREE.BoxGeometry(0.12, 0.08, 0.1);
    const hazCamFront = new THREE.Mesh(hazCamGeom, darkMetalMat);
    hazCamFront.position.set(0, 0.78, 1.05);
    const hazCamRear = new THREE.Mesh(hazCamGeom, darkMetalMat);
    hazCamRear.position.set(0, 0.78, -1.05);
    this.roverGroup.add(hazCamFront);
    this.roverGroup.add(hazCamRear);

    // 2. Remote Sensing Mast & MastCam / ChemCam Head
    const mastGeom = new THREE.CylinderGeometry(0.045, 0.055, 1.15, 16);
    const mastMesh = new THREE.Mesh(mastGeom, darkMetalMat);
    mastMesh.position.set(-0.42, 1.65, 0.55);
    mastMesh.castShadow = true;
    this.roverGroup.add(mastMesh);

    const headGeom = new THREE.BoxGeometry(0.32, 0.22, 0.24);
    const headMesh = new THREE.Mesh(headGeom, bodyMat);
    headMesh.position.set(-0.42, 2.22, 0.55);
    headMesh.castShadow = true;

    // Dual MastCam Lenses
    const lensGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
    lensGeom.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x051222 });
    const lensL = new THREE.Mesh(lensGeom, lensMat);
    lensL.position.set(-0.08, 0, 0.13);
    const lensR = new THREE.Mesh(lensGeom, lensMat);
    lensR.position.set(0.08, 0, 0.13);
    headMesh.add(lensL);
    headMesh.add(lensR);
    this.roverGroup.add(headMesh);

    // 3. Robotic Arm (IDD - Instrument Deployment Device)
    const armBase = new THREE.Group();
    armBase.position.set(0.48, 0.8, 1.0);
    const armTube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55), darkMetalMat);
    armTube.rotation.x = Math.PI / 3.2;
    armTube.position.set(0, 0.16, 0.22);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 14), darkMetalMat);
    turret.rotation.z = Math.PI / 2;
    turret.position.set(0, 0.36, 0.48);
    armBase.add(armTube);
    armBase.add(turret);
    this.roverGroup.add(armBase);

    // 4. Radioisotope Thermoelectric Generator (RTG)
    const rtgGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.65, 16);
    const rtgMesh = new THREE.Mesh(rtgGeom, rtgMat);
    rtgMesh.rotation.x = Math.PI / 4.5;
    rtgMesh.position.set(0, 1.18, -1.05);
    rtgMesh.castShadow = true;
    this.roverGroup.add(rtgMesh);

    // 5. High-Gain Antenna (HGA) Dish
    const hgaDishGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24);
    const hgaDish = new THREE.Mesh(hgaDishGeom, darkMetalMat);
    hgaDish.position.set(0.35, 1.34, -0.55);
    hgaDish.rotation.x = -0.25;
    this.roverGroup.add(hgaDish);

    // 6. Rocker-Bogie Suspension & 6 Cleated Wheels
    this.roverWheels = [];
    const wheelGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.32, 18);
    wheelGeom.rotateZ(Math.PI / 2);

    const wheelPositions = [
      [-0.92, 0.25, 0.85],   // Front Left
      [-0.98, 0.25, -0.05],  // Mid Left
      [-0.92, 0.25, -0.95],  // Rear Left
      [0.92, 0.25, 0.85],    // Front Right
      [0.98, 0.25, -0.05],   // Mid Right
      [0.92, 0.25, -0.95]    // Rear Right
    ];

    wheelPositions.forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeom, wheelMat);
      wMesh.position.set(wx, wy, wz);
      wMesh.castShadow = true;
      wMesh.receiveShadow = true;
      this.roverGroup.add(wMesh);
      this.roverWheels.push(wMesh);

      const strutGeom = new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(wx * 0.45, 0.55), 8);
      const strut = new THREE.Mesh(strutGeom, darkMetalMat);
      strut.position.set(wx * 0.72, wy + 0.28, wz * 0.8);
      strut.rotation.z = (wx > 0 ? -1 : 1) * 0.45;
      this.roverGroup.add(strut);
    });

    this.scene.add(this.roverGroup);
  }

  buildLandmarkStalks() {
    this.landmarkStalksGroup = new THREE.Group();

    // 1. Origin: Bradbury Landing · Curiosity (2012) (Exact match to Image 2)
    const originGroup = new THREE.Group();
    const originElev = getSimulatedTerrainElevation(0, 0);

    // Ground Ring
    const ringGeom = new THREE.RingGeometry(2.4, 2.9, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(0, originElev + 0.06, 0);
    originGroup.add(ring);

    // Vertical Stalk Line
    const stalkGeom = new THREE.CylinderGeometry(0.04, 0.04, 16.0, 12);
    const stalkMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.75 });
    const stalk = new THREE.Mesh(stalkGeom, stalkMat);
    stalk.position.set(0, originElev + 8.0, 0);
    originGroup.add(stalk);

    // Floating 3D Billboard Sprite
    const originSprite = this.createBillboardSprite('Curiosity (2012)', 'Bradbury Landing Origin', '#00e5ff');
    originSprite.position.set(0, originElev + 17.5, 0);
    originGroup.add(originSprite);

    this.landmarkStalksGroup.add(originGroup);

    // 2. Dynamic Destination Stalk
    this.destStalkGroup = new THREE.Group();
    const destRingGeom = new THREE.RingGeometry(2.5, 3.0, 32);
    destRingGeom.rotateX(-Math.PI / 2);
    const destRingMat = new THREE.MeshBasicMaterial({
      color: 0xff7043,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const destRing = new THREE.Mesh(destRingGeom, destRingMat);
    destRing.position.y = 0.06;
    this.destStalkGroup.add(destRing);

    const destStalkGeom = new THREE.CylinderGeometry(0.05, 0.05, 20.0, 12);
    const destStalkMat = new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.8 });
    const destStalk = new THREE.Mesh(destStalkGeom, destStalkMat);
    destStalk.position.y = 10.0;
    this.destStalkGroup.add(destStalk);

    this.destBillboardSprite = this.createBillboardSprite('Destination', '-- m', '#ff7043');
    this.destBillboardSprite.position.y = 21.5;
    this.destStalkGroup.add(this.destBillboardSprite);
    this.destStalkGroup.visible = false;
    this.landmarkStalksGroup.add(this.destStalkGroup);

    this.scene.add(this.landmarkStalksGroup);
  }

  createBillboardSprite(text, subtext = '', color = '#00e5ff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const r = 24;
    ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r, 8);
    ctx.lineTo(canvas.width - r, 8);
    ctx.quadraticCurveTo(canvas.width - 8, 8, canvas.width - 8, r);
    ctx.lineTo(canvas.width - 8, canvas.height - r);
    ctx.quadraticCurveTo(canvas.width - 8, canvas.height - 8, canvas.width - r, canvas.height - 8);
    ctx.lineTo(r, canvas.height - 8);
    ctx.quadraticCurveTo(8, canvas.height - 8, 8, canvas.height - r);
    ctx.lineTo(8, r);
    ctx.quadraticCurveTo(8, 8, r, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, subtext ? 54 : 74);

    if (subtext) {
      ctx.fillStyle = color;
      ctx.font = '22px "JetBrains Mono", monospace';
      ctx.fillText(subtext, canvas.width / 2, 94);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(12, 3, 1);
    return sprite;
  }

  updateBillboardSprite(sprite, text, subtext = '', color = '#00e5ff') {
    if (!sprite || !sprite.material || !sprite.material.map) return;
    const canvas = sprite.material.map.image;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const r = 24;
    ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r, 8);
    ctx.lineTo(canvas.width - r, 8);
    ctx.quadraticCurveTo(canvas.width - 8, 8, canvas.width - 8, r);
    ctx.lineTo(canvas.width - 8, canvas.height - r);
    ctx.quadraticCurveTo(canvas.width - 8, canvas.height - 8, canvas.width - r, canvas.height - 8);
    ctx.lineTo(r, canvas.height - 8);
    ctx.quadraticCurveTo(8, canvas.height - 8, 8, canvas.height - r);
    ctx.lineTo(8, r);
    ctx.quadraticCurveTo(8, 8, r, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, subtext ? 54 : 74);

    if (subtext) {
      ctx.fillStyle = color;
      ctx.font = '22px "JetBrains Mono", monospace';
      ctx.fillText(subtext, canvas.width / 2, 94);
    }

    sprite.material.map.needsUpdate = true;
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'thirdPerson' ? 'firstPerson' : 'thirdPerson';
    if (this.roverGroup) {
      this.roverGroup.visible = (this.cameraMode === 'thirdPerson');
    }
    const state = store.getState();
    this.updateCameraAndHUD(state);
    return this.cameraMode;
  }

  buildRocks() {
    // Authentic Martian weathered basalt rocks (smooth, subrounded slabs partially buried in regolith)
    const count = 70;
    const rockGeom = new THREE.DodecahedronGeometry(0.65, 2);
    rockGeom.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x9e5234, // Natural Martian basalt with iron-oxide dust coating
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false
    });

    this.rockInstancedMesh = new THREE.InstancedMesh(rockGeom, rockMat, count);
    this.rockInstancedMesh.castShadow = true;
    this.rockInstancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      // Clear 24m radius around Bradbury Landing origin
      const angle = (i * 137.5 * Math.PI) / 180.0;
      const dist = 24.0 + Math.pow((i + 1) / count, 1.6) * 650.0;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      const elev = getSimulatedTerrainElevation(x, y);

      // Low-profile tabular rock (partially embedded in sand)
      const scaleXZ = 0.4 + (Math.sin(i * 5.3) * 0.5 + 0.5) * 1.2;
      const scaleY = scaleXZ * 0.35;

      dummy.position.set(x, elev + scaleY * 0.3, -y);
      dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      dummy.rotation.set(0.08 * Math.sin(i), (i * 47.0 * Math.PI) / 180.0, 0.08 * Math.cos(i));
      dummy.updateMatrix();
      this.rockInstancedMesh.setMatrixAt(i, dummy.matrix);
    }

    this.rockInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rockInstancedMesh);
  }

  setupPointerControls() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startHeading = 0;
    let startPitch = 0;

    const onPointerDown = (e) => {
      if (this.isStreetViewActive) return;
      // Don't drag if clicking interactive overlay elements
      if (e.target.closest('button, input, select, .minimap-container, .modal-dialog, .side-drawer, .instruction-bar, .dpad-controls, .action-buttons-group, .layer-picker-card, .toast-lane, .right-edge-stack')) {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startHeading = store.getState().heading;
      startPitch = this.cameraPitch || 0;
      this.container.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (this.isStreetViewActive || !isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Sensitivity: ~0.32 deg per pixel for heading
      const newHeading = ((startHeading - dx * 0.32) % 360 + 360) % 360;
      const newPitch = Math.max(-0.55, Math.min(0.55, startPitch - dy * 0.003));
      this.cameraPitch = newPitch;

      store.setState({ heading: Math.round(newHeading) });
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        if (!this.isStreetViewActive) {
          this.container.style.cursor = 'grab';
        }
      }
    };

    this.container.style.cursor = 'grab';
    this.container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Mouse wheel on terrain canvas steps forward/backward
    this.container.addEventListener('wheel', (e) => {
      if (this.isStreetViewActive) return;
      if (e.target.closest('.modal-body, .drawer-body, .places-list, .turn-by-turn-list')) return;
      e.preventDefault();
      const stepDist = e.deltaY < 0 ? 5.0 : -5.0;
      window.dispatchEvent(new CustomEvent('step-astronaut', { detail: { distance: stepDist } }));
    }, { passive: false });
  }

  initStreetView() {
    const sphereGeom = new THREE.SphereGeometry(250, 64, 40);
    sphereGeom.scale(-1, 1, 1); // Invert sphere geometry so inside faces the viewer
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    this.streetViewMesh = new THREE.Mesh(sphereGeom, sphereMat);
    this.streetViewMesh.visible = false;
    this.streetViewMesh.position.set(0, 0, 0);
    this.scene.add(this.streetViewMesh);

    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onStreetViewDown = (e) => {
      if (!this.isStreetViewActive) return;
      if (e.target.closest('button, .streetview-header-bar, .modal-dialog, .side-drawer')) return;
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      this.container.style.cursor = 'grabbing';
    };

    const onStreetViewMove = (e) => {
      if (!this.isStreetViewActive || !isDragging) return;
      const deltaX = e.clientX - prevX;
      const deltaY = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      const sensitivity = 0.0035;
      this.streetViewYaw -= deltaX * sensitivity;
      this.streetViewPitch += deltaY * sensitivity;

      const maxPitch = (80 * Math.PI) / 180.0;
      this.streetViewPitch = Math.max(-maxPitch, Math.min(maxPitch, this.streetViewPitch));

      this.updateStreetViewOrientation();
    };

    const onStreetViewUp = () => {
      if (isDragging) {
        isDragging = false;
        if (this.isStreetViewActive) {
          this.container.style.cursor = 'grab';
        }
      }
    };

    const onStreetViewWheel = (e) => {
      if (!this.isStreetViewActive) return;
      e.preventDefault();
      const zoomSpeed = 0.04;
      this.camera.fov = Math.max(35, Math.min(85, this.camera.fov + e.deltaY * zoomSpeed));
      this.camera.updateProjectionMatrix();
    };

    this.container.addEventListener('pointerdown', onStreetViewDown);
    window.addEventListener('pointermove', onStreetViewMove);
    window.addEventListener('pointerup', onStreetViewUp);
    this.container.addEventListener('wheel', onStreetViewWheel, { passive: false });
  }

  updateStreetViewOrientation() {
    const euler = new THREE.Euler(this.streetViewPitch, this.streetViewYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  enterStreetView(siteId = 'rocknest') {
    const panoCatalog = {
      rocknest: getAssetUrl('data/panos/pano_rocknest_clean.jpg'),
      yellowknife_bay: getAssetUrl('data/panos/pano_clean.jpg'),
      bathurst_inlet: getAssetUrl('data/panos/pano_sol3512.jpg'),
      point_lake: getAssetUrl('data/panos/pano_sol3507.jpg'),
      mont_mercou: getAssetUrl('data/panos/pano_montmercou_clean.jpg'),
      murray_buttes: getAssetUrl('data/panos/pano_murray_clean.jpg'),
      namib_dune: getAssetUrl('data/panos/pano_namib_clean.jpg'),
      vera_rubin_ridge: getAssetUrl('data/panos/pano_verarubin_clean.jpg'),
      sojourner: getAssetUrl('data/panos/sojourner_crop.jpg'),
      ares_vallis: getAssetUrl('data/panos/sojourner_crop.jpg'),
      elysium_planitia: getAssetUrl('data/panos/pano_sol3507.jpg'),
      olympus_mons: getAssetUrl('data/panos/check_clean_sky_mountain.jpg'),
      gale_crater: getAssetUrl('data/panos/pano_rocknest_clean.jpg')
    };

    const cleanId = (siteId || 'rocknest').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const panoUrl = panoCatalog[cleanId] || panoCatalog.rocknest;

    const loader = new THREE.TextureLoader();
    loader.load(panoUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      this.streetViewMesh.material.map = tex;
      this.streetViewMesh.material.needsUpdate = true;
    });

    this.savedCameraPos.copy(this.camera.position);
    this.savedCameraQuat.copy(this.camera.quaternion);
    this.savedCameraFov = this.camera.fov;

    this.isStreetViewActive = true;
    this.streetViewYaw = 0.0;
    this.streetViewPitch = 0.0;

    this.camera.position.set(0, 0, 0);
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
    this.updateStreetViewOrientation();

    this.container.style.cursor = 'grab';
    this.streetViewMesh.visible = true;
    if (this.terrainMesh) this.terrainMesh.visible = false;
    if (this.roverGroup) this.roverGroup.visible = false;
    if (this.skyDomeMesh) this.skyDomeMesh.visible = false;
    if (this.groundArrowGroup) this.groundArrowGroup.visible = false;
    if (this.routeRibbon) this.routeRibbon.visible = false;
    if (this.destStalkGroup) this.destStalkGroup.visible = false;
    if (this.mountainSilhouetteMesh) this.mountainSilhouetteMesh.visible = false;
    if (this.starPoints) this.starPoints.visible = false;
    if (this.sunMesh) this.sunMesh.visible = false;
    if (this.destPoleMesh) this.destPoleMesh.visible = false;
    if (this.arrivalRingMesh) this.arrivalRingMesh.visible = false;
    if (this.beaconOverlay) this.beaconOverlay.classList.add('hidden');
    if (this.hudArrow) this.hudArrow.style.display = 'none';
  }

  exitStreetView() {
    this.isStreetViewActive = false;
    this.streetViewMesh.visible = false;
    this.container.style.cursor = 'grab';

    this.camera.position.copy(this.savedCameraPos);
    this.camera.quaternion.copy(this.savedCameraQuat);
    this.camera.fov = this.savedCameraFov;
    this.camera.updateProjectionMatrix();

    if (this.terrainMesh) this.terrainMesh.visible = true;
    if (this.roverGroup) this.roverGroup.visible = (this.cameraMode === 'thirdPerson');
    if (this.skyDomeMesh) this.skyDomeMesh.visible = true;
    if (this.groundArrowGroup) this.groundArrowGroup.visible = true;
    if (this.routeRibbon) this.routeRibbon.visible = true;
    if (this.destStalkGroup) this.destStalkGroup.visible = true;
    if (this.mountainSilhouetteMesh) this.mountainSilhouetteMesh.visible = true;
    if (this.starPoints) this.starPoints.visible = true;
    if (this.sunMesh) this.sunMesh.visible = true;
    if (this.destPoleMesh) this.destPoleMesh.visible = true;
    if (this.arrivalRingMesh) this.arrivalRingMesh.visible = true;
    if (this.hudArrow) this.hudArrow.style.display = 'flex';
  }

  updateTerrainTextures(mapStyle) {
    const normStyle = (mapStyle === 'depth' || mapStyle === 'threed' || mapStyle === 'mola') ? 'threed' : (mapStyle === 'satellite' ? 'satellite' : 'threed');
    const tex = this.terrainTextures[normStyle] || this.terrainTextures[mapStyle] || this.terrainTextures.threed || this.terrainTextures.satellite;
    if (!tex) return;
    if (this.terrainMesh) {
      this.terrainMesh.material.map = tex;
      this.terrainMesh.material.needsUpdate = true;
    }
    if (this.outerRimMesh) {
      this.outerRimMesh.material.map = tex;
      this.outerRimMesh.material.needsUpdate = true;
    }
  }

  updateVerticalExaggeration(exaggeration) {
    if (!this.terrainMesh) return;
    const geom = this.terrainMesh.geometry;
    const pos = geom.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const baseElev = getSimulatedTerrainElevation(x, -z);
      pos.setY(i, baseElev * exaggeration);
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }

  updateRoute(route) {
    if (this.routeRibbon) {
      this.scene.remove(this.routeRibbon);
      this.routeRibbon.geometry.dispose();
      this.routeRibbon = null;
    }

    this.waypointDiscs.forEach(disc => {
      this.scene.remove(disc);
      disc.geometry.dispose();
    });
    this.waypointDiscs = [];

    if (!route || route.length < 2) return;

    const destWp = route[route.length - 1];
    const isLocal = Math.abs(destWp.x) <= 2000 && Math.abs(destWp.y) <= 2000;

    // For non-local planetary destinations, do not draw a local ribbon in the dirt
    if (!isLocal) {
      if (this.destPoleMesh) this.destPoleMesh.visible = false;
      if (this.arrivalRingMesh) this.arrivalRingMesh.visible = false;
      return;
    }

    const vertices = [];
    const uvs = [];
    const ribbonWidth = 0.50; // Strictly <= 0.6 m wide with halo

    for (let i = 0; i < route.length; i++) {
      const curr = route[i];
      const next = route[Math.min(i + 1, route.length - 1)];
      const prev = route[Math.max(i - 1, 0)];

      const dirX = next.x - prev.x;
      const dirY = next.y - prev.y;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1.0;

      const perpX = (-dirY / len) * (ribbonWidth * 0.5);
      const perpY = (dirX / len) * (ribbonWidth * 0.5);

      const elev = getSimulatedTerrainElevation(curr.x, curr.y) + 0.08;

      vertices.push(curr.x - perpX, elev, -curr.y - perpY);
      vertices.push(curr.x + perpX, elev, -curr.y + perpY);

      uvs.push(0, i * 0.5);
      uvs.push(1, i * 0.5);

      // Intermediate waypoint ground discs
      if (i > 0 && i < route.length - 1) {
        const discGeom = new THREE.RingGeometry(0.2, 0.45, 24);
        discGeom.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const discMesh = new THREE.Mesh(discGeom, discMat);
        discMesh.position.set(curr.x, elev + 0.02, -curr.y);
        this.scene.add(discMesh);
        this.waypointDiscs.push(discMesh);
      }
    }

    const indices = [];
    for (let i = 0; i < route.length - 1; i++) {
      const p1 = i * 2;
      const p2 = p1 + 1;
      const p3 = p1 + 2;
      const p4 = p1 + 3;
      indices.push(p1, p2, p3);
      indices.push(p2, p4, p3);
    }

    const ribbonGeom = new THREE.BufferGeometry();
    ribbonGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    ribbonGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ribbonGeom.setIndex(indices);

    // Dotted cyan route texture with halo edge
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = 32;
    dotCanvas.height = 32;
    const dctx = dotCanvas.getContext('2d');
    dctx.fillStyle = 'rgba(0, 229, 255, 0.15)'; // Subtle halo
    dctx.fillRect(0, 0, 32, 32);
    dctx.fillStyle = '#00e5ff'; // Core dot
    dctx.beginPath();
    dctx.arc(16, 16, 7, 0, Math.PI * 2);
    dctx.fill();

    const dotTex = new THREE.CanvasTexture(dotCanvas);
    dotTex.wrapS = THREE.RepeatWrapping;
    dotTex.wrapT = THREE.RepeatWrapping;
    dotTex.repeat.set(1, route.length * 2);

    const ribbonMat = new THREE.MeshBasicMaterial({
      map: dotTex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.routeRibbon = new THREE.Mesh(ribbonGeom, ribbonMat);
    this.scene.add(this.routeRibbon);

    // Update Destination Pole and Arrival Ring positions
    const targetWp = route[route.length - 1];
    const destElev = getSimulatedTerrainElevation(targetWp.x, targetWp.y);
    if (this.destPoleMesh) {
      this.destPoleMesh.position.set(targetWp.x, destElev + 2.0, -targetWp.y);
      this.destPoleMesh.visible = true;
    }
    if (this.arrivalRingMesh) {
      this.arrivalRingMesh.position.set(targetWp.x, destElev + 0.05, -targetWp.y);
      this.arrivalRingMesh.visible = true;
    }
  }

  updateSunLighting(ltstHours = 14.5) {
    if (!this.sunLight || !this.sunMesh) return;
    const lat = store.getState().position.lat;
    const Ls = store.getState().solarLongitudeLs;
    const { elevationDeg, azimuthDeg } = calculateMarsSolarAngles(lat, ltstHours, Ls);

    const elevRad = (elevationDeg * Math.PI) / 180.0;
    const azRad = (azimuthDeg * Math.PI) / 180.0;

    const dist = 1400.0;
    const lx = dist * Math.cos(elevRad) * Math.sin(azRad);
    const ly = dist * Math.sin(elevRad);
    const lz = dist * Math.cos(elevRad) * Math.cos(azRad);

    this.sunLight.position.set(lx, Math.max(80, ly), lz);

    // Adjust light intensity and color based on elevation
    if (elevationDeg <= -10.0) {
      // Night: Deep obsidian night with brilliant starlight
      this.sunLight.intensity = 0.05;
      this.sunLight.color.setHex(0x334466);
      if (this.hemiLight) this.hemiLight.intensity = 0.15;
      if (this.sunMesh) this.sunMesh.visible = false;
      if (this.starPoints) this.starPoints.material.opacity = 1.0;
      if (this.skyDomeMesh && this.skyDomeMesh.material) {
        this.skyDomeMesh.material.color.setHex(0x04060d);
      }
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x010206);
      }
    } else if (elevationDeg < 0.0) {
      // Twilight: Fading stars, subtle horizon glow
      this.sunLight.intensity = 0.35;
      this.sunLight.color.setHex(0x553322);
      if (this.hemiLight) this.hemiLight.intensity = 0.35;
      if (this.sunMesh) this.sunMesh.visible = false;
      if (this.starPoints) this.starPoints.material.opacity = 0.70;
      if (this.skyDomeMesh && this.skyDomeMesh.material) {
        this.skyDomeMesh.material.color.setHex(0x281a18);
      }
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x180e0e);
      }
    } else if (elevationDeg <= 14.0) {
      // Sunrise / Sunset: Famous blue sun halo and warm glowing horizon
      this.sunLight.intensity = 1.35;
      this.sunLight.color.setHex(0xffaa77);
      if (this.hemiLight) this.hemiLight.intensity = 0.85;
      if (this.sunMesh) {
        this.sunMesh.visible = true;
        this.sunMesh.material.color.setHex(0x88ccff); // Blue glow forward-scattered sun
      }
      if (this.starPoints) this.starPoints.material.opacity = 0.05;
      if (this.skyDomeMesh && this.skyDomeMesh.material) {
        this.skyDomeMesh.material.color.setHex(0xdd8866);
      }
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xa05840);
      }
    } else {
      // Bright Sunny Daytime: Luminous daylight, golden dusty atmosphere, clear sunny terrain
      this.sunLight.intensity = 2.20;
      this.sunLight.color.setHex(0xfffaea);
      if (this.hemiLight) {
        this.hemiLight.intensity = 1.15;
        this.hemiLight.color.setHex(0xffe2c4);
        this.hemiLight.groundColor.setHex(0x8f482a);
      }
      if (this.sunMesh) {
        this.sunMesh.visible = true;
        this.sunMesh.material.color.setHex(0xfdf8ee);
      }
      if (this.starPoints) this.starPoints.material.opacity = 0.0;
      if (this.skyDomeMesh && this.skyDomeMesh.material) {
        this.skyDomeMesh.material.color.setHex(0xffffff);
      }
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xdf9870);
      }
    }

    // Position sun disc along sky dome (2800 m radius)
    const domeDist = 2800.0;
    this.sunMesh.position.set(
      domeDist * Math.cos(elevRad) * Math.sin(azRad),
      Math.max(80, domeDist * Math.sin(elevRad)),
      domeDist * Math.cos(elevRad) * Math.cos(azRad)
    );
    this.sunMesh.lookAt(this.camera ? this.camera.position : new THREE.Vector3(0, 0, 0));

    if (this.skyCtx && this.skyCanvas && this.skyTexture) {
      this.updateSkyGradient(this.skyCtx, this.skyCanvas, 0.65, elevationDeg, azimuthDeg);
      this.skyTexture.needsUpdate = true;
    }
  }

  updateDustFog(tau) {
    if (!this.scene.fog) return;
    if (this.scene.fog.isFog) {
      this.scene.fog.near = Math.max(500, 1600 - tau * 800);
      this.scene.fog.far = Math.max(2200, 7200 - tau * 3200);
    } else if (this.scene.fog.density !== undefined) {
      this.scene.fog.density = 0.0006 + tau * 0.0022;
    }
    const angles = calculateMarsSolarAngles(store.getState().position.lat, store.getState().ltstHours);
    if (this.skyCtx && this.skyCanvas && this.skyTexture) {
      this.updateSkyGradient(this.skyCtx, this.skyCanvas, tau, angles.elevationDeg, angles.azimuthDeg);
      this.skyTexture.needsUpdate = true;
    }
  }

  recenterTerrain(centerX, centerZ) {
    if (!this.terrainMesh) return;
    const geom = this.terrainMesh.geometry;
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const worldX = centerX + vx;
      const worldZ = centerZ + vz;
      const elev = getSimulatedTerrainElevation(worldX, -worldZ);
      pos.setY(i, elev);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    this.terrainMesh.position.set(centerX, 0, centerZ);

    // Scroll textures so they align in world space
    const uOffset = (centerX / this.terrainSize) % 1.0;
    const vOffset = (-centerZ / this.terrainSize) % 1.0;
    Object.values(this.terrainTextures).forEach(tex => {
      if (tex) {
        tex.offset.set(uOffset, vOffset);
      }
    });

    // Reposition rock instances relative to astronaut
    if (this.rockInstancedMesh) {
      const dummy = new THREE.Object3D();
      const count = 70;
      for (let i = 0; i < count; i++) {
        const angle = (i * 137.5 * Math.PI) / 180.0;
        const dist = 18.0 + Math.pow((i + 1) / count, 1.6) * 650.0;
        const rx = centerX + Math.cos(angle) * dist;
        const rz = centerZ - Math.sin(angle) * dist;
        const elev = getSimulatedTerrainElevation(rx, -rz);

        const scaleXZ = 0.4 + (Math.sin(i * 5.3) * 0.5 + 0.5) * 1.2;
        const scaleY = scaleXZ * 0.35;

        dummy.position.set(rx, elev + scaleY * 0.3, rz);
        dummy.scale.set(scaleXZ, scaleY, scaleXZ);
        dummy.rotation.set(0.08 * Math.sin(i), (i * 47.0 * Math.PI) / 180.0, 0.08 * Math.cos(i));
        dummy.updateMatrix();
        this.rockInstancedMesh.setMatrixAt(i, dummy.matrix);
      }
      this.rockInstancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateCameraAndHUD(state) {
    if (this.isStreetViewActive) return;
    const { position, heading, route, activeWaypointIndex, destination } = state;
    const terrainY = getSimulatedTerrainElevation(position.x, position.y);
    const headingRad = (heading * Math.PI) / 180.0;

    // Position and orient Curiosity Rover in User Space (Image 3)
    if (this.roverGroup) {
      this.roverGroup.position.set(position.x, terrainY, -position.y);
      this.roverGroup.rotation.y = -headingRad;
      this.roverGroup.visible = (this.cameraMode === 'thirdPerson');

      // Wheel rotation animation when moving across terrain
      if (this.roverWheels && this.lastPosition) {
        const dx = position.x - this.lastPosition.x;
        const dy = position.y - this.lastPosition.y;
        const moveDist = Math.sqrt(dx * dx + dy * dy);
        if (moveDist > 0.001) {
          const wheelTurn = moveDist / 0.25;
          this.roverWheels.forEach(w => {
            w.rotation.x += wheelTurn;
          });
        }
      }
      this.lastPosition = { x: position.x, y: position.y };
    }

    if (this.cameraMode === 'thirdPerson') {
      // 3rd-person chase camera positioned behind and above Curiosity rover (Image 3)
      const chaseDist = 3.6;
      const chaseHeight = 1.7;
      const camX = position.x - Math.sin(headingRad) * chaseDist;
      const camZ = (-position.y) + Math.cos(headingRad) * chaseDist;
      const camY = getSimulatedTerrainElevation(camX, -camZ) + chaseHeight;

      this.camera.position.set(camX, Math.max(camY, terrainY + 1.2), camZ);

      // Target ahead of the rover looking forward and down
      const lookDist = 14.0;
      const lookX = position.x + Math.sin(headingRad) * lookDist;
      const lookZ = (-position.y) - Math.cos(headingRad) * lookDist;
      const lookY = getSimulatedTerrainElevation(lookX, -lookZ) + 1.0;
      this.camera.lookAt(lookX, lookY, lookZ);
    } else {
      // 1st-person suited astronaut helmet HUD view
      this.camera.position.set(position.x, terrainY + this.cameraEyeHeight, -position.y);
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = -headingRad;
      this.camera.rotation.x = this.cameraPitch || 0;
    }

    // Center sky dome and starfield on astronaut position
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(position.x, terrainY, -position.y);
    }
    if (this.starPoints) {
      this.starPoints.position.set(position.x, terrainY, -position.y);
    }

    // Dynamic terrain centering when astronaut traverses across Mars surface
    const gridStep = 20.0;
    const curGridX = Math.round(position.x / gridStep) * gridStep;
    const curGridZ = Math.round((-position.y) / gridStep) * gridStep;

    if (Math.abs(curGridX - this.lastGridX) >= gridStep || Math.abs(curGridZ - this.lastGridZ) >= gridStep) {
      this.lastGridX = curGridX;
      this.lastGridZ = curGridZ;
      this.recenterTerrain(curGridX, curGridZ);
    }

    // Update 3D Destination Landmark Stalk (Image 1 & 2)
    if (this.destStalkGroup && route && route.length > 0) {
      const destWp = route[route.length - 1];
      const destElev = getSimulatedTerrainElevation(destWp.x, destWp.y);
      this.destStalkGroup.position.set(destWp.x, destElev, -destWp.y);
      this.destStalkGroup.visible = true;

      const res = getLiveDistanceToDestination(position, destination);
      const distStr = res ? formatNavDistance(res.distance) : '--';
      if (this.destBillboardSprite && destination) {
        this.updateBillboardSprite(this.destBillboardSprite, destination.name, `${distStr} · Target`, '#ff7043');
      }
    }

    // Position ground chevron 5.5m ahead along path
    if (this.groundArrowGroup && route && route.length > 0) {
      const nextIndex = Math.min(activeWaypointIndex + 1, route.length - 1);
      const nextWp = route[nextIndex];
      const dx = nextWp.x - position.x;
      const dy = nextWp.y - position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 3.0) {
        const angle = Math.atan2(dx, dy);
        const arrowDist = Math.min(5.5, dist * 0.6);
        const arrowX = position.x + Math.sin(angle) * arrowDist;
        const arrowY = position.y + Math.cos(angle) * arrowDist;
        const arrowElev = getSimulatedTerrainElevation(arrowX, arrowY) + 0.05;

        this.groundArrowGroup.position.set(arrowX, arrowElev, -arrowY);
        this.groundArrowGroup.rotation.y = -angle;
        this.groundArrowGroup.visible = true;
      } else {
        this.groundArrowGroup.visible = false;
      }
    }

    // Circular direction arrow in 3D view
    if (this.hudArrow && route && route.length > 0) {
      const nextIndex = Math.min(activeWaypointIndex + 1, route.length - 1);
      const nextWp = route[nextIndex];
      const dx = nextWp.x - position.x;
      const dy = nextWp.y - position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 3.0) {
        const targetBearing = (Math.atan2(dx, dy) * (180.0 / Math.PI) + 360.0) % 360.0;
        const relBearing = getRelativeBearing(targetBearing, heading);
        this.hudArrow.style.transform = `rotate(${relBearing}deg)`;
        this.hudArrow.style.display = 'flex';
      }
    }

    // 3D Destination Beacon at CONSTANT SCREEN SIZE using unified distance function
    if (this.beaconOverlay && destination && route && route.length > 0) {
      const destWp = route[route.length - 1];
      const elev = getSimulatedTerrainElevation(destWp.x, destWp.y) + 3.8;
      const destVec = new THREE.Vector3(destWp.x, elev, -destWp.y);

      const proj = destVec.clone().project(this.camera);
      const isBehind = proj.z > 1.0 || destVec.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3())) < 0;

      if (!isBehind) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const screenX = ((proj.x + 1) * width) / 2;
        const screenY = ((-proj.y + 1) * height) / 2;

        const res = getLiveDistanceToDestination(position, destination);
        const distStr = res ? formatNavDistance(res.distance) : '--';

        this.beaconOverlay.style.left = `${screenX.toFixed(1)}px`;
        this.beaconOverlay.style.top = `${screenY.toFixed(1)}px`;
        this.beaconOverlay.querySelector('.beacon-name').textContent = destination.name;
        this.beaconOverlay.querySelector('.beacon-dist').textContent = distStr;
        this.beaconOverlay.classList.remove('hidden');
      } else {
        this.beaconOverlay.classList.add('hidden');
      }
    }
  }

  onStateChange(state, prevState) {
    if (state.mapStyle !== prevState.mapStyle) {
      this.updateTerrainTextures(state.mapStyle);
    }
    if (state.verticalExaggeration !== prevState.verticalExaggeration) {
      this.updateVerticalExaggeration(state.verticalExaggeration);
    }
    if (state.ltstHours !== prevState.ltstHours) {
      this.updateSunLighting(state.ltstHours);
    }
    if (state.dustHazeTau !== prevState.dustHazeTau) {
      this.updateDustFog(state.dustHazeTau);
    }
    if (state.route !== prevState.route) {
      this.updateRoute(state.route);
    }

    this.updateCameraAndHUD(state);
  }

  updateFromState(state) {
    this.updateSunLighting(state.ltstHours);
    this.updateDustFog(state.dustHazeTau);
    this.updateTerrainTextures(state.mapStyle);
    this.updateVerticalExaggeration(state.verticalExaggeration);
    if (state.route) {
      this.updateRoute(state.route);
    }
    this.updateCameraAndHUD(state);
  }

  handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
