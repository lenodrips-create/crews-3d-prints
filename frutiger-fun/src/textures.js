import * as THREE from 'three';
import { mulberry32 } from './util.js';

// Every texture in the game is painted here on a canvas, so the game needs no
// image files and runs straight from disk.

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(c, { repeat = true, color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Curtain-wall glass: 4 x 4 panels per tile, one floor per row.
export function glassTexture(seed = 1) {
  const S = 512, C = 128;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * C, y = row * C;
      const k = 0.9 + rnd() * 0.2;
      const grad = g.createLinearGradient(x, y, x + C * 0.3, y + C);
      grad.addColorStop(0, `rgb(${178 * k},${226 * k},${255})`);
      grad.addColorStop(0.55, `rgb(${92 * k},${170 * k},${232 * k})`);
      grad.addColorStop(1, `rgb(${52 * k},${118 * k},${196 * k})`);
      g.fillStyle = grad;
      g.fillRect(x, y, C, C);
      // a soft diagonal reflection on some panes
      if (rnd() < 0.6) {
        g.save();
        g.globalAlpha = 0.1 + rnd() * 0.18;
        g.fillStyle = '#ffffff';
        g.beginPath();
        const o = rnd() * C;
        g.moveTo(x + o, y);
        g.lineTo(x + o + 26, y);
        g.lineTo(x + o - 30, y + C);
        g.lineTo(x + o - 56, y + C);
        g.closePath();
        g.clip();
        g.fillRect(x, y, C, C);
        g.restore();
      }
    }
  }
  // spandrels (floor slabs) and mullions
  for (let row = 0; row < 4; row++) {
    g.fillStyle = 'rgba(70,120,170,0.55)';
    g.fillRect(0, row * C + C - 10, S, 10);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(0, row * C + C - 10, S, 1);
  }
  g.fillStyle = 'rgba(234,244,251,0.8)';
  for (let col = 0; col < 8; col++) g.fillRect(col * (C / 2) - (col % 2 ? 1 : 2), 0, col % 2 ? 2 : 4, S);
  return toTexture(c);
}

// White residential tower: punched windows with balconies.
export function apartmentTexture(seed = 2) {
  const S = 512, C = 128;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#eef1f4';
  g.fillRect(0, 0, S, S);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * C, y = row * C;
      g.fillStyle = '#dde3e8';
      g.fillRect(x, y, 5, C);
      const k = 0.85 + rnd() * 0.3;
      const grad = g.createLinearGradient(x, y + 20, x, y + 94);
      grad.addColorStop(0, `rgb(${150 * k},${186 * k},${214 * k})`);
      grad.addColorStop(1, `rgb(${58 * k},${88 * k},${120 * k})`);
      g.fillStyle = '#ffffff';
      g.fillRect(x + 14, y + 16, 102, 82);
      g.fillStyle = grad;
      g.fillRect(x + 18, y + 20, 94, 74);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + 18, y + 20, 94, 10);
      g.fillStyle = '#ffffff';
      g.fillRect(x + 64, y + 20, 3, 74);
      if (rnd() < 0.35) {
        g.fillStyle = `rgba(245,240,226,${0.5 + rnd() * 0.4})`;
        g.fillRect(x + 20 + (rnd() < 0.5 ? 0 : 48), y + 22, 44, 70);
      }
      // balcony slab and its shadow
      g.fillStyle = '#fbfcfd';
      g.fillRect(x + 6, y + 98, 120, 12);
      g.fillStyle = '#b7c1ca';
      g.fillRect(x + 6, y + 110, 120, 5);
    }
  }
  return toTexture(c);
}

