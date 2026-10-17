/**
 * Build-time PWA icon generator → `static/icons/*.png`.
 *
 * Renders `static/icons/mark.svg` with Playwright (already a dev
 * dependency — no new packages) at each target size and writes the PNG set
 * the manifest points at:
 *
 *   - icon-192.png / icon-512.png        the full icon
 *   - icon-512-maskable.png             same source: the bucket mark is drawn
 *                                       inside the central 80% safe zone, so
 *                                       the OS mask never crops anything
 *                                       important (the moon and sparkles are
 *                                       decorative edge dressing)
 *   - apple-touch-icon.png (180)       the iOS home-screen icon
 *
 * The SVG is the single source of truth — edit it, then regenerate:
 *
 *   node tools/gen-icons.mjs
 *
 * Every output is validated against the PNG magic bytes with a non-zero
 * exit, the same silence-is-not-an-option rule as the sibling project's
 * tool. Writes are plain overwrites, so the script is idempotent.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = join(ROOT, 'static', 'icons', 'mark.svg');
const OUT_DIR = join(ROOT, 'static', 'icons');

const TARGETS = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'icon-512-maskable.png', size: 512 },
	{ file: 'apple-touch-icon.png', size: 180 }
];

const svgSource = readFileSync(SVG_PATH, 'utf8');
for (const attr of ['width="512"', 'height="512"', 'xmlns="http://www.w3.org/2000/svg"']) {
	if (!svgSource.includes(attr)) {
		console.error(`${SVG_PATH} is missing ${attr} — cannot render icons.`);
		process.exit(1);
	}
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
	for (const { file, size } of TARGETS) {
		const svg = svgSource
			.replaceAll('width="512"', `width="${size}"`)
			.replaceAll('height="512"', `height="${size}"`);
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
		const png = await page.locator('svg').screenshot();
		await page.close();

		// A blank or truncated render would still be a valid-looking file on
		// disk and only show up as a broken icon on someone's home screen.
		const isPng =
			png.length > 8 &&
			png[0] === 0x89 &&
			png[1] === 0x50 &&
			png[2] === 0x4e &&
			png[3] === 0x47 &&
			png[4] === 0x0d &&
			png[5] === 0x0a &&
			png[6] === 0x1a &&
			png[7] === 0x0a;
		if (!isPng) {
			console.error(`${file}: render did not produce a valid PNG.`);
			process.exit(1);
		}
		writeFileSync(join(OUT_DIR, file), png);
		console.log(`${file}  ${png.length} bytes  OK`);
	}
} finally {
	await browser.close();
}

console.log(`Done. ${TARGETS.length} icons written to static/icons/.`);
