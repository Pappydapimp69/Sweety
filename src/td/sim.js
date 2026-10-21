// The top-down world: the truth. The only module that mutates a world. Pure and
// deterministic (no Math.random, no clock, no DOM, no transcendentals), so online
// lockstep replays it bit for bit, like the side-view sim.
//
// Positions are tile units, y down; a player's (x, y) is the centre of their footprint.
import * as C from './config.js';

export const SUGAR = 0, SPICE = 1;
const EPS = 1e-6;

// Tiles (td/world.js builds the map):
//   .  ground   #  wall   T  tree   w  water   o  pit   ^  spikes   =  planks   u  a sunk crate
//   1-4 plate   5-8 heavy plate   A-D door (open while its plate is pressed)   a-d bridge (only while pressed)
//   K  piano key   $  star   P/Q  where Sugar/Spice start
//   ~  the Meadow's current (water flowing east: floating crates drift on it)
//   %  the Workshop's rollers over a chasm (flowing west: planks ride them)   t  a tacked plank
// Sugar's vines (v) only hold Spice.
const SOLID = '#Tr';
const HOLE = 'wo~%';

export function createWorld(world, opts = {}) {
  const grid = world.map.map((r) => r.split(''));
  const h = grid.length, w = grid[0].length;
  const spawns = [null, null], plates = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = grid[y][x];
    if (t === 'P' || t === 'Q') { spawns[t === 'P' ? 0 : 1] = { x: x + 0.5, y: y + 0.5 }; grid[y][x] = '.'; }
    else if (t >= '1' && t <= '8') plates.push({ x, y, g: ((t.charCodeAt(0) - 49) % 4) + 1, heavy: t >= '5' });
    else if (t === '$' && opts.stars && opts.stars.includes(`${x}:${y}`)) grid[y][x] = '.';
  }
  const unlocked = new Set(opts.unlocked || []);   // regions whose power stones you've stood on
  const hearts = new Set(opts.hearts || []);       // regions whose hearts you've reached
  const ents = world.ents.map((e, i) => ({ ...e, i, ...entState(e) }));
  for (const e of ents) {
    if (e.type === 'gate' && !hearts.has(e.need)) for (const [x, y] of e.cells) grid[y][x] = '#';
    if (e.type === 'stone') e.lit = unlocked.has(e.region);
    if (e.type === 'heart') e.got = hearts.has(e.region);
  }
  const s = {
    td: true, chapterId: world.id, mode: 'chapter', w, h, grid, plates, ents, spawns,
    zones: world.zones, unlocked: [...unlocked].sort(), hearts: [...hearts].sort(),
    pressed: [false, false, false, false, false],
    players: [0, 1].map((id) => ({
      id, x: 0, y: 0, vx: 0, vy: 0, fx: id ? -1 : 1, fy: 0, hop: 0, fly: null, size: 'normal',
      dead: false, deadT: 0, safe: null, cool: 0, freezing: false, glide: false, push: 0, pushX: 0, pushY: 0,
    })),
    vine: null, nails: [], planks: [], fx: [], frozen: false, starsGot: 0,
    tick: 0, time: 0, complete: false, events: [],
  };
  s.players.forEach((p) => { p.x = spawns[p.id].x; p.y = spawns[p.id].y; });
  if (opts.at) {
    const d = ents.find((e) => e.id === opts.at);
    if (d) s.players.forEach((p) => { p.x = d.x + 0.5 + (p.id ? 0.6 : -0.6); p.y = d.y + 1.5; });
  }
  s.players.forEach((p) => { p.safe = { x: p.x, y: p.y }; });
  return s;
}

function entState(e) {
  switch (e.type) {
    case 'crate': return { x: e.x, y: e.y, hx: e.x, hy: e.y, px: e.x, float: false, tied: false, back: 0 };
    case 'press': return { cool: 0 };
    case 'switch': return { on: !!e.on };
    case 'race': return { phase: 'idle', count: 0, clock: 0, rest: 0, next: [0, 0], winner: -1 };
    case 'ball': return { vx: 0, vy: 0, hx: e.x, hy: e.y, score: [0, 0], wait: 0, winner: -1, rest: 0, kick: [0, 0] };
    case 'balloons': return { n: [0, 0], winner: -1, rest: 0 };
    case 'bench': return { sit: 0, n: 0 };
    case 'stone': return { lit: false, wait: 0 };
    case 'heart': return { got: false };
    default: return {};
  }
}

