#!/usr/bin/env node
/*!
 * ============================================================================
 *  voice/lines.mjs — T28a: derive the TTS render inputs from the copy source
 *
 *  `src/lib/i18n/lines.ts` is the source of truth for the spoken copy. This
 *  script reads `L` straight out of it (it is a plain object literal — no code
 *  to execute) and emits the files `game_voice/generate_lines.py` actually
 *  consumes: a list of `{ id, text }` per voice, because that script binds
 *  exactly one voice per run (`--speaker`/`--voice`) to every entry in a file.
 *
 *  Usage:
 *    node voice/lines.mjs extract   # write voice/lines.*.json + voice/render/*.json
 *    node voice/lines.mjs check     # parse every JSON, assert byte-equality vs lines.ts
 *    node voice/lines.mjs samples   # print the design-reference text per voice
 *
 *  Ids are `<key>-<arch>` (e.g. `greet-ghost`, `scherzo-wolf`) plus the flat
 *  `shout`. They must never contain a dot: `generate_lines.clip_path` runs
 *  `Path(id).with_suffix(".mp3")`, so `greet.ghost` would collapse to
 *  `greet.mp3` and two clips would fight over one file.
 * ============================================================================
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LINES_TS = join(ROOT, 'src', 'lib', 'i18n', 'lines.ts');
const RENDER_DIR = join(HERE, 'render');

/** The six arch tables, in the order the knock chain speaks them. */
const KEYS = ['greet', 'treat', 'refuse', 'regift', 'seen', 'scherzo'];
/** `NEIGHBOR_ARCHES` from src/lib/art/sprites/neighbors.ts. */
const ARCHES = ['ghost', 'nonna', 'strega', 'wolf', 'vlad', 'scarecrow'];
const LANGS = ['it', 'en'];
/** One render file per voice: the kids' shout, then the six neighbours. */
const SPEAKERS = ['kids', ...ARCHES];
/** Ids are lower-case words joined by hyphens — never a dot (see header). */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How many spot-checks `check` prints (the acceptance asks for >= 10). */
const SPOT_CHECKS = 12;

/** Parse the `L` literal out of lines.ts (brace-matched; no braces in strings). */
function readL() {
	const source = readFileSync(LINES_TS, 'utf8');
	const anchor = source.indexOf('export const L: Record<Lang, Lines> = ');
	if (anchor < 0) throw new Error(`lines.ts: could not find the L table in ${LINES_TS}`);
	const open = source.indexOf('{', anchor);
	let depth = 0;
	let close = -1;
	for (let i = open; i < source.length; i += 1) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) {
				close = i + 1;
				break;
			}
		}
	}
	if (close < 0) throw new Error('lines.ts: L table is not brace-balanced');
	// The literal is plain data; evaluate it rather than re-implement a TS parser.
	const L = new Function(`return (${source.slice(open, close)});`)();
	for (const lang of LANGS) {
		if (!L[lang]) throw new Error(`lines.ts: L.${lang} is missing`);
		for (const key of KEYS) {
			for (const arch of ARCHES) {
				if (typeof L[lang][key]?.[arch] !== 'string') {
					throw new Error(`lines.ts: L.${lang}.${key}.${arch} is missing`);
				}
			}
		}
		if (typeof L[lang].shout !== 'string') throw new Error(`lines.ts: L.${lang}.shout is missing`);
	}
	return L;
}

/** The expected text for an id, straight from lines.ts. */
function textForId(L, lang, id) {
	if (id === 'shout') return L[lang].shout;
	const [key, arch] = id.split('-');
	return L[lang][key]?.[arch];
}

/** Every voiced line of one language: the shout + 6 keys × 6 archetypes. */
function fullLanguage(L, lang) {
	return [
		{ id: 'shout', text: L[lang].shout },
		...KEYS.flatMap((key) => ARCHES.map((arch) => ({
			id: `${key}-${arch}`,
			text: L[lang][key][arch],
		}))),
	];
}

/** One voice's lines: the kids shout only, or one archetype's six tables. */
function speakerLines(L, lang, speaker) {
	if (speaker === 'kids') return [{ id: 'shout', text: L[lang].shout }];
	return KEYS.map((key) => ({ id: `${key}-${speaker}`, text: L[lang][key][speaker] }));
}

const renderFileName = (lang, speaker) => `${lang}.${speaker}.json`;
const renderFilePaths = () =>
	LANGS.flatMap((lang) => SPEAKERS.map((s) => join(RENDER_DIR, renderFileName(lang, s))));

