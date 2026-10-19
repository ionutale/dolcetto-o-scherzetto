import { describe, expect, it } from 'vitest';
import { TREADMILL_PX, createTreadmill } from './treadmill';

/**
 * Pinning suite for the walk treadmill's clock: it must count *walked*
 * distance only, fire exactly at the boundary, reset cleanly, count either
 * direction, and refuse to credit a teleport (boot restores jump worldX).
 */

describe('the walk treadmill clock', () => {
	it('fires once per interval of walked distance', () => {
		const tm = createTreadmill(1000);
		const fires: number[] = [];
		let x = 0;
		tm.tick(x); // the first tick only anchors — no distance yet
		for (let i = 0; i < 35; i++) {
			x += 100;
			if (tm.tick(x)) fires.push(x);
		}
		expect(fires).toEqual([1000, 2000, 3000]);
	});

	it('counts walking backwards too (|Δ|)', () => {
		const tm = createTreadmill(1000);
		let x = 0;
		tm.tick(x);
		let fired = false;
		for (let i = 0; i < 12 && !fired; i++) {
			x -= 100; // frame-realistic steps, walking left
			fired = tm.tick(x);
		}
		expect(fired).toBe(true);
		expect(x).toBe(-1000);
	});

	it('does not count standing still', () => {
		const tm = createTreadmill(1000);
		tm.tick(0);
		for (let i = 0; i < 20; i++) expect(tm.tick(0)).toBe(false);
	});

	it('clamps a teleport instead of crediting it', () => {
		const tm = createTreadmill(1000);
		tm.tick(0);
		// A boot restore can jump worldX by hundreds of thousands of px; the
		// clamped 250 px step must NOT trigger a recycle.
		expect(tm.tick(500_000)).toBe(false);
		// …and the next real 1000 px of walking still fires on schedule.
		let x = 500_000;
		let fired = false;
		for (let i = 0; i < 9 && !fired; i++) {
			x += 100;
			fired = tm.tick(x);
		}
		expect(fired).toBe(true);
	});

	it('needs a full interval after each fire (frame-density ticks)', () => {
		const tm = createTreadmill(1000);
		const fires: number[] = [];
		let x = 0;
		tm.tick(x);
		for (let i = 0; i < 320; i++) {
			x += 16; // 60 fps at ~960 px/s — far past the walk speed, stress only
			if (tm.tick(x)) fires.push(x);
		}
		expect(fires.length).toBeGreaterThanOrEqual(4);
		for (let i = 1; i < fires.length; i++) {
			expect(fires[i] - fires[i - 1]).toBeGreaterThanOrEqual(1000);
		}
	});

	it('has a sane default cadence', () => {
		expect(TREADMILL_PX).toBe(1500);
		expect(createTreadmill()).toBeTruthy();
	});
});
