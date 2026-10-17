<script lang="ts">
	/**
	 * One home in the recycling window: house art, the swinging door and the
	 * door glow. Yard dressing is composed in as `<Yards>`.
	 *
	 * Port of the prototype's `.slot` + `houseHTML()` (`prototypes/
	 * scene-prototype.html`, v2, CSS ~95-111 and ~1084-1102):
	 *
	 *   - `.slot` sits at `bottom: 121px`, 620×200 — the same box the prototype
	 *     gives every house, so the yard offsets below line up unchanged.
	 *   - the art is `HOUSES.list[type](palette)` with the prototype's mixing
	 *     (`houseArtFor`, ~1075-1083): `type = ((k % 8) + 8) % 8`, then
	 *     `palette = (((k + type) % 3) + 3) % 3`, so neighbours never repeat a
	 *     silhouette and the type/palette pairs cycle without clumping.
	 *   - `.doorwrap` overlays the house's reserved doorway (the pack contract:
	 *     x 92..148 / y H-80..H, clear of every shape) with the swinging leaf;
	 *     `.dglow` is the warm welcome dot beside it.
	 *
	 * State is class-driven, exactly as the prototype toggled it: `.done` dims
	 * the windows (`.win` fill transition) and kills the glow; `.active` lights
	 * the glow; `.open` swings the leaf. `.neighbor` is the reveal slot behind
	 * the door — left empty here, T11 fills it with the neighbour sprite.
	 *
	 * `worldX` does not move this slot (the `Street` container already carries
	 * `-worldX`); it is read only to expose `data-screen-x`, the prototype's
	 * `k*SPACING - worldX + 310` seam (minus the 310 player offset) that T10/T11
	 * use to place the knock affordance. Colours are the validated artefact's,
	 * ported verbatim.
	 */
	import { HOUSES } from '$lib/art/sprites/houses';
	import Yards from './Yards.svelte';

	interface Props {
		/** House index on the endless street (may be negative at the window edge). */
		k: number;
		/** World scroll position in logical px, for the screen-x seam. */
		worldX: number;
		/** Windows dim and the glow dies. */
		done: boolean;
		/** The door leaf swings open. */
		open: boolean;
		/** The welcome glow lights up. */
		active: boolean;
	}

	let { k, worldX, done, open, active }: Props = $props();

	/** Prototype constant: one home every 620 logical px. */
	const SPACING = 620;

	/** `houseArtFor(k)`: type wraps over 8 kinds, palette over 3 families. */
	const typeIndex = $derived(((k % 8) + 8) % 8);
	const paletteIndex = $derived((((k + typeIndex) % 3) + 3) % 3);
	const houseArt = $derived(HOUSES.list[typeIndex](paletteIndex));

	/** `k*SPACING - worldX` — the home's screen x (the player offset is added by T10). */
	const screenX = $derived(k * SPACING - worldX);
</script>

<div
	class="slot"
	class:done
	class:open
	class:active
	data-house-slot={k}
	data-screen-x={screenX}
	style="transform: translateX({k * SPACING}px)"
>
	<div class="cottage">
		<!-- trusted static SVG from the validated house pack -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html houseArt}
	</div>

	<div class="doorwrap">
		<div class="neighbor"></div>
		<div class="door">
			<svg width="56" height="80" viewBox="0 0 56 80">
				<rect x="0" y="0" width="56" height="80" rx="9" fill="#8a6a52" />
				<rect
					x="0"
					y="0"
					width="56"
					height="80"
					rx="9"
					fill="none"
					stroke="#6b513d"
					stroke-width="3"
				/>
				<path d="M9 10 V72 M20 8 V74 M36 8 V74 M47 10 V72" stroke="#00000018" stroke-width="3" />
				<circle cx="44" cy="42" r="3.4" fill="#ffd166" />
				<rect x="6" y="4" width="44" height="10" rx="5" fill="#00000022" />
			</svg>
		</div>
	</div>

	<div class="dglow"></div>

	<Yards {k} />
</div>

<style>
	.slot {
		position: absolute;
		bottom: 121px;
		left: 0;
		width: 620px;
		height: 200px;
		will-change: transform;
	}

	.cottage {
		position: absolute;
		left: 190px;
		bottom: 0;
	}

	/* The house pack's `.win` shapes live inside `{@html}`, so they are not
	 * scope-tagged: reach them through `:global`, still anchored to this slot. */
	.slot :global(.win) {
		transition:
			fill 0.9s ease,
			filter 0.9s ease;
	}

	.slot.done :global(.win) {
		fill: #4b3f5e;
		filter: none;
	}

	.slot.done .dglow {
		opacity: 0;
	}

	.slot.active .dglow {
		opacity: 1;
	}

	.doorwrap {
		position: absolute;
		left: 282px;
		bottom: 0;
		width: 56px;
		height: 80px;
		perspective: 300px;
	}

	/* Reveal slot behind the leaf — empty until T11 puts a neighbour in it. */
	.neighbor {
		position: absolute;
		left: -8px;
		bottom: -4px;
		width: 72px;
		display: flex;
		justify-content: center;
		transform: scaleY(0.05);
		transform-origin: bottom center;
		transition: transform 0.4s cubic-bezier(0.3, 1.4, 0.6, 1) 0.12s;
	}

	.door {
		position: absolute;
		inset: 0;
		transform-origin: left center;
		transition: transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1);
		filter: drop-shadow(-2px 2px 6px rgba(10, 6, 30, 0.45));
	}

	.slot.open .door {
		transform: rotateY(-68deg);
	}

	.slot.open .neighbor {
		transform: scaleY(1);
	}

	.dglow {
		position: absolute;
		left: 346px;
		bottom: 96px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 217, 160, 0.95) 0%, rgba(255, 217, 160, 0) 70%);
		opacity: 0.55;
		transition: opacity 0.4s;
		pointer-events: none;
	}

	/* The door swing is a state reveal, not an ambient loop: reduced-motion
	 * users still get the open door, it just snaps instead of swinging. */
	@media (prefers-reduced-motion: reduce) {
		.door,
		.neighbor {
			transition-duration: 0.001ms;
		}
	}
</style>
