// Draws. Never writes to the sim state it is handed (tests/render.test.mjs checks).
import { SUGAR, SPICE, isLit, lightRadius, plateGroup, doorOpen } from './sim.js';

const THEMES = {
  day: { sky: ['#8fd3ff', '#e9f8ff'], top: '#7cc36b', dirt: '#b07c52', dirt2: '#9c6b44' },
  workshop: { sky: ['#f6dfb5', '#e7b97c'], top: '#c58b4f', dirt: '#8b5a2b', dirt2: '#7a4e25' },
  night: { sky: ['#0b1030', '#1d2656'], top: '#4d5a8a', dirt: '#2c3550', dirt2: '#262e46' },
};
export const GROUP_COLORS = [null, '#ff6b6b', '#4dabf7', '#ffd43b', '#b197fc'];
export const PLAYER_COLORS = ['#ff7eb6', '#2ec4b6'];

let dark = null;   // offscreen canvas for the night

export function textPx(H) { return Math.max(14, Math.round(H * 0.024)); }

export function drawWorld(ctx, s, cam, W, H, fx, theme = 'day') {
  const T = THEMES[theme] || THEMES.day;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawBackdrop(ctx, s, cam, W, H, theme);

  const k = cam.scale;
  const ox = W / 2 - cam.x * k, oy = H / 2 - cam.y * k;
  const sx = (x) => ox + x * k, sy = (y) => oy + y * k;

  const x0 = Math.max(0, Math.floor(cam.x - W / 2 / k) - 1), x1 = Math.min(s.w - 1, Math.ceil(cam.x + W / 2 / k) + 1);
  const y0 = Math.max(0, Math.floor(cam.y - H / 2 / k) - 1), y1 = Math.min(s.h - 1, Math.ceil(cam.y + H / 2 / k) + 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = s.grid[y][x];
      if (t === '.') continue;
      drawTile(ctx, s, t, x, y, sx(x), sy(y), k, T);
    }
  }

  // pins and flying pins
  for (const p of s.pins) {
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(sx(p.x), sy(p.y) - k * 0.06, k, k * 0.14);
    ctx.fillStyle = '#7d8590';
    ctx.fillRect(sx(p.x), sy(p.y) - k * 0.12, k * 0.12, k * 0.26);
  }
  ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = Math.max(2, k * 0.08);
  for (const sh of s.shots) {
    ctx.beginPath(); ctx.moveTo(sx(sh.x - sh.dir * 0.5), sy(sh.y)); ctx.lineTo(sx(sh.x), sy(sh.y)); ctx.stroke();
  }

  if (lightRadius(s)) drawNight(ctx, s, W, H, k, sx, sy);

  for (const p of s.players) drawPlayer(ctx, s, p, sx, sy, k);
  drawFx(ctx, fx, sx, sy, k);
}

