<script lang="ts">
	/**
	 * The game page — for now, the T08 composition and nothing else: the night
	 * sky and the two parallax bands inside the 852×393 stage frame, with the
	 * portrait rotate prompt on top.
	 *
	 * The night background and cream ink come from `body` in `app.css`, so this
	 * page adds no colour of its own; it only gives the frame a full viewport to
	 * centre in. `worldX={0}` is deliberate and explicit: `ParallaxLayers` is the
	 * seam T09 feeds from the sim's world scroll, and the page names the value it
	 * starts from until the loop exists. No game logic lives here yet — no sim
	 * tick, no input, no audio (spec §13, T09+).
	 */
	import ParallaxLayers from '$lib/art/scene/ParallaxLayers.svelte';
	import Sky from '$lib/art/scene/Sky.svelte';
	import Stage from '$lib/art/scene/Stage.svelte';
	import RotateOverlay from '$lib/ui/RotateOverlay.svelte';
</script>

<div class="scene">
	<Stage>
		<Sky />
		<ParallaxLayers worldX={0} />
	</Stage>
</div>

<RotateOverlay />

<style>
	/* Full-page: the stage frame takes the whole viewport and centres inside it,
	 * insets and all. */
	.scene {
		display: flex;
		min-height: 100vh;
		min-height: 100dvh;
	}
</style>
