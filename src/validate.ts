/**
 * Validation layer — turns a candidate plan into auditable checks.
 *
 * Rule of the house: anything we could not confirm against a real MCP result
 * becomes UNKNOWN (or FAIL if it is a blocking hard constraint). Nothing is
 * ever inferred into a PASS.
 */
import type {
  CheckStatus,
  MealPR,
  MealItem,
  NutritionSummary,
  PriceQuote,
  UserIntent,
  ValidationCheck,
} from './types.js';
import { compositionCounts } from './types.js';

export interface AvailabilityEntry {
  code: string;
  name?: string;
  available?: boolean;
}

/** `null` means "we do not know" — never treat null as available. */
export function checkAvailability(
  items: MealPR['items'],
  catalog: AvailabilityEntry[] | null,
): ValidationCheck {
  if (!catalog) {
    return {
      id: 'products-available',
      label: 'Products available',
      status: 'UNKNOWN',
      detail: 'No menu was loaded from the store (query-meals unavailable). Availability cannot be asserted.',
      blocking: true,
    };
  }
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const missing: string[] = [];
  const soldOut: string[] = [];
  for (const item of items) {
    const entry = byCode.get(item.code);
    if (!entry) missing.push(`${item.code} (${item.name})`);
    else if (entry.available === false) soldOut.push(`${item.code} (${item.name})`);
  }
  if (missing.length || soldOut.length) {
    return {
      id: 'products-available',
      label: 'Products available',
      status: 'FAIL',
      detail: `unknown code(s): ${missing.join(', ') || '-'}; unavailable: ${soldOut.join(', ') || '-'}`,
      blocking: true,
    };
  }
  return {
    id: 'products-available',
    label: 'Products available',
    status: 'PASS',
    detail: `${items.length} SKU(s) confirmed present in this store's live menu.`,
    blocking: true,
  };
}

export function checkPriceCalculated(quote: PriceQuote): ValidationCheck {
  if (quote.calculated && typeof quote.payable === 'number') {
    return {
      id: 'price-calculated',
      label: 'Price calculated',
      status: 'PASS',
      detail: `calculate-price returned payable ${quote.currency} ${quote.payable.toFixed(2)}.`,
      blocking: true,
    };
  }
  return {
    id: 'price-calculated',
    label: 'Price calculated',
    status: 'FAIL',
    detail: quote.unverifiedReason ?? 'No authoritative payable amount was returned by calculate-price.',
    blocking: true,
  };
}

export function checkWithinBudget(intent: UserIntent, quote: PriceQuote): ValidationCheck {
  const max = intent.budget.max;
  if (max === null) {
    return {
      id: 'within-budget',
      label: 'Within budget',
      status: 'UNKNOWN',
      detail: 'No budget cap was given, so this check is not applicable.',
      blocking: false,
    };
  }
  if (!quote.calculated || typeof quote.payable !== 'number') {
    return {
      id: 'within-budget',
      label: 'Within budget',
      status: 'UNKNOWN',
      detail: 'Cannot assert budget compliance: payable amount was never calculated.',
      blocking: true,
    };
  }
  if (quote.payable > max) {
    return {
      id: 'within-budget',
      label: 'Within budget',
      status: 'FAIL',
      detail: `payable ${quote.payable.toFixed(2)} exceeds cap ${max.toFixed(2)} by ${(quote.payable - max).toFixed(2)}.`,
      blocking: true,
    };
  }
  return {
    id: 'within-budget',
    label: 'Within budget',
    status: 'PASS',
    detail: `payable ${quote.payable.toFixed(2)} leaves ${(max - quote.payable).toFixed(2)} headroom.`,
    blocking: true,
  };
}

/**
 * In LIVE mode only real MCP output counts as truth. In DEMO mode the fixed
 * fixture is the truth for that sandbox — but it is labelled `demo` everywhere
 * it is rendered, so it can never be mistaken for live data.
 */