function drawBackdrop(ctx, s, cam, W, H, theme) {
  // slow parallax hills / shelves / stars
  const par = 0.25;
  ctx.save();
  if (theme === 'night') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 397.3 - cam.x * cam.scale * 0.1) % W + W) % W;
      const y = (i * 151.7) % (H * 0.6);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = theme === 'workshop' ? 'rgba(139,90,43,0.15)' : 'rgba(80,170,90,0.25)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 520 - cam.x * cam.scale * par) % (W + 600) + W + 600) % (W + 600) - 300;
      ctx.beginPath();
      if (theme === 'workshop') ctx.fillRect(x, H * 0.35 + (i % 2) * 60, 320, 18);
      else { ctx.ellipse(x, H * 0.85, 360, 220, 0, Math.PI, 0); ctx.fill(); }
    }
    if (theme === 'day') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 430 - cam.x * cam.scale * 0.1) % (W + 300) + W + 300) % (W + 300) - 150;
        const y = 50 + (i % 3) * 55;
        ctx.beginPath(); ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2); ctx.ellipse(x + 35, y - 10, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function groupShape(ctx, g, cx, cy, r) {
  ctx.beginPath();
  if (g === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (g === 2) ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else if (g === 3) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); }
  else { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
}

function drawTile(ctx, s, t, x, y, px, py, k, T) {
  const above = y > 0 ? s.grid[y - 1][x] : '.';
  switch (t) {
    case '#': {
      ctx.fillStyle = (x + y) % 2 ? T.dirt : T.dirt2;
      ctx.fillRect(px, py, k + 1, k + 1);
      if (above !== '#' && above !== 'L' && above !== 'x') { ctx.fillStyle = T.top; ctx.fillRect(px, py, k + 1, k * 0.28); }
      break;
    }
    case 'L': {
      ctx.fillStyle = '#5c6370'; ctx.fillRect(px, py, k + 1, k + 1);
      ctx.fillStyle = '#ffa94d'; ctx.fillRect(px, py, k + 1, k * 0.22);
      ctx.fillStyle = '#ffe8cc';
      ctx.beginPath(); ctx.moveTo(px + k * 0.5, py + k * 0.32); ctx.lineTo(px + k * 0.78, py + k * 0.7); ctx.lineTo(px + k * 0.22, py + k * 0.7); ctx.fill();
      break;
    }
    case 'x': {
      ctx.fillStyle = '#c8873e'; ctx.fillRect(px + 1, py + 1, k - 2, k - 2);
      ctx.strokeStyle = '#7a4e25'; ctx.lineWidth = Math.max(1, k * 0.07);
      ctx.strokeRect(px + k * 0.08, py + k * 0.08, k * 0.84, k * 0.84);
      ctx.beginPath(); ctx.moveTo(px + k * 0.1, py + k * 0.1); ctx.lineTo(px + k * 0.9, py + k * 0.9); ctx.stroke();
      break;
    }
    case '^': {
      ctx.fillStyle = '#e9ecef';
      ctx.strokeStyle = '#495057'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + k * (i / 3), py + k); ctx.lineTo(px + k * (i / 3 + 1 / 6), py + k * 0.4); ctx.lineTo(px + k * ((i + 1) / 3), py + k);
        ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'h': {
      const bob = Math.sin(s.time * 3 + x) * k * 0.06;
      heart(ctx, px + k / 2, py + k / 2 + bob, k * 0.3, '#ff4d6d');
      break;
    }
    case '!': {
      const on = s.checkpoint && s.checkpoint.x === x && s.checkpoint.y === y;
      ctx.fillStyle = '#6c757d'; ctx.fillRect(px + k * 0.45, py - k * 0.6, k * 0.08, k * 1.6);
      ctx.fillStyle = on ? '#ff7eb6' : '#dee2e6';
      ctx.beginPath(); ctx.moveTo(px + k * 0.53, py - k * 0.6); ctx.lineTo(px + k * 1.05, py - k * 0.35); ctx.lineTo(px + k * 0.53, py - k * 0.1); ctx.fill();
      break;
    }
    case '*': {
      ctx.fillStyle = 'rgba(255, 214, 102, 0.28)'; ctx.fillRect(px, py, k + 1, k + 1);
      if (above !== '*') heart(ctx, px + k / 2, py - k * 0.1, k * 0.32, '#ff4d6d');
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
      if (t >= '1' && t <= '8') {
        const g = plateGroup(t), heavy = t >= '5', on = s.pressed[g];
        const ph = on ? k * 0.08 : k * 0.18;
        ctx.fillStyle = GROUP_COLORS[g];
        ctx.fillRect(px + k * 0.08, py + k - ph, k * 0.84, ph);
        if (heavy) { ctx.fillStyle = '#343a40'; ctx.fillRect(px + k * 0.3, py + k - ph - k * 0.12, k * 0.4, k * 0.12); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; groupShape(ctx, g, px + k / 2, py + k - ph / 2, k * 0.05); ctx.fill();
      } else if (t >= 'A' && t <= 'D') {
        const g = t.charCodeAt(0) - 64, open = doorOpen(s, x, y);
        ctx.fillStyle = GROUP_COLORS[g];
        if (open) {
          ctx.globalAlpha = 0.25; ctx.fillRect(px + k * 0.35, py, k * 0.3, k + 1); ctx.globalAlpha = 1;
        } else {
          ctx.fillRect(px + k * 0.1, py, k * 0.8, k + 1);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; groupShape(ctx, g, px + k / 2, py + k / 2, k * 0.16); ctx.fill();
        }
      } else if (t >= 'a' && t <= 'd') {
        const g = t.charCodeAt(0) - 96, on = s.pressed[g];
        ctx.fillStyle = GROUP_COLORS[g];
        if (on) { ctx.fillRect(px, py, k + 1, k * 0.3); }
        else { ctx.globalAlpha = 0.3; ctx.setLineDash([4, 4]); ctx.strokeStyle = GROUP_COLORS[g]; ctx.strokeRect(px + 2, py + 2, k - 4, k * 0.26); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      }
    }
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

function heart(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.6, cy - r * 1.3, cx, cy - r * 0.4);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
  ctx.fill();
}

function drawPlayer(ctx, s, p, sx, sy, k) {
  const color = PLAYER_COLORS[p.id];
  const x = sx(p.x), y = sy(p.y), w = p.w * k, h = p.h * k;
  ctx.save();
  if (p.dead) ctx.globalAlpha = Math.max(0, p.deadT) * 0.6;
  // squash on slam, stretch on jump
  const st = p.slamming ? 0.85 : p.vy < -5 ? 1.08 : 1;
  const hh = h * st, ww = w / st;
  const bx = x + (w - ww) / 2, by = y + (h - hh);
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, ww, hh, Math.min(ww, hh) * 0.4); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.stroke();
  // eyes look where they face
  const ex = bx + ww / 2 + p.facing * ww * 0.14, ey = by + hh * 0.35;
  const er = Math.max(1.5, ww * 0.1);
  for (const dx of [-ww * 0.16, ww * 0.16]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + dx, ey, er * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(ex + dx + p.facing * er * 0.4, ey, er * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // cheeks
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(bx + ww * 0.22, by + hh * 0.58, er, 0, Math.PI * 2); ctx.arc(bx + ww * 0.78, by + hh * 0.58, er, 0, Math.PI * 2); ctx.fill();
  // Sugar: a bow. Spice: a hat. Shape tells them apart, not only colour.
  if (p.id === SUGAR) {
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
  if (s.powers.sugar === 'lantern' && p.id === SUGAR) {
    const lx = bx + ww / 2 + p.facing * ww * 0.7, ly = by + hh * 0.6;
    ctx.fillStyle = p.bright ? '#fff3bf' : '#ffd43b';
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(3, k * (p.bright ? 0.2 : 0.14)), 0, Math.PI * 2); ctx.fill();
  }
  if (s.powers.spice === 'slam' && p.id === SPICE) {
    ctx.fillStyle = '#868e96';
    const hx = bx + ww / 2 - p.facing * ww * 0.55, hy = by + hh * 0.3;
    ctx.fillRect(hx - k * 0.04, hy, k * 0.08, k * 0.45);
    ctx.fillStyle = '#495057'; ctx.fillRect(hx - k * 0.16, hy - k * 0.08, k * 0.32, k * 0.16);
  }
  if (p.wave > 0) heart(ctx, bx + ww / 2, by - k * (0.5 + (1.2 - p.wave) * 0.5), k * 0.22, '#ff4d6d');
  if (p.stun > 0) {
    ctx.fillStyle = '#ffd43b';
    for (let i = 0; i < 3; i++) {
      const a = s.time * 8 + i * 2.1;
      ctx.beginPath(); ctx.arc(bx + ww / 2 + Math.cos(a) * ww * 0.5, by - k * 0.15 + Math.sin(a) * k * 0.1, Math.max(2, k * 0.07), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
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
    else { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x) - k * 0.06, sy(f.y) - k * 0.06, k * 0.12, k * 0.12); }
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
  if (s.bonk) scale = Math.min(W / (s.w + 1), H / (s.h - 2));
  let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2 - 1;
  if (s.bonk) { tx = s.w / 2; ty = s.h / 2 - 1; }
  // keep the view inside the level
  const halfW = W / 2 / scale, halfH = H / 2 / scale;
  tx = s.w > halfW * 2 ? Math.min(Math.max(tx, halfW), s.w - halfW) : s.w / 2;
  ty = Math.min(ty, s.h - halfH);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return c;
  const a = instant ? 1 : 0.12;
  c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.scale += (scale - c.scale) * a;
  return c;
}
