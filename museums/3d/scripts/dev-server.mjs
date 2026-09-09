import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number.parseInt(process.env.PORT ?? '4173', 10);

const contentTypes = new Map([
	['.css', 'text/css; charset=utf-8'],
	['.html', 'text/html; charset=utf-8'],
	['.js', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.map', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
	['.webp', 'image/webp'],
]);

const server = createServer(async (request, response) => {
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (request.method === 'OPTIONS') {
		response.writeHead(204);
		response.end();
		return;
	}

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405);
		response.end('Method Not Allowed');
		return;
	}

	const filePath = await resolveFilePath(request.url);
	if (!filePath) {
		response.writeHead(404);
		response.end('Not Found');
		return;
	}

	response.setHeader(
		'Content-Type',
		contentTypes.get(extname(filePath)) ?? 'application/octet-stream'
	);
	response.writeHead(200);

	if (request.method === 'HEAD') {
		response.end();
		return;
	}

	createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
	console.log(`WordPress Museum is running at http://127.0.0.1:${port}/`);
});

async function resolveFilePath(requestUrl) {
	const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
	const pathname = decodeURIComponent(url.pathname);
	const normalizedPathname = pathname === '/' ? '/index.html' : pathname;
	const filePath = normalize(join(root, normalizedPathname));
	const relativePath = relative(root, filePath);

	if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
		return undefined;
	}

	try {
		const fileStat = await stat(filePath);
		return fileStat.isFile() ? filePath : undefined;
	} catch {
		return undefined;
	}
}
