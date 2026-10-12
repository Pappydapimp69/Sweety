// Levels as ASCII, built from sections joined left to right. Every map is H rows.
//
//  #  ground            ^  spikes            P / Q  Sugar / Spice start
//  *  goal (both in)    !  checkpoint        h  heart
//  1-4  plate (anyone)  5-8  heavy plate (big Spice only); 1/5 -> group 1, 2/6 -> 2 ...
//  A-D  door: solid unless its group is pressed (or someone is standing in it)
//  a-d  bridge: solid ONLY while its group is pressed
//  x  crate: Spice's slam breaks it     L  launch pad: a slam on one fires the others
//  ~  lantern stone: solid only in Sugar's light

export const H = 18;

// A section: rows padded right with '.', rows past the last given one copy it.
// Entities (moving platforms, saws, pinwheels, talk triggers) use section-local x.
function sec(w, rows, ents = []) {
  const out = [];
  for (let r = 0; r < H; r++) {
    const src = r < rows.length ? rows[r] : rows[rows.length - 1];
    if (src.length > w) throw new Error(`section row ${r} longer than ${w}: "${src}"`);
    out.push(src.padEnd(w, '.'));
  }
  out.ents = ents;
  out.w = w;
  return out;
}
const shift = (e, dx) => ({ ...e, x: e.x !== undefined ? e.x + dx : undefined, path: e.path && e.path.map(([x, y]) => [x + dx, y]) });
// Join sections left to right; returns the map rows, with .ents in world coordinates.
function join(...secs) {
  const rows = Array.from({ length: H }, (_, r) => secs.map((s) => s[r]).join(''));
  const ents = [];
  let off = 0;
  for (const s of secs) { for (const e of s.ents || []) ents.push(shift(e, off)); off += s[0].length; }
  rows.ents = ents;
  return rows;
}
// x offset of a section inside a joined map (for zones and floods)
export function offsetOf(secs, target) {
  let off = 0;
  for (const s of secs) { if (s === target) return off; off += s[0].length; }
  throw new Error('section not in map');
}
const sky = (n, s = '') => Array(n).fill(s);
const ground = (w) => '#'.repeat(w);

const start = sec(8, [...sky(12, '#'), '#.PQ', ground(8)]);
const check = sec(6, [...sky(12), '..!', ground(6)]);
const goal = sec(10, [...sky(10, '.........#'), '.....**..#', '.....**..#', '.....**..#', ground(10)]);

// ---------- Chapter 1: The Garden — plates, doors, bridges, stacking ----------
const g_step = sec(10, [...sky(9), '....h', '', '...###', '...###', '######^^^#', ground(10)]);
const g_door = sec(14, [...sky(10, '.......#'), '.......A', '.......A', '...1...A...1', ground(14)]);
const g_stack = sec(16, [
  ...sky(7), '............h', '.........2', '......##########',
  '......B', '......B', '......B', ground(16),
]);
const g_pit = sec(20, [
  ...sky(9), '.........h', '', '....##...##...##', '....##...##...##',
  '##^^##^^^##^^^##^^##', ground(20),
]);
const g_bridge = sec(18, [
  ...sky(12), '.3..............3', '###cccccccccccc###', '###............###',
  '###............###', '###^^^^^^^^^^^^###',
]);

// ---------- Chapter 2: The Toolbox — Sugar's pins, Spice's slam ----------
const t_crates = sec(16, [
  ...sky(13, '..........##'), '####xxx#####...#', '####...........#', '####..........##', ground(16),
]);
const t_pins = sec(16, [
  ...sky(6), '............h', '............1', '........########', '........########',
  '........########', '........A', '........A', ground(16),
]);
const t_launch = sec(20, [
  ...sky(5), '..............h', '...............2', '............########',
  '............########', '............########', '............########',
  '............B', '............B', '####LL###LL#########', ground(20),
]);

