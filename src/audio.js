// Tiny synthesized sound effects. Fire-and-forget: never await resume() (some
// browsers leave it pending forever), cap concurrent voices.
let ctx = null;
let voices = 0;
const MAX_VOICES = 16;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { ctx = null; }
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
    o.connect(g).connect(ctx.destination);
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
};

export function playEvents(events) {
  for (const e of events) if (SFX[e.type]) SFX[e.type](e.who);
}
export const sfx = (name) => SFX[name] && SFX[name]();
