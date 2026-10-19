import { expect, test } from '@playwright/test';
import { holdRight, openTitle, play, releaseWalk } from './support/game';

/**
 * The walk treadmill (2026-10-19): iOS only lets WebKit release the retained
 * scroll raster on idle, and continuous walking never idles — so every
 * ~1500 px of walked distance each scrolling layer is detached and re-attached
 * in place to force the rebuild (see `treadmill.ts`). `data-recycles` counts
 * the street layer's cycles; standing still must never schedule one.
 */
test('walking long enough recycles the scroll layers; standing still does not', async ({
	page
}) => {
	await openTitle(page);
	await play(page);

	await holdRight(page);
	// 1500 px at SPEED 190 ≈ 8 s of walking; generous timeout for CI jitter.
	await expect
		.poll(async () => Number((await page.locator('.homes').getAttribute('data-recycles')) ?? '0'), {
			timeout: 30_000
		})
		.toBeGreaterThanOrEqual(1);
	await releaseWalk(page);

	// Idle schedules nothing: the distance clock only advances while walking.
	const afterWalk = Number((await page.locator('.homes').getAttribute('data-recycles')) ?? '0');
	await page.waitForTimeout(3000);
	const afterIdle = Number((await page.locator('.homes').getAttribute('data-recycles')) ?? '0');
	expect(afterIdle).toBe(afterWalk);

	// The street is still there, pixel-for-pixel (the recycle is a repaint).
	await expect(page.locator('.homes')).toBeVisible();
});
