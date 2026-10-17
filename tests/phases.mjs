// Scripted two-player routes through each chapter.
import { NO_INPUT } from '../src/sim.js';
import { walk, autorun, jumpToward, near, cx, feet } from './bots.mjs';
import { chapterById } from '../src/levels.js';

const I = NO_INPUT;
// the middle of the goal, read from the map
export function goalX(s) {
  const xs = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.grid[y][x] === '*') xs.push(x + 0.5);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
const toGoal = { name: 'goal', ctrl: (s) => [walk(s.players[0], goalX(s) - 0.3), walk(s.players[1], goalX(s) + 0.3)], done: (s) => s.complete };
const both = (s, f) => [f(s, s.players[0]), f(s, s.players[1])];

export function gardenPhases() {
  return [
    { name: 'to the door', ctrl: (s) => [autorun(s, s.players[0], 21.5), autorun(s, s.players[1], 20)],
      done: (s) => near(s.players[0], 21.5) && near(s.players[1], 20) },
    { name: 'Spice through on Sugar\'s plate', ctrl: (s) => [walk(s.players[0], 21.5), walk(s.players[1], 29.5)],
      done: (s) => near(s.players[1], 29.5) },
    { name: 'Sugar through on Spice\'s plate', ctrl: (s) => [walk(s.players[0], 31), walk(s.players[1], 29.5)],
      done: (s) => near(s.players[0], 31) },
    { name: 'Spice under the ledge', ctrl: (s) => [walk(s.players[0], 34), walk(s.players[1], 37.4)],
      done: (s) => near(s.players[1], 37.4) && near(s.players[0], 34) },
    { name: 'Sugar onto Spice\'s head', ctrl: (s) => [jumpToward(s.players[0], 37.4), walk(s.players[1], 37.4)],
      done: (s) => s.players[0].standOn === 1 && Math.abs(cx(s.players[0]) - 37.4) < 0.3 },
    { name: 'Sugar up the ledge', ctrl: (s) => [jumpToward(s.players[0], 41.5), I],
      done: (s) => near(s.players[0], 41.5) && feet(s.players[0]) < 9.1 },
    { name: 'Spice through door B', ctrl: (s) => [walk(s.players[0], 41.5), walk(s.players[1], 49)],
      done: (s) => near(s.players[1], 49) },
    { name: 'Sugar down', ctrl: (s) => [walk(s.players[0], 50), I], done: (s) => near(s.players[0], 50) },
    { name: 'the pillars', ctrl: (s) => both(s, (s, p) => autorun(s, p, p.id ? 75 : 75.5)),
      done: (s) => near(s.players[0], 75.5) && near(s.players[1], 75) },
    { name: 'Spice over Sugar\'s bridge', ctrl: (s) => [walk(s.players[0], 75.5), walk(s.players[1], 90.5)],
      done: (s) => near(s.players[1], 90.5) },
    { name: 'Sugar over Spice\'s bridge', ctrl: (s) => [walk(s.players[0], 92), walk(s.players[1], 90.5)],
      done: (s) => near(s.players[0], 92) },
    ...gardenMore(),
    toGoal,
  ];
}

function toolboxMore() {
  const T = chapterById('toolbox').offsets.lift;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  const onStep = (p) => feet(p) < 11.05 && cx(p) > T + 3.9 && cx(p) < T + 6.1;
  return [
    { name: 'lift: Sugar up the step', ctrl: (s) => [onStep(sg(s)) ? walk(sg(s), T + 5.2) : jumpToward(sg(s), T + 5.2), walk(sp(s), T + 2)],
      done: (s) => near(sg(s), T + 5.2) && onStep(sg(s)) },
    { name: 'lift: the low pin', ctrl: (s) => [{ ...I, right: sg(s).facing < 0, abilityPressed: sg(s).facing > 0 && !s.shots.length }, I], done: (s) => s.pins.some((q) => q.x === T + 9 && q.y > 10) && !s.shots.length },
    { name: 'lift: Sugar down, Spice up the step', ctrl: (s) => [walk(sg(s), T + 2), onStep(sp(s)) ? walk(sp(s), T + 4.6) : jumpToward(sp(s), T + 4.6)],
      done: (s) => near(sg(s), T + 2) && near(sp(s), T + 4.6) && onStep(sp(s)) },
    { name: 'lift: Sugar onto his shoulders', ctrl: (s) => [jumpToward(sg(s), T + 4.6), I], done: (s) => sg(s).standOn === 1 && Math.abs(cx(sg(s)) - (T + 4.6)) < 0.3 },
    { name: 'lift: the high pin', ctrl: (s) => [{ ...I, right: sg(s).facing < 0, abilityPressed: sg(s).facing > 0 && !s.shots.length }, I], done: (s) => s.pins.some((q) => q.x === T + 9 && q.y < 9.5) && !s.shots.length },
    { name: 'lift: Sugar steps clear', ctrl: (s) => [walk(sg(s), T + 2), I], done: (s) => near(sg(s), T + 2) },
    { name: 'lift: Spice up the pin ladder', ctrl: (s) => {
      const p = sp(s), f = feet(p);
      const tx = f < 7.1 ? T + 11.5 : f < 9.2 ? T + 10.6 : T + 9.4;   // pin A, pin B, then the ledge
      return [I, jumpToward(p, tx)];
    }, done: (s) => feet(sp(s)) < 7.1 && sp(s).onGround && cx(sp(s)) > T + 10.2, max: 1500 },
    { name: 'lift: Sugar onto the lift', ctrl: (s) => [autorun(s, sg(s), T + 9), walk(sp(s), T + 12)], done: (s) => near(sg(s), T + 9) },
    { name: 'lift: Spice on the switch', ctrl: (s) => [I, walk(sp(s), T + 13.5)], done: (s) => near(sp(s), T + 13.5) },
    { name: 'lift: Sugar rides up and steps off', ctrl: (s) => [s.ents.find((e) => e.g === 4).y < 7.2 ? walk(sg(s), T + 12) : I, I],
      done: (s) => near(sg(s), T + 12) && feet(sg(s)) < 7.1, max: 1200 },
    { name: 'lift: on to the end', ctrl: (s) => [autorun(s, sg(s), T + 19.5), autorun(s, sp(s), T + 20.5)], done: (s) => near(sg(s), T + 19.5) && near(sp(s), T + 20.5) },
  ];
}

