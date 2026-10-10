/**
 * F06 — render a Meal PR as review-ready Markdown.
 *
 * Pure function. It never computes or estimates a number that is not already
 * present on the PR object, so a fake value cannot sneak in at render time.
 */
import type { MealPR, ValidationCheck } from './types.js';
import { computeFingerprint, shortFingerprint } from './fingerprint.js';
import { allowedActions } from './review-state.js';

export const MODE_TAG = (mode: MealPR['mode']): string => (mode === 'DEMO' ? '`DEMO` — 模拟数据，不涉及真实订单' : '`LIVE` — 真实 MCP 数据');

function money(cur: string, v: number | null): string {
  if (v === null || v === undefined) return 'unknown';
  const symbol = cur === 'CNY' ? '¥' : `${cur} `;
  return `${symbol}${v.toFixed(2)}`;
}

function checkLine(c: ValidationCheck): string {
  const box = c.status === 'PASS' ? '[x]' : '[ ]';
  const tag = c.status === 'PASS' ? '' : ` **\`${c.status}\`**`;
  const suffix = c.detail ? ` — ${c.detail}` : '';
  const flag = !c.blocking && c.status !== 'PASS' ? ' (non-blocking)' : '';
  return `- ${box} ${c.label}${tag}${suffix}${flag}`;
}

