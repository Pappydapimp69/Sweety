// The Kitchen, drawn. Only reads the sim. Seen from above, slightly tilted: a pink-and-
// cream tiled counter at night, cabinet walls, drops to the dark floor far below.
// Juice lives here and in main.js: blast flashes, a camera punch, glowing syrup,
// burning caramel, and the pantry's dark with holes of firelight.
import * as C from './config.js';
import { lights, queenOf } from './sim.js';
import { drawCharacter, PLAYER_COLORS } from '../render.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const VIEW = 15;   // tiles across the short side at rest

// ---------------------------------------------------------------- camera (view state)

export function makeKCamera(s) { return snapKCamera({ x: 0, y: 0, scale: 40, punch: 0 }, s, 1280, 720, true); }
export function snapKCamera(c, s, W, H, instant = false) {
  const ps = s.players.filter((p) => !p.down && !p.fall);
  const use = ps.length ? ps : s.players;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of use) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const q = queenOf(s);
  if (q && q.state !== 'sleep' && !q.dead) { x0 = Math.min(x0, q.x - 1); x1 = Math.max(x1, q.x + 1); }
  const base = Math.min(W, H) / VIEW;
  const scale = Math.max(base * 0.5, Math.min(base, W / (x1 - x0 + 8), H / (y1 - y0 + 6)));
  let tx = (x0 + x1) / 2 + 1.2, ty = (y0 + y1) / 2;
  const hw = W / 2 / scale, hh = H / 2 / scale;
  tx = Math.min(Math.max(tx, hw), s.w - hw);
  ty = s.h > hh * 2 ? Math.min(Math.max(ty, hh), s.h - hh) : s.h / 2;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return c;
  const a = instant ? 1 : 0.1;
  c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.scale += (scale - c.scale) * a;
  c.punch = (c.punch || 0) * 0.85;
  return c;
}
export function punch(c, n) { c.punch = Math.max(c.punch || 0, n); }

// ---------------------------------------------------------------- helpers

