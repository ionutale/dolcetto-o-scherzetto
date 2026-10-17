import { describe, expect, it } from 'vitest';
import {
	HOMES_PER_NEIGHBORHOOD,
	REFUSAL_BASE,
	REFUSAL_CAP,
	RICHNESS_CAP,
	THEMES,
	neighborhoodIndex,
	refusalP,
	richnessBias,
	themeFor,
	trackFurthest
} from './progression';
import { SPACING } from './loop';

/**
 * Table-driven pinning suite for the progression module (plan T07, spec §9).
 *
 * What spec §9 promises and BALANCE.md will later re-tune (not re-design):
 * progress = furthest house with no regression on backtrack, a neighborhood
 * every ~10 homes, a 4-theme rotation, and gently rising refusal/richness with
 * *soft caps*. Every number here is the documented BALANCE placeholder, so the
 * rows pin the **shape** (base → monotone rise → exact cap) rather than a
 * tuning value someone may legitimately nudge.
 */

describe('neighborhoodIndex', () => {
	it.each([
		// [furthestK, index] — every block of 10 homes is one neighborhood.
		[0, 0],
		[9, 0],
		[10, 1],
		[19, 1],
		[20, 2],
		[39, 3],
		// Non-integer / garbage progress clamps down instead of throwing.
		[-1, 0],
		[-10, 0],
		[-620, 0],
		[3.7, 0],
		[13.7, 1]
	])('furthestK %d → neighborhood %d', (furthestK, index) => {
		expect(neighborhoodIndex(furthestK)).toBe(index);
	});

	it('advances exactly once per 10 homes', () => {
		const seen = Array.from({ length: 40 }, (_, k) => neighborhoodIndex(k));
		expect(new Set(seen).size).toBe(4);
		expect(neighborhoodIndex(9 * HOMES_PER_NEIGHBORHOOD)).toBe(9);
		expect(neighborhoodIndex(10 * HOMES_PER_NEIGHBORHOOD)).toBe(10);
	});
});

describe('themeFor', () => {
	it('cycles 0-1-2-3-0 across at least 9 neighborhoods', () => {
		const rotation = Array.from({ length: 9 }, (_, i) => themeFor(i));
		expect(rotation).toEqual([
			'leafy',
			'foggy',
			'pumpkin',
			'starry',
			'leafy',
			'foggy',
			'pumpkin',
			'starry',
			'leafy'
		]);
		// …and every one of them is a declared theme.
		for (const t of rotation) expect(THEMES).toContain(t);
	});

	it('wraps negative indices instead of throwing (guard)', () => {
		expect(() => themeFor(-1)).not.toThrow();
		expect(themeFor(-1)).toBe(THEMES[3]);
		expect(themeFor(-4)).toBe(THEMES[0]);
		expect(themeFor(-5)).toBe(THEMES[3]);
		expect(themeFor(-100)).toBe(themeFor(-100 % THEMES.length));
		for (let i = -12; i <= 12; i += 1) expect(THEMES).toContain(themeFor(i));
	});
});

describe('refusalP (BALANCE placeholder)', () => {
	it('starts at the documented base 0.40', () => {
		expect(refusalP(0)).toBe(REFUSAL_BASE);
		expect(refusalP(0)).toBe(0.4);
		// Negative indices read as neighborhood 0 — never below the base.
		expect(refusalP(-3)).toBe(0.4);
	});

	it('rises +0.015 per neighborhood', () => {
		expect(refusalP(1)).toBeCloseTo(0.415, 12);
		expect(refusalP(5)).toBeCloseTo(0.475, 12);
		expect(refusalP(9)).toBeCloseTo(0.535, 12);
	});

	it('never decreases', () => {
		let prev = -Infinity;
		for (let i = -5; i <= 200; i += 1) {
			const p = refusalP(i);
			expect(p).toBeGreaterThanOrEqual(prev);
			prev = p;
		}
	});

	it('soft-caps at exactly 0.55 from index 10 up', () => {
		expect(refusalP(10)).toBe(0.55);
		expect(refusalP(10)).toBe(REFUSAL_CAP);
		for (let i = 10; i <= 500; i += 1) expect(refusalP(i)).toBe(0.55);
		// …and stays inside [base, cap] everywhere.
		for (let i = 0; i <= 500; i += 1) {
			expect(refusalP(i)).toBeGreaterThanOrEqual(0.4);
			expect(refusalP(i)).toBeLessThanOrEqual(0.55);
		}
	});
});

describe('richnessBias (BALANCE placeholder)', () => {
	it('starts at 0 and rises +0.03 per neighborhood', () => {
		expect(richnessBias(0)).toBe(0);
		expect(richnessBias(-7)).toBe(0);
		expect(richnessBias(1)).toBeCloseTo(0.03, 12);
		expect(richnessBias(4)).toBeCloseTo(0.12, 12);
	});

	it('is monotonic and caps at exactly 0.35', () => {
		let prev = -Infinity;
		for (let i = -5; i <= 200; i += 1) {
			const r = richnessBias(i);
			expect(r).toBeGreaterThanOrEqual(prev);
			prev = r;
		}
		// 12 × 0.03 = 0.36 → clamped to the cap, and every later index too.
		expect(richnessBias(12)).toBe(RICHNESS_CAP);
		expect(richnessBias(12)).toBe(0.35);
		for (let i = 12; i <= 500; i += 1) expect(richnessBias(i)).toBe(0.35);
		// …and never overshoots the cap before it.
		for (let i = 0; i <= 11; i += 1) expect(richnessBias(i)).toBeLessThan(0.35);
	});
});

describe('trackFurthest', () => {
	it('advances to the nearest doorstep ahead', () => {
		expect(trackFurthest(0, 0)).toBe(0);
		expect(trackFurthest(0, SPACING * 3)).toBe(3);
		expect(trackFurthest(0, SPACING * 3 + SPACING / 2 - 1)).toBe(3);
		expect(trackFurthest(0, SPACING * 3 + SPACING / 2)).toBe(4);
		expect(trackFurthest(0, SPACING * 12.4)).toBe(12);
	});

	it('never regresses when the player backtracks', () => {
		let furthest = 0;
		for (const k of [0, 1, 5, 9, 12]) {
			furthest = trackFurthest(furthest, k * SPACING);
			expect(furthest).toBe(k);
		}
		// Walk all the way back past house 0 — progress is pinned.
		for (const k of [11, 7, 3, 0, -1, -4]) {
			const next = trackFurthest(furthest, k * SPACING);
			expect(next).toBe(furthest);
			furthest = next;
		}
		expect(furthest).toBe(12);
	});

	it('is pure: returns the same value on repeat calls', () => {
		expect(trackFurthest(7, SPACING * 2)).toBe(7);
		expect(trackFurthest(7, SPACING * 2)).toBe(7);
		expect(trackFurthest(7, 0)).toBe(7);
	});

	it('handles negative worldX (before house 0) and negative prev', () => {
		expect(trackFurthest(0, -SPACING)).toBe(0);
		expect(trackFurthest(5, -SPACING * 2)).toBe(5);
		expect(trackFurthest(5, -70)).toBe(5);
		// A negative stored marker never drags an advancing world position down.
		expect(trackFurthest(0, -1)).toBe(0);
	});
});