function extract(L) {
	mkdirSync(RENDER_DIR, { recursive: true });
	const written = [];
	for (const lang of LANGS) {
		const path = join(HERE, `lines.${lang}.json`);
		writeFileSync(path, `${JSON.stringify(fullLanguage(L, lang), null, '\t')}\n`, 'utf8');
		written.push(path);
		for (const speaker of SPEAKERS) {
			const p = join(RENDER_DIR, renderFileName(lang, speaker));
			writeFileSync(p, `${JSON.stringify(speakerLines(L, lang, speaker), null, '\t')}\n`, 'utf8');
			written.push(p);
		}
	}
	return written;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

/** A single `{id, text}` list; asserts the shape generate_lines.load_lines wants. */
function assertLineShape(path, rows, lang) {
	if (!Array.isArray(rows)) throw new Error(`${path}: top level must be a JSON array`);
	if (rows.length === 0) throw new Error(`${path}: empty list (generate_lines aborts on this)`);
	for (const [i, row] of rows.entries()) {
		if (typeof row?.id !== 'string' || typeof row?.text !== 'string') {
			throw new Error(`${path}[${i}]: every entry needs string "id" and "text"`);
		}
		if (!ID_RE.test(row.id)) {
			throw new Error(`${path}[${i}]: id "${row.id}" must match ${ID_RE} (no dots!)`);
		}
		const expected = textForId(L_GLOBAL, lang, row.id);
		if (expected === undefined) throw new Error(`${path}[${i}]: id "${row.id}" is not a lines.ts key`);
		if (row.text !== expected) throw new Error(`${path}[${i}]: text differs from lines.ts`);
		if (!Buffer.from(row.text, 'utf8').equals(Buffer.from(expected, 'utf8'))) {
			throw new Error(`${path}[${i}]: bytes differ from lines.ts`);
		}
	}
	const ids = rows.map((r) => r.id);
	if (new Set(ids).size !== ids.length) throw new Error(`${path}: duplicate ids`);
	// generate_lines keys its batch results by text — duplicates would collide.
	const texts = rows.map((r) => r.text);
	if (new Set(texts).size !== texts.length) throw new Error(`${path}: duplicate texts`);
	return rows;
}

let L_GLOBAL = null;

function check(L) {
	L_GLOBAL = L;
	const problems = [];
	const counts = { perLang: {}, perSpeaker: {} };
	let spotChecks = 0;
	const spot = [];

	const checkFile = (path, note) => {
		if (!existsSync(path)) throw new Error(`missing file: ${path}`);
		const rows = assertLineShape(path, readJson(path), note.lang);
		counts.perSpeaker[`${note.lang}.${note.speaker}`] = rows.length;
		return rows;
	};

	for (const lang of LANGS) {
		const full = checkFile(join(HERE, `lines.${lang}.json`), { lang, speaker: 'ALL' });
		counts.perLang[lang] = full.length;
		const expectedCount = 1 + KEYS.length * ARCHES.length;
		if (full.length !== expectedCount) {
			problems.push(`lines.${lang}.json: ${full.length} lines, expected ${expectedCount}`);
		}
		// the per-speaker files must partition the full-language list exactly
		const union = SPEAKERS.flatMap((speaker) =>
			checkFile(join(RENDER_DIR, renderFileName(lang, speaker)), { lang, speaker }));
		const setId = (rows) => new Set(rows.map((r) => r.id));
		if (setId(union).size !== setId(full).size || union.length !== full.length) {
			problems.push(`voice/render/${lang}.*: does not partition voice/lines.${lang}.json`);
		}
		for (const row of full) {
			const expected = textForId(L, lang, row.id);
			if (row.text !== expected) problems.push(`${lang}/${row.id}: differs from lines.ts`);
		}
		// spot-checks: the line's exact UTF-8 bytes must occur in both lines.ts and the JSON
		const tsBytes = readFileSync(LINES_TS);
		const jsonBytes = readFileSync(join(HERE, `lines.${lang}.json`));
		for (let n = 0; n < SPOT_CHECKS; n += 1) {
			const row = full[(n * 7) % full.length];
			const bytes = Buffer.from(row.text, 'utf8');
			const ok = bytes.equals(Buffer.from(textForId(L, lang, row.id), 'utf8'))
				&& tsBytes.includes(bytes)
				&& jsonBytes.includes(bytes);
			spot.push({ lang, id: row.id, ok });
			if (ok) spotChecks += 1;
			else problems.push(`${lang}/${row.id}: bytes not found in lines.ts or the JSON`);
		}
	}

	// every render file must exist and load empty-free
	const found = existsSync(RENDER_DIR) ? readdirSync(RENDER_DIR).filter((f) => f.endsWith('.json')) : [];
	if (found.length !== LANGS.length * SPEAKERS.length) {
		problems.push(`voice/render/: ${found.length} json files, expected ${LANGS.length * SPEAKERS.length}`);
	}

	console.log(`[lines.mjs] languages:  ${LANGS.map((l) => `${l}=${counts.perLang[l]}`).join('  ')}`);
	console.log(`[lines.mjs] clips:      ${LANGS.length} langs × ${1 + KEYS.length * ARCHES.length} lines = ${LANGS.length * (1 + KEYS.length * ARCHES.length)}`);
	for (const lang of LANGS) {
		const row = SPEAKERS.map((s) => `${s}=${counts.perSpeaker[`${lang}.${s}`]}`).join('  ');
		console.log(`[lines.mjs] ${lang}: ${row}`);
	}
	console.log(`[lines.mjs] spot-checks: ${spotChecks}/${SPOT_CHECKS * LANGS.length} byte-equal to lines.ts`);
	for (const s of spot) console.log(`[lines.mjs]   ${s.ok ? 'OK ' : 'BAD'} ${s.lang} ${s.id}`);
	if (problems.length) {
		for (const p of problems) console.error(`[lines.mjs] FAIL ${p}`);
		throw new Error(`${problems.length} problem(s)`);
	}
	console.log(`[lines.mjs] check: OK — every JSON parses and every line is byte-equal to lines.ts`);
}

/* --- design reference samples (not game clips: 5-10 s clone references) ---- */
const DESIGN_SAMPLES = {
	kids: {
		it: 'Dolcetto o scherzetto! Dolcetto o scherzetto! Ehi, siamo noi! Abbiamo le lanterne accese, veniamo a bussare a tutte le porte!',
		en: 'Trick or treat! Trick or treat! Hey, it’s us! Our lanterns are lit and we’re knocking on every door on the street!',
	},
	ghost: {
		it: 'Buuu! Chi va là?... Ah, siete voi! Dolcetti per voi... buuu! Ooooh... ho finito i dolcetti!',
		en: 'Boo! Who goes there?.. Oh, it’s you! Candy for you... boo! Oooh... I ran out of candy!',
	},
	nonna: {
		it: 'Oh, che bei bimbi! Che carini! Ecco i dolcetti! Stasera niente caramelle, mi dispiace!',
		en: 'Oh, what sweet boys! How cute! Here’s some candy! No candy tonight, sorry!',
	},
	strega: {
		it: 'Ehehe, chi c’è alla porta? Prendete, piccoli maghi! Il mio calderone è vuoto stasera! Ehehe! Bei maghetti! Tutto per voi!',
		en: 'Ehehe, who’s at my door? Take some, little wizards! My cauldron is empty tonight! Ehehe! What little wizards! All yours!',
	},
	wolf: {
		it: 'Arf! Amici pelosi in visita! Tieni, tieni! Arf arf! Ho già dato tutto, arf... peccato!',
		en: 'Woof! Furry friends at the door! Here, take some! Woof woof! All out, woof... sorry!',
	},
	vlad: {
		it: 'Buonasera, piccoli ospiti! Con piacere, prendete i dolcetti. Mille scuse: la dispensa è vuota.',
		en: 'Good evening, little guests! With pleasure — do take some. A thousand pardons: the pantry is bare.',
	},
	scarecrow: {
		it: 'Oh! Qualcuno mi ha parlato! Dolcetti freschi di paglia! Ops! Ho la zucca di paglia, stasera!',
		en: 'Oh! Someone talked to me! Candy fresh out of the straw! Oops! My straw brain is empty!',
	},
};

function samples() {
	const L = readL();
	for (const speaker of SPEAKERS) {
		for (const lang of LANGS) {
			console.log(`### ${speaker} · ${lang}`);
			console.log(DESIGN_SAMPLES[speaker][lang]);
			console.log(`   length=${[...DESIGN_SAMPLES[speaker][lang]].length} chars`);
			// sanity: the sample must be printable and non-empty
			if (!DESIGN_SAMPLES[speaker][lang].trim()) throw new Error(`${speaker}/${lang} sample empty`);
		}
	}
	// the samples are quoted from lines.ts where possible — flag drift
	for (const speaker of ARCHES) {
		for (const lang of LANGS) {
			const own = KEYS.flatMap((k) => [L[lang][k][speaker]]).filter((t) => DESIGN_SAMPLES[speaker][lang].includes(t));
			if (own.length === 0) console.error(`[lines.mjs] WARN ${speaker}/${lang} sample quotes no lines.ts line`);
		}
	}
}

const command = process.argv[2] ?? 'check';
const L = readL();
if (command === 'extract') {
	for (const path of extract(L)) console.log(`[lines.mjs] wrote ${path}`);
} else if (command === 'check') {
	check(L);
} else if (command === 'samples') {
	samples();
} else {
	console.error('usage: node voice/lines.mjs [extract|check|samples]');
	process.exit(2);
}
