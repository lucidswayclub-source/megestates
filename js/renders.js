import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Concept renders generated in the browser. They stand in for photography until
// MegEstates supplies approved images; every <img> using them is captioned
// "Concept render". Swap any image by giving it a real src instead of data-render.

let renderer = null;
let envTexture = null;

function getRenderer() {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  return renderer;
}

// ---------- Lighting presets ----------
const LIGHT = {
  midday: { skyTop: '#8fb3d6', skyHorizon: '#e8edf0', sun: 0xfff6e8, sunI: 3.0, sunPos: [30, 50, 20], hemi: 0.7, exposure: 1.0, warmGlass: 0 },
  golden: { skyTop: '#93a9bd', skyHorizon: '#f4d6ae', sun: 0xffc98a, sunI: 3.4, sunPos: [-40, 18, 25], hemi: 0.5, exposure: 1.05, warmGlass: 0 },
  dusk: { skyTop: '#28324a', skyHorizon: '#e7a37a', sun: 0xff9f6a, sunI: 1.4, sunPos: [-40, 8, 10], hemi: 0.35, exposure: 1.1, warmGlass: 1.1 },
};

function skyTexture(top, horizon) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function setupScene(preset) {
  const L = LIGHT[preset];
  const scene = new THREE.Scene();
  scene.background = skyTexture(L.skyTop, L.skyHorizon);
  scene.environment = envTexture;
  scene.fog = new THREE.Fog(L.skyHorizon, 90, 260);

  scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6b6150, L.hemi));
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.set(...L.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  return { scene, L };
}

// ---------- Materials ----------
function materials(L) {
  const std = (color, roughness = 0.85, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    white: std(0xefebe4, 0.82),
    concrete: std(0xc9c3b8, 0.95),
    charcoal: std(0x2b2b2d, 0.6, 0.2),
    wood: std(0x8a5a3b, 0.7),
    frame: std(0x1b1b1c, 0.45, 0.4),
    glass: std(0x4f6672, 0.05, 0.5, {
      envMapIntensity: 1.6,
      emissive: new THREE.Color(0xffb067),
      emissiveIntensity: L.warmGlass,
    }),
    lawn: std(0x74904f, 1),
    meadow: std(0x9aa66a, 1),
    paving: std(0xd9d3c7, 0.9),
    asphalt: std(0x4f5254, 0.95),
    soil: std(0xc8b089, 1),
    water: std(0x3d9cc4, 0.05, 0.1, { transparent: true, opacity: 0.92 }),
    trunk: std(0x6b4f3a, 0.9),
    leaf: std(0x4a6438, 0.95),
    leaf2: std(0x5c7a40, 0.95),
    gold: std(0xd4af37, 0.35, 0.8),
    stone: std(0xf4f1ea, 0.7),
  };
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

function plane(w, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// Deterministic pseudo-random so every load renders the same image
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A tree is a slim trunk with a loose cluster of three smooth crowns, so it reads
// as foliage rather than a single low-poly ball
function tree(M, x, z, scale, parent, alt = false) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.2, 6), M.trunk);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  g.add(trunk);
  const mat = alt ? M.leaf2 : M.leaf;
  [[0, 2.6, 0, 0.85], [0.45, 2.3, 0.2, 0.6], [-0.4, 2.35, -0.25, 0.62]].forEach(([cx, cy, cz, r]) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat);
    crown.position.set(cx, cy, cz);
    crown.castShadow = true;
    g.add(crown);
  });
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  parent.add(g);
  return g;
}

