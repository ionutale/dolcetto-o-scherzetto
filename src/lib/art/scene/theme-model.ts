/**
 * T22 — the neighborhood theming pass (spec §4.2/§9, plan T22): the per-theme
 * ambient decor, lifted out of the render path so the picks, the recycling
 * window and the shooting-star cadence can be pinned without a DOM, a browser
 * clock or a random source.
 *
 * Spec §4.2 is the contract: *"Every ~10 homes the street becomes a new
 * neighborhood with a mini-theme (light reskin, same rules): Leafy Lane →
 * Foggy Bridge → Pumpkin Patch → Starry Alley, cycling forever with a growing
 * global index."* The theme itself is **not** decided here — `progression.ts`
 * owns the rotation (`THEMES` / `neighborhoodIndex` / `themeFor`), and
 * `themeAt(furthestK)` below is the one-line composition of them, exactly the
 * mapping the acceptance asks for (`themeFor(neighborhoodIndex(furthest))`).
 *
 * ## What T22 adds per theme (the "light reskin")
 *
 * | theme | decor | per window |
 * |---|---|---|
 * | `leafy` | drifting leaves on the walk/road band | 5 × 5 = **25** |
 * | `foggy` | extra fog wisps + one faint mist band | 2 × 5 + 1 = **11** |
 * | `pumpkin` | pumpkin clusters + a hay tuft at a yard edge | 3 × 5 + 1 × 5 = **20** |
 * | `starry` | a brighter star shimmer pass | 4 × 5 = **20** |
 *
 * Every count is inside the task's **≤ 30 extra nodes per window** budget
 * (`MAX_NODES_PER_WINDOW`, pinned by the tests), and the mist band lands
 * exactly once per window because it hangs off the houses `k ≡ 0 (mod 5)` and
 * any five consecutive houses hold exactly one multiple of five.
 *
 * ## Windowing & recycling (the `Street` / `Cars` mechanics)
 *
 * `firstDecorK(worldX) = floor(worldX / SPACING) - 1` and the window is that
 * house plus the next four — the same five-slot window the street, the yards
 * and the parked cars use, one slot of look-ahead on each side of the 852 px
 * stage. `decorSlots()` flattens the live picks; the component translates one
 * container by `-worldX` and parks each node at its fixed `k*SPACING + off`, so
 * a house sliding into the window adds its nodes and one sliding out drops
 * them, and the node count never grows over a long walk.
 *
 * ## Determinism (pure decor, never correlated with the refusal roll)
 *
 * A house's picks are a pure function of `(theme, k)`: `decorPicks` draws from
 * `decorRng(theme, k)`, a seeded mulberry32 over an FNV-1a hash of the pair.
 * Two consequences, both pinned:
 *
 *   - the same `(theme, k)` yields identical picks every time and at every
 *     `worldX` (a house re-entering the window looks exactly as it did), which
 *     is what makes screenshots and the recycling assertions stable;
 *   - **nothing here reads the sim's refusal/richness knobs** — the decor is
 *     pure scenery (spec §4.4: ornaments "never correlates with refusal odds").
 *
 * `rng` is injectable (`Rng`) for a deterministic harness, exactly like
 * `car-model.ts` / `npc-model.ts`; the default is the seeded one, so production
 * is deterministic too.
 *
 * ## The rare shooting star (`starry` only)
 *
 * One time-only event with a **≥ 40 s** floor between two shots
 * (`SHOOT_MIN_MS`), first due at `SHOOT_FIRST_MS` (40 s), re-armed
 * unconditionally on every due tick and **one at a time** (`shootTick`'s
 * `active` flag swallows a due tick under a shot already crossing) — the same
 * scheduler shape as the T21 cameo and the T20 passer. Because a crossing lasts
 * `SHOOT_DUR_MS` (1.4 s) and the gap floor is 40 s, two shots can never
 * overlap.
 *
 * Pure: numbers in, numbers out — no DOM, no timers, no store.
 */
