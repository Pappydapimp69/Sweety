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

// hold the power facing a way (her vine is held)
const hold = (p, dx, dy) => face(p, dx, dy) || { ...I, ability: true, abilityPressed: faces(p, dx, dy) && !p.casting };
// walk toward a point, hopping once you pass a line on the way (dir: which way you're going)
const hopTo = (s, p, tx, ty, test, extra = {}) => ({ ...go(s, p, tx, ty), ...extra, jumpPressed: !p.hop && test(p) });
const tied = (s) => !!s.vine && s.vine.tied >= 0;
const floating = (s, x0) => s.ents.some((e) => e.type === 'crate' && !e.gone && e.float && (x0 === undefined || e.hx === x0));

export function meadowPhases() {
  const [X, Y] = O('meadow');
  const C = 16;   // the crossing
  const sugarHolds = (s) => (at(sg(s), X + C + 0.5, Y + 7.5) ? hold(sg(s), 0, 1) : go(s, sg(s), X + C + 0.5, Y + 7.5));
  return [
    { name: 'meadow: to the power stone', ctrl: both((s) => go(s, sg(s), X + 15.5, Y + 3.5), (s) => go(s, sp(s), X + 16.5, Y + 4.5)), done: (s) => s.unlocked.includes(0), max: 2400 },
    { name: 'meadow: Sugar to the crossing, Spice behind a dock crate', ctrl: both((s) => go(s, sg(s), X + C + 0.5, Y + 7.5), (s) => go(s, sp(s), X + 6.5, Y + 7.5)),
      done: (s) => at(sg(s), X + C + 0.5, Y + 7.5) && at(sp(s), X + 6.5, Y + 7.5) },
    { name: 'meadow: she holds her vine; he shoves the crate into the current', ctrl: both(sugarHolds, (s) => (floating(s, X + 6) ? I : use(sp(s), 0, 1))), done: (s) => floating(s, X + 6) && !!sg(s).casting },
    { name: 'meadow: Spice onto her vine', ctrl: both(sugarHolds, (s) => go(s, sp(s), X + C + 0.5, Y + 8.5)), done: (s) => at(sp(s), X + C + 0.5, Y + 8.5) },
    { name: 'meadow: the vine ties it; he shoves it into the berth', ctrl: both(sugarHolds, (s) => (tied(s) ? use(sp(s), 0, 1) : face(sp(s), 0, 1) || I)), done: (s) => s.grid[Y + 10][X + C] === 'u', max: 900 },
    { name: 'meadow: Spice back for a second crate', ctrl: both(sugarHolds, (s) => go(s, sp(s), X + 8.5, Y + 7.5)), done: (s) => at(sp(s), X + 8.5, Y + 7.5), max: 900 },
    { name: 'meadow: in it goes', ctrl: both(sugarHolds, (s) => (floating(s, X + 8) ? I : use(sp(s), 0, 1))), done: (s) => floating(s, X + 8) },
    { name: 'meadow: Spice races it to her vine', ctrl: both(sugarHolds, (s) => go(s, sp(s), X + C + 0.5, Y + 8.5)), done: (s) => at(sp(s), X + C + 0.5, Y + 8.5) },
    { name: 'meadow: and hops the current onto the stone', ctrl: both(sugarHolds, (s) => (sp(s).y > Y + 9.5 ? go(s, sp(s), X + C + 0.5, Y + 10.5) : hopTo(s, sp(s), X + C + 0.5, Y + 10.5, (p) => p.y > Y + 8.55, { down: true }))),
      done: (s) => at(sp(s), X + C + 0.5, Y + 10.5) && !sp(s).hop, max: 300 },
    { name: 'meadow: the vine ties it; he shoves it into the moat', ctrl: both(sugarHolds, (s) => (tied(s) ? use(sp(s), 0, -1) : face(sp(s), 0, -1) || I)), done: (s) => s.grid[Y + 8][X + C] === 'u', max: 900 },
    { name: 'meadow: Sugar lets go and hops across', ctrl: both((s) => (sg(s).y < Y + 8.3 ? go(s, sg(s), X + C + 0.5, Y + 8.5) : hopTo(s, sg(s), X + C + 0.5, Y + 11.5, (p) => p.y > Y + 8.55 && p.y < Y + 9, { down: true })), (s) => go(s, sp(s), X + C + 1.5, Y + 11.5)),
      done: (s) => sg(s).y > Y + 10.2 && !sg(s).hop && !sg(s).dead, max: 600 },
    { name: 'meadow: the heart', ctrl: both((s) => go(s, sg(s), X + 28.5, Y + 20.5), (s) => go(s, sp(s), X + 27.5, Y + 20.5)), done: (s) => s.hearts.includes(0), max: 1500 },
  ];
}

