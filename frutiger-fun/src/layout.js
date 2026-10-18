import * as THREE from 'three';
import { fbm, smoothstep, clamp, SpatialGrid, distToSegment } from './util.js';

// The map: a lake park in the middle of a grid of city blocks.
//
//   - Park: the square |x|,|z| < PARK, rolling hills around a lake.
//   - City: blocks 56 m square on a 70 m grid out to CITY, 14 m roads between.
//   - Beyond the city: open grass fading into haze.
//
// North is -z. Downtown (the tallest towers) is north of the lake.

export const PARK = 168;
export const CITY = 392;
export const BLOCK = 56;
export const PITCH = 70;
export const SLAB_H = 0.15;
export const WATER_Y = -0.45;
export const LAKE = { cx: 0, cz: -20, rx: 92, rz: 52 };

export const blockCenters = [];
for (let i = 0; i <= 10; i++) blockCenters.push(-350 + PITCH * i);

export function isParkBlock(cx, cz) {
  return Math.abs(cx) < PARK && Math.abs(cz) < PARK;
}

function lakeK(th) {
  return 1 + 0.07 * Math.sin(3 * th + 0.8) + 0.05 * Math.sin(5 * th + 2.1) + 0.03 * Math.sin(7 * th + 0.3);
}

// Signed distance to the shore in metres (negative in the water).
export function lakeDist(x, z) {
  const dx = (x - LAKE.cx) / LAKE.rx, dz = (z - LAKE.cz) / LAKE.rz;
  const r = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  const R = Math.hypot(Math.cos(th) * LAKE.rx, Math.sin(th) * LAKE.rz);
  return (r - lakeK(th)) * R;
}

export function lakePoint(th, offset = 0) {
  const k = lakeK(th);
  const R = Math.hypot(Math.cos(th) * LAKE.rx, Math.sin(th) * LAKE.rz);
  const s = (k * R + offset) / (k * R);
  return [LAKE.cx + Math.cos(th) * k * LAKE.rx * s, LAKE.cz + Math.sin(th) * k * LAKE.rz * s];
}

export function terrainHeight(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > PARK || az > PARK) return 0;
  const edge = smoothstep(PARK - 4, PARK - 34, ax) * smoothstep(PARK - 4, PARK - 34, az);
  const d = lakeDist(x, z);
  let hills = (fbm(x * 0.0075 + 3.1, z * 0.0075 - 1.7, 4) * 0.5 + 0.5) * 8;
  hills += 9 * Math.exp(-((x + 100) ** 2 + (z - 100) ** 2) / (2 * 42 * 42));
  hills += 5 * Math.exp(-((x - 110) ** 2 + (z + 110) ** 2) / (2 * 34 * 34));
  hills *= edge * smoothstep(5, 48, d);
  let h = hills;
  if (d < 6) h -= smoothstep(6, -14, d) * 3.6;
  return h;
}

// ---- paths -----------------------------------------------------------------

