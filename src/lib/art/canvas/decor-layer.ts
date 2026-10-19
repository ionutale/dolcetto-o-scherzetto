/**
 * 1:1 port of the theme decor layer (T4, 2026-10-19): the six per-kind ornament
 * styles, every keyframe, the sky/ground split and the rare shooting star of
 * `src/lib/art/scene/ThemeLayer.svelte`, parked on the windowing/pick contract
 * of `src/lib/art/scene/theme-model.ts` (`decorSlots`, `decorTone`, `isSkyKind`).
 *
 * Why this lives on canvas at all — docs/T4-CANVAS-PLAN.md: six device logs
 * proved every DOM layer that scrolls is killed by iOS after ~16–36 s of
 * continuous walking, while everything drawn into one in-place backing store
 * survives. The decor is pure scenery (spec §4.4), so it ports as pure draw
 * functions of `(ctx, pal, env, theme)` — no store, no timers, no DOM.
 *
 * The DOM's mechanics the port must not lose:
 *
 *   - **windowing** — `decorSlots(theme, worldX)` is the street's five-house
 *     window; a node parks at `k*SPACING + off - worldX`, `slot.y` (ThemeLayer's
 *     composed position — the C1 `baseX` offset cancels out, see its `styleOf`).
 *   - **the split** — sky kinds (`isSkyKind`: wisp/mist/shimmer) draw behind the
 *     street's rooflines, the rest (leaf/pumpkin/hay) lift onto its bands; the
 *     DOM did this with two tracks, the shell does it with draw order.
 *   - **reduced motion** (ART-STYLE §4 rule 4 · spec §13) — ThemeLayer's media
 *     query stops the loops; the decorations stay visible and parked and still
 *     ride the walk. Here `reducedMotion` drives every loop's interpolation
 *     parameter to **0**, which lands exactly on each kind's `0%`/`from`
 *     keyframe — the rest pose this port chose, per kind documented at its
 *     draw site. (Note the deviation: literal `animation: none` would fall back
 *     to each `::before`'s *declared* opacity — leaf .85, wisp .55, mist .3,
 *     shimmer unset (=1). Holding the `0%` pose instead keeps the shimmer from
 *     popping to full-bright and matches the pinned canvas contract "opacity at
 *     the from/0% value".)
 *
 * No Svelte imports; shape blurs reuse the foundation's `shapeRaster` cache.
 */
import type { LayerEnv } from './env';
import { blit, shapeRaster } from './raster';
import { mix, varColor, type Palette } from './palette';
import { SPACING } from '$lib/sim/loop';
import type { Theme } from '$lib/sim/progression';
import { decorSlots, decorTone, isSkyKind, type DecorSlot } from '../scene/theme-model';

/* ------------------------------------------------------------------ */
/* numerics                                                            */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
/** Degrees → radians. */
const DEG = Math.PI / 180;
/**
 * The circular-arc cubic-bezier constant, κ = 4/3·(√2−1): the per-corner
 * construction in `radiiRect` approximates each elliptical quadrant with it
 * (Lipschutz/NURBS standard; same κ WebKit's border path uses).
 */
const KAPPA = (4 / 3) * (Math.sqrt(2) - 1);

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * The CSS `ease-in-out` keyword — cubic-bezier(0.42, 0, 0.58, 1) (CSS Easing
 * Functions Level 1), solved for y at the given x. Newton on the x polynomial,
 * 10 iterations — the curve's slope never comes near 0 inside (0, 1), so it
 * converges every frame.
 */
export function easeInOut(t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const x1 = 0.42;
	const y1 = 0;
	const x2 = 0.58;
	const y2 = 1;
	// x(s) and y(s) as Horner cubic in the curve parameter s:
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	let s = t;
	for (let i = 0; i < 10; i++) {
		const d = ((ax * s + bx) * s + cx) * s - t;
		if (Math.abs(d) < 1e-6) break;
		const dd = (3 * ax * s + 2 * bx) * s + cx;
		if (Math.abs(dd) < 1e-6) break;
		s = Math.min(1, Math.max(0, s - d / dd));
	}
	return ((ay * s + by) * s + cy) * s;
}

