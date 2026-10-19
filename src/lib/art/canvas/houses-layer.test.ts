import { describe, expect, it } from 'vitest';
import {
	cubicBezier,
	delayedProgress,
	dimWindows,
	dressingItems,
	EASE_DOOR,
	EASE_NEIGHBOR,
	houseArtIndices,
	houseWindow,
	knockShakeOffset,
	neighborSvg,
	tweenValue,
	type TweenState
} from './houses-layer';

/**
 * Pinning suite for the houses layer's pure lanes (T4, 2026-10-19): the
 * recycling window, the house-art index mix, the `yardDressing(k)` selection
 * (raw modulo and all), and the timing evaluators (cubic-bezier, the knock
 * keyframes, the delayed door/neighbour tweens). DOM-free by design — the
 * layer's raster calls answer `null` without a canvas and are skipped.
 */

describe('houseWindow', () => {
	it('starts one house before the player and spans five slots', () => {
		expect(houseWindow(0)).toEqual({ firstK: -1, slots: [-1, 0, 1, 2, 3] });
		expect(houseWindow(619)).toEqual({ firstK: -1, slots: [-1, 0, 1, 2, 3] });
	});

	it('advances one house per SPACING (620) of world scroll', () => {
		expect(houseWindow(620)).toEqual({ firstK: 0, slots: [0, 1, 2, 3, 4] });
		expect(houseWindow(1240)).toEqual({ firstK: 1, slots: [1, 2, 3, 4, 5] });
	});

	it('floors negative scroll (window edge) without a `-0` surprise', () => {
		expect(houseWindow(-10)).toEqual({ firstK: -2, slots: [-2, -1, 0, 1, 2] });
	});
});

describe('houseArtIndices', () => {
	it('wraps the type over 8 kinds and the palette over 3 families', () => {
		expect(houseArtIndices(0)).toEqual({ typeIndex: 0, paletteIndex: 0 });
		expect(houseArtIndices(1)).toEqual({ typeIndex: 1, paletteIndex: 2 });
		expect(houseArtIndices(7)).toEqual({ typeIndex: 7, paletteIndex: 2 });
		expect(houseArtIndices(8)).toEqual({ typeIndex: 0, paletteIndex: 2 });
	});

	it('wraps negative house indices instead of exploding', () => {
		expect(houseArtIndices(-1)).toEqual({ typeIndex: 7, paletteIndex: 0 });
		expect(houseArtIndices(-8)).toEqual({ typeIndex: 0, paletteIndex: 1 });
	});
});

describe('dressingItems', () => {
	it('k = -1: raw modulo keeps the plain fence and drops the even/odd ornaments', () => {
		expect(dressingItems(-1)).toEqual([
			{ kind: 'fence', left: 64, width: 222, bottom: -52 },
			{ kind: 'fence', left: 334, width: 216, bottom: -52 },
			{ kind: 'gatepost', left: 285, bottom: -52 },
			{ kind: 'gatepost', left: 329, bottom: -52 },
			{ kind: 'path', left: 286, bottom: -52 },
			{ kind: 'sprite', sprite: 'mailbox', left: 246, bottom: -48 },
			{ kind: 'sprite', sprite: 'trashCan', left: 168, bottom: -40 },
			{ kind: 'sprite', sprite: 'pumpkinPair', left: 486, bottom: -46 },
			{ kind: 'lampglow', left: 524, bottom: -58 },
			{ kind: 'sprite', sprite: 'lampPost', left: 566, bottom: -68 },
			{ kind: 'sprite', sprite: 'candleLantern', left: 342, bottom: 44 }
		]);
	});

	it('k = 0: fences, gnome, tombstone, cobweb and the left-side lamp', () => {
		expect(dressingItems(0)).toEqual([
			{ kind: 'fence', left: 64, width: 222, bottom: -52 },
			{ kind: 'fence', left: 334, width: 216, bottom: -52 },
			{ kind: 'gatepost', left: 285, bottom: -52 },
			{ kind: 'gatepost', left: 329, bottom: -52 },
			{ kind: 'path', left: 286, bottom: -52 },
			{ kind: 'sprite', sprite: 'mailbox', left: 246, bottom: -48 },
			{ kind: 'sprite', sprite: 'trashCan', left: 168, bottom: -40 },
			{ kind: 'sprite', sprite: 'gnome', left: 404, bottom: -50 },
			{ kind: 'sprite', sprite: 'tombstone', left: 74, bottom: -38 },
			{ kind: 'sprite', sprite: 'pumpkinPair', left: 486, bottom: -46 },
			{ kind: 'lampglow', left: -6, bottom: -58 },
			{ kind: 'sprite', sprite: 'lampPost', left: 36, bottom: -68 },
			{ kind: 'sprite', sprite: 'cobweb', left: 204, bottom: 118 },
			{ kind: 'sprite', sprite: 'candleLantern', left: 342, bottom: 44 }
		]);
	});

	it('k = 1: bats on the right, no gnome, no cobweb', () => {
		expect(dressingItems(1)).toEqual([
			{ kind: 'fence', left: 64, width: 222, bottom: -52 },
			{ kind: 'fence', left: 334, width: 216, bottom: -52 },
			{ kind: 'gatepost', left: 285, bottom: -52 },
			{ kind: 'gatepost', left: 329, bottom: -52 },
			{ kind: 'path', left: 286, bottom: -52 },
			{ kind: 'sprite', sprite: 'mailbox', left: 246, bottom: -48 },
			{ kind: 'sprite', sprite: 'trashCan', left: 168, bottom: -40 },
			{ kind: 'sprite', sprite: 'pumpkinPair', left: 486, bottom: -46 },
			{ kind: 'lampglow', left: 524, bottom: -58 },
			{ kind: 'sprite', sprite: 'lampPost', left: 566, bottom: -68 },
			{ kind: 'sprite', sprite: 'bats', left: 150, bottom: 142 },
			{ kind: 'sprite', sprite: 'candleLantern', left: 342, bottom: 44 }
		]);
	});

	it('k = 3: no fence, scarecrow instead', () => {
		expect(dressingItems(3)).toEqual([
			{ kind: 'path', left: 286, bottom: -52 },
			{ kind: 'sprite', sprite: 'mailbox', left: 246, bottom: -48 },
			{ kind: 'sprite', sprite: 'trashCan', left: 168, bottom: -40 },
			{ kind: 'sprite', sprite: 'scarecrow', left: 446, bottom: -50 },
			{ kind: 'sprite', sprite: 'pumpkinPair', left: 486, bottom: -46 },
			{ kind: 'lampglow', left: 524, bottom: -58 },
			{ kind: 'sprite', sprite: 'lampPost', left: 566, bottom: -68 },
			{ kind: 'sprite', sprite: 'candleLantern', left: 342, bottom: 44 }
		]);
	});
});

