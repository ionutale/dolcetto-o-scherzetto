<script lang="ts">
	/**
	 * Milo & Tino — the duo, ported **verbatim** from
	 * `prototypes/scene-prototype.html`:
	 *
	 * - the `SVG.milo` / `SVG.tino` template strings (lines ~897-964) are inlined
	 *   as markup, every path, colour and hook untouched: Milo is the one in the
	 *   black wizard hat with the wand in his right hand (96 px tall), Tino the
	 *   pumpkin costume carrying the jack-o'-lantern bucket (78 px tall);
	 * - the `.kids` CSS block (lines ~154-168) with its fixed stage placement
	 *   `left: 188px; bottom: 56px`, the two contact shadows and the `bob` /
	 *   `swing` / `legswing` keyframes (0.34 s alternate cycles);
	 * - `renderScene()`'s per-frame wiring (lines ~1737-1741):
	 *
	 *       walking = state.dir !== 0
	 *       flip    = state.dir === 0 ? (dataset.dir || 1) : state.dir
	 *       transform = scaleX(flip)
	 *
	 *   i.e. `.walking` follows the sim's `dir`, and the facing direction is
	 *   *remembered* across a stop (the prototype's `dataset.dir`), so releasing
	 *   a hold leaves the duo facing where they were last walking.
	 *
	 * The SVGs are inlined rather than injected with `{@html}` so Svelte scopes
	 * the `.m-body` / `.arm` / `.leg-l` / `.leg-r` animation hooks on both sides
	 * of the selector — the walk cycle is pure CSS off these class names.
	 *
	 * `dir` comes from the store (`state/game.svelte.ts`), never from this
	 * component: the walking state is whatever the sim says it is. Decorative
	 * (aria-hidden), like the street it stands on.
	 *
	 * Reduced motion (ART-STYLE §4 rule 4): the walk cycle is a bobs/swings
	 * ambient loop, so it owns the kill switch below — the duo still faces and
	 * travels (translation, driven by `worldX`), it just stops bobbing.
	 */
	import type { Dir } from '../sim/loop';

	interface Props {
		/** The sim's walk direction: −1 left, 0 idle, 1 right. */
		dir?: Dir;
	}

	let { dir = 0 }: Props = $props();

	/** Remembered facing — the prototype's `kidsEl.dataset.dir`, defaulted to 1. */
	let facing = $state<Dir>(1);

	// `facing` only ever follows a real direction, so a stop keeps the last one.
	$effect(() => {
		if (dir !== 0) facing = dir;
	});

	/** The `.walking` hook — bound to the sim, exactly like `renderScene()`. */
	const walking = $derived(dir !== 0);
	/** Live direction while walking, remembered facing while idle. */
	const flip = $derived(dir === 0 ? facing : dir);
</script>