/**
 * A looping keyframe's phase in `[0, 1)` — `((t/1000 + delay) % dur) / dur`
 * computed as a positive modulo, so a **negative delay** (ThemeLayer's
 * `--delay` values are non-negative in the model, but a harness may not be)
 * wraps into the cycle instead of going negative.
 */
export function phaseOf(tMs: number, delaySec: number, durSec: number): number {
	const elapsed = tMs / 1000 + delaySec;
	return (((elapsed % durSec) + durSec) % durSec) / durSec;
}

/**
 * The same clock with CSS `alternate` folded in: even cycles run forward,
 * odd cycles are directed progress `1 − p` (Web Animations' directed
 * progress; the fold is applied before easing — approximation, see the
 * module header's keyframe notes). Organic slow loops, so the mid-curve
 * difference between the two possible folds is imperceptible.
 */
export function alternateOf(tMs: number, delaySec: number, durSec: number): number {
	const elapsed = tMs / 1000 + delaySec;
	const cycle = Math.floor(elapsed / durSec);
	const p = (elapsed - cycle * durSec) / durSec;
	return ((cycle % 2) + 2) % 2 === 1 ? 1 - p : p;
}

/** A slot's world-space top-left x — ThemeLayer's composed node x. */
export function decorX(slot: DecorSlot, worldX: number): number {
	return slot.k * SPACING + slot.off - worldX;
}

/** A slot's node box in world space, with its §3 tone resolved to a colour. */
function nodeOf(
	slot: DecorSlot,
	env: LayerEnv
): {
	x: number;
	y: number;
	w: number;
	h: number;
	tone: string;
} {
	return {
		x: decorX(slot, env.worldX),
		y: slot.y,
		w: slot.w,
		h: slot.h,
		tone: varColor(decorTone(slot))
	};
}

/**
 * The `.decor` split — ThemeLayer's `slots.filter(isSkyKind)` and its negation:
 * wisp/mist/shimmer are the sky (weather in front of the parallax, behind the
 * rooflines), leaf/pumpkin/hay ride onto the street's bands.
 */
export function splitSlots(slots: DecorSlot[]): { sky: DecorSlot[]; ground: DecorSlot[] } {
	return {
		sky: slots.filter((s) => isSkyKind(s.kind)),
		ground: slots.filter((s) => !isSkyKind(s.kind))
	};
}

