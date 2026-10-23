<script lang="ts">
	/**
	 * T37 — firecracker kids, monster stroller, mystery van (+ candy toss).
	 * DOM overlays above the canvas world; schedules live in street-life-model.ts.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { dir, dispatch, phase, shopOpen } from '$lib/state/game.svelte';
	import {
		FIRECRACKER_FROM_X,
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
	let firecrackerSparks = $state(false);

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
		const n = firecrackerCount(Math.random);
		firecrackerXs = Array.from({ length: n }, () => FIRECRACKER_FROM_X);
		firecrackerSparks = true;
		sound('pop');
		onFirecracker();
		const started = now();
		let sparkAt = started + 400;
		const step = (): void => {
			const elapsed = now() - started;
			firecrackerXs = firecrackerXs.map((_, i) => firecrackerX(elapsed - i * 90));
			if (now() >= sparkAt && !firecrackerDone(elapsed)) {
				sound('twinkle');
				sparkAt = now() + 350 + Math.random() * 200;
			}
			if (firecrackerDone(elapsed)) {
				firecrackerOn = false;
				firecrackerSparks = false;
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
			<div class="firekid" class:spark={firecrackerSparks} style={`transform: translateX(${x}px)`}>
				<span class="body"></span>
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
		width: 28px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		will-change: transform;
	}

	.firekid .body {
		width: 18px;
		height: 28px;
		border-radius: 9px 9px 6px 6px;
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		box-shadow: 0 0 10px color-mix(in srgb, var(--amber) 70%, transparent);
		position: relative;
	}

	.firekid .body::before {
		content: '';
		position: absolute;
		left: 3px;
		top: -6px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--cream);
	}

	.firekid.spark .body {
		animation: sparkpop 0.35s ease infinite alternate;
	}

	@keyframes sparkpop {
		from {
			transform: scale(1) rotate(-8deg);
		}
		to {
			transform: scale(1.15) rotate(8deg);
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
		.firekid.spark .body,
		.stroller.wave .baby {
			animation: none;
			transform: none;
		}
	}
</style>
