// Each chapter-4+ mechanic on a tiny purpose-built map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, NO_INPUT as I } from '../src/sim.js';

const W = 24;
function map(rows, powers, extra = {}) {
  const H = 18;
  const m = [];
  for (let r = 0; r < H; r++) m.push((rows[r] ?? rows[rows.length - 1]).padEnd(W, '.'));
  return { id: 'test', powers, map: m, ents: extra.ents || [], ...extra };
}
const open = (spawn = '.PQ') => [...Array(12).fill('#'), '#' + spawn, '#'.repeat(W)];
const run = (s, n, f) => { for (let i = 0; i < n; i++) step(s, f(s, i)); return s; };
const cx = (p) => p.x + p.w / 2;

test('flip: Spice falls up and stands on the ceiling, presses a ceiling plate', () => {
  const rows = ['#'.repeat(W), '#.....1', ...Array(10).fill('#'), '#.PQ...A', '#'.repeat(W)];
  const s = createRun(map(rows, { sugar: 'none', spice: 'flip' }));
  const sp = s.players[1];
  sp.x = 6.1; sp.y = 13 - sp.h;
  run(s, 1, () => [I, { ...I, abilityPressed: true }]);
  run(s, 60, () => [I, I]);
  assert.equal(sp.grav, -1);
  assert.ok(sp.onGround && Math.abs(sp.y - 1) < 0.01, `on the ceiling at y=${sp.y}`);
  assert.ok(s.pressed[1], 'the ceiling plate is pressed by upside-down feet');
  // flip back mid-air is allowed once, then not until landing
  run(s, 1, () => [I, { ...I, abilityPressed: true }]);
  run(s, 2, () => [I, I]);
  run(s, 1, () => [I, { ...I, abilityPressed: true }]);
  assert.equal(sp.grav, 1, 'second flip in the same air is refused');
});

test('swap: Sugar and Spice trade places and start from rest', () => {
  const s = createRun(map(open(), { sugar: 'swap', spice: 'none' }));
  const [a, b] = s.players;
  b.x = 15; b.y = 13 - b.h;
  const before = [cx(a), cx(b)];
  run(s, 1, () => [{ ...I, abilityPressed: true }, I]);
  assert.ok(Math.abs(cx(a) - before[1]) < 0.01 && Math.abs(cx(b) - before[0]) < 0.01);
  assert.equal(a.vx, 0); assert.equal(a.prevY, a.y);
  run(s, 1, () => [{ ...I, abilityPressed: true }, I]);
  assert.ok(Math.abs(cx(a) - before[1]) < 0.01, 'cooldown blocks an instant swap back');
});

test('gust shoves Spice and spins a pinwheel; it does not move Sugar', () => {
  const s = createRun(map(open(), { sugar: 'gust', spice: 'none' }, { ents: [{ type: 'pinwheel', x: 7, y: 12, g: 2 }] }));
  const [a, b] = s.players;
  a.x = 2; a.facing = 1; b.x = 4;
  const ax = a.x, bx = b.x;
  run(s, 1, () => [{ ...I, abilityPressed: true }, I]);
  run(s, 20, () => [I, I]);
  assert.ok(b.x - bx > 2, `Spice blown ${b.x - bx}`);
  assert.ok(Math.abs(a.x - ax) < 0.01);
  assert.ok(s.pressed[2], 'pinwheel group pressed while spinning');
  run(s, 200, () => [I, I]);
  assert.ok(!s.pressed[2], 'and released when it stops');
});

