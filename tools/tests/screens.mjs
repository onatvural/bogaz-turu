// README görüntüleri: yarıştan üç kare (çarşı, Galata yokuşu, Boğaz Köprüsü) → --out klasörüne PNG.
// Kullanım: node tools/play.mjs tools/tests/screens.mjs --out /tmp/bt-screens
export default async ({ ev, race, sim, shot, followCam }) => {
  await ev(() => { let s = 5; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); });
  await race('tekir', 'normal', true);
  await followCam();
  await sim(6.6);
  // oyuncu verilen pist örneğine varana dek sür
  const until = (f) => ev((f) => { const g = window.__bt, p = g.player; let n = 0; while (!(p.f >= f && p.f < f + 40) && n++ < 60 * 70) g.simulate(1 / 60); return +p.f.toFixed(1); }, f);
  await until(118); await ev(() => { const g = window.__bt; g.player.item = 'simit'; g.simulate(0.1); }); await shot('carsi');
  await until(206); await ev(() => { const g = window.__bt; g.player.pw = 1; g.simulate(0.1); }); await shot('galata');
  await until(352); await ev(() => { const g = window.__bt, p = g.player; p.pw = 1; g.simulate(0.02); g.powers.use(p); g.simulate(0.45); }); await shot('kopru');
  return 'tamam';
};
