import { afterEach, describe, expect, it } from 'vitest';
import { NEIGHBOR_ARCHES } from '$lib/art/sprites/neighbors';
import {
	VOICE_ARCH_KEYS,
	VOICE_IDS,
	initVoice,
	say,
	stopVoice,
	voiceId,
	voiceUrl,
	voiceInfo
} from './voice';
import type { VoiceBus } from './voice';

/**
 * Pinning suite for the voice seam (`voice.ts`), post the 2026-10-18
 * media-session migration: clips are fetched once, decoded once (small LRU)
 * and played as `AudioBufferSourceNode`s on the SFX synth's bus. The suite
 * pins:
 *
 *   1. the §3 id scheme (unchanged — the copy/voice contract);
 *   2. the playback contract: decode-once → replay from cache, rewind the old
 *      source instead of stacking, bounded cache, `onended` disconnect;
 *   3. total safety: muted, no bus, missing clip, failed decode, hostile
 *      seams — silence, an error counter at most, never a throw.
 */

/* ------------------------------------------------------------------ */
/* Fakes: a recording context, a recording source, bytes, the bus      */
/* ------------------------------------------------------------------ */

class FakeSource {
	buffer: unknown = null;
	started = false;
	stopped = false;
	disconnected = false;
	connectedTo: unknown = null;
	onended: (() => void) | null = null;

	start(): void {
		this.started = true;
	}
	stop(): void {
		this.stopped = true;
	}
	disconnect(): void {
		this.disconnected = true;
	}
	connect(node: unknown): void {
		this.connectedTo = node;
	}
}

class FakeContext {
	sources: FakeSource[] = [];
	decodeCalls = 0;
	decodeFails = false;

	createBufferSource(): FakeSource {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}

	async decodeAudioData(): Promise<unknown> {
		this.decodeCalls += 1;
		if (this.decodeFails) throw new Error('decode');
		return { clip: true };
	}
}

/** A bus factory over the fake context (the master is an opaque tag). */
function makeBus(ctx: FakeContext, master: unknown = {}): () => VoiceBus {
	return () => ({ ctx: ctx as unknown as AudioContext, master: master as unknown as AudioNode });
}

/** A fetchBytes seam that records URLs; `ok=false` answers "missing clip". */
function bytesOf(ok = true): {
	fetches: string[];
	fetchBytes: (url: string) => Promise<ArrayBuffer | null>;
} {
	const fetches: string[] = [];
	return {
		fetches,
		fetchBytes: async (url: string) => {
			fetches.push(url);
			return ok ? new ArrayBuffer(8) : null;
		}
	};
}

/** Flush the say → bus → fetch → decode → source chain (all microtasks). */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
	stopVoice();
});

/* ------------------------------------------------------------------ */
/* The id scheme (VOICES.md §3) — the mapping table the contract pins  */
/* ------------------------------------------------------------------ */

