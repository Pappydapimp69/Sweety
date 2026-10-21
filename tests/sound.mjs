// Browser check for the sound engine layer: it loads, routes through the
// sound-effects bus, footsteps and hits make sound, and nothing throws.
// Not part of `npm test` (needs Chromium).   node tests/sound.mjs
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }

const PORT = 8900 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`); if (!ok) failed++; };
const wait = (ms) => page.waitForTimeout(ms);

// Tap everything that reaches the speakers, and note whether the engine's
// limiter feeds a gain node (the game's bus) rather than the destination.
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  window.__tap = { peak: 0, limiterToBus: false, limiterToDest: false };
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (this instanceof DynamicsCompressorNode) {
      if (dst instanceof GainNode) window.__tap.limiterToBus = true;
      if (dst instanceof AudioDestinationNode) window.__tap.limiterToDest = true;
    }
    if (dst instanceof AudioDestinationNode) {
      const c = this.context;
      if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; window.__an = c.__an; }
      orig.call(this, c.__an);
    }
    return orig.call(this, dst, ...rest);
  };
  window.__level = () => {
    const a = window.__an; if (!a) return 0;
    const b = new Float32Array(a.fftSize); a.getFloatTimeDomainData(b);
    let p = 0; for (const v of b) p = Math.max(p, Math.abs(v)); return p;
  };
});

async function peakFor(ms) {
  let p = 0; const t0 = Date.now();
  while (Date.now() - t0 < ms) { p = Math.max(p, await page.evaluate(() => window.__level())); await wait(20); }
  return p;
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await wait(500);
  await page.mouse.click(640, 360);   // the gesture that unlocks audio
  await page.evaluate(() => window.__sweety.join());
  await page.evaluate(() => window.__sweety.start('garden'));
  await wait(1500);
  const on = await page.evaluate(async () => (await import('./src/soundscape.js')).soundscapeOn());
  check(on, 'sound engine loads and runs');
  const tap = await page.evaluate(() => window.__tap);
  check(tap.limiterToBus && !tap.limiterToDest, 'engine goes through the sound-effects bus');

  await page.evaluate(async () => (await import('./src/audio.js')).setVolumes({ music: 0, sfx: 1 }));   // listen to effects only
  await wait(300);
  const x0 = await page.evaluate(() => window.__sweety.app.run.players[0].x);
  const quiet = await peakFor(400);
  await page.keyboard.down('KeyD');
  const walking = await peakFor(1500);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__sweety.app.run.players[0].x);
  console.log(`  walked ${(x1 - x0).toFixed(1)} tiles`);
  console.log(`  water bed peak ${quiet.toFixed(3)}, walking peak ${walking.toFixed(3)}`);
  check(walking > quiet * 1.3 && walking > 0.01, 'walking makes footsteps');
  check(walking < 0.98, 'footsteps do not clip');

  const hit = await page.evaluate(async () => {
    const { worldSound } = await import('./src/soundscape.js');
    return ['crate', 'thud', 'glass', 'pinned'].map((type) => worldSound({ type, x: window.__sweety.app.cam.x, y: window.__sweety.app.cam.y }));
  });
  check(hit.every(Boolean), 'crate, thud, glass and pinned are played by the engine');
  const hitPeak = await peakFor(500);
  console.log(`  hits peak ${hitPeak.toFixed(3)}`);
  check(hitPeak > 0.02 && hitPeak < 0.98, 'hits are audible and do not clip');

  for (const id of ['toolbox', 'night', 'attic', 'sky', 'clock', 'home']) {
    await page.evaluate((c) => window.__sweety.start(c), id);
    await page.keyboard.down('ArrowLeft'); await wait(500); await page.keyboard.up('ArrowLeft');
  }
  await page.keyboard.press('Escape'); await wait(300);
  const zone = await page.evaluate(() => window.__sweety.app.screen);
  check(zone === 'pause', 'pause still works');
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) { check(false, String(e)); }
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
