// Draws the top-down world. Never writes to the state it is handed (tests/td-render.test.mjs
// renders many states and compares them byte for byte). Everything that varies per tile comes
// from a hash of its coordinates; time comes in as `t`. No Math.random, no shadowBlur, no filter.
//
// Each zone has its own ART STYLE (zone.style), not just a palette: a tile is painted by the
// style of the zone it lies in. The static tiles (floors, walls, trees, water and pit beds,
// spikes, planks, sunk crates, rocks) are painted once into chunk canvases in software and
// blitted; a chunk repaints only when its tiles change or the zoom moves a step. Everything
// that moves or changes state (plates, doors, bridges, keys, stars, vines, water ripples,
// entities, players) is drawn live on top. View: a 3/4 storybook look from above — raised
// things (walls, trees, rocks, crates, closed doors) show a little front face and a shadow.
import * as C from './config.js';
import { tileAt, zoneOf, powerOf } from './sim.js';
import { drawCharacter, heart, PLAYER_COLORS, GROUP_COLORS, textPx, drawStar } from '../render.js';

export const VIEW_TILES = 13;   // tiles across the screen's short side when the two of you are close
const LIFT = 0.36;            // how much of a raised tile's height shows as its front face (tiles)
const CHUNK = 8;              // tiles per chunk side
const RES = [16, 24, 32, 40, 48, 56, 64, 80];
const SOFT = { willReadFrequently: true };
const TAU = Math.PI * 2;
const SPICE_TEAL = '#2ec4b6';
const NOTE_COLORS = ['#ff6b6b', '#ff922b', '#ffd43b', '#94d82d', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2'];

// ---------------------------------------------------------------- small helpers

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
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v); }
  return v;
}
function mix(a, b, t, alpha = 1) {
  const A = rgb(a), B = rgb(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return alpha >= 1 ? `rgb(${c(0)},${c(1)},${c(2)})` : `rgba(${c(0)},${c(1)},${c(2)},${alpha})`;
}
function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
const shade = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// a soft additive glow (a live radial gradient; no shadowBlur)
function glow(ctx, x, y, r, color, alpha = 1) {
  if (!(r > 0) || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.4, rgba(color, alpha * 0.45)); g.addColorStop(1, rgba(color, 0));
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op;
}
// a soft dark ellipse (contact shadows)
function softShadow(ctx, x, y, rx, ry, alpha, color = '20,10,30') {
  if (!(rx > 0) || !(ry > 0) || alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${color},${0.6 * alpha})`); g.addColorStop(0.6, `rgba(${color},${0.35 * alpha})`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}
// group glyphs: colour is never the only cue
function groupShape(ctx, g, cx, cy, r) {
  ctx.beginPath();
  if (g === 1) ctx.arc(cx, cy, r, 0, TAU);
  else if (g === 2) { const q = r * 0.86; ctx.rect(cx - q, cy - q, q * 2, q * 2); }
  else if (g === 3) { const q = r * 1.12; ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy + q * 0.8); ctx.lineTo(cx - q, cy + q * 0.8); ctx.closePath(); }
  else { const q = r * 1.15; ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - q, cy); ctx.closePath(); }
}
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
function label(ctx, text, x, y, px, color = '#ffffff', bg = 'rgba(28,20,52,0.78)') {
  ctx.font = `800 ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + px * 0.9;
  ctx.fillStyle = bg; rrect(ctx, x - w / 2, y - px * 0.75, w, px * 1.5, px * 0.75); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + px * 0.05);
}

// --- painterly primitives (chunk painting; coordinates are global pixels so patterns tile)

// an irregular soft blob: a closed curve through jittered points round a circle
function blob(c, cx, cy, rx, ry, seed, jit = 0.22, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(seed, i, 7) * 0.4;
    const f = 1 - jit + hash(seed, i, 3) * jit * 2;
    pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
  }
  c.beginPath();
  const m = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const s0 = m(0); c.moveTo(s0[0], s0[1]);
  for (let i = 1; i <= n; i++) { const p = pts[i % n], q = m(i); c.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
  c.closePath();
}
// a wobbly ink line from a to b
function wobble(c, x0, y0, x1, y1, amp, seed, first = true) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  if (first) c.moveTo(x0, y0);
  const n = 3;
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1), o = (hash(seed, i, 11) - 0.5) * 2 * amp;
    c.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o);
  }
  c.lineTo(x1, y1);
}
// 45-degree hatching clipped to a rect, lines on global multiples of gap (continuous across tiles)
function hatch(c, x, y, w, h, gap, dir = 1) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.beginPath();
  if (dir > 0) {
    for (let u = Math.ceil((x + y) / gap) * gap; u <= x + w + y + h; u += gap) { c.moveTo(u - (y + h), y + h); c.lineTo(u - y, y); }
  } else {
    for (let u = Math.ceil((x - y - h) / gap) * gap; u <= x + w - y; u += gap) { c.moveTo(u + y, y); c.lineTo(u + y + h, y + h); }
  }
  c.stroke();
  c.restore();
}
function specks(c, X, Y, R, seed, n, color, size) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 21), b = hash(seed, i, 22), r = size * (0.5 + hash(seed, i, 23));
    c.fillRect(X + a * R, Y + b * R, r, r);
  }
}

// ---------------------------------------------------------------- what each tile is, statically

// live tiles stand on a static base: plates, doors, keys and stars on floor; bridges and vines on water
function baseChar(ch, x, y, vineWas) {
  if (ch === undefined) return '#';
  if ((ch >= '1' && ch <= '8') || (ch >= 'A' && ch <= 'D') || ch === 'K' || ch === '$' || ch === 'P' || ch === 'Q' || ch === 'H') return '.';
  if (ch >= 'a' && ch <= 'd') return 'w';
  if (ch === 'v') return (vineWas && vineWas.get(y * 100000 + x)) || 'w';
  return ch;
}
const RAISED = '#Tr';
function vineMap(s) {
  if (!s.vine || !s.vine.cells) return null;
  const m = new Map();
  for (const [x, y, was] of s.vine.cells) m.set(y * 100000 + x, was);
  return m;
}

// a neighbourhood reader for one tile being painted
function reader(s, vw) {
  return (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? '#' : baseChar(s.grid[y][x], x, y, vw));
}

// ---------------------------------------------------------------- the styles
//
// Each style: bg (screen colour beyond the map / its crossfade), ink (outline for live objects),
// painters for the static tiles (paper/floor, water, pit, wall, tree, rock, spikes, planks, sunk),
// ripple (adds this frame's water marks to a path), crate (a live crate), overlay (screen pass).
// q(dx, dy) reads the base tile next door. X, Y are the tile's top-left in chunk pixels, R its size.

const isW = (ch) => ch === '#';
const isWater = (ch) => ch === 'w' || ch === 'u';

