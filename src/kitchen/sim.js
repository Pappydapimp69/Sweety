// The Kitchen: the truth. Pure and deterministic (no Math.random, no clock, no DOM,
// no trig), so online lockstep replays it bit for bit like the other sims.
//
// A co-op twin-stick shooter. Spice's syrup sticks, slows and coats but never hurts;
// Sugar's sparks bounce off nearly everything but light syrup, and lit syrup is
// caramel: a blast that chains through every coated ant and puddle near it. A lit
// puddle under your feet throws you the way you face (a caramel jump). So every
// fight, and every gap, takes both of you at once.
import * as C from './config.js';

export const SUGAR = 0, SPICE = 1;
const EPS = 1e-6;
const SOLID = '#c;';   // plus a closed door
const len = (x, y) => Math.sqrt(x * x + y * y);

export function createKitchen(level, opts = {}) {
  const grid = level.map.map((r) => r.split(''));
  const h = grid.length, w = grid[0].length;
  const spawns = [null, null];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = grid[y][x];
    if (t === 'P' || t === 'Q') { spawns[t === 'P' ? 0 : 1] = { x: x + 0.5, y: y + 0.5 }; grid[y][x] = '.'; }
  }
  const ents = level.ents.map((e, i) => ({ ...e, i, ...entState(e) }));
  const cps = ents.filter((e) => e.type === 'cp');
  const s = {
    kitchen: true, chapterId: level.id, mode: 'chapter', w, h, grid, ents,
    players: [0, 1].map((id) => ({
      id, x: spawns[id].x, y: spawns[id].y, vx: 0, vy: 0, fx: 1, fy: 0, hp: C.HP,
      hurt: 0, down: 0, fall: 0, roll: 0, rollCool: 0, rx: 0, ry: 0, fly: null, cool: 0, safe: null, dead: false,
    })),
    shots: [], puddles: [], blasts: [], warns: [],
    cp: cps[0].i, dark: false, light: false, boss: 0, doorB: false,
    rng: (opts.seed ?? 1) >>> 0, tick: 0, time: 0, complete: false, endT: 0, events: [],
    hearts: 0, gentle: !!opts.gentle,
  };
  for (const p of s.players) p.safe = { x: p.x, y: p.y };
  if (opts.at !== undefined) toCheckpoint(s, opts.at);
  return s;
}

function entState(e) {
  switch (e.type) {
    case 'ant': {
      const hp = e.kind === 'soldier' ? C.SOLDIER_HP : C.ANT_HP;
      return { hp, max: hp, coat: 0, coatT: 0, vx: 0, vy: 0, dead: false, awake: false, bite: 0, burnT: 0, r: e.kind === 'soldier' ? 0.42 : 0.34 };
    }
    case 'nest': return { hp: C.NEST_HP, max: C.NEST_HP, coat: 0, coatT: 0, t: 1.5, n: 0, dead: false, r: 0.8 };
    case 'queen': return { hp: C.QUEEN_HP, max: C.QUEEN_HP, coat: 0, coatT: 0, state: 'sleep', t: 0, act: 0, tx: 0, ty: 0, vx: 0, vy: 0, dead: false, r: 1.2, n: 0, deadT: 0 };
    case 'switch': return { on: false };
    case 'gallery': return { phase: 'idle', wait: 0, t: 0, score: [0, 0], targets: [], spawnT: 0, winner: -1, rest: 0 };
    case 'cp': return { reached: false };
    default: return {};
  }
}

// a seeded number in [0, 1): integer LCG, the same on every machine
function rnd(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }

// ---------------------------------------------------------------- reading the world

export const tileAt = (s, x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? '#' : s.grid[y][x]);
export function solidTile(t) { return SOLID.includes(t) || t === 'D' || t === 'E'; }
function blocked(s, x, y, r, holes) {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r - EPS); cy++)
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r - EPS); cx++) {
      const t = tileAt(s, cx, cy);
      if (solidTile(t) || (holes && t === 'o')) return true;
    }
  return false;
}
function move(s, o, dx, dy, r, holes) {
  if (dx && !blocked(s, o.x + dx, o.y, r, holes)) o.x += dx; else if (dx) o.vx = 0;
  if (dy && !blocked(s, o.x, o.y + dy, r, holes)) o.y += dy; else if (dy) o.vy = 0;
}
export const alive = (p) => !p.down && !p.fall && !p.dead;
const enemies = (s) => s.ents.filter((e) => (e.type === 'ant' || e.type === 'nest' || e.type === 'queen') && !e.dead);
export const queenOf = (s) => s.ents.find((e) => e.type === 'queen');
export function nearOpen(s, x, y) {   // standing well away from any drop
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(s, Math.floor(x) + dx, Math.floor(y) + dy) === 'o') return false;
  return true;
}

