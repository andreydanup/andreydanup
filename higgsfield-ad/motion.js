/* Higgsfield: 15-second kinetic motion design ad, 1080 x 1920 (9:16).
   HF.render(ctx, t) draws the frame at time t (seconds) as a pure function of t,
   so frames can be rendered in any order (live preview or offline export). */
(function () {
  'use strict';

  const W = 1080, H = 1920, CX = W / 2, CY = H / 2, DURATION = 15;
  const COL = {
    lime: '#D1FE17', ink: '#151314', white: '#FFFFFF',
    magenta: '#FF2D9B', cyan: '#18E0FF', orange: '#FF7A1A', violet: '#8B5CFF'
  };
  const ACCENTS = [COL.magenta, COL.cyan, COL.orange, COL.violet, COL.lime];
  const DISPLAY = '"Inter Display", "Inter", "Helvetica Neue", Arial, sans-serif';
  const TEXT = '"Inter", "Helvetica Neue", Arial, sans-serif';

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const ease = {
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inCubic: x => x * x * x,
    inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outBack: x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  };
  // Deterministic hash noise in [0, 1): same (i, salt) always gives the same value.
  function rnd(i, salt) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul((salt | 0) + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // Time remap for "frozen" explosions: fast burst, near-freeze, then fast again.
  function slowmo(d, burst, hold, rate, after) {
    if (d <= 0) return 0;
    if (d < burst) return d;
    if (d < burst + hold) return burst + (d - burst) * rate;
    return burst + hold * rate + (d - burst - hold) * after;
  }
  const drag = (k, tau) => (1 - Math.exp(-k * tau)) / k;   // integral of exp(-k t) velocity decay

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function blob(c, x, y, r, color, a) {
    if (a <= 0 || r <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function setFont(c, weight, size, family = DISPLAY, spacing = 0) {
    c.font = `${weight} ${size}px ${family}`;
    c.letterSpacing = spacing + 'px';
  }
  function fit(c, text, weight, max, width, family = DISPLAY, spacing = 0) {
    setFont(c, weight, max, family, spacing);
    const w = c.measureText(text).width;
    const size = w > width ? max * width / w : max;
    setFont(c, weight, size, family, spacing);
    return size;
  }
  // Glyph centres (x offsets from the left edge) for per-letter animation.
  function glyphCentres(c, text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      const a = c.measureText(text.slice(0, i)).width;
      const b = c.measureText(text[i]).width;
      out.push(a + b / 2);
    }
    return out;
  }

  // ---------------------------------------------------------------- logo
  const LOGO = window.HF_LOGO;
  const LOGO_PATH = new Path2D();
  for (const poly of LOGO.outline) {
    poly.forEach(([x, y], i) => (i ? LOGO_PATH.lineTo(x, y) : LOGO_PATH.moveTo(x, y)));
    LOGO_PATH.closePath();
  }
  const CL = LOGO.center, CL_S = [0];
  for (let i = 1; i < CL.length; i++) {
    CL_S.push(CL_S[i - 1] + Math.hypot(CL[i][0] - CL[i - 1][0], CL[i][1] - CL[i - 1][1]));
  }
  const CL_LEN = CL_S[CL_S.length - 1];
  const LOGO_MID = LOGO.size / 2;

  function polyAt(pts, cum, s) {
    s = clamp(s, 0, cum[cum.length - 1]);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const a = pts[lo], b = pts[hi];
    return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function polyPath(c, pts, cum, s0, s1, map) {
    const p0 = polyAt(pts, cum, s0);
    let q = map ? map(p0.x, p0.y) : [p0.x, p0.y];
    c.moveTo(q[0], q[1]);
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] <= s0) continue;
      if (cum[i] >= s1) break;
      q = map ? map(pts[i][0], pts[i][1]) : pts[i];
      c.lineTo(q[0], q[1]);
    }
    const p1 = polyAt(pts, cum, s1);
    q = map ? map(p1.x, p1.y) : [p1.x, p1.y];
    c.lineTo(q[0], q[1]);
  }

  let logoBuf = null;
  // Lime rounded square with the black squiggle. reveal < 1 draws the squiggle on along its centreline.
  function drawLogo(c, x, y, size, reveal = 1, rot = 0) {
    const k = size / LOGO.size;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = COL.lime;
    c.beginPath();
    c.roundRect(-size / 2, -size / 2, size, size, LOGO.radius * k);
    c.fill();
    if (reveal >= 1) {
      c.translate(-size / 2, -size / 2);
      c.scale(k, k);
      c.fillStyle = COL.ink;
      c.fill(LOGO_PATH, 'evenodd');
    } else if (reveal > 0) {
      const n = Math.ceil(size) + 2;
      if (!logoBuf) logoBuf = document.createElement('canvas');
      if (logoBuf.width < n) { logoBuf.width = n; logoBuf.height = n; }
      const b = logoBuf.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-over';
      b.clearRect(0, 0, logoBuf.width, logoBuf.height);
      b.scale(k, k);
      b.fillStyle = COL.ink;
      b.fill(LOGO_PATH, 'evenodd');
      b.globalCompositeOperation = 'destination-in';
      b.lineWidth = 66;
      b.lineCap = 'butt';
      b.lineJoin = 'round';
      b.beginPath();
      polyPath(b, CL, CL_S, 0, reveal * CL_LEN);
      b.stroke();
      c.drawImage(logoBuf, 0, 0, size, size, -size / 2, -size / 2, size, size);
    }
    c.restore();
  }

  // Additive neon stroke: wide faint halo passes, solid body, hot core.
  function glow(c, build, color, width, alpha = 1, core = '#F6FFD9') {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = color;
    for (const [m, a] of [[5.5, 0.05], [3.2, 0.1], [1.8, 0.22]]) {
      c.globalAlpha = a * alpha;
      c.lineWidth = width * m;
      c.beginPath(); build(c); c.stroke();
    }
    c.globalAlpha = alpha;
    c.lineWidth = width;
    c.beginPath(); build(c); c.stroke();
    if (core) {
      c.strokeStyle = core;
      c.globalAlpha = 0.85 * alpha;
      c.lineWidth = width * 0.4;
      c.beginPath(); build(c); c.stroke();
    }
    c.restore();
  }

  function flare(c, x, y, r, a, color = COL.lime) {
    if (a <= 0) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    blob(c, x, y, r * 3.2, color, 0.35 * a);
    blob(c, x, y, r, '#FFFFFF', 0.95 * a);
    c.translate(x, y);
    c.scale(9, 0.16);
    blob(c, 0, 0, r * 1.6, COL.cyan, 0.5 * a);
    c.restore();
  }

  function speedLines(c, cx, cy, amount, seed, tm, color = '#FFFFFF', inward = false) {
    if (amount <= 0) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = color;
    c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = rnd(i, seed) * Math.PI * 2;
      let ph = (rnd(i, seed + 1) + tm * (1.1 + rnd(i, seed + 2) * 1.6)) % 1;
      if (inward) ph = 1 - ph;
      const r0 = lerp(140, 1500, ph * ph), len = lerp(40, 560, ph) * amount;
      c.globalAlpha = amount * 0.55 * Math.sin(ph * Math.PI);
      c.lineWidth = 1 + rnd(i, seed + 3) * 3;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      c.stroke();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- world paintings
  function paintCity(c, w, h) {
    const u = w / 360;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#12002b'); g.addColorStop(0.42, '#7a1fa2');
    g.addColorStop(0.6, '#ff2d9b'); g.addColorStop(0.74, '#ff7a1a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const sx = w / 2, sy = h * 0.6, sr = w * 0.3;
    const sg = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#ffe66b'); sg.addColorStop(1, '#ff2d9b');
    c.save();
    c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.clip();
    c.fillStyle = sg; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    c.fillStyle = '#8a249f';
    for (let i = 0; i < 7; i++) c.fillRect(sx - sr, sy + sr * (0.08 + i * 0.13), sr * 2, (2 + i * 1.6) * u);
    c.restore();
    const base = h * 0.74;
    let x = -10;
    for (let i = 0; x < w + 10; i++) {
      const bw = (26 + rnd(i, 11) * 52) * u, bh = (90 + rnd(i, 12) * 260) * u;
      c.fillStyle = '#14062a'; c.fillRect(x, base - bh, bw, bh + 4);
      for (let r = 0; (r + 1) * 14 * u < bh - 8 * u; r++) {
        for (let q = 0; (q + 1) * 10 * u < bw - 6 * u; q++) {
          const v = rnd(i * 977 + r * 31 + q, 13);
          if (v < 0.34) {
            c.fillStyle = v < 0.12 ? COL.cyan : v < 0.22 ? COL.magenta : '#FFD86B';
            c.fillRect(x + 5 * u + q * 10 * u, base - bh + 10 * u + r * 14 * u, 4 * u, 6 * u);
          }
        }
      }
      x += bw + 2 * u;
    }
    c.fillStyle = '#0c0220'; c.fillRect(0, base, w, h - base);
    c.strokeStyle = 'rgba(255,45,155,0.8)'; c.lineWidth = 1.5 * u;
    for (let k = 1; k < 9; k++) {
      const yy = base + (h - base) * Math.pow(k / 9, 1.8);
      c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke();
    }
    for (let k = -8; k <= 8; k++) {
      c.beginPath(); c.moveTo(w / 2 + k * w * 0.04, base); c.lineTo(w / 2 + k * w * 0.32, h); c.stroke();
    }
  }

  function wavyLayer(c, w, h, f, col, foam, lw) {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, h);
    for (let k = 0; k <= 48; k++) { const x = k / 48 * w; c.lineTo(x, f(x)); }
    c.lineTo(w, h); c.closePath(); c.fill();
    if (foam) {
      c.strokeStyle = foam; c.lineWidth = lw;
      c.beginPath();
      for (let k = 0; k <= 48; k++) { const x = k / 48 * w; k ? c.lineTo(x, f(x)) : c.moveTo(x, f(x)); }
      c.stroke();
    }
  }

  function paintOcean(c, w, h) {
    const u = w / 360;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04123a'); g.addColorStop(0.4, '#1560d0'); g.addColorStop(0.52, '#8ef3ff');
    g.addColorStop(0.53, '#0e4fb8'); g.addColorStop(1, '#021038');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    blob(c, w * 0.3, h * 0.22, w * 0.5, '#E8FBFF', 0.5);
    c.fillStyle = '#F4FDFF'; c.beginPath(); c.arc(w * 0.3, h * 0.22, w * 0.07, 0, Math.PI * 2); c.fill();
    const layers = [['#0b3a9a', 0.56, 0.02], ['#0f5bd1', 0.63, 0.035], ['#1696e8', 0.72, 0.05], ['#18c8f5', 0.83, 0.06], ['#7ef0ff', 0.95, 0.05]];
    layers.forEach(([col, yb, amp], i) => {
      const f = x => h * yb + Math.sin(x / w * Math.PI * (2 + i * 0.7) + i * 1.9) * h * amp * 0.6
        - Math.pow(Math.max(0, Math.sin(x / w * Math.PI * (1 + i * 0.3) + i)), 3) * h * amp * 1.8;
      wavyLayer(c, w, h, f, col, 'rgba(255,255,255,0.8)', (1.5 + i) * u);
    });
  }

  function paintDesert(c, w, h) {
    const u = w / 360;
    const g = c.createLinearGradient(0, 0, 0, h * 0.62);
    g.addColorStop(0, '#ff2d9b'); g.addColorStop(0.55, '#ff7a1a'); g.addColorStop(1, '#ffd27a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    blob(c, w * 0.62, h * 0.42, w * 0.7, '#FFF3C4', 0.6);
    c.fillStyle = '#FFF6D8'; c.beginPath(); c.arc(w * 0.62, h * 0.42, w * 0.14, 0, Math.PI * 2); c.fill();
    const layers = [['#f59331', 0.56, 0.05], ['#e0681c', 0.64, 0.06], ['#bf4712', 0.75, 0.07], ['#7d260a', 0.88, 0.06]];
    layers.forEach(([col, yb, amp], i) => {
      const f = x => h * yb + Math.sin(x / w * Math.PI * (1.4 + i * 0.5) + i * 2.1) * h * amp;
      wavyLayer(c, w, h, f, col, 'rgba(255,230,180,0.55)', 2 * u);
    });
  }

  function paintGalaxy(c, w, h) {
    const u = w / 360;
    c.fillStyle = '#06010f'; c.fillRect(0, 0, w, h);
    blob(c, w * 0.5, h * 0.45, w * 0.9, COL.violet, 0.45);
    blob(c, w * 0.35, h * 0.36, w * 0.6, COL.magenta, 0.35);
    blob(c, w * 0.7, h * 0.6, w * 0.55, COL.cyan, 0.25);
    for (let i = 0; i < 320; i++) {
      const s = (0.6 + rnd(i, 91) * 1.8) * u;
      c.fillStyle = `rgba(255,255,255,${0.3 + rnd(i, 92) * 0.7})`;
      c.fillRect(rnd(i, 93) * w, rnd(i, 94) * h, s, s);
    }
    c.save();
    c.translate(w * 0.5, h * 0.45); c.rotate(-0.4); c.scale(1, 0.55);
    for (let i = 0; i < 1400; i++) {
      const th = (i / 1400) * 9 + (i % 2) * Math.PI;
      const r = 10 * u * Math.exp(0.3 * (i / 1400) * 9);
      const x = Math.cos(th) * r + (rnd(i, 95) - 0.5) * r * 0.5;
      const y = Math.sin(th) * r + (rnd(i, 96) - 0.5) * r * 0.5;
      const s = (0.8 + rnd(i, 97) * 2.2) * u, v = rnd(i, 98);
      c.fillStyle = v < 0.5 ? 'rgba(255,220,250,0.85)' : v < 0.8 ? 'rgba(255,45,155,0.8)' : 'rgba(24,224,255,0.8)';
      c.fillRect(x, y, s, s);
    }
    blob(c, 0, 0, 40 * u, '#FFFFFF', 0.9);
    c.restore();
  }

  function paintBrand(c, w, h) {
    c.fillStyle = COL.lime; c.fillRect(0, 0, w, h);
    const s = w * 0.95 / LOGO.size;
    c.save();
    c.translate((w - LOGO.size * s) / 2, (h - LOGO.size * s) / 2);
    c.scale(s, s);
    c.fillStyle = COL.ink; c.fill(LOGO_PATH, 'evenodd');
    c.restore();
  }

  function ridge(c, w, hz, seed, amp, col, n = 24) {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, hz + 1);
    for (let i = 0; i <= n; i++) {
      const x = i / n * w;
      c.lineTo(x, hz - amp * (0.35 + 0.65 * rnd(i, seed)) * (0.6 + 0.4 * Math.sin(i * 0.7 + seed)));
    }
    c.lineTo(w, hz + 1); c.closePath(); c.fill();
  }

  function paintAurora(c, w, h) {
    const u = w / 360;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#01060f'); g.addColorStop(0.6, '#062a3f'); g.addColorStop(1, '#020a12');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(255,255,255,${0.3 + rnd(i, 121) * 0.6})`;
      const s = (0.6 + rnd(i, 122) * 1.4) * u;
      c.fillRect(rnd(i, 123) * w, rnd(i, 124) * h * 0.7, s, s);
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    const cols = [COL.cyan, COL.lime, COL.violet, COL.cyan, COL.lime];
    for (let b = 0; b < 5; b++) {
      c.strokeStyle = cols[b];
      for (const [a, lw] of [[0.06, 70], [0.12, 34], [0.35, 8]]) {
        c.globalAlpha = a; c.lineWidth = lw * u;
        c.beginPath();
        for (let k = 0; k <= 50; k++) {
          const x = k / 50 * (w + 40) - 20;
          const y = h * (0.18 + b * 0.07) + Math.sin(x / w * 5 + b * 1.3) * 40 * u + Math.sin(x / w * 13 + b) * 12 * u;
          k ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
    ridge(c, w, h * 0.86, 131, h * 0.2, '#03121c');
    ridge(c, w, h * 0.92, 132, h * 0.12, '#01070c');
    c.fillStyle = '#01070c'; c.fillRect(0, h * 0.92, w, h * 0.08);
  }

  // Sunset lake. tm/alive animate it for the "image comes alive" moment; tm = 0, alive = 0 is the still photo.
  function paintSunset(c, w, h, tm = 0, alive = 0) {
    const u = w / 360, hz = h * 0.6;
    let g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#1b0a3d'); g.addColorStop(0.38, '#5b1e86'); g.addColorStop(0.68, '#e0399b');
    g.addColorStop(0.9, '#ff8a3d'); g.addColorStop(1, '#ffc56b');
    c.fillStyle = g; c.fillRect(0, 0, w, hz + 1);
    for (let i = 0; i < 70; i++) {
      const tw = alive ? 0.55 + 0.45 * Math.sin(tm * 7 + i * 1.7) : 1;
      c.fillStyle = `rgba(255,255,255,${(0.25 + 0.5 * rnd(i, 61)) * tw})`;
      c.fillRect(rnd(i, 62) * w, rnd(i, 63) * hz * 0.45, 1.6 * u, 1.6 * u);
    }
    const sx = w * 0.5, sy = hz - h * 0.045 - alive * tm * h * 0.012, sr = w * 0.12;
    blob(c, sx, sy, w * 0.8, '#FF9A3C', 0.55 + 0.12 * alive * Math.sin(tm * 5));
    c.fillStyle = '#FFF0C2'; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 7; i++) {
      const cy = hz * (0.3 + rnd(i, 64) * 0.45), cw = w * (0.3 + rnd(i, 65) * 0.5), ch = h * (0.006 + rnd(i, 66) * 0.01);
      const cx = (rnd(i, 67) * 1.4 - 0.2) * w + alive * tm * w * (0.06 + rnd(i, 68) * 0.1);
      c.fillStyle = i % 2 ? 'rgba(255,120,180,0.35)' : 'rgba(120,60,180,0.42)';
      c.beginPath(); c.ellipse(cx, cy, cw / 2, ch, 0, 0, Math.PI * 2); c.fill();
    }
    ridge(c, w, hz, 71, h * 0.13, '#3b1660');
    ridge(c, w, hz, 72, h * 0.085, '#2a0f4a');
    ridge(c, w, hz, 73, h * 0.05, '#1c0a33');
    g = c.createLinearGradient(0, hz, 0, h);
    g.addColorStop(0, '#ff9a54'); g.addColorStop(0.08, '#b8357f'); g.addColorStop(0.5, '#3a1460'); g.addColorStop(1, '#12062a');
    c.fillStyle = g; c.fillRect(0, hz, w, h - hz);
    for (let i = 0; i < 46; i++) {
      const y = hz + Math.pow(i / 46, 1.6) * (h - hz) * 0.85 + 2 * u;
      const spread = (0.08 + i / 46 * 0.35) * w;
      const x = sx + (rnd(i, 74) - 0.5) * spread + alive * Math.sin(tm * 4 + i) * 12 * u;
      const len = (10 + rnd(i, 75) * 40) * u * (1 - i / 60) * (alive ? 0.8 + 0.4 * Math.sin(tm * 6 + i * 2.3) : 1);
      c.fillStyle = `rgba(255,${200 - i * 2},${150 - i},${0.75 - i / 70})`;
      c.fillRect(x - len / 2, y, len, (1.2 + i * 0.05) * u);
    }
    c.fillStyle = '#0a0418';
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.86);
    c.quadraticCurveTo(w * 0.25, h * 0.84, w * 0.45, h * 0.9);
    c.quadraticCurveTo(w * 0.7, h * 0.96, w, h * 0.9);
    c.lineTo(w, h); c.closePath(); c.fill();
    if (alive) {
      c.strokeStyle = '#1a0a2e'; c.lineWidth = 2.2 * u; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const bx = ((rnd(i, 81) * w + tm * w * 0.14 * (1 + rnd(i, 82))) % (w * 1.2)) - w * 0.1;
        const by = hz * (0.35 + rnd(i, 83) * 0.3), fl = Math.sin(tm * 16 + i * 2) * 5 * u, s = (6 + rnd(i, 84) * 5) * u;
        c.beginPath();
        c.moveTo(bx - s, by - fl);
        c.quadraticCurveTo(bx - s * 0.4, by - 2 * u, bx, by);
        c.quadraticCurveTo(bx + s * 0.4, by - 2 * u, bx + s, by - fl);
        c.stroke();
      }
    }
  }

  const WORLD_ACCENTS = [
    [COL.magenta, COL.orange, COL.violet], [COL.cyan, '#1b6fd8', '#FFFFFF'], [COL.orange, '#FFD27A', COL.magenta],
    [COL.violet, COL.magenta, COL.cyan], [COL.lime, COL.ink], [COL.cyan, COL.lime, COL.violet], [COL.orange, COL.magenta, '#FFD27A']
  ];

  // ---------------------------------------------------------------- assets
  const A = {};
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  const S4 = { tw: 760, th: 1013, border: 18, cx: 540, cy: 1010, rot: -0.05, ix: 90, iy: -150 };
  const TW2 = S4.tw / 2 + S4.border, TH2 = S4.th / 2 + S4.border;

  function buildAssets() {
    const painters = [paintCity, paintOcean, paintDesert, paintGalaxy, paintBrand, paintAurora, paintSunset];
    A.worlds = painters.map(p => { const c = makeCanvas(540, 960); p(c.getContext('2d'), 540, 960); return c; });
    A.hero = makeCanvas(W, H);
    paintSunset(A.hero.getContext('2d'), W, H);

    const S = 1.5, b = S4.border;
    A.tile = makeCanvas(Math.round(TW2 * 2 * S), Math.round(TH2 * 2 * S));
    const tc = A.tile.getContext('2d');
    tc.scale(S, S);
    tc.fillStyle = '#FFFFFF';
    tc.beginPath(); tc.roundRect(0, 0, TW2 * 2, TH2 * 2, 14); tc.fill();
    tc.save();
    tc.translate(b, b);
    tc.beginPath(); tc.roundRect(0, 0, S4.tw, S4.th, 6); tc.clip();
    paintSunset(tc, S4.tw, S4.th);
    tc.restore();
    tc.fillStyle = 'rgba(21,19,20,0.85)';
    tc.beginPath(); tc.roundRect(b + 24, b + 24, 176, 56, 28); tc.fill();
    tc.fillStyle = COL.lime;
    tc.beginPath(); tc.arc(b + 54, b + 52, 8, 0, Math.PI * 2); tc.fill();
    setFont(tc, 700, 24, TEXT, 4);
    tc.textAlign = 'left'; tc.textBaseline = 'middle';
    tc.fillText('IMAGE', b + 74, b + 53);

    A.dots = makeCanvas(W, H);
    const dc = A.dots.getContext('2d');
    dc.fillStyle = 'rgba(255,255,255,0.09)';
    for (let y = 24; y < H; y += 48) for (let x = 24; x < W; x += 48) dc.fillRect(x - 1.5, y - 1.5, 3, 3);

    A.grain = [];
    let seed = 12345;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 4; k++) {
      const c = makeCanvas(540, 960), g = c.getContext('2d'), img = g.createImageData(540, 960);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 40 + rand() * 175;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      A.grain.push(c);
    }
    A.text = makeCanvas(W, 700);
    A.alive = makeCanvas(W, H);
    const vg = makeCanvas(W, H), vc = vg.getContext('2d');
    const gr = vc.createRadialGradient(CX, CY, H * 0.32, CX, CY, H * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    vc.fillStyle = gr; vc.fillRect(0, 0, W, H);
    A.vignette = vg;
    initS3();
    initShards();
  }

  // ---------------------------------------------------------------- scene 1: SPARK (0 - 2 s)
  const S1K = 2.0;
  const s1Head = t => ease.inOutCubic(prog(t, 0.22, 1.74)) * CL_LEN;
  const s1Map = (x, y) => [(x - LOGO_MID) * S1K, (y - LOGO_MID) * S1K];

  function scene1(c, t) {
    c.fillStyle = '#030303';
    c.fillRect(-W, -H, 3 * W, 3 * H);
    blob(c, CX, CY, 900, COL.violet, 0.12 * prog(t, 0.2, 1.2));
    const sH = s1Head(t);
    const head = polyAt(CL, CL_S, sH);
    const [hx, hy] = s1Map(head.x, head.y);
    const cam = polyAt(CL, CL_S, s1Head(t - 0.08));
    const [cx, cy] = s1Map(cam.x, cam.y);
    const zoom = lerp(0.95, 1.5, ease.inOutCubic(prog(t, 0.15, 1.5))) * lerp(1, 5.5, ease.inExpo(prog(t, 1.55, 2.0)));
    const roll = lerp(-0.12, 0.08, ease.inOutCubic(prog(t, 0, 2)));
    c.save();
    c.translate(CX, CY); c.scale(zoom, zoom); c.rotate(roll); c.translate(-cx, -cy);
    if (sH > 0.5) {
      glow(c, b => polyPath(b, CL, CL_S, 0, sH, s1Map), COL.lime, 13, 0.5);
      glow(c, b => polyPath(b, CL, CL_S, Math.max(0, sH - 240), sH, s1Map), COL.lime, 15, 1);
    }
    // sparks streaming off the head
    const rate = 200, t0 = 0.22, n = Math.floor((Math.min(t, 1.85) - t0) * rate);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = Math.max(0, n - 170); i < n; i++) {
      const te = t0 + i / rate, age = t - te, life = 0.25 + rnd(i, 1) * 0.45;
      if (age < 0 || age > life) continue;
      const hp = polyAt(CL, CL_S, s1Head(te));
      const [px, py] = s1Map(hp.x, hp.y);
      const ang = hp.a + Math.PI + (rnd(i, 2) - 0.5) * 2.8;
      const sp = 220 + rnd(i, 3) * 850, ex = Math.exp(-3.2 * age);
      const x = px + Math.cos(ang) * sp * drag(3.2, age), y = py + Math.sin(ang) * sp * drag(3.2, age) + 130 * age * age;
      const vx = Math.cos(ang) * sp * ex, vy = Math.sin(ang) * sp * ex + 260 * age;
      const v = rnd(i, 4);
      c.strokeStyle = v < 0.25 ? '#FFFFFF' : v < 0.85 ? COL.lime : COL.cyan;
      c.globalAlpha = 1 - age / life;
      c.lineWidth = 2 + rnd(i, 5) * 2.6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - vx * 0.035, y - vy * 0.035); c.stroke();
    }
    c.restore();
    const ign = ease.outExpo(prog(t, 0.0, 0.2)) * (0.75 + 0.25 * rnd(Math.floor(t * 60), 7));
    flare(c, hx, hy, 30, ign);
    c.restore();
    speedLines(c, CX, CY, prog(t, 1.4, 2.0), 21, t);
  }

  // ---------------------------------------------------------------- scene 2: TYPE A PROMPT (2 - 4 s)
  const PROMPT = 'a neon city exploding into color';
  const T_TYPE0 = 2.3, T_TYPE1 = 3.1, T_PRESS = 3.2, T_SLICE = 3.46, T_BOOM = 3.5;
  const SLICE = [[-220, 1500], [300, 700], [760, 1120], [1320, 340]];
  function bez(p, u) {
    const v = 1 - u;
    return [
      v * v * v * p[0][0] + 3 * v * v * u * p[1][0] + 3 * v * u * u * p[2][0] + u * u * u * p[3][0],
      v * v * v * p[0][1] + 3 * v * v * u * p[1][1] + 3 * v * u * u * p[2][1] + u * u * u * p[3][1]
    ];
  }
  function star(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    c.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    c.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    c.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    c.fill();
  }

  function scene2(c, t) {
    c.fillStyle = '#08060c';
    c.fillRect(-W, -H, 3 * W, 3 * H);
    blob(c, 220 + 70 * Math.sin(t * 1.3), 520, 780, COL.magenta, 0.34);
    blob(c, 900, 1460 + 60 * Math.cos(t * 1.1), 880, COL.violet, 0.4);
    blob(c, 780, 260, 540, COL.cyan, 0.16);
    c.drawImage(A.dots, 0, 0);

    const tau = slowmo(t - T_BOOM, 0.07, 0.32, 0.2, 1.7);
    const boomed = t >= T_BOOM;
    const appear = ease.outBack(prog(t, 2.0, 2.34));
    const rot = lerp(-0.2, -0.07, ease.outCubic(prog(t, 2.0, 2.6))) + 0.02 * (t - 2);
    const sc = lerp(0.5, 1, appear) * (1 + 0.03 * (t - 2));
    c.save();
    c.translate(540 + lerp(40, -20, ease.outCubic(prog(t, 2, 3.5))), 900);
    c.rotate(rot);
    c.scale(sc, sc);

    const size = fit(c, PROMPT, 500, 46, 740, TEXT);
    const x0 = -300, textW = c.measureText(PROMPT).width, centres = glyphCentres(c, PROMPT);

    const barA = clamp(appear * 1.5) * (1 - prog(t, T_BOOM, T_BOOM + 0.1));
    if (barA > 0) {
      c.save();
      c.globalAlpha = barA;
      const bs = 1 + 0.12 * ease.outCubic(prog(t, T_BOOM, T_BOOM + 0.1));
      c.scale(bs, bs);
      setFont(c, 700, 26, TEXT, 7);
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = COL.lime;
      c.fillText('PROMPT', -476, -136);
      c.beginPath(); c.roundRect(-480, -100, 960, 200, 44);
      c.shadowColor = 'rgba(209,254,23,0.3)'; c.shadowBlur = 60;
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill();
      c.shadowBlur = 0; c.shadowColor = 'transparent';
      const hl = c.createLinearGradient(0, -100, 0, 100);
      hl.addColorStop(0, 'rgba(255,255,255,0.16)'); hl.addColorStop(0.5, 'rgba(255,255,255,0.02)'); hl.addColorStop(1, 'rgba(255,255,255,0.06)');
      c.fillStyle = hl; c.fill();
      c.lineWidth = 2; c.strokeStyle = boomed ? '#FFFFFF' : 'rgba(255,255,255,0.32)'; c.stroke();
      drawLogo(c, -385, 0, 112);
      c.restore();
    }

    setFont(c, 500, size, TEXT);
    c.textBaseline = 'middle';
    if (!boomed) {
      const n = Math.floor(prog(t, T_TYPE0, T_TYPE1) * PROMPT.length);
      const typed = PROMPT.slice(0, n);
      c.textAlign = 'left';
      c.fillStyle = '#FFFFFF';
      c.globalAlpha = clamp(appear);
      c.fillText(typed, x0, 2);
      const typing = t >= T_TYPE0 - 0.1 && t < T_TYPE1 + 0.05;
      if (typing || Math.floor((t - T_TYPE1) * 5) % 2 === 0) {
        c.fillStyle = COL.lime;
        c.fillRect(x0 + c.measureText(typed).width + 8, -28, 4, 58);
      }
      c.globalAlpha = 1;
    } else {
      c.textAlign = 'center';
      for (let i = 0; i < PROMPT.length; i++) {
        if (PROMPT[i] === ' ') continue;
        const side = rnd(i, 201) < 0.5 ? -1 : 1;
        const vx = (rnd(i, 202) - 0.5) * 1800, vy = side * (450 + rnd(i, 203) * 1300);
        const x = x0 + centres[i] + vx * drag(1.6, tau), y = 2 + vy * drag(1.6, tau) + 550 * tau * tau;
        const a = 1 - prog(tau, 0.3, 0.75);
        if (a <= 0) continue;
        c.save();
        c.translate(x, y);
        c.rotate((rnd(i, 204) - 0.5) * 14 * tau);
        c.scale(1 + 1.6 * tau, 1 + 1.6 * tau);
        c.globalAlpha = a;
        c.fillStyle = tau < 0.02 ? '#FFFFFF' : ACCENTS[i % 5];
        c.fillText(PROMPT[i], 0, 0);
        c.restore();
      }
      // pixel confetti
      for (let i = 0; i < 320; i++) {
        const a = 1 - prog(tau, 0.35, 0.85);
        if (a <= 0) break;
        const ox = x0 + rnd(i, 211) * textW, oy = (rnd(i, 212) - 0.5) * 50;
        const ang = rnd(i, 213) * Math.PI * 2, sp = 300 + Math.pow(rnd(i, 214), 2) * 2600;
        const x = ox + Math.cos(ang) * sp * drag(2.4, tau), y = oy + Math.sin(ang) * sp * drag(2.4, tau) + 450 * tau * tau;
        const s = 6 + rnd(i, 215) * 24;
        c.save();
        c.translate(x, y);
        c.rotate(rnd(i, 216) * 0.6 + tau * (rnd(i, 217) - 0.5) * 18);
        c.globalAlpha = a;
        c.fillStyle = ACCENTS[i % 5];
        c.fillRect(-s / 2, -s / 2, s, s);
        c.restore();
      }
      // shockwave
      const k = tau / 0.4;
      if (k < 1) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = '#FFFFFF';
        c.globalAlpha = 1 - k;
        c.lineWidth = 14 * (1 - k) + 1;
        c.beginPath(); c.arc(x0 + textW / 2, 0, 40 + 1300 * ease.outCubic(k), 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    }

    // Generate button
    let bs = 1;
    if (t >= T_PRESS && t < T_PRESS + 0.08) bs = 1 - 0.1 * ease.outCubic(prog(t, T_PRESS, T_PRESS + 0.08));
    else if (t >= T_PRESS + 0.08) bs = 0.9 + 0.1 * ease.outBack(prog(t, T_PRESS + 0.08, T_PRESS + 0.24));
    const fly = boomed ? tau : 0;
    const ba = clamp(prog(t, 2.2, 2.45)) * (1 - prog(tau, 0.2, 0.6));
    if (ba > 0) {
      c.save();
      c.translate(330 + 500 * fly, 178 + 900 * fly * fly);
      c.rotate(3 * fly);
      c.scale(bs, bs);
      c.globalAlpha = ba;
      c.beginPath(); c.roundRect(-150, -48, 300, 96, 48);
      c.shadowColor = rgba(COL.lime, 0.55); c.shadowBlur = t >= T_PRESS ? 50 : 24;
      c.fillStyle = COL.lime; c.fill();
      c.shadowBlur = 0; c.shadowColor = 'transparent';
      c.fillStyle = COL.ink;
      setFont(c, 800, 36, DISPLAY);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Generate', -16, 2);
      star(c, 98, 0, 16);
      c.restore();
    }
    c.restore();

    // the slicing ribbon
    const head = ease.outCubic(prog(t, T_SLICE, T_SLICE + 0.12));
    const tail = ease.inCubic(prog(t, T_SLICE + 0.1, T_SLICE + 0.42));
    if (head > tail) {
      glow(c, b => {
        for (let i = 0; i <= 60; i++) {
          const p = bez(SLICE, lerp(tail, head, i / 60));
          i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]);
        }
      }, COL.lime, 34);
    }
  }

  function whipPan(c, t) {
    const k = ease.inCubic(prog(t, 3.86, 4.0));
    c.save(); c.translate(-k * W, 0); scene2(c, t); c.restore();
    c.save(); c.translate(W * (1 - k), 0); scene3(c, 4.0); c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const y = rnd(i, 401) * H, len = 200 + rnd(i, 402) * 900, x = rnd(i, 403) * W;
      c.globalAlpha = 0.4 * k * rnd(i, 404);
      c.fillStyle = i % 5 === 0 ? COL.lime : '#FFFFFF';
      c.fillRect(x - len / 2, y, len, 1 + rnd(i, 405) * 3);
    }
    c.restore();
  }

  // ---------------------------------------------------------------- scene 3: WORLDS EXPLODE (4 - 6.5 s)
  const S3 = { v: 3.4, n: 84, zb: 0.95, cw: 300, ch: 533 };
  let S3_CARDS = [];
  function initS3() {
    S3_CARDS = [];
    for (let i = 0; i < S3.n; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 30; k++) {
        x = (rnd(i * 31 + k, 301) - 0.5) * 2000;
        y = (rnd(i * 31 + k, 302) - 0.5) * 3200;
        if (Math.abs(x) > 260 || Math.abs(y) > 470) break;
      }
      S3_CARDS.push({ x, y, z0: 0.4 + (i / S3.n) * 9.6 + rnd(i, 303) * 0.08, world: i % 7, rot: (rnd(i, 304) - 0.5) * 0.5 });
    }
  }
  function drawCard(c, img, x, y, w, h, rot, alpha, border = 'rgba(255,255,255,0.85)') {
    if (alpha <= 0) return;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate(rot);
    c.beginPath();
    c.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.06);
    c.save(); c.clip();
    c.drawImage(img, -w / 2, -h / 2, w, h);
    c.restore();
    c.lineWidth = Math.max(1, w * 0.012);
    c.strokeStyle = border;
    c.stroke();
    c.restore();
  }
  const S3_WORDS = [['CITIES', COL.magenta], ['OCEANS', COL.cyan], ['DESERTS', COL.orange], ['GALAXIES', COL.violet], ['YOUR IDEA.', COL.lime]];
  const beatPulse = (t, start) => (t < start ? 0 : Math.exp(-((t - start) % 0.5) * 8));

  function punchText(c, text, x, y, size, color, k, opts = {}) {
    // k = seconds since the word landed
    const s = 1 + (opts.punch ?? 0.45) * (1 - ease.outExpo(prog(k, 0, 0.18)));
    setFont(c, 900, size, DISPLAY, opts.spacing ?? -2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.save();
    c.translate(x, y);
    c.rotate(opts.rot ?? 0);
    c.scale(s, s);
    const split = 16 * (1 - prog(k, 0, 0.12));
    if (split > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.8;
      c.fillStyle = COL.magenta; c.fillText(text, -split, 0);
      c.fillStyle = COL.cyan; c.fillText(text, split, 0);
      c.restore();
    }
    c.fillStyle = color;
    c.fillText(text, opts.dx ?? 9, opts.dy ?? 10);
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = 40;
    c.fillStyle = opts.fill ?? '#FFFFFF';
    c.fillText(text, 0, 0);
    c.restore();
  }

  function scene3(c, t) {
    c.fillStyle = '#05040c';
    c.fillRect(-W, -H, 3 * W, 3 * H);
    const pulse = beatPulse(t, 4);
    blob(c, CX, CY, 1000, COL.violet, 0.32 + 0.12 * pulse);
    blob(c, CX, CY, 520, COL.magenta, 0.2 + 0.2 * pulse);
    const roll = 0.18 * Math.sin((t - 4) * 1.6) + (t - 4) * 0.1;
    const zc = S3.v * (t - 4);
    c.save();
    c.translate(CX, CY); c.rotate(roll); c.translate(-CX, -CY);
    speedLines(c, CX, CY, 0.8, 37, t);
    for (let i = S3.n - 1; i >= 0; i--) {
      const cd = S3_CARDS[i], Z = cd.z0 - zc;
      if (Z < 0.15 || Z > 10.5) continue;
      const s = 1 / Z, x = CX + cd.x * s, y = CY + cd.y * s, w = S3.cw * s, h = S3.ch * s;
      if (x + w < -300 || x - w > W + 300 || y + h < -300 || y - h > H + 300) continue;
      let a = clamp((10.5 - Z) / 3), pop = 1;
      if (Z < S3.zb) { const k = prog(S3.zb - Z, 0, 0.3); a *= 1 - k; pop = 1 + 0.3 * k; }
      drawCard(c, A.worlds[cd.world], x, y, w * pop, h * pop, cd.rot, a);
    }
    // splash droplets from cards bursting open
    for (let i = 0; i < S3.n; i++) {
      const cd = S3_CARDS[i], tb = 4 + (cd.z0 - S3.zb) / S3.v, age = t - tb;
      if (age < 0 || age > 0.75) continue;
      const s = 1 / S3.zb, bx = CX + cd.x * s, by = CY + cd.y * s, acc = WORLD_ACCENTS[cd.world];
      const base = Math.atan2(by - CY, bx - CX);
      for (let j = 0; j < 14; j++) {
        const q = i * 17 + j, ang = base + (rnd(q, 311) - 0.5) * 2.4, sp = 300 + rnd(q, 312) * 1300;
        const x = bx + Math.cos(ang) * sp * drag(2.2, age), y = by + Math.sin(ang) * sp * drag(2.2, age) + 500 * age * age;
        const r = (8 + rnd(q, 313) * 30) * (1 - age / 0.75 * 0.6);
        c.globalAlpha = 1 - Math.pow(age / 0.75, 2);
        c.fillStyle = acc[j % acc.length];
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    // hero card: the crash zoom that becomes the next scene
    const zh = 9 * Math.pow(0.262 / 9, ease.inCubic(prog(t, 5.95, 6.5)));   // log-space zoom reads as constant acceleration
    const ha = clamp((10.5 - zh) / 3) * clamp((t - 4) / 0.3);
    drawCard(c, A.hero, CX, CY, S3.cw / zh, S3.ch / zh, 0, ha, 'rgba(255,255,255,0.9)');
    c.restore();
    speedLines(c, CX, CY, prog(t, 6.05, 6.45) * 1.4, 53, t * 1.5);

    const i = Math.floor((t - 4) / 0.5);
    if (i >= 0 && i < S3_WORDS.length && t < 6.3) {
      const [word, color] = S3_WORDS[i];
      const size = fit(c, word, 900, 200, 940, DISPLAY, -2);
      const out = prog(t, 6.12, 6.3);
      c.save();
      c.globalAlpha = 1 - out;
      punchText(c, word, CX, CY - 40, size * (1 + 1.5 * ease.inCubic(out)), color, t - (4 + i * 0.5), { rot: -0.06 });
      c.restore();
    }
  }

  // ---------------------------------------------------------------- scene 4: IMAGE TO MOTION (6.5 - 9 s)
  let SHARDS = [];
  function initShards() {
    SHARDS = [];
    const rays = 13, rings = [0, 80, 210, 400, 1500], ang = [], V = [];
    for (let j = 0; j < rays; j++) ang.push((j + rnd(j, 51) * 0.6) / rays * Math.PI * 2);
    for (let m = 0; m < rings.length; m++) {
      V.push(ang.map((a, j) => {
        const r = rings[m] * (m ? 0.85 + 0.3 * rnd(m * 97 + j, 52) : 0);
        return [S4.ix + Math.cos(a) * r, S4.iy + Math.sin(a) * r];
      }));
    }
    for (let m = 0; m < rings.length - 1; m++) {
      for (let j = 0; j < rays; j++) {
        const j2 = (j + 1) % rays;
        const poly = m === 0 ? [V[0][j], V[1][j], V[1][j2]] : [V[m][j], V[m + 1][j], V[m + 1][j2], V[m][j2]];
        const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
        if (Math.max(...xs) < -TW2 || Math.min(...xs) > TW2 || Math.max(...ys) < -TH2 || Math.min(...ys) > TH2) continue;
        let cx = 0, cy = 0;
        poly.forEach(p => { cx += clamp(p[0], -TW2, TW2); cy += clamp(p[1], -TH2, TH2); });
        cx /= poly.length; cy /= poly.length;
        let dx = cx - S4.ix, dy = cy - S4.iy;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        const q = m * 31 + j;
        SHARDS.push({ poly, cx, cy, dx, dy, sp: 220 + rnd(q, 53) * 650 + m * 140, rs: (rnd(q, 54) - 0.5) * 5, zs: 0.2 + rnd(q, 55) * 0.6 });
      }
    }
  }
  function tilePose(c, t) {
    const k = ease.outExpo(prog(t, 6.5, 6.8));
    c.translate(S4.cx, lerp(CY, S4.cy, k));
    c.rotate(lerp(0, S4.rot, k));
    const s = lerp(1.95, 1, k);
    c.scale(s, s);
  }
  function impactPoint() {
    const cs = Math.cos(S4.rot), sn = Math.sin(S4.rot);
    return { x: S4.cx + S4.ix * cs - S4.iy * sn, y: S4.cy + S4.ix * sn + S4.iy * cs };
  }
  const s4Tau = t => slowmo(t - 7.0, 0.06, 0.3, 0.25, 1.5);

  function staggerText(c, text, x, y, size, color, t0, t, opts = {}) {
    setFont(c, opts.weight ?? 900, size, DISPLAY, opts.spacing ?? -2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const total = c.measureText(text).width, centres = glyphCentres(c, text);
    for (let i = 0; i < text.length; i++) {
      const k = ease.outExpo(prog(t, t0 + i * (opts.step ?? 0.03), t0 + i * (opts.step ?? 0.03) + 0.3));
      if (k <= 0) continue;
      c.save();
      c.translate(x - total / 2 + centres[i], y + (opts.rise ?? 0) * (1 - k));
      const s = lerp(opts.from ?? 1, 1, k);
      c.scale(s, s);
      c.globalAlpha = clamp(k * 1.6);
      if (opts.shadow) { c.fillStyle = opts.shadow; c.fillText(text[i], 10, 12); }
      c.fillStyle = color;
      c.fillText(text[i], 0, 0);
      c.restore();
    }
  }

  function scene4(c, t) {
    c.fillStyle = COL.lime;
    c.fillRect(-W, -H, 3 * W, 3 * H);
    // headline on the lime ground
    staggerText(c, 'FROM STILL', CX, 300, fit(c, 'FROM STILL', 900, 160, 960, DISPLAY, -2), COL.ink, 6.56, t, { rise: 90, step: 0.014 });
    if (t < 7.0) {
      c.save();
      tilePose(c, t);
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 70; c.shadowOffsetY = 30;
      c.drawImage(A.tile, -TW2, -TH2, TW2 * 2, TH2 * 2);
      c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
      // cracks spreading from the impact point
      if (t > 6.86) {
        c.beginPath(); c.roundRect(-TW2, -TH2, TW2 * 2, TH2 * 2, 14); c.clip();
        for (let j = 0; j < 13; j++) {
          const len = 760 * ease.outExpo(prog(t, 6.86 + rnd(j, 61) * 0.04, 6.99));
          if (len <= 0) continue;
          const a0 = (j + rnd(j, 51) * 0.6) / 13 * Math.PI * 2;
          c.beginPath(); c.moveTo(S4.ix, S4.iy);
          for (let s = 1; s <= 8; s++) {
            const r = len * s / 8, a = a0 + (rnd(j * 9 + s, 62) - 0.5) * 0.22;
            c.lineTo(S4.ix + Math.cos(a) * r, S4.iy + Math.sin(a) * r);
          }
          c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
          c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.stroke();
        }
      }
      c.restore();
      return;
    }
    const tau = s4Tau(t), P = impactPoint();
    // paint splash that reveals the moving picture
    const blobs = [];
    for (let j = 0; j < 22; j++) {
      const a = rnd(j, 501) * Math.PI * 2, d = Math.pow(rnd(j, 502), 0.7) * 460 * clamp(tau * 4);
      const R = (110 + rnd(j, 503) * 300) * ease.outCubic(clamp(tau / (0.1 + rnd(j, 504) * 0.25)));
      blobs.push([P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, R]);
    }
    blobs.push([P.x, P.y, 2300 * ease.inOutCubic(prog(t, 7.12, 7.7))]);
    blobs.forEach(([x, y, r], j) => {
      if (r <= 0) return;
      c.fillStyle = ACCENTS[j % 4];
      c.beginPath(); c.arc(x, y, r + 34, 0, Math.PI * 2); c.fill();
    });
    const b = A.alive.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    paintSunset(b, W, H, t - 7.0, 1);
    b.globalCompositeOperation = 'destination-in';
    b.fillStyle = '#000';
    b.beginPath();
    blobs.forEach(([x, y, r]) => { if (r > 0) { b.moveTo(x + r, y); b.arc(x, y, r, 0, Math.PI * 2); } });
    b.fill();
    b.globalCompositeOperation = 'source-over';
    c.drawImage(A.alive, 0, 0);
    // flying paint drops
    for (let i = 0; i < 60; i++) {
      const a = 1 - prog(tau, 0.6, 1.1);
      if (a <= 0) break;
      const ang = rnd(i, 511) * Math.PI * 2, sp = 500 + rnd(i, 512) * 1900;
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      const x = P.x + vx * drag(1.8, tau), y = P.y + vy * drag(1.8, tau) + 700 * tau * tau;
      const r = 6 + rnd(i, 513) * 22;
      c.save();
      c.translate(x, y); c.rotate(ang);
      c.globalAlpha = a;
      c.fillStyle = ACCENTS[i % 5];
      c.beginPath(); c.ellipse(0, 0, r * (1 + 1.5 * Math.exp(-1.8 * tau)), r, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // glass shards of the still photo
    for (const sh of SHARDS) {
      const f = drag(1.1, tau);
      const dx = sh.dx * sh.sp * f, dy = sh.dy * sh.sp * f + 750 * tau * tau;
      c.save();
      c.translate(S4.cx, S4.cy); c.rotate(S4.rot);
      c.translate(sh.cx + dx, sh.cy + dy);
      c.rotate(sh.rs * tau);
      c.scale(1 + sh.zs * tau, 1 + sh.zs * tau);
      c.translate(-sh.cx, -sh.cy);
      c.beginPath(); c.roundRect(-TW2, -TH2, TW2 * 2, TH2 * 2, 14); c.clip();
      c.beginPath(); sh.poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
      c.clip();
      c.drawImage(A.tile, -TW2, -TH2, TW2 * 2, TH2 * 2);
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      c.restore();
    }
    // copy
    let punch = 0;
    for (const bt of [7.5, 8.0, 8.5]) if (t >= bt) punch = Math.exp(-(t - bt) * 12);
    c.save();
    c.translate(CX, 930); c.scale(1 + 0.06 * punch, 1 + 0.06 * punch); c.translate(-CX, -930);
    staggerText(c, 'TO', CX, 800, 130, '#FFFFFF', 7.28, t, { from: 2.2, shadow: COL.ink });
    staggerText(c, 'MOTION.', CX, 975, fit(c, 'MOTION.', 900, 240, 980, DISPLAY, -2), '#FFFFFF', 7.36, t, { from: 2.2, shadow: COL.ink });
    c.restore();
    // player chrome
    const ui = prog(t, 7.4, 7.6);
    if (ui > 0) {
      c.save();
      c.globalAlpha = ui;
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.roundRect(150, 1694, 850, 8, 4); c.fill();
      c.fillStyle = COL.lime;
      const pw = 850 * prog(t, 7.4, 8.9);
      c.beginPath(); c.roundRect(150, 1694, Math.max(8, pw), 8, 4); c.fill();
      c.beginPath(); c.arc(150 + pw, 1698, 14, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.moveTo(80, 1676); c.lineTo(112, 1698); c.lineTo(80, 1720); c.closePath(); c.fill();
      c.restore();
    }
  }

  function spiralOut(c, t) {
    const k = prog(t, 8.74, 9.0);
    c.save();
    c.translate(CX, CY);
    c.rotate(0.12 * ease.inCubic(k));
    const s = 1 + 1.8 * ease.inExpo(k);
    c.scale(s, s);
    c.translate(-CX, -CY);
    scene4(c, t);
    c.restore();
    speedLines(c, CX, CY, k * 1.5, 71, t * 2);
    c.fillStyle = `rgba(4,3,9,${0.75 * k * k})`;
    c.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- scene 5: CREATE ANYTHING (9 - 12 s)
  const S5 = { rings: 24, per: 9, gap: 0.6, rx: 520, ry: 700, cw: 230, ch: 410, zmin: 0.25 };
  const s5b = t => prog(t, 11, 12);
  const s5Depth = t => 1.7 * Math.max(0, t - 9) + 7 * Math.pow(s5b(t), 4) / 4;
  const s5Spin = t => 0.75 * Math.max(0, t - 9) + 3.2 * Math.pow(s5b(t), 4) / 4;

  function scene5(c, t) {
    c.fillStyle = '#040309';
    c.fillRect(-W, -H, 3 * W, 3 * H);
    const pulse = beatPulse(t, 9);
    blob(c, CX, CY, 950, COL.violet, 0.34);
    blob(c, CX, CY, 440, COL.magenta, 0.22 + 0.16 * pulse);
    const D = s5Depth(t), spin = s5Spin(t), span = S5.rings * S5.gap;
    const items = [];
    for (let k = 0; k < S5.rings; k++) {
      const Z = S5.zmin + ((k * S5.gap + D) % span);
      for (let j = 0; j < S5.per; j++) items.push([Z, j / S5.per * Math.PI * 2 + k * 0.42 + spin, (k * S5.per + j) % 7]);
    }
    items.sort((a, b) => b[0] - a[0]);
    for (const [Z, th, wi] of items) {
      const s = 1 / Z, x = CX + Math.cos(th) * S5.rx * s, y = CY + Math.sin(th) * S5.ry * s;
      const w = S5.cw * s, h = S5.ch * s;
      if (x + h < 0 || x - h > W || y + h < 0 || y - h > H) continue;
      const a = clamp((Z - S5.zmin) / 0.2) * clamp(1.15 - Z / 13);
      if (a <= 0) continue;
      c.save();
      c.globalAlpha = a;
      c.translate(x, y); c.rotate(th + Math.PI / 2);
      c.drawImage(A.worlds[wi], -w / 2, -h / 2, w, h);
      c.lineWidth = Math.max(1, w * 0.015); c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.strokeRect(-w / 2, -h / 2, w, h);
      c.restore();
    }
    // lime helix down the middle of the tunnel
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.strokeStyle = COL.lime;
    let prev = null;
    for (let i = 0; i <= 170; i++) {
      const u = i / 170, Z = 0.7 + u * 12, a = u * Math.PI * 10 - spin * 2.2;
      const x = CX + Math.cos(a) * 160 / Z, y = CY + Math.sin(a) * 160 / Z;
      if (prev) {
        const wd = 32 / Z, al = clamp(1.2 - Z / 12);
        c.globalAlpha = 0.14 * al; c.lineWidth = wd * 4;
        c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke();
        c.globalAlpha = 0.95 * al; c.lineWidth = wd;
        c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke();
      }
      prev = [x, y];
    }
    c.restore();
    speedLines(c, CX, CY, 0.5 + 1.2 * s5b(t), 83, t * (1 + s5b(t)), '#FFFFFF', true);
    createAnything(c, t);
  }

  function createAnything(c, t) {
    const b = A.text.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, W, 700);
    const size = fit(b, 'ANYTHING', 900, 230, 980, DISPLAY, -3);
    let punch = 0;
    for (const bt of [10.0, 10.5, 11.0, 11.5]) if (t >= bt) punch = Math.exp(-(t - bt) * 12);
    const split = 18 * punch;
    for (const [text, color, t0, y] of [['CREATE', '#FFFFFF', 9.18, 245], ['ANYTHING', COL.lime, 9.5, 455]]) {
      setFont(b, 900, size, DISPLAY, -3);
      b.textAlign = 'center'; b.textBaseline = 'middle';
      const total = b.measureText(text).width, centres = glyphCentres(b, text);
      for (let i = 0; i < text.length; i++) {
        const k = ease.outExpo(prog(t, t0 + i * 0.035, t0 + i * 0.035 + 0.3));
        if (k <= 0) continue;
        const x = CX - total / 2 + centres[i];
        b.save();
        b.translate(x, y);
        b.rotate((rnd(i, 601) - 0.5) * 0.8 * (1 - k));
        const s = lerp(2.6, 1, k);
        b.scale(s, s);
        b.globalAlpha = clamp(k * 1.6);
        if (split > 0.5) {
          b.globalCompositeOperation = 'lighter';
          b.fillStyle = COL.magenta; b.fillText(text[i], -split, 0);
          b.fillStyle = COL.cyan; b.fillText(text[i], split, 0);
          b.globalCompositeOperation = 'source-over';
        }
        b.fillStyle = COL.ink; b.fillText(text[i], 8, 10);
        b.fillStyle = color; b.fillText(text[i], 0, 0);
        b.restore();
      }
    }
    const glitch = Math.pow(prog(t, 11.15, 11.95), 2);
    const s = 1 + 0.07 * punch;
    c.save();
    c.translate(CX, CY); c.scale(s, s); c.translate(-CX, -CY);
    if (glitch <= 0) {
      c.drawImage(A.text, 0, CY - 350);
    } else {
      const fr = Math.floor(t * 24);
      for (let sl = 0; sl < 14; sl++) {
        const on = rnd(sl, fr + 700) < 0.55 ? 1 : 0.15;
        const dx = (rnd(sl, fr + 701) - 0.5) * 2 * 150 * glitch * on;
        c.drawImage(A.text, 0, sl * 50, W, 50, dx, CY - 350 + sl * 50, W, 50);
      }
    }
    c.restore();
  }

  function implode(c, t) {
    const k = ease.inCubic(prog(t, 11.78, 12.0));
    c.save();
    c.translate(CX, CY);
    c.rotate(0.9 * k);
    const s = Math.max(0.001, 1 - k);
    c.scale(s, s);
    c.translate(-CX, -CY);
    scene5(c, t);
    c.restore();
    speedLines(c, CX, CY, 1.5 * k, 91, t * 3, '#FFFFFF', true);
  }

  // ---------------------------------------------------------------- scene 6: LOGO LOCK (12 - 15 s)
  const S6 = { x: 540, y: 800, size: 560 };
  function scene6(c, t) {
    c.fillStyle = '#050505';
    c.fillRect(-W, -H, 3 * W, 3 * H);
    blob(c, S6.x, S6.y, 950, COL.lime, 0.11 * ease.outCubic(prog(t, 12.0, 12.45)));
    const k = ease.outBack(prog(t, 12.0, 12.3));
    const size = S6.size * lerp(0.15, 1, k);
    const rot = lerp(-0.5, 0, ease.outCubic(prog(t, 12.0, 12.3)));
    const reveal = ease.inOutCubic(prog(t, 12.1, 12.42));
    // shockwave + sparks when the mark locks
    const sw = prog(t, 12.42, 12.56);
    if (sw > 0 && sw < 1) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = COL.lime;
      c.globalAlpha = 0.75 * (1 - sw);
      c.lineWidth = 10 * (1 - sw) + 1;
      c.beginPath(); c.arc(S6.x, S6.y, S6.size * lerp(0.56, 0.95, ease.outCubic(sw)), 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 28; i++) {
        const a = rnd(i, 801) * Math.PI * 2, r0 = S6.size * 0.55, r = r0 + (120 + rnd(i, 802) * 260) * ease.outCubic(sw);
        c.globalAlpha = 1 - sw;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(S6.x + Math.cos(a) * (r - 40), S6.y + Math.sin(a) * (r - 40));
        c.lineTo(S6.x + Math.cos(a) * r, S6.y + Math.sin(a) * r);
        c.stroke();
      }
      c.restore();
    }
    drawLogo(c, S6.x, S6.y, size, reveal, rot);
    // lead-in ribbon that snaps into the squiggle's starting point
    const start = (() => {
      const kk = size / LOGO.size, x = (CL[0][0] - LOGO_MID) * kk, y = (CL[0][1] - LOGO_MID) * kk;
      return [S6.x + x * Math.cos(rot) - y * Math.sin(rot), S6.y + x * Math.sin(rot) + y * Math.cos(rot)];
    })();
    const lh = ease.outCubic(prog(t, 12.0, 12.11)), lt = ease.inCubic(prog(t, 12.06, 12.2));
    if (lh > lt) {
      const path = [[-120, 1720], [120, 1300], [start[0] - 260, start[1] + 140], start];
      glow(c, b => {
        for (let i = 0; i <= 40; i++) {
          const p = bez(path, lerp(lt, lh, i / 40));
          i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]);
        }
      }, COL.lime, 22);
    }
    // wordmark, tagline, url
    staggerText(c, 'HIGGSFIELD', CX, 1236, fit(c, 'HIGGSFIELD', 900, 150, 860, DISPLAY, -1), '#FFFFFF', 12.2, t, { rise: 70, step: 0.018, spacing: -1 });
    const tg = ease.outCubic(prog(t, 12.3, 12.5));
    if (tg > 0) {
      c.save();
      c.globalAlpha = tg;
      setFont(c, 600, 58, DISPLAY, 0);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = COL.lime;
      c.fillText('Create Anything', CX, 1336 + 30 * (1 - tg));
      c.restore();
    }
    const ul = ease.outCubic(prog(t, 12.36, 12.54));
    if (ul > 0) {
      c.save();
      c.globalAlpha = 0.6 * ul;
      setFont(c, 500, 36, TEXT, 2);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#FFFFFF';
      c.fillText('higgsfield.ai', CX, 1430 + 20 * (1 - ul));
      c.restore();
    }
  }

  // ---------------------------------------------------------------- compositing
  const IMPACTS = [[2.0, 16], [3.5, 30], [4.0, 20], [6.5, 18], [7.0, 30], [9.0, 18], [12.0, 26], [12.42, 6]];
  const FLASHES = [[2.0, 0.16, 1.0], [3.5, 0.07, 0.55], [4.0, 0.1, 0.45], [6.5, 0.1, 0.6], [7.0, 0.06, 0.5], [9.0, 0.12, 0.8], [12.0, 0.18, 1.0]];
  const LOCK = 12.56;   // everything is static from here to the end

  function shake(t) {
    let x = 0, y = 0, r = 0;
    if (t >= LOCK) return { x, y, r };
    IMPACTS.forEach(([ti, a], i) => {
      const d = t - ti;
      if (d < 0 || d > 0.6) return;
      const e = a * Math.exp(-d * 12);
      x += e * Math.sin(d * 90 + i);
      y += e * Math.cos(d * 77 + i * 2);
      r += e * 0.0009 * Math.sin(d * 60 + i);
    });
    return { x, y, r };
  }

  function overlays(c, t) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    const vis = (a, b) => clamp(Math.min((t - a) / 0.15, (b - t) / 0.15));
    const bug = Math.max(vis(2.08, 6.48), vis(7.25, 11.75));
    if (bug > 0) { c.save(); c.globalAlpha = bug; drawLogo(c, 92, 116, 76); c.restore(); }
    const labels = [[0.3, 1.9, '01 — SPARK'], [2.1, 3.85, '02 — PROMPT'], [4.05, 6.45, '03 — WORLDS'], [6.55, 8.7, '04 — MOTION'], [9.05, 11.75, '05 — CREATE']];
    for (const [a, b, s] of labels) {
      const v = vis(a, b);
      if (v <= 0) continue;
      const dark = t > 6.5 && t < 7.15;
      c.save();
      c.globalAlpha = 0.85 * v;
      setFont(c, 600, 26, TEXT, 5);
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = dark ? COL.ink : '#FFFFFF';
      c.fillText(s, W - 56, 116);
      const tw = c.measureText(s).width;
      c.fillStyle = dark ? COL.ink : COL.lime;
      c.fillRect(W - 56 - tw - 28, 109, 14, 14);
      c.restore();
    }
    let f = t < 2 ? 0.9 * Math.pow(prog(t, 1.9, 2.0), 3) : 0;
    for (const [ft, dur, amp] of FLASHES) if (t >= ft && t < ft + dur) f = Math.max(f, amp * Math.pow(1 - (t - ft) / dur, 2));
    if (f > 0) { c.globalAlpha = f; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H); }
    c.globalAlpha = t > 6.5 && t < 7.7 ? 0.35 : 1;
    c.drawImage(A.vignette, 0, 0);
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.09;
    c.drawImage(A.grain[t >= LOCK ? 0 : Math.floor(t * 30) % 4], 0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  function render(c, t) {
    t = clamp(t, 0, DURATION - 1e-6);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.shadowBlur = 0; c.shadowColor = 'transparent';
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    const sh = shake(t);
    c.save();
    c.translate(CX + sh.x, CY + sh.y); c.rotate(sh.r); c.translate(-CX, -CY);
    if (t < 2) scene1(c, t);
    else if (t < 3.86) scene2(c, t);
    else if (t < 4) whipPan(c, t);
    else if (t < 6.5) scene3(c, t);
    else if (t < 8.74) scene4(c, t);
    else if (t < 9) spiralOut(c, t);
    else if (t < 11.78) scene5(c, t);
    else if (t < 12) implode(c, t);
    else scene6(c, t);
    c.restore();
    overlays(c, t);
  }

  async function init() {
    if (document.fonts) {
      await Promise.all([
        document.fonts.load(`900 100px ${DISPLAY}`), document.fonts.load(`800 100px ${DISPLAY}`),
        document.fonts.load(`600 100px ${DISPLAY}`), document.fonts.load(`500 40px ${TEXT}`),
        document.fonts.load(`600 40px ${TEXT}`), document.fonts.load(`700 40px ${TEXT}`)
      ]).catch(() => {});
    }
    buildAssets();
  }

  window.HF = { W, H, DURATION, init, render };
})();
