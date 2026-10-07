const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Small deterministic DOM fixture: exercise the actual event handlers and timers
// without dependencies, network calls, or changing the user's browser settings.
function setup() {
  const timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor(name) {
      this.name = name;
      this.children = [];
      this.style = {};
      this.events = {};
      this.attributes = {};
      this.hidden = false;
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
        contains: name => classes.has(name),
      };
    }
    set innerHTML(value) {
      this.selectors = {};
      for (const selector of ['.companion-avatar', '.companion-panel', '.companion-message', '.companion-surprise', '.companion-close', '[data-action="pause"]', '[data-action="wave"]', '[data-action="stroll"]', '[data-action="hide"]']) {
        this.selectors[selector] = new Element(selector);
      }
      this.selectors['.companion-panel'].hidden = true;
      this.children = [this.selectors['.companion-panel'], this.selectors['.companion-avatar']];
    }
    append(...elements) {
      for (const element of elements) {
        this.children = this.children.filter(child => child !== element);
        this.children.push(element);
      }
    }
    querySelector(selector) { return this.selectors[selector]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    contains(element) { return this.children.includes(element); }
    getBoundingClientRect() { return { top: 250, bottom: 350, left: 600, width: 84, height: 100 }; }
  }
  const host = new Element('hero');
  const document = {
    body: new Element('body'), events: {}, hidden: false,
    querySelector: selector => selector === '.hero-image-wrap' ? host : null,
    createElement: name => new Element(name),
    addEventListener(name, callback) { this.events[name] = callback; },
  };
  const window = {
    events: {}, POSTS: [],
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(name, callback) { this.events[name] = callback; },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../companion.js'), 'utf8'), {
    document, window, innerWidth: 1280, innerHeight: 720, location: { pathname: '/' },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    getComputedStyle: element => ({ visibility: element.style.visibility || 'hidden', transform: element.style.transform || 'none' }),
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const [companion, restore] = document.body.children;
  return {
    companion, restore, document, window, timers,
    avatar: companion.querySelector('.companion-avatar'),
    panel: companion.querySelector('.companion-panel'),
    settle() {
      for (const [id, timer] of timers) {
        if (timer.delay === 140) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('popup follows its trigger in keyboard order and Escape restores focus without scrolling', () => {
  const page = setup();
  assert.deepEqual(page.companion.children.map(child => child.name), ['.companion-avatar', '.companion-panel']);
  page.avatar.events.click();
  assert.equal(page.panel.hidden, false);
  page.document.events.keydown({ key: 'Escape' });
  assert.equal(page.panel.hidden, true);
  assert.equal(page.document.activeElement, page.avatar);
  assert.equal(page.avatar.focusOptions.preventScroll, true);
});

test('scroll hides the avatar immediately, closes its note, and debounces safe repositioning', () => {
  const page = setup();
  page.avatar.events.click();
  page.window.events.scroll();
  assert.equal(page.panel.hidden, true);
  assert.equal(page.companion.style.visibility, 'hidden');
  page.window.events.scroll();
  assert.equal([...page.timers.values()].filter(timer => timer.delay === 140).length, 1);
  // Load/wander callbacks must not expose an old perch during scrolling.
  page.window.events.load();
  [...page.timers.values()].find(timer => timer.delay === 14000).callback();
  assert.equal(page.companion.style.visibility, 'hidden');
  page.settle();
  assert.equal(page.companion.style.visibility, 'visible');
});

test('hide and restore preserve reading position when focus changes', () => {
  const page = setup();
  page.companion.querySelector('[data-action="hide"]').events.click();
  assert.equal(page.companion.hidden, true);
  assert.equal(page.restore.focusOptions.preventScroll, true);
  page.restore.events.click();
  assert.equal(page.companion.hidden, false);
  assert.equal(page.document.activeElement, page.avatar);
  assert.equal(page.avatar.focusOptions.preventScroll, true);
});
