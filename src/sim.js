// The truth. The only module that mutates a run. Pure: no DOM, no clock, no ambient randomness
// (mini-games draw from a seeded sfc32 whose state words live in the run).
import * as C from './config.js';
import { chapterById } from './levels.js';
import { createWorld, step as tdStep } from './td/sim.js';
import { WORLD } from './td/world.js';

export const SUGAR = 0;
export const SPICE = 1;
export const NAMES = ['Sugar', 'Spice'];

const EPS = 1e-6;
const SOLID_BASE = '#Lx%VTK';   // T trampoline, K piano key (the Yard)

export const NO_INPUT = Object.freeze({
  left: false, right: false, down: false, jump: false, ability: false,
  jumpPressed: false, abilityPressed: false, up: false,
});

// ---------------------------------------------------------------- setup

export function createRun(chapterId, opts = {}) {
  if (chapterId === 'world') return createWorld(WORLD, opts);   // the top-down open world
  const ch = typeof chapterId === 'object' ? chapterId : chapterById(chapterId);   // tests pass a map
  if (!ch) throw new Error(`no chapter ${chapterId}`);
  const grid = ch.map.map((row) => row.split(''));
  const h = grid.length;
  const w = grid[0].length;
  const spawns = [null, null];
  const plates = [];
  const vents = [];
  let heartsTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = grid[y][x];
      if (t === 'P' || t === 'Q') { spawns[t === 'P' ? 0 : 1] = { x, y }; grid[y][x] = '.'; }
      else if (t >= '1' && t <= '8') plates.push({ x, y, g: plateGroup(t), heavy: t >= '5', ceil: false });
      else if (t === 'h') heartsTotal++;
      else if (t === '$' && opts.stars && opts.stars.includes(starKey(x, y))) grid[y][x] = '.';   // already found
    }
  }
  // the Yard: a district's gate is wall until its chapter is unlocked (an input, like the map)
  const unlocked = opts.unlocked ?? 1;
  for (const e of ch.ents || []) if (e.type === 'gate' && unlocked <= e.need) for (let y = e.y0; y <= e.y1; y++) grid[y][e.x] = '#';
  // a plate with a ceiling over it and air under it is pressed from below (upside-down feet)
  for (const pl of plates) {
    const below = tileRaw(grid, w, h, pl.x, pl.y + 1), above = tileRaw(grid, w, h, pl.x, pl.y - 1);
    pl.ceil = !SOLID_BASE.includes(below) && SOLID_BASE.includes(above);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] !== 'V') continue;
    let top = y;
    while (top > 0 && y - top < C.VENT_REACH && !SOLID_BASE.includes(grid[top - 1][x])) top--;
    vents.push({ x, top, bottom: y });
  }
  const ents = (ch.ents || []).map((e, i) => ({ ...e, i, t: 0, x: e.path ? e.path[0][0] : e.x, y: e.path ? e.path[0][1] : e.y, prevX: 0, prevY: 0, spin: 0, ...toyState(e, unlocked) }));
  for (const e of ents) { placeMover(e); e.prevX = e.x; e.prevY = e.y; }
  for (const e of ents) if (e.type === 'sign' && e.y === undefined) {   // stand it on the floor below
    const cx = Math.floor(e.x);
    let y = h - 1;
    while (y > 0 && !(SOLID_BASE.includes(tileRaw(grid, w, h, cx, y)) && !SOLID_BASE.includes(tileRaw(grid, w, h, cx, y - 1)))) y--;
    if (y > 0 && SOLID_BASE.includes(tileRaw(grid, w, h, cx, h - 1))) { while (y < h - 1 && !SOLID_BASE.includes(tileRaw(grid, w, h, cx, y))) y++; }
    e.y = y > 0 ? y : 13;
  }
  const mode = ch.mini || 'chapter';
  const s = {
    chapterId: ch.id, mode, bonk: mode === 'bonk', powers: ch.powers, zones: ch.zones || null,
    gentle: !!opts.gentle,
    w, h, grid, plates, vents, spawns, ents,
    pressed: [false, false, false, false, false], held: [], sources: [],
    checkpoint: null, frozen: false,
    players: [0, 1].map((id) => makePlayer(id, ch)),
    pins: [], shots: [], gusts: [], drops: [],
    hearts: 0, heartsTotal,
    talked: [],
    flood: ch.flood ? { ...ch.flood, y: ch.flood.y0, active: false } : null,
    score: [0, 0], winner: -1, round: 0, holder: -1, fuse: 0, passCool: 0, timeLeft: 0, nextDrop: 0,
    rng: seedWords(opts.seed ?? 20261012),
    complete: false, time: 0, tick: 0,
    yard: !!ch.yard, unlocked, starsGot: 0, starsTotal: 0,
    events: [],
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '$') s.starsTotal++;
  for (const p of s.players) placeAtSpawn(s, p);
  if (opts.at) {   // the Yard: come back out of the door you went in by
    const d = ents.find((e) => e.type === 'door' && e.id === opts.at);
    if (d) for (const p of s.players) { p.x = d.x + 1 + (p.id === SUGAR ? -0.55 : 0.55) - p.w / 2; p.y = d.y - p.h; p.prevY = p.y; }
  }
  if (mode === 'rain') s.timeLeft = C.RAIN_TIME;
  if (mode === 'potato') startPotatoRound(s);
  return s;
}

function makePlayer(id, ch) {
  const pw = id === SUGAR ? ch.powers.sugar : ch.powers.spice;
  const size = pw === 'size' ? 'small' : 'normal';
  return {
    id, x: 0, y: 0, w: C.SIZE[size].w, h: C.SIZE[size].h, size, grav: 1,
    vx: 0, vy: 0, facing: id === SUGAR ? 1 : -1,
    onGround: false, coyote: 0, jumpBuf: 0, standOn: -1, ride: -1,
    slamming: false, launched: false, bright: false, freezing: false, gliding: false,
    stun: 0, cool: 0, pushT: 0, dashT: 0, airUsed: false,
    dead: false, deadT: 0, prevY: 0, wave: 0, safe: null, landT: 0, safeCandidate: false,
    landed: false, slamY: 0, keyCell: -1,
  };
}

export function plateGroup(t) {
  const n = t.charCodeAt(0) - 48;          // '1'..'8'
  return n > 4 ? n - 4 : n;
}
export const starKey = (x, y) => `${x}:${y}`;

