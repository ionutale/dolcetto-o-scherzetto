import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, phase, step } from '$lib/state/game.svelte';
import { setMusic } from './volumes.svelte';
import {
	MUSIC_DUCK_MAX,
	MUSIC_MAX,
	MUSIC_RAMP_S,
	MUSIC_URL,
	duckMusic,
	isMusicDucked,
	musicFrame,
	musicInfo,
	musicTarget,
	startMusic,
	stopMusic
} from './music.svelte';

/**
 * T25's engine, tested through a **fake AudioContext** that records the master
 * gain's automation and the created sources — the four things the acceptance
 * names: the target math (`sound × duck × slider`), the loop configuration
 * (`loop = true`, started once), a decode/network failure going silent, the
 * start being idempotent, and a stop clearing the graph.
 *
 * The environment is `node` (vite.config `test.environment`), so the *real*
 * entry point (`startMusic()` with no factory) is the "no AudioContext" no-op
 * case: it must stay silent and never throw. Every other test injects the fake
 * through `startMusic({ createContext, fetcher })` and drives frames by hand
 * (`animate: false`).
 */

/* ------------------------------------------------------------------ */
/* A fake AudioContext that records the gain param and the sources     */
/* ------------------------------------------------------------------ */

interface ParamCall {
	method: 'target';
	value: number;
	at: number;
	tc: number;
}

class FakeParam {
	value = 0;
	calls: ParamCall[] = [];
	setTargetAtTime(value: number, at: number, tc: number): this {
		this.calls.push({ method: 'target', value, at, tc });
		this.value = value;
		return this;
	}
}

interface FakeGain {
	gain: FakeParam;
	connect(): unknown;
}

interface FakeSource {
	buffer: unknown;
	loop: boolean;
	started: number;
	stopped: number;
	connect(): unknown;
	disconnect(): void;
	start(): void;
	stop(): void;
}

interface Fake {
	ctx: AudioContext;
	gains: FakeGain[];
	sources: FakeSource[];
	resumeCalls: number;
	closeCalls: number;
	decode: (bytes: ArrayBuffer) => Promise<AudioBuffer | null>;
}

/** The last value a param was told to ramp *to*. */
function lastTarget(param: FakeParam): number | null {
	for (let i = param.calls.length - 1; i >= 0; i--) {
		if (param.calls[i].method === 'target') return param.calls[i].value;
	}
	return null;
}

/** The last ramp's time constant (the smoothing seam). */
function lastTau(param: FakeParam): number | null {
	return param.calls.at(-1)?.tc ?? null;
}

/** A minimal AudioContext holding exactly the surface `music.svelte.ts` uses. */
function fakeContext(opts: { decode?: 'ok' | 'fail' } = {}): Fake {
	const gains: FakeGain[] = [];
	const sources: FakeSource[] = [];
	const fake: Fake = {
		ctx: null as unknown as AudioContext,
		gains,
		sources,
		resumeCalls: 0,
		closeCalls: 0,
		decode: null as unknown as Fake['decode']
	};

	const destination = { connect: () => destination } as unknown as AudioNode;
	const ctx = {
		sampleRate: 44100,
		currentTime: 1,
		state: 'suspended' as AudioContextState,
		destination,
		createGain() {
			const node: FakeGain = {
				gain: new FakeParam(),
				connect: () => node
			};
			gains.push(node);
			return node;
		},
		createBufferSource() {
			const node: FakeSource = {
				buffer: null,
				loop: false,
				started: 0,
				stopped: 0,
				connect: () => node,
				disconnect: () => {},
				start: () => void node.started++,
				stop: () => void node.stopped++
			};
			sources.push(node);
			return node;
		},
		resume() {
			fake.resumeCalls++;
			ctx.state = 'running';
			return Promise.resolve();
		},
		close() {
			fake.closeCalls++;
			ctx.state = 'closed';
			return Promise.resolve();
		}
	};

	fake.ctx = ctx as unknown as AudioContext;
	fake.decode = async () => {
		if (opts.decode === 'fail') throw new Error('undecodable');
		return { duration: 95.9 } as unknown as AudioBuffer;
	};
	return fake;
}

/** A fetcher that answers 200 with a small body. */
function okFetch(): typeof fetch {
	return (async () => ({
		ok: true,
		arrayBuffer: async () => new ArrayBuffer(16)
	})) as unknown as typeof fetch;
}

/** A fetcher that answers 404. */
function notFoundFetch(): typeof fetch {
	return (async () => ({
		ok: false,
		arrayBuffer: async () => new ArrayBuffer(0)
	})) as unknown as typeof fetch;
}

/** Starts the engine on a fake context, frames/load driven by hand. */
function start(fake: Fake, fetcher: typeof fetch = okFetch()): void {
	startMusic({ createContext: () => fake.ctx, fetcher, animate: false, decode: fake.decode });
}

