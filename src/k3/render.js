// The Kitchen in 3D, drawn with three.js. Only reads the sim. Split screen, a camera
// behind each of you (Sugar left, Spice right), like It Takes Two. Sim coordinates
// (x east, y north, z up) map to three's (x, z up, -y).
//
// A cosy kitchen at night, toy-sized: the room and everything on its counters is built
// once (props.js, merged into a few meshes), the living things are pooled (actors.js).
import * as THREE from '../vendor/three/three.module.min.js';
import { K, lights, queenOf } from './sim.js';
import { buildKitchen, makeEnv, glowTex, blobTex, puffTex, vignetteTex } from './props.js';
import { makePlayer, animatePlayer, makeAnt, animateAnt, makeNest, makeCake, animateCake, makeKettle, animateKettle, makeSprinkle, animateSprinkle, makeHole } from './actors.js';

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const TAU = Math.PI * 2;
const CEIL = 28;

export function createK3View(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // once a frame, shared by both halves
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1420);
  scene.fog = new THREE.Fog(0x24181f, 70, 170);
  const T = { glow: glowTex(), blob: blobTex(), puff: puffTex(), env: makeEnv(renderer) };

  // lights: a warm key from above (the one shadow), cool moonlight from the window, a
  // pendant lamp over the table, a soft fill; fires for the dark
  const hemi = new THREE.HemisphereLight(0xffe2c4, 0x3b2a33, 0.6); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd7a8, 1.55);
  key.position.copy(v3(30, 12, 80)); key.target.position.copy(v3(50, 35, 0));
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  Object.assign(key.shadow.camera, { left: -72, right: 72, top: 62, bottom: -62, near: 10, far: 190 });
  scene.add(key, key.target);
  const moon = new THREE.DirectionalLight(0x8ea6ff, 0.6);
  moon.position.copy(v3(56, 120, 75)); moon.target.position.copy(v3(56, 40, 0)); scene.add(moon, moon.target);
  const lamp = new THREE.PointLight(0xffb066, 120, 70, 1.5); scene.add(lamp);
  const fires = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff8c2a, 0, 9, 1.5); scene.add(l); return l; });

  const built = { boxes: null, room: null };
  const statics = new THREE.Group(); scene.add(statics);
  function buildRoom(s) {
    built.boxes = s.boxes;
    statics.clear();
    built.room = buildKitchen(s, statics, T.env);
    const la = built.room.lampAt;
    lamp.position.copy(v3(la.x, la.y, la.z - 0.2));
  }

  // ---------------------------------------------------------------- pooled things
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
  // soft contact shadows under everything that moves
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: T.blob, color: 0x1a0d10, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  function blob(key, x, y, z, r, k = 1) {
    const m = get(`bl:${key}`, () => { const q = new THREE.Mesh(blobGeo, blobMat); q.renderOrder = 1; return q; });
    m.position.set(x, z + 0.02, -y); m.scale.set(r * 2 * k, 1, r * 2 * k);
  }
  // syrup puddles: a wobbly round, glossy
  const puddleGeo = (() => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, r = 1 + 0.08 * Math.sin(a * 3) + 0.05 * Math.sin(a * 7 + 1); if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(r, 0); }
    return new THREE.ShapeGeometry(sh, 2).rotateX(-Math.PI / 2);
  })();
  const puddleMat = std(0xe8590c, { roughness: 0.05, metalness: 0.15, envMap: T.env, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const burnMat = std(0x7a3b10, { emissive: 0xff7b00, emissiveIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const flameMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xff9a2a, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xfff3a0, blending: THREE.AdditiveBlending, depthWrite: false });
  const syrupMat = std(0xe8590c, { roughness: 0.08, envMap: T.env, envMapIntensity: 1.2 });
  const blastMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false });
  const syrupGeo = new THREE.SphereGeometry(0.17, 12, 10);
  function makeSign() {
    const q = new THREE.Group(), wood = std(0x8a5a3c, { roughness: 0.7 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 8), wood); post.position.y = 0.6; post.castShadow = true; q.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.08), std(0xd9a066, { roughness: 0.7 })); board.position.y = 1.3; board.castShadow = true; q.add(board);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), std(0xfdf6e3, { roughness: 0.9 })); card.position.set(0, 1.3, 0.045); q.add(card);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), std(0xff6b9d)); dot.position.set(0, 1.3, 0.05); q.add(dot);
    return q;
  }

  // ---------------------------------------------------------------- per-frame
  const cams = [0, 1].map(() => ({ cam: new THREE.PerspectiveCamera(60, 1, 0.1, 220), x: 0, y: 0, z: 0, init: false }));
  let lastT = 0, darkK = 0;
  function sync(s, t, fx) {
    if (built.boxes !== s.boxes) buildRoom(s);
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    used.clear();
    // the dark: the lamp and the key go down (fading), the moon stays, fires come up
    darkK += ((s.dark ? 1 : 0) - darkK) * Math.min(1, dt * 2.5);
    const on = 1 - darkK;
    hemi.intensity = 0.15 + 0.45 * on; key.intensity = 0.12 + 1.43 * on; lamp.intensity = 120 * on * (1 + Math.sin(t * 2.1) * 0.01);
    moon.intensity = 0.6 + 0.25 * darkK;
    renderer.toneMappingExposure = 1.08 + darkK * 0.15;
    const ls = lights(s).filter((l) => l[3] > 3.5);
    fires.forEach((l, i) => { const f = ls[i]; l.intensity = f ? 30 + Math.sin(t * 17 + i) * 6 : 0; if (f) l.position.copy(v3(f[0], f[1], f[2] + 0.6)); });
    built.room.update(t, on);

    for (const p of s.players) {
      const g = get(`p${p.id}`, () => makePlayer(p.id, T));
      g.position.set(p.x, p.z, -p.y);
      animatePlayer(g, p, t, dt);
      g.visible = !p.down && !(p.hurt > 0 && Math.floor(t * 16) % 3 === 0);
      if (!p.down) { const gz = groundBelow(s, p), h = Math.max(0, p.z - gz); blob(`p${p.id}`, p.x, p.y, gz, 0.42, Math.max(0.35, 1 - h / 7)); }
    }
    for (const e of s.ents) {
      if (e.dead) continue;
      if (e.type === 'ant') {
        const g = get(`a${e.i}`, () => makeAnt(e.kind, 1, T));
        g.position.set(e.x, e.z, -e.y);
        animateAnt(g, e, t, dt);
        const sc = g.userData.s;
        blob(`a${e.i}`, e.x, e.y, e.z, 0.42 * sc, Math.max(0.4, 1 - (e.hz || 0) / 4));
      } else if (e.type === 'nest') {
        const g = get(`n${e.i}`, () => makeNest(T));
        g.position.set(e.x, e.z, -e.y);
        g.userData.coat.visible = e.coat > 0; g.userData.coat.material.opacity = 0.2 + e.coat * 0.15;
        const k = 0.7 + 0.3 * e.hp / e.max, pulse = 1 + Math.sin(t * 2 + e.i) * 0.015;
        g.scale.set(k * pulse, k / pulse, k * pulse);
        blob(`n${e.i}`, e.x, e.y, e.z, 1.6 * k);
      } else if (e.type === 'queen') {
        const g = get('queen', () => makeAnt('queen', 3.2, T));
        g.position.set(e.x, e.z, -e.y);
        const tgt = s.players.find((p) => p.hp > 0) || s.players[0];
        const fx = e.state === 'charge' || e.state === 'aim' ? e.tx - e.x : tgt.x - e.x, fy = e.state === 'charge' || e.state === 'aim' ? e.ty - e.y : tgt.y - e.y;
        animateAnt(g, { ...e, vx: e.state === 'sleep' ? 0 : fx * 0.01, vy: e.state === 'sleep' ? 0 : fy * 0.01, fx, fy }, t, dt);
        if (e.state === 'sleep') { g.userData.sq.scale.y = g.userData.s * (1 + Math.sin(t * 1.6) * 0.03); }
        g.position.x += e.state === 'aim' ? Math.sin(t * 60) * 0.08 : 0;
        blob('queen', e.x, e.y, e.z, 1.5);
      } else if (e.type === 'cake') {
        const g = get('cake', () => makeCake(T)); g.position.set(e.x, e.z, -e.y); animateCake(g, t);
        blob('cake', e.x, e.y, e.z, 2.6);
      } else if (e.type === 'kettle') {
        const g = get(`k${e.i}`, () => makeKettle(T)); g.position.set(e.x, e.z, -e.y);
        animateKettle(g, e, t, dt);
        blob(`k${e.i}`, e.x, e.y, e.z, 1.3);
      } else if (e.type === 'sprinkle') {
        if (e.got) continue;
        const g = get(`sp${e.i}`, () => makeSprinkle(e.i, T)); g.position.set(e.x, e.z, -e.y);
        animateSprinkle(g, t);
      } else if (e.type === 'hole') {
        const g = get(`h${e.i}`, () => makeHole(e, s.room));
        g.position.set(g.userData.x, e.z || 0, -g.userData.y); g.rotation.y = g.userData.rot;
      } else if (e.type === 'sign') {
        const g = get(`s${e.i}`, makeSign);
        g.position.set(e.x, e.z, -e.y);
        blob(`s${e.i}`, e.x, e.y, e.z, 0.35);
      } else if (e.type === 'gallery') {
        const g = get(`g${e.i}`, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 32), std(0xff6b9d, { emissive: 0x551133 })); const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), std(0xffd43b, { emissive: 0x664400 })); r.rotation.x = Math.PI / 2; r.position.y = 0.04; m.add(r); return m; });
        g.position.set(e.x, e.z + 0.05, -e.y);
        for (const [k, tg] of (e.targets || []).entries()) {
          const m = get(`gt${e.i}:${k}`, () => new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), std(0xffffff, { emissiveIntensity: 0.4 })));
          const c = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xff922b][tg.c];
          m.material.color.setHex(c); m.material.emissive.setHex(c);
          m.position.set(tg.x, tg.z, -tg.y); m.rotation.z = t * 3 + tg.c;
        }
      }
    }
    s.puddles.forEach((pd, k) => {
      const m = get(`pd${k}`, () => { const q = new THREE.Mesh(puddleGeo, puddleMat); q.receiveShadow = true; return q; });
      m.material = pd.burn > 0 ? burnMat : puddleMat;
      m.position.set(pd.x, pd.z + 0.03, -pd.y); m.scale.set(K.PUDDLE_R, 1, K.PUDDLE_R * 0.88); m.rotation.y = k * 1.3;
      if (pd.burn > 0) for (let f = 0; f < 3; f++) {
        const fl = get(`pf${k}:${f}`, () => new THREE.Sprite(flameMat));
        const a = t * 2 + f * 2.1;
        fl.position.set(pd.x + Math.cos(a) * 0.4, pd.z + 0.5 + Math.sin(t * 13 + f) * 0.15, -(pd.y + Math.sin(a) * 0.4));
        const sc = (0.9 + 0.3 * Math.sin(t * 15 + f)) * Math.min(1, pd.burn);
        fl.scale.set(sc, sc * 1.5, 1);
      }
    });
    s.shots.forEach((b, k) => {
      if (b.kind === 'syrup') { const m = get(`sh${k}`, () => new THREE.Mesh(syrupGeo, syrupMat)); m.position.set(b.x, b.z, -b.y); const sp = Math.hypot(b.vx, b.vy, b.vz) || 1; m.scale.set(1, 1, 1); m.lookAt(b.x + b.vx / sp, b.z + b.vz / sp, -(b.y + b.vy / sp)); m.scale.z = 1.35; }
      else { const m = get(`sk${k}`, () => new THREE.Sprite(sparkMat)); m.position.set(b.x, b.z, -b.y); m.scale.set(0.9, 0.9, 1); }
    });
    s.warns.forEach((w, k) => {
      const m = get(`w${k}`, () => new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0x82c91e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
      const f = Math.max(0.05, w.t / w.max);
      m.rotation.x = -Math.PI / 2; m.position.set(w.x, w.z + 0.06, -w.y); m.scale.setScalar(w.r * (0.15 + f * 0.85));
      const d = get(`wd${k}`, () => new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x82c91e, transparent: true, opacity: 0.25, depthWrite: false })));
      d.rotation.x = -Math.PI / 2; d.position.set(w.x, w.z + 0.05, -w.y); d.scale.setScalar(w.r);
    });
    const q = queenOf(s);
    if (q && q.state === 'aim') {
      const m = get('aim', () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })));
      const dx = q.tx - q.x, dy = q.ty - q.y, Ln = Math.sqrt(dx * dx + dy * dy);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(dy, dx));
      m.position.copy(v3(q.x + dx / 2, q.y + dy / 2, q.z + 0.07)); m.scale.set(Ln, q.r * 2, 1);
    }
    // effects from main.js: blasts (a flash, a ball) and sparks of debris
    (fx || []).forEach((f, k) => {
      const a = Math.max(0, f.life / f.max);
      if (f.kind === 'blast') {
        const m = get(`fb${k}`, () => new THREE.Sprite(blastMat.clone()));
        m.position.copy(v3(f.x, f.y, (f.z || 0) + 0.6)); const sc = f.r * (2.2 + (1 - a) * 2.5); m.scale.set(sc, sc, 1); m.material.opacity = a;
      } else {
        const m = get(`fd${k}`, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false })));
        m.material.color.set(f.color); m.material.opacity = a;
        m.position.copy(v3(f.x, f.y, (f.z || 0) + 0.5)); m.scale.setScalar(0.3);
      }
    });
    for (const [k, o] of pool) if (!used.has(k)) o.visible = false;
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
    const RW = s.room?.w ?? 100, RD = s.room?.d ?? 70;
    const tx = Math.max(0.8, Math.min(RW - 0.8, p.x - p.cx * back)), ty = Math.max(0.8, Math.min(RD - 0.8, p.y - p.cy * back));
    let tz = p.z + up;
    for (let k = 1; k <= 14; k++) {
      const u = k / 14, x = p.x + (tx - p.x) * u, y = p.y + (ty - p.y) * u;
      for (const b of s.boxes) {
        if (b[6] === 'floor' || x < b[0] - 0.3 || x > b[3] + 0.3 || y < b[1] - 0.3 || y > b[4] + 0.3) continue;
        const need = b[5] + 1.2 - (p.z + 1) + (p.z + 1);   // clear the top of what's between
        if (b[5] < 30 && p.z + 1 + (tz - p.z - 1) * u < b[5] + 0.8) tz = Math.max(tz, p.z + 1 + (b[5] + 0.8 - p.z - 1) / u, need);
      }
    }
    tz = Math.min(tz, p.z + 12, CEIL - 1);
    const a = c.init ? 0.12 : 1; c.init = true;
    c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.z += (tz - c.z) * a;
    c.cam.position.set(c.x, c.z, -c.y);
    c.cam.lookAt(p.x + p.cx * 1.5, p.z + 0.8, -(p.y + p.cy * 1.5));
    c.cam.aspect = aspect; c.cam.fov = 62 + punch * 4; c.cam.updateProjectionMatrix();
  }

  // a soft dark vignette over each half
  const vigScene = new THREE.Scene(), vigCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  vigScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: vignetteTex(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));

  function draw(s, W, H, t, fx, punch = 0) {
    if (canvas.width !== Math.round(W * renderer.getPixelRatio()) || canvas.height !== Math.round(H * renderer.getPixelRatio())) renderer.setSize(W, H, false);
    sync(s, t, fx);
    renderer.shadowMap.needsUpdate = true;
    renderer.setScissorTest(true);
    const half = Math.floor(W / 2);
    for (let i = 0; i < 2; i++) {
      const x = i ? half : 0, w = i ? W - half : half;
      aimCam(s, cams[i], s.players[i], w / H, punch);
      renderer.setViewport(x, 0, w, H); renderer.setScissor(x, 0, w, H);
      renderer.render(scene, cams[i].cam);
      renderer.autoClear = false; renderer.render(vigScene, vigCam); renderer.autoClear = true;
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
