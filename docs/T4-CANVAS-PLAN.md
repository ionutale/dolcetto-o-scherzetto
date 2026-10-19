# T4 — Canvas world migration plan (2026-10-19)

## Why

Six device logs (2026-10-18/19, builds `b837b53` → `5cc20f5`) proved:

- **Continuous walking kills the iOS WebContent process after ~16–36 s**
  (~3 100–5 000 px walked), on every build, regardless of content changes.
- Everything that **pauses** (doors, collects, the menu) survives for minutes:
  the retained scroll raster is released only when the page idles.
- Three countermeasures were shipped and falsified on device:
  1. **raster breath** (one committed hide frame every 12 s of walking) — `br`
     fired on cadence, deaths unchanged;
  2. **C1 bounded paints** (every scroll layer rebased to the live window) —
     deaths unchanged;
  3. **walk treadmill** (detach + re-attach every scroll layer every 1 500 px
     walked) — `rc` reached 12 in 36 s and the process died at 36 s anyway.

Conclusion: **DOM scrolling of this scene retains memory on iOS that no
page-side trick releases while rendering continues.** The fix is to stop
having DOM layers that scroll at all: draw the scrolling world into **one
canvas** — a single backing store, redrawn in place every frame. Constant
memory by construction. (The canvas prototype lineage, ADR-0001's scope, and
`restaurant-manager-game`'s static-scene architecture all point the same way.)

## What stays DOM and what becomes canvas

**Stays DOM (proven safe, kept for lower risk and better fidelity):**

- `Sky` backdrop (static), `Ghosts` (screen-space drift, small area);
- the **bands**: yards/sidewalk/road strips of `Street` — *static* elements
  whose only motion is a modulo'd `background-position` (T09b: repaint in
  place, no accumulation);
- everything gameplay-critical and screen-space: kids, scares, candy,
  bubbles, `KnockButton`, `Scherzo`, `Theatre`, celebration, HUD, menus.

**Becomes canvas (`WorldCanvas` replaces `ParallaxLayers`, `ThemeLayer`,
`Street`'s houses, `Cars`):**

- far + mid parallax bands (drawn only while in coverage);
- theme decor — sky half, ground half, shooting star;
- the recycling houses strip: house art, door leaf, neighbour reveal, glow,
  per-house yard dressing;
- parked cars + the rare passer (with its head-light cone).

Draw order (matches the DOM stacking): parallax → sky decor → shooting star
→ houses → cars → ground decor. The canvas sits above the DOM bands and
below the kids (`z-index 5`).

## Module layout (`src/lib/art/canvas/`)

| Module | Owner | Contract |
| --- | --- | --- |
| `env.ts` | orchestrator ✅ | `LayerEnv { worldX, tMs, reducedMotion }` |
| `raster.ts` | orchestrator ✅ | `rasterOf(key, svg)` async SVG→canvas (null while decoding); `shapeRaster(key, w, h, draw, {blurPx})` sync; `blit`; `svgSize` |
| `palette.ts` | orchestrator ✅ | §3 tokens resolved live (fallbacks pinned); `mix(a,b,t)`; `varColor('var(--x)')` |
| `houses-layer.ts` | free model · longcat-2.5-preview | `drawHousesLayer(ctx, pal, env, {homes, activeK, openK})` |
| `decor-layer.ts` | free model · glm-5.3-flash | `drawDecorSky(ctx, pal, env, theme)`, `drawDecorGround(...)`, `drawShootingStar(ctx, pal, x, y, t01)` |
| `cars-layer.ts` | free model · deepseek-v4.1-flash | `createCarsLayer(onCue)` → `{ draw(ctx, pal, env) }` |
| `parallax-layer.ts` | free model · nemotron-3-ultra | `drawParallaxLayer(ctx, pal, env)` |
| `WorldCanvas.svelte` | orchestrator | sizing (stage scale × DPR), rAF loop, draw order, stores, star scheduler, `data-world` hooks |
| `StreetBands.svelte` | orchestrator | the three static bands extracted from `Street` (T09b modulo kept) |

Reduced motion: layers read `env.reducedMotion` and hold rest states (the
door swing snapping is allowed, ambient loops rest — matching §13).

## Source of truth for the ports

Every visual constant comes from the current DOM components, 1:1 — the
art is owner-validated and must not be reinterpreted:

- houses: `src/lib/art/scene/HouseSlot.svelte` (+ `sprites/houses.ts`
  contract; doorway `x 92..148 / y H-80..H`; windows `.win` `#ffd9a0`),
  yard: `src/lib/art/scene/Yards.svelte`;
- decor + star: `src/lib/art/scene/ThemeLayer.svelte` + `theme-model.ts`;
- cars + passer: `src/lib/play/Cars.svelte` + `car-model.ts`;
- parallax: `src/lib/art/scene/ParallaxLayers.svelte` (+ C1 clamp/away).

Known approximations, commented as such in code: the door swing's
`rotateY(-68deg)`/`perspective: 300px` becomes a horizontal `scaleX`
(≈0.375) about the left edge; SVG-internal CSS animations from the sprite
pack (bat flaps, flame flicker) render at their rest state in v1 (flipbook
polish is a later pass).

## Acceptance

1. Unit: new layer tests (pure math: windowing, dressing rules, timings) +
   foundation tests — alongside the existing 669.
2. E2E (chromium): `world-canvas` spec — the canvas exists, draws non-empty
   pixels after play, survives a walk; the full flow suite (loop, settings,
   persist, blackbox…) stays green with the canvas mounted.
3. Visual parity: seeded save at a fixed k, side-by-side screenshots of the
   pre-migration build vs the canvas build (orchestrator eyeball; owner gets
   the same seed to compare live).
4. **The device gate (the only one that counts):** iPhone, pure walk 3+
   minutes without a kick-back, then normal play.

## Rollout / cleanup

- The old DOM scene components (`Street` houses part, `ThemeLayer`, `Cars`,
  `ParallaxLayers`) stop being mounted in `+page.svelte`; files are kept
  until the device gate passes, then deleted (with the treadmill wiring and
  its `rc` heartbeat field note updated).
- `docs/ISSUES.md` T38 grows the T4 row outcome; `ARCHITECTURE.md` scene row
  points at `WorldCanvas`.

## Status (2026-10-19, shipped)

Done in one pass: all four layer modules (free agents), the `WorldCanvas` shell, the page
swap (`StreetBands` + `WorldCanvas`), the canvas e2e + the flip e2e, parity screenshots
(`tools/canvas-parity.mjs`). Shipped with it: **T4b** — the manual presentation flip
(HUD button + Settings row; `RotateOverlay`, the lock attempt and the manifest
`orientation: landscape` are gone; resize/orientationchange only re-measure).

Known polish (after the device gate): door-leaf plank contrast is a touch stronger than the
DOM's, and CSS filter softness (drop-shadows) is approximated with canvas shadows.

Open: the device gate (3-minute pure walk), then delete the retired DOM scene components
(`Street`/`ThemeLayer`/`Cars`/`ParallaxLayers`), the walk-treadmill module and its dormant
`rc` heartbeat field.
