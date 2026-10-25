/**
 * The pure game loop — a faithful TypeScript port of the `Loop` module that was
 * validated inside `prototypes/scene-prototype.html` (the block commented
 * `IL MODULO PURO — "LIFT ME"`).
 *
 * The prototype module is the source of truth: same action names, same phases,
 * same defaults, same quirks. Nothing here is redesigned — the scene layer will
 * call `initial`/`reduce`/`tick` and render whatever comes back.
 *
 * Quirks deliberately preserved (they are pinned by `loop.test.ts`):
 * - `canWalk` = `!shopOpen && (phase === 'roam' || phase === 'refuse')`: the
 *   door, collect and trick phases freeze the kids, and so does the shop.
 * - `WALK` also closes the fan (`fanOpen: false`).
 * - `initial` seeds `record` from `bag` (there is no separate `record` opt).
 * - `justLanded` is *not* in `initial` — it appears on the first tick that
 *   lands a candy, counts **ticks** (not candies) where ≥1 candy landed, and is
 *   never reset by the sim.
 * - `KNOCK` honours `state.force[k]` on an untouched home; on a done home only
 *   `regift`/`seen` forces apply (a forced `treat`/`refuse` falls through to
 *   the re-gift roll).
 * - `RESOLVE 'seen'` stays in the `door` phase: the page must `CLOSE_DOOR`.
 * - `RESET` always keeps the *current* `lang`/`sound`, ignoring `opts.lang` /
 *   `opts.sound`.
 * - `BUY` writes `note` with the Italian trick name even in English.
 * - `reduce`/`tick` return the very same object when nothing changed (no-op
 *   fast path); they never mutate the input.
 * - A house at `k = -1` is indistinguishable from "no active house"
 *   (`activeK: -1`), and `Math.round(-70 / 620)` yields `-0` on the left edge
 *   of house 0 — both kept as-is.
 *
 * Randomness goes through one injectable `rand` (default `Math.random`) so
 * tests can script outcomes with `setRand`.
 *
 * Pure: no DOM, no timers, no localStorage. `src/lib/persist/persist.ts`
 * mirrors `bag`/`record`/`tricks`/`furthestK`; this module never imports it.
 */

import { TRICKS, TRICK_ORDER, burstFor, canBuy, priceFor, rollValue, treatCount } from './economy';
import type { Trick, TrickId } from './economy';
import { neighborhoodIndex, refusalP, richnessBias } from './progression';

// The trick catalogue and its price/burst helpers live in `economy.ts`; they are
// re-exported here so scene modules keep importing them from `loop.ts`.
export { TRICKS, TRICK_ORDER };
export type { Trick, TrickId };

/** Distance in px between one doorstep and the next. */
export const SPACING = 620;

/** Walking speed in px/s (spec §5, Global Constraints). */
export const SPEED = 190;

/** Half-width in px of the "at the door" window around a doorstep (inclusive). */
export const NEAR = 70;

/**
 * Baseline treat chance at neighborhood 0 (`1 - REFUSAL_BASE`). Live knocks use
 * `1 - refusalP(neighborhoodIndex(k))` so later neighborhoods refuse more.
 */
export const TREAT_P = 0.6;

/** Chance a knock on a done home re-gifts — once ever per home (ADR-0003). */
export const REGIFT_P = 0.3;

/** Candy skins are cosmetic only (spec §8); the sim only stores the id. */
export const CANDY_TYPES = ['lolli', 'gummy', 'choco', 'toffee', 'corn', 'star'] as const;
export type CandyType = (typeof CANDY_TYPES)[number];

/** UI language (spec §13: IT default, EN toggle). */
export type Lang = 'it' | 'en';

/** Walk direction: 0 = standing still. */
export type Dir = -1 | 0 | 1;

/** Loop phase (spec §5). `refuse` is the door-open-but-pranked window. */
export type Phase = 'roam' | 'door' | 'collect' | 'refuse' | 'trick';

/** What a knock can resolve into (before a trick's burst enters the picture). */
export type KnockOutcome = 'treat' | 'refuse' | 'regift' | 'seen';

/** `pending` also holds `'scherzo'` while a trick's candies await collection. */
export type Outcome = KnockOutcome | 'scherzo';