/** Lets the fire-and-forget fetch/decode chain settle. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drives the sim to a live trick show so `phase()` is `'trick'`. */
function enterTrickPhase(): void {
	dispatch({ type: 'RESET', opts: { force: { 0: 'refuse' }, worldX: 0 } });
	step(0.001); // recompute `activeK` for home 0
	dispatch({ type: 'KNOCK' });
	dispatch({ type: 'RESOLVE' });
	dispatch({ type: 'PLAY_TRICK', id: 'boo' });
}

afterEach(() => {
	stopMusic();
	setMusic(1);
});

/* ------------------------------------------------------------------ */
/* Pure logic: the owner mix + the duck rule                           */
/* ------------------------------------------------------------------ */

describe('the owner mix constants (spec §11/§13)', () => {
	it('pins the versioned loop and the two mix values', () => {
		expect(MUSIC_URL).toBe('/music/a-winters-night.v1.mp3');
		expect(MUSIC_MAX).toBe(0.143);
		expect(MUSIC_DUCK_MAX).toBe(0.042);
		expect(MUSIC_DUCK_MAX).toBeLessThan(MUSIC_MAX);
		// Spec §10: audio peaks stay ≤ 0.18.
		expect(MUSIC_MAX).toBeLessThanOrEqual(0.18);
	});

	it('uses a short, positive ramp time constant', () => {
		expect(MUSIC_RAMP_S).toBeGreaterThan(0);
		expect(MUSIC_RAMP_S).toBeLessThanOrEqual(0.5);
	});
});

describe('the target math (sound × duck × slider)', () => {
	const rows: { sound: boolean; ducked: boolean; music: number; want: number }[] = [
		// unducked base × slider
		{ sound: true, ducked: false, music: 1, want: MUSIC_MAX },
		{ sound: true, ducked: false, music: 0.5, want: MUSIC_MAX / 2 },
		{ sound: true, ducked: false, music: 0, want: 0 },
		// ducked (show / scare) × slider
		{ sound: true, ducked: true, music: 1, want: MUSIC_DUCK_MAX },
		{ sound: true, ducked: true, music: 0.5, want: MUSIC_DUCK_MAX / 2 },
		{ sound: true, ducked: true, music: 0, want: 0 },
		// the sound master toggle silences every case
		{ sound: false, ducked: false, music: 1, want: 0 },
		{ sound: false, ducked: false, music: 0.5, want: 0 },
		{ sound: false, ducked: true, music: 1, want: 0 }
	];

	it.each(rows)('sound=$sound ducked=$ducked music=$music → $want', (row) => {
		expect(musicTarget(row)).toBeCloseTo(row.want, 12);
	});

	it('scales linearly with the slider and equals the base at full', () => {
		expect(musicTarget({ sound: true, ducked: false, music: 1 })).toBe(MUSIC_MAX);
		expect(musicTarget({ sound: true, ducked: true, music: 1 })).toBe(MUSIC_DUCK_MAX);
		expect(musicTarget({ sound: true, ducked: false, music: 0.25 })).toBeCloseTo(
			MUSIC_MAX * 0.25,
			12
		);
	});

	it('clamps a hostile slider into 0..1', () => {
		expect(musicTarget({ sound: true, ducked: false, music: 2 })).toBe(MUSIC_MAX);
		expect(musicTarget({ sound: true, ducked: false, music: -1 })).toBe(0);
		expect(musicTarget({ sound: true, ducked: true, music: Number.NaN })).toBe(0);
	});
});

