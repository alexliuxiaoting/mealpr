import { build } from 'esbuild';
import { mkdirSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = process.cwd();
const entryDir = join(root, 'src', 'entries');
const outDir = join(root, 'mealpr', 'scripts');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// site-data is a build-time helper for the P1 page (scripts/build-site.mjs),
// not something the Skill needs at runtime — keep it out of the installable zip.
const SKIP = new Set(['site-data.ts']);

const entries = readdirSync(entryDir)
  .filter((f) => f.endsWith('.ts') && !SKIP.has(f))
  .map((f) => ({
    in: join(entryDir, f),
    out: join(outDir, basename(f, '.ts')),
  }));

await build({
  entryPoints: entries,
  bundle: true,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: { js: '/* MealPR generated artifact — edit src/ instead. */' },
  logLevel: 'info',
});

console.log(`[build] ${entries.length} entry -> mealpr/scripts/*.mjs`);
