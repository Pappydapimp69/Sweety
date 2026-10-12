# Sweety 💞

A couch co-op platformer for two, in the spirit of *It Takes Two*. Each chapter
gives Sugar and Spice different powers, and you can only get through together.

## Play
Open `index.html` through any web server (or GitHub Pages). No install, no build.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

**Join:** each player presses *jump* on their device.

| | move | jump | power | pause |
|---|---|---|---|---|
| keyboard, left half | A / D | W | E | Esc |
| keyboard, right half | ← / → | ↑ | Enter | Esc |
| controller | left stick | A | X | Start |

Controllers: press any button first so the browser can see them.

## Chapters
1. **The Garden**: plates hold doors and bridges open; stand on each other's heads.
2. **The Toolbox**: Sugar pins walls (Spice stands on pins); Spice slams crates and launch pads.
3. **The Night**: Sugar's lantern makes hidden stones solid; Spice shrinks and grows.
- **Bonk!**: land on your partner's head, first to 5.

## Develop
- `npm test`: level lint, physics, and bots that play every chapter through.
- `node tests/browser.mjs [outDir]`: real-browser smoke with screenshots.
- Design notes: `docs/blueprint.md`.
