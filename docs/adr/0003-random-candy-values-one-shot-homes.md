# ADR-0003: Random candy values, one-shot homes, capped re-gift

## Status
Accepted (2026-10-16)

## Context
The economy is the game's only progression: candy sums into a bag that buys tricks. The first design instinct — 10 candy types with fixed values 1–10 — was rejected by the design owner in favor of rolled values.

## Decision
- Every treat rolls a **uniform 1–10 value at drop**; the 10 candy types are purely cosmetic.
- Homes are **one-shot** (treat collected or scherzo played = done).
- A done home **re-gifts at most once ever** (~30% on the first re-knock, one small treat), otherwise it tells a funny "we've already met" line.
- Stronger tricks bias burst **quantity** (4→8 candies), not value rolls; exact curves live in `BALANCE.md`.

## Considered Options
- **Fixed value per type** (learnable ladder) — rejected: flat, and the kid learns "boring" candies instead of delight.
- **Unlimited random re-gifts** — rejected: a kid can farm one house forever, deflating the Bottega.
- **Distance-gated re-gifts** — rejected: elegant but unexplainable to a 7-year-old.

## Consequences
- The shop price ladder must absorb variance; first trick pace targets ~10–12 candy events.
- Save schema stores bag, excuses farm-adjacent states (used/flags per home are short-lived, not saved).
