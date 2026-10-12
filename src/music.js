// Sweety's music: one synthesised track per chapter mood, built from two
// leitmotifs. Sugar (bright, leaping, pulse lead) and Spice (low, stepwise,
// warm triangle). Every track lives in ONE parent pitch family (the white keys)
// and changes MODE, not key, so a chapter change sounds like a turn in the
// story rather than a restart: garden C Ionian, night D Dorian, attic
// G Mixolydian, sky F Lydian, clock A Aeolian.
//
// Two halves:
//  - PURE: TRACKS (data) + scheduleTrack(track, fromBeat, toBeat) -> note events.
//    No AudioContext, no randomness; tests read these.
//  - RUNTIME: playMusic / stopMusic. A look-ahead scheduler (25 ms tick, ~0.2 s
//    horizon on the AudioContext clock) turns events into oscillators. Never
//    per-note setTimeout, never awaits resume(), never throws into the game.
import { audioCtx, musicOut, onAudioReady } from './audio.js';

// ---------------------------------------------------------------- theory
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
// The note that makes each mode sound like itself (pitch class above tonic).
export const CHARACTERISTIC = { ionian: 11, dorian: 9, lydian: 6, mixolydian: 10, aeolian: 8 };

// Scale degree (0 = tonic, 7 = octave, may be negative) -> MIDI note.
export function degreeToMidi(mode, tonic, deg) {
  const s = MODES[mode];
  const o = Math.floor(deg / 7);
  return tonic + 12 * o + s[deg - 7 * o];
}
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- leitmotifs
// [scale degree | null (rest), beats]. Both are two bars of 4/4.
// Sugar: sol-la-DO-la-DO-MI | re-do-la-sol-la  (a leap up, a bright arc).
// Spice: do-mi-sol-fa | mi-re-do              (low, stepwise, comes home).
export const MOTIFS = {
  sugar: [[4, .5], [5, .5], [7, 1], [5, .5], [7, .5], [9, 1], [8, .5], [7, .5], [5, .5], [4, .5], [5, 2]],
  spice: [[0, 1], [2, 1], [4, 1.5], [3, .5], [2, 1], [1, 1], [0, 2]],
};

// The transformation toolkit: augment/diminish (aug), fragment (frag),
// invert (inv, "upside-down"), shift by scale steps (shift), octave (oct),
// staccato (stac: fraction of each note actually sounded). Mode-flip happens
// for free: the same degrees land in whatever mode the track declares.
export function transform(motif, { aug = 1, frag = 0, inv = false, shift = 0, oct = 0 } = {}) {
  let m = frag ? motif.slice(0, frag) : motif.slice();
  const pivot = m.find((n) => n[0] !== null)?.[0] ?? 0;
  return m.map(([d, b]) => [d === null ? null : (inv ? 2 * pivot - d : d) + shift + 7 * oct, b * aug]);
}

