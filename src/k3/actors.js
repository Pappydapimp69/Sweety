// The Kitchen's moving things, as three.js objects: Sugar and Spice, the ants and
// their queen, nests, the cake, the kettle, sprinkles, holes. Each has a make (built
// once, pooled by render.js) and an animate that only reads the sim's fields.
import * as THREE from '../vendor/three/three.module.min.js';
import { Batch, G, L, between, torus, lathe, rand } from './props.js';

const TAU = Math.PI * 2;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow;
  if (parent) parent.add(m);
  return m;
}
const wrapA = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- Sugar and Spice

const PCOL = [
  { body: 0xff6b9d, belly: 0xffd0df, shoe: 0xd6336c, acc: 0xe64980, mouth: 0x7a1838 },
  { body: 0x20c997, belly: 0xc3f5e4, shoe: 0x0b7285, acc: 0x1e3a5f, mouth: 0x0b4f3c },
];
const capsule = new THREE.CapsuleGeometry(0.34, 0.42, 8, 20);
const armGeo = new THREE.CapsuleGeometry(0.07, 0.13, 4, 10);
export function makePlayer(id, T) {
  const c = PCOL[id];
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const skin = std(c.body, { roughness: 0.32, envMap: T.env, envMapIntensity: 0.5 });
  const body = mesh(capsule, skin, rig, 0, 0.62, 0);
  mesh(G.sph, std(c.belly, { roughness: 0.5 }), rig, 0, 0.47, 0.2, 0.23, 0.24, 0.16);
  // the face
  const face = new THREE.Group(); face.position.set(0, 0.8, 0); rig.add(face);
  const white = std(0xffffff, { roughness: 0.2 }), ink = std(0x1a1a2e, { roughness: 0.2 }), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [], xs = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.125, 0, 0.283); face.add(e); eyes.push(e);
    mesh(G.sph, white, e, 0, 0, 0, 0.085, 0.105, 0.06, false);
    mesh(G.sph, ink, e, sx * -0.008, -0.012, 0.042, 0.05, 0.065, 0.03, false);
    mesh(G.sphLo, shine, e, 0.02, 0.025, 0.07, 0.02, 0.02, 0.01, false);
    const x = new THREE.Group(); x.position.copy(e.position); x.position.z += 0.04; face.add(x); xs.push(x); x.visible = false;
    for (const r of [0.75, -0.75]) { const bar = mesh(G.box, ink, x, 0, 0, 0, 0.15, 0.032, 0.03, false); bar.rotation.z = r; }
  }
  const smile = mesh(torus(0.055, 0.016, Math.PI, 6, 12), std(c.mouth), face, 0, -0.11, 0.315, 1, 1, 1, false); smile.rotation.z = Math.PI;
  const ouch = mesh(G.sph, std(c.mouth), face, 0, -0.14, 0.31, 0.045, 0.06, 0.03, false); ouch.visible = false;
  const cheek = std(0xff8fab, { roughness: 0.6 });
  for (const sx of [-1, 1]) mesh(G.sph, cheek, face, sx * 0.215, -0.08, 0.25, 0.055, 0.035, 0.025, false).rotation.y = sx * 0.6;
  // feet and stubby arms
  const shoe = std(c.shoe, { roughness: 0.4 }), feet = [], arms = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Group(); f.position.set(sx * 0.15, 0, 0.03); rig.add(f); feet.push(f);
    mesh(G.sph, shoe, f, 0, 0.07, 0.05, 0.12, 0.08, 0.17);
    const a = new THREE.Group(); a.position.set(sx * 0.3, 0.6, 0.04); rig.add(a); arms.push(a);
    mesh(armGeo, skin, a, 0, -0.12, 0);
    mesh(G.sph, std(c.belly, { roughness: 0.5 }), a, 0, -0.24, 0, 0.08);
    a.rotation.set(-1.2, 0, -sx * 0.35);
  }
  // the gun, held out in front
  const gun = new THREE.Group(); gun.position.set(0.1, 0.48, 0.42); rig.add(gun);
  let tip = null;
  if (id === 0) {   // a sparkler wand
    mesh(G.cyl, std(0xfcc2d7), gun, 0, 0, -0.05, 0.045, 0.18, 0.045).rotation.x = Math.PI / 2;
    mesh(G.cyl, std(0xced4da, { metalness: 0.7, roughness: 0.3, envMap: T.env }), gun, 0, 0, 0.15, 0.022, 0.32, 0.022).rotation.x = Math.PI / 2;
    for (let k = 0; k < 5; k++) { const cn = mesh(G.cone, std(0xffd43b, { emissive: 0xffa94d, emissiveIntensity: 0.6 }), gun, Math.sin(k * TAU / 5) * 0.06, Math.cos(k * TAU / 5) * 0.06, 0.33, 0.035, 0.09, 0.03, false); cn.rotation.z = -k * TAU / 5; }
    tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffe066, blending: THREE.AdditiveBlending, depthWrite: false }));
    tip.scale.set(0.6, 0.6, 1); tip.position.set(0, 0, 0.36); gun.add(tip);
  } else {   // a squeezy syrup bottle
    mesh(G.cyl, std(0xe8590c, { roughness: 0.15, envMap: T.env, envMapIntensity: 0.8 }), gun, 0, 0, 0, 0.1, 0.32, 0.1).rotation.x = Math.PI / 2;
    mesh(G.cyl, std(0xfff3bf), gun, 0, 0, 0.01, 0.103, 0.14, 0.103).rotation.x = Math.PI / 2;
    mesh(G.cone, std(0xc92a2a), gun, 0, 0, 0.24, 0.08, 0.16, 0.08).rotation.x = Math.PI / 2;
  }
  // her bow, his hat
  if (id === 0) {
    const bow = new THREE.Group(); bow.position.set(0.1, 1.1, 0.02); bow.rotation.set(0, 0, -0.35); rig.add(bow);
    const ribbon = std(c.acc, { roughness: 0.35 });
    for (const sx of [-1, 1]) { const l = mesh(G.sph, ribbon, bow, sx * 0.13, 0, 0, 0.14, 0.1, 0.07); l.rotation.z = sx * 0.35; const t = mesh(G.cone, ribbon, bow, sx * 0.06, -0.1, 0, 0.04, 0.14, 0.025); t.rotation.z = sx * 0.4 + Math.PI; }
    mesh(G.sph, ribbon, bow, 0, 0, 0.01, 0.06);
    g.userData.hat = bow;
  } else {
    const hat = new THREE.Group(); hat.position.set(0, 0.98, 0); hat.rotation.z = 0.12; rig.add(hat);
    const felt = std(c.acc, { roughness: 0.6 });
    mesh(G.cyl, felt, hat, 0, 0.02, 0, 0.36, 0.05, 0.36);
    mesh(G.cyl, felt, hat, 0, 0.17, 0, 0.22, 0.28, 0.22);
    mesh(G.cyl, std(0xffd43b, { roughness: 0.4 }), hat, 0, 0.08, 0, 0.225, 0.06, 0.225);
    g.userData.hat = hat;
  }
  Object.assign(g.userData, { rig, body, eyes, xs, smile, ouch, feet, arms, gun, tip, yaw: 0, phase: 0, land: 0, lastVz: 0, wasGround: true, init: false });
  return g;
}