// Leapfrog: two pins at a time, so the third goes in while he stands on the second.
function toolboxLeap() {
  const T = chapterById('toolbox').offsets.leap;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  const hop = (p, tx, top) => (feet(p) < top && p.onGround ? walk(p, tx) : jumpToward(p, tx));
  const shoot = (s) => ({ ...I, right: sg(s).facing < 0, abilityPressed: sg(s).facing > 0 && !s.shots.length });
  const pinAt = (s, y) => s.pins.some((q) => q.x === T + 15 && Math.abs(q.y - y) < 0.1);
  const up = (s, top) => { const p = sp(s); return p.onGround ? (feet(p) > top + 0.05 ? jumpToward(p, T + 15.5) : walk(p, T + 15.5)) : { ...walk(p, T + 15.5), jump: p.vy < 0 }; };
  return [
    { name: 'leap: Sugar onto the low step', ctrl: (s) => [autorun(s, sg(s), T + 6.5), autorun(s, sp(s), T + 12)], done: (s) => near(sg(s), T + 6.5) && feet(sg(s)) < 11.05 && near(sp(s), T + 12) },
    { name: 'leap: the low pin', ctrl: (s) => [shoot(s), I], done: (s) => pinAt(s, 10.31) && !s.shots.length },
    { name: 'leap: Sugar to the middle step', ctrl: (s) => [hop(sg(s), T + 5.5, 9.05), I], done: (s) => near(sg(s), T + 5.5) && feet(sg(s)) < 9.05 },
    { name: 'leap: the middle pin', ctrl: (s) => [shoot(s), I], done: (s) => pinAt(s, 8.31) && !s.shots.length },
    { name: 'leap: Spice up two pins', ctrl: (s) => [I, up(s, 8.31)], done: (s) => sp(s).onGround && Math.abs(feet(sp(s)) - 8.31) < 0.05 },
    { name: 'leap: Sugar to the top step', ctrl: (s) => [hop(sg(s), T + 4.5, 7.05), I], done: (s) => near(sg(s), T + 4.5) && feet(sg(s)) < 7.05 },
    { name: 'leap: the top pin pulls out the low one', ctrl: (s) => [shoot(s), I], done: (s) => pinAt(s, 6.31) && !pinAt(s, 10.31) && !s.shots.length },
    { name: 'leap: Spice to the top pin', ctrl: (s) => [I, up(s, 6.31)], done: (s) => sp(s).onGround && Math.abs(feet(sp(s)) - 6.31) < 0.05 },
    { name: 'leap: Spice onto the ledge', ctrl: (s) => { const p = sp(s); return [I, feet(p) < 4.05 && p.onGround ? walk(p, T + 18.5) : jumpToward(p, T + 17.5)]; }, done: (s) => near(sp(s), T + 18.5) && feet(sp(s)) < 4.05 },
    { name: 'leap: Sugar down and through B', ctrl: (s) => [autorun(s, sg(s), T + 22.5), walk(sp(s), T + 18.5)], done: (s) => near(sg(s), T + 22.5), max: 1500 },
    { name: 'leap: Spice down', ctrl: (s) => [walk(sg(s), T + 22.5), walk(sp(s), T + 24.5)], done: (s) => near(sp(s), T + 24.5) },
  ];
}

function nightTunnel() {
  const N = chapterById('night').offsets.tunnel;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  return [
    { name: 'tunnel: to the mouth', ctrl: (s) => [autorun(s, sg(s), N + 1.0), autorun(s, sp(s), N + 1.6)], done: (s) => near(sg(s), N + 1.0) && near(sp(s), N + 1.6) },
    { name: 'tunnel: Sugar onto the roof', ctrl: (s) => [feet(sg(s)) < 11.05 ? walk(sg(s), N + 2.6) : jumpToward(sg(s), N + 2.6), I], done: (s) => near(sg(s), N + 2.6) && feet(sg(s)) < 11.05 },
    { name: 'tunnel: crawl and light, step by step', ctrl: (s) => [walk(sg(s), Math.min(N + 17.3, cx(sp(s)) + 0.6)), walk(sp(s), cx(sp(s)) > N + 17.6 ? N + 20.5 : Math.min(N + 20.5, cx(sg(s)) + 1.1))],
      done: (s) => near(sp(s), N + 20.5) && near(sg(s), N + 17.3), max: 3000 },
    { name: 'tunnel: Sugar through C', ctrl: (s) => [walk(sg(s), N + 21.3), walk(sp(s), N + 20.5)], done: (s) => near(sg(s), N + 21.3) },
  ];
}

// Hang back: close enough to light his floor, far enough to leave the wall dark.
function nightWall() {
  const W = chapterById('night').offsets.wall;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  return [
    { name: 'wall: to the hole', ctrl: (s) => [autorun(s, sg(s), W + 1.5), autorun(s, sp(s), W + 2.4)], done: (s) => near(sg(s), W + 1.5) && near(sp(s), W + 2.4) },
    { name: 'wall: Sugar down into her tunnel', ctrl: (s) => [walk(sg(s), W + 4.5), I], done: (s) => near(sg(s), W + 4.5) && feet(sg(s)) > 15.9 },
    { name: 'wall: along together, Sugar a step behind', ctrl: (s) => [walk(sg(s), Math.min(W + 13.5, cx(sp(s)) - 0.4)), autorun(s, sp(s), Math.min(W + 15.5, cx(sg(s)) + 1.2))],
      done: (s) => near(sg(s), W + 13.5) && near(sp(s), W + 14.7) && feet(sp(s)) < 13.1, max: 1500 },
    { name: 'wall: Sugar hangs back, Spice through the dark wall', ctrl: (s) => [walk(sg(s), W + 13.5), walk(sp(s), W + 19.5)], done: (s) => near(sp(s), W + 19.5) && s.pressed[4] },
    { name: 'wall: Sugar out through D', ctrl: (s) => [autorun(s, sg(s), W + 24.5), walk(sp(s), W + 19.5)], done: (s) => near(sg(s), W + 24.5) },
    { name: 'wall: Spice on', ctrl: (s) => [I, autorun(s, sp(s), W + 25.4)], done: (s) => near(sp(s), W + 25.4) },
  ];
}

function nightClimb() {
  const C = chapterById('night').offsets.climb;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  const hop = (p, tx, top) => (feet(p) < top && p.onGround ? walk(p, tx) : jumpToward(p, tx));
  return [
    { name: 'to the stones', ctrl: (s) => [walk(sg(s), C + 2), walk(sp(s), C + 1)], done: (s) => near(sg(s), C + 2) && near(sp(s), C + 1) },
    { name: 'Sugar to stone 1', ctrl: (s) => [hop(sg(s), C + 3.9, 11.1), I], done: (s) => near(sg(s), C + 3.9) && feet(sg(s)) < 11.1 && Math.abs(sg(s).vx) < 0.5 },
    { name: 'Sugar to stone 2', ctrl: (s) => [hop(sg(s), C + 7, 9.1), I], done: (s) => near(sg(s), C + 7) && feet(sg(s)) < 9.1 },
    { name: 'Sugar shines, Spice to stone 1', ctrl: (s) => [{ ...I, ability: true }, hop(sp(s), C + 4.5, 11.1)], done: (s) => near(sp(s), C + 4.5) && feet(sp(s)) < 11.1 },
    { name: 'Spice to stone 2', ctrl: (s) => [{ ...I, ability: true }, hop(sp(s), C + 6.3, 9.1)], done: (s) => near(sp(s), C + 6.3) && feet(sp(s)) < 9.1 },
    { name: 'Spice to stone 3', ctrl: (s) => [I, hop(sp(s), C + 9.2, 7.1)], done: (s) => near(sp(s), C + 9.2) && feet(sp(s)) < 7.1 },
    { name: 'Spice to the ledge', ctrl: (s) => [I, hop(sp(s), C + 14.6, 5.1)], done: (s) => near(sp(s), C + 14.6) && feet(sp(s)) < 5.1 },
    { name: 'Sugar to stone 3', ctrl: (s) => [hop(sg(s), C + 10.2, 7.1), I], done: (s) => near(sg(s), C + 10.2) && feet(sg(s)) < 7.1 },
    { name: 'goal', ctrl: (s) => [hop(sg(s), C + 14.4, 5.1), walk(sp(s), C + 14.6)], done: (s) => s.complete },
  ];
}

