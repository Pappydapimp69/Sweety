// Devices -> buttons. A device is 'kbL' (left half of the keyboard), 'kbR' (right
// half) or 'pad0'..'pad3'. Presses are latched until read, so a quick tap between
// frames is never lost. Pads are polled on their own timer, not per frame.
import { PAD_DEADZONE, PAD_POLL_MS } from './config.js';

// In play, up and jump share a key on each keyboard half, so menus get their own
// OK and Back keys and W/S and the arrows always just move the cursor.
export const KEYS = {
  kbL: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyW', 'Space'], ability: ['KeyE', 'KeyF'], ok: ['Space', 'KeyE'], back: ['Escape', 'Backspace', 'KeyQ'], switch: ['Tab'],
    jump3d: ['Space'], camL: ['KeyQ', 'KeyZ'], camR: ['KeyR', 'KeyC'] },
  kbR: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp'], ability: ['Enter', 'Period', 'Numpad0', 'ShiftRight'], ok: ['Enter', 'NumpadEnter'], back: ['Escape', 'Backspace'], switch: ['Slash'],
    jump3d: ['ShiftRight', 'ControlRight', 'Numpad0'], ability3d: ['Enter', 'Period', 'NumpadEnter'], camL: ['Delete', 'Comma', 'Numpad4', 'KeyK'], camR: ['PageDown', 'Numpad6', 'KeyL', 'Quote'] },
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'ability', 'pause', 'ok', 'back', 'switch', 'camL', 'camR'];
// In the 3D chapters forward is its own key, so jump moves off it, and the camera turns.
let mode3d = false;
export function setMode3D(on) {
  if (on === mode3d) return;
  mode3d = on;
  for (const c of [...down]) refreshKeyboard(c, false);
}

// What to call each button on screen, per device.
export const LABELS = {
  kbL: { move3d: 'W A S D', jump3d: 'Space', cam: 'Q / R', move: 'A / D', jump: 'W', ability: 'E', pause: 'Esc', ok: 'Space', back: 'Esc', nav: 'W A S D', switch: 'Tab', name: 'keyboard (left)' },
  kbR: { move3d: 'arrows', jump3d: 'R-Shift', cam: 'Del / PgDn', move: '← / →', jump: '↑', ability: 'Enter', pause: 'Esc', ok: 'Enter', back: 'Esc', nav: 'arrows', switch: '/', name: 'keyboard (right)' },
  pad: { move3d: 'left stick', jump3d: 'A', cam: 'right stick', move: 'left stick', jump: 'A', ability: 'X', pause: 'Start', ok: 'A', back: 'B', nav: 'stick', switch: 'Y', name: 'controller' },
};
LABELS.touch = { move: '◀ ▶', jump: 'A', ability: 'B', pause: 'II', ok: 'A', back: 'B', nav: '◀ ▶ ▲ ▼', switch: '⇄', name: 'touch screen' };
export const labelsFor = (dev) => (dev && dev.startsWith('pad') ? LABELS.pad : LABELS[dev] || LABELS.kbL);

const down = new Set();
const held = {};      // dev -> {action: bool}
const latch = {};     // dev -> {action: bool} rising edges not yet read
let anyKeyHook = null;

function dev(d) {
  if (!held[d]) { held[d] = {}; latch[d] = {}; }
  return d;
}

function refreshKeyboard(code, isDown) {
  for (const d of ['kbL', 'kbR']) {
    dev(d);
    for (const a of ACTIONS) {
      const codes = a === 'pause' ? ['Escape'] : (mode3d && KEYS[d][`${a}3d`]) || KEYS[d][a] || [];
      if (!codes.includes(code) && !(KEYS[d][a] || []).includes(code)) continue;
      const now = codes.some((c) => down.has(c));
      if (now && !held[d][a]) latch[d][a] = (latch[d][a] || 0) + 1;   // count: two taps in one frame are two
      held[d][a] = now;
    }
  }
  if (isDown && anyKeyHook) anyKeyHook();
}

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    if (e.repeat) { e.preventDefault(); return; }
    down.add(e.code);
    refreshKeyboard(e.code, true);
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab' || e.code === 'Slash') e.preventDefault();
  });
  target.addEventListener('keyup', (e) => { down.delete(e.code); refreshKeyboard(e.code, false); });
  target.addEventListener('blur', () => {
    down.clear();
    for (const d of Object.keys(held)) for (const a of ACTIONS) held[d][a] = false;
  });
  setInterval(pollPads, PAD_POLL_MS);
}

