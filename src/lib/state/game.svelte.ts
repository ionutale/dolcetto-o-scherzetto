/**
 * The page's runes store — a thin, *non-owning* wrapper over the pure sim in
 * `../sim/loop.ts` (T05). One module instance holds the single `GameState`,
 * the page reads it through derived getters, and the input layer mutates it
 * only through `dispatch`.
 *
 * Nothing here reimplements game logic:
 *
 * - `dispatch(action)` **is** `reduce(state, action)` — same no-op fast paths,
 *   same `canWalk` guard inside (a WALK into a door/collect/trick phase, or
 *   into an open shop, is silently refused by the reducer, exactly as the
 *   prototype does it).
 * - `step(dt)` **is** `tick(state, clampedDt)` — one clamped sim tick, exposed
 *   so tests can drive the world without a browser frame.
 * - `start()` / `stop()` are the prototype's rAF loop (`frame()` in
 *   `prototypes/scene-prototype.html` ~line 1709) with the same
 *   `dt = Math.min(.05, (now - last) / 1000)` frame clamp, so a backgrounded
 *   tab, a GC pause or a test's raw `step(1)` can never teleport the kids.
 * - `canWalk()` *mirrors* the reducer's private guard for the control layer:
 *   WalkControls disables itself instead of dispatching into a phase that
 *   would refuse it (Review Focus #2 — held-button input must never disagree
 *   with the sim about whether the kids may walk).
 *
 * Reactivity: `state` is a deep `$state` proxy, so any read inside a page
 * render effect (a getter call in the template) subscribes that part of the
 * tree to the next tick — 60 fps of `tick` produce 60 fps of scene updates and
 * nothing else. `reduce`/`tick` never mutate the input (loop.ts pins that), so
 * assigning their result back is always safe, including the no-op case where
 * they return the very same object.
 *
 * Pure-sim rules live in `loop.ts` and are pinned by `loop.test.ts`; this
 * module is pinned by `game.test.ts` (walk speed, STOP, refused phases, the
 * frame clamp, and the start/stop lifecycle).
 *
 * **T18/T18b additions (additive only).** Two read seams and one boot path:
 * `furthestK` — the monotonic furthest house (spec §9), seeded from the save
 * and advanced by `trackFurthest` inside `step`, which the celebration watches;
 * `record()` — the wallet's high-water mark, for the autosave; and the boot
 * that seeds the sim from `persist.read()` (`bag`, `tricks`, `record`, and a
 * `worldX` at the furthest doorstep). The autosave itself lives on the page.
 *
 * **Candy boss (T5).** `bossNextAt()` / `bossWins()` are the run's boss
 * progress: which bag threshold opens the next fight and how many fights this
 * run has won. They are **run progress, not sim state** — the pure sim in
 * `loop.ts` never sees a boss (the fight is a DOM overlay above the paused
 * world, Task 7), so they live here beside `furthestK`/`record`, are seeded
 * from the same save and are written back by the page's autosave. A real fresh
 * run is the parent reset, which reloads the module and re-reads the save;
 * the in-sim `RESET` is a dev/test gesture and deliberately leaves them alone.
 */
import { SPACING, initial, reduce, tick } from '../sim/loop';
import type { Action, Candy, Dir, GameState, HomeState, Lang, Phase, TrickId } from '../sim/loop';
import { trackFurthest } from '../sim/progression';
import { TRICK_ORDER } from '../sim/economy';
import { BOSS_FIRST } from '../play/boss-model';
import { persist } from '../persist/persist';
import type { RunState } from '../persist/persist';
import { settings } from '../persist/settings';

/** Longest frame the sim digests — the prototype's `Math.min(.05, dt)`. */
const MAX_DT = 0.05;

/** Cadence used when `requestAnimationFrame` is missing (node, unit tests). */
const FRAME_FALLBACK_MS = 16;

/**
 * A frame handle. The browser's rAF id is a number, so the fallback timer is
 * cast into that shape on arrival and `cancelFrame` picks the right undo.
 */
type FrameHandle = number;

/**
 * T18b — the run read back from `dos.run.v1` at module load (SSR and hostile
 * storage both give `null`). Read once: it seeds the boot below and the
 * `furthestK` seam, then the page autosaves the live state on top of it.
 */
const saved = persist.read();

/** The furthest house a save holds, floored at 0 and whole (guard a hand edit). */
const savedFurthestK = saved ? Math.max(0, Math.round(saved.furthestK)) : 0;

/**
 * The tricks a save may restore: catalogue ids only (a foreign id can never
 * reach a card), with the free `boo` guaranteed so the fan is never empty.
 */
function restoreTricks(ids: string[]): TrickId[] {
	const owned = ids.filter((id): id is TrickId => (TRICK_ORDER as readonly string[]).includes(id));
	if (!owned.includes('boo')) owned.unshift('boo');
	return owned;
}

/**
 * The saved street memory, keyed back to the numbers `initial({ homes })`
 * wants (JSON only has string keys). `persist.read()` has already validated
 * every entry, so this is purely the key-shape bridge; the deep copy inside
 * `initial` keeps the save object unaliased.
 */
