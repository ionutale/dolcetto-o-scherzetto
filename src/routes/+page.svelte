<script lang="ts">
	/**
	 * The game page — the T08 + T09 + T10 composition: the sprite motion
	 * stylesheet, the night sky, the two parallax bands, the endless street
	 * (world bands + the recycling window of houses and yards), the kids duo and
	 * the hold-to-walk controls, all inside the 852×393 stage frame, with the
	 * portrait rotate prompt on top.
	 *
	 * The page owns **no game logic**: it reads the store's derived getters
	 * (`worldX` / `activeK` / `dir`) into the scene props, renders `<Kids/>` and
	 * `<WalkControls/>` (which talk to the store themselves), and runs the loop —
	 * `start()` on mount, `stop()` on destroy, one rAF for the whole scene. The
	 * sim's `reduce`/`tick` stay the only rules, in `src/lib/sim/loop.ts`.
	 *
	 * `homes={{}}` → `NO_HOMES` and `openK={-1}` are still the T11/T12 seams:
	 * no knock has been wired yet, so no home can be done and no door open.
	 * The night background and cream ink come from `body` in `app.css`.
	 */
	import { onMount } from 'svelte';
	import MotionStyles from '$lib/art/sprites/MotionStyles.svelte';
	import ParallaxLayers from '$lib/art/scene/ParallaxLayers.svelte';
	import Sky from '$lib/art/scene/Sky.svelte';
	import Stage from '$lib/art/scene/Stage.svelte';
	import Street from '$lib/art/scene/Street.svelte';
	import RotateOverlay from '$lib/ui/RotateOverlay.svelte';
	import Kids from '$lib/play/Kids.svelte';
	import WalkControls from '$lib/play/WalkControls.svelte';
	import { activeK, dir, start, stop, worldX } from '$lib/state/game.svelte';

	/** The T11/T12 seam: nothing has been knocked on yet, so no home is done. */
	const NO_HOMES: Record<number, { done?: boolean }> = {};

	/** One loop for the whole page: rAF on mount, cancelled on destroy. */
	onMount(() => {
		start();
		return () => stop();
	});
</script>

<MotionStyles />

<div class="scene">
	<Stage>
		<Sky />
		<ParallaxLayers worldX={worldX()} />
		<Street worldX={worldX()} homes={NO_HOMES} activeK={activeK()} openK={-1} />
		<Kids dir={dir()} />
		<WalkControls />
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
