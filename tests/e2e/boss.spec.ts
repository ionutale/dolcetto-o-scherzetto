import { expect, test, type Page } from '@playwright/test';
import {
	bagChip,
	collectAllCandies,
	knock,
	menuSettingsButton,
	openTitle,
	play,
	prank,
	readBag,
	readRunV2,
	readSettings,
	resolveOutcome,
	seedRun,
	seedRunV2,
	seedSettings,
	walkToKnock,
	type RunSnapshotV2,
	type SettingsSnapshot
} from './support/game';

/**
 * T7/T8 — the boss vertical slice (spec §2, §4, §6, §10, §13.1).
 *
 * The 1 000-candy save walks into Grande Zucca at the first play: the overlay
 * mounts above the paused world, thirty taps spend thirty candies and win, and
 * the page lands the reward and the next threshold in the same update. The
 * seeded save pins both the welcome threshold and the first boss of the
 * rotation, so nothing here depends on the sim's random knock outcomes.
 *
 * T8 widens the matrix: the parent switch (off, persisted, mid-fight), the
 * three-body rotation, a v1 save that has never met the boss, the reload after
 * a win, the keyboard path and the reduced-motion / rotated presentations.
 * Every test seeds its own run *and* settings; Playwright gives each test a
 * fresh context, so no switch or save guard can leak between them.
 */

/** The fight's full HP — one accepted throw per point (spec §4). */
const BOSS_HP = 30;

/** No audio work in a headless run: the settings the boss tests share. */
const SILENT = { sound: false, musicVolume: 0, sfxVolume: 0 } as const;

/**
 * Seed a run that is already due and walk it into the fight. Returns the
 * overlay locator once `data-phase="fight"` — the entry beat (900 ms) is over
 * and a tap is guaranteed to count. Callers that only need the *absence* of a
 * fight seed directly instead.
 */
async function bootFight(
	page: Page,
	run: Partial<RunSnapshotV2> = {},
	settings: Partial<SettingsSnapshot> = {}
) {
	await seedSettings(page, { ...SILENT, ...settings });
	await seedRunV2(page, { bag: 1000, record: 1000, nextBossAt: 1000, bossWins: 0, ...run });
	await openTitle(page);
	await play(page);

	const layer = page.locator('#bossLayer');
	await expect(layer).toBeVisible({ timeout: 5_000 });
	await expect(layer).toHaveAttribute('data-phase', 'fight', { timeout: 5_000 });
	return layer;
}

/** Throw `times` candies at the stage from its centre (rotation-safe). */
async function throwCandies(page: Page, times = BOSS_HP): Promise<void> {
	const tap = page.locator('#bossTap');
	// No `position`: the default is the element's bounding-box centre, which is
	// the stage's own centre at every rotation. A stage-pixel offset would be
	// read against the *rotated* box and land off the surface at 90/270.
	for (let i = 0; i < times; i++) await tap.click();
}

test('the 1000-candy boss appears, takes 30 throws and banks the reward', async ({ page }) => {
	const layer = await bootFight(page);
	await expect(layer).toHaveAttribute('data-boss', 'zucca');
	await expect(page.locator('#bossName')).toHaveText('Grande Zucca');

	await throwCandies(page);

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(1500);
	await expect.poll(async () => (await readRunV2(page))?.bossWins).toBe(1);
});

/**
 * The keyboard path must work at the moment the fight opens. The overlay takes
 * the stage away from Gioca and from the walk buttons, so without an explicit
 * focus move, Space/Enter would land on `<body>` and do nothing until the
 * player Tabbed to the invisible tap surface.
 *
 * T8 extends the original single-throw pin to the whole fight: the same focused
 * surface must carry all thirty presses through to the win, with no Tab and no
 * pointer input.
 */
test('the 1000-candy boss takes a keyboard throw without a Tab', async ({ page }) => {
	await bootFight(page);

	const tap = page.locator('#bossTap');
	const meter = page.locator('#bossLayer [role="progressbar"]');
	await expect(tap).toBeFocused();
	await expect(meter).toHaveAttribute('aria-valuenow', '30');

	await page.keyboard.press('Space');
	await expect(meter).toHaveAttribute('aria-valuenow', '29');
	await expect(bagChip(page)).toHaveText('999');

	// The remaining 29 presses need no re-focus: the win is the same surface.
	for (let i = 0; i < BOSS_HP - 1; i++) await page.keyboard.press('Space');

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
	await expect.poll(async () => (await readRunV2(page))?.bossWins).toBe(1);
});

