// The Kitchen in 3D: one big open room you can roam, seen from behind each of you.
// Units: metres-ish; Sugar and Spice are about one tall. x east, y north, z up.
// Every solid is an axis-aligned box: [x0, y0, z0, x1, y1, z1, kind]. Tops are walkable.
//
// The way up is the game: the floor and the table are yours from the start (a chair
// helps, a double jump does too), but the counters and the top of the fridge are only
// reached by a caramel launch: his syrup under your feet, her spark in it.
export const ROOM = { w: 100, d: 70, h: 40 };   // walls far higher than any launch

const boxes = [];
const box = (x0, y0, z0, x1, y1, z1, kind) => boxes.push([x0, y0, z0, x1, y1, z1, kind]);

// the walls of the room
box(-1, -1, -1, ROOM.w + 1, 0, ROOM.h, 'wall');
box(-1, ROOM.d, -1, ROOM.w + 1, ROOM.d + 1, ROOM.h, 'wall');
box(-1, 0, -1, 0, ROOM.d, ROOM.h, 'wall');
box(ROOM.w, 0, -1, ROOM.w + 1, ROOM.d, ROOM.h, 'wall');
box(-1, -1, -1, ROOM.w + 1, ROOM.d + 1, 0, 'floor');

// counters along the north and west walls (top 4), the stove in the north run
box(0, 37, 0, 54, 44, 4, 'counter');
box(0, 12, 0, 7, 37, 4, 'counter');
box(26, 37.5, 4, 34, 43.5, 4.15, 'stove');
// the island in the middle (top 4)
box(20, 16, 0, 34, 23, 4, 'island');
// the table and its chairs (top 3; chairs 1.5)
box(42, 6, 0, 56, 17, 3, 'table');
box(38.5, 9.5, 0, 41, 12.5, 1.5, 'chair');
box(57, 9.5, 0, 59.5, 12.5, 1.5, 'chair');
box(47, 2.5, 0, 50, 5, 1.5, 'chair');
// the fridge in the north-east corner (top 10), and a step stool and cereal boxes about
box(54, 34, 0, 64, 44, 10, 'fridge');
box(12, 4, 0, 14.5, 6.5, 1.2, 'stool');
box(36, 26, 0, 38.5, 28, 2.2, 'cereal');
box(8.5, 30, 4, 10.5, 32, 6.2, 'cereal');   // on the west counter: a step toward nothing in particular
// the east run: a long counter with the sink, along the east wall (top 4)
box(92, 8, 0, 100, 62, 4, 'counter');
box(94, 28, 4, 99, 36, 4.1, 'sink');
box(95, 50, 4, 98.5, 53, 6.5, 'toaster');   // a step up on the sink counter
// the north side: a tall spice shelf, a staircase of 2 m steps (jump, and again at the top of each)
box(18, 62, 0, 42, 70, 2, 'shelf');
box(18, 64, 0, 42, 70, 4, 'shelf');
box(18, 66, 0, 42, 70, 6, 'shelf');
box(18, 68, 0, 42, 70, 8, 'shelf');
// a bread bin and a cookie tin to hop about on, out in the open floor
box(62, 52, 0, 68, 57, 3, 'breadbin');
box(72, 30, 0, 75, 33, 1.6, 'tin');
box(76, 24, 0, 79, 27, 1.6, 'tin');
box(70, 44, 0, 74, 46, 2.4, 'cereal');
// up high: wall cupboards over the north counter (the kettle's steam carries you up), and a
// shelf over the toaster on the east wall (the toaster pops you up to it)
box(8, 41.8, 9.5, 52, 44, 11.5, 'wallcab');
box(92.5, 54, 12, 100, 62, 12.6, 'wallcab');
// the pantry: a big open cupboard on the south wall (its floor is the room's floor)
box(0, 0, 0, 2, 12, 9, 'cupboard');
box(14, 0, 0, 30, 2, 9, 'cupboard');

export const BOXES = boxes;

