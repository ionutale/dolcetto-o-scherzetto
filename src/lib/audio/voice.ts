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
 * **WebAudio now, media elements then (2026-10-18).** The first cut played
 * clips through a pool of six reused `<audio>` elements. The owner's on-device
 * flight logs then pinned the recurring iOS process kill — always at ~6-7
 * homes, with every page-visible counter flat — to WebKit's per-load media
 * sessions: by death the pool had loaded ~12-18 distinct clips, one native
 * media session each, none of it visible to the page and none of it given
 * back by a rebind teardown. Clips are now decoded once (a small LRU) and
 * played as `AudioBufferSourceNode`s **on the SFX synth's bus**
 * (`sfxBus()` — one shared context, its mute latch and SFX slider applied):
 * no media sessions, deterministic memory, and the volume/mute behaviour the
 * rest of the audio stack already has.
 *
 * **Never throws, never spikes.** Every entry point is total: with no context,
 * no clip on disk, a rejected fetch or a failed decode, the call is a silent
 * no-op — never an exception (spec §6 · Review Focus #1). A missing clip is
 * silence, not a console error and not a crash.
 *
 * **Volume and mute.** Clips ride the SFX master gate, so the SFX slider
 * (`volumes().sfx`) and both mute latches apply exactly as they do to cues.
 * The device's master mute (`settings.sound`) is also read at call time and
 * short-circuits a muted `say` before any fetch happens.
 */
import { sfxBus } from '$lib/audio/sfx';
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
/* The decoded-clip cache, the live sources, the seams                 */
/* ------------------------------------------------------------------ */

/**
 * How many decoded clips the cache holds (insertion-ordered, LRU on hit). A
 * clip is a few hundred KB decoded, and a session touches ~15-25 distinct
 * lines, so eight-plus entries keep the hot ones resident without a memory
 * story worth telling.
 */
export const VOICE_CACHE_SIZE = 12;

/** The playback bus the clips borrow — exported for the tests' fakes. */
export interface VoiceBus {
	/** The shared AudioContext (the SFX synth's). */
	ctx: AudioContext;
	/** The master gate (mute latches + SFX slider already applied). */
	master: AudioNode;
}

/** The bytes fetcher — `fetch(url)` → `arrayBuffer()`, injectable for tests. */
type BytesFetcher = (url: string) => Promise<ArrayBuffer | null>;

/** `null`-returning on every failure: a missing clip is silence. */
async function defaultBytes(url: string): Promise<ArrayBuffer | null> {
	try {
		if (typeof fetch !== 'function') return null;
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.arrayBuffer();
	} catch {
		return null;
	}
}

/** The default bus read — `sfxBus()` guarded once more for total safety. */
function defaultBus(): VoiceBus | null {
	try {
		return sfxBus();
	} catch {
		return null;
	}
}

/** The decoded clips, LRU-ordered (a `get` re-inserts; the tail evicts). */
let cache = new Map<string, AudioBuffer>();
/** In-flight decodes, so two quick says of one line fetch it once. */
let pending = new Map<string, Promise<AudioBuffer | null>>();
/** The live source per URL — re-saying a line stops it (rewind, not stack). */
let active = new Map<string, AudioBufferSourceNode>();

/** Black-box counters: sources started, clips decoded, failures swallowed. */
let playsTotal = 0;
let clipsTotal = 0;
let errorsTotal = 0;

let busFactory: () => VoiceBus | null = defaultBus;
let fetchBytes: BytesFetcher = defaultBytes;
let isMuted: () => boolean = () => settings.read().sound === false;

/** Drop everything this module holds, counters included (init/stop share it). */
function reset(): void {
	for (const source of active.values()) {
		try {
			source.stop();
			source.disconnect();
		} catch {
			/* dropping the reference is enough */
		}
	}
	active = new Map();
	cache = new Map();
	pending = new Map();
	playsTotal = 0;
	clipsTotal = 0;
	errorsTotal = 0;
}

/** Re-insert a hit at the tail and evict the oldest past the cap. */
function touch(url: string, buffer: AudioBuffer): void {
	cache.delete(url);
	cache.set(url, buffer);
	while (cache.size > VOICE_CACHE_SIZE) {
		const oldest = cache.keys().next().value as string | undefined;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

/** The decoded clip for `url` — cache, then one in-flight fetch+decode. */
function load(a: AudioContext, url: string): Promise<AudioBuffer | null> {
	const hit = cache.get(url);
	if (hit) {
		touch(url, hit);
		return Promise.resolve(hit);
	}
	const inflight = pending.get(url);
	if (inflight) return inflight;
	const job = (async (): Promise<AudioBuffer | null> => {
		try {
			const bytes = await fetchBytes(url);
			if (!bytes) return null; // a missing clip is silence, not an error
			const decoded = await a.decodeAudioData(bytes);
			clipsTotal += 1;
			touch(url, decoded);
			return decoded;
		} catch {
			errorsTotal += 1;
			return null;
		} finally {
			pending.delete(url);
		}
	})();
	pending.set(url, job);
	return job;
}

/**
 * Play one clip: bus → decoded buffer → source → master. The previous source
 * for the same URL is stopped first (re-saying a line rewinds rather than
 * stacks — the shout chain can land twice on a fast walk); `onended`
 * disconnects the source so the graph never accumulates.
 */
async function play(url: string): Promise<void> {
	try {
		const bus = busFactory();
		if (!bus) return; // muted / no context: silent
		const buffer = await load(bus.ctx, url);
		if (!buffer) return;
		const now = busFactory();
		if (!now) return; // muted mid-decode: stay silent
		const source = now.ctx.createBufferSource();
		source.buffer = buffer;
		const previous = active.get(url);
		if (previous) {
			try {
				previous.stop();
			} catch {
				/* already ended: the map entry below still wins */
			}
		}
		source.onended = () => {
			try {
				source.disconnect();
			} catch {
				/* already gone */
			}
			if (active.get(url) === source) active.delete(url);
		};
		source.connect(now.master);
		active.set(url, source);
		playsTotal += 1;
		source.start();
	} catch {
		errorsTotal += 1;
	}
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Options for {@link initVoice} — the bus, the fetcher, the mute read. */
export interface VoiceOptions {
	/** The playback bus; defaults to `sfxBus()` (or none). */
	bus?: () => VoiceBus | null;
	/** The bytes fetcher; defaults to the SW-friendly `fetch`. */
	fetchBytes?: BytesFetcher;
	/** Whether the device is muted; defaults to `settings.sound === false`. */
	muted?: () => boolean;
}

/**
 * Rebind the module's seams and start from an empty cache. Mirrors
 * `sfx.ts`'s `initSfx`; the page never needs it — `say` self-manages — so it
 * exists for the unit suite and a future host.
 */
export function initVoice(opts: VoiceOptions = {}): void {
	if (opts.bus) busFactory = opts.bus;
	if (opts.fetchBytes) fetchBytes = opts.fetchBytes;
	if (opts.muted) isMuted = opts.muted;
	reset();
}

/** Drop every clip and source and restore the default seams (tests). */
export function stopVoice(): void {
	reset();
	busFactory = defaultBus;
	fetchBytes = defaultBytes;
	isMuted = () => settings.read().sound === false;
}

/**
 * Say one line: map `(key, arch)` to its clip id and play
 * `static/voice/<lang>/<id>.mp3` through the SFX bus.
 *
 * A no-op — never an exception — when the pair is not a voiced line, when the
 * device is muted, when there is no context, or when the clip is missing (a
 * failed fetch/decode is swallowed). Saying a line that is already playing
 * **stops the old source and starts fresh** (rewind, not stack).
 */
export function say(lang: Lang, key: string, arch?: string): void {
	try {
		if (isMuted()) return;
		const id = voiceId(key, arch);
		if (!id) return;
		void play(voiceUrl(lang, id));
	} catch {
		/* no bus, a hostile context: stay silent, never throw */
	}
}

/** A read-only snapshot for tests, the smoke and the black box. */
export interface VoiceInfo {
	/** Clips actually started this page (the black box's `sy`). */
	plays: number;
	/** Clips decoded this page — cache misses (the black box's `vc`). */
	clips: number;
	/** Fetch/decode/source failures swallowed (the black box's `vx`). */
	errors: number;
	/** Clips resident in the cache right now. */
	cached: number;
}

/** The player's current snapshot (never throws). */
export function voiceInfo(): VoiceInfo {
	return {
		plays: playsTotal,
		clips: clipsTotal,
		errors: errorsTotal,
		cached: cache.size
	};
}
