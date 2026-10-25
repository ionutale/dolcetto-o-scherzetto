/**
 * The canvas world's houses layer (T4, 2026-10-19).
 *
 * 1:1 port of `src/lib/art/scene/HouseSlot.svelte` + `src/lib/art/scene/Yards.svelte`
 * (themselves ports of `prototypes/scene-prototype.html` v2: `.slot` +
 * `houseHTML()` and `yardDressing(k)`). It draws the five-house recycling
 * window into the shared canvas — cottage art, the knock shake, the neighbour
 * reveal, the swinging door leaf, the welcome glow and every yard item — in the
 * DOM's own stacking order.
 *
 * Why a canvas: six device logs (2026-10-18/19) proved that DOM scrolling of
 * this scene retains raster on iOS until the page idles, and continuous walking
 * never idles (`docs/T4-CANVAS-PLAN.md`). Every geometry number below is the DOM
 * component's, cited inline; the single approximation is the door swing (see
 * `drawDoor`).
 *
 * State: the animation clocks (door/neighbour tweens, the glow's exponential
 * approach, the one-shot knock shake) are module-level because the scene is a
 * single canvas with a single window. They are keyed by house index `k` and
 * pruned to the live window every frame, so a long walk cannot accumulate them.
 */

import { HOUSES } from '$lib/art/sprites/houses';
import { archOf, neighborFor } from '$lib/art/sprites/neighbors';
import {
	bats,
	candleLantern,
	cobweb,
	gnome,
	lampPost,
	mailbox,
	pumpkinPair,
	scarecrow,
	tombstone,
	trashCan
} from '$lib/art/sprites';
import { SPACING } from '$lib/sim/loop';
import type { LayerEnv } from './env';
import type { Palette } from './palette';
import { blit, rasterOf, shapeRaster, svgSize } from './raster';

/** The canvas world's per-frame input for the houses layer. */
export interface HousesInput {
	/** Per-home flags keyed by house index `k`; `done` dims the windows. */
	homes: Record<number, { done?: boolean }>;
	/** The home the kids stand at (glows), or -1. */
	activeK: number;
	/** The home whose door is open (swings + reveals), or -1. */
	openK: number;
}

/**
 * The stage ground line: `HouseSlot`'s slot box is 620×200 at `bottom: 121` in
 * the 393-tall stage, so its bottom edge (the shared ground line) is 393-121.
 */
export const GROUND_Y = 272;

/** The recycling window: five slots (`HouseSlot` mounts `firstK .. firstK+4`). */
export const WINDOW_SLOTS = 5;

/** `.cottage { left: 190px; bottom: 0 }` — the cottage's left inside the slot. */
const COTTAGE_LEFT = 190;

/** `.doorwrap { left: 282px; bottom: 0; width: 56px; height: 80px }`. */
const DOOR_LEFT = 282;
const DOOR_W = 56;
const DOOR_H = 80;

/** `.dglow { left: 346px; bottom: 96px; width: 26px; height: 26px }`. */
const GLOW_LEFT = 346;
const GLOW_BOTTOM = 96;
const GLOW_SIZE = 26;

/** `.neighbor { left: -8px; bottom: -4px; width: 72px }` inside `.doorwrap`. */
const NEIGHBOR_LEFT = DOOR_LEFT - 8;
const NEIGHBOR_BOTTOM = -4;
const NEIGHBOR_W = 72;

/**
 * The reveal's target height (owner, 2026-10-25: the natural 88–92 px sprites
 * overfilled the 80 px doorway and poked above its lintel). Bottom-anchored and
 * centred; every archetype ends up narrower than the 56 px opening.
 */
export const NEIGHBOR_TARGET_H = 68;

/** Fit a neighbour sprite into the doorway: downscale only, never upscale. */
export function neighborFit(w: number, h: number): { w: number; h: number; scale: number } {
	const scale = Math.min(1, NEIGHBOR_TARGET_H / h);
	return { w: w * scale, h: h * scale, scale };
}

/** The door swing's foreshortening: `rotateY(-68deg)` ≈ `cos(68°)` ≈ 0.375. */
const DOOR_SCALE_X = 0.375;

