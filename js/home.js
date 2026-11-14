import { createFlight } from './flight.js?v=20261118f';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Hidden film mode (?film): the promo-video capture drives every frame itself
const FILM = new URLSearchParams(window.location.search).has('film');
// ?film=web captures the flight footage the site itself plays (labels and pin in)
const WEB = new URLSearchParams(window.location.search).get('film') === 'web';
if (FILM) document.documentElement.classList.add('film');
if (WEB) document.documentElement.classList.add('film-web');

// Write a style only when its value changes
const written = new WeakMap();
function put(el, prop, value) {
  let cache = written.get(el);
  if (!cache) { cache = {}; written.set(el, cache); }
  if (cache[prop] === value) return;
  cache[prop] = value;
  el.style[prop] = value;
}

// ---------- Smooth scrolling ----------
let lenis = null; // reassigned to null if it ever fails, falling back to native scroll
if (!reduceMotion && !FILM && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
  document.documentElement.classList.add('lenis');
  window.megLenis = lenis; // handy for debugging scroll positions from the console
}
function scrollToY(y, opts = {}) {
  if (lenis) lenis.scrollTo(y, { duration: 1.6, ...opts });
  else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const target = id === 'top' ? document.body : document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  const sticky = ['tour', 'venture'].includes(id); // sticky sections start flush with the top
  scrollToY(id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - (sticky ? 0 : 70));
});

// ---------- Nav ----------
const nav = $('#nav');
const menuBtn = $('.menu-btn');
function setMenu(open) {
  nav.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('menu-open')));
$$('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

// ---------- Flight ----------
const flightSection = $('#flight');
// Start in lite mode where the device or connection is clearly modest
const conn = navigator.connection || {};
let lite = Boolean(conn.saveData)
  || (navigator.deviceMemory && navigator.deviceMemory <= 3)
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 3);
if (lite) document.documentElement.classList.add('lite');
// The flight plays pre-rendered footage scrubbed by scroll: the same frames
// as the promo film, so it is just as smooth on any device. Film capture
// (?film) uses the live map to make that footage.
const flight = createFlight(flightSection, {
  reduceMotion,
  lite,
  sequence: FILM ? null : { land: 'assets/flight/flight-land.mp4', port: 'assets/flight/flight-port.mp4' },
});

// ---------- Fullscreen ----------
// Puts the whole page into browser fullscreen, so the film fills the screen
// and scrolling still drives it. Hidden where the API isn't available
// (iPhone Safari only allows fullscreen for video elements).
(() => {
  const btn = $('#fs-btn');
  const root = document.documentElement;
  const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!enabled || reduceMotion) return;
  btn.hidden = false;
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  const label = $('span', btn);
  const sync = () => {
    const on = Boolean(current());
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Watch fullscreen');
    label.textContent = on ? 'Exit' : 'Fullscreen';
  };
  btn.addEventListener('click', () => {
    if (current()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root).catch?.(() => {});
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
})();

// ---------- Preloader ----------
// Holds a black title card until fonts, the first render and the first
// satellite frame are in, so the film starts on a finished picture
(() => {
  const pre = $('#preloader');
  const bar = $('#pre-bar');
  const firstImg = new Image();
  firstImg.src = 'assets/lucids/graded/aerial-day.webp';
  const steps = [
    document.fonts ? document.fonts.ready : Promise.resolve(),
    firstImg.decode ? firstImg.decode().catch(() => {}) : Promise.resolve(),
    flight.ready,
    new Promise((r) => setTimeout(r, reduceMotion ? 0 : 3300)), // let the logo finish forming
  ];
  let done = 0;
  steps.forEach((s) => s.then(() => { done += 1; bar.style.transform = `scaleX(${done / steps.length})`; }));
  let finished = false;
  const root = document.documentElement;
  const reveal = () => {
    pre.classList.add('is-done');
    root.classList.remove('is-intro');
  };
  // The intro logo flies to the nav logo's exact spot and size, then swaps
  // with it, so the title card hands straight over to the page
  const finish = () => {
    if (finished) return;
    finished = true;
    const logo = $('#pre-logo');
    const target = $('.brand img');
    if (reduceMotion || !logo || !target) { reveal(); return; }
    const from = logo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!to.width) { reveal(); return; }
    pre.classList.add('is-flying');
    logo.style.transition = 'transform 1s cubic-bezier(0.7, 0, 0.2, 1)';
    logo.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    setTimeout(() => {
      root.classList.remove('is-intro');
      pre.style.transition = 'opacity 0.35s ease, visibility 0.35s';
      pre.classList.add('is-done');
    }, 1000);
  };
  // Lets the logo finish forming (~3.3 s), never more than 5 s, and any
  // attempt to scroll or tap lifts it at once
  if (FILM) { reveal(); return; }
  Promise.race([Promise.all(steps), new Promise((r) => setTimeout(r, 5000))]).then(() => setTimeout(finish, 150));
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, finish, { once: true, passive: true }));
  // Safety: the nav logo can never stay hidden
  setTimeout(() => root.classList.remove('is-intro'), 8000);
})();

