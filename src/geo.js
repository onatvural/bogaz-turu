// Kabartma geometrisi için ortak araçlar: üçgen çorbası ve doku pikseliyle çalışan cephe paneli.
import * as THREE from 'three';

// İndekssiz üçgen çorbası. Köşe başına konum, yüz normali, uv ve renk çarpanı (pişmiş gölge) tutar.
// Malzeme başına tek çorba → tek ağ → tek çizim çağrısı; indeks yok, WebGL1'de 65 bin sınırı da yok.
export class Soup {
  constructor(cap = 3072) {
    this.n = 0; this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.nor = new Int8Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.col = new Uint8Array(cap * 3);
  }
  grow() {
    const cp = (C, old) => { const a = new C(old.length * 2); a.set(old); return a; };
    this.pos = cp(Float32Array, this.pos); this.nor = cp(Int8Array, this.nor);
    this.uv = cp(Float32Array, this.uv); this.col = cp(Uint8Array, this.col);
    this.cap *= 2;
  }
  // a, b, c: [x, y, z] — görünen yüzden bakınca saat yönünün tersine. u*: [u, v]. s: gölge çarpanı ya da [r, g, b]
  tri(a, b, c, ua, ub, uc, s = 1) {
    if (this.n + 3 > this.cap) this.grow();
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx = Math.round((nx / l) * 127); ny = Math.round((ny / l) * 127); nz = Math.round((nz / l) * 127);
    const r = s.length ? s[0] : s, g = s.length ? s[1] : s, bl = s.length ? s[2] : s;
    const cr = Math.min(255, Math.round(r * 255)), cg = Math.min(255, Math.round(g * 255)), cb = Math.min(255, Math.round(bl * 255));
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c, t = k === 0 ? ua : k === 1 ? ub : uc, i = this.n++;
      this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2];
      this.nor[i * 3] = nx; this.nor[i * 3 + 1] = ny; this.nor[i * 3 + 2] = nz;
      this.uv[i * 2] = t[0]; this.uv[i * 2 + 1] = t[1];
      this.col[i * 3] = cr; this.col[i * 3 + 1] = cg; this.col[i * 3 + 2] = cb;
    }
  }
  quad(a, b, c, d, ua, ub, uc, ud, s = 1) { this.tri(a, b, c, ua, ub, uc, s); this.tri(a, c, d, ua, uc, ud, s); }
  get tris() { return this.n / 3; }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3, true));
    return g;
  }
}

const EPS = 0.35; // duvar karolarının bindirme payı (px) — T birleşimlerinde ışık sızmasın

