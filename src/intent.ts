/**
 * F01 — Natural language intent extraction.
 *
 * Deterministic heuristics only. The LLM may pre-normalize intent, but this
 * module is the source of truth for the structured shape and always re-parses,
 * so an LLM can never widen the constraints silently (e.g. raise the budget).
 */
import type { Fulfillment, Preference, UserIntent } from './types.js';

const CN_NUM: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function toNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.length === 1 && CN_NUM[s] !== undefined) return CN_NUM[s] as number;
  if (s === '十几') return null; // vague on purpose — do not guess
  if (s.endsWith('十') && s.length === 2) {
    const head = CN_NUM[s[0] as string];
    if (head) return head * 10;
  }
  return null;
}

const PICKUP = /(到店|门店自取|自提|自取|堂食|打包带走|pickup|takeaway|dine[- ]?in)/i;
const DELIVERY = /(外送|外卖|配送|送到家|送到公司|麦乐送|delivery|deliver)/i;
const AFFIRMATIVE_DELIVERY_EXCLUDE = /(不要外卖|不外送)/;

function detectFulfillment(text: string): Fulfillment | null {
  const t = text.replace(AFFIRMATIVE_DELIVERY_EXCLUDE, '');
  const d = DELIVERY.test(t);
  const p = PICKUP.test(t);
  if (d && !p) return 'delivery';
  if (p && !d) return 'pickup';
  if (d && p) {
    // whichever appears first wins, but mark ambiguity away: caller asks human
    return t.search(DELIVERY) < t.search(PICKUP) ? 'delivery' : 'pickup';
  }
  return null;
}

function detectPeople(text: string): number | null {
  let m = text.match(/(\d+|[一二两三四五六七八九十])\s*(?:个)?\s*(?:人|位|個人|小伙伴|同事|哥们)/);
  if (m?.[1]) {
    const n = toNumber(m[1]);
    if (n && n > 0 && n <= 50) return n;
  }
  m = text.match(/(\d+)\s*份/);
  if (m?.[1]) {
    const n = toNumber(m[1]);
    if (n && n > 0 && n <= 50) return Math.max(1, n);
  }
  if (/(我自己|我一个|一人食|自己吃|just me|alone)/i.test(text)) return 1;
  return null;
}

function detectBudget(text: string): number | null {
  const patterns = [
    /(?:预算|不超|不超过|控制在|控制在\s*)(?:人民币|rmb|¥|￥)?\s*(\d+(?:\.\d+)?)\s*(?:元|块|块钱|rmb|cny|¥|￥)?/i,
    /(\d+(?:\.\d+)?)\s*(?:元|块|块钱|rmb|cny)\s*(?:以内|以下|之内|搞定|左右)?/i,
    /(?:within|under|budget(?: of)?)\s*(?:¥|￥|rmb|cny)?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // "预算降 10 元" style deltas are handled by the caller, not here.
  return null;
}

const PREFERENCE_RULES: Array<[RegExp, Preference]> = [
  [/优惠券|用券|有券|领券|麦麦省|优先券|省钱|coupon/i, 'prefer-coupons'],
  [/便宜|最低价|省钱|性价比|预算优先|cheapest/i, 'prefer-cheapest'],
  [/无糖|不要糖|零糖|0糖|sugar[- ]?free/i, 'no-sugar-drink'],
  [/高蛋白|蛋白质|增肌|protein/i, 'prefer-high-protein'],
  [/低卡|低热量|减肥|少热量|low[- ]?cal/i, 'prefer-low-calorie'],
  [/有肉|吃肉|肉类|meat/i, 'prefer-meat'],
  [/种类多|不重样|丰富|多样|variety/i, 'prefer-variety'],
];

function detectPreferences(text: string): Preference[] {
  const out = new Set<Preference>();
  for (const [re, pref] of PREFERENCE_RULES) if (re.test(text)) out.add(pref);
  return [...out];
}

function detectExclusions(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:不要|不吃|忌|去掉|别放|别加|过敏|换成不含|no)\s*([\u4e00-\u9fa5a-zA-Z]{1,8})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const kw = m[1]?.trim();
    if (!kw) continue;
    if (/(辣|香菜|洋葱|花生|芝士|冰块|冰|菠萝|番茄|牛肉|猪肉|鸡肉|蘑菇|鱼|虾)/.test(kw) || kw.length >= 2) {
      out.add(kw);
    }
  }
  return [...out];
}