function gardenMore() {
  const R = chapterById('garden').offsets.relay, L = chapterById('garden').offsets.ledge;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  return [
    { name: 'relay: line up', ctrl: (s) => [walk(sg(s), R + 2.5), walk(sp(s), R + 3.8)], done: (s) => near(sg(s), R + 2.5) && near(sp(s), R + 3.8) },
    { name: 'relay: Spice through D', ctrl: (s) => [walk(sg(s), R + 2.5), walk(sp(s), R + 7.5)], done: (s) => near(sp(s), R + 7.5) },
    { name: 'relay: Sugar to plate 2', ctrl: (s) => [walk(sg(s), R + 8.5), walk(sp(s), R + 7.5)], done: (s) => near(sg(s), R + 8.5) },
    { name: 'relay: Spice through B', ctrl: (s) => [walk(sg(s), R + 8.5), walk(sp(s), R + 13.5)], done: (s) => near(sp(s), R + 13.5) },
    { name: 'relay: Sugar through', ctrl: (s) => [walk(sg(s), R + 15), walk(sp(s), R + 13.5)], done: (s) => near(sg(s), R + 15) },
    { name: 'ledge: Spice at the foot', ctrl: (s) => [walk(sg(s), L - 0.5), walk(sp(s), L + 1.4)], done: (s) => near(sg(s), L - 0.5) && near(sp(s), L + 1.4) },
    { name: 'ledge: Sugar onto Spice', ctrl: (s) => [jumpToward(sg(s), L + 1.4), walk(sp(s), L + 1.4)], done: (s) => sg(s).standOn === 1 && Math.abs(cx(sg(s)) - (L + 1.4)) < 0.3 },
    { name: 'ledge: Sugar up', ctrl: (s) => [feet(sg(s)) < 9.1 ? walk(sg(s), L + 5.5) : jumpToward(sg(s), L + 5.5), I], done: (s) => near(sg(s), L + 5.5) && feet(sg(s)) < 9.1 },
    { name: 'ledge: Spice over the bridge', ctrl: (s) => [walk(sg(s), L + 5.5), walk(sp(s), L + 20.5)], done: (s) => near(sp(s), L + 20.5) },
    { name: 'ledge: Sugar over', ctrl: (s) => [walk(sg(s), L + 21.5), walk(sp(s), L + 20.5)], done: (s) => near(sg(s), L + 21.5) },
    ...gardenLetGo(),
  ];
}

// Let go: the plate makes the floor, so the holder steps off to drop the other through it.
function gardenLetGo() {
  const G = chapterById('garden').offsets.letgo;
  const sg = (s) => s.players[0], sp = (s) => s.players[1];
  const low = (p) => feet(p) > 16.9 && p.onGround;
  return [
    { name: 'letgo: line up', ctrl: (s) => [autorun(s, sg(s), G + 3.5), autorun(s, sp(s), G + 8.5)], done: (s) => near(sg(s), G + 3.5) && near(sp(s), G + 8.5) },
    { name: 'letgo: Spice onto the bridge', ctrl: (s) => [walk(sg(s), G + 3.5), walk(sp(s), G + 14)], done: (s) => near(sp(s), G + 14) },
    { name: 'letgo: Sugar lets go', ctrl: (s) => [walk(sg(s), G + 1.5), I], done: (s) => low(sp(s)) },
    { name: 'letgo: Spice on the low plate', ctrl: (s) => [I, walk(sp(s), G + 13.5)], done: (s) => near(sp(s), G + 13.5) && s.pressed[1] },
    { name: 'letgo: Sugar through onto the bridge', ctrl: (s) => [walk(sg(s), G + 15.6), walk(sp(s), G + 13.5)], done: (s) => near(sg(s), G + 15.6) && feet(sg(s)) < 13.1 },
    { name: 'letgo: Spice lets go', ctrl: (s) => [I, walk(sp(s), G + 11.6)], done: (s) => low(sg(s)) },
    { name: 'letgo: up and out', ctrl: (s) => [autorun(s, sg(s), G + 23.4), autorun(s, sp(s), G + 24.4)], done: (s) => near(sg(s), G + 23.4) && near(sp(s), G + 24.4) },
  ];
}

export function toolboxPhases() {
  return [
    { name: 'onto the crates', ctrl: (s) => [walk(s.players[0], 11), walk(s.players[1], 13.5)],
      done: (s) => near(s.players[1], 13.5) && near(s.players[0], 11) },
    { name: 'Spice slams', ctrl: (s) => { const p = s.players[1]; return [I, { ...I, jump: true, jumpPressed: p.onGround, abilityPressed: p.vy > -4 && !p.onGround }]; },
      done: (s) => s.grid[13][13] === '.' },
    { name: 'both drop into the hole', ctrl: (s) => both(s, (s, p) => walk(p, p.id ? 14 : 13)),
      done: (s) => s.players.every((p) => feet(p) > 15.5 && p.onGround) },
    { name: 'through the tunnel', ctrl: (s) => both(s, (s, p) => autorun(s, p, p.id ? 33 : 34)),
      done: (s) => near(s.players[0], 34) && near(s.players[1], 33), max: 1500 },
    { name: 'Sugar up the step', ctrl: (s) => { const p = s.players[0]; return [feet(p) < 11.05 ? walk(p, 34.2) : jumpToward(p, 34.2), I]; },
      done: (s) => near(s.players[0], 34.2) && feet(s.players[0]) < 11.05 },
    { name: 'Sugar faces the wall and pins it', ctrl: (s) => { const p = s.players[0]; return [{ ...I, right: p.facing < 0, abilityPressed: p.facing > 0 && !s.shots.length }, I]; },
      done: (s) => s.pins.length === 1 },
    { name: 'Sugar steps down', ctrl: (s) => [walk(s.players[0], 31.5), I], done: (s) => near(s.players[0], 31.5) },
    { name: 'Spice onto the pin', ctrl: (s) => [walk(s.players[0], 31.5), jumpToward(s.players[1], 37.5)],
      done: (s) => s.players[1].onGround && feet(s.players[1]) < 11 },
    { name: 'Spice to the top', ctrl: (s) => [I, jumpToward(s.players[1], 42.5)],
      done: (s) => near(s.players[1], 42.5) && feet(s.players[1]) < 8.1 },
    { name: 'Sugar through door A', ctrl: (s) => [autorun(s, s.players[0], 48.5), walk(s.players[1], 42.5)],
      done: (s) => near(s.players[0], 48.5) },
    { name: 'Spice down', ctrl: (s) => [I, walk(s.players[1], 50)], done: (s) => near(s.players[1], 50) },
    { name: 'onto the pads', ctrl: (s) => [walk(s.players[0], 62), walk(s.players[1], 57)],
      done: (s) => near(s.players[0], 62) && near(s.players[1], 57) },
    { name: 'Spice slams Sugar up', ctrl: (s) => { const p = s.players[1]; return [{ ...I, right: s.players[0].vy < 0 || !s.players[0].onGround }, { ...I, jump: true, jumpPressed: p.onGround, abilityPressed: p.vy > -4 && !p.onGround }]; },
      done: (s) => s.players[0].onGround && feet(s.players[0]) < 7.1 },
    { name: 'Sugar on plate 2', ctrl: (s) => [walk(s.players[0], 67.5), I], done: (s) => near(s.players[0], 67.5) },
    { name: 'Spice through door B', ctrl: (s) => [walk(s.players[0], 67.5), walk(s.players[1], 73)],
      done: (s) => near(s.players[1], 73) },
    ...toolboxMore(),
    ...toolboxLeap(),
    toGoal,
  ];
}