// ---------------------------------------------------------------- tracks
// progression: one chord root (scale degree) per bar; chords are diatonic
// triads. bass/pad: [beat-in-bar, chord tone (0 root,1 third,2 fifth,3 oct), dur].
// arp: {step, seq, dur}. drums: 16-step strings per bar (x = hit, o = soft).
// melody: phrases {at: bar, motif|notes, voice, ops}. layers: optional
// {voice: [fromBar, toBar)} gates (used by home to build).
const P = (deg, n) => [deg, n];
export const TRACKS = {
  title: {
    name: 'Main theme', mode: 'ionian', tonic: 60, tempo: 92, bars: 8, level: 0.9,
    progression: [0, 5, 3, 4, 0, 5, 1, 4],
    bass: [[0, 0, 1.5], [2, 2, 1], [3, 3, 1]],
    pad: [[0, 3]],
    arp: { step: 1, seq: [0, 1, 2, 1], dur: .5 },
    drums: { kick: 'x.......x.......', hat: '....o.......o...' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead' },
      { at: 2, motif: 'spice', voice: 'counter' },
      { at: 4, motif: 'sugar', voice: 'lead', ops: { shift: -1 } },
      { at: 6, motif: 'spice', voice: 'counter', ops: { frag: 4 } },
      { at: 6, motif: 'sugar', voice: 'lead', ops: { frag: 6, shift: -2 } },
      { at: 7, notes: [P(4, 2), P(null, 2)], voice: 'lead', ops: { at: 2 } },
    ],
  },
  garden: {
    name: 'Sunny garden', mode: 'ionian', tonic: 60, tempo: 120, bars: 8, level: 0.85,
    progression: [0, 3, 0, 4, 0, 3, 1, 4],
    bass: [[0, 0, .5], [1, 2, .5], [2, 3, .5], [3, 2, .5]],
    pad: [[.5, .4], [1.5, .4], [2.5, .4], [3.5, .4]],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..o...o...o...o.' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead' },
      { at: 2, motif: 'sugar', voice: 'lead', ops: { shift: 1, frag: 6 } },
      { at: 3, notes: [P(6, .5), P(5, .5), P(4, 1), P(null, 2)], voice: 'lead' },
      { at: 4, motif: 'sugar', voice: 'lead', ops: { frag: 6 } },
      { at: 5, notes: [P(7, 1), P(6, .5), P(5, .5), P(4, 2)], voice: 'lead' },
      { at: 6, motif: 'spice', voice: 'counter', ops: { aug: .5, oct: 1 } },
      { at: 7, notes: [P(4, .5), P(6, .5), P(8, 1), P(7, 2)], voice: 'lead' },
    ],
  },
  toolbox: {
    name: 'Workshop', mode: 'ionian', tonic: 60, tempo: 132, bars: 8, level: 0.8,
    progression: [0, 0, 5, 5, 3, 3, 4, 4],
    bass: [[0, 0, .4], [1, 0, .4], [2, 2, .4], [3, 0, .4]],
    arp: { step: .25, seq: [0, 2, 1, 2, 3, 2, 1, 2], dur: .15 },
    drums: { kick: 'x...x...x...x...', snare: '....o.......o..o', tick: 'x.x.x.x.x.x.x.x.' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead', ops: { frag: 3, stac: .5 } },
      { at: 1, motif: 'sugar', voice: 'lead', ops: { frag: 3, stac: .5, shift: 1 } },
      { at: 2, motif: 'sugar', voice: 'lead', ops: { frag: 6, stac: .5 } },
      { at: 4, motif: 'spice', voice: 'counter', ops: { aug: .5, stac: .6 } },
      { at: 5, motif: 'spice', voice: 'counter', ops: { aug: .5, stac: .6, shift: 2 } },
      { at: 6, motif: 'sugar', voice: 'lead', ops: { frag: 6, stac: .5, shift: -1 } },
    ],
  },
  night: {
    name: 'Hushed night', mode: 'dorian', tonic: 62, tempo: 70, bars: 8, level: 0.85,
    instr: { lead: 'sine', counter: 'sine' },
    progression: [0, 3, 0, 3, 6, 3, 4, 0],   // i-IV: the Dorian major IV holds its B
    bass: [[0, 0, 3.5]],
    pad: [[0, 3]],
    arp: { step: 1, seq: [2, 1, 3, 1], dur: .9 },
    melody: [
      { at: 0, motif: 'spice', voice: 'counter', ops: { aug: 2 } },          // augmented, 4 bars
      { at: 4, motif: 'sugar', voice: 'lead', ops: { frag: 6, shift: -2 } }, // a fragment, flipped to Dorian
      { at: 5, notes: [P(5, 1), P(4, 1), P(2, 2)], voice: 'lead' },
      { at: 6, motif: 'sugar', voice: 'lead', ops: { frag: 3, shift: -2, aug: 2 } },
    ],
  },
  attic: {
    name: 'Upside-down attic', mode: 'mixolydian', tonic: 67, tempo: 108, bars: 8, level: 0.8,
    progression: [0, 6, 0, 6, 3, 6, 0, 4],   // I-bVII: the flat seventh is the joke
    bass: [[0, 0, .75], [1.5, 2, .5], [2, 3, .75], [3.5, 2, .5]],
    pad: [[1, .5], [3, .5]],
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead', ops: { inv: true, shift: 3 } }, // upside-down
      { at: 2, motif: 'spice', voice: 'counter', ops: { inv: true, oct: 1 } },
      { at: 4, motif: 'sugar', voice: 'lead', ops: { inv: true, shift: 3, frag: 6 } },
      { at: 5, notes: [P(6, .5), P(5, .5), P(6, 1), P(4, 2)], voice: 'lead' },
      { at: 6, motif: 'sugar', voice: 'lead', ops: { frag: 6 } },   // right way up again
      { at: 7, notes: [P(6, 1), P(4, 1), P(null, 2)], voice: 'lead' },
    ],
  },
  sky: {
    name: 'Into the sky', mode: 'lydian', tonic: 65, tempo: 84, bars: 8, level: 0.85,
    instr: { lead: 'bell' },
    progression: [0, 1, 0, 1, 5, 1, 4, 1],   // I-II: the raised fourth floats
    bass: [[0, 0, 2], [2, 2, 2]],
    pad: [[0, 3]],
    arp: { step: .5, seq: [0, 1, 2, 3, 2, 1, 2, 1], dur: .45 },
    drums: { hat: '........o.......' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead', ops: { aug: 2 } },             // augmented, soaring
      { at: 4, motif: 'sugar', voice: 'lead', ops: { aug: 2, frag: 3, shift: 1 } },
      { at: 5, notes: [P(10, 2), P(9, 1), P(7, 1)], voice: 'lead' },
      { at: 6, notes: [P(8, 3), P(6, 1), P(8, 4)], voice: 'lead' },
    ],
  },
  clock: {
    name: 'Clock tower', mode: 'aeolian', tonic: 57, tempo: 116, bars: 8, level: 0.8,
    progression: [0, 5, 2, 6, 0, 5, 3, 4],   // i-bVI-III-bVII
    bass: [[0, 0, .5], [.5, 0, .25], [1, 3, .5], [2, 0, .5], [2.5, 0, .25], [3, 2, .5]],
    arp: { step: .5, seq: [0, 2, 1, 2], dur: .3 },
    drums: { kick: 'x.......x.......', tick: 'x...o...x...o...', snare: '............o...' },
    melody: [
      { at: 0, motif: 'spice', voice: 'counter', ops: { oct: 1, stac: .6 } },   // Spice in minor
      { at: 2, motif: 'sugar', voice: 'lead', ops: { aug: .5, shift: -2 } },    // Sugar hurried
      { at: 3, motif: 'sugar', voice: 'lead', ops: { aug: .5, shift: -3 } },
      { at: 4, motif: 'spice', voice: 'counter', ops: { oct: 1, stac: .6, shift: 2 } },
      { at: 6, notes: [P(7, .5), P(6, .5), P(5, .5), P(4, .5), P(5, 1), P(4, 1)], voice: 'lead' },
      { at: 7, notes: [P(5, .5), P(6, .5), P(7, 1), P(null, 2)], voice: 'lead' },
    ],
  },
  home: {
    name: 'Home (finale)', mode: 'ionian', tonic: 60, tempo: 96, bars: 16, level: 0.9,
    progression: [0, 5, 3, 4, 0, 5, 3, 4, 0, 5, 1, 4, 3, 4, 0, 0],
    bass: [[0, 0, 2], [2, 2, 1], [3, 3, 1]],
    pad: [[0, 3]],
    arp: { step: .5, seq: [0, 1, 2, 3, 2, 1, 2, 1], dur: .4 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..o...o...o...o.' },
    layers: { bass: [4, 16], arp: [8, 16], kick: [8, 16], snare: [12, 16], hat: [8, 16] },
    melody: [
      { at: 0, motif: 'spice', voice: 'counter' },                      // he starts
      { at: 2, motif: 'spice', voice: 'counter', ops: { shift: 2 } },
      { at: 4, motif: 'sugar', voice: 'lead' },                         // she answers
      { at: 6, motif: 'sugar', voice: 'lead', ops: { shift: -1 } },
      { at: 8, motif: 'sugar', voice: 'lead' },                         // together:
      { at: 8, motif: 'spice', voice: 'counter' },                      // counterpoint
      { at: 10, motif: 'sugar', voice: 'lead', ops: { shift: 1 } },
      { at: 10, motif: 'spice', voice: 'counter', ops: { shift: 2 } },
      { at: 12, motif: 'sugar', voice: 'lead', ops: { aug: 2 } },       // broadened
      { at: 12, motif: 'spice', voice: 'counter', ops: { aug: 2 } },
    ],
  },
  minigame: {
    name: 'Minigame', mode: 'mixolydian', tonic: 67, tempo: 152, bars: 8, level: 0.75,
    progression: [0, 6, 0, 6, 3, 3, 4, 6],
    bass: [[0, 0, .4], [.5, 3, .4], [1, 0, .4], [1.5, 3, .4], [2, 2, .4], [2.5, 3, .4], [3, 2, .4], [3.5, 3, .4]],
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead', ops: { aug: .5, shift: -3 } },  // she dashes
      { at: 1, motif: 'spice', voice: 'counter', ops: { aug: .5, oct: 1 } },  // he chases
      { at: 2, motif: 'sugar', voice: 'lead', ops: { aug: .5, shift: -2 } },
      { at: 3, motif: 'spice', voice: 'counter', ops: { aug: .5, oct: 1, shift: 1 } },
      { at: 4, motif: 'sugar', voice: 'lead', ops: { aug: .5, frag: 6, shift: -3 } },
      { at: 5, motif: 'sugar', voice: 'counter', ops: { aug: .5, frag: 6, shift: -7 } },
      { at: 6, notes: [P(6, .5), P(6, .5), P(null, .5), P(6, .5), P(4, .5), P(6, .5), P(7, 1)], voice: 'lead' },
      { at: 7, notes: [P(3, .5), P(2, .5), P(1, .5), P(0, .5), P(-1, 1), P(null, 1)], voice: 'counter' },
    ],
  },
  credits: {
    name: 'Credits', mode: 'ionian', tonic: 60, tempo: 66, bars: 16, level: 0.85,
    instr: { lead: 'bell', counter: 'sine' },
    progression: [0, 0, 5, 5, 3, 3, 4, 4, 0, 0, 5, 5, 1, 4, 0, 0],
    bass: [[0, 0, 4]],
    pad: [[0, 3]],
    arp: { step: 1, seq: [0, 1, 2, 1], dur: .9 },
    melody: [
      { at: 0, motif: 'sugar', voice: 'lead', ops: { aug: 2 } },
      { at: 4, motif: 'spice', voice: 'counter', ops: { aug: 2 } },
      { at: 8, motif: 'sugar', voice: 'lead', ops: { aug: 2, shift: -1 } },
      { at: 12, motif: 'spice', voice: 'counter', ops: { aug: 2, oct: 1 } },
      { at: 12, motif: 'sugar', voice: 'lead', ops: { aug: 2, frag: 3 } },
    ],
  },
};
// Old chapter theme names map onto these moods.
export const ALIASES = { day: 'garden', workshop: 'toolbox', menu: 'title' };

