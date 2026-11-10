// Koridor denetimi: sürüş koridorunda (kart gövdesinin ulaşabildiği yer) sahne geometrisi olmamalı.
// Kart gövdesi yanal olarak en fazla T.hw + 0.25'e, yukarı doğru ~4.5 m'ye uzanır. Yol yüzeyi, tramvay,
// sandıklar ve kartlar hariç hiçbir köşe noktası bu hacmin içinde kalmamalı.
// Kullanım: node tools/play.mjs tools/tests/corridor.mjs [--url 'http://localhost:5183/?q=0']
export default async ({ ev, log }) => {
  const r = await ev(() => {
    const g = window.__bt, T = g.T, N = T.N;
    const skip = new Set();
    const mark = (o) => o && o.traverse((c) => skip.add(c));
    mark(g.world.tram.obj);
    for (const b of g.items.boxes) mark(b.mesh);
    for (const k of g.karts) mark(k.root);
    // pist örnekleri için kaba ızgara
    const CELL = 8, grid = new Map();
    const key = (x, z) => Math.floor(x / CELL) + ':' + Math.floor(z / CELL);
    for (let i = 0; i < N; i++) { const k = key(T.px[i], T.pz[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    const LIM = 0.25, Y0 = 0.3, Y1 = 4.5;
    let checked = 0, meshes = 0;
    const bad = [];
    const test = (x, y, z, name) => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      let best = -1, bd = 1e9;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = grid.get((cx + dx) + ':' + (cz + dz));
        if (!l) continue;
        for (const i of l) { const d = (T.px[i] - x) ** 2 + (T.pz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best < 0) return;
      checked++;
      const lat = (x - T.px[best]) * T.rx[best] + (z - T.pz[best]) * T.rz[best];
      const along = (x - T.px[best]) * T.tx[best] + (z - T.pz[best]) * T.tz[best];
      if (Math.abs(along) > 1.6) return; // en yakın örnek bu kesitte değil (viraj içi, uzak nokta)
      const h = y - T.py[best];
      const inside = T.hw[best] + LIM - Math.abs(lat);
      if (h > Y0 && h < Y1 && inside > 0.02) {
        const e = bad.find((b) => b.name === name);
        if (e) { e.n++; if (inside > e.worst) { e.worst = +inside.toFixed(2); e.at = `i=${best} lat=${lat.toFixed(2)} h=${h.toFixed(2)} tür=${T.kind[best]}`; } } else bad.push({ name, n: 1, worst: +inside.toFixed(2), at: `i=${best} lat=${lat.toFixed(2)} h=${h.toFixed(2)} tür=${T.kind[best]}` });
      }
    };
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if (skip.has(o) || !(o.isMesh || o.isLineSegments) || !o.visible || !o.geometry.attributes.position) return;
      if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
      if (o.geometry.boundingSphere.radius > 1500) return; // gökyüzü, deniz
      meshes++;
      const p = o.geometry.attributes.position, m = o.matrixWorld.elements;
      const name = (o.name || o.geometry.type) + '#' + o.id + (o.isInstancedMesh ? '[inst]' : '');
      const one = (a, x, y, z) => {
        // a: örnek matrisi (yoksa birim)
        let X = x, Y = y, Z = z;
        if (a) { X = a[0] * x + a[4] * y + a[8] * z + a[12]; Y = a[1] * x + a[5] * y + a[9] * z + a[13]; Z = a[2] * x + a[6] * y + a[10] * z + a[14]; }
        test(m[0] * X + m[4] * Y + m[8] * Z + m[12], m[1] * X + m[5] * Y + m[9] * Z + m[13], m[2] * X + m[6] * Y + m[10] * Z + m[14], name);
      };
      if (o.isInstancedMesh) {
        const im = o.instanceMatrix.array;
        for (let k = 0; k < o.count; k++) { const a = im.subarray(k * 16, k * 16 + 16); for (let i = 0; i < p.count; i++) one(a, p.getX(i), p.getY(i), p.getZ(i)); }
      } else for (let i = 0; i < p.count; i++) one(null, p.getX(i), p.getY(i), p.getZ(i));
    });
    bad.sort((a, b) => b.worst - a.worst);
    return { meshes, checked, bad: bad.slice(0, 12), nBad: bad.length, tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls, quality: g.quality };
  });
  log(JSON.stringify(r, null, 1));
  if (r.nBad) throw new Error(`koridorda ${r.nBad} nesnenin köşesi var`);
  return 'koridor denetimi geçti';
};
