<script lang="ts">
	/**
	 * T22 — the neighborhood theming decor: the per-theme ambience the spec
	 * §4.2 rotation asks for, on top of the street the other layers already
	 * draw (plan T22; spec §4.2/§4.4/§9).
	 *
	 * All the numbers are `theme-model.ts`'s (pinned there): this component owns
	 * only the DOM, the palette application and the one time-driven beat (the
	 * rare starry shooting star). The theme comes from the store's `furthest()`
	 * seam through `themeAt`, exactly the mapping the task pins —
	 * `themeFor(neighborhoodIndex(furthest))` — and is overridable by prop so a
	 * scratch route (or a test harness) can look at any of the four reskins.
	 *
	 * **What each theme adds** (the table in `theme-model.ts` is the source of
	 * truth; the tests pin it):
	 *
	 *   - `leafy` — four drifting leaves per house, low over the walk/road band;
	 *   - `foggy` — two extra fog wisps per house plus one wide faint mist band
	 *     per window, low over the yards;
	 *   - `pumpkin` — a three-pumpkin cluster at the yard edge plus a hay tuft on
	 *     the opposite edge, alternating left/right house by house;
	 *   - `starry` — four brighter shimmer stars high in the sky band, plus the
	 *     rare shooting star (≥ 40 s apart, one at a time).
	 *
	 * **Windowing.** `decorSlots(theme, worldX)` is the street/cars window
	 * (`floor(worldX / SPACING) - 1` plus four more houses). One container per
	 * tier carries the window's bounded `-(worldX - baseX)` and each node parks
	 * at `k*SPACING + off - baseX` — one compositor transform per frame,
	 * bounded nodes (≤ 30 per window, recycled as the window slides) **and
	 * bounded painted offsets** (C1, 2026-10-18 — see `Street`'s note).
	 *
	 * **Layering (why this mounts before `<Street/>`).** The layer sits with the
	 * background group — after `<ParallaxLayers/>` and `<Ghosts/>`, before
	 * `<Street/>` — because that is where the *sky* half of the decor belongs:
	 * the mist, the wisps and the shimmer stars read as weather in front of the
	 * parallax bands and behind the rooflines, and the shooting star crosses
	 * behind the houses exactly as the sky ghosts do. The *ground* half (leaves,
	 * pumpkins, hay) must sit **on** the street's yard/sidewalk bands, which are
	 * painted by `<Street/>` and therefore opaque from this mount point, so that
	 * tier carries `z-index: 3` — the `Ghosts` cameo precedent (`z-index: 4`
	 * there) of lifting a sub-layer over the street from a background DOM slot.
	 * The kids keep `z-index: 5`, so the duo still walks in front of every
	 * pumpkin, and the whole layer is `pointer-events: none` + `aria-hidden`.
	 *
	 * **Reduced motion** (ART-STYLE §4 rule 4 · spec §13). The decor's drift,
	 * sway, bob and twinkle are ambient loops: the component's own
	 * `prefers-reduced-motion: reduce` block turns them off (they are on
	 * `::before` shapes, which the global `.reduce-motion-off` utility cannot
	 * reach — the media query is the mechanism `app.css` asks for in that case).
	 * The decorations **stay visible**, parked at their rest state, and they
	 * still ride the walk (a translation, which reduced motion keeps). The
	 * shooting star is **absent** under reduced motion: it is a spawn-and-cross
	 * flourish with no static reading, so the starry sky simply keeps the
	 * shimmer pass.
	 *
	 * Decorative only: `aria-hidden`, `pointer-events: none`, and it never reads
	 * or feeds the refusal roll (spec §4.4 — ornaments are pure decor).
	 */
	import { onMount } from 'svelte';
	import { SPACING } from '$lib/sim/loop';
	import { furthest } from '$lib/state/game.svelte';
	import type { Theme } from '$lib/sim/progression';
	import {
		SHOOT_DUR_MS,
		SHOOT_FIRST_MS,
		SHOOT_FROM_X,
		SHOOT_FROM_Y,
		decorSlots,
		decorTone,
		firstDecorK,
		isSkyKind,
		shootProgress,
		shootTick,
		shootX,
		shootY,
		themeAt
	} from './theme-model';
	import type { DecorSlot, Rng } from './theme-model';
	import { createTreadmill, recycleLayer } from './treadmill';

	interface Props {
		/** World scroll position in logical px — the window's only input (as `Street`). */
		worldX?: number;
		/** Theme override (a scratch route / harness); default = `themeAt(furthest())`. */
		theme?: Theme;
		/** Shooting-star gap rng (defaults to `Math.random`); injectable for a harness. */
		rng?: Rng;
		/** Delay before the first shooting star (defaults to the model's 40 s floor). */
		firstShootMs?: number;
	}

	let {
		worldX = 0,
		theme: themeProp,
		rng = Math.random,
		firstShootMs = SHOOT_FIRST_MS
	}: Props = $props();

	/** How often the shooting-star scheduler is asked (cheap; it is rate-limited). */
	const SHOOT_POLL_MS = 250;

	/** The live theme: the prop, or the store's progression seam. */
	const theme = $derived(themeProp ?? themeAt(furthest()));

	/** The window's picks — pure, deterministic, recomputed per scroll (bounded). */
	const slots = $derived(decorSlots(theme, worldX));
	/** Sky half (behind the street) and ground half (lifted over it). */
	const skySlots = $derived(slots.filter((s) => isSkyKind(s.kind)));
	const groundSlots = $derived(slots.filter((s) => !isSkyKind(s.kind)));

	/**
	 * C1 bounded paints: the container and every node are painted relative to
	 * the live window's base (`firstDecorK * SPACING`), so no painted offset
	 * grows past one house period however far the walk has gone — the composed
	 * position (`k*SPACING + off - worldX`) is unchanged (see `Street`'s note).
	 */
	const baseX = $derived(firstDecorK(worldX) * SPACING);
	const shift = $derived(-(worldX - baseX));

	/** A node's inline style: placement, box, §3 tone and stagger delay. */
	function styleOf(slot: DecorSlot): string {
		const x = slot.k * SPACING + slot.off - baseX;
		return [
			`transform: translate3d(${x}px, ${slot.y}px, 0)`,
			`width: ${slot.w}px`,
			`height: ${slot.h}px`,
			`--tone: ${decorTone(slot)}`,
			`--delay: ${slot.delay}s`
		].join('; ');
	}

	/* ------------------------------------------------------------------ */
	/* the rare shooting star (`starry` only; the model owns the cadence)  */
	/* ------------------------------------------------------------------ */

	/** True while a streak is crossing — the mural's only moving node. */
	let shooting = $state(false);
	/** The streak head's stage position (offscreen at rest). */
	let sx = $state<number>(SHOOT_FROM_X);
	let sy = $state<number>(SHOOT_FROM_Y);

	/** Set once on mount and only then can the scheduler start (see the effect). */
	let mounted = $state(false);
	/** `prefers-reduced-motion`, read once on mount. */
	let reducedMotion = $state(false);

	/** The model's re-arm clock, and the poll that asks it. */
	let nextAt = 0;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	/** The crossing frame (null while idle). */
	let raf: number | null = null;
	/** `performance.now()` when the current crossing began. */
	let startedAt = 0;

	/** `performance.now()` where it exists (always, in the browser). */
	const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

	/** Start one crossing: the streak becomes visible and steps frame by frame. */
	function fire(): void {
		shooting = true;
		startedAt = now();
		sx = SHOOT_FROM_X;
		sy = SHOOT_FROM_Y;
		raf = requestAnimationFrame(step);
	}

	/** One crossing frame: move along `shootX`/`shootY`, then end and re-arm. */
	function step(): void {
		const t = shootProgress(now() - startedAt);
		sx = shootX(t);
		sy = shootY(t);
		if (t < 1) {
			raf = requestAnimationFrame(step);
			return;
		}
		raf = null;
		shooting = false;
		sx = SHOOT_FROM_X;
		sy = SHOOT_FROM_Y;
	}

	/** One scheduler tick: `shootTick` is 40 s-floored and one-at-a-time. */
	function tick(): void {
		const decision = shootTick(now(), nextAt, rng, shooting);
		nextAt = decision.nextAt;
		if (decision.shoot) fire();
	}

	/** Stop the scheduler and park the streak (theme change, reduced motion, destroy). */
	function stop(): void {
		if (pollTimer !== null) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		if (raf !== null) {
			cancelAnimationFrame(raf);
			raf = null;
		}
		shooting = false;
		sx = SHOOT_FROM_X;
		sy = SHOOT_FROM_Y;
	}

	/**
	 * The star runs only in `starry`, only in a browser, and only while motion is
	 * allowed; walking into the next theme tears it down and arms the next
	 * neighborhood's 40 s floor from scratch. `mounted` is the gate that keeps
	 * the scheduler from starting before `prefers-reduced-motion` is read.
	 */
	$effect(() => {
		if (!mounted || reducedMotion || theme !== 'starry') return;
		nextAt = now() + firstShootMs;
		pollTimer = setInterval(tick, SHOOT_POLL_MS);
		return stop;
	});

	onMount(() => {
		try {
			reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		} catch {
			reducedMotion = false;
		}
		mounted = true;
	});

	/* ------------------------------------------------------------------ */
	/* the walk treadmill (see treadmill.ts for the why)                   */
	/* ------------------------------------------------------------------ */

	/** The recycling clock — one tracks rebuild per TREADMILL_PX walked. */
	const treadmill = createTreadmill();
	/** The recyclable box around the two scrolling tracks. */
	let tracksEl: HTMLElement | undefined = $state();
	/** Recycles of this layer — mirrored onto `data-recycles` for the tests. */
	let cycles = $state(0);

	$effect(() => {
		if (!treadmill.tick(worldX)) return;
		const el = tracksEl;
		if (!el) return;
		// Deferred out of the effect flush — see `Street`'s note.
		requestAnimationFrame(() => {
			recycleLayer(el);
			cycles += 1;
		});
	});
