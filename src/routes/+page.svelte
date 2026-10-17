<script lang="ts">
	/**
	 * The game page — the T08 + T09 + T10 + T11 + T12 composition: the sprite
	 * motion stylesheet, the night sky, the two parallax bands, the endless
	 * street (world bands + the recycling window of houses and yards), the kids
	 * duo, the glowing candy layer, the hold-to-walk controls, the knock cloud,
	 * the speech bubble and the bag chip, all inside the 852×393 stage frame,
	 * with the portrait rotate prompt on top.
	 *
	 * The page owns **no game logic**: it reads the store's derived getters
	 * (`worldX` / `phase` / `activeK` / `dir`) into the scene props, renders
	 * `<Kids/>`, `<WalkControls/>`, `<KnockButton/>` and `<Bubbles/>` (which
	 * talk to the store themselves), and runs the loop — `start()` on mount,
	 * `stop()` on destroy, one rAF for the whole scene. The sim's
	 * `reduce`/`tick` stay the only rules, in `src/lib/sim/loop.ts`; the knock
	 * chain is `src/lib/play/flow.ts`, and the one thing this page does with
	 * it is fire it on the single edge a knock can happen on — `roam → door`.
	 * The pill dispatches `KNOCK`, the reducer opens the door, and the effect
	 * below starts the chain, so a knock from anywhere in the game gets the
	 * same shout, the same greeting and the same resolve.
	 *
	 * `openK` is the prototype's door gate (phase in door/collect/trick/refuse
	 * → the home under the kids' feet); `homes={{}}` → `NO_HOMES` is the one
	 * seam still open — the store does not expose `homes`, so a done home's
	 * windows do not dim yet (T12's candy layer closes that loop). The night
	 * background and cream ink come from `body` in `app.css`.
	 */
	import { onMount } from 'svelte';
	import MotionStyles from '$lib/art/sprites/MotionStyles.svelte';
	import ParallaxLayers from '$lib/art/scene/ParallaxLayers.svelte';
	import Sky from '$lib/art/scene/Sky.svelte';
	import Stage from '$lib/art/scene/Stage.svelte';
	import Street from '$lib/art/scene/Street.svelte';
	import RotateOverlay from '$lib/ui/RotateOverlay.svelte';
	import Kids from '$lib/play/Kids.svelte';
	import CandyLayer from '$lib/play/CandyLayer.svelte';
	import WalkControls from '$lib/play/WalkControls.svelte';
	import KnockButton from '$lib/play/KnockButton.svelte';
	import Bubbles from '$lib/play/Bubbles.svelte';
	import Hud from '$lib/ui/Hud.svelte';
	import { showBubble } from '$lib/play/bubble.svelte';
	import { createFlowStore, scheduleKnock } from '$lib/play/flow';
	import { activeK, dir, phase, start, stop, worldX } from '$lib/state/game.svelte';
	import type { Phase } from '$lib/sim/loop';

	/** The store still exposes no `homes`, so nothing can be marked done. */
	const NO_HOMES: Record<number, { done?: boolean }> = {};

	/** The knock chain's view of the store — one adapter for the page's life. */
	const flow = createFlowStore();

	/** Phases in which the active home's door stands open (prototype gate). */
	const OPEN_PHASES: readonly Phase[] = ['door', 'collect', 'trick', 'refuse'];
	const openK = $derived(OPEN_PHASES.includes(phase()) ? activeK() : -1);

	/**
	 * The phase before the current one — a **plain** field on purpose, so the
	 * effect's read of it is not a dependency: only `phase()` re-runs it, and
	 * the knock below can never fire twice for one door.
	 */
	let prevPhase: Phase = phase();

	/** One chain per knock: the reducer only ever opens a door from `roam`. */
	$effect(() => {
		const p = phase();
		if (prevPhase === 'roam' && p === 'door') scheduleKnock(flow, showBubble, setTimeout);
		prevPhase = p;
	});

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
		<Street worldX={worldX()} homes={NO_HOMES} activeK={activeK()} {openK} />
		<Kids dir={dir()} />
		<CandyLayer />
		<WalkControls />
		<KnockButton />
		<Bubbles />
		<Hud />
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
