<script lang="ts">
	/**
	 * Hold-to-walk input — the T10 control layer over the store (spec §6):
	 * translucent **corner buttons**, the **whole screen half**, and the
	 * **keyboard** (arrows / A-D), all three agreeing on one hold.
	 *
	 * Port of the prototype's `holdWalk()` + its listeners
	 * (`prototypes/scene-prototype.html` lines ~1567-1596), kept structurally
	 * identical:
	 *
	 *   holdWalk(dir, on)
	 *     on  → remember the held direction, dispatch WALK only if the sim is
	 *           not already walking that way
	 *     off → dispatch STOP **only** if that same source is still the holder
	 *
	 * Three production changes, all in service of Review Focus #2 (held-button
	 * touch input must never leave the kids walking):
	 *
	 * 1. **Every path ends in `release`.** Buttons keep the prototype's
	 *    `pointerup` / `pointercancel` / `pointerleave`; the stage halves add
	 *    those two cancellations the prototype lacked (`pointerup` alone is not
	 *    enough when the finger is released outside the stage); window-level
	 *    `pointerup` / `pointercancel` catch a release that never reaches the
	 *    element (a button disabled mid-hold, a scroll takeover), and `blur`
	 *    catches the tab going away under a held key.
	 * 2. **The guard is mirrored, not re-implemented.** `canWalk()` in the store
	 *    mirrors the reducer's private guard, so the buttons render `disabled`
	 *    in a door/collect/trick phase or with the shop open, and `holdWalk`
	 *    refuses to dispatch into them instead of dispatching blindly.
	 * 3. **Arrow keys call `preventDefault()`** (and bail out on Ctrl/Cmd/Alt)
	 *    so a held key can never scroll the stage out from under the gesture.
	 *
	 * The halves handler sits on the stage element itself — the component's own
	 * layer is `pointer-events: none`, exactly like the prototype's `.controls`,
	 * so every future HUD pill, knock button and candy keeps receiving its own
	 * taps; only taps on `button`, `.candy` or `#shop` are excluded from
	 * starting a walk (the prototype's selector, kept for T12/T16).
	 *
	 * The corner button art/positioning is the prototype's `.walkbtn` block
	 * (lines ~215-221): 76 px circles at `bottom: 22px`, `#walkL/#walkR`
	 * becoming the `.l`/`.r` classes (ids belong to the document, and Svelte
	 * scopes classes with the rest of the block).
	 */
	import { onMount } from 'svelte';
	import { canWalk, dir, dispatch, lang } from '../state/game.svelte';
	import type { Dir, Lang } from '../sim/loop';

	/** The layer root — its parent is the 852×393 `.stage` box. */
	let root = $state<HTMLElement | null>(null);

	/** Direction currently held by a live gesture; 0 = nothing held. */
	let held = $state<Dir>(0);

	/** T32 walk-button names, both languages (the visible art is an arrow). */
	const WALK_LABEL: Record<Lang, { left: string; right: string }> = {
		it: { left: 'Cammina a sinistra', right: 'Cammina a destra' },
		en: { left: 'Walk left', right: 'Walk right' }
	};

	/** Mirror of the reducer's guard — while false, no press can start a walk. */
	const allowed = $derived(canWalk());

	/**
	 * The one hold/stop funnel every input path goes through (prototype
	 * `holdWalk`, verbatim apart from the guard): pressing records the holder,
	 * releasing only stops when the holder is still this source.
	 */
	function holdWalk(d: Dir, on: boolean): void {
		if (on) {
			// Mirror the reduce guard instead of dispatching into a refusal.
			if (!canWalk()) return;
			held = d;
			if (dir() !== d) dispatch({ type: 'WALK', dir: d });
		} else if (held === d) {
			held = 0;
			dispatch({ type: 'STOP' });
		}
	}

	/* Stable handler identities: the page re-renders every frame while walking,
	 * and static handlers are what keeps that from re-binding listeners. */
	function leftDown(e: PointerEvent): void {
		e.preventDefault();
		holdWalk(-1, true);
	}
	function rightDown(e: PointerEvent): void {
		e.preventDefault();
		holdWalk(1, true);
	}
	function leftUp(): void {
		holdWalk(-1, false);
	}
	function rightUp(): void {
		holdWalk(1, false);
	}

	onMount(() => {
		/* `.stage` (Stage.svelte) is the prototype's `stage` element for the
		 * screen halves; the parent fallback keeps the halves alive even if the
		 * frame class ever changes. */
		const stage: Element | null = root ? (root.closest('.stage') ?? root.parentElement) : null;

		/** Release whichever source is holding — the end of every path. */
		const release = (): void => {
			if (held !== 0) holdWalk(held, false);
		};

		/** The halves handler — narrowed immediately (DOM listeners hand us Event). */
		const stageDown = (e: Event): void => {
			const pe = e as PointerEvent;
			const target = pe.target as Element | null;
			// Prototype guard: buttons, the candy pile and the shop own their taps.
			if (target && target.closest('button, .candy, #shop')) return;
			const r = stage?.getBoundingClientRect();
			if (!r) return;
			holdWalk(pe.clientX - r.left < r.width / 2 ? -1 : 1, true);
		};

		const keyDown = (e: Event): void => {
			const ke = e as KeyboardEvent;
			// Never swallow a browser/editor shortcut to make the kids walk.
			if (ke.metaKey || ke.ctrlKey || ke.altKey) return;
			if (ke.key === 'ArrowLeft' || ke.key === 'a') {
				ke.preventDefault();
				holdWalk(-1, true);
			}
			if (ke.key === 'ArrowRight' || ke.key === 'd') {
				ke.preventDefault();
				holdWalk(1, true);
			}
		};
		const keyUp = (e: Event): void => {
			const ke = e as KeyboardEvent;
			if (ke.key === 'ArrowLeft' || ke.key === 'a') holdWalk(-1, false);
			if (ke.key === 'ArrowRight' || ke.key === 'd') holdWalk(1, false);
		};

		const sources: Array<[EventTarget, string, (event: Event) => void]> = [];
		const add = (target: EventTarget, type: string, fn: (event: Event) => void): void => {
			target.addEventListener(type, fn);
			sources.push([target, type, fn]);
		};

		/* The corner buttons' own `pointerup` / `pointercancel` / `pointerleave`
		 * are markup handlers on each button (the prototype's per-button trio);
		 * what follows is everything above them: the screen halves, and the two
		 * safety nets no element-level listener can reach. */
		// Screen halves: pointerdown in the stage, stop on *any* ending.
		if (stage) {
			add(stage, 'pointerdown', stageDown);
			['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
				add(stage, type, release);
			});
		}
		// Window safety nets: release outside any element, and a lost focus.
		['pointerup', 'pointercancel', 'blur'].forEach((type) => {
			add(window, type, release);
		});
		add(window, 'keydown', keyDown);
		add(window, 'keyup', keyUp);

		return () => {
			for (const [target, type, fn] of sources) target.removeEventListener(type, fn);
			// Unmounting mid-hold must not leave the sim walking forever.
			release();
		};
	});
