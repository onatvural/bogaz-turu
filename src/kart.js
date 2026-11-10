// Kart: arcade fizik + görsel. Konum pist örnekleri üzerinden izlenir (idx, lat).
// Bir adım üç evredir: update (sürüş, hareket, duvar) → çarpışma çözücü (physics.js) → settle (pistteki yer, görsel).
import * as THREE from 'three';
import { A, fit, canvasTex } from './assets.js';

const TMP = { lat: 0, along: 0 };
const TAU = Math.PI * 2;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// duvarın iç yüzü yol yarı genişliğinin 0.3 ötesinde; gövde en fazla bu paya kadar sokulur
const WALL_PAD = 0.25;
// Pati Sıçrayışı: tepe yüksekliği ve havada kalma süresi
export const LEAP_H = 4.8, LEAP_DUR = 1.05;

let shadowTex, shieldTex, flameGeo, flameMat;
function shared() {
  if (shadowTex) return;
  shadowTex = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }, { repeat: false });
  shieldTex = canvasTex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 62);
    g.addColorStop(0, 'rgba(40,120,255,0.0)'); g.addColorStop(0.62, 'rgba(60,150,255,0.18)');
    g.addColorStop(0.86, 'rgba(120,200,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }, { repeat: false });
  flameGeo = new THREE.ConeGeometry(0.34, 1.7, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.85);
  flameMat = new THREE.MeshBasicMaterial({ color: 0xffa531, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
}

function fallbackKart(color) {
  const g = new THREE.Group();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 3.1), L(color)); body.position.y = 0.6; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.9), L(color)); nose.position.set(0, 0.55, 1.7); g.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.35), L(0x333333)); seat.position.set(0, 1.1, -0.9); g.add(seat);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8), L(0xffffff)); torso.position.set(0, 1.35, -0.4); g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), L(0xf1c59b)); head.position.set(0, 2.15, -0.4); g.add(head);
  const wg = new THREE.CylinderGeometry(0.52, 0.52, 0.5, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1.05, 1.1], [1.05, 1.1], [-1.05, -1.1], [1.05, -1.1]]) { const w = new THREE.Mesh(wg, L(0x1c1c1c)); w.position.set(x, 0.52, z); g.add(w); }
  return g;
}

// Taban izi: modelin üstten görünüşünü saran en dar dikdörtgen. Çarpışma kutusu budur.
// Bayrak direği, kürek gibi ince çıkıntılar sayılmaz (üstten bakınca ~0.4 m'den dar olan her şey);
// tekerlek, tente, semaver gibi dolgun parçalar sayılır. Üretilmiş modeller birkaç derece yamuk
// gelebildiği için aynı ölçüm burnu da sürüş yönüne hizalar.
const FOOT = {};
function footprint(id, g) {
  if (FOOT[id]) return FOOT[id];
  g.updateMatrixWorld(true);
  const raw = [], v = new THREE.Vector3();
  let top = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 24000));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      raw.push(v.x, v.z);
      if (v.y > top) top = v.y;
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
    }
  });
  // üstten görünüş maskesi
  const CELL = 0.08, PAD = 4, R = 2;
  const W = Math.ceil((x1 - x0) / CELL) + PAD * 2 + 1, H = Math.ceil((z1 - z0) / CELL) + PAD * 2 + 1;
  let m = new Uint8Array(W * H);
  for (let i = 0; i < raw.length; i += 2) m[(Math.floor((raw[i + 1] - z0) / CELL) + PAD) * W + Math.floor((raw[i] - x0) / CELL) + PAD] = 1;
  // r hücrelik kare ile genişlet (grow) ya da aşındır
  const morph = (src, r, grow) => {
    const out = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      let hit = !grow;
      for (let dz = -r; dz <= r && hit !== grow; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz;
        const on = xx >= 0 && zz >= 0 && xx < W && zz < H && src[zz * W + xx];
        if (grow ? on : !on) { hit = grow; break; }
      }
      out[z * W + x] = hit ? 1 : 0;
    }
    return out;
  };
  m = morph(morph(m, 1, true), 1, false); // köşe noktaları arasındaki iğne deliklerini kapat
  m = morph(morph(m, R, false), R, true); // ince çıkıntıları sil
  const pts = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (m[z * W + x]) pts.push(x0 + (x - PAD + 0.5) * CELL, z0 + (z - PAD + 0.5) * CELL);
  const src = pts.length > 40 ? pts : raw;
  let best = null;
  for (let deg = -14; deg <= 14; deg += 0.5) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    let ax0 = 1e9, ax1 = -1e9, az0 = 1e9, az1 = -1e9;
    for (let i = 0; i < src.length; i += 2) {
      const x = src[i] * c + src[i + 1] * sn, z = -src[i] * sn + src[i + 1] * c;
      if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (z < az0) az0 = z; if (z > az1) az1 = z;
    }
    const area = (ax1 - ax0) * (az1 - az0) * (1 + Math.abs(deg) * 0.002); // eşitlikte düz duranı yeğle
    if (!best || area < best.area) best = { area, rot: a, cx: (ax0 + ax1) / 2, cz: (az0 + az1) / 2, hw: (ax1 - ax0) / 2 + CELL / 2, hl: (az1 - az0) / 2 + CELL / 2 };
  }
  if (!best || !(best.hw > 0.3) || !(best.hl > 0.3)) best = { rot: 0, cx: 0, cz: 0, hw: 1.05, hl: 1.95 };
  best.top = top;
  return (FOOT[id] = best);
}

