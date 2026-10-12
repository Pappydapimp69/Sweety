// Screens and the loop. Owns the view state (camera, particles, bubbles, shake,
// fades); the run itself is sim.js's.
import { DT, MAX_STEPS } from './config.js';
import { CHAPTERS, MINIGAMES, STORY, chapterById } from './levels.js';
import { createRun, step, NAMES, powerOf } from './sim.js';
import { drawWorld, drawCharacter, snapCamera, makeCamera, textPx, PLAYER_COLORS, heart } from './render.js';
import { initInput, read, flush, labelsFor, onAnyKey, ALL_DEVICES, connectedPads } from './input.js';
import { loadProgress, saveProgress } from './save.js';
import { unlockAudio, playEvents, sfx, setVolumes } from './audio.js';
import { playMusic } from './music.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

export const POWER_NAME = {
  none: 'wave', pin: 'pin', slam: 'slam (in the air)', lantern: 'shine (hold)', size: 'shrink / grow',
  swap: 'swap places', flip: 'flip gravity', gust: 'gust', glide: 'glide: hold jump', freeze: 'stop time (hold)', dash: 'dash',
};
const SHAKE = { thud: 0.25, launch: 0.2, crate: 0.3, glass: 0.25, die: 0.3, boom: 0.6, bonk: 0.2, flood: 0.3 };

const app = {
  screen: 'title',          // title | menu | chapters | minis | settings | story | play | ending | pause | complete | credits
  devices: [null, null],    // device claimed by Sugar, Spice
  progress: loadProgress(),
  menuIndex: 0, chapterIndex: 0, miniIndex: 0, pauseIndex: 0, settingsIndex: 0,
  settingsBack: 'menu',
  run: null, cam: null, fx: [], banner: 0, shake: 0, fade: 1, t: 0,
  story: null,              // { lines, i, then }
  bubbles: [],              // in-level speech: { who, text, life, delay }
  ending: 0,                // seconds before the end-of-chapter card
  creditsT: 0,
  padsSeen: 0,
};
const S = () => app.progress.settings;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applyVolumes() { setVolumes({ music: S().music / 10 * 0.8, sfx: S().sfx / 10 }); }
function save() { saveProgress(app.progress); }

// ---------------------------------------------------------------- flow

function go(screen) {
  app.screen = screen;
  app.fade = Math.max(app.fade, 0.5);
  flush();
  if (screen === 'title' || screen === 'menu' || screen === 'chapters') playMusic('title');
  if (screen === 'settings' && !app.run) playMusic('title');
  if (screen === 'minis') playMusic('minigame');
  if (screen === 'credits') { playMusic('credits'); app.creditsT = 0; }
}

function tell(lines, then) {
  app.story = { lines, i: 0, then };
  go('story');
}

function beginChapter(id) {
  const ch = chapterById(id);
  const st = STORY[id];
  if (st && st.intro) { tell(st.intro, () => startRun(id)); if (ch.music) playMusic(ch.music); }
  else startRun(id);
}

function startRun(id) {
  const ch = chapterById(id);
  app.run = createRun(id, { gentle: S().gentle });
  app.cam = makeCamera(app.run);
  snapCamera(app.cam, app.run, W, H, true);
  app.fx = []; app.bubbles = []; app.shake = 0; acc = 0; app.powers = null; app.toast = null;
  app.banner = 6;
  go('play');
  playMusic(ch.music || 'garden');
}

function finishRun() {
  const s = app.run;
  const idx = CHAPTERS.findIndex((c) => c.id === s.chapterId);
  if (idx >= 0) {
    const p = app.progress;
    p.unlocked = Math.max(p.unlocked, idx + 2);
    p.hearts[s.chapterId] = Math.max(p.hearts[s.chapterId] || 0, s.hearts);
    p.done[s.chapterId] = true;
    save();
    const st = STORY[s.chapterId];
    if (st && st.outro) { tell(st.outro, () => go('complete')); return; }
  }
  go('complete');
}

function afterComplete() {
  const id = app.run.chapterId;
  const idx = CHAPTERS.findIndex((c) => c.id === id);
  if (idx < 0) { startRun(id); return; }              // mini-game: play again
  if (idx === CHAPTERS.length - 1) { app.progress.seenCredits = true; save(); go('credits'); return; }
  app.chapterIndex = idx + 1;
  beginChapter(CHAPTERS[idx + 1].id);
}

const move = (i, by, n) => ((i + by) % n + n) % n;
const unlockedCount = () => Math.min(CHAPTERS.length, app.progress.unlocked);
const chapterLocked = (i) => i >= unlockedCount();