/** A home's flavour, recorded when it is first completed. */
export type HomeKind = 'treat' | 'scherzo';

export interface HomeState {
	/** The kids already got candy (or a prank) here. */
	done: boolean;
	/** The one allowed re-gift was spent (re-gift capped once ever). */
	used: boolean;
	kind: HomeKind;
}

/** One sidewalk candy. `t` is written by `tick` while flying. */
export interface Candy {
	id: number;
	/** `fly` = floating down (2.0 s), `landed` = tappable in the pile. */
	state: 'fly' | 'landed';
	/** Seconds since spawn; frozen once landed. */
	elapsed: number;
	/** Seconds before this candy starts falling (stagger `i * 0.12`). */
	delay: number;
	/** Fall duration in seconds — 2.0 for every candy (prototype constant). */
	dur: number;
	/** Stage-space door anchor the candy flies from. */
	sx: number;
	sy: number;
	/** Stage-space pile slot it settles on. */
	tx: number;
	ty: number;
	type: CandyType;
	/** Value rolled at drop, uniform 1–10; revealed as `+N` on collect. */
	value: number;
	/** Normalised fall progress in 0..1; present only after a `tick`. */
	t?: number;
}

/** Options accepted by `initial` (all optional). */
export interface InitialOpts {
	/** Start position in px; `-260` by default (between homes 0 and −1). */
	worldX?: number;
	/** Starting candies; also seeds `record` (prototype quirk). */
	bag?: number;
	/** Owned tricks; `['boo']` when omitted. Copied, never shared. */
	tricks?: TrickId[];
	/** Per-home state; deep-copied, `{}` when omitted. */
	homes?: Record<number, HomeState>;
	/** Forced knock outcomes per house index (used by tests/tutorial). */
	force?: Partial<Record<number, KnockOutcome>>;
	/** UI language; `'it'` by default. */
	lang?: Lang;
	/** Sound flag; `true` by default. */
	sound?: boolean;
}

/** The whole game state — plain JSON, so `persist.ts` can bridge it. */
export interface GameState {
	phase: Phase;
	/** Camera position in px; the street is laid out every `SPACING` px. */
	worldX: number;
	dir: Dir;
	/** Candies in the bag — the wallet shared by the duo (spec §8). */
	bag: number;
	/** Biggest bag ever held; monotonic within a run and persisted. */
	record: number;
	/** Last `+N` collected, for the floating counter. */
	lastGain: number;
	tricks: TrickId[];
	candies: Candy[];
	/** Id handed to the next spawned candy. */
	nextId: number;
	/** Completed/known homes by house index. */
	homes: Record<number, HomeState>;
	/** Forced knock outcomes by house index. */
	force: Partial<Record<number, KnockOutcome>>;
	/** House index currently under the kids, or −1 when out of any window. */
	activeK: number;
	/** House that refused, or −1; leaving its window closes the door. */
	refusedK: number;
	/** What the door flow is waiting on; `null` between flows. */
	pending: Outcome | null;
	lang: Lang;
	shopOpen: boolean;
	fanOpen: boolean;
	/** Trick whose show is running, or `null`. */
	trickPlayed: TrickId | null;
	sound: boolean;
	/** Italian dev note from the prototype (the real UI has its own copy). */
	note: string;
	/** Ticks in which ≥1 candy landed since the page last read it. */
	justLanded?: number;
}

/** Every event the loop accepts. Pure data — serialisable and testable. */
export type Action =
	| { type: 'WALK'; dir: Dir }
	| { type: 'STOP' }
	| { type: 'KNOCK' }
	| { type: 'RESOLVE' }
	| { type: 'CLOSE_DOOR' }
	| { type: 'SCHERZO_OPEN' }
	| { type: 'SCHERZO_CLOSE' }
	| { type: 'PLAY_TRICK'; id: TrickId }
	| { type: 'TRICK_RESOLVE' }
	| { type: 'COLLECT'; id: number }
	/** Mystery-van toss (T37) — one candy from screen `(sx, sy)` onto the pile. */
	| { type: 'AMBIENT_CANDY'; sx?: number; sy?: number }
	| { type: 'SHOP_OPEN' }
	| { type: 'SHOP_CLOSE' }
	| { type: 'BUY'; id: TrickId }
	/** Boss stake: one candy leaves the bag per round; refused when empty. */
	| { type: 'SPEND_CANDY' }
	/** Boss reward: `n` candies join the bag and can lift `record`. */
	| { type: 'BOSS_REWARD'; n: number }
	| { type: 'LANG' }
	| { type: 'SOUND' }
	| { type: 'RESET'; opts?: InitialOpts };

