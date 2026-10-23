// The Kitchen in 3D: the truth. Pure and deterministic (no Math.random, no clock, no
// DOM, no trig: directions are vectors), so online lockstep replays it bit for bit.
//
// Each of you runs, jumps and double-jumps around one big open kitchen. Spice's syrup
// gun arcs blobs that stick to ants (coats them, slows them) and splat into puddles
// on whatever they land on; it never hurts. Sugar's sparks bounce off nearly
// everything, but light syrup: a caramel blast that chains through every coated ant
// and puddle nearby, and throws whoever stands in the puddle high into the air. That
// launch is the only way up onto the counters and the fridge. Three nests; then the
// lights go out and the Ant Queen comes for the cake.
import * as C from '../kitchen/config.js';

export const SUGAR = 0, SPICE = 1;
const len2 = (x, y) => Math.sqrt(x * x + y * y);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// the 3D tuning (the guns' numbers come from the 2D kitchen's config)
export const K = {
  R: 0.35, HGT: 1.0, STEP: 0.35, G: 32, WALK: 7, ACCEL: 60, AIR: 0.45,
  JUMP: 11, JUMP2: 10, LAUNCH_Z: 20, LAUNCH_H: 5.2, CAM_FOLLOW: 0.035,
  SYRUP_V: 13, SYRUP_G: 12, SPARK_V: 20, SPARK_RANGE: 11, PUDDLE_R: 0.9, BLAST_R: 1.9,
  ANT_V: 3.4, SOLDIER_V: 2.8, NEST_NEAR: 14, AGGRO: 11,
  AIM_CONE: 0.94,      // the gun goes where your camera looks; a target within ~20 degrees pulls it on
  JUMPER_V: 4.2, LEAP_V: 9, LEAP_TIME: 0.55, CARRIER_V: 2.6,
  CHAIN_GAP: 0.6,      // blasts this close together count as one chain
  TOAST_WAIT: 0.4, TOAST_V: 24, STEAM_R: 1.6, STEAM_TOP: 13, STEAM_LIFT: 55, STEAM_MAX: 7,
};
const HP_OF = { ant: C.ANT_HP, soldier: C.SOLDIER_HP, jumper: 2, carrier: 4 };
const R_OF = { ant: 0.34, soldier: 0.42, jumper: 0.32, carrier: 0.38 };

export function createKitchen3D(world, opts = {}) {
  const sp = world.ents.find((e) => e.type === 'spawn');
  const ents = world.ents.filter((e) => e.type !== 'spawn').map((e, i) => ({ ...e, i, ...entState(e) }));
  const s = {
    k3: true, chapterId: 'kitchen', mode: 'chapter', boxes: world.boxes, room: world.room, ents,
    spawn: { x: sp.x, y: sp.y, z: sp.z },
    players: [0, 1].map((id) => ({
      id, x: sp.x + (id ? 1 : -1), y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, fx: 0, fy: 1, cx: 0, cy: 1,
      ground: true, jumps: 0, hp: C.HP, hurt: 0, down: 0, cool: 0, launched: 0, still: true, safe: null, toast: 0,
    })),
    shots: [], puddles: [], blasts: [], warns: [], chain: { n: 0, t: 0 }, sprinkles: 0, sprinklesTotal: ents.filter((e) => e.type === 'sprinkle').length,
    nestsLeft: ents.filter((e) => e.type === 'nest').length, dark: false, boss: false,
    rng: (opts.seed ?? 7) >>> 0, tick: 0, time: 0, complete: false, endT: 0, events: [], gentle: !!opts.gentle,
  };
  for (const p of s.players) p.safe = { x: p.x, y: p.y, z: p.z };
  return s;
}

function entState(e) {
  switch (e.type) {
    case 'ant': { const hp = HP_OF[e.kind] || C.ANT_HP; return { hp, max: hp, coat: 0, coatT: 0, vx: 0, vy: 0, dead: false, awake: false, bite: 0, r: R_OF[e.kind] || 0.34, hx: e.x, hy: e.y, flash: 0, hz: 0, leap: 0, leapCool: 1, crouch: 0, lx: 0, ly: 0, shield: e.kind === 'carrier', fx: 1, fy: 0 }; }
    case 'sprinkle': return { got: false };
    case 'kettle': return { state: 'calm', t: 4 };
    case 'nest': return { hp: C.NEST_HP, max: C.NEST_HP, coat: 0, coatT: 0, t: 1.5, n: 0, dead: false, r: 0.9 };
    case 'queen': return { hp: C.QUEEN_HP, max: C.QUEEN_HP, coat: 0, coatT: 0, state: 'sleep', act: 0, n: 0, cycle: 0, tx: 0, ty: 0, dead: false, r: 1.2, angry: false };
    case 'gallery': return { phase: 'idle', wait: 0, t: 0, score: [0, 0], targets: [], spawnT: 0, winner: -1, rest: 0 };
    default: return {};
  }
}
function rnd(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }

// ---------------------------------------------------------------- the room

