import { afterEach, describe, expect, it } from 'vitest';
import {
	CANDY_TYPES,
	NEAR,
	REGIFT_P,
	SPACING,
	SPEED,
	TREAT_P,
	TRICKS,
	TRICK_ORDER,
	initial,
	reduce,
	setRand,
	tick
} from './loop';
import type { Action, Candy, GameState, InitialOpts, KnockOutcome, Phase, TrickId } from './loop';

/**
 * Table-driven pinning suite for the ported prototype loop.
 *
 * Every behaviour the plan's Global Constraints freeze (SPEED/SPACING/NEAR,
 * TREAT_P/REGIFT_P, burst counts, price ladder) and every quirk kept on purpose
 * from `prototypes/scene-prototype.html` (`justLanded`, `state.force`,
 * `refusedK`, `canWalk`, RESET's lang/sound…) has a row below. Randomness is
 * always scripted through `setRand`, so outcomes are exact, never rolled.
 */

afterEach(() => setRand(Math.random));

/** Feeds `setRand` a scripted sequence; repeats the last value when spent. */
function scriptRand(values: number[]): { calls: () => number } {
	let i = 0;
	let calls = 0;
	setRand(() => {
		const v = values[Math.min(i, values.length - 1)];
		i += 1;
		calls += 1;
		return v;
	});
	return { calls: () => calls };
}

/** A state parked on house 0's doorstep (`activeK` 0) after a settling tick. */
function atDoor(opts: InitialOpts = {}): GameState {
	return tick(initial({ worldX: 0, ...opts }), 0);
}

/** The refuse window at house 0: knocked, resolved, door still open. */
function refusedAtDoor(opts: InitialOpts = {}): GameState {
	const s = atDoor({ force: { 0: 'refuse' }, ...opts });
	return reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
}

/** A landed candy in the pile — the `COLLECT` fixture. */
function pileCandy(id: number, over: Partial<Candy> = {}): Candy {
	return {
		id,
		state: 'landed',
		elapsed: 2,
		delay: 0,
		dur: 2,
		sx: 310,
		sy: 218,
		tx: 332,
		ty: 318,
		type: 'lolli',
		value: 5,
		...over
	};
}

/** JSON snapshot — the states are plain data, so this proves "never mutated". */
function snapshot(s: GameState): string {
	return JSON.stringify(s);
}

describe('constants (Global Constraints, pinned)', () => {
	it('pins the street and economy constants verbatim', () => {
		expect(SPACING).toBe(620);
		expect(SPEED).toBe(190);
		expect(NEAR).toBe(70);
		expect(TREAT_P).toBe(0.6);
		expect(REGIFT_P).toBe(0.3);
	});

	it('pins the eight tricks in order with the price ladder and burst tiers', () => {
		expect([...TRICK_ORDER]).toEqual([
			'boo',
			'ragnetto',
			'serpente',
			'cuscino',
			'maschera',
			'topolino',
			'fantasmino',
			'mano'
		]);
		const prices = [0, 15, 30, 45, 60, 75, 90, 110];
		const bursts = [4, 5, 6, 6, 7, 7, 8, 8];
		TRICK_ORDER.forEach((id, i) => {
			expect(TRICKS[id].price).toBe(prices[i]);
			expect(TRICKS[id].burst).toBe(bursts[i]);
			expect(TRICKS[id].name.it.length).toBeGreaterThan(0);
			expect(TRICKS[id].name.en.length).toBeGreaterThan(0);
		});
	});
});

describe('initial', () => {
	it('starts a fresh run at the prototype defaults', () => {
		expect(initial()).toEqual({
			phase: 'roam',
			worldX: -260,
			dir: 0,
			bag: 0,
			record: 0,
			lastGain: 0,
			tricks: ['boo'],
			candies: [],
			nextId: 1,
			homes: {},
			force: {},
			activeK: -1,
			refusedK: -1,
			pending: null,
			lang: 'it',
			shopOpen: false,
			fanOpen: false,
			trickPlayed: null,
			sound: true,
			note: 'Benvenuti! Camminate fino a una porta.'
		});
	});

	it('never carries justLanded before a candy lands (quirk)', () => {
		expect('justLanded' in initial()).toBe(false);
	});

	it('seeds record from bag — there is no record opt (quirk)', () => {
		expect(initial({ bag: 7 }).record).toBe(7);
		expect(initial().record).toBe(0);
	});

	it('honours every opt', () => {
		const s = initial({
			worldX: 1234,
			bag: 9,
			tricks: ['boo', 'mano'],
			homes: { 2: { done: true, used: false, kind: 'treat' } },
			force: { 2: 'regift' },
			lang: 'en',
			sound: false
		});
		expect(s.worldX).toBe(1234);
		expect(s.bag).toBe(9);
		expect(s.record).toBe(9);
		expect(s.tricks).toEqual(['boo', 'mano']);
		expect(s.homes).toEqual({ 2: { done: true, used: false, kind: 'treat' } });
		expect(s.force).toEqual({ 2: 'regift' });
		expect(s.lang).toBe('en');
		expect(s.sound).toBe(false);
	});

	it('copies opts instead of aliasing them', () => {
		const tricks: TrickId[] = ['boo'];
		const homes = { 1: { done: false, used: false, kind: 'treat' as const } };
		const force = { 1: 'treat' as KnockOutcome };
		const s = initial({ tricks, homes, force });

		tricks.push('mano');
		homes[1].done = true;
		force[1] = 'seen';

		expect(s.tricks).toEqual(['boo']);
		expect(s.homes[1].done).toBe(false);
		expect(s.force[1]).toBe('treat');
	});

	it('gives every run its own default containers', () => {
		const a = initial();
		const b = initial();
		expect(a.tricks).not.toBe(b.tricks);
		expect(a.homes).not.toBe(b.homes);
		expect(a.force).not.toBe(b.force);
		expect(a.candies).not.toBe(b.candies);
	});
});

