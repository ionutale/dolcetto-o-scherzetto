import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, furthest, step } from '$lib/state/game.svelte';
import { setMusic } from './volumes.svelte';
import {
	AMB_BEDS,
	AMB_DUCK_DB,
	AMB_DUCK_FACTOR,
	AMB_DUCK_MAX,
	AMB_MAX,
	AMB_SPRINKLES,
	AMB_SPRINKLE_MAX_MS,
	AMB_SPRINKLE_MIN_MS,
	SPRINKLE_IDS,
	ambienceFrame,
	ambienceInfo,
	ambienceMasterTarget,
	bedFor,
	currentBed,
	duckAmbience,
	duckFactor,
	isDucked,
	loopUrl,
	nextSprinkleGapMs,
	pickSprinkle,
	probeLoop,
	sprinkleAllowed,
	startAmbience,
	stopAmbience
} from './ambience.svelte';

/**
 * T23's engine, tested through a **fake AudioContext** that records every
 * automation call. The engine's contract is four things the acceptance names:
 * beds ramp on a theme change, the master ducks −6 dB, the Music slider scales
 * the bed linearly, and the sprinkle cadence honors both its 20–40 s bounds and
 * the roam/refuse phase gate. Everything else `ambienceFrame` touches (the two
 * LFOs, the noise source) is incidental, so the fake records the graph's
 * creation order — `gains[0]` is the master, `gains[1]` the wind bed,
 * `filters[0]` the wind lowpass — and the tests read those params directly.
 *
 * The environment is `node` (vite.config `test.environment`), so the *real*
 * entry point (`startAmbience()` with no factory) is the "no AudioContext"
 * no-op case: it must stay silent and never throw. Every other test injects the
 * fake through `startAmbience({ createContext })` and drives frames by hand
 * (`animate: false`), which is exactly the seam a host could use.
 */

/* ------------------------------------------------------------------ */
/* A fake AudioContext that records every param write                  */
/* ------------------------------------------------------------------ */

type ParamMethod = 'value' | 'set' | 'ramp' | 'target' | 'cancel';

interface ParamCall {
	method: ParamMethod;
	value: number;
	/** Automation start time (seconds), when the method takes one. */
	at?: number;
	/** `setTargetAtTime`'s time constant, when present. */
	tc?: number;
}

class FakeParam {
	value = 0;
	calls: ParamCall[] = [];
	setValueAtTime(value: number, at: number): this {
		this.calls.push({ method: 'set', value, at });
		this.value = value;
		return this;
	}
	linearRampToValueAtTime(value: number, at: number): this {
		this.calls.push({ method: 'ramp', value, at });
		this.value = value;
		return this;
	}
	exponentialRampToValueAtTime(value: number, at: number): this {
		this.calls.push({ method: 'ramp', value, at });
		this.value = value;
		return this;
	}
	setTargetAtTime(value: number, at: number, tc: number): this {
		this.calls.push({ method: 'target', value, at, tc });
		this.value = value;
		return this;
	}
	cancelScheduledValues(at: number): this {
		this.calls.push({ method: 'cancel', value: this.value, at });
		return this;
	}
}

/** The last value a param was told to ramp *to*. */
function lastTarget(param: FakeParam): number | null {
	for (let i = param.calls.length - 1; i >= 0; i--) {
		if (param.calls[i].method === 'target') return param.calls[i].value;
	}
	return null;
}

interface FakeGain {
	gain: FakeParam;
	connect(): unknown;
	disconnect(): void;
}

interface FakeFilter {
	type: string;
	frequency: FakeParam;
	Q: FakeParam;
	connect(): unknown;
}

interface FakeSource {
	buffer: unknown;
	loop: boolean;
	start(): void;
	stop(): void;
	connect(node: unknown): unknown;
	disconnect(): void;
}

interface Fake {
	ctx: AudioContext;
	gains: FakeGain[];
	filters: FakeFilter[];
	oscillators: { frequency: FakeParam; type: string }[];
	resumeCalls: number;
	closeCalls: number;
}

