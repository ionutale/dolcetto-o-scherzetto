<script lang="ts">
	/**
	 * The stage frame — the 852×393 design reference (iPhone 16 landscape,
	 * ADR-0004): height-scaled, fluid width, centred, safe-area aware.
	 *
	 * Faithful port of `fit()` at the foot of `prototypes/scene-prototype.html`
	 * (v2, lines ~1748-1757) plus the `.stagewrap` / `.stage` pair (lines ~51-62):
	 * the wrapper reserves the *scaled* box (`852 * s` × `393 * s`), while the
	 * stage keeps its 852×393 logical coordinates and is scaled from its
	 * top-left corner. Everything composed inside therefore addresses fixed
	 * logical pixels and never has to think about the device — which is exactly
	 * what T09+ (street, houses, kids, bubbles, theatre) rely on.
	 *
	 * Prototype numbers, kept verbatim — the plan's acceptance pins the result
	 * (at 852×393 the scale lands at ≈0.865, the wrapper at ≈737×340):
	 *
	 *   s = max(.4, min((innerWidth - 40) / 852, max(innerHeight - 360, 340) / 393, 1.6))
	 *
	 * `40` was the prototype page's horizontal chrome and `360` its header/tools
	 * stack. Neither is real chrome here any more, but they are what reproduces
	 * the validated reference numbers on the reference device, so they stay as
	 * named constants rather than magic numbers.
	 *
	 * Safe areas (ADR-0004 · spec §13): the frame's own padding *is*
	 * `env(safe-area-inset-*)`, so the stage centres inside the notch-free box
	 * when an iPhone rotates and the Dynamic Island swaps sides; `fit()` reads
	 * that resolved padding back and subtracts it from the viewport, keeping one
	 * source of truth for both the centring and the available box. On hosts that
	 * report no insets — and until `app.html` opts into `viewport-fit=cover`,
	 * which this task does not own — they resolve to 0 and the formula above
	 * holds exactly.
	 */
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { flip } from '$lib/ui/flip.svelte';

	interface Props {
		/** Scene layers composed inside the 852×393 frame (T09 adds the street, T10 the kids…). */
		children?: Snippet;
	}

	let { children }: Props = $props();

	/** Design reference in logical px (ADR-0004). */
	const REF_WIDTH = 852;
	const REF_HEIGHT = 393;
	/** Clamp: never below .4, never above 2 (production runs full-bleed, no dev chrome). */
	const MIN_SCALE = 0.4;
	const MAX_SCALE = 2;
	/** Short-window floor: the stage still gets the prototype's 340 px. */
	const MIN_AVAIL_HEIGHT = 340;
	/** Full-bleed breathing margin (the prototype reserved 40/360 for its dev chrome). */
	const CHROME_X = 16;
	const CHROME_Y = 16;

	let frame = $state<HTMLElement | null>(null);
	let scale = $state(1);

	/**
	 * T4b — the manual presentation flip. `portrait` turns the whole stage a
	 * quarter turn (and swaps its footprint in `fit`); the accelerometer is
	 * never consulted — see `flip.svelte.ts` for the why.
	 */
	const flipped = $derived(flip() === 'portrait');

	function fit() {
		if (!frame) return;
		// The frame's padding is the safe-area inset already resolved to px by
		// the browser, so it is read back rather than duplicated in JS.
		const cs = getComputedStyle(frame);
		const insetX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
		const insetY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
		const availW = window.innerWidth - CHROME_X - insetX;
		const availH = Math.max(window.innerHeight - CHROME_Y - insetY, MIN_AVAIL_HEIGHT);
		// The flipped footprint is 393 × 852 instead of 852 × 393.
		const footW = flipped ? REF_HEIGHT : REF_WIDTH;
		const footH = flipped ? REF_WIDTH : REF_HEIGHT;
		scale = Math.max(MIN_SCALE, Math.min(availW / footW, availH / footH, MAX_SCALE));
	}

	// A flip changes the footprint — refit immediately (the resize listeners
	// only cover viewport changes).
	$effect(() => {
		flip();
		fit();
	});

	onMount(() => {
		fit();
		window.addEventListener('resize', fit);
		// iOS reports a rotation as a resize, but not always at the final size;
		// the extra listener only ever recomputes the same numbers.
		window.addEventListener('orientationchange', fit);
		return () => {
			window.removeEventListener('resize', fit);
			window.removeEventListener('orientationchange', fit);
		};
	});
</script>

<!-- `data-scale` is a read-only handle for the e2e placeholder (T30) and for
     the T08 smoke: it reports the live fit() result without touching the DOM.
     `data-flip` (T4b) reports the manual presentation flip. -->
<div
	class="stage-frame"
	bind:this={frame}
	data-scale={scale.toFixed(4)}
	data-flip={flipped ? 'portrait' : 'landscape'}
>
	<div class="stage-wrap" class:flipped style="--stage-scale: {scale}">
		<div class="stage" class:flipped>{@render children?.()}</div>
	</div>
</div>

<style>
	.stage-frame {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		/* The Dynamic Island swaps sides on rotation, so all four edges are
		 * padded; the fallback keeps the shorthand valid where env() is
		 * unsupported. */
		padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
			env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
		overflow: hidden;
	}

	/* Reserves the scaled box so the stage's transform never reflows the page. */
	.stage-wrap {
		position: relative;
		width: calc(852px * var(--stage-scale));
		height: calc(393px * var(--stage-scale));
	}

	/* T4b: the flipped wrapper reserves the rotated footprint (393 × 852 at
	 * scale), so the frame's centring and the stage's rotated transform agree. */
	.stage-wrap.flipped {
		width: calc(393px * var(--stage-scale));
		height: calc(852px * var(--stage-scale));
	}

	.stage {
		position: absolute;
		top: 0;
		left: 0;
		width: 852px;
		height: 393px;
		overflow: hidden;
		border-radius: var(--r-lg);
		transform: scale(var(--stage-scale));
		transform-origin: top left;
		background: var(--night-1);
		/* The prototype's 8 px cream halo (alpha .035) is dropped: there is no
		 * token that faint, and on the night background it read as nothing. */
		box-shadow:
			0 30px 80px var(--shadow-night),
			0 0 0 1px var(--cream-soft);
		user-select: none;
		-webkit-user-select: none;
		/* The stage is a game surface: no scroll chaining, no double-tap zoom. */
		touch-action: none;
	}

	/* T4b: `portrait` turns the stage a quarter turn clockwise and parks the
	 * rotated box at the wrapper's origin (393 × 852 at scale). The transform
	 * chain, right to left: scale, rotate, then slide by the stage's height. */
	.stage.flipped {
		transform: translate(calc(393px * var(--stage-scale)), 0) rotate(90deg)
			scale(var(--stage-scale));
	}
</style>