// ---------------------------------------------------------------- reading the world

export const tileAt = (s, x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? '#' : s.grid[y][x]);
export function zoneOf(s, x, y) {
  for (const z of s.zones) if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return z;
  return s.zones[0];
}
// Your power is the region's, once its stone has been lit.
export function powerOf(s, p) {
  const z = zoneOf(s, p.x, p.y);
  if (z.region === undefined || !s.unlocked.includes(z.region)) return 'none';
  return p.id === SUGAR ? z.sugar : z.spice;
}
export function doorOpen(s, x, y) {
  const t = tileAt(s, x, y);
  return s.pressed[t.charCodeAt(0) - 64] || s.players.some((p) => !p.dead && overlaps(p, x, y));
}
function crateAt(s, x, y) { return s.ents.find((e) => e.type === 'crate' && !e.gone && e.x === x && e.y === y); }
export function solidAt(s, x, y, who = null) {
  const t = tileAt(s, x, y);
  if (SOLID.includes(t)) return true;
  if (t >= 'A' && t <= 'D') return !doorOpen(s, x, y);
  if (crateAt(s, x, y)) return true;
  if (s.ents.some((e) => (e.type === 'switch' || e.type === 'press') && e.x === x && e.y === y)) return true;
  void who;
  return false;
}
// What you'd fall into if you stood here, not hopping
export function holeAt(s, x, y, p) {
  const t = tileAt(s, x, y);
  if (t >= 'a' && t <= 'd') return !s.pressed[t.charCodeAt(0) - 96];
  if (t === 'v') return p.id !== SPICE;   // her vines hold him, not her
  return HOLE.includes(t);
}
const R = C.FOOT / 2;
function overlaps(p, cx, cy) { return p.x - R < cx + 1 - EPS && p.x + R > cx + EPS && p.y - R < cy + 1 - EPS && p.y + R > cy + EPS; }
function boxHits(s, x, y, p) {
  for (let cy = Math.floor(y - R + EPS); cy <= Math.floor(y + R - EPS); cy++)
    for (let cx = Math.floor(x - R + EPS); cx <= Math.floor(x + R - EPS); cx++)
      if (solidAt(s, cx, cy, p)) return true;
  return false;
}

// ---------------------------------------------------------------- the step

export function step(s, inputs) {
  s.events.length = 0;
  if (s.complete) return s;
  s.tick++; s.time = s.tick * C.DT;
  if (inputs.some((i) => i && i.regroup)) {   // "Back to the Plaza": both home
    for (const p of s.players) { p.x = s.spawns[p.id].x; p.y = s.spawns[p.id].y; p.dead = false; p.fly = null; p.hop = 0; p.safe = { x: p.x, y: p.y }; }
    s.events.push({ type: 'regroup' });
  }
  s.pressed = computePressed(s);
  s.frozen = s.players.some((p) => p.freezing && !p.dead);
  for (const p of s.players) updatePlayer(s, p, inputs[p.id] || {});
  leash(s);
  updateNails(s);
  updateRiver(s);
  updateLine(s);
  for (const p of s.players) touch(s, p);
  updateEnts(s);
  return s;
}

function computePressed(s) {
  const out = [false, false, false, false, false];
  for (const pl of s.plates) {
    const crate = crateAt(s, pl.x, pl.y);
    const on = crate || s.players.some((p) => !p.dead && !p.hop && !p.fly && Math.floor(p.x) === pl.x && Math.floor(p.y) === pl.y && (!pl.heavy || p.size === 'big'));
    if (on) out[pl.g] = true;
  }
  for (const e of s.ents) if (e.type === 'switch' && e.on) out[e.g] = true;
  return out;
}

