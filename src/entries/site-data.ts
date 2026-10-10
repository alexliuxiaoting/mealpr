#!/usr/bin/env node
/**
 * site-data.mjs — emit the structured payload the P1 review page renders.
 *
 * Everything here is DEMO fixture data projected through the real core, so the
 * page shows the same validations, diffs and fingerprints the Skill produces.
 */
import { diffPRs } from '../diff.js';
import { parseIntent, reviseIntent } from '../intent.js';
import { parseFixture, buildDemoPR, type Fixture } from '../demo.js';
import { renderPR } from '../render.js';
import { assertExecutable } from '../review-state.js';
import { out } from './_io.js';

const NAMES = ['demo-single', 'demo-team', 'demo-coupon-expired', 'demo-combo'];

async function load(name: string): Promise<Fixture> {
  const { readFile } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(join(here, '..', '..', 'mealpr', 'fixtures', `${name}.json`), 'utf8');
  return parseFixture(JSON.parse(raw));
}

function project(fx: Fixture) {
  let intent = parseIntent(fx.requirement);
  intent.store = fx.store.id;
  intent.missing = intent.missing.filter((f) => f !== 'store');

  const plans = [fx.initial, ...fx.revisions];
  const versions = plans.map((plan, idx) => {
    const pr = buildDemoPR(fx, plan, idx + 1, intent);
    return { pr, markdown: renderPR(pr) };
  });

  // Replay intent revisions so later versions carry the reviewer's constraints.
  for (let i = 1; i < fx.revisions.length; i++) {
    const rev = fx.revisions[i - 1]!;
    const next = reviseIntent(intent, rev.request);
    if (rev.intentPatch?.budgetMax != null) next.budget.max = rev.intentPatch.budgetMax;
    intent = next;
  }

  const diffs = versions.slice(1).map((v, i) => diffPRs(versions[i]!.pr, v.pr));

  return {
    id: fx.id,
    name: fx.name,
    description: fx.description,
    requirement: fx.requirement,
    disclaimer: (fx as unknown as { _disclaimer?: string })._disclaimer ?? null,
    simulatedOrder: fx.simulatedOrder,
    versions: versions.map((v) => ({ pr: v.pr, markdown: v.markdown })),
    diffs,
    executionGuard: assertExecutable(versions[versions.length - 1]!.pr),
  };
}

const scenarios = [];
for (const n of NAMES) scenarios.push(project(await load(n)));

out({
  ok: true,
  generatedAt: new Date('2026-10-10T10:00:00.000Z').toISOString(),
  note: 'All data is DEMO fixture data projected through the real MealPR core. No MCP call was made; no order was created.',
  scenarios,
});
