// Eşyalar: çini sandıklar, çay turbosu, simit, karpuz kabuğu, nazar boncuğu, martı, vapur düdüğü.
import * as THREE from 'three';
import { A } from './assets.js';
import { ITEM_WEIGHTS } from './config.js';

const V = new THREE.Vector3();

export class Items {
  constructor(game) {
    this.game = game; this.T = game.T;
    const T = this.T, scene = game.scene;
    this.hazards = []; this.shots = []; this.birds = []; this.rings = [];

    // --- çini sandıklar ---
    const tex = A.tex.itembox || null;
    this.boxGeo = new THREE.BoxGeometry(1.9, 1.9, 1.9);
    this.boxMat = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x22c3c9 });
    const rows = [T.cpIdx[2] - 6, T.cpIdx[5], T.cpIdx[9] + 6, T.cpIdx[14], T.cpIdx[18], T.cpIdx[21] - 8, T.cpIdx[25], T.cpIdx[0] + 12];
    this.boxes = [];
    for (const i of rows) {
      const w = T.hw[T.wrap(i)] - 2.4;
      for (let k = 0; k < 4; k++) {
        const lat = -w + (k * 2 * w) / 3;
        const m = new THREE.Mesh(this.boxGeo, this.boxMat);
        T.pointAt(i, lat, m.position, 1.7);
        scene.add(m);
        this.boxes.push({ f: T.wrap(i), lat, mesh: m, t: 0, y: m.position.y, ph: k * 1.3 + i });
      }
    }

    // --- paylaşılan geometri/malzeme ---
    const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    this.simitGeo = new THREE.TorusGeometry(0.75, 0.3, 8, 16);
    this.simitMat = L(0xb9692a);
    this.rindGeo = new THREE.TorusGeometry(0.85, 0.3, 6, 12, Math.PI).rotateX(Math.PI / 2);
    this.rindMat = L(0x2f8f3a);
    this.fleshGeo = new THREE.TorusGeometry(0.85, 0.2, 6, 12, Math.PI).rotateX(Math.PI / 2).translate(0, 0.14, 0);
    this.fleshMat = L(0xff4f5e);
    this.ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.4, 2.1, 0, -0.1, 0, 0, 0.5, 0, 0, 0.5, 2.1, 0, -0.1, 1.6, 0, 0.45], 3));
    wing.computeVertexNormals();
    this.wingGeo = wing;
    this.birdBody = new THREE.ConeGeometry(0.4, 1.8, 6).rotateX(Math.PI / 2);
    this.white = L(0xffffff, { side: THREE.DoubleSide });
    this.grey = L(0xaab4be, { side: THREE.DoubleSide });
  }

  reset() {
    const s = this.game.scene;
    for (const a of [this.hazards, this.shots, this.birds, this.rings]) { for (const o of a) s.remove(o.mesh); a.length = 0; }
    for (const b of this.boxes) { b.t = 0; b.mesh.visible = true; b.mesh.scale.setScalar(1); }
  }

  df(a, b) { const N = this.T.N; return ((a - b + N * 1.5) % N) - N / 2; }

  pick(kart) {
    const w = ITEM_WEIGHTS[Math.min(ITEM_WEIGHTS.length - 1, kart.place - 1)];
    let sum = 0; for (const k in w) sum += w[k];
    let r = Math.random() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'cay';
  }

  use(kart) {
    const it = kart.item;
    if (!it || kart.rouletteT > 0 || kart.spinT > 0) return;
    kart.item = null;
    const g = this.game, T = this.T, scene = g.scene;
    switch (it) {
      case 'cay':
        kart.boost(2.1);
        g.fx.burst(kart.pos, 0xff7a3c, 10, 6, 1.2);
        break;
      case 'simit':
        this.shoot(kart, kart.lat, null, 2, false);
        g.sfxAt('throw', kart.pos, 0.8);
        break;
      case 'karpuz': {
        const m = new THREE.Group();
        m.add(new THREE.Mesh(this.rindGeo, this.rindMat), new THREE.Mesh(this.fleshGeo, this.fleshMat));
        const f = kart.f - 2.2;
        T.pointAt(f, kart.lat, m.position, 0.12);
        m.rotation.y = Math.random() * 6.28;
        scene.add(m);
        this.hazards.push({ f: T.wrap(f), lat: kart.lat, owner: kart, mesh: m, age: 0 });
        g.sfxAt('drop', kart.pos, 0.7);
        break;
      }
      case 'nazar':
        kart.shield = true; kart.shieldT = 12;
        g.sfxAt('shield_on', kart.pos, 0.7);
        break;
      case 'marti': {
        // bir öndeki yarışçı; birinciysek rastgele biri
        let target = g.karts.find((o) => o.place === kart.place - 1 && !o.finished);
        if (!target) { const others = g.karts.filter((o) => o !== kart && !o.finished); target = others[(Math.random() * others.length) | 0]; }
        if (!target) break;
        const bird = this.makeBird(1.5);
        scene.add(bird.mesh);
        this.birds.push({ from: kart.pos.clone().setY(kart.pos.y + 3), target, owner: kart, t: 0, ...bird });
        g.sfxAt('seagull', kart.pos, 0.9);
        if (target.isPlayer) g.hud.warn('Martı geliyor!');
        break;
      }
      case 'duduk': {
        const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
        m.position.copy(kart.pos).setY(kart.pos.y + 0.6);
        scene.add(m);
        this.rings.push({ owner: kart, mesh: m, t: 0, done: new Set() });
        g.sfxAt('horn', kart.pos, 1);
        break;
      }
    }
  }

  // Pisti izleyerek yuvarlanan simit. aim: kovalayacağı kart (yoksa en yakın öndeki); wide: güdümsüz, şeridinde kalır.
  shoot(owner, lat, aim, ahead = 2, wide = false) {
    const T = this.T, f = owner.f + ahead;
    const w = T.hw[T.wrap(Math.floor(f))] - 1;
    const m = new THREE.Mesh(this.simitGeo, this.simitMat);
    this.game.scene.add(m);
    this.shots.push({ f, lat: Math.max(-w, Math.min(w, lat)), owner, aim, wide, mesh: m, age: 0, spin: 0 });
  }

  makeBird(scale = 1.5) {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(this.birdBody, this.white));
    const wl = new THREE.Mesh(this.wingGeo, this.grey), wr = new THREE.Mesh(this.wingGeo, this.grey); wr.scale.x = -1;
    m.add(wl, wr); m.scale.setScalar(scale);
    return { mesh: m, wl, wr };
  }

  // Karta eşya ver (kapkaç ganimeti). Eli doluysa ganimet hemen kullanılır.
  give(kart, item) {
    if (kart.finished) return;
    if (!kart.item && kart.rouletteT <= 0) {
      kart.item = item;
      if (kart.isPlayer) this.game.audio.play('ui_select', { vol: 0.6 });
      return;
    }
    const keep = kart.item;
    kart.item = item; this.use(kart); kart.item = keep;
  }

  // tramvayın gövdesi (pist boyunca / yanal) içinde mi?
  inTram(f, lat, pad = 0.5) {
    const tr = this.game.world.tram;
    if (!tr || !tr.solid) return false;
    return Math.abs(this.df(f, tr.f)) * this.T.sp < tr.bhl + pad && Math.abs(lat - tr.lat) < tr.bhw + pad;
  }

  update(dt, t) {
    const g = this.game, T = this.T, scene = g.scene, karts = g.karts;

    // sandıklar
    for (const b of this.boxes) {
      if (b.t > 0) {
        b.t -= dt;
        if (b.t <= 0) { b.mesh.visible = true; b.pop = 0.35; }
        continue;
      }
      b.mesh.rotation.y = t * 1.6 + b.ph; b.mesh.rotation.x = t * 0.9 + b.ph;
      b.mesh.position.y = b.y + Math.sin(t * 2.2 + b.ph) * 0.22;
      if (b.pop > 0) { b.pop -= dt; b.mesh.scale.setScalar(1 - Math.max(0, b.pop) / 0.35); }
      for (const k of karts) {
        if (k.flying) continue; // sıçrayan kart sandığın üstünden geçer
        if (Math.abs(this.df(k.f, b.f)) < 1.25 && Math.abs(k.lat - b.lat) < Math.max(1.9, k.hw + 0.95)) {
          b.t = 3.5; b.mesh.visible = false;
          g.fx.burst(b.mesh.position, 0x35d0c0, 10, 7, 1.1);
          if (!k.item && k.rouletteT <= 0 && !k.finished) {
            k.rouletteT = 1.5;
            k.pw = Math.min(1, k.pw + 0.04); // sandık özel gücü de biraz doldurur
            if (k.isPlayer) g.audio.play('pickup', { vol: 0.6 });
          }
          break;
        }
      }
    }
    // çark bitince eşyayı ver
    for (const k of karts) {
      if (k.rouletteT > 0) { k.rouletteT -= dt; if (k.rouletteT <= 0) { k.item = this.pick(k); if (k.isPlayer) g.audio.play('ui_select', { vol: 0.6 }); } }
    }

    // simitler: pisti izleyerek yuvarlanır, öndeki karta hafifçe yönelir
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt; s.f += (78 * dt) / T.sp;
      let hitK = null, best = null, bd = 30;
      for (const k of karts) {
        if (k === s.owner || k.flying) continue;
        const d = this.df(k.f, s.f);
        if (Math.abs(d) < 1.1 && Math.abs(k.lat - s.lat) < Math.max(1.7, k.hw + 0.6)) { hitK = k; break; }
        if (d > 0 && d < bd) { bd = d; best = k; }
      }
      // hedefi olan simit onu kovalar (hedef geride kaldıysa en yakın öndekine döner)
      if (s.aim && !s.aim.finished && this.df(s.aim.f, s.f) > 0) best = s.aim;
      if (best && !s.wide) s.lat += Math.max(-11 * dt, Math.min(11 * dt, best.lat - s.lat));
      const w = T.hw[T.wrap(Math.floor(s.f))] - 1;
      s.lat = Math.max(-w, Math.min(w, s.lat));
      T.pointAt(s.f, s.lat, s.mesh.position, 1.05);
      s.spin += dt * 22;
      s.mesh.rotation.set(0, T.headingAt(T.wrap(Math.floor(s.f))) + Math.PI / 2, 0);
      s.mesh.rotateZ(-s.spin);
      if (hitK) hitK.hit(1.3);
      // tramvaya çarpan simit dağılır
      if (hitK || s.age > 4.5 || this.inTram(s.f, s.lat, 0.7)) {
        g.fx.burst(s.mesh.position, 0xd9a15a, 10, 6, 1);
        scene.remove(s.mesh); this.shots.splice(i, 1);
      }
    }

    // karpuz kabukları
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.age += dt;
      let gone = h.age > 70 || this.inTram(h.f, h.lat, 0.3); // tramvay kabuğu ezer
      for (const k of karts) {
        if ((k === h.owner && h.age < 1.2) || k.flying) continue;
        if (Math.abs(this.df(k.f, h.f)) < 1.0 && Math.abs(k.lat - h.lat) < Math.max(1.6, k.hw + 0.5)) { k.hit(1.1, true); gone = true; break; }
      }
      if (gone) { g.fx.burst(h.mesh.position, 0xff4f5e, 8, 5, 0.9); scene.remove(h.mesh); this.hazards.splice(i, 1); }
    }

    // martılar: hedefe pike yapar
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.t += dt / 1.5;
      const u = Math.min(1, b.t), e = u * u * (3 - 2 * u);
      V.copy(b.target.pos); V.y += 1.6;
      b.mesh.position.lerpVectors(b.from, V, e);
      b.mesh.position.y += Math.sin(u * Math.PI) * 9;
      b.mesh.lookAt(V);
      const flap = Math.sin(t * 22) * 0.7;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
      if (u >= 1) {
        if (b.target.hit(1.4)) g.fx.burst(b.target.pos, 0xffffff, 16, 7, 1.3);
        scene.remove(b.mesh); this.birds.splice(i, 1);
      }
    }

    // vapur düdüğü dalgası
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const rad = 2 + (r.t / 0.6) * 26;
      r.mesh.scale.set(rad, 1 + r.t * 6, rad);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - r.t / 0.6));
      for (const k of karts) {
        if (k === r.owner || r.done.has(k)) continue;
        if (Math.hypot(k.pos.x - r.mesh.position.x, k.pos.z - r.mesh.position.z) < rad + 1 && Math.abs(k.pos.y - r.owner.pos.y) < 6) {
          r.done.add(k); k.hit(0.9);
        }
      }
      if (r.t > 0.6) { scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
  }
}
