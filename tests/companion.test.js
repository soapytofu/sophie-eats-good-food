const test = require('node:test');
const assert = require('node:assert/strict');
const { clampPoint, choosePerch, movementPlan } = require('../companion.js');

test('avatar remains inside both small and desktop viewports', () => {
  assert.deepEqual(clampPoint({ x: -50, y: -20 }, 320, 568), { x: 12, y: 12 });
  assert.deepEqual(clampPoint({ x: 2000, y: 2000 }, 1280, 900), { x: 1184, y: 768 });
  assert.deepEqual(clampPoint({ x: 150, y: 120 }, 320, 568), { x: 150, y: 120 });
});

test('only visible, entirely on-screen perches can be selected', () => {
  const hidden = { name: 'hidden', visible: false, top: 0, bottom: 0 };
  const offscreen = { name: 'offscreen', top: 850, bottom: 950 };
  const near = { name: 'near', top: 540, bottom: 640 };
  const far = { name: 'far', top: 10, bottom: 110 };
  assert.equal(choosePerch([hidden, offscreen, far, near], 900), near);
  assert.equal(choosePerch([hidden, offscreen], 900), undefined);
});

test('local walks have a natural pace instead of a rapid glide', () => {
  const short = movementPlan({ x: 100, y: 100 }, { x: 130, y: 100 });
  const longer = movementPlan({ x: 100, y: 100 }, { x: 220, y: 100 });
  assert.equal(short.kind, 'walk');
  assert.equal(short.duration, 750);
  assert.equal(longer.kind, 'walk');
  assert.ok(longer.duration > short.duration);
  assert.ok(longer.duration < 1900);
});

test('large or vertical relocations do not fly through the article', () => {
  assert.equal(movementPlan({ x: 100, y: 100 }, { x: 900, y: 400 }).kind, 'arrive');
  assert.equal(movementPlan({ x: 100, y: 100 }, { x: 100, y: 180 }).kind, 'arrive');
  assert.deepEqual(movementPlan({ x: 100, y: 100 }, { x: 102, y: 101 }), { kind: 'still', duration: 0 });
});
