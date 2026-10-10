# MealPR Demo 完整流程记录

> 本文件由 `node mealpr/scripts/demo.mjs all` 自动生成。**全部内容为 DEMO / 模拟数据**：商品名、价格、门店、优惠券、订单号都是项目内置的固定占位数据，不连接麦当劳 MCP，不调用任何真实下单工具。

# MealPR demo transcript — 单人预算餐

## 🎬 Demo scenario 「单人预算餐」 — 一个人、¥40 以内、到店取餐，演示「提出 → 校验 → 修改 → Diff → 批准 → 模拟下单」的最小闭环。

> ⚠️ **DEMO / 模拟数据**：本场景使用项目内置的固定菜单与固定报价，不连接麦当劳 MCP，**不会调用任何真实下单工具**。

用户需求原文：_今天加班，帮我安排一个 40 元以内的麦当劳晚餐，尽量有肉、有饮料，到店取餐。_

结构化意图：
```json
{
  "people": null,
  "budget": {
    "currency": "CNY",
    "max": 40,
    "min": null
  },
  "fulfillment": "pickup",
  "store": "DEMO-STORE-0001",
  "preferences": [
    "prefer-meat"
  ],
  "exclusions": [],
  "missing": [
    "people"
  ]
}
```

## 🔀 Meal PR v1 opened — READY_FOR_REVIEW

OK: DRAFT --SUBMIT_FOR_REVIEW--> READY_FOR_REVIEW

# 🍔 Meal PR #MPR-DEMO-SINGLE

## feat: 加班单人晚餐，控制在 ¥40 以内

