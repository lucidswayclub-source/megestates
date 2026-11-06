import { PLOTS } from './plots.js';
import { initMotion, flipCards, scrollToTarget } from './motion.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

// ---------- Sample project data (working titles; replace with approved records) ----------
const PROJECTS = [
  { id: 'venture-01', name: 'Venture 01', type: 'plots', region: 'visakhapatnam', location: 'Visakhapatnam', sizes: [150, 200], facing: ['East', 'North', 'West', 'South'], chips: ['40 plots', '150–200 sq. yd.', 'All facings'], status: 'Booking open', live: true, render: 'plots-aerial' },
  { id: 'residential-02', name: 'Residential 02', type: 'apartments', region: 'visakhapatnam', location: 'Visakhapatnam', sizes: null, facing: ['East'], chips: ['12 floors', '2 & 3 BHK', 'Under construction'], status: 'Under construction', live: true, render: 'tower' },
  { id: 'venture-03', name: 'Venture 03', type: 'plots', region: 'andhra', location: 'Andhra Pradesh', sizes: [167, 240], facing: ['East', 'West'], chips: ['Plots', '167–240 sq. yd.', 'East & West'], status: 'Booking open', live: true, render: 'plots-golden' },
  { id: 'venture-04', name: 'Venture 04', type: 'plots', isNew: true, region: 'hyderabad', location: 'Hyderabad', sizes: [150, 180], facing: ['North', 'East'], chips: ['Plots', '150–180 sq. yd.', 'North & East'], status: 'Coming soon', live: false, render: 'villa-midday' },
  { id: 'commercial-05', name: 'Commercial 05', type: 'commercial', region: 'visakhapatnam', location: 'Visakhapatnam', sizes: null, facing: ['East'], chips: ['Commercial', 'Bulk inventory', 'Enquiries open'], status: 'Enquiries open', live: true, render: 'tower-golden' },
  { id: 'venture-06', name: 'Venture 06', type: 'plots', isNew: true, region: 'visakhapatnam', location: 'Visakhapatnam', sizes: [180, 267], facing: ['East', 'South'], chips: ['Villa plots', '180–267 sq. yd.', 'East & South'], status: 'New launch', live: true, render: 'villa-golden' },
];

// ---------- Concept renders: lazy, one per frame ----------
let renderShot = null;
let rendersFailed = false;
const pending = [];
let draining = false;

const renderReady = import('./renders.js')
  .then((mod) => { renderShot = mod.renderShot; })
  .catch(() => { rendersFailed = true; });

function markReady(img) {
  const frame = img.closest('.media');
  if (frame) frame.classList.add('is-ready');
}

function paint(img) {
  if (img.dataset.painted) return;
  img.dataset.painted = '1';
  let url = null;
  try {
    url = renderShot && renderShot(img.dataset.render, Number(img.dataset.w), Number(img.dataset.h));
  } catch (err) {
    url = null;
  }
  if (!url) {
    // Without WebGL the frame keeps a calm neutral fill instead of a broken image
    img.style.display = 'none';
    markReady(img);
    return;
  }
  img.src = url;
  if (img.complete) markReady(img);
  else img.addEventListener('load', () => markReady(img), { once: true });
}

// Paint one render per frame. Hidden tabs get no animation frames, so a timer
// takes over there and the images are ready when the visitor switches back.
const nextTick = (fn) => (document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn));

function drain() {
  if (draining) return;
  draining = true;
  const step = () => {
    const img = pending.shift();
    if (!img) { draining = false; return; }
    paint(img);
    nextTick(step);
  };
  renderReady.then(() => nextTick(step));
}

const renderObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    renderObserver.unobserve(entry.target);
    pending.push(entry.target);
  });
  drain();
}, { rootMargin: '600px 0px' });

function observeRenders(scope = document) {
  $$('img[data-render]', scope).forEach((img) => {
    if (rendersFailed) { img.style.display = 'none'; markReady(img); return; }
    renderObserver.observe(img);
  });
}

// ---------- Reveal on scroll ----------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

