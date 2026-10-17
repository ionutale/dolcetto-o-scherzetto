import { expect, test } from '@playwright/test';
import { openTitle, play } from './support/game';

/**
 * The reopenable title menu (owner feedback, `menu-state.svelte.ts`): the HUD's
 * 🏠 pill reopens the title from anywhere in the run, and Gioca resumes.
 *
 * The menu is hidden by a `.hide` class (`opacity:0` + `pointer-events:none`)
 * and never unmounted, so the assertions are about the class, not about
 * Playwright's visibility (which ignores opacity).
 */

test('menu return: 🏠 reopens the title and Gioca resumes', async ({ page }) => {
	await openTitle(page);
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);

	await play(page);
	await expect(page.locator('.menu')).toHaveClass(/hide/);

	// In-game, the 🏠 pill brings the title back (a pause, not a stop).
	await page.locator('#menuBtn').click({ force: true });
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await expect(page.locator('.menu-play')).toBeVisible();
	await expect(page.locator('.menu-play')).toHaveText(/Gioca/);

	// Gioca fades it away again — the run resumes on the same state.
	await play(page);
	await expect(page.locator('.menu')).toHaveClass(/hide/);
	await expect(page.locator('#bottegaBtn')).toBeAttached();
});
