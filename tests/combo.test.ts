/**
 * T13 — combo (套餐) must never be treated as a plain main.
 *
 * Regression test for the bug found on 2026-10-10: the planner pooled combos
 * together with mains and then stacked a drink + a side on top, producing
 * plans like "酥脆无双套餐 + 可乐 + 苹果片" where the combo already contains
 * chicken + fries + a zero-sugar coke. That is duplicate charging, and the
 * human reviewing the PR had no way to see it.
 */
import { describe, expect, it } from 'vitest';
import { buildComboPlan, generateCandidates, type CatalogItem } from '../src/plan.js';
import { buildValidationSet, checkComboComposition, checkPortions, effectiveMainCount } from '../src/validate.js';
import { parseIntent } from '../src/intent.js';
import { buildComboComposition } from '../src/mcp-adapt.js';
import { applyAction } from '../src/review-state.js';
import { parseFixture, buildDemoPR } from '../src/demo.js';
import { loadFixture, demoPR } from './helpers.js';

const COMBO: CatalogItem = {
  code: 'C-CRISPY-COMBO',
  name: '酥脆无双套餐',
  category: 'combo',
  price: 36.5,
  available: true,
  // Never queried: exactly the state that produced the bug.
  composition: null,
};

const MENU: CatalogItem[] = [
  COMBO,
  { code: 'M-MCCHICKEN', name: '麦香鸡', category: 'main', price: 15, available: true },
  { code: 'M-FRY-M', name: '中份薯条', category: 'side', price: 11, available: true },
  { code: 'M-COLA-M', name: '中杯可乐', category: 'drink', price: 10, available: true },
  { code: 'M-CONE', name: '甜筒', category: 'dessert', price: 5, available: true },
];

function intent(people: number, budget: number) {
  const i = parseIntent(`${people} 人，${budget} 元以内，到店取餐`);
  i.store = 'DEMO-STORE';
  return i;
}

describe('T13a - the planner does not stack on top of an unverified combo', () => {
  const cands = generateCandidates(MENU, intent(1, 60), 4);
  const comboCand = cands.find((c) => c.id.startsWith('combo'));

  it('produces a combo candidate', () => {
    expect(comboCand).toBeDefined();
  });

  it('the combo candidate contains ONLY the combo — no duplicated side or drink', () => {
    expect(comboCand!.items).toHaveLength(1);
    expect(comboCand!.items[0]!.code).toBe('C-CRISPY-COMBO');
  });

  it('flags the combo for query-meal-detail and explains why', () => {
    expect(comboCand!.requiresComboDetail).toBe(true);
    expect(comboCand!.pendingDetailCodes).toEqual(['C-CRISPY-COMBO']);
    expect(comboCand!.warnings.join(' ')).toMatch(/重复计价/);
  });

  it('non-combo plans never smuggle a combo into the main pool', () => {
    for (const c of cands.filter((x) => !x.id.startsWith('combo'))) {
      expect(c.items.some((i) => i.category === 'combo')).toBe(false);
    }
  });

  it('the old buggy shape (combo + drink + side) is no longer generated', () => {
    for (const c of cands) {
      const hasCombo = c.items.some((i) => i.category === 'combo');
      const hasStacked = c.items.some((i) => i.category === 'drink' || i.category === 'side');
      expect(hasCombo && hasStacked).toBe(false);
    }
  });
});

describe('T13b - after query-meal-detail, only the real shortfall is topped up', () => {
  const pools = {
    mains: [MENU[1]!],
    sides: [MENU[2]!],
    drinks: [MENU[3]!],
  };

  it('a combo that already carries main+side+drink gets nothing added', () => {
    const combo: CatalogItem = {
      ...COMBO,
      composition: buildComboComposition(
        [
          { name: '炸鸡', category: 'main' },
          { name: '迷你薯条', category: 'side' },
          { name: '无糖可乐', category: 'drink' },
        ],
        { source: 'mcp-detail' },
      ),
    };
    const plan = buildComboPlan(combo, 2, pools);
    expect(plan.requiresComboDetail).toBe(false);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.quantity).toBe(2);
    expect(plan.rationale.join(' ')).toMatch(/无需额外补配/);
  });

  it('a combo with only a main gets the missing drinks and shared side', () => {
    const combo: CatalogItem = {
      ...COMBO,
      composition: buildComboComposition([{ name: '炸鸡', category: 'main' }], { source: 'mcp-detail' }),
    };
    const plan = buildComboPlan(combo, 2, pools);
    const codes = plan.items.map((i) => `${i.code}x${i.quantity}`);
    expect(codes).toContain('C-CRISPY-COMBOx2');
    expect(codes).toContain('M-COLA-Mx2');
    expect(codes).toContain('M-FRY-Mx1');
  });
});

