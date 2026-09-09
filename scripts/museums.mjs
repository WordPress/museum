import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');
export const contentTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ttf': 'font/ttf',
  '.md': 'text/plain; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
};

export async function loadMuseums(directory = root) {
  const registry = JSON.parse(await readFile(path.join(directory, 'museums.json'), 'utf8'));
  const experiences = [];
  const files = new Set(['index.html', 'LICENSE', 'CREDITS.md']);
  const slugs = new Set();

  for (const slug of registry.experiences) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slugs.has(slug) || ['assets', 'data'].includes(slug)) {
      throw new Error(`Invalid or duplicate experience slug: ${slug}`);
    }
    slugs.add(slug);
    const manifest = JSON.parse(await readFile(path.join(directory, 'museums', slug, 'museum.json'), 'utf8'));
    if (!manifest.name || !manifest.files.includes('index.html')) {
      throw new Error(`${slug} needs a name and a public index.html.`);
    }
    for (const file of manifest.files) {
      addFile(`museums/${slug}/`, file);
    }
    experiences.push({ ...manifest, slug });
  }
  for (const file of registry.shared) {
    addFile('museums/', file);
  }

  const realRoot = await realpath(directory);
  for (const file of files) {
    const absolute = path.join(directory, file);
    const relative = path.relative(realRoot, await realpath(absolute));
    if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(absolute)).isFile()) {
      throw new Error(`Public file must be a regular file inside the repository: ${file}`);
    }
  }
  return { experiences, files };

  function addFile(prefix, file) {
    if (typeof file !== 'string' || !/^[\w./-]+$/.test(file) || file.split('/').some((part) => !part || part.startsWith('.')) || !contentTypes[path.extname(file)]) {
      throw new Error(`Invalid public file: ${file}`);
    }
    const relative = prefix + file;
    if (files.has(relative)) {
      throw new Error(`Duplicate public file: ${relative}`);
    }
    files.add(relative);
  }
}
