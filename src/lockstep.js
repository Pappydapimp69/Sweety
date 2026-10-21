// Online play: deterministic lockstep over a reliable ordered channel.
// Both machines run the same sim; each sends only its own player's inputs, tagged
// with the tick they apply to, DELAY ticks ahead. A tick runs once both inputs for
// it are known. Every HASH_EVERY ticks the two compare a fingerprint of the state;
// on a mismatch the host's state wins. Pure: no DOM, no network (net.js carries it).
import { NO_INPUT, step } from './sim.js';

export const DELAY = 4;           // ticks of input delay (~67 ms) that hides latency
export const HASH_EVERY = 120;
export const KEEP = 900;          // input history kept for re-simulating after a resync

const BITS = ['left', 'right', 'down', 'jump', 'ability', 'jumpPressed', 'abilityPressed', 'regroup', 'up', 'camL', 'camR'];   // up: the top-down world; camL/camR: turning a 3D camera
export const packInput = (i) => BITS.reduce((m, k, b) => m | (i[k] ? 1 << b : 0), 0);
export function unpackInput(m) {
  const o = {};
  BITS.forEach((k, b) => { o[k] = !!(m & (1 << b)); });
  return o;
}

// FNV-1a over the state's JSON (events are per-step scratch, not state).
export function fingerprint(s) {
  const str = JSON.stringify(s, (k, v) => (k === 'events' ? undefined : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export function createLockstep({ local, host, send }) {
  const ls = {
    local, host, send,
    tick: 0,              // the next sim tick to run (== run.tick)
    scheduled: 0,         // local inputs are known for ticks < scheduled
    inputs: [new Map(), new Map()],
    hashes: new Map(),    // tick -> our hash
    theirHashes: new Map(),
    stalledFor: 0,
    resyncs: 0,
    pendingState: null,
  };
  for (let t = 0; t < DELAY; t++) { ls.inputs[0].set(t, 0); ls.inputs[1].set(t, 0); }
  ls.scheduled = DELAY;
  return ls;
}

// Sample the local device for the next tick that has no input yet (at most DELAY ahead).
export function scheduleLocal(ls, input) {
  if (ls.scheduled >= ls.tick + DELAY * 2) return false;   // far enough ahead; keep the latch for later
  const m = packInput(input);
  ls.inputs[ls.local].set(ls.scheduled, m);
  ls.send({ t: 'in', k: ls.scheduled, m });
  ls.scheduled++;
  return true;
}

export function receive(ls, msg, run) {
  if (msg.t === 'in') ls.inputs[1 - ls.local].set(msg.k, msg.m);
  else if (msg.t === 'hash') {
    ls.theirHashes.set(msg.k, msg.h);
    checkHash(ls, msg.k, run);
  } else if (msg.t === 'state' && !ls.host) ls.pendingState = msg;
}

function checkHash(ls, k, run) {
  const mine = ls.hashes.get(k), theirs = ls.theirHashes.get(k);
  if (mine === undefined || theirs === undefined) return;
  ls.hashes.delete(k); ls.theirHashes.delete(k);
  if (mine !== theirs && ls.host) {
    // the host's word is final: send the state as it stands now, with its tick
    ls.send({ t: 'state', k: ls.tick, s: JSON.stringify(run) });
    ls.resyncs++;
  }
}

export const ready = (ls) => ls.inputs[0].has(ls.tick) && ls.inputs[1].has(ls.tick);

// Run every tick both inputs are known for (up to `max`). Returns the steps taken
// and the run (replaced if the host sent a resync).
export function advance(ls, run, max, onStep) {
  if (ls.pendingState) run = adopt(ls, run, ls.pendingState, onStep);
  let n = 0;
  while (n < max && ready(ls)) {
    const inputs = [0, 1].map((p) => unpackInput(ls.inputs[p].get(ls.tick)));
    step(run, inputs);
    if (onStep) onStep(run);
    ls.inputs[0].delete(ls.tick - KEEP); ls.inputs[1].delete(ls.tick - KEEP);
    ls.tick++; n++;
    if (ls.tick % HASH_EVERY === 0) {
      const h = fingerprint(run);
      ls.hashes.set(ls.tick, h);
      ls.send({ t: 'hash', k: ls.tick, h });
      checkHash(ls, ls.tick, run);
    }
  }
  return { n, run };
}

// Guest: take the host's state for tick k, then re-run any ticks we had already
// passed using the inputs we still hold, so we land on our own current tick.
function adopt(ls, run, msg, onStep) {
  ls.pendingState = null;
  const target = ls.tick;
  const fresh = JSON.parse(msg.s);
  ls.tick = msg.k;
  ls.resyncs++;
  while (ls.tick < target && ready(ls)) {
    step(fresh, [0, 1].map((p) => unpackInput(ls.inputs[p].get(ls.tick))));
    if (onStep) onStep(fresh);
    ls.tick++;
  }
  return fresh;
}

export { NO_INPUT };
