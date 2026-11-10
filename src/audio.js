// Ses: efektler WebAudio tamponu, müzik <audio> öğesi (akışla, az bellek).
import { BASE } from './assets.js';
import { CHARACTERS, ENGINES } from './config.js';

const SFX = ['boost', 'pickup', 'throw', 'hit', 'shield_on', 'shield_block', 'seagull', 'horn', 'slip', 'bump', 'drop', 'lap', 'finish',
  'tram_bell', 'meow', 'ui_click', 'ui_select', 'hop',
  'crash', 'power_ready', 'dolmus_horn', 'smoke', 'steam', 'slam',
  'v_hosgeldin', 'v_sec', 'v_uc', 'v_iki', 'v_bir', 'v_basla', 'v_sontur', 'v_bitti', 'v_birinci', 'v_podyum', 'v_gec',
  'c_simitci', 'c_kaptan', 'c_cayci', 'c_dolmuscu'];
// engine: araca özel döngüsü yüklenemeyen kartın yedeği
const LOOPS = ['engine', 'skid', 'ambience', ...CHARACTERS.map((c) => 'eng_' + c.id)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MUSIC = ['music_menu', 'music_race', 'music_results'];

export class AudioMan {
  constructor() {
    this.buf = {}; this.muted = false; this.musicEl = {}; this.current = null; this.musicVol = 0.38;
    this.eng = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    if (this.ctx) {
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    }
    for (const m of MUSIC) {
      const el = new Audio(); el.src = `${BASE}audio/${m}.mp3`; el.loop = m !== 'music_results'; el.preload = 'none'; el.volume = 0;
      this.musicEl[m] = el;
    }
  }

  async load(onProgress) {
    if (!this.ctx) return;
    const all = [...SFX.map((n) => [n, 'mp3']), ...LOOPS.map((n) => [n, 'wav'])];
    let done = 0;
    await Promise.all(all.map(async ([n, ext]) => {
      try {
        const ab = await (await fetch(`${BASE}audio/${n}.${ext}`)).arrayBuffer();
        // eski Safari yalnızca geri çağrımlı biçimi destekler; söz dönerse reddini yut
        this.buf[n] = await new Promise((res, rej) => { const p = this.ctx.decodeAudioData(ab, res, rej); if (p?.catch) p.catch(() => {}); });
      } catch (e) { console.warn('ses yok:', n); }
      onProgress?.(++done / all.length);
    }));
  }

  // İlk dokunuşta çağrılır. iOS, kullanıcı hareketi dışında başlatılan <audio> öğelerini engeller;
  // bu yüzden müzik öğelerinin hepsini burada sessizce bir kez çalıp durdururuz.
  unlock() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    if (this.primed) return;
    this.primed = true;
    for (const n in this.musicEl) {
      const el = this.musicEl[n];
      if (n === this.current) continue;
      el.muted = true;
      el.play().then(() => { if (this.current !== n) el.pause(); el.muted = false; }).catch(() => { el.muted = false; });
    }
  }

  play(name, { vol = 1, rate = 1 } = {}) {
    const b = this.buf[name];
    if (!b || !this.ctx || this.ctx.state !== 'running') return null;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.master); src.start();
    return src;
  }

  loop(name, vol = 0) {
    const b = this.buf[name];
    if (!b || !this.ctx) return { set() {}, stop() {} };
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.master); src.start();
    const ctx = this.ctx;
    return {
      set(v, rate) { g.gain.setTargetAtTime(v, ctx.currentTime, 0.05); if (rate) src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.06); },
      stop() { try { src.stop(); } catch (e) { /* zaten durmuş */ } },
    };
  }

  // ---------- motorlar ----------
  // Her kartın kendi motor döngüsü çalar. Oyuncununki ortadadır; rakipler uzaklıkla kısılır, ekrandaki
  // yönlerine göre sağa sola kayar, yaklaşırken incelip uzaklaşırken kalınlaşır (Doppler).
  engines(karts) {
    this.stopEngines();
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const k of karts) {
      const own = this.buf['eng_' + k.char.id];
      const buf = own || this.buf.engine;
      if (!buf) continue;
      const prof = ENGINES[k.char.id] || { rate: [0.6, 1.6], vol: 1 };
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g);
      let pan = null;
      if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
      src.start(0, Math.random() * buf.duration);
      // yedek döngü daha yüksek kayıtlı; düzeyi eşitle
      this.eng.push({ k, src, g, pan, rate: prof.rate, vol: prof.vol * (own ? 1 : 0.5), v: 0 });
    }
  }

  // listenerYaw: kameranın baktığı yön. rev ≥ 0 ise oyuncu motoru bu devirde (geri sayımda gaz sesi). level: genel düzey.
  updateEngines(player, listenerYaw, rev = -1, level = 1) {
    if (!this.eng.length || !this.ctx) return;
    const now = this.ctx.currentTime;
    const rx = -Math.cos(listenerYaw), rz = Math.sin(listenerYaw); // ekranın sağı
    const pvx = Math.sin(player.velYaw) * player.speed, pvz = Math.cos(player.velYaw) * player.speed;
    for (const e of this.eng) {
      const k = e.k;
      let r = clamp(Math.abs(k.speed) / k.vmaxBase, 0, 1.25);
      if (rev >= 0) r = k === player ? rev : 0.04;
      let rate = e.rate[0] + (e.rate[1] - e.rate[0]) * Math.min(1, r) + Math.max(0, r - 1) * 0.5 + (k.boostT > 0 ? 0.12 : 0);
      let pan = 0;
      if (k === player) e.v = (0.3 + r * 0.3) * e.vol;
      else {
        const dx = k.pos.x - player.pos.x, dz = k.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 0.01;
        const fall = clamp(1 - d / 60, 0, 1);
        e.v = (0.2 + r * 0.28) * e.vol * fall * fall;
        pan = clamp(((dx * rx + dz * rz) / Math.max(d, 5)) * 0.85, -1, 1);
        const closing = ((pvx - Math.sin(k.velYaw) * k.speed) * dx + (pvz - Math.cos(k.velYaw) * k.speed) * dz) / d;
        rate *= 1 + clamp(closing / 140, -0.1, 0.1);
      }
      e.pan0 = pan; e.rate0 = rate;
    }
    // karışım bulanmasın: oyuncu + en yakın üç rakip
    const rivals = this.eng.filter((e) => e.k !== player).sort((a, b) => b.v - a.v);
    for (let i = 3; i < rivals.length; i++) rivals[i].v = 0;
    for (const e of this.eng) {
      e.g.gain.setTargetAtTime(e.v * level, now, 0.06);
      e.src.playbackRate.setTargetAtTime(clamp(e.rate0, 0.3, 3), now, 0.07);
      if (e.pan) e.pan.pan.setTargetAtTime(e.pan0, now, 0.08);
    }
  }

  stopEngines() {
    for (const e of this.eng) { try { e.src.stop(); } catch (err) { /* zaten durmuş */ } e.g.disconnect(); }
    this.eng = [];
  }

  music(name, rate = 1) {
    if (this.current === name) { if (name) this.musicEl[name].playbackRate = rate; return; }
    const old = this.current && this.musicEl[this.current];
    if (old) { old.pause(); old.volume = 0; }
    this.current = name;
    if (!name) return;
    const el = this.musicEl[name];
    el.muted = false; el.currentTime = 0; el.playbackRate = rate; el.volume = this.muted ? 0 : this.musicVol;
    el.play().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    if (this.current) this.musicEl[this.current].volume = this.muted ? 0 : this.musicVol;
    return this.muted;
  }

  // sekme gizlenince sus
  suspend(on) {
    if (this.current) { const el = this.musicEl[this.current]; on ? el.pause() : el.play().catch(() => {}); }
    if (this.ctx) on ? this.ctx.suspend() : this.ctx.resume();
  }
}
