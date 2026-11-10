// Pist: kapalı bir Catmull-Rom eğrisi. Eşit aralıklı örneklere bölünür; kartlar konumlarını
// bu örnekler üzerinden (ilerleme + yanal sapma) takip eder.
import * as THREE from 'three';

// [x, y, z] — sürüş yönünde. -Z kuzey, +X doğu (Anadolu), -X batı (Avrupa).
const CP = [
  [-85, 1, 110],   // 0  Eminönü sahili — start çizgisi
  [-85, 1, 50],    // 1
  [-88, 1, 0],     // 2
  [-102, 1, -38],  // 3
  [-142, 1, -60],  // 4  Kapalıçarşı girişi
  [-190, 1, -52],  // 5
  [-238, 1, -64],  // 6  Kapalıçarşı çıkışı
  [-278, 3, -90],  // 7  Galata yokuşu
  [-294, 6, -138], // 8
  [-276, 8, -186], // 9
  [-232, 9, -206], // 10
  [-190, 10, -190],// 11
  [-150, 13, -202],// 12
  [-100, 17, -216],// 13 Boğaz Köprüsü batı ayağı
  [0, 20, -221],   // 14
  [100, 17, -216], // 15 doğu ayağı
  [150, 12, -200], // 16
  [182, 7, -158],  // 17
  [172, 3, -104],  // 18
  [126, 1, -60],   // 19 Anadolu sahili
  [90, 1, -14],    // 20
  [106, 1, 38],    // 21
  [86, 1, 90],     // 22
  [99, 1, 134],    // 23
  [60, 2.2, 170],  // 24 Galata Köprüsü doğu ucu
  [0, 4.2, 177],   // 25
  [-60, 2.2, 170], // 26 batı ucu
  [-86, 1, 148],   // 27
];

// Kontrol noktası aralıklarına göre bölümler: [başlangıç CP, bitiş CP, tür, yarı genişlik]
const SECTIONS = [
  [27, 3, 'sahil', 9],
  [3, 4, 'asfalt', 9],
  [4, 6, 'carsi', 8.5],
  [6, 12, 'galata', 9],
  [12, 13, 'asfalt', 9],
  [13, 15, 'bogaz', 8.5],
  [15, 19, 'asfalt', 9.5],
  [19, 24, 'anadolu', 9],
  [24, 26, 'halic', 8],
  [26, 27, 'asfalt', 9],
];

export const SPACING = 2;

