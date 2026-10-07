const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { wrapIndex } = require('../gallery.js');
const source = fs.readFileSync(path.join(__dirname, '../gallery.js'), 'utf8');

function element() {
  return {
    listeners: {}, hidden: false, textContent: '',
    addEventListener(name, callback) { this.listeners[name] = callback; },
    fire(name, event = {}) { this.listeners[name]?.({ target: this, ...event }); },
    focus(options) { this.focusOptions = options; },
    removeAttribute(name) { delete this[name]; },
  };
}
function fixture(total = 2) {
  const image = element(), caption = element(), counter = element();
  const close = element(), previous = element(), next = element();
  const controls = {
    '.life-lightbox-image': image, '.life-lightbox-caption': caption,
    '.life-lightbox-counter': counter, '.life-lightbox-close': close,
    '[data-gallery-prev]': previous, '[data-gallery-next]': next,
  };
  const dialog = Object.assign(element(), {
    querySelector: selector => controls[selector],
    showModal() { this.open = true; },
    close() { this.open = false; this.fire('close'); },
  });
  const triggers = [];
  const photos = Array.from({ length: total }, (_, index) => {
    const trigger = element(); triggers.push(trigger);
    return {
      querySelector: selector => selector === 'img' ? { src: `/images/${index}.jpg`, alt: `Photo ${index}` } : trigger,
      querySelectorAll: () => index ? [] : [{ textContent: '<a quiet afternoon>' }, { textContent: 'October' }],
    };
  });
  vm.runInNewContext(source, { document: {
    querySelector: () => dialog, querySelectorAll: () => photos,
  } });
  return { dialog, image, caption, counter, close, previous, next, triggers };
}

test('photo indices wrap in both directions, including empty albums', () => {
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(7, 3), 1);
  assert.equal(wrapIndex(1, 0), 0);
});
test('opens the selected photo and navigates without interpreting caption markup', () => {
  const f = fixture();
  f.triggers[1].fire('click');
  assert.equal(f.dialog.open, true);
  assert.equal(f.image.src, '/images/1.jpg');
  assert.equal(f.image.alt, 'Photo 1');
  assert.equal(f.counter.textContent, '2 / 2');
  assert.equal(f.caption.hidden, true);
  assert.equal(f.close.focusOptions.preventScroll, true);
  f.next.fire('click');
  assert.equal(f.image.src, '/images/0.jpg');
  assert.equal(f.caption.textContent, '<a quiet afternoon> · October');
  assert.equal(f.caption.hidden, false);
  f.previous.fire('click');
  assert.equal(f.counter.textContent, '2 / 2');
});
test('arrow navigation and closing restore keyboard focus without scrolling', () => {
  const f = fixture();
  f.triggers[0].fire('click');
  let prevented = false;
  f.dialog.fire('keydown', { key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.counter.textContent, '2 / 2');
  f.close.fire('click');
  assert.equal(f.dialog.open, false);
  assert.equal(f.image.src, undefined);
  assert.equal(f.triggers[0].focusOptions.preventScroll, true);
});
test('backdrop closes viewer and single-photo albums hide browse buttons', () => {
  const f = fixture(1);
  assert.equal(f.previous.hidden, true);
  assert.equal(f.next.hidden, true);
  f.triggers[0].fire('click');
  f.dialog.fire('click', { target: f.image });
  assert.equal(f.dialog.open, true);
  f.dialog.fire('click');
  assert.equal(f.dialog.open, false);
});
test('empty album needs no viewer initialization', () => {
  const f = fixture(0);
  assert.equal(f.dialog.listeners.keydown, undefined);
});
