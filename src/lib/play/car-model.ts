/**
 * T20 — the cars model: which parked cars are alive for a scroll position, and
 * when the rare passer crosses. Lifted out of the prototype's render path
 * (`prototypes/scene-prototype.html`) so both the recycling window and the
 * passer schedule can be pinned without a DOM, a browser clock or a random
 * source.
 *
 * The window/slot mechanics, the slot offset and the passer are the validated
 * prototype's; the **parking rule** is the one deliberate lift (spec §4.4 asks
 * for **3–5 parked cars in four dusk-muted tones**, and the prototype's
 * odd-blocks-only rule could only ever show **two** of the four — see below).
 *
 * | prototype (`scene-prototype.html`)                      | here |
 * |---------------------------------------------------------|------|
 * | `renderCars()` window `k0 = floor(worldX/SPACING) - 1` (~1219) | `firstCarK` |
 * | `for (let i = 0; i <= 4; i++)` — five live blocks (~1221) | `CAR_WINDOW` |
 * | `if (((k % 2) + 2) % 2 === 1)` — a car on odd blocks (~1223) | `hasCar` (richer, §4.4) |
 * | `{ k, off: 470 }` — every parked car at `k*SPACING + 470` (~1223) | `CAR_OFFSET` |
 * | `sp('car', FB.car(), k % 4)` — the car's dusk tone (~1232) | `carColor` (by ordinal) |
 * | `translateX(k*SPACING + off - worldX)` (~1236)          | `carScreenX` |
 * | `passerAt = performance.now() + 45000` first (~1529)    | `firstPasserAt` |
 * | `passerAt = now + 70000 + rng*30000` then (~1532)       | `passerGap` / `nextPasserAt` |
 * | `dur = 4200`, `from = -170`, `to = 1030` (~1537-1538)   | `PASSER_*` / `passerX` |
 *
 * **The parking rule (spec §4.4).** One block in `CAR_SKIP_MOD` (five) is left
 * empty — a driveway gap — so every five-block window parks exactly **four**
 * cars, inside the spec's 3–5 band (the prototype's odd-only rule parked 2–3).
 * The tone is the car's **ordinal** on the endless street (`carOrdinal`, which
 * increments by exactly one per parked block, across the skips), taken mod the
 * four dusk tones. Two consequences, both pinned in `car-model.test.ts`:
 *
 *   - every window's four cars carry four consecutive ordinals, so the window
 *     **always shows all four tones** (`0,1,2,3`), not just the prototype's two;
 *   - consecutive parked cars are consecutive ordinals, so **no two adjacent
 *     parked cars ever share a tone** (they differ by one, mod four).
 *
 * The four dusk-muted tones themselves live in the sprite pack
 * (`car(0..3)` in `../art/sprites/index.ts`). The passer is unchanged: it still
 * drives tone `0` (`passerCar()` uses `CARS[0]`), which the test pins against
 * `car(0)`.
 *
 * Everything here is pure: numbers in, numbers out. The component injects the
 * real clock (`performance.now`) and the real `Math.random`; the tests inject
 * deterministic stand-ins, which is what makes "no second passer while one
 * drives" and the schedule bounds checkable without waiting 100 seconds.
 */
import { SPACING } from '../sim/loop';

/** Prototype: a parked car sits this far into its block (`off: 470`). */
export const CAR_OFFSET = 470;

/** Prototype: the live block window is `k0 .. k0+4` — five blocks, like the street. */
export const CAR_WINDOW = 5;

/** How many dusk-muted car tones the sprite pack carries (`car(0..3)`). */
export const CAR_TONES = 4;

/** One block in five is left empty, so a five-block window parks four cars. */
export const CAR_SKIP_MOD = 5;

/** Prototype: one crossing lasts 4.2 s. */
export const PASSER_DUR_MS = 4200;

/** Prototype: the passer first appears 45 s into the run. */
export const PASSER_FIRST_MS = 30_000;

/** Prototype: the *shortest* gap between two passers — 70 s. */
export const PASSER_GAP_MIN_MS = 70_000;

/** Prototype: the extra random gap — `rng() * 30 s`, so the longest gap is 100 s. */
export const PASSER_GAP_SPAN_MS = 30_000;

/** Prototype crossing endpoints, in stage px: enters left, leaves right. */
export const PASSER_FROM_X = -170;
export const PASSER_TO_X = 1030;

