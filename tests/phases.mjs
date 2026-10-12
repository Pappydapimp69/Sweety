// Scripted two-player routes through each chapter.
import { NO_INPUT } from '../src/sim.js';
import { walk, autorun, jumpToward, near, cx, feet } from './bots.mjs';

const I = NO_INPUT;
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
    { name: 'goal', ctrl: (s) => both(s, (s, p) => walk(p, p.id ? 97.6 : 97.4)), done: (s) => s.complete },
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
    { name: 'Sugar pins the wall', ctrl: (s) => { const p = s.players[0]; return [{ ...walk(p, 36), jump: true, jumpPressed: p.onGround, abilityPressed: p.vy < 0 && !s.shots.length && p.y + p.h * 0.45 < 10.6 }, I]; },
      done: (s) => s.pins.length === 1 },
    { name: 'Spice onto the pin', ctrl: (s) => [walk(s.players[0], 34), jumpToward(s.players[1], 37.5)],
      done: (s) => s.players[1].onGround && feet(s.players[1]) < 11 },
    { name: 'Spice to the top', ctrl: (s) => [I, jumpToward(s.players[1], 42.5)],
      done: (s) => near(s.players[1], 42.5) && feet(s.players[1]) < 8.1 },
    { name: 'Sugar through door A', ctrl: (s) => [walk(s.players[0], 48.5), walk(s.players[1], 42.5)],
      done: (s) => near(s.players[0], 48.5) },
    { name: 'Spice down', ctrl: (s) => [I, walk(s.players[1], 50)], done: (s) => near(s.players[1], 50) },
    { name: 'onto the pads', ctrl: (s) => [walk(s.players[0], 62), walk(s.players[1], 57)],
      done: (s) => near(s.players[0], 62) && near(s.players[1], 57) },
    { name: 'Spice slams Sugar up', ctrl: (s) => { const p = s.players[1]; return [{ ...I, right: s.players[0].vy < 0 || !s.players[0].onGround }, { ...I, jump: true, jumpPressed: p.onGround, abilityPressed: p.vy > -4 && !p.onGround }]; },
      done: (s) => s.players[0].onGround && feet(s.players[0]) < 7.1 },
    { name: 'Sugar on plate 2', ctrl: (s) => [walk(s.players[0], 67.5), I], done: (s) => near(s.players[0], 67.5) },
    { name: 'Spice through door B', ctrl: (s) => [walk(s.players[0], 67.5), walk(s.players[1], 73)],
      done: (s) => near(s.players[1], 73) },
    { name: 'goal', ctrl: (s) => both(s, (s, p) => walk(p, p.id ? 77.6 : 77.4)), done: (s) => s.complete },
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
    { name: 'to the stones', ctrl: (s) => [walk(s.players[0], 76), walk(s.players[1], 75)],
      done: (s) => near(s.players[0], 76) && near(s.players[1], 75) },
    { name: 'Sugar to stone 1', ctrl: (s) => [jumpToward(s.players[0], 77.9), I],
      done: (s) => near(s.players[0], 77.9) && feet(s.players[0]) < 11.1 },
    { name: 'Sugar to stone 2', ctrl: (s) => [jumpToward(s.players[0], 81), I],
      done: (s) => near(s.players[0], 81) && feet(s.players[0]) < 9.1 },
    { name: 'Sugar shines, Spice to stone 1', ctrl: (s) => [{ ...I, ability: true }, jumpToward(s.players[1], 78.5)],
      done: (s) => near(s.players[1], 78.5) && feet(s.players[1]) < 11.1 },
    { name: 'Spice to stone 2', ctrl: (s) => [{ ...I, ability: true }, jumpToward(s.players[1], 80.3)],
      done: (s) => near(s.players[1], 80.3) && feet(s.players[1]) < 9.1 },
    { name: 'Spice to stone 3', ctrl: (s) => [I, jumpToward(s.players[1], 84.2)],
      done: (s) => near(s.players[1], 84.2) && feet(s.players[1]) < 7.1 },
    { name: 'Spice to the ledge', ctrl: (s) => [I, jumpToward(s.players[1], 88.6)],
      done: (s) => near(s.players[1], 88.6) && feet(s.players[1]) < 5.1 },
    { name: 'Sugar to stone 3', ctrl: (s) => [jumpToward(s.players[0], 84), I],
      done: (s) => near(s.players[0], 84) && feet(s.players[0]) < 7.1 },
    { name: 'goal', ctrl: (s) => [jumpToward(s.players[0], 88.4), walk(s.players[1], 88.6)], done: (s) => s.complete },
  ];
}

