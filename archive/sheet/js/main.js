import { createEstate } from './estate3d.js';
import { PLOTS, STATUS_LABEL } from './plots.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const SVG_NS = 'http://www.w3.org/2000/svg';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const hasGsap = typeof window.gsap !== 'undefined';

document.documentElement.classList.add('js');

// ---------- Scroll reveals ----------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('[data-reveal]').forEach((el) => revealObserver.observe(el));

// ---------- Header ----------
const header = $('#site-header');
const menuToggle = $('.menu-toggle');
function setMenu(open) {
  header.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.documentElement.style.overflow = open ? 'hidden' : '';
}
menuToggle.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
$$('.main-nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

// ---------- Master plan drawing (hero) ----------
// Geometry is generated from the same 8 x 5 layout as the plot schedule.
const COL_X = 190;
const ROW_Y = 150;
const PITCH_X = 64;
const PITCH_Y = 58;
const PLOT_W = 58;
const PLOT_H = 52;

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (parent) parent.append(node);
  return node;
}
function rectPath(x, y, w, h) {
  return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
}

const planLines = $('#plan-lines');
const planLabels = $('#plan-labels');
const drawables = [];

if (planLines) {
  // Site boundary
  drawables.push(el('path', { class: 'ln-gold', d: 'M90 70 L930 50 L960 540 L120 580 Z' }, planLines));
  drawables.push(el('path', { class: 'ln-faint', d: 'M130 110 L890 96 L910 500 L150 530 Z' }, planLines));

  // Approach road
  drawables.push(el('path', { class: 'road', d: rectPath(40, 280, 150, 38) }, planLines));
  drawables.push(el('path', { class: 'ln-faint', d: 'M40 299 H190' }, planLines));

  // Plots, numbered in order
  const plots = el('g', { class: 'plots' }, planLines);
  PLOTS.forEach((plot, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = COL_X + col * PITCH_X;
    const y = ROW_Y + row * PITCH_Y;
    const cls = plot.status === 'available' && i % 3 === 0 ? 'plot-gold' : 'plot';
    el('path', { class: cls, d: rectPath(x, y, PLOT_W, PLOT_H), 'data-i': i }, plots);
  });

  // Residential 02 towers
  // Towers share one group, revealed from the ground up through a clip rectangle
  const defs = el('defs', {}, planLines);
  const towerClipPath = el('clipPath', { id: 'tower-clip' }, defs);
  const towerClip = el('rect', { x: 700, y: 400, width: 300, height: 0 }, towerClipPath);
  const towersG = el('g', { class: 'towers', 'clip-path': 'url(#tower-clip)' }, planLines);
  el('path', { class: 'tower-face', d: rectPath(754, 200, 50, 200) }, towersG);
  el('path', { class: 'tower-face', d: rectPath(816, 150, 56, 250) }, towersG);
  el('path', { class: 'tower-face', d: rectPath(884, 240, 46, 160) }, towersG);
  for (let y = 240; y < 400; y += 32) {
    el('path', { class: 'ln-faint', d: `M754 ${y} H804 M816 ${y - 40} H872 M884 ${y + 0} H930` }, towersG);
  }

  // Dimension line under the grid
  drawables.push(el('path', { class: 'ln', d: 'M190 468 H702 M190 460 V476 M702 460 V476' }, planLines));

  // North arrow
  el('path', { class: 'ln', d: 'M40 100 L52 70 L64 100 L52 92 Z' }, planLines);
  el('text', { x: 42, y: 58 }, planLabels).textContent = 'N';

  // Labels
  const label = (x, y, text, cls = '') => {
    const t = el('text', { x, y, class: cls }, planLabels);
    t.textContent = text;
    return t;
  };
  label(190, 448, 'VENTURE 01 · 40 PLOTS', 't-muted');
  label(754, 176, 'RESIDENTIAL 02', 't-gold');
  label(46, 268, 'APPROACH ROAD', 't-muted');
  label(60, 620, 'SCALE: NOT TO SCALE', 't-muted');

  // Callout to the first plot
  el('path', { class: 'leader', d: 'M219 150 V112 H262' }, planLabels);
  el('circle', { class: 'dot', cx: 219, cy: 150, r: 3 }, planLabels);
  label(268, 116, 'MEG-001', 't-gold');
}

