/** PRD 5.4 — read tools may retry; write tools never do. */
import { describe, expect, it } from 'vitest';
import { classifyError, policyFor, backoffFor, READ_RETRY_POLICY, WRITE_RETRY_POLICY } from '../src/mcp-errors.js';

describe('T09 - MCP failure handling', () => {
  it('401 asks for a new token instead of falling back to mock data', () => {
    const c = classifyError({ status: 401, message: 'Unauthorized', tool: 'query-meals' });
    expect(c.kind).toBe('AUTH');
    expect(c.retryable).toBe(false);
    expect(c.userMessage).toMatch(/Token/);
    expect(c.userMessage).not.toMatch(/模拟数据顶上|假装成功/);
  });

  it('429 backs off and may retry a read', () => {
    const c = classifyError({ status: 429, message: 'Too Many Requests', tool: 'query-meals' });
    expect(c.kind).toBe('RATE_LIMIT');
    expect(c.retryable).toBe(true);
    expect(c.backoffMs).toBeGreaterThan(0);
  });

  it('a network failure on a read tool is retryable', () => {
    const c = classifyError({ message: 'fetch failed', tool: 'query-meals' });
    expect(c.kind).toBe('SERVER_UNAVAILABLE');
    expect(c.retryable).toBe(true);
  });

  it('a timeout while CREATING an order becomes an unknown-outcome, never a blind retry', () => {
    const c = classifyError({ timedOut: true, message: 'timeout', tool: 'create-order' });
    expect(c.kind).toBe('ORDER_RESULT_UNKNOWN');
    expect(c.retryable).toBe(false);
    expect(c.userMessage).toMatch(/不会重复下单|查询订单状态/);
  });

  it('a network failure on create-order is also treated as unknown outcome', () => {
    const c = classifyError({ message: 'network error', tool: 'create-order' });
    expect(c.kind).toBe('ORDER_RESULT_UNKNOWN');
    expect(c.retryable).toBe(false);
  });

  it('an explicit create-order failure asks the human before retrying', () => {
    const c = classifyError({ status: 400, message: 'store closed', tool: 'create-order' });
    expect(c.kind).toBe('ORDER_CREATE_FAILED');
    expect(c.retryable).toBe(false);
    expect(c.failTo).toBe('FAILED');
  });

  it('write tools have a no-retry policy', () => {
    expect(policyFor('create-order').maxAttempts).toBe(1);
    expect(policyFor('cancel-order').maxAttempts).toBe(1);
    expect(policyFor('auto-bind-coupons').maxAttempts).toBe(1);
    expect(policyFor('query-meals').maxAttempts).toBe(READ_RETRY_POLICY.maxAttempts);
    expect(backoffFor(1, WRITE_RETRY_POLICY)).toBe(0);
  });

  it('read backoff grows but stays bounded', () => {
    expect(backoffFor(1, READ_RETRY_POLICY)).toBeGreaterThanOrEqual(READ_RETRY_POLICY.baseBackoffMs);
    expect(backoffFor(9, READ_RETRY_POLICY)).toBeLessThanOrEqual(READ_RETRY_POLICY.maxBackoffMs + 250);
  });

  it('coupon failures surface as "not available", never as a silent discount', () => {
    const c = classifyError({ message: 'coupon is not available', tool: 'calculate-price' });
    expect(c.kind).toBe('COUPON_UNAVAILABLE');
    expect(c.userMessage).toMatch(/重新计算|差额/);
  });

  it('price mismatches force a new review', () => {
    const c = classifyError({ message: 'price changed', tool: 'calculate-price' });
    expect(c.kind).toBe('PRICE_MISMATCH');
    expect(c.userMessage).toMatch(/撤销你的批准|重新审核/);
  });

  it('validation errors tell us to read the real tool schema instead of guessing', () => {
    const c = classifyError({ message: 'missing required field: orderItems', tool: 'create-order' });
    expect(c.kind).toBe('VALIDATION');
    expect(c.operatorNote).toMatch(/real tool schema/);
  });
});
