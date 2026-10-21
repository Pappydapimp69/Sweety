// The top-down world: the main path plays start to second heart, every star falls to two
// of you and not to one, the toys play to a result, and the world stays sane and deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { solidAt } from '../src/td/sim.js';
import { REGIONS, RW, RH, WORLD } from '../src/td/world.js';
import { fingerprint, packInput, unpackInput } from '../src/lockstep.js';
import { go, at, face, faces } from './tdbots.mjs';
import { mainPhases } from './tdphases.mjs';
import { play } from './bots.mjs';

const O = (id) => { const r = REGIONS.find((q) => q.id === id); return [r.col * RW, r.row * RH]; };
const [MX, MY] = O('meadow'), [WX, WY] = O('workshop'), [PX, PY] = [RW, RH];
const sg = (s) => s.players[0], sp = (s) => s.players[1];
const place = (p, x, y) => { p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.safe = { x, y }; };
function world(opts = { unlocked: [0, 1], hearts: [0, 1] }) { return createRun('world', opts); }
function from(x0, y0, x1, y1, opts) { const s = world(opts); place(sg(s), x0, y0); place(sp(s), x1, y1); for (let i = 0; i < 5; i++) step(s, [I, I]); return s; }
const use = (p, dx, dy) => face(p, dx, dy) || { ...I, abilityPressed: faces(p, dx, dy) };
const both = (a, b) => (s) => [a(s), b(s)];
const idle = () => I;
const starAt = (s, x, y) => s.grid[y][x] === '$';

// ---------------------------------------------------------------- the world
test('the up stick travels online (a new input bit, the old ones unchanged)', () => {
  const i = { ...I, up: true, left: true, regroup: true };
  assert.deepEqual(unpackInput(packInput(i)), { ...I, up: true, left: true, regroup: true, right: false, down: false, jump: false, ability: false, jumpPressed: false, abilityPressed: false, camL: false, camR: false });
  assert.equal(packInput({ left: true }), 1);   // bit 0 is still left
});

test('world lint: closed all round, one spawn each, every switch drives something', () => {
  const m = WORLD.map;
  assert.equal(new Set(m.map((r) => r.length)).size, 1);
  for (let x = 0; x < m[0].length; x++) { assert.equal(m[0][x], '#'); assert.equal(m[m.length - 1][x], '#'); }
  for (const r of m) { assert.equal(r[0], '#'); assert.equal(r[r.length - 1], '#'); }
  const all = m.join('');
  assert.equal(all.split('P').length - 1, 1); assert.equal(all.split('Q').length - 1, 1);
  for (const c of all) assert.ok('.#Two^=u12345678ABCDabcdK$PQr~%'.includes(c), `unknown tile ${c}`);
  const plates = new Set([...all].filter((c) => c >= '1' && c <= '8').map((c) => ((c.charCodeAt(0) - 49) % 4) + 1));
  for (const e of WORLD.ents) if (e.type === 'switch') plates.add(e.g);
  const driven = new Set([...all].filter((c) => (c >= 'A' && c <= 'D') || (c >= 'a' && c <= 'd')).map((c) => c.toUpperCase().charCodeAt(0) - 64));
  assert.deepEqual([...plates].sort(), [...driven].sort());
});

test('main path: from the Plaza through the Meadow and the Workshop to both hearts, no deaths', () => {
  const s = createRun('world', {});
  let deaths = 0;
  for (const ph of mainPhases()) {
    let n = 0;
    while (!ph.done(s)) { assert.ok(++n <= (ph.max ?? 900), `stuck: ${ph.name}`); step(s, ph.ctrl(s)); deaths += s.events.filter((e) => e.type === 'die').length; }
  }
  assert.deepEqual(s.hearts, [0, 1]); assert.deepEqual(s.unlocked, [0, 1]);
  assert.equal(deaths, 0);
});

const hold = (p, dx, dy) => face(p, dx, dy) || { ...I, ability: true, abilityPressed: faces(p, dx, dy) && !p.casting };
const run = (s, n, f) => { for (let i = 0; i < n; i++) step(s, f(s)); };
const C = 16;   // the Meadow's crossing

test('powers belong to regions, and only once their stone is lit', () => {
  const s = createRun('world', {});
  place(sg(s), MX + C + 0.5, MY + 7.5); place(sp(s), MX + C + 1.5, MY + 6.5);
  run(s, 4, (s) => [hold(sg(s), 0, 1), I]);
  assert.ok(!s.grid.some((r) => r.includes('v')), 'no vine before the stone');
  s.unlocked = [0];
  run(s, 4, (s) => [hold(sg(s), 0, 1), I]);
  assert.equal(s.grid[MY + 8][MX + C], 'v', 'a vine after it');
});

