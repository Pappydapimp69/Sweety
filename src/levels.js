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
function sec(w, rows) {
  const out = [];
  for (let r = 0; r < H; r++) {
    const src = r < rows.length ? rows[r] : rows[rows.length - 1];
    if (src.length > w) throw new Error(`section row ${r} longer than ${w}: "${src}"`);
    out.push(src.padEnd(w, '.'));
  }
  return out;
}
function join(...secs) {
  return Array.from({ length: H }, (_, r) => secs.map((s) => s[r]).join(''));
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

// ---------- Bonk! arena ----------
const arena = sec(32, [
  '#..............................#', ...Array(4).fill('#..............................#'),
  '#............######............#', ...Array(3).fill('#..............................#'),
  '#....######..........######....#', ...Array(2).fill('#..............................#'),
  '#..P......................Q....#', ground(32),
]);

export const CHAPTERS = [
  {
    id: 'garden', name: 'The Garden', tagline: 'Hold the door. Lend a shoulder.',
    powers: { sugar: 'none', spice: 'none' }, theme: 'day',
    map: join(start, g_step, g_door, g_stack, check, g_pit, g_bridge, goal),
    tips: [
      'Stand on a plate to open the door of its colour.',
      'Too high to jump? Stand on your partner\'s head.',
    ],
  },
  {
    id: 'toolbox', name: 'The Toolbox', tagline: 'She pins. He pounds.',
    powers: { sugar: 'pin', spice: 'slam' }, theme: 'workshop',
    map: join(start, t_crates, check, t_pins, check, t_launch, goal),
    tips: [
      'Spice: {ability} in the air to SLAM. Crates break, launch pads fire.',
      'Sugar: {ability} shoots a pin into a wall. Only Spice can stand on pins.',
    ],
  },
  {
    id: 'night', name: 'The Night', tagline: 'Stay in the light.',
    powers: { sugar: 'lantern', spice: 'size' }, theme: 'night',
    map: join(start, n_pit, check, n_crawl, check, n_heavy, n_climb),
    tips: [
      'Sugar: hidden stones only hold in your light. Hold {ability} to shine brighter.',
      'Spice: {ability} switches small (fits holes) and big (heavy plates).',
    ],
  },
];

export const BONK = {
  id: 'bonk', name: 'Bonk!', tagline: 'Land on their head. First to 5.',
  powers: { sugar: 'none', spice: 'none' }, theme: 'day', map: arena, bonk: true,
  tips: ['Jump on your partner\'s head to score.'],
};

export function chapterById(id) {
  return id === 'bonk' ? BONK : CHAPTERS.find((c) => c.id === id);
}
