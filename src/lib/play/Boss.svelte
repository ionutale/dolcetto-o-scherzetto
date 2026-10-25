<script lang="ts">
	/**
	 * T7 — the friendly candy fight (spec §2, §4, §5, §10).
	 *
	 * The overlay stages one fight above the paused world: a veil, the boss's
	 * body, the name + HP plate, the hint, the candy flights and the win beat.
	 * The *rules* are elsewhere — `boss-model.ts` picks the threshold and the
	 * cast, `loop.ts` owns the wallet (`SPEND_CANDY` / `BOSS_REWARD`) — so this
	 * component owns only the fight's local life: `hp`, the
	 * `enter → fight → win → leave` phases, the projectile pool and the shower.
	 *
	 * **The tap contract.** `#bossTap` is a real full-stage `<button>`, so a
	 * pointer tap and Space/Enter both land on `onclick`. A throw is accepted
	 * only while `phase === 'fight'`, `hp > 0` and the bag is non-empty; it
	 * calls `onThrow()` **first** and counts the hit only when the page says
	 * the wallet allowed it — the component never assumes a spend.
	 *
	 * **The win is final and once.** The 30th accepted throw sets `hp = 0`,
	 * calls `win()`: `phase = 'win'`, the shower starts, the `theatre-laugh`
	 * plays, `onWin()` fires (the page awards +60 and records the threshold),
	 * then ~1.2 s later the boss leaves and ~0.7 s after that `onExit()` hands
	 * the page back. A `won` latch makes a second call a no-op, so a stray tap
	 * in the same tick can never award twice.
	 *
	 * **Bounds.** At most 8 cosmetic flights exist at once (a fast tap beyond
	 * that still counts, it just has no candy in the air); the shower is 12
	 * pieces; every timer is tracked and cleared on destroy. The stealth rule
	 * for this feature is "no new canvas work": this is all DOM/SVG above the
	 * stage, and the world is frozen by the page's `STOP`.
	 *
	 * **Reduced motion** (spec §10). The `rm` flag is read once in `onMount`
	 * and only gates the JS-driven cosmetic beat (the candy flight is skipped
	 * entirely); the entry/idle/win loops are left to the stylesheet's
	 * `@media` block, which shortens the entry to a fade, drops the bob, the
	 * hint pulse and the confetti fall. The fight stays fully playable.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { candySvg } from '$lib/art/sprites/candy';
	import { lang } from '$lib/state/game.svelte';
	import type { CandyType } from '$lib/sim/loop';
	import { BOSS_COPY, BOSS_META, bossArt } from './boss-art';
	import { BOSS_HP } from './boss-model';
	import type { BossId } from './boss-model';

	interface Props {
		/** Which of the three bodies this fight stages. */
		id: BossId;
		/** The wallet right now — a throw needs at least one candy. */
		bag: number;
		/** Spend one candy; `false` when the wallet refused (never count a hit). */
		onThrow: () => boolean;
		/** The 30th hit landed — award the reward and record the win (once). */
		onWin: () => void;
		/** The exit beat is over — the page clears the fight and restores the world. */
		onExit: () => void;
		/** Cue hook (T27's `playCue`); a no-op so the overlay never needs audio. */
		sound?: (cue: string) => void;
	}
	let { id, bag, onThrow, onWin, onExit, sound = () => {} }: Props = $props();

	/** The four overlay phases; the page only ever sees this component. */
	type BossPhase = 'enter' | 'fight' | 'win' | 'leave';

	/* ---- timings (spec §6) ---- */
	const ENTRY_MS = 900;
	const HIT_MS = 160;
	const WIN_BEAT_MS = 1200;
	const EXIT_MS = 700;

	/* ---- stage geometry (task-7 layout) ---- */
	/** The duo's hand — where every candy leaves from. */
	const SHOT_X = 320;
	const SHOT_Y = 300;
	/** The boss's mouth anchor, stage px (the art box is at right 110 / bottom 56). */
	const MOUTH_X = 625;
	const MOUTH_Y = 205;
	/** Cosmetic flights alive at once (spec §4/§11). */
	const SHOT_CAP = 8;
	/** Reward-shower pieces (spec §11 bounds: ≤ 12). */
	const SHOWER_PIECES = 12;

	const CANDY_TYPES: CandyType[] = ['lolli', 'gummy', 'choco', 'toffee', 'corn', 'star'];

	let hp = $state(BOSS_HP);
	let phase = $state<BossPhase>('enter');
	let shower = $state<ShowerPiece[]>([]);
	/** The 160 ms hit class on the body (restarted on every accepted throw). */
	let bonking = $state(false);
	/** The 30th hit already did its work — the exact-once latch. */
	let won = false;

	/** Sequence for restarting the squash when taps arrive faster than 160 ms. */
	let hitSeq = 0;
	/** `prefers-reduced-motion`, read once on mount (JS-driven beats only). */
	let rm = false;

	/** One cosmetic candy in the air. */
	interface Shot {
		key: number;
		type: CandyType;
	}
	/** One falling reward candy. */
	interface ShowerPiece {
		key: number;
		type: CandyType;
		left: number;
		delay: number;
		duration: number;
	}

	let shots = $state<Shot[]>([]);
	let nextKey = 0;

	/** Every live timer — all cleared on destroy. A plain array: no template
	 * reads it, so it needs no runes (the timer set is small and short-lived). */
	const timers: ReturnType<typeof setTimeout>[] = [];
	function later(ms: number, fn: () => void): void {
		const timer = setTimeout(() => {
			const i = timers.indexOf(timer);
			if (i >= 0) timers.splice(i, 1);
			fn();
		}, ms);
		timers.push(timer);
	}

	/** The language's chrome strings; `lang()` keeps them live. */
	const copy = $derived(BOSS_COPY[lang()]);
	/** The rotation's name in the run's language. */
	const name = $derived(BOSS_META[id].name[lang()]);
	/** The HP fill, in percent (the meter's visual). */
	const fill = $derived(Math.max(0, Math.round((hp / BOSS_HP) * 100)));
	/** The hidden announcement of the win + reward (spec §10). */
	const announcement = $derived(phase === 'win' ? `${copy.win} ${copy.reward}` : '');

	onMount(() => {
		try {
			rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		} catch {
			/* no matchMedia: play the full beat */
		}
		sound('theatre-setup');
		later(ENTRY_MS, () => {
			phase = 'fight';
		});
	});

	onDestroy(() => {
		for (const timer of timers) clearTimeout(timer);
		timers.length = 0;
	});

	/**
	 * The 160 ms squash. The old class is dropped and the new one applied after
	 * a `tick()`, so a tap that arrives while the previous squash is still
	 * playing restarts it instead of stretching one long wobble. If a newer tap
	 * wins the race, the stale continuation stands down. Under reduced motion
	 * the media block turns the same class into a subtle dim.
	 */
	async function pulseHit(): Promise<void> {
		const seq = ++hitSeq;
		bonking = false;
		await tick();
		if (seq !== hitSeq) return;
		bonking = true;
		later(HIT_MS, () => {
			if (seq === hitSeq) bonking = false;
		});
	}

	/** One cosmetic flight, capped; the hit already counted either way. */
	function spawnShot(): void {
		if (rm || shots.length >= SHOT_CAP) return;
		const shot: Shot = {
			key: nextKey++,
			type: CANDY_TYPES[Math.floor(Math.random() * CANDY_TYPES.length)]
		};
		shots = [...shots, shot];
		// `animationend` is the normal exit; this timer is the safety net for a
		// hidden tab (animations do not run) so the pool can never fill up.
		later(700, () => dropShot(shot.key));
	}

	function dropShot(key: number): void {
		shots = shots.filter((s) => s.key !== key);
	}

	/** The win shower — 12 bounded pieces, spread across the stage. */
	function startShower(): void {
		shower = Array.from({ length: SHOWER_PIECES }, (_, i) => ({
			key: i,
			type: CANDY_TYPES[i % CANDY_TYPES.length],
			left: 300 + ((i * 47) % 500),
			delay: (i % 4) * 80,
			duration: 700 + (i % 3) * 140
		}));
	}

	/** The only accepted path to a hit — see the tap contract above. */
	function throwCandy(): void {
		if (phase !== 'fight' || hp <= 0 || bag <= 0) return;
		if (!onThrow()) return;
		hp -= 1;
		sound('pop');
		void pulseHit();
		spawnShot();
		if (hp === 0) win();
	}

	/** The final beat, exactly once: win → leave → page hand-back. */
	function win(): void {
		if (won) return;
		won = true;
		phase = 'win';
		startShower();
		sound('theatre-laugh');
		onWin();
		later(WIN_BEAT_MS, () => {
			phase = 'leave';
			later(EXIT_MS, onExit);
		});
	}
