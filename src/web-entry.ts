/**
 * Browser entry — the exact same core the Skill scripts use.
 *
 * The P1 review page is not a mock-up: its Approve button, its disabled-action
 * list and its execution gate run this code, so the page cannot show a state
 * transition the Skill would refuse.
 */
export { applyAction, assertExecutable, allowedActions, canTransition, invalidateApproval } from './review-state.js';
export type { Action } from './review-state.js';
export { buildValidationSet } from './validate.js';
export { diffPRs } from './diff.js';
export { renderPR } from './render.js';
export { computeFingerprint, shortFingerprint, approvalIsValid } from './fingerprint.js';
export { parseMealPR, safeParseMealPR } from './types.js';
export { MCP_FIELD_FACTS } from './mcp-adapt.js';