import { SPACING } from '$lib/sim/loop';
import { neighborhoodIndex, themeFor } from '$lib/sim/progression';
import type { Theme } from '$lib/sim/progression';

/** The one mapping the theme layer needs: furthest house → its theme. */
export function themeAt(furthestK: number): Theme {
	return themeFor(neighborhoodIndex(furthestK));
}

/** The stage's design reference (ADR-0004) — the model's y coordinates are top-down px. */
export const STAGE_W = 852;
export const STAGE_H = 393;

/** Live houses at once — the street/cars window (one slot of look-ahead each side). */
export const DECOR_WINDOW = 5;

/** The task's hard node budget for one window, across every theme. */
export const MAX_NODES_PER_WINDOW = 30;

/** The decor a theme can put on a house. */
export const DECOR_KINDS = ['leaf', 'wisp', 'mist', 'pumpkin', 'hay', 'shimmer'] as const;

/** One ambient decor kind. */
export type DecorKind = (typeof DECOR_KINDS)[number];

/** The four themes this model knows how to dress (a guard for a bad prop). */
export const DECOR_THEMES: readonly Theme[] = ['leafy', 'foggy', 'pumpkin', 'starry'];

/**
 * The kinds that live in the sky/roof band (mist, wisps, shimmer stars). The
 * component splits the window on this: sky decor rides **behind** the street
 * with the parallax bands, ground decor (leaves, pumpkins, hay) rides in front
 * of the street's bands — see the component's layering note.
 */
export const SKY_KINDS: readonly DecorKind[] = ['wisp', 'mist', 'shimmer'];

/** True for a kind that belongs in the sky band rather than on the ground. */
export function isSkyKind(kind: DecorKind): boolean {
	return SKY_KINDS.includes(kind);
}

/* ------------------------------------------------------------------ */
/* per-theme pick counts                                              */
/* ------------------------------------------------------------------ */

/** `leafy`: drifting leaves per house. */
export const LEAF_COUNT = 5;
/** `foggy`: extra wisps per house (on top of `ParallaxLayers`' three). */
export const WISP_COUNT = 2;
/** `foggy`: one house in five anchors the window's faint mist band. */
export const MIST_EVERY = 5;
/** `pumpkin`: pumpkins per cluster (one cluster per house, at the yard edge). */
export const PUMPKIN_COUNT = 3;
/** `pumpkin`: every house gets one hay tuft, alternating yard edges. */
export const HAY_PER_HOUSE = 1;
/** `starry`: brighter shimmer stars per house. */
export const SHIMMER_COUNT = 4;

/** Node counts by theme — the table the budget test walks (`≤ MAX_NODES_PER_WINDOW`). */
export const NODES_PER_WINDOW: Record<Theme, number> = {
	leafy: LEAF_COUNT * DECOR_WINDOW,
	foggy: WISP_COUNT * DECOR_WINDOW + 1,
	pumpkin: (PUMPKIN_COUNT + HAY_PER_HOUSE) * DECOR_WINDOW,
	starry: SHIMMER_COUNT * DECOR_WINDOW
};

/**
 * The §3 token ramp each kind draws its fill from, indexed by `DecorPick.tone`
 * (wrapped, so a hostile tone can never miss). Leaves are the autumn trims
 * (amber → pumpkin-deep → stem), pumpkins the two orange stops, the mist and
 * the wisps the ghost shade, hay the deep amber, shimmer the moon/glow pair.
 */
export const TONE_RAMPS: Record<DecorKind, readonly string[]> = {
	leaf: ['var(--amber)', 'var(--pumpkin-deep)', 'var(--stem)'],
	wisp: ['var(--ghost-shade)'],
	mist: ['var(--ghost-shade)'],
	pumpkin: ['var(--pumpkin)', 'var(--pumpkin-deep)'],
	hay: ['var(--amber-deep)'],
	shimmer: ['var(--moon)', 'var(--glow)']
};

