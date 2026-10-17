<script lang="ts">
	/**
	 * The night sky — gradient, moon with craters, 26 twinkling stars.
	 *
	 * Port of the prototype's `.sky` / `.moon` / `.star` rules and of the star
	 * loop inside `buildBackdrops()` (`prototypes/scene-prototype.html`, v2,
	 * lines ~64-74 and ~1106-1113). The stars are a fixed deterministic field
	 * (no `Math.random`) so two renders — and any screenshot diff — agree.
	 *
	 * Every colour is a §3 token. The prototype's gradient stops were six
	 * off-palette purples; they are re-keyed here to the five `--night-*` stops,
	 * and its cream translucencies (`rgba(255,236,207,.28)` / `.12`) map onto the
	 * two cream washes that exist for exactly this (`--cream-line` at .28,
	 * `--cream-soft` at .16) — the same "nearest §3 stop" convention `app.css`
	 * already documents for the body wash. The moon's outer stop becomes
	 * `--lamp`, the palette's warmest light, instead of the prototype's #f5dcae.
	 *
	 * Purely decorative: `pointer-events: none` and hidden from assistive
	 * technology. The twinkle is an ambient loop, so it carries the global
	 * `.reduce-motion-off` utility (app.css) and stops under
	 * `prefers-reduced-motion: reduce`; the moon and the field stay visible.
	 */
	/** 26 stars: x = (i·137 + 60) % 852, y = 18 + (i·53) % 150, size 2-4 px, stagger i % 7. */
	const STARS = Array.from({ length: 26 }, (_, i) => ({
		x: (i * 137 + 60) % 852,
		y: 18 + ((i * 53) % 150),
		size: 2 + (i % 3),
		delay: (i % 7) * 0.45
	}));

	/** The moon's three craters, in the moon's own 70×70 box. */
	const CRATERS = [
		{ left: 15, top: 19, size: 14 },
		{ left: 40, top: 36, size: 8 },
		{ left: 25, top: 45, size: 6 }
	];
</script>

<div class="sky" aria-hidden="true">
	<div class="moon">
		{#each CRATERS as crater, i (i)}
			<i
				style:left="{crater.left}px"
				style:top="{crater.top}px"
				style:width="{crater.size}px"
				style:height="{crater.size}px"
			></i>
		{/each}
	</div>

	{#each STARS as star, i (i)}
		<div
			class="star reduce-motion-off"
			style:left="{star.x}px"
			style:top="{star.y}px"
			style:width="{star.size}px"
			style:height="{star.size}px"
			style:animation-delay="{star.delay}s"
		></div>
	{/each}
</div>

<style>
	.sky {
		position: absolute;
		inset: 0;
		pointer-events: none;
		/* Deep indigo above, warm violet horizon below — the five --night-* stops
		 * in the prototype's proportions. */
		background: linear-gradient(
			180deg,
			var(--night-0) 0%,
			var(--night-1) 34%,
			var(--night-2) 58%,
			var(--night-3) 76%,
			var(--night-4) 100%
		);
	}

	.moon {
		position: absolute;
		top: 34px;
		left: 640px;
		width: 70px;
		height: 70px;
		border-radius: 50%;
		background: radial-gradient(
			circle at 38% 36%,
			var(--moon) 0%,
			var(--glow) 55%,
			var(--lamp) 100%
		);
		box-shadow:
			0 0 44px 14px var(--cream-line),
			0 0 120px 40px var(--cream-soft);
	}

	.moon i {
		position: absolute;
		border-radius: 50%;
		background: var(--amber-deep);
		opacity: 0.4;
	}

	.star {
		position: absolute;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--moon);
		box-shadow: 0 0 8px 2px var(--cream-line);
		box-shadow: 0 0 8px 2px color-mix(in srgb, var(--moon) 65%, transparent);
		animation: twinkle 3.2s ease-in-out infinite;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
