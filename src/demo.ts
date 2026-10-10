/**
 * Demo layer — physically isolated from anything real (PRD F10).
 *
 * Every value carries `source: 'demo'`; `assertExecutable` refuses to run for
 * `mode: DEMO`, so there is no code path from here to `create-order`. This is
 * a structural guarantee, not a convention.
 */
import { z } from 'zod';
import type { MealPR, NutritionFact } from './types.js';
import { parseIntent, reviseIntent } from './intent.js';
import { buildNutritionSummary, buildValidationSet } from './validate.js';
import { renderPR } from './render.js';
import { diffPRs } from './diff.js';
import { applyAction, canTransition, type Action } from './review-state.js';
import { assertExecutable } from './review-state.js';

const FixtureComponentSchema = z.object({
  name: z.string(),
  category: z.enum(['main', 'side', 'drink', 'dessert', 'other']).default('other'),
  quantity: z.number().int().positive().default(1),
});

const FixtureItemSchema = z.object({
  code: z.string(),
  quantity: z.number().int().positive(),
  options: z.array(z.object({ group: z.string().default(''), name: z.string(), quantity: z.number().int().positive().default(1) })).default([]),
  /** Only meaningful for combo SKUs. null = query-meal-detail was never called. */
  comboComposition: z.object({
    components: z.array(FixtureComponentSchema).default([]),
    source: z.enum(['mcp-detail', 'unknown']).default('unknown'),
    note: z.string().nullable().default(null),
  }).nullable().default(null),
});

const FixtureCouponSchema = z.object({
  id: z.string(),
  name: z.string(),
  discountAmount: z.number().nullable().default(null),
  verified: z.boolean().default(true),
  note: z.string().nullable().default(null),
});

const QuoteSchema = z.object({
  subtotal: z.number().nullable().default(null),
  discountTotal: z.number().nullable().default(null),
  deliveryFee: z.number().nullable().default(null),
  payable: z.number().nullable().default(null),
  calculated: z.boolean().default(true),
  unverifiedReason: z.string().nullable().default(null),
});

const PlanSchema = z.object({
  title: z.string(),
  items: z.array(FixtureItemSchema),
  coupons: z.array(FixtureCouponSchema).default([]),
  quote: QuoteSchema,
  detailChecked: z.boolean().default(false),
});

const RevisionSchema = PlanSchema.extend({
  request: z.string(),
  /** Follow-up utterance replayed through the intent parser. */
  intentPatch: z.object({ budgetMax: z.number().nullable().default(null) }).optional(),
  /**
   * 'submit-ok' (default) — the new version is expected to pass validation.
   * 'submit-blocked' — the revision is expected to FAIL validation; the demo
   * keeps the previous version and surfaces the block instead of advancing.
   */
  expect: z.enum(['submit-ok', 'submit-blocked']).default('submit-ok'),
});

const FixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requirement: z.string(),
  store: z.object({ id: z.string(), name: z.string(), address: z.string().nullable().default(null) }),
  catalog: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      category: z.enum(['main', 'side', 'drink', 'dessert', 'combo', 'other']),
      price: z.number().nullable(),
      available: z.boolean().default(true),
    }),
  ),
  nutritionTable: z.array(z.object({
    code: z.string(),
    energyKcal: z.number().nullable().default(null),
    proteinG: z.number().nullable().default(null),
    fatG: z.number().nullable().default(null),
    carbG: z.number().nullable().default(null),
    sodiumMg: z.number().nullable().default(null),
    calciumMg: z.number().nullable().default(null),
  })).default([]),
  initial: PlanSchema,
  revisions: z.array(RevisionSchema).default([]),
  simulatedOrder: z.object({
    orderId: z.string(),
    status: z.string(),
    simulated: z.boolean().default(true),
  }).default({ orderId: 'DEMO-ORDER-000001', status: 'CREATED', simulated: true }),
});

export type Fixture = z.infer<typeof FixtureSchema>;
export type FixturePlan = z.infer<typeof PlanSchema>;

export function parseFixture(input: unknown): Fixture {
  return FixtureSchema.parse(input);
}

const DEMO_NOW = new Date('2026-10-10T10:00:00.000Z').toISOString();

