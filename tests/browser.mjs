// Browser smoke: real page, real keyboard. Not part of `npm test` (needs Chromium).
//   node tests/browser.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }

const OUT = process.argv[2] || '.';
const PORT = 8700 + Math.floor(Math.random() * 200);   // own port per run
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/0-title.png` });
  // both join from one keyboard
  await page.keyboard.press('KeyW');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  const devs = await page.evaluate(() => window.__sweety.app.devices);
  check(devs[0] === 'kbL' && devs[1] === 'kbR', `left and right keyboard halves join (${devs})`);
  await page.screenshot({ path: `${OUT}/1-joined.png` });
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__sweety.app.screen) === 'chapters', 'jump goes to chapter select');
  await page.screenshot({ path: `${OUT}/2-chapters.png` });
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => [window.__sweety.app.screen, window.__sweety.app.run?.chapterId]);
  check(st[0] === 'play' && st[1] === 'garden', `confirm starts chapter 1, not a neighbour (${st})`);
  // walk right with both
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowRight');
  const xs = await page.evaluate(() => window.__sweety.app.run.players.map((p) => p.x));
  check(xs[0] > 3 && xs[1] > 4, `both moved right (${xs.map((x) => x.toFixed(1))})`);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/3-garden.png` });
  // pause and back
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => window.__sweety.app.screen) === 'pause', 'Esc pauses');
  await page.screenshot({ path: `${OUT}/4-pause.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  for (const [id, x, y] of [['toolbox', 38, 9], ['night', 78, 10], ['bonk', 8, 12]]) {
    await page.evaluate(([id, x, y]) => {
      window.__sweety.start(id);
      const s = window.__sweety.app.run;
      s.players[0].x = x; s.players[0].y = y - 1.25; s.players[1].x = x + 1.2; s.players[1].y = y - 1.25;
      window.__sweety.app.banner = 0;
    }, [id, x, y]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/5-${id}.png` });
  }
  // a chapter end
  await page.evaluate(() => { window.__sweety.start('garden'); const s = window.__sweety.app.run; for (const p of s.players) { p.x = 97.2; p.y = 11.75; } });
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.__sweety.app.screen) === 'complete', 'standing in the goal together ends the chapter');
  await page.screenshot({ path: `${OUT}/6-complete.png` });
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('sweety:progress')).unlocked) === 2, 'chapter 2 unlocked and saved');
  check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