const BPB = 4;                        // every track is 4/4
const PERC = { kick: 55, snare: 1800, hat: 3200, tick: 1600 }; // freq = pitch/filter centre
export const PERCUSSION = Object.keys(PERC);
const VEL = { lead: .9, counter: .85, bass: .8, pad: .35, arp: .4, kick: .8, snare: .4, hat: .3, tick: .35 };

// ---------------------------------------------------------------- pure schedule
function chordMidi(t, bar, tone, base) {
  const root = t.progression[bar % t.progression.length];
  return degreeToMidi(t.mode, base, root + [0, 2, 4, 7][tone]);
}
const gated = (t, voice, bar) => {
  const g = t.layers?.[voice];
  return !g || (bar >= g[0] && bar < g[1]);
};

function buildLoop(t) {
  const L = t.bars * BPB, ev = [];
  const add = (beat, dur, midi, voice, vel = VEL[voice]) => {
    const b = ((beat % L) + L) % L;   // wrap: a loop never spills past its end
    ev.push({ beat: +b.toFixed(6), dur, freq: +midiToFreq(midi).toFixed(4), voice, vel });
  };
  for (let bar = 0; bar < t.bars; bar++) {
    const b0 = bar * BPB;
    if (t.bass && gated(t, 'bass', bar)) for (const [o, tone, d] of t.bass) add(b0 + o, d, chordMidi(t, bar, tone, t.tonic - 24), 'bass');
    if (t.pad && gated(t, 'pad', bar)) for (const [o, d] of t.pad) for (const tone of [0, 1, 2]) add(b0 + o, d, chordMidi(t, bar, tone, t.tonic - 12), 'pad');
    if (t.arp && gated(t, 'arp', bar)) {
      const { step, seq, dur } = t.arp;
      for (let i = 0; i * step < BPB; i++) add(b0 + i * step, dur, chordMidi(t, bar, seq[i % seq.length], t.tonic), 'arp');
    }
    for (const [voice, pat] of Object.entries(t.drums || {})) {
      if (!gated(t, voice, bar)) continue;
      for (let i = 0; i < 16; i++) {
        const c = pat[i];
        if (c !== 'x' && c !== 'o') continue;
        const f = voice === 'tick' && c === 'o' ? PERC.tick * 0.75 : PERC[voice]; // tick-tock
        ev.push({ beat: b0 + i / 4, dur: voice === 'kick' ? .3 : .1, freq: f, voice, vel: VEL[voice] * (c === 'x' ? 1 : .6) });
      }
    }
  }
  for (const ph of t.melody || []) {
    const notes = ph.notes ? transform(ph.notes, ph.ops) : transform(MOTIFS[ph.motif], ph.ops);
    const stac = ph.ops?.stac ?? 0.92;
    const base = ph.voice === 'counter' ? t.tonic - 12 : t.tonic;
    let beat = ph.at * BPB + (ph.ops?.at ?? 0);
    for (const [d, b] of notes) {
      if (d !== null) add(beat, +(b * stac).toFixed(4), degreeToMidi(t.mode, base, d), ph.voice);
      beat += b;
    }
  }
  ev.sort((a, b) => a.beat - b.beat || a.voice.localeCompare(b.voice) || a.freq - b.freq);
  return ev;
}

