// Product illustrations, drawn as if printed: each silhouette is filled with the
// filament colour, horizontal layer lines and a soft studio light.

export const FILAMENTS = [
  { id: "black", name: "Black", hex: "#141414" },
  { id: "yellow", name: "Yellow", hex: "#F2C200" },
  { id: "gray", name: "Gray", hex: "#8A8D90" },
  { id: "green", name: "Green", hex: "#3FAE4D" },
  { id: "orange", name: "Orange", hex: "#FF5B1F" },
  { id: "red", name: "Red", hex: "#D21F1F" },
  { id: "blue", name: "Blue", hex: "#1668E3" },
  { id: "mystery", name: "Mystery", hex: null },
];

export const MYSTERY_STOPS = ["#FF5B1F", "#F2C200", "#3FAE4D", "#1668E3", "#D21F1F"];

let uid = 0;

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Catmull-Rom through the points, then resampled into n evenly spaced stations.
function stations(points, n) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  dense.push(points[points.length - 1]);
  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < dense.length - 1 && lengths[j] < target) j++;
    const a = dense[j - 1];
    const b = dense[j];
    const u = (target - lengths[j - 1]) / Math.max(1e-6, lengths[j] - lengths[j - 1]);
    out.push({
      x: a[0] + (b[0] - a[0]) * u,
      y: a[1] + (b[1] - a[1]) * u,
      angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
    });
  }
  return out;
}

// Articulated links along a curve: rounded plates that shrink from `from` to `to`.
// `pitch` sets a plate's length as a share of the spacing, leaving visible joints.
function chain(points, n, from, to, { long = 0.92, wide = 1.1, pitch = 0, spikes = false } = {}) {
  const st = stations(points, n);
  const spacing = st.length > 1 ? Math.hypot(st[1].x - st[0].x, st[1].y - st[0].y) : from;
  return st
    .map((s, i) => {
      const size = from + (to - from) * (i / Math.max(1, n - 1));
      const w = pitch ? spacing * pitch : size * long;
      const h = size * wide;
      const plate = `<rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(w / 2, size * 0.3).toFixed(1)}"/>`;
      const spike = spikes
        ? `<path d="M ${(-w * 0.45).toFixed(1)} ${(-h / 2 + 3).toFixed(1)} L ${(w * 0.15).toFixed(1)} ${(-h / 2 - size * 0.32).toFixed(1)} L ${(w * 0.45).toFixed(1)} ${(-h / 2 + 3).toFixed(1)} Z"/>`
        : "";
      return `<g transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.angle.toFixed(1)})">${plate}${spike}</g>`;
    })
    .join("");
}

