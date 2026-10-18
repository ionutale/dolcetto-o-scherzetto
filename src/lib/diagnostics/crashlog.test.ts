import { describe, expect, it } from 'vitest';
import {
	CRASHLOG_LIVE_KEY,
	CRASHLOG_PREV_KEY,
	CRASH_WINDOW_MS,
	createCrashLog,
	fmtDur,
	parseEntries,
	scrubPayload
} from './crashlog';
import type { BootMeta } from './crashlog';

/**
 * Pinning suite for the black box (`crashlog.ts`) — the crash recorder the
 * owner asked for after Safari's remote debugger kept dying with the page:
 *
 *   1. the live session is written through to localStorage at boot, on
 *      critical events and on `end`;
 *   2. a previous session that ended abruptly *and recently* is archived and
 *      flagged as crashed (a clean close, or a stale session, is not);
 *   3. every payload is scrubbed and capped, and a hostile storage degrades
 *      to memory-only instead of throwing.
 *
 * No window, no rAF: everything the factory needs (clock, meta) is injected.
 */

/** A Map-backed `Storage` that records what was written. */
function memStorage(initial: Record<string, string> = {}): Storage {
	const map = new Map(Object.entries(initial));
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
		key: (i: number) => [...map.keys()][i] ?? null,
		removeItem: (key: string) => {
			map.delete(key);
		},
		setItem: (key: string, value: string) => {
			map.set(key, String(value));
		}
	} as Storage;
}

/** A storage that throws on every method — Safari private mode's worst day. */
function hostileStorage(): Storage {
	const boom = (): never => {
		throw new Error('hostile storage');
	};
	return {
		get length(): number {
			return boom();
		},
		clear: boom,
		getItem: boom,
		key: boom,
		removeItem: boom,
		setItem: boom
	} as unknown as Storage;
}

/** Deterministic boot metadata — no navigator, no screen. */
const testMeta = (at: number): BootMeta => ({
	at,
	v: 'test-build',
	ua: 'ua-test',
	ios: 'OS 18_5',
	mode: 'standalone',
	lang: 'it',
	screen: '852x393@3',
	nav: 'navigate'
});

/** A seeded previous session: boot at `at`, one last entry at `lastT`. */
function seedSession(at: number, lastT: number, ended = false): string {
	return JSON.stringify([
		{ t: 0, k: 'boot', d: { at } },
		{ t: lastT, k: ended ? 'end' : 'hb', d: { el: 100 } }
	]);
}