describe('tick — walking', () => {
	it('walks 190 px per second of ticks (dir +1)', () => {
		let s = reduce(initial({ worldX: 0 }), { type: 'WALK', dir: 1 });
		// A single 1 s tick moves exactly SPEED px…
		expect(tick(s, 1).worldX).toBe(SPEED);
		// …and ten 0.1 s ticks cover the same second.
		for (let i = 0; i < 10; i++) s = tick(s, 0.1);
		expect(s.worldX).toBeCloseTo(190, 6);
		expect(s.dir).toBe(1);
	});

	it('walks left at the same speed (dir −1)', () => {
		let s = reduce(initial({ worldX: 0 }), { type: 'WALK', dir: -1 });
		for (let i = 0; i < 10; i++) s = tick(s, 0.1);
		expect(s.worldX).toBeCloseTo(-190, 6);
	});

	it.each<{ phase: Phase }>([{ phase: 'door' }, { phase: 'collect' }, { phase: 'trick' }])(
		'blocks walking in the $phase phase — WALK is refused and tick never moves',
		({ phase }) => {
			const s: GameState = { ...initial({ worldX: 0 }), phase };
			const w = reduce(s, { type: 'WALK', dir: 1 });
			expect(w).toBe(s); // refused outright: same object
			expect(w.dir).toBe(0);
			expect(tick(w, 1).worldX).toBe(0);
		}
	);

	it('blocks walking while the shop is open', () => {
		const s: GameState = { ...initial({ worldX: 0 }), shopOpen: true };
		const w = reduce(s, { type: 'WALK', dir: 1 });
		expect(w).toBe(s);
		expect(tick(w, 1).worldX).toBe(0);
	});

	it('allows walking in the refuse phase — that is how you walk away', () => {
		const s = refusedAtDoor();
		expect(s.phase).toBe('refuse');
		const w = reduce(s, { type: 'WALK', dir: 1 });
		expect(w.dir).toBe(1);
		expect(tick(w, 0.5).worldX).toBeCloseTo(95, 6);
	});

	it('WALK also closes the fan (quirk)', () => {
		const s: GameState = { ...refusedAtDoor(), fanOpen: true };
		expect(reduce(s, { type: 'WALK', dir: 1 }).fanOpen).toBe(false);
	});

	it('STOP zeroes the dir, and is a no-op when already stopped', () => {
		const walking = reduce(initial(), { type: 'WALK', dir: -1 });
		expect(reduce(walking, { type: 'STOP' }).dir).toBe(0);
		const still = initial();
		expect(reduce(still, { type: 'STOP' })).toBe(still);
	});
});

describe('tick — activeK window (±NEAR around Math.round(worldX / SPACING))', () => {
	// `-0` note: on the left edge of house 0 Math.round yields -0, so the table
	// normalises with `+ 0` before comparing (-0 + 0 === 0).
	it.each<{ x: number; want: number }>([
		{ x: 0, want: 0 },
		{ x: 70, want: 0 }, // exactly +NEAR: inside
		{ x: -70, want: 0 }, // exactly −NEAR: inside
		{ x: 71, want: -1 }, // one past +NEAR
		{ x: -71, want: -1 }, // one past −NEAR
		{ x: 620, want: 1 },
		{ x: 550, want: 1 }, // house 1's left edge (620 − 70)
		{ x: 690, want: 1 }, // house 1's right edge (620 + 70)
		{ x: 549, want: -1 },
		{ x: 691, want: -1 },
		{ x: 310, want: -1 }, // mid-block between houses 0 and 1
		{ x: -260, want: -1 }, // the default start: no door in range
		{ x: 1240, want: 2 },
		{ x: -620, want: -1 } // house −1 is indistinguishable from "none"
	])('activeK is $want at worldX $x', ({ x, want }) => {
		const s = tick(initial({ worldX: x }), 0);
		expect(s.activeK + 0).toBe(want);
	});

	it('reports no door until the first tick (initial leaves activeK at −1)', () => {
		const s = initial({ worldX: 0 });
		expect(s.activeK).toBe(-1);
		expect(reduce(s, { type: 'KNOCK' })).toBe(s);
		expect(tick(s, 0).activeK).toBe(0); // one tick and the door appears
	});

	it('tick is a no-op — same object — when nothing moves or changes', () => {
		const s = initial();
		expect(tick(s, 0)).toBe(s);
	});
});

