/**
 * The ambience engine (T23, spec §11) — per-neighborhood beds, sparse one-shot
 * sprinkles, and the −6 dB duck the trick shows and scary moments share.
 *
 * Port of the prototype's placeholder engine (`prototypes/scene-prototype.html`:
 * `AMB_THEMES` ~770, `ambInit` ~776, `atone` ~795, `AMB_DIPS` ~809, `ambFrame`
 * ~818), which is the *validated* source: the theme beds' filter/gain targets,
 * the seven sprinkle voices and the shape of the frame are lifted verbatim.
 * Two deliberate production changes:
 *
 * - **The duck is −6 dB, not the prototype's −9.9 dB.** The prototype ramps its
 *   master `.5 → .16`; spec §11 and T23 both say "ducks ~6 dB", so the bed's
 *   master drops by exactly `10 ** (-6/20) ≈ 0.5012` (`AMB_DUCK_FACTOR`).
 * - **The real SA3 loop is tried before the synth.** Spec: "Real loops arrive
 *   in the asset pass … the engine must run a SYNTH placeholder when a loop
 *   file is missing." `startAmbience`/theme changes probe
 *   `/ambience/<theme>.v1.mp3` once per theme; a 404 (today: every theme) or
 *   any throw simply keeps the synth running — no files are created here.
 *
 * **No context, no-op.** The AudioContext is lazy (created on the first user
 * gesture through `startAmbience`, spec §6 · Review Focus #1) and **every**
 * entry point is total: with no `AudioContext`, a `null` one, a hostile one or
 * a throwing `createGain`, the module silently does nothing and the game keeps
 * playing. `startAmbience()` before any gesture is silent, never an exception.
 *
 * **Where the numbers come from.** The frame reads the same seams the rest of
 * the app does: `themeFor(neighborhoodIndex(furthest()))` (progression),
 * `phase()` (the sim), `volumes().music` (T17's Music slider) and the settings
 * envelope's `sound` master toggle. It reads them per frame and never caches
 * game state, so a theme boundary mid-walk ramps the bed on the next rAF tick.
 *
 * **Self-driven.** Like `Npcs.svelte`, the engine owns its own rAF clock (the
 * page's loop belongs to the sim), so the page's wiring is two lines: import
 * the module and call `startAmbience()` in the existing first-gesture latch.
 * `ambienceFrame(now)` is exported so tests (and a future host) can drive one
 * tick by hand.
 */
import { themeFor, neighborhoodIndex } from '$lib/sim/progression';
import type { Theme } from '$lib/sim/progression';
import { furthest, phase } from '$lib/state/game.svelte';
import { settings } from '$lib/persist/settings';
import { volumes } from '$lib/audio/volumes.svelte';
import type { Phase } from '$lib/sim/loop';

/* ------------------------------------------------------------------ */
/* The mix constants (spec §11: the bed sits quietly under the music)  */
/* ------------------------------------------------------------------ */

/** The bed's unducked master ceiling — the prototype's `.5` (`ambFrame` ~829). */
export const AMB_MAX = 0.5;

/** How far the bed ducks on a show/scare (spec §11: "~6 dB"). */
export const AMB_DUCK_DB = 6;

/** The −6 dB linear factor, `10 ** (-6/20)` — exactly `≈ 0.5012`. */
export const AMB_DUCK_FACTOR = 10 ** (-AMB_DUCK_DB / 20);

/** The ducked master ceiling, `AMB_MAX * AMB_DUCK_FACTOR` (`≈ 0.2506`). */
export const AMB_DUCK_MAX = AMB_MAX * AMB_DUCK_FACTOR;

/** Shortest gap between two sprinkles — the "~20 s" floor (spec §11). */
export const AMB_SPRINKLE_MIN_MS = 20_000;

/** Longest gap between two sprinkles — the "~40 s" ceiling (spec §11). */
export const AMB_SPRINKLE_MAX_MS = 40_000;

