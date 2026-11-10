// Çarpışma denetimi: hiçbir gövde bir diğerinin, tramvayın ya da duvarın içine girmemeli.
//  1) üç tam yarış (altı kart, üç tur), her adımda ölçüm
//  2) sıkışma denemesi: kartlar tramvayın ve duvarın dibine üst üste, rastgele hızlarla bırakılır
// Rastgelelik tohumludur; başarısız olan durum aynı tohumla yeniden üretilebilir.
// Kullanım: node tools/play.mjs tools/tests/collisions.mjs      (BT_ONLY=jam: yalnız sıkışma denemesi)
const TOL = 0.02;
const ONLY = process.env.BT_ONLY || '';
export default async ({ ev, race, sim, shot, log }) => {
  const seed = (n) => ev((n) => { let s = n >>> 0; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }, n);
  const bad = [];

  // ---- 1) tam yarışlar ----
  for (const [char, diff, sd] of ONLY === 'jam' ? [] : [['tekir', 'zor', 11], ['kaptan', 'normal', 22], ['simitci', 'kolay', 33]]) {
    await seed(sd);
    await race(char, diff, true);
    await sim(6.5); // tanıtım + geri sayım
    const r = await ev(() => {
      const g = window.__bt;
      const w = { kart: 0, tram: 0, wall: 0 }, at = {};
      let steps = 0, bumps = 0, nan = false;
      const orig = g.bump.bind(g);
      g.onBump = (a, b, vr, nx, nz) => { if (vr > 2.2) bumps++; return orig(a, b, vr, nx, nz); };
      const snap = () => g.karts.map((k) => `${k.char.id} f=${k.f.toFixed(1)} lat=${k.lat.toFixed(2)} v=${k.speed.toFixed(0)} air=${k.air.toFixed(1)} spin=${k.spinT.toFixed(2)}`).join(' | ') + ` | tram f=${g.world.tram.f.toFixed(1)}`;
      const tick = () => {
        g.simulate(1 / 60); steps++;
        const o = g.debugOverlap();
        for (const k in w) if (o[k] > w[k]) { w[k] = o[k]; at[k] = `t=${g.raceTime.toFixed(2)} ${snap()}`; }
        for (const k of g.karts) if (!(isFinite(k.pos.x) && isFinite(k.pos.z) && isFinite(k.speed))) nan = true;
      };
      while (g.state === 'race' && steps < 60 * 200) tick();
      for (let i = 0; i < 60 * 25; i++) tick(); // herkes bitirsin
      return {
        state: g.state, raceTime: +g.raceTime.toFixed(1), steps, bumps, nan,
        worst: { kart: +w.kart.toFixed(4), tram: +w.tram.toFixed(4), wall: +w.wall.toFixed(4) }, at,
        order: g.order.map((k) => `${k.char.id}:${k.finished ? k.finishTime.toFixed(1) : 'tur' + k.lap}`),
        powers: g.powers.uses,
      };
    });
    log(`yarış ${char}/${diff} tohum ${sd}:`, JSON.stringify(r));
    if (r.nan || r.worst.kart > TOL || r.worst.tram > TOL || r.worst.wall > TOL || r.state !== 'finished') bad.push(`yarış ${char}/${diff} tohum ${sd}`);
  }
  if (ONLY !== 'jam') await shot('collisions-end');

  // ---- 2) sıkışma denemesi ----
  await seed(77);
  await race('tekir', 'normal', true);
  await sim(6.6);
  const s = await ev(() => {
    const g = window.__bt, T = g.T, tr = g.world.tram, R = Math.random;
    const w = { kart: 0, tram: 0, wall: 0 }, at = {};
    let nan = false, rounds = 0;
    for (let round = 0; round < 400; round++) {
      rounds++;
      // tramvayın çevresinde, bazen duvar dibinde, üst üste binmiş başlangıç
      const near = round % 3 !== 2, base = near && tr.solid ? tr.f : 20 + ((R() * 700) | 0);
      g.karts.forEach((k) => {
        const f = base + (R() - 0.5) * 9, hw = T.hw[T.wrap(Math.floor(f))];
        const lat = round % 4 === 0 ? (R() > 0.5 ? 1 : -1) * (hw - 1 - R() * 3) : (R() - 0.5) * 2 * (hw - 1.5);
        T.pointAt(f, lat, k.pos); k.idx = T.wrap(Math.floor(f)); k.lap = 1;
        k.yaw = k.velYaw = T.headingAt(k.idx) + (R() - 0.5) * (round % 5 === 0 ? 6.28 : 0.8);
        k.speed = R() * 48; k.kx = (R() - 0.5) * 24; k.kz = (R() - 0.5) * 24;
        k.spinT = 0; k.invT = 0; k.leapT = 0; k.air = 0; k.boostT = 0; k.ramT = 0;
        if (R() < 0.3) { k.spinT = k.spinDur = 1.3; k.spinDir = 1; }
      });
      if (R() < 0.3) { const k = g.player; k.pw = 1; g.powers.charge(k, 0); g.powers.use(k); }
      for (let i = 0; i < 50; i++) {
        g.simulate(1 / 60);
        const o = g.debugOverlap();
        for (const k in w) if (o[k] > w[k]) {
          w[k] = o[k];
          if (k === 'kart') at.pairs = JSON.stringify(g.debugPairs());
          at[k] = `tur ${round} adım ${i}: ` + g.karts.map((q) => `${q.char.id} f=${(q.idx + q.along).toFixed(2)} lat=${q.lat.toFixed(2)} dyaw=${(Math.atan2(q.fx * T.tz[q.idx] - q.fz * T.tx[q.idx], q.fx * T.tx[q.idx] + q.fz * T.tz[q.idx])).toFixed(2)} v=${q.speed.toFixed(0)} air=${q.air.toFixed(1)} spin=${q.spinT.toFixed(2)} out=${q.out}`).join(' | ') + ` | tram f=${tr.f.toFixed(1)} solid=${tr.solid} hw=${T.hw[g.karts[0].idx].toFixed(1)} curv=${T.curv[g.karts[0].idx].toFixed(3)}`;
        }
        for (const k of g.karts) if (!(isFinite(k.pos.x) && isFinite(k.pos.z) && isFinite(k.speed))) nan = true;
        if (g.state !== 'race') break;
      }
      if (g.state !== 'race') break;
    }
    return { rounds, nan, worst: { kart: +w.kart.toFixed(4), tram: +w.tram.toFixed(4), wall: +w.wall.toFixed(4) }, at, solver: { ...g.solveStats } };
  });
  log('sıkışma denemesi:', JSON.stringify(s));
  if (s.nan || s.worst.kart > TOL || s.worst.tram > TOL || s.worst.wall > TOL) bad.push('sıkışma denemesi');

  if (bad.length) throw new Error('çarpışma denetimi başarısız: ' + bad.join(', '));
  return 'çarpışma denetimi geçti';
};
