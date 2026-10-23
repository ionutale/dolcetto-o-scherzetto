import { describe, expect, it } from 'vitest';
import {
	SCARE_BEAT,
	SCARE_BEAT_MS,
	SCARE_FIRST_MS,
	SCARE_KINDS,
	SCARE_MIN_MS,
	SCARE_SPAN_MS,
	firstScareAt,
	nextScareAt,
	pickKind,
	scareCue,
	scareTick
} from './scare-model';
import type { BeatClass, ScareContext, ScareKind } from './scare-model';
import type { Dir, Phase } from '../sim/loop';

/**
 * Pinning suite for the T24 scare rules (`scare-model.ts`).
 *
 * Every rule the acceptance names is fed plain values on a fake clock — no DOM,
 * no store, no timers:
 *
 *   1. gap enforcement — never before `nextAt`, always `[60 s, 120 s)` after;
 *   2. walking-only — roam + `dir !== 0`, never mid-flow, never with the shop
 *      open;
 *   3. per-kind reachability — all six kinds are drawable, and never twice in a
 *      row;
 *   4. no overlap — a beat already on screen swallows a due tick;
 *   5. release exactly at beat end — the schedule ends at `SCARE_BEAT_MS`.
 */

/** A context builder with the "eligible while walking" defaults, overridable. */
function ctx(overrides: Partial<ScareContext> = {}): ScareContext {
	return {
		now: 0,
		nextAt: 0,
		phase: 'roam',
		dir: 1,
		shopOpen: false,
		active: false,
		prevKind: null,
		...overrides
	};
}

