// Two real browsers (separate profiles) play online through the public PeerJS
// broker: connect by code, start a chapter, replay a recorded play-through on
// each side, and finish with identical worlds.   node tests/online.mjs
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }

const PORT = 9100 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] }).catch(() => chromium.launch());
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const errors = [];
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForTimeout(400);
  return page;
}
const until = async (page, fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(150); } return false; };
const shot = (page, n) => page.screenshot({ path: `${process.argv[2] || '.'}/${n}.png` });

try {
  const A = await open('host'), B = await open('guest');
  // host: one player on the keyboard, alone, then Play online -> Host
  await A.keyboard.press('KeyW'); await A.waitForTimeout(600); await A.keyboard.press('KeyW'); await A.waitForTimeout(200);
  check(await A.evaluate(() => window.__sweety.app.screen) === 'menu', 'a single player can go on alone');
  await A.evaluate(() => window.__sweety.host());
  const hosting = await until(A, () => window.__sweety.app.online?.status === 'hosting');
  check(hosting, 'host opened a room on the broker');
  const code = await A.evaluate(() => window.__sweety.app.online.code);
  await shot(A, '30-online-host');
  // guest arrives by link
  await B.goto(`http://127.0.0.1:${PORT}/index.html?join=${code}`);
  await B.waitForTimeout(400);
  await B.keyboard.press('ArrowUp');
  const joined = await until(B, () => window.__sweety.app.online?.status === 'connected') && await until(A, () => window.__sweety.app.online?.status === 'connected');
  check(joined, `guest joined by link (code ${code})`);
  check(await B.evaluate(() => window.__sweety.app.online.slot) === 1, 'guest plays Spice');
  await shot(B, '31-online-guest');
  // host picks Chapters (under The Yard) -> chapter 1
  await A.keyboard.press('KeyS'); await A.waitForTimeout(100);
  await A.keyboard.press('Space'); await A.waitForTimeout(300);
  check(await A.evaluate(() => window.__sweety.app.screen) === 'chapters', 'host picks from the chapter list');
  // record a tape offline, in the page, then start
  const prep = `(async () => {
    const ph = await import('/tests/phases.mjs');
    const sim = await import('/src/sim.js');
    const { DELAY } = await import('/src/lockstep.js');
    const s = sim.createRun('garden'), tape = [];
    for (let k = 0; k < DELAY; k++) { sim.step(s, [sim.NO_INPUT, sim.NO_INPUT]); tape.push([sim.NO_INPUT, sim.NO_INPUT]); }
    for (const p of ph.gardenPhases()) { let n = 0; while (!p.done(s) && n++ < 3000) { const i = p.ctrl(s).map((x) => ({ ...sim.NO_INPUT, ...x })); tape.push(i); sim.step(s, i); } }
    window.__tape = tape;
    const slot = () => window.__sweety.app.online.slot;
    window.__sweety.app.driver = (run, ls) => (window.__tape[ls.scheduled] || [sim.NO_INPUT, sim.NO_INPUT])[slot()];
    return tape.length;
  })()`;
  const len = await A.evaluate(prep); await B.evaluate(prep);
  await A.keyboard.press('Space');
  check(await until(B, () => window.__sweety.app.screen === 'story'), 'guest is pulled into the chapter intro');
  for (const [P, key] of [[A, 'Space'], [B, 'Enter']]) for (let i = 0; i < 3; i++) { await P.keyboard.press(key); await P.waitForTimeout(150); }
  check(await until(A, () => window.__sweety.app.screen === 'play') && await until(B, () => window.__sweety.app.screen === 'play'), 'both in play');
  // how often would "Waiting for..." show while both are playing?
  const shown = await Promise.all([A, B].map((P) => P.evaluate(() => new Promise((res) => {
    let n = 0, on = 0;
    const iv = setInterval(() => { const o = window.__sweety.app.online; n++; if (o && o.stall > 0.8) on++; if (n >= 150) { clearInterval(iv); res(on / n); } }, 20);
  }))));
  check(shown[0] < 0.1 && shown[1] < 0.1, `"Waiting for..." rarely shows while both play (${shown.map((x) => (x * 100).toFixed(0) + '%')})`);
  await shot(A, '32-online-play-host'); await shot(B, '33-online-play-guest');
  const fin = await until(A, () => window.__sweety.app.run?.complete || ['story', 'complete'].includes(window.__sweety.app.screen), 120000)
    && await until(B, () => window.__sweety.app.run?.complete || ['story', 'complete'].includes(window.__sweety.app.screen), 30000);
  check(fin, `both finished the garden from a ${len}-tick tape`);
  const [fa, fb] = await Promise.all([A, B].map((P) => P.evaluate(async () => (await import('/src/lockstep.js')).fingerprint(window.__sweety.app.run))));
  check(fa === fb, `identical worlds at the end (${fa} vs ${fb})`);
  const rs = await Promise.all([A, B].map((P) => P.evaluate(() => window.__sweety.app.online.ls?.resyncs ?? 0)));
  check(rs[0] + rs[1] === 0, `no resyncs needed (${rs})`);
  // round two: the host goes on, the guest skips the next intro first (this used to deadlock)
  await A.evaluate(() => { window.__sweety.app.driver = null; }); await B.evaluate(() => { window.__sweety.app.driver = null; });
  await until(A, () => ['story', 'complete'].includes(window.__sweety.app.screen)); await until(B, () => ['story', 'complete'].includes(window.__sweety.app.screen));
  for (let i = 0; i < 8 && await A.evaluate(() => window.__sweety.app.screen) !== 'complete'; i++) { await A.keyboard.press('Space'); await A.waitForTimeout(150); }
  for (let i = 0; i < 8 && await B.evaluate(() => window.__sweety.app.screen) === 'story'; i++) { await B.keyboard.press('Enter'); await B.waitForTimeout(150); }
  await A.keyboard.press('Space');
  check(await until(B, () => window.__sweety.app.screen === 'story' && window.__sweety.app.online.round === 2), 'host goes on to chapter 2; guest follows');
  for (let i = 0; i < 4 && await B.evaluate(() => window.__sweety.app.screen) === 'story'; i++) { await B.keyboard.press('Enter'); await B.waitForTimeout(150); }
  await A.waitForTimeout(1500);
  for (let i = 0; i < 4 && await A.evaluate(() => window.__sweety.app.screen) === 'story'; i++) { await A.keyboard.press('Space'); await A.waitForTimeout(150); }
  await A.keyboard.down('KeyD'); await B.keyboard.down('ArrowRight'); await A.waitForTimeout(1500); await A.keyboard.up('KeyD'); await B.keyboard.up('ArrowRight');
  const t2 = await Promise.all([A, B].map((P) => P.evaluate(() => window.__sweety.app.run.tick)));
  check(t2[0] > 60 && t2[1] > 60, `round two runs on both sides (ticks ${t2})`);
  // the host restarts the chapter for both from the pause menu
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  await A.keyboard.press('KeyS'); await A.waitForTimeout(100);   // the host plays on the left half: S is down
  await A.keyboard.press('KeyS'); await A.waitForTimeout(100);   // past 'Back to checkpoint' to 'Restart'
  await A.keyboard.press('Space'); await A.waitForTimeout(800);
  const r3 = await Promise.all([A, B].map((P) => P.evaluate(() => [window.__sweety.app.screen, window.__sweety.app.online.round, window.__sweety.app.run?.chapterId, window.__sweety.app.run?.tick])));
  check(r3.every((x) => x[0] === 'play' && x[1] === 3 && x[2] === 'toolbox' && x[3] < 80), `host's Restart restarts both (${JSON.stringify(r3)})`);
  // guest leaves: host is told
  await B.evaluate(() => window.__sweety.net.leave());
  check(await until(A, () => window.__sweety.app.online?.status === 'error'), 'host notices the partner left');
  await shot(A, '34-online-left');
  check(errors.length === 0, `no page errors ${errors.slice(0, 4).join(' | ')}`);
} catch (e) { console.log('FAIL - exception', e.message); failed++; }
finally { await browser.close(); server.kill(); }
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