// the highest walkable top under a footprint, no higher than `upTo`
export function supportAt(s, x, y, r, upTo) {
  let best = -Infinity;
  for (const b of s.boxes) {
    if (x + r <= b[0] || x - r >= b[3] || y + r <= b[1] || y - r >= b[4]) continue;
    if (b[5] <= upTo + 1e-6 && b[5] > best) best = b[5];
  }
  return best;
}
function blockedAt(s, x, y, z, r, h) {
  for (const b of s.boxes) {
    if (x + r <= b[0] || x - r >= b[3] || y + r <= b[1] || y - r >= b[4]) continue;
    if (b[5] > z + K.STEP && b[2] < z + h) return true;
  }
  return false;
}
function solidPoint(s, x, y, z) {
  for (const b of s.boxes) if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return b;
  return null;
}
export const alive = (p) => !p.down;
const enemies = (s) => s.ents.filter((e) => (e.type === 'ant' || e.type === 'nest' || (e.type === 'queen' && e.state !== 'sleep')) && !e.dead);
export const queenOf = (s) => s.ents.find((e) => e.type === 'queen');

// ---------------------------------------------------------------- the step

export function step(s, inputs) {
  s.events.length = 0;
  if (s.complete) return s;
  s.tick++; s.time = s.tick * C.DT;
  if (inputs.some((i) => i && i.regroup)) {
    s.players.forEach((p) => { Object.assign(p, { x: s.spawn.x + (p.id ? 1 : -1), y: s.spawn.y, z: s.spawn.z, vx: 0, vy: 0, vz: 0, down: 0 }); p.hp = Math.max(1, p.hp); });
    s.events.push({ type: 'regroup' });
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
    else if (e.type === 'kettle') kettleStep(s, e);
    else if (e.type === 'sprinkle') sprinkleStep(s, e);
    if (e.flash > 0) e.flash -= C.DT;
  }
  if (s.chain.t > 0) s.chain.t -= C.DT; else s.chain.n = 0;
  for (const p of s.players) toyStep(s, p);
  updateWarns(s);
  if (s.endT > 0 && (s.endT -= C.DT) <= 0) s.complete = true;
  return s;
}

function updatePlayer(s, p, inp) {
  if (p.hurt > 0) p.hurt -= C.DT;
  if (p.cool > 0) p.cool -= C.DT;
  if (p.down > 0) {
    if ((p.down -= C.DT) <= 0) {
      p.down = 0; p.hp = C.HP;
      const o = s.players[1 - p.id];
      const at = alive(o) ? o.safe : s.cp || s.spawn;   // back in beside your partner, or where you last won a nest
      Object.assign(p, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, hurt: C.HURT_TIME });
      s.events.push({ type: 'respawn', who: p.id, x: p.x, y: p.y, z: p.z });
    }
    return;
  }
  // turning your camera (a fixed small angle a tick, as numbers: no trig in the sim)
  if (inp.camL || inp.camR) {
    const c = 0.9980261, sn = inp.camL ? 0.0627905 : -0.0627905;   // 3.6 degrees
    const nx = p.cx * c - p.cy * sn, ny = p.cx * sn + p.cy * c, l = len2(nx, ny) || 1;
    p.cx = nx / l; p.cy = ny / l;
  }
  // the stick, relative to your camera; the camera swings round behind where you go
  const fwd = (inp.up ? 1 : 0) - (inp.down ? 1 : 0), side = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  let wx = p.cx * fwd + p.cy * side, wy = p.cy * fwd - p.cx * side;
  const wl = len2(wx, wy);
  p.still = wl < 1e-6;
  if (!p.still) {
    wx /= wl; wy /= wl; p.fx = wx; p.fy = wy;
    if (fwd > 0) { const nx = p.cx + wx * K.CAM_FOLLOW, ny = p.cy + wy * K.CAM_FOLLOW, l = len2(nx, ny) || 1; p.cx = nx / l; p.cy = ny / l; }
  }
  const ctl = p.ground ? 1 : p.launched > 0 ? 0.15 : K.AIR;
  if (p.launched > 0) p.launched -= C.DT;
  const acc = K.ACCEL * C.DT * ctl;
  const tx = p.still ? 0 : wx * K.WALK, ty = p.still ? 0 : wy * K.WALK;
  if (!(p.launched > 0) && !(p.still && !p.ground)) {   // in the air with no stick, you keep your momentum
    p.vx += Math.max(-acc, Math.min(acc, tx - p.vx));
    p.vy += Math.max(-acc, Math.min(acc, ty - p.vy));
  }
  // jump, and once more in the air
  if (inp.jumpPressed) {
    if (p.ground) { p.vz = K.JUMP; p.ground = false; p.jumps = 1; s.events.push({ type: 'jump', who: p.id }); }
    else if (p.jumps < 2) { p.vz = K.JUMP2; p.jumps = 2; s.events.push({ type: 'jump', who: p.id, second: true }); }
  }
  // move across, then up and down
  const nx = p.x + p.vx * C.DT, ny = p.y + p.vy * C.DT;
  if (!blockedAt(s, nx, p.y, p.z, K.R, K.HGT)) p.x = nx; else p.vx = 0;
  if (!blockedAt(s, p.x, ny, p.z, K.R, K.HGT)) p.y = ny; else p.vy = 0;
  const floor = supportAt(s, p.x, p.y, K.R * 0.8, p.z + K.STEP);
  p.vz -= K.G * C.DT;
  let nz = p.z + p.vz * C.DT;
  const wasGround = p.ground;
  if (nz <= floor) {
    if (!wasGround && p.vz < -6) s.events.push({ type: 'land', who: p.id, x: p.x, y: p.y, z: floor, hard: p.vz < -16 });
    nz = floor; p.vz = 0; p.ground = true; p.jumps = 0; p.launched = 0;
  } else p.ground = nz - floor < 0.02;
  p.z = nz;
  if (inp.ability && p.cool <= 0) fire(s, p, !!inp.abilityPressed);
  if (p.ground) p.safe = { x: p.x, y: p.y, z: p.z };
}