export class Kart {
  constructor(game, char, isPlayer) {
    shared();
    this.game = game; this.T = game.T; this.char = char; this.isPlayer = isPlayer;
    this.vmaxBase = 38.5 + char.hiz * 1.15;
    this.accel = 19 + char.ivme * 3.1;
    this.turn = 1.72 + char.tutus * 0.085;
    this.grip = 7.5 + char.tutus * 0.8;
    this.mass = 0.7 + (char.agirlik || 3) * 0.15;
    this.pos = new THREE.Vector3();
    this.aiMul = 1;
    this.ai = null;

    // --- görsel ---
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    const src = A.models['k_' + char.id];
    this.model = src ? fit(src, { length: 3.9, yaw: char.yaw, clone: true }) : fallbackKart(char.color);
    // çarpışma kutusu: modelin taban izi (yarı boy, yarı en)
    const fp = footprint(char.id, this.model);
    this.model.rotation.y = fp.rot; this.model.position.set(-fp.cx, 0, -fp.cz);
    this.hl = fp.hl; this.hw = fp.hw; this.top = fp.top;
    this.tilt.add(this.model);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shW = this.hw * 2 + 1.5; this.shL = this.hl * 2 + 1.4;
    this.shadow.position.y = 0.07; this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    const fxw = Math.min(0.6, this.hw * 0.5);
    this.flames = [-fxw, fxw].map((x) => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, 0.75, -this.hl + 0.25); f.visible = false; this.tilt.add(f); return f; });
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: shieldTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bubble.scale.setScalar(6.2); this.bubble.position.y = 1.4; this.bubble.visible = false;
    this.root.add(this.bubble);
    game.scene.add(this.root);
    this.reset(0);
  }

  reset(slot) {
    const T = this.T;
    // ızgara: start çizgisinin gerisinde ikişerli sıra
    const row = Math.floor(slot / 2), col = slot % 2;
    const f = T.N - 4 - row * 3.2 - col * 1.2;
    this.lat0 = col ? 3.4 : -3.4;
    T.pointAt(f, this.lat0, this.pos);
    this.idx = T.wrap(Math.floor(f));
    this.yaw = this.velYaw = this.bodyYaw = T.headingAt(this.idx);
    this.fx = Math.sin(this.yaw); this.fz = Math.cos(this.yaw);
    this.speed = 0; this.steer = 0; this.hopT = 0; this.y = this.pos.y;
    this.kx = 0; this.kz = 0; this.pinX = 0; this.pinZ = 0;
    this.lap = 0; this.lap0 = 0; this.lat = this.lat0; this.along = 0; this.f = f; this.prog = f - T.N;
    this.drift = { on: false, dir: 0, t: 0, level: 0, armed: false };
    this.boostT = 0; this.spinT = 0; this.spinDur = 1; this.invT = 0; this.shield = false; this.shieldT = 0;
    this.item = null; this.rouletteT = 0; this.padCd = 0; this.bumpCd = 0; this.wallT = 9;
    // özel güç durumu
    this.pw = 0; this.pwReady = false; this.pwBusy = 0;
    this.ramT = 0; this.teaT = 0; this.smokeT = 0; this.fumeT = 0; this.fumeN = 0;
    this.leapT = 0; this.air = 0; this.flying = false; this.landed = false;
    this.finished = false; this.finishTime = 0; this.place = slot + 1; this.wrongWay = 0;
    this.visYaw = 0; this.roll = 0; this.pitch = 0; this.squash = 0;
    this.bubble.visible = false;
    this.syncVisual(0);
  }

  boost(dur) {
    this.boostT = Math.max(this.boostT, dur);
    this.speed = Math.max(this.speed, this.vmaxBase * 0.9);
    if (this.isPlayer) this.game.audio.play('boost', { vol: 0.7 });
  }

  // darbe: true dönerse kart savruldu
  hit(dur = 1.3, slip = false) {
    if (this.invT > 0 || this.finished) return false;
    if (this.flying) return false; // havadayken altından geçer
    if (this.ramT > 0) {
      // Tam Yol İleri: zırh darbeyi savuşturur
      this.invT = 0.35;
      this.game.sfxAt('shield_block', this.pos, 0.6);
      this.game.fx.burst(this.pos, 0xbfe6ff, 10, 8, 1.2);
      return false;
    }
    if (slip && this.teaT > 0) return false; // Tavşan Kanı kabuğa aldırmaz
    if (this.shield) {
      this.shield = false; this.shieldT = 0; this.invT = 0.7;
      this.game.sfxAt('shield_block', this.pos, 0.8);
      this.game.fx.burst(this.pos, 0x7fc8ff, 14, 9, 1.4);
      return false;
    }
    this.spinT = this.spinDur = dur; this.spinDir = Math.random() > 0.5 ? 1 : -1;
    this.speed *= 0.35; this.boostT = 0; this.teaT = 0; this.drift.on = false; this.drift.armed = false; this.drift.t = 0;
    this.leapT = 0; this.air = 0; this.landed = false;
    this.invT = dur + 1.4; this.squash = 1;
    this.game.sfxAt(slip ? 'slip' : 'hit', this.pos, 0.85);
    this.game.fx.burst(this.pos, 0xffe14d, 12, 8, 1.2);
    if (this.isPlayer) this.game.shake = 0.5;
    return true;
  }

  // ---------- 1. evre: sürüş ve hareket ----------
  update(dt, inp) {
    this.invT = Math.max(0, this.invT - dt);
    this.padCd = Math.max(0, this.padCd - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    this.ramT = Math.max(0, this.ramT - dt);
    this.teaT = Math.max(0, this.teaT - dt);
    this.smokeT = Math.max(0, this.smokeT - dt);
    this.pwBusy = Math.max(0, this.pwBusy - dt);
    if (this.shield) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = false; }
    const boosting = this.boostT > 0;
    if (boosting) this.boostT -= dt;
    let vmax = this.vmaxBase * this.aiMul * (boosting ? (this.teaT > 0 ? 1.42 : 1.3) : 1);
    if (this.smokeT > 0) vmax *= 0.62; // egzoz bulutunun içinde
    const d = this.drift;
    const air = this.leapT > 0;

    if (this.spinT > 0) {
      this.spinT -= dt;
      this.speed -= this.speed * 2.4 * dt;
    } else {
      // gaz / fren (havada hız korunur)
      if (air) { /* sıçrayışta gaz da fren de tutmaz */ } else if (inp.throttle > 0) {
        if (this.speed < vmax) this.speed += this.accel * (boosting ? 2.4 : 1) * (1.12 - 0.72 * clamp(this.speed / vmax, 0, 1)) * dt;
        else this.speed -= 14 * dt;
      } else if (inp.brake > 0) {
        this.speed -= (this.speed > 0 ? 52 : 14) * dt;
        if (this.speed < -11) this.speed = -11;
      } else {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 11 * dt);
      }
      // direksiyon
      this.steer += (inp.steer - this.steer) * Math.min(1, dt * 9);
      const sp = Math.abs(this.speed);
      const sf = clamp(sp / 11, 0, 1) * (1 - 0.22 * clamp(sp / this.vmaxBase, 0, 1)) * (air ? 0.45 : 1);
      // drift
      if (inp.drift && !d.held && sp > 13 && this.hopT <= 0 && !air) { this.hopT = 0.34; d.armed = true; if (this.isPlayer) this.game.audio.play('hop', { vol: 0.35 }); }
      d.held = inp.drift;
      if (d.armed && !d.on && inp.drift && Math.abs(this.steer) > 0.25 && sp > 13 && !air) { d.on = true; d.dir = Math.sign(this.steer); d.t = 0; d.level = 0; }
      if (d.on && (!inp.drift || sp < 9)) {
        if (d.level > 0 && inp.drift === false) {
          this.boost([0, 0.7, 1.25, 1.9][d.level]);
          this.pw = Math.min(1, this.pw + 0.03 * d.level); // iyi drift özel gücü de doldurur
        }
        d.on = false; d.armed = false; d.t = 0; d.level = 0;
      }
      if (!inp.drift) d.armed = false;
      let yawRate;
      if (d.on) {
        const al = this.steer * d.dir; // 1: içe, -1: dışa
        yawRate = d.dir * this.turn * (0.78 + 0.5 * al) * sf;
        d.t += dt * (0.75 + 0.45 * Math.max(0, al));
        const lv = d.t > 2.9 ? 3 : d.t > 1.75 ? 2 : d.t > 0.8 ? 1 : 0;
        if (lv > d.level) { d.level = lv; if (this.isPlayer) this.game.audio.play('pickup', { vol: 0.25, rate: 1 + lv * 0.25 }); }
      } else {
        yawRate = this.steer * this.turn * sf;
      }
      this.yaw = wrapAngle(this.yaw - yawRate * Math.sign(this.speed || 1) * dt);
    }

    // hareket yönü burnu gecikmeli izler (drift'te daha gevşek)
    const grip = d.on ? 2.7 : this.grip;
    this.velYaw = wrapAngle(this.velYaw + wrapAngle(this.yaw - this.velYaw) * (1 - Math.exp(-grip * dt)));
    // çarpışmadan gelen itme hızı ayrıca eklenir ve kısa sürede söner
    this.pos.x += (Math.sin(this.velYaw) * this.speed + this.kx) * dt;
    this.pos.z += (Math.cos(this.velYaw) * this.speed + this.kz) * dt;
    const kd = Math.exp(-5.5 * dt);
    this.kx *= kd; this.kz *= kd;

    // Pati Sıçrayışı: yay çizerek havalan
    if (air) {
      this.leapT -= dt;
      if (this.leapT <= 0) { this.leapT = 0; this.air = 0; this.landed = true; } else this.air = Math.sin((1 - this.leapT / LEAP_DUR) * Math.PI) * LEAP_H;
    }
    this.flying = this.air > 1.3;

    // gövde yönü: çizilen açı (drift açısı ve savrulma dahil). Çarpışma kutusu bununla döner.
    const targetVis = d.on ? -d.dir * 0.42 : 0;
    this.visYaw += (targetVis - this.visYaw) * Math.min(1, dt * 8);
    let spin = 0;
    if (this.spinT > 0) spin = (1 - this.spinT / this.spinDur) * TAU * 2 * (this.spinDir || 1);
    this.bodyYaw = this.yaw + this.visYaw + spin;
    this.fx = Math.sin(this.bodyYaw); this.fz = Math.cos(this.bodyYaw);

    this.pinX = 0; this.pinZ = 0;
    this.wallT += dt;
    this.walls(dt, true);
  }

  // pist üzerindeki en yakın örnek; start çizgisini geçince tur sayılır
  locate() {
    const T = this.T, prev = this.idx;
    this.idx = T.locate(this.pos.x, this.pos.z, prev);
    const di = this.idx - prev;
    if (di < -T.N / 2) this.lap++;
    else if (di > T.N / 2) this.lap--;
  }

  // Duvar: gövde yol kenarını aşamaz. Yan dönmüş kartın burnu da hesaba girer.
  // respond: hız tepkisi (çarpma kaybı, sürtünme) — adım başına bir kez; çözücü yalnız konumu düzeltir.
  walls(dt, respond) {
    this.locate();
    const T = this.T, i = this.idx, d = this.drift;
    T.project(i, this.pos.x, this.pos.z, TMP);
    const c = Math.abs(this.fx * T.tx[i] + this.fz * T.tz[i]);
    const ext = this.hw * c + this.hl * Math.sqrt(Math.max(0, 1 - c * c));
    const lim = T.hw[i] + WALL_PAD - ext;
    const over = Math.abs(TMP.lat) - lim;
    if (over <= 0) return false;
    const s = Math.sign(TMP.lat);
    const nx = T.rx[i] * s, nz = T.rz[i] * s;
    this.pos.x -= nx * over; this.pos.z -= nz * over;
    // bu adımda duvara dayalı: çarpışma çözücü kartı bu yöne itemez
    this.pinX = nx; this.pinZ = nz;
    TMP.lat = s * lim;
    if (!respond) return over > 1e-4;
    // çarpınca hız kaybı, sürtündükçe yavaşlama. Direksiyonsuz duvara yaslanarak gitmek kazandırmaz.
    let vx = Math.sin(this.velYaw), vz = Math.cos(this.velYaw);
    const dir = Math.sign(this.speed || 1);
    const vn = (vx * nx + vz * nz) * dir;
    if (vn > 0) {
      vx -= nx * vn * 1.15 * dir; vz -= nz * vn * 1.15 * dir;
      this.velYaw = Math.atan2(vx, vz);
      this.yaw = wrapAngle(this.yaw + wrapAngle(this.velYaw - this.yaw) * (1 - Math.exp(-4 * dt)));
      if (this.wallT > 0.3) {
        // taze çarpma
        this.speed *= 1 - Math.min(0.5, vn * 0.75);
        if (vn > 0.2 && Math.abs(this.speed) > 9 && this.bumpCd <= 0) {
          this.bumpCd = 0.4; this.squash = 0.6;
          if (this.isPlayer) { this.game.audio.play('bump', { vol: 0.6 }); this.game.shake = Math.max(this.game.shake, 0.25); }
          this.game.fx.burst(this.pos, 0xffffff, 6, 5, 0.8);
        }
        if (vn > 0.45) { d.on = false; d.armed = false; d.t = 0; d.level = 0; }
      }
      this.speed -= this.speed * (0.7 + 2.8 * vn) * dt;
      if (this.boostT > 0) this.boostT -= dt * 2;
      this.wallT = 0;
    }
    // itme hızının duvara giren kısmı da söner
    const kn = this.kx * nx + this.kz * nz;
    if (kn > 0) { this.kx -= nx * kn; this.kz -= nz * kn; }
    return true;
  }

  // ---------- 3. evre: çarpışmalar çözüldükten sonra ----------
  settle(dt) {
    const T = this.T;
    this.locate();
    T.project(this.idx, this.pos.x, this.pos.z, TMP);
    this.lat = TMP.lat; this.along = TMP.along;
    this.f = this.idx + clamp(TMP.along, -1, 1);
    this.prog = (this.lap - 1) * T.N + this.f;

    // ters yön uyarısı
    const fwdDot = Math.sin(this.yaw) * T.tx[this.idx] + Math.cos(this.yaw) * T.tz[this.idx];
    this.wrongWay = fwdDot < -0.3 && this.speed > 4 ? this.wrongWay + dt : 0;

    // yükseklik
    const gy = T.heightAt(this.idx, TMP.along);
    this.y = gy;
    this.pos.y = gy;
    if (this.hopT > 0) this.hopT -= dt;
    this.syncVisual(dt);
  }

  syncVisual(dt) {
    const T = this.T, d = this.drift;
    const hop = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.34) * Math.PI) * 0.7 : 0;
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.bodyYaw;
    const slope = T.slope[this.idx];
    const fwdDot = Math.sin(this.yaw) * T.tx[this.idx] + Math.cos(this.yaw) * T.tz[this.idx];
    let pitchT = -Math.atan(slope) * fwdDot;
    // sıçrayışta burun önce kalkar, inerken eğilir
    if (this.leapT > 0) pitchT -= Math.cos((1 - this.leapT / LEAP_DUR) * Math.PI) * 0.34;
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 8);
    const targetRoll = d.on ? d.dir * 0.13 : this.steer * 0.07 * Math.min(1, Math.abs(this.speed) / 20);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8);
    this.squash = Math.max(0, this.squash - dt * 3.5);
    const sq = 1 - this.squash * 0.22 * Math.sin(this.squash * 9);
    const vib = Math.sin(performance.now() * 0.045 + this.char.hiz) * 0.012 * Math.min(1, Math.abs(this.speed) / 10 + 0.4);
    this.tilt.position.y = hop + vib + this.air;
    this.tilt.rotation.set(this.pitch, 0, this.roll);
    this.tilt.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    const sh = (1 - hop * 0.25) / (1 + this.air * 0.14);
    this.shadow.scale.set(this.shW * sh, 1, this.shL * sh);
    // darbeden sonra yanıp sönme
    this.model.visible = !(this.invT > 0 && this.spinT <= 0 && this.ramT <= 0 && Math.floor(this.invT * 14) % 2 === 0);
    const b = this.boostT > 0;
    for (const f of this.flames) {
      f.visible = b;
      if (b) f.scale.set(1, 1, (this.teaT > 0 ? 1.1 : 0.7) + Math.random() * 0.8);
    }
    this.bubble.visible = this.shield;
    if (this.shield) this.bubble.scale.setScalar(6.2 + Math.sin(performance.now() * 0.008) * 0.35);
  }
}
