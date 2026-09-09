import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { after, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { createPreviewServer } from '../scripts/dev-server.mjs';
import { contentTypes, loadMuseums, root } from '../scripts/museums.mjs';
import { packageSite } from '../scripts/package-site.mjs';

const { experiences, files, publicFiles, redirects } = await loadMuseums();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'museum-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));

test('package publishes unchanged files at short paths, legacy page redirects, and the Pages marker', async () => {
  await packageSite(temporary);
  const actual = await readdir(temporary, { recursive: true, withFileTypes: true });
  assert.deepEqual(actual.filter((entry) => entry.isFile()).map((entry) => path.relative(temporary, path.join(entry.parentPath, entry.name))).sort(), [...publicFiles.keys(), ...redirects.keys(), '.nojekyll'].sort());
  for (const [publicPath, file] of publicFiles) {
    assert.deepEqual(await readFile(path.join(temporary, publicPath)), await readFile(path.join(root, file)), publicPath);
  }
  for (const file of ['index.html', '3d/index.html', '3d/explorations.html', 'desktop/index.html', 'winamp/index.html']) {
    const html = await readFile(path.join(temporary, file), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"|url\("([^"]+)"\)/g)) {
      const url = new URL(match[1] ?? match[2], `https://example.com/museum/${file}`);
      if (url.origin !== 'https://example.com') continue;
      assert.ok(url.pathname.startsWith('/museum/'), url.href);
      const target = url.pathname.slice('/museum/'.length) + (url.pathname.endsWith('/') ? 'index.html' : '');
      await readFile(path.join(temporary, decodeURIComponent(target)));
    }
  }
});

test('packaged legacy pages redirect under any site prefix and preserve queries and fragments', async () => {
  const directory = path.join(temporary, 'redirects');
  await packageSite(directory);
  const expected = new Map([
    ['museums/desktop/index.html', 'desktop/'],
    ['museums/winamp/index.html', 'winamp/'],
    ['museums/3d/index.html', '3d/'],
    ['museums/3d/explorations.html', '3d/explorations.html'],
  ]);
  assert.deepEqual(redirects, expected);
  for (const [file, target] of expected) {
    const html = await readFile(path.join(directory, file), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const prefix of ['/', '/museum/', '/nested/preview/']) {
      for (const route of new Set([file, file.replace(/index\.html$/, '')])) {
        for (const suffix of ['', '?variant=classic&release=6.2#exhibit', '?next=%2Fmuseum%2F#part%202']) {
          const current = new URL(`https://example.com${prefix}${route}${suffix}`);
          let destination;
          vm.runInNewContext(script, {
            location: { search: current.search, hash: current.hash, replace: (value) => { destination = new URL(value, current).href; } },
          });
          assert.equal(destination, `https://example.com${prefix}${target}${suffix}`);
          const fallback = html.match(/<a href="([^"]+)">/)[1];
          assert.equal(new URL(fallback, current).href, `https://example.com${prefix}${target}`);
          assert.ok(html.includes(`<noscript><meta http-equiv="refresh" content="0; url=${fallback}"></noscript>`));
        }
      }
    }
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
    await writeFile(path.join(directory, 'museums/example/museum.json'), JSON.stringify({ name: 'Example', files: ['index.html'] }));
    await writeFile(path.join(directory, 'museums.json'), JSON.stringify({ experiences: ['example'], shared: ['index.html'] }));
    await assert.rejects(loadMuseums(directory), /Duplicate public file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const basePath of ['/', '/museum/']) {
  test(`preview serves short public paths and legacy redirects under ${basePath}`, async () => {
    const server = await createPreviewServer({ basePath });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const base = `http://127.0.0.1:${server.address().port}${basePath}`;
      for (const [publicPath, file] of publicFiles) {
        const response = await fetch(base + publicPath);
        assert.equal(response.status, 200, file);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(root, file)), file);
      }
      for (const { slug } of experiences) {
        const response = await fetch(`${base}${slug}?variant=test`, { redirect: 'manual' });
        assert.equal(response.status, 301);
        assert.equal(response.headers.get('location'), `${basePath}${slug}/?variant=test`);
        assert.equal((await fetch(`${base}${slug}/`)).status, 200);
      }
      for (const [file, target] of redirects) {
        for (const route of new Set([file, file.replace(/index\.html$/, ''), file.replace(/\/index\.html$/, '')])) {
          for (const method of ['GET', 'HEAD']) {
            const response = await fetch(`${base}${route}?variant=test&release=6.2`, { method, redirect: 'manual' });
            assert.equal(response.status, 301, route);
            assert.equal(response.headers.get('location'), `${basePath}${target}?variant=test&release=6.2`);
            assert.equal((await fetch(base + route)).status, 200, route);
          }
        }
      }
      await checkHttpBoundary(base, 'desktop/index.html');
      for (const file of ['museum.php', 'museums.json', 'package.json', 'desktop/museum.json', 'museums/desktop/museum.json', 'museums/unknown/', 'museums/data/releases.js', 'scripts/dev-server.mjs', '%ZZ', '%2e%2e%2fmuseum.php']) {
        assert.ok([400, 404].includes((await fetch(base + file)).status), file);
      }
      if (basePath !== '/') assert.equal((await fetch(new URL('/desktop/', base))).status, 404);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}

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
    await checkAssetCaching(base);
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

async function checkAssetCaching(base) {
  const policies = new Map([
    ['no-cache', [
      'desktop/',
      'winamp/',
      '3d/',
      '3d/index.html',
      '3d/explorations.html',
      '3d/style.css',
      '3d/museum.js',
      '3d/playground.js',
    ]],
    ['public, max-age=3600', [
      'data/releases.js',
      '3d/blueprints/wordpress-museum/wp-6-2.json',
      '3d/assets/musicians/wp-1-0.jpg',
      '3d/assets/wp-screenshots/wp-0-7.png',
      '3d/assets/wapuu/wapuu-original.svg',
      '3d/assets/models/kenney/furniture/benchCushion.glb',
    ]],
    ['public, max-age=31536000, immutable', [
      'assets/fonts/press-start-2p/PressStart2P-Regular.ttf',
      'assets/fonts/vt323/VT323-Regular.ttf',
    ]],
  ]);
  for (const [policy, routes] of policies) {
    for (const route of routes) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(base + route, { method });
        assert.equal(response.status, 200, `${method} ${route}`);
        assert.equal(response.headers.get('cache-control'), policy, `${method} ${route}`);
        await response.arrayBuffer();
      }
    }
  }
}
