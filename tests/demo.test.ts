/**
 * E2E demo — the whole loop with no MCP token:
 * intent -> PR -> request changes -> diff -> approve -> simulated order.
 */
import { describe, expect, it } from 'vitest';
import { runDemo, renderDemoReport, buildDemoPR, parseFixture } from '../src/demo.js';
import { parseIntent, reviseIntent } from '../src/intent.js';
import { diffPRs } from '../src/diff.js';
import { applyAction } from '../src/review-state.js';
import { loadFixture, demoPR } from './helpers.js';

describe('end-to-end demo loop', () => {
  it('scenario A: solo budget meal', () => {
    const run = runDemo(loadFixture('demo-single'));
    expect(run.requirement).toMatch(/40 元以内/);
    expect(run.finalPR.status).toBe('ORDER_CREATED');
    expect(run.finalPR.userIntent.budget.max).toBe(40);
    expect(run.finalPR.priceQuote.payable!).toBeLessThanOrEqual(40);
    expect(run.steps.map((s) => s.kind)).toEqual(['note', 'submitted', 'changes-requested', 'diff', 'approved', 'executed', 'executed']);
  });

  it('scenario B: two-person celebration', () => {
    const run = runDemo(loadFixture('demo-team'));
    expect(run.finalPR.userIntent.people).toBe(2);
    const mains = run.finalPR.items.filter((i) => i.category === 'main').reduce((s, i) => s + i.quantity, 0);
    expect(mains).toBeGreaterThanOrEqual(2);
  });

  it('every revision bumps the version and re-validates', () => {
    const fx = loadFixture('demo-single');
    const intent = parseIntent(fx.requirement);
    intent.store = fx.store.id;
    const v1 = buildDemoPR(fx, fx.initial, 1, intent);
    const v2 = buildDemoPR(fx, fx.revisions[0]!, 2, reviseIntent(intent, fx.revisions[0]!.request));
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.validations.every((c) => !c.blocking || c.status === 'PASS')).toBe(true);
    expect(diffPRs(v1, v2).toVersion).toBe(2);
  });

  it('a recommendation reply alone is not an approval', () => {
    const v1 = demoPR('demo-single');
    const submitted = applyAction(v1, 'SUBMIT_FOR_REVIEW').pr;
    expect(submitted.status).toBe('READY_FOR_REVIEW');
    expect(applyAction(submitted, 'CREATE_ORDER').ok).toBe(false);
    // Only an explicit APPROVE moves it forward.
    expect(applyAction(submitted, 'APPROVE').pr.status).toBe('APPROVED');
  });

  it('demo transcripts are reproducible Markdown', () => {
    const md = renderDemoReport(runDemo(loadFixture('demo-team')));
    expect(md).toMatch(/# MealPR demo transcript/);
    expect(md).toMatch(/DEMO \/ 模拟数据/);
    expect(md).toMatch(/### Review Actions/);
    expect(md).toMatch(/Automated simulated order|Simulated order/);
  });

  it('rejects plan items that are not in the fixture menu instead of silently inventing one', () => {
    const fx = loadFixture('demo-single');
    const broken = { ...fx, initial: { ...fx.initial, items: [{ code: 'NOT-IN-MENU', quantity: 1, options: [], comboComposition: null }] } };
    expect(() => buildDemoPR(parseFixture(broken), broken.initial, 1, parseIntent(fx.requirement))).toThrow(/NOT-IN-MENU/);
  });
});
