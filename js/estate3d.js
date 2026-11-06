import * as THREE from 'three';
import { PLOTS } from './plots.js';

// Concept masterplan of Venture 01: 40 plots, buildings rising on some of them,
// apartment towers behind. Scroll progress (0..1) drives the camera and the
// build; idle motion keeps it alive. Two themes follow the page's light/dark mode.

const COLS = 8;
const ROWS = 5;
const PLOT = 2.2;
const GAP = 0.9;
const STEP = PLOT + GAP;

const THEMES = {
  light: {
    bg: 0xf3f2ef, platform: 0xe2dccf,
    hemi: [0xffffff, 0xb8b0a0, 1.15], key: [0xffffff, 1.7], rim: [0xf0d47a, 0.5],
    status: {
      available: { fill: 0xf6edd4, edge: 0xa87917, op: 1 },
      reserved: { fill: 0xf4e1d9, edge: 0xc4553d, op: 0.85 },
      booked: { fill: 0xe6e2da, edge: 0x85817a, op: 0.75 },
      sold: { fill: 0xd9d4ca, edge: 0xa9a399, op: 0.6 },
      'not-for-sale': { fill: 0xe9e6df, edge: 0xbdb7ac, op: 0.5 },
    },
    body: [0xffffff, 0, 0.6], line: [0xa87917, 0.55], tree: 0x7e9460,
    dust: [0xa87917, 0.3], scan: 0xa87917, highlight: 0xf0d47a,
  },
  dark: {
    bg: 0x0a0a0a, platform: 0x1a1814,
    hemi: [0xf7f5ef, 0x050505, 0.55], key: [0xf0d47a, 2.4], rim: [0xd4af37, 0.9],
    status: {
      available: { fill: 0x211d13, edge: 0xd4af37, op: 1 },
      reserved: { fill: 0x2a2310, edge: 0xa87917, op: 0.75 },
      booked: { fill: 0x1b1b1b, edge: 0x85817a, op: 0.65 },
      sold: { fill: 0x0d0d0d, edge: 0x3b3935, op: 0.6 },
      'not-for-sale': { fill: 0x111111, edge: 0x3b3935, op: 0.4 },
    },
    body: [0x1a1814, 0.6, 0.32], line: [0xd4af37, 0.5], tree: 0x2f3a28,
    dust: [0xf0d47a, 0.55], scan: 0xf0d47a, highlight: 0x4a3b12,
  },
};

// Outline and floor lines for a building, sharing one material so themes can recolour it
function buildingLines(w, d, h, floor, material) {
  const hw = w / 2;
  const hd = d / 2;
  const pts = [];
  for (let y = floor; y < h; y += floor) {
    pts.push(-hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd, hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd);
  }
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) pts.push(x, 0, z, x, h, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, material);
}

/**
 * Returns null when WebGL is unavailable so the page can fall back gracefully.
 */
