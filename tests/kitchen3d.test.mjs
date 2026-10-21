// Chapter 1 in 3D: two bots play it through; no one alone gets up onto the counters;
// each gun does nothing much without the other's; the sim stays sane and deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { k3Bot } from '../src/k3/bot.js';
import { fingerprint } from '../src/lockstep.js';

function lcg(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }

test('the two of you clear the Kitchen: three nests (floor, counter, fridge), the lights go, the queen', () => {
  const s = createRun('kitchen', {});
  const seen = new Set();
  let t = 0, top = 0;
  for (; t < 60 * 60 * 6 && !s.complete; t++) { step(s, [k3Bot(s, 0), k3Bot(s, 1)]); for (const e of s.events) seen.add(e.type); top = Math.max(top, ...s.players.map((p) => p.z)); }
  assert.ok(s.complete, `not done after ${(t / 60).toFixed(0)} s`);
  for (const k of ['launch', 'nestDown', 'lightsOut', 'bossStart', 'queenDown']) assert.ok(seen.has(k), `never saw ${k}`);
  assert.ok(top >= 10, 'never stood on the fridge');
});

test('alone, neither of you gets up onto the counters or the fridge (the island is fair game)', () => {
  for (const who of [0, 1]) for (const seed of [1, 2, 3]) {
    const s = createRun('kitchen', {});
    const rnd = lcg(seed), p = s.players[who];
    let hold = {}, n = 0, top = 0;
    for (let t = 0; t < 60 * 90; t++) {
      if (n-- <= 0) { n = 10 + (rnd() * 60 | 0); hold = { up: rnd() < 0.6, down: rnd() < 0.15, left: rnd() < 0.3, right: rnd() < 0.3, ability: rnd() < 0.6 }; }
      const inp = [I, I]; inp[who] = { ...I, ...hold, jumpPressed: rnd() < 0.06, abilityPressed: rnd() < 0.05 };
      step(s, inp);
      const island = p.x > 19.5 && p.x < 34.5 && p.y > 15.5 && p.y < 23.5;
      if (p.ground && !island) top = Math.max(top, p.z);
    }
    assert.ok(top < 3.9, `${who ? 'Spice' : 'Sugar'} alone stood at ${top.toFixed(2)} (seed ${seed})`);
  }
});

test('his syrup never hurts a nest, and her sparks bounce off it', () => {
  for (const who of [0, 1]) {
    const s = createRun('kitchen', {});
    const nest = s.ents.find((e) => e.type === 'nest' && e.z === 0);
    const p = s.players[who];
    Object.assign(p, { x: nest.x + 4, y: nest.y, fx: -1, fy: 0 });
    for (let k = 0; k < 400; k++) { const inp = [I, I]; inp[who] = { ...I, ability: true }; step(s, inp); s.puddles = []; p.hp = 3; }
    assert.equal(nest.hp, nest.max, `${who ? 'Spice' : 'Sugar'} alone hurt a nest`);
  }
});

test('fuzz: mashing about the kitchen: no NaN, nobody inside a box', () => {
  for (const seed of [1, 2, 3]) {
    const s = createRun('kitchen', {});
    const r = [lcg(seed), lcg(seed + 50)], held = [{}, {}], n = [0, 0];
    for (let t = 0; t < 3000; t++) {
      step(s, [0, 1].map((k) => {
        if (n[k]-- <= 0) { n[k] = 5 + (r[k]() * 40 | 0); held[k] = { up: r[k]() < 0.5, down: r[k]() < 0.2, left: r[k]() < 0.3, right: r[k]() < 0.3, ability: r[k]() < 0.6 }; }
        return { ...I, ...held[k], jumpPressed: r[k]() < 0.05, abilityPressed: r[k]() < 0.05 };
      }));
      for (const p of s.players) {
        for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert.ok(Number.isFinite(p[k]), `${k} NaN`);
        const inside = s.boxes.some((b) => p.x > b[0] + 0.05 && p.x < b[3] - 0.05 && p.y > b[1] + 0.05 && p.y < b[4] - 0.05 && p.z + 0.5 > b[2] + 0.05 && p.z + 0.5 < b[5] - 0.05);
        assert.ok(!inside, `player ${p.id} inside a box at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
      }
    }
  }
});

test('same inputs, same Kitchen (online stays in step)', () => {
  const once = () => { const s = createRun('kitchen', {}); for (let t = 0; t < 3000; t++) step(s, [k3Bot(s, 0), k3Bot(s, 1)]); return fingerprint(s); };
  assert.equal(once(), once());
});
