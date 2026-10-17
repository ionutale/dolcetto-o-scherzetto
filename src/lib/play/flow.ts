/**
 * T11 — the knock → greet → resolve chain, and the flow's view of the store.
 * T15 — the show's resolve beat (climax → bounce → payoff line).
 *
 * Faithful port of the two `afterAction()` blocks the prototype runs around a
 * knock (`prototypes/scene-prototype.html`, ~1428-1455): the shout over the
 * kids' heads, the neighbour's greeting in the doorway, `RESOLVE` at exactly
 * 2 s, and the outcome line 150 ms later — with the outcome's sound cue
 * injected through the T27 `sound` seam and the timings lifted verbatim:
 *
 * ```
 *  +  420  shout  (250, 262)  small, 900 ms   "Dolcetto o scherzetto!"
 *  +  900  greet  (door x, 175)               by archetype: ghost/nonna/strega
 *  + 2000  RESOLVE                            the reducer answers the knock
 *  + 2150  outcome (door x, 175)              treat 1800 · regift 1800
 *                                           refuse 2200 · seen 1600
 *  + 4000  CLOSE_DOOR (seen only)             the door that stayed open shuts
 * ```
 *
 * …plus the `PLAY_TRICK` / `TRICK_RESOLVE` blocks (~1446-1468) that stage the
 * show and take its payoff (T15):
 *
 * ```
 *  PLAY_TRICK  Theatre.start(id, door x, 222, { sound, onClimax })   (page)
 *  climax      hooks.onClimax() once  → the page dispatches TRICK_RESOLVE
 *              neighbour `.bounce`    → the prototype's class toggle
 *  +  300      scherzo line (door x, 175)  by archetype, 2200 ms
 * ```
 *
 * **Who calls this.** The page's `$effect` on the one edge the knock can
 * happen on — `roam → door` (`+page.svelte`) — so a knock from the pill or
 * from anywhere else in the game starts exactly one chain. Nothing cancels
 * the timers (the prototype cleared its job list only on dev resets); the
 * guard is at the resolve end instead: `scheduleResolve` reads the outcome
 * through the store, and an outcome of `null` means `RESOLVE` did not land,
 * so no line is said at all. The trick half is the mirror image: the page
 * builds one `TrickShow` per `PLAY_TRICK` (`refuse → trick` edge), hands its
 * `onClimax` to `Theatre.start` and calls `cancel()` when the show dies
 * early — `Theatre.cancel()` kills the climax itself, `TrickShow.cancel()`
 * silences everything this module still owes after it.
 *
 * **The store seam.** `game.svelte.ts` exposes `worldX/phase/dir/activeK/
 * canWalk` (plus the later read-only seams down to T15's `trickPlayed`) —
 * `homes` and `lang` are module-private by design. The
 * chain therefore never *reads* the outcome from the sim; `createFlowStore()`
 * wraps the real store in the small `FlowStore` the chain needs and derives
 * `resolvedOutcome()` from what *is* observable — the phase the reducer lands
 * in after `RESOLVE`:
 *
 * | phase after RESOLVE | reducer outcome | line |
 * |---------------------|-----------------|------|
 * | `collect`           | treat or regift | `treat` on a first visit, `regift` on a repeat |
 * | `door` (still open) | seen            | `seen` |
 * | `refuse`            | refuse          | `refuse` |
 *
 * telling treat from regift needs one bit the phase does not carry: whether
 * the home was already done when it was knocked. The adapter keeps that bit
 * as a `Set` mirroring `homes[k].done`, filled by the outcomes it has seen —
 * exact for legal play (a home is marked done only by treat/regift/seen, and
 * a refusal drops the entry again), and read **once per resolve**: the first
 * read records the home, a second read in the same stretch would re-derive
 * from the updated mirror. Two states it cannot see through are a `RESET`
 * (or a restored save) that clears `homes` behind its back — the mirror then
 * over-records one visit per home, which mislabels only a *forced* outcome.
 * A read-only `pending()` getter on the store would remove the whole seam;
 * until one exists, this derivation is the exact one. *(T15 note: `pending()`
 * has since landed on the store, together with `candies`/`bag`/`tricks`/
 * `fanOpen`/`trickPlayed`; the chain keeps its derivation — it is the one the
 * suite pins, and it still never writes anything.)*
 *
 * Tests inject the clock (`SetTimeoutLike`) and the bubble sink
 * (`ShowBubble`), so the whole chain runs in `flow.test.ts` with no DOM.
 */
import {
	activeK as readActiveK,
	dispatch as storeDispatch,
	phase as readPhase,
	worldX as readWorldX
} from '../state/game.svelte';
import { settings } from '../persist/settings';
import { SPACING } from '../sim/loop';
import type { Action, KnockOutcome, Lang, Phase } from '../sim/loop';
import { archOf } from '../art/sprites/neighbors';
import { t as line } from '../i18n/lines';

/** `setTimeout`, injected so the chain is testable without a real clock. */
export type SetTimeoutLike = (fn: () => void, ms: number) => unknown;