export function animatePlayer(g, p, t, dt) {
  const u = g.userData;
  const want = Math.atan2(p.fx, -p.fy);
  if (!u.init) { u.yaw = want; u.init = true; }
  u.yaw += wrapA(want - u.yaw) * Math.min(1, dt * 16);
  g.rotation.y = u.yaw;
  const sp = Math.hypot(p.vx, p.vy), moving = sp > 0.6 && p.ground;
  if (moving) u.phase += sp * dt * 2.4;
  // a squash on landing, a stretch in the air
  if (!p.ground) u.lastVz = p.vz;
  if (p.ground && !u.wasGround) u.land = Math.min(1, Math.max(0.25, -u.lastVz / 18));
  u.wasGround = p.ground;
  u.land = Math.max(0, u.land - dt * 4.5);
  let sy = 1, sxz = 1;
  if (!p.ground) { const k = Math.min(0.18, Math.abs(p.vz) / 70); sy = 1 + k; sxz = 1 - k * 0.55; }
  else if (u.land > 0) { const k = u.land, sq = 0.3 * k * Math.cos((1 - k) * Math.PI * 1.5); sy = 1 - sq; sxz = 1 + sq * 0.6; }
  u.rig.scale.set(sxz, sy, sxz);
  // walking: feet step, the body bobs and leans, the arms swing a little
  const ph = u.phase;
  for (let i = 0; i < 2; i++) {
    const f = u.feet[i], s = Math.sin(ph + i * Math.PI), lift = Math.max(0, Math.cos(ph + i * Math.PI));
    if (moving) { f.position.z = 0.03 + s * 0.14; f.position.y = lift * 0.08; f.rotation.x = -s * 0.3; }
    else if (!p.ground) { f.position.z = -0.02 + i * 0.06; f.position.y = 0.02; f.rotation.x = 0.4; }
    else { f.position.z += (0.03 - f.position.z) * Math.min(1, dt * 12); f.position.y = 0; f.rotation.x = 0; }
    const a = u.arms[i];
    a.rotation.x = -1.2 + (moving ? Math.sin(ph + i * Math.PI) * 0.12 : 0) + (!p.ground ? -0.35 : 0);
  }
  u.rig.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 3 + p.id) * 0.008;
  u.rig.rotation.x = moving ? 0.1 : 0;
  u.gun.position.y = 0.48 + (moving ? Math.sin(ph * 2) * 0.015 : 0);
  if (u.hat) u.hat.rotation.x = (!p.ground ? -Math.min(0.25, p.vz * 0.02) : 0) + (moving ? Math.sin(ph * 2) * 0.04 : 0);
  // the face: blinks, and an X-eyed wince while hurt
  const hurt = p.hurt > 0;
  const bt = (t + p.id * 1.3) % 3.6, blink = bt < 0.12 ? 0.12 : 1;
  for (let i = 0; i < 2; i++) { u.eyes[i].visible = !hurt; u.xs[i].visible = hurt; u.eyes[i].scale.y = blink; }
  u.smile.visible = !hurt; u.ouch.visible = hurt;
  if (u.tip) { u.tip.material.opacity = 0.6 + 0.4 * Math.sin(t * 25); const k = 0.5 + 0.15 * Math.sin(t * 31); u.tip.scale.set(k, k, 1); }
}

