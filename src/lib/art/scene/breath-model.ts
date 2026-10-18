/**
 * The raster-breath clock (owner's memory hunt, 2026-10-18).
 *
 * Diagnosis: while the world scrolls, WebKit rasterizes newly exposed street
 * pixels into its tile cache and releases them only when the page idles — the
 * owner's controlled test (nonstop walking, nothing else: no knocks, no
 * voices, no candies) died after **20 seconds** while every page-side counter
 * stayed flat. The breath is the page-side equivalent of the idle trim: once
 * enough *walking* time accumulates, the scene hides its scrolling subtree
 * for one committed frame, forcing the renderer to drop the layer and its
 * tiles; the rebuild costs one frame, not an unbounded cache.
 *
 * This module owns only the arithmetic (unit-tested): the gap between ticks is
 * clamped, so a backgrounded tab (a huge timestamp jump) never credits
 * phantom walking time.
 */

/** Accumulated walking milliseconds between two breaths. */
export const BREATH_EVERY_MS = 12_000;

/** A single gap's ceiling — far past any real frame gap (~16-33 ms). */
const MAX_DT_MS = 250;

export interface BreathClock {
	/** Feed one tick; returns `true` exactly when it is time to breathe. */
	tick(nowMs: number, moving: boolean): boolean;
}

/** A fresh clock that fires once per `everyMs` of accumulated moving time. */
export function createBreathClock(everyMs: number = BREATH_EVERY_MS): BreathClock {
	let acc = 0;
	let last: number | null = null;
	return {
		tick(nowMs: number, moving: boolean): boolean {
			const prev = last;
			last = nowMs;
			if (!moving) return false;
			const gap = prev === null ? 0 : Math.max(0, Math.min(nowMs - prev, MAX_DT_MS));
			acc += gap;
			if (acc >= everyMs) {
				acc = 0;
				return true;
			}
			return false;
		}
	};
}
