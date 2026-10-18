/**
 * T28b — the voice-line playback seam (spec §11; VOICES.md §3/§6.2).
 *
 * The render (T28a) ships 74 clips — one per `voice/lines.<lang>.json` id, in
 * two language directories:
 *
 * ```
 * static/voice/<lang>/<id>.mp3      (lang ∈ it, en; id per VOICES.md §3)
 * ```
 *
 * The id scheme is **language-neutral** (`VOICES.md` §3): `shout` for the boys'
 * line, `<key>-<arch>` for the six archetype tables × six neighbours. The
 * language lives in the *directory*, exactly as `t(lang, key, arch)` keeps copy
 * apart from settings (`src/lib/i18n/lines.ts`). This module turns one
 * `say(lang, key, arch?)` call into the right clip and plays it.
 *
 * **Why a media element, not WebAudio.** Unlike the synth pack (T27) or the
 * decoded street loop (T25), a spoken line is a self-contained MP3 whose length
 * nobody has to duck or crossfade: an `<audio>` element plays it, streams it and
 * stops at its own end with no scheduling. One element per line is reused, so
 * re-saying the same line **rewinds it to 0** (the knock chain can land the
 * shout twice on a fast walk) rather than stacking overlapping copies.
 *
 * **Never throws, never spikes.** Every entry point is total: with no `Audio`
 * (node, SSR), a hostile element, no clip on disk or a rejected `play()`, the
 * call is a silent no-op — never an exception (spec §6 · Review Focus #1). The
 * element's `error` event is swallowed the same way, so a missing clip is
 * silence, not a console error and not a crash.
 *
 * **Volume and mute.** The clip's volume is T17's SFX slider
 * (`volumes().sfx`, clamped to 0..1) — the voice is an SFX-grade one-shot, the
 * prototype's `__vols.sfx`. The device's master mute (`settings.sound`) is read
 * at call time and short-circuits a muted `say`; there is no frame here to poll
 * on, so a plain read per call is the whole gate (the slider alone still works
 * when the mute latch is unavailable).
 */
import { volumes } from '$lib/audio/volumes.svelte';
import { settings } from '$lib/persist/settings';
import { NEIGHBOR_ARCHES } from '$lib/art/sprites/neighbors';
import type { ArchLineKey } from '$lib/i18n/lines';
import type { Lang } from '$lib/sim/loop';

/* ------------------------------------------------------------------ */
/* The id scheme (VOICES.md §3 — the playback contract)                */
/* ------------------------------------------------------------------ */

/** The six archetype line keys a neighbour speaks — `lines.ts`'s `ArchLineKey`. */
export const VOICE_ARCH_KEYS: readonly ArchLineKey[] = [
	'greet',
	'treat',
	'refuse',
	'regift',
	'seen',
	'scherzo'
];

/** Every voiced id per language — VOICES.md §6.2's 37 (`shout` + 6 keys × 6). */
export const VOICE_IDS: readonly string[] = [
	'shout',
	...VOICE_ARCH_KEYS.flatMap((key) => NEIGHBOR_ARCHES.map((arch) => `${key}-${arch}`))
];

/**
 * The clip id for a `(key, arch)` pair, or `null` when the pair is not a voiced
 * line (`VOICES.md` §3):
 *
 * | call | id |
 * |---|---|
 * | `('shout')` | `shout` |
 * | `(key, arch)` for a `VOICE_ARCH_KEYS` key × a `NEIGHBOR_ARCHES` arch | `<key>-<arch>` |
 * | `(key)` with a keyed key, `(key, arch)` with `shout`/`knock`, or an unknown key/arch | `null` |
 *
 * The `null` arm is what keeps a stray call silent: only the 37 shipped ids
 * ever reach a URL.
 */
export function voiceId(key: string, arch?: string): string | null {
	if (arch == null) return key === 'shout' ? 'shout' : null;
	if (!(VOICE_ARCH_KEYS as readonly string[]).includes(key)) return null;
	if (!(NEIGHBOR_ARCHES as readonly string[]).includes(arch)) return null;
	return `${key}-${arch}`;
}

/** The clip's path for `lang` + `id` — `static/voice/<lang>/<id>.mp3`. */
export function voiceUrl(lang: Lang, id: string): string {
	return `/voice/${lang}/${id}.mp3`;
}

/** The `say` callback shape the knock chain and the NPC cast take. */
export type SayLine = (lang: Lang, key: string, arch?: string) => void;

/* ------------------------------------------------------------------ */
/* The reused element pool                                             */
/* ------------------------------------------------------------------ */

/**
 * How many elements stay bound to a line at once. Two lines are the most the
 * flow ever says together (a shout, then an outcome ~1.7 s later), so a handful
 * is generous; a clip that has fallen out of the pool simply plays through a
 * freshly bound slot. A line still bound reuses its element, which is what makes
 * re-saying it rewind to 0 rather than overlap.
 */
export const VOICE_POOL_SIZE = 6;

/** One pool slot: the element and the line it is currently bound to. */
interface VoiceSlot {
	url: string;
	el: HTMLAudioElement;
}

let pool: VoiceSlot[] = [];
let cursor = 0;

/** Black-box counters: plays that reached an element, and slot rebinds. */
let playsTotal = 0;
let rebindsTotal = 0;

/** The audio-element factory — `new Audio()` by default; injectable for tests. */
type AudioFactory = () => HTMLAudioElement | null;

