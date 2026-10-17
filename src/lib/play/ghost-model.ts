/**
 * T21 — the ambient sky ghosts' maths, lifted out of the render path so it can
 * be pinned without a DOM (spec §4.4: "Sky ghosts: 2–3 drifting above rooftops
 * … gentle bob; a shy one peeks from a trash can occasionally; sky ghosts
 * giggle-hop after every successful scherzo").
 *
 * The component (`Ghosts.svelte`) owns the elements, the rAF clock and the
 * `cameo`/`hop` DOM beats; this module owns only the *numbers* the validated
 * prototype inlined in `renderScene()` and `cameoTick()`
 * (`prototypes/scene-prototype.html`):
 *
 * | prototype (`scene-prototype.html`)            | here |
 * |-----------------------------------------------|------|
 * | `ghostXs = [180, 780, 1350]` (~1174)          | `GHOST_BASE_X` + `ghostBaseX` |
 * | `bottom = 240 + i*18` (~1178)                 | `ghostBottom` |
 * | `phase = i * 2.1` (~1181)                     | `ghostPhase` |
 * | `wx = baseX + sin(t*.18 + phase)*60` (~1766)  | `ghostScreenX` |
 * | `((wx - worldX*.55) % 2400 + 2400) % 2400 - 200` (~1767) | `ghostScreenX` |
 * | cameo cadence `+32000 + rand*20000` (~1563)   | `CAMEO_MIN_MS`/`CAMEO_SPAN_MS` + `nextCameoAt` |
 * | cameo can gate `((k%4)+4)%4 === 1` (~1566)    | `hasCameoCan` |
 * | cameo window `k0..k0+2`, x ∈ [−60, 900] (~1564-1570) | `visibleCameoKs` |
 * | cameo anchor `k*SPACING + 168 − worldX` (~1569) | `canScreenX` |
 * | hop on `TRICK_RESOLVE` (~1488)                | `decideHop` |
 *
 * Pure: no DOM, no timers; the clock (`now`, `t`) and the rng arrive as
 * arguments. The two deliberate deviations from the prototype are noted where
 * they happen: the wrap ships one ghost at a time (prototype verbatim), and the
 * cameo only samples cans that are actually on screen (the prototype could pick
 * an off-screen can and bail, burning the whole ~32–52 s cadence).
 */
import { SPACING } from '../sim/loop';

/** How many sky ghosts drift behind the rooflines (spec §4.4: "2–3"). */
export const GHOST_COUNT = 3;

/** The prototype's `ghostXs` — each ghost's anchor x in the 2400 px drift strip. */
export const GHOST_BASE_X: readonly number[] = [180, 780, 1350];

/** Lowest ghost's baseline (px from the stage bottom); the others step up. */
export const GHOST_BOTTOM_BASE = 240;
/** Vertical step between neighbours (prototype `240 + i*18`). */
export const GHOST_BOTTOM_STEP = 18;

/** Drift angular rate, rad/s (prototype `sin(t*.18 + phase)`). */
export const GHOST_DRIFT_RATE = 0.18;
/** Drift amplitude, px (prototype `*60`). */
export const GHOST_DRIFT_AMPLITUDE = 60;
/** Drift phase step between neighbours (prototype `i * 2.1`). */
export const GHOST_DRIFT_PHASE_STEP = 2.1;

/** Parallax factor against the street (prototype `worldX * .55`). */
export const GHOST_PARALLAX = 0.55;
/** The drift strip wraps every this many px (prototype `% 2400`). */
export const GHOST_WRAP = 2400;
/** Screen-x offset applied after the wrap (prototype `- 200`). */
export const GHOST_WRAP_OFFSET = 200;

/**
 * The `ghosthop` giggle-hop's life, ms — the class the component adds on a
 * successful scherzo and drops here. The prototype removed at 950 ms; the
 * keyframe itself is `.9s`, so the class is held for the animation's length.
 */
export const GHOST_HOP_MS = 900;

/** Positive modulo — keeps a drifting ghost's x inside the 2400 px strip. */
function wrap(value: number, modulus: number): number {
	return ((value % modulus) + modulus) % modulus;
}

