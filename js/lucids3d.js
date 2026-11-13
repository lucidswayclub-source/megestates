import * as THREE from 'three';

// The Lucids Resort venture, modelled from its VMRDA layout plan: 115 numbered
// plots on 12 m roads, two public open spaces, the proposed resort in the
// south-west open space, and the planned compound wall and entrance arch.
// Plan coordinates are pixels on the layout-plan sheet (assets/lucids/layout-plan.png);
// scroll progress (0..1) drives the build and the camera.

const K = 0.06;
const OX = 560;
const OZ = 640;
const v2 = ([x, y]) => new THREE.Vector2((x - OX) * K, (y - OZ) * K);

// ---------- Plan geometry (sheet pixels) ----------
const roadC = (y) => 524 - 0.088 * (y - 100);
const ROAD_HALF = 24;
const roadE = (y) => roadC(y) + ROAD_HALF;
const roadW = (y) => roadC(y) - ROAD_HALF;
const eastEdge = (y) => 1112 - 0.105 * (y - 240);
const westEdge = (y) => 480 - 0.549 * (y - 32);
const TILT = 0.1;

// Point where a tilted cross-line (through x0, y0) meets the edge x = f(y)
function meet(y0, x0, f) {
  let x = f(y0);
  for (let i = 0; i < 5; i++) x = f(y0 + TILT * (x - x0));
  return [x, y0 + TILT * (x - x0)];
}
function band(top, bottom, x0, left, right) {
  return { tl: meet(top, x0, left), tr: meet(top, x0, right), bl: meet(bottom, x0, left), br: meet(bottom, x0, right) };
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// Split a band into equal cells, west to east
function cells(b, n) {
  return Array.from({ length: n }, (_, i) => [
    lerp2(b.tl, b.tr, i / n), lerp2(b.tl, b.tr, (i + 1) / n),
    lerp2(b.bl, b.br, (i + 1) / n), lerp2(b.bl, b.br, i / n),
  ]);
}
const span = (a, b) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));
const fixed = (x) => () => x;

const MORTGAGED = new Set([...span(66, 74), ...span(79, 87)]);
const PLOTS = [];
function addRow(b, numbers, kind = 'plot') {
  cells(b, numbers.length).forEach((quad, i) => {
    const n = numbers[i];
    PLOTS.push({ n, quad, kind: kind === 'plot' && MORTGAGED.has(n) ? 'mortgaged' : kind });
  });
}

// East of the main road: four blocks of two rows, numbered in a snake
[[235, 386, span(77, 87), span(76, 66)], [431, 582, span(55, 65), span(54, 44)],
  [627, 778, span(34, 43), span(33, 24)], [823, 974, span(14, 23), span(13, 4)]]
  .forEach(([top, bottom, upper, lower]) => {
    const mid = (top + bottom) / 2;
    addRow(band(top, mid, 530, roadE, eastEdge), upper);
    addRow(band(mid, bottom, 530, roadE, eastEdge), lower);
  });
addRow(band(50, 118, 530, roadE, fixed(642)), [89]);
addRow(band(118, 185, 530, roadE, fixed(634)), [88]);
addRow(band(1022, 1104, 530, fixed(890), fixed(1032)), [3, 2, 1]);

// West of the main road: amenity plots in the narrow north, then 103–115
addRow(band(60, 112, 440, westEdge, roadW), [90], 'amenity');
addRow(band(112, 165, 440, westEdge, roadW), [91], 'amenity');
addRow(band(205, 280, 440, westEdge, roadW), [93, 92], 'amenity');
addRow(band(280, 355, 440, westEdge, roadW), [94, 95], 'amenity');
addRow(band(400, 475, 440, westEdge, roadW), [98, 97, 96], 'amenity');
addRow(band(475, 550, 440, westEdge, roadW), [99, 100, 101, 102], 'amenity');
addRow(band(595, 667, 440, westEdge, roadW), [107, 106, 105, 104, 103]);
addRow(band(667, 740, 440, westEdge, roadW), [108, 109, 110, 111, 112, 113]);
addRow(band(795, 862, 440, fixed(355), roadW), [114]);
addRow(band(862, 930, 440, fixed(355), roadW), [115]);

const quadOf = (b) => [b.tl, b.tr, b.br, b.bl];
const ROADS = [
  ...[[190, 235], [386, 431], [582, 627], [778, 823], [974, 1019]].map(([t, b]) => quadOf(band(t, b, 530, roadE, eastEdge))),
  ...[[165, 205], [355, 400], [550, 595], [740, 785]].map(([t, b]) => quadOf(band(t, b, 440, westEdge, roadW))),
];
const MAIN_ROAD = [[roadW(30), 30], [roadE(30), 30], [roadE(1320), 1320], [roadW(1320), 1320]];
const PASSAGE = [[468, 32], [480, 32], [42, 830], [30, 830]];

