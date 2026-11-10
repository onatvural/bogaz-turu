// Yapay zekâ sürücüsü: pist çizgisini izler, engellerden kaçar, eşyasını yerinde kullanır.
import * as THREE from 'three';
import { wrapAngle } from './kart.js';

const P = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeAI(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return { r, lane: (r() - 0.5) * 8, laneT: 1 + r() * 2, useT: 0, skill: 0.97 + r() * 0.05, react: r() * 0.35 };
}

const INP = { steer: 0, throttle: 0, brake: 0, drift: false, item: false };

export function aiControl(k, game, dt) {
  const T = game.T, ai = k.ai;
  INP.item = false; INP.drift = false; INP.brake = 0;
  const hw = T.hw[k.idx];
  const maxLane = hw - 2.6;

  // şerit seçimi: arada bir değiştir, virajda içe yaslan
  ai.laneT -= dt;
  if (ai.laneT <= 0) { ai.laneT = 1.5 + ai.r() * 3; ai.lane = (ai.r() - 0.5) * 2 * maxLane * 0.8; }
  let lane = ai.lane;
  const la = Math.round(5 + Math.abs(k.speed) * 0.2);
  const ahead = T.wrap(k.idx + la);
  lane += clamp(T.curv[ahead] * 110, -1, 1) * maxLane * 0.55;

  // engeller: karpuz kabukları, tramvay, öndeki kartlar
  for (const h of game.items.hazards) {
    const df = ((h.f - k.f + T.N * 1.5) % T.N) - T.N / 2;
    if (df > 0 && df < 16 && Math.abs(h.lat - lane) < 2.4) lane = h.lat + (lane >= h.lat ? 3.4 : -3.4);
  }
  const tr = game.world.tram;
  if (tr) {
    const df = ((tr.f - k.f + T.N * 1.5) % T.N) - T.N / 2;
    if (df > -3 && df < 22 && Math.abs(tr.lat - lane) < 4.2) lane = tr.lat + (k.lat >= tr.lat ? 5.2 : -5.2);
  }
  for (const o of game.karts) {
    if (o === k) continue;
    const df = ((o.f - k.f + T.N * 1.5) % T.N) - T.N / 2;
    if (df > 0 && df < 5 && Math.abs(o.lat - lane) < 2 && o.speed < k.speed) lane = o.lat + (k.lat >= o.lat ? 2.8 : -2.8);
  }
  lane = clamp(lane, -maxLane, maxLane);

  T.pointAt(k.f + la, lane, P);
  const want = Math.atan2(P.x - k.pos.x, P.z - k.pos.z);
  const diff = wrapAngle(want - k.yaw);
  INP.steer = clamp(-diff * 2.6, -1, 1);

  // viraj hızı
  let mc = 0;
  for (let j = 2; j < 18; j += 2) mc = Math.max(mc, Math.abs(T.curv[T.wrap(k.idx + j)]));
  const target = k.vmaxBase * k.aiMul * clamp(1.12 - mc * 8.5, 0.66, 1.3);
  INP.throttle = k.speed < target ? 1 : 0;
  if (k.speed > target + 7) INP.brake = 1;
  if (game.raceTime < ai.react) INP.throttle = 0;

  // eşya kullanımı
  if (k.item && k.rouletteT <= 0) {
    ai.useT += dt;
    if (ai.useT > 1.2) {
      let use = false;
      const near = (min, max, latTol = 99) => game.karts.some((o) => {
        if (o === k) return false;
        const df = ((o.f - k.f + T.N * 1.5) % T.N) - T.N / 2;
        return df > min && df < max && Math.abs(o.lat - k.lat) < latTol;
      });
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
  return INP;
}
