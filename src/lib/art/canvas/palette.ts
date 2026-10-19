/**
 * The canvas world's palette (T4, 2026-10-19).
 *
 * The DOM scene painted with the §3 CSS tokens; the canvas needs the same
 * colours as concrete strings. `palette()` resolves the tokens once from the
 * live computed style (so a token edit propagates), with the exact §3 values
 * as fallbacks so no-DOM contexts (unit tests) still answer. `mix` is the
 * canvas-side `color-mix()` used by the ports (hedge fill, inset shades), and
 * `varColor` turns the theme tone ramps' `var(--x)` references (as
 * `decorTone` returns them) into resolved colours.
 */

export interface Palette {
	night0: string;
	night1: string;
	night2: string;
	night3: string;
	night4: string;
	grass: string;
	road: string;
	sidewalk: string;
	fence: string;
	cream: string;
	creamSoft: string;
	creamLine: string;
	shadowNight: string;
	lamp: string;
	moon: string;
	glow: string;
	ghostShade: string;
	inkNight: string;
	amber: string;
	amberDeep: string;
	amberGlow: string;
	stem: string;
	pumpkin: string;
	pumpkinDeep: string;
}

/** The §3 token table — the fallback lane and the resolver's read list. */
const TOKENS: Record<string, string> = {
	'--night-0': '#191231',
	'--night-1': '#241d45',
	'--night-2': '#3a2c5f',
	'--night-3': '#59406b',
	'--night-4': '#7a5166',
	'--grass': '#443a63',
	'--road': '#3a2e4c',
	'--sidewalk': '#57446c',
	'--fence': '#6b5785',
	'--cream': '#fff6e5',
	'--cream-soft': 'rgba(255, 246, 229, 0.16)',
	'--cream-line': 'rgba(255, 246, 229, 0.28)',
	'--shadow-night': 'rgba(25, 18, 49, 0.35)',
	'--lamp': '#ffd9a0',
	'--moon': '#fff6dd',
	'--glow': '#ffeccf',
	'--ghost-shade': '#e4d9f5',
	'--ink-night': '#3a2f4e',
	'--amber': '#ffd166',
	'--amber-deep': '#e8a93a',
	'--amber-glow': 'rgba(255, 209, 102, 0.28)',
	'--stem': '#7fb069',
	'--pumpkin': '#ff9e57',
	'--pumpkin-deep': '#e8874a'
};

const live = new Map<string, string>();

/** Resolve one token name (with `--`) to its live value or §3 fallback. */
export function token(name: string): string {
	const hit = live.get(name);
	if (hit) return hit;
	let value = '';
	try {
		if (typeof document !== 'undefined') {
			value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		}
	} catch {
		value = '';
	}
	if (!value) value = TOKENS[name] ?? '#000';
	live.set(name, value);
	return value;
}

/** Resolve a `var(--x)` reference (theme tone ramps return these); else pass through. */
export function varColor(value: string): string {
	const m = /^var\((--[a-z0-9-]+)\)$/i.exec(value.trim());
	return m ? token(m[1]) : value;
}

let cached: Palette | null = null;

/** The resolved palette — memoized. */
export function palette(): Palette {
	if (cached) return cached;
	cached = {
		night0: token('--night-0'),
		night1: token('--night-1'),
		night2: token('--night-2'),
		night3: token('--night-3'),
		night4: token('--night-4'),
		grass: token('--grass'),
		road: token('--road'),
		sidewalk: token('--sidewalk'),
		fence: token('--fence'),
		cream: token('--cream'),
		creamSoft: token('--cream-soft'),
		creamLine: token('--cream-line'),
		shadowNight: token('--shadow-night'),
		lamp: token('--lamp'),
		moon: token('--moon'),
		glow: token('--glow'),
		ghostShade: token('--ghost-shade'),
		inkNight: token('--ink-night'),
		amber: token('--amber'),
		amberDeep: token('--amber-deep'),
		amberGlow: token('--amber-glow'),
		stem: token('--stem'),
		pumpkin: token('--pumpkin'),
		pumpkinDeep: token('--pumpkin-deep')
	};
	return cached;
}

function parse(c: string): [number, number, number] | null {
	const s = c.trim();
	let m = /^#([0-9a-f]{6})$/i.exec(s);
	if (m) {
		const n = parseInt(m[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	m = /^#([0-9a-f]{3})$/i.exec(s);
	if (m) {
		const h = m[1];
		return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
	}
	m = /^rgba?\(([^)]+)\)$/i.exec(s);
	if (m) {
		const p = m[1].split(',').map((x) => parseFloat(x.trim()));
		if (p.length >= 3 && p.every((v) => Number.isFinite(v))) {
			return [p[0], p[1], p[2]];
		}
	}
	return null;
}

/** Blend two CSS colours (hex or rgb/rgba); `t` 0 → `a`, 1 → `b`. */
export function mix(a: string, b: string, t: number): string {
	const pa = parse(a);
	const pb = parse(b);
	if (!pa || !pb) return a;
	const k = Math.min(Math.max(t, 0), 1);
	const r = Math.round(pa[0] + (pb[0] - pa[0]) * k);
	const g = Math.round(pa[1] + (pb[1] - pa[1]) * k);
	const bl = Math.round(pa[2] + (pb[2] - pa[2]) * k);
	return `rgb(${r}, ${g}, ${bl})`;
}

/** Test/debug hook: forget the memoized palette + live token reads. */
export function clearPalette(): void {
	cached = null;
	live.clear();
}