const ents = [];
const ent = (e) => ents.push(e);
// start in the middle of the floor
ent({ type: 'spawn', x: 30, y: 10, z: 0 });
ent({ type: 'sign', x: 30, y: 12.5, z: 0, text: 'Five ant nests are raiding the anniversary cake. Find them all: on the floor, up the spice shelf, by the sink, by the stove, and on top of the fridge.' });
ent({ type: 'sign', x: 30, y: 60, z: 0, text: 'The spice shelf: each step is too high for one jump. Jump, and jump again.' });
ent({ type: 'sign', x: 88, y: 40, z: 0, text: 'The sink counter. Too high: syrup and a spark.' });
ent({ type: 'sign', x: 26, y: 9, z: 0, text: 'Spice: hold your power to spray syrup. It sticks to ants and slows them; it never hurts. Stand still and it aims itself.' });
ent({ type: 'sign', x: 34, y: 9, z: 0, text: 'Sugar: your sparks bounce off. Light his syrup and it goes off like a firework, and throws whoever stands in it way up.' });
ent({ type: 'sign', x: 18, y: 25, z: 0, text: 'Too high to jump? Spice: syrup at your feet. Both stand in it. Sugar: light it.' });
// the nests, in the order the bot takes them (you can take them any way you like)
ent({ type: 'nest', x: 10, y: 24, z: 0 });      // on the floor by the west counter
ent({ type: 'nest', x: 30, y: 69, z: 8 });      // on top of the spice shelf
ent({ type: 'nest', x: 96, y: 44, z: 4 });      // on the sink counter
ent({ type: 'nest', x: 22, y: 40, z: 4 });      // by the stove
ent({ type: 'nest', x: 59, y: 39, z: 10 });     // on top of the fridge
// ants about the place
for (const [x, y, z, k] of [[40, 26, 0, 'ant'], [12, 20, 0, 'ant'], [28, 30, 0, 'ant'], [27, 19, 4, 'ant'], [15, 40, 4, 'ant'], [36, 40, 4, 'soldier'], [4, 26, 4, 'ant'],
  [57, 37, 10, 'ant'], [70, 20, 0, 'jumper'], [80, 50, 0, 'ant'], [66, 64, 0, 'soldier'], [86, 14, 0, 'carrier'], [96, 20, 4, 'ant'], [96, 58, 4, 'jumper'], [25, 67, 6, 'ant'], [35, 69, 8, 'ant'], [64, 54, 3, 'ant']]) ent({ type: 'ant', kind: k, x, y, z });
// the kettle on the stove: it boils now and then, and its steam is a lift
ent({ type: 'kettle', x: 30, y: 40.6, z: 4.15 });
ent({ type: 'sign', x: 24, y: 34, z: 0, text: 'When the kettle whistles, jump into its steam: it carries you up to the cupboards. (Up on the stove you have to get first.)' });
ent({ type: 'sign', x: 90, y: 50, z: 0, text: 'The toaster pops anything that stands on it. Anything.' });
// sprinkles: hidden everywhere, for the ones who go looking (z is the height they float at)
for (const [x, y, z] of [
  [3, 3, 0], [97, 3, 0], [3, 66, 0], [60, 66, 0], [49, 11, 0], [45, 8, 0], [53, 15, 0],   // corners, under the table
  [39.7, 11, 1.5], [37.2, 27, 2.2], [71, 31.5, 1.6], [77.5, 25.5, 1.6], [72, 45, 2.4], [65, 54.5, 3],   // on things
  [21, 17, 4], [33, 22, 4], [3, 14, 4], [9.5, 31, 6.2], [40, 43, 4], [97, 12, 4], [97, 32, 4.1],   // counters and the island
  [20, 63, 2], [40, 65, 4], [19, 67, 6], [41, 69, 8], [62, 42, 10],   // the shelf and the fridge
  [12, 43, 11.5], [24, 43, 11.5], [38, 43, 11.5], [50, 43, 11.5], [96, 60, 12.6],   // the secret heights
]) ent({ type: 'sprinkle', x, y, z: z + 0.6 });
// the cake on the table, and the queen who wants it (she comes when the nests are gone)
ent({ type: 'cake', x: 49, y: 13, z: 3 });
ent({ type: 'queen', x: 49, y: 9.5, z: 3 });
// the Sprinkle Gallery: on the island, a versus game for fun
ent({ type: 'gallery', x: 27, y: 17.5, z: 4, x0: 20.6, x1: 33.4, ty: 22.2 });

export const KITCHEN3D = { id: 'kitchen', boxes: BOXES, ents, room: ROOM };
