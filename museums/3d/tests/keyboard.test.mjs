import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../museum.js', import.meta.url), 'utf8');
const controls = source.slice(source.indexOf('function bindControls() {'), source.indexOf('function enterWalkMode() {'));

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

function bindControls({ modalOpen = false } = {}) {
  const handlers = new Map();
  const elements = new Map();
  const clicks = [];
  const document = {
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener: (type, handler) => handlers.set(type, handler),
    body: element('body'),
  };
  const context = vm.createContext({
    document,
    window: { matchMedia: () => ({ matches: false }), addEventListener() {}, location: { search: '' } },
    canvas: element('#museum-canvas'),
    keys: new Set(),
    isMovementKey: () => false,
    closePlaygroundModal() {},
    URLSearchParams,
  });
  // Bind the actual event handlers without constructing the WebGL scene.
  vm.runInContext(`${controls}\nbindControls();`, context);
  return {
    clicks,
    press(selector, options = {}) {
      const event = {
        code: 'Enter',
        target: element(selector),
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...options,
      };
      handlers.get('keydown')(event);
      return event;
    },
  };

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        addEventListener() {},
        classList: {
          add() {},
          toggle() {},
          contains: (name) => selector === '#playground-modal' && name === 'is-open' && modalOpen,
        },
        click() { clicks.push(selector); },
      });
    }
    return elements.get(selector);
  }
}
