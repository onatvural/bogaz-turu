// Çarpışma çözücü. Gövdeler yönlü dikdörtgendir (kartın taban izi, tramvayın gövdesi).
// Ayırma ekseni testi en küçük itmeyi verir; itme kütleyle ters orantılı paylaşılır, hız çarpma
// doğrultusunda aktarılır. Duvara ya da tramvaya dayanmış kart o yöne itilemez. Adım sonunda
// hiçbir gövde bir diğerinin, duvarın ya da tramvayın içinde kalmaz.

const C = { nx: 0, nz: 0 };
const SLOP = 0.004, ITER = 10;
// Sıçrayan kart (air > 0) altındakinin boyunu aşınca üstünden geçer. Tekerlekleri öbürünün tepesinden
// en fazla bu kadar yukarıdayken ikisi yumuşakça ayrılır; böylece inerken kimsenin içine düşmez.
const LAND_ZONE = 1.6, LAND_PUSH = 0.24;
// havadaki ile alttaki arasındaki dikey boşluk (≤ 0: aynı yükseklikteler, çarpışırlar)
const vgap = (a, b) => (a.air > b.air ? a.air - b.top : b.air - a.top);
// denetim sayaçları: kaç adım sıkışma geçişine düştü, kaçı ayrılamadan bitti
export const stats = { steps: 0, squeezed: 0, failed: 0 };

// İki yönlü dikdörtgen: (merkez, ileri birim vektör, yarı boy, yarı en).
// Örtüşüyorsa derinliği döner ve out'a a'dan b'ye bakan ayırma yönünü yazar; yoksa 0.
export function sat(ax, az, afx, afz, ahl, ahw, bx, bz, bfx, bfz, bhl, bhw, out) {
  const dx = bx - ax, dz = bz - az;
  let best = 1e9, nx = 0, nz = 0;
  for (let k = 0; k < 4; k++) {
    // eksenler: a ileri, a yan, b ileri, b yan
    let ex, ez;
    if (k === 0) { ex = afx; ez = afz; } else if (k === 1) { ex = afz; ez = -afx; } else if (k === 2) { ex = bfx; ez = bfz; } else { ex = bfz; ez = -bfx; }
    const ra = ahl * Math.abs(afx * ex + afz * ez) + ahw * Math.abs(afz * ex - afx * ez);
    const rb = bhl * Math.abs(bfx * ex + bfz * ez) + bhw * Math.abs(bfz * ex - bfx * ez);
    const d = dx * ex + dz * ez;
    const o = ra + rb - Math.abs(d);
    if (o <= 0) return 0;
    if (o < best) { best = o; const s = d < 0 ? -1 : 1; nx = ex * s; nz = ez * s; }
  }
  out.nx = nx; out.nz = nz;
  return best;
}

// Hız değişimini karta uygula: hareket yönündeki bileşen hıza, kalanı kısa sürede sönen itme hızına gider.
export function shove(k, dvx, dvz) {
  const hx = Math.sin(k.velYaw), hz = Math.cos(k.velYaw);
  const along = dvx * hx + dvz * hz;
  k.speed = Math.max(-12, k.speed + along); // kafa kafaya çarpışma kartı geri fırlatmasın
  k.kx += dvx - hx * along; k.kz += dvz - hz * along;
}

// Ters kütle: ağır kart az savrulur; turbodaki kart daha "ağır" vurur; hücumdaki Kaptan yerinden oynamaz.
const invMass = (k) => (k.ramT > 0 ? 0 : (k.boostT > 0 ? 0.62 : 1) / k.mass);

