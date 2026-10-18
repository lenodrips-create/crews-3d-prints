import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, lerp } from './util.js';
import { hairTexture } from './textures.js';

// "Aero", the player character: a glossy, toy-like figure in white, aqua and
// lime with big white headphones.
//
// If assets/character.glb exists (for example the Sketchfab "Frutiger Aero
// Character V2" exported as glTF), it is loaded and used instead.

const mat = {
  jacket: new THREE.MeshPhysicalMaterial({ color: 0xf6fbff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  aqua: new THREE.MeshPhysicalMaterial({ color: 0x12c2f2, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
  lime: new THREE.MeshPhysicalMaterial({ color: 0x86df2e, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 }),
  skin: new THREE.MeshPhysicalMaterial({ color: 0xffd8c4, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  hair: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  denim: new THREE.MeshPhysicalMaterial({ color: 0x94c8ee, roughness: 0.5, clearcoat: 0.4 }),
  eye: new THREE.MeshPhysicalMaterial({ color: 0x132544, roughness: 0.08, clearcoat: 1 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cheek: new THREE.MeshBasicMaterial({ color: 0xff8fae, transparent: true, opacity: 0.5, depthWrite: false }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x9a3a4a, roughness: 0.5 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x9cff5a, emissive: 0x7cf03a, emissiveIntensity: 1.2 }),
};

function part(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.state = { speed: 0, grounded: true, vy: 0, wave: false };
    this.phase = 0;
    this.amp = 0;
    this.air = 0;
    this.waveAmt = 0;
    this.time = 0;
    this.nextBlink = 2.5;
    this.blinkT = -1;
    this.mixer = null;
    this.buildProcedural();
  }

  buildProcedural() {
    mat.hair.map ??= hairTexture();
    const model = (this.model = new THREE.Group());
    this.root.add(model);
    const S = (r, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);
    const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 18);

    const hips = (this.hips = pivot(model, 0, 0.74, 0));
    part(hips, S(0.16), mat.denim, 0, 0.02, 0, 1.12, 0.78, 0.86);

    const torso = (this.torso = pivot(hips, 0, 0.06, 0));
    part(torso, Cap(0.19, 0.19), mat.jacket, 0, 0.2, 0, 1.14, 1, 0.82);
    part(torso, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), mat.lime, 0, 0.02, 0, 1.03, 1, 0.82);
    part(torso, new THREE.BoxGeometry(0.026, 0.34, 0.02), mat.aqua, 0, 0.23, 0.153);
    const collar = part(torso, new THREE.TorusGeometry(0.1, 0.034, 10, 24), mat.aqua, 0, 0.44, 0);
    collar.rotation.x = Math.PI / 2;
    const badge = part(torso, new THREE.CylinderGeometry(0.036, 0.036, 0.012, 20), mat.lime, 0.085, 0.31, 0.15);
    badge.rotation.x = Math.PI / 2 - 0.25;
    part(torso, new THREE.CylinderGeometry(0.055, 0.06, 0.1, 14), mat.skin, 0, 0.48, 0);

    // head
    const head = (this.head = pivot(torso, 0, 0.52, 0));
    part(head, S(0.23, 36, 28), mat.skin, 0, 0.2, 0, 1, 0.97, 0.96);
    const hairCap = part(head, new THREE.SphereGeometry(0.256, 40, 22, 0, Math.PI * 2, 0, 1.86), mat.hair, 0, 0.21, -0.018);
    hairCap.rotation.x = -0.6;
    // a wavy fringe
    for (const [x, y, z, s, rz] of [[-0.14, 0.31, 0.15, 0.9, 0.5], [-0.055, 0.33, 0.19, 1, 0.15], [0.05, 0.33, 0.19, 1, -0.2], [0.14, 0.31, 0.15, 0.9, -0.5]]) {
      const fringe = part(head, S(0.078, 18, 12), mat.hair, x, y, z, 1.3 * s, 0.72 * s, 0.8 * s);
      fringe.rotation.z = rz;
    }
    // side locks in front of the headphones, spikes at the nape
    for (const sx of [-1, 1]) {
      const lock = part(head, new THREE.ConeGeometry(0.05, 0.17, 12), mat.hair, sx * 0.19, 0.16, 0.1);
      lock.rotation.set(Math.PI - 0.15, 0, sx * 0.2);
    }
    for (const [x, y, z, rz] of [[-0.1, 0.06, -0.18, 0.5], [0, 0.03, -0.2, 0], [0.1, 0.06, -0.18, -0.5]]) {
      const spike = part(head, new THREE.ConeGeometry(0.07, 0.2, 12), mat.hair, x, y, z);
      spike.rotation.set(2.55, 0, rz);
    }
    const tuft = part(head, new THREE.ConeGeometry(0.05, 0.17, 12), mat.hair, 0.03, 0.47, -0.03);
    tuft.rotation.set(-0.55, 0, -0.4);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = part(head, S(0.042, 20, 16), mat.eye, sx * 0.082, 0.2, 0.203, 0.85, 1.25, 0.5);
      this.eyes.push(eye);
      part(eye, S(0.013, 10, 8), mat.shine, 0.014, 0.016, 0.036);
      part(head, S(0.04, 14, 10), mat.cheek, sx * 0.135, 0.125, 0.178, 1, 0.62, 0.25);
      const brow = part(head, new THREE.CapsuleGeometry(0.008, 0.045, 4, 8), mat.hair, sx * 0.085, 0.275, 0.205);
      brow.rotation.z = Math.PI / 2 + sx * 0.15;
    }
    const mouth = part(head, new THREE.TorusGeometry(0.034, 0.009, 8, 18, Math.PI), mat.mouth, 0, 0.122, 0.218);
    mouth.rotation.z = Math.PI;
    // headphones
    part(head, new THREE.TorusGeometry(0.27, 0.022, 10, 40, Math.PI), mat.jacket, 0, 0.19, -0.01);
    for (const sx of [-1, 1]) {
      const cup = part(head, new THREE.CylinderGeometry(0.088, 0.088, 0.075, 28), mat.jacket, sx * 0.248, 0.19, 0);
      cup.rotation.z = Math.PI / 2;
      const capm = part(head, new THREE.CylinderGeometry(0.062, 0.062, 0.014, 24), mat.aqua, sx * 0.288, 0.19, 0);
      capm.rotation.z = Math.PI / 2;
      const ring = part(head, new THREE.TorusGeometry(0.066, 0.009, 8, 28), mat.glow, sx * 0.29, 0.19, 0);
      ring.rotation.y = Math.PI / 2;
    }

    // arms (+x is the character's left)
    this.arms = [];
    for (const sx of [1, -1]) {
      const shoulder = pivot(torso, sx * 0.235, 0.4, 0);
      part(shoulder, S(0.082, 16, 12), mat.jacket, 0, 0, 0);
      part(shoulder, Cap(0.073, 0.15), mat.jacket, 0, -0.145, 0);
      const stripe = part(shoulder, new THREE.TorusGeometry(0.075, 0.013, 8, 20), mat.lime, 0, -0.1, 0);
      stripe.rotation.x = Math.PI / 2;
      const elbow = pivot(shoulder, 0, -0.29, 0);
      part(elbow, S(0.069, 14, 10), mat.jacket, 0, 0, 0);
      part(elbow, Cap(0.066, 0.12), mat.jacket, 0, -0.11, 0);
      part(elbow, new THREE.CylinderGeometry(0.074, 0.074, 0.055, 18), mat.aqua, 0, -0.21, 0);
      part(elbow, S(0.074, 16, 12), mat.skin, 0, -0.29, 0.005, 1, 1.1, 0.9);
      this.arms.push({ shoulder, elbow, side: sx });
    }

    // legs
    this.legs = [];
    for (const sx of [1, -1]) {
      const hip = pivot(hips, sx * 0.095, -0.02, 0);
      part(hip, Cap(0.094, 0.19), mat.denim, 0, -0.18, 0);
      const knee = pivot(hip, 0, -0.36, 0);
      part(knee, S(0.086, 14, 10), mat.denim, 0, 0, 0);
      part(knee, Cap(0.084, 0.19), mat.denim, 0, -0.16, 0);
      const foot = pivot(knee, 0, -0.33, 0);
      const shoe = part(foot, Cap(0.08, 0.12), mat.jacket, 0, -0.025, 0.045, 1.05, 1, 0.8);
      shoe.rotation.x = Math.PI / 2;
      part(foot, new THREE.BoxGeometry(0.17, 0.035, 0.29), mat.lime, 0, -0.085, 0.045);
      part(foot, new THREE.BoxGeometry(0.17, 0.03, 0.12), mat.aqua, 0, -0.035, -0.01);
      this.legs.push({ hip, knee, side: sx });
    }
  }

  // Swap in a glTF model if one is provided. Resolves true when it loaded.
  async tryLoadModel(url) {
    if (location.protocol === 'file:') return false;
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) return false;
      const gltf = await new GLTFLoader().loadAsync(url);
      const obj = gltf.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.75 / (size.y || 1);
      obj.scale.setScalar(s);
      obj.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
      obj.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      this.root.remove(this.model);
      this.model = new THREE.Group();
      this.model.add(obj);
      this.root.add(this.model);
      this.hips = null;
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(obj);
        const find = (re) => gltf.animations.find((a) => re.test(a.name));
        this.clips = {
          idle: find(/idle|stand/i) ?? gltf.animations[0],
          walk: find(/walk/i),
          run: find(/run|jog/i),
        };
        this.actions = {};
        for (const [k, clip] of Object.entries(this.clips)) {
          if (!clip) continue;
          const a = this.mixer.clipAction(clip);
          a.play();
          a.setEffectiveWeight(k === 'idle' ? 1 : 0);
          this.actions[k] = a;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  update(dt) {
    this.time += dt;
    const st = this.state;
    if (!this.hips) return this.updateLoaded(dt);
    const t = this.time;
    const k = 1 - Math.exp(-dt * 10);
    const run = clamp((st.speed - 4.5) / 3.5, 0, 1);
    const targetAmp = st.grounded ? clamp(st.speed / 4, 0, 1) * lerp(0.6, 0.85, run) : 0;
    this.amp = lerp(this.amp, targetAmp, k);
    this.air = lerp(this.air, st.grounded ? 0 : 1, 1 - Math.exp(-dt * 12));
    this.waveAmt = lerp(this.waveAmt, st.wave ? 1 : 0, 1 - Math.exp(-dt * 5));
    if (st.speed > 0.15 && st.grounded) this.phase += dt * (st.speed * 2.1 + 1.2) / (1 + run * 0.35);
    else this.phase = lerp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, k * 0.5);

    const sw = Math.sin(this.phase), a = this.amp, air = this.air;
    const breathe = Math.sin(t * 2.2);
    this.hips.position.y = 0.74 + Math.abs(Math.cos(this.phase)) * 0.045 * a - 0.025 * a + breathe * 0.004;
    this.torso.rotation.x = run * 0.2 + a * 0.05 - air * 0.1;
    this.torso.rotation.y = sw * 0.13 * a;
    this.torso.scale.y = 1 + breathe * 0.008;
    this.head.rotation.y = -sw * 0.08 * a + (1 - a) * Math.sin(t * 0.45) * 0.18 * (1 - this.waveAmt);
    this.head.rotation.x = -run * 0.14 + Math.sin(t * 0.7) * 0.03;
    this.head.rotation.z = this.waveAmt * 0.12;

    for (const leg of this.legs) {
      const s = leg.side;
      const swing = -sw * s * a * 0.95;
      leg.hip.rotation.x = swing - air * 0.55 * (s > 0 ? 1 : 0.4);
      leg.knee.rotation.x = Math.max(0, Math.sin(this.phase * 1 + (s > 0 ? 0 : Math.PI) + 1.3)) * a * 1.35 + air * (s > 0 ? 1.1 : 0.5);
    }
    for (const arm of this.arms) {
      const s = arm.side;
      const swing = sw * s * a * 0.85;
      const wave = s < 0 ? this.waveAmt : 0;
      arm.shoulder.rotation.x = lerp(swing - air * 0.4, -0.25, wave);
      arm.shoulder.rotation.z = lerp(s * (0.1 + 0.03 * Math.sin(t * 1.3)) + s * air * 1.0, -2.55, wave);
      arm.elbow.rotation.x = lerp(-0.25 - a * 0.55, 0, wave);
      arm.elbow.rotation.z = wave * (Math.sin(t * 8) * 0.45 - 0.15);
    }

    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      lid = Math.abs(1 - this.blinkT / 0.07);
      if (this.blinkT > 0.14) { this.blinkT = -1; lid = 1; }
    }
    for (const e of this.eyes) e.scale.y = 1.25 * Math.max(0.08, lid);
  }

  updateLoaded(dt) {
    if (!this.mixer) {
      this.model.position.y = Math.abs(Math.sin(this.time * this.state.speed * 1.5)) * 0.05;
      return;
    }
    const sp = this.state.speed;
    const w = { idle: clamp(1 - sp / 2, 0, 1), walk: clamp(1 - Math.abs(sp - 3.5) / 3, 0, 1), run: clamp((sp - 4) / 3, 0, 1) };
    if (!this.actions.run) w.walk = Math.max(w.walk, w.run);
    if (!this.actions.walk) w.idle = 1;
    const sum = Object.keys(this.actions).reduce((s, k2) => s + w[k2], 0) || 1;
    for (const [k2, act] of Object.entries(this.actions)) act.setEffectiveWeight(w[k2] / sum);
    this.mixer.update(dt);
  }
}
