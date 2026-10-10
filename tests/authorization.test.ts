/** F09 / F10 — authorization boundaries: DEMO cannot touch the real world. */
import { describe, expect, it } from 'vitest';
import { assertExecutable, applyAction } from '../src/review-state.js';
import { runDemo, parseFixture, renderDemoReport } from '../src/demo.js';
import type { Fixture } from '../src/demo.js';
import { loadFixture, demoPR, approvedLivePR } from './helpers.js';

describe('T10 - DEMO mode never reaches a real order', () => {
  it('the execution gate refuses DEMO by construction', () => {
    const demo = applyAction(applyAction(demoPR('demo-team'), 'SUBMIT_FOR_REVIEW').pr, 'APPROVE').pr;
    expect(demo.mode).toBe('DEMO');
    expect(demo.status).toBe('APPROVED');
    const gate = assertExecutable(demo);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('demo-mode');
  });

  it('every demo scenario ends in a simulated order', () => {
    for (const name of ['demo-single', 'demo-team', 'demo-coupon-expired']) {
      const run = runDemo(loadFixture(name));
      expect(run.executionGuard.ok).toBe(false);
      expect(run.finalPR.order.simulated).toBe(true);
      expect(run.finalPR.order.orderId).toMatch(/^DEMO-ORDER-/);
      expect(run.finalPR.order.payUrl).toBeNull();
    }
  });

  it('DEMO fixtures are labelled and never carry mcp provenance', () => {
    for (const name of ['demo-single', 'demo-team', 'demo-coupon-expired']) {
      const run = runDemo(loadFixture(name));
      expect(run.finalPR.mode).toBe('DEMO');
      expect(run.finalPR.priceQuote.source).toBe('demo');
      for (const c of run.finalPR.coupons) expect(c.source).toBe('demo');
    }
  });

  it('the identical plan built in LIVE mode is executable — the DEMO shutdown is real, not cosmetic', () => {
    const live = approvedLivePR('demo-team');
    expect(live.mode).toBe('LIVE');
    expect(assertExecutable(live).ok).toBe(true);
  });
});

describe('execution gate coverage', () => {
  const approved = approvedLivePR('demo-team');

  it('blocks an empty plan', () => {
    expect(assertExecutable({ ...approved, items: [] }).reason).toBe('empty-plan');
  });

  it('blocks a missing store', () => {
    expect(assertExecutable({ ...approved, store: null }).reason).toBe('no-store');
  });

  it('blocks a missing fulfillment mode', () => {
    expect(assertExecutable({ ...approved, fulfillment: null }).reason).toBe('no-fulfillment');
  });

  it('blocks an uncalculated price', () => {
    expect(assertExecutable({ ...approved, priceQuote: { ...approved.priceQuote, calculated: false } }).reason).toBe('price-not-calculated');
  });
});

describe('T03 (end-to-end) - coupon expiry scenario', () => {
  const fx: Fixture = loadFixture('demo-coupon-expired');

  it('blocks the over-budget revision instead of shipping it', () => {
    const run = runDemo(fx);
    expect(run.steps.some((s) => s.headline.includes('未通过自动校验'))).toBe(true);
  });

  it('still reaches a reviewable, approved version after the human lowers the spec', () => {
    const run = runDemo(fx);
    expect(run.finalPR.status).toBe('ORDER_CREATED');
    expect(run.finalPR.priceQuote.payable).toBeLessThanOrEqual(run.finalPR.userIntent.budget.max ?? Infinity);
  });

  it('is deterministic — identical input produces identical transcript', () => {
    expect(renderDemoReport(runDemo(fx))).toBe(renderDemoReport(runDemo(fx)));
  });

  it('fixtures validate against the schema', () => {
    expect(() => parseFixture(fx)).not.toThrow();
  });
});
