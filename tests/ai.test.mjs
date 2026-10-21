// The AI partner (for testing alone): it finishes every chapter, gets back on track
// after deaths, keeps up in the Yard, and plays the arcade games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';
import { CHAPTERS } from '../src/levels.js';
import { preloadAI, makeAI, aiInputs } from '../src/ai.js';
import { autorun } from './bots.mjs';

await preloadAI();
const cx = (p) => p.x + p.w / 2;

for (const ch of CHAPTERS) {
  test(`watching: the AI plays both through ${ch.id}`, () => {
    const s = createRun(ch.id);
    const ai = makeAI(s);
    for (let t = 0; t < 40000 && !s.complete; t++) step(s, aiInputs(ai, s, [0, 1]));
    assert.ok(s.complete);
  });
}

for (const id of ['garden', 'night', 'clock', 'attic']) {
  test(`partner: a fall early in a section and a "Back to checkpoint" don't throw it (${id})`, () => {
    // two independent AIs, one per player, as a human plus the AI partner would be
    const s = createRun(id);
    const a = makeAI(s), b = makeAI(s);
    let kills = 0, flagAt = -1, regrouped = false, hitFlag = -2;
    for (let t = 0; t < 60000 && !s.complete; t++) {
      const inp = [aiInputs(a, s, [0])[0], aiInputs(b, s, [1])[1]];
      const since = t - flagAt;
      if (!regrouped && flagAt > 0 && since > 30 && since < 400) { inp[0] = { ...inp[0], regroup: true }; regrouped = true; hitFlag = flagAt; }
      step(s, inp);
      if (s.events.some((e) => e.type === 'checkpoint')) flagAt = t;
      const p = s.players[kills % 2];
      // someone falls just past a flag (at most once per flag)
      if (kills < 3 && flagAt > 0 && hitFlag !== flagAt && since > 60 && since < 400 && !p.dead && p.onGround) { p.y = s.h + 2; kills++; hitFlag = flagAt; }
    }
    assert.ok(kills >= 2, `kills ${kills}`);
    assert.ok(regrouped, 'the regroup happened');
    assert.ok(s.complete && !a.lost && !b.lost, `${id}: complete ${s.complete}`);
  });
}

test('partner: when the plan truly cannot fit, it gives up after two tries and helps instead (no endless loop)', () => {
  // a fall in the middle of the clocktower's ferry puzzle leaves the ferry where the plan doesn't expect it
  const s = createRun('clock');
  const a = makeAI(s), b = makeAI(s);
  let killed = false, regroups = 0;
  for (let t = 0; t < 20000 && !s.complete && !(a.lost || b.lost); t++) {
    const inp = [aiInputs(a, s, [0])[0], aiInputs(b, s, [1])[1]];
    if (inp.some((i) => i.regroup)) regroups++;
    step(s, inp);
    if (!killed && b.route && b.route[b.i]?.name === 'Sugar rides the ferry' && s.players[1].onGround) { s.players[1].y = s.h + 2; killed = true; }
  }
  assert.ok(killed);
  assert.ok(s.complete || a.lost || b.lost, 'either it recovers or it says it lost the plan');
  assert.ok(regroups <= 6, `regrouped ${regroups} times`);
});

test('the Yard: the AI keeps up while you run about', () => {
  const s = createRun('yard', { unlocked: 7 });
  const ai = makeAI(s);
  let close = 0, n = 0;
  for (let t = 0; t < 3000; t++) {
    const tx = t < 1500 ? 58 : 8;
    const inp = aiInputs(ai, s, [1]);
    inp[0] = autorun(s, s.players[0], tx);
    step(s, inp);
    if (t > 200) { n++; if (Math.abs(cx(s.players[0]) - cx(s.players[1])) < 8) close++; }
  }
  assert.ok(close / n > 0.8, `close ${((close / n) * 100).toFixed(0)}% of the time`);
});

test('the Yard: wait by a closet and the AI goes and holds its plate', () => {
  const s = createRun('yard', { unlocked: 7 });
  const [me, it] = s.players;
  me.x = 81 - me.w / 2; me.y = 24 - me.h; it.x = 66 - it.w / 2; it.y = 24 - it.h;
  const ai = makeAI(s);
  let held = false;
  for (let t = 0; t < 900 && !held; t++) { const inp = aiInputs(ai, s, [1]); inp[0] = I; step(s, inp); held = s.pressed[1]; }
  assert.ok(held);
});

for (const [id, ok] of [['bonk', (s) => s.score[1] > 0], ['rain', (s) => s.score[1] > 0], ['potato', () => true]]) {
  test(`arcade: the AI plays ${id}`, () => {
    const s = createRun(id);
    const ai = makeAI(s);
    for (let t = 0; t < 3000 && !s.complete; t++) { const inp = aiInputs(ai, s, [1]); inp[0] = I; step(s, inp); }
    assert.ok(ok(s), JSON.stringify(s.score));
  });
}
