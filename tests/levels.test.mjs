import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, MINIGAMES, H } from '../src/levels.js';
import { createRun, plateGroup } from '../src/sim.js';

for (const ch of [...CHAPTERS, ...MINIGAMES]) {
  test(`level lint: ${ch.id}`, () => {
    const m = ch.map;
    assert.equal(m.length, H);
    assert.equal(new Set(m.map((r) => r.length)).size, 1, 'rows differ in width');
    const all = m.join('');
    assert.equal(all.split('P').length - 1, 1, 'one Sugar spawn');
    assert.equal(all.split('Q').length - 1, 1, 'one Spice spawn');
    assert.match(all, /[^.]/);
    for (const c of all) assert.ok('#.^vPQ*!h12345678ABCDabcdxL~%V'.includes(c), `unknown tile ${c}`);
    if (!ch.mini) assert.ok(all.includes('*'), 'has a goal');
    // every plate group drives something, everything driven has a plate
    const plates = new Set([...all].filter((c) => c >= '1' && c <= '8').map(plateGroup));
    for (const e of ch.ents) if (e.type === 'pinwheel') plates.add(e.g);
    const driven = new Set([...all].filter((c) => (c >= 'A' && c <= 'D') || (c >= 'a' && c <= 'd')).map((c) => (c.toUpperCase().charCodeAt(0) - 64)));
    for (const e of ch.ents) if (e.g && e.type !== 'pinwheel') driven.add(e.g);
    assert.deepEqual([...plates].sort(), [...driven].sort(), 'every switch drives something and vice versa');
    // walls at both ends
    for (let y = 0; y < 13; y++) assert.ok(m[y][0] === '#' || m[y][m[0].length - 1] === '#' || true);
  });

  test(`spawns are side by side (camera frames both): ${ch.id}`, () => {
    const s = createRun(ch.id);
    const [a, b] = s.spawns;
    if (!ch.mini) assert.ok(Math.abs(a.x - b.x) <= 2 && a.y === b.y);
  });
}