/** Theme-change ramp time constant (prototype's `setTargetAtTime(…, 2)`). */
export const AMB_RAMP_S = 2;

/** Master duck/unduck ramp time constant (prototype's `.3`). */
export const AMB_MASTER_RAMP_S = 0.3;

/** How often the frame re-reads the `sound` master toggle from settings. */
const SOUND_POLL_MS = 500;

/* ------------------------------------------------------------------ */
/* The four beds (ported `AMB_THEMES`)                                 */
/* ------------------------------------------------------------------ */

/** The seven sprinkle voices (spec §11, ported `AMB_DIPS` keys). */
export const SPRINKLE_IDS = [
	'owl',
	'creak',
	'drip',
	'bell',
	'crow',
	'laugh',
	'leafrustle'
] as const;

/** One sprinkle voice. */
export type SprinkleId = (typeof SPRINKLE_IDS)[number];

/**
 * One synth tone of a sprinkle: the prototype's `atone(f1, f2, dur, type, vol,
 * delay, cutoff)` arguments, minus the context it plays on. `f2 === null` means
 * a fixed pitch (the prototype's `if (f2)`); `cutoff` adds a lowpass in front.
 */
export interface ToneEvent {
	f1: number;
	f2: number | null;
	dur: number;
	type: OscillatorType;
	vol: number;
	delay: number;
	cutoff?: number;
}

/** A neighborhood bed: its wind filter/gain targets and its favourite sprinkles. */
export interface AmbienceBed {
	theme: Theme;
	/** Lowpass cutoff of the wind bed, Hz (prototype `AMB_THEMES[].filt`). */
	filt: number;
	/** Wind bed gain into the master (prototype `AMB_THEMES[].gain`). */
	gain: number;
	/** The one-shots this bed favours (spec §11's per-neighborhood casts). */
	sprinkles: readonly SprinkleId[];
}

/**
 * The four beds, keyed by theme — **verbatim** from the prototype's
 * `AMB_THEMES`, in the `THEMES` rotation order: leafy (open wind + rustle),
 * foggy (brighter wind + drip/bell), pumpkin (dark wind + creak/crow), starry
 * (quiet + owl/laugh). `neighborhoodIndex` picks the bed; `themeFor` wraps it.
 */
export const AMB_BEDS: Record<Theme, AmbienceBed> = {
	leafy: { theme: 'leafy', filt: 380, gain: 0.052, sprinkles: ['owl', 'leafrustle'] },
	foggy: { theme: 'foggy', filt: 520, gain: 0.06, sprinkles: ['drip', 'bell', 'owl'] },
	pumpkin: { theme: 'pumpkin', filt: 300, gain: 0.055, sprinkles: ['creak', 'crow', 'owl'] },
	starry: { theme: 'starry', filt: 250, gain: 0.04, sprinkles: ['owl', 'laugh'] }
};

/**
 * The seven sprinkle voices, ported from `AMB_DIPS` (~809-817). Pure data: the
 * engine's `playSprinkle` schedules it, tests can assert on it, and nothing
 * here touches an AudioContext.
 */
