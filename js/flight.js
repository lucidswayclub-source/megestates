// The flight: one continuous, scroll-driven "drone" shot from orbit onto The
// Lucids Resort. Real satellite imagery (Esri World Imagery through MapLibre)
// carries the camera down through generated cloud decks onto the venture's
// coordinates. The camera then settles into the exact pose of the daytime
// aerial render (calibrated against the satellite roads) and keeps dollying
// in at a steady rate while the render dissolves in over the same ground, so
// the real site turns into the planned one without a cut. The cursor steers
// the camera like a gimbal; without a pointer it hovers with a gentle drift.
//
// Built to stay smooth on modest phones:
//  * every per-frame change is a transform or an opacity on its own layer
//    (no animated filters, masks, blurs or blend modes), written only when
//    the value actually changes;
//  * the colour grade on the satellite is done in the map's own shader;
//  * satellite tiles along the camera path are prefetched in flight order;
//  * the camera's speed is capped so a hard fling can't outrun the tiles;
//  * the map renders at a capped pixel ratio, and a lite mode drops extras
//    on devices that can't hold the frame rate.

const SITE = [83.3764508, 18.0137479]; // lng, lat (from the resort page's map)
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Handoff pose: where the satellite view lines up with aerial-day.webp.
// Calibrated at a 1600x900 viewport with the render drawn at RENDER_SCALE
// around the screen centre; other viewports shift the zoom by the change in
// the render's cover scale so both stay locked together.
const HANDOFF = { center: [83.37545, 18.0139], zoom: 17.9, pitch: 55, bearing: 3 };
const RENDER_SCALE = 0.64;
const START_OFFSET = [-3.0, -1.5]; // where the camera starts relative to the site, in degrees

// Scroll timeline (0..1 through the flight section)
const T_DESCENT = [0.03, 0.6]; // orbit to low altitude, rotating into the handoff heading
const T_DOLLY = [0.6, 0.95]; // one steady dolly in, through the dissolve and on toward the resort
const T_SOFT = [0.665, 0.74]; // satellite becomes a soft, satellite-look render, under the low haze
const T_RESOLVE = [0.72, 0.81]; // ...which resolves into the sharp render as the camera closes in
const T_DISSOLVE = T_SOFT;
const DOLLY_FROM = -1.25; // zoom relative to the handoff pose at the start of the dolly
const DOLLY_TO = 1.05; // ...and at its end (past the render's full-frame point)
const MAX_SPEED = 0.7; // flight progress per second: a fast fling still takes ~1.4 s, so tiles keep up

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (v, [a, b]) => clamp01((v - a) / (b - a));
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOut = (t) => 1 - (1 - t) ** 2;
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const q = (v, step) => Math.round(v / step) * step; // quantise so tiny changes don't trigger writes

// Write a style only when it changes: avoids needless style and paint work
const written = new WeakMap();
function put(el, prop, value) {
  if (!el) return; // a missing element must never stop the frame
  let cache = written.get(el);
  if (!cache) { cache = {}; written.set(el, cache); }
  if (cache[prop] === value) return;
  cache[prop] = value;
  el.style[prop] = value;
}