// Site boundary; the main road leaves through the south between M_W and M_E
const A = [468, 30]; const B = [645, 58]; const C = [632, 188]; const D = [1112, 240];
const E = [1030, 1020]; const G = [1040, 1162]; const KK = [30, 830];
const M_E = [roadE(1016), 1012 + 0.252 * (roadE(1016) - 445)];
const M_W = [roadW(1002), 830 + 0.44 * (roadW(1002) - 30)];
const BOUNDARY = [A, B, C, D, E, G, M_E, M_W, KK];
const WALLS = [[KK, A], [A, B], [B, C], [C, D], [D, E], [E, G], [G, M_E], [M_W, KK]];

const southLine = (x) => 1012 + 0.252 * (x - 445);
const r0Bottom = (x) => 1019 + TILT * (x - 530);
const SE_OPEN = [[632, r0Bottom(632)], [888, r0Bottom(888)], [888, southLine(888)], [632, southLine(632)]];
const SW_TOP = meet(785, 440, westEdge);
const SW_OPEN = [SW_TOP, [355, 776.5], [355, 921.5], [roadW(929), 929], M_W, KK];

// ---------- Themes ----------
const THEMES = {
  light: {
    bg: 0xf3f2ef, outside: 0xe7e1d4, site: 0xdcc39b, road: 0x4f4c48, passage: 0xcfc4b0,
    plot: [0xeed9b0, 0xffffff], amenity: [0xe3ddcf, 0xa87917], mortgaged: [0xd9c7a3, 0xb3a68d],
    lawn: 0x8db26a, wall: 0xfbf8f2, stone: 0xe9e1d2, gold: 0xb8892a, goldEmit: 0x000000,
    white: 0xffffff, glass: 0x8fb3c2, glassEmit: 0x000000, wood: 0xb57d4b, water: 0x3cc2d6, waterEmit: 0x000000,
    court: 0x2f6e5a, turf: 0x6fae4c, net: 0x1f3d2e, tree: 0x6d9b4f, trunk: 0x8a6a48, lamp: 0x3d3a36, bulb: 0xf3f2ef,
    hemi: [0xffffff, 0xb9ae99, 1.2], key: [0xfff4e0, 2.1], rim: [0xf0d47a, 0.45],
    highlight: 0xf0d47a, line: [0xa87917, 0.9], dust: [0xa87917, 0.25], glow: 0,
  },
  dark: {
    bg: 0x0a0a0a, outside: 0x0d0c0a, site: 0x1a1610, road: 0x1d1d20, passage: 0x16140f,
    plot: [0x231d13, 0xd4af37], amenity: [0x15130f, 0x8a6d1f], mortgaged: [0x14120e, 0x5c4c26],
    lawn: 0x1b2717, wall: 0x2b2720, stone: 0x302b23, gold: 0xd4af37, goldEmit: 0x5a4512,
    white: 0x3a362f, glass: 0x2a2116, glassEmit: 0xffa94d, wood: 0x5a3c22, water: 0x1597ad, waterEmit: 0x0b4f5c,
    court: 0x163a2f, turf: 0x24461d, net: 0x6b8f62, tree: 0x223020, trunk: 0x2c2218, lamp: 0x1a1a1a, bulb: 0xffd27a,
    hemi: [0xf7f5ef, 0x050505, 0.5], key: [0xf0d47a, 1.6], rim: [0xd4af37, 0.9],
    highlight: 0x5a4512, line: [0xf0d47a, 0.95], dust: [0xf0d47a, 0.55], glow: 1,
  },
};

// ---------- Helpers ----------
function shapeMesh(points, material, y = 0) {
  const shape = new THREE.Shape(points.map(v2).map((p) => new THREE.Vector2(p.x, -p.y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  return mesh;
}
const centroid = (pts) => pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]);
const smooth = (t) => t * t * (3 - 2 * t);

// A plot as a mesh centred on its centroid so it can scale in place
function plotMesh(quad, material, edgeMaterial) {
  const c = v2(centroid(quad));
  const inset = quad.map((p) => lerp2(p, centroid(quad), 0.06));
  const shape = new THREE.Shape(inset.map(v2).map((p) => new THREE.Vector2(p.x - c.x, -(p.y - c.y))));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial);
  const group = new THREE.Group();
  group.position.set(c.x, 0.03, c.y);
  group.add(mesh, edges);
  return { group, mesh, edges };
}