// Cephe paneli. Noktalar doku pikseliyle verilir: [px, py, z, ux?, uy?]
//   px sağa, py aşağı (cepheye dışarıdan bakarken), z duvardan dışarı metre (içeri −).
//   uv aynı pikselden okunur; ux/uy verilirse doku oradan alınır (kenar şeridi, düz sıva örneği…).
// pos: nokta → dünya [x, y, z]; uv: nokta → [u, v]
export function makePanel(S, pos, uv) {
  const P = {
    pos,
    quad(a, b, c, d, s) { S.quad(pos(a), pos(b), pos(c), pos(d), uv(a), uv(b), uv(c), uv(d), s); },
    tri(a, b, c, s) { S.tri(pos(a), pos(b), pos(c), uv(a), uv(b), uv(c), s); },

    // duvara paralel dikdörtgen; r = [u0, v0, u1, v1] verilirse doku o dikdörtgenden
    cell(x0, y0, x1, y1, z = 0, s = 1, r) {
      if (r) P.quad([x0, y1, z, r[0], r[3]], [x1, y1, z, r[2], r[3]], [x1, y0, z, r[2], r[1]], [x0, y0, z, r[0], r[1]], s);
      else P.quad([x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z], s);
    },

    // komşusuyla hafif bindiren karo (T birleşimi olan döşemelerde)
    tile(x0, y0, x1, y1, r, s = 1) { P.cell(x0 - EPS, y0 - EPS, x1 + EPS, y1 + EPS, 0, s, r); },

    // duvar yüzeyi: özel dikdörtgenlerin (delik, yeniden eşlenen bölge) dışında kalan yer
    wall(x0, y0, x1, y1, holes, s = 1) {
      for (const [a, b, c, d] of cells(x0, y0, x1, y1, holes)) P.cell(a - EPS, b - EPS, c + EPS, d + EPS, 0, s);
    },

    // duvardan dışarı kutu (z0 → z1): ön yüz resmin kendisi, yan yüzler kenardaki ince şeritten
    //   o.ux / o.vy: ön yüzün doku aralığı (verilmezse kendi yeri), o.sw: şerit kalınlığı, 0 verilen yüz çizilmez
    //   o.su: yan yüzlerin şeridi kenar yerine bu sütundan (kenarı duvar renginde kalan kutular için)
    box(x0, y0, x1, y1, z0, z1, o = {}) {
      const w = o.sw || 4, [u0, u1] = o.ux || [x0, x1], [v0, v1] = o.vy || [y0, y1], s = o.s ?? 1;
      const l0 = o.su ?? u0, r1 = o.su != null ? o.su + w : u1;
      if (o.front !== 0) P.quad([x0, y1, z1, u0, v1], [x1, y1, z1, u1, v1], [x1, y0, z1, u1, v0], [x0, y0, z1, u0, v0], s);
      if (o.left !== 0) P.quad([x0, y1, z0, l0 + w, v1], [x0, y1, z1, l0, v1], [x0, y0, z1, l0, v0], [x0, y0, z0, l0 + w, v0], s);
      if (o.right !== 0) P.quad([x1, y1, z1, r1, v1], [x1, y1, z0, r1 - w, v1], [x1, y0, z0, r1 - w, v0], [x1, y0, z1, r1, v0], s);
      if (o.top !== 0) P.quad([x0, y0, z1, u0, v0], [x1, y0, z1, u1, v0], [x1, y0, z0, u1, v0 + w], [x0, y0, z0, u0, v0 + w], s);
      if (o.bottom !== 0) P.quad([x0, y1, z0, u0, v1 - w], [x1, y1, z0, u1, v1 - w], [x1, y1, z1, u1, v1], [x0, y1, z1, u0, v1], s * (o.under ?? 0.6));
    },

    // içeri gömülen kapı / vitrin: dip yüz resmin kendisi, yanaklar deliğin hemen dışındaki duvar şeridi
    //   fr: eşiğin dokudan alındığı satır (verilmezse deliğin hemen altı)
    hole(x0, y0, x1, y1, d, fr = y1 + 1) {
      P.quad([x0, y1, -d], [x1, y1, -d], [x1, y0, -d], [x0, y0, -d], 0.97);
      P.quad([x0, y1, 0, x0 - 1, y1], [x0, y1, -d, x0 - 5, y1], [x0, y0, -d, x0 - 5, y0], [x0, y0, 0, x0 - 1, y0], 0.8);
      P.quad([x1, y1, -d, x1 + 5, y1], [x1, y1, 0, x1 + 1, y1], [x1, y0, 0, x1 + 1, y0], [x1, y0, -d, x1 + 5, y0], 0.8);
      P.quad([x0, y0, -d, x0, y0 - 5], [x1, y0, -d, x1, y0 - 5], [x1, y0, 0, x1, y0 - 1], [x0, y0, 0, x0, y0 - 1], 0.6);
      P.quad([x0, y1, 0, x0, fr], [x1, y1, 0, x1, fr], [x1, y1, -d, x1, fr + 4], [x0, y1, -d, x0, fr + 4], 0.9); // eşik
    },

    // cumba: resimde önden çizilmiş üç yüzlü çıkma; yan yüzler pahlı, böylece resim tam oturur
    bay(b, d, eave) {
      const [a, f0, f1, c] = b.x, [y0, y1] = b.y;
      P.quad([f0, y1, d], [f1, y1, d], [f1, y0, d], [f0, y0, d], 1);
      P.quad([a, y1, 0], [f0, y1, d], [f0, y0, d], [a, y0, 0], 1);
      P.quad([f1, y1, d], [c, y1, 0], [c, y0, 0], [f1, y0, d], 1);
      P.quad([a, y1, 0, a, y1 - 6], [c, y1, 0, c, y1 - 6], [f1, y1, d, f1, y1 - 1], [f0, y1, d, f0, y1 - 1], 0.55); // alt
      if (!b.cap) { P.quad([f0, y0, d, f0, y0 + 1], [f1, y0, d, f1, y0 + 1], [c, y0, 0, c, y0 + 6], [a, y0, 0, a, y0 + 6], 1); return; }
      // kiremitli küçük saçak: duvardaki üst çizgiden öne ve yanlara eğimli üç yüz + alt tabla
      const [ca, cf0, cf1, cc] = b.cap.x, [yT, yE] = b.cap.y, e = d + eave;
      P.quad([cf0, yE, e], [cf1, yE, e], [cf1, yT, 0], [cf0, yT, 0], 1);
      P.tri([ca, yE, 0], [cf0, yE, e], [cf0, yT, 0], 1);
      P.tri([cf1, yE, e], [cc, yE, 0], [cf1, yT, 0], 1);
      P.quad([ca, yE, 0, ca, yE + 5], [cc, yE, 0, cc, yE + 5], [cf1, yE, e, cf1, yE + 2], [cf0, yE, e, cf0, yE + 2], 0.55);
    },

    // tente: üst kenarı duvarda (t0..t1, yT), ön çubuğu D kadar dışarıda (x0..x1, yB); etek yB..yS dik sarkar
    awning(x0, x1, t0, t1, yT, yB, yS, D, under) {
      P.quad([x0, yB, D], [x1, yB, D], [t1, yT, 0], [t0, yT, 0], 1);
      P.quad([x0, yS, D], [x1, yS, D], [x1, yB, D], [x0, yB, D], 1);
      P.tri([t0, yT, 0, t0 + 2, yT], [t0, yB, 0, t0 + 6, yB], [x0, yB, D, x0 + 2, yB], 0.85);
      P.tri([t1, yT, 0, t1 - 2, yT], [x1, yB, D, x1 - 2, yB], [t1, yB, 0, t1 - 6, yB], 0.85);
      if (!under) return;
      // alttan görünen yüzler (gölgede)
      P.quad([t0, yT, 0], [t1, yT, 0], [x1, yB, D], [x0, yB, D], 0.5);
      P.quad([x1, yS, D], [x0, yS, D], [x0, yB, D], [x1, yB, D], 0.55);
      P.tri([t0, yT, 0, t0 + 2, yT], [x0, yB, D, x0 + 2, yB], [t0, yB, 0, t0 + 6, yB], 0.5);
      P.tri([t1, yT, 0, t1 - 2, yT], [t1, yB, 0, t1 - 6, yB], [x1, yB, D, x1 - 2, yB], 0.5);
    },
  };
  return P;
}

