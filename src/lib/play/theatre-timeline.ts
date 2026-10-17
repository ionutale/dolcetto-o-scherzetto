/**
 * T14 — the trick theatre's **pure cue schedule**.
 *
 * The validated choreography lives in `prototypes/pieces/theatre.js` (622
 * lines, the accepted Mano-v2 pass). That file is imperative: it interleaves
 * `setTimeout`s, DOM motion and sound with the lifecycle callbacks, so the
 * *timing contract* (which cue fires when, when `onClimax`/`onDone` land) is
 * impossible to pin without a browser. This module lifts that contract out as
 * plain data — no DOM, no timers of its own — plus `runTimeline`, a tiny
 * runner that takes **injected** timers so a fake clock can drive it.
 *
 * `Theatre.svelte` consumes exactly this data for the transport (the veil
 * envelope, the three sound cues and the two hooks); the per-show DOM beats
 * stay in the component, unchanged.
 *
 * ## Where the numbers come from
 *
 * `start()` in the source anchors every timer at the moment it is called
 * (`t = 0`):
 *
 * | t (ms) | source                                    | step here          |
 * |--------|-------------------------------------------|--------------------|
 * | 0      | veil/spot/cone on + `sound('theatre-setup')` | `setup` (cue)   |
 * | 90     | `later(90, () => sf(o))` — show setup     | `setup`            |
 * | FIRE   | the gag's `sound('fire:<id>')`            | `fire` (cue)       |
 * | 1901   | `sound('theatre-laugh')` + `onClimax`     | `climax` (cue)     |
 * | 2402   | `onDone`                                  | `done`             |
 * | 2450   | `endShow()` — veil/spot/cone/props out    | component timer    |
 * | 3050   | `clearProps()` — fully clean              | component timer    |
 *
 * The 90 ms lead-in is why a trick's **gag** lands later than its source
 * constant: each show arms its gag *inside* `sf`, and `sf` runs at 90 ms. So
 * `boo`'s `later(760, …)` is `90 + 760 = 850 ms` from `start()`. The fire
 * table below holds both numbers so the source → port mapping stays visible.
 *
 * `THEATRE_CLIMAX_MS` / `THEATRE_DONE_MS` are pinned by the T14 task at
 * `1901` / `2402` (the source's `later(1900)` / `later(2400)` plus the task's
 * one-millisecond pins). They are the values the component and its tests use.
 */
import { TRICK_ORDER } from '../sim/loop';
import type { TrickId } from '../sim/loop';

/** Which beat of the show a step represents. */
export type TheatreStepKind = 'setup' | 'fire' | 'climax' | 'done';

/** A sound cue: the setup sting, the per-trick gag, or the laugh. */
export type TheatreCue = 'theatre-setup' | 'theatre-laugh' | `fire:${TrickId}`;

/** One timed beat, in ms from the moment the show starts. */
export interface TheatreStep {
	at: number;
	kind: TheatreStepKind;
	/** Present only on cue-bearing steps (setup sting, gag, laugh). */
	cue?: TheatreCue;
}

/**
 * Hooks `start()` accepts — all optional, mirroring the source's
 * `hooks` object (`sound(name)` / `onClimax(id)` / `onDone(id)`).
 */
export interface TheatreHooks {
	sound?(name: string): void;
	onClimax?(trickId: TrickId): void;
	onDone?(trickId: TrickId): void;
}

/** Source `later(90, () => sf(o))`: the show's own setup begins here. */
export const THEATRE_SETUP_LEAD_MS = 90;

/** Source `later(1900, …)`: the laugh + `onClimax`. Task-pinned to 1901. */
export const THEATRE_CLIMAX_MS = 1901;

/** Source `later(2400, …)`: `onDone`. Task-pinned to 2402. */
export const THEATRE_DONE_MS = 2402;

/** Source `later(2450, endShow)`: the veil/spot/cone/props begin to fade out. */
export const THEATRE_END_MS = 2450;

/** Source `later(3050, clearProps)`: fully clean (spec §7 "veil out ~3.0 s"). */
export const THEATRE_VEIL_OUT_MS = 3050;

