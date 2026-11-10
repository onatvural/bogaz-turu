// Motor sesi denetimi: her kartın kendi döngüsü çalmalı; rakipler uzaklıkla kısılmalı, soldaki sola, sağdaki sağa kaymalı.
// Kullanım: node tools/play.mjs tools/tests/audio.mjs
export default async ({ ev, race, sim, log }) => {
  await race('simitci', 'normal', true);
  const st = await ev(() => { const a = window.__bt.audio; return { ctx: a.ctx && a.ctx.state, bufs: Object.keys(a.buf).filter((n) => n.startsWith('eng')), n: a.eng.length, missing: ['crash', 'power_ready', 'dolmus_horn', 'smoke', 'steam', 'slam'].filter((n) => !a.buf[n]) }; });
  log('ses bağlamı', JSON.stringify(st));
  await sim(6.6);
  // sahne: oyuncu ortada; biri solunda yakın, biri sağında yakın, biri önde 30 m, biri arkada 80 m
  await ev(() => {
    const g = window.__bt, T = g.T, p = g.player, o = g.karts.filter((k) => k !== p);
    const put = (k, f, lat, sp) => { T.pointAt(f, lat, k.pos); k.idx = T.wrap(Math.floor(f)); k.yaw = k.velYaw = k.bodyYaw = T.headingAt(k.idx); k.speed = sp; k.lap = 1; k.kx = k.kz = 0; k.spinT = 0; };
    put(p, 20, 0, 30); put(o[0], 20, -5, 30); put(o[1], 20, 5, 30); put(o[2], 35, 0, 20); put(o[3], -20 + T.N, 0, 44); put(o[4], 300, 0, 30);
    g.camYaw = p.yaw; g.updateAudio();
  });
  await new Promise((r) => setTimeout(r, 900));
  const v = await ev(() => { const g = window.__bt; return g.audio.eng.map((e) => ({ id: e.k.char.id, me: e.k === g.player, gain: +e.g.gain.value.toFixed(3), rate: +e.src.playbackRate.value.toFixed(3), pan: e.pan ? +e.pan.pan.value.toFixed(2) : null, dur: +e.src.buffer.duration.toFixed(2), own: !!g.audio.buf['eng_' + e.k.char.id] })); });
  for (const e of v) log(JSON.stringify(e));
  const me = v.find((e) => e.me), o = v.filter((e) => !e.me);
  const ok = st.n === 6 && st.missing.length === 0 && v.every((e) => e.own) && me.gain > 0.3 && me.pan === 0
    && o[0].pan < -0.3 && o[1].pan > 0.3 && o[0].gain > 0.1 && o[2].gain > 0 && o[2].gain < o[0].gain && o[3].gain === 0 && o[4].gain === 0
    && new Set(v.map((e) => e.rate)).size >= 4;
  if (!ok) throw new Error('motor sesi denetimi başarısız');
  return 'motor sesi denetimi geçti';
};
