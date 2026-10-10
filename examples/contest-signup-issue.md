# 参赛申请 Issue 文案

> 提交位置：https://github.com/M-China/mcd-developer-innovation-challenge/issues/new
> 提交截止时间：**2026-10-25 23:59（北京时间）**
> 仓库 state：公开、已含 README / CONTEST_DECLARATION / MCP_INTEGRATION / mcp-config.example.json / workbuddy.md 五个必需文件。

---

## Title（标题）

```
【参赛申请】MealPR · AI 替你点餐之前，得先开一个 Pull Request
```

## Body（正文）

```
【参赛申请】
项目名称：MealPR（Meal Pull Request）
项目地址：https://github.com/alexliuxiaoting/mealpr
项目简介：所有 AI 点餐助手都在做同一件事——你说话，它推荐，你买单。问题是：你不知道它为什么这么选，看不出它改了什么，也不知道它给出的价格是不是真的。MealPR 换了个框架：AI 不能直接替你下单，它得先开一个 Pull Request，你像 review 代码一样 review 它准备执行的这笔真实交易。具体做成了四件事。一是 Meal PR：AI 用麦当劳 MCP 的真实数据（门店、菜单、详情、优惠券、价格计算）生成一份结构化提案，包含需求、餐品、报价、优惠、营养、校验项和可执行的审核动作；报价只认 calculate-price 的返回，菜单价只用于预筛，营养只有命中官方数据才算 VERIFIED，缺一项就是 PARTIAL，不编数据。二是 Meal Diff：你说一句"饮料换成无糖的"，它重新查询、重新报价，用 diff 展示商品增删、数量变化、金额和预算剩余变化，版本 +1、状态回到待审核，此前的批准自动失效。三是 Human Approval Gate：批准绑定一个 sha256 指纹（mode、门店、配送方式、商品及数量及选项、优惠券、应付金额），商品换了、价格变了、门店改了，旧批准立刻作废必须重新审核；真正下单前还会再核一遍指纹，不一致直接拒绝执行。四是 Demo 隔离：没有 Token 也能跑，四套固定数据覆盖单人预算餐、双人庆功餐、券失效重新报价、套餐组成核对，完整走通"创建 → 修改 → Diff → 校验拦截 → 批准 → 模拟下单"；DEMO 模式下不存在通向真实 create-order 的代码路径，不是靠约定，是靠结构。关于真实使用 MCP：开发中确实踩到坑并靠 MCP 数据修掉了一个真实缺陷——早期版本把套餐当纯主食处理，会再叠加一份主食+饮料+小食，而那个套餐本身就含炸鸡、迷你薯条和无糖可乐，等于重复计价；现在 MealItem 带 comboComposition，套餐走独立候选路径，组成未核对就是阻断项，强制先查 query-meal-detail。同时订正了三条字段事实：价格字段是 currentPrice/originalPrice，query-meal-detail 的参数是 code（第一版猜成 productCode，返回 400），calculate-price 金额单位是分（2290 = ¥22.90）——这些都已固化成断言测试，不是散落在注释里。如实说明边界：写链路 create-order / query-order 因开发环境没有 Token 至今未真实执行过，读链路已按真实返回核对字段，这一点在 README、MCP_INTEGRATION.md 和 workbuddy.md 中分开写清楚，没有用 Mock 冒充集成成功。工程上：TypeScript + Zod，核心逻辑 121 项自动化测试全绿，typecheck 0 error，Skill 脚本零第三方依赖、纯 JSON in/out、不联网无副作用；另附一个 GitHub PR 风格的可视化页面（单文件 HTML，内联的是 Skill 同一份核心，Approve 按钮跑真实状态机）。本项目全程使用腾讯 WorkBuddy 开发，详见仓库内的 workbuddy.md。
```

---

## 提交命令

```bash
gh issue create \
  --repo M-China/mcd-developer-innovation-challenge \
  --title "【参赛申请】MealPR · AI 替你点餐之前，得先开一个 Pull Request" \
  --body-file /Users/heytea/Documents/mcd-developer-innovation-challenge/examples/contest-signup-issue-body.md
```

---

## 提交前自检清单

- [x] 五个必需文件齐全且命名标准
- [x] 仓库为 Public 可访问
- [x] 仓库创建时间在 2025-12-25 00:00 ~ 2026-10-25 23:59 之间
- [x] `mcp-config.example.json` 仅含环境变量占位符，无真实 Token
- [x] `workbuddy.md` 已包含（WorkBuddy 专项奖励 3000 积分所需）
- [x] 全仓库严格脱敏扫描通过（唯一命中为测试夹具假数据，已逐行核对）
- [x] 文案中的能力声明与实际代码一致，未夸大 MCP 集成范围
