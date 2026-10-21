// The Kitchen in 3D, drawn with three.js. Only reads the sim. Split screen, a camera
// behind each of you (Sugar left, Spice right), like It Takes Two. Sim coordinates
// (x east, y north, z up) map to three's (x, z up, -y).
import * as THREE from '../vendor/three/three.module.min.js';
import { K, lights, queenOf } from './sim.js';
import * as C from '../kitchen/config.js';

const COL = { sugar: 0xff6b9d, spice: 0x20c997 };
const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const TAU = Math.PI * 2;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#ffe3ec' : '#fff8f0'; g.fillRect(x * 64, y * 64, 64, 64); }
  g.strokeStyle = 'rgba(190,140,150,0.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64); g.strokeRect(64, 0, 64, 64); g.strokeRect(0, 64, 64, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTexture(base, line) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = line; g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) { g.beginPath(); const x = (i * 37) % 64; g.moveTo(x, 0); g.bezierCurveTo(x + 6, 80, x - 6, 170, x + 3, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createK3View(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1f3d);
  scene.fog = new THREE.Fog(0x2a1f3d, 45, 120);
  const glowTex = glowTexture();

  // lights: a warm lamp over the room, cool moonlight through the window, a soft fill
  const hemi = new THREE.HemisphereLight(0xfff0e6, 0x5a3d55, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(40, 50, 5); sun.target.position.set(50, 0, -35);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 55, bottom: -55, near: 1, far: 160 }); sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight(0xffc078, 60, 40, 1.6); lamp.position.set(50, 14, -35); lamp.distance = 70; scene.add(lamp);
  // a pool of fire lights for the dark
  const fires = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff8c2a, 0, 9, 1.5); scene.add(l); return l; });

  const built = { boxes: null };
  const statics = new THREE.Group(); scene.add(statics);
  function buildRoom(s) {
    built.boxes = s.boxes;
    statics.clear();
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.55 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf6d6e2, roughness: 0.9 }),
      cabinet: new THREE.MeshStandardMaterial({ map: woodTexture('#c98d6a', 'rgba(110,60,40,0.25)'), roughness: 0.7 }),
      marble: new THREE.MeshStandardMaterial({ color: 0xf8f3ee, roughness: 0.25, metalness: 0.05 }),
      table: new THREE.MeshStandardMaterial({ map: woodTexture('#b8804f', 'rgba(90,50,30,0.3)'), roughness: 0.6 }),
      chair: new THREE.MeshStandardMaterial({ color: 0xe0a875, roughness: 0.7 }),
      fridge: new THREE.MeshStandardMaterial({ color: 0xe9f3f7, roughness: 0.3, metalness: 0.2 }),
      stove: new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.3, metalness: 0.4 }),
      stool: new THREE.MeshStandardMaterial({ color: 0x74c0fc, roughness: 0.5 }),
      shelf: new THREE.MeshStandardMaterial({ map: woodTexture('#a0704c', 'rgba(60,35,20,0.3)'), roughness: 0.75 }),
      sink: new THREE.MeshStandardMaterial({ color: 0xced4da, roughness: 0.2, metalness: 0.7 }),
      toaster: new THREE.MeshStandardMaterial({ color: 0xe03131, roughness: 0.25, metalness: 0.4 }),
      breadbin: new THREE.MeshStandardMaterial({ color: 0x5c940d, roughness: 0.5 }),
      tin: new THREE.MeshStandardMaterial({ color: 0x1c7ed6, roughness: 0.3, metalness: 0.5 }),
      cereal: new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.6 }),
      cupboard: new THREE.MeshStandardMaterial({ map: woodTexture('#8c6a50', 'rgba(50,30,20,0.3)'), roughness: 0.8 }),
    };
    for (const b of s.boxes) {
      const [x0, y0, z0, x1, y1, z1, kind] = b;
      if (kind === 'wall') continue;
      const w = x1 - x0, d = y1 - y0, h = z1 - z0;
      const add = (mat, hh = h, base = z0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
        m.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, base + hh / 2));
        m.castShadow = kind !== 'floor'; m.receiveShadow = true;
        statics.add(m);
        return m;
      };
      if (kind === 'floor') { const m = add(mats.floor); m.material.map.repeat.set(w / 2, d / 2); continue; }
      if (kind === 'counter' || kind === 'island') { add(mats.cabinet, h - 0.25); add(mats.marble, 0.25, z1 - 0.25); continue; }
      if (kind === 'table') {   // a tabletop on four legs
        add(mats.table, 0.35, z1 - 0.35);
        for (const [lx, ly] of [[x0 + 0.5, y0 + 0.5], [x1 - 0.5, y0 + 0.5], [x0 + 0.5, y1 - 0.5], [x1 - 0.5, y1 - 0.5]]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, z1 - 0.35, 10), mats.table);
          leg.position.copy(v3(lx, ly, (z1 - 0.35) / 2)); leg.castShadow = true; statics.add(leg);
        }
        continue;
      }
      if (kind === 'stove') {
        add(mats.stove);
        for (const [bx, by] of [[x0 + 2, y0 + 1.6], [x1 - 2, y0 + 1.6], [x0 + 2, y1 - 1.6], [x1 - 2, y1 - 1.6]]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 24), new THREE.MeshStandardMaterial({ color: 0x555566, emissive: 0x330000 }));
          ring.rotation.x = Math.PI / 2; ring.position.copy(v3(bx, by, z1 + 0.05)); statics.add(ring);
        }
        continue;
      }
      if (kind === 'fridge') {
        add(mats.fridge);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), mats.stove);
        handle.position.copy(v3(x0 - 0.2, y0 + 3, 6)); statics.add(handle);
        const h2 = handle.clone(); h2.position.copy(v3(x0 - 0.2, y0 + 3, 2.4)); h2.scale.y = 0.6; statics.add(h2);
        continue;
      }
      add(mats[kind] || mats.cupboard);
    }
    // the back walls, low and tiled pink, with a window of night sky
    const RW = s.room.w, RD = s.room.d;
    for (const [x, y, w, d] of [[RW / 2, RD + 0.2, RW + 2, 0.4], [-0.2, RD / 2, 0.4, RD + 2], [RW + 0.2, RD / 2, 0.4, RD + 2], [RW / 2, -0.2, RW + 2, 0.4]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 16, d), mats.wall); m.position.copy(v3(x, y, 8)); m.receiveShadow = true; statics.add(m);
    }
    const win = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ color: 0x1c2b5a }));
    win.position.copy(v3(60, s.room.d - 0.05, 9)); statics.add(win);
    for (let i = 0; i < 20; i++) { const st = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); st.position.copy(v3(54.5 + ((i * 37) % 110) / 10, s.room.d - 0.1, 6.5 + ((i * 53) % 50) / 10)); statics.add(st); }
  }

  // ---------------------------------------------------------------- characters and things
  const dyn = new THREE.Group(); scene.add(dyn);
  const pool = new Map();   // key -> object, rebuilt as needed
  const used = new Set();
  function get(key, make) {
    let o = pool.get(key);
    if (!o) { o = make(); pool.set(key, o); dyn.add(o); }
    o.visible = true; used.add(key);
    return o;
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
  function makePlayer(id) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.45, 6, 16), std(id ? COL.spice : COL.sugar, { roughness: 0.35 }));
    body.position.y = 0.57; body.castShadow = true; g.add(body);
    for (const sx of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), std(0xffffff)); eye.position.set(sx, 0.72, 0.29); g.add(eye);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), std(0x1a1a2e)); pup.position.set(sx, 0.72, 0.36); g.add(pup);
    }
    const cheek = std(0xff8fab);
    for (const sx of [-0.22, 0.22]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), cheek); c.position.set(sx, 0.62, 0.27); c.scale.z = 0.4; g.add(c); }
    if (id === 0) {   // her bow
      for (const sx of [-0.16, 0.16]) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 12), std(0xe64980)); b.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; b.position.set(sx, 1.08, 0); g.add(b); }
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), std(0xe64980)); k.position.set(0, 1.08, 0); g.add(k);
    } else {   // his hat
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 20), std(0x1e3a5f)); brim.position.y = 1.0; g.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.28, 20), std(0x1e3a5f)); top.position.y = 1.15; g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 20), std(0xffd43b)); band.position.y = 1.06; g.add(band);
    }
    const gun = new THREE.Mesh(id ? new THREE.CylinderGeometry(0.09, 0.12, 0.45, 12) : new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), std(id ? 0xe8590c : 0x868e96));
    gun.rotation.x = Math.PI / 2; gun.position.set(0.32, 0.5, 0.25); g.add(gun);
    if (id === 0) { const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe066, blending: THREE.AdditiveBlending, depthWrite: false })); tip.scale.set(0.6, 0.6, 1); tip.position.set(0.32, 0.5, 0.5); g.add(tip); g.userData.tip = tip; }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; g.userData.shadow = shadow; dyn.add(shadow);
    g.userData.body = body;
    return g;
  }
  function makeAnt(kind, big = 1) {
    const g = new THREE.Group();
    const col = kind === 'soldier' ? 0xc92a2a : kind === 'queen' ? 0x862e9c : 0x3b2a26;
    const m = std(col, { roughness: 0.25, metalness: kind === 'soldier' ? 0.3 : 0.1 });
    const s = (kind === 'soldier' ? 1.25 : 1) * big;
    for (const [z, r] of [[-0.32, 0.25], [0, 0.15], [0.27, 0.19]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r * s, 14, 12), m); b.position.set(0, 0.28 * s, z * s); b.castShadow = true; g.add(b); }
    const legM = std(0x1a1110);
    g.userData.legs = [];
    for (const sx of [-1, 1]) for (const z of [-0.12, 0, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.4 * s, 4), legM);
      leg.position.set(sx * 0.2 * s, 0.15 * s, z * s); leg.rotation.z = sx * 1.0; g.add(leg); g.userData.legs.push(leg);
    }
    for (const sx of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 6, 6), std(0xffffff)); e.position.set(sx * s, 0.34 * s, 0.42 * s); g.add(e); }
    if (kind === 'queen') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.14 * s, 6, 1, true), std(0xffd43b, { metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }));
      crown.position.set(0, 0.5 * s, 0.27 * s); g.add(crown);
    }
    const coat = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 16, 12), std(0xff922b, { transparent: true, opacity: 0.5, roughness: 0.1 }));
    coat.position.y = 0.28 * s; coat.scale.set(1, 0.8, 1.6); g.add(coat); g.userData.coat = coat;
    return g;
  }
  function makeNest() {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), std(0xc08552, { roughness: 0.95 }));
    mound.scale.set(1.1, 0.8, 1.1); mound.castShadow = true; mound.receiveShadow = true; g.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), std(0x1a1110)); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.81; g.add(hole);
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1), std(0xe0b07a)); const a = i * 2.4, r = 0.4 + (i % 4) * 0.2; c.position.set(Math.cos(a) * r, 0.5 - r * 0.3, Math.sin(a) * r); g.add(c); }
    const coat = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 12, 0, TAU, 0, Math.PI / 2), std(0xff922b, { transparent: true, opacity: 0.45, roughness: 0.1 }));
    coat.scale.set(1.1, 0.8, 1.1); g.add(coat); g.userData.coat = coat;
    return g;
  }
  function makeCake() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 1.0, 32), std(0xffffff)); a.position.y = 0.5; a.castShadow = true; g.add(a);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.8, 32), std(0xfcc2d7)); b.position.y = 1.4; b.castShadow = true; g.add(b);
    for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), std(0xff6b9d)); r.position.set(Math.cos(i * 0.63) * 1.4, 1.85, Math.sin(i * 0.63) * 1.4); g.add(r); }
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), std(0xffd43b)); candle.position.y = 2.1; g.add(candle);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false })); flame.scale.set(0.8, 1.1, 1); flame.position.y = 2.55; g.add(flame);
    const light = new THREE.PointLight(0xffb347, 8, 7, 1.8); light.position.y = 2.6; g.add(light);
    return g;
  }
  const puddleGeo = new THREE.CylinderGeometry(1, 1, 0.06, 24);
  const puddleMat = std(0xe8590c, { roughness: 0.08, metalness: 0.1 });
  const burnMat = std(0x7a3b10, { emissive: 0xff7b00, emissiveIntensity: 1.2 });
  const flameMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a2a, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3a0, blending: THREE.AdditiveBlending, depthWrite: false });
  const syrupMat = std(0xe8590c, { roughness: 0.1 });
  const blastMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false });

  // ---------------------------------------------------------------- per-frame

  const cams = [0, 1].map(() => ({ cam: new THREE.PerspectiveCamera(60, 1, 0.1, 200), x: 0, y: 0, z: 0, init: false }));
  let lastT = 0;
  function sync(s, t, fx) {
    if (built.boxes !== s.boxes) buildRoom(s);
    used.clear();
    // the dark: the lamp and the moon go down, fires come up
    const dark = s.dark ? 1 : 0;
    hemi.intensity = 0.9 - dark * 0.75; sun.intensity = 1.6 - dark * 1.45; lamp.intensity = 60 - dark * 58;
    scene.background.setHex(dark ? 0x0d0816 : 0x2a1f3d); scene.fog.color.setHex(dark ? 0x0d0816 : 0x2a1f3d);
    const ls = lights(s).filter((l) => l[3] > 3.5);
    fires.forEach((l, i) => { const f = ls[i]; l.intensity = f ? 30 + Math.sin(t * 17 + i) * 6 : 0; if (f) l.position.copy(v3(f[0], f[1], f[2] + 0.6)); });

    for (const p of s.players) {
      const g = get(`p${p.id}`, () => makePlayer(p.id));
      g.position.copy(v3(p.x, p.y, p.z));
      g.rotation.y = Math.atan2(p.fx, -p.fy);
      const moving = Math.abs(p.vx) + Math.abs(p.vy) > 0.5 && p.ground;
      const b = g.userData.body;
      b.position.y = 0.57 + (moving ? Math.abs(Math.sin(t * 12)) * 0.08 : 0);
      b.scale.set(1, p.ground ? 1 : 1.08, 1);
      g.visible = !p.down && !(p.hurt > 0 && Math.floor(t * 20) % 2 === 0);
      const sh = g.userData.shadow; sh.visible = !p.down; sh.position.copy(v3(p.x, p.y, (p.safe ? groundBelow(s, p) : p.z) + 0.02));
      if (g.userData.tip) g.userData.tip.material.opacity = 0.6 + 0.4 * Math.sin(t * 25);
    }
    for (const e of s.ents) {
      if (e.dead) continue;
      if (e.type === 'ant') {
        const g = get(`a${e.i}`, () => makeAnt(e.kind));
        g.position.copy(v3(e.x, e.y, e.z));
        if (Math.abs(e.vx) + Math.abs(e.vy) > 0.1) g.rotation.y = Math.atan2(e.vx, -e.vy);
        g.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * 1.7) * 0.5; });
        g.userData.coat.visible = e.coat > 0; g.userData.coat.material.opacity = 0.25 + e.coat * 0.15;
      } else if (e.type === 'nest') {
        const g = get(`n${e.i}`, makeNest);
        g.position.copy(v3(e.x, e.y, e.z));
        g.userData.coat.visible = e.coat > 0; g.userData.coat.material.opacity = 0.2 + e.coat * 0.15;
        g.scale.setScalar(0.7 + 0.3 * e.hp / e.max);
      } else if (e.type === 'queen') {
        const g = get('queen', () => makeAnt('queen', 3.2));
        g.position.copy(v3(e.x, e.y, e.z));
        const tgt = s.players.find((p) => p.hp > 0) || s.players[0];
        g.rotation.y = e.state === 'charge' || e.state === 'aim' ? Math.atan2(e.tx - e.x, -(e.ty - e.y)) : Math.atan2(tgt.x - e.x, -(tgt.y - e.y));
        g.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (e.state === 'charge' ? 30 : 6) + i * 1.7) * 0.5; });
        g.userData.coat.visible = e.coat > 0; g.userData.coat.material.opacity = 0.25 + e.coat * 0.15;
        g.position.x += e.state === 'aim' ? Math.sin(t * 60) * 0.08 : 0;
        g.visible = true;
      } else if (e.type === 'cake') {
        const g = get('cake', makeCake); g.position.copy(v3(e.x, e.y, e.z));
      } else if (e.type === 'sign') {
        const g = get(`s${e.i}`, () => {
          const q = new THREE.Group();
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), std(0x6d4c41)); post.position.y = 0.6; q.add(post);
          const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.08), std(0xe9c46a)); board.position.y = 1.3; q.add(board);
          return q;
        });
        g.position.copy(v3(e.x, e.y, e.z));
      } else if (e.type === 'gallery') {
        const g = get(`g${e.i}`, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 24), std(0xff6b9d, { emissive: 0x551133 })); return m; });
        g.position.copy(v3(e.x, e.y, e.z + 0.05));
        for (const [k, tg] of e.targets.entries()) {
          const m = get(`gt${e.i}:${k}`, () => new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), std(0xffffff)));
          m.material.color.setHex([0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xffa94d][tg.c]);
          m.position.copy(v3(tg.x, tg.y, tg.z)); m.rotation.z = t * 3 + tg.c;
        }
      }
    }
    s.puddles.forEach((pd, k) => {
      const m = get(`pd${k}`, () => new THREE.Mesh(puddleGeo, puddleMat));
      m.material = pd.burn > 0 ? burnMat : puddleMat;
      m.position.copy(v3(pd.x, pd.y, pd.z + 0.03)); m.scale.set(K.PUDDLE_R, 1, K.PUDDLE_R * 0.85);
      if (pd.burn > 0) for (let f = 0; f < 3; f++) {
        const fl = get(`pf${k}:${f}`, () => new THREE.Sprite(flameMat));
        const a = t * 2 + f * 2.1;
        fl.position.copy(v3(pd.x + Math.cos(a) * 0.4, pd.y + Math.sin(a) * 0.4, pd.z + 0.5 + Math.sin(t * 13 + f) * 0.15));
        const sc = (0.9 + 0.3 * Math.sin(t * 15 + f)) * Math.min(1, pd.burn);
        fl.scale.set(sc, sc * 1.5, 1);
      }
    });
    s.shots.forEach((b, k) => {
      if (b.kind === 'syrup') { const m = get(`sh${k}`, () => new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), syrupMat)); m.material = syrupMat; m.position.copy(v3(b.x, b.y, b.z)); }
      else { const m = get(`sk${k}`, () => new THREE.Sprite(sparkMat)); m.position.copy(v3(b.x, b.y, b.z)); m.scale.set(0.9, 0.9, 1); }
    });
    s.warns.forEach((w, k) => {
      const m = get(`w${k}`, () => new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0x82c91e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
      const f = Math.max(0.05, w.t / w.max);
      m.rotation.x = -Math.PI / 2; m.position.copy(v3(w.x, w.y, w.z + 0.06)); m.scale.setScalar(w.r * (0.15 + f * 0.85));
      const d = get(`wd${k}`, () => new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x82c91e, transparent: true, opacity: 0.25, depthWrite: false })));
      d.rotation.x = -Math.PI / 2; d.position.copy(v3(w.x, w.y, w.z + 0.05)); d.scale.setScalar(w.r);
    });
    const q = queenOf(s);
    if (q && q.state === 'aim') {
      const m = get('aim', () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })));
      const dx = q.tx - q.x, dy = q.ty - q.y, L = Math.sqrt(dx * dx + dy * dy);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(dy, dx));
      m.position.copy(v3(q.x + dx / 2, q.y + dy / 2, q.z + 0.07)); m.scale.set(L, q.r * 2, 1);
    }
    // effects from main.js: blasts (a flash, a ball) and sparks of debris
    (fx || []).forEach((f, k) => {
      const a = Math.max(0, f.life / f.max);
      if (f.kind === 'blast') {
        const m = get(`fb${k}`, () => new THREE.Sprite(blastMat.clone()));
        m.position.copy(v3(f.x, f.y, (f.z || 0) + 0.6)); const sc = f.r * (2.2 + (1 - a) * 2.5); m.scale.set(sc, sc, 1); m.material.opacity = a;
      } else {
        const m = get(`fd${k}`, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false })));
        m.material.color.set(f.color); m.material.opacity = a;
        m.position.copy(v3(f.x, f.y, (f.z || 0) + 0.5)); m.scale.setScalar(0.3);
      }
    });
    for (const [key, o] of pool) if (!used.has(key)) o.visible = false;
    for (const p of s.players) { const sh = pool.get(`p${p.id}`)?.userData.shadow; if (sh && !used.has(`p${p.id}`)) sh.visible = false; }
    lastT = t;
  }
  function groundBelow(s, p) {
    let best = 0;
    for (const b of s.boxes) if (p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && b[5] <= p.z + 0.05 && b[5] > best) best = b[5];
    return best;
  }

  // a camera behind each of you, pulled in when a wall or counter is in the way
  function aimCam(s, c, p, aspect, punch) {
    // behind and above; when something's in the way, go up over it rather than in close
    const back = 7, up = 3.6;
    const tx = p.x - p.cx * back, ty = p.y - p.cy * back;
    let tz = p.z + up;
    for (let k = 1; k <= 14; k++) {
      const u = k / 14, x = p.x + (tx - p.x) * u, y = p.y + (ty - p.y) * u;
      for (const b of s.boxes) {
        if (b[6] === 'floor' || x < b[0] - 0.3 || x > b[3] + 0.3 || y < b[1] - 0.3 || y > b[4] + 0.3) continue;
        const need = b[5] + 1.2 - (p.z + 1) + (p.z + 1);   // clear the top of what's between
        if (b[5] < 30 && p.z + 1 + (tz - p.z - 1) * u < b[5] + 0.8) tz = Math.max(tz, p.z + 1 + (b[5] + 0.8 - p.z - 1) / u, need);
      }
    }
    tz = Math.min(tz, p.z + 12);
    const a = c.init ? 0.12 : 1; c.init = true;
    c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.z += (tz - c.z) * a;
    c.cam.position.copy(v3(c.x, c.y, c.z));
    c.cam.lookAt(v3(p.x + p.cx * 1.5, p.y + p.cy * 1.5, p.z + 0.8));
    c.cam.aspect = aspect; c.cam.fov = 62 + punch * 4; c.cam.updateProjectionMatrix();
  }

  function draw(s, W, H, t, fx, punch = 0) {
    if (canvas.width !== Math.round(W * renderer.getPixelRatio()) || canvas.height !== Math.round(H * renderer.getPixelRatio())) renderer.setSize(W, H, false);
    sync(s, t, fx);
    renderer.setScissorTest(true);
    const half = Math.floor(W / 2);
    for (let i = 0; i < 2; i++) {
      const x = i ? half : 0, w = i ? W - half : half;
      aimCam(s, cams[i], s.players[i], w / H, punch);
      renderer.setViewport(x, 0, w, H); renderer.setScissor(x, 0, w, H);
      renderer.render(scene, cams[i].cam);
    }
    renderer.setScissorTest(false);
  }
  // where a world point lands on screen in player i's half (for the HUD), or null if behind
  function project(i, x, y, z, W, H) {
    const c = cams[i].cam, v = v3(x, y, z).project(c);
    if (v.z > 1) return null;
    const half = Math.floor(W / 2), w = i ? W - half : half;
    return [(i ? half : 0) + (v.x + 1) / 2 * w, (1 - v.y) / 2 * H];
  }
  return { draw, project };
}
