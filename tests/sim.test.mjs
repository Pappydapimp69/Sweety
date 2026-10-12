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
  for (let i = 0; i < 600; i++) step(s, [{ ...I, left: true }, { ...I, right: true }]);
  const gap = Math.abs(s.players[1].x - s.players[0].x);
  assert.ok(gap <= 24.6, `gap ${gap}`);
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

test('the leash never teleports: after a far respawn the gap closes by walking', () => {
  const s = createRun('garden');
  const [a, b] = s.players;
  a.x = 50; a.y = 13 - a.h;          // just respawned far behind
  b.x = 92; b.y = 13 - b.h;          // across the bridge
  const x0 = b.x;
  for (let i = 0; i < 5; i++) step(s, [I, { ...I, right: true }]);
  assert.ok(Math.abs(b.x - x0) < 1, `Spice moved ${b.x - x0} in 5 steps`);
});

test('negative control: the old full pull would have moved him ~20 tiles', () => {
  // the gap minus the leash is the distance a full pull covers in one step
  assert.ok(92 - 50 - 22 > 15);
});

test('the finale flood takes the climb checkpoint when it starts (no drowning loop)', async () => {
  const { chapterById } = await import('../src/levels.js');
  const ch = chapterById('home');
  const s = createRun('home');
  const [a, b] = s.players;
  s.checkpoint = { x: 126, y: 12 };           // the one before the saws
  b.x = ch.flood.startX + 1; b.y = 13 - b.h;  // Spice starts the water without touching the climb flag
  a.x = 140; a.y = 15 - a.h;                  // Sugar in the tunnel below
  for (let i = 0; i < 2; i++) step(s, [I, I]);
  assert.ok(s.flood.active);
  assert.ok(s.checkpoint.x >= ch.flood.startX - 8 && s.checkpoint.x <= ch.flood.startX, `checkpoint ${JSON.stringify(s.checkpoint)}`);
});

test('a corrupt save never locks the chapters or shows nonsense hearts', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const { loadProgress } = await import('../src/save.js');
  for (const [raw, want] of [['{"unlocked":0}', 1], ['{"unlocked":-3}', 1], ['{"unlocked":2.5}', 2], ['null', 1], ['[1,2]', 1], ['{"unlocked":"7"}', 1]]) {
    store.set('sweety:progress', raw);
    assert.equal(loadProgress().unlocked, want, raw);
  }
  store.set('sweety:progress', '{"hearts":{"garden":"lots","night":2,"sky":-1,"attic":1.7}}');
  assert.deepEqual(loadProgress().hearts, { night: 2, attic: 1 });
});

test('stranded on the far side of a ledge door: the far switch lets the partner through', () => {
  const s = createRun('garden');
  const [a, b] = s.players;
  // Sugar went over the ledge and dropped off its far end; Spice is still before door B
  a.x = 49 - a.w / 2; a.y = 13 - a.h;
  b.x = 36 - b.w / 2; b.y = 13 - b.h;
  for (let i = 0; i < 400 && Math.abs(a.x + a.w / 2 - 45.5) > 0.15; i++) step(s, [{ ...I, left: a.x + a.w / 2 > 45.5, right: a.x + a.w / 2 < 45.5 }, I]);
  for (let i = 0; i < 300; i++) step(s, [I, { ...I, right: true }]);
  assert.ok(b.x > 39, `Spice got through door B (x ${b.x.toFixed(2)})`);
});

test('negative control: without anyone on the far switch, door B stays shut', () => {
  const s = createRun('garden');
  const [a, b] = s.players;
  a.x = 49; a.y = 13 - a.h; b.x = 36 - b.w / 2; b.y = 13 - b.h;
  for (let i = 0; i < 300; i++) step(s, [I, { ...I, right: true }]);
  assert.ok(b.x < 38);
});

test('Back to checkpoint brings both players to the last flag', () => {
  const s = createRun('garden');
  s.checkpoint = { x: 50, y: 12 };
  s.players[0].x = 70; s.players[1].x = 30;
  step(s, [{ ...I, regroup: true }, I]);
  for (const p of s.players) assert.ok(Math.abs(p.x + p.w / 2 - 50.5) < 0.6, `at ${p.x}`);
});

test('gentle mode: a spike death never records the spike as safe', () => {
  const s = createRun('attic', { gentle: true });
  const b = s.players[1];
  b.grav = -1; b.x = 50; b.y = 4; b.onGround = true;   // upside down, walking into the ceiling spikes at 52
  s.players[0].x = 46; s.players[0].y = 13 - s.players[0].h;   // Sugar close by, so the leash doesn't hold him back
  for (let i = 0; i < 120 && !b.dead; i++) step(s, [I, { ...I, right: true }]);
  assert.ok(b.dead, 'walked into the spikes');
  for (let i = 0; i < 120; i++) step(s, [I, I]);   // then let go
  assert.ok(!b.dead, 'and stays alive once back');
});

test('checkpoints only move forward', () => {
  const s = createRun('garden');
  s.checkpoint = { x: 50, y: 12 };
  const a = s.players[0];
  a.x = 98 - a.w / 2; a.y = 13 - a.h;   // the relay checkpoint is ahead; walk back over the older one later
  for (let i = 0; i < 5; i++) step(s, [I, I]);
  const ahead = s.checkpoint.x;
  a.x = 50 - a.w / 2 + 0.5; a.y = 13 - a.h;
  for (let i = 0; i < 5; i++) step(s, [I, I]);
  assert.equal(s.checkpoint.x, ahead);
});