export function authoritativeSource(mode: MealPR['mode']): 'mcp' | 'demo' {
  return mode === 'DEMO' ? 'demo' : 'mcp';
}

export function checkCoupons(pr: MealPR, expectedSource: 'mcp' | 'demo' = 'mcp'): ValidationCheck {
  if (pr.coupons.length === 0) {
    return {
      id: 'coupons-verified',
      label: 'Coupon check',
      status: 'PASS',
      detail: 'No coupon applied — priced at menu value only.',
      blocking: false,
    };
  }
  const bad = pr.coupons.filter((c) => !c.verified || c.source !== expectedSource);
  if (bad.length > 0) {
    return {
      id: 'coupons-verified',
      label: 'Coupon check',
      status: 'UNKNOWN',
      detail: `Not confirmed against a live coupon query: ${bad.map((c) => c.id).join(', ')}. Discount cannot be assumed.`,
      blocking: true,
    };
  }
  return {
    id: 'coupons-verified',
    label: 'Coupon check',
    status: 'PASS',
    detail: `${pr.coupons.length} coupon(s) confirmed by live query: ${pr.coupons.map((c) => c.name).join(', ')}.`,
    blocking: true,
  };
}

/**
 * How many "main servings" the plan actually contains.
 *
 * For a verified combo we count the mains inside its composition; for an
 * unverified combo we can only assume the combo itself is one serving, which is
 * why the result carries `assumed: true` and the caller downgrades to UNKNOWN.
 */
export function effectiveMainCount(items: MealItem[]): { mains: number; assumed: boolean } {
  let mains = 0;
  let assumed = false;
  for (const i of items) {
    if (i.category === 'combo') {
      const comp = i.comboComposition ?? null;
      if (comp && comp.source === 'mcp-detail') {
        mains += compositionCounts(comp).mains * i.quantity;
      } else {
        assumed = true;
        mains += i.quantity;
      }
    } else if (i.category === 'main') {
      mains += i.quantity;
    }
  }
  return { mains, assumed };
}

export function checkPortions(items: MealItem[], intent: UserIntent): ValidationCheck {
  if (intent.people === null) {
    return {
      id: 'portions-adequate',
      label: 'Portions adequate',
      status: 'UNKNOWN',
      detail: 'Head count unknown.',
      blocking: false,
    };
  }
  const { mains, assumed } = effectiveMainCount(items);
  if (mains < intent.people) {
    return {
      id: 'portions-adequate',
      label: 'Portions adequate',
      status: 'FAIL',
      detail: `only ${mains} main(s) for ${intent.people} person(s).`,
      blocking: true,
    };
  }
  if (assumed) {
    return {
      id: 'portions-adequate',
      label: 'Portions adequate',
      status: 'UNKNOWN',
      detail: `at least ${mains} main serving(s) for ${intent.people} person(s), but this counts an unverified combo as one serving. Resolve the combo composition first.`,
      blocking: false,
    };
  }
  return {
    id: 'portions-adequate',
    label: 'Portions adequate',
    status: 'PASS',
    detail: `${mains} main(s) for ${intent.people} person(s).`,
    blocking: true,
  };
}

/**
 * F03-combo guard — a combo whose components were never read from
 * `query-meal-detail` cannot be approved.
 *
 * The failure mode this prevents: the AI stacks a drink + a side on top of a
 * combo that already contains both, so the human approves a plan that is
 * silently more food (and more money) than it appears to be.
 */
