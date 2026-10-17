/**
 * T13 — the Scherzo widget's pure shape: which tricks the fan lists, how many
 * tier dots each card lights, and when the button or the fan is on screen.
 *
 * These are the three decisions the prototype made inline in `renderHUD()`
 * (`prototypes/scene-prototype.html` ~1362-1391) lifted out of the DOM so they
 * can be pinned without mounting anything:
 *
 * - `fanList(owned)` — `state.tricks.map(...)` with the catalogue's own order
 *   applied: the sim hands over the owned ids (it appends them as they are
 *   bought), the fan draws them the way the shop lists them, cheapest first
 *   (`TRICK_ORDER`). Anything that is not one of the eight is dropped, so a
 *   stale or foreign id can never reach a card.
 * - `tierDots(id)` — the prototype's `tierOf`/`Math.ceil(tierOf(id) / 2)`
 *   dot row (~1362, ~1386), written as the index form the task spec pins:
 *   `Math.ceil((idx + 1) / 2)`. Two tricks per dot over the four gentle power
 *   tiers of spec §7: `boo`/`ragnetto` light one dot … `fantasmino`/`mano`
 *   light four. An id outside the ladder has no index and lights nothing
 *   (`0`), which keeps the helper total instead of throwing.
 * - `showScherzoButton` / `showFan` — the two `.show` toggles (~1375, ~1377):
 *   the whole widget only exists while the duo is being refused a door, and
 *   the button and the fan are the two halves of that moment (the button is
 *   the invitation, the fan what the invitation opens).
 *
 * Nothing here reads the store: the caller (`Scherzo.svelte`) passes what it
 * read through the `phase()`/`fanOpen()`/`tricks()` seams, so this module has
 * no dependencies beyond the catalogue and is unit-tested on its own
 * (`fan-model.test.ts`).
 */
import { TRICK_ORDER } from '../sim/economy';
import type { TrickId } from '../sim/economy';
import type { Phase } from '../sim/loop';

/**
 * The fan's cards: the owned tricks only, always in `TRICK_ORDER` order
 * (the same order the Bottega lists), whatever order the sim handed them over
 * in. Unknown ids are filtered out — a card must always have a catalogue
 * entry, an icon and a name.
 */
export function fanList(owned: string[]): TrickId[] {
	const ownedSet = new Set(owned);
	return TRICK_ORDER.filter((id) => ownedSet.has(id));
}

/**
 * How many of the four tier dots a trick's card lights — `1..4` across the
 * ladder, two tricks per dot. Ids outside `TRICK_ORDER` light `0`.
 */
export function tierDots(trickId: string): number {
	const idx = TRICK_ORDER.indexOf(trickId as TrickId);
	return Math.ceil((idx + 1) / 2);
}

/**
 * The pulsing SCHERZO button: only at a refusing door, and only while the fan
 * is shut (opening the fan is what the button is for). In every other phase —
 * roam, door, collect, trick — neither half of the widget shows.
 *
 * The prototype's condition was `phase === 'refuse' && !shopOpen`; `shopOpen`
 * is not one of the seams this widget reads, and the shop panel is a
 * full-stage layer above this one (z-15 over z-11), so it covers the button
 * while it is open. See `Scherzo.svelte`'s header for the whole note.
 */
export function showScherzoButton(phase: Phase, fanOpen: boolean): boolean {
	return phase === 'refuse' && !fanOpen;
}

/** The trick fan: open, and still at the refusing door that opened it. */
export function showFan(phase: Phase, fanOpen: boolean): boolean {
	return phase === 'refuse' && fanOpen;
}
