// Motion layer: smooth scrolling and scroll-linked transitions, modelled on the
// reference reel (push-in hero, rising headings, clip-wipe images, cards that
// rearrange when filtered, a word that carries into the next heading, a cycling
// image deck). Everything is progressive: without GSAP/Lenis or with reduced
// motion, content simply sits in place.

const { gsap, ScrollTrigger } = window;
const LenisCtor = window.Lenis;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionEnabled = Boolean(gsap && ScrollTrigger) && !reduce;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

let lenis = null;

// ---------- Public helpers ----------
export function scrollToTarget(target, offset = -80) {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.4 });
    return;
  }
  const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}

// Cards rearrange when filters change (FLIP): leavers shrink out where they
// stood, cards that stay glide to their new slot, newcomers scale in
export function flipCards(cards, mutate) {
  if (!motionEnabled || !cards.length) {
    mutate();
    return;
  }
  const grid = cards[0].parentElement;
  const gridRect = grid.getBoundingClientRect();
  const before = new Map(cards.filter((c) => !c.hidden).map((c) => [c, c.getBoundingClientRect()]));
  cards.forEach((c) => gsap.killTweensOf(c));

  mutate();

  const leaving = cards.filter((c) => c.hidden && before.has(c));
  leaving.forEach((card) => {
    const was = before.get(card);
    card.hidden = false;
    Object.assign(card.style, {
      position: 'absolute', margin: '0', zIndex: '0', pointerEvents: 'none',
      left: `${was.left - gridRect.left}px`, top: `${was.top - gridRect.top}px`,
      width: `${was.width}px`, height: `${was.height}px`,
    });
    gsap.to(card, {
      opacity: 0, scale: 0.86, duration: 0.4, ease: 'power2.in',
      onComplete: () => {
        card.hidden = true;
        card.removeAttribute('style');
      },
    });
  });

  let entering = 0;
  cards.forEach((card) => {
    if (card.hidden || leaving.includes(card)) return;
    const was = before.get(card);
    const now = card.getBoundingClientRect();
    if (was) {
      gsap.fromTo(card, { x: was.left - now.left, y: was.top - now.top, opacity: 1 }, {
        x: 0, y: 0, duration: 0.75, ease: 'power3.inOut', clearProps: 'transform',
      });
    } else {
      gsap.fromTo(card, { opacity: 0, scale: 0.86, y: 40 }, {
        opacity: 1, scale: 1, y: 0, duration: 0.65, ease: 'power3.out',
        delay: 0.2 + entering * 0.07, clearProps: 'transform,opacity',
      });
      entering += 1;
    }
  });
}

// Split a heading into words that sit in clipping wrappers so they can rise
export function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  return words.map((word, i) => {
    const outer = document.createElement('span');
    outer.className = 'wd';
    const inner = document.createElement('span');
    inner.textContent = word;
    outer.append(inner);
    el.append(outer);
    if (i < words.length - 1) el.append(' ');
    return inner;
  });
}

// ---------- Setup ----------
export function initMotion() {
  if (!motionEnabled) return;
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('has-motion');

  setupSmoothScroll();
  setupNav();
  setupHero();
  setupHeadings();
  setupCards();
  setupStats();
  setupHowFrame();
  setupMorph();
  setupDeck();

  // Images arrive after first paint, so measure again once they settle
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

function setupSmoothScroll() {
  if (!LenisCtor) return;
  lenis = new LenisCtor({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    smoothWheel: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const target = hash === '#top' || hash === '#' ? 0 : document.querySelector(hash);
    if (target === null) return;
    e.preventDefault();
    scrollToTarget(target);
  });
}

function setupNav() {
  const nav = $('#nav');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const hide = self.direction === 1 && self.scroll() > 320 && !nav.classList.contains('menu-open');
      nav.classList.toggle('is-hidden', hide);
    },
  });
}

// Hero: the image pushes in from a framed card, then shrinks away on scroll
function setupHero() {
  const frame = $('.hero-frame');
  const img = $('.hero-frame img');
  gsap.set(img, { transition: 'opacity 0.8s' });

  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .fromTo(frame, { clipPath: 'inset(16% 12% 0% 12% round 32px)' }, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.9 }, 0.2)
    .fromTo(img, { scale: 1.4 }, { scale: 1.12, duration: 2.4 }, 0.2)
    .from('.hero-card', { y: 70, opacity: 0, duration: 1.2 }, 1)
    .from('.nav-row > *', { y: -20, opacity: 0, duration: 1, stagger: 0.08 }, 0.1);

  gsap.to(frame, {
    scale: 0.9, borderRadius: 40, ease: 'none',
    scrollTrigger: { trigger: '.hero-media', start: 'top 15%', end: 'bottom top', scrub: true },
  });
  gsap.to(img, {
    yPercent: 9, ease: 'none',
    scrollTrigger: { trigger: '.hero-media', start: 'top top', end: 'bottom top', scrub: true },
  });
}

// Headings rise word by word as they enter; the partner heading slides in sideways
function setupHeadings() {
  $$('.h2').forEach((h) => {
    if (h.classList.contains('reveal-words') || h.id === 'walk-title') return;
    const words = splitWords(h);
    const sideways = h.id === 'partner-title';
    gsap.from(words, {
      yPercent: sideways ? 0 : 115,
      x: sideways ? -90 : 0,
      opacity: sideways ? 0 : 1,
      duration: 1.1,
      ease: 'power4.out',
      stagger: 0.05,
      scrollTrigger: { trigger: h, start: 'top 88%' },
    });
  });
}

