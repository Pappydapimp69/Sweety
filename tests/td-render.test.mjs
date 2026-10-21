// The top-down renderer only reads: drawing the world at every phase of a play-through, with
// every toy mid-game, leaves the sim state byte-identical. Runs in node on a fake 2D context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, NO_INPUT } from '../src/sim.js';
import { step } from '../src/td/sim.js';
import { drawTD, makeTDCamera, snapTDCamera, STYLES } from '../src/td/render.js';
import { mainPhases } from './tdphases.mjs';

// a 2D context that accepts every call and every property, and counts the calls
function fakeCtx(log) {
  const fakeGradient = { addColorStop() {} };
  const fn = (name) => (...a) => { if (log) log.push([name, a]); return fakeGradient; };
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : fn(k)),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return fakeCtx(); } };

const world = () => createRun('world', { unlocked: [0, 1], hearts: [] });
const SIZES = [[1280, 720], [390, 844], [844, 390]];

function drawAll(s, cam, t = s.time) {
  const ctx = fakeCtx();
  for (const [W, H] of SIZES) {
    snapTDCamera(cam, s, W, H, true);
    drawTD(ctx, s, cam, W, H, [{ x: s.players[0].x, y: s.players[0].y, vx: 0, vy: 0, life: 0.5, max: 1, kind: 'heart', color: '#ff4d6d' }], t);
  }
}
function checkReadOnly(s, cam, what) {
  const before = JSON.stringify(s);
  drawAll(s, cam);
  assert.equal(JSON.stringify(s), before, `render mutated state: ${what}`);
}

test('render never writes sim state: the main path through the Meadow and the Workshop', () => {
  const s = world();
  const cam = makeTDCamera(s);
  let checks = 0;
  for (const ph of mainPhases()) {
    let n = 0;
    const max = ph.max || 1200;
    while (!ph.done(s) && n++ < max) {
      step(s, ph.ctrl(s));
      if (n % 25 === 0) { checkReadOnly(s, cam, ph.name); checks++; }
    }
    checkReadOnly(s, cam, `${ph.name} (end)`); checks++;
  }
  assert.ok(checks > 40, `only ${checks} checks`);
  assert.deepEqual(s.hearts, [0, 1], 'the route did not reach both hearts: the states drawn were not the whole path');
});

test('render never writes sim state: every toy, mid-game, and every live tile', () => {
  const s = world();
  const cam = makeTDCamera(s);
  const e = (type) => s.ents.find((q) => q.type === type);
  const plaza = s.zones.find((z) => z.id === 'plaza');
  // in the Plaza
  s.players[0].x = plaza.x0 + 16.5; s.players[0].y = plaza.y0 + 17.5;
  s.players[1].x = plaza.x0 + 17.5; s.players[1].y = plaza.y0 + 17.5;
  const states = [
    () => { const r = e('race'); r.phase = 'count'; r.count = 2.4; },
    () => { const r = e('race'); r.phase = 'run'; r.clock = 12.3; r.next = [1, 2]; },
    () => { const r = e('race'); r.phase = 'rest'; r.winner = 1; },
    () => { const b = e('ball'); b.score = [3, 4]; b.winner = 1; b.x += 2; },
    () => { const b = e('balloons'); b.n = [4, 9]; },
    () => { const b = e('balloons'); b.winner = 0; b.rest = 1; },
    () => { e('bench').sit = 1; },
    () => { s.players[0].hop = 0.2; s.players[1].fly = { x0: 0, y0: 0, x1: 1, y1: 1, t: 0.3, dur: 0.8 }; },
    () => { s.players[0].dead = true; s.players[0].deadT = 0.3; s.players[1].size = 'big'; s.players[1].freezing = true; s.frozen = true; },
    () => { s.nails.push({ x: s.players[0].x, y: s.players[0].y, dx: 1, dy: 0, dist: 1 }); },
    () => { s.pressed = [false, true, true, true, true]; },
    () => { for (const st of s.ents.filter((q) => q.type === 'stone')) { st.wait = 0.4; st.lit = false; } },
    () => { for (const h of s.ents.filter((q) => q.type === 'heart')) h.got = true; },
    () => { for (const sw of s.ents.filter((q) => q.type === 'switch')) sw.on = true; },
  ];
  const spots = s.zones.map((z) => [z.x0 + 15.5, z.y0 + 12.5]);
  let checks = 0;
  for (const f of states) {
    f();
    for (const [x, y] of [[s.players[0].x, s.players[0].y], ...spots]) {
      const keep = [s.players[0].x, s.players[0].y];
      s.players[0].x = x; s.players[0].y = y;
      checkReadOnly(s, cam, `${f.toString().slice(6, 60)} at ${x},${y}`); checks++;
      [s.players[0].x, s.players[0].y] = keep;
    }
    step(s, [NO_INPUT, NO_INPUT]);
  }
  assert.ok(checks >= states.length * 5);
});

