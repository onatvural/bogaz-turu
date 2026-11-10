// Özel güç denetimi: her yarışçının gücü kurulmuş bir sahnede denenir, etkisi ölçülür, ekran görüntüsü alınır.
// Kullanım: node tools/play.mjs tools/tests/powers.mjs [--out klasör]
export default async ({ ev, race, sim, shot, log, followCam }) => {
  const fail = [];
  const check = (name, ok, info) => { log(ok ? '✓' : '✗', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fail.push(name); };

  // sahne: oyuncu start düzlüğünde, üç rakip önünde, biri arkasında; güç dolu
  const stage = (char, clear = false) => ev((c, clear) => {
    const g = window.__bt, T = g.T;
    const put = (k, f, lat, speed) => {
      T.pointAt(f, lat, k.pos); k.idx = T.wrap(Math.floor(f)); k.yaw = k.velYaw = k.bodyYaw = T.headingAt(k.idx);
      k.fx = Math.sin(k.yaw); k.fz = Math.cos(k.yaw); k.speed = speed; k.kx = k.kz = 0; k.lap = 1; k.f = f; k.lat = lat;
      k.spinT = 0; k.invT = 0; k.boostT = 0; k.item = null; k.rouletteT = 0; k.shield = false; k.pw = 0; k.pwReady = false;
    };
    const p = g.player, others = g.karts.filter((k) => k !== p);
    put(p, 14, 0, 30);
    put(others[0], 19, 0, 27); put(others[1], 22, 3.6, 28); put(others[2], 24, -3.6, 28);
    put(others[3], 9.5, 1.5, 31); put(others[4], 200, 0, 30);
    if (clear) others.forEach((k, i) => put(k, 150 + i * 8, 0, 30)); // önü açık yol
    others[0].item = 'cay';
    for (const k of g.karts) g.items.reset(), k.syncVisual(0);
    g.debugAuto = true;
    p.pw = 1; g.powers.charge(p, 0);
    g.camYaw = p.yaw;
    return { ready: p.pwReady, used: g.powers.use(p), id: p.char.id, names: others.map((k) => k.char.id) };
  }, char, clear);
  const snap = () => ev(() => {
    const g = window.__bt, p = g.player, o = g.karts.filter((k) => k !== p);
    return {
      p: { speed: +p.speed.toFixed(1), vmax: p.vmaxBase, ramT: +p.ramT.toFixed(2), teaT: +p.teaT.toFixed(2), leapT: +p.leapT.toFixed(2), air: +p.air.toFixed(2), flying: p.flying, boostT: +p.boostT.toFixed(2), item: p.item, pw: +p.pw.toFixed(2), f: +p.f.toFixed(1) },
      spin: o.map((k) => +k.spinT.toFixed(2)), smoke: o.map((k) => +k.smokeT.toFixed(2)), items: o.map((k) => k.item), f: o.map((k) => +k.f.toFixed(1)),
      shots: g.items.shots.length, clouds: g.powers.clouds.length, thieves: g.powers.thieves.length, rings: g.powers.rings.length, over: g.debugOverlap(),
    };
  });

  await race('simitci', 'normal', true);
  await followCam();
  await sim(3.4 + 1.6);
  await shot('hud-countdown'); // tuş rehberi geri sayımda görünür olmalı
  check('rehber geri sayımda açık', await ev(() => document.querySelector('#help').classList.contains('on')));
  await sim(1.5);

  // --- Simit Yağmuru ---
  let r = await stage('simitci'); let s = await snap();
  check('simitci: güç kullanıldı, üç simit çıktı', r.used && s.shots === 3, s.shots);
  await sim(0.25); await shot('pw-simitci');
  let hit = 0; for (let i = 0; i < 12; i++) { await sim(0.25); s = await snap(); hit = Math.max(hit, s.spin.filter((v) => v > 0).length); }
  check('simitci: öndekiler savruldu', hit >= 2, hit);

  // --- Tam Yol İleri ---
  await race('kaptan', 'normal', true); await followCam(); await sim(6.6);
  r = await stage('kaptan'); s = await snap();
  check('kaptan: hücum başladı', r.used && s.p.ramT > 3, s.p);
  hit = 0; let shotDone = false;
  for (let i = 0; i < 16; i++) { await sim(0.1); s = await snap(); hit = Math.max(hit, s.spin.filter((v) => v > 0).length); if (hit && !shotDone) { shotDone = true; await shot('pw-kaptan'); } }
  check('kaptan: değdiğini savurdu', hit >= 1, { hit, over: s.over });
  // zırh: hücumdayken darbe işlemez
  check('kaptan: zırh darbeyi savuşturdu', await ev(() => { const p = window.__bt.player; p.ramT = 2; p.invT = 0; return p.hit(1) === false && p.spinT <= 0; }));

  // --- Pati Sıçrayışı ---
  await race('tekir', 'normal', true); await followCam(); await sim(6.6);
  r = await stage('tekir');
  await sim(0.5); s = await snap(); await shot('pw-tekir');
  check('tekir: havada', s.p.flying && s.p.air > 4, s.p);
  // havadayken öndeki kartın üstünden geçer: çarpışma yok, darbe almaz
  check('tekir: havada darbe almaz', await ev(() => window.__bt.player.hit(1) === false));
  const f0 = s.p.f;
  await sim(0.7); s = await snap();
  check('tekir: indi, turbo aldı, dalga çıktı', !s.p.flying && s.p.boostT > 0 && s.rings >= 1, s.p);
  check('tekir: inişte kimsenin içinde değil', s.over.kart <= 0.001, s.over);
  await shot('pw-tekir-inis');
  check('tekir: ilerledi', s.p.f > f0 + 10, [f0, s.p.f]);

  // --- Kapkaç ---
  await race('marti', 'normal', true); await followCam(); await sim(6.6);
  r = await stage('marti'); s = await snap();
  check('marti: martı yola çıktı', r.used && s.thieves === 1, s.thieves);
  await sim(0.35); await shot('pw-marti');
  await sim(1.2); s = await snap();
  check('marti: öndekinin çayı kapıldı', s.items[0] === null && (s.p.item === 'cay' || s.p.boostT > 0), { items: s.items, p: s.p.item });

  // --- Tavşan Kanı ---
  await race('cayci', 'normal', true); await followCam(); await sim(6.6);
  r = await stage('cayci', true);
  await sim(1.5); s = await snap(); await shot('pw-cayci');
  check('cayci: süper turbo', s.p.teaT > 0 && s.p.speed > s.p.vmax * 1.2, s.p);
  check('cayci: kabuğa aldırmaz', await ev(() => { const p = window.__bt.player; p.invT = 0; return p.hit(1.1, true) === false; }));

  // --- Egzoz Bulutu ---
  await race('dolmuscu', 'normal', true); await followCam(); await sim(6.6);
  r = await stage('dolmuscu');
  let smoked = 0;
  for (let i = 0; i < 14; i++) { await sim(0.25); s = await snap(); smoked = Math.max(smoked, s.smoke.filter((v) => v > 0).length); if (i === 5) await shot('pw-dolmuscu'); }
  check('dolmuscu: duman bırakıldı', s.clouds >= 10, s.clouds);
  check('dolmuscu: arkadaki dumana girdi', smoked >= 1, smoked);
  // oyuncu dumanın içindeyken ekran kararır
  await ev(() => { const g = window.__bt; g.player.smokeT = 5; g.simulate(0.05); });
  await new Promise((res) => setTimeout(res, 500));
  await shot('hud-smoke');
  check('duman perdesi açık', await ev(() => document.querySelector('#smoke').classList.contains('on')));

  if (fail.length) throw new Error('başarısız: ' + fail.join(' | '));
  return 'özel güç denetimi geçti';
};