// Office block: ribbon windows between white spandrels.
export function officeTexture(seed = 3) {
  const S = 512, C = 128;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#f3f6f8';
  g.fillRect(0, 0, S, S);
  for (let row = 0; row < 4; row++) {
    const y = row * C;
    const grad = g.createLinearGradient(0, y + 34, 0, y + 112);
    grad.addColorStop(0, '#c6f1ff');
    grad.addColorStop(0.5, '#64c3e6');
    grad.addColorStop(1, '#2f8db8');
    g.fillStyle = grad;
    g.fillRect(0, y + 34, S, 78);
    for (let i = 0; i < 16; i++) {
      if (rnd() < 0.3) {
        g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.15})`;
        g.fillRect(i * 32, y + 34, 32, 78);
      }
    }
    g.fillStyle = '#e7eef2';
    for (let i = 0; i < 16; i++) g.fillRect(i * 32, y + 34, 3, 78);
    g.fillStyle = '#c9d6de';
    g.fillRect(0, y + 112, S, 4);
  }
  return toTexture(c);
}

// Greyscale speckle that breaks up the large ground textures up close.
export function grassDetailTexture() {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(7);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    const v = 70 + rnd() * 120;
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 1 + rnd() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
    g.stroke();
  }
  return toTexture(c, { color: false });
}

export function paverTexture() {
  const S = 256, T = 64;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(11);
  g.fillStyle = '#cfcac1';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const k = 228 + rnd() * 18;
      g.fillStyle = `rgb(${k},${k - 3},${k - 9})`;
      g.fillRect(x + 2, y + 2, T - 4, T - 4);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 2, y + 2, T - 4, 3);
    }
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120,110,100,${rnd() * 0.08})`;
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  return toTexture(c);
}

export function asphaltTexture() {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(13);
  g.fillStyle = '#7b848c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const v = 90 + rnd() * 90;
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`;
    g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }
  return toTexture(c);
}

export function woodTexture() {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(17);
  g.fillStyle = '#c2ad8c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const y = rnd() * S;
    g.strokeStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},${50 + rnd() * 20},${0.15 + rnd() * 0.25})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2);
    g.stroke();
  }
  return toTexture(c);
}

export function barkTexture() {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(19);
  g.fillStyle = '#9b938a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S;
    const v = 70 + rnd() * 90;
    g.strokeStyle = `rgba(${v},${v - 6},${v - 12},${0.3 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
    g.stroke();
  }
  return toTexture(c);
}

function drawLeaf(g, x, y, len, wid, rot, h, s, l) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const grad = g.createLinearGradient(0, -wid, 0, wid);
  grad.addColorStop(0, hsl(h, s, Math.min(88, l + 14)));
  grad.addColorStop(0.5, hsl(h, s, l));
  grad.addColorStop(1, hsl(h + 6, s, l - 12));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.quadraticCurveTo(0, -wid, len / 2, 0);
  g.quadraticCurveTo(0, wid, -len / 2, 0);
  g.fill();
  g.strokeStyle = hsl(h, s - 10, Math.min(92, l + 22), 0.6);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.lineTo(len / 2, 0);
  g.stroke();
  g.restore();
}

// A clump of bright spring leaves on a transparent background (tree cards).
export function leafTexture(seed = 23) {
  const S = 512;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 225;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const depth = r / 225;
    drawLeaf(g, x, y, 26 + rnd() * 20, 8 + rnd() * 6, rnd() * Math.PI * 2,
      82 + rnd() * 30, 62 + rnd() * 20, 30 + rnd() * 26 + depth * 12);
  }
  return toTexture(c, { repeat: false });
}