export function createEstate(canvas, { onHover, theme = 'light' } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 26, 58);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 150);

  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.position.set(12, 18, 9);
  const rim = new THREE.DirectionalLight();
  rim.position.set(-14, 7, -12);
  scene.add(hemi, key, rim);

  const root = new THREE.Group();
  scene.add(root);

  const platformMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const platform = new THREE.Mesh(new THREE.PlaneGeometry(COLS * STEP + 5, ROWS * STEP + 5), platformMat);
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = -0.02;
  root.add(platform);

  // The ground matches the page so the canvas edge never shows
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  root.add(ground);

  // Plots
  const plotMeshes = [];
  const plotById = new Map();
  const buildList = [];
  const plotGeo = new THREE.PlaneGeometry(PLOT, PLOT);
  const plotEdgeGeo = new THREE.EdgesGeometry(plotGeo);
  PLOTS.forEach((plot, i) => {
    const x = ((i % COLS) - (COLS - 1) / 2) * STEP;
    const z = (Math.floor(i / COLS) - (ROWS - 1) / 2) * STEP;
    const mesh = new THREE.Mesh(plotGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    mesh.userData.id = plot.id;
    const edges = new THREE.LineSegments(plotEdgeGeo, new THREE.LineBasicMaterial({ transparent: true }));
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(x, 0.02, z);
    root.add(mesh, edges);
    plotMeshes.push(mesh);
    const entry = { mesh, edges, status: plot.status, dist: Math.hypot(x, z), index: i, op: 1, fill: 0 };
    plotById.set(plot.id, entry);
    buildList.push(entry);
  });

  const bodyMat = new THREE.MeshStandardMaterial();
  const lineMat = new THREE.LineBasicMaterial({ transparent: true });

  // Apartment towers at the back
  const towers = [
    { x: -6, z: -ROWS * STEP * 0.5 - 4.5, w: 3.2, h: 10 },
    { x: 0, z: -ROWS * STEP * 0.5 - 5.5, w: 3.6, h: 14 },
    { x: 6, z: -ROWS * STEP * 0.5 - 4, w: 3, h: 8 },
  ].map((spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.w), bodyMat);
    body.position.y = spec.h / 2;
    group.add(body, buildingLines(spec.w, spec.w, spec.h, 0.9, lineMat));
    group.scale.y = 0.001;
    root.add(group);
    return group;
  });

  // Homes rising on individual plots
  const BUILD_PLOTS = [
    { i: 5, h: 2.2 }, { i: 12, h: 3.6 }, { i: 18, h: 1.6 }, { i: 21, h: 4.2 },
    { i: 26, h: 2.8 }, { i: 29, h: 1.9 }, { i: 33, h: 3.1 }, { i: 37, h: 2.4 },
  ];
  const buildings = BUILD_PLOTS.map(({ i, h }, k) => {
    const group = new THREE.Group();
    group.position.set(((i % COLS) - (COLS - 1) / 2) * STEP, 0.03, (Math.floor(i / COLS) - (ROWS - 1) / 2) * STEP);
    const w = PLOT * 0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bodyMat);
    body.position.y = h / 2;
    group.add(body, buildingLines(w, w, h, 0.35, lineMat));
    group.scale.y = 0.001;
    root.add(group);
    return { group, start: 0.42 + k * 0.05 };
  });

  // Scan line sweeping the site on its own clock
  const scanMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(COLS * STEP + 2, 0.12), scanMat);
  scan.rotation.x = -Math.PI / 2;
  scan.position.y = 0.06;
  root.add(scan);

  // Perimeter trees
  const treeMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const treeGeo = new THREE.IcosahedronGeometry(0.35, 0);
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2;
    const r = 15.5 + (i % 3) * 0.9;
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.position.set(Math.cos(angle) * r, 0.35, Math.sin(angle) * r * 0.7);
    tree.scale.y = 1 + (i % 4) * 0.25;
    root.add(tree);
  }

  // Dust drifting over the site
  const dustPos = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 34;
    dustPos[i * 3 + 1] = Math.random() * 12;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.06, transparent: true, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  const state = { progress: 0, pointerX: 0, pointerY: 0, hovered: null, visible: true, theme: THEMES.light };

  function applyTheme(name) {
    const T = THEMES[name] || THEMES.light;
    state.theme = T;
    scene.fog.color.setHex(T.bg);
    groundMat.color.setHex(T.bg);
    platformMat.color.setHex(T.platform);
    hemi.color.setHex(T.hemi[0]);
    hemi.groundColor.setHex(T.hemi[1]);
    hemi.intensity = T.hemi[2];
    key.color.setHex(T.key[0]);
    key.intensity = T.key[1];
    rim.color.setHex(T.rim[0]);
    rim.intensity = T.rim[1];
    bodyMat.color.setHex(T.body[0]);
    bodyMat.metalness = T.body[1];
    bodyMat.roughness = T.body[2];
    lineMat.color.setHex(T.line[0]);
    lineMat.opacity = T.line[1];
    treeMat.color.setHex(T.tree);
    dustMat.color.setHex(T.dust[0]);
    dustMat.opacity = T.dust[1];
    scanMat.color.setHex(T.scan);
    buildList.forEach((entry) => {
      const s = T.status[entry.status];
      entry.fill = s.fill;
      entry.op = s.op;
      entry.mesh.material.color.setHex(state.hovered === entry.mesh.userData.id ? T.highlight : s.fill);
      entry.edges.material.color.setHex(s.edge);
    });
  }
  applyTheme(theme);

  const maxDist = Math.max(...buildList.map((b) => b.dist));
  const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);

  // Camera starts overhead and sweeps to a three-quarter view as you scroll
  function placeCamera() {
    const p = state.progress;
    const angle = THREE.MathUtils.lerp(0.1, 1.1, p) + state.pointerX * 0.12;
    const radius = THREE.MathUtils.lerp(13, 20, p);
    const height = THREE.MathUtils.lerp(30, 10, p) + state.pointerY * 0.8;
    camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    camera.lookAt(0, THREE.MathUtils.lerp(0, 2.5, p), THREE.MathUtils.lerp(0, -4, p));
  }

  // Plots come alive in a ripple from the centre, homes rise, then the towers grow
  function updateBuild(t) {
    const p = state.progress;
    for (const entry of buildList) {
      const built = clamp01((p - (0.08 + (entry.dist / maxDist) * 0.3)) / 0.1);
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.4 + entry.index * 0.45);
      const s = 0.6 + 0.4 * built;
      entry.mesh.scale.setScalar(s);
      entry.edges.scale.setScalar(s);
      if (state.hovered !== entry.mesh.userData.id) {
        entry.edges.material.opacity = (0.2 + 0.8 * built) * pulse * entry.op;
      }
    }
    for (const b of buildings) b.group.scale.y = Math.max(0.001, clamp01((p - b.start) / 0.12));
    const growth = Math.max(0.001, clamp01((p - 0.6) / 0.25));
    towers.forEach((tower) => { tower.scale.y = growth; });
    const span = ROWS * STEP + 4;
    scan.position.z = (((t * 0.08) % 1) - 0.5) * span;
    scanMat.opacity = 0.35 * (1 - Math.abs(scan.position.z) / (span / 2)) + 0.05;
  }

  function resize() {
    const parent = canvas.parentElement;
    renderer.setSize(parent.clientWidth, parent.clientHeight, false);
    camera.aspect = parent.clientWidth / parent.clientHeight;
    // Narrow screens need a wider lens so the whole masterplan stays in frame
    camera.fov = camera.aspect < 0.9 ? 50 : 32;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  resize();

  function setHighlight(id, on) {
    const entry = plotById.get(id);
    entry.mesh.material.color.setHex(on ? state.theme.highlight : entry.fill);
    if (on) entry.edges.material.opacity = 1;
  }

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
    state.pointerX = pointer.x;
    state.pointerY = pointer.y;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(plotMeshes, false)[0];
    const id = hit ? hit.object.userData.id : null;
    if (id !== state.hovered) {
      if (state.hovered) setHighlight(state.hovered, false);
      if (id) setHighlight(id, true);
      state.hovered = id;
    }
    if (onHover) onHover(id, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.hovered) setHighlight(state.hovered, false);
    state.hovered = null;
    state.pointerX = 0;
    state.pointerY = 0;
    if (onHover) onHover(null);
  });

  // Only render while the canvas is on screen
  const visibility = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; });
  visibility.observe(canvas);

  const clock = new THREE.Clock();
  let frame = 0;
  function animate() {
    frame = requestAnimationFrame(animate);
    if (!state.visible) return;
    const t = clock.getElapsedTime();
    dust.position.y = Math.sin(t * 0.3) * 0.25;
    dust.rotation.y = t * 0.02;
    updateBuild(t);
    placeCamera();
    renderer.render(scene, camera);
  }
  animate();

  return {
    setProgress(p) { state.progress = clamp01(p); },
    setTheme: applyTheme,
    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      renderer.dispose();
    },
  };
}