// ---------------------------------------------------------------- ants

const ANT = {
  ant: { col: 0x3b2a26, s: 1 },
  soldier: { col: 0xb8322a, s: 1.3 },
  jumper: { col: 0x5ba33a, s: 1.05 },
  carrier: { col: 0x4a3426, s: 1.05 },
  queen: { col: 0x7b3a9a, s: 1 },
};
const darker = (c, k = 0.55) => new THREE.Color(c).multiplyScalar(k);
const antCache = new Map();
function antGeos(kind) {
  if (antCache.has(kind)) return antCache.get(kind);
  const col = (ANT[kind] || ANT.ant).col, dk = darker(col), b = new Batch();
  const P = (geo, c, m) => b.add('a', geo === G.sph ? SPH8 : geo, m, c, null);
  P(G.sph, col, L(0, 0.33, -0.33, 0.21, 0.19, 0.27, -0.25));                  // gaster
  for (const z of [-0.24, -0.4]) P(torus(1, 0.09, TAU, 3, 14), dk, L(0, 0.34 - (z + 0.24) * 0.25, z, 0.2, 0.18 - (z === -0.4 ? 0.03 : 0), 0.2, -0.25));
  P(G.sph, col, L(0, 0.27, -0.08, 0.065, 0.065, 0.07));                         // petiole
  P(G.sph, col, L(0, 0.28, 0.05, 0.11, 0.1, 0.15));                             // thorax
  P(G.sph, col, L(0, 0.35, 0.27, 0.17, 0.15, 0.16));                            // head
  P(G.sph, 0xffffff, L(-0.12, 0.38, 0.32, 0.06, 0.012, 0.06, -0.5, 0, 0.4));   // a shine on the head
  for (const sx of [-1, 1]) {
    P(G.sph, 0xffffff, L(sx * 0.085, 0.4, 0.37, 0.062, 0.075, 0.045));          // eyes
    P(G.sph, 0x111111, L(sx * 0.09, 0.392, 0.405, 0.032, 0.042, 0.02));
    const a = V(sx * 0.05, 0.47, 0.33), k = V(sx * 0.13, 0.66, 0.37), tp = V(sx * 0.23, 0.66, 0.58);   // antennae
    P(G.cylLo, dk, between(a, k, 0.016)); P(G.cylLo, dk, between(k, tp, 0.014)); P(G.sphLo, dk, L(tp.x, tp.y, tp.z, 0.032));
    P(G.cone, dk, L(sx * 0.06, 0.28, 0.43, 0.035, 0.17, 0.028, Math.PI / 2, -sx * 0.45, 0));   // mandibles
  }
  if (kind === 'soldier') {   // a helmet, armour bands and angry brows
    P(G.hemi, 0x7a1c1c, L(0, 0.36, 0.25, 0.185, 0.14, 0.175, -0.15));
    P(G.cone, 0x7a1c1c, L(0, 0.52, 0.22, 0.04, 0.12, 0.04, -0.3));
    for (const sx of [-1, 1]) P(G.box, 0x1a0a0a, L(sx * 0.08, 0.475, 0.39, 0.1, 0.028, 0.03, 0, 0, sx * 0.45));
    P(G.sph, 0x8c2020, L(0, 0.34, 0.04, 0.12, 0.1, 0.13));
  }
  if (kind === 'carrier') for (const sx of [-1, 1]) P(G.box, 0x2a1a14, L(sx * 0.08, 0.47, 0.385, 0.08, 0.02, 0.02, 0, 0, -sx * 0.25));
  if (kind === 'queen') {   // a crown of gold with gems, and long lashes
    P(G.cyl, 0xf2c94c, L(0, 0.5, 0.25, 0.1, 0.06, 0.1));
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; P(G.cone, 0xf2c94c, L(Math.sin(a) * 0.085, 0.57, 0.25 + Math.cos(a) * 0.085, 0.025, 0.08, 0.025)); P(G.sphLo, [0xe03131, 0x339af0, 0x51cf66][k % 3], L(Math.sin(a) * 0.1, 0.5, 0.25 + Math.cos(a) * 0.1, 0.018)); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) P(G.box, 0x111111, L(sx * (0.09 + k * 0.02), 0.47 - k * 0.006, 0.39, 0.008, 0.04, 0.008, 0, 0, sx * (-0.3 - k * 0.3)));
  }
  const body = b.geometry('a');
  // legs: thigh up to a knee, shin down to the ground; one per side and position
  const tripods = [new Batch(), new Batch()];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const lb = tripods[(i + (sx > 0 ? 1 : 0)) % 2], dz = [0.16, 0, -0.16][i];
    const at = V(sx * 0.07, 0.27, [0.11, 0.04, -0.03][i]);
    const add = (geo, m) => lb.add('l', geo, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(m), dk, null);
    const hind = kind === 'jumper' && i === 2;
    const knee = hind ? V(sx * 0.16, 0.3, -0.14) : V(sx * 0.2, 0.12, dz * 0.4);
    const foot = hind ? V(sx * 0.27, -0.27, -0.5) : V(sx * 0.33, -0.27, dz);
    add(G.cylLo, between(V(0, 0, 0), knee, hind ? 0.04 : 0.022));
    add(G.sphLo, L(knee.x, knee.y, knee.z, hind ? 0.04 : 0.026));
    add(G.cylLo, between(knee, foot, hind ? 0.022 : 0.018));
    add(G.sphLo, L(foot.x, foot.y + 0.01, foot.z, 0.025, 0.02, 0.035));
  }
  const legs = tripods.map((t) => t.geometry('l'));
  // syrup: a glossy coat and drips that hang and stretch
  const cb = new Batch();
  cb.add('d', G.sph, L(0, 0, 0, 1, 1, 1), 0xffffff, null);
  cb.add('d', G.cone, L(0, 0.9, 0, 0.6, 1.4, 0.6), 0xffffff, null);
  const out = { body, legs, drip: cb.geometry('d') };
  antCache.set(kind, out);
  return out;
}
const coatGeo = new THREE.SphereGeometry(1, 10, 7);
const SPH8 = new THREE.SphereGeometry(1, 8, 6);
const cubeGeo = (() => { const b = new Batch(); b.add('c', G.rb, L(0, 0, 0, 1), 0xffffff, null); return b.geometry('c'); })();
export function makeAnt(kind, big = 1, T = {}) {
  const k = ANT[kind] ? kind : 'ant', geos = antGeos(k), s = (ANT[k].s) * big;
  const g = new THREE.Group(), lift = new THREE.Group(), sq = new THREE.Group();
  g.add(lift); lift.add(sq); sq.scale.setScalar(s);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === 'soldier' ? 0.25 : 0.32, metalness: k === 'soldier' ? 0.25 : 0.05, emissive: 0xffffff, emissiveIntensity: 0, envMap: T.env, envMapIntensity: 0.6 });
  const casts = big > 1;   // small ants make do with their soft blob
  mesh(geos.body, mat, sq, 0, 0, 0, 1, 1, 1, casts);
  const legs = geos.legs.map((geo) => mesh(geo, mat, sq, 0, 0, 0, 1, 1, 1, casts));   // two tripods of legs
  // syrup coat
  const coatMat = new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6, envMap: T.env, envMapIntensity: 1.2, depthWrite: false });
  const coat = new THREE.Group(); sq.add(coat);
  mesh(coatGeo, coatMat, coat, 0, 0.33, -0.33, 0.25, 0.23, 0.31, false).rotation.x = -0.25;
  mesh(coatGeo, coatMat, coat, 0, 0.3, 0.06, 0.15, 0.14, 0.2, false);
  mesh(coatGeo, coatMat, coat, 0, 0.36, 0.27, 0.19, 0.16, 0.18, false);
  const dripMat = new THREE.MeshStandardMaterial({ color: 0xe8590c, roughness: 0.05, envMap: T.env, envMapIntensity: 1.2 });
  const drips = [];
  const R = rand(7);
  for (let i = 0; i < 6; i++) {
    const d = mesh(geos.drip, dripMat, coat, (i % 2 ? 1 : -1) * (0.08 + R() * 0.1), 0.14, -0.45 + i * 0.13, 0.04, 0.04, 0.04, false);
    d.rotation.x = Math.PI; drips.push({ m: d, ph: R() * TAU, y: 0.14 + R() * 0.06 });
  }
  let cube = null, wings = null;
  if (k === 'carrier') {
    cube = mesh(cubeGeo, std(0xffffff, { roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.15 }), sq, 0, 0.36, 0.62, 0.34);
    cube.rotation.set(0.15, 0.3, 0.1);
  }
  if (k === 'queen') {
    wings = [];
    const wm = new THREE.MeshStandardMaterial({ color: 0xe5dbff, roughness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.06, 0.38, 0.02); sq.add(w); mesh(G.sph, wm, w, sx * 0.22, 0.04, -0.22, 0.22, 0.015, 0.42, false).rotation.y = sx * 0.5; wings.push(w); }
  }
  Object.assign(g.userData, { lift, sq, mat, coatMat, coat, drips, legs, cube, wings, s, yaw: 0, init: false, phase: 0, lx: 0, ly: 0, kind: k });
  return g;
}

