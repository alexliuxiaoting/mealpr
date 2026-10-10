#!/usr/bin/env node
/**
 * plan.mjs — F03
 *   node plan.mjs --file plan-input.json
 *
 * Input:  { intent, catalog: [{code,name,category,price,available}] , maxCandidates? }
 * Output: { ok, candidates, noPlanReason? }
 *
 * Output prices are MENU prices and are only a pre-screen. The payable amount
 * must still come from calculate-price.
 */
import { explainNoPlan, filterCatalog, generateCandidates, prescreenByMenuPrice, type CatalogItem } from '../plan.js';
import type { UserIntent } from '../types.js';
import { UserIntentSchema } from '../types.js';
import { readInput, out } from './_io.js';

interface Input {
  intent: UserIntent;
  catalog: CatalogItem[];
  maxCandidates?: number;
}

const input = readInput<Input>();
if (!input || !Array.isArray(input.catalog) || !input.intent) {
  out({ ok: false, error: 'usage: node plan.mjs --file input.json  // { intent, catalog }' });
  process.exit(1);
}

const intent = UserIntentSchema.parse(input.intent);
const { dropped } = filterCatalog(input.catalog, intent);
const all = generateCandidates(input.catalog, intent, input.maxCandidates ?? 3);
const survivors = prescreenByMenuPrice(all, intent);

out({
  ok: true,
  candidates: survivors,
  filteredOutByExclusion: dropped,
  rejectedByMenuPricePrescreen: all
    .filter((c) => !survivors.includes(c))
    .map((c) => ({ id: c.id, estimatedTotal: c.estimatedTotal })),
  noPlanReason: survivors.length === 0 ? explainNoPlan(input.catalog, intent) : null,
  reminder:
    'Menu prices are indicative only. Every surviving candidate must be re-priced by calculate-price before it can enter READY_FOR_REVIEW.',
});
