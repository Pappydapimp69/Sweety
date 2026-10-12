// Devices -> buttons. A device is 'kbL' (left half of the keyboard), 'kbR' (right
// half) or 'pad0'..'pad3'. Presses are latched until read, so a quick tap between
// frames is never lost. Pads are polled on their own timer, not per frame.
import { PAD_DEADZONE, PAD_POLL_MS } from './config.js';

const KEYS = {
  kbL: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyW', 'Space'], ability: ['KeyE', 'KeyF'] },
  kbR: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp'], ability: ['Enter', 'Period', 'Numpad0', 'ShiftRight'] },
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'ability', 'pause'];

// What to call each button on screen, per device.
export const LABELS = {
  kbL: { move: 'A / D', jump: 'W', ability: 'E', pause: 'Esc', name: 'keyboard (left)' },
  kbR: { move: '← / →', jump: '↑', ability: 'Enter', pause: 'Esc', name: 'keyboard (right)' },
  pad: { move: 'left stick', jump: 'A', ability: 'X', pause: 'Start', name: 'controller' },
};
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
      const codes = a === 'pause' ? ['Escape'] : KEYS[d][a];
      if (!codes.includes(code)) continue;
      const now = codes.some((c) => down.has(c));
      if (now && !held[d][a]) latch[d][a] = true;
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
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  target.addEventListener('keyup', (e) => { down.delete(e.code); refreshKeyboard(e.code, false); });
  target.addEventListener('blur', () => {
    down.clear();
    for (const d of Object.keys(held)) for (const a of ACTIONS) held[d][a] = false;
  });
  setInterval(pollPads, PAD_POLL_MS);
}

export function onAnyKey(fn) { anyKeyHook = fn; }

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
      jump: b(0), ability: b(2) || b(1), pause: b(9),
    };
    for (const a of ACTIONS) {
      if (now[a] && !held[d][a]) latch[d][a] = true;
      held[d][a] = now[a];
    }
  }
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
    jump: !!h.jump, ability: !!h.ability,
    jumpPressed: !!l.jump, abilityPressed: !!l.ability, pausePressed: !!l.pause,
    leftPressed: !!l.left, rightPressed: !!l.right, upPressed: !!l.up, downPressed: !!l.down,
  };
  for (const a of ACTIONS) l[a] = false;
  return out;
}

// Drop presses made during a screen change so they don't leak into the next screen.
export function flush() {
  for (const d of Object.keys(latch)) for (const a of ACTIONS) latch[d][a] = false;
}

export const ALL_DEVICES = ['kbL', 'kbR', 'pad0', 'pad1', 'pad2', 'pad3'];