// ---------- Scenes ----------
function buildVilla(scene, M, variant) {
  const root = new THREE.Group();
  scene.add(root);
  plane(400, 400, M.lawn, 0, 0, 0, root);
  plane(30, 22, M.paving, 0, 0.01, 2, root);
  plane(6, 30, M.paving, -14, 0.01, 14, root);

  const lower = variant === 'wood' ? M.wood : M.charcoal;
  const upper = variant === 'wood' ? M.white : M.charcoal;

  // Ground floor
  box(14, 3.2, 8, M.white, 0, 0, 0, root);
  box(11, 2.5, 0.12, M.glass, 0.5, 0.35, 4.02, root);
  box(0.25, 3.2, 0.25, M.frame, -6.2, 0, 4.1, root);
  // Upper floor, cantilevered
  box(16, 3, 9, upper, 2.5, 3.2, -0.5, root);
  box(12, 2.2, 0.12, M.glass, 4, 3.6, 4.02, root);
  box(3, 2.2, 0.12, M.glass, -4, 3.6, 4.02, root);
  // Roof slab and balcony
  box(17.4, 0.35, 10, M.white, 2.5, 6.2, -0.5, root);
  box(6, 0.2, 2.4, M.white, 7.5, 3.2, 5.1, root);
  const rail = box(6, 1, 0.05, new THREE.MeshStandardMaterial({ color: 0xbfd3dc, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 }), 7.5, 3.4, 6.25, root);
  rail.castShadow = false;
  // Side wing in the accent material
  box(5, 3.2, 7, lower, -9.5, 0, 0.5, root);
  // Pool and deck
  box(12, 0.25, 6, M.paving, 6, 0, 9, root);
  plane(9, 3.6, M.water, 6, 0.27, 9, root);
  // Low garden walls and steps
  box(10, 0.8, 0.4, M.white, -2, 0, 12.5, root);
  for (let i = 0; i < 3; i++) box(4, 0.18, 0.8, M.paving, -10, i * 0.18, 6 + i * 0.8, root);

  const r = rng(variant === 'wood' ? 7 : 3);
  // Trees sit behind and beside the house so the camera has a clear view
  const spots = [[-20, -8], [-18, 6], [-24, -2], [18, -10], [22, -4], [-8, -12], [8, -13], [24, -14], [-26, 10], [0, -16], [-14, -15], [14, -16]];
  spots.forEach(([x, z], i) => tree(M, x + r() * 2, z + r() * 2, 1.3 + r() * 0.9, root, i % 2 === 0));
  // Low boundary walls at the sides of the garden
  box(0.4, 0.7, 14, M.white, -17, 0, 9, root);
  box(0.4, 0.7, 14, M.white, 17, 0, 9, root);
  return root;
}

function buildPlots(scene, M, { houses = 6, seed = 11 } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  plane(600, 600, M.meadow, 0, 0, 0, root);

  const COLS = 8;
  const ROWS = 5;
  const PW = 9;
  const PD = 12;
  const ROAD = 5;
  const width = COLS * PW;
  const depth = ROWS * PD + 2 * ROAD;
  // Roads: perimeter and one spine
  plane(width + 2 * ROAD, ROAD, M.asphalt, 0, 0.02, -depth / 2, root);
  plane(width + 2 * ROAD, ROAD, M.asphalt, 0, 0.02, depth / 2, root);
  plane(ROAD, depth + ROAD, M.asphalt, -width / 2 - ROAD / 2, 0.02, 0, root);
  plane(ROAD, depth + ROAD, M.asphalt, width / 2 + ROAD / 2, 0.02, 0, root);
  plane(width, ROAD, M.asphalt, 0, 0.02, -PD / 2 + 0, root);
  // Approach road
  plane(ROAD + 1, 120, M.asphalt, -width / 2 - ROAD / 2, 0.015, depth / 2 + 60, root);

  const r = rng(seed);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const builtOn = new Set();
  while (builtOn.size < houses) builtOn.add(Math.floor(r() * COLS * ROWS));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const x = -width / 2 + PW / 2 + col * PW;
      // Two blocks of plots either side of the spine road
      const zBase = row < 2 ? -depth / 2 + ROAD / 2 + PD / 2 + row * PD : -PD / 2 + ROAD / 2 + PD / 2 + (row - 2) * PD;
      const z = zBase + ROAD / 2;
      const soil = plane(PW - 0.6, PD - 0.6, builtOn.has(i) ? M.lawn : M.soil, x, 0.03, z, root);
      soil.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PW - 0.6, PD - 0.6)), edgeMat);
      edges.rotation.x = -Math.PI / 2;
      edges.position.set(x, 0.06, z);
      root.add(edges);
      // Boundary stones at the corners
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => box(0.3, 0.4, 0.3, M.stone, x + sx * (PW / 2 - 0.4), 0, z + sz * (PD / 2 - 0.4), root));
      if (builtOn.has(i)) {
        const h = 3 + Math.floor(r() * 2) * 3;
        box(PW - 3, h, PD - 5, M.white, x, 0, z - 0.5, root);
        box(PW - 4, 0.25, PD - 4, M.white, x, h, z - 0.5, root);
        box(PW - 3.5, h - 1, 0.1, M.glass, x, 0.5, z - 0.5 + (PD - 5) / 2 + 0.06, root);
      }
    }
  }

  // Avenue trees along the perimeter roads
  for (let x = -width / 2; x <= width / 2; x += 7) {
    tree(M, x, -depth / 2 - ROAD - 1.5, 1, root, x % 2 === 0);
    tree(M, x, depth / 2 + ROAD + 1.5, 1, root);
  }
  // Entrance gate with a gold sign
  const gx = -width / 2 - ROAD / 2;
  const gz = depth / 2 + ROAD + 6;
  box(1.2, 6, 1.2, M.white, gx - 4, 0, gz, root);
  box(1.2, 6, 1.2, M.white, gx + 4, 0, gz, root);
  box(9.4, 1.2, 1.4, M.white, gx, 6, gz, root);
  box(5, 0.6, 0.1, M.gold, gx, 6.3, gz + 0.72, root);
  // Scattered trees outside the venture
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = 75 + r() * 60;
    tree(M, Math.cos(a) * d, Math.sin(a) * d, 1.4 + r() * 1.5, root, i % 2 === 0);
  }
  return root;
}