Status: `READY_FOR_REVIEW`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 1

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: unknown
- Budget: ¥40.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0001`)
- Preference: prefer-meat
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 1 @ ¥15.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯可乐 × 1 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥40.00 |
| Subtotal | ¥36.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥36.00 |
| Available budget left | ¥4.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **PARTIAL** · official coverage 67%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 738 |
| Protein (g) | 22.4 |
| Fat (g) | 35.5 |
| Carbohydrate (g) | 81.8 |
| Sodium (mg) | 1040 |
| Calcium (mg) | 128 |

- No official data: 中杯可乐 x1

> PARTIAL: only 2 item group(s) matched official data. Totals cover those items only and must not be read as the whole meal. Unresolved: 中杯可乐 x1.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 36.00.
- [x] Within budget — payable 36.00 leaves 4.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [ ] Portions adequate **`UNKNOWN`** — Head count unknown. (non-blocking)
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Current fingerprint: `d35f977d8574`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `READY_FOR_REVIEW`: `REQUEST_CHANGES`, `APPROVE`, `REVISE`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 💬 Reviewer: _饮料换成无糖的，薯条不要了_ — v1 is now CHANGES_REQUESTED

> 状态回到 `CHANGES_REQUESTED`，此前的批准（如有）已自动失效。

OK: READY_FOR_REVIEW --REQUEST_CHANGES--> CHANGES_REQUESTED

## 🔍 Diff v1 → v2 — 1 added / 2 removed / 0 qty change

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
- 中杯可乐 x1  (M-COLA-M)
+ 中杯无糖可乐 x1  (M-COLA-ZERO-M)
- 中份薯条 x1  (M-FRY-M)
  麦香鸡 x1
@@ Payment @@
- Payable: ¥36.00
+ Payable: ¥25.00
- Budget left: ¥4.00
+ Budget left: ¥15.00
@@ Nutrition @@
  PARTIAL -> PARTIAL :: official coverage 67% -> 50%; energy 738 -> 401 kcal (matched items only); no official data for: 中杯无糖可乐 x1
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

Plan terms changed: the previously granted approval is void and the PR returns to READY_FOR_REVIEW.

## ✅ Approved v2 · fingerprint 16c7242712eb

OK: READY_FOR_REVIEW --APPROVE--> APPROVED

# 🍔 Meal PR #MPR-DEMO-SINGLE

## feat: 加班单人晚餐 v2 —— 无糖饮料 + 去掉薯条

Status: `APPROVED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: unknown
- Budget: ¥40.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0001`)
- Preference: prefer-meat, no-sugar-drink
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 1 @ ¥15.00
+ 中杯无糖可乐 × 1 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥40.00 |
| Subtotal | ¥25.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥25.00 |
| Available budget left | ¥15.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **PARTIAL** · official coverage 50%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 401 |
| Protein (g) | 18.2 |
| Fat (g) | 19.4 |
| Carbohydrate (g) | 38.1 |
| Sodium (mg) | 780 |
| Calcium (mg) | 120 |

- No official data: 中杯无糖可乐 x1

> PARTIAL: only 1 item group(s) matched official data. Totals cover those items only and must not be read as the whole meal. Unresolved: 中杯无糖可乐 x1.

### Validation

- [x] Products available — 2 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 25.00.
- [x] Within budget — payable 25.00 leaves 15.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [ ] Portions adequate **`UNKNOWN`** — Head count unknown. (non-blocking)
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `16c7242712eb`
- Current fingerprint: `16c7242712eb`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `APPROVED`: `CREATE_ORDER`, `REVISE`, `REQUEST_CHANGES`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 🛡️ Execution guard: DEMO is refused by construction

在任何模式下，下单前都会跑同一个 `assertExecutable`：

```json
{
  "ok": false,
  "reason": "demo-mode",
  "detail": "DEMO PRs can only produce a simulated order; the real create-order tool is never invoked."
}
```

DEMO 模式下它必然返回 `ok: false`（reason: `demo-mode`），因此真实的 `create-order` 工具不可能被调用。

下面演示的是**模拟订单**，订单号带 `DEMO-` 前缀，不产生任何支付链接。

## 🧾 Simulated order DEMO-ORDER-000001 — status CREATED

`applyAction(CREATE_ORDER)` 在 DEMO 下的结果：`BLOCKED: demo-mode — DEMO PRs can only produce a simulated order; the real create-order tool is never invoked.`

最终 PR：

# 🍔 Meal PR #MPR-DEMO-SINGLE

## feat: 加班单人晚餐 v2 —— 无糖饮料 + 去掉薯条

Status: `ORDER_CREATED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: unknown
- Budget: ¥40.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0001`)
- Preference: prefer-meat, no-sugar-drink
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 1 @ ¥15.00
+ 中杯无糖可乐 × 1 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥40.00 |
| Subtotal | ¥25.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥25.00 |
| Available budget left | ¥15.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **PARTIAL** · official coverage 50%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 401 |
| Protein (g) | 18.2 |
| Fat (g) | 19.4 |
| Carbohydrate (g) | 38.1 |
| Sodium (mg) | 780 |
| Calcium (mg) | 120 |

- No official data: 中杯无糖可乐 x1

> PARTIAL: only 1 item group(s) matched official data. Totals cover those items only and must not be read as the whole meal. Unresolved: 中杯无糖可乐 x1.

### Validation

- [x] Products available — 2 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 25.00.
- [x] Within budget — payable 25.00 leaves 15.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [ ] Portions adequate **`UNKNOWN`** — Head count unknown. (non-blocking)
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `16c7242712eb`
- Current fingerprint: `16c7242712eb`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `ORDER_CREATED`: `MARK_PAID`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

### Order

- State: CREATED
- Simulated order id: DEMO-ORDER-000001 (SIMULATED)
- Payable: ¥25.00
- Payment link: none — Demo mode never issues a payment link.

> 订单创建不等于已支付，需你自行完成付款。

---

_MealPR — Don't just order. Review your meal._


<!-- scenario=demo-single finalStatus=ORDER_CREATED simulatedOrder=DEMO-ORDER-000001 guardOk=false -->
# MealPR demo transcript — 双人庆功餐

## 🎬 Demo scenario 「双人庆功餐」 — 两人的项目上线庆功餐，¥70 以内，带一张模拟优惠券，演示带券报价与预算收紧后的重新提案。

> ⚠️ **DEMO / 模拟数据**：本场景使用项目内置的固定菜单与固定报价，不连接麦当劳 MCP，**不会调用任何真实下单工具**。

用户需求原文：_项目上线了，帮我和同事配一顿麦当劳，2 人，70 元以内，优先用优惠券，到店取餐。_

结构化意图：
```json
{
  "people": 2,
  "budget": {
    "currency": "CNY",
    "max": 70,
    "min": null
  },
  "fulfillment": "pickup",
  "store": "DEMO-STORE-0002",
  "preferences": [
    "prefer-coupons"
  ],
  "exclusions": [],
  "missing": []
}
```

## 🔀 Meal PR v1 opened — READY_FOR_REVIEW

OK: DRAFT --SUBMIT_FOR_REVIEW--> READY_FOR_REVIEW

# 🍔 Meal PR #MPR-DEMO-TEAM

## feat: 项目上线庆功双人餐

Status: `READY_FOR_REVIEW`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 1

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥70.00
- Fulfillment: pickup
- Store: DEMO 门店 · 上海张江店 (`DEMO-STORE-0002`)
- Preference: prefer-coupons
- Exclusions: none

### Proposed Changes

+ 板烧鸡腿堡 × 2 @ ¥22.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥70.00 |
| Subtotal | ¥75.00 |
| Discount | -¥8.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥67.00 |
| Available budget left | ¥3.00 |

### Coupon Check

- DEMO 券 · 双人餐立减 ¥8 (`DEMO-COUPON-TEAM-8`) — **unverified**, discount ¥8.00

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1441 |
| Protein (g) | 53.4 |
| Fat (g) | 50.5 |
| Carbohydrate (g) | 190.5 |
| Sodium (mg) | 2070 |
| Calcium (mg) | 308 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 67.00.
- [x] Within budget — payable 67.00 leaves 3.00 headroom.
- [x] Coupon check — 1 coupon(s) confirmed by live query: DEMO 券 · 双人餐立减 ¥8.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Current fingerprint: `e72e07d90494`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `READY_FOR_REVIEW`: `REQUEST_CHANGES`, `APPROVE`, `REVISE`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 💬 Reviewer: _预算降到 60 元以内_ — v1 is now CHANGES_REQUESTED

> 状态回到 `CHANGES_REQUESTED`，此前的批准（如有）已自动失效。

OK: READY_FOR_REVIEW --REQUEST_CHANGES--> CHANGES_REQUESTED

## 🔍 Diff v1 → v2 — 2 added / 2 removed / 0 qty change

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
- 中杯可乐 x2  (M-COLA-M)
+ 中杯无糖可乐 x2  (M-COLA-ZERO-M)
  中份薯条 x1
- 板烧鸡腿堡 x2  (M-GRILLEDCHICKEN)
+ 麦香鸡 x2  (M-MCCHICKEN)
@@ Coupons @@
  coupon DEMO 券 · 双人餐立减 ¥8
@@ Payment @@
- Payable: ¥67.00
+ Payable: ¥53.00
- Budget left: ¥3.00
+ Budget left: ¥7.00
@@ Nutrition @@
  VERIFIED -> VERIFIED :: Nutrition coverage unchanged.
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

Plan terms changed: the previously granted approval is void and the PR returns to READY_FOR_REVIEW.

## ✅ Approved v2 · fingerprint 2e10887cb3b0

OK: READY_FOR_REVIEW --APPROVE--> APPROVED

# 🍔 Meal PR #MPR-DEMO-TEAM

## feat: 项目上线庆功双人餐 v2 —— 预算收紧到 ¥60

Status: `APPROVED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥60.00
- Fulfillment: pickup
- Store: DEMO 门店 · 上海张江店 (`DEMO-STORE-0002`)
- Preference: prefer-coupons
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 2 @ ¥15.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯无糖可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥60.00 |
| Subtotal | ¥61.00 |
| Discount | -¥8.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥53.00 |
| Available budget left | ¥7.00 |