/** The bubble sink — `bubble.svelte.ts`'s `showBubble`, or a test recorder. */
export type ShowBubble = (text: string, x: number, y: number, small?: boolean, ms?: number) => void;

/**
 * The SFX sink — T27's `sfx.ts` `playCue`, or a test recorder. Optional
 * everywhere: a chain with no audio is a no-op, exactly like the bubble-less
 * tests.
 */
export type PlayCue = (cue: string) => void;

/** The default SFX sink — deliberately silent, so a chain never needs audio. */
const NO_CUE: PlayCue = () => {};

/**
 * The cue each resolved outcome plays with its line — the prototype's
 * `snd(…)` calls in the `RESOLVE` block (`scene-prototype.html` ~1459-1462):
 * a treat and a re-gift both shimmer with `theatre-setup`, a refusal shrugs
 * with `refuse`, and a seen visit wiggles with `seen`.
 */
const OUTCOME_CUE: Record<KnockOutcome, string> = {
	treat: 'theatre-setup',
	refuse: 'refuse',
	regift: 'theatre-setup',
	seen: 'seen'
};

/** What the chain needs from the sim. The real store is wrapped by `createFlowStore`. */
export interface FlowStore {
	dispatch(action: Action): void;
	activeK(): number;
	worldX(): number;
	phase(): Phase;
	lang(): Lang;
	/**
	 * The outcome `RESOLVE` has just produced, or `null` when the phase says
	 * there is none. Read it once per resolve (see the header).
	 */
	resolvedOutcome(): KnockOutcome | null;
}

/** +420 ms: the shout leaves the kids' heads (stage-logical px). */
export const SHOUT_AT = 420;
export const SHOUT_X = 250;
export const SHOUT_Y = 262;
/** The shout is the prototype's `.small` bubble, on screen for 900 ms. */
export const SHOUT_MS = 900;
/** +900 ms: the neighbour answers in the doorway. */
export const GREET_AT = 900;
/** Doorway bubble anchor: the open door's lintel, tail pointing down. */
export const DOOR_Y = 175;
/** +2000 ms: the reducer answers the knock. */
export const RESOLVE_AT = 2000;
/** +150 ms after that: the outcome line (prototype `at(150, …)`). */
export const OUTCOME_AT = 150;
/** `seen` leaves the door open; +2000 ms after RESOLVE it shuts. */
export const CLOSE_DOOR_AT = 2000;
/** Line durations per outcome — the two the prototype overrode stay longer. */
export const OUTCOME_MS: Record<KnockOutcome, number> = {
	treat: 1800,
	regift: 1800,
	refuse: 2200,
	seen: 1600
};
/** T15 — the theatre's door **centre** y (prototype `Theatre.start(…, 222, …)`). */
export const SHOW_DOOR_Y = 222;
/** T15 — +300 ms after the climax: the neighbour's payoff line. */
export const SCHERZO_AT = 300;
/** T15 — its duration (the prototype's `showBubble(…, false, 2200)`). */
export const SCHERZO_MS = 2200;
/** The player offset every door screen-x is measured from (loop.ts, §5). */
const DOOR_X_OFFSET = 310;

/** The door's screen x for house `k`: `k * SPACING - worldX + 310`. */
export function doorScreenX(store: FlowStore, k: number): number {
	return k * SPACING - store.worldX() + DOOR_X_OFFSET;
}

/**
 * The knock chain: shout → greet → `RESOLVE` → outcome line.
 *
 * `k` and the greeting's x are read at knock time, the outcome's x at resolve
 * time — the same moments the prototype read them (`state` was global there,
 * so its closures captured exactly these). `sound` is T27's cue sink; when it
 * is omitted the chain is silent (the shape the unit tests use).
 */
export function scheduleKnock(
	store: FlowStore,
	showBubble: ShowBubble,
	t: SetTimeoutLike,
	sound: PlayCue = NO_CUE
): void {
	const k = store.activeK();
	const greetX = doorScreenX(store, k);

	t(() => showBubble(line(store.lang(), 'shout'), SHOUT_X, SHOUT_Y, true, SHOUT_MS), SHOUT_AT);
	t(() => showBubble(line(store.lang(), 'greet', archOf(k)), greetX, DOOR_Y), GREET_AT);
	t(() => {
		store.dispatch({ type: 'RESOLVE' });
		scheduleResolve(store, showBubble, t, sound);
	}, RESOLVE_AT);
}

/**
 * The outcome half of the chain — the prototype's `if (a.type === 'RESOLVE')`
 * block. Called right after `RESOLVE` is dispatched, so the outcome it reads
 * is the reducer's answer; a `null` means nothing resolved (a stray chain, a
 * knock frozen by something else) and neither the line nor its cue is played.
 */
