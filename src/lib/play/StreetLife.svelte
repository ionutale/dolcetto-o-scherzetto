<script lang="ts">
	/**
	 * T37 — firecracker kids, monster stroller, mystery van (+ candy toss).
	 * DOM overlays above the canvas world; schedules live in street-life-model.ts.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { npcCat, npcPumpkin, npcWitchling } from '$lib/art/sprites';
	import { dir, dispatch, phase, shopOpen } from '$lib/state/game.svelte';
	import {
		STROLLER_FROM_X,
		VAN_FROM_X,
		VAN_TOSS_SX,
		VAN_TOSS_SY,
		beatTick,
		firecrackerCount,
		firecrackerDone,
		firecrackerX,
		firstFirecrackerAt,
		firstStrollerAt,
		firstVanAt,
		nextCrossingDir,
		nextFirecrackerAt,
		nextStrollerAt,
		nextVanAt,
		strollerDone,
		strollerNearDuo,
		strollerX,
		vanDone,
		vanProgress,
		vanShouldToss,
		vanX
	} from './street-life-model';
	import type { CrossingDir } from './street-life-model';

	interface Props {
		/** True while a scare cameo owns the street (blocks T37). */
		scareActive?: boolean;
		sound?: (cue: string) => void;
		/** Duo hop flourish during firecrackers. */
		onFirecracker?: () => void;
	}

	let { scareActive = false, sound = () => {}, onFirecracker = () => {} }: Props = $props();

	const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

	let firecrackerOn = $state(false);
	let firecrackerXs = $state<number[]>([]);
	/** The crossing direction currently on screen (flips the kid + props). */
	let firecrackerFace = $state<CrossingDir>(1);
	/** The next crossing's direction — alternates so both are seen. */
	let firecrackerDir: CrossingDir = 1;

	/**
	 * The three costumes the firecracker kids wear — the same validated kid
	 * sprites the NPC pool walks with, so they read as neighbourhood children
	 * rather than abstract capsules (owner feedback, 2026-10-25).
	 */
	const KID_SPRITES = [npcPumpkin(), npcWitchling(), npcCat()];

	let strollerOn = $state(false);
	let strollerPx = $state(STROLLER_FROM_X);
	let strollerWave = $state(false);

	let vanOn = $state(false);
	let vanPx = $state(VAN_FROM_X);

	let nextFire = 0;
	let nextStroll = 0;
	let nextVanDue = 0;

	let pollRaf = 0;
	let fireRaf = 0;
	let strollRaf = 0;
	let vanRaf = 0;

	function gate(active: boolean) {
		return {
			phase: phase(),
			dir: dir(),
			shopOpen: shopOpen(),
			scareActive,
			active
		};
	}

	function runFirecracker(): void {
		if (firecrackerOn) return;
		firecrackerOn = true;
		const direction = firecrackerDir;
		firecrackerDir = nextCrossingDir(firecrackerDir);
		firecrackerFace = direction;
		const n = firecrackerCount(Math.random);
		firecrackerXs = Array.from({ length: n }, (_, i) => firecrackerX(-i * 90, direction));
		sound('pop');
		onFirecracker();
		const started = now();
		let sparkAt = started + 400;
		const step = (): void => {
			const elapsed = now() - started;
			firecrackerXs = firecrackerXs.map((_, i) => firecrackerX(elapsed - i * 90, direction));
			if (now() >= sparkAt && !firecrackerDone(elapsed)) {
				sound('twinkle');
				sparkAt = now() + 350 + Math.random() * 200;
			}
			if (firecrackerDone(elapsed)) {
				firecrackerOn = false;
				firecrackerXs = [];
				fireRaf = 0;
				return;
			}
			fireRaf = requestAnimationFrame(step);
		};
		fireRaf = requestAnimationFrame(step);
	}

	function runStroller(): void {
		if (strollerOn) return;
		strollerOn = true;
		strollerWave = false;
		strollerPx = STROLLER_FROM_X;
		sound('passer');
		const started = now();
		const step = (): void => {
			const elapsed = now() - started;
			strollerPx = strollerX(elapsed);
			if (!strollerWave && strollerNearDuo(strollerPx)) strollerWave = true;
			if (strollerDone(elapsed)) {
				strollerOn = false;
				strollerWave = false;
				strollerPx = STROLLER_FROM_X;
				strollRaf = 0;
				return;
			}
			strollRaf = requestAnimationFrame(step);
		};
		strollRaf = requestAnimationFrame(step);
	}

	function runVan(): void {
		if (vanOn) return;
		vanOn = true;
		vanPx = VAN_FROM_X;
		sound('passer');
		const started = now();
		let tossed = false;
		let prev = 0;
		const step = (): void => {
			const elapsed = now() - started;
			const prog = vanProgress(elapsed);
			vanPx = vanX(elapsed);
			if (!tossed && vanShouldToss(prev, prog)) {
				tossed = true;
				sound('coin');
				dispatch({ type: 'AMBIENT_CANDY', sx: VAN_TOSS_SX, sy: VAN_TOSS_SY });
			}
			prev = prog;
			if (vanDone(elapsed)) {
				vanOn = false;
				vanPx = VAN_FROM_X;
				vanRaf = 0;
				return;
			}
			vanRaf = requestAnimationFrame(step);
		};
		vanRaf = requestAnimationFrame(step);
	}

	function poll(): void {
		const t = now();

		const f = beatTick(
			{ ...gate(firecrackerOn), now: t, nextAt: nextFire },
			nextFirecrackerAt,
			Math.random
		);
		nextFire = f.nextAt;
		if (f.fire) runFirecracker();

		const s = beatTick(
			{ ...gate(strollerOn), now: t, nextAt: nextStroll },
			nextStrollerAt,
			Math.random
		);
		nextStroll = s.nextAt;
		if (s.fire) runStroller();

		const v = beatTick({ ...gate(vanOn), now: t, nextAt: nextVanDue }, nextVanAt, Math.random);
		nextVanDue = v.nextAt;
		if (v.fire) runVan();

		pollRaf = requestAnimationFrame(poll);
	}

	onMount(() => {
		const t0 = now();
		nextFire = firstFirecrackerAt(t0);
		nextStroll = firstStrollerAt(t0);
		nextVanDue = firstVanAt(t0);
		pollRaf = requestAnimationFrame(poll);
	});

	onDestroy(() => {
		if (pollRaf) cancelAnimationFrame(pollRaf);
		if (fireRaf) cancelAnimationFrame(fireRaf);
		if (strollRaf) cancelAnimationFrame(strollRaf);
		if (vanRaf) cancelAnimationFrame(vanRaf);
	});