</script>

<div id="bossLayer" class="boss-layer" data-boss={id} data-phase={phase}>
	<div class="veil" aria-hidden="true"></div>

	<!-- The whole stage throws: a real button, keyboard-activatable by default. -->
	<button type="button" id="bossTap" class="tap" aria-label={copy.throwLabel} onclick={throwCandy}
	></button>

	<div class="plate">
		<div id="bossName" class="name">{name}</div>
		<div
			class="meter"
			role="progressbar"
			aria-label={name}
			aria-valuemin="0"
			aria-valuemax={BOSS_HP}
			aria-valuenow={hp}
		>
			<i class="fill" style="width: {fill}%"></i>
		</div>
		<div class="hp" aria-hidden="true">{hp} / {BOSS_HP}</div>
	</div>

	<!-- The boss body: static SVG art, never a pointer target. -->
	<div class="boss-art" class:bonking aria-hidden="true">
		<!-- trusted static SVG from the validated art module -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html bossArt(id)}
	</div>

	{#if phase === 'enter' || phase === 'fight'}
		<div class="hint">{copy.hint}</div>
	{/if}

	<!-- Cosmetic candy flights; the hit has already landed. -->
	<div class="shots" aria-hidden="true">
		{#each shots as shot (shot.key)}
			<span
				class="shot"
				style="--dx: {MOUTH_X - SHOT_X}px; --dy: {MOUTH_Y - SHOT_Y}px"
				onanimationend={() => dropShot(shot.key)}
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html candySvg(shot.type)}
			</span>
		{/each}
	</div>

	{#if shower.length > 0}
		<div class="shower" aria-hidden="true">
			{#each shower as piece (piece.key)}
				<i
					style="left: {piece.left}px; animation-delay: {piece.delay}ms; animation-duration: {piece.duration}ms"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html candySvg(piece.type)}
				</i>
			{/each}
		</div>
	{/if}

	{#if phase === 'win'}
		<div id="bossWin" class="win">
			<span class="win-title">{copy.win}</span>
			<span class="win-reward">{copy.reward}</span>
		</div>
	{/if}

	<!-- The win + reward, announced once for a screen reader (spec §10). -->
	<span class="visually-hidden" role="status" aria-live="polite">{announcement}</span>
</div>

<style>
	/* The overlay's own stacking context: above the world, below the HUD (13)
	   and the rotate button (11), so home/bag/rotate stay reachable. */
	.boss-layer {
		position: absolute;
		inset: 0;
		z-index: 10;
		overflow: hidden;
	}

	.veil {
		position: absolute;
		inset: 0;
		background: rgba(12, 7, 30, 0.35);
		pointer-events: none;
		animation: veil-in 0.4s ease both;
	}

	/* A full-stage, invisible throw surface. */
	.tap {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		pointer-events: auto;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.tap:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: -8px;
	}

	/* The name + HP plate, top-centre (the HUD keeps both corners). */
	.plate {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		padding: 8px 18px 9px;
		border-radius: 18px;
		background: color-mix(in srgb, var(--night-0) 66%, transparent);
		border: 1px solid var(--cream-line);
		backdrop-filter: blur(6px);
		color: var(--cream);
		pointer-events: none;
		white-space: nowrap;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.meter {
		width: 184px;
		height: 10px;
		border-radius: var(--r-pill);
		background: rgba(255, 246, 229, 0.18);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--amber), var(--amber-deep));
		transition: width 0.12s ease;
	}

	.hp {
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		opacity: 0.9;
	}

	/* The body: fixed task-7 box, no pointer target (the tap surface sits under
	   it), animated as one silhouette so ears, crown and arms move together. */
	.boss-art {
		position: absolute;
		right: 110px;
		bottom: 56px;
		width: 260px;
		height: 280px;
		pointer-events: none;
		transform-origin: 50% 70%;
	}

	.boss-art :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	[data-phase='enter'] .boss-art {
		animation: boss-in 900ms cubic-bezier(0.22, 1.15, 0.36, 1) both;
	}

	[data-phase='fight'] .boss-art {
		animation: boss-bob 2.6s ease-in-out infinite;
	}

	[data-phase='win'] .boss-art {
		animation: boss-happy 900ms ease-in-out both;
	}

	[data-phase='leave'] .boss-art {
		animation: boss-out 700ms ease-in both;
	}

	/* Hit squash — after the phase rules, so it wins the tie on a fight frame. */
	.boss-art.bonking {
		animation: boss-squash 160ms ease-out;
	}

	/* The fight's one line of instruction, bottom-centre. */
	.hint {
		position: absolute;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		padding: 8px 16px;
		border-radius: var(--r-pill);
		background: color-mix(in srgb, var(--night-0) 62%, transparent);
		border: 1px solid var(--cream-line);
		color: var(--cream);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
		animation: hint-pulse 1.8s ease-in-out infinite;
	}

	.shots,
	.shower {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* A candy in the air: starts at the duo's hand, arcs to the mouth. */
	.shot {
		position: absolute;
		left: 320px;
		top: 300px;
		width: 26px;
		height: 26px;
		display: block;
		animation: shot-arc 460ms cubic-bezier(0.25, 0.7, 0.45, 1) forwards;
	}

	.shot :global(svg),
	.shower :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* The reward shower: bounded pieces, a short fall, gone before the exit. */
	.shower i {
		position: absolute;
		top: 96px;
		width: 24px;
		height: 24px;
		display: block;
		opacity: 0;
		animation: shower-fall 800ms ease-in forwards;
	}

	/* The win card: the beat's payoff, over the boss, never a pointer target. */
	.win {
		position: absolute;
		top: 46%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 14px 28px;
		border-radius: 24px;
		background: color-mix(in srgb, var(--night-0) 74%, transparent);
		border: 1px solid var(--amber);
		box-shadow: 0 14px 40px var(--shadow-night);
		color: var(--cream);
		pointer-events: none;
		animation: win-pop 0.4s cubic-bezier(0.3, 1.4, 0.6, 1) both;
	}

	.win-title {
		font-size: 26px;
		font-weight: 800;
		color: var(--amber);
	}

	.win-reward {
		font-size: 16px;
		font-weight: 600;
	}

	@keyframes veil-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes boss-in {
		0% {
			opacity: 0;
			transform: translate(170px, -26px) scale(0.8);
		}
		55% {
			opacity: 1;
			transform: translate(-8px, 0) scale(1.04);
		}
		72% {
			transform: translate(0, -6px) scale(0.99);
		}
		100% {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes boss-bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-7px);
		}
	}

	@keyframes boss-squash {
		0% {
			transform: scale(1);
		}
		40% {
			transform: translateY(6px) scale(1.06, 0.9);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes boss-happy {
		0% {
			transform: rotate(0) scale(1);
		}
		30% {
			transform: rotate(-7deg) scale(1.07);
		}
		70% {
			transform: rotate(352deg) scale(1.02);
		}
		100% {
			transform: rotate(360deg) scale(1);
		}
	}

	@keyframes boss-out {
		to {
			opacity: 0;
			transform: translateX(190px) scale(0.92);
		}
	}

	@keyframes hint-pulse {
		50% {
			transform: translateX(-50%) scale(1.04);
		}
	}

	@keyframes shot-arc {
		0% {
			transform: translate(0, 0) rotate(0) scale(0.85);
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		55% {
			transform: translate(calc(var(--dx) * 0.55), calc(var(--dy) * 0.55 - 70px)) rotate(190deg)
				scale(1.1);
		}
		100% {
			transform: translate(var(--dx), var(--dy)) rotate(380deg) scale(0.7);
			opacity: 0;
		}
	}

	@keyframes shower-fall {
		0% {
			opacity: 0;
			transform: translateY(-30px) rotate(0);
		}
		12% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translateY(270px) rotate(220deg);
		}
	}

	@keyframes win-pop {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	/* Reduced motion: the fight is untouched, the show is a fade. The bob, the
	   hint pulse and the confetti fall are dropped; the hit keeps a subtle
	   dim; the entry/win/exit become short fades (spec §10). */
	@media (prefers-reduced-motion: reduce) {
		.veil {
			animation: none;
		}

		[data-phase='fight'] .boss-art {
			animation: none;
		}

		[data-phase='enter'] .boss-art {
			animation: boss-in-reduced 240ms ease-out both;
		}

		[data-phase='win'] .boss-art {
			animation: boss-win-reduced 300ms ease both;
		}

		[data-phase='leave'] .boss-art {
			animation: boss-out-reduced 240ms ease both;
		}

		.boss-art.bonking {
			animation: boss-hit-reduced 160ms ease-out;
		}

		.hint {
			animation: none;
		}

		.shot,
		.shower {
			display: none;
		}

		.win {
			animation: win-fade 0.25s ease both;
		}
	}

	@keyframes boss-in-reduced {
		from {
			opacity: 0;
			transform: translateX(18px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes boss-hit-reduced {
		50% {
			opacity: 0.82;
		}
	}

	@keyframes boss-win-reduced {
		from {
			opacity: 1;
		}
		to {
			opacity: 0.92;
		}
	}

	@keyframes boss-out-reduced {
		to {
			opacity: 0;
		}
	}

	@keyframes win-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