// ---------------------------------------------------------------- the step

export function step(s, inputs) {
  s.events.length = 0;
  if (s.complete) return s;
  s.tick++; s.time = s.tick * C.DT;
  if (inputs.some((i) => i && i.regroup)) {
    for (const p of s.players) { p.down = 0; p.fall = 0; p.fly = null; p.hp = Math.max(p.hp, 1); }
    toCheckpoint(s, s.cp); s.events.push({ type: 'regroup' });
  }
  for (const p of s.players) updatePlayer(s, p, inputs[p.id] || {});
  updateShots(s);
  updateBlasts(s);
  updatePuddles(s);
  for (const e of s.ents) {
    if (e.type === 'ant') antStep(s, e);
    else if (e.type === 'nest') nestStep(s, e);
    else if (e.type === 'queen') queenStep(s, e);
    else if (e.type === 'gallery') galleryStep(s, e);
  }
  updateWarns(s);
  progress(s);
  if (s.endT > 0 && (s.endT -= C.DT) <= 0) s.complete = true;
  return s;
}

function toCheckpoint(s, i) {
  const cp = s.ents[i];
  s.players.forEach((p, k) => {
    p.x = cp.x; p.y = cp.y + (k ? 0.6 : -0.6); p.vx = 0; p.vy = 0; p.safe = { x: p.x, y: p.y };
  });
}

function updatePlayer(s, p, inp) {
  if (p.hurt > 0) p.hurt -= C.DT;
  if (p.cool > 0) p.cool -= C.DT;
  if (p.rollCool > 0) p.rollCool -= C.DT;
  if (p.down > 0) {   // knocked out: back at the checkpoint, whole again
    if ((p.down -= C.DT) <= 0) { p.down = 0; p.hp = C.HP; respawnAt(s, p); }
    return;
  }
  if (p.fall > 0) {
    if ((p.fall -= C.DT) <= 0) { p.fall = 0; respawnAt(s, p); }
    return;
  }
  if (p.fly) {   // a caramel jump: along a fixed arc, over drops, stopped by walls
    const f = p.fly;
    f.t += C.DT;
    const u = Math.min(1, f.t / f.dur);
    const nx = f.x0 + (f.x1 - f.x0) * u, ny = f.y0 + (f.y1 - f.y0) * u;
    if (!blocked(s, nx, ny, C.R, false)) { p.x = nx; p.y = ny; } else { f.t = f.dur; }
    if (f.t >= f.dur) { p.fly = null; s.events.push({ type: 'land', who: p.id, x: p.x, y: p.y, hard: true }); checkFall(s, p); }
    return;
  }
  const mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  if (mx || my) { const l = len(mx, my); p.fx = mx / l; p.fy = my / l; }
  p.still = !mx && !my;   // standing still, your gun finds its own target (a keyboard has no aim stick)
  // the dodge roll: fast, untouchable, over one tile of drop
  if (inp.jumpPressed && p.rollCool <= 0 && !p.roll) {
    p.roll = C.ROLL_TIME; p.rollCool = C.ROLL_COOL; p.rx = p.fx; p.ry = p.fy;
    s.events.push({ type: 'roll', who: p.id, x: p.x, y: p.y });
  }
  if (p.roll > 0) {
    p.roll -= C.DT;
    if (p.roll <= 0) p.roll = 0;
    p.vx = p.rx * C.ROLL_V; p.vy = p.ry * C.ROLL_V;
  } else {
    const l = len(mx, my) || 1;
    const sp = C.WALK * (onPuddle(s, p.x, p.y) && p.id === SUGAR ? 0.8 : 1);   // he's used to it; it slows her a little
    const tx = (mx / l) * sp, ty = (my / l) * sp, acc = C.ACCEL * C.DT;
    p.vx += Math.max(-acc, Math.min(acc, tx - p.vx));
    p.vy += Math.max(-acc, Math.min(acc, ty - p.vy));
  }
  move(s, p, p.vx * C.DT, 0, C.R, false);
  move(s, p, 0, p.vy * C.DT, C.R, false);
  if (inp.ability && p.cool <= 0) fire(s, p, !!inp.abilityPressed);
  if (!p.roll) checkFall(s, p);
  if (alive(p) && !p.roll && nearOpen(s, p.x, p.y)) p.safe = { x: p.x, y: p.y };
}