export function nightPhases() {
  return [
    { name: 'across the dark pit together', ctrl: (s) => [walk(s.players[0], Math.min(29, cx(s.players[1]) + 1.5)), walk(s.players[1], Math.min(28.4, cx(s.players[0]) + 0.5))],
      done: (s) => near(s.players[0], 29) && near(s.players[1], 28.4), max: 1500 },
    { name: 'small Spice through the hole', ctrl: (s) => [walk(s.players[0], 38), walk(s.players[1], 45.5)],
      done: (s) => near(s.players[1], 45.5) },
    { name: 'Sugar through door A', ctrl: (s) => [walk(s.players[0], 47.5), walk(s.players[1], 45.5)],
      done: (s) => near(s.players[0], 47.5) },
    { name: 'to the heavy plate', ctrl: (s) => [walk(s.players[0], 60), walk(s.players[1], 58)],
      done: (s) => near(s.players[0], 60) && near(s.players[1], 58) },
    { name: 'Spice grows', ctrl: (s) => [I, { ...I, abilityPressed: true }], done: (s) => s.players[1].size === 'big' },
    { name: 'big Spice on the plate', ctrl: (s) => [I, walk(s.players[1], 62.5)], done: (s) => near(s.players[1], 62.5) },
    { name: 'Sugar through door B', ctrl: (s) => [walk(s.players[0], 70), walk(s.players[1], 62.5)],
      done: (s) => near(s.players[0], 70) },
    { name: 'Spice shrinks', ctrl: (s) => [I, { ...I, abilityPressed: true }], done: (s) => s.players[1].size === 'small' },
    { name: 'Spice to the wall', ctrl: (s) => [I, walk(s.players[1], 64.6)], done: (s) => near(s.players[1], 64.6, 0.15) },
    { name: 'Spice into the crawl hole', ctrl: (s) => [I, jumpToward(s.players[1], 67)],
      done: (s) => cx(s.players[1]) > 66 && s.players[1].onGround },
    ...nightTunnel(),
    ...nightWall(),
    ...nightClimb(),
  ];
}


// ---------------------------------------------------------------- chapter 4-7 routes
const A = (o) => ({ ...I, abilityPressed: true, ...o });
const held = (o) => ({ ...I, ability: true, ...o });
const sp = (s) => s.players[1], sg = (s) => s.players[0];
const onCeil = (p) => p.grav < 0 && p.onGround;

// Spice: flip once (when on ground and upright/flipped as wanted), then walk.
function flipTo(p, wantGrav, tx) {
  if (p.grav !== wantGrav && p.onGround) return { ...walk(p, tx), abilityPressed: true };
  return walk(p, tx);
}

export function atticPhases() {
  return [
    { name: 'Spice up to the ceiling', ctrl: (s) => [I, flipTo(sp(s), -1, 3)], done: (s) => onCeil(sp(s)) },
    { name: 'Spice across on the ceiling', ctrl: (s) => [I, walk(sp(s), 21.5)], done: (s) => near(sp(s), 21.5) },
    { name: 'Sugar swaps over', ctrl: (s) => [A(), I], done: (s) => cx(sg(s)) > 20 },
    { name: 'Sugar lands, Spice back up', ctrl: (s) => [I, I], done: (s) => sg(s).onGround && onCeil(sp(s)) },
    { name: 'Spice across again', ctrl: (s) => [I, walk(sp(s), 21.5)], done: (s) => near(sp(s), 21.5) },
    { name: 'Spice down', ctrl: (s) => [I, flipTo(sp(s), 1, 21.5)], done: (s) => sp(s).grav > 0 && sp(s).onGround },
    { name: 'Sugar on plate 2, Spice up', ctrl: (s) => [walk(sg(s), 29.5), flipTo(sp(s), -1, 27)],
      done: (s) => near(sg(s), 29.5) && onCeil(sp(s)) },
    { name: 'Spice through B to the ceiling plate', ctrl: (s) => [walk(sg(s), 29.5), walk(sp(s), 37.5)], done: (s) => near(sp(s), 37.5) },
    { name: 'Sugar through A', ctrl: (s) => [walk(sg(s), 40.5), walk(sp(s), 37.5)], done: (s) => near(sg(s), 40.5) },
    { name: 'Spice on to the checkpoint and down', ctrl: (s) => [walk(sg(s), 50), flipTo(sp(s), 1, 47.5)],
      done: (s) => near(sg(s), 50) && sp(s).grav > 0 && near(sp(s), 47.5) },
    ...zigzag(),
    { name: 'Sugar swaps to the far side', ctrl: (s) => [A(), I], done: (s) => cx(sg(s)) > 68 },
    { name: 'settle', ctrl: (s) => [I, I], done: (s) => sg(s).onGround && sp(s).onGround },
    ...zigzag(),
    ...atticMore(),
  ];
}
function atticMore() {
  const Wl = chapterById('attic').offsets.wall, S = chapterById('attic').offsets.shelf;
  return [
    { name: 'wall: line up', ctrl: (s) => [walk(sg(s), Wl + 1.5), walk(sp(s), Wl + 3)], done: (s) => near(sg(s), Wl + 1.5) && near(sp(s), Wl + 3) },
    { name: 'wall: Spice up', ctrl: (s) => [I, flipTo(sp(s), -1, Wl + 3)], done: (s) => onCeil(sp(s)) },
    { name: 'wall: Spice over the wall', ctrl: (s) => [I, walk(sp(s), Wl + 11)], done: (s) => near(sp(s), Wl + 11) },
    { name: 'wall: Sugar swaps over', ctrl: (s) => [A(), I], done: (s) => cx(sg(s)) > Wl + 9 },
    { name: 'wall: settle', ctrl: (s) => [I, I], done: (s) => sg(s).onGround && onCeil(sp(s)) },
    { name: 'wall: Spice to the ceiling switch', ctrl: (s) => [I, walk(sp(s), Wl + 14.5)], done: (s) => near(sp(s), Wl + 14.5) },
    { name: 'wall: Sugar over her bridge', ctrl: (s) => [walk(sg(s), Wl + 22.5), walk(sp(s), Wl + 14.5)], done: (s) => near(sg(s), Wl + 22.5) },
    { name: 'wall: Spice along and down', ctrl: (s) => [I, cx(sp(s)) > Wl + 21.5 ? flipTo(sp(s), 1, Wl + 22) : walk(sp(s), Wl + 22)], done: (s) => sp(s).grav > 0 && sp(s).onGround && cx(sp(s)) > Wl + 21 },
    ...atticWell(),
    { name: 'to the shelf', ctrl: (s) => [walk(sg(s), S + 4), walk(sp(s), S + 6.3)], done: (s) => near(sg(s), S + 4) && near(sp(s), S + 6.3) },
    { name: 'Sugar onto Spice', ctrl: (s) => [jumpToward(sg(s), S + 6.3), I], done: (s) => sg(s).standOn === 1 },
    { name: 'Sugar onto the shelf', ctrl: (s) => [jumpToward(sg(s), S + 10), I], done: (s) => near(sg(s), S + 10) && feet(sg(s)) < 9.1 },
    { name: 'Spice up', ctrl: (s) => [I, flipTo(sp(s), -1, S + 6.3)], done: (s) => onCeil(sp(s)) },
    { name: 'Spice over the shelf', ctrl: (s) => [I, walk(sp(s), S + 10.6)], done: (s) => near(sp(s), S + 10.6) },
    { name: 'Spice down into the goal', ctrl: (s) => [I, flipTo(sp(s), 1, S + 10.6)], done: (s) => s.complete },
  ];
}

