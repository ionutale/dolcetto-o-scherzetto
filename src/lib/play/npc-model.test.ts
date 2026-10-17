import { describe, expect, it } from 'vitest';
import {
	NPC_KINDS,
	NPC_POOL,
	PLAYER_OFFSET,
	RECYCLE_LEFT_JITTER,
	RECYCLE_LEFT_MIN,
	RECYCLE_RIGHT_JITTER,
	RECYCLE_RIGHT_MIN,
	SHOUT_BUBBLE_MS,
	SHOUT_FIRST_MS,
	SHOUT_MIN_MS,
	SHOUT_SPAN_MS,
	SHOUT_VIEW_LEFT,
	SHOUT_VIEW_RIGHT,
	WRAP_LEFT,
	WRAP_RIGHT,
	advanceNpcs,
	createNpcs,
	isFar,
	isNear,
	pickShout,
	playerWorldX,
	screenXOf,
	shoutDelay,
	visibleNpcIndices
} from './npc-model';
import type { Npc } from './npc-model';

/**
 * Pinning suite for the T19 NPC model (`npc-model.ts`) — the four decisions the
 * prototype made inline in `initNpcs()` / `renderNpcs()` / `shoutTick()`
 * (`prototypes/scene-prototype.html` ~1241-1275, ~1547-1559):
 *
 *   1. the pool: five kids, `x = i*380 + rand*200`, alternating direction,
 *      `120 + rand*40` px/s;
 *   2. one tick: travel, a **wave once per approach** (latch set near, cleared
 *      only when far again), and **recycling** across the two screen bands;
 *   3. the shout: only an **on-screen** kid is ever picked, and the cadence is
 *      bounded (`26 s … 46 s`, first at `24 s`);
 *   4. a **long walk** never grows the pool and never lets a kid escape the
 *      recycle window — the model's half of Review Focus #3.
 *
 * Randomness is injected exactly as in `economy.test.ts`: a deterministic LCG
 * for sweeps, a scripted sequence for the boundaries. No DOM, no store, no
 * timers.
 */

/** A deterministic LCG; yields the same sequence in `[0, 1)` every run. */
function seededRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Feeds a scripted sequence; repeats the last value when spent, counting draws. */
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

/** One kid with a readable default, overridden per row. */
function kid(over: Partial<Npc> = {}): Npc {
	return { kind: 'npcGhost', x: 0, dir: 1, speed: 120, waved: false, ...over };
}

describe('createNpcs — the pool of five (prototype initNpcs)', () => {
	it('makes exactly five kids, one costume per NPC_KINDS entry, in order', () => {
		const pool = createNpcs(seededRng(1));
		expect(pool).toHaveLength(NPC_POOL);
		expect(pool.map((n) => n.kind)).toEqual([...NPC_KINDS]);
	});

	it('seeds x = i*380 + rand*200 and speed = 120 + rand*40, in that draw order', () => {
		// Two draws per kid, in the literal's order: x first, then speed.
		const rand = scriptRand([0, 0, 0.25, 0.5, 0.5, 1, 0.75, 0.5, 1, 1]);
		const pool = createNpcs(rand.rng);
		expect(pool.map((n) => n.x)).toEqual([0, 430, 860, 1290, 1720]);
		expect(pool.map((n) => n.speed)).toEqual([120, 140, 160, 140, 160]);
		// Exactly two draws per kid, no more.
		expect(rand.calls()).toBe(2 * NPC_POOL);
	});

	it('alternates the starting direction i%2 ? 1 : -1', () => {
		const pool = createNpcs(seededRng(2));
		expect(pool.map((n) => n.dir)).toEqual([-1, 1, -1, 1, -1]);
	});

	it('keeps every speed inside the 120–160 band and every kid unlatched', () => {
		const pool = createNpcs(seededRng(0xc0ffee));
		for (const n of pool) {
			expect(n.speed).toBeGreaterThanOrEqual(120);
			expect(n.speed).toBeLessThanOrEqual(160);
			expect(n.waved).toBe(false);
		}
	});
});