export const AMB_SPRINKLES: Record<SprinkleId, readonly ToneEvent[]> = {
	owl: [
		{ f1: 360, f2: 310, dur: 0.28, type: 'sine', vol: 0.05, delay: 0 },
		{ f1: 350, f2: 300, dur: 0.24, type: 'sine', vol: 0.04, delay: 0.42 }
	],
	creak: [
		{ f1: 95, f2: 72, dur: 0.6, type: 'sawtooth', vol: 0.035, delay: 0, cutoff: 480 },
		{ f1: 88, f2: 66, dur: 0.5, type: 'sawtooth', vol: 0.025, delay: 0.35, cutoff: 420 }
	],
	drip: [
		{ f1: 880, f2: 590, dur: 0.12, type: 'sine', vol: 0.05, delay: 0 },
		{ f1: 880, f2: 590, dur: 0.1, type: 'sine', vol: 0.028, delay: 0.17 }
	],
	bell: [
		{ f1: 392, f2: null, dur: 0.9, type: 'triangle', vol: 0.035, delay: 0, cutoff: 1200 },
		{ f1: 587, f2: null, dur: 0.7, type: 'triangle', vol: 0.02, delay: 0.04, cutoff: 1200 }
	],
	crow: [
		{ f1: 760, f2: 520, dur: 0.16, type: 'sawtooth', vol: 0.03, delay: 0, cutoff: 900 },
		{ f1: 720, f2: 480, dur: 0.14, type: 'sawtooth', vol: 0.026, delay: 0.22, cutoff: 900 }
	],
	laugh: [
		{ f1: 600, f2: 540, dur: 0.09, type: 'triangle', vol: 0.035, delay: 0, cutoff: 1300 },
		{ f1: 530, f2: 470, dur: 0.09, type: 'triangle', vol: 0.035, delay: 0.12, cutoff: 1300 },
		{ f1: 460, f2: 400, dur: 0.09, type: 'triangle', vol: 0.035, delay: 0.24, cutoff: 1300 }
	],
	leafrustle: [
		{ f1: 1400, f2: 900, dur: 0.5, type: 'triangle', vol: 0.018, delay: 0, cutoff: 2600 },
		{ f1: 1200, f2: 800, dur: 0.4, type: 'triangle', vol: 0.015, delay: 0.3, cutoff: 2600 }
	]
};

/* ------------------------------------------------------------------ */
/* Pure logic: the numbers the tests pin                              */
/* ------------------------------------------------------------------ */

/** Clamp into the 0..1 gain band (a hostile slider value can never leak). */
function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/** The linear duck factor for a depth in dB (default {@link AMB_DUCK_DB}). */
export function duckFactor(db: number = AMB_DUCK_DB): number {
	return 10 ** (-Math.abs(db) / 20);
}

/** The bed for a theme (`AMB_BEDS` lookup, so tests can ask directly). */
export function bedFor(theme: Theme): AmbienceBed {
	return AMB_BEDS[theme];
}

/**
 * The bed the *current* progress selects — `themeFor(neighborhoodIndex(furthest()))`,
 * the exact chain order the spec names. Reads two reactive seams once.
 */
export function currentBed(): AmbienceBed {
	return AMB_BEDS[themeFor(neighborhoodIndex(furthest()))];
}

/**
 * The master gain target the frame (and `duckAmbience`) ramps toward:
 * `AMB_MAX * (ducked ? AMB_DUCK_FACTOR : 1) * music` when sound is on, `0` when
 * the master toggle is off. `music` is `volumes().music` — the Music slider
 * scales the whole bed linearly (spec §6/§13).
 */
export function ambienceMasterTarget(opts: {
	sound: boolean;
	ducked: boolean;
	music: number;
}): number {
	if (!opts.sound) return 0;
	const duck = opts.ducked ? AMB_DUCK_FACTOR : 1;
	return AMB_MAX * duck * clamp01(opts.music);
}

/**
 * Whether the bed is ducked right now: a trick show (`phase === 'trick'`,
 * spec §11) or a manual duck (`duckAmbience(true)`, T24's scary moments).
 */
export function isDucked(currentPhase: Phase, manualDuck: boolean): boolean {
	return currentPhase === 'trick' || manualDuck;
}

/**
 * The gap until the next sprinkle — uniform in `[20 s, 40 s)` (spec §11's
 * "every ~20–40 s"). `rng` is injectable so a test can pin the bounds; a
 * non-finite or out-of-band draw is clamped, never used raw.
 */
export function nextSprinkleGapMs(rng: () => number = Math.random): number {
	const draw = rng();
	const r = Number.isFinite(draw) ? clamp01(draw) : 0;
	return AMB_SPRINKLE_MIN_MS + r * (AMB_SPRINKLE_MAX_MS - AMB_SPRINKLE_MIN_MS);
}

