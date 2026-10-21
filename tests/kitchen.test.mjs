// Chapter 1, the Kitchen: two bots play it start to finish; one of you alone can't
// get past the first set piece; and the sim stays sane and deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { kitchenBot } from '../src/kitchen/bot.js';
import { solidTile } from '../src/kitchen/sim.js';
import { fingerprint } from '../src/lockstep.js';

function lcg(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }

test('the two of you play the Kitchen through: cubes, nests, the gap, the dark, the queen', () => {
  const s = createRun('kitchen', {});
  const seen = new Set();
  let t = 0;
  for (; t < 60 * 60 * 6 && !s.complete; t++) { step(s, [kitchenBot(s, 0), kitchenBot(s, 1)]); for (const e of s.events) seen.add(e.type); }
  assert.ok(s.complete, `not done after ${(t / 60).toFixed(0)} s`);
  for (const k of ['crumble', 'nestDown', 'doorOpen', 'launch', 'lightsOut', 'lightsOn', 'bossStart', 'queenAngry', 'queenDown']) assert.ok(seen.has(k), `never saw ${k}`);
});

test('his syrup never hurts; her sparks do nothing to a shell, a nest or the queen', () => {
  const s = createRun('kitchen', {});
  const nest = s.ents.find((e) => e.type === 'nest');
  for (const who of [0, 1]) {
    const p = s.players[who];
    p.x = nest.x - 3; p.y = nest.y; p.fx = 1; p.fy = 0;
    for (let k = 0; k < 400; k++) { const inp = [I, I]; inp[who] = { ...I, ability: true }; step(s, inp); s.puddles = []; }
    assert.equal(nest.hp, nest.max, `${who ? 'Spice' : 'Sugar'} alone hurt a nest`);
    p.x = 3.5; p.y = 10.5;
  }
});

test('alone, neither of you gets past the sugar cubes', () => {
  for (const who of [0, 1]) for (const seed of [1, 2, 3]) {
    const s = createRun('kitchen', {});
    const rnd = lcg(seed), p = s.players[who];
    let hold = {}, n = 0;
    for (let t = 0; t < 60 * 60; t++) {
      if (n-- <= 0) { n = 10 + (rnd() * 50 | 0); hold = { right: rnd() < 0.7, left: rnd() < 0.15, up: rnd() < 0.3, down: rnd() < 0.3, ability: rnd() < 0.8 }; }
      const inp = [I, I]; inp[who] = { ...I, ...hold, jumpPressed: rnd() < 0.03 };
      step(s, inp);
    }
    assert.ok(p.x < 16.5, `${who ? 'Spice' : 'Sugar'} alone got through (seed ${seed})`);
    assert.ok(s.grid.slice(5, 17).every((r) => r[16] === 'c'), 'a cube broke with one of you');
  }
});

test('fuzz: mashing all over the chapter: no NaN, nobody in a wall', () => {
  for (const at of [0, 1, 3, 5, 6]) {
    const s = createRun('kitchen', {});
    const cps = s.ents.filter((e) => e.type === 'cp');
    const cp = cps[Math.min(at, cps.length - 1)];
    for (const p of s.players) { p.x = cp.x; p.y = cp.y + (p.id ? 0.6 : -0.6); p.safe = { x: p.x, y: p.y }; }
    s.cp = cp.i;
    const r = [lcg(at + 1), lcg(at + 9)];
    const held = [{}, {}], n = [0, 0];
    for (let t = 0; t < 2400; t++) {
      const inp = [0, 1].map((k) => {
        if (n[k]-- <= 0) { n[k] = 5 + (r[k]() * 40 | 0); held[k] = { left: r[k]() < 0.3, right: r[k]() < 0.5, up: r[k]() < 0.3, down: r[k]() < 0.3, ability: r[k]() < 0.6 }; }
        return { ...I, ...held[k], jumpPressed: r[k]() < 0.04, abilityPressed: r[k]() < 0.05 };
      });
      step(s, inp);
      for (const p of s.players) {
        for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(p[k]), `${k} NaN near cp ${at}`);
        if (!p.down && !p.fall && !p.fly) assert.ok(!solidTile(s.grid[Math.floor(p.y)][Math.floor(p.x)]), `player ${p.id} inside a wall near cp ${at}`);
      }
      for (const e of s.ents) if (e.type === 'ant' && !e.dead) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
    }
  }
});

test('same inputs, same Kitchen (online stays in step)', () => {
  const once = () => { const s = createRun('kitchen', {}); for (let t = 0; t < 3000; t++) step(s, [kitchenBot(s, 0), kitchenBot(s, 1)]); return fingerprint(s); };
  assert.equal(once(), once());
});
