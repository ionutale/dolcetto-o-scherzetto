import { afterEach, describe, expect, it } from 'vitest';
import { initial, reduce, setRand, tick } from '../sim/loop';
import type { Candy } from '../sim/loop';
import {
	FLOATER_DX,
	FLOATER_MS,
	GHOST_FLY_MS,
	PILE_COLUMNS,
	PILE_STEP,
	PILE_X0,
	PILE_Y,
	PILE_Y_STAGGER,
	TWINKLE_COUNT,
	TWINKLE_MS,
	candyPos,
	easeOut,
	flightT,
	hasLanded,
	landsAt,
	pileSlot
} from './candy-motion';

/**
 * Pinning suite for the T12 candy motion math (`candy-motion.ts`).
 *
 * The four rows the plan names — hidden before the delay, landing exactly at
 * `t = 1`, decaying bob, same-delay candies landing together — plus the pile
 * table and one cross-module row that proves this module's `pileSlot` still
 * agrees with the sim's `spawnCandies` (so the layout has a single source of
 * truth and a drift would fail here).
 *
 * Randomness is never sampled: the sim row feeds `setRand` a constant, and the
 * motion math itself takes no randomness at all.
 */

afterEach(() => setRand(Math.random));

/** A flying candy with the prototype's constants, overridable per row. */
function candy(over: Partial<Candy> = {}): Candy {
	return {
		id: 1,
		state: 'fly',
		elapsed: 0,
		delay: 0,
		dur: 2,
		sx: 310,
		sy: 218,
		tx: 332,
		ty: 318,
		type: 'lolli',
		value: 5,
		...over
	};
}

describe('candyPos', () => {
	it('is null while the candy has not started falling (elapsed < delay)', () => {
		expect(candyPos(candy({ elapsed: 0.1, delay: 0.12 }))).toBeNull();
		// landed candies are drawn straight from tx/ty, never through the path
		expect(candyPos(candy({ state: 'landed', elapsed: 9 }))).toBeNull();
		// the very first frame of the fall is drawn (t = 0)
		expect(candyPos(candy({ elapsed: 0.12, delay: 0.12 }))).not.toBeNull();
	});

	it('lands exactly on its pile slot at t = 1', () => {
		const c = candy({ elapsed: 2, delay: 0, dur: 2 });
		expect(flightT(c)).toBe(1);
		const p = candyPos(c);
		expect(p?.x).toBe(c.tx);
		expect(p?.y).toBe(c.ty);
		expect(p?.rot).toBeCloseTo(0, 10); // sin(3π) is a hair off zero in floats

		// the stagger is included: a delayed candy touches down at delay + dur
		const d = candy({ elapsed: 2.12, delay: 0.12, dur: 2, id: 2 });
		const q = candyPos(d);
		expect(q?.x).toBe(d.tx);
		expect(q?.y).toBe(d.ty);
		expect(q?.rot).toBeCloseTo(0, 10);
	});

	it('bob amplitude decays toward 0 (peak-to-peak shrinks every quarter turn)', () => {
		// |sin(4πt)| peaks at these t; the envelope is 9 * (1 - 0.75t).
		const peaks = [0.125, 0.375, 0.625, 0.875];
		const deviations = peaks.map((t) => {
			const c = candy({ elapsed: t * 2, delay: 0, dur: 2 });
			const p = candyPos(c);
			if (!p) throw new Error('expected a point');
			// the bob-free path the candy would follow without the wobble
			const e = easeOut(t);
			const base = c.sy + (c.ty - c.sy) * Math.min(1, e * 1.15);
			return Math.abs(p.y - base);
		});

		expect(deviations[0]).toBeCloseTo(9 * (1 - 0.75 * peaks[0]), 6); // 8.15625
		for (let i = 1; i < deviations.length; i++) {
			expect(deviations[i]).toBeLessThan(deviations[i - 1]);
		}
		expect(deviations[deviations.length - 1]).toBeGreaterThan(0);
	});

	it('flips the rotation wobble by candy id, and both signs are zero at rest', () => {
		const odd = candy({ id: 1, elapsed: 0.5, delay: 0, dur: 2 });
		const even = candy({ id: 2, elapsed: 0.5, delay: 0, dur: 2 });
		const a = candyPos(odd);
		const b = candyPos(even);
		if (!a || !b) throw new Error('expected points');
		expect(a.rot).toBeCloseTo(-b.rot, 10);
		expect(a.rot).not.toBe(0);
	});
});