function updatePlayer(s, p, inp) {
  if (p.dead) {
    p.deadT -= C.DT;
    if (p.deadT <= 0) { p.dead = false; p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; s.events.push({ type: 'respawn', who: p.id }); }
    return;
  }
  if (p.cool > 0) p.cool -= C.DT;
  const power = powerOf(s, p);
  if (p.size !== 'normal' && power !== 'size') p.size = 'normal';
  // flying (a springboard or a gust): along a fixed arc, over walls and water
  if (p.fly) {
    const f = p.fly;
    f.t += C.DT;
    const u = Math.min(1, f.t / f.dur);
    p.x = f.x0 + (f.x1 - f.x0) * u; p.y = f.y0 + (f.y1 - f.y0) * u;
    if (u >= 1) { p.fly = null; s.events.push({ type: 'land', who: p.id, x: p.x, y: p.y }); }
    return;
  }
  // facing follows the stick (8 ways)
  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  if ((mx || my) && !p.casting) { p.fx = mx; p.fy = my; }   // her vine holds her facing too
  p.freezing = power === 'freeze' && !!inp.ability && !p.hop;
  if (p.freezing) { mx = 0; my = 0; }
  if (inp.abilityPressed) useAbility(s, p, power);
  if (p.casting) {   // her vine: rooted while she holds it; let go and it's gone
    if (power !== 'vine' || !inp.ability || p.hop) dropVine(s, p);
    else { mx = 0; my = 0; holdVine(s, p); }
  }
  // hop: a short airborne moment that clears a one-tile gap (a glide makes it long)
  if (inp.jumpPressed && !p.hop) { p.hop = C.HOP_TIME; p.glide = false; s.events.push({ type: 'jump', who: p.id }); }
  if (p.hop > 0) {
    p.glide = power === 'glide' && !!inp.jump && p.hop < C.HOP_TIME - 0.1 && (p.glide || p.hop > 0);
    p.hop -= p.glide ? C.DT * C.GLIDE_SLOW : C.DT;
    if (p.hop <= 0) { p.hop = 0; p.glide = false; s.events.push({ type: 'land', who: p.id, x: p.x, y: p.y }); }
  }
  // move: accelerate toward the wanted velocity, normalised so diagonals aren't faster
  const len = Math.sqrt(mx * mx + my * my) || 1;
  const sp = C.WALK * (p.size === 'small' ? 0.85 : p.size === 'big' ? 0.8 : 1);
  let tx = (mx / len) * sp, ty = (my / len) * sp;
  if (p.push > 0) { p.push -= C.DT; tx = p.pushX; ty = p.pushY; }   // gusted: the wind steers
  const acc = C.ACCEL * C.DT;
  p.vx += Math.max(-acc, Math.min(acc, tx - p.vx));
  p.vy += Math.max(-acc, Math.min(acc, ty - p.vy));
  if (p.dash > 0) { p.dash -= C.DT; p.vx = p.dfx * C.DASH_V; p.vy = p.dfy * C.DASH_V; }
  moveAxis(s, p, p.vx * C.DT, 0);
  moveAxis(s, p, 0, p.vy * C.DT);
}

function moveAxis(s, p, dx, dy) {
  if (!dx && !dy) return;
  const nx = p.x + dx, ny = p.y + dy;
  if (!boxHits(s, nx, ny, p)) { p.x = nx; p.y = ny; return; }
  // slide up to the wall
  if (dx) { p.x = dx > 0 ? Math.floor(nx + R) - R - EPS : Math.floor(nx - R) + 1 + R + EPS; p.vx = 0; }
  if (dy) { p.y = dy > 0 ? Math.floor(ny + R) - R - EPS : Math.floor(ny - R) + 1 + R + EPS; p.vy = 0; }
  if (p.dash > 0) {   // a dash smashes glass
    const cx = Math.floor(p.x + Math.sign(dx) * (R + 0.1)), cy = Math.floor(p.y + Math.sign(dy) * (R + 0.1));
    if (tileAt(s, cx, cy) === 'g') { s.grid[cy][cx] = '.'; s.events.push({ type: 'glass', x: cx + 0.5, y: cy + 0.5 }); }
    p.dash = 0;
  }
  if (boxHits(s, p.x, p.y, p)) { p.x -= dx; p.y -= dy; }   // never end a step inside a wall
}