/** A mono-tonic fake clock the tests advance by hand. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('boot and the live session', () => {
	it('writes the boot entry through to storage immediately', () => {
		const storage = memStorage();
		createCrashLog(storage, { now: () => 1000, meta: testMeta });
		const live = parseEntries(storage.getItem(CRASHLOG_LIVE_KEY));
		expect(live).toHaveLength(1);
		expect(live[0].k).toBe('boot');
		expect(live[0].t).toBe(0);
		expect(live[0].d?.v).toBe('test-build');
		expect(live[0].d?.mode).toBe('standalone');
	});

	it('stamps entries with ms since session start, using the injected clock', () => {
		const clock = fakeClock();
		const log = createCrashLog(memStorage(), { now: clock.now, meta: testMeta });
		clock.advance(1500);
		log.log('hb', { el: 1 });
		clock.advance(500);
		log.log('ph', { to: 'door' });
		const { live } = log.snapshot();
		expect(live.map((e) => e.t)).toEqual([0, 1500, 2000]);
		expect(live[2].k).toBe('ph');
	});

	it('end() appends the closing entry so the next boot reads a clean session', () => {
		const storage = memStorage();
		const clock = fakeClock();
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		clock.advance(5000);
		log.end();
		const live = parseEntries(storage.getItem(CRASHLOG_LIVE_KEY));
		expect(live[live.length - 1].k).toBe('end');
	});

	it('keeps the ring bounded when flooded', () => {
		const log = createCrashLog(memStorage(), { now: () => 0, meta: testMeta, cap: 10 });
		for (let i = 0; i < 50; i++) log.log('hb', { i });
		const { live } = log.snapshot();
		expect(live).toHaveLength(10);
		expect(live[live.length - 1].d?.i).toBe(49);
	});
});

describe('crash detection', () => {
	it('flags an abrupt, recent previous session and archives it', () => {
		const clock = fakeClock();
		// Prev session: booted 30 s ago, last heartbeat 5 s ago, no end.
		const storage = memStorage({ [CRASHLOG_LIVE_KEY]: seedSession(clock.now() - 30_000, 25_000) });
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		const info = log.info();
		expect(info.crashed).toBe(true);
		expect(info.prev).toHaveLength(2);
		// The archive key carries the raw previous session.
		expect(parseEntries(storage.getItem(CRASHLOG_PREV_KEY))).toHaveLength(2);
		// And the live key now holds the fresh boot, not the old session.
		expect(parseEntries(storage.getItem(CRASHLOG_LIVE_KEY))).toHaveLength(1);
	});

	it('does not flag a session that closed cleanly', () => {
		const clock = fakeClock();
		const storage = memStorage({
			[CRASHLOG_LIVE_KEY]: seedSession(clock.now() - 30_000, 25_000, true)
		});
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(false);
		expect(storage.getItem(CRASHLOG_PREV_KEY)).toBeNull();
	});

	it('does not flag when teardown crumbs follow the end marker', () => {
		// The real reload path: `pagehide` writes `end`, then the engine fires
		// `visibilitychange(hidden)` on the dying document. Still a clean close.
		const clock = fakeClock();
		const boot = clock.now() - 20_000;
		const storage = memStorage({
			[CRASHLOG_LIVE_KEY]: JSON.stringify([
				{ t: 0, k: 'boot', d: { at: boot } },
				{ t: 15_000, k: 'hb', d: { el: 1200 } },
				{ t: 19_000, k: 'end', d: { at: boot + 19_000 } },
				{ t: 19_400, k: 'vis', d: { v: 'hidden' } }
			])
		});
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(false);
		expect(storage.getItem(CRASHLOG_PREV_KEY)).toBeNull();
	});

	it('still flags a session whose tail is only backgrounding crumbs', () => {
		// Backgrounded (vis: hidden) and then killed by the OS with no end:
		// that IS the crash the owner sees as "back to the main menu".
		const clock = fakeClock();
		const boot = clock.now() - 20_000;
		const storage = memStorage({
			[CRASHLOG_LIVE_KEY]: JSON.stringify([
				{ t: 0, k: 'boot', d: { at: boot } },
				{ t: 15_000, k: 'hb', d: { el: 1200 } },
				{ t: 19_000, k: 'vis', d: { v: 'hidden' } }
			])
		});
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(true);
	});

	it('does not flag a stale session (the app was simply not reopened)', () => {
		const clock = fakeClock();
		// Booted 15 min ago, last heartbeat 10 min ago: the last beat is far
		// outside the crash window, so this is a closed-but-unmarked session,
		// not a crash.
		const storage = memStorage({
			[CRASHLOG_LIVE_KEY]: seedSession(clock.now() - 15 * 60_000, 5 * 60_000)
		});
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(false);
	});

	it('treats the edge of the crash window as inside it', () => {
		const clock = fakeClock();
		const storage = memStorage({
			[CRASHLOG_LIVE_KEY]: seedSession(clock.now() - CRASH_WINDOW_MS, CRASH_WINDOW_MS)
		});
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(true);
	});

	it('ignores garbage in the live key and boots clean', () => {
		const storage = memStorage({ [CRASHLOG_LIVE_KEY]: 'not json {' });
		const log = createCrashLog(storage, { now: () => 0, meta: testMeta });
		expect(log.info().crashed).toBe(false);
		expect(log.snapshot().live).toHaveLength(1);
	});
});

describe('scrubbing', () => {
	it('cuts long strings and keeps primitives', () => {
		const out = scrubPayload({ m: 'x'.repeat(500), n: 3.5, b: true, zero: 0 });
		expect((out.m as string).length).toBe(160);
		expect(out.n).toBe(3.5);
		expect(out.b).toBe(true);
		expect(out.zero).toBe(0);
	});

	it('degrades deep structures and drops functions/undefined', () => {
		const out = scrubPayload({
			deep: { a: { b: { c: 1 } } },
			fn: () => 1,
			missing: undefined,
			list: Array.from({ length: 30 }, (_, i) => i)
		});
		expect(out.deep).toEqual({ a: '[deep]' });
		expect('fn' in out).toBe(false);
		expect('missing' in out).toBe(false);
		expect((out.list as number[]).length).toBe(10);
	});

	it('replaces a cyclic payload instead of throwing', () => {
		type Node = { self?: unknown };
		const node: Node = {};
		node.self = node;
		const out = scrubPayload(node as Record<string, unknown>);
		expect(out).toBeTruthy();
	});

	it('replaces an over-cap payload with its size', () => {
		const big: Record<string, unknown> = {};
		for (let i = 0; i < 12; i++) big[`k${i}`] = 'y'.repeat(150);
		const out = scrubPayload(big);
		expect(typeof out.trunc).toBe('number');
	});

	it('keeps a full heartbeat-shaped payload intact (the 16-key shape)', () => {
		// The regression this pins: a 12-key object cap silently swallowed the
		// heartbeat's tail once the voice counters joined — exactly the fields
		// the device crash hunt reads. The live shape is 16 keys today.
		const out = scrubPayload({
			el: 1700,
			aC: 10,
			aD: 9,
			aX: 'running',
			amb: 3,
			sy: 12,
			vc: 7,
			vx: 0,
			cq: 40,
			cd: 2,
			bag: 100,
			k: 5,
			ph: 'roam',
			menu: 0,
			fps: 60,
			lag: 0
		});
		expect(Object.keys(out)).toHaveLength(16);
		expect(out.fps).toBe(60);
		expect(out.lag).toBe(0);
		expect(out.ph).toBe('roam');
		expect(out.menu).toBe(0);
	});

	it('still bounds pathological objects at 24 keys', () => {
		const big: Record<string, unknown> = {};
		for (let i = 0; i < 40; i++) big[`k${i}`] = i;
		const out = scrubPayload(big);
		expect(Object.keys(out)).toHaveLength(24);
	});
});

describe('parseEntries', () => {
	it('filters malformed items and non-arrays', () => {
		expect(parseEntries('nope')).toEqual([]);
		expect(parseEntries('{}')).toEqual([]);
		expect(parseEntries('null')).toEqual([]);
		const mixed = JSON.stringify([
			{ t: 0, k: 'boot' },
			{ t: 'x', k: 'bad' },
			{ t: 5 },
			{ t: 10, k: 'hb', d: ['nope'] },
			null
		]);
		const out = parseEntries(mixed);
		expect(out).toHaveLength(2);
		expect(out[0].k).toBe('boot');
		expect(out[1]).toEqual({ t: 10, k: 'hb', d: undefined });
	});
});

describe('hostile environments', () => {
	it('never throws with a storage that throws everywhere', () => {
		const clock = fakeClock();
		const log = createCrashLog(hostileStorage(), { now: clock.now, meta: testMeta });
		expect(() => {
			clock.advance(1000);
			log.log('hb', { el: 1 });
			log.log('err', { m: 'boom' });
			log.end();
			log.flush();
			log.info();
			log.snapshot();
			log.clearPrev();
			log.format();
		}).not.toThrow();
		expect(log.snapshot().live.length).toBeGreaterThan(0);
	});

	it('works memory-only without a storage', () => {
		const log = createCrashLog(null, { now: () => 0, meta: testMeta });
		log.log('hb', { el: 2 });
		expect(log.snapshot().live).toHaveLength(2);
		expect(log.format()).toContain('hb');
	});
});

describe('the report', () => {
	it('carries the header, both sessions and the legend', () => {
		const clock = fakeClock();
		const storage = memStorage({ [CRASHLOG_LIVE_KEY]: seedSession(clock.now() - 20_000, 19_000) });
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		const text = log.format();
		expect(text).toContain('SCATOLA NERA');
		expect(text).toContain('build test-build');
		expect(text).toContain('INTERROTTA');
		expect(text).toContain('sessione attuale');
		expect(text).toContain('legenda');
		expect(text).toContain('[+0.0s] boot');
	});

	it('clearPrev drops the archive', () => {
		const clock = fakeClock();
		const storage = memStorage({ [CRASHLOG_LIVE_KEY]: seedSession(clock.now() - 20_000, 19_000) });
		const log = createCrashLog(storage, { now: clock.now, meta: testMeta });
		expect(log.info().crashed).toBe(true);
		log.clearPrev();
		expect(storage.getItem(CRASHLOG_PREV_KEY)).toBeNull();
		expect(log.snapshot().prev).toEqual([]);
		expect(log.format()).toContain('nessuna sessione precedente');
	});
});

describe('fmtDur', () => {
	it('formats seconds and minutes', () => {
		expect(fmtDur(0)).toBe('0s');
		expect(fmtDur(34_400)).toBe('34s');
		expect(fmtDur(60_000)).toBe('1m00s');
		expect(fmtDur(459_200)).toBe('7m39s');
	});
});
