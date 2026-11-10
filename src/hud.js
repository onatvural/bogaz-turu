// Yarış içi gösterge: sıra, tur, süre, eşya, özel güç, hız, mini harita, sıralama şeridi, tuş rehberi.
import { BASE } from './assets.js';
import { ITEMS, POWERS, TOTAL_LAPS } from './config.js';

const $ = (s) => document.querySelector(s);
export const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

// Aygıta göre tuş rehberi: [tuşlar, işlev]
const HELP = {
  kb: [[['←', '→'], 'Yön'], [['↑'], 'Gaz'], [['↓'], 'Fren'], [['BOŞLUK'], 'Drift'], [['SHIFT'], 'Eşya'], [['Q'], 'Özel güç']],
  pad: [[['◀', '▶'], 'Yön'], [['A'], 'Gaz'], [['B'], 'Fren'], [['RB'], 'Drift'], [['X'], 'Eşya'], [['Y'], 'Özel güç']],
};
const KEYS = { kb: { item: 'SHIFT', power: 'Q' }, pad: { item: 'X', power: 'Y' }, touch: { item: '', power: '' } };
export const helpHTML = (device) => (device === 'touch'
  ? '<span>Gaz kendiliğinden basılı</span><span><b>DRIFT</b>\'i basılı tutup dön, bırakınca turbo</span><span><b>GÜÇ</b> dolunca parlar</span>'
  : HELP[device].map(([keys, label]) => `<span>${keys.map((k) => `<kbd>${k}</kbd>`).join('')} ${label}</span>`).join(''));

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.place = $('#place-n'); this.lap = $('#lap-n'); this.time = $('#time');
    this.itemImg = $('#item-img'); this.itemName = $('#item-name'); this.slot = $('#itemslot'); this.itemKey = $('#item-key');
    this.speedFill = $('#speed-fill'); this.speedN = $('#speed-n');
    this.msg = $('#msg'); this.warnEl = $('#warn');
    this.rank = $('#rank');
    this.pwEls = [...document.querySelectorAll('.pw')]; this.pwName = $('#pw-name'); this.pwKey = $('#pw-key');
    this.toasts = $('#toasts'); this.help = $('#help'); this.smoke = $('#smoke');
    this.map = $('#minimap'); this.mctx = this.map.getContext('2d');
    this.itemKeys = Object.keys(ITEMS);
    this.last = {};
    this.warnT = 0; this.msgT = 0;
    this.helpMode = 'auto'; // auto: yarış başında kısa süre; on/off: H tuşuyla
    this.live = [];
    this.buildMap();
  }

  buildRank(karts) {
    this.rank.innerHTML = '';
    this.chips = new Map();
    for (const k of karts) {
      const d = document.createElement('div');
      d.className = 'chip' + (k.isPlayer ? ' me' : '');
      d.innerHTML = `<b></b><img src="${BASE}img/p_${k.char.id}.webp" alt="">`;
      d.style.setProperty('--c', k.char.color);
      this.rank.appendChild(d);
      this.chips.set(k, d);
    }
  }

  // yeni yarış: oyuncunun güç simgesi, sayaçlar sıfır
  setPlayer(k) {
    this.last = {};
    this.helpMode = 'auto'; this.readyTold = false;
    for (const t of this.live) t.el.remove();
    this.live.length = 0;
    for (const el of this.pwEls) {
      el.querySelector('img').src = `${BASE}img/pw_${k.char.id}.webp`;
      el.classList.remove('ready', 'active');
      el.style.setProperty('--p', 0);
    }
    this.pwName.textContent = POWERS[k.char.id].name;
    this.smoke.classList.remove('on');
  }

  buildMap() {
    const T = this.game.T, S = this.map.width;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.px[i]); x1 = Math.max(x1, T.px[i]); z0 = Math.min(z0, T.pz[i]); z1 = Math.max(z1, T.pz[i]); }
    const sc = (S - 28) / Math.max(x1 - x0, z1 - z0);
    const ox = (S - (x1 - x0) * sc) / 2 - x0 * sc, oz = (S - (z1 - z0) * sc) / 2 - z0 * sc;
    this.mx = (x) => x * sc + ox; this.mz = (z) => z * sc + oz;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.lineJoin = g.lineCap = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= T.N; i += 2) { const j = i % T.N; i ? g.lineTo(this.mx(T.px[j]), this.mz(T.pz[j])) : g.moveTo(this.mx(T.px[j]), this.mz(T.pz[j])); } };
    path(); g.strokeStyle = 'rgba(10,40,60,0.75)'; g.lineWidth = 11; g.stroke();
    path(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#e23b2e'; g.fillRect(this.mx(T.px[0]) - 6, this.mz(T.pz[0]) - 2, 12, 4);
    this.mapBg = c;
  }

  show(on) { this.el.classList.toggle('on', on); }

  message(text, dur = 1.2, cls = '') {
    this.msg.textContent = text;
    this.msg.className = 'show ' + cls;
    void this.msg.offsetWidth;
    this.msg.classList.add('go');
    this.msgT = dur;
  }

  warn(text, dur = 1.6) { this.warnEl.textContent = text; this.warnEl.classList.add('show'); this.warnT = dur; }

  // kısa bildirim: portre + iki satır
  toast(char, title, sub, me = false, dur = 2.2) {
    while (this.live.length >= 3) this.live.shift().el.remove();
    const d = document.createElement('div');
    d.className = 'toast' + (me ? ' me' : '');
    d.style.setProperty('--c', char.color);
    d.innerHTML = `<img src="${BASE}img/p_${char.id}.webp" alt=""><div><b></b><span></span></div>`;
    d.querySelector('b').textContent = title; d.querySelector('span').textContent = sub;
    this.toasts.appendChild(d);
    this.live.push({ el: d, t: dur });
  }

  // bir yarışçı özel gücünü kullandı: oyuncununki her zaman, rakiplerinki yakındaysa bildirilir
  powerUsed(k, name) {
    const p = this.game.player;
    if (k.isPlayer) this.toast(k.char, name + '!', 'Özel güç', true);
    else if (p && k.pos.distanceTo(p.pos) < 85) this.toast(k.char, name + '!', k.char.name);
  }

  // oyuncunun gücü doldu
  powerReady() {
    for (const el of this.pwEls) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    if (this.readyTold) return;
    this.readyTold = true;
    const key = KEYS[this.game.input.device].power;
    this.toast(this.game.player.char, 'Özel güç hazır!', key ? `${key} tuşuna bas` : 'GÜÇ düğmesine bas', true, 3);
  }

  toggleHelp() {
    this.helpMode = this.help.classList.contains('on') ? 'off' : 'on';
  }

  update(dt) {
    const g = this.game, k = g.player, L = this.last;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg.className = ''; }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) this.warnEl.classList.remove('show'); }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i];
      t.t -= dt;
      if (t.t < 0.3) t.el.classList.add('out');
      if (t.t <= 0) { t.el.remove(); this.live.splice(i, 1); }
    }

    if (L.place !== k.place) { L.place = k.place; this.place.textContent = k.place; this.place.parentElement.classList.remove('pop'); void this.place.offsetWidth; this.place.parentElement.classList.add('pop'); }
    const lap = Math.max(1, Math.min(TOTAL_LAPS, k.lap));
    if (L.lap !== lap) { L.lap = lap; this.lap.textContent = lap; }
    const tt = fmtTime(k.finished ? k.finishTime : g.raceTime);
    if (L.tt !== tt) { L.tt = tt; this.time.textContent = tt; }

    // aygıt değişince tuş adları ve rehber yenilenir
    const dev = g.input.device;
    if (L.dev !== dev) {
      L.dev = dev;
      this.help.innerHTML = helpHTML(dev) + (dev === 'kb' ? '<span class="dim"><kbd>H</kbd> gizle</span>' : '');
      this.itemKey.textContent = KEYS[dev].item; this.itemKey.hidden = !KEYS[dev].item;
      this.pwKey.textContent = KEYS[dev].power; this.pwKey.hidden = !KEYS[dev].power;
    }
    // tuş rehberi: yarışın başında kendiliğinden görünür, sonra çekilir
    const auto = g.state === 'intro' || g.state === 'countdown' || (g.state === 'race' && (g.raceTime < 9 || !g.throttled));
    const helpOn = this.helpMode === 'on' || (this.helpMode === 'auto' && auto);
    if (L.help !== helpOn) { L.help = helpOn; this.help.classList.toggle('on', helpOn); }

    // eşya yuvası
    let icon = k.item;
    if (k.rouletteT > 0) icon = this.itemKeys[Math.floor(performance.now() / 80) % this.itemKeys.length];
    const ready = !!k.item && k.rouletteT <= 0;
    if (L.icon !== icon || L.iready !== ready) {
      L.icon = icon; L.iready = ready;
      if (icon) { this.itemImg.src = `${BASE}img/i_${icon}.webp`; this.itemImg.style.opacity = 1; } else this.itemImg.style.opacity = 0;
      this.itemName.textContent = ready ? ITEMS[k.item].name : '';
      this.slot.classList.toggle('ready', ready);
    }

    // özel güç göstergesi
    const pct = Math.round((k.pwBusy > 0 ? 1 : k.pw) * 100), pst = k.pwBusy > 0 ? 2 : k.pwReady ? 1 : 0;
    if (L.pct !== pct || L.pst !== pst) {
      L.pct = pct; L.pst = pst;
      for (const el of this.pwEls) {
        el.style.setProperty('--p', pct);
        el.classList.toggle('ready', pst === 1); el.classList.toggle('active', pst === 2);
      }
    }
    const inSmoke = k.smokeT > 0;
    if (L.smoke !== inSmoke) { L.smoke = inSmoke; this.smoke.classList.toggle('on', inSmoke); }

    const sp = Math.max(0, k.speed);
    this.speedFill.style.transform = `scaleX(${Math.min(1, sp / (k.vmaxBase * 1.3))})`;
    this.speedFill.classList.toggle('boost', k.boostT > 0);
    const kmh = Math.round(sp * 2.6);
    if (L.kmh !== kmh) { L.kmh = kmh; this.speedN.textContent = kmh; }

    for (const o of g.karts) {
      const c = this.chips.get(o);
      if (c._p !== o.place) { c._p = o.place; c.style.transform = `translateY(${(o.place - 1) * 46}px)`; c.firstChild.textContent = o.place; }
    }

    // mini harita
    const m = this.mctx, S = this.map.width;
    m.clearRect(0, 0, S, S);
    m.drawImage(this.mapBg, 0, 0);
    for (const o of g.karts) {
      if (o.isPlayer) continue;
      m.beginPath(); m.arc(this.mx(o.pos.x), this.mz(o.pos.z), 5, 0, 6.3); m.fillStyle = o.char.color; m.fill();
      m.lineWidth = 1.5; m.strokeStyle = '#fff'; m.stroke();
    }
    m.beginPath(); m.arc(this.mx(k.pos.x), this.mz(k.pos.z), 7.5, 0, 6.3); m.fillStyle = k.char.color; m.fill();
    m.lineWidth = 3; m.strokeStyle = '#fff'; m.stroke();
  }
}
