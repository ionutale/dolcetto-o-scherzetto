import { expect, test } from '@playwright/test';
import {
	bagChip,
	collectAllCandies,
	knock,
	knockButton,
	openTitle,
	play,
	prank,
	readBag,
	resolveOutcome,
	seedRun
} from './support/game';

/**
 * T18b — the run autosave (spec §13: versioned key, one slot, autosave). A
 * collected candy must survive a reload: the page writes `dos.run.v1` on every
 * change, and `bootState()` seeds the next boot from it.
 *
 * Seeded to a known doorstep so the test knocks immediately instead of walking.
 */

test('the collected bag survives a reload', async ({ page }) => {
	await seedRun(page, { bag: 3, record: 3, furthestK: 0 });
	await openTitle(page);
	await play(page);

	await expect(knockButton(page)).toBeVisible();
	await knock(page);
	const outcome = await resolveOutcome(page);
	if (outcome === 'scherzo') await prank(page);
	const collected = await collectAllCandies(page);
	expect(collected).toBeGreaterThan(0);

	const bag = await readBag(page);
	expect(bag).toBeGreaterThan(3);

	await page.reload();

	// A fresh boot restored the same bag from `dos.run.v1` — the title chip is
	// the visible proof, and it is rendered behind the menu.
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await expect(bagChip(page)).toHaveText(String(bag));
});
