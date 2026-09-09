import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ignoredExtensions = new Set(['.md']);
const root = new URL('..', import.meta.url);
const defaultDirectory = new URL('assets/wapuu/variations/', root);
const args = process.argv.slice(2);
const targets = args.length > 0 ? args : [defaultDirectory.pathname];
const files = await collectPngFiles(targets);
let failures = 0;

if (files.length === 0) {
	console.error('No Wapuu PNG files found to check.');
	process.exit(1);
}

for (const file of files) {
	try {
		const report = inspectPng(await readFile(file));
		const displayPath = relative(root.pathname, file);
		const issues = getWapuuIssues(report);

		if (issues.length > 0) {
			failures += 1;
			console.error(`FAIL ${displayPath}`);
			for (const issue of issues) {
				console.error(`  - ${issue}`);
			}
			continue;
		}

		console.log(
			`PASS ${displayPath} (${report.width}x${report.height}, ` +
				`${Math.round(report.transparentRatio * 100)}% transparent)`
		);
	} catch (error) {
		failures += 1;
		console.error(`FAIL ${relative(root.pathname, file)}`);
		console.error(`  - ${error.message}`);
	}
}

process.exitCode = failures > 0 ? 1 : 0;

async function collectPngFiles(paths) {
	const files = [];
	for (const path of paths) {
		const fileStat = await stat(path);
		if (fileStat.isDirectory()) {
			const entries = await readdir(path);
			for (const entry of entries) {
				const extension = extname(entry).toLowerCase();
				if (!ignoredExtensions.has(extension)) {
					files.push(join(path, entry));
				}
			}
			continue;
		}

		files.push(path);
	}
	return files.sort();
}

function getWapuuIssues(report) {
	const issues = [];
	if (!report.isPng) {
		issues.push('file is not a PNG');
		return issues;
	}
	if (!report.hasAlpha) {
		issues.push('PNG does not have an alpha channel or transparency data');
	}
	if (report.transparentPixels === 0) {
		issues.push('PNG has no fully transparent pixels');
	}
	if (report.transparentRatio < 0.05) {
		issues.push('less than 5% of the image is transparent');
	}
	if (report.cornerAlpha?.some((alpha) => alpha > 8)) {
		issues.push('one or more image corners are not transparent');
	}
	return issues;
}

function inspectPng(buffer) {
	if (!buffer.subarray(0, 8).equals(pngSignature)) {
		return { isPng: false };
	}

	const chunks = readChunks(buffer);
	const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
	if (!ihdr) {
		throw new Error('missing IHDR chunk');
	}

	const width = ihdr.readUInt32BE(0);
	const height = ihdr.readUInt32BE(4);
	const bitDepth = ihdr[8];
	const colorType = ihdr[9];
	if (bitDepth !== 8) {
		throw new Error(`unsupported bit depth ${bitDepth}; expected 8-bit PNG`);
	}

	const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data;
	const transparency = chunks.find((chunk) => chunk.type === 'tRNS')?.data;
	const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
	if (idat.length === 0) {
		throw new Error('missing IDAT image data');
	}

	const channels = getChannelCount(colorType);
	const scanlineLength = width * channels;
	const inflated = inflateSync(idat);
	const pixels = unfilterScanlines(inflated, width, height, channels, scanlineLength);
	const alpha = extractAlpha(pixels, width, height, colorType, channels, palette, transparency);
	const transparentPixels = alpha.filter((value) => value === 0).length;
	const cornerIndexes = [0, width - 1, (height - 1) * width, width * height - 1];

	return {
		isPng: true,
		width,
		height,
		hasAlpha: colorType === 4 || colorType === 6 || Boolean(transparency),
		transparentPixels,
		transparentRatio: transparentPixels / (width * height),
		cornerAlpha: cornerIndexes.map((index) => alpha[index]),
	};
}

function readChunks(buffer) {
	const chunks = [];
	let offset = 8;
	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString('ascii', offset + 4, offset + 8);
		const dataStart = offset + 8;
		chunks.push({
			type,
			data: buffer.subarray(dataStart, dataStart + length),
		});
		offset = dataStart + length + 4;
		if (type === 'IEND') {
			break;
		}
	}
	return chunks;
}

function getChannelCount(colorType) {
	switch (colorType) {
		case 0:
			return 1;
		case 2:
			return 3;
		case 3:
			return 1;
		case 4:
			return 2;
		case 6:
			return 4;
		default:
			throw new Error(`unsupported PNG color type ${colorType}`);
	}
}

function unfilterScanlines(data, width, height, channels, scanlineLength) {
	const pixels = Buffer.alloc(width * height * channels);
	let inputOffset = 0;
	let outputOffset = 0;
	let previousLine = Buffer.alloc(scanlineLength);

	for (let y = 0; y < height; y++) {
		const filterType = data[inputOffset++];
		const scanline = Buffer.from(data.subarray(inputOffset, inputOffset + scanlineLength));
		inputOffset += scanlineLength;

		for (let x = 0; x < scanlineLength; x++) {
			const left = x >= channels ? scanline[x - channels] : 0;
			const up = previousLine[x] ?? 0;
			const upLeft = x >= channels ? previousLine[x - channels] : 0;
			scanline[x] = (scanline[x] + getFilterByte(filterType, left, up, upLeft)) & 0xff;
		}

		scanline.copy(pixels, outputOffset);
		outputOffset += scanlineLength;
		previousLine = scanline;
	}

	return pixels;
}

function getFilterByte(filterType, left, up, upLeft) {
	switch (filterType) {
		case 0:
			return 0;
		case 1:
			return left;
		case 2:
			return up;
		case 3:
			return Math.floor((left + up) / 2);
		case 4:
			return paethPredictor(left, up, upLeft);
		default:
			throw new Error(`unsupported PNG filter type ${filterType}`);
	}
}

function paethPredictor(left, up, upLeft) {
	const estimate = left + up - upLeft;
	const leftDistance = Math.abs(estimate - left);
	const upDistance = Math.abs(estimate - up);
	const upLeftDistance = Math.abs(estimate - upLeft);
	if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
		return left;
	}
	return upDistance <= upLeftDistance ? up : upLeft;
}

function extractAlpha(pixels, width, height, colorType, channels, palette, transparency) {
	const alpha = new Array(width * height).fill(255);

	for (let index = 0; index < width * height; index++) {
		const offset = index * channels;
		if (colorType === 4 || colorType === 6) {
			alpha[index] = pixels[offset + channels - 1];
		} else if (colorType === 3 && transparency) {
			alpha[index] = transparency[pixels[offset]] ?? 255;
		} else if (colorType === 0 && transparency) {
			alpha[index] = pixels[offset] === transparency[1] ? 0 : 255;
		} else if (colorType === 2 && transparency) {
			const r = transparency.readUInt16BE(0);
			const g = transparency.readUInt16BE(2);
			const b = transparency.readUInt16BE(4);
			alpha[index] = pixels[offset] === r && pixels[offset + 1] === g && pixels[offset + 2] === b ? 0 : 255;
		}
	}

	if (colorType === 3 && !palette) {
		throw new Error('indexed PNG is missing PLTE chunk');
	}

	return alpha;
}
