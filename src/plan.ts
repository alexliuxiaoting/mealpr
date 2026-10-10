/**
 * F03 — candidate plan generation.
 *
 * Pure combinatorics over the *real* menu handed to us by query-meals.
 * Prices shown here are menu prices only and are ALWAYS re-priced through
 * calculate-price before anything can be approved. We never assume combos,
 * discounts, or substitution legality that the MCP did not state.
 *
 * COMBO RULE (bug fix, 2026-10-10): a combo is not a main. Earlier versions
 * pooled combos together with mains and then stacked a drink + a side on top,
 * which silently double-charged components the combo already contains
 * (e.g. "酥脆无双套餐" already includes chicken + fries + a zero-sugar coke).
 * Now a combo candidate never gets topped up unless `query-meal-detail`
 * actually told us what is inside, and only for the real shortfall.
 */
import type { ComboComposition, MealItem, UserIntent } from './types.js';
import { compositionCounts } from './types.js';

export interface CatalogItem {
  code: string;
  name: string;
  category: MealItem['category'];
  price: number | null;
  /** List price before promotion when the menu exposes currentPrice/originalPrice. */
  listPrice?: number | null;
  tags?: string[];
  /** true when query-meals returned this SKU as currently sellable */
  available?: boolean;
  /** Combo components from query-meal-detail. null/absent = not queried yet. */
  composition?: ComboComposition | null;
}

export interface Candidate {
  id: string;
  items: MealItem[];
  /** Menu-price estimate — indicative only, never used as the payable. */
  estimatedTotal: number | null;
  rationale: string[];
  /** True when a combo is present and its composition was never read from query-meal-detail. */
  requiresComboDetail: boolean;
  /** Codes that must be resolved via query-meal-detail before this plan can be approved. */
  pendingDetailCodes: string[];
  warnings: string[];
}

const SUGAR_WORDS = /(可乐|雪碧|芬达|果汁|奶茶|甜饮|糖)/;
const ZERO_SUGAR_WORDS = /(无糖|零度|健怡|苏打水|气泡水|矿泉水|0糖|黑咖啡|美式)/;

export function filterCatalog(catalog: CatalogItem[], intent: UserIntent): { usable: CatalogItem[]; dropped: string[] } {
  const dropped: string[] = [];
  const usable = catalog.filter((c) => {
    if (c.available === false) return true; // keep so the validator can FAIL loudly
    const name = c.name.toLowerCase();
    for (const kw of intent.exclusions) {
      if (name.includes(kw.toLowerCase())) {
        dropped.push(`${c.name} (excluded: ${kw})`);
        return false;
      }
    }
    if (intent.preferences.includes('no-sugar-drink') && c.category === 'drink') {
      if (SUGAR_WORDS.test(c.name) && !ZERO_SUGAR_WORDS.test(c.name)) {
        dropped.push(`${c.name} (sugary drink excluded)`);
        return false;
      }
    }
    return true;
  });
  return { usable, dropped };
}

function pick<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

