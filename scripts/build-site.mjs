/**
 * Build the P1 review page: a single self-contained HTML file.
 *
 *   node scripts/build-site.mjs   ->  dist/mealpr-review.html
 *
 * The page inlines (a) the real MealPR core compiled for the browser and (b)
 * the Demo fixtures projected through that same core, so nothing in the page
 * is hand-copied mock data.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = dirname(fileURLToPath(import.meta.url));
const nodeBin = process.execPath;

/* 1. browser bundle of the real core */
const core = await build({
  entryPoints: [join(root, 'src', 'web-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'MealPR',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});
const coreJs = core.outputFiles[0].text;

/* 2. demo data projected through the core (node script, same source tree).
      Kept out of mealpr/scripts so the installable Skill zip stays lean. */
const cacheDir = join(root, 'node_modules', '.cache');
mkdirSync(cacheDir, { recursive: true });
const dataScript = join(cacheDir, 'mealpr-site-data.mjs');
await build({
  entryPoints: [join(root, 'src', 'entries', 'site-data.ts')],
  bundle: true,
  outfile: dataScript,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  logLevel: 'silent',
});
const dataJson = execFileSync(nodeBin, [dataScript], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

const template = readFileSync(join(root, 'web', 'template.html'), 'utf8');
const html = template
  .replace('/*__MEALPR_CORE_JS__*/', () => coreJs)
  .replace('/*__MEALPR_DATA_JSON__*/', () => dataJson.trim());

const outDir = join(root, 'dist');
if (!(await import('node:fs')).existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'mealpr-review.html');
writeFileSync(outFile, html, 'utf8');
// Kept separate so the smoke test can exercise the very same bundle the page ships.
writeFileSync(join(outDir, 'mealpr-core.js'), coreJs, 'utf8');
writeFileSync(join(outDir, 'mealpr-data.json'), dataJson, 'utf8');

console.log(`[site] ${outFile}  ${(statSync(outFile).size / 1024).toFixed(0)} KB (core ${(coreJs.length / 1024).toFixed(0)} KB, data ${(dataJson.length / 1024).toFixed(0)} KB)`);
