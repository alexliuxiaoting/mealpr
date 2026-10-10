/**
 * Package `mealpr/` into an installable WorkBuddy Skill zip.
 * Usage: node scripts/make-zip.mjs
 */
import { mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'mealpr');
const distDir = join(root, 'dist');

const version = JSON.parse(
  (await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8'),
).version;

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
const zipPath = join(distDir, `mealpr-skill-v${version}.zip`);

// Build first so the zip always ships fresh artifacts.
const build = spawnSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, encoding: 'utf8' });
if (build.status !== 0) {
  console.error(build.stdout + build.stderr);
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === '.DS_Store') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(skillDir);

// Zip from inside mealpr/ so the archive root contains SKILL.md itself.
const rm = spawnSync('rm', ['-f', zipPath], { encoding: 'utf8' });
if (rm.status !== 0) console.warn('could not remove old archive:', rm.stderr);

const zip = spawnSync(
  'zip',
  ['-r', '-X', zipPath, '.', '-x', '.*', '-x', '__MACOSX/*'],
  { cwd: skillDir, encoding: 'utf8' },
);
if (zip.status !== 0) {
  console.error(zip.stderr || zip.stdout);
  process.exit(1);
}

console.log(`[zip] packaged ${files.length} files -> ${zipPath}`);
console.log(`[zip] size: ${(statSync(zipPath).size / 1024).toFixed(1)} KB`);
console.log(`[zip] entry: ${basename(skillDir)}/SKILL.md`);
