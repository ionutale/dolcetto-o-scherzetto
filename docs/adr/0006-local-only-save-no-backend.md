# ADR-0006: Local-only save, no backend

## Status
Accepted (2026-10-16)

## Context
The sibling project keeps a MongoDB-backed save synced to a local-first mirror. This game is a single-player, single-device toy for one child.

## Decision
No backend at all. Progress lives in `localStorage` — one slot, autosaved after every change, defensive reads/writes (never throws, versioned keys, mirrors the sibling project's `persist`/`settings` module patterns). No visible reset; a parent long-press reveals it.

## Considered Options
- **Cloud save** (like the sibling) — rejected: adds auth, privacy surface and servers for zero gameplay benefit; a kid's candy bag does not need a database.
- **Export/import save file** — parked as a v2 option if progress ever needs to survive a device wipe.

## Consequences
- Clearing Safari data wipes progress — accepted.
- Deployment is a pure static site (Vercel); there is no API surface to secure or maintain.