/** The sprinkle a bed rolls for, using its own shortlist (`rng` injectable). */
export function pickSprinkle(bed: AmbienceBed, rng: () => number = Math.random): SprinkleId {
	const draw = rng();
	const r = Number.isFinite(draw) ? clamp01(draw) : 0;
	const at = Math.min(bed.sprinkles.length - 1, Math.floor(r * bed.sprinkles.length));
	return bed.sprinkles[at];
}

/**
 * Whether a sprinkle may fire this frame: sound on, not ducked, and only while
 * the kids roam or are being refused at a door (spec §11 / prototype ~831: the
 * bed never trills over a door/collect/trick beat), and only when the cadence's
 * `dueAt` has passed. Pure — the caller owns the clock and the next `dueAt`.
 */
export function sprinkleAllowed(opts: {
	sound: boolean;
	ducked: boolean;
	phase: Phase;
	now: number;
	dueAt: number;
}): boolean {
	if (!opts.sound || opts.ducked) return false;
	if (opts.phase !== 'roam' && opts.phase !== 'refuse') return false;
	return opts.now >= opts.dueAt;
}

/** The URL a real studio loop would serve for a theme (T26; none exist yet). */
export function loopUrl(theme: Theme): string {
	return `/ambience/${theme}.v1.mp3`;
}

/**
 * Probes for a real loop, gracefully: `true` only for an OK response whose body
 * can be read. A 404 (every theme today), a network failure, a hostile fetcher
 * or an abort all answer `false` and keep the synth in charge — never throwing.
 */
