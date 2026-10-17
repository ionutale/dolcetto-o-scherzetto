/**
 * The synth SFX pack (T27, spec §11) — the accepted 26-cue WebAudio engine
 * from `prototypes/pieces/sfx.js` (671 lines, hand-validated in Chrome), ported
 * **verbatim** to TypeScript behind one production seam, plus the prototype
 * host's owner-provided witch override.
 *
 * ## What is ported, and how faithfully
 *
 * The engine is copied essentially line-for-line: the lazy `AudioContext`, the
 * single master gain (the mute gate), the `resume()` promise discipline, the
 * `tone`/`noise` helpers (oscillators + gain envelopes + optional lowpass +
 * the `points`/`env`/`lfo` knobs; a throwaway white-noise buffer), and **every
 * cue's exact parameters** — the same frequencies, gains, attack times, delays
 * and additive contours the pack was accepted with. The per-cue design-intent
 * comments travel with the numbers ("audio taste lives there").
 *
 * Three deliberate production changes, all reported:
 *
 * 1. **The host's witch override lives here, not in a page.** The prototype's
 *    `snd()` (`prototypes/scene-prototype.html` ~759-766) intercepted
 *    `scare:witch` and played the owner file `sfx/scare-witch.v1.mp3` instead,
 *    falling back to the synth cue once the element raises `error`
 *    (`witchFileBroken`). `playCue('scare:witch')` reproduces exactly that:
 *    the file when it is healthy, the synth cue otherwise. The file's volume
 *    is the SFX slider (`volumes().sfx`), the prototype's `__vols.sfx`; a mute
 *    zeroes it.
 * 2. **The mute reads the device's one settings envelope.** The prototype's
 *    host early-returned on `!state.sound` *and* its engine gated on its own
 *    `enabled` flag. Here both collapse into the engine: `playCue` is silent
 *    while `setEnabled(false)` is latched **or** `settings.sound` is off (read
 *    on a short poll, the same memoised cadence `ambience.svelte.ts` uses). The
 *    master gain is zeroed the same way, so a mute also cuts a live cue.
 * 3. **`stopSfx()`/`sfxInfo()` teardown + inspection seams** join the public
 *    API so the unit suite and the smoke can drive one context and read the
 *    result, mirroring `ambience.svelte.ts`'s `stopAmbience`/`ambienceInfo`.
 *
 * ## Never throws, never spikes
 *
 * Every entry point is total: no `AudioContext`, a `null` one, a hostile one,
 * an unknown cue name, a broken witch file — all silent no-ops, never an
 * exception (spec §6 · Review Focus #1). Peaks stay inside the pack's
 * ≤ {@link SFX_PEAK} ceiling; the master gate is the only volume control.
 *
 * ## The cue contract
 *
 * {@link CUE_GROUPS} is the prototype's `GROUPS` listing and {@link CUE_NAMES}
 * its 26-name flattening (10 UI/foley · 10 theatre · 6 scares). The cue names
 * are the production contract (spec §16); they never change with this port.
 */
import { settings } from '$lib/persist/settings';
import { volumes } from '$lib/audio/volumes.svelte';

/* ------------------------------------------------------------------ */
/* the pack's public constants                                        */
/* ------------------------------------------------------------------ */

/** The owner-provided witch laugh — `scare:witch` plays this before the synth. */
export const SFX_WITCH_URL = '/sfx/scare-witch.v1.mp3';

/** The pack's self-imposed peak ceiling (spec §10: "peaks ≤ 0.18"). */
export const SFX_PEAK = 0.18;

/** How often the frame re-reads the `sound` master toggle from settings. */
const SOUND_POLL_MS = 500;

/**
 * The cue names, grouped exactly as the prototype's `GROUPS` (`pieces/sfx.js`
 * ~601): the UI/foley set, the theatre set (setup + one `fire:<id>` per trick +
 * the laugh) and the six scares.
 */
export const CUE_GROUPS = {
	ui: ['knock', 'pop', 'coin', 'twinkle', 'refuse', 'seen', 'buy', 'giggle', 'passer', 'stepLeaf'],
	theatre: [
		'theatre-setup',
		'fire:boo',
		'fire:ragnetto',
		'fire:serpente',
		'fire:cuscino',
		'fire:maschera',
		'fire:topolino',
		'fire:fantasmino',
		'fire:mano',
		'theatre-laugh'
	],
	scares: [
		'scare:witch',
		'scare:wolf',
		'scare:vampire',
		'scare:skeleton',
		'scare:mummy',
		'scare:thunder'
	]
} as const;

/** Every cue name, flattened (26) — the set T27's acceptance pins. */
export const CUE_NAMES = [...CUE_GROUPS.ui, ...CUE_GROUPS.theatre, ...CUE_GROUPS.scares] as const;

/** A cue name the pack can schedule. */
export type CueName = (typeof CUE_NAMES)[number];

/* ------------------------------------------------------------------ */
/* helper option shapes (the prototype's loose `o` objects, typed)     */
/* ------------------------------------------------------------------ */

/** One `<hz, offsetSeconds>` point of a multi-segment pitch glide. */
type Point = readonly [number, number];

/** `tone(a, f1, f2, dur, o)`'s options. */
interface ToneOpts {
	type?: OscillatorType;
	vol?: number;
	attack?: number;
	at?: number;
	cutoff?: number;
	cutoff2?: number;
	q?: number;
	points?: readonly Point[];
	lfo?: { rate: number; depth: number };
	lfo2?: number;
	env?: readonly Point[];
}

/** `noise(a, dur, o)`'s options. */
interface NoiseOpts {
	type?: BiquadFilterType;
	f?: number;
	f2?: number;
	q?: number;
	vol?: number;
	attack?: number;
	at?: number;
}

/** A cue is a function of the live context; it never throws (its body is guarded). */
type CueFn = (a: AudioContext) => void;

/* ------------------------------------------------------------------ */
/* module state                                                        */
/* ------------------------------------------------------------------ */