export function checkComboComposition(items: MealItem[]): ValidationCheck {
  const combos = items.filter((i) => i.category === 'combo');
  if (combos.length === 0) {
    return {
      id: 'combo-composition-verified',
      label: 'Combo composition verified',
      status: 'PASS',
      detail: 'No combo in this plan.',
      blocking: false,
    };
  }
  const unverified = combos.filter((i) => !(i.comboComposition && i.comboComposition.source === 'mcp-detail'));
  if (unverified.length > 0) {
    return {
      id: 'combo-composition-verified',
      label: 'Combo composition verified',
      status: 'UNKNOWN',
      detail:
        `Combo component list was never read from query-meal-detail: ${unverified.map((i) => `${i.name} (${i.code})`).join(', ')}. ` +
        'A combo usually bundles its own side and drink — without the component list we cannot tell whether the rest of the plan double-charges them, ' +
        'nor whether the head count is actually covered. Call query-meal-detail with the combo code before this plan can be approved.',
      blocking: true,
    };
  }
  const detail = combos
    .map((i) => {
      const c = compositionCounts(i.comboComposition!);
      const parts: string[] = [];
      if (c.mains) parts.push(`主食×${c.mains}`);
      if (c.sides) parts.push(`小食×${c.sides}`);
      if (c.drinks) parts.push(`饮料×${c.drinks}`);
      if (c.desserts) parts.push(`甜品×${c.desserts}`);
      if (c.other) parts.push(`其他×${c.other}`);
      return `${i.name}×${i.quantity} = ${parts.join(' + ') || '(no components returned)'}`;
    })
    .join('; ');
  return {
    id: 'combo-composition-verified',
    label: 'Combo composition verified',
    status: 'PASS',
    detail: `query-meal-detail confirmed: ${detail}. Stacking in this plan only covers the real shortfall.`,
    blocking: true,
  };
}

export function checkExclusions(items: MealPR['items'], intent: UserIntent): ValidationCheck {
  if (intent.exclusions.length === 0) {
    return {
      id: 'exclusions-honoured',
      label: 'Exclusions honoured',
      status: 'PASS',
      detail: 'No exclusions were specified.',
      blocking: false,
    };
  }
  const hits: string[] = [];
  for (const kw of intent.exclusions) {
    for (const item of items) {
      const haystack = `${item.name} ${item.remark ?? ''} ${item.options.map((o) => o.name).join(' ')}`;
      if (haystack.toLowerCase().includes(kw.toLowerCase())) hits.push(`${kw} -> ${item.name}`);
    }
  }
  return hits.length
    ? {
        id: 'exclusions-honoured',
        label: 'Exclusions honoured',
        status: 'FAIL',
        detail: `plan still contains excluded item(s): ${hits.join('; ')}`,
        blocking: true,
      }
    : {
        id: 'exclusions-honoured',
        label: 'Exclusions honoured',
        status: 'PASS',
        detail: `Plan avoids: ${intent.exclusions.join(', ')}.`,
        blocking: true,
      };
}

export function checkOptionsLegal(pr: MealPR, detailed: boolean): ValidationCheck {
  if (pr.items.every((i) => i.options.length === 0)) {
    return {
      id: 'options-legal',
      label: 'Combo options legal',
      status: 'PASS',
      detail: 'No combo substitutions in this plan.',
      blocking: false,
    };
  }
  return detailed
    ? {
        id: 'options-legal',
        label: 'Combo options legal',
        status: 'PASS',
        detail: 'Substitutions confirmed against query-meal-detail for this store.',
        blocking: true,
      }
    : {
        id: 'options-legal',
        label: 'Combo options legal',
        status: 'UNKNOWN',
        detail: 'Plan contains combo substitutions but query-meal-detail was not consulted — legality unverified.',
        blocking: true,
      };
}

export interface ValidateOptions {
  /** Live menu for the chosen store. `null` = query-meals was not performed. */
  catalog?: AvailabilityEntry[] | null;
  /** True when query-meal-detail was actually consulted for the combos. */
  detailChecked?: boolean;
}