// the parts of a raised wall tile
function wallParts(q, X, Y, R) {
  const n = isW(q(0, -1)), so = isW(q(0, 1)), e = isW(q(1, 0)), w = isW(q(-1, 0));
  const top = Y - LIFT * R;
  return { n, so, e, w, top, mid: Y + R - LIFT * R, bot: Y + R };
}
// stroke the exposed outline of a wall tile (top face edges and front face sides)
function wallEdges(c, p, X, R, wob = 0, seed = 0) {
  c.beginPath();
  const seg = (x0, y0, x1, y1, i) => { if (wob) wobble(c, x0, y0, x1, y1, wob, seed + i); else { c.moveTo(x0, y0); c.lineTo(x1, y1); } };
  if (!p.n) seg(X, p.top, X + R, p.top, 1);
  if (!p.so) { seg(X, p.mid, X + R, p.mid, 2); seg(X, p.bot, X + R, p.bot, 3); }
  if (!p.w) seg(X, p.top, X, p.so ? p.bot + LIFT * R : p.bot, 4);
  if (!p.e) seg(X + R, p.top, X + R, p.so ? p.bot + LIFT * R : p.bot, 5);
  c.stroke();
}
// default edge for water/pit tiles: a line on every side that meets something else
function holeEdges(c, q, X, Y, R, same, wob = 0, seed = 0) {
  c.beginPath();
  const seg = (x0, y0, x1, y1, i) => { if (wob) wobble(c, x0, y0, x1, y1, wob, seed * 7 + i); else { c.moveTo(x0, y0); c.lineTo(x1, y1); } };
  if (!same(q(0, -1))) seg(X, Y, X + R, Y, 1);
  if (!same(q(0, 1))) seg(X, Y + R, X + R, Y + R, 2);
  if (!same(q(-1, 0))) seg(X, Y, X, Y + R, 3);
  if (!same(q(1, 0))) seg(X + R, Y, X + R, Y + R, 4);
  c.stroke();
}
// the dark band a raised tile casts on the floor south and east of it
function castShadow(c, q, X, Y, R, color, depth = 0.3) {
  if (RAISED.includes(q(0, -1))) {
    const g = c.createLinearGradient(0, Y, 0, Y + R * depth);
    g.addColorStop(0, rgba(color, 0.42)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(X, Y, R, R * depth);
  }
  if (RAISED.includes(q(-1, 0))) {
    const g = c.createLinearGradient(X, 0, X + R * depth * 0.6, 0);
    g.addColorStop(0, rgba(color, 0.28)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(X, Y - LIFT * R, R * depth * 0.6, R + LIFT * R);
  }
}

// ------------------------------------------------ CANDY (the Plaza): cake walls, sprinkles, lollipops
const SPRINKLES = ['#ff5d8f', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b'];
function sprinkle(c, x, y, R, seed, alpha = 0.85) {
  const a = hash(seed, 1, 5) * Math.PI, l = R * 0.07, w = Math.max(1, R * 0.028);
  c.strokeStyle = rgba(SPRINKLES[Math.floor(hash(seed, 2, 5) * SPRINKLES.length)], alpha);
  c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  c.lineCap = 'butt';
}
const candy = {
  bg: '#ffd1e3', ink: '#7a2e4f', shadow: '#b0507a', vignette: '#ff9cc4',
  floor(c, q, x, y, X, Y, R) {   // biscuit tiles set in icing, a few sprinkles
    // soft strawberry frosting, a faint checker of sugar-paper squares, a swirl now and then
    c.fillStyle = '#ffe4ee'; c.fillRect(X, Y, R, R);
    if ((x + y) % 2 === 0) { c.fillStyle = '#fff1f6'; rrect(c, X + R * 0.06, Y + R * 0.06, R * 0.88, R * 0.88, R * 0.3); c.fill(); }
    if (hash(x, y, 7) < 0.12) {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = Math.max(1, R * 0.04); c.lineCap = 'round';
      c.beginPath(); const cx = X + R * 0.5, cy = Y + R * 0.5;
      for (let a = 0; a < 3.2 * Math.PI; a += 0.35) { const rr = R * 0.04 + a * R * 0.025; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      c.stroke(); c.lineCap = 'butt';
    }
    const n = Math.floor(hash(x, y, 1) * 3);
    for (let i = 0; i < n; i++) sprinkle(c, X + R * (0.2 + hash(x, y, 10 + i) * 0.6), Y + R * (0.25 + hash(x, y, 20 + i) * 0.6), R, x * 31 + y * 17 + i, 0.5);
  },
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#56c6f7'; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1, R * 0.05); c.lineCap = 'round';
    c.beginPath(); c.arc(X + R * (0.3 + hash(x, y, 2) * 0.4), Y + R * (0.3 + hash(x, y, 3) * 0.4), R * 0.18, 0.2, 2.6); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(X + hash(x, y, 30 + i) * R, Y + hash(x, y, 40 + i) * R, R * 0.035, 0, TAU); c.fill(); }
    c.lineCap = 'butt';
  },
  water2(c, q, x, y, X, Y, R) {   // a deep blue sugar-glass rim where it meets land
    c.strokeStyle = '#1c7ed6'; c.lineWidth = Math.max(2, R * 0.1);
    holeEdges(c, q, X, Y, R, isWater);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(1, R * 0.035);
    c.save(); c.translate(R * 0.04, R * 0.08); holeEdges(c, q, X, Y, R, isWater); c.restore();
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#2a120c'; c.fillRect(X, Y, R, R);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(X + R * 0.15, Y + R * 0.2, R * 0.7, R * 0.7);
    // melted chocolate dripping in from the edge above
    if (q(0, -1) !== 'o') {
      c.fillStyle = '#6b3a24';
      c.fillRect(X, Y, R, R * 0.12);
      for (let i = 0; i < 3; i++) {
        const dx = X + R * (0.15 + i * 0.33 + hash(x, y, i) * 0.1), l = R * (0.15 + hash(x, y, 9 + i) * 0.3);
        rrect(c, dx - R * 0.06, Y, R * 0.12, l, R * 0.06); c.fill();
      }
    }
    c.strokeStyle = '#140805'; c.lineWidth = Math.max(2, R * 0.06);
    holeEdges(c, q, X, Y, R, (ch) => ch === 'o');
  },
  wall(c, q, x, y, X, Y, R) {   // a slab of layer cake: piped frosting on top, sponge and jam in front
    const p = wallParts(q, X, Y, R);
    const icing = '#ff86b2', icingHi = '#ffc4da';
    if (!p.so) {
      const h = p.bot - p.mid;
      c.fillStyle = '#f3c788'; c.fillRect(X, p.mid, R, h);                          // sponge
      c.fillStyle = '#e8467c'; c.fillRect(X, p.mid + h * 0.42, R, h * 0.16);         // jam
      c.fillStyle = '#fff2dc'; c.fillRect(X, p.mid + h * 0.36, R, h * 0.06);         // cream
      c.fillStyle = '#7b4a2e'; c.fillRect(X, p.bot - h * 0.2, R, h * 0.2);           // a chocolate base
      specks(c, X, p.mid + h * 0.6, R, x * 5 + y, 3, 'rgba(150,90,40,0.4)', R * 0.03);
    }
    c.fillStyle = icing; c.fillRect(X, p.top, R, p.mid - p.top);
    {   // a paler middle, inset only from the exposed sides, so a long wall reads as one slab
      const hx0 = X + (p.w ? 0 : R * 0.1), hx1 = X + R - (p.e ? 0 : R * 0.1), hy0 = p.top + (p.n ? 0 : R * 0.16), hy1 = p.mid - (p.so ? 0 : R * 0.1);
      c.fillStyle = icingHi; c.fillRect(hx0, hy0, hx1 - hx0, hy1 - hy0);
    }
    if (!p.so) {   // drips over the front
      c.fillStyle = icing;
      for (let i = 0; i < 3; i++) {
        const dx = X + R * (0.06 + i * 0.32 + hash(x, y, 50 + i) * 0.12), l = R * LIFT * (0.2 + hash(x, y, 60 + i) * 0.45);
        rrect(c, dx, p.mid - R * 0.05, R * 0.17, l + R * 0.05, R * 0.085); c.fill();
      }
    }
    if (!p.n) {   // piping along the back edge
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(X + R * (0.125 + i * 0.25), p.top + R * 0.06, R * 0.07, 0, TAU); c.fill(); }
    }
    for (let i = 0; i < 3; i++) sprinkle(c, X + R * (0.18 + hash(x, y, 70 + i) * 0.64), p.top + R * (0.25 + hash(x, y, 80 + i) * 0.5), R, x * 13 + y * 7 + i);
    const h2 = hash(x, y, 90);
    if (h2 < 0.12) {   // a cherry
      c.fillStyle = '#e03131'; c.beginPath(); c.arc(X + R * 0.5, p.top + R * 0.42, R * 0.14, 0, TAU); c.fill();
      c.strokeStyle = '#7a1d1d'; c.lineWidth = Math.max(1, R * 0.03); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(X + R * 0.45, p.top + R * 0.37, R * 0.04, 0, TAU); c.fill();
    } else if (h2 < 0.2) {   // a gumdrop
      const col = ['#69db7c', '#ffd43b', '#9775fa', '#ff922b'][Math.floor(hash(x, y, 91) * 4)];
      c.fillStyle = col; c.beginPath(); c.ellipse(X + R * 0.5, p.top + R * 0.55, R * 0.18, R * 0.09, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(X + R * 0.5, p.top + R * 0.52, R * 0.18, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(80,30,50,0.6)'; c.lineWidth = Math.max(1, R * 0.03); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(X + R * 0.42, p.top + R * 0.4, R * 0.04, R * 0.04);
    }
    c.strokeStyle = '#a63d68'; c.lineWidth = Math.max(1.5, R * 0.05); c.lineJoin = 'round';
    wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {
    const cx = X + R * 0.5, cy = Y + R * 0.05, r = R * 0.42;
    softShadow(c, cx + R * 0.1, Y + R * 0.82, R * 0.42, R * 0.16, 0.8, '150,60,100');
    c.fillStyle = '#fffaf2'; c.strokeStyle = '#a0526f'; c.lineWidth = Math.max(1, R * 0.03);
    c.fillRect(cx - R * 0.05, cy, R * 0.1, R * 0.8); c.strokeRect(cx - R * 0.05, cy, R * 0.1, R * 0.8);
    const pal = [['#ff6fa3', '#fff'], ['#63e6be', '#fff'], ['#ffd43b', '#ff922b'], ['#b197fc', '#fff']][Math.floor(hash(x, y, 4) * 4)];
    c.fillStyle = pal[1]; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    c.strokeStyle = pal[0]; c.lineWidth = r * 0.28; c.lineCap = 'round';
    c.beginPath();
    for (let a = 0; a < 5.4 * Math.PI; a += 0.25) { const rr = r * 0.85 * (a / (5.4 * Math.PI)); c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    c.stroke(); c.lineCap = 'butt';
    c.strokeStyle = '#7a2e4f'; c.lineWidth = Math.max(1.5, R * 0.045); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.2, r * 0.12, -0.6, 0, TAU); c.fill();
  },
  rock(c, q, x, y, X, Y, R) {   // rock candy
    softShadow(c, X + R * 0.58, Y + R * 0.85, R * 0.48, R * 0.16, 0.8, '150,60,100');
    const cols = ['#d0bfff', '#a5d8ff', '#ffc9e3'];
    for (let i = 0; i < 3; i++) {
      const cx = X + R * (0.3 + i * 0.2), cy = Y + R * (0.55 - (i === 1 ? 0.18 : 0)), w = R * 0.24, h = R * (i === 1 ? 0.62 : 0.45);
      c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx + w, cy - h * 0.55); c.lineTo(cx + w * 0.8, cy + R * 0.25); c.lineTo(cx - w * 0.8, cy + R * 0.25); c.lineTo(cx - w, cy - h * 0.55); c.closePath();
      c.fillStyle = cols[i]; c.fill();
      c.strokeStyle = '#6b4a8a'; c.lineWidth = Math.max(1.2, R * 0.035); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx - w, cy - h * 0.55); c.lineTo(cx - w * 0.3, cy); c.closePath(); c.fill();
    }
  },
  spikes(c, q, x, y, X, Y, R) {   // candy corn
    for (let i = 0; i < 4; i++) {
      const cx = X + R * (0.27 + (i % 2) * 0.46), cy = Y + R * (0.3 + Math.floor(i / 2) * 0.42), w = R * 0.17, h = R * 0.34;
      const path = () => { c.beginPath(); c.moveTo(cx, cy - h * 0.6); c.lineTo(cx + w, cy + h * 0.4); c.lineTo(cx - w, cy + h * 0.4); c.closePath(); };
      path(); c.fillStyle = '#ffd43b'; c.fill();
      c.save(); c.clip();
      c.fillStyle = '#ff7f1f'; c.fillRect(cx - w, cy - h * 0.15, w * 2, h * 0.3);
      c.fillStyle = '#ffffff'; c.fillRect(cx - w, cy - h * 0.6, w * 2, h * 0.45);
      c.restore();
      path(); c.strokeStyle = '#5c2a1a'; c.lineWidth = Math.max(1.2, R * 0.035); c.stroke();
    }
  },
  planks(c, q, x, y, X, Y, R) {   // a wafer
    c.fillStyle = '#e9c27b'; c.fillRect(X, Y + R * 0.08, R, R * 0.84);
    c.strokeStyle = 'rgba(150,95,35,0.6)'; c.lineWidth = Math.max(1, R * 0.03);
    c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(X + i * R / 4, Y + R * 0.08); c.lineTo(X + i * R / 4, Y + R * 0.92); c.moveTo(X, Y + R * 0.08 + i * R * 0.21); c.lineTo(X + R, Y + R * 0.08 + i * R * 0.21); } c.stroke();
    c.strokeStyle = '#8a5a1c'; c.strokeRect(X, Y + R * 0.08, R, R * 0.84);
  },
  sunk(c, q, x, y, X, Y, R) {   // a chocolate block, sat in the soda
    c.fillStyle = '#7b4a2e'; rrect(c, X + R * 0.08, Y + R * 0.08, R * 0.84, R * 0.84, R * 0.1); c.fill();
    c.strokeStyle = '#4a2a17'; c.lineWidth = Math.max(1.2, R * 0.04); c.stroke();
    c.strokeStyle = 'rgba(255,220,190,0.25)'; c.beginPath(); c.moveTo(X + R * 0.5, Y + R * 0.12); c.lineTo(X + R * 0.5, Y + R * 0.88); c.moveTo(X + R * 0.12, Y + R * 0.5); c.lineTo(X + R * 0.88, Y + R * 0.5); c.stroke();
  },
  ripple(ctx, x, y, X, Y, k, t) {
    const ph = (t * 0.8 + hash(x, y, 1)) % 1;
    const cx = X + k * (0.25 + hash(x, y, 2) * 0.5), cy = Y + k * (0.25 + hash(x, y, 3) * 0.5);
    ctx.moveTo(cx + k * 0.08 + ph * k * 0.22, cy); ctx.arc(cx, cy, k * 0.08 + ph * k * 0.22, 0, TAU);
  },
  rippleStyle: 'rgba(255,255,255,0.55)',
  crate(ctx, X, Y, k) {   // a gift box
    boxShape(ctx, X, Y, k, '#ff8fb8', '#e0507f', '#7a2e4f');
    ctx.fillStyle = '#fff3bf';
    ctx.fillRect(X + k * 0.44, Y - LIFT * k + k * 0.06, k * 0.12, k * 0.94 + LIFT * k - k * 0.12);
    ctx.fillRect(X + k * 0.06, Y - LIFT * k + k * 0.38, k * 0.88, k * 0.12);
    ctx.strokeStyle = '#e8a33a'; ctx.lineWidth = Math.max(1, k * 0.03);
    ctx.beginPath(); ctx.ellipse(X + k * 0.38, Y - LIFT * k + k * 0.36, k * 0.12, k * 0.07, -0.5, 0, TAU); ctx.ellipse(X + k * 0.62, Y - LIFT * k + k * 0.36, k * 0.12, k * 0.07, 0.5, 0, TAU); ctx.stroke();
  },
  overlay(ctx, W, H, t, a) {
    vignette(ctx, W, H, '#ff8fbd', 0.2 * a);
    // a few sugar sparkles drifting
    ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
    for (let i = 0; i < 14; i++) {
      const u = (hash(i, 3, 1) + t * 0.02 * (0.5 + hash(i, 4, 1))) % 1, v = (hash(i, 5, 1) + t * 0.015) % 1;
      const r = 1.5 + 2 * Math.abs(Math.sin(t * 2 + i));
      const x = u * W, y = v * H;
      ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.5, y); ctx.closePath(); ctx.fill();
    }
  },
};

