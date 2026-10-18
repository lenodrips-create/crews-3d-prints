import * as THREE from 'three';
import { GeoBuilder, addBox, addCylinder, addTube, addGeometry } from './geometry.js';
import { woodTexture } from './textures.js';
import { bridge, BRIDGE_HALF_W, WATER_Y } from './layout.js';
import { mulberry32 } from './util.js';

// Street furniture and the boardwalk, merged into a few meshes.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = new THREE.Color(1, 1, 1);
const _m = new THREE.Matrix4();

export class Props {
  constructor() {
    this.metal = new GeoBuilder();
    this.wood = new GeoBuilder();
    this.glow = new GeoBuilder();
    this.rope = new GeoBuilder();
    this.globe = new THREE.SphereGeometry(1, 16, 12);
    this.rnd = mulberry32(99);
  }

  lamp(x, y, z) {
    addCylinder(this.metal, V(x, y, z), V(x, y + 0.45, z), 0.2, 0.16, 10, WHITE);
    addCylinder(this.metal, V(x, y + 0.45, z), V(x, y + 4.6, z), 0.09, 0.065, 10, WHITE);
    addCylinder(this.metal, V(x, y + 5.08, z), V(x, y + 5.22, z), 0.2, 0.05, 10, WHITE);
    _m.makeScale(0.3, 0.3, 0.3).setPosition(x, y + 4.85, z);
    addGeometry(this.glow, this.globe, _m);
  }

  bench(x, y, z, yaw) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    const tint = new THREE.Color(1, 0.96, 0.9);
    for (let i = 0; i < 3; i++) {
      const [px, pz] = at(0, -0.18 + i * 0.16);
      addBox(this.wood, px, y + 0.45, pz, 1.8, 0.05, 0.13, tint, yaw, 1);
    }
    for (let i = 0; i < 2; i++) {
      const [px, pz] = at(0, -0.32);
      addBox(this.wood, px, y + 0.68 + i * 0.18, pz, 1.8, 0.12, 0.04, tint, yaw, 1);
    }
    for (const lx of [-0.75, 0.75]) {
      const [px, pz] = at(lx, -0.05);
      addBox(this.metal, px, y + 0.22, pz, 0.06, 0.44, 0.5, WHITE, yaw);
      const [bx, bz] = at(lx, -0.33);
      addBox(this.metal, bx, y + 0.55, bz, 0.06, 0.6, 0.05, WHITE, yaw);
    }
  }

  fencePost(x, y, z) {
    const top = V(x, y + 0.85, z);
    addCylinder(this.wood, V(x, y - 0.2, z), top, 0.07, 0.065, 7, new THREE.Color(0.86, 0.78, 0.66), 1);
    return top;
  }

  ropeBetween(a, b) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * 0.12 + 0.05;
      pts.push(p);
    }
    addTube(this.rope, pts, pts.map(() => 0.022), 5, WHITE);
  }

  boardwalk() {
    const S = bridge.samples;
    const rnd = this.rnd;
    const woodTint = () => new THREE.Color(0.82 + rnd() * 0.18, 0.8 + rnd() * 0.16, 0.76 + rnd() * 0.14);
    for (let i = 0; i < S.length; i += 1) {
      const s = S[i];
      const yaw = Math.atan2(-s.dz, s.dx) + Math.PI / 2;
      addBox(this.wood, s.x, s.y - 0.04, s.z, BRIDGE_HALF_W * 2 + 0.2, 0.08, 0.27, woodTint(), yaw, 0.5);
    }
    const side = (s, k, y) => V(s.x - s.dz * k, y, s.z + s.dx * k);
    for (const k of [-1.15, 1.15]) {
      const pts = [];
      for (let i = 0; i < S.length; i += 6) pts.push(side(S[i], k, S[i].y - 0.2));
      pts.push(side(S[S.length - 1], k, S[S.length - 1].y - 0.2));
      addTube(this.wood, pts, pts.map(() => 0.12), 6, new THREE.Color(0.7, 0.64, 0.56), 2);
    }
    const logColor = new THREE.Color(0.8, 0.72, 0.6);
    const step = 11;
    for (const k of [-BRIDGE_HALF_W - 0.05, BRIDGE_HALF_W + 0.05]) {
      let prevTop = null, prevMid = null;
      for (let i = 0; i < S.length; i += step) {
        const s = S[i];
        const base = side(s, k, WATER_Y - 1.5);
        const top = side(s, k, s.y + 1.0);
        addCylinder(this.wood, base, top, 0.13, 0.12, 8, logColor, 1.5);
        addCylinder(this.wood, top, top.clone().add(V(0, 0.06, 0)), 0.12, 0.04, 8, logColor, 1);
        const mid = side(s, k, s.y + 0.5);
        if (prevTop) {
          addCylinder(this.wood, prevTop.clone().add(V(0, -0.05, 0)), top.clone().add(V(0, -0.05, 0)), 0.085, 0.085, 7, logColor, 2);
          addCylinder(this.wood, prevMid, mid, 0.06, 0.06, 6, logColor, 2);
        }
        prevTop = top;
        prevMid = mid;
      }
    }
  }

  build(scene) {
    const mats = {
      metal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15, vertexColors: true }),
      wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85, vertexColors: true }),
      glow: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcff4ff, emissiveIntensity: 0.8, roughness: 0.15 }),
      rope: new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 1 }),
    };
    for (const key of ['metal', 'wood', 'glow', 'rope']) {
      if (!this[key].count) continue;
      const mesh = new THREE.Mesh(this[key].build(), mats[key]);
      mesh.castShadow = key !== 'glow';
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}