// "Play the flight" glides through the descent like a film
$('#autopilot').addEventListener('click', () => {
  const end = flightSection.offsetTop + flightSection.offsetHeight - window.innerHeight;
  if (lenis) lenis.scrollTo(end, { duration: 16, easing: (t) => t, lock: false });
  else window.scrollTo({ top: end, behavior: 'smooth' });
});

// ---------- Tour ----------
// Each render gets its own drone move: [scale, x %, y %, rotate deg] from -> to
const SCENES = [
  { img: 'aerial-dusk', kicker: 'As evening falls', title: '102 plots, laid out', text: 'Every plot numbered from the VMRDA layout plan and set along 12 m internal roads.', from: [1.32, 3, 4, -2], to: [1.08, -2, -2, 1.5] },
  { img: 'street', kicker: 'Arrival', title: 'Down the main road', text: 'Wide internal roads run from the entrance past every block, each plot marked on the ground.', from: [1.05, 0, 3, 0], to: [1.3, 0, -1, 0] },
  { img: 'clubhouse', kicker: 'At the gate', title: 'The clubhouse', text: 'A proposed clubhouse at the entrance, for residents and their guests.', from: [1.22, -4, 0, 0], to: [1.08, 4, 0, 0] },
  { img: 'pool-dusk', kicker: 'Evenings', title: 'The pool at dusk', text: 'A resort-style pool beside the clubhouse, proposed as part of the resort.', from: [1.08, 3, -2, 1], to: [1.28, -3, 2, -1] },
  { img: 'party-garden', kicker: 'Celebrate', title: 'The party garden', text: 'An open lawn for family functions and festivals, a short walk from home.', from: [1.3, 0, -4, 0], to: [1.1, 0, 3, 0] },
  { img: 'box-cricket', kicker: 'Play', title: 'Box cricket', text: 'A netted box cricket pitch for evening matches.', from: [1.1, -4, 2, -1.2], to: [1.26, 3, -2, 1] },
  { img: 'badminton', kicker: 'Play', title: 'Badminton', text: 'A dedicated court among the amenities at the gate.', from: [1.26, 3, 0, 0], to: [1.06, -3, 0, 0] },
  { img: 'aerial-amenities', kicker: 'All together', title: 'A resort at the gate', text: 'Every amenity, steps from your plot. The resort and amenities are proposed and subject to approval.', from: [1.34, 0, 3, -3], to: [1.08, 0, 0, 0] },
];
const tourSection = $('#tour');
const tourStage = $('#tour-stage');
const tourCopy = $('#tour-copy');
const tourRail = $('#tour-rail');
const N = SCENES.length;

tourStage.innerHTML = SCENES.map((s, i) => `<figure class="scene"><img src="assets/lucids/graded/${s.img}.webp" alt="Artist's impression: ${s.title}" ${i > 1 ? 'loading="lazy"' : ''} decoding="async"></figure>`).join('');
tourCopy.innerHTML = SCENES.map((s, i) => `
  <article class="tour-text">
    <p class="eyebrow"><b>${String(i + 1).padStart(2, '0')}</b> / ${String(N).padStart(2, '0')} &middot; ${s.kicker}</p>
    <h3>${s.title}</h3>
    <p>${s.text}</p>
  </article>`).join('');
