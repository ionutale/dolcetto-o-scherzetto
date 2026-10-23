<script lang="ts">
	/**
	 * T19 — the neighborhood kids: 4–6 recycled costumed children roaming the
	 * sidewalk both ways, waving when the duo passes, and now and then shouting
	 * "Dolcetto o scherzetto!" into the distance (spec §4.3 "Neighborhood kids",
	 * §4.4 ambient life).
	 *
	 * Port of the prototype's `initNpcs()` / `renderNpcs(dt)` and its
	 * `shoutTick()` (`prototypes/scene-prototype.html` ~1241-1275 and
	 * ~1547-1559). The whole pool's math lives in `npc-model.ts`; this component
	 * owns only the three things the model cannot: the rAF clock, the DOM, and
	 * the bubble.
	 *
	 * - **The pool.** Six kids, one per sprite in `NPC_KINDS`
	 *   (`npcGhost`/`npcPumpkin`/`npcWitchling`/`npcSkeleton`/`npcBat`/`npcCat`);
	 *   the same six nodes are moved every frame and **recycled** across the
	 *   screen edges, so a 60-minute walk never grows the node count (spec §13
	 *   node budget). `.walking` is always on — they are always travelling —
	 *   and the walk cycle is the sprite pack's own `.walking` hooks, so the
	 *   pack's `prefers-reduced-motion` kill switch parks the legs/body
	 *   automatically.
	 * - **The wave.** The model reports the indices that enter the near band; a
	 *   kid gets the `.wave` class for 1300 ms (the prototype's
	 *   `setTimeout(…, 1300)`). `.wave` is a rotation flourish, so it carries its
	 *   own `prefers-reduced-motion` kill switch below; travel is a translation
	 *   and keeps playing.
	 * - **The shout.** Every `SHOUT_FIRST_MS` (24 s) and then every
	 *   `shoutDelay()` (26–46 s), one **on-screen** kid (model-picked) shows the
	 *   small bubble with the `shout` line for 1200 ms, fires a `giggle` cue
	 *   through the injected `sound` hook and says the `shout` clip through the
	 *   injected `say` hook (T28b) — both no-ops until T23/T27/T28b own audio.
	 *
	 * Layout: the layer sits inside the 852×393 stage at `bottom:56px`, exactly
	 * where the prototype's `#lNpcs` did — after the street and **before** the
	 * kids, so the duo always walks in front of the neighborhood (prototype
	 * `#lStreet → #lCameo → #lCars → #lNpcs → .kids`). Decorative: `aria-hidden`,
	 * `pointer-events:none`. `data-screen-x` exposes each kid's stage-logical x
	 * for tests and the smoke.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { npcBat, npcCat, npcGhost, npcPumpkin, npcSkeleton, npcWitchling } from '$lib/art/sprites';
	import { showBubble } from '$lib/play/bubble.svelte';
	import { t } from '$lib/i18n/lines';
	import { lang, worldX } from '$lib/state/game.svelte';
	import type { SayLine } from '$lib/audio/voice';
	import {
		SHOUT_BUBBLE_DX,
		SHOUT_BUBBLE_MS,
		SHOUT_BUBBLE_Y,
		SHOUT_FIRST_MS,
		WAVE_MS,
		NPC_POOL,
		advanceNpcs,
		createNpcs,
		pickShout,
		screenXOf,
		shoutDelay
	} from './npc-model';
	import type { Npc, NpcKind } from './npc-model';

	interface Props {
		/**
		 * Cue hook for the shout's `giggle`. Deliberately a no-op by default —
		 * T23/T27 replace it with the real SFX layer, exactly like the theatre's
		 * `sound` hook, so a shout never crashes without audio.
		 */
		sound?: (cue: string) => void;
		/**
		 * Voice hook for the on-screen kid's shout. Deliberately a no-op by
		 * default — T28b replaces it with `voice.ts`'s `say`, so the
		 * distant shout speaks the same `shout` clip the duo does.
		 */
		say?: SayLine;
	}
	let { sound = () => {}, say = () => {} }: Props = $props();

	/** The six costumes' markup, resolved once (the pack is a static string). */
	const SPRITES: Record<NpcKind, string> = {
		npcGhost: npcGhost(),
		npcPumpkin: npcPumpkin(),
		npcWitchling: npcWitchling(),
		npcSkeleton: npcSkeleton(),
		npcBat: npcBat(),
		npcCat: npcCat()
	};

	/** The live pool — replaced once per frame, never grown (bounded nodes). */
	let npcs = $state<Npc[]>(createNpcs(Math.random));

	/** Per-kid `.wave` latch: true for `WAVE_MS` after the model reports a wave. */
	let waving = $state<boolean[]>(Array.from({ length: NPC_POOL }, () => false));

	/** rAF handle and the dt origin — the page's own loop is the sim's; this is the ambience clock. */
	let raf = 0;
	let last = 0;
	/** When the next distant shout is due (`performance.now()` scale). */
	let shoutDueAt = 0;

	/** Every timer this layer owns, cancelled when the page goes away. */
	const timers: ReturnType<typeof setTimeout>[] = [];

	function after(ms: number, fn: () => void): void {
		const id = setTimeout(() => {
			const i = timers.indexOf(id);
			if (i >= 0) timers.splice(i, 1);
			fn();
		}, ms);
		timers.push(id);
	}

	/** Raise a kid's `.wave` for the prototype's 1300 ms, then drop it. */
	function flashWave(i: number): void {
		waving[i] = true;
		after(WAVE_MS, () => {
			waving[i] = false;
		});
	}

	/** A distant shout: an on-screen kid shows the small bubble + a giggle cue. */
	function shout(wx: number): void {
		const i = pickShout(npcs, wx, Math.random);
		if (i === null) return;
		showBubble(
			t(lang(), 'shout'),
			screenXOf(npcs[i], wx) + SHOUT_BUBBLE_DX,
			SHOUT_BUBBLE_Y,
			true,
			SHOUT_BUBBLE_MS
		);
		sound('giggle');
		say(lang(), 'shout');
	}

	/** One ambience frame: walk the pool, latch the waves, maybe shout. */
	function frame(now: number): void {
		const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
		last = now;
		const wx = worldX();
		const step = advanceNpcs(npcs, dt, wx, Math.random);
		npcs = step.npcs;
		for (const i of step.waves) flashWave(i);
		if (now >= shoutDueAt) {
			shoutDueAt = now + shoutDelay(Math.random);
			shout(wx);
		}
		raf = requestAnimationFrame(frame);
	}

	onMount(() => {
		last = performance.now();
		shoutDueAt = last + SHOUT_FIRST_MS;
		raf = requestAnimationFrame(frame);
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		for (const id of timers) clearTimeout(id);
		timers.length = 0;
	});