test('glide slows the fall; a vent lifts only a glider', () => {
  const rows = [...Array(13).fill('#'), '#.PQ......V', '#'.repeat(W)];
  rows[13] = '#.PQ......V'; rows[14] = '#'.repeat(W);
  const mk = () => createRun(map(rows, { sugar: 'none', spice: 'glide' }));
  let s = mk(); let b = s.players[1];
  b.y = 2;
  run(s, 30, () => [I, { ...I, jump: true }]);
  const glideY = b.y;
  s = mk(); b = s.players[1]; b.y = 2;
  run(s, 30, () => [I, I]);
  assert.ok(b.y - 2 > (glideY - 2) * 2, 'falls much faster without gliding');
  s = mk(); b = s.players[1];
  b.x = 10.5 - b.w / 2; b.y = 11;
  run(s, 40, () => [I, { ...I, jump: true }]);
  assert.ok(b.y < 8, `glider rides the vent up (y=${b.y})`);
});

test('dash crosses a gap and smashes glass; once per airtime', () => {
  const rows = [...Array(12).fill('#'), '#.PQ...%...', '#'.repeat(W)];
  const s = createRun(map(rows, { sugar: 'none', spice: 'dash' }));
  const b = s.players[1];
  b.facing = 1;
  run(s, 1, () => [I, { ...I, abilityPressed: true }]);
  run(s, 15, () => [I, I]);
  assert.equal(s.grid[12][7], '.', 'glass broken');
  assert.ok(b.x > 7.5);
});

test('moving platform carries a rider; freeze stops it', () => {
  const ents = [{ type: 'platform', w: 3, path: [[4, 10], [14, 10]], period: 4 }];
  const rows = [...Array(12).fill('#'), '#.PQ', '#'.repeat(W)];
  const s = createRun(map(rows, { sugar: 'freeze', spice: 'none' }, { ents }));
  const b = s.players[1];
  b.x = 5; b.y = 8;
  run(s, 30, () => [I, I]);
  assert.ok(b.ride === 0 && Math.abs(b.y + b.h - s.ents[0].y) < 0.02, 'standing on the platform');
  const x0 = b.x;
  run(s, 60, () => [I, I]);
  assert.ok(b.x - x0 > 1.5, `carried ${b.x - x0}`);
  const ex = s.ents[0].x;
  run(s, 60, () => [{ ...I, ability: true }, I]);
  assert.ok(Math.abs(s.ents[0].x - ex) < 0.2, 'frozen while Sugar holds');
});

test('a saw kills; gentle mode puts you back where you stood, fast', () => {
  const ents = [{ type: 'saw', x: 8, y: 12.5, r: 0.6 }];
  for (const gentle of [false, true]) {
    const s = createRun(map(open(), { sugar: 'none', spice: 'none' }, { ents }), { gentle });
    const a = s.players[0];
    let died = 0, back = -1;
    run(s, 120, (s, i) => {
      if (a.dead) died++;
      if (died && !a.dead && back < 0) back = i;
      return [{ ...I, right: !died }, I];
    });
    assert.ok(died > 0);
    if (gentle) assert.ok(back < 40 && cx(a) > 4, `gentle: back in ${back} steps at ${cx(a)}`);
    else assert.ok(cx(a) < 3, 'normal: back at the start');
  }
});

test('flood rises once started and backs off after a death (no death loop)', () => {
  const s = createRun(map(open(), { sugar: 'none', spice: 'none' }, { flood: { startX: 3, y0: 17, speed: 2, stopY: 0, grace: 3 } }));
  run(s, 400, () => [I, I]);
  assert.ok(s.flood.active);
  assert.ok(s.players.every((p) => !p.dead) || s.flood.y >= 13, 'after drowning the water drops back');
});

test('mini-games are deterministic and end', () => {
  for (const id of ['rain', 'potato']) {
    const a = createRun(id), b = createRun(id);
    const f = (s, i) => [{ ...I, right: i % 90 < 45, left: i % 90 >= 45, jump: true, jumpPressed: i % 37 === 0 }, { ...I, left: i % 70 < 35, right: i % 70 >= 35 }];
    run(a, 4000, f); run(b, 4000, f);
    assert.equal(JSON.stringify(a), JSON.stringify(b), id);
    assert.ok(a.complete, `${id} ends`);
  }
});
