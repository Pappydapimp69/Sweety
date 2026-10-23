// The Kitchen's dressing: textures painted on canvases, a few shape helpers, and a
// batcher that merges every static prop into one mesh per material (vertex colours
// carry the paint), so the room is a handful of draw calls however much is in it.
// Built once from the room's boxes; never touches the sim.
import * as THREE from '../vendor/three/three.module.min.js';

const TAU = Math.PI * 2;
export const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const UP = new THREE.Vector3(0, 1, 0);

export function rand(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// ---------------------------------------------------------------- canvas textures

function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function asTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// draw f at the nine wrapped offsets, so the texture tiles
const wrap9 = (S, f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) f(dx, dy); };

export function glowTex() {
  const [c, g] = cv(64), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return asTex(c, false, false);
}
export function blobTex() {   // a soft contact shadow
  const [c, g] = cv(64), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.45, 'rgba(0,0,0,0.5)'); r.addColorStop(0.8, 'rgba(0,0,0,0.12)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return asTex(c, false, false);
}
export function puffTex() {   // a soft cloud of steam
  const [c, g] = cv(64);
  const R = rand(3);
  for (let i = 0; i < 7; i++) {
    const x = 20 + R() * 24, y = 20 + R() * 24, r = 10 + R() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return asTex(c, false, false);
}
export function vignetteTex() {
  const [c, g] = cv(256), r = g.createRadialGradient(128, 128, 60, 128, 128, 182);
  r.addColorStop(0, 'rgba(18,8,24,0)'); r.addColorStop(0.55, 'rgba(18,8,24,0.18)'); r.addColorStop(1, 'rgba(14,6,20,0.62)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return asTex(c, false, true);
}

// honey oak floorboards: 1024 px is 8 units, planks 0.8 wide, staggered ends
function planksTex() {
  const [c, g] = cv(1024), R = rand(11), W = 1024 / 10;
  const plank = (x, y, L, h, s, l, knots) => {
    g.fillStyle = `hsl(${h},${s}%,${l}%)`; g.fillRect(x, y, W, L);
    const sh = g.createLinearGradient(x, 0, x + W, 0);
    sh.addColorStop(0, 'rgba(255,230,190,0.07)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,25,5,0.10)');
    g.fillStyle = sh; g.fillRect(x, y, W, L);
    for (const k of knots) {
      g.strokeStyle = `rgba(70,35,12,${k[3]})`; g.lineWidth = k[4];
      g.beginPath(); g.moveTo(x + k[0], y); g.bezierCurveTo(x + k[0] + k[1], y + L * 0.33, x + k[0] - k[1], y + L * 0.66, x + k[0] + k[2], y + L); g.stroke();
    }
    g.fillStyle = 'rgba(45,20,8,0.55)'; g.fillRect(x, y + L - 2, W, 3);
    g.fillStyle = 'rgba(255,225,180,0.10)'; g.fillRect(x, y + L + 1, W, 1);
  };
  for (let i = 0; i < 10; i++) {
    const start = R() * 1024;
    let y = start;
    while (y < start + 1024) {
      const L = Math.min(260 + R() * 380, start + 1024 - y);
      const h = 26 + R() * 7, s = 30 + R() * 10, l = 37 + R() * 8;
      const knots = Array.from({ length: 16 }, () => [R() * W, (R() - 0.5) * 12, (R() - 0.5) * 8, 0.04 + R() * 0.09, 0.6 + R() * 1.3]);
      plank(i * W, y, L, h, s, l, knots); plank(i * W, y - 1024, L, h, s, l, knots);
      if (R() < 0.3) {   // a knot
        const kx = i * W + 20 + R() * (W - 40), ky = y + R() * L;
        for (const oy of [0, -1024]) { g.fillStyle = 'rgba(80,40,15,0.35)'; g.beginPath(); g.ellipse(kx, ky + oy, 5, 9, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(80,40,15,0.2)'; g.beginPath(); g.ellipse(kx, ky + oy, 9, 16, 0, 0, TAU); g.stroke(); }
      }
      y += L;
    }
    g.fillStyle = 'rgba(35,15,5,0.7)'; g.fillRect(i * W, 0, 3, 1024);
    g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(i * W + 3, 0, 2, 1024);
  }
  return asTex(c);
}
// a pale wood grain to multiply over a vertex colour (so one texture serves every wood)
function grainTex(amt = 1, seed = 5) {
  const [c, g] = cv(256, 512), R = rand(seed);
  g.fillStyle = '#ececec'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 12; i++) { const x = R() * 256, w = 8 + R() * 30; g.fillStyle = `rgba(40,20,0,${0.035 * amt})`; g.fillRect(x, 0, w, 512); if (x + w > 256) g.fillRect(x - 256, 0, w, 512); }
  for (let i = 0; i < 80; i++) {
    const x = R() * 256, a = (0.04 + R() * 0.1) * amt, wob = 2 + R() * 7, ph = R() * TAU, f = 1 + (R() * 3 | 0);
    g.strokeStyle = `rgba(60,30,10,${a})`; g.lineWidth = 0.5 + R() * 1.5;
    for (const off of [-256, 0, 256]) { g.beginPath(); for (let y = 0; y <= 512; y += 8) { const xx = x + off + Math.sin(y / 512 * TAU * f + ph) * wob; if (y) g.lineTo(xx, y); else g.moveTo(xx, y); } g.stroke(); }
  }
  return asTex(c);
}
function marbleTex() {
  const [c, g] = cv(512), R = rand(9);
  g.fillStyle = '#f4f0ea'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 36; i++) {
    const x = R() * 512, y = R() * 512, r = 30 + R() * 100, a = 0.04 + R() * 0.07;
    wrap9(512, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(190,185,182,${a})`); gr.addColorStop(1, 'rgba(190,185,182,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); });
  }
  for (let i = 0; i < 9; i++) {
    let x = R() * 512, y = R() * 512, ang = R() * TAU;
    const pts = [];
    for (let k = 0; k < 70; k++) { ang += (R() - 0.5) * 0.7; x += Math.cos(ang) * 8; y += Math.sin(ang) * 8; pts.push([x, y]); }
    const gold = R() < 0.3;
    for (const [w, a, blur] of [[5, 0.10, 3], [1.2, 0.35, 0]]) {
      g.filter = blur ? `blur(${blur}px)` : 'none';
      g.strokeStyle = gold ? `rgba(176,140,90,${a})` : `rgba(110,110,118,${a})`; g.lineWidth = w;
      wrap9(512, (dx, dy) => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy))); g.stroke(); });
    }
    g.filter = 'none';
  }
  return asTex(c);
}
// cream subway tiles: 256 px is 2.4 units
function tilesTex() {
  const [c, g] = cv(256), R = rand(21);
  g.fillStyle = '#bfae9f'; g.fillRect(0, 0, 256, 256);
  const th = 64, tw = 128;
  for (let r = 0; r < 4; r++) for (let k = -1; k < 2; k++) {
    const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th, l = 86 + R() * 6, h = 18 + R() * 20;
    g.fillStyle = `hsl(${h},${45 + R() * 25}%,${l}%)`;
    g.beginPath(); g.roundRect(x + 3, y + 3, tw - 6, th - 6, 6); g.fill();
    const gl = g.createLinearGradient(x, y, x, y + th);
    gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(0.4, 'rgba(255,255,255,0.0)'); gl.addColorStop(1, 'rgba(120,80,60,0.12)');
    g.fillStyle = gl; g.beginPath(); g.roundRect(x + 3, y + 3, tw - 6, th - 6, 6); g.fill();
  }
  return asTex(c);
}
// warm cream wallpaper with stripes and little rose sprigs: 256 px is 6 units
function wallpaperTex() {
  const [c, g] = cv(256), R = rand(31);
  g.fillStyle = '#f0dcc0'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i += 2) { g.fillStyle = '#e8d0b0'; g.fillRect(i * 32, 0, 32, 256); g.fillStyle = 'rgba(190,140,110,0.35)'; g.fillRect(i * 32, 0, 1.5, 256); g.fillRect(i * 32 + 30.5, 0, 1.5, 256); }
  for (let i = 1; i < 8; i += 2) for (let j = 0; j < 4; j++) {
    const x = i * 32 + 16, y = j * 64 + (i % 4 === 1 ? 16 : 48);
    g.strokeStyle = 'rgba(110,140,100,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x - 4, y + 10, x + 1, y + 16); g.stroke();
    g.fillStyle = 'rgba(120,150,105,0.6)'; g.beginPath(); g.ellipse(x - 4, y + 10, 3, 1.6, 0.6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(205,120,125,0.8)';
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(240,200,120,0.95)'; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(120,80,50,${R() * 0.04})`; g.fillRect(R() * 256, R() * 256, 2, 2); }
  return asTex(c);
}
// a braided round rug
function rugTex() {
  const [c, g] = cv(512);
  const cols = ['#a63d32', '#d99a3e', '#efe0c0', '#5f7f63', '#a63d32', '#c56b4a', '#efe0c0', '#d99a3e', '#4c6a8a', '#efe0c0', '#a63d32', '#d99a3e', '#5f7f63', '#efe0c0'];
  let r = 254, k = 0;
  while (r > 6) {
    const w = 17;
      g.fillStyle = cols[k % cols.length]; g.beginPath(); g.arc(256, 256, r, 0, TAU); g.arc(256, 256, Math.max(0, r - w), 0, TAU, true); g.fill();
    const n = Math.max(8, Math.round(r * TAU / 10));
    for (let i = 0; i < n; i++) {   // the braid
      const a = i / n * TAU, sgn = i % 2 ? 1 : -1;
      g.strokeStyle = 'rgba(40,15,10,0.28)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(256 + Math.cos(a) * (r - 2), 256 + Math.sin(a) * (r - 2)); g.lineTo(256 + Math.cos(a + sgn * 0.6 * 10 / r) * (r - w + 2), 256 + Math.sin(a + sgn * 0.6 * 10 / r) * (r - w + 2)); g.stroke();
    }
    if (r - w > 1) { g.strokeStyle = 'rgba(40,15,10,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(256, 256, r - w, 0, TAU); g.stroke(); }
    r -= w; k++;
  }
  return asTex(c, false);
}
function runnerTex() {   // a woven kitchen runner, warm stripes
  const [c, g] = cv(64, 256);
  const cols = ['#7a2f2a', '#c9873e', '#efe0c0', '#3f5f6e', '#efe0c0', '#c9873e'];
  for (let y = 0; y < 256; y += 16) { g.fillStyle = cols[(y / 16) % cols.length]; g.fillRect(0, y, 64, 16); }
  g.fillStyle = '#7a2f2a'; g.fillRect(0, 0, 6, 256); g.fillRect(58, 0, 6, 256);
  for (let y = 0; y < 256; y += 3) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y, 64, 1); }
  for (let x = 0; x < 64; x += 3) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 1, 256); }
  return asTex(c);
}
function ginghamTex(col = '196,44,40') {
  const [c, g] = cv(64);
  g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = `rgba(${col},0.5)`; g.fillRect(0, 0, 32, 64); g.fillRect(0, 0, 64, 32);
  g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 64; i += 2) g.fillRect(0, i, 64, 1);
  return asTex(c);
}
// the night outside: sky, moon, stars, hills and a neighbour's lit window
function skyTex() {
  const [c, g] = cv(1024, 640), R = rand(41);
  const sk = g.createLinearGradient(0, 0, 0, 640);
  sk.addColorStop(0, '#0a0f2e'); sk.addColorStop(0.55, '#1d2560'); sk.addColorStop(0.85, '#3b3a7a'); sk.addColorStop(1, '#5a4a86');
  g.fillStyle = sk; g.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 260; i++) { const a = R(); g.fillStyle = `rgba(255,255,240,${0.3 + a * 0.7})`; g.beginPath(); g.arc(R() * 1024, R() * 480, a * 1.6 + 0.3, 0, TAU); g.fill(); }
  const mx = 700, my = 150, mg = g.createRadialGradient(mx, my, 20, mx, my, 200);
  mg.addColorStop(0, 'rgba(220,230,255,0.55)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = mg; g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#fff7dc'; g.beginPath(); g.arc(mx, my, 52, 0, TAU); g.fill();
  g.fillStyle = 'rgba(200,190,160,0.45)'; for (const [x, y, r] of [[-14, -10, 12], [16, 14, 9], [6, -24, 6], [-20, 20, 7]]) { g.beginPath(); g.arc(mx + x, my + y, r, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(150,160,210,0.18)';
  for (const [x, y, w] of [[180, 220, 260], [520, 300, 300], [80, 120, 160]]) { g.beginPath(); g.ellipse(x, y, w, 18, 0, 0, TAU); g.fill(); }
  g.fillStyle = '#1a1d42'; g.beginPath(); g.moveTo(0, 560);
  for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 500 + Math.sin(x / 140) * 30 + Math.sin(x / 47) * 8);
  g.lineTo(1024, 640); g.lineTo(0, 640); g.fill();
  g.fillStyle = '#0e1030';
  for (let i = 0; i < 18; i++) { const x = R() * 1024, h = 50 + R() * 90, w = 18 + R() * 26; g.beginPath(); g.ellipse(x, 560 - h * 0.5, w, h * 0.55, 0, 0, TAU); g.fill(); g.fillRect(x - 3, 560 - h * 0.2, 6, h * 0.4); }
  g.fillRect(160, 470, 150, 170); g.beginPath(); g.moveTo(145, 472); g.lineTo(235, 400); g.lineTo(325, 472); g.fill();   // the neighbours'
  g.fillRect(270, 410, 18, 40);
  g.fillStyle = '#ffd27a'; g.fillRect(185, 500, 30, 30); g.fillStyle = 'rgba(255,210,122,0.25)'; g.beginPath(); g.arc(200, 515, 34, 0, TAU); g.fill();
  g.fillStyle = '#0b0c26'; g.fillRect(0, 600, 1024, 40);
  for (let x = 0; x < 1024; x += 22) g.fillRect(x, 572, 8, 40);   // a garden fence
  g.fillRect(0, 582, 1024, 5);
  return asTex(c, false);
}
function windowPatchTex() {   // moonlight through the panes, as it falls on the floor
  const [c, g] = cv(256);
  g.filter = 'blur(6px)'; g.fillStyle = '#fff';
  for (const [x, y] of [[20, 20], [134, 20], [20, 134], [134, 134]]) g.fillRect(x, y, 102, 102);
  g.filter = 'none';
  return asTex(c, false, false);
}
function cerealTex(bg, band, title, dot) {
  const [c, g] = cv(256, 320);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 320);
  g.fillStyle = band; g.fillRect(0, 0, 256, 70); g.fillRect(0, 290, 256, 30);
  g.fillStyle = '#fff'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.fillText(title[0], 128, 46);
  g.fillStyle = band; g.font = 'bold 44px sans-serif'; g.fillText(title[1], 128, 118);
  g.fillStyle = '#f8f9fa'; g.beginPath(); g.ellipse(128, 230, 86, 34, 0, 0, TAU); g.fill();
  g.fillStyle = '#dee2e6'; g.beginPath(); g.ellipse(128, 222, 78, 24, 0, 0, TAU); g.fill();
  for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 10 + (i % 5) * 12; g.strokeStyle = dot; g.lineWidth = 7; g.beginPath(); g.arc(128 + Math.cos(a) * r * 1.4, 205 + Math.sin(a) * r * 0.35, 9, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(210, 150, 26, 0, TAU); g.fill();
  g.fillStyle = band; g.font = 'bold 15px sans-serif'; g.fillText('NEW!', 210, 156);
  return asTex(c, false);
}
function spiceRowTex() {   // jars of spices along the front of each shelf step
  const [c, g] = cv(512, 64), R = rand(51);
  g.fillStyle = '#5a3a26'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 512, 6);
  const fills = ['#c0392b', '#e1a32b', '#6b8e23', '#3b2a20', '#a0522d', '#d35400', '#7d5a50', '#556b2f', '#f1c40f', '#8e3b46'];
  let x = 6;
  while (x < 500) {
    const w = 30 + R() * 14, h = 34 + R() * 14, y = 60 - h;
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.roundRect(x, y, w, h, 5); g.fill();
    g.fillStyle = fills[(R() * fills.length) | 0]; g.beginPath(); g.roundRect(x + 2, y + h * 0.3, w - 4, h * 0.7 - 2, 4); g.fill();
    g.fillStyle = '#f4ead5'; g.fillRect(x + 3, y + h * 0.42, w - 6, h * 0.3);
    g.fillStyle = 'rgba(60,40,30,0.7)'; g.fillRect(x + 7, y + h * 0.52, w - 14, 2); g.fillRect(x + 9, y + h * 0.6, w - 18, 1.5);
    g.fillStyle = R() < 0.5 ? '#2b2b2b' : '#b8b8b8'; g.beginPath(); g.roundRect(x + 2, y - 6, w - 4, 8, 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + 4, y + 4, 3, h - 10);
    x += w + 4 + R() * 6;
  }
  return asTex(c);
}
function clockTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#fbf3e4'; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
  g.strokeStyle = '#2d2a32'; g.fillStyle = '#2d2a32';
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r0 = i % 5 ? 108 : 98; g.lineWidth = i % 5 ? 2 : 5; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke(); }
  g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU; g.fillText(String(i), 128 + Math.sin(a) * 78, 130 - Math.cos(a) * 78); }
  return asTex(c, false);
}
function drawingTex() {   // a child's crayon drawing of Sugar and Spice, for the fridge
  const [c, g] = cv(256, 200);
  g.fillStyle = '#fdfbf4'; g.fillRect(0, 0, 256, 200);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const scrib = (col, w, pts) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(225, 30, 18, 0, TAU); g.fill();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; scrib('#fab005', 3, [[225 + Math.cos(a) * 24, 30 + Math.sin(a) * 24], [225 + Math.cos(a) * 34, 30 + Math.sin(a) * 34]]); }
  g.fillStyle = '#ff8fb1'; g.beginPath(); g.ellipse(75, 120, 32, 44, 0, 0, TAU); g.fill();
  g.fillStyle = '#e64980'; g.beginPath(); g.moveTo(75, 76); g.lineTo(55, 64); g.lineTo(57, 86); g.fill(); g.beginPath(); g.moveTo(75, 76); g.lineTo(95, 64); g.lineTo(93, 86); g.fill();
  g.fillStyle = '#38d9a9'; g.beginPath(); g.ellipse(165, 122, 32, 44, 0, 0, TAU); g.fill();
  g.fillStyle = '#1e3a5f'; g.fillRect(140, 70, 50, 8); g.fillRect(150, 44, 30, 28);
  for (const [x, y] of [[64, 112], [86, 112], [154, 114], [176, 114]]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(x + 1, y + 1, 3.5, 0, TAU); g.fill(); }
  scrib('#c2255c', 3, [[66, 132], [75, 138], [84, 132]]); scrib('#087f5b', 3, [[156, 134], [165, 140], [174, 134]]);
  g.fillStyle = '#fa5252'; g.beginPath(); g.moveTo(120, 100); g.bezierCurveTo(108, 84, 96, 104, 120, 118); g.bezierCurveTo(144, 104, 132, 84, 120, 100); g.fill();
  scrib('#74c0fc', 4, [[6, 190], [60, 186], [120, 191], [180, 186], [250, 190]]);
  g.fillStyle = '#7048e8'; g.font = 'bold 18px sans-serif'; g.fillText('SUGAR + SPICE', 60, 190);
  return asTex(c, false);
}
function labelTex(text, bg, fg) {
  const [c, g] = cv(256, 64);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(6, 6, 244, 52);
  g.fillStyle = fg; g.font = `bold ${Math.min(38, Math.floor(440 / text.length))}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  return asTex(c, false);
}

// ---------------------------------------------------------------- shapes

// a box with rounded edges (r in units), UVs as a box's
const rbCache = new Map();
export function roundedBox(w, h, d, r, m = 1) {
  const key = `${w}|${h}|${d}|${r}|${m}`;
  if (rbCache.has(key)) return rbCache.get(key);
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const n = 2 * m + 1, g = new THREE.BoxGeometry(w, h, d, n, n, n);
  const P = g.attributes.position, N = g.attributes.normal, half = [w / 2, h / 2, d / 2];
  const remap = (u, hh) => {   // squeeze the grid toward the edges
    const t = (u + hh) / (2 * hh) * n, i = Math.round(t);
    if (Math.abs(t - i) > 1e-3) return u;
    if (i <= m) return -hh + r * i / m;
    if (i >= n - m) return hh - r * (n - i) / m;
    return u;
  };
  const p = [0, 0, 0], inner = [0, 0, 0];
  for (let k = 0; k < P.count; k++) {
    p[0] = remap(P.getX(k), half[0]); p[1] = remap(P.getY(k), half[1]); p[2] = remap(P.getZ(k), half[2]);
    let dl = 0;
    for (let a = 0; a < 3; a++) { inner[a] = Math.max(-half[a] + r, Math.min(half[a] - r, p[a])); dl += (p[a] - inner[a]) ** 2; }
    dl = Math.sqrt(dl);
    if (dl > 1e-6) {
      const nx = (p[0] - inner[0]) / dl, ny = (p[1] - inner[1]) / dl, nz = (p[2] - inner[2]) / dl;
      P.setXYZ(k, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r); N.setXYZ(k, nx, ny, nz);
    } else P.setXYZ(k, p[0], p[1], p[2]);
  }
  rbCache.set(key, g);
  return g;
}
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 10, 7),
  sphLo: new THREE.SphereGeometry(1, 6, 4),
  hemi: new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  boxy: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 12),
  tri: new THREE.CylinderGeometry(1, 1, 1, 3),
  disc: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  quad: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  wall: new THREE.PlaneGeometry(1, 1),
  crumb: new THREE.DodecahedronGeometry(1),
  rb: roundedBox(1, 1, 1, 0.18),
  rbSoft: roundedBox(1, 1, 1, 0.35),
};
const torusCache = new Map();
export function torus(R, r, arc = TAU, rs = 8, ts = 18) {
  const k = `${R}|${r}|${arc}|${rs}|${ts}`;
  if (!torusCache.has(k)) torusCache.set(k, new THREE.TorusGeometry(R, r, rs, ts, arc));
  return torusCache.get(k);
}
// profiles (radius, height) for the lathe-turned things
const PROF = {
  mug: lathe([[0, 0], [0.24, 0], [0.27, 0.03], [0.27, 0.58], [0.25, 0.6], [0.23, 0.57], [0.23, 0.06], [0, 0.06]]),
  cup: lathe([[0, 0], [0.12, 0], [0.2, 0.08], [0.23, 0.26], [0.21, 0.27], [0.19, 0.1], [0, 0.05]]),
  plate: lathe([[0, 0], [0.45, 0], [0.5, 0.03], [0.8, 0.09], [0.82, 0.11], [0.78, 0.11], [0.5, 0.06], [0, 0.06]], 24),
  saucer: lathe([[0, 0], [0.22, 0], [0.42, 0.06], [0.43, 0.08], [0.4, 0.08], [0.22, 0.04], [0, 0.04]], 18),
  bowl: lathe([[0, 0], [0.35, 0], [0.38, 0.04], [0.72, 0.4], [0.78, 0.52], [0.73, 0.53], [0.68, 0.44], [0.33, 0.1], [0, 0.1]], 22),
  pot: lathe([[0, 0], [0.3, 0], [0.4, 0.55], [0.46, 0.57], [0.46, 0.7], [0.4, 0.7], [0.38, 0.62], [0, 0.62]], 16),
  bottle: lathe([[0, 0], [0.22, 0], [0.24, 0.03], [0.24, 0.95], [0.2, 1.15], [0.09, 1.3], [0.08, 1.6], [0, 1.6]], 14),
  wine: lathe([[0, 0], [0.2, 0], [0.21, 0.02], [0.21, 1.0], [0.17, 1.22], [0.07, 1.36], [0.07, 1.75], [0, 1.75]], 14),
  shaker: lathe([[0, 0], [0.13, 0], [0.15, 0.04], [0.12, 0.25], [0.13, 0.38], [0, 0.38]], 12),
  shakerTop: lathe([[0, 0], [0.135, 0], [0.13, 0.06], [0.07, 0.13], [0, 0.14]], 12),
  vase: lathe([[0, 0], [0.18, 0], [0.26, 0.2], [0.24, 0.45], [0.12, 0.62], [0.14, 0.72], [0, 0.72]], 14),
  crock: lathe([[0, 0], [0.3, 0], [0.33, 0.05], [0.34, 0.85], [0.37, 0.9], [0.3, 0.9], [0.3, 0.1], [0, 0.1]], 16),
  pan: lathe([[0, 0], [0.55, 0], [0.62, 0.05], [0.66, 0.24], [0.62, 0.24], [0.58, 0.08], [0, 0.06]], 20),
  spoonBowl: lathe([[0, 0], [0.08, 0.01], [0.1, 0.035], [0, 0.03]], 10),
  lampShade: lathe([[0.15, 1.3], [0.35, 1.25], [0.7, 1.0], [1.2, 0.5], [1.55, 0.05], [1.6, 0], [1.5, 0.02], [1.1, 0.48], [0.6, 0.95], [0.12, 1.2]], 28),
  catBowl: lathe([[0, 0], [0.5, 0], [0.62, 0.05], [0.66, 0.28], [0.6, 0.3], [0.5, 0.12], [0, 0.1]], 18),
  leg: lathe([[0.2, 0], [0.22, 0.05], [0.16, 0.25], [0.13, 0.6], [0.2, 0.9], [0.13, 1.15], [0.13, 1.8], [0.2, 1.9], [0.22, 2.0], [0, 2.0]], 10),
};

// ---------------------------------------------------------------- the batcher

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
export class Batch {
  constructor(cell = 0) { this.keys = new Map(); this.cell = cell; }
  // with a cell size, pieces are also split by where they stand (so a view can skip what it can't see)
  add(key, geo, m, color, ao, alpha = 1) {
    if (this.cell) key = `${key}@${Math.floor(m.elements[12] / this.cell)},${Math.floor(m.elements[14] / this.cell)}`;
    let L = this.keys.get(key); if (!L) this.keys.set(key, L = []);
    L.push([geo, m, color, ao, alpha]);
  }
  // one geometry from every piece under a key; `tri` > 0 projects UVs from world space (units per repeat = 1/tri)
  // the keys that start `key` (cells of it)
  cells(key) { return [...this.keys.keys()].filter((k) => k === key || k.startsWith(key + '@')); }
  geometry(key, tri = 0, alpha = false) {
    const L = this.keys.get(key); if (!L) return null;
    let nv = 0, ni = 0;
    for (const [g] of L) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const cs = alpha ? 4 : 3;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * cs);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const [g, m, color, ao, a] of L) {
      _nm.getNormalMatrix(m);
      const own = color == null ? g.attributes.color : null;   // no colour given: keep the geometry's own
      if (!own) _c.set(color);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i).applyMatrix4(m);
        _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        const o = vo + i;
        pos[o * 3] = _p.x; pos[o * 3 + 1] = _p.y; pos[o * 3 + 2] = _p.z;
        nor[o * 3] = _n.x; nor[o * 3 + 1] = _n.y; nor[o * 3 + 2] = _n.z;
        if (tri) {
          const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
          let u, v;
          if (ay >= ax && ay >= az) { u = _p.x; v = _p.z; } else if (ax >= az) { u = _p.z; v = _p.y; } else { u = _p.x; v = _p.y; }
          uv[o * 2] = u * tri; uv[o * 2 + 1] = v * tri;
        } else if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
        if (own) _c.setRGB(own.getX(i), own.getY(i), own.getZ(i));
        let k = 1;
        if (ao != null) { const h = _p.y - ao; if (h < 0.45) k = 0.5 + 0.5 * Math.max(0, h) / 0.45; }
        col[o * cs] = _c.r * k; col[o * cs + 1] = _c.g * k; col[o * cs + 2] = _c.b * k;
        if (alpha) col[o * cs + 3] = a;
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < P.count; i++) idx[io++] = vo + i;
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, cs));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

// a local transform in three's axes (y up, z toward the prop's front)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
export function L(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
}
// a cylinder from a to b (local three coords), radius r
export function between(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
}
// where a prop stands in the room: sim (x, y, z), turned `rot` radians (counter-clockwise from above);
// its front (+z local) faces sim south when rot is 0
export function placer(b, x, y, z, rot = 0, s = 1) {
  const base = new THREE.Matrix4().compose(v3(x, y, z), _q.setFromAxisAngle(UP, rot), _s.set(s, s, s));
  const ground = z;
  const put = (key, geo, color, local = L(), ao = true) => b.add(key, geo, new THREE.Matrix4().multiplyMatrices(base, local), color, ao ? ground : null);
  put.base = base;
  return put;
}

// ---------------------------------------------------------------- props (each a function of a placer)

const PAL = {
  brass: 0xd4a548, steel: 0xc9ced6, dark: 0x2b2b33, cream: 0xf6efe2, white: 0xfbfaf7,
  terracotta: 0xc8673e, leaf: [0x4f8a3c, 0x5fa04a, 0x3f7a35, 0x74b45a],
};
function mug(P, col, rot = 0, y = 0, x = 0, z = 0) {
  P('gloss', PROF.mug, col, L(x, y, z, 1, 1, 1, 0, rot));
  P('gloss', torus(0.14, 0.04, TAU, 6, 14), col, L(x + Math.cos(rot) * 0.3, y + 0.32, z - Math.sin(rot) * 0.3, 1, 1, 1, 0, rot));
  P('matte', G.disc, 0x4a2c1a, L(x, y + 0.48, z, 0.22, 1, 0.22), false);
}
function plateStack(P, n, col, rim = 0x6f9bd1) {
  for (let i = 0; i < n; i++) { P('gloss', PROF.plate, i % 3 === 2 ? rim : col, L((i % 2) * 0.03, i * 0.1, 0)); }
}
function fruitBowl(P) {
  P('gloss', PROF.bowl, 0x5b8fb9, L(0, 0, 0, 1.15, 1.1, 1.15));
  const fr = [[0.3, 0.42, 0.1, 0.25, 0xd63b3b], [-0.28, 0.45, 0.15, 0.24, 0x8bc34a], [0.0, 0.44, -0.3, 0.27, 0xf08c1e], [0.05, 0.62, 0.05, 0.25, 0xc92a2a], [-0.2, 0.45, -0.32, 0.22, 0xf08c1e], [0.36, 0.48, -0.25, 0.21, 0xe8b23a]];
  for (const [x, y, z, r, c] of fr) {
    P('gloss', G.sph, c, L(x, y, z, r, r * 0.92, r));
    if (c !== 0xf08c1e) P('matte', G.cylLo, 0x5d3a1a, L(x, y + r * 0.95, z, 0.018, 0.1, 0.018, 0.2));
    else P('matte', G.sphLo, 0x6a8f2a, L(x, y + r * 0.9, z, 0.04, 0.02, 0.04));
  }
  P('satin', torus(0.42, 0.075, 2.2, 6, 12), 0xf5d142, L(-0.05, 0.75, 0.2, 1, 1, 1, Math.PI / 2 - 0.2, 0.4, 0));
  P('satin', torus(0.42, 0.075, 2.2, 6, 12), 0xeec63c, L(0.05, 0.8, 0.25, 1, 1, 1, Math.PI / 2 - 0.3, 0.7, 0));
  for (let i = 0; i < 9; i++) P('gloss', G.sphLo, 0x6a2c70, L(-0.45 + (i % 3) * 0.12, 0.5 + (i / 3 | 0) * 0.1 - (i % 3 === 1 ? 0.04 : 0), 0.32 + ((i * 7) % 3) * 0.05, 0.085));
}
function jar(P, x, z, h, r, fill, lid, label = 0xf4ead5) {
  P('glass', G.cyl, 0xe8f4f8, L(x, h * 0.5, z, r, h, r));
  P('satin', G.cyl, fill, L(x, h * 0.36, z, r * 0.9, h * 0.7, r * 0.9));
  P('satin', G.cyl, label, L(x, h * 0.45, z, r * 1.02, h * 0.3, r * 1.02));
  P(lid === PAL.brass || lid === PAL.steel ? 'metal' : 'satin', G.cyl, lid, L(x, h + 0.06, z, r * 1.06, 0.14, r * 1.06));
  P(lid === PAL.brass || lid === PAL.steel ? 'metal' : 'satin', G.sphLo, lid, L(x, h + 0.15, z, r * 0.3, r * 0.2, r * 0.3));
}
function bottle(P, x, z, s, col, cap, label = 0xf3e5c0, wine = false) {
  P('gloss', wine ? PROF.wine : PROF.bottle, col, L(x, 0, z, s, s, s));
  P('satin', G.cyl, label, L(x, 0.5 * s, z, 0.245 * s, 0.4 * s, 0.245 * s));
  P(wine ? 'satin' : 'metal', G.cyl, cap, L(x, (wine ? 1.72 : 1.58) * s, z, 0.09 * s, 0.14 * s, 0.09 * s));
}
function plant(P, s = 1, pot = PAL.terracotta, seed = 1) {
  const R = rand(seed);
  P('satin', PROF.pot, pot, L(0, 0, 0, s, s, s));
  P('matte', G.disc, 0x3b2a1e, L(0, 0.64 * s, 0, 0.38 * s, 1, 0.38 * s), false);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + R() * 0.4, tilt = 0.35 + R() * 0.55, len = (0.5 + R() * 0.35) * s;
    const dx = Math.sin(a) * Math.sin(tilt), dz = Math.cos(a) * Math.sin(tilt), dy = Math.cos(tilt);
    P('satin', G.sph, PAL.leaf[i % 4], L(dx * len * 0.55, 0.62 * s + dy * len * 0.6, dz * len * 0.55, 0.13 * s, len * 0.55, 0.05 * s, tilt * Math.cos(a), a, 0));
  }
}
function herbPot(P, col, seed) {
  const R = rand(seed);
  P('satin', G.cyl, col, L(0, 0.22, 0, 0.24, 0.44, 0.24));
  P('satin', G.cyl, col, L(0, 0.42, 0, 0.27, 0.08, 0.27));
  for (let i = 0; i < 7; i++) { const a = R() * TAU, r = R() * 0.14; P('satin', G.sphLo, PAL.leaf[(i + seed) % 4], L(Math.cos(a) * r, 0.55 + R() * 0.22, Math.sin(a) * r, 0.09, 0.14, 0.09)); }
}
function cookieStack(P, n, x = 0, z = 0) {
  for (let i = 0; i < n; i++) {
    const ox = x + Math.sin(i * 2.1) * 0.04, oz = z + Math.cos(i * 1.7) * 0.04;
    P('matte', G.cyl, 0xc98a4b, L(ox, 0.04 + i * 0.085, oz, 0.22, 0.075, 0.22, 0, i));
    if (i === n - 1) for (let k = 0; k < 5; k++) { const a = k * 1.3; P('matte', G.sphLo, 0x3b2316, L(ox + Math.cos(a) * 0.12, 0.08 + i * 0.085, oz + Math.sin(a) * 0.12, 0.035, 0.02, 0.035)); }
  }
}
function shakers(P) {
  P('gloss', PROF.shaker, PAL.white, L(-0.17, 0, 0));
  P('metal', PROF.shakerTop, PAL.steel, L(-0.17, 0.37, 0));
  P('gloss', PROF.shaker, 0x3a3a44, L(0.17, 0, 0));
  P('metal', PROF.shakerTop, PAL.steel, L(0.17, 0.37, 0));
}
function sugarBowl(P) {
  P('gloss', PROF.bowl, PAL.white, L(0, 0, 0, 0.45, 0.45, 0.45));
  for (const [x, y, z, r] of [[0, 0.2, 0, 0.3], [0.1, 0.24, 0.08, 1], [-0.08, 0.22, 0.08, 2], [0.03, 0.3, -0.06, 0.6]]) P('satin', G.rb, 0xffffff, L(x, y, z, 0.13, 0.13, 0.13, 0.2, r));
  for (const [x, z, r] of [[0.55, 0.1, 0.3], [0.7, -0.25, 1.1], [-0.6, 0.35, 0.7]]) P('satin', G.rb, 0xffffff, L(x, 0.065, z, 0.13, 0.13, 0.13, 0, r));
}
function cuttingBoard(P) {
  P('wood', roundedBox(2.2, 0.12, 1.3, 0.05), 0xd9a86a, L(0, 0.06, 0));
  P('wood', roundedBox(0.5, 0.12, 0.4, 0.05), 0xd9a86a, L(1.3, 0.06, 0));
  P('matte', G.cylLo, 0x6b4a2e, L(1.38, 0.13, 0, 0.09, 0.02, 0.09));
  P('metal', G.box, 0xdde2e8, L(-0.1, 0.15, 0.35, 1.0, 0.02, 0.2, 0, 0.12));
  P('wood', G.rb, 0x3d2a1e, L(0.62, 0.17, 0.42, 0.5, 0.08, 0.12, 0, 0.12));
  P('satin', G.cone, 0xf08c1e, L(-0.5, 0.2, -0.3, 0.13, 0.9, 0.13, 0, 0.3, Math.PI / 2));
  P('satin', G.cylLo, 0x6aa84f, L(-0.02, 0.2, -0.38, 0.03, 0.25, 0.03, 0, 0.3, Math.PI / 2));
  for (let i = 0; i < 4; i++) P('satin', G.cyl, 0xf59f3a, L(-0.9 + i * 0.16, 0.14, 0.15 + (i % 2) * 0.1, 0.11, 0.03, 0.11));
}
function crock(P) {
  P('gloss', PROF.crock, 0xe9dcc9, L());
  for (const [a, h, c] of [[0.2, 1.7, 0xc8945a], [-0.25, 1.8, 0xb9824a], [0.6, 1.6, 0x9a6a3c]]) {
    P('wood', G.cylLo, c, L(Math.sin(a) * 0.1, 0.85 + h * 0.3, Math.cos(a) * 0.1, 0.04, h * 0.6, 0.04, a * 0.3, 0, a * 0.25));
    P('wood', G.sph, c, L(Math.sin(a) * 0.1 + a * 0.25 * -0.5, 0.85 + h * 0.62, Math.cos(a) * 0.1, 0.11, 0.16, 0.05, a * 0.3, 0, a * 0.25));
  }
  for (let i = 0; i < 4; i++) P('metal', torus(0.14, 0.012, TAU, 4, 14), PAL.steel, L(0.05, 1.75, 0.0, 1, 1.6, 1, 0, i * Math.PI / 4));
  P('metal', G.cylLo, PAL.steel, L(0.05, 1.25, 0, 0.035, 0.7, 0.035));
}
function flourBag(P) {
  P('matte', roundedBox(1.1, 1.5, 0.75, 0.2), 0xe9d8b4, L(0, 0.75, 0));
  P('matte', roundedBox(0.95, 0.4, 0.5, 0.12), 0xe2cfa8, L(0, 1.55, 0, 1, 1, 1, 0.25));
  P('matte', G.box, 0xc0392b, L(0, 0.95, 0.38, 0.9, 0.22, 0.02));
  P('matte', G.box, 0x2f6fa8, L(0, 0.6, 0.38, 0.5, 0.36, 0.02));
  P('matte', G.disc, 0xffffff, L(0.75, 0.015, 0.2, 0.35, 1, 0.25), false);
  P('matte', G.disc, 0xffffff, L(0.95, 0.015, 0.45, 0.12, 1, 0.1), false);
}
function teapot(P, col) {
  P('gloss', G.sph, col, L(0, 0.48, 0, 0.55, 0.45, 0.55));
  P('gloss', G.cyl, col, L(0, 0.08, 0, 0.36, 0.16, 0.36));
  P('gloss', G.hemi, col, L(0, 0.84, 0, 0.3, 0.18, 0.3));
  P('gloss', G.sph, PAL.white, L(0, 1.05, 0, 0.08, 0.08, 0.08));
  P('gloss', G.cyl, col, L(0.62, 0.62, 0, 0.07, 0.55, 0.09, 0, 0, -0.8));
  P('gloss', torus(0.24, 0.05, Math.PI * 1.3, 6, 12), col, L(-0.55, 0.5, 0, 1, 1, 1, 0, 0, Math.PI * 0.35));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; P('gloss', G.sphLo, PAL.white, L(Math.cos(a) * 0.5, 0.5 + (i % 2) * 0.12, Math.sin(a) * 0.5, 0.07, 0.07, 0.03, 0, -a + Math.PI / 2)); }
}
function cupSaucer(P, col) {
  P('gloss', PROF.saucer, PAL.white, L());
  P('gloss', PROF.cup, col, L(0, 0.04, 0));
  P('gloss', torus(0.08, 0.025, TAU, 5, 10), col, L(0.24, 0.2, 0));
  P('matte', G.disc, 0x6b3f22, L(0, 0.27, 0, 0.18, 1, 0.18), false);
}
function napkin(P, col) { P('fabric', G.tri, col, L(0, 0.04, 0, 0.55, 0.08, 0.55)); }
function spoon(P) {
  P('metal', PROF.spoonBowl, PAL.steel, L(0, 0.01, 0, 1.6, 1.6, 2.4));
  P('metal', G.rb, PAL.steel, L(0, 0.03, 0.55, 0.07, 0.03, 0.75));
}
function sock(P) {
  const cols = [0xe03131, 0xf8f0e3];
  for (let i = 0; i < 6; i++) P('fabric', G.cyl, cols[i % 2], L(0, 0.17, -0.5 + i * 0.16, 0.18, 0.16, 0.16, Math.PI / 2));
  P('fabric', G.sph, 0xe03131, L(0, 0.17, -0.6, 0.18, 0.17, 0.18));
  P('fabric', G.cyl, 0xe03131, L(0.22, 0.16, 0.42, 0.17, 0.5, 0.15, Math.PI / 2, 0.9));
  P('fabric', G.sph, 0xf8f0e3, L(0.42, 0.16, 0.55, 0.19, 0.16, 0.22, 0, 0.9));
}
function catBowls(P) {
  P('matte', G.rb, 0x8fb3a0, L(0.2, 0.03, 0, 2.6, 0.06, 1.3));
  P('gloss', PROF.catBowl, 0xf06595, L(-0.45, 0.06, 0));
  for (let i = 0; i < 14; i++) { const a = i * 2.3, r = (i % 4) * 0.12; P('matte', G.sphLo, 0x8a5a33, L(-0.45 + Math.cos(a) * r, 0.2 + (i % 3) * 0.03, Math.sin(a) * r, 0.07, 0.05, 0.07)); }
  P('gloss', PROF.catBowl, 0x4dabf7, L(0.85, 0.06, 0));
  P('gloss', G.disc, 0xa5d8ff, L(0.85, 0.26, 0, 0.6, 1, 0.6), false);
  P('matte', G.crumb, 0x8a5a33, L(0.2, 0.08, 0.5, 0.06, 0.04, 0.06));
}
function books(P, n, seed) {
  const R = rand(seed), cols = [0x9c3d3d, 0x2f5d8a, 0xd9a03f, 0x4f7a4f, 0x7b4f8a, 0xc8673e];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.18 + R() * 0.14, h = 1.1 + R() * 0.5, d = 0.8 + R() * 0.2;
    P('satin', G.rb, cols[(R() * cols.length) | 0], L(x, h / 2, 0, t, h, d));
    P('satin', G.box, 0xf1e3c6, L(x, h * 0.75, d / 2 + 0.001, t * 0.8, 0.08, 0.01), false);
    x += t + 0.02;
  }
}
function crumbs(b, x, y, z, n, spread, seed) {
  const R = rand(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, r = Math.sqrt(R()) * spread, s = 0.04 + R() * 0.06;
    b.add('matte', G.crumb, new THREE.Matrix4().compose(v3(x + Math.cos(a) * r, y + Math.sin(a) * r, z + s * 0.4), _q.setFromEuler(_e.set(R() * 3, R() * 3, R() * 3)), _s.set(s, s * 0.6, s)), [0xd9a35b, 0xc28640, 0xe8c27a][i % 3], null);
  }
}

// ---------------------------------------------------------------- the room

export function buildKitchen(s, group, env) {
  const T = {
    planks: planksTex(), grain: grainTex(1, 5), paintGrain: grainTex(0.35, 6), marble: marbleTex(), tiles: tilesTex(), paper: wallpaperTex(),
    rug: rugTex(), gingham: ginghamTex(), ginghamBlue: ginghamTex('70,110,170'), sky: skyTex(), patch: windowPatchTex(), spice: spiceRowTex(), clock: clockTex(), drawing: drawingTex(), blob: blobTex(), glow: glowTex(),
  };
  const b = new Batch(25), d = new Batch(25);   // the furniture (casts shadows), the small things (don't)
  const blobs = new Batch(), glows = new Batch();
  const RW = s.room.w, RD = s.room.d, CEIL = 28;
  const boxes = s.boxes;
  const solidAt = (x, y, z) => boxes.some((q) => q[6] !== 'floor' && q[6] !== 'wall' && x > q[0] && x < q[3] && y > q[1] && y < q[4] && z > q[2] && z < q[5]);
  const box = (key, x0, y0, z0, x1, y1, z1, color, ao = null) => b.add(key, G.box, new THREE.Matrix4().compose(v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(x1 - x0, z1 - z0, y1 - y0)), color, ao);
  const rbox = (key, x0, y0, z0, x1, y1, z1, r, color, ao = null) => b.add(key, roundedBox(+(x1 - x0).toFixed(3), +(z1 - z0).toFixed(3), +(y1 - y0).toFixed(3), r), new THREE.Matrix4().makeTranslation(v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), color, ao);
  const blob = (x, y, z, rx, ry = rx, a = 0.5) => blobs.add('blob', G.quad, new THREE.Matrix4().compose(v3(x, y, z + 0.012), _q.identity(), _s.set(rx * 2, 1, ry * 2)), 0x000000, null, a);
  const glow = (x, y, z, rx, ry, col, a = 1) => glows.add('glow', G.quad, new THREE.Matrix4().compose(v3(x, y, z + 0.02), _q.identity(), _s.set(rx * 2, 1, ry * 2)), col, null, a);
  const P = (x, y, z, rot = 0, sc = 1) => placer(d, x, y, z, rot, sc);
  const C = { paint: 0xa3bdb0, paintDark: 0x8ea898, walnut: 0x8a5a3c, oak: 0xc89462, trim: 0xf3ead8, handle: PAL.brass };

  // ---- the floor, the walls, the ceiling
  box('planks', -1, -1, -0.5, RW + 1, RD + 1, 0, 0xffffff);
  // the walls (the north one with a big window in it)
  const WX0 = 50, WX1 = 70, WZ0 = 6, WZ1 = 18;
  // walls are one-sided, facing in (a camera that backs out of the room sees through them)
  const wall = (side, a0, a1, z0, z1) => {
    const len = a1 - a0, mid = (a0 + a1) / 2, zc = (z0 + z1) / 2;
    const [pos, ry] = { N: [v3(mid, RD, zc), 0], S: [v3(mid, 0, zc), Math.PI], W: [v3(0, mid, zc), Math.PI / 2], E: [v3(RW, mid, zc), -Math.PI / 2] }[side];
    b.add('paper', G.wall, new THREE.Matrix4().compose(pos, _q.setFromAxisAngle(UP, ry), _s.set(len, z1 - z0, 1)), 0xffffff, null);
  };
  wall('S', 0, RW, 0, CEIL); wall('W', 0, RD, 0, CEIL); wall('E', 0, RD, 0, CEIL);
  wall('N', 0, WX0, 0, CEIL); wall('N', WX1, RW, 0, CEIL); wall('N', WX0, WX1, 0, WZ0); wall('N', WX0, WX1, WZ1, CEIL);
  b.add('ceiling', G.wall, new THREE.Matrix4().compose(v3(RW / 2, RD / 2, CEIL), _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(RW, RD, 1)), 0x6b5560, null);
  for (const [x0, y0, x1, y1] of [[0, 0, 61.4, 0.25], [69.6, 0, RW, 0.25], [0, RD - 0.25, RW, RD], [0, 0, 0.25, RD], [RW - 0.25, 0, RW, RD]]) {
    rbox('paint', x0, y0, 0, x1, y1, 0.7, 0.05, C.trim);   // baseboards
  }
  for (const [x0, y0, x1, y1] of [[0, 0, RW, 0.25], [0, RD - 0.25, RW, RD], [0, 0, 0.25, RD], [RW - 0.25, 0, RW, RD]]) {
    rbox('paint', x0, y0, CEIL - 0.8, x1, y1, CEIL, 0.08, C.trim);   // crown moulding
  }
  // the window: frame, panes, sill, the night beyond, café curtains
  const wy = RD;
  box('paint', WX0 - 0.6, wy - 0.3, WZ0 - 0.6, WX0, wy + 0.5, WZ1 + 0.6, C.trim);
  box('paint', WX1, wy - 0.3, WZ0 - 0.6, WX1 + 0.6, wy + 0.5, WZ1 + 0.6, C.trim);
  box('paint', WX0, wy - 0.3, WZ1, WX1, wy + 0.5, WZ1 + 0.6, C.trim);
  rbox('paint', WX0 - 1.2, wy - 1.3, WZ0 - 0.5, WX1 + 1.2, wy + 0.2, WZ0, 0.1, C.trim);
  box('paint', (WX0 + WX1) / 2 - 0.15, wy + 0.1, WZ0, (WX0 + WX1) / 2 + 0.15, wy + 0.35, WZ1, C.trim);
  box('paint', WX0, wy + 0.1, (WZ0 + WZ1) / 2 - 0.15, WX1, wy + 0.35, (WZ0 + WZ1) / 2 + 0.15, C.trim);
  for (const x of [WX0 + 5, WX1 - 5]) box('paint', x - 0.07, wy + 0.15, WZ0, x + 0.07, wy + 0.3, WZ1, C.trim);
  herbPot(P(WX0 + 2, wy - 0.7, WZ0, 0.3), 0xc8673e, 3);
  herbPot(P(WX0 + 3.2, wy - 0.6, WZ0, 0.9), 0x6f9bd1, 5);
  plant(P(WX1 - 2.5, wy - 0.7, WZ0), 0.9, 0xe9dcc9, 7);
  bottle(P(WX0 + 9, wy - 0.6, WZ0), 0, 0, 0.7, 0x4f9a8a, 0xd4a548, 0xf3e5c0);
  // the curtains: cloth folded in soft waves, tied back
  const cloth = (x0, x1, flip) => {
    const w = x1 - x0, h = WZ1 + 1.6 - (WZ0 + 0.05), g = new THREE.PlaneGeometry(w, h, 28, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + w / 2) / w, v = (p.getY(i) + h / 2) / h;
      const pinch = 1 - 0.55 * Math.exp(-(((v - 0.42) / 0.12) ** 2));   // gathered at the tie-back
      p.setX(i, (p.getX(i) + w / 2) * pinch - w / 2 + (flip ? w * (1 - pinch) : 0));   // gathered to the outside
      p.setZ(i, Math.sin(u * 22) * 0.22 + 0.05);
    }
    g.computeVertexNormals();
    b.add('fabric', g, new THREE.Matrix4().makeTranslation(v3((x0 + x1) / 2, wy - 0.45, (WZ0 + 0.05 + WZ1 + 1.6) / 2)), 0xd98e8e, null);
  };
  cloth(WX0 - 3.5, WX0 + 2.5, false); cloth(WX1 - 2.5, WX1 + 3.5, true);
  rbox('fabric', WX0 - 3.8, wy - 0.9, WZ1 + 0.7, WX1 + 3.8, wy - 0.2, WZ1 + 2.4, 0.2, 0xcf8080);
  b.add('metal', G.cyl, new THREE.Matrix4().compose(v3((WX0 + WX1) / 2, wy - 0.4, WZ1 + 2.5), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), _s.set(0.08, WX1 - WX0 + 9, 0.08)), PAL.brass, null);
  for (const x of [WX0 - 4.6, WX1 + 4.6]) b.add('metal', G.sph, new THREE.Matrix4().compose(v3(x, wy - 0.4, WZ1 + 2.5), _q.identity(), _s.set(0.2, 0.2, 0.2)), PAL.brass, null);
  const skyM = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), new THREE.MeshBasicMaterial({ map: T.sky, fog: false }));
  skyM.position.copy(v3((WX0 + WX1) / 2, RD + 9, 13)); group.add(skyM);
  const patchM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.patch, color: 0x5b78c8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  patchM.rotation.x = -Math.PI / 2; patchM.scale.set(WX1 - WX0 + 2, 11, 1); patchM.position.copy(v3((WX0 + WX1) / 2 - 1, 60.5, 0.03)); group.add(patchM);
  // a faint shaft of moonlight from the window to that patch
  const beamGeo = new THREE.BufferGeometry();
  {
    const top = [[WX0, wy, WZ1], [WX1, wy, WZ1], [WX1, wy, WZ0], [WX0, wy, WZ0]], bot = [[WX0 - 1, 55, 0], [WX1 - 1, 55, 0], [WX1 - 1, 66, 0], [WX0 - 1, 66, 0]];
    const pos = [], uv = [];
    const quad = (a, c, d, e, va, vb) => { for (const [p, v] of [[a, va], [c, va], [d, vb], [a, va], [d, vb], [e, vb]]) { const q = v3(...p); pos.push(q.x, q.y, q.z); uv.push(0, v); } };
    for (let k = 0; k < 4; k++) quad(top[k], top[(k + 1) % 4], bot[(k + 1) % 4], bot[k], 1, 0);
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); beamGeo.computeVertexNormals();
  }
  const beam = new THREE.Mesh(beamGeo, beamMaterial(0x7d96e0, 0.12)); group.add(beam);

  // backsplash tiles where the counters meet the walls
  for (const q of boxes) {
    if (q[6] !== 'counter') continue;
    if (q[0] <= 0.01) box('tile', 0, q[1], q[5], 0.12, q[4], q[5] + 5.6, 0xffffff);
    if (q[3] >= RW - 0.01) box('tile', RW - 0.12, q[1], q[5], RW, q[4], q[5] + 6.2, 0xffffff);
    if (q[4] >= RD - 0.01) box('tile', q[0], RD - 0.12, q[5], q[3], RD, q[5] + 5.6, 0xffffff);
  }

  // ---- the furniture, from the sim's boxes
  const exposed = (q) => {   // which side faces show (not against a wall or another solid)
    const out = [], [x0, y0, z0, x1, y1, z1] = q, zm = (z0 + z1) / 2;
    const test = (pts) => pts.filter(([x, y]) => x > 0.05 && x < RW - 0.05 && y > 0.05 && y < RD - 0.05 && !solidAt(x, y, zm)).length;
    const along = (a, c) => [0.15, 0.5, 0.85].map((t) => a + (c - a) * t);
    if (test(along(x0, x1).map((x) => [x, y0 - 0.1])) >= 2) out.push(['S', x0, x1, y0]);
    if (test(along(x0, x1).map((x) => [x, y1 + 0.1])) >= 2) out.push(['N', x0, x1, y1]);
    if (test(along(y0, y1).map((y) => [x0 - 0.1, y])) >= 2) out.push(['W', y0, y1, x0]);
    if (test(along(y0, y1).map((y) => [x1 + 0.1, y])) >= 2) out.push(['E', y0, y1, x1]);
    return out;
  };
  // a panel on a side face: f = side, a..c along it, z0..z1 up it, standing out `out`
  const facePanel = (key, f, at, a, c, z0, z1, out, color, r = 0.06) => {
    const [cx, cy] = f === 'S' || f === 'N' ? [(a + c) / 2, at + (f === 'S' ? -out / 2 : out / 2)] : [at + (f === 'W' ? -out / 2 : out / 2), (a + c) / 2];
    const w = c - a;
    const [sx, sy] = f === 'S' || f === 'N' ? [w, out] : [out, w];
    const geo = r > 0 ? roundedBox(+sx.toFixed(3), +(z1 - z0).toFixed(3), +sy.toFixed(3), Math.min(r, out * 0.49)) : G.boxy;
    d.add(key, geo, r > 0 ? new THREE.Matrix4().makeTranslation(v3(cx, cy, (z0 + z1) / 2)) : new THREE.Matrix4().compose(v3(cx, cy, (z0 + z1) / 2), _q.identity(), _s.set(sx, z1 - z0, sy)), color, null);
  };
  const handleOn = (f, at, a, z, horiz, len = 0.9) => {
    const o = 0.18, [cx, cy] = f === 'S' || f === 'N' ? [a, at + (f === 'S' ? -o : o)] : [at + (f === 'W' ? -o : o), a];
    const along = f === 'S' || f === 'N' ? 'x' : 'y';
    let m;
    if (horiz) m = new THREE.Matrix4().compose(v3(cx, cy, z), _q.setFromAxisAngle(new THREE.Vector3(along === 'x' ? 0 : 1, 0, along === 'x' ? 1 : 0), Math.PI / 2), _s.set(0.06, len, 0.06));
    else m = new THREE.Matrix4().compose(v3(cx, cy, z), _q.identity(), _s.set(0.06, len, 0.06));
    d.add('metal', G.cylLo, m, C.handle, null);
  };
  const knobOn = (f, at, a, z, col = C.handle) => {
    const o = 0.14, [cx, cy] = f === 'S' || f === 'N' ? [a, at + (f === 'S' ? -o : o)] : [at + (f === 'W' ? -o : o), a];
    d.add('metal', G.sphLo, new THREE.Matrix4().compose(v3(cx, cy, z), _q.identity(), _s.set(0.13, 0.13, 0.13)), col, null);
  };
  const stove = boxes.find((q) => q[6] === 'stove');
  const cabinetRun = (q, paint, opts = {}) => {
    const [x0, y0, z0, x1, y1, z1] = q, top = opts.top ?? 0.28, kick = opts.kick ?? 0.5;
    const inset = 0.22;
    // the carcass, a toe-kick, the top
    box(opts.bodyKey || 'paint', x0 + 0.04, y0 + 0.04, z0 + kick, x1 - 0.04, y1 - 0.04, z1 - top, paint);
    box('matte', x0 + inset, y0 + inset, z0, x1 - inset, y1 - inset, z0 + kick, 0x2a1d1a);
    if (opts.marble !== false) rbox('marble', x0 - 0.12, y0 - 0.12, z1 - top, x1 + 0.12, y1 + 0.12, z1, 0.08, 0xffffff);
    for (const [f, fa, fc, at] of exposed(q)) {
      // an oven under the stove, doors either side of it
      const oven = stove && f === 'S' && stove[0] < fc && stove[3] > fa && Math.abs(z1 - stove[2]) < 0.05 && at <= stove[1] + 0.6;
      const segs = oven ? [[fa, stove[0], false], [stove[0], stove[3], true], [stove[3], fc, false]].filter(([a, c]) => c - a > 0.5) : [[fa, fc, false]];
      for (const [a, c, isOven] of segs) {
        if (isOven) {
          const oa = a + 0.07, oc = c - 0.07;
          facePanel('metal', f, at, oa, oc, z0 + kick + 0.08, z1 - top - 0.08, 0.12, 0x3a3a44, 0.05);
          facePanel('gloss', f, at - 0.12, oa + 0.6, oc - 0.6, z0 + kick + 0.5, z1 - top - 1.2, 0.04, 0x120e16, 0.03);
          handleOn(f, at - 0.12, (oa + oc) / 2, z1 - top - 0.95, true, oc - oa - 1.4);
          for (let k = 0; k < 5; k++) b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(oa + 0.9 + k * (oc - oa - 1.8) / 4, at - 0.2, z1 - top - 0.4), _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(0.17, 0.2, 0.17)), 0xd9dde3, null);
          continue;
        }
        const len = c - a, n = Math.max(1, Math.round(len / 3.4)), w = len / n;
        for (let i = 0; i < n; i++) {
          const da = a + i * w + 0.07, dc = a + (i + 1) * w - 0.07, mid = (da + dc) / 2;
          const dz0 = z0 + kick + 0.08, dzMid = z1 - top - 1.05, dz1 = z1 - top - 0.08;
          facePanel('paint', f, at, da, dc, dz0, dzMid - 0.08, 0.1, paint);   // the door
          facePanel('paint', f, at - 0.1 * (f === 'S' || f === 'W' ? 1 : -1), da + 0.32, dc - 0.32, dz0 + 0.3, dzMid - 0.38, 0.05, opts.inner ?? C.paintDark, 0);   // its panel
          facePanel('paint', f, at, da, dc, dzMid, dz1, 0.1, paint);   // the drawer
          handleOn(f, at, mid, (dzMid + dz1) / 2, true, Math.min(1.1, w * 0.35));
          knobOn(f, at, i % 2 ? da + 0.45 : dc - 0.45, dzMid - 0.55);
        }
      }
    }
  };

  for (const q of boxes) {
    const [x0, y0, z0, x1, y1, z1, kind] = q;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (kind === 'floor' || kind === 'wall') continue;
    if (kind === 'counter') { cabinetRun(q, C.paint); continue; }
    if (kind === 'island') { cabinetRun(q, C.walnut, { bodyKey: 'wood', inner: 0x6e452d }); continue; }
    if (kind === 'cupboard') {   // the tall pantry
      box('paint', x0, y0, z0 + 0.5, x1, y1, z1 - 0.3, C.paint);
      box('matte', x0 + 0.2, y0 + 0.2, z0, x1 - 0.2, y1 - 0.2, z0 + 0.5, 0x2a1d1a);
      rbox('paint', x0 - 0.15, y0 - 0.15, z1 - 0.35, x1 + 0.15, y1 + 0.15, z1, 0.06, C.trim);
      for (const [f, a, c, at] of exposed(q)) {
        const len = c - a, n = Math.max(1, Math.round(len / 4)), w = len / n;
        for (let i = 0; i < n; i++) {
          const da = a + i * w + 0.08, dc = a + (i + 1) * w - 0.08;
          facePanel('paint', f, at, da, dc, z0 + 0.6, z1 - 0.45, 0.1, C.paint);
          facePanel('paint', f, at - 0.1 * (f === 'S' || f === 'W' ? 1 : -1), da + 0.4, dc - 0.4, z0 + 1.0, (z0 + z1) / 2 - 0.2, 0.05, C.paintDark, 0);
          facePanel('paint', f, at - 0.1 * (f === 'S' || f === 'W' ? 1 : -1), da + 0.4, dc - 0.4, (z0 + z1) / 2 + 0.2, z1 - 0.85, 0.05, C.paintDark, 0);
          knobOn(f, at, i % 2 ? da + 0.5 : dc - 0.5, (z0 + z1) / 2);
        }
      }
      continue;
    }
    if (kind === 'wallcab') {
      const h = z1 - z0;
      if (h < 1.2) {   // a shelf on brackets
        rbox('wood', x0, y0, z0, x1, y1, z1, 0.08, C.oak);
        for (const yy of [y0 + 1, y1 - 1]) {
          const atWall = x1 >= RW - 0.01 ? x1 : x0;
          const dir = atWall === x1 ? -1 : 1;
          b.add('metal', G.box, new THREE.Matrix4().compose(v3(atWall + dir * 1.2, yy, z0 - 0.06), _q.identity(), _s.set(2.4, 0.1, 0.12)), 0x3a3a44, null);
          b.add('metal', G.box, new THREE.Matrix4().compose(v3(atWall + dir * 0.05, yy, z0 - 1.1), _q.identity(), _s.set(0.1, 2.2, 0.12)), 0x3a3a44, null);
          b.add('metal', G.box, new THREE.Matrix4().compose(v3(atWall + dir * 0.75, yy, z0 - 0.7), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), dir * Math.PI / 4), _s.set(0.08, 1.9, 0.1)), 0x3a3a44, null);
        }
        const bx = x1 >= RW - 0.01 ? x1 - 0.7 : x0 + 0.7;
        books(placer(d, bx, y1 - 0.6, z1, x1 >= RW - 0.01 ? -Math.PI / 2 : Math.PI / 2), 6, 77);
        jar(placer(d, bx, y0 + 1.6, z1), 0, 0, 0.9, 0.32, 0xe9c46a, PAL.brass);
        jar(placer(d, bx, y0 + 2.4, z1), 0, 0, 0.7, 0.28, 0x8d5524, 0x3a3a44);
        continue;
      }
      // upper cupboards: doors on the faces you see, an under-light, hung from the ceiling
      box('paint', x0, y0, z0, x1, y1, z1, C.paint);
      rbox('paint', x0 - 0.12, y0 - 0.12, z1 - 0.18, x1 + 0.12, y1 + 0.12, z1, 0.05, C.trim);
      for (const [f, a, c, at] of exposed(q)) {
        const len = c - a, n = Math.max(1, Math.round(len / 3.6)), w = len / n;
        for (let i = 0; i < n; i++) {
          const da = a + i * w + 0.07, dc = a + (i + 1) * w - 0.07;
          facePanel('paint', f, at, da, dc, z0 + 0.08, z1 - 0.24, 0.1, C.paint);
          facePanel('paint', f, at - 0.1 * (f === 'S' || f === 'W' ? 1 : -1), da + 0.3, dc - 0.3, z0 + 0.3, z1 - 0.46, 0.05, C.paintDark, 0);
          knobOn(f, at, i % 2 ? da + 0.4 : dc - 0.4, z0 + 0.45);
        }
      }
      box('emit', x0 + 0.3, y0 + 0.25, z0 - 0.06, x1 - 0.3, y0 + 0.45, z0, 0xffe2a8);
      const below = boxes.find((o) => o !== q && (o[6] === 'counter') && o[0] < x1 && o[3] > x0 && o[1] < y1 && o[4] > y0);
      if (below) for (let x = x0 + 2; x < x1 - 1; x += 4) glow(x + 1, (y0 + y1) / 2 - 1.2, below[5], 3.4, 2.6, 0xffc070, 0.55);
      for (const x of [x0 + 0.4, x1 - 0.4]) b.add('metal', G.cylLo, new THREE.Matrix4().compose(v3(x, y1 - 0.3, (z1 + CEIL) / 2), _q.identity(), _s.set(0.06, CEIL - z1, 0.06)), 0x3a3a44, null);
      continue;
    }
    if (kind === 'table') {   // a gingham cloth over an oak table on turned legs
      const lt = z1 - 0.35;
      rbox('wood', x0, y0, lt, x1, y1, z1 - 0.05, 0.1, C.oak);
      for (const [lx, ly] of [[x0 + 0.6, y0 + 0.6], [x1 - 0.6, y0 + 0.6], [x0 + 0.6, y1 - 0.6], [x1 - 0.6, y1 - 0.6]]) b.add('wood', PROF.leg, new THREE.Matrix4().compose(v3(lx, ly, 0), _q.identity(), _s.set(1.1, lt / 2, 1.1)), C.oak, 0);
      const cl = new THREE.Mesh(roundedBox(x1 - x0 + 0.2, 0.06, y1 - y0 + 0.2, 0.03), new THREE.MeshStandardMaterial({ map: T.gingham, roughness: 0.85 }));
      T.gingham.repeat.set((x1 - x0) / 1.2, (y1 - y0) / 1.2);
      cl.position.copy(v3(cx, cy, z1 - 0.02)); cl.receiveShadow = true; group.add(cl);
      for (const [f, a, c] of [['S', x0, x1], ['N', x0, x1], ['W', y0, y1], ['E', y0, y1]]) {
        const at = { S: y0 - 0.12, N: y1 + 0.12, W: x0 - 0.12, E: x1 + 0.12 }[f], len = c - a + 0.24;
        const dt = T.gingham.clone(); dt.needsUpdate = true; dt.repeat.set(len / 1.2, 0.9 / 1.2);
        const drape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9, 20, 1), new THREE.MeshStandardMaterial({ map: dt, roughness: 0.85, side: THREE.DoubleSide }));
        const pp = drape.geometry.attributes.position;
        for (let i = 0; i < pp.count; i++) pp.setZ(i, (pp.getY(i) < 0 ? Math.sin(pp.getX(i) * 2.2) * 0.08 : 0));
        drape.geometry.computeVertexNormals();
        const ctr = f === 'S' || f === 'N' ? [(a + c) / 2, at] : [at, (a + c) / 2];
        drape.position.copy(v3(ctr[0], ctr[1], z1 - 0.45));
        drape.rotation.y = { S: 0, N: Math.PI, W: -Math.PI / 2, E: Math.PI / 2 }[f];
        drape.castShadow = true; group.add(drape);
      }
      // the tea things, at the edges (the cake and the queen have the middle)
      teapot(P(x1 - 1.3, y1 - 1.3, z1, 2.4), 0xf3a6b8);
      cupSaucer(P(x0 + 1.1, y1 - 1.0, z1, 0.4), 0x8fc1e3);
      cupSaucer(P(x1 - 1.1, y0 + 1.0, z1, 2.2), 0xf3a6b8);
      cupSaucer(P(x1 - 3.0, y1 - 0.9, z1, 1.0), 0xf6d365);
      napkin(P(x0 + 1.0, y0 + 1.0, z1, 0.3), 0xf9e1e7);
      napkin(P(x0 + 2.4, y1 - 0.8, z1, 1.2), 0xd0ebff);
      plateStack(P(x0 + 1.4, y0 + 2.6, z1, 0, 0.8), 3, PAL.white, 0xf3a6b8);
      crumbs(d, cx + 2.5, cy - 2.5, z1 + 0.06, 10, 0.8, 5);
      blob(x1 - 1.3, y1 - 1.3, z1 + 0.03, 0.75, 0.75, 0.4);
      // crumbs fallen to the floor around it
      crumbs(d, x0 - 0.8, cy, 0, 14, 1.4, 6); crumbs(d, cx, y0 - 0.9, 0, 12, 1.2, 7); crumbs(d, x1 + 0.9, cy + 2, 0, 8, 1, 8);
      blob(cx, cy, 0, (x1 - x0) / 2 + 1.5, (y1 - y0) / 2 + 1.5, 0.35);
      continue;
    }
    if (kind === 'chair') {
      const tb = boxes.find((o) => o[6] === 'table');
      const tcx = tb ? (tb[0] + tb[3]) / 2 : cx, tcy = tb ? (tb[1] + tb[4]) / 2 : cy;
      rbox('paint', x0, y0, z1 - 0.25, x1, y1, z1, 0.1, 0xe7c9a0);
      rbox('fabric', x0 + 0.15, y0 + 0.15, z1, x1 - 0.15, y1 - 0.15, z1 + 0.12, 0.06, 0xc0504d);
      for (const [lx, ly] of [[x0 + 0.25, y0 + 0.25], [x1 - 0.25, y0 + 0.25], [x0 + 0.25, y1 - 0.25], [x1 - 0.25, y1 - 0.25]]) b.add('paint', G.cylLo, new THREE.Matrix4().compose(v3(lx, ly, (z1 - 0.25) / 2), _q.identity(), _s.set(0.13, z1 - 0.25, 0.13)), 0xe7c9a0, 0);
      // the back, on the side away from the table
      const dx = cx - tcx, dy = cy - tcy, alongX = Math.abs(dx) < Math.abs(dy);
      const bx = alongX ? null : (dx < 0 ? x0 + 0.15 : x1 - 0.15), by = alongX ? (dy < 0 ? y0 + 0.15 : y1 - 0.15) : null;
      const span = alongX ? [x0 + 0.25, x1 - 0.25] : [y0 + 0.25, y1 - 0.25];
      for (const t of [span[0], span[1]]) {
        const [px, py] = alongX ? [t, by] : [bx, t];
        b.add('paint', G.cylLo, new THREE.Matrix4().compose(v3(px, py, z1 + 1.5), _q.identity(), _s.set(0.12, 3, 0.12)), 0xe7c9a0, null);
      }
      const [rx, ry] = alongX ? [cx, by] : [bx, cy], rl = span[1] - span[0];
      b.add('paint', roundedBox(alongX ? rl + 0.3 : 0.2, 0.7, alongX ? 0.2 : rl + 0.3, 0.08), new THREE.Matrix4().makeTranslation(v3(rx, ry, z1 + 2.7)), 0xe7c9a0, null);
      for (let k = 1; k <= 3; k++) {
        const t = span[0] + rl * k / 4, [px, py] = alongX ? [t, by] : [bx, t];
        b.add('paint', G.cylLo, new THREE.Matrix4().compose(v3(px, py, z1 + 1.3), _q.identity(), _s.set(0.06, 2.3, 0.06)), 0xe7c9a0, null);
      }
      blob(cx, cy, 0, (x1 - x0) / 2 + 0.4, (y1 - y0) / 2 + 0.4, 0.4);
      continue;
    }
    if (kind === 'fridge') {   // a retro cream fridge, its front to the room (south)
      rbox('gloss', x0, y0, z0 + 0.35, x1, y1, z1, 0.55, 0xf3e7cc);
      box('metal', x0 + 0.4, y0 + 0.3, z0, x1 - 0.4, y1 - 0.3, z0 + 0.4, 0x8a8f98);
      const fz = 6.6, fy = y0;
      box('matte', x0 + 0.3, fy - 0.03, fz - 0.06, x1 - 0.3, fy + 0.1, fz + 0.06, 0x8c7f6a);
      for (const [za, zb] of [[1.4, 5.6], [7.2, 9.2]]) {
        b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(x1 - 1.0, fy - 0.38, (za + zb) / 2), _q.identity(), _s.set(0.12, zb - za, 0.12)), 0xdfe3e8, null);
        for (const z of [za, zb]) b.add('metal', G.box, new THREE.Matrix4().compose(v3(x1 - 1.0, fy - 0.2, z), _q.identity(), _s.set(0.18, 0.18, 0.4)), 0xdfe3e8, null);
      }
      rbox('metal', x0 + 3.6, fy - 0.08, 8.3, x0 + 6.4, fy + 0.1, 8.9, 0.08, 0xdfe3e8);
      // the drawing, a photo, a note, and magnets holding them up
      const flat = (tex, x, z, w, h, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); m.position.copy(v3(x, fy - 0.03, z)); m.rotation.set(0, 0, rot); group.add(m); return m; };
      flat(T.drawing, x0 + 3.2, 4.2, 3.4, 2.65, 0.06);
      box('satin', x0 + 6.0, fy - 0.03, 2.2, x0 + 7.4, fy - 0.01, 3.9, 0xffffff);
      box('satin', x0 + 6.15, fy - 0.04, 2.6, x0 + 7.25, fy - 0.02, 3.75, 0x6a9fd8);
      box('satin', x0 + 6.15, fy - 0.045, 2.6, x0 + 7.25, fy - 0.025, 3.0, 0x6fb35b);
      box('matte', x0 + 6.6, fy - 0.03, 4.9, x0 + 8.0, fy - 0.01, 6.1, 0xffe066);
      for (let k = 0; k < 4; k++) box('matte', x0 + 6.75, fy - 0.035, 5.7 - k * 0.22, x0 + 7.85 - (k % 2) * 0.3, fy - 0.03, 5.74 - k * 0.22, 0x5c5f66);
      const mags = [[x0 + 1.7, 5.4, 0xfa5252, 'sph'], [x0 + 4.7, 5.4, 0x339af0, 'sph'], [x0 + 6.7, 3.95, 0xfcc419, 'star'], [x0 + 7.3, 6.0, 0x51cf66, 'sph'], [x0 + 2.0, 8.0, 0xff922b, 'heart'], [x0 + 4.0, 7.6, 0xcc5de8, 'sph'], [x0 + 7.6, 8.1, 0x20c997, 'star'], [x0 + 1.6, 2.4, 0xff6b9d, 'heart'], [x0 + 3.0, 9.1, 0x74c0fc, 'sph']];
      for (const [mx, mz, c, shape] of mags) {
        if (shape === 'sph') b.add('gloss', G.sph, new THREE.Matrix4().compose(v3(mx, fy - 0.08, mz), _q.identity(), _s.set(0.22, 0.22, 0.12)), c, null);
        else if (shape === 'star') { for (let k = 0; k < 5; k++) b.add('gloss', G.cone, new THREE.Matrix4().compose(v3(mx + Math.sin(k * TAU / 5) * 0.14, fy - 0.08, mz + Math.cos(k * TAU / 5) * 0.14), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -k * TAU / 5), _s.set(0.1, 0.3, 0.06)), c, null); }
        else { for (const sx of [-1, 1]) b.add('gloss', G.sph, new THREE.Matrix4().compose(v3(mx + sx * 0.1, fy - 0.08, mz + 0.06), _q.identity(), _s.set(0.14, 0.14, 0.08)), c, null); b.add('gloss', G.cone, new THREE.Matrix4().compose(v3(mx, fy - 0.08, mz - 0.1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI), _s.set(0.21, 0.26, 0.07)), c, null); }
      }
      blob(cx, cy, 0, (x1 - x0) / 2 + 0.8, (y1 - y0) / 2 + 0.8, 0.5);
      continue;
    }
    if (kind === 'stove') {   // black glass, four rings; the kettle is the sim's
      rbox('gloss', x0, y0, z0 - 0.02, x1, y1, z1, 0.05, 0x17151c);
      for (const [bx, by] of [[x0 + 2, y0 + 1.6], [x1 - 2, y0 + 1.6], [x0 + 2, y1 - 1.6], [x1 - 2, y1 - 1.6]]) {
        b.add('metal', torus(0.95, 0.07, TAU, 6, 32), new THREE.Matrix4().compose(v3(bx, by, z1 + 0.005), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(1, 1, 0.3)), 0x55505c, null);
        b.add('metal', torus(0.55, 0.05, TAU, 6, 24), new THREE.Matrix4().compose(v3(bx, by, z1 + 0.005), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(1, 1, 0.3)), 0x45404c, null);
      }
      continue;
    }
    if (kind === 'sink') {   // a steel rim, a basin of soapy water, a tall tap at the back
      const r = 0.35;
      box('metal', x0, y0, z0 - 0.05, x1, y0 + r, z1, PAL.steel); box('metal', x0, y1 - r, z0 - 0.05, x1, y1, z1, PAL.steel);
      box('metal', x0, y0, z0 - 0.05, x0 + r, y1, z1, PAL.steel); box('metal', x1 - r, y0, z0 - 0.05, x1, y1, z1, PAL.steel);
      box('water', x0 + r, y0 + r, z1 - 0.06, x1 - r, y1 - r, z1 - 0.02, 0x9fb9c9);
      const R = rand(17);
      for (let i = 0; i < 26; i++) { const ex = R() < 0.5, bx = ex ? (R() < 0.5 ? x0 + r + 0.2 : x1 - r - 0.2) : x0 + r + R() * (x1 - x0 - 2 * r), by = ex ? y0 + r + R() * (y1 - y0 - 2 * r) : (R() < 0.5 ? y0 + r + 0.2 : y1 - r - 0.2), rr = 0.08 + R() * 0.14; b.add('glass', G.sphLo, new THREE.Matrix4().compose(v3(bx, by, z1 - 0.04), _q.identity(), _s.set(rr, rr * 0.8, rr)), 0xffffff, null); }
      const tx = x1 >= RW - 1.2 ? x1 + 0.35 : cx, ty = x1 >= RW - 1.2 ? cy : y1 + 0.3;
      const T1 = P(tx, ty, z0, x1 >= RW - 1.2 ? -Math.PI / 2 : 0);
      T1('metal', G.cyl, PAL.steel, L(0, 0.2, 0, 0.32, 0.4, 0.32), false);
      T1('metal', G.cyl, PAL.steel, L(0, 1.4, 0, 0.12, 2.4, 0.12), false);
      T1('metal', torus(0.6, 0.12, Math.PI, 8, 16), PAL.steel, L(0, 2.6, 0.6, 1, 1, 1, 0, Math.PI / 2, 0), false);
      T1('metal', G.cyl, PAL.steel, L(0, 2.35, 1.2, 0.13, 0.5, 0.13), false);
      for (const k of [-1, 1]) { T1('metal', G.cyl, PAL.steel, L(k * 0.7, 0.35, 0, 0.12, 0.5, 0.12), false); T1('metal', G.box, PAL.steel, L(k * 0.7, 0.62, 0.1, 0.12, 0.08, 0.5), false); }
      const S = P(x1 >= RW - 1.2 ? x1 + 0.45 : cx - 2, y1 + 0.9, z0);
      S('gloss', roundedBox(0.5, 1.0, 0.36, 0.14), 0x8ce99a, L(0, 0.5, 0));
      S('metal', G.cyl, 0xf1f3f5, L(0, 1.15, 0, 0.07, 0.3, 0.07));
      S('metal', G.box, 0xf1f3f5, L(0, 1.28, 0.12, 0.06, 0.06, 0.26));
      continue;
    }
    if (kind === 'toaster') {   // candy red, chrome trim, slots on top, a lever
      rbox('gloss', x0, y0, z0, x1, y1, z1, 0.45, 0xd6336c);
      rbox('metal', x0 - 0.05, y0 + 0.4, z0 + 0.6, x1 + 0.05, y1 - 0.4, z0 + 0.85, 0.08, 0xe9ecef);
      for (const xx of [x0 + (x1 - x0) * 0.32, x0 + (x1 - x0) * 0.68]) {
        box('matte', xx - 0.22, y0 + 0.5, z1 - 0.01, xx + 0.22, y1 - 0.5, z1 + 0.005, 0x1a1214);
        rbox('matte', xx - 0.16, y0 + 0.65, z1 - 0.1, xx + 0.16, y1 - 0.65, z1 + 0.16, 0.08, 0xd9a25f);
      }
      box('metal', cx - 0.12, y0 - 0.4, z1 - 0.9, cx + 0.12, y0, z1 - 0.7, 0x2b2b33);
      b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(cx + 0.9, y0 - 0.08, z0 + 1.3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(0.22, 0.16, 0.22)), 0xe9ecef, null);
      for (const [fx, fy] of [[x0 + 0.5, y0 + 0.5], [x1 - 0.5, y0 + 0.5], [x0 + 0.5, y1 - 0.5], [x1 - 0.5, y1 - 0.5]]) b.add('matte', G.cylLo, new THREE.Matrix4().compose(v3(fx, fy, z0 + 0.05), _q.identity(), _s.set(0.2, 0.1, 0.2)), 0x2b2b33, null);
      blob(cx, cy, z0, (x1 - x0) / 2 + 0.4, (y1 - y0) / 2 + 0.4, 0.55);
      continue;
    }
    if (kind === 'breadbin') {   // a roll-top bin, sage enamel, a wooden knob and a name
      rbox('gloss', x0, y0, z0, x1, y1, z1, 1.0, 0x9cbf9b);
      rbox('wood', x0 - 0.06, y0 + 0.3, z0, x1 + 0.06, y1 - 0.3, z0 + 0.3, 0.1, C.oak);
      b.add('wood', G.sph, new THREE.Matrix4().compose(v3(cx, y0 - 0.05, z0 + 1.0), _q.identity(), _s.set(0.3, 0.3, 0.2)), 0x8a5a3c, null);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshStandardMaterial({ map: labelTex('BREAD', '#9cbf9b', '#f6efe2'), roughness: 0.5 }));
      lab.position.copy(v3(cx, y0 - 0.01, z0 + 1.5)); group.add(lab);
      blob(cx, cy, 0, (x1 - x0) / 2 + 0.7, (y1 - y0) / 2 + 0.7, 0.5);
      continue;
    }
    if (kind === 'tin') {   // a round biscuit tin
      const r = Math.min(x1 - x0, y1 - y0) / 2, col = cx > 75 ? 0xc0392b : 0x2f5d8a;
      b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(cx, cy, (z0 + z1 - 0.3) / 2), _q.identity(), _s.set(r * 0.97, z1 - z0 - 0.3, r * 0.97)), col, 0);
      b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(cx, cy, z1 - 0.17), _q.identity(), _s.set(r * 1.03, 0.34, r * 1.03)), col, null);
      b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(cx, cy, z0 + 0.55), _q.identity(), _s.set(r * 0.99, 0.18, r * 0.99)), 0xe6b84a, null);
      b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(cx, cy, z1 - 0.32), _q.identity(), _s.set(r * 1.01, 0.08, r * 1.01)), 0xe6b84a, null);
      b.add('gloss', G.cyl, new THREE.Matrix4().compose(v3(cx, cy, z1 + 0.005), _q.identity(), _s.set(r * 0.55, 0.01, r * 0.55)), 0xf1e3c6, null);
      blob(cx, cy, 0, r + 0.5, r + 0.5, 0.55);
      continue;
    }
    if (kind === 'cereal') {   // a box with a picture on the front
      const i = Math.round(cx) % 3;
      const art = [['#ffd43b', '#e8590c', ['HONEY', 'HOOPS'], '#f08c00'], ['#4dabf7', '#1c3f8a', ['CHOCO', 'STARS'], '#6b3f22'], ['#ff8fab', '#c2255c', ['BERRY', 'CRUNCH'], '#e64980']][i];
      const ft = cerealTex(art[0], art[1], art[2], art[3]);
      const side = new THREE.MeshStandardMaterial({ color: art[0], roughness: 0.6 }), front = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55 });
      const m = new THREE.Mesh(roundedBox(+(x1 - x0).toFixed(3), +(z1 - z0).toFixed(3), +(y1 - y0).toFixed(3), 0.04, 1), [side, side, side, side, front, front]);
      m.position.copy(v3(cx, cy, (z0 + z1) / 2)); m.castShadow = true; m.receiveShadow = true; group.add(m);
      blob(cx, cy, z0, (x1 - x0) / 2 + 0.4, (y1 - y0) / 2 + 0.4, 0.5);
      continue;
    }
    if (kind === 'stool') {   // a little mint step stool
      rbox('paint', x0, y0, z1 - 0.25, x1, y1, z1, 0.1, 0x96d4c0);
      for (const [lx, ly] of [[x0 + 0.3, y0 + 0.3], [x1 - 0.3, y0 + 0.3], [x0 + 0.3, y1 - 0.3], [x1 - 0.3, y1 - 0.3]]) {
        const a = v3(lx, ly, z1 - 0.2), f = v3(lx + (lx < cx ? -0.15 : 0.15), ly + (ly < cy ? -0.15 : 0.15), 0);
        b.add('paint', G.cylLo, between(a, f, 0.1), 0x96d4c0, 0);
      }
      box('paint', x0 + 0.3, cy - 0.06, 0.4, x1 - 0.3, cy + 0.06, 0.5, 0x96d4c0);
      blob(cx, cy, 0, (x1 - x0) / 2 + 0.3, (y1 - y0) / 2 + 0.3, 0.45);
      continue;
    }
    if (kind === 'shelf') {   // the spice staircase: wooden steps, a row of jars along each riser
      rbox('wood', x0, y0, z1 - 0.2, x1, y1, z1, 0.06, 0xa87a52);
      box('wood', x0 + 0.1, y0 + 0.05, z0, x1 - 0.1, y1, z1 - 0.2, 0x8a5a3c);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, z1 - z0 - 0.25), new THREE.MeshStandardMaterial({ map: T.spice, roughness: 0.6 }));
      face.material.map.repeat.set((x1 - x0) / 8, 1);
      face.position.copy(v3(cx, y0 + 0.04, z0 + (z1 - z0 - 0.25) / 2 + 0.02)); group.add(face);
      for (const x of [x0, x1 - 0.3]) box('wood', x, y0, z0, x + 0.3, y1, z1 + 0.05, 0x7a4e30);
      continue;
    }
    // anything new: a plain painted box
    rbox('paint', x0, y0, z0, x1, y1, z1, 0.08, 0xd9c2a0);
  }

  // ---- dressing on the counters (tall things at the back, low things elsewhere)
  const counter = (test) => boxes.find((q) => q[6] === 'counter' && test(q));
  const north = counter((q) => q[3] - q[0] > q[4] - q[1] && q[1] > 20);
  const west = counter((q) => q[0] <= 0.01 && q[4] - q[1] > q[3] - q[0]);
  const east = counter((q) => q[3] >= RW - 0.01);
  if (north) {
    const z = north[5], by = north[4] - 0.7;
    plant(P(2.2, by - 0.3, z, 0.4), 1.6, PAL.terracotta, 2); blob(2.2, by - 0.3, z, 0.9, 0.9, 0.45);
    jar(P(6.6, by, z), 0, 0, 1.5, 0.45, 0xf8f4ec, PAL.brass); blob(6.6, by, z, 0.55, 0.55);
    jar(P(7.7, by, z), 0, 0, 1.15, 0.4, 0xe9c46a, PAL.brass); blob(7.7, by, z, 0.5, 0.5);
    jar(P(8.7, by, z), 0, 0, 0.9, 0.36, 0x8d5524, PAL.brass); blob(8.7, by, z, 0.45, 0.45);
    bottle(P(11.8, by + 0.1, z), 0, 0, 1.25, 0x6b8e23, PAL.brass, 0xf3e5c0); blob(11.8, by + 0.1, z, 0.4, 0.4);
    bottle(P(12.7, by, z), 0, 0, 1.05, 0x7a2e3a, 0x2b2b33, 0xe9d8b4, true); blob(12.7, by, z, 0.38, 0.38);
    cuttingBoard(P(11, 39.4, z, 0.15)); blob(11, 39.4, z, 1.3, 0.8, 0.35);
    crock(P(24.5, by + 0.1, z)); blob(24.5, by + 0.1, z, 0.5, 0.5);
    shakers(P(36.3, by + 0.2, z, 0.2)); blob(36.3, by + 0.2, z, 0.45, 0.3);
    fruitBowl(P(43.6, by - 0.5, z, 0.5)); blob(43.6, by - 0.5, z, 1.0, 1.0, 0.5);
    for (const [i, c] of [[0, 0xf3a6b8], [1, 0x8fc1e3], [2, 0xf6d365]]) { const m = P(46.6 + i * 0.75, by + 0.15 - (i % 2) * 0.25, z, i * 0.9 + 0.6); mug(m, c, 0); blob(46.6 + i * 0.75, by + 0.15 - (i % 2) * 0.25, z, 0.35, 0.35); }
    plateStack(P(50, by - 0.35, z), 6, PAL.white, 0x6f9bd1); blob(50, by - 0.35, z, 0.95, 0.95, 0.45);
    flourBag(P(52.6, by - 0.1, z, -0.25)); blob(52.6, by - 0.1, z, 0.75, 0.55);
    cookieStack(P(46.3, 39.2, z), 1);
    { const pc = P(46.8, 39.6, z); pc('gloss', PROF.plate, PAL.white, L(0, 0, 0, 0.75, 1, 0.75)); for (let i = 0; i < 4; i++) cookieStack(P(46.8 + Math.cos(i * 1.6) * 0.32, 39.6 + Math.sin(i * 1.6) * 0.32, z + 0.06), i === 0 ? 3 : 1); }
    sugarBowl(P(41.5, 39.6, z)); blob(41.5, 39.6, z, 0.45, 0.45);
    crumbs(d, 44.5, 39, z, 8, 0.8, 11);
    crumbs(d, 20, north[1] - 1.5, 0, 10, 1.4, 12);
  }
  if (west) {
    const z = west[5], bx = west[0] + 0.7;
    herbPot(P(bx, 16.2, z), 0xc8673e, 1); herbPot(P(bx + 0.1, 17.1, z), 0x6f9bd1, 2); blob(bx, 16.6, z, 0.5, 0.9);
    jar(P(bx, 19.2, z), 0, 0, 1.4, 0.45, 0x5c3a21, 0x2b2b33); jar(P(bx, 20.3, z), 0, 0, 1.1, 0.42, 0xd9b38c, 0x2b2b33); jar(P(bx, 21.3, z), 0, 0, 0.85, 0.36, 0x2f6b3a, 0x2b2b33);
    blob(bx, 20.3, z, 0.5, 1.6);
    books(P(west[0] + 0.55, 26.5, z, Math.PI / 2), 5, 9); blob(west[0] + 0.55, 27, z, 0.5, 1.0);
    bottle(P(bx, 33.6, z), 0, 0, 1.2, 0x2f6b3a, 0x2b2b33, 0xf3e5c0, true); bottle(P(bx + 0.1, 34.5, z), 0, 0, 1.1, 0xc9a227, PAL.brass); blob(bx, 34, z, 0.45, 0.9);
    mug(P(4.2, 35.2, z, 1.2), 0xf3a6b8, 0); blob(4.2, 35.2, z, 0.35, 0.35);
    // the open shelf on the west wall, with plates on show
    const sz = 10.8;
    rbox('wood', 0, 15, sz - 0.25, 1.7, 33, sz, 0.05, C.oak);
    for (const yy of [16, 24, 32]) b.add('wood', G.box, new THREE.Matrix4().compose(v3(0.6, yy, sz - 0.9), _q.identity(), _s.set(1.1, 1.2, 0.16)), 0x8a5a3c, null);
    for (let i = 0; i < 6; i++) b.add('gloss', PROF.plate, new THREE.Matrix4().compose(v3(0.55, 16.5 + i * 0.5, sz + 0.82), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2 + 0.25), _s.set(1, 1, 1)), i % 2 ? 0x6f9bd1 : PAL.white, null);
    jar(P(0.8, 21, sz), 0, 0, 0.9, 0.35, 0xe76f51, 0x2b2b33); jar(P(0.8, 22, sz), 0, 0, 1.1, 0.35, 0xf4a261, 0x2b2b33);
    plant(P(0.85, 25.5, sz), 0.9, 0xe9dcc9, 4);
    for (let i = 0; i < 3; i++) mug(P(0.9, 28 + i * 0.8, sz, Math.PI / 2), [0xf3a6b8, 0x8fc1e3, 0xf6d365][i], 0);
    books(P(0.7, 30.6, sz, Math.PI / 2), 4, 3);
  }
  if (east) {
    const z = east[5], bx = east[3] - 0.75;
    plant(P(bx - 0.1, 10.2, z), 1.2, 0xe9dcc9, 9); blob(bx - 0.1, 10.2, z, 0.75, 0.75);
    jar(P(bx, 15.2, z), 0, 0, 1.3, 0.42, 0xf8f4ec, PAL.steel); jar(P(bx, 16.2, z), 0, 0, 1.0, 0.38, 0x6b3f22, PAL.steel); blob(bx, 15.7, z, 0.5, 1.0);
    bottle(P(bx, 17.4, z), 0, 0, 1.15, 0xd9480f, 0x2b2b33); blob(bx, 17.4, z, 0.38, 0.38);
    // a dish rack by the sink
    const rk = P(east[3] - 1.6, 24.5, z);
    rk('metal', G.box, PAL.steel, L(0, 0.05, 0, 1.6, 0.1, 3.2), false);
    for (let i = 0; i < 5; i++) rk('gloss', PROF.plate, i % 2 ? PAL.white : 0x6f9bd1, L(0, 0.78, -1.2 + i * 0.55, 0.9, 0.9, 0.9, Math.PI / 2 - 0.15, 0, 0), false);
    for (let i = 0; i < 6; i++) rk('metal', G.cylLo, PAL.steel, L(0.5, 0.5, -1.4 + i * 0.55, 0.025, 0.9, 0.025), false);
    blob(east[3] - 1.6, 24.5, z, 1.0, 1.8);
    mug(P(bx - 0.2, 38.2, z, -0.6), 0x8fc1e3, 0); mug(P(bx - 0.1, 39.2, z, 0.8), 0xf6d365, 0); blob(bx - 0.15, 38.7, z, 0.4, 0.8);
    { const lb = P(bx - 0.3, 47.6, z, 0); lb('wood', roundedBox(1.4, 0.12, 2.6, 0.05), 0xc89462, L(0, 0.06, 0)); lb('matte', roundedBox(1.0, 0.9, 1.9, 0.4), 0xc98a3c, L(0, 0.55, 0)); for (let i = 0; i < 3; i++) lb('matte', G.box, 0xe9c48a, L(0, 0.98, -0.55 + i * 0.55, 0.6, 0.04, 0.08, 0, 0.3)); blob(bx - 0.3, 47.6, z, 1.4, 0.8); }
    shakers(P(bx, 55.6, z, Math.PI / 2)); blob(bx, 55.6, z, 0.3, 0.45);
    cookieStack(P(bx - 0.2, 57.2, z), 5); blob(bx - 0.2, 57.2, z, 0.35, 0.35);
    jar(P(bx, 60.6, z), 0, 0, 1.2, 0.5, 0xc98a4b, 0xd6336c); blob(bx, 60.6, z, 0.6, 0.6);
    // pans on a rail above
    const rz = 10.6;
    b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(RW - 0.45, 19.5, rz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(0.08, 14, 0.08)), PAL.brass, null);
    for (const yy of [12.6, 26.4]) b.add('metal', G.cylLo, new THREE.Matrix4().compose(v3(RW - 0.25, yy, rz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), _s.set(0.06, 0.45, 0.06)), PAL.brass, null);
    const hang = (yy, sz2, col, handle, kind2) => {
      const H = P(RW - 0.55, yy, rz, -Math.PI / 2);   // its front faces west, into the room
      H('metal', torus(0.1, 0.02, TAU, 4, 10), 0x3a3a44, L(0, -0.1, 0, 1, 1, 1, 0, Math.PI / 2), false);
      if (kind2 === 'pan') {
        H('metal', G.cyl, handle, L(0, -0.75, 0.05, 0.07, 1.1, 0.05), false);
        H('metal', PROF.pan, col, L(0, -1.3 - sz2 * 0.62, 0.0, sz2, sz2, sz2, Math.PI / 2 - 0.05), false);
      } else {
        H('metal', G.cyl, handle, L(0, -0.95, 0.03, 0.04, 1.6, 0.03), false);
        H('metal', kind2 === 'ladle' ? G.hemi : G.box, col, kind2 === 'ladle' ? L(0, -1.9, 0.12, 0.3, 0.2, 0.3, Math.PI) : L(0, -1.9, 0.03, 0.35, 0.5, 0.03), false);
      }
    };
    hang(13.5, 0.9, 0x2b2b33, 0x2b2b33, 'pan'); hang(16.5, 1.15, 0xc8794a, 0x8a5a3c, 'pan'); hang(19.8, 0.75, 0xb06a3c, 0x8a5a3c, 'pan'); hang(22.4, 1, PAL.steel, PAL.steel, 'ladle'); hang(24.4, 1, PAL.steel, 0x2b2b33, 'spatula');
  }
  // the island: just a tea towel over the edge (its top is the Sprinkle Gallery)
  const isl = boxes.find((q) => q[6] === 'island');
  if (isl) {
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshStandardMaterial({ map: T.ginghamBlue, roughness: 0.9, side: THREE.DoubleSide }));
    T.ginghamBlue.repeat.set(1.5, 2);
    tw.position.copy(v3(isl[0] + 3.1, isl[1] - 0.36, isl[5] - 1.15)); tw.rotation.z = 0.06; group.add(tw);
    crumbs(d, isl[0] + 4, isl[1] - 1.5, 0, 6, 0.8, 21);
    spoon(P(isl[3] + 2.2, isl[1] - 1.8, 0, 0.9));
  }

  // ---- the floor: a braided rug, the cat's bowls, a lost sock, a door to the hall
  {
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.05, 0.08, 72, 1), [new THREE.MeshStandardMaterial({ color: 0x8a3a30, roughness: 1 }), new THREE.MeshStandardMaterial({ map: T.rug, roughness: 1, transparent: false }), new THREE.MeshStandardMaterial({ color: 0x8a3a30 })]);
    rug.position.copy(v3(77.5, 27.5, 0.04)); rug.receiveShadow = true; group.add(rug);
  }
  catBowls(P(88, 66.6, 0, Math.PI)); blob(88.2, 66.6, 0, 1.6, 0.9, 0.35);
  sock(P(84, 7.5, 0, 0.7)); blob(84, 7.5, 0, 0.6, 0.5, 0.35);
  // a striped runner in front of the sink counter, a mat by the door
  if (east) {
    const rt = runnerTex(); rt.repeat.set(1, 3);
    const run = new THREE.Mesh(roundedBox(4.4, 0.06, 26, 0.03), new THREE.MeshStandardMaterial({ map: rt, roughness: 1 }));
    run.position.copy(v3(east[0] - 2.9, 32, 0.03)); run.receiveShadow = true; group.add(run);
  }
  rbox('fabric', 62.3, 0.4, 0, 68.7, 3.2, 0.08, 0.04, 0x8a6a4a);
  rbox('fabric', 62.8, 0.8, 0.02, 68.2, 2.8, 0.1, 0.04, 0xa98463);
  // a broom leaning in the corner, things dropped about the floor
  { const B = P(RW - 0.8, 2.2, 0, 0.3); B('wood', G.cylLo, 0xc89462, L(0.0, 4.2, 0, 0.09, 8.4, 0.09, 0, 0, 0.12), false); B('matte', roundedBox(1.6, 1.2, 0.5, 0.15), 0xd9b25a, L(0.5, 0.6, 0, 1, 1, 1, 0, 0, 0.12), false); B('matte', G.box, 0x8a3b2e, L(0.42, 1.25, 0, 1.0, 0.2, 0.42, 0, 0, 0.12), false); blob(RW - 0.6, 2.2, 0, 1.0, 0.5, 0.4); }
  const bits = (x, y, kind, rot = 0) => {
    const B = P(x, y, 0, rot);
    if (kind === 'button') { B('gloss', G.cyl, 0xe8590c, L(0, 0.04, 0, 0.32, 0.08, 0.32)); for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B('matte', G.cylLo, 0x5c2a0c, L(a * 0.07, 0.085, c * 0.07, 0.035, 0.01, 0.035), false); }
    if (kind === 'coin') { B('metal', G.cyl, 0xd4a548, L(0, 0.03, 0, 0.36, 0.05, 0.36)); B('metal', torus(0.31, 0.02, TAU, 4, 20), 0xc8973a, L(0, 0.055, 0, 1, 1, 1, Math.PI / 2)); }
    if (kind === 'peas') for (let i = 0; i < 4; i++) B('gloss', G.sph, 0x74b816, L(Math.cos(i * 1.9) * 0.35, 0.12, Math.sin(i * 1.9) * 0.3, 0.12));
    if (kind === 'hoops') for (let i = 0; i < 5; i++) B('matte', torus(0.12, 0.05, TAU, 5, 10), [0xf59f00, 0xe8590c, 0xfab005][i % 3], L(Math.cos(i * 2.3) * 0.5, 0.05, Math.sin(i * 2.3) * 0.4, 1, 1, 1, Math.PI / 2 + 0.2 * i));
    if (kind === 'block') { B('gloss', roundedBox(0.9, 0.3, 0.6, 0.06), 0x339af0, L(0, 0.15, 0)); for (const [a, c] of [[-0.22, -0.14], [0.22, -0.14], [-0.22, 0.14], [0.22, 0.14]]) B('gloss', G.cyl, 0x339af0, L(a, 0.34, c, 0.09, 0.08, 0.09)); }
    blob(x, y, 0, 0.45, 0.45, 0.3);
  };
  bits(66, 21, 'button'); bits(45.5, 24, 'coin'); bits(41, 4.5, 'peas'); bits(36.5, 24.8, 'hoops'); bits(87, 4.5, 'block', 0.4); bits(14, 47, 'coin', 1); bits(57, 20, 'hoops', 1); bits(23, 52, 'button', 2);
  // the door to the hall, with a crack of warm light under it
  {
    const dx0 = 62, dx1 = 69, dz = 13;
    box('paint', dx0 - 0.6, 0, 0, dx0, 0.45, dz + 0.6, C.trim); box('paint', dx1, 0, 0, dx1 + 0.6, 0.45, dz + 0.6, C.trim); box('paint', dx0 - 0.6, 0, dz, dx1 + 0.6, 0.45, dz + 0.6, C.trim);
    box('wood', dx0, 0, 0.12, dx1, 0.18, dz, 0xb07a4f);
    for (const [za, zb] of [[1, 5.6], [6.6, 12]]) for (const [xa, xb] of [[dx0 + 0.6, (dx0 + dx1) / 2 - 0.3], [(dx0 + dx1) / 2 + 0.3, dx1 - 0.6]]) rbox('wood', xa, 0.15, za, xb, 0.32, zb, 0.08, 0x9a6640);
    b.add('metal', G.sph, new THREE.Matrix4().compose(v3(dx1 - 0.8, 0.45, 6), _q.identity(), _s.set(0.28, 0.28, 0.28)), PAL.brass, null);
    box('emit', dx0 + 0.1, 0.1, 0, dx1 - 0.1, 0.2, 0.12, 0xffc46b);
    glow((dx0 + dx1) / 2, 1.4, 0, 4.5, 1.6, 0xffb050, 0.8);
  }
  // a clock over the spice shelf, a cross-stitch on the east wall
  const clock = new THREE.Group();
  {
    const cz = 17.5, cxk = 30;
    b.add('wood', G.cyl, new THREE.Matrix4().compose(v3(cxk, RD - 0.2, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), _s.set(2.6, 0.4, 2.6)), 0x8a5a3c, null);
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshStandardMaterial({ map: T.clock, roughness: 0.5 }));
    face.position.copy(v3(cxk, RD - 0.42, cz)); group.add(face);
    clock.position.copy(v3(cxk, RD - 0.48, cz)); group.add(clock);
    const hand = (len, w, col) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.04), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })); m.position.y = len / 2 - 0.2; g.add(m); clock.add(g); return g; };
    clock.userData = { h: hand(1.2, 0.14, 0x2d2a32), m: hand(1.8, 0.09, 0x2d2a32), s: hand(1.9, 0.04, 0xc92a2a) };
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd4a548, metalness: 0.6, roughness: 0.3 })); clock.add(pin);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.8), new THREE.MeshStandardMaterial({ map: labelTex('Home Sweet Home', '#f6efe2', '#b5463a'), roughness: 0.9 }));
    cs.position.copy(v3(RW - 0.32, 40, 13.5)); cs.rotation.y = -Math.PI / 2; group.add(cs);
    rbox('wood', RW - 0.3, 37.8, 11.9, RW - 0.05, 42.2, 15.1, 0.06, 0x8a5a3c);
  }

  // ---- the pendant lamp over the table
  const tb = boxes.find((q) => q[6] === 'table');
  const lampAt = tb ? { x: (tb[0] + tb[3]) / 2, y: (tb[1] + tb[4]) / 2, z: 13.2, top: tb[5] } : { x: 50, y: 35, z: 13, top: 0 };
  {
    const { x, y, z } = lampAt;
    b.add('matte', G.cylLo, new THREE.Matrix4().compose(v3(x, y, (z + 1.3 + CEIL) / 2), _q.identity(), _s.set(0.04, CEIL - z - 1.3, 0.04)), 0x2b2b33, null);
    b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(x, y, z + 1.4), _q.identity(), _s.set(0.25, 0.3, 0.25)), PAL.brass, null);
    b.add('metal', G.cyl, new THREE.Matrix4().compose(v3(x, y, CEIL - 0.1), _q.identity(), _s.set(0.6, 0.2, 0.6)), PAL.brass, null);
    b.add('lamp', PROF.lampShade, new THREE.Matrix4().compose(v3(x, y, z), _q.identity(), _s.set(1, 1, 1)), 0x2f6b5a, null);
    b.add('emit', G.sph, new THREE.Matrix4().compose(v3(x, y, z + 0.25), _q.identity(), _s.set(0.45, 0.45, 0.45)), 0xfff1c8, null);
    glow(x, y, lampAt.top, 6.5, 6.5, 0xffb060, 0.7);
  }
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 7.5, lampAt.z - lampAt.top, 40, 1, true), beamMaterial(0xffc27a, 0.22));
  cone.position.copy(v3(lampAt.x, lampAt.y, (lampAt.z + lampAt.top) / 2)); group.add(cone);
  // dust motes drifting in the lamplight
  const NM = 110, mpos = new Float32Array(NM * 3), mseed = [];
  { const R = rand(61); for (let i = 0; i < NM; i++) mseed.push([R() * TAU, Math.sqrt(R()), R(), R() * TAU, 0.3 + R() * 0.7]); }
  const motesGeo = new THREE.BufferGeometry(); motesGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ map: T.glow, color: 0xffd9a0, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  motes.frustumCulled = false; group.add(motes);

  // ---- the batched meshes
  const shiny = (o) => (env ? { envMap: env, envMapIntensity: o } : {});
  const MATS = {
    paint: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.paintGrain, roughness: 0.55 }), 0.25],
    wood: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.grain, roughness: 0.5 }), 0.22],
    marble: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.marble, roughness: 0.18, ...shiny(0.8) }), 0.07],
    tile: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.tiles, roughness: 0.25, ...shiny(0.6) }), 1 / 2.4],
    paper: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.paper, roughness: 0.95 }), 1 / 6],
    planks: [new THREE.MeshStandardMaterial({ vertexColors: true, map: T.planks, roughness: 0.42 }), 1 / 8],
    matte: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 0],
    satin: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 0],
    fabric: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 0],
    gloss: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, ...shiny(0.9) }), 0],
    metal: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, ...shiny(1.2) }), 0],
    lamp: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide, emissive: 0x6b4a20, emissiveIntensity: 0.25, ...shiny(0.7) }), 0],
    water: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85, ...shiny(1.2) }), 0],
    glass: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false, ...shiny(1.5) }), 0],
    emit: [new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 0],
    ceiling: [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 0],
  };
  for (const [key, [mat, tri]] of Object.entries(MATS)) for (const [batch, casts] of [[b, true], [d, false]]) for (const cell of batch.cells(key)) {
    const geo = batch.geometry(cell, tri);
    const m = new THREE.Mesh(geo, mat); m.name = cell;
    m.castShadow = casts && !['emit', 'glass', 'water', 'paper', 'planks', 'tile', 'ceiling', 'lamp'].includes(key);
    m.receiveShadow = key !== 'emit';
    if (key === 'glass') m.renderOrder = 2;
    group.add(m);
  }
  const bg = blobs.geometry('blob', 0, true);
  if (bg) { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: T.blob, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0x1a0d10 })); m.renderOrder = 1; group.add(m); }
  const gg = glows.geometry('glow', 0, true);
  const glowMesh = gg ? new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: T.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })) : null;
  if (glowMesh) { glowMesh.renderOrder = 1; group.add(glowMesh); }

  // per frame: the clock ticks, the dust drifts, the lamp's glow follows the lights
  return {
    lampAt,
    update(t, on) {
      const now = 23 * 3600 + 52 * 60 + t;   // nearly midnight
      clock.userData.s.rotation.z = -((now % 60) / 60) * TAU;
      clock.userData.m.rotation.z = -((now / 60) % 60 / 60) * TAU;
      clock.userData.h.rotation.z = -((now / 3600) % 12 / 12) * TAU;
      motes.visible = cone.visible = on > 0.05;
      cone.material.uniforms.strength.value = 0.22 * on;
      if (glowMesh) glowMesh.material.opacity = 0.25 + 0.75 * on;
      if (!motes.visible) return;
      const h = lampAt.z - lampAt.top;
      for (let i = 0; i < NM; i++) {
        const [a0, r0, z0, ph, sp] = mseed[i];
        const zz = ((z0 + t * 0.012 * sp) % 1);
        const rad = r0 * (1.4 + (1 - zz) * 5.5) * 0.85;
        const a = a0 + t * 0.05 * sp + Math.sin(t * 0.3 + ph) * 0.2;
        mpos[i * 3] = lampAt.x + Math.cos(a) * rad;   // (three's axes: x, z up, -y)
        mpos[i * 3 + 1] = lampAt.top + 0.4 + zz * (h - 0.8) + Math.sin(t * 0.7 + ph) * 0.15;
        mpos[i * 3 + 2] = -(lampAt.y + Math.sin(a) * rad);
      }
      motesGeo.attributes.position.needsUpdate = true;
    },
  };
}

// a soft volume of light: brightest where it faces you, fading at its edges and its far end
export function beamMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vH; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; vH = uv.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vV; varying float vH; void main() { float f = abs(dot(normalize(vN), normalize(vV))); f = f * f; float a = f * strength * (0.25 + 0.75 * vH) * smoothstep(0.0, 0.25, vH); gl_FragColor = vec4(color, a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

// a small room of lights to reflect in the shiny things (a warm lamp, the blue window)
export function makeEnv(renderer) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x2a1d22);
  const add = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, y, z); sc.add(m); };
  add(40, 1, 40, 0, -6, 0, 0x6b4a32);          // the warm floor
  add(6, 1, 6, 0, 8, 0, 0xffd29a);              // the lamp
  add(10, 6, 1, 0, 2, -14, 0x3a4c8a);           // the window
  add(1, 6, 14, 14, 1, 0, 0xc9b49a);            // walls
  add(1, 6, 14, -14, 1, 0, 0xb59c84);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.04);
  pm.dispose();
  return rt.texture;
}
