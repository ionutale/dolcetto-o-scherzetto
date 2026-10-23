/**
 * T37 — street-life ambient beats: firecracker kids, monster stroller, mystery
 * van (+ candy toss). Pure schedule + crossing maths; the DOM lives in
 * `StreetLife.svelte`.
 *
 * Same gates as scares (spec §10 plush night): roam only, walking (`dir ≠ 0`),
 * shop closed, no scare active, one instance per beat at a time.
 */
import type { Dir, Phase } from '../sim/loop';

/** Injected uniform `[0, 1)` — same shape as scare/car models. */
export type Rng = () => number;

export type StreetBeat = 'firecracker' | 'stroller' | 'van';

/** Shared walk-gate for every T37 beat. */
export interface AmbientGate {
	phase: Phase;
	dir: Dir;
	shopOpen: boolean;
	scareActive: boolean;
	/** True while this beat's crossing is already on screen. */
	active: boolean;
}

/** True when a beat may fire right now. */
export function ambientMayFire(g: AmbientGate): boolean {
	return (
		!g.active &&
		!g.scareActive &&
		!g.shopOpen &&
		g.phase === 'roam' &&
		g.dir !== 0
	);
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ------------------------------------------------------------------ */
/* Firecracker kids — short midground dash + spark pops                */
/* ------------------------------------------------------------------ */

export const FIRECRACKER_FIRST_MS = 50_000;
export const FIRECRACKER_MIN_MS = 80_000;
export const FIRECRACKER_SPAN_MS = 40_000;
/** Crossing length, ms — a quick dash. */
export const FIRECRACKER_DUR_MS = 2500;
export const FIRECRACKER_FROM_X = -80;
export const FIRECRACKER_TO_X = 940;
/** How many kids dash (2 or 3). */
export const FIRECRACKER_COUNT_MIN = 2;
export const FIRECRACKER_COUNT_SPAN = 2; // exclusive upper add → 2..3

export function firstFirecrackerAt(now: number): number {
	return now + FIRECRACKER_FIRST_MS;
}

export function nextFirecrackerAt(now: number, rng: Rng): number {
	return now + FIRECRACKER_MIN_MS + clamp01(rng()) * FIRECRACKER_SPAN_MS;
}

export function firecrackerCount(rng: Rng): number {
	return FIRECRACKER_COUNT_MIN + Math.floor(clamp01(rng()) * FIRECRACKER_COUNT_SPAN);
}

export function firecrackerX(elapsedMs: number): number {
	const t = clamp01(elapsedMs / FIRECRACKER_DUR_MS);
	return FIRECRACKER_FROM_X + (FIRECRACKER_TO_X - FIRECRACKER_FROM_X) * t;
}

export function firecrackerDone(elapsedMs: number): boolean {
	return elapsedMs >= FIRECRACKER_DUR_MS;
}

/* ------------------------------------------------------------------ */
/* Monster stroller — wide cute roll-by                                */
/* ------------------------------------------------------------------ */

export const STROLLER_FIRST_MS = 55_000;
export const STROLLER_MIN_MS = 90_000;
export const STROLLER_SPAN_MS = 50_000;
export const STROLLER_DUR_MS = 5000;
export const STROLLER_FROM_X = -160;
export const STROLLER_TO_X = 1020;
/** Wave when the stroller's screen-x is within this of the duo (~310). */
export const STROLLER_WAVE_NEAR = 90;
export const PLAYER_SCREEN_X = 310;

export function firstStrollerAt(now: number): number {
	return now + STROLLER_FIRST_MS;
}

export function nextStrollerAt(now: number, rng: Rng): number {
	return now + STROLLER_MIN_MS + clamp01(rng()) * STROLLER_SPAN_MS;
}

export function strollerX(elapsedMs: number): number {
	const t = clamp01(elapsedMs / STROLLER_DUR_MS);
	return STROLLER_FROM_X + (STROLLER_TO_X - STROLLER_FROM_X) * t;
}

export function strollerDone(elapsedMs: number): boolean {
	return elapsedMs >= STROLLER_DUR_MS;
}

export function strollerNearDuo(screenX: number): boolean {
	return Math.abs(screenX - PLAYER_SCREEN_X) < STROLLER_WAVE_NEAR;
}

/* ------------------------------------------------------------------ */
/* Mystery van — mid-screen candy toss                                 */
/* ------------------------------------------------------------------ */

export const VAN_FIRST_MS = 70_000;
export const VAN_MIN_MS = 100_000;
export const VAN_SPAN_MS = 60_000;
export const VAN_DUR_MS = 5200;
export const VAN_FROM_X = -200;
export const VAN_TO_X = 1060;
/** Progress (0..1) at which the van tosses one candy. */
export const VAN_TOSS_AT = 0.48;
/** Screen spawn for the tossed candy (stage logical px). */
export const VAN_TOSS_SX = 426;
export const VAN_TOSS_SY = 200;

export function firstVanAt(now: number): number {
	return now + VAN_FIRST_MS;
}

export function nextVanAt(now: number, rng: Rng): number {
	return now + VAN_MIN_MS + clamp01(rng()) * VAN_SPAN_MS;
}

export function vanX(elapsedMs: number): number {
	const t = clamp01(elapsedMs / VAN_DUR_MS);
	return VAN_FROM_X + (VAN_TO_X - VAN_FROM_X) * t;
}

export function vanDone(elapsedMs: number): boolean {
	return elapsedMs >= VAN_DUR_MS;
}

export function vanProgress(elapsedMs: number): number {
	return clamp01(elapsedMs / VAN_DUR_MS);
}

/** True on the first frame progress crosses the toss threshold. */
export function vanShouldToss(prevProgress: number, progress: number): boolean {
	return prevProgress < VAN_TOSS_AT && progress >= VAN_TOSS_AT;
}

/* ------------------------------------------------------------------ */
/* Per-beat tick (shared shape)                                        */
/* ------------------------------------------------------------------ */

export interface BeatTickCtx extends AmbientGate {
	now: number;
	nextAt: number;
}

export interface BeatDecision {
	nextAt: number;
	/** True when this frame should start the crossing. */
	fire: boolean;
}

/**
 * One scheduler tick for a T37 beat. Due moments that miss the walk-gate are
 * deferred (nextAt unchanged), matching scareTick.
 */
export function beatTick(ctx: BeatTickCtx, nextGap: (now: number, rng: Rng) => number, rng: Rng): BeatDecision {
	if (!ambientMayFire(ctx)) return { nextAt: ctx.nextAt, fire: false };
	if (ctx.now < ctx.nextAt) return { nextAt: ctx.nextAt, fire: false };
	return { nextAt: nextGap(ctx.now, rng), fire: true };
}
