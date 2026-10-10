/**
 * F08 — Meal PR review state machine.
 *
 * Single source of truth for legal transitions. The execution gate never
 * reasons about approval with ad-hoc boolean logic; it must call
 * `assertExecutable` (or `requestCreateOrder`) which funnels through here.
 */
import type { MealPR, Status } from './types.js';
import { approvalIsValid, computeFingerprint, shortFingerprint } from './fingerprint.js';

export type Action =
  | 'SUBMIT_FOR_REVIEW'
  | 'REQUEST_CHANGES'
  | 'REVISE'
  | 'APPROVE'
  | 'REJECT'
  | 'CREATE_ORDER'
  | 'MARK_PAID'
  | 'FAIL';

const TRANSITIONS: Record<Status, Partial<Record<Action, Status>>> = {
  DRAFT: {
    SUBMIT_FOR_REVIEW: 'READY_FOR_REVIEW',
    REJECT: 'REJECTED',
    FAIL: 'FAILED',
  },
  READY_FOR_REVIEW: {
    REQUEST_CHANGES: 'CHANGES_REQUESTED',
    APPROVE: 'APPROVED',
    REVISE: 'READY_FOR_REVIEW', // version bump handled by the caller
    REJECT: 'REJECTED',
    FAIL: 'FAILED',
  },
  CHANGES_REQUESTED: {
    REVISE: 'READY_FOR_REVIEW',
    REJECT: 'REJECTED',
    FAIL: 'FAILED',
  },
  APPROVED: {
    CREATE_ORDER: 'ORDER_CREATED',
    REVISE: 'CHANGES_REQUESTED', // plan changed after approval -> must re-review
    REQUEST_CHANGES: 'CHANGES_REQUESTED',
    REJECT: 'REJECTED',
    FAIL: 'FAILED',
  },
  ORDER_CREATED: {
    MARK_PAID: 'PAYMENT_PENDING',
    FAIL: 'FAILED',
  },
  PAYMENT_PENDING: {
    FAIL: 'FAILED',
  },
  REJECTED: {},
  FAILED: {},
};

export const TERMINAL_STATUSES: Status[] = ['REJECTED', 'FAILED'];
export const APPROVABLE_STATUSES: Status[] = ['READY_FOR_REVIEW'];

export function canTransition(from: Status, action: Action): boolean {
  return TRANSITIONS[from]?.[action] !== undefined;
}

export function nextStatus(from: Status, action: Action): Status | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function allowedActions(status: Status): Action[] {
  return Object.keys(TRANSITIONS[status] ?? {}) as Action[];
}

export function isTerminal(status: Status): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface TransitionResult {
  ok: boolean;
  pr: MealPR;
  status: Status;
  message: string;
}

function clone(pr: MealPR): MealPR {
  return structuredClone(pr);
}

function touch(pr: MealPR): MealPR {
  pr.timestamps.updatedAt = new Date().toISOString();
  return pr;
}

function blockingFailures(pr: MealPR): string[] {
  return pr.validations.filter((v) => v.blocking && v.status !== 'PASS').map((v) => `${v.id}:${v.status}`);
}

/**
 * Apply an action. Every mutation that changes plan terms also clears any
 * prior approval — there is no code path where a stale approval survives a
 * substantive change.
 */
export function applyAction(input: MealPR, action: Action, opts: { note?: string; order?: Partial<MealPR['order']> } = {}): TransitionResult {
  const pr = clone(input);
  const target = nextStatus(pr.status, action);

  if (!target) {
    return {
      ok: false,
      pr: input,
      status: pr.status,
      message: `BLOCKED: action ${action} is not allowed in status ${pr.status}. Allowed: ${allowedActions(pr.status).join(', ') || '(none)'}`,
    };
  }

  switch (action) {
    case 'SUBMIT_FOR_REVIEW':
    case 'REVISE': {
      const failures = blockingFailures(pr);
      if (failures.length > 0) {
        return {
          ok: false,
          pr: input,
          status: pr.status,
          message: `BLOCKED: cannot move to ${target}, unresolved blocking checks: ${failures.join(', ')}`,
        };
      }
      // A quote is only authoritative when calculate-price actually returned it,
      // regardless of what the cached validation list says.
      if (!pr.priceQuote.calculated) {
        return {
          ok: false,
          pr: input,
          status: pr.status,
          message: 'BLOCKED: payable amount was never returned by calculate-price — re-quote before review.',
        };
      }
      break;
    }
    case 'APPROVE': {
      const failures = blockingFailures(pr);
      if (failures.length > 0) {
        return {
          ok: false,
          pr: input,
          status: pr.status,
          message: `BLOCKED: cannot approve an unverified plan. Unresolved blocking checks: ${failures.join(', ')}`,
        };
      }
      if (!pr.priceQuote.calculated) {
        return {
          ok: false,
          pr: input,
          status: pr.status,
          message: 'BLOCKED: cannot approve a plan whose payable amount was never returned by calculate-price.',
        };
      }
      break;
    }
    case 'CREATE_ORDER': {
      const gate = assertExecutable(pr);
      if (!gate.ok) return { ok: false, pr: input, status: pr.status, message: `BLOCKED: ${gate.reason} — ${gate.detail}` };
      break;
    }
    default:
      break;
  }

  pr.status = target;

  if (action === 'APPROVE') {
    const fp = computeFingerprint(pr);
    pr.approval = {
      approved: true,
      version: pr.version,
      fingerprint: fp,
      approvedAt: new Date().toISOString(),
      note: opts.note ?? null,
    };
  }

  if (action === 'REVISE' || action === 'REQUEST_CHANGES') {
    pr.approval = { approved: false, version: null, fingerprint: null, approvedAt: null, note: 'superseded by plan change' };
  }

  if (action === 'REJECT') {
    pr.approval = { approved: false, version: null, fingerprint: null, approvedAt: null, note: opts.note ?? 'rejected by reviewer' };
  }

  if (action === 'CREATE_ORDER') {
    const fp = computeFingerprint(pr);
    const known = pr.order.attempts.find((a) => a.requestFingerprint === fp && a.outcome === 'SUCCESS');
    if (known) {
      return {
        ok: false,
        pr: input,
        status: pr.status,
        message: `BLOCKED: duplicate order attempt — a SUCCESS attempt already exists for fingerprint ${shortFingerprint(fp)} (order ${known.orderId ?? 'unknown'}).`,
      };
    }
    pr.order = {
      ...pr.order,
      ...(opts.order ?? {}),
      requestFingerprint: fp,
      createdAt: pr.order.createdAt ?? new Date().toISOString(),
    };
    // Ledger entry — this is what stops a silent re-send later.
    const succeeded = Boolean(opts.order?.orderId);
    pr.order.attempts = [
      ...pr.order.attempts.filter((a) => a.requestFingerprint !== fp),
      {
        at: new Date().toISOString(),
        requestFingerprint: fp,
        outcome: succeeded ? 'SUCCESS' : 'FAILED',
        orderId: pr.order.orderId ?? null,
        message: succeeded ? 'order created for this fingerprint' : 'attempt recorded without order id',
      },
    ];
  }

  pr.changes.push({
    version: pr.version,
    at: new Date().toISOString(),
    kind: ACTION_KIND[action],
    note: opts.note ?? ACTION_NOTE[action],
  });

  return { ok: true, pr: touch(pr), status: target, message: `OK: ${input.status} --${action}--> ${target}` };
}

