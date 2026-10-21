// The Yard: you can walk all of it, gates follow your progress, every star can be
// reached (by two of you), and every toy plays to a result without touching anything else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { YARD } from '../src/yard.js';
import { autorun, walk, jumpToward, play, cx, feet, near } from './bots.mjs';

function put(p, x, ft, grav = 1) { p.x = x - p.w / 2; p.y = ft - p.h; p.vx = 0; p.vy = 0; p.prevY = p.y; p.onGround = false; p.grav = grav; }
function yard(opts = {}) { return createRun('yard', { unlocked: 7, ...opts }); }
function at(x, ft = 24, x2 = x + 1, ft2 = ft) {
  const s = yard();
  put(s.players[0], x, ft); put(s.players[1], x2, ft2);
  for (let i = 0; i < 10; i++) step(s, [I, I]);
  return s;
}
const sg = (s) => s.players[0], sp = (s) => s.players[1];
const got = (s, n = 1) => s.starsGot >= n;
const events = [];
function run(s, ticks, ctrl) { const seen = []; for (let t = 0; t < ticks; t++) { step(s, ctrl(s, t)); seen.push(...s.events.map((e) => ({ ...e }))); } return seen; }
void events;

// ---------------------------------------------------------------- the world
test('yard lint: walls at both ends, one spawn each, every switch drives something', () => {
  const m = YARD.map;
  assert.equal(m.length, 30);
  assert.equal(new Set(m.map((r) => r.length)).size, 1);
  const all = m.join('');
  assert.equal(all.split('P').length - 1, 1); assert.equal(all.split('Q').length - 1, 1);
  for (const c of all) assert.ok('#.^vPQ*!h12345678ABCDabcdxL~%V$TK'.includes(c), `unknown tile ${c}`);
  for (let y = 0; y < m.length; y++) { assert.equal(m[y][0], '#'); assert.equal(m[y][m[0].length - 1], '#'); }
  assert.ok(!all.includes('*'), 'the Yard has no goal: it never ends');
  const plates = new Set([...all].filter((c) => c >= '1' && c <= '8').map((c) => ((c.charCodeAt(0) - 49) % 4) + 1));
  for (const e of YARD.ents) if (e.type === 'pinwheel') plates.add(e.g);
  const driven = new Set([...all].filter((c) => (c >= 'A' && c <= 'D') || (c >= 'a' && c <= 'd')).map((c) => c.toUpperCase().charCodeAt(0) - 64));
  for (const e of YARD.ents) if (e.g && e.type !== 'pinwheel') driven.add(e.g);
  assert.deepEqual([...plates].sort(), [...driven].sort());
});

test('with everything unlocked, the two of you can walk from the start to the far end', () => {
  const s = yard();
  const [a, b] = s.players;
  let ok = false;
  for (let t = 0; t < 20000 && !ok; t++) {
    step(s, [autorun(s, a, Math.min(297, cx(b) + 2)), autorun(s, b, Math.min(296, cx(a) + 0.4))]);
    ok = cx(a) > 295 && cx(b) > 294;
  }
  assert.ok(ok);
});

for (const [unlocked, stop] of [[1, 100], [2, 140], [4, 220], [5, 260]]) {
  test(`gates: with chapter ${unlocked} unlocked you get no further than x ${stop}`, () => {
    const s = yard({ unlocked });
    const [a, b] = s.players;
    let best = 0;
    for (let t = 0; t < 12000; t++) {
      step(s, [autorun(s, a, Math.min(297, cx(b) + 2)), autorun(s, b, Math.min(296, cx(a) + 0.4))]);
      best = Math.max(best, cx(a), cx(b));
    }
    assert.ok(best < stop && best > stop - 12, `reached ${best}`);
  });
}