test('a gate stays shut until the heart before it; then it opens at once', () => {
  const s = createRun('world', { unlocked: [0] });
  assert.ok(solidAt(s, MX, MY + 17), 'shut');
  place(sg(s), MX + 28.5, MY + 20.5);
  step(s, [I, I]);
  assert.ok(!solidAt(s, MX, MY + 17), 'open after the heart');
});

// ---------------------------------------------------------------- the Meadow: each power needs the other's
test('her vine is held: she stands rooted while she holds it, and it goes when she lets go', () => {
  const s = from(MX + C + 0.5, MY + 7.5, MX + C + 1.5, MY + 6.5, { unlocked: [0] });
  run(s, 4, (s) => [hold(sg(s), 0, 1), I]);
  run(s, 30, (s) => [{ ...hold(sg(s), 0, 1), left: true }, I]);
  assert.equal(s.grid[MY + 8][MX + C], 'v');
  assert.ok(Math.abs(sg(s).x - (MX + C + 0.5)) < 0.05, 'rooted');
  run(s, 2, () => [I, I]);
  assert.equal(s.grid[MY + 8][MX + C], 'w', 'gone when she lets go');
});

test('her vine holds him, not her', () => {
  const s = from(MX + C + 0.5, MY + 7.5, MX + C + 1.5, MY + 7.5, { unlocked: [0] });
  let died = false;
  run(s, 200, (s) => { died ||= sp(s).dead; return [hold(sg(s), 0, 1), go(s, sp(s), MX + C + 0.5, MY + 8.5)]; });
  assert.ok(!died && at(sp(s), MX + C + 0.5, MY + 8.5), 'Spice walks out on it');
  const s2 = from(MX + C + 1.5, MY + 7.5, MX + C + 0.5, MY + 7.5, { unlocked: [0] });   // he holds nothing; she tries the moat
  run(s2, 60, (s) => [{ ...I, down: true }, hold(sp(s), 0, 1)]);
  assert.ok(sg(s2).dead || sg(s2).y < MY + 8.2, 'she falls in (or stays on the bank)');
});

test('his shove: a crate into the current floats off east, and a drifting one slips from his hands', () => {
  const s = from(MX + 12.5, MY + 7.5, MX + 6.5, MY + 7.5, { unlocked: [0] });
  run(s, 4, (s) => [I, use(sp(s), 0, 1)]);
  const c = s.ents.find((e) => e.type === 'crate' && e.hx === MX + 6);
  assert.ok(c.float && c.y === MY + 9, 'it floats');
  run(s, 60, () => [I, I]);
  assert.ok(c.x > MX + 7, 'and drifts');
  // from the moat's sunk end of the dock, he can't stop a drifting crate
  place(sp(s), c.x + 0.5, MY + 7.5);
  const before = c.x;
  run(s, 3, (s) => [I, use(sp(s), 0, 1)]);
  assert.ok(c.float && !c.tied && c.y === MY + 9 && c.x >= before, 'it slips');
});

test('her vine ties only a floating crate: with none, it holds nothing; with his, it stops it', () => {
  const s = from(MX + C + 0.5, MY + 7.5, MX + 6.5, MY + 7.5, { unlocked: [0] });
  run(s, 300, (s) => [hold(sg(s), 0, 1), I]);
  assert.equal(s.vine.tied, -1, 'nothing to tie');
  run(s, 4, (s) => [hold(sg(s), 0, 1), use(sp(s), 0, 1)]);
  run(s, 400, (s) => [hold(sg(s), 0, 1), I]);
  const c = s.ents.find((e) => e.type === 'crate' && e.hx === MX + 6);
  assert.ok(c.tied && c.x === MX + C && c.y === MY + 9, 'tied at the end of her vine');
  run(s, 2, () => [I, I]);
  assert.ok(!c.tied, 'let go, it drifts on');
});

test('a crate the current carries off comes back to the dock', () => {
  const s = from(MX + 12.5, MY + 3.5, MX + 6.5, MY + 7.5, { unlocked: [0] });
  run(s, 4, (s) => [I, use(sp(s), 0, 1)]);
  const c = s.ents.find((e) => e.type === 'crate' && e.hx === MX + 6);
  place(sp(s), MX + 10.5, MY + 5.5);
  run(s, 60 * 16, () => [I, I]);
  assert.ok(!c.gone && !c.float && c.x === MX + 6 && c.y === MY + 8, JSON.stringify(c));
});

