/** F07 — versioned diffs. */
import { describe, expect, it } from 'vitest';
import { diffPRs, renderUnified } from '../src/diff.js';
import { renderPR } from '../src/render.js';
import { demoPR } from './helpers.js';
import type { MealPR } from '../src/types.js';

const v1 = demoPR('demo-single', -1); // 麦香鸡 + 薯条 + 可乐
const v2 = demoPR('demo-single', 0); // 麦香鸡 + 无糖可乐

function bump(pr: MealPR, version: number): MealPR {
  return { ...pr, version };
}

describe('T04 - revisions produce an auditable diff', () => {
  it('detects added, removed and quantity changes', () => {
    const d = diffPRs(bump(v1, 1), bump(v2, 2));
    expect(d.fromVersion).toBe(1);
    expect(d.toVersion).toBe(2);
    expect(d.summary.added).toBe(1); // 无糖可乐
    expect(d.summary.removed).toBe(2); // 可乐 + 薯条

    const removed = d.items.filter((i) => i.kind === 'removed').map((i) => i.name);
    const added = d.items.filter((i) => i.kind === 'added').map((i) => i.name);
    expect(removed).toContain('中杯可乐');
    expect(removed).toContain('中份薯条');
    expect(added).toContain('中杯无糖可乐');
  });

  it('reports the payable delta and the remaining-budget delta', () => {
    const d = diffPRs(bump(v1, 1), bump(v2, 2));
    expect(d.payable.changed).toBe(true);
    expect(d.payable.before).toBe(36);
    expect(d.payable.after).toBe(25);
    expect(d.payable.verified).toBe(true);
    expect(d.remainingBudget.after).toBe(15);
  });

  it('detects quantity-only changes', () => {
    const sameMore = { ...v1, items: v1.items.map((i) => (i.code === 'M-MCCHICKEN' ? { ...i, quantity: 2 } : i)) };
    const d = diffPRs(bump(v1, 1), bump(sameMore, 2));
    expect(d.summary.quantityChanged).toBe(1);
    expect(d.items.find((i) => i.code === 'M-MCCHICKEN')?.kind).toBe('quantity-changed');
  });

  it('detects coupon changes', () => {
    const withCoupon = demoPR('demo-team');
    const without = { ...withCoupon, coupons: [], priceQuote: { ...withCoupon.priceQuote, discountTotal: null, payable: 75 } };
    const d = diffPRs(bump(withCoupon, 1), bump(without, 2));
    expect(d.coupons.some((c) => c.kind === 'removed')).toBe(true);
    expect(d.payable.changed).toBe(true);
    expect(d.payable.before).toBe(67);
    expect(d.payable.after).toBe(75);
  });

  it('requires re-approval on substantive change, and not otherwise', () => {
    expect(diffPRs(bump(v1, 1), bump(v2, 2)).requiresReapproval).toBe(true);
    expect(diffPRs(bump(v1, 1), bump(v1, 2)).requiresReapproval).toBe(false);
  });

  it('flags money deltas as NOT RECALCULATED when a quote is missing', () => {
    const unpriced: MealPR = { ...v2, priceQuote: { ...v2.priceQuote, calculated: false, payable: null } };
    const d = diffPRs(bump(v1, 1), bump(unpriced, 2));
    expect(d.payable.verified).toBe(false);
    expect(d.unified).toMatch(/NOT RECALCULATED/);
  });

  it('renders a GitHub-style unified diff', () => {
    const d = diffPRs(bump(v1, 1), bump(v2, 2));
    expect(d.unified.startsWith('--- Meal PR v1')).toBe(true);
    expect(d.unified).toMatch(/@@ Items @@/);
    expect(renderUnified(d)).toContain('Re-approval required');
  });

  it('renders the diff block inside the PR markdown', () => {
    const md = renderPR(bump(v2, 2), { diffBlock: diffPRs(bump(v1, 1), bump(v2, 2)).unified });
    expect(md).toMatch(/### Diff vs previous version/);
    expect(md).toMatch(/```diff/);
    expect(md).toMatch(/- 中杯可乐/);
  });
});

describe('T03 - coupon failure re-priced honestly', () => {
  const team = demoPR('demo-team');
  const expiredUnderBudget = demoPR('demo-coupon-expired', 0);

  it('shows the payable rise when the coupon is dropped', () => {
    const d = diffPRs(
      { ...team, version: 1 },
      { ...team, version: 2, coupons: [], priceQuote: { ...team.priceQuote, discountTotal: null, payable: 75 } },
    );
    expect(d.unified).toMatch(/- Payable: ¥67\.00/);
    expect(d.unified).toMatch(/\+ Payable: ¥75\.00/);
    expect(d.coupons.some((c) => c.kind === 'removed')).toBe(true);
  });

  it('keeps the over-budget scenario out of the reviewable state', () => {
    expect(expiredUnderBudget.priceQuote.payable).toBe(80);
    expect(expiredUnderBudget.userIntent.budget.max).toBe(70);
    expect(expiredUnderBudget.validations.find((v) => v.id === 'within-budget')?.status).toBe('FAIL');
  });
});