test('doors: both of you in the doorway takes you in; a locked door just bumps', () => {
  const s = createRun('yard', { unlocked: 1 });
  const d = s.ents.find((e) => e.id === 'garden');
  put(sg(s), d.x + 0.6, 24); put(sp(s), d.x + 1.4, 24);
  const seen = run(s, 90, () => [I, I]);
  assert.deepEqual(seen.filter((e) => e.type === 'enter').map((e) => e.id), ['garden']);
  const h = s.ents.find((e) => e.id === 'home');
  put(sg(s), h.x + 0.6, 24); put(sp(s), h.x + 1.4, 24);
  const seen2 = run(s, 90, () => [I, I]);
  assert.deepEqual(seen2.filter((e) => e.type === 'locked' || e.type === 'enter').map((e) => e.type + ':' + e.id), ['locked:home']);
  // one of you alone in a doorway does nothing
  const s3 = createRun('yard', { unlocked: 1 });
  put(sg(s3), d.x + 0.6, 24); put(sp(s3), d.x + 6, 24);
  assert.equal(run(s3, 120, () => [I, I]).filter((e) => e.type === 'enter').length, 0);
});

test('stars you already found are not there again; the rest are', () => {
  const s = createRun('yard', { unlocked: 7, stars: ['55:11', '75:22'] });
  assert.equal(s.starsTotal, YARD.map.join('').split('$').length - 1 - 2);
});

