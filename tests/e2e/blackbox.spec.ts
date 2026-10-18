import { expect, test } from '@playwright/test';
import { openTitle, play } from './support/game';

/**
 * The black box (owner request: the iPhone crash leaves no evidence — Safari's
 * remote debugger dies with the page, so the game persists a flight log to
 * localStorage itself).
 *
 * Covered here, against the built app:
 *
 *   1. a previous session that ended abruptly (seeded, no `end` entry, recent)
 *      boots into the crash banner, archives `dos.log.prev.v1`, and the viewer
 *      (triple-tap on the build line) shows the interrupted session;
 *   2. the live session records uncaught errors and heartbeats (with the
 *      leak-hunt stats) as it plays;
 *   3. a clean close writes `end`, and the next boot shows no banner.
 */

const LIVE_KEY = 'dos.log.live.v1';
const PREV_KEY = 'dos.log.prev.v1';

/**
 * Seeds an interrupted previous session before the app boots: a boot entry
 * 30 s ago (− timestamp, wall-written at load), one heartbeat 5 s ago, and no
 * `end` — exactly the shape a killed WebContent process leaves behind. The
 * first-boot guard keeps a reload from re-seeding over the app's own writes.
 */
async function seedCrash(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(
		([key, guard]) => {
			try {
				if (window.localStorage.getItem(guard) !== null) return;
				window.localStorage.setItem(guard, '1');
				const at = Date.now() - 30_000;
				window.localStorage.setItem(
					key,
					JSON.stringify([
						{ t: 0, k: 'boot', d: { at, v: 'seed' } },
						{ t: 25_000, k: 'hb', d: { el: 1500, aC: 120, aD: 118, k: 3, bag: 7 } }
					])
				);
			} catch {
				/* about:blank and a hostile storage have no localStorage */
			}
		},
		[LIVE_KEY, `${LIVE_KEY}.seeded`] as const
	);
}

test('an interrupted session boots into the banner, archives prev, and the viewer shows it', async ({
	page
}) => {
	await seedCrash(page);
	await openTitle(page);

	// The banner appears with the crash summary (the last heartbeat's numbers).
	const banner = page.locator('.crash');
	await expect(banner).toBeVisible();
	await expect(banner.locator('.crash-title')).toHaveText(/si è riavviato/);
	await expect(banner.locator('.crash-sum')).toContainText('build');
	await expect(banner.locator('.crash-sum')).toContainText('DOM 1500');

	// The interrupted session was archived for the viewer.
	const archived = await page.evaluate((key) => window.localStorage.getItem(key), PREV_KEY);
	expect(archived).not.toBeNull();
	expect(archived).toContain('"el":1500');

	// Triple-tap the build line → the viewer opens on the full report.
	await page.locator('.menu-build').click({ clickCount: 3, force: true });
	const viewer = page.locator('#blackboxText');
	await expect(viewer).toBeVisible();
	await expect(viewer).toContainText('INTERROTTA');
	await expect(viewer).toContainText('[+25.0s] hb');
	await expect(viewer).toContainText('SCATOLA NERA');
	await page.locator('.bb-actions button', { hasText: 'Chiudi' }).click();
	await expect(viewer).not.toBeVisible();

	// ✕ dismisses the banner for this boot.
	await banner.locator('.crash-x').click();
	await expect(banner).not.toBeVisible();
});

test('with the banner up, Gioca stays reachable on the landscape screen', async ({ page }) => {
	await seedCrash(page);
	await openTitle(page);
	await expect(page.locator('.crash')).toBeVisible();

	// The banner makes the card the tallest it ever is; on the 852×393
	// reference viewport the card scrolls inside itself rather than clipping
	// the play button out of reach. The scroll + rect read are plain DOM
	// calls — Playwright's actionability helpers would hang on the pulsing
	// Gioca (its `menuInvite` pulse never stabilises; ISSUES T30 note).
	const box = await page.evaluate(() => {
		const el = document.querySelector('.menu-play') as HTMLElement | null;
		if (!el) return null;
		el.scrollIntoView({ block: 'nearest' });
		const r = el.getBoundingClientRect();
		return { top: r.top, bottom: r.bottom };
	});
	expect(box).not.toBeNull();
	expect(box!.top).toBeGreaterThanOrEqual(0);
	expect(box!.bottom).toBeLessThanOrEqual(393);
});

