import { expect, test } from '@playwright/test';
import {
	collectAllCandies,
	knock,
	openTitle,
	play,
	prank,
	readBag,
	resolveOutcome,
	walkToKnock
} from './support/game';

/**
 * The core loop, end to end (spec §5): Gioca → hold-walk to a door → knock →
 * the neighbour resolves → candy is collected into the bag.
 *
 * Outcomes are random (`TREAT_P 0.60`), so the test never asserts treat vs
 * refuse: it waits for whichever branch the reducer rolled and drives that one.
 * Both branches end the same way — candies on the sidewalk, a bag that grows.
 */

test('full loop: play → walk → knock → resolve → collect', async ({ page }) => {
	await openTitle(page);
	await play(page);

	const bagBefore = await readBag(page);
	expect(bagBefore).toBe(0);

	// Hold-to-walk with real pointer events until a door is in reach.
	await walkToKnock(page);
	await knock(page);

	const outcome = await resolveOutcome(page);
	if (outcome === 'scherzo') await prank(page);

	const collected = await collectAllCandies(page);
	expect(collected, 'no candy ever landed on the sidewalk').toBeGreaterThan(0);

	// The pile is empty, the bag grew, and it is stable once collection stops.
	await expect(page.locator('button.candy')).toHaveCount(0);
	const bagAfter = await readBag(page);
	expect(bagAfter).toBeGreaterThan(bagBefore);
	await expect.poll(() => readBag(page), { timeout: 3_000 }).toBe(bagAfter);
});

test('reduced motion: the same Play → walk → knock flow still runs', async ({ page }) => {
	// Spec §6/§13 · Review Focus #5: every ambient loop dies under reduce, and
	// the flow must not depend on any of them.
	await page.emulateMedia({ reducedMotion: 'reduce' });

	await openTitle(page);
	await play(page);

	await walkToKnock(page);
	await knock(page);

	// Whichever the sim rolled, the door flow produced its next state with all
	// motion off — the knock cloud, the bubble and the resolve all still ran.
	const outcome = await resolveOutcome(page);
	expect(['candy', 'scherzo']).toContain(outcome);
});