/** Injectable randomness; tests script it through `setRand`. */
export type RandFn = () => number;

let rand: RandFn = Math.random;

/** Replaces the loop's random source (tests pass a deterministic sequence). */
export function setRand(fn: RandFn): void {
	rand = fn;
}

/** Walking is allowed only while roaming (and while refusing a door). */
function canWalk(s: GameState): boolean {
	return !s.shopOpen && (s.phase === 'roam' || s.phase === 'refuse');
}

/** Deep-copies homes so the caller's object is never aliased (or mutated). */
function cloneHomes(homes: Record<number, HomeState>): Record<number, HomeState> {
	const copy: Record<number, HomeState> = {};
	for (const key of Object.keys(homes)) {
		const home = homes[Number(key)];
		if (home) copy[Number(key)] = { ...home };
	}
	return copy;
}

/** `(s.homes[k] || {}).kind || 'treat'` — keep the home's kind, default treat. */
function kindOrTreat(prev: HomeState | undefined): HomeKind {
	return prev?.kind || 'treat';
}

/**
 * A fresh run. Defaults match the prototype exactly: starts at `worldX −260`
 * (mid-block, no door in range), owns the free `boo` trick, Italian, sound on.
 */
export function initial(opts: InitialOpts = {}): GameState {
	return {
		phase: 'roam',
		worldX: opts.worldX ?? -260,
		dir: 0,
		bag: opts.bag ?? 0,
		// Quirk: the record starts at the starting bag, there is no `record` opt.
		record: opts.bag ?? 0,
		lastGain: 0,
		tricks: opts.tricks ? [...opts.tricks] : ['boo'],
		candies: [],
		nextId: 1,
		homes: opts.homes ? cloneHomes(opts.homes) : {},
		force: opts.force ? { ...opts.force } : {},
		activeK: -1,
		refusedK: -1,
		pending: null,
		lang: opts.lang ?? 'it',
		shopOpen: false,
		fanOpen: false,
		trickPlayed: null,
		sound: opts.sound ?? true,
		note: 'Benvenuti! Camminate fino a una porta.'
	};
}

/** Richness bias for the house under the kids' feet (0 at leafy start). */
function activeRichness(s: GameState): number {
	return richnessBias(neighborhoodIndex(Math.max(0, s.activeK)));
}

/**
 * Candy value with neighborhood richness: with probability `bias`, take the
 * better of two rolls so later streets drop slightly richer candy.
 */
function rollValueBiased(bias: number): number {
	const first = rollValue(rand);
	if (bias <= 0 || rand() >= bias) return first;
	return Math.max(first, rollValue(rand));
}

/**
 * Treat count with richness: with probability `bias`, force 2 candies; else the
 * normal 1–2 roll.
 */
function treatCountBiased(bias: number): number {
	if (bias > 0 && rand() < bias) return 2;
	return treatCount(rand);
}

/* candies: light float — 2.0s per candy, staggered 0.12s, bobbing in the page */
function spawnCandies(s: GameState, n: number): GameState {
	const doorScreenX = s.activeK * SPACING - s.worldX + 310;
	const candies = [...s.candies];
	const landedCount = candies.filter((c) => c.state !== 'fly').length;
	const bias = activeRichness(s);
	for (let i = 0; i < n; i++) {
		const tx = 332 + ((landedCount + i) % 5) * 30 + (rand() * 12 - 6);
		const ty = 318 + (i % 2) * 8;
		candies.push({
			id: s.nextId + i,
			state: 'fly',
			elapsed: 0,
			delay: i * 0.12,
			dur: 2.0,
			sx: doorScreenX + (rand() * 36 - 18),
			sy: 218,
			tx,
			ty,
			type: CANDY_TYPES[(rand() * CANDY_TYPES.length) | 0],
			value: rollValueBiased(bias)
		});
	}
	return { ...s, candies, nextId: s.nextId + n };
}