function playHeroDrawing() {
  if (!hasGsap || reduceMotion) return;
  const { gsap } = window;

  const lines = drawables.filter((node) => node.tagName === 'path' && !node.classList.contains('ln-faint'));
  lines.forEach((node) => {
    const len = node.getTotalLength();
    gsap.fromTo(node, { strokeDasharray: len, strokeDashoffset: len }, {
      strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut', delay: 0.2,
      onComplete: () => node.removeAttribute('stroke-dasharray'),
    });
  });

  gsap.from($$('text', planLabels), { opacity: 0, duration: 0.8, delay: 1.9, stagger: 0.08 });

  // The plan keeps working: plots fill in, towers rise, a sweep crosses the site,
  // then everything resets and builds again
  const plotNodes = $$('.plots path', planLines);
  const sweepLine = el('path', { class: 'sweep', d: 'M186 150 H940' }, planLines);
  gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 0.7 })
    .fromTo(plotNodes, { opacity: 0.15, scale: 0.4 }, {
      opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)', stagger: { each: 0.03 }, transformOrigin: '50% 50%',
    })
    .fromTo(towerClip, { attr: { y: 400, height: 0 } }, {
      attr: { y: 140, height: 260 }, duration: 1.6, ease: 'power2.out',
    }, '-=0.4')
    .fromTo(sweepLine, { y: 0, opacity: 0.9 }, { y: 330, opacity: 0, duration: 2.2, ease: 'none' }, 0)
    .to(towerClip, { attr: { y: 400, height: 0 }, duration: 0.9, ease: 'power2.in' }, '+=2.2')
    .to(plotNodes, {
      opacity: 0.15, scale: 0.4, duration: 0.6, stagger: { each: 0.02, from: 'end' }, transformOrigin: '50% 50%',
    }, '<0.2');
}

// ---------- Walkthrough (3D) ----------
const walkSection = $('#walk');
const stopItems = $$('.stops li');
const tip = $('#plot-tip');
let estate = null;
try {
  estate = createEstate($('#estate'), {
    onHover: (id, x, y) => {
      if (!id) { tip.hidden = true; return; }
      const plot = plotById.get(id);
      tip.hidden = false;
      tip.textContent = `${plot.id} · ${STATUS_LABEL[plot.status]}`;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    },
  });
} catch (err) {
  estate = null;
}
if (!estate) walkSection.classList.add('no-webgl');
if (!finePointer) tip.hidden = true;

// ---------- Section cut (process) ----------
const processSection = $('.process');
const building = $('.section-drawing .building');
const floorLines = $('.section-drawing .floors');
const levelNodes = $$('.section-drawing .levels > g');
const buildingLen = building ? building.getTotalLength() : 0;
const floorLen = floorLines ? floorLines.getTotalLength() : 0;
if (building) {
  building.style.strokeDasharray = buildingLen;
  floorLines.style.strokeDasharray = floorLen;
}

function drawProcess() {
  if (!processSection || reduceMotion) return;
  const r = processSection.getBoundingClientRect();
  const p = clamp01((window.innerHeight * 0.85 - r.top) / (r.height * 0.8));
  building.style.strokeDashoffset = buildingLen * (1 - p);
  floorLines.style.strokeDashoffset = floorLen * (1 - clamp01((p - 0.2) / 0.8));
  levelNodes.forEach((node, i) => node.classList.toggle('is-on', p >= (i + 0.5) / levelNodes.length));
}

// ---------- Scroll driver for the walkthrough ----------
let ticking = false;
function onScroll() {
  header.classList.toggle('is-solid', window.scrollY > 40);
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const r = walkSection.getBoundingClientRect();
    const p = clamp01(-r.top / (walkSection.offsetHeight - window.innerHeight));
    if (estate) estate.setProgress(p);
    const active = Math.min(2, Math.floor(p * 3));
    stopItems.forEach((li, i) => li.classList.toggle('is-on', i === active));
    drawProcess();
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);

