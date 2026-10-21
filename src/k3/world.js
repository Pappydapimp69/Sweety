// The Kitchen in 3D: one big open room you can roam, seen from behind each of you.
// Units: metres-ish; Sugar and Spice are about one tall. x east, y north, z up.
// Every solid is an axis-aligned box: [x0, y0, z0, x1, y1, z1, kind]. Tops are walkable.
//
// The way up is the game: the floor and the table are yours from the start (a chair
// helps, a double jump does too), but the counters and the top of the fridge are only
// reached by a caramel launch: his syrup under your feet, her spark in it.
export const ROOM = { w: 64, d: 44, h: 40 };   // walls far higher than any launch

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
// the pantry: a big open cupboard on the south wall (its floor is the room's floor)
box(0, 0, 0, 2, 12, 9, 'cupboard');
box(14, 0, 0, 30, 2, 9, 'cupboard');

export const BOXES = boxes;

const ents = [];
const ent = (e) => ents.push(e);
// start in the middle of the floor
ent({ type: 'spawn', x: 30, y: 10, z: 0 });
ent({ type: 'sign', x: 30, y: 12.5, z: 0, text: 'Three ant nests are raiding the anniversary cake. Find them all: one on the floor, one by the stove, one on top of the fridge.' });
ent({ type: 'sign', x: 26, y: 9, z: 0, text: 'Spice: hold your power to spray syrup. It sticks to ants and slows them; it never hurts. Stand still and it aims itself.' });
ent({ type: 'sign', x: 34, y: 9, z: 0, text: 'Sugar: your sparks bounce off. Light his syrup and it goes off like a firework, and throws whoever stands in it way up.' });
ent({ type: 'sign', x: 18, y: 25, z: 0, text: 'Too high to jump? Spice: syrup at your feet. Both stand in it. Sugar: light it.' });
// the nests
ent({ type: 'nest', x: 10, y: 24, z: 0 });
ent({ type: 'nest', x: 22, y: 40, z: 4 });
ent({ type: 'nest', x: 59, y: 39, z: 10 });
// ants about the place
for (const [x, y, z, k] of [[40, 26, 0, 'ant'], [12, 20, 0, 'ant'], [28, 30, 0, 'ant'], [27, 19, 4, 'ant'], [15, 40, 4, 'ant'], [36, 40, 4, 'soldier'], [4, 26, 4, 'ant'], [57, 37, 10, 'soldier']]) ent({ type: 'ant', kind: k, x, y, z });
// the cake on the table, and the queen who wants it (she comes when the nests are gone)
ent({ type: 'cake', x: 49, y: 13, z: 3 });
ent({ type: 'queen', x: 49, y: 9.5, z: 3 });
// the Sprinkle Gallery: on the island, a versus game for fun
ent({ type: 'gallery', x: 27, y: 17.5, z: 4, x0: 20.6, x1: 33.4, ty: 22.2 });

export const KITCHEN3D = { id: 'kitchen', boxes: BOXES, ents, room: ROOM };
