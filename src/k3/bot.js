// A player for the 3D Kitchen: the tests' route, and the AI partner when you play alone.
// Inputs only, like a pad, and deterministic. Each plays its own half: Spice syrups,
// Sugar lights; at a launch spot he splashes syrup on her feet, steps in beside her,
// both face the way up, and she lights it.
import { K, alive, queenOf, onPuddle, supportAt } from './sim.js';

const NONE = { left: false, right: false, up: false, down: false, jump: false, ability: false, jumpPressed: false, abilityPressed: false, regroup: false };
const len = (x, y) => Math.sqrt(x * x + y * y);
const SUGAR = 0, SPICE = 1;

// the stick that moves you toward a world direction, relative to your camera
function toward(p, dx, dy, tol = 0.25) {
  const d = len(dx, dy);
  if (d < tol) return { ...NONE };
  const ux = dx / d, uy = dy / d;
  const fwd = ux * p.cx + uy * p.cy, side = ux * p.cy - uy * p.cx;
  return { ...NONE, up: fwd > 0.38, down: fwd < -0.38, right: side > 0.38, left: side < -0.38 };
}
// face a world direction with a single tap of the stick
function faceTo(p, dx, dy) {
  const d = len(dx, dy) || 1;
  if ((p.fx * dx + p.fy * dy) / d > 0.9) return null;
  return toward(p, dx, dy, 0);
}

// turn the camera toward a world direction (the gun goes where the camera looks)
function camTo(p, dx, dy, tight = 0.985) {
  const d = len(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (ux * p.cx + uy * p.cy > tight) return {};
  return (p.cx * uy - p.cy * ux) > 0 ? { camL: true } : { camR: true };
}
const looks = (p, dx, dy, c = 0.94) => { const d = len(dx, dy) || 1; return (dx * p.cx + dy * p.cy) / d > c; };

// a walk map per level: 0.5 m cells you can stand in at that height, without stepping off
const maps = new Map();
const CELL = 0.5;
function mapFor(s, z) {
  const key = Math.round(z * 10);
  let m = maps.get(key);
  if (m && m.boxes === s.boxes) return m;
  const w = Math.ceil(s.room.w / CELL), h = Math.ceil(s.room.d / CELL), ok = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
    const sup = supportAt(s, x, y, K.R + 0.1, z + 0.05);
    const top = supportAt(s, x, y, K.R + 0.1, 99);
    ok[j * w + i] = Math.abs(sup - z) < 0.05 && top <= z + K.STEP ? 1 : 0;
  }
  m = { boxes: s.boxes, w, h, ok };
  maps.set(key, m);
  return m;
}
// the next point toward (gx, gy) on your own level (straight there if no way is known)
function route(s, p, gx, gy) {
  const m = mapFor(s, p.z), W = m.w;
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  const si = cl(Math.floor(p.x / CELL), W), sj = cl(Math.floor(p.y / CELL), m.h);
  const gi = cl(Math.floor(gx / CELL), W), gj = cl(Math.floor(gy / CELL), m.h);
  if (si === gi && sj === gj) return [gx, gy];
  const prev = new Int32Array(W * m.h).fill(-1), q = [sj * W + si];
  prev[q[0]] = q[0];
  let found = -1;
  for (let k = 0; k < q.length && k < 20000; k++) {
    const c = q[k], i = c % W, j = (c - i) / W;
    if (i === gi && j === gj) { found = c; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= m.h) continue;
      const n = nj * W + ni;
      if (prev[n] >= 0 || (!m.ok[n] && !(ni === gi && nj === gj))) continue;
      if (di && dj && (!m.ok[j * W + ni] || !m.ok[nj * W + i])) continue;   // no cutting corners
      prev[n] = c; q.push(n);
    }
  }
  if (found < 0) return [gx, gy];
  let c = found, steps = 0;
  while (prev[c] !== q[0] && c !== q[0]) { c = prev[c]; steps++; }
  // look a few cells ahead along the path when it's straight
  return [((c % W) + 0.5) * CELL, (((c - (c % W)) / W) + 0.5) * CELL];
}
function go(s, p, gx, gy, tol = 0.3) {
  if (Math.sqrt((gx - p.x) ** 2 + (gy - p.y) ** 2) < tol) return { ...NONE };
  const [x, y] = route(s, p, gx, gy);
  return toward(p, x - p.x, y - p.y, 0.05);
}

const nestAt = (s, z) => s.ents.find((e) => e.type === 'nest' && !e.dead && Math.abs(e.z - z) < 0.5);