export function animateAnt(g, e, t, dt, still = false) {
  const u = g.userData;
  const v = Math.hypot(e.vx || 0, e.vy || 0);
  let want = u.yaw;
  if (v > 0.3) want = Math.atan2(e.vx, -e.vy);
  else if (e.fx !== undefined && (e.fx || e.fy)) want = Math.atan2(e.fx, -e.fy);
  if (!u.init) { u.yaw = want; u.init = true; u.lx = e.x; u.ly = e.y; }
  u.yaw += wrapA(want - u.yaw) * Math.min(1, dt * 10);
  g.rotation.y = u.yaw;
  // walk by the ground actually covered
  const moved = Math.hypot(e.x - u.lx, e.y - u.ly); u.lx = e.x; u.ly = e.y;
  u.phase += Math.min(moved, 1) * 9 / u.s + (still ? 0 : 0);
  const air = (e.hz || 0) > 0.01;
  u.legs.forEach((m, i) => {   // the tripods take turns: one swings forward lifted, the other pushes back
    const ph = u.phase + i * Math.PI;
    if (air) { m.position.set(0, 0.05, -0.04); m.scale.set(1, 0.8, 1.15); return; }
    m.position.set(0, Math.max(0, Math.cos(ph)) * 0.04, Math.sin(ph) * 0.07); m.scale.set(1, 1, 1);
  });
  // a jumper crouches, then flies; everything else bobs as it walks
  const crouch = (e.crouch || 0) > 0 ? 1 : 0;
  u.lift.position.y = (e.hz || 0) + (moved > 0.001 && !air ? Math.abs(Math.sin(u.phase)) * 0.03 * u.s : 0);
  u.sq.scale.set(u.s * (1 + crouch * 0.12), u.s * (1 - crouch * 0.25 + (air ? 0.06 : 0)), u.s * (1 - crouch * 0.05 + (air ? 0.08 : 0)));
  u.lift.rotation.x = air ? -0.25 : 0;
  // flashes white when struck
  u.mat.emissiveIntensity = (e.flash || 0) > 0 ? 0.9 : 0;
  // dripping with syrup
  const coat = e.coat || 0;
  u.coat.visible = coat > 0;
  if (coat > 0) {
    u.coatMat.opacity = 0.35 + coat * 0.13;
    u.drips.forEach((d, i) => {
      d.m.visible = i < coat * 2;
      const c = ((t * 0.7 + d.ph / TAU) % 1);
      d.m.scale.set(0.035, 0.035 + c * 0.06, 0.035);
      d.m.position.y = d.y - c * 0.08;
    });
  }
  if (u.cube) { u.cube.visible = !!e.shield; u.cube.position.y = 0.36 + Math.sin(u.phase * 2) * 0.01; }
  if (u.wings) { const f = e.state === 'charge' ? Math.sin(t * 50) * 0.5 : Math.sin(t * 3) * 0.08; u.wings[0].rotation.z = 0.2 + f; u.wings[1].rotation.z = -0.2 - f; }
}