// Dense, opaque leaves for hedges and round bushes.
export function bushTexture(seed = 29, flowers = false) {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = flowers ? '#3d7a2a' : '#3f8a24';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    drawLeaf(g, rnd() * S, rnd() * S, 12 + rnd() * 10, 4 + rnd() * 3, rnd() * Math.PI * 2,
      88 + rnd() * 26, 60 + rnd() * 20, 28 + rnd() * 30);
  }
  if (flowers) {
    for (let i = 0; i < 420; i++) {
      const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 4;
      const hue = 318 + rnd() * 28, lig = 62 + rnd() * 22;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + rnd();
        g.fillStyle = hsl(hue, 90, lig);
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.62, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = hsl(hue, 70, 92);
      g.beginPath();
      g.arc(x, y, r * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c);
}

// Tall grass and reeds on a transparent background.
export function grassBladeTexture() {
  const W = 256, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const rnd = mulberry32(31);
  for (let i = 0; i < 90; i++) {
    const x = 20 + rnd() * (W - 40);
    const h = H * (0.45 + rnd() * 0.55);
    const bend = (rnd() - 0.5) * 70;
    const w = 3 + rnd() * 4;
    const hue = 78 + rnd() * 30, l = 34 + rnd() * 26;
    const grad = g.createLinearGradient(0, H, 0, H - h);
    grad.addColorStop(0, hsl(hue + 10, 60, l - 12));
    grad.addColorStop(1, hsl(hue - 8, 75, Math.min(85, l + 22)));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w, H);
    g.quadraticCurveTo(x - w * 0.3 + bend * 0.3, H - h * 0.6, x + bend, H - h);
    g.quadraticCurveTo(x + w * 0.3 + bend * 0.3, H - h * 0.6, x + w, H);
    g.fill();
  }
  return toTexture(c, { repeat: false });
}

// A puffy cumulus cloud with a flat, slightly shaded base.
export function cloudTexture(seed = 37) {
  const W = 512, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const puffs = [];
  for (let i = 0; i < 22; i++) {
    const t = rnd();
    const x = 70 + t * (W - 140);
    const hump = Math.sin(t * Math.PI);
    const r = 34 + hump * 60 * (0.6 + rnd() * 0.5);
    const y = H - 52 - r * 0.55 - hump * 30 * rnd();
    puffs.push([x, y, r]);
  }
  // shadowed underside first, then the bright tops
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x, y + r * 0.35, r * 0.2, x, y + r * 0.2, r);
    grad.addColorStop(0, 'rgba(205,222,240,0.95)');
    grad.addColorStop(0.75, 'rgba(215,230,246,0.75)');
    grad.addColorStop(1, 'rgba(225,238,250,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y + r * 0.2, r, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r * 0.95);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(250,253,255,0.85)');
    grad.addColorStop(1, 'rgba(240,248,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r * 0.95, 0, Math.PI * 2);
    g.fill();
  }
  // trim the bottom flat
  const fade = g.createLinearGradient(0, H - 70, 0, H - 30);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  return toTexture(c, { repeat: false });
}

export function softDotTexture() {
  const S = 64;
  const c = makeCanvas(S), g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(240,250,255,0.7)');
  grad.addColorStop(1, 'rgba(220,240,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
}

// Glossy hair: soft strands running from the crown.
export function hairTexture() {
  const S = 256;
  const c = makeCanvas(S), g = c.getContext('2d');
  const rnd = mulberry32(43);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#5cc4ff');
  grad.addColorStop(1, '#1a7fd6');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S;
    const l = rnd() < 0.5 ? 'rgba(10,70,150,0.35)' : 'rgba(190,235,255,0.35)';
    g.strokeStyle = l;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (rnd() - 0.5) * 20, S * 0.4, x + (rnd() - 0.5) * 30, S * 0.7, x + (rnd() - 0.5) * 24, S);
    g.stroke();
  }
  return toTexture(c);
}

// The sun's starburst, used by the lens-flare overlay.
export function starburstDataURL() {
  const S = 512;
  const c = makeCanvas(S), g = c.getContext('2d');
  const m = S / 2;
  let grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.06, 'rgba(255,255,255,1)');
  grad.addColorStop(0.14, 'rgba(255,255,240,0.65)');
  grad.addColorStop(0.35, 'rgba(200,240,255,0.18)');
  grad.addColorStop(1, 'rgba(180,230,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const rays = [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, 0.62], [-Math.PI / 4, 0.62], [0.35, 0.4], [1.9, 0.45], [2.6, 0.35]];
  for (const [a, len] of rays) {
    for (const dir of [1, -1]) {
      g.save();
      g.translate(m, m);
      g.rotate(a + (dir < 0 ? Math.PI : 0));
      grad = g.createLinearGradient(0, 0, m * len, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(m * len, 0);
      g.lineTo(0, 7);
      g.fill();
      g.restore();
    }
  }
  return c.toDataURL('image/png');
}