// Back in: beside your partner if they're up (never stranded behind a drop), else at the checkpoint.
function respawnAt(s, p) {
  const o = s.players[1 - p.id];
  const at = alive(o) && !o.fly ? o.safe : s.ents[s.cp];
  p.x = at.x; p.y = at.y; p.vx = 0; p.vy = 0; p.fly = null; p.roll = 0;
  p.safe = { x: p.x, y: p.y }; p.hurt = C.HURT_TIME;
  s.events.push({ type: 'respawn', who: p.id, x: p.x, y: p.y });
}

function checkFall(s, p) {
  if (tileAt(s, Math.floor(p.x), Math.floor(p.y)) !== 'o') return;
  p.fall = C.FALL_TIME; p.vx = 0; p.vy = 0;
  if (!s.gentle) hurt(s, p, null, true);
  s.events.push({ type: 'fall', who: p.id, x: p.x, y: p.y });
}

export function hurt(s, p, from, falling = false) {
  if (!falling && (p.hurt > 0 || p.roll > 0 || p.fly || !alive(p))) return false;
  p.hp -= 1; p.hurt = C.HURT_TIME;
  if (from) { const dx = p.x - from.x, dy = p.y - from.y, l = len(dx, dy) || 1; p.vx = (dx / l) * 9; p.vy = (dy / l) * 9; }
  s.events.push({ type: 'ouch', who: p.id, x: p.x, y: p.y });
  if (p.hp <= 0) { p.hp = 0; p.down = C.DOWN_TIME; p.fall = 0; s.events.push({ type: 'down', who: p.id, x: p.x, y: p.y }); }
  return true;
}

// ---------------------------------------------------------------- the two guns

// Aim: the way you face, nudged onto the best target within ~30 degrees; standing
// still, onto the best target all round.
// Sugar prefers what's coated (that's what her sparks are for); Spice, what isn't yet.
export function aimOf(s, p) {
  let bx = p.fx, by = p.fy, best = -1;
  const range = p.id === SUGAR ? C.SPARK_RANGE : C.SYRUP_RANGE;
  for (const e of enemies(s)) {
    if (e.type === 'queen' && e.state === 'sleep') continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = len(dx, dy);
    if (d > range + (e.r || 0) || d < 1e-3) continue;
    const cos = (dx * p.fx + dy * p.fy) / d;
    if (cos < (p.still ? -1.1 : 0.86)) continue;
    const want = p.id === SUGAR ? (e.coat > 0 ? 2 : e.type === 'ant' && e.kind === 'ant' ? 1 : 0) : (e.coat < C.COAT_MAX ? 2 : 0);
    const score = want * 10 + cos * 3 - d * 0.2;
    if (score > best) { best = score; bx = dx / d; by = dy / d; }
  }
  return [bx, by];
}

function fire(s, p, pressed) {
  if (!alive(p) || p.fly) return;
  const [dx, dy] = aimOf(s, p);
  if (p.id === SPICE) {
    p.cool = C.SYRUP_RATE;
    s.shots.push({ kind: 'syrup', who: p.id, x: p.x + dx * 0.3, y: p.y + dy * 0.3, dx, dy, dist: 0, r: 0.2 });
    s.events.push({ type: 'syrup', who: p.id, x: p.x, y: p.y, first: pressed });
  } else {
    p.cool = C.SPARK_RATE;
    s.events.push({ type: 'spark', who: p.id, x: p.x, y: p.y });
    // standing in syrup: it lights at once (and throws whoever's in it)
    const pd = s.puddles.find((q) => !q.burn && len(q.x - p.x, q.y - p.y) < C.PUDDLE_R);
    if (pd) { ignitePuddle(s, pd, 0); return; }
    s.shots.push({ kind: 'spark', who: p.id, x: p.x + dx * 0.3, y: p.y + dy * 0.3, dx, dy, dist: 0, r: 0.16 });
  }
}