// the cardinal tile in front of you
function front(p) {
  const ax = Math.abs(p.fx) >= Math.abs(p.fy) ? Math.sign(p.fx) : 0;
  const ay = ax ? 0 : Math.sign(p.fy) || 1;
  return { dx: ax, dy: ay, x: Math.floor(p.x) + ax, y: Math.floor(p.y) + ay };
}

function useAbility(s, p, power) {
  const o = s.players[1 - p.id];
  const f = front(p);
  switch (power) {
    case 'vine': {   // a held lasso: a vine over still water ahead (only Spice can walk it) that ties the first floating crate at its end
      dropVine(s, p);
      const cells = [];
      for (let k = 1; k <= C.VINE_LEN; k++) {
        const x = Math.floor(p.x) + f.dx * k, y = Math.floor(p.y) + f.dy * k;
        if (tileAt(s, x, y) !== 'w') break;   // the current tears a vine: it stops at the lane
        cells.push([x, y, 'w']); s.grid[y][x] = 'v';
      }
      const end = cells.length ? cells[cells.length - 1] : [Math.floor(p.x), Math.floor(p.y)];
      p.casting = { dx: f.dx, dy: f.dy, tx: end[0] + f.dx, ty: end[1] + f.dy };
      s.vine = { cells, who: p.id, tx: p.casting.tx, ty: p.casting.ty, tied: -1 };
      s.events.push({ type: 'vine', who: p.id, x: p.x, y: p.y });
      holdVine(s, p);
      break;
    }
    case 'shove': {   // push the crate in front one tile: into still water it sinks and you can walk on it, into the current it floats
      const c = crateAt(s, f.x, f.y);
      if (!c || (c.float && !c.tied)) { s.events.push({ type: 'nope', who: p.id }); break; }   // a drifting crate slips away
      const bx = f.x + f.dx, by = f.y + f.dy, bt = tileAt(s, bx, by);
      if (SOLID.includes(bt) || crateAt(s, bx, by) || (bt >= 'A' && bt <= 'D' && !doorOpen(s, bx, by)) || s.players.some((q) => !q.dead && overlaps(q, bx, by))) { s.events.push({ type: 'nope', who: p.id }); break; }
      if (c.tied) untie(s, c);
      if (bt === '~') { c.x = bx; c.y = by; c.px = bx; c.float = true; s.events.push({ type: 'sink', x: bx + 0.5, y: by + 0.5 }); }
      else if (HOLE.includes(bt) || bt === 'v') { sinkCrate(c); s.grid[by][bx] = 'u'; s.events.push({ type: 'sink', x: bx + 0.5, y: by + 0.5 }); }
      else { c.x = bx; c.y = by; c.px = bx; c.float = false; s.events.push({ type: 'shove', who: p.id, x: bx + 0.5, y: by + 0.5 }); }
      break;
    }
    case 'nail': {   // a nail flies ahead and flips the switch it hits
      if (p.cool > 0) break;
      p.cool = 0.35;
      const len = Math.sqrt(p.fx * p.fx + p.fy * p.fy) || 1;
      s.nails.push({ x: p.x, y: p.y, dx: p.fx / len, dy: p.fy / len, dist: 0 });
      s.events.push({ type: 'pin', who: p.id });
      break;
    }
    case 'hammer': {   // smash a crate or rock ahead; hammer a springboard and whoever stands on it flies
      const press = s.ents.find((e) => e.type === 'press' && e.x === f.x && e.y === f.y);
      if (press) {   // the press stamps a plank onto the rollers
        if (press.cool > 0 || s.planks.some((k) => Math.abs(k.px - press.ox) < 1 && k.y === press.oy && !k.tacked)) { s.events.push({ type: 'nope', who: p.id }); break; }
        press.cool = C.PRESS_COOL;
        s.planks.push({ px: press.ox, y: press.oy, tacked: false, t: 0 });
        s.events.push({ type: 'slam', who: p.id, x: press.x + 0.5, y: press.y + 0.5 });
        break;
      }
      for (const [tx, ty] of [[Math.floor(p.x), Math.floor(p.y)], [f.x, f.y]]) {   // drive a tacked plank home: underfoot or ahead
        if (tileAt(s, tx, ty) !== 't') continue;
        s.grid[ty][tx] = '=';
        s.planks = s.planks.filter((k) => !(k.tacked && k.y === ty && Math.round(k.px) === tx));
        s.events.push({ type: 'thud', who: p.id, x: tx + 0.5, y: ty + 0.5, drive: true });
        return;
      }
      const spring = s.ents.find((e) => e.type === 'spring' && (e.x === f.x && e.y === f.y || e.x === Math.floor(p.x) && e.y === Math.floor(p.y)));
      if (spring) {
        s.events.push({ type: 'thud', who: p.id, x: spring.x + 0.5, y: spring.y + 0.5 });
        if (!o.dead && !o.fly && Math.floor(o.x) === spring.x && Math.floor(o.y) === spring.y) {
          o.fly = { x0: o.x, y0: o.y, x1: spring.tx + 0.5, y1: spring.ty + 0.5, t: 0, dur: C.FLY_TIME }; o.hop = 0;
          s.events.push({ type: 'launch', who: o.id });
        }
        break;
      }
      const c = crateAt(s, f.x, f.y);
      if (c) { c.gone = true; s.events.push({ type: 'crate', x: f.x + 0.5, y: f.y + 0.5 }); break; }
      if (tileAt(s, f.x, f.y) === 'r') { s.grid[f.y][f.x] = '.'; s.events.push({ type: 'crate', x: f.x + 0.5, y: f.y + 0.5 }); break; }
      s.events.push({ type: 'thud', who: p.id, x: f.x + 0.5, y: f.y + 0.5 });
      break;
    }
    default:
      if (p.cool <= 0) { p.cool = 0.6; s.events.push({ type: 'wave', who: p.id }); }
  }
}