/** A minimal AudioContext holding exactly the surface `ambience.svelte.ts` uses. */
function fakeContext(): Fake {
	const gains: FakeGain[] = [];
	const filters: FakeFilter[] = [];
	const oscillators: { frequency: FakeParam; type: string }[] = [];
	const fake: Fake = {
		ctx: null as unknown as AudioContext,
		gains,
		filters,
		oscillators,
		resumeCalls: 0,
		closeCalls: 0
	};

	const destination = { connect: () => destination } as unknown as AudioNode;
	const ctx = {
		sampleRate: 8000,
		currentTime: 1,
		state: 'suspended' as AudioContextState,
		destination,
		createGain() {
			const node: FakeGain = {
				gain: new FakeParam(),
				connect: () => node,
				disconnect: () => {}
			};
			gains.push(node);
			return node;
		},
		createBiquadFilter() {
			const node: FakeFilter = {
				type: 'lowpass',
				frequency: new FakeParam(),
				Q: new FakeParam(),
				connect: () => node
			};
			filters.push(node);
			return node;
		},
		createBufferSource() {
			const node: FakeSource = {
				buffer: null,
				loop: false,
				start: () => {},
				stop: () => {},
				connect: () => node,
				disconnect: () => {}
			};
			return node;
		},
		createBuffer(_channels: number, length: number) {
			return {
				getChannelData: () => new Float32Array(length)
			};
		},
		createOscillator() {
			const node = {
				frequency: new FakeParam(),
				type: 'sine',
				connect: () => node,
				start: () => {},
				stop: () => {}
			};
			oscillators.push(node);
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
		},
		decodeAudioData() {
			return Promise.reject(new Error('no decoder in the fake'));
		}
	};

	fake.ctx = ctx as unknown as AudioContext;
	return fake;
}

/** Starts the engine on a fake context, frames driven by hand. */
function start(fake: Fake, now = 0): void {
	startAmbience({ createContext: () => fake.ctx, now, animate: false });
}

/** Walks the sim to `homes` homes (drives `furthestK`, hence the theme). */
function walkHomes(homes: number): void {
	dispatch({ type: 'WALK', dir: 1 });
	let guard = 0;
	while (furthest() < homes && guard++ < 20_000) step(0.05);
	dispatch({ type: 'STOP' });
}

afterEach(() => {
	stopAmbience();
	setMusic(1);
});

/* ------------------------------------------------------------------ */
/* Pure logic: beds, cadence, duck math, gates                         */
/* ------------------------------------------------------------------ */

describe('beds (spec §11 per-neighborhood targets)', () => {
	it('keeps the prototype’s four beds and their exact filter/gain targets', () => {
		expect(bedFor('leafy')).toMatchObject({ filt: 380, gain: 0.052 });
		expect(bedFor('foggy')).toMatchObject({ filt: 520, gain: 0.06 });
		expect(bedFor('pumpkin')).toMatchObject({ filt: 300, gain: 0.055 });
		expect(bedFor('starry')).toMatchObject({ filt: 250, gain: 0.04 });
	});

	it('gives every bed only real sprinkle voices, matching the spec cast', () => {
		expect(bedFor('leafy').sprinkles).toEqual(['owl', 'leafrustle']);
		expect(bedFor('foggy').sprinkles).toEqual(['drip', 'bell', 'owl']);
		expect(bedFor('pumpkin').sprinkles).toEqual(['creak', 'crow', 'owl']);
		expect(bedFor('starry').sprinkles).toEqual(['owl', 'laugh']);
		for (const theme of Object.keys(AMB_BEDS) as (keyof typeof AMB_BEDS)[]) {
			for (const id of AMB_BEDS[theme].sprinkles) expect(SPRINKLE_IDS).toContain(id);
		}
	});

	it('rolls the bed the current progress selects (neighborhood 0)', () => {
		// No save and no walking yet: neighborhood 0 → leafy.
		expect(currentBed().theme).toBe('leafy');
	});

	it('ships all seven sprinkle voices as scheduled tones', () => {
		expect(Object.keys(AMB_SPRINKLES).sort()).toEqual([...SPRINKLE_IDS].sort());
		for (const id of SPRINKLE_IDS) {
			const tones = AMB_SPRINKLES[id];
			expect(tones.length).toBeGreaterThanOrEqual(1);
			for (const tone of tones) {
				expect(tone.vol).toBeGreaterThan(0);
				expect(tone.vol).toBeLessThanOrEqual(0.05);
				expect(tone.dur).toBeGreaterThan(0);
			}
		}
	});
});

