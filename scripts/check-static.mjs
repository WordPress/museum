import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const pages = [
  'index.html',
  'desktop/index.html',
  'winamp/index.html',
  'kubrick/index.html',
];
const errors = [];

await checkReleaseData();
for (const page of pages) {
  await checkPage(page);
}
await checkWordPressRoutes();

if (errors.length) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.length} HTML pages and the shared release data.`);
}

async function checkReleaseData() {
  const source = await read('data/releases.js');
  const context = vm.createContext({ window: {} });

  try {
    vm.runInContext(source, context, { filename: 'data/releases.js' });
  } catch (error) {
    errors.push(`data/releases.js does not parse: ${error.message}`);
    return;
  }

  const releases = context.window.WP_MUSEUM_RELEASES;
  if (!Array.isArray(releases) || releases.length === 0) {
    errors.push('data/releases.js must assign a non-empty release array.');
    return;
  }

  const versions = new Set();
  let previousDate = '';
  for (const release of releases) {
    if (!release.v || !release.name || !/^\d{4}-\d{2}-\d{2}$/.test(release.date || '')) {
      errors.push(`Invalid release record: ${JSON.stringify(release)}`);
      continue;
    }
    if (versions.has(release.v)) {
      errors.push(`Duplicate release version ${release.v}.`);
    }
    if (release.date < previousDate) {
      errors.push(`Release ${release.v} is out of chronological order.`);
    }
    versions.add(release.v);
    previousDate = release.date;
  }

  const latest = releases.at(-1);
  if (latest?.v !== '7.0' || latest?.name !== 'Armstrong' || latest?.date !== '2026-05-20') {
    errors.push('The latest release must be WordPress 7.0 “Armstrong” from 2026-05-20.');
  }
  if (!versions.has('6.9')) {
    errors.push('WordPress 6.9 is missing from the shared release data.');
  }
}

async function checkPage(relativePath) {
  const html = await read(relativePath);
  const required = [
    /<!doctype html>/i,
    /<html\s+lang="en">/i,
    /<meta\s+name="viewport"/i,
    /<meta\s+name="description"/i,
    /<title>[^<]+<\/title>/i,
  ];
  for (const pattern of required) {
    if (!pattern.test(html)) {
      errors.push(`${relativePath} is missing ${pattern}.`);
    }
  }

  if (relativePath !== 'index.html' && !html.includes('<script src="../data/releases.js"></script>')) {
    errors.push(`${relativePath} does not load the shared release data.`);
  }

  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
    errors.push(`${relativePath} loads a font from a third-party host.`);
  }
  if (/\bMonk\b|2026-02-10|Twenty Twenty-Six/.test(html)) {
    errors.push(`${relativePath} contains the discarded WordPress 7.0 placeholder record.`);
  }
  if (/\b\d+ (?:objects|releases|tracks)\b/i.test(html)) {
    errors.push(`${relativePath} hard-codes a release total instead of deriving it from the shared data.`);
  }

  for (const [index, script] of inlineScripts(html).entries()) {
    try {
      new Function(script);
    } catch (error) {
      errors.push(`${relativePath} inline script ${index + 1} does not parse: ${error.message}`);
    }
  }

  for (const reference of localReferences(html)) {
    const target = path.resolve(root, path.dirname(relativePath), reference);
    try {
      const details = await stat(target);
      if (details.isDirectory()) {
        await stat(path.join(target, 'index.html'));
      }
    } catch {
      errors.push(`${relativePath} points to missing local file ${reference}.`);
    }
  }
}

async function checkWordPressRoutes() {
  const plugin = await read('museum.php');
  const expected = [
    'desktop/index.html',
    'winamp/index.html',
    'kubrick/index.html',
    'data/releases.js',
    'assets/fonts/press-start-2p/PressStart2P-Regular.ttf',
    'assets/fonts/vt323/VT323-Regular.ttf',
  ];
  for (const file of expected) {
    if (!plugin.includes(`'file'  => '${file}'`)) {
      errors.push(`museum.php does not expose ${file}.`);
    }
  }
}

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type="application\/json"/i.test(match[0]))
    .map((match) => match[1]);
}

function localReferences(html) {
  const references = new Set();
  const patterns = [
    /(?:href|src)="([^"]+)"/gi,
    /url\("([^"]+)"\)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = match[1].split(/[?#]/, 1)[0];
      if (value && !value.startsWith('#') && !value.startsWith('/') && !/^[a-z]+:/i.test(value)) {
        references.add(decodeURIComponent(value));
      }
    }
  }
  return references;
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}
