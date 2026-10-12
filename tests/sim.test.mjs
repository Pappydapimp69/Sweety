import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { readFileSync } from 'node:fs';
import { gardenPhases } from './phases.mjs';
import { play } from './bots.mjs';

test('same inputs, same world (deterministic)', () => {
  const a = play(createRun('garden'), gardenPhases());
  const b = play(createRun('garden'), gardenPhases());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('sim stays pure: no Math.random, Date, DOM or storage', () => {
  const src = readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of ['Math.random', 'Date.now', 'performance.now', 'document.', 'window.', 'localStorage', 'Math.sin', 'Math.cos', 'Math.tan', 'Math.exp', 'Math.log', 'Math.pow', 'Math.hypot', 'Math.atan', '**'])
    assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
});

test('only save.js touches localStorage, keys namespaced sweety:', () => {
  for (const f of ['main.js', 'render.js', 'input.js', 'audio.js', 'levels.js', 'config.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('localStorage'), `${f} touches localStorage`);
  }
  assert.match(readFileSync(new URL('../src/save.js', import.meta.url), 'utf8'), /'sweety:/);
});

test('a jump clears 3 tiles but not 4; a stack clears 4', () => {
  const s = createRun('garden');
  const p = s.players[0];
  let minFeet = Infinity;
  for (let i = 0; i < 60; i++) { step(s, [{ ...I, jump: true, jumpPressed: i === 0 }, I]); minFeet = Math.min(minFeet, p.y + p.h); }
  const rise = 13 - minFeet;
  assert.ok(rise > 3 && rise < 4, `rise ${rise}`);
});

test('spikes kill, then you respawn by the checkpoint', () => {
  const s = createRun('garden');
  const p = s.players[0];
  s.checkpoint = { x: 50, y: 12 };
  p.x = 15 - p.w / 2; p.y = 12;   // drop onto the spikes
  let died = false;
  for (let i = 0; i < 120; i++) { step(s, [I, I]); if (p.dead) died = true; }
  assert.ok(died);
  assert.ok(!p.dead && Math.abs(p.x + p.w / 2 - 50.05) < 0.1);
});

test('a door never closes on someone standing in it', () => {
  const s = createRun('garden');
  const [a, b] = s.players;
  a.x = 21.5 - a.w / 2; a.y = 13 - a.h;   // on plate 1
  b.x = 25.5 - b.w / 2; b.y = 13 - b.h;   // in door A
  step(s, [I, I]);
  a.x = 18;                                 // Sugar steps off
  for (let i = 0; i < 10; i++) step(s, [I, I]);
  assert.ok(!b.dead);
  // Spice can walk out either side
  for (let i = 0; i < 60; i++) step(s, [I, { ...I, right: true }]);
  assert.ok(b.x > 26);
});

test('leash: you cannot run more than LEASH_X apart', () => {
  const s = createRun('garden');
  for (let i = 0; i < 600; i++) step(s, [{ ...I, left: true }, { ...I, right: true, jump: true, jumpPressed: s.players[1].onGround }]);
  const gap = Math.abs(s.players[1].x - s.players[0].x);
  assert.ok(gap <= 22.6, `gap ${gap}`);
});

test('pins hold Spice but not Sugar', () => {
  for (const who of [0, 1]) {
    const s = createRun('toolbox');
    s.pins.push({ x: 37, y: 10.5 });
    const p = s.players[who];
    p.x = 37.1; p.y = 9;
    for (let i = 0; i < 40; i++) step(s, [I, I]);
    if (who === 1) assert.ok(Math.abs(p.y + p.h - 10.5) < 0.01, 'Spice stands on the pin');
    else assert.ok(p.y + p.h > 12, 'Sugar falls through');
  }
});

test('bonk: landing on a head scores, standing does not', () => {
  const s = createRun('bonk');
  const [a, b] = s.players;
  b.x = 15; b.y = 13 - b.h;
  a.x = 15; a.y = 7;
  for (let i = 0; i < 60; i++) step(s, [I, I]);
  assert.equal(s.score[0], 1);
});
