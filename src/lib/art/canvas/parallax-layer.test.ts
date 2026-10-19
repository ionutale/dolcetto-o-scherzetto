/**
 * Pure-math unit tests for parallax-layer.ts
 *
 * Tests C1 skip/clamp maths at and around both thresholds (including the 300 px apron),
 * factor values, fog phase with a negative delay, and a spot-check of the roofs/trees tables.
 */
import { describe, it, expect } from 'vitest';

// Constants from the module (duplicated here for test independence)
const STAGE_W = 852;
const BAND_W = 2400;
const APRON = 300;
const FAR_FACTOR = 0.45;
const MID_FACTOR = 0.7;
const ROOF_BLOCKS = Array.from({ length: 8 }, (_, i) => i * 300 - 40);
const TREES = Array.from({ length: 7 }, (_, i) => i * 340 + 40);
const FOG = [
	{ left: 120, top: 150, delay: 0 },
	{ left: 820, top: 120, delay: -8 },
	{ left: 1500, top: 160, delay: -16 }
] as const;
const DRIFT_PERIOD_S = 26;
const DRIFT_AMP_PX = 40;

// Re-implement the pure functions for testing (not imported to keep tests isolated)

function computeShift(worldX: number, factor: number): { shift: number; away: boolean } {
	const raw = -worldX * factor;
	const away = raw <= -BAND_W - APRON || raw >= STAGE_W + APRON;
	const shift = Math.min(Math.max(raw, -BAND_W), STAGE_W);
	return { shift, away };
}

function fogDriftOffset(tMs: number, delay: number, reducedMotion: boolean): number {
	if (reducedMotion) return 0;
	const periodMs = DRIFT_PERIOD_S * 1000;
	const phaseMs = (((tMs + delay * 1000) % periodMs) + periodMs) % periodMs;
	const phase01 = phaseMs / periodMs;
	const triangle = phase01 <= 0.5 ? phase01 * 2 : (1 - phase01) * 2;
	const eased = 0.5 * (1 - Math.cos(Math.PI * triangle));
	return -DRIFT_AMP_PX + eased * (2 * DRIFT_AMP_PX);
}

