import * as THREE from 'three';
import { walkHeight, isDeepWater, WORLD_LIMIT } from './layout.js';
import { clamp, lerp } from './util.js';

// Third-person controls: WASD / arrows to move, Shift to run, Space to jump,
// mouse to look (click to capture the pointer), wheel to zoom.

const WALK = 4.4, RUN = 9.5, JUMP = 6.4, GRAVITY = 19, RADIUS = 0.36;
const DEFLECT = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.jump = false;
    this.el = el;
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') this.jump = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el || this.dragging) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }
  consume() {
    const r = { dx: this.dx, dy: this.dy, wheel: this.wheel, jump: this.jump };
    this.dx = this.dy = this.wheel = 0;
    this.jump = false;
    return r;
  }
}

export class Player {
  constructor(character, camera, colliders, input, settings) {
    this.character = character;
    this.camera = camera;
    this.colliders = colliders;
    this.input = input;
    this.settings = settings;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = true;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camDist = 6.5;
    this.camPos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.onJump = null;
  }

  place(x, z, facing) {
    this.pos.set(x, walkHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.camYaw = facing + Math.PI;
    this.syncCharacter();
  }

  syncCharacter() {
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.facing;
  }

  // Where the camera wants to be for the current yaw / pitch / zoom.
  desiredCamera(out, target) {
    const cp = Math.cos(this.camPitch);
    out.set(
      target.x + Math.sin(this.camYaw) * cp * this.camDist,
      target.y + Math.sin(this.camPitch) * this.camDist,
      target.z + Math.cos(this.camYaw) * cp * this.camDist,
    );
    return out;
  }

  update(dt, active) {
    const inp = active ? this.input.consume() : { dx: 0, dy: 0, wheel: 0, jump: false };
    const sens = 0.0025 * this.settings.sensitivity;
    this.camYaw -= inp.dx * sens;
    this.camPitch = clamp(this.camPitch + inp.dy * sens * (this.settings.invertY ? -1 : 1), -0.6, 1.25);
    this.camDist = clamp(this.camDist + inp.wheel * 0.8, 2.5, 16);

    let ix = 0, iz = 0;
    if (active) {
      const k = this.input;
      if (k.down('KeyW', 'ArrowUp')) iz += 1;
      if (k.down('KeyS', 'ArrowDown')) iz -= 1;
      if (k.down('KeyA', 'ArrowLeft')) ix -= 1;
      if (k.down('KeyD', 'ArrowRight')) ix += 1;
    }
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const ml = Math.hypot(mx, mz);
    const running = active && this.input.down('ShiftLeft', 'ShiftRight');
    const speed = running ? RUN : WALK;
    if (ml > 0) { mx /= ml; mz /= ml; }
    const accel = this.grounded ? 14 : 4;
    const kk = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, mx * speed, kk);
    this.vel.z = lerp(this.vel.z, mz * speed, kk);

    if (inp.jump && this.grounded) {
      this.vel.y = JUMP;
      this.grounded = false;
      this.onJump?.();
    }
    this.vel.y -= GRAVITY * dt;

    // horizontal move; if the way is blocked by water (or a ledge), try
    // turning a little so we slide along the edge instead of sticking
    const p = this.pos;
    const ox = p.x, oz = p.z;
    const ok = (x, z) => !isDeepWater(x, z) && !(this.grounded && walkHeight(x, z) - p.y > 0.6);
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (dx * dx + dz * dz > 1e-10) {
      let moved = false;
      for (const a of DEFLECT) {
        const c = Math.cos(a), s = Math.sin(a);
        const x = clamp(p.x + (dx * c - dz * s) * c, -WORLD_LIMIT, WORLD_LIMIT);
        const z = clamp(p.z + (dx * s + dz * c) * c, -WORLD_LIMIT, WORLD_LIMIT);
        if (ok(x, z)) {
          p.x = x;
          p.z = z;
          moved = true;
          break;
        }
      }
      if (!moved) this.vel.x = this.vel.z = 0;
    }
    this.colliders.resolve(p, RADIUS);
    if (isDeepWater(p.x, p.z)) {
      p.x = ox;
      p.z = oz;
    }

    const ground = walkHeight(p.x, p.z);
    p.y += this.vel.y * dt;
    if (p.y <= ground || (this.grounded && p.y - ground < 0.35 && this.vel.y <= 0)) {
      p.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (ml > 0 && hs > 0.3) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-dt * 12));
    }
    this.syncCharacter();
    const st = this.character.state;
    st.speed = hs;
    st.grounded = this.grounded;
    st.vy = this.vel.y;
    st.wave = false;
  }

  updateCamera(dt, snap = false) {
    this.target.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const want = this.desiredCamera(new THREE.Vector3(), this.target);
    // pull in if a building is in the way
    const dir = want.clone().sub(this.target);
    const len = dir.length();
    dir.divideScalar(len);
    let free = len;
    for (let d = 0.6; d <= len; d += 0.4) {
      const x = this.target.x + dir.x * d, y = this.target.y + dir.y * d, z = this.target.z + dir.z * d;
      if (this.colliders.solidAt(x, y, z, 0.35)) { free = Math.max(0.8, d - 0.5); break; }
    }
    want.copy(this.target).addScaledVector(dir, free);
    const floor = walkHeight(want.x, want.z) + 0.4;
    if (want.y < floor) {
      if (dir.y < -0.05) {
        // keep the same view angle, just come closer
        const d = Math.max(1, (this.target.y - floor) / -dir.y);
        want.copy(this.target).addScaledVector(dir, Math.min(d, free));
      }
      want.y = Math.max(want.y, floor);
    }
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-dt * 14));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target);
  }
}
