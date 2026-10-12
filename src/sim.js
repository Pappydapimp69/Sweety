// The truth. The only module that mutates a run. Pure: no DOM, no clock, no Math.random.
import * as C from './config.js';
import { chapterById } from './levels.js';

export const SUGAR = 0;
export const SPICE = 1;
export const NAMES = ['Sugar', 'Spice'];

const EPS = 1e-6;

export const NO_INPUT = Object.freeze({
  left: false, right: false, down: false, jump: false, ability: false,
  jumpPressed: false, abilityPressed: false,
});

// ---------------------------------------------------------------- setup

export function createRun(chapterId) {
  const ch = chapterById(chapterId);
  if (!ch) throw new Error(`no chapter ${chapterId}`);
  const grid = ch.map.map((row) => row.split(''));
  const h = grid.length;
  const w = grid[0].length;
  const spawns = [null, null];
  const plates = [];
  let heartsTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = grid[y][x];
      if (t === 'P' || t === 'Q') { spawns[t === 'P' ? 0 : 1] = { x, y }; grid[y][x] = '.'; }
      else if (t >= '1' && t <= '8') plates.push({ x, y, g: plateGroup(t), heavy: t >= '5' });
      else if (t === 'h') heartsTotal++;
    }
  }
  const s = {
    chapterId: ch.id, bonk: !!ch.bonk, powers: ch.powers,
    w, h, grid, plates, spawns,
    pressed: [false, false, false, false, false], held: [],
    checkpoint: null,
    players: [0, 1].map((id) => makePlayer(id, ch)),
    pins: [], shots: [],
    hearts: 0, heartsTotal,
    score: [0, 0], winner: -1,
    complete: false, time: 0, tick: 0,
    events: [],
  };
  for (const p of s.players) placeAtSpawn(s, p);
  return s;
}

function makePlayer(id, ch) {
  const size = id === SPICE && ch.powers.spice === 'size' ? 'small' : 'normal';
  return {
    id, x: 0, y: 0, w: C.SIZE[size].w, h: C.SIZE[size].h, size,
    vx: 0, vy: 0, facing: id === SUGAR ? 1 : -1,
    onGround: false, coyote: 0, jumpBuf: 0, standOn: -1,
    slamming: false, launched: false, bright: false, stun: 0,
    dead: false, deadT: 0, prevY: 0, wave: 0,
  };
}

export function plateGroup(t) {
  const n = t.charCodeAt(0) - 48;          // '1'..'8'
  return n > 4 ? n - 4 : n;
}
const doorGroup = (t) => t.charCodeAt(0) - 64;     // 'A'..'D' -> 1..4
const bridgeGroup = (t) => t.charCodeAt(0) - 96;   // 'a'..'d' -> 1..4

function placeAtSpawn(s, p) {
  let fx, fy;   // feet centre
  if (s.checkpoint) {
    fx = s.checkpoint.x + 0.5 + (p.id === SUGAR ? -0.45 : 0.45);
    fy = s.checkpoint.y + 1;
  } else {
    const sp = s.spawns[p.id];
    fx = sp.x + 0.5;
    fy = sp.y + 1;
  }
  p.x = fx - p.w / 2;
  p.y = fy - p.h;
  p.vx = 0; p.vy = 0; p.prevY = p.y;
  p.onGround = false; p.standOn = -1; p.slamming = false; p.stun = 0;
  p.dead = false; p.deadT = 0;
}

// ---------------------------------------------------------------- world queries

export function tileAt(s, x, y) {
  if (x < 0 || x >= s.w) return '#';
  if (y < 0 || y >= s.h) return '.';
  return s.grid[y][x];
}

export function lightRadius(s) {
  if (s.powers.sugar !== 'lantern') return 0;
  const sg = s.players[SUGAR];
  if (sg.dead) return 0;
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
  if (t === '#' || t === 'L' || t === 'x') return true;
  if (t >= 'A' && t <= 'D') return !doorOpen(s, cx, cy);
  if (t >= 'a' && t <= 'd') return s.pressed[bridgeGroup(t)];
  if (t === '~') return isLit(s, cx, cy);
  return false;
}

function rectHitsSolid(s, x, y, w, h) {
  for (let cy = Math.floor(y); cy <= Math.floor(y + h - EPS); cy++)
    for (let cx = Math.floor(x); cx <= Math.floor(x + w - EPS); cx++)
      if (solidTile(s, cx, cy)) return true;
  return false;
}

// ---------------------------------------------------------------- movement

function moveX(s, p, dx) {
  if (!dx) return 0;
  const x0 = p.x;
  p.x += dx;
  const top = Math.floor(p.y + EPS), bot = Math.floor(p.y + p.h - EPS);
  if (dx > 0) {
    const cx = Math.floor(p.x + p.w - EPS);
    for (let cy = top; cy <= bot; cy++) if (solidTile(s, cx, cy)) { p.x = cx - p.w; p.vx = 0; break; }
  } else {
    const cx = Math.floor(p.x + EPS);
    for (let cy = top; cy <= bot; cy++) if (solidTile(s, cx, cy)) { p.x = cx + 1; p.vx = 0; break; }
  }
  return p.x - x0;
}

