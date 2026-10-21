// Screens and the loop. Owns the view state (camera, particles, bubbles, shake,
// fades); the run itself is sim.js's.
import { DT, MAX_STEPS } from './config.js';
import { CHAPTERS, MINIGAMES, STORY, chapterById } from './levels.js';
import { createRun, step, NAMES, powerOf, NO_INPUT } from './sim.js';
import { drawWorld, drawCharacter, snapCamera, makeCamera, textPx, PLAYER_COLORS, heart, zoneAt, drawStar } from './render.js';
import { YARD } from './yard.js';
import { preloadAI, makeAI, aiInputs, aiReady } from './ai.js';
import { initInput, read, flush, labelsFor, onAnyKey, ALL_DEVICES, connectedPads, padConnected, initTouch, setTouchLayout, touchSeen } from './input.js';
import { loadProgress, saveProgress } from './save.js';
import { unlockAudio, playEvents, sfx, setVolumes } from './audio.js';
import { playMusic } from './music.js';
import { soundFrame } from './soundscape.js';
import { createLockstep, scheduleLocal, receive as lsReceive, advance as lsAdvance, ready as lsReady } from './lockstep.js';
import * as net from './net.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

export const POWER_NAME = {
  none: 'wave', pin: 'pin', slam: 'slam (in the air)', lantern: 'shine (hold)', size: 'shrink / grow',
  swap: 'swap places', flip: 'flip gravity', gust: 'gust', glide: 'glide: hold jump', freeze: 'stop time (hold)', dash: 'dash',
};
const SHAKE = { thud: 0.25, launch: 0.2, crate: 0.3, glass: 0.25, die: 0.3, boom: 0.6, bonk: 0.2, flood: 0.3 };

const app = {
  screen: 'splash',         // splash | title | menu | chapters | minis | settings | story | play | ending | pause | complete | credits
  devices: [null, null],    // device claimed by Sugar, Spice
  active: 0,                // solo: which character the one device drives
  splashT: 0,
  progress: loadProgress(),
  menuIndex: 0, chapterIndex: 0, miniIndex: 0, pauseIndex: 0, settingsIndex: 0,
  settingsBack: 'menu',
  run: null, cam: null, fx: [], banner: 0, shake: 0, fade: 1, t: 0,
  story: null,              // { lines, i, then }
  bubbles: [],              // in-level speech: { who, text, life, delay }
  ending: 0,                // seconds before the end-of-chapter card
  creditsT: 0,
  padsSeen: 0,
  online: null,             // { role: 'host'|'guest', code, slot, status, error, ls, partnerPaused, joinCode }
  onlineIndex: 0,
  toastMsg: null,
};
const S = () => app.progress.settings;

