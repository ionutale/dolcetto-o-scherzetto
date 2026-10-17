/**
 * T18 — the neighborhood celebration's pure decision (spec §4.2/§9: "Every ~10
 * homes the street becomes a new neighborhood … A small celebration beat marks
 * each transition").
 *
 * The page owns the clock and the DOM; this module owns only the *when*. It is
 * a stateless function plus two tiny predicates, so the whole matrix (cross a
 * boundary while roaming → show it now; cross it mid-flow → hold it; reach
 * `roam` again → let it go) is pinned in `celebration-model.test.ts` without a
 * browser.
 *
 * ## The rule
 *
 * A beat is due whenever the **furthest** house's neighborhood index advances
 * (`nextIndex > prevIndex`) — `trackFurthest` in `progression.ts` guarantees
 * that index only ever rises, so backtracking can never re-cross a boundary.
 * A due beat is *shown immediately* in `roam`, and *held* while a flow is on
 * screen: the door/collect/trick/refuse phases (spec §5) and the open Bottega.
 * The next time the sim is in `roam` the held beat is released — one beat, at
 * the first quiet moment, never on top of a bubble or a show.
 *
 * `seenIndex` is the caller's memory of the last index it accounted for: the
 * one field that makes "fires exactly once per boundary" and "backtracking
 * never refires" true. A multi-boundary jump (a fresh `RESET`, a resumed save)
 * counts once, for the newest index — a single banner, not a queue.
 *
 * Pure: no DOM, no timers, no store. The theme comes from `themeFor`, never
 * retyped here.
 */
import { themeFor } from '../sim/progression';
import type { Theme } from '../sim/progression';
import type { Phase } from '../sim/loop';

/** One neighborhood transition, ready to render. */
export interface Beat {
	/** The neighborhood index just entered. */
	index: number;
	/** Its skin (name + eventual ambience, from `THEMES`). */
	theme: Theme;
}

/** The beat of a neighborhood index — the one place a `Beat` is built. */
export function beatFor(index: number): Beat {
	return { index, theme: themeFor(index) };
}

/**
 * True while the sim is inside a flow a beat must not interrupt: the four
 * non-roam phases (spec §5) and the open Bottega (`shopOpen` is not a phase —
 * the reducer freezes the kids while it is up, so it counts the same way).
 */
export function inFlow(phase: Phase, shopOpen: boolean): boolean {
	return (
		shopOpen || phase === 'door' || phase === 'collect' || phase === 'trick' || phase === 'refuse'
	);
}

/** What the caller should do after one `decideCelebration` call. */
export interface Decision {
	/** The beat to show right now, or `null` when none is due. */
	fire: Beat | null;
	/** The beat to hold until the next non-flow moment, or `null`. */
	pending: Beat | null;
	/** The progress index to remember as "already accounted for". */
	index: number;
}

/**
 * The whole decision, given the caller's memory of its last seen index and any
 * beat still held from a previous call.
 *
 * `prevIndex` is what the caller last saw, `nextIndex` the neighborhood of the
 * current furthest house; `phase`/`shopOpen` say whether showing is allowed.
 * Returns the `fire` beat (or `null`), the `pending` beat to carry forward (or
 * `null`), and the `index` to store. The caller replays `pending` back into the
 * next call — which is exactly what releases a held beat once the sim roams.
 */
export function decideCelebration(
	prevIndex: number,
	nextIndex: number,
	phase: Phase,
	shopOpen: boolean,
	pending: Beat | null
): Decision {
	const advanced = nextIndex > prevIndex;
	// Remember the newest progress either way; a boundary is never re-counted.
	const index = advanced ? nextIndex : prevIndex;
	// A fresh crossing replaces any older held beat (a jump shows the newest).
	const held = advanced ? beatFor(nextIndex) : pending;

	if (held && !inFlow(phase, shopOpen)) {
		return { fire: held, pending: null, index };
	}
	return { fire: null, pending: held, index };
}