/** Resolve fixture line items against the fixture menu. */
function materialize(fx: Fixture, plan: FixturePlan): MealPR['items'] {
  const byCode = new Map(fx.catalog.map((c) => [c.code, c]));
  return plan.items.map((fi): MealPR['items'][number] => {
    const menu = byCode.get(fi.code);
    if (!menu) throw new Error(`demo fixture ${fx.id}: code ${fi.code} is not in the fixture menu`);
    return {
      code: menu.code,
      name: menu.name,
      category: menu.category,
      quantity: fi.quantity,
      options: fi.options.map((o) => ({ group: o.group, name: o.name, code: null, quantity: o.quantity })),
      unitPrice: menu.price,
      nutritionRef: fx.nutritionTable.some((n) => n.code === fi.code) ? fi.code : null,
      comboComposition:
        menu.category === 'combo'
          ? {
              components: (fi.comboComposition?.components ?? []).map((c) => ({
                name: c.name,
                category: c.category === 'other' ? ('other' as const) : c.category,
                quantity: c.quantity,
                code: null,
              })),
              source: fi.comboComposition?.source ?? 'unknown',
              note: fi.comboComposition?.note ?? null,
            }
          : null,
      remark: null,
    };
  });
}

function nutritionLookup(fx: Fixture) {
  return (item: MealPR['items'][number]): NutritionFact | null => {
    if (!item.nutritionRef) return null;
    const row = fx.nutritionTable.find((n) => n.code === item.nutritionRef);
    if (!row) return null;
    return {
      energyKcal: row.energyKcal,
      proteinG: row.proteinG,
      fatG: row.fatG,
      carbG: row.carbG,
      sodiumMg: row.sodiumMg,
      calciumMg: row.calciumMg,
    };
  };
}

export function buildDemoPR(fx: Fixture, plan: FixturePlan, version: number, baseIntent: MealPR['userIntent']): MealPR {
  const items = materialize(fx, plan);
  const nutritionSummary = buildNutritionSummary(items, nutritionLookup(fx));
  const pr: MealPR = {
    id: fx.id.toUpperCase().replace('DEMO-', 'MPR-DEMO-'),
    mode: 'DEMO',
    title: plan.title,
    status: 'DRAFT',
    version,
    userIntent: baseIntent,
    fulfillment: baseIntent.fulfillment ?? 'pickup',
    store: { id: fx.store.id, name: fx.store.name, address: fx.store.address, source: 'demo' },
    items,
    coupons: plan.coupons.map((c) => ({
      id: c.id,
      name: c.name,
      source: 'demo' as const,
      discountAmount: c.discountAmount,
      verified: c.verified,
      note: c.note,
    })),
    priceQuote: {
      currency: 'CNY',
      subtotal: plan.quote.subtotal,
      discountTotal: plan.quote.discountTotal,
      deliveryFee: plan.quote.deliveryFee,
      payable: plan.quote.payable,
      calculated: plan.quote.calculated,
      source: 'demo',
      unverifiedReason: plan.quote.unverifiedReason,
      quotedAt: DEMO_NOW,
      toolCallId: null,
    },
    nutritionSummary,
    validations: [],
    changes: [],
    approval: { approved: false, version: null, fingerprint: null, approvedAt: null, note: null },
    order: { orderId: null, status: null, payable: null, payUrl: null, requestFingerprint: null, createdAt: null, simulated: false, attempts: [] },
    timestamps: { createdAt: DEMO_NOW, updatedAt: DEMO_NOW },
  };
  pr.validations = buildValidationSet(pr, {
    catalog: fx.catalog.map((c) => ({ code: c.code, name: c.name, available: c.available })),
    detailChecked: plan.detailChecked,
  });
  return pr;
}

export interface DemoStep {
  kind: 'intent' | 'submitted' | 'changes-requested' | 'diff' | 'approved' | 'executed' | 'note';
  headline: string;
  markdown: string;
  pr: MealPR;
}

export interface DemoRun {
  scenario: string;
  requirement: string;
  steps: DemoStep[];
  finalPR: MealPR;
  executionGuard: ReturnType<typeof assertExecutable>;
}

/**
 * End-to-end demo transcript:
 * intent -> PR -> request changes -> new version + diff -> approve -> simulated order.
 * Deterministic: same fixture in, same transcript out.
 */
