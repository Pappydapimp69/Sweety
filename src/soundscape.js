// The physical layer of the sound: footsteps, things hitting things, water,
// and each place's room sound, synthesized by the vendored sound engine
// (src/vendor/sound-engine, from the Sound-engine repo). audio.js keeps the
// cartoon tones; this adds what the world itself sounds like. If AudioWorklet
// is missing or fails to load, everything here is a quiet no-op and the tones
// carry on alone.
import { SoundEngine } from './vendor/sound-engine/index.js';

const M = 0.5;       // metres per tile: the two of them are about half a metre tall
const DEPTH = 2.5;   // the listener sits this far in front of the screen, so pans stay gentle
const REF = 3;       // metres with no distance loss: anything on screen stays clearly audible
const LEVEL = 0.45;  // engine master into the sound-effects bus, matched to the tones by ear

// Where each theme is: reverb zone, what the floor is made of, and a far-off
// water bed (null = none).
const PLACES = {
  day: { zone: 'openPlain', surface: 'packedDirt', water: { preset: 'stream', at: [-14, 8] } },
  workshop: { zone: 'room', surface: 'wood', water: null },
  night: { zone: 'coniferForest', surface: 'packedDirt', water: null },
  attic: { zone: 'room', surface: 'wood', water: { preset: 'drip', at: [4, 2] } },
  sky: { zone: 'openPlain', surface: 'sandstone', water: null },
  clock: { zone: 'rockyGully', surface: 'sandstone', water: null },
  home: { zone: 'room', surface: 'wood', water: { preset: 'rain', at: [0, 12] } },
};
const place = (theme) => PLACES[theme] || PLACES.day;

// Struck things. Mode frequencies are rough but in the right family: wood and
// stone die fast, metal and glass ring, the bell has its minor-third partial.
const MATERIALS = {
  wood: { modes: [{ freq: 190, gain: 1 }, { freq: 430, gain: 0.6 }, { freq: 760, gain: 0.4 }, { freq: 1180, gain: 0.25 }], lossFactor: 0.02 },
  stone: { modes: [{ freq: 85, gain: 1 }, { freq: 210, gain: 0.5 }, { freq: 395, gain: 0.3 }, { freq: 640, gain: 0.15 }], lossFactor: 0.035 },
  metal: { modes: [{ freq: 1240, gain: 1 }, { freq: 3010, gain: 0.5 }, { freq: 5150, gain: 0.3 }], lossFactor: 0.0015 },
  glass: { modes: [{ freq: 1870, gain: 1 }, { freq: 2950, gain: 0.7 }, { freq: 4410, gain: 0.45 }, { freq: 6120, gain: 0.3 }], lossFactor: 0.0012 },
  bell: { modes: [{ freq: 523, gain: 0.5 }, { freq: 1046, gain: 1 }, { freq: 1255, gain: 0.6 }, { freq: 1569, gain: 0.4 }, { freq: 2093, gain: 0.3 }], lossFactor: 0.0006 },
};

let eng = null;
let pending = false;
const props = {};             // material -> modal source
let feet = [];                // one footsteps source per player
let bed = null, bedKey = '';  // the place's water bed
let splashSrc = null;
let zone = '';
let players = [];             // last frame's players, to place events that only say who
let stride = [0, 0];
let lastTheme = 'day';

export function startSoundscape(context, destination) {
  if (eng || pending || !context || !context.audioWorklet) return;
  pending = true;
  SoundEngine.create({ context, destination, device: 'unknown', maxVoices: 16 }).then((e) => {
    eng = e;
    eng.setMasterVolume(LEVEL);
    for (const k in MATERIALS) props[k] = eng.createSource('modal', { ...MATERIALS[k], level: 70 });
    feet = [0, 1].map(() => eng.createSource('footsteps', { refDistance: REF }));
    for (const s of Object.values(props)) s.refDistance = REF;
  }).catch(() => { eng = null; }).finally(() => { pending = false; });
}

export const soundscapeOn = () => !!eng && eng.ctx.state === 'running';

// game tiles -> engine metres; the listener faces into the screen (+y), up is +z
const at = (src, x, y) => src.setPosition(x * M, DEPTH, -y * M);

function placeOf(e) {
  if (Number.isFinite(e.x) && Number.isFinite(e.y)) return [e.x, e.y];
  const p = players[e.who];
  return p ? [p.x + p.w / 2, p.y + p.h] : [eng.listener.x / M, -eng.listener.z / M];
}

