import { describe, expect, it } from 'vitest';
import { BREATH_EVERY_MS, createBreathClock } from './breath-model';

/**
 * Pinning suite for the raster-breath clock: it must count *walking* time
 * only, fire exactly at the boundary, reset cleanly, and refuse to credit
 * phantom time across a backgrounded-tab gap.
 */

describe('the raster-breath clock', () => {
	it('fires once per interval of moving time', () => {
		const clock = createBreathClock(1000);
		const fires: number[] = [];
		for (let t = 0; t <= 2500; t += 100) {
			if (clock.tick(t, true)) fires.push(t);
		}
		// 1000ms of moving ticks → first fire; then a fresh 1000ms → second.
		expect(fires).toEqual([1000, 2000]);
	});

	it('does not accumulate while not moving', () => {
		const clock = createBreathClock(1000);
		for (let t = 0; t <= 2000; t += 100) expect(clock.tick(t, false)).toBe(false);
		// The last non-moving tick set `last`; moving now accumulates from there.
		let fired = false;
		for (let t = 2100; t <= 3100 && !fired; t += 100) fired = clock.tick(t, true);
		expect(fired).toBe(true);
	});

	it('clamps a backgrounded-tab gap instead of crediting it', () => {
		const clock = createBreathClock(1000);
		expect(clock.tick(0, true)).toBe(false);
		// 50 seconds pass between frames (tab was hidden): the clamped 250ms
		// must NOT trigger a breath.
		expect(clock.tick(50_000, true)).toBe(false);
	});

	it('never fires twice inside one interval (frame-density ticks)', () => {
		const clock = createBreathClock(1000);
		const fires: number[] = [];
		for (let t = 0; t <= 5000; t += 16) {
			if (clock.tick(t, true)) fires.push(t);
		}
		// ~one fire per 1000 ms of moving time at 60 fps ticks…
		expect(fires.length).toBeGreaterThanOrEqual(4);
		expect(fires.length).toBeLessThanOrEqual(5);
		// …and never two inside the same interval.
		for (let i = 1; i < fires.length; i++) {
			expect(fires[i] - fires[i - 1]).toBeGreaterThanOrEqual(1000);
		}
	});

	it('has a sane default cadence', () => {
		expect(BREATH_EVERY_MS).toBe(12_000);
		expect(createBreathClock()).toBeTruthy();
	});
});
