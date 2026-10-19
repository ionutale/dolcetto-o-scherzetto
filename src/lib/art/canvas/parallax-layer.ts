/**
 * Parallax layer: far rooftops (0.45) + mid trees/hedges/fog (0.7).
 *
 * Port of `src/lib/art/scene/ParallaxLayers.svelte` 1:1 — every coordinate,
 * colour and animation parameter comes from that component. The two bands are
 * 2400 px wide; C1 bounded paints skip a band entirely when its raw offset is
 * beyond the 300 px apron, otherwise the painted shift is clamped to
 * `[-BAND_W, STAGE_W]`. See docs/T4-CANVAS-PLAN.md §C1.
 */
import { STAGE_W } from '$lib/art/scene/theme-model';
import type { LayerEnv } from '$lib/art/canvas/env';
import type { Palette } from '$lib/art/canvas/palette';
import { shapeRaster } from '$lib/art/canvas/raster';
import { mix } from '$lib/art/canvas/palette';

const BAND_W = 2400;
const APRON = 300;
const FAR_FACTOR = 0.45;
const MID_FACTOR = 0.7;

/** 8 far-roof blocks at x = i * 300 - 40 (prototype `ROOF_BLOCKS`). */
const ROOF_BLOCKS = Array.from({ length: 8 }, (_, i) => i * 300 - 40);
/** 7 mid trees at x = i * 340 + 40 (prototype `TREES`). */
const TREES = Array.from({ length: 7 }, (_, i) => i * 340 + 40);
/** Three drifting fog wisps, staggered -8 s apart (prototype `FOG`). */
const FOG = [
	{ left: 120, top: 150, delay: 0 },
	{ left: 820, top: 120, delay: -8 },
	{ left: 1500, top: 160, delay: -16 }
] as const;

/** Drift animation period (seconds) — matches the CSS `@keyframes drift`. */
const DRIFT_PERIOD_S = 26;
/** Drift amplitude (px) — from `translateX(-40px)` to `translateX(40px)`. */
const DRIFT_AMP_PX = 40;
/** Fog wisp logical size (px). */
const FOG_W = 340;
const FOG_H = 70;
/** Fog blur radius (px) — matches `filter: blur(28px)`. */
const FOG_BLUR_PX = 28;

/**
 * Draw one far-roof block at band-local `x`.
 * Port of the SVG in ParallaxLayers.svelte lines 86-91.
 */
function drawFarBlock(ctx: CanvasRenderingContext2D, pal: Palette, x: number): void {
	// Gabled roof — fill night2
	ctx.fillStyle = pal.night2;
	ctx.beginPath();
	ctx.moveTo(x + 20, 250);
	ctx.lineTo(x + 70, 190);
	ctx.lineTo(x + 120, 250);
	ctx.closePath();
	ctx.fill();

	// Lit house wall — fill night2
	ctx.fillStyle = pal.night2;
	ctx.fillRect(x + 52, 250, 36, 60);

	// Lit window — fill lamp at 0.5 alpha
	ctx.fillStyle = pal.lamp;
	ctx.globalAlpha = 0.5;
	ctx.beginPath();
	ctx.roundRect(x + 62, 262, 14, 16, 4);
	ctx.fill();
	ctx.globalAlpha = 1;

	// Arched roof (dark house) — fill night1
	ctx.fillStyle = pal.night1;
	ctx.beginPath();
	ctx.moveTo(x + 150, 250);
	ctx.quadraticCurveTo(x + 180, 196, x + 212, 250);
	ctx.closePath();
	ctx.fill();

	// Dark house wall — fill night1
	ctx.fillStyle = pal.night1;
	ctx.fillRect(x + 168, 246, 26, 64);
}

/**
 * Draw the ground band that runs the full width of the far layer.
 * Port of the SVG rect at line 93.
 */
function drawFarGround(ctx: CanvasRenderingContext2D, pal: Palette): void {
	ctx.fillStyle = pal.night1;
	ctx.fillRect(0, 310, BAND_W, 83);
}

/**
 * Draw one mid tree at band-local `x` (tree box is 120×140, top at 160).
 * Port of the SVG in ParallaxLines.svelte lines 114-126.
 */
