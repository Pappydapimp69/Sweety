// A player for the Kitchen: the tests' route through the chapter, and the AI partner
// when you play alone. It only ever produces inputs, like a pad. Each of the two plays
// its own half: Spice syrups, Sugar lights, and at each drop both step into the syrup
// together. Deterministic (no randomness), so tests replay exactly.
import * as C from './config.js';
import { tileAt, solidTile, alive, queenOf, onPuddle } from './sim.js';

const NONE = { left: false, right: false, up: false, down: false, jump: false, ability: false, jumpPressed: false, abilityPressed: false, regroup: false };
const len = (x, y) => Math.sqrt(x * x + y * y);
const SUGAR = 0, SPICE = 1;

// the chapter's waypoints: where to stand, and what has to be true before moving on
const EDGES = [73.3, 84.3, 96.3];
export function goalOf(s) {
  const front = Math.min(...s.players.map((p) => p.x));
  if (s.grid[10][16] === 'c') return { x: 14.6, y: 10.5, act: 'cubes' };
  if (front < 31) return { x: 33, y: 10.5 };
  if (!s.doorB) return { x: 45, y: 10.5, act: 'nests' };
  for (const ex of EDGES) if (front < ex + 1.5) return { x: ex, y: 10.5, act: 'jump' };
  const sw = s.ents.find((e) => e.type === 'switch');
  if (!sw.on) return { x: 143.6, y: 10.5, act: 'switch' };
  const q = queenOf(s);
  if (q.state === 'sleep') return { x: 153, y: 10.5 };
  return { x: q.x, y: q.y, act: 'boss' };
}

// breadth-first over tiles (no drops, no walls) to the next cell toward a goal
function nextStep(s, p, gx, gy) {
  const sx = Math.floor(p.x), sy = Math.floor(p.y), tx = Math.floor(gx), ty = Math.floor(gy);
  if (sx === tx && sy === ty) return [gx, gy];
  const W = s.w, prev = new Int32Array(W * s.h).fill(-1), q = [sy * W + sx];
  prev[q[0]] = q[0];
  const ok = (x, y) => { const t = tileAt(s, x, y); return !solidTile(t) && t !== 'o'; };
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % W, y = (c - x) / W;
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (prev[n] >= 0 || !ok(nx, ny)) continue;
      prev[n] = c; q.push(n);
    }
  }
  let c = ty * W + tx;
  if (prev[c] < 0) return [gx, gy];
  while (prev[c] !== sy * W + sx) c = prev[c];
  return [c % W + 0.5, (c - (c % W)) / W + 0.5];
}
function steer(s, p, gx, gy, tol = 0.15) {
  const [ax, ay] = nextStep(s, p, gx, gy);
  const dx = ax - p.x, dy = ay - p.y;
  return { ...NONE, right: dx > tol, left: dx < -tol, down: dy > tol, up: dy < -tol };
}
const near = (p, x, y, tol = 0.3) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol;
const faceEast = (p) => (p.fx > 0.99 ? null : { ...NONE, right: true });

function threats(s, p, range) {
  return s.ents.filter((e) => (e.type === 'ant' || (e.type === 'queen' && e.state !== 'sleep') || e.type === 'nest') && !e.dead && len(e.x - p.x, e.y - p.y) < range);
}

