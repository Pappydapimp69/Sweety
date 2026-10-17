// The twist rooms (one per chapter, each turns a rule the chapter taught on its head)
// really need both players, and the trick each one is built on really is the trick.
// Every "can't" here has a control beside it: break the gate and the same attempt gets through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { chapterById } from '../src/levels.js';
import { autorun, walk, cx, feet } from './bots.mjs';

const off = (ch, name) => chapterById(ch).offsets[name];
function put(p, x, ft) { p.x = x - p.w / 2; p.y = ft - p.h; p.vx = 0; p.vy = 0; p.prevY = p.y; p.onGround = false; }
// a run with both players dropped at a room's door, the partner idle
function at(ch, name, lx = 1, ft = 13) {
  const s = createRun(ch);
  const o = off(ch, name);
  put(s.players[0], o + lx, ft); put(s.players[1], o + lx + 0.9, ft);
  for (let i = 0; i < 10; i++) step(s, [I, I]);
  return { s, o };
}
// how far right one player gets on their own, alive, under a policy
function solo(s, who, ticks, policy) {
  let best = -Infinity;
  for (let t = 0; t < ticks; t++) {
    const inp = [I, I];
    inp[who] = policy(s, s.players[who], t);
    step(s, inp);
    const p = s.players[who];
    if (!p.dead) best = Math.max(best, cx(p));
  }
  return best;
}
const run = (tx) => (s, p) => autorun(s, p, tx);
const runAndPower = (tx) => (s, p, t) => ({ ...autorun(s, p, tx), abilityPressed: t % 23 === 0, ability: t % 90 < 30 });
const clear = (s, x, y0, y1) => { for (let y = y0; y <= y1; y++) s.grid[y][x] = '.'; };

// ---------------------------------------------------------------- Garden: Let go
test('garden "let go": neither of you gets past the door alone', () => {
  for (const who of [0, 1]) for (const pol of [run, runAndPower]) {
    const { s, o } = at('garden', 'letgo');
    assert.ok(solo(s, who, 1500, pol(o + 23)) < o + 10.2, `${who} alone`);
  }
  // holding the plate first, then running, doesn't help either: it shuts behind you
  const { s, o } = at('garden', 'letgo');
  const best = solo(s, 0, 1500, (s, p, t) => (t < 120 ? walk(p, o + 3.5) : autorun(s, p, o + 23)));
  assert.ok(best < o + 10.2);
});
test('garden "let go" control: without the door the same run gets through', () => {
  const { s, o } = at('garden', 'letgo');
  clear(s, o + 10, 10, 12);
  assert.ok(solo(s, 0, 1500, run(o + 23)) > o + 20);
});
test('garden "let go": while the plate is held the bridge holds you up (you have to let go)', () => {
  const { s, o } = at('garden', 'letgo');
  const [sg, sp] = s.players;
  put(sg, o + 3.5, 13);
  for (let t = 0; t < 200; t++) step(s, [I, walk(sp, o + 14)]);
  assert.ok(feet(sp) < 13.1, 'held: Spice stands on the bridge');
  for (let t = 0; t < 120; t++) step(s, [walk(sg, o + 1.5), I]);
  assert.ok(feet(sp) > 16.9, 'let go: Spice drops into the room below');
});