// ---------- Cloud textures (tileable fractal noise, drawn once) ----------
function cloudTexture(size, seed, threshold, softness) {
  const rand = (i) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const field = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0, cells = 4; o < 5; o += 1, cells *= 2) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rand(i + o * 9973);
    const step = size / cells;
    for (let y = 0; y < size; y += 1) {
      const gy = y / step;
      const y0 = Math.floor(gy) % cells;
      const y1 = (y0 + 1) % cells;
      const fy = smooth(gy - Math.floor(gy));
      for (let x = 0; x < size; x += 1) {
        const gx = x / step;
        const x0 = Math.floor(gx) % cells;
        const x1 = (x0 + 1) % cells;
        const fx = smooth(gx - Math.floor(gx));
        const top = lerp(grid[y0 * cells + x0], grid[y0 * cells + x1], fx);
        const bottom = lerp(grid[y1 * cells + x0], grid[y1 * cells + x1], fx);
        field[y * size + x] += lerp(top, bottom, fy) * amp;
      }
    }
    norm += amp;
    amp *= 0.52;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i += 1) {
    const n = field[i] / norm;
    const a = clamp01((n - threshold) / softness);
    // Lit tops are warm white; thicker parts pick up a cool shadow
    const shade = 1 - a * 0.16;
    img.data[i * 4] = 236 * shade + 19;
    img.data[i * 4 + 1] = 240 * shade + 15;
    img.data[i * 4 + 2] = 248 * shade + 7;
    img.data[i * 4 + 3] = a * a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// Each deck is a cloud layer the camera falls through at a given zoom;
// depth sets how strongly it parallaxes against the cursor. Lite mode keeps
// only the two that matter most.
const DECKS = [
  { z: 4.9, density: 0.6, tex: 0, size: 760, depth: 0.6, lite: false },
  { z: 7.6, density: 1, tex: 1, size: 980, depth: 1, lite: true },
  { z: 10.4, density: 0.85, tex: 0, size: 900, depth: 1.4, lite: true },
  { z: 13.1, density: 0.5, tex: 1, size: 1100, depth: 1.8, lite: false },
  // Low haze the camera skims through at the handoff (placed relative to the
  // handoff zoom): it peaks just as the satellite turns into the render
  { rel: -0.32, span: 1.25, density: 0.62, tex: 2, size: 1400, depth: 2.4, grow: [1, 1.9], lite: true },
];

// ---------- Tile prefetch ----------
// Walk the camera path and list the satellite tiles each stretch will need,
// in flight order, so the browser cache is warm before the camera gets there.
function tilesAlongPath(camera, width, height) {
  const seen = new Set();
  const list = [];
  for (let p = 0; p <= 0.8; p += 0.004) {
    const c = camera(p);
    // MapLibre draws 256 px raster tiles one level above the map zoom
    const tz = Math.max(0, Math.min(18, Math.round(c.zoom + 1)));
    const n = 2 ** tz;
    const k = 2 ** (tz - (c.zoom + 1)); // tiles per 256 screen px
    const lat = (c.center[1] * Math.PI) / 180;
    const fx = ((c.center[0] + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
    const hx = Math.ceil((width / 2 / 256) * k) + 1;
    const down = Math.ceil((height / 2 / 256) * k) + 1;
    const up = Math.ceil((height / 2 / 256) * k * (1 + c.pitch / 25)) + 1; // tilted views see further north
    for (let dy = -up; dy <= down; dy += 1) {
      for (let dx = -hx; dx <= hx; dx += 1) {
        const x = Math.floor(fx) + dx;
        const y = Math.floor(fy) + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const key = `${tz}/${y}/${x}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(TILE_URL.replace('{z}', tz).replace('{y}', y).replace('{x}', x));
      }
    }
  }
  return list;
}

function prefetch(urls, concurrency = 6) {
  let i = 0;
  const next = () => {
    if (i >= urls.length) return;
    const url = urls[i];
    i += 1;
    // Same request shape as MapLibre's, so its fetches hit this cache entry
    fetch(url, { mode: 'cors', credentials: 'same-origin' }).catch(() => {}).finally(next);
  };
  for (let k = 0; k < concurrency; k += 1) next();
}

// sequence: { land, port } URLs of pre-rendered flight videos. When given,
// the flight plays that footage scrubbed by scroll (frame-perfect and smooth
// on any device, nothing to stream mid-flight); the live map is the fallback.
export function createFlight(section, { reduceMotion = false, lite = false, onArrive, sequence = null } = {}) {
  const $ = (s) => section.querySelector(s);
  const sticky = $('.flight-sticky');
  const cam = $('.flight-cam');
  const intro = $('.flight-intro');
  const scrollCue = $('.flight-scroll');
  const haze = $('.flight-haze');
  const tone = $('.flight-tone');
  const shade = $('.flight-shade');
  const arrive = $('.flight-arrive');
  const arriveMove = $('.arrive-move');
  const arriveSolid = $('.arrive-solid');
  const arriveFeather = $('.arrive-feather');
  const air = $('.flight-air');
  const arriveCopy = $('.flight-arrive-copy');
  const pin = $('#site-pin');
  const hudAlt = $('#hud-alt');
  const hudHdg = $('#hud-hdg');
  const bar = $('#flight-bar');
  const viewfinder = $('.viewfinder');
  const reticle = $('#reticle');
  const timecode = $('#vf-tc');
  const labels = [...section.querySelectorAll('.geo')].map((el) => ({
    el,
    ll: el.dataset.ll.split(',').map(Number),
    z: el.dataset.z.split(',').map(Number),
  }));

  const small = window.innerWidth < 700;
  const Z0 = small ? 2.7 : 3.6;
  let map = null;
  let arrived = false;
  let isLite = lite;

  // The render covers the viewport, so its on-screen size follows the larger
  // of the two cover ratios; the map zoom follows it to stay locked
  let coverShift = 0;
  let vw = 0;
  let vh = 0;
  let vfBox = { left: 0, top: 0 };
  function measure() {
    vw = sticky.clientWidth;
    vh = sticky.clientHeight;
    coverShift = Math.log2(Math.max(vw / 1600, vh / 900));
    vfBox = viewfinder.getBoundingClientRect();
  }
  measure();
  window.addEventListener('resize', measure);

  let useSeq = Boolean(sequence) && !reduceMotion;
  let stillCam = false; // film capture: no hover drift baked into the footage

  // ---------- Clouds ----------
  const cloudsEl = $('#clouds');
  const decks = [];
  if (!reduceMotion && !useSeq) {
    const textures = [cloudTexture(256, 3, 0.47, 0.3), cloudTexture(256, 11, 0.42, 0.34), cloudTexture(256, 23, 0.3, 0.55)];
    DECKS.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'cloud';
      el.style.backgroundImage = `url(${textures[d.tex]})`;
      el.style.backgroundSize = `${d.size}px ${d.size}px`;
      cloudsEl.append(el);
      decks.push({ ...d, el, drift: i % 2 ? -1 : 1, shown: true });
    });
  }

  // ---------- Map ----------
  const canMap = !reduceMotion && !useSeq && window.maplibregl && (() => {
    try {
      const c = document.createElement('canvas');
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (err) { return false; }
  })();
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, isLite ? 1 : small ? 1.5 : 2);

  if (canMap) {
    try {
      map = new window.maplibregl.Map({
        container: $('#flight-map'),
        style: {
          version: 8,
          sources: {
            sat: {
              type: 'raster',
              tiles: [TILE_URL],
              tileSize: 256,
              maxzoom: 18,
              attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
            },
          },
          layers: [
            { id: 'space', type: 'background', paint: { 'background-color': '#02060c' } },
            // The MegEstates Gold grade, done in the map's own shader:
            // greens rotated toward olive, calmer saturation, a matte black
            { id: 'sat', type: 'raster', source: 'sat', paint: {
              'raster-fade-duration': 200, 'raster-contrast': 0.14, 'raster-saturation': -0.18,
              'raster-hue-rotate': -7, 'raster-brightness-min': 0.03, 'raster-brightness-max': 0.98,
            } },
          ],
        },
        center: [SITE[0] + START_OFFSET[0], SITE[1] + START_OFFSET[1]],
        zoom: Z0,
        pitch: 0,
        bearing: -25,
        interactive: false,
        attributionControl: { compact: true },
        maxPitch: 70,
        fadeDuration: 0,
        renderWorldCopies: false,
        pixelRatio: pixelRatio(),
        maxTileCacheSize: 900,
        refreshExpiredTiles: false,
        antialias: false,
      });
      map.on('error', () => {}); // a missing tile shouldn't spam the console
    } catch (err) {
      map = null;
    }
  }
  if (!map && !useSeq) section.classList.add('no-map');
  if (reduceMotion) section.classList.add('is-static');

  // ---------- Pre-rendered flight (scroll-scrubbed video) ----------
  // The whole file is fetched up front, so scrubbing never waits on the
  // network; a new seek is issued only once the previous frame has drawn.
  let video = null;
  let seqDuration = 0;
  let seeking = false;
  let wantTime = 0;
  let seqReady = Promise.resolve();
  if (useSeq) {
    section.classList.add('is-sequence');
    video = document.createElement('video');
    video.className = 'flight-video';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    cam.prepend(video);
    const src = vw / vh < 0.9 ? sequence.port : sequence.land;
    seqReady = fetch(src)
      .then((r) => { if (!r.ok) throw new Error(`flight video ${r.status}`); return r.blob(); })
      .then((blob) => new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
        video.src = URL.createObjectURL(blob);
      }))
      .then(() => {
        seqDuration = video.duration;
        // Some mobile browsers only seek a video that has played once
        const pl = video.play();
        if (pl && pl.then) pl.then(() => video.pause()).catch(() => {});
        video.addEventListener('seeked', () => {
          seeking = false;
          if (Math.abs(video.currentTime - wantTime) > 0.012) { seeking = true; video.currentTime = wantTime; }
        });
      })
      .catch(() => {
        // No footage: fall back to the still push-in
        useSeq = false;
        video.remove();
        video = null;
        section.classList.remove('is-sequence');
        section.classList.add('no-map');
      });
  }
  function seekTo(p) {
    if (!video || !seqDuration) return;
    wantTime = clamp01(p) * Math.max(0, seqDuration - 0.04);
    if (!seeking && Math.abs(video.currentTime - wantTime) > 0.012) {
      seeking = true;
      video.currentTime = wantTime;
    }
  }

  // ---------- Zoom motion blur ----------
  // After each map frame, draw it into a canvas at 1/6 size, then layer it
  // a few more times at growing scale around the centre (a running average),
  // which smears detail outward like a zoom blur. Low resolution keeps it
  // cheap, and stretching it back to full size softens it further.
  const blurCanvas = $('#flight-blur');
  const blurCtx = map ? blurCanvas.getContext('2d', { alpha: false }) : null;
  const BLUR_DOWNSCALE = 6;
  const BLUR_TAPS = 5;
  let blurAmt = 0; // 0..1, from how fast the camera is diving
  function sizeBlur() {
    blurCanvas.width = Math.max(32, Math.round(vw / BLUR_DOWNSCALE));
    blurCanvas.height = Math.max(32, Math.round(vh / BLUR_DOWNSCALE));
  }
  if (blurCtx) {
    sizeBlur();
    window.addEventListener('resize', sizeBlur);
    blurCtx.imageSmoothingEnabled = true;
    map.on('render', () => {
      if (blurAmt < 0.03 || isLite) return;
      const src = map.getCanvas();
      const w = blurCanvas.width;
      const h = blurCanvas.height;
      blurCtx.globalAlpha = 1;
      blurCtx.drawImage(src, 0, 0, w, h);
      // Streak length grows with speed
      const reach = 0.035 + blurAmt * 0.11;
      for (let i = 1; i <= BLUR_TAPS; i += 1) {
        const k = 1 + reach * (i / BLUR_TAPS);
        blurCtx.globalAlpha = 1 / (i + 1);
        blurCtx.drawImage(src, (w - w * k) / 2, (h - h * k) / 2, w * k, h * k);
      }
    });
  }

  // ---------- Camera path ----------
  const zH = () => HANDOFF.zoom + coverShift;

  function camera(p) {
    const f = range(p, T_DESCENT);
    const e = easeInOut(f);
    const d = range(p, T_DOLLY);
    const zA = zH() + DOLLY_FROM; // altitude where the descent hands over to the dolly
    let zoom;
    let center;
    if (d <= 0) {
      zoom = lerp(Z0, zA, e);
      // The offset shrinks with altitude, so the site drifts to centre the
      // way a target does when you fly straight at it
      const k = 2 ** (Z0 - zoom) * (1 - e);
      center = [HANDOFF.center[0] + START_OFFSET[0] * k, HANDOFF.center[1] + START_OFFSET[1] * k];
    } else {
      // Constant rate in zoom is a constant-speed dolly; ease only the very
      // start so the descent flows straight into it
      zoom = lerp(zA, zH() + DOLLY_TO, lerp(easeOut(d), d, 0.75));
      center = HANDOFF.center;
    }
    const pitch = lerp(0, HANDOFF.pitch, easeInOut(range(f, [0.45, 1])));
    const bearing = lerp(-25, HANDOFF.bearing, e);
    return { zoom, center, pitch, bearing };
  }

  // Warm the tile cache along the path once the first frame is up, unless
  // the visitor has asked to save data
  const saveData = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
  const ready = new Promise((resolve) => {
    if (useSeq) { seqReady.then(resolve, resolve); setTimeout(resolve, 5000); return; }
    if (!map) { resolve(); return; }
    map.once('idle', () => {
      resolve();
      if (!saveData) prefetch(tilesAlongPath(camera, vw, vh), small ? 4 : 6);
    });
    setTimeout(resolve, 2500);
  });

  // ---------- Cursor gimbal ----------
  // Pointer position in -1..1, damped so the camera eases after the hand
  const aim = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      aim.tx = (e.clientX / window.innerWidth) * 2 - 1;
      aim.ty = (e.clientY / window.innerHeight) * 2 - 1;
      aim.active = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { aim.tx = 0; aim.ty = 0; });
  }

  // ---------- Render ----------
  let lastZoom = null;
  let lastMapKey = '';
  let lastGrade = -1;
  let lastHud = '';
  let lastTc = '';
  function render(p, dt, now) {
    put(bar, 'transform', `scaleX(${q(p, 0.001).toFixed(3)})`);

    // Intro copy lifts away as the descent begins
    const io = q(1 - range(p, [0.015, 0.085]), 0.01);
    put(intro, 'opacity', String(io));
    put(intro, 'transform', `translate3d(0, ${((1 - io) * -40).toFixed(1)}px, 0)`);
    put(scrollCue, 'opacity', String(io));
    intro.classList.toggle('is-hidden', io < 0.05);

    const c = camera(p);
    put(haze, 'opacity', String(q(0.7 * (1 - clamp01((c.zoom - Z0) / (11.5 - Z0))), 0.01)));

    // Dive speed in zoom levels per second drives the motion blur: nothing
    // while hovering, a hint during the autopilot, full streaks on a fast dive
    if (lastZoom !== null && dt > 0) {
      const speed = Math.abs(c.zoom - lastZoom) / dt;
      blurAmt = damp(blurAmt, clamp01((speed - 0.5) / 3.5), speed > blurAmt ? 10 : 4, dt);
    }
    lastZoom = c.zoom;

    // Gimbal: the cursor steers the map high up; the hover drift and a sway
    // move only the composited camera layer, which costs nothing to redraw
    aim.x = damp(aim.x, aim.tx, 3.2, dt);
    aim.y = damp(aim.y, aim.ty, 3.2, dt);
    const t = now / 1000;
    const hover = stillCam ? { x: 0, y: 0 } : { x: Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.77) * 0.12, y: Math.sin(t * 0.23 + 1.3) * 0.3 };
    const steerMap = 1 - range(p, [0.48, 0.62]);
    const mapCam = {
      ...c,
      bearing: c.bearing + q(aim.x, 0.002) * 9 * steerMap,
      pitch: Math.max(0, c.pitch + -q(aim.y, 0.002) * 7 * steerMap),
    };
    const ax = aim.x + hover.x * (aim.active ? 0.35 : 1);
    const ay = aim.y + hover.y * (aim.active ? 0.35 : 1);
    const sway = useSeq ? 0.7 : 1 - steerMap * 0.6;
    put(cam, 'transform', stillCam ? 'scale(1.06)' : `translate3d(${(-ax * 18 * sway).toFixed(1)}px, ${(-ay * 12 * sway).toFixed(1)}px, 0) rotate(${(ax * 0.7 * sway).toFixed(2)}deg) scale(1.06)`);
    if (useSeq) seekTo(p);

    // The render dissolves in over the same ground, dollying at the map's
    // rate. Two copies share one transform: a feathered one that melts into
    // the satellite while it's smaller than the frame, and a full one that
    // fades up once it covers the screen. Only opacity and transform change.
    const a = useSeq ? 0 : q(smooth(range(p, T_DISSOLVE)), 0.005);
    const scale = RENDER_SCALE * 2 ** (c.zoom - zH());
    const push = clamp01((scale - 1) / 0.35);
    // The map is hidden only once the solid render covers the whole frame
    const solidO = a > 0 ? q(smooth(clamp01((scale - 1.02) / 0.1)) * smooth(range(p, T_RESOLVE)), 0.01) : 0;
    const covered = a >= 1 && solidO >= 0.99;
    if (!useSeq) put(arrive, 'opacity', String(a));
    if (!useSeq) put(arrive, 'visibility', a > 0 ? 'visible' : 'hidden');
    if (a > 0) {
      put(arriveMove, 'transform', `translate3d(${(-9 * push).toFixed(2)}%, ${(-6 * push).toFixed(2)}%, 0) scale(${scale.toFixed(4)})`);
      put(arriveFeather, 'opacity', String(q(smooth(range(p, T_RESOLVE)), 0.01)));
      put(arriveSolid, 'opacity', String(solidO));
    }
    // Aerial perspective builds on the approach, then thins near the ground
    if (!useSeq) put(air, 'opacity', String(isLite ? 0 : q(0.5 * smooth(range(p, [0.56, 0.68])) * (1 - 0.86 * smooth(range(p, [0.77, 0.92]))), 0.01)));
    if (!useSeq) put(shade, 'opacity', String(q(smooth(range(p, [0.86, 0.94])), 0.01)));
    if (!useSeq) put(tone, 'opacity', String(q(lerp(1, 0.35, a), 0.01)));
    // Blur fades out as the render takes over (the map is covered by then)
    if (blurCtx) put(blurCanvas, 'opacity', String(isLite || blurAmt < 0.03 ? 0 : q(blurAmt * 0.95 * (1 - a), 0.02)));

    // The viewfinder holds for the flight, then gives way to the page
    put(viewfinder, 'opacity', String(q(1 - range(p, [0.82, 0.88]), 0.01)));
    section.classList.toggle('is-revealed', p > 0.74);
    const secs = p * 28;
    const pad = (n) => String(Math.floor(n)).padStart(2, '0');
    const tc = `00:00:${pad(secs)}:${pad((secs % 1) * 24)}`;
    if (tc !== lastTc) { lastTc = tc; timecode.textContent = tc; }
    const showReticle = aim.active && !isLite && p < 0.84;
    reticle.classList.toggle('is-on', showReticle);
    if (showReticle) {
      put(reticle, 'transform', `translate3d(${(((aim.x + 1) / 2) * window.innerWidth - vfBox.left).toFixed(1)}px, ${(((aim.y + 1) / 2) * window.innerHeight - vfBox.top).toFixed(1)}px, 0)`);
    }

    const nowArrived = p > 0.9;
    if (nowArrived !== arrived) {
      arrived = nowArrived;
      arriveCopy.classList.toggle('is-on', arrived);
      if (arrived && onArrive) onArrive();
    }

    // Clouds: each deck rushes up toward the camera and opens around it;
    // decks out of range leave the compositor entirely
    decks.forEach((dk) => {
      const zc = dk.rel !== undefined ? zH() + dk.rel : dk.z;
      const u = (c.zoom - zc) / (dk.span || 2.6) + 0.5;
      const on = u > 0 && u < 1 && (!isLite || dk.lite);
      if (on !== dk.shown) { dk.shown = on; dk.el.style.display = on ? '' : 'none'; }
      if (!on) return;
      const o = Math.sin(Math.PI * u) ** 1.4 * dk.density;
      const s = lerp((dk.grow || [0.7])[0], (dk.grow || [0, 3.4])[1], u * u);
      put(dk.el, 'opacity', o.toFixed(2));
      put(dk.el, 'transform', `translate3d(${(-ax * 40 * dk.depth).toFixed(0)}px, ${(-ay * 28 * dk.depth).toFixed(0)}px, 0) scale(${s.toFixed(3)}) rotate(${(mapCam.bearing * 0.2 * dk.drift).toFixed(1)}deg)`);
    });

    if (map) {
      // Grade warms toward the render's look on approach, in the map shader
      const g = q(smooth(range(p, [0.56, 0.74])), 0.05);
      if (g !== lastGrade && !covered) {
        lastGrade = g;
        map.setPaintProperty('sat', 'raster-saturation', lerp(-0.18, -0.34, g));
        map.setPaintProperty('sat', 'raster-hue-rotate', lerp(-7, -15, g));
        map.setPaintProperty('sat', 'raster-brightness-min', lerp(0.03, 0.1, g));
        map.setPaintProperty('sat', 'raster-contrast', lerp(0.14, 0.06, g));
      }
      // Skip the map once the render fully covers it
      const key = covered ? 'covered' : `${mapCam.zoom.toFixed(4)}|${mapCam.bearing.toFixed(2)}|${mapCam.pitch.toFixed(2)}|${mapCam.center[0].toFixed(6)}|${mapCam.center[1].toFixed(6)}`;
      if (key !== lastMapKey) {
        lastMapKey = key;
        if (!covered) map.jumpTo(mapCam);
      }
      // Gold labels for the region, the cities and the venture itself;
      // labels wait until the intro copy has lifted away
      labels.forEach((l) => {
        const u = clamp01((c.zoom - l.z[0]) / (l.z[1] - l.z[0]));
        const o = q((u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 0.5) * (1 - io), 0.01);
        put(l.el, 'opacity', String(o));
        if (o > 0) {
          const pt = map.project(l.ll);
          put(l.el, 'transform', `translate3d(${pt.x.toFixed(0)}px, ${pt.y.toFixed(0)}px, 0)`);
        }
      });
      const po = q(clamp01((c.zoom - 11.8) / 1.4) * (1 - range(p, [0.6, 0.68])), 0.01);
      put(pin, 'opacity', String(po));
      if (po > 0) {
        const pt = map.project(SITE);
        put(pin, 'transform', `translate3d(${pt.x.toFixed(0)}px, ${pt.y.toFixed(0)}px, 0)`);
      }
    } else if (!useSeq) {
      put(sticky.querySelector('.flight-fallback img'), 'transform', `scale(${(2.4 - easeInOut(range(p, [0.03, 0.8])) * 1.4).toFixed(4)})`);
    }

    // Altitude readout: the ground the viewport spans, as a camera height
    const mpp = (78271.517 * Math.cos((SITE[1] * Math.PI) / 180)) / 2 ** c.zoom;
    const alt = vh * mpp * 1.1;
    const hud = `${alt > 2000 ? `${Math.round(alt / 1000).toLocaleString('en-IN')} km` : `${Math.round(alt / 10) * 10} m`}|${String(Math.round((((mapCam.bearing % 360) + 360) % 360))).padStart(3, '0')}°`;
    if (hud !== lastHud) {
      lastHud = hud;
      const [altText, hdg] = hud.split('|');
      hudAlt.textContent = altText;
      hudHdg.textContent = hdg;
    }
  }

  // Damped progress, with a speed cap so a hard fling can't outrun the tiles
  let target = 0;
  let current = 0;
  return {
    ready,
    camera,
    setTarget(p) { target = clamp01(p); },
    setLite(on) {
      isLite = on;
      if (map) map.setPixelRatio(pixelRatio());
    },
    // Film capture: draw an exact frame at progress p and virtual time (ms),
    // resolving once every satellite tile for that view has loaded
    renderAt(p, nowMs, dt = 1 / 30, { still = false } = {}) {
      stillCam = still;
      target = current = clamp01(p);
      render(current, dt, nowMs);
      if (!map) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        if (map.loaded() && map.areTilesLoaded() && !map.isMoving()) { map.triggerRepaint(); map.once('render', done); return; }
        map.once('idle', done);
      });
    },
    tick(dt, visible) {
      if (reduceMotion) return;
      const want = damp(current, target, 5, dt);
      const maxStep = (useSeq ? 2.5 : MAX_SPEED) * dt;
      current += Math.max(-maxStep, Math.min(maxStep, want - current));
      if (Math.abs(target - current) < 0.0002) current = target;
      if (visible) render(current, dt, performance.now());
    },
  };
}