// ---------------------------------------------------------------- every star
const STARS = {
  'plaza: a shoulder up to the pole': () => {
    const s = at(51, 16, 52.8, 16);
    play(s, [
      { name: 'onto his head', ctrl: (s) => [jumpToward(sg(s), 52.8), walk(sp(s), 52.8)], done: (s) => sg(s).standOn === 1 },
      { name: 'up to the star', ctrl: (s) => [{ ...jumpToward(sg(s), 55.5), jump: true }, I], done: got },
    ]);
    return s;
  },
  'garden: the closet (he holds the plate)': () => {
    const s = at(81, 24, 80.5);
    play(s, [
      { name: 'Spice on the plate, Sugar in', ctrl: (s) => [walk(sg(s), 75), walk(sp(s), 80.5)], done: got },
    ]);
    return s;
  },
  'garden: the shelf (a shoulder)': () => {
    const s = at(84, 24, 85.6);
    play(s, [
      { name: 'onto his head', ctrl: (s) => [jumpToward(sg(s), 85.6), walk(sp(s), 85.6)], done: (s) => sg(s).standOn === 1 },
      { name: 'up', ctrl: (s) => [{ ...I, jump: true, jumpPressed: sg(s).onGround, right: feet(sg(s)) < 20.4 }, I], done: got },
    ]);
    return s;
  },
  'workshop: Spice slams, Sugar launches to the shelf': () => {
    const s = at(112.5, 24, 109.5);
    play(s, [
      { name: 'slam', ctrl: (s) => { const p = sp(s); return [{ ...I, right: !sg(s).onGround && feet(sg(s)) < 17.9 }, { ...I, jump: true, jumpPressed: p.onGround, abilityPressed: p.vy > -4 && !p.onGround }]; }, done: got, max: 600 },
    ]);
    return s;
  },
  'workshop: pins from her steps, he climbs to the ledge': () => {
    const s = at(127.5, 22, 131);
    const shoot = (s) => ({ ...I, right: sg(s).facing < 0, abilityPressed: sg(s).facing > 0 && !s.shots.length });
    const pinAt = (s, y) => s.pins.some((q) => q.x === 133 && Math.abs(q.y - y) < 0.1);
    const up = (s, top) => { const p = sp(s); return p.onGround ? (feet(p) > top + 0.05 ? jumpToward(p, 133.5) : walk(p, 133.5)) : { ...walk(p, 133.5), jump: p.vy < 0 }; };
    play(s, [
      { name: 'low pin', ctrl: (s) => [shoot(s), I], done: (s) => pinAt(s, 21.31) && !s.shots.length },
      { name: 'Sugar up a step', ctrl: (s) => [feet(sg(s)) < 20.05 && sg(s).onGround ? walk(sg(s), 126.5) : jumpToward(sg(s), 126.5), I], done: (s) => near(sg(s), 126.5) && feet(sg(s)) < 20.05 },
      { name: 'high pin', ctrl: (s) => [shoot(s), I], done: (s) => pinAt(s, 19.31) && !s.shots.length },
      { name: 'Spice up the pins', ctrl: (s) => [I, up(s, 19.31)], done: (s) => sp(s).onGround && Math.abs(feet(sp(s)) - 19.31) < 0.05 },
      { name: 'onto the ledge', ctrl: (s) => { const p = sp(s); return [I, feet(p) < 17.05 && p.onGround ? walk(p, 136.5) : { ...jumpToward(p, 135.5), jump: true }]; }, done: got },
    ]);
    return s;
  },
  'night: across her stones, small Spice down the hole': () => {
    const s = at(146, 24, 145);
    play(s, [
      { name: 'over the stones together', ctrl: (s) => [walk(sg(s), Math.min(156.5, cx(sp(s)) + 1)), walk(sp(s), Math.min(156.5, cx(sg(s)) + 0.6))], done: (s) => near(sg(s), 156.5) && near(sp(s), 156.4, 0.4), max: 1500 },
      { name: 'Spice shrinks', ctrl: (s) => [I, { ...I, abilityPressed: sp(s).size !== 'small' }], done: (s) => sp(s).size === 'small' },
      { name: 'down and along', ctrl: (s) => [I, walk(sp(s), cx(sp(s)) < 157.6 && feet(sp(s)) < 25.5 ? 157.5 : 161.5)], done: got, max: 1200 },
    ]);
    return s;
  },
  'night: big Spice on the heavy plate opens her closet': () => {
    const s = at(176, 24, 174.5);
    play(s, [
      { name: 'Spice grows', ctrl: (s) => [I, { ...I, abilityPressed: sp(s).size !== 'big' }], done: (s) => sp(s).size === 'big' },
      { name: 'on the plate; Sugar in', ctrl: (s) => [s.pressed[4] ? walk(sg(s), 169) : I, walk(sp(s), 174.5)], done: got, max: 1200 },
    ]);
    return s;
  },
  'attic: her floor plate opens his ceiling pocket': () => {
    const s = at(189.5, 24, 191);
    play(s, [
      { name: 'Spice up', ctrl: (s) => [walk(sg(s), 189.5), { ...walk(sp(s), 191), abilityPressed: sp(s).grav > 0 && sp(s).onGround }], done: (s) => sp(s).grav < 0 && sp(s).onGround },
      { name: 'along the ceiling into the pocket', ctrl: (s) => [walk(sg(s), 189.5), walk(sp(s), 195.5)], done: got },
    ]);
    return s;
  },
  'attic: his ceiling plate opens her closet': () => {
    const s = at(213, 24, 201);
    play(s, [
      { name: 'Spice up', ctrl: (s) => [I, { ...walk(sp(s), 202.5), abilityPressed: sp(s).grav > 0 && sp(s).onGround }], done: (s) => sp(s).grav < 0 && sp(s).onGround },
      { name: 'on his plate; Sugar in from the east', ctrl: (s) => [s.pressed[2] ? walk(sg(s), 209) : I, walk(sp(s), 202.5)], done: got, max: 1200 },
    ]);
    return s;
  },
  'rooftops: her gust opens the vent door, he glides up': () => {
    const s = at(223, 24, 228);
    let gusted = false;
    play(s, [
      { name: 'Sugar faces the pinwheel', ctrl: (s) => [{ ...I, right: sg(s).facing < 0 }, walk(sp(s), 228.5)], done: (s) => sg(s).facing > 0 && near(sp(s), 228.5) },
      { name: 'gust, then he glides up the vent', ctrl: (s) => {
        const p = sp(s);
        const press = !gusted; gusted = true;
        return [{ ...I, abilityPressed: press }, { ...walk(p, feet(p) < 13.2 ? 233.5 : 230.5), jump: true, jumpPressed: p.onGround && feet(p) > 23 }];
      }, done: got, max: 900 },
    ]);
    return s;
  },
  'rooftops: his plate runs her cloud lift': () => {
    const s = at(245.5, 24, 241.5, 13);
    const cloud = (s) => s.ents.find((e) => e.type === 'platform' && e.look === 'cloud');
    play(s, [
      { name: 'Spice on the plate, Sugar rides up', ctrl: (s) => [feet(sg(s)) < 11.5 || (cloud(s).y < 11.1 && sg(s).ride === cloud(s).i) ? walk(sg(s), 249.5) : sg(s).ride === cloud(s).i ? I : walk(sg(s), 245.9), walk(sp(s), 241.5)], done: got, max: 2400 },
    ]);
    return s;
  },
  'clock: she stops the saws, he walks the tunnel': () => {
    const s = at(266, 24, 269.6, 28);
    const saws = (s) => s.ents.filter((e) => e.type === 'saw' && e.x > 268 && e.x < 284);
    play(s, [
      { name: 'freeze when they are up, he walks', ctrl: (s) => [{ ...I, ability: s.frozen || saws(s).every((e) => e.y < 25.7) }, s.frozen ? walk(sp(s), 282.5) : I], done: got, max: 1500 },
    ]);
    return s;
  },
  'clock: she stops the gears mid-swing, he climbs': () => {
    const s = at(285, 24, 286.5);
    const gears = (s) => s.ents.filter((e) => e.type === 'platform' && e.look === 'gear' && e.x > 285);
    const steps = [[289, 0], [292, 1], [295, 2], [297.5, -1]];
    let k = 0;
    play(s, [
      { name: 'freeze at the staircase, climb', ctrl: (s) => {
        const g1 = gears(s)[0];
        const hold = s.frozen || (g1.y > 22.0 && g1.y < 22.5);
        const p = sp(s);
        if (!s.frozen) return [{ ...I, ability: hold }, I];
        const top = steps[k][1] >= 0 ? gears(s)[steps[k][1]].y : 16;
        if (p.onGround && Math.abs(feet(p) - top) < 0.06 && Math.abs(cx(p) - steps[k][0]) < 1.2 && k < steps.length - 1) k++;
        const [tx, gi] = steps[k];
        const ty = gi >= 0 ? gears(s)[gi].y : 16;
        return [{ ...I, ability: true }, feet(p) < ty + 0.1 && p.onGround ? walk(p, tx) : jumpToward(p, tx)];
      }, done: got, max: 2400 },
    ]);
    return s;
  },
};
for (const [name, fn] of Object.entries(STARS)) test(`star: ${name}`, () => { assert.ok(got(fn())); });
test('there is a test for every star', () => {
  assert.equal(Object.keys(STARS).length, YARD.map.join('').split('$').length - 1);
});

