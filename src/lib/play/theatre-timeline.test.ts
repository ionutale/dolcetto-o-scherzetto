import { describe, expect, it } from 'vitest';
import { TRICK_ORDER } from '../sim/loop';
import type { TrickId } from '../sim/loop';
import {
	THEATRE_CLIMAX_MS,
	THEATRE_DONE_MS,
	THEATRE_FIRE_AT,
	THEATRE_GAG_AFTER_SETUP,
	THEATRE_SETUP_LEAD_MS,
	THEATRE_TIMELINES,
	runTimeline
} from './theatre-timeline';
import type { TheatreCue, TheatreStep } from './theatre-timeline';

/**
 * Pinning suite for the T14 trick-theatre cue schedule
 * (`src/lib/play/theatre-timeline.ts`).
 *
 * The whole point of the module is that the *timing* is data, so these rows
 * drive it with a **fake clock** (injected `now` + `setTimeoutFn`) and read
 * back the exact millisecond each cue/hook landed on. The rows the plan names:
 * all eight emit their cues in order, `onClimax` once at 1901, `onDone` once
 * at 2402, cancel mid-show → no further callbacks, and the per-trick fire
 * times pinned to the values lifted from `prototypes/pieces/theatre.js`.
 *
 * No real timer is ever created and no DOM is touched: `runTimeline` only ever
 * sees the injected scheduler.
 */

/** One scheduled callback in the fake clock. */
interface FakeTimer {
	id: number;
	at: number;
	fn: () => void;
	cancelled: boolean;
}

/**
 * A deterministic clock: `now()` and a `setTimeout`-shaped scheduler that
 * queues callbacks until `advance()` drains everything due, in time order
 * (ties broken by insertion, i.e. a stable FIFO for same-`at` steps).
 */
class FakeClock {
	time = 0;
	private seq = 0;
	private timers: FakeTimer[] = [];

	now = (): number => this.time;

	setTimeoutFn = (fn: () => void, ms: number): unknown => {
		const id = ++this.seq;
		this.timers.push({ id, at: this.time + ms, fn, cancelled: false });
		return id;
	};

	clearTimeoutFn = (handle: unknown): void => {
		const timer = this.timers.find((t) => t.id === handle);
		if (timer) timer.cancelled = true;
	};

	/** Fire every pending callback due within `ms`, in time order. */
	advance(ms: number): void {
		const until = this.time + ms;
		for (;;) {
			let next: FakeTimer | undefined;
			for (const t of this.timers) {
				if (t.cancelled || t.at > until) continue;
				if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t;
			}
			if (!next) break;
			this.timers = this.timers.filter((t) => t !== next);
			this.time = Math.max(this.time, next.at);
			next.fn();
		}
		this.time = until;
	}
}

/** What `play()` records while a show runs. */
interface Recording {
	cues: { at: number; cue: TheatreCue }[];
	climaxes: number[];
	dones: number[];
	run: { cancel(): void };
}

/** Run one show's timeline on `clock`, recording its cues and hook beats. */
function play(id: TrickId, clock: FakeClock): Recording {
	const cues: Recording['cues'] = [];
	const climaxes: number[] = [];
	const dones: number[] = [];
	const run = runTimeline(THEATRE_TIMELINES[id], {
		now: clock.now,
		setTimeoutFn: clock.setTimeoutFn,
		clearTimeoutFn: clock.clearTimeoutFn,
		onStep: (step) => {
			if (step.cue) cues.push({ at: clock.now(), cue: step.cue });
			if (step.kind === 'climax') climaxes.push(clock.now());
			if (step.kind === 'done') dones.push(clock.now());
		}
	});
	return { cues, climaxes, dones, run };
}

describe('THEATRE_TIMELINES — the data', () => {
	it('covers exactly the eight sim trick ids, in catalogue order', () => {
		expect(Object.keys(THEATRE_TIMELINES)).toEqual([...TRICK_ORDER]);
	});

	it('keeps every show ordered by time', () => {
		for (const id of TRICK_ORDER) {
			const ats = THEATRE_TIMELINES[id].map((s) => s.at);
			expect(ats, id).toEqual([...ats].sort((a, b) => a - b));
		}
	});

	it('arms every show setup → setup → fire → climax → done', () => {
		for (const id of TRICK_ORDER) {
			expect(
				THEATRE_TIMELINES[id].map((s) => s.kind),
				id
			).toEqual(['setup', 'setup', 'fire', 'climax', 'done']);
		}
	});

	it('tags only the setup sting, the gag and the laugh with a cue', () => {
		const cues = (id: TrickId): (TheatreCue | undefined)[] =>
			THEATRE_TIMELINES[id].map((s) => s.cue);
		expect(cues('boo')).toEqual([
			'theatre-setup',
			undefined,
			'fire:boo',
			'theatre-laugh',
			undefined
		]);
		expect(cues('mano')).toEqual([
			'theatre-setup',
			undefined,
			'fire:mano',
			'theatre-laugh',
			undefined
		]);
	});
});

