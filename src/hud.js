// Yarış içi gösterge: sıra, tur, süre, eşya, hız, mini harita, sıralama şeridi.
import { BASE } from './assets.js';
import { CHARACTERS, ITEMS, TOTAL_LAPS } from './config.js';

const $ = (s) => document.querySelector(s);
export const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.place = $('#place-n'); this.lap = $('#lap-n'); this.time = $('#time');
    this.itemImg = $('#item-img'); this.itemName = $('#item-name'); this.slot = $('#itemslot');
    this.speedFill = $('#speed-fill'); this.speedN = $('#speed-n');
    this.msg = $('#msg'); this.warnEl = $('#warn');
    this.rank = $('#rank');
    this.map = $('#minimap'); this.mctx = this.map.getContext('2d');
    this.itemKeys = Object.keys(ITEMS);
    this.last = {};
    this.warnT = 0; this.msgT = 0;
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

  update(dt) {
    const g = this.game, k = g.player, L = this.last;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg.className = ''; }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) this.warnEl.classList.remove('show'); }

    if (L.place !== k.place) { L.place = k.place; this.place.textContent = k.place; this.place.parentElement.classList.remove('pop'); void this.place.offsetWidth; this.place.parentElement.classList.add('pop'); }
    const lap = Math.max(1, Math.min(TOTAL_LAPS, k.lap));
    if (L.lap !== lap) { L.lap = lap; this.lap.textContent = lap; }
    const tt = fmtTime(k.finished ? k.finishTime : g.raceTime);
    if (L.tt !== tt) { L.tt = tt; this.time.textContent = tt; }

    // eşya yuvası
    let icon = k.item;
    if (k.rouletteT > 0) icon = this.itemKeys[Math.floor(performance.now() / 80) % this.itemKeys.length];
    if (L.icon !== icon) {
      L.icon = icon;
      if (icon) { this.itemImg.src = `${BASE}img/i_${icon}.webp`; this.itemImg.style.opacity = 1; } else this.itemImg.style.opacity = 0;
      this.itemName.textContent = k.item && k.rouletteT <= 0 ? ITEMS[k.item].name : '';
      this.slot.classList.toggle('ready', !!k.item && k.rouletteT <= 0);
    }

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