// [x0, y0, x1, y1] dikdörtgenini özel dikdörtgenlerin çevresinde karolara böler; komşu karolar birleştirilir.
function cells(x0, y0, x1, y1, sp) {
  const cut = (lo, hi, k) => [...new Set([lo, hi, ...sp.flatMap((r) => [r[k], r[k + 2]])])].filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
  const xs = cut(x0, x1, 0), ys = cut(y0, y1, 1), out = [];
  let open = []; // önceki satırdan süren karolar: [xa, xb, ya]
  for (let j = 0; j < ys.length - 1; j++) {
    const ym = (ys[j] + ys[j + 1]) / 2, runs = [];
    let st = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      const hit = sp.some((r) => xm > r[0] && xm < r[2] && ym > r[1] && ym < r[3]);
      if (!hit && st == null) st = xs[i];
      if (st != null && (hit || i === xs.length - 2)) { runs.push([st, hit ? xs[i] : xs[i + 1]]); st = null; }
    }
    const next = [];
    for (const [xa, xb] of runs) {
      const k = open.findIndex((o) => o[0] === xa && o[1] === xb);
      if (k >= 0) next.push(open.splice(k, 1)[0]); else next.push([xa, xb, ys[j]]);
    }
    for (const o of open) out.push([o[0], o[2], o[1], ys[j]]);
    open = next;
  }
  for (const o of open) out.push([o[0], o[2], o[1], ys[ys.length - 1]]);
  return out;
}
