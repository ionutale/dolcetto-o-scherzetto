/**
 * T12 — the candy motion math, lifted out of the render path so it can be
 * pinned without a DOM.
 *
 * The sim owns *where* a candy lands (`sx/sy` door anchor, `tx/ty` pile slot,
 * `elapsed/delay/dur` the float timer — `loop.ts`); this module owns only the
 * **shape of the flight** and the handful of timing/geometry constants the
 * prototype inlined in its render functions:
 *
 * | prototype (`scene-prototype.html`) | here |
 * |------------------------------------|------|
 * | `easeOut` (~1261)                  | `easeOut` |
 * | `candyPos` (~1262-1269)            | `candyPos` |
 * | `spawnCandies` pile targets (~536) | `PILE_*` + `pileSlot` |
 * | `floater` offset/lifetime (~1330)  | `FLOATER_*` |
 * | `twinkleAt` count/spread/life(~1306)| `TWINKLE_*` |
 * | `flyGhostToBag` lifetime (~1328)   | `GHOST_FLY_MS` |
 *
 * `candyPos` is the validated path, kept byte-for-byte: a quadratic ease-out
 * across the two points, a `sin(4πt)` bob whose amplitude decays to a quarter
 * by touchdown, and a `sin(3πt)` rotation wobble that alternates sign per candy
 * id. At `t = 1` every term collapses to the target: `x = tx`, `y = ty`,
 * `rot = 0` — a candy lands *exactly* on its slot, which is what makes the pile
 * readable.
 *
 * Pure: no DOM, no timers, no randomness (the sim rolls the jitter). Rationale
 * for returning `null` (rather than a clamped point) before the stagger delay:
 * the layer renders nothing there, so pre-delay candies never flash at (0,0).
 */
import type { Candy } from '../sim/loop';

/** Quadratic ease-out, prototype-exact: `1 - (1 - t)²`. */
export function easeOut(t: number): number {
	return 1 - Math.pow(1 - t, 2);
}

/** Clamped flight progress: `0` before the delay, `1` at `delay + dur`. */
export function flightT(c: Candy): number {
	return Math.max(0, Math.min(1, (c.elapsed - c.delay) / c.dur));
}

/** The second a candy touches down: its stagger delay plus its fall. */
export function landsAt(c: Candy): number {
	return c.delay + c.dur;
}

/** The sim's landing flag — `true` once `tick` froze `elapsed` at the slot. */
export function hasLanded(c: Candy): boolean {
	return c.state === 'landed';
}

/** A candy's stage-space point: top-left anchor plus a rotation for the SVG. */
export interface CandyPoint {
	x: number;
	y: number;
	rot: number;
}

/**
 * The candy's stage-space position, or `null` while it has not started falling
 * (`elapsed < delay`) or is no longer flying. Prototype `candyPos` verbatim.
 */
export function candyPos(c: Candy): CandyPoint | null {
	if (c.state !== 'fly' || c.elapsed < c.delay) return null;
	const t = flightT(c);
	const e = easeOut(t);
	const x = c.sx + (c.tx - c.sx) * e;
	const y =
		c.sy + (c.ty - c.sy) * Math.min(1, e * 1.15) - Math.sin(Math.PI * 4 * t) * 9 * (1 - t * 0.75);
	return { x, y, rot: Math.sin(t * Math.PI * 3) * 24 * (c.id % 2 ? 1 : -1) };
}

/*
 * Pile geometry — the sim's `spawnCandies` targets (`loop.ts`). The render path
 * uses each candy's own `tx/ty` (the sim is authoritative); these are the one
 * named home for that layout, and `candy-motion.test.ts` pins the sim's output
 * against them so the two can never drift.
 */

/** Left edge of the pile in stage px. */
export const PILE_X0 = 332;
/** Horizontal gap between two candy slots. */
export const PILE_STEP = 30;
/** Slots before the pile wraps onto the previous row's x. */
export const PILE_COLUMNS = 5;
/** Baseline y of the pile in stage px. */
export const PILE_Y = 318;
/** Every other candy sits one stagger lower, so rows read apart. */
export const PILE_Y_STAGGER = 8;

/**
 * The pile slot for the `index`-th candy of a drop, given how many candies are
 * already settled. `jitter` is the sim's `rand() * 12 - 6` wobble (0 here).
 */
export function pileSlot(
	index: number,
	landedCount: number,
	jitter = 0
): { tx: number; ty: number } {
	return {
		tx: PILE_X0 + ((landedCount + index) % PILE_COLUMNS) * PILE_STEP + jitter,
		ty: PILE_Y + (index % 2) * PILE_Y_STAGGER
	};
}

/* ---------------- fx lifetimes & offsets (prototype-exact) ---------------- */

/** `+N` floater: up-and-out life (prototype `floater`, ~1330). */
export const FLOATER_MS = 1000;
/** Floater anchor offset from the candy slot (`c.tx - 8`). */
export const FLOATER_DX = -8;
/** Floater anchor offset from the candy slot (`c.ty - 26`). */
export const FLOATER_DY = -26;

/** Landing twinkle: four sparks that fade in 520 ms. */
export const TWINKLE_MS = 520;
export const TWINKLE_COUNT = 4;
/** Spark scatter around the slot, full width (prototype `rand*26 - 13`). */
export const TWINKLE_SPREAD_X = 26;
/** Spark scatter around the slot, full height (prototype `rand*16 - 8`). */
export const TWINKLE_SPREAD_Y = 16;

/** Fly-to-bag ghost: one hop, removed when its transitions end (~1328). */
export const GHOST_FLY_MS = 520;
