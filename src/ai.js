// An AI partner, for testing alone (it is not how the game is meant to be played).
// In a chapter it plays its half of the same solved routes the tests use, waiting for
// you to do yours; after a death or "Back to checkpoint" it rewinds to the last flag
// and fast-forwards through whatever is already true. In the Yard it follows you and
// helps; in the arcade games it plays simply. It only ever produces inputs, like a pad.
import { NO_INPUT as I } from './sim.js';
import { chapterById } from './levels.js';

let P = null, B = null, TP = null, TB = null;   // the routes and the bot helpers, loaded on demand
let loading = null;
export function preloadAI() {
  loading ??= Promise.all([import('../tests/phases.mjs'), import('../tests/bots.mjs'), import('../tests/tdphases.mjs'), import('../tests/tdbots.mjs')])
    .then(([p, b, tp, tb]) => { P = p; B = b; TP = tp; TB = tb; }).catch(() => { loading = null; });
  return loading;
}
export const aiReady = () => !!(P && B && TP && TB);

const ROUTES = {
  garden: () => P.gardenPhases(), toolbox: () => P.toolboxPhases(), night: () => P.nightPhases(),
  attic: () => P.atticPhases(), sky: () => P.skyPhases(), clock: () => P.clockPhases(),
  home: () => P.homePhases(chapterById('home')),
};
const cx = (p) => p.x + p.w / 2, feet = (p) => p.y + p.h;
const STUCK = 1200;   // ticks without a step of the plan getting done

export function makeAI(run) {
  if (run.td) {   // the island: each region's plan you haven't finished, then follow
    const route = TP ? [...(run.hearts.includes(0) ? [] : TP.meadowPhases()), ...(run.hearts.includes(1) ? [] : TP.workshopPhases())] : [];
    return { route: route.length ? route : null, i: 0, cpI: 0, wait: 0, still: 0, tries: {}, lost: false, ready: aiReady() };
  }
  const route = P && ROUTES[run.chapterId] ? ROUTES[run.chapterId]() : null;
  return { route, i: 0, cpI: 0, wait: 0, still: 0, tries: {}, lost: false, ready: aiReady() };
}

// Inputs for the given slots (one for a partner, both to watch).
export function aiInputs(ai, s, slots) {
  const out = [null, null];
  if (!aiReady() || s.complete) { for (const k of slots) out[k] = I; return out; }
  if (ai.route) {
    for (const e of s.events) {
      if (e.type === 'checkpoint') ai.cpI = ai.i;
      if (e.type === 'regroup') ai.i = ai.cpI;   // both back at the flag: replay from there; done steps skip themselves
    }
    let n = 0;
    const was = ai.i;
    while (ai.i < ai.route.length && ai.route[ai.i].done(s) && n++ < 50) ai.i++;
    if (s.td && ai.i >= ai.route.length) { ai.route = null; return aiInputs(ai, s, slots); }   // the plan's done: tag along
    ai.wait = ai.i === was ? ai.wait + 1 : 0;
    const ph = ai.route[Math.min(ai.i, ai.route.length - 1)];
    const both = ph.ctrl(s);
    for (const k of slots) out[k] = { ...I, ...both[k] };
    // no progress for ~20 s (someone fell mid-puzzle and the plan can't untangle it):
    // do what a person would, "Back to checkpoint" for both, and replay from the flag
    if (ai.wait > STUCK) {
      ai.tries[ai.i] = (ai.tries[ai.i] || 0) + 1;
      if (ai.tries[ai.i] > 2) { ai.route = null; ai.lost = true; return out; }   // the plan can't fit what happened: just help
      ai.wait = 0; ai.i = ai.cpI; out[slots[0]].regroup = true;
    }
    return out;
  }
  if (s.td) { for (const k of slots) out[k] = tdFollow(s, k); return out; }
  for (const k of slots) out[k] = s.mode === 'chapter' ? yardHelper(ai, s, k) : arcade(s, k);   // the Yard, or a chapter whose plan was dropped
  return out;
}

// ---------------------------------------------------------------- the island: stay near you
function tdFollow(s, k) {
  const me = s.players[k], you = s.players[1 - k];
  if (me.dead || you.dead || you.fly || you.hop) return I;
  if (Math.hypot(you.x - me.x, you.y - me.y) < 1.8) return I;
  return TB.go(s, me, you.x, you.y);
}

// ---------------------------------------------------------------- the Yard: follow and help
function follow(s, k) {
  const me = s.players[k], you = s.players[1 - k];
  if (me.dead || you.dead) return I;
  const gap = cx(you) - cx(me);
  if (you.standOn === me.id) return I;                          // you're on my head: hold still
  if (Math.abs(gap) < 1.6 && Math.abs(feet(you) - feet(me)) < 1) return I;
  const tx = cx(you) - Math.sign(gap || 1) * 1.1;
  const inp = B.autorun(s, me, tx);
  if (Math.abs(gap) > 10) inp.jump = inp.jump || me.vy < 0;     // falling behind: don't cut jumps short
  return inp;
}
function yardHelper(ai, s, k) {
  const me = s.players[k], you = s.players[1 - k];
  if (me.dead || you.dead) return I;
  // you've been standing still a while near an unpressed plate: go and stand on it
  ai.still = Math.abs(you.vx) < 0.2 && you.onGround ? ai.still + 1 : 0;
  if (ai.still > 45) {
    const plate = s.plates.filter((q) => !q.ceil && !(q.heavy && me.size !== 'big') && !s.pressed[q.g] && Math.abs(q.x + 0.5 - cx(you)) < 9)
      .sort((a, b) => Math.abs(a.x - cx(me)) - Math.abs(b.x - cx(me)))[0];
    if (plate) {
      const onIt = Math.abs(cx(me) - (plate.x + 0.5)) < 0.3 && Math.abs(feet(me) - (plate.y + 1)) < 0.1;
      if (!onIt) return B.autorun(s, me, plate.x + 0.5);
      return I;
    }
  }
  return follow(s, k);
}

// ---------------------------------------------------------------- arcade games: simple, fair-ish play
function arcade(s, k) {
  const me = s.players[k], you = s.players[1 - k];
  if (me.dead) return I;
  if (s.mode === 'bonk') {   // get above you, then drop on your head
    const inp = B.walk(me, cx(you));
    if (me.onGround && Math.abs(cx(you) - cx(me)) < 3) { inp.jump = true; inp.jumpPressed = true; }
    inp.jump = inp.jump || me.vy < 0;
    return inp;
  }
  if (s.mode === 'rain') {   // the nearest heart, never a rock
    const drops = s.drops.filter((d) => d.kind !== 'rock').sort((a, b) => Math.abs(a.x - cx(me)) - Math.abs(b.x - cx(me)));
    const rock = s.drops.find((d) => d.kind === 'rock' && Math.abs(d.x - cx(me)) < 1.2 && d.y < me.y && d.y > me.y - 6);
    if (rock) return B.walk(me, cx(me) + (rock.x < cx(me) ? 3 : -3));
    return drops[0] ? B.autorun(s, me, drops[0].x) : I;
  }
  if (s.mode === 'potato') {   // holding it: chase you; not: keep away
    const chase = s.holder === k;
    const tx = chase ? cx(you) : cx(me) + (cx(me) < cx(you) ? -6 : 6);
    const inp = B.autorun(s, me, Math.max(1.5, Math.min(s.w - 1.5, tx)));
    if (!chase && me.onGround && Math.abs(cx(you) - cx(me)) < 2.5) { inp.jump = true; inp.jumpPressed = true; }
    return inp;
  }
  return I;
}
