#!/usr/bin/env node
// Stamps a content-hash cache-busting query (?v=<hash>) onto the local asset
// references in index.html, so deployed changes are picked up without a manual
// hard refresh (this matters most on mobile, where fully refreshing is fiddly).
//
// Each asset gets its own short hash, so only the files that actually changed
// get a new ?v= and are re-downloaded. The CDN-hosted three.js import is left
// alone (it is already a versioned URL).
//
// Run this before committing/deploying a change:  node scripts/stamp-cache-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = ['style.css', 'museum-variants.js', 'museum-data.js', 'museum.js'];
const htmlPath = join(root, 'index.html');

let html = readFileSync(htmlPath, 'utf8');
let changed = false;

for (const asset of assets) {
	const hash = createHash('sha1')
		.update(readFileSync(join(root, asset)))
		.digest('hex')
		.slice(0, 8);
	// Match ./asset optionally followed by an existing ?v=... and re-stamp it.
	const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`(\\./${escaped})(\\?v=[a-f0-9]+)?`, 'g');
	const next = html.replace(pattern, `$1?v=${hash}`);
	if (next !== html) {
		changed = true;
		html = next;
	}
	console.log(`${asset} -> ?v=${hash}`);
}

writeFileSync(htmlPath, html);
console.log(changed ? 'index.html updated.' : 'index.html already up to date.');
