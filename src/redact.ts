/**
 * Sensitive-data scanner — PRD 7.4 / test T12.
 *
 * Used in two places: (1) checking files before they are shared/committed,
 * (2) wrapping any text that goes into a share card or a log line.
 * It fails closed: a match means "stop and redact", never "looks fine".
 */
export interface Finding {
  rule: string;
  severity: 'critical' | 'high' | 'medium';
  line: number;
  excerpt: string;
}

export interface ScanResult {
  clean: boolean;
  findings: Finding[];
  scannedLines: number;
  /** True when the path is a known fixture holder and was exempted. */
  skippedAsFixture?: boolean;
}

interface Rule {
  id: string;
  severity: Finding['severity'];
  pattern: RegExp;
  mask: (match: string, ...groups: string[]) => string;
}

const RULES: Rule[] = [
  {
    id: 'bearer-token',
    severity: 'critical',
    pattern: /Bearer\s+[A-Za-z0-9._\-]{12,}/g,
    mask: () => 'Bearer ***REDACTED***',
  },
  {
    id: 'mcp-token-assignment',
    severity: 'critical',
    pattern: /(MCD_MCP_TOKEN|MCP_TOKEN|mcp[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9._\-]{12,})["']?/gi,
    mask: (_m: string, key: string, val: string) => `${key}=***REDACTED***(${val.length} chars)`,
  },
  {
    id: 'authorization-header-literal',
    severity: 'critical',
    pattern: /"Authorization"\s*:\s*"Bearer\s+[A-Za-z0-9._\-]{12,}"/gi,
    mask: () => '"Authorization": "Bearer ***REDACTED***"',
  },
  {
    id: 'cn-mobile',
    severity: 'high',
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    mask: (m) => `${m.slice(0, 3)}****${m.slice(-4)}`,
  },
  {
    id: 'email',
    severity: 'high',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    mask: (m) => {
      const parts = m.split('@');
      const user = parts[0] ?? '';
      const tail = (parts[1] ?? '').split('.')[0] ?? '';
      return `${user.slice(0, 2)}***@***.${tail.slice(-2) || 'com'}`;
    },
  },
  {
    id: 'cn-id-card',
    severity: 'critical',
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    mask: (m) => `${m.slice(0, 6)}********${m.slice(-4)}`,
  },
  {
    id: 'detailed-address',
    severity: 'medium',
    pattern: /(省|市|区|县|街道|路|号|栋|单元|室|号楼)[\u4e00-\u9fa5A-Za-z0-9]{0,20}(号|室|栋|单元)/g,
    mask: () => '[address redacted]',
  },
  {
    id: 'payment-url',
    severity: 'high',
    pattern: /https?:\/\/[^\s"'<>]*(?:pay|payment|cashier|checkout)[^\s"'<>]*/gi,
    mask: () => '[payment link redacted]',
  },
  {
    id: 'long-hex-or-jwt',
    severity: 'high',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    mask: () => '[JWT redacted]',
  },
];

function redactRule(text: string, rule: Rule): string {
  return text.replace(rule.pattern, (...args: unknown[]) => {
    const raw = args[0] as string;
    const groups = args.slice(1, args.length - 2) as string[];
    const result = rule.mask(raw, ...(groups as [string, string]));
    return result;
  });
}

/** Replace every secret-shaped substring with a masked form. */
export function redact(text: string): { text: string; hits: number } {
  let out = text;
  let hits = 0;
  for (const rule of RULES) {
    const before = out;
    out = redactRule(out, rule);
    if (out !== before) hits += (before.match(rule.pattern) ?? []).length;
  }
  return { text: out, hits };
}

/**
 * Paths whose contents are *intentionally* fake: unit-test fixtures and the
 * bundled demo data. `tests/redact.test.ts` skips the same set when it walks
 * the repo — keep the two in sync or the CLI and the test will disagree.
 */
export const FIXTURE_PATH_RE = /(?:^|\/)(?:tests|fixtures)\//;

export function isFixturePath(path: string): boolean {
  return FIXTURE_PATH_RE.test(path.replace(/\\/g, '/'));
}

export interface ScanOptions {
  /**
   * Treat fixture paths (`tests/`, `fixtures/`) as clean. Default `true`:
   * those files exist precisely to hold obviously-fake tokens and phone
   * numbers so the rules can be tested. Pass `false` for a strict audit.
   */
  allowFixtures?: boolean;
}

/** Scan text and report findings (does not modify). */
export function scan(text: string, filename = '<input>', opts: ScanOptions = {}): ScanResult {
  if (opts.allowFixtures !== false && isFixturePath(filename)) {
    return { clean: true, findings: [], scannedLines: text.split('\n').length, skippedAsFixture: true };
  }
  const findings: Finding[] = [];
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (/^\s*\/\//.test(line) && /example|sample/i.test(line)) return;
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      const local = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((m = local.exec(line))) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          line: idx + 1,
          excerpt: `${filename}:${idx + 1} ${m[0].slice(0, 12)}… (${m[0].length} chars)`,
        });
        if (m[0].length === 0) local.lastIndex++;
      }
    }
  });
  return { clean: findings.length === 0, findings, scannedLines: lines.length };
}

/** Fields allowed in a share card / README screenshot (PRD 4.1). */
export function sanitizeForShare<T extends Record<string, unknown>>(obj: T): unknown {
  const deny = [
    /token/i, /secret/i, /password/i, /phone/i, /mobile/i, /email/i,
    /address/i, /payurl/i, /payment/i, /payUrl/i, /orderId/i, /orderid/i,
    /openid/i, /userid/i, /member/i, /nickname/i, /realname/i, /idcard/i,
  ];
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (deny.some((re) => re.test(k))) out[k] = '[redacted]';
        else out[k] = walk(v);
      }
      return out;
    }
    if (typeof value === 'string') return redact(value).text;
    return value;
  };
  return walk(obj);
}

export const RULE_IDS = RULES.map((r) => r.id);
