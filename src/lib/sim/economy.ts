/**
 * The candy economy — the trick catalogue and the handful of helpers that turn
 * a `rand()` roll into the numbers the loop needs (spec §7–§8).
 *
 * This is a pure, dependency-free module: no DOM, no timers, no storage, and no
 * imports at all. The expressions below are lifted *verbatim* from the validated
 * sim (`loop.ts`), which calls back into these helpers:
 *
 * - `rollValue(rng)`  — `1 + ((rng() * 10) | 0)`, the uniform 1–10 candy value.
 * - `treatCount(rng)` — `1 + ((rng() * 2) | 0)`, the 1–2 candies a treat drops.
 * - `burstFor(id)` / `priceFor(id)` — the `TRICKS` table's burst/price columns.
 * - `canBuy(bag, owned, id)` — the pure guard behind the `BUY` reducer.
 *
 * Randomness is injected as `rng: () => number` (defaults to `Math.random` in the
 * loop) so tests can script exact rolls without touching globals.
 */

/** The Bottega's eight tricks in price order (spec §7). */
export const TRICK_ORDER = [
	'boo',
	'ragnetto',
	'serpente',
	'cuscino',
	'maschera',
	'topolino',
	'fantasmino',
	'mano'
] as const;

export type TrickId = (typeof TRICK_ORDER)[number];

export interface Trick {
	/** Candy price; ladder `0/15/30/45/60/75/90/110` (BALANCE may tune). */
	price: number;
	/** Candies dropped when the show's climax fires (4–8 by tier, spec §7). */
	burst: number;
	/** Display name; the sim only ever echoes `name.it` in `note`. */
	name: Record<'it' | 'en', string>;
}

/** The eight tricks by id: free `boo` plus seven purchasable ones. */
export const TRICKS: Record<TrickId, Trick> = {
	boo: { price: 0, burst: 4, name: { it: 'BOO!', en: 'BOO!' } },
	ragnetto: { price: 15, burst: 5, name: { it: 'Ragnetto', en: 'Rubber Spider' } },
	serpente: { price: 30, burst: 6, name: { it: 'Serpente', en: 'Spring Snake' } },
	cuscino: { price: 45, burst: 6, name: { it: 'Cuscino', en: 'Whoopee Cushion' } },
	maschera: { price: 60, burst: 7, name: { it: 'Maschera', en: 'Silly Mask' } },
	topolino: { price: 75, burst: 7, name: { it: 'Topolino', en: 'Rubber Mouse' } },
	fantasmino: { price: 90, burst: 8, name: { it: 'Fantasmino', en: 'Ghost Puppet' } },
	mano: { price: 110, burst: 8, name: { it: 'Mano pelosa', en: 'Furry Hand' } }
};

/** A candy's value: the sim's exact uniform 1–10 roll (`1 + ((rng() * 10) | 0)`). */
export function rollValue(rng: () => number): number {
	return 1 + ((rng() * 10) | 0);
}

/** Treat candies: the sim's exact uniform 1–2 roll (`1 + ((rng() * 2) | 0)`). */
export function treatCount(rng: () => number): number {
	return 1 + ((rng() * 2) | 0);
}

/**
 * Burst size for a trick show (spec §7: 4–8 by tier). Unknown ids yield `0` so
 * the helper stays total — the `PLAY_TRICK`/`TRICK_RESOLVE` guards reject them
 * before a burst is ever read.
 */
export function burstFor(trickId: string): number {
	const t: Trick | undefined = TRICKS[trickId as TrickId];
	return t ? t.burst : 0;
}

/**
 * Candy price for a trick (spec §7/§8 ladder). Unknown ids yield `0`, again
 * keeping the helper total — `canBuy` refuses them first.
 */
export function priceFor(trickId: string): number {
	const t: Trick | undefined = TRICKS[trickId as TrickId];
	return t ? t.price : 0;
}

/**
 * The pure `BUY` guard, matching the reducer semantics exactly: a purchase is
 * allowed only for a *known* trick that is *not yet owned* and whose price the
 * bag can cover (the bag must be `>= price`; paying the exact price is allowed).
 */
export function canBuy(bag: number, owned: string[], trickId: string): boolean {
	const t: Trick | undefined = TRICKS[trickId as TrickId];
	return !!t && !owned.includes(trickId) && bag >= t.price;
}
