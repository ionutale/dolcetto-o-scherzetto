<script lang="ts">
	/**
	 * The two parallax bands behind the street: far rooftops (0.45) and mid
	 * trees/fog silhouettes (0.7).
	 *
	 * Port of the prototype's `#lFar` / `#lMid` layers, the geometry built in
	 * `buildBackdrops()` and the two scroll factors applied every frame in
	 * `renderScene()` (`prototypes/scene-prototype.html`, v2, lines ~371-377,
	 * ~1105-1141 and ~1732-1733):
	 *
	 *   far.style.transform  = `translateX(${-worldX * .45}px)`
	 *   mid.style.transform  = `translateX(${-worldX * .7}px)`
	 *
	 * **This is the seam T09 feeds.** `worldX` is the only input: the sim's world
	 * scroll position in logical px, same number the recycling window uses
	 * (`k * SPACING - worldX`). Default 0 so the scene composes before the loop
	 * exists, and shifting it must never cost a layout — both factors only write
	 * a transform (`will-change: transform`, per ADR-0001's transform/opacity
	 * rule).
	 *
	 * Both bands are 2400 logical px wide, the prototype's two-and-a-bit screens of
	 * coverage for the +-2400px of street the recycling window can reveal; the
	 * stage clips the overspill. **C1 bounded paints (2026-10-18):** past that
	 * coverage the endless street never meets them again, so each band's offset
	 * is clamped at its off-stage pose and the band is hidden while it is fully
	 * away — no painted offset grows with the walk.
	 *
	 * Colours are §3 tokens. The prototype's two-tone silhouettes collapse onto
	 * the nearest stops: far roofs `--night-2` against `--night-1` for the second
	 * block and the ground band (so the band and that block read as one mass, as
	 * in the prototype), canopy `--night-2`, trunks/pots `--night-1`, hedges the
	 * `--night-2`/`--night-3` mix whose value is the prototype's #483c66. In
	 * front of the far band and still darker than the horizon sky at that height.
	 * Decorative only: `pointer-events: none`, hidden from assistive technology.
	 */
	import { STAGE_W } from './theme-model';

	interface Props {
		/** World scroll position in logical px (negative = further left). */
		worldX?: number;
	}

	let { worldX = 0 }: Props = $props();

	/** Prototype scroll factors: far moves at .45 of the street, mid at .7. */
	const FAR_FACTOR = 0.45;
	const MID_FACTOR = 0.7;

	/** Band width and the off-stage apron (px) that keeps the flip invisible. */
	const BAND_W = 2400;
	const APRON = 300;

	/** Raw (unbounded) prototype offsets — the values the walk drives. */
	const farRaw = $derived(-worldX * FAR_FACTOR);
	const midRaw = $derived(-worldX * MID_FACTOR);

	/** Painted offsets: raw clamped to the band's off-stage pose. */
	const farShift = $derived(Math.min(Math.max(farRaw, -BAND_W), STAGE_W));
	const midShift = $derived(Math.min(Math.max(midRaw, -BAND_W), STAGE_W));

	/** Fully off-stage (plus apron) — hidden so the compositor can let go. */
	const farAway = $derived(farRaw <= -BAND_W - APRON || farRaw >= STAGE_W + APRON);
	const midAway = $derived(midRaw <= -BAND_W - APRON || midRaw >= STAGE_W + APRON);

	/** Far rooftops: 8 blocks of 300 px starting at -40 (the prototype's `i * 300 - 40`). */
	const ROOF_BLOCKS = Array.from({ length: 8 }, (_, i) => i * 300 - 40);
	/** Mid trees: 7 at 340 px apart from 40, each with a hedge 170 px to its right. */
	const TREES = Array.from({ length: 7 }, (_, i) => i * 340 + 40);
	/** Three drifting fog wisps, staggered -8 s apart (prototype's inline delays). */
	const FOG = [
		{ left: 120, top: 150, delay: 0 },
		{ left: 820, top: 120, delay: -8 },
		{ left: 1500, top: 160, delay: -16 }
	];
</script>

<div
	class="far"
	aria-hidden="true"
	class:away={farAway}
	style="transform: translateX({farShift}px)"