// ------------------------------------------------ WATERCOLOUR (the Meadow): washes on paper, wobbly ink
const PAPER = '#f5eedd';
const INK = '#3e3128';
function paper(c, x, y, X, Y, R) {
  c.fillStyle = PAPER; c.fillRect(X, Y, R, R);
  specks(c, X, Y, R, x * 7 + y * 131, 7, 'rgba(120,95,60,0.10)', Math.max(1, R * 0.025));
  specks(c, X, Y, R, x * 9 + y * 151, 4, 'rgba(255,255,255,0.5)', Math.max(1, R * 0.03));
}
// a wash: a soft blob, its pigment pooling darker at the rim (watercolour's edge darkening)
function wash(c, cx, cy, rx, ry, color, alpha, seed, edge = 0.9) {
  blob(c, cx, cy, rx, ry, seed);
  c.fillStyle = rgba(color, alpha); c.fill();
  c.strokeStyle = rgba(shade2(color), alpha * edge); c.lineWidth = Math.max(1, rx * 0.06); c.stroke();
}
const shade2 = (hex) => mixHex(hex, '#203020', 0.35);
const watercolour = {
  bg: '#efe6d2', ink: INK, shadow: '#5b5470', vignette: '#e8dcc0',
  floor(c, q, x, y, X, Y, R) { paper(c, x, y, X, Y, R); },
  floor2(c, q, x, y, X, Y, R) {   // overlapping washes, bleeding over each other's edges
    const greens = ['#9cc97f', '#b5d68a', '#86bb7a', '#a9cf95', '#c4d98a'];
    const col = greens[Math.floor(hash(x >> 1, y >> 1, 30) * greens.length)];
    wash(c, X + R * (0.2 + hash(x, y, 1) * 0.6), Y + R * (0.2 + hash(x, y, 5) * 0.6), R * 0.85, R * 0.7, col, 0.26, x * 97 + y * 13, 0.5);
    if (hash(x, y, 2) < 0.3) wash(c, X + R * hash(x, y, 3), Y + R * hash(x, y, 4), R * 0.5, R * 0.4, '#6fa86a', 0.18, x * 7 + y * 31);
    // a few grass strokes
    c.strokeStyle = 'rgba(70,110,60,0.35)'; c.lineWidth = Math.max(1, R * 0.025); c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 2; i++) { const gx = X + hash(x, y, 40 + i) * R, gy = Y + hash(x, y, 50 + i) * R; c.moveTo(gx, gy); c.quadraticCurveTo(gx + R * 0.03, gy - R * 0.08, gx + R * 0.07, gy - R * 0.13); }
    c.stroke(); c.lineCap = 'butt';
    if (hash(x, y, 60) < 0.14) {   // dabbed flowers
      const fcol = ['#e56b8a', '#f2c14e', '#a78bd4', '#ef8a5a'][Math.floor(hash(x, y, 61) * 4)];
      const fx = X + R * (0.25 + hash(x, y, 62) * 0.5), fy = Y + R * (0.25 + hash(x, y, 63) * 0.5);
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + hash(x, y, 64); wash(c, fx + Math.cos(a) * R * 0.07, fy + Math.sin(a) * R * 0.07, R * 0.065, R * 0.065, fcol, 0.65, x + y * 3 + i); }
      c.fillStyle = INK; c.beginPath(); c.arc(fx, fy, Math.max(1, R * 0.022), 0, TAU); c.fill();
    }
  },
  water(c, q, x, y, X, Y, R) { paper(c, x, y, X, Y, R); c.fillStyle = 'rgba(92,146,198,0.8)'; c.fillRect(X, Y, R, R); },
  water2(c, q, x, y, X, Y, R) {
    wash(c, X + R * (0.3 + hash(x, y, 1) * 0.4), Y + R * (0.3 + hash(x, y, 2) * 0.4), R * 0.75, R * 0.6, '#2f64a0', 0.22, x * 11 + y * 29);
    // paper showing through: light streaks
    if (hash(x, y, 6) < 0.6) {
      c.strokeStyle = 'rgba(245,238,221,0.5)'; c.lineWidth = Math.max(1, R * 0.05); c.lineCap = 'round';
      c.beginPath(); const sy = Y + R * (0.25 + hash(x, y, 7) * 0.5); wobble(c, X + R * 0.1, sy, X + R * (0.6 + hash(x, y, 8) * 0.5), sy + R * 0.03, R * 0.03, x * 3 + y); c.stroke();
      c.lineCap = 'butt';
    }
    // the wet edge: pooled pigment, then wobbly ink
    c.strokeStyle = 'rgba(30,70,120,0.5)'; c.lineWidth = Math.max(2, R * 0.12);
    holeEdges(c, q, X, Y, R, isWater);
    c.strokeStyle = rgba('#1f3a5a', 0.95); c.lineWidth = Math.max(1.4, R * 0.04); c.lineJoin = 'round';
    holeEdges(c, q, X, Y, R, isWater, R * 0.04, x * 131 + y);
  },
  pit(c, q, x, y, X, Y, R) {
    paper(c, x, y, X, Y, R);
    c.fillStyle = 'rgba(40,32,62,0.92)'; c.fillRect(X - R * 0.02, Y - R * 0.02, R * 1.04, R * 1.04);
    wash(c, X + R * 0.5, Y + R * 0.55, R * 0.45, R * 0.4, '#0d0a18', 0.5, x * 5 + y * 3);
    c.strokeStyle = INK; c.lineWidth = Math.max(1.5, R * 0.045); c.lineJoin = 'round';
    holeEdges(c, q, X, Y, R, (ch) => ch === 'o', R * 0.04, x * 17 + y);
  },
  wall(c, q, x, y, X, Y, R) {   // painted field stone, a little moss
    const p = wallParts(q, X, Y, R);
    c.fillStyle = PAPER; c.fillRect(X, p.top, R, p.bot - p.top);
    if (!p.so) {
      c.fillStyle = 'rgba(122,104,92,0.8)'; c.fillRect(X, p.mid, R, p.bot - p.mid);
      c.strokeStyle = 'rgba(62,49,40,0.5)'; c.lineWidth = Math.max(1, R * 0.025);
      c.beginPath(); const sx = X + R * (0.3 + hash(x, y, 3) * 0.4); wobble(c, sx, p.mid, sx + R * 0.02, p.bot, R * 0.02, x + y * 5); c.stroke();
    }
    c.fillStyle = 'rgba(178,164,148,0.75)'; c.fillRect(X, p.top, R, p.mid - p.top);
    wash(c, X + R * (0.35 + hash(x, y, 1) * 0.3), p.top + R * 0.45, R * 0.45, R * 0.38, '#9e8f80', 0.35, x * 3 + y * 101);
    if (hash(x, y, 2) < 0.4) wash(c, X + R * hash(x, y, 4), p.top + R * hash(x, y, 5) * 0.8, R * 0.25, R * 0.18, '#7fae6a', 0.4, x * 7 + y);
    c.strokeStyle = INK; c.lineWidth = Math.max(1.4, R * 0.045); c.lineJoin = 'round'; c.lineCap = 'round';
    wallEdges(c, p, X, R, R * 0.035, x * 211 + y * 17);
    c.lineCap = 'butt';
  },
  tree(c, q, x, y, X, Y, R) {
    softShadow(c, X + R * 0.6, Y + R * 0.8, R * 0.5, R * 0.18, 0.8, '70,70,100');
    c.strokeStyle = 'rgba(110,75,45,0.9)'; c.lineWidth = Math.max(2, R * 0.1); c.lineCap = 'round';
    c.beginPath(); c.moveTo(X + R * 0.5, Y + R * 0.78); c.lineTo(X + R * 0.52, Y + R * 0.35); c.stroke(); c.lineCap = 'butt';
    wash(c, X + R * 0.5, Y + R * 0.15, R * 0.5, R * 0.45, '#5f9a52', 0.75, x * 3 + y);
    wash(c, X + R * 0.4, Y + R * 0.05, R * 0.3, R * 0.26, '#8cc06a', 0.6, x * 5 + y);
    c.strokeStyle = INK; c.lineWidth = Math.max(1.2, R * 0.035);
    blob(c, X + R * 0.5, Y + R * 0.15, R * 0.5, R * 0.45, x * 3 + y); c.stroke();
  },
  rock(c, q, x, y, X, Y, R) {
    softShadow(c, X + R * 0.58, Y + R * 0.85, R * 0.5, R * 0.17, 0.8, '70,70,100');
    wash(c, X + R * 0.5, Y + R * 0.45, R * 0.44, R * 0.4, '#9a9a9a', 0.8, x * 3 + y * 7);
    c.strokeStyle = INK; c.lineWidth = Math.max(1.3, R * 0.04);
    blob(c, X + R * 0.5, Y + R * 0.45, R * 0.44, R * 0.4, x * 3 + y * 7, 0.15, 7); c.stroke();
    c.lineWidth = Math.max(1, R * 0.02); hatch(c, X + R * 0.45, Y + R * 0.35, R * 0.4, R * 0.4, R * 0.08, 1);
  },
  spikes(c, q, x, y, X, Y, R) {
    for (let i = 0; i < 3; i++) {
      const cx = X + R * (0.2 + i * 0.3), cy = Y + R * 0.7;
      c.beginPath(); wobble(c, cx - R * 0.13, cy, cx, cy - R * 0.5, R * 0.015, x + i); wobble(c, cx, cy - R * 0.5, cx + R * 0.13, cy, R * 0.015, y + i, false); c.closePath();
      c.fillStyle = 'rgba(205,60,60,0.75)'; c.fill(); c.strokeStyle = INK; c.lineWidth = Math.max(1.2, R * 0.04); c.stroke();
    }
  },
  planks(c, q, x, y, X, Y, R) {
    c.fillStyle = 'rgba(165,115,70,0.8)'; c.fillRect(X, Y + R * 0.08, R, R * 0.84);
    c.strokeStyle = INK; c.lineWidth = Math.max(1, R * 0.03);
    c.beginPath(); for (let i = 0; i <= 3; i++) wobble(c, X + i * R / 3, Y + R * 0.08, X + i * R / 3, Y + R * 0.92, R * 0.02, x * 5 + i); c.stroke();
  },
  sunk(c, q, x, y, X, Y, R) {
    c.fillStyle = 'rgba(160,110,60,0.85)'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8);
    c.strokeStyle = INK; c.lineWidth = Math.max(1.2, R * 0.04);
    c.beginPath(); wobble(c, X + R * 0.1, Y + R * 0.1, X + R * 0.9, Y + R * 0.9, R * 0.02, x); wobble(c, X + R * 0.9, Y + R * 0.1, X + R * 0.1, Y + R * 0.9, R * 0.02, y); c.stroke();
    c.strokeRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8);
  },
  ripple(ctx, x, y, X, Y, k, t) {
    const ph = (t * 0.35 + hash(x, y, 1)) % 1;
    const cx = X + k * (0.2 + hash(x, y, 2) * 0.4) + ph * k * 0.3, cy = Y + k * (0.3 + hash(x, y, 3) * 0.4);
    ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + k * 0.1, cy - k * 0.07, cx + k * 0.2, cy); ctx.quadraticCurveTo(cx + k * 0.3, cy + k * 0.07, cx + k * 0.38, cy);
  },
  rippleStyle: 'rgba(31,58,90,0.55)',
  crate(ctx, X, Y, k) {   // painted: a wash that misses the edges, wobbly ink
    softShadow(ctx, X + k * 0.6, Y + k * 0.98, k * 0.55, k * 0.16, 0.7, '70,70,100');
    const y0 = Y - LIFT * k + k * 0.04;
    ctx.fillStyle = 'rgba(176,120,70,0.85)'; ctx.fillRect(X + k * 0.07, y0 + k * 0.03, k * 0.88, k * 0.86);
    ctx.fillStyle = 'rgba(120,78,44,0.9)'; ctx.fillRect(X + k * 0.05, y0 + k * 0.9, k * 0.9, LIFT * k - k * 0.04);
    ctx.fillStyle = 'rgba(245,238,221,0.35)'; ctx.fillRect(X + k * 0.15, y0 + k * 0.1, k * 0.3, k * 0.12);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.4, k * 0.04); ctx.lineJoin = 'round';
    ctx.beginPath();
    wobble(ctx, X + k * 0.04, y0, X + k * 0.96, y0, k * 0.02, 1); wobble(ctx, X + k * 0.96, y0, X + k * 0.96, y0 + k * 0.88 + LIFT * k, k * 0.02, 2, false);
    wobble(ctx, X + k * 0.96, y0 + k * 0.88 + LIFT * k, X + k * 0.04, y0 + k * 0.88 + LIFT * k, k * 0.02, 3, false); wobble(ctx, X + k * 0.04, y0 + k * 0.88 + LIFT * k, X + k * 0.04, y0, k * 0.02, 4, false);
    wobble(ctx, X + k * 0.04, y0 + k * 0.9, X + k * 0.96, y0 + k * 0.9, k * 0.02, 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62,49,40,0.6)'; ctx.lineWidth = Math.max(1, k * 0.03);
    ctx.beginPath(); ctx.moveTo(X + k * 0.12, Y - LIFT * k + k * 0.12); ctx.lineTo(X + k * 0.88, Y - LIFT * k + k * 0.88); ctx.moveTo(X + k * 0.88, Y - LIFT * k + k * 0.12); ctx.lineTo(X + k * 0.12, Y - LIFT * k + k * 0.88); ctx.stroke();
  },
  overlay(ctx, W, H, t, a) {
    // the unpainted margin: paper colour creeping in at the screen's edges
    vignette(ctx, W, H, '#efe3c8', 0.8 * a, 0.62);
  },
};

// ------------------------------------------------ BLUEPRINT (the Workshop): drafting lines on blue
const BP = '#1d4f8c', BP_LINE = 'rgba(255,255,255,0.92)';
function bpPaper(c, x, y, X, Y, R) {
  c.fillStyle = BP; c.fillRect(X, Y, R, R);
  if (hash(x >> 2, y >> 2, 3) < 0.5) { c.fillStyle = 'rgba(255,255,255,0.025)'; c.fillRect(X, Y, R, R); }
  c.strokeStyle = 'rgba(190,220,255,0.10)'; c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < 4; i++) { c.moveTo(X + i * R / 4 + 0.5, Y); c.lineTo(X + i * R / 4 + 0.5, Y + R); c.moveTo(X, Y + i * R / 4 + 0.5); c.lineTo(X + R, Y + i * R / 4 + 0.5); }
  c.stroke();
  c.strokeStyle = x % 4 === 0 || y % 4 === 0 ? 'rgba(200,228,255,0.26)' : 'rgba(200,228,255,0.17)';
  c.beginPath(); c.moveTo(X + 0.5, Y); c.lineTo(X + 0.5, Y + R); c.moveTo(X, Y + 0.5); c.lineTo(X + R, Y + 0.5); c.stroke();
}
const blueprint = {
  bg: '#163f73', ink: '#ffffff', shadow: '#061a36', vignette: '#0a2650',
  floor(c, q, x, y, X, Y, R) {
    bpPaper(c, x, y, X, Y, R);
    if (x % 4 === 0 && y % 4 === 0) {   // centre marks
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(X - R * 0.12, Y); c.lineTo(X + R * 0.12, Y); c.moveTo(X, Y - R * 0.12); c.lineTo(X, Y + R * 0.12); c.stroke();
    }
  },
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#0f7d9c'; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1; hatch(c, X, Y, R, R, R / 6, -1);
    // the drawing's water edge: a double line
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(1.5, R * 0.045);
    holeEdges(c, q, X, Y, R, isWater);
    c.lineWidth = 1; c.save(); c.translate(R * 0.08, R * 0.08); holeEdges(c, q, X, Y, R, isWater); c.restore();
  },
  pit(c, q, x, y, X, Y, R) {   // an opening: dark, crossed
    c.fillStyle = '#06142b'; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(X, Y); c.lineTo(X + R, Y + R); c.moveTo(X + R, Y); c.lineTo(X, Y + R); c.stroke();
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(1.5, R * 0.04); c.setLineDash([R * 0.14, R * 0.08]);
    holeEdges(c, q, X, Y, R, (ch) => ch === 'o');
    c.setLineDash([]);
  },
  wall(c, q, x, y, X, Y, R) {
    const p = wallParts(q, X, Y, R);
    if (!p.so) {
      c.fillStyle = '#163f73'; c.fillRect(X, p.mid, R, p.bot - p.mid);
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1; hatch(c, X, p.mid, R, p.bot - p.mid, R * 0.08, -1);
    }
    c.fillStyle = '#3f7fcc'; c.fillRect(X, p.top, R, p.mid - p.top);
    c.strokeStyle = 'rgba(255,255,255,0.38)'; c.lineWidth = Math.max(1, R * 0.02); hatch(c, X, p.top, R, p.mid - p.top, R * 0.125, 1);
    // dimension marks along long runs: a line with end ticks and a figure
    if (!p.n && x % 6 === 2 && isW(q(1, 0)) && isW(q(2, 0))) {
      const yy = p.top + R * 0.35;
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.fillStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(X + R * 0.1, yy); c.lineTo(X + R * 2.9, yy);
      for (const ex of [X + R * 0.1, X + R * 2.9]) { c.moveTo(ex - R * 0.06, yy + R * 0.06); c.lineTo(ex + R * 0.06, yy - R * 0.06); c.moveTo(ex, yy - R * 0.1); c.lineTo(ex, yy + R * 0.1); }
      c.stroke();
      c.font = `${Math.max(7, Math.round(R * 0.2))}px monospace`; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText(`${(1 + Math.floor(hash(x, y, 1) * 9)) * 250}`, X + R * 1.5, yy - 1);
    }
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(2, R * 0.05); c.lineJoin = 'miter';
    wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {   // the plan symbol: scalloped crown, centre cross
    const cx = X + R * 0.5, cy = Y + R * 0.35, r = R * 0.44;
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(1.3, R * 0.035);
    c.beginPath();
    for (let i = 0; i < 9; i++) { const a0 = (i / 9) * TAU, a1 = ((i + 1) / 9) * TAU, am = (a0 + a1) / 2; c.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r); c.quadraticCurveTo(cx + Math.cos(am) * r * 1.3, cy + Math.sin(am) * r * 1.3, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); }
    c.stroke();
    c.lineWidth = 1; c.beginPath(); c.moveTo(cx - r * 0.4, cy); c.lineTo(cx + r * 0.4, cy); c.moveTo(cx, cy - r * 0.4); c.lineTo(cx, cy + r * 0.4); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.12, 0, TAU); c.stroke();
  },
  rock(c, q, x, y, X, Y, R) {
    const pts = [[0.15, 0.55], [0.3, 0.2], [0.62, 0.12], [0.88, 0.4], [0.82, 0.78], [0.4, 0.86]].map(([a, b], i) => [X + R * (a + (hash(x, y, i) - 0.5) * 0.08), Y + R * (b + (hash(x, y, i + 9) - 0.5) * 0.08) - R * 0.08]);
    const poly = (dy) => { c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b + dy) : c.moveTo(a, b + dy))); c.closePath(); };
    poly(R * 0.12); c.fillStyle = '#123a6b'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1; c.save(); c.clip(); hatch(c, X, Y, R, R * 1.1, R * 0.08, -1); c.restore();
    poly(0); c.fillStyle = '#2b66ab'; c.fill();
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(1.4, R * 0.04); c.stroke();
    poly(R * 0.12); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.moveTo(pts[1][0], pts[1][1]); c.lineTo(X + R * 0.55, Y + R * 0.45); c.lineTo(pts[3][0], pts[3][1]); c.moveTo(X + R * 0.55, Y + R * 0.45); c.lineTo(pts[5][0], pts[5][1]); c.stroke();
  },
  spikes(c, q, x, y, X, Y, R) {   // a red-pencil hazard
    c.fillStyle = 'rgba(255,107,107,0.22)'; c.fillRect(X + R * 0.05, Y + R * 0.05, R * 0.9, R * 0.9);
    c.strokeStyle = '#ff8787'; c.lineWidth = Math.max(1.5, R * 0.05);
    c.beginPath(); for (let i = 0; i < 4; i++) { const x0 = X + R * (0.1 + i * 0.2); c.moveTo(x0, Y + R * 0.75); c.lineTo(x0 + R * 0.1, Y + R * 0.25); c.lineTo(x0 + R * 0.2, Y + R * 0.75); } c.stroke();
  },
  planks(c, q, x, y, X, Y, R) {
    c.fillStyle = '#2b66ab'; c.fillRect(X, Y + R * 0.1, R, R * 0.8);
    c.strokeStyle = BP_LINE; c.lineWidth = 1;
    c.beginPath(); for (let i = 0; i <= 4; i++) { c.moveTo(X + i * R / 4, Y + R * 0.1); c.lineTo(X + i * R / 4, Y + R * 0.9); } c.moveTo(X, Y + R * 0.1); c.lineTo(X + R, Y + R * 0.1); c.moveTo(X, Y + R * 0.9); c.lineTo(X + R, Y + R * 0.9); c.stroke();
  },
  sunk(c, q, x, y, X, Y, R) {
    c.fillStyle = '#2b66ab'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8);
    c.strokeStyle = BP_LINE; c.lineWidth = Math.max(1.2, R * 0.035);
    c.strokeRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8);
    c.beginPath(); c.moveTo(X + R * 0.1, Y + R * 0.1); c.lineTo(X + R * 0.9, Y + R * 0.9); c.moveTo(X + R * 0.9, Y + R * 0.1); c.lineTo(X + R * 0.1, Y + R * 0.9); c.stroke();
  },
  ripple(ctx, x, y, X, Y, k, t) {   // the water symbol, drifting
    const off = ((t * 0.4 + (y % 2) * 0.5) % 1) * k * 0.5;
    for (const yy of [0.3, 0.7]) {
      const cy = Y + k * yy;
      ctx.moveTo(X, cy);
      for (let i = 0; i <= 8; i++) { const xx = i / 8; ctx.lineTo(X + xx * k, cy + Math.sin((xx * k + off) / k * TAU * 2) * k * 0.04); }
    }
  },
  rippleStyle: 'rgba(255,255,255,0.45)',
  crate(ctx, X, Y, k) {
    boxShape(ctx, X, Y, k, '#2b66ab', '#123a6b', '#ffffff');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, k * 0.03);
    const y0 = Y - LIFT * k;
    ctx.strokeRect(X + k * 0.12, y0 + k * 0.12, k * 0.76, k * 0.76);
    ctx.beginPath(); ctx.moveTo(X + k * 0.12, y0 + k * 0.12); ctx.lineTo(X + k * 0.88, y0 + k * 0.88); ctx.moveTo(X + k * 0.88, y0 + k * 0.12); ctx.lineTo(X + k * 0.12, y0 + k * 0.88); ctx.stroke();
  },
  overlay(ctx, W, H, t, a) { vignette(ctx, W, H, '#061a36', 0.55 * a); },
};

