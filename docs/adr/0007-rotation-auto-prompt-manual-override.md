# ADR-0007: Rotation mode — automatic CSS prompt by default, manual override

## Status
Accepted (2026-10-29). Supersedes the "portrait shows a friendly turn-the-phone screen"
consequence of [ADR-0004](0004-landscape-iphone16-fluid-stage.md) and the "no rotate prompt"
clause of T40 in `ISSUES.md`.

## Context
ADR-0004 made the game landscape-first and covered portrait with a CSS "Gira il telefono"
overlay. T40 (2026-10-19) removed that overlay and the guarded `screen.orientation.lock`
attempt: from then on the player turned the stage by hand with a quarter-turn rotate button,
and `rotation` in `dos.settings.v1` remembered the angle. The owner has now asked for the
automatic behaviour back **as the default**, while keeping the manual rotation as a choice in
Settings and keeping the stored angle as the game's default position.

There is no `DeviceOrientationEvent` anywhere in this repo, before or after T40. The thing
removed was a pure-CSS media query, not a sensor; "re-adding the accelerometer" therefore
means re-adding the CSS overlay, not asking iOS for motion permission.

## Decision
`dos.settings.v1` gains an optional `rotationMode: 'auto' | 'manual'`; missing reads as
`'auto'` (no envelope bump, no reset; a pre-T43 envelope keeps its `rotation` angle).

- **`'auto'` (default)** — a portrait viewport shows the pure-CSS
  `@media (orientation: portrait)` overlay, "Gira il telefono" / "Turn the phone to play" in
  `settings.lang`. Nothing reads a sensor and no JS listener decides presentation.
- **`'manual'`** — no prompt; the player turns the stage with the rotate button.
- The persisted `rotation` angle drives the stage in **both** modes. The mode only decides
  whether the prompt may appear — carousel, Settings row and HUD button are unchanged and
  keep moving the same angle.
- The prompt is a full-screen `position: fixed` panel at `z-index: 100`: above the stage and
  the boss (z 10), below the title menu (z 200), so Impostazioni stays reachable while it is
  up. It carries one **durable** escape pill, "Gioca così" / "Play this way", which writes
  `'manual'` — the child is asked at most once per device.

## Considered Options
- **Real `DeviceOrientationEvent`** — rejected: needs a one-time iOS permission tap, and it
  is the only option that detects the physical hold when rotation lock is on. Worth
  revisiting only if a locked phone becomes a real complaint.
- **CSS auto-turn (rotate the stage 90° in portrait)** — rejected: the content fills the
  screen but reads sideways for an upright hold; it only wins in the narrow case where the
  viewport is stuck portrait while the phone is physically on its side, and CSS cannot tell.
- **Title-only prompt** — rejected: a child can rotate back to portrait mid-run and end up
  playing a squashed stage with no hint.
- **Session-only escape pill** — rejected by the owner: one tap and the prompt never returns.

## Consequences
- Auto and manual differ by exactly one thing: whether the prompt may appear. Two code paths
  to test, one angle to keep consistent.
- A phone on rotation lock cannot turn, so the prompt is a dead end except for its pill —
  which permanently disables auto on that device. The Settings `Schermo` row is the way back.
- A tall desktop browser window gets the prompt too; no device gating is added.
- `RotatePrompt.svelte` must stay outside `<Stage>`: `.stage` carries a transform, and a
  transformed ancestor would turn `position: fixed` into a local containing box.
- `tools/canvas-parity.mjs` seeds `rotationMode: 'manual'` so a portrait parity screenshot is
  not covered by the prompt.