// ---------------------------------------------------------------- the Workshop: each power needs the other's
const [RX, RY] = [WX + 19.5, WY + 17.5];
const plank = (s) => s.planks.find((k) => !k.tacked);
test('the press: his hammer stamps a plank that rides the rollers west and drops off the end', () => {
  const s = from(RX, RY, WX + 21.5, RY, { unlocked: [1] });
  run(s, 3, (s) => [I, use(sp(s), -1, 0)]);
  assert.ok(plank(s), 'a plank');
  let dropped = false;
  run(s, 200, (s) => { dropped ||= s.events.some((e) => e.type === 'drop'); return [I, I]; });
  assert.ok(dropped && !s.planks.length);
});

test('her nail tacks only a plank, and a tacked plank works loose unless his hammer drives it', () => {
  const s = from(RX, RY, WX + 21.5, RY, { unlocked: [1] });
  run(s, 30, (s) => [use(sg(s), -1, 0), I]);
  assert.ok(!s.grid[WY + 17].includes('t'), 'no plank, nothing to tack');
  run(s, 3, (s) => [I, use(sp(s), -1, 0)]);
  run(s, 200, (s) => { const k = plank(s); return [face(sg(s), -1, 0) || { ...I, abilityPressed: !!k && k.px < WX + 17.3 && sg(s).cool <= 0 }, I]; });
  assert.equal(s.grid[WY + 17][WX + 17], 't', 'tacked');
  run(s, 60 * 4, () => [I, I]);
  assert.notEqual(s.grid[WY + 17][WX + 17], 't', 'loose again');
  // hammered with nothing tacked: no plank turns to floor
  place(sp(s), RX, RY);
  run(s, 3, (s) => [I, use(sp(s), -1, 0)]);
  assert.ok(!s.grid[WY + 17].includes('='), 'his hammer drives nothing she hasn\'t tacked');
});

test('a tacked plank is never a respawn point', () => {
  const s = from(RX, RY, WX + 21.5, RY, { unlocked: [1] });
  s.grid[WY + 17][WX + 17] = 't';
  sp(s).x = WX + 17.5; sp(s).y = RY; step(s, [I, I]);
  assert.ok(!sp(s).dead, 'standing on it');
  assert.ok(!(Math.floor(sp(s).safe.x) === WX + 17), 'not remembered as safe');
});

// ---------------------------------------------------------------- nobody crosses alone (the main path above is the control)
function lcg0(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }
for (const [name, region, x, y, across] of [
  ['the Meadow river', [0], MX + 12.5, MY + 6.5, (p) => p.y > MY + 10.6],
  ['the Workshop chasm', [1], WX + 22.5, WY + 15.5, (p) => p.x < WX + 13.6],
]) {
  test(`solo: ${name} needs both of you`, () => {
    for (const who of [0, 1]) for (const seed of [1, 2, 3, 4]) {
      const s = from(x, y, x + 1, y, { unlocked: region });
      const rnd = lcg0(seed), p = s.players[who];
      let made = false;
      for (let t = 0; t < 3600 && !made; t++) {
        const inp = [I, I];
        const d = rnd();
        inp[who] = t % 240 < 120
          ? { ...I, left: d < 0.3, right: d > 0.7, up: rnd() < 0.3, down: rnd() < 0.5, jumpPressed: rnd() < 0.05, ability: rnd() < 0.5, abilityPressed: rnd() < 0.08 }
          : { ...I, down: region[0] === 0, left: region[0] === 1, jumpPressed: rnd() < 0.08, abilityPressed: rnd() < 0.08, ability: rnd() < 0.5 };
        step(s, inp);
        made = !p.dead && !p.hop && across(p);
      }
      assert.ok(!made, `${who ? 'Spice' : 'Sugar'} alone crossed ${name} (seed ${seed})`);
    }
  });
}

