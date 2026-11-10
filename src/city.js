// Şehir: sıra evler. Cephe resimlerindeki cumba, tente, balkon, kapı ve vitrinler gerçek geometriye
// çevrilir ve aynı dokuya eşlenir; resimle kabartma üst üste oturur. Her ev ayrı bir hacimdir
// (farklı yükseklik, farklı geri çekilme), ama hepsi malzeme başına tek ağda toplanır.
import * as THREE from 'three';
import { A, canvasTex } from './assets.js';
import { Soup, makePanel } from './geo.js';
import { FACADE_A, FACADE_B } from './facades.js';
import { railKey, RAIL_ATLAS } from './railkey.js';

const DEPTH = 9;        // sıra derinliği (m)
const SIDEWALK = 1.3;   // sokak evlerinin önündeki taş kaldırım
const BAY = 0.85, BALCONY = 0.9;
const LIFT = 0.003;     // yeniden eşlenen duvar parçaları komşularının bu kadar önünde (bindirmede titreşim olmasın)
const DEF = {
  a: { hw: 6, data: FACADE_A, pitch: 0.55, eave: 0.5, fascia: 0.16, roofs: [0xb9553f, 0xa74c38, 0xc4674a, 0x9c4b3c] },
  b: { hw: 7.5, data: FACADE_B, pitch: 0.3, eave: 0.42, fascia: 0, roofs: [0x8a6f63, 0x7c6a66, 0x6d6f7a, 0x94705a] },
};
// komşu evler hiç aynı çıkmasın diye döngüsel diziler
const SETBACK = [0, 0.3, 0.55, 0.15, 0.45], BACKSET = [0.5, 0, 0.3, 0.15, 0.4], HEIGHT = [1, 0.955, 1.03, 0.975, 1.05];
const WHITE = [0.5, 0.875]; // kiremit dokusunun düz beyaz bölgesi
const DISH = new THREE.Vector3(0.28, 0.52, 0.8).normalize(); // çanaklar hep aynı uyduya bakar

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// lots: [{ x, z, yaw, side, kind: 'a' | 'b', nh, k0, H, street }] — yerleşimi world.js yapar.
// groundAt(x, z): çizilen arazi ağının yüksekliği. quality 0: telefon.
export function buildCity(scene, lots, quality, groundAt) {
  const fine = quality > 0;
  const S = { a: new Soup(), b: new Soup() }, roof = new Soup(), rail = new Soup();
  const r = rng(4242);
  const cStone = lin(0xd8d0c0), cWood = lin(0x4a3628), cGutter = lin(0x3b3632), cDish = lin(0xdcdcd6), cPot = lin(0xb5593c);
  for (const lot of lots) row(lot);

  const add = (name, soup, mat) => { if (!soup.n) return; const m = new THREE.Mesh(soup.geometry(), mat); m.name = name; scene.add(m); };
  const ta = A.tex.facade_a, tb = A.tex.facade_b, rt = railTex();
  add('sehir-a', S.a, new THREE.MeshLambertMaterial({ map: ta || null, color: ta ? 0xffffff : 0xe8a27c, vertexColors: true }));
  add('sehir-b', S.b, new THREE.MeshLambertMaterial({ map: tb || null, color: tb ? 0xffffff : 0xb9c7b0, vertexColors: true }));
  add('sehir-cati', roof, new THREE.MeshLambertMaterial({ map: roofTex(), vertexColors: true }));
  if (rt) add('sehir-korkuluk', rail, new THREE.MeshLambertMaterial({ map: rt, alphaTest: 0.42, side: THREE.DoubleSide }));
  return { lots, tris: S.a.tris + S.b.tris + roof.tris + (rt ? rail.tris : 0) };

  // =====================================================================
  function row(lot) {
    const { yaw, side, kind, nh, k0, street } = lot;
    const def = DEF[kind], w = def.hw, L = nh * w, f = side < 0 ? 1 : -1, tan = def.pitch;
    // sıranın yerel eksenleri: X cepheye bakana göre sağ, Z dışarı (ön yüzün baktığı yön)
    const X = [Math.sin(yaw) * f, Math.cos(yaw) * f], Z = [-X[1], X[0]], nX = [-X[0], -X[1]], nZ = [-Z[0], -Z[1]];
    const ox = lot.x + (Z[0] * DEPTH - X[0] * L) / 2, oz = lot.z + (Z[1] * DEPTH - X[1] * L) / 2; // ön-sol köşe
    const at = (x, z) => [ox + X[0] * x + Z[0] * z, oz + X[1] * x + Z[1] * z];
    const V = (x, y, z) => [ox + X[0] * x + Z[0] * z, y, oz + X[1] * x + Z[1] * z];
    const q0 = Math.floor(r() * 5), ph = r() * 2.4;
    // ayrıntı düzeyi: sokak evleri tam, arka sokaklar ucuz; arka yüzler daha da ucuz
    const lodF = street ? (fine ? 3 : 2) : fine ? 2 : 1, lodB = fine ? 1 : 0, sw = street ? SIDEWALK : 0.5;

    for (let j = 0; j < nh; j++) {
      const k = k0 + j, h = def.data[k], g = h.ground, q = (q0 + j) % 5;
      const sb = SETBACK[q], H = lot.H * HEIGHT[q];
      const x0 = j * w, x1 = x0 + w, zf = -sb, zb = -DEPTH + BACKSET[q], sx = w / 512, sy = H / g;

      // ---- zemin: kaldırım çizgisi, cephe ve kaldırım altındaki arazinin en yükseğine oturur ----
      // (arazi üçgenleri kaldırımı delmesin diye sık örneklenir; arka taraf yalnız kaide derinliği için)
      let yb = -1e9, lo = 1e9;
      const ns = Math.ceil(w / 0.3);
      for (let i = 0; i <= ns; i++) {
        const x = x0 + (w * i) / ns;
        for (let m = 0; m <= 6; m++) {
          const z = m < 5 ? zf - 0.4 + ((sw - zf + 0.4) * m) / 4 : m < 6 ? (zf + zb) / 2 : zb; // 0,4: gömme vitrinlerin içi
          if (m > 4 && i % 4) continue;
          const p = at(x, z), y = groundAt(p[0], p[1]);
          if (m < 5) yb = Math.max(yb, y);
          lo = Math.min(lo, y);
        }
      }
      yb += 0.05;
      const gB = g + (yb - lo + 0.6) / sy; // temel altının "piksel" satırı

      const panel = (x, z, PX, PZ) => {
        const o = at(x, z), u0 = k * 512;
        const P = makePanel(S[kind],
          (p) => [o[0] + PX[0] * p[0] * sx + PZ[0] * p[2], yb + (g - p[1]) * sy, o[1] + PX[1] * p[0] * sx + PZ[1] * p[2]],
          (p) => [(u0 + Math.min(511.4, Math.max(0.6, p.length > 3 ? p[3] : p[0]))) / 2048, 1 - Math.min(1023.4, Math.max(0.6, p.length > 4 ? p[4] : p[1])) / 1024]);
        P.sx = sx;
        return P;
      };
      const front = panel(x0, zf, X, Z), back = panel(x1, zb, nX, nZ), left = panel(x0, zb, Z, nX), right = panel(x1, zf, nZ, X);
      const dpx = (zf - zb) / sx; // yan duvarın "piksel" genişliği
      const pave = [24, g + 5, 488, 1021], plain = h.plain, eL = j === 0, eR = j === nh - 1;

      // ---- cepheler ----
      if (kind === 'a') { facadeA(front, h, lodF); facadeA(back, h, lodB); } else { facadeB(front, h, lodF, k, eL, eR); facadeB(back, h, lodB, k, eR, eL); }
      // ---- yan duvarlar, kalkan üçgenleri, temel ----
      const rh = (tan * (zf - zb)) / 2;
      for (const [P, end] of [[left, eL], [right, eR]]) {
        sideWall(P, h, kind, dpx, end && street && fine);
        P.tri([0, 0, 0, plain[0], plain[3]], [dpx, 0, 0, plain[2], plain[3]], [dpx / 2, -rh / sy, 0, (plain[0] + plain[2]) / 2, plain[1]], 1);
        P.cell(0, g, dpx, gB, 0, 0.9, pave);
      }
      back.cell(0, g, 512, gB, 0, 0.9, pave);
      // ---- kaldırım: resmin alt şeridindeki taş döşeme gerçek bir basamak olur ----
      const zs = sb + sw;
      front.quad([0, g, zs, 0, 1021], [512, g, zs, 512, 1021], [512, g, 0, 512, g + 2], [0, g, 0, 0, g + 2], 1);
      front.quad([0, gB, zs, 0, 1022], [512, gB, zs, 512, 1022], [512, g, zs, 512, 1006], [0, g, zs, 0, 1006], 0.92);
      front.quad([0, gB, 0, 30, 1022], [0, gB, zs, 6, 1022], [0, g, zs, 6, 1006], [0, g, 0, 30, 1006], 0.85);
      front.quad([512, gB, zs, 506, 1022], [512, gB, 0, 482, 1022], [512, g, 0, 482, 1006], [512, g, zs, 506, 1006], 0.85);

      // ---- çatı: sokağa paralel mahya, önde saçak ----
      const yT = yb + H, zr = (zf + zb) / 2, yR = yT + rh, ov = def.eave, yE = yT - ov * tan;
      const tint = lin(def.roofs[Math.floor(r() * def.roofs.length)], 0.92 + r() * 0.16);
      const u0 = (x0 + ph) / 2.4, u1 = (x1 + ph) / 2.4;
      roof.quad(V(x0, yE, zf + ov), V(x1, yE, zf + ov), V(x1, yR, zr), V(x0, yR, zr), [u0, 0.012], [u1, 0.012], [u1, 0.738], [u0, 0.738], tint);
      roof.quad(V(x1, yT, zb), V(x0, yT, zb), V(x0, yR, zr), V(x1, yR, zr), [u1, 0.012], [u0, 0.012], [u0, 0.738], [u1, 0.738], tint);
      if (def.fascia) { // saçak alnı ve altı
        const yF = yE - def.fascia;
        roof.quad(V(x0, yF, zf + ov), V(x1, yF, zf + ov), V(x1, yE, zf + ov), V(x0, yE, zf + ov), WHITE, WHITE, WHITE, WHITE, cGutter);
        roof.quad(V(x0, yF, zf), V(x1, yF, zf), V(x1, yF, zf + ov), V(x0, yF, zf + ov), WHITE, WHITE, WHITE, WHITE, cWood);
      }
      // ---- baca, çatı penceresi, çanak ----
      const roofY = (z) => yT + tan * (z > zr ? zf - z : z - zb);
      const t1 = r(), t2 = r(), t3 = r(), t4 = r(), t5 = r(), t6 = r(), t7 = r();
      if (t1 < (street ? 0.85 : 0.6)) {
        const cx = x0 + 0.75 + t2 * (w - 1.5), cz = zr + (t3 - 0.5) * 2.6, cw = kind === 'b' ? 0.55 : 0.36, top = yR + 0.55 + t4 * 0.5;
        rbox(cx - cw, cx + cw, cz - 0.34, cz + 0.34, roofY(cz) - 0.5, top, lin(kind === 'b' ? 0xb9a892 : 0xa9574a, 0.9 + t3 * 0.2));
        if (street && fine) {
          rbox(cx - cw - 0.09, cx + cw + 0.09, cz - 0.43, cz + 0.43, top, top + 0.13, cStone);
          for (const px of kind === 'b' ? [-0.26, 0.26] : [0]) rbox(cx + px - 0.13, cx + px + 0.13, cz - 0.13, cz + 0.13, top + 0.13, top + 0.48, cPot, 0);
        }
      }
      if (kind === 'a' && street && fine && t5 < 0.34) dormer(front, h, x0, w * (t6 < 0.5 ? 0.3 : 0.7), yT, zf, sx, sy, tint);
      if (t7 < (street ? 0.3 : 0.12) && (fine || street)) dish(x0 + 0.8 + t6 * (w - 1.6), zr - 0.7 - t5 * 1.2, roofY);
    }

    // sıra uzayında kutu (çatı çorbasına, düz renk)
    function rbox(xa, xb, za, zc, ya, yc, c, top = 1) {
      const q = (a, b, e, d, k = 1) => roof.quad(a, b, e, d, WHITE, WHITE, WHITE, WHITE, k === 1 ? c : dim(c, k));
      q(V(xa, ya, zc), V(xb, ya, zc), V(xb, yc, zc), V(xa, yc, zc));
      q(V(xb, ya, za), V(xa, ya, za), V(xa, yc, za), V(xb, yc, za));
      q(V(xa, ya, za), V(xa, ya, zc), V(xa, yc, zc), V(xa, yc, za));
      q(V(xb, ya, zc), V(xb, ya, za), V(xb, yc, za), V(xb, yc, zc));
      if (top) q(V(xa, yc, zc), V(xb, yc, zc), V(xb, yc, za), V(xa, yc, za));
    }
    // ön eğimde kutu biçimli çatı penceresi: yüzü cephe resminden bir pencere, yanakları düz sıva
    function dormer(P, h, x0, xl, yT, zf, sx, sy, tint) {
      const hw2 = 0.5, zd = -1.0, y0 = yT + tan * 1.0 - 0.06, y1 = y0 + 1.2, yk = y1 + 0.32, zk = -(yk - yT) / tan;
      const pa = (xl - hw2) / sx, pb = (xl + hw2) / sx, py = (y) => -(y - yT) / sy, pl = h.plain;
      P.cell(pa, py(y1), pb, py(y0), zd, 1, h.dormer);
      P.tri([pa, py(y0), zd, pl[0], pl[3]], [pa, py(y1), zd, pl[0], pl[1]], [pa, py(yk), zk, pl[2], pl[1]], 0.9);
      P.tri([pb, py(y0), zd, pl[0], pl[3]], [pb, py(yk), zk, pl[2], pl[1]], [pb, py(y1), zd, pl[0], pl[1]], 0.9);
      const xa = x0 + xl - hw2 - 0.1, xb = x0 + xl + hw2 + 0.1, zo = zf + zd + 0.14, zq = zf + zk;
      roof.quad(V(xa, y1, zo), V(xb, y1, zo), V(xb, yk, zq), V(xa, yk, zq), [0, 0.5], [0.5, 0.5], [0.5, 0.738], [0, 0.738], tint);
      roof.quad(V(xa, y1 - 0.1, zo), V(xb, y1 - 0.1, zo), V(xb, y1, zo), V(xa, y1, zo), WHITE, WHITE, WHITE, WHITE, cGutter);
    }
    // çanak anten: direk + eğik çokgen
    function dish(x, z, roofY) {
      const y0 = roofY(z) - 0.1, y1 = y0 + 1.0;
      rbox(x - 0.04, x + 0.04, z - 0.04, z + 0.04, y0, y1, cGutter, 0);
      const c = V(x, y1 + 0.15, z), n = DISH, ux = new THREE.Vector3(0, 1, 0).cross(n).normalize(), uy = n.clone().cross(ux);
      const R = 0.5, N = 7, rim = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, cs = Math.cos(a) * R, sn = Math.sin(a) * R;
        rim.push([c[0] + ux.x * cs + uy.x * sn + n.x * 0.12, c[1] + ux.y * cs + uy.y * sn + n.y * 0.12, c[2] + ux.z * cs + uy.z * sn + n.z * 0.12]);
      }
      for (let i = 0; i < N; i++) {
        const p = rim[i], q = rim[(i + 1) % N];
        roof.tri(c, p, q, WHITE, WHITE, WHITE, cDish);
        roof.tri(c, q, p, WHITE, WHITE, WHITE, dim(cDish, 0.6));
      }
    }
  }

  // =====================================================================
  // facade_a — lod 0: düz resim · 1: cumba + tente · 2: tentenin arkası ve altı da · 3: gömme kapı/vitrin, saksılar, basamaklar
  function facadeA(P, h, lod) {
    const g = h.ground, { x: [ax0, ax1], y: [aT, aB, aS] } = h.awn;
    if (lod < 1) { P.cell(0, 0, 512, g); return; }
    if (lod > 1) {
      const holes = lod > 2 ? h.holes : [];
      // tentenin arkasındaki duvar: boyalı tente yerine gölgede düz sıva
      const behind = [ax0, aT, ax1, holes.reduce((m, q) => (Math.abs(q[1] - aS) < 6 ? Math.max(m, q[1]) : m), aS)];
      P.wall(0, 0, 512, g, [...holes, behind]);
      P.cell(...behind, LIFT, 0.45, h.plain);
      for (const q of holes) P.hole(q[0], q[1], q[2], q[3], 0.32);
      if (lod > 2) {
        for (const q of h.boxes) P.box(q[0], q[1], q[2], q[3], 0, 0.26, { sw: 6 });
        // kapı önü: iki basamak (üstteki daha dar ve kısa)
        const [s0, t0, s1, t1] = h.steps, tm = Math.round((t0 + t1) / 2), su = (s0 + s1) / 2;
        P.box(s0, tm, s1, t1, 0, 0.52, { bottom: 0, su, sw: 10 });
        P.box(s0 + 12, t0, s1 - 12, tm, 0, 0.27, { bottom: 0, su, sw: 10 });
      }
    } else P.cell(0, 0, 512, g);
    for (const b of h.bays) P.bay(b, BAY, 0.22);
    P.awning(ax0, ax1, ax0, ax1, aT, aB, aS, 1.3, lod > 1);
  }

  // facade_b — lod 0: düz resim · 1: korniş + balkon döşemeleri + tente · 2: gerçek korkuluk · 3: pilastr, konsol, gömme dükkân
  // eL / eR: sıranın ucunda mı (korniş köşeyi döner)
  function facadeB(P, h, lod, k, eL, eR) {
    const g = h.ground, aw = h.awn;
    if (lod < 1) { P.cell(0, 0, 512, g); return; }
    if (lod > 1) {
      const holes = lod > 2 ? h.holes : [], sp = [...holes];
      // korkuluğun arkası: boyalı korkuluk yerine üstündeki pencere aynalanarak aşağı sürer
      for (const b of h.balc) sp.push([b.slab[0], b.y[0], b.slab[1], b.y[1]]);
      const behind = [aw.bot[0], aw.y[0], aw.bot[1], holes.reduce((m, q) => (Math.abs(q[1] - aw.y[2]) < 6 ? Math.max(m, q[1]) : m), aw.y[2])];
      sp.push(behind);
      P.wall(0, 0, 512, g, sp);
      for (const b of h.balc) P.cell(b.slab[0], b.y[0], b.slab[1], b.y[1], LIFT, 1, [b.slab[0], b.y[0] - 2, b.slab[1], 2 * b.y[0] - b.y[1] - 2]);
      P.cell(...behind, LIFT, 0.42, h.plain);
      for (const q of holes) P.hole(q[0], q[1], q[2], q[3], 0.35, g + 14); // eşik kaldırım taşından
      if (lod > 2) for (const [p0, p1] of h.pil) P.box(p0, h.cornice, p1, aw.y[0], 0, 0.14, { top: 0 });
    } else P.cell(0, 0, 512, g);
    const ext = 0.3 / P.sx;
    P.box(eL ? -ext : 0, 0, eR ? 512 + ext : 512, h.cornice, 0, 0.35, { top: 0, sw: 3 });
    h.balc.forEach((b, bi) => {
      P.box(b.slab[0], b.y[1], b.slab[1], b.y[2], 0, BALCONY, { sw: 3, under: 0.5 });
      if (lod < 2) return;
      // taş konsollar: döşemenin altında üçgen kesitli destek (boyalı konsolun tam önünde)
      if (lod > 2) for (const [x0, x1] of h.br) {
        const yt = b.y[2], yk = Math.min(yt + 21, aw.y[0] - 1);
        P.quad([x0, yk, 0], [x1, yk, 0], [x1, yt, 0.6], [x0, yt, 0.6], 0.82);
        P.tri([x0, yt, 0, x0 + 3, yt], [x0, yk, 0, x0 + 3, yk], [x0, yt, 0.6, x0, yt], 0.7);
        P.tri([x1, yt, 0, x1 - 3, yt], [x1, yt, 0.6, x1, yt], [x1, yk, 0, x1 - 3, yk], 0.7);
      }
      // ferforje korkuluk: döşemenin ön kenarında dik durur, uçlarda duvara döner
      const R = makePanel(rail, P.pos, (p) => [p[3] / RAIL_ATLAS.w, p[4] / RAIL_ATLAS.h]);
      const row = (py) => bi * RAIL_ATLAS.band + py - (b.y[1] - RAIL_ATLAS.lead), z = BALCONY - 0.07, u0 = k * 512;
      const [yR, yS] = b.y, m0 = RAIL_ATLAS.misc + 1, m1 = RAIL_ATLAS.h - 1, dp = 58;
      for (const [r0, r1] of b.rails) {
        R.quad([r0, yS, z, u0 + r0, row(yS)], [r1, yS, z, u0 + r1, row(yS)], [r1, yR, z, u0 + r1, row(yR)], [r0, yR, z, u0 + r0, row(yR)], 1);
        R.quad([r0, yS, 0, 2, m1], [r0, yS, z, 2 + dp, m1], [r0, yR, z, 2 + dp, m0], [r0, yR, 0, 2, m0], 1);
        R.quad([r1, yS, z, 2 + dp, m1], [r1, yS, 0, 2, m1], [r1, yR, 0, 2, m0], [r1, yR, z, 2 + dp, m0], 1);
      }
    });
    P.awning(aw.bot[0], aw.bot[1], aw.top[0], aw.top[1], aw.y[0], aw.y[1], aw.y[2], 1.45, lod > 1);
  }

  // yan duvar: düz sıva; sokak sıralarının uç duvarlarında cepheden alınmış pencereler
  function sideWall(P, h, kind, dpx, windows) {
    const g = h.ground, pl = h.plain;
    // bir kat: [y0, y1] satırlarında iki pencere, doku d dikdörtgeninden; arası düz sıva
    const band = (y0, y1, d) => {
      const ww = d[2] - d[0], c0 = Math.round(dpx * 0.27 - ww / 2), c1 = Math.round(dpx * 0.73 - ww / 2);
      P.tile(0, y0, c0, y1, pl); P.tile(c0, y0, c0 + ww, y1, d);
      P.tile(c0 + ww, y0, c1, y1, pl); P.tile(c1, y0, c1 + ww, y1, d);
      P.tile(c1 + ww, y0, dpx, y1, pl);
      return [c0, c1];
    };
    let y = 0;
    if (windows && kind === 'a') {
      for (const win of h.sideWin) { P.tile(0, y, dpx, win[1], pl); band(win[1], win[3], win); y = win[3]; }
    } else if (windows) {
      // korkuluk duvarla bir (Fransız balkonu); altında döşemeden alınmış ince bir taş çıkma
      const [w0, w1] = h.sideWin;
      for (const b of h.balc) {
        const yw = b.y[1] - 190;
        P.tile(0, y, dpx, yw, pl);
        for (const c of band(yw, b.y[1], [w0, yw, w1, b.y[1]])) P.box(c, b.y[1], c + w1 - w0, b.y[2], 0, 0.22, { ux: [w0, w1], sw: 3, under: 0.55 });
        y = b.y[1];
      }
    }
    P.tile(0, y, dpx, g, pl);
    // korniş yan duvarda da sürer
    if (kind === 'b') P.box(0, 0, dpx, h.cornice, 0, 0.3, { top: 0, left: 0, right: 0, ux: [70, 440], sw: 3 });
  }
}

