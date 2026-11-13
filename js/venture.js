// The Lucids Resort page: chapters scroll over the fixed 3D venture and steer
// its build and camera; a pinned reel shows the renders afterwards.

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

// ---------- Theme ----------
const themeBtn = $('.theme-btn');
const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
function syncThemeBtn() {
  themeBtn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}
themeBtn.addEventListener('click', () => {
  const theme = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = theme;
  try { localStorage.setItem('meg-theme', theme); } catch (err) { /* private mode: theme just isn't remembered */ }
  syncThemeBtn();
  if (venture) venture.setTheme(theme);
});
syncThemeBtn();

// ---------- Menu ----------
const nav = $('#nav');
const menuBtn = $('.menu-btn');
function setMenu(open) {
  nav.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('menu-open')));
$$('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

// ---------- Smooth scrolling ----------
let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || link.getAttribute('href').length < 2) return;
    const target = $(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: target.classList.contains('chap') ? 0 : -72, duration: 1.6 });
  });
}

// ---------- 3D venture ----------
const scene = $('#scene');
const canvas = $('#lucids');
const tip = $('#plot-tip');
const chapters = $$('.chap');
const railLinks = $$('.rail a');
const rail = $('.rail');
const journey = $('.journey');
const STOPS = [0, 0.25, 0.5, 0.75, 1];
let venture = null;

function showTip(info, x, y) {
  if (!info) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${info.title}</b> · ${info.meta}`;
  // Keep the tip on screen near the right edge
  const flip = x > window.innerWidth - 300;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.transform = flip ? 'translate(calc(-100% - 14px), 14px)' : '';
  tip.hidden = false;
}

import('./lucids3d.js')
  .then(({ createLucids }) => {
    venture = createLucids(canvas, { theme: currentTheme(), onHover: showTip, fixedSize: true });
    if (!venture) root.classList.add('no-webgl');
    else update();
  })
  .catch(() => root.classList.add('no-webgl'));

// Each chapter's resting scroll position maps onto a camera stop; between
// them the progress eases so the camera settles while a chapter is read
function chapterMarks() {
  const vh = window.innerHeight;
  return chapters.map((c) => c.offsetTop + c.offsetHeight / 2 - vh / 2);
}

function progressAt(y, marks) {
  if (y <= marks[0]) return STOPS[0];
  for (let i = 0; i < marks.length - 1; i++) {
    if (y <= marks[i + 1]) {
      const t = (y - marks[i]) / (marks[i + 1] - marks[i]);
      return STOPS[i] + (STOPS[i + 1] - STOPS[i]) * smooth(clamp01(t));
    }
  }
  return STOPS[STOPS.length - 1];
}

let marks = chapterMarks();
let active = -1;
function setActive(i) {
  if (i === active) return;
  active = i;
  chapters.forEach((c, k) => c.classList.toggle('is-on', k === i));
  railLinks.forEach((a, k) => a.classList.toggle('is-on', k === i));
  scene.classList.toggle('is-right', chapters[i].classList.contains('chap-right'));
}

// ---------- Gallery reel ----------
const reel = $('#gallery');
const track = $('#reel-track');
const reelBar = $('#reel-bar');
const shots = $$('.shot');
let reelTravel = 0;
function sizeReel() {
  if (reduceMotion) { reel.classList.add('is-static'); return; }
  reelTravel = Math.max(0, track.scrollWidth - window.innerWidth);
  reel.style.height = `${window.innerHeight + reelTravel}px`;
}

const shotObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-in'); });
}, { threshold: 0.35 });
shots.forEach((s) => shotObserver.observe(s));

// ---------- Scroll ----------
let ticking = false;
function update() {
  ticking = false;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const journeyEnd = journey.offsetTop + journey.offsetHeight;

  if (venture) venture.setProgress(progressAt(y, marks));
  // Nearest chapter is the one being read
  let nearest = 0;
  marks.forEach((m, i) => { if (Math.abs(y - m) < Math.abs(y - marks[nearest])) nearest = i; });
  setActive(nearest);

  // Past the journey the scene is covered, so stop drawing it
  const covered = y > journeyEnd;
  scene.classList.toggle('is-off', covered);
  if (venture) venture.setPaused(covered);
  rail.classList.toggle('is-off', y > journeyEnd - vh * 0.6);

  if (!reel.classList.contains('is-static')) {
    const rp = clamp01((y - reel.offsetTop) / Math.max(1, reelTravel));
    track.style.transform = `translate3d(${-rp * reelTravel}px, 0, 0)`;
    reelBar.style.transform = `scaleX(${rp.toFixed(3)})`;
  }
}
function requestUpdate() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(update);
}
window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener('resize', () => {
  sizeReel();
  marks = chapterMarks();
  requestUpdate();
});
window.addEventListener('load', () => {
  sizeReel();
  marks = chapterMarks();
  requestUpdate();
});

sizeReel();
setActive(0);
update();
