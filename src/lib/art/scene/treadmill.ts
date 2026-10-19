/**
 * The walk treadmill (2026-10-19).
 *
 * History: on iOS, walking the endless street continuously killed the
 * WebContent process after ~16–20 s (~3 100 px, five homes) across every
 * build — with or without the raster "breath", with bounded or unbounded
 * paint offsets — while everything that pauses (doors, collects, the menu)
 * survived for minutes because WebKit gets idle moments to let the retained
 * scroll raster go. The retention grows per scrolled pixel and only idles
 * away. (Device logs 2–6, phases: `br` fired on cadence and deaths were
 * unchanged; C1 bounding the paints was unchanged too.)
 *
 * The treadmill manufactures that idle-trim mid-walk, cheaply: every
 * `TREADMILL_PX` of walked distance each scrolling layer is **detached and
 * re-attached in place** (`recycleLayer`). A subtree that leaves the DOM
 * destroys its renderers and compositor layer; re-attaching rebuilds them —
 * the working hypothesis (falsifiable via the black box's `rc` counter) is
 * that the rebuild is the moment WebKit relinquishes whatever the scrolled
 * pixels had retained. The walk never notices: the element, its inline
 * transform and its content are identical, so the repaint is pixel-for-pixel
 * the same frame. Cycles are driven by **distance**, never time — standing
 * still or sitting in a door/collect phase schedules nothing and hitches
 * nothing, and the peak retention stays under ~half the observed budget.
 *
 * `createTreadmill` is the pure part (unit-tested): a per-layer clock that
 * accumulates walked px, clamps a single huge step (a boot-restore jump must
 * not count as walking) and fires once per boundary. `recycleLayer` is the
 * DOM half; it restores the element at its exact original position and bumps
 * the session total the black box reports as `rc`.
 */

/** Walked px between two recycles of one layer. */
export const TREADMILL_PX = 1500;

/** A single step's ceiling — far past any real frame of walking (~3 px). */
const MAX_STEP_PX = 250;

export interface Treadmill {
	/** Feed the current worldX; `true` exactly on the boundary crossing. */
	tick(worldX: number): boolean;
}

/** A fresh clock that fires once per `everyPx` of walked distance. */
export function createTreadmill(everyPx: number = TREADMILL_PX): Treadmill {
	let acc = 0;
	let last: number | null = null;
	return {
		tick(worldX: number): boolean {
			const prev = last;
			last = worldX;
			if (prev === null) return false;
			acc += Math.min(Math.abs(worldX - prev), MAX_STEP_PX);
			if (acc < everyPx) return false;
			acc = 0;
			return true;
		}
	};
}

/** Recycles run this session (the heartbeat's `rc`). */
let recycles = 0;

export function recycleCount(): number {
	return recycles;
}

/**
 * One recycle: detach the layer's element and re-attach it at its exact
 * original position (same parent, same next sibling). Never throws; a
 * hostile tree simply skips the cycle.
 */
export function recycleLayer(el: HTMLElement | null | undefined): void {
	if (!el) return;
	const parent = el.parentElement;
	if (!parent) return;
	try {
		const next = el.nextSibling;
		parent.removeChild(el);
		parent.insertBefore(el, next);
		recycles += 1;
	} catch {
		/* a hostile element: this cycle simply does not happen */
	}
}
