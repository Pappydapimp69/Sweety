// Screens and the loop. Owns the view state (camera, particles); the run is sim.js's.
import { DT, MAX_STEPS } from './config.js';
import { CHAPTERS, BONK, chapterById } from './levels.js';
import { createRun, step, NAMES } from './sim.js';
import { drawWorld, snapCamera, makeCamera, textPx, PLAYER_COLORS } from './render.js';
import { initInput, read, flush, labelsFor, onAnyKey, ALL_DEVICES } from './input.js';
import { loadProgress, saveProgress } from './save.js';
import { unlockAudio, playEvents, sfx } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

const POWER_NAME = { none: 'wave', pin: 'pin', slam: 'slam (in the air)', lantern: 'shine (hold)', size: 'shrink / grow' };
const MENU = [...CHAPTERS, BONK];

const app = {
  screen: 'title',          // title | chapters | play | pause | complete
  devices: [null, null],    // device claimed by Sugar, Spice
  progress: loadProgress(),
  menuIndex: 0, pauseIndex: 0,
  run: null, cam: null, fx: [], banner: 0,
};

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------- flow

function startChapter(id) {
  app.run = createRun(id);
  app.cam = makeCamera(app.run);
  snapCamera(app.cam, app.run, W, H, true);
  app.fx = [];
  app.banner = 5;
  app.screen = 'play';
  flush();
}

function finishChapter() {
  const s = app.run;
  const idx = CHAPTERS.findIndex((c) => c.id === s.chapterId);
  if (idx >= 0) {
    const p = app.progress;
    p.unlocked = Math.max(p.unlocked, idx + 2);
    p.hearts[s.chapterId] = Math.max(p.hearts[s.chapterId] || 0, s.hearts);
    p.done[s.chapterId] = true;
    saveProgress(p);
  }
  app.screen = 'complete';
  flush();
}

function unlockedCount() { return Math.min(CHAPTERS.length, app.progress.unlocked); }
function menuLocked(i) { return i < CHAPTERS.length && i >= unlockedCount(); }

// Menu input: anyone who has joined can drive the menus.
function menuInput() {
  const out = { left: false, right: false, up: false, down: false, ok: false, back: false };
  for (const d of app.devices) {
    if (!d) continue;
    const r = read(d);
    out.left ||= r.leftPressed; out.right ||= r.rightPressed;
    // up and jump share a key on both keyboard halves: a confirm must not also move
    out.up ||= r.upPressed && !r.jumpPressed; out.down ||= r.downPressed;
    out.ok ||= r.jumpPressed; out.back ||= r.pausePressed || r.abilityPressed;
  }
  return out;
}

function updateTitle() {
  for (const d of ALL_DEVICES) {
    const r = read(d);
    if (!r.jumpPressed) continue;
    if (app.devices.includes(d)) {
      if (app.devices[0] && app.devices[1]) { app.screen = 'chapters'; flush(); sfx('checkpoint'); return; }
      continue;
    }
    const slot = app.devices.indexOf(null);
    if (slot >= 0) { app.devices[slot] = d; sfx('wave'); }
  }
}

function updateChapters() {
  const m = menuInput();
  const n = MENU.length;
  if (m.left || m.up) app.menuIndex = (app.menuIndex + n - 1) % n;
  if (m.right || m.down) app.menuIndex = (app.menuIndex + 1) % n;
  if (m.left || m.right || m.up || m.down) sfx('plate');
  if (m.ok) {
    if (menuLocked(app.menuIndex)) sfx('nope');
    else startChapter(MENU[app.menuIndex].id);
  }
}

function updatePause() {
  const m = menuInput();
  if (m.up) app.pauseIndex = (app.pauseIndex + 2) % 3;
  if (m.down) app.pauseIndex = (app.pauseIndex + 1) % 3;
  if (m.back) { app.screen = 'play'; flush(); return; }
  if (m.ok) {
    if (app.pauseIndex === 0) app.screen = 'play';
    else if (app.pauseIndex === 1) startChapter(app.run.chapterId);
    else { app.screen = 'chapters'; }
    flush();
  }
}