// The well: Spice walks the ceiling over it, Sugar swaps into his place and drops in.
function atticWell() {
  const Wl = chapterById('attic').offsets.well;
  const inWell = (p) => p.onGround && p.grav > 0 && cx(p) > Wl + 7 && cx(p) < Wl + 11;
  return [
    { name: 'well: line up', ctrl: (s) => [walk(sg(s), Wl + 3), walk(sp(s), Wl + 4.5)], done: (s) => near(sg(s), Wl + 3) && near(sp(s), Wl + 4.5) },
    { name: 'well: Spice up', ctrl: (s) => [I, flipTo(sp(s), -1, Wl + 4.5)], done: (s) => onCeil(sp(s)) },
    { name: 'well: Spice over the well', ctrl: (s) => [I, walk(sp(s), Wl + 8.5)], done: (s) => near(sp(s), Wl + 8.5) && onCeil(sp(s)) },
    { name: 'well: Sugar swaps in', ctrl: (s) => [A(), I], done: (s) => inWell(sg(s)) && onCeil(sp(s)) },
    { name: 'well: her plate lets him through D to his', ctrl: (s) => [walk(sg(s), Wl + 9.5), walk(sp(s), Wl + 18.5)], done: (s) => near(sp(s), Wl + 18.5) && onCeil(sp(s)) && s.pressed[1] },
    { name: 'well: Sugar out through A', ctrl: (s) => [walk(sg(s), Wl + 12.5), walk(sp(s), Wl + 18.5)], done: (s) => near(sg(s), Wl + 12.5) },
    { name: 'well: Spice down onto the floor plate', ctrl: (s) => [walk(sg(s), Wl + 12.5), flipTo(sp(s), 1, Wl + 16.5)], done: (s) => near(sp(s), Wl + 16.5) && sp(s).grav > 0 && s.pressed[4] },
    { name: 'well: Sugar through D', ctrl: (s) => [walk(sg(s), Wl + 20.5), walk(sp(s), Wl + 16.5)], done: (s) => near(sg(s), Wl + 20.5) },
  ];
}

// Spice zigzags floor -> ceiling -> floor across the spikes, ending at x 70 upright.
function zigzag() {
  return [
    { name: 'zig: Spice to the edge', ctrl: (s) => [I, walk(sp(s), 55.6)], done: (s) => near(sp(s), 55.6) && sp(s).grav > 0 },
    { name: 'zig: flip up drifting right', ctrl: (s) => [I, sp(s).onGround && sp(s).grav > 0 ? A({ right: true }) : walk(sp(s), 60)],
      done: (s) => onCeil(sp(s)) && cx(sp(s)) > 57.3 },
    { name: 'zag: across the ceiling', ctrl: (s) => [I, walk(sp(s), 63.4)], done: (s) => near(sp(s), 63.4) },
    { name: 'zag: flip down, then drift right', ctrl: (s) => [I, onCeil(sp(s)) ? A() : feet(sp(s)) > 6 ? walk(sp(s), 66) : I],
      done: (s) => sp(s).grav > 0 && sp(s).onGround && cx(sp(s)) > 64.3 },
    { name: 'zig: to the far side', ctrl: (s) => [I, walk(sp(s), 70)], done: (s) => near(sp(s), 70) },
  ];
}

export function skyPhases() {
  const mem = {};   // bot memory lives here, never on the sim state
  return [
    { name: 'to the edge', ctrl: (s) => [walk(sg(s), 9), walk(sp(s), 10.4)], done: (s) => near(sg(s), 9) && near(sp(s), 10.4) },
    { name: 'Spice leaps, Sugar gusts, Spice glides', ctrl: (s) => {
      const p = sp(s);
      return [{ ...I, abilityPressed: !p.onGround && p.vy > -12 && !s.gusts.length && !p.pushT }, { ...I, right: true, jump: true, jumpPressed: p.onGround && cx(p) < 11 }];
    }, done: (s) => sp(s).onGround && cx(sp(s)) > 26, max: 600 },
    { name: 'Spice holds the cloud', ctrl: (s) => [walk(sg(s), 12.5), walk(sp(s), 29.5)], done: (s) => near(sp(s), 29.5) && sg(s).ride === 0 },
    { name: 'Sugar rides across', ctrl: (s) => [s.ents[0].x > 22.5 ? walk(sg(s), 31) : I, walk(sp(s), 29.5)], done: (s) => near(sg(s), 31) },
    { name: 'to the vent', ctrl: (s) => [walk(sg(s), 43), walk(sp(s), 45.5)], done: (s) => near(sg(s), 43) && near(sp(s), 45.5) },
    { name: 'Spice rides the vent up', ctrl: (s) => { const p = sp(s); if (p.y < 3) mem.high = true; return [I, { ...walk(p, mem.high ? 52.5 : 45.5), jump: true, jumpPressed: p.onGround && !mem.high }]; },
      done: (s) => near(sp(s), 52.5) && feet(sp(s)) < 6.1 },
    { name: 'Sugar under the ledge', ctrl: (s) => [walk(sg(s), 63), walk(sp(s), 52.5)], done: (s) => near(sg(s), 63) },
    { name: 'Spice down', ctrl: (s) => [I, walk(sp(s), 64)], done: (s) => near(sp(s), 64) },
    { name: 'line up at the pinwheel', ctrl: (s) => [walk(sg(s), 67.4), walk(sp(s), 72.5)], done: (s) => near(sg(s), 67.4, 0.2) && near(sp(s), 72.5) && sg(s).facing > 0 },
    { name: 'Sugar spins it, Spice through C', ctrl: (s) => [{ ...I, abilityPressed: !s.pressed[3] && sg(s).cool <= 0 }, walk(sp(s), 76.3)], done: (s) => near(sp(s), 76.3) },
    { name: 'Spice glides the pit', ctrl: (s) => { const p = sp(s); return [I, { ...I, right: cx(p) < 89.5, jump: true, jumpPressed: p.onGround && cx(p) < 77 }]; },
      done: (s) => sp(s).onGround && cx(sp(s)) > 88.6, max: 600 },
    { name: 'Spice on plate 4', ctrl: (s) => [I, walk(sp(s), 89.5)], done: (s) => near(sp(s), 89.5) },
    { name: 'Sugar spins it again and runs', ctrl: (s) => { const p = sg(s); if (cx(p) > 75) mem.past = true; return [{ ...walk(p, s.pressed[3] || mem.past ? 92 : 67.4), abilityPressed: !s.pressed[3] && cx(p) < 70 }, walk(sp(s), 89.5)]; },
      done: (s) => near(sg(s), 92) },
    ...skyMore(),
    ...skyDouble(),
    toGoal,
  ];
}