// Menu input: anyone who has joined can drive the menus, with the menu keys
// (OK / Back), never jump, so moving up can't also confirm.
function menuInput() {
  const out = { left: 0, right: 0, up: 0, down: 0, ok: false, back: false, any: false };
  for (const d of app.devices) {
    if (!d) continue;
    const r = read(d);
    out.left += r.taps.left; out.right += r.taps.right;
    out.up += r.taps.up; out.down += r.taps.down;
    out.ok ||= r.okPressed; out.back ||= r.backPressed; out.pause ||= r.pausePressed;
    out.any ||= r.okPressed || r.jumpPressed || r.abilityPressed;
  }
  if (out.left || out.right || out.up || out.down) sfx('tick');
  return out;
}

function updateTitle() {
  for (const d of ALL_DEVICES) {
    const r = read(d);
    if (!r.jumpPressed) continue;
    if (app.devices.includes(d)) {
      if (app.devices[0] && app.devices[1]) { sfx('confirm'); go('menu'); return; }
      continue;
    }
    const slot = app.devices.indexOf(null);
    if (slot >= 0) { app.devices[slot] = d; sfx('wave'); }
  }
}

const MAIN_MENU = [
  { label: 'Story', go: () => { app.chapterIndex = Math.min(unlockedCount() - 1, CHAPTERS.length - 1); go('chapters'); } },
  { label: 'Mini-games', go: () => go('minis') },
  { label: 'Settings', go: () => { app.settingsBack = 'menu'; go('settings'); } },
  { label: 'Credits', go: () => go('credits') },
];

function updateMenu() {
  const m = menuInput();
  const n = MAIN_MENU.length;
  app.menuIndex = move(app.menuIndex, m.down + m.right - m.up - m.left, n);
  if (m.ok) { sfx('confirm'); MAIN_MENU[app.menuIndex].go(); }
  else if (m.back) go('title');
}

function updateChapters() {
  const m = menuInput();
  const n = CHAPTERS.length;
  app.chapterIndex = move(app.chapterIndex, m.down + m.right - m.up - m.left, n);
  if (m.back) { go('menu'); return; }
  if (m.ok) {
    if (chapterLocked(app.chapterIndex)) sfx('nope');
    else { sfx('confirm'); beginChapter(CHAPTERS[app.chapterIndex].id); }
  }
}

function updateMinis() {
  const m = menuInput();
  const n = MINIGAMES.length;
  app.miniIndex = move(app.miniIndex, m.down + m.right - m.up - m.left, n);
  if (m.back) { go('menu'); return; }
  if (m.ok) { sfx('confirm'); startRun(MINIGAMES[app.miniIndex].id); }
}

const SETTINGS = [
  { label: 'Music', get: () => `${S().music} / 10`, left: () => { S().music = Math.max(0, S().music - 1); }, right: () => { S().music = Math.min(10, S().music + 1); } },
  { label: 'Sounds', get: () => `${S().sfx} / 10`, left: () => { S().sfx = Math.max(0, S().sfx - 1); }, right: () => { S().sfx = Math.min(10, S().sfx + 1); } },
  { label: 'Gentle mode', get: () => (S().gentle ? 'on: quick respawns where you stood' : 'off'), toggle: () => { S().gentle = !S().gentle; } },
  { label: 'Screen shake', get: () => (S().shake ? 'on' : 'off'), toggle: () => { S().shake = !S().shake; } },
  { label: 'Back', back: true },
];

function updateSettings() {
  const m = menuInput();
  const n = SETTINGS.length;
  app.settingsIndex = move(app.settingsIndex, m.down - m.up, n);
  const it = SETTINGS[app.settingsIndex];
  let changed = false;
  for (let i = 0; i < m.left; i++) if (it.left || it.toggle) { (it.left || it.toggle)(); changed = true; }
  for (let i = 0; i < m.right; i++) if (it.right || it.toggle) { (it.right || it.toggle)(); changed = true; }
  if (m.ok && it.toggle) { it.toggle(); changed = true; }
  if (changed) { applyVolumes(); save(); sfx('confirm'); }
  if (m.back || (m.ok && it.back)) {
    if (app.run && app.settingsBack === 'pause') {
      app.run.gentle = S().gentle;     // gentle mode applies to the run in progress too
      go('pause');
    } else go('menu');
  }
}

function updateStory() {
  const m = menuInput();
  if (m.any || m.back) {
    const st = app.story;
    st.i++;
    sfx('tick');
    if (st.i >= st.lines.length) { app.story = null; st.then(); }
  }
}

function updatePause() {
  const m = menuInput();
  const n = 4;
  app.pauseIndex = move(app.pauseIndex, m.down - m.up, n);
  if (m.back || m.pause) { go('play'); playMusic(chapterById(app.run.chapterId).music); return; }   // Start toggles
  if (m.ok) {
    if (app.pauseIndex === 0) { go('play'); playMusic(chapterById(app.run.chapterId).music); }
    else if (app.pauseIndex === 1) startRun(app.run.chapterId);
    else if (app.pauseIndex === 2) { app.settingsBack = 'pause'; go('settings'); }
    else { const story = CHAPTERS.some((c) => c.id === app.run.chapterId); app.run = null; go(story ? 'chapters' : 'minis'); }
  }
}

