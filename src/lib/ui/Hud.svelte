<script lang="ts">
	/**
	 * The HUD (T12) — for now, just the bag chip.
	 *
	 * Port of the prototype's `.hud` + `#bagChip` (`prototypes/
	 * scene-prototype.html`, markup ~409-410, CSS ~197-206, `renderHUD`
	 * ~1364): the click-through layer (`pointer-events:none`, `z-index:13`),
	 * the frosted pill, the bucket icon and the live bag count, and the
	 * `bagpulse` pop whenever the bag grows — the candy the tap sent home
	 * landing in the bucket.
	 *
	 * **Minimal on purpose.** T16 extends this same file with the Bottega and
	 * mute buttons (its `.top-right` cluster); nothing else belongs here yet.
	 * The chip is a `<button>` with `id="bagChip"` because T12's candy ghost
	 * measures it by that id to know where the bag is (`CandyLayer`).
	 *
	 * The pulse is a one-shot reveal (like the bubble pop), so a reduced-motion
	 * player still gets it — only the ambient loops are switched off.
	 */
	import { onDestroy } from 'svelte';
	import { bucketIcon } from '$lib/art/sprites/candy';
	import { bag } from '$lib/state/game.svelte';

	/** `bagpulse` duration (prototype `#bagChip.pulse`). */
	const BAG_PULSE_MS = 350;

	let pulse = $state(false);
	/** Last bag seen — a plain field: only `bag()` may re-run the effect. */
	let prev = bag();
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Pop the chip whenever the bag grows; a spend (T16) does not pop it. */
	$effect(() => {
		const count = bag();
		if (count > prev) {
			pulse = true;
			clearTimeout(timer);
			timer = setTimeout(() => {
				pulse = false;
			}, BAG_PULSE_MS);
		}
		prev = count;
	});

	onDestroy(() => clearTimeout(timer));
</script>

<div class="hud">
	<button type="button" id="bagChip" class="pill" class:pulse title="Il sacchetto (portafoglio)">
		<!-- trusted static SVG from the validated candy pack -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html bucketIcon(24)}
		<span class="count">{bag()}</span>
	</button>
</div>

<style>
	/* Full-stage, click-through: only the pills take pointers. */
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 13;
	}

	.pill {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 7px;
		background: color-mix(in srgb, var(--night-0) 60%, transparent);
		border: 1px solid var(--cream-line);
		border-radius: 999px;
		color: var(--cream);
		font-weight: 600;
		font-size: 15px;
		padding: 7px 13px;
		backdrop-filter: blur(6px);
		cursor: pointer;
		transition: transform 0.12s ease;
		font-family: inherit;
	}

	.pill:active {
		transform: scale(0.95);
	}

	#bagChip {
		position: absolute;
		left: 14px;
		top: 12px;
		font-size: 16px;
	}

	#bagChip.pulse {
		animation: bagpulse 0.35s ease;
	}

	@keyframes bagpulse {
		50% {
			transform: scale(1.14);
		}
	}
</style>
