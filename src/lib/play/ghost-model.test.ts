import { describe, expect, it } from 'vitest';
import { SPACING } from '../sim/loop';
import {
	CAMEO_FIRST_MS,
	CAMEO_MIN_MS,
	CAMEO_RETRACT_MS,
	CAMEO_RISE_MS,
	CAMEO_VISIBLE_X0,
	CAMEO_VISIBLE_X1,
	GHOST_BOTTOM_BASE,
	GHOST_BOTTOM_STEP,
	GHOST_COUNT,
	GHOST_DRIFT_AMPLITUDE,
	GHOST_DRIFT_PHASE_STEP,
	GHOST_DRIFT_RATE,
	GHOST_HOP_MS,
	GHOST_PARALLAX,
	GHOST_WRAP,
	GHOST_WRAP_OFFSET,
	canScreenX,
	cameoTick,
	decideHop,
	ghostBaseX,
	ghostBottom,
	ghostPhase,
	ghostScreenX,
	hasCameoCan,
	nextCameoAt,
	nextShowToken,
	visibleCameoKs
} from './ghost-model';
import type { Rng } from './ghost-model';

/**
 * Pinning suite for the T21 sky-ghost maths (`ghost-model.ts`), fed plain
 * values — no DOM, no timers, no store.
 *
 * The four acceptance rows of the task:
 *
 *   1. **drift + parallax wrap** — `ghostScreenX` reproduces the prototype's
 *      `((baseX + sin(t*.18+phase)*60) − worldX*.55) mod 2400 − 200` and never
 *      leaves the scrolled strip;
 *   2. **cameo cadence** — bounded gaps, and the first delay;
 *   3. **cameo only on a visible can** — an in-window screen-x and the `k%4===1`
 *      gate; a due tick over an empty window shows nothing and still re-arms;
 *   4. **hop once per show** — `decideHop` hops for a new token, never for a
 *      repeated one.
 */