/* ------------------------------------------------------------------ */
/* the picks                                                          */
/* ------------------------------------------------------------------ */

/** One decor node on one house, independent of `worldX` (see the doc header). */
export interface DecorPick {
	/** Which ambient decor this is. */
	kind: DecorKind;
	/** In-slot x offset, px (`0 .. SPACING`). */
	off: number;
	/** Stage top, px (top-down, `0 .. STAGE_H`). */
	y: number;
	/** Rendered width, px. */
	w: number;
	/** Rendered height, px. */
	h: number;
	/** Index into `TONE_RAMPS[kind]` (wrapped on read). */
	tone: number;
	/** Ambient-loop delay, seconds — staggers the neighbours. */
	delay: number;
}

/** A live pick: its house, its ordinal on that house, and its window slot. */
export interface DecorSlot extends DecorPick {
	/** House index on the endless street (may be negative at the window edge). */
	k: number;
	/** Pick ordinal inside its house — the stable half of the render key. */
	i: number;
	/** Window slot, `0 .. DECOR_WINDOW-1` (`k = firstDecorK(worldX) + slot`). */
	slot: number;
}

/** An injected uniform `[0, 1)` source — the sim's `rand` shape. */
export type Rng = () => number;

/** Positive modulo — floors correctly for the negative window-edge houses. */
function positiveMod(v: number, m: number): number {
	return ((v % m) + m) % m;
}

/** Clamp any number into `[0, 1]`. */
function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to one decimal — keeps the picks readable in a failing diff. */
function round1(v: number): number {
	return Math.round(v * 10) / 10;
}

/** A uniform value in `[min, max]`, rounded to one decimal. */
function range(rng: Rng, min: number, max: number): number {
	return round1(min + clamp01(rng()) * (max - min));
}

/** A uniform integer in `[0, n-1]` (a hostile rng clamps instead of escaping). */
function intLessThan(rng: Rng, n: number): number {
	return Math.min(n - 1, Math.max(0, Math.floor(clamp01(rng()) * n)));
}

/**
 * The FNV-1a hash of `theme:k` — the picks' seed. Whole-number and text-free
 * beyond the theme name, so `decorSeed('leafy', 3)` is a fixed number on every
 * machine and every run.
 */
