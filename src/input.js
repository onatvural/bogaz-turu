// Girdi: klavye, oyun kolu ve dokunmatik düğmeler tek bir durumda birleşir.
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, drift: false, item: false, brake: false, power: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.state = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, power: false };
    this.onPause = null; this.onMute = null; this.onHelp = null;
    this._itemHeld = false; this._powerHeld = false;
    // en son kullanılan aygıt: ekrandaki tuş rehberi buna göre yazılır
    this.device = this.isTouch ? 'touch' : 'kb';
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.device = 'kb';
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'KeyM') this.onMute?.();
      if (e.code === 'KeyH') this.onHelp?.();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-t]')) {
      const k = el.dataset.t;
      const on = (e) => { e.preventDefault(); this.touch[k] = true; el.classList.add('on'); if (e.pointerType === 'touch') this.device = 'touch'; };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  poll() {
    const k = this.keys, t = this.touch, s = this.state;
    let steer = 0, throttle = 0, brake = 0, drift = false, item = false, power = false;
    if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) throttle = 1;
    if (k.has('ArrowDown') || k.has('KeyS')) brake = 1;
    if (k.has('Space')) drift = true;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyE') || k.has('KeyX') || k.has('Enter')) item = true;
    if (k.has('KeyQ') || k.has('KeyF') || k.has('KeyC')) power = true;
    // dokunmatik: gaz kendiliğinden basılı
    if (this.isTouch && this.touchActive) {
      if (t.left) steer -= 1;
      if (t.right) steer += 1;
      throttle = t.brake ? 0 : 1; brake = t.brake ? 1 : 0;
      drift = drift || t.drift; item = item || t.item;
    }
    power = power || t.power; // güç göstergesine fareyle de basılabilir
    // oyun kolu
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      let used = Math.abs(ax) > 0.15;
      if (used) steer += ax;
      if (p.buttons[14]?.pressed) { steer -= 1; used = true; }
      if (p.buttons[15]?.pressed) { steer += 1; used = true; }
      if (p.buttons[0]?.pressed || p.buttons[7]?.value > 0.2) { throttle = 1; used = true; }
      if (p.buttons[1]?.pressed || p.buttons[6]?.value > 0.2) { brake = 1; used = true; }
      if (p.buttons[5]?.pressed || p.buttons[4]?.pressed) { drift = true; used = true; }
      if (p.buttons[2]?.pressed) { item = true; used = true; }
      if (p.buttons[3]?.pressed) { power = true; used = true; }
      if (used) this.device = 'pad';
      break;
    }
    s.steer = Math.max(-1, Math.min(1, steer)); s.throttle = throttle; s.brake = brake; s.drift = drift;
    s.item = item && !this._itemHeld; // yalnız basış anı
    this._itemHeld = item;
    s.power = power && !this._powerHeld;
    this._powerHeld = power;
    return s;
  }
}