### Coupon Check

- DEMO 券 · 双人餐立减 ¥8 (`DEMO-COUPON-TEAM-8`) — **unverified**, discount ¥8.00

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1141 |
| Protein (g) | 40.6 |
| Fat (g) | 54.9 |
| Carbohydrate (g) | 120.3 |
| Sodium (mg) | 1860 |
| Calcium (mg) | 248 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 53.00.
- [x] Within budget — payable 53.00 leaves 7.00 headroom.
- [x] Coupon check — 1 coupon(s) confirmed by live query: DEMO 券 · 双人餐立减 ¥8.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `2e10887cb3b0`
- Current fingerprint: `2e10887cb3b0`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `APPROVED`: `CREATE_ORDER`, `REVISE`, `REQUEST_CHANGES`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 🛡️ Execution guard: DEMO is refused by construction

在任何模式下，下单前都会跑同一个 `assertExecutable`：

```json
{
  "ok": false,
  "reason": "demo-mode",
  "detail": "DEMO PRs can only produce a simulated order; the real create-order tool is never invoked."
}
```

DEMO 模式下它必然返回 `ok: false`（reason: `demo-mode`），因此真实的 `create-order` 工具不可能被调用。

下面演示的是**模拟订单**，订单号带 `DEMO-` 前缀，不产生任何支付链接。

