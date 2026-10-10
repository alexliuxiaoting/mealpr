# MealPR — Code Review for Your Meal

**What if your AI had to open a Pull Request before ordering your lunch?**

**MealPR turns McDonald's MCP ordering into a reviewable, human-approved agent workflow.**

A WorkBuddy Skill built on the [McDonald's China MCP Server](https://github.com/M-China/mcd-mcp-server)
for the [McDonald's Developer Innovation Challenge](https://github.com/M-China/mcd-developer-innovation-challenge).

---

## Demo

```
You:   "Order me McDonald's. Two people, under ¥70, prefer coupons, pickup."

MealPR v1
  ├─ Items        Grilled Chicken Burger x2 · Medium Fries x1 · Coke x2
  ├─ Coupon       ¥8 off (verified against a live coupon query)
  ├─ Payable      ¥67.00  ← returned by calculate-price, not estimated
  ├─ Nutrition    PARTIAL — official coverage 67%; no official data for these items: Coke x2
  └─ Status       READY_FOR_REVIEW

You:   "Sugar-free drinks instead, and drop the budget to ¥60."

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
- Coke x2  (M-COLA-M)
+ Sugar-free Coke x2  (M-COLA-ZERO-M)
  Medium Fries x1
- Grilled Chicken Burger x2  (M-GRILLEDCHICKEN)
+ McChicken x2  (M-MCCHICKEN)
@@ Payment @@
- Payable: ¥67.00
+ Payable: ¥53.00
- Budget left: ¥3.00
+ Budget left: ¥7.00
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

You:   "Approve v2."

Execution gate → all checks green → `create-order` → order returned → **you pay**.

The full transcript runs without any MCP token:
[`examples/demo-pr.md`](examples/demo-pr.md) (regenerate with `node mealpr/scripts/demo.mjs all`).

---

## Why

Typical AI ordering assistants have five problems:

- You don't know *why* those particular items were recommended.
- You can't see what the AI changed between turns.
- Budget, discounts and the real payable amount drift apart.
- The AI may decide with incomplete information.
- Nothing stands between "recommendation" and "payment".

MealPR borrows the Pull Request / Code Review ritual from software engineering: the AI queries,
calculates and proposes; **you review, then you approve**.

### Four core ideas

| | |
| --- | --- |
| **Meal Pull Request** | A structured proposal: requirements, changes, price quote, coupons, nutrition, validation checklist, allowed actions |
| **Meal Diff** | Added / removed items, quantity and option changes, coupon changes, payable delta, remaining budget, nutrition delta |
| **Human Approval Gate** | You approve exactly one version; any later substantive change voids it automatically |
| **Reusable review protocol** | `Propose → Validate → Review → Approve → Execute`, decoupled from the ordering platform |

---

## Install

Requires Node.js 20.10+ (only for the deterministic helper scripts) and WorkBuddy.

```bash
npm install && npm run zip     # produces dist/mealpr-skill-v1.1.0.zip
# WorkBuddy → Experts · Skills · Connectors → Skill Market → Add skill → upload the zip
```

Or drop the folder directly:

```bash
cp -r mealpr ~/.workbuddy/skills/mealpr
```

The skill itself ships zero runtime dependencies: `mealpr/scripts/*.mjs` are esbuild bundles that
run straight on Node.

### Configure McDonald's MCP

Copy `mcp-config.example.json` and fill in your token from <https://open.mcd.cn/mcp>:

```json
{
  "mcpServers": {
    "mcd-mcp": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": { "Authorization": "Bearer ${MCD_MCP_TOKEN}" }
    }
  }
}
```

If your client cannot expand environment variables there, configure `MCD_MCP_TOKEN` through the
client's own credential mechanism. **Never commit a plaintext token** — this repo only ever contains
the placeholder.

### Talk to it

```
Order me McDonald's, 2 people, under ¥70, prefer coupons, pickup
Switch to sugar-free drinks, budget down to ¥60
Show diff
Approve v3 and place the order
Actually, forget it
```

Triggers (EN/ZH): `Review my meal`, `Create a meal pull request`, `帮我点麦当劳`, `创建 Meal PR`,
`审核我的点餐方案`, `优化麦当劳订单`.

---

## Demo mode (no token needed)

```bash
node mealpr/scripts/demo.mjs single          # solo ¥40 budget
node mealpr/scripts/demo.mjs team            # team ¥70 + coupon
node mealpr/scripts/demo.mjs coupon-expired  # coupon expires -> re-quote -> blocked by budget
node mealpr/scripts/demo.mjs combo           # combo double-charge trap: blocked -> composition read -> duplicates dropped
node mealpr/scripts/demo.mjs all
```

Demo isolation is structural, not conventional: `assertExecutable()` always returns `ok:false` for
`mode === 'DEMO'`, so `create-order` is unreachable. All demo data carries `source: 'demo'`, order ids
use the `DEMO-ORDER-` prefix, and no payment link is ever produced.

---

## Scripts

Every script is `JSON in → JSON/Markdown out`, offline, read-only and side-effect free. Only the
Skill (the agent) is allowed to call MCP.

| Script | Purpose |
| --- | --- |
| `intent.mjs` | Natural language → structured intent + follow-up questions |
| `plan.mjs` | 1–3 candidates from the real menu (menu-price pre-screen only) |
| `validate-plan.mjs` | Availability / price / budget / coupon / portions / exclusions / nutrition checks |
| `render-pr.mjs` | Render the PR as Markdown; `--share` emits a redacted share card |
| `generate-diff.mjs` | Version diff (structured + unified) |
| `review-state.mjs` | Transitions, approval binding, execution gate, read-only `inspect` |
| `redact.mjs` | Secret scanning and masking (exit 1 = do not share/commit) |
| `mcp-adapt.mjs` | MCP payload → MealPR shape (field names + amount units) |
| `demo.mjs` | Token-free end-to-end demo |
| `export-fixture.mjs` | Export a demo fixture plan as PR JSON (handy for piping) |

### P1 review page

```bash
npm run site        # dist/mealpr-review.html — single file, no external deps
npm run smoke:site  # proves the in-page bundle behaves like the Node core
```

GitHub-PR layout (header / conversation / files changed / checks / review actions). The page inlines the
**real** MealPR core, so its Approve button runs the real state machine, its fingerprint is computed in the
browser and matches Node bit for bit, and its execution gate always refuses DEMO — clicking "order" shows
the refusal plus a simulated order. Demo data only; no MCP, no real orders.

```bash
echo '{"text":"Order me McDonald\'s, 2 people, under ¥70"}' | node mealpr/scripts/intent.mjs
node mealpr/scripts/export-fixture.mjs team --rev 0 > /tmp/v2.json
cat /tmp/v2.json | node mealpr/scripts/validate-plan.mjs     # bare PR objects are accepted too
node mealpr/scripts/review-state.mjs --file /tmp/v2.json
node mealpr/scripts/redact.mjs --file README.md --mode scan
```

---

## Tests

```bash
npm install
npm test          # 120 passed
npm run typecheck # tsc --noEmit
npm run build     # src/ -> mealpr/scripts/*.mjs
npm run smoke:site  # in-page bundle parity
```

Scenarios `T01–T14` are covered: budget planning, over-budget blocking, coupon expiry re-pricing,
revision diffs, unapproved execution attempts, approval invalidation after item or price change,
duplicate-order protection, MCP 401/429 handling with no write retries, demo isolation, nutrition
honesty, repository-wide secret scanning, **combo double-charge prevention (T13)** and
**pinned MCP field/unit facts (T14)**.

T13 is a bug found in real use: the planner used to pool combos with mains and then stack a drink and a
side on top, but a combo already contains both — the reviewer was approving a silently duplicated order.
Combos are now planned separately and blocked until `query-meal-detail` reveals their components.

---

## Safety & privacy

- The payable amount comes only from `calculate-price`; menu prices are for pre-screening.
- Coupon availability comes from `query-my-coupons` / `query-store-coupons`; `auto-bind-coupons` is
  never invoked automatically because it mutates the user's account.
- Nutrition gaps are labelled with coverage and missing items — never estimated.
- Ordering requires: LIVE mode + APPROVED + all gate checks green + matching fingerprint + no prior
  successful attempt.
- If a `create-order` result is unknown, MealPR queries `query-order` first and never silently resends.
- Tokens, phone numbers, emails, addresses and payment links are kept out of logs, share cards and the
  repository.
- MCP response text is treated as data, never as instructions.
- Creating an order is not paying for it — the human must complete payment.

---

## Known limitations

- **Live MCP integration is not verified.** Development happened without a valid McDonald's MCP token,
  so none of `query-*`, `calculate-price` or `create-order` have been executed against the real service.
  This is stated plainly rather than papered over with mocks — see
  [`MCP_INTEGRATION.md`](MCP_INTEGRATION.md) §8.
- **Write paths are still unverified.** `create-order` / `query-order` / `cancel-order` have never been
  called. Field names and units on the read path were confirmed against the live service; the write path
  can only be verified in an environment that holds a token.
- Demo fixtures are hand-made placeholders and do not reflect real McDonald's menus or prices.
- The P1 review page ships; image export for share cards does not (a Markdown share card is available via
  `render-pr.mjs --share`).

### Two earlier claims that turned out to be wrong

| Earlier claim | Reality |
| --- | --- |
| "Tool input schemas are not public" | **False** — `tools/list` returns a full `inputSchema` per tool |
| The menu price field is `price` | **False** — it is `currentPrice`, with `originalPrice` as list price |

Two more facts confirmed against the live server: `query-meal-detail` takes **`code`** (`productCode`
returns HTTP 400), and `calculate-price` returns amounts in **cents** (`2290` = ¥22.90). All four are
pinned in `MCP_FIELD_FACTS` in `src/mcp-adapt.ts` and asserted by tests.
- Idempotency relies on MealPR's own fingerprint ledger, not on an assumed MCP idempotency key.

---

## Contest files

`README.md` ✅ · `CONTEST_DECLARATION.md` ✅ (verbatim copy of the official file) ·
`MCP_INTEGRATION.md` ✅ · `mcp-config.example.json` ✅ · `workbuddy.md` ✅

## License

MIT — see [LICENSE](LICENSE). An independent open-source project, not an official McDonald's product.
McDonald's is a registered trademark of McDonald's Corporation and its affiliates. Product availability,
prices and nutrition information follow the official channels' real-time results.