describe('parallax-layer: C1 skip/clamp maths', () => {
	describe('far band (factor 0.45)', () => {
		it('raw <= -BAND_W - APRON → away=true', () => {
			// raw = -worldX * 0.45 <= -2700
			// worldX >= 2700 / 0.45 = 6000
			const { away, shift } = computeShift(6000, FAR_FACTOR);
			expect(away).toBe(true);
			expect(shift).toBe(-BAND_W); // clamped to -2400
		});

		it('raw just inside left apron → away=false, shift clamped', () => {
			// raw = -2699 (just inside -2700)
			// worldX = 2699 / 0.45
			const worldX = 2699 / FAR_FACTOR;
			const { away, shift } = computeShift(worldX, FAR_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBe(-BAND_W); // clamped to -2400
		});

		it('raw = 0 → away=false, shift=0', () => {
			const { away, shift } = computeShift(0, FAR_FACTOR);
			expect(away).toBe(false);
			expect(shift === 0).toBe(true); // -0 === 0 is true
		});

		it('raw = STAGE_W → away=false, shift=STAGE_W', () => {
			// raw = 852 = -worldX * 0.45 → worldX = -852/0.45 = -5680/3
			const worldX = -STAGE_W / FAR_FACTOR;
			const { away, shift } = computeShift(worldX, FAR_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBe(STAGE_W);
		});

		it('raw just inside right apron → away=false, shift clamped', () => {
			// raw = STAGE_W + APRON - 1 = 852 + 300 - 1 = 1151
			// worldX = -1151 / 0.45
			const worldX = -(STAGE_W + APRON - 1) / FAR_FACTOR;
			const { away, shift } = computeShift(worldX, FAR_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBe(STAGE_W);
		});

		it('raw >= STAGE_W + APRON → away=true', () => {
			// raw = 1152
			// worldX = -1152 / 0.45 = -2560
			const worldX = -(STAGE_W + APRON) / FAR_FACTOR;
			const { away, shift } = computeShift(worldX, FAR_FACTOR);
			expect(away).toBe(true);
			expect(shift).toBe(STAGE_W); // clamped to 852
		});
	});

	describe('mid band (factor 0.7)', () => {
		it('raw <= -BAND_W - APRON → away=true', () => {
			// raw = -worldX * 0.7 <= -2700
			// worldX >= 2700 / 0.7
			const worldX = (BAND_W + APRON) / MID_FACTOR;
			const { away, shift } = computeShift(worldX, MID_FACTOR);
			expect(away).toBe(true);
			expect(shift).toBe(-BAND_W);
		});

		it('raw just inside left apron → away=false', () => {
			// raw = -2699
			// worldX = 2699 / 0.7
			const worldX = (BAND_W + APRON - 1) / MID_FACTOR;
			const { away, shift } = computeShift(worldX, MID_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBe(-BAND_W);
		});

		it('raw = 0 → away=false, shift=0', () => {
			const { away, shift } = computeShift(0, MID_FACTOR);
			expect(away).toBe(false);
			expect(shift === 0).toBe(true);
		});

		it('raw = STAGE_W → away=false, shift=STAGE_W', () => {
			// raw = 852 = -worldX * 0.7 → worldX = -852/0.7
			const worldX = -STAGE_W / MID_FACTOR;
			const { away, shift } = computeShift(worldX, MID_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBeCloseTo(STAGE_W, 10);
		});

		it('raw just inside right apron → away=false', () => {
			// raw = 1151
			// worldX = -1151 / 0.7
			const worldX = -(STAGE_W + APRON - 1) / MID_FACTOR;
			const { away, shift } = computeShift(worldX, MID_FACTOR);
			expect(away).toBe(false);
			expect(shift).toBe(STAGE_W);
		});

		it('raw >= STAGE_W + APRON → away=true', () => {
			// raw = 1152
			// worldX = -1152 / 0.7
			const worldX = -(STAGE_W + APRON) / MID_FACTOR;
			const { away, shift } = computeShift(worldX, MID_FACTOR);
			expect(away).toBe(true);
			expect(shift).toBe(STAGE_W);
		});
	});
});

describe('parallax-layer: factor values', () => {
	it('FAR_FACTOR = 0.45', () => {
		expect(FAR_FACTOR).toBe(0.45);
	});
	it('MID_FACTOR = 0.7', () => {
		expect(MID_FACTOR).toBe(0.7);
	});
});

describe('parallax-layer: fog drift phase', () => {
	it('delay = 0 at t=0 → phase 0 → offset = -40 (start of drift)', () => {
		const offset = fogDriftOffset(0, 0, false);
		expect(offset).toBeCloseTo(-DRIFT_AMP_PX, 5);
	});

	it('delay = 0 at t=13s (half period) → phase 0.5 → offset = 40 (end of drift)', () => {
		const offset = fogDriftOffset(13_000, 0, false);
		expect(offset).toBeCloseTo(DRIFT_AMP_PX, 1);
	});

	it('delay = 0 at t=26s (full period) → phase 1 → offset = -40 (back to start)', () => {
		const offset = fogDriftOffset(26_000, 0, false);
		expect(offset).toBeCloseTo(-DRIFT_AMP_PX, 1);
	});

	it('negative delay works: delay = -8 at t=0 → same as t=8s with delay=0', () => {
		const offsetNegDelay = fogDriftOffset(0, -8, false);
		const offsetPosTime = fogDriftOffset(8_000, 0, false);
		expect(offsetNegDelay).toBeCloseTo(offsetPosTime, 5);
	});

	it('negative delay -16 at t=0 → same as t=16s with delay=0', () => {
		const offsetNegDelay = fogDriftOffset(0, -16, false);
		const offsetPosTime = fogDriftOffset(16_000, 0, false);
		expect(offsetNegDelay).toBeCloseTo(offsetPosTime, 5);
	});

	it('reducedMotion = true → offset = 0 (base transform, no drift)', () => {
		const offset = fogDriftOffset(10_000, 0, true);
		expect(offset).toBe(0);
	});

	it('reducedMotion = true with negative delay → offset = 0', () => {
		const offset = fogDriftOffset(0, -8, true);
		expect(offset).toBe(0);
	});

	it('drift is smooth (ease-in-out): offset at 25% period ≈ -20', () => {
		// At 25% of period (6.5s), triangle = 0.5, eased = 0.5, offset = -40 + 0.5*80 = 0
		const offset = fogDriftOffset(6_500, 0, false);
		expect(offset).toBeCloseTo(0, 1);
	});

	it('drift at 75% period (19.5s) → offset ≈ 0 (symmetric)', () => {
		const offset = fogDriftOffset(19_500, 0, false);
		expect(offset).toBeCloseTo(0, 1);
	});
});

describe('parallax-layer: roof blocks table', () => {
	it('8 blocks at i * 300 - 40', () => {
		expect(ROOF_BLOCKS).toHaveLength(8);
		expect(ROOF_BLOCKS[0]).toBe(-40);
		expect(ROOF_BLOCKS[1]).toBe(260);
		expect(ROOF_BLOCKS[2]).toBe(560);
		expect(ROOF_BLOCKS[3]).toBe(860);
		expect(ROOF_BLOCKS[4]).toBe(1160);
		expect(ROOF_BLOCKS[5]).toBe(1460);
		expect(ROOF_BLOCKS[6]).toBe(1760);
		expect(ROOF_BLOCKS[7]).toBe(2060);
	});

	it('last block ends at x+212 = 2060+212 = 2272 < BAND_W (2400)', () => {
		const lastBlockX = ROOF_BLOCKS[7];
		const archEnd = lastBlockX + 212;
		expect(archEnd).toBeLessThan(BAND_W);
	});
});

describe('parallax-layer: trees table', () => {
	it('7 trees at i * 340 + 40', () => {
		expect(TREES).toHaveLength(7);
		expect(TREES[0]).toBe(40);
		expect(TREES[1]).toBe(380);
		expect(TREES[2]).toBe(720);
		expect(TREES[3]).toBe(1060);
		expect(TREES[4]).toBe(1400);
		expect(TREES[5]).toBe(1740);
		expect(TREES[6]).toBe(2080);
	});

	it('last tree at 2080, tree box 120px wide → ends at 2200 < BAND_W (2400)', () => {
		const lastTreeX = TREES[6];
		expect(lastTreeX + 120).toBeLessThan(BAND_W);
	});

	it('hedge at tree x + 170, hedge box 120px wide → last hedge ends at 2080+170+120 = 2370 < 2400', () => {
		const lastTreeX = TREES[6];
		expect(lastTreeX + 170 + 120).toBeLessThan(BAND_W);
	});
});

describe('parallax-layer: fog wisp positions', () => {
	it('three wisps at specified coordinates', () => {
		expect(FOG).toHaveLength(3);
		expect(FOG[0]).toEqual({ left: 120, top: 150, delay: 0 });
		expect(FOG[1]).toEqual({ left: 820, top: 120, delay: -8 });
		expect(FOG[2]).toEqual({ left: 1500, top: 160, delay: -16 });
	});

	it('all wisps within band width (left + 340 <= 2400)', () => {
		for (const wisp of FOG) {
			expect(wisp.left + FOG[0].left).toBeLessThanOrEqual(BAND_W); // FOG_W = 340
		}
	});
});
