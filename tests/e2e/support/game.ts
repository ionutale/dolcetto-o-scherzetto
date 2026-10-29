import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Driving one treat-or-trick night from a test.
 *
 * The sim is random by design — a knock resolves 60 % treat / 40 % refuse on an
 * untouched home (spec §5) — so nothing here asserts a fixed outcome. Instead
 * the helpers mirror the *shape* of the loop the reducer guarantees:
 *
 *   play → hold-walk → knock → resolve → (candies | Scherzo) → collect → bag
 *
 * and pick the branch from what actually appears. Where a fixed start makes a
 * test deterministic (the shop, the language flow) the helper seeds the one run
 * slot (`dos.run.v1`) before the app boots.
 */

/** The two localStorage keys the app owns (spec §13, ADR-0006). */
export const RUN_KEY = 'dos.run.v1';
export const SETTINGS_KEY = 'dos.settings.v1';

/** The run slot's v1 shape (`src/lib/persist/persist.ts` — kept for migration tests). */
export interface RunSnapshot {
	version: 1;
	bag: number;
	record: number;
	tricks: string[];
	furthestK: number;
}

/** One completed home in the v2 save (numeric index becomes a string key in JSON). */
export interface SavedHomeSnapshot {
	done: boolean;
	used: boolean;
	kind: 'treat' | 'scherzo';
}

/** The run slot's v2 shape (`src/lib/persist/persist.ts`). */
export interface RunSnapshotV2 {
	version: 2;
	bag: number;
	record: number;
	tricks: string[];
	furthestK: number;
	homes: Record<string, SavedHomeSnapshot>;
	album: Record<string, number>;
	cosmetics: string[];
	/** Boss progress — optional (a v2 payload without it still loads), always written now. */
	nextBossAt?: number;
	bossWins?: number;
}

/** The settings envelope's shape (`src/lib/persist/settings.ts` — v1). */
export interface SettingsSnapshot {
	version: 1;
	lang: 'it' | 'en';
	sound: boolean;
	musicVolume: number;
	sfxVolume: number;
	/** The candy-boss switch — optional since pre-boss envelopes lack it. */
	bosses?: boolean;
	/** The manual presentation rotation (T4b), in degrees clockwise. */
	rotation?: 0 | 90 | 180 | 270;
	/** The T43 rotation mode: auto (CSS portrait prompt) or manual. */
	rotationMode?: 'auto' | 'manual';
}

/* ------------------------------------------------------------------ */
/* Seeding — before any page script runs                               */
/* ------------------------------------------------------------------ */

/** Writes the run slot before the app boots, so `bootState()` restores it. */
export async function seedRun(page: Page, run: Partial<RunSnapshot> = {}): Promise<void> {
	const payload: RunSnapshot = {
		version: 1,
		bag: 0,
		record: 0,
		tricks: ['boo'],
		furthestK: 0,
		...run
	};
	await page.addInitScript(
		([key, value, guard]) => {
			try {
				// `addInitScript` re-runs on every navigation, so a spec that
				// reloads to prove persistence would otherwise re-seed the *old*
				// save over the one the app autosaved. The guard makes the seed a
				// first-boot-only write.
				if (window.localStorage.getItem(guard) !== null) return;
				window.localStorage.setItem(guard, '1');
				window.localStorage.setItem(key, value);
			} catch {
				/* about:blank and a hostile storage have no localStorage */
			}
		},
		[RUN_KEY, JSON.stringify(payload), `${RUN_KEY}.seeded`] as const
	);
}

/**
 * Writes the run slot (v2) before the app boots. Same first-boot guard as
 * `seedRun`, but under its own key so a v1 migration seed and a v2 seed in the
 * same context never suppress each other.
 */
export async function seedRunV2(page: Page, run: Partial<RunSnapshotV2> = {}): Promise<void> {
	const payload: RunSnapshotV2 = {
		version: 2,
		bag: 0,
		record: 0,
		tricks: ['boo'],
		furthestK: 0,
		homes: {},
		album: { lolli: 0, gummy: 0, choco: 0, toffee: 0, corn: 0, star: 0 },
		cosmetics: [],
		nextBossAt: 1000,
		bossWins: 0,
		...run
	};
	await page.addInitScript(
		([key, value, guard]) => {
			try {
				if (window.localStorage.getItem(guard) !== null) return;
				window.localStorage.setItem(guard, '1');
				window.localStorage.setItem(key, value);
			} catch {
				/* about:blank and a hostile storage have no localStorage */
			}
		},
		[RUN_KEY, JSON.stringify(payload), `${RUN_KEY}.v2seeded`] as const
	);
}

