/**
 * T1 — the candy boss's cadence, cast and start gate
 * (spec `docs/superpowers/specs/2026-10-25-candy-boss-design.md`: "a friendly
 * challenge, no fail"; the fight is a DOM overlay above the paused world, so
 * nothing here touches canvas drawing, scrolling or raster caches).
 *
 * The page owns the clock, the overlay and the wallet dispatches; this module
 * owns only the pure *when*, *who* and *may we*. That keeps the whole matrix —
 * the 1 000 welcome, the 500 grid, the 1 500 post-win floor, the three-boss
 * rotation, save repair and the "quiet roam only" gate — pinned in
 * `boss-model.test.ts` without a browser.
 *
 * ## The rules
 *
 * - **Cadence.** The first boss waits for 1 000 candies, then one every 500
 *   (1 000, 1 500, 2 000 …). A threshold is always the smallest grid point
 *   strictly *above* the bag, so a win at 1 030 spends 30 and lands at 1 000
 *   again — the next boss must come from `nextBossAtAfterWin`, which floors at
 *   1 500, never from `nextBossAtAbove` (that would refire at 1 000).
 * - **Rotation.** `bossWins % 3` picks zucca → mostro → recaramella and wraps,
 *   negatives included (a positive modulo, like the ghosts' `normIndex`).
 * - **Gate.** A due boss never interrupts a flow, the Bottega, a scare, the
 *   menu or a celebration, and never starts while one is already active; it
 *   waits for the next quiet `roam`.
 * - **Repair.** A save may be missing or carry junk in the two boss fields; the
 *   welcome defaults are 1 000 / 0, and a malformed *present* threshold is
 *   re-derived above the bag so a resumed run can never be soft-locked.
 *
 * Pure: no DOM, no timers, no store.
 */
import type { Phase } from '../sim/loop';

/** Candies in the bag before the first boss (spec: "every 500 candies from 1 000"). */
export const BOSS_FIRST = 1000;
/** Candies between bosses after the first. */
export const BOSS_STEP = 500;
/** Successful throws needed to win a fight. */
export const BOSS_HP = 30;
/** Candies each throw costs (the wallet's `SPEND_CANDY`). */
export const BOSS_COST = 1;
/** Candies awarded for a win. */
export const BOSS_REWARD = 60;

/** The rotating cast, in the order the wins take them (spec §4). */
export const BOSS_ORDER = ['zucca', 'mostro', 'recaramella'] as const;
/** One boss of the cast. */
export type BossId = (typeof BOSS_ORDER)[number];

/** Positive modulo — wraps negative win counts too (see `ghost-model`). */
function wrap(value: number, modulus: number): number {
	return ((value % modulus) + modulus) % modulus;
}

/**
 * The first grid point above `bag` — `(floor(max(0, bag)/500) + 1) * 500`.
 *
 * The unfloored form is factored out because the post-win rule differs from
 * the normal rule *only* in its floor (1 500 instead of 1 000).
 */
function gridAbove(bag: number): number {
	return (Math.floor(Math.max(0, bag) / BOSS_STEP) + 1) * BOSS_STEP;
}

/** The next threshold from a run in progress: smallest grid point above the bag, min 1 000. */
export function nextBossAtAbove(bag: number): number {
	return Math.max(BOSS_FIRST, gridAbove(bag));
}

/** The threshold after a win: the same grid, floored at 1 500 so 1 000 never refires. */
export function nextBossAtAfterWin(bag: number): number {
	return Math.max(BOSS_FIRST + BOSS_STEP, gridAbove(bag));
}

/**
 * Whether a boss is due: the feature is on, the stored threshold is sane
 * (never below the welcome 1 000), and the bag has reached it.
 */
export function bossDue(bag: number, nextBossAt: number, enabled: boolean): boolean {
	return enabled && nextBossAt >= BOSS_FIRST && bag >= nextBossAt;
}

/** Which boss the `bossWins`-th fight is; wraps in both directions. */
export function bossFor(bossWins: number): BossId {
	return BOSS_ORDER[wrap(bossWins, BOSS_ORDER.length)];
}

/** A valid win count: a non-negative integer, no NaN/Infinity. */
function isWinCount(raw: unknown): raw is number {
	return typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw) && raw >= 0;
}

/** A valid stored threshold: an integer on the 500 grid at or above 1 000. */
function isThreshold(raw: unknown): raw is number {
	return (
		typeof raw === 'number' &&
		Number.isFinite(raw) &&
		Number.isInteger(raw) &&
		raw >= BOSS_FIRST &&
		raw % BOSS_STEP === 0
	);
}

/**
 * Repair a save's boss fields. A missing field (`undefined`) comes from a v2
 * payload written without them (an older export, a hand edit) and gets the
 * welcome defaults (1 000 / 0) — never a refusal or a wipe. A
 * present-but-malformed threshold is re-derived above the current bag, so a
 * hostile value like `0` can't make the boss fire immediately on resume.
 */
export function normalizeBossProgress(
	bag: number,
	rawNext: unknown,
	rawWins: unknown
): { nextBossAt: number; bossWins: number } {
	const bossWins = isWinCount(rawWins) ? rawWins : 0;

	let nextBossAt = BOSS_FIRST;
	if (rawNext !== undefined) {
		// Present but malformed is repaired above the bag, not kept.
		nextBossAt = isThreshold(rawNext) ? rawNext : nextBossAtAbove(bag);
	}

	return { nextBossAt, bossWins };
}

/** Everything the page knows at a trigger check — the gate's whole input. */
export interface BossGate {
	/** The Settings toggle (`bosses`, on by default). */
	enabled: boolean;
	/** The candy bag right now. */
	bag: number;
	/** The run's stored threshold. */
	nextBossAt: number;
	/** The sim phase (`roam` is the only quiet one). */
	phase: Phase;
	/** The Bottega is up (it freezes the kids, so it counts as a flow). */
	shopOpen: boolean;
	/** A scare beat is playing. */
	scareActive: boolean;
	/** The title menu / any overlay that must stay in front. */
	menuOpen: boolean;
	/** A neighborhood celebration is on screen. */
	celebrating: boolean;
	/** A boss fight is already running (never start twice). */
	active: boolean;
}

/**
 * May a boss start right now? Only a quiet `roam`, with every interrupting
 * beat off and no fight already active — and then only if one is due.
 */
export function bossMayStart(gate: BossGate): boolean {
	if (gate.phase !== 'roam') return false;
	if (gate.shopOpen || gate.scareActive || gate.menuOpen || gate.celebrating) return false;
	if (gate.active) return false;
	return bossDue(gate.bag, gate.nextBossAt, gate.enabled);
}
