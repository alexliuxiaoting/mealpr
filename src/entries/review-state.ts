#!/usr/bin/env node
/**
 * review-state.mjs — F08 / F09 state machine + approval binding
 *   node review-state.mjs --file input.json
 *
 * Input:  { pr, action: SUBMIT_FOR_REVIEW|REQUEST_CHANGES|REVISE|APPROVE|REJECT|CREATE_ORDER|MARK_PAID|FAIL, order?, note? }
 * Output: { ok, status, message, pr }
 *
 * Also exposes the read-only helpers:
 *   { pr, inspect: "executable" }   -> gate result for calling create-order
 *   { pr, inspect: "actions" }      -> allowed actions in the current status
 */
import { parseMealPR, type Status } from '../types.js';
import { allowedActions, applyAction, assertExecutable, nextStatus, type Action } from '../review-state.js';
import { approvalIsValid, computeFingerprint } from '../fingerprint.js';
import { readInput, out } from './_io.js';

interface Input {
  pr?: unknown;
  action?: Action;
  inspect?: 'executable' | 'actions' | 'approval';
  order?: Record<string, unknown>;
  note?: string;
}

const input = readInput<Input>();
const prPayload = input && input.pr !== undefined ? input.pr : input;
if (!prPayload || typeof prPayload !== 'object') {
  out({ ok: false, error: 'usage: node review-state.mjs --file input.json  // { pr, action?, inspect? } or a bare PR' });
  process.exit(1);
}

const pr = parseMealPR(prPayload);

if (input.inspect === 'executable') {
  const gate = assertExecutable(pr);
  out({ inspect: 'executable', ...gate });
  process.exit(0);
}
if (input.inspect === 'actions') {
  out({ ok: true, inspect: 'actions', status: pr.status, allowed: allowedActions(pr.status) });
  process.exit(0);
}
if (input.inspect === 'approval') {
  out({ ok: true, inspect: 'approval', currentFingerprint: computeFingerprint(pr), ...approvalIsValid(pr) });
  process.exit(0);
}

if (!input.action) {
  out({ ok: false, error: 'missing action', allowed: allowedActions(pr.status) });
  process.exit(1);
}

const result = applyAction(pr, input.action, {
  note: input.note,
  order: input.order as never,
});

out({
  ok: result.ok,
  from: pr.status as Status,
  to: result.status,
  message: result.message,
  pr: result.pr,
  transitionAllowed: nextStatus(pr.status, input.action) !== null,
});
process.exit(result.ok ? 0 : 2);
