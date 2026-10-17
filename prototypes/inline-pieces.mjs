#!/usr/bin/env node
/**
 * Generates prototypes/scene-prototype-single.html from the dev files:
 *   scene-prototype.html + pieces/{sfx,sprites,houses,theatre,scares}.js
 *
 * The single file is the hand-off artifact (one double-click, no folder).
 * Edit the pieces or the dev html, then re-run:  node prototypes/inline-pieces.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const srcPath = path.join(dir, 'scene-prototype.html');
const outPath = path.join(dir, 'scene-prototype-single.html');
const names = ['sfx', 'sprites', 'houses', 'theatre', 'scares'];

let html = fs.readFileSync(srcPath, 'utf8');
for (const name of names) {
  const tag = `<script src="pieces/${name}.js"></script>`;
  if (!html.includes(tag)) { console.error(`missing tag: ${tag}`); process.exit(1); }
  const code = fs.readFileSync(path.join(dir, 'pieces', `${name}.js`), 'utf8');
  // escape HTML-parser hazards inside the inlined script text (JS comments/strings only)
  const safe = code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  html = html.replace(tag, `<script>\n${safe}\n</script>`);
}
html = html.replace(
  '<title>Dolcetto o Scherzetto — scene prototype v2</title>',
  '<title>Dolcetto o Scherzetto — scene prototype v2 (single file)</title>'
);
fs.writeFileSync(outPath, html);
console.log(`OK ${path.basename(outPath)} (${Math.round(html.length / 1024)} KB · inlined: ${names.join(', ')})`);
