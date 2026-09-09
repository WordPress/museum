import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadMuseums, root } from './museums.mjs';

export async function packageSite(destination, directory = root) {
  const { publicFiles, redirects } = await loadMuseums(directory);
  await mkdir(destination, { recursive: true });
  for (const [publicPath, file] of publicFiles) {
    const target = path.join(destination, publicPath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(directory, file), target);
  }
  for (const [file, publicPath] of redirects) {
    const target = path.join(destination, file);
    const relative = path.posix.relative(path.posix.dirname(file), publicPath) + (publicPath.endsWith('/') ? '/' : '');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, redirectPage(relative));
  }
  await writeFile(path.join(destination, '.nojekyll'), '');
  return publicFiles.size + redirects.size;
}

function redirectPage(target) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Museum moved</title>
  <script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
  <noscript><meta http-equiv="refresh" content="0; url=${target}"></noscript>
</head>
<body>
  <p>This experience has moved. <a href="${target}">Continue to the museum.</a></p>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = path.join(root, '_site');
  await rm(destination, { recursive: true, force: true });
  console.log(`Packaged ${await packageSite(destination)} public files in _site/.`);
}
