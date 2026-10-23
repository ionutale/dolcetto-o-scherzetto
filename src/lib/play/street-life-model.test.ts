import { describe, expect, it } from 'vitest';
import {
	FIRECRACKER_DUR_MS,
	FIRECRACKER_FIRST_MS,
	FIRECRACKER_MIN_MS,
	STROLLER_FIRST_MS,
	STROLLER_MIN_MS,
	VAN_FIRST_MS,
	VAN_MIN_MS,
	VAN_TOSS_AT,
	ambientMayFire,
	beatTick,
	firecrackerCount,
	firecrackerDone,
	firecrackerX,
	firstFirecrackerAt,
	firstStrollerAt,
	firstVanAt,
	nextFirecrackerAt,
	nextStrollerAt,
	nextVanAt,
	strollerNearDuo,
	strollerX,
	vanProgress,
	vanShouldToss,
	vanX
} from './street-life-model';

describe('ambientMayFire', () => {
	it('allows only roam + walking + shop closed + no scare + idle beat', () => {
		expect(
			ambientMayFire({
				phase: 'roam',
				dir: 1,
				shopOpen: false,
				scareActive: false,
				active: false
			})
		).toBe(true);
		expect(
			ambientMayFire({
				phase: 'door',
				dir: 1,
				shopOpen: false,
				scareActive: false,
				active: false
			})
		).toBe(false);
		expect(
			ambientMayFire({
				phase: 'roam',
				dir: 0,
				shopOpen: false,
				scareActive: false,
				active: false
			})
		).toBe(false);
		expect(
			ambientMayFire({
				phase: 'roam',
				dir: 1,
				shopOpen: true,
				scareActive: false,
				active: false
			})
		).toBe(false);
		expect(
			ambientMayFire({
				phase: 'roam',
				dir: 1,
				shopOpen: false,
				scareActive: true,
				active: false
			})
		).toBe(false);
		expect(
			ambientMayFire({
				phase: 'roam',
				dir: 1,
				shopOpen: false,
				scareActive: false,
				active: true
			})
		).toBe(false);
	});
});

describe('cadences', () => {
	it('pins first waits and floors', () => {
		expect(FIRECRACKER_FIRST_MS).toBe(50_000);
		expect(STROLLER_FIRST_MS).toBe(55_000);
		expect(VAN_FIRST_MS).toBe(70_000);
		expect(firstFirecrackerAt(0)).toBe(FIRECRACKER_FIRST_MS);
		expect(firstStrollerAt(10)).toBe(10 + STROLLER_FIRST_MS);
		expect(firstVanAt(0)).toBe(VAN_FIRST_MS);
		expect(nextFirecrackerAt(0, () => 0)).toBe(FIRECRACKER_MIN_MS);
		expect(nextStrollerAt(0, () => 0)).toBe(STROLLER_MIN_MS);
		expect(nextVanAt(0, () => 0)).toBe(VAN_MIN_MS);
	});
});

describe('beatTick', () => {
	it('defers when gated, fires when due and open', () => {
		const blocked = beatTick(
			{
				now: 100_000,
				nextAt: 50_000,
				phase: 'roam',
				dir: 0,
				shopOpen: false,
				scareActive: false,
				active: false
			},
			(n) => n + 1,
			() => 0
		);
		expect(blocked.fire).toBe(false);
		expect(blocked.nextAt).toBe(50_000);

		const fired = beatTick(
			{
				now: 100_000,
				nextAt: 50_000,
				phase: 'roam',
				dir: 1,
				shopOpen: false,
				scareActive: false,
				active: false
			},
			(n) => n + 999,
			() => 0
		);
		expect(fired.fire).toBe(true);
		expect(fired.nextAt).toBe(100_999);
	});
});

describe('crossings', () => {
	it('moves firecracker kids across and finishes on duration', () => {
		expect(firecrackerX(0)).toBeLessThan(0);
		expect(firecrackerX(FIRECRACKER_DUR_MS)).toBeGreaterThan(800);
		expect(firecrackerDone(FIRECRACKER_DUR_MS - 1)).toBe(false);
		expect(firecrackerDone(FIRECRACKER_DUR_MS)).toBe(true);
		expect(firecrackerCount(() => 0)).toBe(2);
		expect(firecrackerCount(() => 0.99)).toBe(3);
	});

	it('waves the stroller near the duo', () => {
		expect(strollerNearDuo(310)).toBe(true);
		expect(strollerNearDuo(500)).toBe(false);
		expect(strollerX(0)).toBeLessThan(0);
	});

	it('tosses the van candy exactly once across the threshold', () => {
		expect(vanShouldToss(0.4, VAN_TOSS_AT)).toBe(true);
		expect(vanShouldToss(VAN_TOSS_AT, 0.9)).toBe(false);
		expect(vanProgress(0)).toBe(0);
		expect(vanX(0)).toBeLessThan(0);
	});
});