export function workshopPhases() {
  const [X, Y] = O('workshop');
  const R = 17;   // the rollers' row
  const plank = (s) => s.planks.find((k) => !k.tacked);
  // Sugar at the rollers' end, facing along them: fire as the plank rides over the mark
  const shoot = (mark) => (s) => {
    const p = sg(s);
    if (!at(p, X + 19.5, Y + R + 0.5)) return go(s, p, X + 19.5, Y + R + 0.5);
    const k = plank(s);
    return face(p, -1, 0) || { ...I, abilityPressed: !!k && k.px <= mark + 0.35 && k.px > mark - 0.3 && p.cool <= 0 };
  };
  const toPress = (s) => (at(sp(s), X + 21.5, Y + R + 0.5) ? use(sp(s), -1, 0) : go(s, sp(s), X + 21.5, Y + R + 0.5));
  const hopWest = (s, p, tx) => hopTo(s, p, tx, Y + R + 0.5, (q) => Math.floor(q.x) > Math.floor(tx) && q.x < Math.floor(q.x) + 0.45 && '%t'.includes(s.grid[Y + R][Math.floor(q.x) - 1]) && s.grid[Y + R][Math.floor(q.x)] !== '%', { left: true });
  const tackAndDrive = (cell) => [
    { name: `workshop: Spice hammers the press (plank for roller ${cell})`, ctrl: both(shoot(X + cell), (s) => (plank(s) || s.grid[Y + R][X + cell] !== '%' ? I : toPress(s))), done: (s) => !!plank(s) || s.grid[Y + R][X + cell] !== '%', max: 1500 },
    { name: `workshop: Sugar's nail tacks it over roller ${cell}`, ctrl: both(shoot(X + cell), (s) => go(s, sp(s), X + 19.5, Y + R - 1.5)), done: (s) => s.grid[Y + R][X + cell] !== '%', max: 600 },
    { name: `workshop: Spice hops on and hammers it home`, ctrl: both(idle, (s) => (Math.floor(sp(s).x) === X + cell && Math.floor(sp(s).y) === Y + R && !sp(s).hop ? { ...I, abilityPressed: true } : sp(s).x > X + 19 && sp(s).y < Y + R ? go(s, sp(s), X + 19.5, Y + R + 0.5) : hopWest(s, sp(s), X + cell + 0.5))),
      done: (s) => s.grid[Y + R][X + cell] === '=', max: 600 },
  ];
  const backEast = { name: 'workshop: Spice back over to the press', ctrl: both(idle, (s) => (sp(s).x > X + 18.9 ? go(s, sp(s), X + 21.5, Y + R + 0.5) : hopTo(s, sp(s), X + 19.5, Y + R + 0.5, (q) => q.x > X + 17.55 && q.x < X + 18, { right: true }))),
    done: (s) => at(sp(s), X + 21.5, Y + R + 0.5), max: 900 };
  return [
    { name: 'workshop: west through the open gate to the stone', ctrl: both((s) => go(s, sg(s), X + 26.5, Y + 15.5), (s) => go(s, sp(s), X + 27.5, Y + 16.5)), done: (s) => s.unlocked.includes(1) && at(sg(s), X + 26.5, Y + 15.5, 1.5) && at(sp(s), X + 27.5, Y + 16.5, 1.5), max: 3000 },
    ...tackAndDrive(17),
    backEast,
    ...tackAndDrive(15),
    { name: 'workshop: both over the planks', ctrl: both((s) => (sg(s).x > X + 13.9 ? hopWest(s, sg(s), X + 12.5) : go(s, sg(s), X + 12.5, Y + R + 0.5)), (s) => (sp(s).x > X + 13.9 ? hopWest(s, sp(s), X + 11.5) : go(s, sp(s), X + 11.5, Y + R + 0.5))),
      done: (s) => sg(s).x < X + 13.6 && sp(s).x < X + 13.6 && !sg(s).hop && !sp(s).hop && !sg(s).dead && !sp(s).dead, max: 900 },
    { name: 'workshop: the heart', ctrl: both((s) => go(s, sg(s), X + 5.5, Y + 12.5), (s) => go(s, sp(s), X + 6.5, Y + 12.5)), done: (s) => s.hearts.includes(1), max: 1500 },
  ];
}

export const mainPhases = () => [...meadowPhases(), ...workshopPhases()];
