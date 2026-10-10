/** F08 — state machine legality. */
import { describe, expect, it } from 'vitest';
import { allowedActions, applyAction, assertExecutable, canTransition, invalidateApproval, isTerminal, nextStatus } from '../src/review-state.js';
import { approvalIsValid, computeFingerprint } from '../src/fingerprint.js';
import { demoPR, asLive, approvedLivePR } from './helpers.js';

const draft = asLive(demoPR('demo-team'));

describe('T05 - nothing executes without an explicit approval', () => {
  it('refuses CREATE_ORDER from DRAFT', () => {
    expect(canTransition('DRAFT', 'CREATE_ORDER')).toBe(false);
    const r = applyAction(draft, 'CREATE_ORDER');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/BLOCKED/);
  });

  it('refuses CREATE_ORDER even from READY_FOR_REVIEW', () => {
    const r1 = applyAction(draft, 'SUBMIT_FOR_REVIEW');
    expect(r1.ok).toBe(true);
    expect(r1.pr.status).toBe('READY_FOR_REVIEW');
    expect(canTransition('READY_FOR_REVIEW', 'CREATE_ORDER')).toBe(false);
    expect(allowedActions('READY_FOR_REVIEW')).not.toContain('CREATE_ORDER');
  });

  it('blocks the execution gate until the human approved', () => {
    const submitted = applyAction(draft, 'SUBMIT_FOR_REVIEW').pr;
    const gate = assertExecutable(submitted);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('not-approved');
  });

  it('will not review or approve a plan whose payable was never calculated', () => {
    const unpriced = { ...draft, priceQuote: { ...draft.priceQuote, calculated: false, payable: null, unverifiedReason: 'calculate-price 429' } };
    const submitted = applyAction(unpriced, 'SUBMIT_FOR_REVIEW');
    expect(submitted.ok).toBe(false);
    expect(submitted.message).toMatch(/payable amount was never returned|BLOCKED/);
    const approved = applyAction({ ...unpriced, validations: [] }, 'APPROVE');
    expect(approved.ok).toBe(false);
    expect(approved.message).toMatch(/BLOCKED/);
  });
});

describe('T06/T07 - approval is bound to one exact version', () => {
  const approved = () => approvedLivePR('demo-team');

  it('records the fingerprint at approval time', () => {
    const pr = approved();
    expect(pr.status).toBe('APPROVED');
    expect(pr.approval.approved).toBe(true);
    expect(pr.approval.fingerprint).toBe(computeFingerprint(pr));
    expect(approvalIsValid(pr).valid).toBe(true);
    expect(assertExecutable(pr).ok).toBe(true);
  });

  it('T06 — changing an item voids the approval', () => {
    const pr = approved();
    const mutated = { ...pr, items: pr.items.map((i, idx) => (idx === 0 ? { ...i, quantity: i.quantity + 1 } : i)) };
    expect(approvalIsValid(mutated).valid).toBe(false);
    expect(assertExecutable(mutated).reason).toBe('plan-changed-after-approval');
    const after = invalidateApproval(mutated);
    expect(after.status).toBe('READY_FOR_REVIEW');
    expect(after.approval.approved).toBe(false);
  });

  it('T07 — changing the price voids the approval', () => {
    const pr = approved();
    const repriced = { ...pr, priceQuote: { ...pr.priceQuote, payable: (pr.priceQuote.payable ?? 0) + 5 } };
    expect(approvalIsValid(repriced).reason).toBe('plan-changed-after-approval');
    const gate = assertExecutable(repriced);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('plan-changed-after-approval');
  });

  it('changing the store or fulfillment voids the approval', () => {
    const pr = approved();
    expect(assertExecutable({ ...pr, store: { ...pr.store!, id: 'STORE-OTHER' } }).reason).toBe('plan-changed-after-approval');
    expect(assertExecutable({ ...pr, fulfillment: 'delivery' }).reason).toBe('plan-changed-after-approval');
  });

  it('an unverified coupon voids the approval', () => {
    const pr = approved();
    const badCoupon = { ...pr, coupons: pr.coupons.map((c) => ({ ...c, verified: false, source: 'unknown' as const })) };
    expect(assertExecutable(badCoupon).reason).toBe('unverified-coupon');
  });

  it('DEMO mode can be approved but never executed', () => {
    const demo = applyAction(applyAction(demoPR('demo-team'), 'SUBMIT_FOR_REVIEW').pr, 'APPROVE');
    expect(demo.ok).toBe(true);
    expect(demo.pr.status).toBe('APPROVED');
    expect(assertExecutable(demo.pr).reason).toBe('demo-mode');
  });
});

describe('T08 - duplicate order protection', () => {
  it('rejects a second create-order attempt for the same successful fingerprint', () => {
    const pr = approvedLivePR('demo-team');
    const first = applyAction(pr, 'CREATE_ORDER', { order: { orderId: 'ORDER-1', status: 'CREATED', payable: pr.priceQuote.payable } });
    expect(first.ok).toBe(true);
    expect(first.pr.status).toBe('ORDER_CREATED');

    // A second explicit attempt on the created order is not even a legal transition.
    const second = applyAction(first.pr, 'CREATE_ORDER');
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/BLOCKED/);

    // And even if the status were reset, the attempt ledger stops it.
    const replay = applyAction({ ...pr, status: 'APPROVED', order: first.pr.order }, 'CREATE_ORDER');
    expect(replay.ok).toBe(false);
    expect(replay.message).toMatch(/duplicate order attempt/);
  });

  it('records each attempt in the order ledger', () => {
    const pr = approvedLivePR('demo-team');
    const res = applyAction(pr, 'CREATE_ORDER', { order: { orderId: 'ORDER-2', status: 'CREATED' } });
    expect(res.pr.order.attempts).toHaveLength(1);
    expect(res.pr.order.attempts[0]?.outcome).toBe('SUCCESS');
    expect(res.pr.order.requestFingerprint).toBe(pr.approval.fingerprint);
  });
});

describe('terminal states', () => {
  it('REJECTED and FAILED are terminal', () => {
    expect(isTerminal('REJECTED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(allowedActions('REJECTED')).toEqual([]);
    expect(nextStatus('REJECTED', 'APPROVE')).toBeNull();
  });

  it('REQUEST_CHANGES clears the stored approval', () => {
    const pr = approvedLivePR('demo-team');
    const res = applyAction(pr, 'REQUEST_CHANGES', { note: '换无糖饮料' });
    expect(res.ok).toBe(true);
    expect(res.pr.status).toBe('CHANGES_REQUESTED');
    expect(res.pr.approval.fingerprint).toBeNull();
  });

  it('re-approving the revised plan re-binds the fingerprint', () => {
    const changed = applyAction(approvedLivePR('demo-team'), 'REQUEST_CHANGES').pr;
    const revised = { ...changed, version: changed.version + 1, items: changed.items.map((i) => ({ ...i, quantity: 1 })) };
    expect(approvalIsValid(revised).valid).toBe(false);

    const resubmitted = applyAction(revised, 'REVISE');
    expect(resubmitted.ok).toBe(true);
    const reapproved = applyAction(resubmitted.pr, 'APPROVE').pr;
    expect(reapproved.status).toBe('APPROVED');
    expect(approvalIsValid(reapproved).valid).toBe(true);
    expect(assertExecutable(reapproved).ok).toBe(true);
  });
});
