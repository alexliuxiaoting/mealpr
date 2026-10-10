#!/usr/bin/env node
/**
 * demo.mjs — F10 end-to-end demo, no MCP token required.
 *   node demo.mjs single | team | coupon-expired | all
 *   node demo.mjs team --json
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFixture, renderDemoReport, runDemo } from '../demo.js';
import { out } from './_io.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '..', 'fixtures');

const SCENARIOS = ['demo-single', 'demo-team', 'demo-coupon-expired', 'demo-combo'] as const;

const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'team';
const asJson = process.argv.includes('--json');

const selected = arg === 'all' ? [...SCENARIOS] : [SCENARIOS.find((s) => s === `demo-${arg}`) ?? `demo-${arg}`];

for (const name of selected) {
  const fx = parseFixture(JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')));
  const run = runDemo(fx);
  if (asJson) {
    out({ scenario: run.scenario, executionGuard: run.executionGuard, finalStatus: run.finalPR.status, steps: run.steps.map((s) => s.headline) });
  } else {
    out(renderDemoReport(run));
    out(`\n<!-- scenario=${name} finalStatus=${run.finalPR.status} simulatedOrder=${run.finalPR.order.orderId} guardOk=${run.executionGuard.ok} -->`);
  }
}
