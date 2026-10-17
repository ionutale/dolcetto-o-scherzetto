import { defineConfig, devices } from '@playwright/test';

/**
 * The e2e suite runs against the **built** app, never the dev server (T30
 * acceptance: "runs against built app"). `vite build` bakes the real bundle,
 * the real `ssr=false` shell and the real service-worker registration, so a
 * green run is evidence about what actually ships.
 *
 * Mirrors the sibling project's conventions
 * (`restaurant-manager-game/playwright.config.ts`): one Chromium project, a
 * port overridable so the suite can dodge another project's server, and a bare
 * `vite` for the long-running process. pnpm 12 spawns scripts in their own
 * process group, so a `pnpm run` server survives Playwright's group-kill and
 * holds the port; `pnpm run` puts `node_modules/.bin` on PATH, so bare `vite`
 * resolves when this config runs through `pnpm test:e2e`. The `build` half is a
 * short-lived child and exits before the server starts.
 */
const PORT = Number(process.env.PORT ?? 4173);

const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// Twice-in-a-row green is the acceptance bar; a retry would hide a flake.
	retries: process.env.CI ? 2 : 0,
	reporter: [['list'], ['html', { open: 'never' }]],
	// Every page runs the full ambience cast on rAF and decodes the ~96 s street
	// loop into WebAudio, so eight pages at once starve the frame clock and the
	// wall-clock flows slip past their windows. Three at a time keeps the sim
	// real-time without idling the machine.
	workers: process.env.CI ? 2 : 3,
	// A flow can legitimately run ~15 s (walk + +2 s resolve + ~2 s candy flight,
	// or the ~2.4 s show), and CI is slower than a laptop; 30 s is too tight.
	timeout: 90_000,
	// The knock chain, the candy flight and the trick show are all wall-clock
	// beats, so the default 5 s expect window is thin for the longest waits.
	expect: { timeout: 10_000 },
	use: {
		baseURL: ORIGIN,
		// The flow is timing-heavy, so a failed run's trace is usually more
		// useful than its screenshot — keep both.
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// The spec's reference device is iPhone 16 landscape (852×393 pt).
				// The stage scales to fit, so the reference viewport exercises the
				// same `fit()` path the phone does without a device descriptor's
				// touch emulation (which would re-shape the pointer events).
				viewport: { width: 852, height: 393 }
			}
		}
	],
	webServer: {
		command: `pnpm run build && vite preview --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
