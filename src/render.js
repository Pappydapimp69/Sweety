// Draws. Never writes to the sim state it is handed (tests/render.test.mjs checks).
// Purely presentational extras (blink, walk bob, trails, ambient particles) are
// derived from sim state, a hash of position and the time passed in, never stored on it.
//
// Speed: the static tiles (ground, spikes, crates, glass, vents, launch pads) are
// painted once into column chunks at a quantised resolution and blitted; a chunk
// repaints only when its tiles change (a crate breaks) or the zoom moves a step.
// The backdrop's parallax layers are painted once per theme and screen height.
// Glows are pre-rendered radial sprites drawn with 'lighter'. No shadowBlur, no filter.
import { SUGAR, SPICE, isLit, lightRadius, doorOpen, powerOf, solidTile } from './sim.js';

export const THEMES = {
  day: {
    sky: ['#79c8ff', '#fff4dc'], mid: '#c4ecff', top: '#7cc36b', topHi: '#b5e88a', topLo: '#4f9447', dirt: '#b47e52', dirt2: '#7f5233',
    speck: '#d8a77a', style: 'grass', back: 'hills', sun: [0.82, 0.16, '#fff6d8'], haze: '#d6f0ff',
  },
  workshop: {
    sky: ['#f3d9ad', '#d9a46c'], mid: '#ecc28c', top: '#e0a868', topHi: '#f6cf98', topLo: '#a86f3a', dirt: '#8f5d2e', dirt2: '#5c3a1b',
    speck: '#b07a45', style: 'wood', back: 'shelves', sun: [0.14, 0.12, '#fff1cf'], haze: '#efcf9f',
  },
  night: {
    sky: ['#070b26', '#24306a'], mid: '#131a45', top: '#6f8fb0', topHi: '#a9c4dc', topLo: '#3d5272', dirt: '#33405f', dirt2: '#1d2540',
    speck: '#4b5b80', style: 'stone', back: 'stars', sun: [0.8, 0.18, '#fff6c9'], haze: '#2a3770',
  },
  attic: {
    sky: ['#4b3658', '#a07a8f'], mid: '#76586f', top: '#d2a77c', topHi: '#f0cda4', topLo: '#93683f', dirt: '#6d4c41', dirt2: '#43302a',
    speck: '#8a6556', style: 'wood', back: 'beams', sun: [0.25, 0.08, '#ffe9c4'], haze: '#8f6c84',
  },
  sky: {
    sky: ['#4aa8ff', '#e2f4ff'], mid: '#9fd2ff', top: '#ffffff', topHi: '#ffffff', topLo: '#c9d8ee', dirt: '#9fb2d6', dirt2: '#6f82ad',
    speck: '#b9c8e6', style: 'cloud', back: 'clouds', sun: [0.78, 0.14, '#fffbe6'], haze: '#d4ecff',
  },
  clock: {
    sky: ['#17303f', '#3f6f76'], mid: '#2a4d58', top: '#e0b354', topHi: '#ffe08a', topLo: '#9a7426', dirt: '#5e4d3d', dirt2: '#3a2f25',
    speck: '#76624f', style: 'brick', back: 'gears', sun: [0.72, 0.2, '#ffe6a8'], haze: '#3f6a72',
  },
  home: {
    sky: ['#ff9fb6', '#ffe2b0'], mid: '#ffc4b4', top: '#fbe3ec', topHi: '#ffffff', topLo: '#f0a6bd', dirt: '#c98e78', dirt2: '#8f5a4c',
    speck: '#e0ab95', style: 'cake', back: 'hills', sun: [0.7, 0.3, '#fff0c8'], haze: '#ffd3c4',
  },
};
// Group colours: four hues on different luminances (Y = .299R+.587G+.114B ≈ 151, 115, 207, 184),
// none of them green, so no two sit on the red-green axis at a similar brightness.
// Every group also carries a glyph (circle, square, triangle, diamond): colour is never the only key.
export const GROUP_COLORS = [null, '#ff6b6b', '#2f7fe0', '#ffd43b', '#c5a3ff'];
export const PLAYER_COLORS = ['#ff7eb6', '#2ec4b6'];
const PLAYER_RIM = ['#b8326f', '#0d7c71'];
const SOLID = '#Lx%VTK';
const STATIC = '#LVx%^v';   // painted into the cached chunks; everything else draws live

let dark = null;   // offscreen canvas for the night

export function textPx(H) { return Math.max(14, Math.round(H * 0.024)); }

// ---------------------------------------------------------------- small helpers

