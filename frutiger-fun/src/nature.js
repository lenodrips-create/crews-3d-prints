import * as THREE from 'three';
import { GeoBuilder, addTube, addGeometry } from './geometry.js';
import { mulberry32, clamp } from './util.js';
import { leafTexture, barkTexture, bushTexture, grassBladeTexture } from './textures.js';

// Trees, hedges, flowers, reeds and rocks. Everything is instanced, and split
// into map chunks so off-screen chunks are skipped.

const CHUNK = 210;
const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function windy(mat, amp, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
      #endif
      float h = max(position.y, 0.0);
      transformed.x += (sin(uTime * 1.6 + ph + position.y * 0.35) * 0.6 + sin(uTime * 2.7 + ph * 1.7 + position.x) * 0.4) * ${amp.toFixed(4)} * h;
      transformed.z += cos(uTime * 1.3 + ph + position.z * 0.5) * ${(amp * 0.6).toFixed(4)} * h;`);
  };
  mat.customProgramCacheKey = () => 'windy' + amp;
  return mat;
}

function randInSphere(rnd) {
  for (;;) {
    const x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return new THREE.Vector3(x, y, z);
  }
}

function makeTreeVariant(seed, { height, crown, clusters, cards }) {
  const rnd = mulberry32(seed);
  const bark = new GeoBuilder(), blob = new GeoBuilder(), leaf = new GeoBuilder();
  const white = new THREE.Color(1, 1, 1);
  const rb = height * 0.034;
  const top = new THREE.Vector3((rnd() - 0.5) * height * 0.08, height * 0.52, (rnd() - 0.5) * height * 0.08);
  const trunk = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    trunk.push(new THREE.Vector3(top.x * t * t + Math.sin(t * 3 + seed) * 0.12 * t, top.y * t - 0.3 * (1 - t), top.z * t * t));
  }
  addTube(bark, trunk, trunk.map((_, i) => rb * (1 - 0.45 * (i / 6)) * (i === 0 ? 1.45 : 1)), 9, white, 2);

  const C = new THREE.Vector3(top.x, height * 0.7, top.z);
  const R = crown, Rv = crown * 0.72;
  const centers = [];
  for (let k = 0; k < clusters; k++) {
    const a = (k / clusters) * TAU + rnd() * 0.6;
    const up = k === clusters - 1 ? 1 : rnd() * 1.3 - 0.35;
    const dir = new THREE.Vector3(Math.cos(a) * (1 - Math.abs(up) * 0.4), up, Math.sin(a) * (1 - Math.abs(up) * 0.4));
    const p = C.clone().add(new THREE.Vector3(dir.x * R * 0.6, dir.y * Rv * 0.62, dir.z * R * 0.6));
    const cr = R * (0.42 + rnd() * 0.18);
    centers.push([p, cr]);
    // branch from the trunk to the cluster
    const startY = height * (0.36 + rnd() * 0.16);
    const s = new THREE.Vector3(top.x * (startY / top.y) ** 2, startY, top.z * (startY / top.y) ** 2);
    const e = s.clone().lerp(p, 0.85);
    const mid = s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.6, 0));
    addTube(bark, [s, mid, e], [rb * 0.5, rb * 0.3, rb * 0.12], 5, white, 2);
  }
  const ico = new THREE.IcosahedronGeometry(1, 1);
  for (const [p, cr] of centers) {
    _m.compose(p, _q.identity(), _s.set(cr * 0.62, cr * 0.56, cr * 0.62));
    addGeometry(blob, ico, _m, new THREE.Color(0.75, 0.75, 0.75).lerp(white, clamp((p.y - C.y) / Rv + 0.5, 0, 1)));
    for (let c = 0; c < cards; c++) {
      const q = p.clone().add(randInSphere(rnd).multiplyScalar(cr * 0.6));
      const n = randInSphere(rnd).normalize();
      const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : _up).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      const size = cr * (0.95 + rnd() * 0.5);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const ids = corners.map(([u, v]) => {
        const vp = q.clone().addScaledVector(t1, u * size * 0.5).addScaledVector(t2, v * size * 0.5);
        const nn = vp.clone().sub(C).normalize().lerp(_up, 0.25).normalize();
        const shade = clamp(0.62 + 0.5 * (vp.distanceTo(C) / R) + 0.12 * ((vp.y - C.y) / Rv), 0.55, 1.15);
        return leaf.vert(vp.x, vp.y, vp.z, nn.x, nn.y, nn.z, (u + 1) / 2, (v + 1) / 2, new THREE.Color(shade, shade, shade));
      });
      leaf.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  return {
    bark: bark.build(), blob: blob.build(), leaf: leaf.build(),
    canopyY: C.y, canopyR: R, trunkR: rb,
  };
}

function makeBushGeometry(seed, lobes) {
  const rnd = mulberry32(seed);
  const b = new GeoBuilder();
  const base = new THREE.IcosahedronGeometry(1, 3);
  const pos = base.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.1 * Math.sin(x * 7.1 + seed) * Math.sin(y * 6.3) * Math.sin(z * 8.7 + 1.3) + 0.05 * Math.sin(x * 17 + z * 13);
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  for (let l = 0; l < lobes; l++) {
    const r = l === 0 ? 0.85 : 0.5 + rnd() * 0.3;
    const a = rnd() * TAU, d = l === 0 ? 0 : 0.45 + rnd() * 0.25;
    _m.compose(_p.set(Math.cos(a) * d, r * 0.75 + (l === 0 ? 0.1 : 0), Math.sin(a) * d), _q.setFromAxisAngle(_up, rnd() * TAU), _s.set(r, r * 0.9, r));
    const start = b.count;
    addGeometry(b, base, _m);
    for (let i = start; i < b.count; i++) {
      const y = b.pos[i * 3 + 1];
      const s = clamp(0.5 + y * 0.45, 0.5, 1.08);
      b.col[i * 3] = b.col[i * 3 + 1] = b.col[i * 3 + 2] = s;
    }
  }
  return b.build();
}

function makeTuftGeometry() {
  const b = new GeoBuilder();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const dx = Math.cos(a) * 0.55, dz = Math.sin(a) * 0.55;
    const lo = new THREE.Color(0.78, 0.84, 0.7), hi = new THREE.Color(1.1, 1.1, 1.0);
    const A = b.vert(-dx, 0, -dz, 0, 1, 0, 0, 0, lo);
    const B = b.vert(dx, 0, dz, 0, 1, 0, 1, 0, lo);
    const C = b.vert(dx, 1, dz, 0, 1, 0, 1, 1, hi);
    const D = b.vert(-dx, 1, -dz, 0, 1, 0, 0, 1, hi);
    b.quad(A, B, C, D);
  }
  return b.build();
}

function makeRockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.22 * Math.sin(x * 4.1 + 2) * Math.sin(y * 3.3 + 1) * Math.sin(z * 5.7);
    pos.setXYZ(i, x * k, y * k * 0.62, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Foliage {
  constructor() {
    this.uniforms = { time: { value: 0 } };
    const leafTex = leafTexture();
    this.mats = {
      bark: new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: 0xe2ddd5 }),
      blob: new THREE.MeshStandardMaterial({ map: bushTexture(61), color: 0xb8d8a8, roughness: 1, vertexColors: true }),
      leaf: windy(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }), 0.012, this.uniforms),
      bush: new THREE.MeshStandardMaterial({ map: bushTexture(29), roughness: 0.95, vertexColors: true }),
      flower: new THREE.MeshStandardMaterial({ map: bushTexture(41, true), roughness: 0.8, vertexColors: true }),
      grass: windy(new THREE.MeshStandardMaterial({ map: grassBladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }), 0.1, this.uniforms),
      rock: new THREE.MeshStandardMaterial({ color: 0xd2cfc8, roughness: 0.92, flatShading: true }),
    };
    this.variants = [
      makeTreeVariant(101, { height: 13, crown: 5.6, clusters: 9, cards: 14 }),
      makeTreeVariant(202, { height: 11, crown: 4.7, clusters: 8, cards: 13 }),
      makeTreeVariant(303, { height: 15, crown: 6.3, clusters: 10, cards: 14 }),
      makeTreeVariant(404, { height: 8.5, crown: 3.4, clusters: 6, cards: 10 }),
      makeTreeVariant(505, { height: 19, crown: 8.2, clusters: 13, cards: 15 }),
    ];
    this.bushGeo = makeBushGeometry(7, 4);
    this.tuftGeo = makeTuftGeometry();
    this.rockGeo = makeRockGeometry();
    this.lists = { tree: this.variants.map(() => []), bush: [], flower: [], grass: [], rock: [] };
  }

  addTree(x, y, z, s, variant, rot, tint) {
    this.lists.tree[variant].push({ x, y, z, s, rot, tint });
    return this.variants[variant];
  }
  addBush(x, y, z, s, rot, tint, flower = false) {
    (flower ? this.lists.flower : this.lists.bush).push({ x, y, z, s, rot, tint });
  }
  addTuft(x, y, z, s, rot, sy = s) {
    this.lists.grass.push({ x, y, z, s, sy, rot });
  }
  addRock(x, y, z, s, rot) {
    this.lists.rock.push({ x, y, z, s, rot });
  }

  #instanced(scene, geo, mat, items, { shadow = true, colors = false } = {}) {
    const chunks = new Map();
    for (const it of items) {
      const k = Math.floor((it.x + 2000) / CHUNK) * 1000 + Math.floor((it.z + 2000) / CHUNK);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(it);
    }
    const meshes = [];
    for (const list of chunks.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        _m.compose(_p.set(it.x, it.y, it.z), _q.setFromAxisAngle(_up, it.rot), _s.set(it.s, it.sy ?? it.s, it.s));
        mesh.setMatrixAt(i, _m);
        if (colors) mesh.setColorAt(i, it.tint);
      });
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  build(scene) {
    this.variants.forEach((v, i) => {
      const items = this.lists.tree[i];
      if (!items.length) return;
      this.#instanced(scene, v.bark, this.mats.bark, items);
      this.#instanced(scene, v.blob, this.mats.blob, items, { colors: true });
      this.#instanced(scene, v.leaf, this.mats.leaf, items, { colors: true });
    });
    this.#instanced(scene, this.bushGeo, this.mats.bush, this.lists.bush, { colors: true });
    this.#instanced(scene, this.bushGeo, this.mats.flower, this.lists.flower, { colors: true });
    this.#instanced(scene, this.tuftGeo, this.mats.grass, this.lists.grass, { shadow: false });
    this.#instanced(scene, this.rockGeo, this.mats.rock, this.lists.rock);
  }

  update(t) {
    this.uniforms.time.value = t;
  }
}

export function leafTint(rnd) {
  return new THREE.Color(1.06, 1.08, 0.8).lerp(new THREE.Color(0.78, 0.94, 0.78), rnd());
}