</script>

<div class="npcs" aria-hidden="true">
	{#each npcs as n, i (i)}
		<div
			class="npc walking"
			class:wave={waving[i]}
			data-screen-x={Math.round(screenXOf(n, worldX()))}
			data-dir={n.dir}
			style="transform: translateX({n.x - worldX()}px) scaleX({n.dir})"
		>
			<span class="body">
				<!-- trusted static SVG from the validated sprite pack -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html SPRITES[n.kind]}
			</span>
			<i class="shadow"></i>
		</div>
	{/each}
</div>

<style>
	/* The pool's layer (prototype `#lNpcs`): full stage, decorative, click-through. */
	.npcs {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* `.npc` (prototype ~147): kids walk on the sidewalk line. */
	.npc {
		position: absolute;
		left: 0;
		bottom: 56px;
		will-change: transform;
		filter: drop-shadow(0 5px 8px var(--shadow-night));
	}

	/* The sprite wrapper — the wave pivots at its feet, like the prototype's `.npc svg`. */
	.npc .body {
		display: block;
		transform-origin: bottom center;
	}

	/* `.npc.wave svg` (prototype ~149-151): two quick 4° sways. */
	.npc.wave .body {
		animation: npcwave 0.5s ease-in-out 2;
	}

	@keyframes npcwave {
		0%,
		100% {
			transform: rotate(0deg);
		}
		50% {
			transform: rotate(4deg);
		}
	}

	/* `.npc i` contact shadow (prototype ~152). */
	.npc .shadow {
		position: absolute;
		bottom: -3px;
		left: 6px;
		right: 6px;
		height: 7px;
		border-radius: 50%;
		background: var(--shadow-night);
		filter: blur(2px);
	}

	/* The wave is a tremble-scale flourish: killed under reduced motion (the
	 * walk cycle is the sprite pack's own `.walking` hooks and its kill switch
	 * already parks those; travel — a translation — keeps playing). */
	@media (prefers-reduced-motion: reduce) {
		.npc.wave .body {
			animation: none;
		}
	}
</style>