/** An rng returning a fixed value every call. */
const fixed = (v: number) => () => v;
/** An rng walking a list of values, repeating the last when exhausted. */
function seq(values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

/** A sweep of `n` evenly spaced samples across `[0, 1)` (inclusive of 0, exclusive of 1). */
const sweep = (n: number): number[] => Array.from({ length: n }, (_, i) => i / n);

const FLOW_PHASES: Phase[] = ['door', 'collect', 'trick', 'refuse'];

describe('pickKind — all six reachable, never twice in a row', () => {
	it('draws every one of the six kinds when no previous kind is known', () => {
		const drawn = sweep(SCARE_KINDS.length).map((v) => pickKind(null, fixed(v)));
		expect(new Set(drawn).size).toBe(SCARE_KINDS.length);
		expect(drawn.sort()).toEqual([...SCARE_KINDS].sort());
	});

	it('never returns the kind just shown, whatever it was', () => {
		for (const prev of SCARE_KINDS) {
			const drawn = sweep(20).map((v) => pickKind(prev, fixed(v)));
			expect(drawn).not.toContain(prev);
		}
	});

	it('reaches all five alternatives of a previous kind', () => {
		const prev: ScareKind = 'thunder';
		const drawn = sweep(SCARE_KINDS.length - 1).map((v) => pickKind(prev, fixed(v)));
		expect(new Set(drawn).size).toBe(SCARE_KINDS.length - 1);
		expect(drawn).not.toContain(prev);
	});

	it('clamps an rng pinned at ~1 to the last option (never overruns the pool)', () => {
		expect(pickKind(null, fixed(0.999999))).toBe(SCARE_KINDS[SCARE_KINDS.length - 1]);
		expect(pickKind(null, fixed(1))).toBe(SCARE_KINDS[SCARE_KINDS.length - 1]);
	});
});

describe('the gap — never before nextAt, always 60–120 s after a fire', () => {
	it('first scare is not allowed before ~28 s after load', () => {
		expect(SCARE_FIRST_MS).toBe(28000);
		expect(firstScareAt(0)).toBe(28000);
		expect(firstScareAt(1000)).toBe(29000);
	});

	it('does not fire one millisecond before it is due', () => {
		const d = scareTick(ctx({ now: 59_999, nextAt: 60_000 }), fixed(0));
		expect(d.kind).toBeNull();
		expect(d.nextAt).toBe(60_000); // deferred, not re-armed
	});

	it('fires the moment it is due', () => {
		const d = scareTick(ctx({ now: 60_000, nextAt: 60_000 }), seq([0, 0]));
		expect(d.kind).not.toBeNull();
	});

	it('re-arms 60 s out at the low end of the draw', () => {
		const d = scareTick(ctx({ now: 60_000, nextAt: 60_000 }), seq([0, 0]));
		expect(d.nextAt).toBe(60_000 + SCARE_MIN_MS);
		expect(scareTick(ctx({ now: 119_999, nextAt: d.nextAt }), fixed(0)).kind).toBeNull();
		expect(scareTick(ctx({ now: 120_000, nextAt: d.nextAt }), seq([0, 0])).kind).not.toBeNull();
	});

	it('re-arms under 120 s at the high end of the draw', () => {
		const d = scareTick(ctx({ now: 500_000, nextAt: 500_000 }), seq([0.999999, 0]));
		expect(d.nextAt - 500_000).toBeGreaterThan(119_000);
		expect(d.nextAt - 500_000).toBeLessThan(SCARE_MIN_MS + SCARE_SPAN_MS);
	});

	it('every possible draw lands inside [60 s, 120 s)', () => {
		for (const v of sweep(50)) {
			const gap = nextScareAt(0, fixed(v)) - 0;
			expect(gap).toBeGreaterThanOrEqual(SCARE_MIN_MS);
			expect(gap).toBeLessThan(SCARE_MIN_MS + SCARE_SPAN_MS);
		}
	});

	it('a deferred (non-walking) due tick does not consume the gap early', () => {
		// Idle at the due moment: nothing fires and nextAt is untouched, so the
		// next walking frame still fires on the same schedule.
		const idle = scareTick(ctx({ now: 60_000, nextAt: 60_000, dir: 0 }), fixed(0));
		expect(idle).toEqual({ nextAt: 60_000, kind: null });
		const walking = scareTick(ctx({ now: 60_100, nextAt: idle.nextAt }), seq([0, 0]));
		expect(walking.kind).not.toBeNull();
	});

	it('a fake-clock walk fires on the 60 s cadence and honors the gap', () => {
		// Simulate 20 walking minutes of frames; every fire is ≥60 s apart and
		// the first lands no earlier than SCARE_FIRST_MS.
		let now = 0;
		let nextAt = firstScareAt(now);
		let prev: ScareKind | null = null;
		const fires: number[] = [];
		const rng = () => 0; // the tightest allowed cadence
		for (let frame = 0; frame < 20 * 60 * 60; frame += 1) {
			now += 1000 / 60; // 60 fps
			const d = scareTick(
				{ now, nextAt, phase: 'roam', dir: 1, shopOpen: false, active: false, prevKind: prev },
				rng
			);
			nextAt = d.nextAt;
			if (d.kind) {
				fires.push(now);
				prev = d.kind;
			}
		}
		expect(fires.length).toBeGreaterThan(10);
		expect(fires[0]).toBeGreaterThanOrEqual(28_000);
		for (let i = 1; i < fires.length; i += 1) {
			expect(fires[i] - fires[i - 1]).toBeGreaterThanOrEqual(SCARE_MIN_MS);
			expect(fires[i] - fires[i - 1]).toBeLessThan(SCARE_MIN_MS + SCARE_SPAN_MS);
		}
	});
});

describe('walking-only trigger — roam + dir ≠ 0, no flows, no shop', () => {
	it('never fires while standing still', () => {
		const d = scareTick(ctx({ now: 60_000, nextAt: 60_000, dir: 0 }), seq([0, 0]));
		expect(d.kind).toBeNull();
	});

	it('never fires with the shop open', () => {
		const d = scareTick(ctx({ now: 60_000, nextAt: 60_000, shopOpen: true }), seq([0, 0]));
		expect(d.kind).toBeNull();
	});

	it.each(FLOW_PHASES)('never fires during the %s phase', (phase) => {
		const d = scareTick(ctx({ now: 60_000, nextAt: 60_000, phase }), seq([0, 0]));
		expect(d.kind).toBeNull();
	});

	it('fires while walking left or right', () => {
		for (const dir of [-1, 1] as Dir[]) {
			const d = scareTick(ctx({ now: 60_000, nextAt: 60_000, dir }), seq([0, 0]));
			expect(d.kind).not.toBeNull();
		}
	});
});

describe('one at a time — a live beat swallows a due tick', () => {
	it('does not fire while a beat is already on screen', () => {
		const d = scareTick(ctx({ now: 200_000, nextAt: 60_000, active: true }), seq([0, 0]));
		expect(d).toEqual({ nextAt: 60_000, kind: null });
	});

	it('fires again once the beat has ended and the gap has passed', () => {
		const first = scareTick(ctx({ now: 60_000, nextAt: 60_000 }), seq([0, 0]));
		// Active through the beat: nothing rides over it.
		const during = scareTick(ctx({ now: 62_000, nextAt: first.nextAt, active: true }), seq([0, 0]));
		expect(during.kind).toBeNull();
		// Released, still before the gap: nothing yet.
		expect(scareTick(ctx({ now: 62_000, nextAt: first.nextAt }), seq([0, 0])).kind).toBeNull();
		// Due again: fires.
		expect(scareTick(ctx({ now: 120_000, nextAt: first.nextAt }), seq([0, 0])).kind).not.toBeNull();
	});

	it('carries the previous kind so back-to-back draws differ', () => {
		const first = scareTick(ctx({ now: 60_000, nextAt: 60_000 }), seq([0, 0]));
		const second = scareTick(
			ctx({ now: 180_000, nextAt: first.nextAt, prevKind: first.kind }),
			seq([0, 0])
		);
		expect(second.kind).not.toBe(first.kind);
	});
});

describe('the kids beat — release exactly at SCARE_BEAT_MS', () => {
	/** Apply the beat steps in order, on a fake clock, up to `SCARE_BEAT_MS`. */
	function applied(): { at: number; classes: Set<BeatClass> }[] {
		const classes = new Set<BeatClass>();
		const snapshots: { at: number; classes: Set<BeatClass> }[] = [];
		for (const step of SCARE_BEAT) {
			for (const c of step.add) classes.add(c);
			for (const c of step.remove) classes.delete(c);
			snapshots.push({ at: step.at, classes: new Set(classes) });
		}
		return snapshots;
	}

	it('sets the beat length at 2500 ms', () => {
		expect(SCARE_BEAT_MS).toBe(2500);
	});

	it('every step lands strictly before the release', () => {
		for (const step of SCARE_BEAT) {
			expect(step.at).toBeGreaterThan(0);
			expect(step.at).toBeLessThan(SCARE_BEAT_MS);
		}
	});

	it('schedules the prototype’s stop → hug → tremble → peek → giggle beats', () => {
		expect(SCARE_BEAT.map((s) => s.at)).toEqual([60, 120, 1400, 1900]);
		expect(SCARE_BEAT[0].add).toEqual(['scare-hug']);
		expect(SCARE_BEAT[1].add).toEqual(['scare-tremble']);
		expect(SCARE_BEAT[2].add).toEqual(['scare-peek']);
		expect(SCARE_BEAT[2].remove).toEqual(['scare-tremble']);
		expect(SCARE_BEAT[3].add).toEqual(['scare-giggle']);
		expect(SCARE_BEAT[3].remove).toEqual(['scare-peek', 'scare-hug']);
	});

	it('uses exactly the prototype’s four class names', () => {
		const all = new Set(SCARE_BEAT.flatMap((s) => [...s.add, ...s.remove]));
		expect([...all].sort()).toEqual(['scare-giggle', 'scare-hug', 'scare-peek', 'scare-tremble']);
	});

	it('never carries two exclusive beat classes at once', () => {
		// hug + tremble coexist; peek replaces tremble; giggle replaces peek+hug.
		const hugs = applied();
		expect(hugs[0].classes.has('scare-hug')).toBe(true);
		expect(hugs[1].classes).toEqual(new Set(['scare-hug', 'scare-tremble']));
		expect(hugs[2].classes.has('scare-hug')).toBe(true);
		expect(hugs[2].classes.has('scare-peek')).toBe(true);
		expect(hugs[2].classes.has('scare-tremble')).toBe(false);
		expect(hugs[3].classes).toEqual(new Set(['scare-giggle']));
	});
});

describe('scareCue', () => {
	it('names the prototype’s `scare:*` cue for every kind', () => {
		expect(SCARE_KINDS.map(scareCue)).toEqual([
			'scare:witch',
			'scare:wolf',
			'scare:vampire',
			'scare:skeleton',
			'scare:mummy',
			'scare:thunder'
		]);
	});
});