// ---------------------------------------------------------------- every star, by two of you
const STARS = {
  'plaza: hop the puddle': [PX + 30, PY + 8, () => {
    const s = from(PX + 27.5, PY + 8.5, PX + 26.5, PY + 8.5);
    play(s, [
      { name: 'run and hop', ctrl: both((s) => ({ ...go(s, sg(s), PX + 30.5, PY + 8.5), right: true, jumpPressed: sg(s).x > PX + 28.4 && !sg(s).hop }), idle), done: (s) => s.starsGot > 0, max: 300 },
    ]);
    return s;
  }],
  'workshop: the nook (his hammer flings her in)': [WX + 5, WY + 21, () => {
    const s = from(WX + 10.5, WY + 21.5, WX + 11.5, WY + 21.5);
    play(s, [
      { name: 'hammer her springboard', ctrl: both(idle, (s) => use(sp(s), -1, 0)), done: (s) => !!sg(s).fly },
      { name: 'land and grab it', ctrl: both((s) => (sg(s).fly ? I : go(s, sg(s), WX + 5.5, WY + 21.5)), idle), done: (s) => !starAt(s, WX + 5, WY + 21), max: 600 },
      { name: 'her plate lets her out', ctrl: both((s) => go(s, sg(s), WX + 9.5, WY + 21.5), idle), done: (s) => sg(s).x > WX + 9.2, max: 900 },
    ]);
    return s;
  }],
};
for (const [name, [x, y, fn]] of Object.entries(STARS)) test(`star: ${name}`, () => { assert.ok(!starAt(fn(), x, y)); });
test('there is a route for every star', () => { assert.equal(Object.keys(STARS).length, WORLD.map.join('').split('$').length - 1); });

// ---------------------------------------------------------------- one of you alone can't (the routes above are the controls)
const SOLO = [['workshop nook', WX + 10.5, WY + 20.5, WX + 5, WY + 21]];
function lcg(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }
for (const [name, x, y, tx, ty] of SOLO) {
  test(`solo: the ${name} star needs both of you`, () => {
    for (const who of [0, 1]) for (const seed of [1, 2, 3]) {
      const s = from(x, y, x - 4, y);
      if (who === 0) { place(sg(s), x, y); place(sp(s), x - 4, y); } else { place(sp(s), x, y); place(sg(s), x - 4, y); }
      const rnd = lcg(seed), p = s.players[who];
      for (let t = 0; t < 2400; t++) {
        const inp = [I, I];
        const wander = t % 300 < 200 ? go(s, p, tx + 0.5, ty + 0.5) : { ...I, right: rnd() < 0.5, left: rnd() < 0.3, up: rnd() < 0.3, down: rnd() < 0.4 };
        inp[who] = { ...wander, abilityPressed: rnd() < 0.05, jumpPressed: rnd() < 0.03 };
        step(s, inp);
      }
      assert.ok(starAt(s, tx, ty), `${who ? 'Spice' : 'Sugar'} alone got the ${name} star (seed ${seed})`);
    }
  });
}

