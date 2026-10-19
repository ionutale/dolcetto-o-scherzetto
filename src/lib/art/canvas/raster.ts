/**
 * The canvas world's raster helpers (T4, 2026-10-19).
 *
 * Why this migration exists: six device logs (2026-10-18/19) proved that
 * every DOM-side scroll of this scene — with the raster breath, with bounded
 * paint offsets, even with the walk treadmill detaching and re-attaching
 * every scrolling layer on cadence (`rc` 0→12 in the last log) — is killed
 * by iOS after ~16–36 s of continuous walking. The retained scroll raster is
 * only released on idle, and a scrolling DOM never idles. A canvas is one
 * backing store redrawn in place: no per-scrolled-pixel retention exists.
 *
 * Two raster paths:
 *
 *  - `rasterOf` — an async decode of a complete `<svg>…</svg>` string (the
 *    validated sprite packs) into a device-pixel canvas. The first call
 *    kicks the decode and returns `null`; the shell redraws every frame, so
 *    the art simply appears a frame later. Callers must treat `null` as
 *    "skip this draw", never as an error.
 *  - `shapeRaster` — a synchronous raster drawn by a callback, for shapes the
 *    canvas makes itself (glows, gradients, blurred wisps). Blur padding is
 *    added around the shape; `blit` knows how to place it.
 */

export const RASTER_MAX_SCALE = 3;

/** Device-pixel scale, capped (DPR 3 on the target iPhone). */
function scale(): number {
	const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
	return Math.min(Math.max(dpr, 1), RASTER_MAX_SCALE);
}

export interface Raster {
	canvas: HTMLCanvasElement;
	/** Logical (CSS px) size — for shape rasters this includes the blur pad. */
	w: number;
	h: number;
	/** Extra logical margin on each side (blur padding); 0 for svg rasters. */
	pad: number;
}

/** Parse `width`/`height` (or the viewBox) off an `<svg>` string's opening tag. */
export function svgSize(svg: string): { w: number; h: number } | null {
	const end = svg.indexOf('>');
	const open = end === -1 ? svg : svg.slice(0, end + 1);
	const w = /\bwidth="([0-9.]+)"/.exec(open);
	const h = /\bheight="([0-9.]+)"/.exec(open);
	if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
	const vb = /\bviewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(open);
	if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
	return null;
}

const svgCache = new Map<string, Raster>();
const svgLoading = new Set<string>();

/**
 * The cached device-pixel raster of one `<svg>` string, or `null` while the
 * first decode is still in flight. `key` must identify the *content*.
 */
export function rasterOf(key: string, svg: string, fallbackW = 24, fallbackH = 24): Raster | null {
	const hit = svgCache.get(key);
	if (hit) return hit;
	if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
	if (svgLoading.has(key)) return null;
	svgLoading.add(key);
	const { w, h } = svgSize(svg) ?? { w: fallbackW, h: fallbackH };
	const s = scale();
	const img = new Image();
	img.decoding = 'async';
	img.onload = () => {
		try {
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.ceil(w * s));
			canvas.height = Math.max(1, Math.ceil(h * s));
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				svgCache.set(key, { canvas, w, h, pad: 0 });
			}
		} catch {
			/* a hostile canvas: this key simply never resolves */
		}
		svgLoading.delete(key);
	};
	img.onerror = () => svgLoading.delete(key);
	try {
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	} catch {
		svgLoading.delete(key);
	}
	return null;
}

const shapeCache = new Map<string, Raster>();

export interface ShapeOpts {
	/** Logical blur radius — sets `ctx.filter` and pads the raster by 2×. */
	blurPx?: number;
}

/**
 * A synchronous, cached raster drawn by `draw` in logical coordinates with
 * (0, 0) at the shape's top-left corner (after any blur pad).
 */
export function shapeRaster(
	key: string,
	w: number,
	h: number,
	draw: (ctx: CanvasRenderingContext2D) => void,
	opts: ShapeOpts = {}
): Raster | null {
	const hit = shapeCache.get(key);
	if (hit) return hit;
	if (typeof document === 'undefined') return null;
	try {
		const s = scale();
		const pad = opts.blurPx ? Math.ceil(opts.blurPx * 2) : 0;
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.ceil((w + pad * 2) * s));
		canvas.height = Math.max(1, Math.ceil((h + pad * 2) * s));
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.scale(s, s);
		ctx.translate(pad, pad);
		if (opts.blurPx) ctx.filter = `blur(${opts.blurPx}px)`;
		draw(ctx);
		const raster: Raster = { canvas, w: w + pad * 2, h: h + pad * 2, pad };
		shapeCache.set(key, raster);
		return raster;
	} catch {
		return null;
	}
}

/**
 * Place a raster whose top-left should land at logical (x, y), honouring any
 * blur padding. A `null` raster skips silently.
 */
export function blit(ctx: CanvasRenderingContext2D, r: Raster | null, x: number, y: number): void {
	if (!r) return;
	ctx.drawImage(r.canvas, x - r.pad, y - r.pad, r.w, r.h);
}

/** Test/debug hook: drop every cached raster. */
export function clearRasters(): void {
	svgCache.clear();
	svgLoading.clear();
	shapeCache.clear();
}