// Per-toy state lives on its entity, so it is part of the run (and of the online fingerprint).
function toyState(e, unlocked) {
  switch (e.type) {
    case 'door': return { locked: unlocked <= e.need, wait: 0 };
    case 'race': return { phase: 'idle', count: 0, clock: 0, rest: 0, winner: -1 };
    case 'balloons': return { n: [0, 0], rest: 0, winner: -1 };
    case 'ball': return { vx: 0, vy: 0, hx: e.x, hy: e.y, score: [0, 0], wait: 0, kick: [0, 0], winner: -1, rest: 0 };
    case 'bench': return { sit: 0, n: 0 };
    case 'striker': return { puck: 0, best: 0 };
    default: return {};
  }
}

const doorGroup = (t) => t.charCodeAt(0) - 64;     // 'A'..'D' -> 1..4
const bridgeGroup = (t) => t.charCodeAt(0) - 96;   // 'a'..'d' -> 1..4
function tileRaw(grid, w, h, x, y) {
  if (x < 0 || x >= w) return '#';
  if (y < 0 || y >= h) return '.';
  return grid[y][x];
}

// The power a player has where they stand (the finale changes powers by zone).
export function powerOf(s, p) {
  if (s.zones) {
    const cx = p.x + p.w / 2;
    let z = s.zones[0];
    for (const zz of s.zones) if (cx >= zz.x) z = zz;
    return p.id === SUGAR ? z.powers.sugar : z.powers.spice;
  }
  return p.id === SUGAR ? s.powers.sugar : s.powers.spice;
}

function placeAtSpawn(s, p, at = null) {
  // a gentle-mode safe spot remembers the size you had there (small Spice in a tunnel
  // must come back small), and a spot you no longer fit in falls back to the checkpoint
  if (at && at.size && at.size !== p.size) {
    const { w, h } = C.SIZE[at.size];
    p.size = at.size; p.w = w; p.h = h;
  }
  if (at) {
    const g = at.grav || 1;
    const y = g > 0 ? at.y - p.h : at.y;
    if (rectHitsSolid(s, at.x - p.w / 2, y, p.w, p.h)) at = null;
  }
  let fx, fy;   // feet centre
  if (at) { fx = at.x; fy = at.y; }
  else if (s.checkpoint) {
    fx = s.checkpoint.x + 0.5 + (p.id === SUGAR ? -0.45 : 0.45);
    fy = s.checkpoint.y + 1;
  } else {
    const sp = s.spawns[p.id];
    fx = sp.x + 0.5;
    fy = sp.y + 1;
  }
  if (at) p.grav = at.grav || 1;
  else if (p.grav < 0) p.grav = 1;
  p.x = fx - p.w / 2;
  p.y = p.grav > 0 ? fy - p.h : fy;
  p.vx = 0; p.vy = 0; p.prevY = p.y;
  p.onGround = false; p.standOn = -1; p.ride = -1; p.slamming = false; p.stun = 0;
  p.dashT = 0; p.pushT = 0; p.gliding = false;
  p.dead = false; p.deadT = 0;
}

// ---------------------------------------------------------------- seeded rng (sfc32, state words saved)

function seedWords(seed) {
  const r = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 12; i++) rngNext(r);
  return r;
}
function rngNext(r) {
  let [a, b, c, d] = r;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  r[0] = a >>> 0; r[1] = b; r[2] = c; r[3] = d;
  return t / 4294967296;
}

// ---------------------------------------------------------------- world queries

export function tileAt(s, x, y) { return tileRaw(s.grid, s.w, s.h, x, y); }

export function lightRadius(s) {
  const sg = s.players[SUGAR];
  if (sg.dead || powerOf(s, sg) !== 'lantern') return 0;
  return sg.bright ? C.LIGHT_R_BRIGHT : C.LIGHT_R;
}

export function isLit(s, cx, cy) {
  const r = lightRadius(s);
  if (!r) return false;
  const sg = s.players[SUGAR];
  const dx = cx + 0.5 - (sg.x + sg.w / 2);
  const dy = cy + 0.5 - (sg.y + sg.h / 2);
  return dx * dx + dy * dy <= r * r;
}

function overlapsCell(p, cx, cy) {
  return p.x < cx + 1 - EPS && p.x + p.w > cx + EPS && p.y < cy + 1 - EPS && p.y + p.h > cy + EPS;
}

export function doorOpen(s, cx, cy) {
  const t = tileAt(s, cx, cy);
  if (s.pressed[doorGroup(t)]) return true;
  return s.held.includes(cy * s.w + cx);   // someone was standing in it at step start
}

export function solidTile(s, cx, cy) {
  const t = tileAt(s, cx, cy);
  if (SOLID_BASE.includes(t)) return true;
  if (t >= 'A' && t <= 'D') return !doorOpen(s, cx, cy);
  if (t >= 'a' && t <= 'd') return s.pressed[bridgeGroup(t)];
  if (t === '~') return isLit(s, cx, cy) && !s.held.includes(cy * s.w + cx);
  return false;
}

function rectHitsSolid(s, x, y, w, h) {
  for (let cy = Math.floor(y); cy <= Math.floor(y + h - EPS); cy++)
    for (let cx = Math.floor(x); cx <= Math.floor(x + w - EPS); cx++)
      if (solidTile(s, cx, cy)) return true;
  return false;
}

// ---------------------------------------------------------------- movers

// Platforms and saws ping-pong along a path, eased; their clock stops while frozen
// or while their plate group (if any) is unpressed.
function placeMover(e) {
  if (!e.path) return;
  const [a, b] = e.path;
  // ping-pong with smoothstep ease: pure arithmetic, so two browsers agree to the bit
  // (Math.cos is not guaranteed identical across engines, and online play replays inputs)
  const u = (e.t / e.period + (e.phase || 0)) % 1;
  const v = u < 0.5 ? u * 2 : 2 - u * 2;
  const f = v * v * (3 - 2 * v);
  e.x = a[0] + (b[0] - a[0]) * f;
  e.y = a[1] + (b[1] - a[1]) * f;
}

function updateMovers(s) {
  for (const e of s.ents) {
    e.prevX = e.x; e.prevY = e.y;
    if (e.type === 'pinwheel') { e.spin = Math.max(0, e.spin - C.DT); continue; }
    if (!e.path) continue;
    if (s.frozen) continue;
    if (e.g && (e.stop ? moverPowered(s, e) : !moverPowered(s, e))) continue;   // `stop`: a plate halts it
    e.t += C.DT;
    placeMover(e);
  }
}