function updateComplete() {
  const m = menuInput();
  if (!m.ok) return;
  const idx = CHAPTERS.findIndex((c) => c.id === app.run.chapterId);
  if (idx >= 0 && idx + 1 < CHAPTERS.length) { app.menuIndex = idx + 1; startChapter(CHAPTERS[idx + 1].id); }
  else { app.menuIndex = 0; app.screen = 'chapters'; flush(); }
}

let acc = 0;
function updatePlay(dt) {
  acc += Math.min(dt, 0.25);
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS) {
    const inputs = app.devices.map((d) => read(d));
    if (inputs.some((i) => i.pausePressed)) { app.screen = 'pause'; app.pauseIndex = 0; flush(); acc = 0; return; }
    step(app.run, inputs);
    playEvents(app.run.events);
    spawnFx(app.run.events);
    acc -= DT; steps++;
    if (app.run.complete) { setTimeout(finishChapter, app.run.bonk ? 900 : 600); app.screen = 'ending'; return; }
  }
  if (steps === MAX_STEPS) acc = 0;   // fell behind: drop the debt, don't spiral
}

function spawnFx(events) {
  for (const e of events) {
    let x = e.x, y = e.y;
    if (x === undefined && e.who !== undefined) { const p = app.run.players[e.who]; x = p.x + p.w / 2; y = p.y + p.h / 2; }
    if (x === undefined) continue;
    const add = (n, kind, color, speed = 6) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const v = speed * (0.5 + Math.random() * 0.5);
        app.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0.7, max: 0.7, kind, color });
      }
    };
    if (e.type === 'heart') add(8, 'heart', '#ff4d6d', 5);
    else if (e.type === 'die') add(14, 'dot', PLAYER_COLORS[e.who]);
    else if (e.type === 'thud') add(10, 'dot', '#ced4da', 4);
    else if (e.type === 'crate') add(16, 'dot', '#c8873e', 8);
    else if (e.type === 'launch') add(12, 'dot', '#ffa94d', 7);
    else if (e.type === 'checkpoint') add(10, 'heart', '#ff7eb6', 4);
    else if (e.type === 'bonk') add(10, 'dot', '#ffd43b', 6);
    else if (e.type === 'pinned') add(5, 'dot', '#e9ecef', 3);
  }
}

function updateFx(dt) {
  for (const f of app.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 12 * dt; }
  app.fx = app.fx.filter((f) => f.life > 0);
}

// ---------------------------------------------------------------- drawing

function fillTokens(text, dev) {
  const L = labelsFor(dev);
  return text.replace('{ability}', L.ability).replace('{jump}', L.jump).replace('{move}', L.move);
}

function txt(str, x, y, { size = textPx(H), color = '#fff', align = 'center', weight = '700', shadow = true } = {}) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(str, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function panel(x, y, w, h, color = 'rgba(20, 16, 40, 0.72)') {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 14) : ctx.rect(x, y, w, h); ctx.fill();
}

function drawTitle(t) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ffafcc'); g.addColorStop(1, '#a2d2ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const big = Math.max(48, Math.min(W, H) * 0.16);
  txt('Sweety', W / 2, H * 0.22 + Math.sin(t * 2) * 6, { size: big, color: '#fff' });
  txt('a game for two', W / 2, H * 0.22 + big * 0.7, { size: textPx(H) * 1.1, color: '#5a189a' });

  const bw = Math.min(360, W * 0.42), bh = Math.max(120, H * 0.2);
  for (let i = 0; i < 2; i++) {
    const x = W / 2 + (i ? 12 : -12 - bw), y = H * 0.48;
    panel(x, y, bw, bh, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = PLAYER_COLORS[i];
    ctx.beginPath(); ctx.arc(x + bw / 2, y + bh * 0.32, bh * 0.16, 0, Math.PI * 2); ctx.fill();
    txt(NAMES[i], x + bw / 2, y + bh * 0.62, { color: '#3c096c', shadow: false });
    const d = app.devices[i];
    txt(d ? `joined on ${labelsFor(d).name}` : 'press jump to join', x + bw / 2, y + bh * 0.84,
      { size: textPx(H) * 0.8, color: d ? '#2b9348' : '#6c757d', weight: '600', shadow: false });
  }
  const ready = app.devices[0] && app.devices[1];
  const lines = ready
    ? ['Both here! Either of you press jump to start.']
    : ['Keyboard left half: jump is W  ·  right half: jump is ↑  ·  controller: jump is A',
       'Controllers: press any button first so the browser can see them.'];
  lines.forEach((l, i) => txt(l, W / 2, H * 0.8 + i * textPx(H) * 1.6, { size: textPx(H) * (i ? 0.75 : 0.9), color: '#3c096c', shadow: false, weight: i ? '500' : '700' }));
}