function updateNails(s) {
  for (const n of s.nails) {
    const stepLen = C.NAIL_SPEED * C.DT;
    n.x += n.dx * stepLen; n.y += n.dy * stepLen; n.dist += stepLen;
    // a riding plank: the nail tacks it where it is (only over the rollers does that make a footing)
    const pk = s.planks.find((k) => !k.tacked && Math.abs(k.px + 0.5 - n.x) < 0.6 && Math.abs(k.y + 0.5 - n.y) < 0.6);
    if (pk) {
      const cx = Math.round(pk.px);
      n.done = true;
      if (tileAt(s, cx, pk.y) === '%') { pk.px = cx; pk.tacked = true; pk.t = C.TACK_TIME; s.grid[pk.y][cx] = 't'; s.events.push({ type: 'pinned', x: cx + 0.5, y: pk.y + 0.5, tack: true }); }
      continue;
    }
    const sw = s.ents.find((e) => e.type === 'switch' && Math.abs(e.x + 0.5 - n.x) < 0.6 && Math.abs(e.y + 0.5 - n.y) < 0.6);
    if (sw) { sw.on = !sw.on; n.done = true; s.events.push({ type: 'pinned', x: sw.x + 0.5, y: sw.y + 0.5, on: sw.on }); continue; }
    if (SOLID.includes(tileAt(s, Math.floor(n.x), Math.floor(n.y))) || n.dist > C.NAIL_RANGE) n.done = true;
  }
  s.nails = s.nails.filter((n) => !n.done);
}

// ---------------------------------------------------------------- the river and the line