/** The lazily-created context, and the one master gain that gates everything. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** The mute flag (prototype `enabled`) and the 0..1 master level (`volume`). */
let enabled = true;
let volume = 1;

/** Context factory — the window's `AudioContext` by default; injectable. */
let createContext: () => AudioContext | null = defaultContext;
/** Audio-element factory — `new Audio(src)` by default; injectable for tests. */
let createAudio: (src: string) => HTMLAudioElement | null = defaultAudio;

/** The witch `<audio>` element and whether it has proven broken (`error`). */
let witchFile: HTMLAudioElement | null = null;
let witchFileBroken = false;

/** A memoised `settings.sound` read — the same 500 ms cadence T23 keeps. */
let soundCache = { at: Number.NEGATIVE_INFINITY, on: true };

/* ------------------------------------------------------------------ */
/* infrastructure — every helper swallows its own errors               */
/* ------------------------------------------------------------------ */

/** `performance.now()` where available, `Date.now()` as the last resort. */
function nowMs(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/** The window's AudioContext constructor, or `null` where there is none. */
function defaultContext(): AudioContext | null {
	try {
		if (typeof window === 'undefined') return null;
		// `Window` declares neither constructor, so read them off a cast shape
		// (Safari still ships the webkit-prefixed one).
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

/** The `Audio` constructor, or `null` where there is none (node, SSR). */
function defaultAudio(src: string): HTMLAudioElement | null {
	try {
		if (typeof Audio !== 'function') return null;
		return new Audio(src);
	} catch {
		return null;
	}
}

/** Lazily create the AudioContext. Safe to call any number of times. */
function ac(): AudioContext | null {
	if (ctx) return ctx;
	try {
		ctx = createContext();
	} catch {
		ctx = null;
	}
	return ctx;
}

/**
 * Browsers start contexts suspended until a gesture; `resume()` returns a
 * promise, so the rejection must be `.catch()`ed explicitly (a try/catch would
 * not see it and Chrome would log an unhandled rejection).
 */
function resume(a: AudioContext): void {
	try {
		if (a.state === 'suspended') {
			const p = a.resume();
			if (p && typeof p.catch === 'function') p.catch(() => {});
		}
	} catch {
		/* a hostile context: stay silent */
	}
}

/** The `sound` master toggle, memoised so a burst of cues does not parse settings 60×/s. */
function soundOn(now: number): boolean {
	if (now - soundCache.at >= SOUND_POLL_MS) {
		soundCache = { at: now, on: settings.read().sound !== false };
	}
	return soundCache.on;
}

/** The full gate: not muted by `setEnabled`, and the device's sound toggle is on. */
function gate(): boolean {
	return enabled && soundOn(nowMs());
}

/** The 0..1 slider level, clamped (a hostile caller can never leak a bad gain). */
function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/**
 * Everything hangs off one master gain, so a mute can cut a playing cue too.
 * The master's value is `gate() ? volume : 0` — the prototype's
 * `enabled ? volume : 0`, widened to include the settings mute.
 */
function sink(a: AudioContext): AudioNode {
	try {
		if (!master) {
			const m = a.createGain();
			m.gain.value = gate() ? volume : 0;
			m.connect(a.destination);
			master = m;
		}
		return master;
	} catch {
		return a.destination;
	}
}

/** Re-apply the gate to the live master and the witch element (best-effort). */
function applyMaster(): void {
	if (master) {
		try {
			master.gain.value = gate() ? volume : 0;
		} catch {
			/* a hostile param: the next sink() rebuilds it */
		}
	}
	applyWitchVolume();
}

/* ------------------------------------------------------------------ */
/* the per-cue node sweep (the iOS leak guard)                         */
/* ------------------------------------------------------------------ */

/**
 * Every node one cue creates, and the latest scheduled stop in it. Cues are
 * built synchronously inside `playCue`, so one shared pair is enough: `playCue`
 * resets them, the voice helpers register through `track()`, then `sweepCue`
 * disconnects the whole set shortly after the cue's last stop.
 *
 * Why: WebKit does not reliably collect nodes that stay *connected* to the
 * graph, and a real session creates ~40 nodes per home (a cue every few
 * seconds) — the known iOS "the tab dies after a few minutes and reloads"
 * failure. Disconnecting the tail is inaudible (everything in the set has
 * already stopped by then) and makes the cue's whole graph collectable.
 * The master gate from `sink()` is deliberately NOT in the set.
 */
let cueNodes: AudioNode[] = [];
let cueEnd = 0;

/** Register one node the current cue created, at the ctx time it goes quiet. */
function track(n: AudioNode, stopAt: number): void {
	cueNodes.push(n);
	if (stopAt > cueEnd) cueEnd = stopAt;
}

/**
 * Disconnect every node the finished cue created, a beat after its last stop.
 * Timers are plain `setTimeout`s and every call is guarded — a closed context
 * (or a hostile node) must never throw.
 */
function sweepCue(a: AudioContext): void {
	const nodes = cueNodes;
	if (!nodes.length) return;
	const ms = Math.max(0, (cueEnd - a.currentTime) * 1000) + 300;
	setTimeout(() => {
		for (const n of nodes) {
			try {
				n.disconnect();
			} catch {
				/* already gone (closed context / hostile node) */
			}
		}
	}, ms);
}

/**
 * One enveloped oscillator.
 *
 *   tone(a, f1, f2, dur, o)
 *     f1/f2    start / end Hz (exponential glide) — pass `f2 = null` for a held note
 *     points   [[hz, offsetSeconds], …] multi-segment glide (overrides `f2`)
 *     vol      peak gain (0.05–0.18 in this pack)     attack  seconds to the peak
 *     at       delay from "now"                       dur     seconds to full silence
 *     cutoff/cutoff2  lowpass Hz (optional sweep)     q       lowpass resonance
 *     lfo      { rate, depth } vibrato on the pitch   lfo2    depth at the end (decays)
 *     env      [[gain, offsetSeconds], …] ABSOLUTE gain contour (linear ramps) —
 *              overrides the default percussive shape and ignores vol/attack.
 */
function tone(a: AudioContext, f1: number, f2: number | null, dur: number, o: ToneOpts = {}): void {
	try {
		if (!(dur > 0)) dur = 0.05;
		const t = a.currentTime + (o.at || 0);
		const vol = o.vol == null ? 0.1 : Math.max(0.0002, o.vol);
		const atk = o.attack == null ? 0.012 : Math.min(o.attack, dur * 0.4);

		const osc = a.createOscillator();
		osc.type = o.type || 'sine';
		osc.frequency.setValueAtTime(Math.max(1, f1), t);
		if (o.points) {
			for (const p of o.points) {
				osc.frequency.exponentialRampToValueAtTime(Math.max(1, p[0]), t + p[1]);
			}
		} else if (f2 != null && f2 !== f1) {
			osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
		}

		const g = a.createGain();
		if (o.env) {
			// explicit contour: swell / hold / release
			g.gain.setValueAtTime(Math.max(0, o.env[0][0]), t + o.env[0][1]);
			for (let k = 1; k < o.env.length; k++) {
				g.gain.linearRampToValueAtTime(Math.max(0, o.env[k][0]), t + o.env[k][1]);
			}
		} else {
			// percussive envelope: up fast, down slow
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(vol, t + atk);
			g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		}

		let out: AudioNode = g;
		if (o.cutoff) {
			// optional lowpass = "hollow / mellow" knob
			const flt = a.createBiquadFilter();
			flt.type = 'lowpass';
			flt.frequency.setValueAtTime(Math.max(40, o.cutoff), t);
			if (o.cutoff2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff2), t + dur);
			if (o.q) flt.Q.value = o.q;
			g.connect(flt);
			out = flt;
			track(flt, t + dur + 0.06);
		}

		if (o.lfo) {
			// vibrato / wobble, added to the pitch
			const lo = a.createOscillator();
			lo.type = 'sine';
			lo.frequency.setValueAtTime(o.lfo.rate, t);
			const lg = a.createGain();
			lg.gain.setValueAtTime(o.lfo.depth, t);
			if (o.lfo2) lg.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.lfo2), t + dur);
			lo.connect(lg);
			lg.connect(osc.frequency);
			lo.start(t);
			lo.stop(t + dur + 0.05);
			track(lo, t + dur + 0.06);
			track(lg, t + dur + 0.06);
		}

		osc.connect(g);
		out.connect(sink(a));
		osc.start(t);
		osc.stop(t + dur + 0.05);
		track(osc, t + dur + 0.06);
		track(g, t + dur + 0.06);
	} catch {
		/* one bad tone must never silence the rest of the cue */
	}
}

