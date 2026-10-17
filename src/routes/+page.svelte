<script lang="ts">
	/**
	 * The game page — the T08 + T09 composition and nothing else: the sprite
	 * motion stylesheet, the night sky, the two parallax bands and the endless
	 * street (world bands + the recycling window of houses and yards), all inside
	 * the 852×393 stage frame, with the portrait rotate prompt on top.
	 *
	 * The night background and cream ink come from `body` in `app.css`, so this
	 * page adds no colour of its own; it only gives the frame a full viewport to
	 * centre in. `worldX={0}` is deliberate and explicit on both the parallax
	 * bands and the street: the sim's world scroll is the seam T10 feeds, and the
	 * page names the value it starts from until the loop exists. `homes={{}}`,
	 * `activeK={-1}` and `openK={-1}` are the same — the T11 knock/door seams at
	 * their inert defaults (no home done, none active, none open). No game logic
	 * lives here yet — no sim tick, no input, no audio (spec §13, T10+).
	 */
	import MotionStyles from '$lib/art/sprites/MotionStyles.svelte';
	import ParallaxLayers from '$lib/art/scene/ParallaxLayers.svelte';
	import Sky from '$lib/art/scene/Sky.svelte';
	import Stage from '$lib/art/scene/Stage.svelte';
	import Street from '$lib/art/scene/Street.svelte';
	import RotateOverlay from '$lib/ui/RotateOverlay.svelte';
</script>

<MotionStyles />

<div class="scene">
	<Stage>
		<Sky />
		<ParallaxLayers worldX={0} />
		<Street worldX={0} homes={{}} activeK={-1} openK={-1} />
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
