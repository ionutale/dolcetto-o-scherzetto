import { expect, test } from '@playwright/test';
import { menuSettingsButton, openTitle, play, readSettings, seedSettings } from './support/game';

/**
 * The presentation rotation: T4b (revised 2026-10-24) + T43 (2026-10-29).
 *
 * The angle is manual: every press of `#rotateBtn` turns the stage a quarter
 * turn to the LEFT (0° → 270° → 180° → 90° → 0°) and persists.
 *
 * The **mode** (`rotationMode`, T43) decides whether a portrait viewport gets
 * the pure-CSS "Gira il telefono" prompt. `'auto'` is the default and there is
 * still no sensor anywhere (ADR-0007); the prompt's "Gioca così" pill persists
 * `'manual'`, and the Settings `Schermo` row is the way back.
 */
test('the rotate button turns the stage left every press and the angle persists', async ({
	page
}) => {
	await openTitle(page);

	// The prompt is in the DOM in auto mode, but a landscape viewport hides it.
	await expect(page.locator('.rotate-overlay')).toBeHidden();

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

test('the Settings rotation row shows and moves the angle', async ({ page }) => {
	await openTitle(page);
	await menuSettingsButton(page).click({ force: true });

	const row = page.locator('#rotateSettingBtn');
	await expect(row).toContainText('0°');

	// Same verb as the HUD button: one tap turns the stage a quarter to the left.
	await row.click({ force: true });
	await expect(row).toContainText('270°');
	await expect(page.locator('.stage-frame')).toHaveAttribute('data-rotation', '270');
});

test('auto mode shows the portrait prompt, and its escape persists manual', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 852 });
	await openTitle(page);

	const overlay = page.locator('.rotate-overlay');
	await expect(overlay).toBeVisible();

	// It sits under the title (z 200), so Impostazioni stays reachable and the
	// default mode is visible there.
	await menuSettingsButton(page).click({ force: true });
	await expect(page.locator('#rotationAutoBtn')).toHaveAttribute('aria-pressed', 'true');
	await menuSettingsButton(page).click({ force: true }); // Indietro / Back

	// Over the stage the pill is the way out, and it is durable.
	await play(page);
	await expect(overlay).toBeVisible();
	await page.locator('#rotatePromptEscape').click({ force: true });
	await expect(overlay).toBeHidden();
	await expect.poll(async () => (await readSettings(page))?.rotationMode).toBe('manual');

	// A reload in portrait does not ask again.
	await page.reload();
	await expect(overlay).toBeHidden();
	await expect.poll(async () => (await readSettings(page))?.rotationMode).toBe('manual');
});

test('the Settings Schermo row switches back to automatic', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 852 });
	await seedSettings(page, { rotationMode: 'manual' });
	await openTitle(page);

	const overlay = page.locator('.rotate-overlay');
	await expect(overlay).toBeHidden();

	await menuSettingsButton(page).click({ force: true });
	await expect(page.locator('#rotationManualBtn')).toHaveAttribute('aria-pressed', 'true');
	await page.locator('#rotationAutoBtn').click({ force: true });
	await expect.poll(async () => (await readSettings(page))?.rotationMode).toBe('auto');

	// Back to the title and into play: the prompt is up again.
	await menuSettingsButton(page).click({ force: true });
	await play(page);
	await expect(overlay).toBeVisible();
});
