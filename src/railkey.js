// Balkon korkuluğu atlası: facade_b resminden alfa kanallı küçük bir doku üretir.
// Demir çubuklar, resmin düz duvar önündeki temiz korkuluk parçasından (RAIL_MODULE) anahtarlanıp
// korkuluk boyunca aynalı döşenir; saksı çiçekleri ve yapraklar asıl yerlerinden renkleriyle alınır.
// Arkadaki duvar, pencere ve perde saydam kalır — gerçek korkuluğun arkasından gerçek duvar görünür.
export const RAIL_ATLAS = { w: 2048, h: 256, band: 72, lead: 70, misc: 216 };
// temiz parça: [ev, balkon, x0, x1]
const RAIL_MODULE = [1, 0, 217, 297];
const IRON = [34, 38, 40];

// src: RGBA facade_b (sw genişlik), out: RGBA atlas (aw genişlik). houses: FACADE_B ölçüleri.
export function railKey(src, sw, out, aw, houses) {
  const { band, lead, misc, h: ah } = RAIL_ATLAS;
  // ---- temiz parçanın alfası (duvar renginden uzaklık) ----
  const [mk, mb, mx0, mx1] = RAIL_MODULE, mh = houses[mk], mbal = mh.balc[mb];
  const mw = mx1 - mx0, mrows = mbal.y[1] - mbal.y[0];
  const wall = median(src, sw, mk * 512 + mh.plain[0], mh.plain[1], mh.plain[2] - mh.plain[0], mh.plain[3] - mh.plain[1]);
  const mod = new Float32Array(mw * mrows);
  for (let y = 0; y < mrows; y++) for (let x = 0; x < mw; x++) {
    const o = ((mbal.y[0] + y) * sw + mk * 512 + mx0 + x) * 4;
    const d = Math.abs(src[o] - wall[0]) + Math.abs(src[o + 1] - wall[1]) + Math.abs(src[o + 2] - wall[2]);
    mod[y * mw + x] = Math.max(0, Math.min(1, (d - 80) / 120));
  }
  const modAt = (x, t) => { // x: korkuluk başından piksel, t: 0 üst – 1 alt
    const p = ((x % (2 * mw)) + 2 * mw) % (2 * mw), xm = p < mw ? p : 2 * mw - 1 - p;
    return mod[Math.min(mrows - 1, Math.max(0, Math.round(t * (mrows - 1)))) * mw + xm];
  };
  const put = (q, c, a) => { out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2]; out[q + 3] = a * 255; };

  houses.forEach((h, k) => {
    const wc = median(src, sw, k * 512 + h.plain[0], h.plain[1], h.plain[2] - h.plain[0], h.plain[3] - h.plain[1]);
    h.balc.forEach((b, bi) => {
      const y0 = b.y[1] - lead, x0 = k * 512, top = b.y[0] - y0, bot = b.y[1] - y0;
      // bitki maskesi: yeşil baskın ya da duvardan farklı çok doygun renk
      const plant = new Uint8Array(512 * band);
      for (let y = top; y <= bot; y++) for (let x = 0; x < 512; x++) {
        const o = ((y0 + y) * sw + x0 + x) * 4, r = src[o], g = src[o + 1], bl = src[o + 2];
        const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), sat = mx ? (mx - mn) / mx : 0, l = 0.3 * r + 0.59 * g + 0.11 * bl;
        const dW = Math.abs(r - wc[0]) + Math.abs(g - wc[1]) + Math.abs(bl - wc[2]);
        if ((g > r * 1.05 && g > bl * 1.08 && sat > 0.2 && l > 34) || (sat > 0.52 && l > 75 && dW > 150)) plant[y * 512 + x] = 1;
      }
      for (const [r0, r1] of b.rails) for (let y = top; y <= bot; y++) for (let x = r0; x <= r1; x++) {
        const q = ((bi * band + y) * aw + x0 + x) * 4;
        // çoğunluk süzgeci: tek tük benekleri at, delikleri kapat
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += plant[Math.min(band - 1, Math.max(0, y + dy)) * 512 + Math.min(511, Math.max(0, x + dx))];
        if (n >= 5) { const o = ((y0 + y) * sw + x0 + x) * 4; put(q, [src[o], src[o + 1], src[o + 2]], 1); continue; }
        // küpeşte ve alt kuşak kesintisiz; arası döşenen çubuklar
        const edge = y <= top + 2 || y >= bot - 2 || x <= r0 + 2 || x >= r1 - 2;
        put(q, IRON, edge ? 1 : modAt(x - r0, (y - top) / (bot - top)));
      }
    });
  });
  // ---- yan dönüşler için temiz çubuk şeridi (alt bant) ----
  const mhgt = ah - misc;
  for (let y = 0; y < mhgt; y++) for (let x = 0; x < 256; x++) {
    const edge = y <= 1 || y >= mhgt - 2;
    put(((misc + y) * aw + x) * 4, IRON, edge ? 1 : modAt(x, y / (mhgt - 1)));
  }
  // saydam piksellerin rengi de demir olsun (mip kenarlarında açık hale kalmasın)
  for (let i = 0; i < aw * ah; i++) if (out[i * 4 + 3] === 0) { out[i * 4] = IRON[0]; out[i * 4 + 1] = IRON[1]; out[i * 4 + 2] = IRON[2]; }
}

function median(src, sw, x, y, w, h) {
  const ch = [[], [], []];
  for (let j = 0; j < h; j += 3) for (let i = 0; i < w; i += 3) { const o = ((y + j) * sw + x + i) * 4; for (let c = 0; c < 3; c++) ch[c].push(src[o + c]); }
  return ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
}