describe('landing (delay + fall)', () => {
	it('two candies with the same delay land together, whatever their path', () => {
		const a = candy({ id: 1, delay: 0.24, dur: 2, sx: 300, tx: 332 });
		const b = candy({ id: 2, delay: 0.24, dur: 2, sx: 600, tx: 362 });

		expect(landsAt(a)).toBe(landsAt(b));
		expect(flightT(a)).toBe(flightT(b));

		// the shared instant is the only one that is not mid-flight
		const t = landsAt(a);
		expect(candyPos(a)).toBeNull(); // elapsed 0 < delay 0.24: not yet
		expect(candyPos(candy({ ...a, elapsed: t - 0.001 }))?.x).not.toBe(a.tx);

		const landA = candyPos(candy({ ...a, elapsed: t }));
		const landB = candyPos(candy({ ...b, elapsed: t }));
		expect(landA?.x).toBe(a.tx);
		expect(landA?.y).toBe(a.ty);
		expect(landB?.x).toBe(b.tx);
		expect(landB?.y).toBe(b.ty);
		expect(landA?.rot).toBeCloseTo(0, 10);
		expect(landB?.rot).toBeCloseTo(0, 10);
	});

	it('hasLanded follows the sim’s state flag', () => {
		expect(hasLanded(candy({ state: 'fly' }))).toBe(false);
		expect(hasLanded(candy({ state: 'landed' }))).toBe(true);
	});
});

describe('the pile layout (one source of truth)', () => {
	it('pileSlot table: x wraps over five columns, y staggers on the odd index', () => {
		expect(pileSlot(0, 0)).toEqual({ tx: PILE_X0, ty: PILE_Y });
		expect(pileSlot(1, 0)).toEqual({ tx: PILE_X0 + PILE_STEP, ty: PILE_Y + PILE_Y_STAGGER });
		// index 5 wraps back to the first column, offset by landedCount 3
		expect(pileSlot(2, 3)).toEqual({
			tx: PILE_X0 + ((3 + 2) % PILE_COLUMNS) * PILE_STEP,
			ty: PILE_Y
		});
		expect(pileSlot(0, 5)).toEqual({ tx: PILE_X0, ty: PILE_Y });
		// the sim's jitter is added, never replaced
		expect(pileSlot(0, 0, -6).tx).toBe(PILE_X0 - 6);
	});

	it('matches the sim: spawnCandies targets differ by exactly the jitter', () => {
		// rand 0.5 → treatCount 2 (two candies) and jitter 0.5 * 12 - 6 = 0
		setRand(() => 0.5);
		let s = tick(initial({ worldX: 0, force: { 0: 'treat' } }), 0);
		s = reduce(s, { type: 'KNOCK' });
		s = reduce(s, { type: 'RESOLVE' });

		expect(s.candies).toHaveLength(2);
		s.candies.forEach((c, i) => {
			expect(c.tx).toBeCloseTo(pileSlot(i, 0).tx, 10);
			expect(c.ty).toBe(pileSlot(i, 0).ty);
		});
	});
});

describe('fx lifetimes (prototype constants)', () => {
	it('pins the floater / twinkle / ghost timings', () => {
		expect(FLOATER_MS).toBe(1000);
		expect(FLOATER_DX).toBe(-8);
		expect(TWINKLE_MS).toBe(520);
		expect(TWINKLE_COUNT).toBe(4);
		expect(GHOST_FLY_MS).toBe(520);
	});
});
