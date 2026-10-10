#!/usr/bin/env node
/**
 * redact.mjs — PRD 7.4 / T12
 *   echo '{"text":"Authorization: Bearer <PASTE_YOUR_TOKEN_HERE>"}' | node redact.mjs
 *   node redact.mjs --file workbuddy.md --mode scan
 *   node redact.mjs --file README.md --mode scan --allow-noncritical
 *   node redact.mjs --file tests/redact.test.ts --mode scan --strict  # audit fixtures too
 *
 * Exit code 1 means "this file must not be shared or committed as-is".
 * Test/demo fixture paths are exempt unless --strict is passed.
 */
import { readFileSync } from 'node:fs';
import { redact, sanitizeForShare, scan, RULE_IDS } from '../redact.js';
import { readInput, out } from './_io.js';

const args = process.argv.slice(2);
const modeIdx = args.indexOf('--mode');
const mode = modeIdx === -1 ? 'redact' : (args[modeIdx + 1] ?? 'redact');
const allowNonCritical = args.includes('--allow-noncritical');
const strict = args.includes('--strict');
const fileIdx = args.indexOf('--file');
const targetFile = fileIdx === -1 ? null : args[fileIdx + 1] ?? null;

const text: string = targetFile
  ? readFileSync(targetFile, 'utf8')
  : (() => {
      const input = readInput<{ text?: string } | string>();
      return typeof input === 'string' ? input : (input.text ?? '');
    })();

if (!text.trim()) {
  out({ ok: false, error: 'usage: node redact.mjs --file <path> [--mode scan|redact]' });
  process.exit(1);
}

if (mode === 'redact') {
  const r = redact(text);
  out({ ok: true, hits: r.hits, text: r.text });
  process.exit(0);
}

const result = scan(text, targetFile ?? '<stdin>', { allowFixtures: !strict });
const critical = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
const blocking = allowNonCritical ? result.findings.filter((f) => f.severity === 'critical') : critical;

out({
  ok: blocking.length === 0,
  rules: RULE_IDS,
  scannedLines: result.scannedLines,
  ...(result.skippedAsFixture ? { skippedAsFixture: true } : {}),
  findings: result.findings,
  blockingCount: blocking.length,
  verdict: result.skippedAsFixture
    ? 'SKIPPED — known fixture path (tests/ or fixtures/). Re-run with --strict to audit it anyway.'
    : blocking.length === 0
      ? 'CLEAN — safe to share/commit.'
      : `BLOCKED — ${blocking.length} sensitive finding(s). Redact before sharing. Run: node redact.mjs --file <path>`,
});
process.exit(blocking.length === 0 ? 0 : 1);
