import { SpatialGrid } from './util.js';

// Solid things the player bumps into, and the shapes that can hide the sun.
export class Colliders {
  constructor() {
    this.grid = new SpatialGrid(16);
    this.occluders = [];
    this._q = [];
  }

  addBox(minX, minZ, maxX, maxZ, h = 100) {
    const c = { type: 'box', minX, minZ, maxX, maxZ, h };
    this.grid.insert(c, minX, minZ, maxX, maxZ);
    this.occluders.push(c);
    return c;
  }

  addCircle(x, z, r, h = 100, occludes = true) {
    const c = { type: 'circle', x, z, r, h };
    this.grid.insert(c, x - r, z - r, x + r, z + r);
    if (occludes) this.occluders.push(c);
    return c;
  }

  // Tree crowns: no collision, but they hide the sun.
  addCanopy(x, y, z, r) {
    this.occluders.push({ type: 'sphere', x, y, z, r });
  }

  // Push a circle of `radius` at pos (Vector3, uses x/z) out of anything solid.
  resolve(pos, radius) {
    let hit = false;
    for (const c of this.grid.query(pos.x, pos.z, radius + 2, this._q)) {
      if (pos.y > c.h) continue;
      if (c.type === 'circle') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min && d > 1e-6) {
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
          hit = true;
        }
      } else {
        const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * radius;
            pos.z = nz + (dz / d) * radius;
          } else {
            // centre is inside the box: leave by the nearest side
            const exits = [
              [pos.x - c.minX + radius, -1, 0], [c.maxX - pos.x + radius, 1, 0],
              [pos.z - c.minZ + radius, 0, -1], [c.maxZ - pos.z + radius, 0, 1],
            ].sort((a, b) => a[0] - b[0]);
            pos.x += exits[0][1] * exits[0][0];
            pos.z += exits[0][2] * exits[0][0];
          }
          hit = true;
        }
      }
    }
    return hit;
  }

  // Is the point inside a building? Used to keep the camera out of walls.
  solidAt(x, y, z, pad = 0.3) {
    for (const c of this.grid.query(x, z, pad + 1, this._q)) {
      if (y > c.h) continue;
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      } else if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
        return true;
      }
    }
    return false;
  }

  // Does a ray from `o` along unit `d` hit anything within `maxDist`?
  rayBlocked(o, d, maxDist = 900) {
    for (const c of this.occluders) {
      if (c.type === 'sphere') {
        const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
        const t = ox * d.x + oy * d.y + oz * d.z;
        if (t < 0 || t > maxDist) continue;
        const px = ox - d.x * t, py = oy - d.y * t, pz = oz - d.z * t;
        if (px * px + py * py + pz * pz < c.r * c.r) return true;
      } else {
        let minX, maxX, minZ, maxZ;
        if (c.type === 'circle') {
          minX = c.x - c.r * 0.8; maxX = c.x + c.r * 0.8; minZ = c.z - c.r * 0.8; maxZ = c.z + c.r * 0.8;
        } else {
          ({ minX, maxX, minZ, maxZ } = c);
        }
        if (rayAabb(o, d, minX, 0, minZ, maxX, c.h, maxZ, maxDist)) return true;
      }
    }
    return false;
  }
}

function rayAabb(o, d, x0, y0, z0, x1, y1, z1, maxDist) {
  let tmin = 0, tmax = maxDist;
  const axes = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [p, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let t0 = (lo - p) / v, t1 = (hi - p) / v;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tmin = Math.max(tmin, t0);
      tmax = Math.min(tmax, t1);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
