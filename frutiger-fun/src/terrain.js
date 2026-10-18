import * as THREE from 'three';
import { PARK, CITY, terrainHeight, lakeDist, paths } from './layout.js';
import { fbm, valueNoise, clamp, lerp, mulberry32 } from './util.js';
import { grassDetailTexture, asphaltTexture, toTexture } from './textures.js';

// Ground meshes: the painted park terrain, the city's asphalt, and the open
// land beyond.

function withDetail(mat, detail, repeat, strength = 0.44) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform sampler2D detailMap;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dtl = texture2D(detailMap, vMapUv * ${repeat.toFixed(1)}).r;
        diffuseColor.rgb *= ${(1 - strength / 2).toFixed(3)} + ${strength.toFixed(3)} * dtl;`);
  };
  mat.customProgramCacheKey = () => 'detail' + repeat;
  return mat;
}

function paintPark(aoSpots) {
  const B = 768, S = 2048;
  const base = document.createElement('canvas');
  base.width = base.height = B;
  const bg = base.getContext('2d');
  const img = bg.createImageData(B, B);
  const lime = [124, 206, 52], deep = [72, 164, 46], mud = [150, 162, 104], bed = [52, 112, 98], walk = [222, 220, 212];
  for (let py = 0; py < B; py++) {
    for (let px = 0; px < B; px++) {
      const x = -PARK + ((px + 0.5) / B) * 2 * PARK;
      const z = -PARK + ((py + 0.5) / B) * 2 * PARK;
      const h = terrainHeight(x, z), d = lakeDist(x, z);
      const n = fbm(x * 0.018, z * 0.018, 3), n2 = valueNoise(x * 0.15, z * 0.15);
      const t = clamp(0.55 + n * 0.9 + h * 0.035 + n2 * 0.06, 0, 1);
      let c = [lerp(deep[0], lime[0], t), lerp(deep[1], lime[1], t), lerp(deep[2], lime[2], t)];
      if (d < 2.5) {
        const k = clamp((2.5 - d) / 3, 0, 1);
        c = c.map((v, i) => lerp(v, mud[i], k));
      }
      if (d < -1) {
        const k = clamp((-1 - d) / 4, 0, 1);
        c = c.map((v, i) => lerp(v, bed[i], k));
      }
      if (Math.max(Math.abs(x), Math.abs(z)) > PARK - 4.5) c = walk.slice();
      const o = (py * B + px) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  bg.putImageData(img, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(base, 0, 0, S, S);
  const k = S / (2 * PARK);
  const P = (v) => (v + PARK) * k;

  // soft shade under tree crowns
  for (const [x, z, r] of aoSpots) {
    const grad = g.createRadialGradient(P(x), P(z), 0, P(x), P(z), r * k * 1.1);
    grad.addColorStop(0, 'rgba(20,70,20,0.32)');
    grad.addColorStop(1, 'rgba(20,70,20,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(P(x), P(z), r * k * 1.1, 0, Math.PI * 2);
    g.fill();
  }

  g.lineJoin = 'round';
  g.lineCap = 'round';
  const stroke = (p, width, style) => {
    g.strokeStyle = style;
    g.lineWidth = width * k;
    g.beginPath();
    p.pts.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z))));
    if (p.closed) g.closePath();
    g.stroke();
  };
  for (const p of paths) stroke(p, p.width + 1.1, 'rgba(96,120,64,0.45)');
  for (const p of paths) stroke(p, p.width + 0.35, 'rgb(205,198,178)');
  for (const p of paths) stroke(p, p.width, p.kind === 'promenade' ? 'rgb(236,233,224)' : 'rgb(230,222,200)');
  // paving joints on the promenade
  const promenade = paths[0];
  g.strokeStyle = 'rgba(170,165,150,0.5)';
  g.lineWidth = 0.08 * k;
  for (let i = 0; i < promenade.pts.length; i += 1) {
    const [x0, z0] = promenade.pts[i], [x1, z1] = promenade.pts[(i + 1) % promenade.pts.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L, hw = promenade.width / 2;
    g.beginPath();
    g.moveTo(P(x0 + nx * hw), P(z0 + nz * hw));
    g.lineTo(P(x0 - nx * hw), P(z0 - nz * hw));
    g.stroke();
  }
  return canvas;
}

export function buildTerrain(scene, aoSpots) {
  const detail = grassDetailTexture();

  // park
  const seg = 256;
  const geo = new THREE.PlaneGeometry(2 * PARK, 2 * PARK, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const splat = toTexture(paintPark(aoSpots), { repeat: false });
  const parkMat = withDetail(new THREE.MeshStandardMaterial({ map: splat, roughness: 0.95 }), detail, 110, 0.6);
  const park = new THREE.Mesh(geo, parkMat);
  park.receiveShadow = true;
  scene.add(park);

  // asphalt between the park and the edge of the city
  const ring = (outer, inner) => {
    const s = new THREE.Shape();
    s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.closePath();
    const h = new THREE.Path();
    h.moveTo(-inner, -inner); h.lineTo(-inner, inner); h.lineTo(inner, inner); h.lineTo(inner, -inner); h.closePath();
    s.holes.push(h);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const asphalt = asphaltTexture();
  asphalt.repeat.set(1 / 7, 1 / 7);
  const road = new THREE.Mesh(ring(CITY, PARK), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 }));
  road.receiveShadow = true;
  scene.add(road);

  // open grass beyond the city
  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const gg = gc.getContext('2d');
  const rnd = mulberry32(3);
  gg.fillStyle = '#6cbf3a';
  gg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    gg.fillStyle = `rgba(${rnd() < 0.5 ? '150,215,80' : '60,140,40'},${0.15 + rnd() * 0.2})`;
    gg.beginPath();
    gg.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 20, 0, Math.PI * 2);
    gg.fill();
  }
  const grassTex = toTexture(gc);
  grassTex.repeat.set(1 / 40, 1 / 40);
  const outer = new THREE.Mesh(ring(4000, CITY), withDetail(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), detail, 13));
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  scene.add(outer);

  // far-off hills, mostly lost in the haze
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x86c76a, roughness: 1 });
  const hill = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hr = mulberry32(8);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hr() * 0.2;
    const r = 1150 + hr() * 500;
    const m = new THREE.Mesh(hill, hillMat);
    m.position.set(Math.cos(a) * r, -5, Math.sin(a) * r);
    m.scale.set(220 + hr() * 260, 60 + hr() * 120, 220 + hr() * 260);
    scene.add(m);
  }
}
