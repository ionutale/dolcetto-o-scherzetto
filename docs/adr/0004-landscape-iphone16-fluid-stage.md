# ADR-0004: Landscape-first, iPhone 16 reference stage

## Status
Accepted (2026-10-16)

## Context
This game continues a family of one-handed phone games (the sibling project *Wurstel e Sogni* reversed to a phone-column portrait layout — its ADR 0004). The design owner asked for landscape here, on an iPhone 16.

## Decision
Landscape-first, PWA `orientation: landscape`. The **design reference is the iPhone 16 in landscape (852×393 pt)**. The stage scales by height with **fluid width** — wider screens (iPad/desktop) simply reveal more street. Safe-area insets are respected (the Dynamic Island swaps sides on rotation). Portrait shows a friendly "turn the phone" screen.

## Considered Options
- **Fixed 4:3 letterboxed stage** — rejected: bars and dead space on every non-4:3 screen.
- **Fully responsive portrait too** — rejected: doubles layout, testing and art-fit work for a device the game isn't designed for.
- **Portrait-first like the sibling** — rejected: walking left/right along a street is inherently a landscape verb.

## Consequences
- Every UI mock is judged at 852×393 first.
- Hit-targets and thumb-reach are tuned for a phone in landscape (walk buttons bottom corners), not for tablets.
