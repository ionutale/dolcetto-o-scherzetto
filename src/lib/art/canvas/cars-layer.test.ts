import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CAR_OFFSET,
	PASSER_DUR_MS,
	PASSER_FIRST_MS,
	PASSER_FROM_X,
	PASSER_TO_X,
	carSlots,
	passerX
} from '$lib/play/car-model';
import { SPACING } from '$lib/sim/loop';
import { createCarsLayer } from './cars-layer';
import type { LayerEnv } from './env';
import { palette } from './palette';

/**
 * Pinning suite for `cars-layer.ts` — the pure half only: no DOM, no real
 * clock, no randomness. The raster helper is swapped for a deterministic fake
 * (a logical size and a key), and the fake 2D context logs every blit, so the
 * tests can assert the parked mapping and the passer's screen x. The schedule
 * is driven entirely through `env.tMs` and an injected rng, exactly as the
 * layer's closure owns it.
 */

interface FakeRaster {
	canvas: { key: string };
	w: number;
	h: number;
	pad: number;
}

const rasterStore = vi.hoisted(() => {
	const sizes = new Map<string, { w: number; h: number }>();
	return {
		sizes,
		of(key: string): FakeRaster {
			const size = sizes.get(key) ?? { w: 96, h: 44 };
			return { canvas: { key }, w: size.w, h: size.h, pad: 0 };
		}
	};
});

vi.mock('./raster', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./raster')>();
	return {
		...actual,
		rasterOf: ((key: string) => rasterStore.of(key)) as unknown as typeof actual.rasterOf
	};
});

