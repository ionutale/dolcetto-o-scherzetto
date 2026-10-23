/**
 * T24 — the scary moments' maths, lifted out of the render path so the *when*
 * and the *which* can be pinned without a DOM or a clock (spec §10: "rare
 * monster cameos that always end funny; never aimed at the player").
 *
 * The validated source is `prototypes/pieces/scares.js` (v2, accepted) and the
 * host wiring around it in `prototypes/scene-prototype.html`:
 *
 * | prototype (`scene-prototype.html` / `pieces/scares.js`) | here |
 * |---------------------------------------------------------|------|
 * | `SCARE_GAP_MS = 28000` (dev frequency, ~1500)            | `SCARE_MIN_MS`/`SCARE_SPAN_MS` (spec: 60–120 s) |
 * | `lastScare = 0` (first scare fires ~28 s in)             | `SCARE_FIRST_MS` + `firstScareAt` (~28 s) |
 * | `scareTick`: roam + `dir !== 0` + gap                    | `scareTick` (roam only) |
 * | `if (ambienceLock …) return` (one at a time)             | `scareTick({ active })` |
 * | `KINDS` (six, ~41-54)                                    | `SCARE_KINDS` |
 * | `['witch','wolf','vampire'][rand*3]` (~1508)             | `pickKind` (all six, no immediate repeat) |
 * | kids beat `at(60/120/1400/1900/2500)` (~504-520)         | `SCARE_BEAT` + `SCARE_BEAT_MS` |
 * | `snd('scare:' + kind)` (~1512)                           | `scareCue` |
 *
 * **What this module owns.** Only the *rules*: when a scare may fire, which
 * kind it is, the kids-beat schedule, the `scare:*` cue name, and the
 * `onScare(active)` contract the page wires (the walking lock) and T23 will
 * wire (`duckAmbience`). The choreography — veil, the six monster SVGs, the
 * crossings, the thunder sky event — and the DOM class toggles live in
 * `Scares.svelte`.
 *
 * **Deliberate deviations from the prototype**, both pinned here:
 *
 * 1. **Roam only.** The prototype also let a scare fire in `refuse`
 *    (`state.phase === 'roam' || state.phase === 'refuse'`, ~1503); spec §10
 *    says "only while freely walking (roam)", so `refuse` is excluded.
 * 2. **Every one of the six kinds.** The prototype's auto-pick drew from the
 *    first three (`witch`/`wolf`/`vampire`); the spec's six kinds are all
 *    reachable here, and never twice in a row.
 *
 * Pure: no DOM, no timers, no store. The clock (`now`) and the rng arrive as
 * arguments, so `scare-model.test.ts` drives the whole thing on a fake clock.
 */
import type { Dir, Phase } from '../sim/loop';

/** The six cameos (spec §10 / ART-STYLE §10) — sky, yard and mid bands. */
export type ScareKind = 'witch' | 'wolf' | 'vampire' | 'skeleton' | 'mummy' | 'thunder';

/**
 * The catalogue, in the prototype's `KINDS` order (`pieces/scares.js` ~41-54).
 * `thunder` is a **sky event**, not a crossing (`sky: true` there).
 */
export const SCARE_KINDS: readonly ScareKind[] = [
	'witch',
	'wolf',
	'vampire',
	'skeleton',
	'mummy',
	'thunder'
];

/** An injected uniform `[0, 1)` source — the sim's `rand` shape. */
export type Rng = () => number;

/* ------------------------------------------------------------------- */
/* the gap                                                             */
/* ------------------------------------------------------------------- */

/**
 * First scare no earlier than this after load, ms — short enough that a brief
 * play session still sees a cameo (~28 s), while later gaps stay rare (60–120 s).
 */
export const SCARE_FIRST_MS = 28000;

/** Shortest gap between two cameos, ms — the spec's floor ("at most once per 60–120 s"). */
export const SCARE_MIN_MS = 60000;
/** Widest extra gap, exclusive, ms — so the gap lands in `[60, 120) s`. */
export const SCARE_SPAN_MS = 60000;

/** The next time a scare becomes due after one fired at `now` — `now + [60 s, 120 s)`. */
export function nextScareAt(now: number, rng: Rng): number {
	return now + SCARE_MIN_MS + rng() * SCARE_SPAN_MS;
}

/** When the first scare of a session becomes due (`now + SCARE_FIRST_MS`). */
export function firstScareAt(now: number): number {
	return now + SCARE_FIRST_MS;
}

/* ------------------------------------------------------------------- */
/* kind selection                                                      */
/* ------------------------------------------------------------------- */

/**
 * Pick the next cameo's kind. Uniform over **all six** (spec §10's six kinds),
 * minus `prev` — the "no immediate repeat" rule. Pass `prev = null` for the
 * first pick of a session (all six live). Matches the prototype's
 * `pool[(rng()*pool.length)|0]` shape, with the pool narrowed before the draw.
 */
export function pickKind(prev: ScareKind | null, rng: Rng): ScareKind {
	const pool = prev === null ? SCARE_KINDS : SCARE_KINDS.filter((k) => k !== prev);
	const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
	return pool[i];
}

/* ------------------------------------------------------------------- */
/* the trigger decision                                                */
/* ------------------------------------------------------------------- */

