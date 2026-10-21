// Scripted two-player routes through the top-down world: the main path (stone, puzzles,
// heart) of each region, and every star. Positions come from the world's own layout.
import { go, at, face, faces, NO_INPUT as I } from './tdbots.mjs';
import { REGIONS, RW, RH } from '../src/td/world.js';

const O = (id) => { const r = REGIONS.find((q) => q.id === id); return [r.col * RW, r.row * RH]; };
const sg = (s) => s.players[0], sp = (s) => s.players[1];
const ent = (s, f) => s.ents.find(f);
const both = (a, b) => (s) => [a(s), b(s)];
const idle = () => I;
// press the power once you face the right way
const use = (p, dx, dy) => face(p, dx, dy) || { ...I, abilityPressed: faces(p, dx, dy) };

export function meadowPhases() {
  const [X, Y] = O('meadow');
  const crate = (s, x0) => ent(s, (e) => e.type === 'crate' && e.i !== undefined && !e.gone && (e.x0 ??= e.x) === x0);
  return [
    { name: 'meadow: to the power stone', ctrl: both((s) => go(s, sg(s), X + 15.5, Y + 3.5), (s) => go(s, sp(s), X + 16.5, Y + 4.5)), done: (s) => s.unlocked.includes(0), max: 2400 },
    { name: 'meadow: Sugar to the bank', ctrl: both((s) => go(s, sg(s), X + 10.5, Y + 7.5), (s) => go(s, sp(s), X + 11.5, Y + 7.5)), done: (s) => at(sg(s), X + 10.5, Y + 7.5) && at(sp(s), X + 11.5, Y + 7.5) },
    { name: 'meadow: Sugar grows a vine over the river', ctrl: both((s) => use(sg(s), 0, 1), idle), done: (s) => s.grid[Y + 9][X + 10] === 'v' },
    { name: 'meadow: Spice walks her vine', ctrl: both(idle, (s) => go(s, sp(s), X + 10.5, Y + 11.5)), done: (s) => at(sp(s), X + 10.5, Y + 11.5) },
    { name: 'meadow: Spice behind the crate', ctrl: both(idle, (s) => go(s, sp(s), X + 20.5, Y + 11.5)), done: (s) => at(sp(s), X + 20.5, Y + 11.5) },
    { name: 'meadow: shove it onto the plate', ctrl: both(idle, (s) => {
      const c = s.ents.find((e) => e.type === 'crate' && !e.gone && e.x === X + 20);
      if (c && c.y < Y + 14) return Math.abs(sp(s).y - (c.y - 0.5)) < 0.25 ? use(sp(s), 0, 1) : go(s, sp(s), X + 20.5, c.y - 0.5);
      return I;
    }), done: (s) => s.pressed[1] },
    { name: 'meadow: Sugar over her bridge', ctrl: both((s) => go(s, sg(s), X + 24.5, Y + 12.5), idle), done: (s) => at(sg(s), X + 24.5, Y + 12.5) },
    { name: 'meadow: Spice to the second crate', ctrl: both((s) => go(s, sg(s), X + 24.5, Y + 16.5), (s) => go(s, sp(s), X + 23.5, Y + 18.5)), done: (s) => at(sp(s), X + 23.5, Y + 18.5) },
    { name: 'meadow: shove it into the channel', ctrl: both(idle, (s) => {
      const c = s.ents.find((e) => e.type === 'crate' && !e.gone && e.y === Y + 18);
      if (!c) return I;
      return Math.abs(sp(s).x - (c.x - 0.5)) < 0.25 && Math.abs(sp(s).y - (Y + 18.5)) < 0.25 ? use(sp(s), 1, 0) : go(s, sp(s), c.x - 0.5, Y + 18.5);
    }), done: (s) => s.grid[Y + 18][X + 26] === 'u' },
    { name: 'meadow: both onto the sunk crate', ctrl: both((s) => go(s, sg(s), X + 25.5, Y + 18.5), (s) => go(s, sp(s), X + 26.5, Y + 18.5)), done: (s) => at(sg(s), X + 25.5, Y + 18.5) && at(sp(s), X + 26.5, Y + 18.5) },
    { name: 'meadow: hop the rest', ctrl: both((s) => ({ ...go(s, sg(s), X + 28.5, Y + 18.5), right: true, jumpPressed: sg(s).x > X + 26.3 && sg(s).x < X + 27 && !sg(s).hop }), (s) => ({ ...go(s, sp(s), X + 29.5, Y + 18.5), right: true, jumpPressed: sp(s).x > X + 26.6 && sp(s).x < X + 27 && !sp(s).hop })),
      done: (s) => sg(s).x > X + 28.2 && sp(s).x > X + 28.2 && !sg(s).hop && !sp(s).hop && !sg(s).dead && !sp(s).dead, max: 600 },
    { name: 'meadow: the heart', ctrl: both((s) => go(s, sg(s), X + 30.5, Y + 21.5), (s) => go(s, sp(s), X + 29.5, Y + 21.5)), done: (s) => s.hearts.includes(0) },
  ];
}

