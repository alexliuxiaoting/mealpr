# MCP Integration

本文说明 MealPR **实际使用**的麦当劳 MCP Server、调用的 Tool、调用流程、数据校验方式与错误处理。

---

## 1. 使用的 MCP Server

| 项目 | 值 |
| --- | --- |
| 官方名称 | 麦当劳中国 MCP Server |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权方式 | `Authorization: Bearer <MCP_TOKEN>` |
| 官方仓库 | <https://github.com/M-China/mcd-mcp-server> |
| Token 申请 | <https://open.mcd.cn/mcp> |
| 限流 | 每 Token 600 次/分钟（超限返回 `429`） |
| 覆盖范围 | 中国大陆地区（不含港澳台） |

配置文件：`mcp-config.example.json`（仅含环境变量占位符 `${MCD_MCP_TOKEN}`）。

> **关于环境变量占位符**：官方 README 的示例是把 Token 明文写进 JSON。本项目按要求改为占位符。
> 若你的客户端**不支持**在 MCP 配置里展开 `${VAR}`，请在客户端的凭证/环境变量注入机制里配置 `MCD_MCP_TOKEN`，
> 或在你本地的 MCP 客户端配置中手工替换，**不要**把明文 Token 写进 Git。

---

## 2. 实际调用的 Tool

### 读操作（Skill 会自动调用）

| Tool | 业务用途 | 在 MealPR 中的作用 | 缺失时的行为 |
| --- | --- | --- | --- |
| `query-nearby-stores` | 查询附近可用门店 | pickup 场景确定候选门店 | 无法开店 → 提示用户切门店或转 Demo |
| `delivery-query-addresses` | 查询用户可配送地址 | delivery 场景选择收货地址 | 无法配送 → 提示维护地址或改到店自取 |
| `delivery-query-stores` | 查询可配送门店 | delivery 场景确定适配门店 | 同上 |
| `query-meals` | 查询门店当前可售餐品 | **候选方案的唯一商品来源** | 商品可用性检查判 `UNKNOWN`（阻断） |
| `query-meal-detail` | 查询餐品详情、套餐组成与替换项（编码参数名为 **`code`**） | 校验套餐组成与替换合法性 | 含套餐/替换项的方案判 `UNKNOWN`（阻断） |
| `query-my-coupons` | 查询我的优惠券 | 确定用户实际持有的券 | 不适用券，按原价报价 |
| `query-store-coupons` | 查询当前门店可用券 | 券与门店是否匹配 | 同上 |
| `calculate-price` | 计算金额、配送费、优惠与应付总价（**返回单位是「分」**） | **唯一权威金额来源** | `calculated:false`，方案禁止进入待审核 |
| `list-nutrition-foods` | 餐品营养信息列表 | 营养核销（可选） | `nutritionSummary.status = UNKNOWN`，不编造 |
| `query-order` | 查询订单详情 | 下单结果未知时确认状态 | 进入人工处理，不重复下单 |

### 写操作（**必须用户明确授权**）

| Tool | 触发条件 |
| --- | --- |
| `create-order` | PR 状态为 `APPROVED` **且** `assertExecutable` 全部校验通过 |
| `auto-bind-coupons` | **P0 不自动执行**（会改变用户账户券状态），需用户单独确认 |
| `cancel-order` | 仅在用户明确要求时执行 |

未在本项目中使用：`available-coupons`、`order-list`、`campaign-calendar`、`query-my-account`、`mall-*`、`query-party-*`、`party-order-create`、`draw-lottery`、`now-time-info` 等。

---

## 3. 调用流程

### 到店取餐

```
用户：「40 元以内的晚餐，到店取餐」
  │
  ├─ query-nearby-stores              → 候选门店列表
  ├─ (用户确认门店)
  ├─ query-meals(store)               → 该门店真实可售菜单
  ├─ [query-meal-detail(code)]        → 套餐组成 / 可替换项
  ├─ [query-my-coupons / query-store-coupons]
  ├─ plan.mjs                         → 1~3 个候选（菜单价预筛）
  ├─ calculate-price(candidate) × N   → 【权威金额】
  ├─ [list-nutrition-foods]           → 营养覆盖情况
  ├─ validate-plan.mjs                → 全部阻断性校验
  └─ render-pr.mjs                    → Meal PR v1 ──► 等人类审核
                                        ├─ 修改 → generate-diff.mjs → v2 → 重新审核
                                        └─ 批准 → review-state.mjs(inspect=executable)
                                                    └─ ok → create-order → PAYMENT_PENDING
```

