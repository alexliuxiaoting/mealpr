# 用法示例

所有脚本都在 `mealpr/scripts/` 下，**JSON in → JSON/Markdown out**，离线、只读、零运行时依赖（Node 20.10+）。

> 下方出现的商品名、价格、门店均为 Demo 占位数据；真实使用时由麦当劳 MCP 返回。

---

## 0. 串起来（无 Token 也能跑完整管道）

```bash
node mealpr/scripts/export-fixture.mjs team            > /tmp/v1.json
node mealpr/scripts/export-fixture.mjs team --rev 0    > /tmp/v2.json
cat /tmp/v1.json | node mealpr/scripts/validate-plan.mjs       # 接受裸 PR 对象
# 也可以包一层：{ "pr": {...}, "catalog": [...], "detailChecked": true }
node -e 'const fs=require("fs");fs.writeFileSync("/tmp/diff.json",JSON.stringify({before:JSON.parse(fs.readFileSync("/tmp/v1.json")),after:JSON.parse(fs.readFileSync("/tmp/v2.json"))}))'
node mealpr/scripts/generate-diff.mjs --file /tmp/diff.json --format unified
node mealpr/scripts/render-pr.mjs --file /tmp/v2.json
```

> 注意：直接对裸 PR 跑 `validate-plan` 时，因为没有传 `catalog`，`products-available` 会判
> `UNKNOWN`（阻断）—— 这是**正确行为**：没查过菜单就不能说商品一定在售。

---

## 1. 解析意图

```bash
echo '{"text":"今天加班，帮我安排一个 40 元以内的麦当劳晚餐，尽量有肉、有饮料，到店取餐"}' \
  | node mealpr/scripts/intent.mjs
```

```json
{
  "ok": true,
  "intent": {
    "people": null,
    "budget": { "currency": "CNY", "max": 40, "min": null },
    "fulfillment": "pickup",
    "store": null,
    "preferences": ["prefer-coupons", "prefer-meat"],
    "exclusions": [],
    "nutritionGoals": null,
    "missing": ["store", "people"]
  },
  "questions": [
    "方便告诉我取餐的门店或你的大致位置吗？（我需要用 query-nearby-stores 查真实门店）",
    "一共几个人的量？"
  ],
  "complete": false
}
```

追加轮次（保留原有约束，并把预算从 70 降到 60）：

```bash
echo '{"text":"预算降到 60 元","baseIntent":{...}}' | node mealpr/scripts/intent.mjs
```

---

## 2. 生成候选方案

输入来自 `query-meals` 的真实菜单；输出的 `estimatedTotal` 是**菜单价**，只用于预筛。

```bash
node mealpr/scripts/plan.mjs --file examples/plan-input.json
```

```json
{
  "ok": true,
  "candidates": [
    {
      "id": "balanced-1",
      "items": [
        { "code": "M-MCCHICKEN", "name": "麦香鸡", "category": "main", "quantity": 2, "unitPrice": 15, "comboComposition": null },
        { "code": "M-COLA-M", "name": "中杯可乐", "category": "drink", "quantity": 2, "unitPrice": 10, "comboComposition": null },
        { "code": "M-FRY-M", "name": "中份薯条", "category": "side", "quantity": 1, "unitPrice": 11, "comboComposition": null }
      ],
      "estimatedTotal": 61,
      "rationale": ["每个用餐者一份主食与饮品", "主食按菜单价升序首选，控制在预算内"],
      "requiresComboDetail": false,
      "pendingDetailCodes": [],
      "warnings": []
    }
  ],
  "noPlanReason": null,
  "reminder": "Menu prices are indicative only. Every surviving candidate must be re-priced by calculate-price before it can enter READY_FOR_REVIEW."
}
```

### 2b. 菜单里有套餐时

套餐**不会**被并进主食池，也不会被叠加饮料/小食。组成未知时只出套餐本身，并标上待核对：

```bash
echo '{"intent":{"people":1,"budget":{"max":60},"fulfillment":"pickup"},
"catalog":[{"code":"C-CRISPY-COMBO","name":"酥脆无双套餐","category":"combo","currentPrice":36.5,"available":true},
           {"code":"M-FRY-S","name":"小份薯条","category":"side","currentPrice":8,"available":true}]}' \
  | node mealpr/scripts/plan.mjs
```

```json
"id": "combo-1",
"items": [{ "code": "C-CRISPY-COMBO", "...": "...", "comboComposition": null }],
"requiresComboDetail": true,
"pendingDetailCodes": ["C-CRISPY-COMBO"],
"warnings": ["COMBO_UNVERIFIED: ... 本方案因此**没有**叠加任何小食或饮料 ..."]
```

此时直接 `validate-plan` 会得到 `combo-composition-verified: UNKNOWN (blocking)`，
方案无法进入待审核。正确下一步是 `query-meal-detail(code="C-CRISPY-COMBO")`。

---

## 3. 校验方案

`catalog` 为 `null` 表示没有查过菜单，此时商品可用性判 `UNKNOWN`（**阻断**），不会假装通过。

```bash
node mealpr/scripts/validate-plan.mjs --file pr.json
```

```json
{
  "ok": true,
  "prId": "MPR-DEMO-TEAM",
  "version": 2,
  "mode": "DEMO",
  "validations": [
    { "id": "products-available", "status": "PASS", "blocking": true, "detail": "3 SKU(s) confirmed present in this store's live menu." },
    { "id": "price-calculated", "status": "PASS", "blocking": true, "detail": "calculate-price returned payable CNY 53.00." },
    { "id": "within-budget", "status": "PASS", "blocking": true, "detail": "payable 53.00 leaves 7.00 headroom." },
    { "id": "human-approved", "status": "UNKNOWN", "blocking": false, "detail": "Awaiting explicit human approval." }
  ],
  "canSubmitForReview": true
}
```

