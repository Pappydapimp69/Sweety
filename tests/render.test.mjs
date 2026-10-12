// The renderer only reads: drawing every chapter at every phase of a play-through
// leaves the sim state byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../src/sim.js';
import { drawWorld, makeCamera, snapCamera } from '../src/render.js';
import { CHAPTERS } from '../src/levels.js';
import { gardenPhases, toolboxPhases, nightPhases } from './phases.mjs';

// a 2D context that accepts every call and every property
function fakeCtx() {
  const fn = () => fakeGradient;
  const fakeGradient = { addColorStop() {} };
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : fn),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return fakeCtx(); } };

const PHASES = { garden: gardenPhases, toolbox: toolboxPhases, night: nightPhases };

for (const ch of CHAPTERS) {
  test(`render never writes sim state: ${ch.id}`, () => {
    const s = createRun(ch.id);
    const cam = makeCamera(s);
    const ctx = fakeCtx();
    let checks = 0;
    for (const ph of PHASES[ch.id]()) {
      let n = 0;
      while (!ph.done(s) && n++ < 2000) {
        step(s, ph.ctrl(s));
        if (n % 20 === 0) {
          const before = JSON.stringify(s);
          snapCamera(cam, s, 1280, 720);
          drawWorld(ctx, s, cam, 1280, 720, [], ch.theme);
          assert.equal(JSON.stringify(s), before, `render mutated state in "${ph.name}"`);
          checks++;
        }
      }
    }
    assert.ok(s.complete && checks > 10);
  });
}

test('negative control: a renderer that writes IS caught', () => {
  const s = createRun('garden');
  const before = JSON.stringify(s);
  s.players[0].x += 0.001;   // what a stray `=` in render would do
  assert.notEqual(JSON.stringify(s), before);
});