### 外送

```
delivery-query-addresses → (选地址) → delivery-query-stores → query-meals → …… 同上
```

---

## 4. 数据校验方式

MealPR 不信任任何「看起来对」的数值：

| 数据 | 校验方式 | 不通过时的处理 |
| --- | --- | --- |
| 商品是否存在 | `items[].code` 必须出现在 `query-meals` 返回中且未标不可售 | `products-available` 判 FAIL/UNKNOWN（阻断） |
| 应付金额 | 必须来自 `calculate-price` 返回 | `price-calculated` 判 FAIL（阻断） |
| 预算 | `payable <= budget.max`，且必须已报价 | `within-budget` 判 FAIL / UNKNOWN（阻断） |
| 优惠券 | `source === 'mcp'` 且 `verified === true` | `coupons-verified` 判 UNKNOWN（阻断） |
| 份量 | 主食数量 ≥ 人数 | `portions-adequate` 判 FAIL（阻断） |
| 忌口 | 商品名 / 选项不含排除词 | `exclusions-honoured` 判 FAIL（阻断） |
| 套餐替换合法性 | 是否已调用 `query-meal-detail` | 未查则 `options-legal` 判 UNKNOWN（阻断） |
| 营养 | 仅累加 `list-nutrition-foods` 命中的商品 | 覆盖率 < 1 一律 `PARTIAL`，列出缺失项 |
| 批准是否有效 | 版本指纹（含 mode/store/fulfillment/items/options/coupons/payable）比对 | 指纹不一致 → 撤销批准，回到待审核 |

任一条阻断性校验未通过，状态机**拒绝**进入 `READY_FOR_REVIEW` 或 `APPROVED`，并且规则本身不会被放宽。

---

## 5. 错误处理

| 情况 | 恢复策略 |
| --- | --- |
| `401` Token 无效/过期 | 停止 LIVE 流程，引导重新申请 Token；**不降级为 Mock**，询问是否切 Demo |
| `429` 限流 | 指数退避重试，合并请求降低频次 |
| 读请求网络失败 / 超时 | 有界重试（最多 3 次） |
| 门店不可用 | 换门店重新提案，`version + 1` |
| 商品下架 / 售罄 | 用最新菜单重新生成候选，展示 Diff |
| 优惠券失效 | 移除券 → 重新报价 → 展示金额变化 → `version + 1` |
| 重新询价后金额变化 | 撤销已批准状态，必须重新审核 |
| `create-order` 结果未知 | 先 `query-order`；查不到则进入人工处理，**绝不静默重复下单** |
| `create-order` 明确失败 | 不自动重试，交由用户决定 |
| 参数不符合工具要求 | 重新读取该工具的实时描述，**不猜测参数反复试探** |

写操作的重试策略默认为 **maxAttempts = 1**（即不重试），与读操作的 3 次有界重试区分开。

---

## 6. 关于参数 Schema 与字段事实（重要 · 2026-10-10 更正）

**更正**：本项目早期文档写的是「官方仓库未公开各工具的输入参数 schema」，**这个说法是错的**。
实机确认：官方 MCP 的 `tools/list` **会返回每个工具的完整 `inputSchema`**。

因此本项目：

1. 不在代码或文档中**臆造**任何工具的入参字段名、类型或必填项——既然有权威 schema 可查，猜错更不可原谅；
2. 调用前由 Skill 读取 MCP 客户端中该工具的**实时描述**（`tools/list`），据实参构造参数；
3. `scripts/` 下的脚本**只处理确定性逻辑**（校验、Diff、状态机、渲染、脱敏、边界适配），**从不直接调用 MCP**；
4. 已确认的字段与单位事实固化在 `src/mcp-adapt.ts` 的 `MCP_FIELD_FACTS`，由 `tests/mcp-adapt.test.ts` 断言，避免再次写错。

### 6.1 已验证的字段事实

| # | 事实 | 早期错误假设 | 若写错的后果 |
| --- | --- | --- | --- |
| 1 | 菜单价格字段是 **`currentPrice`**（现价）/ **`originalPrice`**（原价） | 假设是 `price` | 价格全 unknown，方案无法预筛 |
| 2 | `query-meal-detail` 的编码参数是 **`code`** | 猜成 `productCode` | 直接 **HTTP 400** |
| 3 | `calculate-price` 金额单位是 **分**（`2290` = **¥22.90**） | 当成元 | 预算校验差 100 倍 |
| 4 | `tools/list` 返回完整 `inputSchema` | 以为未公开 | 少了最权威的依据 |

