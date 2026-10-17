<script lang="ts">
	/**
	 * The game page — the T08 + T09 + T10 + T11 + T12 + T13 + T14 + T15 + T17
	 * + T18 + T19 composition: the sprite motion stylesheet, the night sky, the
	 * two parallax bands, the endless street (world bands + the recycling window
	 * of houses and yards), the neighborhood-kid cast, the kids duo, the glowing
	 * candy layer, the hold-to-walk controls, the knock cloud, the speech
	 * bubble, the bag chip, the Scherzo button + trick fan and the trick
	 * theatre, all inside the 852×393 stage frame, with the portrait rotate
	 * prompt on top.
	 *
	 * The page owns **no game logic**: it reads the store's derived getters
	 * (`worldX` / `phase` / `activeK` / `dir`) into the scene props, renders
	 * `<Npcs/>`, `<Kids/>`, `<WalkControls/>`, `<KnockButton/>`, `<Scherzo/>`,
	 * `<Theatre/>` and `<Bubbles/>` (which talk to the store themselves), and
	 * runs the loop — `start()` on mount, `stop()` on destroy, one rAF for the
	 * whole scene. The sim's `reduce`/`tick` stay the only rules, in
	 * `src/lib/sim/loop.ts`; the knock chain is `src/lib/play/flow.ts`, and the
	 * two things this page does with it are fire it on the single edge a knock
	 * can happen on — `roam → door` — and fire the show on the single edge a
	 * trick can start on — `refuse → trick`.
	 *
	 * **The NPC cast (T19)** mounts after `<Street/>` and before `<Kids/>` — the
	 * prototype's `#lNpcs` sits between `#lCars` and the `.kids` duo
	 * (`scene-prototype.html` ~394-404), so the neighborhood kids roam on the
	 * sidewalk in front of the street and the duo always walks in front of them.
	 * The layer owns its own ambience clock and talks to the store only through
	 * the `worldX()` seam.
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
	 *
	 * **The title menu (T17).** `<TitleScreen/>` mounts over everything (its
	 * own `z-200`, above the rotate prompt's `z-100`) and owns the Gioca /
	 * Impostazioni swap; the page only answers Gioca. The first-gesture audio
	 * unlock is the prototype's once-`pointerdown` listener
	 * (`scene-prototype.html` ~874): any first interaction — the Gioca tap
	 * included — flips the latch, and T23/T25 create/resume their
	 * `AudioContext`s there (the SFX engine joins in T27). The landscape lock
	 * is the prototype's
	 * `tryLandscapeLock()` (~1790): a guarded `screen.orientation.lock` that
	 * iOS refuses and the rotate prompt covers (spec §13).
	 *
	 * **T18 — the celebration** (spec §4.2/§9). A `$effect` watches the store's
	 * `furthest()` seam and asks `decideCelebration()` whether a 10-home
	 * boundary was just crossed: the banner fires now in `roam`, or is held
	 * through any flow and released at the next quiet moment. `<Celebration/>`
	 * renders the beat (the neighborhood's name + a sparkle sweep) and its
	 * `onStinger` is a no-op until T23/T25/T27 own the audio.
	 *
	 * **T18b — persistence.** The second `$effect` autosaves
	 * `{ bag, record, tricks, furthestK }` to `dos.run.v1` on any change; the
	 * store's boot seeds that same state back (see `state/game.svelte.ts`). The
	 * parent reset in Impostazioni still clears the key and reloads.
	 *
	 * **T24 — the scary moments.** `<Scares/>` mounts inside the stage after the
	 * duo; it owns the six cameos, the veil and the kids' beat, and it decides
	 * *when* through `scare-model.ts`. The page owns one thing: the walking lock.
	 * Its `onScare(active)` hook stops the duo and hides `<WalkControls/>` for
	 * the ~2.5 s beat, so no WALK can reach the sim — the prototype's local
	 * `ambienceLock`. (The prototype kept the buttons mounted but inert; here
	 * they unmount, which is the same guarantee with no stale hold to leak —
	 * Review Focus #2.)
	 */
	import { onDestroy, onMount } from 'svelte';
	import MotionStyles from '$lib/art/sprites/MotionStyles.svelte';
	import ParallaxLayers from '$lib/art/scene/ParallaxLayers.svelte';
	import Sky from '$lib/art/scene/Sky.svelte';
	import Stage from '$lib/art/scene/Stage.svelte';
	import Street from '$lib/art/scene/Street.svelte';
	import RotateOverlay from '$lib/ui/RotateOverlay.svelte';
	import Kids from '$lib/play/Kids.svelte';
	import Cars from '$lib/play/Cars.svelte';
	import Ghosts from '$lib/play/Ghosts.svelte';
	import Npcs from '$lib/play/Npcs.svelte';
	import CandyLayer from '$lib/play/CandyLayer.svelte';
	import WalkControls from '$lib/play/WalkControls.svelte';
	import KnockButton from '$lib/play/KnockButton.svelte';
	import Scherzo from '$lib/play/Scherzo.svelte';
	import Theatre from '$lib/play/Theatre.svelte';
	import Bubbles from '$lib/play/Bubbles.svelte';
	import Celebration from '$lib/play/Celebration.svelte';
	import Scares from '$lib/play/Scares.svelte';
	import ThemeLayer from '$lib/art/scene/ThemeLayer.svelte';
	import { duckAmbience, startAmbience } from '$lib/audio/ambience.svelte';
	import { duckMusic, startMusic, stopMusic } from '$lib/audio/music.svelte';
	import { initSfx, playCue, setSfxVolume } from '$lib/audio/sfx';
	import { volumes } from '$lib/audio/volumes.svelte';
	import Hud from '$lib/ui/Hud.svelte';
	import TitleScreen from '$lib/ui/TitleScreen.svelte';
	import { showBubble } from '$lib/play/bubble.svelte';
	import {
		SHOW_DOOR_Y,
		createFlowStore,
		doorScreenX,
		scheduleKnock,
		scheduleTrickResolve
	} from '$lib/play/flow';
	import type { TrickShow } from '$lib/play/flow';
	import { decideCelebration } from '$lib/play/celebration-model';
	import type { Beat } from '$lib/play/celebration-model';
	import { neighborhoodIndex } from '$lib/sim/progression';
	import {
		activeK,
		bag,
		dir,
		dispatch,
		furthest,
		phase,
		record,
		shopOpen,
		start,
		stop,
		trickPlayed,
		tricks,
		worldX
	} from '$lib/state/game.svelte';
	import { persist } from '$lib/persist/persist';
	import type { RunState } from '$lib/persist/persist';
	import type { Phase } from '$lib/sim/loop';

	/** The store still exposes no `homes`, so nothing can be marked done. */
	const NO_HOMES: Record<number, { done?: boolean }> = {};

	/** The knock chain's view of the store — one adapter for the page's life. */
	const flow = createFlowStore();

	/** The theatre instance, mounted below inside the stage box (T15). */
	let theatre = $state<Theatre | null>(null);
	let ghosts = $state<Ghosts | null>(null);

	/**
	 * T24 — the scary-moment walking lock. `true` from a cameo's trigger until
	 * its beat ends (`SCARE_BEAT_MS` ≈ 2.5 s); while it holds, `<WalkControls/>`
	 * is unmounted and no WALK can be dispatched — the prototype's local
	 * `ambienceLock` (it stopped the duo and ignored input for the beat).
	 */
	let scareActive = $state(false);

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
		if (prevPhase === 'roam' && p === 'door') scheduleKnock(flow, showBubble, setTimeout, playCue);
		// One show per trick: the reducer only ever starts one from `refuse`.
		if (prevPhase === 'refuse' && p === 'trick') startShow();
		prevPhase = p;
	});

	/* ------------------------------------------------------------------ */
	/* T18 — the neighborhood celebration, and T18b — the run autosave     */
	/* ------------------------------------------------------------------ */

	/** The neighborhood the celebration has already accounted for (model seam). */
	let seenIndex = neighborhoodIndex(furthest());
	/** A beat held back while a flow ran, replayed into the next decision. */
	let pendingBeat: Beat | null = null;
	/** The beat the banner is showing — a fresh object per transition. */
	let beat = $state<Beat | null>(null);

	/**
	 * The celebration decision. Re-runs whenever progress or the phase changes:
	 * cross a 10-home boundary and the banner fires now in `roam`, or waits out
	 * any flow (door/collect/trick/refuse, open Bottega) and fires at the next
	 * quiet moment. The rule itself is `decideCelebration` in
	 * `celebration-model.ts`; this effect only keeps the model's two memories
	 * (`seenIndex`, `pendingBeat`) and hands the beat to the banner.
	 */
	$effect(() => {
		const decision = decideCelebration(
			seenIndex,
			neighborhoodIndex(furthest()),
			phase(),
			shopOpen(),
			pendingBeat
		);
		seenIndex = decision.index;
		pendingBeat = decision.pending;
		if (decision.fire) beat = decision.fire;
	});

	/** The banner's stinger hook — silent until T23/T25/T27 play a cue. */
	const noopStinger = (): void => {
		/* intentionally silent — the audio tasks replace this hook */
	};

	/**
	 * T18b — autosave. Any change to the wallet, the record, the owned tricks or
	 * the furthest house writes the one run slot (`dos.run.v1`); `persist.write`
	 * never throws, so a hostile or full storage only costs the save, never the
	 * run. It also runs once at boot, re-persisting the restored state.
	 *
	 * Documented gap: the sim cannot take `candies`, `homes`, `phase`, `dir`,
	 * `activeK`, `refusedK` or the exact standing `worldX` at boot, so a reload
	 * resumes at the furthest doorstep the save's `furthestK` points at — see
	 * the boot note in `state/game.svelte.ts`.
	 */
	$effect(() => {
		const run: RunState = {
			version: 1,
			bag: bag(),
			record: record(),
			tricks: [...tricks()],
			furthestK: furthest()
		};
		persist.write(run);
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
			onClimax: () => {
				dispatch({ type: 'TRICK_RESOLVE' });
				ghosts?.hop();
			},
			bounce: () => bounceNeighbor(k)
		});
		trick = show;

		theatre?.start(id, doorScreenX(flow, k), SHOW_DOOR_Y, {
			sound: playCue, // T27: theatre-setup + the eight fire:<id> + theatre-laugh
			onClimax: () => show.onClimax(),
			onDone: () => {}
		});
	}

	/** T27 — the SFX slider scales the synth pack's master gain live. */
	$effect(() => {
		setSfxVolume(volumes().sfx);
	});

	/* ------------------------------------------------------------------ */
	/* T24 — the scary moments: the page's side of the `onScare` contract   */
	/* ------------------------------------------------------------------ */

	/**
	 * The page's half of `<Scares/>`'s `onScare(active)` hook. On `true` it
	 * stops the duo (the prototype's `scareNow` dispatched `STOP` before the
	 * cameo) and drops the walk lock; on `false` — exactly `SCARE_BEAT_MS` later
	 * — it hands walking back. T23 ducks the bed here, T25 ducks the loop.
	 */
	function onScare(active: boolean): void {
		scareActive = active;
		duckAmbience(active); // T23: the bed dips ~6 dB for the beat
		duckMusic(active); // T25: the loop dips to its owner ducked mix
		if (active) dispatch({ type: 'STOP' });
	}

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

	/**
	 * The audio unlock latch (spec §6 · Review Focus #1). The prototype runs a
	 * once-`pointerdown` listener that inits its WebAudio modules (~874); here
	 * there are none yet, so this only flips the latch the audio tasks will
	 * consult. It is idempotent on purpose: the mount listener and Gioca can
	 * both reach it for the same first tap.
	 */
	let audioUnlocked = false;
	function unlockAudio(): void {
		if (audioUnlocked) return;
		audioUnlocked = true;
		startAmbience(); // T23: create/resume the AudioContext + give the bed a graph
		startMusic(); // T25: decode + loop the owner's street track (own AudioContext)
		initSfx(); // T27: resume the SFX context + build the master gate
	}

	/**
	 * The prototype's `tryLandscapeLock()` (~1790): ask the platform for a real
	 * landscape lock where it permits one (installed PWA / Android). iOS refuses
	 * and the rotate prompt stands in (spec §13), so every failure is swallowed.
	 */
	function tryLandscapeLock(): void {
		try {
			const orientation = screen.orientation as ScreenOrientation & {
				lock?: (o: string) => Promise<void>;
			};
			if (orientation && typeof orientation.lock === 'function') {
				const attempt = orientation.lock('landscape');
				if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
			}
		} catch {
			/* No ScreenOrientation API, or a refusal: the rotate prompt covers it. */
		}
	}

	/** Gioca: the tap itself is the unlock gesture, then we ask for landscape. */
	function play(): void {
		unlockAudio();
		tryLandscapeLock();
	}

	/**
	 * One loop for the whole page: rAF on mount, cancelled on destroy. The
	 * once-`pointerdown` listener is the prototype's "any first interaction
	 * unlocks audio" (~874) — Gioca included, and idempotent with `play()`.
	 */
	onMount(() => {
		start();
		const onFirstGesture = (): void => {
			unlockAudio();
			tryLandscapeLock();
		};
		window.addEventListener('pointerdown', onFirstGesture, { once: true });
		return () => {
			window.removeEventListener('pointerdown', onFirstGesture);
			stop();
			stopMusic();
		};
	});

	/** A show cancelled early owes no payoff line (the theatre kills its climax). */
	onDestroy(() => trick?.cancel());
</script>

<MotionStyles />

<div class="scene">
	<Stage>
		<Sky />
		<ParallaxLayers worldX={worldX()} />
		<Ghosts worldX={worldX()} bind:this={ghosts} />
		<ThemeLayer worldX={worldX()} />
		<Street worldX={worldX()} homes={NO_HOMES} activeK={activeK()} {openK} />
		<Cars worldX={worldX()} sound={playCue} />
		<Npcs sound={playCue} />
		<Kids dir={dir()} />
		<Scares {onScare} sound={playCue} />
		<CandyLayer sound={playCue} />
		{#if !scareActive}
			<WalkControls />
		{/if}
		<KnockButton sound={playCue} />
		<Scherzo sound={playCue} />
		<Theatre bind:this={theatre} />
		<Bubbles />
		<Celebration {beat} onStinger={noopStinger} />
		<Hud sound={playCue} />
	</Stage>
</div>

<RotateOverlay />

<TitleScreen onPlay={play} />

<style>
	/* Full-page: the stage frame takes the whole viewport and centres inside it,
	 * insets and all. */
	.scene {
		display: flex;
		min-height: 100vh;
		min-height: 100dvh;
	}
</style>
