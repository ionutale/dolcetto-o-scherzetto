<script lang="ts">
	/**
	 * T21 — the ambient sky life: the drifting ghosts behind the rooflines, the
	 * shy trash-can cameo, and the giggle-hop a successful scherzo earns
	 * (spec §4.4: "Sky ghosts: 2–3 drifting above rooftops (behind houses),
	 * gentle bob; a shy one peeks from a trash can occasionally; sky ghosts
	 * giggle-hop after every successful scherzo").
	 *
	 * Port of the prototype's `#lGhosts` layer and its per-frame wiring
	 * (`prototypes/scene-prototype.html`, CSS ~88-92, `initNpcs()` ~1172-1182,
	 * `renderScene()` ~1763-1770) plus `cameoTick()` (~1560-1583):
	 *
	 *   - **three sky ghosts** at the prototype anchors, each on its own drift
	 *     phase, wrapped through the 2400 px strip at `0.55` parallax — all of it
	 *     is `ghost-model.ts`'s maths (pinned there), this component only writes
	 *     the `translateX`;
	 *   - the **bob** is the prototype's `ghostbob` keyframe on the ghost's own
	 *     `<svg>`, so the horizontal drift (on the wrapper) and the vertical bob
	 *     (on the art) never fight over one transform;
	 *   - the **cameo**: on a rate-limited schedule a can-house in view reveals a
	 *     small head that rises out of the can (`cameoRise`), waits, and sinks
	 *     back (`cameoFall`) — the prototype's scale/`translateY` beat as CSS
	 *     keyframes, so the entrance needs no `requestAnimationFrame` handshake;
	 *   - the **hop**: `hop()` plays `ghosthop` on all three at once, once per
	 *     show (`decideHop`). The T15 page wiring calls it from the theatre's
	 *     `onClimax`, just after the burst dispatch.
	 *
	 * **Stacking.** The prototype paints ghosts *behind* the street (`#lGhosts`
	 * before `#lStreet`) but the cameo *in front* of it (`#lCameo` after, its
	 * head `z-index:4`). Mount this component **between `<ParallaxLayers>` and
	 * `<Street>`**: the `.ghosts` layer carries no `z-index`, so DOM order puts
	 * it under the street and its rooflines; the `.cameo` layer keeps the
	 * prototype's `z-index:4`, which lifts the head over the street (and under
	 * the kids' `z-index:5`) wherever the component sits.
	 *
	 * **Reduced motion** (ART-STYLE §4 rule 4): the drift is frozen (the loop
	 * never advances `t`, so the ghosts hold their anchor offsets) and the bob,
	 * the hop and the cameo's rise all die — the ghosts still parallax with the
	 * walk (a translation, which reduced motion keeps), and the cameo still
	 * *appears*, it just snaps in and out.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { CAMEO_GHOST, SKY_GHOST } from '$lib/art/sprites/sky-ghosts';
	import {
		CAMEO_BOTTOM,
		CAMEO_FIRST_MS,
		CAMEO_RETRACT_MS,
		CAMEO_RISE_MS,
		GHOST_COUNT,
		GHOST_HOP_MS,
		cameoTick,
		decideHop,
		ghostBottom,
		ghostScreenX,
		nextShowToken
	} from './ghost-model';
	import type { Cameo, ShowToken } from './ghost-model';

	interface Props {
		/** World scroll position in logical px — the parallax input (as `Street`). */
		worldX?: number;
	}

	let { worldX = 0 }: Props = $props();

	/** The three ghosts' fixed row data (index + baseline), from the model. */
	const ROWS = Array.from({ length: GHOST_COUNT }, (_, i) => ({ i, bottom: ghostBottom(i) }));

	/** `performance.now()/1000` while the bob runs; frozen at 0 under reduced motion. */
	let t = $state(0);

	/** True while the giggle-hop plays — drives `.hop` and guards re-entry. */
	let hopActive = $state(false);

	/** The head currently peeking out of a can, or `null`. */
	let cameo = $state<Cameo | null>(null);
	/** Its retract beat: `true` while it sinks back (drives `cameoFall`). */
	let cameoOut = $state(false);

	/** `prefers-reduced-motion`, read once on mount (the prototype's `RM`). */
	let reducedMotion = false;
	/** True while a cameo is mid-reveal — the scheduler's "one at a time" bit. */
	let cameoActive = false;
	/** When the next cameo becomes due (`performance.now()` origin). */
	let nextAt = 0;
	/** The live animation-frame handle. */
	let raf = 0;

	/** Every timer this component owns, cancelled when the stage goes away. */
	const timers: ReturnType<typeof setTimeout>[] = [];
	let hopTimer: ReturnType<typeof setTimeout> | null = null;

	function after(ms: number, fn: () => void): void {
		const id = setTimeout(() => {
			const i = timers.indexOf(id);
			if (i >= 0) timers.splice(i, 1);
			fn();
		}, ms);
		timers.push(id);
	}

	/** `performance.now()` where available, `Date.now()` as the last resort. */
	function nowMs(): number {
		return typeof performance === 'undefined' ? Date.now() : performance.now();
	}

	/** Each ghost's horizontal position for the current `t`/`worldX`. */
	const ghostTransform = $derived(
		ROWS.map((row) => `translateX(${ghostScreenX(row.i, t, worldX)}px)`)
	);

	/** One scheduler tick: reveal a due cameo (never two at once). */
	function tickCameo(now: number): void {
		const decision = cameoTick(now, nextAt, worldX, Math.random, cameoActive);
		nextAt = decision.nextAt;
		if (decision.cameo) revealCameo(decision.cameo);
	}

	/** Rise, wait, then sink and drop the head — `cameoTick()`'s 2.2 s / 0.45 s. */
	function revealCameo(c: Cameo): void {
		cameo = c;
		cameoOut = false;
		cameoActive = true;
		after(CAMEO_RISE_MS, () => {
			cameoOut = true;
			after(CAMEO_RETRACT_MS, () => {
				cameo = null;
				cameoOut = false;
				cameoActive = false;
			});
		});
	}

	/** One frame: advance the drift and service the cameo clock. */
	function frame(now: number): void {
		if (!reducedMotion) t = now / 1000;
		tickCameo(now);
		raf = requestAnimationFrame(frame);
	}

	/** The show token the last hop was played for (`decideHop`'s memory). */
	let hopMemory: ShowToken | null = null;

	/**
	 * The giggle-hop: every sky ghost plays `ghosthop` at once, **once per
	 * show**. Theatre's `onClimax` (itself one-per-show) calls this with no
	 * argument — each call is a fresh show token; pass a stable `token` to
	 * dedupe explicitly (`decideHop` is the pinned predicate).
	 */
	export function hop(token?: number): void {
		if (reducedMotion || hopActive) return;
		const decision = decideHop(hopMemory, token ?? nextShowToken(hopMemory));
		if (!decision.hop) return;
		hopMemory = decision.memory;
		hopActive = true;
		if (hopTimer !== null) clearTimeout(hopTimer);
		hopTimer = setTimeout(() => {
			hopActive = false;
			hopTimer = null;
		}, GHOST_HOP_MS);
	}

	onMount(() => {
		try {
			reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		} catch {
			reducedMotion = false;
		}
		// No rAF in a non-browser host: place once and leave the ghosts static.
		if (typeof requestAnimationFrame !== 'function') return;
		nextAt = nowMs() + CAMEO_FIRST_MS;
		raf = requestAnimationFrame(frame);
	});

	onDestroy(() => {
		if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
		if (hopTimer !== null) clearTimeout(hopTimer);
		for (const id of timers) clearTimeout(id);
		timers.length = 0;
	});