// ---------- Chapter 3: The Night — Sugar's lantern, Spice shrinks and grows ----------
const n_pit = sec(20, [
  ...sky(10), '.........h', '', '', '##~~~~~~~~~~~~~~~~##', '##................##',
  '##................##', '##................##', '##^^^^^^^^^^^^^^^^##',
]);
const n_crawl = sec(16, [...sky(10, '......##'), '......AA', '......AA', '...........1', ground(16)]);
const n_heavy = sec(18, [
  ...sky(10, '.........#'), '.........', '.........B', '......6..B', ground(18),
]);
const n_climb = sec(18, [
  '.................#', '.................#', '.............***#', '.............***#',
  '.............***#', '............######', '............######', '.........~~.######',
  '............######', '......~~....######', '............######', '...~~.......######',
  '............######', ground(18),
]);

// ---------- Chapter 4: The Attic — Sugar swaps, Spice flips gravity ----------
// Indoors: rows 0-3 are the roof, so flipped Spice has a ceiling to walk on.
const roof = (w) => Array(4).fill('#'.repeat(w));
const room = (w, rows) => sec(w, [...roof(w), ...rows]);
const a_start = room(8, [...Array(8).fill('#'), '#.PQ', ground(8)]);
const a_intro = room(16, [...Array(9).fill(''), '####^^^^^^^^####', ground(16)], [{ type: 'talk', x: 2, id: 'attic1' }]);
const a_doors = room(18, [
  '.........B...1', '.........B', '.........B', '.........#', '.........#', '.........#',
  '.........A', '.........A', '.....2...A', ground(18),
]);
const a_check = room(6, [...Array(8).fill(''), '..!', ground(6)]);
const a_zig = room(24, [
  '....vvvv.........vvv', ...Array(4).fill(''), '..............h', '', '', '',
  '#########^^^^^^^########', ground(24),
], [{ type: 'talk', x: 1, id: 'attic2' }]);
const a_goal = room(14, [
  '.............#', '.............#', '.........***.#', '.........***.#', '.........***.#',
  '.......#######', '.......#######', '.......#######', '.......#######', ground(14),
]);

// ---------- Chapter 5: The Sky — Sugar's gust, Spice's umbrella ----------
const pit = (w, l, r) => '#'.repeat(l) + '.'.repeat(w - l - r) + '#'.repeat(r);
const s_cloud = sec(24, [
  ...sky(10), '....................h', '', '.....................1',
  pit(24, 3, 6), pit(24, 3, 6), pit(24, 3, 6), pit(24, 3, 6), pit(24, 3, 6),
], [
  { type: 'platform', w: 3, path: [[3, 13], [15, 13]], period: 7, g: 1, look: 'cloud' },
  { type: 'talk', x: 1, id: 'sky1' },
]);
const s_vent = sec(22, [
  ...sky(4), '.......h', '..............2', '..........############', '..........############',
  '..........############', '..........############', '..........############',
  '..........B', '..........B', '#######V##############', ground(22),
]);
const s_wheel = sec(26, [
  ...sky(10, '........#'), '........C', '........C', '........C',
  '###########dddddddddddd###', pit(26, 11, 3),
], [
  { type: 'pinwheel', x: 5, y: 10, g: 3 },
  { type: 'talk', x: 1, id: 'sky2' },
]);
s_wheel[12] = '........C..............4..';
s_wheel[9] = '........#.........h.......';