// ------------------------------------------------ PAPERCUT (the Night Wood): layered cut paper
function deckle(c, X, Y, w, h, seed, j) {
  c.beginPath();
  const n = 5;
  for (let i = 0; i <= n; i++) c.lineTo(X + (w * i) / n, Y + (hash(seed, i, 1) - 0.5) * j);
  for (let i = 0; i <= n; i++) c.lineTo(X + w + (hash(seed, i, 2) - 0.5) * j, Y + (h * i) / n);
  for (let i = n; i >= 0; i--) c.lineTo(X + (w * i) / n, Y + h + (hash(seed, i, 3) - 0.5) * j);
  for (let i = n; i >= 0; i--) c.lineTo(X + (hash(seed, i, 4) - 0.5) * j, Y + (h * i) / n);
  c.closePath();
}
const papercut = {
  bg: '#1b1d45', ink: '#0b0c22', shadow: '#05050f', vignette: '#07081c',
  floor(c, q, x, y, X, Y, R) {
    c.fillStyle = '#2c3068'; c.fillRect(X, Y, R, R);
    if (hash(x, y, 1) < 0.35) {   // a scrap of lighter paper laid on top, with its shadow
      const w = R * (0.4 + hash(x, y, 2) * 0.4), h = R * (0.3 + hash(x, y, 3) * 0.3), ox = X + hash(x, y, 4) * (R - w), oy = Y + hash(x, y, 5) * (R - h);
      deckle(c, ox + R * 0.04, oy + R * 0.05, w, h, x * 7 + y, R * 0.06); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      deckle(c, ox, oy, w, h, x * 7 + y, R * 0.06); c.fillStyle = '#353a78'; c.fill();
    }
  },
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#1f5f9e'; c.fillRect(X, Y, R, R);
    for (let i = 0; i < 2; i++) { deckle(c, X + R * 0.05, Y + R * (0.2 + i * 0.4), R * 0.9, R * 0.14, x * 5 + y + i, R * 0.08); c.fillStyle = i ? '#3c86c9' : '#2d75b8'; c.fill(); }
    c.strokeStyle = '#9fd0ff'; c.lineWidth = Math.max(1.5, R * 0.05); holeEdges(c, q, X, Y, R, isWater);
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#04040c'; c.fillRect(X, Y, R, R);
    c.strokeStyle = '#4a4f9a'; c.lineWidth = Math.max(1.5, R * 0.05); holeEdges(c, q, X, Y, R, (ch) => ch === 'o', R * 0.05, x + y * 3);
  },
  wall(c, q, x, y, X, Y, R) {
    const p = wallParts(q, X, Y, R);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X + R * 0.08, p.top + R * 0.1, R, p.bot - p.top);
    if (!p.so) { c.fillStyle = '#15163a'; c.fillRect(X, p.mid, R, p.bot - p.mid); }
    c.fillStyle = '#4b4f99'; c.fillRect(X, p.top, R, p.mid - p.top);
    deckle(c, X + R * 0.12, p.top + R * 0.15, R * 0.76, R * 0.6, x * 3 + y, R * 0.05); c.fillStyle = '#5a60b0'; c.fill();
    c.strokeStyle = '#0b0c22'; c.lineWidth = Math.max(1.5, R * 0.05); wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {
    softShadow(c, X + R * 0.6, Y + R * 0.85, R * 0.45, R * 0.15, 1, '0,0,0');
    const cols = ['#173d4a', '#215566', '#2d6e7f'];
    for (let i = 0; i < 3; i++) {
      const w = R * (0.5 - i * 0.12), cy = Y + R * (0.75 - i * 0.32);
      c.beginPath(); c.moveTo(X + R * 0.5, cy - R * 0.45); c.lineTo(X + R * 0.5 + w, cy); c.lineTo(X + R * 0.5 - w, cy); c.closePath();
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.save(); c.translate(R * 0.04, R * 0.05); c.fill(); c.restore();
      c.fillStyle = cols[i]; c.fill();
    }
  },
  rock(c, q, x, y, X, Y, R) {
    blob(c, X + R * 0.55, Y + R * 0.55, R * 0.42, R * 0.34, x + y, 0.18, 6); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
    blob(c, X + R * 0.5, Y + R * 0.45, R * 0.42, R * 0.34, x + y, 0.18, 6); c.fillStyle = '#6a6fa8'; c.fill();
    blob(c, X + R * 0.45, Y + R * 0.38, R * 0.22, R * 0.16, x + y + 1, 0.18, 6); c.fillStyle = '#868bc4'; c.fill();
  },
  spikes(c, q, x, y, X, Y, R) { spikeRow(c, X, Y, R, '#d9dcf5', '#0b0c22'); },
  planks(c, q, x, y, X, Y, R) { plankRow(c, X, Y, R, '#7a5c48', '#2a1c14'); },
  sunk(c, q, x, y, X, Y, R) { deckle(c, X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8, x + y, R * 0.05); c.fillStyle = '#7a5c48'; c.fill(); },
  ripple: rippleDash, rippleStyle: 'rgba(200,230,255,0.45)',
  crate(ctx, X, Y, k) { boxShape(ctx, X, Y, k, '#8a6a54', '#4e3a2c', '#0b0c22'); },
  overlay(ctx, W, H, t, a) { vignette(ctx, W, H, '#03030c', 0.6 * a); },
};

// ------------------------------------------------ SEPIA (the Attic): an old photograph
const sepia = {
  bg: '#4a3826', ink: '#2a1d12', shadow: '#2a1d12', vignette: '#1e140b',
  floor(c, q, x, y, X, Y, R) {   // floorboards
    const tone = ['#c2a37a', '#b8976d', '#c9ab84'][(x + Math.floor(y / 1) * 3) % 3];
    c.fillStyle = tone; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(60,40,20,0.45)'; c.lineWidth = Math.max(1, R * 0.03);
    c.beginPath(); c.moveTo(X, Y + R * 0.5); c.lineTo(X + R, Y + R * 0.5); c.moveTo(X, Y + 0.5); c.lineTo(X + R, Y + 0.5);
    const j = ((x * 3 + y) % 4) / 4; c.moveTo(X + j * R, Y); c.lineTo(X + j * R, Y + R * 0.5); c.stroke();
    c.strokeStyle = 'rgba(80,55,30,0.18)'; c.beginPath(); c.moveTo(X, Y + R * 0.25); c.quadraticCurveTo(X + R * 0.5, Y + R * 0.2, X + R, Y + R * 0.27); c.stroke();
    specks(c, X, Y, R, x * 3 + y * 5, 6, 'rgba(40,25,10,0.18)', Math.max(1, R * 0.025));
  },
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#5f6b6a'; c.fillRect(X, Y, R, R);
    c.fillStyle = 'rgba(220,210,180,0.15)'; c.fillRect(X, Y + R * 0.3, R, R * 0.1);
    c.strokeStyle = '#2a1d12'; c.lineWidth = Math.max(1.5, R * 0.06); holeEdges(c, q, X, Y, R, isWater);
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#140d07'; c.fillRect(X, Y, R, R);
    c.strokeStyle = '#6e5236'; c.lineWidth = Math.max(1.5, R * 0.05); holeEdges(c, q, X, Y, R, (ch) => ch === 'o');
  },
  wall(c, q, x, y, X, Y, R) {
    const p = wallParts(q, X, Y, R);
    if (!p.so) { c.fillStyle = '#4e3824'; c.fillRect(X, p.mid, R, p.bot - p.mid); }
    c.fillStyle = '#86674a'; c.fillRect(X, p.top, R, p.mid - p.top);
    c.strokeStyle = 'rgba(40,25,10,0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X, p.top + R * 0.33); c.lineTo(X + R, p.top + R * 0.33); c.moveTo(X, p.top + R * 0.66); c.lineTo(X + R, p.top + R * 0.66); c.stroke();
    c.strokeStyle = '#2a1d12'; c.lineWidth = Math.max(1.4, R * 0.045); wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {   // a potted plant
    softShadow(c, X + R * 0.55, Y + R * 0.85, R * 0.4, R * 0.14, 1, '30,20,10');
    c.fillStyle = '#7a4f2e'; c.fillRect(X + R * 0.32, Y + R * 0.5, R * 0.36, R * 0.35);
    blob(c, X + R * 0.5, Y + R * 0.25, R * 0.42, R * 0.38, x + y * 3); c.fillStyle = '#5d5236'; c.fill();
    c.strokeStyle = '#2a1d12'; c.lineWidth = Math.max(1.2, R * 0.04); c.stroke();
  },
  rock(c, q, x, y, X, Y, R) { stackBox(c, X, Y, R, '#9a7b58', '#5e452e', '#2a1d12'); },
  spikes(c, q, x, y, X, Y, R) { spikeRow(c, X, Y, R, '#d8c8a8', '#2a1d12'); },
  planks(c, q, x, y, X, Y, R) { plankRow(c, X, Y, R, '#a07e58', '#2a1d12'); },
  sunk(c, q, x, y, X, Y, R) { c.fillStyle = '#8a6a48'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8); },
  ripple: rippleDash, rippleStyle: 'rgba(230,220,190,0.35)',
  crate(ctx, X, Y, k) { boxShape(ctx, X, Y, k, '#a5835c', '#6b4f33', '#2a1d12'); },
  overlay(ctx, W, H, t, a) {
    ctx.fillStyle = `rgba(112,78,40,${0.12 * a})`; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, '#1e140b', 0.75 * a, 0.45);
    grainPass(ctx, W, H, Math.floor(t * 12), 0.35 * a);
    if (hash(Math.floor(t * 8), 1, 1) < 0.3) {   // a scratch on the film
      ctx.strokeStyle = `rgba(255,245,220,${0.25 * a})`; ctx.lineWidth = 1;
      const x = hash(Math.floor(t * 8), 2, 1) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, H); ctx.stroke();
    }
  },
};

