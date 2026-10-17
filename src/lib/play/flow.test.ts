import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPACING, setRand } from '../sim/loop';
import type { InitialOpts } from '../sim/loop';
import { activeK, dispatch, phase, step, worldX } from '../state/game.svelte';
import { L, t } from '../i18n/lines';
import { NEIGHBOR_ARCHES, NEIGHBORS, archOf, neighborFor } from '../art/sprites/neighbors';
import {
	CLOSE_DOOR_AT,
	GREET_AT,
	OUTCOME_AT,
	RESOLVE_AT,
	SHOUT_AT,
	SHOUT_MS,
	SHOUT_X,
	SHOUT_Y,
	createFlowStore,
	scheduleKnock,
	scheduleResolve
} from './flow';
import type { FlowStore, SetTimeoutLike, ShowBubble } from './flow';

/**
 * Pinning suite for the T11 knock chain (`src/lib/play/flow.ts`) and the two
 * tables it speaks from — the copy lines and the neighbour archetypes.
 *
 * The chain is driven exactly as the page drives it, against the **real**
 * store (`createFlowStore()` over `game.svelte.ts`, so every `RESOLVE` is the
 * real reducer) with two seams injected: a fake clock standing in for
 * `setTimeout`, and a recorder standing in for the bubble. That keeps the
 * timings (`+420 / +900 / +2000 / +150`, `seen`'s `+2000` close) and the
 * reducer's own outcome split assertable without a DOM — the prototype pinned
 * the same numbers by eye.
 *
 * Outcomes are scripted two ways, both the sim's public seams: `force` in the
 * RESET opts (what the guided scenarios use) and the injected rng
 * (`setRand`). Each test knocks on its own house index, so the adapter's
 * `homes[k].done` mirror — the one piece of state `createFlowStore` carries
 * across a chain — never leaks between them.
 */

/** The rng the sim rolls knock outcomes with: always the low roll. */
beforeEach(() => {
	setRand(() => 0);
	// RESET parks a fresh run: roam, worldX −260, no door in range.
	dispatch({ type: 'RESET' });
});

afterEach(() => {
	setRand(Math.random);
});

/**
 * A deterministic `setTimeout`. Timers run in due order, and one scheduled
 * inside a callback is queued against the moment it was created — the two
 * properties the chain's nested `CLOSE_DOOR` depends on.
 */
class FakeClock {
	private queue: Array<{ at: number; seq: number; fn: () => void }> = [];
	private now = 0;
	private seq = 0;

	/** The `SetTimeoutLike` the chain takes. */
	readonly set: SetTimeoutLike = (fn, ms) => {
		this.queue.push({ at: this.now + ms, seq: this.seq++, fn });
		return this.queue.length;
	};

	/** Advances the clock by `ms`, running every timer that comes due. */
	advance(ms: number): void {
		const until = this.now + ms;
		for (;;) {
			const due = this.queue
				.filter((job) => job.at <= until)
				.sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
			if (!due) break;
			this.queue = this.queue.filter((job) => job !== due);
			this.now = due.at;
			due.fn();
		}
		this.now = until;
	}

	/** Timers still queued — how a test proves none was scheduled at all. */
	pending(): number {
		return this.queue.length;
	}
}

/** One recorded bubble, with the defaults `showBubble` would fill in. */
interface BubbleCall {
	text: string;
	x: number;
	y: number;
	small: boolean;
	ms: number;
}

/** The bubble sink: every line the chain says, in order. */
function recorder(): { calls: BubbleCall[]; show: ShowBubble } {
	const calls: BubbleCall[] = [];
	const show: ShowBubble = (text, x, y, small = false, ms = 1800) => {
		calls.push({ text, x, y, small, ms });
	};
	return { calls, show };
}

/** RESETs onto house `k`'s doorstep (settling tick) and knocks on the door. */
function knockOn(k: number, opts: InitialOpts = {}): void {
	dispatch({ type: 'RESET', opts: { worldX: k * SPACING, ...opts } });
	step(0);
	expect(activeK()).toBe(k);
	dispatch({ type: 'KNOCK' });
	expect(phase()).toBe('door');
}

/** The doorway anchor every line below the shout shares. */
const DOOR_X = 310;

