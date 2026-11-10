// Kapalıçarşı içi: dükkânlar duvar düzleminden içeri nişlere gömülür, taş ayaklar ve kemerler yerinde
// kalır; tonozu enine sivri kemerler böler. Derinlik hep dışarı doğrudur: |yanal| < hw + 0,3 ve yolun
// 4,5 m üstüne kadarki sürüş koridoruna hiçbir şey girmez (kemerlerin en alçak noktası duvar dibinde 4,75 m).
import * as THREE from 'three';
import { Soup, makePanel } from './geo.js';
import { BAZAAR_BAYS, ARCH_PROFILE, BAZAAR_PIER } from './facades.js';

const WALL_H = 7.2;
const NICHE = 1.2, COUNTER = 0.3;
const OUT = 0.05;  // duvar düzlemi hw + 0,3'ün bu kadar dışında: kirişler virajda bile koridora taşmasın
const TOP = -40, BOT = 520; // ön yüz tonozun arkasında yükselir, zeminin altına iner (px): birleşimlerde aralık kalmasın
const GATE = 1.5;  // kapı ayağının pist boyunca yarı kalınlığı
// döşeme sınırları: ayak ortaları (doku pikseli); son dükkânın sağ ayağı sarmalıdır
const TILE = [1, 332.5, 689, 1024.5, 1372, 1716.5, 2049];
// tonoz kesiti: world.js'teki beş parçalı kemerle aynı
export const vaultY = (a) => (a <= 0.25 ? 10.5 : a <= 0.66 ? 10.5 - ((a - 0.25) / 0.41) * 1.1 : 9.4 - ((a - 0.66) / 0.34) * 2.2);

