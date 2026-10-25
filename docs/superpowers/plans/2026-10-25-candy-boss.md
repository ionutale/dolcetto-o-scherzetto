# Candy Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the friendly candy-boss milestone: a rotating boss at 1 000 then every 500 candies, defeated by throwing candies (1 each, 30 hits, 60 reward), on by default and switchable off in Settings, with no canvas or scrolling changes.

**Architecture:** A pure `boss-model.ts` decides when/who and holds the cadence maths; a DOM `Boss.svelte` overlay stages the fight above the paused world; the page owns the trigger and the wallet actions (`SPEND_CANDY` / `BOSS_REWARD`). The run schema v2 gains `nextBossAt` / `bossWins`, and the page autosave finally writes v2 (preserving `homes`, `album`, `cosmetics`). No new sim phase, no canvas work, no new save key.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest, Playwright, pnpm. localStorage persistence, pure sim reducer.

**Spec:** `docs/superpowers/specs/2026-10-25-candy-boss-design.md`

## Global Constraints

- Boss thresholds: **1 000**, then every **500** (1 500, 2 000…).
- Defeat at **30 hits**; **1 candy** spent per accepted throw; **60 candies** reward; no fail state, bag never negative.
- Rotation by wins: **zucca → mostro → recaramella** (`bossWins % 3`).
- Bosses are **on by default**; the Settings toggle is the only way to disable them.
- The boss is a DOM overlay **inside the 852×393 stage**; never add canvas drawing, a scrolling layer or a new raster cache.
- Tap anywhere on the stage; keyboard Space/Enter must also throw; all motion must degrade under `prefers-reduced-motion`.
- The run save is v2, key unchanged (`dos.run.v1`); new fields must never wipe a v1 or mid-v2 save.
- IT/EN copy for every player-visible string.
- Use `pnpm`; never npm. e2e must run on a clean port: `PORT=4188 pnpm test:e2e` (4173 is often held by a stale server).
- Existing conventions: tabs, single quotes, comments explaining *why*, Vitest tests beside modules, Playwright specs in `tests/e2e/`.

## Review Focus

These are the non-obvious failure modes the tests must pin, most likely first:

1. **A mid-v2 save with no boss fields** (every device updating today) must load with `nextBossAt=1000` / `bossWins=0`, not be refused or wiped.
2. **A due boss while a flow/shop/scare/menu/celebration is active** must wait; it must not start twice or start behind the title.
3. **Rapid taps / a bag that reaches 0** must never make the bag negative, never double-award the win, and never leave HP below 0.
4. **Settings off mid-fight and reload after spending** must cancel cleanly: no reward, no instant re-trigger, spent candies stay spent.
5. **Rotated stage / reduced motion / keyboard** must keep the overlay inside the stage and the fight playable without pointer motion.

---

### Task 1: Boss cadence model

**Files:**
- Create: `src/lib/play/boss-model.ts`
- Test: `src/lib/play/boss-model.test.ts`

**Interfaces:**
- Consumes: `Phase` from `$lib/sim/loop` (type only).
- Produces:
  - `BOSS_FIRST = 1000`, `BOSS_STEP = 500`, `BOSS_HP = 30`, `BOSS_COST = 1`, `BOSS_REWARD = 60`
  - `BOSS_ORDER = ['zucca', 'mostro', 'recaramella'] as const`; `type BossId`
  - `nextBossAtAbove(bag: number): number` — smallest grid point strictly above the bag, minimum 1 000
  - `nextBossAtAfterWin(bag: number): number` — same, minimum 1 500
  - `bossDue(bag: number, nextBossAt: number, enabled: boolean): boolean`
  - `bossFor(bossWins: number): BossId`
  - `normalizeBossProgress(bag: number, rawNext: unknown, rawWins: unknown): { nextBossAt: number; bossWins: number }`
  - `interface BossGate`, `bossMayStart(gate: BossGate): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/play/boss-model.test.ts` with these cases (use `describe`/`it`/`expect` from `vitest`):