function detectNutritionGoals(text: string): UserIntent['nutritionGoals'] {
  const cal = text.match(/(\d{3,4})\s*(?:大卡|卡|kcal|千卡)/i);
  const protein = text.match(/(?:至少|最少)?\s*(\d{1,3})\s*g?\s*(?:蛋白质|蛋白)/i);
  if (!cal && !protein) return null;
  return {
    maxCaloriesKcal: cal ? Number(cal[1]) : null,
    minProteinG: protein ? Number(protein[1]) : null,
    maxSodiumMg: null,
  };
}

/** Fields MealPR cannot safely invent and must ask the human for. */
export function requiredMissingFields(intent: UserIntent): string[] {
  const missing: string[] = [];
  if (intent.fulfillment === null) missing.push('fulfillment');
  if (intent.store === null) missing.push('store');
  if (intent.people === null) missing.push('people');
  if (intent.budget.max === null) missing.push('budget');
  return missing;
}

const FIELD_QUESTIONS: Record<string, string> = {
  fulfillment: '你要到店取餐还是外送配送？',
  store: '方便告诉我取餐的门店或你的大致位置吗？（我需要用 query-nearby-stores 查真实门店）',
  people: '一共几个人的量？',
  budget: '预算上限是多少？（不设的话我会按门店真实菜单自由搭配）',
};

export function buildQuestions(missing: string[]): string[] {
  return missing.map((f) => FIELD_QUESTIONS[f] ?? `还需要确认：${f}`);
}

export function parseIntent(text: string): UserIntent {
  const raw = text ?? '';
  const t = raw.trim();
  const people = detectPeople(t);
  const budgetMax = detectBudget(t);
  const intent: UserIntent = {
    people,
    budget: { currency: 'CNY', max: budgetMax, min: null },
    fulfillment: detectFulfillment(t),
    store: null,
    preferences: detectPreferences(t),
    exclusions: detectExclusions(t),
    nutritionGoals: detectNutritionGoals(t),
    rawText: raw,
    missing: [],
  };
  intent.missing = requiredMissingFields(intent);
  return intent;
}

/** Merge a follow-up utterance into an existing intent (revision in place). */
export function reviseIntent(base: UserIntent, text: string): UserIntent {
  const extra = parseIntent(text);
  const merged: UserIntent = {
    people: extra.people ?? base.people,
    budget: {
      currency: base.budget.currency,
      max: extra.budget.max ?? base.budget.max,
      min: base.budget.min,
    },
    fulfillment: extra.fulfillment ?? base.fulfillment,
    store: base.store,
    preferences: [...new Set([...base.preferences, ...extra.preferences])],
    exclusions: [...new Set([...base.exclusions, ...extra.exclusions])],
    nutritionGoals: extra.nutritionGoals ?? base.nutritionGoals,
    rawText: `${base.rawText}\n---\n${text}`,
    missing: [],
  };
  // Budget deltas: "预算降 10 元" / "减 5 块"
  const delta = text.match(/(?:预算|预算上限)?\s*(?:降|降?低|减|少|浮动)\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);
  if (delta?.[1] && merged.budget.max !== null) {
    merged.budget.max = Math.max(0, Number((merged.budget.max - Number(delta[1])).toFixed(2)));
  }
  merged.missing = requiredMissingFields(merged);
  return merged;
}