/** The `Audio` constructor, or `null` where there is none (node, SSR). */
function defaultAudio(): HTMLAudioElement | null {
	try {
		if (typeof Audio !== 'function') return null;
		return new Audio();
	} catch {
		return null;
	}
}

let createAudio: AudioFactory = defaultAudio;

/** The master-mute read — `settings.sound` by default; injectable for tests. */
let isMuted: () => boolean = () => settings.read().sound === false;

/** Clamp into the 0..1 gain band (a hostile slider value can never leak). */
function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

/** Arm a fresh element: preload its bytes and swallow a missing clip's error. */
function arm(el: HTMLAudioElement): void {
	try {
		el.preload = 'auto';
		el.addEventListener('error', () => {
			/* a missing/undecodable clip is silence, not a crash (VOICES §3) */
		});
	} catch {
		/* a hostile element: it will still be tried, just without the hooks */
	}
}

/**
 * The element a `url` should play through: an already-bound slot if there is
 * one (so the same line rewinds), a fresh slot while the pool has room, and a
 * round-robin slot otherwise (its previous clip is paused first — a voice line
 * is short and the pool only wraps after `VOICE_POOL_SIZE` distinct lines).
 * Returns `null` when no element can be built at all (node, SSR).
 */
function slotFor(url: string): HTMLAudioElement | null {
	const bound = pool.find((slot) => slot.url === url);
	if (bound) return bound.el;

	let el: HTMLAudioElement | null;
	if (pool.length < VOICE_POOL_SIZE) {
		el = createAudio();
		if (!el) return null;
		arm(el);
		pool.push({ url, el });
	} else {
		const slot = pool[cursor % pool.length];
		cursor = (cursor + 1) % pool.length;
		try {
			slot.el.pause();
			// Release the old clip *before* rebinding (the iOS media-resource
			// guard, found by the owner's device trail 2026-10-18): WebKit keeps
			// a bound media resource alive until the element is explicitly
			// unloaded, so a night of line swaps piles up native media memory
			// outside every page-visible counter — until the process is killed
			// (~6-7 homes, every run). `removeAttribute('src')` + `load()` is
			// the documented teardown; the new `src` below loads right after.
			slot.el.removeAttribute('src');
			slot.el.load();
		} catch {
			/* a hostile element: rebinding it is enough */
		}
		rebindsTotal += 1;
		slot.url = url;
		el = slot.el;
	}

	try {
		el.src = url;
	} catch {
		/* a hostile element: the play() below will decide */
	}
	return el;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Options for {@link initVoice} — the element factory and mute read (tests inject them). */
export interface VoiceOptions {
	/** The audio-element factory; defaults to `new Audio()` (or none). */
	createAudio?: AudioFactory;
	/** Whether the device is muted; defaults to `settings.sound === false`. */
	muted?: () => boolean;
}

/**
 * Rebind the module's two seams (the element factory and the mute read) and
 * start from an empty pool. Mirrors `sfx.ts`'s `initSfx`; the page never needs
 * it — `say` self-manages — so it exists for the unit suite and a future host.
 */
export function initVoice(opts: VoiceOptions = {}): void {
	if (opts.createAudio) createAudio = opts.createAudio;
	if (opts.muted) isMuted = opts.muted;
	pool = [];
	cursor = 0;
	playsTotal = 0;
	rebindsTotal = 0;
}

/**
 * Drop every pooled element and restore the default seams, so a later
 * `initVoice` builds fresh. Safe before any `initVoice` and safe twice; tests
 * use it between cases.
 */
export function stopVoice(): void {
	for (const slot of pool) {
		try {
			slot.el.pause();
		} catch {
			/* dropping the reference is enough */
		}
	}
	pool = [];
	cursor = 0;
	playsTotal = 0;
	rebindsTotal = 0;
	createAudio = defaultAudio;
	isMuted = () => settings.read().sound === false;
}

/**
 * Say one line: map `(key, arch)` to its clip id and play
 * `static/voice/<lang>/<id>.mp3`, at T17's SFX volume.
 *
 * A no-op — never an exception — when the pair is not a voiced line, when the
 * device is muted, when there is no `Audio`, or when the clip is missing (its
 * `error` event and `play()` rejection are both swallowed). Saying a line that
 * is already bound to a pooled element **rewinds it to 0**, so a concurrent
 * repeat restarts rather than stacks.
 */
export function say(lang: Lang, key: string, arch?: string): void {
	try {
		if (isMuted()) return;
		const id = voiceId(key, arch);
		if (!id) return;
		const el = slotFor(voiceUrl(lang, id));
		if (!el) return;
		el.volume = clamp01(volumes().sfx);
		el.currentTime = 0;
		playsTotal += 1;
		const started = el.play();
		if (started && typeof started.catch === 'function') started.catch(() => {});
	} catch {
		/* no element, a hostile one, a rejected play: stay silent, never throw */
	}
}

/** A read-only snapshot for tests, the smoke and the black box. */
export interface VoiceInfo {
	/** How many elements the pool is holding. */
	pooled: number;
	/** The lines currently bound to a pooled element, oldest first. */
	bound: string[];
	/** Total `say()` calls that reached an element's `play()` this page. */
	plays: number;
	/** Total slot rebinds (a new line swapped onto an already-bound element). */
	rebinds: number;
}

/** The player's current snapshot (never throws). */
export function voiceInfo(): VoiceInfo {
	return {
		pooled: pool.length,
		bound: pool.map((slot) => slot.url),
		plays: playsTotal,
		rebinds: rebindsTotal
	};
}