</script>

<div class="street-life" aria-hidden="true">
	{#if firecrackerOn}
		{#each firecrackerXs as x, i (i)}
			<div
				class="firekid walking"
				style={`transform: translateX(${x}px) scaleX(${firecrackerFace})`}
			>
				<span class="body">
					<!-- trusted static SVG from the validated sprite pack -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html KID_SPRITES[i % KID_SPRITES.length]}
				</span>
				<span class="held"></span>
				<i class="toss t1"></i>
				<i class="toss t2"></i>
				<i class="pop p1"></i>
				<i class="pop p2"></i>
				<i class="shadow"></i>
			</div>
		{/each}
	{/if}

	{#if strollerOn}
		<div
			class="stroller"
			class:wave={strollerWave}
			style={`transform: translateX(${strollerPx}px)`}
		>
			<div class="buggy">
				<div class="hood"></div>
				<div class="baby"></div>
				<div class="wheel w1"></div>
				<div class="wheel w2"></div>
			</div>
		</div>
	{/if}

	{#if vanOn}
		<div class="van" style={`transform: translateX(${vanPx}px)`}>
			<div class="cab"></div>
			<div class="box"><span class="mark"></span></div>
			<div class="wheel w1"></div>
			<div class="wheel w2"></div>
		</div>
	{/if}
</div>

<style>
	.street-life {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 6;
		overflow: hidden;
	}

	.firekid {
		position: absolute;
		bottom: 72px;
		left: 0;
		width: 45px;
		height: 58px;
		will-change: transform;
		filter: drop-shadow(0 4px 6px var(--shadow-night));
	}

	/* The validated kid sprite at 0.8 scale (56×72 → 45×58). The pack's
	   `.walking` hooks animate the legs/arms/body because the wrapper carries
	   the class — the same contract Npcs.svelte uses. */
	.firekid .body {
		display: block;
		width: 45px;
	}

	.firekid :global(svg.sprite) {
		display: block;
		width: 45px;
		height: auto;
	}

	/* The lit firecracker in the forward hand: cream band, red stick, spark. */
	.held {
		position: absolute;
		left: 35px;
		top: 28px;
		width: 5px;
		height: 14px;
		border-radius: 2.5px;
		background: linear-gradient(180deg, var(--cream) 0 3px, #e25b4a 3px 10px, #c04436 10px);
		box-shadow: 0 0 7px color-mix(in srgb, var(--amber) 55%, transparent);
		transform: rotate(18deg);
		transform-origin: 50% 85%;
	}

	.held::before {
		content: '';
		position: absolute;
		left: 2px;
		top: -5px;
		width: 6px;
		height: 7px;
		border-top: 1.5px solid #e8dcc6;
		border-right: 1.5px solid #e8dcc6;
		border-radius: 0 4px 0 0;
		transform: rotate(-10deg);
	}

	.held::after {
		content: '';
		position: absolute;
		right: -3px;
		top: -9px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--amber);
		box-shadow:
			0 0 6px 2px color-mix(in srgb, var(--amber) 85%, transparent),
			0 0 14px 4px color-mix(in srgb, var(--amber) 35%, transparent);
		animation: fuseFlicker 0.32s ease-in-out infinite alternate;
	}

	/* Two tossed crackers per 1.2 s: they arc forward and drop out of frame. */
	.toss {
		position: absolute;
		left: 37px;
		top: 30px;
		width: 4px;
		height: 11px;
		border-radius: 2px;
		background: linear-gradient(180deg, var(--cream) 0 2px, #e25b4a 2px 8px, #c04436 8px);
		opacity: 0;
		animation: kidToss 1.2s cubic-bezier(0.25, 0.7, 0.45, 1) infinite;
	}

	.toss::after {
		content: '';
		position: absolute;
		left: 0;
		top: -4px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--amber);
		box-shadow: 0 0 5px 1px var(--amber);
	}

	.toss.t2 {
		animation-delay: 0.6s;
	}

	/* The landing burst: a four-point amber sparkle where the cracker lands. */
	.pop {
		position: absolute;
		left: 37px;
		top: 30px;
		width: 20px;
		height: 20px;
		background: var(--amber);
		clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
		filter: drop-shadow(0 0 5px var(--amber));
		opacity: 0;
		animation: kidPop 1.2s ease-out infinite;
	}

	.pop.p2 {
		animation-delay: 0.6s;
	}

	.firekid .shadow {
		position: absolute;
		bottom: -2px;
		left: 8px;
		width: 29px;
		height: 6px;
		border-radius: 50%;
		background: var(--shadow-night);
		filter: blur(2px);
	}

	@keyframes fuseFlicker {
		from {
			transform: scale(0.75);
			opacity: 0.8;
		}
		to {
			transform: scale(1.25);
			opacity: 1;
		}
	}

	@keyframes kidToss {
		0% {
			transform: translate(0, 0) rotate(20deg) scale(0.9);
			opacity: 0;
		}
		8% {
			opacity: 1;
		}
		58% {
			transform: translate(38px, -16px) rotate(200deg) scale(1);
			opacity: 1;
		}
		92% {
			transform: translate(70px, 4px) rotate(340deg) scale(1);
			opacity: 1;
		}
		100% {
			transform: translate(76px, 8px) rotate(360deg) scale(1);
			opacity: 0;
		}
	}

	@keyframes kidPop {
		0%,
		54% {
			transform: translate(70px, 2px) scale(0);
			opacity: 0;
		}
		62% {
			transform: translate(70px, 2px) scale(0.5);
			opacity: 1;
		}
		76% {
			transform: translate(72px, 3px) scale(1.3);
			opacity: 0.95;
		}
		100% {
			transform: translate(74px, 5px) scale(0.1);
			opacity: 0;
		}
	}

	.stroller {
		position: absolute;
		bottom: 58px;
		left: 0;
		will-change: transform;
	}

	.buggy {
		position: relative;
		width: 88px;
		height: 52px;
	}

	.hood {
		position: absolute;
		left: 8px;
		top: 4px;
		width: 56px;
		height: 28px;
		border-radius: 18px 18px 8px 8px;
		background: color-mix(in srgb, #e8924a 80%, #3a2c5f);
		box-shadow: 0 4px 10px color-mix(in srgb, var(--night-0) 35%, transparent);
	}

	.baby {
		position: absolute;
		left: 24px;
		top: 10px;
		width: 22px;
		height: 18px;
		border-radius: 50% 50% 40% 40%;
		background: #6bcf8e;
		box-shadow: inset 0 -4px 0 #3a9a5c;
		transition: transform 0.25s ease;
	}

	.baby::before,
	.baby::after {
		content: '';
		position: absolute;
		top: 6px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--ink);
	}
	.baby::before {
		left: 5px;
	}
	.baby::after {
		right: 5px;
	}

	.stroller.wave .baby {
		transform: translateY(-4px) rotate(-12deg);
	}

	.wheel {
		position: absolute;
		bottom: 0;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #2e2751;
		box-shadow: inset 0 0 0 3px #4e456f;
	}

	.w1 {
		left: 14px;
	}
	.w2 {
		right: 14px;
	}

	.van {
		position: absolute;
		bottom: 62px;
		left: 0;
		width: 110px;
		height: 48px;
		will-change: transform;
	}

	.cab {
		position: absolute;
		left: 0;
		bottom: 10px;
		width: 36px;
		height: 28px;
		border-radius: 8px 4px 4px 8px;
		background: #3a2c5f;
	}

	.box {
		position: absolute;
		left: 32px;
		bottom: 10px;
		width: 70px;
		height: 34px;
		border-radius: 6px;
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 6px 14px color-mix(in srgb, var(--amber) 45%, transparent);
	}

	.mark {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 3px solid var(--ink);
		opacity: 0.55;
	}

	.van .wheel {
		bottom: 0;
	}
	.van .w1 {
		left: 18px;
	}
	.van .w2 {
		left: 78px;
	}

	@media (prefers-reduced-motion: reduce) {
		.held::after,
		.toss,
		.pop,
		.stroller.wave .baby {
			animation: none;
			transform: none;
		}

		.toss,
		.pop {
			opacity: 0;
		}
	}
</style>