/**
 * One enveloped, filtered burst of white noise from a throwaway buffer.
 *
 *   noise(a, dur, { type:'bandpass'|'highpass'|'lowpass', f, f2, q, vol, attack, at })
 */
function noise(a: AudioContext, dur: number, o: NoiseOpts = {}): void {
	try {
		if (!(dur > 0)) dur = 0.05;
		const t = a.currentTime + (o.at || 0);
		const vol = o.vol == null ? 0.06 : Math.max(0.0002, o.vol);
		const len = Math.max(1, Math.floor(a.sampleRate * dur));
		const buf = a.createBuffer(1, len, a.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

		const src = a.createBufferSource();
		src.buffer = buf;
		const g = a.createGain();
		const atk = Math.min(o.attack == null ? dur * 0.35 : o.attack, dur * 0.6);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + atk);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

		let out: AudioNode = g;
		if (o.type) {
			const f = a.createBiquadFilter();
			f.type = o.type;
			f.frequency.setValueAtTime(Math.max(40, o.f || 1000), t);
			if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t + dur);
			f.Q.value = o.q == null ? 0.9 : o.q;
			g.connect(f);
			out = f;
			track(f, t + dur + 0.05);
		}

		src.connect(g);
		out.connect(sink(a));
		src.start(t);
		src.stop(t + dur + 0.03);
		track(src, t + dur + 0.05);
		track(g, t + dur + 0.05);
	} catch {
		/* one bad burst must never silence the rest of the cue */
	}
}

/* ------------------------------------------------------------------ */
/* the cues — one design-intent comment above each                     */
/* (audio taste lives there; the numbers are the accepted pack)        */
/* ------------------------------------------------------------------ */