<div class="kids" class:walking aria-hidden="true" style="transform: scaleX({flip})">
	<div class="shadow m"></div>
	<div class="shadow t"></div>

	<div class="tino">
		<svg class="t-body" width="66" height="78" viewBox="0 0 66 78">
			<g class="leg-l" style="transform-origin:21px 70px"
				><rect x="18" y="64" width="8" height="13" rx="3.5" fill="#3d3468" /><ellipse
					cx="22"
					cy="77"
					rx="6.4"
					ry="3"
					fill="#2e2751"
				/></g
			>
			<g class="leg-r" style="transform-origin:29px 70px"
				><rect x="26" y="64" width="8" height="13" rx="3.5" fill="#463c74" /><ellipse
					cx="30"
					cy="77"
					rx="6.4"
					ry="3"
					fill="#2e2751"
				/></g
			>
			<path class="arm" d="M10 46 C6 52 5 58 6 63 L11 63 C10 57 11 51 14 47 Z" fill="#ff9e57" />
			<g class="arm" style="transform-origin:43px 48px">
				<path
					d="M41 58 Q46 47 55 58"
					stroke="#b8763d"
					stroke-width="2.4"
					fill="none"
					stroke-linecap="round"
				/>
				<path d="M37 58 H57 L54.6 74 Q47 76.4 39.4 74 Z" fill="#ff9e57" />
				<path d="M37 58 H57 L56.2 61.4 H37.8 Z" fill="#e8874a" />
				<path
					d="M41.5 64.5 L44 66.8 L41.8 69 M48.5 64.5 L51 66.8 L48.8 69 M45 70.6 Q47 72.6 49 70.6"
					stroke="#5c3a22"
					stroke-width="1.6"
					fill="none"
					stroke-linecap="round"
				/>
				<circle cx="43" cy="52" r="4.6" fill="#ffb27a" />
			</g>
			<ellipse cx="26" cy="52" rx="17" ry="18" fill="#ff9e57" />
			<path d="M26 35 C19 41 17 52 19 66 C22 69 26 70 26 70 Z" fill="#f08e48" opacity=".55" />
			<path d="M26 35 C33 41 35 52 33 66 C30 69 26 70 26 70 Z" fill="#e8874a" opacity=".5" />
			<ellipse cx="26" cy="70" rx="14" ry="3.6" fill="#e8874a" opacity=".5" />
			<rect x="23" y="26" width="6" height="9" rx="3" fill="#7fb069" />
			<path d="M28 28 C33 25 36 27 36 30 C33 31 30 30 28 28 Z" fill="#95c47d" />
			<circle cx="26" cy="42" r="12.5" fill="#ffd9b8" />
			<path
				d="M15 40 C17 32 35 32 37 40 C33 36 31 36 30 38.5 C28 35 24 35 22 38.5 C21 36 18 37 15 40 Z"
				fill="#f2d0a0"
			/>
			<circle cx="21.5" cy="43.5" r="1.9" fill="#3a2f4e" />
			<circle cx="30.5" cy="43.5" r="1.9" fill="#3a2f4e" />
			<circle cx="22.1" cy="43" r=".65" fill="#fff" />
			<circle cx="31.1" cy="43" r=".65" fill="#fff" />
			<circle cx="18" cy="47" r="2.3" fill="#ffb8a8" opacity=".85" />
			<circle cx="34" cy="47" r="2.3" fill="#ffb8a8" opacity=".85" />
			<path
				d="M23.5 48 Q26 50.6 28.5 48"
				stroke="#3a2f4e"
				stroke-width="1.5"
				fill="none"
				stroke-linecap="round"
			/>
		</svg>
	</div>

	<div class="milo">
		<svg width="64" height="96" viewBox="0 0 64 96">
			<g class="leg-l" style="transform-origin:26px 86px"
				><ellipse cx="25" cy="91.4" rx="7" ry="3.4" fill="#3d3468" /><ellipse
					cx="25"
					cy="89.8"
					rx="7"
					ry="3.2"
					fill="#2e2751"
				/></g
			>
			<g class="leg-r" style="transform-origin:38px 86px"
				><ellipse cx="39" cy="91.4" rx="7" ry="3.4" fill="#463c74" /><ellipse
					cx="39"
					cy="89.8"
					rx="7"
					ry="3.2"
					fill="#2e2751"
				/></g
			>
			<g class="m-body">
				<path
					d="M32 35.5 C24.5 35.5 20.5 41 17.5 52 C14.5 63.5 12.5 76 11.5 82 C23 87.5 41 87.5 52.5 82 C51.5 76 49.5 63.5 46.5 52 C43.5 41 39.5 35.5 32 35.5 Z"
					fill="#6672df"
				/>
				<path
					d="M32 35.5 C39.5 35.5 43.5 41 46.5 52 C49.5 63.5 51.5 76 52.5 82 C47.5 84.3 42.5 85.4 37.5 85.6 C39.6 72 39.9 53 34.8 36 Z"
					fill="#4a54b0"
					opacity=".45"
				/>
				<path
					d="M13.6 79.6 C22.5 84 41.5 84 50.4 79.6"
					stroke="#4a54b0"
					stroke-width="2"
					fill="none"
					opacity=".4"
				/>
				<path
					d="M31.6 36.5 C31.2 52 32.4 72 32.8 85.6"
					stroke="#4a54b0"
					stroke-width="1.6"
					fill="none"
					opacity=".25"
				/>
				<rect x="17.6" y="53.6" width="28.8" height="5" rx="2.5" fill="#4a54b0" />
				<rect x="28.6" y="52.9" width="6.8" height="6.4" rx="1.8" fill="#ffd166" />
				<path
					d="M31.2 64.6 l1.9 4 4 1.9 -4 1.9 -1.9 4 -1.9 -4 -4 -1.9 4 -1.9 Z"
					fill="#ffd166"
					opacity=".95"
				/>
				<path
					d="M22.6 75 l1.1 2.3 2.3 1.1 -2.3 1.1 -1.1 2.3 -1.1 -2.3 -2.3 -1.1 2.3 -1.1 Z"
					fill="#ffd166"
					opacity=".7"
				/>
				<path
					d="M42.4 72.6 l.9 1.9 1.9 .9 -1.9 .9 -.9 1.9 -.9 -1.9 -1.9 -.9 1.9 -.9 Z"
					fill="#ffd166"
					opacity=".7"
				/>
				<g class="arm" style="transform-origin:22px 40px">
					<path
						d="M22 38 C16 40.5 12.4 46.5 11.6 53 C11.1 57.2 12.8 60.2 16.2 60.4 C19.2 60.6 21.4 58.2 21.8 54.6 C22.3 49.6 23.8 44.6 26.4 41.4 Z"
						fill="#6672df"
					/>
					<path
						d="M11.6 53 C11.1 57.2 12.8 60.2 16.2 60.4 C19.2 60.6 21.4 58.2 21.8 54.6 Z"
						fill="#7c88f0"
					/>
					<circle cx="17" cy="62" r="3.2" fill="#ffd9b8" />
				</g>
				<g class="arm" style="transform-origin:42px 40px">
					<path
						d="M42 38 C48 40.5 51.6 46.5 52.4 53 C52.9 57.2 51.2 60.2 47.8 60.4 C44.8 60.6 42.6 58.2 42.2 54.6 C41.7 49.6 40.2 44.6 37.6 41.4 Z"
						fill="#6672df"
					/>
					<path
						d="M52.4 53 C52.9 57.2 51.2 60.2 47.8 60.4 C44.8 60.6 42.6 58.2 42.2 54.6 Z"
						fill="#7c88f0"
					/>
					<circle cx="47" cy="62" r="3.2" fill="#ffd9b8" />
					<rect
						x="48"
						y="26"
						width="3"
						height="34"
						rx="1.5"
						fill="#e8d9c0"
						transform="rotate(14 49.5 43)"
					/>
					<path d="M56 20 l2.4 5 5 2.4 -5 2.4 -2.4 5 -2.4 -5 -5 -2.4 5 -2.4 Z" fill="#ffd166" />
				</g>
				<circle cx="32" cy="33" r="15" fill="#ffd9b8" />
				<path
					d="M18.5 29.5 C20.5 21.5 43.5 21.5 45.5 29.5 C41.5 25.5 39.5 25.5 37.5 28.5 C35.5 24.5 29.5 24.5 27.5 28.5 C24.5 24.5 21.5 26.5 18.5 29.5 Z"
					fill="#f2d0a0"
				/>
				<circle cx="26.7" cy="34" r="2" fill="#3a2f4e" />
				<circle cx="37.3" cy="34" r="2" fill="#3a2f4e" />
				<circle cx="27.4" cy="33.4" r=".7" fill="#fff" />
				<circle cx="38" cy="33.4" r=".7" fill="#fff" />
				<circle cx="23.2" cy="38" r="2.6" fill="#ffb8a8" opacity=".8" />
				<circle cx="40.8" cy="38" r="2.6" fill="#ffb8a8" opacity=".8" />
				<path
					d="M29.2 40 Q32 42.8 34.8 40"
					stroke="#3a2f4e"
					stroke-width="1.6"
					fill="none"
					stroke-linecap="round"
				/>
				<ellipse cx="32" cy="18.4" rx="21" ry="6.4" fill="#241d45" />
				<path
					d="M11.4 17.4 Q32 23.4 52.6 17.4"
					stroke="#3a3163"
					stroke-width="2"
					fill="none"
					opacity=".9"
				/>
				<path
					d="M20.6 17.4 C21.6 10.5 25.6 3.6 33.4 2.2 C39.6 5.4 43.4 11.4 44 17.4 Z"
					fill="#2e2751"
				/>
				<path
					d="M33.4 2.2 C30.2 4.6 28.2 7.9 27.2 11.4 C29.6 9.2 31.8 6.4 33.4 2.2 Z"
					fill="#3a3163"
				/>
				<path
					d="M33.4 2.2 C36.2 1.6 38.6 2.4 39.8 4.4 C37.6 3.8 35.4 3.2 33.4 2.2 Z"
					fill="#2e2751"
				/>
				<rect x="19.8" y="15.4" width="24.4" height="4.6" rx="2.3" fill="#5d43d6" />
				<path d="M38.6 7.4 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4 Z" fill="#ffd166" />
				<ellipse cx="24" cy="20.6" rx="1.7" ry="1.1" fill="#3a3163" opacity=".8" />
			</g>
		</svg>
	</div>