function sinkCrate(c) { c.gone = true; c.float = false; c.tied = false; if (c.dock) c.back = C.CRATE_BACK; }
function untie(s, c) { c.tied = false; if (s.vine) s.vine.tied = -1; }
export function dropVine(s, p) {
  p.casting = null;
  if (!s.vine || s.vine.who !== p.id) return;
  for (const [x, y, was] of s.vine.cells) if (s.grid[y][x] === 'v') s.grid[y][x] = was;
  const c = s.ents[s.vine.tied];
  if (c && c.tied) c.tied = false;
  s.vine = null;
}
// while she holds: the first floating crate to reach the end of her vine is tied there
function holdVine(s, p) {
  const v = s.vine;
  if (!v || v.tied >= 0) return;
  const c = s.ents.find((e) => e.type === 'crate' && !e.gone && e.float && e.x === v.tx && e.y === v.ty);
  if (!c) return;
  c.tied = true; c.px = c.x; v.tied = c.i;
  s.events.push({ type: 'tie', who: p.id, x: c.x + 0.5, y: c.y + 0.5 });
}
function updateRiver(s) {
  for (const c of s.ents) {
    if (c.type !== 'crate') continue;
    if (c.gone) {   // a dock crate comes back once its home is clear
      if (!c.dock || (c.back -= C.DT) > 0) continue;
      if (crateAt(s, c.hx, c.hy) || s.players.some((q) => !q.dead && overlaps(q, c.hx, c.hy))) continue;
      Object.assign(c, { gone: false, x: c.hx, y: c.hy, px: c.hx, float: false, tied: false });
      s.events.push({ type: 'shove', x: c.hx + 0.5, y: c.hy + 0.5 });
      continue;
    }
    if (!c.float || c.tied) continue;
    c.px += C.FLOW * C.DT;
    if (tileAt(s, Math.floor(c.px + 1 - EPS), c.y) !== '~') { sinkCrate(c); continue; }   // the end of the river: back to the dock
    c.x = Math.floor(c.px + 0.5);
  }
}
function updateLine(s) {
  for (const e of s.ents) if (e.type === 'press' && e.cool > 0) e.cool -= C.DT;
  for (const k of s.planks) {
    if (k.tacked) {
      if ((k.t -= C.DT) > 0) continue;
      k.tacked = false;   // it works loose and rides on
      if (s.grid[k.y][Math.round(k.px)] === 't') s.grid[k.y][Math.round(k.px)] = '%';
      s.events.push({ type: 'nope', x: k.px + 0.5, y: k.y + 0.5 });
      continue;
    }
    k.px -= C.ROLL * C.DT;
    if (!'%t='.includes(tileAt(s, Math.floor(k.px + EPS), k.y))) { k.done = true; s.events.push({ type: 'drop', x: k.px + 0.5, y: k.y + 0.5 }); }   // off the end, into the chasm
  }
  s.planks = s.planks.filter((k) => !k.done);
}

function leash(s) {
  const [a, b] = s.players;
  if (a.dead || b.dead || a.fly || b.fly) return;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d <= C.LEASH) return;
  // pull each back along the line, by no more than this step's own movement
  const over = d - C.LEASH, ux = dx / d, uy = dy / d;
  for (const [p, sgn] of [[a, 1], [b, -1]]) {
    const away = -(p.vx * ux + p.vy * uy) * sgn;
    if (away > 0) { const k = Math.min(over, away * C.DT); moveAxis(s, p, ux * k * sgn, 0); moveAxis(s, p, 0, uy * k * sgn); }
  }
}

function touch(s, p) {
  if (p.dead || p.fly) return;
  const cx = Math.floor(p.x), cy = Math.floor(p.y), t = tileAt(s, cx, cy);
  if (t === '$') { s.grid[cy][cx] = '.'; s.starsGot++; s.events.push({ type: 'star', who: p.id, x: cx + 0.5, y: cy + 0.5, key: `${cx}:${cy}` }); }
  if (p.hop > 0) return;
  if (holeAt(s, cx, cy, p) || t === '^') return kill(s, p, t === '^' ? 'spikes' : 'fall');
  // somewhere you can stand that won't vanish: remember it
  if ('.=u'.includes(t) || (t >= '1' && t <= '8') || t === 'K') p.safe = { x: p.x, y: p.y };
}

function kill(s, p, why) {
  p.dead = true; p.deadT = C.RESPAWN; p.vx = 0; p.vy = 0; p.hop = 0; p.dash = 0;
  s.events.push({ type: 'die', who: p.id, x: p.x, y: p.y, why });
}

// ---------------------------------------------------------------- stones, hearts, toys