export function scheduleResolve(
	store: FlowStore,
	showBubble: ShowBubble,
	t: SetTimeoutLike,
	sound: PlayCue = NO_CUE
): void {
	const outcome = store.resolvedOutcome();
	if (!outcome) return;

	const k = store.activeK();
	const x = doorScreenX(store, k);
	const lang = store.lang();
	const arch = archOf(k);

	// Scheduled at dispatch time (+2000), not with the bubble: the prototype's
	// CLOSE_DOOR lands 2000 ms after RESOLVE either way.
	if (outcome === 'seen') t(() => store.dispatch({ type: 'CLOSE_DOOR' }), CLOSE_DOOR_AT);
	t(() => {
		// The prototype says the line, then plays its cue (both in the same beat).
		showBubble(line(lang, outcome, arch), x, DOOR_Y, false, OUTCOME_MS[outcome]);
		sound(OUTCOME_CUE[outcome]);
	}, OUTCOME_AT);
}

/* ------------------------------------------------------------------ */
/* T15 — the show's resolve beat (climax → bounce → payoff line)      */
/* ------------------------------------------------------------------ */

/** What the trick orchestration can reach beyond the timers. All optional. */
export interface TrickHooks {
	/**
	 * The show's climax — the page's `dispatch({ type: 'TRICK_RESOLVE' })`,
	 * called exactly once per show, the moment the Theatre reaches it.
	 */
	onClimax?(): void;
	/**
	 * The neighbour's bounce — the prototype's `classList` toggle on the
	 * doorway's `.neighbor` (a page-side DOM seam: HouseSlot ships the
	 * `.neighbor` reveal slot but no `.bounce` class of its own, T15-checked).
	 */
	bounce?(): void;
}

/** A live show's choreography on this side of the Theatre. */
export interface TrickShow {
	/** Hand to `Theatre.start` as its `onClimax`; runs the resolve beat once. */
	onClimax(): void;
	/** Silences the pending payoff line — and any climax still to come. */
	cancel(): void;
}

/**
 * The `TRICK_RESOLVE` half of a trick — the prototype's
 * `if (a.type === 'TRICK_RESOLVE')` block (~1463-1468), minus the sounds
 * (`fire:<id>` / `theatre-laugh`, T23/T27) and the sky-ghost hop (T21):
 *
 * ```
 *  climax    hooks.onClimax() once  → the page dispatches TRICK_RESOLVE
 *            hooks.bounce()         → the neighbour's classList toggle
 *  +  300    scherzo[archOf(k)] (door x, 175), 2200 ms
 * ```
 *
 * `k` is read at climax time and `worldX`/`lang` when the line is said — the
 * same moments the prototype read them (its closures captured exactly these).
 * The Theatre is expected to call the returned `onClimax` once (it fires one
 * `climax` step per show), but the guard is this module's, not the
 * component's: a replayed climax cannot say the line twice. `cancel()` is the
 * page's undo when a show dies before its climax — a flag, not a
 * `clearTimeout`, so the injected clock stays the only timer here.
 */
export function scheduleTrickResolve(
	store: FlowStore,
	showBubble: ShowBubble,
	t: SetTimeoutLike,
	hooks: TrickHooks = {}
): TrickShow {
	let fired = false;
	let cancelled = false;

	return {
		onClimax(): void {
			if (fired || cancelled) return;
			fired = true;
			hooks.onClimax?.();
			hooks.bounce?.();
			const k = store.activeK();
			t(() => {
				if (cancelled) return;
				showBubble(
					line(store.lang(), 'scherzo', archOf(k)),
					doorScreenX(store, k),
					DOOR_Y,
					false,
					SCHERZO_MS
				);
			}, SCHERZO_AT);
		},
		cancel(): void {
			cancelled = true;
		}
	};
}

/**
 * The chain's adapter over the real store (see the header's outcome table).
 *
 * One instance per page: the mirror lives as long as the flow does. `lang()`
 * is the persisted setting (T17 owns the toggle), so the lines follow the
 * player's language rather than the run's seed.
 */
export function createFlowStore(): FlowStore {
	/** This flow's mirror of `state.homes[k].done` — the bit the phase lacks. */
	const done = new Set<number>();

	return {
		dispatch: (action) => storeDispatch(action),
		activeK: () => readActiveK(),
		worldX: () => readWorldX(),
		phase: () => readPhase(),
		lang: () => settings.read().lang,
		resolvedOutcome(): KnockOutcome | null {
			const k = readActiveK();
			switch (readPhase()) {
				case 'collect': {
					// The reducer's own split: an untouched home can only be
					// answered treat or refuse, so a collect here is a treat
					// unless this home has already collected once — then the
					// visit can only be a regift.
					const outcome: KnockOutcome = done.has(k) ? 'regift' : 'treat';
					done.add(k);
					return outcome;
				}
				case 'door':
					// Of the four outcomes, only `seen` leaves the door open.
					done.add(k);
					return 'seen';
				case 'refuse':
					// A refusal leaves the home untouched, so the mirror drops
					// any stale entry rather than growing one.
					done.delete(k);
					return 'refuse';
				default:
					return null;
			}
		}
	};
}