</script>

<div
	class="themes"
	aria-hidden="true"
	data-theme={theme}
	data-decor={slots.length}
	data-ground={groundSlots.length}
	data-sky={skySlots.length}
	data-shooting={shooting}
>
	<!-- The scrolling tracks wrapped in one recyclable box (the walk treadmill;
	     `display: contents` — it never generates a box of its own). -->
	<div class="tracks" bind:this={tracksEl} data-recycles={cycles}>
		<!-- Sky half: no `z-index`, so DOM order keeps it behind the street's rooflines
	     (the mist, the wisps, the shimmer and the star crossing). -->
		<div class="track sky" style="transform: translateX({shift}px)">
			{#each skySlots as slot (theme + ':' + slot.k + ':' + slot.i)}
				<i class="decor d-{slot.kind}" style={styleOf(slot)}></i>
			{/each}
		</div>

		<!-- Ground half: `z-index: 3` lifts it over the street's bands and yard dressing
	     (the `Ghosts` cameo precedent) and keeps it under the kids' `z-index: 5`. -->
		<div class="track ground" style="transform: translateX({shift}px)">
			{#each groundSlots as slot (theme + ':' + slot.k + ':' + slot.i)}
				<i class="decor d-{slot.kind}" style={styleOf(slot)}></i>
			{/each}
		</div>
	</div>

	<!-- The rare shooting star: screen-space (a crossing, never riding the scroll). -->
	{#if shooting}
		<div
			class="shoot"
			style="transform: translate3d({sx}px, {sy}px, 0); --dur: {SHOOT_DUR_MS}ms"
		></div>
	{/if}
</div>

<style>
	/* The prototype's full-stage `.layer` box: decorative, click-through. */
	.themes {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	/* The treadmill's recyclable box: `display: contents` keeps the two tracks'
	 * containing block and stacking exactly as they were (no box is generated;
	 * the absolutely-positioned tracks keep resolving against `.themes`). */
	.tracks {
		display: contents;
	}

	/* One scrolling container per tier — carries the window's bounded shift once
	 * per frame (the `Street` / `Cars` trick); nodes park at `k*SPACING + off - baseX`. */
	.track {
		position: absolute;
		inset: 0;
		will-change: transform;
	}

	.track.ground {
		z-index: 3;
	}

	/* A decor node: placed by its own static transform; the visible shape and the
	 * ambient loop live on `::before`, so placement and motion never share one
	 * transform. Nothing here animates layout. */
	.decor {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}

	.decor::before {
		content: '';
		position: absolute;
		inset: 0;
	}

	/* ---- leafy: drifting leaves (a slow fall with a lazy tumble) ---- */
	.d-leaf::before {
		border-radius: 70% 30% 65% 35% / 60% 40% 60% 40%;
		background: var(--tone);
		opacity: 0.85;
		animation: leafDrift 9s ease-in-out infinite;
		animation-delay: var(--delay);
	}

	@keyframes leafDrift {
		0% {
			transform: translate3d(5px, -12px, 0) rotate(-24deg);
			opacity: 0.35;
		}
		45% {
			opacity: 0.9;
		}
		100% {
			transform: translate3d(-7px, 26px, 0) rotate(150deg);
			opacity: 0.25;
		}
	}

	/* ---- foggy: extra wisps (soft, blurred, slow) and the faint mist band ---- */
	.d-wisp::before,
	.d-mist::before {
		border-radius: 50%;
		background: var(--tone);
		filter: blur(22px);
		opacity: 0.55;
	}

	.d-wisp::before {
		animation: wispDrift 22s ease-in-out infinite alternate;
		animation-delay: var(--delay);
	}

	@keyframes wispDrift {
		from {
			transform: translate3d(-40px, 0, 0);
			opacity: 0.4;
		}
		to {
			transform: translate3d(40px, 0, 0);
			opacity: 0.6;
		}
	}

	.d-mist::before {
		border-radius: var(--r-pill);
		filter: blur(26px);
		opacity: 0.3;
		animation: mistDrift 34s ease-in-out infinite alternate;
	}

	@keyframes mistDrift {
		from {
			transform: translate3d(-60px, 0, 0);
			opacity: 0.22;
		}
		to {
			transform: translate3d(60px, 0, 0);
			opacity: 0.4;
		}
	}

	/* ---- pumpkin: yard clusters (round body, stem, a lazy bob) ---- */
	.d-pumpkin::before {
		border-radius: 46% 46% 40% 40%;
		background: var(--tone);
		box-shadow:
			inset -3px -3px 0 color-mix(in srgb, var(--ink-night) 18%, transparent),
			0 3px 5px var(--shadow-night);
		animation: pumpkinBob 6s ease-in-out infinite alternate;
		animation-delay: var(--delay);
	}

	.d-pumpkin::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -3px;
		width: 3px;
		height: 5px;
		border-radius: 2px;
		background: var(--stem);
		transform: translateX(-50%) rotate(8deg);
	}

	@keyframes pumpkinBob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-2px);
		}
	}

	/* ---- pumpkin: hay tufts at the yard edges (a few straws, a soft sway) ---- */
	.d-hay::before {
		/* A straw pile, not a bale: the clip-path gives it the ragged top edge of
		 * loose straw and the gradient the blades, so one element reads as a
		 * tuft at stage scale. */
		background: repeating-linear-gradient(
			84deg,
			var(--tone) 0 2px,
			color-mix(in srgb, var(--tone) 0%, transparent) 2px 5px,
			var(--tone) 5px 6px,
			color-mix(in srgb, var(--tone) 0%, transparent) 6px 10px
		);
		clip-path: polygon(
			0% 100%,
			6% 34%,
			18% 74%,
			32% 10%,
			46% 66%,
			60% 2%,
			74% 58%,
			88% 26%,
			100% 100%
		);
		opacity: 0.92;
		animation: haySway 7s ease-in-out infinite alternate;
		animation-delay: var(--delay);
	}

	@keyframes haySway {
		from {
			transform: skewX(-6deg);
		}
		to {
			transform: skewX(6deg);
		}
	}

	/* ---- starry: the brighter shimmer pass ---- */
	.d-shimmer::before {
		border-radius: 50%;
		background: var(--tone);
		box-shadow: 0 0 10px 3px color-mix(in srgb, var(--tone) 60%, transparent);
		animation: shimmerPulse 3.4s ease-in-out infinite;
		animation-delay: var(--delay);
	}

	@keyframes shimmerPulse {
		0%,
		100% {
			opacity: 0.3;
			transform: scale(0.7);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}

	/* ---- starry: the rare shooting star (a crossing + an opacity fade) ---- */
	.shoot {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		animation: shootFade var(--dur, 1400ms) linear both;
	}

	.shoot::before {
		content: '';
		position: absolute;
		right: 0;
		bottom: 0;
		width: 86px;
		height: 2px;
		border-radius: var(--r-pill);
		transform: rotate(7deg);
		transform-origin: right center;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--moon) 0%, transparent) 0%,
			var(--moon) 100%
		);
	}

	.shoot::after {
		content: '';
		position: absolute;
		left: -3px;
		top: -3px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--moon);
		box-shadow: 0 0 10px 3px var(--cream-line);
	}

	@keyframes shootFade {
		0% {
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		78% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	/* Reduced motion (ART-STYLE §4 rule 4 · spec §13): every ambient loop this
	 * layer owns stops and the shapes hold their rest state. The decorations stay
	 * visible and still ride the walk (a translation, allowed); the shooting star
	 * is torn down by the component under reduced motion, and this hides it as a
	 * belt-and-braces in case a streak was already in flight. */
	@media (prefers-reduced-motion: reduce) {
		.decor::before,
		.shoot {
			animation: none;
		}

		.shoot {
			display: none;
		}
	}
</style>