/**
 * Settings off (spec §7): the welcome threshold may already be reached, but
 * the parent's switch keeps the gate shut — no overlay, no spend, no reward.
 * The 1.5 s settle is longer than the 900 ms entry beat, so a missed gate
 * would have shown a fight by now.
 */
test('the boss switch off leaves the due welcome fight dormant', async ({ page }) => {
	await seedSettings(page, { ...SILENT, bosses: false });
	await seedRunV2(page, { bag: 1000, record: 1000, nextBossAt: 1000, bossWins: 0 });
	await openTitle(page);
	await play(page);

	await page.waitForTimeout(1_500);
	await expect(page.locator('#bossLayer')).toHaveCount(0);
	await expect(bagChip(page)).toHaveText('1000');
});

/**
 * The rotation (spec §4): one seed per body, picked by the win count. These
 * tests never fight — they pin that the *cast* follows the saved rotation, not
 * just the welcome pumpkin.
 */
test('the second win stages Mostro Goloso', async ({ page }) => {
	const layer = await bootFight(page, {
		bag: 1500,
		record: 1500,
		nextBossAt: 1500,
		bossWins: 1
	});
	await expect(layer).toHaveAttribute('data-boss', 'mostro');
	await expect(page.locator('#bossName')).toHaveText('Mostro Goloso');
});

test('the third win stages Re Caramella', async ({ page }) => {
	const layer = await bootFight(page, {
		bag: 1500,
		record: 1500,
		nextBossAt: 1500,
		bossWins: 2
	});
	await expect(layer).toHaveAttribute('data-boss', 'recaramella');
	await expect(page.locator('#bossName')).toHaveText('Re Caramella');
});

/**
 * Welcome migration (T5/T8): a v1 run has never met the boss, so the read
 * lifts it to v2 with the welcome cadence (1 000 / 0). A bag far above the
 * threshold still meets the *first* body, and the 500-grid threshold lands at
 * the next point above the post-win bag (5 446 → 5 500), not at 1 000 again.
 */
test('a 5416-candy v1 save meets Grande Zucca and migrates its boss progress', async ({ page }) => {
	await seedSettings(page, SILENT);
	await seedRun(page, { bag: 5416, record: 5416, furthestK: 0 });
	await openTitle(page);
	await play(page);

	const layer = page.locator('#bossLayer');
	await expect(layer).toHaveAttribute('data-boss', 'zucca', { timeout: 5_000 });
	await expect(page.locator('#bossName')).toHaveText('Grande Zucca');
	await expect(layer).toHaveAttribute('data-phase', 'fight', { timeout: 5_000 });

	await throwCandies(page);

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	// 5 416 − 30 spent + 60 reward.
	await expect(bagChip(page)).toHaveText('5446');
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(5500);
	await expect.poll(async () => (await readRunV2(page))?.bossWins).toBe(1);
});

/**
 * The post-win save must not replay the fight on the next boot. The reload
 * happens after the overlay has left (so the autosave holds the finished
 * state); the seed guard in `seedRunV2` keeps the old 1 000-threshold payload
 * from being written a second time.
 */
test('a reload after a win does not replay the spent boss', async ({ page }) => {
	const layer = await bootFight(page);
	await throwCandies(page);
	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(1500);
	// The exit beat ends ~1.9 s after the win; reload once the stage is clear.
	await expect(layer).toHaveCount(0, { timeout: 6_000 });

	await page.reload();
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await play(page);

	await page.waitForTimeout(1_500);
	await expect(page.locator('#bossLayer')).toHaveCount(0);
	await expect(bagChip(page)).toHaveText('1030');
});

/**
 * The most likely real-world exit is not a win: a phone kills the app
 * mid-fight. The spends are autosaved one `SPEND_CANDY` at a time, the
 * threshold never moved, and the overlay is local state — so the next boot
 * must resume below the threshold with no fight, then re-arm at full HP once
 * the bag crosses 1 000 again (spec §4).
 */