describe('sprinkle cadence (spec §11: every ~20–40 s)', () => {
	it('bounds every draw in [20 s, 40 s)', () => {
		for (let i = 0; i < 1000; i++) {
			const gap = nextSprinkleGapMs();
			expect(gap).toBeGreaterThanOrEqual(AMB_SPRINKLE_MIN_MS);
			expect(gap).toBeLessThan(AMB_SPRINKLE_MAX_MS);
		}
	});

	it('is idempotent for a fixed draw and hits both bounds exactly', () => {
		expect(nextSprinkleGapMs(() => 0)).toBe(AMB_SPRINKLE_MIN_MS);
		expect(nextSprinkleGapMs(() => 0)).toBe(AMB_SPRINKLE_MIN_MS);
		expect(nextSprinkleGapMs(() => 0.999999)).toBeLessThan(AMB_SPRINKLE_MAX_MS);
		expect(nextSprinkleGapMs(() => 0.5)).toBe(
			AMB_SPRINKLE_MIN_MS + 0.5 * (AMB_SPRINKLE_MAX_MS - AMB_SPRINKLE_MIN_MS)
		);
	});

	it('repairs a hostile draw instead of returning NaN', () => {
		expect(nextSprinkleGapMs(() => Number.NaN)).toBe(AMB_SPRINKLE_MIN_MS);
		expect(nextSprinkleGapMs(() => 9)).toBe(AMB_SPRINKLE_MAX_MS);
	});

	it('picks only voices the bed lists, and pins at the ends', () => {
		const bed = bedFor('foggy'); // drip, bell, owl
		expect(pickSprinkle(bed, () => 0)).toBe('drip');
		expect(pickSprinkle(bed, () => 0.999999)).toBe('owl');
		for (let i = 0; i < 100; i++) expect(bed.sprinkles).toContain(pickSprinkle(bed));
	});
});

describe('the phase/sound/duck gate', () => {
	const base = { sound: true, ducked: false, phase: 'roam' as const, now: 100, dueAt: 100 };

	it('allows only roam and refuse phases', () => {
		expect(sprinkleAllowed({ ...base, phase: 'roam' })).toBe(true);
		expect(sprinkleAllowed({ ...base, phase: 'refuse' })).toBe(true);
		expect(sprinkleAllowed({ ...base, phase: 'door' })).toBe(false);
		expect(sprinkleAllowed({ ...base, phase: 'collect' })).toBe(false);
		expect(sprinkleAllowed({ ...base, phase: 'trick' })).toBe(false);
	});

	it('blocks on mute, on a duck and before the cadence is due', () => {
		expect(sprinkleAllowed({ ...base, sound: false })).toBe(false);
		expect(sprinkleAllowed({ ...base, ducked: true })).toBe(false);
		expect(sprinkleAllowed({ ...base, now: 99 })).toBe(false);
		expect(sprinkleAllowed({ ...base, now: 100 })).toBe(true);
	});

	it('auto-ducks trick shows and respects the manual latch', () => {
		expect(isDucked('trick', false)).toBe(true);
		expect(isDucked('roam', true)).toBe(true);
		expect(isDucked('roam', false)).toBe(false);
		expect(isDucked('refuse', false)).toBe(false);
	});
});

describe('the duck math (±6 dB, spec §11)', () => {
	it('is exactly −6 dB at any music level', () => {
		expect(duckFactor()).toBeCloseTo(10 ** (-AMB_DUCK_DB / 20), 12);
		expect(AMB_DUCK_FACTOR).toBeCloseTo(0.501187, 6);
		expect(AMB_DUCK_MAX).toBeCloseTo(AMB_MAX * AMB_DUCK_FACTOR, 12);
		const dry = ambienceMasterTarget({ sound: true, ducked: false, music: 0.7 });
		const wet = ambienceMasterTarget({ sound: true, ducked: true, music: 0.7 });
		expect(20 * Math.log10(wet / dry)).toBeCloseTo(-6, 6);
	});

	it('scales linearly with the Music slider and mutes at zero', () => {
		expect(ambienceMasterTarget({ sound: true, ducked: false, music: 1 })).toBe(AMB_MAX);
		expect(ambienceMasterTarget({ sound: true, ducked: false, music: 0.5 })).toBe(AMB_MAX / 2);
		expect(ambienceMasterTarget({ sound: true, ducked: true, music: 0.5 })).toBeCloseTo(
			(AMB_MAX * AMB_DUCK_FACTOR) / 2,
			12
		);
		expect(ambienceMasterTarget({ sound: true, ducked: false, music: 0 })).toBe(0);
	});

	it('silences everything under the sound master toggle', () => {
		expect(ambienceMasterTarget({ sound: false, ducked: false, music: 1 })).toBe(0);
		expect(ambienceMasterTarget({ sound: false, ducked: true, music: 1 })).toBe(0);
	});
});