describe('scheduleKnock — the chain the prototype runs on a knock', () => {
	it('shouts over the kids at +420 ms, small, for 900 ms', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		knockOn(0, { force: { 0: 'treat' } });

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(SHOUT_AT - 1);
		expect(calls).toHaveLength(0);

		clock.advance(1);
		expect(calls).toEqual([
			{ text: L.it.shout, x: SHOUT_X, y: SHOUT_Y, small: true, ms: SHOUT_MS }
		]);
	});

	it('greets in the doorway at +900 ms, with the archetype of that house', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		knockOn(2, { force: { 2: 'treat' } }); // archOf(2) is the strega

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(GREET_AT);

		expect(calls[1]).toEqual({
			text: L.it.greet.strega,
			x: 2 * SPACING - worldX() + 310,
			y: 175,
			small: false,
			ms: 1800
		});
	});

	it('resolves once at +2000 ms and says the treat line at +2150 ms', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		knockOn(1, { force: { 1: 'treat' } });

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(RESOLVE_AT - 1);
		expect(phase()).toBe('door'); // still knocking

		clock.advance(1); // +2000: the reducer answers
		expect(phase()).toBe('collect');
		expect(calls).toHaveLength(2); // shout + greet only, so far

		clock.advance(OUTCOME_AT); // +2150
		expect(calls[2]).toEqual({
			text: L.it.treat[archOf(1)],
			x: DOOR_X,
			y: 175,
			small: false,
			ms: 1800
		});
	});

	it('says `seen`, then shuts the door at +4000 ms', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		const home = { done: true, used: true, kind: 'treat' } as const;
		knockOn(3, { homes: { 3: home }, force: { 3: 'seen' } });

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(RESOLVE_AT + OUTCOME_AT);
		expect(phase()).toBe('door'); // a seen visit keeps the door standing
		expect(calls[2].text).toBe(L.it.seen[archOf(3)]);
		expect(calls[2].ms).toBe(1600);

		clock.advance(CLOSE_DOOR_AT - OUTCOME_AT - 1); // +3999
		expect(phase()).toBe('door');
		clock.advance(1); // +4000
		expect(phase()).toBe('roam');
		expect(clock.pending()).toBe(0);
	});

	it('says `refuse` and schedules no close — the door shuts on walking away', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		knockOn(4, { force: { 4: 'refuse' } });

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(RESOLVE_AT + OUTCOME_AT);

		expect(calls[2]).toEqual({
			text: L.it.refuse[archOf(4)],
			x: DOOR_X,
			y: 175,
			small: false,
			ms: 2200
		});
		expect(phase()).toBe('refuse');
		expect(clock.pending()).toBe(0); // `tick` closes it when the kids walk off
	});

	it('says `regift` on a repeat visit to the same home', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		const flow = createFlowStore();

		// First visit: an untouched home answers treat (rng pinned low).
		knockOn(5, { force: { 5: 'treat' } });
		scheduleKnock(flow, show, clock.set);
		clock.advance(RESOLVE_AT + OUTCOME_AT);
		expect(calls[2].text).toBe(L.it.treat[archOf(5)]);

		// Second visit: home done with one regift left in it — the state a
		// treat leaves behind, restated by the RESET that parks the run again.
		knockOn(5, {
			homes: { 5: { done: true, used: false, kind: 'treat' } },
			force: { 5: 'regift' }
		});
		scheduleKnock(flow, show, clock.set);
		clock.advance(RESOLVE_AT + OUTCOME_AT);
		expect(calls[5].text).toBe(L.it.regift[archOf(5)]);
		expect(phase()).toBe('collect');
	});

	it('lets a second RESOLVE no-op: one resolve, one line', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		knockOn(6, { force: { 6: 'treat' } });

		scheduleKnock(createFlowStore(), show, clock.set);
		clock.advance(RESOLVE_AT + OUTCOME_AT);
		const said = calls.length; // shout + greet + treat

		dispatch({ type: 'RESOLVE' }); // a stray second resolve
		expect(phase()).toBe('collect'); // the reducer only resolves from `door`
		clock.advance(500);
		expect(calls).toHaveLength(said); // and the chain scheduled one line
	});

	it('follows the language the settings hold', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();
		const en: FlowStore = {
			dispatch: () => {},
			activeK: () => 6,
			worldX: () => 6 * SPACING,
			phase: () => 'door',
			lang: () => 'en',
			resolvedOutcome: () => 'refuse'
		};

		scheduleKnock(en, show, clock.set); // archOf(6) is the ghost
		clock.advance(RESOLVE_AT + OUTCOME_AT);

		expect(calls.map((c) => c.text)).toEqual([L.en.shout, L.en.greet.ghost, L.en.refuse.ghost]);
		expect(calls[1].x).toBe(DOOR_X);
	});

	it('says nothing when RESOLVE could not have landed', () => {
		const clock = new FakeClock();
		const { calls, show } = recorder();

		scheduleResolve(createFlowStore(), show, clock.set); // nobody knocked
		clock.advance(OUTCOME_AT);

		expect(calls).toHaveLength(0);
		expect(clock.pending()).toBe(0);
	});
});

