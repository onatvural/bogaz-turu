// Dünya: arazi, deniz, gökyüzü, yol, köprüler, Kapalıçarşı, binalar, simge yapılar, canlı ayrıntılar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { span, ribbon, wall } from './track.js';
import { A, fit, canvasTex } from './assets.js';

const SUN_DIR = new THREE.Vector3(-0.914 * 0.82, 0.57, 0.407 * 0.82).normalize();
export const FOG_COLOR = 0xf3b990;

// ---------- küçük yardımcılar ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, z * 4.3) * 0.12;

const shoreW = (z) => -52 + 5 * Math.sin(z * 0.021 + 1);
const shoreE = (z) => 52 + 6 * Math.sin(z * 0.017);
// + değer: kıyıdan içeri uzaklık, − değer: denizin içi
function inland(x, z) {
  const d = Math.max(shoreW(z) - x, x - shoreE(z));
  return Math.min(d, 208 + 8 * Math.sin(x * 0.03) - z);
}

export function buildWorld(scene, T, quality = 1) {
  const W = { scene, updaters: [], keepOut: [], obstacles: [] };
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const basic = (o) => new THREE.MeshBasicMaterial(o);

  // ---------- arazi yüksekliği ----------
  function baseH(x, z) {
    const d = inland(x, z);
    if (d < 0) return Math.max(-7, d * 1.3);
    return Math.min(1, d * 0.6) + smooth(25, 150, d) * (3 + fbm(x * 0.007 + 3, z * 0.007 + 7) * 30);
  }
  function groundH(x, z) {
    const n = T.nearest(x, z, true);
    const w = 1 - smooth(T.hw[n.i] + 3, T.hw[n.i] + 46, n.d);
    return lerp(baseH(x, z), T.py[n.i] - 0.9, w);
  }
  W.groundH = groundH;

  // ---------- ışık & sis ----------
  scene.fog = new THREE.Fog(FOG_COLOR, 220, 1150);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xd8a877, 1.75));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun);

  buildSky();
  buildTerrain();
  buildWater();
  buildRoad();
  buildBazaar();
  buildBogazBridge();
  buildHalicBridge();
  buildStartGate();
  buildLandmarks();
  buildBuildings();
  buildTrees();
  buildProps();
  buildLife();

  W.update = (dt, t, cam) => { for (const u of W.updaters) u(dt, t, cam); };
  return W;

  // =====================================================================
  function buildSky() {
    const top = new THREE.Color(0x2f9be3), mid = new THREE.Color(0x7cc4e8);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: top }, mid: { value: mid } },
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; varying float h; void main(){ gl_FragColor = vec4(mix(mid, top, smoothstep(0.0, 0.5, h)), 1.0);\n#include <colorspace_fragment>\n}',
      }),
    );
    dome.renderOrder = -3;
    const sky = new THREE.Group();
    sky.add(dome);
    if (A.tex.sky) {
      const R = 2000, H = (2 * Math.PI * R) / 4.667;
      const tex = A.tex.sky;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, H, 48, 1, true),
        new THREE.ShaderMaterial({
          side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
          uniforms: { map: { value: tex } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb, smoothstep(1.0, 0.86, vUv.y));\n#include <colorspace_fragment>\n}',
        }),
      );
      cyl.position.y = H * 0.5 - H * 0.172;
      cyl.rotation.y = -2.06;
      cyl.renderOrder = -2;
      sky.add(cyl);
    }
    scene.add(sky);
    W.updaters.push((dt, t, cam) => sky.position.set(cam.position.x, cam.position.y * 0.25, cam.position.z));
  }

  // =====================================================================
  function buildTerrain() {
    const cell = quality > 0 ? 6 : 9;
    const x0 = -470, x1 = 430, z0 = -470, z1 = 330;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const cGrassA = new THREE.Color(0x86bb4f), cGrassB = new THREE.Color(0x5e9c47), cPave = new THREE.Color(0xdcc9a3),
      cSand = new THREE.Color(0xcdb78a), cRock = new THREE.Color(0x9b8f83), c = new THREE.Color();
    let k = 0;
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const x = x0 + ix * cell, z = z0 + iz * cell;
        const n = T.nearest(x, z, true);
        const w = 1 - smooth(T.hw[n.i] + 3, T.hw[n.i] + 46, n.d);
        const b = baseH(x, z);
        const h = lerp(b, T.py[n.i] - 0.9, w);
        pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
        const g = fbm(x * 0.03, z * 0.03);
        c.copy(cGrassA).lerp(cGrassB, g);
        c.lerp(cPave, (1 - smooth(14, 42, n.d)) * 0.9);
        if (h < 1.2 && inland(x, z) < 8) c.lerp(cSand, 1 - smooth(0.2, 1.2, h));
        if (h > 16) c.lerp(cRock, smooth(16, 34, h) * 0.5);
        const v = 0.93 + hash2(x, z) * 0.14;
        col[k] = c.r * v; col[k + 1] = c.g * v; col[k + 2] = c.b * v;
        k += 3;
      }
    }
    const idx = [];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, d = a + nx + 1, e = d + 1;
      // tamamen derin denizin altındaki hücreleri at
      if (pos[a * 3 + 1] < -5 && pos[b * 3 + 1] < -5 && pos[d * 3 + 1] < -5 && pos[e * 3 + 1] < -5) continue;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, lambert({ vertexColors: true, flatShading: true })));
  }

  // =====================================================================
  function buildWater() {
    const foam = canvasTex(256, 256, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.strokeStyle = '#fff'; x.lineCap = 'round';
      const r = rng(7);
      for (let i = 0; i < 46; i++) {
        const cx = r() * w, cy = r() * h, len = 10 + r() * 26, a = (r() - 0.5) * 0.5;
        x.lineWidth = 1.5 + r() * 2.5; x.globalAlpha = 0.35 + r() * 0.65;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          x.beginPath();
          x.moveTo(cx + ox - len / 2, cy + oy);
          x.quadraticCurveTo(cx + ox, cy + oy - 5 + a * 20, cx + ox + len / 2, cy + oy + a * 8);
          x.stroke();
        }
      }
    }, { srgb: false });
    const fog = scene.fog;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        foam: { value: foam }, time: { value: 0 },
        deep: { value: new THREE.Color(0x0f8fa8) }, shallow: { value: new THREE.Color(0x35c4c9) },
        sunCol: { value: new THREE.Color(0xffd9a0) }, sunDir: { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize() },
        fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far },
      },
      vertexShader: `varying vec3 wp; varying float dist;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); wp = w.xyz; vec4 mv = viewMatrix * w; dist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D foam; uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 sunCol; uniform vec2 sunDir;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 wp; varying float dist;
        void main(){
          vec2 p = wp.xz;
          float swell = 0.5 + 0.5 * sin(p.x * 0.035 + time * 0.6) * sin(p.y * 0.028 - time * 0.45);
          vec3 c = mix(deep, shallow, swell * 0.75);
          float f1 = texture2D(foam, p * 0.021 + vec2(time * 0.012, time * 0.02)).r;
          float f2 = texture2D(foam, p * 0.047 - vec2(time * 0.02, time * 0.011)).r;
          c += vec3(f1 * 0.22 + f2 * 0.12);
          float glint = smoothstep(0.985, 1.0, dot(normalize(p + sunDir * 4000.0), sunDir)) * 0.0;
          float lane = pow(max(0.0, dot(normalize(p), sunDir)), 24.0);
          c += sunCol * (lane * (0.25 + f2 * 0.9) + glint);
          float fg = smoothstep(fogNear, fogFar, dist);
          gl_FragColor = vec4(mix(c, fogColor, fg), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), mat);
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    W.updaters.push((dt, t) => { mat.uniforms.time.value = t; });
  }

  // =====================================================================
  function buildRoad() {
    const asphalt = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#4b505c'; x.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 5000; i++) {
        x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        x.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
      }
      const kw = w * 0.065;
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i % 2 ? '#f4f1ea' : '#e23b2e';
        x.fillRect(0, (i * h) / 4, kw, h / 4); x.fillRect(w - kw, (i * h) / 4, kw, h / 4);
      }
      x.fillStyle = '#f4f1ea'; x.fillRect(kw + 6, 0, 7, h); x.fillRect(w - kw - 13, 0, 7, h);
      x.fillStyle = '#ffd34d'; x.fillRect(w / 2 - 5, h * 0.1, 10, h * 0.45);
    });
    const planks = canvasTex(512, 512, (x, w, h) => {
      const r = rng(9);
      for (let i = 0; i < 8; i++) {
        const v = 150 + r() * 34;
        x.fillStyle = `rgb(${v},${v * 0.74},${v * 0.48})`; x.fillRect(0, (i * h) / 8, w, h / 8);
        x.fillStyle = 'rgba(60,35,15,0.5)'; x.fillRect(0, (i * h) / 8, w, 3);
      }
      const kw = w * 0.05;
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, kw, h); x.fillRect(w - kw, 0, kw, h);
    });
    const mats = {
      asfalt: lambert({ map: asphalt }),
      kilim: lambert({ map: A.tex.kilim || null, color: A.tex.kilim ? 0xffffff : 0xa5352b }),
      cobble: lambert({ map: A.tex.cobble || null, color: A.tex.cobble ? 0xffffff : 0x9a9488 }),
      planks: lambert({ map: planks }),
    };
    const surf = { sahil: ['asfalt', 1, 12], asfalt: ['asfalt', 1, 12], anadolu: ['asfalt', 1, 12], bogaz: ['asfalt', 1, 12], carsi: ['kilim', 2, 9], galata: ['cobble', 4, 4.5], halic: ['planks', 1, 8] };
    const byMat = {};
    for (const kind in T.ranges) for (const [i0, i1] of T.ranges[kind]) {
      const [m, uRep, vS] = surf[kind];
      (byMat[m] ||= []).push(ribbon(T, span(T, i0, i1), (i) => -T.hw[i] - 0.35, (i) => T.hw[i] + 0.35, 0, uRep, vS));
    }
    for (const m in byMat) scene.add(new THREE.Mesh(mergeGeometries(byMat[m]), mats[m]));

    // çini kaplı alçak duvarlar (köprüler ve çarşı hariç)
    const tile = lambert({ map: A.tex.iznik || null, color: A.tex.iznik ? 0xffffff : 0x2f7fd0 });
    const stone = lambert({ color: 0xe9dfc9 });
    const inner = [], caps = [], outer = [];
    for (const kind of ['sahil', 'asfalt', 'galata', 'anadolu']) for (const [i0, i1] of T.ranges[kind]) {
      const list = span(T, i0, i1);
      for (const s of [-1, 1]) {
        const a = (i) => s * (T.hw[i] + 0.35), b = (i) => s * (T.hw[i] + 1.0);
        inner.push(wall(T, list, a, -2, 1.0, 3, 2));
        outer.push(wall(T, list, b, -2, 1.0, 3, 1, -1));
        caps.push(ribbon(T, list, s > 0 ? a : b, s > 0 ? b : a, 1.0, 1, 4));
      }
    }
    scene.add(new THREE.Mesh(mergeGeometries(inner), tile));
    scene.add(new THREE.Mesh(mergeGeometries(caps.concat(outer)), stone));

    // start çizgisi
    const checker = canvasTex(256, 64, (x, w, h) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
    });
    const sl = new THREE.Mesh(ribbon(T, span(T, T.N - 1, 1), (i) => -T.hw[i], (i) => T.hw[i], 0.04, 1, 4), basic({ map: checker, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sl.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = (Math.floor(i / 4)) / 2; });
    scene.add(sl);

    // tramvay rayları (Galata bölümü)
    const [g0, g1] = T.ranges.galata[0];
    const rails = [-0.95, 0.8].map((l) => ribbon(T, span(T, g0, g1), l, l + 0.15, 0.03, 1, 4));
    scene.add(new THREE.Mesh(mergeGeometries(rails), lambert({ color: 0x3a3a40, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));

    // turbo şeritleri
    const arrows = canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#ff7a1a'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffe14d';
      for (let k = 0; k < 2; k++) { const y = k * 64; x.beginPath(); x.moveTo(8, y + 56); x.lineTo(64, y + 8); x.lineTo(120, y + 56); x.lineTo(120, y + 30); x.lineTo(64, y - 18); x.lineTo(8, y + 30); x.fill(); x.beginPath(); x.moveTo(8, y + 120); x.lineTo(64, y + 72); x.lineTo(120, y + 120); x.lineTo(120, y + 94); x.lineTo(64, y + 46); x.lineTo(8, y + 94); x.fill(); }
    });
    const padMat = basic({ map: arrows, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    W.boostPads = [
      { i: T.cpIdx[1], lat: -4 }, { i: T.cpIdx[6] + 6, lat: 0 }, { i: T.cpIdx[13] - 12, lat: 3 },
      { i: T.cpIdx[17], lat: -3 }, { i: T.cpIdx[22] + 4, lat: 2 }, { i: T.cpIdx[26] + 4, lat: 0 },
    ];
    const pads = W.boostPads.map((p) => ribbon(T, span(T, p.i - 2, p.i + 2), p.lat - 2.4, p.lat + 2.4, 0.05, 1, -4));
    scene.add(new THREE.Mesh(mergeGeometries(pads), padMat));
    W.updaters.push((dt, t) => { arrows.offset.y = -t * 2.2; });
  }

  // =====================================================================
  function buildBazaar() {
    const [i0, i1] = T.ranges.carsi[0];
    const list = span(T, i0, i1);
    const hwv = (i) => T.hw[i];
    const shop = basic({ map: A.tex.bazaar || null, color: A.tex.bazaar ? 0xfff0dc : 0x9a6b3c });
    const vaultTex = A.tex.vault || null;
    const vault = basic({ map: vaultTex, color: vaultTex ? 0xf2e2c4 : 0xd9b56a, side: THREE.DoubleSide });
    const walls = [-1, 1].map((s) => wall(T, list, (i) => s * (hwv(i) + 0.3), 0, 7.2, 30, 1));
    scene.add(new THREE.Mesh(mergeGeometries(walls), shop));
    // tonoz: beş parçalı kemer kesiti
    const prof = [[-1, 7.2], [-0.66, 9.4], [-0.25, 10.5], [0.25, 10.5], [0.66, 9.4], [1, 7.2]];
    const ceil = [];
    for (let k = 0; k < prof.length - 1; k++) ceil.push(slant(list, prof[k], prof[k + 1], 9));
    scene.add(new THREE.Mesh(mergeGeometries(ceil), vault));
    // dış kabuk
    const stoneM = lambert({ color: 0xcdb991 });
    const shell = [-1, 1].map((s) => wall(T, list, (i) => s * (hwv(i) + 1.6), -3, 8.6, 6, 1, -1));
    shell.push(ribbon(T, list, (i) => -hwv(i) - 1.6, (i) => hwv(i) + 1.6, 10.9, 1, 8));
    for (const s of [-1, 1]) shell.push(slantGeneric(list, (i) => s * (hwv(i) + 1.6), 8.6, (i) => s * (hwv(i) * 0.5), 10.9, s));
    scene.add(new THREE.Mesh(mergeGeometries(shell), stoneM));
    // kurşun kubbeler
    const n = Math.floor(list.length / 4);
    const domes = new THREE.InstancedMesh(new THREE.SphereGeometry(3.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ color: 0x8e9aa6 }), n * 2);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    let c = 0;
    for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
      T.pointAt(i0 + k * 4 + 2, s * 4.6, v, 10.6);
      domes.setMatrixAt(c++, m4.makeTranslation(v.x, v.y, v.z));
    }
    scene.add(domes);
    // renkli mozaik lambalar
    const ln = Math.floor(list.length / 3);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 1.35, 1), basic({ color: 0xffffff }), ln);
    const cols = [0xff5a3c, 0xffc23c, 0x35d0c0, 0x4f8cff, 0xff6fb1, 0x8be04e];
    const cc = new THREE.Color();
    for (let k = 0; k < ln; k++) {
      T.pointAt(i0 + k * 3 + 1, (k % 3 - 1) * 3.4, v, 7.3 + (k % 2) * 0.6);
      lamps.setMatrixAt(k, m4.makeTranslation(v.x, v.y, v.z));
      lamps.setColorAt(k, cc.setHex(cols[k % cols.length]));
    }
    scene.add(lamps);
    // giriş ve çıkış kapıları
    const sign = canvasTex(1024, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d5c4a'); g.addColorStop(1, '#134236');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#e8c35a'; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
      x.fillStyle = '#f3d67a'; x.font = '900 128px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('KAPALIÇARŞI', w / 2, h / 2 + 6);
    }, { repeat: false });
    for (const [i, dir] of [[i0, 1], [i1, -1]]) {
      const gate = new THREE.Group();
      const hwi = T.hw[i];
      const pil = new THREE.BoxGeometry(3.4, 15, 3);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(pil, stoneM); p.position.set(s * (hwi + 1.8), 4.5, 0); gate.add(p); }
      const lint = new THREE.Mesh(new THREE.BoxGeometry(hwi * 2 + 7, 4.6, 3), stoneM); lint.position.y = 10.2; gate.add(lint);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(hwi * 2 - 1, 3.4), basic({ map: sign })); sg.position.set(0, 10.2, -1.56); sg.rotation.y = Math.PI; gate.add(sg);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ color: 0x8e9aa6 })); dome.position.y = 12.5; gate.add(dome);
      T.pointAt(i, 0, gate.position);
      gate.rotation.y = T.headingAt(i) + (dir > 0 ? 0 : Math.PI);
      scene.add(gate);
    }
    W.keepOut.push({ x: T.px[T.cpIdx[5]], z: T.pz[T.cpIdx[5]], r: 62 });
  }

  // iki (yanal oran, yükseklik) noktası arasında eğik bant; lat = oran × yarı genişlik
  function slant(list, a, b, vScale) {
    return slantGeneric(list, (i) => a[0] * (T.hw[i] + 0.3), a[1], (i) => b[0] * (T.hw[i] + 0.3), b[1], 1, vScale);
  }
  function slantGeneric(list, latA, yA, latB, yB, side = 1, vScale = 8) {
    const n = list.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    for (let k = 0; k < n; k++) {
      const { i, d } = list[k], la = latA(i), lb = latB(i);
      pos.set([T.px[i] + T.rx[i] * la, T.py[i] + yA, T.pz[i] + T.rz[i] * la, T.px[i] + T.rx[i] * lb, T.py[i] + yB, T.pz[i] + T.rz[i] * lb], k * 6);
      uv.set([0, d / vScale, 1, d / vScale], k * 4);
      if (k < n - 1) { const q = k * 2; if (side > 0) idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); else idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function flip(g) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }

  // =====================================================================
  function buildBogazBridge() {
    const [i0, i1] = T.ranges.bogaz[0];
    const list = span(T, i0, i1);
    const steel = lambert({ color: 0xb9c6d4 }), red = lambert({ color: 0xd8372c });
    const hwv = (i) => T.hw[i];
    const parts = [];
    for (const s of [-1, 1]) {
      const g = wall(T, list, (i) => s * (hwv(i) + 0.35), 0, 0.9, 4, 1); parts.push(g);
      parts.push(wall(T, list, (i) => s * (hwv(i) + 0.9), -2.4, 0.9, 4, 1, -1));
      parts.push(ribbon(T, list, s > 0 ? (i) => hwv(i) + 0.35 : (i) => -hwv(i) - 0.9, s > 0 ? (i) => hwv(i) + 0.9 : (i) => -hwv(i) - 0.35, 0.9, 1, 4));
    }
    const bottom = ribbon(T, list, (i) => -hwv(i) - 0.9, (i) => hwv(i) + 0.9, -2.4, 1, 8); flip(bottom); parts.push(bottom);
    scene.add(new THREE.Mesh(mergeGeometries(parts), steel));
    // korkuluk üstü kırmızı şerit
    const stripes = [-1, 1].map((s) => wall(T, list, (i) => s * (hwv(i) + 0.33), 0.55, 0.8, 4, 1));
    scene.add(new THREE.Mesh(mergeGeometries(stripes), basic({ color: 0xff4b3a })));

    // kuleler
    const towers = [];
    for (const targetX of [-58, 58]) {
      let best = i0, bd = 1e9;
      for (const { i } of list) { const d = Math.abs(T.px[i] - targetX); if (d < bd) { bd = d; best = i; } }
      towers.push(best);
    }
    const TOP = 34, lat = (i) => hwv(i) + 2.6;
    const v = new THREE.Vector3();
    for (const ti of towers) {
      const g = new THREE.Group();
      const w = lat(ti);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, TOP + T.py[ti] + 8, 3.6), steel);
        leg.position.set(s * w, (TOP - T.py[ti] - 8) / 2, 0); g.add(leg);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), basic({ color: 0xff3b30 })); lamp.position.set(s * w, TOP + 0.6, 0); g.add(lamp);
      }
      for (const y of [-3.4, 15, TOP - 2]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 2.6, y < 0 ? 2 : 2.6, 3), y === 15 ? red : steel);
        beam.position.y = y; g.add(beam);
      }
      T.pointAt(ti, 0, g.position);
      g.rotation.y = T.headingAt(ti);
      scene.add(g);
    }
    // ana halatlar ve askılar
    const k0 = list.findIndex((e) => e.i === towers[0]), k1 = list.findIndex((e) => e.i === towers[1]);
    const cableH = (k) => {
      if (k <= k0) return lerp(1.2, TOP, Math.pow(k / k0, 1.6));
      if (k >= k1) return lerp(1.2, TOP, Math.pow((list.length - 1 - k) / (list.length - 1 - k1), 1.6));
      const u = ((k - k0) / (k1 - k0)) * 2 - 1;
      return 5 + (TOP - 5) * u * u;
    };
    const hang = [];
    const cableMat = lambert({ color: 0xf2f4f7 });
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k < list.length; k += 2) {
        const i = list[k].i, h = cableH(k);
        T.pointAt(i, s * lat(i), v, h); pts.push(v.clone());
        if (k % 4 === 0 && h > 2) { hang.push(v.x, v.y, v.z); T.pointAt(i, s * lat(i), v, 0.6); hang.push(v.x, v.y, v.z); }
      }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.34, 5, false), cableMat));
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hang, 3));
    scene.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0xf2f4f7 })));
  }

  // =====================================================================
  function buildHalicBridge() {
    const [i0, i1] = T.ranges.halic[0];
    const list = span(T, i0, i1);
    const hwv = (i) => T.hw[i];
    const SW = 4.2; // kaldırım genişliği
    const concrete = lambert({ color: 0xbfb8aa }), dark = lambert({ color: 0x6f6a62 });
    const parts = [];
    for (const s of [-1, 1]) {
      // yol ile kaldırım arası alçak bordür
      parts.push(wall(T, list, (i) => s * (hwv(i) + 0.35), 0, 0.55, 4, 1));
      parts.push(ribbon(T, list, s > 0 ? (i) => hwv(i) + 0.35 : (i) => -hwv(i) - SW, s > 0 ? (i) => hwv(i) + SW : (i) => -hwv(i) - 0.35, 0.55, 1, 4));
      parts.push(wall(T, list, (i) => s * (hwv(i) + SW), -1.8, 0.55, 4, 1, -1));
    }
    const bottom = ribbon(T, list, (i) => -hwv(i) - SW, (i) => hwv(i) + SW, -1.8, 1, 8); flip(bottom); parts.push(bottom);
    scene.add(new THREE.Mesh(mergeGeometries(parts), concrete));
    // korkuluk
    const railTex = canvasTex(64, 64, (x, w, h) => {
      x.clearRect(0, 0, w, h); x.fillStyle = '#2d5d63';
      x.fillRect(0, 0, w, 8); x.fillRect(0, 30, w, 5); x.fillRect(28, 0, 8, h);
    });
    const rails = [-1, 1].map((s) => wall(T, list, (i) => s * (hwv(i) + SW - 0.15), 0.55, 1.75, 2, 1));
    scene.add(new THREE.Mesh(mergeGeometries(rails), basic({ map: railTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })));
    // ayaklar
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const nP = Math.floor(list.length / 9);
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 12, 1), dark, nP);
    for (let k = 0; k < nP; k++) {
      const i = list[k * 9 + 4].i;
      T.pointAt(i, 0, v, -7.6);
      sc.set(1, 1, (hwv(i) + SW) * 2 - 2);
      piers.setMatrixAt(k, m4.compose(v, q.setFromAxisAngle(up, T.headingAt(i)), sc));
    }
    scene.add(piers);
    // balıkçılar
    const src = A.models.m_balikci;
    const nF = quality > 0 ? 14 : 8;
    for (let k = 0; k < nF; k++) {
      const e = list[Math.floor(((k + 0.7) / nF) * (list.length - 6)) + 3];
      const s = k % 2 ? 1 : -1;
      let f;
      if (src) f = fit(src, { height: 3.1, yaw: -Math.PI / 2 });
      else {
        f = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.9, 8), lambert({ color: 0x3d8a4c })); body.position.y = 1.0; f.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lambert({ color: 0xe2b48c })); head.position.y = 2.3; f.add(head);
      }
      T.pointAt(e.i, s * (hwv(e.i) + SW - 1.1), f.position, 0.55);
      f.rotation.y = T.headingAt(e.i) + (s > 0 ? -Math.PI / 2 : Math.PI / 2) + (hash2(k, 3) - 0.5) * 0.6;
      scene.add(f);
    }
  }

  // =====================================================================
  function buildStartGate() {
    const i = 3;
    const hwi = T.hw[i];
    const g = new THREE.Group();
    const postM = lambert({ color: 0xe23b2e });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 10, 10), postM); p.position.set(s * (hwi + 1.4), 5, 0); g.add(p); }
    const banner = canvasTex(1024, 192, (x, w, h) => {
      x.fillStyle = '#e23b2e'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) { x.fillStyle = (k + j) % 2 ? '#111' : '#fff'; x.fillRect(k * 32, j * 32, 32, 32); x.fillRect(w - 192 + k * 32, j * 32, 32, 32); }
      x.fillStyle = '#fff'; x.font = '800 124px "Baloo 2", "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('BOĞAZ TURU', w / 2, h / 2 + 8);
    }, { repeat: false });
    const b = new THREE.Mesh(new THREE.BoxGeometry(hwi * 2 + 4, 2.8, 0.5), [postM, postM, postM, postM, basic({ map: banner }), basic({ map: banner })]);
    b.position.y = 9; g.add(b);
    W.startLights = [];
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), basic({ color: 0x331111 }));
      l.position.set((k - 1) * 1.9, 6.6, -0.2); g.add(l); W.startLights.push(l);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.9, 0.7), lambert({ color: 0x222831 })); box.position.set(0, 6.6, 0.25); g.add(box);
    T.pointAt(i, 0, g.position);
    g.rotation.y = T.headingAt(i) + Math.PI;
    scene.add(g);
  }

  // =====================================================================
  function buildLandmarks() {
    const place = (name, x, z, opts, fallback, yOff = 0) => {
      const src = A.models[name];
      const obj = src ? fit(src, opts) : fallback();
      obj.position.set(x, Math.max(groundH(x, z), -0.5) + yOff, z);
      if (opts.rot != null) obj.rotation.y = opts.rot;
      scene.add(obj);
      return obj;
    };
    // Galata Kulesi — yokuş virajının içinde
    const gx = -238, gz = -142;
    place('m_galata', gx, gz, { height: 58 }, () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 9, 40, 16), lambert({ color: 0xcdb48f })); body.position.y = 20; g.add(body);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(9, 8, 3, 16), lambert({ color: 0xb79f7c })); ring.position.y = 40; g.add(ring);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 6, 16), lambert({ color: 0xcdb48f })); top.position.y = 44; g.add(top);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 13, 16), lambert({ color: 0x55657a })); roof.position.y = 53; g.add(roof);
      return g;
    }, -1.5);
    W.keepOut.push({ x: gx, z: gz, r: 20 });

    // Cami — start düzlüğünün karşısında
    const cx = -74, cz = -112;
    const camiFallback = () => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 34), lambert({ color: 0xe6d9bd })); base.position.y = 7; g.add(base);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ color: 0x7f8fa3 })); dome.position.y = 14; g.add(dome);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 40, 8), lambert({ color: 0xe6d9bd })); m.position.set(sx * 20, 20, sz * 20); g.add(m);
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.7, 8, 8), lambert({ color: 0x7f8fa3 })); c.position.set(sx * 20, 44, sz * 20); g.add(c);
      }
      return g;
    };
    place('m_cami', cx, cz, { length: 62, yaw: -Math.PI / 2 }, camiFallback, -0.6);
    W.keepOut.push({ x: cx, z: cz, r: 44 });
    // tepelerde uzaktan görünen küçük camiler
    for (const [mx, mz, len, rot] of (quality > 0 ? [[-176, 44, 38, 0.4], [168, 18, 36, -1.2], [-52, -300, 40, 0.2], [236, -238, 34, 2.2]] : [[-176, 44, 38, 0.4]])) {
      const m = place('m_cami', mx, mz, { length: len, yaw: -Math.PI / 2 }, camiFallback, -0.8);
      m.rotation.y = rot;
      if (!A.models.m_cami) m.scale.setScalar(len / 62);
      W.keepOut.push({ x: mx, z: mz, r: len * 0.72 });
    }

    // Kız Kulesi — Boğaz'ın ortasında
    place('m_kizkulesi', 0, 58, { length: 30, rot: 0.3 }, () => {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 3, 10), lambert({ color: 0x8c8479 })); rock.position.y = 1; g.add(rock);
      const house = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 9), lambert({ color: 0xf1ead9 })); house.position.y = 5.5; g.add(house);
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 14, 10), lambert({ color: 0xf1ead9 })); tw.position.y = 12; g.add(tw);
      const d = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ color: 0x7f8fa3 })); d.position.y = 19; g.add(d);
      return g;
    }, 0.35);
  }

  // =====================================================================
  function buildBuildings() {
    const wallsA = [], wallsB = [], roofs = [];
    const footprints = (W.footprints = []);
    const D = 9;
    const defs = { a: { H: 13.5, hw: 6.0, roof: 0xb9553f }, b: { H: 17, hw: 7.5, roof: 0x8a6f63 } };
    const r = rng(42);
    const stretches = [
      [27, 3, -1, 'a'], [3, 4, -1, 'b'], [3, 4, 1, 'a'],
      [6, 12, -1, 'b'], [6, 12, 1, 'a'],
      [15, 19, -1, 'a'], [15, 19, 1, 'b'],
      [19, 24, -1, 'b'], [12, 13, -1, 'a'], [12, 13, 1, 'b'],
    ];
    for (const [ca, cb, side, kind] of stretches) {
      const i0 = T.cpIdx[ca], n = (T.cpIdx[cb] - i0 + T.N) % T.N;
      let j = 4;
      while (j < n - 4) {
        const def = defs[r() > 0.3 ? kind : kind === 'a' ? 'b' : 'a'];
        const nh = 2 + Math.floor(r() * 3), L = nh * def.hw;
        const i = T.wrap(i0 + j + Math.round(L / 2 / T.sp));
        j += Math.round(L / T.sp) + 2 + Math.floor(r() * 3);
        // iç virajda kutular birbirine girer — atla
        if (T.curv[i] * side > 0.012) continue;
        const off = T.hw[i] + 6.5 + D / 2 + r() * 2;
        const cx = T.px[i] + T.rx[i] * side * off, cz = T.pz[i] + T.rz[i] * side * off;
        if (inland(cx, cz) < 7) continue;
        if (T.nearest(cx, cz).d < off - 1.5) continue;
        if (W.keepOut.some((k) => Math.hypot(cx - k.x, cz - k.z) < k.r + L / 2)) continue;
        if (footprints.some((f) => Math.hypot(cx - f.x, cz - f.z) < f.r + L / 2 - 1)) continue;
        const yaw = T.headingAt(i);
        const y0 = groundH(cx, cz) - 2.5, H = def.H * (0.92 + r() * 0.16);
        const k0 = Math.floor(r() * (5 - nh));
        addHouse(def === defs.a ? wallsA : wallsB, cx, y0, cz, yaw, L, D, H + 2.5, k0 / 4, (k0 + nh) / 4, 2.5 / (H + 2.5), side);
        addRoof(cx, y0 + H + 2.5, cz, yaw, L, D, def.roof);
        footprints.push({ x: cx, z: cz, r: L / 2 });
      }
    }
    // arka sokaklar: pistten uzakta serpiştirilmiş evler şehri doldurur
    const r2 = rng(99);
    let placed = 0, tries = 0;
    const target = quality > 0 ? 130 : 50;
    while (placed < target && tries++ < 9000) {
      const x = -410 + r2() * 790, z = -360 + r2() * 590;
      if (inland(x, z) < 9) continue;
      const n = T.nearest(x, z);
      if (n.d < T.hw[n.i] + 27 || n.d > 135) continue;
      if (r2() < smooth(30, 135, n.d) * 0.75) continue;
      const def = defs[r2() > 0.5 ? 'a' : 'b'];
      const nh = 2 + Math.floor(r2() * 3), L = nh * def.hw;
      if (W.keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + L / 2)) continue;
      if (footprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + L / 2 + 2.5)) continue;
      const yaw = T.headingAt(n.i) + (r2() > 0.6 ? Math.PI / 2 : 0);
      const y0 = groundH(x, z) - 3, H = def.H * (0.85 + r2() * 0.3), k0 = Math.floor(r2() * (5 - nh));
      addHouse(def === defs.a ? wallsA : wallsB, x, y0, z, yaw, L, D, H + 3, k0 / 4, (k0 + nh) / 4, 0, -1);
      addRoof(x, y0 + H + 3, z, yaw, L, D, def.roof);
      footprints.push({ x, z, r: L / 2 });
      placed++;
    }
    if (wallsA.length) scene.add(new THREE.Mesh(quadGeo(wallsA), lambert({ map: A.tex.facade_a || null, color: A.tex.facade_a ? 0xffffff : 0xe8a27c })));
    if (wallsB.length) scene.add(new THREE.Mesh(quadGeo(wallsB), lambert({ map: A.tex.facade_b || null, color: A.tex.facade_b ? 0xffffff : 0xb9c7b0 })));
    if (roofs.length) scene.add(new THREE.Mesh(mergeGeometries(roofs), lambert({ vertexColors: true })));

    // yerel (along, depth) eksenlerinde dört cephe
    function addHouse(out, cx, y0, cz, yaw, L, Dp, H, u0, u1, vCut, side) {
      const ax = Math.sin(yaw), az = Math.cos(yaw); // pist boyunca
      const bx = -az * -1, bz = ax * -1; // sağ = (−az... ) işaret aşağıda side ile düzeltilir
      const rx_ = -az, rz_ = ax; // sağ vektör
      const P = (a, b, y) => [cx + ax * a + rx_ * b, y, cz + az * a + rz_ * b];
      const hl = L / 2, hd = Dp / 2, y1 = y0 + H;
      const v0 = -vCut * 0.0; // zemin altı kısım dokunun altını uzatır
      // yola bakan yüz: side=-1 (solda) ise yol sağda → b=+hd
      const f = side < 0 ? 1 : -1;
      const quad = (p0, p1, ua, ub) => out.push({ p: [P(p0[0], p0[1], y0), P(p1[0], p1[1], y0), P(p1[0], p1[1], y1), P(p0[0], p0[1], y1)], uv: [ua, v0, ub, v0, ub, 1, ua, 1] });
      const uw = (u1 - u0) / Math.max(1, Math.round((u1 - u0) * 4));
      quad([-hl * f, hd * f], [hl * f, hd * f], u0, u1);       // ön
      quad([hl * f, -hd * f], [-hl * f, -hd * f], u0, u1);     // arka
      quad([hl * f, hd * f], [hl * f, -hd * f], u0, u0 + uw);  // yan
      quad([-hl * f, -hd * f], [-hl * f, hd * f], u1 - uw, u1);// yan
      void bx; void bz;
    }
    function quadGeo(quads) {
      const pos = [], uv = [], idx = [];
      quads.forEach((q, k) => {
        for (const p of q.p) pos.push(...p);
        uv.push(...q.uv);
        const a = k * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function addRoof(cx, y, cz, yaw, L, Dp, color) {
      const hl = L / 2 + 0.5, hd = Dp / 2 + 0.6, rh = 3.2;
      // beşik çatı: uzun eksen boyunca mahya
      const p = [[-hl, 0, -hd], [hl, 0, -hd], [hl, 0, hd], [-hl, 0, hd], [-hl, rh, 0], [hl, rh, 0]];
      const tri = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]];
      const pos = [], col = [];
      const c = new THREE.Color(color);
      tri.forEach((t, ti) => { const sh = ti < 2 ? 1 : ti < 4 ? 0.86 : 0.75; for (const vi of t) { pos.push(...p[vi]); col.push(c.r * sh, c.g * sh, c.b * sh); } });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw - Math.PI / 2).setPosition(cx, y, cz));
      roofs.push(g);
    }
  }

  // =====================================================================
  function buildTrees() {
    const r = rng(1234);
    const colored = (geo, hex) => {
      const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return geo.index ? geo.toNonIndexed() : geo;
    };
    const trunk = () => colored(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), 0x7a5a3c);
    const kinds = [
      mergeGeometries([trunk(), colored(new THREE.ConeGeometry(1.7, 11, 7).translate(0, 8, 0), 0x2f6b3f)]), // servi
      mergeGeometries([trunk(), colored(new THREE.IcosahedronGeometry(3.4, 0).translate(0, 5.6, 0), 0x5fa046), colored(new THREE.IcosahedronGeometry(2.3, 0).translate(1.6, 7.4, 0.6), 0x6db552)]), // çınar
      mergeGeometries([trunk(), colored(new THREE.IcosahedronGeometry(3.0, 0).translate(0, 5.2, 0), 0xd65aa8), colored(new THREE.IcosahedronGeometry(2.0, 0).translate(-1.4, 6.6, 0.8), 0xe77fc0)]), // erguvan
    ];
    const lists = [[], [], []];
    const target = quality > 0 ? 520 : 260;
    let tries = 0;
    while (lists[0].length + lists[1].length + lists[2].length < target && tries++ < 30000) {
      const x = -440 + r() * 840, z = -440 + r() * 740;
      if (inland(x, z) < 3) continue;
      const n = T.nearest(x, z);
      if (n.d < T.hw[n.i] + 4.5 || n.d > 190) continue;
      if (r() > 0.25 + 0.75 * (1 - smooth(20, 150, n.d))) continue;
      if (W.keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      if (W.footprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 2.5)) continue;
      const t = r();
      lists[t < 0.42 ? 0 : t < 0.8 ? 1 : 2].push([x, groundH(x, z) - 0.3, z, 0.8 + r() * 0.7, r() * 6.28]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    kinds.forEach((geo, k) => {
      const im = new THREE.InstancedMesh(geo, lambert({ vertexColors: true, flatShading: true }), lists[k].length);
      lists[k].forEach((t, i) => im.setMatrixAt(i, m4.compose(p.set(t[0], t[1], t[2]), q.setFromAxisAngle(up, t[4]), s.setScalar(t[3]))));
      scene.add(im);
    });
  }

  // =====================================================================
  function buildProps() {
    const v = new THREE.Vector3();
    // sokak lambaları
    const spots = [];
    const lampRanges = [[27, 3, [-1, 1]], [19, 24, [-1, 1]], [15, 19, [1]], [6, 12, [-1]]];
    for (const [ca, cb, sides] of lampRanges) {
      const i0 = T.cpIdx[ca], n = (T.cpIdx[cb] - i0 + T.N) % T.N;
      for (let j = 5; j < n; j += 11) for (const s of sides) spots.push([T.wrap(i0 + j), s]);
    }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.2, 6.4, 6).translate(0, 3.2, 0), lambert({ color: 0x2d4a4f }), spots.length);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.44, 8, 6), basic({ color: 0xfff1b8 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([i, s], k) => {
      T.pointAt(i, s * (T.hw[i] + 2.2), v, -0.6);
      pole.setMatrixAt(k, m4.makeTranslation(v.x, v.y, v.z));
      bulb.setMatrixAt(k, m4.makeTranslation(v.x, v.y + 6.7, v.z));
    });
    scene.add(pole, bulb);

    // Galata yokuşunda sokağı boydan boya geçen bayraklar
    const cols = [0xe23b2e, 0xffc83a, 0x1fb5ad, 0xffffff, 0x3f7fe0, 0xff7ab8].map((h) => new THREE.Color(h));
    const pos = [], col = [];
    const strings = [];
    for (const [ca, cb] of [[6, 12], [19, 24]]) {
      const i0 = T.cpIdx[ca], n = (T.cpIdx[cb] - i0 + T.N) % T.N;
      for (let j = 8; j < n - 4; j += 13) strings.push(T.wrap(i0 + j));
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const i of strings) {
      const w = T.hw[i] + 1.6, NF = 14;
      for (let k = 0; k < NF; k++) {
        const u0 = k / NF, u1 = (k + 0.82) / NF, um = (u0 + u1) / 2;
        const sag = (u) => 8.6 - 1.6 * (1 - (2 * u - 1) ** 2);
        T.pointAt(i, lerp(-w, w, u0), a, sag(u0)); T.pointAt(i, lerp(-w, w, u1), b, sag(u1));
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        T.pointAt(i, lerp(-w, w, um), a, sag(um) - 1.25); pos.push(a.x, a.y, a.z);
        const c = cols[(k + i) % cols.length];
        for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(fg, basic({ vertexColors: true, side: THREE.DoubleSide })));

    // tabelalar
    const signs = [[T.cpIdx[2] + 8, 1, 'sign_1'], [T.cpIdx[8], -1, 'sign_2'], [T.cpIdx[17] - 4, -1, 'sign_3'], [T.cpIdx[21], -1, 'sign_4'], [T.cpIdx[12] + 6, 1, 'sign_2'], [T.cpIdx[0] + 14, 1, 'sign_3']];
    const postM = lambert({ color: 0x3b3f46 });
    for (const [i, s, name] of signs) {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 0.4), [postM, postM, postM, postM, basic({ map: A.tex[name] || null, color: A.tex[name] ? 0xffffff : 0xe23b2e }), postM]);
      board.position.y = 8.2; g.add(board);
      for (const px of [-3.6, 3.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 6), postM); p.position.set(px, 3, -0.45); g.add(p); }
      T.pointAt(i, s * (T.hw[i] + 7.5), g.position);
      g.position.y = groundH(g.position.x, g.position.z) - 0.4;
      g.rotation.y = T.headingAt(i) + Math.PI - s * 0.35;
      scene.add(g);
    }
  }

  // =====================================================================
  function buildLife() {
    // vapurlar
    const ferries = [];
    for (let k = 0; k < 2; k++) {
      let f;
      if (A.models.m_vapur) f = fit(A.models.m_vapur, { length: 40, yaw: Math.PI / 2 });
      else {
        f = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 36), lambert({ color: 0xf5f5f0 })); hull.position.y = 2; f.add(hull);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 22), lambert({ color: 0xfafafa })); cab.position.y = 6; f.add(cab);
        const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 10), lambert({ color: 0xf2c31b })); fun.position.y = 10; f.add(fun);
      }
      scene.add(f); ferries.push(f);
    }
    W.ferries = ferries;
    // modelin burnu hangi eksende? uzun eksen z ise 0, x ise 90°
    const ferryYaw = 0;
    W.ferryYawFix = 0;
    W.updaters.push((dt, t) => {
      ferries.forEach((f, k) => {
        const a = t * 0.045 + k * Math.PI;
        const x = 26 * Math.cos(a), z = -22 + 138 * Math.sin(a);
        const dx = -26 * Math.sin(a), dz = 138 * Math.cos(a);
        f.position.set(x, -0.9 + Math.sin(t * 0.9 + k) * 0.25, z);
        f.rotation.set(Math.sin(t * 0.7 + k) * 0.015, Math.atan2(dx, dz) + ferryYaw + W.ferryYawFix, Math.sin(t * 0.55 + k * 2) * 0.02);
      });
    });

    // martılar
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.35, 1.9, 0, -0.1, 0, 0, 0.45, 0, 0, 0.45, 1.9, 0, -0.1, 1.5, 0, 0.4], 3));
    wingG.computeVertexNormals();
    const white = lambert({ color: 0xffffff, side: THREE.DoubleSide }), grey = lambert({ color: 0xb8c0c8, side: THREE.DoubleSide });
    const gulls = [];
    const r = rng(77);
    for (let k = 0; k < (quality > 0 ? 16 : 8); k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 6).rotateX(Math.PI / 2), white); g.add(body);
      const wl = new THREE.Mesh(wingG, grey), wr = new THREE.Mesh(wingG, grey); wr.scale.x = -1; g.add(wl, wr);
      g.userData = { cx: -60 + r() * 120, cz: -180 + r() * 380, rad: 18 + r() * 40, h: 12 + r() * 22, sp: (0.25 + r() * 0.3) * (r() > 0.5 ? 1 : -1), ph: r() * 6.28, wl, wr };
      g.scale.setScalar(1.5);
      scene.add(g); gulls.push(g);
    }
    W.updaters.push((dt, t) => {
      for (const g of gulls) {
        const u = g.userData, a = u.ph + t * u.sp;
        g.position.set(u.cx + Math.cos(a) * u.rad, u.h + Math.sin(t * 0.5 + u.ph) * 2, u.cz + Math.sin(a) * u.rad);
        g.rotation.y = -a + (u.sp > 0 ? Math.PI : 0);
        const flap = Math.sin(t * 7 + u.ph) * 0.55;
        u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
      }
    });

    // nostaljik tramvay — Galata yokuşunda yolun ortasından ağır ağır gider
    const [g0, g1] = T.ranges.galata[0];
    let tram;
    if (A.models.m_tramvay) tram = fit(A.models.m_tramvay, { length: 8.5, yaw: -Math.PI / 2 });
    else {
      tram = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 8), lambert({ color: 0xd8372c })); b.position.y = 1.6; tram.add(b);
      const u = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.5, 7.8), lambert({ color: 0xf5ecd7 })); u.position.y = 3.4; tram.add(u);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 8.4), lambert({ color: 0x333333 })); rf.position.y = 4.3; tram.add(rf);
    }
    scene.add(tram);
    const span_ = (g1 - g0 + T.N) % T.N;
    const sz = tram.userData.size;
    // Tramvay katı bir gövdedir (yarı boy hl, yarı en hw). Yarış sırasında oyun adım adım ilerletir (external),
    // menüde dünya kendi ilerletir. Hat sonunda küçülerek kaybolur, hat başı boşsa orada büyüyerek belirir;
    // çarpışma kutusu da görünen boyla birlikte küçülür, böylece hiçbir kartın içinde belirmez.
    const TR = (W.tram = {
      obj: tram, f: g0 + 20, lat: -0.05, speed: 13, hl: sz ? sz.z / 2 : 4.2, hw: sz ? sz.x / 2 : 1.5,
      grow: 1, out: false, solid: true, external: false, karts: null, yawFix: 0,
      x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, bhl: 0, bhw: 0,
    });
    const tp = new THREE.Vector3();
    const START = g0 + 6;
    TR.step = (dt) => {
      const adv = (TR.speed * dt) / T.sp;
      if (TR.out) {
        TR.grow = Math.max(0, TR.grow - dt * 2.5);
        if (TR.grow > 0) TR.f += adv;
        else {
          // hat başında kart varsa bekle
          const busy = TR.karts && TR.karts.some((k) => Math.abs(((k.f - START + T.N * 1.5) % T.N) - T.N / 2) * T.sp < TR.hl + 10);
          if (!busy) { TR.f = START; TR.out = false; }
        }
      } else {
        TR.grow = Math.min(1, TR.grow + dt * 2.5);
        TR.f += adv;
        if (((TR.f - g0 + T.N) % T.N) > span_ - 9) TR.out = true;
      }
      TR.solid = TR.grow > 0.05;
      T.pointAt(TR.f, TR.lat, tp, 0.05);
      tram.position.copy(tp);
      const h = T.headingAt(T.wrap(Math.floor(TR.f)));
      tram.rotation.y = h + TR.yawFix;
      tram.visible = TR.grow > 0.01;
      tram.scale.setScalar(Math.max(0.001, TR.grow));
      TR.x = tp.x; TR.z = tp.z; TR.fx = Math.sin(h); TR.fz = Math.cos(h);
      TR.vx = TR.fx * TR.speed; TR.vz = TR.fz * TR.speed;
      TR.bhl = TR.hl * TR.grow; TR.bhw = TR.hw * TR.grow;
    };
    TR.step(0);
    W.updaters.push((dt) => { if (!TR.external) TR.step(dt); });
  }
}
