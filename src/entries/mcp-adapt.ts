#!/usr/bin/env node
/**
 * mcp-adapt.mjs — normalize real McDonald's MCP payloads into MealPR shapes.
 *
 *   echo '{"action":"facts"}' | node mcp-adapt.mjs
 *   echo '{"action":"normalize-catalog","catalog":[...]}' | node mcp-adapt.mjs
 *   echo '{"action":"normalize-quote","raw":{...},"amountUnit":"cent"}' | node mcp-adapt.mjs
 *   echo '{"action":"combo","components":[{"name":"炸鸡","category":"main"}]}' | node mcp-adapt.mjs
 *
 * Offline and read-only. It does not call the MCP — the Agent calls the MCP and
 * feeds the raw result in here.
 */
import {
  MCP_FIELD_FACTS,
  buildComboComposition,
  normalizeCatalog,
  normalizePriceQuote,
  type AmountUnit,
  type RawCatalogItem,
} from '../mcp-adapt.js';
import { readInput, out } from './_io.js';

interface Input {
  action?: 'facts' | 'normalize-catalog' | 'normalize-quote' | 'combo';
  catalog?: RawCatalogItem[];
  raw?: Record<string, unknown>;
  amountUnit?: AmountUnit;
  fieldMap?: Record<string, string>;
  components?: Array<{ name: string; category?: string; quantity?: number; code?: string | null }>;
  source?: 'mcp-detail' | 'unknown';
}

const input = readInput<Input>();
if (!input || !input.action) {
  out({
    ok: false,
    error: 'usage: node mcp-adapt.mjs --file input.json  // { action: facts|normalize-catalog|normalize-quote|combo, ... }',
  });
  process.exit(1);
}

switch (input.action) {
  case 'facts':
    out({ ok: true, facts: MCP_FIELD_FACTS });
    break;
  case 'normalize-catalog': {
    if (!Array.isArray(input.catalog)) {
      out({ ok: false, error: 'normalize-catalog requires { catalog: [...] }' });
      process.exit(1);
    }
    const r = normalizeCatalog(input.catalog, { amountUnit: input.amountUnit ?? 'yuan' });
    out({ ok: true, catalog: r.value, warnings: r.warnings });
    break;
  }
  case 'normalize-quote': {
    if (!input.raw) {
      out({ ok: false, error: 'normalize-quote requires { raw: {...} }' });
      process.exit(1);
    }
    const r = normalizePriceQuote(input.raw, {
      amountUnit: input.amountUnit ?? 'cent',
      fieldMap: input.fieldMap,
    });
    out({ ok: r.value.calculated, quote: r.value, warnings: r.warnings });
    break;
  }
  case 'combo': {
    const comp = buildComboComposition(input.components ?? [], { source: input.source ?? 'mcp-detail' });
    out({ ok: true, comboComposition: comp });
    break;
  }
  default:
    out({ ok: false, error: `unknown action ${String(input.action)}` });
    process.exit(1);
}
