/**
 * T19 — the neighborhood kids, as pure math (spec §4.3 "Neighborhood kids",
 * §4.4 ambient life).
 *
 * Faithful port of the prototype's NPC block
 * (`prototypes/scene-prototype.html`, `initNpcs()` ~1244-1259 and
 * `renderNpcs(dt)` ~1260-1275) plus its ambient shout timer (`shoutTick(now)`
 * ~1547-1559). Every number below is the prototype's; this module only lifts
 * the decisions out of the DOM so they can be pinned without a browser:
 *
 * - `createNpcs(rng)` — the **pool of 6** recycled costumed kids, one per
 *   `NPC_KINDS` entry (ghost / pumpkin / witchling / skeleton / bat / cat-ears):
 *   `x = i*380 + rand*200`, `dir = i % 2 ? 1 : -1` (they start walking both
 *   ways), `speed = 120 + rand*40`. Deterministic given an injected `rng`.
 * - `advanceNpcs(npcs, dt, worldX, rng)` — one tick: every kid walks
 *   `dir*speed*dt`, then the two rules that make the pool feel endless:
 *   **wave when near** and **recycle inside the player window**. `worldX` is
 *   the sim's scroll; the duo stands at `worldX + 310`, so a kid "passes" the
 *   duo when `|x - (worldX + 310)| < 70`. The wave latch (`waved`) is set the
 *   frame a kid first comes near and only cleared once it is far again
 *   (`> 220`): **once per approach, reset when far** — a kid the player walks
 *   alongside waves once, never once a frame. Wrapping reuses the pool: a kid
 *   dragged past either screen edge is teleported just off the *opposite* edge
 *   and sent walking back in, so 6 nodes cover the whole endless street.
 * - `pickShout` / `shoutDelay` — the distant shout: only an **on-screen** kid
 *   (`60 < screenX < 760`, the prototype's filter) is ever picked, and the
 *   cadence is bounded (`SHOUT_MIN_MS 26000 … +20000`, first shout after
 *   `SHOUT_FIRST_MS 24000`) — every gap ≥ ~25 s.
 *
 * Pure: no DOM, no timers, no store — randomness arrives as a `rng: () =>
 * number` argument (defaults live on the caller), exactly like `economy.ts`.
 * The renderer (`Npcs.svelte`) owns the rAF clock, the `.wave` class, the
 * bubble and the sound hook; this module owns only the numbers.
 */

/** The six recycled costumes (ART-STYLE ×6, including cat-ears). */
export const NPC_KINDS = [
	'npcGhost',
	'npcPumpkin',
	'npcWitchling',
	'npcSkeleton',
	'npcBat',
	'npcCat'
] as const;

/** One of the six kid costumes (a sprite id). */
export type NpcKind = (typeof NPC_KINDS)[number];

/** The kids only ever face left (−1) or right (1) — never idle. */
export type NpcDir = 1 | -1;

/** Pool size: 6 recycled kids (spec §4.3 band 4–6; ART-STYLE catalogue). */
export const NPC_POOL = 6;

/** Initial spread: `x = i*380 + rand*200` (prototype `initNpcs`). */
export const NPC_SEED_SPACING = 380;
export const NPC_SEED_JITTER = 200;

/** Walk speed band: `120 + rand*40` px/s (prototype `initNpcs`). */
export const NPC_SPEED_MIN = 120;
export const NPC_SPEED_SPAN = 40;

/** The duo stands this far along the world from the scroll origin. */
export const PLAYER_OFFSET = 310;

/** Wave-when-near distance and the far latch reset (prototype `renderNpcs`). */
export const WAVE_NEAR = 70;
export const WAVE_FAR = 220;
/** How long `.wave` holds after a wave (prototype's 1300 ms `setTimeout`). */
export const WAVE_MS = 1300;

/** Screen-x wrap bands: below the left one, above the right one (`renderNpcs`). */
export const WRAP_LEFT = -340;
export const WRAP_RIGHT = 1150;

/** Recycle targets, world-relative: `worldX + 900 + rand*150` (dir 1) … */
export const RECYCLE_RIGHT_MIN = 900;
export const RECYCLE_RIGHT_JITTER = 150;
/** … and `worldX - 220 - rand*100` (dir −1) for the other edge. */
export const RECYCLE_LEFT_MIN = 220;
export const RECYCLE_LEFT_JITTER = 100;

/** First shout delay (prototype's `shoutAt = now + 24000`). */
export const SHOUT_FIRST_MS = 24000;
/** Later shout cadence: `26000 + rand*20000` — every gap ≥ ~25 s. */
export const SHOUT_MIN_MS = 26000;
export const SHOUT_SPAN_MS = 20000;

/** The prototype's "on-screen" shout filter: `60 < screenX < 760`. */
export const SHOUT_VIEW_LEFT = 60;
export const SHOUT_VIEW_RIGHT = 760;

/** Shout bubble: `screenX + 20`, y 270, small, 1200 ms (`shoutTick`). */
export const SHOUT_BUBBLE_DX = 20;
export const SHOUT_BUBBLE_Y = 270;
export const SHOUT_BUBBLE_MS = 1200;

