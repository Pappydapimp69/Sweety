# Blueprint: the Yard (open world, star puzzles, just-for-fun toys)

Owner ask: "an open world with more puzzles, and mini games that don't affect the
outcome but are just fun to play with your partner."

## Shape
- **The Yard** is one explorable map, 300 x 30 tiles (chapters are 18 rows tall; the
  Yard is taller so it can branch up and down). It is a chapter-like run
  (`mode: 'chapter'`, `yard: true`) with no goal: it never completes.
- **Districts** run left to right: Plaza, Garden, Toolbox, Night, Attic, Sky, Clock.
  Each district is a power zone (same mechanism as Home) with the powers of its
  chapter, and its own look (zone `theme`).
- **Gates**: a district opens when its chapter is unlocked (`unlocked > i`). A gate is
  an entity; a locked gate becomes `#` cells at `createRun` (input: `opts.unlocked`).
- **Chapter doors**: each district has its chapter's door; Home's door is in the Plaza.
  Both of you stand in a door for 0.8 s -> `enter` event -> main starts the chapter.
  Finishing a chapter you entered from the Yard brings you back to the Yard, at that
  door, with the next district's gate open.
- **Arcade doors** in the Plaza start Bonk, Heart Rain and Hot Potato; finishing one
  returns you to the Yard.

## Puzzles
- 2 **star nooks** per district plus 1 in the Plaza: small optional puzzles in that
  district's powers. Star tile `$`. Collected stars are saved (`progress.stars`) and
  removed when the Yard is built (`opts.stars`), so they are an input, not run state.
- Stars never gate anything. They're counted on the HUD and the chapter select.

## Toys (outcome-free; win tallies are kept only for bragging)
All toys are sim entities, so online play stays in lockstep for free (the fingerprint
covers the whole state). None uses a new button: they trigger by where you stand.
| toy | how | where |
|---|---|---|
| race | both stand on the start flag -> 3-2-1 -> first to the finish flag wins | roof path over the Plaza |
| balloons | stomp (land on) your own pump; first balloon to pop wins | Plaza |
| footy | a ball you kick by running/jumping into it; score in the far end; first to 5 | Plaza pit |
| piano | floor keys play notes as you walk/land on them | Plaza |
| trampolines | land on one, bounce high | Plaza, Sky |
| bench | both sit still on it together for a moment | Plaza |
| high striker | Spice slams the pad; the higher he slammed from, the higher the puck | Toolbox |

The leash is off while a race runs (the camera frames up to ~50 tiles).

## Save (Brain T3: "co-op without a rewrite vs save schema")
Additive only, all sanitised on load with defaults, so old saves load unchanged:
`stars: {key: true}`, `tally: {race|balloons|footy: [sugar, spice]}`,
`records: {race: seconds, striker: tiles}`, `cuddles: n`.

## Online
The host starts the Yard like a chapter, and its `start` message carries the Yard's
inputs (`unlocked`, `stars`, `at`) so both machines build the same world. An `enter`
event fires on both machines; only the host acts on it.

## Tests
- Yard lint (walls, spawns, every switch drives something), gates per unlock level.
- A bot route to every star; a solo control per star nook where it is co-op.
- Each toy: scripted players play it to a result; outcome never touches progress.
- Fuzz and render-read-only include the Yard; online: two browsers walk into a door.
