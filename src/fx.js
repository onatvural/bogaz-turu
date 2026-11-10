// Parçacıklar: kıvılcım, toz, konfeti. Tek bir Points nesnesi, CPU'da güncellenir.
import * as THREE from 'three';

const MAX = 700;

export class FX {
  constructor(scene) {
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.sa = new Float32Array(MAX * 2); // boyut, alfa
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('sa', new THREE.BufferAttribute(this.sa, 2));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: innerHeight * 0.42 } },
      vertexShader: `attribute vec3 color; attribute vec2 sa; varying vec3 vc; varying float va; uniform float scale;
        void main(){ vc = color; va = sa.y; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = sa.x * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vc; varying float va;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vc, va * smoothstep(0.5, 0.25, d));
          #include <colorspace_fragment>
        }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.c = new THREE.Color();
  }

  spawn(x, y, z, vx, vy, vz, hex, size, life, grav = 0) {
    let i = this.n;
    if (i >= MAX) { i = (Math.random() * MAX) | 0; } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.c.setHex(hex);
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.life[i] = this.max[i] = life; this.size0[i] = size; this.grav[i] = grav;
  }

  burst(p, hex, count, speed, size = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, u = Math.random();
      this.spawn(p.x, p.y + 1, p.z, Math.cos(a) * speed * (0.4 + u), 2 + Math.random() * speed * 0.7, Math.sin(a) * speed * (0.4 + u), hex, size * (0.25 + Math.random() * 0.3), 0.5 + Math.random() * 0.4, 14);
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // son parçacığı buraya taşı
        const l = --this.n;
        if (l !== i) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[l * 3 + k]; this.vel[i * 3 + k] = this.vel[l * 3 + k]; this.col[i * 3 + k] = this.col[l * 3 + k]; }
          this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size0[i] = this.size0[l]; this.grav[i] = this.grav[l];
        }
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.max[i];
      this.sa[i * 2] = this.size0[i] * (0.5 + 0.5 * t);
      this.sa[i * 2 + 1] = Math.min(1, t * 2.2);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.sa.needsUpdate = true;
  }
}