// One-way platforms someone can land on: pins (Spice only) and the other's head.
function platformsFor(s, p) {
  const out = [];
  if (p.id === SPICE) for (const pin of s.pins) out.push({ x: pin.x, y: pin.y, w: 1, prevY: pin.y, who: -1 });
  for (const o of s.players) {
    if (o === p || o.dead) continue;
    out.push({ x: o.x, y: o.y, w: o.w, prevY: o.prevY, who: o.id });
  }
  return out;
}

// Returns what it landed on: null, 'tile', or {who} for a head / pin.
function moveY(s, p, dy) {
  const prevBottom = p.y + p.h;
  p.y += dy;
  const left = Math.floor(p.x + EPS), right = Math.floor(p.x + p.w - EPS);
  if (dy > 0) {
    const cy = Math.floor(p.y + p.h - EPS);
    let landTop = Infinity, landed = null;
    for (let cx = left; cx <= right; cx++) {
      if (solidTile(s, cx, cy) && cy >= prevBottom - 0.5) { landTop = cy; landed = 'tile'; break; }
    }
    for (const pl of platformsFor(s, p)) {
      if (p.x < pl.x + pl.w && p.x + p.w > pl.x && prevBottom <= pl.prevY + 0.05 && p.y + p.h >= pl.y && pl.y < landTop) {
        landTop = pl.y; landed = { who: pl.who };
      }
    }
    if (landed) { p.y = landTop - p.h; p.vy = 0; }
    return landed;
  }
  if (dy < 0) {
    const cy = Math.floor(p.y + EPS);
    for (let cx = left; cx <= right; cx++) if (solidTile(s, cx, cy)) { p.y = cy + 1; p.vy = 0; break; }
  }
  return null;
}

// ---------------------------------------------------------------- step

export function step(s, inputs) {
  s.events.length = 0;
  if (s.complete) return s;
  s.tick++;
  s.time = s.tick * C.DT;
  s.pressed = computePressed(s);
  s.held = heldDoors(s);

  const dxs = [0, 0];
  for (const p of s.players) {
    p.prevY = p.y;
    dxs[p.id] = updatePlayer(s, p, inputs[p.id] || NO_INPUT);
  }
  // Riders move with whoever they stand on.
  for (const p of s.players) {
    if (p.dead || p.standOn < 0) continue;
    const o = s.players[p.standOn];
    if (o.dead) { p.standOn = -1; continue; }
    moveX(s, p, dxs[o.id]);
    if (o.id > p.id) { const dy = o.y - o.prevY; if (dy < 0) moveY(s, p, dy); }
  }
  leash(s, dxs);
  updateShots(s);
  for (const p of s.players) touch(s, p);
  if (!s.bonk) {
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
        if (t >= 'A' && t <= 'D' && overlapsCell(p, cx, cy)) out.push(cy * s.w + cx);
      }
  }
  return out;
}

function computePressed(s) {
  const pressed = [false, false, false, false, false];
  for (const pl of s.plates) {
    for (const p of s.players) {
      if (p.dead) continue;
      if (pl.heavy && p.size !== 'big') continue;
      // standing in the plate's cell, feet at its floor
      if (p.x < pl.x + 1 && p.x + p.w > pl.x && p.y + p.h > pl.y + 0.75 && p.y < pl.y + 1) pressed[pl.g] = true;
    }
  }
  return pressed;
}