tourRail.innerHTML = SCENES.map((s, i) => `<li><i></i><button type="button" aria-label="Go to ${s.title}" data-i="${i}"></button></li>`).join('');

const scenes = $$('.scene', tourStage);
const sceneImgs = scenes.map((el) => $('img', el));
const tourTexts = $$('.tour-text', tourCopy);
const railFills = $$('.tour-rail i', tourRail);
let tourActive = -1;

tourRail.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const travel = tourSection.offsetHeight - window.innerHeight;
  scrollToY(tourSection.offsetTop + travel * ((i + 0.5) / N));
});

function renderTour(p) {
  const x = p * N;
  scenes.forEach((el, i) => {
    const t = x - i;
    const fadeIn = i === 0 ? 1 : clamp01((t + 0.18) / 0.36);
    const fadeOut = i === N - 1 ? 1 : 1 - clamp01((t - 0.82) / 0.36);
    const o = Math.min(fadeIn, fadeOut);
    // Frames that aren't on screen leave the compositor entirely
    put(el, 'opacity', o.toFixed(2));
    put(el, 'display', o > 0 ? '' : 'none');
    if (o > 0 && !reduceMotion) {
      const k = easeInOut(clamp01((t + 0.18) / 1.36));
      const s = SCENES[i];
      const v = s.from.map((a, j) => lerp(a, s.to[j], k));
      put(sceneImgs[i], 'transform', `translate3d(${v[1].toFixed(2)}%, ${v[2].toFixed(2)}%, 0) scale(${v[0].toFixed(4)}) rotate(${v[3].toFixed(2)}deg)`);
    }
    put(railFills[i], 'transform', `scaleX(${clamp01(t).toFixed(3)})`);
  });
  const active = Math.min(N - 1, Math.floor(x));
  if (active !== tourActive) {
    tourActive = active;
    tourTexts.forEach((el, i) => el.classList.toggle('is-on', i === active));
  }
}

// ---------- Facts: count up ----------
function countUp(el) {
  const target = Number(el.dataset.count);
  if (reduceMotion) { el.textContent = target; return; }
  const start = performance.now();
  const step = (now) => {
    const t = clamp01((now - start) / 1400);
    el.textContent = Math.round(target * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    countObserver.unobserve(entry.target);
    countUp(entry.target);
  });
}, { threshold: 0.6 });
$$('[data-count]').forEach((el) => countObserver.observe(el));

