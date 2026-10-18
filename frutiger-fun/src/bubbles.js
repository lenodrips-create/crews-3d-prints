import * as THREE from 'three';
import { walkHeight } from './layout.js';

// Iridescent soap bubbles drifting up around the player. Touch one to pop it.

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aHue;
  varying vec3 vN;
  varying vec3 vV;
  varying float vAlpha;
  varying float vHue;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vAlpha = aAlpha;
    vHue = aHue;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform vec3 lightDir;
  varying vec3 vN;
  varying vec3 vV;
  varying float vAlpha;
  varying float vHue;
  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float rim = pow(f, 2.2);
    vec3 irid = hue(f * 1.3 + vHue + time * 0.04);
    vec3 col = mix(vec3(0.9, 0.98, 1.0), irid, 0.5) * (rim * 1.5 + 0.08);
    vec3 h = normalize(normalize(lightDir) + v);
    float spec = pow(max(dot(n, h), 0.0), 90.0);
    float spec2 = pow(max(dot(n, normalize(vec3(-0.4, -0.3, 0.8) + v)), 0.0), 40.0) * 0.3;
    col += vec3(1.0) * (spec * 1.8 + spec2);
    float a = clamp(rim * 0.85 + spec + spec2 + 0.05, 0.0, 1.0) * vAlpha;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Bubbles {
  constructor(scene, sunDir, count = 70) {
    this.count = count;
    const geo = new THREE.SphereGeometry(1, 28, 18);
    this.alpha = new Float32Array(count).fill(1);
    const hue = new Float32Array(count).map(() => Math.random());
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(hue, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: { time: { value: 0 }, lightDir: { value: sunDir } },
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.items = [];
    this.center = new THREE.Vector3();
    for (let i = 0; i < count; i++) this.items.push({ pos: new THREE.Vector3(), r: 0.5, phase: 0, rise: 0.5, pop: -1 });
    this.radius = 40;
    this.popped = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  spawn(b, initial) {
    const a = Math.random() * Math.PI * 2;
    const d = 4 + Math.sqrt(Math.random()) * this.radius;
    const x = this.center.x + Math.cos(a) * d, z = this.center.z + Math.sin(a) * d;
    const g = walkHeight(x, z);
    b.pos.set(x, g + (initial ? 0.6 + Math.random() * 14 : 0.3 + Math.random() * 2), z);
    b.r = 0.3 + Math.random() ** 2 * 1.1;
    b.phase = Math.random() * 10;
    b.rise = 0.35 + Math.random() * 0.6;
    b.pop = -1;
    b.ground = g;
  }

  reset(center) {
    this.center.copy(center);
    for (const b of this.items) this.spawn(b, true);
  }

  // target: the player's chest, or null when bubbles should not pop.
  update(dt, t, center, target, onPop) {
    this.center.copy(center);
    this.material.uniforms.time.value = t;
    for (let i = 0; i < this.count; i++) {
      const b = this.items[i];
      let scale = b.r, alpha = 1;
      if (b.pop >= 0) {
        b.pop += dt;
        const k = b.pop / 0.22;
        scale = b.r * (1 + k * 0.6);
        alpha = Math.max(0, 1 - k);
        if (k >= 1) this.spawn(b, false);
      } else {
        b.pos.y += b.rise * dt;
        b.pos.x += Math.sin(t * 0.7 + b.phase) * 0.35 * dt;
        b.pos.z += Math.cos(t * 0.6 + b.phase * 1.3) * 0.35 * dt;
        const far = Math.hypot(b.pos.x - center.x, b.pos.z - center.z) > this.radius + 15;
        if (b.pos.y > b.ground + 24 || far) this.spawn(b, false);
        // fade in near the ground, out near the top
        alpha = Math.min(1, (b.pos.y - b.ground) / 1.2, (b.ground + 24 - b.pos.y) / 4);
        if (target && b.pos.distanceTo(target) < b.r + 0.75) {
          b.pop = 0;
          this.popped++;
          onPop?.(b);
        }
      }
      const wob = 1 + Math.sin(t * 3 + b.phase) * 0.03;
      this._m.compose(b.pos, this._q, this._s.set(scale * wob, scale / wob, scale * wob));
      this.mesh.setMatrixAt(i, this._m);
      this.alpha[i] = Math.max(0, alpha);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