const both = (s) => s.players.every((p) => !p.dead && !p.fly);
const onCells = (p, x, y, w = 1, h = 1) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

function updateEnts(s) {
  for (const e of s.ents) {
    switch (e.type) {
      case 'stone': {   // stand on it together: this region's powers are yours
        if (e.lit) break;
        const here = both(s) && s.players.every((p) => onCells(p, e.x - 0.2, e.y - 0.2, 2.4, 2.4));
        e.wait = here ? e.wait + C.DT : 0;
        if (e.wait >= C.STONE_TIME) {
          e.lit = true;
          if (!s.unlocked.includes(e.region)) s.unlocked = [...s.unlocked, e.region].sort();
          s.events.push({ type: 'unlock', region: e.region, x: e.x + 1, y: e.y + 1 });
        }
        break;
      }
      case 'heart': {   // the end of a region's path: the next region opens
        if (e.got) break;
        if (s.players.some((p) => !p.dead && !p.fly && onCells(p, e.x, e.y))) {
          e.got = true;
          if (!s.hearts.includes(e.region)) s.hearts = [...s.hearts, e.region].sort();
          for (const g of s.ents) if (g.type === 'gate' && g.need === e.region) for (const [x, y] of g.cells) if (s.grid[y][x] === '#') s.grid[y][x] = g.under || '.';
          s.events.push({ type: 'heartGot', region: e.region, x: e.x + 0.5, y: e.y + 0.5 });
        }
        break;
      }
      case 'race': raceStep(s, e); break;
      case 'ball': ballStep(s, e); break;
      case 'balloons': balloonStep(s, e); break;
      case 'bench': {
        if (e.sit < 0) { e.sit = Math.min(0, e.sit + C.DT); break; }
        const sitting = both(s) && s.players.every((p) => onCells(p, e.x, e.y, e.w, 1) && Math.abs(p.vx) + Math.abs(p.vy) < 0.3);
        e.sit = sitting ? e.sit + C.DT : 0;
        if (e.sit >= C.BENCH_TIME) { s.events.push({ type: 'cuddle', n: e.n++, x: e.x + e.w / 2, y: e.y }); e.sit = -4; }
        break;
      }
      default: break;
    }
  }
  // floor piano: a note each time a foot finds a new key
  for (const p of s.players) {
    if (p.dead || p.hop || p.fly) { p.key = -1; continue; }
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const cell = tileAt(s, cx, cy) === 'K' ? cy * s.w + cx : -1;
    if (cell >= 0 && cell !== p.key) { const pi = s.ents.find((e) => e.type === 'piano'); s.events.push({ type: 'note', who: p.id, x: cx, y: cy, k: pi ? (cx - pi.x) + (cy - pi.y) * 3 : 0 }); }
    p.key = cell;
  }
}

// Race: both on the start flag -> 3-2-1 -> run the gates in order -> first back to the flag.
function raceStep(s, e) {
  if (e.phase === 'rest') { e.rest -= C.DT; if (e.rest <= 0) { e.phase = 'idle'; e.winner = -1; } return; }
  const atStart = both(s) && s.players.every((p) => onCells(p, e.x - 1, e.y - 1, 3, 3));
  if (e.phase === 'idle') { if (atStart) { e.phase = 'count'; e.count = C.RACE_COUNT; } return; }
  if (e.phase === 'count') {
    if (!atStart) { e.phase = 'idle'; return; }
    const before = Math.ceil(e.count);
    e.count -= C.DT;
    if (Math.ceil(e.count) !== before && e.count > 0) s.events.push({ type: 'tick3', n: Math.ceil(e.count) });
    if (e.count <= 0) { e.phase = 'run'; e.clock = 0; e.next = [0, 0]; s.events.push({ type: 'raceGo' }); }
    return;
  }
  e.clock += C.DT;
  for (const p of s.players) {
    if (p.dead) continue;
    const k = e.next[p.id];
    const [gx, gy] = k < e.gates.length ? e.gates[k] : [e.x, e.y];
    if (Math.abs(p.x - (gx + 0.5)) < 1.5 && Math.abs(p.y - (gy + 0.5)) < 1.5) {
      e.next[p.id]++;
      if (e.next[p.id] > e.gates.length) {
        e.winner = p.id; e.phase = 'rest'; e.rest = C.TOY_REST;
        s.events.push({ type: 'raceEnd', who: p.id, t: Math.round(e.clock * 100) / 100 });
        return;
      }
      s.events.push({ type: 'tick3', n: 0 });
    }
  }
  if (e.clock > C.RACE_MAX) { e.phase = 'rest'; e.rest = C.TOY_REST; e.winner = -1; s.events.push({ type: 'raceEnd', who: -1, t: e.clock }); }
}