export function runDemo(fx: Fixture): DemoRun {
  let intent = parseIntent(fx.requirement);
  intent.store = fx.store.id;
  intent.missing = intent.missing.filter((f) => f !== 'store');

  const steps: DemoStep[] = [];
  const v1 = buildDemoPR(fx, fx.initial, 1, intent);

  steps.push({
    kind: 'note',
    headline: `🎬 Demo scenario 「${fx.name}」 — ${fx.description}`,
    markdown: [
      '> ⚠️ **DEMO / 模拟数据**：本场景使用项目内置的固定菜单与固定报价，不连接麦当劳 MCP，**不会调用任何真实下单工具**。',
      '',
      `用户需求原文：_${fx.requirement}_`,
      '',
      '结构化意图：',
      '```json',
      JSON.stringify({ people: intent.people, budget: intent.budget, fulfillment: intent.fulfillment, store: intent.store, preferences: intent.preferences, exclusions: intent.exclusions, missing: intent.missing }, null, 2),
      '```',
    ].join('\n'),
    pr: v1,
  });

  const submitted = applyAction(v1, 'SUBMIT_FOR_REVIEW', { note: 'initial proposal' });
  let current: MealPR;
  if (submitted.ok) {
    current = submitted.pr;
    steps.push({
      kind: 'submitted',
      headline: `🔀 Meal PR v1 opened — ${current.status}`,
      markdown: submitted.message + '\n\n' + renderPR(current),
      pr: current,
    });
  } else {
    // A blocked v1 is a legitimate demo outcome: the point of MealPR is that
    // an unverified proposal never reaches a human for approval.
    current = v1;
    steps.push({
      kind: 'diff',
      headline: `🚫 v1 未通过自动校验 — PR 停留在 ${current.status}，不会交给你批准`,
      markdown: [
        submitted.message,
        '',
        '校验明细：',
        '',
        ...v1.validations.map((v) => `- ${v.status === 'PASS' ? '[x]' : '[ ]'} **${v.label}** — ${v.status}${v.blocking ? ' (blocking)' : ''}：${v.detail}`),
        '',
        renderPR(v1),
        '',
        '> MealPR 不会为了让方案「通过」而放宽校验。先补齐缺失的校验，再重新提案。',
      ].join('\n'),
      pr: v1,
    });
  }

  for (const rev of fx.revisions) {
    let before = current;
    if (canTransition(current.status, 'REQUEST_CHANGES')) {
      const requested = applyAction(current, 'REQUEST_CHANGES', { note: rev.request });
      if (!requested.ok) throw new Error(`demo cannot request changes: ${requested.message}`);
      before = requested.pr;
      steps.push({
        kind: 'changes-requested',
        headline: `💬 Reviewer: _${rev.request}_ — v${before.version} is now ${before.status}`,
        markdown: `> 状态回到 \`${before.status}\`，此前的批准（如有）已自动失效。\n\n${requested.message}`,
        pr: before,
      });
    } else {
      before = { ...current, version: current.version };
      steps.push({
        kind: 'note',
        headline: `💬 Reviewer: _${rev.request}_（当前 \`${current.status}\`，直接进入重新提案）`,
        markdown: `当前状态为 \`${current.status}\`，不需要也无法再走一次 REQUEST_CHANGES，直接生成新版本。`,
        pr: before,
      });
    }

    let nextIntent = reviseIntent(before.userIntent, rev.request);
    if (rev.intentPatch?.budgetMax != null) nextIntent.budget.max = rev.intentPatch.budgetMax;
    intent = nextIntent;

    const revised = buildDemoPR(fx, rev, before.version + 1, intent);
    const applied = applyAction(revised, 'SUBMIT_FOR_REVIEW', { note: `v${revised.version}: ${rev.request}` });

    if (rev.expect === 'submit-blocked') {
      if (applied.ok) throw new Error(`fixture ${fx.id}: expected this revision to be blocked, but it passed validation`);
      steps.push({
        kind: 'diff',
        headline: `🚫 v${revised.version} 未通过自动校验 — PR 停留在 ${before.status}`,
        markdown: [
          applied.message,
          '',
          '校验明细：',
          '',
          ...revised.validations.map((v) => `- ${v.status === 'PASS' ? '[x]' : '[ ]'} **${v.label}** — ${v.status}${v.blocking ? ' (blocking)' : ''}：${v.detail}`),
          '',
          '> MealPR 不会为了让方案「通过」而放宽校验，也不会在未校验的情况下把它交给你审核。请调整需求或预算后重新提案。',
        ].join('\n'),
        pr: before,
      });
      continue;
    }

    if (!applied.ok) throw new Error(`demo cannot submit revision: ${applied.message}`);
    const after = applied.pr;

    const d = diffPRs(before, after);
    steps.push({
      kind: 'diff',
      headline: `🔍 Diff v${d.fromVersion} → v${d.toVersion} — ${d.summary.added} added / ${d.summary.removed} removed / ${d.summary.quantityChanged} qty change`,
      markdown: ['```diff', d.unified, '```', '', d.reason].join('\n'),
      pr: after,
    });
    current = after;
  }

  const approved = applyAction(current, 'APPROVE', { note: 'human approved this exact version (demo)' });
  if (!approved.ok) throw new Error(`demo cannot approve: ${approved.message}`);
  current = approved.pr;
  steps.push({
    kind: 'approved',
    headline: `✅ Approved v${current.version} · fingerprint ${current.approval.fingerprint?.slice(0, 12)}`,
    markdown: [approved.message, '', renderPR(current)].join('\n'),
    pr: current,
  });

  // The same guard that would run in LIVE mode, proving the demo cannot slip through.
  const guard = assertExecutable(current);
  steps.push({
    kind: 'executed',
    headline: guard.ok ? '⚠️ Unexpected: demo passed the live execution guard' : '🛡️ Execution guard: DEMO is refused by construction',
    markdown: [
      '在任何模式下，下单前都会跑同一个 `assertExecutable`：',
      '',
      `\`\`\`json\n${JSON.stringify(guard, null, 2)}\n\`\`\``,
      '',
      'DEMO 模式下它必然返回 `ok: false`（reason: `demo-mode`），因此真实的 `create-order` 工具不可能被调用。',
      '',
      '下面演示的是**模拟订单**，订单号带 `DEMO-` 前缀，不产生任何支付链接。',
    ].join('\n'),
    pr: current,
  });

  const executed = applyAction(current, 'CREATE_ORDER', {
    note: 'simulated order creation (DEMO)',
    order: {
      orderId: fx.simulatedOrder.orderId,
      status: fx.simulatedOrder.status,
      payable: current.priceQuote.payable,
      payUrl: null,
      simulated: true,
    },
  });
  // DEMO never reaches the real create-order branch; simulate explicitly.
  const finalPR: MealPR = {
    ...current,
    status: 'ORDER_CREATED',
    order: {
      ...current.order,
      orderId: fx.simulatedOrder.orderId,
      status: fx.simulatedOrder.status,
      payable: current.priceQuote.payable,
      payUrl: null,
      simulated: true,
      createdAt: DEMO_NOW,
      attempts: [{ at: DEMO_NOW, requestFingerprint: current.approval.fingerprint ?? '', outcome: 'SUCCESS', orderId: fx.simulatedOrder.orderId, message: 'SIMULATED — no MCP tool was invoked' }],
    },
    changes: [...current.changes, { version: current.version, at: DEMO_NOW, kind: 'executed', note: 'simulated order creation (DEMO)' }],
  };
  steps.push({
    kind: 'executed',
    headline: `🧾 Simulated order ${fx.simulatedOrder.orderId} — status ${fx.simulatedOrder.status}`,
    markdown: [
      `\`applyAction(CREATE_ORDER)\` 在 DEMO 下的结果：\`${executed.ok ? executed.message : executed.message}\``,
      '',
      '最终 PR：',
      '',
      renderPR(finalPR),
    ].join('\n'),
    pr: finalPR,
  });

  return { scenario: fx.name, requirement: fx.requirement, steps, finalPR, executionGuard: guard };
}

export function renderDemoReport(run: DemoRun): string {
  return [`# MealPR demo transcript — ${run.scenario}`, '', ...run.steps.flatMap((s) => [`## ${s.headline}`, '', s.markdown, ''])].join('\n');
}