/** Everything one scheduler tick needs, read fresh from the sim each frame. */
export interface ScareContext {
	/** The clock reading, ms (`performance.now()` origin). */
	now: number;
	/** When the next scare becomes due (from `firstScareAt`/`nextScareAt`). */
	nextAt: number;
	/** The sim's phase (spec §5): a scare only fires in `roam`. */
	phase: Phase;
	/** The sim's walk direction: `0` is idle, so a scare only fires while walking. */
	dir: Dir;
	/** The Bottega overlay — an open shop freezes play and blocks a scare. */
	shopOpen: boolean;
	/** True while a beat is already on screen — the "one at a time" bit. */
	active: boolean;
	/** The last kind shown, so the next one is never the same (`pickKind`). */
	prevKind: ScareKind | null;
}

/** What the caller should do after one `scareTick` call. */
export interface ScareDecision {
	/** The time the next scare becomes due (unchanged unless one just fired). */
	nextAt: number;
	/** The kind to show now, or `null` when none is due. */
	kind: ScareKind | null;
}

/**
 * The scare scheduler, one frame at `now` (ms).
 *
 * The prototype's `scareTick`/`scareNow` pair (`scene-prototype.html` ~1501-1526),
 * with the spec's triggers made explicit:
 *
 *   - **walking only** — nothing fires unless the sim is in `roam`, moving
 *     (`dir !== 0`), with the Bottega closed (spec §10: "only while freely
 *     walking (roam)"). A due moment that is not a walking moment is simply
 *     deferred — `nextAt` is left alone, exactly like the prototype leaving
 *     `lastScare` untouched when `scareNow` bailed;
 *   - **rate-limited** — nothing fires before `nextAt`; when one does fire the
 *     next is always re-armed to `now + [60 s, 120 s)`;
 *   - **one at a time** — `active` swallows a due tick, so a second cameo never
 *     rides over the first (the prototype's `ambienceLock`);
 *   - **no immediate repeat** — the kind comes from `pickKind(prevKind, …)`.
 *
 * The draw order is fixed for tests: the **gap** is drawn first, then the
 * **kind**. A tick that fires consumes exactly two `rng()` calls; a tick that
 * does not fire consumes none.
 */
export function scareTick(ctx: ScareContext, rng: Rng): ScareDecision {
	if (ctx.active) return { nextAt: ctx.nextAt, kind: null };
	if (ctx.now < ctx.nextAt) return { nextAt: ctx.nextAt, kind: null };
	if (ctx.shopOpen || ctx.phase !== 'roam' || ctx.dir === 0) {
		return { nextAt: ctx.nextAt, kind: null };
	}
	const nextAt = nextScareAt(ctx.now, rng);
	const kind = pickKind(ctx.prevKind, rng);
	return { nextAt, kind };
}

/* ------------------------------------------------------------------- */
/* the kids beat                                                       */
/* ------------------------------------------------------------------- */

/** The container class armed once on `.kids` (prototype `.scares-armed`). */
export const SCARE_ARMED_CLASS = 'scares-armed';
/** The container class held for the length of the beat (prototype `.scares-stop`). */
export const SCARE_STOP_CLASS = 'scares-stop';

/** The four per-child beat classes, prototype-exact (`pieces/scares.js` ~127-150). */
export type BeatClass = 'scare-hug' | 'scare-tremble' | 'scare-peek' | 'scare-giggle';

/** One step of the kids beat: classes to add and to take away at `at` ms. */
export interface BeatStep {
	/** Delay from the trigger, ms. */
	at: number;
	/** Classes to add to both `.tino` and `.milo`. */
	add: readonly BeatClass[];
	/** Classes to remove from both `.tino` and `.milo`. */
	remove: readonly BeatClass[];
}

/**
 * The kids beat, verbatim from the prototype's `trigger()` timers
 * (`pieces/scares.js` ~504-520): stop → hug (60) → tremble (120) → peek (1400)
 * → giggle (1900) → release (2500). `Scares.svelte` schedules exactly this and
 * calls `onScare(false)` at `SCARE_BEAT_MS`.
 */
export const SCARE_BEAT: readonly BeatStep[] = [
	{ at: 60, add: ['scare-hug'], remove: [] },
	{ at: 120, add: ['scare-tremble'], remove: [] },
	{ at: 1400, add: ['scare-peek'], remove: ['scare-tremble'] },
	{ at: 1900, add: ['scare-giggle'], remove: ['scare-peek', 'scare-hug'] }
];

/** The beat's whole life, ms — the moment `onScare(false)` releases the lock. */
export const SCARE_BEAT_MS = 2500;

/** Veil fade life (prototype `.scare-veil` `transition: opacity .45s`), ms. */
export const SCARE_VEIL_MS = 450;

/* ------------------------------------------------------------------- */
/* the cue + the callback contract                                     */
/* ------------------------------------------------------------------- */

/** The sound cue for a kind — the prototype's `'scare:' + kind` (~1512). */
export function scareCue(kind: ScareKind): string {
	return `scare:${kind}`;
}

/**
 * The `onScare(active)` contract the page wires (T24) and T23 will wire
 * (`duckAmbience`): `true` once at the trigger, `false` once at the beat end
 * (`SCARE_BEAT_MS`), and at most one `false` per `true`. While it is `true` the
 * page ignores walking input (the prototype's `ambienceLock`).
 */
export type OnScare = (active: boolean) => void;

/** The hooks `Scares.trigger` takes; both optional and best-effort. */
export interface ScareHooks {
	/** Called once per cameo with its `scare:*` cue name. */
	sound?(cue: string): void;
	/** The walking lock (T24) + the ambience duck (T23). */
	onScare?: OnScare;
}
