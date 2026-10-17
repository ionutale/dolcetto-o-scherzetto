<script lang="ts">
	/**
	 * The endless street — world bands + the recycling window of houses.
	 *
	 * Port of the prototype's `#lStreet` layer (`prototypes/scene-prototype.html`,
	 * v2, HTML ~378-383, CSS ~85-93 and the pool loop in `renderHouses()`
	 * ~1156-1185):
	 *
	 *   k0 = floor(worldX / SPACING) - 1        // first live slot
	 *   need = k0 .. k0+4                       // five slots in the window
	 *   slot.style.transform = translateX(k*SPACING - worldX)
	 *
	 * The prototype moves every slot by `k*SPACING - worldX`; here the same sum
	 * is split in two — this component translates the `.homes` container by
	 * `-worldX` once and each `HouseSlot` parks at its fixed `k*SPACING`, which
	 * is one compositor transform per frame instead of five. The result is
	 * pixel-identical and the parallax bands are untouched (they own their own
	 * `worldX` factors).
	 *
	 * **Window & node budget.** The spec's endless street is rendered with a
	 * *recycling window* of ~20 homes (ADR-0001; T32 pins "≤20 slots after
	 * walking 50 homes"). The validated prototype shows **5** — with `SPACING
	 * 620` and an 852 px stage, five 620 px slots already cover the screen plus a
	 * full slot of look-ahead on each side — so this port keeps `WINDOW = 5`,
	 * well inside the ≤20 cap, and the window slides as `worldX` advances rather
	 * than growing.
	 *
	 * `homes`, `activeK` and `openK` are the T10/T11 seams and are inert at the
	 * T09 defaults: the street composes with `worldX={0}` and no sim yet, so no
	 * home is done, none is active, none is open.
	 *
	 * **`-1` sentinel vs the window edge.** `activeK` / `openK` use `-1` for
	 * "none", but `-1` is also a real slot in the window (`k0 = floor(worldX /
	 * SPACING) - 1`, so `k0 = -1` at `worldX = 0`). The prototype was safe only
	 * because it ANDed `open` with the `door|collect|trick|refuse` phase, never
	 * true at rest; this port has no phase yet, so it guards the seam directly
	 * with `activeK >= 0` / `openK >= 0`. Without that the offscreen edge house
	 * would light its glow and swing its door on first paint.
	 *
	 * Bands are the §3 world-band tokens (`app.css` names `--road` / `--sidewalk`
	 * / `--grass` / `--fence` for exactly these three strips); the two prototype
	 * gradient stops with no §3 stop of their own resolve to the nearest night
	 * token, the same convention T08 used for the sky.
	 */
	import HouseSlot from './HouseSlot.svelte';

	interface Props {
		/** World scroll position in logical px — the sim's only street input. */
		worldX: number;
		/** Per-home flags keyed by house index `k`; `done` dims the windows. */
		homes?: Record<number, { done?: boolean }>;
		/** The home the kids are standing at, or -1. Glows while in range. */
		activeK?: number;
		/** The active home whose door is swinging open, or -1. */
		openK?: number;
	}

	let { worldX, homes = {}, activeK = -1, openK = -1 }: Props = $props();

	/** Prototype constant: one home every 620 logical px. */
	const SPACING = 620;
	/** Slots kept live at once (see the window note above; cap is 20). */
	const WINDOW = 5;

	/** First live slot: the prototype's `floor(worldX / SPACING) - 1`. */
	const firstK = $derived(Math.floor(worldX / SPACING) - 1);
	const slots = $derived(Array.from({ length: WINDOW }, (_, i) => firstK + i));
	/** One container transform by `-worldX`; each slot then parks at `k*SPACING`. */
	const shift = $derived(-worldX);
</script>

<div class="street" aria-hidden="true" style="--street-shift: {shift}px">
	<div class="yards"></div>
	<div class="sidewalk"></div>
	<div class="road"></div>

	<div class="homes" style="transform: translateX({shift}px)">
		{#each slots as k (k)}
			<HouseSlot
				{k}
				{worldX}
				done={!!homes[k]?.done}
				open={openK >= 0 && k === openK}
				active={activeK >= 0 && k === activeK}
			/>
		{/each}
	</div>
</div>

<style>
	.street {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	/* The scrolling half: translated by -worldX once per frame. */
	.homes {
		position: absolute;
		inset: 0;
		will-change: transform;
	}

	/* front-to-back bands, prototype offsets verbatim (top/height in logical px) */
	.yards {
		position: absolute;
		left: 0;
		right: 0;
		top: 272px;
		height: 50px;
		background: linear-gradient(180deg, var(--night-2) 0%, var(--grass) 100%);
	}

	.sidewalk {
		position: absolute;
		left: 0;
		right: 0;
		top: 322px;
		height: 23px;
		background: var(--sidewalk);
		background-image: repeating-linear-gradient(
			90deg,
			transparent 0 84px,
			var(--shadow-night) 84px 86px
		);
		/* The pavement seams ride with the world (the marks must scroll with the
		   houses, not sit still under the kids' feet — owner feedback, T09b fix). */
		background-position-x: var(--street-shift, 0px);
	}

	.sidewalk::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 2px;
		background: var(--cream-soft);
		background: color-mix(in srgb, var(--cream) 8%, transparent);
	}

	.road {
		position: absolute;
		left: 0;
		right: 0;
		top: 345px;
		bottom: 0;
		background: var(--road);
	}

	.road::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 3px;
		background: var(--fence);
	}

	.road::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 30px;
		height: 2px;
		background-image: repeating-linear-gradient(
			90deg,
			color-mix(in srgb, var(--cream) 18%, transparent) 0 26px,
			transparent 26px 60px
		);
		/* Lane dashes ride with the world too (T09b fix, same as .sidewalk). */
		background-position-x: var(--street-shift, 0px);
	}
</style>