// Cached art is painted in software (willReadFrequently keeps a canvas off the GPU): detailed
// vector work rasterises far faster on the CPU, and the finished canvas uploads once and blits.
const SOFT = { willReadFrequently: true };
function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
  return null;
}
function hash(x, y, n = 0) {
  let h = (x * 374761393 + y * 668265263 + n * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
function mix(a, b, t, alpha = 1) {
  const A = rgb(a), B = rgb(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return alpha >= 1 ? `rgb(${c(0)},${c(1)},${c(2)})` : `rgba(${c(0)},${c(1)},${c(2)},${alpha})`;
}
const shade = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

// rounded rectangle with per-corner radii [tl, tr, br, bl]
function rrect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

// A soft round glow, blended additively. A live radial gradient: measured cheaper than a sprite
// blit in software rendering (SwiftShader), and no shadowBlur or filter anywhere.
function glow(ctx, x, y, r, color, alpha = 1) {
  if (!(r > 0) || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.35, rgba(color, alpha * 0.5)); g.addColorStop(1, rgba(color, 0));
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op;
}
// the same soft disc, darkening (contact shadows)
function softShadow(ctx, x, y, rx, ry, alpha) {
  if (!(rx > 0) || !(ry > 0) || alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(20,10,30,${0.7 * alpha})`); g.addColorStop(0.55, `rgba(20,10,30,${0.4 * alpha})`); g.addColorStop(1, 'rgba(20,10,30,0)');
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// ---------------------------------------------------------------- the world

export function drawWorld(ctx, s, cam, W, H, fx, theme = 'day', t = s.time) {
  const T = THEMES[theme] || THEMES.day;
  const k = cam.scale;
  drawBackdrop(ctx, cam, W, H, theme, T, t);

  const ox = W / 2 - cam.x * k, oy = H / 2 - cam.y * k;
  const sx = (x) => ox + x * k, sy = (y) => oy + y * k;

  const x0 = Math.max(0, Math.floor(cam.x - W / 2 / k) - 1), x1 = Math.min(s.w - 1, Math.ceil(cam.x + W / 2 / k) + 1);
  const y0 = Math.max(0, Math.floor(cam.y - H / 2 / k) - 1), y1 = Math.min(s.h - 1, Math.ceil(cam.y + H / 2 / k) + 1);

  // vent wind behind everything
  for (const v of s.vents) {
    if (v.x < x0 || v.x > x1) continue;
    const gr = ctx.createLinearGradient(0, sy(v.bottom), 0, sy(v.top));
    gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(sx(v.x + 0.1), sy(v.top), k * 0.8, (v.bottom - v.top) * k);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 1.6 + i / 4) % 1);
      const yy = v.bottom - ph * (v.bottom - v.top);
      const xx = v.x + 0.2 + i * 0.2 + Math.sin(t * 5 + i) * 0.05;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.beginPath(); ctx.moveTo(sx(xx), sy(yy)); ctx.lineTo(sx(xx), sy(yy - 0.8)); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }

  drawStatic(ctx, s, theme, T, k, sx, sy, x0, x1, y0, y1);

  for (let y = y0; y <= y1; y++) {
    const row = s.grid[y];
    for (let x = x0; x <= x1; x++) {
      const c = row[x];
      if (c === '.' || STATIC.includes(c)) continue;
      drawTile(ctx, s, c, x, y, sx(x), sy(y), k, T, t);
    }
  }

  for (const e of s.ents) drawEnt(ctx, s, e, sx, sy, k, t, x0, x1);

  // pins and flying pins
  for (const p of s.pins) {
    const head = s.grid[Math.floor(p.y)] && SOLID.includes(s.grid[Math.floor(p.y)][p.x + 1] || '') ? p.x + 1 - 0.12 : p.x;
    const gr = ctx.createLinearGradient(0, sy(p.y) - k * 0.07, 0, sy(p.y) + k * 0.08);
    gr.addColorStop(0, '#f1f3f5'); gr.addColorStop(1, '#868e96');
    ctx.fillStyle = gr; rrect(ctx, sx(p.x), sy(p.y) - k * 0.07, k, k * 0.15, k * 0.07); ctx.fill();
    ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(1, k * 0.025); ctx.stroke();
    ctx.fillStyle = '#495057'; rrect(ctx, sx(head), sy(p.y) - k * 0.14, k * 0.12, k * 0.28, k * 0.04); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const sh of s.shots) {
    const gr = ctx.createLinearGradient(sx(sh.x - sh.dir * 0.9), 0, sx(sh.x), 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, '#e9ecef');
    ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, k * 0.09);
    ctx.beginPath(); ctx.moveTo(sx(sh.x - sh.dir * 0.9), sy(sh.y)); ctx.lineTo(sx(sh.x), sy(sh.y)); ctx.stroke();
  }

  // gusts
  for (const gu of s.gusts) {
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * gu.life / 0.3})`; ctx.lineWidth = Math.max(2, k * 0.07);
    const span = gu.x1 - gu.x0, prog = 1 - gu.life / 0.3;
    for (let i = 0; i < 5; i++) {
      const yy = gu.y0 + (i + 0.5) * (gu.y1 - gu.y0) / 5;
      const xa = gu.dir > 0 ? gu.x0 + span * prog * 0.8 : gu.x1 - span * prog * 0.8;
      ctx.beginPath(); ctx.moveTo(sx(xa), sy(yy));
      ctx.quadraticCurveTo(sx(xa + gu.dir * 0.8), sy(yy - 0.25), sx(xa + gu.dir * 1.6), sy(yy + Math.sin(i) * 0.2)); ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';

  // mini-game drops
  for (const d of s.drops) {
    if (d.kind === 'rock') {
      const x = sx(d.x), y = sy(d.y), r = k * 0.3;
      const gr = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, '#adb5bd'); gr.addColorStop(1, '#495057');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
    } else {
      const gold = d.kind === 'gold';
      if (gold) glow(ctx, sx(d.x), sy(d.y), k * 0.8, '#ffd43b', 0.5);
      glossyHeart(ctx, sx(d.x), sy(d.y), k * (gold ? 0.34 : 0.26), gold ? '#ffd43b' : '#ff4d6d', k);
    }
  }

  if (lightRadius(s)) drawNight(ctx, s, W, H, k, sx, sy);

  drawTether(ctx, s, sx, sy, k);
  for (const p of s.players) if (!p.dead) contactShadow(ctx, s, p, sx, sy, k);
  for (const p of s.players) drawPlayer(ctx, s, p, sx, sy, k, t);
  if (s.mode === 'potato' && s.holder >= 0) drawPotato(ctx, s, sx, sy, k, t);

  if (s.flood) drawFlood(ctx, s, W, H, sy, t);
  if (s.frozen) {
    ctx.fillStyle = 'rgba(120, 190, 255, 0.12)'; ctx.fillRect(0, 0, W, H);
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(160,210,255,0)'); gr.addColorStop(1, 'rgba(160,210,255,0.35)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  drawFx(ctx, fx, sx, sy, k);
}

// ---------------------------------------------------------------- sky and backdrop

function paintSky(c, T, W, H, SW) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]); g.addColorStop(0.55, T.mid); g.addColorStop(1, T.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, SW, H);
  const [fx, fy, col] = T.sun;
  const R = Math.min(W, H) * 0.42, x = W * fx, y = H * fy;
  const sg = c.createRadialGradient(x, y, 0, x, y, R);
  sg.addColorStop(0, rgba(col, 0.6)); sg.addColorStop(0.15, rgba(col, 0.35)); sg.addColorStop(1, rgba(col, 0));
  c.fillStyle = sg; c.fillRect(x - R, y - R, R * 2, R * 2);
  if (T.back === 'stars') {   // the moon
    const mr = Math.min(W, H) * 0.06;
    c.fillStyle = '#fff6c9'; c.beginPath(); c.arc(x, y, mr, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(210,200,160,0.5)';
    c.beginPath(); c.arc(x - mr * 0.3, y - mr * 0.2, mr * 0.18, 0, Math.PI * 2); c.arc(x + mr * 0.25, y + mr * 0.3, mr * 0.12, 0, Math.PI * 2); c.fill();
  }
}

// Parallax strips, painted once per theme and screen size and blitted unscaled (cheap on a GPU,
// and in software it is the fill area that costs). Strip 0 is opaque: the sky, the sun and the
// far layer together. Strip 1 is the middle layer, cropped to the band it occupies.
const BAND = { hills: 0.4, stars: 0.4, shelves: 0.08, beams: 0.45, clouds: 0.12, gears: 1 };
const stripCache = new Map();
function stripFor(theme, T, i, W, H) {
  const SW = Math.ceil(W + 800), y0 = i ? Math.floor(H * (BAND[T.back] ?? 0.4)) : 0;
  const key = `${theme}:${i}:${SW}:${Math.round(H)}`;
  let st = stripCache.get(key);
  if (st === undefined) {
    if (stripCache.size > 8) stripCache.clear();
    st = null;
    if (y0 < H) {
      const c = makeCanvas(SW, H - y0);
      if (c) {
        const g = c.getContext('2d', SOFT);
        g.translate(0, -y0);
        if (!i) paintSky(g, T, W, H, SW);
        paintLayer(g, T, i, SW, H);
        st = { c, SW, y0 };
      }
    }
    stripCache.set(key, st);
  }
  return st;
}
function strip(ctx, theme, T, i, off, W, H) {
  const st = stripFor(theme, T, i, W, H);
  if (!st) return;
  const x0 = -Math.round(((off % st.SW) + st.SW) % st.SW);
  ctx.drawImage(st.c, x0, st.y0);
  if (x0 + st.SW < W) ctx.drawImage(st.c, x0 + st.SW, st.y0);
}

// layer 0 = far (palest, closest to the sky), 1 = middle. Both are kept hazy: nothing here may look standable.
function paintLayer(c, T, i, SW, H) {
  const haze = T.haze, far = i === 0;
  const tint = (hex, amt) => mix(hex, haze, amt);
  const r = (n) => hash(n, i * 31 + 7);
  const back = T.back;
  if (back === 'hills' || back === 'stars') {
    const base = back === 'stars' ? '#0d1438' : T === THEMES.home ? '#c27a98' : '#5aa86a';
    const fill = tint(base, far ? 0.72 : 0.5);
    // rolling hills: sum of sines, seamless across the strip
    const yAt = (x) => H * (far ? 0.62 : 0.74) + Math.sin(x / SW * Math.PI * 2 * 2 + i) * H * 0.05 + Math.sin(x / SW * Math.PI * 2 * 5 + 1.7 * i) * H * 0.025;
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= SW; x += 20) c.lineTo(x, yAt(x));
    c.lineTo(SW, H); c.closePath(); c.fill();
    // soft rim light on the crest
    c.strokeStyle = tint('#ffffff', far ? 0.85 : 0.7); c.globalAlpha = 0.35; c.lineWidth = 3;
    c.beginPath(); for (let x = 0; x <= SW; x += 20) c.lineTo(x, yAt(x) + 1.5); c.stroke(); c.globalAlpha = 1;
    // round trees (or houses at home, pines at night) on the mid layer
    const n = far ? 14 : 9;
    for (let j = 0; j < n; j++) {
      const x = (j + r(j) * 0.6) * SW / n, y = yAt(x);
      const sz = H * (far ? 0.035 : 0.06) * (0.7 + r(j + 50) * 0.6);
      if (T === THEMES.home && !far && j % 3 === 0) {
        c.fillStyle = tint('#a3607d', 0.45);
        c.fillRect(x - sz, y - sz * 1.4, sz * 2, sz * 1.6);
        c.beginPath(); c.moveTo(x - sz * 1.25, y - sz * 1.4); c.lineTo(x, y - sz * 2.4); c.lineTo(x + sz * 1.25, y - sz * 1.4); c.fill();
        c.fillStyle = tint('#ffe8a3', 0.35); c.fillRect(x - sz * 0.5, y - sz * 0.95, sz * 0.4, sz * 0.4); c.fillRect(x + sz * 0.15, y - sz * 0.95, sz * 0.4, sz * 0.4);
        continue;
      }
      const tree = back === 'stars' ? '#0a1030' : T === THEMES.home ? '#b0627f' : '#3f9a5a';
      c.fillStyle = tint(tree, far ? 0.66 : 0.48);
      if (back === 'stars') {
        c.beginPath(); c.moveTo(x - sz * 0.7, y + 2); c.lineTo(x, y - sz * 2.6); c.lineTo(x + sz * 0.7, y + 2); c.fill();
      } else {
        c.fillRect(x - sz * 0.12, y - sz * 0.9, sz * 0.24, sz * 0.95);
        c.beginPath();
        for (const [ax, ay, ar] of [[0, -1.3, 0.75], [-0.45, -0.95, 0.5], [0.45, -0.95, 0.5]]) { c.moveTo(x + ax * sz + ar * sz, y + ay * sz); c.arc(x + ax * sz, y + ay * sz, ar * sz, 0, Math.PI * 2); }
        c.fill();
        c.fillStyle = tint('#ffffff', far ? 0.8 : 0.6); c.globalAlpha = 0.25;   // the lit side
        c.beginPath(); c.arc(x - sz * 0.2, y - sz * 1.5, sz * 0.4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      }
    }
  } else if (back === 'shelves') {
    if (far) {   // a planked wall
      for (let x = 0; x < SW; x += 64) {
        c.fillStyle = tint(r(x) > 0.5 ? '#c99a63' : '#bf8f58', 0.55); c.fillRect(x, 0, 64, H);
        c.fillStyle = tint('#8b5a2b', 0.6); c.fillRect(x, 0, 2, H);
      }
      c.fillStyle = tint('#fff4d6', 0.3); c.globalAlpha = 0.3;   // a window of warm light
      rrect(c, SW * 0.12, H * 0.08, SW * 0.1, H * 0.3, 10); c.fill(); c.globalAlpha = 1;
    } else {       // pegboards with tools hanging on them: nothing horizontal, nothing to stand on
      for (let j = 0; j < 4; j++) {
        const bx = j * SW / 4 + 40 + r(j) * 60, by = H * (0.12 + (j % 2) * 0.1), bw = SW / 4 - 160, bh = H * 0.42;
        c.fillStyle = tint('#a8763f', 0.62); rrect(c, bx, by, bw, bh, 12); c.fill();
        c.fillStyle = tint('#6b4420', 0.62);
        for (let yy = by + 18; yy < by + bh - 10; yy += 26) for (let xx = bx + 18; xx < bx + bw - 10; xx += 26) c.fillRect(xx, yy, 4, 4);
        let x = bx + 40;
        while (x < bx + bw - 40) {
          const kind = Math.floor(r(x + j * 7) * 4), L = bh * (0.35 + r(x + 3) * 0.3), top = by + 30;
          c.fillStyle = tint(['#7d5a3c', '#6f8faf', '#8b6b4a', '#a05c48'][kind], 0.55);
          if (kind === 0) { c.fillRect(x - 4, top, 8, L); c.fillRect(x - 22, top, 44, 16); }                 // hammer
          else if (kind === 1) { c.fillRect(x - 5, top + 14, 10, L - 14); c.beginPath(); c.arc(x, top + 10, 14, 0, Math.PI * 2); c.fill(); }   // wrench
          else if (kind === 2) { c.beginPath(); c.moveTo(x - 6, top); c.lineTo(x + 18, top + L); c.lineTo(x - 6, top + L); c.closePath(); c.fill(); c.fillRect(x - 14, top, 16, 22); }   // saw
          else { c.beginPath(); c.arc(x - 8, top + 12, 9, 0, Math.PI * 2); c.moveTo(x + 17, top + 12); c.arc(x + 8, top + 12, 9, 0, Math.PI * 2); c.fill(); c.fillRect(x - 3, top + 18, 6, L * 0.6); }   // scissors
          x += 70 + r(x + 11) * 40;
        }
      }
    }
  } else if (back === 'beams') {
    if (far) {   // the roof: rafters meeting at a ridge, a round window
      c.fillStyle = tint('#3f2a35', 0.55);
      for (let x = 0; x < SW; x += 400) {
        c.save(); c.translate(x + 200, -H * 0.1);
        for (const d of [-1, 1]) { c.save(); c.rotate(d * 0.85); c.fillRect(-14, 0, 28, H * 1.6); c.restore(); }
        c.restore();
        c.fillRect(x + 186, 0, 28, H);
      }
      c.fillStyle = tint('#ffe9c4', 0.35); c.globalAlpha = 0.55;
      c.beginPath(); c.arc(SW * 0.31, H * 0.2, H * 0.08, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = tint('#3f2a35', 0.5); c.lineWidth = 6;
      c.beginPath(); c.moveTo(SW * 0.31 - H * 0.08, H * 0.2); c.lineTo(SW * 0.31 + H * 0.08, H * 0.2); c.moveTo(SW * 0.31, H * 0.12); c.lineTo(SW * 0.31, H * 0.28); c.stroke();
      const wx = SW * 0.31, gr = c.createLinearGradient(wx, H * 0.2, wx + H * 0.4, H);   // the shaft of light from it
      gr.addColorStop(0, 'rgba(255,236,200,0.3)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(wx - H * 0.07, H * 0.24); c.lineTo(wx + H * 0.07, H * 0.16); c.lineTo(wx + H * 0.75, H); c.lineTo(wx + H * 0.2, H); c.fill();
    } else {     // trunks and boxes on the floor, hazy
      for (let j = 0; j < 7; j++) {
        const x = j * SW / 7 + r(j) * 80, w = 90 + r(j + 4) * 90, h = 60 + r(j + 8) * 90;
        c.fillStyle = tint(j % 2 ? '#6d4c41' : '#7d5a4f', 0.72);
        rrect(c, x, H * 0.9 - h, w, h, 18); c.fill();
      }
    }
  } else if (back === 'clouds') {
    const n = far ? 10 : 7;
    for (let j = 0; j < n; j++) {
      const x = (j + r(j) * 0.5) * SW / n, y = far ? H * (0.72 + r(j + 3) * 0.12) : H * (0.25 + r(j + 3) * 0.5);
      const w = (far ? 140 : 110) * (0.8 + r(j + 6) * 0.8);
      puff(c, x, y, w, far ? tint('#ffffff', 0.3) : '#ffffff', far ? 0.4 : 0.26);
    }
  } else if (back === 'gears') {
    if (far) {   // the great clock face
      const cx = SW * 0.35, cy = H * 0.36, R = H * 0.26;
      c.fillStyle = tint('#c9c0a8', 0.8); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = tint('#9a7426', 0.75); c.lineWidth = 12; c.stroke();
      c.fillStyle = tint('#3a2f25', 0.78);
      for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2; c.fillRect(cx + Math.cos(a) * R * 0.82 - 5, cy + Math.sin(a) * R * 0.82 - 5, 10, 10); }
      c.fillStyle = tint('#1b2e38', 0.5);
      for (let x = 0; x < SW; x += 200) c.fillRect(x + 80, 0, 26, H);   // tower struts
    }
  }
}

function puff(c, x, y, w, color, alpha) {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, w * 0.55, w * 0.17, 0, 0, Math.PI * 2);
  c.ellipse(x - w * 0.2, y - w * 0.08, w * 0.24, w * 0.18, 0, 0, Math.PI * 2);
  c.ellipse(x + w * 0.12, y - w * 0.13, w * 0.28, w * 0.24, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
}

let cloudSprite;
function cloud(ctx, x, y, w, alpha) {
  if (cloudSprite === undefined) {
    cloudSprite = makeCanvas(256, 110);
    if (cloudSprite) {
      const g = cloudSprite.getContext('2d', SOFT);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(128, 74, 116, 26, 0, 0, Math.PI * 2); g.ellipse(84, 58, 52, 38, 0, 0, Math.PI * 2); g.ellipse(150, 48, 62, 46, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (!cloudSprite) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(cloudSprite, x, y, w, w * 110 / 256);
  ctx.globalAlpha = 1;
}

const gearSprites = new Map();
function bigGear(ctx, x, y, r, rot, color) {
  let sp = gearSprites.get(color);
  if (sp === undefined) {
    sp = makeCanvas(256, 256);
    if (sp) {
      const g = sp.getContext('2d', SOFT);
      g.fillStyle = color;
      gearPath(g, 128, 128, 124, 14, 0); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(128, 128, 34, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 72, 128 + Math.sin(a) * 72, 21, 0, Math.PI * 2); g.fill(); }
    }
    gearSprites.set(color, sp);
  }
  if (!sp) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.drawImage(sp, -r, -r, r * 2, r * 2);
  ctx.restore();
}

function drawBackdrop(ctx, cam, W, H, theme, T, t) {
  const kind = T.back, px = cam.x * cam.scale;
  const wrap = (v, m) => ((v % m) + m) % m;
  ctx.save();
  strip(ctx, theme, T, 0, px * 0.05, W, H);   // sky, sun and the far layer: one opaque blit
  if (kind === 'stars') {
    for (let i = 0; i < 70; i++) {
      const x = wrap(i * 397.3 - px * 0.03, W), y = (i * 151.7) % (H * 0.45);
      ctx.globalAlpha = 0.55 + Math.sin(t * 2 + i * 1.7) * 0.45; ctx.fillStyle = i % 7 ? '#ffffff' : '#ffe8a3';
      const sz = i % 9 === 0 ? 2.6 : 1.6;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'clouds' || kind === 'hills') {
    for (let i = 0; i < 5; i++) {   // drifting clouds
      const w = 150 + (i % 3) * 60;
      const x = wrap(i * 430 - px * 0.06 + t * (5 + i), W + 500) - 250;
      cloud(ctx, x, 30 + (i % 3) * H * 0.08, w, kind === 'clouds' ? 0.55 : 0.6);
    }
  }
  if (kind === 'gears') {
    const gc = mix('#c99a45', T.haze, 0.86);
    for (let i = 0; i < 5; i++) {
      const x = wrap(i * 420 - px * 0.15, W + 400) - 200, y = H * (0.25 + (i % 3) * 0.24), r = 70 + (i % 3) * 36;
      bigGear(ctx, x, y, r, t * (i % 2 ? 0.25 : -0.25) + i, gc);
    }
  }
  strip(ctx, theme, T, 1, px * 0.2, W, H);
  drawMotes(ctx, kind, theme, W, H, t, px);
  ctx.restore();
}

function drawMotes(ctx, kind, theme, W, H, t, px) {
  const wrap = (v, m) => ((v % m) + m) % m;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = hash(i, 3), b = hash(i, 5), c = hash(i, 9);
    if (theme === 'day') {          // pollen drifting up
      const x = wrap(a * W * 1.3 - px * 0.3 + Math.sin(t * 0.7 + i) * 20, W), y = wrap(b * H - t * (8 + c * 10), H);
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + i); ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(x, y, 1.5 + c * 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 'night') { // fireflies
      if (i > 14) break;
      const x = wrap(a * W * 1.4 - px * 0.35 + Math.sin(t * 0.6 + i * 2) * 30, W), y = H * (0.35 + b * 0.55) + Math.sin(t * 0.9 + i) * 18;
      const on = Math.max(0, Math.sin(t * 1.5 + i * 2.3));
      glow(ctx, x, y, 14, '#c6ff7a', on * 0.7);
    } else if (theme === 'workshop' || theme === 'attic') {   // dust motes in the light
      const x = wrap(a * W * 1.2 - px * 0.3 + Math.sin(t * 0.4 + i) * 25, W), y = wrap(b * H + Math.sin(t * 0.3 + i * 3) * 30 - t * 4, H);
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.3 + i); ctx.fillStyle = '#fff4dc';
      ctx.beginPath(); ctx.arc(x, y, 1.2 + c * 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 'sky') {   // wind streaks
      if (i > 12) break;
      const x = wrap(a * W * 1.5 - px * 0.4 + t * (160 + c * 120), W + 300) - 150, y = b * H * 0.85;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 50 + c * 60, y); ctx.stroke(); ctx.lineCap = 'butt';
    } else if (theme === 'clock') { // drifting sparks
      if (i > 16) break;
      const x = wrap(a * W * 1.2 - px * 0.3 + Math.sin(t + i) * 12, W), y = wrap(b * H + t * (20 + c * 25), H);
      glow(ctx, x, y, 6, '#ffb84d', 0.55 + 0.35 * Math.sin(t * 5 + i));
    } else if (theme === 'home') {  // petals falling
      const x = wrap(a * W * 1.3 - px * 0.3 + Math.sin(t * 0.8 + i) * 40 + t * 10, W), y = wrap(b * H + t * (18 + c * 14), H);
      ctx.globalAlpha = 0.65; ctx.fillStyle = i % 3 ? '#ffd1dc' : '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, y, 4 + c * 2, 2 + c, t * (1 + c) + i, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function gearPath(ctx, x, y, r, teeth, rot) {
  ctx.beginPath();
  for (let i = 0; i <= teeth * 2; i++) {
    const a = rot + (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.82;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function groupShape(ctx, g, cx, cy, r) {
  ctx.beginPath();
  if (g === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (g === 2) { const q = r * 0.86; ctx.rect(cx - q, cy - q, q * 2, q * 2); }
  else if (g === 3) { const q = r * 1.12; ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy + q * 0.8); ctx.lineTo(cx - q, cy + q * 0.8); ctx.closePath(); }
  else { const q = r * 1.15; ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - q, cy); ctx.closePath(); }
}
// The group glyph: white with a dark outline, readable on any colour.
function glyph(ctx, g, cx, cy, r, alpha = 1) {
  if (!g) return;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * alpha;
  ctx.lineJoin = 'round';
  groupShape(ctx, g, cx, cy, r);
  ctx.strokeStyle = 'rgba(28,18,42,0.92)'; ctx.lineWidth = Math.max(2, r * 0.5); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.globalAlpha = ga; ctx.lineJoin = 'miter';
}

// ---------------------------------------------------------------- static tiles, cached in chunks

const CHUNK = 8, CHUNK_H = 6;   // tiles per chunk; empty chunks are skipped, so sky costs nothing here
const RES = [16, 24, 32, 40, 48, 56, 64];
const chunkStore = new WeakMap();   // grid -> Map(key -> chunk)
let chunkRes = 0, chunkFrame = 0;

function pickRes(k) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const want = k * dpr;
  if (chunkRes && want > chunkRes * 0.8 && want < chunkRes * 1.25) return chunkRes;   // hysteresis: no repaint storms while zooming
  chunkRes = RES.find((r) => r >= want * 0.92) || RES[RES.length - 1];
  return chunkRes;
}

// what the chunk shows, plus a one-tile margin (caps, tufts and shadows reach across the edge)
function chunkSig(s, cx0, cy0) {
  let sig = '', any = false;
  for (let y = cy0 - 1; y <= cy0 + CHUNK_H; y++) {
    const row = s.grid[y];
    for (let x = cx0 - 1; x <= cx0 + CHUNK; x++) {
      const c = row ? row[x] || '.' : '.';
      if (STATIC.includes(c)) { sig += c; any = true; } else sig += '.';
    }
  }
  return any ? sig : '';
}

function drawStatic(ctx, s, theme, T, k, sx, sy, x0, x1, y0, y1) {
  let store = chunkStore.get(s.grid);
  if (!store) { store = new Map(); chunkStore.set(s.grid, store); }
  const R = pickRes(k);
  spriteRes = R;
  chunkFrame++;
  for (let cy0 = Math.floor(y0 / CHUNK_H) * CHUNK_H; cy0 <= y1; cy0 += CHUNK_H) {
    for (let cx0 = Math.floor(x0 / CHUNK) * CHUNK; cx0 <= x1; cx0 += CHUNK) {
      const sig = chunkSig(s, cx0, cy0);
      if (!sig) continue;
      const th = s.zones && s.zones[0].theme ? themeAt(s, cx0 + CHUNK / 2) : theme;   // the Yard: each district its own look
      const key = `${th}:${R}:${cx0}:${cy0}`;
      let ch = store.get(key);
      if (!ch || ch.sig !== sig) {
        if (!ch) {
          if (store.size >= 40) {   // forget the least recently used
            let oldK = null, oldF = Infinity;
            for (const [kk, v] of store) if (v.used < oldF) { oldF = v.used; oldK = kk; }
            store.delete(oldK);
          }
          ch = { canvas: makeCanvas(CHUNK * R, CHUNK_H * R), sig: '', used: 0 };
          store.set(key, ch);
        }
        ch.sig = sig;
        if (ch.canvas) paintChunk(ch.canvas.getContext('2d', SOFT), s, th === theme ? T : (THEMES[th] || T), cx0, cy0, R);
      }
      ch.used = chunkFrame;
      if (!ch.canvas) continue;
      const a = Math.round(sx(cx0)), b = Math.round(sx(cx0 + CHUNK));
      const c = Math.round(sy(cy0)), d = Math.round(sy(cy0 + CHUNK_H));
      ctx.drawImage(ch.canvas, a, c, b - a, d - c);
    }
  }
}

function paintChunk(c, s, T, cx0, cy0, R) {
  c.clearRect(0, 0, CHUNK * R, CHUNK_H * R);
  c.save();
  paintCx0 = cx0;
  c.translate(-cx0 * R, -cy0 * R);
  // two passes: bodies first, then caps and lips that overhang onto neighbours
  for (const pass of [0, 1]) {
    for (let y = Math.max(0, cy0 - 1); y <= Math.min(s.h - 1, cy0 + CHUNK_H); y++) {
      for (let x = cx0 - 1; x <= cx0 + CHUNK; x++) {
        const ch = s.grid[y][x];
        if (!ch || !STATIC.includes(ch)) continue;
        paintStatic(c, s, ch, x, y, x * R, y * R, R, T, pass);
      }
    }
  }
  c.restore();
}

// How deep a ground tile sits under the surface (0..4): deeper earth is darker. The depth is the
// smallest among its solid neighbours either side, so a narrow pillar standing on the ground does
// not cast a dark column down through it.
function vDepth(s, x, y) {
  let d = 0;
  while (d < 4 && isSolidAt(s, x, y - d - 1)) d++;
  return d;
}
function depthAt(s, x, y) {
  let d = vDepth(s, x, y);
  for (let xx = x - 1; xx <= x + 1; xx++) if (xx !== x && isSolidAt(s, xx, y)) d = Math.min(d, vDepth(s, xx, y));
  return d;
}
let paintCx0 = 0;   // the chunk being painted (caps are drawn per run, clipped by the chunk)
function capRunStart(s, x, y) {
  let xs = x;
  while (xs > 0 && s.grid[y][xs - 1] === '#' && !isSolidAt(s, xs - 1, y - 1) && xs > paintCx0 - 2) xs--;
  return xs;
}
const isSolidAt = (s, x, y) => { const r = s.grid[y]; return !!r && SOLID.includes(r[x] || '.'); };
const isGround = (s, x, y) => { if (x < 0 || x >= s.w) return true; const r = s.grid[y]; return !!r && r[x] === '#'; };

function paintStatic(c, s, ch, x, y, px, py, k, T, pass) {
  if (ch === '#') { paintGround(c, s, x, y, px, py, k, T, pass); return; }
  if (pass === 0) return;
  switch (ch) {
    case 'L': {   // launch pad
      c.fillStyle = '#4a515c'; rrect(c, px + k * 0.02, py + k * 0.1, k * 0.96, k * 0.9, [k * 0.12, k * 0.12, 0, 0]); c.fill();
      const gr = c.createLinearGradient(0, py, 0, py + k * 0.3);
      gr.addColorStop(0, '#ffc078'); gr.addColorStop(1, '#f76707');
      c.fillStyle = gr; rrect(c, px, py, k, k * 0.26, k * 0.12); c.fill();
      c.strokeStyle = '#7a3a06'; c.lineWidth = k * 0.04; c.stroke();
      c.fillStyle = '#fff4e6'; c.strokeStyle = '#2b2f36'; c.lineWidth = k * 0.05; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(px + k * 0.5, py + k * 0.36); c.lineTo(px + k * 0.78, py + k * 0.72); c.lineTo(px + k * 0.6, py + k * 0.72); c.lineTo(px + k * 0.6, py + k * 0.88);
      c.lineTo(px + k * 0.4, py + k * 0.88); c.lineTo(px + k * 0.4, py + k * 0.72); c.lineTo(px + k * 0.22, py + k * 0.72); c.closePath(); c.stroke(); c.fill();
      c.lineJoin = 'miter';
      break;
    }
    case 'V': {   // vent grate
      const gr = c.createLinearGradient(0, py, 0, py + k);
      gr.addColorStop(0, '#6c757d'); gr.addColorStop(1, '#343a40');
      c.fillStyle = gr; rrect(c, px + k * 0.02, py, k * 0.96, k, k * 0.1); c.fill();
      c.fillStyle = '#212529';
      for (let i = 0; i < 4; i++) { rrect(c, px + k * (0.12 + i * 0.2), py + k * 0.12, k * 0.12, k * 0.62, k * 0.05); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(px + k * 0.06, py + k * 0.03, k * 0.88, k * 0.05);
      break;
    }
    case 'x': {   // crate
      const gr = c.createLinearGradient(0, py, 0, py + k);
      gr.addColorStop(0, '#e0a35c'); gr.addColorStop(1, '#b8732f');
      c.fillStyle = gr; rrect(c, px + k * 0.03, py + k * 0.03, k * 0.94, k * 0.94, k * 0.1); c.fill();
      c.strokeStyle = '#6b3f17'; c.lineWidth = k * 0.06; c.stroke();
      c.strokeStyle = '#8a5524'; c.lineWidth = k * 0.05;
      c.strokeRect(px + k * 0.14, py + k * 0.14, k * 0.72, k * 0.72);
      c.beginPath(); c.moveTo(px + k * 0.16, py + k * 0.84); c.lineTo(px + k * 0.84, py + k * 0.16); c.stroke();
      c.fillStyle = 'rgba(255,240,210,0.35)'; c.fillRect(px + k * 0.1, py + k * 0.07, k * 0.8, k * 0.04);
      c.fillStyle = '#5a3412';
      for (const [ax, ay] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { c.beginPath(); c.arc(px + k * ax, py + k * ay, k * 0.035, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case '%': {   // glass
      const gr = c.createLinearGradient(px, py, px + k, py + k);
      gr.addColorStop(0, 'rgba(210,240,255,0.75)'); gr.addColorStop(1, 'rgba(140,200,240,0.5)');
      c.fillStyle = gr; rrect(c, px + k * 0.14, py, k * 0.72, k, k * 0.06); c.fill();
      c.strokeStyle = 'rgba(80,140,190,0.9)'; c.lineWidth = Math.max(1, k * 0.04); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = Math.max(1, k * 0.05); c.lineCap = 'round';
      c.beginPath(); c.moveTo(px + k * 0.3, py + k * 0.15); c.lineTo(px + k * 0.5, py + k * 0.45);
      c.moveTo(px + k * 0.32, py + k * 0.55); c.lineTo(px + k * 0.4, py + k * 0.67); c.stroke(); c.lineCap = 'butt';
      break;
    }
    case '^': case 'v': {   // spikes: the brightest, crispest thing on screen
      const up = ch === '^';
      c.save();
      if (!up) { c.translate(0, py * 2 + k); c.scale(1, -1); }
      // dark base with a red danger band
      c.fillStyle = '#2a1f2d'; rrect(c, px, py + k * 0.8, k + 0.5, k * 0.2, [k * 0.05, k * 0.05, 0, 0]); c.fill();
      c.fillStyle = '#e03131'; c.fillRect(px, py + k * 0.84, k + 0.5, k * 0.06);
      for (let i = 0; i < 3; i++) {
        const l = px + k * (i / 3), m = l + k / 6, r = l + k / 3, base = py + k * 0.84, tip = py + k * 0.3;
        c.fillStyle = '#c3cad3';
        c.beginPath(); c.moveTo(l + k * 0.01, base); c.lineTo(m, tip); c.lineTo(r - k * 0.01, base); c.closePath(); c.fill();
        c.fillStyle = '#ffffff';   // lit facet
        c.beginPath(); c.moveTo(l + k * 0.01, base); c.lineTo(m, tip); c.lineTo(m, base); c.closePath(); c.fill();
        c.strokeStyle = '#1c1520'; c.lineWidth = Math.max(1.5, k * 0.045); c.lineJoin = 'round';
        c.beginPath(); c.moveTo(l + k * 0.01, base); c.lineTo(m, tip); c.lineTo(r - k * 0.01, base); c.stroke();
        c.lineJoin = 'miter';
      }
      c.restore();
      break;
    }
    default: break;
  }
}

function paintGround(c, s, x, y, px, py, k, T, pass) {
  const up = !isSolidAt(s, x, y - 1) && y > 0, down = !isSolidAt(s, x, y + 1) && y + 1 < s.h;
  const left = !isGround(s, x - 1, y) && !isSolidAt(s, x - 1, y), right = !isGround(s, x + 1, y) && !isSolidAt(s, x + 1, y);
  const rad = k * 0.28;
  const tl = up && left ? rad : 0, tr = up && right ? rad : 0, br = down && right ? rad : 0, bl = down && left ? rad : 0;
  if (pass === 0) {
    // depth below the surface darkens the body: a gradient across this tile, from its depth to the next
    const d = depthAt(s, x, y), d2 = down ? d + 0.6 : depthAt(s, x, y + 1);
    const dt = (v) => Math.min(1, v / 3.5);
    const gr = c.createLinearGradient(0, py, 0, py + k);
    gr.addColorStop(0, mix(T.dirt, T.dirt2, dt(d))); gr.addColorStop(1, mix(T.dirt, T.dirt2, dt(d2)));
    c.fillStyle = gr;
    rrect(c, px - (left ? 0 : 0.5), py - (up ? 0 : 0.5), k + (left ? 0 : 0.5) + (right ? 0 : 0.5), k + (up ? 0 : 0.5) + (down ? 0 : 0.5), [tl, tr, br, bl]);
    c.fill();
    c.save(); c.clip();
    paintTexture(c, x, y, px, py, k, T, d);
    // side and bottom rims: light on the left, shade on the right and below
    if (left) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(px, py, k * 0.07, k); }
    if (right) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(px + k * 0.92, py, k * 0.08, k); }
    if (down) {
      const g2 = c.createLinearGradient(0, py + k * 0.6, 0, py + k);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = g2; c.fillRect(px, py + k * 0.6, k, k * 0.4);
    }
    c.restore();
    // outline the open edges so ground reads as a solid, cut-out shape
    c.strokeStyle = mix(T.dirt2, '#000000', 0.45, 0.85); c.lineWidth = Math.max(1, k * 0.045);
    c.beginPath();
    if (left) { c.moveTo(px, py + tl); c.lineTo(px, py + k - bl); }
    if (right) { c.moveTo(px + k, py + tr); c.lineTo(px + k, py + k - br); }
    if (down) { c.moveTo(px + bl, py + k); c.lineTo(px + k - br, py + k); }
    c.stroke();
    if (bl) { c.beginPath(); c.arc(px + bl, py + k - bl, bl, Math.PI * 0.5, Math.PI); c.stroke(); }
    if (br) { c.beginPath(); c.arc(px + k - br, py + k - br, br, 0, Math.PI * 0.5); c.stroke(); }
    // soft occlusion cast onto the air below an overhang
    if (down) {
      const g3 = c.createLinearGradient(0, py + k, 0, py + k * 1.3);
      g3.addColorStop(0, 'rgba(20,10,30,0.22)'); g3.addColorStop(1, 'rgba(20,10,30,0)');
      c.fillStyle = g3; c.fillRect(px + bl * 0.5, py + k, k - (bl + br) * 0.5, k * 0.3);
    }
    return;
  }
  if (!up) return;
  // The cap (grass, a plank edge, brass trim, frosting) is one shape per run of open-topped
  // ground, drawn once from the run's first tile this chunk paints; it overhangs where a side is open.
  const st = T.style;
  if (x === Math.max(capRunStart(s, x, y), paintCx0 - 1)) {
    const xs = capRunStart(s, x, y);
    let xe = x;
    while (xe + 1 < s.w && s.grid[y][xe + 1] === '#' && !isSolidAt(s, xe + 1, y - 1) && xe < paintCx0 + CHUNK + 1) xe++;
    const realL = x === xs, realR = !(xe + 1 < s.w && s.grid[y][xe + 1] === '#' && !isSolidAt(s, xe + 1, y - 1));
    const openL = realL && !isGround(s, xs - 1, y) && !isSolidAt(s, xs - 1, y);
    const openR = realR && !isGround(s, xe + 1, y) && !isSolidAt(s, xe + 1, y);
    const capH = k * (st === 'cake' ? 0.3 : st === 'cloud' ? 0.34 : 0.26);
    const lx = x * k - (openL ? k * 0.07 : realL ? 0 : 1), rx = (xe + 1) * k + (openR ? k * 0.07 : realR ? 0 : 1);
    const rl = openL ? capH * 0.5 : 0, rr = openR ? capH * 0.5 : 0;
    const g = c.createLinearGradient(0, py, 0, py + capH);
    g.addColorStop(0, T.topHi); g.addColorStop(0.35, T.top); g.addColorStop(1, T.topLo);
    c.fillStyle = g;
    c.strokeStyle = mix(T.topLo, '#000000', 0.38, 0.75); c.lineWidth = Math.max(1, k * 0.035);
    if (st === 'grass' || st === 'cloud' || st === 'cake') {
      // a soft scalloped (or dripping) lower edge, two lobes a tile, shaped by a hash of the tile
      const base = py + capH * 0.62;
      c.beginPath();
      c.moveTo(lx + rl, py);
      c.lineTo(rx - rr, py);
      if (rr) c.arcTo(rx, py, rx, py + rr, rr); else c.lineTo(rx, py);
      c.lineTo(rx, base);
      for (let tx = xe; tx >= x; tx--) {
        for (let i = 1; i >= 0; i--) {
          const h = hash(tx, y, i);
          const a0 = tx === xe && i === 1 ? rx : tx * k + (i + 1) * k / 2, a1 = tx === x && i === 0 ? lx : tx * k + i * k / 2;
          const sag = st === 'cake' ? (h > 0.6 ? capH * (1.05 + h * 0.7) : capH * 0.8) : capH * (0.95 + h * 0.25);
          const w = a0 - a1;
          c.bezierCurveTo(a0 - w * 0.05, py + sag, a1 + w * 0.05, py + sag, a1, base);
        }
      }
      if (rl) { c.lineTo(lx, py + rl); c.arcTo(lx, py, lx + rl, py, rl); } else c.lineTo(lx, py);
      c.closePath();
      c.fill(); c.stroke();
    } else {
      rrect(c, lx, py - k * 0.02, rx - lx, capH, [rl, rr, rr, rl]); c.fill(); c.stroke();
      for (let tx = x; tx <= xe; tx++) {
        if (st === 'brick') {   // rivets on the brass trim
          c.fillStyle = T.topLo;
          for (const fx of [0.25, 0.75]) { c.beginPath(); c.arc(tx * k + k * fx, py + capH * 0.45, k * 0.035, 0, Math.PI * 2); c.fill(); }
        } else if (hash(tx, y, 4) > 0.6) {   // plank ends
          c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(tx * k + k * (0.3 + hash(tx, y, 5) * 0.4), py - k * 0.02, Math.max(1, k * 0.03), capH);
        }
      }
    }
    // a highlight line along the very top
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, k * 0.04); c.lineCap = 'round';
    c.beginPath(); c.moveTo(lx + Math.max(rl, k * 0.06), py + k * 0.04); c.lineTo(rx - Math.max(rr, k * 0.06), py + k * 0.04); c.stroke();
    c.lineCap = 'butt';
  }
  // grass tufts poke above the surface (purely decorative, a few pixels)
  if (st === 'grass') {
    c.fillStyle = T.topHi;
    for (let i = 0; i < 2; i++) {
      if (hash(x, y, 10 + i) < 0.55) continue;
      const bx = px + k * (0.2 + hash(x, y, 20 + i) * 0.6);
      c.beginPath(); c.moveTo(bx - k * 0.05, py + 1); c.lineTo(bx - k * 0.02, py - k * 0.1); c.lineTo(bx + k * 0.01, py + 1);
      c.moveTo(bx + k * 0.0, py + 1); c.lineTo(bx + k * 0.05, py - k * 0.07); c.lineTo(bx + k * 0.07, py + 1); c.fill();
    }
    if (hash(x, y, 30) > 0.86) {   // a tiny flower
      const fx = px + k * (0.3 + hash(x, y, 31) * 0.4);
      c.fillStyle = hash(x, y, 32) > 0.5 ? '#fff3f8' : '#ffe8a3';
      c.beginPath(); c.arc(fx, py - k * 0.03, k * 0.05, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f59f00'; c.beginPath(); c.arc(fx, py - k * 0.03, k * 0.02, 0, Math.PI * 2); c.fill();
    }
  }
}

function paintTexture(c, x, y, px, py, k, T, d) {
  const st = T.style;
  if (st === 'wood') {   // planks
    for (let i = 0; i < 2; i++) {
      const yy = py + i * k * 0.5;
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(px, yy, k, Math.max(1, k * 0.03));
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(px, yy + k * 0.03, k, k * 0.03);
      const seam = hash(x, y, i);
      if (seam > 0.55) { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(px + k * (0.15 + seam * 0.6), yy, Math.max(1, k * 0.03), k * 0.5); }
      if (hash(x, y, i + 7) > 0.7) { c.fillStyle = 'rgba(40,20,10,0.35)'; c.beginPath(); c.arc(px + k * (0.2 + hash(x, y, i + 8) * 0.6), yy + k * 0.25, k * 0.03, 0, Math.PI * 2); c.fill(); }
    }
    return;
  }
  if (st === 'brick' || st === 'stone') {   // bricks with mortar, each brick its own shade
    const rows = st === 'brick' ? 2 : 2;
    for (let i = 0; i < rows; i++) {
      const yy = py + i * k / rows, off = (y * rows + i) % 2 ? 0.5 : 0;
      for (let j = -1; j < 2; j++) {
        const bx = px + (j + off) * k * (st === 'stone' ? 0.7 : 0.5);
        const w = k * (st === 'stone' ? 0.7 : 0.5);
        const h = hash(x * 3 + j, y * rows + i, 2);
        c.fillStyle = h > 0.5 ? `rgba(255,255,255,${(h - 0.5) * 0.12})` : `rgba(0,0,0,${(0.5 - h) * 0.18})`;
        c.fillRect(bx + 1, yy + 1, w - 2, k / rows - 2);
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.fillRect(bx, yy, Math.max(1, k * 0.03), k / rows);
      }
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(px, yy, k, Math.max(1, k * 0.03));
    }
    if (st === 'stone' && hash(x, y, 9) > 0.7) { c.fillStyle = 'rgba(120,170,140,0.25)'; c.beginPath(); c.arc(px + k * hash(x, y, 10), py + k * 0.2, k * 0.12, 0, Math.PI * 2); c.fill(); }
    return;
  }
  // soil, cloud and cake: pebbles / soft blobs / sprinkles from a hash
  const n = st === 'cake' ? 3 : 3;
  for (let i = 0; i < n; i++) {
    const h1 = hash(x, y, i * 3), h2 = hash(x, y, i * 3 + 1), h3 = hash(x, y, i * 3 + 2);
    if (h3 < 0.35) continue;
    const ex = px + k * (0.12 + h1 * 0.76), ey = py + k * (0.15 + h2 * 0.75);
    if (st === 'cake') {
      c.fillStyle = ['#fff1f5', '#ffe8a3', '#d6f5ff', '#ffd1dc'][Math.floor(h3 * 4)];
      c.save(); c.translate(ex, ey); c.rotate(h1 * 6); rrect(c, -k * 0.06, -k * 0.018, k * 0.12, k * 0.036, k * 0.018); c.fill(); c.restore();
    } else if (st === 'cloud') {
      const cx2 = px + k * (0.25 + h1 * 0.5), cy2 = py + k * (0.28 + h2 * 0.45);   // kept inside the tile: no clipped edges
      c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.arc(cx2, cy2, k * (0.08 + h3 * 0.12), 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = h3 > 0.7 ? rgba(T.speck, 0.8) : 'rgba(40,20,10,0.22)';
      c.beginPath(); c.ellipse(ex, ey, k * (0.05 + h3 * 0.05), k * (0.035 + h3 * 0.03), h1 * 3, 0, Math.PI * 2); c.fill();
      if (h3 > 0.7) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(ex - k * 0.02, ey - k * 0.015, k * 0.018, 0, Math.PI * 2); c.fill(); }
    }
  }
  if (st === 'cake' && (y % 2 === 0) && d > 0) {   // a cream layer between sponges
    c.fillStyle = 'rgba(255,240,245,0.55)'; c.fillRect(px, py + k * 0.45, k, k * 0.1);
  }
}

// ---------------------------------------------------------------- live tiles
// Things with a few discrete states (doors, plates, bridges, lantern stones, hearts, signs,
// platforms, saw blades) are painted once per state into a sprite and blitted; only what
// truly animates (flags, glows, rotation, bobbing) is drawn live.

const sprites = new Map();
let spriteRes = 48;
function cached(ctx, key, px, py, k, pad, wT, hT, paint) {
  const R = spriteRes, full = `${key}@${R}`;
  let c = sprites.get(full);
  if (c === undefined) {
    if (sprites.size > 300) sprites.clear();
    c = makeCanvas((wT + pad * 2) * R, (hT + pad * 2) * R);
    if (c) paint(c.getContext('2d', SOFT), pad * R, pad * R, R);
    sprites.set(full, c);
  }
  if (!c) { paint(ctx, px, py, k); return; }
  ctx.drawImage(c, px - pad * k, py - pad * k, (wT + pad * 2) * k, (hT + pad * 2) * k);
}

// a glossy heart from a sprite, any size
function glossyHeart(ctx, cx, cy, r, color, k) {
  const u = r / k;   // heart radius in tiles
  cached(ctx, `heart:${color}:${u.toFixed(2)}`, cx - u * 1.3 * k, cy - u * 1.3 * k, k, 0, u * 2.6, u * 2.6, (c, X, Y, K) => heart(c, X + u * 1.3 * K, Y + u * 1.3 * K, u * K, color, true));
}

function drawTile(ctx, s, c, x, y, px, py, k, T, t) {
  const above = y > 0 ? s.grid[y - 1][x] : '.';
  switch (c) {
    case 'h': {
      const bob = Math.sin(t * 3 + x) * k * 0.06;
      glow(ctx, px + k / 2, py + k / 2 + bob, k * 0.75, '#ff6b8b', 0.45);
      glossyHeart(ctx, px + k / 2, py + k / 2 + bob, k * 0.3, '#ff4d6d', k);
      break;
    }
    case '!': {
      const on = s.checkpoint && s.checkpoint.x === x && s.checkpoint.y === y;
      const pole = px + k * 0.45;
      ctx.fillStyle = '#5c636a'; ctx.fillRect(pole, py - k * 0.6, k * 0.08, k * 1.6);
      ctx.fillStyle = on ? '#ffd43b' : '#ced4da'; ctx.beginPath(); ctx.arc(pole + k * 0.04, py - k * 0.62, k * 0.07, 0, Math.PI * 2); ctx.fill();
      if (on) glow(ctx, pole + k * 0.3, py - k * 0.35, k * 0.8, '#ff9ec7', 0.4);
      // a cloth that waves: two bezier edges sharing a travelling sine
      const L = k * 0.55, top = py - k * 0.56, bot = py - k * 0.1;
      const amp = on ? k * 0.07 : k * 0.03, ph = t * (on ? 6 : 2.5);
      const wv = (u) => Math.sin(ph - u * 4) * amp * u;
      ctx.fillStyle = on ? '#ff7eb6' : '#e9ecef';
      ctx.beginPath(); ctx.moveTo(pole + k * 0.08, top);
      ctx.bezierCurveTo(pole + L * 0.4, top + wv(0.4) - k * 0.03, pole + L * 0.7, top + wv(0.7) + k * 0.06, pole + L, (top + bot) / 2 + wv(1));
      ctx.bezierCurveTo(pole + L * 0.7, bot + wv(0.7) - k * 0.06, pole + L * 0.4, bot + wv(0.4) + k * 0.03, pole + k * 0.08, bot);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = on ? '#b8326f' : '#868e96'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
      if (on) heart(ctx, pole + k * 0.3, (top + bot) / 2 + wv(0.45), k * 0.09, '#ffffff');
      break;
    }
    case '*': {
      const g = ctx.createLinearGradient(0, py, 0, py + k);
      g.addColorStop(0, 'rgba(255, 224, 130, 0.12)'); g.addColorStop(1, 'rgba(255, 214, 102, 0.42)');
      ctx.fillStyle = g; ctx.fillRect(px, py, k + 1, k + 1);
      const sp = hash(x, y, 1);
      ctx.fillStyle = 'rgba(255,250,220,0.9)';
      const yy = py + k * (1 - ((t * 0.6 + sp) % 1)), xx = px + k * (0.2 + sp * 0.6);
      ctx.fillRect(xx - k * 0.03, yy - k * 0.03, k * 0.06, k * 0.06);
      if (above !== '*') {
        const hy = py - k * 0.1 + Math.sin(t * 2.5 + x) * k * 0.08;
        glow(ctx, px + k / 2, hy, k * 1.1, '#ffd480', 0.55);
        glossyHeart(ctx, px + k / 2, hy, k * 0.32, '#ff4d6d', k);
      }
      break;
    }
    case '~': {
      const lit = isLit(s, x, y);
      if (lit) glow(ctx, px + k / 2, py + k * 0.2, k * 1.0, '#ffd43b', 0.45);
      cached(ctx, `lan:${lit}`, px, py, k, 0.05, 1, 0.5, (c, X, Y, K) => {
        if (lit) {
          const g = c.createLinearGradient(0, Y, 0, Y + K * 0.42);
          g.addColorStop(0, '#fff3bf'); g.addColorStop(1, '#fcc419');
          c.fillStyle = g; rrect(c, X + K * 0.02, Y + K * 0.02, K * 0.96, K * 0.4, K * 0.12); c.fill();
          c.strokeStyle = '#a77b06'; c.lineWidth = Math.max(1, K * 0.04); c.stroke();
        } else {
          c.strokeStyle = 'rgba(255,224,102,0.18)'; c.setLineDash([K * 0.07, K * 0.09]); c.lineWidth = Math.max(1, K * 0.025);
          rrect(c, X + K * 0.04, Y + K * 0.04, K * 0.92, K * 0.36, K * 0.1); c.stroke(); c.setLineDash([]);
        }
      });
      break;
    }
    default: {
      if (c === '$' || c === 'T' || c === 'K') drawYardTile(ctx, s, c, x, y, px, py, k, t);
      else if (c >= '1' && c <= '8') drawPlate(ctx, s, c, x, y, px, py, k);
      else if (c >= 'A' && c <= 'D') drawDoor(ctx, s, c, x, y, px, py, k, above);
      else if (c >= 'a' && c <= 'd') {
        const g = c.charCodeAt(0) - 96, on = s.pressed[g];
        const l = s.grid[y][x - 1] === c, r = s.grid[y][x + 1] === c;
        cached(ctx, `br:${g}:${on}:${l}:${r}`, px, py, k, 0.05, 1, 0.4, (cx, X, Y, K) => paintBridge(cx, X, Y, K, g, on, l, r));
      }
    }
  }
}

function paintBridge(ctx, px, py, k, g, on, l, r) {
  const col = GROUP_COLORS[g], e = k * 0.05;   // joined ends reach into the sprite's margin: no seams
  if (on) {
    const gr = ctx.createLinearGradient(0, py, 0, py + k * 0.32);
    gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(1, shade(col, -0.15));
    ctx.fillStyle = gr; rrect(ctx, px - (l ? e : 0), py, k + (l ? e : 0) + (r ? e : 0), k * 0.32, [l ? 0 : k * 0.1, r ? 0 : k * 0.1, r ? 0 : k * 0.1, l ? 0 : k * 0.1]); ctx.fill();
    ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = Math.max(1, k * 0.04);
    ctx.beginPath(); ctx.moveTo(px - (l ? e : 0), py + k * 0.32); ctx.lineTo(px + k + (r ? e : 0), py + k * 0.32); ctx.moveTo(px - (l ? e : 0), py); ctx.lineTo(px + k + (r ? e : 0), py); ctx.stroke();
    if (!l) { rrect(ctx, px, py, k * 0.2, k * 0.32, [k * 0.1, 0, 0, k * 0.1]); ctx.stroke(); }
    if (!r) { rrect(ctx, px + k * 0.8, py, k * 0.2, k * 0.32, [0, k * 0.1, k * 0.1, 0]); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px + (l ? -e : k * 0.08), py + k * 0.05, k + (l ? e : -k * 0.08) + (r ? e : -k * 0.08), k * 0.04);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + k - Math.max(1, k * 0.02), py + k * 0.04, Math.max(1, k * 0.02), k * 0.24);
    glyph(ctx, g, px + k / 2, py + k * 0.16, k * 0.1);
  } else {
    ctx.globalAlpha = 0.5; ctx.setLineDash([k * 0.08, k * 0.08]); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, k * 0.04);
    rrect(ctx, px + k * 0.04, py + k * 0.04, k * 0.92, k * 0.26, k * 0.08); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    glyph(ctx, g, px + k / 2, py + k * 0.17, k * 0.08, 0.4);
  }
}

function drawPlate(ctx, s, c, x, y, px, py, k) {
  const pl = s.plates.find((q) => q.x === x && q.y === y);
  const g = pl ? pl.g : 1, heavy = c >= '5', on = !!s.pressed[g], ceil = !!(pl && pl.ceil);
  if (on) glow(ctx, px + k / 2, ceil ? py + k * 0.2 : py + k * 0.8, k * 0.6, GROUP_COLORS[g], 0.35);
  cached(ctx, `plate:${g}:${heavy}:${on}:${ceil}`, px, py, k, 0.05, 1, 1, (cx, X, Y, K) => paintPlate(cx, X, Y, K, g, heavy, on, ceil));
}

function paintPlate(ctx, px, py, k, g, heavy, on, ceil) {
  const col = GROUP_COLORS[g];
  ctx.save();
  if (ceil) { ctx.translate(0, py * 2 + k); ctx.scale(1, -1); }
  // the housing, sunk into the floor
  ctx.fillStyle = heavy ? '#2b2f36' : 'rgba(40,30,50,0.6)';
  rrect(ctx, px + k * 0.04, py + k * 0.86, k * 0.92, k * 0.14, [k * 0.06, k * 0.06, 0, 0]); ctx.fill();
  // the button: beveled, it sinks when pressed
  const bh = on ? k * 0.09 : k * 0.22;
  const top = py + k * 0.88 - bh;
  const gr = ctx.createLinearGradient(0, top, 0, top + bh);
  gr.addColorStop(0, shade(col, on ? 0.1 : 0.35)); gr.addColorStop(1, shade(col, on ? -0.3 : -0.12));
  ctx.fillStyle = gr; rrect(ctx, px + k * 0.1, top, k * 0.8, bh + k * 0.02, [k * 0.08, k * 0.08, 0, 0]); ctx.fill();
  ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = Math.max(1, k * 0.035); ctx.stroke();
  if (!on) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px + k * 0.18, top + k * 0.03, k * 0.64, Math.max(1, k * 0.03)); }
  if (heavy) {   // iron weights on both ends: needs someone heavy
    ctx.fillStyle = '#343a40';
    rrect(ctx, px + k * 0.12, top - k * 0.1, k * 0.16, k * 0.12, k * 0.03); ctx.fill();
    rrect(ctx, px + k * 0.72, top - k * 0.1, k * 0.16, k * 0.12, k * 0.03); ctx.fill();
  }
  ctx.restore();
  // the glyph is drawn upright even on the ceiling
  const gy = ceil ? py + k * 0.12 + bh / 2 : py + k * 0.88 - bh / 2;
  glyph(ctx, g, px + k / 2, gy, k * 0.11);
}

function drawDoor(ctx, s, c, x, y, px, py, k, above) {
  const g = c.charCodeAt(0) - 64, open = doorOpen(s, x, y);
  const horizontal = SOLID.includes(s.grid[y][x - 1] || '#') && SOLID.includes(s.grid[y][x + 1] || '#') && !SOLID.includes(above);
  const below = y + 1 < s.h ? s.grid[y + 1][x] : '.';
  // runs of the same door read as one panel: only the ends are rounded
  const a = horizontal ? s.grid[y][x - 1] === c : above === c, b = horizontal ? s.grid[y][x + 1] === c : below === c;
  cached(ctx, `door:${g}:${open}:${horizontal}:${a}:${b}`, px, py, k, 0.05, 1, 1, (cx, X, Y, K) => paintDoor(cx, X, Y, K, g, open, horizontal, a, b));
}

function paintDoor(ctx, px, py, k, g, open, horizontal, a, b) {
  const col = GROUP_COLORS[g];
  const r = k * 0.14, e = open ? 0 : k * 0.05;   // a closed panel reaches into the margin where it joins: no seams
  const rad = horizontal ? [a ? 0 : r, b ? 0 : r, b ? 0 : r, a ? 0 : r] : [a ? 0 : r, a ? 0 : r, b ? 0 : r, b ? 0 : r];
  let rx = px + k * 0.1, ry = py - (a ? e : 0), rw = k * 0.8, rh = k + (a ? e : 0) + (b ? e : 0);
  if (horizontal) { rx = px - (a ? e : 0); ry = py; rw = k + (a ? e : 0) + (b ? e : 0); rh = k * 0.8; }
  if (open) {   // a recessed, empty frame
    ctx.fillStyle = rgba(col, 0.12); rrect(ctx, rx, ry, rw, rh, rad); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.setLineDash([k * 0.12, k * 0.1]);
    ctx.beginPath();
    if (horizontal) { ctx.moveTo(rx, ry + k * 0.05); ctx.lineTo(rx + rw, ry + k * 0.05); ctx.moveTo(rx, ry + rh - k * 0.05); ctx.lineTo(rx + rw, ry + rh - k * 0.05); }
    else { ctx.moveTo(rx + k * 0.05, ry); ctx.lineTo(rx + k * 0.05, ry + rh); ctx.moveTo(rx + rw - k * 0.05, ry); ctx.lineTo(rx + rw - k * 0.05, ry + rh); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    glyph(ctx, g, px + k / 2, horizontal ? py + k * 0.4 : py + k / 2, k * 0.14, 0.4);
    return;
  }
  const gr = horizontal ? ctx.createLinearGradient(0, ry, 0, ry + rh) : ctx.createLinearGradient(rx, 0, rx + rw, 0);
  gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.22));
  ctx.fillStyle = gr; rrect(ctx, rx, ry, rw, rh, rad); ctx.fill();
  // outline the long sides and the rounded ends only (a joint gets no line)
  ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = Math.max(1.5, k * 0.05);
  const cl = horizontal && a ? px : px - k, cr = horizontal && b ? px + k : px + 2 * k;
  const ct = !horizontal && a ? py : py - k, cb = !horizontal && b ? py + k : py + 2 * k;
  ctx.save(); ctx.beginPath(); ctx.rect(cl, ct, cr - cl, cb - ct); ctx.clip();
  rrect(ctx, rx, ry, rw, rh, rad); ctx.stroke();
  ctx.restore();
  // the inset panel
  const ins = k * 0.12;
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  if (horizontal) rrect(ctx, rx + (a ? 0 : ins), ry + ins, rw - (a ? 0 : ins) - (b ? 0 : ins), rh - ins * 2, k * 0.06);
  else rrect(ctx, rx + ins, ry + (a ? 0 : ins), rw - ins * 2, rh - (a ? 0 : ins) - (b ? 0 : ins), k * 0.06);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  if (horizontal) ctx.fillRect(rx + (a ? 0 : k * 0.1), ry + k * 0.04, rw - (a ? 0 : k * 0.1) - (b ? 0 : k * 0.1), Math.max(1, k * 0.035));
  else ctx.fillRect(rx + k * 0.05, ry + (a ? 0 : k * 0.1), Math.max(1, k * 0.035), rh - (a ? 0 : k * 0.1) - (b ? 0 : k * 0.1));
  glyph(ctx, g, px + k / 2, horizontal ? py + k * 0.4 : py + k / 2, k * 0.17);
}

function drawEnt(ctx, s, e, sx, sy, k, t, x0, x1) {
  if (YARD_ENTS.includes(e.type)) { if (e.x + 6 >= x0 && e.x - 6 <= x1) drawYardEnt(ctx, s, e, sx, sy, k, t); return; }
  if (e.type === 'platform') {
    const x = sx(e.x), y = sy(e.y), w = e.w * k;
    if (x > sx(x1 + 2) || x + w < sx(x0 - 2)) return;
    softShadow(ctx, x + w / 2, y + k * 0.75, w * 0.5, k * 0.12, 0.35);
    cached(ctx, `plat:${e.look}:${e.w}:${e.g || 0}`, x, y, k, 0.45, e.w, 0.6, (c, X, Y, K) => paintPlatform(c, X, Y, K, e.look, e.w, e.g));
    if (e.look === 'gear') {
      ctx.strokeStyle = 'rgba(80,60,20,0.7)'; ctx.lineWidth = Math.max(1.5, k * 0.04);
      gearPath(ctx, x + w / 2, y + k * 0.18, k * 0.15, 6, s.frozen ? 0 : t * 3); ctx.stroke();
    }
  } else if (e.type === 'saw') {
    const r = (e.r || 0.6) * k, x = sx(e.x), y = sy(e.y);
    if (x < sx(x0 - 2) - r || x > sx(x1 + 2) + r) return;
    const moving = !(s.frozen || (e.g && Math.abs(e.x - e.prevX) + Math.abs(e.y - e.prevY) < 1e-9));
    const spin = moving ? t * 14 : 0;
    if (e.path) {
      ctx.strokeStyle = 'rgba(30,20,40,0.3)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(e.path[0][0]), sy(e.path[0][1])); ctx.lineTo(sx(e.path[1][0]), sy(e.path[1][1])); ctx.stroke(); ctx.setLineDash([]);
    }
    glow(ctx, x, y, r * 1.7, '#ff3b3b', moving ? 0.55 : 0.3);   // danger halo
    const u = e.r || 0.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    cached(ctx, `saw:${u}`, -r, -r, k, 0.05, u * 2, u * 2, (c, X, Y, K) => {
      const R = u * K, cx = X + R, cy = Y + R;
      const gr = c.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#ced4da'); gr.addColorStop(0.78, '#adb5bd'); gr.addColorStop(1, '#ff6b6b');
      c.fillStyle = gr; gearPath(c, cx, cy, R, 12, 0); c.fill();
      c.strokeStyle = '#1c1520'; c.lineWidth = Math.max(1.5, K * 0.05); c.lineJoin = 'round'; c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = Math.max(1, K * 0.03);
      c.beginPath(); c.arc(cx, cy, R * 0.5, 0, Math.PI * 2); c.stroke();
    });
    ctx.restore();
    if (moving) {   // motion blur arcs
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1.5, r * 0.08); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = spin * 1.3 + i * 2.1; ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); ctx.arc(x, y, r * 0.62, a, a + 0.9); }
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1c1520'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.stroke();
  } else if (e.type === 'sign') {
    const x = sx(e.x), y = sy(e.y);
    if (x < sx(x0 - 2) || x > sx(x1 + 2)) return;
    cached(ctx, 'sign', x, y - k * 1.3, k, 0.05, 1, 1.3, (c, X, Y, K) => {
      const cx = X + K * 0.5, by = Y + K * 1.3;
      c.fillStyle = '#7b5a4c'; c.fillRect(cx - K * 0.05, by - K * 0.9, K * 0.1, K * 0.9);
      const gr = c.createLinearGradient(0, by - K * 1.22, 0, by - K * 0.73);
      gr.addColorStop(0, '#ecd2a8'); gr.addColorStop(1, '#cfa874');
      c.fillStyle = gr; rrect(c, cx - K * 0.4, by - K * 1.22, K * 0.8, K * 0.48, K * 0.1); c.fill();
      c.strokeStyle = '#7b5a4c'; c.lineWidth = Math.max(1, K * 0.04); c.stroke();
      c.fillStyle = '#6d4c41'; c.font = `800 ${Math.max(10, K * 0.36)}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', cx, by - K * 0.97);
    });
  } else if (e.type === 'pinwheel') {
    const x = sx(e.x + 0.5), y = sy(e.y + 0.5), r = k * 0.48;
    if (x < sx(x0 - 2) || x > sx(x1 + 2)) return;
    ctx.fillStyle = '#6c757d'; ctx.fillRect(x - k * 0.045, y, k * 0.09, k * 0.9);
    const col = GROUP_COLORS[e.g] || '#ffffff';
    if (e.spin > 0) glow(ctx, x, y, r * 1.6, col, 0.4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(e.spin > 0 ? t * 14 : 0);
    cached(ctx, `pin:${e.g}`, -r, -r, k, 0.05, 0.96, 0.96, (c, X, Y, K) => {   // blades in the group's own colour, light and dark
      const R = K * 0.48, cx = X + R, cy = Y + R;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        c.fillStyle = i % 2 ? shade(col, -0.2) : shade(col, 0.45);
        c.beginPath(); c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        c.lineTo(cx + Math.cos(a + 0.9) * R * 0.6, cy + Math.sin(a + 0.9) * R * 0.6);
        c.closePath(); c.fill();
        c.strokeStyle = shade(col, -0.55); c.lineWidth = Math.max(1, K * 0.03); c.stroke();
      }
    });
    ctx.restore();
    glyph(ctx, e.g, x, y, k * 0.13);
  }
}

function paintPlatform(ctx, x, y, k, look, n, g) {
  const w = n * k;
  if (look === 'cloud') {
    ctx.fillStyle = '#b9cbe6';
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + k * 0.3, w * 0.55, k * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createLinearGradient(0, y - k * 0.3, 0, y + k * 0.6);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#e3ecf8');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + k * 0.22, w * 0.53, k * 0.33, 0, 0, Math.PI * 2);
    ctx.moveTo(x + w * 0.5, y + k * 0.1); ctx.ellipse(x + w * 0.25, y + k * 0.1, w * 0.25, k * 0.3, 0, 0, Math.PI * 2);
    ctx.moveTo(x + w * 1.0, y + k * 0.05); ctx.ellipse(x + w * 0.72, y + k * 0.05, w * 0.28, k * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a78aa'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
    ctx.fill();   // fill again over the inner outline arcs: only the silhouette keeps its edge
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x + w * 0.62, y + k * 0.05, k * 0.2, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke(); ctx.lineCap = 'butt';
    if (g) glyph(ctx, g, x + w / 2, y + k * 0.28, k * 0.12);
  } else if (look === 'gear') {
    const gr = ctx.createLinearGradient(0, y, 0, y + k * 0.35);
    gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.5, '#d4a64a'); gr.addColorStop(1, '#8d6e2f');
    ctx.fillStyle = '#6b5222';
    for (let i = 0; i < n * 3; i++) { rrect(ctx, x + (i + 0.3) * k / 3, y + k * 0.3, k * 0.12, k * 0.14, k * 0.03); ctx.fill(); }
    ctx.fillStyle = gr; rrect(ctx, x, y, w, k * 0.35, k * 0.08); ctx.fill();
    ctx.strokeStyle = '#5a4214'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.stroke();
    if (g) glyph(ctx, g, x + k * 0.25, y + k * 0.17, k * 0.1);
  } else {
    const gr = ctx.createLinearGradient(0, y, 0, y + k * 0.35);
    gr.addColorStop(0, '#c99a74'); gr.addColorStop(1, '#8a6043');
    ctx.fillStyle = gr; rrect(ctx, x, y, w, k * 0.35, k * 0.1); ctx.fill();
    ctx.strokeStyle = '#5a3c28'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + k * 0.1, y + k * 0.05, w - k * 0.2, Math.max(1, k * 0.03));
    ctx.fillStyle = '#5a3c28';
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x + (i + 0.5) * k, y + k * 0.2, k * 0.03, 0, Math.PI * 2); ctx.fill(); }
    if (g) glyph(ctx, g, x + w / 2, y + k * 0.18, k * 0.1);
  }
}

function drawNight(ctx, s, W, H, k, sx, sy) {
  if (!dark || dark.width !== W || dark.height !== H) dark = makeCanvas(W, H);
  if (!dark) return;
  const d = dark.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, W, H);
  d.fillStyle = 'rgba(6, 8, 26, 0.93)';
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const lights = [];
  const sg = s.players[SUGAR];
  if (!sg.dead) lights.push([sg, lightRadius(s), true]);
  const sp = s.players[SPICE];
  if (!sp.dead) lights.push([sp, 1.4, false]);
  for (const [p, r] of lights) {
    const cx = sx(p.x + p.w / 2), cy = sy(p.y + p.h / 2), R = r * k;
    const g = d.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath(); d.arc(cx, cy, R, 0, Math.PI * 2); d.fill();
  }
  ctx.drawImage(dark, 0, 0, W, H);
  // warm the lantern's light (inside its own radius only: what is lit stays what is lit)
  for (const [p, r, lantern] of lights) {
    if (!lantern) continue;
    const cx = sx(p.x + p.w / 2), cy = sy(p.y + p.h / 2);
    const R = r * k;   // a warm wash, strongest at the lantern and gone by the light's edge
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(255,170,80,0.3)'); g.addColorStop(0.6, 'rgba(255,150,60,0.14)'); g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
}

// The leash made visible: a dotted heart-string appears as you two drift apart.
function drawTether(ctx, s, sx, sy, k) {
  if (s.mode !== 'chapter') return;
  const [a, b] = s.players;
  if (a.dead || b.dead) return;
  const gap = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
  if (gap < 18) return;
  const strain = Math.min(1, (gap - 18) / 6);
  ctx.save();
  ctx.globalAlpha = 0.25 + strain * 0.6;
  ctx.strokeStyle = strain > 0.9 ? '#ff4d6d' : '#ffb3c1';
  ctx.lineWidth = Math.max(2, k * 0.06);
  ctx.setLineDash([k * 0.25, k * 0.25]);
  ctx.lineCap = 'round';
  const ax = sx(a.x + a.w / 2), ay = sy(a.y + a.h / 2), bx = sx(b.x + b.w / 2), by = sy(b.y + b.h / 2);
  const sag = (1 - strain) * k * 1.2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  glossyHeart(ctx, (ax + bx) / 2, (ay + by) / 2 + sag / 2, k * 0.22, '#ff4d6d', k);
  ctx.restore();
}

function drawFlood(ctx, s, W, H, sy, t) {
  const y = sy(s.flood.y);
  if (y > H) return;
  const wave = (x, a, f, sp, off) => y + off + Math.sin(x * f + t * sp) * a + Math.sin(x * f * 2.3 - t * sp * 0.7) * a * 0.4;
  // back wave, darker
  ctx.fillStyle = 'rgba(40, 110, 200, 0.4)';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, wave(x, 6, 0.022, -2.2, -6));
  ctx.lineTo(W, H); ctx.fill();
  // front water with depth
  const g = ctx.createLinearGradient(0, y, 0, Math.min(H, y + H * 0.5));
  g.addColorStop(0, 'rgba(110, 190, 255, 0.6)'); g.addColorStop(1, 'rgba(30, 80, 170, 0.78)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, wave(x, 5, 0.03, 3, 0));
  ctx.lineTo(W, H); ctx.fill();
  // the bright surface line
  ctx.strokeStyle = 'rgba(235, 248, 255, 0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, wave(x, 5, 0.03, 3, 0));
  ctx.stroke();
  // foam flecks riding the surface
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let x = 0; x < W; x += 46) {
    const xx = x + ((t * 30) % 46);
    ctx.beginPath(); ctx.ellipse(xx, wave(xx, 5, 0.03, 3, 0) + 6, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'butt';
}

// A heart. gloss adds a soft gradient and a highlight (the world's hearts); plain stays flat (UI confetti).
export function heart(ctx, cx, cy, r, color, gloss = false) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.6, cy - r * 1.3, cx, cy - r * 0.4);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
  if (!gloss) { ctx.fillStyle = color; ctx.fill(); return; }
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = shade(color, -0.55); ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.5, cy - r * 0.45, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
}

// A character, drawn standing on its feet; upside-down when gravity is flipped.
export function drawCharacter(ctx, id, x, y, w, h, o = {}) {
  const { facing = 1, t = 0, moving = false, land = 0, airborne = false, power = 'none', bright = false, gliding = false, alpha = 1, wave = 0, stun = 0, k = h / 1.25 } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  // squash on landing, stretch while rising, pivoted at the feet
  const sq = land > 0 ? 1 - land * 1.6 : airborne ? 1.06 : 1;
  const bob = moving && !airborne ? Math.abs(Math.sin(t * 14)) * h * 0.05 : 0;
  const hh = h * sq, ww = w / Math.sqrt(sq);
  const bx = x + (w - ww) / 2, by = y + (h - hh) - bob;
  const col = PLAYER_COLORS[id], rim = PLAYER_RIM[id];
  const rr = Math.min(ww, hh) * 0.42;
  // little feet, under the body
  const step = moving && !airborne ? Math.sin(t * 14) * ww * 0.08 : 0;
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.ellipse(bx + ww * 0.3 + step, by + hh - hh * 0.01, ww * 0.17, hh * 0.06, 0, 0, Math.PI * 2); ctx.ellipse(bx + ww * 0.7 - step, by + hh - hh * 0.01, ww * 0.17, hh * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  // the body: a soft vertical gradient, a dark outline so it pops on every theme
  const g = ctx.createLinearGradient(0, by, 0, by + hh);
  g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.18));
  roundRect(ctx, bx, by, ww, hh, rr);
  ctx.fillStyle = g; ctx.fill();
  // the shadow side, then a dark outline so the body pops on every theme
  const sg = ctx.createLinearGradient(bx + ww * 0.55, 0, bx + ww, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = 'rgba(30,14,40,0.85)'; ctx.lineWidth = Math.max(1.5, k * 0.06); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(bx + ww * 0.27, by + hh * 0.2, ww * 0.1, hh * 0.09, -0.5, 0, Math.PI * 2); ctx.fill();
  // eyes look where they face, and blink with a lid that closes rather than a pop
  const v = Math.sin(t * 1.3 + id * 2);
  const lid = stun > 0 ? 1 : Math.max(0, Math.min(1, (v - 0.975) / 0.02));
  const ex = bx + ww / 2 + facing * ww * 0.14, ey = by + hh * 0.35;
  const er = Math.max(1.5, ww * 0.1);
  for (const dx of [-ww * 0.16, ww * 0.16]) {
    if (lid > 0.85) {
      ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1.5, er * 0.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex + dx - er, ey); ctx.quadraticCurveTo(ex + dx, ey + er * 0.5, ex + dx + er, ey); ctx.stroke(); ctx.lineCap = 'butt';
      continue;
    }
    const ry = er * 1.45 * (1 - lid);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex + dx, ey, er * 1.3, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,14,40,0.35)'; ctx.lineWidth = Math.max(1, er * 0.18); ctx.stroke();
    ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.ellipse(ex + dx + facing * er * 0.4, ey + er * 0.1, er * 0.75, Math.min(er * 0.85, ry), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + dx + facing * er * 0.4 - er * 0.25, ey - er * 0.25, er * 0.25, 0, Math.PI * 2); ctx.fill();
  }
  // smile
  ctx.strokeStyle = 'rgba(40,10,30,0.6)'; ctx.lineWidth = Math.max(1, er * 0.4); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(bx + ww / 2 + facing * ww * 0.1, by + hh * 0.52, er * 1.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.lineCap = 'butt';
  // cheeks
  ctx.fillStyle = id === SUGAR ? 'rgba(255,90,140,0.45)' : 'rgba(255,150,170,0.45)';
  ctx.beginPath(); ctx.ellipse(bx + ww * 0.2, by + hh * 0.56, er * 1.1, er * 0.7, 0, 0, Math.PI * 2); ctx.ellipse(bx + ww * 0.8, by + hh * 0.56, er * 1.1, er * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  // Sugar: a bow. Spice: a hat. Shape tells them apart, not only colour.
  ctx.lineJoin = 'round';
  if (id === SUGAR) {
    const cx = bx + ww * 0.5, cy = by + hh * 0.02, r = Math.max(3, ww * 0.22);
    const bg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    bg.addColorStop(0, '#f06595'); bg.addColorStop(1, '#a61e4d');
    ctx.fillStyle = bg; ctx.strokeStyle = 'rgba(60,10,30,0.85)'; ctx.lineWidth = Math.max(1, k * 0.035);
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(cx + d * r * 0.8, cy - r * 1.4, cx + d * r * 1.9, cy - r * 0.9, cx + d * r * 1.6, cy);
      ctx.bezierCurveTo(cx + d * r * 1.9, cy + r * 0.9, cx + d * r * 0.8, cy + r * 1.3, cx, cy);
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx - r * 1.0, cy - r * 0.35, r * 0.22, 0, Math.PI * 2); ctx.fill();
  } else {
    const hg = ctx.createLinearGradient(0, by - hh * 0.24, 0, by + hh * 0.06);
    hg.addColorStop(0, '#2c6e94'); hg.addColorStop(1, '#123247');
    ctx.fillStyle = hg; ctx.strokeStyle = 'rgba(10,20,30,0.9)'; ctx.lineWidth = Math.max(1, k * 0.035);
    rrect(ctx, bx + ww * 0.2, by - hh * 0.22, ww * 0.6, hh * 0.24, [ww * 0.08, ww * 0.08, 0, 0]); ctx.fill(); ctx.stroke();
    rrect(ctx, bx - ww * 0.08, by - hh * 0.02, ww * 1.16, Math.max(2, hh * 0.08), Math.max(1, hh * 0.04)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(bx + ww * 0.2, by - hh * 0.06, ww * 0.6, Math.max(1.5, hh * 0.04));
  }
  ctx.lineJoin = 'miter';
  // power props
  if (power === 'lantern') {
    const lx = bx + ww / 2 + facing * ww * 0.7, ly = by + hh * 0.6;
    const lr = Math.max(3, k * (bright ? 0.2 : 0.14));
    glow(ctx, lx, ly, lr * 3, '#ffd43b', bright ? 0.7 : 0.45);
    ctx.fillStyle = bright ? '#fff3bf' : '#ffd43b';
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
  } else if (power === 'slam') {
    ctx.fillStyle = '#868e96';
    const hx = bx + ww / 2 - facing * ww * 0.55, hy = by + hh * 0.3;
    rrect(ctx, hx - k * 0.04, hy, k * 0.08, k * 0.45, k * 0.03); ctx.fill();
    ctx.fillStyle = '#495057'; rrect(ctx, hx - k * 0.16, hy - k * 0.08, k * 0.32, k * 0.16, k * 0.04); ctx.fill();
    ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
  } else if (power === 'pin') {
    ctx.fillStyle = '#ced4da';
    ctx.fillRect(bx + ww / 2 + facing * ww * 0.45, by + hh * 0.5, facing * k * 0.35, k * 0.07);
    ctx.fillStyle = '#495057'; ctx.fillRect(bx + ww / 2 + facing * ww * 0.45, by + hh * 0.47, facing * k * 0.06, k * 0.13);
  } else if (power === 'glide' || power === 'gust') {
    if (power === 'glide' && gliding) {
      const ug = ctx.createLinearGradient(0, by - hh * 0.45 - ww, 0, by - hh * 0.45);
      ug.addColorStop(0, '#74c0fc'); ug.addColorStop(1, '#1c7ed6');
      ctx.fillStyle = ug;
      ctx.beginPath(); ctx.arc(bx + ww / 2, by - hh * 0.45, ww * 0.95, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#123247'; ctx.lineWidth = Math.max(1.5, k * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + ww / 2, by - hh * 0.45); ctx.lineTo(bx + ww / 2, by + hh * 0.2); ctx.stroke();
    } else if (power === 'gust') {
      ctx.fillStyle = '#e7f5ff'; ctx.strokeStyle = '#74c0fc'; ctx.lineWidth = Math.max(1, k * 0.03);
      ctx.beginPath(); ctx.ellipse(bx + ww / 2 + facing * ww * 0.7, by + hh * 0.55, k * 0.12, k * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (power === 'freeze') {
    const cx = bx + ww / 2 + facing * ww * 0.7, cy = by + hh * 0.55, r = k * 0.15;
    ctx.fillStyle = '#fff8e1'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b08423'; ctx.lineWidth = Math.max(1.5, k * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.7); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy); ctx.stroke();
  }
  if (wave > 0) heart(ctx, bx + ww / 2, by - k * (0.5 + (1.2 - wave) * 0.5), k * 0.22, '#ff4d6d', true);
  if (stun > 0) {
    ctx.fillStyle = '#ffd43b';
    for (let i = 0; i < 3; i++) {
      const a = t * 8 + i * 2.1;
      ctx.beginPath(); ctx.arc(bx + ww / 2 + Math.cos(a) * ww * 0.5, by - k * 0.15 + Math.sin(a) * k * 0.1, Math.max(2, k * 0.07), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// A soft shadow on whatever is below the feet (above, when gravity is flipped); fades with height.
function contactShadow(ctx, s, p, sx, sy, k) {
  const cx = Math.floor(p.x + p.w / 2);
  const dir = p.grav < 0 ? -1 : 1;
  const foot = p.grav < 0 ? p.y : p.y + p.h;
  let cy = Math.floor(dir > 0 ? foot - 1e-6 : foot + 1e-6) + (dir > 0 ? 0 : 0);
  for (let i = 0; i < 6; i++, cy += dir) {
    if (cy < 0 || cy >= s.h) return;
    if (solidTile(s, cx, cy)) {
      const surf = dir > 0 ? cy : cy + 1;
      const dist = Math.abs(surf - foot);
      if (dist > 4) return;
      const f = 1 - dist / 4.5;
      softShadow(ctx, sx(p.x + p.w / 2), sy(surf), p.w * k * 0.62 * (0.6 + f * 0.4), k * 0.14 * (0.6 + f * 0.4), 0.55 * f);
      return;
    }
  }
}

function drawPlayer(ctx, s, p, sx, sy, k, t) {
  const x = sx(p.x), y = sy(p.y), w = p.w * k, h = p.h * k;
  const power = powerOf(s, p);
  if (p.dashT > 0) {
    ctx.fillStyle = PLAYER_COLORS[p.id];
    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.28 / i; roundRect(ctx, x - p.facing * i * k * 0.4, y, w, h, Math.min(w, h) * 0.42); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.save();
  if (p.grav < 0) { ctx.translate(0, y * 2 + h); ctx.scale(1, -1); }
  drawCharacter(ctx, p.id, x, y, w, h, {
    facing: p.facing, t, moving: Math.abs(p.vx) > 0.5, land: p.landT, airborne: !p.onGround, power,
    bright: p.bright, gliding: p.gliding, alpha: p.dead ? Math.max(0, p.deadT) * 0.6 : 1, wave: p.wave, stun: p.stun, k,
  });
  ctx.restore();
}

function drawPotato(ctx, s, sx, sy, k, t) {
  const p = s.players[s.holder];
  const x = sx(p.x + p.w / 2), y = sy(p.y) - k * 0.55;
  const urgent = s.fuse < 3;
  const r = k * (0.32 + (urgent ? Math.abs(Math.sin(t * 12)) * 0.06 : 0));
  if (urgent) glow(ctx, x, y, r * 3, '#ff3b3b', 0.4 + Math.abs(Math.sin(t * 12)) * 0.3);
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.2);
  g.addColorStop(0, '#e0a872'); g.addColorStop(1, '#9c6332');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5c3a1b'; ctx.lineWidth = Math.max(1.5, k * 0.04); ctx.stroke();
  ctx.fillStyle = 'rgba(92,58,27,0.5)';
  for (const [a, b] of [[-0.4, 0.1], [0.3, -0.3], [0.5, 0.35]]) { ctx.beginPath(); ctx.arc(x + a * r, y + b * r, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(1.5, k * 0.04);
  ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.6); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.1, x + r * 0.9, y - r * 0.9); ctx.stroke();
  glow(ctx, x + r * 0.9, y - r * 0.9, k * 0.3, urgent ? '#ff6b6b' : '#ffd43b', 0.8);
  ctx.fillStyle = urgent ? '#ff6b6b' : '#ffd43b';
  ctx.beginPath(); ctx.arc(x + r * 0.9, y - r * 0.9, k * 0.08, 0, Math.PI * 2); ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFx(ctx, fx, sx, sy, k) {
  if (!fx) return;
  for (const f of fx) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    if (f.kind === 'heart') heart(ctx, sx(f.x), sy(f.y), k * 0.18, f.color);
    else if (f.kind === 'ring') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), k * (1.2 - f.life / f.max) * 1.4, 0, Math.PI * 2); ctx.stroke();
    } else { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), k * 0.07, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- camera (view state, not sim state)

export function makeCamera(s) {
  const c = { x: 0, y: 0, scale: 32 };
  return snapCamera(c, s, 1280, 720, true);
}

// Frame both living players every frame from their real positions; zoom out as they part.
export function snapCamera(c, s, W, H, instant = false) {
  const live = s.players.filter((p) => !p.dead);
  const ps = live.length ? live : s.players;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ps) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + p.h);
  }
  const base = Math.min(W / 26, H / 15);
  const needW = maxX - minX + 10, needH = maxY - minY + 7;
  const zoom = Math.max(0.5, Math.min(1, W / (needW * base), H / (needH * base)));
  let scale = base * zoom;
  const arena = s.mode !== 'chapter';
  if (arena) scale = Math.min(W / (s.w + 1), H / (s.h - 2));
  let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2 - 1;
  if (arena) { tx = s.w / 2; ty = s.h / 2 - 1; }
  // keep the view inside the level
  const halfW = W / 2 / scale, halfH = H / 2 / scale;
  tx = s.w > halfW * 2 ? Math.min(Math.max(tx, halfW), s.w - halfW) : s.w / 2;
  ty = Math.min(ty, s.h - halfH);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return c;
  const a = instant ? 1 : 0.12;
  c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.scale += (scale - c.scale) * a;
  return c;
}

// ---------------------------------------------------------------- the Yard: stars, toys, doors

// the district a column belongs to (zones run left to right)
export function zoneAt(s, x) {
  let z = s.zones[0];
  for (const q of s.zones) if (x >= q.x) z = q;
  return z;
}
export function themeAt(s, x) { return zoneAt(s, x).theme || 'day'; }

function star5(ctx, cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
export function drawStar(ctx, cx, cy, r) {
  star5(ctx, cx, cy, r, '#f59f00');
  star5(ctx, cx - r * 0.04, cy - r * 0.08, r * 0.82, '#ffd43b');
  ctx.strokeStyle = '#9c5d00'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
}

const NOTE_COLORS = ['#ff6b6b', '#ff922b', '#ffd43b', '#94d82d', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2'];
function drawYardTile(ctx, s, c, x, y, px, py, k, t) {
  if (c === '$') {
    const bob = Math.sin(t * 2.6 + x) * k * 0.08;
    glow(ctx, px + k / 2, py + k / 2 + bob, k * 1.1, '#ffe066', 0.6);
    ctx.save(); ctx.translate(px + k / 2, py + k / 2 + bob); ctx.rotate(Math.sin(t * 1.7 + x) * 0.15);
    drawStar(ctx, 0, 0, k * 0.36); ctx.restore();
  } else if (c === 'T') {
    // a trampoline: springy legs, a bouncy top that squashes when someone lands
    const squash = s.players.some((p) => !p.dead && Math.floor(p.x + p.w / 2) === x && Math.abs(p.y + p.h - y) < 0.3) ? k * 0.08 : 0;
    ctx.fillStyle = '#495057'; ctx.fillRect(px + k * 0.12, py + k * 0.3, k * 0.1, k * 0.7); ctx.fillRect(px + k * 0.78, py + k * 0.3, k * 0.1, k * 0.7);
    const g = ctx.createLinearGradient(0, py, 0, py + k * 0.35);
    g.addColorStop(0, '#ff8fab'); g.addColorStop(1, '#e64980');
    ctx.fillStyle = g; rrect(ctx, px + k * 0.02, py + squash, k * 0.96, k * 0.3, k * 0.12); ctx.fill();
    ctx.strokeStyle = '#862e4b'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.stroke();
    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = Math.max(1, k * 0.03);
    for (let i = 0; i < 3; i++) { const yy = py + k * (0.45 + i * 0.18); ctx.beginPath(); ctx.moveTo(px + k * 0.22, yy); ctx.lineTo(px + k * 0.78, yy + k * 0.09); ctx.stroke(); }
  } else if (c === 'K') {
    // a floor piano key; it lights up while someone stands on it
    const on = s.players.some((p) => !p.dead && p.onGround && Math.floor(p.x + p.w / 2) === x && Math.abs(p.y + p.h - y) < 0.05);
    const col = NOTE_COLORS[(x + 3) % NOTE_COLORS.length];
    ctx.fillStyle = '#2b2d42'; ctx.fillRect(px, py, k + 1, k + 1);
    const g = ctx.createLinearGradient(0, py, 0, py + k);
    g.addColorStop(0, on ? '#ffffff' : '#f8f9fa'); g.addColorStop(1, on ? col : '#ced4da');
    ctx.fillStyle = g; rrect(ctx, px + k * 0.05, py + (on ? k * 0.08 : 0), k * 0.9, k * 0.92, k * 0.1); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(px + k * 0.15, py + (on ? k * 0.08 : 0) + k * 0.08, k * 0.7, k * 0.1);
    if (on) glow(ctx, px + k / 2, py, k * 1.2, col, 0.5);
  }
}

const YARD_ENTS = ['door', 'gate', 'race', 'balloons', 'ball', 'bench', 'striker', 'piano'];
function label(ctx, text, x, y, k, color = '#ffffff', bg = 'rgba(28,20,52,0.72)') {
  ctx.font = `800 ${Math.max(11, k * 0.36)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + k * 0.4;
  ctx.fillStyle = bg; rrect(ctx, x - w / 2, y - k * 0.3, w, k * 0.6, k * 0.3); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
}

function drawYardEnt(ctx, s, e, sx, sy, k, t) {
  switch (e.type) {
    case 'door': {
      const x = sx(e.x), y = sy(e.y), w = 2 * k, h = 3 * k;
      const col = e.arcade ? '#9775fa' : e.id === 'home' ? '#f783ac' : '#ffa94d';
      // an arched door in its frame
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, x - k * 0.12, y - h - k * 0.12, w + k * 0.24, h + k * 0.12, k * 0.9); ctx.fill();
      const g = ctx.createLinearGradient(0, y - h, 0, y);
      g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.25));
      ctx.fillStyle = g; rrect(ctx, x, y - h, w, h, k * 0.85); ctx.fill();
      ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = Math.max(1.5, k * 0.06); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; rrect(ctx, x + k * 0.25, y - h + k * 0.35, w - k * 0.5, h - k * 0.35, k * 0.6); ctx.fill();
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(x + w - k * 0.45, y - h * 0.42, k * 0.08, 0, Math.PI * 2); ctx.fill();
      if (e.locked) {   // a padlock
        const lx = x + w / 2, ly = y - h * 0.5;
        ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(2, k * 0.08);
        ctx.beginPath(); ctx.arc(lx, ly - k * 0.12, k * 0.2, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#868e96'; rrect(ctx, lx - k * 0.3, ly - k * 0.12, k * 0.6, k * 0.45, k * 0.08); ctx.fill();
      } else if (e.wait > 0) {   // a ring fills while you both stand in the doorway
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, k * 0.1);
        ctx.beginPath(); ctx.arc(x + w / 2, y - h * 0.5, k * 0.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.wait / 0.8)); ctx.stroke();
      }
      label(ctx, e.label || e.id, x + w / 2, y - h - k * 0.55, k, e.locked ? '#ced4da' : '#ffffff');
      break;
    }
    case 'race': {
      // the start flag (chequered) on the balcony, the finish flag over the last platform
      for (const [fx, fy, txt] of [[e.x, e.y, 'START'], [e.x1, 16, 'FINISH']]) {
        const x = sx(fx), y = sy(fy);
        ctx.fillStyle = '#495057'; ctx.fillRect(x - k * 0.04, y - k * 2.2, k * 0.08, k * 2.2);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#212529' : '#ffffff'; ctx.fillRect(x + k * 0.04 + i * k * 0.16, y - k * 2.15 + j * k * 0.16 + Math.sin(t * 5 + i) * k * 0.02, k * 0.16, k * 0.16); }
        label(ctx, txt, x + k * 0.35, y - k * 2.6, k);
      }
      if (e.phase === 'count') label(ctx, String(Math.ceil(e.count)), sx(e.x), sy(e.y) - k * 3.6, k * 2.2, '#ffd43b');
      else if (e.phase === 'run') label(ctx, `${e.clock.toFixed(1)}s`, sx(e.x1), sy(16) - k * 3.4, k * 1.3, '#ffffff');
      else if (e.phase === 'rest') label(ctx, e.winner < 0 ? 'Nobody made it!' : `${e.winner ? 'Spice' : 'Sugar'} wins!`, sx(e.x1), sy(16) - k * 3.4, k * 1.3, PLAYER_COLORS[Math.max(0, e.winner)]);
      break;
    }
    case 'balloons': {
      for (const who of [0, 1]) {
        const px = sx((who ? e.x1 : e.x) + 0.5), base = sy(e.y);
        // the pump: a plunger that sinks when stomped
        ctx.fillStyle = '#868e96'; rrect(ctx, px - k * 0.35, base - k * 0.5, k * 0.7, k * 0.5, k * 0.1); ctx.fill();
        ctx.fillStyle = PLAYER_COLORS[who]; ctx.fillRect(px - k * 0.3, base - k * 0.62, k * 0.6, k * 0.12);
        const n = e.winner === who ? 0 : e.n[who];
        const r = k * (0.25 + n * 0.07);
        const by = base - k * 2.2 - r;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, base - k * 0.6); ctx.lineTo(px, by + r); ctx.stroke();
        if (e.winner === who) { label(ctx, 'POP!', px, by, k * 1.2, '#ffd43b'); continue; }
        const g = ctx.createRadialGradient(px - r * 0.35, by - r * 0.35, r * 0.1, px, by, r);
        g.addColorStop(0, shade(PLAYER_COLORS[who], 0.5)); g.addColorStop(1, PLAYER_COLORS[who]);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, by, r * 0.9, r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = shade(PLAYER_COLORS[who], -0.4); ctx.lineWidth = Math.max(1, k * 0.04); ctx.stroke();
      }
      break;
    }
    case 'ball': {
      const x = sx(e.x), y = sy(e.y), r = e.r ? e.r * k : 0.35 * k;
      // goal nets at each end of the pit, and the score
      for (const [gx, who] of [[e.x0, 1], [e.x1 - 1, 0]]) {
        const X = sx(gx), Y = sy(e.hy - 1.6);
        ctx.strokeStyle = shade(PLAYER_COLORS[who], -0.2); ctx.lineWidth = Math.max(2, k * 0.08);
        ctx.strokeRect(X + k * 0.05, Y, k * 0.9, k * 2.0);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X + k * 0.05, Y + i * k * 0.5); ctx.lineTo(X + k * 0.95, Y + i * k * 0.5); ctx.stroke(); }
      }
      label(ctx, `${e.score[0]} : ${e.score[1]}`, sx((e.x0 + e.x1) / 2), sy(e.hy) - k * 3.2, k * 1.1);
      if (e.winner >= 0) label(ctx, `${e.winner ? 'Spice' : 'Sugar'} wins the footy!`, sx((e.x0 + e.x1) / 2), sy(e.hy) - k * 4.4, k * 1.1, PLAYER_COLORS[e.winner]);
      softShadow(ctx, x, sy(e.hy + 0.35), r, r * 0.3, 0.3);
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.x * 2);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#212529';
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1, k * 0.04); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'bench': {
      const x = sx(e.x), y = sy(e.y), w = e.w * k;
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + k * 0.2, y - k * 0.45, k * 0.12, k * 0.45); ctx.fillRect(x + w - k * 0.32, y - k * 0.45, k * 0.12, k * 0.45);
      const g = ctx.createLinearGradient(0, y - k * 0.6, 0, y - k * 0.4);
      g.addColorStop(0, '#d9a066'); g.addColorStop(1, '#a5714a');
      ctx.fillStyle = g; rrect(ctx, x, y - k * 0.6, w, k * 0.18, k * 0.06); ctx.fill();
      ctx.fillStyle = '#a5714a'; rrect(ctx, x + k * 0.1, y - k * 1.3, w - k * 0.2, k * 0.14, k * 0.06); ctx.fill();
      rrect(ctx, x + k * 0.1, y - k * 1.0, w - k * 0.2, k * 0.14, k * 0.06); ctx.fill();
      if (e.sit > 0) { ctx.globalAlpha = Math.min(1, e.sit / 1.5); heart(ctx, x + w / 2, y - k * 2.2 - e.sit * k * 0.3, k * 0.3, '#ff4d6d'); ctx.globalAlpha = 1; }
      break;
    }
    case 'striker': {
      const x = sx(e.x + 0.5), base = sy(e.y), top = e.top || 8;
      // the tower with marks, the bell, the puck riding up it
      ctx.fillStyle = '#c92a2a'; rrect(ctx, x - k * 0.18, base - top * k - k * 0.4, k * 0.36, top * k + k * 0.4, k * 0.1); ctx.fill();
      ctx.fillStyle = '#ffe3e3';
      for (let i = 1; i < top; i++) ctx.fillRect(x - k * 0.18, base - i * k, k * 0.36, Math.max(1, k * 0.03));
      const ring = e.puck >= top - 0.01;
      if (ring) glow(ctx, x, base - top * k - k * 0.6, k * 1.4, '#ffd43b', 0.8);
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(x, base - top * k - k * 0.6, k * 0.35, Math.PI, 0); ctx.lineTo(x + k * 0.42, base - top * k - k * 0.45); ctx.lineTo(x - k * 0.42, base - top * k - k * 0.45); ctx.fill();
      ctx.fillStyle = '#212529'; rrect(ctx, x - k * 0.24, base - Math.max(0.3, Math.min(top, e.puck)) * k - k * 0.15, k * 0.48, k * 0.3, k * 0.08); ctx.fill();
      ctx.fillStyle = '#495057'; rrect(ctx, x - k * 0.5, base - k * 0.22, k * 1.0, k * 0.22, k * 0.06); ctx.fill();   // the pad
      if (e.best > 0) label(ctx, `best ${e.best.toFixed(1)}`, x, base - top * k - k * 1.5, k * 0.9);
      break;
    }
    default: break;
  }
}