// ------------------------------------------------ CEL (the Rooftops): bold outlines, flat shade, halftone
function halftone(c, X, Y, w, h, R, color, fade) {
  c.fillStyle = color;
  const g = R / 6;
  for (let yy = 0; yy < h; yy += g) for (let xx = (Math.round(yy / g) % 2) * g / 2; xx < w; xx += g) {
    const r = g * 0.42 * (fade ? 1 - yy / h : 1);
    if (r > 0.4) { c.beginPath(); c.arc(X + xx, Y + yy, r, 0, TAU); c.fill(); }
  }
}
const CEL_INK = '#111111';
const cel = {
  bg: '#8fd3ff', ink: CEL_INK, shadow: '#1d3557', vignette: '#2b6cb0',
  floor(c, q, x, y, X, Y, R) {   // roof slates, flat
    c.fillStyle = (x + y) % 2 ? '#ffe9c7' : '#fff1d9'; c.fillRect(X, Y, R, R);
    if (RAISED.includes(q(0, -1))) halftone(c, X, Y, R, R * 0.5, R, 'rgba(29,53,87,0.35)', true);
  },
  shadowless: true,
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#2f8cff'; c.fillRect(X, Y, R, R);
    c.fillStyle = '#7cc0ff'; c.fillRect(X + R * 0.1, Y + R * (0.2 + hash(x, y, 1) * 0.4), R * 0.5, R * 0.08);
    c.strokeStyle = CEL_INK; c.lineWidth = Math.max(2, R * 0.08); holeEdges(c, q, X, Y, R, isWater);
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#0a0a14'; c.fillRect(X, Y, R, R);
    halftone(c, X, Y, R, R, R, 'rgba(90,110,170,0.35)', false);
    c.strokeStyle = CEL_INK; c.lineWidth = Math.max(2, R * 0.08); holeEdges(c, q, X, Y, R, (ch) => ch === 'o');
  },
  wall(c, q, x, y, X, Y, R) {
    const p = wallParts(q, X, Y, R);
    if (!p.so) { c.fillStyle = '#c4553a'; c.fillRect(X, p.mid, R, p.bot - p.mid); halftone(c, X, p.mid, R, p.bot - p.mid, R, 'rgba(0,0,0,0.25)', false); }
    c.fillStyle = '#ff8c69'; c.fillRect(X, p.top, R, p.mid - p.top);
    c.fillStyle = '#ffb59c'; if (!p.n) c.fillRect(X, p.top, R, R * 0.14);
    c.strokeStyle = CEL_INK; c.lineWidth = Math.max(2, R * 0.08); c.lineJoin = 'round'; wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {
    c.fillStyle = 'rgba(29,53,87,0.35)'; c.beginPath(); c.ellipse(X + R * 0.6, Y + R * 0.82, R * 0.42, R * 0.14, 0, 0, TAU); c.fill();
    c.fillStyle = '#7a4a2a'; c.fillRect(X + R * 0.44, Y + R * 0.4, R * 0.12, R * 0.42);
    c.beginPath(); c.arc(X + R * 0.5, Y + R * 0.2, R * 0.42, 0, TAU); c.fillStyle = '#4caf50'; c.fill();
    c.save(); c.clip(); c.fillStyle = '#2e7d32'; c.beginPath(); c.arc(X + R * 0.7, Y + R * 0.4, R * 0.42, 0, TAU); c.fill(); c.restore();
    c.strokeStyle = CEL_INK; c.lineWidth = Math.max(2, R * 0.08); c.beginPath(); c.arc(X + R * 0.5, Y + R * 0.2, R * 0.42, 0, TAU); c.stroke();
  },
  rock(c, q, x, y, X, Y, R) { stackBox(c, X, Y, R, '#b0bec5', '#78909c', CEL_INK, R * 0.08); },
  spikes(c, q, x, y, X, Y, R) { spikeRow(c, X, Y, R, '#ffffff', CEL_INK, R * 0.07); },
  planks(c, q, x, y, X, Y, R) { plankRow(c, X, Y, R, '#d7a86e', CEL_INK, R * 0.06); },
  sunk(c, q, x, y, X, Y, R) { c.fillStyle = '#d7a86e'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8); c.strokeStyle = CEL_INK; c.lineWidth = R * 0.07; c.strokeRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8); },
  ripple: rippleDash, rippleStyle: 'rgba(255,255,255,0.8)',
  crate(ctx, X, Y, k) { boxShape(ctx, X, Y, k, '#ffcc66', '#d9963a', CEL_INK, 0.07); },
  overlay(ctx, W, H, t, a) { vignette(ctx, W, H, '#1d3557', 0.25 * a); },
};

// ------------------------------------------------ BRASS (Clock Town): engraved metal plates
const brass = {
  bg: '#2b2014', ink: '#2a1a08', shadow: '#1a1006', vignette: '#120a03',
  floor(c, q, x, y, X, Y, R) {
    const g = c.createLinearGradient(X, Y, X + R, Y + R);
    g.addColorStop(0, '#d6b05a'); g.addColorStop(1, '#b38a3a');
    c.fillStyle = g; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(70,45,10,0.18)'; c.lineWidth = 1; hatch(c, X, Y, R, R, R / 7, 1);
    c.strokeStyle = 'rgba(70,45,10,0.5)'; c.strokeRect(X + R * 0.04, Y + R * 0.04, R * 0.92, R * 0.92);
    c.fillStyle = '#8a6420';
    for (const [a, b] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { c.beginPath(); c.arc(X + R * a, Y + R * b, R * 0.035, 0, TAU); c.fill(); }
  },
  water(c, q, x, y, X, Y, R) {   // oil-dark coolant
    c.fillStyle = '#1f5f63'; c.fillRect(X, Y, R, R);
    c.strokeStyle = 'rgba(160,230,220,0.15)'; c.lineWidth = 1; hatch(c, X, Y, R, R, R / 5, -1);
    c.strokeStyle = '#e0b354'; c.lineWidth = Math.max(2, R * 0.07); holeEdges(c, q, X, Y, R, isWater);
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#0d0803'; c.fillRect(X, Y, R, R);
    c.strokeStyle = '#8a6420'; c.lineWidth = Math.max(2, R * 0.08); holeEdges(c, q, X, Y, R, (ch) => ch === 'o');
  },
  wall(c, q, x, y, X, Y, R) {
    const p = wallParts(q, X, Y, R);
    if (!p.so) { c.fillStyle = '#6e3518'; c.fillRect(X, p.mid, R, p.bot - p.mid); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; hatch(c, X, p.mid, R, p.bot - p.mid, R * 0.07, -1); }
    c.fillStyle = '#b8673a'; c.fillRect(X, p.top, R, p.mid - p.top);
    c.strokeStyle = 'rgba(255,220,170,0.35)'; c.lineWidth = 1; c.strokeRect(X + R * 0.12, p.top + R * 0.12, R * 0.76, R * 0.76);
    c.strokeStyle = 'rgba(60,20,5,0.4)'; c.strokeRect(X + R * 0.18, p.top + R * 0.18, R * 0.64, R * 0.64);
    c.strokeStyle = '#2a1a08'; c.lineWidth = Math.max(1.5, R * 0.05); wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {   // a standing cog
    softShadow(c, X + R * 0.6, Y + R * 0.85, R * 0.45, R * 0.15, 1, '20,10,0');
    const cx = X + R * 0.5, cy = Y + R * 0.3, r = R * 0.42;
    c.beginPath();
    for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, rr = i % 2 ? r : r * 0.8; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = '#c99a3e'; c.fill(); c.strokeStyle = '#2a1a08'; c.lineWidth = Math.max(1.4, R * 0.04); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.3, 0, TAU); c.fillStyle = '#5a3d12'; c.fill(); c.stroke();
  },
  rock(c, q, x, y, X, Y, R) { stackBox(c, X, Y, R, '#8d8d8d', '#5a5a5a', '#2a1a08'); },
  spikes(c, q, x, y, X, Y, R) { spikeRow(c, X, Y, R, '#e8e0d0', '#2a1a08'); },
  planks(c, q, x, y, X, Y, R) { plankRow(c, X, Y, R, '#9a6a3a', '#2a1a08'); },
  sunk(c, q, x, y, X, Y, R) { c.fillStyle = '#9a6a3a'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8); },
  ripple: rippleDash, rippleStyle: 'rgba(200,240,230,0.35)',
  crate(ctx, X, Y, k) { boxShape(ctx, X, Y, k, '#a87a44', '#6e4a22', '#2a1a08'); },
  overlay(ctx, W, H, t, a) { vignette(ctx, W, H, '#120a03', 0.6 * a); },
};

// ------------------------------------------------ COSY (Home): felt and knit
function stitches(c, x0, y0, x1, y1, R, color) {
  c.strokeStyle = color; c.lineWidth = Math.max(1, R * 0.03); c.setLineDash([R * 0.08, R * 0.06]);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]);
}
const cosy = {
  bg: '#5a3a35', ink: '#3b2320', shadow: '#3b2320', vignette: '#2a1512',
  floor(c, q, x, y, X, Y, R) {   // felt
    c.fillStyle = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? '#e8b7a3' : '#eec3ae'; c.fillRect(X, Y, R, R);
    specks(c, X, Y, R, x * 13 + y * 3, 10, 'rgba(120,60,40,0.12)', Math.max(1, R * 0.02));
    if (x % 2 === 0) stitches(c, X + R * 0.06, Y, X + R * 0.06, Y + R, R, 'rgba(255,255,255,0.45)');
    if (y % 2 === 0) stitches(c, X, Y + R * 0.06, X + R, Y + R * 0.06, R, 'rgba(255,255,255,0.45)');
  },
  water(c, q, x, y, X, Y, R) {
    c.fillStyle = '#5b95cf'; c.fillRect(X, Y, R, R);
    stitches(c, X, Y + R * 0.5, X + R, Y + R * 0.5, R, 'rgba(255,255,255,0.55)');
    c.strokeStyle = '#2d5a8a'; c.lineWidth = Math.max(2, R * 0.08); holeEdges(c, q, X, Y, R, isWater);
  },
  pit(c, q, x, y, X, Y, R) {
    c.fillStyle = '#1e1210'; c.fillRect(X, Y, R, R);
    c.strokeStyle = '#d98c6e'; c.lineWidth = Math.max(1.5, R * 0.05); c.setLineDash([R * 0.1, R * 0.08]); holeEdges(c, q, X, Y, R, (ch) => ch === 'o'); c.setLineDash([]);
  },
  wall(c, q, x, y, X, Y, R) {   // knitted: rows of V stitches
    const p = wallParts(q, X, Y, R);
    if (!p.so) { c.fillStyle = '#8f2f2c'; c.fillRect(X, p.mid, R, p.bot - p.mid); }
    c.fillStyle = '#c0504d'; c.fillRect(X, p.top, R, p.mid - p.top);
    c.strokeStyle = 'rgba(255,220,210,0.35)'; c.lineWidth = Math.max(1, R * 0.035);
    c.beginPath();
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
      const vx = X + (i + 0.5) * R / 4, vy = p.top + (r + 0.25) * R / 4;
      c.moveTo(vx - R * 0.09, vy); c.lineTo(vx, vy + R * 0.13); c.lineTo(vx + R * 0.09, vy);
    }
    c.stroke();
    c.strokeStyle = '#3b2320'; c.lineWidth = Math.max(1.5, R * 0.05); wallEdges(c, p, X, R);
  },
  tree(c, q, x, y, X, Y, R) {   // a pom-pom
    softShadow(c, X + R * 0.58, Y + R * 0.85, R * 0.42, R * 0.15, 1, '60,30,20');
    const cx = X + R * 0.5, cy = Y + R * 0.3;
    c.fillStyle = ['#f2c14e', '#7fb77e', '#a78bd4'][Math.floor(hash(x, y, 1) * 3)];
    c.beginPath(); c.arc(cx, cy, R * 0.4, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1;
    c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.moveTo(cx + Math.cos(a) * R * 0.15, cy + Math.sin(a) * R * 0.15); c.lineTo(cx + Math.cos(a) * R * 0.44, cy + Math.sin(a) * R * 0.44); } c.stroke();
  },
  rock(c, q, x, y, X, Y, R) {   // a ball of wool
    blob(c, X + R * 0.5, Y + R * 0.5, R * 0.4, R * 0.36, x + y, 0.08); c.fillStyle = '#9fb8d8'; c.fill();
    c.strokeStyle = '#4a6a90'; c.lineWidth = Math.max(1, R * 0.03);
    c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(X + R * 0.2, Y + R * (0.5 + i * 0.1)); c.quadraticCurveTo(X + R * 0.5, Y + R * (0.3 + i * 0.12), X + R * 0.8, Y + R * (0.5 + i * 0.1)); } c.stroke();
  },
  spikes(c, q, x, y, X, Y, R) { spikeRow(c, X, Y, R, '#f1f3f5', '#3b2320'); },   // pins
  planks(c, q, x, y, X, Y, R) { plankRow(c, X, Y, R, '#c9905e', '#3b2320'); },
  sunk(c, q, x, y, X, Y, R) { c.fillStyle = '#c9905e'; c.fillRect(X + R * 0.1, Y + R * 0.1, R * 0.8, R * 0.8); },
  ripple: rippleDash, rippleStyle: 'rgba(255,255,255,0.45)',
  crate(ctx, X, Y, k) { boxShape(ctx, X, Y, k, '#d9a066', '#a5714a', '#3b2320'); },
  overlay(ctx, W, H, t, a) { vignette(ctx, W, H, '#2a1512', 0.4 * a); },
};

// shared painters for the five lighter styles
function spikeRow(c, X, Y, R, fill, ink, lw) {
  c.fillStyle = fill; c.strokeStyle = ink; c.lineWidth = lw || Math.max(1.2, R * 0.04); c.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const cx = X + R * (0.2 + i * 0.3);
    c.beginPath(); c.moveTo(cx - R * 0.13, Y + R * 0.75); c.lineTo(cx, Y + R * 0.2); c.lineTo(cx + R * 0.13, Y + R * 0.75); c.closePath(); c.fill(); c.stroke();
  }
}
function plankRow(c, X, Y, R, fill, ink, lw) {
  c.fillStyle = fill; c.fillRect(X, Y + R * 0.08, R, R * 0.84);
  c.strokeStyle = ink; c.lineWidth = lw || Math.max(1, R * 0.03);
  c.beginPath(); for (let i = 0; i <= 3; i++) { c.moveTo(X + i * R / 3, Y + R * 0.08); c.lineTo(X + i * R / 3, Y + R * 0.92); } c.stroke();
}
function stackBox(c, X, Y, R, top, front, ink, lw) {
  softShadow(c, X + R * 0.58, Y + R * 0.9, R * 0.48, R * 0.15, 0.9);
  c.fillStyle = front; rrect(c, X + R * 0.12, Y + R * 0.3, R * 0.76, R * 0.55, R * 0.12); c.fill();
  c.fillStyle = top; rrect(c, X + R * 0.12, Y + R * 0.05, R * 0.76, R * 0.55, R * 0.18); c.fill();
  c.strokeStyle = ink; c.lineWidth = lw || Math.max(1.2, R * 0.04);
  rrect(c, X + R * 0.12, Y + R * 0.05, R * 0.76, R * 0.8, R * 0.18); c.stroke();
}
function rippleDash(ctx, x, y, X, Y, k, t) {
  const ph = (t * 0.5 + hash(x, y, 1)) % 1;
  const cx = X + k * (0.15 + ph * 0.5), cy = Y + k * (0.3 + hash(x, y, 3) * 0.4);
  ctx.moveTo(cx, cy); ctx.lineTo(cx + k * 0.25, cy);
}

export const STYLES = { candy, watercolour, blueprint, papercut, sepia, cel, brass, cosy };
const styleOf = (z) => STYLES[z && z.style] || candy;

// a raised box (a crate) in screen space: top face lifted, front face below it
function boxShape(ctx, X, Y, k, top, front, ink, lwF = 0.045) {
  softShadow(ctx, X + k * 0.6, Y + k * 0.98, k * 0.55, k * 0.16, 0.8);
  const y0 = Y - LIFT * k + k * 0.04;
  ctx.fillStyle = front; ctx.fillRect(X + k * 0.04, y0 + k * 0.9, k * 0.92, LIFT * k - k * 0.02);
  ctx.fillStyle = top; ctx.fillRect(X + k * 0.04, y0, k * 0.92, k * 0.92);
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, k * lwF); ctx.lineJoin = 'round';
  ctx.strokeRect(X + k * 0.04, y0, k * 0.92, k * 0.9 + LIFT * k - k * 0.02);
  ctx.beginPath(); ctx.moveTo(X + k * 0.04, y0 + k * 0.9); ctx.lineTo(X + k * 0.96, y0 + k * 0.9); ctx.stroke();
}

