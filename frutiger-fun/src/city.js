import * as THREE from 'three';
import { GeoBuilder, addPrism, addPyramid, addBox, addCylinder, rectPts, circlePts, roundedRectPts } from './geometry.js';
import { glassTexture, apartmentTexture, officeTexture, paverTexture, grassDetailTexture } from './textures.js';
import { blockCenters, isParkBlock, BLOCK, PITCH, PARK, CITY, SLAB_H } from './layout.js';
import { mulberry32, clamp } from './util.js';
import { leafTint } from './nature.js';

// The city around the park: blocks, towers, roads, street trees and lamps.

const hex = (h) => new THREE.Color(h);
const C = (r, g, b) => new THREE.Color(r, g, b);
const WHITE = C(1, 1, 1);
const GLASS_TINTS = [C(0.86, 0.96, 1), C(0.7, 1, 0.96), C(0.66, 0.8, 1), C(0.95, 0.98, 1), C(0.78, 0.92, 1)];
const ROOF = hex(0xd5dade);
const MAROON = hex(0x9a3d38);
const TRIM_WHITE = hex(0xf4f8fb);

function chamferPts(cx, cz, w, d, c) {
  const hw = w / 2, hd = d / 2;
  return [
    [cx - hw + c, cz + hd], [cx + hw - c, cz + hd], [cx + hw, cz + hd - c], [cx + hw, cz - hd + c],
    [cx + hw - c, cz - hd], [cx - hw + c, cz - hd], [cx - hw, cz - hd + c], [cx - hw, cz + hd - c],
  ];
}

function flatRect(b, cx, y, cz, sx, sz, color) {
  const A = b.vert(cx - sx / 2, y, cz + sz / 2, 0, 1, 0, 0, 0, color);
  const B = b.vert(cx + sx / 2, y, cz + sz / 2, 0, 1, 0, 1, 0, color);
  const Cc = b.vert(cx + sx / 2, y, cz - sz / 2, 0, 1, 0, 1, 1, color);
  const D = b.vert(cx - sx / 2, y, cz - sz / 2, 0, 1, 0, 0, 1, color);
  b.quad(A, B, Cc, D);
}

