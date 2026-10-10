#!/usr/bin/env node
/* MealPR generated artifact — edit src/ instead. */

// src/intent.ts
var CN_NUM = {
  \u4E00: 1,
  \u4E24: 2,
  \u4E8C: 2,
  \u4E09: 3,
  \u56DB: 4,
  \u4E94: 5,
  \u516D: 6,
  \u4E03: 7,
  \u516B: 8,
  \u4E5D: 9,
  \u5341: 10
};
function toNumber(raw) {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.length === 1 && CN_NUM[s] !== void 0) return CN_NUM[s];
  if (s === "\u5341\u51E0") return null;
  if (s.endsWith("\u5341") && s.length === 2) {
    const head = CN_NUM[s[0]];
    if (head) return head * 10;
  }
  return null;
}
var PICKUP = /(到店|门店自取|自提|自取|堂食|打包带走|pickup|takeaway|dine[- ]?in)/i;
var DELIVERY = /(外送|外卖|配送|送到家|送到公司|麦乐送|delivery|deliver)/i;
var AFFIRMATIVE_DELIVERY_EXCLUDE = /(不要外卖|不外送)/;
function detectFulfillment(text2) {
  const t = text2.replace(AFFIRMATIVE_DELIVERY_EXCLUDE, "");
  const d = DELIVERY.test(t);
  const p = PICKUP.test(t);
  if (d && !p) return "delivery";
  if (p && !d) return "pickup";
  if (d && p) {
    return t.search(DELIVERY) < t.search(PICKUP) ? "delivery" : "pickup";
  }
  return null;
}
function detectPeople(text2) {
  let m = text2.match(/(\d+|[一二两三四五六七八九十])\s*(?:个)?\s*(?:人|位|個人|小伙伴|同事|哥们)/);
  if (m?.[1]) {
    const n = toNumber(m[1]);
    if (n && n > 0 && n <= 50) return n;
  }
  m = text2.match(/(\d+)\s*份/);
  if (m?.[1]) {
    const n = toNumber(m[1]);
    if (n && n > 0 && n <= 50) return Math.max(1, n);
  }
  if (/(我自己|我一个|一人食|自己吃|just me|alone)/i.test(text2)) return 1;
  return null;
}
function detectBudget(text2) {
  const patterns = [
    /(?:预算|不超|不超过|控制在|控制在\s*)(?:人民币|rmb|¥|￥)?\s*(\d+(?:\.\d+)?)\s*(?:元|块|块钱|rmb|cny|¥|￥)?/i,
    /(\d+(?:\.\d+)?)\s*(?:元|块|块钱|rmb|cny)\s*(?:以内|以下|之内|搞定|左右)?/i,
    /(?:within|under|budget(?: of)?)\s*(?:¥|￥|rmb|cny)?\s*(\d+(?:\.\d+)?)/i
  ];
  for (const re of patterns) {
    const m = text2.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}
var PREFERENCE_RULES = [
  [/优惠券|用券|有券|领券|麦麦省|优先券|省钱|coupon/i, "prefer-coupons"],
  [/便宜|最低价|省钱|性价比|预算优先|cheapest/i, "prefer-cheapest"],
  [/无糖|不要糖|零糖|0糖|sugar[- ]?free/i, "no-sugar-drink"],
  [/高蛋白|蛋白质|增肌|protein/i, "prefer-high-protein"],
  [/低卡|低热量|减肥|少热量|low[- ]?cal/i, "prefer-low-calorie"],
  [/有肉|吃肉|肉类|meat/i, "prefer-meat"],
  [/种类多|不重样|丰富|多样|variety/i, "prefer-variety"]
];
function detectPreferences(text2) {
  const out2 = /* @__PURE__ */ new Set();
  for (const [re, pref] of PREFERENCE_RULES) if (re.test(text2)) out2.add(pref);
  return [...out2];
}
function detectExclusions(text2) {
  const out2 = /* @__PURE__ */ new Set();
  const re = /(?:不要|不吃|忌|去掉|别放|别加|过敏|换成不含|no)\s*([\u4e00-\u9fa5a-zA-Z]{1,8})/g;
  let m;
  while (m = re.exec(text2)) {
    const kw = m[1]?.trim();
    if (!kw) continue;
    if (/(辣|香菜|洋葱|花生|芝士|冰块|冰|菠萝|番茄|牛肉|猪肉|鸡肉|蘑菇|鱼|虾)/.test(kw) || kw.length >= 2) {
      out2.add(kw);
    }
  }
  return [...out2];
}
function detectNutritionGoals(text2) {
  const cal = text2.match(/(\d{3,4})\s*(?:大卡|卡|kcal|千卡)/i);
  const protein = text2.match(/(?:至少|最少)?\s*(\d{1,3})\s*g?\s*(?:蛋白质|蛋白)/i);
  if (!cal && !protein) return null;
  return {
    maxCaloriesKcal: cal ? Number(cal[1]) : null,
    minProteinG: protein ? Number(protein[1]) : null,
    maxSodiumMg: null
  };
}
function requiredMissingFields(intent2) {
  const missing = [];
  if (intent2.fulfillment === null) missing.push("fulfillment");
  if (intent2.store === null) missing.push("store");
  if (intent2.people === null) missing.push("people");
  if (intent2.budget.max === null) missing.push("budget");
  return missing;
}
var FIELD_QUESTIONS = {
  fulfillment: "\u4F60\u8981\u5230\u5E97\u53D6\u9910\u8FD8\u662F\u5916\u9001\u914D\u9001\uFF1F",
  store: "\u65B9\u4FBF\u544A\u8BC9\u6211\u53D6\u9910\u7684\u95E8\u5E97\u6216\u4F60\u7684\u5927\u81F4\u4F4D\u7F6E\u5417\uFF1F\uFF08\u6211\u9700\u8981\u7528 query-nearby-stores \u67E5\u771F\u5B9E\u95E8\u5E97\uFF09",
  people: "\u4E00\u5171\u51E0\u4E2A\u4EBA\u7684\u91CF\uFF1F",
  budget: "\u9884\u7B97\u4E0A\u9650\u662F\u591A\u5C11\uFF1F\uFF08\u4E0D\u8BBE\u7684\u8BDD\u6211\u4F1A\u6309\u95E8\u5E97\u771F\u5B9E\u83DC\u5355\u81EA\u7531\u642D\u914D\uFF09"
};
function buildQuestions(missing) {
  return missing.map((f) => FIELD_QUESTIONS[f] ?? `\u8FD8\u9700\u8981\u786E\u8BA4\uFF1A${f}`);
}
function parseIntent(text2) {
  const raw = text2 ?? "";
  const t = raw.trim();
  const people = detectPeople(t);
  const budgetMax = detectBudget(t);
  const intent2 = {
    people,
    budget: { currency: "CNY", max: budgetMax, min: null },
    fulfillment: detectFulfillment(t),
    store: null,
    preferences: detectPreferences(t),
    exclusions: detectExclusions(t),
    nutritionGoals: detectNutritionGoals(t),
    rawText: raw,
    missing: []
  };
  intent2.missing = requiredMissingFields(intent2);
  return intent2;
}
function reviseIntent(base, text2) {
  const extra = parseIntent(text2);
  const merged = {
    people: extra.people ?? base.people,
    budget: {
      currency: base.budget.currency,
      max: extra.budget.max ?? base.budget.max,
      min: base.budget.min
    },
    fulfillment: extra.fulfillment ?? base.fulfillment,
    store: base.store,
    preferences: [.../* @__PURE__ */ new Set([...base.preferences, ...extra.preferences])],
    exclusions: [.../* @__PURE__ */ new Set([...base.exclusions, ...extra.exclusions])],
    nutritionGoals: extra.nutritionGoals ?? base.nutritionGoals,
    rawText: `${base.rawText}
---
${text2}`,
    missing: []
  };
  const delta = text2.match(/(?:预算|预算上限)?\s*(?:降|降?低|减|少|浮动)\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);
  if (delta?.[1] && merged.budget.max !== null) {
    merged.budget.max = Math.max(0, Number((merged.budget.max - Number(delta[1])).toFixed(2)));
  }
  merged.missing = requiredMissingFields(merged);
  return merged;
}

// src/entries/_io.ts
import { readFileSync } from "node:fs";
function readInput() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--file" || args[i] === "-f") && args[i + 1]) {
      const content = readFileSync(args[i + 1], "utf8");
      return args[i + 1].endsWith(".json") ? JSON.parse(content) : content;
    }
  }
  const positional = args.find((a) => !a.startsWith("-"));
  if (positional) return positional;
  const raw = readFileSync(0, "utf8");
  if (!raw.trim()) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  process.stdout.write("\n");
}

// src/entries/intent.ts
var input = readInput();
var payload = typeof input === "string" ? { text: input } : input;
var text = payload.text ?? "";
if (!text.trim()) {
  out({ ok: false, error: `usage: echo '{"text":"..."}' | node intent.mjs` });
  process.exit(1);
}
var intent = payload.baseIntent ? reviseIntent(payload.baseIntent, text) : parseIntent(text);
out({
  ok: true,
  intent,
  questions: buildQuestions(intent.missing),
  complete: intent.missing.length === 0
});