</script>

<div class="controls" bind:this={root}>
	<button
		type="button"
		class="walkbtn l reduce-motion-off"
		class:held={held === -1}
		disabled={!allowed}
		aria-label={WALK_LABEL[lang()].left}
		onpointerdown={leftDown}
		onpointerup={leftUp}
		onpointercancel={leftUp}
		onpointerleave={leftUp}
	>
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			stroke-width="2.6"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg
		>
	</button>
	<button
		type="button"
		class="walkbtn r reduce-motion-off"
		class:held={held === 1}
		disabled={!allowed}
		aria-label={WALK_LABEL[lang()].right}
		onpointerdown={rightDown}
		onpointerup={rightUp}
		onpointercancel={rightUp}
		onpointerleave={rightUp}
	>
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			stroke-width="2.6"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg
		>
	</button>
</div>

<style>
	/* Prototype `.controls` block (lines ~214-221), verbatim but for the ids. */
	.controls {
		position: absolute;
		inset: 0;
		z-index: 11;
		pointer-events: none;
	}
	.walkbtn {
		pointer-events: auto;
		position: absolute;
		bottom: 22px;
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: rgba(247, 236, 217, 0.14);
		border: 1px solid rgba(247, 236, 217, 0.38);
		color: var(--cream);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(4px);
		cursor: pointer;
		touch-action: none;
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.walkbtn:active,
	.walkbtn.held {
		background: rgba(247, 236, 217, 0.3);
		transform: scale(0.94);
	}
	.walkbtn.l {
		left: 20px;
	}
	.walkbtn.r {
		right: 20px;
	}
	.walkbtn svg {
		width: 30px;
		height: 30px;
	}

	/* The prototype never disabled these (its `holdWalk` refused silently);
	 * production shows the guard instead: while the sim freezes the duo —
	 * door, collect, trick, shop — there is nothing to press. */
	.walkbtn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* T32 focus ring (amber on the night stage; outside the 76 px circle). */
	.walkbtn:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
