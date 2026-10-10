/**
 * T14 — the MCP boundary facts, pinned in code.
 *
 * Three of these contradicted what the Skill docs originally claimed and were
 * only discovered by calling the live server:
 *   1. menu money fields are currentPrice / originalPrice (there is no `price`)
 *   2. query-meal-detail takes `code` — `productCode` returns HTTP 400
 *   3. calculate-price returns 分 (cents): 2290 === ¥22.90
 * A fourth corrects an earlier doc: tools/list DOES return full inputSchema.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  MCP_FIELD_FACTS,
  buildComboComposition,
  looksLikeCents,
  normalizeCatalog,
  normalizePriceQuote,
  toYuan,
} from '../src/mcp-adapt.js';
import { sha256Hex } from '../src/sha256.js';
import { computeFingerprint } from '../src/fingerprint.js';
import { demoPR } from './helpers.js';

describe('T14a - documented field facts', () => {
  it('menu price fields', () => {
    expect(MCP_FIELD_FACTS.menu.priceField).toBe('currentPrice');
    expect(MCP_FIELD_FACTS.menu.listPriceField).toBe('originalPrice');
  });

  it('query-meal-detail takes code, not productCode', () => {
    expect(MCP_FIELD_FACTS.mealDetail.codeParam).toBe('code');
    expect(MCP_FIELD_FACTS.mealDetail.knownWrongParam).toBe('productCode');
  });

  it('calculate-price speaks cents', () => {
    expect(MCP_FIELD_FACTS.calculatePrice.amountUnit).toBe('cent');
    expect(MCP_FIELD_FACTS.calculatePrice.example).toEqual({ raw: 2290, yuan: 22.9 });
  });

  it('tools/list does expose inputSchema (earlier doc claim was wrong)', () => {
    expect(MCP_FIELD_FACTS.toolsList.providesInputSchema).toBe(true);
  });
});

describe('T14b - unit conversion', () => {
  it('2290 cents is ¥22.90', () => {
    expect(toYuan(2290, 'cent')).toBe(22.9);
  });

  it('yuan input passes through untouched', () => {
    expect(toYuan(22.9, 'yuan')).toBe(22.9);
  });

  it('missing amounts stay null instead of becoming 0', () => {
    expect(toYuan(null)).toBeNull();
    expect(toYuan(undefined)).toBeNull();
    expect(toYuan('')).toBeNull();
    expect(toYuan('abc')).toBeNull();
  });

  it('flags suspiciously large integers as cent-like', () => {
    expect(looksLikeCents(2290)).toBe(true);
    expect(looksLikeCents(22.9)).toBe(false);
  });
});

describe('T14c - catalog normalization', () => {
  it('reads currentPrice / originalPrice', () => {
    const { value } = normalizeCatalog([
      { code: 'M-BIGMAC', name: '巨无霸', category: 'main', currentPrice: 24.5, originalPrice: 27 },
    ]);
    expect(value[0]!.price).toBe(24.5);
    expect(value[0]!.listPrice).toBe(27);
  });

  it('still accepts the legacy price alias used by our own fixtures', () => {
    const { value } = normalizeCatalog([{ code: 'X', name: '旧格式', category: 'main', price: 15 }]);
    expect(value[0]!.price).toBe(15);
  });

  it('leaves an unknown price unknown and says so', () => {
    const { value, warnings } = normalizeCatalog([{ code: 'X', name: '无价格', category: 'main' }]);
    expect(value[0]!.price).toBeNull();
    expect(warnings.join(' ')).toMatch(/no currentPrice/);
  });

  it('converts cent-denominated menus too', () => {
    const { value } = normalizeCatalog(
      [{ code: 'X', name: '分计价', category: 'main', currentPrice: 2450 }],
      { amountUnit: 'cent' },
    );
    expect(value[0]!.price).toBe(24.5);
  });

  it('does not invent a category', () => {
    const { value, warnings } = normalizeCatalog([{ code: 'X', name: '未分类', currentPrice: 1 }]);
    expect(value[0]!.category).toBe('other');
    expect(warnings.join(' ')).toMatch(/category/);
  });
});

describe('T14d - quote normalization', () => {
  it('a cent quote becomes yuan and counts as calculated', () => {
    const { value, warnings } = normalizePriceQuote(
      { payable: 2290, subtotal: 2450, discountTotal: 160, deliveryFee: 0 },
      { amountUnit: 'cent' },
    );
    expect(value.payable).toBe(22.9);
    expect(value.subtotal).toBe(24.5);
    expect(value.discountTotal).toBe(1.6);
    expect(value.calculated).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('a quote with no payable stays unverified — it must not unlock approval', () => {
    const { value, warnings } = normalizePriceQuote({ total: 2290 }, { amountUnit: 'cent' });
    expect(value.payable).toBeNull();
    expect(value.calculated).toBe(false);
    expect(value.unverifiedReason).toMatch(/no payable/);
    expect(warnings.join(' ')).toMatch(/fieldMap/);
  });

  it('accepts a fieldMap when the live payload names things differently', () => {
    const { value } = normalizePriceQuote(
      { payAmount: 2290 },
      { amountUnit: 'cent', fieldMap: { payable: 'payAmount' } },
    );
    expect(value.payable).toBe(22.9);
  });

  it('warns when a yuan-declared payable looks like cents', () => {
    const { warnings } = normalizePriceQuote({ payable: 2290 }, { amountUnit: 'yuan' });
    expect(warnings.join(' ')).toMatch(/looks like a cent amount/);
  });
});

describe('T14e - combo composition builder', () => {
  it('marks source mcp-detail only when told to', () => {
    const c = buildComboComposition([{ name: '炸鸡', category: 'main' }], { source: 'mcp-detail' });
    expect(c.source).toBe('mcp-detail');
    expect(c.components[0]).toMatchObject({ name: '炸鸡', category: 'main', quantity: 1 });
    expect(buildComboComposition([]).source).toBe('unknown');
  });
});

describe('T14f - the fingerprint hash is identical in Node and in the browser', () => {
  it('matches node:crypto for known vectors', () => {
    for (const s of ['', 'abc', 'MealPR', '{"payable":22.9}', '中文指纹测试 🍔']) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });

  it('mints the same fingerprint for a real PR', () => {
    const pr = demoPR('demo-team');
    expect(computeFingerprint(pr)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeFingerprint(pr)).toBe(computeFingerprint({ ...pr }));
  });
});
