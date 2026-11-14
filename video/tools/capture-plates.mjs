// Capture footage from the live site, frame by frame.
//
// The site's hidden film mode (?film) hides its UI and lets this script draw
// exact frames: for each one it sets the camera, waits until every satellite
// tile / 3D frame / image has finished drawing, then screenshots it.
//
// Two kinds of output:
//   promo plates  video/plates/{flight,tour,plan}.mp4   for the HyperFrames film
//   web flight    assets/flight/flight-{land,port}.mp4   the footage the website
//                 itself scrubs with scroll (short GOP, no B-frames: instant seeks)
//
// Usage (from video/):  node tools/capture-plates.mjs [flight tour plan web-land web-port]
// Needs the site served at http://localhost:5180 (tools/serve.py) and ffmpeg.
// PLATE_SECONDS=1 makes a quick test capture.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATES = join(HERE, '..', 'plates');
const WEB_OUT = join(HERE, '..', '..', 'assets', 'flight');
const BASE = process.env.SITE || 'http://localhost:5180/';
const FPS = 30;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeEnds = (t) => 0.12 * ease(t) + 0.88 * t; // mostly linear, soft at the ends
const LAND = { width: 1920, height: 1080, deviceScaleFactor: 1 };

const PLATES_DEF = {
  flight: { seconds: 15, call: 'flight', query: '?film', viewport: LAND, progress: (u) => 0.015 + 0.925 * easeEnds(u) },
  tour: { seconds: 16, call: 'tour', query: '?film', viewport: LAND, progress: (u) => 0.02 + 0.96 * u },
  plan: { seconds: 18, call: 'plan', query: '?film', viewport: LAND, progress: (u) => 0.01 + 0.99 * easeEnds(u) },
  // Web footage: the whole flight, linear in scroll progress, labels and pin in shot
  'web-land': { seconds: 15, call: 'flight', query: '?film=web', web: true,
    viewport: { width: 1600, height: 900, deviceScaleFactor: 1 }, progress: (u) => u },
  'web-port': { seconds: 15, call: 'flight', query: '?film=web', web: true,
    viewport: { width: 430, height: 932, deviceScaleFactor: 720 / 430 }, progress: (u) => u },
};

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), '.cache', 'puppeteer', 'chrome');
  const builds = existsSync(base) ? readdirSync(base).sort().reverse() : [];
  for (const b of builds) {
    const p = join(base, b, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(sys)) return sys;
  throw new Error('No Chrome found: set CHROME=/path/to/chrome');
}

function encode(dir, out, web) {
  const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.jpg'), '-c:v', 'libx264'];
  if (web) {
    // Scrub-friendly: a keyframe every 5 frames and no B-frames, so any
    // position decodes in a few frames; no audio track
    args.push('-preset', 'slow', '-crf', '23', '-g', '5', '-keyint_min', '5', '-sc_threshold', '0', '-bf', '0', '-tune', 'film');
  } else {
    args.push('-preset', 'slow', '-crf', '14');
  }
  // H.264 needs even dimensions (the portrait capture can come out a pixel odd)
  args.push('-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out);
  execFileSync('ffmpeg', args);
}

async function capture(browser, name, def) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.setViewport(def.viewport);
  await page.goto(BASE + def.query, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => window.megFilm, { timeout: 60000 });
  await page.evaluate(() => window.megFilm.ready());

  const dir = join(PLATES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = Math.round((Number(process.env.PLATE_SECONDS) || def.seconds) * FPS);
  const started = Date.now();
  // A few warm-up frames so the first captured frame is fully settled
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((call, p, ms) => window.megFilm[call](p, ms), def.call, def.progress(0), 0);
  }
  for (let f = 0; f < frames; f += 1) {
    const u = frames === 1 ? 0 : f / (frames - 1);
    const ms = (f * 1000) / FPS;
    await page.evaluate((call, p, t) => window.megFilm[call](p, t), def.call, def.progress(u), ms);
    await page.screenshot({ path: join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if (f % 30 === 0) console.log(`${name}: ${f + 1}/${frames} (${((f + 1) / ((Date.now() - started) / 1000)).toFixed(1)} fps)`);
  }
  await page.close();

  if (def.web) {
    mkdirSync(WEB_OUT, { recursive: true });
    const out = join(WEB_OUT, `flight-${name.replace('web-', '')}.mp4`);
    encode(dir, out, true);
    console.log(`wrote ${out}`);
  } else {
    const out = join(PLATES, `${name}.mp4`);
    encode(dir, out, false);
    console.log(`wrote ${out}`);
  }
}

async function main() {
  const which = process.argv.slice(2).length ? process.argv.slice(2) : ['flight', 'tour', 'plan'];
  mkdirSync(PLATES, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--mute-audio'],
  });
  try {
    for (const name of which) {
      const def = PLATES_DEF[name];
      if (!def) throw new Error(`Unknown plate: ${name}`);
      await capture(browser, name, def);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
