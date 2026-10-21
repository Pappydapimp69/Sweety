// The Kitchen: one long counter, left to right, in five parts. Stamped by coordinate.
//   A  the box (teach): syrup, sparks, and a wall of sugar cubes only caramel breaks
//   B  Crumb Raid: three ant nests in an arena; the candy door opens when they're gone
//      (up a side passage: the Sprinkle Gallery, a versus game for fun)
//   C  The Gap: counters with drops between; caramel-jump across together
//   D  The Pantry: the light goes out (the twist): only fire lights the way to the switch
//   E  The Cake: the Ant Queen
// Tiles: . counter   # wall   o a drop   c sugar cube (caramel breaks it)
//        D candy door (opens when the nests are gone)   E pantry door (opens with the light)
//        ; shelf (a wall in the dark)   P/Q Sugar/Spice start

export const W = 182, H = 18;
const g = Array.from({ length: H }, () => Array(W).fill('#'));
const ents = [];
const rect = (x0, y0, x1, y1, c = '.') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c; };
const ent = (e) => ents.push(e);
const TOP = 5, BOT = 16, MID = 10;

// A: the box
rect(1, TOP, 29, BOT);
g[MID][3] = 'P'; g[MID + 1][3] = 'Q';
ent({ type: 'cp', x: 3.5, y: MID + 0.5, name: 'The Box' });
ent({ type: 'sign', x: 6, y: 7, text: 'Spice: hold your power to spray syrup. It sticks to anything. It never hurts.' });
ent({ type: 'sign', x: 9, y: 14, text: 'Sugar: your sparks bounce off. Light his syrup and it goes off like a firework.' });
rect(16, TOP, 16, BOT, 'c');
ent({ type: 'sign', x: 13, y: MID, text: 'Sugar cubes. Syrup them, then spark them.' });
for (const [x, y] of [[22, 7], [25, 11], [22, 14]]) ent({ type: 'ant', kind: 'ant', x: x + 0.5, y: y + 0.5 });

// B: Crumb Raid
rect(30, 9, 30, 12);
rect(31, TOP, 64, BOT);
ent({ type: 'cp', x: 32.5, y: MID + 0.5, name: 'Crumb Raid' });
for (const [x, y] of [[39, 7], [51, 14], [59, 8]]) ent({ type: 'nest', x: x + 0.5, y: y + 0.5 });
for (const [x, y] of [[38, 12], [56, 12]]) rect(x, y, x + 1, y, '#');   // a little cover
rect(65, 9, 65, 12, 'D');
ent({ type: 'sign', x: 34, y: 7, text: 'Nests! Only caramel breaks them. The candy door opens when all three are gone.' });
// the Sprinkle Gallery, up a side passage
rect(47, 4, 48, 4);
rect(41, 1, 55, 3);
ent({ type: 'gallery', x: 48, y: 3.5, x0: 41.5, x1: 55.5, ty: 1.5 });
ent({ type: 'sign', x: 45, y: 3, text: 'The Sprinkle Gallery. Stand on the pad together: most sprinkles in 20 seconds wins.' });

// C: The Gap
const counters = [[66, 73], [77, 84], [89, 96], [100, 108]];
for (const [a, b] of counters) rect(a, TOP, b, BOT);
for (const [a, b] of [[74, 76], [85, 88], [97, 99]]) rect(a, TOP, b, BOT, 'o');
ent({ type: 'cp', x: 67.5, y: MID + 0.5, name: 'The Gap' });
ent({ type: 'cp', x: 90.5, y: MID + 0.5, name: 'The Gap' });
ent({ type: 'sign', x: 69, y: 7, text: 'Too far to roll. Spice: spray syrup at the edge. Both stand in it, facing over. Sugar: light it.' });
for (const [x, y] of [[80, 7], [82, 13], [92, 8], [94, 13], [104, 9], [105, 12]]) ent({ type: 'ant', kind: x > 100 ? 'soldier' : 'ant', x: x + 0.5, y: y + 0.5 });

// D: the Pantry (the light goes out)
rect(109, 9, 109, 12);
rect(110, TOP, 146, BOT);
ent({ type: 'cp', x: 111.5, y: MID + 0.5, name: 'The Pantry', dark: true });
for (const [x, y, w, h] of [[116, 6, 1, 4], [116, 12, 1, 4], [122, 9, 3, 1], [128, 5, 1, 3], [128, 13, 1, 4], [133, 9, 1, 3], [138, 6, 3, 1], [138, 14, 3, 1]]) rect(x, y, x + w - 1, y + h - 1, ';');
for (const [x, y, k] of [[120, 7, 'ant'], [120, 14, 'ant'], [126, 11, 'soldier'], [131, 7, 'ant'], [131, 14, 'ant'], [136, 10, 'soldier'], [141, 8, 'ant'], [141, 13, 'ant']]) ent({ type: 'ant', kind: k, x: x + 0.5, y: y + 0.5 });
ent({ type: 'switch', x: 145.5, y: MID + 0.5 });
rect(147, 9, 147, 12, 'E');
ent({ type: 'sign', x: 112, y: 7, text: 'The light\'s gone! Fire is the only light now. The switch is at the far end: give it a bang.' });

// E: the Cake
rect(148, TOP, 180, BOT);
ent({ type: 'cp', x: 151.5, y: MID + 0.5, name: 'The Cake', boss: true });
ent({ type: 'queen', x: 166.5, y: MID + 0.5 });

export const KITCHEN = { id: 'kitchen', map: g.map((r) => r.join('')), ents };