// ---------------------------------------------------------------- nests, the cake

export function makeNest(T) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 2), p = geo.attributes.position, R = rand(13);
  const cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.09 * Math.sin(x * 7 + z * 3) * Math.cos(z * 6 - y * 4) + 0.05 * Math.sin(x * 15 + y * 11);
    x *= n * 1.15; z *= n * 1.15; y = Math.max(0, y) * 0.85 * n;
    const crater = Math.hypot(x, z) < 0.3 ? -0.25 * (1 - Math.hypot(x, z) / 0.3) : 0;
    p.setXYZ(i, x, y + crater, z);
  }
  geo.computeVertexNormals();
  for (let i = 0; i < p.count; i += 3) {   // a crumbly patchwork, darker low and in the hole
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, r = Math.hypot(p.getX(i), p.getZ(i));
    c.setHSL(0.07 + R() * 0.02, 0.45 + R() * 0.15, 0.22 + y * 0.18 + R() * 0.06);
    if (r < 0.32 && y > 0.5) c.setHSL(0.05, 0.4, 0.06);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const b = new Batch();
  b.add('n', geo, new THREE.Matrix4(), null, null);   // its own patchwork colours
  for (let i = 0; i < 22; i++) { const a = R() * TAU, r = 1.0 + R() * 0.7, s = 0.05 + R() * 0.08; b.add('n', G.crumb, L(Math.cos(a) * r, s * 0.5, Math.sin(a) * r, s, s * 0.7, s, R(), R(), R()), [0xb07a4a, 0x8a5a33, 0xd4a373][i % 3], null); }
  for (let i = 0; i < 7; i++) { const a = R() * TAU, r = 0.9 + R() * 0.8; b.add('n', G.rb, L(Math.cos(a) * r, 0.06, Math.sin(a) * r, 0.11, 0.11, 0.11, 0, R() * 3), 0xffffff, null); }
  b.add('n', G.crumb, L(0.55, 0.62, 0.55, 0.16, 0.14, 0.12, 0, 0.5), 0x2a1810, null);   // a side door
  b.add('n', G.cylLo, between(V(-0.5, 0.5, 0.3), V(-1.2, 0.9, 0.7), 0.03), 0x6b4a2e, null);   // a twig
  b.add('n', G.sph, L(-1.2, 0.92, 0.7, 0.16, 0.02, 0.09, 0, 0.7), 0x6aa84f, null);
  const m = mesh(b.geometry('n'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }), g);
  m.receiveShadow = true;
  const coat = mesh(new THREE.SphereGeometry(1.05, 20, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false, envMap: T.env, envMapIntensity: 1.2 }), g, 0, 0, 0, 1.2, 0.85, 1.2, false);
  g.userData.coat = coat;
  return g;
}

