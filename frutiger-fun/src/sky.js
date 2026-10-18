import * as THREE from 'three';
import { cloudTexture, starburstDataURL } from './textures.js';
import { mulberry32, clamp } from './util.js';

// Saturated aero sky with a hot white sun, drifting cumulus, and a lens flare
// drawn over the canvas.

export const SKY_COLORS = {
  top: new THREE.Color(0x0b74de),
  mid: new THREE.Color(0x2fb6f6),
  horizon: new THREE.Color(0xdaf5ff),
  ground: new THREE.Color(0xcdeaf3),
};

export function makeSkyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDir: { value: sunDir },
      top: { value: SKY_COLORS.top },
      mid: { value: SKY_COLORS.mid },
      horizon: { value: SKY_COLORS.horizon },
      ground: { value: SKY_COLORS.ground },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, top, mid, horizon, ground;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col;
        if (h > 0.0) {
          float t = pow(h, 0.5);
          col = mix(horizon, mid, smoothstep(0.0, 0.42, t));
          col = mix(col, top, smoothstep(0.38, 1.0, t));
        } else {
          col = mix(horizon, ground, smoothstep(0.0, -0.08, h));
        }
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.98, 0.92) * (pow(s, 5.0) * 0.22 + pow(s, 48.0) * 0.55 + pow(s, 700.0) * 7.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class Sky {
  constructor(scene, sunDir) {
    this.sunDir = sunDir;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), makeSkyMaterial(sunDir));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // clouds
    this.clouds = new THREE.Group();
    const textures = [cloudTexture(37), cloudTexture(53), cloudTexture(71)];
    const rnd = mulberry32(5);
    const place = (azimuth, dist, height, width) => {
      const mat = new THREE.SpriteMaterial({ map: textures[Math.floor(rnd() * 3)], transparent: true, depthWrite: false, fog: false, opacity: 0.96 });
      const s = new THREE.Sprite(mat);
      s.position.set(Math.cos(azimuth) * dist, height, Math.sin(azimuth) * dist);
      s.scale.set(width, width * 0.5, 1);
      s.userData = { azimuth, dist, speed: 0.002 + rnd() * 0.003 };
      this.clouds.add(s);
    };
    for (let i = 0; i < 30; i++) place(rnd() * Math.PI * 2, 700 + rnd() * 1200, 160 + rnd() * 420, 260 + rnd() * 420);
    // a bank of big cumulus low behind the skyline, like a postcard
    for (let i = 0; i < 9; i++) place(-Math.PI / 2 + (rnd() - 0.5) * 1.6, 1200 + rnd() * 500, 70 + rnd() * 110, 520 + rnd() * 380);
    scene.add(this.clouds);
  }

  update(dt, camera) {
    this.dome.position.copy(camera.position);
    for (const c of this.clouds.children) {
      const u = c.userData;
      u.azimuth += u.speed * dt * 0.1;
      c.position.x = Math.cos(u.azimuth) * u.dist + camera.position.x * 0.9;
      c.position.z = Math.sin(u.azimuth) * u.dist + camera.position.z * 0.9;
    }
  }
}

// Lens flare as DOM elements over the canvas. The sun's starburst plus a trail
// of soft ghosts through the centre of the screen.
export class LensFlare {
  constructor(root, colliders) {
    this.root = root;
    this.colliders = colliders;
    this.vis = 0;
    this.burst = document.createElement('div');
    this.burst.className = 'flare-burst';
    this.burst.style.backgroundImage = `url(${starburstDataURL()})`;
    root.appendChild(this.burst);
    this.ghosts = [
      [0.35, 0.14, 'ghost-green'], [0.62, 0.05, 'ghost-ring'], [0.85, 0.08, 'ghost-blue'],
      [1.18, 0.2, 'ghost-rainbow'], [1.45, 0.04, 'ghost-green'], [1.7, 0.11, 'ghost-blue'],
    ].map(([t, size, cls]) => {
      const el = document.createElement('div');
      el.className = 'flare-ghost ' + cls;
      root.appendChild(el);
      return { el, t, size };
    });
    this.veil = document.createElement('div');
    this.veil.className = 'flare-veil';
    root.appendChild(this.veil);
    this._v = new THREE.Vector3();
  }

  update(dt, camera, sunDir, enabled = true) {
    const W = window.innerWidth, H = window.innerHeight;
    const p = this._v.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    const inFront = p.z < 1 && Math.abs(p.x) < 1.25 && Math.abs(p.y) < 1.25;
    const blocked = !inFront || this.colliders.rayBlocked(camera.position, sunDir, 1500);
    const target = enabled && !blocked ? 1 : 0;
    this.vis += (target - this.vis) * (1 - Math.exp(-dt * 8));
    const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
    const edge = clamp(1.25 - Math.max(Math.abs(p.x), Math.abs(p.y)), 0, 1);
    const v = this.vis * Math.min(1, edge * 2.5);
    this.root.style.opacity = v.toFixed(3);
    if (v < 0.01) return;
    const bs = H * 0.62;
    this.burst.style.transform = `translate(${sx - bs / 2}px, ${sy - bs / 2}px)`;
    this.burst.style.width = this.burst.style.height = bs + 'px';
    const cx = W / 2, cy = H / 2;
    for (const g of this.ghosts) {
      const gx = sx + (cx - sx) * g.t * 2, gy = sy + (cy - sy) * g.t * 2;
      const s = H * g.size * 2;
      g.el.style.transform = `translate(${gx - s / 2}px, ${gy - s / 2}px)`;
      g.el.style.width = g.el.style.height = s + 'px';
    }
    const centred = clamp(1 - Math.hypot(p.x, p.y) / 1.2, 0, 1);
    this.veil.style.opacity = (centred * 0.35).toFixed(3);
  }
}
