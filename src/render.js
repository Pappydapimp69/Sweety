// Draws. Never writes to the sim state it is handed (tests/render.test.mjs checks).
// Purely presentational extras (blink, walk bob, trails) are derived from sim
// state and the time passed in, never stored on it.
import { SUGAR, SPICE, isLit, lightRadius, doorOpen, powerOf } from './sim.js';

export const THEMES = {
  day: { sky: ['#8fd3ff', '#e9f8ff'], top: '#7cc36b', dirt: '#b07c52', dirt2: '#9c6b44', back: 'hills' },
  workshop: { sky: ['#f6dfb5', '#e7b97c'], top: '#c58b4f', dirt: '#8b5a2b', dirt2: '#7a4e25', back: 'shelves' },
  night: { sky: ['#0b1030', '#1d2656'], top: '#4d5a8a', dirt: '#2c3550', dirt2: '#262e46', back: 'stars' },
  attic: { sky: ['#5b4366', '#a07a8f'], top: '#c9a27e', dirt: '#6d4c41', dirt2: '#5d4037', back: 'beams' },
  sky: { sky: ['#5fb4ff', '#d8f0ff'], top: '#ffffff', dirt: '#b8c7d9', dirt2: '#a7b8cc', back: 'clouds' },
  clock: { sky: ['#1f3b4d', '#3d6b73'], top: '#d4a64a', dirt: '#5b4a3a', dirt2: '#4e3f31', back: 'gears' },
  home: { sky: ['#ffb3c1', '#ffe5b4'], top: '#f4978e', dirt: '#b5838d', dirt2: '#a5737d', back: 'hills' },
};
export const GROUP_COLORS = [null, '#ff6b6b', '#4dabf7', '#ffd43b', '#b197fc'];
export const PLAYER_COLORS = ['#ff7eb6', '#2ec4b6'];
const SOLID = '#Lx%V';

let dark = null;   // offscreen canvas for the night

export function textPx(H) { return Math.max(14, Math.round(H * 0.024)); }