```ts
import { describe, expect, it } from 'vitest';
import {
	BOSS_FIRST,
	BOSS_COST,
	BOSS_HP,
	BOSS_REWARD,
	BOSS_STEP,
	bossDue,
	bossFor,
	bossMayStart,
	nextBossAtAbove,
	nextBossAtAfterWin,
	normalizeBossProgress
} from './boss-model';

describe('thresholds', () => {
	it('starts at 1000 and walks the 500 grid strictly above the bag', () => {
		expect(nextBossAtAbove(0)).toBe(1000);
		expect(nextBossAtAbove(999)).toBe(1000);
		expect(nextBossAtAbove(1000)).toBe(1500);
		expect(nextBossAtAbove(1060)).toBe(1500);
		expect(nextBossAtAbove(1500)).toBe(2000);
		expect(nextBossAtAbove(5476)).toBe(5500);
	});

	it('floors the post-win threshold at 1500', () => {
		expect(nextBossAtAfterWin(500)).toBe(1500);
		expect(nextBossAtAfterWin(1030)).toBe(1500);
		expect(nextBossAtAfterWin(1530)).toBe(2000);
		expect(nextBossAtAfterWin(5446)).toBe(5500);
	});

	it('is due only when enabled and the bag is at or above the threshold', () => {
		expect(bossDue(999, 1000, true)).toBe(false);
		expect(bossDue(1000, 1000, true)).toBe(true);
		expect(bossDue(1200, 1000, false)).toBe(false);
	});
});

describe('rotation', () => {
	it('cycles zucca, mostro, recaramella and wraps negatives', () => {
		expect(bossFor(0)).toBe('zucca');
		expect(bossFor(1)).toBe('mostro');
		expect(bossFor(2)).toBe('recaramella');
		expect(bossFor(3)).toBe('zucca');
		expect(bossFor(-1)).toBe('recaramella');
	});
});

describe('normalisation', () => {
	it('fills missing fields with the welcome defaults', () => {
		expect(normalizeBossProgress(5416, undefined, undefined)).toEqual({
			nextBossAt: 1000,
			bossWins: 0
		});
	});

	it('keeps a valid threshold and win count', () => {
		expect(normalizeBossProgress(1000, 1500, 2)).toEqual({ nextBossAt: 1500, bossWins: 2 });
	});

	it('repairs a present malformed threshold above the bag, and bad wins to 0', () => {
		expect(normalizeBossProgress(5416, 'soon', 3)).toEqual({ nextBossAt: 5500, bossWins: 3 });
		expect(normalizeBossProgress(0, 1234, -2)).toEqual({ nextBossAt: 1000, bossWins: 0 });
		expect(normalizeBossProgress(0, 1000, 1.5)).toEqual({ nextBossAt: 1000, bossWins: 0 });
	});
});

describe('bossMayStart', () => {
	const base = {
		enabled: true,
		bag: 1000,
		nextBossAt: 1000,
		phase: 'roam' as const,
		shopOpen: false,
		scareActive: false,
		menuOpen: false,
		celebrating: false,
		active: false
	};

	it('starts only in a quiet roam', () => {
		expect(bossMayStart(base)).toBe(true);
		expect(bossMayStart({ ...base, phase: 'door' })).toBe(false);
		expect(bossMayStart({ ...base, shopOpen: true })).toBe(false);
		expect(bossMayStart({ ...base, scareActive: true })).toBe(false);
		expect(bossMayStart({ ...base, menuOpen: true })).toBe(false);
		expect(bossMayStart({ ...base, celebrating: true })).toBe(false);
		expect(bossMayStart({ ...base, active: true })).toBe(false);
		expect(bossMayStart({ ...base, enabled: false })).toBe(false);
		expect(bossMayStart({ ...base, bag: 999 })).toBe(false);
	});
});

describe('pinned knobs', () => {
	it('keeps the agreed fight values', () => {
		expect(BOSS_FIRST).toBe(1000);
		expect(BOSS_STEP).toBe(500);
		expect(BOSS_HP).toBe(30);
		expect(BOSS_COST).toBe(1);
		expect(BOSS_REWARD).toBe(60);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/play/boss-model.test.ts`
Expected: FAIL — cannot resolve `./boss-model`.

- [ ] **Step 3: Implement `src/lib/play/boss-model.ts`**

Export the constants and types above. Implement:
- `nextBossAtAbove(bag) = Math.max(BOSS_FIRST, (Math.floor(Math.max(0, bag) / BOSS_STEP) + 1) * BOSS_STEP)`
- `nextBossAtAfterWin(bag) = Math.max(BOSS_FIRST + BOSS_STEP, nextBossAtAboveUnfloored(bag))` — factor the grid step so the floor is the only difference.
- `bossDue(bag, nextAt, enabled) = enabled && nextAt >= BOSS_FIRST && bag >= nextAt`.
- `bossFor(wins)` uses a positive modulo over `BOSS_ORDER`.
- `normalizeBossProgress(bag, rawNext, rawWins)`:
  - wins: `typeof === 'number' && Number.isFinite && Number.isInteger && >= 0` ? value : 0.
  - next: `undefined` → `BOSS_FIRST`; valid (finite integer ≥ 1 000 and `% 500 === 0`) → value; anything else present → `nextBossAtAbove(bag)`.
- `bossMayStart` returns false on any blocked gate, otherwise `bossDue(...)` and `!active`.
- Add a module comment citing the spec: friendly challenge, no fail, no canvas changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/play/boss-model.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/boss-model.ts src/lib/play/boss-model.test.ts
git commit -m "feat(boss): pin the candy-boss cadence, rotation and start gate"
```

---

### Task 2: Settings boss toggle

**Files:**
- Modify: `src/lib/persist/settings.ts`
- Test: `src/lib/persist/settings.test.ts`
- Create: `src/lib/play/boss-setting.svelte.ts`
- Create: `src/lib/play/boss-setting.test.ts`
- Modify: `src/lib/ui/Settings.svelte`

**Interfaces:**
- Consumes: `settings` singleton and `SettingsStore` from `$lib/persist/settings`.
- Produces:
  - `Settings.bosses?: boolean` (missing = true), `DEFAULT_SETTINGS.bosses = true`
  - `bossEnabled(store?: SettingsStore): boolean`
  - `setBossEnabled(on: boolean, store?: SettingsStore): void` (spreads the stored settings)
  - `bossesEnabled(): boolean` (reactive), `setBosses(on: boolean, store?: SettingsStore): void`, `loadBosses(store?: SettingsStore): void`

- [ ] **Step 1: Write the failing envelope tests**

In `src/lib/persist/settings.test.ts`, update the default expectation to include `bosses: true`, and add:

```ts
it('a pre-boss envelope loads with bosses on', () => {
	const storage = memoryStorage();
	storage.setItem(
		SETTINGS_KEY,
		JSON.stringify({ version: 1, lang: 'it', sound: true, musicVolume: 1, sfxVolume: 1 })
	);
	expect(createSettings(storage).read().bosses).toBeUndefined();
	expect(createSettings(storage).read().bosses ?? true).toBe(true);
});