function drawTree(ctx: CanvasRenderingContext2D, pal: Palette, x: number): void {
	const tx = x; // band-local x (the tree SVG is positioned at left: x px)

	// Canopy — fill night2
	ctx.fillStyle = pal.night2;
	ctx.beginPath();
	ctx.moveTo(tx + 60, 8);
	ctx.bezierCurveTo(tx + 52, 30, tx + 40, 44, tx + 36, 66);
	ctx.bezierCurveTo(tx + 30, 92, tx + 44, 112, tx + 60, 112);
	ctx.bezierCurveTo(tx + 76, 112, tx + 90, 92, tx + 84, 66);
	ctx.bezierCurveTo(tx + 80, 44, tx + 68, 30, tx + 60, 8);
	ctx.closePath();
	ctx.fill();

	// Stem — stroke night1, width 5
	ctx.strokeStyle = pal.night1;
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.moveTo(tx + 60, 22);
	ctx.lineTo(tx + 60, 108);
	ctx.stroke();

	// Branches — stroke night2, width 7, round caps
	ctx.strokeStyle = pal.night2;
	ctx.lineWidth = 7;
	ctx.lineCap = 'round';
	ctx.beginPath();
	// Left branch
	ctx.moveTo(tx + 58, 52);
	ctx.bezierCurveTo(tx + 46, 42, tx + 38, 40, tx + 28, 42);
	// Right branch
	ctx.moveTo(tx + 62, 52);
	ctx.bezierCurveTo(tx + 74, 42, tx + 82, 40, tx + 92, 42);
	ctx.stroke();
	ctx.lineCap = 'butt'; // reset

	// Pot — fill night1, rounded rect
	ctx.fillStyle = pal.night1;
	ctx.beginPath();
	ctx.roundRect(tx + 52, 112, 16, 26, 6);
	ctx.fill();
}

/**
 * Draw one hedge at band-local `x` (hedge box is 120×60, top at 270).
 * Port of the SVG in ParallaxLayers.svelte lines 129-133.
 * Hedge fill: color-mix(in srgb, night-2 65%, night-3) → mix(pal.night2, pal.night3, 0.35).
 */