// fight whatever is near on your level: stand still and let the gun aim; dodge spit and charges
function fight(s, p, target) {
  for (const w of s.warns) {
    const dx = p.x - w.x, dy = p.y - w.y, d = len(dx, dy);
    if (Math.abs(w.z - p.z) < 1.5 && d < w.r + 0.7) return toward(p, d < 0.05 ? 1 : dx, d < 0.05 ? 0 : dy, 0);
  }
  const q = queenOf(s);
  if (q && !q.dead && (q.state === 'aim' || q.state === 'charge') && Math.abs(q.z - p.z) < 1.2) {
    const lx = q.tx - q.x, ly = q.ty - q.y, l = len(lx, ly) || 1, px = p.x - q.x, py = p.y - q.y;
    const side = (px * ly - py * lx) / l;
    if (Math.abs(side) < 2.3 && px * lx + py * ly > -1) return toward(p, (ly / l) * (side >= 0 ? 1 : -1), -(lx / l) * (side >= 0 ? 1 : -1), 0);
  }
  const close = s.ents.find((e) => (e.type === 'ant' || e.type === 'queen') && !e.dead && e.state !== 'sleep' && Math.abs(e.z - p.z) < 1 && len(e.x - p.x, e.y - p.y) < (e.type === 'queen' ? 3.2 : 1.8));
  if (close && close.type === 'queen' && p.z > 2.5) {   // on the table: keep away from her, toward the table's far side
    const ax = p.x + (p.x - close.x) * 3, ay = p.y + (p.y - close.y) * 3;
    return { ...go(s, p, Math.max(42.8, Math.min(55.2, ax)), Math.max(6.8, Math.min(16.2, ay)), 0), ...camTo(p, close.x - p.x, close.y - p.y), ability: looks(p, close.x - p.x, close.y - p.y) };
  }
  if (close) {   // too close: shoot it point blank (and back off, on the floor; up high a step back is a fall)
    const dx = close.x - p.x, dy = close.y - p.y;
    const st = p.z < 0.5 && close.type !== 'queen' ? go(s, p, p.x - dx * 2, p.y - dy * 2, 0) : { ...NONE };
    const want = p.id === SPICE || close.coat > 0 || (close.type === 'ant' && close.kind !== 'soldier');
    return { ...st, ...camTo(p, dx, dy, 0.97), ability: want && looks(p, dx, dy, 0.9) };
  }
  if (target && len(target.x - p.x, target.y - p.y) > (p.id === SPICE ? 6 : 7)) return go(s, p, target.x, target.y, 0.5);
  // pick what to shoot: Spice the least coated; Sugar the coated (or a bare small ant); turn the camera onto it
  let best = null, bs = -1e9;
  for (const e of s.ents) {
    if (e.dead || !(e.type === 'ant' || e.type === 'nest' || (e.type === 'queen' && e.state !== 'sleep')) || Math.abs(e.z - p.z) > 2.5) continue;
    const d = len(e.x - p.x, e.y - p.y);
    if (d > (p.id === SPICE ? 8.5 : K.SPARK_RANGE)) continue;
    const want = p.id === SPICE ? (e.coat < 3 ? 2 : 0) : (e.coat > 0 ? 2 : e.type === 'ant' && e.kind !== 'soldier' ? 1 : -5);
    const sc = want * 10 - d;
    if (sc > bs) { bs = sc; best = e; }
  }
  if (!best || bs < -2) return { ...NONE };
  const dx = best.x - p.x, dy = best.y - p.y;
  return { ...NONE, ...camTo(p, dx, dy), ability: looks(p, dx, dy) };
}
const threatNear = (s, p, r) => s.ents.some((e) => e.type === 'ant' && !e.dead && Math.abs(e.z - p.z) < 1 && len(e.x - p.x, e.y - p.y) < r);

// a launch spot: (x, y) on the level below, facing (fx, fy); she stands at the spot, he beside her
function launch(s, p, o, x, y, fx, fy, after) {
  const me = p.id === SUGAR ? [x, y] : [x - fy * 0.55, y + fx * 0.55];
  if (threatNear(s, p, 3)) return fight(s, p, null);
  if (len(me[0] - p.x, me[1] - p.y) > 0.25) return len(me[0] - p.x, me[1] - p.y) > 1 ? go(s, p, me[0], me[1]) : toward(p, me[0] - p.x, me[1] - p.y, 0.12);
  const her = s.players[SUGAR], him = s.players[SPICE];
  const ready = (q, mx, my) => alive(q) && q.ground && len(mx - q.x, my - q.y) < 0.4;
  const herSpot = [x, y], hisSpot = [x - fy * 0.55, y + fx * 0.55];
  if (!ready(her, ...herSpot) || !ready(him, ...hisSpot)) return { ...NONE };
  const pd = s.puddles.find((q) => !q.burn && Math.abs(q.z - p.z) < 0.3 && len(q.x - her.x, q.y - her.y) < 0.5);
  if (p.id === SPICE) {   // splash her feet (look at her, fire), then look the way up
    if (!pd) { const c = camTo(p, her.x - p.x, her.y - p.y, 0.97); return { ...NONE, ...c, ability: !c.camL && !c.camR }; }
    return { ...NONE, ...camTo(p, fx, fy) };
  }
  if (!pd) return { ...NONE, ...camTo(p, fx, fy) };
  const bothIn = [her, him].every((q) => len(q.x - pd.x, q.y - pd.y) < K.PUDDLE_R + 0.15 && looks(q, fx, fy, 0.97));
  return { ...NONE, ...camTo(p, fx, fy), ability: bothIn };
}