// ---------------------------------------------------------------- the toys
test('race: both on the flag -> 3-2-1 -> the first to the finish wins', () => {
  const r = YARD.ents.find((e) => e.type === 'race');
  const s = at(r.x - 0.6, r.y, r.x + 0.6, r.y);
  const seen = run(s, 4000, (s) => [s.ents.find((e) => e.type === 'race').phase === 'run' ? autorun(s, sg(s), r.x1 + 1) : I, I]);
  const end = seen.find((e) => e.type === 'raceEnd');
  assert.ok(seen.some((e) => e.type === 'raceGo'));
  assert.ok(end && end.who === 0, JSON.stringify(end));
  assert.ok(end.t > 2 && end.t < 20);
});
test('race: stepping off the flag during the count calls it off', () => {
  const r = YARD.ents.find((e) => e.type === 'race');
  const s = at(r.x - 0.6, r.y, r.x + 0.6, r.y);
  const seen = run(s, 300, (s, t) => [t > 60 ? walk(sg(s), r.x - 3) : I, I]);
  assert.ok(!seen.some((e) => e.type === 'raceGo'));
});
test('balloons: stomp your own pump; first to pop wins, then it resets', () => {
  const b = YARD.ents.find((e) => e.type === 'balloons');
  const s = at(b.x + 0.5, 24, b.x1 + 0.5, 24);
  const seen = run(s, 1200, (s) => [jumpToward(sg(s), b.x + 0.5), I]);
  const pop = seen.find((e) => e.type === 'pop');
  assert.ok(pop && pop.who === 0);
  assert.equal(seen.filter((e) => e.type === 'pump' && e.who === 0).length >= 12, true);
  const e = s.ents.find((q) => q.type === 'balloons');
  assert.ok(e.winner === -1 || e.n[0] <= 12);
});
test('footy: run the ball into the far end to score', () => {
  const b = YARD.ents.find((e) => e.type === 'ball');
  const s = at(b.x - 3, 26, b.x - 8, 26);
  const seen = run(s, 3000, (s) => { const ball = s.ents.find((e) => e.type === 'ball'); return [walk(sg(s), ball.x - 0.2 + (cx(sg(s)) > ball.x ? -2 : 0)), I]; });
  const goal = seen.find((e) => e.type === 'goal');
  assert.ok(goal && goal.who === 0, 'Sugar scores at the right end');
});
test('piano: walking across the keys plays each one once', () => {
  const pi = YARD.ents.find((e) => e.type === 'piano');
  const s = at(pi.x - 1, 24, pi.x - 2, 24);
  const seen = run(s, 300, (s) => [walk(sg(s), pi.x + pi.n + 0.5), I]);
  const xs = seen.filter((e) => e.type === 'note' && e.who === 0).map((e) => e.x);
  assert.deepEqual(xs, Array.from({ length: pi.n }, (_, i) => pi.x + i));
});
test('bench: sit still together and something sweet happens', () => {
  const b = YARD.ents.find((e) => e.type === 'bench');
  const s = at(b.x + 0.8, 24, b.x + 2.2, 24);
  assert.ok(run(s, 200, () => [I, I]).some((e) => e.type === 'cuddle'));
});
test('high striker: the higher Spice slams from, the higher the puck', () => {
  const st = YARD.ents.find((e) => e.type === 'striker');
  const hs = [];
  for (const from of [24, 17]) {
    const s = at(st.x - 4, 24, st.x + 0.5, from);
    const seen = run(s, 300, (s) => { const p = sp(s); return [I, { ...I, jump: true, jumpPressed: p.onGround && feet(p) > 23.9, abilityPressed: !p.onGround && p.vy > -1 && !p.slamming }]; });
    const hit = seen.find((e) => e.type === 'strike');
    assert.ok(hit, `slam from ${from}`);
    hs.push(hit.h);
  }
  assert.ok(hs[1] > hs[0] + 2, `heights ${hs}`);
});
test('trampoline: land on it and you bounce high', () => {
  const s = at(14.5, 20, 7, 24);
  let top = 99;
  run(s, 120, (s) => { top = Math.min(top, feet(sg(s))); return [I, I]; });
  assert.ok(top < 20, `peaked at ${top}`);
});
test('toys never touch progress: no star, no completion, from any of them', () => {
  const s = yard();
  // a minute of every toy event happening is in the tests above; here: none of them is a star
  for (const t of ['raceEnd', 'pop', 'goal', 'footyWin', 'note', 'cuddle', 'strike', 'boing']) assert.notEqual(t, 'star');
  assert.equal(s.complete, false);
});