/** Index folded into `0..GHOST_COUNT-1` (a caller may pass any integer). */
function normIndex(i: number): number {
	return ((i % GHOST_COUNT) + GHOST_COUNT) % GHOST_COUNT;
}

/** The anchor x of sky ghost `i` (its slot in the 2400 px drift strip). */
export function ghostBaseX(i: number): number {
	return GHOST_BASE_X[normIndex(i)];
}

/** The bottom (px from the stage bottom) of sky ghost `i` — `240 + i*18`. */
export function ghostBottom(i: number): number {
	return GHOST_BOTTOM_BASE + normIndex(i) * GHOST_BOTTOM_STEP;
}

/** The drift phase of sky ghost `i` — `i * 2.1`, so the three never sync. */
export function ghostPhase(i: number): number {
	return normIndex(i) * GHOST_DRIFT_PHASE_STEP;
}

/**
 * Sky ghost `i`'s screen x at time `t` seconds for a world scroll `worldX`.
 * Prototype verbatim: a sinusoidal drift on the anchor, then the parallax
 * shift wrapped into the 2400 px strip and pulled 200 px left.
 *
 * `t` is `performance.now()/1000` in the prototype; the component freezes it
 * (passes `0`) under `prefers-reduced-motion`, which leaves the ghosts at
 * their static anchor offsets while the parallax translation still tracks the
 * walk (a translation, which reduced motion keeps).
 */
export function ghostScreenX(i: number, t: number, worldX: number): number {
	const drift = Math.sin(t * GHOST_DRIFT_RATE + ghostPhase(i)) * GHOST_DRIFT_AMPLITUDE;
	const wx = ghostBaseX(i) + drift;
	return wrap(wx - worldX * GHOST_PARALLAX, GHOST_WRAP) - GHOST_WRAP_OFFSET;
}

/* ------------------------------------------------------------------- */
/* the shy trash-can cameo                                             */
/* ------------------------------------------------------------------- */

/** First cameo no earlier than this after mount (prototype `+30000`). */
export const CAMEO_FIRST_MS = 30000;
/** Shortest gap between cameos once running (prototype `+32000`). */
export const CAMEO_MIN_MS = 32000;
/** Widest extra gap, exclusive (prototype `+ rand*20000`). */
export const CAMEO_SPAN_MS = 20000;

/** The trash can's x inside a 620 px slot (matches `Yards.svelte`'s `left:168px`). */
export const CAMEO_CAN_OFFSET = 168;
/** Every `CAMEO_CAN_EVERY`-th house has a cameo can (prototype `k % 4 === 1`). */
export const CAMEO_CAN_EVERY = 4;
export const CAMEO_CAN_REMAINDER = 1;
/** Houses checked each tick: `k0 .. k0 + CAMEO_WINDOW_AHEAD` (prototype `k0..k0+2`). */
export const CAMEO_WINDOW_AHEAD = 2;
/** A can is only "in view" inside this screen-x band (prototype `-60..900`). */
export const CAMEO_VISIBLE_X0 = -60;
export const CAMEO_VISIBLE_X1 = 900;
/** The cameo head's bottom (px from the stage bottom) — the can's mouth. */
export const CAMEO_BOTTOM = 84;
/** How long the shy one stays out before retracting (prototype `at(2200)`). */
export const CAMEO_RISE_MS = 2200;
/** Retract life before the node is dropped (prototype `setTimeout(…, 450)`). */
export const CAMEO_RETRACT_MS = 450;

/** An injected uniform `[0, 1)` source — the sim's `rand` shape. */
export type Rng = () => number;

/** True when house `k` has a cameo can (`((k%4)+4)%4 === 1`). */
export function hasCameoCan(k: number): boolean {
	return wrap(k, CAMEO_CAN_EVERY) === CAMEO_CAN_REMAINDER;
}

/** House `k`'s trash-can screen x for a world scroll `worldX`. */
export function canScreenX(k: number, worldX: number): number {
	return k * SPACING + CAMEO_CAN_OFFSET - worldX;
}