const ACTION_KIND: Record<Action, MealPR['changes'][number]['kind']> = {
  SUBMIT_FOR_REVIEW: 'created',
  REVISE: 'revised',
  REQUEST_CHANGES: 'revised',
  APPROVE: 'approved',
  REJECT: 'rejected',
  CREATE_ORDER: 'executed',
  MARK_PAID: 'executed',
  FAIL: 'failed',
};

const ACTION_NOTE: Record<Action, string> = {
  SUBMIT_FOR_REVIEW: 'submitted for human review',
  REVISE: 'new version generated and re-validated',
  REQUEST_CHANGES: 'reviewer requested changes',
  APPROVE: 'human approved this exact version',
  REJECT: 'reviewer abandoned this proposal',
  CREATE_ORDER: 'order creation executed',
  MARK_PAID: 'order awaiting customer payment',
  FAIL: 'unrecoverable error',
};

/* ------------------------------------------------------------------ */
/* Approval binding helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * When plan terms change, the prior approval is dropped and the PR goes back
 * to READY_FOR_REVIEW (or CHANGES_REQUESTED if it was already approved).
 */
export function invalidateApproval(pr: MealPR): MealPR {
  const next = clone(pr);
  const wasApproved = next.status === 'APPROVED';
  next.approval = {
    approved: false,
    version: null,
    fingerprint: null,
    approvedAt: null,
    note: 'invalidated: plan terms changed after approval',
  };
  next.status = wasApproved ? 'READY_FOR_REVIEW' : next.status;
  if (wasApproved) {
    next.changes.push({
      version: next.version,
      at: new Date().toISOString(),
      kind: 'revised',
      note: 'approval invalidated automatically: plan terms no longer match the approved fingerprint',
    });
  }
  return touch(next);
}

export interface ExecutableGate {
  ok: boolean;
  reason: string;
  detail: string;
}

/**
 * F09 — the write-side guard. Everything that must be true before the words
 * `create-order` are allowed to leave the process.
 */
export function assertExecutable(pr: MealPR): ExecutableGate {
  const fail = (reason: string, detail: string): ExecutableGate => ({ ok: false, reason, detail });

  if (pr.mode !== 'LIVE') return fail('demo-mode', 'DEMO PRs can only produce a simulated order; the real create-order tool is never invoked.');
  if (pr.status !== 'APPROVED') return fail('not-approved', `status is ${pr.status}, execution requires APPROVED.`);
  if (!pr.priceQuote.calculated) return fail('price-not-calculated', 'the payable amount was not returned by a live calculate-price call.');
  if (pr.items.length === 0) return fail('empty-plan', 'there is nothing to order.');
  if (!pr.store?.id) return fail('no-store', 'no resolved store id.');
  if (!pr.fulfillment) return fail('no-fulfillment', 'pickup/delivery is unresolved.');

  const unchecked = pr.coupons.filter((c) => !c.verified || c.source !== 'mcp');
  if (unchecked.length > 0) return fail('unverified-coupon', `coupons not confirmed by a live coupon query: ${unchecked.map((c) => c.id).join(', ')}`);

  const check = approvalIsValid(pr);
  if (!check.valid) {
    return fail(check.reason, `approved fingerprint ${check.approved ? shortFingerprint(check.approved) : '(none)'} != current ${shortFingerprint(check.current)}`);
  }

  return { ok: true, reason: 'ok', detail: 'all execution preconditions satisfied' };
}

/** Bump the version — callers must do this whenever plan terms change. */
export function bumpVersion(pr: MealPR): MealPR {
  const next = clone(pr);
  next.version = next.version + 1;
  return touch(next);
}