describe('near/far predicates and the player reference', () => {
	it('puts the duo at worldX + 310', () => {
		expect(playerWorldX(0)).toBe(PLAYER_OFFSET);
		expect(playerWorldX(620)).toBe(620 + PLAYER_OFFSET);
		expect(screenXOf(kid({ x: 900 }), 620)).toBe(280);
	});

	it('isNear is strictly inside 70 px of the duo (dist < 70)', () => {
		expect(isNear(kid({ x: playerWorldX(0) - 69 }), 0)).toBe(true);
		expect(isNear(kid({ x: playerWorldX(0) - 70 }), 0)).toBe(false);
		expect(isNear(kid({ x: playerWorldX(0) }), 0)).toBe(true);
		expect(isNear(kid({ x: playerWorldX(0) + 70 }), 0)).toBe(false);
	});

	it('isFar is strictly beyond 220 px of the duo (dist > 220)', () => {
		expect(isFar(kid({ x: playerWorldX(0) - 220 }), 0)).toBe(false);
		expect(isFar(kid({ x: playerWorldX(0) - 221 }), 0)).toBe(true);
		expect(isFar(kid({ x: playerWorldX(0) + 221 }), 0)).toBe(true);
	});
});

describe('advanceNpcs — travel', () => {
	it('moves each kid by dir*speed*dt', () => {
		const pool = [kid({ x: 1000, dir: 1, speed: 120 })];
		const out = advanceNpcs(pool, 0.5, 0, seededRng(1));
		expect(out.npcs[0].x).toBeCloseTo(1060, 10);
		expect(out.waves).toEqual([]);

		const back = advanceNpcs([kid({ x: 1000, dir: -1, speed: 150 })], 0.4, 0, seededRng(1));
		expect(back.npcs[0].x).toBeCloseTo(940, 10);
	});

	it('returns a fresh pool and never mutates the input', () => {
		const pool = [kid({ x: 500, dir: 1, speed: 120 })];
		const out = advanceNpcs(pool, 1, 0, seededRng(1));
		expect(out.npcs).not.toBe(pool);
		expect(out.npcs[0]).not.toBe(pool[0]);
		expect(pool[0].x).toBe(500);
		expect(out.npcs[0].x).toBe(620);
	});
});

describe('advanceNpcs — the wave, once per approach', () => {
	it('waves the frame a kid first comes near, then stays quiet while it is near', () => {
		// Fast kid crossing the duo at 310; dt * 600 px/s keeps the steps legible.
		const pool = [kid({ x: 300, dir: 1, speed: 600 })];
		let out = advanceNpcs(pool, 0.1, 0, seededRng(1)); // x 360, dist 50 → wave
		expect(out.waves).toEqual([0]);
		expect(out.npcs[0].waved).toBe(true);

		out = advanceNpcs(out.npcs, 0.05, 0, seededRng(1)); // x 390, dist 80 → quiet
		expect(out.waves).toEqual([]);
		expect(out.npcs[0].waved).toBe(true);

		out = advanceNpcs(out.npcs, 0.2, 0, seededRng(1)); // x 510, dist 200 → still latched
		expect(out.waves).toEqual([]);
		expect(out.npcs[0].waved).toBe(true);
	});

	it('clears the latch once far, so a new approach waves again', () => {
		const pool = [kid({ x: 300, dir: 1, speed: 600 })];
		let out = advanceNpcs(pool, 0.1, 0, seededRng(1)); // x 360 → wave
		expect(out.waves).toEqual([0]);

		out = advanceNpcs(out.npcs, 0.5, 0, seededRng(1)); // x 660, dist 350 → far, reset
		expect(out.npcs[0].waved).toBe(false);
		expect(out.waves).toEqual([]);

		// Turn around and come back into the band → the second wave.
		out = advanceNpcs([{ ...out.npcs[0], dir: -1 }], 0.55, 0, seededRng(1)); // x 330, dist 20
		expect(out.waves).toEqual([0]);
		expect(out.npcs[0].waved).toBe(true);
	});

	it('reports the right indices when several kids are near at once', () => {
		const pool = [
			kid({ x: 300, dir: 1, speed: 0 }), // near (dist 10)
			kid({ x: 1200, dir: 1, speed: 0 }), // far
			kid({ x: 250, dir: -1, speed: 0 }) // near (dist 60)
		];
		const out = advanceNpcs(pool, 0, 0, seededRng(1));
		expect(out.waves).toEqual([0, 2]);
	});
});