function restoreHomes(savedHomes: RunState['homes']): Record<number, HomeState> {
	const restored: Record<number, HomeState> = {};
	for (const [key, home] of Object.entries(savedHomes)) {
		const k = Number(key);
		// House indices can be negative (the street continues left of the start,
		// and the save may hold a home completed there), so only the key shape is
		// checked — never a non-negative range.
		if (Number.isInteger(k)) {
			restored[k] = { done: home.done, used: home.used, kind: home.kind };
		}
	}
	return restored;
}

/**
 * The boot run (T18b). The save seeds everything the pure sim can take —
 * `bag`, `tricks`, the done/used street memory (`homes`, keyed numerically
 * again) and a `worldX` at the furthest doorstep — plus `record`, lifted to
 * the larger of the save's record and its bag (`initial` seeds `record` from
 * `bag`; a save may hold a higher one). What the sim *cannot* take at boot is
 * documented in `+page.svelte`: candies, phase, dir and the refused/active
 * house are transient and start fresh. Done homes survive a reload through
 * this seed.
 */
function bootState(): GameState {
	const base = initial({
		lang: settings.read().lang,
		bag: saved?.bag ?? 0,
		tricks: saved ? restoreTricks(saved.tricks) : undefined,
		homes: saved ? restoreHomes(saved.homes) : undefined,
		worldX: saved ? savedFurthestK * SPACING : undefined
	});
	if (!saved) return base;
	return { ...base, record: Math.max(saved.record, saved.bag) };
}

/** The whole sim state, deeply reactive. One instance for the whole page. */
let state = $state<GameState>(bootState());

/**
 * Furthest house ever reached (`spec §9`), monotonic — the T18 celebration and
 * the save both read it. Seeded from the save and advanced inside `step`; a
 * `RESET` does not touch it (a real fresh run is the parent reset, which
 * reloads the module; the in-sim `RESET` is a dev/test gesture).
 */
let furthestK = $state(savedFurthestK);

/**
 * Candy boss progress (T5): the bag threshold that opens the next fight and
 * the number of fights won this run. Not sim state — the pure loop never sees
 * the boss — so they are seeded from the save here, exactly like `furthestK`,
 * and mirrored back by the page's autosave. `persist.read()` normalises both
 * (`BOSS_FIRST` / `0` for a v1 run or a v2 payload without them), so the
 * fallbacks below only cover a `null` save.
 */
let bossNext = $state(saved?.nextBossAt ?? BOSS_FIRST);
let bossWinsCount = $state(saved?.bossWins ?? 0);

/** Single-loop latch: a second `start()` schedules nothing, `stop()` is safe. */
let running = false;
/** Handle of the frame currently scheduled (null while stopped). */
let handle: FrameHandle | null = null;
/** `performance.now()` of the previous frame — the dt origin. */
let last = 0;

/** Reads the current world scroll position (px) — feeds parallax + street. */
export function worldX(): number {
	return state.worldX;
}

/** Reads the current loop phase (spec §5) — drives knock/door/theatre UI. */
export function phase(): Phase {
	return state.phase;
}

/** Reads the walk direction: −1 left, 0 idle, 1 right (the kids' cycle). */
export function dir(): Dir {
	return state.dir;
}

/** Reads the house under the kids' feet, or −1 when out of every window. */
export function activeK(): number {
	return state.activeK;
}

/**
 * Completed / known homes by house index — restored from the save at boot and
 * kept live from then on. Feeds the street canvas so done doors dim their
 * windows.
 */
export function homes(): GameState['homes'] {
	return state.homes;
}

/**
 * The sidewalk candies the sim is holding — flying ones and the landed pile
 * (T12's candy layer renders exactly this list). Read-only like the rest of
 * the seams: the layer never mutates it, it only positions each candy and
 * dispatches `COLLECT` with the id it drew.
 */
export function candies(): Candy[] {
	return state.candies;
}

/** Candies in the bag — the duo's wallet and the HUD chip's count (spec §8). */
export function bag(): number {
	return state.bag;
}

/**
 * Furthest house ever reached (T18) — monotonic, the index the celebration
 * watches and the value the autosave mirrors. Reactive: it advances inside
 * `step`, so the page's `$effect` fires a beat the frame a boundary is crossed.
 */
export function furthest(): number {
	return furthestK;
}

/** The best bag ever held (spec §8) — the autosave's record field (T18b). */
export function record(): number {
	return state.record;
}

/**
 * The candy bag threshold that opens the next boss (T5), seeded from the save
 * and advanced by `recordBossWin`/`skipBoss`. Reactive run progress, not sim
 * state: Task 7's trigger watches it and the autosave mirrors it.
 */
export function bossNextAt(): number {
	return bossNext;
}

/**
 * Boss fights won this run (T5) — picks the rotating cast (`bossFor`) and is
 * mirrored by the autosave. Reactive run progress, not sim state.
 */
