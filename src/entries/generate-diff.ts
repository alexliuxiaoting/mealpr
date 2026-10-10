#!/usr/bin/env node
/**
 * generate-diff.mjs — F07
 *   node generate-diff.mjs --file input.json   // { before, after }
 *   node generate-diff.mjs --file input.json --format unified
 */
import { parseMealPR } from '../types.js';
import { diffPRs } from '../diff.js';
import { readInput, out } from './_io.js';

interface Input {
  before: unknown;
  after: unknown;
}

const input = readInput<Input>();
if (!input || input.before === undefined || input.after === undefined) {
  out({ ok: false, error: 'usage: node generate-diff.mjs --file input.json  // { before, after }' });
  process.exit(1);
}

const d = diffPRs(parseMealPR(input.before), parseMealPR(input.after));

if (process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'unified') {
  out(d.unified);
} else {
  out({ ok: true, diff: d });
}
