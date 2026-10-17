import { afterEach, describe, expect, it } from 'vitest';
import { NEIGHBOR_ARCHES } from '$lib/art/sprites/neighbors';
import { setSfx } from './volumes.svelte';
import {
	VOICE_ARCH_KEYS,
	VOICE_IDS,
	initVoice,
	say,
	stopVoice,
	voiceId,
	voiceInfo,
	voiceUrl
} from './voice.svelte';

/**
 * T28b — the voice playback seam (`voice.svelte.ts`), tested through a **fake
 * `Audio` element** the module's factory injects. The four contract points the
 * acceptance names: the §3 id mapping (for every key × arch, and the null
 * arms), the SFX-slider volume binding, the missing-`Audio` no-op, and a
 * concurrent say of the same line restarting from 0. The environment is `node`
 * (vite.config `test.environment`), so the *real* entry point (`say` with no
 * factory) is exactly the "no `Audio`" case: silent, never throwing.
 */

/* ------------------------------------------------------------------ */
/* A fake HTMLAudioElement that records what the module asks of it     */
/* ------------------------------------------------------------------ */

class FakeElement {
	preload = '';
	src = '';
	volume = 1;
	currentTime = 0;
	playing = false;
	playCalls = 0;
	pauseCalls = 0;
	listeners: string[] = [];
	/** Make the next `play()` reject (a blocked autoplay / decode failure). */
	rejectPlay = false;

	play(): Promise<void> {
		this.playCalls++;
		this.playing = true;
		return this.rejectPlay ? Promise.reject(new Error('blocked')) : Promise.resolve();
	}

	pause(): void {
		this.pauseCalls++;
		this.playing = false;
	}

	addEventListener(type: string): void {
		this.listeners.push(type);
	}
}

/** A factory that mints fakes and keeps the list, so tests can inspect identity. */
function fakeFactory(): { made: FakeElement[]; createAudio: () => HTMLAudioElement } {
	const made: FakeElement[] = [];
	return {
		made,
		createAudio: () => {
			const el = new FakeElement();
			made.push(el);
			return el as unknown as HTMLAudioElement;
		}
	};
}

afterEach(() => {
	stopVoice();
	setSfx(1); // put the real slider back for the next case
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
/* Playing — the pool, the volume, the no-ops                          */
/* ------------------------------------------------------------------ */

describe('say — playback through the reused pool', () => {
	it('plays the mapped clip through one element', async () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio });

		say('en', 'treat', 'wolf');
		await Promise.resolve();

		expect(made).toHaveLength(1);
		expect(made[0].src).toBe('/voice/en/treat-wolf.mp3');
		expect(made[0].playCalls).toBe(1);
		expect(made[0].listeners).toContain('error'); // a missing clip is swallowed
	});

	it('binds the clip volume to the SFX slider', () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio });

		setSfx(0.5);
		say('it', 'shout');
		expect(made[0].volume).toBe(0.5);

		setSfx(0);
		say('it', 'greet', 'nonna'); // a different line → the second element
		expect(made[1].volume).toBe(0);
	});

	it('restarts from 0 when the same line is said again', () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio });

		say('it', 'seen', 'ghost');
		made[0].currentTime = 4.2; // pretend it has been playing

		say('it', 'seen', 'ghost');
		expect(made).toHaveLength(1); // one element, reused
		expect(made[0].currentTime).toBe(0); // rewound, not stacked
		expect(made[0].playCalls).toBe(2);
	});

	it('keeps the pool bounded and round-robins past it', () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio });

		// Seven distinct lines: six fill the pool, the seventh rebinds slot 0.
		const ids = [
			['shout', undefined],
			['greet', 'ghost'],
			['treat', 'ghost'],
			['refuse', 'ghost'],
			['regift', 'ghost'],
			['seen', 'ghost'],
			['scherzo', 'ghost']
		] as const;
		for (const [key, arch] of ids) {
			if (arch) say('it', key, arch);
			else say('it', key);
		}

		expect(voiceInfo().pooled).toBe(6); // bounded
		expect(voiceInfo().bound).toHaveLength(6);
		expect(made).toHaveLength(6); // no seventh element built
		expect(made[0].src).toBe('/voice/it/scherzo-ghost.mp3'); // slot 0 rebound
		expect(made[0].playCalls).toBe(2); // once as `shout`, again as the rebound line
	});

	it('is a no-op for a pair that is not a voiced line', () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio });

		say('it', 'knock');
		say('it', 'greet'); // no arch
		say('it', 'shout', 'ghost'); // shout takes no arch
		say('it', 'greet', 'dragon'); // unknown arch

		expect(made).toHaveLength(0);
		expect(voiceInfo().pooled).toBe(0);
	});

	it('is a no-op while the device is muted', () => {
		const { made, createAudio } = fakeFactory();
		initVoice({ createAudio, muted: () => true });

		say('it', 'shout');
		expect(made).toHaveLength(0);
	});

	it('swallows a rejected play()', () => {
		const made: FakeElement[] = [];
		initVoice({
			createAudio: () => {
				const el = new FakeElement();
				el.rejectPlay = true;
				made.push(el);
				return el as unknown as HTMLAudioElement;
			}
		});

		expect(() => say('it', 'shout')).not.toThrow();
		expect(made[0].playCalls).toBe(1);
	});
});

describe('no Audio: every entry point is a silent no-op', () => {
	it('say() under node builds nothing and never throws', () => {
		expect(() => say('it', 'shout')).not.toThrow();
		expect(() => say('en', 'scherzo', 'vlad')).not.toThrow();
		expect(voiceInfo().pooled).toBe(0);
	});

	it('swallows a factory that returns null', () => {
		initVoice({ createAudio: () => null });
		expect(() => say('it', 'treat', 'nonna')).not.toThrow();
		expect(voiceInfo().pooled).toBe(0);
	});

	it('swallows a factory that throws', () => {
		initVoice({
			createAudio: () => {
				throw new Error('no audio');
			}
		});
		expect(() => say('it', 'treat', 'nonna')).not.toThrow();
	});

	it('stopVoice drops the pool and is safe twice', () => {
		const { createAudio } = fakeFactory();
		initVoice({ createAudio });
		say('it', 'shout');
		expect(voiceInfo().pooled).toBe(1);

		stopVoice();
		expect(voiceInfo().pooled).toBe(0);
		expect(() => stopVoice()).not.toThrow();
		expect(() => say('it', 'shout')).not.toThrow(); // back to the default (no Audio)
	});
});
