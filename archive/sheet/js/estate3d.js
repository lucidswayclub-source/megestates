import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PLOTS } from './plots.js';

// Brand tokens (brief §03)
const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf0d47a;
const GOLD_DARK = 0xa87917;
const MUTED = 0x85817a;

const COLS = 8;
const ROWS = 5;
const PLOT = 2.2;
const GAP = 0.9;
const STEP = PLOT + GAP;

const STATUS_STYLE = {
  available: { fill: 0x211d13, edge: GOLD, opacity: 0.95 },
  reserved: { fill: 0x2a2310, edge: GOLD_DARK, opacity: 0.7 },
  booked: { fill: 0x1b1b1b, edge: MUTED, opacity: 0.6 },
  sold: { fill: 0x0d0d0d, edge: 0x3b3935, opacity: 0.6 },
  'not-for-sale': { fill: 0x111111, edge: 0x3b3935, opacity: 0.35 },
};

// Vertical outline + floor lines for a tower, drawn in brand gold
function towerLines(w, d, h, floor) {
  const hw = w / 2;
  const hd = d / 2;
  const pts = [];
  for (let y = floor; y < h; y += floor) {
    pts.push(-hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd, hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd);
  }
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
    pts.push(x, 0, z, x, h, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45 })
  );
}

/**
 * Concept masterplan of the estate: plotted venture, apartment towers, landscape.
 * Returns null when WebGL is unavailable so the page can fall back gracefully.
 */