export function decorSeed(theme: Theme, k: number): number {
	const s = `${theme}:${Math.trunc(k)}`;
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/**
 * The seeded source for one house: mulberry32 over `decorSeed(theme, k)`. The
 * default `decorPicks` source — that is what makes a house's decor identical
 * every time it re-enters the window.
 */
export function decorRng(theme: Theme, k: number): Rng {
	let a = decorSeed(theme, k);
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The decor one house carries in `theme`, top-down px — a **pure function of
 * `(theme, k)`** with the default seeded `rng`.
 *
 * Bands (spec §4.1 front-to-back: road → sidewalk → yards → houses):
 *
 *   - `leafy` — 5 leaves, `y ∈ [290, 374]`: the yard/sidewalk/road band, where
 *     a drift actually blows;
 *   - `foggy` — 2 wisps in the sky/roof band (`y ∈ [140, 250]`) plus, on the
 *     `k ≡ 0 (mod 5)` houses, one 520 px mist band low over the yards
 *     (`y = 292`), so every window carries exactly one;
 *   - `pumpkin` — 3 pumpkins at a yard edge (`y ∈ [296, 314]`, inside the
 *     `272..322` yard band so a lifted node never climbs a house) plus one hay
 *     tuft per house, left edge on even houses and right edge on odd ones
 *     (that is what makes them read as *yard* edges);
 *   - `starry` — 4 brighter shimmer stars high in the sky band (`y ∈ [22, 170]`).
 */
export function decorPicks(theme: Theme, k: number, rng: Rng = decorRng(theme, k)): DecorPick[] {
	const picks: DecorPick[] = [];

	switch (theme) {
		case 'leafy': {
			for (let i = 0; i < LEAF_COUNT; i++) {
				// Big enough to read at 56 px (ART-STYLE §4 rule 6): a leaf is a
				// shape, not a speck, at this stage scale.
				const w = range(rng, 11, 17);
				picks.push({
					kind: 'leaf',
					off: range(rng, 10, SPACING - 10),
					y: range(rng, 290, 374),
					w,
					h: round1(w * 0.72),
					tone: intLessThan(rng, TONE_RAMPS.leaf.length),
					delay: range(rng, 0, 6)
				});
			}
			break;
		}

		case 'foggy': {
			for (let i = 0; i < WISP_COUNT; i++) {
				picks.push({
					kind: 'wisp',
					off: range(rng, 40, SPACING - 40),
					y: range(rng, 140, 250),
					w: range(rng, 150, 260),
					h: range(rng, 26, 44),
					tone: intLessThan(rng, TONE_RAMPS.wisp.length),
					delay: range(rng, 0, 10)
				});
			}
			// One mist band per window: any five consecutive houses hold exactly
			// one multiple of five, so this can neither double nor vanish.
			if (positiveMod(k, MIST_EVERY) === 0) {
				picks.push({
					kind: 'mist',
					off: 40,
					y: 292,
					w: 520,
					h: 30,
					tone: intLessThan(rng, TONE_RAMPS.mist.length),
					delay: 0
				});
			}
			break;
		}

		case 'pumpkin': {
			for (let i = 0; i < PUMPKIN_COUNT; i++) {
				const w = range(rng, 12, 18);
				picks.push({
					kind: 'pumpkin',
					off: range(rng, 26, SPACING - 26),
					y: range(rng, 296, 314),
					w,
					h: round1(w * 0.86),
					tone: intLessThan(rng, TONE_RAMPS.pumpkin.length),
					delay: range(rng, 0, 5)
				});
			}
			for (let i = 0; i < HAY_PER_HOUSE; i++) {
				// A tuft big enough to read as straw against the fence rails it
				// sits above (the rails span y 294..324).
				const w = range(rng, 46, 64);
				// Even houses tuft the **right** yard edge, odd houses the left one:
				// the window shows slot `m`'s right half and slot `m+1`'s left half,
				// so this parity keeps one tuft of the pair on screen at every
				// scroll position (the opposite parity hid both).
				picks.push({
					kind: 'hay',
					off: positiveMod(k, 2) === 0 ? SPACING - 70 : 6,
					y: range(rng, 282, 292),
					w,
					h: round1(w * 0.6),
					tone: intLessThan(rng, TONE_RAMPS.hay.length),
					delay: range(rng, 0, 4)
				});
			}
			break;
		}

		case 'starry': {
			for (let i = 0; i < SHIMMER_COUNT; i++) {
				const w = range(rng, 2.4, 4.4);
				picks.push({
					kind: 'shimmer',
					off: range(rng, 6, SPACING - 6),
					y: range(rng, 22, 170),
					w,
					h: w,
					tone: intLessThan(rng, TONE_RAMPS.shimmer.length),
					delay: range(rng, 0, 5)
				});
			}
			break;
		}
	}

	return picks;
}

/** The first live house: the street/cars window's `floor(worldX / SPACING) - 1`. */
export function firstDecorK(worldX: number): number {
	return Math.floor(worldX / SPACING) - 1;
}

/**
 * The live decor for a scroll position: every pick on the `DECOR_WINDOW`
 * consecutive houses starting at `firstDecorK(worldX)`, in ascending `k` then
 * pick order. Pure and order-preserving — pure decor, so nothing here is
 * filtered by phase, progress or a refused door.
 */
export function decorSlots(
	theme: Theme,
	worldX: number,
	window: number = DECOR_WINDOW
): DecorSlot[] {
	const k0 = firstDecorK(worldX);
	const slots: DecorSlot[] = [];
	for (let s = 0; s < Math.max(0, Math.trunc(window)); s++) {
		const k = k0 + s;
		decorPicks(theme, k).forEach((pick, i) => slots.push({ ...pick, k, i, slot: s }));
	}
	return slots;
}

/** A slot's stage x for a scroll position: `k*SPACING + off - worldX`. */
export function decorScreenX(slot: DecorSlot, worldX: number): number {
	return slot.k * SPACING + slot.off - worldX;
}

/** The §3 token a pick draws its fill from (tone index wrapped). */
export function decorTone(slot: DecorPick): string {
	const ramp = TONE_RAMPS[slot.kind];
	return ramp[positiveMod(slot.tone, ramp.length)];
}

/* ------------------------------------------------------------------ */
/* the rare shooting star (`starry` only)                             */
/* ------------------------------------------------------------------ */

/** First shot no earlier than this after mount — the cadence floor, 40 s. */
export const SHOOT_FIRST_MS = 40_000;
/** Shortest gap between two shots — the task's "≥ 40 s" bound. */
export const SHOOT_MIN_MS = 40_000;
/** Extra random gap, exclusive: `rng() * 20 s`, so the longest gap is 60 s. */
export const SHOOT_SPAN_MS = 20_000;
/** How long one crossing lasts — 1.4 s, well inside the 40 s floor. */
export const SHOOT_DUR_MS = 1400;

/** Crossing endpoints, stage px: enters above the left roof line, exits right. */
export const SHOOT_FROM_X = -140;
export const SHOOT_TO_X = 1006;
/** The fall across the sky band, top px: high-left to low-right. */
export const SHOOT_FROM_Y = 30;
export const SHOOT_TO_Y = 168;

/** When the first shot becomes due: `now + 40 s`. */
export function firstShootAt(now: number): number {
	return now + SHOOT_FIRST_MS;
}

/** The gap until the next shot, in `[40 s, 60 s)`. */
export function shootGap(rng: Rng): number {
	return SHOOT_MIN_MS + clamp01(rng()) * SHOOT_SPAN_MS;
}

/** When the next shot fires, measured from the previous due time. */
export function nextShootAt(now: number, rng: Rng): number {
	return now + shootGap(rng);
}

/** Clamped crossing progress `0..1` from the ms since the shot began. */
export function shootProgress(elapsedMs: number, dur: number = SHOOT_DUR_MS): number {
	return clamp01(elapsedMs / dur);
}

/** The streak's x along its crossing, a straight lerp (`t ∈ [0,1]`). */
export function shootX(t: number): number {
	return SHOOT_FROM_X + (SHOOT_TO_X - SHOOT_FROM_X) * clamp01(t);
}

/** The streak's y along its crossing, falling from the roof line to the horizon. */
export function shootY(t: number): number {
	return SHOOT_FROM_Y + (SHOOT_TO_Y - SHOOT_FROM_Y) * clamp01(t);
}

/** What the caller should do after one `shootTick` call. */
export interface ShootDecision {
	/** The time the next shot becomes due. */
	nextAt: number;
	/** Whether a shot should start now. */
	shoot: boolean;
}

/**
 * The shooting-star scheduler, one tick at `now` (ms, the `performance.now()`
 * origin) — the T21 cameo's shape applied to the starry sky:
 *
 *   - **rate-limited** — nothing fires before `nextAt`, and a due tick always
 *     re-arms to `now + [40 s, 60 s)` whether or not a shot started, so a
 *     missed window can never stack into a burst;
 *   - **one at a time** — `active` (a streak already crossing) swallows a due
 *     tick; the 40 s floor is far longer than the 1.4 s crossing, so no two
 *     streaks ever share the sky.
 */
export function shootTick(now: number, nextAt: number, rng: Rng, active = false): ShootDecision {
	if (now < nextAt) return { nextAt, shoot: false };

	// Re-arm regardless (the cameo/passer convention).
	const next = nextShootAt(now, rng);
	if (active) return { nextAt: next, shoot: false };
	return { nextAt: next, shoot: true };
}