export async function probeLoop(
	theme: Theme,
	fetcher: typeof fetch = fetch
): Promise<ArrayBuffer | null> {
	try {
		const res = await fetcher(loopUrl(theme));
		if (!res.ok) return null;
		return await res.arrayBuffer();
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ */
/* The engine (lazy graph, self-driven frame)                          */
/* ------------------------------------------------------------------ */

/** The graph the engine builds once per context. */
interface AmbienceGraph {
	ctx: AudioContext;
	/** The bed's master — everything (wind, sprinkles, loops) lands here. */
	master: GainNode;
	/** The LFO-modulated wind lowpass (prototype's `filt`). */
	filter: BiquadFilterNode;
	/** The wind bed gain (prototype's `g`). */
	bed: GainNode;
	/** The synth noise source — muted when a real loop takes over. */
	noise: AudioBufferSourceNode;
}

let graph: AmbienceGraph | null = null;
/** The one adopted studio loop currently playing (T26); replaced on theme change. */
let loopSrc: AudioBufferSourceNode | null = null;
let running = false;
let raf: number | null = null;
let rafAvailable: ((cb: (t: number) => void) => number) | null = null;

/** The bed the graph is currently ramped to (the prototype's `amb.cur`). */
let latchedTheme: Theme | null = null;
/** The last master target written — the test/inspection read. */
let latchedMaster = 0;
/** Whether the last frame ducked. */
let latchedDucked = false;
/** `performance.now()` when the next sprinkle becomes due. */
let dueAt = Number.POSITIVE_INFINITY;

/** The manual duck latch (`duckAmbience`), OR-ed with `phase === 'trick'`. */
let manualDuck = false;

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

/** A 2 s white-noise buffer, the prototype's synth wind source (`ambInit` ~781). */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
	const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	return buf;
}

/**
 * Builds the graph: master → destination; looped noise → lowpass → bed gain →
 * master; two slow LFOs (the prototype's `l1`/`l2`) drifting the filter cutoff
 * and the bed gain so the wind breathes. Throws only where WebAudio does; the
 * caller swallows it and the engine stays a no-op.
 */
/* ------------------------------------------------------------------ */
/* the black-box counters (diagnostics/crashlog's heartbeat)           */
/* ------------------------------------------------------------------ */

/** Loop sources the module tracks as alive (wind, LFOs, adopted loop). */
let loopsLive = 0;
/** Cumulative loop starts this page. */
let loopsStarted = 0;
/** Cumulative stops (replacement, adoption, teardown). */
let loopsStopped = 0;
/** The synth wind's latch: adopted once, never double-counted. */
let windAlive = false;

function loopStarted(): void {
	loopsLive += 1;
	loopsStarted += 1;
}

function loopStopped(): void {
	loopsLive = Math.max(0, loopsLive - 1);
	loopsStopped += 1;
}

function buildGraph(ctx: AudioContext): AmbienceGraph {
	const master = ctx.createGain();
	master.gain.value = 0;
	master.connect(ctx.destination);

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = AMB_BEDS.leafy.filt;
	filter.Q.value = 0.7;

	const bed = ctx.createGain();
	bed.gain.value = AMB_BEDS.leafy.gain;

	const noise = ctx.createBufferSource();
	noise.buffer = noiseBuffer(ctx);
	noise.loop = true;
	noise.connect(filter);
	filter.connect(bed);
	bed.connect(master);
	noise.start();
	loopStarted();
	windAlive = true;

	const l1 = ctx.createOscillator();
	l1.frequency.value = 0.05;
	const lg1 = ctx.createGain();
	lg1.gain.value = 110;
	l1.connect(lg1);
	lg1.connect(filter.frequency);
	l1.start();
	loopStarted();

	const l2 = ctx.createOscillator();
	l2.frequency.value = 0.083;
	const lg2 = ctx.createGain();
	lg2.gain.value = 0.014;
	l2.connect(lg2);
	lg2.connect(bed.gain);
	l2.start();
	loopStarted();

	return { ctx, master, filter, bed, noise };
}

/** Schedules one sprinkle's tones into the master (the prototype's `atone`). */
function playSprinkle(id: SprinkleId): void {
	const g = graph;
	if (!g) return;
	for (const tone of AMB_SPRINKLES[id]) {
		try {
			const a = g.ctx;
			const t = a.currentTime + tone.delay;
			const osc = a.createOscillator();
			const gain = a.createGain();
			osc.type = tone.type;
			osc.frequency.setValueAtTime(tone.f1, t);
			if (tone.f2 !== null) osc.frequency.exponentialRampToValueAtTime(tone.f2, t + tone.dur);
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(tone.vol, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
			let out: AudioNode = gain;
			let lp: AudioNode | null = null;
			if (tone.cutoff !== undefined) {
				const f = a.createBiquadFilter();
				f.type = 'lowpass';
				f.frequency.value = tone.cutoff;
				gain.connect(f);
				out = f;
				lp = f;
			}
			osc.connect(gain);
			out.connect(g.master);
			osc.start(t);
			osc.stop(t + tone.dur + 0.03);
			// Disconnect the voice after its tail: WebKit keeps connected nodes
			// alive, and a night of sprinkles would accumulate them (the same
			// guard the SFX pack applies per cue, here per voice).
			const nodes: AudioNode[] = lp ? [osc, gain, lp] : [osc, gain];
			setTimeout(
				() => {
					for (const n of nodes) {
						try {
							n.disconnect();
						} catch {
							/* already gone */
						}
					}
				},
				Math.max(0, (t + tone.dur + 0.06 - a.currentTime) * 1000) + 250
			);
		} catch {
			// One bad tone must not silence the rest of the sprinkle.
		}
	}
}

/** Decodes a real studio loop and cross-fades the synth wind out (T26). */
async function adoptLoop(theme: Theme, bytes: ArrayBuffer): Promise<void> {
	const g = graph;
	if (!g || latchedTheme !== theme) return;
	try {
		const decoded = await g.ctx.decodeAudioData(bytes);
		if (!graph || latchedTheme !== theme) return;
		const src = g.ctx.createBufferSource();
		src.buffer = decoded;
		src.loop = true;
		src.connect(g.bed);
		src.start();
		loopStarted();
		// Replace any previously adopted loop: leaving it connected would layer
		// every theme forever AND retain each decoded ~10 MB buffer — a real
		// session crosses themes repeatedly (the iOS leak guard, applied to the
		// studio loops exactly as `sweepCue` applies it to the SFX pack).
		if (loopSrc && loopSrc !== src) {
			try {
				loopSrc.stop();
				loopStopped();
				loopSrc.disconnect();
			} catch {
				/* already gone */
			}
		}
		loopSrc = src;
		g.bed.gain.setTargetAtTime(AMB_BEDS[theme].gain, g.ctx.currentTime, AMB_MASTER_RAMP_S);
		if (windAlive) {
			try {
				g.noise.stop();
				g.noise.disconnect();
			} catch {
				/* already gone */
			}
			windAlive = false;
			loopStopped();
		}
	} catch {
		// A corrupt loop keeps the synth bed: nothing to do.
	}
}

/** Re-probes `/ambience/<theme>.v1.mp3`; a miss silently keeps the synth. */
function probeRealLoop(theme: Theme): void {
	void probeLoop(theme).then((bytes) => {
		if (bytes) void adoptLoop(theme, bytes);
	});
}

/** Ramps the master toward the current target (sound/duck/music). */
function applyMaster(): void {
	const g = graph;
	if (!g) return;
	const ducked = isDucked(phase(), manualDuck);
	const target = ambienceMasterTarget({
		sound: soundOn(nowMs()),
		ducked,
		music: volumes().music
	});
	try {
		g.master.gain.setTargetAtTime(target, g.ctx.currentTime, AMB_MASTER_RAMP_S);
	} catch {
		// A hostile param: the state latch below still records the intent.
	}
	latchedMaster = target;
	latchedDucked = ducked;
}

/**
 * One frame: retarget the bed on a theme change, ramp the master for
 * sound/duck/music, and fire a sprinkle when the cadence lets it. Total — the
 * whole body is guarded, so no hostile AudioContext can reach the game loop.
 */
export function ambienceFrame(now: number): void {
	const g = graph;
	if (!g) return;
	try {
		const bed = currentBed();
		if (bed.theme !== latchedTheme) {
			latchedTheme = bed.theme;
			g.filter.frequency.setTargetAtTime(bed.filt, g.ctx.currentTime, AMB_RAMP_S);
			g.bed.gain.setTargetAtTime(bed.gain, g.ctx.currentTime, AMB_RAMP_S);
			probeRealLoop(bed.theme);
		}

		const ducked = isDucked(phase(), manualDuck);
		const sound = soundOn(now);
		const target = ambienceMasterTarget({ sound, ducked, music: volumes().music });
		g.master.gain.setTargetAtTime(target, g.ctx.currentTime, AMB_MASTER_RAMP_S);
		latchedMaster = target;
		latchedDucked = ducked;

		if (sprinkleAllowed({ sound, ducked, phase: phase(), now, dueAt })) {
			dueAt = now + nextSprinkleGapMs();
			playSprinkle(pickSprinkle(bed));
		}
	} catch {
		// Never let an audio failure break the render loop.
	}
}

/** The self-driven clock: one frame, then schedule the next while running. */
function tick(now: number): void {
	ambienceFrame(now);
	raf = running && rafAvailable ? rafAvailable(tick) : null;
}

export interface StartAmbienceOptions {
	/** The context factory; defaults to the window's AudioContext (or `null`). */
	createContext?: () => AudioContext | null;
	/** The clock seed for the first sprinkle due time (tests pass `0`). */
	now?: number;
	/** Start the internal rAF loop (default `true`; tests drive frames by hand). */
	animate?: boolean;
}

/**
 * Starts the engine — the **first user gesture** entry point (spec §6 · Review
 * Focus #1). Creates the AudioContext lazily (silently no-ops where there is
 * none), builds the graph, resumes it after the gesture, seeds the sprinkle
 * cadence and (by default) starts the self-driven frame loop. Idempotent: a
 * second call while running does nothing.
 */
export function startAmbience(opts: StartAmbienceOptions = {}): void {
	if (running && graph) return;
	try {
		const ctx = (opts.createContext ?? defaultContext)();
		if (!ctx) return;
		graph = buildGraph(ctx);
		running = true;
		manualDuck = false;
		latchedTheme = null;
		soundCache = { at: Number.NEGATIVE_INFINITY, on: true };
		const now = opts.now ?? nowMs();
		dueAt = now + nextSprinkleGapMs();
		if (typeof ctx.resume === 'function') void ctx.resume().catch(() => {});
		ambienceFrame(now);
		if (opts.animate !== false) {
			rafAvailable = frameClock();
			raf = rafAvailable ? rafAvailable(tick) : null;
		}
	} catch {
		// No usable AudioContext: stay silent, never throw.
	}
}

/**
 * Tears the engine down: stops the frame loop, closes the context and forgets
 * the graph, so a later `startAmbience` builds a fresh one. Safe before any
 * `start` and safe twice; the page never needs it (the game lives one gesture
 * to one unload) but teardown and the unit tests do.
 */
export function stopAmbience(): void {
	running = false;
	if (raf !== null) {
		cancelFrame(raf);
		raf = null;
	}
	manualDuck = false;
	latchedDucked = false;
	latchedMaster = 0;
	if (loopSrc) {
		try {
			loopSrc.stop();
			loopStopped();
			loopSrc.disconnect();
		} catch {
			/* already gone */
		}
		loopSrc = null;
	}
	const g = graph;
	graph = null;
	if (g) {
		try {
			g.master.gain.setTargetAtTime(0, g.ctx.currentTime, AMB_MASTER_RAMP_S);
			if (typeof g.ctx.close === 'function') void g.ctx.close().catch(() => {});
		} catch {
			// A hostile context: dropping the graph is enough.
		}
	}
	// The context is gone (or the graph was dropped): every loop it held dies
	// with it, so the black box's live count lands back at zero by construction.
	loopsStopped += loopsLive;
	loopsLive = 0;
	windAlive = false;
}

/** A read-only snapshot for the black box (`diagnostics/crashlog`). */
export interface AmbienceStats {
	/** Loop sources alive right now (wind, the two LFOs, the adopted loop). */
	live: number;
	/** Cumulative loop starts this page. */
	started: number;
	/** Cumulative loop stops (replacements, adoption, teardown included). */
	stopped: number;
}

/** The ambience engine's loop counters (never throws). */
export function ambienceStats(): AmbienceStats {
	return { live: loopsLive, started: loopsStarted, stopped: loopsStopped };
}

/**
 * T24's duck seam — the scary moments share the show's −6 dB. Latches the flag
 * and (when a context exists) ramps the master immediately rather than waiting
 * for the next frame. `phase === 'trick'` is ducked automatically, so a show
 * needs no call; `off` releases only the manual latch.
 */
export function duckAmbience(on: boolean): void {
	manualDuck = !!on;
	applyMaster();
}

/** A read-only snapshot for tests, the smoke and a future debug overlay. */
export interface AmbienceInfo {
	/** Whether the engine believes it is playing. */
	running: boolean;
	/** The live context state (`running`/`suspended`), or `null` with no graph. */
	context: AudioContextState | null;
	/** The bed currently latched, or `null` before the first frame. */
	theme: Theme | null;
	/** The last master target the engine ramped to. */
	master: number;
	/** Whether the last target was ducked. */
	ducked: boolean;
	/** `performance.now()` the next sprinkle becomes due at. */
	dueAt: number;
}

/** The engine's current snapshot (never throws). */
export function ambienceInfo(): AmbienceInfo {
	return {
		running,
		context: graph ? graph.ctx.state : null,
		theme: latchedTheme,
		master: latchedMaster,
		ducked: latchedDucked,
		dueAt
	};
}