export function createEstate(canvas, { onHover } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return null;
  }

  const pixelCap = window.innerWidth < 768 ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCap));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 26, 58);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 150);

  scene.add(new THREE.HemisphereLight(0xf7f5ef, 0x050505, 0.55));
  const key = new THREE.DirectionalLight(GOLD_LIGHT, 2.4);
  key.position.set(12, 18, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(GOLD, 0.9);
  rim.position.set(-14, 7, -12);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  // Platform: roads show through the gaps between plots
  const platform = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * STEP + 5, ROWS * STEP + 5),
    new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.95 })
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = -0.02;
  root.add(platform);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    // Matches the page background so the canvas edge never shows as a hard line
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  root.add(ground);

  // Plots: one tile per record, outlined in status colour
  const plotMeshes = [];
  const plotById = new Map();
  const buildList = [];
  const plotGeo = new THREE.PlaneGeometry(PLOT, PLOT);
  const plotEdgeGeo = new THREE.EdgesGeometry(plotGeo);

  PLOTS.forEach((plot, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const style = STATUS_STYLE[plot.status];
    const x = (col - (COLS - 1) / 2) * STEP;
    const z = (row - (ROWS - 1) / 2) * STEP;

    const mesh = new THREE.Mesh(
      plotGeo,
      new THREE.MeshStandardMaterial({ color: style.fill, roughness: 0.85, metalness: 0.05 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    mesh.userData.id = plot.id;
    mesh.userData.baseFill = style.fill;

    const edges = new THREE.LineSegments(
      plotEdgeGeo,
      new THREE.LineBasicMaterial({ color: style.edge, transparent: true, opacity: style.opacity })
    );
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(x, 0.02, z);

    root.add(mesh, edges);
    plotMeshes.push(mesh);
    plotById.set(plot.id, { mesh, edges });
    buildList.push({ mesh, edges, dist: Math.hypot(x, z), index: i });
  });

  // Apartment towers at the back of the estate; height grows with setGrowth()
  const towerSpecs = [
    { x: -6, z: -ROWS * STEP * 0.5 - 4.5, w: 3.2, d: 3.2, h: 10 },
    { x: 0, z: -ROWS * STEP * 0.5 - 5.5, w: 3.6, d: 3.6, h: 14 },
    { x: 6, z: -ROWS * STEP * 0.5 - 4, w: 3, d: 3, h: 8 },
  ];
  const towers = towerSpecs.map((spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w, spec.h, spec.d),
      new THREE.MeshStandardMaterial({ color: 0x171717, metalness: 0.7, roughness: 0.3 })
    );
    body.position.y = spec.h / 2;
    group.add(body, towerLines(spec.w, spec.d, spec.h, 0.9));
    group.userData.h = spec.h;
    root.add(group);
    return group;
  });

  // Individual buildings on selected plots; each rises as the build front reaches it
  const BUILD_PLOTS = [
    { i: 5, h: 2.2 }, { i: 12, h: 3.6 }, { i: 18, h: 1.6 }, { i: 21, h: 4.2 },
    { i: 26, h: 2.8 }, { i: 29, h: 1.9 }, { i: 33, h: 3.1 }, { i: 37, h: 2.4 },
  ];
  const buildings = BUILD_PLOTS.map(({ i, h }, k) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const group = new THREE.Group();
    group.position.set((col - (COLS - 1) / 2) * STEP, 0.03, (row - (ROWS - 1) / 2) * STEP);
    const w = PLOT * 0.6;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshStandardMaterial({ color: 0x1d1a12, metalness: 0.5, roughness: 0.35 })
    );
    body.position.y = h / 2;
    group.add(body, towerLines(w, w, h, 0.35));
    group.scale.y = 0.001;
    root.add(group);
    return { group, start: 0.42 + k * 0.05 };
  });

  // Scan line that sweeps across the estate on its own clock
  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * STEP + 2, 0.12),
    new THREE.MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.35, depthWrite: false })
  );
  scan.rotation.x = -Math.PI / 2;
  scan.position.y = 0.06;
  root.add(scan);

  // Landscape: low trees on the perimeter, deterministic placement
  const treeGeo = new THREE.IcosahedronGeometry(0.35, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f3a28, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2;
    const r = 15.5 + (i % 3) * 0.9;
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.position.set(Math.cos(angle) * r, 0.35, Math.sin(angle) * r * 0.7);
    tree.scale.y = 1 + (i % 4) * 0.25;
    root.add(tree);
  }

  // Gold dust drifting over the site
  const dustCount = 180;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 34;
    dustPos[i * 3 + 1] = Math.random() * 12;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: GOLD_LIGHT, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false })
  );
  scene.add(dust);

  // State driven from outside (scroll, intro, pointer)
  const state = { progress: 0, pointerX: 0, pointerY: 0, hovered: null, visible: true, dirty: true };
  const maxDist = Math.max(...buildList.map((b) => b.dist));
  const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);

  // Scroll drives the whole scene: the camera starts overhead, sweeps to a
  // three-quarter view, plots build outward from the centre, then towers rise.
  function placeCamera() {
    const p = state.progress;
    const angle = THREE.MathUtils.lerp(0.1, 1.1, p) + state.pointerX * 0.12;
    const radius = THREE.MathUtils.lerp(13, 20, p);
    const height = THREE.MathUtils.lerp(30, 10, p) + state.pointerY * 0.8;
    camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    camera.lookAt(0, THREE.MathUtils.lerp(0, 2.5, p), THREE.MathUtils.lerp(0, -4, p));
  }

  // Plot outlines are always visible. Scroll brings each plot to life in a ripple
  // from the centre, then buildings rise and the towers grow. Idle motion keeps
  // the site alive when the visitor is not scrolling.
  function updateBuild(t) {
    const p = state.progress;
    for (const { mesh, edges, dist, index } of buildList) {
      const start = 0.08 + (dist / maxDist) * 0.3;
      const built = clamp01((p - start) / 0.1);
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.4 + index * 0.45);
      const s = 0.6 + 0.4 * built;
      mesh.scale.setScalar(s);
      edges.scale.setScalar(s);
      if (state.hovered !== mesh.userData.id) {
        edges.material.opacity = (0.18 + 0.8 * built) * pulse;
      }
    }
    for (const b of buildings) {
      const rise = clamp01((p - b.start) / 0.12);
      b.group.scale.y = Math.max(0.001, rise);
    }
    const growth = Math.max(0.001, clamp01((p - 0.6) / 0.25));
    towers.forEach((tower) => { tower.scale.y = growth; });
    scan.position.z = (((t * 0.08) % 1) - 0.5) * (ROWS * STEP + 4);
    scan.material.opacity = 0.35 * (1 - Math.abs(scan.position.z) / ((ROWS * STEP + 4) / 2)) + 0.05;
  }

  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens need a wider lens so the whole masterplan stays in frame
    camera.fov = camera.aspect < 0.9 ? 48 : 32;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  resize();

  // Hover: raycast plots, report id and pointer position
  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    pointer.set(nx * 2 - 1, -(ny * 2 - 1));
    state.pointerX = pointer.x;
    state.pointerY = pointer.y;
    state.dirty = true;

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(plotMeshes, false)[0];
    const id = hit ? hit.object.userData.id : null;
    if (id !== state.hovered) {
      if (state.hovered) setPlotHighlight(state.hovered, false);
      if (id) setPlotHighlight(id, true);
      state.hovered = id;
    }
    if (onHover) onHover(id, event.clientX, event.clientY);
  }

  function onPointerLeave() {
    if (state.hovered) setPlotHighlight(state.hovered, false);
    state.hovered = null;
    state.pointerX = 0;
    state.pointerY = 0;
    state.dirty = true;
    if (onHover) onHover(null);
  }

  function setPlotHighlight(id, on) {
    const { mesh, edges } = plotById.get(id);
    mesh.material.color.setHex(on ? 0x4a3b12 : mesh.userData.baseFill);
    edges.material.opacity = on ? 1 : edges.material.opacity;
    state.dirty = true;
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);

  // Only render while the canvas is on screen
  const visibility = new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
  });
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
    setProgress(p) {
      state.progress = THREE.MathUtils.clamp(p, 0, 1);
    },
    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      renderer.dispose();
    },
  };
}
