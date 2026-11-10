// Özel güçler: her yarışçının kendine ait, zamanla dolan tek gücü.
//  Simitçi Cemal  Simit Yağmuru   — öndeki üç rakibe birer güdümlü simit
//  Kaptan Nuri    Tam Yol İleri   — zırhlı hücum: darbe almaz, değdiğini savurur
//  Tekir          Pati Sıçrayışı  — herkesin üstünden atlar, inişte çevresini iter ve turbo alır
//  Martı Rıfkı    Kapkaç          — öndekinin eşyasını kapar (eşyası yoksa gagalar), kanat çırpıp hızlanır
//  Çaycı Zehra    Tavşan Kanı     — uzun süper turbo; karpuz kabuğuna aldırmaz
//  Dolmuşçu Rıza  Egzoz Bulutu    — arkasına duman bırakır; içine giren yavaşlar, önünü göremez
import * as THREE from 'three';
import { POWERS } from './config.js';
import { LEAP_DUR } from './kart.js';
import { shove } from './physics.js';
import { canvasTex } from './assets.js';

const V = new THREE.Vector3(), V2 = new THREE.Vector3();
// rakiplerin gücü zorluğa göre daha ağır dolar
const AI_CHARGE = { kolay: 0.6, normal: 0.8, zor: 1 };
const FUME_DUR = 2.4, FUME_N = 12;