export function makeCake(T) {
  const g = new THREE.Group();
  const b = new Batch(), P = (geo, c, m) => b.add('c', geo, m, c, null);
  P(lathe([[0, 0], [2.3, 0], [2.4, 0.05], [2.35, 0.12], [0, 0.1]], 32), 0xf8f9fa, L());   // the cake stand plate
  P(G.cyl, 0xfff4e6, L(0, 0.6, 0, 1.9, 1.0, 1.9));
  P(G.cyl, 0xff8fab, L(0, 0.55, 0, 1.92, 0.12, 1.92));   // a jam layer
  P(G.cyl, 0xffd6e5, L(0, 1.5, 0, 1.4, 0.8, 1.4));
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, h = 0.18 + (i % 3) * 0.1; P(G.sph, 0xffffff, L(Math.cos(a) * 1.88, 1.08 - h * 0.5, Math.sin(a) * 1.88, 0.16, h, 0.12, 0, -a)); }   // icing drips
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, h = 0.12 + (i % 2) * 0.1; P(G.sph, 0xffffff, L(Math.cos(a) * 1.38, 1.88 - h * 0.5, Math.sin(a) * 1.38, 0.13, h, 0.1, 0, -a)); }
  for (let i = 0; i < 10; i++) { const a = i * 0.63; P(G.sph, 0xffffff, L(Math.cos(a) * 1.1, 1.95, Math.sin(a) * 1.1, 0.16, 0.12, 0.16)); P(G.sph, 0xe03131, L(Math.cos(a) * 1.1, 2.1, Math.sin(a) * 1.1, 0.12, 0.15, 0.12)); P(G.cone, 0xe03131, L(Math.cos(a) * 1.1, 2.26, Math.sin(a) * 1.1, 0.1, 0.14, 0.1)); P(G.cone, 0x37b24d, L(Math.cos(a) * 1.1, 2.02, Math.sin(a) * 1.1, 0.1, 0.06, 0.1, Math.PI)); }
  const R = rand(4);
  for (let i = 0; i < 40; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 1.2; P(G.cylLo, [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2][i % 5], L(Math.cos(a) * r, 1.91, Math.sin(a) * r, 0.03, 0.14, 0.03, Math.PI / 2, R() * 3)); }
  for (let i = 0; i < 6; i++) P(G.cyl, i % 2 ? 0xffffff : 0xff6b9d, L(0, 2.0 + i * 0.1, 0, 0.07, 0.1, 0.07));   // a striped candle
  mesh(b.geometry('c'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: 0x5a3020, emissiveIntensity: 0.35 }), g);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false })); flame.scale.set(0.8, 1.1, 1); flame.position.y = 2.8; g.add(flame);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xfff3bf, blending: THREE.AdditiveBlending, depthWrite: false })); core.scale.set(0.25, 0.45, 1); core.position.y = 2.72; g.add(core);
  g.userData = { flame, core };
  return g;
}
export function animateCake(g, t) {
  const u = g.userData, f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.05;
  u.flame.scale.set(0.8 * f, 1.1 * f, 1); u.core.position.x = Math.sin(t * 9) * 0.02;
}

