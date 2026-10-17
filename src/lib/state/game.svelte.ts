/**
 * The page's runes store — a thin, *non-owning* wrapper over the pure sim in
 * `../sim/loop.ts` (T05). One module instance holds the single `GameState`,
 * the page reads it through derived getters, and the input layer mutates it
 * only through `dispatch`.
 *
 * Nothing here reimplements game logic:
 *
 * - `dispatch(action)` **is** `reduce(state, action)` — same no-op fast paths,
 *   same `canWalk` guard inside (a WALK into a door/collect/trick phase, or
 *   into an open shop, is silently refused by the reducer, exactly as the
 *   prototype does it).
 * - `step(dt)` **is** `tick(state, clampedDt)` — one clamped sim tick, exposed
 *   so tests can drive the world without a browser frame.
 * - `start()` / `stop()` are the prototype's rAF loop (`frame()` in
 *   `prototypes/scene-prototype.html` ~line 1709) with the same
 *   `dt = Math.min(.05, (now - last) / 1000)` frame clamp, so a backgrounded
 *   tab, a GC pause or a test's raw `step(1)` can never teleport the kids.
 * - `canWalk()` *mirrors* the reducer's private guard for the control layer:
 *   WalkControls disables itself instead of dispatching into a phase that
 *   would refuse it (Review Focus #2 — held-button input must never disagree
 *   with the sim about whether the kids may walk).
 *
 * Reactivity: `state` is a deep `$state` proxy, so any read inside a page
 * render effect (a getter call in the template) subscribes that part of the
 * tree to the next tick — 60 fps of `tick` produce 60 fps of scene updates and
 * nothing else. `reduce`/`tick` never mutate the input (loop.ts pins that), so
 * assigning their result back is always safe, including the no-op case where
 * they return the very same object.
 *
 * Pure-sim rules live in `loop.ts` and are pinned by `loop.test.ts`; this
 * module is pinned by `game.test.ts` (walk speed, STOP, refused phases, the
 * frame clamp, and the start/stop lifecycle).
 */
import { initial, reduce, tick } from '../sim/loop';
import type { Action, Dir, GameState, Phase } from '../sim/loop';

/** Longest frame the sim digests — the prototype's `Math.min(.05, dt)`. */
const MAX_DT = 0.05;

/** Cadence used when `requestAnimationFrame` is missing (node, unit tests). */
const FRAME_FALLBACK_MS = 16;

/**
 * A frame handle. The browser's rAF id is a number, so the fallback timer is
 * cast into that shape on arrival and `cancelFrame` picks the right undo.
 */
type FrameHandle = number;

/** The whole sim state, deeply reactive. One instance for the whole page. */
let state = $state<GameState>(initial({}));

/** Single-loop latch: a second `start()` schedules nothing, `stop()` is safe. */
let running = false;
/** Handle of the frame currently scheduled (null while stopped). */
let handle: FrameHandle | null = null;
/** `performance.now()` of the previous frame — the dt origin. */
let last = 0;

/** Reads the current world scroll position (px) — feeds parallax + street. */
export function worldX(): number {
	return state.worldX;
}

/** Reads the current loop phase (spec §5) — drives knock/door/theatre UI. */
export function phase(): Phase {
	return state.phase;
}

/** Reads the walk direction: −1 left, 0 idle, 1 right (the kids' cycle). */
export function dir(): Dir {
	return state.dir;
}

/** Reads the house under the kids' feet, or −1 when out of every window. */
export function activeK(): number {
	return state.activeK;
}

/**
 * Mirror of `canWalk` in `loop.ts` (where it stays private and authoritative):
 * walking is allowed only while roaming (or refusing a door) and never with
 * the shop open. The input layer asks *this* before it presses, so it never
 * dispatches a WALK the reducer would throw away.
 */
export function canWalk(): boolean {
	return !state.shopOpen && (state.phase === 'roam' || state.phase === 'refuse');
}

/**
 * Applies one action through the sim's pure `reduce`. Refused actions change
 * nothing (same object back), which is the behaviour the input layer relies
 * on: dispatching STOP twice, or WALK into a frozen phase, is harmless.
 */
export function dispatch(action: Action): void {
	state = reduce(state, action);
}

/** One clamped tick: `dt` is seconds, clamped to `[0, MAX_DT]` first. */
export function step(dt: number): void {
	state = tick(state, Math.min(MAX_DT, Math.max(0, dt)));
}

/** `performance.now()` where available, `Date.now()` as the last resort. */
function nowMs(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Schedules the next frame: rAF in the browser (its timestamp shares the
 * `performance.now()` origin), a 16 ms timer under node so the loop still
 * exists in unit tests. Resolved on *every* call, so a test can stub the
 * globals around a single `start()`/`stop()` pair.
 */
function requestFrame(cb: (t: number) => void): FrameHandle {
	const raf = globalThis.requestAnimationFrame;
	if (typeof raf === 'function') return raf(cb);
	return setTimeout(() => cb(nowMs()), FRAME_FALLBACK_MS) as unknown as FrameHandle;
}

/** Undo for `requestFrame`, chosen the same way. */
function cancelFrame(frameHandle: FrameHandle): void {
	const caf = globalThis.cancelAnimationFrame;
	if (typeof caf === 'function') {
		caf(frameHandle);
		return;
	}
	clearTimeout(frameHandle as unknown as Parameters<typeof clearTimeout>[0]);
}

/** One loop iteration: digest the elapsed time, then ask for the next frame. */
function frame(now: number): void {
	// A frame scheduled before `stop()` may still arrive — it must not tick.
	if (!running) return;
	step((now - last) / 1000);
	last = now;
	handle = requestFrame(frame);
}

/**
 * Starts the rAF loop. Idempotent: while running, a second call is a no-op
 * (one loop, never two — a doubled loop would double the world speed).
 */
export function start(): void {
	if (running) return;
	running = true;
	last = nowMs();
	handle = requestFrame(frame);
}

/** Stops the loop. Idempotent: safe before any `start()` and safe twice. */
export function stop(): void {
	if (!running) return;
	running = false;
	if (handle !== null) {
		cancelFrame(handle);
		handle = null;
	}
}