// the bot's own memory, kept off the sim state (the sim stays exactly what the inputs made it)
const MEM = new WeakMap();
function memOf(s) { let m = MEM.get(s); if (!m) { m = { waitDown: [0, 0], air: [null, null] }; MEM.set(s, m); } return m; }

export function k3Bot(s, id) {
  const p = s.players[id], o = s.players[1 - id];
  if (!alive(p)) return NONE;
  const mem = memOf(s);
  // in the air: hold the way you jumped, and jump again near the top (a launch's double jump makes the fridge)
  if (!p.ground) {
    const a = mem.air[id];
    if (a) return { ...toward(p, a[0], a[1], 0), jumpPressed: p.jumps < 2 && p.vz < 1 };
    const fridge = p.z > 3.9 && s.ents.find((e) => e.type === 'nest' && !e.dead && e.z === 10) && !s.ents.some((e) => e.type === 'nest' && !e.dead && e.z < 10);
    return { ...NONE, jumpPressed: !!fridge && p.jumps < 2 && p.vz < 4 };
  }
  mem.air[id] = null;
  const hop = (dx, dy) => { mem.air[id] = [dx, dy]; return { ...toward(p, dx, dy, 0), jumpPressed: true }; };
  const down = () => toward(p, 50 - p.x, 28 - p.y, 0);   // off whatever you're on, toward the middle of the room
  // stranded above your partner (knocked down, or they were): come down to them
  if (p.z > o.z + 2 && alive(o) && o.ground) { if (++mem.waitDown[id] > 90) return toward(p, o.x - p.x, o.y - p.y, 0); } else mem.waitDown[id] = 0;
  const n = s.ents.find((e) => e.type === 'nest' && !e.dead);
  if (n) {
    if (n.z === 0) return p.z > 0.5 ? down() : fight(s, p, n);
    if (n.z === 8) {   // the spice shelf: a step at a time, jump and jump again
      if (p.z > 7.9) return fight(s, p, n);
      if (p.z > 0.5 && !(p.y > 61.5 && p.x > 17.5 && p.x < 42.5)) return down();
      const y0 = 62 + Math.round(p.z / 2) * 2, spot = [30 + (id ? 0.8 : -0.8), y0 - 0.7];
      if (len(spot[0] - p.x, spot[1] - p.y) > 0.4) return p.z < 0.5 ? go(s, p, spot[0], spot[1], 0.3) : toward(p, spot[0] - p.x, spot[1] - p.y, 0.1);
      return hop(0, 1);
    }
    if (n.x > 90) {   // the sink counter
      if (p.z > 3.9 && p.x > 91) return fight(s, p, n);
      if (p.z > 0.5) return down();
      return launch(s, p, o, 88.6, 44, 1, 0);
    }
    if (n.z === 4) {   // by the stove
      if (p.z > 3.9 && p.x < 55 && p.y > 36.5 && p.z < 4.5) return len(n.x - p.x, n.y - p.y) > 6 ? go(s, p, n.x, n.y, 1) : fight(s, p, n);
      if (p.z > 0.5) return down();
      return launch(s, p, o, 22, 33.6, 0, 1);
    }
    // the fridge: up onto the counter, along to its end, then up again
    if (p.z > 9.9) return len(n.x - p.x, n.y - p.y) > 6 ? toward(p, n.x - p.x, n.y - p.y) : fight(s, p, n);
    if (p.z > 3.9 && p.x < 55 && p.y > 36.5) { if (threatNear(s, p, 3)) return fight(s, p, null); return launch(s, p, o, 50.6, 40.5, 1, 0); }
    if (p.z > 0.5) return down();
    return launch(s, p, o, 22, 33.6, 0, 1);
  }
  const q = queenOf(s);
  if (!q || q.dead) return NONE;
  if (p.z > 3.5) return p.z > 9 ? toward(p, 0, -1) : down();
  if (p.z < 2.9) {   // onto the table: from the floor between the chair and the table, jump and jump again
    if (len(41.5 - p.x, 11 - p.y) > 0.5) return go(s, p, 41.5, 11, 0.2);
    return hop(1, 0);
  }
  return fight(s, p, q);
}
export { onPuddle };
