# WorkBuddy 开发记录（MealPR）

> 本文件真实记录使用腾讯 WorkBuddy 开发 MealPR 的过程，已做隐私与凭证脱敏。
> 未虚构对话与操作：以下每一条都对应本次会话中实际发生过的动作与产出。

---

## 0. 环境与目标

- 工作环境：macOS（darwin），Node.js v22.22.2，npm 10.9.7
- 工作目录：`~/Documents/mcd-developer-innovation-challenge`（初始为空目录）
- 目标：按 PRD 交付一个可安装、可运行、可测试、可开源的 WorkBuddy Skill —— **MealPR**

## 1. 需求对齐与文档核对（实际执行的动作）

在写第一行代码前，先拉取并核对了三份官方文档：

1. **WorkBuddy Skill 开发规范** — 确认 Skill 包结构为 `SKILL.md + references/ + scripts/ + templates/`，
   frontmatter 必填字段为 `description / description_zh / description_en / version / author`，
   `name` 可选，支持 `display_name / display_name_en / allowed-tools / category` 等可选字段。
2. **麦当劳 MCP 官方仓库** — 接入地址 `https://mcp.mcd.cn`，Streamable HTTP，
   `Authorization: Bearer <TOKEN>`，限流 600 次/分钟，错误码 401/429；
   获取到官方工具清单（约 30 个），其中 MealPR 需要的 9 个工具全部存在。
3. **比赛活动规则** — 活动周期 2026-10-09 → 2026-10-25 23:59，必需文件 5 个
   （`README.md` / `CONTEST_DECLARATION.md` / `MCP_INTEGRATION.md` / `mcp-config.example.json` / `workbuddy.md`），
   排名以 GitHub Star 数为准，需在官方仓库用指定 Issue 模板报名。

## 2. 关键设计决策（含取舍）

### 决策一：不许臆造 MCP 参数 —— 分层架构

**发现**：官方 MCP 仓库只公开了工具名与业务用途，**没有公开任何 tool 的入参 schema**。

**决定**：

- MCP 调用**只由 Agent 发起**，`scripts/` 下的脚本**只做确定性逻辑**（校验、Diff、状态机、渲染、脱敏），
  从不直接连接 MCP，也不自己调用 `create-order`。
- 调用前必须读取客户端里该工具的**实时描述**，不凭工具名猜参数。
- 因此 `references/mcp-tools.md` 只记录工具清单、业务用途、读/写分类与错误恢复，**不含参数定义**。

这个决策同时带来了安全收益：不可逆操作只有一道闸门（`assertExecutable`），可审计、可单测。

### 决策二：Skill 脚本零运行时依赖

`src/` 用 TypeScript + Zod 写逻辑，用 esbuild 打包成 `mealpr/scripts/*.mjs`（Node 20+ 直接可跑）。
好处：用户安装 Skill 后不需要 `npm install`；代价是脚本要做 deps-free 约束。

### 决策三：DEMO 隔离用结构保证，不是靠约定

`assertExecutable()` 对 `mode === 'DEMO'` 直接返回 `ok:false`（`reason: 'demo-mode'`）。
加上状态机本身的限制，Demo 场景**不存在**通向真实下单的代码路径，而不是"我们约定不调用"。
测试用例里显式验证了这一点（同一份计划用 LIVE 构造则可执行，用 DEMO 构造则被守卫拒绝）。

### 决策四：版本的单一真值是「指纹」

批准时对 `{ id, version, mode, store, fulfillment, items(code+qty+options), coupons, payable }`
做 sha256；下单前重算比对。这样批准后价格变了 / 商品换了 / 券失效了，批准自动作废，
不需要在各处手写一堆 if。

## 3. 实现过程（按实际顺序）

1. **工程骨架**：`package.json` / `tsconfig.json` / `vitest.config.ts` / `build.mjs` / `.gitignore`。
2. **核心类型**（`src/types.ts`）：Zod schema 描述 MealPR 内部结构，并显式声明
   「这是 MealPR 内部结构，不是 MCP 请求/响应结构」。
3. **确定性逻辑**：`intent.ts`（意图解析）、`plan.ts`（候选生成）、`validate.ts`（校验层）、
   `diff.ts`（版本差异）、`review-state.ts`（状态机 + 下单守卫）、`fingerprint.ts`（指纹）、
   `render.ts`（PR 渲染）、`redact.ts`（脱敏）、`mcp-errors.ts`（错误分类与重试策略）、`demo.ts`（Demo 层）。
4. **Skill 包**：`mealpr/SKILL.md`（含铁律、工作流、触发词、禁止项）+ 4 篇 `references/` + 3 套 fixtures。
5. **测试**：8 个测试文件，86 项断言，覆盖 PRD T01–T12。
6. **文档与交付**：README（中英）、MCP_INTEGRATION、CONTEST_DECLARATION（官方原文复制）、
   `mcp-config.example.json`（占位符）、examples、Skill ZIP。

