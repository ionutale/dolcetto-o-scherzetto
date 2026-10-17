/**
 * The music engine (T25, spec §11) — the owner-provided street loop
 * **"A Winter's Night"**, decoded into WebAudio so the ~96 s track wraps
 * gap-free, with one master gain the frame ramps toward the owner's mix.
 *
 * Port of the prototype's music block (`prototypes/scene-prototype.html`: the
 * `new Audio(...)` element ~838, `musicStart()` ~861, `musicFrame(ducked)`
 * ~866) with one deliberate production change: the prototype streamed an
 * `<audio>` element and lerped `music.volume` toward its target by hand; here
 * the very same track is fetched, `decodeAudioData`d once and looped on an
 * `AudioBufferSourceNode`, and the target rides a single `GainNode` through
 * `setTargetAtTime`. Decoding is what makes the wrap gap-free on every device
 * (T25: "loops seamless (no click at wrap)") instead of trusting the media
 * element's own loop point.
 *
 * **The owner mix, verbatim.** `target = (!sound ? 0 : ducked ? 0.042 : 0.143)
 * × volumes().music` — base `MUSIC_MAX = 0.143` (spec §13), the show/scare duck
 * `MUSIC_DUCK_MAX = 0.042`, both scaled linearly by T17's Music slider. A show
 * (`phase() === 'trick'`, spec §11) ducks automatically; T24's scary moments
 * call `duckMusic(true)` — the same seam `duckAmbience` gives the bed.
 *
 * **The smoothing.** The prototype lerped 4 %/frame toward the target
 * (`v += (t − v) · 0.04`), i.e. a continuous time constant of
 * `Δt / −ln(1 − 0.04) ≈ 0.4 s` at 60 fps; `MUSIC_RAMP_S = 0.25` expresses that
 * same "quick, but never a click" settle as `setTargetAtTime`'s tau.
 *
 * **No context, no-op; any failure, no-op.** Like `ambience.svelte.ts`, the
 * AudioContext is lazy (created on the first gesture through `startMusic`,
 * spec §6 · Review Focus #1) and every entry point is total: no `AudioContext`,
 * a throwing factory, a 404, a corrupt buffer or a hostile param all leave the
 * engine silent — never an exception. `startMusic()` before a gesture is
 * silent, exactly like the ambience bed.
 *
 * **Self-driven.** The engine owns its own rAF clock (the page's loop belongs
 * to the sim), so the page's wiring is two lines: `startMusic()` in the
 * existing first-gesture latch and `duckMusic(on)` in `onScare`. `musicFrame`
 * is exported so tests (and a future host) can drive one tick by hand.
 */
import { phase } from '$lib/state/game.svelte';
import { settings } from '$lib/persist/settings';
import { volumes } from '$lib/audio/volumes.svelte';
import type { Phase } from '$lib/sim/loop';

/* ------------------------------------------------------------------ */
/* The mix constants (the owner-tuned numbers the tests pin)           */
/* ------------------------------------------------------------------ */

/** The versioned street loop (spec §11; the filename SW cache-busts). */
export const MUSIC_URL = '/music/a-winters-night.v1.mp3';

/** The unducked master — the owner-tuned base mix (spec §13, `0.143`). */
export const MUSIC_MAX = 0.143;

/** The ducked master — shows and scary moments (the prototype's `0.042`). */
export const MUSIC_DUCK_MAX = 0.042;

/**
 * Master ramp time constant (the prototype's per-frame `0.04` lerp, as a tau).
 * Short on purpose: a duck lands inside a ~2.5 s beat and a slider change is
 * heard at once, yet neither snaps (a click) or drags.
 */
export const MUSIC_RAMP_S = 0.25;

/** How often the frame re-reads the `sound` master toggle from settings. */
const SOUND_POLL_MS = 500;

/* ------------------------------------------------------------------ */
/* Pure logic: the numbers the tests pin                              */
/* ------------------------------------------------------------------ */

