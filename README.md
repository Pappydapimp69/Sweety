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
at `https://<you>.github.io/sweety/`.

## Controls
Each player presses **jump** on their own device to join.

| | move | jump | power | menus: ok / back | pause |
|---|---|---|---|---|---|
| keyboard, left half | A / D | W | E | Space / Esc | Esc |
| keyboard, right half | ← / → | ↑ | Enter | Enter / Esc | Esc |
| controller | left stick | A | X | A / B | Start |

Controllers: press any button first so the browser can see them. If a
controller unplugs mid-chapter, the game pauses.

## The story (7 chapters, about an hour together)
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
Hearts are hidden in each chapter.

**Mini-games:** Bonk! (land on their head), Heart Rain (catch the most),
Hot Potato (don't be holding it).

**Settings:** music and sound volume, **gentle mode** (spikes and falls put
you straight back where you last stood), and screen shake.

## Online
Menu → **Play online**. One of you picks **Host a game** and gets a four-letter
code and a link. The other opens the link (or picks **Join a game** and types
the code). The host picks what to play. It needs an internet connection: the
two browsers find each other through the free PeerJS broker, then talk
directly.

## Develop
- `npm test`: the pure suite (about 90 tests). It covers:
  - level lint and physics for every power
  - scripted bots that play **every chapter** through
  - solo negative controls proving each co-op gate needs both players
  - a check that the renderer never touches game state
  - online lockstep, replaying a whole chapter through two laggy peers
  - keys named per device
  - music
- `node tests/browser.mjs [dir]`: the real page in Chromium. It walks the menus with the keyboard, then the bots play all 7 chapters to the credits, with screenshots.
- `node tests/gamepad.mjs`: two emulated controllers covering join, menus, stick deadzone and unplug-pauses.
- `node tests/online.mjs [dir]`: two browsers play a chapter online through the real broker.
- Design notes: `docs/blueprint.md`.