// ---------------------------------------------------------------- toys
test('race: both on the flag, 3-2-1, round the three flags and back: first home wins', () => {
  const r = WORLD.ents.find((e) => e.type === 'race');
  const s = from(r.x + 0.3, r.y + 0.5, r.x + 1.2, r.y + 0.5);
  const pts = [...r.gates, [r.x, r.y]];
  let k = 0, end = null, go1 = false;
  for (let t = 0; t < 4000 && !end; t++) {
    const e = s.ents.find((q) => q.type === 'race');
    const p = sg(s);
    if (e.phase === 'run') { const [gx, gy] = pts[Math.min(k, pts.length - 1)]; if (Math.abs(p.x - gx - 0.5) < 1.2 && Math.abs(p.y - gy - 0.5) < 1.2) k++; }
    const tgt = pts[Math.min(k, pts.length - 1)];
    step(s, [e.phase === 'run' ? go(s, p, tgt[0] + 0.5, tgt[1] + 0.5) : I, I]);
    go1 ||= s.events.some((q) => q.type === 'raceGo');
    end = s.events.find((q) => q.type === 'raceEnd') || null;
  }
  assert.ok(go1 && end && end.who === 0, JSON.stringify(end));
});
test('footy: dribble the ball into the right-hand goal and Sugar scores', () => {
  const b = WORLD.ents.find((e) => e.type === 'ball');
  const s = from(b.x - 2, b.y, b.x - 4, b.y + 1.5);
  let goal = null;
  for (let t = 0; t < 3000 && !goal; t++) {
    const ball = s.ents.find((e) => e.type === 'ball');
    const p = sg(s);
    const behind = p.x < ball.x - 0.4;
    step(s, [behind ? go(s, p, ball.x + 0.5, ball.y + (b.gy0 + b.gy1) / 2 - ball.y) : go(s, p, ball.x - 1.2, ball.y + (p.y < ball.y ? -1 : 1)), I]);
    goal = s.events.find((e) => e.type === 'goal') || null;
  }
  assert.ok(goal && goal.who === 0, JSON.stringify(goal));
});
test('balloons: hop on your own pump; first to pop wins', () => {
  const b = WORLD.ents.find((e) => e.type === 'balloons');
  const s = from(b.x + 0.5, b.y + 0.5, b.x1 + 0.5, b.y1 + 0.5);
  const seen = [];
  for (let t = 0; t < 1500; t++) { step(s, [{ ...I, jumpPressed: !sg(s).hop }, I]); seen.push(...s.events); }
  const pop = seen.find((e) => e.type === 'pop');
  assert.ok(pop && pop.who === 0);
});
test('piano: walking along the keys plays them', () => {
  const pi = WORLD.ents.find((e) => e.type === 'piano');
  const s = from(pi.x - 0.5, pi.y + 0.5, pi.x - 2, pi.y + 0.5);
  const notes = [];
  for (let t = 0; t < 200; t++) { step(s, [go(s, sg(s), pi.x + 6.5, pi.y + 0.5), I]); notes.push(...s.events.filter((e) => e.type === 'note')); }
  assert.equal(notes.length, 6);
});
test('bench: sit still on it together and something sweet happens', () => {
  const b = WORLD.ents.find((e) => e.type === 'bench');
  const s = from(b.x + 0.6, b.y + 0.5, b.x + 2.3, b.y + 0.5);
  let ok = false;
  for (let t = 0; t < 200 && !ok; t++) { step(s, [I, I]); ok = s.events.some((e) => e.type === 'cuddle'); }
  assert.ok(ok);
});

// ---------------------------------------------------------------- fuzz, determinism
function masher(rand) {
  let held = {}, hold = 0;
  return () => {
    if (hold-- <= 0) { hold = 5 + Math.floor(rand() * 40); const d = rand(); held = { left: d < 0.25, right: d > 0.6, up: rand() < 0.3, down: rand() < 0.3, jump: rand() < 0.3, ability: rand() < 0.2 }; }
    return { ...I, ...held, jumpPressed: rand() < 0.04, abilityPressed: rand() < 0.04 };
  };
}
const DROPS = [[PX + 16, PY + 19], [PX + 8, PY + 6], [PX + 22, PY + 21], [MX + 16, MY + 4], [MX + 6, MY + 7], [MX + 16, MY + 7], [MX + 24, MY + 18], [WX + 28, WY + 12], [WX + 21, WY + 17], [WX + 11, WY + 6], [WX + 10, WY + 22]];
test('fuzz: mashing all over the world: no NaN, nobody stuck in a wall, nothing ends', () => {
  for (const [i, [x, y]] of DROPS.entries()) {
    const s = from(x + 0.5, y + 0.5, x + 1.5, y + 0.5);
    const a = masher(lcg(i * 7 + 1)), b = masher(lcg(i * 13 + 5)), rr = lcg(i + 99);
    const stuck = [0, 0];
    for (let t = 0; t < 3000; t++) {
      step(s, [{ ...a(), regroup: rr() < 0.0008 }, b()]);
      for (const p of s.players) {
        for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(p[k]), `${k} at drop ${i}`);
        const R = 0.35;
        let inside = false;
        if (!p.dead && !p.fly) for (let cy = Math.floor(p.y - R + 0.02); cy <= Math.floor(p.y + R - 0.02); cy++) for (let cx = Math.floor(p.x - R + 0.02); cx <= Math.floor(p.x + R - 0.02); cx++) { const c = s.grid[cy][cx]; if (solidAt(s, cx, cy) && !(c >= 'A' && c <= 'D')) inside = true; }
        stuck[p.id] = inside ? stuck[p.id] + 1 : 0;
        assert.ok(stuck[p.id] < 30, `player ${p.id} stuck in a wall near drop ${i}`);
      }
      assert.ok(!s.complete);
    }
  }
});
test('same inputs, same world (online stays in step)', () => {
  const once = () => { const s = from(PX + 10, PY + 10, PX + 11, PY + 10); const a = masher(lcg(3)), b = masher(lcg(4)); for (let t = 0; t < 3000; t++) step(s, [a(), b()]); return fingerprint(s); };
  assert.equal(once(), once());
});
