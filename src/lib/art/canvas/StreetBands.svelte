<script lang="ts">
	/**
	 * The three static street bands — extracted from `Street` for the T4 canvas
	 * migration (2026-10-19): yards / sidewalk / road never scroll (T09b keeps
	 * their pattern offsets modulo'd, so their repaints overwrite the same
	 * tiles — the one scroll-adjacent DOM lane that was never implicated in
	 * the device kills). The houses, decor and cars that DO scroll are painted
	 * by `WorldCanvas` above them. CSS is `Street`'s, verbatim.
	 */
	interface Props {
		/** World scroll position in logical px — feeds the seam/dash modulos. */
		worldX: number;
	}

	let { worldX }: Props = $props();

	/**
	 * The pattern offsets ride the **true** scroll, opened **modulo each
	 * pattern's period** (T09b): an identical visual (both gradients repeat),
	 * but the painted `background-position` stays inside one period instead of
	 * growing — WebKit never has to rasterize a huge gradient offset.
	 */
	const seams = $derived(-worldX % 86);
	const dashes = $derived(-worldX % 60);
</script>

<div
	class="street"
	aria-hidden="true"
	style="--street-seams: {seams}px; --street-dashes: {dashes}px"
>
	<div class="yards"></div>
	<div class="sidewalk"></div>
	<div class="road"></div>
</div>

<style>
	.street {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
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