function sampleCurve(pts2, closed, step) {
  const curve = new THREE.CatmullRomCurve3(pts2.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  const n = Math.max(8, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}

const loopCtrl = [];
for (let i = 0; i < 40; i++) loopCtrl.push(lakePoint((i / 40) * Math.PI * 2, 10));

function snapToLoop(pts) {
  const [lx, lz] = pts[pts.length - 1];
  let best = null, bd = Infinity;
  for (const p of loopCtrl) {
    const d = Math.hypot(p[0] - lx, p[1] - lz);
    if (d < bd) { bd = d; best = p; }
  }
  return [...pts, best];
}

export const paths = [
  { kind: 'promenade', width: 5.5, pts: sampleCurve(loopCtrl, true, 1.5), closed: true },
  { kind: 'walk', width: 4.5, hedges: true, fence: true, pts: sampleCurve(snapToLoop([[4, 170], [-8, 140], [12, 108], [2, 78]]), false, 1.5) },
  { kind: 'walk', width: 4.5, hedges: true, pts: sampleCurve(snapToLoop([[22, -170], [14, -132], [2, -104]]), false, 1.5) },
  { kind: 'walk', width: 4, pts: sampleCurve(snapToLoop([[-170, 30], [-140, 38], [-120, 14]]), false, 1.5) },
  { kind: 'walk', width: 4, pts: sampleCurve(snapToLoop([[170, 64], [140, 58], [114, 42]]), false, 1.5) },
  { kind: 'walk', width: 3.6, hedges: true, fence: true, pts: sampleCurve(snapToLoop([[-150, 152], [-120, 122], [-96, 98], [-74, 70]]), false, 1.5) },
  { kind: 'walk', width: 3.6, fence: true, pts: sampleCurve(snapToLoop([[140, -150], [112, -118], [92, -84]]), false, 1.5) },
];

const pathGrid = new SpatialGrid(10);
for (const p of paths) {
  const n = p.pts.length;
  for (let i = 0; i < n - 1 + (p.closed ? 1 : 0); i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % n];
    const seg = { a, b, hw: p.width / 2 };
    pathGrid.insert(seg, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
  }
}
const _q = [];
// Distance to the nearest path edge (negative when standing on a path).
export function pathDist(x, z) {
  let best = 99;
  for (const s of pathGrid.query(x, z, 12, _q)) {
    best = Math.min(best, distToSegment(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) - s.hw);
  }
  return best;
}

// ---- boardwalk -------------------------------------------------------------

export const BRIDGE_HALF_W = 1.7;
const bridgeEnds = [lakePoint(0.62, 7), lakePoint(-0.72, 7)];
const bridgeCtrl = [[0, 0], [0.25, -6], [0.5, 3], [0.75, -5], [1, 0]].map(([t, off]) => [
  bridgeEnds[0][0] + (bridgeEnds[1][0] - bridgeEnds[0][0]) * t + off,
  bridgeEnds[0][1] + (bridgeEnds[1][1] - bridgeEnds[0][1]) * t,
]);
const bridgeCurve = new THREE.CatmullRomCurve3(bridgeCtrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
export const bridge = { samples: [] };
{
  const n = 220;
  const pts = bridgeCurve.getSpacedPoints(n);
  const yA = terrainHeight(pts[0].x, pts[0].z) + 0.28;
  const yB = terrainHeight(pts[n].x, pts[n].z) + 0.28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pts[i];
    const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
    const dir = new THREE.Vector2(q.x - o.x, q.z - o.z).normalize();
    const y = Math.max(0.3, (1 - t) * yA + t * yB + Math.sin(Math.PI * t) * 0.45);
    bridge.samples.push({ x: p.x, z: p.z, y, dx: dir.x, dz: dir.y, t });
  }
  bridge.length = bridgeCurve.getLength();
}

// Deck height at (x, z), or null when not on the boardwalk.
export function bridgeHeight(x, z) {
  if (x < 56 || x > 90 || z < -72 || z > 34) return null;
  let best = null, bd = Infinity;
  for (const s of bridge.samples) {
    const d = (x - s.x) ** 2 + (z - s.z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return Math.sqrt(bd) <= BRIDGE_HALF_W ? best.y : null;
}

// ---- ground queries --------------------------------------------------------

export function onBlockSlab(x, z) {
  if (Math.abs(x) > CITY || Math.abs(z) > CITY) return false;
  const ix = Math.round((x + 350) / PITCH), iz = Math.round((z + 350) / PITCH);
  if (ix < 0 || ix > 10 || iz < 0 || iz > 10) return false;
  const cx = blockCenters[ix], cz = blockCenters[iz];
  if (isParkBlock(cx, cz)) return false;
  return Math.abs(x - cx) <= BLOCK / 2 && Math.abs(z - cz) <= BLOCK / 2;
}

export function groundHeight(x, z) {
  if (Math.abs(x) < PARK && Math.abs(z) < PARK) return terrainHeight(x, z);
  return onBlockSlab(x, z) ? SLAB_H : 0;
}

export function walkHeight(x, z) {
  const g = groundHeight(x, z);
  const b = bridgeHeight(x, z);
  return b !== null ? Math.max(g, b) : g;
}

// Deep water you cannot walk into (the boardwalk is the way across).
export function isDeepWater(x, z) {
  if (Math.abs(x) > PARK || Math.abs(z) > PARK) return false;
  if (terrainHeight(x, z) > WATER_Y - 0.3) return false;
  return bridgeHeight(x, z) === null;
}

export const WORLD_LIMIT = CITY + 30;
export const clampToWorld = (v) => clamp(v, -WORLD_LIMIT, WORLD_LIMIT);
