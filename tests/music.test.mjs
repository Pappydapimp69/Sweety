import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRACKS, MOTIFS, MODES, CHARACTERISTIC, PERCUSSION, scheduleTrack, loopBeats,
  degreeToMidi, midiToFreq, transform, fadeCurve, playMusic, stopMusic,
} from '../src/music.js';

const IDS = ['title', 'garden', 'toolbox', 'night', 'attic', 'sky', 'clock', 'home', 'minigame', 'credits'];
// Deliberate chromatic notes per track (pitch classes, absolute). None today:
// every track stays strictly in its mode. Add here, with a reason, if one is wanted.
const CHROMATIC = {};
const midiOf = (f) => Math.round(69 + 12 * Math.log2(f / 440));
const pitched = (e) => !PERCUSSION.includes(e.voice);

test('every chapter mood has a track', () => {
  for (const id of IDS) {
    assert.ok(TRACKS[id], id);
    const t = TRACKS[id];
    assert.ok(MODES[t.mode], `${id} mode`);
    assert.ok(t.bars >= 8 && t.bars <= 16, `${id} loop 8-16 bars`);
    assert.ok(t.tempo > 40 && t.tempo < 200, `${id} tempo`);
    assert.equal(t.progression.length, t.bars, `${id} one chord per bar`);
  }
});

test('events are finite, in range, and inside the requested window', () => {
  for (const id of IDS) {
    const t = TRACKS[id], L = loopBeats(t);
    const ev = scheduleTrack(t, 3.5, 3.5 + 2 * L);
    assert.ok(ev.length > 20, `${id} has notes`);
    for (const e of ev) {
      assert.ok(Number.isFinite(e.freq) && e.freq >= 40 && e.freq <= 4000, `${id} freq ${e.freq}`);
      assert.ok(e.beat >= 3.5 && e.beat < 3.5 + 2 * L, `${id} beat ${e.beat}`);
      assert.ok(e.dur > 0 && Number.isFinite(e.dur), `${id} dur`);
      assert.ok(e.vel > 0 && e.vel <= 1, `${id} vel`);
      assert.equal(typeof e.voice, 'string');
    }
  }
});

test('deterministic', () => {
  for (const id of IDS) assert.deepEqual(scheduleTrack(TRACKS[id], 0, 40), scheduleTrack(TRACKS[id], 0, 40));
});

test('loops are seamless: [L,2L) is [0,L) shifted by L', () => {
  for (const id of IDS) {
    const t = TRACKS[id], L = loopBeats(t);
    const a = scheduleTrack(t, 0, L), b = scheduleTrack(t, L, 2 * L).map((e) => ({ ...e, beat: e.beat - L }));
    assert.deepEqual(b, a, id);
    // and a window that straddles the seam is just the two halves joined
    const s = scheduleTrack(t, L - 2, L + 2);
    assert.deepEqual(s, [...scheduleTrack(t, L - 2, L), ...scheduleTrack(t, L, L + 2)], `${id} seam`);
    // no note starts past the loop end, and none hangs over the seam
    for (const e of a) assert.ok(e.beat < L && e.beat + e.dur <= L + 1e-9, `${id} ${e.voice}@${e.beat} crosses the seam`);
  }
});

test('every note stays in its mode (one parent family, modes differ)', () => {
  for (const id of IDS) {
    const t = TRACKS[id];
    const ok = new Set(MODES[t.mode].map((i) => (t.tonic + i) % 12));
    for (const pc of CHROMATIC[id] || []) ok.add(pc);
    for (const e of scheduleTrack(t, 0, loopBeats(t)).filter(pitched)) {
      assert.ok(ok.has(midiOf(e.freq) % 12), `${id}: ${e.voice} midi ${midiOf(e.freq)} outside ${t.mode}`);
    }
    // the parent family: every mode here is a rotation of the white keys
    const white = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const pc of ok) assert.ok(white.has(pc), `${id} leaves the parent key`);
  }
});