const loops = new WeakMap();
export function loopEvents(track) {
  let e = loops.get(track);
  if (!e) { e = buildLoop(track); loops.set(track, e); }
  return e;
}
export const loopBeats = (track) => track.bars * BPB;

// PURE. Every note of `track` with fromBeat <= beat < toBeat, beats absolute
// from the track's start (the loop tiles forever).
export function scheduleTrack(track, fromBeat, toBeat) {
  const out = [];
  if (!track || !(toBeat > fromBeat)) return out;
  const L = loopBeats(track), loop = loopEvents(track);
  for (let k = Math.floor(fromBeat / L); k * L < toBeat; k++) {
    for (const e of loop) {
      const beat = e.beat + k * L;
      if (beat >= fromBeat && beat < toBeat) out.push({ ...e, beat });
    }
  }
  return out;
}

// ---------------------------------------------------------------- runtime
const TICK_MS = 25, HORIZON = 0.2, HIDDEN_HORIZON = 1.2, FADE = 1.2;
const MAX_VOICES = 24, SOFT_VOICES = 18;     // past SOFT, decoration is dropped at enqueue
const DECOR = new Set(['arp', 'hat', 'pad', 'tick', 'snare']);
const INSTR = {
  lead: { wave: 'square', gain: .07, att: .01, rel: .12, cut: 2600 },  // Sugar: soft pulse
  counter: { wave: 'triangle', gain: .16, att: .02, rel: .15, cut: 2000 }, // Spice: warm triangle
  bass: { wave: 'triangle', gain: .2, att: .01, rel: .08, cut: 900 },
  pad: { wave: 'sine', gain: .07, att: .3, rel: .6, cut: 1400 },
  arp: { wave: 'triangle', gain: .06, att: .005, rel: .1, cut: 2400 },
  sine: { wave: 'sine', gain: .14, att: .03, rel: .25, cut: 3000 },
  bell: { wave: 'sine', gain: .12, att: .005, rel: .6, cut: 4000 },
};

