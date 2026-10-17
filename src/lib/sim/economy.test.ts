import { describe, expect, it } from 'vitest';
import { TRICK_ORDER, TRICKS, burstFor, canBuy, priceFor, rollValue, treatCount } from './economy';
import type { TrickId } from './economy';

/**
 * Table-driven pinning suite for the extracted economy helpers.
 *
 * The expressions under test are lifted verbatim from the validated sim
 * (`loop.ts`), so this suite pins the *exact* arithmetic — not just the range —
 * plus the pinned price ladder and burst tiers from spec §7/§8. Randomness is
 * injected (a deterministic LCG for the sweeps, scripted values for the
 * boundaries) so every outcome is exact, never rolled.
 */

/** A deterministic LCG; yields the same sequence in `[0, 1)` every run. */
function seededRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Feeds a scripted sequence; repeats the last value when spent (mirrors loop.test.ts). */
function scriptRand(values: number[]): { rng: () => number; calls: () => number } {
	let i = 0;
	let calls = 0;
	return {
		rng: () => {
			const v = values[Math.min(i, values.length - 1)];
			i += 1;
			calls += 1;
			return v;
		},
		calls: () => calls
	};
}

const ALL_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('rollValue — uniform 1–10 candy value (spec §8)', () => {
	it('returns integers in 1..10 and reaches every value across a seeded sweep', () => {
		const rng = seededRng(0xc0ffee);
		const seen = new Set<number>();
		for (let i = 0; i < 1000; i++) {
			const v = rollValue(rng);
			expect(Number.isInteger(v)).toBe(true);
			expect(v).toBeGreaterThanOrEqual(1);
			expect(v).toBeLessThanOrEqual(10);
			seen.add(v);
		}
		expect([...seen].sort((a, b) => a - b)).toEqual(ALL_VALUES);
	});

	it.each(ALL_VALUES.map((v) => ({ value: v, step: (v - 0.5) / 10 })))(
		'maps the bucket centred on $step to $value',
		({ value, step }) => {
			expect(rollValue(scriptRand([step]).rng)).toBe(value);
		}
	);

	it.each([
		{ step: 0, expected: 1, why: 'the bottom of the range' },
		{ step: 0.1, expected: 2, why: 'the first bucket edge' },
		{ step: 0.5, expected: 6, why: 'the midpoint' },
		{ step: 0.9, expected: 10, why: 'the last bucket edge' },
		{ step: 0.999999, expected: 10, why: 'just under 1 (Math.random bound)' }
	])(
		'pins the exact expression 1 + ((rng()*10)|0) at $step → $expected ($why)',
		({ step, expected }) => {
			expect(rollValue(scriptRand([step]).rng)).toBe(expected);
		}
	);

	it('consumes exactly one roll per value', () => {
		const rand = scriptRand([0.42]);
		rollValue(rand.rng);
		expect(rand.calls()).toBe(1);
	});
});

describe('treatCount — uniform 1–2 candies per treat (spec §8)', () => {
	it.each([
		{ roll: 0, expected: 1, why: 'bottom of the range' },
		{ roll: 0.499, expected: 1, why: 'just below the midpoint' },
		{ roll: 0.5, expected: 2, why: 'the midpoint edge' },
		{ roll: 0.999, expected: 2, why: 'top of the range' }
	])('pins 1 + ((rng()*2)|0): $roll → $expected ($why)', ({ roll, expected }) => {
		expect(treatCount(scriptRand([roll]).rng)).toBe(expected);
	});

	it('returns only 1 or 2 across a seeded sweep', () => {
		const rng = seededRng(0xbadf00d);
		const seen = new Set<number>();
		for (let i = 0; i < 1000; i++) {
			const v = treatCount(rng);
			expect(v === 1 || v === 2).toBe(true);
			seen.add(v);
		}
		expect([...seen].sort((a, b) => a - b)).toEqual([1, 2]);
	});

	it('consumes exactly one roll per count', () => {
		const rand = scriptRand([0.99]);
		treatCount(rand.rng);
		expect(rand.calls()).toBe(1);
	});
});

describe('burstFor / priceFor — the eight tricks (spec §7)', () => {
	it.each<{ id: TrickId; price: number; burst: number }>([
		{ id: 'boo', price: 0, burst: 4 },
		{ id: 'ragnetto', price: 15, burst: 5 },
		{ id: 'serpente', price: 30, burst: 6 },
		{ id: 'cuscino', price: 45, burst: 6 },
		{ id: 'maschera', price: 60, burst: 7 },
		{ id: 'topolino', price: 75, burst: 7 },
		{ id: 'fantasmino', price: 90, burst: 8 },
		{ id: 'mano', price: 110, burst: 8 }
	])('$id costs $price and bursts $burst', ({ id, price, burst }) => {
		expect(priceFor(id)).toBe(price);
		expect(burstFor(id)).toBe(burst);
		expect(TRICKS[id].price).toBe(price);
		expect(TRICKS[id].burst).toBe(burst);
	});

	it('follows the pinned price ladder and burst tiers in TRICK_ORDER order', () => {
		const prices = [0, 15, 30, 45, 60, 75, 90, 110];
		const bursts = [4, 5, 6, 6, 7, 7, 8, 8];
		TRICK_ORDER.forEach((id, i) => {
			expect(priceFor(id)).toBe(prices[i]);
			expect(burstFor(id)).toBe(bursts[i]);
		});
	});

	it('stays total for unknown ids (0) — the loop guards reject them first', () => {
		expect(priceFor('saxophone')).toBe(0);
		expect(burstFor('saxophone')).toBe(0);
	});
});

describe('canBuy — the pure BUY guard (spec §8)', () => {
	it.each<{ why: string; bag: number; owned: string[]; id: string; expected: boolean }>([
		{ why: 'an unknown trick id', bag: 999, owned: [], id: 'saxophone', expected: false },
		{
			why: 'an already owned trick (even free boo)',
			bag: 999,
			owned: ['boo'],
			id: 'boo',
			expected: false
		},
		{ why: 'an insufficient bag (14 < 15)', bag: 14, owned: [], id: 'ragnetto', expected: false },
		{ why: 'the exact price (15 = 15)', bag: 15, owned: [], id: 'ragnetto', expected: true },
		{ why: 'a rich bag (110 for the 110 trick)', bag: 110, owned: [], id: 'mano', expected: true },
		{
			why: 'the free trick with an owned sibling',
			bag: 0,
			owned: ['ragnetto'],
			id: 'boo',
			expected: true
		}
	])('returns $expected for $why', ({ bag, owned, id, expected }) => {
		expect(canBuy(bag, owned, id)).toBe(expected);
	});

	it('allows every trick at exactly its price and refuses it one candy below', () => {
		TRICK_ORDER.forEach((id) => {
			const price = priceFor(id);
			expect(canBuy(price, [], id)).toBe(true);
			expect(canBuy(price - 1, [], id)).toBe(false);
		});
	});

	it('never mutates the owned list it is given', () => {
		const owned = ['boo'];
		canBuy(999, owned, 'mano');
		expect(owned).toEqual(['boo']);
	});
});
