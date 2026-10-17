import { expect, test } from '@playwright/test';
import { audioContextCount, instrumentAudioContext, openTitle, play } from './support/game';

/**
 * Review Focus #1 — the pre-gesture audio policy (spec §6).
 *
 * "Audio context created on first user gesture" is an acceptance criterion, and
 * the failure mode it guards against is a page that quietly builds a context on
 * load: on iOS that is a console warning at best and a dead audio graph at
 * worst, and it happens *before* any test can hear it.
 *
 * The pin is a count, not a sound: `AudioContext` (and Safari's
 * `webkitAudioContext`) are wrapped before any page script runs, so the test can
 * assert the app has constructed **zero** of them while the title is up, and at
 * least one once Gioca — the first gesture — has been tapped.
 */

test.describe('pre-gesture silence (spec §6 · Review Focus #1)', () => {
	test('constructs no AudioContext until the first gesture, then unlocks', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));

		await instrumentAudioContext(page);
		await openTitle(page);

		// The title is up, the sim's rAF loop is already running, and the
		// ambience cast has been ticking for a beat: still no context.
		expect(await audioContextCount(page)).toBe(0);

		// Gioca is the first gesture. It also carries an infinite invite pulse
		// (ISSUES T30 note), so the click is forced.
		await play(page);

		await expect
			.poll(() => audioContextCount(page), {
				timeout: 4_000,
				message: 'the first gesture never created an AudioContext'
			})
			.toBeGreaterThan(0);

		// "Silent, not throwing" (the plan's wording): the pre-gesture window
		// must not have produced a page error either.
		expect(pageErrors).toEqual([]);
	});
});
