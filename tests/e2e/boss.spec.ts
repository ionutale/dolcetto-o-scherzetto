import { expect, test } from '@playwright/test';
import { bagChip, openTitle, play, readRunV2, seedRunV2, seedSettings } from './support/game';

/**
 * T7 — the boss vertical slice (spec §2, §4, §6, §13.1).
 *
 * The 1 000-candy save walks into Grande Zucca at the first play: the overlay
 * mounts above the paused world, thirty taps spend thirty candies and win, and
 * the page lands the reward and the next threshold in the same update. The
 * seeded save pins both the welcome threshold and the first boss of the
 * rotation, so nothing here depends on the sim's random knock outcomes.
 */
test('the 1000-candy boss appears, takes 30 throws and banks the reward', async ({ page }) => {
	await seedSettings(page, { sound: false, musicVolume: 0, sfxVolume: 0 });
	await seedRunV2(page, { bag: 1000, record: 1000, nextBossAt: 1000, bossWins: 0 });
	await openTitle(page);
	await play(page);

	const layer = page.locator('#bossLayer');
	await expect(layer).toBeVisible({ timeout: 5_000 });
	await expect(layer).toHaveAttribute('data-boss', 'zucca');
	await expect(page.locator('#bossName')).toHaveText('Grande Zucca');

	await expect(layer).toHaveAttribute('data-phase', 'fight', { timeout: 3_000 });
	const tap = page.locator('#bossTap');
	for (let i = 0; i < 30; i++) await tap.click({ position: { x: 420, y: 200 } });

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(1500);
	await expect.poll(async () => (await readRunV2(page))?.bossWins).toBe(1);
});
