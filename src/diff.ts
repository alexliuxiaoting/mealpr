/**
 * F07 — versioned diff between two Meal PRs.
 *
 * Emits both a machine-readable diff (for the UI / tests) and a GitHub-style
 * unified diff block (for chat). Every money delta that is not backed by a
 * calculated quote is explicitly marked unverified.
 */
import type { MealPR } from './types.js';

export interface ItemDelta {
  kind: 'added' | 'removed' | 'quantity-changed' | 'options-changed' | 'unchanged';
  code: string;
  name: string;
  beforeQty: number | null;
  afterQty: number | null;
  beforeOptions: string[];
  afterOptions: string[];
}

export interface CouponDelta {
  kind: 'added' | 'removed' | 'unchanged';
  id: string;
  name: string;
  verified: boolean;
}

export interface ScalarDelta {
  before: number | string | null;
  after: number | string | null;
  changed: boolean;
  verified: boolean;
}

export interface DiffResult {
  fromVersion: number;
  toVersion: number;
  summary: {
    added: number;
    removed: number;
    quantityChanged: number;
    optionsChanged: number;
  };
  items: ItemDelta[];
  coupons: CouponDelta[];
  payable: ScalarDelta;
  discount: ScalarDelta;
  remainingBudget: ScalarDelta;
  fulfillment: ScalarDelta;
  store: ScalarDelta;
  nutrition: {
    beforeStatus: string;
    afterStatus: string;
    beforeCoverage: number;
    afterCoverage: number;
    beforeEnergKcal: number | null;
    afterEnergyKcal: number | null;
    note: string;
  };
  unified: string;
  requiresReapproval: boolean;
  reason: string;
}

function itemKey(i: MealPR['items'][number]): string {
  return i.code;
}

function optionList(i: MealPR['items'][number]): string[] {
  return i.options.map((o) => `${o.group ? `${o.group}/` : ''}${o.name}`).sort();
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx]);
}

function num(n: number | string | null | undefined): number | string | null {
  return n === undefined ? null : n;
}

function remainingBudget(pr: MealPR): number | null {
  const cap = pr.userIntent.budget.max;
  const payable = pr.priceQuote.calculated ? pr.priceQuote.payable : null;
  if (cap === null || payable === null) return null;
  return Number((cap - payable).toFixed(2));
}

export function diffPRs(before: MealPR, after: MealPR): DiffResult {
  const beforeMap = new Map(before.items.map((i) => [itemKey(i), i]));
  const afterMap = new Map(after.items.map((i) => [itemKey(i), i]));
  const codes = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  const items: ItemDelta[] = codes.map((code) => {
    const b = beforeMap.get(code);
    const a = afterMap.get(code);
    if (!b && a) return { kind: 'added', code, name: a.name, beforeQty: null, afterQty: a.quantity, beforeOptions: [], afterOptions: optionList(a) };
    if (b && !a) return { kind: 'removed', code, name: b.name, beforeQty: b.quantity, afterQty: null, beforeOptions: optionList(b), afterOptions: [] };
    const beforeOptions = optionList(b!);
    const afterOptions = optionList(a!);
    if (b!.quantity !== a!.quantity) {
      return { kind: 'quantity-changed', code, name: a!.name, beforeQty: b!.quantity, afterQty: a!.quantity, beforeOptions, afterOptions };
    }
    if (!sameArray(beforeOptions, afterOptions)) {
      return { kind: 'options-changed', code, name: a!.name, beforeQty: b!.quantity, afterQty: a!.quantity, beforeOptions, afterOptions };
    }
    return { kind: 'unchanged', code, name: a!.name, beforeQty: b!.quantity, afterQty: a!.quantity, beforeOptions, afterOptions };
  });

  const bCoupons = new Map(before.coupons.map((c) => [c.id, c]));
  const aCoupons = new Map(after.coupons.map((c) => [c.id, c]));
  const couponIds = [...new Set([...bCoupons.keys(), ...aCoupons.keys()])].sort();
  const coupons: CouponDelta[] = couponIds.map((id) => {
    const b = bCoupons.get(id);
    const a = aCoupons.get(id);
    if (!b && a) return { kind: 'added', id, name: a.name, verified: a.verified };
    if (b && !a) return { kind: 'removed', id, name: b.name, verified: b.verified };
    return { kind: 'unchanged', id, name: a!.name, verified: a!.verified };
  });

  const quotesVerified = before.priceQuote.calculated && after.priceQuote.calculated;
  const bPay = before.priceQuote.calculated ? before.priceQuote.payable : null;
  const aPay = after.priceQuote.calculated ? after.priceQuote.payable : null;
  const payable: ScalarDelta = {
    before: num(bPay),
    after: num(aPay),
    changed: bPay !== aPay,
    verified: quotesVerified,
  };
  const discount: ScalarDelta = {
    before: num(before.priceQuote.discountTotal),
    after: num(after.priceQuote.discountTotal),
    changed: before.priceQuote.discountTotal !== after.priceQuote.discountTotal,
    verified: quotesVerified,
  };
  const bRem = remainingBudget(before);
  const aRem = remainingBudget(after);
  const remainingBudgetDelta: ScalarDelta = {
    before: num(bRem),
    after: num(aRem),
    changed: bRem !== aRem,
    verified: quotesVerified,
  };
  const fulfillment: ScalarDelta = {
    before: before.fulfillment,
    after: after.fulfillment,
    changed: before.fulfillment !== after.fulfillment,
    verified: true,
  };
  const store: ScalarDelta = {
    before: before.store?.id ?? null,
    after: after.store?.id ?? null,
    changed: (before.store?.id ?? null) !== (after.store?.id ?? null),
    verified: true,
  };

  const summary = {
    added: items.filter((i) => i.kind === 'added').length,
    removed: items.filter((i) => i.kind === 'removed').length,
    quantityChanged: items.filter((i) => i.kind === 'quantity-changed').length,
    optionsChanged: items.filter((i) => i.kind === 'options-changed').length,
  };

  const substantive =
    summary.added > 0 ||
    summary.removed > 0 ||
    summary.quantityChanged > 0 ||
    summary.optionsChanged > 0 ||
    coupons.some((c) => c.kind !== 'unchanged') ||
    payable.changed ||
    fulfillment.changed ||
    store.changed;

  const result: DiffResult = {
    fromVersion: before.version,
    toVersion: after.version,
    summary,
    items,
    coupons,
    payable,
    discount,
    remainingBudget: remainingBudgetDelta,
    fulfillment,
    store,
    nutrition: {
      beforeStatus: before.nutritionSummary.status,
      afterStatus: after.nutritionSummary.status,
      beforeCoverage: before.nutritionSummary.coverage,
      afterCoverage: after.nutritionSummary.coverage,
      beforeEnergKcal: before.nutritionSummary.totals?.energyKcal ?? null,
      afterEnergyKcal: after.nutritionSummary.totals?.energyKcal ?? null,
      note: buildNutritionNote(before, after),
    },
    unified: '',
    requiresReapproval: substantive,
    reason: substantive
      ? 'Plan terms changed: the previously granted approval is void and the PR returns to READY_FOR_REVIEW.'
      : 'No substantive change: approval remains bound to this version.',
  };

  result.unified = renderUnified(result);
  return result;
}

