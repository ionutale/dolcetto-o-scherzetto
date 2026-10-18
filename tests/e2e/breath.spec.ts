import { expect, test } from '@playwright/test';
import { holdRight, openTitle, play, releaseWalk } from './support/game';

/**
 * The raster breath (the pure-walk diagnosis, 2026-10-18): WebKit's street
 * tile cache grows while scrolling and is released only when the page idles —
 * the phone dies after ~20 s of nonstop walking. After roughly twelve seconds
 * of walking, the street hides its scrolling subtree for one committed frame
 * (releasing the raster cache) and restores it; `data-breaths` counts those
 * releases.
 */
test('walking long enough triggers the street breath', async ({ page }) => {
	await openTitle(page);
	await play(page);

	// One continuous hold: the walk crosses doorways (knock clouds appear and
	// pass) without stopping — exactly the device's "all I did was walk" case.
	await holdRight(page);
	await expect
		.poll(async () => Number((await page.locator('.homes').getAttribute('data-breaths')) ?? '0'), {
			timeout: 30_000
		})
		.toBeGreaterThanOrEqual(1);
	await releaseWalk(page);

	// The street came back (the breath restores within a frame).
	await expect(page.locator('.homes')).toBeVisible();
});
