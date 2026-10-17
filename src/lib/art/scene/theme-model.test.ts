import { describe, expect, it } from 'vitest';
import { SPACING } from '$lib/sim/loop';
import { HOMES_PER_NEIGHBORHOOD, THEMES, neighborhoodIndex, themeFor } from '$lib/sim/progression';
import type { Theme } from '$lib/sim/progression';
import {
	DECOR_KINDS,
	DECOR_THEMES,
	DECOR_WINDOW,
	HAY_PER_HOUSE,
	LEAF_COUNT,
	MAX_NODES_PER_WINDOW,
	MIST_EVERY,
	NODES_PER_WINDOW,
	PUMPKIN_COUNT,
	SHIMMER_COUNT,
	SHOOT_DUR_MS,
	SHOOT_FIRST_MS,
	SHOOT_FROM_X,
	SHOOT_FROM_Y,
	SHOOT_MIN_MS,
	SHOOT_SPAN_MS,
	SHOOT_TO_X,
	SHOOT_TO_Y,
	SKY_KINDS,
	STAGE_H,
	STAGE_W,
	TONE_RAMPS,
	WISP_COUNT,
	decorPicks,
	decorRng,
	decorScreenX,
	decorSeed,
	decorSlots,
	decorTone,
	firstDecorK,
	firstShootAt,
	isSkyKind,
	nextShootAt,
	shootGap,
	shootProgress,
	shootTick,
	shootX,
	shootY,
	themeAt
} from './theme-model';
import type { DecorKind, DecorSlot, Rng } from './theme-model';

/**
 * Pinning suite for the T22 neighborhood-theming maths (`theme-model.ts`), fed
 * plain values — no DOM, no timers, no store.
 *
 * The acceptance rows, and where each is pinned:
 *
 * | # | acceptance | spec | pinned by |
 * |---|---|---|---|
 * | 1 | determinism per `(theme, k)` | T22 "deterministic, windowed decor picks" | `determinism — (theme, k)` |
 * | 2 | window bounds + recycling | T22 "recycling like the other layers" | `window — bounds and recycling` |
 * | 3 | ≤ 30 extra nodes per window | T22 node budget | `window — node budget` |
 * | 4 | the four themes are visibly distinct | spec §4.2 | `per-theme picks` |
 * | 5 | theme mapping `themeFor(neighborhoodIndex(furthest))` | spec §4.2/§9 | `themeAt — furthest house → theme` |
 * | 6 | shooting star ≥ 40 s, one at a time | T22 "RARE shooting star" | `shooting star — cadence bounds / no overlap` |
 * | 7 | pure decor (§3 tokens only, never refusal-correlated) | spec §4.4 | `palette + placement discipline` |
 */

