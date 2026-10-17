/**
 * Endless-street progression (plan T07, spec §9).
 *
 * Progress is the **furthest house ever reached** (`furthestK`): walking
 * backwards never regresses it, so every curve below is a pure function of the
 * *global* neighborhood index derived from it. Nothing here mutates state, the
 * DOM, or `loop.ts` — the scene layer calls these helpers and renders the
 * answer.
 *
 * Neighborhood ≈ 10 homes (spec §9: "Neighborhood every ~10 homes; theme
 * rotates; refusal/richness shift gently with the global index; soft caps").
 *
 * All numbers are **BALANCE.md placeholders**: `refusalP` and `richnessBias`
 * ship with the documented defaults below and are expected to be re-tuned (not
 * re-designed) once `BALANCE.md` exists. The *shapes* — monotonic rise, soft
 * cap, base value — are what the tests pin; the tuning knobs are exported
 * constants so BALANCE edits touch one line each.
 *
 * Pure: no DOM, no timers, no randomness. Only `SPACING` is imported from
 * `loop.ts` (a read-only constant) so the house-index maths can never drift
 * from the sim.
 */

import { SPACING } from './loop';

/** Homes per neighborhood — the ~10-home cadence of spec §9. */
export const HOMES_PER_NEIGHBORHOOD = 10;

/**
 * Global neighborhood index of a progress marker: every
 * `HOMES_PER_NEIGHBORHOOD` houses the street shifts theme/feel.
 *
 * `Math.floor(furthestK / 10)` clamped at 0 so a negative (or nonsense)
 * progress value starts in neighborhood 0 instead of walking backwards into
 * `-1`.
 */
export function neighborhoodIndex(furthestK: number): number {
	return Math.floor(Math.max(0, furthestK) / HOMES_PER_NEIGHBORHOOD);
}

/** The four neighborhood skins, in rotation order (spec §9 / §11 ambience beds). */
export const THEMES = ['leafy', 'foggy', 'pumpkin', 'starry'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Theme of a neighborhood index — cycles `THEMES` forever (`0-1-2-3-0…`).
 *
 * Negative indices wrap with a positive modulo instead of throwing or clamping
 * (`-1 → 'starry'`, `-4 → 'leafy'`, `-5 → 'starry'`): `neighborhoodIndex`
 * never produces them, but a caller feeding a raw/backcomputed index still
 * gets a valid theme.
 */
export function themeFor(index: number): Theme {
	const cycle = THEMES.length;
	return THEMES[((Math.trunc(index) % cycle) + cycle) % cycle];
}

// --- BALANCE.md placeholders -------------------------------------------------
// Soft-capped difficulty/drop knobs (spec §9: "refusal/richness shift gently
// with the global index; soft caps"). Exposed so BALANCE.md owns the numbers.

/** Refusal chance at neighborhood 0 (spec §5's baseline feel). */
export const REFUSAL_BASE = 0.4;

/** Refusal chance added per neighborhood — gentle, +1.5 points each. */
export const REFUSAL_STEP = 0.015;

/** Soft cap: after it, further neighborhoods refuse at most this often. */
export const REFUSAL_CAP = 0.55;

/**
 * BALANCE placeholder: refusal probability of an untouched home in
 * `index`-th neighborhood.
 *
 * `min(REFUSAL_CAP, REFUSAL_BASE + REFUSAL_STEP * max(0, index))` — starts at
 * **0.40**, rises **+0.015** per neighborhood, soft-capped at **0.55** (reached
 * at index 10 and pinned there forever). Non-decreasing in `index`; negative
 * indices read as neighborhood 0. `BALANCE.md` owns the final numbers.
 */
export function refusalP(index: number): number {
	return Math.min(REFUSAL_CAP, REFUSAL_BASE + REFUSAL_STEP * Math.max(0, index));
}

/** Richness (drop-roll) bias added per neighborhood. */
export const RICHNESS_STEP = 0.03;

/** Soft cap for the richness bias — later neighborhoods stop getting richer. */
export const RICHNESS_CAP = 0.35;

/**
 * BALANCE placeholder: drop-roll bias the `index`-th neighborhood applies when
 * rolling candy richness (richer drops later on, gently — spec §9 "bigger
 * bursts vs slightly stingier homes" stays a knob, not a cliff).
 *
 * `min(RICHNESS_CAP, max(0, index) * RICHNESS_STEP)` — 0 at the start,
 * **+0.03** per neighborhood, soft-capped at exactly **0.35** (index 12+).
 * Non-decreasing in `index`. `BALANCE.md` owns the final numbers.
 */
export function richnessBias(index: number): number {
	return Math.min(RICHNESS_CAP, Math.max(0, index) * RICHNESS_STEP);
}

/**
 * Monotonic progress: the furthest house index (`worldX / SPACING`, rounded to
 * the nearest doorstep) ever seen, never shrinking.
 *
 * Pure — the caller owns the stored value (`GameState.furthestK`). Backtracking
 * (or a negative `worldX` before house 0) leaves `prev` untouched, so the
 * returned number only ever advances.
 */
export function trackFurthest(prev: number, worldX: number): number {
	return Math.max(prev, Math.round(worldX / SPACING));
}
