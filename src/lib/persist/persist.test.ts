import { describe, expect, it } from 'vitest';
import type { RunState } from './persist';
import { RUN_KEY, createPersist, emptyAlbum, isRunState } from './persist';

/**
 * The mirror never throws — that is the whole contract. Every hostile storage
 * here (a throwing one, a corrupt payload, a foreign version) has to end in
 * "no save" rather than a red screen at boot. A corrupted payload must also
 * *start fresh* (plan Review Focus #4): read() refuses it, a later write()
 * succeeds, and the run plays on.
 */

/** A minimal in-memory `Storage`, which is all the mirror touches. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
	const map = new Map(Object.entries(seed));
	return {
		get length() {
			return map.size;
		},
		key: (i: number) => [...map.keys()][i] ?? null,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear()
	} as Storage;
}

/** Safari private mode: the very access throws, on every method. */
function throwingStorage(): Storage {
	const boom = (): never => {
		throw new DOMException('QuotaExceededError');
	};
	return {
		get length(): number {
			return boom();
		},
		key: boom,
		getItem: boom,
		setItem: boom,
		removeItem: boom,
		clear: boom
	} as unknown as Storage;
}

/** Storage that reads fine but refuses every write: the full-quota case. */
function quotaFullStorage(storage: Storage): Storage {
	return {
		get length(): number {
			return storage.length;
		},
		key: storage.key,
		getItem: storage.getItem,
		setItem: (): void => {
			throw new DOMException('QuotaExceededError');
		},
		removeItem: storage.removeItem,
		clear: storage.clear
	} as Storage;
}

/** Writes a payload straight into the key, bypassing the mirror. */
function poison(storage: Storage, raw: string): void {
	storage.setItem(RUN_KEY, raw);
}

/** A complete, valid run — every field the mirror validates. */
function aRun(overrides: Partial<RunState> = {}): RunState {
	return {
		version: 2,
		bag: 42,
		record: 120,
		tricks: ['boo', 'ragnetto'],
		furthestK: 3,
		homes: {},
		album: emptyAlbum(),
		cosmetics: [],
		nextBossAt: 1500,
		bossWins: 0,
		...overrides
	};
}

describe('round-trip', () => {
	it('saves and restores the run', () => {
		const storage = memoryStorage();
		const mirror = createPersist(storage);
		const run = aRun();

		mirror.write(run);

		expect(mirror.read()).toEqual(run);
	});

	it('writes under the one versioned key', () => {
		const storage = memoryStorage();
		createPersist(storage).write(aRun());

		expect(JSON.parse(storage.getItem(RUN_KEY) ?? 'null')).toEqual(aRun());
	});

	it('last write wins', () => {
		const mirror = createPersist(memoryStorage());
		mirror.write(aRun({ bag: 1 }));
		mirror.write(aRun({ bag: 99 }));

		expect(mirror.read()?.bag).toBe(99);
	});

	it('clears the key so the next boot starts fresh', () => {
		const storage = memoryStorage();
		const mirror = createPersist(storage);
		mirror.write(aRun());

		mirror.clear();

		expect(storage.getItem(RUN_KEY)).toBeNull();
		expect(mirror.read()).toBeNull();
	});
});