// ---------- dokular ----------
// kiremit: alt üç çeyrek 12 sıra oluklu kiremit (u yönünde döşenir), üst çeyrek düz beyaz
function roofTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    const r = rng(5), tw = 32, th = 16, y0 = 64;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 8; i++) {
      const v = Math.floor(196 + r() * 59);
      x.fillStyle = `rgb(${v},${v - 6},${v - 12})`; x.fillRect(i * tw, y0 + j * th, tw, th);
      const g = x.createLinearGradient(i * tw, 0, (i + 1) * tw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.32, 'rgba(0,0,0,0)'); g.addColorStop(0.68, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
      x.fillStyle = g; x.fillRect(i * tw, y0 + j * th, tw, th);
      x.fillStyle = 'rgba(0,0,0,0.32)'; x.fillRect(i * tw, y0 + (j + 1) * th - 3, tw, 3);
    }
  });
}

// korkuluk atlası: facade_b resminden alfa kanallı veri dokusu
function railTex() {
  const img = A.tex.facade_b && A.tex.facade_b.image;
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 2048, 1024);
  const out = new Uint8Array(RAIL_ATLAS.w * RAIL_ATLAS.h * 4);
  railKey(x.getImageData(0, 0, 2048, 1024).data, 2048, out, RAIL_ATLAS.w, FACADE_B);
  const t = new THREE.DataTexture(out, RAIL_ATLAS.w, RAIL_ATLAS.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
