# SWEETY — blueprint

A two-player couch co-op platformer in the browser, in the spirit of *It Takes Two*:
two characters with DIFFERENT abilities each chapter, puzzles neither can solve alone.

## Calls made (reversible)
- **Couch, one screen** — not online. Online needs a signaling server and two-device
  testing; a couple plays side by side. Online can come later on top of the same sim.
- **2D, canvas, no build step** — GitHub Pages serves `index.html` as-is.
- **Shared camera that zooms out, plus a leash** (max 22 tiles apart) — not split-screen.
  You always see each other. Camera is computed from live player positions every frame.
- **Devices:** one keyboard splits in two (left half / right half), any gamepad joins.
  Press jump on a device to claim the next character.

## The two
- **Sugar** (pink, bow) and **Spice** (teal, hat). Told apart by shape, not only colour.

## Chapters (each teaches one pair, then twists it)
1. **The Garden** — no powers. Pressure plates hold doors/bridges open; stand on
   each other's heads to reach high ledges.
2. **The Toolbox** — Sugar shoots **pins** into walls (Spice can stand on them);
   Spice **slams** (ability in the air): breaks crates, fires launch pads under Sugar.
3. **The Night** — Sugar carries a **lantern**; hidden platforms are solid only in its
   light (hold ability to brighten, standing still). Spice **shrinks / grows**: small
   fits 1-tile holes, big presses heavy plates.
- **Bonk!** — a competitive break: land on your partner's head. First to 5.

## Modules
- `src/config.js` every tuning number.  `src/levels.js` ASCII maps.
- `src/sim.js` the ONLY mutator: physics, abilities, plates, goal. Pure, fixed 60 Hz step.
- `src/input.js` devices -> per-player buttons (pads polled on their own timer).
- `src/render.js` draws; never writes sim state (a test checks).
- `src/save.js` the only `localStorage` user, keys `sweety:*`.
- `src/main.js` screens + loop.

## Tests
`npm test` — tile/level lint, physics, and scripted play-throughs proving every chapter
can be finished by two players. Browser smoke via Playwright.
