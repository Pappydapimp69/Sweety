# SWEETY — blueprint

A two-player co-op platformer in the browser, in the spirit of *It Takes Two*:
two characters with DIFFERENT powers each chapter, puzzles neither can solve alone.

## Calls made (reversible)
- **Couch first, one shared screen** that zooms out, plus a leash (22 tiles), instead of split-screen.
- **Online as an isolated mode**: deterministic lockstep over one WebRTC channel (PeerJS broker).
- **2D canvas, no build step**: GitHub Pages serves `index.html` as-is.
- **Each power acts on the partner's world** (pins hold only Spice, slam fires pads under Sugar,
  light makes stones solid for both): co-op is guaranteed by the rules; solo bots prove it.
- **Teach, develop, twist** per chapter; Home replays every pair by zone, then a timed climb.
- **Gentle mode** lives in the sim (it changes outcomes), shake lives in the view.

## Modules
| file | job |
|---|---|
| `src/config.js` | every tuning number |
| `src/levels.js` | ASCII sections + entities, chapters, mini-games, all dialogue |
| `src/sim.js` | the ONLY mutator: physics, powers, entities, flood, mini-games. Pure, fixed 60 Hz, no transcendentals |
| `src/lockstep.js` | online: input-delay lockstep, fingerprints, host resync (pure) |
| `src/net.js` | online: the PeerJS data channel (lazy-loaded) |
| `src/input.js` | devices → buttons (keyboard halves, pads, touch); latched, counted presses; pads polled on a timer |
| `src/render.js` | draws; never writes sim state |
| `src/music.js` / `src/audio.js` | procedural music (look-ahead scheduler, two leitmotifs) and sfx |
| `src/save.js` | the only `localStorage` user, key `sweety:progress` |
| `src/main.js` | screens, loop, camera, bubbles, signs, shake, online flow |

## Safety nets (each one came from a bug found by a bot, a review or the fuzzer)
- Doors and lantern stones never close on a player; a rising support squeezes its rider off under a ceiling.
- Every door held from a ledge has a switch on the far side too; Pause → Back to checkpoint (both) is an input, so it works online.
- Gentle-mode safe spots are recorded after hazards, remember your size, and fall back to the checkpoint if you no longer fit.
- The leash never acts on someone in the air and never pulls more than that step's own movement; it is drawn as a heart-string.
- A timed hazard (the finale's water) takes its own checkpoint when it starts; checkpoints only move forward.
- Moving platforms answer only switches within 30 tiles, so one colour can run two machines in a chapter.

## Rules that hold
- Only `sim.js` mutates a run; `render.js` reads (tested).
- Every instruction names the button on the player's own device (`{tokens}`; tested).
- Every switch drives something and every door/bridge has a switch (tested).
- Every talk trigger has lines and every line set is triggered (tested).
- No `Math.random`, clock, DOM or transcendental math in `sim.js` (tested).