let players = [];          // {id, track, t0, next, out, end}
let current = null;        // the player that is fading in / playing
let pendingId = null, waiting = false, timer = null, voices = 0, noise = null;

function noiseBuffer(ctx) {
  if (noise) return noise;
  let s = 0x5eed1e5;       // fixed seed: mulberry32, not Math.random
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  return noise;
}

function release(nodes) { voices--; for (const n of nodes) try { n.disconnect(); } catch { /* gone */ } }

function playNote(ctx, p, e, when, spb) {
  if (voices >= MAX_VOICES || (voices >= SOFT_VOICES && DECOR.has(e.voice))) return;
  const dur = e.dur * spb, g = ctx.createGain();
  let src, filt = null, stopAt;
  if (PERC[e.voice] !== undefined) {
    if (e.voice === 'kick' || e.voice === 'tick') {
      src = ctx.createOscillator();
      src.type = e.voice === 'kick' ? 'sine' : 'triangle';
      src.frequency.setValueAtTime(e.voice === 'kick' ? 140 : e.freq, when);
      if (e.voice === 'kick') src.frequency.exponentialRampToValueAtTime(e.freq, when + .08);
    } else {
      src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx);
      filt = ctx.createBiquadFilter();
      filt.type = e.voice === 'hat' ? 'highpass' : 'bandpass';
      filt.frequency.value = e.freq; filt.Q.value = e.voice === 'hat' ? .7 : 1.2;
    }
    const pk = e.vel * (e.voice === 'kick' ? .3 : e.voice === 'tick' ? .05 : .08);
    const len = e.voice === 'kick' ? .22 : e.voice === 'snare' ? .12 : .04;
    g.gain.setValueAtTime(pk, when);
    g.gain.exponentialRampToValueAtTime(.0001, when + len);
    stopAt = when + len + .02;
  } else {
    const ins = INSTR[(e.voice === 'lead' || e.voice === 'counter') && p.track.instr?.[e.voice]] || INSTR[e.voice];
    src = ctx.createOscillator(); src.type = ins.wave; src.frequency.setValueAtTime(e.freq, when);
    filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = ins.cut; filt.Q.value = .5;
    const pk = e.vel * ins.gain, att = Math.min(ins.att, dur * .5);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(pk, when + att);
    g.gain.setTargetAtTime(0, when + Math.max(att, dur), ins.rel / 3);
    stopAt = when + Math.max(att, dur) + ins.rel;
  }
  const chain = filt ? [src, filt, g] : [src, g];
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  g.connect(p.out);
  voices++;
  src.onended = () => release(chain);
  src.start(when); src.stop(stopAt);
}