/** CSS timings, from `HouseSlot.svelte`'s styles. */
export const KNOCK_DURATION_MS = 500;
export const DOOR_SWING_MS = 550;
export const NEIGHBOR_DURATION_MS = 400;
export const NEIGHBOR_DELAY_MS = 120;
/** `.dglow { transition: opacity 0.4s }` — read as the glow's time constant. */
const GLOW_TAU_S = 0.4;

/* ---- pure geometry helpers ----------------------------------------------- */

/** The five houses in the window: `firstK = floor(worldX / SPACING) - 1`. */
export interface HouseWindow {
	/** The leftmost house index in the window. */
	firstK: number;
	/** The five house indices, left to right. */
	slots: number[];
}

/** The live recycling window for a world scroll position (`HouseSlot`'s mount). */
export function houseWindow(worldX: number): HouseWindow {
	const firstK = Math.floor(worldX / SPACING) - 1;
	const slots: number[] = [];
	for (let i = 0; i < WINDOW_SLOTS; i++) slots.push(firstK + i);
	return { firstK, slots };
}

/** `houseArtFor(k)`: type wraps over 8 kinds, palette over 3 families. */
export function houseArtIndices(k: number): { typeIndex: number; paletteIndex: number } {
	const typeIndex = ((k % 8) + 8) % 8;
	const paletteIndex = (((k + typeIndex) % 3) + 3) % 3;
	return { typeIndex, paletteIndex };
}

/** The yard sprites `Yards.svelte` splices, by `$lib/art/sprites` export name. */
export type YardSprite =
	| 'mailbox'
	| 'trashCan'
	| 'gnome'
	| 'tombstone'
	| 'scarecrow'
	| 'pumpkinPair'
	| 'lampPost'
	| 'cobweb'
	| 'bats'
	| 'candleLantern';

/** One yard item, slot-relative. `bottom` follows `Yards.svelte` (may be < 0). */
export type DressingItem =
	| { kind: 'fence'; left: number; width: number; bottom: number }
	| { kind: 'gatepost'; left: number; bottom: number }
	| { kind: 'path'; left: number; bottom: number }
	| { kind: 'sprite'; sprite: YardSprite; left: number; bottom: number }
	| { kind: 'lampglow'; left: number; bottom: number };

/**
 * `yardDressing(k)` — Yards.svelte lines 50-86, in order. Modulo is the
 * prototype's raw `k % n` (never wrapped into 0..n-1): that is what makes the
 * window-edge house `k = -1` draw the plain fence and none of the even/odd
 * ornaments, exactly as the validated scene did.
 */
export function dressingItems(k: number): DressingItem[] {
	const items: DressingItem[] = [];
	if (k % 4 !== 3) {
		items.push({ kind: 'fence', left: 64, width: 222, bottom: -52 });
		items.push({ kind: 'fence', left: 334, width: 216, bottom: -52 });
		items.push({ kind: 'gatepost', left: 285, bottom: -52 });
		items.push({ kind: 'gatepost', left: 329, bottom: -52 });
	}
	items.push({ kind: 'path', left: 286, bottom: -52 });
	items.push({ kind: 'sprite', sprite: 'mailbox', left: 246, bottom: -48 });
	items.push({ kind: 'sprite', sprite: 'trashCan', left: 168, bottom: -40 });
	if (k % 2 === 0) items.push({ kind: 'sprite', sprite: 'gnome', left: 404, bottom: -50 });
	if (k % 5 === 0) items.push({ kind: 'sprite', sprite: 'tombstone', left: 74, bottom: -38 });
	if (k % 7 === 3) items.push({ kind: 'sprite', sprite: 'scarecrow', left: 446, bottom: -50 });
	if (k % 3 !== 2) items.push({ kind: 'sprite', sprite: 'pumpkinPair', left: 486, bottom: -46 });
	// The sidewalk lamp alternates sides with the house index.
	const lampLeft = k % 2 === 0 ? 36 : 566;
	items.push({ kind: 'lampglow', left: lampLeft - 42, bottom: -58 });
	items.push({ kind: 'sprite', sprite: 'lampPost', left: lampLeft, bottom: -68 });
	if (k % 2 === 0) items.push({ kind: 'sprite', sprite: 'cobweb', left: 204, bottom: 118 });
	if (k % 3 === 1) items.push({ kind: 'sprite', sprite: 'bats', left: 150, bottom: 142 });
	items.push({ kind: 'sprite', sprite: 'candleLantern', left: 342, bottom: 44 });
	return items;
}

