import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSfx } from './volumes.svelte';
import {
	CUE_GROUPS,
	CUE_NAMES,
	SFX_WITCH_URL,
	playCue,
	initSfx,
	setEnabled,
	setSfxVolume,
	sfxInfo,
	stopSfx
} from './sfx';

/**
 * T27's SFX engine, tested through a **fake AudioContext** and a **fake
 * `Audio` element** that record every call. The contract the acceptance names:
 * all 26 cue names resolve, an unknown name / no context / a hostile context is
 * a silent no-throw, the SFX slider scales the master linearly (and clamps),
 * and the owner witch file is preferred for `scare:witch` with the synth cue as
 * the fallback once the element errors.
 *
 * The environment is `node` (vite.config `test.environment`), so the *real*
 * entry points (`initSfx()`/`playCue()` with no factories) are the "no
 * AudioContext" no-op case; every other test injects the fakes through
 * `initSfx({ createContext, createAudio })` — exactly the seam a host could use.
 */

/* ------------------------------------------------------------------ */
/* A fake AudioContext that records every node it creates              */
/* ------------------------------------------------------------------ */

class FakeParam {
	value = 0;
	setValueAtTime(value: number): this {
		this.value = value;
		return this;
	}
	linearRampToValueAtTime(value: number): this {
		this.value = value;
		return this;
	}
	exponentialRampToValueAtTime(value: number): this {
		this.value = value;
		return this;
	}
	setTargetAtTime(value: number): this {
		this.value = value;
		return this;
	}
}

interface FakeGain {
	gain: FakeParam;
	connect(): unknown;
	disconnect(): void;
	disconnected?: boolean;
}

interface FakeFilter {
	type: string;
	frequency: FakeParam;
	Q: FakeParam;
	connect(): unknown;
	disconnect(): void;
	disconnected?: boolean;
}

interface FakeOscillator {
	type: string;
	frequency: FakeParam;
	connect(): unknown;
	start(): void;
	stop(): void;
	disconnect(): void;
	disconnected?: boolean;
}

interface FakeSource {
	buffer: unknown;
	connect(): unknown;
	start(): void;
	stop(): void;
	disconnect(): void;
	disconnected?: boolean;
}

interface FakeCtx {
	ctx: AudioContext;
	gains: FakeGain[];
	filters: FakeFilter[];
	oscillators: FakeOscillator[];
	sources: FakeSource[];
	resumeCalls: number;
	closeCalls: number;
}

/** A minimal AudioContext holding exactly the surface `sfx.ts` uses. */
function fakeContext(): FakeCtx {
	const gains: FakeGain[] = [];
	const filters: FakeFilter[] = [];
	const oscillators: FakeOscillator[] = [];
	const sources: FakeSource[] = [];
	const fake = { resumeCalls: 0, closeCalls: 0 } as FakeCtx;
	fake.gains = gains;
	fake.filters = filters;
	fake.oscillators = oscillators;
	fake.sources = sources;

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
				disconnect: () => {
					node.disconnected = true;
				}
			};
			gains.push(node);
			return node;
		},
		createBiquadFilter() {
			const node: FakeFilter = {
				type: 'lowpass',
				frequency: new FakeParam(),
				Q: new FakeParam(),
				connect: () => node,
				disconnect: () => {
					node.disconnected = true;
				}
			};
			filters.push(node);
			return node;
		},
		createOscillator() {
			const node: FakeOscillator = {
				type: 'sine',
				frequency: new FakeParam(),
				connect: () => node,
				start: () => {},
				stop: () => {},
				disconnect: () => {
					node.disconnected = true;
				}
			};
			oscillators.push(node);
			return node;
		},
		createBufferSource() {
			const node: FakeSource = {
				buffer: null,
				connect: () => node,
				start: () => {},
				stop: () => {},
				disconnect: () => {
					node.disconnected = true;
				}
			};
			sources.push(node);
			return node;
		},
		createBuffer(_channels: number, length: number) {
			return { getChannelData: () => new Float32Array(length) };
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
	return fake;
}

/* ------------------------------------------------------------------ */
/* A fake `Audio` element (the owner witch file)                       */
/* ------------------------------------------------------------------ */