export function hurt(s, p, from) {
  if (p.hurt > 0 || !alive(p)) return false;
  p.hp -= 1; p.hurt = C.HURT_TIME;
  if (from) { const dx = p.x - from.x, dy = p.y - from.y, l = len2(dx, dy) || 1; p.vx = (dx / l) * 8; p.vy = (dy / l) * 8; p.vz = 5; p.ground = false; }
  s.events.push({ type: 'ouch', who: p.id, x: p.x, y: p.y, z: p.z });
  if (p.hp <= 0) { p.hp = 0; p.down = C.DOWN_TIME; s.events.push({ type: 'down', who: p.id, x: p.x, y: p.y, z: p.z }); }
  return true;
}

// ---------------------------------------------------------------- the two guns

// Aim: where you face, nudged onto the best target within ~35 degrees and a step or
// two up or down; standing still, onto the best target all round.
// Aim: where your camera looks, pulled onto the best target within ~20 degrees of it.
// Sugar's sparks go for what's coated first; Spice's syrup for what isn't yet.
export function aimOf(s, p) {
  let best = -1, tgt = null;
  const range = p.id === SUGAR ? K.SPARK_RANGE : 9;
  for (const e of enemies(s)) {
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = len2(dx, dy);
    if (d > range + e.r || d < 1e-3 || Math.abs(dz) > 3) continue;
    const cos = (dx * p.cx + dy * p.cy) / d;
    if (cos < K.AIM_CONE) continue;
    const want = p.id === SUGAR ? (e.coat > 0 ? 2 : e.type === 'ant' && e.kind !== 'soldier' ? 1 : 0) : (e.coat < C.COAT_MAX ? 2 : 0);
    const score = want * 10 + cos * 20 - d * 0.2;
    if (score > best) { best = score; tgt = e; }
  }
  return tgt;
}

function fire(s, p, pressed) {
  const t = aimOf(s, p);
  p.fx = p.cx; p.fy = p.cy;   // you turn to shoot where you look
  const ox = p.x + p.fx * 0.3, oy = p.y + p.fy * 0.3, oz = p.z + 0.55;
  if (p.id === SPICE) {
    p.cool = C.SYRUP_RATE;
    // a lob: straight at a target (with the drop allowed for), else ahead and a little up
    let dx = p.fx, dy = p.fy, dz = 0.22;
    if (t) {
      const ex = t.x - ox, ey = t.y - oy, d = len2(ex, ey) || 1, tt = d / K.SYRUP_V;
      dx = ex / d; dy = ey / d; dz = Math.max(-0.6, Math.min(0.8, (t.z + 0.4 - oz + 0.5 * K.SYRUP_G * tt * tt) / (K.SYRUP_V * tt)));
    }
    const l = len3(dx, dy, dz);
    s.shots.push({ kind: 'syrup', who: p.id, x: ox, y: oy, z: oz, vx: (dx / l) * K.SYRUP_V, vy: (dy / l) * K.SYRUP_V, vz: (dz / l) * K.SYRUP_V, dist: 0, aimed: !!t });
    s.events.push({ type: 'syrup', who: p.id, x: p.x, y: p.y, z: p.z, first: pressed });
  } else {
    p.cool = C.SPARK_RATE;
    s.events.push({ type: 'spark', who: p.id, x: p.x, y: p.y, z: p.z });
    // standing in syrup with nothing to aim at: she lights her own feet, and up you go
    const pd = !t && s.puddles.find((q) => !q.burn && Math.abs(q.z - p.z) < 0.3 && len2(q.x - p.x, q.y - p.y) < K.PUDDLE_R);
    if (pd) { ignitePuddle(s, pd, 0); return; }
    let dx = p.fx, dy = p.fy, dz = -0.02;
    if (t) { dx = t.x - ox; dy = t.y - oy; dz = t.z + 0.4 - oz; }
    const l = len3(dx, dy, dz) || 1;
    s.shots.push({ kind: 'spark', who: p.id, x: ox, y: oy, z: oz, vx: (dx / l) * K.SPARK_V, vy: (dy / l) * K.SPARK_V, vz: (dz / l) * K.SPARK_V, dist: 0 });
  }
}

