/**
 * MCP failure taxonomy and recovery policy — PRD 5.4.
 *
 * Read tools may be retried with a bounded backoff. Write tools (order
 * creation) are NEVER auto-retried: an unknown outcome must be resolved by
 * querying the order first, and if that fails, by handing control to the human.
 */
import type { Status } from './types.js';

export type ErrorKind =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'SERVER_UNAVAILABLE'
  | 'STORE_UNAVAILABLE'
  | 'ITEM_UNAVAILABLE'
  | 'COUPON_UNAVAILABLE'
  | 'PRICE_MISMATCH'
  | 'ORDER_RESULT_UNKNOWN'
  | 'ORDER_CREATE_FAILED'
  | 'VALIDATION'
  | 'UNKNOWN';

export interface McpErrorShape {
  status?: number;
  code?: string | number;
  message?: string;
  tool?: string;
  timedOut?: boolean;
}

export interface ClassifiedError {
  kind: ErrorKind;
  retryable: boolean;
  backoffMs: number;
  userMessage: string;
  operatorNote: string;
  /** Status the PR should fall back to when this error is fatal. */
  failTo?: Status;
}

const BASE_BACKOFF = 1500;

const TEMPLATES: Record<ErrorKind, Pick<ClassifiedError, 'retryable' | 'backoffMs' | 'userMessage' | 'operatorNote' | 'failTo'>> = {
  AUTH: {
    retryable: false,
    backoffMs: 0,
    userMessage: 'MCP Token 无效、已过期或未配置。请到 open.mcd.cn 重新申请 Token，并在客户端 MCP 配置里更新 Authorization 头。在此之前我不会用任何猜测的数据下单。',
    operatorNote: 'HTTP 401 — do not fall back to mock data silently; switch the user into DEMO mode only with their consent.',
  },
  RATE_LIMIT: {
    retryable: true,
    backoffMs: BASE_BACKOFF,
    userMessage: '触发 MCP 限流（单 Token 每分钟 600 次）。我已退避等待，稍后自动重试。',
    operatorNote: 'HTTP 429 — exponential backoff, cap retries.',
  },
  TIMEOUT: {
    retryable: true,
    backoffMs: BASE_BACKOFF,
    userMessage: 'MCP 请求超时。读请求会有限重试；如果这是下单请求，我不会自动重发。',
    operatorNote: 'Timeout on a READ may retry; timeout on create-order must go to the unknown-outcome path.',
  },
  SERVER_UNAVAILABLE: {
    retryable: true,
    backoffMs: BASE_BACKOFF * 2,
    userMessage: '麦当劳 MCP Server 暂时不可用。稍后重试，或先用 `DEMO` 模式体验完整流程。',
    operatorNote: 'Network/5xx — bounded retry then give up with a clear message.',
  },
  STORE_UNAVAILABLE: {
    retryable: false,
    backoffMs: 0,
    userMessage: '该门店当前不可用于下单（休息/暂停接单）。请换一家门店。',
    operatorNote: 'Pick another store from query-nearby-stores / delivery-query-stores.',
  },
  ITEM_UNAVAILABLE: {
    retryable: false,
    backoffMs: 0,
    userMessage: '方案中有商品已下架或售罄，正在用菜单里的在售替代品重新提案。',
    operatorNote: 'Re-run planning against the fresh query-meals result; bump version.',
  },
  COUPON_UNAVAILABLE: {
    retryable: false,
    backoffMs: 0,
    userMessage: '该优惠券已不可用或已过期，正在按无券价格重新计算，并把差额展示给你。',
    operatorNote: 'Drop the coupon, recalculate, bump version, show diff. Never re-price silently.',
  },
  PRICE_MISMATCH: {
    retryable: false,
    backoffMs: 0,
    userMessage: '重新询价后应付金额与你批准时不一致，已自动撤销你的批准并回到待审核状态。',
    operatorNote: 'Version bump + invalidateApproval; reason quoted to the user.',
  },
  ORDER_RESULT_UNKNOWN: {
    retryable: false,
    backoffMs: 0,
    userMessage: '下单请求结果未知（可能已经创建成功）。我不会重复下单，先查询订单状态确认后再告诉你结果。',
    operatorNote: 'CRITICAL: query-order first. No blind retry. Escalate to human.',
    failTo: 'FAILED',
  },
  ORDER_CREATE_FAILED: {
    retryable: false,
    backoffMs: 0,
    userMessage: '订单创建失败，未产生扣款。请确认后我再重试，你可以先看看是不是商品或地址有问题。',
    operatorNote: 'Require a fresh explicit instruction before another attempt.',
    failTo: 'FAILED',
  },
  VALIDATION: {
    retryable: false,
    backoffMs: 0,
    userMessage: '输入不符合工具要求。我不会反复猜测参数，请让我用实际的工具描述修正后再试。',
    operatorNote: 'Read the real tool schema from the MCP client instead of guessing.',
  },
  UNKNOWN: {
    retryable: false,
    backoffMs: 0,
    userMessage: '发生了未分类的错误。我不会在高风险路径上自动重试，请把报错原文发我以便分类处理。',
    operatorNote: 'Unclassified — treat as high risk, stop.',
  },
};