function updatePlayer(s, p, inp) {
  if (p.dead) {
    p.deadT -= C.DT;
    if (p.deadT <= 0) { placeAtSpawn(s, p); s.events.push({ type: 'respawn', who: p.id }); }
    return 0;
  }
  if (p.wave > 0) p.wave -= C.DT;
  if (p.stun > 0) { p.stun -= C.DT; inp = NO_INPUT; }

  const power = p.id === SUGAR ? s.powers.sugar : s.powers.spice;

  // abilities
  p.bright = false;
  if (inp.abilityPressed) useAbility(s, p, power);
  if (power === 'lantern' && inp.ability && p.onGround) p.bright = true;

  // horizontal
  let want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (p.slamming || p.bright) want = 0;
  if (want) p.facing = want;
  const accel = p.stun > 0 ? 10 : p.onGround ? C.ACCEL_GROUND : C.ACCEL_AIR;   // stunned: slide
  const target = want * C.RUN * (p.size === 'small' ? 0.9 : 1);
  if (p.vx < target) p.vx = Math.min(target, p.vx + accel * C.DT);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * C.DT);

  // jump: buffered press + coyote time
  p.jumpBuf = inp.jumpPressed ? C.JUMP_BUFFER : Math.max(0, p.jumpBuf - C.DT);
  p.coyote = p.onGround ? C.COYOTE : Math.max(0, p.coyote - C.DT);
  if (p.jumpBuf > 0 && p.coyote > 0 && !p.slamming) {
    p.vy = -(p.size === 'big' ? C.BIG_JUMP_V : C.JUMP_V);
    p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.standOn = -1;
    s.events.push({ type: 'jump', who: p.id });
  }
  if (!inp.jump && p.vy < 0 && !p.launched) p.vy *= 1 - C.JUMP_CUT * 0.5;
  if (p.vy >= 0) p.launched = false;

  // gravity
  p.vy = Math.min(p.slamming ? C.SLAM_V : C.MAX_FALL, p.vy + C.GRAVITY * C.DT);

  const dx = moveX(s, p, p.vx * C.DT);
  const wasGround = p.onGround;
  const vyBefore = p.vy;
  const landed = moveY(s, p, p.vy * C.DT);
  p.onGround = !!landed;
  p.standOn = landed && typeof landed === 'object' && landed.who >= 0 ? landed.who : -1;

  if (landed) {
    if (s.bonk && p.standOn >= 0 && vyBefore >= C.BONK_MIN_VY) bonk(s, p, s.players[p.standOn]);
    else if (p.slamming) slamLand(s, p);
    else if (!wasGround && vyBefore > 8) s.events.push({ type: 'land', who: p.id });
  }
  return dx;
}

function useAbility(s, p, power) {
  switch (power) {
    case 'pin': {
      s.shots.push({ x: p.x + p.w / 2, y: p.y + p.h * 0.45, dir: p.facing, dist: 0 });
      s.events.push({ type: 'pin', who: p.id });
      break;
    }
    case 'slam': {
      if (!p.onGround && !p.slamming) {
        p.slamming = true; p.vx = 0; p.vy = C.SLAM_V;
        s.events.push({ type: 'slam', who: p.id });
      }
      break;
    }
    case 'size': {
      const next = p.size === 'small' ? 'big' : 'small';
      const { w, h } = C.SIZE[next];
      const nx = p.x + p.w / 2 - w / 2, ny = p.y + p.h - h;
      if (rectHitsSolid(s, nx, ny, w, h)) { s.events.push({ type: 'nope', who: p.id }); break; }
      p.size = next; p.x = nx; p.y = ny; p.w = w; p.h = h; p.prevY = ny;
      s.events.push({ type: next, who: p.id });
      break;
    }
    case 'lantern': break;   // held, see updatePlayer
    default:
      p.wave = 1.2;
      s.events.push({ type: 'wave', who: p.id });
  }
}

function feetCells(p) {
  const cy = Math.floor(p.y + p.h + 0.01);
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
      o.vy = -C.LAUNCH_V; o.onGround = false; o.standOn = -1; o.launched = true;
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
  // pull back whoever moved away this step (both, if both did)
  const dir = Math.sign(gap);   // +1: b is right of a
  const awayA = -dir * dxs[0] > 0, awayB = dir * dxs[1] > 0;
  if (awayA && awayB) { moveX(s, a, dir * over / 2); moveX(s, b, -dir * over / 2); }
  else if (awayA) moveX(s, a, dir * over);
  else if (awayB) moveX(s, b, -dir * over);
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

function touch(s, p) {
  if (p.dead) return;
  if (p.y > s.h + 1) return kill(s, p);
  const x0 = Math.floor(p.x), x1 = Math.floor(p.x + p.w - EPS);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + p.h - EPS);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const t = tileAt(s, cx, cy);
      if (t === '^') {
        if (p.x < cx + 0.85 && p.x + p.w > cx + 0.15 && p.y + p.h > cy + 0.4) return kill(s, p);
      } else if (t === 'h') {
        s.grid[cy][cx] = '.';
        s.hearts++;
        s.events.push({ type: 'heart', who: p.id, x: cx + 0.5, y: cy + 0.5 });
      } else if (t === '!') {
        if (!s.checkpoint || s.checkpoint.x !== cx || s.checkpoint.y !== cy) {
          s.checkpoint = { x: cx, y: cy };
          s.events.push({ type: 'checkpoint', x: cx + 0.5, y: cy + 0.5 });
        }
      }
    }
  }
}

function kill(s, p) {
  p.dead = true; p.deadT = C.RESPAWN; p.vx = 0; p.vy = 0; p.slamming = false;
  for (const o of s.players) if (o.standOn === p.id) o.standOn = -1;
  s.events.push({ type: 'die', who: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

function inGoal(s, p) {
  for (let cy = Math.floor(p.y); cy <= Math.floor(p.y + p.h - EPS); cy++)
    for (let cx = Math.floor(p.x); cx <= Math.floor(p.x + p.w - EPS); cx++)
      if (tileAt(s, cx, cy) === '*') return true;
  return false;
}