// ---------- Chapter 6: The Clocktower — Sugar stops time, Spice dashes ----------
const c_saws = sec(22, [
  ...sky(10, '...##############'), '................%', '................%', '................%.1...',
  '#A##################..', '#.....................', '#....................#', ground(22),
], [
  ...[6.5, 9.5, 12.5].map((x) => ({ type: 'saw', path: [[x, 10.55], [x, 12.45]], period: 1.2, r: 0.5 })),
  { type: 'talk', x: 0, id: 'clock1' },
]);
const c_bob = sec(24, [
  ...sky(10), '...........h', '', '......................2',
  '##bbbbbbbbbbbbbbbbbbbb##', pit(24, 2, 2),
], [4, 10, 16].map((x) => ({ type: 'platform', w: 3, path: [[x, 9.5], [x, 14.5]], period: 2.4, look: 'gear' })));
const c_ferry = sec(26, [
  ...sky(12), '.........##...........3',
  '##.......##.......########', '.........##',
], [
  { type: 'platform', w: 3, path: [[2, 11], [15, 11]], period: 9, g: 3, look: 'gear' },
  { type: 'saw', path: [[6, 7], [6, 11]], period: 1.6, r: 0.55, g: 3, stop: true },
  { type: 'talk', x: 0, id: 'clock2' },
]);

// ---------- Chapter 7: Home — every power, one last climb ----------
const h_door = sec(14, [...sky(10, '.......#'), '.......A', '.......A', '...1...A...1', ground(14)], [{ type: 'talk', x: 1, id: 'home1' }]);
const h_launch = sec(20, [
  ...sky(6), '...............2', '............########', '............########',
  '............########', '............########', '............B', '............B',
  '####LL###LL#########', ground(20),
]);
const h_dark = sec(20, [
  ...sky(13), '##~~~~~~~~~~~~~~~~##', '##................##', '##................##',
  '##................##', '##^^^^^^^^^^^^^^^^##',
]);
const h_attic = sec(16, [...roof(16), ...Array(9).fill(''), '####^^^^^^^^####', ground(16)]);
const h_vent = sec(22, [
  ...sky(5), '..............3', '..........############', '..........############',
  '..........############', '..........############', '..........############',
  '..........C', '..........C', '#######V##############', ground(22),
]);
const h_saws = sec(22, [
  ...sky(10, '...##############'), '................%', '................%', '................%.4...',
  '#D##################..', '#.....................', '#....................#', ground(22),
], [6.5, 9.5, 12.5].map((x) => ({ type: 'saw', path: [[x, 10.55], [x, 12.45]], period: 1.2, r: 0.5 })));
// The climb: the bath is overflowing. Two-row steps, one stack, then the box.
const h_climb = sec(24, [
  '.......................#', '.......................#', '.......................#',
  '................****...#', '................****...#', '...........h....****...#',
  '..............##########', '..........###.##########', '..............##########',
  '......###.....##########', '..............##########', '..###.........##########',
  '!.............##########', ground(24),
], [{ type: 'talk', x: 1, id: 'home2' }]);

// ---------- mini-game arenas ----------
const arena = sec(32, [
  '#..............................#', ...Array(4).fill('#..............................#'),
  '#............######............#', ...Array(3).fill('#..............................#'),
  '#....######..........######....#', ...Array(2).fill('#..............................#'),
  '#..P......................Q....#', ground(32),
]);
const rainArena = sec(32, [
  ...Array(8).fill('#..............................#'),
  '#.......#####........#####.....#', ...Array(3).fill('#..............................#'),
  '#.............PQ...............#', ground(32),
]);
const potatoArena = sec(32, [
  ...Array(4).fill('#..............................#'),
  '#...........########...........#', ...Array(3).fill('#..............................#'),
  '#..#####..................######', ...Array(3).fill('#..............................#'),
  '#...P....................Q.....#', ground(32),
]);

const garden = [start, g_step, g_door, g_stack, check, g_pit, g_bridge, goal];
const atticSecs = [a_start, a_intro, a_doors, a_check, a_zig, a_check, a_goal];
const homeSecs = [start, h_door, check, h_launch, check, h_dark, check, h_attic, check, h_vent, check, h_saws, h_climb];
const Z = (sugar, spice) => ({ sugar, spice });