describe('KNOCK', () => {
	it.each<KnockOutcome>(['treat', 'refuse', 'regift', 'seen'])(
		'opts.force pins the %s outcome without rolling the rng',
		(force) => {
			const rand = scriptRand([0.99]); // would roll "refuse" if consulted
			const s = atDoor({ force: { 0: force } });
			const n = reduce(s, { type: 'KNOCK' });
			expect(n.phase).toBe('door');
			expect(n.pending).toBe(force);
			expect(n.dir).toBe(0); // knocking stops the walk
			expect(n.note).toBe('Bussano...');
			expect(rand.calls()).toBe(0);
		}
	);

	it.each<{ roll: number; want: KnockOutcome }>([
		{ roll: 0, want: 'treat' },
		{ roll: 0.59, want: 'treat' }, // just under TREAT_P
		{ roll: 0.6, want: 'refuse' }, // exactly TREAT_P: not a treat
		{ roll: 0.99, want: 'refuse' }
	])('rolls $want for an untouched home at roll $roll', ({ roll, want }) => {
		scriptRand([roll]);
		const n = reduce(atDoor(), { type: 'KNOCK' });
		expect(n.pending).toBe(want);
		expect(n.phase).toBe('door');
	});

	it.each<Phase>(['door', 'collect', 'refuse', 'trick'])(
		'refuses to knock during the %s phase',
		(phase) => {
			const s: GameState = { ...atDoor({ force: { 0: 'treat' } }), phase };
			expect(reduce(s, { type: 'KNOCK' })).toBe(s);
		}
	);

	it('refuses to knock out of range (activeK −1)', () => {
		const s = initial(); // worldX −260, no window
		expect(reduce(s, { type: 'KNOCK' })).toBe(s);
	});

	it.each<{ roll: number; want: 'regift' | 'seen' }>([
		{ roll: 0.29, want: 'regift' }, // just under REGIFT_P
		{ roll: 0.3, want: 'seen' } // exactly REGIFT_P: no re-gift
	])('re-gifts a done, unused home at roll $roll → $want', ({ roll, want }) => {
		scriptRand([roll]);
		const s = atDoor({ homes: { 0: { done: true, used: false, kind: 'treat' } } });
		expect(reduce(s, { type: 'KNOCK' }).pending).toBe(want);
	});

	it('a spent re-gift always answers "seen" and consumes no roll (once ever)', () => {
		const rand = scriptRand([0]);
		const s = atDoor({ homes: { 0: { done: true, used: true, kind: 'treat' } } });
		expect(reduce(s, { type: 'KNOCK' }).pending).toBe('seen');
		expect(rand.calls()).toBe(0);
	});

	it.each<KnockOutcome>(['regift', 'seen'])('force.%s overrides the done-home roll', (forced) => {
		const rand = scriptRand([0.99]);
		const s = atDoor({
			homes: { 0: { done: true, used: true, kind: 'treat' } },
			force: { 0: forced }
		});
		expect(reduce(s, { type: 'KNOCK' }).pending).toBe(forced);
		expect(rand.calls()).toBe(0);
	});

	it('a forced treat is ignored on a done home — it falls to the roll (quirk)', () => {
		const rand = scriptRand([0.9]);
		const s = atDoor({
			homes: { 0: { done: true, used: false, kind: 'treat' } },
			force: { 0: 'treat' }
		});
		expect(reduce(s, { type: 'KNOCK' }).pending).toBe('seen');
		expect(rand.calls()).toBe(1);
	});
});

