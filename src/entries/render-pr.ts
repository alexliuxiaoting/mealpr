#!/usr/bin/env node
/**
 * render-pr.mjs — F06 / P1 share card
 *   node render-pr.mjs --file pr.json
 *   node render-pr.mjs --file pr.json --diff diff-input.json
 *   node render-pr.mjs --file pr.json --share     // redacted share-safe PR
 */
import { parseMealPR } from '../types.js';
import { diffPRs } from '../diff.js';
import { renderPR } from '../render.js';
import { sanitizeForShare } from '../redact.js';
import { readInput, out } from './_io.js';

interface Input {
  pr?: unknown;
  diff?: { before: unknown; after: unknown };
}

const input = readInput<Input>();
const prPayload = input && input.pr !== undefined ? input.pr : input;
if (!prPayload || typeof prPayload !== 'object') {
  out({ ok: false, error: 'usage: node render-pr.mjs --file pr.json' });
  process.exit(1);
}

const pr = parseMealPR(prPayload);

if (process.argv.includes('--share')) {
  out({ ok: true, share: sanitizeForShare(pr as unknown as Record<string, unknown>) });
  process.exit(0);
}

const diffBlock = input.diff ? diffPRs(parseMealPR(input.diff.before), parseMealPR(input.diff.after)).unified : undefined;
out(renderPR(pr, { diffBlock }));