function sortFor(catalog: CatalogItem[], category: MealItem['category'], pref: 'cheap' | 'variety'): CatalogItem[] {
  const list = catalog.filter((c) => c.category === category && c.available !== false);
  if (pref === 'cheap') return [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return [...list];
}

function toItem(c: CatalogItem, qty: number): MealItem {
  return {
    code: c.code,
    name: c.name,
    category: c.category,
    quantity: qty,
    options: [],
    unitPrice: c.price,
    nutritionRef: null,
    comboComposition: c.category === 'combo' ? (c.composition ?? null) : null,
    remark: null,
  };
}

function money(v: number | null): string {
  return v === null ? '?' : `¥${v.toFixed(2)}`;
}

function countsText(per: ReturnType<typeof compositionCounts>): string {
  const parts: string[] = [];
  if (per.mains) parts.push(`主食 ${per.mains}`);
  if (per.sides) parts.push(`小食 ${per.sides}`);
  if (per.drinks) parts.push(`饮料 ${per.drinks}`);
  if (per.desserts) parts.push(`甜品 ${per.desserts}`);
  if (per.other) parts.push(`其他 ${per.other}`);
  return parts.length ? parts.join(' / ') : '（组成中未识别到主食/小食/饮料）';
}

export interface ComboPools {
  mains: CatalogItem[];
  sides: CatalogItem[];
  drinks: CatalogItem[];
}

/**
 * Build a combo-led plan.
 *
 * - composition unknown  -> combo only, NO stacking, flagged for query-meal-detail.
 * - composition known    -> top up exclusively the shortfall against head count.
 */
export function buildComboPlan(combo: CatalogItem, people: number, pools: ComboPools): {
  items: MealItem[];
  rationale: string[];
  warnings: string[];
  requiresComboDetail: boolean;
} {
  const items: MealItem[] = [toItem(combo, people)];
  const rationale: string[] = [`以套餐《${combo.name}》${money(combo.price)} × ${people} 为基础`];
  const warnings: string[] = [];
  const comp = combo.composition ?? null;
  const verified = comp !== null && comp.source === 'mcp-detail';

  if (!verified) {
    warnings.push(
      `COMBO_UNVERIFIED: 《${combo.name}》的套餐组成尚未通过 query-meal-detail 读取，本方案因此**没有**叠加任何小食或饮料。` +
        `套餐通常自带小食与饮料，盲目叠加会重复计价。定稿前必须调用 query-meal-detail(code="${combo.code}") 核对组成，再决定是否需要补配。`,
    );
    rationale.push('未核对组成前不叠加配餐（避免重复计价）');
    return { items, rationale, warnings, requiresComboDetail: true };
  }

  const per = compositionCounts(comp);
  const covered = {
    mains: per.mains * people,
    sides: per.sides * people,
    drinks: per.drinks * people,
  };
  const needMains = Math.max(0, people - covered.mains);
  const needDrinks = Math.max(0, people - covered.drinks);
  const needSides = Math.max(0, Math.ceil(people / 2) - covered.sides);

  if (needMains > 0 && pools.mains.length > 0) items.push(toItem(pools.mains[0]!, needMains));
  if (needDrinks > 0 && pools.drinks.length > 0) items.push(toItem(pools.drinks[0]!, needDrinks));
  if (needSides > 0 && pools.sides.length > 0) items.push(toItem(pools.sides[0]!, needSides));

  const topUps: string[] = [];
  if (needMains) topUps.push(`主食 ×${needMains}`);
  if (needDrinks) topUps.push(`饮料 ×${needDrinks}`);
  if (needSides) topUps.push(`小食 ×${needSides}`);
  rationale.push(
    `已核对组成（每份 ${countsText(per)}）：${people} 份已覆盖主食 ${covered.mains} / 小食 ${covered.sides} / 饮料 ${covered.drinks}` +
      (topUps.length ? `，仅补足缺口 ${topUps.join('、')}` : '，无需额外补配'),
  );

  return { items, rationale, warnings, requiresComboDetail: false };
}

/**
 * Build 1..3 candidate plans. Every plan serves at least `people` mains, and
 * every item has menu pricing available (we cannot estimate what we cannot see).
 */
export function generateCandidates(catalog: CatalogItem[], intent: UserIntent, maxCandidates = 3): Candidate[] {
  const people = intent.people ?? 1;
  const { usable } = filterCatalog(catalog, intent);
  const mains = sortFor(usable, 'main', 'cheap');
  const combos = sortFor(usable, 'combo', 'cheap');
  const sides = sortFor(usable, 'side', 'cheap');
  const drinksAll = sortFor(usable, 'drink', 'cheap');
  const drinks = intent.preferences.includes('no-sugar-drink')
    ? [...drinksAll.filter((d) => ZERO_SUGAR_WORDS.test(d.name)), ...drinksAll]
    : drinksAll;
  const desserts = sortFor(usable, 'dessert', 'cheap');
  const pools: ComboPools = { mains, sides, drinks };

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const push = (
    name: string,
    items: MealItem[],
    rationale: string[],
    extra: { requiresComboDetail?: boolean; warnings?: string[] } = {},
  ) => {
    if (items.length === 0) return;
    const key = items.map((i) => `${i.code}x${i.quantity}`).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const priced = items.every((i) => i.unitPrice !== null);
    const total = priced ? Number(items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0).toFixed(2)) : null;
    const comboItems = items.filter((i) => i.category === 'combo');
    candidates.push({
      id: `${name}-${candidates.length + 1}`,
      items,
      estimatedTotal: total,
      rationale,
      requiresComboDetail: extra.requiresComboDetail ?? false,
      pendingDetailCodes: comboItems
        .filter((i) => !(i.comboComposition && i.comboComposition.source === 'mcp-detail'))
        .map((i) => i.code),
      warnings: extra.warnings ?? [],
    });
  };

  // Plan A — combo-led (best value, but only stack after reading the composition)
  if (combos.length > 0) {
    const built = buildComboPlan(pick(combos, 1)[0]!, people, pools);
    push('combo', built.items, built.rationale, {
      requiresComboDetail: built.requiresComboDetail,
      warnings: built.warnings,
    });
  }

  // Plan B — separate mains for everyone + a drink each + a shared side.
  // Combos are deliberately NOT in this pool: a combo already carries its own
  // side/drink, so treating it as a plain main double-charges those.
  if (mains.length > 0) {
    const items: MealItem[] = [toItem(pick(mains, 1)[0]!, people)];
    if (drinks.length) items.push(toItem(pick(drinks, 1)[0]!, people));
    if (sides.length) items.push(toItem(pick(sides, 1)[0]!, Math.max(1, Math.ceil(people / 2))));
    push('balanced', items, ['每个用餐者一份主食与饮品', '主食按菜单价升序首选，控制在预算内']);
  }

  // Plan C — cheapest that still feeds everyone (drop the side)
  if (mains.length > 0) {
    const cheapest = pick(sortFor(usable, 'main', 'cheap'), people);
    const items: MealItem[] = [];
    const counts = new Map<string, number>();
    for (const c of cheapest) counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
    for (const [code, qty] of counts) {
      const c = usable.find((u) => u.code === code)!;
      items.push(toItem(c, qty));
    }
    if (drinks.length) items.push(toItem(pick(sortFor(usable, 'drink', 'cheap'), 1)[0]!, people));
    const missing = people - items.filter((i) => i.category === 'main').reduce((s, i) => s + i.quantity, 0);
    if (missing <= 0) {
      push('cheapest', items, ['优先压低总价：主食取当前菜单最低价', '仍保证每人一份主食']);
    }
  }

  // Plan D — variety / treat: different mains + dessert
  if (people >= 2 && mains.length >= 2) {
    const items: MealItem[] = [];
    const variety = pick(mains, 2);
    const half = Math.ceil(people / 2);
    items.push(toItem(variety[0]!, Math.min(half, people)));
    if (people - Math.min(half, people) > 0) items.push(toItem(variety[1]!, people - Math.min(half, people)));
    if (drinks.length) items.push(toItem(pick(drinks, 1)[0]!, people));
    if (desserts.length) items.push(toItem(pick(desserts, 1)[0]!, 1));
    push('variety', items, ['多换一种主食增加多样性', '含一份甜品作为点缀']);
  }

  return candidates.slice(0, maxCandidates);
}