function updateComplete() {
  const m = menuInput();
  if (m.ok || m.any && !m.back) afterComplete();
  else if (m.back) { const story = CHAPTERS.some((c) => c.id === app.run.chapterId); app.run = null; go(story ? 'chapters' : 'minis'); }
}

function updateCredits(dt) {
  app.creditsT += dt;
  const m = menuInput();
  if ((m.any || m.back) && app.creditsT > 1.5) go('menu');
}

let acc = 0;
function updatePlay(dt) {
  acc += Math.min(dt, 0.25);
  let steps = 0;
  if (app.turbo) acc = DT * app.turbo;   // browser tests: many steps per frame
  while (acc >= DT && steps < (app.turbo || MAX_STEPS)) {
    const inputs = app.driver ? app.driver(app.run) : app.devices.map((d) => read(d));
    if (inputs.some((i) => i.pausePressed)) { app.pauseIndex = 0; go('pause'); acc = 0; return; }
    step(app.run, inputs);
    onEvents(app.run.events);
    acc -= DT; steps++;
    if (app.run.complete) { app.ending = app.run.mode === 'chapter' ? 1.4 : 1.8; app.screen = 'ending'; return; }
  }
  if (steps >= MAX_STEPS && !app.turbo) acc = 0;   // fell behind: drop the debt, don't spiral
}

function onEvents(events) {
  playEvents(events);
  spawnFx(events);
  for (const e of events) {
    if (SHAKE[e.type] && S().shake) app.shake = Math.max(app.shake, SHAKE[e.type]);
    if (e.type === 'land' && e.hard && S().shake) app.shake = Math.max(app.shake, 0.12);
    if (e.type === 'talk') {
      const lines = (STORY.talk || {})[e.id] || [];
      lines.forEach(([who, text], i) => app.bubbles.push({ who: NAMES.indexOf(who), text, life: 3.2, delay: i * 2.6 }));
    }
  }
}

function spawnFx(events) {
  for (const e of events) {
    let x = e.x, y = e.y;
    if (x === undefined && e.who !== undefined && e.who >= 0) { const p = app.run.players[e.who]; x = p.x + p.w / 2; y = p.y + p.h / 2; }
    if (x === undefined) continue;
    const add = (n, kind, color, speed = 6, life = 0.7) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const v = speed * (0.5 + Math.random() * 0.5);
        app.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life, max: life, kind, color });
      }
    };
    switch (e.type) {
      case 'heart': add(8, 'heart', '#ff4d6d', 5); break;
      case 'die': add(14, 'dot', PLAYER_COLORS[e.who]); break;
      case 'thud': add(10, 'dot', '#ced4da', 4); break;
      case 'land': add(e.hard ? 8 : 4, 'dot', 'rgba(255,255,255,0.8)', 2.5, 0.35); break;
      case 'crate': add(16, 'dot', '#c8873e', 8); break;
      case 'glass': add(16, 'dot', '#d0ebff', 8); break;
      case 'launch': add(12, 'dot', '#ffa94d', 7); break;
      case 'checkpoint': add(10, 'heart', '#ff7eb6', 4); break;
      case 'bonk': add(10, 'dot', '#ffd43b', 6); break;
      case 'pinned': add(5, 'dot', '#e9ecef', 3); break;
      case 'swap': add(12, 'heart', '#ff7eb6', 4); app.fx.push({ x: e.x2, y: e.y2, vx: 0, vy: 0, life: 0.5, max: 0.5, kind: 'ring', color: '#2ec4b6' }); break;
      case 'flip': case 'small': case 'big': app.fx.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, kind: 'ring', color: PLAYER_COLORS[e.who] }); break;
      case 'boom': add(24, 'dot', '#ff922b', 9); break;
      case 'respawn': app.fx.push({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, kind: 'ring', color: PLAYER_COLORS[e.who] }); break;
      default: break;
    }
  }
}

// When a power changes under your feet (the finale's zones), say so, in your own buttons.
function watchPowers(dt) {
  if (!app.run) return;
  const now = app.run.players.map((p) => powerOf(app.run, p));
  if (app.powers && (now[0] !== app.powers[0] || now[1] !== app.powers[1]) && app.run.mode === 'chapter') {
    const lines = [0, 1].filter((i) => now[i] !== app.powers[i]).map((i) => [i, `${NAMES[i]}: ${POWER_NAME[now[i]] || now[i]}${now[i] === 'glide' ? '' : ` (${labelsFor(app.devices[i]).ability})`}`]);
    app.toast = { lines, life: 3 };
    sfx('confirm');
  }
  app.powers = now;
  if (app.toast) app.toast.life -= dt;
}

