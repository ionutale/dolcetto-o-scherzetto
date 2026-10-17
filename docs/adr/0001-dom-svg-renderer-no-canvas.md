# ADR-0001: DOM/SVG renderer, no canvas layer

## Status
Accepted (2026-10-16)

## Context
The game is a hand-drawn 2D side-view world that scrolls endlessly with a small cast on screen at once. The obvious default for browser games is a canvas renderer (Phaser 3 or raw canvas).

## Decision
Render everything with DOM + inline SVG animated by CSS (transform/opacity only), with a recycling window of ~20 houses and pooled sprites so node counts stay constant. No canvas layer, no game engine.

## Considered Options
- **Phaser 3 / raw canvas** — rejected: all art is hand-built SVG with CSS hooks; store/dialog UI is HTML anyway; DOM hit-zones, inspectability and Playwright testability are free; worst-case concurrency (~450 animated nodes, GPU-composited transforms) is trivial for the target iPhone 16.
- **Hybrid canvas particle layer** — parked: only justified if we ever want particle storms (>~1000 concurrent). One local layer can be added without touching the architecture.

## Consequences
- Node/animation budgets are a first-class constraint — documented in `ARCHITECTURE.md` when written.
- The world's endlessness is a *recycling* problem, not a memory-management problem.
- Tests can assert against the DOM (Playwright) instead of pixels.