function updateShots(s) {
  for (const b of s.shots) {
    for (let k = 0; k < 3 && !b.done; k++) {
      const dt = C.DT / 3;
      if (b.kind === 'syrup') b.vz -= K.SYRUP_G * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
      b.dist += len3(b.vx, b.vy, b.vz) * dt;
      const hitBox = solidPoint(s, nx, ny, nz);
      if (hitBox) {
        if (b.kind === 'syrup') {   // a splat: on the top it fell onto, or dripped to the ground below a side it hit
          const top = b.z >= hitBox[5] - 0.05 ? hitBox[5] : supportAt(s, b.x, b.y, 0.05, b.z);
          addPuddle(s, b.x, b.y, top);
        } else {
          const pd = s.puddles.find((q) => !q.burn && len3(q.x - b.x, q.y - b.y, q.z - b.z) < K.PUDDLE_R + 0.3);
          if (pd) ignitePuddle(s, pd, 0); else s.events.push({ type: 'fizzle', x: b.x, y: b.y, z: b.z });
        }
        b.done = true; break;
      }
      b.x = nx; b.y = ny; b.z = nz;
      if (hitSomething(s, b)) { b.done = true; break; }
      if (b.kind === 'spark' && b.dist > K.SPARK_RANGE) { s.events.push({ type: 'fizzle', x: b.x, y: b.y, z: b.z }); b.done = true; }
      if (b.kind === 'syrup' && b.dist > 30) b.done = true;
    }
  }
  s.shots = s.shots.filter((b) => !b.done);
}

function hitSomething(s, b) {
  for (const g of s.ents) {
    if (g.type !== 'gallery' || g.phase !== 'run') continue;
    for (const t of g.targets) {
      if (t.hit || len3(t.x - b.x, t.y - b.y, t.z - b.z) > 0.5) continue;
      t.hit = true; g.score[b.who]++;
      s.events.push({ type: 'sprinkle', who: b.who, x: t.x, y: t.y, z: t.z, n: g.score[b.who] });
      return true;
    }
  }
  for (const e of enemies(s)) {
    const cz = e.z + (e.hz || 0) + e.r * 0.8;
    if (len3(e.x - b.x, e.y - b.y, cz - b.z) > e.r + 0.25) continue;
    // a carrier's sugar cube takes anything from the front: syrup drips to its feet, sparks bounce
    if (e.shield) {
      const sx = s.players[b.who].x - e.x, sy = s.players[b.who].y - e.y, sl = len2(sx, sy) || 1;
      if ((sx * e.fx + sy * e.fy) / sl > 0.25) {
        if (b.kind === 'syrup') addPuddle(s, e.x + e.fx * 0.3, e.y + e.fy * 0.3, e.z);
        e.flash = 0.08; s.events.push({ type: 'block', x: e.x, y: e.y, z: e.z });
        return true;
      }
    }
    e.flash = 0.1;
    if (b.kind === 'syrup') {
      e.coat = Math.min(C.COAT_MAX, e.coat + 1); e.coatT = e.type === 'queen' ? C.QUEEN_DECAY : C.COAT_DECAY;
      if (e.type === 'ant') e.awake = true;
      s.events.push({ type: 'coat', x: e.x, y: e.y, z: e.z, n: e.coat });
      return true;
    }
    if (e.coat > 0) { igniteThing(s, e, 0); return true; }
    if (e.type === 'ant' && e.kind !== 'soldier') { damage(s, e, C.SPARK_DMG); s.events.push({ type: 'zap', x: e.x, y: e.y, z: e.z }); }
    else s.events.push({ type: 'tink', x: e.x, y: e.y, z: e.z });
    return true;
  }
  if (b.kind === 'syrup' && !b.aimed) {   // his syrup on her (when he isn't aiming at an ant): a puddle at her feet
    const o = s.players[1 - b.who];
    if (alive(o) && len3(o.x - b.x, o.y - b.y, o.z + 0.5 - b.z) < K.R + 0.3) { addPuddle(s, o.x, o.y, supportAt(s, o.x, o.y, 0.05, o.z + 0.05)); return true; }
  } else if (b.kind === 'spark') {
    const pd = s.puddles.find((q) => !q.burn && Math.abs(q.z - b.z) < 0.7 && len2(q.x - b.x, q.y - b.y) < K.PUDDLE_R * 0.9);
    if (pd) { ignitePuddle(s, pd, 0); return true; }
  }
  return false;
}

function addPuddle(s, x, y, z) {
  if (!Number.isFinite(z)) return;
  const near = s.puddles.find((q) => !q.burn && Math.abs(q.z - z) < 0.2 && len2(q.x - x, q.y - y) < K.PUDDLE_R * 0.7);
  if (near) { near.life = C.PUDDLE_LIFE; near.x = (near.x * 3 + x) / 4; near.y = (near.y * 3 + y) / 4; s.events.push({ type: 'splat', x, y, z }); return; }
  s.puddles.push({ x, y, z, life: C.PUDDLE_LIFE, burn: 0 });
  if (s.puddles.length > C.PUDDLE_MAX) { const k = s.puddles.findIndex((q) => !q.burn); if (k >= 0) s.puddles.splice(k, 1); }
  s.events.push({ type: 'splat', x, y, z });
}
export const onPuddle = (s, x, y, z) => s.puddles.some((q) => !q.burn && Math.abs(q.z - z) < 0.3 && len2(q.x - x, q.y - y) < K.PUDDLE_R);

// ---------------------------------------------------------------- caramel

