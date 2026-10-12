// Every instruction names the button in the player's own hand: tips use {tokens},
// and the labels shown for each device match what that device is really bound to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, MINIGAMES, STORY } from '../src/levels.js';
globalThis.window = globalThis.window || { addEventListener() {} };
const { KEYS, LABELS } = await import('../src/input.js');

const BARE = /\b(press|hold|tap)\s+(the\s+)?([A-Z]|Space|Enter|Esc|Shift|Start)\b/i;

test('no tip or story line hard-codes a key', () => {
  const texts = [...CHAPTERS, ...MINIGAMES].flatMap((c) => c.tips);
  for (const k of Object.keys(STORY)) for (const v of Object.values(STORY[k])) if (Array.isArray(v)) texts.push(...v.map((l) => l[1]));
  for (const t of Object.values(STORY.talk)) texts.push(...t.map((l) => l[1]));
  for (const t of texts) assert.ok(!BARE.test(t), `bare key in: "${t}"`);
});

test('negative control: the bare-key check catches one', () => {
  assert.ok(BARE.test('Press E to slam'));
});

test('keyboard labels match the real bindings', () => {
  const name = (code) => code.replace(/^Key/, '').replace('ArrowUp', '↑').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Escape', 'Esc');
  for (const dev of ['kbL', 'kbR']) {
    const L = LABELS[dev], K = KEYS[dev];
    assert.ok(K.jump.map(name).includes(L.jump), `${dev} jump label ${L.jump}`);
    assert.ok(K.ability.map(name).includes(L.ability), `${dev} ability label ${L.ability}`);
    assert.ok(K.ok.map(name).includes(L.ok), `${dev} ok label ${L.ok}`);
    assert.ok(K.back.map(name).includes(L.back), `${dev} back label ${L.back}`);
    for (const part of L.move.split(' / ')) assert.ok([...K.left, ...K.right].map(name).includes(part), `${dev} move ${part}`);
  }
});

test('main.js never prints a raw key name', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const bad of ["'Press W", "'press E", 'Space to', "'Enter'"]) assert.ok(!src.includes(bad), bad);
});
