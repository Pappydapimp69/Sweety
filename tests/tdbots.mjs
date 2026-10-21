// Scripted players for the top-down world: a breadth-first path over the tiles,
// then walk it. They drive the real sim through the same inputs a pad produces.
import { NO_INPUT } from '../src/sim.js';
import { solidAt, holeAt, tileAt } from '../src/td/sim.js';
export { NO_INPUT };

const I = NO_INPUT;
// can this player stand on this cell (not hopping)?
export function standable(s, x, y, p) {
  return !solidAt(s, x, y) && !holeAt(s, x, y, p) && tileAt(s, x, y) !== '^';
}
// the next cell to head for, by BFS (4-way); null if there is no way
export function nextCell(s, p, tx, ty) {
  const sx = Math.floor(p.x), sy = Math.floor(p.y), gx = Math.floor(tx), gy = Math.floor(ty);
  if (sx === gx && sy === gy) return [gx, gy];
  const W = s.w, prev = new Int32Array(W * s.h).fill(-1), q = [sy * W + sx];
  prev[sy * W + sx] = sy * W + sx;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % W, y = (c - x) / W;
    if (x === gx && y === gy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= s.h || prev[n] >= 0) continue;
      if (!(nx === gx && ny === gy) && !standable(s, nx, ny, p)) continue;
      prev[n] = c; q.push(n);
    }
  }
  let c = gy * W + gx;
  if (prev[c] < 0) return null;
  while (prev[c] !== sy * W + sx) c = prev[c];
  return [c % W, (c - (c % W)) / W];
}
// head for a point: straight there if it's in the cell, else along the BFS path
export function go(s, p, tx, ty, extra = {}) {
  let ax = tx, ay = ty;
  const n = nextCell(s, p, tx, ty);
  if (n && !(n[0] === Math.floor(tx) && n[1] === Math.floor(ty))) { ax = n[0] + 0.5; ay = n[1] + 0.5; }
  const dx = ax - p.x, dy = ay - p.y;
  return { ...I, right: dx > 0.08, left: dx < -0.08, down: dy > 0.08, up: dy < -0.08, ...extra };
}
export const at = (p, x, y, tol = 0.2) => !p.dead && Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol;
// face a direction without walking off (one tick of the stick, then nothing)
export function face(p, dx, dy) {
  if (Math.sign(p.fx) === dx && Math.sign(p.fy) === dy) return null;
  return { ...I, right: dx > 0, left: dx < 0, down: dy > 0, up: dy < 0 };
}
export const faces = (p, dx, dy) => Math.sign(p.fx) === dx && Math.sign(p.fy) === dy;