export const CHAPTERS = [
  {
    id: 'garden', name: 'The Garden', tagline: 'Hold the door. Lend a shoulder.',
    powers: Z('none', 'none'), theme: 'day', music: 'garden',
    map: join(...garden),
    tips: [
      'Stand on a plate to open the door of its colour.',
      'Too high to jump? Stand on your partner\'s head.',
    ],
  },
  {
    id: 'toolbox', name: 'The Toolbox', tagline: 'She pins. He pounds.',
    powers: Z('pin', 'slam'), theme: 'workshop', music: 'toolbox',
    map: join(start, t_crates, check, t_pins, check, t_launch, goal),
    tips: [
      'Spice: {ability} in the air to SLAM. Crates break, launch pads fire.',
      'Sugar: {ability} shoots a pin into a wall. Only Spice can stand on pins.',
    ],
  },
  {
    id: 'night', name: 'The Night', tagline: 'Stay in the light.',
    powers: Z('lantern', 'size'), theme: 'night', music: 'night',
    map: join(start, n_pit, check, n_crawl, check, n_heavy, n_climb),
    tips: [
      'Sugar: hidden stones only hold in your light. Hold {ability} to shine brighter.',
      'Spice: {ability} switches small (fits holes) and big (heavy plates).',
    ],
  },
  {
    id: 'attic', name: 'The Attic', tagline: 'Which way is up?',
    powers: Z('swap', 'flip'), theme: 'attic', music: 'attic',
    map: join(...atticSecs),
    tips: [
      'Spice: {ability} flips your gravity. Walk on the ceiling!',
      'Sugar: {ability} swaps places with Spice.',
    ],
  },
  {
    id: 'sky', name: 'The Sky', tagline: 'Catch the wind.',
    powers: Z('gust', 'glide'), theme: 'sky', music: 'sky',
    map: join(start, s_cloud, check, s_vent, check, s_wheel, goal),
    tips: [
      'Spice: hold {jump} in the air to glide. Vents lift you while you glide.',
      'Sugar: {ability} blows a gust. It pushes Spice and spins pinwheels.',
    ],
  },
  {
    id: 'clock', name: 'The Clocktower', tagline: 'Hold still. Go fast.',
    powers: Z('freeze', 'dash'), theme: 'clock', music: 'clock',
    map: join(start, c_saws, check, c_bob, check, c_ferry, goal),
    tips: [
      'Sugar: hold {ability} to stop every gear and saw. You can\'t move while you do.',
      'Spice: {ability} dashes. It smashes glass. Once per jump.',
    ],
  },
  {
    id: 'home', name: 'Home', tagline: 'Everything you learned. Together.',
    powers: Z('none', 'none'), theme: 'home', music: 'home',
    map: join(...homeSecs),
    zones: [
      { x: 0, powers: Z('none', 'none') },
      { x: offsetOf(homeSecs, h_launch), powers: Z('pin', 'slam') },
      { x: offsetOf(homeSecs, h_dark), powers: Z('lantern', 'size') },
      { x: offsetOf(homeSecs, h_attic), powers: Z('swap', 'flip') },
      { x: offsetOf(homeSecs, h_vent), powers: Z('gust', 'glide') },
      { x: offsetOf(homeSecs, h_saws), powers: Z('freeze', 'dash') },
      { x: offsetOf(homeSecs, h_climb), powers: Z('none', 'none') },
    ],
    flood: { startX: offsetOf(homeSecs, h_climb) + 3, y0: 17.5, speed: 0.45, stopY: 7, grace: 3 },
    tips: [
      'Your powers change as you go. Watch the corner of the screen.',
      'At the end, the water rises. Climb!',
    ],
  },
];

