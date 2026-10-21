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
// wait for a state, not a time: a slow software-rendered frame can take most of a second
async function until(f, arg, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(f, arg)) return true; await wait(50); } return false; }
// hold a key until someone has moved, then let go and let them stop
async function holdUntilMoved(key, who, from) { await page.keyboard.down(key); await until(([w, f]) => window.__sweety.app.run.players[w].x > f + 1.2, [who, from], 5000); await page.keyboard.up(key); await until(() => window.__sweety.app.run.players.every((p) => Math.abs(p.vx) < 0.05), null, 3000); }
const devs = (want) => until((w) => JSON.stringify(window.__sweety.app.devices) === w, want);

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
  await until(() => window.__sweety.app.splashT > 0.4); await page.keyboard.press('Space');
  check(await until(() => window.__sweety.app.screen === 'title'), 'a key skips the splash');

  // ---- title: two join, right trades sides
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await until(() => window.__sweety.app.screen === 'title' && window.__sweety.app.t > 0.3);
  await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp');
  check(await devs('["kbL","kbR"]'), 'both join');
  await page.keyboard.press('KeyD');
  check(await devs('["kbR","kbL"]'), 'D on the title trades characters');
  await shot('s3-traded');

  // ---- mid-level trade: Tab hands the characters over, the world is untouched
  await app(() => window.__sweety.start('garden'));
  await until(() => window.__sweety.app.run.tick > 40 && window.__sweety.app.run.players.every((p) => p.onGround));
  const before = await app(() => window.__sweety.app.run.players.map((p) => [p.x, p.y]));
  await page.keyboard.press('Tab');
  check(await devs('["kbL","kbR"]'), 'Tab in a level trades back');
  const after = await app(() => window.__sweety.app.run.players.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10)]));
  check(after.every((a, i) => Math.abs(a[0] - Math.round(before[i][0] * 10)) <= 1), 'nobody moved');
  // the left half now drives Sugar again
  await holdUntilMoved('KeyD', 0, before[0][0]);
  const xs = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(xs[0] > before[0][0] + 1 && Math.abs(xs[1] - before[1][0]) < 0.2, `D moves Sugar, not Spice (${before.map(b=>b[0].toFixed(2))} -> ${xs.map(x=>x.toFixed(2))})`);

  // ---- solo: one keyboard half, Tab flips who it drives
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await until(() => window.__sweety.app.screen === 'title' && window.__sweety.app.t > 0.3);
  await page.keyboard.press('KeyW');
  await until(() => window.__sweety.app.devices[0] === 'kbL'); await wait(600);
  await page.keyboard.press('KeyW');
  check(await until(() => window.__sweety.app.screen === 'menu'), 'alone: jump again goes to the menu');
  await page.keyboard.press('Space');
  check(await until(() => window.__sweety.app.screen === 'play' && window.__sweety.app.run?.chapterId === 'world'), 'Play opens the island with one player');
  await app(() => window.__sweety.start('garden'));
  await until(() => window.__sweety.app.run.chapterId === 'garden' && window.__sweety.app.run.tick > 40 && window.__sweety.app.run.players.every((p) => p.onGround));
  const s0 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  await holdUntilMoved('KeyD', 0, s0[0]);
  const s1 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(s1[0] > s0[0] + 1 && Math.abs(s1[1] - s0[1]) < 0.2, 'solo drives Sugar first');
  await page.keyboard.press('Tab');
  await until(() => window.__sweety.app.active === 1);
  await holdUntilMoved('KeyD', 1, s1[1]);
  const s2 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(s2[1] > s1[1] + 1 && Math.abs(s2[0] - s1[0]) < 0.2, 'after Tab the same keys drive Spice');
  await shot('s4-solo-spice');

  // ---- testing alone with the AI partner: Settings -> Playing alone -> AI
  await app(() => { window.__sweety.app.progress.settings.alone = 'ai'; window.__sweety.app.active = 0; });   // you play Sugar, the AI Spice
  await app(() => window.__sweety.start('garden'));
  await until(() => window.__sweety.app.run.tick > 30);
  const a0 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(await until(() => window.__sweety.app.run.players[1].x > 12, null, 15000), 'the AI moves Spice while you stand still');
  const a1 = await app(() => window.__sweety.app.run.players.map((p) => p.x));
  check(Math.abs(a1[0] - a0[0]) < 0.3, 'and leaves Sugar to you');
  await shot('s5-ai-partner');
  // watch: the AI plays both to the end of the Garden (turbo, so it doesn't take minutes)
  await app(() => { const a = window.__sweety.app; a.watch = true; a.turbo = 6; });
  check(await until(() => ['ending', 'story', 'complete'].includes(window.__sweety.app.screen) || window.__sweety.app.run.complete, null, 90000), 'watching: the AI plays the Garden to the end');
  await app(() => { const a = window.__sweety.app; a.watch = false; a.turbo = 0; a.progress.settings.alone = 'switch'; });
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
} catch (e) { console.log('FAIL -', e); failed++; }
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