describe('advanceNpcs — recycling across the wrap bands', () => {
	it('recycles a kid dragged off the left edge to the right band, walking in', () => {
		const input = kid({ x: -500, dir: -1, speed: 0 });
		expect(screenXOf(input, 0)).toBeLessThan(WRAP_LEFT);
		const rand = scriptRand([0]);
		const out = advanceNpcs([input], 0, 0, rand.rng);
		// Target: worldX + 900 + rand*150 = 900; direction flipped to 1.
		expect(out.npcs[0].x).toBe(RECYCLE_RIGHT_MIN);
		expect(out.npcs[0].dir).toBe(1);
		expect(rand.calls()).toBe(1);

		const jittered = advanceNpcs([kid({ x: -500, dir: -1, speed: 0 })], 0, 0, scriptRand([1]).rng);
		expect(jittered.npcs[0].x).toBe(RECYCLE_RIGHT_MIN + RECYCLE_RIGHT_JITTER);
	});

	it('recycles a kid dragged off the right edge to the left band, walking back', () => {
		const input = kid({ x: 2000, dir: 1, speed: 0 });
		expect(screenXOf(input, 0)).toBeGreaterThan(WRAP_RIGHT);
		const rand = scriptRand([0.5]);
		const out = advanceNpcs([input], 0, 0, rand.rng);
		// Target: worldX - 220 - rand*100 = -270; direction flipped to -1.
		expect(out.npcs[0].x).toBe(-(RECYCLE_LEFT_MIN + 0.5 * RECYCLE_LEFT_JITTER));
		expect(out.npcs[0].dir).toBe(-1);
	});

	it('leaves a kid inside the window alone (and spends no rng draw)', () => {
		const rand = scriptRand([0.9]);
		const out = advanceNpcs([kid({ x: 500, speed: 0 })], 0, 0, rand.rng);
		expect(out.npcs[0].x).toBe(500);
		expect(out.npcs[0].dir).toBe(1);
		expect(rand.calls()).toBe(0);
	});

	it('carries the wrap across a scrolling world (bands are screen-relative)', () => {
		// worldX = 5000, kid at 4500 → screenX = -500 → recycle to worldX + 900.
		const out = advanceNpcs([kid({ x: 4500, dir: -1, speed: 0 })], 0, 5000, scriptRand([0]).rng);
		expect(out.npcs[0].x).toBe(5000 + RECYCLE_RIGHT_MIN);
	});
});

describe('visibleNpcIndices — the shout "on screen" filter', () => {
	it('keeps only 60 < screenX < 760', () => {
		const pool = [
			kid({ x: -340 }), // i0 too left
			kid({ x: SHOUT_VIEW_LEFT }), // i1 boundary excluded
			kid({ x: SHOUT_VIEW_LEFT + 1 }), // i2 in
			kid({ x: 300 }), // i3 in
			kid({ x: SHOUT_VIEW_RIGHT - 1 }), // i4 in
			kid({ x: SHOUT_VIEW_RIGHT }), // i5 boundary excluded
			kid({ x: WRAP_RIGHT }) // i6 too right
		];
		expect(visibleNpcIndices(pool, 0)).toEqual([2, 3, 4]);
	});

	it('is empty when nobody is in the frame', () => {
		expect(visibleNpcIndices([kid({ x: -100 }), kid({ x: 1400 })], 0)).toEqual([]);
	});
});