function skyMore() {
  const V = chapterById('sky').offsets.vents2;
  const mem = { stage: 0 };
  const cloud = (s) => s.ents.filter((e) => e.type === 'platform' && e.look === 'cloud').find((e) => e.path[0][0] === V + 3);
  return [
    { name: 'vents: line up', ctrl: (s) => [walk(sg(s), V + 1.4), walk(sp(s), V + 2.5)], done: (s) => near(sg(s), V + 1.4) && near(sp(s), V + 2.5) },
    { name: 'vents: Spice hops vent to vent', ctrl: (s) => {
      const p = sp(s);
      if (mem.stage === 0 && cx(p) > V + 7.5 && p.y < 3) mem.stage = 1;
      if (mem.stage === 1 && cx(p) > V + 15.5 && p.y < 3) mem.stage = 2;
      const tx = [V + 8.5, V + 16.5, V + 23.5][mem.stage];
      return [I, { ...walk(p, tx), jump: true, jumpPressed: p.onGround && cx(p) < V + 4 }];
    }, done: (s) => sp(s).onGround && cx(sp(s)) > V + 23, max: 1500 },
    { name: 'vents: Spice on the switch, Sugar on the cloud', ctrl: (s) => [cloud(s).x < V + 3.5 ? walk(sg(s), V + 4.5) : I, walk(sp(s), V + 23.5)],
      done: (s) => near(sp(s), V + 23.5) && sg(s).ride === cloud(s).i, max: 1500 },
    { name: 'vents: Sugar rides over', ctrl: (s) => [cloud(s).x > V + 19.5 ? walk(sg(s), V + 23.4) : I, walk(sp(s), V + 23.5)], done: (s) => near(sg(s), V + 23.4), max: 1500 },
  ];
}

// One gust, two jobs: it throws Spice and spins the pinwheel for the door he flies at.
function skyDouble() {
  const D = chapterById('sky').offsets.double;
  const cloud = (s) => s.ents.find((e) => e.type === 'platform' && e.path[0][0] === D + 5);
  return [
    { name: 'double: line up', ctrl: (s) => [near(sg(s), D + 1.5) ? { ...I, right: sg(s).facing < 0 } : walk(sg(s), D + 1.5), walk(sp(s), D + 3.6)], done: (s) => near(sg(s), D + 1.5) && near(sp(s), D + 3.6) && sg(s).facing > 0 },
    { name: 'double: one gust throws him and spins the wheel', ctrl: (s) => {
      const p = sp(s);
      return [{ ...I, abilityPressed: !p.onGround && p.vy > -12 && !s.gusts.length && p.pushT <= 0 }, { ...I, right: true, jump: true, jumpPressed: p.onGround && cx(p) < D + 4.5 }];
    }, done: (s) => sp(s).onGround && cx(sp(s)) > D + 19.6, max: 600 },
    { name: 'double: Spice runs her cloud', ctrl: (s) => [I, walk(sp(s), D + 24.5)], done: (s) => near(sp(s), D + 24.5) && s.pressed[2] },
    { name: 'double: Sugar boards', ctrl: (s) => [cloud(s).x < D + 5.5 ? walk(sg(s), D + 6.2) : walk(sg(s), D + 3.5), walk(sp(s), D + 24.5)], done: (s) => sg(s).ride === cloud(s).i, max: 1500 },
    { name: 'double: across, then Spice swaps to the door plate', ctrl: (s) => [I, cloud(s).x > D + 15.85 ? walk(sp(s), D + 22.5) : walk(sp(s), D + 24.5)], done: (s) => near(sp(s), D + 22.5) && s.pressed[3], max: 1500 },
    { name: 'double: Sugar through C', ctrl: (s) => [walk(sg(s), D + 20.5), walk(sp(s), D + 22.5)], done: (s) => near(sg(s), D + 20.5) },
  ];
}

function clockMore() {
  const S = chapterById('clock').offsets.stairs;
  const g1 = (s) => s.ents.find((e) => e.type === 'platform' && e.path[0][0] === S + 4);
  const hop = (p, tx, top) => (feet(p) < top && p.onGround ? walk(p, tx) : jumpToward(p, tx));
  const stage = [0, 0];
  const climb = (who) => (s) => {
    const p = s.players[who];
    const tops = s.ents.filter((e) => e.type === 'platform' && e.path[0][0] >= S + 4 && e.path[0][0] <= S + 11).map((e) => e.y);
    const steps = [[S + 5, tops[0]], [S + 8.5, tops[1]], [S + 12, tops[2]], [S + 16.5, 6]];
    const k = stage[who];
    if (p.onGround && Math.abs(feet(p) - steps[k][1]) < 0.06 && Math.abs(cx(p) - steps[k][0]) < 1.2 && k < steps.length - 1) stage[who]++;
    if (p.onGround && feet(p) > 12.9) stage[who] = 0;   // fell: start again
    const [tx, top] = steps[stage[who]];
    return hop(p, tx, top + 0.1);
  };
  return [
    { name: 'stairs: line up', ctrl: (s) => [walk(sg(s), S + 1.0), walk(sp(s), S + 2.4)], done: (s) => near(sg(s), S + 1.0) && near(sp(s), S + 2.4) },
    { name: 'stairs: Sugar stops the gears mid-swing, Spice climbs', ctrl: (s) => {
      const hold = s.frozen || (g1(s).y > 11.0 && g1(s).y < 11.5);
      return [{ ...I, ability: hold }, s.frozen ? climb(1)(s) : I];
    }, done: (s) => feet(sp(s)) < 6.1 && sp(s).onGround, max: 1500 },
    { name: 'stairs: Spice on the switch', ctrl: (s) => [{ ...I, ability: true }, walk(sp(s), S + 16.5)], done: (s) => near(sp(s), S + 16.5) && s.pressed[4] },
    { name: 'stairs: Sugar climbs the stopped gears', ctrl: (s) => [climb(0)(s), walk(sp(s), S + 16.5)], done: (s) => feet(sg(s)) < 6.1 && sg(s).onGround, max: 1500 },
    { name: 'stairs: on', ctrl: (s) => [walk(sg(s), S + 18), walk(sp(s), S + 18.8)], done: (s) => near(sg(s), S + 18) && near(sp(s), S + 18.8) },
  ];
}