// ---------------------------------------------------------------- movement

function moveX(s, p, dx) {
  if (!dx) return 0;
  const x0 = p.x;
  p.x += dx;
  const top = Math.floor(p.y + EPS), bot = Math.floor(p.y + p.h - EPS);
  const cx = dx > 0 ? Math.floor(p.x + p.w - EPS) : Math.floor(p.x + EPS);
  for (let cy = top; cy <= bot; cy++) {
    if (p.dashT > 0 && tileAt(s, cx, cy) === '%') {
      s.grid[cy][cx] = '.';
      s.events.push({ type: 'glass', x: cx + 0.5, y: cy + 0.5 });
    }
  }
  for (let cy = top; cy <= bot; cy++) {
    if (solidTile(s, cx, cy)) {
      p.x = dx > 0 ? cx - p.w : cx + 1;
      p.vx = 0;
      if (p.dashT > 0) p.dashT = 0;
      break;
    }
  }
  return p.x - x0;
}

// One-way platforms an upright player can land on: pins (Spice only), moving
// platforms, and the other's head.
function platformsFor(s, p) {
  const out = [];
  if (p.grav < 0) return out;
  if (p.id === SPICE) for (const pin of s.pins) out.push({ x: pin.x, y: pin.y, w: 1, prevY: pin.y, who: -1, ride: -1 });
  for (const e of s.ents) if (e.type === 'platform') out.push({ x: e.x, y: e.y, w: e.w, prevY: e.prevY, who: -1, ride: e.i });
  for (const o of s.players) {
    if (o === p || o.dead || o.grav < 0) continue;
    out.push({ x: o.x, y: o.y, w: o.w, prevY: o.prevY, who: o.id, ride: -1 });
  }
  return out;
}