function updateShots(s) {
  for (const b of s.shots) {
    const stepLen = (b.kind === 'syrup' ? C.SYRUP_V : C.SPARK_V) * C.DT;
    const range = b.kind === 'syrup' ? C.SYRUP_RANGE : C.SPARK_RANGE;
    const sub = 2;   // two half-steps: never past a thin ant
    for (let k = 0; k < sub && !b.done; k++) {
      const nx = b.x + b.dx * stepLen / sub, ny = b.y + b.dy * stepLen / sub;
      const t = tileAt(s, Math.floor(nx), Math.floor(ny));
      if (b.kind === 'spark' && solidTile(t)) {   // syrup dripping off a wall still catches the spark that hits it
        const pd = s.puddles.find((q) => !q.burn && len(q.x - nx, q.y - ny) < C.PUDDLE_R);
        if (pd) { ignitePuddle(s, pd, 0); b.done = true; break; }
      }
      if (solidTile(t)) { if (b.kind === 'syrup') addPuddle(s, b.x, b.y); else s.events.push({ type: 'fizzle', x: b.x, y: b.y }); b.done = true; break; }
      if (t === 'o' && b.kind === 'syrup') { addPuddle(s, b.x, b.y); b.done = true; break; }   // syrup drips at the edge
      b.x = nx; b.y = ny; b.dist += stepLen / sub;
      if (hitSomething(s, b)) { b.done = true; break; }
      if (b.dist >= range) {
        if (b.kind === 'syrup') addPuddle(s, b.x, b.y); else s.events.push({ type: 'fizzle', x: b.x, y: b.y });
        b.done = true;
      }
    }
  }
  s.shots = s.shots.filter((b) => !b.done);
}

function hitSomething(s, b) {
  // the gallery's sprinkles take any shot
  for (const g of s.ents) {
    if (g.type !== 'gallery' || g.phase !== 'run') continue;
    for (const t of g.targets) {
      if (t.hit || len(t.x - b.x, t.y - b.y) > 0.45) continue;
      t.hit = true; g.score[b.who]++;
      s.events.push({ type: 'sprinkle', who: b.who, x: t.x, y: t.y, n: g.score[b.who] });
      return true;
    }
  }
  for (const e of enemies(s)) {
    if (e.type === 'queen' && e.state === 'sleep') continue;
    if (len(e.x - b.x, e.y - b.y) > e.r + b.r) continue;
    if (b.kind === 'syrup') {
      e.coat = Math.min(C.COAT_MAX, e.coat + 1); e.coatT = e.type === 'queen' ? C.QUEEN_DECAY : C.COAT_DECAY;
      if (e.type === 'ant') e.awake = true;
      s.events.push({ type: 'coat', x: e.x, y: e.y, n: e.coat });
      return true;
    }
    if (e.coat > 0) { igniteThing(s, e, 0); return true; }
    if (e.type === 'ant' && e.kind === 'ant') { damage(s, e, C.SPARK_DMG); s.events.push({ type: 'zap', x: e.x, y: e.y }); }
    else s.events.push({ type: 'tink', x: e.x, y: e.y });   // a shell, a nest, the queen: it bounces off
    return true;
  }
  if (b.kind === 'syrup') {   // his syrup on her: a puddle at her feet
    const o = s.players[1 - b.who];
    if (alive(o) && !o.fly && len(o.x - b.x, o.y - b.y) < C.R + b.r) { addPuddle(s, o.x, o.y); return true; }
  } else {
    const pd = s.puddles.find((q) => !q.burn && len(q.x - b.x, q.y - b.y) < C.PUDDLE_R * 0.8);
    if (pd) { ignitePuddle(s, pd, 0); return true; }
  }
  return false;
}

function addPuddle(s, x, y) {
  // syrup on syrup: the puddle there grows a little fresher instead of stacking
  const near = s.puddles.find((q) => !q.burn && len(q.x - x, q.y - y) < C.PUDDLE_R * 0.7);
  if (near) { near.life = C.PUDDLE_LIFE; near.x = (near.x * 3 + x) / 4; near.y = (near.y * 3 + y) / 4; s.events.push({ type: 'splat', x, y }); return; }
  s.puddles.push({ x, y, life: C.PUDDLE_LIFE, burn: 0, born: s.time });
  if (s.puddles.length > C.PUDDLE_MAX) s.puddles.splice(s.puddles.findIndex((q) => !q.burn), 1);
  s.events.push({ type: 'splat', x, y });
}
export const onPuddle = (s, x, y) => s.puddles.some((q) => !q.burn && len(q.x - x, q.y - y) < C.PUDDLE_R);