interface DrawCall {
	key: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A context that only records `drawImage` (the real `blit` does the rest). */
function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: DrawCall[] } {
	const calls: DrawCall[] = [];
	const ctx = {
		shadowColor: '',
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		fillStyle: '',
		globalAlpha: 1,
		save() {},
		restore() {},
		drawImage(image: { key: string }, x: number, y: number, w: number, h: number) {
			calls.push({ key: image.key, x, y, w, h });
		},
		createLinearGradient() {
			return { addColorStop() {} };
		},
		beginPath() {},
		ellipse() {},
		fill() {}
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function env(tMs: number, worldX = 0, reducedMotion = false): LayerEnv {
	return { worldX, tMs, reducedMotion };
}

/** A deterministic rng from a fixed list of returns (the last one repeats). */
function seq(values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

/** The passer's only logged blit for a frame (the parked cars share the log). */
function passerCall(calls: DrawCall[]): DrawCall {
	const hit = calls.find((c) => c.key === 'car:passer');
	if (!hit) throw new Error('the passer was not drawn');
	return hit;
}

beforeEach(() => {
	rasterStore.sizes.clear();
	// The pack's `passerCar()` is 104×44; parked `car()` sprites are 96×44.
	rasterStore.sizes.set('car:passer', { w: 104, h: 44 });
});

describe('cars layer — parked mapping', () => {
	it('blits each live slot at k*SPACING + off - worldX, 6 px off the floor', () => {
		// Block 10 is the skipped driveway; k = 11 sits 490 px into this view.
		const worldX = 10 * SPACING + 600;
		const layer = createCarsLayer(undefined, { rng: () => 0 });
		const { ctx, calls } = fakeCtx();
		layer.draw(ctx, palette(), env(0, worldX));

		const slots = carSlots(worldX);
		expect(slots).toHaveLength(4);
		for (const slot of slots) {
			const x = slot.k * SPACING + CAR_OFFSET - worldX;
			const call = calls.find((c) => c.key === `car:${slot.color}` && c.x === x);
			expect(call).toBeDefined();
			// `.car` is bottom: 6px inside the 393 px stage and sized by the raster.
			expect(call?.y).toBe(393 - 6 - 44);
			expect(call?.w).toBe(96);
			expect(call?.h).toBe(44);
		}

		// The sample really does put exactly one car on stage (k = 11 at x = 490).
		const visible = slots.filter((slot) => {
			const x = slot.k * SPACING + CAR_OFFSET - worldX;
			return x > -96 && x < 852;
		});
		expect(visible.map((slot) => slot.k)).toEqual([11]);
	});

	it('draws the passer before the parked cars (the DOM markup order)', () => {
		// The layer's order is passer first, then the car loop (the DOM order).
		const layer = createCarsLayer(undefined, { firstDelayMs: 0, rng: () => 0 });
		const { ctx, calls } = fakeCtx();
		layer.draw(ctx, palette(), env(0));
		expect(calls[0].key).toBe('car:passer');
		expect(calls.slice(1).every((c) => c.key.startsWith('car:'))).toBe(true);
		expect(calls.length).toBe(5);
	});
});

describe('cars layer — the passer schedule', () => {
	it('fires, sweeps, completes, then waits the injected gap (multiple cycles)', () => {
		const cues: string[] = [];
		const layer = createCarsLayer((cue) => cues.push(cue), {
			firstDelayMs: 1000,
			// gap #1 = 70 s, gap #2 = 85 s, then 70 s.
			rng: seq([0, 0.5, 0])
		});
		const pal = palette();
		const { ctx, calls } = fakeCtx();

		// The first draw arms the schedule (the DOM's `onMount`).
		layer.draw(ctx, pal, env(0));
		layer.draw(ctx, pal, env(999));
		expect(cues).toEqual([]);

		layer.draw(ctx, pal, env(1000));
		expect(cues).toEqual(['passer']);
		expect(passerCall(calls).x).toBe(PASSER_FROM_X);
		// `#passer { bottom: 8px }`, height straight from the raster.
		expect(passerCall(calls).y).toBe(393 - 8 - 44);

		calls.length = 0;
		layer.draw(ctx, pal, env(1000 + PASSER_DUR_MS / 2));
		expect(cues).toEqual(['passer']);
		expect(passerCall(calls).x).toBe(430); // passerX(0.5) = -170 + 600
		expect(passerCall(calls).x).toBe(passerX(0.5));

		// Crossing #1 ends at 1000 + 4200; x resets off-screen (not drawn).
		calls.length = 0;
		layer.draw(ctx, pal, env(1000 + PASSER_DUR_MS));
		expect(calls.some((c) => c.key === 'car:passer')).toBe(false);

		// Gap #1 is 70 s measured from the crossing's end.
		const secondFire = 1000 + PASSER_DUR_MS + 70_000;
		layer.draw(ctx, pal, env(secondFire - 1));
		expect(cues).toEqual(['passer']);
		layer.draw(ctx, pal, env(secondFire));
		expect(cues).toEqual(['passer', 'passer']);

		// Still one at a time: mid-crossing draws never re-fire.
		layer.draw(ctx, pal, env(secondFire + 1000));
		expect(cues).toEqual(['passer', 'passer']);

		// Crossing #2 ends at secondFire + 4200; gap #2 is rng 0.5 → 85 s.
		const thirdFire = secondFire + PASSER_DUR_MS + 85_000;
		layer.draw(ctx, pal, env(thirdFire - 1));
		expect(cues).toHaveLength(2);
		layer.draw(ctx, pal, env(thirdFire));
		expect(cues).toHaveLength(3);
	});

	it('honours a custom firstDelayMs, clocked from the first draw', () => {
		const cues: string[] = [];
		const layer = createCarsLayer((c) => cues.push(c), { firstDelayMs: 12_345, rng: () => 0 });
		const { ctx } = fakeCtx();

		// The layer has no clock of its own: the first draw is its mount point.
		layer.draw(ctx, palette(), env(5000));
		layer.draw(ctx, palette(), env(5000 + 12_344));
		expect(cues).toEqual([]);
		layer.draw(ctx, palette(), env(5000 + 12_345));
		expect(cues).toEqual(['passer']);
	});

	it('defaults the first crossing to PASSER_FIRST_MS after the first draw', () => {
		const cues: string[] = [];
		const layer = createCarsLayer((c) => cues.push(c));
		const { ctx } = fakeCtx();

		layer.draw(ctx, palette(), env(0));
		layer.draw(ctx, palette(), env(PASSER_FIRST_MS - 1));
		expect(cues).toEqual([]);
		layer.draw(ctx, palette(), env(PASSER_FIRST_MS));
		expect(cues).toEqual(['passer']);
	});

	it('keeps the crossing under reduced motion (translation is allowed)', () => {
		const cues: string[] = [];
		const layer = createCarsLayer((c) => cues.push(c), { firstDelayMs: 0, rng: () => 0 });
		const { ctx, calls } = fakeCtx();

		layer.draw(ctx, palette(), env(0, 0, true));
		expect(cues).toEqual(['passer']);

		calls.length = 0;
		layer.draw(ctx, palette(), env(PASSER_DUR_MS / 2, 0, true));
		expect(passerCall(calls).x).toBe(430);
	});
});

describe('passerX endpoints', () => {
	it('sweeps from -170 to 1030 and clamps outside the crossing', () => {
		expect(passerX(0)).toBe(PASSER_FROM_X);
		expect(passerX(1)).toBe(PASSER_TO_X);
		expect(passerX(-1)).toBe(PASSER_FROM_X);
		expect(passerX(2)).toBe(PASSER_TO_X);
	});
});
