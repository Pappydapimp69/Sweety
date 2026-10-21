// Two real browsers in the Yard online: the host opens it, both walk into the Garden's
// door together, both go in, and finishing brings both back out of that door.
// node tests/online-yard.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }
const PORT = 9300 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] });
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
  await A.keyboard.press('KeyW'); await A.waitForTimeout(600); await A.keyboard.press('KeyW'); await A.waitForTimeout(200);
  await A.evaluate(() => window.__sweety.host());
  check(await until(A, () => window.__sweety.app.online?.status === 'hosting'), 'host opened a room');
  const code = await A.evaluate(() => window.__sweety.app.online.code);
  await B.goto(`http://127.0.0.1:${PORT}/index.html?join=${code}`);
  await B.waitForTimeout(400);
  await B.keyboard.press('ArrowUp');
  check(await until(B, () => window.__sweety.app.online?.status === 'connected') && await until(A, () => window.__sweety.app.online?.status === 'connected'), 'connected');
  // the host has one star already; the guest has none: the Yard both build is the host's
  await A.evaluate(() => { window.__sweety.app.progress.stars = { '55:11': true }; });
  await A.keyboard.press('KeyS'); await A.waitForTimeout(100);
  await A.keyboard.press('Space');   // "The Yard", under the island
  check(await until(A, () => window.__sweety.app.run?.chapterId === 'yard') && await until(B, () => window.__sweety.app.run?.chapterId === 'yard'), 'both are in the Yard');
  const totals = await Promise.all([A, B].map((P) => P.evaluate(() => window.__sweety.app.run.starsTotal)));
  check(totals[0] === totals[1] && totals[0] === 12, `both build the host's Yard (stars left ${totals})`);
  // both walk to the Garden door
  const drive = `(async () => {
    const { autorun } = await import('/tests/bots.mjs');
    const slot = window.__sweety.app.online.slot;
    window.__sweety.app.driver = (run) => autorun(run, run.players[slot], 63.5 + slot * 1.1);
  })()`;
  await A.evaluate(drive); await B.evaluate(drive);
  check(await until(A, () => window.__sweety.app.run?.chapterId === 'garden' || window.__sweety.app.screen === 'story', 40000), 'host: in through the Garden door');
  check(await until(B, () => window.__sweety.app.run?.chapterId === 'garden' || window.__sweety.app.screen === 'story', 20000), 'guest follows through the door');
  await shot(A, 'oy1-host-garden'); await shot(B, 'oy2-guest-garden');
  await A.evaluate(() => { window.__sweety.app.driver = null; }); await B.evaluate(() => { window.__sweety.app.driver = null; });
  for (let i = 0; i < 6; i++) { await A.keyboard.press('Space'); await B.keyboard.press('Enter'); await A.waitForTimeout(150); }
  check(await until(A, () => window.__sweety.app.screen === 'play' && window.__sweety.app.run.chapterId === 'garden') && await until(B, () => window.__sweety.app.screen === 'play' && window.__sweety.app.run.chapterId === 'garden'), 'both playing the Garden');
  check(await A.evaluate(() => window.__sweety.app.fromYard === 'garden') && await B.evaluate(() => window.__sweety.app.fromYard === 'garden'), 'both remember the door they came in by');
  // done (as if finished): the host goes on, and both come back out of the Garden door
  for (const P of [A, B]) await P.evaluate(() => { const a = window.__sweety.app; a.run.complete = true; a.ending = 0.05; a.screen = 'ending'; });
  for (let i = 0; i < 14 && !(await A.evaluate(() => window.__sweety.app.run?.chapterId === 'yard')); i++) { await A.keyboard.press('Space'); await B.keyboard.press('Enter'); await A.waitForTimeout(300); }
  check(await until(B, () => window.__sweety.app.run?.chapterId === 'yard', 20000), 'the guest is brought back to the Yard too');
  const xs = await Promise.all([A, B].map((P) => P.evaluate(() => window.__sweety.app.run.players.map((p) => +(p.x + p.w / 2).toFixed(2)).join(','))));
  check(xs[0] === xs[1] && Math.abs(parseFloat(xs[0]) - 63.45) < 1, `both back out of the Garden door, in the same place (${xs.join(' | ')})`);
  await shot(A, 'oy3-back-in-yard');
  const rs = await Promise.all([A, B].map((P) => P.evaluate(() => window.__sweety.app.online.ls?.resyncs ?? 0)));
  check(rs[0] + rs[1] === 0, `no resyncs (${rs})`);
  check(errors.length === 0, `no page errors ${errors.slice(0, 4).join(' | ')}`);
} catch (e) { console.log('FAIL - exception', e.message); failed++; }
finally { await browser.close(); server.kill(); }
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