// ---------------------------------------------------------------- Toolbox: Leapfrog
test('toolbox "leapfrog": Sugar alone stops at the door, Spice alone never gets up', () => {
  for (const pol of [run, runAndPower]) {
    const { s, o } = at('toolbox', 'leap');
    assert.ok(solo(s, 0, 1500, pol(o + 25)) < o + 16.2, 'Sugar');
  }
  const { s, o } = at('toolbox', 'leap');
  let top = Infinity;
  solo(s, 1, 1500, (s, p, t) => { top = Math.min(top, p.dead ? Infinity : feet(p)); return { ...autorun(s, p, o + 15.5), jump: true, jumpPressed: p.onGround && t % 7 === 0 }; });
  assert.ok(top > 6.9, `Spice got to ${top}`);
});
test('toolbox "leapfrog" control: without the door Sugar walks through', () => {
  const { s, o } = at('toolbox', 'leap');
  clear(s, o + 16, 11, 12);
  assert.ok(solo(s, 0, 1500, run(o + 25)) > o + 22);
});
test('toolbox "leapfrog": two pins are not enough, the third (recycled) one is the way up', () => {
  // pins at the low and middle steps only: from the middle pin the ledge is out of reach
  const { s, o } = at('toolbox', 'leap');
  const sp = s.players[1];
  s.pins.push({ x: o + 15, y: 10.31 }, { x: o + 15, y: 8.31 });
  put(sp, o + 15.5, 8.31);
  let best = Infinity;
  for (let t = 0; t < 400; t++) {
    step(s, [I, { ...walk(sp, o + 17.5), jump: true, jumpPressed: sp.onGround }]);
    if (!sp.dead) best = Math.min(best, feet(sp));
  }
  assert.ok(best > 4.05, 'two pins never reach the ledge');
  // with the third pin standing in for the first, the same jumps do
  const r = at('toolbox', 'leap');
  const sp2 = r.s.players[1];
  r.s.pins.push({ x: o + 15, y: 8.31 }, { x: o + 15, y: 6.31 });
  put(sp2, o + 15.5, 8.31);
  let up = false;
  for (let t = 0; t < 400 && !up; t++) {
    const f = feet(sp2);
    step(r.s, [I, sp2.onGround ? (f > 6.36 ? { ...walk(sp2, o + 15.5), jump: true, jumpPressed: true } : { ...walk(sp2, o + 17.5), jump: true, jumpPressed: true }) : { ...walk(sp2, f < 6.4 ? o + 17.5 : o + 15.5), jump: sp2.vy < 0 }]);
    up = sp2.onGround && feet(sp2) < 4.05;
  }
  assert.ok(up, 'three steps of pins reach the ledge');
});

// ---------------------------------------------------------------- Night: Hang back
test('night "hang back": Sugar alone walks her own lit stones but her light shuts the wall', () => {
  for (const pol of [run, runAndPower]) {
    const { s, o } = at('night', 'wall');
    assert.ok(solo(s, 0, 1500, pol(o + 23)) < o + 16.1, 'Sugar');
  }
});
test('night "hang back": Spice alone, with no light, falls into her tunnel and the door holds', () => {
  for (const pol of [run, runAndPower]) {
    const { s, o } = at('night', 'wall');
    assert.ok(solo(s, 1, 1500, pol(o + 23)) < o + 21.1, 'Spice');
  }
});
test('night "hang back" control: without the door Spice walks out', () => {
  const { s, o } = at('night', 'wall');
  clear(s, o + 21, 14, 15);
  assert.ok(solo(s, 1, 1500, run(o + 23)) > o + 22);
});
// the trick: right under him she lights the wall too; two steps back she doesn't
for (const [sugarX, through] of [[15.5, false], [14.9, false], [13.5, true], [12.8, true]]) {
  test(`night "hang back": Sugar at ${sugarX} -> Spice ${through ? 'gets' : 'does not get'} through the wall`, () => {
    const { s, o } = at('night', 'wall');
    const [sg, sp] = s.players;
    put(sg, o + sugarX, 16); put(sp, o + 14.6, 13);
    let past = false;
    for (let t = 0; t < 240; t++) { step(s, [walk(sg, o + sugarX), walk(sp, o + 19.5)]); past ||= cx(sp) > o + 17; }
    assert.equal(past, through);
  });
}