/** Add one alpha-worn colour: canvas's side of `color-mix(A n%, transparent)`. */
function withAlpha(color: string, a: number): string {
	const rgb = /^rgba?\(\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/.exec(color.trim());
	if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
	return color;
}

/**
 * Append one box with per-corner **elliptical** radii — the general
 * `border-radius: h1 h2 h3 h4 / v1 v2 v3 v4` geometry (one-value forms resolve
 * per axis: horizontal percentages of `w`, vertical of `h`). Corners TL, TR,
 * BR, BL in that order; each corner is the κ cubic approximation of its ellipse
 * quadrant. CSS clamps radii pairs above 100% of the edge — the radii used
 * here never exceed it (leaf and pumpkin hit the bound exactly, see callers),
 * so the clamping's f factor needs no port.
 */
function radiiRect(
	c: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	tl: { h: number; v: number },
	tr: { h: number; v: number },
	br: { h: number; v: number },
	bl: { h: number; v: number }
): void {
	c.moveTo(x, y + tl.v);
	c.bezierCurveTo(x, y + tl.v - KAPPA * tl.v, x + tl.h - KAPPA * tl.h, y, x + tl.h, y);
	c.lineTo(x + w - tr.h, y);
	c.bezierCurveTo(x + w - tr.h + KAPPA * tr.h, y, x + w, y + tr.v - KAPPA * tr.v, x + w, y + tr.v);
	c.lineTo(x + w, y + h - br.v);
	c.bezierCurveTo(
		x + w,
		y + h - br.v + KAPPA * br.v,
		x + w - br.h + KAPPA * br.h,
		y + h,
		x + w - br.h,
		y + h
	);
	c.lineTo(x + bl.h, y + h);
	c.bezierCurveTo(x + bl.h - KAPPA * bl.h, y + h, x, y + h - bl.v + KAPPA * bl.v, x, y + h - bl.v);
	c.closePath();
}

/* ------------------------------------------------------------------ */
/* leaf — `.d-leaf::before` + `leafDrift`                              */
/* ------------------------------------------------------------------ */

const LEAF_DUR_S = 9; // leafDrift 9s

function drawLeaf(ctx: CanvasRenderingContext2D, env: LayerEnv, slot: DecorSlot): void {
	const n = nodeOf(slot, env);
	/**
	 * leafDrift 9s ease-in-out infinite (ported verbatim):
	 *
	 *   0%   { transform: translate3d(5px, -12px, 0) rotate(-24deg); opacity: 0.35; }
	 *   45%  { opacity: 0.9; }
	 *   100% { transform: translate3d(-7px, 26px, 0) rotate(150deg); opacity: 0.25; }
	 *
	 * 45% carries opacity only, so the transform interpolates across the whole
	 * span (0% → 100%) with the segment's ease-in-out; opacity has two
	 * segments, each eased. Reduced motion: drive p → 0 and every value lands
	 * on the 0% keyframe — the rest pose (translate(5px, -12px) rotate(-24deg),
	 * opacity .35).
	 */
	const p = env.reducedMotion ? 0 : phaseOf(env.tMs, slot.delay, LEAF_DUR_S);
	const e = easeInOut(p);
	const dx = lerp(5, -7, e);
	const dy = lerp(-12, 26, e);
	const rot = lerp(-24, 150, e) * DEG;
	const op =
		p < 0.45 ? lerp(0.35, 0.9, easeInOut(p / 0.45)) : lerp(0.9, 0.25, easeInOut((p - 0.45) / 0.55));

	ctx.save();
	ctx.globalAlpha = op;
	// translate-then-rotate about the ::before's own box centre (CSS's default
	// transform-origin applied to the animated box; keyframes replace the
	// declared opacity .85 while running — CSS keyframe property override).
	ctx.translate(n.x + dx + n.w / 2, n.y + dy + n.h / 2);
	ctx.rotate(rot);
	ctx.beginPath();
	// The blur-none leaf blob: border-radius: 70% 30% 65% 35% / 60% 40% 60% 40%
	// (horizontal / vertical percentages of w / h). Every edge's radius pair
	// sums to exactly 100%, so the four elliptical arcs meet tangentially and
	// the blob needs no straight segments — the κ construction renders it
	// directly (documented approximation: each quadrant is the standard κ cube,
	// not the browser's exact border path).
	radiiRect(
		ctx,
		-n.w / 2,
		-n.h / 2,
		n.w,
		n.h,
		{ h: 0.7 * n.w, v: 0.6 * n.h },
		{ h: 0.3 * n.w, v: 0.4 * n.h },
		{ h: 0.65 * n.w, v: 0.6 * n.h },
		{ h: 0.35 * n.w, v: 0.4 * n.h }
	);
	ctx.fillStyle = n.tone;
	ctx.fill();
	ctx.restore();
}

/* ------------------------------------------------------------------ */
/* wisp + mist — blurred ellipses, pre-rasterized                      */
/* ------------------------------------------------------------------ */

const WISP_DUR_S = 22; // wispDrift 22s alternate
const WISP_BLUR_PX = 22; // filter: blur(22px)
const MIST_DUR_S = 34; // mistDrift 34s alternate
const MIST_BLUR_PX = 26; // filter: blur(26px)

/**
 * The wisp's pre-blurred ellipse raster — the DOM drew it with
 * `filter: blur(22px)`; here the blur bakes into a cached shape raster so the
 * per-frame cost is one `drawImage`. Key folds in tone + size, so the cache
 * stays bounded (ThemeLayer recycles nodes per window the same way).
 */
function blurRaster(
	kind: 'wisp' | 'mist',
	tone: string,
	w: number,
	h: number,
	blurPx: number,
	pill: boolean
): ReturnType<typeof shapeRaster> {
	// Approximation: the raster's logical size is rounded to whole px — the
	// model's dims carry one decimal (`round1`), and half a px on a 150–520px
	// blur cloud is invisible while keeping the cache's keys finite.
	const rw = Math.max(1, Math.round(w));
	const rh = Math.max(1, Math.round(h));
	return shapeRaster(
		`decor:${kind}:${tone}:${rw}x${rh}`,
		rw,
		rh,
		(c) => {
			c.fillStyle = tone;
			c.beginPath();
			if (pill) {
				// .d-mist: border-radius: var(--r-pill) — the token is 999px, which
				// CSS clamps to h/2: a capsule. (`--r-pill` is app.css line 139.)
				radiiRect(
					c,
					0,
					0,
					rw,
					rh,
					{ h: rh / 2, v: rh / 2 },
					{ h: rh / 2, v: rh / 2 },
					{ h: rh / 2, v: rh / 2 },
					{ h: rh / 2, v: rh / 2 }
				);
			} else {
				// .d-wisp: border-radius: 50% — a full ellipse.
				c.ellipse(rw / 2, rh / 2, rw / 2, rh / 2, 0, 0, TAU);
			}
			c.fill();
		},
		{ blurPx }
	);
}

/**
 * `.d-wisp::before` — a full ellipse, tone fill, `filter: blur(22px)`, and
 * wispDrift 22s ease-in-out infinite alternate (verbatim):
 *
 *   from { transform: translate3d(-40px, 0, 0); opacity: 0.4; }
 *   to   { transform: translate3d(40px, 0, 0);   opacity: 0.6; }
 *
 * The drift blits the raster at an x offset and the opacity blends at draw
 * time; reduced motion drives e → 0 = the `from` pose (offset −40px, opacity
 * .4). The declared base opacity .55 only rules while the DOM animation is
 * idle (i.e. reduced motion); the animated pair replaces it — same override
 * rule as the leaf.
 */
function drawWisp(ctx: CanvasRenderingContext2D, env: LayerEnv, slot: DecorSlot): void {
	const n = nodeOf(slot, env);
	const raster = blurRaster('wisp', n.tone, n.w, n.h, WISP_BLUR_PX, false);
	if (!raster) return;
	const e = env.reducedMotion ? 0 : easeInOut(alternateOf(env.tMs, slot.delay, WISP_DUR_S));
	ctx.save();
	ctx.globalAlpha = lerp(0.4, 0.6, e);
	blit(ctx, raster, n.x + lerp(-40, 40, e), n.y);
	ctx.restore();
}

/**
 * `.d-mist::before` — a `--r-pill` band (h/2 capsule), `filter: blur(26px)`,
 * mistDrift 34s ease-in-out infinite alternate (verbatim):
 *
 *   from { transform: translate3d(-60px, 0, 0); opacity: 0.22; }
 *   to   { transform: translate3d(60px, 0, 0);  opacity: 0.4; }
 *
 * Same mechanics as the wisp; rest pose = `from` (−60px, opacity .22).
 */
function drawMist(ctx: CanvasRenderingContext2D, env: LayerEnv, slot: DecorSlot): void {
	const n = nodeOf(slot, env);
	const raster = blurRaster('mist', n.tone, n.w, n.h, MIST_BLUR_PX, true);
	if (!raster) return;
	const e = env.reducedMotion ? 0 : easeInOut(alternateOf(env.tMs, slot.delay, MIST_DUR_S));
	ctx.save();
	ctx.globalAlpha = lerp(0.22, 0.4, e);
	blit(ctx, raster, n.x + lerp(-60, 60, e), n.y);
	ctx.restore();
}

/* ------------------------------------------------------------------ */
/* pumpkin — `.d-pumpkin::before` body + `::after` stem + bob          */
/* ------------------------------------------------------------------ */

const PUMPKIN_DUR_S = 6; // pumpkinBob 6s alternate
/** `box-shadow: inset -3px -3px 0 …` — the -3px right/bottom inner band. */
const PUMPKIN_INSET = 3;

function drawPumpkin(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv,
	slot: DecorSlot
): void {
	const n = nodeOf(slot, env);
	// pumpkinBob 6s ease-in-out infinite alternate: from { translateY(0) } to
	// { translateY(-2px) }. Reduced motion: e = 0 = the `from` = the base pose.
	const e = env.reducedMotion ? 0 : easeInOut(alternateOf(env.tMs, slot.delay, PUMPKIN_DUR_S));
	const bob = lerp(0, -2, e);

	// Body geometry: border-radius: 46% 46% 40% 40% (TL TR BR BL; one value per
	// corner → horizontal radius = %·w, vertical = %·h). The pair sums (92%,
	// 80%) stay under the clamp, and the body slides with the bob — the whole
	// ::before carries the animation.
	const body = (c: CanvasRenderingContext2D, dx: number = 0, dy: number = 0): void => {
		radiiRect(
			c,
			n.x + dx,
			n.y + bob + dy,
			n.w,
			n.h,
			{ h: 0.46 * n.w, v: 0.46 * n.h },
			{ h: 0.46 * n.w, v: 0.46 * n.h },
			{ h: 0.4 * n.w, v: 0.4 * n.h },
			{ h: 0.4 * n.w, v: 0.4 * n.h }
		);
	};

	ctx.save();

	// The outer half of `box-shadow`, drawn while the body fills (it follows the
	// rounded corners in the DOM): 0 3px 5px var(--shadow-night).
	ctx.save();
	ctx.shadowColor = pal.shadowNight;
	ctx.shadowOffsetY = 3;
	ctx.shadowBlur = 5;
	ctx.beginPath();
	body(ctx);
	ctx.fillStyle = n.tone;
	ctx.fill();
	ctx.restore();

	// The inset half: inset -3px -3px 0 color-mix(in srgb, var(--ink-night)
	// 18%, transparent). A zero-blur inset offset (-3, -3) lays a 3px band along
	// the bottom and right inner edges, following the corner radii. Port
	// (approximation): clip to the body, then fill where the body and the same
	// body shifted up-left by 3px **differ** (an even-odd between the two
	// subpaths — exactly the band, matching the arcs). The CSS colour sits the
	// 18% ink over the body's tone; mix() is alpha-less, so the equivalent
	// opaque blend is mix(inkNight, tone, .82) (ink-weighted: .18 ink over
	// tone, the task-pinned formulation).
	ctx.save();
	ctx.beginPath();
	body(ctx);
	ctx.clip();
	ctx.beginPath();
	// full body — the "outer" subpath; the shifted one cuts the band out.
	body(ctx);
	body(ctx, -PUMPKIN_INSET, -PUMPKIN_INSET);
	ctx.fillStyle = mix(pal.inkNight, n.tone, 0.82);
	ctx.fill('evenodd');
	ctx.restore();

	// The stem: `.d-pumpkin::after` — 3×5, border-radius 2px (CSS clamps the
	// radius above half the 3px side into the capsule it renders), left 50%
	// top -3px, background var(--stem), transform translateX(-50%) rotate(8deg)
	// about its own centre. It hangs off `.decor`, **not** off the animated
	// ::before — so the stem stands still while the body bobs (folded here in
	// the draw order: body first, stem on top).
	ctx.save();
	ctx.translate(n.x + n.w / 2, n.y - 3 + 5 / 2);
	ctx.rotate(8 * DEG);
	ctx.beginPath();
	ctx.roundRect(-1.5, -2.5, 3, 5, 2);
	ctx.fillStyle = pal.stem;
	ctx.fill();
	ctx.restore();

	ctx.restore();
}

/* ------------------------------------------------------------------ */
/* hay — `.d-hay::before`: a clipped straw gradient + sway             */
/* ------------------------------------------------------------------ */

const HAY_DUR_S = 7; // haySway 7s alternate
/**
 * The gradient's tilt: `repeating-linear-gradient(84deg, …)` runs its colour
 * axis at CSS 84° (clockwise from north) = screen vector (sin84°, −cos84°);
 * the straw bands sit **perpendicular** to it, so they run near-vertical,
 * tilted 6°. The paint below rotates the local +x onto that axis (→ θ = 84°−90°).
 */
const HAY_AXIS_DEG = 84;
/** The repeating band period: tone 2px, gap 3, tone 1, gap 4 (verbatim). */
const HAY_PERIOD = 10;

function drawHay(
	ctx: CanvasRenderingContext2D,
	_pal: Palette,
	env: LayerEnv,
	slot: DecorSlot
): void {
	const n = nodeOf(slot, env);
	const cx = n.x + n.w / 2;
	const cy = n.y + n.h / 2;
	// haySway 7s ease-in-out infinite alternate: skewX(-6deg) → skewX(6deg),
	// transform-origin default = the ::before box's centre. Rest pose = `from`
	// (e → 0 ⇒ skewX(-6deg)).
	const e = env.reducedMotion ? 0 : easeInOut(alternateOf(env.tMs, slot.delay, HAY_DUR_S));
	const skew = lerp(-6, 6, e) * DEG;

	ctx.save();
	ctx.globalAlpha = 0.92;
	// The sway: translate to the centre, skewX, translate back — the CSS shape.
	ctx.translate(cx, cy);
	ctx.transform(1, 0, Math.tan(skew), 1, 0, 0);
	ctx.translate(-cx, -cy);

	// The clip is defined in the element frame and warped by the same skew —
	// inside it, the gradient's own rotation happens (clip survives transforms;
	// this mirrors DOM stack: clip-path first, gradient inside).
	ctx.save();
	ctx.beginPath();
	// clip-path polygon(0% 100%, 6% 34%, 18% 74%, 32% 10%, 46% 66%, 60% 2%,
	// 74% 58%, 88% 26%, 100% 100%) — the ragged top of loose straw.
	ctx.moveTo(n.x, n.y + n.h);
	ctx.lineTo(n.x + 0.06 * n.w, n.y + 0.34 * n.h);
	ctx.lineTo(n.x + 0.18 * n.w, n.y + 0.74 * n.h);
	ctx.lineTo(n.x + 0.32 * n.w, n.y + 0.1 * n.h);
	ctx.lineTo(n.x + 0.46 * n.w, n.y + 0.66 * n.h);
	ctx.lineTo(n.x + 0.6 * n.w, n.y + 0.02 * n.h);
	ctx.lineTo(n.x + 0.74 * n.w, n.y + 0.58 * n.h);
	ctx.lineTo(n.x + 0.88 * n.w, n.y + 0.26 * n.h);
	ctx.lineTo(n.x + n.w, n.y + n.h);
	ctx.closePath();
	ctx.clip();

	// The gradient: rotate the paint about the box centre so the local +x runs
	// along the 84° axis — bands then draw as axis-aligned rects in that frame
	// (approximation: paint-then-skew equals CSS's stripes-then-skew for these
	// degenerate thin bands).
	const tilt = (HAY_AXIS_DEG - 90) * DEG;
	ctx.translate(cx, cy);
	ctx.rotate(tilt);
	ctx.translate(-cx, -cy);

	/**
	 * Band phase. The CSS gradient line passes through the box centre (CSS
	 * Images spec), so a point's gradient distance is its projection along the
	 * 84° axis measured from the line's start: a tone band drawn as a rect from
	 * local x = b lands at `d(b) = (b − cx) + L/2`, with L = |w·sin84°| +
	 * |h·cos84°| the CSS gradient-line fit length. The pattern repeats every
	 * 10px, so the tone bands start at b = cx − L/2 + k·10. (Sanity: at 90° —
	 * C → 0, S → 1 — the first tone band starts exactly at the box's left
	 * edge, which is how CSS renders that degenerate case.)
	 */
	const s = Math.sin(HAY_AXIS_DEG * DEG);
	const c8 = Math.cos(HAY_AXIS_DEG * DEG);
	const b0 = cx - (s * n.w + c8 * n.h) / 2;
	const y0 = n.y - 10; // bands overdraw; the clip trims
	const y1 = n.y + n.h + 10;
	const startK = Math.ceil((n.x - 10 - b0) / HAY_PERIOD);
	ctx.beginPath();
	for (let k = startK; k * HAY_PERIOD + b0 < n.x + n.w + 10; k++) {
		const b = k * HAY_PERIOD + b0;
		// var(--tone) 0 2px — straw
		ctx.rect(b, y0, 2, y1 - y0);
		// var(--tone) 5px 6px — the thin strand between the gaps
		ctx.rect(b + 5, y0, 1, y1 - y0);
	}
	ctx.fillStyle = n.tone;
	ctx.fill();

	ctx.restore(); // the clip
	ctx.restore(); // alpha + sway
}

/* ------------------------------------------------------------------ */
/* shimmer — `.d-shimmer::before` + `shimmerPulse`                     */
/* ------------------------------------------------------------------ */

const SHIMMER_DUR_S = 3.4; // shimmerPulse 3.4s (infinite, not alternate)

function drawShimmer(ctx: CanvasRenderingContext2D, env: LayerEnv, slot: DecorSlot): void {
	const n = nodeOf(slot, env);
	/**
	 * shimmerPulse 3.4s ease-in-out infinite (verbatim), each keyframe segment
	 * eased separately:
	 *
	 *   0%, 100% { opacity: 0.3; transform: scale(0.7); }
	 *   50%      { opacity: 1;   transform: scale(1.2); }
	 *
	 * Rest pose = the 0% keyframe (scale .7, opacity .3) — p → 0.
	 */
	const p = env.reducedMotion ? 0 : phaseOf(env.tMs, slot.delay, SHIMMER_DUR_S);
	const up = p < 0.5;
	const u = up ? easeInOut(p / 0.5) : easeInOut((p - 0.5) / 0.5);
	const scale = up ? lerp(0.7, 1.2, u) : lerp(1.2, 0.7, u);
	const op = up ? lerp(0.3, 1, u) : lerp(1, 0.3, u);

	ctx.save();
	ctx.globalAlpha = op;
	// scale about the box centre (CSS's default origin), so the glow scales
	// with the dot exactly like a transformed ::before does.
	ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
	ctx.scale(scale, scale);
	// The glow: box-shadow: 0 0 10px 3px color-mix(in srgb, var(--tone) 60%,
	// transparent). Approximation: canvas has no spread, so the 3px spread is
	// folded into the blur (≈10 blur across a 10px-radius halo ≈ the DOM's
	// reach) and the colour is the 60%-alpha mix (withAlpha — mix() is
	// alpha-less; a hex tone parses directly).
	ctx.shadowColor = withAlpha(n.tone, 0.6);
	ctx.shadowBlur = 10;
	ctx.fillStyle = n.tone;
	ctx.beginPath();
	// border-radius: 50% — the w·h box's inscribed ellipse (w = h per model).
	ctx.ellipse(0, 0, n.w / 2, n.h / 2, 0, 0, TAU);
	ctx.fill();
	ctx.restore();
}

/* ------------------------------------------------------------------ */
/* the split + the API                                                 */
/* ------------------------------------------------------------------ */

function drawSlot(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv,
	slot: DecorSlot
): void {
	switch (slot.kind) {
		case 'leaf':
			return drawLeaf(ctx, env, slot);
		case 'wisp':
			return drawWisp(ctx, env, slot);
		case 'mist':
			return drawMist(ctx, env, slot);
		case 'pumpkin':
			return drawPumpkin(ctx, pal, env, slot);
		case 'hay':
			return drawHay(ctx, pal, env, slot);
		case 'shimmer':
			return drawShimmer(ctx, env, slot);
	}
}

/**
 * The sky half of the decor — ThemeLayer's `.track.sky` (after the parallax
 * bands, behind the rooflines): every window slot whose kind is a sky kind
 * (wisp/mist/shimmer), parked at `k*SPACING + off − worldX`, y = `slot.y`.
 */
export function drawDecorSky(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv,
	theme: Theme
): void {
	for (const slot of splitSlots(decorSlots(theme, env.worldX)).sky) {
		drawSlot(ctx, pal, env, slot);
	}
}

/**
 * The ground half — ThemeLayer's `.track.ground` (`z-index: 3`, lifted over the
 * street's bands): every non-sky kind (leaf/pumpkin/hay) in the same window.
 */
export function drawDecorGround(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv,
	theme: Theme
): void {
	for (const slot of splitSlots(decorSlots(theme, env.worldX)).ground) {
		drawSlot(ctx, pal, env, slot);
	}
}

/* ------------------------------------------------------------------ */
/* the rare shooting star — `.shoot` + `shootFade`                     */
/* ------------------------------------------------------------------ */

/**
 * `@keyframes shootFade` (linear both — the `.shoot` element's own opacity):
 *
 *   0% { opacity: 0; } 12% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; }
 *
 * `t01` is the crossing progress (`shootProgress` clamps to [0, 1]); the
 * segments run on the element's `linear` timing, so straight ramps.
 */
export function shootFade(t01: number): number {
	const t = Math.min(Math.max(t01, 0), 1);
	if (t <= 0.12) return t / 0.12;
	if (t <= 0.78) return 1;
	return (1 - t) / 0.22;
}

/**
 * One crossing frame of the shooting star: the HEAD anchored at `(x, y)` (the
 * shell supplies the position via `shootX`/`shootY` — the DOM parked a 0×0
 * box at `translate3d(sx, sy, 0)` and hung the parts off it), the whole streak
 * wearing `shootFade(t01)`.
 *
 * Reduced motion: ThemeLayer tears the star down and its media query hides it
 * — the shell owns that gate; the draw stays harmless here.
 */
export function drawShootingStar(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	t01: number
): void {
	const op = shootFade(t01);
	if (op <= 0) return;

	// ::before — the streak: a 86×2 rounded bar with `right: 0; bottom: 0` of
	// the 0×0 shell (its right-bottom corner at (x, y)), rotated 7° about its
	// right centre, gradient 90° transparent → var(--moon) (tail dark, head lit).
	ctx.save();
	ctx.globalAlpha = op;
	ctx.translate(x, y - 1); // the bar's right centre (h = 2)
	ctx.rotate(7 * DEG);
	const grad = ctx.createLinearGradient(-86, 0, 0, 0);
	// color-mix(in srgb, var(--moon) 0%, transparent) — the moon hue, alpha 0.
	grad.addColorStop(0, withAlpha(pal.moon, 0));
	grad.addColorStop(1, pal.moon);
	ctx.fillStyle = grad;
	ctx.beginPath();
	// border-radius: var(--r-pill) on a 2px-tall bar → the 1px-radius capsule
	// (the 999px token clamps to h/2 — app.css line 139).
	ctx.roundRect(-86, -1, 86, 2, 1);
	ctx.fill();
	ctx.restore();

	// ::after — the head: a 6px circle at left −3px top −3px of the 0×0 shell =
	// centred on (x, y), var(--moon), its soft glow the box-shadow
	// `0 0 10px 3px var(--cream-line)` (spread folded into the blur).
	ctx.save();
	ctx.globalAlpha = op;
	ctx.shadowColor = pal.creamLine;
	ctx.shadowBlur = 10;
	ctx.fillStyle = pal.moon;
	ctx.beginPath();
	ctx.arc(x, y, 3, 0, TAU);
	ctx.fill();
	ctx.restore();
}
