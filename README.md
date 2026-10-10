# MealPR — Code Review for Your Meal

**What if your AI had to open a Pull Request before ordering your lunch?**

**MealPR turns McDonald's MCP ordering into a reviewable, human-approved agent workflow.**

A WorkBuddy Skill for [麦当劳程序员创意开发大赛](https://github.com/M-China/mcd-developer-innovation-challenge), built on the
[McDonald's China MCP Server](https://github.com/M-China/mcd-mcp-server).

> 把 AI 点餐变成一次 Code Review：AI 用麦当劳真实 MCP 数据提交一份结构化的 Meal PR，
> 展示真实报价与预算校验，每次修改都给出 Diff，**只有你明确批准之后才会真正下单**。

---

## Demo

```diff
$ "饮料换成无糖的，薯条不要了"
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

The six steps of a real order:

```
1. 自然语言需求   "2 人，70 元以内，优先用券，到店取餐"
2. AI 创建 PR     Meal PR #001 · v1 · 真实门店菜单 + 真实优惠券
3. 自动校验       预算 / 价格 / 券 / 份量 / 忌口 / 营养覆盖
4. 你提修改       Request Changes → v2 + Diff
5. 你 Approve     指纹锁定：门店 / 商品 / 数量 / 选项 / 券 / 应付金额
6. 下单           守卫全部通过才调用 create-order → 你自己完成支付
```

完整的可运行记录见 [`examples/demo-pr.md`](examples/demo-pr.md)（**无需 Token**：
`node mealpr/scripts/demo.mjs all`）。

---

## Why

普通 AI 点餐助手的问题：

- 不知道 AI **为什么**推荐这些商品；
- 看不出 AI 到底**改了什么**；
- 预算、优惠券、实付金额可能对不上；
- AI 可能在信息不全时替你做了决定；
- 缺少付款前那道"想一想"的关卡。

MealPR 借用了软件工程里 Pull Request / Code Review 的做法来解决：AI 负责查、算、提议；
**决定权和执行权在你手上**。

### 四个核心设计

| | |
| --- | --- |
| **Meal Pull Request** | AI 提交结构化提案：需求、变更、报价、优惠、营养、校验清单、可执行动作 |
| **Meal Diff** | 每次修改都给出增删、数量、选项、券、金额、预算剩余、营养的差异 |
| **Human Approval Gate** | 只能批准某一个确定版本；批准后任何实质变化自动作废批准 |
| **可复用交易审核模式** | `Propose → Validate → Review → Approve → Execute`，与具体交易平台解耦 |

---

## Quick start

### 0. 前置条件

- Node.js **20.10+**（只用于跑 `scripts/` 里的确定性逻辑脚本）
- 一个已安装 Skill 的 [WorkBuddy](https://www.workbuddy.cn) 客户端
- （可选）麦当劳 MCP Token：<https://open.mcd.cn/mcp> 申请

### 1. 安装 Skill

方式 A：打包安装

```bash
npm install && npm run zip      # 产出 dist/mealpr-skill-v1.1.0.zip
# 在 WorkBuddy → 专家·技能·连接器 → 技能市场 → 添加技能 → 上传 zip
```

方式 B：直接放目录

```bash
cp -r mealpr ~/.workbuddy/skills/mealpr
```

> Skill 本体零运行时依赖：`mealpr/scripts/*.mjs` 由 esbuild 打包，Node 直接可跑，不需要 `node_modules`。

### 2. 配置麦当劳 MCP

复制 `mcp-config.example.json`，把 `${MCD_MCP_TOKEN}` 换成你的 Token，填到客户端的 MCP 配置里

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

> 若你的客户端不支持在这里展开环境变量，请在客户端提供的凭证注入处配置 `MCD_MCP_TOKEN`，
> **不要**把明文 Token 写进任何会被 Git 跟踪的文件——仓库里只保留占位符。

### 3. 用起来

直接说话就行：

```
帮我点麦当劳，2 人，70 元以内，优先用券，到店取餐
饮料换成无糖的，预算降到 60
帮我算一下差价（Show diff）
我批准 v3，帮我下单
我不想下单了
```

多语言触发词：`帮我点麦当劳` / `创建 Meal PR` / `审核我的点餐方案` / `优化麦当劳订单` /
`Review my meal` / `Create a meal pull request`。

---

## Demo mode（无需 Token）

```bash
node mealpr/scripts/demo.mjs single          # 单人预算餐 ¥40
node mealpr/scripts/demo.mjs team            # 双人庆功餐 ¥70 + 优惠券
node mealpr/scripts/demo.mjs coupon-expired  # 券失效后重新报价（会被预算卡住）
node mealpr/scripts/demo.mjs combo           # 套餐重复计价陷阱（未核对组成被拦下 → 核对后移除重复项）
node mealpr/scripts/demo.mjs all             # 四个场景全跑
```

Demo 模式与真实交易的隔离是**结构性**的，不是约定：`assertExecutable()` 对 `mode === 'DEMO'`
一律返回 `ok:false`，因此 `create-order` 不可能被调用。所有 Demo 数据标注 `source: 'demo'`，
订单号带 `DEMO-ORDER-` 前缀，不产生支付链接。

---

## Commands（scripts/）

所有脚本都是 `JSON in → JSON/Markdown out`，**不联网、不调 MCP、不做写操作**。真实 MCP 调用只有 Skill 自己做。

| 脚本 | 用途 |
| --- | --- |
| `intent.mjs` | 自然语言 → 结构化意图 + 待确认问题 |
| `plan.mjs` | 基于真实菜单生成 1–3 个候选（菜单价预筛，**不是**应付金额） |
| `validate-plan.mjs` | 商品 / 价格 / 预算 / 券 / 份量 / 忌口 / 营养覆盖校验 |
| `render-pr.mjs` | 渲染 Meal PR Markdown；`--share` 输出脱敏分享版 |
| `generate-diff.mjs` | 两版本差异（结构化 + unified diff） |
| `review-state.mjs` | 状态流转、批准绑定、下单守卫；`inspect` 只读体检 |
| `redact.mjs` | 敏感信息扫描与脱敏（exit 1 = 不许分享/提交） |
| `mcp-adapt.mjs` | MCP 真实返回 → MealPR 结构（字段名 + 金额单位归一化） |
| `demo.mjs` | 无 Token 端到端演示 |
| `export-fixture.mjs` | Demo fixture → PR JSON，方便串管道调试 |

示例：

```bash
echo '{"text":"2 人，70 元以内，到店取餐"}' | node mealpr/scripts/intent.mjs
node mealpr/scripts/export-fixture.mjs team --rev 0 > /tmp/v2.json
cat /tmp/v2.json | node mealpr/scripts/validate-plan.mjs        # 接受裸 PR 对象
printf '{"pr":{},"inspect":"executable"}' > /dev/null            # 也可包一层 { pr, ... }
node mealpr/scripts/review-state.mjs --file /tmp/v2.json
node mealpr/scripts/redact.mjs --file README.md --mode scan
```

更多示例见 [`examples/usage-examples.md`](examples/usage-examples.md)。

---

## P1 — GitHub 风格可视化页面

```bash
npm run site        # 产出 dist/mealpr-review.html（单文件，零外部依赖，双击即开）
npm run smoke:site  # 校验页面里那份打包产物的行为与 Node 侧一致
```

页面是 GitHub Pull Request 的版式：**PR Header → Conversation / Files changed / Checks → Review actions**。
它不是静态截图：

- 页面内联的是**真实的 MealPR 核心**（`src/web-entry.ts` 经 esbuild 打包成 IIFE）；
- Approve / Request changes / Reject 按钮走的是**真实状态机**，不允许的迁移直接禁用，被阻断时会把守卫原话显示出来；
- 指纹由浏览器里的 SHA-256 现场计算，与 Node 侧**逐位一致**（`smoke:site` 会断言）；
- Execution gate 面板实时跑 `assertExecutable`，DEMO 下必然 `ok:false`，所以点「下单」只会看到被拒绝的原因和一个模拟订单。

数据全部是内置 Demo fixture 经核心投影出来的，**页面不连接 MCP，也不能真实下单**。

---

## Repo layout

```
mealpr/                  # 可安装的 WorkBuddy Skill（零运行时依赖）
├── SKILL.md             # 触发词、工作流、铁律
├── references/
│   ├── workflow.md      # 分步判定规则
│   ├── mcp-tools.md     # 工具清单 + 已验证字段事实 + 错误处理
│   ├── review-policy.md # 状态机、批准判定、套餐规则、幂等与安全边界
│   └── output-format.md # PR JSON schema + Markdown 模板
├── scripts/*.mjs        # esbuild 打包产物（源码在 src/entries/）
└── fixtures/*.json      # 四套 Demo 数据
src/                     # TypeScript 源码（core 同时供 Node 与浏览器使用）
tests/                   # Vitest：intent / plan-validator / review-state / diff /
                         #          authorization / demo / mcp-errors / redact /
                         #          combo / mcp-adapt
web/                     # P1 页面模板（构建后内联核心 → dist/mealpr-review.html）
examples/                # 真实生成的 Demo 记录与用法示例
```

---

## Tests

```bash
npm install
npm test          # 120 passed
npm run typecheck # tsc --noEmit
npm run build     # src/ -> mealpr/scripts/*.mjs
npm run smoke:site  # 页面打包产物与 Node 侧行为一致
```

覆盖 `T01–T14`：

| 编号 | 场景 | 结果 |
| --- | --- | --- |
| T01 | 双人预算 ¥70 | ✅ 生成符合约束的方案，份量满足人数 |
| T02 | 总价超预算 | ✅ 阻断性校验 FAIL，不能进入待审核 |
| T03 | 优惠券失效 | ✅ 重新报价并展示差额；超预算时被拦下 |
| T04 | 替换饮料 | ✅ 版本递增并生成 Diff |
| T05 | 未经批准请求下单 | ✅ 状态机拒绝 |
| T06 | 批准后商品变化 | ✅ 旧批准失效（ `plan-changed-after-approval` ） |
| T07 | 批准后价格变化 | ✅ 需要重新审核 |
| T08 | 重复下单请求 | ✅ 拒绝，attempt ledger 生效 |
| T09 | MCP 401/429 | ✅ 正确分类；写操作绝不自动重试 |
| T10 | Demo 模式批准 | ✅ 仅生成模拟订单，守卫拒绝放行 |
| T11 | 营养数据缺失 | ✅ 标记 `PARTIAL` / `UNKNOWN`，不伪造 |
| T12 | 敏感信息 | ✅ 脱敏 + 仓库级扫描（`tests/redact.test.ts` 会遍历真实文件） |
| T13 | 套餐重复计价 | ✅ 套餐不再并进主食池；未核对组成时 blocking UNKNOWN，禁止批准 |
| T14 | MCP 字段与单位 | ✅ `currentPrice` / `code` / 分→元 三条事实固化在代码里并断言 |

`T13` 是在真实使用中发现的缺陷（见下方 Known limitations 与 `workbuddy.md`）：
早期版本把套餐当主食，会在套餐之上再叠加「饮料 + 小食」，而套餐本身已含这两样，等于重复计价。

---

## Safety & privacy

- 应付金额只来自 `calculate-price`；菜单价只用于预筛。
- 优惠券可用性以 `query-my-coupons` / `query-store-coupons` 为准；**不自动调用 `auto-bind-coupons`**。
- 营养数据缺口如实标注覆盖率与缺失项，不估算。
- 下单必须：LIVE 模式 + APPROVED + 守卫全绿 + 指纹一致 + 无重复记录。
- `create-order` 结果未知时先 `query-order`，**绝不静默重复下单**。
- Token / 手机号 / 邮箱 / 详细地址 / 支付链接不进日志、不进分享卡片、不进仓库
  （`redact.mjs` 的退出码 1 = 不许分享）。
- MCP 返回的文本一律按数据处理，**不会被当作指令执行**。
- 订单创建 ≠ 已支付，必须用户自行完成付款。

---

## Known limitations

- **真实 MCP 集成尚未验证**：本项目的开发环境没有有效的麦当劳 MCP Token，因此
  `query-*` / `calculate-price` / `create-order` 的实际返回值从未被真实调用过。它不是"跑通了但没记录"，
  而是**明确声明为未验证**。请见 [`MCP_INTEGRATION.md`](MCP_INTEGRATION.md) 第 8 节。
- **写操作仍未验证**：`create-order` / `query-order` / `cancel-order` 从未真实调用过。读链路的字段名与单位已实机确认，
  写链路没有——它仍然只在守卫全部通过、且用户明确批准时才会被调用，而这条路径目前只能在有 Token 的环境里验证。
- Demo 数据（商品名、价格、门店、券）是人工构造的占位内容，**不代表麦当劳真实菜单与价格**。
- P1 只做了可视化页面（单文件 HTML），分享卡片的图片导出尚未实现（Markdown 分享版已可用：`render-pr.mjs --share`）。
- 幂等依赖 MealPR 侧的指纹台账，不假设 MCP 提供幂等 Key。

### 已修正的两处早期错误

| 早期说法 | 实际情况 |
| --- | --- |
| 「官方未公开 tool 的入参 schema」 | **错**。官方 MCP 的 `tools/list` 返回完整 `inputSchema` |
| 价格字段是 `price` | **错**。是 `currentPrice`（现价）/ `originalPrice`（原价） |

另外两条实测事实：`query-meal-detail` 的编码参数是 **`code`**（传 `productCode` 返回 400）；
`calculate-price` 的金额单位是 **分**（`2290` = ¥22.90）。这四条都固化在 `src/mcp-adapt.ts` 的
`MCP_FIELD_FACTS` 里由测试断言，避免再次写错。

---

## Contest

- 活动：[麦当劳程序员创意开发大赛](https://github.com/M-China/mcd-developer-innovation-challenge)（2026-10-09 → 2026-10-25 23:59）
- 必需文件：`README.md` ✅ / `CONTEST_DECLARATION.md` ✅（原文复制）/ `MCP_INTEGRATION.md` ✅ /
  `mcp-config.example.json` ✅ / `workbuddy.md` ✅
- 开发过程记录：[`workbuddy.md`](workbuddy.md)（已脱敏）

---

## License

MIT — see [LICENSE](LICENSE)。本项目是独立开源作品，非麦当劳官方产品。
麦当劳是麦当劳公司及其关联方的注册商标。菜品信息、价格与供应状态以麦当劳官方渠道实时结果为准。