// ---------------------------------------------------------------- caramel

function ignitePuddle(s, pd, delay) {
  if (pd.burn) return;
  pd.burn = C.BURN_TIME; pd.life = Math.max(pd.life, C.BURN_TIME);
  s.blasts.push({ x: pd.x, y: pd.y, r: C.BLAST_R * 0.9, coat: 0, t: delay, puddle: true });
  // whoever stands in it is thrown the way they face: a caramel jump
  for (const p of s.players) {
    if (!alive(p) || p.fly || len(p.x - pd.x, p.y - pd.y) > C.PUDDLE_R + 0.15) continue;
    p.roll = 0;
    p.fly = { x0: p.x, y0: p.y, x1: p.x + p.fx * C.LAUNCH_DIST, y1: p.y + p.fy * C.LAUNCH_DIST, t: 0, dur: C.LAUNCH_TIME };
    s.events.push({ type: 'launch', who: p.id, x: p.x, y: p.y });
  }
}
function igniteThing(s, e, delay) {
  const coat = e.coat;
  e.coat = 0;
  s.blasts.push({ x: e.x, y: e.y, r: C.BLAST_R + coat * 0.25, coat, t: delay, on: e.i });
}

function updateBlasts(s) {
  const now = [];
  for (const b of s.blasts) { b.t -= C.DT; if (b.t <= 0) now.push(b); }
  if (!now.length) return;
  s.blasts = s.blasts.filter((b) => b.t > 0);
  for (const b of now) {
    s.events.push({ type: 'blast', x: b.x, y: b.y, r: b.r, big: b.coat >= 2 || !b.puddle });
    for (const e of enemies(s)) {
      const d = len(e.x - b.x, e.y - b.y);
      if (d > b.r + e.r) continue;
      const coat = e.i === b.on ? b.coat : e.coat;
      if (e.type === 'queen') {
        if (coat <= 0 || e.state === 'sleep') { s.events.push({ type: 'tink', x: e.x, y: e.y }); continue; }
        damage(s, e, C.BLAST_DMG + C.BLAST_COAT * coat);
        if (e.i !== b.on) e.coat = 0;
        continue;
      }
      damage(s, e, C.BLAST_DMG + C.BLAST_COAT * coat);
      if (e.i !== b.on && e.coat > 0) igniteThing(s, e, C.CHAIN_DELAY);   // the chain: every coated ant it reaches goes off too
    }
    for (const pd of s.puddles) if (!pd.burn && len(pd.x - b.x, pd.y - b.y) < b.r + C.PUDDLE_R * 0.4) ignitePuddle(s, pd, C.CHAIN_DELAY);
    // sugar cubes crumble
    for (let cy = Math.floor(b.y - b.r); cy <= Math.floor(b.y + b.r); cy++)
      for (let cx = Math.floor(b.x - b.r); cx <= Math.floor(b.x + b.r); cx++) {
        if (tileAt(s, cx, cy) !== 'c' || len(cx + 0.5 - b.x, cy + 0.5 - b.y) > b.r + 0.3) continue;
        s.grid[cy][cx] = '.'; s.events.push({ type: 'crumble', x: cx + 0.5, y: cy + 0.5 });
      }
    for (const sw of s.ents) if (sw.type === 'switch' && !sw.on && len(sw.x - b.x, sw.y - b.y) < b.r + 0.6) lightsOn(s, sw);
  }
}

function damage(s, e, n) {
  if (e.dead) return;
  e.hp -= n;
  if (e.type === 'ant') e.awake = true;
  s.events.push({ type: 'hit', x: e.x, y: e.y, kind: e.type, n });
  if (e.hp > 0) return;
  e.hp = 0;
  if (e.type === 'queen') { e.dead = true; e.state = 'dead'; s.endT = 3; s.events.push({ type: 'queenDown', x: e.x, y: e.y }); return; }
  e.dead = true;
  s.events.push({ type: e.type === 'nest' ? 'nestDown' : 'antDown', x: e.x, y: e.y, kind: e.kind });
  if (e.type === 'nest' && s.ents.filter((q) => q.type === 'nest').every((q) => q.dead)) {
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.grid[y][x] === 'D') s.grid[y][x] = '.';
    s.doorB = true;
    s.events.push({ type: 'doorOpen', x: 65.5, y: 10.5 });
  }
}