// ---------------------------------------------------------------- Attic: The well
test('attic "the well": Sugar alone cannot get into the well or past it', () => {
  for (const pol of [run, runAndPower]) {
    const { s, o } = at('attic', 'well');
    assert.ok(solo(s, 0, 1500, pol(o + 22)) < o + 6, 'Sugar');
  }
});
test('attic "the well": Spice alone can press her plate but never get through his door', () => {
  const { s, o } = at('attic', 'well');
  const sp = s.players[1];
  // into the well from the ceiling, onto the plate, then back up and run for it
  let stage = 0;
  const best = solo(s, 1, 2400, (s, p) => {
    const flip = (want) => p.grav !== want && p.onGround;
    if (stage === 0) { if (p.grav < 0 && p.onGround) stage = 1; return { ...walk(p, o + 4), abilityPressed: flip(-1) }; }
    if (stage === 1) { if (Math.abs(cx(p) - (o + 9.5)) < 0.3) stage = 2; return walk(p, o + 9.5); }
    if (stage === 2) { if (p.grav > 0 && p.onGround) stage = 3; return { ...I, abilityPressed: flip(1) }; }
    if (stage === 3) { if (s.pressed[4]) stage = 4; return walk(p, o + 9.5); }
    if (stage === 4) { if (p.grav < 0 && p.onGround) stage = 5; return { ...I, abilityPressed: flip(-1) }; }
    return walk(p, o + 22);
  });
  assert.ok(stage >= 4, `the attempt got as far as stage ${stage}`);
  assert.ok(best < o + 14.1, `Spice reached ${best}`);
  void sp;
});
test('attic "the well" control: without his door the ceiling walk goes straight through', () => {
  const { s, o } = at('attic', 'well');
  clear(s, o + 14, 4, 12);
  const best = solo(s, 1, 1500, (s, p) => ({ ...walk(p, o + 22), abilityPressed: p.grav > 0 && p.onGround }));
  assert.ok(best > o + 20);
});

// ---------------------------------------------------------------- Sky: One gust, two jobs
function throwSpice(spinWheel) {
  const { s, o } = at('sky', 'double');
  const [sg, sp] = s.players;
  put(sg, o + 1.5, 13); put(sp, o + 3.6, 13); sg.facing = 1;
  if (!spinWheel) s.ents = s.ents.filter((e) => e.type !== 'pinwheel');
  for (let i = 0; i < 5; i++) step(s, [I, I]);
  let gusted = false;
  for (let i = 0; i < 400; i++) {
    const press = !gusted && !sp.onGround && sp.vy > -12;
    gusted ||= press;
    step(s, [{ ...I, abilityPressed: press }, { ...I, right: true, jump: true, jumpPressed: i === 0 }]);
    if (sp.onGround && cx(sp) > o + 19.3) return true;
    if (sp.dead) return false;
  }
  return false;
}
test('sky "one gust": gust plus glide carries him through the door the same gust opened', () => {
  assert.equal(throwSpice(true), true);
});
test('sky "one gust": the same throw with nothing spinning the pinwheel hits a shut door', () => {
  assert.equal(throwSpice(false), false);
});
test('sky "one gust": gliding alone, Spice falls short', () => {
  const { s, o } = at('sky', 'double');
  const sp = s.players[1];
  put(sp, o + 3.6, 13);
  for (let i = 0; i < 5; i++) step(s, [I, I]);
  let landed = false;
  for (let i = 0; i < 400 && !sp.dead; i++) { step(s, [I, { ...I, right: true, jump: true, jumpPressed: i === 0 }]); landed ||= sp.onGround && cx(sp) > o + 19; }
  assert.equal(landed, false);
});
test('sky "one gust": Sugar alone cannot cross (her cloud needs his plate)', () => {
  for (const pol of [run, runAndPower]) {
    const { s, o } = at('sky', 'double');
    assert.ok(solo(s, 0, 1500, pol(o + 24)) < o + 19);
  }
});