export class Powers {
  constructor(game) {
    this.game = game; this.T = game.T;
    this.clouds = []; this.freeSprites = []; this.thieves = []; this.rings = [];
    this.uses = {}; // yarış boyunca kim kaç kez kullandı (denetim için)
    // duman topu: koyu çekirdek, açık gri kabarık kenar (koyu asfaltta da, aydınlık cephede de seçilsin)
    this.smokeTex = canvasTex(128, 128, (x) => {
      const blob = (cx, cy, r, core, rim) => {
        const g = x.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        g.addColorStop(0, core); g.addColorStop(0.6, rim); g.addColorStop(1, 'rgba(150,150,160,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      };
      for (const [cx, cy, r] of [[40, 50, 34], [86, 46, 36], [64, 84, 38], [34, 84, 26], [96, 82, 28]]) blob(cx, cy, r, 'rgba(96,96,106,0.9)', 'rgba(128,128,138,0.6)');
      blob(64, 62, 44, 'rgba(34,34,40,0.96)', 'rgba(70,70,80,0.7)');
    }, { repeat: false });
    this.ringGeo = new THREE.TorusGeometry(1, 0.1, 6, 40).rotateX(Math.PI / 2);
  }

  reset() {
    const s = this.game.scene;
    for (const c of this.clouds) { c.sprite.visible = false; this.freeSprites.push(c.sprite); }
    for (const b of this.thieves) s.remove(b.mesh);
    for (const r of this.rings) { s.remove(r.mesh); r.mesh.material.dispose(); }
    this.clouds.length = this.thieves.length = this.rings.length = 0;
    this.uses = {};
  }

  df(a, b) { const N = this.T.N; return ((a - b + N * 1.5) % N) - N / 2; }

  // gücün dolması: geride olan biraz daha çabuk doldurur
  charge(k, dt) {
    if (k.finished) return;
    if (k.pw < 1 && k.pwBusy <= 0 && k.spinT <= 0) {
      const rate = (k.isPlayer ? 1 : AI_CHARGE[this.game.diffKey] || 0.8) * (1 + 0.1 * (k.place - 1));
      k.pw = Math.min(1, k.pw + (dt / POWERS[k.char.id].charge) * rate);
    }
    if (k.pw >= 1 && !k.pwReady) {
      k.pwReady = true;
      if (k.isPlayer) { this.game.audio.play('power_ready', { vol: 0.7 }); this.game.hud.powerReady(); }
    }
  }

  use(k) {
    const g = this.game;
    if (!k.pwReady || k.spinT > 0 || k.finished || k.leapT > 0 || g.state !== 'race') return false;
    const id = k.char.id;
    let full = true; // false: güç boşa gitti, yarısı geri verilir
    switch (id) {
      case 'simitci': this.simitRain(k); break;
      case 'kaptan':
        // hız değil ağırlık gücü: kısa bir hamle, sonra zırhlı ve durdurulamaz
        k.ramT = 3.4; k.pwBusy = 3.4; k.boost(1.2);
        g.sfxAt('horn', k.pos, 0.8);
        break;
      case 'tekir':
        k.leapT = LEAP_DUR; k.landed = false; k.pwBusy = LEAP_DUR + 0.2;
        k.speed = Math.max(k.speed, k.vmaxBase * 1.12);
        k.drift.on = false; k.drift.armed = false; k.drift.t = 0; k.drift.level = 0;
        g.sfxAt('hop', k.pos, 0.8);
        break;
      case 'marti': full = this.snatch(k); break;
      case 'cayci':
        k.teaT = 3.4; k.pwBusy = 3.4; k.boost(3.4);
        g.sfxAt('steam', k.pos, 0.7);
        break;
      case 'dolmuscu':
        k.fumeT = FUME_DUR; k.fumeN = 0; k.pwBusy = FUME_DUR;
        g.sfxAt('smoke', k.pos, 0.7); g.sfxAt('dolmus_horn', k.pos, 0.55);
        break;
      default: return false;
    }
    k.pw = full ? 0 : 0.5; k.pwReady = false;
    this.uses[id] = (this.uses[id] || 0) + 1;
    g.sfxAt(k.char.voice, k.pos, k.isPlayer ? 0.95 : 0.6); // rakiplerin nidası daha kısık
    g.fx.burst(k.pos, 0xffd23c, 14, 9, 1.3);
    g.hud.powerUsed(k, POWERS[id].name);
    return true;
  }

  // ---------- Simit Yağmuru ----------
  simitRain(k) {
    const g = this.game;
    const ahead = [];
    for (const o of g.karts) {
      if (o === k || o.finished) continue;
      const df = this.df(o.f, k.f);
      if (df > 0.5 && df < 60) ahead.push({ o, df });
    }
    ahead.sort((a, b) => a.df - b.df);
    const lanes = [0, -3.4, 3.4];
    // hedefi olan simit onu kovalar; hedefsiz kalanlar yana açılıp yolu tarar
    for (let i = 0; i < 3; i++) g.items.shoot(k, k.lat + lanes[i], ahead[i] ? ahead[i].o : null, 2 + i * 0.7, !ahead[i]);
    g.sfxAt('throw', k.pos, 0.9);
    if (ahead.slice(0, 3).some((e) => e.o.isPlayer)) g.hud.warn('Simit yağmuru geliyor!', 1.6);
  }

  // ---------- Kapkaç ----------
  snatch(k) {
    const g = this.game;
    let best = null, bs = 1e9;
    for (const o of g.karts) {
      if (o === k || o.finished || o.flying) continue;
      const df = this.df(o.f, k.f);
      let score;
      if (df > 0 && df < 50) score = df - (o.item ? 100 : 0); // öndeki; eşyası olan önce gelir
      else if (df <= 0 && df > -15 && o.item) score = 200 - df; // önde kimse yoksa hemen arkadaki
      else continue;
      if (score < bs) { bs = score; best = o; }
    }
    k.boost(1.2);
    if (!best) return false;
    const bird = g.items.makeBird(1.25);
    bird.mesh.position.copy(k.pos).setY(k.pos.y + 2.2);
    g.scene.add(bird.mesh);
    this.thieves.push({ owner: k, target: best, t: 0, back: false, loot: null, ...bird });
    g.sfxAt('seagull', k.pos, 0.6);
    if (best.isPlayer) g.hud.warn('Martı Rıfkı eşyana göz dikti!', 1.4);
    return true;
  }

  // ---------- Pati Sıçrayışı: iniş ----------
  slam(k) {
    const g = this.game;
    k.boost(1.1); k.squash = 1;
    g.sfxAt('slam', k.pos, 0.9);
    g.fx.burst(k.pos, 0xf2c98a, 18, 10, 1.4);
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.9 }));
    m.position.copy(k.pos).setY(k.pos.y + 0.4);
    g.scene.add(m);
    this.rings.push({ mesh: m, t: 0 });
    // çevredekileri dışarı it (savurmaz)
    for (const o of g.karts) {
      if (o === k) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z, d = Math.hypot(dx, dz);
      if (d > 7.5 || d < 0.01 || Math.abs(o.pos.y - k.pos.y) > 6) continue;
      const f = 3 + (1 - d / 7.5) * 9;
      shove(o, (dx / d) * f, (dz / d) * f);
      o.squash = Math.max(o.squash, 0.8);
      if (o.isPlayer) g.shake = Math.max(g.shake, 0.4);
    }
    if (k.isPlayer) g.shake = Math.max(g.shake, 0.3);
  }

  // ---------- Egzoz Bulutu: bir duman topu ----------
  puff(k) {
    const g = this.game;
    let sp = this.freeSprites.pop();
    if (!sp) {
      sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.renderOrder = 4;
      g.scene.add(sp);
    }
    sp.visible = true;
    const j = (Math.random() - 0.5) * 1.6;
    const x = k.pos.x - k.fx * (k.hl + 0.6) + k.fz * j, z = k.pos.z - k.fz * (k.hl + 0.6) - k.fx * j;
    // top egzozdan küçük çıkar, kartın hızının bir kısmını taşır: süren de arkasında tüttüğünü görür;
    // geride kaldıkça yavaşlar, büyür ve yolu kapatır
    const vx = Math.sin(k.velYaw) * k.speed * 0.72, vz = Math.cos(k.velYaw) * k.speed * 0.72;
    this.clouds.push({ x, y: k.pos.y + 0.35, z, vx, vz, r: 0.8, age: 0, life: 6.5, owner: k, sprite: sp, rot: Math.random() * 6.28 });
  }

  update(dt, t) {
    const g = this.game, karts = g.karts, scene = g.scene;

    for (const k of karts) {
      // sıçrayış bitti: yere iniş
      if (k.landed) { k.landed = false; this.slam(k); }
      // egzoz: süre boyunca aralıklı duman topları
      if (k.fumeT > 0) {
        k.fumeT -= dt;
        const n = Math.floor(((FUME_DUR - k.fumeT) / FUME_DUR) * FUME_N);
        while (k.fumeN <= n && k.fumeN < FUME_N) { k.fumeN++; this.puff(k); }
      }
    }

    // duman bulutları: içine giren yavaşlar
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt;
      const u = c.age / c.life;
      if (u >= 1) { c.sprite.visible = false; this.freeSprites.push(c.sprite); this.clouds.splice(i, 1); continue; }
      const drag = Math.exp(-3.2 * dt);
      c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= drag; c.vz *= drag;
      c.r = 0.8 + 3.7 * Math.min(1, c.age / 1.4);
      // bulut büyüdükçe merkezi yükselir: alt kenarı yola gömülüp keskin bir çizgi oluşturmasın
      c.sprite.position.set(c.x, c.y + c.r * 0.95 + c.age * 0.12, c.z);
      c.sprite.scale.setScalar(c.r * 2.7);
      c.sprite.material.opacity = Math.min(1, c.age / 0.12) * (u > 0.75 ? (1 - u) / 0.25 : 1) * 0.92;
      c.sprite.material.rotation = c.rot + c.age * 0.2;
      if (u > 0.9) continue;
      for (const o of karts) {
        if (o === c.owner || o.flying || o.ramT > 0) continue;
        if (Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < c.r + 0.6 && Math.abs(o.pos.y - c.y) < 6) { // kabaca aynı kotta
          if (o.smokeT <= 0 && o.isPlayer) g.hud.warn('Egzoz bulutu!', 0.9);
          o.smokeT = 0.45;
        }
      }
    }

    // kapkaç martısı: hedefe gider, döner
    for (let i = this.thieves.length - 1; i >= 0; i--) {
      const b = this.thieves[i];
      b.t += dt / (b.back ? 0.5 : 0.6);
      const u = Math.min(1, b.t), e = u * u * (3 - 2 * u);
      const from = b.back ? b.target : b.owner, to = b.back ? b.owner : b.target;
      V.copy(from.pos); V.y += 2.2 + from.air;
      V2.copy(to.pos); V2.y += 2.2 + to.air;
      b.mesh.position.lerpVectors(V, V2, e);
      b.mesh.position.y += Math.sin(u * Math.PI) * 4;
      b.mesh.lookAt(V2);
      const flap = Math.sin(t * 26) * 0.7;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
      if (u < 1) continue;
      if (!b.back) {
        const v = b.target;
        if (v.shield) {
          // nazar boncuğu kapkaçı da savuşturur
          v.shield = false; v.shieldT = 0;
          g.sfxAt('shield_block', v.pos, 0.8); g.fx.burst(v.pos, 0x7fc8ff, 14, 9, 1.4);
        } else if (v.flying || v.ramT > 0 || v.finished) { /* yetişemedi */ } else if (v.item) {
          b.loot = v.item; v.item = null;
          g.fx.burst(v.pos, 0xffffff, 12, 7, 1.2);
          if (v.isPlayer) g.hud.warn('Martı Rıfkı eşyanı kaptı!', 1.6);
        } else v.hit(0.7); // eşyası yoksa gagalar
        b.back = true; b.t = 0;
      } else {
        if (b.loot) g.items.give(b.owner, b.loot);
        scene.remove(b.mesh); this.thieves.splice(i, 1);
      }
    }

    // iniş dalgası
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const rad = 1 + (r.t / 0.45) * 7;
      r.mesh.scale.set(rad, 1 + r.t * 3, rad);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - r.t / 0.45));
      if (r.t > 0.45) { scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
  }
}