describe('read refuses anything it cannot run', () => {
	it('returns null when there is no save', () => {
		expect(createPersist(memoryStorage()).read()).toBeNull();
	});

	it('returns null for a truncated or hand-edited payload', () => {
		const storage = memoryStorage();
		const mirror = createPersist(storage);
		for (const raw of ['{', 'not json at all', '', '[1,2,3]', 'null']) {
			poison(storage, raw);
			expect(mirror.read()).toBeNull();
		}
	});

	it('returns null for a foreign schema version', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify({ ...aRun(), version: 3 }));

		expect(createPersist(storage).read()).toBeNull();
	});

	it('returns null when a field is missing or mistyped', () => {
		const storage = memoryStorage();
		const mirror = createPersist(storage);
		for (const state of [
			{}, // no fields at all
			{ version: 2 }, // only the version
			{ version: 2, bag: 1, record: 2, furthestK: 3 }, // tricks missing
			{ version: 2, bag: 'many', record: 2, tricks: [], furthestK: 3 },
			{ version: 2, bag: 1, record: 2, tricks: 'boo', furthestK: 3 }, // not an array
			{ version: 2, bag: 1, record: 2, tricks: [42], furthestK: 3 }, // not strings
			{ version: 2, bag: 1, record: 2, tricks: [], furthestK: 'three' },
			{ version: '2', bag: 1, record: 2, tricks: [], furthestK: 3 } // version as text
		]) {
			poison(storage, JSON.stringify(state));
			expect(mirror.read()).toBeNull();
		}

		// A hand-edited `1e999` parses to Infinity (JSON.stringify would turn it
		// into null, so it has to go in as raw text).
		poison(storage, '{"version":2,"bag":1e999,"record":2,"tricks":[],"furthestK":3}');
		expect(mirror.read()).toBeNull();
	});

	it('recovers from a corrupted payload: fresh start, then a clean save (Review Focus #4)', () => {
		const storage = memoryStorage();
		const mirror = createPersist(storage);
		poison(storage, '{"version":1,"bag":4'); // a half-written save

		expect(mirror.read()).toBeNull();

		mirror.write(aRun({ bag: 7 }));

		expect(mirror.read()).toEqual(aRun({ bag: 7 }));
	});

	it('accepts exactly the states it writes', () => {
		expect(isRunState(aRun())).toBe(true);
		expect(isRunState(aRun({ tricks: [] }))).toBe(true);
		expect(isRunState({ ...aRun(), version: 3 })).toBe(false);
		expect(isRunState({ ...aRun(), version: 1 })).toBe(false);
		expect(isRunState({ ...aRun(), bag: Number.NaN })).toBe(false);
		expect(isRunState({ ...aRun(), tricks: [null] })).toBe(false);
		// Boss fields are the normaliser's job — never a refusal reason.
		expect(isRunState({ ...aRun(), bossWins: -2 })).toBe(true);
		expect(isRunState({ ...aRun(), nextBossAt: 1234 })).toBe(true);
		expect(isRunState(null)).toBe(false);
		expect(isRunState('{"version":2}')).toBe(false);
	});
});

describe('save migration and boss repair', () => {
	it('migrates v1 with the welcome boss defaults', () => {
		const storage = memoryStorage();
		poison(
			storage,
			JSON.stringify({ version: 1, bag: 5, record: 9, tricks: ['boo'], furthestK: 2 })
		);
		expect(createPersist(storage).read()).toMatchObject({
			version: 2,
			nextBossAt: 1000,
			bossWins: 0
		});
	});

	it('fills a mid-v2 save missing the boss fields', () => {
		const storage = memoryStorage();
		const mid = aRun({ bag: 5416 });
		delete mid.nextBossAt;
		delete mid.bossWins;
		poison(storage, JSON.stringify(mid));
		expect(createPersist(storage).read()).toMatchObject({
			nextBossAt: 1000,
			bossWins: 0
		});
	});

	it('repairs malformed present boss fields instead of wiping', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify({ ...aRun({ bag: 5416 }), nextBossAt: 1234, bossWins: -2 }));
		expect(createPersist(storage).read()).toMatchObject({
			bag: 5416,
			nextBossAt: 5500,
			bossWins: 0
		});
	});
});

describe('a hostile storage never breaks the game', () => {
	it('reads null and no-ops on write and clear', () => {
		const mirror = createPersist(throwingStorage());

		expect(mirror.read()).toBeNull();
		expect(() => mirror.write(aRun())).not.toThrow();
		expect(() => mirror.clear()).not.toThrow();
	});

	it('no-ops with no storage at all (SSR)', () => {
		const mirror = createPersist(null);

		expect(mirror.read()).toBeNull();
		expect(() => mirror.write(aRun())).not.toThrow();
		expect(() => mirror.clear()).not.toThrow();
	});

	it('swallows a quota failure on write', () => {
		const mirror = createPersist(quotaFullStorage(memoryStorage()));

		expect(() => mirror.write(aRun())).not.toThrow();
		expect(mirror.read()).toBeNull();
	});
});
