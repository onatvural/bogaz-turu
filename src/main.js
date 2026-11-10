import '@fontsource/baloo-2/800.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/900.css';
import './style.css';
import { Game } from './game.js';
import { AudioMan } from './audio.js';
import { Input } from './input.js';
import { BASE } from './assets.js';
import { CHARACTERS, DIFFICULTY, POWERS } from './config.js';
import { fmtTime, helpHTML } from './hud.js';

const $ = (s) => document.querySelector(s);
const screens = { title: $('#s-title'), select: $('#s-select'), pause: $('#s-pause'), results: $('#s-results') };
const show = (name) => { for (const k in screens) screens[k].classList.toggle('on', k === name); };

const audio = new AudioMan();
const input = new Input();
const game = new Game($('#c'), audio, input);
window.__bt = game;

let sel = localStorage.getItem('bt-char') || 'simitci';
let diff = localStorage.getItem('bt-diff') || 'normal';
if (!CHARACTERS.some((c) => c.id === sel)) sel = 'simitci';
if (!DIFFICULTY[diff]) diff = 'normal';

if (input.isTouch) document.body.classList.add('touch');
input.bindTouch($('#hud'));
input.onHelp = () => { if (game.hud && game.state !== 'attract') game.hud.toggleHelp(); };

// ---------- yükleme ----------
const prog = [0, 0];
const setProg = () => {
  const p = prog[0] * 0.75 + prog[1] * 0.25;
  $('#loader-fill').style.transform = `scaleX(${p})`;
  $('#loader-txt').textContent = p < 0.4 ? 'Çaylar demleniyor…' : p < 0.8 ? 'Simitler fırından çıkıyor…' : 'Vapur yanaşıyor…';
};
(async () => {
  try { await document.fonts.load('800 120px "Baloo 2"'); } catch (e) { /* yazı tipi gelmezse yedek kullanılır */ }
  await Promise.all([
    game.init((p) => { prog[0] = p; setProg(); }),
    audio.load((p) => { prog[1] = p; setProg(); }),
  ]);
  $('#loader').hidden = true;
  $('#btn-start').hidden = false;
})().catch((e) => { console.error(e); $('#loader-txt').textContent = 'Yüklenemedi: ' + e.message; });

// ---------- açılış ----------
$('#btn-start').addEventListener('click', () => {
  audio.unlock();
  audio.play('ui_select', { vol: 0.7 });
  audio.music('music_menu');
  setTimeout(() => audio.play('v_sec', { vol: 1 }), 500);
  show('select');
});

// ---------- yarışçı seçimi ----------
const chars = $('#chars');
for (const c of CHARACTERS) {
  const b = document.createElement('button');
  b.className = 'card'; b.dataset.id = c.id; b.style.setProperty('--c', c.color);
  b.innerHTML = `<img src="${BASE}img/p_${c.id}.webp" alt=""><span>${c.name}</span>`;
  b.addEventListener('click', () => { pick(c.id, true); });
  chars.appendChild(b);
}
for (const k in DIFFICULTY) {
  const b = document.createElement('button');
  b.dataset.d = k; b.innerHTML = `${DIFFICULTY[k].label}<small>${DIFFICULTY[k].sub}</small>`;
  b.addEventListener('click', () => { diff = k; localStorage.setItem('bt-diff', k); audio.play('ui_click', { vol: 0.7 }); syncDiff(); });
  $('#diffs').appendChild(b);
}
const syncDiff = () => { for (const b of $('#diffs').children) b.classList.toggle('sel', b.dataset.d === diff); };
let voiceSrc = null;
function pick(id, sound) {
  sel = id; localStorage.setItem('bt-char', id);
  const c = CHARACTERS.find((x) => x.id === id);
  for (const b of chars.children) b.classList.toggle('sel', b.dataset.id === id);
  $('#d-kart').src = `${BASE}img/k_${id}.webp`;
  $('#d-name').textContent = c.name; $('#d-tag').textContent = c.tag;
  $('#st-hiz').style.width = c.hiz * 20 + '%'; $('#st-ivme').style.width = c.ivme * 20 + '%'; $('#st-tutus').style.width = c.tutus * 20 + '%';
  $('#st-agirlik').style.width = c.agirlik * 20 + '%';
  $('#d-pw-img').src = `${BASE}img/pw_${id}.webp`;
  $('#d-pw-name').textContent = POWERS[id].name; $('#d-pw-desc').textContent = POWERS[id].desc;
  if (sound) {
    audio.play('ui_click', { vol: 0.6 });
    try { voiceSrc?.stop(); } catch (e) { /* bitmiş */ }
    voiceSrc = audio.play(c.voice, { vol: 0.95 });
  }
}
pick(sel, false); syncDiff();

function race() {
  show(null);
  document.body.classList.add('racing');
  input.touchActive = true;
  game.startRace(sel, diff);
}
$('#btn-race').addEventListener('click', () => { audio.unlock(); audio.play('ui_select', { vol: 0.7 }); race(); });

// ---------- duraklatma ----------
function pause(on) {
  if (!['race', 'countdown', 'intro'].includes(game.state)) return;
  game.paused = on;
  if (on) $('#pause-keys').innerHTML = helpHTML(input.device);
  show(on ? 'pause' : null);
  audio.suspend(on);
}
input.onPause = () => pause(!game.paused);
input.onMute = () => audio.toggleMute();
$('#btn-pause').addEventListener('click', () => pause(true));
$('#btn-resume').addEventListener('click', () => pause(false));
$('#btn-restart').addEventListener('click', () => { audio.suspend(false); race(); });
const toMenu = () => {
  audio.suspend(false);
  game.paused = false;
  game.stopRace();
  document.body.classList.remove('racing');
  input.touchActive = false;
  audio.music('music_menu');
  show('select');
};
$('#btn-quit').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'race') pause(true); });

// ---------- sonuç ----------
let resTimer = null;
function renderResults() {
  const p = game.player;
  $('#r-title').textContent = p.place === 1 ? 'BİRİNCİSİN!' : p.place <= 3 ? `${p.place}. OLDUN!` : 'YARIŞ BİTTİ';
  $('#r-list').innerHTML = game.order.map((k) =>
    `<li class="${k.isPlayer ? 'me' : ''}"><b>${k.place}</b><img src="${BASE}img/p_${k.char.id}.webp" alt=""><span>${k.char.name}</span><em>${k.finished ? fmtTime(k.finishTime) : 'yolda…'}</em></li>`).join('');
}
game.onFinish = () => {
  renderResults(); show('results');
  clearInterval(resTimer);
  resTimer = setInterval(() => { if (screens.results.classList.contains('on')) renderResults(); else clearInterval(resTimer); }, 700);
};
$('#btn-again').addEventListener('click', () => { audio.play('ui_select', { vol: 0.7 }); race(); });
$('#btn-change').addEventListener('click', toMenu);