function ignitePuddle(s, pd, delay) {
  if (pd.burn) return;
  pd.burn = C.BURN_TIME; pd.life = Math.max(pd.life, C.BURN_TIME);
  s.blasts.push({ x: pd.x, y: pd.y, z: pd.z, r: K.BLAST_R * 0.9, coat: 0, t: delay, puddle: true });
  // whoever stands in it goes up: a caramel launch, the way they face
  for (const p of s.players) {
    if (!alive(p) || Math.abs(p.z - pd.z) > 0.4 || len2(p.x - pd.x, p.y - pd.y) > K.PUDDLE_R + 0.2) continue;
    p.vz = K.LAUNCH_Z; p.vx = p.cx * K.LAUNCH_H; p.vy = p.cy * K.LAUNCH_H; p.fx = p.cx; p.fy = p.cy; p.ground = false; p.jumps = 1; p.launched = 0.5;   // you fly where you look
    s.events.push({ type: 'launch', who: p.id, x: p.x, y: p.y, z: p.z });
  }
}
function igniteThing(s, e, delay) {
  const coat = e.coat;
  e.coat = 0;
  s.blasts.push({ x: e.x, y: e.y, z: e.z + 0.3, r: K.BLAST_R + coat * 0.3, coat, t: delay, on: e.i });
}
function updateBlasts(s) {
  const now = [];
  for (const b of s.blasts) { b.t -= C.DT; if (b.t <= 0) now.push(b); }
  if (!now.length) return;
  s.blasts = s.blasts.filter((b) => b.t > 0);
  for (const b of now) {
    s.chain.n++; s.chain.t = K.CHAIN_GAP;
    s.events.push({ type: 'blast', x: b.x, y: b.y, z: b.z, r: b.r, big: b.coat >= 2 || !b.puddle, chain: s.chain.n });
    if (s.chain.n >= 3) s.events.push({ type: 'chain', n: s.chain.n, x: b.x, y: b.y, z: b.z });
    for (const e of enemies(s)) {
      if (len3(e.x - b.x, e.y - b.y, e.z - b.z) > b.r + e.r) continue;
      const coat = e.i === b.on ? b.coat : e.coat;
      if (e.type === 'queen') {
        if (coat <= 0) { s.events.push({ type: 'tink', x: e.x, y: e.y, z: e.z }); continue; }
        damage(s, e, C.BLAST_DMG + C.BLAST_COAT * coat);
        if (e.i !== b.on) e.coat = 0;
        continue;
      }
      if (e.shield) { e.shield = false; s.events.push({ type: 'shieldOff', x: e.x, y: e.y, z: e.z }); }
      damage(s, e, C.BLAST_DMG + C.BLAST_COAT * coat);
      if (e.type === 'ant' && !e.dead) { const dx = e.x - b.x, dy = e.y - b.y, l = len2(dx, dy) || 1; e.vx = (dx / l) * 7; e.vy = (dy / l) * 7; e.flash = 0.15; }
      if (e.i !== b.on && e.coat > 0) igniteThing(s, e, C.CHAIN_DELAY);
    }
    for (const pd of s.puddles) if (!pd.burn && Math.abs(pd.z - b.z) < 1.2 && len2(pd.x - b.x, pd.y - b.y) < b.r + K.PUDDLE_R * 0.4) ignitePuddle(s, pd, C.CHAIN_DELAY);
  }
}

function damage(s, e, n) {
  if (e.dead) return;
  e.hp -= n;
  if (e.type === 'ant') e.awake = true;
  s.events.push({ type: 'hit', x: e.x, y: e.y, z: e.z, kind: e.type, n });
  if (e.hp > 0) return;
  e.hp = 0; e.dead = true;
  if (e.type === 'queen') { s.endT = 3; s.dark = false; s.events.push({ type: 'queenDown', x: e.x, y: e.y, z: e.z }); return; }
  s.events.push({ type: e.type === 'nest' ? 'nestDown' : 'antDown', x: e.x, y: e.y, z: e.z, kind: e.kind });
  if (e.type === 'nest') {
    s.nestsLeft--;
    const safe = s.players.find((p) => alive(p) && p.ground);
    s.cp = safe ? { ...safe.safe } : s.cp;
    s.events.push({ type: 'nestsLeft', n: s.nestsLeft });
    if (s.nestsLeft === 0) wakeQueen(s);
    else {   // the colony is angry: a wave pours out around the ruin
      const kinds = ['jumper', 'ant', 'carrier', 'jumper', 'soldier', 'ant'];
      const n = 3 + (5 - s.nestsLeft);
      let made = 0;
      for (let k = 0; k < 16 && made < n; k++) {
        const ax = [1, -1, 0, 0, 1, -1, 1, -1][k % 8], ay = [0, 0, 1, -1, 1, 1, -1, -1][k % 8], rr = 2.5 + (k >> 3) * 1.5;
        const x = e.x + ax * rr, y = e.y + ay * rr;
        if (supportAt(s, x, y, 0.3, e.z + 0.05) !== e.z || blockedAt(s, x, y, e.z, 0.3, 0.6)) continue;
        spawnAnt(s, x, y, e.z, kinds[made % kinds.length]); made++;
      }
      s.events.push({ type: 'wave', x: e.x, y: e.y, z: e.z, n: made });
    }
  }
}

function updatePuddles(s) {
  for (const pd of s.puddles) {
    pd.life -= C.DT;
    if (pd.burn > 0) {
      pd.burn -= C.DT;
      for (const e of enemies(s)) if (e.type === 'ant' && Math.abs(e.z - pd.z) < 0.5 && len2(e.x - pd.x, e.y - pd.y) < K.PUDDLE_R + e.r) damage(s, e, C.DT);
      if (pd.burn <= 0) pd.life = 0;
    }
  }
  s.puddles = s.puddles.filter((q) => q.life > 0);
}

