/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — COPY LINES (T11's IT/EN tables + T15's `scherzo`)
 *
 *  Typed port of the prototype's `L` dictionary (`prototypes/
 *  scene-prototype.html`, lines ~689-714): the same Italian and English
 *  strings, in the same shape — two flat lines (the kids' shout and the knock
 *  label) plus six archetype tables (greet / treat / refuse / regift / seen /
 *  scherzo), one row per neighbour archetype (`ghost`, `nonna`, `strega`).
 *
 *  USAGE
 *    t('it', 'shout');                 // 'Dolcetto o scherzetto!'
 *    t('en', 'greet', 'strega');       // 'Ehehe, who’s at my door?'
 *    t('it', 'scherzo', 'ghost');      // 'Ehehe! Mi avete fatto ridere! Tieni!'
 *    L[lang].treat[archOf(k)];         // the same table, indexed by hand
 *
 *  The overload is the point: a key that has one line per language cannot be
 *  called with an archetype, and one that varies by neighbour must be — the
 *  compiler keeps `t(lang, 'greet')` and `t(lang, 'shout', 'ghost')` wrong.
 *
 *  SCOPE (T11 + T15)
 *    T11 shipped the knock chain's five tables; T15 added `scherzo` (the trick
 *    payoff line, prototype lines ~695/707) when the show wiring landed. The
 *    shop copy belongs to T16 and extends this table when it lands rather
 *    than pre-shipping strings nothing renders.
 *
 *  The live language is `settings.read().lang` (T17 owns the toggle); the sim
 *  keeps its own `lang` inside `GameState` for the run, and both agree on IT
 *  by default.
 * ============================================================================
 */
import type { Lang } from '../sim/loop';
import type { Theme } from '../sim/progression';
import type { NeighborArch } from '../art/sprites/neighbors';

/** Keys whose line is one string per language. */
export type LineKey = 'shout' | 'knock';

/** Keys whose line varies by neighbour archetype. */
export type ArchLineKey = 'greet' | 'treat' | 'refuse' | 'regift' | 'seen' | 'scherzo';

/** The six archetype tables a language ships. */
type ArchLines = Record<ArchLineKey, Record<NeighborArch, string>>;

/** One language: the flat lines plus the archetype tables. */
export type Lines = Record<LineKey, string> & ArchLines;

/** Both shipped languages, prototype strings verbatim. */
export const L: Record<Lang, Lines> = {
	it: {
		shout: 'Dolcetto o scherzetto!',
		knock: 'Bussa ✊',
		greet: {
			ghost: 'Buuu! Chi va là?... Ah, siete voi!',
			nonna: 'Oh, che bei bimbi!',
			strega: 'Ehehe, chi c’è alla porta?'
		},
		treat: {
			ghost: 'Dolcetti per voi... buuu!',
			nonna: 'Che carini! Ecco i dolcetti!',
			strega: 'Prendete, piccoli maghi!'
		},
		refuse: {
			ghost: 'Ooooh... ho finito i dolcetti!',
			nonna: 'Stasera niente caramelle, mi dispiace!',
			strega: 'Il mio calderone è vuoto stasera!'
		},
		regift: {
			ghost: 'Aspetta... una è rimasta!',
			nonna: 'Tieni, ancora una!',
			strega: 'Una scappata dal calderone!'
		},
		seen: {
			ghost: 'Buuu... ci siamo già visti!',
			nonna: 'Ci siamo già visti, aha!',
			strega: 'Già passati di qui, ehehe!'
		},
		// T15 — the trick payoff line, prototype `L.it.scherzo` (~695), verbatim.
		scherzo: {
			ghost: 'Ehehe! Mi avete fatto ridere! Tieni!',
			nonna: 'Ah! Che burloni! Prendete!',
			strega: 'Ehehe! Bei maghetti! Tutto per voi!'
		}
	},
	en: {
		shout: 'Trick or treat!',
		knock: 'Knock ✊',
		greet: {
			ghost: 'Boo! Who goes there?.. Oh, it’s you!',
			nonna: 'Oh, what sweet boys!',
			strega: 'Ehehe, who’s at my door?'
		},
		treat: {
			ghost: 'Candy for you... boo!',
			nonna: 'How cute! Here’s some candy!',
			strega: 'Take some, little wizards!'
		},
		refuse: {
			ghost: 'Oooh... I ran out of candy!',
			nonna: 'No candy tonight, sorry!',
			strega: 'My cauldron is empty tonight!'
		},
		regift: {
			ghost: 'Wait... one left!',
			nonna: 'Here, one more!',
			strega: 'One escaped my cauldron!'
		},
		seen: {
			ghost: 'Boo... we already met!',
			nonna: 'We already met, haha!',
			strega: 'Already been here, ehehe!'
		},
		// T15 — the trick payoff line, prototype `L.en.scherzo` (~707), verbatim.
		scherzo: {
			ghost: 'Ehehe! You made me laugh! Take!',
			nonna: 'Ah! You rascals! Take these!',
			strega: 'Ehehe! What little wizards! All yours!'
		}
	}
};

/** A line with no archetype variant (the shout, the knock label). */
export function t(lang: Lang, key: LineKey): string;
/** A line chosen by the archetype of the house being knocked on. */
export function t(lang: Lang, key: ArchLineKey, arch: NeighborArch): string;
export function t(lang: Lang, key: LineKey | ArchLineKey, arch?: NeighborArch): string {
	const lines = L[lang];
	if (key === 'shout' || key === 'knock') return lines[key];
	return lines[key][arch ?? 'ghost'];
}

/* ============================================================================
 *  T18 — NEIGHBORHOOD DISPLAY NAMES
 *
 *  The four skins the street cycles through (spec §4.2/§9) get a proper name
 *  per language; the celebration beat shows the name of the neighborhood just
 *  entered (T18). Kept out of `L`/`t()` on purpose: those six tables are the
 *  **voiced** lines the knock chain speaks by archetype, while a neighborhood
 *  name is a caption with no archetype and (for now) no voice — giving it its
 *  own table keeps `t()`'s overloads honest and lets T28 add voice ids later
 *  without reshaping the knock tables.
 * ========================================================================== */

/** The four neighborhoods, named per language. */
export const THEME_NAMES: Record<Lang, Record<Theme, string>> = {
	it: {
		leafy: 'Viale delle Foglie',
		foggy: 'Ponte Nebbioso',
		pumpkin: 'Campo delle Zucche',
		starry: 'Viale Stellato'
	},
	en: {
		leafy: 'Leafy Lane',
		foggy: 'Foggy Bridge',
		pumpkin: 'Pumpkin Patch',
		starry: 'Starry Alley'
	}
};

/** The display name of `theme` in `lang` (T18's celebration caption). */
export function themeName(lang: Lang, theme: Theme): string {
	return THEME_NAMES[lang][theme];
}
