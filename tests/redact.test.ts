/**
 * PRD 7.4 / T12 — nothing sensitive may reach logs, share cards or the repo.
 * The last test walks the actual repository files.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { redact, sanitizeForShare, scan, RULE_IDS, isFixturePath } from '../src/redact.js';
import { renderPR } from '../src/render.js';
import { repoRoot, demoPR, asLive } from './helpers.js';

describe('T12 - redaction', () => {
  it('masks bearer tokens', () => {
    const { text, hits } = redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9abcdefghijk');
    expect(hits).toBeGreaterThan(0);
    expect(text).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
    expect(text).toMatch(/REDACTED/);
  });

  it('masks token assignments', () => {
    const { text } = redact('MCD_MCP_TOKEN=abc123def456ghi789');
    expect(text).not.toMatch(/abc123def456ghi789/);
    expect(text).toMatch(/REDACTED/);
  });

  it('masks mainland mobile numbers', () => {
    const { text } = redact('联系电话：13812345678');
    expect(text).not.toMatch(/13812345678/);
    expect(text).toMatch(/138\*\*\*\*5678/);
  });

  it('masks email addresses', () => {
    const { text } = redact('mail me at someone@example.com please');
    expect(text).not.toMatch(/someone@example\.com/);
  });

  it('masks payment links', () => {
    const { text } = redact('pay here: https://pay.example.com/cashier?order=123');
    expect(text).not.toMatch(/pay\.example\.com/);
    expect(text).toMatch(/payment link redacted/);
  });

  it('scan() fails closed on sensitive input', () => {
    const res = scan('Bearer abcdef1234567890\nphone 13900001111');
    expect(res.clean).toBe(false);
    expect(res.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('exempts fixture paths so pre-commit scanning does not flag its own fixtures', () => {
    expect(isFixturePath('tests/redact.test.ts')).toBe(true);
    expect(isFixturePath('mealpr/fixtures/demo-team.json')).toBe(true);
    expect(isFixturePath('README.md')).toBe(false);
    expect(isFixturePath('src/redact.ts')).toBe(false);

    // Default: fixture holders are exempt (their fakes are the point).
    const exempt = scan('Bearer abcdef1234567890', 'tests/redact.test.ts');
    expect(exempt.skippedAsFixture).toBe(true);
    expect(exempt.clean).toBe(true);

    // --strict / allowFixtures:false still sees the finding — the exemption
    // must never become a blind spot.
    const strictRes = scan('Bearer abcdef1234567890', 'tests/redact.test.ts', { allowFixtures: false });
    expect(strictRes.skippedAsFixture).toBeUndefined();
    expect(strictRes.clean).toBe(false);
  });

  it('scan() passes clean text', () => {
    const res = scan('这是一段完全正常的说明文本，没有任何凭据。');
    expect(res.clean).toBe(true);
  });

  it('share output strips identifiers, payment links and contacts', () => {
    const pr = asLive(demoPR('demo-team'));
    const withOrder = {
      ...pr,
      order: { ...pr.order, orderId: 'MCD-REAL-ORDER-9', payUrl: 'https://pay.example.com/x', payable: 53 },
    };
    const shared = sanitizeForShare(withOrder as unknown as Record<string, unknown>) as Record<string, unknown>;
    const flat = JSON.stringify(shared);
    expect(flat).not.toMatch(/MCD-REAL-ORDER-9/);
    expect(flat).not.toMatch(/pay\.example\.com/);
    expect(flat).toMatch(/redacted/);
    // But the reviewable substance survives
    expect(flat).toMatch(/feat: 项目上线庆功双人餐/);
  });

  it('rendered PR never prints an order id into the share payload', () => {
    const md = renderPR(asLive(demoPR('demo-team')));
    expect(md).toMatch(/### Validation/);
    expect(md).not.toMatch(/sk-[A-Za-z0-9]{12,}/);
  });

  it('the repository ships no credentials or personal data', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (['node_modules', '.git', '.npm-cache', 'dist', '.workbuddy'].includes(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(md|json|example|ts)$/.test(entry)) out.push(full);
      }
      return out;
    };
    const files = walk(repoRoot);
    const offenders: string[] = [];
    for (const file of files) {
      // Same rule the CLI applies, so `node redact.mjs --mode scan` and this
      // test can never disagree about what counts as a fixture.
      const res = scan(readFileSync(file, 'utf8'), file.replace(repoRoot, '.'));
      const blocking = res.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
      if (blocking.length > 0) offenders.push(`${file}: ${blocking.map((b) => `${b.rule}@${b.line}`).join(', ')}`);
    }
    expect(offenders).toEqual([]);
    expect(existsSync(join(repoRoot, 'mcp-config.example.json'))).toBe(true);
    expect(RULE_IDS.length).toBeGreaterThan(5);
  });
});
