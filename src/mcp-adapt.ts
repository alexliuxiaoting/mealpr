/**
 * MCP boundary adapter.
 *
 * The single place where real McDonald's MCP payload shapes are translated into
 * MealPR's internal structures. Everything downstream only ever sees the
 * normalized shape, so the rest of the codebase never has to guess a field name.
 *
 * These facts were established against the live server on 2026-10-10 and
 * contradicted our earlier assumptions — keep them here, in code, where a test
 * can assert them.
 */
import type { ComboComposition, MealItem, PriceQuote } from './types.js';
import { ComboCompositionSchema, ItemCategorySchema, PriceQuoteSchema } from './types.js';
import type { CatalogItem } from './plan.js';

export const MCP_FIELD_FACTS = {
  /** query-meals / query-meal-detail money fields. There is no plain `price`. */
  menu: {
    priceField: 'currentPrice',
    listPriceField: 'originalPrice',
    legacyAlias: 'price',
    note: 'currentPrice is the payable menu price; originalPrice is the pre-promotion list price. They are NOT interchangeable.',
  },
  /** query-meal-detail takes `code`, not `productCode`. Passing productCode returns HTTP 400. */
  mealDetail: {
    codeParam: 'code',
    knownWrongParam: 'productCode',
    note: 'Confirmed empirically: productCode -> 400. Use the code returned by query-meals.',
  },
  /** calculate-price returns amounts in 分 (cents). 2290 === ¥22.90. */
  calculatePrice: {
    amountUnit: 'cent',
    example: { raw: 2290, yuan: 22.9 },
    note: 'Always divide by 100 before the number reaches PriceQuote, or every budget check is off by 100x.',
  },
  /** The official MCP tools/list response DOES carry full inputSchema per tool. */
  toolsList: {
    providesInputSchema: true,
    note: 'Read the live tools/list description before constructing arguments. Earlier docs claiming schemas were unpublished were wrong.',
  },
  verifiedOn: '2026-10-10',
} as const;

export type AmountUnit = 'yuan' | 'cent';

/** Convert an MCP amount into MealPR's canonical 元 unit. */
export function toYuan(value: unknown, unit: AmountUnit = 'yuan'): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const yuan = unit === 'cent' ? n / 100 : n;
  return Number(yuan.toFixed(2));
}

/**
 * Heuristic alarm only. `calculate-price` returns cents as integers, so a
 * suspiciously large integer almost always means the unit was not converted.
 */