/**
 * The cameo can-houses actually on screen for a world scroll: the prototype's
 * `k0 .. k0+2` window (`k0 = floor(worldX / SPACING)`), narrowed to houses with
 * a can *and* a can x inside `[-60, 900]`.
 *
 * Deviation from the prototype (deliberate): the prototype sampled a can from
 * the window and *then* bailed if it landed off screen, wasting that whole
 * cadence. Filtering first makes "when a can is in view" true to the spec, so a
 * due cameo that finds no can keeps nothing back — but it never fires blind.
 */
export function visibleCameoKs(worldX: number): number[] {
	const k0 = Math.floor(worldX / SPACING);
	const visible: number[] = [];
	for (let k = k0; k <= k0 + CAMEO_WINDOW_AHEAD; k++) {
		if (!hasCameoCan(k)) continue;
		const x = canScreenX(k, worldX);
		if (x >= CAMEO_VISIBLE_X0 && x <= CAMEO_VISIBLE_X1) visible.push(k);
	}
	return visible;
}

/** The next cameo time after a tick at `now` — `now + [32000, 52000)`. */
export function nextCameoAt(now: number, rng: Rng): number {
	return now + CAMEO_MIN_MS + rng() * CAMEO_SPAN_MS;
}

/** A cameo to reveal: the can-house it peeks from and its screen x. */
export interface Cameo {
	/** The cameo can-house index. */
	k: number;
	/** Its screen x in stage-logical px. */
	x: number;
}

/** One scheduler step: the next due time plus a cameo to show, or `null`. */
export interface CameoDecision {
	/** The time the next cameo becomes due. */
	nextAt: number;
	/** The cameo to reveal now, or `null`. */
	cameo: Cameo | null;
}

/**
 * The cameo scheduler, one tick at `now` (ms, the `performance.now()` origin).
 *
 * The prototype's `cameoTick`, with the two properties the spec asks for made
 * explicit:
 *
 *   - **rate-limited** — nothing fires before `nextAt`; once due, the next
 *     cameo is always resigned to `now + [32000, 52000)` whether or not one was
 *     shown (exactly the prototype's unconditional re-arm), so a missed window
 *     can never stack into a burst;
 *   - **one at a time** — `active` (a cameo already on screen) swallows the due
 *     tick: a second head never rises under the first;
 *   - **only a visible can** — the pick is drawn from `visibleCameoKs`, and a
 *     due tick over an empty window shows nothing.
 */
export function cameoTick(
	now: number,
	nextAt: number,
	worldX: number,
	rng: Rng,
	active = false
): CameoDecision {
	if (now < nextAt) return { nextAt, cameo: null };

	// Re-arm regardless (the prototype's unconditional `cameoAt = …`).
	const next = nextCameoAt(now, rng);
	if (active) return { nextAt: next, cameo: null };

	const candidates = visibleCameoKs(worldX);
	if (!candidates.length) return { nextAt: next, cameo: null };

	const pick = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
	const k = candidates[pick];
	return { nextAt: next, cameo: { k, x: canScreenX(k, worldX) } };
}

/* ------------------------------------------------------------------- */
/* the hop (once per successful scherzo)                               */
/* ------------------------------------------------------------------- */

/** Identifies one scherzo show; the component mints a fresh one per climax. */
export type ShowToken = number;

/** What the caller should do after one `decideHop` call. */
export interface HopDecision {
	/** Whether the sky ghosts hop *now*. */
	hop: boolean;
	/** The show token to carry forward as "already hopped for". */
	memory: ShowToken | null;
}

/**
 * The hop trigger predicate: a successful scherzo (`token`) makes the sky
 * ghosts giggle-hop, **once per show** (spec §4.4). Carry `memory` forward;
 * the same token never hops a second time, however many times a climax is
 * replayed, and a new token always hops. Mint a fresh token per show with
 * `nextShowToken`.
 */
export function decideHop(memory: ShowToken | null, token: ShowToken): HopDecision {
	if (memory === token) return { hop: false, memory };
	return { hop: true, memory: token };
}

/** The next show token after `prev` (`null → 1`), for a caller with no counter. */
export function nextShowToken(prev: ShowToken | null): ShowToken {
	return prev === null ? 1 : prev + 1;
}
