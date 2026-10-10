# 审核策略（Review Policy）

## 1. 状态定义

| 状态 | 含义 | 用户看到的文案 |
| --- | --- | --- |
| `DRAFT` | 方案正在组装，**未经过 MCP 校验** | 还在生成中 |
| `READY_FOR_REVIEW` | 已通过全部阻断性校验，**正在等你审核** | 可以批准，也可以提修改 |
| `CHANGES_REQUESTED` | 你提了修改意见，等待新版本 | 收到，正在改 |
| `APPROVED` | 你批准了**当前这个版本**，指纹已锁定 | 已批准，可以下单 |
| `ORDER_CREATED` | 订单已创建成功 | 订单已生成 |
| `PAYMENT_PENDING` | 待支付 | **请自行完成支付** |
| `REJECTED` | 放弃该方案 | 已作废 |
| `FAILED` | 执行出错且无法自动恢复 | 需要处理 |

**四条状态不得混为一谈**：AI 生成了方案 ≠ MCP 校验通过 ≠ 人类批准 ≠ 订单已创建 ≠ 用户已支付。

## 2. 合法转移

```
DRAFT            → READY_FOR_REVIEW | REJECTED | FAILED
READY_FOR_REVIEW → APPROVED | CHANGES_REQUESTED | REVISE | REJECTED | FAILED
CHANGES_REQUESTED→ READY_FOR_REVIEW | REJECTED | FAILED
APPROVED         → ORDER_CREATED | REVISE | REQUEST_CHANGES | REJECTED | FAILED
ORDER_CREATED    → PAYMENT_PENDING | FAILED
PAYMENT_PENDING  → FAILED
REJECTED         → (终态)
FAILED           → (终态)
```

进入 `READY_FOR_REVIEW` 和 `APPROVED` 都必须先通过全部阻断性校验，校验不通过时状态流转会被拒绝，并且**不许通过修改校验规则让它通过**。

## 3. 什么是「明确批准」

**算批准**

- 「批准」「通过」「OK 就这个」
- 「approve」「approved」「LGTM」「ship it」
- 「就按这个下单」「确认这个方案，帮我下单」
- 「同意 v3」

**不算批准**（必须回到 `READY_FOR_REVIEW` 并追问）

- 「看起来不错」「还行」「大概可以」「先这样吧」
- 「等一下」「我再想想」
- 「便宜点的话我就买」（附条件）
- 当前版本已经变化时针对旧版本的表述
- 任何出现在「回答我的澄清问题」过程中的措辞

**拿不准时**，输出一句确认：「你是要我现在按 v3 提交真实订单吗？这一步不可撤销。」

**绝对禁止**：把用户的模糊表达当作批准来执行下单。

## 4. 版本与指纹绑定

指纹（sha256）覆盖以下字段，任一变化即导致指纹变化：

```
pr.id, version, mode, store.id, fulfillment,
items[].{code, quantity, options[]}, 已验证 coupons[].id, priceQuote.payable
```

批准时保存 `approval.fingerprint` 与 `version`。下单前重新计算并比对：

- 一致 → 允许执行
- 不一致 → **旧批准立即失效**，回到 `READY_FOR_REVIEW`，把变化展示给用户

也就是说：**批准后价格变了、商品换了、门店改了、券失效了，都必须重新批准。**

## 4b. 套餐组成核对（blocking）

`items[].category === 'combo'` 时：

| 情况 | `combo-composition-verified` | 结果 |
| --- | --- | --- |
| 无套餐 | PASS（非阻断） | 正常 |
| 有套餐，`comboComposition.source === 'mcp-detail'` | PASS（阻断项） | 份量按组成内的主食计数 |
| 有套餐，组成未读取（`null` 或 `source: 'unknown'`） | **UNKNOWN（阻断项）** | **不得进入 READY_FOR_REVIEW / 不得批准** |

同时 `portions-adequate` 在套餐组成未知时降级为 UNKNOWN（非阻断）——不允许把一个未拆开的套餐当成"已确认够吃"。

**为什么这是阻断项而不是提示**：套餐自带小食和饮料。不知道组成就叠加配餐，会产生「酥脆无双套餐 + 可乐 + 苹果片」这种方案——套餐里本来就有迷你薯条和无糖可乐，等于重复计价，而人类审核者在 PR 里看不出来。宁可拦住，不可放行。

**禁止**为了让方案通过而把这项改成 PASS 或改成非阻断。正确做法是去调 `query-meal-detail`。

## 5. 下单守卫（assertExecutable）

全部满足才能调用 `create-order`：

1. `mode === LIVE`
2. `status === APPROVED`
3. `priceQuote.calculated === true`（金额来自真实报价）
4. `items` 非空
5. `store.id` 已确定
6. `fulfillment` 已确定
7. 所有优惠券均已验证且来源为 `mcp`
8. 当前指纹与批准时一致
9. 该指纹下没有已成功的下单记录

任一条不满足就返回具体 `reason`，由 Agent 翻译成人话告诉用户，**不得绕过**。

## 6. 幂等与异常

- 每次尝试下单都会记录 `{ requestFingerprint, outcome, orderId }`。
- 同一指纹已存在 `SUCCESS` 记录 → 拒绝再次下单。
- `create-order` 超时或网络中断 → **不立即重发**：
  1. 先用 `query-order` 查状态
  2. 查到已创建 → 走正常流程告知用户
  3. 查不到 → 进入人工处理，**明确告知"订单可能已创建"**
  4. **禁止静默重复创建**
- 不假设 MCP 提供幂等 Key 参数；幂等性由 MealPR 侧的指纹记录保证。

## 7. Demo 模式的隔离

- `mode === DEMO` 时，`assertExecutable` 必然返回 `ok:false`（reason `demo-mode`）。
- Demo 数据全部来自 `fixtures/*.json`，`source` 字段标记为 `demo`，订单号前缀 `DEMO-ORDER-`。
- Demo **不产生支付链接**，不调用任何真实 MCP 工具。
- 这是结构上的保证：不是"我们约定不调用"，而是守卫函数不会放行。

## 8. 权限边界

| 动作 | 默认 | 需要用户明确授权 |
| --- | --- | --- |
| 查询门店/菜单/券/营养 | ✅ 自动 | — |
| `calculate-price` | ✅ 自动 | — |
| 生成 PR、生成 Diff | ✅ 自动 | — |
| `create-order` | ❌ | ✅ 明确批准当前版本 |
| `auto-bind-coupons` | ❌ | ✅ 单独确认 |
| `cancel-order` | ❌ | ✅ 单独确认 |