// ---------------------------------------------------------------- the kettle

const STEAM_N = 30;
export function makeKettle(T) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const enamel = std(0xe03131, { roughness: 0.18, envMap: T.env, envMapIntensity: 0.9 }), black = std(0x2b2b33, { roughness: 0.4 }), chrome = std(0xdee2e6, { roughness: 0.2, metalness: 0.9, envMap: T.env, envMapIntensity: 1.2 });
  mesh(lathe([[0, 0], [0.9, 0], [1.0, 0.08], [1.08, 0.5], [1.0, 1.0], [0.7, 1.38], [0.38, 1.5], [0, 1.5]], 28), enamel, body);
  mesh(G.cyl, chrome, body, 0, 0.04, 0, 0.92, 0.08, 0.92);
  mesh(G.cyl, std(0xffffff, { roughness: 0.3 }), body, 0, 0.5, 0, 1.09, 0.1, 1.09);
  const lid = new THREE.Group(); lid.position.y = 1.5; body.add(lid);
  mesh(G.cyl, chrome, lid, 0, 0, 0, 0.4, 0.06, 0.4); mesh(G.sph, black, lid, 0, 0.1, 0, 0.13, 0.11, 0.13);
  const handle = mesh(torus(0.62, 0.075, Math.PI, 8, 18), black, body, 0, 1.3, 0); handle.rotation.y = Math.PI / 2;
  const spout = mesh(G.cyl, enamel, body, 1.12, 0.95, 0, 0.12, 0.85, 0.16); spout.rotation.z = -0.85;
  const whistle = mesh(G.cone, chrome, body, 1.48, 1.25, 0, 0.11, 0.2, 0.11); whistle.rotation.z = -0.85;
  const ring = mesh(torus(1.15, 0.08, TAU, 6, 32), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0 }), g, 0, 0.02, 0, 1, 1, 1, false); ring.rotation.x = Math.PI / 2;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); glow.scale.set(3.5, 1.2, 1); glow.position.y = 0.2; g.add(glow);
  const puffs = [];
  for (let i = 0; i < STEAM_N; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.puff, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false })); g.add(s); puffs.push(s); }
  g.userData = { body, lid, ring, glow, puffs, heat: 0 };
  return g;
}
export function animateKettle(g, k, t, dt) {
  const u = g.userData, st = k.state || 'calm';
  const hot = st === 'steam' ? 1 : st === 'whistle' ? 0.7 : 0;
  u.heat += (hot - u.heat) * Math.min(1, dt * 3);
  u.ring.material.opacity = u.heat * 0.9; u.glow.material.opacity = u.heat * 0.8;
  // whistling: it rattles and the lid chatters
  const rattle = st === 'whistle' ? 1 : st === 'steam' ? 0.3 : 0;
  u.body.rotation.z = Math.sin(t * 55) * 0.03 * rattle; u.body.rotation.x = Math.cos(t * 47) * 0.025 * rattle;
  u.body.position.x = Math.sin(t * 61) * 0.03 * rattle;
  u.lid.position.y = 1.5 + Math.max(0, Math.sin(t * 38)) * 0.07 * rattle;
  // steam: a tall column when it boils (that's the lift), puffs from the spout when it whistles, a wisp at rest
  for (let i = 0; i < STEAM_N; i++) {
    const s = u.puffs[i], m = s.material;
    let x, y, z, sc, a;
    if (st === 'steam') {
      const life = (t * 0.45 + i / STEAM_N) % 1, ang = i * 2.39996 + t * 0.6, r = 0.25 + life * 1.1;
      x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = 1.6 + life * 11.5; sc = 1.0 + life * 1.9;
      a = 0.6 * Math.pow(Math.sin(Math.PI * Math.min(1, life * 1.15)), 0.6) * (1 - life * 0.4);
    } else if (st === 'whistle') {
      const life = (t * 1.6 + i / STEAM_N * 3) % 1;
      x = 1.6 + life * 1.2; y = 1.4 + life * 1.4 + Math.sin(i) * 0.1; z = Math.sin(i * 1.7) * 0.15 * life; sc = 0.25 + life * 0.9; a = i < STEAM_N / 2 ? 0.55 * (1 - life) : 0;
    } else {
      const life = (t * 0.25 + i / STEAM_N * 2) % 1;
      x = 1.55 + life * 0.3 + Math.sin(t + i) * 0.1; y = 1.35 + life * 1.3; z = 0; sc = 0.2 + life * 0.5; a = i < 4 ? 0.18 * (1 - life) : 0;
    }
    s.visible = a > 0.01;
    if (!s.visible) continue;
    s.position.set(x, y, z); s.scale.set(sc, sc, 1); m.opacity = a; s.userData.a = a;
  }
}
// per view: thin out the puffs right in front of that camera, so riding the steam doesn't white out the screen
const _w = new THREE.Vector3();
export function fadeSteamNear(g, cam) {
  for (const s of g.userData.puffs) {
    if (!s.visible) continue;
    const d = s.getWorldPosition(_w).distanceTo(cam.position);
    s.material.opacity = (s.userData.a || 0) * Math.min(1, Math.max(0.08, (d - 1.5) / 5));
  }
}