const CUES: Record<CueName, CueFn> = {
	/* ------------------------------ UI / foley ------------------------------ */

	// knock — a REAL warm wooden knock on a front door — chunky, firm and
	// friendly, never a beep and never alarming. Each hit stacks three layers:
	//   wood    bandpassed noise 430→300 Hz, Q 1.2, 55 ms, attack 3 ms, gain .070
	//   thump   sine 85→60 Hz body, 80 ms, attack 4 ms, gain .090
	//   click   bandpassed noise burst at 3 kHz, 4 ms, attack 1 ms, gain .018
	// hits at 0 / 0.16 / 0.32 s (third at 0.78 level) + a quieter 0.365 s echo
	// (0.36 level) as a tiny room tail. Layered worst-case sum stays ≤ .178.
	knock: (a) => {
		const hits: Point[] = [
			[0, 1],
			[0.16, 0.94],
			[0.32, 0.78],
			[0.365, 0.36]
		];
		for (const [at, v] of hits) {
			noise(a, 0.055, {
				type: 'bandpass',
				f: 430,
				f2: 300,
				q: 1.2,
				vol: 0.07 * v,
				attack: 0.003,
				at
			});
			tone(a, 85, 60, 0.08, { vol: 0.09 * v, attack: 0.004, at });
			noise(a, 0.004, { type: 'bandpass', f: 3000, q: 0.8, vol: 0.018 * v, attack: 0.001, at });
		}
	},

	// pop — UI bubble/panel popping open — snappy like the 0.22 s bubbles.
	//   sine 430→980 Hz up-chirp, 0.09 s, attack 4 ms, peak gain .13.
	pop: (a) => {
		tone(a, 430, 980, 0.09, { vol: 0.13, attack: 0.004 });
	},

	// coin — candy collected — warm two-step bell, instantly readable as "reward".
	//   triangle 1047→1319 Hz (0.07 s) then 1568 Hz held 0.14 s, attack 6–8 ms, peak .10.
	coin: (a) => {
		tone(a, 1047, 1319, 0.07, { type: 'triangle', vol: 0.1, attack: 0.006 });
		tone(a, 1568, null, 0.14, { type: 'triangle', vol: 0.1, attack: 0.008, at: 0.07 });
	},

	// twinkle — a candy settles into the pile with a soft sparkle.
	//   sine bells 1568 / 1976 / 2637 Hz, 0.2–0.24 s each, 0.06 s stagger,
	//   attack 20 ms, peak gains .07 / .06 / .05 — glitters, never pierces.
	twinkle: (a) => {
		tone(a, 1568, null, 0.24, { vol: 0.07, attack: 0.02 });
		tone(a, 1976, null, 0.22, { vol: 0.06, attack: 0.02, at: 0.06 });
		tone(a, 2637, null, 0.2, { vol: 0.05, attack: 0.02, at: 0.12 });
	},

	// refuse — "no candy tonight" — a shrug, not a buzzer; disappointment without sting.
	//   sine 349→233 Hz (F4→B3) glide down, 0.22 s, attack 10 ms, peak gain .08.
	refuse: (a) => {
		tone(a, 349, 233, 0.22, { vol: 0.08, attack: 0.01 });
	},

	// seen — playful "we've met already!" wiggle — friendly recognition, no scolding.
	//   sine 587→704 Hz (0.07 s) then 831→623 Hz (0.1 s), attack 6 ms, peaks .09 / .08.
	seen: (a) => {
		tone(a, 587, 704, 0.07, { vol: 0.09, attack: 0.006 });
		tone(a, 831, 623, 0.1, { vol: 0.08, attack: 0.006, at: 0.07 });
	},

	// buy — two-note purchase fanfare in the Bottega — small, cheerful, done in a breath.
	//   triangle 659 Hz (0.1 s) then 880 Hz (0.16 s), 0.11 s apart, attack 8–10 ms, peak .11.
	buy: (a) => {
		tone(a, 659, null, 0.1, { type: 'triangle', vol: 0.11, attack: 0.008 });
		tone(a, 880, null, 0.16, { type: 'triangle', vol: 0.11, attack: 0.01, at: 0.11 });
	},

	// giggle — a very cute kid giggle (hug-giggle beat) — six quick chirps that
	//   ALTERNATE contour (up / down / up …) so it bubbles instead of marching,
	//   with tiny breathy sprinkles between them and a bright snort-ish blip. ~0.58 s.
	giggle: (a) => {
		const at = [0, 0.09, 0.17, 0.26, 0.34, 0.42];
		const f = [700, 780, 720, 830, 760, 880];
		for (let i = 0; i < at.length; i++) {
			tone(a, f[i], f[i] * (i % 2 ? 0.8 : 1.25), 0.055, { vol: 0.085, attack: 0.005, at: at[i] });
		}
		const sp = [0.05, 0.21, 0.38];
		for (const s of sp)
			noise(a, 0.02, { type: 'highpass', f: 2000, vol: 0.02, attack: 0.004, at: s });
		tone(a, 900, 600, 0.06, { vol: 0.075, attack: 0.004, at: 0.5 });
		noise(a, 0.025, { type: 'bandpass', f: 1600, q: 1.4, vol: 0.02, attack: 0.003, at: 0.5 });
	},

	// passer — the rare far-lane car drifting past with a doppler-ish dip — ambience,
	//   never a hazard. Longest cue in the pack at 0.9 s, and quiet.
	//   bandpassed noise swell 0.9 s, filter 1500→450 Hz glide, Q .9, peak .06,
	//   plus a faint sine 180→138 Hz engine hum (lowpass 500 Hz, gain .025).
	passer: (a) => {
		noise(a, 0.9, { type: 'bandpass', f: 1500, f2: 450, q: 0.9, vol: 0.06, attack: 0.4 });
		tone(a, 180, 138, 0.9, { vol: 0.025, attack: 0.35, cutoff: 500 });
	},

	// stepLeaf — soft dry crunch for walking on leaf drifts — rustle, never a snap.
	//   highpass noise burst 0.14 s @ 3200 Hz (attack 6 ms, gain .05) plus a smaller
	//   second scrape 0.1 s @ 4800 Hz (gain .035) 0.04 s later, for texture.
	stepLeaf: (a) => {
		noise(a, 0.14, { type: 'highpass', f: 3200, vol: 0.05, attack: 0.006 });
		noise(a, 0.1, { type: 'highpass', f: 4800, vol: 0.035, attack: 0.006, at: 0.04 });
	},

	/* --------------------- theatre: setup / 8 tricks / laugh ---------------- */

	// theatre-setup — curtain-up shimmer as the spotlight dims and the props scale up.
	//   sine bells 1047 / 1319 / 1568 Hz, 0.3 s each, 0.07 s stagger, attack 20 ms,
	//   peak gains .065 / .055 / .05.
	'theatre-setup': (a) => {
		tone(a, 1047, null, 0.3, { vol: 0.065, attack: 0.02 });
		tone(a, 1319, null, 0.3, { vol: 0.055, attack: 0.02, at: 0.07 });
		tone(a, 1568, null, 0.3, { vol: 0.05, attack: 0.02, at: 0.14 });
	},

	// fire:boo — the ghost's proper hollow "boooo" — a voice with character,
	//   spooky-cute, never a roar or a beep. ~0.65 s. Owner-requested ~50 % louder
	//   than pass-#2 (original ×1.5): peak .162, inside the .18 ceiling.
	'fire:boo': (a) => {
		const contour: Point[] = [
			[298, 0.06],
			[232, 0.35],
			[210, 0.65]
		];
		const env: Point[] = [
			[0.03, 0],
			[0.1275, 0.09],
			[0.09, 0.4],
			[0.0001, 0.65]
		];
		noise(a, 0.012, { type: 'bandpass', f: 300, q: 1.6, vol: 0.0525, attack: 0.002 });
		tone(a, 330, null, 0.65, {
			type: 'triangle',
			env,
			cutoff: 1400,
			cutoff2: 580,
			points: contour,
			lfo: { rate: 7, depth: 18 },
			lfo2: 8
		});
		tone(a, 334.6, null, 0.65, {
			type: 'triangle',
			cutoff: 1400,
			cutoff2: 580,
			env: [
				[0.012, 0],
				[0.0675, 0.09],
				[0.045, 0.4],
				[0.0001, 0.65]
			],
			points: [
				[302, 0.06],
				[235, 0.35],
				[212.9, 0.65]
			],
			lfo: { rate: 7, depth: 20 },
			lfo2: 9
		});
	},

	// fire:ragnetto — the rubber spider's tiny ticks and skitter as it lowers onto
	//   the doorknob and dances — light and busy, never clicky-harsh.
	//   six square ticks 2600–3400 Hz, 0.025 s each, irregular 0.045–0.075 s spacing,
	//   lowpass 3500 Hz, peak .045 + a faint bandpassed-noise skitter (0.2 s, .03).
	'fire:ragnetto': (a) => {
		const at = [0, 0.045, 0.11, 0.16, 0.235, 0.31];
		const fq = [3200, 2600, 3400, 2900, 3300, 2700];
		for (let i = 0; i < at.length; i++) {
			tone(a, fq[i], null, 0.025, {
				type: 'square',
				vol: 0.045,
				attack: 0.003,
				cutoff: 3500,
				at: at[i]
			});
		}
		noise(a, 0.2, { type: 'bandpass', f: 3000, q: 1.2, vol: 0.03, attack: 0.05 });
	},

	// fire:serpente — the spring snake boing — pitch JUMPS UP out of the can, then
	//   the wobble settles. Peak energy on the way up reads "surprise!", not "alarm".
	//   triangle 190→900 Hz in 0.12 s, then 900→420→300 Hz over 0.48 s with a 13 Hz
	//   vibrato (±90 decaying to ±20), lowpass 2.6 kHz, peak .13.
	'fire:serpente': (a) => {
		tone(a, 190, null, 0.48, {
			type: 'triangle',
			vol: 0.13,
			attack: 0.006,
			cutoff: 2600,
			points: [
				[900, 0.12],
				[420, 0.3],
				[300, 0.48]
			],
			lfo: { rate: 13, depth: 90 },
			lfo2: 20
		});
	},

	// fire:cuscino — the noisy pillow's "prrrt" raspberry from under the mat —
	//   FUNNY, not gross: a buzzy saw body that visibly sputters, then a tiny
	//   embarrassed squeak as it runs out of air. ~0.55 s.
	'fire:cuscino': (a) => {
		tone(a, 95, null, 0.42, {
			type: 'sawtooth',
			cutoff: 650,
			points: [[70, 0.42]],
			lfo: { rate: 24, depth: 42 },
			env: [
				[0.015, 0],
				[0.1, 0.014],
				[0.03, 0.055],
				[0.1, 0.078],
				[0.025, 0.12],
				[0.095, 0.145],
				[0.02, 0.185],
				[0.085, 0.21],
				[0.015, 0.25],
				[0.07, 0.275],
				[0.012, 0.315],
				[0.05, 0.34],
				[0.0001, 0.42]
			]
		});
		tone(a, 900, 1500, 0.11, {
			type: 'triangle',
			vol: 0.075,
			attack: 0.008,
			cutoff: 2500,
			at: 0.44
		});
	},

	// fire:maschera — jump-scare-LITE mask sting — a soft blare that startles
	//   gently and resolves instantly. square dyad 210→196 Hz + 280→262 Hz struck
	//   together, 0.35 s, attack 15 ms, lowpass 900 Hz, peaks .092 / .073
	//   (measured worst case .17 after the lowpass bump — under the .18 ceiling).
	'fire:maschera': (a) => {
		tone(a, 210, 196, 0.35, { type: 'square', vol: 0.092, attack: 0.015, cutoff: 900 });
		tone(a, 280, 262, 0.35, { type: 'square', vol: 0.073, attack: 0.015, cutoff: 900 });
	},

	// fire:topolino — the wind-up mouse zipping across the floor — zippy toy energy.
	//   five triangle squeaks alternating 1250 / 1650 Hz, each a 0.05 s up-chirp
	//   (×1.3), 0.07 s apart, lowpass 3 kHz, peak .06 — rounded, never shrill.
	'fire:topolino': (a) => {
		for (let i = 0; i < 5; i++) {
			const f = i % 2 ? 1650 : 1250;
			tone(a, f, f * 1.3, 0.05, {
				type: 'triangle',
				vol: 0.06,
				attack: 0.005,
				cutoff: 3000,
				at: i * 0.07
			});
		}
	},

	// fire:fantasmino — the puppet ghost's airy whistle as it rises out of the
	//   bucket and bows — breathy and friendly, ends soft.
	//   sine 760→1150→820 Hz over 0.7 s with 5.5 Hz vibrato (±20), peak .07, plus a
	//   breath of bandpassed noise (0.6 s, 900→1400 Hz, gain .02).
	'fire:fantasmino': (a) => {
		tone(a, 760, null, 0.7, {
			vol: 0.07,
			attack: 0.05,
			points: [
				[1150, 0.35],
				[820, 0.7]
			],
			lfo: { rate: 5.5, depth: 20 }
		});
		noise(a, 0.6, { type: 'bandpass', f: 900, f2: 1400, q: 1.4, vol: 0.02, attack: 0.2 });
	},

	// fire:mano — the fuller furry-hand gag — slide out, TWO cheeky waves, a clap
	//   and a friendly "boop", finishing on a sparkle. The gag, not the grab. ~0.9 s.
	'fire:mano': (a) => {
		noise(a, 0.3, { type: 'bandpass', f: 400, f2: 1600, q: 1.1, vol: 0.055, attack: 0.12 });
		const bounce: Point[] = [
			[520, 0.06],
			[380, 0.16]
		];
		tone(a, 300, null, 0.18, {
			type: 'triangle',
			vol: 0.09,
			attack: 0.006,
			cutoff: 2600,
			at: 0.22,
			points: bounce,
			lfo: { rate: 13, depth: 26 },
			lfo2: 8
		});
		tone(a, 300, null, 0.18, {
			type: 'triangle',
			vol: 0.075,
			attack: 0.006,
			cutoff: 2600,
			at: 0.4,
			points: bounce,
			lfo: { rate: 13, depth: 26 },
			lfo2: 8
		});
		noise(a, 0.04, { type: 'bandpass', f: 900, q: 1.2, vol: 0.05, attack: 0.003, at: 0.58 });
		tone(a, 660, 990, 0.13, { vol: 0.085, attack: 0.008, at: 0.62 });
		tone(a, 1568, null, 0.18, { vol: 0.045, attack: 0.012, at: 0.76 });
		tone(a, 2093, null, 0.15, { vol: 0.032, attack: 0.012, at: 0.82 });
	},

	// theatre-laugh — a warm little AUDIENCE chuckle after the gag, not a row of
	//   beeps — two layers going "huh-huh-huh": a low soft "huh" and a higher
	//   giggle on top, both arcing slightly then fading DOWN. ~0.8 s; stacked ≤ .108.
	'theatre-laugh': (a) => {
		const at = [0, 0.115, 0.225, 0.335, 0.44, 0.545, 0.645];
		const lo = [265, 258, 250, 242, 234, 224, 215];
		const hi = [700, 682, 662, 640, 618, 590, 560];
		for (let i = 0; i < at.length; i++) {
			const fade = 1 - i * 0.1;
			tone(a, lo[i], null, 0.085, {
				vol: 0.06 * fade,
				attack: 0.01,
				cutoff: 1800,
				at: at[i],
				points: [
					[lo[i] * 1.1, 0.03],
					[lo[i] * 0.82, 0.085]
				],
				lfo: { rate: 9, depth: 14 }
			});
			tone(a, hi[i], null, 0.085, {
				type: 'triangle',
				vol: 0.048 * fade,
				attack: 0.008,
				cutoff: 1800,
				at: at[i],
				points: [
					[hi[i] * 1.1, 0.03],
					[hi[i] * 0.82, 0.085]
				],
				lfo: { rate: 9, depth: 18 }
			});
		}
	},

	/* ------------------------------- scares (§10) --------------------------- */

	// scare:witch — an EVIL cartoon witch laugh in two rounds — literally "hahaha
	//   hahaha", delightfully mean so a 7-year-old grins instead of flinching. ~1.30 s.
	//   (The prototype host prefers the owner file for this cue; see playCue.)
	'scare:witch': (a) => {
		const at = [0, 0.11, 0.22, 0.33, 0.44, 0.64, 0.74, 0.84, 0.94];
		const fq = [760, 740, 720, 700, 680, 735, 720, 705, 690];
		const det = Math.pow(2, 9 / 1200); // +9 cents — the faint chorus layer
		for (let i = 0; i < at.length; i++) {
			const f = fq[i];
			const fd = f * det;
			tone(a, f, null, 0.08, {
				type: 'sawtooth',
				cutoff: 2200,
				at: at[i],
				points: [
					[f * 0.68, 0.028],
					[f * 0.62, 0.08]
				],
				env: [
					[0, 0],
					[0.11, 0.03],
					[0.05, 0.058],
					[0.0001, 0.08]
				]
			});
			tone(a, fd, null, 0.08, {
				type: 'triangle',
				cutoff: 2200,
				at: at[i],
				points: [
					[fd * 0.68, 0.028],
					[fd * 0.62, 0.08]
				],
				env: [
					[0, 0],
					[0.035, 0.03],
					[0.016, 0.058],
					[0.0001, 0.08]
				]
			});
		}
		// the held "haaah" — rises then falls, with a 7–9 Hz vibrato on top
		tone(a, 680, null, 0.24, {
			type: 'sawtooth',
			cutoff: 2200,
			at: 1.06,
			points: [
				[840, 0.1],
				[545, 0.24]
			],
			lfo: { rate: 8, depth: 26 },
			lfo2: 10,
			env: [
				[0, 0],
				[0.11, 0.035],
				[0.11, 0.145],
				[0.055, 0.2],
				[0.0001, 0.24]
			]
		});
		tone(a, 680 * det, null, 0.24, {
			type: 'triangle',
			cutoff: 2200,
			at: 1.06,
			points: [
				[840 * det, 0.1],
				[545 * det, 0.24]
			],
			lfo: { rate: 8, depth: 27 },
			lfo2: 11,
			env: [
				[0, 0],
				[0.035, 0.035],
				[0.035, 0.145],
				[0.017, 0.2],
				[0.0001, 0.24]
			]
		});
	},

	// scare:wolf — a real cartoon howl across the yard — a friendly dog, not a
	//   beast. Three-part ooo–ooo–WAAA on a triangle body: 220→300→480→260 Hz over
	//   1.2 s, 5 Hz vibrato (±12), an amplitude SWELL into the WAAA at t=0.75 s,
	//   then a decaying tail. Lowpass 1.6 kHz. Breath + a detuned sine partner.
	'scare:wolf': (a) => {
		noise(a, 0.08, { type: 'bandpass', f: 300, f2: 900, q: 1, vol: 0.03, attack: 0.03 });
		const env: Point[] = [
			[0.01, 0],
			[0.055, 0.3],
			[0.115, 0.75],
			[0.045, 1],
			[0.0001, 1.2]
		];
		tone(a, 220, null, 1.2, {
			type: 'triangle',
			env,
			cutoff: 1600,
			points: [
				[300, 0.35],
				[480, 0.75],
				[260, 1.2]
			],
			lfo: { rate: 5, depth: 12 }
		});
		tone(a, 221.5, null, 1.2, {
			type: 'sine',
			env: [
				[0.003, 0],
				[0.017, 0.3],
				[0.035, 0.75],
				[0.013, 1],
				[0.0001, 1.2]
			],
			cutoff: 1400,
			points: [
				[302, 0.35],
				[483, 0.75],
				[262, 1.2]
			],
			lfo: { rate: 5, depth: 10 }
		});
	},

	// scare:vampire — polite Conte Vlad's mellow pipe-organ sting — a solemn
	//   curtsy, round and slightly grand, zero shriek. One held chord, no trill.
	//   four stacked partials 98.4 / 146.5 / 196.6 / 293.3 Hz, all lowpassed 900 Hz,
	//   plus a very quiet 60.5 Hz sine sub. 40 ms attack → hold to 1.24 s → long
	//   0.8 s release, total ~2.0 s. Gains sum .178.
	'scare:vampire': (a) => {
		const partials: ReadonlyArray<readonly [number, OscillatorType, number]> = [
			[98.4, 'triangle', 0.062],
			[146.5, 'square', 0.042],
			[196.6, 'triangle', 0.036],
			[293.3, 'square', 0.024]
		];
		for (const [hz, type, gain] of partials) {
			tone(a, hz, null, 2, {
				type,
				cutoff: 900,
				env: [
					[0, 0],
					[gain, 0.04],
					[gain, 1.24],
					[0, 2]
				]
			});
		}
		tone(a, 60.5, null, 2, {
			type: 'sine',
			cutoff: 200,
			env: [
				[0, 0],
				[0.014, 0.04],
				[0.014, 1.24],
				[0, 2]
			]
		});
	},

	// scare:skeleton — a nervous bone-rattle cameo — the skeleton shivers itself
	//   awake, then gives a little settling shiver. Woody and busy, never
	//   clattery-loud. ~0.6 s. 11 short bandpassed-noise tick bursts (750–1150 Hz,
	//   Q 2, 20 ms) in an irregular shivering rhythm, each with a faint 190 Hz
	//   triangle knock under it. Filtered-noise peaks are stochastic (≤ .12).
	'scare:skeleton': (a) => {
		const at = [0, 0.035, 0.07, 0.095, 0.14, 0.175, 0.21, 0.26, 0.3, 0.335, 0.39];
		const fq = [820, 1050, 900, 1150, 860, 1000, 780, 1080, 940, 1120, 880];
		const lv = [0.065, 0.081, 0.072, 0.095, 0.076, 0.088, 0.068, 0.091, 0.078, 0.086, 0.065];
		for (let i = 0; i < at.length; i++) {
			noise(a, 0.02, { type: 'bandpass', f: fq[i], q: 2, vol: lv[i], attack: 0.002, at: at[i] });
			tone(a, 190, null, 0.035, {
				type: 'triangle',
				vol: 0.025,
				attack: 0.002,
				cutoff: 900,
				at: at[i]
			});
		}
		noise(a, 0.16, { type: 'bandpass', f: 700, q: 1.1, vol: 0.04, attack: 0.02, at: 0.42 });
		tone(a, 165, 140, 0.14, { type: 'triangle', vol: 0.022, attack: 0.01, cutoff: 700, at: 0.42 });
	},

	// scare:mummy — a soft muffled moan cameo — bandaged, drowsy, a bit comic;
	//   gentle and slightly bored rather than spooky. ~0.9 s. Low triangle
	//   180→145 Hz through a HEAVY 400 Hz lowpass, slow 4.5 Hz vibrato (±9),
	//   amplitude swelling via `env`, plus a quieter 2× nasal partial and a
	//   lowpassed-noise breath bed.
	'scare:mummy': (a) => {
		noise(a, 0.9, { type: 'lowpass', f: 900, f2: 500, vol: 0.03, attack: 0.25 });
		tone(a, 180, 145, 0.9, {
			type: 'triangle',
			cutoff: 400,
			lfo: { rate: 4.5, depth: 9 },
			env: [
				[0.012, 0],
				[0.075, 0.35],
				[0.05, 0.62],
				[0.0001, 0.9]
			]
		});
		tone(a, 360, 290, 0.9, {
			type: 'triangle',
			cutoff: 500,
			lfo: { rate: 4.5, depth: 16 },
			env: [
				[0.004, 0],
				[0.022, 0.35],
				[0.015, 0.62],
				[0.0001, 0.9]
			]
		});
	},

	// scare:thunder — the storm cameo that accompanies a single soft lightning
	//   flash — distant and rounded, the kind of thunder that makes you look up,
	//   never a jolt. ~1.8 s. Soft crack + three overlapping rumble swells, a
	//   matching three-swell mids layer an octave up, and a felt 60→48 Hz body.
	'scare:thunder': (a) => {
		noise(a, 0.12, { type: 'bandpass', f: 1200, q: 1.5, vol: 0.08, attack: 0.008, at: 0.02 });
		noise(a, 0.2, { type: 'bandpass', f: 500, q: 1.2, vol: 0.045, attack: 0.012, at: 0.02 });
		noise(a, 0.9, { type: 'lowpass', f: 200, f2: 150, vol: 0.15, attack: 0.35, at: 0.08 });
		noise(a, 0.7, { type: 'lowpass', f: 190, f2: 145, vol: 0.1, attack: 0.25, at: 0.55 });
		noise(a, 0.5, { type: 'lowpass', f: 180, f2: 140, vol: 0.06, attack: 0.18, at: 1.05 });
		noise(a, 0.85, { type: 'lowpass', f: 400, f2: 300, vol: 0.07, attack: 0.32, at: 0.1 });
		noise(a, 0.65, { type: 'lowpass', f: 380, f2: 290, vol: 0.045, attack: 0.24, at: 0.57 });
		noise(a, 0.45, { type: 'lowpass', f: 360, f2: 280, vol: 0.028, attack: 0.16, at: 1.07 });
		tone(a, 60, 48, 1.5, { vol: 0.05, attack: 0.3, cutoff: 220 });
	}
};

