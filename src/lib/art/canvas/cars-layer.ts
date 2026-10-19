/**
 * T4 — the cars layer: the parked cars and the rare passer, 1:1 from the DOM.
 *
 * A canvas port of `src/lib/play/Cars.svelte` and its pure model
 * `src/lib/play/car-model.ts` — themselves the T20 port of the prototype's
 * `#lCars` CSS (~140-144), markup (~394), `renderCars()` (~1218-1239) and
 * `passerTick()` (~1530-1546).
 *
 * **Parked cars.** `carSlots(worldX)` is the live window; each slot blits at
 * `k*SPACING + off - worldX` (`carScreenX`), bottom-anchored 6 px above the
 * stage floor, with the pack's `car(color)` sprite. The `.car` rule's
 * `filter: drop-shadow(0 6px 10px var(--shadow-night))` is carried by canvas
 * shadow properties while blitting. The raster's logical size is
 * authoritative; a still-decoding raster is `null` and that slot is skipped
 * for the frame (the shell redraws every frame, so it appears a frame later).
 *
 * **The passer.** Screen space, never world-scrolled, and time-only: the layer
 * keeps the schedule in its closure and advances it from `env.tMs` on every
 * draw — no timers and no `Date.now`/`performance.now`, so a paused shell
 * freezes the drive and a late draw catches up. The first crossing is
 * `firstDelayMs` (default `PASSER_FIRST_MS`) after the first draw (the DOM
 * `onMount`), then each crossing is one `passerX` sweep over `PASSER_DUR_MS`,
 * followed by `passerGap(rng)` measured from the crossing's end — exactly
 * `passerTick`'s `scheduleNext`. `onCue('passer')` fires when one starts.
 *
 * **Head cone.** Drawn only while a crossing is live: 190×44 at
 * `passX + carW - 82 - 190` / `393 - 8 - 10 - 44`, with the CSS
 * `border-radius: 50%` (an ellipse) and the 90° gradient
 * `transparent → color-mix(var(--moon) 35%, transparent)` at opacity 0.9.
 * `palette.mix` blends RGB only and drops alpha, so it cannot express a mix
 * with `transparent`; the warm stop is instead the resolved moon token at
 * alpha 0.35 (`withAlpha`), which *is* the `color-mix` result.
 *
 * **Reduced motion.** The crossing is a translation, which the spec keeps, so
 * `env.reducedMotion` changes nothing here; the cone is already a plain
 * opacity switch (`.passer.passing .headcone`), not an animation.
 *
 * Approximations: CSS `drop-shadow` → canvas shadow (same colour, blur and
 * offset; the blur radius is not byte-identical); `border-radius: 50%` →
 * `ctx.ellipse`. The cone shares the shadow scope because in the DOM the
 * filter sits on `.passer`, the cone's parent, so it shades the cone too.
 * The pack's own `.wheel` / `.beam` / `.lens` CSS pulses render at their SVG
 * rest state, the plan's known v1 sprite-animation approximation.
 */
import { car, passerCar } from '$lib/art/sprites';
import {
	PASSER_DUR_MS,
	PASSER_FIRST_MS,
	PASSER_GAP_MIN_MS,
	carScreenX,
	carSlots,
	passerGap,
	passerProgress,
	passerX
} from '$lib/play/car-model';
import type { LayerEnv } from './env';
import type { Palette } from './palette';
import { blit, rasterOf } from './raster';

/** The 852×393 design frame (Stage.svelte; `STAGE_H` in `scene/theme-model`). */
const STAGE_H = 393;

/** `.car { bottom: 6px }`. */
const CAR_BOTTOM = 6;

/** `#passer { bottom: 8px }`. */
const PASSER_BOTTOM = 8;

/** The passer sprite's pack width — the cone anchor before its raster decodes. */
const PASSER_W = 104;

/** `.headcone { width: 190px; height: 44px; right: 82px; bottom: 10px }`. */
const CONE_W = 190;
const CONE_H = 44;
const CONE_RIGHT_INSET = 82;
const CONE_BOTTOM = 10;

/** `.passer.passing .headcone { opacity: 0.9 }`. */
const CONE_OPACITY = 0.9;

/** `color-mix(in srgb, var(--moon) 35%, transparent)`. */
const CONE_MOON_ALPHA = 0.35;

/** `.car` / `.passer`: `drop-shadow(0 6px 10px var(--shadow-night))`. */
const SHADOW_BLUR = 10;
const SHADOW_OFFSET_Y = 6;

const PASSER_KEY = 'car:passer';
const PASSER_SVG = passerCar();

/** The sprite pack's car SVGs, generated once per tone rather than per frame. */
const carSvgs = new Map<number, string>();

function carSvg(color: number): string {
	let svg = carSvgs.get(color);
	if (svg === undefined) {
		svg = car(color);
		carSvgs.set(color, svg);
	}
	return svg;
}

/**
 * The same colour at an explicit alpha, for the cone's gradient stops.
 *
 * `palette.mix` blends and returns RGB only, so mixing the moon with a
 * transparent second colour would answer an *opaque* moon. The CSS mix with
 * `transparent` is an alpha scale instead — `rgba(moon, .35)` — so parse the
 * resolved token. An unknown colour syntax falls back to the colour as-is: the
 * cone loses its fade but never throws.
 */
