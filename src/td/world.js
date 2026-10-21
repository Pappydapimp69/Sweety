// The top-down world: regions in a 3 x 3 ring around the Plaza, 34 x 26 tiles each.
//
//   Attic     Rooftops   Clock
//   Night     PLAZA      Home
//   Workshop  Meadow     (beach)
//
// You go round it: the Meadow (south of the Plaza) is open from the start; each
// region's heart opens the gate to the next. Stamped with small helpers so things
// are placed by coordinate. Tiles: see td/sim.js.

export const RW = 34, RH = 26;
const W = RW * 3, H = RH * 3;
const g = Array.from({ length: H }, () => Array(W).fill('#'));
const ents = [];
const rect = (x0, y0, x1, y1, c = '.') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c; };
const put = (x, y, str) => { for (let i = 0; i < str.length; i++) g[y][x + i] = str[i]; };
const ent = (e) => ents.push(e);
const sign = (x, y, text) => ent({ type: 'sign', x, y, text });
const gate = (need, cells) => ent({ type: 'gate', need, cells });
const cellsRect = (x0, y0, x1, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };

export const REGIONS = [
  { id: 'meadow', name: 'The Meadow', col: 1, row: 2, sugar: 'vine', spice: 'shove', style: 'watercolour' },
  { id: 'workshop', name: 'The Workshop', col: 0, row: 2, sugar: 'nail', spice: 'hammer', style: 'blueprint' },
  { id: 'night', name: 'The Night Wood', col: 0, row: 1, sugar: 'lantern', spice: 'size', style: 'papercut', soon: true },
  { id: 'attic', name: 'The Attic House', col: 0, row: 0, sugar: 'swap', spice: 'grapple', style: 'sepia', soon: true },
  { id: 'sky', name: 'The Rooftops', col: 1, row: 0, sugar: 'gust', spice: 'glide', style: 'cel', soon: true },
  { id: 'clock', name: 'Clock Town', col: 2, row: 0, sugar: 'freeze', spice: 'dash', style: 'brass', soon: true },
  { id: 'home', name: 'Home', col: 2, row: 1, sugar: 'none', spice: 'none', style: 'cosy', soon: true },
];
const origin = (r) => [r.col * RW, r.row * RH];

// ---------------------------------------------------------------- the Plaza (centre): toys
{
  const X = RW, Y = RH;
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2);
  put(X + 15, Y + 19, 'PQ');
  // the fountain in the middle
  rect(X + 15, Y + 11, X + 18, Y + 14, 'w');
  // the race: around the fountain through three flags and back to the start
  ent({ type: 'race', x: X + 16, y: Y + 17, gates: [[X + 23, Y + 12], [X + 16, Y + 6], [X + 9, Y + 12]] });
  // the footy pitch, top left: fenced, a goal mouth in each end
  rect(X + 2, Y + 2, X + 15, Y + 2, '#'); rect(X + 2, Y + 9, X + 15, Y + 9, '#');
  rect(X + 2, Y + 3, X + 2, Y + 8, '#'); rect(X + 15, Y + 3, X + 15, Y + 8, '#');
  rect(X + 2, Y + 5, X + 2, Y + 6); rect(X + 15, Y + 5, X + 15, Y + 6);   // the goal mouths
  rect(X + 8, Y + 9, X + 9, Y + 9);                                        // the way in
  ent({ type: 'ball', x: X + 8.5, y: Y + 5.8, x0: X + 3, x1: X + 15, gy0: Y + 4.6, gy1: Y + 7.4 });
  // the floor piano, bottom right
  put(X + 20, Y + 21, 'KKKKKK'); put(X + 20, Y + 22, 'KKKKKK');
  ent({ type: 'piano', x: X + 20, y: Y + 21 });
  ent({ type: 'bench', x: X + 25, y: Y + 4, w: 3 });
  ent({ type: 'balloons', x: X + 27, y: Y + 15, x1: X + 30, y1: Y + 15 });
  // a star for a little exploring: behind the fountain, a hop over a puddle
  rect(X + 29, Y + 7, X + 31, Y + 9, 'w'); put(X + 30, Y + 8, '$');
  sign(X + 13, Y + 19, 'The Plaza. Stand on the flag together to race round the fountain. Hop onto your own pump to pop your balloon. The Meadow is south.');
  // the way south into the Meadow is open from the start
  rect(X + 15, Y + RH - 1, X + 17, Y + RH - 1);
  rect(X + 15, Y + RH, X + 17, Y + RH);
}