function updatePuddles(s) {
  for (const pd of s.puddles) {
    pd.life -= C.DT;
    if (pd.burn > 0) {
      pd.burn -= C.DT;
      for (const e of enemies(s)) if (e.type === 'ant' && len(e.x - pd.x, e.y - pd.y) < C.PUDDLE_R + e.r) damage(s, e, C.DT);
      if (pd.burn <= 0) pd.life = 0;
    }
  }
  s.puddles = s.puddles.filter((q) => q.life > 0);
}

// ---------------------------------------------------------------- ants, nests, the queen

function nearestPlayer(s, x, y, max = Infinity) {
  let best = null, bd = max;
  for (const p of s.players) {
    if (!alive(p)) continue;
    const d = len(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function antStep(s, e) {
  if (e.dead) return;
  if (e.coatT > 0 && (e.coatT -= C.DT) <= 0 && e.coat > 0) { e.coat--; e.coatT = e.coat ? C.COAT_DECAY : 0; }
  if (e.bite > 0) e.bite -= C.DT;
  const sight = s.dark && !lit(s, e.x, e.y) ? 4 : C.AGGRO;
  const p = nearestPlayer(s, e.x, e.y, e.awake ? C.AGGRO * 1.6 : sight);
  if (p) e.awake = true;
  let tx = 0, ty = 0;
  if (p) { const dx = p.x - e.x, dy = p.y - e.y, d = len(dx, dy) || 1; tx = dx / d; ty = dy / d; }
  // syrup slows: each coat, and a puddle underfoot (which coats you as you stand in it)
  let v = (e.kind === 'soldier' ? C.SOLDIER_V : C.ANT_V) * (1 - 0.22 * e.coat);
  if (onPuddle(s, e.x, e.y)) {
    v *= 0.45;
    e.stick = (e.stick || 0) + C.DT;
    if (e.stick >= 0.8) { e.stick = 0; if (e.coat < C.COAT_MAX) { e.coat++; e.coatT = C.COAT_DECAY; } }
  }
  const acc = 30 * C.DT;
  e.vx += Math.max(-acc, Math.min(acc, tx * v - e.vx));
  e.vy += Math.max(-acc, Math.min(acc, ty * v - e.vy));
  // keep apart from each other
  for (const o of s.ents) {
    if (o === e || o.type !== 'ant' || o.dead) continue;
    const dx = e.x - o.x, dy = e.y - o.y, d = len(dx, dy), min = e.r + o.r;
    if (d < min && d > 1e-4) { e.vx += (dx / d) * 2; e.vy += (dy / d) * 2; }
  }
  move(s, e, e.vx * C.DT, 0, e.r * 0.9, true);
  move(s, e, 0, e.vy * C.DT, e.r * 0.9, true);
  if (p && e.bite <= 0 && len(p.x - e.x, p.y - e.y) < C.R + e.r + 0.05) {
    if (hurt(s, p, e)) { e.bite = 0.8; e.vx = -tx * 5; e.vy = -ty * 5; s.events.push({ type: 'bite', x: p.x, y: p.y }); }
  }
}

function liveAnts(s) { let n = 0; for (const e of s.ents) if (e.type === 'ant' && !e.dead) n++; return n; }
function spawnAnt(s, x, y, kind) {
  const e = { type: 'ant', kind, x, y, i: s.ents.length, ...entState({ type: 'ant', kind }), awake: true };
  s.ents.push(e);
  s.events.push({ type: 'spawn', x, y });
  return e;
}

function nestStep(s, e) {
  if (e.dead) return;
  if (e.coatT > 0 && (e.coatT -= C.DT) <= 0 && e.coat > 0) { e.coat--; e.coatT = e.coat ? C.COAT_DECAY : 0; }
  const p = nearestPlayer(s, e.x, e.y, C.NEST_NEAR);
  if (!p) return;
  if ((e.t -= C.DT) > 0) return;
  e.t = C.NEST_EVERY * (0.85 + rnd(s) * 0.3);
  if (liveAnts(s) >= 7) return;
  e.n++;
  const a = rnd(s) * 4 | 0, dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][a];
  spawnAnt(s, e.x + dir[0] * 1.1, e.y + dir[1] * 1.1, e.n % 3 === 0 ? 'soldier' : 'ant');
}

// The Ant Queen. Her shell takes caramel only while she's coated, and she shakes
// syrup off fast. She spits at both of you at once (so two of you are never easier
// than they should be), calls ants, and in her second half charges: a charge through
// syrup coats her, and a charge into a wall stuns her.
function queenStep(s, q) {
  if (q.state === 'sleep' || q.dead) return;
  if (!q.stun && q.coatT > 0 && (q.coatT -= C.DT) <= 0 && q.coat > 0) { q.coat--; q.coatT = q.coat ? C.QUEEN_DECAY : 0; }
  q.t += C.DT;
  const half = q.hp <= q.max / 2;
  if (half && !q.angry) { q.angry = true; s.events.push({ type: 'queenAngry', x: q.x, y: q.y }); }
  if (q.state === 'stun') {
    if ((q.act -= C.DT) <= 0) q.state = 'walk';
    return;
  }
  if (q.state === 'aim') {
    if ((q.act -= C.DT) <= 0) { q.state = 'charge'; q.act = 1.2; s.events.push({ type: 'charge', x: q.x, y: q.y }); }
    return;
  }
  if (q.state === 'charge') {
    const dx = q.tx - q.x, dy = q.ty - q.y, d = len(dx, dy) || 1;
    const ox = q.x, oy = q.y;
    move(s, q, (dx / d) * C.CHARGE_V * C.DT, (dy / d) * C.CHARGE_V * C.DT, q.r, true);
    for (const pd of s.puddles) if (!pd.burn && !pd.used && len(pd.x - q.x, pd.y - q.y) < C.PUDDLE_R + q.r * 0.6) { pd.used = true; q.coat = Math.min(C.COAT_MAX, q.coat + 1); q.coatT = C.QUEEN_DECAY * 1.5; s.events.push({ type: 'coat', x: q.x, y: q.y, n: q.coat }); }
    for (const p of s.players) if (alive(p) && len(p.x - q.x, p.y - q.y) < q.r + C.R) hurt(s, p, q);
    const stuck = Math.abs(q.x - ox) + Math.abs(q.y - oy) < 0.01;
    if (stuck) { q.state = 'stun'; q.act = C.STUN_TIME; q.stun = true; s.events.push({ type: 'thud', x: q.x, y: q.y }); return; }
    if ((q.act -= C.DT) <= 0 || d < 0.4) q.state = 'walk';
    return;
  }
  q.stun = false;
  // walk: drift toward the nearest of you, slowly
  const p = nearestPlayer(s, q.x, q.y);
  if (p) {
    const dx = p.x - q.x, dy = p.y - q.y, d = len(dx, dy) || 1;
    const v = d > 3 ? 1.3 * (1 - 0.15 * q.coat) : 0;
    move(s, q, (dx / d) * v * C.DT, (dy / d) * v * C.DT, q.r, true);
    if (d < q.r + C.R + 0.1) hurt(s, p, q);
  }
  q.n += C.DT;
  if (q.n < (half ? 2.2 : 3.0)) return;
  q.n = 0;
  q.cycle = (q.cycle || 0) + 1;
  const pick = half ? q.cycle % 3 : q.cycle % 2;
  if (pick === 0) {   // spit at each of you
    for (const pl of s.players) if (alive(pl)) s.warns.push({ x: pl.x, y: pl.y, r: C.SPIT_R, t: C.SPIT_WARN, max: C.SPIT_WARN });
    s.events.push({ type: 'spit', x: q.x, y: q.y });
  } else if (pick === 1) {   // call the ants
    if (liveAnts(s) < 5) for (const k of [-1, 1]) spawnAnt(s, q.x + k * 2, q.y + 1.6, q.cycle % 4 === 1 ? 'soldier' : 'ant');
  } else if (p) {   // charge
    const dx = p.x - q.x, dy = p.y - q.y, d = len(dx, dy) || 1;
    q.tx = q.x + (dx / d) * 14; q.ty = q.y + (dy / d) * 14;
    q.state = 'aim'; q.act = C.CHARGE_WARN;
    s.events.push({ type: 'aim', x: q.x, y: q.y });
  }
}

function updateWarns(s) {
  for (const w of s.warns) {
    w.t -= C.DT;
    if (w.t > 0) continue;
    w.done = true;
    s.events.push({ type: 'splash', x: w.x, y: w.y, r: w.r });
    for (const p of s.players) if (alive(p) && len(p.x - w.x, p.y - w.y) < w.r + C.R * 0.5) hurt(s, p, w);
  }
  s.warns = s.warns.filter((w) => !w.done);
}

// ---------------------------------------------------------------- the pantry's light

// what fire lights in the dark: burning puddles, blasts, sparks in flight, and a little around each of you
export function lights(s) {
  const out = [];
  for (const p of s.players) if (alive(p)) out.push([p.x, p.y, 2.2]);
  for (const pd of s.puddles) if (pd.burn > 0) out.push([pd.x, pd.y, 3.4 * Math.min(1, pd.burn / 1.2 + 0.3)]);
  for (const b of s.shots) if (b.kind === 'spark') out.push([b.x, b.y, 1.6]);
  return out;
}
function lit(s, x, y) { return lights(s).some(([lx, ly, r]) => len(lx - x, ly - y) < r); }

function lightsOn(s, sw) {
  sw.on = true; s.dark = false; s.light = true;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.grid[y][x] === 'E') s.grid[y][x] = '.';
  s.events.push({ type: 'lightsOn', x: sw.x, y: sw.y });
}

// ---------------------------------------------------------------- where you've got to

function progress(s) {
  const front = Math.max(...s.players.filter(alive).map((p) => p.x), -1);
  for (const cp of s.ents) {
    if (cp.type !== 'cp' || cp.reached || front < cp.x - 0.5) continue;
    if (!s.players.every((p) => !alive(p) || p.x > cp.x - 6)) continue;   // both through (or down)
    cp.reached = true; s.cp = cp.i;
    s.events.push({ type: 'checkpoint', x: cp.x, y: cp.y, name: cp.name });
    if (cp.dark && !s.light) { s.dark = true; s.events.push({ type: 'lightsOut', x: cp.x, y: cp.y }); }
    if (cp.boss) startBoss(s, cp);
  }
}

function startBoss(s, cp) {
  const q = queenOf(s);
  if (!q || q.state !== 'sleep') return;
  q.state = 'walk'; q.n = 1.5;
  // the door shuts behind you
  for (let y = 9; y <= 12; y++) s.grid[y][147] = '#';
  for (const p of s.players) if (p.x < cp.x - 1 || !alive(p)) { p.x = cp.x; p.y = cp.y + (p.id ? 0.6 : -0.6); p.down = 0; p.fall = 0; p.hp = Math.max(1, p.hp); }
  s.events.push({ type: 'bossStart', x: q.x, y: q.y });
}

// ---------------------------------------------------------------- the Sprinkle Gallery

function galleryStep(s, g) {
  const onPad = (p) => alive(p) && Math.abs(p.x - g.x) < 1.4 && Math.abs(p.y - g.y) < 0.9;
  if (g.phase === 'rest') { if ((g.rest -= C.DT) <= 0) { g.phase = 'idle'; g.winner = -1; } return; }
  if (g.phase === 'idle') {
    g.wait = s.players.every(onPad) ? g.wait + C.DT : 0;
    if (g.wait >= 0.8) { g.phase = 'run'; g.t = C.SHOOTOUT_TIME; g.score = [0, 0]; g.targets = []; g.spawnT = 0; s.events.push({ type: 'raceGo' }); }
    return;
  }
  g.t -= C.DT;
  for (const t of g.targets) { t.x += t.v * C.DT; if (t.x < g.x0 || t.x > g.x1) t.hit = true; }
  g.targets = g.targets.filter((t) => !t.hit);
  if ((g.spawnT -= C.DT) <= 0 && g.targets.length < 4) {
    g.spawnT = 0.45 + rnd(s) * 0.4;
    const right = rnd(s) < 0.5;
    g.targets.push({ x: right ? g.x0 + 0.1 : g.x1 - 0.1, y: g.ty + (rnd(s) < 0.5 ? 0 : 0.9), v: (right ? 1 : -1) * (2.5 + rnd(s) * 2.5), c: rnd(s) * 6 | 0, hit: false });
  }
  if (g.t <= 0) {
    g.phase = 'rest'; g.rest = 3; g.targets = [];
    g.winner = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
    s.events.push({ type: 'galleryEnd', who: g.winner, score: [...g.score] });
  }
}