## 4. 实际遇到的问题与修复

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | `Cannot find module '../types.js'` | `src/` 根目录下的文件用了上一级的相对路径 | 改为 `./types.js`；同时把 tsconfig 切到 `module: NodeNext` + `moduleResolution: NodeNext`（先試 Bundler 反而报 TS5110） |
| 2 | npm install 报 `EACCES: permission denied, rename '/Users/xxx/.npm/_cacache/...'` | 沙箱下用户级 npm 缓存不可写 | 改用工作区内缓存：`npm install --cache ./.npm-cache`（中途试过 `/tmp`，会被 SIGTERM 掉） |
| 3 | `SyntaxError: Invalid or unexpected token` | esbuild 的 banner 又加了一遍 shebang，而入口文件本身已有 `#!/usr/bin/env node` | 去掉 banner 里的 shebang |
| 4 | Demo 跑到 coupon-expired 场景抛异常 `cannot submit revision: within-budget:FAIL` | 该场景设计上就要求「新版因超预算被拦下」，但 runner 只会走成功分支 | 给 revision 增加 `expect: 'submit-ok' \| 'submit-blocked'`；被拦下时输出校验明细并保持 PR 停在 `CHANGES_REQUESTED` |
| 5 | Diff 末尾两个复选框都是未勾选 | `CHECK(s)` 判断 `s === 'PASS'`，但调用时传的是 `' '` / `'x'` | 直接按布尔值渲染 `[x]` / `[ ]` |
| 6 | `applyAction(CREATE_ORDER)` 后 `order.attempts` 为空，两次编辑未同时生效导致测试失败 | 同一文件的并行编辑会互相覆盖（本次踩了多次） | 改为串行编辑 / 整文件重写；并在 `CREATE_ORDER` 分支补写 attempt 台账 |
| 7 | 批准过一个从未报价的方案 | `applyAction` 只信任 PR 上缓存的 `validations`，改了 `priceQuote` 后不会重算 | 在 `SUBMIT_FOR_REVIEW` / `REVISE` 分支增加硬检查：`!priceQuote.calculated` 直接 BLOCKED |
| 8 | 仓库敏感信息扫描测试报 `src/entries/redact.ts: bearer-token@4` | 该文件的用法注释里写了一个像真的 Token 字符串 | 注释改成 `Bearer <PASTE_YOUR_TOKEN_HERE>`（不在源码里给自己开白名单） |

## 5. 测试与验收结果

```bash
$ npm test
 Test Files  8 passed (8)
      Tests  86 passed (86)

$ npm run typecheck   # tsc --noEmit，0 error
$ npm run build       # 9 个入口 -> mealpr/scripts/*.mjs
```

三套 Demo 场景均可在无 Token 环境跑完整闭环：
`node mealpr/scripts/demo.mjs all`，产出 [`examples/demo-pr.md`](examples/demo-pr.md)。

| 编号 | 场景 | 结果 |
| --- | --- | --- |
| T01 | 双人预算 ¥70 | ✅ |
| T02 | 总价超预算 | ✅ 拦截 |
| T03 | 优惠券失效重新报价 | ✅ |
| T04 | 替换饮料生成 Diff | ✅ |
| T05 | 未经批准请求下单 | ✅ 被拒 |
| T06 | 批准后商品变化 | ✅ 旧批准失效 |
| T07 | 批准后价格变化 | ✅ 需重审 |
| T08 | 重复下单 | ✅ attempt 台账拦截 |
| T09 | 401 / 429 / 写操作重试 | ✅ 分类正确，写操作不重试 |
| T10 | Demo 批准 | ✅ 仅模拟订单 |
| T11 | 营养数据缺失 | ✅ PARTIAL / UNKNOWN，不伪造 |
| T12 | 敏感信息 | ✅ 脱敏 + 仓库级扫描 |
| T13 | 套餐重复计价 | ✅ 未核对组成即阻断，核对后只补真实缺口 |
| T14 | MCP 字段与单位事实 | ✅ `currentPrice` / `code` / 分→元 固化并断言 |

## 6. 第二轮：真机验证后修掉的缺陷与订正（2026-10-10）

第一版交付后拿到了真实 MCP 访问，立刻发现一个**真实缺陷**和**三条与文档不符的 API 事实**。

### 6.1 缺陷：套餐被当成主食 → 重复计价（T13）

现象：规划器给出的第一个方案是「酥脆无双套餐 + 可乐 + 苹果片 ¥36.5」，
而那个套餐本身含炸鸡、迷你薯条和无糖可乐——**等于把套餐里已有的东西又买了一遍**，
并且人类审核者在 PR 里完全看不出来。

根因：`generateCandidates` 里 `mainPool = [...combos, ...mains]` 把套餐并进了主食池，
随后统一叠加「主食 + 饮料 + 小食」的标准组合。

修法（不只是加个 if，而是改数据模型）：

1. `MealItem` 新增 `comboComposition: { components[], source: 'mcp-detail' | 'unknown' } | null`；
2. 套餐单独走一条候选路径。组成未知 → **只出套餐本身，不叠加任何配餐**，
   并给出 `pendingDetailCodes` 与 `requiresComboDetail`；
3. 组成已知后，按「人数 − 套餐已含数量」**只补足真实缺口**；
4. 新增阻断性校验 `combo-composition-verified`：含套餐且组成未核对 → `UNKNOWN (blocking)`，
   方案**不得**进入待审核、不得批准；
