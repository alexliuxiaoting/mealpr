# 麦当劳 MCP 工具清单与接入约定

> ✅ **更正（2026-10-10）**：本文件早期版本写的是"官方未公开参数定义"。**这个说法是错的。**
> 官方 MCP 的 `tools/list` **会返回每个工具的完整 `inputSchema`**，所以参数永远有权威依据可查。
> 结论没变、理由更强：**调用前先读 `tools/list` 的实时描述，严禁凭工具名猜参数**——猜错会直接拿 `400`（实测 `query-meal-detail` 传 `productCode` 就是 400，正确参数是 `code`）。
>
> 本文件仍然**不抄录** schema，因为：schema 应由客户端实时读取，抄进文档只会过期。

## 0. 已验证的字段事实（实机确认，与早期假设不同）

| # | 事实 | 早期错误假设 | 后果 |
| --- | --- | --- | --- |
| 1 | 菜单价格字段是 **`currentPrice`**（现价）/ **`originalPrice`**（原价） | 假设是 `price` | 读不到价格 → 方案价格全 unknown |
| 2 | `query-meal-detail` 的编码参数是 **`code`** | 猜成 `productCode` | 直接 **HTTP 400** |
| 3 | `calculate-price` 金额单位是 **分**（`2290` = **¥22.90**） | 当成元 | 预算校验差 100 倍 |
| 4 | `tools/list` 返回完整 `inputSchema` | 以为未公开 | 之前的"不许猜"少了最有力的依据 |

这些事实以代码形式固化在 `src/mcp-adapt.ts` 的 `MCP_FIELD_FACTS` 里，`tests/mcp-adapt.test.ts` 会断言它们。*注意：实机验证只覆盖了读操作链路，`create-order` 从未真实调用过。*

## 1. 连接信息

| 项目 | 值 |
| --- | --- |
| MCP Server | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权 | `Authorization: Bearer <MCP_TOKEN>` |
| Token 申请入口 | <https://open.mcd.cn/mcp> |
| 限流 | 每个 Token **600 次/分钟**，超限返回 `429` |
| 官方仓库 | <https://github.com/M-China/mcd-mcp-server> |

配置示例见仓库根目录 `mcp-config.example.json`（仅含环境变量占位符）。

## 2. 错误码

| code | 原因 | 处理 |
| --- | --- | --- |
| `401` | Token 无效 / 过期 / 未提供 | 引导重新申请 Token，**不降级为 Mock**，询问是否切 Demo |
| `429` | 触发限流 | 指数退避后重试，合并请求降低频率 |

## 3. 工具清单（官方 README 摘录）

MealPR **实际使用**的工具：

| Tool | 业务用途 | 读/写 | MealPR 中的调用时机 |
| --- | --- | --- | --- |
| `query-nearby-stores` | 查询附近可用门店 | 读 | pickup：确定候选门店 |
| `query-meals` | 查询门店当前可售餐品列表 | 读 | 生成候选方案的唯一商品来源 |
| `query-meal-detail` | 查询餐品详情、套餐组成与可替换项 | 读 | 方案含套餐/定制时校验合法性 |
| `query-my-coupons` | 查询我的优惠券 | 读 | 用户倾向于用券时 |
| `query-store-coupons` | 查询当前门店可用券 | 读 | 同上，且必须与门店匹配 |
| `calculate-price` | 计算商品金额、配送费、优惠与应付总价 | 读 | **唯一权威金额来源** |
| `list-nutrition-foods` | 餐品营养信息（能量、蛋白、脂肪、碳水、钠、钙等） | 读 | 用户提到热量/蛋白/健身时 |
| `create-order` | 创建订单，返回订单详情与支付链接 | **写** | 仅在 `assertExecutable` 通过后 |
| `query-order` | 查询订单状态、内容与配送信息 | 读 | 下单结果未知时先查，不重复下单 |
| `delivery-query-addresses` | 查询用户可配送地址列表 | 读 | delivery：选择收货地址 |
| `delivery-query-stores` | 查询可配送门店列表 | 读 | delivery：确定适配门店 |

**明确不自动调用**的工具（写操作 / 会改变用户账户状态）：

| Tool | 风险 | 策略 |
| --- | --- | --- |
| `auto-bind-coupons` | 一键领取所有可用券，改变用户账户券状态 | P0 不自动执行，需用户单独确认 |
| `cancel-order` | 取消订单，不可逆 | 仅在用户明确要求时执行 |
| `create-order` | 创建真实订单 | 仅在明确批准 + 守卫通过后执行 |
| `draw-lottery` / `mall-create-order` / `party-order-create` | 消耗积分或创建其他类型订单 | 本项目不涉及 |