// ---------------------------------------------------------------- screen passes

// darkened (or tinted) edges: four bands of linear gradient, cheaper than a full-screen radial one
function vignette(ctx, W, H, color, alpha, inner = 0.55) {
  if (alpha <= 0) return;
  const b = Math.min(W, H) * (1 - inner) * 0.6;
  const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.45, rgba(color, alpha * 0.35)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  };
  band(0, 0, 0, b, 0, 0, W, b); band(0, H, 0, H - b, 0, H - b, W, b);
  band(0, 0, b, 0, 0, 0, b, H); band(W, 0, W - b, 0, W - b, 0, b, H);
}
let grainTile = null, grainPat = null, grainCtx = null;
function grainPass(ctx, W, H, frame, alpha) {
  if (alpha <= 0) return;
  if (!grainTile) {
    grainTile = makeCanvas(128, 128);
    if (!grainTile) return;
    const g = grainTile.getContext('2d', SOFT);
    for (let i = 0; i < 900; i++) {
      const v = hash(i, 1, 99);
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
      g.fillRect(Math.floor(hash(i, 2, 99) * 128), Math.floor(hash(i, 3, 99) * 128), 1 + (v > 0.9 ? 1 : 0), 1);
    }
  }
  if (grainCtx !== ctx) { grainPat = ctx.createPattern(grainTile, 'repeat'); grainCtx = ctx; }
  if (!grainPat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(-Math.floor(hash(frame, 7, 1) * 128), -Math.floor(hash(frame, 8, 1) * 128));
  ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W + 128, H + 128);
  ctx.restore();
}

// ---------------------------------------------------------------- static chunks

