import * as THREE from 'three';
import { PARK, paths, pathDist, lakeDist, lakePoint, terrainHeight, bridge } from './layout.js';
import { fbm, valueNoise, mulberry32 } from './util.js';
import { leafTint } from './nature.js';

// Fills the lake park: trees, hedgerows along the walks, rope fences, pink
// azaleas by the water, reeds, rocks, benches and lamps.

// The menu shot: Aero on the north end of the boardwalk, looking out past the
// lake towards downtown. The big tree is placed to frame it on the right.
export const MENU = (() => {
  const s = bridge.samples[Math.round((bridge.samples.length - 1) * 0.86)];
  const spot = new THREE.Vector3(s.x, s.y, s.z);
  const f = new THREE.Vector3(-30 - s.x, 0, -340 - s.z).normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x);
  const along = new THREE.Vector3(s.dx, 0, s.dz).normalize();
  return { spot, f, right, along };
})();

export const HERO_TREE = (() => {
  const p = MENU.spot.clone().addScaledVector(MENU.f, 13).addScaledVector(MENU.right, 8);
  for (let k = 0; k < 40 && (lakeDist(p.x, p.z) < 11 || pathDist(p.x, p.z) < 4); k++) p.addScaledVector(MENU.f, 1.5);
  return { x: p.x, z: p.z };
})();

function nearBridge(x, z, pad) {
  if (x < 50 || x > 100 || z < -80 || z > 40) return false;
  for (let i = 0; i < bridge.samples.length; i += 3) {
    const s = bridge.samples[i];
    if (Math.hypot(x - s.x, z - s.z) < pad) return true;
  }
  return false;
}