// ---------- Plot schedule and passport ----------
const plotById = new Map(PLOTS.map((p) => [p.id, p]));
const plotGrid = $('#plot-grid');
PLOTS.forEach((plot) => {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'plot-cell';
  cell.dataset.status = plot.status;
  cell.dataset.id = plot.id;
  cell.setAttribute('role', 'listitem');
  cell.setAttribute('aria-pressed', 'false');
  cell.setAttribute('aria-label', `${plot.id}, ${STATUS_LABEL[plot.status]}. Open plot passport.`);
  cell.innerHTML = `${plot.id.slice(-3)}<small>${STATUS_LABEL[plot.status]}</small>`;
  cell.addEventListener('click', () => selectPlot(plot.id));
  plotGrid.append(cell);
});

const pp = {
  id: $('#pp-id'), status: $('#pp-status'), area: $('#pp-area'),
  facing: $('#pp-facing'), road: $('#pp-road'), corner: $('#pp-corner'),
  enquire: $('#pp-enquire'),
};
let selectedPlot = null;
function selectPlot(id) {
  const plot = plotById.get(id);
  if (!plot) return;
  selectedPlot = plot;
  $$('.plot-cell', plotGrid).forEach((cell) => cell.setAttribute('aria-pressed', String(cell.dataset.id === id)));
  pp.id.textContent = plot.id;
  pp.status.textContent = STATUS_LABEL[plot.status];
  pp.status.dataset.status = plot.status;
  pp.area.textContent = `${plot.area} sq. yd.`;
  pp.facing.textContent = plot.facing;
  pp.road.textContent = `${plot.road} ft`;
  pp.corner.textContent = plot.corner ? 'Yes' : 'No';
}
pp.enquire.addEventListener('click', () => {
  if (!selectedPlot) return;
  setEnquiryTarget(`Plot ${selectedPlot.id} · Venture 01`);
  $('#contact').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
});
selectPlot((PLOTS.find((p) => p.status === 'available') || PLOTS[0]).id);

// ---------- Floor schedule (Residential 02, illustrative) ----------
const floorTable = $('#floor-table');
for (let floor = 12; floor >= 1; floor--) {
  const progress = floor <= 5 ? 100 : floor <= 8 ? 60 : 0;
  const state = progress === 100 ? 'Complete' : progress ? 'In progress' : 'Planned';
  const li = document.createElement('li');
  if (progress === 100) li.classList.add('is-done');
  li.innerHTML = `<span class="fl">Floor ${String(floor).padStart(2, '0')}</span>`
    + `<span class="bar"><i data-w="${progress}%"></i></span>`
    + `<span class="st">${state}${progress && progress < 100 ? ` ${progress}%` : ''}</span>`;
  floorTable.append(li);
}
const floorObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    $$('.bar i', floorTable).forEach((bar) => { bar.style.width = bar.dataset.w; });
    floorObserver.disconnect();
  });
}, { threshold: 0.3 });
floorObserver.observe(floorTable);
if (reduceMotion) $$('.bar i', floorTable).forEach((bar) => { bar.style.width = bar.dataset.w; });

// ---------- Forms ----------
function setEnquiryTarget(label) {
  $('#enquiry-target').textContent = label;
  $('#e-plot').value = label;
}

function validate(form) {
  let valid = true;
  $$('[required]', form).forEach((field) => {
    const wrap = field.closest('.cell') || field.closest('.ccard-form .check') || field.parentElement;
    const ok = field.type === 'checkbox' ? field.checked : field.value.trim() !== '';
    const emailOk = field.type !== 'email' || field.value.trim() === '' || field.checkValidity();
    const fine = ok && emailOk;
    wrap.classList.toggle('is-invalid', !fine);
    if (!fine) valid = false;
  });
  return valid;
}

function wireForm(form, message) {
  const status = $('.form-status', form);
  form.addEventListener('input', (e) => {
    const wrap = e.target.closest('.cell') || e.target.closest('.check') || e.target.parentElement;
    wrap.classList.remove('is-invalid');
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(form)) {
      status.className = 'form-status is-err';
      status.textContent = 'Please complete the highlighted fields.';
      return;
    }
    // TODO: send to the CRM / email endpoint with plot ID and UTM parameters (brief §11-12).
    status.className = 'form-status is-ok';
    status.textContent = message;
    form.reset();
    if (form.id === 'enquiry-form') setEnquiryTarget('General enquiry');
  });
}
wireForm($('#partner-form'), 'Thank you. We have received your details.');
wireForm($('#enquiry-form'), 'Thank you. We have received your enquiry.');

// ---------- Start ----------
playHeroDrawing();
onScroll();