/* ---- pure timing helpers -------------------------------------------------- */

/** Clamp into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` timing function: solve the x-polynomial
 * for t (Newton–Raphson, bisection fallback), then read the y-polynomial.
 * Endpoints are exact (0 and 1); control points may overshoot (y1 > 1).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
	const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
	const sampleDX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
	return (t: number): number => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		let u = t;
		for (let i = 0; i < 8; i++) {
			const x = sampleX(u) - t;
			if (Math.abs(x) < 1e-6) return sampleY(u);
			const d = sampleDX(u);
			if (Math.abs(d) < 1e-6) break;
			u -= x / d;
		}
		let lo = 0;
		let hi = 1;
		u = t;
		for (let i = 0; i < 24; i++) {
			const x = sampleX(u);
			if (Math.abs(x - t) < 1e-6) break;
			if (x < t) lo = u;
			else hi = u;
			u = (lo + hi) / 2;
		}
		return sampleY(u);
	};
}

/** CSS `ease` — the knock keyframes' per-segment timing function. */
export const EASE = cubicBezier(0.25, 0.1, 0.25, 1);
/** `.door { transition: transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) }`. */
export const EASE_DOOR = cubicBezier(0.34, 1.4, 0.64, 1);
/** `.neighbor { transition: transform 0.4s cubic-bezier(0.3, 1.4, 0.6, 1) 0.12s }`. */
export const EASE_NEIGHBOR = cubicBezier(0.3, 1.4, 0.6, 1);

/**
 * Sample a CSS `@keyframes` track (progress → value) with the given
 * per-segment timing function. `points` are `[t01, value]`, ascending.
 */
export function sampleKeyframes(
	points: ReadonlyArray<readonly [number, number]>,
	t01: number,
	ease: (t: number) => number = EASE
): number {
	const t = clamp(t01, 0, 1);
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (t <= b[0]) {
			const local = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
			return a[1] + (b[1] - a[1]) * ease(local);
		}
	}
	return points[points.length - 1][1];
}

/** `@keyframes knockshake` (HouseSlot.svelte lines 186-203), in px. */
const KNOCK_KEYFRAMES: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[0.2, -2],
	[0.4, 2],
	[0.6, -2],
	[0.8, 1],
	[1, 0]
];

/** The cottage x offset of the knock shake at animation progress `t01`. */
export function knockShakeOffset(t01: number): number {
	return sampleKeyframes(KNOCK_KEYFRAMES, t01, EASE);
}

/** A tween clock: `from` at `startMs + delayMs`, `to` at `startMs + delayMs + durMs`. */
export interface TweenState {
	from: number;
	to: number;
	startMs: number;
	durMs: number;
	delayMs: number;
}

/**
 * The delayed, un-eased progress of a tween: 0 before `delayMs`, ramping to 1
 * over `durMs`. `durMs <= 0` snaps (the reduced-motion collapse).
 */
export function delayedProgress(elapsedMs: number, delayMs: number, durMs: number): number {
	if (durMs <= 0) return elapsedMs >= delayMs ? 1 : 0;
	return clamp((elapsedMs - delayMs) / durMs, 0, 1);
}

/** The eased value of a tween at `nowMs`. */
export function tweenValue(s: TweenState, nowMs: number, ease: (t: number) => number): number {
	const raw = delayedProgress(nowMs - s.startMs, s.delayMs, s.durMs);
	return s.from + (s.to - s.from) * ease(raw);
}

/* ---- per-house animation clocks (module-level: one canvas, one scene) ---- */

const doorTweens = new Map<number, TweenState>();
const neighborTweens = new Map<number, TweenState>();
const glowStates = new Map<number, { value: number; tMs: number }>();
const shakeStarts = new Map<number, number>();
const knockingPrev = new Set<number>();

