import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoPR, parseFixture, type Fixture } from '../src/demo.js';
import { parseIntent } from '../src/intent.js';
import { applyAction } from '../src/review-state.js';
import type { MealPR } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..');
export const fixtureDir = join(repoRoot, 'mealpr', 'fixtures');

export function loadFixture(name: string): Fixture {
  return parseFixture(JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')));
}

/** Build a DEMO PR straight out of a fixture plan, using the fixture's own requirement as the intent. */
export function demoPR(name: string, planIndex = -1): MealPR {
  const fx = loadFixture(name);
  const plan = planIndex < 0 ? fx.initial : fx.revisions[planIndex]!;
  const intent = parseIntent(fx.requirement);
  intent.store = fx.store.id;
  intent.missing = intent.missing.filter((f) => f !== 'store');
  return buildDemoPR(fx, plan, 1, intent);
}

/** A LIVE-mode PR that is already approved — the starting point for execution tests. */
export function approvedLivePR(name = 'demo-team'): MealPR {
  const pr = asLive(demoPR(name));
  const res = applyAction(applyAction(pr, 'SUBMIT_FOR_REVIEW').pr, 'APPROVE');
  if (!res.ok) throw new Error(`fixture ${name} could not reach APPROVED: ${res.message}`);
  return res.pr;
}

/**
 * Promote a DEMO PR to the LIVE shape used by the authorization tests:
 * every provenance becomes 'mcp' so it would be executable if approved.
 */
export function asLive(pr: MealPR, overrides: Partial<MealPR> = {}): MealPR {
  const live: MealPR = structuredClone(pr);
  live.mode = 'LIVE';
  live.store = live.store ? { ...live.store, source: 'mcp' } : live.store;
  live.priceQuote = { ...live.priceQuote, source: 'mcp' };
  live.coupons = live.coupons.map((c) => ({ ...c, source: 'mcp' as const, verified: true }));
  return { ...live, ...overrides };
}

export function withIntent(pr: MealPR, patch: Partial<MealPR['userIntent']>): MealPR {
  return { ...pr, userIntent: { ...pr.userIntent, ...patch } };
}
