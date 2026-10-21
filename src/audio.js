// Tiny synthesized sound effects. Fire-and-forget: never await resume() (some
// browsers leave it pending forever), cap concurrent voices.
let ctx = null;
let sfxBus = null, musicBus = null;
let voices = 0;
const MAX_VOICES = 16;
const vol = { sfx: 0.8, music: 0.6 };
const unlockHooks = [];

export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(ctx.destination);
      for (const f of unlockHooks) f();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { ctx = null; }
}

// For music.js: the shared context and its bus (null until a user gesture).
export const audioCtx = () => ctx;
export const musicOut = () => musicBus;
export function onAudioReady(f) { if (ctx) f(); else unlockHooks.push(f); }

export function setVolumes({ sfx, music }) {
  if (Number.isFinite(sfx)) vol.sfx = sfx;
  if (Number.isFinite(music)) vol.music = music;
  if (sfxBus) sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.05);
  if (musicBus) musicBus.gain.setTargetAtTime(vol.music, ctx.currentTime, 0.05);
}

function tone(freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
  if (!ctx || ctx.state !== 'running' || voices >= MAX_VOICES) return;
  try {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    voices++;
    o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* sound is never worth a crash */ }
}

const SFX = {
  jump: (who) => tone(who ? 330 : 440, 0.12, { type: 'square', vol: 0.05, slide: 200 }),
  land: () => tone(120, 0.08, { vol: 0.08 }),
  heart: () => { tone(880, 0.1, { vol: 0.1 }); tone(1320, 0.15, { vol: 0.08, delay: 0.08 }); },
  die: () => tone(300, 0.4, { type: 'sawtooth', vol: 0.06, slide: -250 }),
  respawn: () => tone(500, 0.15, { vol: 0.07, slide: 300 }),
  checkpoint: () => { tone(660, 0.1); tone(990, 0.2, { delay: 0.1 }); },
  pin: () => tone(1200, 0.05, { type: 'triangle', vol: 0.08 }),
  pinned: () => tone(1800, 0.06, { type: 'square', vol: 0.05 }),
  slam: () => tone(200, 0.1, { type: 'square', vol: 0.06, slide: -120 }),
  thud: () => tone(90, 0.25, { type: 'triangle', vol: 0.2, slide: -50 }),
  crate: () => tone(160, 0.2, { type: 'sawtooth', vol: 0.08, slide: -100 }),
  launch: () => tone(300, 0.4, { type: 'square', vol: 0.06, slide: 900 }),
  small: () => tone(900, 0.15, { vol: 0.08, slide: 400 }),
  big: () => tone(220, 0.2, { vol: 0.1, slide: -100 }),
  nope: () => tone(150, 0.1, { type: 'square', vol: 0.05 }),
  wave: (who) => { tone(who ? 523 : 659, 0.12); tone(who ? 659 : 784, 0.18, { delay: 0.1 }); },
  bonk: () => tone(600, 0.15, { type: 'square', vol: 0.08, slide: -400 }),
  plate: () => tone(400, 0.06, { type: 'triangle', vol: 0.06 }),
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { vol: 0.1, delay: i * 0.12 })),
  tick: () => tone(700, 0.04, { type: 'triangle', vol: 0.05 }),
  confirm: () => { tone(660, 0.08, { type: 'triangle', vol: 0.08 }); tone(990, 0.12, { type: 'triangle', vol: 0.07, delay: 0.06 }); },
  flip: () => tone(500, 0.18, { type: 'triangle', vol: 0.08, slide: -300 }),
  swap: () => { tone(880, 0.1, { vol: 0.08, slide: -400 }); tone(440, 0.12, { vol: 0.08, slide: 400, delay: 0.08 }); },
  gust: () => tone(240, 0.3, { type: 'sawtooth', vol: 0.03, slide: 300 }),
  blown: () => tone(360, 0.2, { type: 'triangle', vol: 0.05, slide: 200 }),
  dash: () => tone(260, 0.12, { type: 'square', vol: 0.05, slide: 500 }),
  glass: () => [1800, 2400, 2000].forEach((f, i) => tone(f, 0.08, { type: 'triangle', vol: 0.05, delay: i * 0.03 })),
  pinwheel: () => tone(1000, 0.2, { type: 'triangle', vol: 0.04, slide: 300 }),
  flood: () => tone(110, 0.8, { type: 'sine', vol: 0.12, slide: -40 }),
  talk: () => tone(820, 0.05, { type: 'triangle', vol: 0.05 }),
  round: () => tone(587, 0.15, { type: 'square', vol: 0.05 }),
  pass: () => tone(784, 0.07, { type: 'square', vol: 0.05 }),
  boom: () => tone(80, 0.6, { type: 'sawtooth', vol: 0.12, slide: -40 }),
  // the Yard
  star: () => [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.06 })),
  boing: () => tone(180, 0.3, { type: 'sine', vol: 0.12, slide: 500 }),
  note: (who, e) => {   // C major pentatonic up the keys; Sugar's notes ring a little brighter
    const step = [0, 2, 4, 7, 9][e.k % 5] + 12 * Math.floor(e.k / 5);
    const f = 261.63 * 2 ** (step / 12);
    tone(f, 0.45, { type: who ? 'triangle' : 'sine', vol: 0.14 });
    tone(f * 2, 0.25, { type: 'sine', vol: 0.03 });
  },
  pump: (who) => tone(who ? 300 : 360, 0.08, { type: 'triangle', vol: 0.07, slide: 120 }),
  pop: () => { tone(1400, 0.06, { type: 'square', vol: 0.1, slide: -1200 }); tone(90, 0.2, { vol: 0.12 }); },
  kick: () => tone(140, 0.08, { type: 'triangle', vol: 0.12, slide: -60 }),
  goal: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.05, delay: i * 0.08 })),
  footyWin: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, { vol: 0.1, delay: i * 0.1 })),
  tick3: () => tone(660, 0.12, { type: 'square', vol: 0.06 }),
  raceGo: () => tone(1320, 0.3, { type: 'square', vol: 0.07 }),
  raceEnd: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, { vol: 0.09, delay: i * 0.09 })),
  cuddle: () => [659, 784].forEach((f, i) => tone(f, 0.5, { vol: 0.07, delay: i * 0.25 })),
  strike: (who, e) => { tone(80, 0.2, { type: 'triangle', vol: 0.15 }); if (e.bell) [1568, 2093, 1568].forEach((f, i) => tone(f, 0.6, { vol: 0.09, delay: 0.15 + i * 0.12 })); },
  enter: () => [392, 523, 659].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.07 })),
  locked: () => tone(140, 0.15, { type: 'square', vol: 0.06 }),
  // the island
  vine: () => [330, 392, 494].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.06, delay: i * 0.05 })),
  shove: () => tone(90, 0.12, { type: 'sawtooth', vol: 0.05 }),
  sink: () => tone(260, 0.3, { vol: 0.08, slide: -180 }),
  unlock: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.08, delay: i * 0.09 })),
  heartGot: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.35, { vol: 0.09, delay: i * 0.11 })),
};

export function playEvents(events) {
  for (const e of events) if (SFX[e.type]) SFX[e.type](e.who, e);
}
export const sfx = (name) => SFX[name] && SFX[name]();