/** An injected rng that walks a scripted list (holding the last value). */
function seq(values: number[]): Rng {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

/** The far edge of a cameo's exclusive span, for the upper bound assertion. */
const CAMEO_MAX_MS = CAMEO_MIN_MS + 20000;

describe('sky ghosts — anchors, bottoms, phases', () => {
	it('hosts three ghosts (spec §4.4: 2–3) at the prototype anchors', () => {
		expect(GHOST_COUNT).toBe(3);
		expect(ghostBaseX(0)).toBe(180);
		expect(ghostBaseX(1)).toBe(780);
		expect(ghostBaseX(2)).toBe(1350);
	});

	it('bottoms step up by 18 px, prototype verbatim (240 + i*18)', () => {
		expect(ghostBottom(0)).toBe(GHOST_BOTTOM_BASE);
		expect(ghostBottom(0)).toBe(240);
		expect(ghostBottom(1)).toBe(258);
		expect(ghostBottom(2)).toBe(276);
		expect(ghostBottom(2) - ghostBottom(1)).toBe(GHOST_BOTTOM_STEP);
	});

	it('phases fan the three apart on one another (i * 2.1)', () => {
		expect(ghostPhase(0)).toBe(0);
		expect(ghostPhase(1)).toBe(GHOST_DRIFT_PHASE_STEP);
		expect(ghostPhase(2)).toBeCloseTo(4.2, 6);
	});

	it('wraps any integer index into 0..2 (a caller may pass 3 or −1)', () => {
		expect(ghostBaseX(3)).toBe(180);
		expect(ghostBottom(3)).toBe(240);
		expect(ghostPhase(3)).toBe(0);
		expect(ghostBaseX(-1)).toBe(1350);
		expect(ghostBottom(-1)).toBe(276);
	});
});

describe('sky ghosts — drift + parallax wrap', () => {
	it('at t=0 pins the prototype: baseX − worldX*.55, wrapped, −200', () => {
		// ghost 0 has phase 0, so sin(0)=0: the anchor alone, no drift.
		expect(ghostScreenX(0, 0, 0)).toBe(180 - GHOST_WRAP_OFFSET); // −20
		expect(GHOST_WRAP_OFFSET).toBe(200);
		expect(ghostScreenX(0, 0, 1000)).toBeCloseTo(1830, 6);
		// 180 − 2400*.55 = −1140 → +2400 = 1260 → −200 = 1060.
		expect(ghostScreenX(0, 0, GHOST_WRAP)).toBeCloseTo(1060, 6);
		// Walking back: 180 + 550 = 730 → 530.
		expect(ghostScreenX(0, 0, -1000)).toBeCloseTo(530, 6);
	});

	it('peaks at +60 px of drift when the sine crests (t*.18 = π/2)', () => {
		const crest = Math.PI / 2 / GHOST_DRIFT_RATE;
		expect(ghostScreenX(0, crest, 0)).toBeCloseTo(
			180 + GHOST_DRIFT_AMPLITUDE - GHOST_WRAP_OFFSET,
			6
		);
		expect(GHOST_DRIFT_AMPLITUDE).toBe(60);
	});

	it('carries ghost 1 at its own phase (sin(2.1)*60 ≈ 51.79)', () => {
		expect(ghostScreenX(1, 0, 0)).toBeCloseTo(780 + 51.792562 - 200, 2);
	});

	it('never leaves the [−200, 2200) scrolled strip over a long walk', () => {
		for (let t = 0; t < 40; t += 0.37) {
			for (let wx = -5000; wx <= 5000; wx += 613) {
				for (let i = 0; i < GHOST_COUNT; i++) {
					const x = ghostScreenX(i, t, wx);
					expect(x).toBeGreaterThanOrEqual(-GHOST_WRAP_OFFSET);
					expect(x).toBeLessThan(GHOST_WRAP - GHOST_WRAP_OFFSET);
				}
			}
		}
	});

	it('keeps the prototype constants pinned (a drift-tune touches one line)', () => {
		expect(GHOST_DRIFT_RATE).toBe(0.18);
		expect(GHOST_PARALLAX).toBe(0.55);
		expect(GHOST_WRAP).toBe(2400);
		expect(GHOST_HOP_MS).toBe(900);
	});
});

describe('cameo — cans, anchor and window', () => {
	it('gates a can on k % 4 === 1, negatives wrapped', () => {
		expect([1, 5, 9, 13].map(hasCameoCan)).toEqual([true, true, true, true]);
		expect([0, 2, 3, 4, 6, 7].map(hasCameoCan)).toEqual([false, false, false, false, false, false]);
		expect(hasCameoCan(-3)).toBe(true); // ((−3%4)+4)%4 = 1
		expect(hasCameoCan(-4)).toBe(false);
	});

	it('anchors the can at the yard offset inside the slot', () => {
		expect(canScreenX(1, 0)).toBe(SPACING + 168);
		expect(canScreenX(5, 2000)).toBe(5 * SPACING + 168 - 2000);
	});

	it('returns only in-window, in-view can-houses', () => {
		expect(visibleCameoKs(0)).toEqual([1]); // k0=0 → window 0..2 → can k=1, x=788
		expect(visibleCameoKs(700)).toEqual([1]); // x = 788−700 = 88
		expect(visibleCameoKs(2500)).toEqual([5]); // k=5 → x = 3268−2500 = 768
	});

	it('drops a can that is off screen either side', () => {
		// On screen when it is between the prototype's −60 and 900 band…
		expect(canScreenX(1, 0)).toBeGreaterThanOrEqual(CAMEO_VISIBLE_X0);
		expect(canScreenX(1, 0)).toBeLessThanOrEqual(CAMEO_VISIBLE_X1);
		// …and filtered out past either edge.
		expect(visibleCameoKs(2000)).toEqual([]); // can k=5 at x=1268 > 900
		expect(visibleCameoKs(-400)).toEqual([]); // can k=1 at x=1188 > 900
	});
});

describe('cameo — cadence bounds', () => {
	it('the first cameo waits the prototype 30 s', () => {
		expect(CAMEO_FIRST_MS).toBe(30000);
	});

	it('re-arms into [now + 32 s, now + 52 s)', () => {
		expect(nextCameoAt(1000, () => 0)).toBe(1000 + CAMEO_MIN_MS);
		expect(nextCameoAt(1000, () => 0)).toBe(33000);

		const high = nextCameoAt(1000, () => 0.999999);
		expect(high).toBeGreaterThanOrEqual(1000 + CAMEO_MIN_MS);
		expect(high).toBeLessThan(1000 + CAMEO_MAX_MS);

		for (let r = 0; r < 1; r += 0.037) {
			const at = nextCameoAt(0, () => r);
			expect(at).toBeGreaterThanOrEqual(CAMEO_MIN_MS);
			expect(at).toBeLessThan(CAMEO_MAX_MS);
		}
	});
});

describe('cameo — the scheduler', () => {
	it('does nothing before `nextAt` and leaves the clock alone', () => {
		const d = cameoTick(1000, 5000, 0, () => 0);
		expect(d).toEqual({ nextAt: 5000, cameo: null });
	});

	it('reveals a can at its screen x once due, and re-arms', () => {
		// rng[0] re-arms (0 → +32 s), rng[1] picks the only can.
		const d = cameoTick(5000, 5000, 0, seq([0, 0]));
		expect(d.cameo).toEqual({ k: 1, x: 788 });
		expect(d.nextAt).toBe(37000);
	});

	it('shows nothing when no can is on screen, but still re-arms (no burst)', () => {
		const d = cameoTick(5000, 5000, 2000, seq([0]));
		expect(d.cameo).toBeNull();
		expect(d.nextAt).toBe(37000);
	});

	it('is one at a time: a due tick under an active cameo is swallowed', () => {
		const d = cameoTick(5000, 5000, 0, seq([0, 0]), true);
		expect(d.cameo).toBeNull();
		expect(d.nextAt).toBe(37000);
	});

	it('a walk over a minute fires no faster than the cadence floor', () => {
		let now = 0;
		let nextAt = CAMEO_FIRST_MS;
		let lastCameo = -Infinity;
		let fired = 0;

		// 5 sandy minutes in 500 ms steps, standing in front of house 1 (a can).
		const worldX = SPACING; // k0 = 1 → can k=1 at x=168, in view
		for (; now <= 300000; now += 500) {
			const d = cameoTick(now, nextAt, worldX, () => 0.5);
			nextAt = d.nextAt;
			if (d.cameo) {
				fired += 1;
				expect(now - lastCameo).toBeGreaterThanOrEqual(CAMEO_MIN_MS);
				lastCameo = now;
			}
		}
		// ~32 s apart over 300 s ⇒ a handful, never none and never a storm.
		expect(fired).toBeGreaterThan(5);
		expect(fired).toBeLessThan(12);
	});

	it('keeps the cameo lifetimes pinned (rise 2.2 s, retract 0.45 s)', () => {
		expect(CAMEO_RISE_MS).toBe(2200);
		expect(CAMEO_RETRACT_MS).toBe(450);
	});
});

describe('hop — once per show', () => {
	it('hops for a show it has not seen, and remembers it', () => {
		expect(decideHop(null, 1)).toEqual({ hop: true, memory: 1 });
	});

	it('never hops twice for the same show', () => {
		expect(decideHop(1, 1)).toEqual({ hop: false, memory: 1 });
	});

	it('hops again for the next show', () => {
		expect(decideHop(1, 2)).toEqual({ hop: true, memory: 2 });
	});

	it('mints successive show tokens (null → 1, then +1)', () => {
		expect(nextShowToken(null)).toBe(1);
		expect(nextShowToken(1)).toBe(2);
		expect(nextShowToken(7)).toBe(8);
	});

	it('a token-less caller (the component) hops on every fresh mint', () => {
		let memory: number | null = null;
		for (let show = 0; show < 3; show++) {
			const d = decideHop(memory, nextShowToken(memory));
			expect(d.hop).toBe(true);
			memory = d.memory;
		}
		expect(memory).toBe(3);
	});

	it('a night of shows hops exactly once each, replays never', () => {
		let memory: number | null = null;
		let hops = 0;
		const climax = (token: number): void => {
			const d = decideHop(memory, token);
			memory = d.memory;
			if (d.hop) hops += 1;
		};

		for (let show = 1; show <= 5; show++) climax(show);
		expect(hops).toBe(5);

		// Two climaxes replayed for the same show must not hop again.
		climax(5);
		climax(5);
		expect(hops).toBe(5);

		// The next real show still hops.
		climax(6);
		expect(hops).toBe(6);
	});
});