/**
 * Advance (or start) a house's tween toward `target`. A brand-new house is
 * initialised *at* its target — the DOM element is created with its state class
 * already applied, so a house entering the window never fades in.
 */
function retarget(
	map: Map<number, TweenState>,
	k: number,
	target: number,
	env: LayerEnv,
	durMs: number,
	delayMs: number,
	ease: (t: number) => number
): TweenState {
	const st = map.get(k);
	if (!st) {
		const fresh: TweenState = { from: target, to: target, startMs: env.tMs, durMs, delayMs };
		map.set(k, fresh);
		return fresh;
	}
	if (st.to !== target) {
		const next: TweenState = {
			from: tweenValue(st, env.tMs, ease),
			to: target,
			startMs: env.tMs,
			durMs,
			delayMs
		};
		map.set(k, next);
		return next;
	}
	return st;
}

/** The one-shot knock shake's cottage x offset for house `k`, or 0. */
function knockOffset(env: LayerEnv, input: HousesInput, k: number): number {
	// `.slot.active.knocking .cottage` — the knocked door is active AND open.
	const knocking = !env.reducedMotion && k === input.activeK && k === input.openK;
	const was = knockingPrev.has(k);
	if (knocking) {
		if (!was) {
			knockingPrev.add(k);
			shakeStarts.set(k, env.tMs);
		}
	} else if (was) {
		knockingPrev.delete(k);
		shakeStarts.delete(k);
	}
	const start = shakeStarts.get(k);
	if (start === undefined) return 0;
	const t = (env.tMs - start) / KNOCK_DURATION_MS;
	return t >= 1 ? 0 : knockShakeOffset(t);
}

/** The welcome glow's opacity for house `k`, eased with a 0.4 s time constant. */
function glowOpacity(env: LayerEnv, input: HousesInput, k: number, done: boolean): number {
	const target = done ? 0 : k === input.activeK ? 1 : 0.55;
	const st = glowStates.get(k);
	if (!st) {
		glowStates.set(k, { value: target, tMs: env.tMs });
		return target;
	}
	const dt = Math.max(0, env.tMs - st.tMs) / 1000;
	st.value += (target - st.value) * (1 - Math.exp(-dt / GLOW_TAU_S));
	st.tMs = env.tMs;
	return st.value;
}

/** Drop every clock for a house outside the live window (bounded state). */
function pruneWindow(firstK: number): void {
	const lo = firstK;
	const hi = firstK + WINDOW_SLOTS - 1;
	for (const key of doorTweens.keys()) if (key < lo || key > hi) doorTweens.delete(key);
	for (const key of neighborTweens.keys()) if (key < lo || key > hi) neighborTweens.delete(key);
	for (const key of glowStates.keys()) if (key < lo || key > hi) glowStates.delete(key);
	for (const key of shakeStarts.keys()) if (key < lo || key > hi) shakeStarts.delete(key);
	for (const key of knockingPrev) if (key < lo || key > hi) knockingPrev.delete(key);
}

/* ---- art strings (memoised: the pack builders are pure but string-heavy) ---- */

const houseArtCache = new Map<string, string>();

/**
 * The `.slot.done :global(.win)` rule as an SVG style: inserted right after the
 * opening `<svg …>` tag so it overrides the pack's own `.win` fill.
 */
export function dimWindows(svg: string): string {
	const end = svg.indexOf('>');
	return svg.slice(0, end + 1) + '<style>.win{fill:#4b3f5e}</style>' + svg.slice(end + 1);
}

/** `HOUSES.list[type](palette)`, with the `.win` dimming style spliced in for `done`. */
export function houseSvg(typeIndex: number, paletteIndex: number, done: boolean): string {
	const key = `${typeIndex}:${paletteIndex}:${done ? 1 : 0}`;
	const hit = houseArtCache.get(key);
	if (hit !== undefined) return hit;
	const art = HOUSES.list[typeIndex](paletteIndex);
	const svg = done ? dimWindows(art) : art;
	houseArtCache.set(key, svg);
	return svg;
}