>
	<svg width="2400" height="393" viewBox="0 0 2400 393" preserveAspectRatio="none">
		{#each ROOF_BLOCKS as x (x)}
			<!-- lit house: gabled roof, wall, one warm window -->
			<path d="M{x + 20} 250 L{x + 70} 190 L{x + 120} 250 Z" fill="var(--night-2)" />
			<rect x={x + 52} y="250" width="36" height="60" fill="var(--night-2)" />
			<rect x={x + 62} y="262" width="14" height="16" rx="4" fill="var(--lamp)" opacity="0.5" />
			<!-- dark house: arched roof + wall, merged with the ground band -->
			<path d="M{x + 150} 250 Q{x + 180} 196 {x + 212} 250 Z" fill="var(--night-1)" />
			<rect x={x + 168} y="246" width="26" height="64" fill="var(--night-1)" />
		{/each}
		<rect x="0" y="310" width="2400" height="83" fill="var(--night-1)" />
	</svg>
</div>

<div
	class="mid"
	aria-hidden="true"
	class:away={midAway}
	style="transform: translateX({midShift}px)"
>
	{#each FOG as wisp, i (i)}
		<div
			class="fog reduce-motion-off"
			style:left="{wisp.left}px"
			style:top="{wisp.top}px"
			style:animation-delay="{wisp.delay}s"
		></div>
	{/each}

	{#each TREES as x (x)}
		<svg class="tree" width="120" height="140" viewBox="0 0 120 140" style:left="{x}px">
			<path
				d="M60 8 C52 30 40 44 36 66 C30 92 44 112 60 112 C76 112 90 92 84 66 C80 44 68 30 60 8 Z"
				fill="var(--night-2)"
			/>
			<path d="M60 22 V108" stroke="var(--night-1)" stroke-width="5" />
			<path
				d="M58 52 C46 42 38 40 28 42 M62 52 C74 42 82 40 92 42"
				stroke="var(--night-2)"
				stroke-width="7"
				stroke-linecap="round"
				fill="none"
			/>
			<rect x="52" y="112" width="16" height="26" rx="6" fill="var(--night-1)" />
		</svg>

		<svg class="hedge" width="120" height="60" viewBox="0 0 120 60" style:left="{x + 170}px">
			<ellipse cx="34" cy="46" rx="30" ry="16" />
			<ellipse cx="72" cy="50" rx="26" ry="13" />
			<ellipse cx="100" cy="46" rx="18" ry="11" />
		</svg>
	{/each}
</div>

<style>
	.far,
	.mid {
		position: absolute;
		top: 0;
		left: 0;
		width: 2400px;
		height: 100%;
		pointer-events: none;
		will-change: transform;
	}

	/* C1: once the walk has left a band fully off-stage (300 px apron) it is
	   hidden outright — its layer, backing and rasters go with it; walking back
	   un-hides it at the same clamped, correct pose (see the script note). */
	.far.away,
	.mid.away {
		display: none;
	}

	/* The global `svg { max-width: 100% }` reset in app.css would squeeze this
	 * 2400 px band into the 852 px stage and compress the viewBox with it. */
	.far svg {
		display: block;
		width: 2400px;
		height: 393px;
		max-width: none;
	}

	.tree {
		position: absolute;
		top: 160px;
	}

	.hedge {
		position: absolute;
		top: 270px;
	}

	/* The prototype's hedge tone (#483c66) sits between `--night-2` and
	 * `--night-3`; the mix lands on it, and the plain token above is the
	 * fallback for a browser without `color-mix()` (hedges read one step
	 * lighter, still darker than the horizon sky at that height). */
	.hedge ellipse {
		fill: var(--night-2);
		fill: color-mix(in srgb, var(--night-2) 65%, var(--night-3));
	}

	.fog {
		position: absolute;
		width: 340px;
		height: 70px;
		border-radius: 50%;
		filter: blur(28px);
		background: var(--cream-soft);
		background: color-mix(in srgb, var(--ghost-shade) 16%, transparent);
		animation: drift 26s ease-in-out infinite alternate;
	}

	@keyframes drift {
		from {
			transform: translateX(-40px);
		}
		to {
			transform: translateX(40px);
		}
	}
</style>
