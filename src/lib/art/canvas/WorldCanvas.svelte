<script lang="ts">
	/**
	 * The canvas world — T4 (2026-10-19).
	 *
	 * Replaces the DOM scene's scrolling layers (`ParallaxLayers`, `ThemeLayer`,
	 * `Street`'s houses, `Cars`) with one canvas: a single backing store
	 * redrawn in place every frame. Why: six device logs showed that DOM
	 * scrolling retains raster on iOS until the page idles — and continuous
	 * walking never idles. Three countermeasures (the raster breath, C1
	 * bounded paints, the walk treadmill with `rc` 0→12) all fired on cadence
	 * and were killed anyway; a canvas has no per-scrolled-pixel retention by
	 * construction. Plan + evidence: `docs/T4-CANVAS-PLAN.md`.
	 *
	 * Order (matches the DOM stacking): parallax → sky decor → shooting star
	 * (behind the rooflines) → houses → cars → ground decor. The DOM bands
	 * (`StreetBands`) and sky paint underneath; kids/HUD/overlays stay above.
	 *
	 * Sizing: the stage is 852×393 logical, scaled by the stage frame; the CSS
	 * box stays 852×393 and the backing store is `852 × s × DPR`, so drawing
	 * happens in stage coordinates via one `setTransform`.
	 */
	import { onMount } from 'svelte';
	import { furthest } from '$lib/state/game.svelte';
	import {
		SHOOT_FIRST_MS,
		shootGap,
		shootProgress,
		shootX,
		shootY,
		themeAt
	} from '$lib/art/scene/theme-model';
	import { palette, type Palette } from './palette';
	import type { LayerEnv } from './env';
	import { drawParallaxLayer } from './parallax-layer';
	import { drawDecorGround, drawDecorSky, drawShootingStar } from './decor-layer';
	import { drawHousesLayer, type HousesInput } from './houses-layer';
	import { createCarsLayer, type CarsLayer } from './cars-layer';

	interface Props {
		/** World scroll position in logical px — the sim's only street input. */
		worldX: number;
		/** Per-home flags keyed by house index `k`; `done` dims the windows. */
		homes?: Record<number, { done?: boolean }>;
		/** The home the kids are standing at, or -1. Glows while in range. */
		activeK?: number;
		/** The active home whose door is swinging open, or -1. */
		openK?: number;
		/** Cue hook (the passer's engine note) — a no-op by default. */
		sound?: (cue: string) => void;
	}

	let { worldX, homes = {}, activeK = -1, openK = -1, sound = () => {} }: Props = $props();

	/** The live theme (the store's progression seam, as `ThemeLayer` read it). */
	const theme = $derived(themeAt(furthest()));

	/** The canvas element — the stage's only scrolling-world surface. */
	let canvasEl: HTMLCanvasElement | undefined = $state();

	/** Frames drawn — mirrored onto `data-frames` for the e2e smoke. */
	let frames = 0;

	/** `prefers-reduced-motion`, read once on mount (ThemeLayer's posture). */
	let reducedMotion = false;
	/** The cars layer (parked cars + the passer); created once, client-side. */
	let cars: CarsLayer | undefined;
	/** The shooting star's scheduler state (starry theme only). */
	let nextShootAt = 0;
	let shooting = false;
	let shootStartedAt = 0;
	let pal: Palette | undefined;

	/** Resize the backing store to the live stage scale × DPR (1 drawing unit = 1 stage px).
	 *  Reads the stage's `--stage-scale` (the CSS value the transform applies)
	 *  rather than a bounding rect: under the T4b flip a rect reports the
	 *  rotated AABB, whose width is the stage's HEIGHT. */
	function measure(): void {
		const el = canvasEl;
		if (!el) return;
		let stage: number;
		try {
			stage = parseFloat(getComputedStyle(el).getPropertyValue('--stage-scale')) || 1;
		} catch {
			stage = 1;
		}
		const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
		const bw = Math.max(1, Math.ceil(852 * stage * dpr));
		const bh = Math.max(1, Math.ceil(393 * stage * dpr));
		if (el.width !== bw) el.width = bw;
		if (el.height !== bh) el.height = bh;
	}

	onMount(() => {
		const el = canvasEl;
		if (!el) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;
		try {
			reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		} catch {
			reducedMotion = false;
		}
		pal = palette();
		cars = createCarsLayer(() => sound('passer'));
		nextShootAt = performance.now() + SHOOT_FIRST_MS;

		measure();
		let ro: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(measure);
			ro.observe(el);
		}
		window.addEventListener('resize', measure);
		window.addEventListener('orientationchange', measure);

		let raf = 0;
		const loop = (): void => {
			raf = requestAnimationFrame(loop);
			const p = pal;
			if (!p || !cars) return;
			measure();
			const now = performance.now();
			const env: LayerEnv = { worldX, tMs: now, reducedMotion };

			// One stage-space drawing system for the whole frame.
			ctx.setTransform(el.width / 852, 0, 0, el.height / 393, 0, 0);
			ctx.clearRect(0, 0, 852, 393);

			drawParallaxLayer(ctx, p, env);
			drawDecorSky(ctx, p, env, theme);

			// The shooting star: starry theme, reduced motion opts out entirely
			// (ThemeLayer's posture), one crossing at a time, ≥ 40 s apart.
			if (shooting) {
				const t = shootProgress(now - shootStartedAt);
				drawShootingStar(ctx, p, shootX(t), shootY(t), t);
				if (t >= 1) {
					shooting = false;
					nextShootAt = now + shootGap(Math.random);
				}
			} else if (theme === 'starry' && !reducedMotion && now >= nextShootAt) {
				shooting = true;
				shootStartedAt = now;
			}

			const input: HousesInput = { homes, activeK, openK };
			drawHousesLayer(ctx, p, env, input);
			cars.draw(ctx, p, env);
			drawDecorGround(ctx, p, env, theme);

			frames += 1;
			if (frames % 30 === 0) el.dataset.frames = String(frames);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			ro?.disconnect();
			window.removeEventListener('resize', measure);
			window.removeEventListener('orientationchange', measure);
		};
	});
</script>

<!-- The bands and sky paint beneath; the kids and every overlay paint above. -->
<canvas
	bind:this={canvasEl}
	class="world"
	aria-hidden="true"
	data-world
	data-frames="0"
	style="width: 852px; height: 393px"
></canvas>

<style>
	.world {
		position: absolute;
		top: 0;
		left: 0;
		/* The stage's own halves input owns taps (WalkControls) — never swallow one. */
		pointer-events: none;
	}
</style>