/** The `<svg…</svg>` inside `neighborFor(k)`'s width-carrying `<div>`. */
export function neighborSvg(k: number): string | null {
	const markup = neighborFor(k);
	const start = markup.indexOf('<svg');
	const end = markup.indexOf('</svg>');
	if (start === -1 || end === -1) return null;
	return markup.slice(start, end + '</svg>'.length);
}

/** `$lib/art/sprites` builders for the yard items. */
const YARD_SVG: Record<YardSprite, () => string> = {
	mailbox,
	trashCan,
	gnome,
	tombstone,
	scarecrow,
	pumpkinPair,
	lampPost,
	cobweb,
	bats,
	candleLantern
};

/* ---- drawing -------------------------------------------------------------- */

/** A rounded-rectangle sub-path (Safari-safe: no `ctx.roundRect` dependency). */
function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

/** `.path` — 48×54, fill #5b4a71, opacity .95, the prototype's trapezoid clip. */
function drawPathShape(ctx: CanvasRenderingContext2D): void {
	ctx.globalAlpha = 0.95;
	ctx.fillStyle = '#5b4a71';
	ctx.beginPath();
	ctx.moveTo(48 * 0.38, 0);
	ctx.lineTo(48 * 0.62, 0);
	ctx.lineTo(48, 54);
	ctx.lineTo(0, 54);
	ctx.closePath();
	ctx.fill();
}

