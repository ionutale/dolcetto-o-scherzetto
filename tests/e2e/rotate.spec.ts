import { expect, test } from '@playwright/test';
import { openTitle, play } from './support/game';

/**
 * T4b (revised 2026-10-24) — the manual presentation rotation.
 *
 * The accelerometer is gone from the game's decisions: no "turn the phone"
 * prompt exists any more, and the player's button steps the stage a quarter
 * turn to the LEFT on every press (0° → 270° → 180° → 90° → 0°). The angle
 * persists in the settings envelope; the first T4b build's `flip` maps to 90°.
 */
test('the rotate button turns the stage left every press and the angle persists', async ({
	page
}) => {
	await openTitle(page);

	// The old rotate prompt is gone for good.
	await expect(page.locator('.rotate-overlay')).toHaveCount(0);

	const frame = page.locator('.stage-frame');
	await expect(frame).toHaveAttribute('data-rotation', '0');

	await play(page);

	// A full leftward cycle: 0 → 270 → 180 → 90 → 0.
	const btn = page.locator('#rotateBtn');
	for (const expected of ['270', '180', '90', '0']) {
		await btn.click({ force: true });
		await expect(frame).toHaveAttribute('data-rotation', expected);
	}

	// One more turn persists across a reload.
	await btn.click({ force: true });
	await expect(frame).toHaveAttribute('data-rotation', '270');
	await page.reload();
	await expect(frame).toHaveAttribute('data-rotation', '270');
});
