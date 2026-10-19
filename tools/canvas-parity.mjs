#!/usr/bin/env node
/**
 * T4 canvas-parity harness (2026-10-19): screenshot one build of the game at
 * a fixed seeded save, for side-by-side eyeballing against another build.
 *
 *   node tools/canvas-parity.mjs <url> <out.png> [furthestK]
 *
 * Seeds `dos.run.v1` (bag 5416, the kid's live save shape) and a silent
 * settings envelope before the page boots, taps Gioca, waits for the canvas
 * rasters to decode, and screenshots the 852×393 stage frame at 2×.
 */
import { chromium } from '@playwright/test';

const [, , url, out, kArg, flipArg] = process.argv;
if (!url || !out) {
	console.error('usage: node tools/canvas-parity.mjs <url> <out.png> [furthestK] [flip]');
	process.exit(1);
}
const furthestK = Number(kArg ?? 350);
const flip = flipArg === 'portrait' ? 'portrait' : 'landscape';

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: flip === 'portrait' ? { width: 420, height: 900 } : { width: 1000, height: 520 },
	deviceScaleFactor: 2
});
await context.addInitScript(
	([runK, runFlip]) => {
		try {
			localStorage.setItem(
				'dos.run.v1',
				JSON.stringify({ version: 1, bag: 5416, record: 0, tricks: ['boo'], furthestK: runK })
			);
			localStorage.setItem(
				'dos.settings.v1',
				JSON.stringify({
					version: 1,
					lang: 'it',
					sound: false,
					musicVolume: 0,
					sfxVolume: 0,
					flip: runFlip
				})
			);
		} catch {
			/* hostile storage: screenshot the defaults */
		}
	},
	[furthestK, flip]
);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.locator('.menu-play').waitFor({ state: 'attached', timeout: 20_000 });
await page.locator('.menu-play').click({ force: true });
await page.waitForTimeout(3200);
await page.locator('.stage-frame').screenshot({ path: out });
console.log(`saved ${out} (errors: ${errors.length})`);
if (errors.length) console.log(errors.slice(0, 8).join('\n'));
await browser.close();