/** An injected rng that walks a scripted list (holding the last value). */
function seq(values: number[]): Rng {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

/** The structural half of a slot — everything that must survive recycling. */
function structure(slot: DecorSlot) {
	return {
		kind: slot.kind,
		off: slot.off,
		y: slot.y,
		w: slot.w,
		h: slot.h,
		tone: slot.tone,
		delay: slot.delay,
		i: slot.i
	};
}

/** The kinds a theme uses, over a window — the "visibly distinct" fingerprint. */
function kindsOf(theme: Theme, worldX: number): Set<DecorKind> {
	return new Set(decorSlots(theme, worldX).map((s) => s.kind));
}

/** A spread of scroll positions, including both edges of a slot and negatives. */
const WALKS = [-5000, -620, -1, 0, 1, 309, 619, 620, 621, 1240, 5000, 50000];

/** The far edge of the shooting-star gap span, for the upper-bound assertion. */
const SHOOT_MAX_MS = SHOOT_MIN_MS + SHOOT_SPAN_MS;

describe('themeAt — furthest house → theme', () => {
	it('is exactly themeFor(neighborhoodIndex(furthest))', () => {
		for (let k = 0; k <= 60; k++) {
			expect(themeAt(k)).toBe(themeFor(neighborhoodIndex(k)));
		}
	});

	it.each([
		// [furthestK, theme] — one 10-home neighborhood per theme, then it cycles.
		[0, 'leafy'],
		[9, 'leafy'],
		[10, 'foggy'],
		[19, 'foggy'],
		[20, 'pumpkin'],
		[29, 'pumpkin'],
		[30, 'starry'],
		[39, 'starry'],
		[40, 'leafy'],
		[70, 'starry'],
		[80, 'leafy']
	])('furthest house %d is %s', (furthestK, theme) => {
		expect(themeAt(furthestK)).toBe(theme);
	});

	it('covers the four themes in the spec §4.2 order over 4 neighborhoods', () => {
		const seen = Array.from({ length: 4 }, (_, i) => themeAt(i * HOMES_PER_NEIGHBORHOOD));
		expect(seen).toEqual([...THEMES]);
	});

	it('clamps a negative (nonsense) progress to the first neighborhood', () => {
		expect(themeAt(-1)).toBe('leafy');
		expect(themeAt(-619)).toBe('leafy');
	});

	it('knows exactly the four themes progression rotates', () => {
		expect(DECOR_THEMES).toEqual([...THEMES]);
	});
});

describe('determinism — (theme, k)', () => {
	it.each(DECOR_THEMES)('%s: decorPicks(k) is identical on every call', (theme) => {
		for (let k = -3; k <= 30; k++) {
			expect(decorPicks(theme, k)).toEqual(decorPicks(theme, k));
		}
	});

	it.each(DECOR_THEMES)('%s: the seeded rng is the default source', (theme) => {
		for (let k = 0; k <= 20; k++) {
			expect(decorPicks(theme, k)).toEqual(decorPicks(theme, k, decorRng(theme, k)));
		}
	});

	it('seeds two different houses to different streams', () => {
		// The seed hashes the theme *and* the house: no two colliding on small k.
		const seeds = new Set<number>();
		for (const theme of DECOR_THEMES) {
			for (let k = 0; k <= 40; k++) seeds.add(decorSeed(theme, k));
		}
		expect(seeds.size).toBe(DECOR_THEMES.length * 41);
		// A house's stream is stable and independent of the other themes' seeds.
		expect(decorSeed('leafy', 3)).toBe(decorSeed('leafy', 3));
		expect(decorSeed('leafy', 3)).not.toBe(decorSeed('leafy', 4));
		expect(decorSeed('leafy', 3)).not.toBe(decorSeed('foggy', 3));
	});

	it('nothing depends on worldX: a house re-entering looks the same', () => {
		for (const theme of DECOR_THEMES) {
			// House 2 is in the window at worldX 0 (k0 = -1) and at worldX 1240 (k0 = 1).
			const a = decorSlots(theme, 0).find((s) => s.k === 2);
			const b = decorSlots(theme, 2 * SPACING).find((s) => s.k === 2);
			expect(a).toBeDefined();
			expect(b).toBeDefined();
			expect(structure(b as DecorSlot)).toEqual(structure(a as DecorSlot));
		}
	});

	it('clamps a hostile rng into the documented ranges', () => {
		// rng() > 1 and rng() < 0 must never escape a band (the model clamps).
		const hostile = seq([2, -1, 1.5, -3, 0.5]);
		for (const theme of DECOR_THEMES) {
			for (const pick of decorPicks(theme, 7, hostile)) {
				expect(pick.off).toBeGreaterThanOrEqual(0);
				expect(pick.off).toBeLessThanOrEqual(SPACING);
				expect(pick.y).toBeGreaterThanOrEqual(0);
				expect(pick.y).toBeLessThan(STAGE_H);
				expect(pick.w).toBeGreaterThan(0);
				expect(pick.h).toBeGreaterThan(0);
				expect(pick.tone).toBeGreaterThanOrEqual(0);
				expect(pick.tone).toBeLessThan(TONE_RAMPS[pick.kind].length);
				expect(Number.isFinite(pick.delay)).toBe(true);
			}
		}
	});
});

describe('window — bounds and recycling', () => {
	it('starts at floor(worldX / SPACING) - 1, like the street and the cars', () => {
		expect(firstDecorK(0)).toBe(-1);
		expect(firstDecorK(1)).toBe(-1);
		expect(firstDecorK(619)).toBe(-1);
		expect(firstDecorK(620)).toBe(0);
		expect(firstDecorK(1240)).toBe(1);
		expect(firstDecorK(-620)).toBe(-2);
	});

	it.each(DECOR_THEMES)('%s: the window is DECOR_WINDOW consecutive houses', (theme) => {
		for (const worldX of WALKS) {
			const slots = decorSlots(theme, worldX);
			const ks = [...new Set(slots.map((s) => s.k))];
			expect(ks.length).toBe(DECOR_WINDOW);
			expect(ks[0]).toBe(firstDecorK(worldX));
			expect(ks).toEqual(Array.from({ length: DECOR_WINDOW }, (_, i) => firstDecorK(worldX) + i));
			// Ascending k, then pick order — one flat list, stable for the renderer.
			const sorted = [...slots].sort((a, b) => a.k - b.k || a.i - b.i);
			expect(slots).toEqual(sorted);
		}
	});

	it.each(DECOR_THEMES)('%s: the window always covers the stage', (theme) => {
		for (const worldX of WALKS) {
			const xs = decorSlots(theme, worldX).map((s) => decorScreenX(s, worldX));
			expect(Math.min(...xs)).toBeLessThan(0);
			expect(Math.max(...xs)).toBeGreaterThan(STAGE_W);
		}
	});

	it.each(DECOR_THEMES)('%s: no node strays outside the two-slot slack', (theme) => {
		for (const worldX of WALKS) {
			for (const slot of decorSlots(theme, worldX)) {
				const x = decorScreenX(slot, worldX);
				expect(x).toBeGreaterThanOrEqual(-2 * SPACING);
				expect(x).toBeLessThanOrEqual(4 * SPACING);
			}
		}
	});

	it.each(DECOR_THEMES)('%s: a slot rides the street 1:1 (no parallax factor)', (theme) => {
		const a = decorSlots(theme, 0).find((s) => s.k === 2) as DecorSlot;
		const b = decorSlots(theme, 2 * SPACING).find((s) => s.k === 2) as DecorSlot;
		expect(decorScreenX(a, 0) - decorScreenX(b, 2 * SPACING)).toBe(2 * SPACING);
	});

	it.each(DECOR_THEMES)('%s: walking forever recycles, never accumulates', (theme) => {
		// 200 houses of walking, one frame per 2 px: the node count is pinned to
		// the window at every step and the distinct house count never shrinks.
		let maxNodes = 0;
		for (let worldX = 0; worldX <= 200 * SPACING; worldX += 124) {
			const slots = decorSlots(theme, worldX);
			maxNodes = Math.max(maxNodes, slots.length);
			expect(slots.length).toBe(NODES_PER_WINDOW[theme]);
			expect(new Set(slots.map((s) => `${s.k}:${s.i}`)).size).toBe(slots.length);
		}
		expect(maxNodes).toBe(NODES_PER_WINDOW[theme]);
	});
});

describe('window — node budget', () => {
	it('pins each theme at or under MAX_NODES_PER_WINDOW', () => {
		expect(MAX_NODES_PER_WINDOW).toBe(30);
		for (const theme of DECOR_THEMES) {
			expect(NODES_PER_WINDOW[theme]).toBeLessThanOrEqual(MAX_NODES_PER_WINDOW);
		}
		expect(NODES_PER_WINDOW).toEqual({
			leafy: 25,
			foggy: 11,
			pumpkin: 20,
			starry: 20
		});
	});

	it.each(DECOR_THEMES)('%s: the live list matches the pinned count', (theme) => {
		for (const worldX of WALKS) {
			expect(decorSlots(theme, worldX).length).toBe(NODES_PER_WINDOW[theme]);
		}
	});

	it('foggy spends one node of the window on a single mist band', () => {
		expect(NODES_PER_WINDOW.foggy).toBe(WISP_COUNT * DECOR_WINDOW + 1);
		for (const worldX of WALKS) {
			const mist = decorSlots('foggy', worldX).filter((s) => s.kind === 'mist');
			expect(mist.length).toBe(1);
			// Positive modulo: a window edge can hold the mist on the `k = -5` house.
			expect(((mist[0].k % MIST_EVERY) + MIST_EVERY) % MIST_EVERY).toBe(0);
		}
	});
});

describe('per-theme picks', () => {
	/** What each theme is allowed to draw — the spec §4.2 "light reskin" table. */
	const FINGERPRINTS: Record<Theme, DecorKind[]> = {
		leafy: ['leaf'],
		foggy: ['wisp', 'mist'],
		pumpkin: ['pumpkin', 'hay'],
		starry: ['shimmer']
	};

	it.each(DECOR_THEMES)('%s draws only its own kinds', (theme) => {
		expect([...kindsOf(theme, 0)].sort()).toEqual([...FINGERPRINTS[theme]].sort());
	});

	it('the four themes are pairwise disjoint (a visible reskin, not a tint)', () => {
		const sets = DECOR_THEMES.map((t) => [...kindsOf(t, 0)] as DecorKind[]);
		for (let i = 0; i < sets.length; i++) {
			for (let j = i + 1; j < sets.length; j++) {
				expect(sets[i].filter((k) => sets[j].includes(k))).toEqual([]);
			}
		}
		expect(
			DECOR_THEMES.map((t) => FINGERPRINTS[t])
				.flat()
				.sort()
		).toEqual([...DECOR_KINDS].sort());
	});

	it('pins the per-house counts', () => {
		const leaf = decorPicks('leafy', 4).filter((p) => p.kind === 'leaf').length;
		expect(leaf).toBe(LEAF_COUNT);
		expect(decorPicks('foggy', 4).filter((p) => p.kind === 'wisp').length).toBe(WISP_COUNT);
		expect(decorPicks('pumpkin', 4).filter((p) => p.kind === 'pumpkin').length).toBe(PUMPKIN_COUNT);
		expect(decorPicks('pumpkin', 4).filter((p) => p.kind === 'hay').length).toBe(HAY_PER_HOUSE);
		expect(decorPicks('starry', 4).filter((p) => p.kind === 'shimmer').length).toBe(SHIMMER_COUNT);
	});

	it('alternates the hay tuft between the two yard edges', () => {
		const even = decorPicks('pumpkin', 4).find((p) => p.kind === 'hay');
		const odd = decorPicks('pumpkin', 5).find((p) => p.kind === 'hay');
		expect(even?.off).toBeGreaterThan(SPACING / 2);
		expect(odd?.off).toBeLessThan(SPACING / 2);
	});

	it('keeps a hay tuft on screen at every scroll position', () => {
		// The window shows slot `m`'s right half and slot `m+1`'s left half: the
		// right-edge/left-edge parity is what puts one tuft of the pair in view.
		for (const worldX of WALKS) {
			const visible = decorSlots('pumpkin', worldX).filter((s) => {
				if (s.kind !== 'hay') return false;
				const x = decorScreenX(s, worldX);
				return x > -20 && x < STAGE_W + 20;
			});
			expect(visible.length).toBeGreaterThanOrEqual(1);
		}
	});

	it('each theme is a different kind set at every window, not just at 0', () => {
		for (const worldX of WALKS) {
			for (let i = 0; i < DECOR_THEMES.length; i++) {
				for (let j = i + 1; j < DECOR_THEMES.length; j++) {
					const a = kindsOf(DECOR_THEMES[i], worldX);
					const b = kindsOf(DECOR_THEMES[j], worldX);
					expect([...a].filter((k) => b.has(k))).toEqual([]);
				}
			}
		}
	});
});

describe('palette + placement discipline', () => {
	it('every tone is a §3 token reference', () => {
		for (const kind of DECOR_KINDS) {
			for (const token of TONE_RAMPS[kind]) {
				expect(token).toMatch(/^var\(--[a-z0-9-]+\)$/);
			}
		}
	});

	it.each(DECOR_THEMES)('%s: every pick resolves to a token from its own ramp', (theme) => {
		for (const slot of decorSlots(theme, 1234)) {
			expect(TONE_RAMPS[slot.kind]).toContain(decorTone(slot));
		}
	});

	it('wraps a hostile tone index into the ramp instead of undefined', () => {
		for (const kind of DECOR_KINDS) {
			const ramp = TONE_RAMPS[kind];
			const pick = { ...decorPicks('leafy', 0)[0], kind, tone: -1 };
			expect(decorTone(pick)).toBe(ramp[ramp.length - 1]);
			expect(decorTone({ ...pick, tone: ramp.length })).toBe(ramp[0]);
		}
	});

	it('keeps ground decor out of the house box (houses end at y 272)', () => {
		for (const theme of DECOR_THEMES) {
			for (const slot of decorSlots(theme, 700)) {
				if (slot.kind === 'wisp' || slot.kind === 'shimmer') continue;
				expect(slot.y).toBeGreaterThanOrEqual(272);
			}
		}
	});

	it('keeps sky decor above the roofline (wisp + shimmer stay high)', () => {
		for (const theme of DECOR_THEMES) {
			for (const slot of decorSlots(theme, 700)) {
				if (slot.kind !== 'wisp' && slot.kind !== 'shimmer') continue;
				expect(slot.y).toBeLessThan(272);
			}
		}
	});

	it('the mist band is wide and thin (a band, not a blob)', () => {
		const mist = decorSlots('foggy', 0).find((s) => s.kind === 'mist') as DecorSlot;
		expect(mist.w).toBeGreaterThan(400);
		expect(mist.h).toBeLessThan(40);
		expect(mist.w / mist.h).toBeGreaterThan(10);
	});

	it('splits every kind into exactly one render tier (sky vs ground)', () => {
		const isSky = (kind: DecorKind): boolean => ['wisp', 'mist', 'shimmer'].includes(kind);
		for (const kind of DECOR_KINDS) {
			expect(isSkyKind(kind)).toBe(isSky(kind));
		}
		expect([...SKY_KINDS].sort()).toEqual(['mist', 'shimmer', 'wisp']);
		// The two tiers together are the whole catalogue — no kind is orphaned.
		expect(DECOR_KINDS.filter((k) => !isSkyKind(k)).length + SKY_KINDS.length).toBe(
			DECOR_KINDS.length
		);
		// …and the split holds at a real window. Today every theme is single-tier
		// (foggy/starry sky, leafy/pumpkin ground), so the two-tier container is a
		// structural seam the themes may grow into, not a mix in any one theme.
		for (const theme of DECOR_THEMES) {
			const sky = decorSlots(theme, 700).filter((s) => isSkyKind(s.kind)).length;
			const ground = decorSlots(theme, 700).length - sky;
			expect(sky + ground).toBe(NODES_PER_WINDOW[theme]);
			expect(sky === 0 || ground === 0).toBe(true);
		}
	});
});

describe('shooting star — scheduling', () => {
	it('pins the cadence floor at 40 s', () => {
		expect(SHOOT_MIN_MS).toBeGreaterThanOrEqual(40_000);
		expect(SHOOT_FIRST_MS).toBe(SHOOT_MIN_MS);
		expect(firstShootAt(1000)).toBe(1000 + SHOOT_FIRST_MS);
	});

	it('re-arms into [now + 40 s, now + 60 s)', () => {
		expect(nextShootAt(1000, () => 0)).toBe(1000 + SHOOT_MIN_MS);
		const high = nextShootAt(1000, () => 0.999999);
		expect(high).toBeGreaterThanOrEqual(1000 + SHOOT_MIN_MS);
		expect(high).toBeLessThan(1000 + SHOOT_MAX_MS);
		for (let r = 0; r < 1; r += 0.037) {
			const gap = shootGap(() => r);
			expect(gap).toBeGreaterThanOrEqual(SHOOT_MIN_MS);
			expect(gap).toBeLessThan(SHOOT_MAX_MS);
		}
	});

	it('a hostile rng cannot schedule a gap below the floor', () => {
		expect(shootGap(() => -5)).toBe(SHOOT_MIN_MS);
		expect(shootGap(() => 5)).toBe(SHOOT_MAX_MS);
	});

	it('does nothing before `nextAt` and leaves the clock alone', () => {
		expect(shootTick(1000, 5000, () => 0)).toEqual({ nextAt: 5000, shoot: false });
	});

	it('fires once due, and re-arms past the floor', () => {
		const d = shootTick(5000, 5000, () => 0);
		expect(d.shoot).toBe(true);
		expect(d.nextAt).toBe(5000 + SHOOT_MIN_MS);
	});

	it('is one at a time: a due tick under a live streak is swallowed', () => {
		const d = shootTick(5000, 5000, () => 0, true);
		expect(d.shoot).toBe(false);
		// …but it still re-arms, so it can never stack into a burst.
		expect(d.nextAt).toBe(5000 + SHOOT_MIN_MS);
	});
});

describe('shooting star — no overlap over a night', () => {
	it('never fires twice inside one gap, and never overlaps a live streak', () => {
		let now = 0;
		let nextAt = firstShootAt(0);
		let lastFire = -Infinity;
		let liveUntil = -Infinity;
		let fired = 0;

		// 20 sandy minutes, ticked every 250 ms with a mid-range rng (gap = 50 s).
		for (; now <= 20 * 60 * 1000; now += 250) {
			const d = shootTick(now, nextAt, () => 0.5, now < liveUntil);
			nextAt = d.nextAt;
			if (!d.shoot) continue;
			// The floor holds between two shots…
			expect(now - lastFire).toBeGreaterThanOrEqual(SHOOT_MIN_MS);
			// …and the sky is clear when the next one starts (no overlap).
			expect(now).toBeGreaterThanOrEqual(liveUntil);
			fired += 1;
			lastFire = now;
			liveUntil = now + SHOOT_DUR_MS;
		}

		// 20 minutes at a 50 s cadence ⇒ ~24 stars: never a storm, never none.
		expect(fired).toBeGreaterThan(20);
		expect(fired).toBeLessThan(26);
	});

	it('a due tick mid-streak never starts a second one, however often it asks', () => {
		let liveUntil = -Infinity;
		let starts = 0;
		// 40 consecutive due ticks, every one inside the first streak's 1.4 s:
		// the `active` flag swallows them all (the caller is told to re-arm, so
		// a burst can never even be scheduled).
		for (let tick = 0; tick < 40; tick++) {
			const now = tick * 10;
			const d = shootTick(now, 0, () => 0, now < liveUntil);
			expect(d.nextAt).toBeGreaterThanOrEqual(now + SHOOT_MIN_MS);
			if (!d.shoot) continue;
			starts += 1;
			liveUntil = now + SHOOT_DUR_MS;
		}
		expect(starts).toBe(1);
	});
});

describe('shooting star — the crossing', () => {
	it('pins the lifetime well inside the gap floor', () => {
		expect(SHOOT_DUR_MS).toBeGreaterThan(0);
		expect(SHOOT_DUR_MS).toBeLessThan(SHOOT_MIN_MS);
	});

	it('sweeps strictly left-to-right, off-screen on both ends', () => {
		expect(shootX(0)).toBe(SHOOT_FROM_X);
		expect(shootX(1)).toBe(SHOOT_TO_X);
		expect(SHOOT_FROM_X).toBeLessThan(0);
		expect(SHOOT_TO_X).toBeGreaterThan(STAGE_W);
		for (let t = 0; t < 1; t += 0.01) {
			expect(shootX(t + 0.01)).toBeGreaterThan(shootX(t));
		}
	});

	it('falls from the roofline to the horizon, clamped outside [0, 1]', () => {
		expect(shootY(0)).toBe(SHOOT_FROM_Y);
		expect(shootY(1)).toBe(SHOOT_TO_Y);
		expect(SHOOT_FROM_Y).toBeLessThan(SHOOT_TO_Y);
		expect(shootY(-1)).toBe(SHOOT_FROM_Y);
		expect(shootY(2)).toBe(SHOOT_TO_Y);
	});

	it('clamps progress, so a late frame parks the streak at its end', () => {
		expect(shootProgress(-50)).toBe(0);
		expect(shootProgress(0)).toBe(0);
		expect(shootProgress(SHOOT_DUR_MS / 2)).toBeCloseTo(0.5, 6);
		expect(shootProgress(SHOOT_DUR_MS)).toBe(1);
		expect(shootProgress(SHOOT_DUR_MS * 10)).toBe(1);
	});

	it('a full crossing stays inside the stage band the renderer uses', () => {
		for (let t = 0; t <= 1; t += 0.02) {
			expect(shootX(t)).toBeGreaterThanOrEqual(SHOOT_FROM_X);
			expect(shootX(t)).toBeLessThanOrEqual(SHOOT_TO_X);
			expect(shootY(t)).toBeGreaterThanOrEqual(SHOOT_FROM_Y);
			expect(shootY(t)).toBeLessThanOrEqual(SHOOT_TO_Y);
		}
	});
});