export function drawWorld(ctx, s, cam, W, H, fx, theme = 'day', t = s.time) {
  const T = THEMES[theme] || THEMES.day;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawBackdrop(ctx, cam, W, H, T.back, t);

  const k = cam.scale;
  const ox = W / 2 - cam.x * k, oy = H / 2 - cam.y * k;
  const sx = (x) => ox + x * k, sy = (y) => oy + y * k;

  const x0 = Math.max(0, Math.floor(cam.x - W / 2 / k) - 1), x1 = Math.min(s.w - 1, Math.ceil(cam.x + W / 2 / k) + 1);
  const y0 = Math.max(0, Math.floor(cam.y - H / 2 / k) - 1), y1 = Math.min(s.h - 1, Math.ceil(cam.y + H / 2 / k) + 1);

  // vent wind behind everything
  for (const v of s.vents) {
    if (v.x < x0 || v.x > x1) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1.5, k * 0.05);
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 1.6 + i / 4) % 1);
      const yy = v.bottom - ph * (v.bottom - v.top);
      const xx = v.x + 0.2 + i * 0.2 + Math.sin(t * 5 + i) * 0.05;
      ctx.beginPath(); ctx.moveTo(sx(xx), sy(yy)); ctx.lineTo(sx(xx), sy(yy - 0.8)); ctx.stroke();
    }
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = s.grid[y][x];
      if (c === '.') continue;
      drawTile(ctx, s, c, x, y, sx(x), sy(y), k, T, t);
    }
  }

  for (const e of s.ents) drawEnt(ctx, s, e, sx, sy, k, t);

  // pins and flying pins
  for (const p of s.pins) {
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(sx(p.x), sy(p.y) - k * 0.06, k, k * 0.14);
    ctx.fillStyle = '#7d8590';
    const head = s.grid[Math.floor(p.y)] && SOLID.includes(s.grid[Math.floor(p.y)][p.x + 1] || '') ? p.x + 1 - 0.12 : p.x;
    ctx.fillRect(sx(head), sy(p.y) - k * 0.12, k * 0.12, k * 0.26);
  }
  ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = Math.max(2, k * 0.08);
  for (const sh of s.shots) {
    ctx.beginPath(); ctx.moveTo(sx(sh.x - sh.dir * 0.5), sy(sh.y)); ctx.lineTo(sx(sh.x), sy(sh.y)); ctx.stroke();
  }

  // gusts
  for (const gu of s.gusts) {
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * gu.life / 0.3})`; ctx.lineWidth = Math.max(2, k * 0.07);
    const span = gu.x1 - gu.x0, prog = 1 - gu.life / 0.3;
    for (let i = 0; i < 5; i++) {
      const yy = gu.y0 + (i + 0.5) * (gu.y1 - gu.y0) / 5;
      const xa = gu.dir > 0 ? gu.x0 + span * prog * 0.8 : gu.x1 - span * prog * 0.8;
      ctx.beginPath(); ctx.moveTo(sx(xa), sy(yy)); ctx.lineTo(sx(xa + gu.dir * 1.6), sy(yy + Math.sin(i) * 0.2)); ctx.stroke();
    }
  }

  // mini-game drops
  for (const d of s.drops) {
    if (d.kind === 'rock') { ctx.fillStyle = '#6c757d'; ctx.beginPath(); ctx.arc(sx(d.x), sy(d.y), k * 0.3, 0, Math.PI * 2); ctx.fill(); }
    else heart(ctx, sx(d.x), sy(d.y), k * (d.kind === 'gold' ? 0.34 : 0.26), d.kind === 'gold' ? '#ffd43b' : '#ff4d6d');
  }

  if (lightRadius(s)) drawNight(ctx, s, W, H, k, sx, sy);

  for (const p of s.players) drawPlayer(ctx, s, p, sx, sy, k, t);
  if (s.mode === 'potato' && s.holder >= 0) drawPotato(ctx, s, sx, sy, k, t);

  if (s.flood) drawFlood(ctx, s, W, H, sy, t);
  if (s.frozen) { ctx.fillStyle = 'rgba(120, 190, 255, 0.12)'; ctx.fillRect(0, 0, W, H); }
  drawFx(ctx, fx, sx, sy, k);
}

function drawBackdrop(ctx, cam, W, H, kind, t) {
  ctx.save();
  const wrap = (v, m) => ((v % m) + m) % m;
  if (kind === 'stars') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const x = wrap(i * 397.3 - cam.x * cam.scale * 0.1, W);
      const y = (i * 151.7) % (H * 0.6);
      const tw = 1.5 + Math.sin(t * 2 + i) * 0.7;
      ctx.fillRect(x, y, tw, tw);
    }
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'shelves') {
    ctx.fillStyle = 'rgba(139,90,43,0.15)';
    for (let i = 0; i < 6; i++) ctx.fillRect(wrap(i * 520 - cam.x * cam.scale * 0.25, W + 600) - 300, H * 0.35 + (i % 2) * 60, 320, 18);
  } else if (kind === 'beams') {
    ctx.fillStyle = 'rgba(60, 35, 30, 0.25)';
    for (let i = 0; i < 8; i++) ctx.fillRect(wrap(i * 260 - cam.x * cam.scale * 0.3, W + 300) - 150, 0, 40, H);
    ctx.fillStyle = 'rgba(255, 240, 200, 0.12)';
    ctx.beginPath(); ctx.moveTo(W * 0.15, 0); ctx.lineTo(W * 0.35, 0); ctx.lineTo(W * 0.55, H); ctx.lineTo(W * 0.25, H); ctx.fill();
  } else if (kind === 'clouds') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 9; i++) {
      const x = wrap(i * 330 - cam.x * cam.scale * 0.15 + t * 6, W + 400) - 200;
      const y = 40 + (i % 4) * (H * 0.18);
      ctx.beginPath(); ctx.ellipse(x, y, 90, 26, 0, 0, Math.PI * 2); ctx.ellipse(x + 50, y - 14, 60, 28, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'gears') {
    ctx.strokeStyle = 'rgba(212, 166, 74, 0.18)'; ctx.lineWidth = 10;
    for (let i = 0; i < 5; i++) {
      const x = wrap(i * 420 - cam.x * cam.scale * 0.2, W + 400) - 200, y = H * (0.25 + (i % 3) * 0.22), r = 60 + (i % 3) * 30;
      gearPath(ctx, x, y, r, 10, t * (i % 2 ? 0.3 : -0.3)); ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(80,170,90,0.25)';
    for (let i = 0; i < 6; i++) {
      const x = wrap(i * 520 - cam.x * cam.scale * 0.25, W + 600) - 300;
      ctx.beginPath(); ctx.ellipse(x, H * 0.85, 360, 220, 0, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      const x = wrap(i * 430 - cam.x * cam.scale * 0.1 + t * 4, W + 300) - 150;
      const y = 50 + (i % 3) * 55;
      ctx.beginPath(); ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2); ctx.ellipse(x + 35, y - 10, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
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
  else if (g === 2) ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else if (g === 3) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); }
  else { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
}

function drawTile(ctx, s, c, x, y, px, py, k, T, t) {
  const above = y > 0 ? s.grid[y - 1][x] : '.';
  const below = y + 1 < s.h ? s.grid[y + 1][x] : '.';
  switch (c) {
    case '#': {
      ctx.fillStyle = (x + y) % 2 ? T.dirt : T.dirt2;
      ctx.fillRect(px, py, k + 1, k + 1);
      if (!SOLID.includes(above)) { ctx.fillStyle = T.top; ctx.fillRect(px, py, k + 1, k * 0.28); }
      if (!SOLID.includes(below) && y + 1 < s.h) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px, py + k * 0.82, k + 1, k * 0.18); }
      break;
    }
    case 'L': {
      ctx.fillStyle = '#5c6370'; ctx.fillRect(px, py, k + 1, k + 1);
      ctx.fillStyle = '#ffa94d'; ctx.fillRect(px, py, k + 1, k * 0.22);
      ctx.fillStyle = '#ffe8cc';
      ctx.beginPath(); ctx.moveTo(px + k * 0.5, py + k * 0.32); ctx.lineTo(px + k * 0.78, py + k * 0.7); ctx.lineTo(px + k * 0.22, py + k * 0.7); ctx.fill();
      break;
    }
    case 'V': {
      ctx.fillStyle = '#495057'; ctx.fillRect(px, py, k + 1, k + 1);
      ctx.fillStyle = '#adb5bd';
      for (let i = 0; i < 4; i++) ctx.fillRect(px + k * (0.1 + i * 0.22), py + k * 0.1, k * 0.1, k * 0.5);
      break;
    }
    case 'x': {
      ctx.fillStyle = '#c8873e'; ctx.fillRect(px + 1, py + 1, k - 2, k - 2);
      ctx.strokeStyle = '#7a4e25'; ctx.lineWidth = Math.max(1, k * 0.07);
      ctx.strokeRect(px + k * 0.08, py + k * 0.08, k * 0.84, k * 0.84);
      ctx.beginPath(); ctx.moveTo(px + k * 0.1, py + k * 0.1); ctx.lineTo(px + k * 0.9, py + k * 0.9); ctx.stroke();
      break;
    }
    case '%': {
      ctx.fillStyle = 'rgba(180, 230, 255, 0.55)'; ctx.fillRect(px + k * 0.15, py, k * 0.7, k + 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, k * 0.05);
      ctx.beginPath(); ctx.moveTo(px + k * 0.3, py + k * 0.15); ctx.lineTo(px + k * 0.5, py + k * 0.45); ctx.stroke();
      break;
    }
    case '^': case 'v': {
      const up = c === '^';
      ctx.fillStyle = '#e9ecef'; ctx.strokeStyle = '#495057'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const base = up ? py + k : py, tip = up ? py + k * 0.4 : py + k * 0.6;
        ctx.moveTo(px + k * (i / 3), base); ctx.lineTo(px + k * (i / 3 + 1 / 6), tip); ctx.lineTo(px + k * ((i + 1) / 3), base);
        ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'h': {
      const bob = Math.sin(t * 3 + x) * k * 0.06;
      heart(ctx, px + k / 2, py + k / 2 + bob, k * 0.3, '#ff4d6d');
      break;
    }
    case '!': {
      const on = s.checkpoint && s.checkpoint.x === x && s.checkpoint.y === y;
      ctx.fillStyle = '#6c757d'; ctx.fillRect(px + k * 0.45, py - k * 0.6, k * 0.08, k * 1.6);
      ctx.fillStyle = on ? '#ff7eb6' : '#dee2e6';
      const wave = on ? Math.sin(t * 6) * k * 0.05 : 0;
      ctx.beginPath(); ctx.moveTo(px + k * 0.53, py - k * 0.6); ctx.lineTo(px + k * 1.05, py - k * 0.35 + wave); ctx.lineTo(px + k * 0.53, py - k * 0.1); ctx.fill();
      break;
    }
    case '*': {
      ctx.fillStyle = 'rgba(255, 214, 102, 0.28)'; ctx.fillRect(px, py, k + 1, k + 1);
      if (above !== '*') heart(ctx, px + k / 2, py - k * 0.1 + Math.sin(t * 2.5 + x) * k * 0.08, k * 0.32, '#ff4d6d');
      break;
    }
    case '~': {
      if (isLit(s, x, y)) {
        ctx.fillStyle = '#ffe066'; ctx.fillRect(px + 1, py + 1, k - 2, k * 0.4);
        ctx.fillStyle = 'rgba(255,224,102,0.35)'; ctx.fillRect(px - 2, py - 2, k + 4, k * 0.4 + 4);
      } else {
        ctx.strokeStyle = 'rgba(255,224,102,0.12)'; ctx.setLineDash([3, 4]);
        ctx.strokeRect(px + 2, py + 2, k - 4, k * 0.36); ctx.setLineDash([]);
      }
      break;
    }
    default: {
      if (c >= '1' && c <= '8') {
        const pl = s.plates.find((q) => q.x === x && q.y === y);
        const g = pl ? pl.g : 1, heavy = c >= '5', on = s.pressed[g], ceil = pl && pl.ceil;
        const ph = on ? k * 0.08 : k * 0.18;
        const top = ceil ? py : py + k - ph;
        ctx.fillStyle = GROUP_COLORS[g];
        ctx.fillRect(px + k * 0.08, top, k * 0.84, ph);
        if (heavy) { ctx.fillStyle = '#343a40'; ctx.fillRect(px + k * 0.3, top - k * 0.12, k * 0.4, k * 0.12); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; groupShape(ctx, g, px + k / 2, top + ph / 2, k * 0.05); ctx.fill();
      } else if (c >= 'A' && c <= 'D') {
        const g = c.charCodeAt(0) - 64, open = doorOpen(s, x, y);
        const horizontal = SOLID.includes(s.grid[y][x - 1] || '#') && SOLID.includes(s.grid[y][x + 1] || '#') && !SOLID.includes(above);
        ctx.fillStyle = GROUP_COLORS[g];
        if (open) {
          ctx.globalAlpha = 0.25;
          if (horizontal) ctx.fillRect(px, py + k * 0.35, k + 1, k * 0.3); else ctx.fillRect(px + k * 0.35, py, k * 0.3, k + 1);
          ctx.globalAlpha = 1;
        } else {
          if (horizontal) ctx.fillRect(px, py, k + 1, k * 0.8); else ctx.fillRect(px + k * 0.1, py, k * 0.8, k + 1);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; groupShape(ctx, g, px + k / 2, py + k / 2, k * 0.16); ctx.fill();
        }
      } else if (c >= 'a' && c <= 'd') {
        const g = c.charCodeAt(0) - 96, on = s.pressed[g];
        ctx.fillStyle = GROUP_COLORS[g];
        if (on) { ctx.fillRect(px, py, k + 1, k * 0.3); }
        else { ctx.globalAlpha = 0.3; ctx.setLineDash([4, 4]); ctx.strokeStyle = GROUP_COLORS[g]; ctx.strokeRect(px + 2, py + 2, k - 4, k * 0.26); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      }
    }
  }
}

function drawEnt(ctx, s, e, sx, sy, k, t) {
  if (e.type === 'platform') {
    const x = sx(e.x), y = sy(e.y), w = e.w * k;
    const running = !(s.frozen) && !(e.g && !s.pressed[e.g]);
    if (e.look === 'cloud') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + k * 0.25, w * 0.55, k * 0.38, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.25, y + k * 0.1, w * 0.25, k * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.72, y + k * 0.05, w * 0.28, k * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      if (e.g) { ctx.fillStyle = GROUP_COLORS[e.g]; groupShape(ctx, e.g, x + w / 2, y + k * 0.3, k * 0.1); ctx.fill(); }
    } else if (e.look === 'gear') {
      ctx.fillStyle = '#d4a64a'; ctx.fillRect(x, y, w, k * 0.35);
      ctx.fillStyle = '#8d6e2f';
      for (let i = 0; i < e.w * 3; i++) ctx.fillRect(x + (i + 0.3) * k / 3, y + k * 0.35, k * 0.12, k * 0.12);
      ctx.strokeStyle = 'rgba(80,60,20,0.6)'; ctx.lineWidth = 2;
      gearPath(ctx, x + w / 2, y + k * 0.18, k * 0.16, 6, running ? t * 3 : 0); ctx.stroke();
      if (e.g) { ctx.fillStyle = GROUP_COLORS[e.g]; groupShape(ctx, e.g, x + k * 0.25, y + k * 0.17, k * 0.08); ctx.fill(); }
    } else {
      ctx.fillStyle = '#a0785a'; ctx.fillRect(x, y, w, k * 0.35);
    }
  } else if (e.type === 'saw') {
    const r = (e.r || 0.6) * k, x = sx(e.x), y = sy(e.y);
    const spin = s.frozen || (e.g && (e.stop ? s.pressed[e.g] : !s.pressed[e.g])) ? 0 : t * 14;
    ctx.fillStyle = '#ced4da';
    gearPath(ctx, x, y, r, 9, spin); ctx.fill();
    ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
    if (e.path) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(e.path[0][0]), sy(e.path[0][1])); ctx.lineTo(sx(e.path[1][0]), sy(e.path[1][1])); ctx.stroke(); ctx.setLineDash([]);
    }
  } else if (e.type === 'pinwheel') {
    const x = sx(e.x + 0.5), y = sy(e.y + 0.5), r = k * 0.45;
    ctx.fillStyle = '#868e96'; ctx.fillRect(x - k * 0.04, y, k * 0.08, k * 0.9);
    const a0 = e.spin > 0 ? t * 14 : 0;
    const cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c'];
    for (let i = 0; i < 4; i++) {
      const a = a0 + i * Math.PI / 2;
      ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a + 0.9) * r * 0.6, y + Math.sin(a + 0.9) * r * 0.6);
      ctx.fill();
    }
    ctx.fillStyle = GROUP_COLORS[e.g]; groupShape(ctx, e.g, x, y, k * 0.08); ctx.fill();
  }
}

function drawNight(ctx, s, W, H, k, sx, sy) {
  if (!dark || dark.width !== W || dark.height !== H) {
    dark = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  }
  const d = dark.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, W, H);
  d.fillStyle = 'rgba(4, 6, 20, 0.93)';
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const lights = [];
  const sg = s.players[SUGAR];
  if (!sg.dead) lights.push([sg, lightRadius(s)]);
  const sp = s.players[SPICE];
  if (!sp.dead) lights.push([sp, 1.4]);
  for (const [p, r] of lights) {
    const cx = sx(p.x + p.w / 2), cy = sy(p.y + p.h / 2), R = r * k;
    const g = d.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath(); d.arc(cx, cy, R, 0, Math.PI * 2); d.fill();
  }
  ctx.drawImage(dark, 0, 0);
}

function drawFlood(ctx, s, W, H, sy, t) {
  const y = sy(s.flood.y);
  if (y > H) return;
  ctx.fillStyle = 'rgba(77, 171, 247, 0.55)';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + t * 3) * 5);
  ctx.lineTo(W, H); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let x = 0; x < W; x += 40) ctx.fillRect(x + ((t * 30) % 40), y + Math.sin(x * 0.03 + t * 3) * 5 - 2, 14, 3);
}

export function heart(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.6, cy - r * 1.3, cx, cy - r * 0.4);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
  ctx.fill();
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
  ctx.fillStyle = PLAYER_COLORS[id];
  roundRect(ctx, bx, by, ww, hh, Math.min(ww, hh) * 0.42); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
  // little feet
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  const step = moving && !airborne ? Math.sin(t * 14) * ww * 0.08 : 0;
  ctx.beginPath(); ctx.ellipse(bx + ww * 0.3 + step, by + hh, ww * 0.16, hh * 0.05, 0, 0, Math.PI * 2); ctx.ellipse(bx + ww * 0.7 - step, by + hh, ww * 0.16, hh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // eyes look where they face, and blink
  const blink = (Math.sin(t * 1.3 + id * 2) > 0.985) || stun > 0;
  const ex = bx + ww / 2 + facing * ww * 0.14, ey = by + hh * 0.35;
  const er = Math.max(1.5, ww * 0.1);
  for (const dx of [-ww * 0.16, ww * 0.16]) {
    if (blink) { ctx.strokeStyle = '#212529'; ctx.lineWidth = Math.max(1.5, er * 0.5); ctx.beginPath(); ctx.moveTo(ex + dx - er, ey); ctx.lineTo(ex + dx + er, ey); ctx.stroke(); continue; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + dx, ey, er * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(ex + dx + facing * er * 0.4, ey, er * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // smile
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(1, er * 0.4);
  ctx.beginPath(); ctx.arc(bx + ww / 2 + facing * ww * 0.1, by + hh * 0.52, er * 1.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(bx + ww * 0.2, by + hh * 0.56, er, 0, Math.PI * 2); ctx.arc(bx + ww * 0.8, by + hh * 0.56, er, 0, Math.PI * 2); ctx.fill();
  // Sugar: a bow. Spice: a hat. Shape tells them apart, not only colour.
  if (id === SUGAR) {
    ctx.fillStyle = '#d6336c';
    const cx = bx + ww * 0.5, cy = by + hh * 0.02, r = Math.max(3, ww * 0.22);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - r * 1.6, cy - r); ctx.lineTo(cx - r * 1.6, cy + r); ctx.closePath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 1.6, cy - r); ctx.lineTo(cx + r * 1.6, cy + r); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#1b4965';
    ctx.fillRect(bx - ww * 0.08, by - hh * 0.02, ww * 1.16, Math.max(2, hh * 0.08));
    ctx.fillRect(bx + ww * 0.2, by - hh * 0.22, ww * 0.6, hh * 0.22);
  }
  // power props
  if (power === 'lantern') {
    const lx = bx + ww / 2 + facing * ww * 0.7, ly = by + hh * 0.6;
    ctx.fillStyle = bright ? '#fff3bf' : '#ffd43b';
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(3, k * (bright ? 0.2 : 0.14)), 0, Math.PI * 2); ctx.fill();
  } else if (power === 'slam') {
    ctx.fillStyle = '#868e96';
    const hx = bx + ww / 2 - facing * ww * 0.55, hy = by + hh * 0.3;
    ctx.fillRect(hx - k * 0.04, hy, k * 0.08, k * 0.45);
    ctx.fillStyle = '#495057'; ctx.fillRect(hx - k * 0.16, hy - k * 0.08, k * 0.32, k * 0.16);
  } else if (power === 'pin') {
    ctx.fillStyle = '#adb5bd';
    ctx.fillRect(bx + ww / 2 + facing * ww * 0.45, by + hh * 0.5, facing * k * 0.35, k * 0.07);
  } else if (power === 'glide' || power === 'gust') {
    if (power === 'glide' && gliding) {
      ctx.fillStyle = '#4dabf7';
      ctx.beginPath(); ctx.arc(bx + ww / 2, by - hh * 0.45, ww * 0.95, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#1b4965'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx + ww / 2, by - hh * 0.45); ctx.lineTo(bx + ww / 2, by + hh * 0.2); ctx.stroke();
    } else if (power === 'gust') {
      ctx.fillStyle = '#e7f5ff';
      ctx.beginPath(); ctx.ellipse(bx + ww / 2 + facing * ww * 0.7, by + hh * 0.55, k * 0.12, k * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (power === 'freeze') {
    ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx + ww / 2 + facing * ww * 0.7, by + hh * 0.55, k * 0.15, 0, Math.PI * 2); ctx.stroke();
  }
  if (wave > 0) heart(ctx, bx + ww / 2, by - k * (0.5 + (1.2 - wave) * 0.5), k * 0.22, '#ff4d6d');
  if (stun > 0) {
    ctx.fillStyle = '#ffd43b';
    for (let i = 0; i < 3; i++) {
      const a = t * 8 + i * 2.1;
      ctx.beginPath(); ctx.arc(bx + ww / 2 + Math.cos(a) * ww * 0.5, by - k * 0.15 + Math.sin(a) * k * 0.1, Math.max(2, k * 0.07), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlayer(ctx, s, p, sx, sy, k, t) {
  const x = sx(p.x), y = sy(p.y), w = p.w * k, h = p.h * k;
  const power = powerOf(s, p);
  if (p.dashT > 0) {
    ctx.fillStyle = PLAYER_COLORS[p.id];
    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.25 / i; ctx.fillRect(x - p.facing * i * k * 0.4, y, w, h); }
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
  ctx.fillStyle = '#c08552'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r, 0, 0, Math.PI * 2); ctx.fill();
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
    } else { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x) - k * 0.06, sy(f.y) - k * 0.06, k * 0.12, k * 0.12); }
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