function pump() {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const until = now + (hidden ? HIDDEN_HORIZON : HORIZON);
    for (const p of players) {
      const spb = 60 / p.track.tempo;
      const beatAt = (t) => (t - p.t0) / spb;
      // Fell behind (tab hidden, long jank): skip to now, don't burst a backlog.
      if (p.t0 + p.next * spb < now - 0.05) p.next = beatAt(now);
      const to = beatAt(Math.min(until, p.end));
      if (to <= p.next) continue;
      for (const e of scheduleTrack(p.track, p.next, to)) playNote(ctx, p, e, p.t0 + e.beat * spb, spb);
      p.next = to;
    }
    // Retire faded-out players once their last notes have rung out.
    players = players.filter((p) => {
      if (now < p.end + 1) return true;
      try { p.out.disconnect(); } catch { /* gone */ }
      return false;
    });
    if (!players.length && timer) { clearInterval(timer); timer = null; }
  } catch { /* music is never worth a crash */ }
}

// Equal-power fade (sin/cos: different tracks are uncorrelated, a linear fade
// would dip -3 dB mid-way), drawn as short linear ramps rather than
// setValueCurveAtTime: a curve can't be cancelled mid-flight without throwing,
// and a quick second switch has to cancel it.
export function fadeCurve(from, rising, n = 16) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * Math.PI / 2;
    c.push(Math.max(1e-4, from * (rising ? Math.sin(x) : Math.cos(x))));
  }
  return c;
}
function ramp(param, c, at, dur) {
  param.setValueAtTime(c[0], at);
  for (let i = 1; i < c.length; i++) param.linearRampToValueAtTime(c[i], at + dur * i / (c.length - 1));
}