function buildTower(scene, M) {
  const root = new THREE.Group();
  scene.add(root);
  plane(500, 500, M.lawn, 0, 0, 0, root);
  plane(60, 40, M.paving, 0, 0.01, 0, root);
  plane(10, 200, M.asphalt, -32, 0.015, 0, root);

  const FLOORS = 12;
  const FH = 3.1;
  // Podium
  box(30, 4, 22, M.concrete, 0, 0, 0, root);
  box(28, 3, 0.12, M.glass, 0, 0.5, 11.02, root);
  // Tower floors: slab, recessed glass, projecting balconies
  for (let f = 0; f < FLOORS; f++) {
    const y = 4 + f * FH;
    box(20, 0.35, 14, M.white, 0, y, 0, root);
    box(19, FH - 0.35, 13, M.glass, 0, y + 0.35, 0, root);
    box(8, 0.25, 2.2, M.white, -5, y, 8, root);
    box(8, 0.25, 2.2, M.white, 5.5, y + (f % 2 ? 0 : 0), 8, root);
    box(0.3, FH - 0.35, 0.3, M.white, -9.85, y + 0.35, 6.85, root);
    box(0.3, FH - 0.35, 0.3, M.white, 9.85, y + 0.35, 6.85, root);
  }
  box(21, 0.6, 15, M.white, 0, 4 + FLOORS * FH, 0, root);
  box(6, 3, 6, M.white, 0, 4.6 + FLOORS * FH, -2, root);
  // Vertical fins on the side
  for (let i = 0; i < 6; i++) box(0.25, FLOORS * FH, 1.2, M.white, 10.2, 4, -6 + i * 2.4, root);

  const r = rng(21);
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    tree(M, side * (18 + r() * 16), -20 + r() * 50, 1.3 + r(), root, i % 3 === 0);
  }
  return root;
}

// ---------- Shots ----------
const SHOTS = {
  'villa-golden': { preset: 'golden', build: (s, M) => buildVilla(s, M, 'charcoal'), cam: [21, 4.2, 25], look: [1, 3.4, 0], fov: 36 },
  'villa-midday': { preset: 'midday', build: (s, M) => buildVilla(s, M, 'wood'), cam: [-19, 3.6, 25], look: [1, 3.4, 0], fov: 38 },
  'villa-dusk': { preset: 'dusk', build: (s, M) => buildVilla(s, M, 'charcoal'), cam: [12, 3.2, 26], look: [1, 3.6, 0], fov: 36 },
  'plots-aerial': { preset: 'midday', build: (s, M) => buildPlots(s, M, { houses: 6, seed: 11 }), cam: [70, 75, 85], look: [0, 0, 6], fov: 36 },
  'plots-golden': { preset: 'golden', build: (s, M) => buildPlots(s, M, { houses: 4, seed: 5 }), cam: [-75, 45, 70], look: [0, 0, 0], fov: 38 },
  'plots-close': { preset: 'midday', build: (s, M) => buildPlots(s, M, { houses: 9, seed: 19 }), cam: [20, 16, 52], look: [4, 0, 14], fov: 38 },
  'plots-close-2': { preset: 'golden', build: (s, M) => buildPlots(s, M, { houses: 7, seed: 31 }), cam: [-30, 18, 50], look: [-8, 0, 12], fov: 38 },
  tower: { preset: 'midday', build: buildTower, cam: [38, 6, 58], look: [0, 22, 0], fov: 40 },
  'tower-golden': { preset: 'golden', build: buildTower, cam: [-46, 12, 48], look: [0, 20, 0], fov: 40 },
};

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) [].concat(obj.material).forEach((m) => m.dispose());
  });
  if (scene.background && scene.background.dispose) scene.background.dispose();
}

const cache = new Map();

export function renderShot(name, width, height) {
  const key = `${name}@${width}x${height}`;
  if (cache.has(key)) return cache.get(key);
  const shot = SHOTS[name];
  if (!shot) return null;

  const r = getRenderer();
  const { scene, L } = setupScene(shot.preset);
  const M = materials(L);
  shot.build(scene, M);

  const camera = new THREE.PerspectiveCamera(shot.fov, width / height, 0.5, 600);
  camera.position.set(...shot.cam);
  camera.lookAt(...shot.look);

  r.setPixelRatio(1);
  r.setSize(width, height, false);
  r.toneMappingExposure = L.exposure;
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/jpeg', 0.88);
  disposeScene(scene);
  cache.set(key, url);
  return url;
}

export function rendersAvailable() {
  try {
    getRenderer();
    return true;
  } catch (err) {
    return false;
  }
}
