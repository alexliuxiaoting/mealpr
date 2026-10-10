# Meal PR 输出格式

## 1. PR 数据结构（JSON）

完整 schema 见 `src/types.ts`（Zod）。最小示例：

```json
{
  "id": "001",
  "mode": "LIVE",
  "title": "feat: 项目上线庆功双人餐",
  "status": "READY_FOR_REVIEW",
  "version": 2,
  "userIntent": {
    "people": 2,
    "budget": { "currency": "CNY", "max": 70, "min": null },
    "fulfillment": "pickup",
    "store": "STORE-001",
    "preferences": ["prefer-coupons"],
    "exclusions": [],
    "nutritionGoals": null,
    "rawText": "",
    "missing": []
  },
  "fulfillment": "pickup",
  "store": { "id": "STORE-001", "name": "示例门店", "address": null, "source": "mcp" },
  "items": [
    {
      "code": "M-XXXX",
      "name": "某个汉堡",
      "category": "main",
      "quantity": 2,
      "options": [],
      "unitPrice": 22.0,
      "nutritionRef": "M-XXXX",
      "comboComposition": null,
      "remark": null
    }
  ],
  "coupons": [
    { "id": "C-1", "name": "双人餐券", "source": "mcp", "discountAmount": 8.0, "verified": true, "note": null }
  ],
  "priceQuote": {
    "currency": "CNY",
    "subtotal": 61.0,
    "discountTotal": 8.0,
    "deliveryFee": 0.0,
    "payable": 53.0,
    "calculated": true,
    "source": "mcp",
    "unverifiedReason": null,
    "quotedAt": "2026-10-10T10:00:00.000Z",
    "toolCallId": null
  },
  "nutritionSummary": {
    "status": "PARTIAL",
    "coverage": 0.667,
    "matched": ["某个汉堡 x2"],
    "missing": ["某饮料 x2"],
    "totals": { "energyKcal": 808, "proteinG": 49.2, "fatG": 34.4, "carbG": 76.8, "sodiumMg": 1780, "calciumMg": 300 },
    "note": "PARTIAL: ... 未覆盖：某饮料 x2"
  },
  "validations": [],
  "changes": [],
  "approval": { "approved": false, "version": null, "fingerprint": null, "approvedAt": null, "note": null },
  "order": {
    "orderId": null, "status": null, "payable": null, "payUrl": null,
    "requestFingerprint": null, "createdAt": null, "simulated": false, "attempts": []
  },
  "timestamps": { "createdAt": "2026-10-10T10:00:00.000Z", "updatedAt": "2026-10-10T10:00:00.000Z" }
}
```

### 关键约束

- `mode` 只能是 `DEMO` 或 `LIVE`。
- `priceQuote.payable` **必须**来自 `calculate-price`；没算出来时 `calculated: false` 且 `payable` 建议为 `null`，并填 `unverifiedReason`。
- `coupons[].source` 在 LIVE 模式下必须是 `mcp` 且 `verified: true`，否则校验层判 `UNKNOWN`（阻断）。
- `nutritionSummary.totals` 只统计**命中官方数据**的商品；`coverage < 1` 时 `status` 必须是 `PARTIAL`，不得写 `VERIFIED`。
- **金额单位一律为「元」**。`calculate-price` 返回的是「分」（`2290` = ¥22.90），必须先 ÷100 再填入 `priceQuote`。
- `items[].comboComposition` 只在 `category: 'combo'` 时有意义。已用 `query-meal-detail` 核对时填：

  ```json
  { "components": [
      { "name": "炸鸡", "category": "main", "quantity": 1, "code": null },
      { "name": "迷你薯条", "category": "side", "quantity": 1, "code": null },
      { "name": "无糖可乐", "category": "drink", "quantity": 1, "code": null }],
    "source": "mcp-detail", "note": null }
  ```

  未核对时保持 `null`，此时 `combo-composition-verified` 校验为阻断性 UNKNOWN。

## 2. 渲染输出（Markdown）

由 `scripts/render-pr.mjs` 生成，标准结构：

```markdown
# 🍔 Meal PR #001

## feat: 项目上线庆功双人餐

Status: `READY_FOR_REVIEW`　|　Mode: `LIVE` — 真实 MCP 数据　|　Version: 2

### User Requirements
- People: 2
- Budget: ¥70.00
- Fulfillment: pickup
- Store: 示例门店 (`STORE-001`)
- Preference: prefer-coupons
- Exclusions: none

### Proposed Changes
+ 某个汉堡 × 2 @ ¥22.00

### Price Check
| Item | Amount |
| --- | --- |
| Budget | ¥70.00 |
| Subtotal | ¥61.00 |
| Discount | -¥8.00 |
| Delivery fee | n/a |
| **Calculated payable** | ¥53.00 |
| Available budget left | ¥17.00 |

### Coupon Check
- 双人餐券 (`C-1`) — verified, discount ¥8.00

### Nutrition Check
Status: **PARTIAL** · official coverage 67%
| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 808 |
- No official data: 某饮料 x2

### Validation
- [x] Products available — ...
- [x] Price calculated — ...
- [x] Within budget — ...
- [ ] Human approved — Awaiting explicit human approval. (non-blocking)

### Diff vs previous version
```diff
- 原饮料 × 2
+ 无糖饮料 × 2
```

### Review
- Current fingerprint: `abc123def456`

### Review Actions
Allowed from `READY_FOR_REVIEW`: `APPROVE`, `REQUEST_CHANGES`, `REVISE`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

### Order
- State: CREATED
- Real order id: MCD-ORDER-XXXX
- Payable: ¥53.00
- Official payment link: https://...

> 订单创建不等于已支付，需你自行完成付款。
```

## 3. 数值书写规则

| 情况 | 写法 |
| --- | --- |
| 已有真实报价 | `¥53.00` |
| 从未报价 | `unknown — no calculate-price result` |
| 报价失败 | `unknown — <unverifiedReason>` |
| 无配送费 | `¥0.00`（pickup）或 `n/a` |
| 无预算上限 | `unset` |

**禁止**：写 `¥0` 表示未知、留空表示未知、用菜单价冒充实付价。

## 4. Diff 输出

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
- 中杯可乐 x2  (M-COLA-M)
+ 中杯无糖可乐 x2  (M-COLA-ZERO-M)
- 中份薯条 x1  (M-FRY-M)
  麦香鸡 x1
@@ Coupons @@
  coupon DEMO 券 · 双人餐立减 ¥8
@@ Payment @@
- Payable: ¥67.00
+ Payable: ¥53.00
- Budget left: ¥3.00
+ Budget left: ¥17.00
@@ Nutrition @@
  VERIFIED -> PARTIAL :: status VERIFIED -> PARTIAL; official coverage 100% -> 67%; no official data: 中杯无糖可乐 x2
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

当报价未重新计算时，金额行会追加 `[NOT RECALCULATED]` 标记。

## 5. 分享与安全

`render-pr.mjs --share` 输出脱敏后的 PR，自动屏蔽包含以下关键字的字段：
`token / secret / password / phone / mobile / email / address / payUrl / payment / orderId / openid / userid / member / nickname / realname / idcard`，并对字符串再做一次正则脱敏。

**默认不出现在分享内容中**：姓名、电话、详细地址、MCP Token、真实订单号、支付链接。
