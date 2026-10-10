# MealPR 项目长期记忆

## 项目定位

MealPR — 把麦当劳 MCP 点餐变成 GitHub 风格的 Pull Request：AI 提案 + 校验，人类审阅 Diff 并批准，
只有明确批准才允许 `create-order`。WorkBuddy Skill 形式，参赛作品（2026 麦当劳程序员创意开发大赛）。

仓库：`https://github.com/alexliuxiaoting/mealpr`（Public，分支 `main`，gh 别名 origin）

## 比赛规则要点（已核对 activityGuidelines.md 原文）

- **排名依据是 GitHub 公开 Star 数，不是技术评分**。前 100 名进榜单；Star 为 0 不进榜。
  → 排名 ≠ 评审质量，**不要误导自己或他人把"做得好"等同于"排名高"**。
- 关键时间：活动截止 **2026-10-25 23:59**；榜单数据截止 **2026-10-26 00:00**。
- 同一 GitHub 账号多个项目只取 Star 最高的进榜。
- WorkBuddy 专项奖励（进榜每人 3000 积分）需要仓库内有 `workbuddy.md`。
- 明令禁止刷 Star、多账号重复报名等不正当手段，被发现直接取消资格 —— **不要碰**。
- 报名方式：在官方仓库用 Issue 提交【参赛申请】，正文含项目名称/项目地址/项目简介。
  官方仓库实际没有 `.github/ISSUE_TEMPLATE`，但已有 340+ 份申请，惯例：
  标题 `【参赛申请】项目名 · 一句话钩子`，正文一段有密度的自述，末尾声明 WorkBuddy 使用情况。

## 不可动摇的工程约束（改代码前先读）

1. **不臆造 MCP 接口**：调用前读实时工具描述。已验证的三条字段事实固化在 `src/mcp-adapt.ts`
   并由 `tests/mcp-adapt.test.ts` 断言：`currentPrice/originalPrice`、`query-meal-detail` 参数
   是 `code`（猜 `productCode` 会 400）、`calculate-price` 单位是**分**（2290 = ¥22.90）。
   tools/list 返回完整 inputSchema —— 早期文档说"官方未公开"是错的，已订正。
2. **套餐不得当纯主食**：`MealItem.comboComposition` 承载组成，未核对是阻断项。
   这个 bug 曾导致重复计价（套餐自带薯条可乐又叠加一份）。别把套餐放回通用 main 池。
3. **DEMO 模式结构性隔离**：`assertExecutable()` 对 `mode==='DEMO'` 必 false，不存在通向真实下单的路径。
4. **批准绑定 sha256 指纹**：mode/store/fulfillment/items+数量+选项/coupons/payable，任何变化作废批准。
5. **写链路 create-order / query-order 至今未真实执行过**（无 Token）。读链路已按真实返回核对字段。
   两者在文档里必须**分开标注**，禁止把 Mock 覆盖说成集成成功。
6. 营养数据缺失必须标 PARTIAL/UNKNOWN，不得声称 VERIFIED。

## 环境踩坑

- Node 运行时路径会漂移（`22.22.2-3` → `-6`），别写死路径，用 `export PATH=.../bin:$PATH`。
- npm 在沙箱下要用工作区内缓存：`--cache ./.npm-cache`。
- TS Node ESM 需 `module` + `moduleResolution` 同时设 NodeNext。
- esbuild banner 不能重复加 shebang。
- vm 沙箱缺 `TextEncoder`，跑浏览器 bundle 冒烟需手动注入，否则报错像 bundle 坏了。
- build 全量打包会把只给网页用的 `site-data` 打进 Skill → build.mjs 有 `SKIP` 集合。
- 脱敏扫描**逐文件起 node 很慢**（81 文件 2m22s），改用单进程 esbuild bundle 扫描是秒级。
- `npx vitest run` 在机器高负载时会从 2s 涨到近 3 分钟并可能被前端超时杀掉 → 后台跑再取结果。