/** One live parked car: the block it belongs to, its offset, and its tone. */
export interface CarSlot {
	/** House/block index on the endless street (may be negative at the edge). */
	k: number;
	/** In-block offset in px (the prototype's constant `470`). */
	off: number;
	/** Car-tone index `0..3` for `car(index)`. */
	color: number;
}

/** `((v % m) + m) % m` — a modulus that floors positive for negative blocks. */
function positiveMod(v: number, m: number): number {
	return ((v % m) + m) % m;
}

/** Clamp any number into `[0, 1]` (the prototype's `Math.max(0, Math.min(1, t))`). */
function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The parking rule: a car on every block except one in `CAR_SKIP_MOD`, so any
 * `CAR_SKIP_MOD`-block window (spec 3–5, prototype window length) parks
 * `CAR_SKIP_MOD - 1 = 4` cars.
 */
export function hasCar(k: number): boolean {
	return positiveMod(k, CAR_SKIP_MOD) !== 0;
}

/**
 * The car's ordinal on the endless street: a value that grows by exactly one
 * per parked block — `k` minus its count of skipped (multiple-of-`CAR_SKIP_MOD`)
 * blocks. Because it steps by one *across* every skip, consecutive parked cars
 * are consecutive ordinals; that is what makes both the full-tone window and
 * the adjacency guarantee fall out.
 */
export function carOrdinal(k: number): number {
	return k - Math.floor(k / CAR_SKIP_MOD);
}

/**
 * The car-tone index for block `k` — the car's ordinal mod the four dusk tones,
 * floored positive so a negative block at the window edge still lands on a real
 * tone. Index `0..3`; feed it to `car()` from the sprite pack.
 */
export function carColor(k: number): number {
	return positiveMod(carOrdinal(k), CAR_TONES);
}

/** The first live block: the prototype's `floor(worldX / SPACING) - 1`. */
export function firstCarK(worldX: number): number {
	return Math.floor(worldX / SPACING) - 1;
}

/**
 * The parked cars alive for a scroll position — the prototype's `need` list. A
 * recycling window of `CAR_WINDOW` consecutive blocks starting at
 * `firstCarK(worldX)`, keeping every block but the skipped one (so four live
 * cars at any time, one block's worth of driveway gap in each window). Pure and
 * order-preserving: ascending `k`, one entry per parked block.
 */
export function carSlots(worldX: number, window: number = CAR_WINDOW): CarSlot[] {
	const k0 = firstCarK(worldX);
	const slots: CarSlot[] = [];
	for (let i = 0; i < window; i++) {
		const k = k0 + i;
		if (hasCar(k)) slots.push({ k, off: CAR_OFFSET, color: carColor(k) });
	}
	return slots;
}

/** A slot's screen x — the prototype's `k*SPACING + off - worldX`. */
export function carScreenX(slot: CarSlot, worldX: number): number {
	return slot.k * SPACING + slot.off - worldX;
}

/* ------------------------------------------------------------------ */
/* The passer — schedule + crossing curve (unchanged from the prototype) */
/* ------------------------------------------------------------------ */

/** When the passer first appears: `now + 45 s`. */
export function firstPasserAt(now: number): number {
	return now + PASSER_FIRST_MS;
}

/**
 * The gap until the next passer, in `[70 s, 100 s)`. `rng` is a `Math.random`
 * stand-in; it is clamped so a hostile source can never schedule a negative or
 * past-due gap.
 */
export function passerGap(rng: () => number): number {
	return PASSER_GAP_MIN_MS + clamp01(rng()) * PASSER_GAP_SPAN_MS;
}

/**
 * When the next passer fires, measured from the moment the previous one
 * *started* its crossing (`now`). Always ≥ `PASSER_GAP_MIN_MS` (70 s), so a
 * second passer can never be scheduled while one is still driving.
 */
export function nextPasserAt(now: number, rng: () => number): number {
	return now + passerGap(rng);
}

/** Clamped crossing progress `0..1` from the ms elapsed since the crossing began. */
export function passerProgress(elapsedMs: number, dur: number = PASSER_DUR_MS): number {
	return clamp01(elapsedMs / dur);
}

/**
 * The crossing curve: progress `t ∈ [0,1]` → stage x, a straight lerp from
 * `PASSER_FROM_X` (−170, off-screen left) to `PASSER_TO_X` (1030, off-screen
 * right). Strictly increasing, so the passer only ever sweeps one way.
 */
export function passerX(t: number): number {
	return PASSER_FROM_X + (PASSER_TO_X - PASSER_FROM_X) * clamp01(t);
}