## 🧾 Simulated order DEMO-ORDER-000002 — status CREATED

`applyAction(CREATE_ORDER)` 在 DEMO 下的结果：`BLOCKED: demo-mode — DEMO PRs can only produce a simulated order; the real create-order tool is never invoked.`

最终 PR：

# 🍔 Meal PR #MPR-DEMO-TEAM

## feat: 项目上线庆功双人餐 v2 —— 预算收紧到 ¥60

Status: `ORDER_CREATED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥60.00
- Fulfillment: pickup
- Store: DEMO 门店 · 上海张江店 (`DEMO-STORE-0002`)
- Preference: prefer-coupons
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 2 @ ¥15.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯无糖可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥60.00 |
| Subtotal | ¥61.00 |
| Discount | -¥8.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥53.00 |
| Available budget left | ¥7.00 |

### Coupon Check

- DEMO 券 · 双人餐立减 ¥8 (`DEMO-COUPON-TEAM-8`) — **unverified**, discount ¥8.00

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1141 |
| Protein (g) | 40.6 |
| Fat (g) | 54.9 |
| Carbohydrate (g) | 120.3 |
| Sodium (mg) | 1860 |
| Calcium (mg) | 248 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 53.00.
- [x] Within budget — payable 53.00 leaves 7.00 headroom.
- [x] Coupon check — 1 coupon(s) confirmed by live query: DEMO 券 · 双人餐立减 ¥8.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `2e10887cb3b0`
- Current fingerprint: `2e10887cb3b0`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `ORDER_CREATED`: `MARK_PAID`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

### Order

- State: CREATED
- Simulated order id: DEMO-ORDER-000002 (SIMULATED)
- Payable: ¥53.00
- Payment link: none — Demo mode never issues a payment link.

> 订单创建不等于已支付，需你自行完成付款。

---

_MealPR — Don't just order. Review your meal._


<!-- scenario=demo-team finalStatus=ORDER_CREATED simulatedOrder=DEMO-ORDER-000002 guardOk=false -->
# MealPR demo transcript — 优惠券失效后重新报价

## 🎬 Demo scenario 「优惠券失效后重新报价」 — 带券方案原本在预算内，券失效后按原价重算会超预算；系统必须阻止进入待审核，再由用户降级菜品后重新提案。

> ⚠️ **DEMO / 模拟数据**：本场景使用项目内置的固定菜单与固定报价，不连接麦当劳 MCP，**不会调用任何真实下单工具**。

用户需求原文：_我和同事 2 人吃饭，预算 70 元以内，用上那张双人券，到店取餐。_

结构化意图：
```json
{
  "people": 2,
  "budget": {
    "currency": "CNY",
    "max": 70,
    "min": null
  },
  "fulfillment": "pickup",
  "store": "DEMO-STORE-0003",
  "preferences": [],
  "exclusions": [],
  "missing": []
}
```

## 🔀 Meal PR v1 opened — READY_FOR_REVIEW

OK: DRAFT --SUBMIT_FOR_REVIEW--> READY_FOR_REVIEW

# 🍔 Meal PR #MPR-DEMO-COUPON-EXPIRED

## feat: 双人套餐 + 双人券（¥70 以内）

Status: `READY_FOR_REVIEW`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 1

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥70.00
- Fulfillment: pickup
- Store: DEMO 门店 · 北京中关村店 (`DEMO-STORE-0003`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 巨无霸 × 2 @ ¥24.50
+ 中份薯条 × 1 @ ¥11.00
+ 中杯可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥70.00 |
| Subtotal | ¥80.00 |
| Discount | -¥12.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥68.00 |
| Available budget left | ¥2.00 |

### Coupon Check

- DEMO 券 · 双人餐立减 ¥12 (`DEMO-COUPON-EXPIRED-12`) — **unverified**, discount ¥12.00

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1733 |
| Protein (g) | 56.8 |
| Fat (g) | 77.1 |
| Carbohydrate (g) | 205.9 |
| Sodium (mg) | 2390 |
| Calcium (mg) | 528 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 68.00.
- [x] Within budget — payable 68.00 leaves 2.00 headroom.
- [x] Coupon check — 1 coupon(s) confirmed by live query: DEMO 券 · 双人餐立减 ¥12.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Current fingerprint: `86ab140a4f9b`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `READY_FOR_REVIEW`: `REQUEST_CHANGES`, `APPROVE`, `REVISE`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 💬 Reviewer: _这张券刚才提示不可用了，去掉优惠券按原价重新算一遍价格_ — v1 is now CHANGES_REQUESTED

> 状态回到 `CHANGES_REQUESTED`，此前的批准（如有）已自动失效。

OK: READY_FOR_REVIEW --REQUEST_CHANGES--> CHANGES_REQUESTED

## 🚫 v2 未通过自动校验 — PR 停留在 CHANGES_REQUESTED

BLOCKED: cannot move to READY_FOR_REVIEW, unresolved blocking checks: within-budget:FAIL

校验明细：

- [x] **Products available** — PASS (blocking)：3 SKU(s) confirmed present in this store's live menu.
- [x] **Price calculated** — PASS (blocking)：calculate-price returned payable CNY 80.00.
- [ ] **Within budget** — FAIL (blocking)：payable 80.00 exceeds cap 70.00 by 10.00.
- [x] **Coupon check** — PASS：No coupon applied — priced at menu value only.
- [x] **Portions adequate** — PASS (blocking)：2 main(s) for 2 person(s).
- [x] **Exclusions honoured** — PASS (blocking)：Plan avoids: 优惠券按原价重新.
- [x] **Combo composition verified** — PASS：No combo in this plan.
- [x] **Combo options legal** — PASS：No combo substitutions in this plan.
- [ ] **Human approved** — UNKNOWN：Awaiting explicit human approval.

> MealPR 不会为了让方案「通过」而放宽校验，也不会在未校验的情况下把它交给你审核。请调整需求或预算后重新提案。

## 💬 Reviewer: _那就主食换成麦香鸡，控制在预算内_ — v1 is now CHANGES_REQUESTED

> 状态回到 `CHANGES_REQUESTED`，此前的批准（如有）已自动失效。

OK: READY_FOR_REVIEW --REQUEST_CHANGES--> CHANGES_REQUESTED

## 🔍 Diff v1 → v2 — 1 added / 1 removed / 0 qty change

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
- 巨无霸 x2  (M-BIGMAC)
  中杯可乐 x2
  中份薯条 x1
+ 麦香鸡 x2  (M-MCCHICKEN)
@@ Coupons @@
- coupon DEMO 券 · 双人餐立减 ¥12 (DEMO-COUPON-EXPIRED-12)
@@ Payment @@
- Payable: ¥68.00
+ Payable: ¥61.00
- Budget left: ¥2.00
+ Budget left: ¥9.00
@@ Nutrition @@
  VERIFIED -> VERIFIED :: Nutrition coverage unchanged.
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

Plan terms changed: the previously granted approval is void and the PR returns to READY_FOR_REVIEW.

## ✅ Approved v2 · fingerprint c3036c616fdb

OK: READY_FOR_REVIEW --APPROVE--> APPROVED

# 🍔 Meal PR #MPR-DEMO-COUPON-EXPIRED

## feat: 双人套餐 v3 —— 券失效后改用更低价主食

Status: `APPROVED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥70.00
- Fulfillment: pickup
- Store: DEMO 门店 · 北京中关村店 (`DEMO-STORE-0003`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 2 @ ¥15.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥70.00 |
| Subtotal | ¥61.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥61.00 |
| Available budget left | ¥9.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1435 |
| Protein (g) | 40.6 |
| Fat (g) | 54.9 |
| Carbohydrate (g) | 193.9 |
| Sodium (mg) | 1850 |
| Calcium (mg) | 248 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 61.00.
- [x] Within budget — payable 61.00 leaves 9.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `c3036c616fdb`
- Current fingerprint: `c3036c616fdb`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `APPROVED`: `CREATE_ORDER`, `REVISE`, `REQUEST_CHANGES`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 🛡️ Execution guard: DEMO is refused by construction

在任何模式下，下单前都会跑同一个 `assertExecutable`：

```json
{
  "ok": false,
  "reason": "demo-mode",
  "detail": "DEMO PRs can only produce a simulated order; the real create-order tool is never invoked."
}
```

DEMO 模式下它必然返回 `ok: false`（reason: `demo-mode`），因此真实的 `create-order` 工具不可能被调用。

下面演示的是**模拟订单**，订单号带 `DEMO-` 前缀，不产生任何支付链接。

## 🧾 Simulated order DEMO-ORDER-000003 — status CREATED

`applyAction(CREATE_ORDER)` 在 DEMO 下的结果：`BLOCKED: demo-mode — DEMO PRs can only produce a simulated order; the real create-order tool is never invoked.`

最终 PR：

# 🍔 Meal PR #MPR-DEMO-COUPON-EXPIRED

## feat: 双人套餐 v3 —— 券失效后改用更低价主食

Status: `ORDER_CREATED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 2
- Budget: ¥70.00
- Fulfillment: pickup
- Store: DEMO 门店 · 北京中关村店 (`DEMO-STORE-0003`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 麦香鸡 × 2 @ ¥15.00
+ 中份薯条 × 1 @ ¥11.00
+ 中杯可乐 × 2 @ ¥10.00

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥70.00 |
| Subtotal | ¥61.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥61.00 |
| Available budget left | ¥9.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **VERIFIED** · official coverage 100%

| Nutrient | Total (matched items only) |
| --- | --- |
| Energy (kcal) | 1435 |
| Protein (g) | 40.6 |
| Fat (g) | 54.9 |
| Carbohydrate (g) | 193.9 |
| Sodium (mg) | 1850 |
| Calcium (mg) | 248 |

> All items matched official nutrition data; totals are summed from official per-item values.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 61.00.
- [x] Within budget — payable 61.00 leaves 9.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [x] Portions adequate — 2 main(s) for 2 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — No combo in this plan.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `c3036c616fdb`
- Current fingerprint: `c3036c616fdb`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `ORDER_CREATED`: `MARK_PAID`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

### Order

- State: CREATED
- Simulated order id: DEMO-ORDER-000003 (SIMULATED)
- Payable: ¥61.00
- Payment link: none — Demo mode never issues a payment link.

> 订单创建不等于已支付，需你自行完成付款。

---

_MealPR — Don't just order. Review your meal._


<!-- scenario=demo-coupon-expired finalStatus=ORDER_CREATED simulatedOrder=DEMO-ORDER-000003 guardOk=false -->
# MealPR demo transcript — 套餐重复计价陷阱

## 🎬 Demo scenario 「套餐重复计价陷阱」 — 演示套餐（combo）不能被当作纯主食：未用 query-meal-detail 核对组成前会被自动校验拦下；核对后发现套餐自带小食与饮料，于是移除重复项并重新报价。

> ⚠️ **DEMO / 模拟数据**：本场景使用项目内置的固定菜单与固定报价，不连接麦当劳 MCP，**不会调用任何真实下单工具**。

用户需求原文：_帮我点麦当劳，1 人，60 元以内，到店取餐，尽量划算_

结构化意图：
```json
{
  "people": 1,
  "budget": {
    "currency": "CNY",
    "max": 60,
    "min": null
  },
  "fulfillment": "pickup",
  "store": "DEMO-STORE-0004",
  "preferences": [],
  "exclusions": [],
  "missing": []
}
```

## 🚫 v1 未通过自动校验 — PR 停留在 DRAFT，不会交给你批准

BLOCKED: cannot move to READY_FOR_REVIEW, unresolved blocking checks: combo-composition-verified:UNKNOWN

校验明细：

- [x] **Products available** — PASS (blocking)：3 SKU(s) confirmed present in this store's live menu.
- [x] **Price calculated** — PASS (blocking)：calculate-price returned payable CNY 53.00.
- [x] **Within budget** — PASS (blocking)：payable 53.00 leaves 7.00 headroom.
- [x] **Coupon check** — PASS：No coupon applied — priced at menu value only.
- [ ] **Portions adequate** — UNKNOWN：at least 1 main serving(s) for 1 person(s), but this counts an unverified combo as one serving. Resolve the combo composition first.
- [x] **Exclusions honoured** — PASS：No exclusions were specified.
- [ ] **Combo composition verified** — UNKNOWN (blocking)：Combo component list was never read from query-meal-detail: 酥脆无双套餐 (C-CRISPY-COMBO). A combo usually bundles its own side and drink — without the component list we cannot tell whether the rest of the plan double-charges them, nor whether the head count is actually covered. Call query-meal-detail with the combo code before this plan can be approved.
- [x] **Combo options legal** — PASS：No combo substitutions in this plan.
- [ ] **Human approved** — UNKNOWN：Awaiting explicit human approval.

# 🍔 Meal PR #MPR-DEMO-COMBO

## feat: 一人套餐（未核对组成）

Status: `DRAFT`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 1

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 1
- Budget: ¥60.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0004`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 酥脆无双套餐 × 1 @ ¥36.50
  - ⚠️ **套餐组成未核对**：需先调用 `query-meal-detail(code="C-CRISPY-COMBO")` 读取组成，确认后本方案才可批准。
+ 中杯可乐 × 1 @ ¥10.00
+ 苹果片 × 1 @ ¥6.50

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥60.00 |
| Subtotal | ¥53.00 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥53.00 |
| Available budget left | ¥7.00 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **UNKNOWN** · official coverage 0%

- No official data: 酥脆无双套餐 x1, 中杯可乐 x1, 苹果片 x1

> UNKNOWN: no plan item matched list-nutrition-foods. Nothing is asserted.

### Validation

- [x] Products available — 3 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 53.00.
- [x] Within budget — payable 53.00 leaves 7.00 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [ ] Portions adequate **`UNKNOWN`** — at least 1 main serving(s) for 1 person(s), but this counts an unverified combo as one serving. Resolve the combo composition first. (non-blocking)
- [x] Exclusions honoured — No exclusions were specified.
- [ ] Combo composition verified **`UNKNOWN`** — Combo component list was never read from query-meal-detail: 酥脆无双套餐 (C-CRISPY-COMBO). A combo usually bundles its own side and drink — without the component list we cannot tell whether the rest of the plan double-charges them, nor whether the head count is actually covered. Call query-meal-detail with the combo code before this plan can be approved.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Current fingerprint: `dd7bb7b110a8`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `DRAFT`: `SUBMIT_FOR_REVIEW`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

> MealPR 不会为了让方案「通过」而放宽校验。先补齐缺失的校验，再重新提案。

## 💬 Reviewer: _先用 query-meal-detail 核对这个套餐里到底有什么，别重复计价_（当前 `DRAFT`，直接进入重新提案）

当前状态为 `DRAFT`，不需要也无法再走一次 REQUEST_CHANGES，直接生成新版本。

## 🔍 Diff v1 → v2 — 0 added / 2 removed / 0 qty change

```diff
--- Meal PR v1
+++ Meal PR v2
@@ Items @@
  酥脆无双套餐 x1
- 苹果片 x1  (M-APPLE)
- 中杯可乐 x1  (M-COLA-M)
@@ Payment @@
- Payable: ¥53.00
+ Payable: ¥36.50
- Budget left: ¥7.00
+ Budget left: ¥23.50
@@ Nutrition @@
  UNKNOWN -> UNKNOWN :: Nutrition coverage unchanged.
@@ Result @@
[ ] No re-review needed
[x] Re-approval required
```

Plan terms changed: the previously granted approval is void and the PR returns to READY_FOR_REVIEW.

## ✅ Approved v2 · fingerprint 8b32c05e9ef4

OK: READY_FOR_REVIEW --APPROVE--> APPROVED

# 🍔 Meal PR #MPR-DEMO-COMBO

## feat: 一人套餐（已核对组成，移除重复项）

Status: `APPROVED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 1
- Budget: ¥60.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0004`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 酥脆无双套餐 × 1 @ ¥36.50
  - 套餐组成（已由 `query-meal-detail` 核对）：炸鸡×1、迷你薯条×1、无糖可乐×1

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥60.00 |
| Subtotal | ¥36.50 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥36.50 |
| Available budget left | ¥23.50 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **UNKNOWN** · official coverage 0%

- No official data: 酥脆无双套餐 x1

> UNKNOWN: no plan item matched list-nutrition-foods. Nothing is asserted.

### Validation

- [x] Products available — 1 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 36.50.
- [x] Within budget — payable 36.50 leaves 23.50 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [x] Portions adequate — 1 main(s) for 1 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — query-meal-detail confirmed: 酥脆无双套餐×1 = 主食×1 + 小食×1 + 饮料×1. Stacking in this plan only covers the real shortfall.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `8b32c05e9ef4`
- Current fingerprint: `8b32c05e9ef4`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `APPROVED`: `CREATE_ORDER`, `REVISE`, `REQUEST_CHANGES`, `REJECT`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

---

_MealPR — Don't just order. Review your meal._

## 🛡️ Execution guard: DEMO is refused by construction

在任何模式下，下单前都会跑同一个 `assertExecutable`：

```json
{
  "ok": false,
  "reason": "demo-mode",
  "detail": "DEMO PRs can only produce a simulated order; the real create-order tool is never invoked."
}
```

DEMO 模式下它必然返回 `ok: false`（reason: `demo-mode`），因此真实的 `create-order` 工具不可能被调用。

下面演示的是**模拟订单**，订单号带 `DEMO-` 前缀，不产生任何支付链接。

## 🧾 Simulated order DEMO-ORDER-000004 — status CREATED

`applyAction(CREATE_ORDER)` 在 DEMO 下的结果：`BLOCKED: demo-mode — DEMO PRs can only produce a simulated order; the real create-order tool is never invoked.`

最终 PR：

# 🍔 Meal PR #MPR-DEMO-COMBO

## feat: 一人套餐（已核对组成，移除重复项）

Status: `ORDER_CREATED`　|　Mode: `DEMO` — 模拟数据，不涉及真实订单　|　Version: 2

> ⚠️ 本 PR 由 **Demo 模拟数据**生成，所有价格、门店与订单均为占位内容，**不会也不会调用任何真实下单工具**。

### User Requirements

- People: 1
- Budget: ¥60.00
- Fulfillment: pickup
- Store: DEMO 门店 · 深圳科技园店 (`DEMO-STORE-0004`)
- Preference: none
- Exclusions: none

### Proposed Changes

+ 酥脆无双套餐 × 1 @ ¥36.50
  - 套餐组成（已由 `query-meal-detail` 核对）：炸鸡×1、迷你薯条×1、无糖可乐×1

### Price Check

| Item | Amount |
| --- | --- |
| Budget | ¥60.00 |
| Subtotal | ¥36.50 |
| Discount | -¥0.00 |
| Delivery fee | ¥0.00 |
| **Calculated payable** | ¥36.50 |
| Available budget left | ¥23.50 |

### Coupon Check

Applied: none — priced at menu value only.

### Nutrition Check

Status: **UNKNOWN** · official coverage 0%

- No official data: 酥脆无双套餐 x1

> UNKNOWN: no plan item matched list-nutrition-foods. Nothing is asserted.

### Validation

- [x] Products available — 1 SKU(s) confirmed present in this store's live menu.
- [x] Price calculated — calculate-price returned payable CNY 36.50.
- [x] Within budget — payable 36.50 leaves 23.50 headroom.
- [x] Coupon check — No coupon applied — priced at menu value only.
- [x] Portions adequate — 1 main(s) for 1 person(s).
- [x] Exclusions honoured — No exclusions were specified.
- [x] Combo composition verified — query-meal-detail confirmed: 酥脆无双套餐×1 = 主食×1 + 小食×1 + 饮料×1. Stacking in this plan only covers the real shortfall.
- [x] Combo options legal — No combo substitutions in this plan.
- [ ] Human approved **`UNKNOWN`** — Awaiting explicit human approval. (non-blocking)

### Review

- Approved version: v2 · fingerprint `8b32c05e9ef4`
- Current fingerprint: `8b32c05e9ef4`　(mode, store, fulfillment, items, qty, options, coupons, payable)

### Review Actions

Allowed from `ORDER_CREATED`: `MARK_PAID`, `FAIL`

Say one of: _approve this_ / _request changes_ / _reject_ / _show diff_ / _switch to a cheaper option_

### Order

- State: CREATED
- Simulated order id: DEMO-ORDER-000004 (SIMULATED)
- Payable: ¥36.50
- Payment link: none — Demo mode never issues a payment link.

> 订单创建不等于已支付，需你自行完成付款。

---

_MealPR — Don't just order. Review your meal._


<!-- scenario=demo-combo finalStatus=ORDER_CREATED simulatedOrder=DEMO-ORDER-000004 guardOk=false -->