it('accepts a boolean bosses field and refuses a non-boolean one', () => {
	expect(isSettings(settingsWith({ bosses: false }))).toBe(true);
	expect(isSettings(settingsWith({ bosses: true }))).toBe(true);
	expect(isSettings({ ...settingsWith(), bosses: 'yes' })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/lib/persist/settings.test.ts`
Expected: FAIL — `bosses` is not in `Settings`/defaults.

- [ ] **Step 3: Implement the settings field and the reactive store**

In `settings.ts`:
- Add the optional `bosses?: boolean` field with a comment: added for the candy boss; missing means on.
- Add `bosses: true` to `DEFAULT_SETTINGS`.
- Extend `isSettings`: `settings.bosses === undefined || typeof settings.bosses === 'boolean'`.

Create `boss-setting.svelte.ts`:

```ts
import { settings } from '$lib/persist/settings';
import type { SettingsStore } from '$lib/persist/settings';

export function bossEnabled(store: SettingsStore = settings): boolean {
	return store.read().bosses ?? true;
}

export function setBossEnabled(on: boolean, store: SettingsStore = settings): void {
	store.write({ ...store.read(), bosses: on });
}

let state = $state(bossEnabled());

export function bossesEnabled(): boolean {
	return state;
}

export function setBosses(on: boolean, store: SettingsStore = settings): void {
	state = on;
	setBossEnabled(on, store);
}

export function loadBosses(store: SettingsStore = settings): void {
	state = bossEnabled(store);
}
```

- [ ] **Step 4: Write the failing reactive-store test**

Create `src/lib/play/boss-setting.test.ts` with a memory `SettingsStore`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettings } from '$lib/persist/settings';
import { bossEnabled, setBossEnabled } from './boss-setting.svelte';

function memoryStorage(): Storage { /* same shape as settings.test.ts */ }

describe('boss setting', () => {
	it('defaults on and writes the toggle without clobbering other fields', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		expect(bossEnabled(store)).toBe(true);
		setBossEnabled(false, store);
		const saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}');
		expect(saved.bosses).toBe(false);
		expect(saved.lang).toBe('it');
		expect(saved.musicVolume).toBe(1);
		expect(bossEnabled(store)).toBe(false);
	});
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/lib/persist/settings.test.ts src/lib/play/boss-setting.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the Settings row**

In `src/lib/ui/Settings.svelte`:
- Import `bossesEnabled`, `setBosses` from `$lib/play/boss-setting.svelte`.
- Add copy: `boss: 'Boss'`, `bossOn: 'Sì'` / `'On'`, `bossOff: 'No'` / `'Off'`.
- After the `Schermo` row, add a `lang-row` group with the label and two buttons `#bossOnBtn` / `#bossOffBtn`, `aria-pressed={bossesEnabled() === ...}`, `onclick={() => setBosses(true/false)}`. Use the existing `.lang-btn`/`.on` styles.
- Keep the row before the error-log row; the parent finds it with the other preferences.

- [ ] **Step 7: Verify formatting and types**

Run: `pnpm check && pnpm lint`
Expected: no new errors (the existing 2 persist errors may remain until Task 5; the new files must be clean).

- [ ] **Step 8: Commit**

```bash
git add src/lib/persist/settings.ts src/lib/persist/settings.test.ts \
  src/lib/play/boss-setting.svelte.ts src/lib/play/boss-setting.test.ts src/lib/ui/Settings.svelte
git commit -m "feat(boss): add the parent-facing bosses setting (default on)"
```

---

### Task 3: Wallet actions

**Files:**
- Modify: `src/lib/sim/loop.ts`
- Test: `src/lib/sim/loop.test.ts`

**Interfaces:**
- Produces:
  - `Action` gains `{ type: 'SPEND_CANDY' }` and `{ type: 'BOSS_REWARD'; n: number }`.
  - `SPEND_CANDY`: `bag > 0` → `bag - 1`; else the same state.
  - `BOSS_REWARD`: finite positive `n` → `bag + n`, `record = max(record, bag)`; else the same state.

- [ ] **Step 1: Write the failing reducer tests**

Add a `describe('boss wallet actions')` to `src/lib/sim/loop.test.ts`:

```ts
it('SPEND_CANDY subtracts one and never goes negative', () => {
	const start = { ...initial(), bag: 1 };
	const spent = reduce(start, { type: 'SPEND_CANDY' });
	expect(spent.bag).toBe(0);
	expect(reduce(spent, { type: 'SPEND_CANDY' })).toBe(spent);
});

it('BOSS_REWARD adds the reward and lifts the record', () => {
	const start = { ...initial(), bag: 1000, record: 1000 };
	const won = reduce(start, { type: 'BOSS_REWARD', n: 60 });
	expect(won.bag).toBe(1060);
	expect(won.record).toBe(1060);
});

it('BOSS_REWARD ignores zero, negative and non-finite n', () => {
	const start = { ...initial(), bag: 10, record: 10 };
	expect(reduce(start, { type: 'BOSS_REWARD', n: 0 })).toBe(start);
	expect(reduce(start, { type: 'BOSS_REWARD', n: -5 })).toBe(start);
	expect(reduce(start, { type: 'BOSS_REWARD', n: Number.NaN })).toBe(start);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/lib/sim/loop.test.ts -t "boss wallet actions"`
Expected: FAIL — TypeScript cannot accept the actions / no cases.

- [ ] **Step 3: Implement the reducer cases**

Add the two union members and cases in `reduce`. `SPEND_CANDY` returns the same object when `bag <= 0`. `BOSS_REWARD` floors and validates `n`; it must not mutate the input.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/lib/sim/loop.test.ts`
Expected: PASS, including the existing reducer suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/loop.ts src/lib/sim/loop.test.ts
git commit -m "feat(boss): add SPEND_CANDY and BOSS_REWARD wallet actions"
```

---

### Task 4: Save schema v2 with boss progress

**Files:**
- Modify: `src/lib/persist/persist.ts`
- Test: `src/lib/persist/persist.test.ts`

**Interfaces:**
- Consumes: `BOSS_FIRST`, `normalizeBossProgress` from `$lib/play/boss-model`.
- Produces:
  - `RunState.nextBossAt?: number`, `RunState.bossWins?: number` (optional for mid-v2 saves).
  - `migrateRunV1` returns `nextBossAt: BOSS_FIRST`, `bossWins: 0`.
  - `normalizeRun` fills/repairs boss fields for every accepted v2 payload.
  - `isRunState` validates the existing v2 fields; boss fields are normalized, not a refusal reason.

- [ ] **Step 1: Rewrite the test fixture and add boss cases**

In `src/lib/persist/persist.test.ts`:
- Change `aRun()` to a v2 fixture:

```ts
function aRun(overrides: Partial<RunState> = {}): RunState {
	return {
		version: 2,
		bag: 42,
		record: 120,
		tricks: ['boo', 'ragnetto'],
		furthestK: 3,
		homes: {},
		album: emptyAlbum(),
		cosmetics: [],
		nextBossAt: 1500,
		bossWins: 0,
		...overrides
	};
}
```

- Update the schema-version tests: `version: 3` must be refused; a v1 payload is migrated, not refused.
- Add:

```ts
it('migrates v1 with the welcome boss defaults', () => {
	const storage = memoryStorage();
	poison(
		storage,
		JSON.stringify({ version: 1, bag: 5, record: 9, tricks: ['boo'], furthestK: 2 })
	);
	expect(createPersist(storage).read()).toMatchObject({
		version: 2,
		nextBossAt: 1000,
		bossWins: 0
	});
});

it('fills a mid-v2 save missing the boss fields', () => {
	const storage = memoryStorage();
	const mid = aRun({ bag: 5416 });
	delete mid.nextBossAt;
	delete mid.bossWins;
	poison(storage, JSON.stringify(mid));
	expect(createPersist(storage).read()).toMatchObject({
		nextBossAt: 1000,
		bossWins: 0
	});
});

it('repairs malformed present boss fields instead of wiping', () => {
	const storage = memoryStorage();
	poison(storage, JSON.stringify({ ...aRun({ bag: 5416 }), nextBossAt: 1234, bossWins: -2 }));
	expect(createPersist(storage).read()).toMatchObject({
		bag: 5416,
		nextBossAt: 5500,
		bossWins: 0
	});
});
```

- The corrupted-payload recovery test now compares against the v2 fixture; it stays.
- Add `emptyAlbum` to the imports.

- [ ] **Step 2: Run the persist test to verify it fails**

Run: `pnpm exec vitest run src/lib/persist/persist.test.ts`
Expected: FAIL on the migration/normalisation cases (and the old v1 fixture expectations).

- [ ] **Step 3: Implement the schema changes**

In `persist.ts`:
- Import `BOSS_FIRST`, `normalizeBossProgress`.
- Add the optional fields with comments.
- `migrateRunV1` adds the defaults.
- `normalizeRun`: after `isRunState(value)`, return `{ ...value, ...normalizeBossProgress(value.bag, value.nextBossAt, value.bossWins) }`.
- `isRunState` keeps its existing base checks; do not reject on boss fields (the normaliser owns them). The doc comment explains the deliberate repair.
- `emptyAlbum`/`SAVE_EXPORT` unchanged; the export now includes the boss fields.

- [ ] **Step 4: Run the persist test and the whole unit suite**

Run: `pnpm exec vitest run src/lib/persist/persist.test.ts && pnpm test:unit`
Expected: persist suite PASS; the only remaining failure is the `+page` v1-literal type error until Task 5 (no unit failures).

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist/persist.ts src/lib/persist/persist.test.ts
git commit -m "feat(boss): persist nextBossAt/bossWins in the v2 run save"
```

---

### Task 5: Boss progress store and v2 autosave

**Files:**
- Modify: `src/lib/state/game.svelte.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `tests/e2e/support/game.ts`

**Interfaces:**
- Produces:
  - `bossNextAt(): number` — next threshold, seeded from the save.
  - `bossWins(): number` — bosses beaten, seeded from the save.
  - `recordBossWin(nextAt: number): void` — set the next threshold and increment wins.
  - `skipBoss(nextAt: number): void` — set the next threshold without a win.
- Consumes: `RunState` v2, `emptyAlbum`, `BOSS_FIRST`, the live `homes()` getter.

- [ ] **Step 1: Add the store fields and getters**

In `game.svelte.ts`:
- Seed from `saved`: `let bossNext = $state(saved?.nextBossAt ?? BOSS_FIRST);` and `let bossWinsCount = $state(saved?.bossWins ?? 0);`.
- Export `bossNextAt()`, `bossWins()`, `recordBossWin(nextAt)`, `skipBoss(nextAt)`.
- `recordBossWin` must update both fields synchronously; `skipBoss` only the threshold.
- Import `BOSS_FIRST` from `$lib/play/boss-model`.
- Comment: the fields are run progress, not sim state; the parent reset reloads the module.

- [ ] **Step 2: Rewrite the autosave to v2**

In `+page.svelte`:
- At module scope, take a `const savedRun = persist.read();` snapshot and precompute `savedAlbum = savedRun?.album ?? emptyAlbum()` and `savedCosmetics = savedRun?.cosmetics ?? []`.
- Import `emptyAlbum` from `$lib/persist/persist`; import `bossNextAt`, `bossWins` from the store.
- Replace the autosave object with:

```ts
const run: RunState = {
	version: 2,
	bag: bag(),
	record: record(),
	tricks: [...tricks()],
	furthestK: furthest(),
	homes: Object.fromEntries(
		Object.entries(homes()).map(([k, h]) => [
			k,
			{ done: h.done, used: h.used, kind: h.kind }
		])
	),
	album: savedAlbum,
	cosmetics: savedCosmetics,
	nextBossAt: bossNextAt(),
	bossWins: bossWins()
};
```

- Update the effect comment: v2, boss fields, album/cosmetics preserved (the album UI is out of scope), live homes.

- [ ] **Step 3: Update the e2e seed/read types**

In `tests/e2e/support/game.ts`:
- Add `bosses?: boolean` to `SettingsSnapshot` so `seedSettings`/`readSettings` can drive the toggle.
- Keep the existing `seedRun` v1 helper (it exercises migration).
- Add `RunSnapshotV2` and `seedRunV2(page, run: Partial<RunSnapshotV2>)`, following the same first-boot guard with a distinct guard key (`dos.run.v1.v2seeded`) so a v1 and v2 seed never collide.
- Add `readRunV2(page)` returning `RunSnapshotV2 | null` (raw JSON parse).
- Keep `readRun` for the existing v1-shaped tests; update its return type to `RunSnapshot | RunSnapshotV2 | null` if TypeScript complains.

- [ ] **Step 4: Verify the type errors and unit failures are gone**

Run: `pnpm check && pnpm test:unit && pnpm lint`
Expected: svelte-check **0 errors**; unit **all green** (the 3 persist failures fixed in Task 4); lint green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/state/game.svelte.ts src/routes/+page.svelte tests/e2e/support/game.ts
git commit -m "feat(boss): seed boss progress and write the v2 autosave"
```

---

### Task 6: Boss art pack

**Files:**
- Create: `src/lib/play/boss-art.ts`
- Test: `src/lib/play/boss-art.test.ts`

**Interfaces:**
- Consumes: `BossId` from `./boss-model`, `Lang` from `$lib/sim/loop`.
- Produces:
  - `BOSS_META: Record<BossId, { id: BossId; name: Record<Lang, string> }>`
  - `bossArt(id: BossId): string` — a full `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="280" viewBox="0 0 260 280" data-boss="<id>">…</svg>`
  - `BOSS_COPY: Record<Lang, { hint: string; win: string; reward: string; throwLabel: string }>`

- [ ] **Step 1: Write the failing art tests**

Create `src/lib/play/boss-art.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOSS_COPY, BOSS_META, bossArt } from './boss-art';
import { BOSS_ORDER } from './boss-model';

describe('boss art', () => {
	it('builds a standalone svg for every boss', () => {
		for (const id of BOSS_ORDER) {
			const svg = bossArt(id);
			expect(svg.startsWith('<svg')).toBe(true);
			expect(svg.endsWith('</svg>')).toBe(true);
			expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
			expect(svg).toContain('viewBox="0 0 260 280"');
			expect(svg).toContain(`data-boss="${id}"`);
		}
	});

	it('gives every boss a distinct body and both names', () => {
		const arts = BOSS_ORDER.map((id) => bossArt(id));
		expect(new Set(arts).size).toBe(3);
		for (const id of BOSS_ORDER) {
			expect(BOSS_META[id].name.it.length).toBeGreaterThan(0);
			expect(BOSS_META[id].name.en.length).toBeGreaterThan(0);
			expect(BOSS_META[id].id).toBe(id);
		}
	});

	it('ships the IT/EN fight copy', () => {
		expect(BOSS_COPY.it.hint).toBe('Tocca per lanciare caramelle');
		expect(BOSS_COPY.en.hint).toBe('Tap to throw candy');
		expect(BOSS_COPY.it.win.length).toBeGreaterThan(0);
		expect(BOSS_COPY.en.win.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/play/boss-art.test.ts`
Expected: FAIL — cannot resolve `./boss-art`.

- [ ] **Step 3: Implement the three SVGs and copy**

- `zucca`: pumpkin body, green stem, amber crown, big grin; class hooks `boss-body`, `boss-eye`, `boss-mouth`, `boss-crown`, `boss-arm-l`, `boss-arm-r`.
- `mostro`: lavender fur, pale belly, tongue, horns; same hooks where useful.
- `recaramella`: berry wrapper cape, lollipop shoulders, amber crown.
- Use the palette tokens/hexes from the existing sprite packs; no outlines, rounded shapes (ART-STYLE).
- Names: `{ it: 'Grande Zucca', en: 'Great Pumpkin' }`, `{ it: 'Mostro Goloso', en: 'Sweet-Tooth Monster' }`, `{ it: 'Re Caramella', en: 'Candy King' }`.
- Copy: hint as tested; win `Bravissimo!` / `You did it!`; reward `+60 caramelle` / `+60 candies`; throwLabel `Lancia una caramella` / `Throw a candy`.
- Keep the art static; no `id` attributes (avoid duplicate ids if a shower reuses it).

- [ ] **Step 4: Run the art tests**

Run: `pnpm exec vitest run src/lib/play/boss-art.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/boss-art.ts src/lib/play/boss-art.test.ts
git commit -m "feat(boss): add the three boss art sets and IT/EN copy"
```

---

### Task 7: Boss overlay and page integration (vertical slice)

**Files:**
- Create: `src/lib/play/Boss.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/ui/Hud.svelte`
- Test: `tests/e2e/boss.spec.ts`

**Interfaces:**
- `Boss` props:
  ```ts
  interface Props {
  	id: BossId;
  	bag: number;
  	onThrow: () => boolean;
  	onWin: () => void;
  	onExit: () => void;
  	sound?: (cue: string) => void;
  }
  ```
- `Boss` owns `hp`, `phase` (`enter|fight|win|leave`), the hit pulse, the projectile pool and the shower; it calls `onThrow` before decrementing HP and `onWin` exactly once at 0.
- Page state: `let boss = $state<{ id: BossId } | null>(null);` and `const bossActive = $derived(boss !== null);`
- `Hud` props gain `bossActive?: boolean`; the Bottega pill is not rendered while true.

- [ ] **Step 1: Write the failing core e2e**

Create `tests/e2e/boss.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import {
	bagChip,
	openTitle,
	play,
	readRunV2,
	seedRunV2,
	seedSettings
} from './support/game';

test('the 1000-candy boss appears, takes 30 throws and banks the reward', async ({ page }) => {
	await seedSettings(page, { sound: false, musicVolume: 0, sfxVolume: 0 });
	await seedRunV2(page, { bag: 1000, record: 1000, nextBossAt: 1000, bossWins: 0 });
	await openTitle(page);
	await play(page);

	const layer = page.locator('#bossLayer');
	await expect(layer).toBeVisible({ timeout: 5_000 });
	await expect(layer).toHaveAttribute('data-boss', 'zucca');
	await expect(page.locator('#bossName')).toHaveText('Grande Zucca');

	await expect(layer).toHaveAttribute('data-phase', 'fight', { timeout: 3_000 });
	const tap = page.locator('#bossTap');
	for (let i = 0; i < 30; i++) await tap.click({ position: { x: 420, y: 200 } });

	await expect(page.locator('#bossWin')).toBeVisible({ timeout: 5_000 });
	await expect(bagChip(page)).toHaveText('1030');
	await expect
		.poll(async () => (await readRunV2(page))?.nextBossAt)
		.toBe(1500);
	await expect.poll(async () => (await readRunV2(page))?.bossWins).toBe(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PORT=4188 pnpm test:e2e --grep "1000-candy boss"`
Expected: FAIL — `#bossLayer` never appears.

- [ ] **Step 3: Build `Boss.svelte`**

- Layer `#bossLayer` (position absolute, inset 0, `z-index: 10`, `data-boss`, `data-phase`), veil, full-stage `button#bossTap` with `aria-label` from `BOSS_COPY[lang()].throwLabel`, the boss name `#bossName`, the HP bar with `role="progressbar"` and `aria-valuenow`, the boss art `{@html bossArt(id)}` in a `.boss-art` (pointer-events none), the hint, the projectiles, the shower and `#bossWin` during the win.
- Entry: `phase='enter'` for 900 ms, then `fight`; clear the timer on destroy.
- `throwCandy()`: ignore unless `phase === 'fight'`, `hp > 0` and `bag > 0`; call `onThrow()`; if false, do nothing. On success: `hp -= 1`, play `pop`, spawn a cosmetic projectile (cap 8; remove on `animationend`), set a 160 ms `bonking` class; if `hp === 0` call `win()` once.
- `win()`: `phase='win'`, `shower=true`, play `theatre-laugh`; call `onWin()`; after 1 200 ms set `phase='leave'`; after 700 ms call `onExit()`.
- Layout: boss `.boss-art` at `right: 110px; bottom: 56px; width: 260px; height: 280px`; mouth anchor ~`(625, 205)` stage px; shot starts at `(320, 300)`. The name/HP are top-centre; the hint bottom-centre; the veil is `rgba(12,7,30,.35)`.
- CSS: the boss entry slide/stomp, idle bob, hit squash, happy spin, exit; shot arc; shower fall; all disabled or reduced under `prefers-reduced-motion: reduce` (keep the fight playable). Read the media query once in `onMount` for the JS-driven beats, and rely on the CSS media block for the loops.
- Keep the tap button keyboard-activatable (a real `<button>`).

- [ ] **Step 4: Integrate the page and HUD**

In `+page.svelte`:
- Import `Boss`, `BossId`, `bossFor`, `bossMayStart`, `nextBossAtAbove`, `nextBossAtAfterWin`, `BOSS_REWARD`, `bossesEnabled`, `bossNextAt`, `bossWins`, `recordBossWin`, `skipBoss`.
- Add `boss`, `bossActive`.
- Trigger effect:
  ```ts
  $effect(() => {
  	const due = bossMayStart({
  		enabled: bossesEnabled(),
  		bag: bag(),
  		nextBossAt: bossNextAt(),
  		phase: phase(),
  		shopOpen: shopOpen(),
  		scareActive,
  		menuOpen: menuState.open,
  		celebrating: beat !== null,
  		active: boss !== null
  	});
  	if (due) startBoss();
  });
  ```
  `startBoss()` dispatches `STOP` and sets `boss = { id: bossFor(bossWins()) }`; guard against re-entry.
- `onThrow`: if `bag() <= 0` return false; dispatch `SPEND_CANDY`; return true.
- Add `let bossAwarded = false;`; `startBoss()` resets it. `onWin`: return if `bossAwarded`; set it true; dispatch `BOSS_REWARD` with 60; `recordBossWin(nextBossAtAfterWin(bag()))`; play `twinkle`; the component shows the shower.
- `onExit`: `boss = null`.
- Cancel effect: if `boss && !bossesEnabled()` → `boss = null; skipBoss(nextBossAtAbove(bag()));` (spent candies stay).
- Render `<Boss ... />` inside the stage, before `<Hud />`.
- Hide the game controls while `bossActive`: `WalkControls`, `KnockButton`, `Scherzo`; also unmount `StreetLife`, `Scares`, `Celebration` and `Bubbles` so no ambient beat or speech bubble can mount above the fight. Keep `RotateButton`, the bag chip, the home button, `Npcs` and the canvas running; pass `bossActive` to `Hud` so the Bottega pill disappears.
- The boss starts only when `beat === null`; the effect reads `beat`, `menuState.open`, etc.

In `Hud.svelte`:
- Add `bossActive?: boolean` to `Props`; render the Bottega pill only when `!bossActive`. The home button and bag chip stay.

- [ ] **Step 5: Run the core e2e**

Run: `PORT=4188 pnpm test:e2e --grep "1000-candy boss"`
Expected: PASS. If 30 clicks race the win transition, wait for `#bossWin` after the loop (already in the test); do not add arbitrary sleeps.

- [ ] **Step 6: Run the full gates**

Run: `pnpm check && pnpm test:unit && pnpm lint && PORT=4188 pnpm test:e2e`
Expected: all green (16 existing + 1 boss).

- [ ] **Step 7: Commit**

```bash
git add src/lib/play/Boss.svelte src/routes/+page.svelte src/lib/ui/Hud.svelte tests/e2e/boss.spec.ts
git commit -m "feat(boss): stage the friendly candy fight and wire the page"
```

---

### Task 8: Boss variants, settings, deferral and accessibility coverage

**Files:**
- Modify: `tests/e2e/boss.spec.ts`
- Modify: `tests/e2e/settings.spec.ts`
- Modify: `src/routes/+page.svelte` only if a test exposes a gate bug.

**Interfaces:** same as Task 7; use the rendered IDs `#bossLayer`, `#bossName`, `#bossTap`, `#bossWin`, `#bossOnBtn`, `#bossOffBtn`.

- [ ] **Step 1: Add the e2e cases**

In `tests/e2e/boss.spec.ts` add:

1. **Settings off:** seed settings `{ bosses: false }` + v2 run bag 1000/next 1000; play; wait 1.5 s; expect `#bossLayer` count 0; bag stays 1000.
2. **Toggle persistence:** open title → settings → click `#bossOffBtn`; assert the settings JSON `bosses` is false; reload; reopen settings; assert `#bossOffBtn` has `aria-pressed="true"`; set it back on.
3. **Rotation:** seed `bossWins: 1` / bag 1500 / next 1500 → name `Mostro Goloso`; `bossWins: 2` → `Re Caramella`. (Two seeds, two tests; don't try to win both.)
4. **Welcome migration:** seed a v1 run with bag 5416 (the existing `seedRun`); play; expect `Grande Zucca`; throw 30 times; expect the bag chip `5446`; poll `readRunV2` for `nextBossAt=5500` / `bossWins=1`.
5. **Reload after a win:** reuse the core test's save; reload; play; wait 1.5 s; expect no `#bossLayer`.
6. **Settings off mid-fight:** start the boss, click `#menuBtn`, open Settings, click `#bossOffBtn`, back, Gioca; expect `#bossLayer` count 0 and `nextBossAt` above the current bag; re-enable for the rest of the suite.
7. **Reduced motion:** `page.emulateMedia({ reducedMotion: 'reduce' })` on the core seed; the boss appears, 30 taps win, no animation-only assertions.
8. **Keyboard:** focus `#bossTap`, press Space 30 times; the win appears.
9. **Rotated stage:** seed settings rotation 270 + the core run; expect `#bossLayer` visible, take a screenshot for the visual check, and win with taps.

- [ ] **Step 2: Run the boss suite to verify the new cases fail where expected**

Run: `PORT=4188 pnpm test:e2e --grep "boss"`
Expected: the new settings-off/rotation/etc. tests should pass once the Task 7 wiring is correct; any failure points at a missing gate (fix the page, not the test).

- [ ] **Step 3: Visual verification**

Start a preview on a clean port (`pnpm build && pnpm exec vite preview --port 4193 --strictPort`) and use the boss e2e/seeded pages to capture, for each of `zucca`, `mostro`, `recaramella`:
- entry (name + HP + art),
- mid-fight (a projectile and a hit reaction),
- win (shower + `#bossWin`).
Also capture one at rotation 270 and one under reduced motion. Inspect them before shipping. Delete any temporary scripts afterwards.

- [ ] **Step 4: Run the full gates**

Run: `pnpm check && pnpm test:unit && pnpm lint && PORT=4188 pnpm test:e2e`
Expected: all green; e2e count is 16 + the boss suite.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/boss.spec.ts tests/e2e/settings.spec.ts
git commit -m "test(boss): cover settings off, rotation, welcome save, reload, reduced motion and keyboard"
```

---

### Task 9: Docs, final verification and ship

**Files:**
- Modify: `docs/ISSUES.md` (add T42), `docs/BALANCE.md` (boss table), `docs/ARCHITECTURE.md` (boss modules), `docs/CONTENT-BIBLE.md` (boss names/copy).
- No code changes unless a gate fails.

- [ ] **Step 1: Write the docs**

- `docs/ISSUES.md` T42 row: shipped — thresholds 1 000 + 500 grid, rotating cast, 30 hits/1 candy/60 reward, default-on Settings toggle, v2 save fields, no canvas changes, e2e coverage.
- `docs/BALANCE.md` rows: boss first 1 000, step 500, HP 30, cost 1, reward 60, rotation 3, tap-anywhere, no fail.
- `docs/ARCHITECTURE.md`: `boss-model.ts` (pure cadence/gate), `boss-art.ts`, `Boss.svelte` (DOM overlay, z 10), `boss-setting.svelte.ts`, the page trigger, `SPEND_CANDY`/`BOSS_REWARD`, the v2 fields.
- `docs/CONTENT-BIBLE.md`: the three names IT/EN, the hint, win/reward copy, the Settings labels.

- [ ] **Step 2: Run the complete gates**

Run: `pnpm check && pnpm test:unit && pnpm lint && PORT=4188 pnpm test:e2e`
Expected: svelte-check 0/0; unit all green; lint green; e2e all green.

- [ ] **Step 3: Build and deploy**

Run: `pnpm build`
Then follow the project's deploy discipline:
```bash
git add -A
git commit -m "docs(boss): record the candy-boss milestone"
git push
SHA=$(git rev-parse HEAD)
vercel --prod --yes --scope ion-utales-projects --build-env VERCEL_GIT_COMMIT_SHA=$SHA
vercel inspect dolcetto-o-scherzetto.vercel.app --scope ion-utales-projects
```
Verify the live chunks contain the short sha before calling it shipped.

- [ ] **Step 4: Final check on the live build**

Open the production URL, play, and confirm:
- with a seeded/live bag over 1 000, Grande Zucca appears;
- 30 taps win and the bag nets +30;
- the Settings Boss toggle is visible and off means no boss;
- a reload does not re-trigger at the same bag.

---

## Self-review notes

- **Spec coverage:** cadence/rotation (Task 1), settings (Task 2), sim wallet (Task 3), save schema (Task 4), autosave/store (Task 5), art (Task 6), fight + page (Task 7), off/rotation/welcome/reload/reduced-motion/keyboard (Task 8), docs/ship (Task 9).
- **Review Focus mapping:** mid-v2 save (Task 4), deferral gate (Task 1 `bossMayStart` + Task 7 effect), rapid taps/empty bag (Task 3 + Task 7), settings off mid-fight/reload (Task 8), rotated/reduced motion/keyboard (Task 8).
- **Type consistency:** `BossId`, `nextBossAtAbove`, `nextBossAtAfterWin`, `normalizeBossProgress`, `bossMayStart`, `bossesEnabled`, `bossNextAt`, `bossWins`, `recordBossWin`, `skipBoss`, `SPEND_CANDY`, `BOSS_REWARD` are introduced once and used with the same names.
- **Proportion:** the plan carries the decisions, exact tests and interfaces; the component body and SVG paths are left to the implementer.
