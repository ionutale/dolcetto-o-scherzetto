import { describe, expect, it } from 'vitest';
import { SPACING } from '$lib/sim/loop';
import { decorSlots, type DecorKind, type DecorSlot } from '../scene/theme-model';
import { alternateOf, decorX, easeInOut, phaseOf, shootFade, splitSlots } from './decor-layer';

/**
 * Pinning suite for the decor port's pure lanes (no DOM, no canvas): the loop
 * phase clocks (including the CSS `alternate` fold), the CSS `ease-in-out`
 * solver, the shooting star's `shootFade` keyframes, the sky/ground split and
 * the ThemeLayer node-position contract (`decorX`). The pixel work itself is
 * the drawn port of `ThemeLayer.svelte`, owner-validated by eyeball.
 */

/** One window slot for the split/x fixtures (rows matter, geometry barely). */
function slot(kind: DecorKind, k = 3, off = 10): DecorSlot {
	return { kind, off, y: 100, w: 20, h: 10, tone: 0, delay: 0, k, i: 0, slot: 0 };
}

describe('decor-layer loop clocks', () => {
	it('wraps a positive delay into the cycle', () => {
		// 8 s in + 1 s delay = a whole 9 s leafDrift lap back to its 0% frame.
		expect(phaseOf(8_000, 1, 9)).toBeCloseTo(0);
		expect(phaseOf(0, 0, 9)).toBe(0);
		expect(phaseOf(4_500, 0, 9)).toBeCloseTo(0.5);
	});

	it('folds negative delays with a positive mod', () => {
		// −0.5 s of delay in a 9 s cycle: 8.5/9 through the lap.
		expect(phaseOf(0, -0.5, 9)).toBeCloseTo(8.5 / 9);
		// 1 s in with −3 s of delay in a 22 s wispDrift: elapsed −2 s → 20/22 through.
		expect(phaseOf(1_000, -3, 22)).toBeCloseTo(20 / 22);
	});

	it('alternates: even cycles forward, odd cycles reversed', () => {
		expect(alternateOf(0, 0, 22)).toBeCloseTo(0); // cycle 0, lap start
		expect(alternateOf(11_000, 0, 22)).toBeCloseTo(0.5); // cycle 0, mid
		expect(alternateOf(22_000, 0, 22)).toBeCloseTo(1); // cycle 1 → the far end
		expect(alternateOf(33_000, 0, 22)).toBeCloseTo(0.5); // cycle 1 mid, mirrored
		expect(alternateOf(0, -33, 22)).toBeCloseTo(0.5); // elapsed −33 → even cycle −2
	});
});

describe('decor-layer ease helper (the CSS ease-in-out keyword)', () => {
	it('pins the endpoints', () => {
		expect(easeInOut(0)).toBe(0);
		expect(easeInOut(1)).toBe(1);
	});

	it('is symmetric and settles the midpoints the bezier does', () => {
		// cubic-bezier(0.42, 0, 0.58, 1) is point-symmetric about (0.5, 0.5).
		expect(easeInOut(0.5)).toBeCloseTo(0.5);
		const q = easeInOut(0.25);
		expect(q).toBeGreaterThan(0);
		expect(q).toBeLessThan(0.5);
		expect(easeInOut(0.75)).toBeCloseTo(1 - q);
	});
});

describe('decor-layer shootFade (the .shoot opacity keyframes)', () => {
	// @keyframes shootFade: 0% o0 → 12% o1 → 78% o1 → 100% o0, linear.
	it('follows the pinned stops across the crossing', () => {
		expect(shootFade(0)).toBe(0);
		expect(shootFade(0.06)).toBeCloseTo(0.5);
		expect(shootFade(0.12)).toBe(1);
		expect(shootFade(0.5)).toBe(1);
		expect(shootFade(0.78)).toBe(1);
		expect(shootFade(1)).toBe(0);
	});

	it('clamps a hostile t like the model clamps shootProgress', () => {
		expect(shootFade(-2)).toBe(0);
		expect(shootFade(1.5)).toBe(0);
	});
});

describe('decor-layer sky/ground split (ThemeLayer’s two tracks)', () => {
	it('sends wisp/mist/shimmer to the sky track, the rest to the ground one', () => {
		const { sky, ground } = splitSlots([
			slot('leaf'),
			slot('wisp'),
			slot('mist'),
			slot('pumpkin'),
			slot('hay'),
			slot('shimmer')
		]);
		expect(sky.map((s) => s.kind)).toEqual(['wisp', 'mist', 'shimmer']);
		expect(ground.map((s) => s.kind)).toEqual(['leaf', 'pumpkin', 'hay']);
	});

	it('reads the real windows the same way (a whole theme under one key)', () => {
		// pumpkin themes only pick pumpkin + hay; starry only shimmer.
		expect(splitSlots(decorSlots('pumpkin', 640)).sky).toHaveLength(0);
		expect(splitSlots(decorSlots('starry', 640)).ground).toHaveLength(0);
	});
});

describe('decor-layer decorX (ThemeLayer’s composed node x)', () => {
	it('answers the DOM’s k*SPACING + off − worldX', () => {
		// house k = 3 parked at 3·620 + 294, walked past 1852:
		expect(decorX(slot('leaf', 3, 294), 1852)).toBe(3 * SPACING + 294 - 1852);
		// the window's negative edge: house −1 is offstage, the math holds.
		expect(decorX(slot('leaf', -1, 50), 0)).toBe(-SPACING + 50);
	});
});
