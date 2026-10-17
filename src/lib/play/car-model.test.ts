import { describe, expect, it } from 'vitest';
import { SPACING } from '../sim/loop';
import { car, passerCar } from '$lib/art/sprites';
import {
	CAR_OFFSET,
	CAR_SKIP_MOD,
	CAR_TONES,
	CAR_WINDOW,
	PASSER_DUR_MS,
	PASSER_FIRST_MS,
	PASSER_FROM_X,
	PASSER_GAP_MIN_MS,
	PASSER_GAP_SPAN_MS,
	PASSER_TO_X,
	carColor,
	carOrdinal,
	carScreenX,
	carSlots,
	firstCarK,
	firstPasserAt,
	hasCar,
	nextPasserAt,
	passerGap,
	passerProgress,
	passerX
} from './car-model';

/**
 * Pinning suite for the T20 cars model (`car-model.ts`) — the two decisions the
 * prototype made inline, now pure:
 *
 *   1. `renderCars()` (~1218-1239): a recycling window of five blocks, four
 *      parked cars per window (spec §4.4's 3–5), one block skipped, the four
 *      dusk tones surfaced **by car ordinal**, positioned at
 *      `k*SPACING + off - worldX`.
 *   2. `passerTick()` (~1530-1546): first at `now + 45 s`, then every
 *      `70 s + rng*30 s`, one 4.2 s crossing from −170 to 1030.
 *
 * No DOM, no timers, no randomness: every row feeds the helpers plain values,
 * and the clock is a number the test owns. The one sprite-level row pins the
 * passer's tone against the parked tone `0`.
 */