/**
 * Each show's gag beat, in ms **after** the 90 ms setup call — lifted verbatim
 * from the `sound('fire:<id>')` line inside `SHOWS.<id>` in the source.
 */
export const THEATRE_GAG_AFTER_SETUP: Record<TrickId, number> = {
	boo: 760,
	ragnetto: 1040,
	serpente: 860,
	cuscino: 950,
	maschera: 360,
	topolino: 140,
	fantasmino: 220,
	mano: 890
};

/**
 * The gag cue's absolute time from `start()`, i.e. the setup lead plus the
 * show's own beat. This is the pin the component's `fire` step carries and the
 * one the tests assert:
 *
 * | trick      | gag after setup | fire from start |
 * |------------|-----------------|-----------------|
 * | boo        | 760             | 850             |
 * | ragnetto   | 1040            | 1130            |
 * | serpente   | 860             | 950             |
 * | cuscino    | 950             | 1040            |
 * | maschera   | 360             | 450             |
 * | topolino   | 140             | 230             |
 * | fantasmino | 220             | 310             |
 * | mano       | 890             | 980             |
 */
export const THEATRE_FIRE_AT: Record<TrickId, number> = Object.fromEntries(
	TRICK_ORDER.map((id): [TrickId, number] => [
		id,
		THEATRE_SETUP_LEAD_MS + THEATRE_GAG_AFTER_SETUP[id]
	])
) as Record<TrickId, number>;

/** The ordered steps of one show (setup → fire → climax → done). */
function stepsFor(id: TrickId): TheatreStep[] {
	return [
		{ at: 0, kind: 'setup', cue: 'theatre-setup' },
		{ at: THEATRE_SETUP_LEAD_MS, kind: 'setup' },
		{ at: THEATRE_FIRE_AT[id], kind: 'fire', cue: `fire:${id}` },
		{ at: THEATRE_CLIMAX_MS, kind: 'climax', cue: 'theatre-laugh' },
		{ at: THEATRE_DONE_MS, kind: 'done' }
	];
}

/** One ordered step list per sim trick id (`TRICK_ORDER`). */
export const THEATRE_TIMELINES: Record<TrickId, readonly TheatreStep[]> = Object.fromEntries(
	TRICK_ORDER.map((id): [TrickId, readonly TheatreStep[]] => [id, stepsFor(id)])
) as Record<TrickId, readonly TheatreStep[]>;

/** Injected timers for `runTimeline` — a fake clock in tests, the real ones on stage. */
export interface RunTimelineOptions {
	/** Monotonic clock, ms. */
	now: () => number;
	/** Scheduler, `setTimeout`-shaped. */
	setTimeoutFn: (fn: () => void, ms: number) => unknown;
	/** Optional cancel for the scheduler's handles (used by `cancel`). */
	clearTimeoutFn?: (handle: unknown) => void;
	/** Called once per step, in time order, while the run is live. */
	onStep: (step: TheatreStep) => void;
}

/** A live run — `cancel()` silences every step that has not fired yet. */
export interface TimelineRun {
	cancel(): void;
}

/**
 * Schedule every step against injected timers and report them through
 * `onStep`. Steps are emitted in time order regardless of input order; a step
 * whose `at` has already passed fires immediately. `cancel()` is idempotent
 * and guarantees no `onStep` after it (a fired-timer guard plus, when the
 * caller supplies `clearTimeoutFn`, unscheduled pending handles).
 */
export function runTimeline(steps: readonly TheatreStep[], opts: RunTimelineOptions): TimelineRun {
	const start = opts.now();
	const handles: unknown[] = [];
	let cancelled = false;

	for (const step of [...steps].sort((a, b) => a.at - b.at)) {
		const delay = Math.max(0, step.at - (opts.now() - start));
		handles.push(
			opts.setTimeoutFn(() => {
				if (cancelled) return;
				opts.onStep(step);
			}, delay)
		);
	}

	return {
		cancel(): void {
			if (cancelled) return;
			cancelled = true;
			if (opts.clearTimeoutFn) {
				for (const handle of handles) opts.clearTimeoutFn(handle);
			}
			handles.length = 0;
		}
	};
}
