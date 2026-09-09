import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadMuseums, root } from './museums.mjs';

export async function packageSite(destination, directory = root) {
  const { files } = await loadMuseums(directory);
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(directory, file), target);
  }
  await writeFile(path.join(destination, '.nojekyll'), '');
  return files.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = path.join(root, '_site');
  await rm(destination, { recursive: true, force: true });
  console.log(`Packaged ${await packageSite(destination)} public files in _site/.`);
}
