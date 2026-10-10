/**
 * MealPR core data model.
 *
 * IMPORTANT: these types describe MealPR's INTERNAL structure only.
 * They are NOT the McDonald's MCP tool request/response schemas.
 * MCP payload shapes must be read from the live MCP client (tools/list),
 * never from this file.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ModeSchema = z.enum(['DEMO', 'LIVE']);
export type Mode = z.infer<typeof ModeSchema>;

export const StatusSchema = z.enum([
  'DRAFT',
  'READY_FOR_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ORDER_CREATED',
  'PAYMENT_PENDING',
  'REJECTED',
  'FAILED',
]);
export type Status = z.infer<typeof StatusSchema>;

export const FulfillmentSchema = z.enum(['pickup', 'delivery']);
export type Fulfillment = z.infer<typeof FulfillmentSchema>;

export const CheckStatusSchema = z.enum(['PASS', 'FAIL', 'WARN', 'UNKNOWN']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const NutritionStatusSchema = z.enum(['VERIFIED', 'PARTIAL', 'UNKNOWN']);
export type NutritionStatus = z.infer<typeof NutritionStatusSchema>;

/** Where a value came from. `unknown` must never be rendered as a fact. */
export const ProvenanceSchema = z.enum(['mcp', 'demo', 'unknown']);
export type Provenance = z.infer<typeof ProvenanceSchema>;

/* ------------------------------------------------------------------ */
/* User intent                                                         */
/* ------------------------------------------------------------------ */

export const BudgetSchema = z.object({
  currency: z.string().default('CNY'),
  max: z.number().nonnegative().nullable().default(null),
  min: z.number().nonnegative().nullable().default(null),
});

export const PreferenceSchema = z.enum([
  'prefer-coupons',
  'prefer-variety',
  'prefer-cheapest',
  'prefer-high-protein',
  'prefer-low-calorie',
  'prefer-meat',
  'no-sugar-drink',
]);
export type Preference = z.infer<typeof PreferenceSchema>;

export const NutritionGoalSchema = z.object({
  maxCaloriesKcal: z.number().nullable().default(null),
  minProteinG: z.number().nullable().default(null),
  maxSodiumMg: z.number().nullable().default(null),
});

export const UserIntentSchema = z.object({
  people: z.number().int().positive().nullable().default(null),
  budget: BudgetSchema.default({ currency: 'CNY', max: null, min: null }),
  fulfillment: FulfillmentSchema.nullable().default(null),
  store: z.string().nullable().default(null),
  preferences: z.array(PreferenceSchema).default([]),
  exclusions: z.array(z.string()).default([]),
  nutritionGoals: NutritionGoalSchema.nullable().default(null),
  rawText: z.string().default(''),
  /** Fields MealPR must ask the human about before planning. */
  missing: z.array(z.string()).default([]),
});
export type UserIntent = z.infer<typeof UserIntentSchema>;

/* ------------------------------------------------------------------ */
/* Catalog / plan building blocks                                      */
/* ------------------------------------------------------------------ */

export const ItemCategorySchema = z.enum(['main', 'side', 'drink', 'dessert', 'combo', 'other']);

export const ItemOptionSchema = z.object({
  /** Option group / slot name returned by the meal-detail tool. */
  group: z.string().default(''),
  name: z.string(),
  code: z.string().nullable().default(null),
  quantity: z.number().int().positive().default(1),
});

/**
 * What a combo actually contains, as returned by `query-meal-detail`.
 *
 * A combo is NOT a main. Stacking a drink or a side on top of a combo without
 * reading its composition double-counts components the combo already includes.
 * `source: 'unknown'` therefore blocks approval — see `checkComboComposition`.
 */
export const ComboComponentSchema = z.object({
  name: z.string(),
  category: ItemCategorySchema.default('other'),
  quantity: z.number().int().positive().default(1),
  code: z.string().nullable().default(null),
});

export const ComboCompositionSchema = z.object({
  components: z.array(ComboComponentSchema).default([]),
  /** 'mcp-detail' only when the components were read from a real query-meal-detail result. */
  source: z.enum(['mcp-detail', 'unknown']).default('unknown'),
  note: z.string().nullable().default(null),
});
export type ComboComposition = z.infer<typeof ComboCompositionSchema>;

/** Component counts for ONE unit of the combo. Derived, never stored, so it cannot drift. */
export function compositionCounts(c: ComboComposition | null): {
  mains: number;
  sides: number;
  drinks: number;
  desserts: number;
  other: number;
} {
  const counts = { mains: 0, sides: 0, drinks: 0, desserts: 0, other: 0 };
  if (!c) return counts;
  for (const comp of c.components) {
    const q = comp.quantity;
    switch (comp.category) {
      case 'main': counts.mains += q; break;
      case 'side': counts.sides += q; break;
      case 'drink': counts.drinks += q; break;
      case 'dessert': counts.desserts += q; break;
      default: counts.other += q;
    }
  }
  return counts;
}

export function comboCompositionVerified(item: { category: string; comboComposition?: ComboComposition | null }): boolean {
  return item.category === 'combo' && item.comboComposition != null && item.comboComposition.source === 'mcp-detail';
}

