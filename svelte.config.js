import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// `runtime` is pinned to match the sibling project's supported Node lambda.
		// No `regions` pin: unlike the sibling there is no external datastore with a
		// fixed region to be near — the game is fully client-side and its only
		// server work is static/edge asset delivery, so the default (closest to the
		// visitor) region is correct.
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