interface FakeAudio {
	el: HTMLAudioElement;
	plays: number;
	/** Fire a registered listener (e.g. `'error'`). */
	emit(type: string): void;
}

function fakeAudio(src: string): FakeAudio {
	const listeners = new Map<string, Array<() => void>>();
	const fake: FakeAudio = {
		plays: 0,
		el: null as unknown as HTMLAudioElement,
		emit(type) {
			for (const fn of listeners.get(type) ?? []) fn();
		}
	};
	const el = {
		src,
		preload: '',
		volume: 1,
		currentTime: 0,
		addEventListener(type: string, fn: () => void) {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		play() {
			fake.plays++;
			return Promise.resolve();
		}
	};
	fake.el = el as unknown as HTMLAudioElement;
	return fake;
}

/** Starts the engine on the fakes. */
function start(fake: FakeCtx, audio: FakeAudio | null = null): void {
	initSfx({
		createContext: () => fake.ctx,
		...(audio ? { createAudio: () => audio.el } : {})
	});
}

afterEach(() => {
	stopSfx();
	setSfx(1);
});

/* ------------------------------------------------------------------ */
/* The per-cue disconnect sweep (the iOS leak guard)                   */
/* ------------------------------------------------------------------ */

describe('the per-cue disconnect sweep', () => {
	it('disconnects every node a cue created, a beat after its last stop — master excluded', () => {
		vi.useFakeTimers();
		try {
			const fake = fakeContext();
			start(fake);
			const master = fake.gains[0]; // sink() built the gate on start()
			expect(master).toBeDefined();

			const before = {
				g: fake.gains.length,
				f: fake.filters.length,
				o: fake.oscillators.length,
				s: fake.sources.length
			};
			expect(playCue('knock')).toBe(true);

			const created = [
				...fake.gains.slice(before.g),
				...fake.filters.slice(before.f),
				...fake.oscillators.slice(before.o),
				...fake.sources.slice(before.s)
			];
			expect(created.length).toBeGreaterThan(0);
			expect(created.some((n) => n.disconnected)).toBe(false); // still sounding

			vi.runAllTimers(); // the sweep fires after the cue's tail

			expect(created.every((n) => n.disconnected)).toBe(true);
			expect(master.disconnected).toBeFalsy(); // the gate survives
		} finally {
			vi.useRealTimers();
		}
	});

	it('disconnects every node of every one of the 26 cues (the drift hunt)', () => {
		// The desktop probe's live-node gap drifts +0.5/home and never closes
		// (12 → 46 over 60 homes, 2026-10-18) — some cue path leaks a node
		// past the sweep. Pin all 26: created === disconnected, master aside.
		vi.useFakeTimers();
		try {
			for (const name of CUE_NAMES) {
				const fake = fakeContext();
				const audio = fakeAudio(SFX_WITCH_URL);
				start(fake, audio);
				const master = fake.gains[0];
				const before = {
					g: fake.gains.length,
					f: fake.filters.length,
					o: fake.oscillators.length,
					s: fake.sources.length
				};

				expect(playCue(name), name).toBe(true);
				vi.runAllTimers();

				const created = [
					...fake.gains.slice(before.g),
					...fake.filters.slice(before.f),
					...fake.oscillators.slice(before.o),
					...fake.sources.slice(before.s)
				];
				const alive = created.filter((n) => !n.disconnected);
				expect(alive, `cue "${name}" left ${alive.length} node(s) connected`).toHaveLength(0);
				expect(master.disconnected).toBeFalsy(); // the gate survives every cue

				stopSfx();
			}
		} finally {
			vi.useRealTimers();
		}
	});
});

/* ------------------------------------------------------------------ */
/* The cue contract                                                    */
/* ------------------------------------------------------------------ */

describe('the 26-cue contract (spec §11 / §16)', () => {
	it('ships 10 UI + 10 theatre + 6 scares, flattened to 26 names', () => {
		expect(CUE_GROUPS.ui).toHaveLength(10);
		expect(CUE_GROUPS.theatre).toHaveLength(10);
		expect(CUE_GROUPS.scares).toHaveLength(6);
		expect(CUE_NAMES).toHaveLength(26);
		expect(new Set(CUE_NAMES).size).toBe(26);
	});

	it('resolves every one of the 26 cue names through playCue', () => {
		const fake = fakeContext();
		const audio = fakeAudio(SFX_WITCH_URL);
		start(fake, audio);
		for (const name of CUE_NAMES) {
			expect(playCue(name), name).toBe(true);
		}
	});

	it('names one fire:<trick> cue per trick and one theatre-setup/laugh', () => {
		const fire = CUE_NAMES.filter((n) => n.startsWith('fire:'));
		expect(fire).toHaveLength(8);
		expect(CUE_NAMES).toContain('theatre-setup');
		expect(CUE_NAMES).toContain('theatre-laugh');
	});

	it('names the six scare cues the scare model can pick', () => {
		expect([...CUE_GROUPS.scares]).toEqual([
			'scare:witch',
			'scare:wolf',
			'scare:vampire',
			'scare:skeleton',
			'scare:mummy',
			'scare:thunder'
		]);
	});
});

/* ------------------------------------------------------------------ */
/* Never throws                                                        */
/* ------------------------------------------------------------------ */

describe('never throws, never surprises', () => {
	it('answers false for an unknown cue name', () => {
		const fake = fakeContext();
		start(fake);
		expect(playCue('nope')).toBe(false);
		expect(playCue('')).toBe(false);
		expect(playCue('fire:unknown')).toBe(false);
	});

	it('is a silent no-op with no AudioContext (node / SSR)', () => {
		expect(() => initSfx()).not.toThrow();
		expect(initSfx()).toBe(false);
		expect(sfxInfo().ready).toBe(false);
		for (const name of CUE_NAMES) expect(() => playCue(name)).not.toThrow();
		expect(playCue('coin')).toBe(false);
	});

	it('swallows a throwing context factory and a null one', () => {
		expect(() =>
			initSfx({
				createContext: () => {
					throw new Error('no audio here');
				}
			})
		).not.toThrow();
		expect(sfxInfo().ready).toBe(false);
		expect(playCue('knock')).toBe(false);

		initSfx({ createContext: () => null });
		expect(playCue('knock')).toBe(false);
	});

	it('follows the prototype’s kill-the-rest discipline for one bad cue', () => {
		const fake = fakeContext();
		// A context whose gain factory throws: the try/catch must keep it total.
		(fake.ctx as unknown as { createGain: () => never }).createGain = () => {
			throw new Error('boom');
		};
		initSfx({ createContext: () => fake.ctx });
		expect(() => playCue('knock')).not.toThrow();
	});
});

/* ------------------------------------------------------------------ */
/* The mute + the SFX slider                                           */
/* ------------------------------------------------------------------ */

describe('the mute and the SFX slider (spec §11)', () => {
	it('scales the master gain linearly with the slider and clamps', () => {
		const fake = fakeContext();
		start(fake);
		expect(fake.gains).toHaveLength(1); // the master, built on init
		const master = fake.gains[0].gain;

		expect(setSfxVolume(0.5)).toBe(0.5);
		expect(master.value).toBe(0.5);
		expect(setSfxVolume(2)).toBe(1);
		expect(master.value).toBe(1);
		expect(setSfxVolume(-3)).toBe(0);
		expect(master.value).toBe(0);
	});

	it('repairs a non-finite slider value to full (the prototype’s setVolume)', () => {
		const fake = fakeContext();
		start(fake);
		const master = fake.gains[0].gain;

		setSfxVolume(0.25);
		expect(setSfxVolume(Number.NaN)).toBe(1);
		expect(setSfxVolume(Infinity)).toBe(1);
		expect(Number.isFinite(master.value)).toBe(true);
	});

	it('mutes new cues and zeroes the live master', () => {
		const fake = fakeContext();
		start(fake);
		const master = fake.gains[0].gain;

		expect(playCue('coin')).toBe(true);
		expect(setEnabled(false)).toBe(false);
		expect(master.value).toBe(0);
		expect(playCue('coin')).toBe(false);

		expect(setEnabled(true)).toBe(true);
		expect(master.value).toBe(1);
		expect(playCue('coin')).toBe(true);
	});

	it('a muted-slider master still gates but the volume persists for release', () => {
		const fake = fakeContext();
		start(fake);
		const master = fake.gains[0].gain;

		setSfxVolume(0.4);
		setEnabled(false);
		expect(master.value).toBe(0);
		setEnabled(true);
		expect(master.value).toBe(0.4);
	});
});

/* ------------------------------------------------------------------ */
/* The owner witch file override                                       */
/* ------------------------------------------------------------------ */

describe('scare:witch prefers the owner file (spec §11)', () => {
	it('points at the versioned owner path', () => {
		expect(SFX_WITCH_URL).toBe('/sfx/scare-witch.v1.mp3');
	});

	it('plays the file at the SFX-slider volume, rewound, on the first request', () => {
		const fake = fakeContext();
		const audio = fakeAudio(SFX_WITCH_URL);
		start(fake, audio);
		setSfx(0.5);

		expect(playCue('scare:witch')).toBe(true);
		expect(audio.plays).toBe(1);
		expect(audio.el.volume).toBe(0.5);
		expect(audio.el.currentTime).toBe(0);
		expect(sfxInfo().witchSrc).toBe(SFX_WITCH_URL);
		expect(sfxInfo().witchFileBroken).toBe(false);
		// The synth cue is NOT scheduled while the file is healthy.
		expect(fake.sources).toHaveLength(0);
		expect(fake.oscillators).toHaveLength(0);
	});

	it('never touches the file for the other 25 cues', () => {
		const fake = fakeContext();
		const audio = fakeAudio(SFX_WITCH_URL);
		start(fake, audio);

		for (const name of CUE_NAMES) {
			if (name === 'scare:witch') continue;
			playCue(name);
		}
		expect(audio.plays).toBe(0);
	});

	it('falls back to the synth cue once the file raises error', () => {
		const fake = fakeContext();
		const audio = fakeAudio(SFX_WITCH_URL);
		start(fake, audio);

		// Build the element (and its error listener) with a healthy first play.
		expect(playCue('scare:witch')).toBe(true);
		expect(fake.oscillators).toHaveLength(0);

		audio.emit('error');
		expect(sfxInfo().witchFileBroken).toBe(true);

		const playsBefore = audio.plays;
		expect(playCue('scare:witch')).toBe(true);
		expect(audio.plays).toBe(playsBefore); // the file is never replayed
		// The synth scare:witch, on the other hand, did schedule.
		expect(fake.oscillators.length).toBeGreaterThan(0);
	});

	it('falls through to the synth when there is no Audio element at all', () => {
		const fake = fakeContext();
		// No createAudio factory: `defaultAudio` is null under node.
		start(fake);
		expect(playCue('scare:witch')).toBe(true);
		expect(fake.oscillators.length).toBeGreaterThan(0);
	});

	it('zeroes the file volume under a mute', () => {
		const fake = fakeContext();
		const audio = fakeAudio(SFX_WITCH_URL);
		start(fake, audio);
		setSfx(0.8);

		// Build the element at the slider volume first…
		expect(playCue('scare:witch')).toBe(true);
		expect(audio.el.volume).toBe(0.8);

		// …then mute: the live element is cut, and no new cue is scheduled.
		expect(setEnabled(false)).toBe(false);
		expect(audio.el.volume).toBe(0);
		expect(playCue('scare:witch')).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/* The master gain is the only gate                                    */
/* ------------------------------------------------------------------ */

describe('the master gain is the one sink', () => {
	it('routes a scheduled cue through the master, not straight to destination', () => {
		const fake = fakeContext();
		start(fake);
		const gainsBefore = fake.gains.length;

		playCue('knock');
		// Every cue gain (knock stacks several) is created after the master.
		expect(fake.gains.length).toBeGreaterThan(gainsBefore);
		expect(fake.oscillators.length).toBeGreaterThan(0);
		// The context is resumed on the gesture/cue.
		expect(fake.resumeCalls).toBeGreaterThanOrEqual(1);
	});
});
