/*
 * slicer.js — a tiny "slicer preview" renderer for the Crews 3D Prints compositions.
 *
 * A part is a stack of rings (one per layer). Each ring is a closed polygon whose
 * radius comes from radius(t, theta), t = 0 at the bed and 1 at the top.
 *
 * World axes: X right, Y toward the viewer, Z up. The camera looks down from the
 * front, so a world point lands on screen at
 *   x = X,  y = -Z + Y * iso
 * relative to the bed centre. Every draw is a pure function of its inputs, so any
 * frame can be drawn from any timeline time (HyperFrames seeks freely).
 */
(function () {
  "use strict";

  var TAU = Math.PI * 2;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function normalize(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // Cosine interpolation through [t, value] control points.
  function profile(points, t) {
    for (var k = 0; k < points.length - 1; k++) {
      var a = points[k];
      var b = points[k + 1];
      if (t <= b[0]) {
        var u = (t - a[0]) / (b[0] - a[0]);
        var s = (1 - Math.cos(Math.PI * clamp01(u))) / 2;
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return points[points.length - 1][1];
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function rgb(c, alpha) {
    var r = Math.max(0, Math.min(255, Math.round(c[0])));
    var g = Math.max(0, Math.min(255, Math.round(c[1])));
    var b = Math.max(0, Math.min(255, Math.round(c[2])));
    if (alpha !== undefined && alpha < 1) return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function part(o) {
    var layers = o.layers;
    var seg = o.segments || 96;
    var lh = o.layerHeight;
    var iso = o.iso || 0.36;
    var rings = layers + 1;
    var R = new Float32Array(rings * seg);
    var cosT = new Float32Array(seg);
    var sinT = new Float32Array(seg);
    var j;
    for (j = 0; j < seg; j++) {
      cosT[j] = Math.cos((j / seg) * TAU);
      sinT[j] = Math.sin((j / seg) * TAU);
    }
    for (var k = 0; k < rings; k++) {
      for (j = 0; j < seg; j++) R[k * seg + j] = o.radius(k / layers, (j / seg) * TAU);
    }

    // Outward surface normals in part space (before spin).
    var N = new Float32Array(rings * seg * 3);
    for (k = 0; k < rings; k++) {
      var kd = Math.max(0, k - 1);
      var ku = Math.min(rings - 1, k + 1);
      for (j = 0; j < seg; j++) {
        var jp = (j + 1) % seg;
        var jm = (j - 1 + seg) % seg;
        var tx = R[k * seg + jp] * cosT[jp] - R[k * seg + jm] * cosT[jm];
        var ty = R[k * seg + jp] * sinT[jp] - R[k * seg + jm] * sinT[jm];
        var dr = (R[ku * seg + j] - R[kd * seg + j]) / ((ku - kd) * lh || 1);
        var n = normalize([ty, -tx, 0]);
        n = normalize([n[0], n[1], -dr]);
        N[(k * seg + j) * 3] = n[0];
        N[(k * seg + j) * 3 + 1] = n[1];
        N[(k * seg + j) * 3 + 2] = n[2];
      }
    }

    var maxR = 0;
    for (var i = 0; i < R.length; i++) maxR = Math.max(maxR, R[i]);

    var elev = Math.atan(iso);
    var view = [0, Math.cos(elev), Math.sin(elev)];
    var light = normalize(o.light || [-0.62, 0.52, 0.62]);
    var half = normalize([light[0] + view[0], light[1] + view[1], light[2] + view[2]]);

    return {
      layers: layers,
      seg: seg,
      lh: lh,
      iso: iso,
      wall: o.wall || 7,
      R: R,
      N: N,
      cosT: cosT,
      sinT: sinT,
      maxR: maxR,
      view: view,
      light: light,
      half: half,
      lit: o.lit,
      shadow: o.shadow,
      ambient: o.ambient === undefined ? 0.35 : o.ambient,
      specular: o.specular === undefined ? 0.35 : o.specular,
      shininess: o.shininess || 28,
      ridge: o.ridge === undefined ? 0.05 : o.ridge,
      xs: new Float32Array(rings * seg),
      ys: new Float32Array(rings * seg),
      height: layers * lh,
      cache: null,
    };
  }

  // Project rings 0..kmax into p.xs / p.ys (part-local screen units).
  function project(p, kmax, spin) {
    var cs = Math.cos(spin);
    var sn = Math.sin(spin);
    var seg = p.seg;
    for (var k = 0; k <= kmax; k++) {
      var z = -k * p.lh;
      for (var j = 0; j < seg; j++) {
        var i = k * seg + j;
        var c = p.cosT[j] * cs - p.sinT[j] * sn;
        var s = p.sinT[j] * cs + p.cosT[j] * sn;
        p.xs[i] = p.R[i] * c;
        p.ys[i] = z + p.R[i] * s * p.iso;
      }
    }
  }

  var tmpN = [0, 0, 0];

  // Surface normal around ring k between segments j and j+1, rotated by the spin.
  function normalAt(p, k, j, cs, sn) {
    var seg = p.seg;
    var a = (k * seg + j) * 3;
    var b = (k * seg + ((j + 1) % seg)) * 3;
    var nx0 = (p.N[a] + p.N[b]) * 0.5;
    var ny0 = (p.N[a + 1] + p.N[b + 1]) * 0.5;
    tmpN[0] = nx0 * cs - ny0 * sn;
    tmpN[1] = nx0 * sn + ny0 * cs;
    tmpN[2] = (p.N[a + 2] + p.N[b + 2]) * 0.5;
    return tmpN;
  }

  function facing(p, k, j, cs, sn) {
    var n = normalAt(p, k, j, cs, sn);
    return n[1] * p.view[1] + n[2] * p.view[2] > 0;
  }

  // Lit colour around ring k between segments j and j+1, or null if it faces away.
  function shadeAt(p, k, j, cs, sn, ridge) {
    var n = normalAt(p, k, j, cs, sn);
    var nx = n[0];
    var ny = n[1];
    var nz = n[2];
    if (ny * p.view[1] + nz * p.view[2] <= 0) return null;
    var lambert = Math.max(0, nx * p.light[0] + ny * p.light[1] + nz * p.light[2]);
    var c = mix(p.shadow, p.lit, Math.min(1, (p.ambient + (1 - p.ambient) * lambert) * ridge));
    var spec = Math.pow(Math.max(0, nx * p.half[0] + ny * p.half[1] + nz * p.half[2]), p.shininess) * p.specular;
    if (spec > 0.002) c = mix(c, [255, 255, 255], Math.min(1, spec));
    return c;
  }

  function capColors(p) {
    var top = Math.max(0, p.light[2]);
    return {
      rim: rgb(mix(p.shadow, p.lit, Math.min(1, p.ambient + (1 - p.ambient) * top + 0.12))),
      inner: rgb(mix(p.shadow, p.lit, 0.42)),
      deepBack: rgb(mix(p.shadow, p.lit, 0.72)),
      deepFront: rgb(mix(p.shadow, p.lit, 0.12)),
    };
  }

  function ringPath(ctx, p, k, scale) {
    var seg = p.seg;
    var base = k * seg;
    var cy = -k * p.lh;
    ctx.beginPath();
    for (var j = 0; j < seg; j++) {
      var x = p.xs[base + j];
      var y = p.ys[base + j];
      if (scale !== undefined) {
        x = x * scale;
        y = cy + (y - cy) * scale;
      }
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function innerScale(p, k) {
    // Average radius of the ring keeps the wall roughly even.
    var seg = p.seg;
    var sum = 0;
    var count = 0;
    for (var j = 0; j < seg; j += 8) {
      sum += p.R[k * seg + j];
      count++;
    }
    var avg = sum / count;
    return Math.max(0.2, (avg - p.wall) / avg);
  }

  /*
   * One layer's outside wall: every camera-facing quad between ring k-1 and ring k
   * goes into a single path, shaded by a horizontal gradient sampled per quad.
   * The top edge is lifted a little so the next layer hides the anti-aliased seam.
   */
  function drawBand(ctx, p, k, cs, sn, from, count, lift) {
    var seg = p.seg;
    var lo = (k - 1) * seg;
    var hi = k * seg;
    var ridge = 1 - (k % 2) * p.ridge;
    var xs = p.xs;
    var ys = p.ys;
    var stops = [];
    var xmin = Infinity;
    var xmax = -Infinity;
    ctx.beginPath();
    for (var n = 0; n < count; n++) {
      var j = (from + n) % seg;
      var c = shadeAt(p, k, j, cs, sn, ridge);
      if (!c) continue;
      var j1 = (j + 1) % seg;
      ctx.moveTo(xs[lo + j], ys[lo + j]);
      ctx.lineTo(xs[lo + j1], ys[lo + j1]);
      ctx.lineTo(xs[hi + j1], ys[hi + j1] - lift);
      ctx.lineTo(xs[hi + j], ys[hi + j] - lift);
      ctx.closePath();
      stops.push({ x: (xs[lo + j] + xs[lo + j1] + xs[hi + j] + xs[hi + j1]) * 0.25, c: c });
      xmin = Math.min(xmin, xs[lo + j], xs[lo + j1], xs[hi + j], xs[hi + j1]);
      xmax = Math.max(xmax, xs[lo + j], xs[lo + j1], xs[hi + j], xs[hi + j1]);
    }
    if (!stops.length) return;
    stops.sort(function (a, b) {
      return a.x - b.x;
    });
    var span = Math.max(1e-3, xmax - xmin);
    var g = ctx.createLinearGradient(xmin, 0, xmax, 0);
    for (var q = 0; q < stops.length; q++) g.addColorStop(clamp01((stops[q].x - xmin) / span), rgb(stops[q].c));
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawCap(ctx, p, k, colors, isTop) {
    ringPath(ctx, p, k);
    ctx.fillStyle = colors.rim;
    ctx.fill();
    var f = innerScale(p, k);
    ringPath(ctx, p, k, f);
    if (isTop) {
      var r = p.R[k * p.seg] * f;
      var cy = -k * p.lh;
      var g = ctx.createLinearGradient(0, cy - r * p.iso, 0, cy + r * p.iso);
      g.addColorStop(0, colors.deepBack);
      g.addColorStop(1, colors.deepFront);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = colors.inner;
    }
    ctx.fill();
  }

  /*
   * Finished layers live in an offscreen canvas while the spin holds, so a frame
   * only rasterises the layers added since the previous one. Seeking backwards or
   * spinning rebuilds it; the pixels come out the same either way. Only the outside
   * walls are cached: below the top layer the caps are hidden behind later walls.
   */
  function layerCache(p, dpr) {
    if (p.cache && p.cache.dpr === dpr) return p.cache;
    var pad = 6;
    var w = Math.ceil(p.maxR * 2 + pad * 2);
    var h = Math.ceil(p.height + p.maxR * p.iso * 2 + pad * 2);
    var canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    p.cache = {
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      dpr: dpr,
      w: canvas.width / dpr,
      h: canvas.height / dpr,
      ox: p.maxR + pad,
      oy: p.height + p.maxR * p.iso + pad,
      key: null,
      done: 0,
    };
    return p.cache;
  }

  /*
   * Draw the printed part.
   *  o.x, o.y    screen position of the bed centre under the part
   *  o.scale     uniform scale (default 1)
   *  o.spin      rotation about Z, radians
   *  o.layers    number of finished layers
   *  o.trace     0..1 progress of the next layer's perimeter (optional)
   *  o.traceFrom segment index the perimeter starts from
   *  o.dpr       backing-store scale of ctx (sizes the layer cache)
   * Returns the nozzle position (screen space) at the top of the build.
   */
  function drawPart(ctx, p, o) {
    var scale = o.scale || 1;
    var spin = o.spin || 0;
    var done = Math.max(0, Math.min(p.layers, Math.floor(o.layers)));
    var trace = done < p.layers ? clamp01(o.trace || 0) : 0;
    var from = o.traceFrom || 0;
    var cs = Math.cos(spin);
    var sn = Math.sin(spin);
    project(p, Math.min(p.layers, done + 1), spin);
    var colors = capColors(p);

    var cache = layerCache(p, o.dpr || 1);
    var key = spin.toFixed(6);
    if (cache.key !== key || done < cache.done) {
      cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
      cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
      cache.key = key;
      cache.done = 0;
    }
    if (done > cache.done) {
      var cc = cache.ctx;
      cc.setTransform(cache.dpr, 0, 0, cache.dpr, cache.ox * cache.dpr, cache.oy * cache.dpr);
      cc.lineJoin = "round";
      for (var k = cache.done + 1; k <= done; k++) {
        drawBand(cc, p, k, cs, sn, 0, p.seg, 0.8);
      }
      cache.done = done;
    }
    if (done > 0) {
      ctx.drawImage(cache.canvas, o.x - cache.ox * scale, o.y - cache.oy * scale, cache.w * scale, cache.h * scale);
    }

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    if (done > 0) drawCap(ctx, p, done, colors, true);

    var nozzle;
    if (trace > 0) {
      var k2 = done + 1;
      var count = Math.max(1, Math.round(trace * p.seg));
      drawBand(ctx, p, k2, cs, sn, from, count, 0);
      // Fresh perimeter on top of the band.
      ctx.beginPath();
      for (var n = 0; n <= count; n++) {
        var j = (from + n) % p.seg;
        var x = p.xs[k2 * p.seg + j];
        var y = p.ys[k2 * p.seg + j];
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineCap = "round";
      ctx.lineWidth = p.wall;
      ctx.strokeStyle = colors.rim;
      ctx.stroke();
      var jEnd = (from + count) % p.seg;
      nozzle = [p.xs[k2 * p.seg + jEnd], p.ys[k2 * p.seg + jEnd]];
    } else {
      var jT = from % p.seg;
      nozzle = [p.xs[done * p.seg + jT], p.ys[done * p.seg + jT]];
    }
    ctx.restore();
    return [o.x + nozzle[0] * scale, o.y + nozzle[1] * scale];
  }

  // Append ring k's camera-facing (front) or hidden (back) stretches to the current path.
  function traceRing(ctx, p, k, cs, sn, front, limit) {
    var pen = false;
    var kk = Math.max(1, k);
    for (var j = 0; j <= limit; j++) {
      var jj = j % p.seg;
      var i = k * p.seg + jj;
      if (facing(p, kk, jj, cs, sn) === front) {
        if (!pen) ctx.moveTo(p.xs[i], p.ys[i]);
        else ctx.lineTo(p.xs[i], p.ys[i]);
        pen = true;
      } else if (pen) {
        ctx.lineTo(p.xs[i], p.ys[i]);
        pen = false;
      }
    }
  }

  /*
   * Ring outlines (the slicer's layer preview) for rings in [from, to].
   * Hidden stretches are drawn fainter than the visible ones.
   */
  function drawContours(ctx, p, o) {
    var spin = o.spin || 0;
    var scale = o.scale || 1;
    var to = Math.min(p.layers, Math.floor(o.to));
    var fromK = Math.max(0, Math.ceil(o.from || 0));
    var step = o.step || 1;
    if (to < fromK) return;
    var cs = Math.cos(spin);
    var sn = Math.sin(spin);
    project(p, to, spin);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(scale, scale);
    ctx.lineWidth = (o.lineWidth || 1.2) / scale;
    ctx.lineJoin = "round";
    var alphas = [o.backAlpha === undefined ? 0.25 : o.backAlpha, o.frontAlpha === undefined ? 0.9 : o.frontAlpha];
    for (var q = 0; q < 2; q++) {
      if (alphas[q] <= 0) continue;
      ctx.beginPath();
      for (var k = fromK; k <= to; k += step) traceRing(ctx, p, k, cs, sn, q === 1, p.seg);
      ctx.strokeStyle = rgb(o.color, alphas[q]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /*
   * CAD-style wireframe: a few rings plus meridians running up the part.
   * o.progress (0..1) draws the lines on.
   */
  function drawWireframe(ctx, p, o) {
    var spin = o.spin || 0;
    var scale = o.scale || 1;
    var progress = clamp01(o.progress === undefined ? 1 : o.progress);
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    var rings = o.rings || 8;
    var meridians = o.meridians || 16;
    if (progress <= 0 || alpha <= 0) return;
    var cs = Math.cos(spin);
    var sn = Math.sin(spin);
    project(p, p.layers, spin);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    var stepK = p.layers / rings;
    var stepJ = p.seg / meridians;

    for (var pass = 0; pass < 2; pass++) {
      var front = pass === 1;
      ctx.beginPath();
      for (var r = 0; r <= rings; r++) {
        traceRing(ctx, p, Math.round(r * stepK), cs, sn, front, Math.round(progress * p.seg));
      }
      for (var m = 0; m < meridians; m++) {
        var jm = Math.round(m * stepJ) % p.seg;
        var kl = Math.round(progress * p.layers);
        var pen = false;
        for (var k = 0; k <= kl; k++) {
          var i = k * p.seg + jm;
          if (facing(p, Math.max(1, k), jm, cs, sn) === front) {
            if (!pen) ctx.moveTo(p.xs[i], p.ys[i]);
            else ctx.lineTo(p.xs[i], p.ys[i]);
            pen = true;
          } else if (pen) {
            ctx.lineTo(p.xs[i], p.ys[i]);
            pen = false;
          }
        }
      }
      ctx.lineWidth = (front ? 1.8 : 1.2) / scale;
      ctx.strokeStyle = rgb(o.color, (front ? 0.85 : 0.22) * alpha);
      ctx.stroke();
    }

    // Vertices where rings and meridians cross, on the visible side.
    var dots = clamp01((progress - 0.85) / 0.15) * alpha;
    if (dots > 0) {
      ctx.fillStyle = rgb(o.color, dots);
      var d = 3.2 / scale;
      for (var r2 = 0; r2 <= rings; r2++) {
        var k3 = Math.round(r2 * stepK);
        for (var m2 = 0; m2 < meridians; m2++) {
          var j3 = Math.round(m2 * stepJ) % p.seg;
          if (!facing(p, Math.max(1, k3), j3, cs, sn)) continue;
          var i3 = k3 * p.seg + j3;
          ctx.fillRect(p.xs[i3] - d, p.ys[i3] - d, d * 2, d * 2);
        }
      }
    }
    ctx.restore();
  }

  // Soft contact shadow on the bed.
  function drawShadow(ctx, p, o) {
    var scale = o.scale || 1;
    var alpha = o.alpha === undefined ? 0.3 : o.alpha;
    if (alpha <= 0) return;
    var r = p.R[0] * scale * 1.18;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(1, p.iso);
    var g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.25);
    g.addColorStop(0, rgb(o.color, alpha));
    g.addColorStop(1, rgb(o.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Square print bed with a fine grid, seen from the same camera as the part.
  function drawBed(ctx, o) {
    var h = o.half;
    var iso = o.iso || 0.36;
    var x = o.x;
    var top = o.y - h * iso;
    var bottom = o.y + h * iso;
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = o.edge;
    ctx.beginPath();
    ctx.roundRect(x - h, bottom - 4, h * 2, o.thickness || 16, [0, 0, 8, 8]);
    ctx.fill();
    ctx.fillStyle = o.surface;
    ctx.beginPath();
    ctx.roundRect(x - h, top, h * 2, bottom - top, 10);
    ctx.fill();
    ctx.strokeStyle = o.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    var cells = o.cells || 12;
    for (var c = 1; c < cells; c++) {
      var gx = x - h + (c / cells) * h * 2;
      ctx.moveTo(gx, top + 2);
      ctx.lineTo(gx, bottom - 2);
      var gy = top + (c / cells) * (bottom - top);
      ctx.moveTo(x - h + 2, gy);
      ctx.lineTo(x + h - 2, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = o.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - h, top, h * 2, bottom - top, 10);
    ctx.stroke();
    ctx.restore();
  }

  /*
   * A compact enclosed toolhead with its nozzle tip at (x, y).
   * o.rail = [x0, x1] draws the X gantry behind it.
   */
  function drawToolhead(ctx, x, y, o) {
    o = o || {};
    var ink = o.ink || "#16110d";
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (o.rail) {
      ctx.fillStyle = o.railColor || ink;
      ctx.beginPath();
      ctx.roundRect(o.rail[0], y - 128, o.rail[1] - o.rail[0], 14, 7);
      ctx.fill();
      ctx.fillStyle = o.railShine || "rgba(255,255,255,0.18)";
      ctx.fillRect(o.rail[0] + 8, y - 126, o.rail[1] - o.rail[0] - 16, 2);
    }
    if (o.glow) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, o.glow);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = o.brass || "#2b221c";
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 18);
    ctx.lineTo(x + 9, y - 18);
    ctx.lineTo(x + 2.5, y - 1);
    ctx.lineTo(x - 2.5, y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.roundRect(x - 26, y - 42, 52, 26, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 62, y - 168, 124, 132, 22);
    ctx.fill();
    ctx.strokeStyle = o.detail || "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 112, 26, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 112, 7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = o.led || "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 62, 72, 5, 2.5);
    ctx.fill();
    ctx.restore();
  }

  window.Slicer = {
    TAU: TAU,
    clamp01: clamp01,
    profile: profile,
    part: part,
    drawPart: drawPart,
    drawContours: drawContours,
    drawWireframe: drawWireframe,
    drawShadow: drawShadow,
    drawBed: drawBed,
    drawToolhead: drawToolhead,
    rgb: rgb,
  };
})();