export const MealItemSchema = z.object({
  /** Menu code as returned by query-meals / query-meal-detail. */
  code: z.string(),
  name: z.string(),
  category: ItemCategorySchema.default('other'),
  quantity: z.number().int().positive(),
  options: z.array(ItemOptionSchema).default([]),
  /** Unit price MAY be absent — the authoritative payable comes from calculate-price. */
  unitPrice: z.number().nullable().default(null),
  /** Only fill when `list-nutrition-foods` returned this exact food. */
  nutritionRef: z.string().nullable().default(null),
  /** Non-null only for `category: 'combo'`. `null` = composition never queried. */
  comboComposition: ComboCompositionSchema.nullable().default(null),
  remark: z.string().nullable().default(null),
});
export type MealItem = z.infer<typeof MealItemSchema>;

export const NutritionFactSchema = z.object({
  energyKcal: z.number().nullable().default(null),
  proteinG: z.number().nullable().default(null),
  fatG: z.number().nullable().default(null),
  carbG: z.number().nullable().default(null),
  sodiumMg: z.number().nullable().default(null),
  calciumMg: z.number().nullable().default(null),
});
export type NutritionFact = z.infer<typeof NutritionFactSchema>;

export const NutritionEntrySchema = NutritionFactSchema.extend({
  /** Serving scaling applied to the reference food (1 = one item). */
  servings: z.number().positive().default(1),
  source: ProvenanceSchema.default('unknown'),
});

export const NutritionSummarySchema = z.object({
  status: NutritionStatusSchema.default('UNKNOWN'),
  /** 0..1 ratio of plan items whose nutrition data was officially returned. */
  coverage: z.number().min(0).max(1).default(0),
  matched: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  totals: NutritionFactSchema.default({}),
  note: z.string().default(''),
});
export type NutritionSummary = z.infer<typeof NutritionSummarySchema>;

export const CouponSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Always 'mcp' in LIVE mode when the coupon came from a real coupon query. */
  source: ProvenanceSchema.default('unknown'),
  discountAmount: z.number().nullable().default(null),
  verified: z.boolean().default(false),
  note: z.string().nullable().default(null),
});

export const PriceQuoteSchema = z.object({
  currency: z.string().default('CNY'),
  subtotal: z.number().nullable().default(null),
  discountTotal: z.number().nullable().default(null),
  deliveryFee: z.number().nullable().default(null),
  payable: z.number().nullable().default(null),
  /** TRUE only when the number came back from a real calculate-price call. */
  calculated: z.boolean().default(false),
  source: ProvenanceSchema.default('unknown'),
  /** Set when calculate-price was unavailable — never silently ignore. */
  unverifiedReason: z.string().nullable().default(null),
  quotedAt: z.string().nullable().default(null),
  toolCallId: z.string().nullable().default(null),
});
export type PriceQuote = z.infer<typeof PriceQuoteSchema>;

export const StoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable().default(null),
  source: ProvenanceSchema.default('unknown'),
});

export const ValidationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: CheckStatusSchema,
  detail: z.string().default(''),
  /** Blocking checks must all be PASS before READY_FOR_REVIEW / approval. */
  blocking: z.boolean().default(true),
});
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

export const ApprovalSchema = z.object({
  approved: z.boolean().default(false),
  version: z.number().nullable().default(null),
  fingerprint: z.string().nullable().default(null),
  approvedAt: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
});

export const OrderAttemptSchema = z.object({
  at: z.string(),
  requestFingerprint: z.string(),
  outcome: z.enum(['SUCCESS', 'FAILED', 'UNKNOWN']),
  orderId: z.string().nullable().default(null),
  message: z.string().default(''),
});

export const OrderSchema = z.object({
  orderId: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  payable: z.number().nullable().default(null),
  payUrl: z.string().nullable().default(null),
  requestFingerprint: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  simulated: z.boolean().default(false),
  attempts: z.array(OrderAttemptSchema).default([]),
});
export type Order = z.infer<typeof OrderSchema>;

export const ChangeRecordSchema = z.object({
  version: z.number(),
  at: z.string(),
  kind: z.enum(['created', 'revised', 'approved', 'rejected', 'executed', 'failed']),
  note: z.string().default(''),
});

/* ------------------------------------------------------------------ */
/* MealPR aggregate                                                    */
/* ------------------------------------------------------------------ */

export const MealPRSchema = z.object({
  id: z.string(),
  mode: ModeSchema,
  title: z.string(),
  status: StatusSchema,
  version: z.number().int().positive().default(1),
  userIntent: UserIntentSchema,
  fulfillment: FulfillmentSchema.nullable().default(null),
  store: StoreSchema.nullable().default(null),
  items: z.array(MealItemSchema).default([]),
  coupons: z.array(CouponSchema).default([]),
  priceQuote: PriceQuoteSchema.default({}),
  nutritionSummary: NutritionSummarySchema.default({}),
  validations: z.array(ValidationCheckSchema).default([]),
  changes: z.array(ChangeRecordSchema).default([]),
  approval: ApprovalSchema.default({}),
  order: OrderSchema.default({}),
  timestamps: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export type MealPRDraft = z.input<typeof MealPRSchema>;
export type MealPR = z.output<typeof MealPRSchema>;

/** Parse + normalize loose input into a fully populated MealPR. */
export function parseMealPR(input: unknown): MealPR {
  return MealPRSchema.parse(input);
}

/** Non-throwing variant returning `{ ok, data, issues }`. */
export function safeParseMealPR(input: unknown):
  | { ok: true; data: MealPR }
  | { ok: false; issues: string[] } {
  const r = MealPRSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`),
  };
}
