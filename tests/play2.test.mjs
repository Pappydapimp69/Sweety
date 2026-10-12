import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/sim.js';
import { play } from './bots.mjs';
import { atticPhases, skyPhases, clockPhases } from './phases.mjs';

for (const [id, ph] of [['attic', atticPhases], ['sky', skyPhases], ['clock', clockPhases]]) {
  test(`${id} can be finished together`, () => {
    const s = play(createRun(id), ph());
    assert.ok(s.complete);
  });
}

import { homePhases } from './phases.mjs';
import { chapterById } from '../src/levels.js';
test('home (the finale) can be finished together', () => {
  const s = play(createRun('home'), homePhases(chapterById('home')));
  assert.ok(s.complete);
});

// ---- negative controls: the new gates need both
import { step, NO_INPUT as I } from '../src/sim.js';
import { autorun, walk } from './bots.mjs';
const cxp = (p) => p.x + p.w / 2;

test('attic: Sugar alone cannot cross the spike floor', () => {
  const s = createRun('attic');
  let best = 0;
  for (let i = 0; i < 1500; i++) { step(s, [autorun(s, s.players[0], 30), I]); best = Math.max(best, s.players[0].dead ? 0 : cxp(s.players[0])); }
  assert.ok(best < 20, `reached ${best}`);
});

test('sky: Spice gliding alone falls short of the far side; with the gust he makes it', () => {
  for (const gust of [false, true]) {
    const s = createRun('sky');
    const [a, b] = s.players;
    a.x = 9 - a.w / 2; b.x = 10.4 - b.w / 2; a.facing = 1;
    let landed = false;
    for (let i = 0; i < 400; i++) {
      step(s, [{ ...I, abilityPressed: gust && i === 3 }, { ...I, right: true, jump: true, jumpPressed: i === 0 }]);
      if (b.onGround && cxp(b) > 25.6) { landed = true; break; }
      if (b.dead || b.y > 14) break;
    }
    assert.equal(landed, gust, gust ? 'gust should carry him' : 'solo should fall');
  }
});

test('sky: Sugar alone cannot cross the cloud gap (cloud needs Spice on the plate)', () => {
  const s = createRun('sky');
  let best = 0;
  for (let i = 0; i < 1500; i++) { step(s, [autorun(s, s.players[0], 30), I]); if (!s.players[0].dead) best = Math.max(best, cxp(s.players[0])); }
  assert.ok(best < 25, `reached ${best}`);
});

test('clock: Sugar alone cannot get past the glass', () => {
  const s = createRun('clock');
  s.ents.filter((e) => e.type === 'saw').forEach((e) => { e.path = [[e.x, 10.55], [e.x, 10.56]]; });   // even with the saws held up
  let best = 0;
  for (let i = 0; i < 1500; i++) { step(s, [autorun(s, s.players[0], 30), I]); if (!s.players[0].dead) best = Math.max(best, cxp(s.players[0])); }
  assert.ok(best < 24.5, `reached ${best}`);
});

test('clock: Spice cannot walk the saw corridor unless Sugar stops time', () => {
  for (const freeze of [false, true]) {
    const s = createRun('clock');
    const [a, b] = s.players;
    b.x = 10.4 - b.w / 2; a.x = 8.6 - a.w / 2;
    let through = false, died = false;
    for (let i = 0; i < 900 && !through && !died; i++) {
      const up = s.ents.filter((e) => e.type === 'saw' && e.x < 24).every((e) => e.y < 10.7);
      const hold = freeze && (s.frozen || up);
      step(s, [{ ...I, ability: hold }, freeze ? (s.frozen ? walk(b, 23.3) : I) : walk(b, 23.3)]);
      died = b.dead; through = cxp(b) > 23;
    }
    assert.equal(through, freeze, freeze ? 'with Sugar holding time' : 'alone he gets cut');
  }
});