5. `portions-adequate` 改为按组成内的主食数计算；组成未知时降级为 `UNKNOWN`（非阻断），
   不再把一个没拆开的套餐当成"已确认够吃"。

配套：新增第四套 Demo fixture `demo-combo.json`，演示「未核对组成被拦下 → 核对 → 移除重复项 → 重新报价」，
以及 `tests/combo.test.ts`（T13）。

### 6.2 三条 API 事实订正（T14）

| 早期假设 | 实际 |
| --- | --- |
| 菜单价格字段是 `price` | 是 **`currentPrice`**（现价）/ **`originalPrice`**（原价） |
| `query-meal-detail` 参数是 `productCode` | 是 **`code`**，传 `productCode` 直接 **400** |
| `calculate-price` 金额是元 | 是 **分**，`2290` = **¥22.90** |

第四条更正：早期文档写「官方未公开 tool 的入参 schema」——**错的**。
官方 MCP 的 `tools/list` 会返回完整 `inputSchema`。结论（不许猜参数）没变，理由更强了。

这四条没有只写进文档，而是固化成 `src/mcp-adapt.ts` 里的 `MCP_FIELD_FACTS`，由 `tests/mcp-adapt.test.ts` 断言。
同时新增边界适配脚本 `scripts/mcp-adapt.mjs`（`facts` / `normalize-catalog` / `normalize-quote` / `combo`），
负责字段名归一化和分→元转换；它只告警，不替你补数字。

### 6.3 P1：GitHub 风格可视化页面

`npm run site` 产出 `dist/mealpr-review.html`（单文件、零外部依赖）。做法上的取舍：

- **不用 Vite/React**。页面内联的是 esbuild 把 `src/web-entry.ts` 打包成的 IIFE——**就是 Skill 用的那份核心**。
  所以 Approve 按钮跑的是真实状态机，被阻断时会把守卫原话显示出来，而不是静态 UI 假装能点。
- 为了让核心能在浏览器跑，把 `fingerprint.ts` 的 `node:crypto` 换成了 `src/sha256.ts`（纯 JS SHA-256）。
  `tests/mcp-adapt.test.ts` 断言它与 `node:crypto` 逐位一致，`scripts/smoke-site.mjs`
  还会把页面里那份打包产物放进 `vm` 里跑一遍，确认与 Node 侧行为相同。
- 数据不是手抄的 mock：`src/entries/site-data.ts` 把 Demo fixture 经核心投影成 JSON 再内联。

### 6.4 踩到的坑（记一笔）

1. **沙箱里 npm 要用工作区内缓存**：`npm install --cache ./.npm-cache`，默认缓存目录不可写。
2. **Node ESM 下 tsconfig 必须同时 `module` 和 `moduleResolution` 都是 `NodeNext`**，
   只改一个会报一堆 `ERR_MODULE_NOT_FOUND` 式的类型错误。
3. **esbuild 的 banner 不能重复加 shebang**：入口文件里已有 `#!/usr/bin/env node` 时，
   banner 再加一次会产出非法文件。
4. **并行编辑同一文件会丢修改**：连续几次 `Edit` 命中同一区域时，后面的替换基于旧内容，
   改丢了就整文件 `Write` 重写，别硬凑。
5. **vm 沙箱没有 `TextEncoder`**：在 Node 里跑浏览器打包产物做冒烟测试时要手动注入
   `TextEncoder / TextDecoder / structuredClone`，否则报的错看着像 bundle 坏了。
6. **Node 运行时路径会变**：`~/.workbuddy/binaries/node/versions/22.22.2-3` 后来变成了 `-6`，
   脚本里写死路径会突然失效，按 `ls` 结果取当前版本更稳。

## 7. 尚未完成 / 已知限制（如实陈述）

- **写操作仍未验证**：读链路的字段名与单位已实机确认，`create-order` / `query-order` / `cancel-order`
  **从未真实调用过**。具备 Token 后需要补做：只读集成测试（门店、菜单、详情、券、报价、营养），
  以及**用户单独授权后**的真实下单测试。
- `query-my-coupons` / `query-store-coupons` / `list-nutrition-foods` 的完整返回结构仍未记录，
  目前按「读到什么映射什么，读不到就 unknown」处理。
- P1 只做了可视化页面，分享卡片的图片导出未实现（Markdown 分享版可用：`render-pr.mjs --share`）。
- 幂等性由 MealPR 侧指纹台账保证，不假设 MCP 提供幂等 Key 参数。

## 8. 脱敏说明

- 全文不出现 MCP Token、账号密码、手机号、邮箱、详细收货地址。
- 所有凭证位均使用占位符（`${MCD_MCP_TOKEN}`、`Bearer <PASTE_YOUR_TOKEN_HERE>`）。
- 仓库路径只保留到项目层，未记录任何个人目录细节。
- Demo fixtures 中的门店、地址均为 `DEMO-` 前缀占位内容。
- 本文件不虚构 WorkBuddy 对话内容；只记录实际执行过的操作与真实结果。