export function renderPR(pr: MealPR, opts: { diffBlock?: string } = {}): string {
  const intent = pr.userIntent;
  const q = pr.priceQuote;
  const n = pr.nutritionSummary;
  const cur = q.currency || intent.budget.currency || 'CNY';
  const cap = intent.budget.max;
  const payable = q.calculated ? q.payable : null;
  const remaining = q.calculated && payable !== null && cap !== null ? Number((cap - payable).toFixed(2)) : null;
  const fp = computeFingerprint(pr);

  const L: string[] = [];
  L.push(`# 🍔 Meal PR #${pr.id.replace(/^#?/, '')}`);
  L.push('');
  L.push(`## ${pr.title}`);
  L.push('');
  L.push(`Status: \`${pr.status}\`　|　Mode: ${MODE_TAG(pr.mode)}　|　Version: ${pr.version}`);
  L.push('');
  if (pr.mode === 'DEMO') {
    L.push('> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。');
    L.push('');
  }

  L.push('### User Requirements');
  L.push('');
  L.push(`- People: ${intent.people ?? 'unknown'}`);
  L.push(`- Budget: ${cap === null ? 'unset' : money(cur, cap)}`);
  L.push(`- Fulfillment: ${pr.fulfillment ?? 'unknown'}`);
  L.push(`- Store: ${pr.store ? `${pr.store.name} (\`${pr.store.id}\`)` : 'unresolved'}`);
  L.push(`- Preference: ${intent.preferences.length ? intent.preferences.join(', ') : 'none'}`);
  L.push(`- Exclusions: ${intent.exclusions.length ? intent.exclusions.join(', ') : 'none'}`);
  L.push('');

  L.push('### Proposed Changes');
  L.push('');
  if (pr.items.length === 0) {
    L.push('_No items in this version._');
  } else {
    for (const i of pr.items) {
      const opts_ = i.options.length ? ` _(options: ${i.options.map((o) => (o.group ? `${o.group}/${o.name}` : o.name)).join(', ')})_` : '';
      const price = i.unitPrice !== null ? ` @ ${money(cur, i.unitPrice)}` : '';
      L.push(`+ ${i.name} × ${i.quantity}${price}${opts_}`);
      if (i.category === 'combo') {
        const c = i.comboComposition;
        if (c && c.source === 'mcp-detail') {
          const parts = c.components.map((x) => `${x.name}×${x.quantity}`);
          L.push(`  - 套餐组成（已由 \`query-meal-detail\` 核对）：${parts.join('、')}`);
        } else {
          L.push(`  - ⚠️ **套餐组成未核对**：需先调用 \`query-meal-detail(code="${i.code}")\` 读取组成，确认后本方案才可批准。`);
        }
      }
    }
  }
  L.push('');

  L.push('### Price Check');
  L.push('');
  L.push(`| Item | Amount |`);
  L.push(`| --- | --- |`);
  L.push(`| Budget | ${cap === null ? 'unset' : money(cur, cap)} |`);
  L.push(`| Subtotal | ${money(cur, q.subtotal)} |`);
  L.push(`| Discount | ${q.discountTotal === null ? 'unknown' : `-${money(cur, q.discountTotal)}`} |`);
  L.push(`| Delivery fee | ${q.deliveryFee === null ? 'n/a' : money(cur, q.deliveryFee)} |`);
  L.push(`| **Calculated payable** | ${q.calculated ? money(cur, q.payable) : `unknown — ${q.unverifiedReason ?? 'no calculate-price result'}`} |`);
  L.push(`| Available budget left | ${remaining === null ? 'unknown' : money(cur, remaining)} |`);
  L.push('');
  if (!q.calculated) {
    L.push('> ⚠️ 应付金额未经 `calculate-price` 校验，本 PR **不得进入可批准状态**。');
    L.push('');
  }

  L.push('### Coupon Check');
  L.push('');
  if (pr.coupons.length === 0) {
    L.push('Applied: none — priced at menu value only.');
  } else {
    for (const c of pr.coupons) {
      const state = c.verified && c.source === 'mcp' ? 'verified' : '**unverified**';
      L.push(`- ${c.name} (\`${c.id}\`) — ${state}${c.discountAmount !== null ? `, discount ${money(cur, c.discountAmount)}` : ''}`);
    }
  }
  if (pr.priceQuote.source === 'unknown') {
    L.push('');
    L.push('> 节省金额仅在官方 `calculate-price` 返回可比金额时才展示。');
  }
  L.push('');

  L.push('### Nutrition Check');
  L.push('');
  const nLine = [`Status: **${n.status}**`, `official coverage ${(n.coverage * 100).toFixed(0)}%`].join(' · ');
  L.push(nLine);
  if (n.status !== 'UNKNOWN') {
    const t = n.totals ?? {};
    L.push('');
    L.push('| Nutrient | Total (matched items only) |');
    L.push('| --- | --- |');
    for (const [label, key] of [
      ['Energy (kcal)', 'energyKcal'],
      ['Protein (g)', 'proteinG'],
      ['Fat (g)', 'fatG'],
      ['Carbohydrate (g)', 'carbG'],
      ['Sodium (mg)', 'sodiumMg'],
      ['Calcium (mg)', 'calciumMg'],
    ] as const) {
      const raw = t[key];
      if (raw === null || raw === undefined) continue;
      L.push(`| ${label} | ${raw} |`);
    }
  }
  if (n.missing.length > 0) {
    L.push('');
    L.push(`- No official data: ${n.missing.join(', ')}`);
  }
  L.push('');
  L.push(`> ${n.note || ''}`);
  L.push('');

  L.push('### Validation');
  L.push('');
  for (const c of pr.validations) L.push(checkLine(c));
  L.push('');

  if (opts.diffBlock) {
    L.push('### Diff vs previous version');
    L.push('');
    L.push('```diff');
    L.push(opts.diffBlock);
    L.push('```');
    L.push('');
  }

  L.push('### Review');
  L.push('');
  const fps = shortFingerprint(fp);
  if (pr.approval.approved) {
    L.push(`- Approved version: v${pr.approval.version} · fingerprint \`${pr.approval.fingerprint ? shortFingerprint(pr.approval.fingerprint) : '-'}\``);
  }
  L.push(`- Current fingerprint: \`${fps}\`　(mode, store, fulfillment, items, qty, options, coupons, payable)`);
  L.push('');
  L.push('### Review Actions');
  L.push('');
  const actions = allowedActions(pr.status);
  L.push(`Allowed from \`${pr.status}\`: ${actions.length ? actions.map((a) => `\`${a}\``).join(', ') : '(none)'}`);
  L.push('');
  L.push('Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_');
  L.push('');

  if (pr.order.orderId || pr.order.simulated) {
    L.push('### Order');
    L.push('');
    L.push(`- State: ${pr.order.status ?? 'unknown'}`);
    L.push(`- ${pr.mode === 'DEMO' ? 'Simulated' : 'Real'} order id: ${pr.order.orderId ?? '-'}${pr.order.simulated ? ' (SIMULATED)' : ''}`);
    L.push(`- Payable: ${money(cur, pr.order.payable)}`);
    if (pr.mode === 'LIVE' && pr.order.payUrl) L.push(`- Official payment link: ${pr.order.payUrl}`);
    if (pr.mode === 'DEMO') L.push('- Payment link: none — Demo mode never issues a payment link.');
    L.push('');
    L.push('> 订单创建不等于已支付，需你自行完成付款。');
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('_MealPR — Don\'t just order. Review your meal._');
  return L.join('\n');
}