function setupCards() {
  const cards = $$('.card');
  gsap.set(cards, { opacity: 0, y: 90 });
  ScrollTrigger.batch(cards, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.to(batch, {
      opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, clearProps: 'transform',
    }),
  });
}

function setupStats() {
  const cards = $$('.stat-card');
  cards.forEach((c) => c.removeAttribute('data-reveal'));
  gsap.from(cards, {
    y: 70, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.stat-cards', start: 'top 88%' },
  });
}

// The how-it-works frame opens like a card and scales in with the scroll
function setupHowFrame() {
  const media = $('.how-media');
  gsap.fromTo(media, { scale: 0.86, borderRadius: 40 }, {
    scale: 1, borderRadius: 20, ease: 'none',
    scrollTrigger: { trigger: '.how', start: 'top 85%', end: 'top 10%', scrub: true },
  });
}

// The word "plot" leaves the statement and lands in the next heading
function setupMorph() {
  const srcWord = $$('.reveal-words .w').find((w) => /^plot$/i.test(w.textContent.replace(/[^\w]/g, '')));
  const title = $('#walk-title');
  if (!srcWord || !title) return;

  const words = splitWords(title);
  const dst = words.find((w) => /^plot$/i.test(w.textContent)) || words[words.length - 1];
  const others = words.filter((w) => w !== dst);
  const fade = $$('.reveal-words .w').filter((w) => w !== srcWord);

  const clone = document.createElement('span');
  clone.className = 'morph-word';
  clone.textContent = dst.textContent;
  clone.setAttribute('aria-hidden', 'true');
  document.body.append(clone);

  const syncFont = () => {
    const cs = getComputedStyle(title);
    Object.assign(clone.style, {
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
    });
  };
  syncFont();
  dst.style.opacity = '0';
  const ease = gsap.parseEase('power2.inOut');

  const update = (self) => {
    const p = self.progress;
    const a = srcWord.getBoundingClientRect();
    const b = dst.getBoundingClientRect();
    const travelling = p > 0 && p < 1;
    const e = ease(p);
    clone.style.visibility = travelling ? 'visible' : 'hidden';
    clone.style.transform = `translate(${a.left + (b.left - a.left) * e}px, ${a.top + (b.top - a.top) * e}px)`;
    srcWord.style.opacity = p > 0 ? '0' : '';
    dst.style.opacity = p >= 1 ? '1' : '0';
    fade.forEach((w) => { w.style.opacity = String(1 - clamp01(p * 2.2) * 0.88); });
    others.forEach((w, i) => {
      const t = clamp01((p - 0.45 - i * 0.08) / 0.35);
      w.style.transform = `translateY(${((1 - t) * 115).toFixed(1)}%)`;
    });
  };

  ScrollTrigger.create({
    trigger: '#plots',
    start: 'top 92%',
    end: 'top 28%',
    scrub: true,
    onUpdate: update,
    onRefresh: (self) => { syncFont(); update(self); },
  });
}

// Partner images: a fanned deck that flies in, then keeps cycling while in view
function setupDeck() {
  const deck = $('.deck');
  if (!deck) return;
  const cards = $$('.deck-card', deck);
  const SLOTS = [
    { xPercent: 24, yPercent: 2, rotation: 3, scale: 1, zIndex: 3 },
    { xPercent: -6, yPercent: -4, rotation: -4, scale: 0.88, zIndex: 2 },
    { xPercent: -34, yPercent: -9, rotation: -9, scale: 0.76, zIndex: 1 },
  ];
  let order = [...cards];
  const place = (dur) => order.forEach((card, i) => {
    gsap.set(card, { zIndex: SLOTS[i].zIndex });
    gsap.to(card, { ...SLOTS[i], duration: dur, ease: 'power3.inOut' });
  });

  // Replace the static CSS fan (used when motion is off) with GSAP-owned transforms
  gsap.set(cards, { x: 0, y: 0, scale: 1, xPercent: 180, rotation: 18, opacity: 0 });
  let timer = null;
  const cycle = () => {
    const front = order[0];
    order = [...order.slice(1), front];
    gsap.timeline()
      .to(front, { xPercent: 150, rotation: 16, opacity: 0, duration: 0.55, ease: 'power2.in' })
      .add(() => place(0.8), 0.15)
      .set(front, { ...SLOTS[2], xPercent: -80, opacity: 0, zIndex: 0 })
      .to(front, { ...SLOTS[2], opacity: 1, duration: 0.7, ease: 'power3.out' });
  };

  ScrollTrigger.create({
    trigger: deck,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      order.forEach((card, i) => {
        gsap.set(card, { zIndex: SLOTS[i].zIndex });
        gsap.to(card, { ...SLOTS[i], opacity: 1, duration: 1.3, ease: 'expo.out', delay: (order.length - 1 - i) * 0.12 });
      });
    },
  });
  ScrollTrigger.create({
    trigger: deck,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      clearInterval(timer);
      if (self.isActive) timer = setInterval(cycle, 3200);
    },
  });
}