function buildNutritionNote(before: MealPR, after: MealPR): string {
  const b = before.nutritionSummary;
  const a = after.nutritionSummary;
  if (b.status === a.status && b.coverage === a.coverage) return 'Nutrition coverage unchanged.';
  const parts: string[] = [];
  if (b.status !== a.status) parts.push(`status ${b.status} -> ${a.status}`);
  if (b.coverage !== a.coverage) parts.push(`official coverage ${(b.coverage * 100).toFixed(0)}% -> ${(a.coverage * 100).toFixed(0)}%`);
  const be = b.totals?.energyKcal ?? null;
  const ae = a.totals?.energyKcal ?? null;
  if (be !== null && ae !== null && be !== ae) parts.push(`energy ${be} -> ${ae} kcal (matched items only)`);
  if (a.missing.length > 0) parts.push(`no official data for: ${a.missing.join(', ')}`);
  return parts.join('; ');
}

export function renderUnified(d: DiffResult): string {
  const lines: string[] = [];
  lines.push(`--- Meal PR v${d.fromVersion}`);
  lines.push(`+++ Meal PR v${d.toVersion}`);
  lines.push('@@ Items @@');
  for (const i of d.items) {
    switch (i.kind) {
      case 'removed':
        lines.push(`- ${i.name} x${i.beforeQty}  (${i.code})`);
        break;
      case 'added':
        lines.push(`+ ${i.name} x${i.afterQty}  (${i.code})`);
        break;
      case 'quantity-changed':
        lines.push(`- ${i.name} x${i.beforeQty}`);
        lines.push(`+ ${i.name} x${i.afterQty}`);
        break;
      case 'options-changed':
        lines.push(`- ${i.name} [${i.beforeOptions.join(' | ') || 'default'}]`);
        lines.push(`+ ${i.name} [${i.afterOptions.join(' | ') || 'default'}]`);
        break;
      default:
        lines.push(`  ${i.name} x${i.beforeQty}`);
    }
  }
  if (d.coupons.length > 0) {
    lines.push('@@ Coupons @@');
    for (const c of d.coupons) {
      if (c.kind === 'removed') lines.push(`- coupon ${c.name} (${c.id})`);
      else if (c.kind === 'added') lines.push(`+ coupon ${c.name} (${c.id})${c.verified ? '' : ' [UNVERIFIED]'}`);
      else lines.push(`  coupon ${c.name}`);
    }
  }
  lines.push('@@ Payment @@');
  const suffix = d.payable.verified ? '' : '  [NOT RECALCULATED]';
  if (d.payable.changed) {
    lines.push(`- Payable: ¥${fmt(d.payable.before)}`);
    lines.push(`+ Payable: ¥${fmt(d.payable.after)}${suffix}`);
  } else {
    lines.push(`  Payable: ¥${fmt(d.payable.after)}${d.payable.verified ? '' : '  [NOT CALCULATED]'}`);
  }
  if (d.remainingBudget.changed) {
    lines.push(`- Budget left: ¥${fmt(d.remainingBudget.before)}`);
    lines.push(`+ Budget left: ¥${fmt(d.remainingBudget.after)}`);
  } else if (d.remainingBudget.after !== null) {
    lines.push(`  Budget left: ¥${fmt(d.remainingBudget.after)}`);
  }
  if (d.fulfillment.changed) lines.push(`~ Fulfillment: ${d.fulfillment.before} -> ${d.fulfillment.after}`);
  if (d.store.changed) lines.push(`~ Store: ${d.store.before} -> ${d.store.after}`);
  lines.push('@@ Nutrition @@');
  lines.push(`  ${d.nutrition.beforeStatus} -> ${d.nutrition.afterStatus} :: ${d.nutrition.note}`);
  lines.push('@@ Result @@');
  lines.push(`${d.requiresReapproval ? '[ ]' : '[x]'} No re-review needed`);
  lines.push(`${d.requiresReapproval ? '[x]' : '[ ]'} Re-approval required`);
  return lines.join('\n');
}

function fmt(v: number | string | null): string {
  if (v === null) return '--';
  if (typeof v === 'number') return v.toFixed(2);
  return v;
}