describe('voiceId — the §3 id scheme', () => {
	it('maps `shout` with no arch to `shout`', () => {
		expect(voiceId('shout')).toBe('shout');
	});

	it('maps every key × arch to `<key>-<arch>` (a sample per key)', () => {
		const rows: [string, string, string][] = [
			['greet', 'ghost', 'greet-ghost'],
			['treat', 'nonna', 'treat-nonna'],
			['refuse', 'strega', 'refuse-strega'],
			['regift', 'wolf', 'regift-wolf'],
			['seen', 'vlad', 'seen-vlad'],
			['scherzo', 'scarecrow', 'scherzo-scarecrow']
		];
		for (const [key, arch, want] of rows) {
			expect(voiceId(key, arch)).toBe(want);
		}
	});

	it('covers the full 6 × 6 product, in VOICES §3 order', () => {
		const want = [
			'shout',
			...VOICE_ARCH_KEYS.flatMap((key) => NEIGHBOR_ARCHES.map((arch) => `${key}-${arch}`))
		];
		expect(want).toHaveLength(37);
		for (const id of want) {
			const dash = id.indexOf('-');
			if (dash < 0) expect(voiceId('shout')).toBe(id);
			else expect(voiceId(id.slice(0, dash), id.slice(dash + 1))).toBe(id);
		}
	});

	it('returns null for every pair that is not a voiced line', () => {
		// A keyed key with no arch, the unvoiced knock label, an unknown key.
		expect(voiceId('greet')).toBeNull();
		expect(voiceId('knock')).toBeNull();
		expect(voiceId('shop')).toBeNull();
		// `shout`/`knock` never take an arch; an unknown arch never resolves.
		expect(voiceId('shout', 'ghost')).toBeNull();
		expect(voiceId('knock', 'ghost')).toBeNull();
		expect(voiceId('greet', 'dragon')).toBeNull();
		expect(voiceId('greet', '')).toBeNull();
	});

	it('ships exactly the 37 ids the copy tables can say', () => {
		expect(VOICE_IDS).toHaveLength(37);
		expect(VOICE_IDS[0]).toBe('shout');
		expect(new Set(VOICE_IDS).size).toBe(37);
		expect(VOICE_ARCH_KEYS).toEqual(['greet', 'treat', 'refuse', 'regift', 'seen', 'scherzo']);
	});

	it('builds a dot-free URL under the language directory', () => {
		expect(voiceUrl('it', 'shout')).toBe('/voice/it/shout.mp3');
		expect(voiceUrl('en', 'greet-ghost')).toBe('/voice/en/greet-ghost.mp3');
		for (const id of VOICE_IDS) {
			expect(id).not.toContain('.'); // a dot would collapse two clips onto one file (§3)
			expect(voiceUrl('it', id)).toMatch(/^\/voice\/it\/[a-z-]+\.mp3$/);
		}
	});
});

/* ------------------------------------------------------------------ */
/* Playback — the bus, the cache, the rewind                           */
/* ------------------------------------------------------------------ */

