import { describe, expect, it } from 'vitest';
import { beatFor, decideCelebration, inFlow } from './celebration-model';
import type { Beat } from './celebration-model';
import { THEMES, themeFor } from '../sim/progression';
import type { Phase } from '../sim/loop';

/**
 * Pinning suite for the T18 celebration decision (`celebration-model.ts`).
 *
 * The four acceptance rows, each fed plain values — no DOM, no store, no
 * timers:
 *
 *   1. a boundary crossed while roaming fires **exactly once**;
 *   2. the same index never fires a second time;
 *   3. a boundary crossed mid-flow is **held**, then released on the next
 *      `roam` (all four phases and the open Bottega);
 *   4. backtracking (a lower index) never re-fires.
 */

/** The four flow phases a beat must wait out (spec §5). */
const FLOW_PHASES: Phase[] = ['door', 'collect', 'trick', 'refuse'];

/** A no-op held beat, for the "nothing pending" side of a row. */
const NONE: Beat | null = null;

describe('decideCelebration — fires exactly once per crossed boundary', () => {
	it('fires the beat of the newly entered neighborhood while roaming', () => {
		const d = decideCelebration(0, 1, 'roam', false, NONE);

		expect(d.fire).not.toBeNull();
		expect(d.fire?.index).toBe(1);
		expect(d.fire?.theme).toBe(themeFor(1));
		expect(d.fire?.theme).toBe('foggy');
		expect(d.pending).toBeNull();
		expect(d.index).toBe(1);
	});

	it('carries the fired beat no further — a repeat call does not fire again', () => {
		const first = decideCelebration(0, 1, 'roam', false, NONE);
		// The caller stored `first.index` and replays `first.pending`.
		const second = decideCelebration(first.index, 1, 'roam', false, first.pending);

		expect(second.fire).toBeNull();
		expect(second.pending).toBeNull();
		expect(second.index).toBe(1);
	});

	it('never fires twice for the same index across a walk of further calls', () => {
		let prev = 0;
		let pending: Beat | null = null;
		let fires = 0;

		// Walk house-by-house across two full neighborhoods (indexes 1 and 2),
		// asking on every doorstep.
		for (let k = 1; k <= 25; k += 1) {
			const index = Math.floor(k / 10);
			const d = decideCelebration(prev, index, 'roam', false, pending);
			prev = d.index;
			pending = d.pending;
			if (d.fire) fires += 1;
		}

		// Index 1 at k = 10, index 2 at k = 20 — exactly two beats.
		expect(fires).toBe(2);
		expect(prev).toBe(2);
	});

	it('counts a multi-boundary jump once, for the newest index', () => {
		// A fresh RESET / restored save can land deep in the street at once.
		const d = decideCelebration(0, 4, 'roam', false, NONE);

		expect(d.fire).not.toBeNull();
		expect(d.fire?.index).toBe(4);
		expect(d.fire?.theme).toBe(themeFor(4));
		expect(d.index).toBe(4);
		// One banner — not a queue of four.
		expect(d.pending).toBeNull();
	});
});

describe('decideCelebration — defers mid-flow, flushes in roam', () => {
	it.each(FLOW_PHASES)('holds the beat through the %s phase', (phase) => {
		const d = decideCelebration(0, 1, phase, false, NONE);

		expect(d.fire).toBeNull();
		expect(d.pending).not.toBeNull();
		expect(d.pending?.index).toBe(1);
		expect(d.pending?.theme).toBe('foggy');
		// The boundary is already accounted for — it cannot be crossed twice.
		expect(d.index).toBe(1);
	});

	it('holds the beat while the Bottega is open, whatever the phase', () => {
		const d = decideCelebration(0, 1, 'roam', true, NONE);

		expect(d.fire).toBeNull();
		expect(d.pending?.index).toBe(1);
	});

	it('releases the held beat on the next roam (same index, nothing newly crossed)', () => {
		const held = decideCelebration(0, 1, 'collect', false, NONE);
		const flushed = decideCelebration(held.index, 1, 'roam', false, held.pending);

		expect(flushed.fire).toEqual(held.pending);
		expect(flushed.fire?.theme).toBe('foggy');
		expect(flushed.pending).toBeNull();
		expect(flushed.index).toBe(1);
	});

	it('flushes exactly once — a second roam call fires nothing', () => {
		const held = decideCelebration(0, 1, 'door', false, NONE);
		const flushed = decideCelebration(held.index, 1, 'roam', false, held.pending);
		const again = decideCelebration(flushed.index, 1, 'roam', false, flushed.pending);

		expect(flushed.fire).not.toBeNull();
		expect(again.fire).toBeNull();
		expect(again.pending).toBeNull();
	});

	it('keeps holding while the flow continues', () => {
		let prev = 0;
		let pending: Beat | null = null;
		for (const phase of ['door', 'collect', 'trick', 'refuse'] as Phase[]) {
			const d = decideCelebration(prev, 1, phase, false, pending);
			expect(d.fire).toBeNull();
			expect(d.pending?.index).toBe(1);
			prev = d.index;
			pending = d.pending;
		}
		// Only the return to roam lets it go.
		const done = decideCelebration(prev, 1, 'roam', false, pending);
		expect(done.fire?.index).toBe(1);
	});

	it('shows the newest theme when a second boundary is crossed while held', () => {
		const held = decideCelebration(0, 1, 'collect', false, NONE);
		const jumped = decideCelebration(held.index, 2, 'collect', false, held.pending);

		expect(jumped.fire).toBeNull();
		expect(jumped.pending?.index).toBe(2);
		expect(jumped.pending?.theme).toBe(themeFor(2));

		const flushed = decideCelebration(jumped.index, 2, 'roam', false, jumped.pending);
		expect(flushed.fire?.index).toBe(2);
	});
});

describe('decideCelebration — backtracking never refires', () => {
	it('ignores a lower index and keeps the progress it already had', () => {
		const d = decideCelebration(4, 1, 'roam', false, NONE);

		expect(d.fire).toBeNull();
		expect(d.pending).toBeNull();
		expect(d.index).toBe(4); // progress is monotonic
	});

	it('never re-fires a boundary walked back over and forward again', () => {
		// Advanced to neighborhood 2, then walked back past house 10 (index 1).
		const back = decideCelebration(2, 1, 'roam', false, NONE);
		expect(back.fire).toBeNull();
		expect(back.index).toBe(2);

		// Walking forward again re-crosses house 10 — still no re-fire, because
		// `furthest` (and so `nextIndex`) never drops below what we saw.
		const forward = decideCelebration(back.index, 2, 'roam', false, back.pending);
		expect(forward.fire).toBeNull();
	});
});

describe('beatFor', () => {
	it('names a beat after its index, cycling the four themes', () => {
		const themes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => beatFor(i).theme);
		expect(themes).toEqual([
			'leafy',
			'foggy',
			'pumpkin',
			'starry',
			'leafy',
			'foggy',
			'pumpkin',
			'starry'
		]);
		// Every theme is a declared one.
		for (const t of themes) expect(THEMES).toContain(t);
		// The beat carries the index it was built from.
		expect(beatFor(7)).toEqual({ index: 7, theme: 'starry' });
	});
});

describe('inFlow', () => {
	it.each([
		['roam', false, false],
		['door', false, true],
		['collect', false, true],
		['trick', false, true],
		['refuse', false, true],
		['roam', true, true],
		['door', true, true]
	] as Array<[Phase, boolean, boolean]>)(
		'phase=%s shopOpen=%s → %s',
		(phase, shopOpen, expected) => {
			expect(inFlow(phase, shopOpen)).toBe(expected);
		}
	);
});