// ---------------------------------------------------------------- the Meadow: Sugar's vines, Spice's shove
{
  const [X, Y] = origin(REGIONS[0]);
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2);
  ent({ type: 'stone', region: 0, x: X + 15, y: Y + 3 });
  sign(X + 13, Y + 2, 'A power stone. Stand on it together.');
  // the river: her vine holds him; his crate holds the plate; the plate brings up her bridge
  rect(X + 1, Y + 8, X + RW - 2, Y + 10, 'w');
  put(X + 24, Y + 8, 'a'); put(X + 24, Y + 9, 'a'); put(X + 24, Y + 10, 'a');
  ent({ type: 'crate', x: X + 20, y: Y + 12 }); put(X + 20, Y + 14, '1');
  sign(X + 11, Y + 6, 'Sugar: face the water and grow a vine. Only Spice can walk on it.');
  // the channel: two wide; one crate in it and the rest is a hop
  rect(X + 26, Y + 11, X + 27, Y + RH - 2, 'w');
  ent({ type: 'crate', x: X + 24, y: Y + 18 });
  sign(X + 22, Y + 16, 'Spice: shove a crate into the water and it becomes a stepping stone. Then hop.');
  ent({ type: 'heart', region: 0, x: X + 30, y: Y + 21 });
  // stars: an island in the pond (his, by her vine), and her closet (his plate on the island)
  rect(X + 3, Y + 14, X + 9, Y + 20, 'w'); put(X + 6, Y + 17, '$'); put(X + 6, Y + 18, '2');
  rect(X + 11, Y + 19, X + 15, Y + 19, '#'); rect(X + 11, Y + 20, X + 11, Y + 24, '#'); rect(X + 15, Y + 20, X + 15, Y + 24, '#');   // down to the region wall: one way in
  put(X + 13, Y + 19, 'B'); put(X + 13, Y + 22, '$'); put(X + 12, Y + 23, '2');
  // west to the Workshop: opens with the Meadow's heart
  gate(0, cellsRect(X - 1, Y + 11, X, Y + 13));
  rect(X - 1, Y + 11, X, Y + 13);
}

// ---------------------------------------------------------------- the Workshop: nails and the hammer
{
  const [X, Y] = origin(REGIONS[1]);
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2);
  ent({ type: 'stone', region: 1, x: X + 28, y: Y + 11 });
  // rocks across the way: the hammer
  rect(X + 21, Y + 1, X + 22, Y + RH - 2, '#'); put(X + 21, Y + 11, 'rr'); put(X + 21, Y + 12, 'rr'); put(X + 21, Y + 13, 'rr');
  sign(X + 24, Y + 9, 'Spice: hammer the rocks.');
  // a door with its switch up on the far wall: the nail gun
  rect(X + 14, Y + 1, X + 14, Y + RH - 2, '#'); put(X + 14, Y + 11, 'C'); put(X + 14, Y + 12, 'C'); put(X + 14, Y + 13, 'C');
  ent({ type: 'switch', g: 3, x: X + 18, y: Y + 4 });
  sign(X + 17, Y + 15, 'Sugar: face the switch and fire a nail. It flips the door.');
  // the heart's garden: walled, its door's plate inside; a springboard flings Sugar in
  rect(X + 2, Y + 2, X + 9, Y + 2, '#'); rect(X + 2, Y + 9, X + 9, Y + 9, '#'); rect(X + 2, Y + 3, X + 2, Y + 8, '#'); rect(X + 9, Y + 3, X + 9, Y + 8, '#');
  put(X + 5, Y + 9, 'A'); put(X + 4, Y + 6, '1');
  ent({ type: 'heart', region: 1, x: X + 6, y: Y + 4 });
  ent({ type: 'spring', x: X + 11, y: Y + 5, tx: X + 6, ty: Y + 6 });
  sign(X + 12, Y + 8, 'Sugar on the springboard, Spice hammers it.');
  // stars: a switch-door pocket with rocks inside; a nook only a springboard reaches
  rect(X + 24, Y + 18, X + 31, Y + 18, '#'); rect(X + 24, Y + 19, X + 24, Y + 24, '#'); rect(X + 31, Y + 19, X + 31, Y + 24, '#');   // down to the region wall: one way in
  put(X + 24, Y + 21, 'D'); ent({ type: 'switch', g: 4, x: X + 27, y: Y + 15 });
  rect(X + 27, Y + 19, X + 27, Y + 24, 'r'); put(X + 29, Y + 21, '$');
  rect(X + 2, Y + 16, X + 8, Y + 16, '#'); rect(X + 2, Y + 17, X + 2, Y + 21, '#'); rect(X + 8, Y + 17, X + 8, Y + 21, '#'); rect(X + 2, Y + 22, X + 8, Y + 22, '#');
  put(X + 5, Y + 22, 'B'); put(X + 5, Y + 21, '2'); put(X + 6, Y + 18, '$');   // the plate by the door: step off it into the doorway and it holds
  ent({ type: 'spring', x: X + 5, y: Y + 24, tx: X + 5, ty: Y + 19 });
  // north: the Night Wood, not built yet
  sign(X + 16, Y + 2, 'The Night Wood is north. It isn\'t finished yet.');
}

// the regions still to come: closed off, with a sign at their gate
for (const r of REGIONS.filter((q) => q.soon)) {
  const [X, Y] = origin(r);
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2, 'o');   // nothing there yet
}

const map = g.map((r) => r.join(''));
const zones = [
  { id: 'plaza', name: 'The Plaza', x0: RW, y0: RH, x1: 2 * RW, y1: 2 * RH, style: 'candy' },
  ...REGIONS.map((r, i) => { const [x, y] = origin(r); return { id: r.id, name: r.name, region: i, x0: x, y0: y, x1: x + RW, y1: y + RH, sugar: r.sugar, spice: r.spice, style: r.style }; }),
];

export const WORLD = { id: 'world', name: 'Sweety Island', map, ents, zones, regions: REGIONS };
