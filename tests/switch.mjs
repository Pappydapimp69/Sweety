// Browser: the splash gag, trading characters on the title and mid-level, and solo play
// (one device, the switch button flips which character it drives).   node tests/switch.mjs [outDir]
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
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const wait = (ms) => page.waitForTimeout(ms);
const app = (f) => page.evaluate(f);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

try {
  // ---- splash: Stupido, then Stu, then Studios, then the title
  await page.goto(`http://127.0.0.1:${PORT}/index.html?splash`);
  check(await app(() => window.__sweety.app.screen) === 'splash', 'the page opens on the splash');
  await wait(1700); await shot('s0-stupido');
  await wait(1000); await shot('s1-stu');
  await wait(1300); await shot('s2-studios');
  const seen = await app(() => window.__sweety.app.splashT);
  check(seen > 3, `splash still up after the gag (${seen.toFixed(1)}s)`);
  await wait(2200);
  check(await app(() => window.__sweety.app.screen) === 'title', 'splash ends on the title by itself');

  // skip with a key
  await page.goto(`http://127.0.0.1:${PORT}/index.html?splash`);
  await wait(500); await page.keyboard.press('Space'); await wait(150);
  check(await app(() => window.__sweety.app.screen) === 'title', 'a key skips the splash');

  // ---- title: two join, right trades sides
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(400);
  await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp'); await wait(150);
  check(JSON.stringify(await app(() => window.__sweety.app.devices)) === '["kbL","kbR"]', 'both join');
  await page.keyboard.press('KeyD'); await wait(150);
  check(JSON.stringify(await app(() => window.__sweety.app.devices)) === '["kbR","kbL"]', 'D on the title trades characters');
  await shot('s3-traded');

  // ---- mid-level trade: Tab hands the characters over, the world is untouched
  await app(() => window.__sweety.start('garden')); await wait(800);
  const before = await app(() => window.__sweety.app.run.players.map((p) => [p.x, p.y]));
  await page.keyboard.press('Tab'); await wait(150);
  check(JSON.stringify(await app(() => window.__sweety.app.devices)) === '["kbL","kbR"]', 'Tab in a level trades back');
  const after = await app(() => window.__sweety.app.run.players.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10)]));
  check(after.every((a, i) => Math.abs(a[0] - Math.round(before[i][0] * 10)) <= 1), 'nobody moved');
  // the left half now drives Sugar again
  await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD');
  const xs = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(xs[0] > before[0][0] + 1 && Math.abs(xs[1] - before[1][0]) < 0.2, `D moves Sugar, not Spice (${before.map(b=>b[0].toFixed(2))} -> ${xs.map(x=>x.toFixed(2))})`);

  // ---- solo: one keyboard half, Tab flips who it drives
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(400);
  await page.keyboard.press('KeyW'); await wait(600); await page.keyboard.press('KeyW'); await wait(200);
  check(await app(() => window.__sweety.app.screen) === 'menu', 'alone: jump again goes to the menu');
  await page.keyboard.press('Space'); await wait(200);
  check(await app(() => window.__sweety.app.screen) === 'chapters', 'Story opens with one player');
  await app(() => window.__sweety.start('garden')); await wait(800);
  const s0 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD'); await wait(100);
  const s1 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(s1[0] > s0[0] + 1 && Math.abs(s1[1] - s0[1]) < 0.2, 'solo drives Sugar first');
  await page.keyboard.press('Tab'); await wait(150);
  await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD'); await wait(100);
  const s2 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(s2[1] > s1[1] + 1 && Math.abs(s2[0] - s1[0]) < 0.2, 'after Tab the same keys drive Spice');
  await shot('s4-solo-spice');
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
} catch (e) { console.log('FAIL -', e); failed++; }
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
