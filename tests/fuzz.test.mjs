// Seeded button-mashing on every chapter and mini-game. Invariants: no throw, no
// NaN, nobody stuck inside a solid tile while alive, same seed -> same world, and
// Back to checkpoint always leaves both players alive and free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, solidTile, NO_INPUT } from '../src/sim.js';
import { CHAPTERS, MINIGAMES } from '../src/levels.js';
import { fingerprint } from '../src/lockstep.js';

function rng(seed) { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; }
function mash(rand) {
  // held directions change slowly, buttons are tapped: closer to real hands than white noise
  let held = { left: false, right: false, down: false, jump: false, ability: false }, hold = 0;
  return () => {
    if (hold-- <= 0) { hold = 5 + Math.floor(rand() * 40); const d = rand(); held = { left: d < 0.3, right: d > 0.55, down: rand() < 0.1, jump: rand() < 0.4, ability: rand() < 0.3 }; }
    return { ...NO_INPUT, ...held, jumpPressed: held.jump && rand() < 0.15, abilityPressed: rand() < 0.04 };
  };
}
function inside(s, p) {
  const EPS = 0.02;
  for (let cy = Math.floor(p.y + EPS); cy <= Math.floor(p.y + p.h - EPS); cy++)
    for (let cx = Math.floor(p.x + EPS); cx <= Math.floor(p.x + p.w - EPS); cx++)
      if (solidTile(s, cx, cy) && !'AD'.includes(s.grid[cy]?.[cx]) && !(s.grid[cy]?.[cx] >= 'A' && s.grid[cy]?.[cx] <= 'D')) return `${cx},${cy}`;
  return null;
}
function play(id, seed, steps) {
  const s = createRun(id, { gentle: seed % 2 === 0 });
  const rand = rng(seed), a = mash(rng(seed * 7 + 1)), b = mash(rng(seed * 13 + 5));
  let stuckFor = [0, 0];
  for (let i = 0; i < steps && !s.complete; i++) {
    // now and then, as if a player chose "Back to checkpoint"
    const regroup = rand() < 0.002;
    step(s, [{ ...a(), regroup }, b()]);
    for (const p of s.players) {
      for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(p[k]), `${id} seed ${seed} step ${i}: ${k} = ${p[k]}`);
      const c = !p.dead && inside(s, p);
      stuckFor[p.id] = c ? stuckFor[p.id] + 1 : 0;
      assert.ok(stuckFor[p.id] < 30, `${id} seed ${seed} step ${i}: player ${p.id} inside solid tile ${c} for 30 steps`);
    }
    if (regroup && s.mode === 'chapter') {
      for (const p of s.players) assert.ok(!p.dead, `${id} seed ${seed}: regroup left a player dead`);
    }
  }
  return s;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
for (const ch of [...CHAPTERS, ...MINIGAMES]) {
  test(`fuzz: ${ch.id}`, () => {
    for (const seed of SEEDS) play(ch.id, seed, 6000);
  });
}

test('fuzz: same seed, same world', () => {
  for (const id of ['clock', 'home', 'potato']) assert.equal(fingerprint(play(id, 9, 2000)), fingerprint(play(id, 9, 2000)), id);
});