官方 MCP 还有 `order-list`、`campaign-calendar`、`available-coupons`、`query-my-account`、`mall-*`、`query-party-*`、`now-time-info` 等工具，MealPR 当前版本未使用，留作扩展。

## 4. 调用流程

**pickup**

```
query-nearby-stores → (用户选店) → query-meals → [query-meal-detail]
  → [query-my-coupons / query-store-coupons] → calculate-price
  → [list-nutrition-foods] → 生成 PR → 人工审核 → create-order
```

**delivery**

```
delivery-query-addresses → (用户选地址) → delivery-query-stores → query-meals
  → [query-meal-detail] → [query-my-coupons / query-store-coupons]
  → calculate-price → [list-nutrition-foods] → 生成 PR → 人工审核 → create-order
```

## 5. 数据映射约定

MCP 返回的字段名以**实际返回为准**。Agent 负责把工具返回值映射到 MealPR 内部结构后再交给 `scripts/`。映射关系：

| MealPR 字段 | 数据来源（字段名已实机确认） |
| --- | --- |
| `store.id` / `store.name` | 门店工具返回的门店标识与名称 |
| `items[].code` | 菜单工具返回的餐品编码 |
| `items[].name` / `category` | 菜单工具返回的名称与分类 |
| `items[].unitPrice` | 菜单工具的 **`currentPrice`**（**仅用于预筛**） |
| `items[].listPrice` | 菜单工具的 **`originalPrice`**（仅用于展示原价） |
| `items[].comboComposition` | `query-meal-detail(code=...)` 返回的组成；未调用则为 `null` |
| `items[].options[]` | 详情工具返回的套餐替换项 |
| `coupons[].id` / `name` | 优惠券工具返回的券标识与名称 |
| `priceQuote.payable` | **`calculate-price` 返回的应付总价 ÷ 100**（原始单位是分） |
| `priceQuote.discountTotal` | `calculate-price` 返回的优惠金额 ÷ 100 |
| `priceQuote.deliveryFee` | `calculate-price` 返回的配送费 ÷ 100（pickup 为 0 或缺失） |
| `nutritionTable[]` | `list-nutrition-foods` 中命中该餐品的营养行 |

**映射时不得补默认值冒充真实数据**。拿不到就留 `null` / `unknown`，由校验层标 `UNKNOWN`。
单位转换、字段名归一化统一交给 `scripts/mcp-adapt.mjs`；它只会告警，不会替你填数。

### 5.1 套餐（combo）映射与重复计价

套餐的 `category` 是 `combo`，**不要**把它并进主食池。映射顺序：

```
query-meals  →  发现 combo
   →  query-meal-detail(code=<combo code>)
   →  items[].comboComposition = { components: [...], source: 'mcp-detail' }
   →  按「人数 − 套餐已含数量」补足主食/饮料/小食
   →  validate-plan 的 combo-composition-verified 变 PASS
```

`comboComposition` 为 `null` 时该校验是 **blocking UNKNOWN**，方案无法进入待审核。这是硬规则，不是提示。

## 6. 错误恢复

| 场景 | 策略 |
| --- | --- |
| 查询失败（网络/5xx/超时） | 读操作有界重试，最多 3 次，指数退避；仍失败则如实告知 |
| `429` | 退避重试，降低调用频率，合并请求 |
| `401` | 停止 LIVE 流程，引导重新申请 Token，询问是否切 Demo |
| 门店不可用 | 换门店重新提案，`version + 1` |
| 商品下架/售罄 | 用当前菜单重新生成候选，`version + 1`，展示 Diff |
| 优惠券不可用 | 移除该券 → 重新报价 → 展示金额变化 → `version + 1` |
| 价格重新计算后变化 | 撤销已批准状态，回到待审核，**必须让用户重新批准** |
| `create-order` 结果未知 | 先 `query-order` 查状态；查不到则进入人工处理，**绝不静默重复下单** |
| `create-order` 明确失败 | 不自动重试，交由用户决定是否再试 |

## 7. 与纯 LLM 推荐的差别

| 维度 | 纯 LLM 推荐 | MealPR + MCP |
| --- | --- | --- |
| 商品是否存在 | 凭记忆，可能推荐已下架商品 | 来自门店当前菜单 |
| 价格 | 估算，可能过期 | `calculate-price` 实际计算 |
| 优惠券 | 可能编造 | 来自真实券列表，且被报价校验 |
| 门店差异 | 假设全国统一 | 按门店分别查询 |
| 营养 | 记忆中的经验值 | `list-nutrition-foods`，缺失即标注缺失 |
| 执行 | 无法下单或越权下单 | 必须人工批准 + 守卫校验 |
| 结果可追溯 | 无 | 版本历史 + Diff + 指纹绑定的批准记录 |