test('a mid-fight reload keeps the spends and re-arms at the threshold', async ({ page }) => {
	const layer = await bootFight(page);
	await throwCandies(page, 5);
	await expect(bagChip(page)).toHaveText('995');
	// The autosave runs on each spend; read it back before the kill.
	await expect.poll(async () => (await readRunV2(page))?.bag).toBe(995);
	await expect(layer).toBeVisible();

	await page.reload();
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await play(page);
	// The 900 ms entry beat plus settle: a stale threshold would have replayed
	// the fight by now.
	await page.waitForTimeout(1_200);
	await expect(page.locator('#bossLayer')).toHaveCount(0);

	const saved = await readRunV2(page);
	expect(saved?.bag).toBe(995);
	expect(saved?.nextBossAt).toBe(1000);
	expect(saved?.bossWins).toBe(0);

	// Re-arm on the product path: collect candy until the bag is back over the
	// saved threshold. A home drops 1–2 candies worth 1–10 each, so the bounded
	// loop covers a low roll without pinning the sim's random values; a scherzo
	// home pays a 4–8 candy burst instead.
	for (let guard = 0; guard < 5 && (await readBag(page)) < 1000; guard++) {
		await walkToKnock(page);
		await knock(page);
		if ((await resolveOutcome(page)) === 'scherzo') await prank(page);
		await collectAllCandies(page);
	}
	expect(await readBag(page)).toBeGreaterThanOrEqual(1000);

	const relayer = page.locator('#bossLayer');
	await expect(relayer).toBeVisible({ timeout: 5_000 });
	await expect(relayer).toHaveAttribute('data-boss', 'zucca');
	await expect(relayer).toHaveAttribute('data-phase', 'fight', { timeout: 5_000 });
	// A retried fight starts at full HP — the previous 5 hits are not carried.
	await expect(page.locator('#bossLayer [role="progressbar"]')).toHaveAttribute(
		'aria-valuenow',
		'30'
	);
});

/**
 * Turning the switch off mid-fight cancels the fight (spec §7): the candies
 * already spent stay spent, no reward is paid, and the threshold moves to the
 * next grid point above the current bag so re-enabling cannot immediately
 * re-trigger the fight the player opted out of.
 */
test('turning the boss off mid-fight cancels it and moves the threshold past the bag', async ({
	page
}) => {
	const layer = await bootFight(page);
	// Spend three candies so the next grid point is still 1 000, above the bag.
	await throwCandies(page, 3);
	await expect(bagChip(page)).toHaveText('997');

	// The HUD (z 13) and the rotate button (z 11) must stay above the boss
	// overlay (z 10). Plain clicks pass only when nothing intercepts the point,
	// so these are real regression guards for spec §6/§15, not forced taps.
	const rotate = page.locator('#rotateBtn');
	await expect(rotate).toHaveAttribute('data-rotation', '0');
	await rotate.click();
	await expect(rotate).toHaveAttribute('data-rotation', '270');
	// Back upright for the rest of the flow (0 → 270 → 180 → 90 → 0).
	for (let i = 0; i < 3; i++) await rotate.click();
	await expect(rotate).toHaveAttribute('data-rotation', '0');

	await page.locator('#menuBtn').click();
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await menuSettingsButton(page).click({ force: true });
	await page.locator('#bossOffBtn').click();

	await expect(layer).toHaveCount(0);
	await expect.poll(async () => (await readSettings(page))?.bosses).toBe(false);

	await menuSettingsButton(page).click({ force: true });
	await play(page);

	await expect(layer).toHaveCount(0);
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(1000);
	const run = await readRunV2(page);
	expect(run?.bag).toBe(997);
	expect(run?.bossWins).toBe(0);
	expect(run!.nextBossAt!).toBeGreaterThan(run!.bag!);

	// Back on for the rest of the suite (the seed guards make this local, but
	// the test leaves the device's preference exactly as it found it).
	await page.locator('#menuBtn').click({ force: true });
	await menuSettingsButton(page).click({ force: true });
	await page.locator('#bossOnBtn').click({ force: true });
	await expect.poll(async () => (await readSettings(page))?.bosses).toBe(true);
});

/**
 * Reduced motion (spec §10): the JS-driven cosmetic beat is skipped and the
 * stylesheet shortens the entry/win loops, but the fight itself is untouched —
 * every throw and the win must behave exactly as in the full-motion run. This
 * test asserts only functional outcomes, never an animation.
 */
test('the boss fight is fully playable under reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const layer = await bootFight(page);
	await expect(layer).toHaveAttribute('data-boss', 'zucca');

	await throwCandies(page);

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
	await expect.poll(async () => (await readRunV2(page))?.nextBossAt).toBe(1500);
});

/**
 * A rotated presentation must not clip or block the battle surface. The stage
 * reserves its rotated footprint (T4b) and the overlay lives inside it, so the
 * entry is visible and the taps still land at rotation 270. The screenshot is
 * written to Playwright's output dir for the visual review; it is never a
 * committed artefact.
 */
test('the fight stages and plays at rotation 270', async ({ page }, testInfo) => {
	const layer = await bootFight(page, {}, { rotation: 270 });
	await expect(page.locator('.stage-frame')).toHaveAttribute('data-rotation', '270');
	await expect(layer).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('boss-rotated-270.png') });

	await throwCandies(page);

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
});