/** One candy from a free screen spawn (T37 van toss) onto the pile. */
function spawnCandyFrom(s: GameState, sx: number, sy: number): GameState {
	const candies = [...s.candies];
	const landedCount = candies.filter((c) => c.state !== 'fly').length;
	const bias = activeRichness(s);
	const tx = 332 + (landedCount % 5) * 30 + (rand() * 12 - 6);
	const ty = 318;
	candies.push({
		id: s.nextId,
		state: 'fly',
		elapsed: 0,
		delay: 0,
		dur: 2.0,
		sx,
		sy,
		tx,
		ty,
		type: CANDY_TYPES[(rand() * CANDY_TYPES.length) | 0],
		value: rollValueBiased(bias)
	});
	return { ...s, candies, nextId: s.nextId + 1 };
}

/**
 * Applies one action. Returns a new state, or the *same* object when the
 * action is refused or changes nothing (prototype behaviour). Never mutates.
 */
export function reduce(s: GameState, a: Action): GameState {
	switch (a.type) {
		case 'WALK':
			return canWalk(s) ? { ...s, dir: a.dir, fanOpen: false } : s;
		case 'STOP':
			return s.dir === 0 ? s : { ...s, dir: 0 };

		case 'KNOCK': {
			if (s.phase !== 'roam' || s.activeK < 0) return s;
			const k = s.activeK;
			const home = s.homes[k];
			let outcome: KnockOutcome;
			if (!home || !home.done) {
				const treatP = 1 - refusalP(neighborhoodIndex(Math.max(0, k)));
				outcome = s.force[k] || (rand() < treatP ? 'treat' : 'refuse');
			} else if (s.force[k] === 'regift') outcome = 'regift';
			else if (s.force[k] === 'seen') outcome = 'seen';
			else outcome = !home.used && rand() < REGIFT_P ? 'regift' : 'seen';
			return { ...s, phase: 'door', dir: 0, pending: outcome, note: 'Bussano...' };
		}

		case 'RESOLVE': {
			if (s.phase !== 'door' || !s.pending) return s;
			const o = s.pending;
			const k = s.activeK;
			if (o === 'treat') {
				const n: GameState = {
					...s,
					homes: { ...s.homes, [k]: { done: true, used: false, kind: 'treat' } }
				};
				return {
					...spawnCandies(n, treatCountBiased(activeRichness(n))),
					phase: 'collect',
					pending: 'treat',
					note: 'Dolcetto!'
				};
			}
			if (o === 'regift') {
				const n: GameState = {
					...s,
					homes: {
						...s.homes,
						[k]: { done: true, used: true, kind: kindOrTreat(s.homes[k]) }
					}
				};
				return {
					...spawnCandies(n, 1),
					phase: 'collect',
					pending: 'regift',
					note: 'Una caramella in più!'
				};
			}
			if (o === 'seen') {
				return {
					...s,
					phase: 'door',
					pending: 'seen',
					homes: {
						...s.homes,
						[k]: { done: true, used: true, kind: kindOrTreat(s.homes[k]) }
					},
					note: 'Già visti!'
				};
			}
			return {
				...s,
				phase: 'refuse',
				pending: 'refuse',
				refusedK: k,
				note: 'Niente caramelle → Scherzo disponibile!'
			};
		}

		case 'CLOSE_DOOR':
			return { ...s, phase: 'roam', pending: null, refusedK: -1 };

		case 'SCHERZO_OPEN':
			return s.phase === 'refuse' ? { ...s, fanOpen: true } : s;
		case 'SCHERZO_CLOSE':
			return { ...s, fanOpen: false };

		/* award a trick: the show plays (page); candies arrive via TRICK_RESOLVE */
		case 'PLAY_TRICK': {
			if (s.phase !== 'refuse' || !TRICKS[a.id] || !s.tricks.includes(a.id)) return s;
			return {
				...s,
				phase: 'trick',
				dir: 0,
				fanOpen: false,
				trickPlayed: a.id,
				homes: {
					...s.homes,
					[s.activeK]: { done: true, used: true, kind: 'scherzo' }
				},
				note: 'Spettacolo in corso…'
			};
		}

		case 'TRICK_RESOLVE': {
			if (s.phase !== 'trick' || !s.trickPlayed) return s;
			const burst = burstFor(s.trickPlayed);
			return {
				...spawnCandies(s, burst),
				phase: 'collect',
				pending: 'scherzo',
				note: 'Scherzo riuscito!'
			};
		}

		case 'COLLECT': {
			const c = s.candies.find((x) => x.id === a.id && x.state === 'landed');
			if (!c) return s;
			const candies = s.candies.filter((x) => x.id !== a.id);
			const bag = s.bag + c.value;
			let n: GameState = {
				...s,
				candies,
				bag,
				record: Math.max(s.record, bag),
				lastGain: c.value,
				note: '+' + c.value
			};
			if (n.candies.length === 0 && n.phase === 'collect') {
				n = { ...n, phase: 'roam', pending: null, note: '+' + c.value + ' → sacchetto: ' + bag };
			}
			return n;
		}

		/* T37 mystery-van candy toss — one sidewalk candy while roaming (or
		 * already collecting). Opens collect so the kid can pick it up. */
		case 'AMBIENT_CANDY': {
			if (s.shopOpen || (s.phase !== 'roam' && s.phase !== 'collect')) return s;
			const sx = a.sx ?? 426;
			const sy = a.sy ?? 200;
			const n = spawnCandyFrom(s, sx, sy);
			return {
				...n,
				phase: 'collect',
				pending: s.phase === 'collect' && s.pending ? s.pending : 'treat',
				note: 'Una caramella dal furgone!'
			};
		}

		case 'SHOP_OPEN':
			return { ...s, shopOpen: true, dir: 0 };
		case 'SHOP_CLOSE':
			return { ...s, shopOpen: false };
		case 'BUY': {
			if (!canBuy(s.bag, s.tricks, a.id)) return s;
			// Quirk kept: the note always uses the Italian name.
			return {
				...s,
				bag: s.bag - priceFor(a.id),
				tricks: [...s.tricks, a.id],
				note: 'Comprato: ' + TRICKS[a.id].name.it + '!'
			};
		}

		case 'SPEND_CANDY':
			return s.bag > 0 ? { ...s, bag: s.bag - 1 } : s;

		/* Wallet side of a boss round: floor `n`, refuse a stake that adds nothing. */
		case 'BOSS_REWARD': {
			if (!Number.isFinite(a.n) || a.n <= 0) return s;
			const n = Math.floor(a.n);
			if (n <= 0) return s;
			const bag = s.bag + n;
			return { ...s, bag, record: Math.max(s.record, bag) };
		}

		case 'LANG':
			return { ...s, lang: s.lang === 'it' ? 'en' : 'it' };
		case 'SOUND':
			return { ...s, sound: !s.sound };
		// Quirk: lang/sound come from the live state, opts cannot flip them.
		case 'RESET':
			return initial({ ...(a.opts || {}), lang: s.lang, sound: s.sound });

		default:
			return s;
	}
}