// Returns null, or what it landed on: { who, ride } (who/ride -1 for tiles and pins).
function moveY(s, p, dy) {
  const prevBottom = p.y + p.h, prevTop = p.y;
  p.y += dy;
  const left = Math.floor(p.x + EPS), right = Math.floor(p.x + p.w - EPS);
  if (dy > 0) {
    const cy = Math.floor(p.y + p.h - EPS);
    let landTop = Infinity, landed = null;
    for (let cx = left; cx <= right; cx++) {
      if (solidTile(s, cx, cy) && cy >= prevBottom - 0.5) { landTop = cy; landed = { who: -1, ride: -1 }; break; }
    }
    for (const pl of platformsFor(s, p)) {
      if (p.x < pl.x + pl.w && p.x + p.w > pl.x && prevBottom <= pl.prevY + 0.05 && p.y + p.h >= pl.y && pl.y < landTop) {
        landTop = pl.y; landed = { who: pl.who, ride: pl.ride };
      }
    }
    if (landed) {
      p.y = landTop - p.h; p.vy = 0;
      // a support that rises (a head, a lift) must not shove its rider into a ceiling:
      // the rider is squeezed off under the ceiling instead
      if ((landed.who >= 0 || landed.ride >= 0) && rectHitsSolid(s, p.x, p.y, p.w, p.h)) {
        p.y = Math.floor(p.y + EPS) + 1;
        return null;
      }
    }
    return p.grav > 0 ? landed : null;
  }
  if (dy < 0) {
    const cy = Math.floor(p.y + EPS);
    for (let cx = left; cx <= right; cx++) {
      if (solidTile(s, cx, cy) && cy + 1 <= prevTop + 0.5) {
        p.y = cy + 1; p.vy = 0;
        return p.grav < 0 ? { who: -1, ride: -1 } : null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- step

export function step(s, inputs) {
  if (s.td) return tdStep(s, inputs);
  s.events.length = 0;
  if (s.complete) return s;
  s.tick++;
  s.time = s.tick * C.DT;
  if (s.mode === 'chapter' && inputs.some((i) => i && i.regroup)) {
    for (const p of s.players) { p.grav = 1; placeAtSpawn(s, p); }
    s.events.push({ type: 'regroup' });
  }
  s.pressed = computePressed(s);
  s.held = heldDoors(s);
  s.frozen = s.players.some((p) => p.freezing && !p.dead);
  updateMovers(s);

  // ride moving platforms down/sideways before moving
  for (const p of s.players) {
    if (p.dead || p.ride < 0) continue;
    const e = s.ents[p.ride];
    moveX(s, p, e.x - e.prevX);
    if (e.y > e.prevY) moveY(s, p, e.y - e.prevY);
  }

  const dxs = [0, 0];
  for (const p of s.players) {
    p.prevY = p.y;
    dxs[p.id] = updatePlayer(s, p, inputs[p.id] || NO_INPUT);
  }
  // riders move with whoever they stand on
  for (const p of s.players) {
    if (p.dead || p.standOn < 0) continue;
    const o = s.players[p.standOn];
    if (o.dead) { p.standOn = -1; continue; }
    moveX(s, p, dxs[o.id]);
    if (o.id > p.id) { const dy = o.y - o.prevY; if (dy < 0) moveY(s, p, dy); }
  }
  if (s.mode === 'chapter' && !s.ents.some((e) => e.type === 'race' && e.phase === 'run')) leash(s, dxs);
  updateShots(s);
  updateGusts(s);
  if (s.flood) updateFlood(s);
  for (const p of s.players) touch(s, p);
  // only a place you survived counts as safe (spikes are checked first)
  for (const p of s.players) { if (p.safeCandidate && !p.dead) noteSafe(s, p); p.safeCandidate = false; }
  for (const e of s.ents) if (e.type === 'talk' && !s.talked.includes(e.id) && s.players.some((p) => !p.dead && p.x + p.w / 2 >= e.x)) {
    s.talked.push(e.id);
    s.events.push({ type: 'talk', id: e.id });
  }
  if (s.yard) updateYard(s);
  if (s.mode === 'rain') updateRain(s);
  if (s.mode === 'potato') updatePotato(s);
  if (s.mode === 'chapter') {
    const [a, b] = s.players;
    if (!a.dead && !b.dead && inGoal(s, a) && inGoal(s, b)) {
      s.complete = true;
      s.events.push({ type: 'complete' });
    }
  }
  return s;
}

// Door cells someone overlaps right now: a door never closes on a player.
function heldDoors(s) {
  const out = [];
  for (const p of s.players) {
    if (p.dead) continue;
    for (let cy = Math.floor(p.y + EPS); cy <= Math.floor(p.y + p.h - EPS); cy++)
      for (let cx = Math.floor(p.x + EPS); cx <= Math.floor(p.x + p.w - EPS); cx++) {
        const t = tileAt(s, cx, cy);
        if (((t >= 'A' && t <= 'D') || t === '~') && overlapsCell(p, cx, cy)) out.push(cy * s.w + cx);   // doors and lantern stones never close on anyone
      }
  }
  return out;
}

function computePressed(s) {
  const pressed = [false, false, false, false, false];
  s.sources = [];   // where each pressed switch is, so movers answer only their own
  for (const pl of s.plates) {
    for (const p of s.players) {
      if (p.dead) continue;
      if (pl.heavy && p.size !== 'big') continue;
      if (!(p.x < pl.x + 1 && p.x + p.w > pl.x)) continue;
      // feet in the plate's floor quarter (or ceiling quarter, for a ceiling plate)
      const hit = pl.ceil
        ? p.grav < 0 && p.y < pl.y + 0.25 && p.y + p.h > pl.y
        : p.grav > 0 && p.y + p.h > pl.y + 0.75 && p.y < pl.y + 1;
      if (hit) { pressed[pl.g] = true; s.sources.push({ g: pl.g, x: pl.x + 0.5 }); break; }
    }
  }
  for (const e of s.ents) if (e.type === 'pinwheel' && e.spin > 0) { pressed[e.g] = true; s.sources.push({ g: e.g, x: e.x + 0.5 }); }
  return pressed;
}

// A mover answers a switch of its colour only if that switch is near it: the same
// colour can run two machines in two parts of a chapter without one moving the other.
const MOVER_REACH = 30;
function moverPowered(s, e) {
  const mid = e.path ? (e.path[0][0] + e.path[1][0]) / 2 : e.x;
  return s.sources.some((q) => q.g === e.g && Math.abs(q.x - mid) < MOVER_REACH);
}

function updatePlayer(s, p, inp) {
  if (p.dead) {
    p.deadT -= C.DT;
    if (p.deadT <= 0) {
      placeAtSpawn(s, p, (s.gentle || s.yard) && p.safe ? p.safe : null);
      s.events.push({ type: 'respawn', who: p.id });
    }
    return 0;
  }
  if (p.wave > 0) p.wave -= C.DT;
  if (p.cool > 0) p.cool -= C.DT;
  if (p.landT > 0) p.landT -= C.DT;
  if (p.stun > 0) { p.stun -= C.DT; inp = NO_INPUT; }

  const power = powerOf(s, p);
  if (p.size !== 'normal' && power !== 'size') resize(s, p, 'normal');
  if (p.grav < 0 && power !== 'flip') { p.grav = 1; p.onGround = false; }

  // abilities
  p.bright = false; p.freezing = false;
  if (inp.abilityPressed) useAbility(s, p, power);
  if (power === 'lantern' && inp.ability && p.onGround) p.bright = true;
  if (power === 'freeze' && inp.ability && p.onGround) p.freezing = true;

  // horizontal
  let want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (p.slamming || p.bright || p.freezing) want = 0;
  if (want) p.facing = want;
  const target = want * C.RUN * (p.size === 'small' ? 0.9 : 1);
  if (p.dashT > 0) {
    p.dashT -= C.DT;
    p.vx = p.dashT > 0 ? p.facing * C.DASH_V : p.facing * C.RUN;   // ends at running speed, not a slide
    p.vy = 0;
  } else if (p.pushT > 0) {
    p.pushT -= C.DT;   // gusted: the wind steers, not the stick
  } else {
    const accel = p.stun > 0 ? 10 : p.onGround ? C.ACCEL_GROUND : C.ACCEL_AIR;
    if (p.vx < target) p.vx = Math.min(target, p.vx + accel * C.DT);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * C.DT);
  }

  // jump: buffered press + coyote time
  p.jumpBuf = inp.jumpPressed ? C.JUMP_BUFFER : Math.max(0, p.jumpBuf - C.DT);
  p.coyote = p.onGround ? C.COYOTE : Math.max(0, p.coyote - C.DT);
  if (p.jumpBuf > 0 && p.coyote > 0 && !p.slamming && p.dashT <= 0) {
    p.vy = -p.grav * (p.size === 'big' ? C.BIG_JUMP_V : C.JUMP_V);
    p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.standOn = -1; p.ride = -1;
    s.events.push({ type: 'jump', who: p.id });
  }
  const rising = p.vy * p.grav < 0;
  if (!inp.jump && rising && !p.launched && p.pushT <= 0) p.vy *= 1 - C.JUMP_CUT * 0.5;
  if (!rising) p.launched = false;

  // gravity, glide, vents
  if (p.dashT <= 0) {
    p.vy += p.grav * C.GRAVITY * C.DT;
    const maxFall = p.slamming ? C.SLAM_V : C.MAX_FALL;
    p.vy = p.grav > 0 ? Math.min(maxFall, p.vy) : Math.max(-maxFall, p.vy);
  }
  p.gliding = power === 'glide' && inp.jump && !p.onGround && p.vy * p.grav > 0 - 1e-9 && p.dashT <= 0;
  const inVent = ventAt(s, p);
  if (power === 'glide' && inp.jump && !p.onGround && inVent) {
    p.gliding = true;
    p.vy = Math.max(-C.VENT_MAX, p.vy - C.VENT_LIFT * C.DT);
  } else if (p.gliding) p.vy = Math.min(p.vy, C.GLIDE_FALL);

  const dx = moveX(s, p, p.vx * C.DT);
  const wasGround = p.onGround;
  const vyBefore = p.vy;
  const landed = moveY(s, p, p.vy * C.DT);
  p.landed = !!landed && !wasGround;
  p.onGround = !!landed;
  p.standOn = landed ? landed.who : -1;
  p.ride = landed ? landed.ride : -1;

  if (landed) {
    p.airUsed = false;
    if (s.bonk && p.standOn >= 0 && vyBefore >= C.BONK_MIN_VY) bonk(s, p, s.players[p.standOn]);
    else if (p.slamming) slamLand(s, p);
    else if (!wasGround && vyBefore > 3 && p.grav > 0 && feetCells(p).some(([cx, cy]) => tileAt(s, cx, cy) === 'T')) {
      p.vy = -(inp.jump ? C.TRAMP_V_HELD : C.TRAMP_V); p.onGround = false; p.standOn = -1; p.ride = -1; p.launched = true;
      s.events.push({ type: 'boing', who: p.id, x: p.x + p.w / 2, y: p.y + p.h });
    }
    else if (!wasGround && Math.abs(vyBefore) > 8) { p.landT = 0.12; s.events.push({ type: 'land', who: p.id, x: p.x + p.w / 2, y: p.grav > 0 ? p.y + p.h : p.y, hard: Math.abs(vyBefore) > 18 }); }
    p.safeCandidate = p.standOn < 0 && p.ride < 0;   // recorded after hazards are checked this step
  }
  return dx;
}

function ventAt(s, p) {
  const cx = Math.floor(p.x + p.w / 2);
  const cy = p.y + p.h / 2;
  return s.vents.some((v) => v.x === cx && cy >= v.top && cy < v.bottom + 0.2);
}

// Gentle mode puts you back where you last stood on something that cannot vanish.
function noteSafe(s, p) {
  const feetRow = p.grav > 0 ? Math.floor(p.y + p.h + 0.01) : Math.floor(p.y - 0.01);
  const cells = [];
  for (let cx = Math.floor(p.x + EPS); cx <= Math.floor(p.x + p.w - EPS); cx++) cells.push(tileAt(s, cx, feetRow));
  if (cells.every((t) => t === '#' || t === 'L')) p.safe = { x: p.x + p.w / 2, y: p.grav > 0 ? p.y + p.h : p.y, grav: p.grav, size: p.size };
}

function resize(s, p, next) {
  const { w, h } = C.SIZE[next];
  const nx = p.x + p.w / 2 - w / 2, ny = p.y + p.h - h;
  if (rectHitsSolid(s, nx, ny, w, h)) return false;
  p.size = next; p.x = nx; p.y = ny; p.w = w; p.h = h; p.prevY = ny;
  return true;
}

function useAbility(s, p, power) {
  const o = s.players[1 - p.id];
  switch (power) {
    case 'pin': {
      s.shots.push({ x: p.x + p.w / 2, y: p.y + p.h * 0.45, dir: p.facing, dist: 0 });
      s.events.push({ type: 'pin', who: p.id });
      break;
    }
    case 'slam': {
      if (!p.onGround && !p.slamming) {
        p.slamming = true; p.vx = 0; p.vy = C.SLAM_V; p.slamY = p.y + p.h;
        s.events.push({ type: 'slam', who: p.id });
      }
      break;
    }
    case 'size': {
      const next = p.size === 'small' ? 'big' : 'small';
      if (resize(s, p, next)) s.events.push({ type: next, who: p.id });
      else s.events.push({ type: 'nope', who: p.id });
      break;
    }
    case 'flip': {
      if (p.airUsed) { s.events.push({ type: 'nope', who: p.id }); break; }
      p.grav = -p.grav; p.onGround = false; p.standOn = -1; p.ride = -1; p.airUsed = true;
      for (const r of s.players) if (r.standOn === p.id) r.standOn = -1;
      s.events.push({ type: 'flip', who: p.id });
      break;
    }
    case 'swap': {
      if (p.cool > 0 || o.dead) { s.events.push({ type: 'nope', who: p.id }); break; }
      const ax = p.x + p.w / 2, ay = p.y + p.h / 2, bx = o.x + o.w / 2, by = o.y + o.h / 2;
      const from = { x: ax, y: ay };
      for (const [q, cx, cy] of [[p, bx, by], [o, ax, ay]]) {
        q.x = cx - q.w / 2; q.y = cy - q.h / 2; q.prevY = q.y;   // a teleport: reset tracking
        q.vx = 0; q.vy = 0; q.onGround = false; q.standOn = -1; q.ride = -1; q.slamming = false;
      }
      p.cool = C.SWAP_COOLDOWN;
      s.events.push({ type: 'swap', who: p.id, x: from.x, y: from.y, x2: bx, y2: by });
      break;
    }
    case 'gust': {
      if (p.cool > 0) break;
      p.cool = C.GUST_COOLDOWN;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const box = { x0: p.facing > 0 ? cx : cx - C.GUST_LEN, x1: p.facing > 0 ? cx + C.GUST_LEN : cx, y0: cy - C.GUST_H / 2, y1: cy + C.GUST_H / 2, dir: p.facing, life: 0.3 };
      s.gusts.push(box);
      s.events.push({ type: 'gust', who: p.id, x: cx, y: cy, dir: p.facing });
      if (!o.dead) {
        const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
        if (ox >= box.x0 && ox <= box.x1 && oy >= box.y0 && oy <= box.y1) {
          o.vx = p.facing * C.GUST_PUSH;
          o.vy = Math.min(o.vy, -C.GUST_LIFT);
          o.pushT = C.GUST_TIME; o.onGround = false; o.standOn = -1; o.ride = -1;
          s.events.push({ type: 'blown', who: o.id });
        }
      }
      for (const e of s.ents) {
        if (e.type !== 'pinwheel') continue;
        if (e.x + 0.5 >= box.x0 && e.x + 0.5 <= box.x1 && e.y + 0.5 >= box.y0 - 0.5 && e.y + 0.5 <= box.y1 + 0.5) {
          e.spin = C.PINWHEEL_SPIN;
          s.events.push({ type: 'pinwheel', x: e.x + 0.5, y: e.y + 0.5 });
        }
      }
      break;
    }
    case 'dash': {
      if (p.airUsed && !p.onGround) { s.events.push({ type: 'nope', who: p.id }); break; }
      p.dashT = C.DASH_TIME; p.airUsed = !p.onGround; p.vy = 0;
      s.events.push({ type: 'dash', who: p.id });
      break;
    }
    case 'lantern': case 'freeze': case 'glide': break;   // held, see updatePlayer
    default:
      p.wave = 1.2;
      s.events.push({ type: 'wave', who: p.id });
  }
}

function feetCells(p) {
  const cy = p.grav > 0 ? Math.floor(p.y + p.h + 0.01) : Math.floor(p.y - 0.01);
  const out = [];
  for (let cx = Math.floor(p.x + EPS); cx <= Math.floor(p.x + p.w - EPS); cx++) out.push([cx, cy]);
  return out;
}

function slamLand(s, p) {
  p.slamming = false;
  s.events.push({ type: 'thud', who: p.id, x: p.x + p.w / 2, y: p.y + p.h });
  let broke = false, fired = false;
  for (const [cx, cy] of feetCells(p)) {
    const t = tileAt(s, cx, cy);
    if (t === 'x') {
      for (let k = cx; tileAt(s, k, cy) === 'x'; k--) s.grid[cy][k] = '.';
      for (let k = cx + 1; tileAt(s, k, cy) === 'x'; k++) s.grid[cy][k] = '.';
      broke = true;
    } else if (t === 'L') fired = true;
  }
  if (broke) { p.onGround = false; s.events.push({ type: 'crate', x: p.x + p.w / 2, y: p.y + p.h }); }
  if (fired) {
    for (const o of s.players) {
      if (o === p || o.dead || !o.onGround) continue;
      if (Math.abs(o.x - p.x) > C.LAUNCH_REACH) continue;
      if (!feetCells(o).some(([cx, cy]) => tileAt(s, cx, cy) === 'L')) continue;
      o.vy = -C.LAUNCH_V; o.onGround = false; o.standOn = -1; o.ride = -1; o.launched = true;
      s.events.push({ type: 'launch', who: o.id });
    }
  }
}

function bonk(s, top, under) {
  top.vy = -14; top.onGround = false; top.standOn = -1;
  if (under.stun > 0) return;   // one point per bonk, not per bounce
  under.stun = C.BONK_STUN;
  under.vx = (under.x + under.w / 2 >= top.x + top.w / 2 ? 1 : -1) * 9;   // knocked aside: no farming one head
  s.score[top.id]++;
  s.events.push({ type: 'bonk', who: top.id });
  if (s.score[top.id] >= C.BONK_WIN) {
    s.winner = top.id; s.complete = true;
    s.events.push({ type: 'complete', who: top.id });
  }
}

function leash(s, dxs) {
  const [a, b] = s.players;
  if (a.dead || b.dead) return;
  const gap = (b.x + b.w / 2) - (a.x + a.w / 2);
  const over = Math.abs(gap) - C.LEASH_X;
  if (over <= 0) return;
  const dir = Math.sign(gap);   // +1: b is right of a
  // a player in the air is never stopped: that would drop them into a pit mid-glide
  const awayA = -dir * dxs[0] > 0 && a.onGround, awayB = dir * dxs[1] > 0 && b.onGround;
  // undo at most this step's own movement: after a respawn the gap can be huge, and
  // pulling the whole overshoot at once would carry someone through walls
  if (awayA) moveX(s, a, dir * Math.min(over, Math.abs(dxs[0])));
  if (awayB) moveX(s, b, -dir * Math.min(over, Math.abs(dxs[1])));
}

function updateShots(s) {
  for (const sh of s.shots) {
    const stepLen = C.PIN_SPEED * C.DT;
    sh.x += sh.dir * stepLen;
    sh.dist += stepLen;
    const cx = Math.floor(sh.x), cy = Math.floor(sh.y);
    const t = tileAt(s, cx, cy);
    if (t === '#' && cy >= 0) {
      const px = sh.dir > 0 ? cx - 1 : cx + 1;
      s.pins.push({ x: px, y: sh.y });
      if (s.pins.length > C.PIN_MAX) s.pins.shift();
      s.events.push({ type: 'pinned', x: sh.dir > 0 ? cx : cx + 1, y: sh.y });
      sh.done = true;
    } else if (solidTile(s, cx, cy) || sh.dist > C.PIN_RANGE) sh.done = true;
  }
  s.shots = s.shots.filter((sh) => !sh.done);
}

function updateGusts(s) {
  for (const g of s.gusts) g.life -= C.DT;
  s.gusts = s.gusts.filter((g) => g.life > 0);
}

function updateFlood(s) {
  const f = s.flood;
  if (!f.active && s.players.some((p) => p.x > f.startX)) {
    f.active = true;
    s.events.push({ type: 'flood' });
    // the climb's own checkpoint counts from the moment the water starts, so a
    // partner left behind comes back above the water, not under it
    for (let x = f.startX; x > f.startX - 8; x--) for (let y = 0; y < s.h; y++) if (s.grid[y][x] === '!') { s.checkpoint = { x, y }; x = -1; break; }
  }
  if (!f.active) return;
  f.y = Math.max(f.stopY, f.y - f.speed * C.DT);
  for (const p of s.players) {
    if (!p.dead && p.y + p.h * 0.5 > f.y) {
      kill(s, p);
      // never a death loop: the water drops back below the place you come back to
      const back = s.checkpoint ? s.checkpoint.y + 1 + f.grace : f.y0;
      f.y = Math.max(f.y, Math.min(f.y0, back));
    }
  }
}

// ---------------------------------------------------------------- the Yard: doors and toys
// Nothing here can stop you finishing anything: toys keep their own score and reset.

const live = (s) => s.players.filter((p) => !p.dead);
const within = (p, x0, x1, ft) => p.x + p.w / 2 >= x0 && p.x + p.w / 2 <= x1 && p.onGround && p.grav > 0 && Math.abs(p.y + p.h - ft) < 0.05;

function updateYard(s) {
  const both = live(s).length === 2;
  for (const e of s.ents) {
    switch (e.type) {
      case 'door': {   // both of you in the doorway, a moment, and in you go
        const here = both && s.players.every((p) => within(p, e.x - 0.2, e.x + 2.2, e.y));
        if (!here) { e.wait = 0; break; }
        if (e.wait < 0) break;   // already went (or bumped a lock) this visit
        e.wait += C.DT;
        if (e.wait >= C.DOOR_TIME) { e.wait = -1; s.events.push({ type: e.locked ? 'locked' : 'enter', id: e.id }); }
        break;
      }
      case 'race': raceStep(s, e, both); break;
      case 'balloons': balloonStep(s, e); break;
      case 'ball': ballStep(s, e); break;
      case 'bench': {   // sit still on it together for a moment
        if (e.sit < 0) { e.sit = Math.min(0, e.sit + C.DT); break; }   // after a cuddle, a little pause
        const sitting = both && s.players.every((p) => within(p, e.x, e.x + e.w, e.y) && Math.abs(p.vx) < 0.5);
        e.sit = sitting ? e.sit + C.DT : 0;
        if (e.sit >= C.BENCH_TIME) { s.events.push({ type: 'cuddle', n: e.n++, x: e.x + e.w / 2, y: e.y - 1.5 }); e.sit = -4; }
        break;
      }
      case 'striker': {
        if (e.puck > 0) e.puck = Math.max(0, e.puck - C.DT * 4);
        for (const ev of s.events) {
          if (ev.type !== 'thud' || Math.abs(ev.x - (e.x + 0.5)) > 0.9 || Math.abs(ev.y - e.y) > 0.05) continue;
          const p = s.players[ev.who];
          const h = Math.max(0, Math.round((ev.y - p.slamY) * 10) / 10);
          e.puck = Math.min(e.top, h); e.best = Math.max(e.best, h);
          s.events.push({ type: 'strike', who: ev.who, h, bell: h >= e.top });
        }
        break;
      }
    }
  }
  // floor piano: a note each time a foot finds a new key
  for (const p of s.players) {
    if (p.dead || !p.onGround || p.grav < 0) { p.keyCell = -1; continue; }
    const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h + 0.01);
    const cell = tileAt(s, cx, cy) === 'K' ? cy * s.w + cx : -1;
    if (cell >= 0 && cell !== p.keyCell) { const pi = s.ents.find((e) => e.type === 'piano'); s.events.push({ type: 'note', who: p.id, x: cx, y: cy, k: pi ? cx - pi.x : 0 }); }
    p.keyCell = cell;
  }
}

// Race: both on the start flag -> 3-2-1 -> first to the finish flag. The flags are e.x and e.x1.
function raceStep(s, e, both) {
  if (e.phase === 'rest') { e.rest -= C.DT; if (e.rest <= 0) { e.phase = 'idle'; e.winner = -1; } return; }
  const atStart = both && s.players.every((p) => within(p, e.x - 1.6, e.x + 1.6, e.y));
  if (e.phase === 'idle') { if (atStart) { e.phase = 'count'; e.count = C.RACE_COUNT; } return; }
  if (e.phase === 'count') {
    if (!atStart) { e.phase = 'idle'; return; }
    const before = Math.ceil(e.count);
    e.count -= C.DT;
    if (Math.ceil(e.count) !== before && e.count > 0) s.events.push({ type: 'tick3', n: Math.ceil(e.count) });
    if (e.count <= 0) { e.phase = 'run'; e.clock = 0; s.events.push({ type: 'raceGo' }); }
    return;
  }
  // run
  e.clock += C.DT;
  const done = s.players.filter((p) => !p.dead && p.x + p.w / 2 >= e.x1 && p.y + p.h <= e.y + 0.05);
  if (done.length || e.clock > C.RACE_MAX) {
    e.winner = done.length ? done[0].id : -1;
    e.phase = 'rest'; e.rest = C.TOY_REST;
    s.events.push({ type: 'raceEnd', who: e.winner, t: Math.round(e.clock * 100) / 100 });
  }
}

// Balloons: stomp your own pump (land on it). First balloon to pop wins.
function balloonStep(s, e) {
  if (e.winner >= 0) { e.rest -= C.DT; if (e.rest <= 0) { e.winner = -1; e.n = [0, 0]; } return; }
  for (const p of s.players) {
    if (p.dead || !p.landed) continue;
    const px = p.id === SUGAR ? e.x : e.x1;
    if (!feetCells(p).some(([cx, cy]) => cx === px && cy === e.y)) continue;
    e.n[p.id]++;
    s.events.push({ type: 'pump', who: p.id, n: e.n[p.id] });
    if (e.n[p.id] >= C.PUMP_POP) { e.winner = p.id; e.rest = C.TOY_REST; s.events.push({ type: 'pop', who: p.id, x: px + 0.5, y: e.y - 2 }); }
  }
}

// Footy: a ball you kick by running or jumping into it. Sugar scores at the right end
// (x1), Spice at the left (x0). First to FOOTY_WIN.
function ballStep(s, e) {
  const r = C.BALL_R;
  if (e.rest > 0) { e.rest -= C.DT; if (e.rest <= 0) { e.score = [0, 0]; e.winner = -1; } }
  if (e.wait > 0) { e.wait -= C.DT; return; }
  for (let i = 0; i < 2; i++) if (e.kick[i] > 0) e.kick[i] -= C.DT;
  // kicks
  for (const p of s.players) {
    if (p.dead || e.kick[p.id] > 0) continue;
    const nx = Math.max(p.x, Math.min(e.x, p.x + p.w)), ny = Math.max(p.y, Math.min(e.y, p.y + p.h));
    if ((nx - e.x) * (nx - e.x) + (ny - e.y) * (ny - e.y) > r * r) continue;
    const cx = p.x + p.w / 2;
    const dir = e.x > cx + 0.02 ? 1 : e.x < cx - 0.02 ? -1 : p.facing;
    e.vx = dir * Math.max(C.KICK * 0.7, Math.abs(p.vx) * 1.3);
    e.vy = -(p.onGround ? 6 : 10) - (p.vy < 0 ? 3 : 0);
    e.kick[p.id] = 0.15;
    s.events.push({ type: 'kick', who: p.id, x: e.x, y: e.y });
  }
  // fly: gravity, a speed cap under one radius per step, bounce off tiles
  e.vy += C.BALL_G * C.DT;
  const sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy);   // sqrt is exact IEEE; hypot is not pinned across engines
  if (sp > C.BALL_MAX) { e.vx *= C.BALL_MAX / sp; e.vy *= C.BALL_MAX / sp; }
  const solidAt = (x, y) => solidTile(s, Math.floor(x), Math.floor(y));
  const nx = e.x + e.vx * C.DT;
  if (solidAt(nx + Math.sign(e.vx) * r, e.y)) e.vx = -e.vx * 0.6; else e.x = nx;
  const ny = e.y + e.vy * C.DT;
  if (solidAt(e.x, ny + Math.sign(e.vy) * r)) {
    if (e.vy > 0) { e.y = Math.floor(ny + r) - r; e.vx *= 0.9; }
    e.vy = Math.abs(e.vy) < 2.5 ? 0 : -e.vy * 0.5;
  } else e.y = ny;
  if (e.vy === 0 && solidAt(e.x, e.y + r + 0.05)) e.vx *= 0.97;
  if (Math.abs(e.vx) < 0.05) e.vx = 0;
  // goals and strays
  const scorer = e.x < e.x0 + 1 ? 1 : e.x > e.x1 - 1 ? 0 : -1;   // the end tiles are the goals
  const stray = e.x < e.x0 - 1 || e.x > e.x1 + 1 || e.y > s.h || e.y < e.hy - 8;
  if (scorer >= 0 && e.y > e.hy - 4) {
    if (e.winner < 0) {
      e.score[scorer]++;
      s.events.push({ type: 'goal', who: scorer, x: e.x, y: e.y, score: [...e.score] });
      if (e.score[scorer] >= C.FOOTY_WIN) { e.winner = scorer; e.rest = C.TOY_REST + 1; s.events.push({ type: 'footyWin', who: scorer }); }
    }
    e.x = e.hx; e.y = e.hy; e.vx = 0; e.vy = 0; e.wait = 1;
  } else if (stray) { e.x = e.hx; e.y = e.hy; e.vx = 0; e.vy = 0; e.wait = 0.5; }
}

function touch(s, p) {
  if (p.dead) return;
  if (p.y > s.h + 1 || p.y + p.h < -3) return kill(s, p);
  const x0 = Math.floor(p.x), x1 = Math.floor(p.x + p.w - EPS);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + p.h - EPS);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const t = tileAt(s, cx, cy);
      if (t === '^') {
        if (p.x < cx + 0.85 && p.x + p.w > cx + 0.15 && p.y + p.h > cy + 0.4) return kill(s, p);
      } else if (t === 'v') {
        if (p.x < cx + 0.85 && p.x + p.w > cx + 0.15 && p.y < cy + 0.6) return kill(s, p);
      } else if (t === 'h') {
        s.grid[cy][cx] = '.';
        s.hearts++;
        s.events.push({ type: 'heart', who: p.id, x: cx + 0.5, y: cy + 0.5 });
      } else if (t === '$') {
        s.grid[cy][cx] = '.';
        s.starsGot++;
        s.events.push({ type: 'star', who: p.id, x: cx + 0.5, y: cy + 0.5, key: starKey(cx, cy) });
      } else if (t === '!') {
        if (!s.checkpoint || cx > s.checkpoint.x) {   // forward only: walking back over an old flag keeps the newer one
          s.checkpoint = { x: cx, y: cy };
          s.events.push({ type: 'checkpoint', x: cx + 0.5, y: cy + 0.5 });
        }
      }
    }
  }
  for (const e of s.ents) {
    if (e.type !== 'saw') continue;
    const nx = Math.max(p.x, Math.min(e.x, p.x + p.w)), ny = Math.max(p.y, Math.min(e.y, p.y + p.h));
    const r = (e.r || 0.6) * 0.85;
    const ddx = nx - e.x, ddy = ny - e.y;
    if (ddx * ddx + ddy * ddy < r * r) return kill(s, p);
  }
}