describe('cubicBezier', () => {
	it('pins the endpoints exactly', () => {
		const cb = cubicBezier(0.34, 1.4, 0.64, 1);
		expect(cb(0)).toBe(0);
		expect(cb(1)).toBe(1);
		expect(cb(-0.5)).toBe(0);
		expect(cb(1.5)).toBe(1);
	});

	it('lets an overshooting control point swing past 1 mid-way (the door arc)', () => {
		// cubic-bezier(0.34, 1.4, 0.64, 1) peaks above 1 — the door leaf
		// overshoots, exactly as the CSS timing function does.
		expect(EASE_DOOR(0.5)).toBeGreaterThan(1);
		expect(EASE_NEIGHBOR(0.5)).toBeGreaterThan(0);
		expect(EASE_NEIGHBOR(0.5)).toBeLessThan(1.5);
	});
});

describe('knockShakeOffset', () => {
	it('hits the keyframe sample points (0%..100%)', () => {
		expect(knockShakeOffset(0)).toBe(0);
		expect(knockShakeOffset(0.2)).toBe(-2);
		expect(knockShakeOffset(0.4)).toBe(2);
		expect(knockShakeOffset(0.6)).toBe(-2);
		expect(knockShakeOffset(0.8)).toBe(1);
		expect(knockShakeOffset(1)).toBe(0);
	});

	it('clamps outside the animation', () => {
		expect(knockShakeOffset(-1)).toBe(0);
		expect(knockShakeOffset(2)).toBe(0);
	});
});

describe('delayedProgress', () => {
	it('holds at 0 through the delay, ramps, then clamps at 1', () => {
		expect(delayedProgress(0, 120, 400)).toBe(0);
		expect(delayedProgress(119, 120, 400)).toBe(0);
		expect(delayedProgress(120, 120, 400)).toBe(0);
		expect(delayedProgress(320, 120, 400)).toBe(0.5);
		expect(delayedProgress(520, 120, 400)).toBe(1);
		expect(delayedProgress(9999, 120, 400)).toBe(1);
	});

	it('snaps when the duration collapses (reduced motion)', () => {
		expect(delayedProgress(0, 120, 0)).toBe(0);
		expect(delayedProgress(119, 120, 0)).toBe(0);
		expect(delayedProgress(120, 120, 0)).toBe(1);
	});
});

describe('tweenValue', () => {
	it('swings the door 0 → 1 over 0.55s, easing toward the overshoot', () => {
		const door: TweenState = { from: 0, to: 1, startMs: 1000, durMs: 550, delayMs: 0 };
		expect(tweenValue(door, 1000, EASE_DOOR)).toBeCloseTo(0, 6);
		expect(tweenValue(door, 1550, EASE_DOOR)).toBeCloseTo(1, 6);
		expect(tweenValue(door, 1275, EASE_DOOR)).toBeCloseTo(EASE_DOOR(0.5), 6);
	});

	it('holds the neighbour through its 0.12s delay, then reveals over 0.4s', () => {
		const nb: TweenState = { from: 0, to: 1, startMs: 1000, durMs: 400, delayMs: 120 };
		expect(tweenValue(nb, 1000, EASE_NEIGHBOR)).toBe(0);
		expect(tweenValue(nb, 1120, EASE_NEIGHBOR)).toBe(0);
		expect(tweenValue(nb, 1320, EASE_NEIGHBOR)).toBeCloseTo(EASE_NEIGHBOR(0.5), 6);
		expect(tweenValue(nb, 1520, EASE_NEIGHBOR)).toBeCloseTo(1, 6);
	});

	it('snaps at the delay under reduced motion (durMs = 0)', () => {
		const snap: TweenState = { from: 0, to: 1, startMs: 1000, durMs: 0, delayMs: 120 };
		expect(tweenValue(snap, 1100, EASE_DOOR)).toBe(0);
		expect(tweenValue(snap, 1120, EASE_DOOR)).toBe(1);
	});
});

describe('art string helpers', () => {
	it('splices the dim style right after the opening svg tag', () => {
		expect(dimWindows('<svg width="240"><rect class="win"/></svg>')).toBe(
			'<svg width="240"><style>.win{fill:#4b3f5e}</style><rect class="win"/></svg>'
		);
	});

	it('extracts the svg out of the neighbour wrapper', () => {
		const svg = neighborSvg(0);
		expect(svg).not.toBeNull();
		expect(svg?.startsWith('<svg')).toBe(true);
		expect(svg?.endsWith('</svg>')).toBe(true);
		expect(svg).toContain('width="66"');
	});
});
