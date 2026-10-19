import { expect, test } from '@playwright/test';
import { holdRight, openTitle, play, releaseWalk } from './support/game';

/**
 * The canvas world (T4, 2026-10-19): the scrolling street — houses, decor,
 * cars, parallax — is one canvas, a single backing store redrawn in place.
 * Proof the smoke asks for: the canvas exists, it actually paints (non-empty
 * pixels in the street band), and walking over it neither blanks it nor
 * breaks the scene. The crash story itself is the device's to judge; this
 * pins the wiring.
 */
test('the canvas world draws the street and survives walking', async ({ page }) => {
	await openTitle(page);
	await play(page);

	const canvas = page.locator('canvas[data-world]');
	await expect(canvas).toBeVisible();

	// It paints: sample a wide band over the house/yard rows and count pixels
	// with any alpha. The rasters decode asynchronously, so poll.
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const c = document.querySelector('canvas[data-world]') as HTMLCanvasElement | null;
					const ctx = c?.getContext('2d');
					if (!c || !ctx) return 0;
					const y = Math.floor(c.height * 0.55);
					const h = Math.max(1, Math.floor(c.height * 0.2));
					const data = ctx.getImageData(0, y, c.width, h).data;
					let lit = 0;
					for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
					return lit;
				}),
			{ timeout: 15_000 }
		)
		.toBeGreaterThan(1000);

	// The frame loop runs (data-frames lands every 30 frames).
	await expect
		.poll(async () => Number((await canvas.getAttribute('data-frames')) ?? '0'), {
			timeout: 10_000
		})
		.toBeGreaterThan(0);

	// Walking across it keeps the scene alive.
	await holdRight(page);
	await page.waitForTimeout(2500);
	await releaseWalk(page);
	await expect(canvas).toBeVisible();
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const c = document.querySelector('canvas[data-world]') as HTMLCanvasElement | null;
					const ctx = c?.getContext('2d');
					if (!c || !ctx) return 0;
					const data = ctx.getImageData(0, Math.floor(c.height * 0.55), c.width, 40).data;
					let lit = 0;
					for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
					return lit;
				}),
			{ timeout: 10_000 }
		)
		.toBeGreaterThan(1000);
});