export function buildCity(scene, { foliage, colliders, props }) {
  const rnd = mulberry32(4242);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const B = {
    glass: new GeoBuilder(), office: new GeoBuilder(), apart: new GeoBuilder(),
    trim: new GeoBuilder(), roof: new GeoBuilder(), slab: new GeoBuilder(),
    lawn: new GeoBuilder(), marks: new GeoBuilder(), pool: new GeoBuilder(),
  };

  const footprint = (shape, x, z, w, d) => {
    switch (shape) {
      case 'round': return roundedRectPts(x, z, w, d, Math.min(w, d) * 0.28, 5);
      case 'cyl': return circlePts(x, z, Math.min(w, d) / 2, 28);
      case 'chamfer': return chamferPts(x, z, w, d, Math.min(w, d) * 0.2);
      default: return rectPts(x, z, w, d);
    }
  };

  function tower(x, z, w, d, h, kind = 'glass') {
    const b = kind === 'glass' ? B.glass : B.office;
    const tint = kind === 'glass' ? pick(GLASS_TINTS) : pick([WHITE, C(0.97, 0.99, 1), C(1, 0.98, 0.96)]);
    const shape = pick(kind === 'glass' ? ['box', 'round', 'round', 'cyl', 'chamfer'] : ['box', 'box', 'round', 'chamfer']);
    const opt = { tileW: kind === 'glass' ? 12 : 16, tileH: 16, uOff: rnd(), smooth: shape === 'round' || shape === 'cyl', roofBuilder: B.roof, roofColor: ROOF, yBase: SLAB_H };
    let fw = w, fd = d;
    if (h > 55 && rnd() < 0.55) {
      const pw = Math.min(w + 8, 44), pd = Math.min(d + 8, 44);
      addPrism(B.office, rectPts(x, z, pw, pd), SLAB_H, SLAB_H + 7 + rnd() * 5, WHITE, { tileW: 16, tileH: 16, roofBuilder: B.roof, roofColor: ROOF });
      fw = pw; fd = pd;
    }
    const h1 = h * (0.7 + rnd() * 0.14);
    addPrism(b, footprint(shape, x, z, w, d), SLAB_H, h1, tint, opt);
    const s2 = 0.74 + rnd() * 0.12;
    const h2 = h * 0.94;
    addPrism(b, footprint(shape, x, z, w * s2, d * s2), h1, h2, tint, opt);
    const crown = rnd();
    if (crown < 0.3) {
      addPyramid(B.trim, footprint(shape === 'cyl' ? 'cyl' : 'box', x, z, w * s2, d * s2), h2, 5 + rnd() * 7, TRIM_WHITE);
    } else if (crown < 0.65) {
      addPrism(B.trim, footprint(shape, x, z, w * s2 * 0.62, d * s2 * 0.62), h2, h, TRIM_WHITE, { roofBuilder: B.roof, roofColor: ROOF });
      if (h > 90) addCylinder(B.trim, new THREE.Vector3(x, h, z), new THREE.Vector3(x, h + 18 + rnd() * 18, z), 0.55, 0.12, 8, TRIM_WHITE);
    } else {
      for (let i = 0; i < 3; i++) {
        addBox(B.roof, x + (rnd() - 0.5) * w * 0.4, h2 + 1.2, z + (rnd() - 0.5) * d * 0.4, 3 + rnd() * 4, 2.4, 3 + rnd() * 4, ROOF);
      }
    }
    if (shape === 'cyl' && fw === w) colliders.addCircle(x, z, Math.min(w, d) / 2, h);
    else colliders.addBox(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2, h);
  }

  function apartment(x, z, w, d, h) {
    const opt = { tileW: 12, tileH: 12, uOff: rnd(), roofBuilder: B.roof, roofColor: ROOF, yBase: SLAB_H };
    addPrism(B.apart, rectPts(x, z, w, d), SLAB_H, h, WHITE, opt);
    // dark glass stair core up one side
    addPrism(B.glass, rectPts(x + w / 2 + 0.9, z, 1.8, d * 0.34), SLAB_H, h + 6, C(0.55, 0.68, 0.85), { tileW: 12, tileH: 16, roofBuilder: B.roof, roofColor: ROOF });
    // the crown: a white frame with maroon roofs
    addPrism(B.apart, rectPts(x, z, w * 0.82, d * 0.62), h, h + 4.5, WHITE, { ...opt, yBase: h });
    addPyramid(B.trim, rectPts(x - w * 0.18, z, w * 0.42, d * 0.62), h + 4.5, 5.5, MAROON);
    addPyramid(B.trim, rectPts(x + w * 0.22, z, w * 0.3, d * 0.5), h + 4.5, 3.6, MAROON);
    addBox(B.trim, x - w * 0.43, h + 3.5, z, 0.7, 7, d * 0.7, TRIM_WHITE);
    addBox(B.trim, x + w * 0.43, h + 2.5, z, 0.7, 5, d * 0.7, TRIM_WHITE);
    colliders.addBox(x - w / 2, z - d / 2, x + w / 2 + 1.8, z + d / 2, h + 6);
  }

  function tvTower(x, z) {
    const y0 = SLAB_H;
    const V = (yy) => new THREE.Vector3(x, yy, z);
    addCylinder(B.trim, V(y0), V(y0 + 12), 7, 5.5, 20, TRIM_WHITE);
    addCylinder(B.trim, V(y0 + 12), V(y0 + 150), 4.6, 2.7, 20, TRIM_WHITE);
    addCylinder(B.trim, V(y0 + 138), V(y0 + 144), 3, 9, 28, TRIM_WHITE);
    addPrism(B.glass, circlePts(x, z, 9.6, 28), y0 + 144, y0 + 152, C(0.75, 0.9, 1), { tileW: 8, tileH: 16, smooth: true, roof: false });
    addCylinder(B.trim, V(y0 + 152), V(y0 + 157), 9.4, 6, 28, TRIM_WHITE);
    addCylinder(B.trim, V(y0 + 157), V(y0 + 186), 2.2, 1.5, 14, TRIM_WHITE);
    for (let i = 0; i < 6; i++) {
      const a = y0 + 186 + i * 7, r0 = 1.1 - i * 0.14;
      addCylinder(B.trim, V(a), V(a + 7), r0, r0 - 0.14, 10, i % 2 ? TRIM_WHITE : hex(0xe0473f));
    }
    colliders.addCircle(x, z, 7.2, 230);
  }

  function lawn(x, z, w, d) {
    addBox(B.lawn, x, SLAB_H + 0.02, z, w, 0.05, d, WHITE, 0, 0.25);
  }

  function pocketPark(cx, cz, withFountain) {
    lawn(cx, cz, BLOCK - 9, BLOCK - 9);
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd() - 0.5) * 38, z = cz + (rnd() - 0.5) * 38;
      if (withFountain && Math.hypot(x - cx, z - cz) < 11) continue;
      const v = Math.floor(rnd() * 3), s = 0.75 + rnd() * 0.3;
      const tv = foliage.addTree(x, SLAB_H, z, s, v, rnd() * 6.28, leafTint(rnd));
      colliders.addCircle(x, z, tv.trunkR * s + 0.1, 4, false);
      colliders.addCanopy(x, SLAB_H + tv.canopyY * s, z, tv.canopyR * s * 0.85);
    }
    for (let i = 0; i < 10; i++) {
      const a = rnd() * 6.28, r = 13 + rnd() * 8;
      foliage.addBush(cx + Math.cos(a) * r, SLAB_H, cz + Math.sin(a) * r, 0.8 + rnd() * 0.5, rnd() * 6.28, C(1, 1, 1), rnd() < 0.4);
    }
    if (withFountain) {
      addPrism(B.trim, circlePts(cx, cz, 7, 36), SLAB_H, SLAB_H + 0.65, TRIM_WHITE, { smooth: true });
      addPrism(B.pool, circlePts(cx, cz, 6.4, 36), SLAB_H + 0.6, SLAB_H + 0.67, WHITE, { roof: true });
      addCylinder(B.trim, new THREE.Vector3(cx, SLAB_H, cz), new THREE.Vector3(cx, SLAB_H + 2.2, cz), 0.9, 0.5, 16, TRIM_WHITE);
      addCylinder(B.trim, new THREE.Vector3(cx, SLAB_H + 2.2, cz), new THREE.Vector3(cx, SLAB_H + 2.5, cz), 2.2, 1.6, 20, TRIM_WHITE);
      colliders.addCircle(cx, cz, 7.1, 0.7, false);
    }
  }

  // ---- blocks ----
  for (const cx of blockCenters) {
    for (const cz of blockCenters) {
      if (isParkBlock(cx, cz)) continue;
      addBox(B.slab, cx, SLAB_H / 2, cz, BLOCK, SLAB_H, BLOCK, WHITE, 0, 0.25);

      // street trees and lamps along the sidewalks
      for (const [sx, sz, along] of [[0, -1, 'x'], [0, 1, 'x'], [-1, 0, 'z'], [1, 0, 'z']]) {
        for (const t of [-18, 0, 18]) {
          const x = along === 'x' ? cx + t : cx + sx * (BLOCK / 2 - 2.4);
          const z = along === 'x' ? cz + sz * (BLOCK / 2 - 2.4) : cz + t;
          const s = 0.85 + rnd() * 0.3;
          const tv = foliage.addTree(x, SLAB_H, z, s, 3, rnd() * 6.28, leafTint(rnd));
          colliders.addCircle(x, z, tv.trunkR * s + 0.1, 4, false);
          colliders.addCanopy(x, SLAB_H + tv.canopyY * s, z, tv.canopyR * s * 0.8);
        }
        for (const t of [-9, 9]) {
          const x = along === 'x' ? cx + t : cx + sx * (BLOCK / 2 - 1.2);
          const z = along === 'x' ? cz + sz * (BLOCK / 2 - 1.2) : cz + t;
          props.lamp(x, SLAB_H, z);
          colliders.addCircle(x, z, 0.2, 5, false);
        }
      }

      const north = clamp((-cz - 140) / 210, 0, 1);
      const hm = 0.5 + 1.0 * north + rnd() * 0.35;
      if (cx === -70 && cz === -350) {
        pocketPark(cx, cz, false);
        tvTower(cx, cz);
        continue;
      }
      const nw = cx < -100 && cz < -100;
      const r = rnd();
      if (nw && r < 0.75) {
        const n = rnd() < 0.5 ? 2 : 3;
        const spots = n === 2 ? [[-10, 8], [11, -9]] : [[-12, 11], [12, 10], [0, -12]];
        for (const [ox, oz] of spots) apartment(cx + ox, cz + oz, 15, 17, 62 + rnd() * 45 * (0.6 + hm * 0.5));
        lawn(cx + 14, cz - 14, 12, 10);
        continue;
      }
      if (r < 0.13) {
        pocketPark(cx, cz, rnd() < 0.7);
        continue;
      }
      const kind = r < 0.68 ? 'glass' : 'office';
      const layout = rnd();
      if (layout < 0.35) {
        const w = 24 + rnd() * 10, d = 24 + rnd() * 10;
        tower(cx, cz, w, d, (60 + rnd() * 80) * hm, kind);
        lawn(cx, cz + 17, 30, 6);
      } else if (layout < 0.7) {
        const vertical = rnd() < 0.5;
        for (const sgn of [-1, 1]) {
          const ox = vertical ? sgn * 11 : 0, oz = vertical ? 0 : sgn * 11;
          const w = vertical ? 17 : 30, d = vertical ? 30 : 17;
          tower(cx + ox, cz + oz, w, d, (40 + rnd() * 70) * hm, rnd() < 0.7 ? kind : 'office');
        }
      } else {
        for (const [ox, oz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
          if (rnd() < 0.2) {
            lawn(cx + ox, cz + oz, 16, 16);
            continue;
          }
          tower(cx + ox, cz + oz, 15, 15, (30 + rnd() * 60) * hm, rnd() < 0.75 ? kind : 'glass');
        }
      }
    }
  }

  // ---- road markings ----
  const roadLines = [];
  for (let k = 0; k <= 11; k++) roadLines.push(-385 + PITCH * k);
  const noMarking = (x, z) => (Math.abs(x) < PARK && Math.abs(z) < PARK) || Math.abs(x) > CITY - 2 || Math.abs(z) > CITY - 2;
  const markY = 0.015;
  for (const a of roadLines) {
    for (let m = 0; m < roadLines.length - 1; m++) {
      const z0 = roadLines[m] + 12, z1 = roadLines[m + 1] - 12;
      if (noMarking(a, (z0 + z1) / 2)) continue;
      for (let z = z0; z < z1; z += 6) {
        flatRect(B.marks, a, markY, z + 1.5, 0.2, 3, WHITE);
        flatRect(B.marks, z + 1.5, markY, a, 3, 0.2, WHITE);
      }
    }
    for (const b of roadLines) {
      for (const sgn of [-1, 1]) {
        if (!noMarking(a, b + sgn * 9.5)) {
          for (let s = -5.25; s <= 5.3; s += 1.5) flatRect(B.marks, a + s, markY, b + sgn * 9.5, 0.7, 3, WHITE);
        }
        if (!noMarking(b + sgn * 9.5, a)) {
          for (let s = -5.25; s <= 5.3; s += 1.5) flatRect(B.marks, b + sgn * 9.5, markY, a + s, 3, 0.7, WHITE);
        }
      }
    }
  }

  // ---- meshes ----
  const glassMat = new THREE.MeshStandardMaterial({ map: glassTexture(5), vertexColors: true, metalness: 0.5, roughness: 0.07, envMapIntensity: 1.25 });
  const officeMat = new THREE.MeshStandardMaterial({ map: officeTexture(6), vertexColors: true, metalness: 0.2, roughness: 0.28 });
  const apartMat = new THREE.MeshStandardMaterial({ map: apartmentTexture(7), vertexColors: true, roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  const slabMat = new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.85 });
  const lawnTex = grassDetailTexture();
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x86d64a, map: lawnTex, roughness: 0.95 });
  const markMat = new THREE.MeshStandardMaterial({ color: 0xf2f6f8, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x4fd0ef, roughness: 0.04, metalness: 0.3, envMapIntensity: 1.4 });
  const add = (b, mat, cast = true) => {
    if (!b.count) return;
    const mesh = new THREE.Mesh(b.build(), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  add(B.glass, glassMat);
  add(B.office, officeMat);
  add(B.apart, apartMat);
  add(B.trim, trimMat);
  add(B.roof, roofMat);
  add(B.slab, slabMat, false);
  add(B.lawn, lawnMat, false);
  add(B.marks, markMat, false);
  add(B.pool, poolMat, false);
  return { materials: { glassMat, officeMat, apartMat } };
}
