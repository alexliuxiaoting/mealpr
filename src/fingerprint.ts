/**
 * Version fingerprint — F08-approval binding (PRD 7.2).
 *
 * The fingerprint covers every field whose change invalidates a human
 * approval: PR id, version, mode, store, fulfillment, item codes + quantities
 * + options, applied coupons, and the actual payable amount.
 * Any change to those terms voids the previous approval automatically.
 */
import type { MealPR } from './types.js';
import { sha256Hex } from './sha256.js';

export interface FingerprintPayload {
  id: string;
  version: number;
  mode: string;
  storeId: string | null;
  fulfillment: string | null;
  items: Array<{ code: string; quantity: number; options: Array<{ group: string; name: string; quantity: number }> }>;
  coupons: string[];
  payable: number | null;
}

export function fingerprintPayload(pr: MealPR): FingerprintPayload {
  return {
    id: pr.id,
    version: pr.version,
    mode: pr.mode,
    storeId: pr.store?.id ?? null,
    fulfillment: pr.fulfillment ?? null,
    items: [...pr.items]
      .map((i) => ({
        code: i.code,
        quantity: i.quantity,
        options: [...i.options]
          .map((o) => ({ group: o.group ?? '', name: o.name, quantity: o.quantity }))
          .sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    coupons: [...pr.coupons].filter((c) => c.verified).map((c) => c.id).sort(),
    payable: pr.priceQuote.payable,
  };
}

export function canonicalize(payload: FingerprintPayload): string {
  return JSON.stringify(payload, (key, value) => {
    if (typeof value === 'number') return Number(value.toFixed(2));
    return value;
  });
}

/**
 * Isomorphic on purpose: the same digest is produced in Node and in the
 * browser, so a fingerprint minted by the P1 review page is identical to one
 * minted by the Skill scripts.
 */
export function computeFingerprint(pr: MealPR): string {
  return sha256Hex(canonicalize(fingerprintPayload(pr)));
}

const FP_LENGTH = 64;

export function shortFingerprint(fp: string): string {
  return fp.slice(0, 12);
}

export function isFingerprint(fp: string): boolean {
  return typeof fp === 'string' && fp.length === FP_LENGTH && /^[0-9a-f]+$/.test(fp);
}

/**
 * True when the plan the human approved is still byte-identical, in the terms
 * that matter, to the plan we are about to execute.
 */
export function approvalIsValid(pr: MealPR): { valid: boolean; reason: string; current: string; approved: string | null } {
  const current = computeFingerprint(pr);
  const approved = pr.approval.fingerprint;
  if (!pr.approval.approved) return { valid: false, reason: 'no-approval', current, approved };
  if (!approved) return { valid: false, reason: 'approval-missing-fingerprint', current, approved: null };
  if (approved !== current) return { valid: false, reason: 'plan-changed-after-approval', current, approved };
  if (pr.approval.version !== pr.version) {
    return { valid: false, reason: 'version-drift-after-approval', current, approved };
  }
  return { valid: true, reason: 'ok', current, approved };
}