function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
function shadow(ctx, x, y, rx, ry, a = 0.35) { ctx.fillStyle = `rgba(40,20,30,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }

// ---------------------------------------------------------------- the world

const FLOOR = ['#fff4e6', '#ffe3ec'];
function drawTiles(ctx, s, k, sx, sy, x0, x1, y0, y1) {
  for (let y = Math.max(0, y0); y <= Math.min(s.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(s.w - 1, x1); x++) {
      const t = s.grid[y][x], X = sx(x), Y = sy(y);
      if (t === 'o') {   // a drop: the dark floor far below, a lip of counter at the top edge
        ctx.fillStyle = '#2b1d3a'; ctx.fillRect(X, Y, k + 1, k + 1);
        if (hash(x, y) < 0.15) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X + k * 0.3, Y + k * 0.4, k * 0.4, k * 0.25); }
        if (s.grid[y - 1] && s.grid[y - 1][x] !== 'o') { ctx.fillStyle = '#c9a28a'; ctx.fillRect(X, Y, k + 1, k * 0.22); }
        continue;
      }
      if (t === '#' || t === ';') {
        const shelf = t === ';';
        ctx.fillStyle = shelf ? '#7d5a44' : '#a8745a'; ctx.fillRect(X, Y, k + 1, k + 1);
        ctx.fillStyle = shelf ? '#94705a' : '#c48b6c'; ctx.fillRect(X, Y, k + 1, k * 0.7);
        ctx.strokeStyle = 'rgba(60,30,20,0.35)'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.strokeRect(X + k * 0.08, Y + k * 0.08, k * 0.84, k * 0.55);
        if (!shelf && hash(x, y) < 0.3) { ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(X + k * 0.5, Y + k * 0.35, k * 0.06, 0, TAU); ctx.fill(); }
        continue;
      }
      ctx.fillStyle = FLOOR[(x + y) & 1]; ctx.fillRect(X, Y, k + 1, k + 1);
      ctx.fillStyle = 'rgba(200,150,160,0.18)'; ctx.fillRect(X, Y + k - 1, k + 1, 1); ctx.fillRect(X + k - 1, Y, 1, k + 1);
      if (t === 'c') {   // a sugar cube
        shadow(ctx, X + k * 0.55, Y + k * 0.92, k * 0.45, k * 0.12);
        ctx.fillStyle = '#ffffff'; rrect(ctx, X + k * 0.06, Y - k * 0.12, k * 0.88, k * 0.88, k * 0.12); ctx.fill();
        ctx.fillStyle = '#e9ecef'; ctx.fillRect(X + k * 0.06, Y + k * 0.58, k * 0.88, k * 0.18);
        ctx.fillStyle = 'rgba(180,200,255,0.5)';
        for (let i = 0; i < 4; i++) ctx.fillRect(X + k * (0.2 + hash(x, y + i) * 0.6), Y + k * (0.0 + hash(x + i, y) * 0.5), k * 0.06, k * 0.06);
      } else if (t === 'D' || t === 'E') {   // candy doors
        ctx.fillStyle = t === 'D' ? '#ff6b9d' : '#9775fa'; ctx.fillRect(X + k * 0.1, Y - k * 0.2, k * 0.8, k * 1.2);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(X + k * 0.1, Y + k * (i * 0.4 - 0.2)); ctx.lineTo(X + k * 0.9, Y + k * (i * 0.4)); ctx.lineTo(X + k * 0.9, Y + k * (i * 0.4 + 0.15)); ctx.lineTo(X + k * 0.1, Y + k * (i * 0.4 - 0.05)); ctx.fill(); }
      }
    }
  }
}

function drawPuddle(ctx, pd, X, Y, k, t) {
  const r = C.PUDDLE_R * k;
  if (pd.burn > 0) {   // caramel burning: a glow and licking flames
    const f = clamp01(pd.burn / C.BURN_TIME);
    glow(ctx, X, Y, r * 2.6, 'rgba(255,170,60,0.9)', 0.55 * f + 0.2);
    ctx.fillStyle = '#7a3b10'; ctx.beginPath(); ctx.ellipse(X, Y, r, r * 0.7, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 1.3, fx = X + Math.cos(a) * r * 0.55, fy = Y + Math.sin(a) * r * 0.35;
      const h = k * (0.35 + 0.25 * Math.sin(t * 13 + i * 2)) * (0.4 + f);
      ctx.fillStyle = i % 2 ? '#ffd43b' : '#ff922b';
      ctx.beginPath(); ctx.moveTo(fx - k * 0.1, fy); ctx.quadraticCurveTo(fx, fy - h * 1.4, fx + k * 0.1, fy); ctx.fill();
    }
    return;
  }
  const fade = clamp01(pd.life / 2);
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = '#e8590c'; ctx.beginPath(); ctx.ellipse(X, Y, r, r * 0.7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.ellipse(X - r * 0.1, Y - r * 0.08, r * 0.8, r * 0.52, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(X - r * 0.35, Y - r * 0.25, r * 0.22, r * 0.1, -0.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawAnt(ctx, e, X, Y, k, t) {
  const soldier = e.kind === 'soldier', sc = soldier ? 1.25 : 1, L = k * 0.32 * sc;
  shadow(ctx, X, Y + k * 0.25, L * 1.3, L * 0.45, 0.3);
  const ang = Math.atan2(e.vy, e.vx || 1e-6), walk = Math.sin(t * 18 + e.i) * 0.4;
  ctx.save(); ctx.translate(X, Y); ctx.rotate(ang);
  ctx.strokeStyle = '#2b1d1a'; ctx.lineWidth = Math.max(1.5, k * 0.04);
  for (const sgn of [-1, 1]) for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(i * L * 0.5, 0); ctx.lineTo(i * L * 0.5 + Math.cos(walk * sgn * (i ? 1 : -1)) * L * 0.3, sgn * L * 0.85); ctx.stroke();
  }
  const body = soldier ? '#c92a2a' : '#3b2a26';
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(-L * 0.75, 0, L * 0.55, L * 0.42, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, L * 0.32, L * 0.26, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(L * 0.6, 0, L * 0.38, L * 0.34, 0, 0, TAU); ctx.fill();
  if (soldier) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-L * 0.85, -L * 0.15, L * 0.25, L * 0.12, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(L * 0.75, -L * 0.15, L * 0.1, 0, TAU); ctx.arc(L * 0.75, L * 0.15, L * 0.1, 0, TAU); ctx.fill();
  ctx.restore();
  coatOverlay(ctx, e, X, Y, L * 1.4, t);
  if (e.hp < e.max) bar(ctx, X, Y - k * 0.6, k * 0.7, e.hp / e.max, soldier ? '#ff8787' : '#ffd43b');
}
function coatOverlay(ctx, e, X, Y, r, t) {
  if (!e.coat) return;
  ctx.globalAlpha = 0.35 + e.coat * 0.15;
  ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.ellipse(X, Y, r, r * 0.75, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < e.coat; i++) { ctx.fillStyle = '#ffa94d'; ctx.beginPath(); ctx.arc(X + (i - (e.coat - 1) / 2) * r * 0.5, Y + r * 0.8 + Math.sin(t * 4 + i) * 2, r * 0.12, 0, TAU); ctx.fill(); }
}
function bar(ctx, X, Y, w, f, color) {
  ctx.fillStyle = 'rgba(30,20,40,0.6)'; ctx.fillRect(X - w / 2, Y, w, 5);
  ctx.fillStyle = color; ctx.fillRect(X - w / 2, Y, w * clamp01(f), 5);
}

function drawNest(ctx, e, X, Y, k, t) {
  const r = k * 0.95;
  shadow(ctx, X, Y + r * 0.45, r * 1.1, r * 0.35, 0.35);
  ctx.fillStyle = '#c08552'; ctx.beginPath(); ctx.ellipse(X, Y, r, r * 0.75, 0, Math.PI, 0); ctx.ellipse(X, Y, r, r * 0.3, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#d9a066';
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(X + (hash(e.i, i) - 0.5) * r * 1.5, Y - hash(i, e.i) * r * 0.6, k * 0.09, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#2b1d1a'; ctx.beginPath(); ctx.ellipse(X, Y - r * 0.3, r * 0.3, r * 0.18, 0, 0, TAU); ctx.fill();
  coatOverlay(ctx, e, X, Y - r * 0.2, r * 0.9, t);
  bar(ctx, X, Y - r * 1.05, k * 1.2, e.hp / e.max, '#ff8787');
}

function drawQueen(ctx, q, X, Y, k, t) {
  const r = q.r * k;
  const shake = q.state === 'aim' ? Math.sin(t * 60) * k * 0.06 : 0;
  shadow(ctx, X, Y + r * 0.6, r * 1.3, r * 0.4, 0.45);
  ctx.save(); ctx.translate(X + shake, Y);
  if (q.state === 'charge') { ctx.globalAlpha = 0.3; ctx.fillStyle = '#c92a2a'; ctx.beginPath(); ctx.ellipse(-(q.tx - q.x) * 0.1 * k, -(q.ty - q.y) * 0.1 * k, r, r * 0.8, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = '#2b1d1a'; ctx.lineWidth = Math.max(2, k * 0.08);
  for (const sgn of [-1, 1]) for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.4, 0); ctx.lineTo(i * r * 0.6 + Math.sin(t * 6 + i) * r * 0.1, sgn * r * 1.05); ctx.stroke(); }
  ctx.fillStyle = q.angry ? '#a61e4d' : '#862e9c';
  ctx.beginPath(); ctx.ellipse(-r * 0.55, r * 0.05, r * 0.75, r * 0.6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.35, 0, r * 0.38, r * 0.34, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.85, 0, r * 0.32, r * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.7, -r * 0.25, r * 0.35, r * 0.15, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd43b';   // her crown
  ctx.beginPath(); ctx.moveTo(r * 0.65, -r * 0.3); for (let i = 0; i <= 4; i++) ctx.lineTo(r * (0.65 + i * 0.1), -r * (i % 2 ? 0.62 : 0.38)); ctx.lineTo(r * 1.05, -r * 0.3); ctx.fill();
  ctx.fillStyle = q.state === 'stun' ? '#ffffff' : '#ff6b6b'; ctx.beginPath(); ctx.arc(r * 1.0, -r * 0.08, r * 0.07, 0, TAU); ctx.arc(r * 1.0, r * 0.1, r * 0.07, 0, TAU); ctx.fill();
  ctx.restore();
  if (q.state === 'stun') for (let i = 0; i < 3; i++) { const a = t * 4 + (i * TAU) / 3; ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(X + Math.cos(a) * r * 0.7, Y - r * 0.9 + Math.sin(a) * r * 0.2, k * 0.08, 0, TAU); ctx.fill(); }
  coatOverlay(ctx, q, X, Y, r * 1.2, t);
}

function drawPlayer(ctx, p, sx, sy, k, t) {
  if (p.down) {   // knocked out: a little ghost going up
    const f = clamp01(p.down / C.DOWN_TIME);
    ctx.globalAlpha = f; ctx.fillStyle = PLAYER_COLORS[p.id];
    ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y) - (1 - f) * k * 2, k * 0.25, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    return;
  }
  if (p.fall) {
    const f = clamp01(p.fall / C.FALL_TIME);
    ctx.globalAlpha = f; drawCharacter(ctx, p.id, sx(p.x) - k * 0.4 * f, sy(p.y) - k * 0.9 * f, k * 0.8 * f, k * 1.05 * f, { t, k: k * f }); ctx.globalAlpha = 1;
    return;
  }
  const up = p.fly ? Math.sin(Math.PI * clamp01(p.fly.t / p.fly.dur)) * k * 2.2 : 0;
  shadow(ctx, sx(p.x), sy(p.y) + k * 0.28, k * 0.38 / (1 + up / k), k * 0.13 / (1 + up / k), 0.4);
  const blink = p.hurt > 0 && Math.floor(t * 20) % 2 === 0;
  const h = 1.1 * k, w = 0.82 * k;
  drawCharacter(ctx, p.id, sx(p.x) - w / 2, sy(p.y) + k * 0.3 - h - up, w, h, {
    facing: p.fx < -0.1 ? -1 : p.fx > 0.1 ? 1 : p.id ? -1 : 1, t, moving: Math.abs(p.vx) + Math.abs(p.vy) > 0.5, airborne: up > 0,
    alpha: blink ? 0.35 : 1, k: h / 1.25, power: 'none',
  });
  // the gun, pointing where it aims
  const gx = sx(p.x) + p.fx * k * 0.45, gy = sy(p.y) - k * 0.35 - up + p.fy * k * 0.3;
  ctx.fillStyle = p.id ? '#e8590c' : '#fcc419';
  ctx.beginPath(); ctx.arc(gx, gy, k * 0.12, 0, TAU); ctx.fill();
  if (p.id === 0) glow(ctx, gx, gy, k * 0.4, 'rgba(255,230,120,0.9)', 0.5 + 0.3 * Math.sin(t * 20));
  if (p.roll > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x - p.rx * 1.2), sy(p.y - p.ry * 1.2)); ctx.stroke(); }
}

// ---------------------------------------------------------------- the frame

export function drawKitchen(ctx, s, cam, W, H, fx = [], t = s.time) {
  const k = cam.scale * (1 + (cam.punch || 0) * 0.06);
  const sx = (x) => (x - cam.x) * k + W / 2, sy = (y) => (y - cam.y) * k + H / 2;
  const x0 = Math.floor(cam.x - W / 2 / k) - 1, x1 = Math.ceil(cam.x + W / 2 / k) + 1;
  const y0 = Math.floor(cam.y - H / 2 / k) - 1, y1 = Math.ceil(cam.y + H / 2 / k) + 1;
  ctx.fillStyle = '#3a2a3f'; ctx.fillRect(0, 0, W, H);
  drawTiles(ctx, s, k, sx, sy, x0, x1, y0, y1);

  // the anniversary cake, in the middle of the Queen's counter
  if (x1 > 158 && x0 < 176) {
    const X = sx(166.5), Y = sy(6.6), r = k * 2.2;
    shadow(ctx, X, Y + r * 0.55, r * 1.1, r * 0.35, 0.3);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(X, Y + r * 0.3, r, r * 0.42, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fcc2d7'; ctx.fillRect(X - r, Y - r * 0.2, r * 2, r * 0.5);
    ctx.fillStyle = '#ffdeeb'; ctx.beginPath(); ctx.ellipse(X, Y - r * 0.2, r, r * 0.42, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.fillStyle = '#ff6b9d'; ctx.beginPath(); ctx.arc(X + Math.cos(a) * r * 0.65, Y - r * 0.2 + Math.sin(a) * r * 0.25, k * 0.16, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(X - k * 0.06, Y - r * 0.75, k * 0.12, r * 0.5);
    glow(ctx, X, Y - r * 0.8, k * 0.8, 'rgba(255,220,120,1)', 0.6 + 0.2 * Math.sin(t * 7));
  }
  for (const pd of s.puddles) drawPuddle(ctx, pd, sx(pd.x), sy(pd.y), k, t);
  // spit warnings: a shrinking ring that says where
  for (const w of s.warns) {
    const f = clamp01(w.t / w.max);
    ctx.fillStyle = `rgba(130,201,30,${0.18 + (1 - f) * 0.25})`; ctx.beginPath(); ctx.arc(sx(w.x), sy(w.y), w.r * k, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#82c91e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(w.x), sy(w.y), w.r * k * f, 0, TAU); ctx.stroke();
  }
  const q = queenOf(s);
  if (q && q.state === 'aim') {   // her charge line
    ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.lineWidth = q.r * k * 1.6; ctx.lineCap = 'round';
    ctx.setLineDash([k * 0.4, k * 0.3]); ctx.beginPath(); ctx.moveTo(sx(q.x), sy(q.y)); ctx.lineTo(sx(q.tx), sy(q.ty)); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
  }

  // things, back to front
  const items = [];
  for (const e of s.ents) {
    if (e.dead || e.x < x0 - 3 || e.x > x1 + 3) continue;
    if (['ant', 'nest', 'queen', 'switch', 'gallery', 'cp', 'sign'].includes(e.type)) items.push([e.y, e]);
  }
  for (const p of s.players) items.push([p.y + 0.01, p]);
  items.sort((a, b) => a[0] - b[0]);
  for (const [, o] of items) {
    if (o.id !== undefined && o.hp !== undefined && o.type === undefined) { drawPlayer(ctx, o, sx, sy, k, t); continue; }
    const X = sx(o.x), Y = sy(o.y);
    switch (o.type) {
      case 'ant': drawAnt(ctx, o, X, Y, k, t); break;
      case 'nest': drawNest(ctx, o, X, Y, k, t); break;
      case 'queen': drawQueen(ctx, o, X, Y, k, t); break;
      case 'switch': {
        ctx.fillStyle = '#f1f3f5'; rrect(ctx, X - k * 0.35, Y - k * 0.9, k * 0.7, k * 1.0, k * 0.1); ctx.fill();
        ctx.fillStyle = o.on ? '#51cf66' : '#ff6b6b'; rrect(ctx, X - k * 0.12, Y - k * (o.on ? 0.8 : 0.5), k * 0.24, k * 0.35, k * 0.05); ctx.fill();
        if (!o.on) glow(ctx, X, Y - k * 0.4, k * 1.4, 'rgba(255,240,180,0.9)', 0.35 + 0.15 * Math.sin(t * 4));
        break;
      }
      case 'cp': {   // a little flag
        ctx.strokeStyle = '#868e96'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, Y + k * 0.3); ctx.lineTo(X, Y - k * 0.8); ctx.stroke();
        ctx.fillStyle = o.reached ? '#ff6b9d' : '#ced4da'; ctx.beginPath(); ctx.moveTo(X, Y - k * 0.8); ctx.lineTo(X + k * 0.45, Y - k * 0.65); ctx.lineTo(X, Y - k * 0.5); ctx.fill();
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#e9c46a'; rrect(ctx, X - k * 0.3, Y - k * 0.75, k * 0.6, k * 0.42, k * 0.06); ctx.fill();
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(X - k * 0.03, Y - k * 0.33, k * 0.06, k * 0.4);
        ctx.fillStyle = '#6d4c41'; ctx.font = `bold ${Math.round(k * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', X, Y - k * 0.43); ctx.textAlign = 'left';
        break;
      }
      case 'gallery': {
        ctx.fillStyle = o.phase === 'idle' ? 'rgba(255,107,157,0.5)' : 'rgba(255,212,59,0.6)';
        rrect(ctx, X - k * 1.3, Y - k * 0.45, k * 2.6, k * 0.9, k * 0.2); ctx.fill();
        for (const tg of o.targets) {   // sprinkles sliding along the back wall
          const tx = sx(tg.x), ty = sy(tg.y);
          ctx.save(); ctx.translate(tx, ty); ctx.rotate(t * 3 + tg.c);
          ctx.fillStyle = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ffa94d'][tg.c];
          rrect(ctx, -k * 0.3, -k * 0.1, k * 0.6, k * 0.2, k * 0.1); ctx.fill(); ctx.restore();
        }
        if (o.phase !== 'idle') {
          ctx.font = `bold ${Math.round(k * 0.5)}px sans-serif`; ctx.textAlign = 'center';
          ctx.fillStyle = PLAYER_COLORS[0]; ctx.fillText(`${o.score[0]}`, X - k * 2.2, Y + k * 0.2);
          ctx.fillStyle = PLAYER_COLORS[1]; ctx.fillText(`${o.score[1]}`, X + k * 2.2, Y + k * 0.2);
          ctx.fillStyle = '#ffffff'; if (o.phase === 'run') ctx.fillText(`${Math.ceil(o.t)}`, X, Y - k * 0.7);
          ctx.textAlign = 'left';
        }
        break;
      }
      default: break;
    }
  }

  // shots
  for (const b of s.shots) {
    const X = sx(b.x), Y = sy(b.y) - k * 0.35;
    if (b.kind === 'syrup') {
      ctx.fillStyle = '#e8590c'; ctx.beginPath(); ctx.arc(X, Y, k * 0.17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffa94d'; ctx.beginPath(); ctx.arc(X - k * 0.04, Y - k * 0.04, k * 0.08, 0, TAU); ctx.fill();
    } else {
      glow(ctx, X, Y, k * 0.6, 'rgba(255,240,150,1)', 0.8);
      ctx.strokeStyle = '#fff3bf'; ctx.lineWidth = Math.max(2, k * 0.06);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - b.dx * k * 0.5, Y - b.dy * k * 0.5); ctx.stroke();
    }
  }

  // effects (from main.js: tile units)
  for (const f of fx) {
    const a = clamp01(f.life / f.max);
    if (f.kind === 'blast') {   // a caramel blast: flash, ring, smoke
      const u = 1 - a, X = sx(f.x), Y = sy(f.y);
      glow(ctx, X, Y, f.r * k * (1.2 + u), 'rgba(255,200,90,1)', a);
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = Math.max(2, k * 0.12 * a);
      ctx.beginPath(); ctx.arc(X, Y, f.r * k * (0.3 + u * 0.9), 0, TAU); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = a; ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), k * (f.size || 0.08), 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // the pantry's dark: firelight cuts holes in it
  if (s.dark) drawDark(ctx, s, W, H, k, sx, sy, t);
}

let darkCanvas = null;
function drawDark(ctx, s, W, H, k, sx, sy, t) {
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return;
  if (!darkCanvas || darkCanvas.width !== W || darkCanvas.height !== H) {
    darkCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  }
  const d = darkCanvas.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.fillStyle = 'rgba(8,4,20,0.94)'; d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  for (const [x, y, r] of lights(s)) {
    const R = r * k * (1 + 0.04 * Math.sin(t * 9 + x));
    const g = d.createRadialGradient(sx(x), sy(y), R * 0.2, sx(x), sy(y), R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g; d.fillRect(sx(x) - R, sy(y) - R, R * 2, R * 2);
  }
  ctx.drawImage(darkCanvas, 0, 0);
}
