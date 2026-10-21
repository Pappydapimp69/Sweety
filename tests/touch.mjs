// Touch screen as a device, driven with real multi-touch events (CDP), not a
// phone-shaped viewport: join with A, walk the menu, hold ▶ while tapping A.
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }
const PORT = 9300 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 900, height: 500 }, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const wait = (ms) => page.waitForTimeout(ms);
const layout = () => page.evaluate(() => {
  const W = innerWidth, H = innerHeight, r = Math.max(26, Math.min(W, H) * 0.075), pad = r * 1.25, by = H - pad - r * 1.0;
  return { left: [pad, by], right: [pad + r * 2.3, by], up: [pad + r * 1.15, by - r * 1.6], down: [pad + r * 1.15, by + r * 0.95], a: [W - pad, by - r * 0.6], b: [W - pad - r * 2.4, by + r * 0.1] };
});
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const tap = async (pt) => { await touch('touchStart', [pt]); await wait(70); await touch('touchEnd', []); await wait(90); };
const screen = () => page.evaluate(() => window.__sweety.app.screen);
try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(400);
  const L = await layout();
  await tap(L.a);
  check((await page.evaluate(() => window.__sweety.app.devices))[0] === 'touch', 'tapping A joins on the touch screen');
  await page.keyboard.press('ArrowUp'); await wait(150);
  await tap(L.a);
  check(await screen() === 'menu', 'A goes to the menu');
  await page.screenshot({ path: `${process.argv[2] || '.'}/40-touch-menu.png` });
  await tap(L.down); await wait(50);
  check(await page.evaluate(() => window.__sweety.app.menuIndex) === 1, '▼ moves the cursor');
  await tap(L.b);
  check(await screen() === 'title', 'B goes back');
  await tap(L.a); await tap(L.up);
  check(await page.evaluate(() => window.__sweety.app.menuIndex) === 0, '▲ moves back up');
  await tap(L.down); await tap(L.a);   // Chapters sits under Play
  check(await screen() === 'chapters', 'A on Chapters');
  await tap(L.a);
  for (let i = 0; i < 4 && await screen() === 'story'; i++) await tap(L.a);
  check(await screen() === 'play' && await page.evaluate(() => window.__sweety.app.run.chapterId) === 'garden', 'into the garden');
  const x0 = await page.evaluate(() => window.__sweety.app.run.players[0].x);
  await touch('touchStart', [L.right]); await wait(300);
  await page.evaluate(() => { window.__minY = 99; window.__watch = setInterval(() => { window.__minY = Math.min(window.__minY, window.__sweety.app.run.players[0].y); }, 10); });
  const y0 = await page.evaluate(() => window.__sweety.app.run.players[0].y);
  await touch('touchMove', [L.right, L.a]); await wait(120);   // second finger on A while holding ▶
  await touch('touchMove', [L.right]); await wait(250);
  const minY = await page.evaluate(() => window.__minY);
  check(y0 - minY > 1, `A with a second finger jumps (rose ${(y0 - minY).toFixed(2)})`);
  const p = await page.evaluate(() => { const q = window.__sweety.app.run.players[0]; return { x: q.x, vy: q.vy, g: q.onGround, y: q.y }; });
  await touch('touchEnd', []);
  check(p.x - x0 > 2, `holding ▶ walks (${(p.x - x0).toFixed(2)} tiles)`);
  const jumped = await page.evaluate(() => window.__sweety.app.run.tick);
  check(jumped > 0, 'running');
  await page.screenshot({ path: `${process.argv[2] || '.'}/41-touch-play.png` });
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
} catch (e) { console.log('FAIL - exception', e.message); failed++; }
finally { await browser.close(); server.kill(); }
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
