#!/usr/bin/env node
// Oyunu başsız Chromium'da açar ve verilen senaryoyu çalıştırır: benzetim ilerletme, ölçüm, ekran görüntüsü.
// Kullanım: node tools/play.mjs <senaryo.mjs> [--url http://localhost:5183/?q=1] [--w 1280] [--h 720] [--out /tmp/bt]
// Senaryo: export default async ({ page, ev, shot, race, sim, cam, log }) => { ... }
// Önce `npm run dev` çalışıyor olmalı. Tarayıcı yolu: CHROME_PATH ortam değişkeni ya da bilinen yerler.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const url = flag('url', 'http://localhost:5183/?q=1');
const W = +flag('w', 1280), H = +flag('h', 720);
const out = resolve(flag('out', '/tmp/bt-shots'));
const file = args[0];
if (!file) { console.error('senaryo dosyası gerekli'); process.exit(2); }
mkdirSync(out, { recursive: true });

const chrome = [process.env.CHROME_PATH, '/root/.local/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!chrome) { console.error('Chromium bulunamadı; CHROME_PATH ver'); process.exit(2); }

// Aynı anda tek tarayıcı: küçük makinelerde iki başsız Chromium belleği tüketir.
const LOCK = '/tmp/bt-play.lock';
const t0 = Date.now();
for (;;) {
  try { mkdirSync(LOCK); break; } catch (e) {
    let age = 0;
    try { age = Date.now() - statSync(LOCK).mtimeMs; } catch (e2) { continue; }
    if (age > 6 * 60e3) { rmSync(LOCK, { recursive: true, force: true }); continue; } // bayat kilit
    if (Date.now() - t0 > 15 * 60e3) { console.error('kilit alınamadı:', LOCK); process.exit(2); }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
const unlock = () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch (e) { /* yok */ } };
process.on('exit', unlock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
const beat = setInterval(() => { try { utimesSync(LOCK, new Date(), new Date()); } catch (e) { /* yok */ } }, 30e3);
beat.unref();

const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H },
});
let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e.stack || e)); console.log('SAYFA HATASI:', String(e.stack || e).slice(0, 600)); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bt && window.__bt.state === "attract"', { timeout: 180000 });

  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const h = {
    page, ev, errors,
    log: (...a) => console.log(...a),
    // yarışı başlat; oyun döngüsü durur, zaman yalnız sim() ile ilerler
    race: (char = 'simitci', diff = 'normal', auto = true) => ev((c, d, a) => {
      const g = window.__bt;
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
      document.body.classList.add('racing');
      g.startRace(c, d); g.paused = true; g.debugAuto = a;
    }, char, diff, auto),
    sim: (seconds) => ev((s) => window.__bt.simulate(s), seconds),
    // serbest kamera: konum ve bakış noktası
    cam: (pos, look, fov = 64) => ev((p, l, f) => {
      const g = window.__bt; g.freeCam = true;
      g.camera.position.set(p[0], p[1], p[2]); g.camera.lookAt(l[0], l[1], l[2]); g.camera.fov = f; g.camera.updateProjectionMatrix();
    }, pos, look, fov),
    followCam: () => ev(() => { window.__bt.freeCam = false; }),
    shot: async (name) => {
      // bir kare çizilsin
      await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const p = `${out}/${name}.png`;
      await page.screenshot({ path: p });
      console.log('görüntü:', p);
      return p;
    },
  };
  const mod = await import(pathToFileURL(resolve(file)).href);
  const res = await mod.default(h);
  if (res !== undefined) console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 1));
  if (errors.length) { console.log(`${errors.length} sayfa hatası`); failed = true; }
} catch (e) {
  console.error('SENARYO HATASI:', e.stack || e);
  failed = true;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
