import { expect, test } from '@playwright/test';
import {
	bagChip,
	knock,
	menuSettingsButton,
	openTitle,
	play,
	readSettings,
	seedRun,
	setSlider
} from './support/game';

/**
 * Impostazioni (spec §6/§13): the separate Music/SFX sliders persist to the one
 * settings envelope (`dos.settings.v1`), and the IT/EN toggle reaches all the
 * way down to what a neighbour says at the door.
 *
 * The run is seeded at a known doorstep (`furthestK: 0` → worldX 0 → house 0)
 * so the knock flow's archetype is deterministic: `archOf(0)` is the ghost, and
 * its English greeting is a fixed string. Without the seed the test would walk
 * and could land on any of the six neighbours.
 */

test('settings: Music/SFX sliders persist, then EN flips the door copy', async ({ page }) => {
	await seedRun(page, { furthestK: 0 });
	await openTitle(page);

	// IT is the default: the knock pill speaks Italian before any toggle.
	await expect(page.locator('.knockbtn')).toContainText('Bussa');

	await menuSettingsButton(page).click({ force: true });
	await expect(page.locator('#musicVol')).toBeVisible();
	await expect(page.locator('#sfxVol')).toBeVisible();

	await setSlider(page, '#musicVol', 40);
	await setSlider(page, '#sfxVol', 25);

	// The outputs re-render from the volumes store, so a moved slider is
	// visible, not just stored.
	await expect(page.locator('output[for="musicVol"]')).toHaveText('40');
	await expect(page.locator('output[for="sfxVol"]')).toHaveText('25');

	// …and both gains land in the one envelope, 0..1.
	await expect.poll(async () => (await readSettings(page))?.musicVolume).toBeCloseTo(0.4, 5);
	await expect.poll(async () => (await readSettings(page))?.sfxVolume).toBeCloseTo(0.25, 5);

	// IT → EN persists first, then the run follows. The button is picked by its
	// own text: a role-name lookup for "EN" also matches the HUD's "Menu" pill
	// (case-insensitive substring).
	await page.locator('.lang-btn', { hasText: 'EN' }).click({ force: true });
	await expect.poll(async () => (await readSettings(page))?.lang).toBe('en');

	// Back to the title (the pill is "Back" now, but the card selector is
	// language-agnostic). The home card's own copy flipped to English too.
	await menuSettingsButton(page).click({ force: true });
	await expect(page.locator('.menu-play')).toHaveText(/Play/);

	await play(page);

	// The knock pill now speaks English…
	await expect(page.locator('.knockbtn')).toContainText('Knock');
	await knock(page);

	// …and so does the neighbour: house 0 is the ghost, whose greeting is the
	// EN line from `lines.ts` (not a translated-on-the-fly guess).
	await expect(page.locator('.bubble')).toContainText('Boo! Who goes there?');
});

test('settings: the bag chip renders the seeded save on the title', async ({ page }) => {
	// A tiny second pin that the settings card's own write never clobbers the
	// run slot (the two keys stay independent).
	await seedRun(page, { bag: 7, record: 7, furthestK: 0 });
	await openTitle(page);
	await expect(bagChip(page)).toHaveText('7');

	await menuSettingsButton(page).click({ force: true });
	await setSlider(page, '#musicVol', 10);
	await menuSettingsButton(page).click({ force: true });

	await expect(bagChip(page)).toHaveText('7');
});