// ---------------------------------------------------------------- sprinkles, holes

const SPR_COL = [0xff6b9d, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xff922b, 0x20c997];
const sprGeo = new THREE.CapsuleGeometry(0.09, 0.32, 4, 10);
export function makeSprinkle(i, T) {
  const g = new THREE.Group(), col = SPR_COL[i % SPR_COL.length];
  const m = mesh(sprGeo, std(col, { roughness: 0.2, emissive: col, emissiveIntensity: 0.55, envMap: T.env }), g, 0, 0, 0, 1, 1, 1, false);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
  halo.scale.set(1.1, 1.1, 1); g.add(halo);
  const twinkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }));
  twinkle.scale.set(0.3, 0.3, 1); g.add(twinkle);
  g.userData = { m, halo, twinkle, i };
  return g;
}
export function animateSprinkle(g, t) {
  const u = g.userData, ph = u.i * 1.7;
  g.position.y += Math.sin(t * 2.6 + ph) * 0.13;
  u.m.rotation.set(0.6 + Math.sin(t * 1.3 + ph) * 0.3, t * 2.2 + ph, 0.9);
  const k = 1 + Math.sin(t * 4 + ph) * 0.12; u.halo.scale.set(1.1 * k, 1.1 * k, 1);
  const tw = Math.max(0, Math.sin(t * 3.1 + ph * 2)) ** 8;
  u.twinkle.position.set(0.12, 0.2, 0.05); u.twinkle.scale.set(0.15 + tw * 0.5, 0.15 + tw * 0.5, 1); u.twinkle.material.opacity = tw;
}

export function makeHole(e, room) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, 0); shape.lineTo(-0.45, 0.45); shape.absarc(0, 0.45, 0.45, Math.PI, 0, true); shape.lineTo(0.45, 0); shape.lineTo(-0.45, 0);
  const hole = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), new THREE.MeshBasicMaterial({ color: 0x0c0608 }));
  hole.position.z = 0.27; g.add(hole);
  const wood = std(0x8a5a3c, { roughness: 0.6 });
  const arch = mesh(torus(0.5, 0.07, Math.PI, 6, 16), wood, g, 0, 0.45, 0.28, 1, 1, 1, false);
  for (const sx of [-1, 1]) mesh(G.box, wood, g, sx * 0.5, 0.22, 0.28, 0.14, 0.46, 0.1, false);
  const shade = mesh(G.quad, new THREE.MeshBasicMaterial({ map: blobOf(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.6 }), g, 0, 0.012, 0.5, 1.4, 1, 0.8, false);
  // face into the room from the nearest wall
  const W = room?.w ?? 100, D = room?.d ?? 70;
  const d = [[e.x, Math.PI / 2, 0, e.y], [W - e.x, -Math.PI / 2, W, e.y], [e.y, Math.PI, e.x, 0], [D - e.y, 0, e.x, D]].sort((a, b) => a[0] - b[0])[0];
  g.userData = { rot: d[1], x: d[2], y: d[3], arch, shade };
  return g;
}
let _blob = null;
function blobOf() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.8)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}
