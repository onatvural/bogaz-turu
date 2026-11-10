// Oyun: sahne kurulumu, yarış akışı, kamera, sıralama, çarpışmalar.
import * as THREE from 'three';
import { buildTrack } from './track.js';
import { buildWorld } from './world.js';
import { loadAssets } from './assets.js';
import { Kart, wrapAngle } from './kart.js';
import { makeAI, aiControl } from './ai.js';
import { Items } from './items.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { CHARACTERS, DIFFICULTY, TOTAL_LAPS } from './config.js';

const STEP = 1 / 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
const NOINP = { steer: 0, throttle: 0, brake: 0, drift: false, item: false };
const SPARK = [0xd8d8d8, 0x35e0d0, 0xffd23c, 0xff4f7a];

export class Game {
  constructor(canvas, audio, input) {
    this.canvas = canvas; this.audio = audio; this.input = input;
    const q = new URLSearchParams(location.search).get('q');
    const weak = input.isTouch || (navigator.hardwareConcurrency || 4) <= 2;
    this.quality = q != null ? +q : weak ? 0 : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality > 0, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality > 0 ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 6000);
    this.camYaw = 0; this.shake = 0; this.state = 'boot'; this.time = 0; this.acc = 0; this.raceTime = 0;
    this.karts = []; this.paused = false; this.debugAuto = false;
    this.onFinish = null; this.onState = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async init(onProgress) {
    await loadAssets(onProgress);
    this.T = buildTrack();
    this.world = buildWorld(this.scene, this.T, this.quality);
    this.fx = new FX(this.scene);
    this.items = new Items(this);
    this.hud = new HUD(this);
    // menü arkasında dönen tanıtım kamerası
    this.state = 'attract';
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- yarış kurulumu ----------
  startRace(charId, diffKey) {
    for (const k of this.karts) this.scene.remove(k.root);
    this.diff = DIFFICULTY[diffKey] || DIFFICULTY.normal;
    const me = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
    const others = CHARACTERS.filter((c) => c !== me).sort(() => Math.random() - 0.5);
    this.karts = [];
    // oyuncu en arkadan başlar
    others.forEach((c, i) => { const k = new Kart(this, c, false); k.ai = makeAI(i * 17 + ((Math.random() * 1000) | 0)); k.reset(i); this.karts.push(k); });
    this.player = new Kart(this, me, true);
    this.player.reset(others.length);
    this.karts.push(this.player);
    this.items.reset();
    this.hud.buildRank(this.karts);
    this.hud.last = {};
    this.raceTime = 0; this.stateT = 0; this.shake = 0; this.finishShown = false; this.lastLap = 0;
    this.camYaw = this.player.yaw;
    this.state = 'intro';
    this.paused = false;
    this.hud.show(true);
    this.setLights(0);
    this.audio.music(null);
    this.engine?.stop(); this.skid?.stop();
    this.engine = this.audio.loop('engine', 0); this.skid = this.audio.loop('skid', 0);
    if (!this.amb) this.amb = this.audio.loop('ambience', 0.16);
    this.rank();
    this.onState?.('intro');
  }

  setLights(n) {
    const L = this.world.startLights;
    L.forEach((l, i) => l.material.color.setHex(n === 4 ? 0x35ff6a : i < n ? 0xff3b30 : 0x331111));
  }

  stopRace() {
    this.state = 'attract';
    this.hud.show(false);
    this.engine?.stop(); this.skid?.stop(); this.engine = this.skid = null;
    for (const k of this.karts) this.scene.remove(k.root);
    this.karts = [];
    this.items.reset();
  }

  sfxAt(name, pos, vol = 1) {
    if (!this.player) return;
    const d = pos.distanceTo(this.player.pos);
    const v = vol * clamp(1 - d / 95, 0, 1);
    if (v > 0.03) this.audio.play(name, { vol: v });
  }

  // ---------- ana döngü ----------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 5) this.acc = 0;
      this.time += dt;
      this.world.update(dt, this.time, this.camera);
      this.fx.update(dt);
    }
    if (!this.freeCam) this.updateCamera(dt);
    if (this.player && this.state !== 'attract') this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // testler için: çizim yapmadan benzetimi ilerlet
  simulate(seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) { this.step(STEP); this.world.update(STEP, (this.time += STEP), this.camera); this.updateCamera(STEP); this.fx.update(STEP); }
  }

  step(dt) {
    if (this.state === 'attract' || this.state === 'boot') return;
    this.stateT += dt;
    const p = this.player;
    const inp = this.input.poll();

    if (this.state === 'intro') {
      for (const k of this.karts) k.syncVisual(dt, 0);
      if (this.stateT > 3.4) { this.state = 'countdown'; this.stateT = 0; this.cdN = -1; this.pressAt = -9; this.wasThrottle = false; }
      return;
    }
    if (this.state === 'countdown') {
      const n = Math.floor(this.stateT);
      if (n !== this.cdN && n < 3) {
        this.cdN = n;
        this.hud.message(String(3 - n), 0.9, 'count');
        this.audio.play(['v_uc', 'v_iki', 'v_bir'][n], { vol: 1 });
        this.setLights(n + 1);
      }
      if (inp.throttle && !this.wasThrottle) this.pressAt = this.stateT;
      this.wasThrottle = !!inp.throttle;
      for (const k of this.karts) k.syncVisual(dt, 0);
      if (this.engine) this.engine.set(0.2 + (inp.throttle ? 0.12 : 0), 0.6 + (inp.throttle ? 0.5 + Math.sin(this.time * 30) * 0.05 : 0));
      if (this.stateT >= 3) {
        this.state = 'race'; this.stateT = 0; this.raceTime = 0;
        this.hud.message('BAS GAZA!', 1.3, 'go');
        this.audio.play('v_basla', { vol: 1 });
        this.audio.music('music_race');
        this.setLights(4);
        // roket kalkış: "Bir!" ile birlikte gaza basan ödüllendirilir
        if (inp.throttle && this.pressAt > 2.15) { p.boost(1.4); this.hud.warn('Roket kalkış!', 1.4); }
        for (const k of this.karts) if (k.ai && Math.random() < 0.3) k.boost(0.9);
        this.onState?.('race');
      }
      return;
    }

    // ---- yarış / bitiş ----
    this.raceTime += dt;
    const T = this.T;
    for (const k of this.karts) {
      let ci;
      if (k.ai) {
        const gap = (p.prog - k.prog) * T.sp; // + ise oyuncunun gerisinde
        k.aiMul = this.diff.ai * k.ai.skill * (1 + this.diff.band * clamp(gap / 70, -1, 1.3));
        ci = aiControl(k, this, dt);
      } else if (this.debugAuto) {
        k.ai = k._auto || (k._auto = makeAI(99)); ci = aiControl(k, this, dt); k.ai = null;
      } else ci = inp;
      const lapBefore = k.lap;
      k.update(dt, ci);
      if (ci.item) this.items.use(k);
      if (k.lap > lapBefore) this.onLap(k);
      // turbo şeritleri
      if (k.padCd <= 0) for (const pad of this.world.boostPads) {
        if (Math.abs(((k.f - pad.i + T.N * 1.5) % T.N) - T.N / 2) < 2.4 && Math.abs(k.lat - pad.lat) < 2.8) { k.boost(1.15); k.padCd = 1; break; }
      }
      this.kartFx(k, dt);
    }
    this.collide();
    this.tram(dt);
    this.items.update(dt, this.time);
    this.rank();

    // oyuncu sesleri
    if (this.engine) {
      const r = Math.abs(p.speed) / p.vmaxBase;
      this.engine.set(0.16 + r * 0.14, 0.55 + r * 1.05 + (p.boostT > 0 ? 0.25 : 0));
      this.skid.set(p.drift.on ? 0.22 : 0, 0.9 + p.drift.level * 0.12);
    }
    if (p.wrongWay > 1.2 && !p.finished) this.hud.warn('TERS YÖN!', 0.3);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    if (this.state === 'finished') {
      if (!this.finishShown && this.stateT > 3) { this.finishShown = true; this.onFinish?.(); }
      if (this.stateT < 2.2 && Math.random() < 0.6) {
        V.copy(p.pos); V.x += (Math.random() - 0.5) * 12; V.z += (Math.random() - 0.5) * 12; V.y += 6;
        this.fx.spawn(V.x, V.y, V.z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, [0xe23b2e, 0xffd23c, 0x35e0d0, 0xffffff, 0xff7ab8][(Math.random() * 5) | 0], 0.5, 1.6, 9);
      }
    }
  }

  onLap(k) {
    if (k.lap > TOTAL_LAPS && !k.finished) {
      k.finished = true; k.finishTime = this.raceTime;
      this.rank();
      if (k.isPlayer) {
        this.state = 'finished'; this.stateT = 0;
        k.ai = makeAI(7); // bitişten sonra kendi kendine sürsün
        this.hud.message('BİTTİ!', 2.2, 'go');
        this.audio.play('finish', { vol: 0.8 });
        this.audio.play('v_bitti', { vol: 1 });
        this.audio.music('music_results');
        this.engine?.set(0, 1); this.skid?.set(0);
        const voice = k.place === 1 ? 'v_birinci' : k.place <= 3 ? 'v_podyum' : 'v_gec';
        setTimeout(() => this.audio.play(voice, { vol: 1 }), 1500);
        this.onState?.('finished');
      }
      return;
    }
    if (!k.isPlayer || k.lap <= 1) return;
    if (k.lap === TOTAL_LAPS) {
      this.hud.message('SON TUR!', 1.8, 'go');
      this.audio.play('v_sontur', { vol: 1 });
      this.audio.music('music_race', 1.1);
    } else this.hud.message(`TUR ${k.lap}/${TOTAL_LAPS}`, 1.4, 'lap');
    this.audio.play('lap', { vol: 0.6 });
  }

  rank() {
    const s = [...this.karts].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.prog - a.prog;
    });
    s.forEach((k, i) => (k.place = i + 1));
    this.order = s;
  }

  collide() {
    const ks = this.karts, R = 2.5;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (R - d) / 2, nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
      const closing = (a.speed * Math.sin(a.velYaw) - b.speed * Math.sin(b.velYaw)) * nx + (a.speed * Math.cos(a.velYaw) - b.speed * Math.cos(b.velYaw)) * nz;
      if (closing > 4) {
        a.speed *= 0.96; b.speed *= 0.96;
        if ((a.isPlayer || b.isPlayer) && a.bumpCd <= 0 && b.bumpCd <= 0) { a.bumpCd = b.bumpCd = 0.5; this.audio.play('bump', { vol: 0.45 }); this.shake = Math.max(this.shake, 0.15); }
      }
    }
  }

  tram(dt) {
    const tr = this.world.tram, T = this.T, p = this.player;
    for (const k of this.karts) {
      const df = (((k.f - tr.f + T.N * 1.5) % T.N) - T.N / 2) * T.sp;
      const dl = k.lat - tr.lat;
      const ox = tr.halfLen + 1.5 - Math.abs(df), oy = tr.halfWid + 1.15 - Math.abs(dl);
      if (ox <= 0 || oy <= 0) continue;
      const i = k.idx;
      if (oy < ox * 0.7) {
        const s = Math.sign(dl) || 1;
        k.pos.x += T.rx[i] * s * oy; k.pos.z += T.rz[i] * s * oy;
        k.speed *= 0.985;
      } else if (df < 0) {
        // arkadan bindirdi
        k.pos.x -= T.tx[i] * ox; k.pos.z -= T.tz[i] * ox;
        if (k.speed - tr.speed > 16) k.hit(1.0); else k.speed = Math.min(k.speed, tr.speed * 0.7);
      } else { k.pos.x += T.tx[i] * ox; k.pos.z += T.tz[i] * ox; k.speed = Math.max(k.speed, tr.speed + 3); }
      if (k.isPlayer && k.bumpCd <= 0) { k.bumpCd = 0.5; this.audio.play('bump', { vol: 0.6 }); }
    }
    // zil
    this.bellT = (this.bellT || 0) - dt;
    if (p && this.bellT <= 0) {
      const d = tr.obj.position.distanceTo(p.pos);
      if (d < 70) { this.audio.play('tram_bell', { vol: clamp(1 - d / 70, 0, 1) * 0.6 }); this.bellT = 3.2; }
    }
  }

  kartFx(k, dt) {
    if (k.pos.distanceToSquared(this.camera.position) > 120 * 120) return;
    const yaw = k.root.rotation.y, sx = Math.sin(yaw), cz = Math.cos(yaw);
    const bx = k.pos.x - sx * 1.5, bz = k.pos.z - cz * 1.5;
    if (k.drift.on) {
      const col = SPARK[k.drift.level];
      for (const s of [-1, 1]) {
        if (Math.random() < 0.7) this.fx.spawn(bx + cz * s * 1.0, k.y + 0.25, bz - sx * s * 1.0, -sx * 3 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, -cz * 3 + (Math.random() - 0.5) * 4, col, k.drift.level ? 0.34 : 0.22, 0.3 + Math.random() * 0.2, 14);
      }
    }
    if (k.boostT > 0 && Math.random() < 0.8) {
      this.fx.spawn(bx + (Math.random() - 0.5), k.y + 0.8, bz + (Math.random() - 0.5), -sx * 6, 1 + Math.random() * 2, -cz * 6, Math.random() > 0.5 ? 0xff7a1a : 0xffd23c, 0.5, 0.35, 0);
    }
  }

  // ---------- kamera ----------
  updateCamera(dt) {
    const cam = this.camera, T = this.T;
    if (this.state === 'attract' || !this.player) {
      // pistin üzerinde ağır ağır süzül
      const f = (this.time * 9) % T.N;
      T.pointAt(f, 0, V, 17);
      T.pointAt(f + 20, 0, V2, 3);
      cam.position.lerp(V, 1 - Math.exp(-dt * 2));
      cam.lookAt(V2);
      cam.fov = 62; cam.updateProjectionMatrix();
      return;
    }
    const k = this.player;
    if (this.state === 'intro') {
      const u = clamp(this.stateT / 3.4, 0, 1), e = 1 - (1 - u) ** 3;
      const ang = k.yaw + Math.PI + (1 - e) * 2.6, dist = 8.6 + (1 - e) * 30, h = 4 + (1 - e) * 16;
      cam.position.set(k.pos.x + Math.sin(ang) * dist, k.y + h, k.pos.z + Math.cos(ang) * dist);
      cam.lookAt(k.pos.x, k.y + 1.5, k.pos.z);
      this.camYaw = k.yaw;
      cam.fov = 66; cam.updateProjectionMatrix();
      return;
    }
    if (this.state === 'finished') {
      const ang = k.yaw + 2.4 + this.stateT * 0.35;
      V.set(k.pos.x + Math.sin(ang) * 10, k.y + 3.6, k.pos.z + Math.cos(ang) * 10);
      cam.position.lerp(V, 1 - Math.exp(-dt * 3));
      cam.lookAt(k.pos.x, k.y + 1.4, k.pos.z);
      return;
    }
    const target = k.spinT > 0 ? this.camYaw : k.yaw;
    this.camYaw = wrapAngle(this.camYaw + wrapAngle(target - this.camYaw) * (1 - Math.exp(-5.5 * dt)));
    const sx = Math.sin(this.camYaw), cz = Math.cos(this.camYaw);
    const boost = k.boostT > 0 ? 1 : 0;
    const dist = 9.6 + boost * 0.9;
    let cx = k.pos.x - sx * dist, czz = k.pos.z - cz * dist;
    // çarşının içinde kamerayı duvarların arasında tut
    const ci = T.locate(cx, czz, k.idx, 14, 4);
    if (T.kind[ci] === 'carsi') {
      const lat = (cx - T.px[ci]) * T.rx[ci] + (czz - T.pz[ci]) * T.rz[ci], lim = T.hw[ci] - 0.9;
      if (Math.abs(lat) > lim) { const o = lat - Math.sign(lat) * lim; cx -= T.rx[ci] * o; czz -= T.rz[ci] * o; }
    }
    const sh = this.shake * 0.5;
    cam.position.set(cx + (Math.random() - 0.5) * sh, Math.max(k.y, T.py[ci]) + 4.7 + (Math.random() - 0.5) * sh, czz + (Math.random() - 0.5) * sh);
    cam.lookAt(k.pos.x + sx * 5, k.y + 2.1, k.pos.z + cz * 5);
    const fov = 64 + clamp(Math.abs(k.speed) / k.vmaxBase, 0, 1.3) * 9 + boost * 7;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 5);
    cam.updateProjectionMatrix();
  }
}