/** One roaming kid. `x` is a world px; `dir` its facing/travel sign. */
export interface Npc {
	/** The costume (a sprite id in `NPC_KINDS`). */
	kind: NpcKind;
	/** World x in logical px. */
	x: number;
	/** Travel/facing direction: −1 left, 1 right. */
	dir: NpcDir;
	/** Speed in px/s. */
	speed: number;
	/** Wave latch: set on approach, cleared only once far again. */
	waved: boolean;
}

/** The pool after one tick, plus the indices that waved this tick. */
export interface NpcStep {
	npcs: Npc[];
	/** Indices into `npcs` whose `.wave` class should (re)start now. */
	waves: number[];
}

/** Screen x of a kid: its world x minus the scroll (prototype `renderNpcs`). */
export function screenXOf(npc: Npc, worldX: number): number {
	return npc.x - worldX;
}

/** World x of the duo — the wave reference point (prototype `playerWorldX`). */
export function playerWorldX(worldX: number): number {
	return worldX + PLAYER_OFFSET;
}

/** True while a kid is close enough to the duo to wave (the `< 70` gate). */
export function isNear(npc: Npc, worldX: number): boolean {
	return Math.abs(npc.x - playerWorldX(worldX)) < WAVE_NEAR;
}

/** True once a kid is far enough that a fresh approach may wave again. */
export function isFar(npc: Npc, worldX: number): boolean {
	return Math.abs(npc.x - playerWorldX(worldX)) > WAVE_FAR;
}

/**
 * The pool of five kids, seeded exactly like `initNpcs()`: costume `i`, a
 * `380`-px rank plus `rand*200` of jitter, alternating start direction and a
 * `120–160` px/s speed. Consumes three `rng()` draws per kid (x, speed — dir
 * is fixed): the order matches the prototype statement by statement.
 */
export function createNpcs(rng: () => number): Npc[] {
	return Array.from({ length: NPC_POOL }, (_, i) => ({
		kind: NPC_KINDS[i % NPC_KINDS.length],
		x: i * NPC_SEED_SPACING + rng() * NPC_SEED_JITTER,
		dir: (i % 2 ? 1 : -1) as NpcDir,
		speed: NPC_SPEED_MIN + rng() * NPC_SPEED_SPAN,
		waved: false
	}));
}

/**
 * One tick of the whole pool: walk, wave, recycle — the prototype's
 * `renderNpcs(dt)` order, statement for statement.
 *
 * For each kid: advance `x` by `dir*speed*dt`; if it just came near the duo and
 * its latch is clear, raise the latch and report a wave; if it drifts far
 * again, clear the latch (so the next approach can wave); finally recycle it
 * across to the opposite edge if it left the screen window. Returns a fresh
 * pool (never mutates the input) and the waving indices for this tick.
 */
export function advanceNpcs(
	npcs: readonly Npc[],
	dt: number,
	worldX: number,
	rng: () => number
): NpcStep {
	const waves: number[] = [];
	const next = npcs.map((npc, i) => {
		let { x, dir, waved } = npc;
		x += dir * npc.speed * dt;
		const dist = Math.abs(x - playerWorldX(worldX));
		if (dist < WAVE_NEAR && !waved) {
			waved = true;
			waves.push(i);
		}
		if (dist > WAVE_FAR) waved = false;

		const screenX = x - worldX;
		if (screenX < WRAP_LEFT) {
			x = worldX + RECYCLE_RIGHT_MIN + rng() * RECYCLE_RIGHT_JITTER;
			dir = 1;
		} else if (screenX > WRAP_RIGHT) {
			x = worldX - RECYCLE_LEFT_MIN - rng() * RECYCLE_LEFT_JITTER;
			dir = -1;
		}
		return { ...npc, x, dir, waved };
	});
	return { npcs: next, waves };
}

/**
 * Indices of the kids currently "on screen" for a shout — the prototype's
 * `sx > 60 && sx < 760` filter (a shout must come from somewhere the player can
 * actually see). Empty when no kid is in the frame.
 */
export function visibleNpcIndices(npcs: readonly Npc[], worldX: number): number[] {
	const visible: number[] = [];
	for (let i = 0; i < npcs.length; i++) {
		const sx = screenXOf(npcs[i], worldX);
		if (sx > SHOUT_VIEW_LEFT && sx < SHOUT_VIEW_RIGHT) visible.push(i);
	}
	return visible;
}

/**
 * Picks the kid that shouts: a uniformly random **on-screen** one, or `null`
 * when none is visible (the prototype's `visible[(rand*len)|0]`). Consumes one
 * `rng()` draw only when there is someone to pick.
 */
export function pickShout(npcs: readonly Npc[], worldX: number, rng: () => number): number | null {
	const visible = visibleNpcIndices(npcs, worldX);
	if (visible.length === 0) return null;
	return visible[Math.floor(rng() * visible.length)] ?? visible[0];
}

/**
 * The next shout delay after one has fired: `SHOUT_MIN_MS + rng*20000`, the
 * prototype's `26000 + Math.random() * 20000`. Bounded to `[26000, 46000)` —
 * every gap is ≥ ~25 s (the first shout, `SHOUT_FIRST_MS`, is 24 s).
 */
export function shoutDelay(rng: () => number): number {
	return SHOUT_MIN_MS + rng() * SHOUT_SPAN_MS;
}