// ---------------------------------------------------------------- one of you alone can't
// (The routes above are the controls: the same stars fall to two of you.)
const SOLO = [
  ['plaza pole', 48, 55, 11], ['garden closet', 66, 75, 22], ['garden shelf', 80, 87, 19], ['workshop launch', 106, 115, 17],
  ['workshop pins', 120, 136, 16], ['night hole', 144, 161, 25], ['night closet', 144, 169, 22], ['attic pocket', 184, 195, 13],
  ['attic closet', 198, 209, 22], ['rooftops vent', 223, 233, 12], ['rooftops cloud', 236, 249, 10], ['clock tunnel', 264, 282, 27],
];
const POLICIES = {
  run: (tx) => (s, p) => autorun(s, p, tx),
  'run and power': (tx) => (s, p, t) => ({ ...autorun(s, p, tx), abilityPressed: t % 23 === 0, ability: t % 90 < 30 }),
  'hop and power': (tx) => (s, p, t) => ({ ...walk(p, tx), jump: t % 40 < 20, jumpPressed: t % 40 === 0, abilityPressed: t % 40 === 10 }),
};
for (const [name, x0, starX, starY] of SOLO) {
  test(`solo: ${name} needs both of you`, () => {
    for (const who of [0, 1]) for (const [pname, pol] of Object.entries(POLICIES)) {
      const s = yard();
      put(s.players[who], x0, 24); put(s.players[1 - who], x0 - 5, 24);
      const ctrl = pol(starX + 0.5);
      for (let t = 0; t < 1500; t++) { const inp = [I, I]; inp[who] = ctrl(s, s.players[who], t); step(s, inp); }
      assert.equal(s.grid[starY][starX], '$', `${who ? 'Spice' : 'Sugar'} alone (${pname}) got the ${name} star`);
    }
  });
}

