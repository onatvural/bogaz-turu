// Doku ve model yükleyici. Eksik dosya oyunu durdurmaz; kullanan taraf yedeğe düşer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const BASE = import.meta.env.BASE_URL + 'assets/';
export const A = { tex: {}, models: {} };

const TEX = ['iznik', 'kilim', 'cobble', 'vault', 'itembox', 'facade_a', 'facade_b', 'bazaar', 'sky', 'sign_1', 'sign_2', 'sign_3', 'sign_4'];
const MODELS = ['k_simitci', 'k_kaptan', 'k_tekir', 'k_marti', 'k_cayci', 'k_dolmuscu', 'm_galata', 'm_kizkulesi', 'm_cami', 'm_vapur', 'm_tramvay', 'm_balikci'];

export async function loadAssets(onProgress) {
  const total = TEX.length + MODELS.length;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);

  const jobs = [];
  for (const name of TEX) {
    jobs.push(new Promise((res) => {
      tl.load(`${BASE}tex/${name}.jpg`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        A.tex[name] = t; tick(); res();
      }, undefined, () => { console.warn('doku yok:', name); tick(); res(); });
    }));
  }
  for (const name of MODELS) {
    jobs.push(new Promise((res) => {
      gl.load(`${BASE}models/${name}.glb`, (g) => {
        A.models[name] = prepModel(g.scene); tick(); res();
      }, undefined, () => { console.warn('model yok:', name); tick(); res(); });
    }));
  }
  await Promise.all(jobs);
  return A;
}

// PBR malzemeleri ucuz Lambert'e çevir; sahnenin ışığıyla tutarlı, çizgi film görünümü.
function prepModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const map = m.map || null;
    if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    o.material = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : m.color });
    o.frustumCulled = true;
  });
  return root;
}

// Modeli ölçekle, tabanını y=0'a oturt, XZ'de ortala. size: {height} | {length} (en uzun yatay kenar)
export function fit(src, { height, length, yaw = 0, clone = true } = {}) {
  const obj = clone ? src.clone() : src;
  obj.rotation.set(0, yaw, 0);
  obj.position.set(0, 0, 0);
  obj.scale.setScalar(1);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = height ? height / size.y : length / Math.max(size.x, size.z);
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const g = new THREE.Group();
  g.add(obj);
  g.userData.size = size.multiplyScalar(s);
  return g;
}

export function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