// Balloons: hop onto your own pump; first balloon to pop wins.
function balloonStep(s, e) {
  if (e.winner >= 0) { e.rest -= C.DT; if (e.rest <= 0) { e.winner = -1; e.n = [0, 0]; } return; }
  for (const ev of s.events) {
    if (ev.type !== 'land' || ev.who === undefined) continue;
    const p = s.players[ev.who];
    const [px, py] = p.id === SUGAR ? [e.x, e.y] : [e.x1, e.y1];
    if (Math.floor(p.x) !== px || Math.floor(p.y) !== py) continue;
    e.n[p.id]++;
    s.events.push({ type: 'pump', who: p.id, n: e.n[p.id] });
    if (e.n[p.id] >= C.PUMP_POP) { e.winner = p.id; e.rest = C.TOY_REST; s.events.push({ type: 'pop', who: p.id, x: px + 0.5, y: py - 1 }); break; }
  }
}

// Footy, from above: walk into the ball to kick it; Sugar scores in the right goal, Spice the left.
function ballStep(s, e) {
  if (e.rest > 0) { e.rest -= C.DT; if (e.rest <= 0) { e.score = [0, 0]; e.winner = -1; } }
  if (e.wait > 0) { e.wait -= C.DT; return; }
  const r = C.BALL_R;
  for (const p of s.players) {
    if (p.dead || p.hop || e.kick[p.id] > 0) { e.kick[p.id] = Math.max(0, e.kick[p.id] - C.DT); continue; }
    const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy, reach = r + R;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2) || 1;
    const sp = Math.max(C.KICK, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.6);
    e.vx = (dx / d) * sp; e.vy = (dy / d) * sp; e.kick[p.id] = 0.15;
    s.events.push({ type: 'kick', who: p.id, x: e.x, y: e.y });
  }
  const sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (sp > C.BALL_MAX) { e.vx *= C.BALL_MAX / sp; e.vy *= C.BALL_MAX / sp; }
  const hit = (x, y) => SOLID.includes(tileAt(s, Math.floor(x), Math.floor(y)));
  const nx = e.x + e.vx * C.DT;
  if (hit(nx + Math.sign(e.vx) * r, e.y)) e.vx = -e.vx * 0.7; else e.x = nx;
  const ny = e.y + e.vy * C.DT;
  if (hit(e.x, ny + Math.sign(e.vy) * r)) e.vy = -e.vy * 0.7; else e.y = ny;
  e.vx *= C.BALL_DRAG; e.vy *= C.BALL_DRAG;
  if (Math.abs(e.vx) < 0.05) e.vx = 0;
  if (Math.abs(e.vy) < 0.05) e.vy = 0;
  // goals: a mouth at each end of the pitch
  const inMouth = e.y > e.gy0 && e.y < e.gy1;
  const scorer = inMouth && e.x < e.x0 + 0.6 ? 1 : inMouth && e.x > e.x1 - 0.6 ? 0 : -1;
  if (scorer >= 0) {
    if (e.winner < 0) {
      e.score[scorer]++;
      s.events.push({ type: 'goal', who: scorer, x: e.x, y: e.y, score: [...e.score] });
      if (e.score[scorer] >= C.FOOTY_WIN) { e.winner = scorer; e.rest = C.TOY_REST + 1; s.events.push({ type: 'footyWin', who: scorer }); }
    }
    e.x = e.hx; e.y = e.hy; e.vx = 0; e.vy = 0; e.wait = 1;
  }
}
