// Ses: efektler WebAudio tamponu, müzik <audio> öğesi (akışla, az bellek).
import { BASE } from './assets.js';

const SFX = ['boost', 'pickup', 'throw', 'hit', 'shield_on', 'shield_block', 'seagull', 'horn', 'slip', 'bump', 'drop', 'lap', 'finish',
  'tram_bell', 'meow', 'ui_click', 'ui_select', 'hop',
  'v_hosgeldin', 'v_sec', 'v_uc', 'v_iki', 'v_bir', 'v_basla', 'v_sontur', 'v_bitti', 'v_birinci', 'v_podyum', 'v_gec',
  'c_simitci', 'c_kaptan', 'c_cayci', 'c_dolmuscu'];
const LOOPS = ['engine', 'skid', 'ambience'];
const MUSIC = ['music_menu', 'music_race', 'music_results'];

export class AudioMan {
  constructor() {
    this.buf = {}; this.muted = false; this.musicEl = {}; this.current = null; this.musicVol = 0.38;
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
