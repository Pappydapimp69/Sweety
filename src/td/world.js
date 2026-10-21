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

// ---------------------------------------------------------------- the Meadow: the river
// Its loop is a current. Spice shoves dock crates into it; Sugar holds her vine
// across the still water and ties the crate that reaches its end; only a tied
// crate holds still enough for him to shove it on, into the still water, where it
// sinks into a stepping stone. One stone each side of the current and you both
// hop it. Her vine needs his floating crates; his shove out there needs her tie.
{
  const [X, Y] = origin(REGIONS[0]);
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2);
  ent({ type: 'stone', region: 0, x: X + 15, y: Y + 3 });
  sign(X + 13, Y + 2, 'A power stone. Stand on it together.');
  // north to south: the dock and the moat (row 8), the current (row 9), the berth (row 10)
  rect(X + 10, Y + 8, X + RW - 2, Y + 8, 'w');
  rect(X + 1, Y + 9, X + RW - 2, Y + 9, '~');
  rect(X + 1, Y + 10, X + RW - 2, Y + 10, 'w');
  for (const cx of [3, 6, 8]) ent({ type: 'crate', x: X + cx, y: Y + 8, dock: true });
  sign(X + 4, Y + 5, 'Spice: shove a crate into the current. It floats away east.');
  sign(X + 16, Y + 6, 'Sugar: hold your power facing the river. Your vine ties the crate that reaches it. Spice: walk her vine and shove the tied crate into still water.');
  ent({ type: 'heart', region: 0, x: X + 28, y: Y + 20 });
  sign(X + 24, Y + 13, 'One stone each side of the current, and you can both hop it.');
  // west to the Workshop: opens with the Meadow's heart
  gate(0, cellsRect(X - 1, Y + 16, X, Y + 18));
  rect(X - 1, Y + 16, X, Y + 18);
}

// ---------------------------------------------------------------- the Workshop: the line
// Its loop is an assembly line racing a clock. Spice hammers the press and it
// stamps a plank onto rollers running west over the chasm; Sugar's nail tacks a
// passing plank where it is (only over the rollers does it make a footing), and it
// holds for a few seconds; Spice hops on and hammers it home for good. Two planks
// at alternate rollers and you can both hop over. Her nails only take in his
// planks; his hammer only drives what she tacked.
{
  const [X, Y] = origin(REGIONS[1]);
  rect(X + 1, Y + 1, X + RW - 2, Y + RH - 2);
  ent({ type: 'stone', region: 1, x: X + 26, y: Y + 15 });
  // the chasm, five wide from top to bottom; the rollers cross it on row 17
  rect(X + 14, Y + 1, X + 18, Y + RH - 2, 'o');
  rect(X + 14, Y + 17, X + 18, Y + 17, '%');
  ent({ type: 'press', x: X + 20, y: Y + 17, ox: X + 18, oy: Y + 17 });
  put(X + 20, Y + 16, '#'); put(X + 20, Y + 18, '#');   // the press's housing: you reach it from the east
  sign(X + 22, Y + 14, 'Spice: hammer the press. A plank rides the rollers over the chasm.');
  sign(X + 19, Y + 20, 'Sugar: shoot a nail along the rollers to tack a plank where it is. Spice: hop on and hammer it home before it works loose.');
  ent({ type: 'heart', region: 1, x: X + 5, y: Y + 12 });
  // a star: a walled nook on the far side that only a springboard reaches (she rides, he hammers);
  // out again by the plate inside: step off it into the doorway and the door holds
  rect(X + 2, Y + 18, X + 8, Y + 18, '#'); rect(X + 2, Y + 19, X + 2, Y + 23, '#'); rect(X + 8, Y + 19, X + 8, Y + 23, '#'); rect(X + 2, Y + 24, X + 8, Y + 24, '#');
  put(X + 5, Y + 21, '$');
  ent({ type: 'spring', x: X + 10, y: Y + 21, tx: X + 5, ty: Y + 20 });
  put(X + 8, Y + 21, 'B'); put(X + 7, Y + 21, '2');
  sign(X + 11, Y + 23, 'Sugar on the springboard, Spice hammers it.');
  // north: the Night Wood, not built yet
  sign(X + 6, Y + 2, 'The Night Wood is north. It isn\'t finished yet.');
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