function drawHedge(ctx: CanvasRenderingContext2D, pal: Palette, x: number): void {
	const hx = x; // band-local x (hedge SVG at left: x+170 px)
	const hedgeFill = mix(pal.night2, pal.night3, 0.35);
	ctx.fillStyle = hedgeFill;

	// Three ellipses
	ctx.beginPath();
	ctx.ellipse(hx + 34, 46, 30, 16, 0, 0, Math.PI * 2);
	ctx.fill();

	ctx.beginPath();
	ctx.ellipse(hx + 72, 50, 26, 13, 0, 0, Math.PI * 2);
	ctx.fill();

	ctx.beginPath();
	ctx.ellipse(hx + 100, 46, 18, 11, 0, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * Get or create the fog wisp raster (340×70 ellipse, pure white — serves as alpha mask).
 * The colour (ghostShade at 16% alpha) is applied at draw time via compositing.
 * Blur 28px matches `filter: blur(28px)`.
 */
function getFogRaster(): ReturnType<typeof shapeRaster> {
	return shapeRaster(
		'parallax:fog-wisp',
		FOG_W,
		FOG_H,
		(ctx) => {
			ctx.fillStyle = '#fff';
			ctx.beginPath();
			ctx.ellipse(FOG_W / 2, FOG_H / 2, FOG_W / 2, FOG_H / 2, 0, 0, Math.PI * 2);
			ctx.fill();
		},
		{ blurPx: FOG_BLUR_PX }
	);
}

/**
 * Compute the drift X offset for a fog wisp at time `tMs` with `delay` seconds.
 * Port of the CSS `drift` animation: 26s ease-in-out infinite alternate,
 * from translateX(-40px) to translateX(40px).
 * Phase = ((tMs / 1000 + delay) % 26) / 26, then ease-in-out, then map 0→1 to -40→40.
 * Under reducedMotion: no drift → offset = 0 (CSS pause utility freezes at BASE transform).
 */
function fogDriftOffset(tMs: number, delay: number, reducedMotion: boolean): number {
	if (reducedMotion) return 0;
	const periodMs = DRIFT_PERIOD_S * 1000;
	// JavaScript % on negative numbers yields negative remainder; normalize to [0, periodMs)
	const phaseMs = (((tMs + delay * 1000) % periodMs) + periodMs) % periodMs;
	const phase01 = phaseMs / periodMs; // 0..1 over one period
	// ease-in-out: 0.5 * (1 - cos(pi * t)) for first half, symmetric for second
	// Since animation is `alternate`, the keyframes go 0→1→0→1... over each period.
	// Actually `alternate` means: 0% to 100% (first iteration), then 100% to 0% (second), etc.
	// So over one full period (26s), it goes -40 → 40 → -40.
	// We can model this as a triangle wave: 0→1→0 over the period.
	const triangle = phase01 <= 0.5 ? phase01 * 2 : (1 - phase01) * 2; // 0→1→0
	// ease-in-out on the triangle
	const eased = 0.5 * (1 - Math.cos(Math.PI * triangle));
	return -DRIFT_AMP_PX + eased * (2 * DRIFT_AMP_PX); // -40 → 40
}

/**
 * C1 bounded paint: raw = -worldX * factor; skip when raw <= -BAND_W - APRON
 * or raw >= STAGE_W + APRON; otherwise paint at shift = clamp(raw, -BAND_W, STAGE_W).
 */
function computeShift(worldX: number, factor: number): { shift: number; away: boolean } {
	const raw = -worldX * factor;
	const away = raw <= -BAND_W - APRON || raw >= STAGE_W + APRON;
	const shift = Math.min(Math.max(raw, -BAND_W), STAGE_W);
	return { shift, away };
}

/**
 * Draw the parallax layer (far + mid bands).
 *
 * @param ctx — Canvas 2D context (already scaled to device pixels by the caller).
 * @param pal — Resolved palette from `palette()`.
 * @param env — Per-frame environment: worldX, tMs, reducedMotion.
 */
export function drawParallaxLayer(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv
): void {
	// ---------- FAR BAND (rooftops) ----------
	const far = computeShift(env.worldX, FAR_FACTOR);
	if (!far.away) {
		ctx.save();
		ctx.translate(far.shift, 0);

		// 8 roof blocks
		for (const x of ROOF_BLOCKS) {
			drawFarBlock(ctx, pal, x);
		}
		// Ground band
		drawFarGround(ctx, pal);

		ctx.restore();
	}

	// ---------- MID BAND (trees, hedges, fog) ----------
	const mid = computeShift(env.worldX, MID_FACTOR);
	if (!mid.away) {
		ctx.save();
		ctx.translate(mid.shift, 0);

		// 7 trees + hedges
		for (const x of TREES) {
			// Tree at top 160 (band-local). The tree drawing uses y coords
			// relative to its own 140px box, so we translate to y=160.
			ctx.save();
			ctx.translate(x, 160);
			drawTree(ctx, pal, 0);
			ctx.restore();

			// Hedge at x + 170, top 270
			ctx.save();
			ctx.translate(x + 170, 270);
			drawHedge(ctx, pal, 0);
			ctx.restore();
		}

		// Fog wisps — each is a blurred raster blitted at (left + drift, top)
		const fogRaster = getFogRaster();
		if (fogRaster) {
			for (const wisp of FOG) {
				const driftX = fogDriftOffset(env.tMs, wisp.delay, env.reducedMotion);
				const drawX = wisp.left + driftX;
				const drawY = wisp.top;
				ctx.save();
				ctx.translate(drawX, drawY);
				// Use the raster as an alpha mask for ghostShade at 16% alpha:
				// 1. Fill with ghostShade (solid)
				ctx.fillStyle = pal.ghostShade;
				ctx.fillRect(-fogRaster.pad, -fogRaster.pad, fogRaster.w, fogRaster.h);
				// 2. Mask with the raster's alpha (which includes the blur), at 16% opacity
				ctx.globalCompositeOperation = 'destination-in';
				ctx.globalAlpha = 0.16;
				ctx.drawImage(fogRaster.canvas, -fogRaster.pad, -fogRaster.pad);
				ctx.restore();
			}
		}

		ctx.restore();
	}
}