/** Writes the settings envelope before the app boots. */
export async function seedSettings(
	page: Page,
	settings: Partial<SettingsSnapshot> = {}
): Promise<void> {
	const payload: SettingsSnapshot = {
		version: 1,
		lang: 'it',
		sound: true,
		musicVolume: 1,
		sfxVolume: 1,
		...settings
	};
	await page.addInitScript(
		([key, value, guard]) => {
			try {
				if (window.localStorage.getItem(guard) !== null) return;
				window.localStorage.setItem(guard, '1');
				window.localStorage.setItem(key, value);
			} catch {
				/* about:blank and a hostile storage have no localStorage */
			}
		},
		[SETTINGS_KEY, JSON.stringify(payload), `${SETTINGS_KEY}.seeded`] as const
	);
}

export async function readRun(page: Page): Promise<RunSnapshot | RunSnapshotV2 | null> {
	return page.evaluate((key) => {
		const raw = window.localStorage.getItem(key);
		return raw === null ? null : JSON.parse(raw);
	}, RUN_KEY);
}

/** Reads the run slot back as a v2 payload (raw JSON, no normalisation). */
export async function readRunV2(page: Page): Promise<RunSnapshotV2 | null> {
	return page.evaluate((key) => {
		const raw = window.localStorage.getItem(key);
		return raw === null ? null : JSON.parse(raw);
	}, RUN_KEY);
}

export async function readSettings(page: Page): Promise<SettingsSnapshot | null> {
	return page.evaluate((key) => {
		const raw = window.localStorage.getItem(key);
		return raw === null ? null : JSON.parse(raw);
	}, SETTINGS_KEY);
}

/* ------------------------------------------------------------------ */
/* Title menu                                                          */
/* ------------------------------------------------------------------ */

/**
 * Loads the app and waits for the title card. The menu is **hidden by class**
 * (`.hide`: `opacity:0` + `pointer-events:none`) rather than unmounted, and
 * Playwright ignores `opacity` when judging visibility — so "is the title up?"
 * is a class question, not a visibility one.
 */
export async function openTitle(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.locator('.menu')).not.toHaveClass(/hide/);
	await expect(page.locator('.menu-play')).toBeAttached();
}

/** The menu overlay that is currently not `.hide`d. */
export function menuPanel(page: Page): Locator {
	return page.locator('.menu:not(.hide)');
}

/**
 * Gioca/Play. The button carries an infinite `menuInvite` pulse (ISSUES T30
 * note), so stable-actionability waits never settle — the click is forced, but
 * it is still a real click event at the button's centre.
 */
export async function play(page: Page): Promise<void> {
	await page.locator('.menu-play').click({ force: true });
	await expect(page.locator('.menu')).toHaveClass(/hide/);
}

/**
 * The `.menu-settings` pill of the card that is currently showing: on the home
 * card it is Impostazioni, on the settings card it is Indietro/Back. Selecting
 * by card (not by label) keeps it language-agnostic.
 */
export function menuSettingsButton(page: Page): Locator {
	return page.locator('.menu-card:not([hidden]) .menu-settings');
}

/**
 * Moves a range input to `value` and fires the `input` event the app listens
 * for. Svelte 5 delegates `input`, so the bubbling event reaches the handler
 * exactly as a real drag would — only the pointer choreography is skipped.
 */
