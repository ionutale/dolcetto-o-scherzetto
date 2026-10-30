import { expect, test } from '@playwright/test';
import { openTitle } from './support/game';

/**
 * T45 (2026-10-30) — the install guide.
 *
 * iOS has no install API and no install prompt, so the home card carries a
 * parent-facing pill that opens a full-screen guide with Safari's
 * Share → Add to Home Screen steps for iOS 18 and iOS 27. The pill disappears
 * once the game runs as an installed web app (`display-mode: standalone` or
 * `navigator.standalone`).
 */
test('the home card opens the install guide and closes back to the pill', async ({ page }) => {
	await openTitle(page);

	const pill = page.locator('.menu-card:not([hidden]) .menu-install');
	await expect(pill).toHaveText(/Installa sul telefono/);
	await pill.click({ force: true });

	const guide = page.locator('.install');
	await expect(guide).toBeVisible();
	await expect(guide).toContainText('Installa sul telefono');
	await expect(guide).toContainText('iPhone · iOS 18 · iOS 27');
	await expect(guide).toContainText('Aggiungi alla schermata Home');
	await expect(guide.locator('.install-step')).toHaveCount(4);

	// The ✕ closes it and focus returns to the pill that opened it.
	await page.locator('.install-done').click({ force: true });
	await expect(guide).toHaveCount(0);
	await expect(pill).toBeFocused();
});

test('Escape closes the guide', async ({ page }) => {
	await openTitle(page);
	await page.locator('.menu-card:not([hidden]) .menu-install').click({ force: true });
	await expect(page.locator('.install')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator('.install')).toHaveCount(0);
});

test('the pill is hidden once the game runs from the Home Screen', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'standalone', { get: () => true });
	});
	await openTitle(page);

	await expect(page.locator('.menu-card:not([hidden]) .menu-install')).toHaveCount(0);
	// The card itself still works: Impostazioni is the only ghost pill left.
	await expect(page.locator('.menu-card:not([hidden]) .menu-settings')).toHaveText(/Impostazioni/);
});