function withAlpha(color: string, alpha: number): string {
	const s = color.trim();
	let m = /^#([0-9a-f]{6})$/i.exec(s);
	if (m) {
		const n = parseInt(m[1], 16);
		return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
	}
	m = /^#([0-9a-f]{3})$/i.exec(s);
	if (m) {
		const h = m[1];
		const r = parseInt(h[0] + h[0], 16);
		const g = parseInt(h[1] + h[1], 16);
		const b = parseInt(h[2] + h[2], 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	m = /^rgba?\(([^)]+)\)$/i.exec(s);
	if (m) {
		const p = m[1]
			.split(/[,\s/]+/)
			.filter(Boolean)
			.map(Number);
		if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) {
			return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
		}
	}
	return s;
}

/** The `.headcone` ellipse: transparent at its left end, moon-35% at the right. */
function drawCone(ctx: CanvasRenderingContext2D, pal: Palette, passX: number, carW: number): void {
	const x = passX + carW - CONE_RIGHT_INSET - CONE_W;
	const y = STAGE_H - PASSER_BOTTOM - CONE_BOTTOM - CONE_H;
	ctx.save();
	ctx.globalAlpha = CONE_OPACITY;
	const gradient = ctx.createLinearGradient(x, y, x + CONE_W, y);
	gradient.addColorStop(0, withAlpha(pal.moon, 0));
	gradient.addColorStop(1, withAlpha(pal.moon, CONE_MOON_ALPHA));
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.ellipse(x + CONE_W / 2, y + CONE_H / 2, CONE_W / 2, CONE_H / 2, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

export interface CarsLayer {
	draw(ctx: CanvasRenderingContext2D, pal: Palette, env: LayerEnv): void;
}

/**
 * Build the layer. The returned object owns the passer's schedule, so its
 * clock is only ever the `env.tMs` passed to `draw` (injectable in tests via a
 * fake environment).
 */
export function createCarsLayer(
	onCue: (cue: string) => void = () => {},
	opts: { firstDelayMs?: number; rng?: () => number } = {}
): CarsLayer {
	/** `setTimeout` clamps negatives to 0; a hostile NaN falls back to the default. */
	const requestedDelay = opts.firstDelayMs ?? PASSER_FIRST_MS;
	const firstDelay = Number.isFinite(requestedDelay)
		? Math.max(0, requestedDelay)
		: PASSER_FIRST_MS;
	const rng = opts.rng ?? Math.random;

	/**
	 * Absolute `env.tMs` of the next crossing, or `null` until the first draw
	 * arms it (the mount point; the layer has no clock of its own).
	 */
	let nextFireAt: number | null = null;
	/** `env.tMs` at which the live crossing was scheduled to begin. */
	let startedAt = 0;
	/** Is a crossing live right now? */
	let passing = false;

	/**
	 * Walk the time-only schedule forward to `now`.
	 *
	 * A crossing's start is its *scheduled* instant, so its sweep is exact under
	 * jittery frames; the next gap is measured from its end, like `passerTick`.
	 * The loop replays whole missed cycles when a draw arrives late (a suspended
	 * tab); each iteration schedules at least `PASSER_GAP_MIN_MS` ahead, so it
	 * always terminates.
	 */
	function advance(now: number): void {
		if (nextFireAt === null) nextFireAt = now + firstDelay;
		for (;;) {
			if (passing) {
				const endAt = startedAt + PASSER_DUR_MS;
				if (now < endAt) return;
				passing = false;
				const gap = passerGap(rng);
				// A NaN rng would make every comparison false; use the model's floor.
				nextFireAt = endAt + (Number.isFinite(gap) ? gap : PASSER_GAP_MIN_MS);
				continue;
			}
			if (now < nextFireAt) return;
			passing = true;
			startedAt = nextFireAt;
			onCue('passer');
		}
	}

	function draw(ctx: CanvasRenderingContext2D, pal: Palette, env: LayerEnv): void {
		advance(env.tMs);

		ctx.save();
		ctx.shadowColor = pal.shadowNight;
		ctx.shadowBlur = SHADOW_BLUR;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = SHADOW_OFFSET_Y;

		// The passer first: in `.cars` it precedes the track, so parked cars paint
		// over it. It is screen-space and only drawn while a crossing is live (at
		// rest it sits at x = -170, entirely off-stage).
		if (passing) {
			const px = passerX(passerProgress(env.tMs - startedAt));
			const raster = rasterOf(PASSER_KEY, PASSER_SVG);
			const carW = raster ? raster.w : PASSER_W;
			if (raster) blit(ctx, raster, px, STAGE_H - PASSER_BOTTOM - raster.h);
			drawCone(ctx, pal, px, carW);
		}

		for (const slot of carSlots(env.worldX)) {
			const raster = rasterOf(`car:${slot.color}`, carSvg(slot.color));
			if (!raster) continue;
			blit(ctx, raster, carScreenX(slot, env.worldX), STAGE_H - CAR_BOTTOM - raster.h);
		}

		ctx.restore();
	}

	return { draw };
}