金额单位与字段名归一化统一走 `scripts/mcp-adapt.mjs`：

```bash
echo '{"action":"facts"}' | node mealpr/scripts/mcp-adapt.mjs
echo '{"action":"normalize-catalog","catalog":[{"code":"M-X","name":"某堡","category":"main","currentPrice":2450}],"amountUnit":"cent"}' \
  | node mealpr/scripts/mcp-adapt.mjs
echo '{"action":"normalize-quote","raw":{"payable":2290},"amountUnit":"cent"}' | node mealpr/scripts/mcp-adapt.mjs
```

它只做归一化并在缺失/可疑时**告警**，不会替你补一个数字。

### 6.2 套餐组成映射（combo）

套餐的 `category` 是 `combo`，**不是主食**。映射必须走：

```
query-meals（发现 combo）
  → query-meal-detail(code=<combo code>)
  → items[].comboComposition = { components: [...], source: 'mcp-detail' }
  → 按「人数 − 套餐已含数量」补足主食 / 饮料 / 小食
  → combo-composition-verified 变 PASS，方案才可进入待审核
```

`comboComposition` 为 `null` 时该校验是 **blocking UNKNOWN**。原因：套餐自带小食和饮料，
不知组成就叠加配餐会产生「酥脆无双套餐 + 可乐 + 苹果片」这类方案——套餐里本来就有迷你薯条和无糖可乐，
**重复计价，而人类审核者在 PR 里看不出来**。宁可拦住，不可放行。

这样设计的结果：**真实 MCP 调用只有一处出口（Agent），不可逆操作只有一道闸门（`assertExecutable`）**，便于审计与测试。

---

## 7. MCP 相比纯 LLM 推荐的价值

| 维度 | 纯 LLM 推荐 | MealPR + 麦当劳 MCP |
| --- | --- | --- |
| 商品是否真实存在 | 依赖模型记忆，可能推荐已下架商品 | 来自目标门店当前菜单 |
| 价格 | 估算值，可能已过期 | `calculate-price` 实际计算 |
| 优惠券 | 可能编造券名与折扣 | 来自真实券列表，并被报价校验 |
| 门店差异 | 默认全国同价同菜单 | 按门店分别查询 |
| 营养 | 经验值 | `list-nutrition-foods`，缺失即如实标注缺失 |
| 可追溯性 | 无 | 版本历史 + Diff + 指纹绑定的批准记录 |
| 风险控制 | 可能直接下单 | 必须人工批准 + 守卫校验 + 幂等记录 |

一句话：**MCP 让 AI 的"推荐"变成可核对的事实，而 MealPR 让这些事实在被付费之前先经过一次人类的 Code Review。**

---

## 8. 集成验证状态

| 能力 | 状态 |
| --- | --- |
| `tools/list` 返回完整 `inputSchema` | ✅ 已验证（实机） |
| 菜单价格字段名 `currentPrice` / `originalPrice` | ✅ 已验证（实机） |
| `query-meal-detail` 参数为 `code`（`productCode` → 400） | ✅ 已验证（实机，含错误路径） |
| `calculate-price` 金额单位为「分」 | ✅ 已验证（实机） |
| `query-nearby-stores` / `query-meals` 的完整返回结构 | ⚠️ **部分验证** —— 字段名与单位已确认，完整字段清单仍需记录 |
| `query-my-coupons` / `query-store-coupons` / `list-nutrition-foods` 的返回结构 | ⚠️ **未验证** —— 需要具备有效 Token 的环境执行只读集成测试 |
| `create-order` / `query-order` | ⚠️ **未验证** —— 真实下单测试需用户单独授权，不属于自动化测试范围 |
| Demo 模式全流程 | ✅ 已验证（`npm test`，120 项通过 + `npm run smoke:site`） |
| 状态机 / Diff / 预算校验 / 批准绑定 / 套餐守卫 / 脱敏 | ✅ 已验证 |

本项目**不会**把 Mock 测试的结果冒充为真实 MCP 集成成功。若你配置了 Token，请参考下文执行只读集成测试：

```bash
# 在已配置 mcd-mcp 的 WorkBuddy 会话中直接对话即可，例如：
# 「帮我查一下附近的麦当劳门店」→ 会走 query-nearby-stores
# 所有只读结果请自行脱敏后再归档。
```