function drawChapters() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#cdb4db'); g.addColorStop(1, '#ffc8dd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  txt('Pick a chapter', W / 2, H * 0.12, { size: textPx(H) * 1.8 });
  const n = MENU.length;
  const cw = Math.min(260, (W - 40) / n - 16), ch = Math.max(170, H * 0.4);
  const total = n * cw + (n - 1) * 16;
  for (let i = 0; i < n; i++) {
    const c = MENU[i];
    const x = (W - total) / 2 + i * (cw + 16), y = H * 0.28;
    const sel = i === app.menuIndex, locked = menuLocked(i);
    panel(x - (sel ? 6 : 0), y - (sel ? 6 : 0), cw + (sel ? 12 : 0), ch + (sel ? 12 : 0), sel ? '#ffffff' : 'rgba(255,255,255,0.55)');
    const col = locked ? '#adb5bd' : '#3c096c';
    txt(i < CHAPTERS.length ? `Chapter ${i + 1}` : 'Mini-game', x + cw / 2, y + ch * 0.14, { size: textPx(H) * 0.75, color: col, shadow: false, weight: '600' });
    txt(c.name, x + cw / 2, y + ch * 0.3, { size: textPx(H) * 1.1, color: col, shadow: false });
    wrap(locked ? 'Finish the chapter before to unlock.' : c.tagline, x + cw / 2, y + ch * 0.5, cw - 20, col);
    if (!locked && i < CHAPTERS.length) {
      const got = app.progress.hearts[c.id] || 0;
      const total = c.map.join('').split('h').length - 1;
      txt(`♥ ${got} / ${total}${app.progress.done[c.id] ? '  ✓' : ''}`, x + cw / 2, y + ch * 0.85, { size: textPx(H) * 0.85, color: '#d6336c', shadow: false });
    }
  }
  const L = app.devices.map(labelsFor);
  txt(`choose: ${L[0].move} or ${L[1].move}  ·  start: ${L[0].jump} or ${L[1].jump}`, W / 2, H * 0.85, { size: textPx(H) * 0.8, color: '#3c096c', shadow: false, weight: '600' });
}

function wrap(text, cx, y, maxW, color) {
  const size = textPx(H) * 0.75;
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  const words = text.split(' ');
  let line = '', ly = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { txt(line, cx, ly, { size, color, shadow: false, weight: '500' }); line = w; ly += size * 1.3; }
    else line = test;
  }
  if (line) txt(line, cx, ly, { size, color, shadow: false, weight: '500' });
}