export function workshopPhases() {
  const [MX, MY] = O('meadow');
  const [X, Y] = O('workshop');
  return [
    { name: 'workshop: line up at the sunk crate', ctrl: both((s) => go(s, sg(s), MX + 28.5, MY + 18.5), (s) => go(s, sp(s), MX + 29.5, MY + 18.5)), done: (s) => at(sg(s), MX + 28.5, MY + 18.5) && at(sp(s), MX + 29.5, MY + 18.5) },
    { name: 'workshop: back over the channel', ctrl: both((s) => ({ ...go(s, sg(s), MX + 24.5, MY + 18.5), left: true, jumpPressed: sg(s).x < MX + 28.8 && sg(s).x > MX + 28 && !sg(s).hop }), (s) => ({ ...go(s, sp(s), MX + 25.5, MY + 18.5), left: true, jumpPressed: sp(s).x < MX + 28.8 && sp(s).x > MX + 28 && !sp(s).hop })),
      done: (s) => sg(s).x < MX + 26.8 && sp(s).x < MX + 26.8 && !sg(s).hop && !sp(s).hop && !sg(s).dead && !sp(s).dead, max: 900 },
    { name: 'workshop: west through the open gate to the stone', ctrl: both((s) => go(s, sg(s), X + 28.5, Y + 11.5), (s) => go(s, sp(s), X + 29.5, Y + 12.5)), done: (s) => s.unlocked.includes(1), max: 3000 },
    { name: 'workshop: Spice to the rocks', ctrl: both((s) => go(s, sg(s), X + 25.5, Y + 12.5), (s) => go(s, sp(s), X + 23.5, Y + 12.5)), done: (s) => at(sp(s), X + 23.5, Y + 12.5) },
    { name: 'workshop: hammer through', ctrl: both(idle, (s) => {
      if (s.grid[Y + 12][X + 22] === 'r') return use(sp(s), -1, 0);
      if (s.grid[Y + 12][X + 21] === 'r') return at(sp(s), X + 22.5, Y + 12.5) ? use(sp(s), -1, 0) : go(s, sp(s), X + 22.5, Y + 12.5);
      return I;
    }), done: (s) => s.grid[Y + 12][X + 21] === '.' && s.grid[Y + 12][X + 22] === '.' },
    { name: 'workshop: Sugar under the switch', ctrl: both((s) => go(s, sg(s), X + 18.5, Y + 8.5), (s) => go(s, sp(s), X + 17.5, Y + 12.5)), done: (s) => at(sg(s), X + 18.5, Y + 8.5) },
    { name: 'workshop: a nail flips it', ctrl: both((s) => use(sg(s), 0, -1), idle), done: (s) => s.pressed[3] && !s.nails.length },
    { name: 'workshop: through the door to the springboard', ctrl: both((s) => go(s, sg(s), X + 11.5, Y + 5.5), (s) => go(s, sp(s), X + 12.5, Y + 5.5)), done: (s) => at(sg(s), X + 11.5, Y + 5.5) && at(sp(s), X + 12.5, Y + 5.5), max: 1500 },
    { name: 'workshop: Spice hammers her spring', ctrl: both(idle, (s) => use(sp(s), -1, 0)), done: (s) => !!sg(s).fly },
    { name: 'workshop: she lands in the garden', ctrl: both(idle, idle), done: (s) => !sg(s).fly },
    { name: 'workshop: Sugar on the plate inside', ctrl: both((s) => go(s, sg(s), X + 4.5, Y + 6.5), (s) => go(s, sp(s), X + 5.5, Y + 10.5)), done: (s) => s.pressed[1] && at(sp(s), X + 5.5, Y + 10.5), max: 1500 },
    { name: 'workshop: Spice in to the heart', ctrl: both((s) => go(s, sg(s), X + 4.5, Y + 6.5), (s) => go(s, sp(s), X + 6.5, Y + 4.5)), done: (s) => s.hearts.includes(1), max: 1500 },
  ];
}

export const mainPhases = () => [...meadowPhases(), ...workshopPhases()];