test("each mode's characteristic note is actually heard", () => {
  for (const id of IDS) {
    const t = TRACKS[id], pc = (t.tonic + CHARACTERISTIC[t.mode]) % 12;
    const n = scheduleTrack(t, 0, loopBeats(t)).filter((e) => pitched(e) && midiOf(e.freq) % 12 === pc).length;
    assert.ok(n >= 4, `${id} (${t.mode}) plays its characteristic note ${n}x`);
  }
});

const motifFreqs = (t, name, voiceBase) =>
  MOTIFS[name].filter(([d]) => d !== null).map(([d]) => degreeToMidi(t.mode, voiceBase, d));
function findMotif(t, name, voice, base) {
  const want = motifFreqs(t, name, base);
  const line = scheduleTrack(t, 0, loopBeats(t)).filter((e) => e.voice === voice);
  const got = line.map((e) => midiOf(e.freq));
  const hits = [];
  for (let i = 0; i + want.length <= got.length; i++) {
    if (want.every((m, j) => got[i + j] === m)) hits.push(line[i].beat);
  }
  return hits;
}

test('the leitmotifs: main theme states both, home combines them in counterpoint', () => {
  for (const id of ['title', 'home']) {
    const t = TRACKS[id];
    assert.ok(findMotif(t, 'sugar', 'lead', t.tonic).length >= 1, `${id}: Sugar's motif`);
    assert.ok(findMotif(t, 'spice', 'counter', t.tonic - 12).length >= 1, `${id}: Spice's motif`);
  }
  // in home they sound at the SAME time at least once
  const h = TRACKS.home;
  const s = findMotif(h, 'sugar', 'lead', h.tonic), p = findMotif(h, 'spice', 'counter', h.tonic - 12);
  assert.ok(s.some((b) => p.includes(b)), `home overlaps the motifs: sugar@${s} spice@${p}`);
});

test('motifs are short and distinct (hummable after two bars)', () => {
  for (const m of Object.values(MOTIFS)) assert.equal(m.reduce((a, [, b]) => a + b, 0), 8);
  assert.notDeepEqual(MOTIFS.sugar.map(([d]) => d), MOTIFS.spice.map(([d]) => d));
  // transforms: augmentation doubles length, inversion mirrors around the first note
  const aug = transform(MOTIFS.sugar, { aug: 2 });
  assert.equal(aug.reduce((a, [, b]) => a + b, 0), 16);
  assert.deepEqual(transform([[4, 1], [5, 1], [2, 1]], { inv: true }).map(([d]) => d), [4, 3, 6]);
});

test('concurrent pitched+drum voices per track stay modest (two tracks in a crossfade <= 24)', () => {
  for (const id of IDS) {
    const t = TRACKS[id], spb = 60 / t.tempo;
    const ev = scheduleTrack(t, 0, 2 * loopBeats(t));
    let peak = 0;
    for (const e of ev) {
      const at = e.beat * spb;
      // a voice lives for its duration plus its release (pads/bells ring 0.6 s, the rest <= 0.25 s)
      const rel = (o) => (o.voice === 'pad' || t.instr?.[o.voice] === 'bell' ? 0.6 : 0.25);
      const live = ev.filter((o) => o.beat * spb <= at && o.beat * spb + o.dur * spb + rel(o) > at).length;
      peak = Math.max(peak, live);
    }
    assert.ok(peak <= 12, `${id} peak ${peak} voices`);
  }
});

test('crossfade is equal power', () => {
  const a = fadeCurve(1, false), b = fadeCurve(1, true);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] ** 2 + b[i] ** 2 - 1) < 1e-3, `step ${i}`);
});

test('no Math.random in music.js', () => {
  const src = readFileSync(new URL('../src/music.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random/.test(src));
});

test('playMusic/stopMusic never throw without audio (and unknown ids are silent)', () => {
  assert.doesNotThrow(() => { playMusic('garden'); playMusic('garden'); playMusic('nope'); stopMusic(); });
});

test('midi helpers', () => {
  assert.equal(midiToFreq(69), 440);
  assert.equal(degreeToMidi('ionian', 60, 7), 72);
  assert.equal(degreeToMidi('dorian', 62, -1), 60);
  assert.equal(degreeToMidi('lydian', 65, 3), 71);
});