// karts: Kart[], tram: { solid, x, z, fx, fz, bhl, bhw, vx, vz } | null
// onBump(a, b | null, kapanmaHızı, nx, nz): çarpma anında bir kez (b yoksa tramvay)
// Dönen değer: adım sonunda kalan en derin örtüşme (0 olmalı).
export function solve(karts, tram, onBump, T) {
  const n = karts.length;
  let residual = 0;
  stats.steps++;
  for (let it = 0; it < ITER; it++) {
    residual = 0;
    let nudged = false; // yumuşak itme yapıldıysa bir tur daha: ittiği kart başkasına girmiş olabilir
    // kart–kart
    for (let i = 0; i < n; i++) {
      const a = karts[i];
      for (let j = i + 1; j < n; j++) {
        const b = karts[j];
        let soft = false;
        if (a.air > 0 || b.air > 0) {
          const gap = vgap(a, b);
          if (gap > LAND_ZONE) continue; // üstünden geçiyor
          soft = gap > 0;
        }
        const depth = sat(a.pos.x, a.pos.z, a.fx, a.fz, a.hl, a.hw, b.pos.x, b.pos.z, b.fx, b.fz, b.hl, b.hw, C);
        if (depth <= 0) continue;
        const nx = C.nx, nz = C.nz;
        let wa = invMass(a), wb = invMass(b);
        if (wa + wb === 0) wa = wb = 1;
        if (soft) {
          // inmek üzere: adım başına sınırlı bir itmeyle önceden açılırlar
          if (it === 0) {
            const s = Math.min(depth, LAND_PUSH) / (wa + wb);
            a.pos.x -= nx * s * wa; a.pos.z -= nz * s * wa;
            b.pos.x += nx * s * wb; b.pos.z += nz * s * wb;
            nudged = true;
          }
          continue;
        }
        if (depth > residual) residual = depth;
        // duvara/tramvaya dayalı olan o yöne itilemez
        let pa = wa, pb = wb;
        if (a.pinX * nx + a.pinZ * nz < -0.3) pa = 0;
        if (b.pinX * nx + b.pinZ * nz > 0.3) pb = 0;
        if (pa + pb === 0) { pa = wa; pb = wb; }
        const s = (depth + SLOP) / (pa + pb);
        a.pos.x -= nx * s * pa; a.pos.z -= nz * s * pa;
        b.pos.x += nx * s * pb; b.pos.z += nz * s * pb;
        // dayalı karta yaslanan da artık o yöne itilemez: sıra hâlindeki kartlar tek geçişte ayrılır
        if (!pa && pb && !b.pinX && !b.pinZ) { b.pinX = -nx; b.pinZ = -nz; } else if (!pb && pa && !a.pinX && !a.pinZ) { a.pinX = nx; a.pinZ = nz; }
        // hız aktarımı: yalnız birbirine yaklaşıyorlarsa
        const vr = (Math.sin(a.velYaw) * a.speed + a.kx - Math.sin(b.velYaw) * b.speed - b.kx) * nx
          + (Math.cos(a.velYaw) * a.speed + a.kz - Math.cos(b.velYaw) * b.speed - b.kz) * nz;
        if (vr > 0) {
          const e = vr > 3 ? 0.3 : 0; // hafif temasta sekme yok: yan yana sürtünürken titremesin
          const j2 = ((1 + e) * vr) / (pa + pb);
          if (pa) shove(a, -nx * j2 * pa, -nz * j2 * pa);
          if (pb) shove(b, nx * j2 * pb, nz * j2 * pb);
          onBump(a, b, vr, nx, nz);
        }
      }
    }
    // kart–tramvay: tramvay yerinden oynamaz; üstünden atlanamayacak kadar da yüksektir
    if (tram && tram.solid) {
      for (let i = 0; i < n; i++) {
        const k = karts[i];
        const depth = sat(k.pos.x, k.pos.z, k.fx, k.fz, k.hl, k.hw, tram.x, tram.z, tram.fx, tram.fz, tram.bhl, tram.bhw, C);
        if (depth <= 0) continue;
        if (depth > residual) residual = depth;
        const nx = C.nx, nz = C.nz;
        k.pos.x -= nx * (depth + SLOP); k.pos.z -= nz * (depth + SLOP);
        k.pinX = nx; k.pinZ = nz;
        const vr = (Math.sin(k.velYaw) * k.speed + k.kx - tram.vx) * nx + (Math.cos(k.velYaw) * k.speed + k.kz - tram.vz) * nz;
        if (vr > 0) {
          shove(k, -nx * 1.25 * vr, -nz * 1.25 * vr);
          onBump(k, null, vr, nx, nz);
        }
      }
    }
    // duvarlar en son: kimse yol dışına itilmiş kalmasın
    let wall = false;
    for (let i = 0; i < n; i++) if (karts[i].walls(0, false)) wall = true;
    if (residual === 0 && !wall && !nudged) return 0;
  }
  // Buraya nadiren gelinir: yana açılacak yer kalmamıştır (ör. duvarla tramvay arasında savrulan kart).
  // Sıkışan kartlar pist boyunca dışarı çıkarılır; o yönde duvar yok, ayrılma kesindir. Gidip gelme
  // olmasın diye yön tektir: tramvayın önündekiler hep ileri, öbürleri hep geri gider.
  const solidTram = tram && tram.solid;
  stats.squeezed++;
  for (let i = 0; i < n; i++) {
    const k = karts[i];
    k.out = -1;
    if (solidTram) {
      const dx = k.pos.x - tram.x, dz = k.pos.z - tram.z;
      if (Math.abs(dx * tram.fz - dz * tram.fx) < 14 && dx * tram.fx + dz * tram.fz > 0 && dx * tram.fx + dz * tram.fz < tram.bhl + 30) k.out = 1;
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    residual = 0;
    for (let i = 0; i < n; i++) {
      const a = karts[i];
      for (let j = i + 1; j < n; j++) {
        const b = karts[j];
        if ((a.air > 0 || b.air > 0) && vgap(a, b) > 0) continue;
        const depth = sat(a.pos.x, a.pos.z, a.fx, a.fz, a.hl, a.hw, b.pos.x, b.pos.z, b.fx, b.fz, b.hl, b.hw, C);
        if (depth <= SLOP * 0.5) continue;
        if (depth > residual) residual = depth;
        const tx = T.tx[a.idx], tz = T.tz[a.idx];
        const d = (b.pos.x - a.pos.x) * tx + (b.pos.z - a.pos.z) * tz; // + ise b önde
        const need = a.hl * Math.abs(a.fx * tx + a.fz * tz) + a.hw * Math.abs(a.fz * tx - a.fx * tz)
          + b.hl * Math.abs(b.fx * tx + b.fz * tz) + b.hw * Math.abs(b.fz * tx - b.fx * tz) - Math.abs(d) + SLOP;
        const front = d >= 0 ? b : a, rear = d >= 0 ? a : b;
        // öndeki "ileri" tarafındaysa o ilerler; değilse arkadaki geri çekilir
        const m = front.out > 0 ? front : rear, sgn = front.out > 0 ? 1 : -1;
        m.pos.x += tx * need * sgn; m.pos.z += tz * need * sgn;
        m.speed *= 0.7;
      }
    }
    if (solidTram) {
      for (let i = 0; i < n; i++) {
        const k = karts[i];
        const depth = sat(k.pos.x, k.pos.z, k.fx, k.fz, k.hl, k.hw, tram.x, tram.z, tram.fx, tram.fz, tram.bhl, tram.bhw, C);
        if (depth <= SLOP * 0.5) continue;
        if (depth > residual) residual = depth;
        const tx = tram.fx, tz = tram.fz;
        const d = (k.pos.x - tram.x) * tx + (k.pos.z - tram.z) * tz; // + ise kart tramvayın önünde
        const need = k.hl * Math.abs(k.fx * tx + k.fz * tz) + k.hw * Math.abs(k.fz * tx - k.fx * tz) + tram.bhl - d * k.out + SLOP;
        k.pos.x += tx * need * k.out; k.pos.z += tz * need * k.out;
      }
    }
    let wall = false;
    for (let i = 0; i < n; i++) if (karts[i].walls(0, false)) wall = true;
    if (residual === 0 && !wall) return 0;
  }
  stats.failed++;
  return residual;
}

// Denetim için: şu anki en derin kart–kart / kart–tramvay örtüşmesi ve duvar taşması.
export function overlapNow(karts, tram, T) {
  let kart = 0, tr = 0, wall = 0;
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    for (let j = i + 1; j < karts.length; j++) {
      const b = karts[j];
      if ((a.air > 0 || b.air > 0) && vgap(a, b) > 0) continue; // biri öbürünün üstünde
      kart = Math.max(kart, sat(a.pos.x, a.pos.z, a.fx, a.fz, a.hl, a.hw, b.pos.x, b.pos.z, b.fx, b.fz, b.hl, b.hw, C));
    }
    if (tram && tram.solid) tr = Math.max(tr, sat(a.pos.x, a.pos.z, a.fx, a.fz, a.hl, a.hw, tram.x, tram.z, tram.fx, tram.fz, tram.bhl, tram.bhw, C));
    const i2 = T.locate(a.pos.x, a.pos.z, a.idx);
    const lat = (a.pos.x - T.px[i2]) * T.rx[i2] + (a.pos.z - T.pz[i2]) * T.rz[i2];
    const c = Math.abs(a.fx * T.tx[i2] + a.fz * T.tz[i2]);
    const ext = a.hw * c + a.hl * Math.sqrt(Math.max(0, 1 - c * c));
    // duvarın iç yüzü: yarı genişlik + 0.3
    wall = Math.max(wall, Math.abs(lat) + ext - (T.hw[i2] + 0.3));
  }
  return { kart, tram: tr, wall };
}

// Denetim için: örtüşen kart çiftleri (yükseklik ayrımına bakmadan), dikey boşluklarıyla.
export function pairsNow(karts) {
  const out = [];
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j];
    const depth = sat(a.pos.x, a.pos.z, a.fx, a.fz, a.hl, a.hw, b.pos.x, b.pos.z, b.fx, b.fz, b.hl, b.hw, C);
    if (depth > 0) out.push({ a: a.char.id, b: b.char.id, depth: +depth.toFixed(4), vgap: +vgap(a, b).toFixed(3), air: [+a.air.toFixed(3), +b.air.toFixed(3)], top: [+a.top.toFixed(2), +b.top.toFixed(2)], leap: [+a.leapT.toFixed(3), +b.leapT.toFixed(3)] });
  }
  return out;
}