// On-screen buttons for touch: a d-pad on the left, A and B on the right, pause top-right.
function touchLayout() {
  const r = Math.max(26, Math.min(W, H) * 0.075);
  const pad = r * 1.25, by = H - pad - r * 1.0;   // clear of the hint bar at the bottom
  return [
    { act: 'left', x: pad, y: by, r }, { act: 'right', x: pad + r * 2.3, y: by, r },
    { act: 'up', x: pad + r * 1.15, y: by - r * 1.6, r: r * 0.8 }, { act: 'down', x: pad + r * 1.15, y: by + r * 0.05 + r * 0.9, r: r * 0.55 },
    { act: 'a', x: W - pad, y: by - r * 0.6, r: r * 1.1 }, { act: 'b', x: W - pad - r * 2.4, y: by + r * 0.1, r },
    { act: 'pause', x: W / 2, y: r * 0.8, r: r * 0.55 },   // top centre: the corners hold the HUD
    { act: 'sw', x: W / 2 + r * 1.5, y: r * 0.8, r: r * 0.55 },   // switch / trade characters
  ];
}
const TOUCH_GLYPH = { left: '◀', right: '▶', up: '▲', down: '▼', a: 'A', b: 'B', pause: 'II', sw: '⇄' };
function drawTouch() {
  if (!touchSeen && !app.devices.includes('touch')) return;
  for (const b of touchLayout()) {
    const g = ctx.createLinearGradient(0, b.y - b.r, 0, b.y + b.r);
    g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = 'rgba(20,10,40,0.22)'; ctx.beginPath(); ctx.arc(b.x, b.y + 3, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.82, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    txt(TOUCH_GLYPH[b.act], b.x, b.y, { size: b.r * 0.8, color: 'rgba(255,255,255,0.95)', shadow: true });
  }
  if (H > W) {   // a phone held upright: the world is tiny
    panel(W * 0.1, H * 0.06, W * 0.8, textPx(H) * 2.4, 'rgba(20,16,40,0.8)');
    txt('Turn your phone sideways ↻', W / 2, H * 0.06 + textPx(H) * 1.2, { size: textPx(H) });
  }
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  setTouchLayout(touchLayout());
}

// one device on the couch and not online: it drives one character at a time, switch flips which
const soloLocal = () => !app.online && !!app.devices[0] && !app.devices[1];
const devOf = (i) => (app.online ? (i === app.online.slot ? app.devices[0] : null) : soloLocal() ? app.devices[0] : app.devices[i]);
const localDevices = () => (app.online ? [app.devices[0]] : app.devices);
const remoteName = (i) => (app.online && i !== app.online.slot ? 'online' : null);
function say(msg) { app.toastMsg = { text: msg, life: 3 }; }

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

const YARD_STARS = YARD.map.join('').split('$').length - 1;
// What the Yard is built from: your progress, or, online, the host's (both machines must agree).
function yardOpts(at = null) {
  return { unlocked: app.progress.unlocked, stars: Object.keys(app.progress.stars), at };
}
function startRun(id, extra = null) {
  const ch = chapterById(id);
  const gentle = app.online ? !!app.online.gentle : S().gentle;
  const opts = { gentle };
  if (id === 'yard') Object.assign(opts, extra || (app.online && app.online.yardOpts) || yardOpts(app.yardAt));
  app.run = createRun(id, opts);
  app.zone = null; app.pendingEnter = null; app.ai = null;
  if (app.online) startLockstep();
  app.cam = makeCamera(app.run);
  snapCamera(app.cam, app.run, W, H, true);
  app.fx = []; app.bubbles = []; app.shake = 0; acc = 0; app.powers = null; app.toast = null;
  app.banner = 6;
  go('play');
  playMusic(ch.music || 'garden');
}

// Into the Yard (at a door you came out of, or at the start). Online, the host decides.
function enterYard(at = null) {
  app.yardAt = at; app.fromYard = null;
  if (app.online) { if (app.online.role === 'host') onlineStart('yard', false, at); return; }
  startRun('yard', yardOpts(at));
}
// Both of you stood in a door: in you go (and back out here when it's done)
function doEnter(id) {
  app.fromYard = id; app.yardAt = id;
  if (app.online) { if (app.online.role === 'host') onlineStart(id); return; }
  if (MINIGAMES.some((m) => m.id === id)) startRun(id); else beginChapter(id);
}

// ---------------------------------------------------------------- online

function startLockstep() {
  const o = app.online;
  const r = o.round;
  o.ls = createLockstep({ local: o.slot, host: o.role === 'host', send: (m) => net.send({ ...m, r }) });
  o.stall = 0; o.partnerPaused = false;
  const keep = [];
  for (const m of o.inbox) { if (m.r === r) lsReceive(o.ls, m, app.run); else if (m.r > r) keep.push(m); }
  o.inbox = keep;
}

function onlineStart(id, restart = false, at = null) {   // host picks; both machines start the same chapter
  const o = app.online;
  o.round++;
  o.gentle = S().gentle;
  o.ls = null;   // the last round's lockstep must not swallow this round's inputs
  o.yardOpts = id === 'yard' ? (restart && o.yardOpts ? o.yardOpts : yardOpts(at)) : o.yardOpts;
  if (id !== 'yard' && !restart) { app.fromYard = app.fromYard || null; }
  net.send({ t: 'start', id, gentle: o.gentle, round: o.round, restart, yard: id === 'yard' ? o.yardOpts : null, from: app.fromYard });
  if (restart || id === 'yard') startRun(id); else beginChapter(id);
}

function onNetData(m) {
  const o = app.online;
  if (!o || !m || typeof m !== 'object') return;
  if (m.t === 'in' || m.t === 'hash' || m.t === 'state') {
    if (o.ls && m.r === o.round) lsReceive(o.ls, m, app.run);
    else if (m.r > o.round || !o.ls) o.inbox.push(m);
    return;
  }
  if (m.t === 'hello') {
    if (o.role === 'guest') { o.slot = 1 - m.hostSlot; o.status = 'connected'; o.hostUnlocked = m.unlocked; sfx('confirm'); }
  } else if (m.t === 'start' && o.role === 'guest') {
    o.round = m.round; o.gentle = m.gentle; o.ls = null;
    if (m.yard) o.yardOpts = m.yard;
    app.fromYard = m.from || null;
    if (m.restart || m.id === 'yard') startRun(m.id); else beginChapter(m.id);
  } else if (m.t === 'pause') o.partnerPaused = true;
  else if (m.t === 'resume') o.partnerPaused = false;
  else if (m.t === 'credits' && o.role === 'guest') go('credits');
  else if (m.t === 'lobby' && o.role === 'guest') { app.run = null; o.ls = null; go('online'); }
}

function netHandlers() {
  return {
    onWaiting: () => { app.online.status = 'hosting'; },
    onOpen: () => {
      const o = app.online;
      if (o.role === 'host') {
        o.status = 'connected';
        net.send({ t: 'hello', hostSlot: o.slot, unlocked: app.progress.unlocked });
        sfx('confirm');
      }
    },
    onData: onNetData,
    onClose: (msg) => onlineFail(msg),
    onError: (msg) => onlineFail(msg),
  };
}

function onlineFail(msg) {
  if (!app.online) return;
  app.online.status = 'error'; app.online.error = msg; app.online.ls = null;
  if (['play', 'ending', 'pause', 'settings', 'story', 'complete', 'chapters', 'minis', 'credits'].includes(app.screen)) { app.run = null; go('online'); }
}

function leaveOnline() {
  net.leave(true);
  app.online = null;
  go(app.devices[0] && app.devices[1] ? 'menu' : 'menu');
}

function hostOnline() {
  const code = net.newCode();
  app.online = { role: 'host', code, slot: app.online?.slot ?? 0, status: 'starting', round: 0, inbox: [], error: null };
  net.host(code, netHandlers()).catch((e) => onlineFail(e.message));
}

function joinOnline(code) {
  app.online = { role: 'guest', code, slot: 1, status: 'joining', round: 0, inbox: [], error: null, joinCode: code };
  net.join(code, netHandlers()).catch((e) => onlineFail(e.message));
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
  if (app.fromYard && id !== 'home') {   // came in from the Yard: go back out the same door
    if (app.online && app.online.role !== 'host') return;
    enterYard(app.fromYard); return;
  }
  const idx = CHAPTERS.findIndex((c) => c.id === id);
  const startNext = app.online ? onlineStart : (i) => (CHAPTERS.some((c) => c.id === i) ? beginChapter(i) : startRun(i));
  if (app.online && app.online.role !== 'host') return;   // the host decides what's next
  if (idx < 0) { startNext(id); return; }              // mini-game: play again
  if (idx === CHAPTERS.length - 1) {
    app.progress.seenCredits = true; save();
    if (app.online) net.send({ t: 'credits' });
    go('credits'); return;
  }
  app.chapterIndex = idx + 1;
  startNext(CHAPTERS[idx + 1].id);
}

const move = (i, by, n) => ((i + by) % n + n) % n;
const unlockedCount = () => Math.min(CHAPTERS.length, app.progress.unlocked);
const chapterLocked = (i) => i >= unlockedCount();

// Menu input: anyone who has joined can drive the menus, with the menu keys
// (OK / Back), never jump, so moving up can't also confirm.
function menuInput() {
  const out = { left: 0, right: 0, up: 0, down: 0, ok: false, back: false, any: false };
  for (const d of localDevices()) {
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
    if (app.devices.includes(d) && (r.leftPressed || r.rightPressed || r.switchPressed)) { swapSides(); return; }
    if (!r.jumpPressed) continue;
    if (app.devices.includes(d)) {
      if (app.devices[0] && app.devices[1]) { sfx('confirm'); go('menu'); return; }
      if (d === app.devices[0] && app.t - (app.joinedAt || 0) > 0.4) { sfx('confirm'); go('menu'); return; }   // alone: for online play
      continue;
    }
    const slot = app.devices.indexOf(null);
    if (slot >= 0) {
      app.devices[slot] = d; app.joinedAt = app.t; sfx('wave');
      if (app.pendingJoin) { const c = app.pendingJoin; app.pendingJoin = null; go('online'); joinOnline(c); return; }
    }
  }
}

const twoHere = () => (app.devices[0] && app.devices[1]) || (app.online && app.online.status === 'connected') || soloLocal();
const needTwo = () => say('Two players needed: join a second controller or keyboard half on the title screen, or play online.');
const MAIN_MENU = [
  { label: 'Play', go: () => { if (!twoHere()) return needTwo(); enterYard(app.yardAt); } },
  { label: 'Chapters', go: () => { if (!twoHere()) return needTwo(); app.chapterIndex = Math.min(unlockedCount() - 1, CHAPTERS.length - 1); go('chapters'); } },
  { label: 'Mini-games', go: () => { if (!twoHere()) return needTwo(); go('minis'); } },
  { label: 'Play online', go: () => { app.onlineIndex = 0; go('online'); } },
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
  if (m.back) { go(app.online ? 'online' : 'menu'); return; }
  if (m.ok) {
    if (chapterLocked(app.chapterIndex)) sfx('nope');
    else { sfx('confirm'); if (app.online) onlineStart(CHAPTERS[app.chapterIndex].id); else beginChapter(CHAPTERS[app.chapterIndex].id); }
  }
}

function updateMinis() {
  const m = menuInput();
  const n = MINIGAMES.length;
  app.miniIndex = move(app.miniIndex, m.down + m.right - m.up - m.left, n);
  if (m.back) { go(app.online ? 'online' : 'menu'); return; }
  if (m.ok) { sfx('confirm'); if (app.online) onlineStart(MINIGAMES[app.miniIndex].id); else startRun(MINIGAMES[app.miniIndex].id); }
}

function updateOnline() {
  const o = app.online;
  const m = menuInput();
  if (!o || o.status === 'error') {
    const items = onlineItems();
    app.onlineIndex = move(app.onlineIndex, m.down - m.up, items.length);
    const it = items[app.onlineIndex];
    if (it.side && (m.left || m.right)) { it.side(); sfx('tick'); }
    if (m.ok && it.go) { sfx('confirm'); it.go(); }
    else if (m.back) { app.online = null; go('menu'); }
    return;
  }
  if (o.status === 'typing') {
    o.typed = o.typed || '';
    const L = net.CODE_LETTERS;
    if (m.up || m.down) {   // controller: pick letters
      const cur = o.typed.length < 4 ? o.letter ?? 0 : 0;
      o.letter = ((cur + m.down - m.up) % L.length + L.length) % L.length;
    }
    if (m.right && o.typed.length < 4) { o.typed += L[o.letter ?? 0]; o.letter = 0; }
    if (m.left && o.typed.length) o.typed = o.typed.slice(0, -1);
    if (m.ok && o.typed.length === 4) { joinOnline(o.typed); return; }
    if (m.ok && o.typed.length < 4) { o.typed += L[o.letter ?? 0]; o.letter = 0; }
    if (m.back) { app.online = null; go('online'); }
    return;
  }
  if (o.status === 'connected') {
    if (o.role === 'host') {
      const n = 4;
      app.onlineIndex = move(app.onlineIndex, m.down - m.up, n);
      if (m.ok) {
        sfx('confirm');
        if (app.onlineIndex === 0) enterYard(null);
        else if (app.onlineIndex === 1) { app.chapterIndex = Math.min(unlockedCount() - 1, CHAPTERS.length - 1); go('chapters'); }
        else if (app.onlineIndex === 2) go('minis');
        else leaveOnline();
      }
    }
    if (m.back) leaveOnline();
    return;
  }
  if (m.back) leaveOnline();   // hosting / joining: cancel
}

function onlineItems() {
  const slot = app.online?.slot ?? app.wantSlot ?? 0;
  return [
    { label: 'Host a game', go: () => { app.wantSlot = slot; hostOnline(); app.online.slot = slot; } },
    { label: 'Join a game', go: () => { app.online = { role: 'guest', status: 'typing', typed: '', letter: 0, round: 0, inbox: [] }; } },
    { label: `If I host, I play: ${NAMES[slot]}`, side: () => { app.wantSlot = 1 - slot; if (app.online) app.online.slot = app.wantSlot; } },
    { label: 'Back', go: () => { app.online = null; go('menu'); } },
  ];
}

const SETTINGS = [
  { label: 'Music', get: () => `${S().music} / 10`, left: () => { S().music = Math.max(0, S().music - 1); }, right: () => { S().music = Math.min(10, S().music + 1); } },
  { label: 'Sounds', get: () => `${S().sfx} / 10`, left: () => { S().sfx = Math.max(0, S().sfx - 1); }, right: () => { S().sfx = Math.min(10, S().sfx + 1); } },
  { label: 'Gentle mode', get: () => (S().gentle ? 'on: quick respawns where you stood' : 'off'), toggle: () => { S().gentle = !S().gentle; } },
  { label: 'Screen shake', get: () => (S().shake ? 'on' : 'off'), toggle: () => { S().shake = !S().shake; } },
  { label: 'Playing alone', get: () => (S().alone === 'ai' ? 'an AI plays the other one (for testing)' : 'you switch between them'), toggle: () => { S().alone = S().alone === 'ai' ? 'switch' : 'ai'; if (S().alone === 'ai') preloadAI(); } },
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
      if (!app.online) app.run.gentle = S().gentle;     // gentle mode applies to the run in progress too (couch only: online both sims must agree)
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

// "Back to checkpoint" brings BOTH of you back to the last flag: the way out of
// any spot where one of you is stranded. It travels as an input, so online works too.
function pauseItems() {
  const inYard = app.run && app.run.yard;
  const back = app.run && app.run.mode === 'chapter' ? [inYard ? 'Back to the Plaza (both)' : 'Back to checkpoint (both)'] : [];
  const restart = inYard ? [] : [app.online ? 'Restart (both of you)' : 'Restart'];
  const yard = app.fromYard && !inYard ? ['Back to the Yard'] : [];
  if (!app.online) return ['Keep playing', ...back, ...restart, ...yard, app.watch ? 'Stop watching' : 'Watch the AI play it', 'Settings', 'Quit to menu'];
  return app.online.role === 'host' ? ['Keep playing', ...back, ...restart, ...yard, 'Settings', 'Leave online game'] : ['Keep playing', ...back, 'Settings', 'Leave online game'];
}
function pauseGame() {
  if (app.screen !== 'play') return;
  app.pauseIndex = 0;
  if (app.online) net.send({ t: 'pause' });
  go('pause');
}
function resume() { go('play'); playMusic(chapterById(app.run.chapterId).music); if (app.online) net.send({ t: 'resume' }); }
function updatePause() {
  const m = menuInput();
  const n = pauseItems().length;
  if (!app.online) app.pauseIndex = move(app.pauseIndex, 0, n);
  if (app.online) {
    app.pauseIndex = move(app.pauseIndex, m.down - m.up, n);
    if (m.back || m.pause) { resume(); return; }
    if (m.ok) {
      const item = pauseItems()[app.pauseIndex];
      if (item === 'Keep playing') resume();
      else if (item.startsWith('Back to checkpoint') || item.startsWith('Back to the Plaza')) { app.regroup = true; resume(); }
      else if (item === 'Back to the Yard') enterYard(app.fromYard);
      else if (item.startsWith('Restart')) onlineStart(app.run.chapterId, true);
      else if (item === 'Settings') { app.settingsBack = 'pause'; go('settings'); }
      else { app.run = null; leaveOnline(); }
    }
    return;
  }
  app.pauseIndex = move(app.pauseIndex, m.down - m.up, n);
  if (m.back || m.pause) { go('play'); playMusic(chapterById(app.run.chapterId).music); return; }   // Start toggles
  if (m.ok) {
    const item = pauseItems()[app.pauseIndex];
    if (item === 'Keep playing') resume();
    else if (item.startsWith('Back to checkpoint') || item.startsWith('Back to the Plaza')) { app.regroup = true; resume(); }
    else if (item === 'Back to the Yard') enterYard(app.fromYard);
    else if (item === 'Watch the AI play it') { preloadAI(); app.watch = true; resume(); }
    else if (item === 'Stop watching') { app.watch = false; resume(); }
    else if (item === 'Restart') startRun(app.run.chapterId);
    else if (item === 'Settings') { app.settingsBack = 'pause'; go('settings'); }
    else { const id = app.run.chapterId; app.run = null; app.fromYard = null; go(id === 'yard' ? 'menu' : CHAPTERS.some((c) => c.id === id) ? 'chapters' : 'minis'); }
  }
}

function updateComplete() {
  const m = menuInput();
  if (m.ok || m.any && !m.back) afterComplete();
  else if (m.back) {
    if (app.fromYard) { afterComplete(); return; }
    if (app.online) { if (app.online.role === 'host') net.send({ t: 'lobby' }); app.run = null; app.online.ls = null; go('online'); return; }
    const story = CHAPTERS.some((c) => c.id === app.run.chapterId); app.run = null; go(story ? 'chapters' : 'minis');
  }
}

function updateCredits(dt) {
  app.creditsT += dt;
  const m = menuInput();
  if ((m.any || m.back) && app.creditsT > 1.5) {
    if (app.fromYard && (!app.online || app.online.role === 'host')) { enterYard('home'); return; }
    go(app.online ? 'online' : 'menu');
  }
}

let acc = 0;
function updatePlayOnline(dt) {
  const o = app.online, ls = o.ls;
  if (!ls) { if (o.status !== 'connected') go('online'); return; }
  acc += Math.min(dt, 0.25);
  let k = 0;
  while (acc >= DT && k < MAX_STEPS) {
    // one local sample per tick of real time; never read the device when the
    // lockstep can't take it (that would eat a latched jump)
    if (ls.scheduled < ls.tick + 8) {
      const inp = app.driver ? { ...read(app.devices[0]), ...app.driver(app.run, ls) } : read(app.devices[0]);
      if (app.regroup) { inp.regroup = true; app.regroup = false; }
      scheduleLocal(ls, inp);   // the tick's jump still counts if pause was pressed with it
      if (inp.pausePressed) { pauseGame(); acc = 0; return; }
    }
    acc -= DT; k++;
  }
  if (k >= MAX_STEPS) acc = 0;
  const { run, n } = lsAdvance(ls, app.run, MAX_STEPS, (r) => onEvents(r.events));
  app.run = run;
  if (app.pendingEnter) { const id = app.pendingEnter; app.pendingEnter = null; if (o.role === 'host') doEnter(id); return; }
  o.stall = n > 0 || lsReady(ls) ? 0 : o.stall + dt;   // waiting only if nothing ran this frame
  if (app.run.complete) { app.ending = app.run.mode === 'chapter' ? 1.4 : 1.8; app.screen = 'ending'; }
}

function updatePlay(dt) {
  if (app.online) { updatePlayOnline(dt); return; }
  acc += Math.min(dt, 0.25);
  let steps = 0;
  if (app.turbo) acc = DT * app.turbo;   // browser tests: many steps per frame
  while (acc >= DT && steps < (app.turbo || MAX_STEPS)) {
    const inputs = app.driver ? app.driver(app.run) : localInputs();
    if (app.regroup) { inputs[0] = { ...inputs[0], regroup: true }; app.regroup = false; }
    step(app.run, inputs);   // run the tick first: the partner's jump pressed with the pause still counts
    onEvents(app.run.events);
    if (app.pendingEnter) { const id = app.pendingEnter; app.pendingEnter = null; doEnter(id); return; }
    if (inputs.some((i) => i.pausePressed)) { pauseGame(); acc = 0; return; }
    acc -= DT; steps++;
    if (app.run.complete) { app.ending = app.run.mode === 'chapter' ? 1.4 : 1.8; app.screen = 'ending'; return; }
  }
  if (steps >= MAX_STEPS && !app.turbo) acc = 0;   // fell behind: drop the debt, don't spiral
}

const aiOn = () => !app.online && (app.watch || (soloLocal() && S().alone === 'ai'));
function localInputs() {
  if (aiOn()) {   // testing alone: an AI plays the other one (or both, to watch)
    preloadAI();   // cached after the first time
    if (!app.ai || app.ai.run !== app.run || (!app.ai.ready && aiReady())) { app.ai = makeAI(app.run); app.ai.run = app.run; }
    if (app.watch) {
      const r = read(app.devices[0]);
      const inputs = aiInputs(app.ai, app.run, [0, 1]);
      inputs[0] = { ...inputs[0], pausePressed: r.pausePressed };
      return inputs;
    }
    const r = read(app.devices[0]);
    if (r.switchPressed) { app.active = 1 - app.active; sfx('confirm'); }
    const inputs = aiInputs(app.ai, app.run, [1 - app.active]);
    if (app.ai.lost && !app.ai.told) { app.ai.told = true; say('The AI lost the plan here. It will follow you and hold switches; Back to checkpoint can help.'); }
    inputs[app.active] = r;
    return inputs;
  }
  if (soloLocal()) {
    const r = read(app.devices[0]);
    if (r.switchPressed) { app.active = 1 - app.active; sfx('confirm'); }
    const inputs = [NO_INPUT, NO_INPUT];
    inputs[app.active] = r;
    return inputs;
  }
  const inputs = app.devices.map((d) => read(d));
  if (inputs.some((r) => r.switchPressed)) swapSides();
  return inputs;
}

// the two on the couch trade characters (the devices change hands, the world doesn't)
function swapSides() {
  app.devices = [app.devices[1], app.devices[0]];
  app.active = 1 - app.active;
  sfx('confirm');
  say(`Swapped! ${NAMES[0]}: ${app.devices[0] ? labelsFor(app.devices[0]).name : 'nobody yet'} · ${NAMES[1]}: ${app.devices[1] ? labelsFor(app.devices[1]).name : 'nobody yet'}`);
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
    yardEvent(e);
  }
}

// The Yard: doors, stars and toys. Toys only ever keep score for fun.
const CUDDLES = [
  [['Sugar', 'Nice view.'], ['Spice', 'I wasn\'t looking at the view.']],
  [['Spice', 'Five more minutes?'], ['Sugar', 'Ten.']],
  [['Sugar', 'Remember our first date?'], ['Spice', 'You laughed at my hat.']],
  [['Spice', 'Best yard in the world.'], ['Sugar', 'Best company in it.']],
  [['Sugar', 'Tired?'], ['Spice', 'Never, with you.']],
];
function tally(toy, who) {
  if (who < 0) return;
  const t = app.progress.tally[toy] || [0, 0];
  t[who]++; app.progress.tally[toy] = t; save();
  return t;
}
function yardEvent(e) {
  const P = app.progress;
  switch (e.type) {
    case 'enter': app.pendingEnter = e.id; break;
    case 'locked': say(e.id === 'home' ? 'Home opens when you have finished the Clocktower.' : 'Finish the chapter before this one to open it.'); break;
    case 'star': {
      if (!P.stars[e.key]) { P.stars[e.key] = true; save(); }
      say(`★ A star! ${Object.keys(P.stars).length} of ${YARD_STARS}`);
      break;
    }
    case 'raceEnd': {
      if (e.who < 0) { say('Nobody made it to the finish.'); break; }
      const t = tally('race', e.who);
      const best = !P.records.race || e.t < P.records.race;
      if (best) { P.records.race = e.t; save(); }
      say(`${NAMES[e.who]} wins the race in ${e.t.toFixed(2)}s${best ? ' (a new best!)' : ''}. All time: Sugar ${t[0]}, Spice ${t[1]}.`);
      break;
    }
    case 'pop': { const t = tally('balloons', e.who); say(`${NAMES[e.who]} popped it first! All time: Sugar ${t[0]}, Spice ${t[1]}.`); break; }
    case 'footyWin': { const t = tally('footy', e.who); say(`${NAMES[e.who]} wins the footy! All time: Sugar ${t[0]}, Spice ${t[1]}.`); break; }
    case 'strike': {
      if (!P.records.striker || e.h > P.records.striker) { P.records.striker = e.h; save(); }
      if (e.bell) say(`DING! Spice rang the bell from ${e.h.toFixed(1)} up.`);
      break;
    }
    case 'cuddle': {
      P.cuddles = (P.cuddles || 0) + 1; save();
      CUDDLES[e.n % CUDDLES.length].forEach(([who, text], i) => app.bubbles.push({ who: NAMES.indexOf(who), text, life: 3.2, delay: i * 2.6 }));
      break;
    }
    default: break;
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
      case 'star': add(14, 'dot', '#ffd43b', 7); app.fx.push({ x, y, vx: 0, vy: 0, life: 0.6, max: 0.6, kind: 'ring', color: '#ffd43b' }); break;
      case 'pop': add(18, 'dot', PLAYER_COLORS[e.who], 9); break;
      case 'goal': add(16, 'dot', PLAYER_COLORS[e.who], 8); break;
      case 'cuddle': add(10, 'heart', '#ff4d6d', 3, 1.2); break;
      case 'boing': add(5, 'dot', '#ff8fab', 3, 0.3); break;
      case 'note': add(1, 'dot', '#ffffff', 1.5, 0.5); break;
      case 'strike': if (e.bell) add(16, 'dot', '#ffd43b', 7); break;
      default: break;
    }
  }
}