// Take turns: she stops time for him to reach the plate, his plate stops the saws for
// her (she can't move while she holds time), then she stops time again for him.
function clockTurns() {
  const Tu = chapterById('clock').offsets.turns;
  const xs = [5.5, 7, 11.5, 13, 14.5, 16, 17.5, 19, 20.5].map((x) => Tu + x);
  return [
    { name: 'turns: line up', ctrl: (s) => [walk(sg(s), Tu + 1.5), walk(sp(s), Tu + 2.6)], done: (s) => near(sg(s), Tu + 1.5) && near(sp(s), Tu + 2.6) },
    { name: 'turns: Sugar stops time, Spice to the plate', ctrl: (s) => [{ ...I, ability: s.frozen || sawsUp(s, xs) }, s.frozen ? walk(sp(s), Tu + 9.5) : I],
      done: (s) => near(sp(s), Tu + 9.5) && s.frozen, max: 1200 },
    { name: 'turns: his plate holds the saws, she lets go', ctrl: (s) => [I, walk(sp(s), Tu + 9.5)], done: (s) => !s.frozen && s.pressed[2] },
    { name: 'turns: Sugar walks the stopped saws', ctrl: (s) => [walk(sg(s), Tu + 24), walk(sp(s), Tu + 9.5)], done: (s) => near(sg(s), Tu + 24) },
    { name: 'turns: she stops time, he walks out', ctrl: (s) => [{ ...I, ability: true }, s.frozen ? walk(sp(s), Tu + 25) : walk(sp(s), Tu + 9.5)], done: (s) => near(sp(s), Tu + 25) },
  ];
}

const sawsUp = (s, xs) => s.ents.filter((e) => e.type === 'saw' && xs.includes(Math.round(e.x * 2) / 2)).every((e) => e.y < 10.7);
export function clockPhases() {
  return [
    { name: 'to the corridor', ctrl: (s) => [walk(sg(s), 8.6), walk(sp(s), 10.4)], done: (s) => near(sg(s), 8.6) && near(sp(s), 10.4) },
    { name: 'Sugar freezes the saws up, Spice walks', ctrl: (s) => {
      const freeze = s.frozen || sawsUp(s, [14.5, 17.5, 20.5]);
      return [{ ...I, ability: freeze && cx(sp(s)) < 23 }, s.frozen ? walk(sp(s), 23.3) : I];
    }, done: (s) => near(sp(s), 23.3), max: 1200 },
    { name: 'Spice dashes the glass', ctrl: (s) => [I, A({ right: true })], done: (s) => s.grid[12][24] === '.' },
    { name: 'Spice on plate 1', ctrl: (s) => [I, walk(sp(s), 26.5)], done: (s) => near(sp(s), 26.5) },
    { name: 'Sugar down the hatch', ctrl: (s) => [walk(sg(s), 9.5), walk(sp(s), 26.5)], done: (s) => feet(sg(s)) > 15.5 && sg(s).onGround },
    { name: 'Sugar through the tunnel', ctrl: (s) => [autorun(s, sg(s), 33), walk(sp(s), 26.5)], done: (s) => near(sg(s), 33), max: 1200 },
    { name: 'to the gears', ctrl: (s) => [autorun(s, sg(s), 36.6), autorun(s, sp(s), 37.4)], done: (s) => near(sg(s), 36.6) && near(sp(s), 37.4) },
    ...[41.5, 47.5, 53.5].map((x) => ({
      name: `Spice hops to the gear at ${x}`,
      ctrl: (s) => {
        const level = s.ents.find((e) => e.type === 'platform').y;
        const hold = s.frozen || (level > 11.6 && level < 12.4);
        return [{ ...I, ability: hold }, s.frozen ? jumpToward(sp(s), x) : I];
      },
      done: (s) => sp(s).ride >= 0 && Math.abs(cx(sp(s)) - x) < 0.4 && sp(s).onGround,
      max: 1200,
    })),
    { name: 'Spice to plate 2', ctrl: (s) => [{ ...I, ability: true }, jumpToward(sp(s), 58.5)], done: (s) => near(sp(s), 58.5) },
    { name: 'Sugar over the bridge', ctrl: (s) => [walk(sg(s), 63), walk(sp(s), 58.5)], done: (s) => near(sg(s), 63) },
    { name: 'Spice on', ctrl: (s) => [I, walk(sp(s), 64)], done: (s) => near(sp(s), 64) },
    { name: 'to the ferry', ctrl: (s) => [jumpToward(sg(s), 69.5), walk(sp(s), 67.4)], done: (s) => near(sg(s), 69.5) && sg(s).ride >= 0 && near(sp(s), 67.4) },
    { name: 'Sugar freezes the saw up; Spice jumps and dashes to the pillar', ctrl: (s) => {
      const saw = s.ents.find((e) => e.type === 'saw' && e.g === 3);
      const p = sp(s);
      const go = s.frozen;
      return [{ ...I, ability: s.frozen ? !(p.onGround && cx(p) > 74) : saw.y < 7.4 }, go ? { ...walk(p, 75.9), jump: true, jumpPressed: p.onGround && cx(p) < 68, abilityPressed: !p.onGround && p.vy > -2 && cx(p) < 71 } : I];
    }, done: (s) => sp(s).onGround && cx(sp(s)) > 75 && cx(sp(s)) < 77, max: 1200 },
    { name: 'Spice jumps and dashes to the far side', ctrl: (s) => { const p = sp(s); return [I, { ...walk(p, 86), jump: true, jumpPressed: p.onGround && cx(p) < 77, abilityPressed: !p.onGround && p.vy > -2 && cx(p) < 81 }]; },
      done: (s) => sp(s).onGround && cx(sp(s)) > 84 },
    { name: 'Spice waits for the saw up, then the plate', ctrl: (s) => { const saw = s.ents.find((e) => e.type === 'saw' && e.g === 3); return [I, saw.y < 8 || s.pressed[3] ? walk(sp(s), 88.5) : walk(sp(s), 86)]; },
      done: (s) => near(sp(s), 88.5) && s.pressed[3], max: 1200 },
    { name: 'Sugar rides the ferry', ctrl: (s) => [s.ents.find((e) => e.type === 'platform' && e.g === 3).x > 80.5 ? walk(sg(s), 86) : I, walk(sp(s), 88.5)],
      done: (s) => near(sg(s), 86), max: 1500 },
    ...clockMore(),
    ...clockTurns(),
    toGoal,
  ];
}

