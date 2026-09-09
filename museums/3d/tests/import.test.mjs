import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { prepareBlueprint } from '../playground.js';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'museum.json'), 'utf8'));
const files = new Set(manifest.files);
const context = vm.createContext({ window: {} });
vm.runInContext(await readFile(path.join(root, 'museum-data.js'), 'utf8'), context);
vm.runInContext(await readFile(path.join(root, 'museum-variants.js'), 'utf8'), context);
const releases = context.window.WP_MUSEUM_RELEASES;
const variants = context.window.WP_MUSEUM_VARIANTS;

test('each historical release has a published Blueprint and screenshot', async () => {
  const index = JSON.parse(await readFile(path.join(root, 'blueprints/wordpress-museum/index.json'), 'utf8'));
  assert.deepEqual(new Set(index.versions.map((release) => release.version)), new Set(releases.map((release) => release.version)));
  for (const release of releases) {
    const slug = release.version.replaceAll('.', '-');
    assert.ok(files.has(release.blueprint.slice(2)), release.blueprint);
    assert.ok(files.has(`assets/wp-screenshots/wp-${slug}.png`), release.version);
    if (release.musician && release.version !== '3.4') {
      assert.ok(files.has(`assets/musicians/wp-${slug}.jpg`), release.version);
    }
    const blueprint = JSON.parse(await readFile(path.join(root, release.blueprint), 'utf8'));
    assert.equal(blueprint.preferredVersions.wp, release.version);
  }
  assert.equal(new Set(releases.map((release) => release.version)).size, releases.length);
  assert.ok(releases.every((release) => context.window.WP_MUSEUM_ERAS.includes(release.era)));
});

test('all design variants have unique slugs and one default', () => {
  assert.equal(new Set(variants.map((variant) => variant.slug)).size, variants.length);
  assert.equal(variants.filter((variant) => variant.isCurrent).length, 1);
  assert.ok(variants.some((variant) => variant.slug === 'permalink-pinball-palace'));
});

test('local script references, asset credits, and GLB dependencies are published', async () => {
  for (const file of files) {
    if (file.endsWith('.js')) {
      const source = await readFile(path.join(root, file), 'utf8');
      for (const [, reference] of source.matchAll(/['"](\.\/[^'"\s`]+)['"]/g)) {
        if (reference.includes('${') || reference.includes('?')) continue;
        const target = path.posix.join(path.posix.dirname(file), reference);
        assert.ok(files.has(target), `${file}: ${reference}`);
      }
    }
    if (file.endsWith('.glb')) {
      const data = await readFile(path.join(root, file));
      assert.equal(data.toString('ascii', 0, 4), 'glTF', file);
      const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
      for (const resource of [...(json.images ?? []), ...(json.buffers ?? [])]) {
        if (!resource.uri || resource.uri.startsWith('data:')) continue;
        assert.ok(files.has(path.posix.join(path.posix.dirname(file), decodeURIComponent(resource.uri))), `${file}: ${resource.uri}`);
      }
    }
  }
  for (const file of ['ASSET_SOURCES.md', 'assets/musicians/manifest.json', 'assets/textures/manifest.json', 'assets/wp-screenshots/manifest.json', 'assets/wapuu/manifest.json', 'assets/wapuu/variations/README.md', 'assets/models/manifest.json']) {
    assert.ok(files.has(file), file);
  }
  for (const pack of ['building', 'furniture', 'retro-urban']) {
    assert.ok(files.has(`assets/models/kenney/${pack}/LICENSE.txt`));
  }
});

test('every Blueprint returns to the current deployment and retains valid PHP', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'museum-blueprints-'));
  try {
    for (const release of releases) {
      const original = JSON.parse(await readFile(path.join(root, release.blueprint), 'utf8'));
      const snapshot = JSON.stringify(original);
      for (const url of [
        'http://127.0.0.1:4173/museums/3d/?variant=permalink-pinball-palace',
        'https://wordpress.github.io/museum/museums/3d/index.html?release=6.2',
        'https://wordpress.org/museum/3d/?release=6.2',
      ]) {
        const prepared = prepareBlueprint(original, url);
        assert.equal(prepared.preferredVersions.php, undefined);
        assert.equal(prepared.preferredVersions.wp, release.version);
        let returnLinks = 0;
        for (const [index, step] of prepared.steps.entries()) {
          if (step.step !== 'runPHP') continue;
          const originalCode = original.steps[index].code;
          const expected = originalCode.replace(/base64_decode\('([A-Za-z0-9+/=]+)'\)/g, (expression, encoded) => {
            const content = Buffer.from(encoded, 'base64').toString('utf8');
            const target = new URL(`?release=${release.version}`, new URL('./', url)).href;
            if (!content.includes('https://janjakes.github.io/wordpress-museum/')) return expression;
            returnLinks++;
            const updated = content.replace(`https://janjakes.github.io/wordpress-museum/?release=${release.version}`, target);
            assert.ok(updated.includes(`href="${target}" target="_blank" rel="noopener"`));
            return `base64_decode('${Buffer.from(updated).toString('base64')}')`;
          });
          assert.equal(step.code, expected);
          const phpFile = path.join(temporary, 'blueprint.php');
          await writeFile(phpFile, step.code);
          execFileSync('php', ['-l', phpFile]);
        }
        assert.equal(returnLinks, 1, release.version);
        assert.equal(JSON.stringify(original), snapshot, 'Source Blueprint must remain unchanged');
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Blueprint preparation preserves unrelated steps and supports absent optional fields', () => {
  const source = { steps: [{ step: 'writeFile', data: 'Unrelated content' }, { step: 'runPHP', code: "<?php echo base64_decode('aGVsbG8=');" }] };
  assert.deepEqual(prepareBlueprint(source, 'https://example.com/museum/3d/'), source);
  assert.deepEqual(prepareBlueprint({}, 'https://example.com/museum/3d/'), {});
});
