// Browser play-through: the real page, real keyboard for the menus, and the same
// bot routes as the node tests driving every chapter to its end in Chromium.
// Not part of `npm test` (needs Chromium).   node tests/browser.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }

const OUT = process.argv[2] || 'shots';
mkdirSync(OUT, { recursive: true });
const PORT = 8700 + Math.floor(Math.random() * 200);   // own port per run
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const screen = () => page.evaluate(() => window.__sweety.app.screen);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await wait(60); } };
async function waitFor(fn, arg, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); }
  return false;
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(600);
  await shot('00-title');
  await page.keyboard.press('KeyW');
  await page.keyboard.press('ArrowUp');
  await wait(200);
  const devs = await page.evaluate(() => window.__sweety.app.devices);
  check(devs[0] === 'kbL' && devs[1] === 'kbR', `left and right keyboard halves join (${devs})`);
  await shot('01-joined');
  await page.keyboard.press('KeyW'); await wait(250);
  check(await screen() === 'menu', 'jump goes to the main menu');
  await wait(400); await shot('02-menu');
  await press('ArrowDown', 'ArrowUp', 'KeyW', 'ArrowDown');
  await wait(100);
  check(await page.evaluate(() => window.__sweety.app.menuIndex) === 0 && await screen() === 'menu', 'up / W move the cursor and never confirm');
  await page.keyboard.press('Enter'); await wait(300);
  check(await screen() === 'chapters', 'Enter on Story opens the chapter list');
  await shot('03-chapters');
  await page.keyboard.press('Space'); await wait(300);
  check(await screen() === 'story', 'picking chapter 1 tells its intro first');
  await shot('04-story');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await wait(200); }
  const st = await page.evaluate(() => [window.__sweety.app.screen, window.__sweety.app.run?.chapterId]);
  check(st[0] === 'play' && st[1] === 'garden', `after the intro, chapter 1 starts (${st})`);
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowRight');
  await wait(700);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowRight');
  const xs = await page.evaluate(() => window.__sweety.app.run.players.map((p) => p.x));
  check(xs[0] > 3 && xs[1] > 4, `both walk on the keyboard (${xs.map((x) => x.toFixed(1))})`);
  await wait(1200); await shot('05-garden-start');
  await page.keyboard.press('Escape'); await wait(200);
  check(await screen() === 'pause', 'Esc pauses');
  await shot('06-pause');
  await press('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp');
  await wait(100);
  const pi = await page.evaluate(() => [window.__sweety.app.pauseIndex, window.__sweety.app.screen]);
  check(pi[0] === 2, `pause menu moves with the arrows (${pi})`);
  await page.keyboard.press('Space'); await wait(200);
  check(await screen() === 'settings', 'pause → settings');
  await press('ArrowDown', 'ArrowDown', 'ArrowRight'); await wait(150);
  check(await page.evaluate(() => window.__sweety.app.progress.settings.gentle) === true, 'gentle mode toggles');
  await shot('07-settings');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('sweety:progress')).settings.gentle) === true, 'and is saved');
  await page.keyboard.press('Escape'); await wait(200);
  check(await screen() === 'pause', 'settings back to pause');
  await page.keyboard.press('Escape'); await wait(200);
  check(await screen() === 'play', 'and back to play');
  check(await page.evaluate(() => window.__sweety.app.run.gentle) === true, 'gentle applies to the run in progress');

  // ---- every chapter, driven by the bot routes in the real page
  const chapters = ['garden', 'toolbox', 'night', 'attic', 'sky', 'clock', 'home'];
  for (const id of chapters) {
    const ok = await page.evaluate(async (id) => {
      const ph = await import('/tests/phases.mjs');
      const { chapterById } = await import('/src/levels.js');
      const fns = { garden: ph.gardenPhases, toolbox: ph.toolboxPhases, night: ph.nightPhases, attic: ph.atticPhases, sky: ph.skyPhases, clock: ph.clockPhases, home: () => ph.homePhases(chapterById('home')) };
      const phases = fns[id]();
      const sw = window.__sweety;
      sw.app.progress.settings.gentle = false;
      sw.start(id);
      let i = 0;
      window.__phase = phases[0].name;
      sw.app.driver = (s) => {
        while (i < phases.length && phases[i].done(s)) i++;
        window.__phase = i < phases.length ? phases[i].name : 'done';
        return i < phases.length ? phases[i].ctrl(s) : [{}, {}];
      };
      sw.app.turbo = 6;
      return true;
    }, id);
    // screenshot mid-chapter, at normal speed
    await waitFor(() => window.__sweety.app.run && window.__sweety.app.run.tick > 1300 || window.__sweety.app.run.complete, null, 60000);
    await page.evaluate(() => { window.__sweety.app.turbo = 1; window.__sweety.app.banner = 0; });
    await wait(700);
    await shot(`10-${id}-mid`);
    await page.evaluate(() => { window.__sweety.app.turbo = 6; });
    const done = await waitFor(() => window.__sweety.app.run.complete, null, 180000);
    const phase = await page.evaluate(() => window.__phase);
    check(ok && done, `${id}: played to the end in the browser${done ? '' : ` (stuck at "${phase}")`}`);
    await page.evaluate(() => { window.__sweety.app.driver = null; window.__sweety.app.turbo = 0; });
    await waitFor(() => window.__sweety.app.screen === 'story' || window.__sweety.app.screen === 'complete', null, 5000);
    await shot(`11-${id}-outro`);
    while (await screen() === 'story') { await page.keyboard.press('Enter'); await wait(150); }
    check(await screen() === 'complete', `${id}: outro then the chapter card`);
    await shot(`12-${id}-complete`);
  }
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('sweety:progress')).unlocked) >= 7, 'every chapter unlocked and saved');
  await page.keyboard.press('Enter'); await wait(400);
  check(await screen() === 'credits', 'finishing Home rolls the credits');
  await wait(4000); await shot('13-credits');
  await page.keyboard.press('Enter'); await wait(300);
  check(await screen() === 'menu', 'credits back to the menu');

  // ---- mini-games: real keyboard mashing
  for (const id of ['bonk', 'rain', 'potato']) {
    await page.evaluate((id) => window.__sweety.start(id), id);
    await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft');
    for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp'); await wait(250); }
    await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
    await shot(`20-${id}`);
    check(await screen() === 'play', `${id} runs`);
  }
  check(errors.length === 0, `no console errors ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  console.log('FAIL - exception', e.message);
  failed++;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