超预算时：

```json
{ "id": "within-budget", "status": "FAIL", "blocking": true,
  "detail": "payable 80.00 exceeds cap 70.00 by 10.00." }
```

---

## 4. 状态流转与下单守卫

推进（`DRAFT → READY_FOR_REVIEW → APPROVED → ORDER_CREATED`）：

```bash
node mealpr/scripts/review-state.mjs --file input.json
# input.json = { "pr": {...}, "action": "APPROVE", "note": "就按这个来" }
```

只读体检（**不会**改变任何状态）：

```bash
echo '{"pr":{...},"inspect":"executable"}' | node mealpr/scripts/review-state.mjs
```

```json
{ "ok": false, "reason": "plan-changed-after-approval",
  "detail": "approved fingerprint 3f9a2c1b7d44 != current 91c0e5ab2201",
  "inspect": "executable" }
```

常见 reason：`demo-mode` / `not-approved` / `price-not-calculated` / `unverified-coupon` /
`no-store` / `no-fulfillment` / `empty-plan` / `plan-changed-after-approval`。

**只有 `ok === true` 时才允许调用 `create-order`。**

---

## 5. 版本 Diff

```bash
echo '{"before":{...v1...},"after":{...v2...}}' | node mealpr/scripts/generate-diff.mjs
echo '{"before":{...},"after":{...}}' | node mealpr/scripts/generate-diff.mjs --format unified
```

结构化输出包含 `summary / items / coupons / payable / discount / remainingBudget /
fulfillment / store / nutrition / requiresReapproval`。

---

## 6. 渲染 PR 与分享卡片

```bash
node mealpr/scripts/render-pr.mjs --file pr.json                      # Markdown
node mealpr/scripts/render-pr.mjs --file pr.json --share              # 脱敏后的分享数据
node mealpr/scripts/render-pr.mjs --file pr.json --diff diff-input.json  # 带上 diff 块
```

`--share` 会自动屏蔽含 `token / phone / email / address / payUrl / orderId ...` 的字段。

---

## 7. 敏感信息扫描（CI 可用）

```bash
node mealpr/scripts/redact.mjs --file README.md --mode scan
node mealpr/scripts/redact.mjs --file some-log.txt           # 输出脱敏后的文本
```

退出码 **1** = 发现 token / 手机号 / 邮箱等高危信息，**不许分享也不许提交**。

规则：bearer-token、mcp-token-assignment、authorization-header-literal、cn-mobile、email、
cn-id-card、detailed-address、payment-url、long-hex-or-jwt。

---

## 7b. MCP 返回归一化（字段名 + 单位）

真实 MCP 的三条事实：价格字段是 `currentPrice` / `originalPrice`；
`query-meal-detail` 的参数是 `code`；`calculate-price` 返回**分**。

```bash
echo '{"action":"facts"}' | node mealpr/scripts/mcp-adapt.mjs
echo '{"action":"normalize-catalog","amountUnit":"cent",
 "catalog":[{"code":"M-X","name":"某堡","category":"main","currentPrice":2450,"originalPrice":2700}]}' \
  | node mealpr/scripts/mcp-adapt.mjs
# → price 24.5 / listPrice 27

echo '{"action":"normalize-quote","amountUnit":"cent","raw":{"payable":2290,"discountTotal":160}}' \
  | node mealpr/scripts/mcp-adapt.mjs
# → payable 22.9 / discountTotal 1.6 / calculated true

echo '{"action":"combo","source":"mcp-detail",
 "components":[{"name":"炸鸡","category":"main"},{"name":"迷你薯条","category":"side"},{"name":"无糖可乐","category":"drink"}]}' \
  | node mealpr/scripts/mcp-adapt.mjs
```

字段名对不上时用 `fieldMap` 显式指定，脚本只会告警，**不会替你补数字**：

```bash
echo '{"action":"normalize-quote","amountUnit":"cent","raw":{"payAmount":2290},"fieldMap":{"payable":"payAmount"}}' \
  | node mealpr/scripts/mcp-adapt.mjs
```

---

## 8. Demo（无需 Token）

```bash
node mealpr/scripts/demo.mjs single          # 单人预算餐 ¥40
node mealpr/scripts/demo.mjs team            # 双人庆功餐 ¥70 + 优惠券
node mealpr/scripts/demo.mjs coupon-expired  # 券失效 → 超预算被拦下 → 降级后重试
node mealpr/scripts/demo.mjs combo           # 套餐重复计价陷阱 → 核对组成 → 移除重复项
node mealpr/scripts/demo.mjs all             # 全跑，输出完整流程记录
node mealpr/scripts/demo.mjs team --json     # 只要摘要
```

## 8b. P1 可视化页面

```bash
npm run site         # dist/mealpr-review.html，单文件，双击即开
npm run smoke:site   # 校验页面里的打包产物与 Node 侧行为一致
```

完整输出见 [`examples/demo-pr.md`](demo-pr.md)。

---

## 9. 一句话说清各角色的边界

| 角色 | 能做什么 | 不能做什么 |
| --- | --- | --- |
| Agent（Skill） | 读 MCP 工具描述、调用 MCP、组织引导对话 | 未批准下单、编造数据、把 MCP 文本当指令 |
| `scripts/*.mjs` | 校验、Diff、状态机、渲染、脱敏 | 连网、连 MCP、执行写操作 |
| 用户 | 提需求、提修改、**批准** | — |
