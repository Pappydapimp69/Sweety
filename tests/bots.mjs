// Scripted players for play-through tests. They drive the real sim through the same
// input shape the keyboard and pads produce.
import { step, solidTile, NO_INPUT } from '../src/sim.js';

export const cx = (p) => p.x + p.w / 2;
export const feet = (p) => p.y + p.h;

export function walk(p, tx, extra = {}) {
  const d = tx - cx(p);
  return { ...NO_INPUT, right: d > 0.12, left: d < -0.12, ...extra };
}
export const near = (p, tx, tol = 0.25) => Math.abs(cx(p) - tx) < tol && p.onGround;

// Walk toward tx, hopping walls and gaps on the way.
export function autorun(s, p, tx) {
  const inp = walk(p, tx);
  const dir = inp.right ? 1 : inp.left ? -1 : 0;
  if (!dir) return inp;
  const ahead = Math.floor(dir > 0 ? p.x + p.w + 0.45 : p.x - 0.45);
  const row = Math.floor(feet(p) + 0.01);
  const wall = solidTile(s, ahead, row - 1);
  const gap = !solidTile(s, ahead, row);
  if (p.onGround && (wall || gap)) inp.jumpPressed = true;
  inp.jump = p.vy < 0 || inp.jumpPressed;
  return inp;
}

export function jumpToward(p, tx) {
  return { ...walk(p, tx), jump: true, jumpPressed: p.onGround };
}

// phases: [{ name, ctrl(s) -> [in0, in1], done(s), max }]
export function play(s, phases) {
  for (const ph of phases) {
    let n = 0;
    while (!ph.done(s)) {
      if (++n > (ph.max ?? 900)) {
        const [a, b] = s.players;
        throw new Error(`phase "${ph.name}" stuck: Sugar (${cx(a).toFixed(2)},${feet(a).toFixed(2)}${a.dead ? ' dead' : ''}) Spice (${cx(b).toFixed(2)},${feet(b).toFixed(2)}${b.dead ? ' dead' : ''})`);
      }
      step(s, ph.ctrl(s));
    }
  }
  return s;
}

export const idle = () => NO_INPUT;
