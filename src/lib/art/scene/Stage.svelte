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
	import { rotation } from '$lib/ui/rotation.svelte';

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
	 * T4b — the presentation rotation (revised 2026-10-24, T43 2026-10-29): each
	 * press of the HUD's rotate button turns the stage a quarter turn to the
	 * LEFT (0° → 270° → 180° → 90° → 0°). No sensor is ever consulted; a
	 * portrait viewport in `rotationMode: 'auto'` additionally shows the CSS
	 * prompt — see `rotation.svelte.ts` / ADR-0007.
	 */
	const turned = $derived(rotation());
	/** True on the quarter turns: the wrapper reserves 393 × 852 instead. */
	const rotated = $derived(turned === 90 || turned === 270);
	/**
	 * The stage's transform chain, right to left: scale, turn, then slide the
	 * rotated box back onto the wrapper's origin. Each case was derived from
	 * the rotation matrix so the 393×852 (or 852×393) footprint lands at (0,0).
	 */
	const stageTransform = $derived.by(() => {
		const s = scale;
		switch (turned) {
			case 90:
				return `translate(${REF_HEIGHT * s}px, 0px) rotate(90deg) scale(${s})`;
			case 180:
				return `translate(${REF_WIDTH * s}px, ${REF_HEIGHT * s}px) rotate(180deg) scale(${s})`;
			case 270:
				return `translate(0px, ${REF_WIDTH * s}px) rotate(270deg) scale(${s})`;
			default:
				return `scale(${s})`;
		}
	});

	function fit() {
		if (!frame) return;
		// The frame's padding is the safe-area inset already resolved to px by
		// the browser, so it is read back rather than duplicated in JS.
		const cs = getComputedStyle(frame);
		const insetX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
		const insetY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
		const availW = window.innerWidth - CHROME_X - insetX;
		const availH = Math.max(window.innerHeight - CHROME_Y - insetY, MIN_AVAIL_HEIGHT);
		// A quarter turn swaps the footprint: 393 × 852 instead of 852 × 393.
		const footW = rotated ? REF_HEIGHT : REF_WIDTH;
		const footH = rotated ? REF_WIDTH : REF_HEIGHT;
		scale = Math.max(MIN_SCALE, Math.min(availW / footW, availH / footH, MAX_SCALE));
	}

	// A turn changes the footprint — refit immediately (the resize listeners
	// only cover viewport changes).
	$effect(() => {
		rotation();
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
     `data-rotation` (T4b) reports the manual quarter-turn rotation, degrees. -->
<div class="stage-frame" bind:this={frame} data-scale={scale.toFixed(4)} data-rotation={turned}>
	<div class="stage-wrap" class:rotated style="--stage-scale: {scale}">
		<div class="stage" style="transform: {stageTransform}">{@render children?.()}</div>
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

	/* T4b: the quarter-turned wrapper reserves the rotated footprint
	 * (393 × 852 at scale), so the frame's centring and the stage's rotated
	 * transform agree. */
	.stage-wrap.rotated {
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
		/* The transform (scale + T4b quarter turn) is inline — see `stageTransform`. */
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
</style>
