// Every chapter can be finished by two players who cooperate — and the
// co-op gates really gate (negative controls below).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT } from '../src/sim.js';
import { play, autorun, cx, feet } from './bots.mjs';
import { gardenPhases, toolboxPhases, nightPhases } from './phases.mjs';

const I = NO_INPUT;

test('The Garden can be finished together', () => {
  const s = play(createRun('garden'), gardenPhases());
  assert.ok(s.complete);
  assert.equal(s.players.filter((p) => p.dead).length, 0);
});

test('The Toolbox can be finished together', () => {
  assert.ok(play(createRun('toolbox'), toolboxPhases()).complete);
});

test('The Night can be finished together', () => {
  assert.ok(play(createRun('night'), nightPhases()).complete);
});

// ---- negative controls: one player alone is stopped at each co-op gate

function soloCanReach(chapter, who, tx, steps = 2400) {
  const s = createRun(chapter);
  for (let i = 0; i < steps; i++) {
    const inp = [I, I];
    inp[who] = autorun(s, s.players[who], tx);
    step(s, inp);
    if (cx(s.players[who]) > tx - 0.5) return true;
  }
  return false;
}

test('a lone player cannot pass the first door', () => {
  assert.equal(soloCanReach('garden', 0, 30), false);
  assert.equal(soloCanReach('garden', 1, 30), false);
});

test('a lone player gets to the door (control for the control)', () => {
  assert.equal(soloCanReach('garden', 0, 24), true);
});

test('Sugar alone cannot get past the crates', () => {
  assert.equal(soloCanReach('toolbox', 0, 22), false);
});

test('Night: if Sugar walks off, the stone under Spice goes dark', () => {
  const s = createRun('night');
  const [sg, sp] = s.players;
  // Spice on stone 2 alone, Sugar far away on the ground
  sp.x = 80.5 - sp.w / 2; sp.y = 9 - sp.h;
  sg.x = 70; sg.y = 13 - sg.h;
  for (let i = 0; i < 30; i++) step(s, [I, I]);
  assert.ok(feet(sp) > 9.5, 'Spice should have fallen through the dark stone');
});

test('Night: in Sugar\'s light the same stone holds', () => {
  const s = createRun('night');
  const [sg, sp] = s.players;
  sp.x = 80.5 - sp.w / 2; sp.y = 9 - sp.h;
  sg.x = 81.5 - sg.w / 2; sg.y = 9 - sg.h;
  for (let i = 0; i < 30; i++) step(s, [I, I]);
  assert.ok(Math.abs(feet(sp) - 9) < 0.01);
});