export function onAnyKey(fn) { anyKeyHook = fn; }

// ---- touch: on-screen buttons. main.js lays them out (CSS px) and draws them;
// here each finger is tracked to the button it is on, so a thumb can hold
// ▶ while the other taps A.
let touchButtons = [];          // [{ act: 'left'|'right'|'up'|'down'|'a'|'b'|'pause', x, y, r }]
const fingers = new Map();      // pointerId -> act
export let touchSeen = false;
export function setTouchLayout(buttons) { touchButtons = buttons; }
const TOUCH_MAP = { left: ['left'], right: ['right'], up: ['up'], down: ['down'], a: ['jump', 'ok'], b: ['ability', 'back'], pause: ['pause'], sw: ['switch'] };

function touchAt(x, y) {
  let best = null, bd = Infinity;
  for (const b of touchButtons) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < b.r * 1.35 && d < bd) { best = b.act; bd = d; }   // generous capture
  }
  return best;
}
function refreshTouch() {
  const d = dev('touch');
  const on = new Set();
  for (const act of fingers.values()) if (act) for (const a of TOUCH_MAP[act]) on.add(a);
  for (const a of ACTIONS) {
    const now = on.has(a);
    if (now && !held[d][a]) latch[d][a] = (latch[d][a] || 0) + 1;
    held[d][a] = now;
  }
}
export function initTouch(target) {
  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
  target.addEventListener('pointerdown', (e) => {
    if (!isTouch(e)) return;
    touchSeen = true;
    e.preventDefault();
    fingers.set(e.pointerId, touchAt(e.clientX, e.clientY));
    refreshTouch();
    if (anyKeyHook) anyKeyHook();
  });
  target.addEventListener('pointermove', (e) => {
    if (!isTouch(e) || !fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, touchAt(e.clientX, e.clientY));   // slide between buttons
    refreshTouch();
  });
  const up = (e) => { if (fingers.delete(e.pointerId)) refreshTouch(); };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

function pollPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length && i < 4; i++) {
    const g = pads[i];
    const d = dev(`pad${i}`);
    if (!g || !g.connected) { for (const a of ACTIONS) held[d][a] = false; continue; }
    const b = (n) => !!(g.buttons[n] && g.buttons[n].pressed);
    let ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    if (Math.hypot(ax, ay) < PAD_DEADZONE) { ax = 0; ay = 0; }   // radial deadzone
    const now = {
      left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
      up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
      jump: b(0), ability: b(2) || b(1), pause: b(9), ok: b(0), back: b(1) || b(8), switch: b(3),
      camL: (g.axes[2] || 0) < -0.4 || b(4), camR: (g.axes[2] || 0) > 0.4 || b(5),
    };
    for (const a of ACTIONS) {
      if (now[a] && !held[d][a]) latch[d][a] = (latch[d][a] || 0) + 1;
      held[d][a] = now[a];
    }
  }
}

export function padConnected(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return !!(pads[i] && pads[i].connected);
}

export function connectedPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return [...pads].filter((g) => g && g.connected).length;
}

// Read one device for one sim step (or one menu frame). Consumes the latched presses.
export function read(d) {
  dev(d);
  const h = held[d], l = latch[d];
  const out = {
    left: !!h.left, right: !!h.right, down: !!h.down, up: !!h.up,
    jump: !!h.jump, ability: !!h.ability, camL: !!h.camL, camR: !!h.camR,
    jumpPressed: !!l.jump, abilityPressed: !!l.ability, pausePressed: !!l.pause,
    okPressed: !!l.ok, backPressed: !!l.back, switchPressed: !!l.switch,
    leftPressed: !!l.left, rightPressed: !!l.right, upPressed: !!l.up, downPressed: !!l.down,
    taps: { left: l.left || 0, right: l.right || 0, up: l.up || 0, down: l.down || 0 },
  };
  for (const a of ACTIONS) l[a] = 0;
  return out;
}

// Drop presses made during a screen change so they don't leak into the next screen.
export function flush() {
  for (const d of Object.keys(latch)) for (const a of ACTIONS) latch[d][a] = 0;
}

export const ALL_DEVICES = ['kbL', 'kbR', 'pad0', 'pad1', 'pad2', 'pad3', 'touch'];