export function bossWins(): number {
	return bossWinsCount;
}

/**
 * Records a won fight: the next threshold and the win count move together, in
 * one synchronous update, so a save can never hold a post-win threshold with a
 * pre-win rotation (which would replay the same boss).
 */
export function recordBossWin(nextAt: number): void {
	bossNext = nextAt;
	bossWinsCount += 1;
}

/**
 * Records a skipped fight: only the threshold moves, so the rotation is not
 * advanced by a fight the player never actually won.
 */
export function skipBoss(nextAt: number): void {
	bossNext = nextAt;
}

/**
 * The outcome decided at knock time (`treat`/`refuse`/`regift`/`seen`), or
 * `null` between flows. Read-only seam for the display layer: prefer this over
 * deriving outcomes from the post-resolve phase (T11 caveat, T15 note).
 */
export function pending(): string | null {
	return state.pending;
}

/**
 * The run's language (reactive). Seeded from the settings envelope at boot and
 * kept in lock-step by every LANG dispatch, so components that need a language
 * that re-renders read THIS instead of `settings.read()` (T17 follow-up).
 */
export function lang(): Lang {
	return state.lang;
}

/** The owned tricks, in catalogue order — the fan renders exactly this list. */
export function tricks(): string[] {
	return state.tricks;
}

/** Whether the trick fan is open (T13's Scherzo widget). */
export function fanOpen(): boolean {
	return state.fanOpen;
}

/**
 * Whether the Bottega panel is open (T16). Read-only seam, like `fanOpen()`:
 * the shop overlay renders on it and the pill/shop both only ever *dispatch*
 * `SHOP_OPEN`/`SHOP_CLOSE`, so the panel never has to know the reducer.
 */
export function shopOpen(): boolean {
	return state.shopOpen;
}

/**
 * The trick a `PLAY_TRICK` has just put on stage, or `null` outside a show.
 * Read-only seam for the display layer (T15): `Theatre.start` takes the id,
 * and no other seam carries which card the fan picked.
 */
export function trickPlayed(): TrickId | null {
	return state.trickPlayed;
}

/**
 * Mirror of `canWalk` in `loop.ts` (where it stays private and authoritative):
 * walking is allowed only while roaming (or refusing a door) and never with
 * the shop open. The input layer asks *this* before it presses, so it never
 * dispatches a WALK the reducer would throw away.
 */
export function canWalk(): boolean {
	return !state.shopOpen && (state.phase === 'roam' || state.phase === 'refuse');
}

/**
 * Applies one action through the sim's pure `reduce`. Refused actions change
 * nothing (same object back), which is the behaviour the input layer relies
 * on: dispatching STOP twice, or WALK into a frozen phase, is harmless.
 */
export function dispatch(action: Action): void {
	state = reduce(state, action);
}

/** One clamped tick: `dt` is seconds, clamped to `[0, MAX_DT]` first. */
export function step(dt: number): void {
	state = tick(state, Math.min(MAX_DT, Math.max(0, dt)));
	// Progress is the furthest house ever seen — `trackFurthest` never regresses,
	// so backtracking leaves it (and any celebration already fired) alone.
	const next = trackFurthest(furthestK, state.worldX);
	if (next !== furthestK) furthestK = next;
}

/** `performance.now()` where available, `Date.now()` as the last resort. */
function nowMs(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Schedules the next frame: rAF in the browser (its timestamp shares the
 * `performance.now()` origin), a 16 ms timer under node so the loop still
 * exists in unit tests. Resolved on *every* call, so a test can stub the
 * globals around a single `start()`/`stop()` pair.
 */
function requestFrame(cb: (t: number) => void): FrameHandle {
	const raf = globalThis.requestAnimationFrame;
	if (typeof raf === 'function') return raf(cb);
	return setTimeout(() => cb(nowMs()), FRAME_FALLBACK_MS) as unknown as FrameHandle;
}

/** Undo for `requestFrame`, chosen the same way. */
function cancelFrame(frameHandle: FrameHandle): void {
	const caf = globalThis.cancelAnimationFrame;
	if (typeof caf === 'function') {
		caf(frameHandle);
		return;
	}
	clearTimeout(frameHandle as unknown as Parameters<typeof clearTimeout>[0]);
}

/** One loop iteration: digest the elapsed time, then ask for the next frame. */
function frame(now: number): void {
	// A frame scheduled before `stop()` may still arrive — it must not tick.
	if (!running) return;
	step((now - last) / 1000);
	last = now;
	handle = requestFrame(frame);
}

/**
 * Starts the rAF loop. Idempotent: while running, a second call is a no-op
 * (one loop, never two — a doubled loop would double the world speed).
 */
export function start(): void {
	if (running) return;
	running = true;
	last = nowMs();
	handle = requestFrame(frame);
}

/** Stops the loop. Idempotent: safe before any `start()` and safe twice. */
export function stop(): void {
	if (!running) return;
	running = false;
	if (handle !== null) {
		cancelFrame(handle);
		handle = null;
	}
}