function drawPlay() {
  const s = app.run, ch = chapterById(s.chapterId);
  drawWorld(ctx, s, app.cam, W, H, app.fx, ch.theme);
  const P = textPx(H);
  txt(ch.name, 16, 24, { align: 'left', size: P });
  if (s.bonk) {
    txt(`${s.score[0]}`, W / 2 - 60, 40, { size: P * 2.2, color: PLAYER_COLORS[0] });
    txt('vs', W / 2, 40, { size: P });
    txt(`${s.score[1]}`, W / 2 + 60, 40, { size: P * 2.2, color: PLAYER_COLORS[1] });
  } else if (s.heartsTotal) {
    txt(`♥ ${s.hearts} / ${s.heartsTotal}`, W - 16, 24, { align: 'right', size: P, color: '#ffccd5' });
  }
  // each player's buttons, in their own corner, named for their own device
  ctx.fillStyle = 'rgba(15, 10, 30, 0.6)'; ctx.fillRect(0, H - 22 - P * 0.75, W, P * 1.5);
  for (let i = 0; i < 2; i++) {
    const L = labelsFor(app.devices[i]);
    const power = i ? ch.powers.spice : ch.powers.sugar;
    const line = `${NAMES[i]}: move ${L.move} · jump ${L.jump} · ${POWER_NAME[power]} ${L.ability}`;
    txt(line, i ? W - 16 : 16, H - 22, { align: i ? 'right' : 'left', size: P * 0.72, color: PLAYER_COLORS[i], weight: '600' });
  }
  txt(`pause: ${labelsFor(app.devices[0]).pause}`, W / 2, H - 22, { size: P * 0.65, color: 'rgba(255,255,255,0.7)', weight: '500' });

  if (app.banner > 0) {
    ctx.globalAlpha = Math.min(1, app.banner);
    const bw = Math.min(W - 32, 720), bh = P * (3.4 + ch.tips.length * 1.5);
    panel((W - bw) / 2, H * 0.12, bw, bh);
    txt(ch.name, W / 2, H * 0.12 + P * 1.3, { size: P * 1.5 });
    txt(ch.tagline, W / 2, H * 0.12 + P * 2.8, { size: P * 0.9, color: '#ffd6e0', weight: '500' });
    ch.tips.forEach((tip, i) => {
      const who = tip.startsWith('Sugar') ? 0 : tip.startsWith('Spice') ? 1 : 0;
      txt(fillTokens(tip, app.devices[who]), W / 2, H * 0.12 + P * (4.4 + i * 1.5), { size: P * 0.78, weight: '500', color: tip.startsWith('Spice') ? PLAYER_COLORS[1] : tip.startsWith('Sugar') ? PLAYER_COLORS[0] : '#fff' });
    });
    ctx.globalAlpha = 1;
  }
}

function drawPause() {
  drawPlay();
  ctx.fillStyle = 'rgba(10, 8, 25, 0.6)'; ctx.fillRect(0, 0, W, H);
  txt('Paused', W / 2, H * 0.3, { size: textPx(H) * 2 });
  ['Keep playing', 'Restart chapter', 'Chapters'].forEach((label, i) => {
    const sel = i === app.pauseIndex;
    txt(sel ? `▸ ${label} ◂` : label, W / 2, H * 0.45 + i * textPx(H) * 2.2, { color: sel ? '#ffd6e0' : '#adb5bd' });
  });
}

function drawComplete() {
  drawPlay();
  const s = app.run;
  ctx.fillStyle = 'rgba(255, 175, 204, 0.55)'; ctx.fillRect(0, 0, W, H);
  const P = textPx(H);
  if (s.bonk) txt(`${NAMES[s.winner]} wins!`, W / 2, H * 0.38, { size: P * 3, color: PLAYER_COLORS[s.winner] });
  else {
    txt('You did it together!', W / 2, H * 0.36, { size: P * 2.4 });
    if (s.heartsTotal) txt(`♥ ${s.hearts} of ${s.heartsTotal} hearts`, W / 2, H * 0.48, { size: P * 1.2, color: '#d6336c' });
  }
  const L = labelsFor(app.devices[0]);
  txt(`press ${L.jump} to continue`, W / 2, H * 0.62, { size: P });
}

// ---------------------------------------------------------------- loop

let last = 0;
function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const t = now / 1000;
  switch (app.screen) {
    case 'title': updateTitle(); drawTitle(t); break;
    case 'chapters': updateChapters(); drawChapters(); break;
    case 'play':
      updatePlay(dt);
      if (app.banner > 0) app.banner -= dt;
      updateFx(dt);
      if (app.run) snapCamera(app.cam, app.run, W, H);
      if (app.screen === 'play' || app.screen === 'ending') drawPlay();
      break;
    case 'ending': updateFx(dt); snapCamera(app.cam, app.run, W, H); drawPlay(); break;
    case 'pause': updatePause(); if (app.screen === 'pause') drawPause(); break;
    case 'complete': updateComplete(); if (app.screen === 'complete') drawComplete(); break;
  }
  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
initInput(window);
onAnyKey(unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
requestAnimationFrame(frame);

// For browser tests.
window.__sweety = {
  app,
  join: (a = 'kbL', b = 'kbR') => { app.devices = [a, b]; app.screen = 'chapters'; },
  start: (id) => startChapter(id),
};