const chunkStore = new WeakMap();   // grid -> Map(key -> chunk)
let chunkRes = 0, chunkFrame = 0;
function pickRes(k) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const want = k * dpr;
  if (chunkRes && want > chunkRes * 0.8 && want < chunkRes * 1.25) return chunkRes;
  chunkRes = RES.find((r) => r >= want * 0.92) || RES[RES.length - 1];
  return chunkRes;
}
function chunkSig(s, vw, cx0, cy0) {
  let sig = '';
  for (let y = cy0 - 1; y <= cy0 + CHUNK; y++) {
    const row = s.grid[y];
    for (let x = cx0 - 1; x <= cx0 + CHUNK; x++) sig += row ? baseChar(row[x], x, y, vw) : '#';
  }
  return sig;
}
function drawStatic(ctx, s, vw, k, sx, sy, x0, x1, y0, y1) {
  let store = chunkStore.get(s.grid);
  if (!store) { store = new Map(); chunkStore.set(s.grid, store); }
  const R = pickRes(k);
  chunkFrame++;
  for (let cy0 = Math.floor(y0 / CHUNK) * CHUNK; cy0 <= y1; cy0 += CHUNK) {
    for (let cx0 = Math.floor(x0 / CHUNK) * CHUNK; cx0 <= x1; cx0 += CHUNK) {
      if (cx0 + CHUNK <= 0 || cy0 + CHUNK <= 0 || cx0 >= s.w || cy0 >= s.h) continue;
      const sig = chunkSig(s, vw, cx0, cy0);
      const key = `${R}:${cx0}:${cy0}`;
      let ch = store.get(key);
      if (!ch || ch.sig !== sig) {
        if (!ch) {
          if (store.size >= 120) {
            let oldK = null, oldF = Infinity;
            for (const [kk, v] of store) if (v.used < oldF) { oldF = v.used; oldK = kk; }
            store.delete(oldK);
          }
          ch = { canvas: makeCanvas(CHUNK * R, CHUNK * R), sig: '', used: 0 };
          store.set(key, ch);
        }
        ch.sig = sig;
        if (ch.canvas) paintChunk(ch.canvas.getContext('2d', SOFT), s, vw, cx0, cy0, R);
      }
      ch.used = chunkFrame;
      if (!ch.canvas) continue;
      const a = Math.round(sx(cx0)), b = Math.round(sx(cx0 + CHUNK));
      const c = Math.round(sy(cy0)), d = Math.round(sy(cy0 + CHUNK));
      ctx.drawImage(ch.canvas, a, c, b - a, d - c);
    }
  }
}
function paintChunk(c, s, vw, cx0, cy0, R) {
  c.clearRect(0, 0, CHUNK * R, CHUNK * R);
  c.save();
  c.translate(-cx0 * R, -cy0 * R);
  c.beginPath(); c.rect(cx0 * R, cy0 * R, CHUNK * R, CHUNK * R); c.clip();
  const rd = reader(s, vw);
  const ys = Math.max(0, cy0 - 1), ye = Math.min(s.h - 1, cy0 + CHUNK), xs = Math.max(0, cx0 - 1), xe = Math.min(s.w - 1, cx0 + CHUNK);
  // pass 0: floors and beds; 1: what is painted over them (washes, edges); 2: shadows on floors;
  // 3: raised things and floor props, row by row (so a wall's top overlaps the row behind it)
  for (let pass = 0; pass < 4; pass++) {
    for (let y = ys; y <= ye; y++) {
      for (let x = xs; x <= xe; x++) {
        const b = rd(x, y);
        const st = styleOf(zoneOf(s, x, y));
        const q = (dx, dy) => rd(x + dx, y + dy);
        const X = x * R, Y = y * R;
        const bed = b === 'w' || b === 'u' ? 'water' : b === 'o' ? 'pit' : b === '#' ? null : 'floor';
        if (pass === 0) { if (bed) st[bed](c, q, x, y, X, Y, R); }
        else if (pass === 1) { if (bed && st[bed + '2']) st[bed + '2'](c, q, x, y, X, Y, R); }
        else if (pass === 2) {
          if (!st.shadowless && bed === 'floor') castShadow(c, q, X, Y, R, st.shadow);
        } else {
          if (b === '#') st.wall(c, q, x, y, X, Y, R);
          else if (b === 'T') st.tree(c, q, x, y, X, Y, R);
          else if (b === 'r') st.rock(c, q, x, y, X, Y, R);
          else if (b === '^') st.spikes(c, q, x, y, X, Y, R);
          else if (b === '=') st.planks(c, q, x, y, X, Y, R);
          else if (b === 'u') st.sunk(c, q, x, y, X, Y, R);
          else if (b === 'g') { c.fillStyle = 'rgba(200,240,255,0.55)'; c.fillRect(X + R * 0.05, Y - LIFT * R, R * 0.9, R); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1, R * 0.04); c.strokeRect(X + R * 0.05, Y - LIFT * R, R * 0.9, R); }
        }
      }
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- live tiles

function standing(s, x, y) {
  return s.players.some((p) => !p.dead && !p.fly && !(p.hop > 0) && Math.floor(p.x) === x && Math.floor(p.y) === y);
}
function anyoneIn(s, x, y) {
  const r = C.FOOT / 2;
  return s.players.some((p) => !p.dead && p.x - r < x + 1 && p.x + r > x && p.y - r < y + 1 && p.y + r > y);
}

function drawPlate(ctx, st, X, Y, k, g, heavy, on) {
  const col = GROUP_COLORS[g], cx = X + k / 2, cy = Y + k / 2;
  ctx.lineJoin = 'round';
  const shape = (dy, sc) => {
    if (heavy) rrect(ctx, cx - k * 0.4 * sc, cy - k * 0.36 * sc + dy, k * 0.8 * sc, k * 0.72 * sc, k * 0.1);
    else { ctx.beginPath(); ctx.ellipse(cx, cy + dy, k * 0.36 * sc, k * 0.32 * sc, 0, 0, TAU); }
  };
  // the rim it sits in
  shape(k * 0.04, 1.12); ctx.fillStyle = 'rgba(20,14,30,0.45)'; ctx.fill();
  if (heavy) { shape(k * 0.04, 1.12); ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(2, k * 0.07); ctx.stroke(); }
  if (on) {
    shape(k * 0.05, 0.95); ctx.fillStyle = shade(col, -0.2); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
    glow(ctx, cx, cy, k * 0.7, col, 0.45);
  } else {
    shape(k * 0.06, 1); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    shape(-k * 0.02, 1); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = st.ink === '#ffffff' ? '#ffffff' : 'rgba(28,18,42,0.8)'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
  }
  glyph(ctx, g, cx, cy + (on ? k * 0.05 : -k * 0.02), k * 0.13);
  if (heavy) {   // a weight mark: it needs someone big
    ctx.fillStyle = 'rgba(28,18,42,0.85)';
    ctx.font = `900 ${Math.round(k * 0.2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▼▼', cx, cy + k * 0.26);
  }
}

function drawDoor(ctx, s, st, rd, x, y, X, Y, k, g, open) {
  const col = GROUP_COLORS[g];
  const horiz = isW(rd(x - 1, y)) || isW(rd(x + 1, y));   // the wall runs left-right
  const vertWall = !horiz;
  if (open) {
    // the threshold and two posts, the panels slid away
    ctx.fillStyle = rgba(col, 0.28); ctx.fillRect(X + k * 0.05, Y + k * 0.05, k * 0.9, k * 0.9);
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.setLineDash([k * 0.12, k * 0.08]);
    ctx.strokeRect(X + k * 0.08, Y + k * 0.08, k * 0.84, k * 0.84); ctx.setLineDash([]);
    ctx.fillStyle = shade(col, -0.35);
    if (vertWall) { ctx.fillRect(X + k * 0.1, Y - LIFT * k * 0.5, k * 0.8, k * 0.12); ctx.fillRect(X + k * 0.1, Y + k * 0.88, k * 0.8, k * 0.12); }
    else { ctx.fillRect(X, Y - LIFT * k * 0.5, k * 0.12, k + LIFT * k * 0.5); ctx.fillRect(X + k * 0.88, Y - LIFT * k * 0.5, k * 0.12, k + LIFT * k * 0.5); }
    glyph(ctx, g, X + k / 2, Y + k / 2, k * 0.14, 0.75);
    return;
  }
  // closed: a raised block in the group's colour, barred
  const top = Y - LIFT * k;
  softShadow(ctx, X + k * 0.55, Y + k * 1.02, k * 0.6, k * 0.14, 0.7);
  ctx.fillStyle = shade(col, -0.4); ctx.fillRect(X, Y + k - LIFT * k, k, LIFT * k);
  ctx.fillStyle = col; ctx.fillRect(X, top, k, k);
  ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = Math.max(1.5, k * 0.06);
  ctx.beginPath();
  for (let i = 1; i < 4; i++) { if (vertWall) { ctx.moveTo(X + k * 0.08, top + i * k / 4); ctx.lineTo(X + k * 0.92, top + i * k / 4); } else { ctx.moveTo(X + i * k / 4, top + k * 0.08); ctx.lineTo(X + i * k / 4, top + k * 0.92); } }
  ctx.stroke();
  ctx.strokeStyle = st.ink; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.strokeRect(X, top, k, k + LIFT * k);
  glyph(ctx, g, X + k / 2, top + k / 2, k * 0.17);
}

function drawBridge(ctx, st, rd, x, y, X, Y, k, g, on) {
  const col = GROUP_COLORS[g];
  const across = /[a-d]/.test(rd(x, y - 1) + rd(x, y + 1)) ? 'v' : (/[a-d]/.test(rd(x - 1, y) + rd(x + 1, y)) ? 'h' : (isWater(rd(x, y - 1)) ? 'h' : 'v'));
  if (on) {
    softShadow(ctx, X + k / 2, Y + k * 0.6, k * 0.55, k * 0.5, 0.5);
    ctx.fillStyle = mix('#c48a50', col, 0.25); ctx.fillRect(X, Y, k, k);
    ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = Math.max(1, k * 0.03);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { if (across === 'v') { ctx.moveTo(X, Y + i * k / 4); ctx.lineTo(X + k, Y + i * k / 4); } else { ctx.moveTo(X + i * k / 4, Y); ctx.lineTo(X + i * k / 4, Y + k); } }
    ctx.stroke();
    ctx.fillStyle = col;   // rails in the group colour
    if (across === 'v') { ctx.fillRect(X, Y, k * 0.1, k); ctx.fillRect(X + k * 0.9, Y, k * 0.1, k); } else { ctx.fillRect(X, Y, k, k * 0.1); ctx.fillRect(X, Y + k * 0.9, k, k * 0.1); }
    glyph(ctx, g, X + k / 2, Y + k / 2, k * 0.13);
  } else {
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = Math.max(1.5, k * 0.045); ctx.setLineDash([k * 0.1, k * 0.1]);
    if (across === 'v') { ctx.beginPath(); ctx.moveTo(X + k * 0.08, Y); ctx.lineTo(X + k * 0.08, Y + k); ctx.moveTo(X + k * 0.92, Y); ctx.lineTo(X + k * 0.92, Y + k); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(X, Y + k * 0.08); ctx.lineTo(X + k, Y + k * 0.08); ctx.moveTo(X, Y + k * 0.92); ctx.lineTo(X + k, Y + k * 0.92); ctx.stroke(); }
    ctx.setLineDash([]);
    glyph(ctx, g, X + k / 2, Y + k / 2, k * 0.11, 0.5);
  }
}

function drawKey(ctx, s, x, y, X, Y, k, lit, idx, top, prev) {
  ctx.fillStyle = lit ? NOTE_COLORS[idx % 8] : '#fbfbf8';
  ctx.fillRect(X + k * 0.04, Y + (top ? k * 0.04 : 0), k * 0.92, k * (top ? 0.96 : 0.92));
  ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(1, k * 0.04);
  ctx.strokeRect(X + k * 0.04, Y + (top ? k * 0.04 : 0), k * 0.92, k * (top ? 0.96 : 0.92));
  if (top && prev && (idx - 1) % 7 !== 2 && (idx - 1) % 7 !== 6) {   // the black key between this and the last
    ctx.fillStyle = '#212529'; rrect(ctx, X - k * 0.24, Y + k * 0.04, k * 0.48, k * 0.55, k * 0.06); ctx.fill();
  }
  if (lit) glow(ctx, X + k / 2, Y + k / 2, k * 0.9, NOTE_COLORS[idx % 8], 0.5);
}

function drawVine(ctx, rd, x, y, X, Y, k, t) {
  const h = rd(x - 1, y) === 'v' || rd(x + 1, y) === 'v' ? true : !(rd(x, y - 1) === 'v' || rd(x, y + 1) === 'v');
  const stem = mixHex('#3f9b4a', SPICE_TEAL, 0.55), leaf = mixHex('#7bd389', SPICE_TEAL, 0.5);
  ctx.save();
  ctx.translate(X + k / 2, Y + k / 2);
  if (!h) ctx.rotate(Math.PI / 2);
  // a soft teal under-glow: it's his to walk on
  ctx.fillStyle = rgba(SPICE_TEAL, 0.22); ctx.fillRect(-k / 2, -k * 0.34, k, k * 0.68);
  for (const [off, w] of [[-0.16, 0.15], [0.16, 0.13]]) {
    ctx.strokeStyle = '#0d5c55'; ctx.lineWidth = k * w + 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-k / 2, k * off);
    ctx.bezierCurveTo(-k * 0.2, k * (off + 0.12), k * 0.2, k * (off - 0.12), k / 2, k * off); ctx.stroke();
    ctx.strokeStyle = stem; ctx.lineWidth = k * w;
    ctx.beginPath(); ctx.moveTo(-k / 2, k * off);
    ctx.bezierCurveTo(-k * 0.2, k * (off + 0.12), k * 0.2, k * (off - 0.12), k / 2, k * off); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  for (let i = 0; i < 4; i++) {
    const lx = -k * 0.38 + i * k * 0.25, side = i % 2 ? 1 : -1, sway = Math.sin(t * 2 + x + i) * 0.15;
    ctx.save(); ctx.translate(lx, side * k * 0.3); ctx.rotate(side * 0.7 + sway);
    ctx.beginPath(); ctx.ellipse(0, 0, k * 0.17, k * 0.09, 0, 0, TAU);
    ctx.fillStyle = leaf; ctx.fill(); ctx.strokeStyle = '#0d5c55'; ctx.lineWidth = Math.max(1, k * 0.025); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- entities

function sortY(e) {
  switch (e.type) {
    case 'stone': return e.y + 2;
    case 'bench': return e.y + 1;
    default: return (e.y ?? 0) + 1;
  }
}
// flat things drawn under everything else
function drawFlatEnt(ctx, s, st, e, sx, sy, k, t) {
  switch (e.type) {
    case 'stone': {
      const cx = sx(e.x + 1), cy = sy(e.y + 1), r = k * 0.9;
      softShadow(ctx, cx + k * 0.1, cy + k * 0.2, r * 1.15, r * 0.9, 0.6);
      ctx.fillStyle = e.lit ? '#fff3bf' : '#adb5bd';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = e.lit ? '#ffe066' : '#868e96'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, TAU); ctx.fill();
      ctx.strokeStyle = st.ink === '#ffffff' ? '#ffffff' : '#343a40'; ctx.lineWidth = Math.max(2, k * 0.06); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      // two footprints: stand on it together
      for (const [d, col] of [[-1, PLAYER_COLORS[0]], [1, PLAYER_COLORS[1]]]) {
        ctx.fillStyle = e.lit ? col : rgba(col, 0.75);
        ctx.beginPath(); ctx.ellipse(cx + d * r * 0.33, cy + r * 0.05, r * 0.17, r * 0.24, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,14,40,0.6)'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
      }
      if (e.lit) glow(ctx, cx, cy, r * 2.2, '#ffd43b', 0.5 + Math.sin(t * 3) * 0.1);
      if (e.wait > 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(3, k * 0.14); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(e.wait / C.STONE_TIME)); ctx.stroke(); ctx.lineCap = 'butt';
      }
      break;
    }
    case 'spring': {
      const X = sx(e.x), Y = sy(e.y), cx = X + k / 2, cy = Y + k / 2;
      // the dotted flight arc and the landing mark
      const tx = sx(e.tx + 0.5), ty = sy(e.ty + 0.5), dist = Math.hypot(e.tx - e.x, e.ty - e.y);
      const hgt = (1.2 + dist * 0.35) * k;
      ctx.fillStyle = st.ink === '#ffffff' ? 'rgba(255,255,255,0.85)' : 'rgba(255,146,43,0.9)';
      const n = Math.max(6, Math.round(dist * 2.5));
      for (let i = 1; i < n; i++) {
        const u = i / n, px = cx + (tx - cx) * u, py = cy + (ty - cy) * u - Math.sin(Math.PI * u) * hgt;
        const pulse = 0.5 + 0.5 * Math.sin(t * 6 - i * 0.6);
        ctx.beginPath(); ctx.arc(px, py, k * (0.04 + 0.03 * pulse), 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,146,43,0.95)'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.setLineDash([k * 0.1, k * 0.08]);
      ctx.beginPath(); ctx.ellipse(tx, ty, k * 0.32, k * 0.22, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      // the pad
      ctx.fillStyle = '#495057'; ctx.beginPath(); ctx.ellipse(cx, cy + k * 0.08, k * 0.42, k * 0.36, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = Math.max(1, k * 0.04);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx, cy + k * 0.08, k * (0.38 - i * 0.1), k * (0.32 - i * 0.08), 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.ellipse(cx, cy - k * 0.04, k * 0.36, k * 0.3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5c2a00'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
      // a chevron pointing where it flings you
      const a = Math.atan2(e.ty - e.y, e.tx - e.x);
      ctx.save(); ctx.translate(cx, cy - k * 0.04); ctx.rotate(a);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, k * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-k * 0.1, -k * 0.14); ctx.lineTo(k * 0.08, 0); ctx.lineTo(-k * 0.1, k * 0.14); ctx.stroke();
      ctx.restore(); ctx.lineCap = 'butt';
      break;
    }
    case 'ball': {   // the pitch markings and the goals (the ball itself is sorted with players)
      const mid = (e.gy0 + e.gy1) / 2, py0 = sy(mid - 3), py1 = sy(mid + 3), px0 = sx(e.x0), px1 = sx(e.x1);
      ctx.strokeStyle = st.ink === '#ffffff' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(2, k * 0.06);
      ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
      ctx.beginPath(); ctx.moveTo((px0 + px1) / 2, py0); ctx.lineTo((px0 + px1) / 2, py1); ctx.stroke();
      ctx.beginPath(); ctx.arc((px0 + px1) / 2, sy(mid), k * 1.2, 0, TAU); ctx.stroke();
      // nets: Spice scores in the left one, Sugar in the right
      for (const [gx, who] of [[e.x0 - 1, 1], [e.x1, 0]]) {
        const X = sx(gx), Y0 = sy(Math.round(e.gy0)), Y1 = sy(Math.round(e.gy1));
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(X, Y0, k, Y1 - Y0);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 5; i++) { ctx.moveTo(X + i * k / 5, Y0); ctx.lineTo(X + i * k / 5, Y1); }
        for (let yy = Y0 + k / 5; yy < Y1; yy += k / 5) { ctx.moveTo(X, yy); ctx.lineTo(X + k, yy); }
        ctx.stroke();
        ctx.strokeStyle = PLAYER_COLORS[who]; ctx.lineWidth = Math.max(3, k * 0.12);
        ctx.strokeRect(X, Y0, k, Y1 - Y0);
      }
      break;
    }
    case 'race': {   // the start box
      const X = sx(e.x - 1), Y = sy(e.y - 1);
      ctx.strokeStyle = 'rgba(33,37,41,0.55)'; ctx.lineWidth = Math.max(2, k * 0.06); ctx.setLineDash([k * 0.2, k * 0.12]);
      ctx.strokeRect(X + k * 0.05, Y + k * 0.05, k * 2.9, k * 2.9); ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#212529' : '#ffffff'; ctx.fillRect(X + k * 0.2 + i * k * 0.43, Y + k * 2.45 + j * k * 0.2, k * 0.43, k * 0.2); }
      break;
    }
    default: break;
  }
}

function flag(ctx, x, y, k, t, color, text, big = false) {
  const h = k * (big ? 1.7 : 1.35);
  softShadow(ctx, x, y, k * 0.25, k * 0.08, 0.7);
  ctx.fillStyle = '#495057'; ctx.fillRect(x - k * 0.04, y - h, k * 0.08, h);
  const w = k * 0.6, fh = k * 0.4, wav = Math.sin(t * 5 + x) * k * 0.04;
  ctx.beginPath(); ctx.moveTo(x + k * 0.04, y - h); ctx.quadraticCurveTo(x + w * 0.5, y - h - wav, x + w, y - h + fh * 0.5 + wav); ctx.lineTo(x + k * 0.04, y - h + fh); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(30,14,40,0.8)'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
  if (text) { ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.round(k * 0.26)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w * 0.38, y - h + fh * 0.5); }
}

function drawEnt(ctx, s, st, e, sx, sy, k, t, H) {
  switch (e.type) {
    case 'crate': if (!e.gone) st.crate(ctx, sx(e.x), sy(e.y), k); break;
    case 'switch': {
      const X = sx(e.x), Y = sy(e.y), cx = X + k / 2, col = GROUP_COLORS[e.g];
      softShadow(ctx, cx + k * 0.08, Y + k * 0.85, k * 0.4, k * 0.13, 0.8);
      ctx.fillStyle = '#868e96'; rrect(ctx, X + k * 0.15, Y + k * 0.45, k * 0.7, k * 0.42, k * 0.08); ctx.fill();
      ctx.strokeStyle = st.ink; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
      // the post
      ctx.fillStyle = '#5c636a'; ctx.fillRect(cx - k * 0.07, Y - k * 0.2, k * 0.14, k * 0.75);
      ctx.strokeRect(cx - k * 0.07, Y - k * 0.2, k * 0.14, k * 0.75);
      // the lever: left when off, right when on
      const a = e.on ? 0.65 : -0.65, lx = cx + Math.sin(a) * k * 0.45, ly = Y - k * 0.1 - Math.cos(a) * k * 0.45;
      ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(2, k * 0.08); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, Y - k * 0.1); ctx.lineTo(lx, ly); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, k * 0.13, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(28,18,42,0.9)'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
      if (e.on) glow(ctx, lx, ly, k * 0.5, col, 0.6);
      glyph(ctx, e.g, cx, Y + k * 0.66, k * 0.12);
      break;
    }
    case 'heart': {
      const cx = sx(e.x + 0.5), base = sy(e.y + 0.85);
      softShadow(ctx, cx + k * 0.05, base, k * 0.45, k * 0.14, 0.9);
      ctx.fillStyle = '#dee2e6'; ctx.fillRect(cx - k * 0.32, base - k * 0.42, k * 0.64, k * 0.38);
      ctx.fillStyle = '#adb5bd'; ctx.fillRect(cx - k * 0.32, base - k * 0.16, k * 0.64, k * 0.12);
      ctx.beginPath(); ctx.ellipse(cx, base - k * 0.42, k * 0.36, k * 0.14, 0, 0, TAU); ctx.fillStyle = '#f8f9fa'; ctx.fill();
      ctx.strokeStyle = st.ink === '#ffffff' ? '#ffffff' : '#495057'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
      ctx.strokeRect(cx - k * 0.32, base - k * 0.42, k * 0.64, k * 0.38);
      if (e.got) {
        ctx.setLineDash([k * 0.06, k * 0.05]); ctx.strokeStyle = 'rgba(255,77,109,0.6)'; ctx.lineWidth = Math.max(1, k * 0.04);
        heartPath(ctx, cx, base - k * 1.05, k * 0.3); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const by = base - k * 1.1 - Math.sin(t * 2.5) * k * 0.08;
        glow(ctx, cx, by, k * 1.2, '#ff4d6d', 0.55);
        heart(ctx, cx, by, k * 0.4, '#ff4d6d', true);
      }
      break;
    }
    case 'sign': {
      const cx = sx(e.x + 0.5), base = sy(e.y + 0.85);
      softShadow(ctx, cx + k * 0.05, base, k * 0.3, k * 0.1, 0.8);
      const line = st.ink === '#ffffff';   // on a blueprint: a drawn sign, not a wooden one
      ctx.fillStyle = line ? '#ffffff' : '#8d5a3a'; ctx.fillRect(cx - k * 0.04, base - k * 0.75, k * 0.08, k * 0.75);
      ctx.fillStyle = line ? '#2b66ab' : '#e9c48f'; rrect(ctx, cx - k * 0.36, base - k * 1.12, k * 0.72, k * 0.48, k * 0.08); ctx.fill();
      ctx.strokeStyle = line ? '#ffffff' : '#5c3a1b'; ctx.lineWidth = Math.max(1.4, k * 0.045); ctx.stroke();
      ctx.fillStyle = line ? '#ffffff' : '#5c3a1b'; ctx.font = `900 ${Math.round(k * 0.36)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, base - k * 0.87);
      break;
    }
    case 'race': {
      flag(ctx, sx(e.x + 0.5), sy(e.y + 0.8), k, t, '#212529', '', true);
      // chequers on the start flag
      e.gates.forEach(([gx, gy], i) => {
        const x = sx(gx + 0.5), y = sy(gy + 0.8);
        flag(ctx, x, y, k, t, '#ff922b', String(i + 1));
        if (e.phase === 'run') e.next.forEach((n, id) => { if (n === i) { ctx.fillStyle = PLAYER_COLORS[id]; ctx.beginPath(); ctx.arc(x + (id ? k * 0.18 : -k * 0.18), y + k * 0.2, k * 0.1, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(30,14,40,0.8)'; ctx.lineWidth = 1.5; ctx.stroke(); } });
      });
      break;
    }
    case 'bench': {
      const X = sx(e.x), Y = sy(e.y), w = e.w * k;
      softShadow(ctx, X + w / 2 + k * 0.1, Y + k * 0.9, w * 0.55, k * 0.15, 0.8);
      ctx.fillStyle = '#6d4c41'; for (const lx of [X + k * 0.2, X + w - k * 0.3]) ctx.fillRect(lx, Y + k * 0.5, k * 0.1, k * 0.35);
      ctx.fillStyle = '#c98f5a'; rrect(ctx, X + k * 0.05, Y + k * 0.15, w - k * 0.1, k * 0.45, k * 0.08); ctx.fill();
      ctx.strokeStyle = '#5c3a1b'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
      ctx.beginPath(); for (let i = 1; i < 3; i++) { ctx.moveTo(X + k * 0.1, Y + k * (0.15 + i * 0.15)); ctx.lineTo(X + w - k * 0.1, Y + k * (0.15 + i * 0.15)); } ctx.stroke();
      ctx.fillStyle = '#a5714a'; rrect(ctx, X + k * 0.05, Y - k * 0.15, w - k * 0.1, k * 0.2, k * 0.06); ctx.fill(); ctx.stroke();
      if (e.sit > 0) { ctx.globalAlpha = clamp01(e.sit / C.BENCH_TIME); heart(ctx, X + w / 2, Y - k * 0.6 - e.sit * k * 0.3, k * 0.3, '#ff4d6d', true); ctx.globalAlpha = 1; }
      break;
    }
    case 'balloons': {
      for (const who of [0, 1]) {
        const px = sx((who ? e.x1 : e.x) + 0.5), base = sy((who ? e.y1 : e.y) + 0.8), col = PLAYER_COLORS[who];
        softShadow(ctx, px, base, k * 0.42, k * 0.14, 0.8);
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, base - k * 0.12, k * 0.4, k * 0.25, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,14,40,0.8)'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
        ctx.fillStyle = '#868e96'; rrect(ctx, px - k * 0.18, base - k * 0.55, k * 0.36, k * 0.4, k * 0.06); ctx.fill(); ctx.stroke();
        const n = e.n[who];
        if (e.winner === who) {   // POP
          const age = clamp01(1 - e.rest / C.TOY_REST), by = base - k * 2.2;
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, k * 0.08); ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r0 = k * (0.3 + age * 0.6), r1 = r0 + k * 0.35; ctx.moveTo(px + Math.cos(a) * r0, by + Math.sin(a) * r0); ctx.lineTo(px + Math.cos(a) * r1, by + Math.sin(a) * r1); }
          ctx.stroke(); ctx.lineCap = 'butt';
          label(ctx, 'POP!', px, by, k * 0.45, '#ffd43b');
          continue;
        }
        const r = k * (0.22 + 0.55 * clamp01(n / C.PUMP_POP)), by = base - k * 1.6 - r + Math.sin(t * 2 + who) * k * 0.05;
        ctx.strokeStyle = 'rgba(30,14,40,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, base - k * 0.55); ctx.quadraticCurveTo(px + k * 0.1, by + r + k * 0.4, px, by + r); ctx.stroke();
        const g = ctx.createRadialGradient(px - r * 0.35, by - r * 0.35, r * 0.1, px, by, r);
        g.addColorStop(0, shade(col, 0.5)); g.addColorStop(1, col);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, by, r * 0.88, r, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,14,40,0.8)'; ctx.lineWidth = Math.max(1.2, k * 0.04); ctx.stroke();
        if (n > 0) { ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.round(Math.max(10, r * 0.6))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), px, by); }
      }
      break;
    }
    case 'ball': {
      const x = sx(e.x), y = sy(e.y), r = C.BALL_R * k * 1.1;
      softShadow(ctx, x + r * 0.2, y + r * 0.7, r * 1.1, r * 0.4, 0.9);
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.x * 2 + e.y);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#212529';
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, r * 0.2, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1.5, k * 0.045); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      break;
    }
    default: break;
  }
}
function heartPath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.6, cy - r * 1.3, cx, cy - r * 0.4);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
}

