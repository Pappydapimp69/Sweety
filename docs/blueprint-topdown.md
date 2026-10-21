# Blueprint: Sweety goes top-down (an open world seen from above)

Owner: "Top-down open world" (not a side scroller), and powers that **unlock as you go**,
like It Takes Two: each region gives each of you a new, different power. Earlier
feedback: "I don't see any new abilities" (the first areas had none), so powers must
arrive early and loudly.

## What stays
The side-view game stays playable as **Classic** (menu). Reused as-is: input (plus an
`up` bit), lockstep/net (online), audio, music, save (additive fields), the AI-partner
framework, the test harness. The sim/percept split holds: `td/sim.js` is the only
mutator of a world, pure and deterministic; `td/render.js` only reads.

## The world
One map seen from above (about 140 x 100 tiles), regions around a central Plaza:
| region | Sugar | Spice | unlocked by |
|---|---|---|---|
| Meadow | **Vine lasso** (hold): roots her; a vine over still water ahead (only Spice walks it) that ties the first floating crate to reach its end | **Shove**: a crate into the current floats off east; a tied crate shoved into still water sinks into a stepping stone; a drifting one slips | walking in (the first power stone) |
| Workshop | **Nail gun**: a nail tacks a riding plank where it is (over the rollers: a footing for 3.5 s); still flips switches | **Hammer**: hammering the press stamps a plank onto the rollers; hammering a tacked plank (ahead or underfoot) drives it home for good; still flings whoever's on a springboard | the Meadow's heart |
| Night Wood | **Lantern**: hidden stones exist only in her light | **Size**: small fits hedge holes, big presses heavy plates | the Workshop's heart |
| Attic House | **Swap** places | **Grapple**: zips across a gap to a post | the Night Wood's heart |
| Rooftops | **Gust**: blows Spice along, spins windmills | **Glide**: a hop becomes a long float | the Attic's heart |
| Clock Town | **Stop time** (she can't move while she does) | **Dash**: a burst that smashes glass and clears pits | the Rooftops' heart |

Powers are by region (walk into the Workshop and you have the Workshop's pair), the
same rule as the Home finale. A region's powers unlock at its **power stone**: stand on
it together -> a big "New powers!" card shows each of you your power and button.
Each region has a **heart** at the end of its main puzzle path; reaching it opens the
next region (its gate) and is saved. Optional **stars** sit in side puzzles.

## Each region plays differently, and each power needs the other's
Owner: "every region a completely different theme AND gameplay style" and "each player's
power must depend on the partner using theirs". One engine; each region changes its core
loop. The rule (ZaneGPT): no turn-gating, where one waits while the other acts: "my power
acts on what yours made", at the same time.
- **Meadow: the river** (a live current). He shoves dock crates into the current; she
  holds her vine at the crossing and ties the one that reaches it; he walks her vine and
  shoves the tied crate into still water, where it sinks. One stone each side of the
  current and you both hop it. Her vine needs his floating crate; his shove out there
  needs her tie. Missed crates come back to the dock (no softlock).
- **Workshop: the line** (a race against a clock). He hammers the press; a plank rides the
  rollers over a five-wide chasm; she shoots it over the right roller and it's tacked for
  3.5 s; he hops on and hammers it home. Two planks at alternate rollers and you hop over.
  Her nail only takes in his planks; his hammer only drives what she tacked. A tacked
  plank is never a respawn point (sweety#E12).
- Tests hold both edges (sweety#E15): the main path is the pair's control; a seeded solo
  wanderer per player per region never crosses; each power does nothing without the other's.

## Movement (from above)
8 directions, walk speed ~6 tiles/s; footprint 0.7 x 0.7 tiles. **Hop** (jump button):
0.4 s airborne, clears a 1-tile gap. Pits and water kill only if you land on them; you
come back where you last stood. Walls block. Shared screen: the camera frames both and
zooms out; a leash keeps you within ~14 tiles (radius).

## Toys in the Plaza (outcome-free, as before)
Race (flags, laps around the fountain), footy (top-down pitch with goals), floor piano,
bench, balloons. Tallies kept for fun.

## Slices
1. Engine + Plaza + Meadow + Workshop (two power pairs), toys, save, online, tests.
2. Night Wood + Attic House. 3. Rooftops + Clock Town + Home.
Each slice ships playable and tested.

## Tests (same discipline)
Traversal bot over the open regions; a bot route to every heart and star with a solo
control beside it; toys to a result; fuzz (no NaN, nobody inside a wall); same seed same
world; render never writes; browser + online smoke.
