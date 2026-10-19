<script lang="ts">
	/**
	 * T20 — the parked cars and the rare passer.
	 *
	 * Port of the prototype's `#lCars` layer: its CSS (`.car`, `#passer`,
	 * `.headcone`, ~140-144), its markup (`<div id="lCars"><div id="passer">
	 * </div></div>`, ~394, with cars pooled inside it) and its two render paths —
	 * `renderCars()` (~1218-1239) and `passerTick()` (~1530-1546). The maths for
	 * both lives in `car-model.ts`; this component is the DOM half only.
	 *
	 * **Parked cars (windowed like the street).** `carSlots(worldX)` returns the
	 * live set — four cars per five-block window (every block but one driveway
	 * skip, spec §4.4's 3–5), their four dusk tones assigned by the car's stable
	 * ordinal so **every window shows all four tones** and no two neighbours
	 * share one. The whole layer carries the window's bounded `-(worldX - baseX)`
	 * once per frame and each car parks at `k*SPACING + off - baseX` (the
	 * `Street` trick with its C1 bounded-paint rebase, 2026-10-18). Cars are
	 * keyed by `k`, so a block sliding into the window adds a node and one
	 * sliding out removes it — bounded, like every other recycling layer. Tones
	 * come from the sprite pack (`car(color)`), their shadow from `--shadow-night`.
	 *
	 * **The passer.** A self-driven, time-only event: the first crosses ~45 s
	 * after mount, then one every 70–100 s (the prototype's `70000 + rng*30000`;
	 * see `car-model.ts`). Each is a single 4.2 s sweep from −170 to 1030 px in
	 * *screen* space, so it lives beside the world-scrolled track and never
	 * follows `worldX`. The prototype kept this off a per-frame `passerTick()`
	 * plus a rAF `anim()`; here a `setTimeout` waits out the gap and a rAF runs
	 * only for the 4.2 s crossing, then it parks off-screen again. The wrapper
	 * carries `.passing` (the `.headcone` lights) and `.rolling` (the pack spins
	 * the wheels — "`.rolling` only while moving", T20 acceptance).
	 *
	 * **Reduced motion.** The crossing is a *translation*, which the spec keeps;
	 * so the drive runs unchanged under `prefers-reduced-motion: reduce`. The
	 * headlight cone is a plain opacity switch (no animation to kill), and the
	 * sprite pack's own kill switch (`animCSS`) already stops the `.beam` /
	 * `.lens` / `.wheel` pulses — the cone stays lit and ready, it just stops
	 * pulsing. No ambient loop is introduced here, so no extra media query is
	 * owed.
	 *
	 * Decorative (aria-hidden), like the street it stands on.
	 */
	import { onMount } from 'svelte';
	import { car, passerCar } from '$lib/art/sprites';
	import { SPACING } from '$lib/sim/loop';
	import { createTreadmill, recycleLayer } from '$lib/art/scene/treadmill';
	import {
		PASSER_FIRST_MS,
		PASSER_FROM_X,
		carSlots,
		passerGap,
		passerProgress,
		passerX
	} from './car-model';

	interface Props {
		/** World scroll position in logical px — the cars' only input. */
		worldX: number;
		/** Gap rng (defaults to Math.random); injectable for a deterministic harness. */
		rng?: () => number;
		/** Delay before the first passer (defaults to the prototype's 45 s);
		 * injectable so a mounted smoke can watch a crossing without waiting. */
		firstDelayMs?: number;
		/**
		 * Cue hook for the passer (T27's `playCue`) — a no-op by default, so the
		 * layer never crashes without the SFX layer. Mirrors `<Npcs>`'s hook.
		 */
		sound?: (cue: string) => void;
	}

	let {
		worldX,
		rng = Math.random,
		firstDelayMs = PASSER_FIRST_MS,
		sound = () => {}
	}: Props = $props();

	/** Live parked cars — the prototype's `renderCars()` window. */
	const slots = $derived(carSlots(worldX));
	/**
	 * C1 bounded paints: the track and every car are painted relative to the
	 * live window's base (`(floor(worldX / SPACING) - 1) * SPACING`, the model's
	 * own `k0`), so no painted offset grows with the walk (see `Street`'s note).
	 */
	const baseX = $derived((Math.floor(worldX / SPACING) - 1) * SPACING);
	/** The track carries the window's bounded `-(worldX - baseX)` once per frame. */
	const shift = $derived(-(worldX - baseX));

	/* ---- the passer: one time-only crossing, then the next gap ---- */

	/** Is a passer mid-crossing right now? */
	let passing = $state(false);
	/** The passer's current stage x (offscreen at rest). */
	let px = $state<number>(PASSER_FROM_X);

	/** `performance.now()` where it exists (always, in the browser). */
	const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

	/** Pending gap timer (null between a fire and the next schedule). */
	let gapTimer: ReturnType<typeof setTimeout> | null = null;
	/** Pending crossing frame (null while idle). */
	let rafHandle: number | null = null;
	/** The clock reading when the current crossing began. */
	let startedAt = 0;

	function clearGap(): void {
		if (gapTimer !== null) {
			clearTimeout(gapTimer);
			gapTimer = null;
		}
	}

	/** Arm the next passer `PASSER_*` ms from now. */
	function scheduleNext(delayMs: number): void {
		clearGap();
		gapTimer = setTimeout(fire, Math.max(0, delayMs));
	}

	/** Start one crossing: `.passing` + `.rolling` on, then step it frame by frame. */
	function fire(): void {
		gapTimer = null;
		passing = true;
		sound('passer');
		startedAt = now();
		px = PASSER_FROM_X;
		rafHandle = requestAnimationFrame(step);
	}

	/** One crossing frame: move along `passerX`, then end or continue. */
	function step(): void {
		const t = passerProgress(now() - startedAt);
		px = passerX(t);
		if (t < 1) {
			rafHandle = requestAnimationFrame(step);
			return;
		}
		// Done: park off-screen, drop the classes, and wait out the next gap.
		rafHandle = null;
		passing = false;
		px = PASSER_FROM_X;
		scheduleNext(passerGap(rng));
	}

	onMount(() => {
		scheduleNext(firstDelayMs);
		return () => {
			clearGap();
			if (rafHandle !== null) cancelAnimationFrame(rafHandle);
		};
	});

	/* ------------------------------------------------------------------ */
	/* the walk treadmill (see treadmill.ts for the why)                   */
	/* ------------------------------------------------------------------ */

	/** The recycling clock — one track rebuild per TREADMILL_PX walked. */
	const treadmill = createTreadmill();
	/** The parked cars' scrolling track — the layer the treadmill recycles. */
	let trackEl: HTMLElement | undefined = $state();
	/** Recycles of this layer — mirrored onto `data-recycles` for the tests. */
	let cycles = $state(0);

	$effect(() => {
		if (!treadmill.tick(worldX)) return;
		const el = trackEl;
		if (!el) return;
		// Deferred out of the effect flush — see `Street`'s note.
		requestAnimationFrame(() => {
			recycleLayer(el);
			cycles += 1;
		});
	});