// fight: stand still and let the gun find its target; step back from anything too close;
// out of a spit's circle and out of a charge's line
function fight(s, p, goal) {
  for (const w of s.warns) {
    const dx = p.x - w.x, dy = p.y - w.y, d = len(dx, dy);
    if (d < w.r + 0.6) return steer(s, p, p.x + (dx / (d || 1)) * 3 + (d < 0.05 ? 3 : 0), p.y + (dy / (d || 1)) * 3);
  }
  const q = queenOf(s);
  if (q && (q.state === 'aim' || q.state === 'charge')) {
    const lx = q.tx - q.x, ly = q.ty - q.y, l = len(lx, ly) || 1;
    const px = p.x - q.x, py = p.y - q.y, side = (px * ly - py * lx) / l;
    if (Math.abs(side) < 2.2 && px * lx + py * ly > -1) return steer(s, p, p.x + (ly / l) * (side >= 0 ? 3 : -3), p.y - (lx / l) * (side >= 0 ? 3 : -3));
  }
  const close = threats(s, p, 2.3).filter((e) => e.type === 'ant' || e.type === 'queen');
  if (close.length) {
    const e = close[0], dx = p.x - e.x, dy = p.y - e.y, d = len(dx, dy) || 1;
    const run = steer(s, p, p.x + (dx / d) * 2.5, p.y + (dy / d) * 2.5);
    return { ...run, ability: true, jumpPressed: d < C.R + e.r + 0.4 && p.rollCool <= 0 };
  }
  const t = threats(s, p, p.id === SUGAR ? C.SPARK_RANGE - 0.5 : C.SYRUP_RANGE - 0.5);
  if (t.length) {
    // Sugar holds her fire until there's something lit-able, unless it's a bare ant
    const want = p.id === SPICE || t.some((e) => e.coat > 0) || t.some((e) => e.type === 'ant' && e.kind === 'ant') || s.puddles.some((pd) => !pd.burn && t.some((e) => len(e.x - pd.x, e.y - pd.y) < 1.6));
    if (want) return { ...NONE, ability: true };
  }
  // nothing in reach: close in on the nearest threat, or carry on
  const far = threats(s, p, 12);
  if (far.length) { const e = far[0]; return steer(s, p, e.x, e.y); }
  return steer(s, p, goal.x, goal.y);
}

export function kitchenBot(s, id) {
  const p = s.players[id], o = s.players[1 - id];
  if (!alive(p) || p.fly) return NONE;
  const goal = goalOf(s);
  const busy = threats(s, p, goal.act === 'nests' || goal.act === 'boss' ? 30 : 7).filter((e) => e.type !== 'nest' || goal.act === 'nests');
  if (goal.act === 'jump') return jump(s, p, o, goal);
  if (busy.length && goal.act !== 'switch') return fight(s, p, goal);
  switch (goal.act) {
    case 'cubes': {   // shoot along the row into the cubes: syrup first, then her spark
      const y = id ? 10.5 : 10.5;
      if (!near(p, goal.x, y)) return steer(s, p, goal.x, y);
      const f = faceEast(p);
      if (f) return f;
      const syruped = s.puddles.some((pd) => !pd.burn && pd.x > 15);
      return { ...NONE, ability: id === SPICE ? !syruped : syruped };
    }
    case 'switch': {
      const sw = s.ents.find((e) => e.type === 'switch');
      if (!near(p, goal.x, 10.5 + (id ? 0.4 : -0.4), 0.3)) { if (busy.length && len(busy[0].x - p.x, busy[0].y - p.y) < 3) return fight(s, p, goal); return steer(s, p, goal.x, 10.5 + (id ? 0.4 : -0.4)); }
      const f = faceEast(p);
      if (f) return f;
      const syruped = s.puddles.some((pd) => !pd.burn && len(pd.x - sw.x, pd.y - sw.y) < 2);
      return { ...NONE, ability: id === SPICE ? !syruped : syruped && near(o, goal.x, 10.5 + (id ? -0.4 : 0.4), 0.6) };
    }
    default: return steer(s, p, goal.x, goal.y);
  }
}

// At a drop: Spice drips syrup at the edge; both step into it facing over; Sugar lights it.
function jump(s, p, o, goal) {
  const ex = goal.x, y = 10.5 + (p.id ? 0.12 : -0.12);
  // the syrup they'll stand in: dripped at the edge, or splashed on her by his shot
  const holds = (q, pl) => alive(pl) && !pl.fly && len(pl.x - q.x, pl.y - q.y) < C.PUDDLE_R - 0.05;
  const pd = s.puddles.find((q) => !q.burn && q.x > ex - 1 && holds(q, p) && holds(q, o)) || s.puddles.find((q) => !q.burn && Math.abs(q.x - (ex + 0.55)) < 0.6 && Math.abs(q.y - 10.5) < 0.6);
  const fighting = threats(s, p, 3).filter((e) => e.type === 'ant');
  if (fighting.length && !pd) return fight(s, p, goal);
  if (p.x < ex - 1.5 || !near(p, ex, y, 0.2)) return steer(s, p, ex, y, 0.08);
  const f = faceEast(p);
  if (f) return f;
  if (p.id === SPICE) return { ...NONE, ability: !(pd && holds(pd, p) && holds(pd, o)) };
  // Sugar: once both stand in it, facing over
  const bothIn = pd && [p, o].every((q) => holds(pd, q) && q.fx > 0.99);
  return { ...NONE, ability: !!bothIn };
}
export { onPuddle };