/**
 * Advances the world by `dt` seconds. Returns a new state — or the same object
 * when nothing changed. Order matches the prototype: walk → recompute
 * `activeK` → close a refused door walked away from → candy float timers.
 */
export function tick(s: GameState, dt: number): GameState {
	let n = s;
	if (n.dir !== 0 && canWalk(n)) n = { ...n, worldX: n.worldX + n.dir * SPEED * dt };

	const k = Math.round(n.worldX / SPACING);
	const near = Math.abs(n.worldX - k * SPACING) <= NEAR;
	const activeK = near ? k : -1;
	if (activeK !== n.activeK) n = { ...n, activeK };

	if (n.phase === 'refuse' && n.activeK !== n.refusedK) {
		n = {
			...n,
			phase: 'roam',
			pending: null,
			refusedK: -1,
			note: 'Ti allontani... il vicino chiude la porta.'
		};
	}

	if (n.candies.length) {
		let landedNow = false;
		const candies = n.candies.map((c) => {
			if (c.state !== 'fly') return c;
			const elapsed = c.elapsed + dt;
			const t = Math.max(0, Math.min(1, (elapsed - c.delay) / c.dur));
			const cc: Candy = { ...c, elapsed, t };
			if (t >= 1) {
				cc.state = 'landed';
				landedNow = true;
			}
			return cc;
		});
		n = { ...n, candies, justLanded: landedNow ? (n.justLanded || 0) + 1 : n.justLanded || 0 };
	}
	return n;
}