test('the settings open the error-log archive, and a session views', async ({ page }) => {
	await seedCrash(page);
	await openTitle(page);

	// Settings card → the error-log list (the owner-asked entry point).
	await page.locator('.menu-card:not([hidden]) .menu-settings').click({ force: true });
	await page.locator('#errorLogBtn').click({ force: true });
	await expect(page.locator('#logList')).toBeVisible();
	await expect(page.locator('.logrow').first()).toContainText('build');

	// The session's detail view is the full archived report.
	await page.locator('.logrow button').first().click({ force: true });
	await expect(page.locator('#blackboxText')).toContainText('sessione archiviata');
	await expect(page.locator('#blackboxText')).toContainText('build');

	// Back to the list, then close.
	await page.locator('.bb-actions button', { hasText: 'Elenco' }).click();
	await expect(page.locator('#logList')).toBeVisible();
	await page.locator('.bb-actions button', { hasText: 'Chiudi' }).click();
	await expect(page.locator('#logList')).not.toBeVisible();
});

test('the live session records errors and heartbeats while playing', async ({ page }) => {
	await openTitle(page);
	await play(page);

	// An uncaught error lands as an `err` entry, flushed immediately.
	await page.evaluate(() => {
		setTimeout(() => {
			throw new Error('e2e-blackbox-boom');
		}, 30);
	});
	await expect
		.poll(async () => page.evaluate((key) => window.localStorage.getItem(key) ?? '', LIVE_KEY), {
			timeout: 10_000
		})
		.toContain('e2e-blackbox-boom');

	// With at least one heartbeat carrying the leak-hunt numbers.
	const live = await page.evaluate((key) => window.localStorage.getItem(key) ?? '', LIVE_KEY);
	const entries = JSON.parse(live) as { k: string; d?: Record<string, unknown> }[];
	expect(entries.some((e) => e.k === 'boot')).toBe(true);
	expect(entries.some((e) => e.k === 'err' && String(e.d?.m).includes('e2e-blackbox-boom'))).toBe(
		true
	);
	const beat = entries.find((e) => e.k === 'hb');
	expect(beat).toBeTruthy();
	expect(typeof beat?.d?.el).toBe('number');
	expect(typeof beat?.d?.aC).toBe('number');
	expect(typeof beat?.d?.aD).toBe('number');
	expect(typeof beat?.d?.fps).toBe('number');
});

test('heartbeats reach localStorage on their own (no error required)', async ({ page }) => {
	await openTitle(page);

	// The flush fix (owner's first device logs): before it, heartbeats sat in
	// memory until an error/close/pagehide, so a silent foreground process kill
	// erased the whole session down to the bare boot line. Two beats in — the
	// initial one plus one interval — the persisted log must already carry
	// `hb` entries with no error, no visibility change and no pagehide having
	// fired.
	await expect
		.poll(
			async () => {
				const raw = await page.evaluate((key) => window.localStorage.getItem(key) ?? '', LIVE_KEY);
				try {
					const entries = JSON.parse(raw) as { k: string }[];
					return entries.filter((e) => e.k === 'hb').length;
				} catch {
					return 0;
				}
			},
			{ timeout: 20_000 }
		)
		.toBeGreaterThanOrEqual(2);
});

test('a clean close writes end and the next boot shows no banner', async ({ page }) => {
	await openTitle(page);

	// The page-going-away beat a real close fires.
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	const live = await page.evaluate((key) => window.localStorage.getItem(key) ?? '', LIVE_KEY);
	const entries = JSON.parse(live) as { k: string }[];
	expect(entries[entries.length - 1].k).toBe('end');

	// Reload: a cleanly-ended session is not a crash — no banner, no archive.
	await page.reload();
	await expect(page.locator('.menu-play')).toBeAttached();
	await expect(page.locator('.crash')).toHaveCount(0);
	expect(await page.evaluate((key) => window.localStorage.getItem(key), PREV_KEY)).toBeNull();
});
