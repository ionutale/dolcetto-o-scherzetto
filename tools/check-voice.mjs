#!/usr/bin/env node
/**
 * T28 completeness gate — the voice render's on-disk proof.
 *
 * The render (T28a, `voice/VOICES.md`) ships **37 clips per language** into
 * `static/voice/<lang>/<id>.mp3`, with a `manifest.json` beside them. This
 * checker is the T28 acceptance gate: it proves, for **both** languages, that
 *
 *   1. every id in `voice/lines.<lang>.json` has a **non-empty** clip on disk
 *      (the same `_complete()` test `generate_lines.py` resumes from), and
 *   2. the language's `manifest.json` covers **exactly the same ids**.
 *
 * The ids come from `lines.<lang>.json` — the full inventory, and the source
 * `voice.ts` derives its scheme from — so the checker grows with the copy
 * (VOICES §8's shop lines) rather than pinning today's 37.
 *
 * Usage:
 *
 *   node tools/check-voice.mjs            # the repo's own tree
 *   node tools/check-voice.mjs --root DIR # any fixture with the same layout
 *
 * Exits 0 when both languages are complete and non-zero (printing a readable
 * diff) otherwise. Read-only: it never writes to the tree it checks.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const LANGS = ['it', 'en'];
/** How many findings to print before collapsing the tail (a mid-render run can be long). */
const MAX_PRINT = 24;

/** Parse `--root <dir>` / `--root=<dir>` / a bare positional path. */
function parseRoot(argv) {
	let root = REPO_ROOT;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--root') root = argv[++i] ?? root;
		else if (arg.startsWith('--root=')) root = arg.slice('--root='.length);
		else if (!arg.startsWith('-')) root = arg;
	}
	return resolve(root);
}

/** The ids `lines.<lang>.json` lists, in order. */
function idsFromLines(path) {
	const rows = JSON.parse(readFileSync(path, 'utf8'));
	if (!Array.isArray(rows)) throw new Error('expected a JSON array');
	return rows.map((row) => String(row.id));
}

/**
 * Check one language. Returns `{ problems, clips, manifest }` where the counts
 * are `[present, expected]`, so the summary and the diff come from one pass.
 */
function checkLang(root, lang) {
	const problems = [];
	const show = (path) => relative(root, path);
	const linesPath = join(root, 'voice', `lines.${lang}.json`);
	const clipDir = join(root, 'static', 'voice', lang);

	let ids;
	try {
		ids = idsFromLines(linesPath);
	} catch (error) {
		return { problems: [`cannot read ${show(linesPath)}: ${error.message}`], clips: null };
	}

	// 1) A non-empty clip per id — the render's own completion test.
	let clipsOk = 0;
	for (const id of ids) {
		const clip = join(clipDir, `${id}.mp3`);
		if (!existsSync(clip)) problems.push(`missing clip: ${show(clip)}`);
		else if (statSync(clip).size === 0) problems.push(`empty clip: ${show(clip)}`);
		else clipsOk++;
	}

	// 2) The manifest covers exactly the same ids.
	const manifestPath = join(clipDir, 'manifest.json');
	let manifestIds;
	try {
		const rows = JSON.parse(readFileSync(manifestPath, 'utf8'));
		if (!Array.isArray(rows)) throw new Error('expected a JSON array');
		manifestIds = rows.map((row) => String(row.id));
	} catch (error) {
		problems.push(`cannot read ${show(manifestPath)}: ${error.message}`);
		return { problems, clips: [clipsOk, ids.length] };
	}
	const want = new Set(ids);
	const have = new Set(manifestIds);
	for (const id of ids) if (!have.has(id)) problems.push(`manifest missing row: ${lang}/${id}`);
	for (const id of manifestIds)
		if (!want.has(id)) problems.push(`manifest extra row: ${lang}/${id}`);

	return {
		problems,
		clips: [clipsOk, ids.length],
		manifest: [ids.filter((id) => have.has(id)).length, ids.length],
		ids
	};
}

function main() {
	const root = parseRoot(process.argv.slice(2));
	const problems = [];
	const summaries = [];
	let itIds = null;
	let enIds = null;

	for (const lang of LANGS) {
		const result = checkLang(root, lang);
		problems.push(...result.problems);
		const clips = result.clips ? `${result.clips[0]}/${result.clips[1]} clips` : 'no lines file';
		const manifest = result.manifest
			? `manifest ${result.manifest[0]}/${result.manifest[1]} rows`
			: 'no manifest';
		summaries.push(`  ${lang}  ${clips}  ·  ${manifest}`);
		if (lang === 'it') itIds = result.ids ?? null;
		if (lang === 'en') enIds = result.ids ?? null;
	}

	// The two languages ship the same id set (VOICES §3: ids are language-neutral).
	if (itIds && enIds) {
		const itSet = new Set(itIds);
		const enSet = new Set(enIds);
		for (const id of itIds) if (!enSet.has(id)) problems.push(`id only in it: ${id}`);
		for (const id of enIds) if (!itSet.has(id)) problems.push(`id only in en: ${id}`);
	}

	if (problems.length === 0) {
		console.log(`check-voice: ok under ${root}`);
		for (const line of summaries) console.log(line);
		return;
	}

	console.error(`check-voice: ${problems.length} problem(s) under ${root}`);
	for (const line of summaries) console.error(line);
	for (const problem of problems.slice(0, MAX_PRINT)) console.error(`  ✗ ${problem}`);
	if (problems.length > MAX_PRINT) console.error(`  … and ${problems.length - MAX_PRINT} more`);
	process.exitCode = 1;
}

main();