const limb = (d, w) =>
  `<path d="${d}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// Each design: `shape` is the printed body (white = solid, black = cut away) and
// `over` is drawn on top of it (eyes, pens, carved faces). `back` is an optional
// far-side part, printed in the same filament but in shadow.
const DESIGNS = {
  dragon: () => ({
    back: `
      <path d="M 232 244 Q 232 170 260 104 L 270 154 Q 288 132 308 136 L 304 164 Q 324 116 356 86 Q 364 158 340 222 Q 324 202 306 214 Q 290 196 272 210 Q 254 198 232 244 Z"/>
      ${limb("M 224 262 Q 220 294 228 330 L 210 340", 20)}
      ${limb("M 314 240 Q 332 278 324 318 L 344 328", 20)}`,
    backOver: `
      <g fill="none" stroke="rgba(22,17,13,.22)" stroke-width="3" stroke-linecap="round">
        <path d="M 252 232 L 264 114"/>
        <path d="M 282 224 L 306 140"/>
        <path d="M 312 224 L 352 92"/>
      </g>`,
    shape: `
      ${limb("M 196 256 Q 186 290 194 326 L 172 338", 25)}
      ${limb("M 288 252 Q 306 288 294 326 L 316 336", 25)}
      ${chain(
        [
          [146, 188],
          [180, 234],
          [232, 256],
          [286, 252],
          [328, 232],
          [356, 198],
          [366, 160],
          [350, 130],
        ],
        18,
        60,
        16,
        { wide: 1.14, pitch: 0.82, spikes: true },
      )}
      <path d="M 160 130 Q 184 142 180 174 Q 174 200 144 206 L 98 208 Q 62 208 46 192 Q 40 182 50 174 L 84 162 Q 106 130 160 130 Z"/>
      <path d="M 146 134 Q 168 102 206 94 Q 182 114 168 142 Z"/>
      <path d="M 166 148 Q 198 130 230 134 Q 200 142 178 160 Z"/>
      <path d="M 62 192 L 112 194" stroke="#000" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    over: `
      <circle cx="122" cy="166" r="9" fill="#16110d"/>
      <circle cx="124.8" cy="163.2" r="2.7" fill="#fff"/>
      <ellipse cx="58" cy="180" rx="4.5" ry="2.8" fill="rgba(22,17,13,.55)"/>`,
  }),

  crab: () => ({
    shape: `
      ${limb("M 98 282 L 52 292 L 36 332", 15)}
      ${limb("M 106 300 L 66 320 L 58 350", 15)}
      ${limb("M 124 312 L 100 334 L 98 352", 15)}
      ${limb("M 302 282 L 348 292 L 364 332", 15)}
      ${limb("M 294 300 L 334 320 L 342 350", 15)}
      ${limb("M 276 312 L 300 334 L 302 352", 15)}
      ${limb("M 110 254 L 86 204 L 74 176", 26)}
      ${limb("M 290 254 L 314 204 L 326 176", 26)}
      <circle cx="70" cy="144" r="42"/>
      <circle cx="330" cy="144" r="42"/>
      <path d="M 72 152 L 50 96 L 98 98 Z" fill="#000" stroke="#000"/>
      <path d="M 328 152 L 350 96 L 302 98 Z" fill="#000" stroke="#000"/>
      ${limb("M 176 214 L 166 172", 11)}
      ${limb("M 224 214 L 234 172", 11)}
      <circle cx="164" cy="162" r="16"/>
      <circle cx="236" cy="162" r="16"/>
      <path d="M 80 272 Q 84 212 200 206 Q 316 212 320 272 Q 316 322 200 328 Q 84 322 80 272 Z"/>`,
    over: `
      <ellipse cx="200" cy="238" rx="56" ry="15" fill="#16110d"/>
      <g clip-path="url(#pens-CLIP)">
        <g transform="rotate(-9 176 238)"><rect x="168" y="88" width="16" height="160" rx="8" fill="#16110d"/><rect x="171" y="70" width="10" height="26" rx="5" fill="#16110d"/></g>
        <g transform="rotate(2 202 238)"><rect x="194" y="70" width="17" height="178" rx="8.5" fill="#fff" stroke="#16110d" stroke-width="3"/><rect x="197" y="70" width="11" height="34" rx="5" fill="#16110d"/></g>
        <g transform="rotate(11 230 238)"><rect x="222" y="104" width="15" height="144" rx="7.5" fill="#8a8d90"/><path d="M 222 112 L 229.5 90 L 237 112 Z" fill="#16110d"/></g>
      </g>
      <circle cx="166" cy="160" r="6.5" fill="#16110d"/>
      <circle cx="234" cy="160" r="6.5" fill="#16110d"/>
      <circle cx="168" cy="158" r="2" fill="#fff"/>
      <circle cx="236" cy="158" r="2" fill="#fff"/>
      <path d="M 184 298 Q 200 310 216 298" fill="none" stroke="#16110d" stroke-width="4.5" stroke-linecap="round"/>`,
    defs: `<clipPath id="pens-CLIP"><rect x="0" y="0" width="400" height="238"/></clipPath>`,
  }),

  floppy: () => ({
    shape: `
      <circle cx="200" cy="104" r="54"/>
      <rect x="189" y="154" width="22" height="18" rx="6"/>
      <rect x="161" y="170" width="78" height="24" rx="10"/>
      <rect x="163" y="198" width="74" height="24" rx="10"/>
      <rect x="165" y="226" width="70" height="24" rx="10"/>
      <rect x="167" y="254" width="66" height="24" rx="10"/>
      <rect x="164" y="282" width="72" height="20" rx="9"/>
      ${chain(
        [
          [160, 182],
          [128, 198],
          [108, 230],
          [100, 264],
          [108, 296],
        ],
        6,
        22,
        19,
        { long: 0.8, wide: 0.9 },
      )}
      <circle cx="110" cy="310" r="15"/>
      ${chain(
        [
          [240, 182],
          [272, 170],
          [296, 140],
          [306, 106],
        ],
        5,
        22,
        19,
        { long: 0.8, wide: 0.9 },
      )}
      <circle cx="308" cy="88" r="15"/>
      ${chain(
        [
          [182, 302],
          [170, 324],
          [160, 340],
        ],
        3,
        24,
        22,
        { long: 0.78, wide: 0.92 },
      )}
      ${chain(
        [
          [218, 302],
          [232, 324],
          [244, 340],
        ],
        3,
        24,
        22,
        { long: 0.78, wide: 0.92 },
      )}
      <ellipse cx="148" cy="352" rx="26" ry="11"/>
      <ellipse cx="256" cy="352" rx="26" ry="11"/>`,
    over: `
      <ellipse cx="182" cy="100" rx="7.5" ry="10" fill="#16110d"/>
      <ellipse cx="218" cy="100" rx="7.5" ry="10" fill="#16110d"/>
      <circle cx="184.5" cy="96" r="2.4" fill="#fff"/>
      <circle cx="220.5" cy="96" r="2.4" fill="#fff"/>
      <path d="M 182 124 Q 200 142 218 124" fill="none" stroke="#16110d" stroke-width="5" stroke-linecap="round"/>`,
  }),

  duck: () => ({
    shape: `
      <path d="M 314 238 Q 350 194 366 204 Q 364 242 330 270 Z"/>
      <ellipse cx="220" cy="274" rx="130" ry="78"/>
      <ellipse cx="152" cy="222" rx="54" ry="44"/>
      <circle cx="130" cy="168" r="64"/>
      <path d="M 74 172 Q 40 174 30 190 Q 44 208 80 200 Z"/>
      <path d="M 122 112 Q 118 90 134 80 L 144 88 Q 132 96 136 112 Z"/>
      <path d="M 140 94 Q 166 76 180 94 Q 160 106 140 94 Z"/>`,
    over: `
      <g fill="none" stroke="rgba(22,17,13,.18)" stroke-width="3.5" stroke-linecap="round">
        <path d="M 168 210 Q 146 274 172 346"/>
        <path d="M 216 198 Q 200 274 218 352"/>
        <path d="M 266 202 Q 272 274 262 350"/>
        <path d="M 310 222 Q 330 274 306 336"/>
      </g>
      <path d="M 200 254 Q 252 238 294 262 Q 254 298 204 282" fill="none" stroke="rgba(22,17,13,.22)" stroke-width="4" stroke-linecap="round"/>
      <g fill="url(#glow-CLIP)">
        <path d="M 96 166 L 112 140 L 124 168 Z"/>
        <path d="M 140 168 L 152 140 L 168 164 Z"/>
        <path d="M 96 186 L 107 197 L 116 188 L 127 199 L 138 188 L 148 197 L 162 184 Q 130 222 96 186 Z"/>
      </g>`,
    defs: `<linearGradient id="glow-CLIP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff9a1f"/></linearGradient>`,
  }),
};