describe('T13c - combo composition is a blocking validation', () => {
  it('blocks a plan whose combo was never resolved', () => {
    const check = checkComboComposition([
      { code: 'C-CRISPY-COMBO', name: '酥脆无双套餐', category: 'combo', quantity: 1, options: [], unitPrice: 36.5, nutritionRef: null, comboComposition: null, remark: null },
    ]);
    expect(check.status).toBe('UNKNOWN');
    expect(check.blocking).toBe(true);
    expect(check.detail).toMatch(/query-meal-detail/);
  });

  it('passes once the components came from a real detail call', () => {
    const check = checkComboComposition([
      {
        code: 'C-CRISPY-COMBO', name: '酥脆无双套餐', category: 'combo', quantity: 1, options: [], unitPrice: 36.5, nutritionRef: null,
        comboComposition: buildComboComposition([{ name: '炸鸡', category: 'main' }], { source: 'mcp-detail' }),
        remark: null,
      },
    ]);
    expect(check.status).toBe('PASS');
    expect(check.blocking).toBe(true);
  });

  it('a plan with no combo does not block on combos', () => {
    expect(checkComboComposition(demoPR('demo-team').items).status).toBe('PASS');
  });

  it('portions count the mains inside a verified combo, not the combo as a black box', () => {
    const verified = {
      code: 'C', name: '双人套餐', category: 'combo' as const, quantity: 1, options: [], unitPrice: 30, nutritionRef: null,
      comboComposition: buildComboComposition([{ name: '汉堡', category: 'main' }, { name: '汉堡', category: 'main' }], { source: 'mcp-detail' }),
      remark: null,
    };
    expect(effectiveMainCount([verified])).toEqual({ mains: 2, assumed: false });
    const unverified = { ...verified, comboComposition: null };
    expect(effectiveMainCount([unverified])).toEqual({ mains: 1, assumed: true });
    // The assumption is surfaced as UNKNOWN instead of a confident PASS...
    expect(checkPortions([{ ...unverified, quantity: 2 }], intent(2, 80)).status).toBe('UNKNOWN');
    // ...and when even the conservative count comes up short it fails hard.
    expect(checkPortions([unverified], intent(2, 80)).status).toBe('FAIL');
    expect(checkPortions([verified], intent(2, 80)).status).toBe('PASS');
  });
});

describe('T13d - end to end: the combo PR cannot be approved before its composition is read', () => {
  const fx = loadFixture('demo-combo');

  it('v1 (combo unresolved) is refused by SUBMIT_FOR_REVIEW', () => {
    const v1 = buildDemoPR(fx, fx.initial, 1, parseIntent(fx.requirement));
    const check = buildValidationSet(v1, { catalog: fx.catalog }).find((c) => c.id === 'combo-composition-verified');
    expect(check!.status).toBe('UNKNOWN');
    expect(check!.blocking).toBe(true);
    expect(applyAction(v1, 'SUBMIT_FOR_REVIEW').ok).toBe(false);
  });

  it('v2 (composition confirmed) passes and the redundant items are gone', () => {
    const v2 = buildDemoPR(fx, fx.revisions[0]!, 2, parseIntent(fx.requirement));
    expect(buildValidationSet(v2, { catalog: fx.catalog }).find((c) => c.id === 'combo-composition-verified')!.status).toBe('PASS');
    expect(v2.items).toHaveLength(1);
    expect(v2.priceQuote.payable).toBe(36.5);
    expect(applyAction(v2, 'SUBMIT_FOR_REVIEW').ok).toBe(true);
  });

  it('the fixture itself refuses to be loosened: a combo without components stays unverified', () => {
    const broken = parseFixture({ ...fx, revisions: [{ ...fx.revisions[0]!, items: [{ code: 'C-CRISPY-COMBO', quantity: 1, options: [], comboComposition: null }] }] });
    const v2 = buildDemoPR(broken, broken.revisions[0]!, 2, parseIntent(fx.requirement));
    expect(applyAction(v2, 'SUBMIT_FOR_REVIEW').ok).toBe(false);
  });
});