</div>

<style>
	/* `.kids` block, verbatim from the prototype (stage coordinates). */
	.kids {
		position: absolute;
		left: 188px;
		bottom: 56px;
		width: 120px;
		height: 100px;
		will-change: transform;
		z-index: 5;
	}
	.kids > div {
		position: absolute;
		bottom: 0;
	}
	.kids svg {
		display: block;
	}
	.kids .milo {
		left: 42px;
	}
	.kids .tino {
		left: -6px;
		z-index: 2;
	}
	.kids .shadow {
		position: absolute;
		bottom: -4px;
		height: 8px;
		border-radius: 50%;
		background: rgba(10, 6, 30, 0.35);
		filter: blur(2px);
	}
	.kids .shadow.m {
		left: 46px;
		width: 44px;
	}
	.kids .shadow.t {
		left: 2px;
		width: 36px;
	}

	/* The walk cycle: the `.walking` hooks the sim switches on/off. */
	.kids.walking .m-body,
	.kids.walking .t-body {
		animation: bob 0.34s ease-in-out infinite alternate;
	}
	.kids.walking .arm {
		animation: swing 0.34s ease-in-out infinite alternate;
		transform-origin: top center;
	}
	.kids.walking .tino .arm {
		animation-delay: 0.12s;
	}
	@keyframes bob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-3px);
		}
	}
	@keyframes swing {
		from {
			transform: rotate(-14deg);
		}
		to {
			transform: rotate(14deg);
		}
	}
	.kids.walking .leg-l {
		animation: legswing 0.34s ease-in-out infinite alternate;
	}
	.kids.walking .leg-r {
		animation: legswing 0.34s ease-in-out infinite alternate-reverse;
	}
	@keyframes legswing {
		from {
			transform: rotate(-10deg);
		}
		to {
			transform: rotate(10deg);
		}
	}

	/* The walk cycle is a bobs-and-swings ambient loop: it dies under
	 * `prefers-reduced-motion`, while the travel (a `worldX` translation)
	 * keeps playing. app.css's per-element policy, component-owned switch. */
	@media (prefers-reduced-motion: reduce) {
		.kids.walking .m-body,
		.kids.walking .t-body,
		.kids.walking .arm,
		.kids.walking .leg-l,
		.kids.walking .leg-r {
			animation: none;
		}
	}

	/* ===== T24 — the scary-moment beat =====
	 * `<Scares/>` arms `.scares-armed` once and, for ~2.5 s per cameo, adds
	 * `.scares-stop` to this container and `scare-hug` / `-tremble` / `-peek` /
	 * `-giggle` to `.tino` / `.milo`. The class names and this block are a port
	 * of `prototypes/pieces/scares.js` (~127-163): the classes are added at
	 * runtime, so every selector reaches them with `:global(...)`, still anchored
	 * to these scoped wrappers. */
	.kids:global(.scares-armed) .tino,
	.kids:global(.scares-armed) .milo {
		transform-origin: bottom center;
		will-change: transform;
	}

	/* STOP: kill any host walk/swing animation inside the duo during the beat. */
	.kids:global(.scares-stop) .m-body,
	.kids:global(.scares-stop) .t-body,
	.kids:global(.scares-stop) .arm,
	.kids:global(.scares-stop) .leg-l,
	.kids:global(.scares-stop) .leg-r {
		animation: none !important;
	}

	/* HUG: Tino leans into Milo. `translate`/`rotate`/`scale` are the individual
	 * transform properties, so they compose with `transform` (the tremble/giggle
	 * keyframes) and the parent's facing `scaleX`. */
	.kids :global(.tino.scare-hug) {
		translate: 24px;
		rotate: 9deg;
	}
	.kids :global(.milo.scare-hug) {
		translate: -18px;
		rotate: -7deg;
	}

	/* TREMBLE: subtle shake on `transform` so it composes with the hug. */
	.kids :global(.tino.scare-tremble),
	.kids :global(.milo.scare-tremble) {
		animation: scare-tremble 0.16s linear infinite;
	}
	@keyframes scare-tremble {
		0%,
		100% {
			transform: translate(0, 0);
		}
		20% {
			transform: translate(1.1px, 0.3px);
		}
		40% {
			transform: translate(-1px, -0.2px);
		}
		60% {
			transform: translate(0.9px, 0.4px);
		}
		80% {
			transform: translate(-0.8px, 0);
		}
	}

	/* PEEK: small lean back. */
	.kids :global(.tino.scare-peek) {
		scale: 1.05;
	}
	.kids :global(.milo.scare-peek) {
		scale: 1.03;
	}

	/* GIGGLE: quick bounce. */
	.kids :global(.tino.scare-giggle),
	.kids :global(.milo.scare-giggle) {
		animation: scare-giggle 0.42s cubic-bezier(0.3, 1.5, 0.6, 1) 1;
	}
	@keyframes scare-giggle {
		0% {
			transform: translateY(0) scale(1);
		}
		40% {
			transform: translateY(-7px) scale(1.05);
		}
		100% {
			transform: translateY(0) scale(1);
		}
	}

	/* The tremble is an ambient loop, so it dies under reduced motion (the
	 * prototype's own kill switch); the hug/peek/giggle flourishes stay. */
	@media (prefers-reduced-motion: reduce) {
		.kids :global(.tino.scare-tremble),
		.kids :global(.milo.scare-tremble) {
			animation: none;
		}
	}
</style>
