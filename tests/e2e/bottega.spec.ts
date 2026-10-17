import { expect, test } from '@playwright/test';
import { bagChip, openTitle, play, readRun, seedRun } from './support/game';

/**
 * The Bottega (spec §8: bag = wallet, §4.3: the witch keeps the shop).
 *
 * Seeded so the arithmetic is the point of the test: a bag of exactly the
 * Rubber Spider's price (15) so the purchase is the boundary case the reducer
 * allows (`canBuy` needs `bag >= price`), and the row right behind it must go
 * `poor` + `disabled` once the bag is empty.
 */

test('Bottega: buying the Rubber Spider spends 15 and is autosaved', async ({ page }) => {
	await seedRun(page, { bag: 15, record: 15, furthestK: 5 });
	await openTitle(page);

	// The boot restored the save: the chip already reads the seeded bag.
	await expect(bagChip(page)).toHaveText('15');

	await play(page);
	await page.locator('#bottegaBtn').click({ force: true });

	// Italian default → the row is "Ragnetto" (economy.ts IT name).
	const row = page.locator('.shopitem', { hasText: 'Ragnetto' }).first();
	await expect(row.locator('.pricechip')).toContainText('15');
	await row.locator('.buybtn').click({ force: true });

	// The wallet drops by exactly the price and the row flips to owned.
	await expect(bagChip(page)).toHaveText('0');
	await expect(row.locator('.pricechip')).toHaveText('Tuo!');
	await expect(row.locator('.buybtn')).toHaveCount(0);

	// The guard now that the bag is spent: the next trick is offered disabled.
	const next = page.locator('.shopitem', { hasText: 'Serpente' }).first();
	await expect(next.locator('.buybtn')).toBeDisabled();

	// …and the run slot (autosaved on change) carries the purchase.
	const run = await readRun(page);
	expect(run?.bag).toBe(0);
	expect(run?.tricks).toContain('ragnetto');
});