describe('runTimeline — cues', () => {
	it('emits the three cues of all eight shows in order', () => {
		for (const id of TRICK_ORDER) {
			const clock = new FakeClock();
			const rec = play(id, clock);
			clock.advance(4000);
			expect(
				rec.cues.map((c) => c.cue),
				id
			).toEqual(['theatre-setup', `fire:${id}`, 'theatre-laugh']);
		}
	});

	it('fires the setup sting at 0 and the show setup at the 90 ms lead', () => {
		const clock = new FakeClock();
		const rec = play('boo', clock);
		clock.advance(4000);
		expect(rec.cues[0]).toEqual({ at: 0, cue: 'theatre-setup' });
		expect(THEATRE_SETUP_LEAD_MS).toBe(90);
	});

	it('pins the per-trick fire time, source gag beat + 90 ms', () => {
		// Lifted from `prototypes/pieces/theatre.js`: the `fire:<id>` beat inside
		// each show, plus the 90 ms `sf` lead-in.
		const expected: Record<TrickId, number> = {
			boo: 850,
			ragnetto: 1130,
			serpente: 950,
			cuscino: 1040,
			maschera: 450,
			topolino: 230,
			fantasmino: 310,
			mano: 980
		};
		expect(THEATRE_FIRE_AT).toEqual(expected);
		for (const id of TRICK_ORDER) {
			expect(THEATRE_FIRE_AT[id]).toBe(THEATRE_SETUP_LEAD_MS + THEATRE_GAG_AFTER_SETUP[id]);
			const clock = new FakeClock();
			const rec = play(id, clock);
			clock.advance(4000);
			const fire = rec.cues.find((c) => c.cue === `fire:${id}`);
			expect(fire?.at, id).toBe(expected[id]);
		}
	});
});

describe('runTimeline — hooks', () => {
	it('raises onClimax exactly once, at 1901', () => {
		expect(THEATRE_CLIMAX_MS).toBe(1901);
		for (const id of TRICK_ORDER) {
			const clock = new FakeClock();
			const rec = play(id, clock);
			clock.advance(4000);
			expect(rec.climaxes, id).toEqual([1901]);
		}
	});

	it('raises onDone exactly once, at 2402', () => {
		expect(THEATRE_DONE_MS).toBe(2402);
		for (const id of TRICK_ORDER) {
			const clock = new FakeClock();
			const rec = play(id, clock);
			clock.advance(4000);
			expect(rec.dones, id).toEqual([2402]);
		}
	});

	it('raises the climax before the done, and after the gag', () => {
		const clock = new FakeClock();
		const rec = play('mano', clock);
		clock.advance(4000);
		const fire = rec.cues.find((c) => c.cue === 'fire:mano');
		expect(rec.climaxes[0]).toBeGreaterThan(fire?.at ?? 0);
		expect(rec.climaxes[0]).toBeLessThan(rec.dones[0]);
	});
});

describe('runTimeline — cancellation', () => {
	it('stops every later callback when cancelled mid-show', () => {
		const clock = new FakeClock();
		const rec = play('boo', clock);
		clock.advance(900); // past setup + fire, before the 1901 climax
		expect(rec.cues.map((c) => c.cue)).toEqual(['theatre-setup', 'fire:boo']);

		rec.run.cancel();
		clock.advance(4000);

		expect(rec.cues.map((c) => c.cue)).toEqual(['theatre-setup', 'fire:boo']);
		expect(rec.climaxes).toEqual([]);
		expect(rec.dones).toEqual([]);
	});

	it('is safe to cancel twice and before anything fires', () => {
		const clock = new FakeClock();
		const rec = play('mano', clock);
		rec.run.cancel();
		rec.run.cancel();
		clock.advance(4000);
		expect(rec.cues).toEqual([]);
		expect(rec.climaxes).toEqual([]);
		expect(rec.dones).toEqual([]);
	});
});

describe('runTimeline — scheduling shape', () => {
	it('emits in time order even when the input is shuffled', () => {
		const shuffled: TheatreStep[] = [
			{ at: THEATRE_DONE_MS, kind: 'done' },
			{ at: 0, kind: 'setup', cue: 'theatre-setup' },
			{ at: THEATRE_CLIMAX_MS, kind: 'climax', cue: 'theatre-laugh' },
			{ at: THEATRE_SETUP_LEAD_MS, kind: 'setup' }
		];
		const clock = new FakeClock();
		const seen: number[] = [];
		runTimeline(shuffled, {
			now: clock.now,
			setTimeoutFn: clock.setTimeoutFn,
			clearTimeoutFn: clock.clearTimeoutFn,
			onStep: (step) => seen.push(step.at)
		});
		clock.advance(4000);
		expect(seen).toEqual([0, THEATRE_SETUP_LEAD_MS, THEATRE_CLIMAX_MS, THEATRE_DONE_MS]);
	});

	it('fires an already-past step immediately', () => {
		const clock = new FakeClock();
		const seen: TheatreStep[] = [];
		runTimeline([{ at: 0, kind: 'setup', cue: 'theatre-setup' }], {
			now: () => 500,
			setTimeoutFn: clock.setTimeoutFn,
			clearTimeoutFn: clock.clearTimeoutFn,
			onStep: (step) => seen.push(step)
		});
		clock.advance(0);
		expect(seen).toEqual([{ at: 0, kind: 'setup', cue: 'theatre-setup' }]);
	});
});