// The finale strings the earlier sub-routes together at each section's offset.
export function homePhases(ch) {
  const z = ch.zones.map((q) => q.x);
  const [, L, D, AT, V, SW, CL] = z;
  const both = (s, a, b) => [walk(sg(s), a), walk(sp(s), b)];
  const mem = {};
  return [
    { name: 'home: to the door', ctrl: (s) => both(s, 11.5, 10), done: (s) => near(sg(s), 11.5) && near(sp(s), 10) },
    { name: 'home: Spice through', ctrl: (s) => both(s, 11.5, 19.5), done: (s) => near(sp(s), 19.5) },
    { name: 'home: Sugar through', ctrl: (s) => both(s, 21, 19.5), done: (s) => near(sg(s), 21) },
    { name: 'home: onto the pads', ctrl: (s) => both(s, L + 10, L + 5), done: (s) => near(sg(s), L + 10) && near(sp(s), L + 5) },
    { name: 'home: slam launches Sugar', ctrl: (s) => { const p = sp(s); return [{ ...I, right: !sg(s).onGround }, { ...I, jump: true, jumpPressed: p.onGround, abilityPressed: p.vy > -4 && !p.onGround }]; },
      done: (s) => sg(s).onGround && feet(sg(s)) < 7.1 },
    { name: 'home: Sugar on plate 2', ctrl: (s) => [walk(sg(s), L + 15.5), I], done: (s) => near(sg(s), L + 15.5) },
    { name: 'home: Spice through B', ctrl: (s) => both(s, L + 15.5, L + 22), done: (s) => near(sp(s), L + 22) },
    { name: 'home: Sugar down', ctrl: (s) => [walk(sg(s), L + 23), I], done: (s) => near(sg(s), L + 23) },
    { name: 'home: across the dark together', ctrl: (s) => [walk(sg(s), Math.min(D + 21, cx(sp(s)) + 1.5)), walk(sp(s), Math.min(D + 20.4, cx(sg(s)) + 0.5))],
      done: (s) => near(sg(s), D + 21) && near(sp(s), D + 20.4), max: 1500 },
    { name: 'home: into the attic', ctrl: (s) => both(s, AT + 1.5, AT + 2.5), done: (s) => near(sg(s), AT + 1.5) && near(sp(s), AT + 2.5) },
    { name: 'home: Spice up', ctrl: (s) => [I, flipTo(sp(s), -1, AT + 2.5)], done: (s) => onCeil(sp(s)) },
    { name: 'home: Spice across', ctrl: (s) => [I, walk(sp(s), AT + 13.5)], done: (s) => near(sp(s), AT + 13.5) },
    { name: 'home: Sugar swaps', ctrl: (s) => [A(), I], done: (s) => cx(sg(s)) > AT + 12 },
    { name: 'home: settle', ctrl: (s) => [I, I], done: (s) => sg(s).onGround && onCeil(sp(s)) },
    { name: 'home: Spice across again', ctrl: (s) => [I, walk(sp(s), AT + 13.5)], done: (s) => near(sp(s), AT + 13.5) },
    { name: 'home: Spice down', ctrl: (s) => [I, flipTo(sp(s), 1, AT + 13.5)], done: (s) => sp(s).grav > 0 && sp(s).onGround },
    { name: 'home: to the vent', ctrl: (s) => both(s, V + 5, V + 7.5), done: (s) => near(sg(s), V + 5) && near(sp(s), V + 7.5) },
    { name: 'home: Spice rides the vent', ctrl: (s) => { const p = sp(s); if (p.y < 3) mem.high = true; return [I, { ...walk(p, mem.high ? V + 14.5 : V + 7.5), jump: true, jumpPressed: p.onGround && !mem.high }]; },
      done: (s) => near(sp(s), V + 14.5) && feet(sp(s)) < 6.1 },
    { name: 'home: Sugar through C', ctrl: (s) => [walk(sg(s), V + 25), walk(sp(s), V + 14.5)], done: (s) => near(sg(s), V + 25) },
    { name: 'home: Spice down', ctrl: (s) => [I, walk(sp(s), V + 26)], done: (s) => near(sp(s), V + 26) },
    { name: 'home: to the saws', ctrl: (s) => both(s, SW + 0.6, SW + 2.4), done: (s) => near(sg(s), SW + 0.6) && near(sp(s), SW + 2.4) },
    { name: 'home: freeze, Spice walks', ctrl: (s) => {
      const up = s.ents.filter((e) => e.type === 'saw' && e.x > SW && e.x < SW + 16).every((e) => e.y < 10.7);
      return [{ ...I, ability: (s.frozen || up) && cx(sp(s)) < SW + 15 }, s.frozen ? walk(sp(s), SW + 15.3) : I];
    }, done: (s) => near(sp(s), SW + 15.3), max: 1200 },
    { name: 'home: dash the glass', ctrl: (s) => [I, A({ right: true })], done: (s) => s.grid[12][SW + 16] === '.' },
    { name: 'home: Spice on plate 4', ctrl: (s) => [I, walk(sp(s), SW + 18.5)], done: (s) => near(sp(s), SW + 18.5) },
    { name: 'home: Sugar down the hatch', ctrl: (s) => [walk(sg(s), SW + 1.5), walk(sp(s), SW + 18.5)], done: (s) => feet(sg(s)) > 15.5 && sg(s).onGround },
    { name: 'home: Sugar through the tunnel', ctrl: (s) => [autorun(s, sg(s), CL + 1), walk(sp(s), SW + 18.5)], done: (s) => near(sg(s), CL + 1), max: 1200 },
    { name: 'home: Spice to the climb', ctrl: (s) => [walk(sg(s), CL + 1), autorun(s, sp(s), CL + 1.8)], done: (s) => near(sp(s), CL + 1.8) },
    ...[[3, 11], [7, 9], [11, 7], [17.5, 6]].map(([x, y], i, arr) => ({
      name: `home: climb to ${y}`,
      ctrl: (s) => {
        const prev = i ? arr[i - 1] : [1.5, 13];
        const up = (p, tx) => (feet(p) < y + 0.1 ? walk(p, tx) : jumpToward(p, tx));
        return [up(sg(s), CL + x), feet(sg(s)) < y + 0.1 ? up(sp(s), CL + x + 0.9) : walk(sp(s), CL + prev[0] + 0.9)];
      },
      done: (s) => sg(s).onGround && sp(s).onGround && feet(sg(s)) < y + 0.1 && feet(sp(s)) < y + 0.1,
    })),
    { name: 'home: into the box', ctrl: (s) => both(s, CL + 17, CL + 18.5), done: (s) => s.complete },
  ];
}
