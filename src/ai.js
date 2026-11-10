// Yapay zekâ sürücüsü: pist çizgisini izler, katı gövdelerin (rakipler, tramvay) yanından dolaşır,
// eşyasını ve özel gücünü yerinde kullanır.
import * as THREE from 'three';
import { wrapAngle } from './kart.js';

const P = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeAI(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return { r, lane: (r() - 0.5) * 8, laneT: 1 + r() * 2, useT: 0, pwT: 0, stuckT: 0, backT: 0, skill: 0.97 + r() * 0.05, react: r() * 0.35, ph: r() * 6.28 };
}

const INP = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, power: false };

export function aiControl(k, game, dt) {
  const T = game.T, ai = k.ai;
  INP.item = false; INP.power = false; INP.drift = false; INP.brake = 0;
  const hw = T.hw[k.idx];
  const maxLane = Math.max(1, hw - k.hw - 0.9);
  const dfTo = (f) => ((f - k.f + T.N * 1.5) % T.N) - T.N / 2; // örnek cinsinden, + ise önde

  // şerit seçimi: arada bir değiştir, virajda içe yaslan
  ai.laneT -= dt;
  if (ai.laneT <= 0) { ai.laneT = 1.5 + ai.r() * 3; ai.lane = (ai.r() - 0.5) * 2 * maxLane * 0.8; }
  let lane = ai.lane;
  const la = Math.round(5 + Math.abs(k.speed) * 0.2);
  const ahead = T.wrap(k.idx + la);
  lane += clamp(T.curv[ahead] * 110, -1, 1) * maxLane * 0.55;

  // engeller: karpuz kabukları, tramvay, öndeki ve yandaki kartlar
  {
    for (const h of game.items.hazards) {
      const df = dfTo(h.f);
      if (df > 0 && df < 16 && Math.abs(h.lat - lane) < k.hw + 1.2) lane = h.lat + (lane >= h.lat ? 1 : -1) * (k.hw + 2.2);
    }
    const tr = game.world.tram;
    if (tr && tr.solid) {
      const df = dfTo(tr.f);
      const need = tr.hw + k.hw + 1.6;
      if (df > -4 && df < 24 && Math.abs(tr.lat - lane) < need) lane = tr.lat + (k.lat >= tr.lat ? need + 0.6 : -need - 0.6);
    }
    for (const o of game.karts) {
      if (o === k || o.flying || k.flying) continue;
      const df = dfTo(o.f) * T.sp; // metre
      const reach = k.hl + o.hl, need = k.hw + o.hw + 0.7;
      if (df > 0 && df < reach + 3 + Math.max(0, k.speed - o.speed) * 0.9) {
        // önde ve yavaş: boş yandan solla
        if (Math.abs(o.lat - lane) < need) {
          const right = o.lat + need, left = o.lat - need;
          lane = (k.lat >= o.lat ? right <= maxLane : !(left >= -maxLane)) ? right : left;
        }
      } else if (Math.abs(df) <= reach) {
        // yan yana: üstüne sürme
        if (k.lat >= o.lat) lane = Math.max(lane, o.lat + need); else lane = Math.min(lane, o.lat - need);
      }
    }
  }
  lane = clamp(lane, -maxLane, maxLane);

  T.pointAt(k.f + la, lane, P);
  const want = Math.atan2(P.x - k.pos.x, P.z - k.pos.z);
  const diff = wrapAngle(want - k.yaw);
  INP.steer = clamp(-diff * 2.6, -1, 1);
  // egzoz bulutunda önünü göremez: direksiyon titrer
  if (k.smokeT > 0) INP.steer = clamp(INP.steer + Math.sin(game.time * 9 + ai.ph) * 0.4, -1, 1);

  // viraj hızı
  let mc = 0;
  for (let j = 2; j < 18; j += 2) mc = Math.max(mc, Math.abs(T.curv[T.wrap(k.idx + j)]));
  // Tavşan Kanı'nda gazı kesmez: süper turbonun hızını sonuna kadar kullanır
  const target = k.vmaxBase * k.aiMul * clamp(1.12 - mc * 8.5, 0.66, 1.3) * (k.teaT > 0 ? 1.27 : 1);
  INP.throttle = k.speed < target ? 1 : 0;
  if (k.speed > target + 7) INP.brake = 1;
  if (game.raceTime < ai.react) INP.throttle = 0;

  // sıkıştıysa (duvara ya da bir gövdeye dayanıp kaldıysa) kısa bir geri manevra
  if (ai.backT > 0) {
    ai.backT -= dt;
    INP.throttle = 0; INP.brake = 1; INP.steer = -INP.steer;
  } else if (game.raceTime > 2 && k.spinT <= 0 && Math.abs(k.speed) < 3) {
    ai.stuckT += dt;
    if (ai.stuckT > 1.3) { ai.stuckT = 0; ai.backT = 0.8; }
  } else ai.stuckT = 0;

  const near = (min, max, latTol = 99) => game.karts.some((o) => {
    if (o === k || o.finished) return false;
    const df = dfTo(o.f);
    return df > min && df < max && Math.abs(o.lat - k.lat) < latTol;
  });

  // eşya kullanımı
  if (k.item && k.rouletteT <= 0) {
    ai.useT += dt;
    if (ai.useT > 1.2) {
      let use = false;
      switch (k.item) {
        case 'cay': use = mc < 0.012 && ai.useT > 2; break;
        case 'simit': use = near(2, 26, 5) || ai.useT > 9; break;
        case 'karpuz': use = near(-14, -2) || ai.useT > 8; break;
        case 'nazar': use = true; break;
        case 'marti': use = k.place > 1 && ai.useT > 2; break;
        case 'duduk': use = near(-8, 8) || ai.useT > 10; break;
      }
      if (use) { INP.item = true; ai.useT = 0; }
    }
  } else ai.useT = 0;

  // özel güç: dolunca uygun anı kollar, çok beklemez
  if (k.pwReady && k.spinT <= 0 && !k.finished) {
    ai.pwT += dt;
    if (ai.pwT > 0.7) {
      let use = false;
      switch (k.char.id) {
        case 'simitci': use = near(3, 45); break;
        case 'kaptan': use = near(0.5, 8, 3.4) || (mc < 0.012 && k.place > 1 && ai.pwT > 2.5); break;
        case 'tekir': use = near(0.5, 5, 2.8) || (mc < 0.012 && ai.pwT > 3); break;
        case 'marti': use = game.karts.some((o) => o !== k && !o.finished && o.item && dfTo(o.f) > 0 && dfTo(o.f) < 50) || (ai.pwT > 4 && near(0, 50)); break;
        case 'cayci': use = mc < 0.012 && ai.pwT > 1; break;
        case 'dolmuscu': use = near(-12, -1.5, 7); break;
      }
      if (use || ai.pwT > 9) { INP.power = true; ai.pwT = 0; }
    }
  } else ai.pwT = 0;
  return INP;
}
