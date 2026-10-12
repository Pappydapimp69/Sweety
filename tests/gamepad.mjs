// Two emulated gamepads: join with A, navigate with the d-pad, play with the stick,
// unplug one mid-chapter and the game pauses.   node tests/gamepad.mjs
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }

const PORT = 8900 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// Fake pads: window.__pads[i] = { buttons: {n: bool}, axes: [x, y], connected }
await page.addInitScript(() => {
  window.__pads = [0, 1].map(() => ({ buttons: {}, axes: [0, 0], connected: true }));
  navigator.getGamepads = () => window.__pads.map((p, i) => (p.connected ? {
    index: i, connected: true, id: `fake ${i}`, mapping: 'standard',
    axes: p.axes, buttons: Array.from({ length: 17 }, (_, n) => ({ pressed: !!p.buttons[n], value: p.buttons[n] ? 1 : 0 })),
  } : null));
});
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const wait = (ms) => page.waitForTimeout(ms);
const tap = async (pad, btn) => { await page.evaluate(([p, b]) => { window.__pads[p].buttons[b] = true; }, [pad, btn]); await wait(80); await page.evaluate(([p, b]) => { window.__pads[p].buttons[b] = false; }, [pad, btn]); await wait(80); };
const screen = () => page.evaluate(() => window.__sweety.app.screen);
try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(500);
  await tap(1, 0); await tap(0, 0);
  const devs = await page.evaluate(() => window.__sweety.app.devices);
  check(devs[0] === 'pad1' && devs[1] === 'pad0', `pads join in the order they press A (${devs})`);
  await tap(0, 0);
  check(await screen() === 'menu', 'A goes to the menu');
  await tap(0, 13); await tap(0, 12);
  check(await page.evaluate(() => window.__sweety.app.menuIndex) === 0, 'd-pad down then up');
  await tap(1, 0);
  check(await screen() === 'chapters', 'A on Story');
  await tap(1, 1);
  check(await screen() === 'menu', 'B goes back');
  await tap(1, 0); await tap(1, 0);
  for (let i = 0; i < 4 && await screen() === 'story'; i++) await tap(0, 0);
  check(await screen() === 'play', 'A pages through the intro into play');
  // stick right on both
  await page.evaluate(() => { window.__pads[0].axes = [1, 0]; window.__pads[1].axes = [0.9, 0.1]; });
  await wait(800);
  await page.evaluate(() => { window.__pads[0].axes = [0.2, 0.1]; window.__pads[1].axes = [0, 0]; });
  await wait(300);
  const xs = await page.evaluate(() => window.__sweety.app.run.players.map((p) => p.x));
  check(xs[0] > 4 && xs[1] > 4, `both walk with the stick (${xs.map((x) => x.toFixed(1))})`);
  const vx = await page.evaluate(() => window.__sweety.app.run.players[1].vx);
  check(Math.abs(vx) < 0.01, 'a small stick drift (0.2, 0.1) is inside the radial deadzone');
  await tap(0, 0);
  await wait(100);
  check(await page.evaluate(() => window.__sweety.app.run.players.some((p) => !p.onGround || p.vy !== 0)), 'A jumps');
  await page.evaluate(() => { window.__pads[1].connected = false; });
  await wait(300);
  check(await screen() === 'pause', 'unplugging a controller pauses');
  await page.evaluate(() => { window.__pads[1].connected = true; });
  await tap(0, 9);
  check(await screen() === 'play', 'Start resumes');
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
} catch (e) { console.log('FAIL - exception', e.message); failed++; }
finally { await browser.close(); server.kill(); }
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