// Fade a player out starting at `at`; returns nothing, never throws.
function fadeOut(p, at) {
  try {
    const ctx = audioCtx(), g = p.out.gain, now = ctx.currentTime;
    // Our own envelope, not g.value: right after creation the getter still
    // reads the default 1, and a quick re-switch would fade from full.
    const x = Math.min(1, Math.max(0, (now - p.t0) / FADE));
    const v = Math.max(1e-4, p.level * Math.sin(x * Math.PI / 2));
    g.cancelScheduledValues(now);
    g.setValueAtTime(v, now);
    at = Math.max(at, now + 0.01);
    ramp(g, fadeCurve(v, false), at, FADE);
    p.end = at + FADE;
  } catch { p.end = 0; }
}

// When the old track should hand over: its next bar if that is close, else its
// next beat (bounds the switch lag to <= 0.6 s, plus the fade).
function handover(p, now) {
  const spb = 60 / p.track.tempo, beat = (now + 0.05 - p.t0) / spb;
  const bar = Math.ceil(beat / BPB) * BPB;
  const tBar = p.t0 + bar * spb;
  return tBar - now <= 0.6 ? tBar : p.t0 + Math.ceil(beat) * spb;
}

function start(id) {
  const ctx = audioCtx(), bus = musicOut();
  if (!ctx || !bus) return;
  const now = ctx.currentTime;
  let at = now + 0.06;
  if (current) { at = Math.max(at, handover(current, now)); fadeOut(current, at); }
  current = null;
  const track = TRACKS[id];
  if (!track) return;                          // unknown: silence
  const out = ctx.createGain();
  out.gain.setValueAtTime(1e-4, now);
  ramp(out.gain, fadeCurve(track.level ?? .85, true), at, FADE);
  out.connect(bus);
  current = { id, track, t0: at, next: 0, out, end: Infinity, level: track.level ?? .85 };
  players.push(current);
  if (!timer) timer = setInterval(pump, TICK_MS);
  pump();
}

export function playMusic(id) {
  try {
    id = ALIASES[id] || id;
    if (!audioCtx()) {
      pendingId = id;
      if (!waiting) { waiting = true; onAudioReady(() => { waiting = false; const p = pendingId; pendingId = null; if (p) playMusic(p); }); }
      return;
    }
    if (current && current.id === id) return;  // same track: no-op
    start(id);
  } catch { /* never into the game */ }
}

export function stopMusic() {
  try {
    pendingId = null;
    if (!current || !audioCtx()) { current = null; return; }
    fadeOut(current, audioCtx().currentTime + 0.02);
    current = null;
  } catch { /* never into the game */ }
}

// For tests and probes: what is playing and how many voices are live.
export const musicState = () => ({ id: current?.id ?? null, players: players.length, voices });
