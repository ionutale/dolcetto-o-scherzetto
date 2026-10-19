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
	 * is split in two — this component translates the `.homes` container and
	 * each `HouseSlot` parks relative to the window base — **rebased to the
	 * live window** (C1, 2026-10-18): the container only carries
	 * `-(worldX - baseX)` and every slot sits at `k*SPACING - baseX`, so no
	 * painted offset ever grows past one house period however long the walk.
	 * The composed position (`k*SPACING - worldX`) is pixel-identical; the
	 * unbounded value it used to drag through the compositor — the "huge
	 * offset … dies after a long walk on iOS" class T09b first hit on
	 * backgrounds — is gone.
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
	import { createTreadmill, recycleLayer } from './treadmill';

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
	/**
	 * C1 bounded paints. The window's base in world px: every scrolling layer
	 * is painted relative to it, so the container only carries
	 * `-(worldX - baseX)` — inside one house period, forever — and each slot
	 * parks at `k*SPACING - baseX ∈ [0, 2480]`. Before this the container was
	 * translated by the raw `-worldX` (≈ −186 000 px at k 300) and the slots
	 * sat at `k*SPACING` + ≈186 000 px locally, so the layer's painted
	 * coordinate space grew without bound as the kid walked.
	 */
	const baseX = $derived(firstK * SPACING);
	const shift = $derived(-(worldX - baseX));
	/**
	 * The pattern offsets still ride the **true** scroll — not the rebased
	 * shift — opened **modulo each pattern's period** (T09b): an identical
	 * visual (both gradients repeat), but the painted `background-position`
	 * stays inside one period instead of growing to thousands of px — WebKit
	 * never has to rasterize a huge gradient offset, which is exactly the kind
	 * of thing that dies after a long walk on iOS.
	 */
	const seams = $derived(-worldX % 86);
	const dashes = $derived(-worldX % 60);

	/* ------------------------------------------------------------------ */
	/* the walk treadmill (see treadmill.ts for the why)                   */
	/* ------------------------------------------------------------------ */

	/** The recycling clock — one layer rebuild per TREADMILL_PX walked. */
	const treadmill = createTreadmill();
	/** The scrolling half's element — the layer the treadmill recycles. */
	let homesEl: HTMLElement | undefined = $state();
	/** Recycles of this layer — mirrored onto `data-recycles` for the tests. */
	let cycles = $state(0);

	$effect(() => {
		if (!treadmill.tick(worldX)) return;
		const el = homesEl;
		if (!el) return;
		// Defer out of the effect flush: the recycle mutates the DOM tree
		// Svelte is updating this frame. A frame later it is an ordinary DOM
		// write, and the painted outcome is identical either way.
		requestAnimationFrame(() => {
			recycleLayer(el);
			cycles += 1;
		});
	});
</script>

<div
	class="street"
	aria-hidden="true"
	style="--street-seams: {seams}px; --street-dashes: {dashes}px"
>
	<div class="yards"></div>
	<div class="sidewalk"></div>
	<div class="road"></div>

	<div
		class="homes"
		bind:this={homesEl}
		data-recycles={cycles}
		style="transform: translateX({shift}px)"
	>
		{#each slots as k (k)}
			<HouseSlot
				{k}
				{worldX}
				{baseX}
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

	/* The scrolling half: carries the window's bounded `-(worldX - baseX)`
	   (C1 bounded paints — see the script note). */
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
		   houses, not sit still under the kids' feet — owner feedback, T09b fix).
		   The offset is modulo the 86 px seam period (see the script note). */
		background-position-x: var(--street-seams, 0px);
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
		/* Lane dashes ride with the world too (T09b fix; modulo the 60 px dash
		   period, same as .sidewalk's seams). */
		background-position-x: var(--street-dashes, 0px);
	}
</style>
