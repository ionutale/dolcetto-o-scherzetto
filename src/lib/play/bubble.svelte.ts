/**
 * The speech bubble's single shared slot (T11) — module state plus the
 * `showBubble()` the knock chain calls.
 *
 * Port of the prototype's one `#bubble` element and its `showBubble()`
 * (`prototypes/scene-prototype.html`, CSS ~270-277 and ~1349-1359). The
 * prototype never had more than one bubble on screen, so the state is one
 * record and one hide timer rather than a list:
 *
 * - **Re-show replaces in place.** The greet lands at +900 ms while the shout
 *   is still up (it hides at +1320), so the text swaps under an already-open
 *   bubble: the `.show` class is never dropped, the pop transition never
 *   replays — exactly what the prototype did by writing `textContent` on the
 *   same element.
 * - **The timer is cleared on re-show** (the prototype's `clearTimeout` before
 *   `setTimeout`), so a fresh line always gets its own full duration instead
 *   of inheriting the previous one's expiry.
 * - **Hiding keeps the last line** (`show:false`, text untouched): the
 *   prototype removed only the `.show` class, and a bubble that fades out
 *   mid-sentence should not blank first.
 *
 * The renderer is `Bubbles.svelte`; the flow injects *this* module's
 * `showBubble` into `flow.ts`, which never imports the DOM side.
 */

/** Everything the bubble shows at one moment. */
export interface BubbleView {
	text: string;
	/** Stage-logical x of the bubble's anchor (the tail's centre line). */
	x: number;
	/** Stage-logical y of the bubble's bottom edge (the tail grows below it). */
	y: number;
	/** The prototype's `.small` size — the kids' shout uses it. */
	small: boolean;
	/** Drives the `.show` class: the pop transition's on/off switch. */
	show: boolean;
}

/** The one bubble the stage shows, deeply reactive. */
let view = $state<BubbleView>({ text: '', x: 0, y: 0, small: false, show: false });

/** Handle of the pending hide, so a re-show can take the old timer back. */
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows (or re-points) the bubble at `(x, y)` and hides it again after `ms`.
 * Defaults are the prototype's: 1800 ms, full size.
 */
export function showBubble(text: string, x: number, y: number, small = false, ms = 1800): void {
	view = { text, x, y, small, show: true };
	if (hideTimer !== null) clearTimeout(hideTimer);
	hideTimer = setTimeout(() => {
		view = { ...view, show: false };
		hideTimer = null;
	}, ms);
}

/** The current bubble state — `Bubbles.svelte`'s only read. */
export function bubble(): BubbleView {
	return view;
}
