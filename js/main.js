import { initMotion, flipCards, scrollToTarget } from './motion.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

// ---------- Projects ----------
// The Lucids Resort figures come from its VMRDA layout plan; Hasini Infra
// projects use Hasini Infra's own names, places and images.
const PROJECTS = [
  {
    id: 'lucids', name: 'The Lucids Resort', type: 'plots', region: 'vmrda', location: 'VMRDA region, Andhra Pradesh',
    chips: ['102 plots', '12 m roads', 'Resort at the gate'], status: 'Explore in 3D', live: true,
    img: 'assets/lucids/aerial-day.webp', alt: "Artist's impression of The Lucids Resort from the air", cap: "Artist's impression",
    href: 'resort.html', feature: true,
  },
  { id: 'platinum-county', name: 'Platinum County', type: 'apartments', region: 'guntur', location: 'Amaravati Road, Guntur', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/platinum-county.jpg' },
  { id: 'royal-castle', name: 'Royal Castle', type: 'apartments', region: 'bhimavaram', location: 'Bhimavaram', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/royal-castle.jpg' },
  { id: 'pcr-pride', name: 'PCR Pride', type: 'apartments', region: 'bhimavaram', location: 'Bhimavaram', chips: ['Apartments', 'Current project'], status: 'Current', live: true, img: 'assets/hasini/pcr-pride.jpg' },
  { id: 'vibhav-towers', name: 'Vibhav Towers', type: 'completed', region: 'kakinada', location: 'Kakinada', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/vibhav-towers.jpg' },
  { id: 'madhu-kranthi', name: 'Madhu Kranthi', type: 'completed', region: 'andhra', location: 'Andhra Pradesh', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/madhu-kranthi.jpg' },
  { id: 'sai-lakshmi', name: 'Sai Lakshmi', type: 'completed', region: 'andhra', location: 'Andhra Pradesh', chips: ['Apartments', 'Completed'], status: 'Completed', img: 'assets/hasini/sai-lakshmi.jpg' },
];

// ---------- Images fade in once loaded ----------
function observeMedia(scope = document) {
  $$('.media img', scope).forEach((img) => {
    const frame = img.closest('.media');
    if (img.complete && img.naturalWidth) frame.classList.add('is-ready');
    else img.addEventListener('load', () => frame.classList.add('is-ready'), { once: true });
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
const filterState = { type: 'all', region: 'all' };

cardsEl.innerHTML = PROJECTS.map((p) => {
  const tag = p.href ? 'a' : 'article';
  const by = p.feature ? 'A MegEstates venture' : 'Hasini Infra';
  return `
  <${tag} class="card${p.feature ? ' card-feature' : ''}" data-id="${p.id}"${p.href ? ` href="${p.href}"` : ''}>
    <figure class="media">
      <img src="${p.img}" alt="${p.alt || `${p.name}, ${p.location}`}" loading="lazy">
      <span class="cap">${p.cap || 'Hasini Infra image'}</span>
      <span class="status${p.live ? ' is-live' : ''}">${p.status}</span>
    </figure>
    <div class="card-body">
      <p class="card-by">${by}</p>
      <div class="card-row"><h3>${p.name}</h3>${p.href ? '<span class="card-go" aria-hidden="true"></span>' : ''}</div>
      <p class="card-loc">${p.location}</p>
      <div class="chips">${p.chips.map((c) => `<span>${c}</span>`).join('')}</div>
      ${p.href ? '' : `<a class="link-arrow card-enquire" href="#contact" data-interest="${p.name} · Hasini Infra">Enquire</a>`}
    </div>
  </${tag}>`;
}).join('');

function matches(p) {
  const f = filterState;
  if (f.type !== 'all' && p.type !== f.type) return false;
  if (f.region !== 'all' && p.region !== f.region) return false;
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
    Object.assign(filterState, { region: 'all' });
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
const insetPlots = [['Plot 14', '12 m road'], ['Plot 34', 'Marked on the ground'], ['Plot 107', 'As on the layout plan'], ['Plot 115', 'Next to the resort']];
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
  const [id, meta] = insetPlots[i];
  $('#inset-id').textContent = id;
  $('#inset-meta').textContent = meta;
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

// ---------- Stat cards from the layout plan ----------
function buildBars(el, values, highlight) {
  const max = Math.max(...values);
  el.innerHTML = values.map((v, i) => `<i data-h="${Math.round((v / max) * 100)}" style="--d:${i * 0.04}s"${highlight(v, i) ? ' class="hi"' : ''}></i>`).join('');
}
// Plots per block from south to north, then the west block and the small groups
const PLOTS_BY_BLOCK = [20, 20, 22, 22, 11, 2, 3, 2];
const ROAD_AREAS = [1645.75, 1560.26, 1597.41, 1597.41, 1597.41, 1035.75, 787.55, 563.9, 328.03];
const AMENITY_AREAS = [208.59, 372.38, 248.75, 301.98, 367.56, 301.96, 327.77, 185.75, 274.12, 263.31, 201.25, 201.25, 297.37];
buildBars($('#bars-plots'), PLOTS_BY_BLOCK, (v) => v === 22);
buildBars($('#bars-roads'), ROAD_AREAS, (v) => v === Math.max(...ROAD_AREAS));
buildBars($('#bars-amenity'), AMENITY_AREAS, (v) => v === Math.max(...AMENITY_AREAS));
const countTargets = { 'stat-plots': 102, 'stat-amenity': 13 };

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
let estate = null;

import('./lucids3d.js')
  .then(({ createLucids }) => {
    estate = createLucids($('#estate'), {
      theme: currentTheme(),
      onHover: (info, x, y) => {
        if (!info) { plotTip.hidden = true; return; }
        plotTip.innerHTML = `<b>${info.title}</b> · ${info.meta}`;
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
    const stop = kp < 0.14 ? 0 : kp < 0.32 ? 1 : 2;
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
observeMedia();
observeReveals();
applyFilters({ animate: false });
initMotion();
moveInk(tabs[0]);
document.fonts?.ready.then(() => moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
onScroll();
