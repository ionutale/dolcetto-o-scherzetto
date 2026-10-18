<script lang="ts">
	/**
	 * T24 — the scary moments (spec §10; ART-STYLE §10 "theatre spooky" ceiling).
	 *
	 * Port of `prototypes/pieces/scares.js` (v2, accepted) — the six cameos, the
	 * veil, and the kids' beat — plus the host wiring from
	 * `prototypes/scene-prototype.html` (`scareNow`/`scareTick`, ~1501-1526).
	 *
	 * The component owns three things:
	 *
	 *   - **the six choreographies** — `witch` (broom across the sky), `wolf`
	 *     (werewolf across the yard line), `vampire` (mid-distance glide),
	 *     `skeleton` (comedic yard strut), `mummy` (mid-distance shuffle) and
	 *     `thunder` (a sky event: cloud slides in, one bolt, **one soft flash**,
	 *     never a strobe). The five crossings step a rAF `translateX` with the
	 *     prototype's easing; the life of each (bob/dash/glide/cape/waddle/
	 *     shuffle) is the ported CSS;
	 *   - **the veil** — dim + soft purple/green wash, `≤1 s` in, no strobe
	 *     (`prefers-reduced-motion` kills the wash and every thunder flash frame);
	 *   - **the kids' beat** — the prototype's stop → hug → tremble → peek →
	 *     giggle ≈2.5 s, its class names (`scare-hug`/`-tremble`/`-peek`/
	 *     `-giggle`, plus the container's `scares-armed`/`scares-stop`) applied to
	 *     the duo's DOM on the schedule in `scare-model.ts`.
	 *
	 * **The rules are not here.** `scare-model.ts` owns *when* a scare may fire
	 * (roam + `dir !== 0`, `[60 s, 120 s)` gap, ~45 s first, one at a time) and
	 * *which* kind; this component only feeds it the sim's phase/dir/shop each
	 * frame and plays the answer. `trigger(kind)` forces a cameo (the smoke uses
	 * it), `trigger()` runs the rules and refuses outside them — both mirrored on
	 * `window.Scares`, exactly like the prototype's global.
	 *
	 * **The two hooks.** `sound(cue)` is a no-op by default — T23/T27 replace it,
	 * so a cameo never crashes without audio. `onScare(active)` is the contract
	 * the page wires to its walking lock (and T23 will wire to `duckAmbience`);
	 * it is `true` once at the trigger and `false` once at the beat end.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { dir, phase, shopOpen } from '$lib/state/game.svelte';
	import {
		SCARE_ARMED_CLASS,
		SCARE_BEAT,
		SCARE_BEAT_MS,
		SCARE_FIRST_MS,
		SCARE_KINDS,
		SCARE_STOP_CLASS,
		nextScareAt,
		scareCue,
		scareTick
	} from './scare-model';
	import type { BeatClass, ScareKind } from './scare-model';
	import { logEvent } from '$lib/diagnostics/crashlog';

	/** The smoke/dev seam: the prototype exposed `window.Scares` too. */
	type ScaresHandle = { trigger: (kind?: ScareKind) => boolean; cancel: () => void };

	interface Props {
		/** Cue hook — a no-op by default; T23/T27 play the `scare:*` cues. */
		sound?: (cue: string) => void;
		/** The walking lock (T24) + the future ambience duck (T23). */
		onScare?: (active: boolean) => void;
		/** Delay before the first cameo (defaults to the spec's ~45 s); injectable. */
		firstDelayMs?: number;
		/** Kind/gap rng (defaults to `Math.random`); injectable for a harness. */
		rng?: () => number;
	}

	let {
		sound = () => {},
		onScare = () => {},
		firstDelayMs = SCARE_FIRST_MS,
		rng = Math.random
	}: Props = $props();

	/* ---- stage geometry (prototype `pieces/scares.js` ~37-38) ---- */
	const STAGE_W = 852;
	const MARGIN = 40;

	type Ease = 'in' | 'out' | 'inout';

	/** Per-kind choreography — numbers verbatim from the prototype's `KINDS`. */
	interface KindCfg {
		/** Crossing life, s. */
		dur: number;
		/** Stage-local top of the sprite box, px. */
		top: number;
		/** Sprite box width/height, px. */
		w: number;
		h: number;
		/** Crossing easing. */
		ease: Ease;
		/** `thunder` is a sky event, not a crossing. */
		sky?: boolean;
		/** The sprite markup. */
		svg: () => string;
	}

	/* ---- palette tokens (ART-STYLE §3), prototype-verbatim ---- */
	const C = {
		ink: '#3a2f4e',
		witchHat: '#43326b',
		witchHatLite: '#4d3a7c',
		witchHair: '#7a5cff',
		witchSkin: '#cfe8d2',
		witchRobe: '#4a3a78',
		witchRobeLite: '#5a4a8c',
		wolfFur: '#9a8fc0',
		wolfFurDeep: '#7b71a2',
		wolfBelly: '#cbbfdd',
		wolfMid: '#8a7fb0',
		vampCape: '#6d3a5e',
		vampCapeDeep: '#5a2f4f',
		vampSkin: '#efe6f7',
		vampHair: '#2e2751',
		bone: '#f4ecdc',
		boneShade: '#dcd1b6',
		linen: '#efe3cf',
		linenShade: '#d8c8ad',
		amber: '#ffd166',
		blush: '#ffb8a8',
		wood: '#8a6a52',
		straw: '#c98a4b'
	};

	/* ---- monster SVGs (prototype `pieces/scares.js` ~167-421), verbatim ---- */
	function witchSVG(): string {
		return (
			'<svg width="120" height="80" viewBox="0 0 120 80">' +
			'<g class="scare-bob">' +
			'<path d="M22 55 C10 47 2 49 0 56 C0 63 12 67 24 62 Z" fill="' +
			C.straw +
			'"/>' +
			'<path d="M20 55 C11 51 5 53 3 57 C3 61 10 64 20 61 Z" fill="#d99a55" opacity=".8"/>' +
			'<rect x="16" y="54" width="102" height="6" rx="3" fill="' +
			C.wood +
			'"/>' +
			'<rect x="16" y="54" width="102" height="2.2" rx="1.1" fill="#a5825f" opacity=".8"/>' +
			'<rect x="58" y="60" width="6" height="12" rx="3" fill="' +
			C.witchRobe +
			'"/>' +
			'<rect x="68" y="60" width="6" height="12" rx="3" fill="' +
			C.witchRobe +
			'"/>' +
			'<ellipse cx="61" cy="73" rx="5" ry="3" fill="#2e2751"/>' +
			'<ellipse cx="71" cy="73" rx="5" ry="3" fill="#2e2751"/>' +
			'<path d="M54 34 C48 44 46 54 50 62 L76 62 C78 52 76 42 70 34 Z" fill="' +
			C.witchRobe +
			'"/>' +
			'<path d="M54 34 C48 44 46 54 50 62 L60 62 C58 52 58 42 60 34 Z" fill="' +
			C.witchRobeLite +
			'" opacity=".55"/>' +
			'<rect x="56" y="28" width="18" height="12" rx="6" fill="' +
			C.witchHat +
			'"/>' +
			'<circle cx="64" cy="20" r="11" fill="' +
			C.witchSkin +
			'"/>' +
			'<path d="M54 12 C46 9 38 13 36 22 C42 18 48 20 52 24 C54 20 55 16 54 12 Z" fill="' +
			C.witchHair +
			'"/>' +
			'<path d="M54 20 C46 20 40 25 38 31 C43 27 49 27 53 29 C54 26 54 23 54 20 Z" fill="' +
			C.witchHair +
			'"/>' +
			'<path d="M52 14 C56 0 74 0 78 14 Z" fill="' +
			C.witchHat +
			'"/>' +
			'<path d="M52 14 C56 0 74 0 78 14 L72 14 C68 4 60 4 56 14 Z" fill="' +
			C.witchHatLite +
			'" opacity=".6"/>' +
			'<ellipse cx="65" cy="14" rx="17" ry="4" fill="' +
			C.witchHat +
			'"/>' +
			'<rect x="52" y="11" width="26" height="4" rx="2" fill="' +
			C.amber +
			'"/>' +
			'<path d="M52 26 l1.3 2.7 2.7 1.3 -2.7 1.3 -1.3 2.7 -1.3 -2.7 -2.7 -1.3 2.7 -1.3 Z" fill="' +
			C.amber +
			'"/>' +
			'<circle cx="60" cy="19" r="1.7" fill="' +
			C.ink +
			'"/>' +
			'<circle cx="68" cy="19" r="1.7" fill="' +
			C.ink +
			'"/>' +
			'<circle cx="60.6" cy="18.4" r=".6" fill="#fff"/>' +
			'<circle cx="68.6" cy="18.4" r=".6" fill="#fff"/>' +
			'<path d="M60 24 Q64 27 68 24" stroke="' +
			C.ink +
			'" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
			'<ellipse cx="57" cy="23" rx="2.1" ry="1.5" fill="' +
			C.blush +
			'" opacity=".8"/>' +
			'<ellipse cx="71" cy="23" rx="2.1" ry="1.5" fill="' +
			C.blush +
			'" opacity=".8"/>' +
			'</g></svg>'
		);
	}

	function wolfSVG(): string {
		return (
			'<svg width="132" height="74" viewBox="0 0 132 74">' +
			'<g class="scare-dash">' +
			'<path d="M22 34 C13 30 6 32 4 39 C9 38 14 39 18 43 Z" fill="' +
			C.wolfFur +
			'"/>' +
			'<path d="M30 52 C25 58 19 64 13 68 L19 71 C25 67 31 62 35 56 Z" fill="' +
			C.wolfFurDeep +
			'"/>' +
			'<ellipse cx="15" cy="70" rx="5" ry="3" fill="' +
			C.wolfFurDeep +
			'"/>' +
			'<path d="M88 52 C94 58 100 64 106 68 L100 71 C94 67 88 62 84 56 Z" fill="' +
			C.wolfFurDeep +
			'"/>' +
			'<ellipse cx="104" cy="70" rx="5" ry="3" fill="' +
			C.wolfFurDeep +
			'"/>' +
			'<ellipse cx="58" cy="44" rx="34" ry="20" fill="' +
			C.wolfFur +
			'"/>' +
			'<ellipse cx="58" cy="52" rx="24" ry="11" fill="' +
			C.wolfBelly +
			'"/>' +
			'<path d="M40 54 C36 60 32 66 28 70 L34 72 C38 68 42 63 46 58 Z" fill="' +
			C.wolfMid +
			'"/>' +
			'<ellipse cx="30" cy="71" rx="5" ry="3" fill="' +
			C.wolfMid +
			'"/>' +
			'<circle cx="96" cy="30" r="17" fill="' +
			C.wolfFur +
			'"/>' +
			'<path d="M86 18 L82 6 L94 13 Z" fill="' +
			C.wolfFur +
			'"/>' +
			'<path d="M104 16 L108 4 L112 15 Z" fill="' +
			C.wolfFur +
			'"/>' +
			'<path d="M87 16 L85 9 L91 14 Z" fill="' +
			C.wolfBelly +
			'"/>' +
			'<path d="M104 14 L106 8 L109 14 Z" fill="' +
			C.wolfBelly +
			'"/>' +
			'<path d="M108 28 C118 26 124 30 124 36 C124 42 116 44 108 42 Z" fill="' +
			C.wolfFur +
			'"/>' +
			'<ellipse cx="122" cy="33" rx="4" ry="3.2" fill="' +
			C.ink +
			'"/>' +
			'<path d="M112 40 L114 45 L116 40 Z" fill="#fff"/>' +
			'<circle cx="98" cy="28" r="2.4" fill="' +
			C.ink +
			'"/>' +
			'<circle cx="98.8" cy="27.2" r=".8" fill="#fff"/>' +
			'<path d="M92 23 Q98 21 104 23" stroke="' +
			C.wolfFurDeep +
			'" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
			'<ellipse cx="92" cy="36" rx="2.6" ry="1.8" fill="' +
			C.wolfBelly +
			'" opacity=".9"/>' +
			'</g></svg>'
		);
	}

	function vampireSVG(): string {
		return (
			'<svg width="112" height="96" viewBox="0 0 112 96">' +
			'<g class="scare-glide">' +
			'<path class="scare-cape" d="M60 26 C36 30 18 48 14 84 C30 76 40 70 50 66 C56 54 58 40 60 26 Z" fill="' +
			C.vampCape +
			'"/>' +
			'<path class="scare-cape" d="M60 26 C30 32 14 54 12 90 C32 80 44 72 54 66 C58 52 60 38 60 26 Z" fill="' +
			C.vampCapeDeep +
			'" opacity=".6"/>' +
			'<path d="M58 34 C50 44 48 58 52 78 L80 78 C82 62 80 46 72 34 Z" fill="' +
			C.vampHair +
			'"/>' +
			'<path d="M58 34 L66 44 L74 34 L70 30 L66 36 L62 30 Z" fill="' +
			C.vampSkin +
			'"/>' +
			'<path d="M54 34 L50 44 L58 38 Z" fill="' +
			C.vampSkin +
			'"/>' +
			'<path d="M78 34 L82 44 L74 38 Z" fill="' +
			C.vampSkin +
			'"/>' +
			'<circle cx="66" cy="22" r="13" fill="' +
			C.vampSkin +
			'"/>' +
			'<path d="M53 18 C54 8 64 5 68 7 C76 6 80 12 79 20 C74 14 68 14 64 17 C60 14 56 15 53 18 Z" fill="' +
			C.vampHair +
			'"/>' +
			'<path d="M60 15 L66 20 L72 15 C70 13 62 13 60 15 Z" fill="' +
			C.vampHair +
			'"/>' +
			'<ellipse cx="61" cy="22" rx="2" ry="2.4" fill="' +
			C.ink +
			'"/>' +
			'<ellipse cx="71" cy="22" rx="2" ry="2.4" fill="' +
			C.ink +
			'"/>' +
			'<circle cx="61.7" cy="21.2" r=".7" fill="#fff"/>' +
			'<circle cx="71.7" cy="21.2" r=".7" fill="#fff"/>' +
			'<path d="M57 17 Q61 15.5 65 17" stroke="' +
			C.vampHair +
			'" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
			'<path d="M67 17 Q71 15.5 75 17" stroke="' +
			C.vampHair +
			'" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
			'<path d="M61 29 Q66 33 71 29" stroke="' +
			C.ink +
			'" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
			'<path d="M62.5 30.5 L63.5 34 L64.5 30.5 Z" fill="#fff"/>' +
			'<path d="M67.5 30.5 L68.5 34 L69.5 30.5 Z" fill="#fff"/>' +
			'<ellipse cx="57" cy="27" rx="2.2" ry="1.5" fill="#e7c6e0" opacity=".85"/>' +
			'<ellipse cx="75" cy="27" rx="2.2" ry="1.5" fill="#e7c6e0" opacity=".85"/>' +
			'</g></svg>'
		);
	}

	function skeletonSVG(): string {
		return (
			'<svg width="96" height="66" viewBox="0 0 96 66">' +
			'<g class="scare-walk">' +
			'<g class="leg-r" style="transform-origin:45px 46px">' +
			'<rect x="41" y="46" width="6" height="12" rx="3" fill="' +
			C.boneShade +
			'"/>' +
			'<rect x="41" y="57" width="5" height="7" rx="2.5" fill="' +
			C.boneShade +
			'"/>' +
			'<ellipse cx="45" cy="65" rx="5" ry="2.6" fill="' +
			C.boneShade +
			'"/></g>' +
			'<g class="arm-r" style="transform-origin:40px 24px">' +
			'<rect x="34" y="24" width="5" height="12" rx="2.5" fill="' +
			C.boneShade +
			'"/>' +
			'<rect x="32" y="35" width="5" height="12" rx="2.5" fill="' +
			C.boneShade +
			'"/>' +
			'<circle cx="34" cy="49" r="3.4" fill="' +
			C.boneShade +
			'"/></g>' +
			'<rect x="44" y="20" width="5" height="26" rx="2.5" fill="' +
			C.bone +
			'"/>' +
			'<rect x="34" y="20" width="26" height="24" rx="10" fill="' +
			C.bone +
			'"/>' +
			'<path d="M38 27 Q47 31 56 27" stroke="' +
			C.boneShade +
			'" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
			'<path d="M38 33 Q47 37 56 33" stroke="' +
			C.boneShade +
			'" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
			'<path d="M38 39 Q47 43 56 39" stroke="' +
			C.boneShade +
			'" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
			'<ellipse cx="47" cy="46" rx="10" ry="6" fill="' +
			C.bone +
			'"/>' +
			'<g class="leg-l" style="transform-origin:51px 46px">' +
			'<rect x="49" y="46" width="6" height="12" rx="3" fill="' +
			C.bone +
			'"/>' +
			'<rect x="49" y="57" width="5" height="7" rx="2.5" fill="' +
			C.bone +
			'"/>' +
			'<ellipse cx="53" cy="65" rx="5" ry="2.6" fill="' +
			C.bone +
			'"/></g>' +
			'<g class="arm-l" style="transform-origin:52px 24px">' +
			'<rect x="50" y="24" width="5" height="12" rx="2.5" fill="' +
			C.bone +
			'"/>' +
			'<rect x="52" y="35" width="5" height="12" rx="2.5" fill="' +
			C.bone +
			'"/>' +
			'<circle cx="55" cy="49" r="3.4" fill="' +
			C.bone +
			'"/></g>' +
			'<circle cx="60" cy="10" r="12" fill="' +
			C.bone +
			'"/>' +
			'<path d="M60 -2 C68 -2 72 4 72 11 C72 16 70 19 66 20 C70 14 70 6 66 1 C64 -1 62 -2 60 -2 Z" fill="' +
			C.boneShade +
			'" opacity=".7"/>' +
			'<ellipse cx="55" cy="8" rx="2.8" ry="3.2" fill="' +
			C.ink +
			'"/>' +
			'<ellipse cx="66" cy="8" rx="2.8" ry="3.2" fill="' +
			C.ink +
			'"/>' +
			'<path d="M60 12 L58 15 L62 15 Z" fill="' +
			C.ink +
			'"/>' +
			'<path d="M54 17 Q60 21 66 17 L65 22 Q60 26 55 22 Z" fill="' +
			C.ink +
			'"/>' +
			'<path d="M56 17.6 L57 20 L58 17.8 M60 17.8 L61 20.4 L62 17.8 M64 17.8 L65 20 L66 17.6" stroke="' +
			C.bone +
			'" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
			'<g class="jaw" style="transform-origin:60px 21px">' +
			'<path d="M56 22 Q60 25 64 22 L63 25 Q60 27.5 57 25 Z" fill="' +
			C.bone +
			'"/></g>' +
			'<ellipse cx="51" cy="14" rx="2.2" ry="1.4" fill="' +
			C.blush +
			'" opacity=".85"/>' +
			'<ellipse cx="70" cy="14" rx="2.2" ry="1.4" fill="' +
			C.blush +
			'" opacity=".85"/>' +
			'</g></svg>'
		);
	}

	function mummySVG(): string {
		return (
			'<svg width="100" height="96" viewBox="0 0 100 96">' +
			'<g class="scare-shuffle">' +
			'<rect x="43" y="84" width="7" height="8" rx="3" fill="' +
			C.linenShade +
			'"/>' +
			'<ellipse cx="46" cy="93" rx="6" ry="3" fill="' +
			C.linenShade +
			'"/>' +
			'<rect x="55" y="84" width="7" height="8" rx="3" fill="' +
			C.linen +
			'"/>' +
			'<ellipse cx="59" cy="93" rx="6" ry="3" fill="' +
			C.linen +
			'"/>' +
			'<rect x="34" y="28" width="38" height="60" rx="18" fill="' +
			C.linen +
			'"/>' +
			'<path d="M56 30 C66 34 70 46 70 62 C70 76 66 86 60 90 C64 78 64 48 56 30 Z" fill="' +
			C.linenShade +
			'" opacity=".7"/>' +
			'<g stroke="' +
			C.linenShade +
			'" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8">' +
			'<path d="M36 40 L70 36"/><path d="M35 50 L71 47"/><path d="M35 60 L71 58"/>' +
			'<path d="M36 70 L70 69"/><path d="M38 80 L68 80"/></g>' +
			'<circle cx="54" cy="21" r="17" fill="' +
			C.linen +
			'"/>' +
			'<path d="M64 8 C70 13 72 20 71 28 C70 20 66 13 60 9 Z" fill="' +
			C.linenShade +
			'" opacity=".7"/>' +
			'<g stroke="' +
			C.linenShade +
			'" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8">' +
			'<path d="M39 15 L68 11"/><path d="M38 21 L69 19"/><path d="M40 28 L66 27"/></g>' +
			'<ellipse cx="60" cy="20" rx="6" ry="6" fill="#fffdf8"/>' +
			'<ellipse cx="61" cy="21" rx="3" ry="3.6" fill="' +
			C.ink +
			'"/>' +
			'<circle cx="62.2" cy="19.6" r="1" fill="#fff"/>' +
			'<ellipse cx="58" cy="31" rx="3.2" ry="2.4" fill="' +
			C.ink +
			'" opacity=".85"/>' +
			'<path class="scare-bandage" d="M36 38 C26 34 18 38 18 47 C25 44 31 47 35 52 Z" fill="' +
			C.linenShade +
			'"/>' +
			'<path d="M68 44 C78 44 86 48 90 55 L85 59 C79 54 73 52 67 52 Z" fill="' +
			C.linenShade +
			'"/>' +
			'<path d="M68 55 C78 56 86 61 90 68 L85 72 C79 67 73 64 67 63 Z" fill="' +
			C.linen +
			'"/>' +
			'<circle cx="89" cy="56" r="4.4" fill="' +
			C.linenShade +
			'"/>' +
			'<circle cx="89" cy="69" r="4.4" fill="' +
			C.linen +
			'"/>' +
			'</g></svg>'
		);
	}

	/** thunder: a dark cloud mass (no outlines, layered shades). */
	const CLOUD_SVG =
		'<svg width="460" height="150" viewBox="0 0 460 150">' +
		'<g fill="#2b2347">' +
		'<ellipse cx="112" cy="112" rx="92" ry="42"/><ellipse cx="222" cy="86" rx="106" ry="56"/>' +
		'<ellipse cx="338" cy="112" rx="96" ry="44"/><ellipse cx="200" cy="128" rx="150" ry="40"/></g>' +
		'<g fill="#3a2f5c" opacity=".9">' +
		'<ellipse cx="222" cy="76" rx="92" ry="42"/><ellipse cx="130" cy="100" rx="72" ry="32"/>' +
		'<ellipse cx="332" cy="102" rx="70" ry="30"/></g>' +
		'<ellipse cx="210" cy="124" rx="150" ry="24" fill="#241d3f"/></svg>';

	/** thunder: one zigzag bolt (pale + soft glow). */
	const BOLT_SVG =
		'<svg class="scare-bolt" width="120" height="200" viewBox="0 0 120 200">' +
		'<defs><filter id="scare-bolt-glow" x="-80%" y="-80%" width="260%" height="260%">' +
		'<feGaussianBlur stdDeviation="6"/></filter></defs>' +
		'<path d="M78 0 L52 58 L72 63 L46 126 L68 131 L44 200 L106 118 L82 112 L110 46 L88 41 Z" fill="#ffd166" opacity=".4" filter="url(#scare-bolt-glow)"/>' +
		'<path d="M78 0 L52 58 L72 63 L46 126 L68 131 L44 200 L106 118 L82 112 L110 46 L88 41 Z" fill="#fff6dd"/></svg>';

	/** The six kinds, prototype-verbatim geometry + sprite. */
	const KINDS: Record<ScareKind, KindCfg> = {
		witch: { dur: 1.57, top: 70, w: 120, h: 80, ease: 'inout', svg: witchSVG },
		wolf: { dur: 1.57, top: 228, w: 132, h: 74, ease: 'in', svg: wolfSVG },
		vampire: { dur: 1.72, top: 96, w: 112, h: 96, ease: 'inout', svg: vampireSVG },
		skeleton: { dur: 1.6, top: 235, w: 96, h: 66, ease: 'inout', svg: skeletonSVG },
		mummy: { dur: 1.7, top: 96, w: 100, h: 96, ease: 'inout', svg: mummySVG },
		thunder: { dur: 2.5, top: 0, w: STAGE_W, h: 393, ease: 'inout', sky: true, svg: () => '' }
	};

	/* ---- state ---- */
	let layerEl: HTMLDivElement | null = null;

	/** The veil's `in` class — the dim + wash, `≤1 s` in, no strobe. */
	let veilIn = $state(false);
	/** The crossing monster, or `null`; `x` is its live `translateX`. */
	let monster = $state<{ kind: ScareKind; top: number; w: number; svg: string } | null>(null);
	let x = $state(0);
	/** The thunder sky event (cloud + bolt + flash) and its `in` beat. */
	let sky = $state(false);
	let skyIn = $state(false);

	/** True from a trigger until `SCARE_BEAT_MS` later — the model's "one at a time". */
	let active = false;
	/** The last kind shown — the no-immediate-repeat memory. */
	let lastKind: ScareKind | null = null;

	/** The duo, found in the stage DOM; the beat classes land here. */
	let kidsEl: HTMLElement | null = null;
	let tinoEl: HTMLElement | null = null;
	let miloEl: HTMLElement | null = null;

	/** Every timer this component owns, cancelled on `reset`. */
	let timers: ReturnType<typeof setTimeout>[] = [];
	/** The crossing rAF and its clock origin. */
	let crossRaf = 0;
	let crossT0 = 0;
	/** The scheduler rAF and the next due time. */
	let raf = 0;
	let nextAt = 0;

	function after(ms: number, fn: () => void): void {
		const id = setTimeout(() => {
			const i = timers.indexOf(id);
			if (i >= 0) timers.splice(i, 1);
			fn();
		}, ms);
		timers.push(id);
	}

	function clearTimers(): void {
		for (const id of timers) clearTimeout(id);
		timers.length = 0;
	}

	/** `performance.now()` where available, `Date.now()` as the last resort. */
	function nowMs(): number {
		return typeof performance === 'undefined' ? Date.now() : performance.now();
	}

	function ease(kind: Ease, t: number): number {
		if (kind === 'in') return t * t;
		if (kind === 'out') return 1 - (1 - t) * (1 - t);
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	}

	/* ---- the duo's beat classes (Kids.svelte ships the CSS) ---- */
	function findKids(): void {
		const stage = layerEl?.closest('.stage') ?? null;
		kidsEl = stage?.querySelector<HTMLElement>('.kids') ?? null;
		tinoEl = kidsEl?.querySelector<HTMLElement>('.tino') ?? null;
		miloEl = kidsEl?.querySelector<HTMLElement>('.milo') ?? null;
	}

	function applyBeat(add: readonly BeatClass[], remove: readonly BeatClass[]): void {
		for (const el of [tinoEl, miloEl]) {
			if (!el) continue;
			for (const c of remove) el.classList.remove(c);
			for (const c of add) el.classList.add(c);
		}
	}

	function kidsReset(): void {
		if (kidsEl) kidsEl.classList.remove(SCARE_STOP_CLASS);
		for (const el of [tinoEl, miloEl]) {
			if (el) el.classList.remove('scare-hug', 'scare-tremble', 'scare-peek', 'scare-giggle');
		}
	}

	/* ---- the crossing (five kinds) + the sky event (thunder) ---- */
	function stepCross(now: number): void {
		if (!active || !monster) {
			crossRaf = 0;
			return;
		}
		const cfg = KINDS[monster.kind];
		const dur = cfg.dur * 1000;
		let t = dur > 0 ? (now - crossT0) / dur : 1;
		if (t > 1) t = 1;
		const from = -(monster.w + MARGIN);
		const to = STAGE_W + MARGIN;
		x = from + (to - from) * ease(cfg.ease, t);
		crossRaf = t < 1 ? requestAnimationFrame(stepCross) : 0;
	}

	function startCrossing(kind: ScareKind): void {
		const cfg = KINDS[kind];
		monster = { kind, top: cfg.top, w: cfg.w, svg: cfg.svg() };
		x = -(cfg.w + MARGIN);
		crossT0 = nowMs();
		crossRaf = requestAnimationFrame(stepCross);
	}

	/** thunder: cloud slides in, one bolt, ONE soft flash — the CSS does it all. */
	function startSky(): void {
		sky = true;
		skyIn = false;
		requestAnimationFrame(() => {
			if (active) skyIn = true;
		});
	}

	/* ---- lifecycle ---- */
	/** Drop the veil, the monster/sky and every timer + class. Never hooks. */
	function reset(): void {
		clearTimers();
		if (crossRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(crossRaf);
		crossRaf = 0;
		veilIn = false;
		monster = null;
		sky = false;
		skyIn = false;
		kidsReset();
	}

	function notify(flag: boolean): void {
		try {
			onScare(flag);
		} catch {
			/* a hook must never break the cameo */
		}
	}

	/**
	 * Play one cameo's choreography + beat. Assumes the caller has already
	 * cleared the way (`reset`) and owns the gap (`nextAt`).
	 */
	function begin(pick: ScareKind): void {
		reset();
		active = true;
		lastKind = pick;
		logEvent('scareK', { kind: pick });

		findKids();
		if (kidsEl) kidsEl.classList.add(SCARE_STOP_CLASS);

		veilIn = true;
		try {
			sound(scareCue(pick));
		} catch {
			/* host sound is best-effort */
		}
		if (KINDS[pick].sky) startSky();
		else startCrossing(pick);

		for (const step of SCARE_BEAT) after(step.at, () => applyBeat(step.add, step.remove));
		after(SCARE_BEAT_MS, release);

		notify(true);
	}

	/**
	 * Trigger a cameo by hand.
	 *
	 *   - `trigger(kind)` **forces** it — the smoke's `trigger('witch')`, the
	 *     prototype's dev button. A forced cameo still consumes the gap, so the
	 *     next automatic scare respects the full `[60 s, 120 s)` window.
	 *   - `trigger()` runs the **rules** instead: it asks `scareTick` right now
	 *     and refuses (`false`) unless the sim is roaming, walking, shopless and
	 *     past the gap, and no beat is on screen. Calling it immediately after a
	 *     cameo is therefore refused — the acceptance's "second trigger refused".
	 *
	 * Returns `false` when unmounted, given an unknown kind, or refused.
	 */
	export function trigger(kind?: ScareKind): boolean {
		if (!layerEl) return false;
		if (kind !== undefined) {
			if (!SCARE_KINDS.includes(kind)) return false;
			nextAt = nextScareAt(nowMs(), rng);
			begin(kind);
			return true;
		}
		const decision = scareTick(
			{
				now: nowMs(),
				nextAt,
				phase: phase(),
				dir: dir(),
				shopOpen: shopOpen(),
				active,
				prevKind: lastKind
			},
			rng
		);
		nextAt = decision.nextAt;
		if (!decision.kind) return false;
		begin(decision.kind);
		return true;
	}

	/** The beat end: clean everything, then hand the lock back (exactly at 2500 ms). */
	function release(): void {
		reset();
		active = false;
		notify(false);
	}

	/** A safe cancel anytime (the prototype's `Scares.cancel`), hooks included. */
	export function cancel(): void {
		const wasActive = active;
		reset();
		active = false;
		if (wasActive) notify(false);
	}

	/* ---- the scheduler: one model tick per frame ---- */
	function frame(now: number): void {
		const decision = scareTick(
			{
				now,
				nextAt,
				phase: phase(),
				dir: dir(),
				shopOpen: shopOpen(),
				active,
				prevKind: lastKind
			},
			rng
		);
		nextAt = decision.nextAt;
		if (decision.kind) begin(decision.kind);
		raf = requestAnimationFrame(frame);
	}

	onMount(() => {
		findKids();
		if (kidsEl) kidsEl.classList.add(SCARE_ARMED_CLASS);

		const loadedAt = nowMs();
		nextAt = loadedAt + firstDelayMs;
		if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);

		// The prototype's `window.Scares` dev/smoke hook, kept for parity.
		(window as Window & { Scares?: ScaresHandle }).Scares = { trigger, cancel };
	});

	onDestroy(() => {
		const wasActive = active;
		if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
		raf = 0;
		reset();
		active = false;
		if (wasActive) notify(false);
		const w = window as Window & { Scares?: ScaresHandle };
		if (typeof window !== 'undefined' && w.Scares) delete w.Scares;
	});
