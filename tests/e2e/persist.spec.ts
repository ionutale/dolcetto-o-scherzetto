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
	readRunV2,
	resolveOutcome,
	seedRun,
	seedRunV2
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

/**
 * Street memory (T42 fix): a done home is written by the autosave *and* seeded
 * back into the sim on boot. `bootState()` maps the save's string keys to the
 * numeric `HomeState` keys `initial({ homes })` takes; without that seed the
 * boot autosave would immediately overwrite the map with `{}`.
 */
test('a saved done home survives the boot autosave and a reload', async ({ page }) => {
	const HOME = { done: true, used: false, kind: 'treat' } as const;
	// Two keys on purpose: a normal house and one left of the start (negative
	// indices are real homes), both of which the string→number bridge keeps.
	const LEFT = { done: true, used: true, kind: 'scherzo' } as const;
	await seedRunV2(page, {
		bag: 0,
		record: 0,
		furthestK: 0,
		homes: { '3': HOME, '-2': LEFT }
	});
	await openTitle(page);
	await play(page);

	// The boot autosave has run by now; the seeded homes are still in the slot.
	await expect.poll(async () => (await readRunV2(page))?.homes).toEqual({ '3': HOME, '-2': LEFT });

	await page.reload();
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await expect.poll(async () => (await readRunV2(page))?.homes).toEqual({ '3': HOME, '-2': LEFT });
});