export function buildValidationSet(pr: MealPR, opts: ValidateOptions = {}): ValidationCheck[] {
  const catalog = opts.catalog === undefined ? null : opts.catalog;
  const expectedSource = authoritativeSource(pr.mode);
  return [
    checkAvailability(pr.items, catalog),
    checkPriceCalculated(pr.priceQuote),
    checkWithinBudget(pr.userIntent, pr.priceQuote),
    checkCoupons(pr, expectedSource),
    checkPortions(pr.items, pr.userIntent),
    checkExclusions(pr.items, pr.userIntent),
    checkComboComposition(pr.items),
    checkOptionsLegal(pr, Boolean(opts.detailChecked)),
    {
      id: 'human-approved',
      label: 'Human approved',
      status: pr.status === 'APPROVED' ? 'PASS' : 'UNKNOWN',
      detail: pr.status === 'APPROVED' ? 'Approval is bound to this exact version fingerprint.' : 'Awaiting explicit human approval.',
      blocking: false,
    },
  ];
}

export function allBlockingPass(checks: ValidationCheck[]): boolean {
  return checks.every((c) => !c.blocking || c.status === 'PASS');
}

export function summarize(checks: ValidationCheck[]): {
  blockingFailures: string[];
  warnings: string[];
  unknowns: string[];
  status: CheckStatus;
} {
  const blockingFailures = checks.filter((c) => c.blocking && c.status === 'FAIL').map((c) => c.id);
  const warnings = checks.filter((c) => c.status === 'WARN').map((c) => c.id);
  const unknowns = checks.filter((c) => c.status === 'UNKNOWN').map((c) => c.id);
  let status: CheckStatus = 'PASS';
  if (unknowns.length > 0) status = 'UNKNOWN';
  if (warnings.length > 0) status = 'WARN';
  if (blockingFailures.length > 0) status = 'FAIL';
  return { blockingFailures, warnings, unknowns, status };
}

/**
 * F05 — nutrition is only ever assembled from `list-nutrition-foods` rows that
 * actually matched a plan item. Missing coverage is reported as missing.
 */
export function buildNutritionSummary(
  items: MealPR['items'],
  lookup: (item: MealPR['items'][number]) => NutritionSummary['totals'] | null,
): NutritionSummary {
  let servedHits = 0;
  let servedTotal = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  const totals: NutritionSummary['totals'] = {
    energyKcal: null, proteinG: null, fatG: null, carbG: null, sodiumMg: null, calciumMg: null,
  };
  const keys = Object.keys(totals) as Array<keyof NutritionSummary['totals']>;
  const keyActive: Record<string, boolean> = {};

  for (const item of items) {
    servedTotal += item.quantity;
    const fact = lookup(item);
    if (!fact) {
      missing.push(`${item.name} x${item.quantity}`);
      continue;
    }
    servedHits += item.quantity;
    matched.push(`${item.name} x${item.quantity}`);
    for (const k of keys) {
      const v = fact[k];
      if (typeof v === 'number') {
        const base = totals[k] ?? 0;
        totals[k] = Number((base + v * item.quantity).toFixed(2));
        keyActive[k] = true;
      }
    }
  }
  for (const k of keys) if (!keyActive[k]) totals[k] = null;

  const coverage = servedTotal === 0 ? 0 : servedHits / servedTotal;
  let status: NutritionSummary['status'] = 'UNKNOWN';
  if (coverage === 1 && servedTotal > 0) status = 'VERIFIED';
  else if (coverage > 0) status = 'PARTIAL';

  let note = '';
  if (status === 'VERIFIED') note = 'All items matched official nutrition data; totals are summed from official per-item values.';
  if (status === 'PARTIAL') note = `PARTIAL: only ${matched.length} item group(s) matched official data. Totals cover those items only and must not be read as the whole meal. Unresolved: ${missing.join(', ')}.`;
  if (status === 'UNKNOWN') note = 'UNKNOWN: no plan item matched list-nutrition-foods. Nothing is asserted.';

  return { status, coverage: Number(coverage.toFixed(4)), matched, missing, totals, note };
}