test('every style paints every static tile in a world made of them', () => {
  // the unbuilt regions are pits; fill one of each style with every tile kind and draw it
  const s = world();
  const kinds = '.#Twou^=r';
  for (const z of s.zones) for (let y = z.y0 + 1; y < z.y1 - 1; y++) for (let x = z.x0 + 1; x < z.x1 - 1; x++) s.grid[y][x] = kinds[(x * 7 + y * 3) % kinds.length];
  const cam = makeTDCamera(s);
  for (const z of s.zones) {
    assert.ok(STYLES[z.style], `zone ${z.id} has no style "${z.style}"`);
    s.players[0].x = s.players[1].x = z.x0 + 17; s.players[0].y = s.players[1].y = z.y0 + 13;
    checkReadOnly(s, cam, `style ${z.style}`);
  }
});

test('the camera frames both players, fits the short side, and stays on the map', () => {
  const s = world();
  const cam = makeTDCamera(s);
  for (const [W, H] of SIZES) {
    s.players[0].x = 40; s.players[0].y = 40; s.players[1].x = 52; s.players[1].y = 46;
    snapTDCamera(cam, s, W, H, true);
    for (const p of s.players) {
      const X = (p.x - cam.x) * cam.scale + W / 2, Y = (p.y - cam.y) * cam.scale + H / 2;
      assert.ok(X > 0 && X < W && Y > 0 && Y < H, `player off screen at ${W}x${H}: ${X},${Y}`);
    }
    // close together: zoomed in, scale from the short side
    s.players[1].x = 41; s.players[1].y = 40;
    snapTDCamera(cam, s, W, H, true);
    assert.ok(Math.abs(cam.scale - Math.min(W, H) / 12) < 1e-9, `scale ${cam.scale} at ${W}x${H}`);
    // in a corner: the view stays on the map
    s.players[0].x = 1.5; s.players[0].y = 1.5; s.players[1].x = 2.5; s.players[1].y = 1.5;
    snapTDCamera(cam, s, W, H, true);
    assert.ok(cam.x - W / 2 / cam.scale >= -1e-9 && cam.y - H / 2 / cam.scale >= -1e-9, 'view hangs off the map');
  }
});

test('no Math.random and no per-frame blur in the renderer', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/td/render.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random/.test(src), 'Math.random in td/render.js');
  assert.ok(!/shadowBlur|\.filter\s*=/.test(src), 'shadowBlur or ctx.filter in td/render.js');
});

test('negative control: a renderer that writes IS caught', () => {
  const s = world();
  const cam = makeTDCamera(s);
  const before = JSON.stringify(s);
  drawAll(s, cam);
  s.players[0].x += 0.001;   // what a stray `=` in render would do
  assert.notEqual(JSON.stringify(s), before);
  // and the check above really runs the renderer: a draw makes calls on the context
  const log = [];
  drawTD(fakeCtx(log), s, cam, 1280, 720, [], 0);
  assert.ok(log.length > 100, `drawTD made only ${log.length} calls`);
});
