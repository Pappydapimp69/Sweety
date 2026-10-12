// Two lockstep peers over a fake network with latency, jitter and reordering-free
// delivery (WebRTC data channels are reliable and ordered). The two sims must stay
// identical, and a forced divergence must be healed by the host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, NO_INPUT } from '../src/sim.js';
import { createLockstep, scheduleLocal, receive, advance, fingerprint, packInput, unpackInput, HASH_EVERY } from '../src/lockstep.js';
import { gardenPhases } from './phases.mjs';

function pair({ latency = 6, jitter = 4, seed = 1 } = {}) {
  let t = 0, r = seed;
  const rnd = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; };
  const queues = [[], []];   // messages in flight TO peer i: { at, msg }
  const lastAt = [0, 0];
  const mk = (me) => (msg) => {
    const at = Math.max(lastAt[1 - me], t + latency + Math.floor(rnd() * jitter));   // ordered
    lastAt[1 - me] = at;
    queues[1 - me].push({ at, msg: JSON.parse(JSON.stringify(msg)) });
  };
  const host = createLockstep({ local: 0, host: true, send: mk(0) });
  const guest = createLockstep({ local: 1, host: false, send: mk(1) });
  const runs = [createRun('garden'), createRun('garden')];
  const peers = [host, guest];
  return {
    peers, runs,
    // one frame: deliver due messages, schedule local inputs, advance
    frame(localInputs) {
      t++;
      for (const i of [0, 1]) {
        const due = queues[i].filter((q) => q.at <= t);
        queues[i] = queues[i].filter((q) => q.at > t);
        for (const q of due) receive(peers[i], q.msg, runs[i]);
      }
      for (const i of [0, 1]) {
        scheduleLocal(peers[i], localInputs[i]);
        runs[i] = advance(peers[i], runs[i], 5).run;
      }
    },
  };
}

test('input packing round-trips', () => {
  const i = { ...NO_INPUT, right: true, jumpPressed: true, ability: true };
  assert.deepEqual(unpackInput(packInput(i)), { ...NO_INPUT, right: true, jumpPressed: true, ability: true });
});

// Record a full offline play-through's inputs, then replay them through two
// networked peers: online must reach the identical end state, tick for tick.
import { step } from '../src/sim.js';
import { homePhases } from './phases.mjs';
import { chapterById } from '../src/levels.js';
import { DELAY } from '../src/lockstep.js';
function record(id, phases) {
  const s = createRun(id), tape = [];
  for (let k = 0; k < DELAY; k++) { step(s, [NO_INPUT, NO_INPUT]); tape.push([NO_INPUT, NO_INPUT]); }
  for (const ph of phases) {
    let n = 0;
    while (!ph.done(s)) { const inp = ph.ctrl(s).map((x) => ({ ...NO_INPUT, ...x })); tape.push(inp); step(s, inp); if (++n > 3000) throw new Error(ph.name); }
  }
  return { tape, end: fingerprint(s) };
}
for (const [id, ph] of [['garden', gardenPhases], ['home', () => homePhases(chapterById('home'))]]) {
  test(`online replay of a whole chapter (${id}) ends identical to offline`, () => {
    const { tape, end } = record(id, ph());
    const net = pair({ latency: 7, jitter: 9 });
    net.runs[0] = createRun(id); net.runs[1] = createRun(id);
    const cursor = [DELAY, DELAY];
    for (let f = 0; f < tape.length * 3 && !(net.runs[0].complete && net.runs[1].complete); f++) {
      const local = [0, 1].map((i) => (cursor[i] < tape.length ? tape[cursor[i]][i] : NO_INPUT));
      const before = net.peers.map((p) => p.scheduled);
      net.frame(local);
      net.peers.forEach((p, i) => { if (p.scheduled > before[i]) cursor[i]++; });
    }
    assert.ok(net.runs[0].complete && net.runs[1].complete, 'both finished online');
    assert.equal(fingerprint(net.runs[0]), end, 'host matches the offline run');
    assert.equal(fingerprint(net.runs[1]), end, 'guest matches the offline run');
    assert.equal(net.peers[0].resyncs + net.peers[1].resyncs, 0);
  });
}

test('a forced divergence is detected and healed by the host', () => {
  const net = pair({ latency: 3, jitter: 2 });
  const walk = { ...NO_INPUT, right: true };
  for (let f = 0; f < 60; f++) net.frame([walk, walk]);
  net.runs[1].hearts += 1;   // the guest's world drifts in a way physics can't undo
  for (let f = 0; f < HASH_EVERY * 3; f++) net.frame([walk, NO_INPUT]);
  assert.ok(net.peers[0].resyncs >= 1, 'host noticed');
  // let both settle on the same tick, then compare
  for (let f = 0; f < 30; f++) net.frame([NO_INPUT, NO_INPUT]);
  const [a, b] = net.peers;
  assert.equal(a.tick, b.tick);
  assert.equal(fingerprint(net.runs[0]), fingerprint(net.runs[1]));
});

test('negative control: without the hash check a divergence stays', () => {
  const net = pair({ latency: 3, jitter: 2 });
  for (const p of net.peers) p.send = ((orig) => (m) => { if (m.t !== 'hash') orig(m); })(p.send);
  const walk = { ...NO_INPUT, right: true };
  for (let f = 0; f < 60; f++) net.frame([walk, walk]);
  net.runs[1].hearts += 1;
  for (let f = 0; f < HASH_EVERY * 3; f++) net.frame([walk, NO_INPUT]);
  for (let f = 0; f < 30; f++) net.frame([NO_INPUT, NO_INPUT]);
  assert.notEqual(fingerprint(net.runs[0]), fingerprint(net.runs[1]));
});

test('a peer that stops sending stalls the other (no one runs ahead alone)', () => {
  const net = pair({ latency: 2, jitter: 0 });
  for (let f = 0; f < 30; f++) net.frame([NO_INPUT, NO_INPUT]);
  const before = net.peers[0].tick;
  net.peers[1].scheduled = Infinity;      // guest stops scheduling (paused / tab hidden)
  const orig = net.peers[1].send;
  net.peers[1].send = () => {};
  for (let f = 0; f < 60; f++) net.frame([NO_INPUT, NO_INPUT]);
  assert.ok(net.peers[0].tick - before <= 12, `host ran ${net.peers[0].tick - before} ticks alone`);
  net.peers[1].send = orig;
});