function observeReveals(scope = document) {
  $$('[data-reveal]', scope).forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 0.07}s`);
    revealObserver.observe(el);
  });
}

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

// ---------- Finder: tabs, filters, cards ----------
const cardsEl = $('#cards');
const filtersForm = $('#filters');
const tabs = $$('.tabs [role="tab"]');
const tabInk = $('.tab-ink');
const countEl = $('#result-count');
const emptyEl = $('#empty');
const filterState = { type: 'all', region: 'all', size: 'all', facing: 'all' };

cardsEl.innerHTML = PROJECTS.map((p) => `
  <article class="card" data-id="${p.id}">
    <figure class="media">
      <img data-render="${p.render}" data-w="720" data-h="540" alt="Concept render for ${p.name}">
      <span class="cap">Concept render</span>
      <span class="status${p.live ? ' is-live' : ''}">${p.status}</span>
    </figure>
    <div class="card-body">
      <div class="card-row"><h3>${p.name}</h3><span class="card-price">On request</span></div>
      <p class="card-loc">${p.location}</p>
      <div class="chips">${p.chips.map((c) => `<span>${c}</span>`).join('')}</div>
    </div>
  </article>`).join('');

function matches(p) {
  const f = filterState;
  if (f.type === 'new' ? !p.isNew : f.type !== 'all' && p.type !== f.type) return false;
  if (f.region !== 'all' && p.region !== f.region) return false;
  if (f.facing !== 'all' && !p.facing.includes(f.facing)) return false;
  if (f.size !== 'all') {
    if (!p.sizes) return false;
    const [lo, hi] = f.size.split('-').map(Number);
    if (p.sizes[1] < lo || p.sizes[0] > hi) return false;
  }
  return true;
}

function applyFilters({ animate = true } = {}) {
  let shown = 0;
  const update = () => {
    PROJECTS.forEach((p) => {
      const show = matches(p);
      cardsEl.querySelector(`[data-id="${p.id}"]`).hidden = !show;
      if (show) shown += 1;
    });
  };
  if (animate) flipCards($$('.card', cardsEl), update);
  else update();
  countEl.textContent = `${shown} ${shown === 1 ? 'project' : 'projects'}`;
  emptyEl.hidden = shown > 0;
}

function moveInk(tab) {
  tabInk.style.width = `${tab.offsetWidth}px`;
  tabInk.style.transform = `translateX(${tab.offsetLeft}px)`;
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    moveInk(tab);
    filterState.type = tab.dataset.type;
    applyFilters();
  });
});

filtersForm.addEventListener('change', (e) => {
  filterState[e.target.name] = e.target.value;
  applyFilters();
});
filtersForm.addEventListener('reset', () => {
  // Wait for the browser to reset the selects before reading them
  setTimeout(() => {
    Object.assign(filterState, { region: 'all', size: 'all', facing: 'all' });
    applyFilters();
  });
});
filtersForm.addEventListener('submit', (e) => e.preventDefault());
$('#empty-reset').addEventListener('click', () => {
  filtersForm.reset();
  tabs[0].click();
});

// ---------- How it works ----------
const howSection = $('#how');
const howTexts = $$('.how-text');
const howImgs = $$('.how-img');
const howSteps = $$('.how-steps button');
const insetPlots = [PLOTS[0], PLOTS[13], PLOTS[21], PLOTS[30]];
let currentStep = -1;

function setStep(i) {
  if (i === currentStep) return;
  const previous = currentStep;
  currentStep = i;
  howTexts.forEach((el, k) => el.classList.toggle('is-active', k === i));
  // The new image wipes in over the previous one, which stays visible beneath
  howImgs.forEach((el, k) => {
    el.classList.toggle('is-prev', k === previous);
    el.classList.toggle('is-active', k === i);
  });
  const inset = $('.how-inset');
  inset.classList.remove('is-bump');
  void inset.offsetWidth;
  inset.classList.add('is-bump');
  howSteps.forEach((el, k) => {
    el.classList.toggle('is-active', k === i);
    el.setAttribute('aria-current', k === i ? 'step' : 'false');
  });
  const plot = insetPlots[i];
  $('#inset-id').textContent = plot.id;
  $('#inset-meta').textContent = `${plot.area} sq. yd. · ${plot.facing}`;
}

howSteps.forEach((btn) => {
  btn.addEventListener('click', () => {
    const i = Number(btn.dataset.step);
    if (isDesktop()) {
      // On desktop the steps follow the scroll, so jump to that step's position
      const travel = howSection.offsetHeight - window.innerHeight;
      scrollToTarget(howSection.offsetTop + travel * ((i + 0.5) / howSteps.length), 0);
    } else {
      setStep(i);
    }
  });
});
setStep(0);

// ---------- Statement: words light up with scroll ----------
const revealWords = $('.reveal-words');
const words = revealWords.textContent.trim().split(/\s+/);
revealWords.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
const wordSpans = $$('.w', revealWords);

// ---------- Stat cards from the sample plot data ----------
function buildBars(el, values, highlight) {
  el.innerHTML = values.map((v, i) => `<i data-h="${Math.round(v * 100)}" style="--d:${i * 0.04}s"${highlight(v, i) ? ' class="hi"' : ''}></i>`).join('');
}
const COLS = 8;
const perColumn = Array.from({ length: COLS }, (_, c) => PLOTS.filter((p, i) => i % COLS === c && p.status === 'available').length / 5);
const maxCol = Math.max(...perColumn);
buildBars($('#bars-available'), perColumn.map((v) => Math.max(v, 0.08)), (v) => v === maxCol);
buildBars($('#bars-sizes'), PLOTS.slice(0, 12).map((p) => p.area / 200), (v) => v === 1);
const floorProgress = Array.from({ length: 12 }, (_, f) => (f < 5 ? 1 : f < 8 ? 0.6 : 0.06));
buildBars($('#bars-floors'), floorProgress, (v) => v === 1);

const availablePct = Math.round((PLOTS.filter((p) => p.status === 'available').length / PLOTS.length) * 100);
const countTargets = { 'stat-available': availablePct, 'stat-floors': 5 };

function countUp(el, target) {
  if (reduceMotion) { el.textContent = target; return; }
  const start = performance.now();
  const tick = (now) => {
    const t = clamp01((now - start) / 1000);
    el.textContent = Math.round(target * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    statObserver.unobserve(entry.target);
    $$('.bars i', entry.target).forEach((bar) => { bar.style.height = `${bar.dataset.h}%`; });
    const num = $('[data-count]', entry.target);
    if (num) countUp(num, countTargets[num.id]);
  });
}, { threshold: 0.35 });
$$('.stat-card').forEach((card) => statObserver.observe(card));

// ---------- Theme ----------
const root = document.documentElement;
const themeBtn = $('.theme-btn');
const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function setTheme(theme) {
  root.dataset.theme = theme;
  themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  try { localStorage.setItem('meg-theme', theme); } catch (err) { /* private mode: theme just isn't remembered */ }
  if (estate) estate.setTheme(theme);
}
themeBtn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
themeBtn.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));

// ---------- Walk the venture (3D) ----------
const walkSection = $('#plots');
const walkStops = $$('.walk-stops li');
const walkBar = $('#walk-bar');
const plotTip = $('#plot-tip');
const plotById = new Map(PLOTS.map((p) => [p.id, p]));
const STATUS_TEXT = { available: 'Available', reserved: 'Reserved', booked: 'Booked', sold: 'Sold', 'not-for-sale': 'Not for sale' };
let estate = null;

import('./estate3d.js')
  .then(({ createEstate }) => {
    estate = createEstate($('#estate'), {
      theme: currentTheme(),
      onHover: (id, x, y) => {
        if (!id) { plotTip.hidden = true; return; }
        const plot = plotById.get(id);
        plotTip.textContent = `${plot.id} · ${plot.area} sq. yd. · ${STATUS_TEXT[plot.status]}`;
        plotTip.style.left = `${x}px`;
        plotTip.style.top = `${y}px`;
        plotTip.hidden = false;
      },
    });
    if (!estate) walkSection.classList.add('no-webgl');
    onScroll();
  })
  .catch(() => walkSection.classList.add('no-webgl'));

// ---------- Enquiry context ----------
const enquiryTag = $('#enquiry-tag');
const subjectInput = $('#f-subject');
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

// ---------- Scroll-driven effects ----------
let ticking = false;

function onScroll() {
  nav.classList.toggle('is-solid', window.scrollY > 20);
  if (ticking || reduceMotion) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const vh = window.innerHeight;

    // How it works: step follows the scroll through the tall section (desktop)
    if (isDesktop()) {
      const r = howSection.getBoundingClientRect();
      const p = clamp01(-r.top / (howSection.offsetHeight - vh));
      setStep(Math.min(howSteps.length - 1, Math.floor(p * howSteps.length)));
    }

    // Statement words light up as the heading crosses the viewport
    const wr = revealWords.getBoundingClientRect();
    const wp = clamp01((vh * 0.85 - wr.top) / (vh * 0.45));
    const lit = Math.round(wp * wordSpans.length);
    wordSpans.forEach((s, i) => s.classList.toggle('is-lit', i < lit));

    // Walk the venture: the 3D build follows the scroll through the tall section
    const kr = walkSection.getBoundingClientRect();
    const kp = clamp01(-kr.top / Math.max(1, walkSection.offsetHeight - vh));
    if (estate) estate.setProgress(kp);
    walkBar.style.transform = `scaleX(${kp.toFixed(3)})`;
    const stop = kp < 0.3 ? 0 : kp < 0.6 ? 1 : 2;
    walkStops.forEach((li, i) => li.classList.toggle('is-on', i === stop));
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true'));
  onScroll();
});

// ---------- Start ----------
if (reduceMotion) wordSpans.forEach((s) => s.classList.add('is-lit'));
observeRenders();
observeReveals();
applyFilters({ animate: false });
initMotion();
moveInk(tabs[0]);
document.fonts?.ready.then(() => moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
onScroll();