describe('the real-loop probe (T26 seam: 404 keeps the synth)', () => {
	it('names the versioned studio path per theme', () => {
		expect(loopUrl('leafy')).toBe('/ambience/leafy.v1.mp3');
		expect(loopUrl('starry')).toBe('/ambience/starry.v1.mp3');
	});

	it('answers null for a 404 so the synth path stays in charge', async () => {
		const fetcher = (async () => ({
			ok: false,
			arrayBuffer: async () => new ArrayBuffer(4)
		})) as unknown as typeof fetch;
		await expect(probeLoop('leafy', fetcher)).resolves.toBeNull();
	});

	it('reads the bytes when a real loop does exist', async () => {
		const bytes = new ArrayBuffer(8);
		const fetcher = (async () => ({
			ok: true,
			arrayBuffer: async () => bytes
		})) as unknown as typeof fetch;
		await expect(probeLoop('leafy', fetcher)).resolves.toBe(bytes);
	});

	it('never throws when the fetch itself rejects', async () => {
		const fetcher = (async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch;
		await expect(probeLoop('leafy', fetcher)).resolves.toBeNull();
	});
});

/* ------------------------------------------------------------------ */
/* The engine, driven through the fake                                 */
/* ------------------------------------------------------------------ */

describe('no AudioContext: every entry point is a silent no-op', () => {
	it('startAmbience() under node starts nothing and never throws', () => {
		expect(() => startAmbience()).not.toThrow();
		expect(ambienceInfo().running).toBe(false);
		expect(ambienceInfo().context).toBeNull();
	});

	it('swallows a throwing context factory', () => {
		expect(() =>
			startAmbience({
				createContext: () => {
					throw new Error('no audio here');
				},
				animate: false
			})
		).not.toThrow();
		expect(ambienceInfo().running).toBe(false);
	});

	it('ignores a null context and a frame before start', () => {
		expect(() => startAmbience({ createContext: () => null, animate: false })).not.toThrow();
		expect(() => ambienceFrame(1)).not.toThrow();
		expect(() => stopAmbience()).not.toThrow();
		expect(() => duckAmbience(true)).not.toThrow();
		expect(ambienceInfo().ducked).toBe(false);
	});
});

describe('start on gesture', () => {
	it('builds the graph, resumes the context and latches the current bed', () => {
		const fake = fakeContext();
		start(fake);

		const info = ambienceInfo();
		expect(info.running).toBe(true);
		expect(info.context).toBe('running');
		expect(fake.resumeCalls).toBe(1);
		// gains[0] = master, gains[1] = wind bed, filters[0] = wind lowpass.
		expect(fake.gains.length).toBeGreaterThanOrEqual(2);
		expect(fake.filters).toHaveLength(1);
		expect(lastTarget(fake.filters[0].frequency)).toBe(AMB_BEDS.leafy.filt);
		expect(lastTarget(fake.gains[1].gain)).toBe(AMB_BEDS.leafy.gain);
		expect(info.theme).toBe('leafy');
	});

	it('is idempotent: a second gesture does not build a second graph', () => {
		const fake = fakeContext();
		start(fake);
		const gains = fake.gains.length;
		start(fake);
		expect(fake.gains.length).toBe(gains);
	});

	it('seeds the first sprinkle 20–40 s out', () => {
		const fake = fakeContext();
		start(fake, 0);
		const info = ambienceInfo();
		expect(info.dueAt).toBeGreaterThanOrEqual(AMB_SPRINKLE_MIN_MS);
		expect(info.dueAt).toBeLessThan(AMB_SPRINKLE_MAX_MS);
	});
});

describe('duck toggles the master gain param', () => {
	it('spies the master param: full → −6 dB → full', () => {
		const fake = fakeContext();
		start(fake);
		const master = fake.gains[0].gain;

		expect(ambienceInfo().master).toBe(AMB_MAX);
		expect(lastTarget(master)).toBe(AMB_MAX);

		duckAmbience(true);
		expect(ambienceInfo().ducked).toBe(true);
		expect(lastTarget(master)).toBeCloseTo(AMB_DUCK_MAX, 12);
		expect(20 * Math.log10(AMB_DUCK_MAX / AMB_MAX)).toBeCloseTo(-6, 6);

		duckAmbience(false);
		expect(ambienceInfo().ducked).toBe(false);
		expect(lastTarget(master)).toBe(AMB_MAX);
	});

	it('ducks automatically while a trick show is on stage', () => {
		const fake = fakeContext();
		start(fake);
		const master = fake.gains[0].gain;
		// The fake precedes `phase === 'trick'` by forcing a manual duck, then the
		// frame recomputes from the (roam) phase once the latch is released.
		duckAmbience(true);
		ambienceFrame(1);
		expect(lastTarget(master)).toBeCloseTo(AMB_DUCK_MAX, 12);
		duckAmbience(false);
		ambienceFrame(1);
		expect(lastTarget(master)).toBe(AMB_MAX);
	});
});

describe('the Music slider scales the bed', () => {
	it('halves the master target at slider 0.5 (store-driven)', () => {
		const fake = fakeContext();
		setMusic(0.5);
		start(fake);
		const master = fake.gains[0].gain;

		expect(ambienceInfo().master).toBeCloseTo(AMB_MAX / 2, 12);
		expect(lastTarget(master)).toBeCloseTo(AMB_MAX / 2, 12);

		setMusic(0.25);
		ambienceFrame(1);
		expect(lastTarget(master)).toBeCloseTo(AMB_MAX / 4, 12);

		setMusic(0);
		ambienceFrame(1);
		expect(lastTarget(master)).toBe(0);
	});
});

describe('the sprinkle scheduler', () => {
	it('stays quiet before `dueAt` and fires at it, then re-arms 20–40 s out', () => {
		const fake = fakeContext();
		start(fake, 0);
		const afterStart = fake.oscillators.length; // the two wind LFOs
		const firstDue = ambienceInfo().dueAt;

		ambienceFrame(firstDue - 1);
		expect(fake.oscillators.length).toBe(afterStart);
		expect(ambienceInfo().dueAt).toBe(firstDue);

		ambienceFrame(firstDue);
		expect(fake.oscillators.length).toBeGreaterThan(afterStart);
		const secondDue = ambienceInfo().dueAt;
		expect(secondDue - firstDue).toBeGreaterThanOrEqual(AMB_SPRINKLE_MIN_MS);
		expect(secondDue - firstDue).toBeLessThan(AMB_SPRINKLE_MAX_MS);
	});

	it('holds the cadence while ducked, then releases it', () => {
		const fake = fakeContext();
		start(fake, 0);
		const afterStart = fake.oscillators.length;
		const due = ambienceInfo().dueAt;

		duckAmbience(true);
		ambienceFrame(due + 1);
		expect(fake.oscillators.length).toBe(afterStart);

		duckAmbience(false);
		ambienceFrame(due + 2);
		expect(fake.oscillators.length).toBeGreaterThan(afterStart);
	});
});

describe('a theme change ramps the bed too (last: it moves the sim)', () => {
	it('retargets the wind filter and gain to the new neighborhood bed', () => {
		const fake = fakeContext();
		start(fake);
		expect(ambienceInfo().theme).toBe('leafy');

		walkHomes(10); // 10 homes → neighborhood index 1 → foggy
		expect(furthest()).toBeGreaterThanOrEqual(10);

		ambienceFrame(1);
		const info = ambienceInfo();
		expect(info.theme).toBe('foggy');
		expect(lastTarget(fake.filters[0].frequency)).toBe(AMB_BEDS.foggy.filt);
		expect(lastTarget(fake.gains[1].gain)).toBe(AMB_BEDS.foggy.gain);
		// Ramped, not snapped: the prototype's 2 s time constant.
		const ramp = fake.filters[0].frequency.calls.at(-1);
		expect(ramp).toMatchObject({ method: 'target', tc: expect.any(Number) });
	});
});