/**
 * SVG markup for a design printed in a filament.
 * `filament` is an entry of FILAMENTS.
 */
export function art(design, filament) {
  const id = `art${++uid}`;
  const d = DESIGNS[design]();
  const mystery = !filament.hex;
  const dark = !mystery && luminance(filament.hex) < 0.08;
  const fill = mystery ? `url(#${id}-mix)` : filament.hex;
  const line = dark ? "rgba(255,255,255,.07)" : "rgba(22,17,13,.13)";
  const local = (s) => (s || "").replaceAll("CLIP", id);
  return `
  <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      ${local(d.defs)}
      <linearGradient id="${id}-mix" x1="0" y1="0" x2="1" y2="1">
        ${MYSTERY_STOPS.map((c, i) => `<stop offset="${i / (MYSTERY_STOPS.length - 1)}" stop-color="${c}"/>`).join("")}
      </linearGradient>
      <pattern id="${id}-layers" width="10" height="5" patternUnits="userSpaceOnUse">
        <rect width="10" height="1.3" y="3.7" fill="${line}"/>
      </pattern>
      <linearGradient id="${id}-light" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.22 : 0.38}"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.35 : 0.26}"/>
      </linearGradient>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
        <g fill="#fff" stroke="#fff">${d.shape}</g>
      </mask>
      ${d.back ? `<mask id="${id}-back" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><g fill="#fff" stroke="#fff">${d.back}</g></mask>` : ""}
    </defs>
    <ellipse cx="200" cy="358" rx="150" ry="12" fill="rgba(22,17,13,.10)"/>
    ${
      d.back
        ? `<g mask="url(#${id}-back)">
      <rect width="400" height="400" fill="${fill}"/>
      <rect width="400" height="400" fill="url(#${id}-layers)"/>
      <rect width="400" height="400" fill="#000" opacity="${dark ? 0.35 : 0.24}"/>
    </g>
    ${d.backOver || ""}`
        : ""
    }
    <g mask="url(#${id}-mask)">
      <rect width="400" height="400" fill="${fill}"/>
      <rect width="400" height="400" fill="url(#${id}-layers)"/>
      <rect width="400" height="400" fill="url(#${id}-light)"/>
    </g>
    ${local(d.over)}
  </svg>`;
}
