import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { createPreviewServer } from '../scripts/dev-server.mjs';
import { contentTypes, loadMuseums, root } from '../scripts/museums.mjs';
import { packageSite } from '../scripts/package-site.mjs';

const { experiences, files } = await loadMuseums();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'museum-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));

test('package includes exactly the public files, unchanged, and the Pages marker', async () => {
  await packageSite(temporary);
  const actual = await readdir(temporary, { recursive: true, withFileTypes: true });
  assert.deepEqual(actual.filter((entry) => entry.isFile()).map((entry) => path.relative(temporary, path.join(entry.parentPath, entry.name))).sort(), [...files, '.nojekyll'].sort());
  for (const file of files) {
    assert.deepEqual(await readFile(path.join(temporary, file)), await readFile(path.join(root, file)), file);
  }
});

test('manifests reject unsafe paths, duplicates, unsupported files, and missing entries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'museum-manifest-'));
  try {
    await mkdir(path.join(directory, 'museums/example'), { recursive: true });
    await writeFile(path.join(directory, 'museums.json'), JSON.stringify({ experiences: ['example'], shared: [] }));
    for (const file of ['../secret.txt', '/secret.txt', '.env', 'code.php', 'assets//file.png', 'index.html']) {
      await writeFile(path.join(directory, 'museums/example/museum.json'), JSON.stringify({ name: 'Example', files: ['index.html', file] }));
      await assert.rejects(loadMuseums(directory), /Invalid public file|Duplicate public file/);
    }
    await writeFile(path.join(directory, 'museums/example/museum.json'), JSON.stringify({ name: 'Example', files: [] }));
    await assert.rejects(loadMuseums(directory), /public index.html/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preview serves all published files under a Pages-style prefix', async () => {
  const server = await createPreviewServer({ basePath: '/museum/' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/museum/`;
    for (const file of files) {
      const response = await fetch(base + file);
      assert.equal(response.status, 200, file);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(root, file)), file);
    }
    for (const { slug } of experiences) {
      const response = await fetch(`${base}museums/${slug}?variant=test`, { redirect: 'manual' });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), `/museum/museums/${slug}/?variant=test`);
      assert.equal((await fetch(`${base}museums/${slug}/`)).status, 200);
    }
    await checkHttpBoundary(base, 'museums/desktop/index.html');
    for (const file of ['museum.php', 'museums.json', 'package.json', 'museums/desktop/museum.json', 'scripts/dev-server.mjs', '%ZZ', '%2e%2e%2fmuseum.php']) {
      assert.ok([400, 404].includes((await fetch(base + file)).status), file);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('WordPress exposes the same files, types, redirects, and HTTP behavior', async () => {
  execFileSync('php', ['-l', 'museum.php'], { cwd: root });
  execFileSync('php', ['tests/wordpress-fixture.php', 'checks'], { cwd: root });
  const routes = JSON.parse(execFileSync('php', ['tests/wordpress-fixture.php', 'routes'], { cwd: root }));
  assert.deepEqual(new Set(Object.values(routes).map((asset) => asset.file)), new Set([...files].filter((file) => file.startsWith('museums/'))));
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, 'tests/wordpress-fixture.php'], { cwd: root, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/museum/`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(base); ready = true; break; } catch { await setTimeout(20); }
    }
    assert.ok(ready, 'PHP server must start');
    for (const [route, asset] of Object.entries(routes)) {
      const response = await fetch(base + route + (asset.directory ? '/' : ''));
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('content-type'), contentTypes[path.extname(asset.file)], route);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(root, asset.file)), route);
    }
    for (const { slug } of experiences) {
      const response = await fetch(`${base}${slug}?variant=test&release=6.2`, { redirect: 'manual' });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), `/museum/${slug}/?variant=test&release=6.2`);
    }
    await checkHttpBoundary(base, 'desktop/');
    for (const route of ['', 'unknown/', 'desktop/museum.json', 'desktop/../../museum.php', 'data/releasesXjs']) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
  } finally {
    server.kill();
    await once(server, 'exit');
  }
});

async function checkHttpBoundary(base, file) {
  const head = await fetch(base + file, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(head.headers.get('access-control-allow-origin'), '*');
  const options = await fetch(base + file, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  const post = await fetch(base + file, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD, OPTIONS');
}
