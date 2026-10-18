import * as THREE from 'three';

// Collects triangles from many small parts so a whole district can be drawn
// with one mesh per material.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const WHITE = new THREE.Color(1, 1, 1);

// Polygon helpers. Points are [x, z] pairs.
export function rectPts(cx, cz, w, d) {
  const hw = w / 2, hd = d / 2;
  return [[cx - hw, cz + hd], [cx + hw, cz + hd], [cx + hw, cz - hd], [cx - hw, cz - hd]];
}

export function circlePts(cx, cz, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -(i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

export function roundedRectPts(cx, cz, w, d, r, seg = 4) {
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  const hw = w / 2 - r, hd = d / 2 - r;
  const corners = [[hw, hd, 0], [hw, -hd, -Math.PI / 2], [-hw, -hd, -Math.PI], [-hw, hd, Math.PI / 2]];
  const pts = [];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (-Math.PI / 2) + Math.PI / 2;
      pts.push([cx + ox + Math.cos(a) * r, cz + oz + Math.sin(a) * r]);
    }
  }
  return pts;
}

function orient(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    s += x0 * z1 - x1 * z0;
  }
  return s > 0 ? pts.slice().reverse() : pts;
}

// Vertical walls around a polygon, with world-scaled UVs so window textures
// line up on any footprint, plus an optional flat roof.
export function addPrism(b, pts, y0, y1, color, o = {}) {
  pts = orient(pts);
  const n = pts.length;
  const tileW = o.tileW ?? 12, tileH = o.tileH ?? 14.4;
  const uOff = o.uOff ?? 0, vOff = o.vOff ?? 0, yBase = o.yBase ?? y0;
  const segN = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    segN.push([-(z1 - z0) / L, (x1 - x0) / L, L]);
  }
  let acc = 0;
  const v0 = (y0 - yBase) / tileH + vOff, v1 = (y1 - yBase) / tileH + vOff;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
    const [nx, nz, L] = segN[i];
    let ax = nx, az = nz, bx = nx, bz = nz;
    if (o.smooth) {
      // only blend with neighbours of similar length, so the flat sides of a
      // rounded rectangle stay flat and just its corners are smooth
      const p = segN[(i - 1 + n) % n], q = segN[(i + 1) % n];
      const similar = (m) => Math.max(L, m[2]) / Math.min(L, m[2]) < 1.8;
      if (similar(p)) {
        ax = nx + p[0]; az = nz + p[1];
        const la = Math.hypot(ax, az) || 1;
        ax /= la; az /= la;
      }
      if (similar(q)) {
        bx = nx + q[0]; bz = nz + q[1];
        const lb = Math.hypot(bx, bz) || 1;
        bx /= lb; bz /= lb;
      }
    }
    const u0 = acc / tileW + uOff, u1 = (acc + L) / tileW + uOff;
    acc += L;
    const A = b.vert(x0, y0, z0, ax, 0, az, u0, v0, color);
    const B = b.vert(x1, y0, z1, bx, 0, bz, u1, v0, color);
    const C = b.vert(x1, y1, z1, bx, 0, bz, u1, v1, color);
    const D = b.vert(x0, y1, z0, ax, 0, az, u0, v1, color);
    b.quad(A, B, C, D);
  }
  if (o.roof !== false) {
    const rb = o.roofBuilder ?? b;
    const rc = o.roofColor ?? color;
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= n; cz /= n;
    const C = rb.vert(cx, y1, cz, 0, 1, 0, cx / 8, cz / 8, rc);
    const ring = pts.map(([x, z]) => rb.vert(x, y1, z, 0, 1, 0, x / 8, z / 8, rc));
    for (let i = 0; i < n; i++) rb.tri(C, ring[i], ring[(i + 1) % n]);
  }
  return acc;
}

// Pointed roof over a polygon.
export function addPyramid(b, pts, y0, h, color) {
  pts = orient(pts);
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= n; cz /= n;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
    const e1 = new THREE.Vector3(x1 - x0, 0, z1 - z0);
    const e2 = new THREE.Vector3(cx - x0, h, cz - z0);
    const nn = e1.clone().cross(e2).normalize();
    const A = b.vert(x0, y0, z0, nn.x, nn.y, nn.z, 0, 0, color);
    const B = b.vert(x1, y0, z1, nn.x, nn.y, nn.z, 1, 0, color);
    const T = b.vert(cx, y0 + h, cz, nn.x, nn.y, nn.z, 0.5, 1, color);
    b.tri(A, B, T);
  }
}

const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

// Axis box (optionally turned about Y by `yaw`).
export function addBox(b, cx, cy, cz, sx, sy, sz, color = WHITE, yaw = 0, uvScale = 1) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const rot = (x, z) => [x * cs + z * sn, -x * sn + z * cs];
  const half = [sx / 2, sy / 2, sz / 2];
  for (const [nrm, u, v] of FACES) {
    const hn = Math.abs(nrm[0]) * half[0] + Math.abs(nrm[1]) * half[1] + Math.abs(nrm[2]) * half[2];
    const hu = Math.abs(u[0]) * half[0] + Math.abs(u[1]) * half[1] + Math.abs(u[2]) * half[2];
    const hv = Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2];
    const [rnx, rnz] = rot(nrm[0], nrm[2]);
    const ids = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = nrm[0] * hn + u[0] * hu * su + v[0] * hv * sv;
      const ly = nrm[1] * hn + u[1] * hu * su + v[1] * hv * sv;
      const lz = nrm[2] * hn + u[2] * hu * su + v[2] * hv * sv;
      const [rx, rz] = rot(lx, lz);
      ids.push(b.vert(cx + rx, cy + ly, cz + rz, rnx, nrm[1], rnz,
        ((su + 1) / 2) * hu * 2 * uvScale, ((sv + 1) / 2) * hv * 2 * uvScale, color));
    }
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

// A tube through `points` (Vector3[]) with per-point radii. Used for trunks,
// branches, logs and ropes.
export function addTube(b, points, radii, segs, color, uvLen = 1) {
  const n = points.length;
  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], c = points[Math.min(n - 1, i + 1)];
    tangents.push(c.clone().sub(a).normalize());
  }
  let normal = new THREE.Vector3(0, 1, 0);
  if (Math.abs(tangents[0].y) > 0.9) normal.set(1, 0, 0);
  normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
  const rings = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    normal.sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
    const bin = t.clone().cross(normal).normalize();
    if (i > 0) dist += points[i].distanceTo(points[i - 1]);
    const ring = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const dx = normal.x * Math.cos(a) + bin.x * Math.sin(a);
      const dy = normal.y * Math.cos(a) + bin.y * Math.sin(a);
      const dz = normal.z * Math.cos(a) + bin.z * Math.sin(a);
      const r = radii[i];
      const p = points[i];
      ring.push(b.vert(p.x + dx * r, p.y + dy * r, p.z + dz * r, dx, dy, dz, j / segs, dist / uvLen, color));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < segs; j++) {
      b.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
    }
  }
}

export function addCylinder(b, p0, p1, r0, r1, segs, color, uvLen = 1) {
  addTube(b, [p0, p1], [r0, r1], segs, color, uvLen);
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

// Append any three.js geometry, moved by `matrix`.
export function addGeometry(b, geom, matrix, color = WHITE) {
  const pos = geom.attributes.position, nor = geom.attributes.normal, uv = geom.attributes.uv;
  _nm.getNormalMatrix(matrix);
  const base = b.count;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
    b.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, color);
  }
  if (geom.index) {
    for (let i = 0; i < geom.index.count; i++) b.idx.push(base + geom.index.getX(i));
  } else {
    for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
  }
}