describe('pickShout — only an on-screen kid ever shouts', () => {
	it('returns null and spends no draw when nobody is visible', () => {
		const rand = scriptRand([0.5]);
		expect(pickShout([kid({ x: -100 }), kid({ x: 1400 })], 0, rand.rng)).toBeNull();
		expect(rand.calls()).toBe(0);
	});

	it('indexes the visible list with floor(rand*len)', () => {
		const pool = [kid({ x: -100 }), kid({ x: 300 }), kid({ x: 1400 }), kid({ x: 400 })];
		// visible = [1, 3]
		expect(pickShout(pool, 0, scriptRand([0]).rng)).toBe(1);
		expect(pickShout(pool, 0, scriptRand([0.6]).rng)).toBe(3);
		expect(pickShout(pool, 0, scriptRand([0.999]).rng)).toBe(3);
	});

	it('always picks an on-screen kid across a seeded sweep', () => {
		const rng = seededRng(0x5eed);
		for (let i = 0; i < 500; i++) {
			const pool = createNpcs(rng);
			const worldX = rng() * 4000;
			const at = pickShout(pool, worldX, rng);
			if (at === null) {
				expect(visibleNpcIndices(pool, worldX)).toEqual([]);
				continue;
			}
			const sx = screenXOf(pool[at], worldX);
			expect(sx).toBeGreaterThan(SHOUT_VIEW_LEFT);
			expect(sx).toBeLessThan(SHOUT_VIEW_RIGHT);
		}
	});
});

describe('shoutDelay — the bounded shout cadence', () => {
	it('spans 26 s … 46 s, unlike the 24 s first shout', () => {
		expect(SHOUT_FIRST_MS).toBe(24000);
		expect(shoutDelay(() => 0)).toBe(SHOUT_MIN_MS);
		expect(shoutDelay(() => 1)).toBe(SHOUT_MIN_MS + SHOUT_SPAN_MS);
		expect(shoutDelay(() => 0.5)).toBe(36000);
	});

	it('every gap is at least ~25 s across a seeded sweep', () => {
		const rng = seededRng(0xabba);
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < 500; i++) {
			const d = shoutDelay(rng);
			min = Math.min(min, d);
			max = Math.max(max, d);
			expect(d).toBeGreaterThanOrEqual(25000);
			expect(d).toBeLessThan(SHOUT_MIN_MS + SHOUT_SPAN_MS);
		}
		// The sweep actually reaches both ends of the band.
		expect(min).toBeLessThan(SHOUT_MIN_MS + 1000);
		expect(max).toBeGreaterThan(SHOUT_MIN_MS + SHOUT_SPAN_MS - 1000);
	});

	it('keeps the shout bubble at 1200 ms (the prototype value)', () => {
		expect(SHOUT_BUBBLE_MS).toBe(1200);
	});
});

describe('long walk — bounded pool, bounded window (Review Focus #3)', () => {
	it('runs 60 s of walking with exactly five kids, all inside the wrap bands', () => {
		let pool = createNpcs(seededRng(0x1234));
		const rng = seededRng(0x5678);
		const dt = 1 / 60;
		const walk = 190 * dt; // spec SPEED 190 px/s, the player walking right
		let worldX = 0;
		let violations = 0;
		let waves = 0;

		for (let step = 0; step < 60 * 60; step++) {
			worldX += walk;
			const out = advanceNpcs(pool, dt, worldX, rng);
			pool = out.npcs;
			waves += out.waves.length;
			expect(pool.length).toBe(NPC_POOL);
			for (const n of pool) {
				const sx = screenXOf(n, worldX);
				if (sx < WRAP_LEFT || sx > WRAP_RIGHT) violations++;
			}
		}

		expect(violations).toBe(0);
		expect(pool.map((n) => n.kind).sort()).toEqual([...NPC_KINDS].sort());
		// The player overtakes the right-walkers and meets the left-walkers:
		// a 60 s walk always produces waves.
		expect(waves).toBeGreaterThan(0);
	});
});
