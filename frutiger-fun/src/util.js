// Small math helpers shared by the world builders.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 2D value noise in [-1, 1].
export function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq + i * 17.3, z * freq - i * 9.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Distance from point (px, pz) to segment (ax, az)-(bx, bz).
export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// Uniform grid for quick "what is near (x, z)" lookups.
export class SpatialGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }
  insert(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const k = this.key(ix, iz);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(item);
      }
    }
  }
  query(x, z, radius, out = []) {
    const c = this.cell;
    out.length = 0;
    const seen = new Set();
    for (let ix = Math.floor((x - radius) / c); ix <= Math.floor((x + radius) / c); ix++) {
      for (let iz = Math.floor((z - radius) / c); iz <= Math.floor((z + radius) / c); iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const item of list) {
          if (!seen.has(item)) {
            seen.add(item);
            out.push(item);
          }
        }
      }
    }
    return out;
  }
}