/** A deterministic rng from a fixed list of returns (last one repeats). */
function seq(values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

/** The first 6-digit hex fill in an SVG string (a car body / the passer's body). */
function bodyFill(svg: string): string {
	const m = /fill="(#[0-9a-fA-F]{6})"/.exec(svg);
	return m ? m[1].toLowerCase() : '';
}

describe('hasCar / carOrdinal / carColor', () => {
	it('parks every block except one in CAR_SKIP_MOD (the richer §4.4 rule)', () => {
		const expected: Array<[number, boolean]> = [
			[-7, true],
			[-6, true],
			[-5, false],
			[-4, true],
			[-3, true],
			[-2, true],
			[-1, true],
			[0, false],
			[1, true],
			[2, true],
			[3, true],
			[4, true],
			[5, false],
			[6, true],
			[10, false],
			[11, true]
		];
		for (const [k, parked] of expected) expect(hasCar(k)).toBe(parked);
	});

	it('steps the ordinal by exactly one per parked block, across every skip', () => {
		// The wiring that makes both the full-tone window and the adjacency
		// guarantee fall out: two consecutive parked blocks are consecutive
		// ordinals (the skip does not create a gap in the ordinal).
		let prevK: number | null = null;
		let prevOrd = 0;
		for (let k = -40; k <= 40; k++) {
			if (!hasCar(k)) continue;
			const ord = carOrdinal(k);
			if (prevK !== null) expect(ord - prevOrd).toBe(1);
			prevK = k;
			prevOrd = ord;
		}
	});

	it('maps a block to a tone in 0..3, floored positive at negative blocks', () => {
		// tone = (k - floor(k / CAR_SKIP_MOD)) mod CAR_TONES, floored positive.
		const rows: Array<[number, number]> = [
			[-6, 0],
			[-4, 1],
			[-3, 2],
			[-2, 3],
			[-1, 0],
			[1, 1],
			[2, 2],
			[3, 3],
			[4, 0],
			[6, 1],
			[7, 2],
			[8, 3],
			[9, 0],
			[11, 1]
		];
		for (const [k, tone] of rows) {
			expect(carColor(k)).toBe(tone);
			expect(carColor(k)).toBeGreaterThanOrEqual(0);
			expect(carColor(k)).toBeLessThan(CAR_TONES);
		}
	});

	it('addresses all four dusk tones across the block range', () => {
		const seen = new Set(carSlots(0).map((s) => s.color));
		for (let k = -20; k <= 20; k++) if (hasCar(k)) seen.add(carColor(k));
		expect(seen).toEqual(new Set([0, 1, 2, 3]));
	});
});

describe('carSlots — the recycling window', () => {
	it('keeps 3–5 cars live (four for the default window), inside the blocks', () => {
		for (let x = -3000; x <= 3000; x += 37) {
			const slots = carSlots(x);
			const k0 = firstCarK(x);
			// Spec §4.4 band, and the mailbox-style node budget.
			expect(slots.length).toBeGreaterThanOrEqual(3);
			expect(slots.length).toBeLessThanOrEqual(5);
			expect(slots.length).toBe(CAR_SKIP_MOD - 1); // exactly four here
			for (const s of slots) {
				expect(hasCar(s.k)).toBe(true);
				expect(s.k).toBeGreaterThanOrEqual(k0);
				expect(s.k).toBeLessThanOrEqual(k0 + CAR_WINDOW - 1);
				expect(s.off).toBe(CAR_OFFSET);
			}
		}
	});

	it('is bounded by CAR_WINDOW blocks and slides one block per SPACING', () => {
		expect(carSlots(0).length).toBeLessThanOrEqual(CAR_WINDOW);
		// Advancing exactly one block moves the window start by exactly one.
		expect(firstCarK(SPACING) - firstCarK(0)).toBe(1);
		// The live set is always every block of the *shifted* window bar the skip.
		for (const x of [0, SPACING, 9 * SPACING, -7 * SPACING]) {
			const k0 = firstCarK(x);
			const live = carSlots(x).map((s) => s.k);
			const expected: number[] = [];
			for (let i = 0; i < CAR_WINDOW; i++) if (hasCar(k0 + i)) expected.push(k0 + i);
			expect(live).toEqual(expected);
		}
	});

	it('exposes every live car at a stable world position, independent of scroll', () => {
		// A slot's world x never depends on the scroll that exposed it: the same
		// block is always parked at `k*SPACING + off`.
		const slot = carSlots(5000).find((s) => s.k === 7)!;
		const worldXOfCar = carScreenX(slot, 5000) + 5000;
		expect(worldXOfCar).toBe(7 * SPACING + CAR_OFFSET);
		// Where the block is live, the world position is identical; where it is
		// not, the block is simply absent from the window.
		expect(carSlots(3000).some((s) => s.k === 7)).toBe(true);
		expect(carScreenX(slot, 3000) + 3000).toBe(worldXOfCar);
		expect(carSlots(9999).some((s) => s.k === 7)).toBe(false);
	});
});

describe('tone coverage', () => {
	it('shows all four dusk tones in every window', () => {
		// Four cars per window with four consecutive ordinals ⇒ tones 0,1,2,3.
		for (let x = -4000; x <= 4000; x += 17) {
			expect(new Set(carSlots(x).map((s) => s.color))).toEqual(new Set([0, 1, 2, 3]));
		}
	});

	it('reaches all four tones within a few consecutive windows', () => {
		// The spec's own wording: a handful of windows must together cover 0..3.
		for (let x = -1500; x <= 1500; x += 620) {
			const union = new Set<number>();
			for (const dx of [0, SPACING, 2 * SPACING]) {
				for (const s of carSlots(x + dx)) union.add(s.color);
			}
			expect(union).toEqual(new Set([0, 1, 2, 3]));
		}
	});
});

describe('adjacency variety', () => {
	it('never parks two adjacent cars in the same tone, in any window', () => {
		// Consecutive parked cars are consecutive ordinals, so their tones always
		// differ by one (mod four) — gapless, across skips and negatives alike.
		for (let x = -5000; x <= 5000; x += 13) {
			const slots = carSlots(x);
			for (let i = 1; i < slots.length; i++) {
				expect(slots[i].color).not.toBe(slots[i - 1].color);
			}
		}
	});

	it('shows more than one tone in every window (never monochrome)', () => {
		for (let x = -2000; x <= 2000; x += 29) {
			const tones = new Set(carSlots(x).map((s) => s.color));
			expect(tones.size).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('passer tone unchanged', () => {
	it('drives the same tone the prototype used (tone 0)', () => {
		// `passerCar()` is `carBody(CARS[0], true)`: its body must equal tone 0,
		// and the four parked tones must be four distinct dusk bodies.
		expect(bodyFill(passerCar())).toBe(bodyFill(car(0)));
		expect(bodyFill(car(0))).toBe('#7c7ba6');
		const tones = [0, 1, 2, 3].map((i) => bodyFill(car(i)));
		expect(new Set(tones).size).toBe(CAR_TONES);
		expect(tones).toContain(bodyFill(passerCar()));
	});
});

describe('passer schedule bounds', () => {
	it('first appears 45 s after boot', () => {
		expect(firstPasserAt(0)).toBe(PASSER_FIRST_MS);
		expect(firstPasserAt(1234.5) - 1234.5).toBe(PASSER_FIRST_MS);
	});

	it('keeps every later gap inside [70 s, 100 s)', () => {
		const rngValues = [0, 0.25, 0.5, 0.75, 0.999, 1];
		for (const r of rngValues) {
			const gap = passerGap(() => r);
			expect(gap).toBeGreaterThanOrEqual(PASSER_GAP_MIN_MS);
			expect(gap).toBeLessThanOrEqual(PASSER_GAP_MIN_MS + PASSER_GAP_SPAN_MS);
		}
		expect(passerGap(() => 0)).toBe(70_000);
		expect(passerGap(() => 1)).toBe(100_000);
		expect(passerGap(() => 0.5)).toBe(85_000);
	});

	it('clamps a hostile rng to the legal gap', () => {
		expect(passerGap(() => -5)).toBe(PASSER_GAP_MIN_MS);
		expect(passerGap(() => 5)).toBe(PASSER_GAP_MIN_MS + PASSER_GAP_SPAN_MS);
	});

	it('schedules the next passer relative to the crossing that just started', () => {
		const start = 1_000_000;
		const rng = seq([0.1, 0.9]);
		const first = nextPasserAt(start, rng);
		const second = nextPasserAt(first, rng);
		expect(first - start).toBeGreaterThanOrEqual(PASSER_GAP_MIN_MS);
		expect(second - first).toBeGreaterThanOrEqual(PASSER_GAP_MIN_MS);
		// The two gaps are the two different rng draws (0.1 then 0.9).
		expect(first - start).toBe(70_000 + 3_000);
		expect(second - first).toBe(70_000 + 27_000);
	});

	it('is at most one passer per 60 s (the rarest acceptable density)', () => {
		for (const r of [0, 0.1, 0.5, 0.9, 1]) {
			expect(passerGap(() => r)).toBeGreaterThanOrEqual(60_000);
		}
	});
});

describe('no second passer while one drives', () => {
	it('always leaves a gap longer than one crossing', () => {
		for (const r of [0, 0.25, 0.5, 0.75, 1]) {
			const gap = passerGap(() => r);
			expect(gap).toBeGreaterThan(PASSER_DUR_MS);
			// The next passer starts strictly after this one has finished.
			expect(nextPasserAt(5000, () => r)).toBeGreaterThan(5000 + PASSER_DUR_MS);
		}
	});

	it('never overlaps two crossings end-to-end across a long schedule', () => {
		// Walk a whole simulated hour of passers and assert the drives never
		// overlap: each next start is at least a full crossing after the last.
		const rngValues = [0.2, 0.8, 0.05, 0.95, 0.5];
		let i = 0;
		const rng = () => rngValues[i++ % rngValues.length];
		let start = firstPasserAt(0);
		let lastEnd = -Infinity;
		for (let n = 0; n < 40; n++) {
			expect(start).toBeGreaterThan(lastEnd);
			lastEnd = start + PASSER_DUR_MS;
			start = nextPasserAt(start, rng);
		}
	});
});

describe('passer crossing curve', () => {
	it('runs from −170 to 1030 across the crossing', () => {
		expect(passerX(0)).toBe(PASSER_FROM_X);
		expect(passerX(1)).toBe(PASSER_TO_X);
		expect(PASSER_FROM_X).toBe(-170);
		expect(PASSER_TO_X).toBe(1030);
	});

	it('is strictly monotonic (the passer only ever sweeps one way)', () => {
		let prev = passerX(0);
		expect(prev).toBe(PASSER_FROM_X);
		for (let t = 0.02; t <= 1.0001; t += 0.02) {
			const x = passerX(t);
			expect(x).toBeGreaterThan(prev);
			prev = x;
		}
		expect(prev).toBe(PASSER_TO_X);
	});

	it('clamps outside [0,1] so a late/early frame never teleports it', () => {
		expect(passerX(-1)).toBe(PASSER_FROM_X);
		expect(passerX(2)).toBe(PASSER_TO_X);
		expect(passerProgress(-500)).toBe(0);
		expect(passerProgress(0)).toBe(0);
		expect(passerProgress(PASSER_DUR_MS)).toBe(1);
		expect(passerProgress(99999)).toBe(1);
		expect(passerProgress(PASSER_DUR_MS / 2)).toBe(0.5);
	});

	it('reads progress off a monotonic clock (t → x table)', () => {
		const rows: Array<[number, number]> = [
			[0, PASSER_FROM_X],
			[PASSER_DUR_MS / 4, -170 + 1200 * 0.25],
			[PASSER_DUR_MS / 2, -170 + 1200 * 0.5],
			[PASSER_DUR_MS, PASSER_TO_X]
		];
		for (const [ms, x] of rows) expect(passerX(passerProgress(ms))).toBeCloseTo(x, 6);
	});
});