export function buildTrack() {
  const curve = new THREE.CatmullRomCurve3(CP.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const length = curve.getLength();
  const N = Math.round(length / SPACING);
  const sp = length / N;
  const raw = curve.getSpacedPoints(N);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const tx = new Float32Array(N), tz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N);
  const slope = new Float32Array(N), curv = new Float32Array(N), hw = new Float32Array(N);
  const kind = new Array(N), bridge = new Uint8Array(N);
  for (let i = 0; i < N; i++) { px[i] = raw[i].x; py[i] = raw[i].y; pz[i] = raw[i].z; }
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dz = pz[b] - pz[a];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz;
    rx[i] = -dz; rz[i] = dx; // sağ = ileri × yukarı
    slope[i] = (py[b] - py[a]) / l;
  }
  for (let i = 0; i < N; i++) {
    const a = (i + N - 3) % N, b = (i + 3) % N;
    const cross = tx[a] * tz[b] - tz[a] * tx[b]; // + ise sağa dönüş
    curv[i] = Math.asin(Math.max(-1, Math.min(1, cross))) / (6 * sp);
  }

  // kontrol noktalarına en yakın örnekler
  const cpIdx = CP.map((p) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < N; i++) {
      const d = (px[i] - p[0]) ** 2 + (pz[i] - p[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  });
  const ranges = {};
  for (const [a, b, k, w] of SECTIONS) {
    const i0 = cpIdx[a], i1 = cpIdx[b];
    const n = (i1 - i0 + N) % N;
    for (let j = 0; j < n; j++) {
      const i = (i0 + j) % N;
      kind[i] = k; hw[i] = w;
      bridge[i] = k === 'bogaz' || k === 'halic' ? 1 : 0;
    }
    (ranges[k] ||= []).push([i0, i1]);
  }
  // genişlik geçişlerini yumuşat
  const hw2 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -6; j <= 6; j++) s += hw[(i + j + N) % N];
    hw2[i] = s / 13;
  }

  const T = { N, sp, length, px, py, pz, tx, tz, rx, rz, slope, curv, hw: hw2, kind, bridge, cpIdx, ranges, CP };

  const wrap = (i) => ((i % N) + N) % N;
  T.wrap = wrap;

  // hint çevresinde en yakın örneği bul
  T.locate = (x, z, hint, back = 10, fwd = 24) => {
    let best = hint, bd = 1e12;
    for (let j = -back; j <= fwd; j++) {
      const i = wrap(hint + j);
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // tüm pistte en yakın örnek (yerleşim ve dünya üretimi için)
  T.nearest = (x, z, skipBridge = false) => {
    let best = -1, bd = 1e12;
    for (let i = 0; i < N; i += 2) {
      if (skipBridge && bridge[i]) continue;
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  };
  // örnek i'ye göre yanal sapma (+ sağ) ve ileri kesir
  T.project = (i, x, z, out) => {
    const dx = x - px[i], dz = z - pz[i];
    out.lat = dx * rx[i] + dz * rz[i];
    out.along = (dx * tx[i] + dz * tz[i]) / sp;
    return out;
  };
  T.heightAt = (i, along) => {
    const a = Math.max(-1, Math.min(1, along));
    const j = a >= 0 ? wrap(i + 1) : wrap(i - 1);
    return py[i] + (py[j] - py[i]) * Math.abs(a);
  };
  // kesirli indeks + yanal sapmadan dünya konumu
  T.pointAt = (f, lat, out, yOff = 0) => {
    const i = wrap(Math.floor(f)), j = wrap(i + 1), k = f - Math.floor(f);
    const x = px[i] + (px[j] - px[i]) * k, z = pz[i] + (pz[j] - pz[i]) * k;
    const ex = rx[i] + (rx[j] - rx[i]) * k, ez = rz[i] + (rz[j] - rz[i]) * k;
    out.set(x + ex * lat, py[i] + (py[j] - py[i]) * k + yOff, z + ez * lat);
    return out;
  };
  T.headingAt = (i) => Math.atan2(tx[i], tz[i]); // yaw: +Z ekseninden

  return T;
}

// ---------- Geometri yardımcıları ----------

// i0'dan i1'e (sarmalı) örnek listesi; dist süreklidir.
export function span(T, i0, i1) {
  const n = ((i1 - i0 + T.N) % T.N) || T.N;
  const out = [];
  for (let j = 0; j <= n; j++) out.push({ i: (i0 + j) % T.N, d: (i0 + j) * T.sp });
  return out;
}

// Yol şeridi: latL..latR arasında yatay bant. latFn(i) → [sol, sağ] verilebilir.
export function ribbon(T, list, latL, latR, yOff, uRep = 1, vScale = 16) {
  const n = list.length;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6);
  const idx = [];
  for (let k = 0; k < n; k++) {
    const { i, d } = list[k];
    const l = typeof latL === 'function' ? latL(i) : latL, r = typeof latR === 'function' ? latR(i) : latR;
    const y = T.py[i] + (typeof yOff === 'function' ? yOff(i) : yOff);
    pos.set([T.px[i] + T.rx[i] * l, y, T.pz[i] + T.rz[i] * l, T.px[i] + T.rx[i] * r, y, T.pz[i] + T.rz[i] * r], k * 6);
    uv.set([0, d / vScale, uRep, d / vScale], k * 4);
    nor.set([0, 1, 0, 0, 1, 0], k * 6);
    if (k < n - 1) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Dikey bant (duvar/korkuluk): lat konumunda, y0..y1 arası.
// face = 1: ön yüz pistin ortasına bakar, face = -1: dışarıya bakar.
export function wall(T, list, lat, y0, y1, uScale = 8, vRep = 1, face = 1) {
  const n = list.length;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6);
  const idx = [];
  const l0 = typeof lat === 'function' ? lat(list[0].i) : lat;
  const s = (l0 > 0 ? -1 : 1) * face; // normalin sağ vektöre göre işareti
  for (let k = 0; k < n; k++) {
    const { i, d } = list[k];
    const l = typeof lat === 'function' ? lat(i) : lat;
    const x = T.px[i] + T.rx[i] * l, z = T.pz[i] + T.rz[i] * l;
    const a = typeof y0 === 'function' ? y0(i) : T.py[i] + y0, b = typeof y1 === 'function' ? y1(i) : T.py[i] + y1;
    pos.set([x, a, z, x, b, z], k * 6);
    uv.set([d / uScale, 0, d / uScale, vRep], k * 4);
    nor.set([T.rx[i] * s, 0, T.rz[i] * s, T.rx[i] * s, 0, T.rz[i] * s], k * 6);
    if (k < n - 1) {
      const q = k * 2;
      if (s < 0) idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); else idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