describe('the duck rule', () => {
	it('ducks trick shows and respects the manual latch', () => {
		expect(isMusicDucked('trick', false)).toBe(true);
		expect(isMusicDucked('roam', true)).toBe(true);
		expect(isMusicDucked('roam', false)).toBe(false);
		expect(isMusicDucked('refuse', false)).toBe(false);
		expect(isMusicDucked('door', false)).toBe(false);
		expect(isMusicDucked('collect', false)).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/* No AudioContext: every entry point is a silent no-op                */
/* ------------------------------------------------------------------ */

describe('no AudioContext: every entry point is a silent no-op', () => {
	it('startMusic() under node starts nothing and never throws', () => {
		expect(() => startMusic()).not.toThrow();
		expect(musicInfo().running).toBe(false);
		expect(musicInfo().context).toBeNull();
		expect(musicInfo().playing).toBe(false);
	});

	it('swallows a throwing context factory', () => {
		expect(() =>
			startMusic({
				createContext: () => {
					throw new Error('no audio here');
				},
				animate: false
			})
		).not.toThrow();
		expect(musicInfo().running).toBe(false);
	});

	it('ignores a null context and a frame before start', () => {
		expect(() => startMusic({ createContext: () => null, animate: false })).not.toThrow();
		expect(() => musicFrame(1)).not.toThrow();
		expect(() => duckMusic(true)).not.toThrow();
		expect(() => stopMusic()).not.toThrow();
		expect(musicInfo().ducked).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/* The engine, driven through the fake                                 */
/* ------------------------------------------------------------------ */

describe('start on gesture', () => {
	it('builds the master gain, resumes, decodes and starts a looping source', async () => {
		const fake = fakeContext();
		start(fake);
		await flush();

		expect(fake.resumeCalls).toBe(1);
		expect(fake.gains).toHaveLength(1); // exactly one master gain
		expect(lastTarget(fake.gains[0].gain)).toBe(MUSIC_MAX);
		expect(lastTau(fake.gains[0].gain)).toBe(MUSIC_RAMP_S);

		expect(fake.sources).toHaveLength(1);
		expect(fake.sources[0].loop).toBe(true); // gap-free wrap
		expect(fake.sources[0].started).toBe(1);

		const info = musicInfo();
		expect(info.running).toBe(true);
		expect(info.context).toBe('running');
		expect(info.playing).toBe(true);
		expect(info.target).toBe(MUSIC_MAX);
	});

	it('is idempotent: a second gesture does not build a second graph', async () => {
		const fake = fakeContext();
		start(fake);
		await flush();
		const gains = fake.gains.length;
		const sources = fake.sources.length;

		start(fake);
		await flush();

		expect(fake.gains.length).toBe(gains);
		expect(fake.sources.length).toBe(sources);
	});
});

describe('a failing load stays silent (never throws)', () => {
	it('keeps the engine silent when the decoder rejects', async () => {
		const fake = fakeContext({ decode: 'fail' });
		expect(() => start(fake)).not.toThrow();
		await flush();

		expect(fake.sources).toHaveLength(0);
		expect(musicInfo().playing).toBe(false);
		expect(musicInfo().running).toBe(true); // still a live (silent) engine
	});

	it('keeps the engine silent on a 404', async () => {
		const fake = fakeContext();
		start(fake, notFoundFetch());
		await flush();

		expect(fake.sources).toHaveLength(0);
		expect(musicInfo().playing).toBe(false);
	});

	it('keeps the engine silent when the fetch itself rejects', async () => {
		const fake = fakeContext();
		const throwingFetch = (async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch;
		start(fake, throwingFetch);
		await flush();

		expect(fake.sources).toHaveLength(0);
		expect(musicInfo().playing).toBe(false);
	});
});

describe('the Music slider scales the loop', () => {
	it('halves the master target at slider 0.5 (store-driven)', async () => {
		const fake = fakeContext();
		setMusic(0.5);
		start(fake);
		await flush();
		const master = fake.gains[0].gain;

		expect(musicInfo().target).toBeCloseTo(MUSIC_MAX / 2, 12);
		expect(lastTarget(master)).toBeCloseTo(MUSIC_MAX / 2, 12);

		setMusic(0.25);
		musicFrame(1);
		expect(lastTarget(master)).toBeCloseTo(MUSIC_MAX / 4, 12);

		setMusic(0);
		musicFrame(1);
		expect(lastTarget(master)).toBe(0);
	});
});

describe('duck toggles the master gain param', () => {
	it('spies the master param: full → duck → full', async () => {
		const fake = fakeContext();
		start(fake);
		await flush();
		const master = fake.gains[0].gain;

		expect(musicInfo().target).toBe(MUSIC_MAX);

		duckMusic(true);
		expect(musicInfo().ducked).toBe(true);
		expect(lastTarget(master)).toBe(MUSIC_DUCK_MAX);

		duckMusic(false);
		expect(musicInfo().ducked).toBe(false);
		expect(lastTarget(master)).toBe(MUSIC_MAX);
	});
});

/** Last: it moves the shared sim into a trick show. */
describe('a trick show ducks the loop automatically', () => {
	it('retargets the master to the duck without a duckMusic call', async () => {
		const fake = fakeContext();
		start(fake);
		await flush();
		const master = fake.gains[0].gain;

		enterTrickPhase();
		expect(phase()).toBe('trick');

		musicFrame(1);
		expect(musicInfo().ducked).toBe(true);
		expect(musicInfo().target).toBe(MUSIC_DUCK_MAX);
		expect(lastTarget(master)).toBe(MUSIC_DUCK_MAX);

		dispatch({ type: 'RESET' }); // leave the sim the way the other tests found it
	});
});

describe('stop clears the graph', () => {
	it('tears the engine down and is safe to call twice', async () => {
		const fake = fakeContext();
		start(fake);
		await flush();
		const source = fake.sources[0];

		stopMusic();

		const info = musicInfo();
		expect(info.running).toBe(false);
		expect(info.context).toBeNull();
		expect(info.playing).toBe(false);
		expect(info.target).toBe(0);
		expect(source.stopped).toBe(1);
		expect(fake.closeCalls).toBe(1);

		expect(() => stopMusic()).not.toThrow();
		expect(() => musicFrame(1)).not.toThrow();
		expect(() => duckMusic(true)).not.toThrow();
	});
});