function signTexture(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#a87917');
  grad.addColorStop(0.5, '#f0d47a');
  grad.addColorStop(1, '#a87917');
  ctx.fillStyle = '#16130e';
  ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 1004, 140);
  ctx.fillStyle = grad;
  ctx.textAlign = 'center';
  ctx.font = '600 64px "Inter Tight", Inter, sans-serif';
  ctx.fillText(text, 512, sub ? 88 : 102);
  if (sub) {
    ctx.font = '500 26px Inter, sans-serif';
    ctx.fillText(sub, 512, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Camera shots, matched to the chapters of the venture page
const SHOTS = [
  { p: 0, pos: [3, 104, 34], look: [1, 0, 0] },
  { p: 0.25, pos: [-12.6, 3.6, 41], look: [-10.4, 2.4, 20] },
  { p: 0.5, pos: [44, 42, 50], look: [2, 0, 2] },
  { p: 0.75, pos: [-5, 16, 33], look: [-21.5, 0.4, 15] },
  { p: 1, pos: [-46, 36, 46], look: [-4, 0, 4] },
];

// In a framed canvas with no cards over it, the close-ups sit centred
const SHOTS_CENTRED = SHOTS.map((shot, i) => (
  i === 1 ? { ...shot, pos: [-9.4, 3.8, 42], look: [-7.2, 2.2, 21] }
    : i === 3 ? { ...shot, pos: [-4, 17, 34], look: [-18, 0.4, 14] } : shot));

/**
 * Returns null when WebGL is unavailable so the page can fall back gracefully.
 * onHover(info, clientX, clientY) receives { title, meta } or null.
 */
export function createLucids(canvas, { onHover, theme = 'light', fixedSize = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return null;
  }
  const small = window.innerWidth < 768;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 115, 250);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);

  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.position.set(30, 50, 25);
  const rim = new THREE.DirectionalLight();
  rim.position.set(-40, 18, -30);
  scene.add(hemi, key, rim);

  const mats = {};
  const mat = (name, opts = {}) => (mats[name] = new THREE.MeshStandardMaterial({ roughness: 0.9, ...opts }));
  const pickables = [];
  const info = (obj, title, meta) => { obj.userData.info = { title, meta }; pickables.push(obj); return obj; };

  // ---------- Ground, site, roads, open spaces ----------
  const outside = new THREE.Mesh(new THREE.CircleGeometry(220, 64), mat('outside', { roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.04;
  scene.add(outside);

  const site = shapeMesh(BOUNDARY, mat('site', { roughness: 1 }), -0.02);
  scene.add(site);

  const roadGroup = new THREE.Group();
  const roadMat = mat('road', { roughness: 0.75 });
  [...ROADS, MAIN_ROAD].forEach((q) => roadGroup.add(shapeMesh(q, roadMat, 0)));
  roadGroup.add(shapeMesh(PASSAGE, mat('passage', { roughness: 1 }), 0.005));
  // Centre dashes on the main road
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  for (let y = 60; y < 1300; y += 34) {
    const p = v2([roadC(y), y]);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.8), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = Math.atan(0.088);
    dash.position.set(p.x, 0.02, p.y);
    roadGroup.add(dash);
  }
  scene.add(roadGroup);

  const lawnMat = mat('lawn', { roughness: 1 });
  const swLawn = info(shapeMesh(SW_OPEN, lawnMat, 0.01), 'Public open space', '2,278.57 sq. m per layout plan · Proposed resort site');
  const seLawn = info(shapeMesh(SE_OPEN, lawnMat, 0.01), 'Public open space', '2,166.36 sq. m per layout plan');
  scene.add(swLawn, seLawn);

  // The layout-plan sheet lies on the ground first; the venture rises out of it.
  // Its ink becomes the alpha channel so the lines can take the theme colour.
  const planMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(1160 * K, 1300 * K), planMat);
  plan.rotation.x = -Math.PI / 2;
  plan.position.set((580 - OX) * K, 0.06, (650 - OZ) * K);
  plan.renderOrder = 2;
  scene.add(plan);
  const sheet = new Image();
  sheet.onload = () => {
    const c = document.createElement('canvas');
    c.width = sheet.width;
    c.height = sheet.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(sheet, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const ink = 255 - (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.min(255, ink * 1.6);
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    planMat.map = tex;
    planMat.needsUpdate = true;
  };
  sheet.src = new URL('../assets/lucids/layout-plan.png', import.meta.url).href;

  // Survey outline drawn first
  const outlinePts = [...BOUNDARY, BOUNDARY[0]].map((p) => { const q = v2(p); return new THREE.Vector3(q.x, 0.08, q.y); });
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
  const outlineMat = new THREE.LineBasicMaterial({ transparent: true });
  const outline = new THREE.Line(outlineGeo, outlineMat);
  scene.add(outline);
  const outlineLen = outlinePts.length;

  // ---------- Plots ----------
  const plotEntries = PLOTS.map((plot) => {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const edgeMaterial = new THREE.LineBasicMaterial({ transparent: true });
    const { group, mesh, edges } = plotMesh(plot.quad, material, edgeMaterial);
    const title = plot.kind === 'amenity' ? `Amenity ${plot.n}` : `Plot ${plot.n}`;
    const meta = plot.kind === 'amenity' ? 'Amenity plot per layout plan'
      : plot.kind === 'mortgaged' ? 'Mortgaged area per layout plan · 12 m road'
        : 'Residential plot · 12 m road';
    info(mesh, title, meta);
    mesh.userData.plot = plot.n;
    scene.add(group);
    const c = centroid(plot.quad);
    return { plot, group, mesh, edges, delay: 1 - (c[1] - 30) / 1100 };
  });
  const plotByMesh = new Map(plotEntries.map((e) => [e.mesh, e]));

  // ---------- Compound wall (planned) ----------
  const wallMat = mat('wall', { roughness: 0.8 });
  const wallH = 0.42;
  let wallTotal = 0;
  const wallSegs = WALLS.map(([a, b]) => {
    const pa = v2(a); const pb = v2(b);
    const len = pa.distanceTo(pb);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.14), wallMat);
    seg.geometry.translate(0, wallH / 2, 0);
    seg.position.set((pa.x + pb.x) / 2, 0, (pa.y + pb.y) / 2);
    seg.rotation.y = -Math.atan2(pb.y - pa.y, pb.x - pa.x);
    info(seg, 'Compound wall', 'Planned · construction starting soon');
    scene.add(seg);
    const entry = { seg, start: wallTotal, len, pa, pb };
    wallTotal += len;
    return entry;
  });
  // Pillars along the wall
  const pillarGeo = new THREE.BoxGeometry(0.24, wallH + 0.12, 0.24);
  pillarGeo.translate(0, (wallH + 0.12) / 2, 0);
  const pillarSpots = [];
  wallSegs.forEach((w) => {
    const n = Math.max(1, Math.round(w.len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pillarSpots.push({ x: w.pa.x + (w.pb.x - w.pa.x) * t, z: w.pa.y + (w.pb.y - w.pa.y) * t, at: (w.start + w.len * t) / wallTotal });
    }
  });
  const pillars = new THREE.InstancedMesh(pillarGeo, wallMat, pillarSpots.length);
  scene.add(pillars);

  // ---------- Entrance arch (planned) ----------
  const arch = new THREE.Group();
  const gate = v2([(M_E[0] + M_W[0]) / 2, (M_E[1] + M_W[1]) / 2]);
  arch.position.set(gate.x, 0, gate.y + 0.2);
  arch.rotation.y = -Math.atan(0.088); // square to the main road
  const stoneMat = mat('stone', { roughness: 0.7 });
  const goldMat = mat('gold', { metalness: 0.85, roughness: 0.3 });
  const half = (ROAD_HALF * K) + 0.55;
  const archPillars = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.x = side * half;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 3.6, 0.85), stoneMat);
    body.position.y = 1.8;
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.95), goldMat);
    band1.position.y = 3.62;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 1.05), stoneMat);
    cap.position.y = 3.8;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat('bulbArch', { emissive: 0x000000 }));
    lamp.position.y = 4.05;
    // Low flared walls that meet the compound wall
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.4), stoneMat);
    wing.position.set(side * 1.15, 0.55, 0);
    g.add(body, band1, cap, lamp, wing);
    arch.add(g);
    return g;
  });
  const beam = new THREE.Group();
  const beamBody = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.85, 0.85, 0.6), stoneMat);
  const beamTrim = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1.05, 0.1, 0.7), goldMat);
  beamTrim.position.y = 0.47;
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture('THE LUCIDS RESORT', 'A MEGESTATES VENTURE'), roughness: 0.5, emissiveMap: null });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.4, (half * 2 - 0.4) * 0.156), signMat);
  sign.position.set(0, 0, 0.31);
  const signBack = sign.clone();
  signBack.rotation.y = Math.PI;
  signBack.position.z = -0.31;
  beam.add(beamBody, beamTrim, sign, signBack);
  beam.position.y = 3.3;
  arch.add(beam);
  info(arch, 'Entrance arch', 'Planned · construction starting soon');
  scene.add(arch);

  // ---------- Avenue trees and street lights ----------
  const treeSpots = [];
  const lampSpots = [];
  const addAlong = (a, b, step, offset, list, extra = {}) => {
    const pa = v2(a); const pb = v2(b);
    const len = pa.distanceTo(pb);
    const dir = pb.clone().sub(pa).normalize();
    const nrm = new THREE.Vector2(-dir.y, dir.x);
    for (let d = step / 2; d < len; d += step) {
      [-1, 1].forEach((s) => {
        const p = pa.clone().addScaledVector(dir, d).addScaledVector(nrm, s * offset);
        list.push({ x: p.x, z: p.y, y0: (p.y + 40) / 80, ...extra });
      });
    }
  };
  addAlong([roadC(40), 40], [roadC(1000), 1000], 2.4, ROAD_HALF * K + 0.25, treeSpots);
  addAlong([roadC(1030), 1030], [roadC(1300), 1300], 2.4, ROAD_HALF * K + 0.25, treeSpots);
  addAlong([roadC(60), 60], [roadC(1000), 1000], 6, ROAD_HALF * K + 0.15, lampSpots);
  ROADS.forEach((q) => {
    const a = lerp2(q[0], q[3], 0.5); const b = lerp2(q[1], q[2], 0.5);
    addAlong(a, b, 3.2, 1.6, treeSpots);
    addAlong(a, b, 7, 1.5, lampSpots);
  });
  // Trees across the countryside around the site
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const outsideTrees = [];
  for (let i = 0; i < 520; i++) {
    const ang = rand() * Math.PI * 2;
    const r = 42 + rand() * 70;
    outsideTrees.push({ x: Math.cos(ang) * r * 1.1, z: Math.sin(ang) * r, s: 0.8 + rand() * 1.4 });
  }

  const crownGeo = new THREE.IcosahedronGeometry(0.42, 1);
  crownGeo.translate(0, 0.95, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 5);
  trunkGeo.translate(0, 0.3, 0);
  const treeMat = mat('tree', { roughness: 1, flatShading: true });
  const trunkMat = mat('trunk', { roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, treeMat, treeSpots.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const forest = new THREE.InstancedMesh(crownGeo, treeMat, outsideTrees.length);
  const dummy = new THREE.Object3D();
  outsideTrees.forEach((t, i) => {
    dummy.position.set(t.x, -0.2, t.z);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
  });
  scene.add(crowns, trunks, forest);

  const poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.3, 5);
  poleGeo.translate(0, 0.65, 0);
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);
  bulbGeo.translate(0, 1.32, 0);
  const poles = new THREE.InstancedMesh(poleGeo, mat('lamp', { roughness: 0.6 }), lampSpots.length);
  const bulbMat = new THREE.MeshBasicMaterial();
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  scene.add(poles, bulbs);

  // ---------- The resort (proposed) ----------
  const placeAt = (obj, px, py, rot = 0) => {
    const p = v2([px, py]);
    obj.position.set(p.x, 0.02, p.y);
    obj.rotation.y = -Math.atan(TILT) + rot;
    return obj;
  };
  const whiteMat = mat('white', { roughness: 0.6 });
  const glassMat = mat('glass', { roughness: 0.15, metalness: 0.3 });
  const woodMat = mat('wood', { roughness: 0.8 });

  // Clubhouse: glass ground floor, louvred upper floor, stone feature wall, pergola terrace
  const club = new THREE.Group();
  const cw = 5.4; const cd = 2.6;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.6, 0.12, cd + 1.4), stoneMat);
  slab.position.set(0, 0.06, 0.4);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.95, cd), glassMat);
  ground.position.y = 0.6;
  const groundRoof = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.2, 0.12, cd + 0.2), whiteMat);
  groundRoof.position.y = 1.13;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.62, 0.95, cd), whiteMat);
  upper.position.set(-cw * 0.19, 1.66, 0);
  const featureWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, cd * 0.9), stoneMat);
  featureWall.position.set(cw * 0.14, 1.66, 0);
  club.add(slab, ground, groundRoof, upper, featureWall);
  for (let i = 0; i < 11; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.08), woodMat);
    slat.position.set(-cw * 0.19 - cw * 0.28 + i * (cw * 0.56 / 10), 1.66, cd / 2 + 0.05);
    club.add(slat);
  }
  const pergolaX = cw * 0.33;
  for (const [x, z] of [[-0.75, -1.1], [0.75, -1.1], [-0.75, 1.1], [0.75, 1.1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), mats.lamp);
    post.position.set(pergolaX + x, 1.64, z);
    club.add(post);
  }
  for (let i = 0; i < 8; i++) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.06), woodMat);
    rafter.position.set(pergolaX, 2.1, -1.1 + i * (2.2 / 7));
    club.add(rafter);
  }
  const clubSign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.2), stoneMat);
  clubSign.position.set(-cw * 0.42, 0.25, cd / 2 + 1.05);
  const clubSignFace = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.27), new THREE.MeshBasicMaterial({ map: signTexture('THE LUCIDS RESORT'), transparent: true }));
  clubSignFace.position.set(-cw * 0.42, 0.25, cd / 2 + 1.16);
  club.add(clubSign, clubSignFace);
  placeAt(club, 300, 822);
  info(club, 'Clubhouse', 'Proposed · two floors with a terrace');
  scene.add(club);

  // Pool with deck and loungers
  const pool = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 2.4), stoneMat);
  deck.position.y = 0.05;
  const waterMat = mat('water', { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.5), waterMat);
  water.position.y = 0.09;
  pool.add(deck, water);
  for (let i = 0; i < 4; i++) {
    const lounger = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.55), whiteMat);
    lounger.position.set(-1.3 + i * 0.85, 0.15, -1.0);
    pool.add(lounger);
  }
  placeAt(pool, 296, 888);
  info(pool, 'Swimming pool', 'Proposed · public-space use subject to approval');
  scene.add(pool);

  // Courts: box cricket with a net cage, and a badminton court
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  function court(w, d, surface, lines) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), surface);
    base.position.y = 0.03;
    g.add(base);
    const pts = [];
    lines.forEach(([x1, z1, x2, z2]) => pts.push(x1 * w / 2, 0.07, z1 * d / 2, x2 * w / 2, 0.07, z2 * d / 2));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, lineMat));
    return g;
  }
  const turfMat = mat('turf', { roughness: 1 });
  const cricket = court(5.6, 2.6, turfMat, [[-0.6, 0, 0.6, 0]]);
  const pitch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.065, 0.35), mat('pitch', { color: 0xd8c48f, roughness: 1 }));
  pitch.position.y = 0.035;
  const cage = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.5, 2.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  cage.position.y = 0.78;
  const cageEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cage.geometry), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }));
  cageEdges.position.y = 0.78;
  cricket.add(pitch, cage, cageEdges);
  placeAt(cricket, 192, 850);
  info(cricket, 'Box cricket', 'Proposed · public-space use subject to approval');
  scene.add(cricket);

  const courtMat = mat('court', { roughness: 0.9 });
  const badminton = court(3.2, 1.5, courtMat, [
    [-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1], [0, -1, 0, 1],
    [-0.82, -1, -0.82, 1], [0.82, -1, 0.82, 1], [-1, 0, -0.25, 0], [0.25, 0, 1, 0],
  ]);
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  netMesh.rotation.y = Math.PI / 2;
  netMesh.position.y = 0.26;
  badminton.add(netMesh);
  placeAt(badminton, 104, 812);
  info(badminton, 'Badminton court', 'Proposed · public-space use subject to approval');
  scene.add(badminton);

  // Party garden gazebo with string lights
  const gazebo = new THREE.Group();
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), woodMat);
    post.position.set(x, 0.4, z);
    gazebo.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.5, 4), woodMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.05;
  gazebo.add(roof);
  const stringGeo = new THREE.BufferGeometry();
  const stringPts = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    stringPts.push(0.6 + t * 2.4, 0.75 - Math.sin(t * Math.PI * 3) * 0.12, 0.6 - t * 0.4);
  }
  stringGeo.setAttribute('position', new THREE.Float32BufferAttribute(stringPts, 3));
  const stringLights = new THREE.Points(stringGeo, new THREE.PointsMaterial({ size: 0.12, color: 0xffd27a, transparent: true }));
  gazebo.add(stringLights);
  placeAt(gazebo, 382, 958);
  info(gazebo, 'Party garden', 'Proposed · public-space use subject to approval');
  scene.add(gazebo);

  const resort = [
    { obj: club, start: 0.56, end: 0.66 },
    { obj: pool, start: 0.6, end: 0.68 },
    { obj: cricket, start: 0.63, end: 0.71 },
    { obj: badminton, start: 0.66, end: 0.73 },
    { obj: gazebo, start: 0.68, end: 0.75 },
  ];

  // Dust in the air
  const dustPos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 80;
    dustPos[i * 3 + 1] = rand() * 16;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 80;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.09, transparent: true, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---------- Theme ----------
  const state = { paused: false, progress: 0, eased: 0, pointerX: 0, pointerY: 0, hovered: null, visible: true, theme: THEMES.light };

  function colorPlot(entry, hovered) {
    const T = state.theme;
    const [fill, edge] = T[entry.plot.kind];
    entry.mesh.material.color.setHex(hovered ? T.highlight : fill);
    entry.edges.material.color.setHex(hovered ? T.line[0] : edge);
  }

  function applyTheme(name) {
    const T = THEMES[name] || THEMES.light;
    state.theme = T;
    scene.fog.color.setHex(T.bg);
    const set = (m, c) => mats[m] && mats[m].color.setHex(c);
    set('outside', T.outside); set('site', T.site); set('road', T.road); set('passage', T.passage);
    set('lawn', T.lawn); set('wall', T.wall); set('stone', T.stone); set('gold', T.gold);
    set('white', T.white); set('glass', T.glass); set('wood', T.wood); set('water', T.water);
    set('court', T.court); set('turf', T.turf); set('tree', T.tree); set('trunk', T.trunk); set('lamp', T.lamp);
    mats.gold.emissive.setHex(T.goldEmit);
    mats.glass.emissive.setHex(T.glassEmit);
    mats.glass.emissiveIntensity = T.glow ? 0.9 : 0;
    mats.water.emissive.setHex(T.waterEmit);
    mats.bulbArch.color.setHex(T.bulb);
    mats.bulbArch.emissive.setHex(T.glow ? 0xffd27a : 0x000000);
    signMat.emissive.setHex(T.glow ? 0x332611 : 0x000000);
    bulbMat.color.setHex(T.bulb);
    stringLights.material.opacity = T.glow ? 1 : 0.35;
    cageEdges.material.color.setHex(T.net);
    cage.material.color.setHex(T.net);
    hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
    key.color.setHex(T.key[0]); key.intensity = T.key[1];
    rim.color.setHex(T.rim[0]); rim.intensity = T.rim[1];
    outlineMat.color.setHex(T.line[0]);
    planMat.color.setHex(T.line[0]);
    dustMat.color.setHex(T.dust[0]);
    dustMat.opacity = T.dust[1];
    plotEntries.forEach((e) => colorPlot(e, state.hovered === e.mesh));
  }
  applyTheme(theme);

  // ---------- Build stages ----------
  const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
  const stage = (p, a, b) => clamp01((p - a) / (b - a));

  function updateBuild(t) {
    const p = state.eased;
    // Survey outline traces the boundary
    const intro = smooth(clamp01((t - 0.3) / 2.4));
    const traced = Math.max(intro, stage(p, 0.0, 0.1));
    planMat.opacity = planMat.map ? intro * (0.9 - 0.5 * smooth(stage(p, 0.08, 0.24)) - 0.25 * smooth(stage(p, 0.3, 0.5))) : 0;
    outline.geometry.setDrawRange(0, Math.max(2, Math.ceil(outlineLen * Math.max(traced, 0.02))));
    outlineMat.opacity = 0.25 + 0.75 * (1 - stage(p, 0.3, 0.45)) * (0.8 + 0.2 * Math.sin(t * 2));

    // Compound wall rises around the perimeter
    const wallP = stage(p, 0.05, 0.22);
    wallSegs.forEach((w) => {
      const local = clamp01((wallP * wallTotal - w.start) / w.len);
      w.seg.scale.set(Math.max(0.001, local), Math.max(0.001, smooth(clamp01(local * 1.5))), 1);
      // Scale the length from the segment start
      const dx = (w.pb.x - w.pa.x) / 2; const dz = (w.pb.y - w.pa.y) / 2;
      w.seg.position.set(w.pa.x + dx * local, 0, w.pa.y + dz * local);
    });
    pillarSpots.forEach((s, i) => {
      const k = smooth(clamp01((wallP - s.at) * 12 + 0.2));
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, Math.max(0.001, k), 1);
      dummy.updateMatrix();
      pillars.setMatrixAt(i, dummy.matrix);
    });
    pillars.instanceMatrix.needsUpdate = true;

    // Entrance arch: pillars rise, then the sign beam settles on top
    const archP = stage(p, 0.12, 0.2);
    archPillars.forEach((g) => { g.scale.y = Math.max(0.001, smooth(archP)); });
    const beamP = smooth(stage(p, 0.18, 0.235));
    beam.position.y = 3.3 + (1 - beamP) * 6;
    beam.visible = beamP > 0.001;
    beam.scale.setScalar(0.9 + 0.1 * beamP);

    // Roads and open spaces settle in, then plots appear from the gate northwards
    const roadP = smooth(stage(p, 0.15, 0.23));
    roadGroup.position.y = -0.3 * (1 - roadP);
    roadGroup.visible = roadP > 0.001;
    swLawn.visible = seLawn.visible = roadP > 0.001;
    plotEntries.forEach((e) => {
      const k = smooth(stage(p, 0.28 + e.delay * 0.16, 0.34 + e.delay * 0.16));
      e.group.scale.setScalar(Math.max(0.001, k));
      e.group.position.y = 0.03 + (1 - k) * 0.6;
      if (state.hovered !== e.mesh) e.edges.material.opacity = (0.35 + 0.65 * k) * (0.85 + 0.15 * Math.sin(t * 1.3 + e.plot.n * 0.4));
    });

    // Avenue trees and street lights pop up along the roads
    const treeP = stage(p, 0.4, 0.56);
    treeSpots.forEach((s, i) => {
      const k = smooth(clamp01((treeP - (1 - s.y0) * 0.6) * 3));
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(Math.max(0.001, k) * (0.85 + (i % 3) * 0.12));
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      trunks.setMatrixAt(i, dummy.matrix);
    });
    crowns.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    lampSpots.forEach((s, i) => {
      const k = smooth(clamp01((treeP - (1 - s.y0) * 0.6) * 3));
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, Math.max(0.001, k), 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      bulbs.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;

    // The resort rises piece by piece
    resort.forEach(({ obj, start, end }) => {
      const k = smooth(stage(p, start, end));
      obj.scale.set(1, Math.max(0.001, k), 1);
      obj.visible = k > 0.001;
    });
    water.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.2);
  }

  // ---------- Camera ----------
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  function placeCamera(t) {
    const p = state.eased;
    // Full-screen landscape leaves room for the text cards; portrait and framed views centre the subject
    const portrait = camera.aspect < 0.9;
    const shots = fixedSize && !portrait ? SHOTS : SHOTS_CENTRED;
    let i = 0;
    while (i < shots.length - 2 && p > shots[i + 1].p) i++;
    const a = shots[i]; const b = shots[i + 1];
    const k = smooth(clamp01((p - a.p) / (b.p - a.p)));
    tmpPos.fromArray(a.pos).lerp(new THREE.Vector3().fromArray(b.pos), k);
    tmpLook.fromArray(a.look).lerp(new THREE.Vector3().fromArray(b.look), k);
    // On phones the cards sit low, so aim below the subject to lift it up the screen
    if (portrait && fixedSize) tmpLook.y -= 3 * Math.min(1, p * 4);
    // Lift the camera through the middle of long moves so it never dips into the scene
    tmpPos.y += Math.sin(k * Math.PI) * (i === 0 ? 0 : 10);
    // Gentle drift and pointer parallax keep the view alive between scrolls
    tmpPos.x += Math.sin(t * 0.15) * 0.6 + state.pointerX * 1.6;
    tmpPos.y += state.pointerY * 0.8;
    camera.position.copy(tmpPos);
    camera.lookAt(tmpLook);
  }

  function resize() {
    const w = fixedSize ? window.innerWidth : canvas.parentElement.clientWidth;
    const h = fixedSize ? window.innerHeight : canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens need a wider lens so the layout stays in frame
    camera.fov = camera.aspect < 0.8 ? 58 : camera.aspect < 1.2 ? 46 : 36;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(fixedSize ? document.documentElement : canvas.parentElement);
  resize();

  // ---------- Hover ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  function findInfo(obj) {
    while (obj && !obj.userData.info) obj = obj.parent;
    return obj;
  }
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true).filter((h) => h.object.visible);
    return hits.length ? findInfo(hits[0].object) : null;
  }
  function setHovered(obj) {
    if (obj === state.hovered) return;
    const prev = plotByMesh.get(state.hovered);
    state.hovered = obj;
    if (prev) colorPlot(prev, false);
    const next = plotByMesh.get(obj);
    if (next) { colorPlot(next, true); next.edges.material.opacity = 1; }
  }
  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const obj = pick(event.clientX, event.clientY);
    setHovered(obj);
    canvas.style.cursor = obj ? 'pointer' : '';
    if (onHover) onHover(obj ? obj.userData.info : null, event.clientX, event.clientY);
  }
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointerleave', () => {
    setHovered(null);
    state.pointerX = 0;
    state.pointerY = 0;
    if (onHover) onHover(null);
  });

  // Only render while the canvas is on screen
  const visibility = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; });
  visibility.observe(canvas);

  const clock = new THREE.Clock();
  let frame = 0;
  let last = 0;
  function animate() {
    frame = requestAnimationFrame(animate);
    if (!state.visible || state.paused) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last);
    last = t;
    // Ease towards the scroll position so wheel steps glide
    state.eased += (state.progress - state.eased) * (1 - Math.exp(-dt * 5));
    dust.position.y = Math.sin(t * 0.3) * 0.3;
    dust.rotation.y = t * 0.015;
    updateBuild(t);
    placeCamera(t);
    renderer.render(scene, camera);
  }
  animate();

  return {
    setProgress(p, { instant = false } = {}) {
      state.progress = clamp01(p);
      if (instant) state.eased = state.progress;
    },
    setTheme: applyTheme,
    setPaused(v) { state.paused = v; },
    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      renderer.dispose();
    },
  };
}

