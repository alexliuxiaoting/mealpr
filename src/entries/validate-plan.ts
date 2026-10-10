#!/usr/bin/env node
/**
 * validate-plan.mjs — validation layer
 *   node validate-plan.mjs --file input.json
 *
 * Input:  { pr, catalog?: [{code,available}], detailChecked?: boolean }
 * Output: { ok, validations, summary, canSubmitForReview }
 *
 * Blocking checks are never downgraded to make a plan pass.
 */
import { parseMealPR, safeParseMealPR, type MealPR } from '../types.js';
import { allBlockingPass, buildValidationSet, summarize } from '../validate.js';
import { readInput, out } from './_io.js';

interface Input {
  pr?: unknown;
  catalog?: Array<{ code: string; name?: string; available?: boolean }> | null;
  detailChecked?: boolean;
}

const input = readInput<Input>();
// Accept both `{ pr, catalog }` and a bare PR object (pipe-friendly).
const prPayload = input && input.pr !== undefined ? input.pr : input;
if (!prPayload || typeof prPayload !== 'object') {
  out({ ok: false, error: 'usage: node validate-plan.mjs --file input.json  // { pr, catalog?, detailChecked? } or a bare PR' });
  process.exit(1);
}

const parsed = safeParseMealPR(prPayload);
if (!parsed.ok) {
  out({ ok: false, error: 'invalid MealPR payload', issues: parsed.issues });
  process.exit(1);
}
const pr: MealPR = parsed.data;

const validations = buildValidationSet(pr, {
  catalog: input.catalog === undefined ? null : input.catalog,
  detailChecked: Boolean(input.detailChecked),
});
const summary = summarize(validations);

out({
  ok: true,
  prId: pr.id,
  version: pr.version,
  mode: pr.mode,
  status: pr.status,
  validations,
  summary,
  canSubmitForReview: allBlockingPass(validations),
  hint: allBlockingPass(validations)
    ? 'All blocking checks passed — this version may be submitted for human review.'
    : 'BLOCKED: resolve the failing checks above. Do not relax validation to make the plan pass.',
});