describe('say — playback through the shared SFX bus', () => {
	it('decodes a clip once and plays it through a source on the bus', async () => {
		const ctx = new FakeContext();
		const master = {};
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx, master), fetchBytes });

		say('it', 'treat', 'wolf');
		await tick();

		expect(fetches).toEqual(['/voice/it/treat-wolf.mp3']);
		expect(ctx.decodeCalls).toBe(1);
		expect(ctx.sources).toHaveLength(1);
		expect(ctx.sources[0].started).toBe(true);
		expect(ctx.sources[0].connectedTo).toBe(master);
		expect(voiceInfo()).toMatchObject({ plays: 1, clips: 1, errors: 0, cached: 1 });
	});

	it('replays the same line from the cache, rewinding the old source', async () => {
		const ctx = new FakeContext();
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'seen', 'ghost');
		await tick();
		const first = ctx.sources[0];

		say('it', 'seen', 'ghost');
		await tick();

		expect(fetches).toHaveLength(1); // decoded once
		expect(ctx.decodeCalls).toBe(1);
		expect(ctx.sources).toHaveLength(2);
		expect(first.stopped).toBe(true); // rewind, not stack
		expect(voiceInfo().plays).toBe(2);
	});

	it('fetches once when the same line is asked twice at once', async () => {
		const ctx = new FakeContext();
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'shout');
		say('it', 'shout');
		await tick();

		expect(fetches).toHaveLength(1); // one in-flight fetch, shared
		expect(ctx.decodeCalls).toBe(1);
		expect(ctx.sources).toHaveLength(2);
	});

	it('bounds the cache and re-decodes an evicted clip', async () => {
		const ctx = new FakeContext();
		const { fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		// Thirteen distinct clips: `shout` + the six keys in two archetypes.
		const ids: [string, string | undefined][] = [
			['shout', undefined],
			...VOICE_ARCH_KEYS.map((key): [string, string] => [key, 'ghost']),
			...VOICE_ARCH_KEYS.map((key): [string, string] => [key, 'nonna'])
		];
		for (const [key, arch] of ids) {
			if (arch) say('it', key, arch);
			else say('it', key);
			await tick();
		}

		expect(ctx.decodeCalls).toBe(13);
		expect(voiceInfo().cached).toBeLessThanOrEqual(12);

		say('it', 'shout'); // the oldest fell out of the LRU: decoded again
		await tick();
		expect(ctx.decodeCalls).toBe(14);
	});

	it('disconnects the source when it ends', async () => {
		const ctx = new FakeContext();
		const { fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'shout');
		await tick();

		ctx.sources[0].onended?.();
		expect(ctx.sources[0].disconnected).toBe(true);
	});

	it('is a no-op for a pair that is not a voiced line', async () => {
		const ctx = new FakeContext();
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'knock');
		say('it', 'greet'); // no arch
		say('it', 'shout', 'ghost'); // shout takes no arch
		say('it', 'greet', 'dragon'); // unknown arch
		await tick();

		expect(fetches).toHaveLength(0);
		expect(ctx.sources).toHaveLength(0);
	});

	it('is a no-op while the device is muted (no fetch at all)', async () => {
		const ctx = new FakeContext();
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes, muted: () => true });

		say('it', 'shout');
		await tick();

		expect(fetches).toHaveLength(0);
		expect(ctx.sources).toHaveLength(0);
	});

	it('stays silent when the bus is closed (muted synth, no context)', async () => {
		const { fetches, fetchBytes } = bytesOf();
		initVoice({ bus: () => null, fetchBytes });

		say('it', 'shout');
		await tick();

		expect(fetches).toHaveLength(0); // no decode work without a bus
		expect(voiceInfo().plays).toBe(0);
	});

	it('treats a missing clip as silence without an error', async () => {
		const ctx = new FakeContext();
		const { fetchBytes } = bytesOf(false);
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'treat', 'nonna');
		await tick();

		expect(ctx.sources).toHaveLength(0);
		expect(voiceInfo()).toMatchObject({ plays: 0, clips: 0, errors: 0 });
	});

	it('counts a decode failure, stays silent, never throws', async () => {
		const ctx = new FakeContext();
		ctx.decodeFails = true;
		const { fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		expect(() => say('it', 'treat', 'nonna')).not.toThrow();
		await tick();

		expect(ctx.sources).toHaveLength(0);
		expect(voiceInfo().errors).toBe(1);
	});
});

/* ------------------------------------------------------------------ */
/* Hostile seams: everything degrades to silence                       */
/* ------------------------------------------------------------------ */

describe('hostile seams: every entry point is a silent no-op', () => {
	it('with the default seams under node, say builds nothing and never throws', async () => {
		expect(() => say('it', 'shout')).not.toThrow();
		expect(() => say('en', 'scherzo', 'vlad')).not.toThrow();
		await tick();
		expect(voiceInfo()).toMatchObject({ plays: 0, clips: 0, cached: 0 });
	});

	it('swallows a bus factory that throws', async () => {
		initVoice({
			bus: () => {
				throw new Error('no audio');
			}
		});
		expect(() => say('it', 'treat', 'nonna')).not.toThrow();
		await tick();
		expect(voiceInfo().errors).toBe(1);
	});

	it('stopVoice drops sources and cache and is safe twice', async () => {
		const ctx = new FakeContext();
		const { fetchBytes } = bytesOf();
		initVoice({ bus: makeBus(ctx), fetchBytes });

		say('it', 'shout');
		await tick();
		expect(voiceInfo().plays).toBe(1);

		stopVoice();
		expect(ctx.sources[0].stopped).toBe(true);
		expect(voiceInfo()).toMatchObject({ plays: 0, clips: 0, cached: 0 });

		expect(() => stopVoice()).not.toThrow();
		expect(() => say('it', 'shout')).not.toThrow(); // back to the defaults (no context under node)
	});
});