export function looksLikeCents(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 100;
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export interface RawCatalogItem {
  code?: unknown;
  name?: unknown;
  category?: unknown;
  currentPrice?: unknown;
  originalPrice?: unknown;
  /** Legacy alias accepted for backwards compatibility with our own fixtures. */
  price?: unknown;
  available?: unknown;
  tags?: unknown;
  composition?: unknown;
}

export interface NormalizeOptions {
  amountUnit?: AmountUnit;
  /** Override category when the menu does not expose one explicitly. */
  defaultCategory?: MealItem['category'];
}

export interface NormalizeResult<T> {
  value: T;
  warnings: string[];
}

export function normalizeCatalogItem(raw: RawCatalogItem, opts: NormalizeOptions = {}): NormalizeResult<CatalogItem> {
  const warnings: string[] = [];
  const unit = opts.amountUnit ?? 'yuan';
  const code = typeof raw.code === 'string' ? raw.code : String(raw.code ?? '');
  const name = typeof raw.name === 'string' ? raw.name : String(raw.name ?? code);

  const priceSource = raw.currentPrice ?? raw.price;
  const price = toYuan(priceSource, unit);
  if (priceSource === undefined || priceSource === null) {
    warnings.push(`${code}: no currentPrice (nor legacy price) — unit price left unknown; it will be re-priced by calculate-price.`);
  }
  const listPrice = toYuan(raw.originalPrice, unit);

  const catParsed = ItemCategorySchema.safeParse(raw.category);
  const category: MealItem['category'] = catParsed.success ? catParsed.data : (opts.defaultCategory ?? 'other');
  if (!catParsed.success) {
    warnings.push(`${code}: menu did not expose a usable category — classified as '${category}'. Derive it from the menu structure instead of guessing.`);
  }

  const composition = normalizeComposition(raw.composition, `${code}: `, warnings);

  return {
    value: {
      code,
      name,
      category,
      price,
      listPrice,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined,
      available: typeof raw.available === 'boolean' ? raw.available : undefined,
      composition,
    },
    warnings,
  };
}

export function normalizeCatalog(raw: RawCatalogItem[], opts: NormalizeOptions = {}): NormalizeResult<CatalogItem[]> {
  const out: CatalogItem[] = [];
  const warnings: string[] = [];
  for (const r of raw) {
    const n = normalizeCatalogItem(r, opts);
    out.push(n.value);
    warnings.push(...n.warnings);
  }
  return { value: out, warnings };
}

/* ------------------------------------------------------------------ */
/* Combo composition                                                   */
/* ------------------------------------------------------------------ */

/**
 * Wrap the component list the agent actually read from `query-meal-detail`.
 * Nothing is inferred: an empty list stays an empty list, and `source` stays
 * 'unknown' unless the caller says the values came from a real detail call.
 */
export function buildComboComposition(
  components: Array<{ name: string; category?: string; quantity?: number; code?: string | null }>,
  opts: { source?: ComboComposition['source']; note?: string | null } = {},
): ComboComposition {
  return ComboCompositionSchema.parse({
    components: components.map((c) => {
      const parsed = ItemCategorySchema.safeParse(c.category);
      return {
        name: c.name,
        category: parsed.success ? parsed.data : 'other',
        quantity: c.quantity ?? 1,
        code: c.code ?? null,
      };
    }),
    source: opts.source ?? 'unknown',
    note: opts.note ?? null,
  });
}

function normalizeComposition(raw: unknown, prefix: string, warnings: string[]): ComboComposition | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') {
    warnings.push(`${prefix}composition is not an object — treated as unqueried.`);
    return null;
  }
  const r = raw as { components?: unknown; source?: unknown; note?: unknown };
  const comps = Array.isArray(r.components) ? r.components : [];
  const parsed = ComboCompositionSchema.safeParse({
    components: comps.map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const cat = ItemCategorySchema.safeParse(o.category);
      return {
        name: String(o.name ?? ''),
        category: cat.success ? cat.data : 'other',
        quantity: Number(o.quantity ?? 1) || 1,
        code: typeof o.code === 'string' ? o.code : null,
      };
    }),
    source: r.source === 'mcp-detail' ? 'mcp-detail' : 'unknown',
    note: typeof r.note === 'string' ? r.note : null,
  });
  if (!parsed.success) {
    warnings.push(`${prefix}composition could not be parsed — treated as unqueried.`);
    return null;
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Price quote                                                         */
/* ------------------------------------------------------------------ */

export interface QuoteFieldMap {
  payable?: string;
  subtotal?: string;
  discountTotal?: string;
  deliveryFee?: string;
  currency?: string;
}

export interface NormalizeQuoteOptions {
  amountUnit?: AmountUnit;
  /** Rename MCP keys when the live payload differs from our documented defaults. */
  fieldMap?: QuoteFieldMap;
  toolCallId?: string | null;
  quotedAt?: string | null;
}

const DEFAULT_QUOTE_FIELDS: Required<QuoteFieldMap> = {
  payable: 'payable',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  deliveryFee: 'deliveryFee',
  currency: 'currency',
};

/**
 * `calculated` is set to true ONLY when a payable amount was actually present.
 * A quote with no payable stays unverified, which blocks approval downstream.
 */
export function normalizePriceQuote(
  raw: Record<string, unknown>,
  opts: NormalizeQuoteOptions = {},
): NormalizeResult<PriceQuote> {
  const unit = opts.amountUnit ?? 'cent'; // calculate-price speaks cents
  const map = { ...DEFAULT_QUOTE_FIELDS, ...(opts.fieldMap ?? {}) };
  const warnings: string[] = [];

  const read = (key: string): unknown => raw[map[key as keyof QuoteFieldMap] ?? key];

  const payable = toYuan(read('payable'), unit);
  if (payable === null) {
    warnings.push(
      `No payable amount found at "${map.payable}". Pass { fieldMap: { payable: '<actual key>' } } after reading the tool description — MealPR will NOT guess a number.`,
    );
  } else if (unit === 'yuan' && looksLikeCents(payable)) {
    warnings.push(`payable ${payable} looks like a cent amount but unit='yuan' was declared — re-check with amountUnit: 'cent'.`);
  }

  const currency = typeof read('currency') === 'string' ? String(read('currency')) : 'CNY';

  const quote = PriceQuoteSchema.parse({
    currency,
    subtotal: toYuan(read('subtotal'), unit),
    discountTotal: toYuan(read('discountTotal'), unit),
    deliveryFee: toYuan(read('deliveryFee'), unit),
    payable,
    calculated: payable !== null,
    source: 'mcp',
    unverifiedReason: payable === null ? 'calculate-price returned no payable amount.' : null,
    quotedAt: opts.quotedAt ?? new Date().toISOString(),
    toolCallId: opts.toolCallId ?? null,
  });

  return { value: quote, warnings };
}
