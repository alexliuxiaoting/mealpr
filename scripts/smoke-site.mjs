/**
 * Smoke test for the P1 review page bundle.
 *
 * Runs the exact IIFE the browser loads, inside a fake window, and asserts:
 *   - the exported core API is present
 *   - the browser build mints the same fingerprint as Node (hash parity)
 *   - the guard refuses a DEMO PR, so the page can never imply a real order
 *   - the shipped data contains no credential-shaped strings
 *
 *   node scripts/smoke-site.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreJs = readFileSync(join(root, 'dist', 'mealpr-core.js'), 'utf8');
const dataJson = readFileSync(join(root, 'dist', 'mealpr-data.json'), 'utf8');

const failures = [];
const check = (label, cond) => {
  if (cond) console.log(`  ok   ${label}`);
  else { console.log(`  FAIL ${label}`); failures.push(label); }
};

// The vm context has no Web APIs; a real browser does. Inject the few the
// core needs so we are exercising the bundle, not the sandbox's gaps.
const sandbox = { window: {}, console, TextEncoder, TextDecoder, structuredClone };
sandbox.globalThis = sandbox;
createContext(sandbox);
runInContext(coreJs, sandbox);
const CORE = sandbox.MealPR ?? sandbox.window.MealPR;

console.log('core API');
check('MealPR global exists', !!CORE);
for (const fn of ['applyAction', 'assertExecutable', 'allowedActions', 'canTransition', 'buildValidationSet', 'diffPRs', 'renderPR', 'computeFingerprint', 'parseMealPR']) {
  check(`${fn} is exported`, typeof CORE?.[fn] === 'function');
}

const data = JSON.parse(dataJson);
console.log('\ndata');
check('4 demo scenarios shipped', data.scenarios.length === 4);
check('every scenario has versions', data.scenarios.every((s) => s.versions.length >= 1));
check('no scenario claims a real order', data.scenarios.every((s) => s.executionGuard.ok === false));

console.log('\nfingerprint parity (browser bundle vs node:crypto)');
const pr = CORE.parseMealPR(data.scenarios[1].versions[0].pr);
const fp = CORE.computeFingerprint(pr);
const payload = JSON.stringify({
  id: pr.id, version: pr.version, mode: pr.mode, storeId: pr.store?.id ?? null, fulfillment: pr.fulfillment ?? null,
  items: [...pr.items].map((i) => ({ code: i.code, quantity: i.quantity, options: i.options.map((o) => ({ group: o.group ?? '', name: o.name, quantity: o.quantity })) })).sort((a, b) => a.code.localeCompare(b.code)),
  coupons: pr.coupons.filter((c) => c.verified).map((c) => c.id).sort(),
  payable: pr.priceQuote.payable,
});
check('browser fingerprint is 64 hex chars', /^[0-9a-f]{64}$/.test(fp));
check('matches node:crypto over the same payload', fp === createHash('sha256').update(payload, 'utf8').digest('hex'));

console.log('\nstate machine on the shipped data');
const submitted = CORE.applyAction(pr, 'SUBMIT_FOR_REVIEW');
check('v1 of demo-team can be submitted for review', submitted.ok === true);
check('DEMO APPROVED PR is still refused by the execution gate', CORE.assertExecutable(CORE.applyAction(submitted.pr, 'APPROVE').pr).ok === false);
const comboV1 = CORE.parseMealPR(data.scenarios[3].versions[0].pr);
check('demo-combo v1 is blocked until the combo composition is read', CORE.applyAction(comboV1, 'SUBMIT_FOR_REVIEW').ok === false);
check('demo-combo v2 passes once it is read', CORE.applyAction(CORE.parseMealPR(data.scenarios[3].versions[1].pr), 'SUBMIT_FOR_REVIEW').ok === true);

console.log('\nsecret scan of the shipped bundle');
const blob = coreJs + dataJson;
for (const re of [/Bearer\s+[A-Za-z0-9_\-]{16,}/, /MCD_MCP_TOKEN\s*[:=]\s*["'][^"']{8,}/, /1[3-9]\d{9}/]) {
  check(`no ${re} in the bundle`, !re.test(blob));
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall smoke checks passed');
