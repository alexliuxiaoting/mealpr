#!/usr/bin/env node
/**
 * export-fixture.mjs — turn a demo fixture plan into a concrete PR JSON.
 *
 * Handy for trying the other scripts without an MCP connection, and for CI:
 *   node export-fixture.mjs team --rev 0 > /tmp/v2.json
 *   cat /tmp/v2.json | node validate-plan.mjs
 *
 * Usage: node export-fixture.mjs <single|team|coupon-expired> [--rev N] [--version N]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoPR, parseFixture } from '../demo.js';
import { parseIntent } from '../intent.js';
import { out } from './_io.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '..', 'fixtures');

const args = process.argv.slice(2);
const scenarioArg = args.find((a) => !a.startsWith('-')) ?? 'team';
const revIdx = args.indexOf('--rev');
const rev = revIdx === -1 ? null : Number(args[revIdx + 1]);
const verIdx = args.indexOf('--version');
const version = verIdx === -1 ? (rev === null ? 1 : rev + 2) : Number(args[verIdx + 1]);

const name = `demo-${scenarioArg.replace(/^demo-/, '')}`;
let fx;
try {
  fx = parseFixture(JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')));
} catch {
  out({ ok: false, error: `unknown scenario "${scenarioArg}"`, available: ['single', 'team', 'coupon-expired'] });
  process.exit(1);
}

const plan = rev === null ? fx.initial : fx.revisions[rev];
if (!plan) {
  out({ ok: false, error: `revision ${rev} does not exist in ${name}` });
  process.exit(1);
}

const intent = parseIntent(fx.requirement);
intent.store = fx.store.id;
intent.missing = intent.missing.filter((f) => f !== 'store');
// Revisions may narrow constraints (e.g. a lower budget cap) — apply them so the
// exported PR reflects what the reviewer actually approved in that round.
if (typeof plan === 'object' && plan !== null && 'intentPatch' in plan) {
  const patch = (plan as { intentPatch?: { budgetMax?: number | null } }).intentPatch;
  if (patch?.budgetMax != null) intent.budget.max = patch.budgetMax;
}

out(buildDemoPR(fx, plan, version, intent));
