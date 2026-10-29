import { expect, test } from '@playwright/test';
import { openTitle, play, readSettings } from './support/game';

/**
 * T44 (2026-10-29) — the one-time iOS silent-switch tip.
 *
 * iOS exposes no mute signal at all, so the tip is not a detection: it is the
 * honest fallback for builds without `navigator.audioSession` (iOS 16 and
 * older), shown once per device after Gioca and remembered in
 * `dos.settings.v1` (`audioHintSeen`). On iOS 17+ the page sets
 * `navigator.audioSession.type = 'playback'` instead and the tip never appears;
 * desktop and Android are never targeted.
 */
const IPHONE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

test.describe('on an iPhone without the Audio Session API', () => {
	test.use({ userAgent: IPHONE_UA });

	test('the tip shows once after Gioca, remembers the dismissal and never returns', async ({
		page
	}) => {
		await openTitle(page);
		await play(page);

		const hint = page.locator('.silent-hint');
		await expect(hint).toBeVisible();
		await expect(hint).toContainText('Togli il silenzioso o usa le cuffie');

		await page.locator('.silent-hint__close').click({ force: true });
		await expect(hint).toHaveCount(0);
		await expect.poll(async () => (await readSettings(page))?.audioHintSeen).toBe(true);

		// A reload re-reads the envelope: the device is never asked again.
		await page.reload();
		await play(page);
		await expect(page.locator('.silent-hint')).toHaveCount(0);
	});
});

test.describe('on a device that is never targeted', () => {
	test('desktop does not get the iOS tip', async ({ page }) => {
		await openTitle(page);
		await play(page);

		await expect(page.locator('.silent-hint')).toHaveCount(0);
	});
});
