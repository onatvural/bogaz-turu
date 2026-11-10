// Oyun: sahne kurulumu, yarış akışı, kamera, sıralama, çarpışma geri bildirimi.
import * as THREE from 'three';
import { buildTrack } from './track.js';
import { buildWorld } from './world.js';
import { loadAssets } from './assets.js';
import { Kart, wrapAngle } from './kart.js';
import { makeAI, aiControl } from './ai.js';
import { Items } from './items.js';
import { Powers } from './powers.js';
import { solve, shove, overlapNow, pairsNow, stats as solveStats } from './physics.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { CHARACTERS, DIFFICULTY, TOTAL_LAPS } from './config.js';

const STEP = 1 / 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
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
    this.karts = []; this.paused = false; this.debugAuto = false; this.revving = false;
    this.onFinish = null; this.onState = null;
    this.onBump = (a, b, vr, nx, nz) => this.bump(a, b, vr, nx, nz);
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
    this.powers = new Powers(this);
    this.hud = new HUD(this);
    // menü arkasında dönen tanıtım kamerası
    this.state = 'attract';
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- yarış kurulumu ----------
  startRace(charId, diffKey) {
    for (const k of this.karts) this.scene.remove(k.root);
    this.diffKey = DIFFICULTY[diffKey] ? diffKey : 'normal';
    this.diff = DIFFICULTY[this.diffKey];
    const me = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
    const others = CHARACTERS.filter((c) => c !== me).sort(() => Math.random() - 0.5);
    this.karts = [];
    // oyuncu en arkadan başlar
    others.forEach((c, i) => { const k = new Kart(this, c, false); k.ai = makeAI(i * 17 + ((Math.random() * 1000) | 0)); k.reset(i); this.karts.push(k); });
    this.player = new Kart(this, me, true);
    this.player.reset(others.length);
    this.karts.push(this.player);
    this.items.reset();
    this.powers.reset();
    this.hud.buildRank(this.karts);
    this.hud.setPlayer(this.player);
    this.raceTime = 0; this.stateT = 0; this.shake = 0; this.finishShown = false; this.lastLap = 0; this.revving = false;
    this.throttled = false; // oyuncu gaza bastı mı (basana dek tuş rehberi açık kalır)
    this.camYaw = this.player.yaw;
    this.state = 'intro';
    this.paused = false;
    this.hud.show(true);
    this.setLights(0);
    this.audio.music(null);
    this.skid?.stop();
    this.audio.engines(this.karts, this.player);
    this.skid = this.audio.loop('skid', 0);
    if (!this.amb) this.amb = this.audio.loop('ambience', 0.16);
    const tr = this.world.tram;
    tr.external = false; tr.karts = null;
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
    this.audio.stopEngines();
    this.skid?.stop(); this.skid = null;
    for (const k of this.karts) this.scene.remove(k.root);
    this.karts = [];
    this.items.reset();
    this.powers.reset();
    const tr = this.world.tram;
    tr.external = false; tr.karts = null;
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
      this.updateAudio();
    }
    if (!this.freeCam) this.updateCamera(dt);
    if (this.player && this.state !== 'attract') this.hud.update(dt);
    if (!this.noDraw) this.renderer.render(this.scene, this.camera); // noDraw: başsız testler kare çizmeden ilerler
  }

  // testler için: çizim yapmadan benzetimi ilerlet
  simulate(seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) { this.step(STEP); this.world.update(STEP, (this.time += STEP), this.camera); this.updateCamera(STEP); this.fx.update(STEP); }
    this.updateAudio();
    if (this.player && this.state !== 'attract') this.hud.update(STEP);
  }

  // testler için: şu anki en derin örtüşmeler (hepsi ≤ 0 olmalı)
  debugOverlap() { return overlapNow(this.karts, this.world.tram, this.T); }
  get solveStats() { return solveStats; }
  debugPairs() { return pairsNow(this.karts); }

  // hata ayıklama: çarpışma kutularını çiz (yarış başladıktan sonra çağrılır)
  debugBoxes() {
    const mat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false });
    const loop = (hw, hl) => {
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([x, z]) => new THREE.Vector3(x, 0.2, z))), mat);
      l.renderOrder = 9;
      return l;
    };
    for (const k of this.karts) if (!k._box) k.root.add((k._box = loop(k.hw, k.hl)));
    const tr = this.world.tram;
    if (!tr._box) tr.obj.add((tr._box = loop(tr.hw, tr.hl)));
  }

  step(dt) {
    if (this.state === 'attract' || this.state === 'boot') return;
    this.stateT += dt;
    const p = this.player;
    const inp = this.input.poll();

    if (this.state === 'intro') {
      for (const k of this.karts) k.syncVisual(dt);
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
      this.revving = !!inp.throttle;
      for (const k of this.karts) k.syncVisual(dt);
      if (this.stateT >= 3) {
        this.state = 'race'; this.stateT = 0; this.raceTime = 0; this.revving = false;
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
    const T = this.T, tr = this.world.tram;
    tr.external = true; tr.karts = this.karts;
    // 1) herkes sürer ve hareket eder
    for (const k of this.karts) {
      let ci;
      if (k.ai) {
        const gap = (p.prog - k.prog) * T.sp; // + ise oyuncunun gerisinde
        k.aiMul = this.diff.ai * k.ai.skill * (1 + this.diff.band * clamp(gap / 70, -1, 1.3));
        // kopan lider ağırlaşır, kopan sonuncu toparlanır: paket bir arada kalsın, temas ve güçler oyunda olsun
        const ord = this.order, last = ord.length - 1;
        if (k.place === 1 && ord[1]) k.aiMul *= 1 - 0.06 * clamp(((k.prog - ord[1].prog) * T.sp - 20) / 60, 0, 1);
        else if (k.place === last + 1 && last > 0) k.aiMul *= 1 + 0.04 * clamp(((ord[last - 1].prog - k.prog) * T.sp - 20) / 60, 0, 1);
        ci = aiControl(k, this, dt);
      } else if (this.debugAuto) {
        k.ai = k._auto || (k._auto = makeAI(99)); ci = aiControl(k, this, dt); k.ai = null;
      } else ci = inp;
      if (k.isPlayer && (ci.throttle || this.debugAuto)) this.throttled = true;
      k.lap0 = k.lap;
      this.powers.charge(k, dt);
      k.update(dt, ci);
      if (ci.item) this.items.use(k);
      if (ci.power) this.powers.use(k);
    }
    // 2) tramvay ilerler, sonra bütün gövdeler birbirinden ayrılır
    tr.step(dt);
    solve(this.karts, tr, this.onBump, T);
    // 3) pistteki yer, tur, görsel
    for (const k of this.karts) {
      k.settle(dt);
      if (k.lap > k.lap0) this.onLap(k);
      // turbo şeritleri
      if (k.padCd <= 0 && !k.flying) for (const pad of this.world.boostPads) {
        if (Math.abs(((k.f - pad.i + T.N * 1.5) % T.N) - T.N / 2) < 2.4 && Math.abs(k.lat - pad.lat) < 2.8) { k.boost(1.15); k.padCd = 1; break; }
      }
      this.kartFx(k, dt);
    }
    this.tramBell(dt);
    this.items.update(dt, this.time);
    this.powers.update(dt, this.time);
    this.rank();

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

  // Motorlar ve lastik sesi: kare başına bir kez.
  updateAudio() {
    const p = this.player, st = this.state;
    if (!p || st === 'attract' || st === 'boot') return;
    let rev = -1;
    if (st === 'intro') rev = 0.04;
    else if (st === 'countdown') rev = this.revving ? 0.5 + Math.sin(this.time * 30) * 0.06 : 0.06;
    this.audio.updateEngines(p, this.camYaw, rev, st === 'finished' ? 0.3 : 1);
    this.skid?.set(st === 'race' && p.drift.on ? 0.22 : 0, 0.9 + p.drift.level * 0.12);
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

  // Çarpma anı (çözücü çağırır). b yoksa tramvaya çarpılmıştır; (nx, nz) a'dan karşıdakine bakar.
  bump(a, b, vr, nx, nz) {
    if (b) {
      // Tam Yol İleri: Kaptan değdiği kartı savurur
      const r = a.ramT > 0 ? a : b.ramT > 0 ? b : null;
      if (r) {
        const v = r === a ? b : a, s = r === a ? 1 : -1;
        if (v.hit(1.0)) {
          shove(v, nx * s * 9, nz * s * 9);
          if (v.isPlayer) this.hud.warn(`${r.char.name} bindirdi!`, 1.3);
        }
      }
    } else {
      // tramvaya arkadan hızla bindiren savrulur
      const tr = this.world.tram;
      if (vr > 16 && nx * tr.fx + nz * tr.fz > 0.7) a.hit(1.0);
    }
    if (vr < 2.2 || a.bumpCd > 0 || (b && b.bumpCd > 0)) return;
    a.bumpCd = 0.25; if (b) b.bumpCd = 0.25;
    const hard = clamp((vr - 2) / 20, 0, 1);
    // temas noktası: a'nın karşıya bakan yüzü
    const ra = a.hl * Math.abs(a.fx * nx + a.fz * nz) + a.hw * Math.abs(a.fz * nx - a.fx * nz);
    V.set(a.pos.x + nx * ra, a.y, a.pos.z + nz * ra);
    this.sfxAt('crash', V, 0.3 + 0.7 * hard);
    this.fx.burst(V, 0xffe9a8, 4 + Math.round(hard * 10), 4 + hard * 7, 0.8 + hard * 0.5);
    const sq = 0.3 + hard * 0.5;
    a.squash = Math.max(a.squash, sq); if (b) b.squash = Math.max(b.squash, sq);
    if (a.isPlayer || (b && b.isPlayer)) this.shake = Math.max(this.shake, 0.1 + hard * 0.3);
  }

  // tramvay zili: oyuncu yaklaşınca
  tramBell(dt) {
    const tr = this.world.tram, p = this.player;
    this.bellT = (this.bellT || 0) - dt;
    if (p && tr.solid && this.bellT <= 0) {
      const d = tr.obj.position.distanceTo(p.pos);
      if (d < 70) { this.audio.play('tram_bell', { vol: clamp(1 - d / 70, 0, 1) * 0.6 }); this.bellT = 3.2; }
    }
  }

  kartFx(k, dt) {
    if (k.pos.distanceToSquared(this.camera.position) > 120 * 120) return;
    const fx = this.fx, sx = k.fx, cz = k.fz;
    const bx = k.pos.x - sx * (k.hl - 0.4), bz = k.pos.z - cz * (k.hl - 0.4);
    if (k.drift.on) {
      const col = SPARK[k.drift.level];
      for (const s of [-1, 1]) {
        if (Math.random() < 0.7) fx.spawn(bx + cz * s * k.hw * 0.8, k.y + 0.25, bz - sx * s * k.hw * 0.8, -sx * 3 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, -cz * 3 + (Math.random() - 0.5) * 4, col, k.drift.level ? 0.34 : 0.22, 0.3 + Math.random() * 0.2, 14);
      }
    }
    if (k.boostT > 0 && Math.random() < 0.8) {
      fx.spawn(bx + (Math.random() - 0.5), k.y + 0.8 + k.air, bz + (Math.random() - 0.5), -sx * 6, 1 + Math.random() * 2, -cz * 6, Math.random() > 0.5 ? 0xff7a1a : 0xffd23c, 0.5, 0.35, 0);
    }
    if (k.ramT > 0) {
      // pruva dalgası: burundan iki yana köpük
      const nx = k.pos.x + sx * k.hl, nz = k.pos.z + cz * k.hl;
      for (const s of [-1, 1]) {
        fx.spawn(nx + cz * s * 0.5, k.y + 0.5, nz - sx * s * 0.5, cz * s * (5 + Math.random() * 5) + sx * 4, 3 + Math.random() * 4, -sx * s * (5 + Math.random() * 5) + cz * 4, Math.random() > 0.4 ? 0xeafaff : 0x6fd6e8, 0.45, 0.4 + Math.random() * 0.2, 13);
      }
    }
    if (k.teaT > 0 && Math.random() < 0.75) {
      // semaver buharı
      fx.spawn(bx + (Math.random() - 0.5) * 0.8, k.y + 1.9, bz + (Math.random() - 0.5) * 0.8, -sx * 2 + (Math.random() - 0.5) * 2, 3 + Math.random() * 2, -cz * 2 + (Math.random() - 0.5) * 2, 0xffffff, 0.7, 0.55, -3);
    }
    if (k.smokeT > 0 && Math.random() < 0.4) {
      fx.spawn(k.pos.x + (Math.random() - 0.5) * 2.4, k.y + 1.2 + Math.random(), k.pos.z + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0x3a3a40, 0.9, 0.5, -1);
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
    cam.position.set(cx + (Math.random() - 0.5) * sh, Math.max(k.y, T.py[ci]) + 4.7 + k.air * 0.25 + (Math.random() - 0.5) * sh, czz + (Math.random() - 0.5) * sh);
    cam.lookAt(k.pos.x + sx * 5, k.y + 2.1 + k.air * 0.5, k.pos.z + cz * 5);
    const fov = 64 + clamp(Math.abs(k.speed) / k.vmaxBase, 0, 1.3) * 9 + boost * 7;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 5);
    cam.updateProjectionMatrix();
  }
}
