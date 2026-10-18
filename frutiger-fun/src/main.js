import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Colliders } from './physics.js';
import { Foliage } from './nature.js';
import { Props } from './props.js';
import { populatePark, MENU } from './park.js';
import { buildCity } from './city.js';
import { buildTerrain } from './terrain.js';
import { Sky, LensFlare, SKY_COLORS, makeSkyMaterial } from './sky.js';
import { Lake } from './water.js';
import { Bubbles } from './bubbles.js';
import { Character } from './character.js';
import { Player, Input } from './player.js';
import { AeroAudio } from './audio.js';
import { UI } from './ui.js';
import { clamp } from './util.js';
import { bridge } from './layout.js';

const SETTINGS_KEY = 'frutiger-fun-settings';
const DEFAULTS = { quality: 'high', music: 0.6, sfx: 0.8, sensitivity: 1, invertY: false, showFps: false };

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // private mode: settings just won't stick
  }
}

// A touch more saturation and a soft vignette, for that glossy postcard look.
const GradeShader = {
  name: 'AeroGrade',
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.12 }, vignette: { value: 0.22 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, saturation), 0.0);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, 1.0 - vignette, smoothstep(0.42, 0.95, d));
      gl_FragColor = c;
    }`,
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const ease = (t) => t * t * (3 - 2 * t);

class Game {
  constructor() {
    this.settings = loadSettings();
    this.audio = new AeroAudio(this.settings);
    this.ui = new UI(this);
    this.canvas = document.getElementById('scene');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setSize(innerWidth, innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_COLORS.horizon.clone(), 260, 1700);
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.15, 8000);
    this.sunDir = new THREE.Vector3(-0.5, 0.5, 0.56).normalize();

    this.hemi = new THREE.HemisphereLight(0xdcf4ff, 0xa6d47c, 1.9);
    this.sun = new THREE.DirectionalLight(0xfff5e2, 2.3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -75;
    sc.right = sc.top = 75;
    sc.near = 1;
    sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.state = 'loading';
    this.time = 0;
    this.stateTime = 0;
    this.clock = new THREE.Clock();
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.focus = new THREE.Vector3();
    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && this.hadLock) this.pause();
      this.hadLock = !!document.pointerLockElement;
      this.ui.hint(this.state === 'playing' && !document.pointerLockElement);
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !document.pointerLockElement) this.canvas.requestPointerLock?.();
    });
  }

  async build() {
    const step = async (f, text) => {
      this.ui.progress(f, text);
      await nextFrame();
    };
    await step(0.04, 'Painting the sky…');
    this.colliders = new Colliders();
    this.foliage = new Foliage();
    this.props = new Props();
    this.sky = new Sky(this.scene, this.sunDir);
    await step(0.14, 'Planting the park…');
    const ao = populatePark(this);
    await step(0.32, 'Raising the skyline…');
    buildCity(this.scene, this);
    await step(0.52, 'Rolling out the hills…');
    buildTerrain(this.scene, ao);
    await step(0.68, 'Building the boardwalk…');
    this.props.boardwalk();
    this.props.build(this.scene);
    this.foliage.build(this.scene);
    await step(0.78, 'Filling the lake…');
    this.lake = new Lake(this.scene, this.sunDir, 0.5);
    this.bubbles = new Bubbles(this.scene, this.sunDir, 70);
    this.character = new Character();
    this.scene.add(this.character.root);
    await this.character.tryLoadModel('assets/character.glb');
    this.input = new Input(this.canvas);
    this.player = new Player(this.character, this.camera, this.colliders, this.input, this.settings);
    this.player.onJump = () => this.audio.jump();
    this.flare = new LensFlare(document.getElementById('flare'), this.colliders);
    await step(0.88, 'Polishing the glass…');
    this.buildEnvironment();
    this.setupComposer();
    this.applyQuality();
    this.enterMenu(true);
    this.renderer.compile(this.scene, this.camera);
    await step(1, 'Ready!');
  }

  buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial(this.sunDir)));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 32), new THREE.MeshBasicMaterial({ color: 0x86bf74 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8;
    env.add(ground);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.02, 0.1, 500).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
  }

  setupComposer() {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
  }

  applyQuality() {
    const high = this.settings.quality === 'high';
    const pr = Math.min(devicePixelRatio || 1, high ? 1.75 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    const size = high ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.lake.setResolution(high ? 0.5 : 0.3);
    this.useComposer = high;
  }

  settingsChanged(key) {
    saveSettings(this.settings);
    if (key === 'quality') this.applyQuality();
    if (key === 'music' || key === 'sfx') this.audio.applyVolumes();
    if (key === 'showFps' && !this.settings.showFps) this.ui.setFps('');
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyQuality();
    this.lake.resize();
  }

  // ---- states ----

  menuCamera(t, outPos, outLook) {
    const { spot, f, right } = MENU;
    const sway = Math.sin(t * 0.09) * 0.5;
    outPos.copy(spot).addScaledVector(f, -4.6).addScaledVector(right, -1.8 + sway);
    outPos.y = spot.y + 1.4 + Math.sin(t * 0.13) * 0.08;
    outLook.copy(outPos).addScaledVector(f, 100).addScaledVector(right, sway * 2);
    outLook.y += 8.5;
  }

  enterMenu(first = false) {
    this.state = 'menu';
    this.stateTime = 0;
    const { spot, f, right } = MENU;
    this.player.place(spot.x, spot.z, 0);
    const cam = new THREE.Vector3(), look = new THREE.Vector3();
    this.menuCamera(0, cam, look);
    const toCam = new THREE.Vector3(cam.x - spot.x, 0, cam.z - spot.z).normalize().addScaledVector(right, -0.35);
    this.player.facing = Math.atan2(toCam.x, toCam.z);
    this.player.syncCharacter();
    this.character.state.speed = 0;
    this.character.state.grounded = true;
    this.bubbles.reset(spot.clone().addScaledVector(f, 10));
    if (!first) this.ui.show('menu');
  }

  startPlay() {
    if (this.state !== 'menu') return;
    this.audio.whoosh();
    this.state = 'intro';
    this.stateTime = 0;
    this.introFrom = { pos: this.camera.position.clone(), look: this.menuLookNow.clone() };
    const { along } = MENU;
    this.player.facing = Math.atan2(along.x, along.z);
    this.player.camYaw = this.player.facing + Math.PI;
    this.player.camPitch = 0.22;
    this.player.camDist = 6.5;
    this.player.syncCharacter();
    this.ui.show('hud');
    this.ui.hint(true);
    this.ui.helpFade(false);
    clearTimeout(this.helpTimer);
    this.helpTimer = setTimeout(() => this.ui.helpFade(true), 12000);
    this.bubbles.popped = 0;
    this.ui.setCount(0);
    this.canvas.requestPointerLock?.();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show('hud');
    this.canvas.requestPointerLock?.();
  }

  toMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.fade(true);
    setTimeout(() => {
      this.enterMenu();
      this.ui.fade(false);
    }, 450);
  }

  quit() {
    this.ui.fade(true);
    setTimeout(() => {
      this.state = 'goodbye';
      this.ui.show('goodbye');
      this.ui.fade(false);
    }, 450);
  }

  // ---- frame ----

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    this.stateTime += dt;
    this.step(dt);
    this.render();
    if (this.settings.showFps) {
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime > 0.5) {
        this.ui.setFps(Math.round(this.fpsFrames / this.fpsTime) + ' fps');
        this.fpsFrames = this.fpsTime = 0;
      }
    }
  }

  step(dt) {
    const t = this.time;
    const p = this.player;
    const st = this.state;
    if (st === 'menu' || st === 'goodbye') {
      const cam = this.camera.position, look = (this.menuLookNow ??= new THREE.Vector3());
      this.menuCamera(this.stateTime, cam, look);
      this.camera.lookAt(look);
      this.character.state.wave = st === 'menu' && (this.stateTime % 9) > 1.2 && (this.stateTime % 9) < 4.6;
      this.focus.copy(MENU.spot);
    } else if (st === 'intro') {
      const k = ease(clamp(this.stateTime / 1.4, 0, 1));
      p.update(dt, false);
      p.updateCamera(dt, true);
      const toPos = this.camera.position.clone();
      const toLook = p.target.clone();
      this.camera.position.lerpVectors(this.introFrom.pos, toPos, k);
      this.camera.lookAt(new THREE.Vector3().lerpVectors(this.introFrom.look, toLook, k));
      p.camPos.copy(toPos);
      if (k >= 1) {
        this.state = 'playing';
        this.input.consume();
      }
      this.focus.copy(p.pos);
    } else if (st === 'playing') {
      p.update(dt, true);
      p.updateCamera(dt);
      this.focus.copy(p.pos);
    } else if (st === 'paused') {
      p.updateCamera(dt);
    }

    this.character.update(st === 'paused' ? 0 : dt);
    this.foliage.update(t);
    this.sky.update(dt, this.camera);
    this.lake.update(dt, t);
    const chest = st === 'playing' ? p.pos.clone().add(new THREE.Vector3(0, 1, 0)) : null;
    this.bubbles.update(st === 'paused' ? 0 : dt, t, st === 'menu' ? MENU.spot.clone().addScaledVector(MENU.f, 10) : this.focus, chest, () => {
      this.audio.pop();
      this.ui.setCount(this.bubbles.popped);
    });

    // keep the sun's shadow box centred on the action
    const sun = this.sun;
    sun.target.position.copy(this.focus);
    sun.position.copy(this.focus).addScaledVector(this.sunDir, 250);

    this.flare.update(dt, this.camera, this.sunDir, st !== 'loading');

    if (st === 'menu') {
      const head = this.character.root.position.clone().add(new THREE.Vector3(0, 2.05, 0)).project(this.camera);
      const x = (head.x * 0.5 + 0.5) * innerWidth, y = (-head.y * 0.5 + 0.5) * innerHeight;
      this.ui.placeSpeech(x + 10, y, this.character.state.wave);
    }
  }

  render() {
    if (this.useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  run() {
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // For tools (screenshots, debugging): stop the loop and step time by hand.
  freeze() {
    this.running = false;
  }

  advance(seconds, fps = 30, render = true) {
    const dt = 1 / fps;
    for (let t = 0; t < seconds; t += dt) {
      this.time += dt;
      this.stateTime += dt;
      this.step(dt);
    }
    if (render) this.render();
  }
}

async function main() {
  const game = new Game();
  window.frutigerFun = game;
  game.bridgeSamples = bridge.samples;
  try {
    await game.build();
  } catch (err) {
    console.error(err);
    game.ui.progress(1, 'Sorry, this browser could not start the game (WebGL 2 is needed).');
    return;
  }
  game.ui.show('menu');
  game.clock.getDelta();
  game.run();
}

main();
