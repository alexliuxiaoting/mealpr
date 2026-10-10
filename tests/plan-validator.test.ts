/**
 * T01 / T02 — candidate generation and plan validation.
 * Nothing here may turn an unverified value into a PASS.
 */
import { describe, expect, it } from 'vitest';
import { explainNoPlan, filterCatalog, generateCandidates, prescreenByMenuPrice, type CatalogItem } from '../src/plan.js';
import { parseIntent } from '../src/intent.js';
import { buildNutritionSummary, buildValidationSet, checkAvailability, checkWithinBudget, checkPriceCalculated } from '../src/validate.js';
import type { MealPR, UserIntent } from '../src/types.js';
import { demoPR, withIntent } from './helpers.js';

const catalog: CatalogItem[] = [
  { code: 'M-A', name: 'A 汉堡', category: 'main', price: 20 },
  { code: 'M-B', name: 'B 汉堡', category: 'main', price: 25 },
  { code: 'M-C', name: 'C 汉堡（辣）', category: 'main', price: 22 },
  { code: 'M-FRY', name: '薯条', category: 'side', price: 11 },
  { code: 'M-NUG', name: '鸡块', category: 'side', price: 12 },
  { code: 'M-COLA', name: '可乐', category: 'drink', price: 10 },
  { code: 'M-ZERO', name: '无糖可乐', category: 'drink', price: 10 },
  { code: 'M-CONE', name: '甜筒', category: 'dessert', price: 5 },
];

function intentFor(text: string): UserIntent {
  const i = parseIntent(text);
  i.store = 'S-1';
  return i;
}

describe('T01 - budget-constrained planning', () => {
  it('generates candidates that feed every person', () => {
    const intent = intentFor('我和同事 2 个人吃饭，70 元以内，到店取餐');
    expect(intent.people).toBe(2);
    expect(intent.budget.max).toBe(70);
    expect(intent.fulfillment).toBe('pickup');

    const candidates = generateCandidates(catalog, intent);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);

    for (const c of candidates) {
      const mains = c.items.filter((i) => i.category === 'main' || i.category === 'combo').reduce((s, i) => s + i.quantity, 0);
      expect(mains).toBeGreaterThanOrEqual(2);
      const drinks = c.items.filter((i) => i.category === 'drink').reduce((s, i) => s + i.quantity, 0);
      expect(drinks).toBeGreaterThanOrEqual(2);
    }
  });

  it('honours explicit exclusions', () => {
    const intent = intentFor('2 人 70 元以内，不要辣，到店取餐');
    expect(intent.exclusions).toContain('辣');
    const { dropped } = filterCatalog(catalog, intent);
    expect(dropped.some((d) => d.includes('C 汉堡'))).toBe(true);
    for (const c of generateCandidates(catalog, intent)) {
      expect(c.items.every((i) => !i.name.includes('辣'))).toBe(true);
    }
  });

  it('prefers zero-sugar drinks when asked', () => {
    const intent = intentFor('帮我配 1 人份，40 元以内，饮料要无糖的，到店取餐');
    const candidates = generateCandidates(catalog, intent);
    const withDrink = candidates.filter((c) => c.items.some((i) => i.category === 'drink'));
    expect(withDrink.length).toBeGreaterThan(0);
    for (const c of withDrink) {
      expect(c.items.every((i) => i.category !== 'drink' || /无糖/.test(i.name))).toBe(true);
    }
  });

  it('pre-screens by menu price without pretending it is the payable', () => {
    const intent = intentFor('1 人，30 元以内，到店取餐');
    const all = generateCandidates(catalog, intent);
    const survivors = prescreenByMenuPrice(all, intent);
    expect(all.length).toBeGreaterThan(0);
    for (const c of survivors) {
      expect(c.estimatedTotal).not.toBeNull();
      expect(c.estimatedTotal!).toBeLessThanOrEqual(30);
    }
  });

  it('explains honestly when no plan fits the budget', () => {
    const intent = intentFor('帮我配 3 人份，25 元以内，到店取餐');
    const reason = explainNoPlan(catalog, intent);
    expect(reason).toMatch(/无法满足|提高预算|调整/);
    expect(reason).not.toMatch(/¥0|未知/);
  });
});

describe('T02 - over-budget plans must fail', () => {
  const pr = demoPR('demo-coupon-expired', 0); // no coupon -> payable 80 with cap 70

  it('reports the budget breach as a blocking FAIL', () => {
    const budget = checkWithinBudget(pr.userIntent, pr.priceQuote);
    expect(budget.status).toBe('FAIL');
    expect(budget.blocking).toBe(true);
    expect(budget.detail).toMatch(/exceeds cap/);
  });

  it('never lets such a plan reach READY_FOR_REVIEW', () => {
    const checks = buildValidationSet(pr, { catalog: [{ code: 'M-BIGMAC', available: true }, { code: 'M-FRY-M', available: true }, { code: 'M-COLA-M', available: true }] });
    const failed = checks.filter((c) => c.blocking && c.status !== 'PASS').map((c) => c.id);
    expect(failed).toContain('within-budget');
  });

  it('marks availability UNKNOWN when no menu was loaded instead of assuming PASS', () => {
    const check = checkAvailability(pr.items, null);
    expect(check.status).toBe('UNKNOWN');
    expect(check.blocking).toBe(true);
  });

  it('fails to UNKNOWN (never PASS) when the price was never calculated', () => {
    const unpriced: MealPR = { ...pr, priceQuote: { ...pr.priceQuote, calculated: false, payable: null, unverifiedReason: 'calculate-price unavailable (401)' } };
    const check = checkPriceCalculated(unpriced.priceQuote);
    expect(check.status).toBe('FAIL');
    const budget = checkWithinBudget(unpriced.userIntent, unpriced.priceQuote);
    expect(budget.status).toBe('UNKNOWN');
    expect(budget.blocking).toBe(true);
  });
});

describe('T11 - nutrition honesty', () => {
  it('reports PARTIAL and lists what has no official data', () => {
    const pr = demoPR('demo-single', 0); // 麦香鸡 + 薯条 + 可乐；可乐无官方数据
    expect(pr.nutritionSummary.status).toBe('PARTIAL');
    expect(pr.nutritionSummary.coverage).toBeLessThan(1);
    expect(pr.nutritionSummary.coverage).toBeGreaterThan(0);
    expect(pr.nutritionSummary.missing.some((m) => m.includes('可乐'))).toBe(true);
    expect(pr.nutritionSummary.note).toMatch(/PARTIAL/);
  });

  it('reports UNKNOWN and totals nothing when nothing matched', () => {
    const summary = buildNutritionSummary(
      [{ code: 'X', name: '某商品', category: 'main', quantity: 1, options: [], unitPrice: 1, nutritionRef: null, comboComposition: null, remark: null }],
      () => null,
    );
    expect(summary.status).toBe('UNKNOWN');
    expect(summary.coverage).toBe(0);
    expect(summary.totals?.energyKcal ?? null).toBeNull();
    expect(summary.note).toMatch(/UNKNOWN/);
  });

  it('never claims VERIFIED with partial coverage', () => {
    const pr = withIntent(demoPR('demo-single', 0), { nutritionGoals: { maxCaloriesKcal: 500, minProteinG: null, maxSodiumMg: null } });
    expect(pr.nutritionSummary.status).not.toBe('VERIFIED');
  });
});