export const MINIGAMES = [
  {
    id: 'bonk', name: 'Bonk!', tagline: 'Land on their head. First to 5.',
    powers: Z('none', 'none'), theme: 'day', music: 'minigame', map: arena, mini: 'bonk',
    tips: ['Jump on your partner\'s head to score.'],
  },
  {
    id: 'rain', name: 'Heart Rain', tagline: 'Catch the most hearts. Dodge the rocks.',
    powers: Z('none', 'none'), theme: 'sky', music: 'minigame', map: rainArena, mini: 'rain',
    tips: ['Gold hearts are worth 3. Rocks make you dizzy.'],
  },
  {
    id: 'potato', name: 'Hot Potato', tagline: 'Don\'t be holding it when it pops.',
    powers: Z('none', 'none'), theme: 'workshop', music: 'minigame', map: potatoArena, mini: 'potato',
    tips: ['Touch your partner to pass the potato. First to 3 rounds.'],
  },
];
export const BONK = MINIGAMES[0];

// What Sugar and Spice say. Story beats open and close each chapter; `talk`
// entities in the maps trigger the lines in between.
export const STORY = {
  garden: {
    intro: [['Sugar', 'We fell out of the box!'], ['Spice', 'Our anniversary is tomorrow morning.'], ['Sugar', 'Then we walk home. Together.']],
    outro: [['Spice', 'That was nice. Doors are easier with two.'], ['Sugar', 'Everything is.']],
  },
  toolbox: {
    intro: [['Spice', 'The toolbox. Watch the nails.'], ['Sugar', 'Ooh, can I shoot nails?']],
    outro: [['Sugar', 'You flew so high!'], ['Spice', 'You threw me. I just landed.']],
  },
  night: {
    intro: [['Sugar', 'It\'s so dark out here.'], ['Spice', 'Then I\'ll stay close to your light.']],
    outro: [['Spice', 'You never let me fall.'], ['Sugar', 'Not once.']],
  },
  attic: {
    intro: [['Spice', 'The attic. Everything\'s upside down up here.'], ['Sugar', 'Including you, apparently.']],
    outro: [['Sugar', 'Swap you for anything.'], ['Spice', 'Nope. Not for anything.']],
  },
  sky: {
    intro: [['Sugar', 'We\'re on the roof! Look at the sky!'], ['Spice', 'I\'m looking at the drop.']],
    outro: [['Spice', 'Fine. Gliding is fun.'], ['Sugar', 'Told you.']],
  },
  clock: {
    intro: [['Spice', 'The clocktower. It\'s nearly morning.'], ['Sugar', 'Then I\'ll stop the clock for us.']],
    outro: [['Sugar', 'If only it were that easy.'], ['Spice', 'Time goes faster when it\'s us.']],
  },
  home: {
    intro: [['Sugar', 'I can see the box!'], ['Spice', 'Everything we learned, one more time.']],
    outro: [['Spice', 'Happy anniversary, Sugar.'], ['Sugar', 'Happy anniversary. Same time next year?'], ['Spice', 'Every year.']],
  },
  talk: {
    attic1: [['Sugar', 'Floor\'s full of spikes.'], ['Spice', 'Ceiling isn\'t. Then swap me back.']],
    attic2: [['Spice', 'Spikes on the ceiling AND the floor?'], ['Sugar', 'Zig and zag, love.']],
    sky1: [['Sugar', 'Jump, and I\'ll blow you across!'], ['Spice', 'Then I\'ll hold the cloud for you.']],
    sky2: [['Sugar', 'A pinwheel! My wind will spin it.']],
    clock1: [['Spice', 'Saws. Of course there are saws.'], ['Sugar', 'Hold still... and go!']],
    clock2: [['Sugar', 'Hold that plate, I\'ll ride the gear.']],
    home1: [['Sugar', 'Remember the garden?'], ['Spice', 'Our first door.']],
    home2: [['Spice', 'The bath is overflowing!'], ['Sugar', 'Up, up, up!']],
  },
};

for (const c of [...CHAPTERS, ...MINIGAMES]) c.ents = c.map.ents || [];

export function chapterById(id) {
  return CHAPTERS.find((c) => c.id === id) || MINIGAMES.find((c) => c.id === id);
}
