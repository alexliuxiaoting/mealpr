#!/usr/bin/env node
/* MealPR generated artifact — edit src/ instead. */

// src/entries/redact.ts
import { readFileSync as readFileSync2 } from "node:fs";

// src/redact.ts
var RULES = [
  {
    id: "bearer-token",
    severity: "critical",
    pattern: /Bearer\s+[A-Za-z0-9._\-]{12,}/g,
    mask: () => "Bearer ***REDACTED***"
  },
  {
    id: "mcp-token-assignment",
    severity: "critical",
    pattern: /(MCD_MCP_TOKEN|MCP_TOKEN|mcp[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9._\-]{12,})["']?/gi,
    mask: (_m, key, val) => `${key}=***REDACTED***(${val.length} chars)`
  },
  {
    id: "authorization-header-literal",
    severity: "critical",
    pattern: /"Authorization"\s*:\s*"Bearer\s+[A-Za-z0-9._\-]{12,}"/gi,
    mask: () => '"Authorization": "Bearer ***REDACTED***"'
  },
  {
    id: "cn-mobile",
    severity: "high",
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    mask: (m) => `${m.slice(0, 3)}****${m.slice(-4)}`
  },
  {
    id: "email",
    severity: "high",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    mask: (m) => {
      const parts = m.split("@");
      const user = parts[0] ?? "";
      const tail = (parts[1] ?? "").split(".")[0] ?? "";
      return `${user.slice(0, 2)}***@***.${tail.slice(-2) || "com"}`;
    }
  },
  {
    id: "cn-id-card",
    severity: "critical",
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    mask: (m) => `${m.slice(0, 6)}********${m.slice(-4)}`
  },
  {
    id: "detailed-address",
    severity: "medium",
    pattern: /(省|市|区|县|街道|路|号|栋|单元|室|号楼)[\u4e00-\u9fa5A-Za-z0-9]{0,20}(号|室|栋|单元)/g,
    mask: () => "[address redacted]"
  },
  {
    id: "payment-url",
    severity: "high",
    pattern: /https?:\/\/[^\s"'<>]*(?:pay|payment|cashier|checkout)[^\s"'<>]*/gi,
    mask: () => "[payment link redacted]"
  },
  {
    id: "long-hex-or-jwt",
    severity: "high",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    mask: () => "[JWT redacted]"
  }
];
function redactRule(text2, rule) {
  return text2.replace(rule.pattern, (...args2) => {
    const raw = args2[0];
    const groups = args2.slice(1, args2.length - 2);
    const result2 = rule.mask(raw, ...groups);
    return result2;
  });
}
function redact(text2) {
  let out2 = text2;
  let hits = 0;
  for (const rule of RULES) {
    const before = out2;
    out2 = redactRule(out2, rule);
    if (out2 !== before) hits += (before.match(rule.pattern) ?? []).length;
  }
  return { text: out2, hits };
}
var FIXTURE_PATH_RE = /(?:^|\/)(?:tests|fixtures)\//;
function isFixturePath(path) {
  return FIXTURE_PATH_RE.test(path.replace(/\\/g, "/"));
}
function scan(text2, filename = "<input>", opts = {}) {
  if (opts.allowFixtures !== false && isFixturePath(filename)) {
    return { clean: true, findings: [], scannedLines: text2.split("\n").length, skippedAsFixture: true };
  }
  const findings = [];
  const lines = text2.split("\n");
  lines.forEach((line, idx) => {
    if (/^\s*\/\//.test(line) && /example|sample/i.test(line)) return;
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m;
      const local = new RegExp(rule.pattern.source, rule.pattern.flags);
      while (m = local.exec(line)) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          line: idx + 1,
          excerpt: `${filename}:${idx + 1} ${m[0].slice(0, 12)}\u2026 (${m[0].length} chars)`
        });
        if (m[0].length === 0) local.lastIndex++;
      }
    }
  });
  return { clean: findings.length === 0, findings, scannedLines: lines.length };
}
var RULE_IDS = RULES.map((r) => r.id);

// src/entries/_io.ts
import { readFileSync } from "node:fs";
function readInput() {
  const args2 = process.argv.slice(2);
  for (let i = 0; i < args2.length; i++) {
    if ((args2[i] === "--file" || args2[i] === "-f") && args2[i + 1]) {
      const content = readFileSync(args2[i + 1], "utf8");
      return args2[i + 1].endsWith(".json") ? JSON.parse(content) : content;
    }
  }
  const positional = args2.find((a) => !a.startsWith("-"));
  if (positional) return positional;
  const raw = readFileSync(0, "utf8");
  if (!raw.trim()) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  process.stdout.write("\n");
}

// src/entries/redact.ts
var args = process.argv.slice(2);
var modeIdx = args.indexOf("--mode");
var mode = modeIdx === -1 ? "redact" : args[modeIdx + 1] ?? "redact";
var allowNonCritical = args.includes("--allow-noncritical");
var strict = args.includes("--strict");
var fileIdx = args.indexOf("--file");
var targetFile = fileIdx === -1 ? null : args[fileIdx + 1] ?? null;
var text = targetFile ? readFileSync2(targetFile, "utf8") : (() => {
  const input = readInput();
  return typeof input === "string" ? input : input.text ?? "";
})();
if (!text.trim()) {
  out({ ok: false, error: "usage: node redact.mjs --file <path> [--mode scan|redact]" });
  process.exit(1);
}
if (mode === "redact") {
  const r = redact(text);
  out({ ok: true, hits: r.hits, text: r.text });
  process.exit(0);
}
var result = scan(text, targetFile ?? "<stdin>", { allowFixtures: !strict });
var critical = result.findings.filter((f) => f.severity === "critical" || f.severity === "high");
var blocking = allowNonCritical ? result.findings.filter((f) => f.severity === "critical") : critical;
out({
  ok: blocking.length === 0,
  rules: RULE_IDS,
  scannedLines: result.scannedLines,
  ...result.skippedAsFixture ? { skippedAsFixture: true } : {},
  findings: result.findings,
  blockingCount: blocking.length,
  verdict: result.skippedAsFixture ? "SKIPPED \u2014 known fixture path (tests/ or fixtures/). Re-run with --strict to audit it anyway." : blocking.length === 0 ? "CLEAN \u2014 safe to share/commit." : `BLOCKED \u2014 ${blocking.length} sensitive finding(s). Redact before sharing. Run: node redact.mjs --file <path>`
});
process.exit(blocking.length === 0 ? 0 : 1);
