# Sweety 💞

A co-op platformer for two, in the spirit of *It Takes Two*. Sugar and Spice
fell out of the anniversary box and have to get home before morning. Every
chapter gives each of you a different power, and you can only get through
together.

**Play on one screen** (shared keyboard and/or controllers), or **online** on
two computers with a room code.

## Start
Open `index.html` through any web server, or GitHub Pages. There is no install
and no build step.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

To host it on GitHub Pages: repo **Settings → Pages → Build and deployment →
Deploy from a branch**, then choose this branch and `/ (root)`. The game will be
at https://pappydapimp69.github.io/Sweety/ (the path is case-sensitive).

## Controls
Each player presses **jump** on their own device to join.

| | move | jump | power | switch | menus: ok / back | pause |
|---|---|---|---|---|---|---|
| keyboard, left half | A / D | W | E | Tab | Space / Esc | Esc |
| keyboard, right half | ← / → | ↑ | Enter | / | Enter / Esc | Esc |
| controller | left stick | A | X | Y | A / B | Start |
| touch screen | ◀ ▶ on screen | A | B | ⇄ | A / B | II |

**Testing alone? An AI partner.** Settings → **Playing alone: an AI plays the
other one**. Join with one device and press jump again. You play one
character; **switch** changes which one, and the AI takes the other. In a
chapter it plays its half of the solved route and waits for you to do yours. If
it gets stuck for about 20 seconds, it brings you both back to the flag and
tries again; if that fails twice, it says so and just follows you and holds
switches. In the Yard it follows you, holds still when you stand on its head and
holds a nearby switch when you wait. Pause → **Watch the AI play it** plays both,
to check a whole chapter. Offline only.

**Switching characters.** On the title screen, press left or right to trade
sides. In a level, **switch** hands the characters over between you (nobody
moves). Playing alone? Join, then press jump again: one device plays both,
and **switch** changes which one you drive (an arrow marks it). A few timing
puzzles are meant for two pairs of hands, so solo is best for trying things
out.

Controllers: press any button first so the browser can see them. Touch
buttons appear the first time you touch the screen, so each of you can play
online from a phone or tablet. Hold it sideways. If a
controller unplugs mid-chapter, the game pauses.

## The Yard (the open world)
**Play** drops you both into the Yard, one big world between the chapters. Walk
anywhere. Each district has its chapter's powers, its own look and music, and
its chapter's door: stand in a door together for a moment to go in. Finish it
and you come back out of the same door, and the next district opens.

- **Stars:** 13 small optional puzzles, two in each district plus one in the
  Plaza. Each needs both of you. Stars are saved and never block anything.
- **Toys**, just for fun (they only keep an all-time score):
  - **race** on the stepping stones over the Plaza: stand on the START flag together.
  - **balloons:** stomp your own pump; first to pop wins.
  - **footy** in the pit: run into the ball, score at the far end, first to 5.
  - **floor piano:** walk or jump on the keys.
  - **trampolines** in the Plaza and on the Rooftops.
  - **the bench:** sit still on it together.
  - **high striker** in the Workshop: Spice slams the pad; the higher he slams from, the higher it goes. Sugar can pin him a way up.
- **Arcade doors** on the balcony start Bonk!, Heart Rain and Hot Potato.
- Fall somewhere? You come back where you last stood, not at the start.
  Pause → **Back to the Plaza** brings you both home.

The chapters are still in **Chapters**, and online the host can pick the Yard too.

## The story (7 chapters, 30–60 minutes the first time through)
| | Chapter | Sugar | Spice |
|---|---|---|---|
| 1 | The Garden | none: plates, doors, bridges, a shoulder to stand on | none |
| 2 | The Toolbox | shoots pins (only Spice can stand on them) | slams: breaks crates, fires launch pads |
| 3 | The Night | lantern: hidden stones hold only in her light | shrinks and grows |
| 4 | The Attic | swaps places with Spice | flips gravity and walks on the ceiling |
| 5 | The Sky | gust: blows Spice along, spins pinwheels | umbrella glide; vents lift him |
| 6 | The Clocktower | stops time (gears and saws freeze) | dashes, smashes glass |
| 7 | Home | every power pair again, zone by zone, then a climb ahead of rising water | |

Every puzzle has a **?** sign that explains itself when you walk up to it.

Each chapter ends on a **twist room** that turns something it taught you on its
head. Its sign gives a hint rather than the answer:
*Let go* (garden), *Leapfrog* (toolbox), *Hang back* (night), *The well*
(attic), *One gust* (sky) and *Take turns* (clocktower).
Hearts are hidden in each chapter.

**Mini-games:** Bonk! (land on their head), Heart Rain (catch the most),
Hot Potato (don't be holding it).

**Stuck?** Pause → **Back to checkpoint** brings you both back to the last
flag. It works online too. Every door you hold open for your partner also has
a switch on the far side, so whoever got through can let the other one in.

**Settings:** music and sound volume, **gentle mode** (spikes and falls put
you straight back where you last stood), and screen shake.

## Online
Menu → **Play online**. One of you picks **Host a game** and gets a four-letter
code and a link. The other opens the link (or picks **Join a game** and types
the code). The host picks what to play, and can restart a chapter for both of
you from the pause menu. It needs an internet connection: the
two browsers find each other through the free PeerJS broker, then talk
directly.

## Develop
- `npm test`: the pure suite (about 120 tests, around 10 s). It covers:
  - level lint and physics for every power
  - scripted bots that play **every chapter** through
  - solo negative controls proving each co-op gate needs both players
  - the Yard: walkable end to end, gates follow progress, a bot to every star with a solo control beside it, every toy played to a result, fuzz and render checks all over it
  - the AI partner: it finishes every chapter by itself, recovers from falls and Back to checkpoint, gives up honestly when its plan can't fit, keeps up in the Yard, and plays the arcade games
  - the twist rooms: each needs both of you, and its trick is the way through, with a control beside every "can't"
  - a check that the renderer never touches game state
  - online lockstep, replaying a whole chapter through two laggy peers
  - a seeded button-mashing fuzzer on every level, also started from mid-route states (no NaN, nobody stuck in a wall, deterministic)
  - keys named per device
  - music
- `node tests/browser.mjs [dir]`: the real page in Chromium. It walks the menus with the keyboard, then the bots play all 7 chapters to the credits, with screenshots.
- `node tests/gamepad.mjs`: two emulated controllers covering join, menus, stick deadzone and unplug-pauses.
- `node tests/online.mjs [dir]`: two browsers play a chapter online through the real broker.
- `node tests/touch.mjs [dir]`: real multi-touch events. Hold ▶ with one finger and tap A with another.
- `node tests/yard.mjs [dir]` and `node tests/online-yard.mjs [dir]`: the Yard in a browser (every district, a star saved, in a door and back out) and online (both through a door together and back).
- `node tests/sound.mjs`: the sound engine in Chromium: it loads, goes through the Sounds volume, footsteps and hits are audible without clipping.
- `node tests/switch.mjs [dir]`: the splash (`?splash`), trading characters on the title and in a level, and solo switching.
- Design notes: `docs/blueprint.md`.
- Sound: `src/audio.js` keeps the cartoon tones; `src/soundscape.js` adds the world's own sound (footsteps on each place's floor, wood, stone, metal, glass and the bell struck where they happen, water, and each place's room echo) from the procedural engine vendored in `src/vendor/sound-engine` (a copy of the Sound-engine repo's `src`; copy it again to update). Without AudioWorklet the tones play alone.