// labels over the toys, drawn last so nothing covers them
function drawEntLabels(ctx, s, e, sx, sy, k, t, H) {
  const px = textPx(H) * 1.15;
  if (e.type === 'race') {
    const x = sx(e.x + 0.5), y = sy(e.y) - k * 2.2;
    if (e.phase === 'count') label(ctx, String(Math.ceil(e.count)), x, y, px * 2, '#ffd43b');
    else if (e.phase === 'run') label(ctx, `${e.clock.toFixed(1)}s`, x, y, px, '#ffffff');
    else if (e.phase === 'rest') label(ctx, e.winner < 0 ? 'Nobody made it!' : `${e.winner ? 'Spice' : 'Sugar'} wins!`, x, y, px * 1.2, e.winner < 0 ? '#ffffff' : PLAYER_COLORS[e.winner]);
  } else if (e.type === 'ball') {
    const mid = (e.gy0 + e.gy1) / 2, x = sx((e.x0 + e.x1) / 2), y = sy(mid - 3) - px * 1.3;
    ctx.font = `800 ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const a = `Sugar ${e.score[0]}`, b = `${e.score[1]} Spice`, wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, gap = px * 0.8;
    const w = wa + wb + gap + px * 1.2;
    ctx.fillStyle = 'rgba(28,20,52,0.78)'; rrect(ctx, x - w / 2, y - px * 0.75, w, px * 1.5, px * 0.75); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = PLAYER_COLORS[0]; ctx.fillText(a, x - gap / 2, y);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText(':', x, y);
    ctx.textAlign = 'left'; ctx.fillStyle = PLAYER_COLORS[1]; ctx.fillText(b, x + gap / 2, y);
    if (e.winner >= 0) label(ctx, `${e.winner ? 'Spice' : 'Sugar'} wins the footy!`, x, y - px * 1.8, px, PLAYER_COLORS[e.winner]);
  }
}

// ---------------------------------------------------------------- players

const PROPS = { lantern: 'lantern', hammer: 'slam', nail: 'pin', glide: 'glide', gust: 'gust', freeze: 'freeze' };
function lift(p) {
  if (p.fly) { const u = clamp01(p.fly.t / p.fly.dur); return Math.sin(Math.PI * u) * 2.6; }
  if (p.hop > 0) { const u = clamp01(1 - p.hop / C.HOP_TIME); return Math.sin(Math.PI * u) * (p.glide ? 0.75 : 0.55); }
  return 0;
}
function drawPlayer(ctx, s, st, p, sx, sy, k, t) {
  const sc = p.size === 'small' ? 0.72 : p.size === 'big' ? 1.35 : 1;
  const h = 1.1 * k * sc, w = 0.82 * k * sc, up = lift(p) * k;
  const cx = sx(p.x), foot = sy(p.y + 0.3);
  const fade = p.dead ? clamp01(p.deadT / C.RESPAWN) : 1;
  const sh = 1 / (1 + up / k * 0.8);
  softShadow(ctx, cx, foot, k * 0.4 * sc * sh, k * 0.15 * sc * sh, 0.95 * fade * (0.5 + sh * 0.5));
  if (p.dead) {   // a splash ring where they went in
    ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.lineWidth = Math.max(2, k * 0.06);
    ctx.beginPath(); ctx.ellipse(cx, foot, k * (0.6 - fade * 0.3), k * (0.25 - fade * 0.1), 0, 0, TAU); ctx.stroke();
  }
  // a pale rim behind the sprite: the character stays separate from any style's busiest ground
  const by = foot - up - h;
  ctx.fillStyle = st === blueprint || st === papercut ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.18)';
  rrect(ctx, cx - w / 2 - k * 0.05, by - k * 0.02, w + k * 0.1, h + k * 0.06, Math.min(w, h) * 0.45); ctx.fill();
  const facing = p.fx > 0 ? 1 : p.fx < 0 ? -1 : p.id ? -1 : 1;
  const power = powerOf(s, p);
  drawCharacter(ctx, p.id, cx - w / 2, by + (p.dead ? (1 - fade) * h * 0.5 : 0), w, p.dead ? h * (0.5 + fade * 0.5) : h, {
    facing, t, moving: Math.abs(p.vx) + Math.abs(p.vy) > 0.5, airborne: up > 0, power: PROPS[power] || 'none',
    gliding: !!p.glide, alpha: fade, k: h / 1.25,
  });
  if (p.freezing) {
    ctx.strokeStyle = 'rgba(200,235,255,0.9)'; ctx.lineWidth = Math.max(2, k * 0.06); ctx.setLineDash([k * 0.1, k * 0.08]);
    ctx.beginPath(); ctx.arc(cx, foot - h / 2 - up, h * 0.75, t * 2, t * 2 + TAU); ctx.stroke(); ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- the frame

function zoneBlend(s, cx, cy) {
  const w = new Map();
  for (const dy of [-4, 0, 4]) for (const dx of [-5, 0, 5]) {
    const st = styleOf(zoneOf(s, Math.floor(cx + dx), Math.floor(cy + dy)));
    const wt = dx === 0 && dy === 0 ? 3 : 1;
    w.set(st, (w.get(st) || 0) + wt);
  }
  const out = [];
  for (const [st, v] of w) out.push([st, v / 11]);
  return out;
}

export function drawTD(ctx, s, cam, W, H, fx = [], t = s.time) {
  const k = cam.scale;
  const sx = (x) => (x - cam.x) * k + W / 2, sy = (y) => (y - cam.y) * k + H / 2;
  const x0 = Math.floor(cam.x - W / 2 / k) - 1, x1 = Math.ceil(cam.x + W / 2 / k) + 1;
  const y0 = Math.floor(cam.y - H / 2 / k) - 1, y1 = Math.ceil(cam.y + H / 2 / k) + 2;
  const blend = zoneBlend(s, cam.x, cam.y);
  // the backdrop beyond the map: the camera's zone, crossfaded across a border
  let bg = blend[0][0].bg, acc = blend[0][1];
  for (let i = 1; i < blend.length; i++) { acc += blend[i][1]; bg = mixHex(bg, blend[i][0].bg, blend[i][1] / acc); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const vw = vineMap(s);
  drawStatic(ctx, s, vw, k, sx, sy, x0, x1, y0, y1);

  // live tiles
  const rd = reader(s, null);
  const raw = (x, y) => tileAt(s, x, y);
  const piano = s.ents.find((e) => e.type === 'piano');
  const ripples = new Map();
  for (let y = Math.max(0, y0); y <= Math.min(s.h - 1, y1); y++) {
    const row = s.grid[y];
    for (let x = Math.max(0, x0); x <= Math.min(s.w - 1, x1); x++) {
      const ch = row[x];
      if (ch === '#' || ch === '.') continue;
      const X = sx(x), Y = sy(y);
      const st = styleOf(zoneOf(s, x, y));
      if (ch === 'w' || ch === 'u' || (ch >= 'a' && ch <= 'd' && !s.pressed[ch.charCodeAt(0) - 96])) {
        let path = ripples.get(st);
        if (!path) { path = []; ripples.set(st, path); }
        path.push([x, y, X, Y]);
      }
      if (ch >= '1' && ch <= '8') {
        const g = ((ch.charCodeAt(0) - 49) % 4) + 1;
        drawPlate(ctx, st, X, Y, k, g, ch >= '5', !!s.pressed[g]);
      } else if (ch >= 'A' && ch <= 'D') {
        const g = ch.charCodeAt(0) - 64;
        drawDoor(ctx, s, st, rd, x, y, X, Y, k, g, !!s.pressed[g] || anyoneIn(s, x, y));
      } else if (ch >= 'a' && ch <= 'd') {
        const g = ch.charCodeAt(0) - 96;
        drawBridge(ctx, st, raw, x, y, X, Y, k, g, !!s.pressed[g]);
      } else if (ch === 'K') {
        const idx = piano ? (x - piano.x) : x;
        drawKey(ctx, s, x, y, X, Y, k, standing(s, x, y), idx, raw(x, y - 1) !== 'K', raw(x - 1, y) === 'K');
      } else if (ch === '$') {
        const bob = Math.sin(t * 3 + x) * k * 0.06;
        glow(ctx, X + k / 2, Y + k / 2 + bob, k * 0.9, '#ffd43b', 0.6);
        drawStar(ctx, X + k / 2, Y + k / 2 + bob, k * 0.32);
      } else if (ch === 'v') drawVine(ctx, raw, x, y, X, Y, k, t);
    }
  }
  for (const [st, list] of ripples) {
    ctx.beginPath();
    for (const [x, y, X, Y] of list) st.ripple(ctx, x, y, X, Y, k, t);
    ctx.strokeStyle = st.rippleStyle; ctx.lineWidth = Math.max(1.2, k * 0.035); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
  }

  // entities and players, back to front
  const inView = (e) => e.x === undefined || (e.x >= x0 - 4 && e.x <= x1 + 4 && e.y >= y0 - 4 && e.y <= y1 + 4);
  const ents = s.ents.filter((e) => e.type !== 'gate' && e.type !== 'piano' && inView(e));
  for (const e of ents) drawFlatEnt(ctx, s, styleOf(zoneOf(s, Math.floor(e.x), Math.floor(e.y))), e, sx, sy, k, t);
  const items = [];
  for (const e of ents) if (e.type !== 'stone' && e.type !== 'spring') items.push([e.type === 'ball' ? e.y + C.BALL_R : sortY(e), 0, e]);
  for (const p of s.players) items.push([p.y + 0.35 + (p.fly ? 3 : 0), 1, p]);
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, kind, o] of items) {
    const st = styleOf(zoneOf(s, Math.floor(o.x), Math.floor(o.y)));
    if (kind) drawPlayer(ctx, s, st, o, sx, sy, k, t);
    else drawEnt(ctx, s, st, o, sx, sy, k, t, H);
  }

  // nails
  for (const n of s.nails || []) {
    const x = sx(n.x), y = sy(n.y) - k * 0.45, dx = n.dx * k * 0.3, dy = n.dy * k * 0.3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(3, k * 0.1); ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x, y); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // effects (tile units, like the side game)
  for (const f of fx || []) {
    ctx.globalAlpha = clamp01(f.life / f.max);
    if (f.kind === 'heart') heart(ctx, sx(f.x), sy(f.y), k * 0.18, f.color);
    else if (f.kind === 'ring') { ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), k * (1.2 - f.life / f.max) * 1.4, 0, TAU); ctx.stroke(); }
    else { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), k * 0.07, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  for (const e of ents) drawEntLabels(ctx, s, e, sx, sy, k, t, H);

  // the screen: frozen time, then each nearby style's own finish, weighted (a crossfade at borders)
  if (s.frozen) {
    ctx.fillStyle = 'rgba(170,215,255,0.2)'; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, '#e7f5ff', 0.6, 0.5);
  }
  for (const [st, a] of blend) st.overlay(ctx, W, H, t, a);
}

// ---------------------------------------------------------------- camera (view state, not sim state)

export function makeTDCamera(s) {
  const c = { x: 0, y: 0, scale: 40 };
  return snapTDCamera(c, s, 1280, 720, true);
}

// Frame both living players; zoom out as they part. Fitted to the SHORT side so a portrait phone
// sees as much as a landscape screen does across; clamped to the map.
export function snapTDCamera(c, s, W, H, instant = false) {
  const live = s.players.filter((p) => !p.dead);
  const ps = live.length ? live : s.players;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ps) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const base = Math.min(W, H) / VIEW_TILES;
  const needW = maxX - minX + 7, needH = maxY - minY + 6;
  const scale = Math.max(base * 0.45, Math.min(base, W / needW, H / needH));
  let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2 - 0.3;
  const halfW = W / 2 / scale, halfH = H / 2 / scale;
  tx = s.w > halfW * 2 ? Math.min(Math.max(tx, halfW), s.w - halfW) : s.w / 2;
  ty = s.h > halfH * 2 ? Math.min(Math.max(ty, halfH), s.h - halfH) : s.h / 2;
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(scale)) return c;
  const a = instant ? 1 : 0.12;
  c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.scale += (scale - c.scale) * a;
  return c;
}
