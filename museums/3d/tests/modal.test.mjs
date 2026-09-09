import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../museum.js', import.meta.url), 'utf8');
const modalSource = source.slice(source.indexOf('function openPlaygroundModal(index) {'), source.indexOf('function updatePanel(release) {'));

for (const reclaimGpu of [false, true]) {
  for (const order of [[0, 1], [1, 0]]) {
    test(`only the latest opening boots, with GPU reclaim ${reclaimGpu} and completion order ${order}`, async () => {
      const museum = createMuseum({ reclaimGpu });
      museum.open(0);
      museum.close();
      museum.open(1);
      museum.runTimers();
      for (const index of order) {
        await museum.resolve(index);
        assert.equal(museum.iframe.src, index === 0 && order[0] === 0 ? 'about:blank' : 'release-1');
      }
      assert.match(museum.title.textContent, /WordPress 6.2/);
    });
  }

  test(`closing discards pending loads with GPU reclaim ${reclaimGpu}`, async () => {
    const museum = createMuseum({ reclaimGpu });
    museum.open(0);
    museum.close();
    museum.runTimers();
    await museum.resolve(0);
    assert.equal(museum.iframe.src, 'about:blank');
  });
}

test('opening another release directly also discards the previous load', async () => {
  const museum = createMuseum();
  museum.open(0);
  museum.open(1);
  await museum.resolve(1);
  await museum.resolve(0);
  assert.equal(museum.iframe.src, 'release-1');
});

test('opening uses native modality and clears held movement keys; closing releases it', () => {
  const museum = createMuseum();
  museum.keys.add('KeyW');
  museum.open(0);
  assert.equal(museum.modal.open, true);
  assert.equal(museum.keys.size, 0);
  museum.close();
  assert.equal(museum.modal.open, false);
  assert.equal(museum.iframe.src, 'about:blank');
  museum.close();
  assert.equal(museum.modal.open, false);
});

test('the native dialog names its content and initially focuses the visible close button', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<dialog[^>]+id="playground-modal"[^>]+aria-labelledby="playground-modal-title"/);
  assert.match(html, /<button[^>]+id="playground-modal-x"[^>]+autofocus/);
  assert.match(html, /<button[^>]+id="playground-modal-close"[^>]+tabindex="-1"/);
});

function createMuseum({ reclaimGpu = false } = {}) {
  const pending = [];
  const timers = [];
  const modal = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  const iframe = { src: 'about:blank' };
  const title = {};
  const elements = { '#playground-modal': modal, '#playground-modal-iframe': iframe, '#playground-modal-title': title };
  const context = vm.createContext({
    keys: new Set(),
    document: { querySelector: (selector) => elements[selector] },
    releases: [{ version: '1.0' }, { version: '6.2' }],
    wrapIndex: (index) => index,
    playgroundModalSession: 0,
    webglContextLost: false,
    loseContextExtension: reclaimGpu ? { loseContext() {}, restoreContext() {} } : null,
    setTimeout: (callback) => timers.push(callback),
    loadRelease: () => new Promise((resolve) => pending.push(resolve)),
  });
  vm.runInContext(`${modalSource}\nplaygroundModalUrlForRelease = loadRelease;`, context);
  return {
    iframe,
    title,
    modal,
    keys: context.keys,
    open: context.openPlaygroundModal,
    close: context.closePlaygroundModal,
    runTimers: () => timers.splice(0).forEach((callback) => callback()),
    async resolve(index) {
      pending[index](`release-${index}`);
      await Promise.resolve();
    },
  };
}
