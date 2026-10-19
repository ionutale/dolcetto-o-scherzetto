import { expect, test } from '@playwright/test';
import { openTitle, play } from './support/game';

/**
 * T4b — the manual presentation flip (2026-10-19).
 *
 * The accelerometer is gone from the game's decisions: no "turn the phone"
 * prompt exists any more, and the player flips the world a quarter turn with
 * the HUD button instead. The choice persists in the settings envelope.
 */
test('the flip button turns the stage and the choice persists', async ({ page }) => {
	await openTitle(page);

	// The old rotate prompt is gone for good.
	await expect(page.locator('.rotate-overlay')).toHaveCount(0);

	const frame = page.locator('.stage-frame');
	await expect(frame).toHaveAttribute('data-flip', 'landscape');

	await play(page);
	// The button reports and flips the live presentation.
	const btn = page.locator('#flipBtn');
	await expect(btn).toHaveAttribute('data-flip', 'landscape');
	await btn.click({ force: true });
	await expect(frame).toHaveAttribute('data-flip', 'portrait');
	await expect(btn).toHaveAttribute('data-flip', 'portrait');

	// The choice survives a reload (settings envelope, pre-T4b safe).
	await page.reload();
	await expect(frame).toHaveAttribute('data-flip', 'portrait');

	// And it flips back.
	await play(page);
	await page.locator('#flipBtn').click({ force: true });
	await expect(frame).toHaveAttribute('data-flip', 'landscape');
});