// ---------------------------------------------------------------- ants, nests, the queen

function nearestPlayer(s, e, max) {
  let best = null, bd = max;
  for (const p of s.players) {
    if (!alive(p) || Math.abs(p.z - e.z) > 1.4) continue;   // ants keep to their own level
    const d = len2(p.x - e.x, p.y - e.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// an ant only walks where its own level carries on (it never steps off an edge)
function antMove(s, e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  const okX = supportAt(s, nx, e.y, e.r * 0.5, e.z + 0.05) === e.z && !blockedAt(s, nx, e.y, e.z, e.r * 0.8, 0.6);
  if (okX) e.x = nx; else e.vx = 0;
  const okY = supportAt(s, e.x, ny, e.r * 0.5, e.z + 0.05) === e.z && !blockedAt(s, e.x, ny, e.z, e.r * 0.8, 0.6);
  if (okY) e.y = ny; else e.vy = 0;
}

function antStep(s, e) {
  if (e.dead) return;
  if (e.coatT > 0 && (e.coatT -= C.DT) <= 0 && e.coat > 0) { e.coat--; e.coatT = e.coat ? C.COAT_DECAY : 0; }
  if (e.bite > 0) e.bite -= C.DT;
  const p = nearestPlayer(s, e, e.awake ? K.AGGRO * 1.5 : (s.dark ? 5 : K.AGGRO));
  if (p) e.awake = true;
  let tx = 0, ty = 0, pd = 99;
  if (p) { const dx = p.x - e.x, dy = p.y - e.y, d = len2(dx, dy) || 1; tx = dx / d; ty = dy / d; pd = d; }
  else if (len2(e.hx - e.x, e.hy - e.y) > 3) { const dx = e.hx - e.x, dy = e.hy - e.y, d = len2(dx, dy); tx = dx / d * 0.5; ty = dy / d * 0.5; }
  if (p) { e.fx = tx; e.fy = ty; }
  // a jumper leaps the last few metres at you: a hop you can see coming, and roll out of
  if (e.kind === 'jumper') {
    if (e.leap > 0) {
      e.leap -= C.DT;
      const u = 1 - e.leap / K.LEAP_TIME;
      e.hz = 4 * 1.4 * u * (1 - u);
      antMove(s, e, e.vx * C.DT, e.vy * C.DT);
      if (e.leap <= 0) { e.hz = 0; e.leapCool = 2.4; s.events.push({ type: 'thud', x: e.x, y: e.y, z: e.z, small: true }); }
      biteCheck(s, e, p, tx, ty);
      return;
    }
    if (e.crouch > 0) {   // the tell: it crouches, then goes
      e.crouch -= C.DT; e.vx = 0; e.vy = 0;
      if (e.crouch <= 0) { e.leap = K.LEAP_TIME; e.vx = e.lx * K.LEAP_V; e.vy = e.ly * K.LEAP_V; s.events.push({ type: 'leap', x: e.x, y: e.y, z: e.z }); }
      return;
    }
    if (e.leapCool > 0) e.leapCool -= C.DT;
    else if (p && pd < 4.5 && pd > 1.2 && e.coat < 2) { e.crouch = 0.4; e.lx = tx; e.ly = ty; s.events.push({ type: 'crouch', x: e.x, y: e.y, z: e.z }); return; }
  }
  let v = ({ soldier: K.SOLDIER_V, jumper: K.JUMPER_V, carrier: K.CARRIER_V }[e.kind] || K.ANT_V) * (1 - 0.22 * e.coat);
  if (onPuddle(s, e.x, e.y, e.z)) {
    v *= 0.45; e.stick = (e.stick || 0) + C.DT;
    if (e.stick >= 0.8) { e.stick = 0; if (e.coat < C.COAT_MAX) { e.coat++; e.coatT = C.COAT_DECAY; } }
  }
  const acc = 30 * C.DT;
  e.vx += Math.max(-acc, Math.min(acc, tx * v - e.vx));
  e.vy += Math.max(-acc, Math.min(acc, ty * v - e.vy));
  for (const o of s.ents) {
    if (o === e || o.type !== 'ant' || o.dead || Math.abs(o.z - e.z) > 0.5) continue;
    const dx = e.x - o.x, dy = e.y - o.y, d = len2(dx, dy), min = e.r + o.r;
    if (d < min && d > 1e-4) { e.vx += (dx / d) * 2; e.vy += (dy / d) * 2; }
  }
  antMove(s, e, e.vx * C.DT, e.vy * C.DT);
  biteCheck(s, e, p, tx, ty);
}
function biteCheck(s, e, p, tx, ty) {
  if (p && e.bite <= 0 && len2(p.x - e.x, p.y - e.y) < K.R + e.r + 0.1 && p.z - e.z < 0.8 + e.hz) {
    if (hurt(s, p, e)) { e.bite = 0.8; e.vx = -tx * 5; e.vy = -ty * 5; e.leap = 0; e.hz = 0; s.events.push({ type: 'bite', x: p.x, y: p.y, z: p.z }); }
  }
}

function liveAnts(s, z) { let n = 0; for (const e of s.ents) if (e.type === 'ant' && !e.dead && (z === undefined || Math.abs(e.z - z) < 0.5)) n++; return n; }
function spawnAnt(s, x, y, z, kind) {
  const e = { type: 'ant', kind, x, y, z, i: s.ents.length, ...entState({ type: 'ant', kind, x, y }), awake: true };
  s.ents.push(e);
  s.events.push({ type: 'spawn', x, y, z });
  return e;
}

function nestStep(s, e) {
  if (e.dead) return;
  if (e.coatT > 0 && (e.coatT -= C.DT) <= 0 && e.coat > 0) { e.coat--; e.coatT = e.coat ? C.COAT_DECAY : 0; }
  if (!s.players.some((p) => alive(p) && len3(p.x - e.x, p.y - e.y, p.z - e.z) < K.NEST_NEAR)) return;
  if ((e.t -= C.DT) > 0) return;
  e.t = C.NEST_EVERY * (0.85 + rnd(s) * 0.3);
  if (liveAnts(s, e.z) >= (e.z > 0.5 ? 3 : 5)) return;   // high up there's less room: fewer of them
  e.n++;
  const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][rnd(s) * 4 | 0];
  const x = e.x + d[0] * 1.3, y = e.y + d[1] * 1.3;
  if (supportAt(s, x, y, 0.2, e.z + 0.05) !== e.z) return;
  spawnAnt(s, x, y, e.z, ['ant', 'jumper', 'ant', 'carrier', 'ant', 'soldier'][e.n % 6]);
}

// the twist: with the nests gone, the lights go out and the queen comes for the cake
function wakeQueen(s) {
  const q = queenOf(s);
  q.state = 'walk'; q.n = 2;
  s.dark = true; s.boss = true;
  s.events.push({ type: 'lightsOut', x: q.x, y: q.y, z: q.z });
  s.events.push({ type: 'bossStart', x: q.x, y: q.y, z: q.z });
}

const TABLE = (s) => s.boxes.find((b) => b[6] === 'table');
function queenStep(s, q) {
  if (q.state === 'sleep' || q.dead) return;
  if (!q.stun && q.coatT > 0 && (q.coatT -= C.DT) <= 0 && q.coat > 0) { q.coat--; q.coatT = q.coat ? C.QUEEN_DECAY : 0; }
  const half = q.hp <= q.max / 2;
  if (half && !q.angry) { q.angry = true; s.events.push({ type: 'queenAngry', x: q.x, y: q.y, z: q.z }); }
  const tb = TABLE(s);
  const clampT = () => { q.x = Math.max(tb[0] + q.r, Math.min(tb[3] - q.r, q.x)); q.y = Math.max(tb[1] + q.r, Math.min(tb[4] - q.r, q.y)); };
  if (q.state === 'stun') { if ((q.act -= C.DT) <= 0) q.state = 'walk'; return; }
  if (q.state === 'aim') { if ((q.act -= C.DT) <= 0) { q.state = 'charge'; q.act = 1.1; s.events.push({ type: 'charge', x: q.x, y: q.y, z: q.z }); } return; }
  if (q.state === 'charge') {
    const dx = q.tx - q.x, dy = q.ty - q.y, d = len2(dx, dy) || 1;
    const ox = q.x, oy = q.y;
    q.x += (dx / d) * C.CHARGE_V * C.DT; q.y += (dy / d) * C.CHARGE_V * C.DT; clampT();
    for (const pd of s.puddles) if (!pd.burn && !pd.used && Math.abs(pd.z - q.z) < 0.3 && len2(pd.x - q.x, pd.y - q.y) < K.PUDDLE_R + q.r * 0.6) { pd.used = true; q.coat = Math.min(C.COAT_MAX, q.coat + 1); q.coatT = C.QUEEN_DECAY * 1.5; s.events.push({ type: 'coat', x: q.x, y: q.y, z: q.z, n: q.coat }); }
    for (const p of s.players) if (alive(p) && Math.abs(p.z - q.z) < 1.2 && len2(p.x - q.x, p.y - q.y) < q.r + K.R) hurt(s, p, q);
    if (Math.abs(q.x - ox) + Math.abs(q.y - oy) < 0.01) { q.state = 'stun'; q.act = C.STUN_TIME; q.stun = true; s.events.push({ type: 'thud', x: q.x, y: q.y, z: q.z }); return; }   // the table's edge stops her: stunned
    if ((q.act -= C.DT) <= 0 || d < 0.4) q.state = 'walk';
    return;
  }
  q.stun = false;
  let near = null, nd = Infinity;
  for (const p of s.players) if (alive(p)) { const d = len2(p.x - q.x, p.y - q.y); if (d < nd) { nd = d; near = p; } }
  if (near) {
    const dx = near.x - q.x, dy = near.y - q.y, d = nd || 1;
    const v = d > 3 ? 1.4 * (1 - 0.15 * q.coat) : 0;
    q.x += (dx / d) * v * C.DT; q.y += (dy / d) * v * C.DT; clampT();
    if (Math.abs(near.z - q.z) < 1.2 && d < q.r + K.R + 0.1) hurt(s, near, q);
  }
  q.n += C.DT;
  if (q.n < (half ? 2.2 : 3.0)) return;
  q.n = 0; q.cycle++;
  const pick = half ? q.cycle % 3 : q.cycle % 2;
  if (pick === 0) {   // she spits at each of you, wherever you are
    for (const p of s.players) if (alive(p)) s.warns.push({ x: p.x, y: p.y, z: p.z, r: C.SPIT_R, t: C.SPIT_WARN, max: C.SPIT_WARN });
    s.events.push({ type: 'spit', x: q.x, y: q.y, z: q.z });
  } else if (pick === 1) {
    if (liveAnts(s, q.z) < 4) for (const k of [-1, 1]) { const x = Math.max(tb[0] + 0.5, Math.min(tb[3] - 0.5, q.x + k * 2)); spawnAnt(s, x, q.y, q.z, q.cycle % 4 === 1 ? 'soldier' : 'ant'); }
  } else if (near) {
    const dx = near.x - q.x, dy = near.y - q.y, d = len2(dx, dy) || 1;
    q.tx = q.x + (dx / d) * 14; q.ty = q.y + (dy / d) * 14;
    q.state = 'aim'; q.act = C.CHARGE_WARN;
    s.events.push({ type: 'aim', x: q.x, y: q.y, z: q.z });
  }
}

function updateWarns(s) {
  for (const w of s.warns) {
    if ((w.t -= C.DT) > 0) continue;
    w.done = true;
    s.events.push({ type: 'splash', x: w.x, y: w.y, z: w.z, r: w.r });
    for (const p of s.players) if (alive(p) && Math.abs(p.z - w.z) < 1.5 && len2(p.x - w.x, p.y - w.y) < w.r + K.R * 0.5) hurt(s, p, w);
  }
  s.warns = s.warns.filter((w) => !w.done);
}

// what lights the kitchen once the lights are out: burning puddles, blasts' afterglow, sparks, and each of you a little
export function lights(s) {
  const out = [];
  for (const p of s.players) if (alive(p)) out.push([p.x, p.y, p.z + 0.5, 3]);
  for (const pd of s.puddles) if (pd.burn > 0) out.push([pd.x, pd.y, pd.z + 0.3, 5]);
  return out;
}

// ---------------------------------------------------------------- the Sprinkle Gallery

function galleryStep(s, g) {
  const onPad = (p) => alive(p) && Math.abs(p.z - g.z) < 0.3 && Math.abs(p.x - g.x) < 1.6 && Math.abs(p.y - g.y) < 1;
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
    g.targets.push({ x: right ? g.x0 + 0.1 : g.x1 - 0.1, y: g.ty, z: g.z + 0.6 + (rnd(s) < 0.5 ? 0 : 0.8), v: (right ? 1 : -1) * (2.5 + rnd(s) * 2.5), c: rnd(s) * 6 | 0, hit: false });
  }
  if (g.t <= 0) {
    g.phase = 'rest'; g.rest = 3; g.targets = [];
    g.winner = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
    s.events.push({ type: 'galleryEnd', who: g.winner, score: [...g.score] });
  }
}

// ---------------------------------------------------------------- the kitchen's toys

// the toaster: stand on it a moment and it pops you sky high
// the kettle on the stove: it boils every so often, and its steam carries you up to the wall cupboards
function toyStep(s, p) {
  if (!alive(p)) return;
  const toaster = s.boxes.find((b) => b[6] === 'toaster');
  const onToaster = toaster && p.ground && Math.abs(p.z - toaster[5]) < 0.01 && p.x > toaster[0] && p.x < toaster[3] && p.y > toaster[1] && p.y < toaster[4];
  if (onToaster) {
    p.toast += C.DT;
    if (p.toast >= K.TOAST_WAIT) { p.toast = 0; p.vz = K.TOAST_V; p.ground = false; p.jumps = 1; p.launched = 0.3; s.events.push({ type: 'toast', who: p.id, x: p.x, y: p.y, z: p.z }); }
  } else p.toast = 0;
  for (const k of s.ents) {
    if (k.type !== 'kettle' || k.state !== 'steam') continue;
    if (!p.ground && len2(p.x - k.x, p.y - k.y) < K.STEAM_R && p.z >= k.z - 0.1 && p.z < k.z + K.STEAM_TOP) {   // jump into it and it takes you
      p.vz = Math.min(K.STEAM_MAX, p.vz + K.STEAM_LIFT * C.DT); p.ground = false; p.jumps = 1;
      if (!p.steamed) { p.steamed = true; s.events.push({ type: 'steamRide', who: p.id, x: p.x, y: p.y, z: p.z }); }
    } else p.steamed = false;
  }
}
function kettleStep(s, k) {
  if ((k.t -= C.DT) > 0) return;
  if (k.state === 'calm') { k.state = 'whistle'; k.t = 1.5; s.events.push({ type: 'kettle', x: k.x, y: k.y, z: k.z }); }
  else if (k.state === 'whistle') { k.state = 'steam'; k.t = 6; s.events.push({ type: 'steam', x: k.x, y: k.y, z: k.z }); }
  else { k.state = 'calm'; k.t = 5; }
}
// sprinkles: hidden all over, for the ones who go looking
function sprinkleStep(s, e) {
  if (e.got) return;
  for (const p of s.players) {
    if (!alive(p) || Math.abs(p.z + 0.5 - e.z) > 1.2 || len2(p.x - e.x, p.y - e.y) > 0.9) continue;
    e.got = true; s.sprinkles++;
    s.events.push({ type: 'pickup', who: p.id, x: e.x, y: e.y, z: e.z, n: s.sprinkles, of: s.sprinklesTotal });
    return;
  }
}