/* ------------------------------------------------------------------ */
/* the witch override (the prototype host's `witchFile`)               */
/* ------------------------------------------------------------------ */

/** The witch element's volume: the SFX slider, zeroed under a mute. */
function applyWitchVolume(): void {
	if (!witchFile) return;
	try {
		witchFile.volume = gate() ? clamp01(volumes().sfx) : 0;
	} catch {
		/* a hostile element: leave the volume alone */
	}
}

/** Lazily build the owner-file element; `error` flips it to broken (synth fallback). */
function ensureWitchFile(): HTMLAudioElement | null {
	if (witchFile) return witchFile;
	try {
		const el = createAudio(SFX_WITCH_URL);
		if (!el) return null;
		el.preload = 'auto';
		el.volume = 1;
		el.addEventListener('error', () => {
			witchFileBroken = true;
		});
		witchFile = el;
		return el;
	} catch {
		return null;
	}
}

/**
 * Play the owner witch file — the prototype's `playWitchFile()`: the SFX slider
 * volume, rewind, `play()` with its rejection swallowed. Returns `false` when
 * the element cannot even be built (so the caller can fall back to the synth).
 */
function playWitchFile(): boolean {
	const el = ensureWitchFile();
	if (!el) return false;
	try {
		el.volume = gate() ? clamp01(volumes().sfx) : 0;
		el.currentTime = 0;
		const p = el.play();
		if (p && typeof p.catch === 'function') p.catch(() => {});
		return true;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Options for {@link initSfx} — the context/element factories (tests inject them). */
export interface InitSfxOptions {
	/** The context factory; defaults to the window's AudioContext (or `null`). */
	createContext?: () => AudioContext | null;
	/** The audio-element factory; defaults to `new Audio(src)`. */
	createAudio?: (src: string) => HTMLAudioElement | null;
}

/**
 * Call from a user gesture (spec §6 · Review Focus #1). Creates/resumes the
 * AudioContext and builds the master gain. Idempotent; never throws; returns
 * `false` where there is no usable context (node, SSR, a hostile factory).
 */
export function initSfx(opts: InitSfxOptions = {}): boolean {
	try {
		if (opts.createContext) createContext = opts.createContext;
		if (opts.createAudio) createAudio = opts.createAudio;
		soundCache = { at: Number.NEGATIVE_INFINITY, on: true };
		const a = ac();
		if (!a) return false;
		resume(a);
		sink(a); // build the master gate on this gesture
		applyMaster();
		return true;
	} catch {
		return false;
	}
}

/**
 * Play a cue by name. Self-initializes if {@link initSfx} was never called.
 * Returns `true` only if a cue was actually scheduled. Never throws. A mute
 * (either latch) is a silent `false`. `scare:witch` prefers the owner file
 * {@link SFX_WITCH_URL} and falls back to the synth cue once the file errors.
 */
export function playCue(name: string): boolean {
	try {
		if (!gate()) return false;
		if (name === 'scare:witch' && !witchFileBroken) {
			if (playWitchFile()) return true;
			// No element to play: fall through to the synth cue below.
		}
		const cue = (CUES as Record<string, CueFn | undefined>)[name];
		if (!cue) return false;
		const a = ac();
		if (!a) return false;
		resume(a);
		applyMaster(); // a settings mute may have flipped since the last cue
		cueNodes = [];
		cueEnd = 0;
		cue(a);
		sweepCue(a);
		return true;
	} catch {
		return false;
	}
}

/**
 * The master mute (the prototype's `setEnabled`): `false` silences every future
 * cue **and** zeroes the live master gain, so it cuts a sound already playing.
 * Returns the latched flag.
 */
export function setEnabled(v: boolean): boolean {
	enabled = !!v;
	applyMaster();
	return enabled;
}

/**
 * Set the 0..1 master level — the SFX slider. Never throws; clamps a finite
 * value and repairs a non-finite one to `1` (the prototype's `setVolume`).
 */
export function setSfxVolume(v: number): number {
	const n = Number(v);
	volume = Number.isFinite(n) ? clamp01(n) : 1;
	applyMaster();
	return volume;
}

/**
 * Tear the engine down: close the context and forget the graph, the witch
 * element and the injected factories, so a later {@link initSfx} builds fresh.
 * Safe before any `initSfx` and safe twice; the page needs it only for tests
 * and the smoke.
 */
export function stopSfx(): void {
	const a = ctx;
	ctx = null;
	master = null;
	witchFile = null;
	witchFileBroken = false;
	enabled = true;
	volume = 1;
	soundCache = { at: Number.NEGATIVE_INFINITY, on: true };
	createContext = defaultContext;
	createAudio = defaultAudio;
	if (a) {
		try {
			if (typeof a.close === 'function') void a.close().catch(() => {});
		} catch {
			/* a hostile context: dropping it is enough */
		}
	}
}

/** A read-only snapshot for tests, the smoke and a future debug overlay. */
export interface SfxInfo {
	/** Whether a context exists (i.e. a gesture has initialised, or a cue self-inited). */
	ready: boolean;
	/** The live context state, or `null` with no context. */
	context: AudioContextState | null;
	/** The mute latch (`setEnabled`). */
	enabled: boolean;
	/** The 0..1 master level. */
	volume: number;
	/** The owner witch file's URL once its element is armed, else `null`. */
	witchSrc: string | null;
	/** Whether the owner witch file has raised `error` (synth fallback active). */
	witchFileBroken: boolean;
}

/** The engine's current snapshot (never throws). */
export function sfxInfo(): SfxInfo {
	return {
		ready: ctx !== null,
		context: ctx ? ctx.state : null,
		enabled,
		volume,
		witchSrc: witchFile ? SFX_WITCH_URL : null,
		witchFileBroken
	};
}