</script>

<!-- The scare layer: full stage, click-through (prototype `.scare-layer`). The
     monster/sky nodes carry their own z-indices: the monster rides under the
     kids (z 4), the veil dims over them (z 9), the thunder flash over the veil
     (z 10). -->
<div class="scare-layer" bind:this={layerEl} aria-hidden="true">
	<div class="scare-veil" class:in={veilIn}>
		<div class="scare-dim"></div>
		<div class="scare-wash"></div>
	</div>

	{#if monster}
		<div
			class="scare-monster scare-{monster.kind}"
			style="top: {monster.top}px"
			style:transform="translateX({x}px)"
		>
			<!-- trusted static SVG from the validated scares pack -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html monster.svg}
		</div>
	{/if}

	{#if sky}
		<div class="scare-sky" class:in={skyIn}>
			<div class="scare-cloud">
				<!-- trusted static SVG from the validated scares pack -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html CLOUD_SVG}
			</div>
			<!-- trusted static SVG from the validated scares pack -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html BOLT_SVG}
			<div class="scare-flash"></div>
		</div>
	{/if}
</div>

<style>
	/* The prototype's injected `Scares` stylesheet (`pieces/scares.js` ~69-163),
	 * ported selector-for-selector. The monster bodies arrive through `{@html}`,
	 * so their life classes are reached with `:global(...)` — still anchored to
	 * this component's own scoped nodes. */

	.scare-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
	}

	/* Soft moonlit halo so the mid-distance silhouette reads against the sky. */
	.scare-monster {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 4;
		pointer-events: none;
		will-change: transform;
		background: radial-gradient(
			ellipse 70% 60% at 50% 44%,
			rgba(255, 236, 207, 0.42),
			rgba(255, 236, 207, 0) 75%
		);
	}

	.scare-monster :global(svg) {
		display: block;
	}

	.scare-veil {
		position: absolute;
		inset: 0;
		z-index: 9;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.45s ease;
		border-radius: inherit;
	}

	.scare-veil.in {
		opacity: 1;
	}

	.scare-dim {
		position: absolute;
		inset: 0;
		background: rgba(14, 8, 32, 0.4);
	}

	.scare-wash {
		position: absolute;
		inset: 0;
		opacity: 0;
		mix-blend-mode: screen;
		background: linear-gradient(
			120deg,
			rgba(122, 92, 255, 0.42),
			rgba(127, 176, 105, 0.34) 55%,
			rgba(122, 92, 255, 0.3)
		);
	}

	.scare-veil.in .scare-wash {
		animation: scare-wash 1.5s ease-in-out infinite;
	}

	@keyframes scare-wash {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.55;
		}
	}

	/* monster life (killed under reduced motion) */
	.scare-monster.scare-witch :global(.scare-bob) {
		animation: scare-bob 1.15s ease-in-out infinite alternate;
	}

	@keyframes scare-bob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-5px);
		}
	}

	.scare-monster.scare-wolf :global(.scare-dash) {
		animation: scare-dash 0.3s ease-in-out infinite alternate;
	}

	@keyframes scare-dash {
		from {
			transform: rotate(-2.6deg);
		}
		to {
			transform: rotate(2.6deg);
		}
	}

	.scare-monster.scare-vampire :global(.scare-glide) {
		animation: scare-glide 1.6s ease-in-out infinite alternate;
	}

	@keyframes scare-glide {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(4px);
		}
	}

	.scare-monster.scare-vampire :global(.scare-cape) {
		transform-box: fill-box;
		transform-origin: 82% 8%;
		animation: scare-cape 1.05s ease-in-out infinite alternate;
	}

	@keyframes scare-cape {
		from {
			transform: rotate(-7deg);
		}
		to {
			transform: rotate(8deg);
		}
	}

	/* skeleton: comedic loose-limbed waddle + alternating steps */
	.scare-monster.scare-skeleton :global(.scare-walk) {
		animation: scare-walk 0.5s ease-in-out infinite alternate;
	}

	@keyframes scare-walk {
		from {
			transform: translateY(0) rotate(-2deg);
		}
		to {
			transform: translateY(-4px) rotate(2deg);
		}
	}

	.scare-monster.scare-skeleton :global(.leg-l),
	.scare-monster.scare-skeleton :global(.leg-r) {
		animation: scare-step 0.5s ease-in-out infinite alternate;
	}

	.scare-monster.scare-skeleton :global(.leg-r) {
		animation-delay: -0.5s;
	}

	@keyframes scare-step {
		from {
			transform: rotate(-15deg);
		}
		to {
			transform: rotate(15deg);
		}
	}

	.scare-monster.scare-skeleton :global(.arm-l),
	.scare-monster.scare-skeleton :global(.arm-r) {
		animation: scare-swing 0.5s ease-in-out infinite alternate;
	}

	.scare-monster.scare-skeleton :global(.arm-r) {
		animation-delay: -0.5s;
	}

	@keyframes scare-swing {
		from {
			transform: rotate(11deg);
		}
		to {
			transform: rotate(-11deg);
		}
	}

	.scare-monster.scare-skeleton :global(.jaw) {
		animation: scare-jaw 0.7s ease-in-out infinite alternate;
	}

	@keyframes scare-jaw {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(6deg);
		}
	}

	/* mummy: stiff-legged shuffle + flapping bandage tail */
	.scare-monster.scare-mummy :global(.scare-shuffle) {
		animation: scare-shuffle 0.6s ease-in-out infinite alternate;
	}

	@keyframes scare-shuffle {
		from {
			transform: translate(0, 0) rotate(-1.5deg);
		}
		to {
			transform: translate(2px, -2px) rotate(1.5deg);
		}
	}

	.scare-monster.scare-mummy :global(.scare-bandage) {
		transform-box: fill-box;
		transform-origin: 100% 50%;
		animation: scare-bandage 0.9s ease-in-out infinite alternate;
	}

	@keyframes scare-bandage {
		from {
			transform: rotate(-12deg);
		}
		to {
			transform: rotate(14deg);
		}
	}

	/* sky event: thunder — cloud slides in, ONE bolt, ONE soft flash (never a strobe) */
	.scare-sky {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.scare-cloud {
		position: absolute;
		left: 0;
		top: 24px;
		width: 460px;
		will-change: transform;
		transform: translateX(-480px);
	}

	.scare-sky.in .scare-cloud {
		animation: scare-cloud 1.7s ease-in-out forwards;
	}

	@keyframes scare-cloud {
		0% {
			transform: translateX(-480px);
		}
		55% {
			transform: translateX(150px);
		}
		100% {
			transform: translateX(660px);
		}
	}

	/* the bolt is injected through `{@html}`, so it is reached with :global */
	.scare-sky :global(.scare-bolt) {
		position: absolute;
		left: 230px;
		top: 58px;
		width: 120px;
		height: 200px;
		opacity: 0;
		will-change: transform, opacity;
	}

	.scare-sky.in :global(.scare-bolt) {
		animation: scare-bolt 1.7s linear forwards;
	}

	@keyframes scare-bolt {
		0%,
		26% {
			opacity: 0;
			transform: scale(0.94);
		}
		32%,
		66% {
			opacity: 1;
			transform: scale(1);
		}
		74%,
		100% {
			opacity: 0;
		}
	}

	.scare-flash {
		position: absolute;
		inset: 0;
		opacity: 0;
		z-index: 10;
		mix-blend-mode: screen;
		background: radial-gradient(
			ellipse 72% 56% at 30% 16%,
			rgba(255, 246, 221, 0.9),
			rgba(255, 246, 221, 0.38) 46%,
			rgba(255, 246, 221, 0) 74%
		);
	}

	.scare-sky.in .scare-flash {
		animation: scare-flash 0.6s ease-out 1 forwards;
	}

	@keyframes scare-flash {
		0% {
			opacity: 0;
		}
		18% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
		}
	}

	/* Reduced motion (spec §10/§12): dim + crossing only. The wash, every
	 * monster life loop and the thunder flash die; the bolt + cloud appear
	 * statically, so there is not one flash frame. */
	@media (prefers-reduced-motion: reduce) {
		.scare-wash {
			display: none !important;
		}

		.scare-monster.scare-witch :global(.scare-bob),
		.scare-monster.scare-wolf :global(.scare-dash),
		.scare-monster.scare-vampire :global(.scare-glide),
		.scare-monster.scare-vampire :global(.scare-cape),
		.scare-monster.scare-skeleton :global(.scare-walk),
		.scare-monster.scare-skeleton :global(.leg-l),
		.scare-monster.scare-skeleton :global(.leg-r),
		.scare-monster.scare-skeleton :global(.arm-l),
		.scare-monster.scare-skeleton :global(.arm-r),
		.scare-monster.scare-skeleton :global(.jaw),
		.scare-monster.scare-mummy :global(.scare-shuffle),
		.scare-monster.scare-mummy :global(.scare-bandage) {
			animation: none !important;
		}

		.scare-flash {
			display: none !important;
		}

		.scare-sky.in .scare-cloud {
			animation: none !important;
			transform: translateX(150px);
		}

		.scare-sky.in :global(.scare-bolt) {
			animation: none !important;
			opacity: 1;
		}
	}
</style>