</script>

<div class="cars" aria-hidden="true" data-cars={slots.length} data-passing={passing}>
	<!-- The far-lane passer: screen-space, so it never rides the world scroll. -->
	<div class="passer" class:passing class:rolling={passing} style="transform: translateX({px}px)">
		<!-- trusted static SVG from the validated sprite pack -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html passerCar()}
		<div class="headcone"></div>
	</div>

	<!-- The parked cars: the track carries the bounded window shift, cars park
	     relative to the window base. -->
	<div
		class="track"
		bind:this={trackEl}
		data-recycles={cycles}
		style="transform: translateX({shift}px)"
	>
		{#each slots as slot (slot.k)}
			<div class="car" style="transform: translateX({slot.k * SPACING + slot.off - baseX}px)">
				<!-- trusted static SVG from the validated sprite pack -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html car(slot.color)}
			</div>
		{/each}
	</div>
</div>

<style>
	/* The prototype's `.layer` box for `#lCars`: full stage, click-through. */
	.cars {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	/* The scrolling half: carries the bounded window shift (Street's trick, C1). */
	.track {
		position: absolute;
		inset: 0;
		will-change: transform;
	}

	/* `.car` — prototype-exact placement and shadow (lines ~140). */
	.car {
		position: absolute;
		bottom: 6px;
		left: 0;
		filter: drop-shadow(0 6px 10px var(--shadow-night));
	}

	/* `#passer` — screen-space, parked off-screen left until its slot (lines ~141). */
	.passer {
		position: absolute;
		bottom: 8px;
		left: 0;
		will-change: transform;
		filter: drop-shadow(0 6px 10px var(--shadow-night));
	}

	/* `.headcone` — the sweeping headlight pool (lines ~142-144). The gradient's
	 * warm end is the moon token via color-mix (no invented literal); it is a
	 * plain opacity switch, so reduced motion keeps it lit without pulsing. */
	.headcone {
		position: absolute;
		right: 82px;
		bottom: 10px;
		width: 190px;
		height: 44px;
		border-radius: 50%;
		opacity: 0;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--moon) 0%, transparent) 0%,
			color-mix(in srgb, var(--moon) 35%, transparent) 100%
		);
	}

	.passer.passing .headcone {
		opacity: 0.9;
	}

	/* The pack's SVGs arrive through {@html}, so they are not scope-tagged:
	 * size the injected sprites through :global, still anchored to this layer.
	 * The wheel/beam/lens motion is the pack's own global `animCSS`. */
	.car :global(svg),
	.passer :global(svg) {
		display: block;
	}
</style>