describe('RESOLVE', () => {
	it.each<{ roll: number; want: number }>([
		{ roll: 0, want: 1 },
		{ roll: 0.49, want: 1 },
		{ roll: 0.5, want: 2 }, // (0.5 * 2)|0 === 1 → two candies
		{ roll: 0.99, want: 2 }
	])('treat drops $want candies on count roll $roll', ({ roll, want }) => {
		scriptRand([roll]);
		const s = atDoor({ force: { 0: 'treat' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.candies).toHaveLength(want);
		expect(n.phase).toBe('collect');
		expect(n.pending).toBe('treat');
		expect(n.note).toBe('Dolcetto!');
	});

	it('treat marks the home done but keeps its re-gift for later', () => {
		scriptRand([0]);
		const s = atDoor({ force: { 0: 'treat' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.homes[0]).toEqual({ done: true, used: false, kind: 'treat' });
	});

	it('spawns candies with the prototype float fields, ids and value bounds', () => {
		// count 0 → 1 candy; then tx / sx / type / value.
		const rand = scriptRand([0, 0.5, 0.5, 0, 0.999]);
		const s = atDoor({ force: { 0: 'treat' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(rand.calls()).toBe(5); // 1 count roll + 4 per candy
		expect(n.candies).toHaveLength(1);
		expect(n.nextId).toBe(2);
		expect(n.candies[0]).toEqual({
			id: 1,
			state: 'fly',
			elapsed: 0,
			delay: 0, // first candy: no stagger
			dur: 2.0, // 2.0 s fall, every candy
			sx: 310, // doorScreenX = 0*620 − 0 + 310, jitter 0.5*36−18 = 0
			sy: 218,
			tx: 332, // slot 0, jitter 0.5*12−6 = 0
			ty: 318,
			type: CANDY_TYPES[0], // (0 * 6)|0 → lolli
			value: 10 // 1 + (0.999*10)|0 → 10, the top of the 1–10 roll
		});
	});

	it('staggeres the second candy by 0.12 s and shifts its pile slot', () => {
		scriptRand([0.5, 0.5, 0.5, 0, 0.999, 0.5, 0.5, 0, 0.999]);
		const s = atDoor({ force: { 0: 'treat' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.candies.map((c) => c.id)).toEqual([1, 2]);
		expect(n.candies.map((c) => c.delay)).toEqual([0, 0.12]);
		expect(n.candies.map((c) => c.dur)).toEqual([2, 2]);
		expect(n.candies.map((c) => c.ty)).toEqual([318, 326]);
		expect(n.candies.map((c) => c.tx)).toEqual([332, 362]);
		expect(n.nextId).toBe(3);
	});

	it('rolls the bottom of the value range at roll 0', () => {
		scriptRand([0, 0, 0, 0, 0]);
		const s = atDoor({ force: { 0: 'treat' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.candies[0].value).toBe(1);
	});

	it("re-gift drops exactly one candy and spends the home's re-gift", () => {
		// First roll is the re-gift roll (0.2 < REGIFT_P), then spawn's 4.
		scriptRand([0.2, 0.5, 0.5, 0, 0.5]);
		const s = atDoor({ homes: { 0: { done: true, used: false, kind: 'treat' } } });
		const knocked = reduce(s, { type: 'KNOCK' });
		expect(knocked.pending).toBe('regift');
		const n = reduce(knocked, { type: 'RESOLVE' });
		expect(n.candies).toHaveLength(1);
		expect(n.phase).toBe('collect');
		expect(n.pending).toBe('regift');
		expect(n.note).toBe('Una caramella in più!');
		expect(n.homes[0]).toEqual({ done: true, used: true, kind: 'treat' });
	});

	it("re-gift keeps the home's existing kind (scherzo stays scherzo)", () => {
		scriptRand([0.2, 0.5, 0.5, 0, 0.5]);
		const s = atDoor({ homes: { 0: { done: true, used: false, kind: 'scherzo' } } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.homes[0].kind).toBe('scherzo');
		expect(n.homes[0].used).toBe(true);
	});

	it('seen stays at the door with no candy — the page must CLOSE_DOOR', () => {
		const rand = scriptRand([0.99]);
		const s = atDoor({ homes: { 0: { done: true, used: false, kind: 'treat' } } });
		const knocked = reduce(s, { type: 'KNOCK' });
		expect(knocked.pending).toBe('seen');
		const n = reduce(knocked, { type: 'RESOLVE' });
		expect(n.phase).toBe('door');
		expect(n.pending).toBe('seen');
		expect(n.candies).toHaveLength(0);
		expect(n.note).toBe('Già visti!');
		expect(n.homes[0]).toEqual({ done: true, used: true, kind: 'treat' });
		expect(rand.calls()).toBe(1); // the re-gift roll only
	});

	it('refuse opens the scherzo window and records refusedK', () => {
		const s = atDoor({ force: { 0: 'refuse' } });
		const n = reduce(reduce(s, { type: 'KNOCK' }), { type: 'RESOLVE' });
		expect(n.phase).toBe('refuse');
		expect(n.pending).toBe('refuse');
		expect(n.refusedK).toBe(0);
		expect(n.note).toBe('Niente caramelle → Scherzo disponibile!');
		expect(n.homes).toEqual({}); // a refused home stays available (spec §5)
	});

	it.each<{ why: string; patch: Partial<GameState> }>([
		{ why: 'not at a door', patch: { phase: 'roam', pending: 'treat' } },
		{ why: 'nothing pending', patch: { phase: 'door', pending: null } }
	])('ignores RESOLVE when $why', ({ patch }) => {
		const s: GameState = { ...atDoor(), ...patch };
		expect(reduce(s, { type: 'RESOLVE' })).toBe(s);
	});
});

describe('refuse → walk away → roam', () => {
	it("stays refused while still inside the refused home's window", () => {
		let s = reduce(refusedAtDoor(), { type: 'WALK', dir: 1 });
		for (let i = 0; i < 3; i++) s = tick(s, 0.1); // worldX 57 ≤ NEAR
		expect(s.worldX).toBeCloseTo(57, 6);
		expect(s.activeK).toBe(0);
		expect(s.phase).toBe('refuse');
		expect(s.pending).toBe('refuse');
	});

	it('walking out of the window closes the door by itself', () => {
		let s = reduce(refusedAtDoor(), { type: 'WALK', dir: 1 });
		for (let i = 0; i < 4; i++) s = tick(s, 0.1); // 19, 38, 57, 76 > NEAR
		expect(s.worldX).toBeCloseTo(76, 6);
		expect(s.activeK).toBe(-1);
		expect(s.phase).toBe('roam');
		expect(s.pending).toBeNull();
		expect(s.refusedK).toBe(-1);
		expect(s.note).toBe('Ti allontani... il vicino chiude la porta.');
	});

	it('CLOSE_DOOR closes the flow and clears refusedK', () => {
		const s = refusedAtDoor();
		const n = reduce(s, { type: 'CLOSE_DOOR' });
		expect(n.phase).toBe('roam');
		expect(n.pending).toBeNull();
		expect(n.refusedK).toBe(-1);
	});
});

describe('scherzo fan + PLAY_TRICK', () => {
	it('SCHERZO_OPEN only lights the fan during the refuse phase', () => {
		const refused = refusedAtDoor();
		expect(reduce(refused, { type: 'SCHERZO_OPEN' }).fanOpen).toBe(true);

		const s = atDoor();
		expect(reduce(s, { type: 'SCHERZO_OPEN' })).toBe(s); // roam: refused
		const door: GameState = { ...refused, phase: 'door' };
		expect(reduce(door, { type: 'SCHERZO_OPEN' })).toBe(door);
	});

	it('SCHERZO_CLOSE always clears the fan', () => {
		const s: GameState = { ...refusedAtDoor(), fanOpen: true };
		expect(reduce(s, { type: 'SCHERZO_CLOSE' }).fanOpen).toBe(false);
	});

	it.each<Phase>(['roam', 'door', 'collect', 'trick'])(
		'PLAY_TRICK is rejected unless phase is refuse (tried in %s)',
		(phase) => {
			const s: GameState = { ...refusedAtDoor(), phase };
			expect(reduce(s, { type: 'PLAY_TRICK', id: 'boo' })).toBe(s);
		}
	);

	it('PLAY_TRICK is rejected for a trick you do not own', () => {
		const s = refusedAtDoor(); // owns only boo
		expect(reduce(s, { type: 'PLAY_TRICK', id: 'mano' })).toBe(s);
	});

	it('PLAY_TRICK starts the show, stops the walk, closes the fan and pranks the home', () => {
		let s = refusedAtDoor();
		s = reduce(s, { type: 'SCHERZO_OPEN' });
		expect(s.fanOpen).toBe(true);
		s = reduce(s, { type: 'PLAY_TRICK', id: 'boo' });
		expect(s.phase).toBe('trick');
		expect(s.dir).toBe(0);
		expect(s.fanOpen).toBe(false);
		expect(s.trickPlayed).toBe('boo');
		expect(s.homes[0]).toEqual({ done: true, used: true, kind: 'scherzo' });
		expect(s.note).toBe('Spettacolo in corso…');
	});
});

describe('TRICK_RESOLVE — burst counts per trick (spec §7)', () => {
	it.each<{ id: TrickId; burst: number }>([
		{ id: 'boo', burst: 4 },
		{ id: 'ragnetto', burst: 5 },
		{ id: 'serpente', burst: 6 },
		{ id: 'cuscino', burst: 6 },
		{ id: 'maschera', burst: 7 },
		{ id: 'topolino', burst: 7 },
		{ id: 'fantasmino', burst: 8 },
		{ id: 'mano', burst: 8 }
	])('$id bursts exactly $burst candies', ({ id, burst }) => {
		scriptRand([0.5]);
		let s = refusedAtDoor({ tricks: [...TRICK_ORDER] });
		s = reduce(s, { type: 'PLAY_TRICK', id });
		s = reduce(s, { type: 'TRICK_RESOLVE' });
		expect(s.phase).toBe('collect');
		expect(s.pending).toBe('scherzo');
		expect(s.note).toBe('Scherzo riuscito!');
		expect(s.candies).toHaveLength(burst);
		expect(s.candies.map((c) => c.id)).toEqual(Array.from({ length: burst }, (_, i) => i + 1));
		expect(s.candies.every((c) => c.state === 'fly' && c.dur === 2.0)).toBe(true);
		expect(s.candies.map((c) => c.delay)).toEqual(
			Array.from({ length: burst }, (_, i) => i * 0.12)
		);
		expect(s.nextId).toBe(1 + burst);
	});

	it('is ignored outside the trick phase', () => {
		const s = refusedAtDoor();
		expect(reduce(s, { type: 'TRICK_RESOLVE' })).toBe(s);
	});

	it('is ignored while phase is trick but no trick is playing', () => {
		const s: GameState = { ...refusedAtDoor(), phase: 'trick', trickPlayed: null };
		expect(reduce(s, { type: 'TRICK_RESOLVE' })).toBe(s);
	});
});

describe('COLLECT', () => {
	it('adds the value to the bag, updates record and lastGain', () => {
		const s: GameState = {
			...initial({ bag: 5 }),
			phase: 'collect',
			pending: 'treat',
			candies: [pileCandy(1, { value: 7 }), pileCandy(2, { value: 2 })]
		};
		const n = reduce(s, { type: 'COLLECT', id: 1 });
		expect(n.bag).toBe(12);
		expect(n.record).toBe(12);
		expect(n.lastGain).toBe(7);
		expect(n.note).toBe('+7'); // pile not empty yet: the plain gain note
		expect(n.candies.map((c) => c.id)).toEqual([2]);
	});

	it('returns to roam and clears pending when the pile empties', () => {
		const s: GameState = {
			...initial({ bag: 5 }),
			phase: 'collect',
			pending: 'treat',
			candies: [pileCandy(1, { value: 7 })]
		};
		const n = reduce(s, { type: 'COLLECT', id: 1 });
		expect(n.phase).toBe('roam');
		expect(n.pending).toBeNull();
		expect(n.note).toBe('+7 → sacchetto: 12');
	});

	it('stays in collect while candies remain, then leaves on the last one', () => {
		const s: GameState = {
			...initial(),
			phase: 'collect',
			pending: 'treat',
			candies: [pileCandy(1, { value: 3 }), pileCandy(2, { value: 4 })]
		};
		const one = reduce(s, { type: 'COLLECT', id: 1 });
		expect(one.bag).toBe(3);
		expect(one.phase).toBe('collect');
		expect(one.pending).toBe('treat');
		expect(one.candies.map((c) => c.id)).toEqual([2]);

		const two = reduce(one, { type: 'COLLECT', id: 2 });
		expect(two.bag).toBe(7);
		expect(two.phase).toBe('roam');
		expect(two.pending).toBeNull();
		expect(two.candies).toEqual([]);
		expect(two.note).toBe('+4 → sacchetto: 7');
	});

	it('never lowers the record', () => {
		const s: GameState = {
			...initial({ bag: 50 }),
			record: 100,
			phase: 'collect',
			candies: [pileCandy(1, { value: 3 })]
		};
		const n = reduce(s, { type: 'COLLECT', id: 1 });
		expect(n.bag).toBe(53);
		expect(n.record).toBe(100);
	});

	it('refuses a candy that has not landed yet', () => {
		const s: GameState = {
			...initial(),
			phase: 'collect',
			candies: [pileCandy(1, { state: 'fly' })]
		};
		expect(reduce(s, { type: 'COLLECT', id: 1 })).toBe(s);
	});

	it('refuses an unknown candy id', () => {
		const s: GameState = { ...initial(), phase: 'collect', candies: [pileCandy(1)] };
		expect(reduce(s, { type: 'COLLECT', id: 99 })).toBe(s);
		expect(reduce(s, { type: 'COLLECT', id: 1 }).bag).toBe(5); // pileCandy's value
	});
});

describe('shop', () => {
	it('SHOP_OPEN stops the walk and opens; SHOP_CLOSE only closes', () => {
		let s = reduce(initial(), { type: 'WALK', dir: 1 });
		expect(s.dir).toBe(1);
		s = reduce(s, { type: 'SHOP_OPEN' });
		expect(s.shopOpen).toBe(true);
		expect(s.dir).toBe(0);
		expect(reduce(s, { type: 'WALK', dir: 1 })).toBe(s); // frozen inside
		expect(s.dir).toBe(0);
		const closed = reduce(s, { type: 'SHOP_CLOSE' });
		expect(closed.shopOpen).toBe(false);
		expect(closed.dir).toBe(0);
		expect(reduce(closed, { type: 'WALK', dir: 1 }).dir).toBe(1); // free again
	});

	it.each<{ why: string; id: TrickId; bag: number }>([
		{ why: 'an unknown trick id', id: 'saxophone' as TrickId, bag: 999 },
		{ why: 'an already owned trick', id: 'boo', bag: 999 },
		{ why: 'an insufficient bag (14 < 15)', id: 'ragnetto', bag: 14 }
	])('BUY refuses $why', ({ id, bag }) => {
		const s = initial({ bag });
		expect(reduce(s, { type: 'BUY', id })).toBe(s);
		expect(reduce(s, { type: 'BUY', id }).tricks).toEqual(['boo']);
	});

	it('BUY succeeds exactly at price: bag drops to 0 and the trick joins', () => {
		const s = initial({ bag: 15 });
		const n = reduce(s, { type: 'BUY', id: 'ragnetto' });
		expect(n.bag).toBe(0);
		expect(n.tricks).toEqual(['boo', 'ragnetto']);
		expect(n.note).toBe('Comprato: Ragnetto!');
	});

	it('BUY note uses the Italian name even in English (quirk)', () => {
		const s = initial({ bag: 110, lang: 'en' });
		const n = reduce(s, { type: 'BUY', id: 'mano' });
		expect(n.lang).toBe('en');
		expect(n.note).toBe('Comprato: Mano pelosa!');
	});
});

describe('LANG / SOUND / RESET', () => {
	it('LANG toggles IT → EN → IT', () => {
		let s = initial();
		expect(s.lang).toBe('it');
		s = reduce(s, { type: 'LANG' });
		expect(s.lang).toBe('en');
		s = reduce(s, { type: 'LANG' });
		expect(s.lang).toBe('it');
	});

	it('SOUND toggles on → off → on', () => {
		let s = initial();
		expect(s.sound).toBe(true);
		s = reduce(s, { type: 'SOUND' });
		expect(s.sound).toBe(false);
		s = reduce(s, { type: 'SOUND' });
		expect(s.sound).toBe(true);
	});

	it('RESET with opts resets run fields but keeps lang and sound (quirk)', () => {
		let s = initial({ bag: 40, lang: 'en', sound: false });
		s = reduce(s, { type: 'WALK', dir: 1 });
		s = tick(s, 1);
		s = reduce(s, { type: 'BUY', id: 'boo' }); // no-op, but exercises reduce

		const n = reduce(s, { type: 'RESET', opts: { bag: 3, worldX: 500 } });
		expect(n.bag).toBe(3);
		expect(n.record).toBe(3); // record re-seeds from bag
		expect(n.worldX).toBe(500);
		expect(n.dir).toBe(0);
		expect(n.phase).toBe('roam');
		expect(n.tricks).toEqual(['boo']);
		expect(n.candies).toEqual([]);
		expect(n.homes).toEqual({});
		expect(n.force).toEqual({});
		expect(n.activeK).toBe(-1);
		expect(n.refusedK).toBe(-1);
		expect(n.pending).toBeNull();
		// The live settings win over opts.lang / opts.sound:
		expect(n.lang).toBe('en');
		expect(n.sound).toBe(false);
	});

	it('RESET without opts is a full fresh run that still keeps settings', () => {
		let s = initial({ lang: 'en', sound: false });
		s = reduce(s, { type: 'BUY', id: 'boo' });
		const n = reduce(s, { type: 'RESET' });
		expect(n).toEqual({ ...initial(), lang: 'en', sound: false });
	});
});

describe('tick — candy float timers (2.0 s per candy, 0.12 s stagger)', () => {
	/** A state with one candy mid-fall, ready to be ticked. */
	function flying(over: Partial<Candy> = {}, extra: Partial<Candy> = {}): GameState {
		return {
			...initial({ worldX: 0 }),
			phase: 'collect',
			candies: [
				{
					id: 1,
					state: 'fly',
					elapsed: 0,
					delay: 0,
					dur: 2.0,
					sx: 310,
					sy: 218,
					tx: 332,
					ty: 318,
					type: 'lolli',
					value: 5,
					...over
				},
				{
					id: 2,
					state: 'fly',
					elapsed: 0,
					delay: 0.12,
					dur: 2.0,
					sx: 310,
					sy: 218,
					tx: 362,
					ty: 326,
					type: 'star',
					value: 6,
					...extra
				}
			]
		};
	}

	it('advances elapsed and writes t, but clamps t at 0 during the stagger', () => {
		const s = flying();
		const n = tick(s, 0.06);
		// Candy 1: 0.06 / 2.0 = 0.03 progress. Candy 2 still inside its 0.12 s delay.
		expect(n.candies[0].elapsed).toBeCloseTo(0.06, 9);
		expect(n.candies[0].t).toBeCloseTo(0.03, 9);
		expect(n.candies[1].elapsed).toBeCloseTo(0.06, 9);
		expect(n.candies[1].t).toBe(0); // clamped, not negative
		expect(n.candies.every((c) => c.state === 'fly')).toBe(true);
		expect(n.justLanded).toBe(0); // key appears once candies exist, at 0
	});

	it('lands a candy exactly when t reaches 1 and freezes it there', () => {
		const s = flying();
		const n = tick(s, 2.0); // 2.0 s fall → t = 1 for candy 1
		expect(n.candies[0].state).toBe('landed');
		expect(n.candies[0].t).toBe(1);
		// Candy 2: (2.0 − 0.12) / 2.0 = 0.94 → still flying
		expect(n.candies[1].state).toBe('fly');
		expect(n.candies[1].t).toBeCloseTo(0.94, 9);
		expect(n.justLanded).toBe(1);

		const after = tick(n, 1.0);
		expect(after.candies[0].elapsed).toBe(2); // landed: elapsed frozen
		expect(after.candies[0].state).toBe('landed');
		// Candy 2 lands on the next tick: (3.0 − 0.12) / 2.0 > 1 → clamped to 1
		expect(after.candies[1].state).toBe('landed');
		expect(after.candies[1].t).toBe(1);
		expect(after.justLanded).toBe(2); // one per landing tick
	});

	it('justLanded counts landing ticks, not candies (quirk)', () => {
		// Both candies land in the very same tick → still just +1.
		const s = flying();
		const n = tick(s, 5.0);
		expect(n.candies.every((c) => c.state === 'landed')).toBe(true);
		expect(n.justLanded).toBe(1);
		// Later ticks with nothing landing do not bump it…
		expect(tick(n, 0.5).justLanded).toBe(1);
		// …and the sim never resets it: it accumulates across landings.
		const s2 = flying({ delay: 0 }, { delay: 0 });
		let n2 = tick(s2, 2.0);
		expect(n2.justLanded).toBe(1);
		n2 = tick(n2, 2.0); // both already landed → no new landing tick
		expect(n2.justLanded).toBe(1);
	});

	it('never introduces justLanded when there are no candies', () => {
		const s = initial();
		const n = tick(s, 0.5);
		expect(n).toBe(s);
		expect('justLanded' in n).toBe(false);
	});
});

describe('immutability — reduce and tick never mutate their input', () => {
	it('leaves the input state byte-identical across a full treat flow', () => {
		scriptRand([0, 0.5, 0.5, 0, 0.5]);
		const start = atDoor({ force: { 0: 'treat' } });
		const before = snapshot(start);

		let s = start;
		s = reduce(s, { type: 'WALK', dir: 1 });
		s = reduce(s, { type: 'STOP' });
		s = reduce(s, { type: 'KNOCK' });
		s = reduce(s, { type: 'RESOLVE' });
		s = tick(s, 2.1); // the candy lands (t ≥ 1)
		s = reduce(s, { type: 'COLLECT', id: 1 });
		s = reduce(s, { type: 'SHOP_OPEN' });
		s = reduce(s, { type: 'SHOP_CLOSE' });
		s = reduce(s, { type: 'LANG' });
		s = reduce(s, { type: 'SOUND' });

		expect(snapshot(start)).toBe(before);
		expect(s).not.toBe(start);
	});

	it('does not share the candy array or its entries with the previous state', () => {
		scriptRand([0, 0.5, 0.5, 0, 0.5]);
		const s = atDoor({ force: { 0: 'treat' } });
		const knocked = reduce(s, { type: 'KNOCK' });
		const resolved = reduce(knocked, { type: 'RESOLVE' });

		expect(resolved.candies).not.toBe(knocked.candies);
		expect(knocked.candies).toEqual([]);
		expect(s.candies).toEqual([]);
		expect(s.phase).toBe('roam');
		expect(s.pending).toBeNull();

		const ticked = tick(resolved, 1);
		expect(ticked.candies).not.toBe(resolved.candies);
		expect(ticked.candies[0]).not.toBe(resolved.candies[0]);
		expect(resolved.candies[0].elapsed).toBe(0);
		expect(resolved.candies[0].state).toBe('fly');
	});

	it('rejected actions return the very same object', () => {
		const s: GameState = { ...initial(), phase: 'collect', candies: [pileCandy(1)] };
		const refused: Action[] = [
			{ type: 'STOP' },
			{ type: 'KNOCK' },
			{ type: 'RESOLVE' },
			{ type: 'SCHERZO_OPEN' },
			{ type: 'PLAY_TRICK', id: 'boo' },
			{ type: 'TRICK_RESOLVE' },
			{ type: 'COLLECT', id: 42 },
			{ type: 'BUY', id: 'boo' },
			{ type: 'WALK', dir: 1 }
		];
		for (const a of refused) expect(reduce(s, a)).toBe(s);
	});
});