function updateFx(dt) {
  for (const f of app.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 12 * dt; }
  app.fx = app.fx.filter((f) => f.life > 0);
  for (const b of app.bubbles) { if (b.delay > 0) b.delay -= dt; else b.life -= dt; }
  app.bubbles = app.bubbles.filter((b) => b.life > 0);
  app.shake = Math.max(0, app.shake - dt * 1.8);
}

// ---------------------------------------------------------------- drawing helpers

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

function panel(x, y, w, h, color = 'rgba(20, 16, 40, 0.72)', r = 14) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill();
}

function wrapLines(text, maxW, size, weight = '500') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function wrap(text, cx, y, maxW, color, size = textPx(H) * 0.75) {
  wrapLines(text, maxW, size).forEach((l, i) => txt(l, cx, y + i * size * 1.3, { size, color, shadow: false, weight: '500' }));
}

function softBackground(c1, c2) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {   // drifting hearts
    const x = ((i * 173 + app.t * 18 * (1 + (i % 3) * 0.3)) % (W + 80)) - 40;
    const y = H - ((i * 97 + app.t * 26 * (1 + (i % 4) * 0.2)) % (H + 80)) + 40;
    ctx.globalAlpha = 0.18;
    heart(ctx, x, y, 10 + (i % 4) * 4, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

function couple(cx, baseY, size, hop = true) {
  for (let i = 0; i < 2; i++) {
    const w = size * 0.6, h = size;
    const jump = hop ? Math.max(0, Math.sin(app.t * 3 + i * 1.4)) * size * 0.25 : 0;
    drawCharacter(ctx, i, cx + (i ? size * 0.15 : -size * 0.75), baseY - h - jump, w, h, { facing: i ? -1 : 1, t: app.t, airborne: jump > 1, k: size / 1.25 });
  }
  heart(ctx, cx, baseY - size * 1.55 + Math.sin(app.t * 2) * 4, size * 0.16, '#ff4d6d');
}

function menuList(items, x, y, sel, P) {
  items.forEach((label, i) => {
    const s = i === sel;
    if (s) panel(x - 180, y + i * P * 2.4 - P * 1.0, 360, P * 2, 'rgba(255,255,255,0.85)', 12);
    txt(label, x, y + i * P * 2.4, { size: P * 1.1, color: s ? '#7b2cbf' : '#ffffff', shadow: !s });
  });
}

function hint(text) { txt(text, W / 2, H - 28, { size: textPx(H) * 0.75, color: 'rgba(255,255,255,0.95)', weight: '600' }); }
function navHint() {
  const L = app.devices.map(labelsFor);
  hint(`move: ${L[0].nav} or ${L[1].nav}  ·  ok: ${L[0].ok} or ${L[1].ok}  ·  back: ${L[0].back}${L[1].back !== L[0].back ? ` or ${L[1].back}` : ''}`);
}

// ---------------------------------------------------------------- screens

function drawTitle() {
  softBackground('#ffafcc', '#a2d2ff');
  const big = Math.max(48, Math.min(W, H) * 0.15);
  txt('Sweety', W / 2, H * 0.17 + Math.sin(app.t * 2) * 6, { size: big, color: '#fff' });
  txt('a game for two', W / 2, H * 0.17 + big * 0.68, { size: textPx(H) * 1.1, color: '#5a189a' });

  const bw = Math.min(360, W * 0.42), bh = Math.max(130, H * 0.24);
  for (let i = 0; i < 2; i++) {
    const x = W / 2 + (i ? 12 : -12 - bw), y = H * 0.44;
    panel(x, y, bw, bh, 'rgba(255,255,255,0.55)');
    const d = app.devices[i];
    const sz = bh * 0.38;
    drawCharacter(ctx, i, x + bw / 2 - sz * 0.3, y + bh * 0.08 + (d ? -Math.abs(Math.sin(app.t * 4)) * 6 : 0), sz * 0.6, sz, { facing: i ? -1 : 1, t: app.t, k: sz / 1.25, alpha: d ? 1 : 0.55 });
    txt(NAMES[i], x + bw / 2, y + bh * 0.64, { color: '#3c096c', shadow: false });
    txt(d ? `joined on ${labelsFor(d).name}` : 'press jump to join', x + bw / 2, y + bh * 0.85,
      { size: textPx(H) * 0.8, color: d ? '#2b9348' : '#6c757d', weight: '600', shadow: false });
  }
  const ready = app.devices[0] && app.devices[1];
  const pads = connectedPads();
  const lines = ready
    ? ['Both here! Either of you press jump to start.']
    : ['Keyboard left half: jump is W  ·  right half: jump is ↑  ·  controller: jump is A',
       pads ? `${pads} controller${pads > 1 ? 's' : ''} found. Press A on yours to join.` : 'Controllers: press any button first so the browser can see them.'];
  lines.forEach((l, i) => txt(l, W / 2, H * 0.8 + i * textPx(H) * 1.6, { size: textPx(H) * (i ? 0.75 : 0.9), color: '#3c096c', shadow: false, weight: i ? '500' : '700' }));
}

function drawMenu() {
  softBackground('#cdb4db', '#ffc8dd');
  const P = textPx(H);
  txt('Sweety', W / 2, H * 0.14, { size: P * 3 });
  couple(W / 2, H * 0.42, Math.min(110, H * 0.14));
  menuList(MAIN_MENU.map((m) => m.label), W / 2, H * 0.52, app.menuIndex, P);
  navHint();
}

function cards(items, sel, title, sub) {
  const P = textPx(H);
  txt(title, W / 2, H * 0.1, { size: P * 1.8 });
  if (sub) txt(sub, W / 2, H * 0.1 + P * 1.8, { size: P * 0.85, color: '#5a189a', shadow: false, weight: '600' });
  const n = items.length;
  const perRow = W < 900 ? Math.min(n, 3) : Math.min(n, 4);
  const rows = Math.ceil(n / perRow);
  const cw = Math.min(250, (W - 40) / perRow - 16), ch = Math.min(Math.max(150, H * 0.3), (H * 0.66) / rows - 16);
  items.forEach((it, i) => {
    const r = Math.floor(i / perRow), c = i % perRow;
    const inRow = Math.min(perRow, n - r * perRow);
    const total = inRow * cw + (inRow - 1) * 16;
    const x = (W - total) / 2 + c * (cw + 16), y = H * 0.2 + r * (ch + 16);
    const s = i === sel;
    panel(x - (s ? 6 : 0), y - (s ? 6 : 0), cw + (s ? 12 : 0), ch + (s ? 12 : 0), s ? '#ffffff' : 'rgba(255,255,255,0.55)');
    const col = it.locked ? '#adb5bd' : '#3c096c';
    txt(it.kicker, x + cw / 2, y + ch * 0.14, { size: P * 0.72, color: col, shadow: false, weight: '600' });
    txt(it.name, x + cw / 2, y + ch * 0.3, { size: P * 1.05, color: col, shadow: false });
    wrap(it.locked ? 'Finish the chapter before to unlock.' : it.tagline, x + cw / 2, y + ch * 0.48, cw - 20, col);
    if (it.footer) txt(it.footer, x + cw / 2, y + ch * 0.86, { size: P * 0.8, color: '#d6336c', shadow: false });
  });
}

function drawChapters() {
  softBackground('#cdb4db', '#ffc8dd');
  const done = CHAPTERS.filter((c) => app.progress.done[c.id]).length;
  cards(CHAPTERS.map((c, i) => {
    const got = app.progress.hearts[c.id] || 0, tot = c.map.join('').split('h').length - 1;
    return { kicker: `Chapter ${i + 1}`, name: c.name, tagline: c.tagline, locked: chapterLocked(i), footer: chapterLocked(i) ? '' : `♥ ${got} / ${tot}${app.progress.done[c.id] ? '  ✓' : ''}` };
  }), app.chapterIndex, 'Story', `${done} of ${CHAPTERS.length} chapters finished`);
  navHint();
}

function drawMinis() {
  softBackground('#ffd6a5', '#fdffb6');
  cards(MINIGAMES.map((c) => ({ kicker: 'Mini-game', name: c.name, tagline: c.tagline })), app.miniIndex, 'Mini-games', 'Just for fun. Loser makes the tea.');
  navHint();
}

function drawSettings() {
  softBackground('#bde0fe', '#cdb4db');
  const P = textPx(H);
  txt('Settings', W / 2, H * 0.14, { size: P * 2 });
  const L = app.devices.map(labelsFor);
  const half = Math.min(300, W / 2 - 16);
  SETTINGS.forEach((it, i) => {
    const y = H * 0.3 + i * P * 2.6, s = i === app.settingsIndex;
    if (s) panel(W / 2 - half, y - P * 1.05, half * 2, P * 2.1, 'rgba(255,255,255,0.85)', 12);
    const col = s ? '#3c096c' : '#ffffff';
    if (it.back) { txt(it.label, W / 2, y, { size: P * 1.05, color: col, shadow: !s }); return; }
    txt(it.label, W / 2 - half + 30, y, { size: P, color: col, align: 'left', shadow: !s });
    txt(it.get(), W / 2 + half - 30, y, { size: P * 0.85, color: s ? '#7b2cbf' : '#f8f9fa', align: 'right', shadow: !s, weight: '600' });
  });
  hint(`change: ${L[0].move} or ${L[1].move}  ·  ok: ${L[0].ok} or ${L[1].ok}  ·  back: ${L[0].back}${L[1].back !== L[0].back ? ` or ${L[1].back}` : ''}`);
}

function drawStory() {
  const st = app.story;
  if (app.run && app.run.complete) drawPlay(); else softBackground('#ffc8dd', '#bde0fe');
  ctx.fillStyle = 'rgba(20,10,40,0.35)'; ctx.fillRect(0, 0, W, H);
  const P = textPx(H);
  const [who, text] = st.lines[st.i];
  const id = NAMES.indexOf(who);
  const size = Math.min(160, H * 0.24);
  for (let i = 0; i < 2; i++) {   // the speaker big on their side, the other smaller
    const s = i === id ? size : size * 0.75;
    const x = i ? W * 0.72 : W * 0.28 - s * 0.6;
    const hop = i === id ? Math.abs(Math.sin(app.t * 5)) * 8 : 0;
    drawCharacter(ctx, i, x, H * 0.62 - s - hop, s * 0.6, s, { facing: i ? -1 : 1, t: app.t, k: s / 1.25, alpha: i === id ? 1 : 0.7 });
  }
  const bw = Math.min(W - 40, 760);
  const lines = wrapLines(text, bw - 60, P * 1.15, '600');
  const bh = P * (2.6 + lines.length * 1.5);
  const bx = (W - bw) / 2, by = H * 0.66;
  panel(bx, by, bw, bh, 'rgba(255,255,255,0.95)', 18);
  txt(who, bx + 26, by + P * 1.1, { size: P, color: PLAYER_COLORS[id], align: 'left', shadow: false });
  lines.forEach((l, i) => txt(l, bx + 26, by + P * (2.5 + i * 1.5), { size: P * 1.15, color: '#212529', align: 'left', shadow: false, weight: '600' }));
  const L = labelsFor(app.devices[0]);
  txt(`${st.i + 1}/${st.lines.length}  ·  ${L.ok} to continue`, bx + bw - 20, by + bh - P * 0.8, { size: P * 0.7, color: '#868e96', align: 'right', shadow: false, weight: '600' });
}

function drawPlay() {
  const s = app.run, ch = chapterById(s.chapterId);
  ctx.save();
  if (app.shake > 0) ctx.translate((Math.random() - 0.5) * app.shake * 22, (Math.random() - 0.5) * app.shake * 22);
  drawWorld(ctx, s, app.cam, W, H, app.fx, ch.theme, app.t);
  drawSigns(s);
  drawBubbles(s);
  ctx.restore();
  const P = textPx(H);
  txt(ch.name, 16, 24, { align: 'left', size: P });
  if (s.mode !== 'chapter') {
    txt(`${s.score[0]}`, W / 2 - 60, 40, { size: P * 2.2, color: PLAYER_COLORS[0] });
    txt('vs', W / 2, 40, { size: P });
    txt(`${s.score[1]}`, W / 2 + 60, 40, { size: P * 2.2, color: PLAYER_COLORS[1] });
    if (s.mode === 'rain') txt(`${Math.max(0, Math.ceil(s.timeLeft))}s`, W / 2, 40 + P * 1.8, { size: P });
    if (s.mode === 'potato') txt(`round ${s.round}`, W / 2, 40 + P * 1.8, { size: P * 0.8 });
  } else if (s.heartsTotal) {
    txt(`♥ ${s.hearts} / ${s.heartsTotal}`, W - 16, 24, { align: 'right', size: P, color: '#ffccd5' });
  }
  if (s.gentle) txt('gentle mode', W - 16, 24 + P * 1.4, { align: 'right', size: P * 0.65, color: 'rgba(255,255,255,0.75)', weight: '500' });
  // each player's buttons, in their own corner, named for their own device
  ctx.fillStyle = 'rgba(15, 10, 30, 0.6)'; ctx.fillRect(0, H - 22 - P * 0.75, W, P * 1.5);
  for (let i = 0; i < 2; i++) {
    const L = labelsFor(app.devices[i]);
    const power = powerOf(s, s.players[i]);
    const line = `${NAMES[i]}: move ${L.move} · jump ${L.jump} · ${POWER_NAME[power] || power}${power === 'glide' ? '' : ` ${L.ability}`}`;
    txt(line, i ? W - 16 : 16, H - 22, { align: i ? 'right' : 'left', size: P * 0.72, color: PLAYER_COLORS[i], weight: '600' });
  }
  txt(`pause: ${labelsFor(app.devices[0]).pause}`, W / 2, H - 22, { size: P * 0.65, color: 'rgba(255,255,255,0.7)', weight: '500' });

  const top = s.mode === 'chapter' ? H * 0.1 : H * 0.2;
  if (app.banner > 0) {
    ctx.globalAlpha = Math.min(1, app.banner);
    const bw = Math.min(W - 32, 760), bh = P * (3.6 + ch.tips.length * 1.5);
    panel((W - bw) / 2, top, bw, bh);
    txt(ch.name, W / 2, top + P * 1.3, { size: P * 1.5 });
    txt(ch.tagline, W / 2, top + P * 2.8, { size: P * 0.9, color: '#ffd6e0', weight: '500' });
    ch.tips.forEach((tip, i) => {
      const who = tip.startsWith('Spice') ? 1 : 0;
      txt(fillTokens(tip, app.devices[who]), W / 2, top + P * (4.4 + i * 1.5), { size: P * 0.78, weight: '500', color: tip.startsWith('Spice') ? PLAYER_COLORS[1] : tip.startsWith('Sugar') ? PLAYER_COLORS[0] : '#fff' });
    });
    ctx.globalAlpha = 1;
  } else if (app.toast && app.toast.life > 0) {
    ctx.globalAlpha = Math.min(1, app.toast.life);
    const bw = Math.min(W - 32, 640);
    panel((W - bw) / 2, top, bw, P * 2.4 * app.toast.lines.length + P * 0.6);
    app.toast.lines.forEach(([who, text], i) => txt(text, W / 2, top + P * (1.5 + i * 2.4), { size: P, color: PLAYER_COLORS[who] }));
    ctx.globalAlpha = 1;
  }
}

// A sign reads itself out when either of you stands near it, in your own buttons.
function drawSigns(s) {
  const k = app.cam.scale, P = textPx(H) * 0.82;
  for (const e of s.ents) {
    if (e.type !== 'sign') continue;
    if (!s.players.some((p) => !p.dead && Math.abs(p.x + p.w / 2 - e.x - 0.5) < 2.4 && Math.abs(p.y + p.h - e.y) < 3.5)) continue;
    const text = e.text.replace('{sugar}', labelsFor(app.devices[0]).ability).replace('{spice}', labelsFor(app.devices[1]).ability).replace('{spiceJump}', labelsFor(app.devices[1]).jump);
    const lines = wrapLines(text, 300, P, '600');
    ctx.font = `600 ${P}px system-ui, sans-serif`;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28, bh = lines.length * P * 1.3 + 16;
    const px = W / 2 + (e.x + 0.5 - app.cam.x) * k, py = H / 2 + (e.y - 1.3 - app.cam.y) * k;
    const bx = Math.min(W - bw - 8, Math.max(8, px - bw / 2)), by = Math.max(8, py - bh - 6);
    panel(bx, by, bw, bh, 'rgba(255, 248, 225, 0.96)', 10);
    lines.forEach((l, i) => txt(l, bx + 14, by + 8 + P * 0.65 + i * P * 1.3, { size: P, color: '#5d4037', align: 'left', shadow: false, weight: '600' }));
  }
}

function drawBubbles(s) {
  const k = app.cam.scale, P = textPx(H) * 0.85;
  const shown = [false, false];
  for (const b of app.bubbles) {
    if (b.delay > 0 || b.who < 0 || shown[b.who]) continue;
    shown[b.who] = true;
    const p = s.players[b.who];
    const px = W / 2 + (p.x + p.w / 2 - app.cam.x) * k, py = H / 2 + (p.y - app.cam.y) * k - k * 0.5;
    const lines = wrapLines(b.text, 260, P, '600');
    ctx.font = `600 ${P}px system-ui, sans-serif`;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24, bh = lines.length * P * 1.3 + 14;
    const bx = Math.min(W - bw - 8, Math.max(8, px - bw / 2)), by = Math.max(8, py - bh - 10);
    ctx.globalAlpha = Math.min(1, b.life * 2);
    panel(bx, by, bw, bh, 'rgba(255,255,255,0.95)', 10);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(px - 6, by + bh); ctx.lineTo(px + 6, by + bh); ctx.lineTo(px, by + bh + 9); ctx.fill();
    lines.forEach((l, i) => txt(l, bx + 12, by + 7 + P * 0.65 + i * P * 1.3, { size: P, color: b.who ? '#0b7285' : '#c2255c', align: 'left', shadow: false, weight: '600' }));
    ctx.globalAlpha = 1;
  }
}

function drawPause() {
  drawPlay();
  ctx.fillStyle = 'rgba(10, 8, 25, 0.6)'; ctx.fillRect(0, 0, W, H);
  const P = textPx(H);
  txt('Paused', W / 2, H * 0.24, { size: P * 2 });
  menuList(['Keep playing', 'Restart', 'Settings', 'Quit to menu'], W / 2, H * 0.4, app.pauseIndex, P);
}

function drawComplete() {
  drawPlay();
  const s = app.run;
  ctx.fillStyle = 'rgba(255, 175, 204, 0.6)'; ctx.fillRect(0, 0, W, H);
  const P = textPx(H);
  const L = labelsFor(app.devices[0]);
  if (s.mode !== 'chapter') {
    const msg = s.winner < 0 ? 'A tie! Perfect match.' : `${NAMES[s.winner]} wins!`;
    txt(msg, W / 2, H * 0.36, { size: P * 3, color: s.winner < 0 ? '#ffffff' : PLAYER_COLORS[s.winner] });
    txt(`${s.score[0]} – ${s.score[1]}`, W / 2, H * 0.48, { size: P * 1.4 });
    txt(`${L.ok}: play again  ·  ${L.back}: back`, W / 2, H * 0.62, { size: P });
    return;
  }
  couple(W / 2, H * 0.34, Math.min(100, H * 0.13));
  txt('You did it together!', W / 2, H * 0.44, { size: P * 2.4 });
  if (s.heartsTotal) txt(`♥ ${s.hearts} of ${s.heartsTotal} hearts`, W / 2, H * 0.54, { size: P * 1.2, color: '#d6336c' });
  const last = s.chapterId === CHAPTERS[CHAPTERS.length - 1].id;
  txt(`${L.ok}: ${last ? 'the end' : 'next chapter'}  ·  ${L.back}: chapters`, W / 2, H * 0.66, { size: P });
}

const CREDITS = [
  ['Sweety', 3], ['a game for two', 1.2], ['', 1],
  ['Starring', 0.9], ['Sugar  &  Spice', 1.6], ['', 1],
  ['Made for', 0.9], ['the two of you', 1.6], ['', 1],
  ['Built with', 0.9], ['Claude Code, Brain and ZaneGPT', 1.2], ['', 1],
  ['Every chapter tested by two very patient robots', 0.9], ['', 1],
  ['Happy anniversary.', 1.8], ['Same time next year?', 1.2],
];

function drawCredits() {
  softBackground('#ffafcc', '#cdb4db');
  const P = textPx(H);
  let y = H - app.creditsT * 42 + 40;
  for (const [line, sz] of CREDITS) {
    if (line) txt(line, W / 2, y, { size: P * sz });
    y += P * (sz * 1.6 + 0.6);
  }
  couple(W / 2, Math.max(H * 0.5, y + 120), Math.min(110, H * 0.14));
  if (app.creditsT > 1.5) hint(`${labelsFor(app.devices[0]).ok}: back to the menu`);
}

// ---------------------------------------------------------------- loop

let last = 0;
function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  app.t += dt;
  watchPads();
  switch (app.screen) {
    case 'title': updateTitle(); drawTitle(); break;
    case 'menu': updateMenu(); drawMenu(); break;
    case 'chapters': updateChapters(); drawChapters(); break;
    case 'minis': updateMinis(); drawMinis(); break;
    case 'settings': updateSettings(); if (app.screen === 'settings') drawSettings(); break;
    case 'story': updateStory(); if (app.screen === 'story') drawStory(); break;
    case 'play':
      updatePlay(dt);
      if (app.banner > 0) app.banner -= dt;
      updateFx(dt);
      watchPowers(dt);
      if (app.run) snapCamera(app.cam, app.run, W, H);
      if (app.screen === 'play' || app.screen === 'ending') drawPlay();
      break;
    case 'ending':
      updateFx(dt); snapCamera(app.cam, app.run, W, H); drawPlay();
      app.ending -= dt;
      if (app.ending <= 0) finishRun();
      break;
    case 'pause': updatePause(); if (app.screen === 'pause') drawPause(); break;
    case 'complete': updateComplete(); if (app.screen === 'complete') drawComplete(); break;
    case 'credits': updateCredits(dt); if (app.screen === 'credits') drawCredits(); break;
    default: break;
  }
  if (app.fade > 0) {
    ctx.fillStyle = `rgba(255, 240, 246, ${Math.min(1, app.fade)})`; ctx.fillRect(0, 0, W, H);
    app.fade = Math.max(0, app.fade - dt * 2.5);
  }
  requestAnimationFrame(frame);
}

// A controller dropping out mid-chapter pauses instead of leaving a character running.
function watchPads() {
  const n = connectedPads();
  if (n < app.padsSeen && app.screen === 'play' && app.devices.some((d) => d && d.startsWith('pad'))) { app.pauseIndex = 0; go('pause'); }
  app.padsSeen = n;
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('blur', () => { if (app.screen === 'play') { app.pauseIndex = 0; go('pause'); } });
initInput(window);
onAnyKey(() => { unlockAudio(); applyVolumes(); });
window.addEventListener('pointerdown', () => { unlockAudio(); applyVolumes(); });
applyVolumes();
playMusic('title');
requestAnimationFrame(frame);

// For browser tests.
window.__sweety = {
  app,
  join: (a = 'kbL', b = 'kbR') => { app.devices = [a, b]; go('menu'); },
  start: (id) => startRun(id),
  begin: (id) => beginChapter(id),
};