// When a power changes under your feet (the finale's zones), say so, in your own buttons.
function watchPowers(dt) {
  if (!app.run) return;
  const now = app.run.players.map((p) => powerOf(app.run, p));
  if (app.powers && (now[0] !== app.powers[0] || now[1] !== app.powers[1]) && app.run.mode === 'chapter') {
    const lines = [0, 1].filter((i) => now[i] !== app.powers[i]).map((i) => [i, `${NAMES[i]}: ${POWER_NAME[now[i]] || now[i]}${now[i] === 'glide' || remoteName(i) ? '' : ` (${labelsFor(devOf(i)).ability})`}`]);
    app.toast = { lines, life: 3 };
    sfx('confirm');
  }
  app.powers = now;
  if (app.toast) app.toast.life -= dt;
}

// The Yard: walking into a district says its name and plays its music.
const DISTRICT_MUSIC = { 'The Plaza': 'home', 'The Garden': 'garden', 'The Workshop': 'toolbox', 'The Night Meadow': 'night', 'The Attic': 'attic', 'The Rooftops': 'sky', 'The Clock Yard': 'clock' };
function watchZone(dt) {
  if (app.zoneBanner) app.zoneBanner.life -= dt;
  const s = app.run;
  if (!s || !s.yard) return;
  const mid = (s.players[0].x + s.players[1].x) / 2 + 0.5;
  const z = zoneAt(s, mid);
  if (app.zone !== z.name) {
    if (app.zone) app.zoneBanner = { name: z.name, life: 3 };
    app.zone = z.name;
    playMusic(DISTRICT_MUSIC[z.name] || 'home');
  }
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

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
function txt(str, x, y, { size = textPx(H), color = '#fff', align = 'center', weight = '700', shadow = true } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) {   // a soft dark edge and a drop, so light text reads on any background
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(40, 14, 60, 0.35)'; ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.strokeText(str, x, y + Math.max(1, size * 0.06));
    ctx.fillStyle = 'rgba(40, 14, 60, 0.4)'; ctx.fillText(str, x, y + Math.max(1.5, size * 0.07));
  }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function roundPath(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

// Glass: the fill, a soft drop shadow under it, a sheen on the upper half and a light top edge.
function panel(x, y, w, h, color = 'rgba(28, 20, 52, 0.72)', r = 16) {
  ctx.fillStyle = 'rgba(30, 10, 50, 0.16)';
  roundPath(x, y + Math.max(3, h * 0.03), w, h, r); ctx.fill();
  ctx.fillStyle = color;
  roundPath(x, y, w, h, r); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + r, y + 1); ctx.lineTo(x + w - r, y + 1); ctx.stroke();
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

// The menu backdrop: a diagonal gradient, big soft lights and a gentle vignette, painted once
// per colour pair and screen size, then blitted (full-screen gradients are costly every frame).
const bgCache = new Map();
function softBackground(c1, c2) {
  const key = `${c1}${c2}${W}x${H}`;
  let bg = bgCache.get(key);
  if (!bg) {
    if (bgCache.size > 6) bgCache.clear();
    bg = document.createElement('canvas'); bg.width = Math.max(1, Math.ceil(W / 2)); bg.height = Math.max(1, Math.ceil(H / 2));
    const b = bg.getContext('2d', { willReadFrequently: true });   // painted once in software at half size (it is all soft), uploaded once
    b.scale(0.5, 0.5);
    const g = b.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    const R = Math.max(W, H) * 0.45;
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + 0.3 * i), y = H * (0.3 + (i % 2) * 0.4);
      const rg = b.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = rg; b.fillRect(x - R, y - R, R * 2, R * 2);
    }
    const v = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(60,20,80,0)'); v.addColorStop(1, 'rgba(60,20,80,0.18)');
    b.fillStyle = v; b.fillRect(0, 0, W, H);
    bgCache.set(key, bg);
  }
  ctx.drawImage(bg, 0, 0, W, H);
  for (let i = 0; i < 14; i++) {   // drifting hearts
    const x = ((i * 173 + app.t * 18 * (1 + (i % 3) * 0.3)) % (W + 80)) - 40;
    const y = H - ((i * 97 + app.t * 26 * (1 + (i % 4) * 0.2)) % (H + 80)) + 40;
    ctx.globalAlpha = 0.18;
    heart(ctx, x, y, 10 + (i % 4) * 4, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

function groundShadow(cx, y, w, a = 0.22) {
  ctx.save(); ctx.translate(cx, y); ctx.scale(1, 0.25);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(40,10,60,${a})`); g.addColorStop(1, 'rgba(40,10,60,0)');
  ctx.fillStyle = g; ctx.fillRect(-w, -w, w * 2, w * 2);
  ctx.restore();
}

function couple(cx, baseY, size, hop = true) {
  for (let i = 0; i < 2; i++) {
    const w = size * 0.6, h = size;
    const jump = hop ? Math.max(0, Math.sin(app.t * 3 + i * 1.4)) * size * 0.25 : 0;
    groundShadow(cx + (i ? size * 0.15 : -size * 0.75) + w / 2, baseY, w * (0.8 - jump / size), 0.25);
    drawCharacter(ctx, i, cx + (i ? size * 0.15 : -size * 0.75), baseY - h - jump, w, h, { facing: i ? -1 : 1, t: app.t, airborne: jump > 1, k: size / 1.25 });
  }
  heart(ctx, cx, baseY - size * 1.55 + Math.sin(app.t * 2) * 4, size * 0.16, '#ff4d6d', true);
}

function menuList(items, x, y, sel, P) {
  items.forEach((label, i) => {
    const s = i === sel;
    if (s) {
      const pw = Math.min(380, W - 32), py = y + i * P * 2.4 - P * 1.0;
      panel(x - pw / 2, py, pw, P * 2, 'rgba(255,255,255,0.9)', P);
      heart(ctx, x - pw / 2 + P * 1.1, py + P, P * 0.36, '#ff4d6d', true);
      heart(ctx, x + pw / 2 - P * 1.1, py + P, P * 0.36, '#ff4d6d', true);
    }
    txt(label, x, y + i * P * 2.4, { size: P * 1.1, color: s ? '#7b2cbf' : '#ffffff', shadow: !s });
  });
}

function hint(text) { txt(text, W / 2, H - 28, { size: textPx(H) * 0.75, color: 'rgba(255,255,255,0.95)', weight: '600' }); }
function navHint() {
  const L = app.devices.map(labelsFor);
  hint(`move: ${L[0].nav} or ${L[1].nav}  ·  ok: ${L[0].ok} or ${L[1].ok}  ·  back: ${L[0].back}${L[1].back !== L[0].back ? ` or ${L[1].back}` : ''}`);
}

// ---------------------------------------------------------------- screens

// ---- ZanePaul Studios: types "Stupido", thinks better of it, backspaces to "Stu", types "dios".
const SPLASH_TYPE = 0.11, SPLASH_ERASE = 0.09;
const SPLASH_SCRIPT = (() => {
  const steps = [];   // [time, text]
  let t = 0.6, txt = '';
  const type = (str) => { for (const c of str) { txt += c; t += SPLASH_TYPE; steps.push([t, txt]); } };
  const erase = (n) => { for (let i = 0; i < n; i++) { txt = txt.slice(0, -1); t += SPLASH_ERASE; steps.push([t, txt]); } };
  type('Stupido');
  t += 0.9;           // the beat: let it sink in
  erase(4);
  t += 0.35;
  type('dios');
  return { steps, end: t + 1.4 };
})();
function splashText(t) {
  let out = '';
  for (const [at, s] of SPLASH_SCRIPT.steps) if (at <= t) out = s;
  return out;
}

function updateSplash(dt) {
  const before = splashText(app.splashT);
  app.splashT += dt;
  if (splashText(app.splashT) !== before) sfx('tick');
  let skip = false;
  for (const d of ALL_DEVICES) { const r = read(d); skip ||= r.jumpPressed || r.okPressed || r.backPressed || r.pausePressed; }
  if (app.splashT > SPLASH_SCRIPT.end || (skip && app.splashT > 0.3)) { app.fade = 1; go('title'); }
}

function drawSplash() {
  const t = app.splashT;
  ctx.fillStyle = '#14101f'; ctx.fillRect(0, 0, W, H);
  const sg = ctx.createRadialGradient(W / 2, H * 0.47, 0, W / 2, H * 0.47, Math.max(W, H) * 0.5);
  sg.addColorStop(0, 'rgba(123,44,191,0.28)'); sg.addColorStop(1, 'rgba(123,44,191,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  const big = Math.max(34, Math.min(W * 0.11, H * 0.16));
  const a = Math.min(1, t / 0.5) * Math.min(1, Math.max(0, (SPLASH_SCRIPT.end - t) / 0.5));
  ctx.globalAlpha = a;
  txt('ZanePaul', W / 2, H * 0.42, { size: big, color: '#ffafcc' });
  const word = splashText(t);
  ctx.font = `700 ${big * 0.7}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const full = ctx.measureText('Studios').width;   // the word's slot never moves as it is typed
  const left = W / 2 - full / 2;
  txt(word, left, H * 0.42 + big * 0.95, { size: big * 0.7, color: '#a2d2ff', align: 'left' });
  if (Math.floor(t * 2.5) % 2 === 0 || (t > 0.6 && t < SPLASH_SCRIPT.end - 1.2)) {   // caret: solid while typing, blinks at rest
    const w = ctx.measureText(word).width;
    ctx.fillStyle = '#a2d2ff';
    ctx.fillRect(left + w + 4, H * 0.42 + big * 0.95 - big * 0.32, Math.max(3, big * 0.06), big * 0.64);
  }
  ctx.globalAlpha = 1;
}

// The logo: a warm glow behind, a deep outline, a candy gradient and a gloss.
function logo(text, cx, cy, size) {
  const R = size * 2.2;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(90, 24, 154, 0.35)'; ctx.fillText(text, cx, cy + size * 0.07);
  ctx.strokeStyle = '#7b2cbf'; ctx.lineWidth = size * 0.11; ctx.strokeText(text, cx, cy);
  const g = ctx.createLinearGradient(0, cy - size * 0.5, 0, cy + size * 0.5);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#ffe3ef'); g.addColorStop(1, '#ff9ec7');
  ctx.fillStyle = g; ctx.fillText(text, cx, cy);
  heart(ctx, cx + ctx.measureText(text).width / 2 + size * 0.2, cy - size * 0.32, size * 0.16, '#ff4d6d', true);
}

function drawTitle() {
  softBackground('#ffafcc', '#a2d2ff');
  const big = Math.max(48, Math.min(W, H) * 0.15);
  logo('Sweety', W / 2, H * 0.17 + Math.sin(app.t * 2) * 6, big);
  txt('a game for two', W / 2, H * 0.17 + big * 0.72, { size: textPx(H) * 1.1, color: '#5a189a', shadow: false, weight: '800' });

  const bw = Math.min(360, W * 0.42), bh = Math.max(130, H * 0.24);
  for (let i = 0; i < 2; i++) {
    const x = W / 2 + (i ? 12 : -12 - bw), y = H * 0.44;
    const d = app.devices[i];
    panel(x, y, bw, bh, d ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.5)', 20);
    const sz = bh * 0.38;
    if (d) {
      const R = sz * 0.9, gx = x + bw / 2, gy = y + bh * 0.08 + sz * 0.5;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      rg.addColorStop(0, i ? 'rgba(46,196,182,0.35)' : 'rgba(255,126,182,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
    }
    groundShadow(x + bw / 2, y + bh * 0.08 + sz, sz * 0.4, d ? 0.3 : 0.15);
    drawCharacter(ctx, i, x + bw / 2 - sz * 0.3, y + bh * 0.08 + (d ? -Math.abs(Math.sin(app.t * 4)) * 6 : 0), sz * 0.6, sz, { facing: i ? -1 : 1, t: app.t, k: sz / 1.25, alpha: d ? 1 : 0.55 });
    txt(NAMES[i], x + bw / 2, y + bh * 0.64, { color: '#3c096c', shadow: false });
    txt(d ? `joined on ${labelsFor(d).name}` : 'press jump to join', x + bw / 2, y + bh * 0.85,
      { size: textPx(H) * 0.8, color: d ? '#2b9348' : '#6c757d', weight: '600', shadow: false });
  }
  const ready = app.devices[0] && app.devices[1];
  const pads = connectedPads();
  const lines = app.pendingJoin
    ? [`Joining your partner's online game (code ${app.pendingJoin}).`, 'Press jump on your controller or keyboard.']
    : ready
    ? ['Both here! Either of you press jump to start.', `Want the other character? Press left or right to trade places (in a level: ${labelsFor(app.devices[0]).switch} or ${labelsFor(app.devices[1]).switch}).`]
    : app.devices[0]
    ? ['Waiting for player two to press jump.', `Alone? Press jump again: you'll play both, ${labelsFor(app.devices[0]).switch} switches who you are (or an AI plays one: Settings).`]
    : ['Keyboard left half: jump is W  ·  right half: jump is ↑  ·  controller or touch screen: A',
       pads ? `${pads} controller${pads > 1 ? 's' : ''} found. Press A on yours to join.` : 'Controllers: press any button first so the browser can see them.'];
  lines.forEach((l, i) => txt(l, W / 2, H * 0.8 + i * textPx(H) * 1.6, { size: textPx(H) * (i ? 0.75 : 0.9), color: '#3c096c', shadow: false, weight: i ? '500' : '700' }));
}

function drawMenu() {
  softBackground('#cdb4db', '#ffc8dd');
  const P = textPx(H);
  logo('Sweety', W / 2, H * 0.14, P * 3);
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
    panel(x - (s ? 6 : 0), y - (s ? 10 : 0), cw + (s ? 12 : 0), ch + (s ? 12 : 0), s ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.55)', 18);
    if (s) { ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 3; roundPath(x - 6, y - 10, cw + 12, ch + 12, 18); ctx.stroke(); }
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
  }), app.chapterIndex, 'Chapters', `${done} of ${CHAPTERS.length} chapters finished`);
  navHint();
}

function drawMinis() {
  softBackground('#ffd6a5', '#fdffb6');
  cards(MINIGAMES.map((c) => ({ kicker: 'Mini-game', name: c.name, tagline: c.tagline })), app.miniIndex, 'Mini-games', 'Just for fun. Loser makes the tea.');
  navHint();
}

function drawOnline() {
  softBackground('#a2d2ff', '#ffafcc');
  const P = textPx(H);
  const o = app.online;
  txt('Play online', W / 2, H * 0.12, { size: P * 2 });
  txt('Each of you on your own computer, anywhere.', W / 2, H * 0.12 + P * 1.9, { size: P * 0.85, color: '#3c096c', shadow: false, weight: '600' });
  const L = labelsFor(app.devices[0]);
  if (!o || o.status === 'error') {
    if (o && o.error) txt(o.error, W / 2, H * 0.27, { size: P * 0.9, color: '#c92a2a', shadow: false, weight: '600' });
    menuList(onlineItems().map((i) => i.label), W / 2, H * 0.38, app.onlineIndex, P);
    hint(`move: ${L.nav}  ·  ok: ${L.ok}  ·  back: ${L.back}`);
    return;
  }
  if (o.status === 'typing') {
    txt('Type your partner\'s code', W / 2, H * 0.32, { size: P * 1.2, color: '#3c096c', shadow: false });
    const shown = (o.typed || '') + (o.typed.length < 4 ? net.CODE_LETTERS[o.letter ?? 0].toLowerCase() : '');
    for (let i = 0; i < 4; i++) {
      const x = W / 2 + (i - 1.5) * P * 4;
      panel(x - P * 1.6, H * 0.42, P * 3.2, P * 4, i === (o.typed || '').length ? '#ffffff' : 'rgba(255,255,255,0.7)', 12);
      txt((shown[i] || '').toUpperCase(), x, H * 0.42 + P * 2, { size: P * 2.6, color: i < (o.typed || '').length ? '#3c096c' : '#adb5bd', shadow: false });
    }
    hint(`keyboard: type the letters, ${L.ok} to join  ·  controller: up/down picks a letter, right adds it  ·  back: ${L.back}`);
    return;
  }
  if (o.status === 'starting' || o.status === 'hosting') {
    txt('Your code', W / 2, H * 0.3, { size: P * 1.1, color: '#3c096c', shadow: false });
    txt(o.code, W / 2, H * 0.42, { size: P * 4.5, color: '#ffffff' });
    const link = `${location.origin}${location.pathname}?join=${o.code}`;
    txt('Tell your partner the code, or send them this link:', W / 2, H * 0.56, { size: P * 0.85, color: '#3c096c', shadow: false, weight: '600' });
    txt(link, W / 2, H * 0.62, { size: P * 0.85, color: '#5a189a', shadow: false, weight: '700' });
    txt(o.status === 'hosting' ? `Waiting for your partner… you play ${NAMES[o.slot]}` : 'Opening a room…', W / 2, H * 0.74, { size: P, color: '#3c096c', shadow: false });
    hint(`back: ${L.back}`);
    return;
  }
  if (o.status === 'joining') {
    txt(`Joining ${o.code}…`, W / 2, H * 0.45, { size: P * 1.6, color: '#3c096c', shadow: false });
    hint(`back: ${L.back}`);
    return;
  }
  // connected
  couple(W / 2, H * 0.42, Math.min(110, H * 0.14));
  txt(`Connected! You are ${NAMES[o.slot]}.`, W / 2, H * 0.5, { size: P * 1.3, color: '#3c096c', shadow: false });
  if (o.role === 'host') menuList(['The Yard', 'Chapters', 'Mini-games', 'Leave'], W / 2, H * 0.6, app.onlineIndex, P);
  else txt(`${NAMES[1 - o.slot]} is choosing what to play…`, W / 2, H * 0.62, { size: P, color: '#5a189a', shadow: false });
  hint(o.role === 'host' ? `move: ${L.nav}  ·  ok: ${L.ok}  ·  back: ${L.back} (leave)` : `back: ${L.back} (leave)`);
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

// the theme on screen: the chapter's, or in the Yard the district the camera is in
function viewTheme(s) {
  const zone = s.zones && s.zones[0].theme ? zoneAt(s, app.cam.x) : null;
  return zone ? zone.theme : chapterById(s.chapterId).theme;
}

function drawPlay() {
  const s = app.run, ch = chapterById(s.chapterId);
  ctx.save();
  if (app.shake > 0) ctx.translate((Math.random() - 0.5) * app.shake * 22, (Math.random() - 0.5) * app.shake * 22);
  drawWorld(ctx, s, app.cam, W, H, app.fx, viewTheme(s), app.t);
  drawSigns(s);
  drawBubbles(s);
  if (soloLocal() && s.mode === 'chapter') drawActiveMarker(s);
  ctx.restore();
  const P = textPx(H);
  // the HUD sits on soft dark fades rather than boxes
  const fade = ctx.createLinearGradient(0, 0, 0, P * 3.2);
  fade.addColorStop(0, 'rgba(20,10,35,0.35)'); fade.addColorStop(1, 'rgba(20,10,35,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, W, P * 3.2);
  txt(s.yard && app.zone ? app.zone : ch.name, 16, 24, { align: 'left', size: P });
  if (s.mode !== 'chapter') {
    txt(`${s.score[0]}`, W / 2 - 60, 40, { size: P * 2.2, color: PLAYER_COLORS[0] });
    txt('vs', W / 2, 40, { size: P });
    txt(`${s.score[1]}`, W / 2 + 60, 40, { size: P * 2.2, color: PLAYER_COLORS[1] });
    if (s.mode === 'rain') txt(`${Math.max(0, Math.ceil(s.timeLeft))}s`, W / 2, 40 + P * 1.8, { size: P });
    if (s.mode === 'potato') txt(`round ${s.round}`, W / 2, 40 + P * 1.8, { size: P * 0.8 });
  } else if (s.yard) {
    const label = `${Object.keys(app.progress.stars).length} / ${YARD_STARS}`;
    ctx.font = `700 ${P}px ${FONT}`;
    const tw = ctx.measureText(label).width, pw = tw + P * 2.6;
    panel(W - 12 - pw, 24 - P * 0.85, pw, P * 1.7, 'rgba(28,20,52,0.55)', P * 0.85);
    drawStar(ctx, W - 12 - pw + P * 0.95, 24, P * 0.5);
    txt(label, W - 12 - P * 0.7, 24, { align: 'right', size: P, color: '#fff3bf', shadow: false });
    if (app.zoneBanner && app.zoneBanner.life > 0) {
      ctx.globalAlpha = Math.min(1, app.zoneBanner.life, (3 - app.zoneBanner.life) * 3);
      txt(app.zoneBanner.name, W / 2, H * 0.3, { size: P * 2.2 });
      ctx.globalAlpha = 1;
    }
  } else if (s.heartsTotal) {
    const label = `${s.hearts} / ${s.heartsTotal}`;
    ctx.font = `700 ${P}px ${FONT}`;
    const tw = ctx.measureText(label).width, pw = tw + P * 2.6;
    panel(W - 12 - pw, 24 - P * 0.85, pw, P * 1.7, 'rgba(28,20,52,0.55)', P * 0.85);
    heart(ctx, W - 12 - pw + P * 0.95, 24, P * 0.42, '#ff4d6d', true);
    txt(label, W - 12 - P * 0.7, 24, { align: 'right', size: P, color: '#ffe3ea', shadow: false });
  }
  if (s.gentle) txt('gentle mode', W - 16, 24 + P * 1.6, { align: 'right', size: P * 0.65, color: 'rgba(255,255,255,0.75)', weight: '500' });
  // each player's buttons, in their own corner, named for their own device
  const bar = ctx.createLinearGradient(0, H - 22 - P * 1.6, 0, H);
  bar.addColorStop(0, 'rgba(15,10,30,0)'); bar.addColorStop(0.45, 'rgba(15,10,30,0.55)'); bar.addColorStop(1, 'rgba(15,10,30,0.7)');
  ctx.fillStyle = bar; ctx.fillRect(0, H - 22 - P * 1.6, W, P * 1.6 + 22);
  for (let i = 0; i < 2; i++) {
    const L = labelsFor(devOf(i));
    const power = powerOf(s, s.players[i]);
    const line = remoteName(i) ? `${NAMES[i]} (online) · ${POWER_NAME[power] || power}`
      : aiOn() && (app.watch || i !== app.active) ? `${NAMES[i]}: the AI is playing${app.watch ? ' (pause to stop watching)' : ` · ${L.switch} to take over`}`
      : soloLocal() && i !== app.active ? `${NAMES[i]}: ${L.switch} to play ${NAMES[i]}`
      : `${NAMES[i]}: move ${L.move} · jump ${L.jump} · ${POWER_NAME[power] || power}${power === 'glide' ? '' : ` ${L.ability}`}`;
    ctx.globalAlpha = soloLocal() && i !== app.active ? 0.6 : 1;
    txt(line, i ? W - 16 : 16, H - 22, { align: i ? 'right' : 'left', size: P * 0.72, color: PLAYER_COLORS[i], weight: '600' });
    ctx.globalAlpha = 1;
  }
  txt(`pause: ${labelsFor(app.devices[0]).pause}`, W / 2, H - 22, { size: P * 0.65, color: 'rgba(255,255,255,0.7)', weight: '500' });
  if (app.online && (app.online.stall > 0.8 || app.online.partnerPaused) && app.screen === 'play') {
    const who = NAMES[1 - app.online.slot];
    panel(W / 2 - 220, H * 0.42, 440, P * 2.6, 'rgba(20,16,40,0.8)');
    txt(app.online.partnerPaused ? `${who} paused the game` : `Waiting for ${who}…`, W / 2, H * 0.42 + P * 1.3, { size: P * 1.1 });
  }

  const top = s.mode === 'chapter' ? H * 0.1 : H * 0.2;
  if (app.banner > 0) {
    ctx.globalAlpha = Math.min(1, app.banner);
    const bw = Math.min(W - 32, 760), bh = P * (3.6 + ch.tips.length * 1.5);
    panel((W - bw) / 2, top, bw, bh);
    txt(ch.name, W / 2, top + P * 1.3, { size: P * 1.5 });
    txt(ch.tagline, W / 2, top + P * 2.8, { size: P * 0.9, color: '#ffd6e0', weight: '500' });
    ch.tips.forEach((tip, i) => {
      const who = tip.startsWith('Spice') ? 1 : 0;
      txt(remoteName(who) ? tip.replace('{ability}', 'their power button').replace('{jump}', 'jump') : fillTokens(tip, devOf(who)), W / 2, top + P * (4.4 + i * 1.5), { size: P * 0.78, weight: '500', color: tip.startsWith('Spice') ? PLAYER_COLORS[1] : tip.startsWith('Sugar') ? PLAYER_COLORS[0] : '#fff' });
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
// solo: a bobbing arrow over the character the device is driving right now
function drawActiveMarker(s) {
  const p = s.players[app.active];
  if (!p || p.dead) return;
  const k = app.cam.scale;
  const x = W / 2 + (p.x + p.w / 2 - app.cam.x) * k;
  const top = (p.grav < 0 ? p.y + p.h + 0.9 : p.y - 0.5);
  const y = H / 2 + (top - app.cam.y) * k + Math.sin(app.t * 6) * 4 * (p.grav < 0 ? -1 : 1);
  const r = Math.max(7, k * 0.32), dir = p.grav < 0 ? -1 : 1;
  ctx.fillStyle = PLAYER_COLORS[app.active]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - r, y - r * dir); ctx.lineTo(x + r, y - r * dir); ctx.lineTo(x, y); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function drawSigns(s) {
  const k = app.cam.scale, P = textPx(H) * 0.82;
  for (const e of s.ents) {
    if (e.type !== 'sign') continue;
    if (!s.players.some((p) => !p.dead && Math.abs(p.x + p.w / 2 - e.x - 0.5) < 2.4 && Math.abs(p.y + p.h - e.y) < 3.5)) continue;
    const ab = (i) => (remoteName(i) ? 'their power button' : labelsFor(devOf(i)).ability);
    const text = e.text.replace('{sugar}', ab(0)).replace('{spice}', ab(1)).replace('{spiceJump}', remoteName(1) ? 'jump' : labelsFor(devOf(1)).jump);
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
  menuList(pauseItems(), W / 2, H * 0.4, app.pauseIndex, P);
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
  if (app.online && app.online.role !== 'host') txt(`Waiting for ${NAMES[1 - app.online.slot]} to go on…`, W / 2, H * 0.66, { size: P });
  else txt(`${L.ok}: ${last ? 'the end' : 'next chapter'}  ·  ${L.back}: ${app.online ? 'online lobby' : 'chapters'}`, W / 2, H * 0.66, { size: P });
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
  soundFrame((app.screen === 'play' || app.screen === 'ending') && app.run ? { run: app.run, cam: app.cam, theme: viewTheme(app.run) } : null, dt);
  switch (app.screen) {
    case 'splash': updateSplash(dt); if (app.screen === 'splash') drawSplash(); break;
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
      watchZone(dt);
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
    case 'online': updateOnline(); if (app.screen === 'online') drawOnline(); break;
    default: break;
  }
  drawTouch();
  if (app.toastMsg && app.toastMsg.life > 0) {
    app.toastMsg.life -= dt;
    const P = textPx(H);
    ctx.globalAlpha = Math.min(1, app.toastMsg.life);
    const lines = wrapLines(app.toastMsg.text, Math.min(640, W - 60), P * 0.9, '600');
    panel(W / 2 - Math.min(340, W / 2 - 10), H * 0.84 - P, Math.min(680, W - 20), lines.length * P * 1.3 + P, 'rgba(20,16,40,0.85)');
    lines.forEach((l, i) => txt(l, W / 2, H * 0.84 - P * 0.1 + i * P * 1.3, { size: P * 0.9, weight: '600' }));
    ctx.globalAlpha = 1;
  }
  if (app.fade > 0) {
    ctx.fillStyle = `rgba(255, 240, 246, ${Math.min(1, app.fade)})`; ctx.fillRect(0, 0, W, H);
    app.fade = Math.max(0, app.fade - dt * 2.5);
  }
  requestAnimationFrame(frame);
}

// A controller dropping out mid-chapter pauses instead of leaving a character running.
function watchPads() {
  // only a pad someone is playing on counts
  const lost = localDevices().some((d) => d && d.startsWith('pad') && !padConnected(+d.slice(3)));
  if (lost && !app.padLost) pauseGame();
  app.padLost = lost;
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('blur', () => pauseGame());
initInput(window);
initTouch(canvas);
window.addEventListener('keydown', (e) => {
  const o = app.online;
  if (app.screen !== 'online' || !o || o.status !== 'typing') return;
  const ch = e.key.length === 1 ? e.key.toUpperCase() : '';
  if (net.CODE_LETTERS.includes(ch) && o.typed.length < 4) { o.typed += ch; flush(); }
  else if (e.key === 'Backspace') { o.typed = o.typed.slice(0, -1); flush(); }
});
// A link with ?join=CODE goes straight to joining after the first player joins.
if (S().alone === 'ai') preloadAI();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam && /^[A-Z]{4}$/i.test(joinParam)) app.pendingJoin = joinParam.toUpperCase();
// automated browsers skip the splash unless a test asks for it (?splash)
if (navigator.webdriver && !new URLSearchParams(location.search).has('splash')) app.screen = 'title';
onAnyKey(() => { unlockAudio(); applyVolumes(); });
window.addEventListener('pointerdown', () => { unlockAudio(); applyVolumes(); });
applyVolumes();
playMusic('title');
requestAnimationFrame(frame);

// For browser tests.
window.__sweety = {
  app,
  join: (a = 'kbL', b = 'kbR') => { app.devices = [a, b]; go('menu'); },
  host: () => { go('online'); hostOnline(); },
  joinCode: (c) => { go('online'); joinOnline(c); },
  net,
  start: (id) => startRun(id),
  yard: (at = null) => enterYard(at),
  begin: (id) => beginChapter(id),
};