// ---------------------------------------------------------------- Clock: Take turns
const TU = [5.5, 7, 11.5, 13, 14.5, 16, 17.5, 19, 20.5];
test('clock "take turns": from the plate pocket, no start time gets either of you through the saws alone', () => {
  // every phase of the saw cycle: step off the plate and run (Spice dashes too) for the far side
  for (const who of [0, 1]) {
    let through = 0;
    for (let k = 0; k < 72; k += 3) {
      const { s, o } = at('clock', 'turns');
      const p = s.players[who];
      put(p, o + 9.5, 13);
      for (let t = 0; t < k; t++) step(s, [I, I]);
      // the saws stay put while anyone is on the plate, so step off first, then go
      let made = false;
      for (let t = 0; t < 240 && !p.dead && !made; t++) {
        const inp = [I, I];
        inp[who] = { ...walk(p, o + 24), abilityPressed: who === 1 && t === 1 };
        step(s, inp);
        made = cx(p) > o + 21.5;
      }
      if (made) through++;
    }
    assert.equal(through, 0, `${who ? 'Spice' : 'Sugar'} got through ${through} times`);
  }
});
test('clock "take turns" control: with the saws held up, the same walk gets through', () => {
  const { s, o } = at('clock', 'turns');
  const p = s.players[0];
  for (const e of s.ents) if (e.type === 'saw' && TU.includes(Math.round((e.x - o) * 2) / 2)) e.path = [[e.x, 10.55], [e.x, 10.56]];
  put(p, o + 9.5, 13);
  let made = false;
  for (let t = 0; t < 240 && !p.dead && !made; t++) { step(s, [walk(p, o + 24), I]); made = cx(p) > o + 21.5; }
  assert.ok(made);
});
test('clock "take turns": Sugar can\'t walk while she holds time (so she needs his plate)', () => {
  const { s, o } = at('clock', 'turns');
  const sg = s.players[0];
  const x0 = cx(sg);
  for (let t = 0; t < 120; t++) step(s, [{ ...walk(sg, o + 24), ability: true }, I]);
  assert.ok(s.frozen && Math.abs(cx(sg) - x0) < 0.05);
});

// ---------------------------------------------------------------- saw corridors have no pockets
// A lone player waiting between two saws and moving on whenever the next one is up got
// through the old corridors (saws 3 apart) in 20 of 24 starts. Saws 1.5 apart leave no
// gap a body fits in, so only Sugar holding time gets anyone through.
function pocketHop(ch, x0, x1, keep) {
  let ok = 0;
  for (const who of [0, 1]) for (let k = 0; k < 72; k += 6) {
    const s = createRun(ch);
    s.ents = s.ents.filter((e) => e.type !== 'saw' || e.x < x0 || e.x > x1 || keep(e.path[0][0] - x0));
    const p = s.players[who], o = s.players[1 - who];
    put(p, x0 - 2.5, 13); put(o, x0 - 5, 13);
    for (let t = 0; t < k; t++) step(s, [I, I]);
    const saws = s.ents.filter((e) => e.type === 'saw' && e.x > x0 - 0.1 && e.x < x1 + 0.1).sort((a, b) => a.x - b.x);
    const stops = [...saws.map((e) => e.x + 0.75 + p.w / 2 + 0.05), x1 + 1.2];
    let i = 0;
    for (let t = 0; t < 1500 && !p.dead && i < stops.length; t++) {
      const next = saws[i];
      const go = !next || next.y < 10.9 || cx(p) > next.x + 0.9;
      const inp = [I, I];
      inp[who] = go ? walk(p, stops[i]) : I;
      step(s, inp);
      if (Math.abs(cx(p) - stops[i]) < 0.15 && p.onGround) i++;
    }
    if (!p.dead && i === stops.length) ok++;
  }
  return ok;
}
for (const [ch, x0] of [['clock', 14.5], ['home', null]]) {
  test(`${ch}: nobody hops the saw corridor alone, saw by saw`, () => {
    const s = createRun(ch);
    const first = x0 ?? Math.min(...s.ents.filter((e) => e.type === 'saw').map((e) => e.x));
    assert.equal(pocketHop(ch, first, first + 6, () => true), 0);
  });
  test(`${ch} control: with the old spacing (3 apart) the same hopper gets through`, () => {
    const s = createRun(ch);
    const first = x0 ?? Math.min(...s.ents.filter((e) => e.type === 'saw').map((e) => e.x));
    assert.ok(pocketHop(ch, first, first + 6, (dx) => dx % 3 === 0) > 0);
  });
}
