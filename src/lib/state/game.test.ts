import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRand } from '../sim/loop';
import type { KnockOutcome } from '../sim/loop';
import { activeK, canWalk, dir, dispatch, phase, start, stop, step, worldX } from './game.svelte';

/**
 * Pinning suite for the T10 store (`src/lib/state/game.svelte.ts`).
 *
 * The store owns no rules of its own — these rows prove that delegation: the
 * 190 px/s walk speed, STOP, the door/collect/trick freeze and the frame clamp
 * are the sim's (`loop.test.ts` pins them there), and `start()`/`stop()` is the
 * only new behaviour this module adds.
 *
 * Randomness is always the injected feeder (`setRand(() => 0)`), so every roll
 * lands low and no outcome is ever sampled from `Math.random`.
 */

beforeEach(() => {
	stop();
	setRand(() => 0);
	// RESET parks a fresh run: roam, worldX −260, dir 0, no shop.
	dispatch({ type: 'RESET' });
});

afterEach(() => {
	stop();
	vi.unstubAllGlobals();
	setRand(Math.random);
});

/** Parks the kids on house 0's doorstep (`activeK` 0) with a settling tick. */
function atDoor(force: KnockOutcome): void {
	dispatch({ type: 'RESET', opts: { worldX: 0, force: { 0: force } } });
	step(0);
	expect(activeK()).toBe(0);
}

/** The full door→resolve entry for a scripted outcome. */
function knockAndResolve(force: KnockOutcome): void {
	atDoor(force);
	dispatch({ type: 'KNOCK' });
	dispatch({ type: 'RESOLVE' });
}

/** Runs `n` ticks of `dt` seconds — the "N seconds of steps" helper. */
function walkFor(n: number, dt: number): void {
	for (let i = 0; i < n; i++) step(dt);
}

describe('dispatch + step drive the sim', () => {
	it('WALK advances worldX at 190 px/s (one second of steps ≈ 190 px)', () => {
		const x0 = worldX();
		expect(x0).toBe(-260);
		expect(dir()).toBe(0);
		expect(phase()).toBe('roam');

		dispatch({ type: 'WALK', dir: 1 });
		expect(dir()).toBe(1);
		walkFor(100, 0.01); // 100 × 0.01 s = 1 s

		// SPEED is pinned at 190 px/s in the sim; 1 s of walking covers it.
		expect(worldX()).toBeCloseTo(x0 + 190, 5);
	});

	it('STOP halts the duo — later ticks no longer move the world', () => {
		dispatch({ type: 'WALK', dir: -1 });
		walkFor(5, 0.05);
		dispatch({ type: 'STOP' });
		expect(dir()).toBe(0);

		const x = worldX();
		walkFor(3, 0.05);
		expect(worldX()).toBe(x);
	});
});

describe('the sim’s walk guard is mirrored by dispatch (no-op refusals)', () => {
	it('refuses WALK in the door phase', () => {
		atDoor('treat');
		dispatch({ type: 'KNOCK' });
		expect(phase()).toBe('door');
		expect(canWalk()).toBe(false);

		dispatch({ type: 'WALK', dir: 1 });
		expect(dir()).toBe(0); // dispatch changed nothing
		const x = worldX();
		step(0.05);
		expect(worldX()).toBe(x); // and the tick refused to move it either
	});

	it('refuses WALK in the collect phase', () => {
		knockAndResolve('treat'); // feeder rng 0 → treat → candies → collect
		expect(phase()).toBe('collect');
		expect(canWalk()).toBe(false);

		dispatch({ type: 'WALK', dir: -1 });
		expect(dir()).toBe(0);
		const x = worldX();
		step(0.05);
		expect(worldX()).toBe(x);
	});

	it('refuses WALK in the trick phase, while the refuse window still walks', () => {
		knockAndResolve('refuse');
		expect(phase()).toBe('refuse');
		// quirk kept from the loop: `refuse` is walkable (you may back off).
		expect(canWalk()).toBe(true);
		dispatch({ type: 'WALK', dir: 1 });
		expect(dir()).toBe(1);
		dispatch({ type: 'STOP' });

		dispatch({ type: 'PLAY_TRICK', id: 'boo' });
		expect(phase()).toBe('trick');
		expect(canWalk()).toBe(false);

		dispatch({ type: 'WALK', dir: 1 });
		expect(dir()).toBe(0);
		const x = worldX();
		step(0.05);
		expect(worldX()).toBe(x);
	});
});

describe('the frame clamp (prototype `Math.min(.05, dt)`)', () => {
	it('turns a raw 1.0 s step into 0.05 s of travel, and never rewinds', () => {
		dispatch({ type: 'WALK', dir: 1 });
		const x0 = worldX();

		step(1.0); // a stalled tab's whole gap
		expect(worldX()).toBeCloseTo(x0 + 9.5, 6); // 190 × 0.05

		const x1 = worldX();
		step(-1); // a clock that went backwards buys no distance
		expect(worldX()).toBe(x1);
	});
});

describe('start() / stop() lifecycle', () => {
	it('is idempotent: one loop, cancel once, stop twice safe, dead frame after stop', () => {
		const frames: Array<(t: number) => void> = [];
		const request = vi.fn((cb: (t: number) => void) => {
			frames.push(cb);
			return frames.length; // rAF id: 1, then 2, …
		});
		const cancel = vi.fn();
		vi.stubGlobal('requestAnimationFrame', request);
		vi.stubGlobal('cancelAnimationFrame', cancel);

		start();
		start(); // no second loop
		expect(request).toHaveBeenCalledTimes(1);
		expect(cancel).not.toHaveBeenCalled();

		// A live frame ticks the sim (and its 1 s gap is clamped to 0.05 s).
		dispatch({ type: 'WALK', dir: 1 });
		const x0 = worldX();
		frames[0](performance.now() + 1000);
		expect(worldX()).toBeCloseTo(x0 + 9.5, 6);
		expect(request).toHaveBeenCalledTimes(2); // the loop asked for the next frame

		stop();
		stop(); // safe a second time
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledWith(2);

		// A frame queued before stop() must not tick the sim any more.
		const x1 = worldX();
		frames[1](performance.now() + 1000);
		expect(worldX()).toBe(x1);
		expect(request).toHaveBeenCalledTimes(2);
	});
});
