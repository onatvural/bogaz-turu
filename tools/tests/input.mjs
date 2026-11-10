// Girdi denetimi: gerçek tuş olaylarıyla sürüş, özel güç tuşu, güç göstergesine tıklama, tuş rehberi.
// Kullanım: node tools/play.mjs tools/tests/input.mjs
export default async ({ ev, page, race, sim, shot, log }) => {
  const fail = [];
  const check = (name, ok, info) => { log(ok ? '✓' : '✗', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fail.push(name); };
  const key = (type, code) => ev((t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), type, code);

  await race('cayci', 'kolay', false); // oyuncu klavyeyle sürer
  await sim(6.6);
  check('gaz yokken rehber açık kalır', await ev(() => { const g = window.__bt; g.simulate(10); return document.querySelector('#help').classList.contains('on') && g.player.speed < 1; }));
  await key('keydown', 'ArrowUp');
  await sim(3);
  let s = await ev(() => { const g = window.__bt; return { speed: g.player.speed, help: document.querySelector('#help').classList.contains('on'), dev: g.input.device }; });
  check('yukarı ok gaza basar', s.speed > 20, s.speed);
  check('gaza basınca rehber çekilir', !s.help);
  // H rehberi geri getirir, yine H kapatır
  await key('keydown', 'KeyH'); await key('keyup', 'KeyH'); await sim(0.1);
  check('H rehberi açar', await ev(() => document.querySelector('#help').classList.contains('on')));
  await key('keydown', 'KeyH'); await key('keyup', 'KeyH'); await sim(0.1);
  check('H rehberi kapatır', await ev(() => !document.querySelector('#help').classList.contains('on')));
  // güç dolmadan Q işe yaramaz
  await key('keydown', 'KeyQ'); await sim(0.1); await key('keyup', 'KeyQ');
  check('güç dolmadan kullanılamaz', await ev(() => !window.__bt.powers.uses.cayci));
  // dolunca gösterge parlar, Q kullanır
  await ev(() => { const g = window.__bt; g.player.pw = 1; g.simulate(0.05); });
  check('dolunca gösterge "hazır"', await ev(() => document.querySelector('#power').classList.contains('ready')));
  await shot('input-ready');
  await key('keydown', 'KeyQ'); await sim(0.1); await key('keyup', 'KeyQ');
  s = await ev(() => { const g = window.__bt; return { uses: g.powers.uses.cayci, teaT: g.player.teaT, active: document.querySelector('#power').classList.contains('active') }; });
  check('Q özel gücü kullanır', s.uses === 1 && s.teaT > 3 && s.active, s);
  // göstergeye fareyle basmak da kullanır
  await sim(4);
  await ev(() => { const g = window.__bt; g.player.pw = 1; g.simulate(0.05); document.querySelector('#power').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); g.simulate(0.05); document.querySelector('#power').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' })); });
  check('göstergeye tıklamak gücü kullanır', await ev(() => window.__bt.powers.uses.cayci === 2));
  // eşya tuşu
  await ev(() => { const g = window.__bt; g.player.item = 'nazar'; g.player.rouletteT = 0; });
  await key('keydown', 'ShiftLeft'); await sim(0.1); await key('keyup', 'ShiftLeft');
  check('SHIFT eşyayı kullanır', await ev(() => window.__bt.player.shield === true));
  await key('keyup', 'ArrowUp');
  if (fail.length) throw new Error('başarısız: ' + fail.join(' | '));
  return 'girdi denetimi geçti';
};