/** `.lampglow` radial: rgba(255,217,160,.55) → transparent at 70%, 110×36. */
function drawLampGlow(ctx: CanvasRenderingContext2D): void {
	// CSS `radial-gradient(ellipse at center, …)` sizes to the farthest corner,
	// so the 110×36 box's ending shape is an ellipse of semi-axes (55, 18)·√2.
	const a = 55 * Math.SQRT2;
	ctx.translate(55, 18);
	ctx.scale(1, 18 / 55);
	const g = ctx.createRadialGradient(0, 0, 0, 0, 0, a);
	g.addColorStop(0, 'rgba(255, 217, 160, 0.55)');
	g.addColorStop(0.7, 'rgba(255, 217, 160, 0)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(0, 0, a, 0, Math.PI * 2);
	ctx.fill();
}

/** `.dglow` radial: rgba(255,217,160,.95) → transparent at 70%, 26×26. */
function drawDoorGlow(ctx: CanvasRenderingContext2D): void {
	// `circle` at the farthest corner over a 26×26 box → radius 13·√2.
	const r = 13 * Math.SQRT2;
	const g = ctx.createRadialGradient(13, 13, 0, 13, 13, r);
	g.addColorStop(0, 'rgba(255, 217, 160, 0.95)');
	g.addColorStop(0.7, 'rgba(255, 217, 160, 0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 26, 26);
}

/** The `.door` leaf SVG (HouseSlot.svelte lines 112-127), 56×80. */
function drawDoorLeaf(ctx: CanvasRenderingContext2D): void {
	// <rect x="0" y="0" width="56" height="80" rx="9" fill="#8a6a52"/>
	ctx.fillStyle = '#8a6a52';
	roundedRect(ctx, 0, 0, 56, 80, 9);
	ctx.fill();
	// <rect … fill="none" stroke="#6b513d" stroke-width="3"/>
	ctx.strokeStyle = '#6b513d';
	ctx.lineWidth = 3;
	roundedRect(ctx, 0, 0, 56, 80, 9);
	ctx.stroke();
	// <path d="M9 10 V72 M20 8 V74 M36 8 V74 M47 10 V72" stroke="#00000018" stroke-width="3"/>
	ctx.strokeStyle = '#00000018';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(9, 10);
	ctx.lineTo(9, 72);
	ctx.moveTo(20, 8);
	ctx.lineTo(20, 74);
	ctx.moveTo(36, 8);
	ctx.lineTo(36, 74);
	ctx.moveTo(47, 10);
	ctx.lineTo(47, 72);
	ctx.stroke();
	// <circle cx="44" cy="42" r="3.4" fill="#ffd166"/>
	ctx.fillStyle = '#ffd166';
	ctx.beginPath();
	ctx.arc(44, 42, 3.4, 0, Math.PI * 2);
	ctx.fill();
	// <rect x="6" y="4" width="44" height="10" rx="5" fill="#00000022"/>
	ctx.fillStyle = '#00000022';
	roundedRect(ctx, 6, 4, 44, 10, 5);
	ctx.fill();
}

/**
 * `.fence` — 30px tall (border-box, per `app.css`'s `* { box-sizing: border-box }`):
 * a 5px `border-top` bar over 25px of the `repeating-linear-gradient(90deg,
 * var(--fence) 0 6px, transparent 6px 15px)` planks (6px planks / 9px gaps).
 */
function drawFence(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	w: number
): void {
	ctx.fillStyle = pal.fence;
	ctx.fillRect(x, y, w, 5);
	for (let px = 0; px < w; px += 15) ctx.fillRect(x + px, y + 5, Math.min(6, w - px), 25);
}

/** `.gatepost` — 6×36, rx 3, fill var(--fence). */
function drawGatepost(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number): void {
	ctx.fillStyle = pal.fence;
	roundedRect(ctx, x, y, 6, 36, 3);
	ctx.fill();
}

/**
 * The yard dressing in the DOM's order. Every item's y is
 * `GROUND_Y - bottom - height` (Yards.svelte's `bottom` convention, negative for
 * everything below the slot's base line).
 */
function drawDressing(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	k: number,
	slotLeft: number
): void {
	for (const item of dressingItems(k)) {
		switch (item.kind) {
			case 'fence':
				drawFence(ctx, pal, slotLeft + item.left, GROUND_Y - item.bottom - 30, item.width);
				break;
			case 'gatepost':
				drawGatepost(ctx, pal, slotLeft + item.left, GROUND_Y - item.bottom - 36);
				break;
			case 'path': {
				const r = shapeRaster('yard:path', 48, 54, drawPathShape);
				blit(ctx, r, slotLeft + item.left, GROUND_Y - item.bottom - 54);
				break;
			}
			case 'lampglow': {
				const r = shapeRaster('yard:lampglow', 110, 36, drawLampGlow);
				ctx.save();
				ctx.globalAlpha = 0.5;
				blit(ctx, r, slotLeft + item.left, GROUND_Y - item.bottom - 36);
				ctx.restore();
				break;
			}
			case 'sprite': {
				const r = rasterOf('yard:' + item.sprite, YARD_SVG[item.sprite]());
				if (!r) break;
				ctx.save();
				if (item.sprite === 'cobweb') ctx.globalAlpha = 0.75;
				blit(ctx, r, slotLeft + item.left, GROUND_Y - item.bottom - r.h);
				ctx.restore();
				break;
			}
		}
	}
}

/** The cottage: `HOUSES.list[type](palette)` at `left: 190`, bottom-anchored. */
function drawCottage(
	ctx: CanvasRenderingContext2D,
	env: LayerEnv,
	input: HousesInput,
	k: number,
	slotLeft: number
): void {
	const done = input.homes[k]?.done === true;
	const { typeIndex, paletteIndex } = houseArtIndices(k);
	const r = rasterOf(
		`house:${typeIndex}:${paletteIndex}:${done ? 1 : 0}`,
		houseSvg(typeIndex, paletteIndex, done)
	);
	if (!r) return;
	blit(ctx, r, slotLeft + COTTAGE_LEFT + knockOffset(env, input, k), GROUND_Y - r.h);
}

/** The neighbour behind the leaf: revealed by the open target's delayed scaleY. */
function drawNeighbor(
	ctx: CanvasRenderingContext2D,
	env: LayerEnv,
	input: HousesInput,
	k: number,
	slotLeft: number
): void {
	const svg = neighborSvg(k);
	if (!svg) return;
	const size = svgSize(svg);
	if (!size) return;
	const target = input.openK >= 0 && k === input.openK ? 1 : 0;
	const st = retarget(
		neighborTweens,
		k,
		target,
		env,
		env.reducedMotion ? 0 : NEIGHBOR_DURATION_MS,
		NEIGHBOR_DELAY_MS,
		EASE_NEIGHBOR
	);
	const sy = 0.05 + 0.95 * tweenValue(st, env.tMs, EASE_NEIGHBOR);
	// Owner ask (2026-10-25): the natural 88–92 px sprites were a bit too big
	// for the 80 px doorway. Fit them to 68 px, bottom-anchored and centred.
	const fit = neighborFit(size.w, size.h);
	const x = slotLeft + NEIGHBOR_LEFT + (NEIGHBOR_W - fit.w) / 2;
	const y = GROUND_Y - NEIGHBOR_BOTTOM - fit.h;
	// Key by ARCHETYPE, not by k: the six neighbours cycle forever, so a
	// per-house key would decode the same art again for every house walked and
	// grow the raster cache unboundedly — the exact memory class this
	// migration exists to end.
	const r = rasterOf(`neighbor:${archOf(k)}`, svg);
	ctx.save();
	ctx.translate(x + fit.w / 2, y + fit.h);
	ctx.scale(1, sy);
	blit(ctx, r, -fit.w / 2, -fit.h);
	ctx.restore();
}

/**
 * The door leaf. The DOM swings it with `rotateY(-68deg)` under
 * `perspective: 300px`; the canvas approximates that with a horizontal `scaleX`
 * about the leaf's left edge (`cos(68°) ≈ 0.375`) — the documented approximation
 * from `docs/T4-CANVAS-PLAN.md`. The `drop-shadow` filter is approximated with
 * the canvas shadow API while the leaf is off its rest angle.
 */
function drawDoor(
	ctx: CanvasRenderingContext2D,
	env: LayerEnv,
	input: HousesInput,
	k: number,
	slotLeft: number
): void {
	const target = input.openK >= 0 && k === input.openK ? 1 : 0;
	const st = retarget(
		doorTweens,
		k,
		target,
		env,
		env.reducedMotion ? 0 : DOOR_SWING_MS,
		0,
		EASE_DOOR
	);
	const progress = tweenValue(st, env.tMs, EASE_DOOR);
	const r = shapeRaster('door-leaf', DOOR_W, DOOR_H, drawDoorLeaf);
	ctx.save();
	if (Math.abs(progress) > 0) {
		ctx.shadowColor = 'rgba(10, 6, 30, 0.45)';
		ctx.shadowBlur = 6;
		ctx.shadowOffsetX = -2;
		ctx.shadowOffsetY = 2;
	}
	ctx.translate(slotLeft + DOOR_LEFT, GROUND_Y - DOOR_H);
	ctx.scale(1 - (1 - DOOR_SCALE_X) * progress, 1);
	blit(ctx, r, 0, 0);
	ctx.restore();
}

/** `.dglow` — the warm welcome dot beside the door. */
function drawGlow(
	ctx: CanvasRenderingContext2D,
	env: LayerEnv,
	input: HousesInput,
	k: number,
	slotLeft: number
): void {
	const opacity = glowOpacity(env, input, k, input.homes[k]?.done === true);
	if (opacity <= 0.002) return;
	const r = shapeRaster('dglow', GLOW_SIZE, GLOW_SIZE, drawDoorGlow);
	ctx.save();
	ctx.globalAlpha = opacity;
	blit(ctx, r, slotLeft + GLOW_LEFT, GROUND_Y - GLOW_BOTTOM - GLOW_SIZE);
	ctx.restore();
}

/** Draw the houses window for this frame. */
export function drawHousesLayer(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	env: LayerEnv,
	input: HousesInput
): void {
	const { firstK, slots } = houseWindow(env.worldX);
	for (const k of slots) {
		const slotLeft = k * SPACING - env.worldX;
		// DOM stacking: cottage → neighbour → door → glow → dressing.
		drawCottage(ctx, env, input, k, slotLeft);
		drawNeighbor(ctx, env, input, k, slotLeft);
		drawDoor(ctx, env, input, k, slotLeft);
		drawGlow(ctx, env, input, k, slotLeft);
		drawDressing(ctx, pal, k, slotLeft);
	}
	pruneWindow(firstK);
}