export function classifyError(err: McpErrorShape, opts: { tool?: string } = {}): ClassifiedError {
  const tool = err.tool ?? opts.tool ?? '';
  const isWrite = tool === 'create-order' || tool === 'mall-create-order' || tool === 'party-order-create' || tool === 'cancel-order' || tool === 'auto-bind-coupons';
  const message = (err.message ?? '').toLowerCase();

  let kind: ErrorKind = 'UNKNOWN';
  if (err.status === 401 || err.code === 401 || / unauthorized|invalid token|token expired|401/.test(message)) kind = 'AUTH';
  else if (err.status === 429 || /rate limit|too many requests|429/.test(message)) kind = 'RATE_LIMIT';
  else if (err.timedOut || /timeout|etimedout|abort/.test(message)) kind = 'TIMEOUT';
  else if (err.status === 403 || err.status === 404) kind = 'SERVER_UNAVAILABLE';
  else if (typeof err.status === 'number' && err.status >= 500) kind = 'SERVER_UNAVAILABLE';
  else if (/network|econnreset|fetch failed|getaddrinfo|unavailable/.test(message)) kind = 'SERVER_UNAVAILABLE';
  else if (/store.{0,6}(closed|unavailable|not support)|门店/.test(message)) kind = 'STORE_UNAVAILABLE';
  else if (/sold out|下架|售罄|discontinued|not available.{0,10}item|商品/.test(message)) kind = 'ITEM_UNAVAILABLE';
  else if (/coupon|券/.test(message)) kind = 'COUPON_UNAVAILABLE';
  else if (/price|金额|变价/.test(message)) kind = 'PRICE_MISMATCH';
  else if (/param|schema|invalid argument|missing required|required field/.test(message)) kind = 'VALIDATION';

  // Write-path overrides: uncertainty must never become an automatic retry.
  if (isWrite) {
    if (kind === 'TIMEOUT' || kind === 'SERVER_UNAVAILABLE') kind = 'ORDER_RESULT_UNKNOWN';
    else if (kind !== 'AUTH' && kind !== 'VALIDATION') kind = 'ORDER_CREATE_FAILED';
  }

  const tpl = TEMPLATES[kind];
  return { kind, ...tpl };
}

export interface RetryPolicy {
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

export const READ_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseBackoffMs: BASE_BACKOFF, maxBackoffMs: 8000 };
export const WRITE_RETRY_POLICY: RetryPolicy = { maxAttempts: 1, baseBackoffMs: 0, maxBackoffMs: 0 };

export function policyFor(tool: string): RetryPolicy {
  const writes = ['create-order', 'mall-create-order', 'party-order-create', 'cancel-order', 'auto-bind-coupons'];
  return writes.includes(tool) ? WRITE_RETRY_POLICY : READ_RETRY_POLICY;
}

export function backoffFor(attempt: number, policy: RetryPolicy): number {
  const raw = policy.baseBackoffMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(policy.maxBackoffMs, raw + jitter);
}