function kill(s, p) {
  if (s.mode !== 'chapter' && s.mode !== 'bonk') return;
  p.dead = true; p.deadT = s.gentle ? C.GENTLE_RESPAWN : C.RESPAWN;
  p.vx = 0; p.vy = 0; p.slamming = false; p.dashT = 0;
  for (const o of s.players) if (o.standOn === p.id) o.standOn = -1;
  s.events.push({ type: 'die', who: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

function inGoal(s, p) {
  for (let cy = Math.floor(p.y); cy <= Math.floor(p.y + p.h - EPS); cy++)
    for (let cx = Math.floor(p.x); cx <= Math.floor(p.x + p.w - EPS); cx++)
      if (tileAt(s, cx, cy) === '*') return true;
  return false;
}

// ---------------------------------------------------------------- mini-games

function endMini(s, winner) {
  s.winner = winner; s.complete = true;
  s.events.push({ type: 'complete', who: winner });
}

function updateRain(s) {
  s.timeLeft -= C.DT;
  s.nextDrop -= C.DT;
  if (s.nextDrop <= 0 && s.timeLeft > 1) {
    // fixed draws per drop, whatever kind it turns out to be
    const rx = rngNext(s.rng), rk = rngNext(s.rng);
    s.nextDrop = C.RAIN_EVERY;
    s.drops.push({ x: 2 + rx * (s.w - 4), y: -1, vy: 3 + rk * 2, kind: rk < 0.12 ? 'gold' : rk < 0.27 ? 'rock' : 'heart' });
  }
  for (const d of s.drops) {
    d.y += d.vy * C.DT;
    if (d.y > s.h) d.gone = true;
    if (d.gone) continue;
    if (solidTile(s, Math.floor(d.x), Math.floor(d.y + 0.3))) { d.gone = true; continue; }
    for (const p of s.players) {
      if (p.stun > 0) continue;
      if (d.x > p.x - 0.3 && d.x < p.x + p.w + 0.3 && d.y > p.y - 0.3 && d.y < p.y + p.h + 0.3) {
        d.gone = true;
        if (d.kind === 'rock') { p.stun = 1; s.events.push({ type: 'bonk', who: p.id }); }
        else { s.score[p.id] += d.kind === 'gold' ? 3 : 1; s.events.push({ type: 'heart', who: p.id, x: d.x, y: d.y }); }
        break;
      }
    }
  }
  s.drops = s.drops.filter((d) => !d.gone);
  if (s.timeLeft <= 0) endMini(s, s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1);
}

function startPotatoRound(s) {
  s.round++;
  s.fuse = C.POTATO_MIN + rngNext(s.rng) * (C.POTATO_MAX - C.POTATO_MIN);
  s.holder = rngNext(s.rng) < 0.5 ? 0 : 1;
  s.passCool = 1;
  for (const p of s.players) placeAtSpawn(s, p);
  s.events.push({ type: 'round', who: s.holder });
}

function updatePotato(s) {
  s.fuse -= C.DT;
  s.passCool -= C.DT;
  const [a, b] = s.players;
  if (s.passCool <= 0 && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
    s.holder = 1 - s.holder;
    s.passCool = C.POTATO_PASS_COOLDOWN;
    s.events.push({ type: 'pass', who: s.holder });
  }
  if (s.fuse <= 0) {
    const loser = s.holder;
    const h = s.players[loser];
    s.events.push({ type: 'boom', who: loser, x: h.x + h.w / 2, y: h.y + h.h / 2 });
    s.score[1 - loser]++;
    if (s.score[1 - loser] >= C.POTATO_ROUNDS) endMini(s, 1 - loser);
    else startPotatoRound(s);
  }
}