// Dönen: { geo, ribs: [pist boyunca mesafe], bay: dükkân aralığı (m) }
export function bazaarInterior(T, i0, i1, quality) {
  const S = new Soup();
  // iki uçta 1,5 m'yi kapı ayakları örter; dükkânlar onların bittiği yerde başlar
  const d0 = i0 * T.sp + GATE, len = ((i1 - i0 + T.N) % T.N) * T.sp - 2 * GATE;
  const nb = Math.round(len / 4.9), bl = len / nb;
  const v = new THREE.Vector3();
  const hwAt = (f) => { const i = T.wrap(Math.floor(f)), k = f - Math.floor(f); return T.hw[i] + (T.hw[T.wrap(i + 1)] - T.hw[i]) * k; };
  const prof = quality > 0 ? ARCH_PROFILE : ARCH_PROFILE.filter((_, i) => i % 2 === 0);

  for (const s of [-1, 1]) for (let j = 0; j < nb; j++) {
    const t = (s < 0 ? j : j * 5 + 3) % 6, p0 = TILE[t], p1 = TILE[t + 1];
    // px → pist boyunca mesafe: içeriden bakınca px hep sağa artar (sol duvarda sürüş yönü, sağ duvarda tersi)
    const dOf = (px) => { const u = (px - p0) / (p1 - p0); return d0 + (s < 0 ? j + u : j + 1 - u) * bl; };
    const P = makePanel(S, (p) => {
      const f = dOf(p[0]) / T.sp;
      T.pointAt(f, s * (hwAt(f) + 0.3 + OUT - p[2]), v, (1 - p[1] / 512) * WALL_H);
      return [v.x, v.y, v.z];
    }, (p) => [(p.length > 3 ? p[3] : p[0]) / 2048, 1 - Math.min(511.5, Math.max(0.5, p.length > 4 ? p[4] : p[1])) / 512]);
    niche(P, BAZAAR_BAYS[t], p0, p1);
  }
  const ribs = [];
  for (let j = 1; j < nb; j += 2) { ribs.push(d0 + j * bl); rib(d0 + j * bl); }
  return { geo: S.geometry(), ribs, bay: bl, tris: S.tris };

  // tek dükkân: ön yüz (ayaklar + kemer üstü), kemerli niş, katlanmış dükkân resmi
  function niche(P, bay, p0, p1) {
    const [xl, xa, xr] = bay.x, { spring, apex, fold } = bay;
    const C = []; // kemer iç eğrisi: sol üzengi → tepe → sağ üzengi
    for (const [tt, q] of prof) C.push([xl + (xa - xl) * tt, spring - (spring - apex) * q]);
    for (let i = prof.length - 2; i >= 0; i--) C.push([xr - (xr - xa) * prof[i][0], spring - (spring - apex) * prof[i][1]]);
    P.cell(p0, TOP, xl, BOT); P.cell(xr, TOP, p1, BOT);
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      P.quad([a[0], a[1], 0], [b[0], b[1], 0], [b[0], TOP, 0], [a[0], TOP, 0], 1);
      // kemer içi: iki renkli kemer taşları derinliğe uzar (doku eğrinin hemen dışından)
      const nx = b[1] - a[1], ny = a[0] - b[0], nl = Math.hypot(nx, ny) || 1, ox = nx / nl, oy = ny / nl;
      P.quad([a[0], a[1], -NICHE, a[0] + ox * 13, a[1] + oy * 13], [b[0], b[1], -NICHE, b[0] + ox * 13, b[1] + oy * 13],
        [b[0], b[1], 0, b[0] + ox * 4, b[1] + oy * 4], [a[0], a[1], 0, a[0] + ox * 4, a[1] + oy * 4], 0.62);
      P.quad([a[0], spring, -NICHE], [b[0], spring, -NICHE], [b[0], b[1], -NICHE], [a[0], a[1], -NICHE], 0.88); // dip duvarın kemerli üstü
    }
    // dükkân resmi üç yüze katlanır: dip duvar, öne eğimli tabla, tezgâh önü — önden bakınca resim aynı kalır
    P.cell(xl, spring, xr, fold[1], -NICHE, 0.88);
    P.quad([xl, fold[0], -COUNTER], [xr, fold[0], -COUNTER], [xr, fold[1], -NICHE], [xl, fold[1], -NICHE], 1);
    P.cell(xl, fold[0], xr, BOT, -COUNTER, 1);
    for (let i = 0; i < 4; i++) { // eşik: duvar düzleminde olduğu için virajı izlesin diye dört parça
      const xa = xl + ((xr - xl) * i) / 4, xb = xl + ((xr - xl) * (i + 1)) / 4;
      P.quad([xa, 509, 0, xa, 503], [xb, 509, 0, xb, 503], [xb, 509, -COUNTER, xb, 511], [xa, 509, -COUNTER, xa, 511], 0.8);
    }
    // yanaklar: ayak taşı (başlığıyla) köşeyi dönüp derinliğe uzar
    const [j0, j1] = [BAZAAR_PIER[0] + 3, BAZAAR_PIER[1] - 3];
    P.quad([xl, BOT, 0, j1, BOT], [xl, BOT, -NICHE, j0, BOT], [xl, spring, -NICHE, j0, spring], [xl, spring, 0, j1, spring], 0.7);
    P.quad([xr, BOT, -NICHE, j1, BOT], [xr, BOT, 0, j0, BOT], [xr, spring, 0, j0, spring], [xr, spring, -NICHE, j1, spring], 0.7);
  }

  // enine sivri kemer: duvardaki konsoldan (4,75 m) üzengiye (5,5 m), oradan tepeye (10 m); üstü tonoza kadar dolu
  function rib(d) {
    const L = hwAt(d / T.sp) + 0.3 + OUT, span = L - 0.35, hw = 0.36, y0 = 5.5, y1 = 10.0;
    const pt = (lat, y, dd) => { T.pointAt((d + dd) / T.sp, lat, v, y); return [v.x, v.y, v.z]; };
    const pts = [[-L, 4.75]];
    for (const [tt, q] of prof) pts.push([-span + span * tt, y0 + (y1 - y0) * q]);
    for (let i = prof.length - 2; i >= 0; i--) pts.push([span - span * prof[i][0], y0 + (y1 - y0) * prof[i][1]]);
    pts.push([L, 4.75]);
    const [u0, u1] = [BAZAAR_PIER[0] + 6, BAZAAR_PIER[1] - 6];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], sh = i % 2 ? 0.96 : 0.76; // iki renkli kemer taşları
      const ta = vaultY(Math.abs(a[0]) / L) + 0.06, tb = vaultY(Math.abs(b[0]) / L) + 0.06;
      const r0 = 190 + (i % 5) * 50, r1 = r0 + 46;
      const A = [u0 / 2048, 1 - r1 / 512], B = [u1 / 2048, 1 - r1 / 512], C2 = [u1 / 2048, 1 - r0 / 512], D = [u0 / 2048, 1 - r0 / 512];
      S.quad(pt(a[0], a[1], -hw), pt(a[0], a[1], hw), pt(b[0], b[1], hw), pt(b[0], b[1], -hw), A, B, C2, D, sh * 0.72); // alt yüz
      S.quad(pt(a[0], a[1], -hw), pt(b[0], b[1], -hw), pt(b[0], tb, -hw), pt(a[0], ta, -hw), A, B, C2, D, sh);        // gelene bakan yanak
      S.quad(pt(b[0], b[1], hw), pt(a[0], a[1], hw), pt(a[0], ta, hw), pt(b[0], tb, hw), A, B, C2, D, sh * 0.9);      // arka yanak
    }
  }
}
