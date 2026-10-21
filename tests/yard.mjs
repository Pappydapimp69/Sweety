// Browser: the Yard on the real page. Play from the menu, every district on screen,
// toys on screen, a door into a chapter and back out of the same door, and a star saved.
// node tests/yard.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }
const OUT = process.argv[2] || 'shots';
mkdirSync(OUT, { recursive: true });
const PORT = 8700 + Math.floor(Math.random() * 200);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const wait = (ms) => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
async function waitFor(f, a, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(f, a)) return true; await wait(100); } return false; }
// put both of you somewhere in the Yard (feet on the ground)
const place = (x, ft = 24) => ev(([x, ft]) => { const s = window.__sweety.app.run; s.players.forEach((p, i) => { p.x = x + i * 1.1 - p.w / 2; p.y = ft - p.h; p.vx = 0; p.vy = 0; p.prevY = p.y; }); }, [x, ft]);

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(800);
  await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp'); await wait(300);
  await page.keyboard.press('KeyW');
  check(await waitFor(() => window.__sweety.app.screen === 'menu', null, 5000), `menu (${await ev(() => window.__sweety.app.screen + ' ' + window.__sweety.app.devices)})`);
  await wait(300);
  await page.keyboard.press('Space'); await wait(500);   // "Play" is the first item
  check(await ev(() => window.__sweety.app.screen === 'play' && window.__sweety.app.run.chapterId === 'yard'), 'Play opens the Yard');
  await wait(800); await shot('y00-plaza-start');
  // a first-time Yard: only the Garden is open
  check(await ev(() => window.__sweety.app.run.grid[10][100] === '#'), 'the Workshop gate is shut on a fresh save');
  // every district, unlocked
  await ev(() => { const a = window.__sweety.app; a.progress.unlocked = 8; });
  await ev(() => window.__sweety.yard(null)); await wait(500);
  for (const [name, x, ft] of [['plaza-toys', 22, 24], ['plaza-footy', 42, 26], ['plaza-race', 32, 16], ['garden', 72, 24], ['workshop', 118, 24], ['night', 150, 24], ['attic', 196, 24], ['rooftops', 232, 24], ['clock', 284, 24]]) {
    await place(x, ft); await wait(1200);
    const zone = await ev(() => window.__sweety.app.zone);
    await shot(`y-${name}`);
    check(!!zone, `${name}: on screen (${zone})`);
  }
  // a toy plays out on the page: the bench
  await place(29.6);
  check(await waitFor(() => window.__sweety.app.bubbles.length > 0, null, 10000), 'the bench: sitting together says something sweet');
  await shot('y-bench');
  // a star is saved to progress
  const before = await ev(() => Object.keys(window.__sweety.app.progress.stars).length);
  await place(54.6, 12); await wait(400);
  await ev(() => { const p = window.__sweety.app.run.players[0]; p.x = 55.5 - p.w / 2; p.y = 12 - p.h; });
  await wait(300);
  const after = await ev(() => Object.keys(window.__sweety.app.progress.stars).length);
  const saved = await ev(() => JSON.parse(localStorage.getItem('sweety:progress') || '{}').stars || {});
  check(after === before + 1 && saved['55:11'] === true, `a star is counted and saved (${before} -> ${after})`);
  // in through the Garden door, finish, back out of the same door
  await place(63.5); await wait(100);
  check(await waitFor(() => ['story', 'play'].includes(window.__sweety.app.screen) && window.__sweety.app.run?.chapterId === 'garden' || window.__sweety.app.screen === 'story'), 'standing in the Garden door together starts the Garden');
  for (let i = 0; i < 6 && await ev(() => window.__sweety.app.screen === 'story'); i++) { await page.keyboard.press('Space'); await wait(250); }
  await waitFor(() => window.__sweety.app.screen === 'play' && window.__sweety.app.run.chapterId === 'garden');
  await shot('y-into-garden');
  await ev(() => { window.__sweety.app.run.complete = true; window.__sweety.app.ending = 0.1; window.__sweety.app.screen = 'ending'; });
  for (let i = 0; i < 12 && !(await ev(() => window.__sweety.app.run?.chapterId === 'yard')); i++) { await page.keyboard.press('Space'); await wait(400); }
  const back = await ev(() => { const a = window.__sweety.app; return a.run && a.run.chapterId === 'yard' ? a.run.players.map((p) => p.x + p.w / 2) : null; });
  check(back && Math.abs(back[0] - 64) < 2, `finishing it brings you back out of the Garden door (${back})`);
  await shot('y-back-at-garden-door');
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
} catch (e) { console.log('FAIL -', e); failed++; }
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'ALL OK');
process.exit(failed ? 1 : 0);