/**
 * Pre-screen on MENU prices before spending a calculate-price call.
 * This is a cheap filter, not a validation: anything that survives still has
 * to go through the authoritative quote.
 */
export function prescreenByMenuPrice(candidates: Candidate[], intent: UserIntent): Candidate[] {
  const cap = intent.budget.max;
  if (cap === null) return candidates;
  return candidates.filter((c) => c.estimatedTotal === null || c.estimatedTotal <= cap);
}

export function explainNoPlan(catalog: CatalogItem[], intent: UserIntent): string {
  const people = intent.people ?? 1;
  const { usable } = filterCatalog(catalog, intent);
  const mains = usable.filter((c) => (c.category === 'main' || c.category === 'combo') && c.available !== false);
  if (mains.length === 0) {
    return '无法生成方案：当前门店菜单里没有查到可售的主食/套餐，可能是因为营业时段、门店状态或菜单为空。请更换门店或稍后再试。';
  }
  const cheapest = [...mains].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0];
  const cap = intent.budget.max;
  if (cap !== null && cheapest?.price != null) {
    return `无法满足 ${cap} 元预算：最便宜的主食《${cheapest.name}》单价 ${cheapest.price} 元，${people} 人仅主食就需要约 ${(cheapest.price * people).toFixed(2)} 元。是否愿意提高预算或减少人数？我不会擅自突破你设定的预算硬约束。`;
  }
  return '无法生成方案：可用商品不足以组成符合约束的组合。请告诉我是否需要调整预算、人数或取餐方式。';
}