</script>

<!-- Sky ghosts: no `z-index`, so DOM order keeps them behind the street's
     rooflines when this is mounted just before `<Street>`. -->
<div class="ghosts" aria-hidden="true">
	{#each ROWS as row (row.i)}
		<div
			class="ghost"
			class:hop={hopActive}
			style:bottom="{row.bottom}px"
			style:transform={ghostTransform[row.i]}
		>
			<!-- trusted static SVG from the prototype host -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html SKY_GHOST}
		</div>
	{/each}
</div>

<!-- The shy cameo: `z-index:4` lifts the head over the street (the trash can it
     peeks from) and under the kids (z-index:5). -->
<div class="cameo" aria-hidden="true">
	{#if cameo}
		<div
			class="cameo-head"
			class:out={cameoOut}
			style:left="{cameo.x}px"
			style:bottom="{CAMEO_BOTTOM}px"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html CAMEO_GHOST}
		</div>
	{/if}
</div>

<style>
	.ghosts {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.ghost {
		position: absolute;
		left: 0;
		will-change: transform;
		filter: drop-shadow(0 6px 12px var(--shadow-night));
	}

	/* The SVG arrives through {@html}, so it is not scope-tagged: size it and run
	 * the bob through :global, still anchored to this ghost. */
	.ghost :global(svg) {
		display: block;
		animation: ghostbob 4.5s ease-in-out infinite alternate;
	}

	/* The giggle-hop rides on top of the bob, prototype-exact. */
	.ghost.hop :global(svg) {
		animation:
			ghostbob 4.5s ease-in-out infinite alternate,
			ghosthop 0.9s ease;
	}

	@keyframes ghostbob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-9px);
		}
	}

	@keyframes ghosthop {
		0% {
			transform: translateY(0);
		}
		40% {
			transform: translateY(-16px);
		}
		100% {
			transform: translateY(0);
		}
	}

	.cameo {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 4;
		overflow: hidden;
	}

	.cameo-head {
		position: absolute;
		width: 34px;
		height: 44px;
		transform-origin: bottom center;
		filter: drop-shadow(0 4px 8px var(--shadow-night));
		animation: cameoRise 0.4s cubic-bezier(0.3, 1.4, 0.6, 1) both;
	}

	.cameo-head.out {
		animation: cameoFall 0.45s ease both;
	}

	/* The prototype's rise: a small head inside the can grows up to the rim. */
	@keyframes cameoRise {
		from {
			transform: scale(0.2) translateY(38px);
		}
		to {
			transform: scale(1) translateY(0);
		}
	}

	@keyframes cameoFall {
		from {
			transform: scale(1) translateY(0);
		}
		to {
			transform: scale(0.2) translateY(38px);
		}
	}

	/* Reduced motion: the bob and the hop are ambient loops and stop; the cameo
	 * is a reveal, so it stays — it just snaps instead of rising. */
	@media (prefers-reduced-motion: reduce) {
		.ghost :global(svg),
		.ghost.hop :global(svg) {
			animation: none;
		}

		.cameo-head,
		.cameo-head.out {
			animation: none;
		}
	}
</style>
