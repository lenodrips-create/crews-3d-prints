import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE, WATER_Y } from './layout.js';
import { softDotTexture } from './textures.js';

// The lake: a real mirror reflection, rippled and tinted, plus a fountain.

const WaterShader = {
  name: 'AeroWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    time: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    deep: { value: new THREE.Color(0x1f8fa8) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform vec3 deep;
    uniform vec3 sunDir;
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec2 p = vWorld.xz;
      vec2 w = vec2(
        sin(p.x * 0.55 + time * 1.1 + p.y * 0.25) + 0.5 * sin(p.x * 2.3 - time * 1.9 + p.y * 1.1) + 0.15 * sin(p.y * 4.7 + time * 2.6),
        cos(p.y * 0.6 - time * 0.9 + p.x * 0.2) + 0.5 * cos(p.y * 2.1 + time * 1.7 - p.x * 0.9) + 0.15 * cos(p.x * 5.1 - time * 2.4)
      );
      vec4 uv = vUv;
      uv.xy += w * 0.0032 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.35 + 0.65 * pow(1.0 - max(V.y, 0.0), 3.0);
      vec3 base = mix(deep, color, 0.5 + 0.5 * V.y);
      vec3 col = mix(base, refl, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
      vec3 n = normalize(vec3(-w.x * 0.06, 1.0, -w.y * 0.06));
      vec3 r = reflect(-V, n);
      float spec = pow(max(dot(r, normalize(sunDir)), 0.0), 240.0);
      col += vec3(1.0, 0.98, 0.9) * spec * 2.5;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class Lake {
  constructor(scene, sunDir, resolutionScale = 0.5) {
    const geo = new THREE.PlaneGeometry(LAKE.rx * 2 + 40, LAKE.rz * 2 + 40);
    this.scale = resolutionScale;
    this.mirror = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: Math.max(256, window.innerWidth * resolutionScale),
      textureHeight: Math.max(256, window.innerHeight * resolutionScale),
      color: 0x5fd0e6,
      shader: WaterShader,
      multisample: 0,
    });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.set(LAKE.cx, WATER_Y, LAKE.cz);
    this.mirror.material.uniforms.sunDir.value = sunDir;
    const reflect = this.mirror.onBeforeRender;
    this.mirror.onBeforeRender = function (renderer, ...rest) {
      const auto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      reflect.call(this, renderer, ...rest);
      renderer.shadowMap.autoUpdate = auto;
    };
    scene.add(this.mirror);
    this.fountain = new Fountain(scene, new THREE.Vector3(LAKE.cx - 30, WATER_Y, LAKE.cz - 4));
  }

  setResolution(scale) {
    this.scale = scale;
    this.resize();
  }

  resize() {
    this.mirror.getRenderTarget().setSize(Math.max(256, window.innerWidth * this.scale), Math.max(256, window.innerHeight * this.scale));
  }

  update(dt, t) {
    this.mirror.material.uniforms.time.value = t;
    this.fountain.update(dt);
  }
}

class Fountain {
  constructor(scene, origin) {
    this.origin = origin;
    this.jets = [{ x: 0, z: 0, up: 15, spread: 0.6, share: 0.4 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.jets.push({ x: Math.cos(a) * 4, z: Math.sin(a) * 4, up: 7.5, spread: 0.35, out: [Math.cos(a) * 1.2, Math.sin(a) * 1.2], share: 0.075 });
    }
    this.N = 2000;
    this.p = new Float32Array(this.N * 3);
    this.v = new Float32Array(this.N * 3);
    this.age = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.reset(i, Math.random() * 2.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.8, map: softDotTexture(), transparent: true, depthWrite: false, opacity: 0.85, color: 0xf4fdff, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), new THREE.MeshBasicMaterial({ map: softDotTexture(), transparent: true, opacity: 0.7, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.copy(origin).add(new THREE.Vector3(0, 0.03, 0));
    scene.add(foam);
  }

  reset(i, age = 0) {
    let r = Math.random(), jet = this.jets[0];
    for (const j of this.jets) {
      if (r < j.share) { jet = j; break; }
      r -= j.share;
    }
    const o = this.origin;
    this.p[i * 3] = o.x + jet.x;
    this.p[i * 3 + 1] = o.y;
    this.p[i * 3 + 2] = o.z + jet.z;
    this.v[i * 3] = (jet.out ? jet.out[0] : 0) + (Math.random() - 0.5) * jet.spread;
    this.v[i * 3 + 1] = jet.up * (0.85 + Math.random() * 0.2);
    this.v[i * 3 + 2] = (jet.out ? jet.out[1] : 0) + (Math.random() - 0.5) * jet.spread;
    this.age[i] = 0;
    if (age > 0) this.step(i, age);
  }

  step(i, dt) {
    this.v[i * 3 + 1] -= 9.8 * dt;
    this.p[i * 3] += this.v[i * 3] * dt;
    this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
    this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    this.age[i] += dt;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    for (let i = 0; i < this.N; i++) {
      this.step(i, dt);
      if (this.p[i * 3 + 1] < this.origin.y) this.reset(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