/** Clamp into the 0..1 gain band (a hostile slider value can never leak). */
function clamp01(value: number): number {
	// Repair a non-finite draw (a `NaN` would poison the gain param) to silence.
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

/**
 * The master gain target the frame (and `duckMusic`) ramps toward:
 * `(!sound ? 0 : ducked ? MUSIC_DUCK_MAX : MUSIC_MAX) × music`. `music` is
 * `volumes().music` — the Music slider scales the whole loop linearly
 * (spec §6/§13).
 */
export function musicTarget(opts: { sound: boolean; ducked: boolean; music: number }): number {
	if (!opts.sound) return 0;
	const base = opts.ducked ? MUSIC_DUCK_MAX : MUSIC_MAX;
	return base * clamp01(opts.music);
}

/**
 * Whether the loop is ducked right now: a trick show (`phase === 'trick'`,
 * spec §11) or a manual duck (`duckMusic(true)`, T24's scary moments).
 */
export function isMusicDucked(currentPhase: Phase, manualDuck: boolean): boolean {
	return currentPhase === 'trick' || manualDuck;
}

/* ------------------------------------------------------------------ */
/* The engine (lazy graph, self-driven frame)                          */
/* ------------------------------------------------------------------ */

/** The graph the engine builds once per context. */
interface MusicGraph {
	ctx: AudioContext;
	/** The one master gain every decoded loop lands in. */
	gain: GainNode;
	/** The looping source, present only once the buffer has decoded. */
	source: AudioBufferSourceNode | null;
}

let graph: MusicGraph | null = null;
let running = false;
let raf: number | null = null;
let rafAvailable: ((cb: (t: number) => void) => number) | null = null;

/** The manual duck latch (`duckMusic`), OR-ed with `phase === 'trick'`. */
let manualDuck = false;
/** The last master target written — the test/inspection read. */
let latchedTarget = 0;
/** Whether the last frame ducked. */
let latchedDucked = false;
/** Whether a decoded source has actually been started. */
let sourcePlaying = false;
/**
 * Bumped on every start/stop so a slow fetch/decode that resolves after the
 * graph was torn down (or replaced) drops its result instead of starting a
 * source into a dead context.
 */
let generation = 0;

/** The cached `sound` master toggle, re-read on the `SOUND_POLL_MS` cadence. */
let soundCache = { at: Number.NEGATIVE_INFINITY, on: true };

/** `performance.now()` where available, `Date.now()` as the last resort. */
function nowMs(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/** The frame clock the engine drives itself with, or `null` under node/SSR. */
function frameClock(): ((cb: (t: number) => void) => number) | null {
	if (typeof globalThis.requestAnimationFrame === 'function') {
		return (cb) => globalThis.requestAnimationFrame(cb);
	}
	return null;
}

/** `cancelAnimationFrame` where it exists (the frame clock always pairs with it). */
function cancelFrame(handle: number): void {
	if (typeof globalThis.cancelAnimationFrame === 'function')
		globalThis.cancelAnimationFrame(handle);
}

/** The window's AudioContext constructor, or `null` where there is none. */
function defaultContext(): AudioContext | null {
	try {
		if (typeof window === 'undefined') return null;
		// `Window` does not declare either constructor, so read them off a cast
		// shape (Safari still ships the webkit-prefixed one).
		const w = window as unknown as {
			AudioContext?: typeof AudioContext;
			webkitAudioContext?: typeof AudioContext;
		};
		const Ctor = w.AudioContext ?? w.webkitAudioContext;
		if (typeof Ctor !== 'function') return null;
		return new Ctor();
	} catch {
		return null;
	}
}

/** The `sound` master toggle, memoised so the frame does not parse settings 60×/s. */
function soundOn(now: number): boolean {
	if (now - soundCache.at >= SOUND_POLL_MS) {
		soundCache = { at: now, on: settings.read().sound !== false };
	}
	return soundCache.on;
}

/**
 * Reads the loop's bytes, gracefully: `null` for a 404, a network failure, a
 * hostile fetcher or an unreadable body — never a throw.
 */
async function fetchLoop(fetcher: typeof fetch): Promise<ArrayBuffer | null> {
	try {
		const res = await fetcher(MUSIC_URL);
		if (!res.ok) return null;
		return await res.arrayBuffer();
	} catch {
		return null;
	}
}

/**
 * Fetches, decodes and starts the loop into the graph's master gain. The graph
 * is re-checked after every `await`, so a teardown (or a restart) mid-load
 * drops the result. A corrupt or unsupported buffer simply keeps the engine
 * silent: nothing to play, nothing to throw.
 */
async function loadLoop(fetcher: typeof fetch): Promise<void> {
	const g = graph;
	if (!g) return;
	const gen = generation;
	const bytes = await fetchLoop(fetcher);
	if (!bytes || graph !== g || generation !== gen) return;
	try {
		const decoded = await g.ctx.decodeAudioData(bytes);
		if (graph !== g || generation !== gen) return;
		const source = g.ctx.createBufferSource();
		source.buffer = decoded;
		source.loop = true; // gap-free wrap of the whole decoded buffer
		source.connect(g.gain);
		source.start();
		g.source = source;
		sourcePlaying = true;
	} catch {
		// A corrupt/undecodable loop: stay silent rather than break the game.
	}
}

/** Ramps the master toward the current target (sound/duck/music). */
function applyMusic(): void {
	const g = graph;
	if (!g) return;
	const ducked = isMusicDucked(phase(), manualDuck);
	const target = musicTarget({
		sound: soundOn(nowMs()),
		ducked,
		music: volumes().music
	});
	try {
		g.gain.gain.setTargetAtTime(target, g.ctx.currentTime, MUSIC_RAMP_S);
	} catch {
		// A hostile param: the state latch below still records the intent.
	}
	latchedTarget = target;
	latchedDucked = ducked;
}

/**
 * One frame: ramp the master for sound/duck/music. Total — the whole body is
 * guarded, so no hostile AudioContext can reach the render loop.
 */
export function musicFrame(now: number): void {
	const g = graph;
	if (!g) return;
	try {
		const ducked = isMusicDucked(phase(), manualDuck);
		const target = musicTarget({
			sound: soundOn(now),
			ducked,
			music: volumes().music
		});
		g.gain.gain.setTargetAtTime(target, g.ctx.currentTime, MUSIC_RAMP_S);
		latchedTarget = target;
		latchedDucked = ducked;
	} catch {
		// Never let an audio failure break the render loop.
	}
}

/** The self-driven clock: one frame, then schedule the next while running. */
function tick(now: number): void {
	musicFrame(now);
	raf = running && rafAvailable ? rafAvailable(tick) : null;
}

export interface StartMusicOptions {
	/** The context factory; defaults to the window's AudioContext (or `null`). */
	createContext?: () => AudioContext | null;
	/** The bytes fetcher; defaults to the global `fetch` (or none). */
	fetcher?: typeof fetch;
	/** Start the internal rAF loop (default `true`; tests drive frames by hand). */
	animate?: boolean;
}

/**
 * Starts the engine — the **first user gesture** entry point (spec §6 · Review
 * Focus #1). Creates the AudioContext lazily (silently no-ops where there is
 * none), builds the master gain, resumes the context after the gesture, kicks
 * off the fetch+decode of the loop and (by default) starts the self-driven
 * frame loop. Idempotent: a second call while running does nothing.
 */
export function startMusic(opts: StartMusicOptions = {}): void {
	if (running && graph) return;
	try {
		const ctx = (opts.createContext ?? defaultContext)();
		if (!ctx) return;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(ctx.destination);
		graph = { ctx, gain, source: null };
		running = true;
		manualDuck = false;
		sourcePlaying = false;
		soundCache = { at: Number.NEGATIVE_INFINITY, on: true };
		generation++;
		if (typeof ctx.resume === 'function') void ctx.resume().catch(() => {});
		musicFrame(nowMs());
		const fetcher = opts.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
		if (fetcher) void loadLoop(fetcher);
		if (opts.animate !== false) {
			rafAvailable = frameClock();
			raf = rafAvailable ? rafAvailable(tick) : null;
		}
	} catch {
		// No usable AudioContext: stay silent, never throw.
	}
}

/**
 * Tears the engine down: stops the frame loop, stops the source, closes the
 * context and forgets the graph, so a later `startMusic` builds a fresh one.
 * Safe before any `start` and safe twice; the page leans on it only in its
 * mount teardown, but the unit tests and a future host drive it directly.
 */
export function stopMusic(): void {
	running = false;
	generation++;
	if (raf !== null) {
		cancelFrame(raf);
		raf = null;
	}
	manualDuck = false;
	latchedDucked = false;
	latchedTarget = 0;
	sourcePlaying = false;
	const g = graph;
	graph = null;
	if (g) {
		try {
			g.gain.gain.setTargetAtTime(0, g.ctx.currentTime, MUSIC_RAMP_S);
			if (g.source) {
				g.source.stop();
				g.source.disconnect();
			}
			if (typeof g.ctx.close === 'function') void g.ctx.close().catch(() => {});
		} catch {
			// A hostile context: dropping the graph is enough.
		}
	}
}

/**
 * T24's duck seam — the scary moments share the show's duck. Latches the flag
 * and (when a context exists) ramps the master immediately rather than waiting
 * for the next frame. `phase === 'trick'` is ducked automatically, so a show
 * needs no call; `off` releases only the manual latch.
 */
export function duckMusic(on: boolean): void {
	manualDuck = !!on;
	applyMusic();
}

/** A read-only snapshot for tests, the smoke and a future debug overlay. */
export interface MusicInfo {
	/** Whether the engine believes it is playing. */
	running: boolean;
	/** The live context state (`running`/`suspended`), or `null` with no graph. */
	context: AudioContextState | null;
	/** Whether a decoded source has actually been started. */
	playing: boolean;
	/** The last master target the engine ramped to. */
	target: number;
	/** Whether the last target was ducked. */
	ducked: boolean;
}

/** The engine's current snapshot (never throws). */
export function musicInfo(): MusicInfo {
	return {
		running,
		context: graph ? graph.ctx.state : null,
		playing: sourcePlaying,
		target: latchedTarget,
		ducked: latchedDucked
	};
}
