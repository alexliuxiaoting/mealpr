# MealPR 工作流规范

本文件是 `SKILL.md` 的补充，描述每一步的**判定规则**。Agent 必须按顺序执行，不得跳步。

## 0. 分层职责

| 层 | 谁负责 | 能不能联网 / 调 MCP |
| --- | --- | --- |
| Skill 层 | Agent（你） | ✅ 唯一有权调用 MCP 的角色 |
| 确定性逻辑层 | `scripts/*.mjs` | ❌ 纯 stdio + JSON，离线、只读、无副作用 |

**永远不会发生的事**：脚本自己去调用 MCP、脚本自己创建订单。这样设计是为了把「不可信的外部数据」和「不可逆的执行动作」限制在唯一一层，便于审计。

## 1. 模式判定

```
尝试一次只读 MCP 调用（推荐 query-nearby-stores）
  ├── 成功且有门店数据               → LIVE
  ├── 401 / Token 未配置 / 工具不存在 → 告知用户，询问是否切 DEMO
  ├── 网络错误 / 超时                 → 有限重试后同上
  └── 用户明确要求演示               → DEMO（强制）
```

- 任何一次从 `LIVE` 降到 `DEMO` 都要明确告诉用户：**下面的数据不是真实门店数据**。
- 不允许「查不到就悄悄用 Mock 顶上」。

## 2. 必填字段收集原则

必填：`fulfillment`（取餐/配送）、`store`（门店）。
可选但有就更好：`people`、`budget`、`preferences`、`exclusions`、`nutritionGoals`。

规则：

1. **一次最多问 2 个问题**，优先问阻断性问题（没有门店就没法查菜单）。
2. 用户已经给了地址就说"我按这个位置查了几家店，你看哪一家"，而不是"请提供经纬度"。
3. 人数没说默认不猜；预算没说不设上限，但要在 PR 里标 `Budget: unset`。
4. 用户后补的信息用 `intent.mjs` 的 `baseIntent` 合并，**不得覆盖已确认的硬约束**。

## 3. 候选方案生成规则

输入：`query-meals` 的真实菜单 + 用户意图。

硬约束（违反则方案作废）：

1. 商品必须在该门店当前可售列表中（有 `code` 且未标不可售）
2. 套餐组合与替换关系必须来自 `query-meal-detail`
3. 不得包含用户明确排除的东西（忌口、无糖需求）
4. 不得超过预算（`payable`，不是菜单价）
5. 必须有过 `calculate-price` 的报价

软优化（在硬约束满足后追求）：

- 优先满足偏好（用券 / 最便宜 / 多样性 / 高蛋白）
- 压低实付金额
- 价格接近时增加品类多样性
- **营养或过敏原信息无法验证时，不许当成结论写进理由**

数量：给 1–3 个候选。**一个都给不出时，如实说明原因**（见 `plan.mjs` 输出的 `noPlanReason`），并询问是否调整预算/人数/门店。**不许擅自放宽硬约束。**

## 4. 报价规则（金额的唯一来源）

- `payable` **只能**来自 `calculate-price`。
- 菜单价相乘只能用于**预筛**（`plan.mjs` 的 `estimatedTotal`），不能写进 PR 的「应付金额」。
- 报价失败 → `calculated: false` + `unverifiedReason`，该方案**禁止进入 READY_FOR_REVIEW**。
- 下列任一项变化必须重新报价：商品、数量、套餐选项、门店、配送方式、优惠券。
- 「节省了多少」只在**同一商品组合有可比报价**时展示。禁止用「原价 100 现价 60」这种自己算出来的对比。

## 5. 优惠券规则

- 可用性判定依据：`query-my-coupons` / `query-store-coupons` 的返回。
- 用户口述的券不算数，必须查到。
- 查不到 / 券在报价时被判不可用 → 从方案里移除 → 重新报价 → 展示金额变化 → **`version + 1`**。
- **禁止自动调用 `auto-bind-coupons`**（会改变用户账户券状态，属写操作）。用户明确要求时，需单独确认再调用。

## 6. 营养规则

- 数据源：`list-nutrition-foods`。
- 只有**命中官方数据**的商品才能计入合计。
- `coverage < 1` → `PARTIAL`，必须在输出里列出「哪些商品没有官方数据」。
- `coverage = 0` → `UNKNOWN`。
- 用户设了热量/蛋白目标也只能作为软性偏好，**不得因为找不到达标组合就编造数值**。

## 7. 版本与 Diff

触发 `version + 1` 的事件（必须同时清除已有批准）：

- 商品新增/删除/数量变化
- 套餐选项变化
- 优惠券集合变化
- 门店变化
- 配送方式变化
- 应付金额变化

Diff 必须包含：商品增删、数量变化、选项变化、券变化、应付金额变化、预算剩余变化、营养变化（可用时）。

每次修改后：

```
Request Changes → 重新查询 → 新版本 → validate-plan → generate-diff → 渲染 → READY_FOR_REVIEW（重新等待批准）
```

## 8. 批准→执行

```
READY_FOR_REVIEW --(明确批准)--> APPROVED --(assertExecutable ok)--> create-order --> ORDER_CREATED --> PAYMENT_PENDING
```

执行前必跑 `review-state.mjs --file '{pr, inspect:"executable"}'`。返回 `ok:false` 时按 `reason` 向用户解释，**不得绕过**。

常见 `reason`：

| reason | 用户侧解释 |
| --- | --- |
| `demo-mode` | Demo 模式只能模拟下单 |
| `not-approved` | 还没批准，我不替你决定 |
| `price-not-calculated` | 金额没算出来，不能下单 |
| `unverified-coupon` | 券还没验证，按无券价格来还是等你确认券？ |
| `no-store` / `no-fulfillment` | 门店/取餐方式还没定 |
| `plan-changed-after-approval` | 你批准之后价格/商品变了，请重新审核 |

## 9. 出餐后

- 返回：订单号、订单状态、实付金额、官方支付链接（如有）。
- **必须说清：订单已创建 ≠ 已完成支付，需要你自行完成付款。**
- 支付链接只在 LIVE 模式下展示。
