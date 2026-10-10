/** F01 — intent extraction. Every "unknown" stays unknown. */
import { describe, expect, it } from 'vitest';
import { buildQuestions, parseIntent, requiredMissingFields, reviseIntent } from '../src/intent.js';

describe('intent parsing', () => {
  it('reads budget and preferences without inventing a head count (scenario A)', () => {
    const i = parseIntent('今天加班，帮我安排一个 40 元以内的麦当劳晚餐，尽量有肉、有饮料，优先使用优惠券');
    expect(i.budget.max).toBe(40);
    expect(i.budget.currency).toBe('CNY');
    expect(i.preferences).toContain('prefer-coupons');
    expect(i.preferences).toContain('prefer-meat');
    // "加班" is not "one person" — MealPR asks instead of guessing.
    expect(i.people).toBeNull();
    expect(requiredMissingFields(i)).toContain('people');
  });

  it('understands an explicit single diner', () => {
    expect(parseIntent('我一个人吃，40 元以内').people).toBe(1);
    expect(parseIntent('一人食，40 元以内').people).toBe(1);
  });

  it('reads head count for a team order (scenario B)', () => {
    const i = parseIntent('项目上线了，帮我和同事配一顿麦当劳，2 人，70 元以内');
    expect(i.people).toBe(2);
    expect(i.budget.max).toBe(70);
  });

  it('distinguishes pickup from delivery', () => {
    expect(parseIntent('到店取餐').fulfillment).toBe('pickup');
    expect(parseIntent('帮我送到公司').fulfillment).toBe('delivery');
    expect(parseIntent('我要外卖').fulfillment).toBe('delivery');
    expect(parseIntent('我还没想好').fulfillment).toBeNull();
  });

  it('extracts exclusions', () => {
    const i = parseIntent('不要辣，不吃香菜');
    expect(i.exclusions.some((e) => e.includes('辣'))).toBe(true);
    expect(i.exclusions.some((e) => e.includes('香菜'))).toBe(true);
  });

  it('extracts nutrition goals', () => {
    const i = parseIntent('帮我配 600 大卡以内、35g 蛋白质的晚餐');
    expect(i.nutritionGoals?.maxCaloriesKcal).toBe(600);
    expect(i.nutritionGoals?.minProteinG).toBe(35);
  });

  it('lists what still must be asked', () => {
    const i = parseIntent('帮我点麦当劳');
    expect(requiredMissingFields(i)).toContain('fulfillment');
    expect(requiredMissingFields(i)).toContain('store');
    expect(buildQuestions(i.missing).length).toBeGreaterThan(0);
  });

  it('does not hallucinate a head count', () => {
    expect(parseIntent('帮我配个晚餐').people).toBeNull();
    expect(parseIntent('十几个人一起吃').people).toBeNull();
  });
});

describe('intent revision', () => {
  it('applies a budget reduction on top of the original intent', () => {
    const base = parseIntent('2 人，70 元以内的麦当劳');
    const revised = reviseIntent(base, '预算降到 60 元');
    expect(revised.people).toBe(2);
    expect(revised.budget.max).toBe(60);
  });

  it('merges new constraints without dropping old ones', () => {
    const base = parseIntent('不要辣的，2 人，70 元以内');
    const revised = reviseIntent(base, '饮料换成无糖的');
    expect(revised.exclusions.some((e) => e.includes('辣'))).toBe(true);
    expect(revised.preferences).toContain('no-sugar-drink');
    expect(revised.people).toBe(2);
    expect(revised.budget.max).toBe(70);
  });
});