// ---------- Reveal on scroll ----------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('[data-reveal]').forEach((el) => {
  const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
  el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 0.08}s`);
  revealObserver.observe(el);
});

// ---------- Projects ----------
const PROJECTS = [
  {
    id: 'lucids', name: 'The Lucids Resort', type: 'plots', location: 'VMRDA region, Andhra Pradesh',
    chips: ['102 plots', '12 m roads', 'Resort at the gate'], status: 'Explore in 3D', live: true,
    img: 'assets/lucids/graded/aerial-dusk.webp', alt: "Artist's impression of The Lucids Resort from the air at dusk", cap: "Artist's impression",
    href: 'resort.html', feature: true,
  },
  { id: 'platinum-county', name: 'Platinum County', type: 'apartments', location: 'Amaravati Road, Guntur', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/platinum-county.jpg' },
  { id: 'royal-castle', name: 'Royal Castle', type: 'apartments', location: 'Bhimavaram', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/royal-castle.jpg' },
  { id: 'pcr-pride', name: 'PCR Pride', type: 'apartments', location: 'Bhimavaram', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/pcr-pride.jpg' },
  { id: 'vibhav-towers', name: 'Vibhav Towers', type: 'completed', location: 'Kakinada', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/vibhav-towers.jpg' },
  { id: 'madhu-kranthi', name: 'Madhu Kranthi', type: 'completed', location: 'Andhra Pradesh', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/madhu-kranthi.jpg' },
  { id: 'sai-lakshmi', name: 'Sai Lakshmi', type: 'completed', location: 'Andhra Pradesh', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/sai-lakshmi.jpg' },
];
const cardsEl = $('#cards');
cardsEl.innerHTML = PROJECTS.map((p) => {
  const tag = p.href ? 'a' : 'article';
  return `
  <${tag} class="card${p.feature ? ' card-feature' : ''}" data-type="${p.type}"${p.href ? ` href="${p.href}"` : ''}>
    <figure>
      <img src="${p.img}" alt="${p.alt || `${p.name}, ${p.location}`}" loading="lazy">
      <span class="cap">${p.cap || 'Hasini Infra image'}</span>
      <span class="status${p.live ? ' is-live' : ''}">${p.status}</span>
    </figure>
    <div class="card-body">
      <p class="card-by">${p.feature ? 'A MegEstates venture' : 'Hasini Infra'}</p>
      <h3>${p.name}</h3>
      <p class="card-loc">${p.location}</p>
      <div class="chips">${p.chips.map((c) => `<span>${c}</span>`).join('')}</div>
      ${p.href ? '<span class="link-arrow">Explore the venture</span>' : `<a class="link-arrow" href="#contact" data-interest="${p.name} · Hasini Infra">Enquire</a>`}
    </div>
  </${tag}>`;
}).join('');
const tabs = $$('.tabs [role="tab"]');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $$('.card', cardsEl).forEach((card) => {
      const show = tab.dataset.type === 'all' || card.dataset.type === tab.dataset.type;
      card.hidden = !show;
      // Restart the entrance so the filtered set settles in together
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
    });
  });
});

// ---------- 3D venture ----------
// A six-chapter film over the model built from the layout plan. Camera keys
// are in build-progress units (the model finishes building at ~0.75).
const walkSection = $('#venture');
const planChapters = $$('.plan-ch');
const planRail = $$('#plan-rail i');
const planHead = $('.plan-head');
const plotTip = $('#plot-tip');
// Chapter starts, in film progress: survey, wall and arch, roads, plots, resort, venture
const CHAPTERS = [0, 0.12, 0.26, 0.36, 0.58, 0.8];
const FILM_PATH = [
  { p: 0, pos: [0, 112, 8], look: [0, 0, 0], fov: 32 }, // straight down on the plan sheet
  { p: 0.08, pos: [12, 86, 34], look: [0, 0, -2], fov: 34 },
  { p: 0.17, pos: [-30, 22, 60], look: [-8, 2, 22], fov: 38 }, // swoop to the south-west corner
  { p: 0.24, pos: [-9.4, 3.8, 42], look: [-7.2, 2.2, 21], fov: 40 }, // the arch, at eye level
  { p: 0.3, pos: [-6, 5, 25], look: [-2, 2, 0], fov: 42 }, // through the gate
  { p: 0.36, pos: [0, 9, 8], look: [4, 1, -18], fov: 44 }, // up the main road
  { p: 0.46, pos: [26, 26, 20], look: [4, 0, -6], fov: 40 }, // crane up over the plots
  { p: 0.56, pos: [44, 42, 50], look: [2, 0, 2], fov: 36 },
  { p: 0.66, pos: [-2, 20, 40], look: [-18, 0.5, 14], fov: 36 }, // down to the resort
  { p: 0.75, pos: [-5, 12, 30], look: [-20, 0.6, 13], fov: 38 },
  { p: 0.88, pos: [-40, 40, 52], look: [-4, 0, 4], fov: 36 }, // pull back
  { p: 1, pos: [-58, 54, 18], look: [-2, 0, -2], fov: 34 }, // and orbit the whole venture
];
// Callouts pinned to named points in the model; each shows during its chapters
const CALLOUTS = [
  { at: 'boundary', ch: [0], title: 'Site boundary', sub: 'Per VMRDA layout plan' },
  { at: 'arch', ch: [1, 2], title: 'Entrance arch', sub: 'Planned' },
  { at: 'wall', ch: [1], title: 'Compound wall', sub: 'Planned on every side' },
  { at: 'mainRoad', ch: [2, 3], title: 'Main road', sub: '12 m wide' },
  { at: 'crossRoad', ch: [2], title: 'Internal road', sub: '12 m wide' },
  { at: 'plot1', ch: [3], title: 'Plot 1', sub: 'Residential plot' },
  { at: 'plot89', ch: [3], title: 'Plot 89', sub: 'Residential plot' },
  { at: 'mortgaged', ch: [3], title: 'Plots 66–74 · 79–87', sub: 'Mortgaged area per plan' },
  { at: 'club', ch: [4, 5], title: 'Clubhouse', sub: 'Proposed' },
  { at: 'pool', ch: [4], title: 'Pool', sub: 'Proposed' },
  { at: 'cricket', ch: [4], title: 'Box cricket', sub: 'Proposed' },
  { at: 'swOpen', ch: [4], title: 'Open space', sub: '2,278.57 sq. m' },
  { at: 'seOpen', ch: [5], title: 'Open space', sub: '2,166.36 sq. m' },
];
const calloutHost = $('#plan-callouts');
calloutHost.innerHTML = CALLOUTS.map((c) => `<div class="callout"><i class="co-dot"></i><i class="co-line"></i><div class="co-label"><b>${c.title}</b><span>${c.sub}</span></div></div>`).join('');
const calloutEls = $$('.callout', calloutHost);
const planHud = $('.plan-hud');
const hud = { plots: $('#ph-plots'), wall: $('#ph-wall'), resort: $('#ph-resort'), compass: $('#ph-compass svg'), bar: $('#ph-scale-bar'), label: $('#ph-scale-label') };
let planChapter = -1;
let lastStats = '';
const SCALE_STEPS = [2, 5, 10, 20, 50, 100, 200, 500];

// Runs right after each 3D frame, so the overlay never lags the camera
function updatePlanOverlay(view) {
  const anchors = view.anchors;
  calloutEls.forEach((el, i) => {
    const c = CALLOUTS[i];
    const xyz = anchors[c.at];
    const want = xyz && c.ch.includes(planChapter);
    if (!want) { el.classList.remove('is-on'); return; }
    const s = view.project(xyz);
    el.classList.toggle('is-on', s.visible);
    if (!s.visible) return;
    el.classList.toggle('is-left', s.x > walkSection.clientWidth * 0.68);
    put(el, 'transform', `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`);
  });
  // Compass: plan north as seen from the camera
  put(hud.compass, 'transform', `rotate(${(-view.heading).toFixed(1)}deg)`);
  // Scale bar: a round length that draws 50-140 px at the focus point
  const ppm = view.pxPerMetre();
  if (ppm > 0 && Number.isFinite(ppm)) {
    const len = SCALE_STEPS.find((m) => m * ppm >= 50) || SCALE_STEPS[SCALE_STEPS.length - 1];
    put(hud.bar, 'width', `${Math.min(160, len * ppm).toFixed(0)}px`);
    if (hud.label.textContent !== `${len} m`) hud.label.textContent = `${len} m`;
  }
  const st = view.stats();
  const key = `${st.plots}|${st.wall}|${st.resort}`;
  if (key !== lastStats) {
    lastStats = key;
    hud.plots.textContent = st.plots;
    hud.wall.textContent = st.wall;
    hud.resort.textContent = st.resort;
  }
}

let estate = null;
import('./lucids3d.js?v=20261118f')
  .then(({ createLucids }) => {
    estate = createLucids($('#estate'), {
      theme: 'dark',
      path: FILM_PATH,
      cinematic: true,
      details: true,
      onFrame: (view) => guard('plan-overlay', () => updatePlanOverlay(view)),
      lite,
      onHover: (info, x, y) => {
        if (!info) { plotTip.hidden = true; return; }
        plotTip.innerHTML = `<b>${info.title}</b> · ${info.meta}`;
        plotTip.style.left = `${x}px`;
        plotTip.style.top = `${y}px`;
        plotTip.hidden = false;
      },
    });
    if (!estate) walkSection.classList.add('no-webgl');
  })
  .catch(() => walkSection.classList.add('no-webgl'));

// ---------- Enquiry context ----------
const enquiryTag = $('#enquiry-tag');
const subjectInput = $('#f-subject');
const interestParam = new URLSearchParams(window.location.search).get('interest');
if (interestParam) {
  enquiryTag.textContent = interestParam;
  subjectInput.value = interestParam;
}
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-interest]');
  if (!link) return;
  const label = link.dataset.interest === 'partner' ? 'Partnership enquiry' : link.dataset.interest;
  enquiryTag.textContent = label;
  subjectInput.value = label;
  if (link.dataset.interest === 'partner') $('#f-role').value = 'landowner';
});

// ---------- Form ----------
const form = $('#enquiry-form');
const formStatus = $('.form-status', form);
form.addEventListener('input', (e) => {
  const wrap = e.target.closest('.field, .check');
  if (wrap) wrap.classList.remove('is-invalid');
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let valid = true;
  $$('[required]', form).forEach((field) => {
    const ok = field.type === 'checkbox' ? field.checked : field.value.trim() !== '';
    field.closest('.field, .check').classList.toggle('is-invalid', !ok);
    if (!ok) valid = false;
  });
  if (!valid) {
    formStatus.className = 'form-status is-err';
    formStatus.textContent = 'Please complete the highlighted fields.';
    return;
  }
  // TODO: send to the CRM / email endpoint with subject, page URL and UTM parameters (brief §11-12).
  formStatus.className = 'form-status is-ok';
  formStatus.textContent = 'Thank you. We have received your enquiry.';
  form.reset();
  enquiryTag.textContent = 'General enquiry';
  subjectInput.value = 'General enquiry';
});

// ---------- Frame loop ----------
// Section geometry is measured once (and on resize), so the loop only reads
// scrollY: no layout queries between style writes, no forced reflows.
const quickbar = $('.quickbar');
const geo = {};
function measureSections() {
  const vh = window.innerHeight;
  [['flight', flightSection], ['tour', tourSection], ['walk', walkSection]].forEach(([k, el]) => {
    geo[k] = { top: el.offsetTop, height: el.offsetHeight, travel: Math.max(1, el.offsetHeight - vh) };
  });
  geo.vh = vh;
}
measureSections();
window.addEventListener('resize', measureSections);
window.addEventListener('load', measureSections);
if (window.ResizeObserver) new ResizeObserver(measureSections).observe(document.body);

const progressOf = (k, y) => clamp01((y - geo[k].top) / geo[k].travel);
const inView = (k, y) => y + geo.vh > geo[k].top && y < geo[k].top + geo[k].height;

// Decode the tour frames before they're needed, so no image decodes mid-shot
let tourDecoded = false;
function decodeTour() {
  tourDecoded = true;
  sceneImgs.forEach((img) => {
    img.loading = 'eager';
    if (img.decode) img.decode().catch(() => {});
  });
}

// Adaptive quality: if frames run long while the film plays, drop to lite
let slowFrames = 0;
let sampled = 0;
function watchFrameRate(dt, playing) {
  if (lite || !playing) return;
  sampled += 1;
  if (dt > 1 / 40) slowFrames += 1;
  if (sampled >= 120) {
    if (slowFrames / sampled > 0.25) {
      lite = true;
      document.documentElement.classList.add('lite');
      flight.setLite(true);
    }
    sampled = 0;
    slowFrames = 0;
  }
}

let lastTime = performance.now();
let lastTourP = -1;
let lastWalkP = -1;
let lastStop = -1;
let lastY = -1;
// Book the next frame before doing any work, and run each part on its own,
// so a failure in one effect can never stop scrolling or the rest of the page
const failed = new Set();
function guard(name, fn) {
  if (failed.has(name)) return;
  try { fn(); } catch (err) {
    failed.add(name);
    console.error(`[megestates] ${name} stopped:`, err);
    if (name === 'flight') flightSection.classList.add('no-map', 'is-static');
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (FILM) return; // the capture script drives every frame in film mode
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (lenis) {
    try { lenis.raf(now); } catch (err) { lenis = null; } // fall back to native scrolling
  }

  const y = window.scrollY;
  const vh = geo.vh;

  const flightOn = inView('flight', y);
  const fp = progressOf('flight', y);
  guard('flight', () => {
    flight.setTarget(fp);
    flight.tick(dt, flightOn);
  });
  watchFrameRate(dt, flightOn && document.visibilityState === 'visible');
  if (!tourDecoded && fp > 0.4) guard('decode', decodeTour);

  if (inView('tour', y)) guard('tour', () => {
    const tp = progressOf('tour', y);
    if (Math.abs(tp - lastTourP) > 0.0002) { lastTourP = tp; renderTour(tp); }
  });

  if (inView('walk', y)) guard('walk', () => {
    const wp = progressOf('walk', y);
    if (Math.abs(wp - lastWalkP) > 0.0005) {
      lastWalkP = wp;
      if (estate) estate.setProgress(wp);
      // The section title gives way to the first chapter
      const ho = 1 - clamp01((wp - 0.03) / 0.06);
      put(planHead, 'opacity', ho.toFixed(2));
      put(planHead, 'transform', `translate3d(0, ${(-24 * (1 - ho)).toFixed(1)}px, 0)`);
      // The readout takes over once the title has cleared
      put(planHud, 'opacity', (1 - ho).toFixed(2));
      let ch = 0;
      while (ch < CHAPTERS.length - 1 && wp >= CHAPTERS[ch + 1]) ch += 1;
      // The first lower third waits until the title has cleared
      const shown = wp < 0.05 ? -1 : ch;
      if (shown !== lastStop) {
        lastStop = shown;
        planChapter = shown;
        planChapters.forEach((el, i) => el.classList.toggle('is-on', i === shown));
      }
      planRail.forEach((el, i) => {
        const from = CHAPTERS[i];
        const to = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1] : 1;
        put(el, 'transform', `scaleX(${clamp01((wp - from) / (to - from)).toFixed(3)})`);
      });
    }
  });

  if (y !== lastY) {
    lastY = y;
    // The nav stays clear over the cinematic sections and turns solid after them
    const cinematicEnd = geo.tour.top + geo.tour.height - vh * 0.5;
    nav.classList.toggle('is-solid', y > cinematicEnd || nav.classList.contains('menu-open'));
    quickbar.classList.toggle('is-on', y > vh * 0.6);
  }
}
requestAnimationFrame(frame);

// ---------- Film mode API (?film) ----------
// Used by video/tools/capture-plates.mjs to draw exact, fully loaded frames.
if (FILM) {
  const nextFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const showSection = (el) => window.scrollTo({ top: el.offsetTop + 1, behavior: 'instant' });
  window.megFilm = {
    ready: () => Promise.all([flight.ready, document.fonts ? document.fonts.ready : null,
      new Promise((r) => { const w = () => (estate ? r() : setTimeout(w, 100)); w(); })]),
    async flight(p, timeMs) {
      showSection(flightSection);
      await flight.renderAt(p, timeMs, 1 / 30, { still: WEB });
    },
    async tour(p) {
      if (!tourDecoded) decodeTour();
      showSection(tourSection);
      renderTour(p);
      await Promise.all(sceneImgs.map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
      await nextFrames();
    },
    async plan(p, timeMs) {
      showSection(walkSection);
      // Start the clock past the 3D scene's load-in, so the plan lines are fully drawn
      window.__megFilmTime = 10 + timeMs / 1000;
      let ch = 0;
      while (ch < CHAPTERS.length - 1 && p >= CHAPTERS[ch + 1]) ch += 1;
      planChapter = ch;
      if (estate) estate.setProgress(p, { instant: true });
      await nextFrames();
      await nextFrames();
    },
  };
}