export async function setSlider(page: Page, selector: string, value: number): Promise<void> {
	await page.locator(selector).evaluate((el, next) => {
		const input = el as HTMLInputElement;
		input.value = String(next);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}

/* ------------------------------------------------------------------ */
/* The HUD                                                             */
/* ------------------------------------------------------------------ */

/** The bag chip's live count span. */
export function bagChip(page: Page): Locator {
	return page.locator('#bagChip .count');
}

/** The bag as a number. */
export async function readBag(page: Page): Promise<number> {
	return Number((await bagChip(page).innerText()).trim());
}

/** The knock cloud once it has beckoned (`.show` = `display:block`). */
export function knockButton(page: Page): Locator {
	return page.locator('.knockbtn.show');
}

/* ------------------------------------------------------------------ */
/* Walk input — real pointer events on the hold button                 */
/* ------------------------------------------------------------------ */

/** A genuine `pointerdown`, not a `click()` — the button is hold-to-walk. */
export async function holdRight(page: Page): Promise<void> {
	await page.locator('.walkbtn.r').dispatchEvent('pointerdown', {
		button: 0,
		buttons: 1,
		isPrimary: true,
		pointerId: 1,
		pointerType: 'mouse'
	});
}

/** The matching `pointerup` (the same source, so `holdWalk` stops the kids). */
export async function releaseWalk(page: Page): Promise<void> {
	await page.locator('.walkbtn.r').dispatchEvent('pointerup', {
		button: 0,
		buttons: 0,
		isPrimary: true,
		pointerId: 1,
		pointerType: 'mouse'
	});
}

/**
 * Holds "walk right" until the knock cloud beckons, in bursts.
 *
 * A door's reachable window is ±70 px around a doorstep (loop `NEAR`), which at
 * `SPEED 190` px/s is under a second — long enough for a poll to catch, short
 * enough that a stall could overshoot. So each burst walks, releases the moment
 * the cloud shows, and re-walks if the release landed past the doorway.
 */
export async function walkToKnock(page: Page, budgetMs = 25_000): Promise<void> {
	const knock = knockButton(page);
	const deadline = Date.now() + budgetMs;
	while (Date.now() < deadline) {
		await holdRight(page);
		let seen = false;
		try {
			await expect(knock).toBeVisible({ timeout: 8_000 });
			seen = true;
		} catch {
			/* not there yet within this burst: release and keep walking */
		}
		await releaseWalk(page);
		if (!seen) continue;
		// Still in reach once the kids have actually stopped?
		try {
			await expect(knock).toBeVisible({ timeout: 600 });
			return;
		} catch {
			/* overshot the doorway: walk on to the next one */
		}
	}
	throw new Error('never reached a knockable door');
}

/** Knocks, and waits for the first bubble of the chain (the shout at +420 ms). */
export async function knock(page: Page): Promise<void> {
	await knockButton(page).click({ force: true });
	await expect(page.locator('.bubble.show')).toBeVisible({ timeout: 6_000 });
}

/* ------------------------------------------------------------------ */
/* Resolve + collect                                                   */
/* ------------------------------------------------------------------ */

export type Outcome = 'candy' | 'scherzo';

/** Well-formed candies are buttons; the collected-candy ghost is a `div`. */
export function candies(page: Page): Locator {
	return page.locator('button.candy');
}

export function landedCandies(page: Page): Locator {
	return page.locator('button.candy.landed');
}

/**
 * Waits for the knock to resolve and reports which branch the sim rolled:
 * candies on the sidewalk (treat/re-gift) or the Scherzo invitation (refuse).
 * Both are the reducer's own answer — this never guesses.
 */
export async function resolveOutcome(page: Page, timeoutMs = 8_000): Promise<Outcome> {
	const scherzo = page.locator('.scherzo.show');
	await expect
		.poll(
			async () => {
				if ((await candies(page).count()) > 0) return 'candy' as const;
				if ((await scherzo.count()) > 0) return 'scherzo' as const;
				return null;
			},
			{ timeout: timeoutMs, message: 'the knock never resolved into candy or a Scherzo' }
		)
		.not.toBeNull();
	return (await candies(page).count()) > 0 ? 'candy' : 'scherzo';
}

/** Refuse branch: Scherzo → fan → the free `boo` card → wait for the burst. */
export async function prank(page: Page): Promise<void> {
	await page.locator('.scherzo.show').click({ force: true });
	await expect(page.locator('.fan.show')).toBeVisible({ timeout: 5_000 });
	// `boo` is free and always owned, so it is always the first card.
	await page.locator('.trickcard').first().click({ force: true });
	await expect(candies(page).first()).toBeAttached({ timeout: 10_000 });
}

/** Taps every landed candy until the pile is empty; returns how many went home. */
export async function collectAllCandies(page: Page): Promise<number> {
	const all = candies(page);
	const landed = landedCandies(page);
	let collected = 0;
	for (let guard = 0; guard < 40; guard++) {
		const before = await all.count();
		if (before === 0) break;
		await expect(landed.first()).toBeVisible({ timeout: 10_000 });
		await landed.first().click({ force: true });
		await expect.poll(() => all.count(), { timeout: 5_000 }).toBeLessThan(before);
		collected++;
	}
	return collected;
}

/* ------------------------------------------------------------------ */
/* Audio instrumentation — the pre-gesture silence pin (Review Focus #1)*/
/* ------------------------------------------------------------------ */

/**
 * Wraps the window's `AudioContext` **before any page script** so every
 * construction is counted. The app reads `window.AudioContext ??
 * window.webkitAudioContext`, so both names are patched to the same counter;
 * the wrapper returns a real context, so the game behaves exactly as it would
 * unwrapped — only the count is new.
 */
export async function instrumentAudioContext(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as {
			AudioContext?: typeof AudioContext;
			webkitAudioContext?: typeof AudioContext;
			__acConstructed?: number;
		};
		w.__acConstructed = 0;
		const Real = w.AudioContext ?? w.webkitAudioContext;
		if (typeof Real !== 'function') return;
		const Patched = function () {
			w.__acConstructed = (w.__acConstructed ?? 0) + 1;
			return new (Real as new () => AudioContext)();
		} as unknown as typeof AudioContext;
		Patched.prototype = Real.prototype;
		w.AudioContext = Patched;
		w.webkitAudioContext = Patched;
	});
}

/** How many AudioContexts the page has constructed so far. */
export async function audioContextCount(page: Page): Promise<number> {
	return page.evaluate(
		() => (window as unknown as { __acConstructed?: number }).__acConstructed ?? 0
	);
}
