<script lang="ts">
	/**
	 * The game page — the T08 + T09 + T10 + T11 + T12 + T13 + T14 + T15
	 * composition: the sprite motion stylesheet, the night sky, the two
	 * parallax bands, the endless street (world bands + the recycling window
	 * of houses and yards), the kids duo, the glowing candy layer, the
	 * hold-to-walk controls, the knock cloud, the speech bubble, the bag chip,
	 * the Scherzo button + trick fan and the trick theatre, all inside the
	 * 852×393 stage frame, with the portrait rotate prompt on top.
	 *
	 * The page owns **no game logic**: it reads the store's derived getters
	 * (`worldX` / `phase` / `activeK` / `dir`) into the scene props, renders
	 * `<Kids/>`, `<WalkControls/>`, `<KnockButton/>`, `<Scherzo/>`,
	 * `<Theatre/>` and `<Bubbles/>` (which talk to the store themselves), and
	 * runs the loop — `start()` on mount, `stop()` on destroy, one rAF for the
	 * whole scene. The sim's `reduce`/`tick` stay the only rules, in
	 * `src/lib/sim/loop.ts`; the knock chain is `src/lib/play/flow.ts`, and the
	 * two things this page does with it are fire it on the single edge a knock
	 * can happen on — `roam → door` — and fire the show on the single edge a
	 * trick can start on — `refuse → trick`.
	 *
	 * **The trick wiring (T15), port of the prototype's `PLAY_TRICK` /
	 * `TRICK_RESOLVE` blocks** (`afterAction`, ~1446-1468): the fan card
	 * dispatches `PLAY_TRICK`, this page's effect below answers it by starting
	 * the theatre at the refusing door (`doorScreenX(flow, k)`, `SHOW_DOOR_Y` —
	 * the door **centre**, Theatre's contract) with a **no-op `sound` hook**
	 * (T23/T27 own the cues; the hook exists so a show never crashes without
	 * them) and `onClimax` wired straight back into the sim:
	 * `dispatch({ type: 'TRICK_RESOLVE' })` — the reducer bursts the candies
	 * and lands in `collect`. `scheduleTrickResolve` wraps that climax once,
	 * bounces the doorway neighbour through its DOM seam and says the
	 * archetype's payoff line +300 ms later. `openK` is the prototype's door
	 * gate (phase in door/collect/trick/refuse → the home under the kids'
	 * feet); `homes={{}}` → `NO_HOMES` is the one seam still open — the store
	 * does not expose `homes`, so a done home's windows do not dim yet. The
	 * night background and cream ink come from `body` in `app.css`.
	 */
	import { onDestroy, onMount } from 'svelte';
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
	import Scherzo from '$lib/play/Scherzo.svelte';
	import Theatre from '$lib/play/Theatre.svelte';
	import Bubbles from '$lib/play/Bubbles.svelte';
	import Hud from '$lib/ui/Hud.svelte';
	import { showBubble } from '$lib/play/bubble.svelte';
	import {
		SHOW_DOOR_Y,
		createFlowStore,
		doorScreenX,
		scheduleKnock,
		scheduleTrickResolve
	} from '$lib/play/flow';
	import type { TrickShow } from '$lib/play/flow';
	import {
		activeK,
		dir,
		dispatch,
		phase,
		start,
		stop,
		trickPlayed,
		worldX
	} from '$lib/state/game.svelte';
	import type { Phase } from '$lib/sim/loop';

	/** The store still exposes no `homes`, so nothing can be marked done. */
	const NO_HOMES: Record<number, { done?: boolean }> = {};

	/** The knock chain's view of the store — one adapter for the page's life. */
	const flow = createFlowStore();

	/** The theatre instance, mounted below inside the stage box (T15). */
	let theatre = $state<Theatre | null>(null);

	/** The live show's resolve beat — replaced per `PLAY_TRICK`, cancelled on destroy. */
	let trick: TrickShow | null = null;

	/** Phases in which the active home's door stands open (prototype gate). */
	const OPEN_PHASES: readonly Phase[] = ['door', 'collect', 'trick', 'refuse'];
	const openK = $derived(OPEN_PHASES.includes(phase()) ? activeK() : -1);

	/**
	 * The phase before the current one — a **plain** field on purpose, so the
	 * effect's read of it is not a dependency: only `phase()` re-runs it, and
	 * the knock below can never fire twice for one door (nor the show).
	 */
	let prevPhase: Phase = phase();

	$effect(() => {
		const p = phase();
		// One chain per knock: the reducer only ever opens a door from `roam`.
		if (prevPhase === 'roam' && p === 'door') scheduleKnock(flow, showBubble, setTimeout);
		// One show per trick: the reducer only ever starts one from `refuse`.
		if (prevPhase === 'refuse' && p === 'trick') startShow();
		prevPhase = p;
	});

	/**
	 * The prototype's `PLAY_TRICK` block (~1446-1463): stage the show at the
	 * refusing door, with the no-op sound hook and the climax wired back into
	 * the reducer (`TRICK_RESOLVE`), wrapped once by the flow so the payoff
	 * line follows +300 ms later. The door x/`activeK` are read at pick time —
	 * the moments the prototype's closures captured.
	 */
	function startShow(): void {
		const id = trickPlayed();
		const k = activeK();
		if (!id) return;

		trick?.cancel();
		const show = scheduleTrickResolve(flow, showBubble, setTimeout, {
			onClimax: () => dispatch({ type: 'TRICK_RESOLVE' }),
			bounce: () => bounceNeighbor(k)
		});
		trick = show;

		theatre?.start(id, doorScreenX(flow, k), SHOW_DOOR_Y, {
			sound: noopSound, // the cue names still arrive; T23/T27 play them
			onClimax: () => show.onClimax(),
			onDone: () => {}
		});
	}

	/** The sound hook every show takes until the audio tasks land (T23/T27). */
	const noopSound = (): void => {
		/* intentionally silent — never throw, whatever the cue name */
	};

	/**
	 * The neighbour's bounce — the prototype's `.neighbor.bounce` toggle
	 * (`TRICK_RESOLVE`, ~1466; keyframes ~119-120). HouseSlot ships the
	 * `.neighbor` reveal slot but **no** `.bounce` class (checked here, T15),
	 * so the toggle lives on the live doorway node: the class marks the beat
	 * (restartable, as the prototype's remove/reflow/add did), and the two
	 * keyframes play through the Web Animations API — transform only, and not
	 * at all under `prefers-reduced-motion` (a bounce is a tremble-scale
	 * flourish; spec §6/§13).
	 */
	function bounceNeighbor(k: number): void {
		try {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		} catch {
			/* no matchMedia: bounce as usual */
		}
		const nb = document.querySelector(`[data-house-slot="${k}"] .neighbor`);
		if (!(nb instanceof HTMLElement)) return;
		nb.classList.remove('bounce');
		void nb.offsetWidth;
		nb.classList.add('bounce');
		if (typeof nb.animate !== 'function') return; // class marks the beat, nothing moves
		nb.animate(
			[
				{ transform: 'scaleY(1) translateY(0)' },
				{ transform: 'scaleY(1.06) translateY(-4px)', offset: 0.45 },
				{ transform: 'scaleY(1) translateY(0)' }
			],
			{ duration: 450, easing: 'ease' }
		).addEventListener('finish', () => nb.classList.remove('bounce'));
	}

	/** One loop for the whole page: rAF on mount, cancelled on destroy. */
	onMount(() => {
		start();
		return () => stop();
	});

	/** A show cancelled early owes no payoff line (the theatre kills its climax). */
	onDestroy(() => trick?.cancel());
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
		<Scherzo />
		<Theatre bind:this={theatre} />
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