describe('createFlowStore — the outcome the store keeps private', () => {
	it('reads a first-visit collect as a treat', () => {
		const flow = createFlowStore();
		knockOn(0, { force: { 0: 'treat' } });
		dispatch({ type: 'RESOLVE' });

		expect(flow.phase()).toBe('collect');
		expect(flow.resolvedOutcome()).toBe('treat');
	});

	it('reads a repeat visit’s collect as a regift', () => {
		const flow = createFlowStore();
		knockOn(1, { force: { 1: 'treat' } });
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('treat'); // the mirror learns home 1

		knockOn(1, {
			homes: { 1: { done: true, used: false, kind: 'treat' } },
			force: { 1: 'regift' }
		});
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('regift');
	});

	it('reads the door left standing as a seen, and records the home', () => {
		const flow = createFlowStore();
		const home = { done: true, used: true, kind: 'treat' } as const;
		knockOn(2, { homes: { 2: home }, force: { 2: 'seen' } });
		dispatch({ type: 'RESOLVE' });

		expect(flow.phase()).toBe('door');
		expect(flow.resolvedOutcome()).toBe('seen');

		// The home is done now: its next collect can only be a regift.
		knockOn(2, {
			homes: { 2: { done: true, used: false, kind: 'treat' } },
			force: { 2: 'regift' }
		});
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('regift');
	});

	it('reads a refusal as a refuse, and repairs a stale mirror entry', () => {
		const flow = createFlowStore();
		knockOn(3, { force: { 3: 'treat' } });
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('treat'); // mirror: {3}

		// A refusal leaves the home untouched, so the entry has no business
		// being there (here the RESET behind it cleared the sim's homes).
		knockOn(3, { force: { 3: 'refuse' } });
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('refuse');

		// …so the next untouched visit reads as the treat it really is.
		knockOn(3, { force: { 3: 'treat' } });
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('treat');
	});

	it('reads null wherever a resolve cannot have landed', () => {
		const flow = createFlowStore();
		knockOn(4, { force: { 4: 'refuse' } });
		dispatch({ type: 'RESOLVE' });
		expect(flow.resolvedOutcome()).toBe('refuse');

		dispatch({ type: 'PLAY_TRICK', id: 'boo' }); // the show is T15's, not this chain's
		expect(phase()).toBe('trick');
		expect(flow.resolvedOutcome()).toBeNull();
	});
});

describe('the tables the chain speaks from', () => {
	it('ships a line for every language × key × archetype the chain can say', () => {
		for (const lang of ['it', 'en'] as const) {
			expect(t(lang, 'shout')).toBeTruthy();
			// The knock pill splices its hand span at this glyph.
			expect(t(lang, 'knock')).toContain('✊');
			for (const key of ['greet', 'treat', 'refuse', 'regift', 'seen'] as const) {
				for (const arch of NEIGHBOR_ARCHES) {
					expect(t(lang, key, arch)).toBeTruthy();
				}
			}
		}
	});

	it('wraps the archetype map over repeat and negative house indexes', () => {
		expect([archOf(-1), archOf(0), archOf(1), archOf(2), archOf(3)]).toEqual([
			'strega',
			'ghost',
			'nonna',
			'strega',
			'ghost'
		]);
		expect(neighborFor(2)).toBe(NEIGHBORS.strega);
		expect(neighborFor(-1)).toBe(NEIGHBORS.strega);
	});
});
