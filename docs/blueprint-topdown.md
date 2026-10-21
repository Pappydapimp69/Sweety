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
| Meadow | **Vine**: grows a vine bridge over water ahead; only Spice can walk it | **Shove**: pushes crates and boulders; a crate shoved into water becomes a stepping stone | walking in (the first power stone) |
| Workshop | **Nail gun**: a nail flies ahead and flips any switch it hits | **Hammer**: smashes crates and rocks; hammering a springboard flings Sugar over walls | the Meadow's heart |
| Night Wood | **Lantern**: hidden stones exist only in her light | **Size**: small fits hedge holes, big presses heavy plates | the Workshop's heart |
| Attic House | **Swap** places | **Grapple**: zips across a gap to a post | the Night Wood's heart |
| Rooftops | **Gust**: blows Spice along, spins windmills | **Glide**: a hop becomes a long float | the Attic's heart |
| Clock Town | **Stop time** (she can't move while she does) | **Dash**: a burst that smashes glass and clears pits | the Rooftops' heart |

Powers are by region (walk into the Workshop and you have the Workshop's pair), the
same rule as the Home finale. A region's powers unlock at its **power stone**: stand on
it together -> a big "New powers!" card shows each of you your power and button.
Each region has a **heart** at the end of its main puzzle path; reaching it opens the
next region (its gate) and is saved. Optional **stars** sit in side puzzles.

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
