// The Yard: the open world between chapters. One map, 300 x 30, districts left to
// right, each with its chapter's powers, its door, two star puzzles; toys in the Plaza.
// Built with a few stamping helpers so things can be placed by coordinate.
//
// Tiles as in levels.js, plus:  $ star   T trampoline   K piano key

export const YW = 300, YH = 30;
const GROUND = 24;   // the main floor: feet stand at y 24

const g = Array.from({ length: YH }, () => Array(YW).fill('.'));
const ents = [];
const rect = (x0, y0, x1, y1, c = '#') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c; };
const put = (x, y, str) => { for (let i = 0; i < str.length; i++) g[y][x + i] = str[i]; };
const col = (x, y0, y1, c = '#') => rect(x, y0, x, y1, c);
const ent = (e) => ents.push(e);
const sign = (x, text) => ent({ type: 'sign', x, text });

// ground everywhere, walls at both ends
rect(0, GROUND, YW - 1, YH - 1);
col(0, 0, YH - 1); col(YW - 1, 0, YH - 1);

// ---------------------------------------------------------------- the Plaza (x 1-59): toys
// the balcony: arcade doors up top, Home's door and the start underneath
rect(1, 19, 12, 19);
put(5, 23, 'PQ');
ent({ type: 'door', id: 'home', need: 6, x: 2, y: GROUND, label: 'Home' });
ent({ type: 'door', id: 'bonk', need: 0, x: 2, y: 19, label: 'Bonk!', arcade: true });
ent({ type: 'door', id: 'rain', need: 0, x: 5, y: 19, label: 'Heart Rain', arcade: true });
ent({ type: 'door', id: 'potato', need: 0, x: 8, y: 19, label: 'Hot Potato', arcade: true });
put(14, GROUND, 'T');                              // up to the balcony and the race
put(16, GROUND, 'KKKKKKKKKKKK');                   // the floor piano, x 16-27
ent({ type: 'piano', x: 16, n: 12, y: GROUND });
ent({ type: 'bench', x: 29, w: 3, y: GROUND });
// the footy pit: two deep, x 34-53, goals at each end
rect(34, GROUND, 53, GROUND + 1, '.');
ent({ type: 'ball', x: 43.5, y: GROUND + 1.6, x0: 34, x1: 54 });
// balloons: Sugar's pump on the left, Spice's on the right
ent({ type: 'balloons', x: 56, x1: 58, y: GROUND });
// the race: balcony -> stepping stones over the Plaza -> the finish platform
ent({ type: 'race', x: 10, x1: 50, y: 19 });
for (const [x0, x1, y] of [[15, 17, 17], [20, 22, 15], [25, 27, 15], [30, 33, 16], [36, 38, 14], [41, 43, 15], [46, 53, 16]]) rect(x0, y, x1, y);
put(26, 14, '#');                                  // a hurdle
// a star for a shoulder: up on the pole past the finish
rect(54, 12, 56, 12); put(55, 11, '$');
sign(4, 'Stand on the flag together for a race. Stomp your pump to pop your balloon first. Doors upstairs: arcade games.');
sign(31, 'Kick the ball into the far end. First to 5. It never counts for anything.');

// ---------------------------------------------------------------- gates and doors per district
const DISTRICTS = [
  { id: 'garden', x: 60, theme: 'day', name: 'The Garden', powers: ['none', 'none'] },
  { id: 'toolbox', x: 100, theme: 'workshop', name: 'The Workshop', powers: ['pin', 'slam'] },
  { id: 'night', x: 140, theme: 'night', name: 'The Night Meadow', powers: ['lantern', 'size'] },
  { id: 'attic', x: 180, theme: 'attic', name: 'The Attic', powers: ['swap', 'flip'] },
  { id: 'sky', x: 220, theme: 'sky', name: 'The Rooftops', powers: ['gust', 'glide'] },
  { id: 'clock', x: 260, theme: 'clock', name: 'The Clock Yard', powers: ['freeze', 'dash'] },
];
DISTRICTS.forEach((d, i) => {
  if (i > 0) ent({ type: 'gate', x: d.x, y0: 0, y1: GROUND - 1, need: i });
  ent({ type: 'door', id: d.id, need: i, x: d.x + 3, y: GROUND, label: d.name });
});

// ---------------------------------------------------------------- Garden (60): plates and shoulders
// Closets sit under a little hill you can walk over: a step on the west, the door on the east.
function closet(x, door, inner, outer, star) {
  rect(x - 1, 22, x - 1, 23);                      // the step up
  rect(x, 20, x + 5, 20);                          // the roof, four high
  col(x, 21, 23);                                  // back wall
  for (let y = 21; y <= 23; y++) put(x + 5, y, door);
  put(x + 1, 23, inner); put(x + 3, 22, '$'); put(x + 8, 23, outer);
}
{
  const X = 60;
  closet(X + 12, 'A', '1', '1', '$');                // one holds the plate, the other walks in
  rect(X + 26, 20, X + 28, 20); put(X + 27, 19, '$');   // a shelf four high: a shoulder
  sign(X + 8, 'A closet with a plate outside it. A shelf too high for one.');
}

