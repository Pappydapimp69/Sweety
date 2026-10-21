// Screenshots of the top-down renderer, one per scene, landscape and portrait, plus the cost of
// a frame. Not part of `npm test` (a browser run):
//   node tests/td-view.mjs [outDir] [scene ...]
// It serves the repo itself (python3 -m http.server on 127.0.0.1) and drives headless Chromium.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(tmpdir(), 'td-shots');
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'));

const PORT = 8000 + Math.floor((process.pid % 1000));
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/tests/td-view.html`); if (r.ok) break; } catch { /* not up yet */ } await wait(100); }
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome', args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() =>
    chromium.launch({ args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }));
  const errors = [];
  for (const [vw, vh, tag] of [[1280, 720, 'land'], [390, 844, 'port']]) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/tests/td-view.html#plaza`);
    await page.waitForFunction(() => window.__td && window.__td.ready);
    const scenes = only.length ? only : await page.evaluate(() => window.__td.scenes);
    for (const sc of scenes) {
      if (tag === 'port' && !['plaza', 'meadow', 'workshop', 'plaza-toys'].includes(sc) && !only.length) continue;
      await page.evaluate((n) => { location.hash = n; }, sc);
      await page.waitForFunction(() => window.__td.ready);
      await page.evaluate(() => window.__td.draw(window.__td.s.time + 0.5));
      await page.screenshot({ path: join(out, `${sc}-${tag}.png`) });
      if (tag === 'land') console.log(`${sc}: ${(await page.evaluate(() => window.__td.bench(90))).toFixed(2)} ms/frame`);
    }
    await page.close();
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  console.log(`shots in ${out}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