// ---------------------------------------------------------------- fuzz and render, all over the Yard
import { solidTile } from '../src/sim.js';
import { fingerprint } from '../src/lockstep.js';
import { drawWorld, makeCamera, snapCamera, zoneAt } from '../src/render.js';
function lcg(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }
function masher(rand) {
  let held = {}, hold = 0;
  return () => {
    if (hold-- <= 0) { hold = 5 + Math.floor(rand() * 40); const d = rand(); held = { left: d < 0.3, right: d > 0.55, down: rand() < 0.1, jump: rand() < 0.4, ability: rand() < 0.3 }; }
    return { ...I, ...held, jumpPressed: held.jump && rand() < 0.15, abilityPressed: rand() < 0.04 };
  };
}
const DROPS = [6, 30, 44, 56, 66, 110, 128, 150, 162, 190, 200, 228, 245, 270, 290];   // open ground for both of you
test('fuzz: mashing all over the Yard never breaks the world', () => {
  for (const [i, x] of DROPS.entries()) {
    const seed = i + 1;
    const s = yard({ gentle: seed % 2 === 0 });
    put(s.players[0], x, 24); put(s.players[1], x + 1, 24);
    const rand = lcg(seed), a = masher(lcg(seed * 7 + 1)), b = masher(lcg(seed * 13 + 5));
    const stuck = [0, 0];
    for (let t = 0; t < 4000; t++) {
      step(s, [{ ...a(), regroup: rand() < 0.001 }, b()]);
      for (const p of s.players) {
        for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(p[k]), `drop ${x} step ${t}: ${k}`);
        let inside = false;
        if (!p.dead) for (let cy = Math.floor(p.y + 0.02); cy <= Math.floor(p.y + p.h - 0.02); cy++) for (let cx = Math.floor(p.x + 0.02); cx <= Math.floor(p.x + p.w - 0.02); cx++) {
          const c = s.grid[cy]?.[cx];
          if (solidTile(s, cx, cy) && !(c >= 'A' && c <= 'D')) inside = true;
        }
        stuck[p.id] = inside ? stuck[p.id] + 1 : 0;
        assert.ok(stuck[p.id] < 30, `drop ${x} step ${t}: player ${p.id} stuck in a wall`);
      }
      const ball = s.ents.find((e) => e.type === 'ball');
      assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y), 'the ball stays a number');
      assert.ok(!s.complete, 'the Yard never ends');
    }
  }
});
test('fuzz: same seed, same Yard (online stays in step)', () => {
  const once = () => { const s = yard(); put(s.players[0], 44, 26); put(s.players[1], 46, 26); const a = masher(lcg(5)), b = masher(lcg(9)); for (let t = 0; t < 3000; t++) step(s, [a(), b()]); return fingerprint(s); };
  assert.equal(once(), once());
});
test('render never writes the Yard\'s state, in every district', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
  for (const x of DROPS) {
    const s = yard();
    put(s.players[0], x, 24); put(s.players[1], x + 1, 24);
    const a = masher(lcg(x)), b = masher(lcg(x + 3));
    const cam = makeCamera(s);
    for (let t = 0; t < 200; t++) {
      step(s, [a(), b()]);
      if (t % 25 === 0) {
        const before = JSON.stringify(s);
        snapCamera(cam, s, 1280, 720, true);
        drawWorld(ctx, s, cam, 1280, 720, [], zoneAt(s, cam.x).theme);
        assert.equal(JSON.stringify(s), before, `render wrote state near x ${x}`);
      }
    }
  }
});

test('attic pocket: if Sugar steps off her plate, Spice can still let himself out', () => {
  const s = at(189.5, 24, 191);
  play(s, [
    { name: 'Spice up', ctrl: (s) => [walk(sg(s), 189.5), { ...walk(sp(s), 191), abilityPressed: sp(s).grav > 0 && sp(s).onGround }], done: (s) => sp(s).grav < 0 && sp(s).onGround },
    { name: 'into the pocket', ctrl: (s) => [walk(sg(s), 189.5), walk(sp(s), 195.5)], done: got },
    { name: 'Sugar walks off: the door shuts on him', ctrl: (s) => [walk(sg(s), 186), walk(sp(s), 195.5)], done: (s) => near(sg(s), 186) && !s.pressed[3] },
    { name: 'his plate inside opens it; he walks out', ctrl: (s) => [I, walk(sp(s), 189)], done: (s) => cx(sp(s)) < 191.5, max: 600 },
  ]);
});
