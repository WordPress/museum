import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../museum.js', import.meta.url), 'utf8');
const controls = source.slice(source.indexOf('function bindControls() {'), source.indexOf('function initDebugApi() {'));

test('Enter opens Playground once from the museum canvas or page background', () => {
  for (const selector of ['body', '#museum-canvas']) {
    const { press, clicks } = bindControls();
    const event = press(selector);
    assert.deepEqual(clicks, ['#open-playground']);
    assert.equal(event.defaultPrevented, true);
  }
});

test('Enter leaves buttons, links, and editable controls to their native handlers', () => {
  for (const selector of ['#next-release', '#tour-button', '#playground-modal-x', '#open-playground', 'input', 'textarea', '[contenteditable]', 'button span']) {
    const { press, clicks } = bindControls();
    const event = press(selector);
    assert.deepEqual(clicks, [], selector);
    assert.equal(event.defaultPrevented, false, selector);
  }
});

test('Playground ignores repeated, consumed, composing, and modified shortcuts', () => {
  for (const options of [{ repeat: true }, { defaultPrevented: true }, { isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { code: 'Space' }]) {
    const { press, clicks } = bindControls();
    press('body', options);
    assert.deepEqual(clicks, [], JSON.stringify(options));
  }
});

test('Enter does not reopen Playground while its modal is visible', () => {
  const { press, clicks } = bindControls({ modalOpen: true });
  const event = press('body');
  assert.deepEqual(clicks, []);
  assert.equal(event.defaultPrevented, false);
});

test('modal keys and wheel events do not control the museum', () => {
  const { press, dispatch, keys } = bindControls({ modalOpen: true });
  for (const code of ['KeyW', 'ArrowLeft', 'Space', 'Escape', 'Tab']) {
    assert.equal(press('#playground-modal-x', { code }).defaultPrevented, false);
  }
  assert.equal(keys.size, 0);
  keys.add('KeyW');
  assert.equal(dispatch('keyup', { code: 'KeyW' }).defaultPrevented, false);
  assert.equal(keys.size, 0);
  assert.equal(dispatch('wheel').defaultPrevented, false);
});

test('native cancellation and both close controls use modal cleanup', () => {
  for (const [selector, type] of [['#playground-modal', 'cancel'], ['#playground-modal-close', 'click'], ['#playground-modal-x', 'click']]) {
    const museum = bindControls({ modalOpen: true });
    const event = museum.dispatch(`${selector}:${type}`);
    assert.deepEqual(museum.clicks, ['close']);
    assert.equal(event.defaultPrevented, type === 'cancel');
  }
});

test('unsupported Pointer Lock hides Walk and ignores Walk and empty-scene clicks', () => {
  const museum = bindControls();
  assert.equal(museum.element('#walk-button').hidden, true);
  assert.doesNotThrow(() => museum.dispatch('#walk-button:click'));
  assert.doesNotThrow(() => museum.dispatch('#museum-canvas:click'));
});

test('Pointer Lock supports legacy void returns, promises, and rejected requests', async () => {
  for (const result of [() => undefined, () => Promise.resolve(), () => Promise.reject(new Error('Lock denied'))]) {
    let requests = 0;
    const museum = bindControls({ requestPointerLock() { requests++; return result(); } });
    assert.equal(museum.element('#walk-button').hidden, false);
    museum.dispatch('#walk-button:click');
    museum.dispatch('#museum-canvas:click');
    assert.equal(requests, 2);
    await Promise.resolve();
    museum.document.pointerLockElement = museum.element('#museum-canvas');
    museum.dispatch('#walk-button:click');
    assert.equal(requests, 2);
  }
});

test('touch looking and movement remain available without Pointer Lock', () => {
  const museum = bindControls();
  museum.dispatch('#museum-canvas:pointerdown', { pointerType: 'touch', clientX: 10, clientY: 20 });
  museum.dispatch('window:pointermove', { clientX: 30, clientY: 25 });
  assert.deepEqual(museum.turns, [[20, 5]]);
  museum.dispatch('window:pointerup');
  museum.dispatch('window:pointermove', { clientX: 40, clientY: 40 });
  assert.equal(museum.turns.length, 1);
  museum.dispatch('#museum-canvas:click');
  museum.dispatch('forward:pointerdown');
  assert.equal(museum.mobileMotion.forward, true);
  museum.dispatch('forward:pointerup');
  assert.equal(museum.mobileMotion.forward, false);
});

function bindControls({ modalOpen = false, requestPointerLock } = {}) {
  const handlers = new Map();
  const elements = new Map();
  const clicks = [];
  const turns = [];
  const document = {
    querySelector: element,
    querySelectorAll: (selector) => selector === '[data-mobile-move]' ? [element('forward')] : [],
    addEventListener: (type, handler) => handlers.set(type, handler),
    body: element('body'),
  };
  element('#museum-canvas').requestPointerLock = requestPointerLock;
  const context = vm.createContext({
    document,
    window: { matchMedia: () => ({ matches: false }), addEventListener: (type, handler) => handlers.set(`window:${type}`, handler), location: { search: '' } },
    canvas: element('#museum-canvas'),
    keys: new Set(),
    isMovementKey: (code) => ['KeyW', 'ArrowLeft', 'Space'].includes(code),
    closePlaygroundModal() { clicks.push('close'); },
    stopGuidedTour() {},
    guidedTarget: null,
    dragMoved: false,
    dragging: false,
    lastPointer: null,
    mobileMotion: {},
    turnCamera: (x, y) => turns.push([x, y]),
    pickFromPointerEvent: () => false,
    URLSearchParams,
  });
  // Bind the actual event handlers without constructing the WebGL scene.
  vm.runInContext(`${controls}\nbindControls();`, context);
  return {
    clicks,
    turns,
    document,
    element,
    mobileMotion: context.mobileMotion,
    keys: context.keys,
    dispatch,
    press(selector, options = {}) {
      return dispatch('keydown', { code: 'Enter', target: element(selector), ...options });
    },
  };

  function dispatch(type, options = {}) {
    const event = {
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...options,
    };
    handlers.get(type)(event);
    return event;
  }

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        dataset: { mobileMove: selector },
        open: selector === '#playground-modal' && modalOpen,
        addEventListener: (type, handler) => handlers.set(`${selector}:${type}`, handler),
        classList: {
          add() {},
          toggle() {},
        },
        click() { clicks.push(selector); },
      });
    }
    return elements.get(selector);
  }
}