// ---------------------------------------------------------------- Workshop (100): pins and the slam
{
  const X = 100;
  // launch: Spice slams one pad and Sugar, on the other, flies up to the shelf
  put(X + 9, GROUND, 'L'); put(X + 12, GROUND, 'L');
  rect(X + 13, 18, X + 16, 18); put(X + 15, 17, '$');
  // a pin ladder: Sugar pins from her steps (a little hill), only Spice can stand on pins
  rect(X + 25, 22, X + 25, 23); rect(X + 26, 20, X + 26, 23); rect(X + 27, 22, X + 27, 23);
  rect(X + 34, 17, X + 37, 21);                    // the ledge; you walk under it
  put(X + 36, 16, '$');
  // the high striker below the ledge: slam the pad from as high as you can get
  ent({ type: 'striker', x: X + 31, y: GROUND, top: 8 });
  sign(X + 6, 'Spice slams one pad, the other pad throws Sugar up.');
  sign(X + 29, 'Only Spice can stand on pins; from her steps Sugar pins the wall higher. Ring the bell: slam the pad from up high.');
}

// ---------------------------------------------------------------- Night Meadow (140): lantern and size
{
  const X = 140;
  // hidden stones over a pit, then a crawl hole only small Spice fits
  rect(X + 8, GROUND, X + 15, YH - 2, '.'); rect(X + 8, YH - 2, X + 15, YH - 2, '^');
  put(X + 8, GROUND, '~~~~~~~~');
  rect(X + 17, GROUND, X + 17, GROUND + 1, '.');   // the shaft down
  rect(X + 18, GROUND + 1, X + 21, GROUND + 1, '.'); put(X + 21, GROUND + 1, '$');
  // big Spice on the heavy plate opens Sugar's closet
  closet(X + 26, 'D', '4', '8', '$');
  sign(X + 5, 'Stay in her light. Down the little hole only small Spice fits. Big Spice is heavy.');
}

// ---------------------------------------------------------------- Attic (180): swap and flip, indoors
{
  const X = 180;
  rect(X, 0, X + 39, 12);                          // the roof: a ceiling at y 13
  // a ceiling pocket behind a hanging door; Sugar's floor plate opens it
  put(X + 9, 23, '3'); col(X + 12, 13, 16, 'C'); col(X + 16, 13, 16); rect(X + 12, 17, X + 16, 17); put(X + 15, 13, '$');   // closed below: in only by the ceiling
  put(X + 13, 13, '3');                            // a ceiling plate inside, so he can always let himself out
  // a floor closet; Spice's ceiling plate opens it
  put(X + 22, 13, '2');
  closet(X + 26, 'B', '2', '.', '$');
  sign(X + 6, 'A plate on the floor, a plate on the ceiling. Each opens the other one\'s way.');
}

// ---------------------------------------------------------------- Rooftops (220): gust and glide
{
  const X = 220;
  // a vent shaft with a door across it; the pinwheel opens it for a moment. You walk under it.
  col(X + 9, 13, 20); col(X + 11, 13, 20); put(X + 10, GROUND, 'V'); put(X + 10, 18, 'C');
  ent({ type: 'pinwheel', x: X + 6, y: 20, g: 3 });
  rect(X + 11, 13, X + 22, 13); put(X + 13, 12, '$');   // the top: a shelf with a star, and his path on
  put(X + 21, 12, '2');                            // his plate runs her cloud lift
  col(X + 23, 6, 13);                              // keeps his path and her shelf apart
  ent({ type: 'platform', w: 2, path: [[X + 25, GROUND], [X + 25, 10.8]], period: 6, g: 2, look: 'cloud' });
  rect(X + 27, 11, X + 30, 11); put(X + 29, 10, '$');
  put(X + 33, GROUND, 'T'); put(X + 35, GROUND, 'T');   // just for fun
  sign(X + 4, 'Gust the pinwheel and the vent door opens for a moment. Hold jump to glide up.');
}

// ---------------------------------------------------------------- Clock Yard (260): freeze and dash
{
  const X = 260;
  // a saw tunnel under the ground, no gap to hide in: only stopped time gets you through
  rect(X + 8, GROUND, X + 8, GROUND + 1, '.');     // the way down, with a step to climb back out
  rect(X + 9, GROUND + 1, X + 23, GROUND + 3, '.');
  for (let i = 0; i < 6; i++) ent({ type: 'saw', path: [[X + 11 + i * 1.5, 25.55], [X + 11 + i * 1.5, 27.45]], period: 1.2, r: 0.5 });
  put(X + 22, 27, '$');
  // gears that make a staircase only mid-swing
  ent({ type: 'platform', w: 2, path: [[X + 28, GROUND], [X + 28, 20.5]], period: 3, look: 'gear' });
  ent({ type: 'platform', w: 2, path: [[X + 31, 22], [X + 31, 18.5]], period: 3, phase: 0.5, look: 'gear' });
  ent({ type: 'platform', w: 2, path: [[X + 34, 20], [X + 34, 16.5]], period: 3, look: 'gear' });
  rect(X + 37, 16, X + 38, 16); put(X + 37, 15, '$');
  sign(X + 5, 'Sugar stops time; she can\'t move while she does. Spice can.');
}

const map = g.map((r) => r.join(''));
map.ents = ents;
map.offsets = Object.fromEntries(DISTRICTS.map((d) => [d.id, d.x]));

export const YARD = {
  id: 'yard', name: 'The Yard', tagline: 'Wander. Play. Find the stars.', yard: true,
  powers: { sugar: 'none', spice: 'none' }, theme: 'home', music: 'garden',
  map, ents, offsets: map.offsets,
  zones: [{ x: 0, powers: { sugar: 'none', spice: 'none' }, name: 'The Plaza', theme: 'home' },
    ...DISTRICTS.map((d) => ({ x: d.x, powers: { sugar: d.powers[0], spice: d.powers[1] }, name: d.name, theme: d.theme }))],
  districts: DISTRICTS,
  tips: ['Walk anywhere. Stand in a door together to go in.', 'Stars are hidden all over. Toys never count for anything.'],
};