export function populatePark({ foliage, colliders, props }) {
  const rnd = mulberry32(777);
  const ao = [];
  const TAU = Math.PI * 2;
  const tree = (x, z, s, v) => {
    const y = terrainHeight(x, z) - 0.15;
    const tv = foliage.addTree(x, y, z, s, v, rnd() * TAU, leafTint(rnd));
    colliders.addCircle(x, z, tv.trunkR * s + 0.15, 5, false);
    colliders.addCanopy(x, y + tv.canopyY * s, z, tv.canopyR * s * 0.85);
    ao.push([x, z, tv.canopyR * s]);
  };
  const clearOf = (x, z, pathPad, lakePad = 5) =>
    lakeDist(x, z) > lakePad && pathDist(x, z) > pathPad && !nearBridge(x, z, 6) &&
    Math.hypot(x - HERO_TREE.x, z - HERO_TREE.z) > 12;

  // the big tree that frames the menu shot
  tree(HERO_TREE.x, HERO_TREE.z, 1.15, 4);

  // a row of trees just inside the park fence
  for (let t = -PARK + 10; t <= PARK - 10; t += 11) {
    for (const [x, z] of [[t, -PARK + 9], [t, PARK - 9], [-PARK + 9, t], [PARK - 9, t]]) {
      const jx = x + (rnd() - 0.5) * 3, jz = z + (rnd() - 0.5) * 3;
      if (pathDist(jx, jz) < 3) continue;
      tree(jx, jz, 0.85 + rnd() * 0.3, Math.floor(rnd() * 3));
    }
  }

  // groves and lone trees
  for (let gx = -PARK + 22; gx < PARK - 20; gx += 8) {
    for (let gz = -PARK + 22; gz < PARK - 20; gz += 8) {
      const x = gx + (rnd() - 0.5) * 7, z = gz + (rnd() - 0.5) * 7;
      if (!clearOf(x, z, 3)) continue;
      const n = fbm(x * 0.014 + 7, z * 0.014 - 3, 3);
      const p = n > 0.18 ? 0.55 : n > 0.05 ? 0.12 : 0.025;
      if (rnd() > p) continue;
      const big = rnd() < 0.12;
      tree(x, z, big ? 1 + rnd() * 0.2 : 0.8 + rnd() * 0.4, big ? 4 : Math.floor(rnd() * 3));
    }
  }

  // hedgerows and rope fences along the walks
  for (const p of paths) {
    if (!p.hedges && !p.fence) continue;
    const n = p.pts.length;
    let prev = [null, null];
    for (let i = 1; i < n - 1; i++) {
      const [x0, z0] = p.pts[i - 1], [x1, z1] = p.pts[i + 1];
      const [x, z] = p.pts[i];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      if (Math.max(Math.abs(x), Math.abs(z)) > PARK - 8) continue;
      [-1, 1].forEach((side, si) => {
        if (p.hedges && i % 2 === 0) {
          const off = p.width / 2 + 1.5 + rnd() * 0.4;
          const bx = x + nx * side * off, bz = z + nz * side * off;
          if (lakeDist(bx, bz) > 3 && pathDist(bx, bz) > 0.7 && valueNoise(i * 0.09, side * 3) > -0.45) {
            const s = 0.95 + rnd() * 0.45;
            foliage.addBush(bx, terrainHeight(bx, bz) - 0.2, bz, s, rnd() * TAU, new THREE.Color(1, 1, 1).multiplyScalar(0.92 + rnd() * 0.16));
            colliders.addCircle(bx, bz, 0.85 * s, 1.6, false);
          }
        }
        if (p.fence && i % 3 === 0) {
          const off = p.width / 2 + 0.35;
          const fx = x + nx * side * off, fz = z + nz * side * off;
          if (lakeDist(fx, fz) > 2 && pathDist(fx, fz) > 0.2) {
            const top = props.fencePost(fx, terrainHeight(fx, fz), fz);
            if (prev[si] && prev[si].distanceTo(top) < 6) props.ropeBetween(prev[si], top);
            prev[si] = top;
          } else {
            prev[si] = null;
          }
        }
      });
    }
  }

  // promenade: azaleas on the water side, benches and lamps on the land side
  const prom = paths[0];
  for (let i = 0; i < prom.pts.length; i++) {
    const [x, z] = prom.pts[i];
    const [x1, z1] = prom.pts[(i + 1) % prom.pts.length];
    const L = Math.hypot(x1 - x, z1 - z) || 1;
    let nx = -(z1 - z) / L, nz = (x1 - x) / L;
    if (lakeDist(x + nx * 3, z + nz * 3) > lakeDist(x - nx * 3, z - nz * 3)) { nx = -nx; nz = -nz; }
    if (nearBridge(x, z, 9)) continue;
    // nx, nz now point towards the water
    if (i % 2 === 0 && valueNoise(i * 0.045, 1.7) > 0.05) {
      const off = prom.width / 2 + 1.3 + rnd() * 0.6;
      const bx = x + nx * off, bz = z + nz * off;
      if (lakeDist(bx, bz) > 0.8) {
        const pink = new THREE.Color().setHSL(0.93 + rnd() * 0.06, 0.7, 0.62 + rnd() * 0.12).multiplyScalar(1.5);
        foliage.addBush(bx, terrainHeight(bx, bz) - 0.25, bz, 0.7 + rnd() * 0.35, rnd() * TAU, rnd() < 0.15 ? new THREE.Color(1.3, 1.25, 1.3) : pink, true);
      }
    }
    if (i % 26 === 13) {
      const off = prom.width / 2 + 0.8;
      const bx = x - nx * off, bz = z - nz * off;
      props.bench(bx, terrainHeight(bx, bz), bz, Math.atan2(nx, nz));
    }
    if (i % 22 === 0) {
      const off = prom.width / 2 + 0.5;
      const lx = x - nx * off, lz = z - nz * off;
      props.lamp(lx, terrainHeight(lx, lz), lz);
      colliders.addCircle(lx, lz, 0.2, 5, false);
    }
  }

  // azalea beds around the menu spot by the boardwalk
  for (let i = 0; i < 26; i++) {
    const th = -0.98 + rnd() * 0.5;
    const [x, z] = lakePoint(th, 1.5 + rnd() * 4);
    if (nearBridge(x, z, 2.5) || pathDist(x, z) < 0.6) continue;
    const pink = new THREE.Color().setHSL(0.92 + rnd() * 0.07, 0.75, 0.62 + rnd() * 0.12).multiplyScalar(1.5);
    foliage.addBush(x, terrainHeight(x, z) - 0.2, z, 0.6 + rnd() * 0.4, rnd() * TAU, pink, true);
  }

  // reeds and tall grass at the water's edge
  for (let i = 0; i < 9000; i++) {
    const th = rnd() * TAU;
    const [x, z] = lakePoint(th, -1.5 + rnd() * 4.5);
    if (valueNoise(th * 3.1, 4.2) < -0.25) continue;
    if (nearBridge(x, z, 2.2) || pathDist(x, z) < 0.4) continue;
    const s = 0.9 + rnd() * 0.9;
    foliage.addTuft(x, Math.max(terrainHeight(x, z), -0.6) - 0.05, z, s * 1.1, rnd() * TAU, s * (1 + rnd() * 0.5));
  }
  // wild grass in the meadows
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() * 2 - 1) * (PARK - 6), z = (rnd() * 2 - 1) * (PARK - 6);
    if (fbm(x * 0.03, z * 0.03, 2) < 0.12 || lakeDist(x, z) < 4 || pathDist(x, z) < 0.6) continue;
    const s = 0.55 + rnd() * 0.45;
    foliage.addTuft(x, terrainHeight(x, z) - 0.05, z, s, rnd() * TAU);
  }

  // rocks along the north shore
  for (let th = -Math.PI; th < 0; th += 0.025) {
    if (valueNoise(th * 2.3, 9.1) < 0.05) continue;
    const [x, z] = lakePoint(th, 0.4 + rnd() * 1.6);
    if (nearBridge(x, z, 3)) continue;
    foliage.addRock(x, terrainHeight(x, z) - 0.15, z, 0.35 + rnd() * 0.7, rnd() * TAU);
  }

  // lamps along the park's edge walk
  for (let t = -PARK + 20; t <= PARK - 20; t += 40) {
    for (const [x, z] of [[t, -PARK + 3], [t, PARK - 3], [-PARK + 3, t], [PARK - 3, t]]) {
      props.lamp(x, terrainHeight(x, z), z);
      colliders.addCircle(x, z, 0.2, 5, false);
    }
  }

  return ao;
}