function strike(material, e, amp, brightness) {
  const s = props[material];
  if (!s) return;
  const [x, y] = placeOf(e);
  at(s, x, y);
  s._spatial();   // land the position before the hit, not a frame later
  s.strike(amp, brightness);
}

function stepAt(i, p, surface, { speed, gain = 1 } = {}) {
  const f = feet[i];
  if (!f) return;
  at(f, p.x + p.w / 2, p.y + p.h);
  f._spatial();
  const mass = p.size === 'small' ? 4 : p.size === 'big' ? 30 : 12;
  f.step({ mass, speed: Math.max(0.5, speed), surface, gain: gain * (p.id === 0 ? 0.85 : 1) });
}

function splash(e, n, energy) {
  if (!splashSrc) splashSrc = eng.createSource('water', { preset: 'splash', refDistance: REF, level: 70 });
  const [x, y] = placeOf(e);
  at(splashSrc, x, y);
  splashSrc._spatial();
  splashSrc.splash(n, energy);
}

// Events the world makes a real sound for. Returns true when the cartoon tone
// should be skipped (the physical sound replaces it); false layers both.
const HITS = {
  land: (e, pl) => { const p = players[e.who]; if (p) stepAt(e.who, p, pl.surface, { speed: e.hard ? 5 : 3, gain: e.hard ? 1.6 : 1.1 }); return true; },
  thud: (e) => { strike('stone', e, 1, 0.3); return true; },
  slam: (e) => { strike('stone', e, 0.6, 0.45); return false; },
  crate: (e) => { strike('wood', e, 1, 0.65); return true; },
  bonk: (e) => { strike('wood', e, 0.5, 0.8); return false; },
  kick: (e) => { strike('wood', e, 0.4, 0.7); return false; },
  pin: (e) => { strike('metal', e, 0.25, 0.7); return false; },
  pinned: (e) => { strike('metal', e, 0.4, 0.8); return true; },
  glass: (e) => { strike('glass', e, 0.5, 0.75); return true; },
  strike: (e) => { strike('stone', e, 0.8, 0.4); if (e.bell) setTimeout(() => eng && strike('bell', e, 0.7, 0.55), 150); return true; },
  flood: (e) => { splash(e, 400, 1.5); return false; },
  boom: (e) => { strike('stone', e, 1, 0.15); return false; },
};

// Called by audio.js for each game event. True = handled, skip the tone.
export function worldSound(e) {
  if (!soundscapeOn() || !HITS[e.type]) return false;
  try { return HITS[e.type](e, place(lastTheme)); } catch { return false; }
}

// Once per drawn frame. `view` is { run, cam, theme } while playing, null on
// menus and pause (footsteps stop and the water bed goes away).
export function soundFrame(view, dt) {
  if (!soundscapeOn()) return;
  try {
    if (!view || !view.run || !view.cam) { setBed(null); return; }
    const { run, cam } = view;
    const pl = place(view.theme);
    lastTheme = view.theme;
    players = run.players || [];
    eng.setListener({ x: cam.x * M, y: 0, z: -cam.y * M, yaw: 0 });
    if (pl.zone !== zone) { zone = pl.zone; eng.setZone(zone); }
    setBed(pl.water, view.theme, cam);
    players.forEach((p, i) => {
      if (i > 1 || !p || p.dead) return;
      const grounded = p.onGround !== false && !(p.z > 0.05) && !p.gliding;
      const speed = Math.hypot(p.vx || 0, p.onGround === undefined ? p.vy || 0 : 0) * M;   // m/s
      if (!grounded || speed < 0.6) { stride[i] = 0; return; }
      stride[i] += speed * Math.min(dt, 0.1);
      const len = p.size === 'small' ? 0.18 : 0.3;   // metres per step
      if (stride[i] >= len) { stride[i] -= len; stepAt(i, p, pl.surface, { speed }); }
    });
    eng.update();
  } catch { /* sound is never worth a crash */ }
}

function setBed(water, theme, cam) {
  const key = water ? `${theme}:${water.preset}` : '';
  if (key !== bedKey) {
    if (bed) { bed.dispose(); bed = null; }
    bedKey = key;
    if (water) bed = eng.createSource('water', { preset: water.preset, level: 55, refDistance: REF });
  }
  if (bed && cam) at(bed, cam.x + water.at[0], cam.y + water.at[1]);   // it travels with the view: a place's sound, not a prop
}
