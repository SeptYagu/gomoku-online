# 当前任务交接文档

更新日期：2026-06-25

本文件是新窗口、新代理或后续阶段接手时的第一入口。每次阶段性完成后必须更新本文件。

## 1. Snapshot

项目路径：

```text
D:\OneDrive\AiPrograms\gomoku-online
```

远程仓库：

```text
git@github.com:SeptYagu/gomoku-online.git
```

当前分支：

```text
main
```

本轮提交前最近已确认推送点：

```text
20a813d docs: require timestamped subagent reports
```

说明：本文件会随着后续提交继续变化。接手时以 `git log --oneline -1` 和 `git status --short --branch` 的实时输出为准。

本轮阶段 0 重做文档更新前确认：

```text
git status --short --branch
## main...origin/main
 M next-env.d.ts
 M src/app/globals.css
 M src/app/layout.tsx
 M src/app/page.tsx
 M src/components/GameShell.tsx
 M src/components/GomokuBoard.tsx
 M src/game/board.test.ts
 M src/game/board.ts
?? docs/subagents/20260625-001746-stage0-redo-rules-实现-Slate.md
?? docs/subagents/20260625-001746-stage0-redo-ui-实现-Vega.md
?? src/app/[locale]/
?? src/components/DocumentLocaleSync.tsx
?? src/components/LocaleSwitcher.tsx
?? src/components/ThemeToggle.tsx
?? src/i18n/
?? src/lib/
```

## 2. Environment

已确认本机环境：

```text
Node.js v24.14.0
npm 11.9.0
PowerShell
```

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

默认本地地址：

```text
http://localhost:3000
```

可用脚本：

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

当前项目暂不需要 `.env` 才能运行基础页面。以后接入数据库、广告、账号或 Socket 服务时，必须补环境变量说明。

## 3. Git 与密钥状态

- 远程使用 SSH：`git@github.com:SeptYagu/gomoku-online.git`。
- 本地已配置 repo-local deploy key，位于 `.ssh/`。
- `.ssh/` 已被 `.gitignore` 忽略，不能提交。
- `.research/` 已被忽略，不能提交参考仓库。
- `.env`、`.env.*`、`*.apk`、`*.log` 已被忽略。
- 禁止 force push，除非用户明确要求。

当前 `.gitignore` 已覆盖：

```text
.ssh/
.env
.env.*
node_modules/
.next/
*.log
*.apk
.research/
```

## 4. 当前目标

当前目标是收口阶段 1 本地可玩增强切片，并进入下一轮阶段 1/SEO 或后续功能派发：

- 阶段 1 已完成本地双人/AI 模式切换、Easy/Normal AI、悔棋、重开、终局锁定、六语言新增文案、黑暗模式兼容和移动端布局增强。
- Ember 实现报告已落档：`docs/subagents/20260625-stage1-local-ai-实现-Ember.md`。
- Atlas 独立验证兼记录已通过完整命令门禁和真实 Chrome 浏览器验收。
- Iris 交互热修复已完成：补强按钮、棋盘点位和触控命中规则。
- Lyra 返工已完成：恢复核心交互区 lucide SVG 图标，并保留 SVG `pointer-events: none`、`aria-hidden`、`focusable=false` 和 pointer/touch 加固。
- Nora 最终独立验证兼记录已通过 Lyra 返工后的最终状态，确认 `/en` 桌面棋盘落子、AI 按钮、Easy/Normal、AI 不覆盖玩家、Undo/New game、lucide 图标不抢 pointer 命中，以及 `/ar` 390x844 移动端 AI 按钮和棋盘点击均可用。
- 本轮阶段报告已落档：`docs/STAGE_1_REPORT.md`。
- 后续仍默认使用“独立验证兼记录子代理”完成验证执行、验证报告、阶段报告和 `docs/HANDOFF.md` 的验证状态收口；该角色不能修代码，不能修改实现内容。

## 5. 已完成

- 初始化 Next.js 16 + React 19 + TypeScript 项目。
- 实现 15x15 棋盘、本地双人落子、基础胜负检测。
- 推送初始阶段 0。
- 增加“默认英语 + 联合国六种官方语言 + 黑暗模式”硬性要求。
- 建立 `docs/logic/` 模块研究目录。
- 派出多个研究子代理并整合模块研究：
  - 实时好友房。
  - 大厅与匹配。
  - 规则引擎。
  - AI 引擎。
  - 评分与排行榜。
  - AI Worker 与设置持久化。
  - 多语言与主题。
- 新增并完善 `docs/STANDARD_RESEARCH_WORKFLOW.md`。
- 新增并完善 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`。
- 新增并完善本交接文档 `docs/HANDOFF.md`。
- 阶段 0 重做 UI 子代理已完成：
  - 根路径 `/` 重定向 `/en`。
  - `/en`、`/zh`、`/fr`、`/es`、`/ru`、`/ar` 六语言入口。
  - 六语言字典。
  - 阿拉伯语 RTL，棋盘保持 LTR。
  - 浅色/黑暗模式切换、主题 token 和 `localStorage` 持久化。
  - UI 子代理自测 `git diff --check`、`npm run lint`、`npm run build` 通过。
- 阶段 0 重做规则子代理已完成：
  - `isValidMove`
  - `getEmptyCells`
  - `getLegalMoves`
  - `getNearbyMoves`
  - `getWinLine`
  - `hasWon`
  - `getGameResult`
  - `checkWin` 改为保留长连完整胜线。
  - 规则子代理自测 `npm test` 和 `git diff --check` 通过。
- 阶段 0 重做文档子代理已更新：
  - `docs/STAGE_0_REPORT.md`
  - `docs/HANDOFF.md`
  - `docs/subagents/20260625-001746-stage0-redo-docs-实现-Quill.md`
- 阶段 0 重做独立验证报告 Aster 已完成：
  - `npm test` 通过。
  - `npm run lint` 通过。
  - `npm run build` 通过。
  - `npm audit --omit=dev` 通过，0 vulnerabilities。
  - `git diff --check` 通过，仅有 LF/CRLF 工作副本提示。
  - 真实 Chrome/CDP 浏览器验收覆盖 `/` 重定向 `/en`、六语言路由、桌面 1440x900、移动 390x844、棋盘落子、`/ar` RTL 且棋盘 LTR、主题切换和刷新持久化。
  - 验证报告：`docs/subagents/20260625-001746-stage0-redo-验证-Aster.md`
- 阶段 0 重做验证兼记录口径已回填：
  - `docs/STAGE_0_REPORT.md`
  - `docs/HANDOFF.md`
  - `docs/subagents/20260625-001746-stage0-redo-verify-docs-实现-Lumen.md`
- 流程规范已合并验证执行、验证报告和验证状态收口职责为“独立验证兼记录子代理”：
  - `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`
  - `docs/STANDARD_RESEARCH_WORKFLOW.md`
  - `docs/HANDOFF.md`
  - `docs/subagents/README.md`
  - `docs/subagents/20260625-workflow-merge-verify-docs-实现-Cedar.md`
- workflow-merge-verify-docs 独立验证兼记录已通过：
  - `git diff --check` 通过，仅有 LF/CRLF 工作副本提示。
  - 关键规则文本已用 `rg` 定位核对。
  - 验证报告：`docs/subagents/20260625-workflow-merge-verify-docs-验证兼记录-Orion.md`
- 阶段 1 本地可玩增强实现已完成：
  - 本地双人/AI 模式切换。
  - Easy/Normal AI 初版。
  - 本地悔棋、AI 悔棋、重开。
  - 终局后禁止继续落子。
  - 六语言新增按钮和 AI 文案。
  - 黑暗模式和移动端布局补强。
  - 实现报告：`docs/subagents/20260625-stage1-local-ai-实现-Ember.md`
- 阶段 1 独立验证兼记录已通过：
  - `npm test` 通过，2 个测试文件、21 个测试用例。
  - `npm run lint` 通过。
  - `npm run build` 首次因 `.next` 文件锁失败；清理生成缓存后重试通过。
  - `npm audit --omit=dev` 通过，0 vulnerabilities。
  - `git diff --check` 通过，仅有 LF/CRLF 工作副本提示。
  - 系统 Chrome + Playwright Core 浏览器验收覆盖 `/en` 桌面、AI 模式、终局锁定、`/ar` 移动端 RTL/LTR、浅色/黑暗模式和六语言新增文案。
  - 验证报告：`docs/subagents/20260625-stage1-local-ai-验证兼记录-Atlas.md`
- 阶段 1 交互热修复已完成并通过最终独立验证兼记录：
  - 实现报告：`docs/subagents/20260625-stage1-interaction-hotfix-实现-Iris.md`
  - 返工报告：`docs/subagents/20260625-stage1-interaction-hotfix-icon-refine-返工-Lyra.md`
  - 验证报告：`docs/subagents/20260625-stage1-interaction-hotfix-验证兼记录-Maris.md`
  - 最终验证报告：`docs/subagents/20260625-stage1-interaction-hotfix-final-验证兼记录-Nora.md`
  - `npm test` 通过，2 个测试文件、21 个测试用例。
  - `npm run lint` 通过。
  - `npm run build` 通过；Maris 复验时首次因 `.next/server/app/ar.segments` 文件锁失败，确认 3000 端口旧 `node.exe` 进程 PID `34416` 后停止该进程，重试通过；Nora 最终复验一次通过。
  - `npm audit --omit=dev` 通过，0 vulnerabilities。
  - `git diff --check` 通过，仅有 LF/CRLF 工作副本提示。
  - 系统 Chrome `149.0.7827.155` + Chrome DevTools Protocol 浏览器验收覆盖 `/en` 桌面落子、AI 按钮、Easy/Normal、AI 不覆盖玩家、Undo/New game、lucide SVG 不抢 pointer 命中、`/ar` 390x844 移动端 AI 按钮和棋盘点击。
  - 控制台未见阻断交互的 runtime/hydration/click handler 错误。

## 6. Verification Matrix

| 范围 | 命令 | 状态 | 说明 |
| --- | --- | --- | --- |
| 初版阶段 0 代码基线 | `npm test` | 通过 | 初版阶段 0 完整验证时通过，7 个测试 |
| 初版阶段 0 代码基线 | `npm run lint` | 通过 | 初版阶段 0 完整验证时通过 |
| 初版阶段 0 代码基线 | `npm run build` | 通过 | 初版阶段 0 完整验证时通过 |
| 初版阶段 0 代码基线 | `npm audit --omit=dev` | 通过 | 初版阶段 0 完整验证时通过，0 vulnerabilities |
| workflow/handoff 文档基线 | `git diff --check` | 通过 | 提交 `0b6a74c` 前通过 |
| stage0-redo UI | `git diff --check` | 通过 | UI 子代理自测，仅有 LF/CRLF 工作副本提示 |
| stage0-redo UI | `npm run lint` | 通过 | UI 子代理自测 |
| stage0-redo UI | `npm run build` | 通过 | UI 子代理自测；构建输出包含 `/` 和六语言 locale 路径 |
| stage0-redo 规则 | `npm test` | 通过 | 规则子代理自测，1 个测试文件，16 个测试用例 |
| stage0-redo 规则 | `git diff --check` | 通过 | 规则子代理自测，仅有 LF/CRLF 工作副本提示 |
| stage0-redo 文档 | `git diff --check` | 通过 | 文档子代理本轮实际运行；未运行完整代码门禁 |
| stage0-redo 独立验证 | `npm test` | 通过 | Aster 验证，1 个测试文件，16 个测试用例 |
| stage0-redo 独立验证 | `npm run lint` | 通过 | Aster 验证 |
| stage0-redo 独立验证 | `npm run build` | 通过 | Aster 验证，Next.js production build 成功 |
| stage0-redo 独立验证 | `npm audit --omit=dev` | 通过 | Aster 验证，0 vulnerabilities |
| stage0-redo 独立验证 | `git diff --check` | 通过 | Aster 验证，仅有 LF/CRLF 工作副本提示 |
| stage0-redo 浏览器验收 | 真实 Chrome/CDP 浏览器检查 | 通过 | Aster 覆盖 `/` 重定向 `/en`、六语言、RTL、浅色/黑暗、主题刷新持久化、桌面 1440x900、移动 390x844、棋盘落子 |
| stage0-redo 验证兼记录收口 | `git diff --check` | 通过 | Lumen 本轮实际运行；仅更新允许范围内文档 |
| workflow merge verify docs | `git diff --check` | 通过 | Cedar 本轮实际运行；仅有 LF/CRLF 工作副本提示 |
| workflow merge verify docs 独立验证兼记录 | `git diff --check` + `rg` 关键规则定位 | 通过 | Orion 验证，确认验证兼记录角色合并、授权边界、返工路径、派发枚举、报告目录和 HANDOFF 收口口径均已落实 |
| stage1-local-ai 实现自测 | `npm test` | 通过 | Ember 自测，2 个测试文件，21 个测试用例 |
| stage1-local-ai 实现自测 | `npm run lint` | 通过 | Ember 自测 |
| stage1-local-ai 实现自测 | `npm run build` | 通过 | Ember 自测 |
| stage1-local-ai 实现自测 | `git diff --check` | 通过 | Ember 自测，仅有 LF/CRLF 工作副本提示 |
| stage1-local-ai 独立验证兼记录 | `npm test` | 通过 | Atlas 验证，2 个测试文件，21 个测试用例 |
| stage1-local-ai 独立验证兼记录 | `npm run lint` | 通过 | Atlas 验证 |
| stage1-local-ai 独立验证兼记录 | `npm run build` | 通过 | Atlas 验证；首次 `.next/server/app/ar.segments` 文件锁失败，清理生成缓存后重试通过 |
| stage1-local-ai 独立验证兼记录 | `npm audit --omit=dev` | 通过 | Atlas 验证，0 vulnerabilities |
| stage1-local-ai 独立验证兼记录 | `git diff --check` | 通过 | Atlas 验证，仅有 LF/CRLF 工作副本提示 |
| stage1-local-ai 浏览器验收 | 系统 Chrome + Playwright Core | 通过 | Atlas 覆盖 `/en` 桌面本地/AI、Easy/Normal、AI 不占已有格、AI 悔棋、终局锁定、胜线/最后一步、`/ar` 390x844 RTL 且棋盘 LTR、浅色/黑暗模式和六语言新增文案；in-app Browser 插件因工具侧 `sandboxPolicy` 元数据错误不可用 |
| stage1-interaction-hotfix 独立验证兼记录 | `npm test` | 通过 | Maris 验证，2 个测试文件、21 个测试用例 |
| stage1-interaction-hotfix 独立验证兼记录 | `npm run lint` | 通过 | Maris 验证 |
| stage1-interaction-hotfix 独立验证兼记录 | `npm run build` | 通过 | Maris 验证；首次 `.next/server/app/ar.segments` 文件锁失败，停止 3000 端口旧 `node.exe` 进程后重试通过 |
| stage1-interaction-hotfix 独立验证兼记录 | `npm audit --omit=dev` | 通过 | Maris 验证，0 vulnerabilities |
| stage1-interaction-hotfix 独立验证兼记录 | `git diff --check` | 通过 | Maris 验证，仅有 LF/CRLF 工作副本提示 |
| stage1-interaction-hotfix 浏览器验收 | 系统 Chrome + Chrome DevTools Protocol | 通过 | Maris 覆盖 `/en` 桌面空点点击 moves 0 -> 1、AI 按钮可点击且显示 Easy/Normal、AI Easy/Normal 落子 1 黑 1 白且不覆盖玩家、Undo/New game 状态变化、`/ar` 390x844 移动端 AI 按钮和棋盘点击；控制台无阻断交互错误 |
| stage1-interaction-hotfix-final 独立验证兼记录 | `npm test` | 通过 | Nora 验证，2 个测试文件、21 个测试用例 |
| stage1-interaction-hotfix-final 独立验证兼记录 | `npm run lint` | 通过 | Nora 验证 |
| stage1-interaction-hotfix-final 独立验证兼记录 | `npm run build` | 通过 | Nora 验证，Next.js 16.2.9 生产构建一次通过 |
| stage1-interaction-hotfix-final 独立验证兼记录 | `npm audit --omit=dev` | 通过 | Nora 验证，0 vulnerabilities |
| stage1-interaction-hotfix-final 独立验证兼记录 | `git diff --check` | 通过 | Nora 验证，仅有 LF/CRLF 工作副本提示 |
| stage1-interaction-hotfix-final 浏览器验收 | 系统 Chrome + Chrome DevTools Protocol | 通过 | Nora 覆盖 Lyra 返工后最终状态：`/en` 桌面空点点击 moves 0 -> 1、AI 按钮可点击且显示 Easy/Normal、AI Easy/Normal 落子 1 黑 1 白且不覆盖玩家、Normal active、Undo/New game、lucide SVG 存在且不抢 pointer 命中、`/ar` 390x844 移动端 AI 按钮和棋盘点击；控制台无阻断交互错误 |

代码改动后必须重新运行完整门禁。UI 改动还必须做真实浏览器检查。

## 7. 当前代码地图

| 领域 | 文件 |
| --- | --- |
| 根路径重定向 | `src/app/page.tsx` |
| 语言路由页面 | `src/app/[locale]/page.tsx` |
| HTML metadata/layout | `src/app/layout.tsx` |
| 全局样式与主题 token | `src/app/globals.css` |
| 游戏容器 | `src/components/GameShell.tsx` |
| 棋盘组件 | `src/components/GomokuBoard.tsx` |
| 文档 locale/dir 同步 | `src/components/DocumentLocaleSync.tsx` |
| 语言切换 | `src/components/LocaleSwitcher.tsx` |
| 主题切换 | `src/components/ThemeToggle.tsx` |
| i18n 配置 | `src/i18n/config.ts` |
| 六语言字典 | `src/i18n/dictionaries.ts` |
| 主题工具 | `src/lib/theme.ts` |
| 规则逻辑 | `src/game/board.ts` |
| 规则类型 | `src/game/types.ts` |
| 规则测试 | `src/game/board.test.ts` |
| AI 逻辑 | `src/game/ai.ts` |
| AI 测试 | `src/game/ai.test.ts` |
| Vitest 配置 | `vitest.config.ts` |
| Next 配置 | `next.config.ts` |

## 8. 当前文档入口

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/REUSE_EVALUATION.md`
- `docs/STAGE_0_REPORT.md`
- `docs/STAGE_1_REPORT.md`
- `docs/STANDARD_RESEARCH_WORKFLOW.md`
- `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`
- `docs/HANDOFF.md`
- `docs/subagents/README.md`
- `docs/logic/README.md`

模块研究：

- `docs/logic/realtime-room-module.md`
- `docs/logic/lobby-matchmaking-module.md`
- `docs/logic/rating-leaderboard-module.md`
- `docs/logic/rules-engine-module.md`
- `docs/logic/ai-engine-module.md`
- `docs/logic/ai-worker-persistence-module.md`
- `docs/logic/i18n-theme-module.md`

## 9. 子代理结果摘要

实时好友房：

- `scheng20/gomoku-online` 的短房间码、两人房和 Socket.IO room 广播值得参考。
- 严重风险是服务端信任客户端提交的 board/color/room。
- 我们必须服务端权威，只接受落子意图。

大厅与匹配：

- `minh100/Gomoku` 的大厅列表、找局、私密房流程有参考价值。
- 严重风险是客户端筛选房间、push 玩家数组、明文密码下发、REST/socket 双路径竞态。
- 我们应做服务端匹配队列、私密房 password hash、分页 + 增量更新。

评分与排行榜：

- `minh100/Gomoku` 有 rating、排行榜、离开扣分流程。
- 严重风险是随机加减分、客户端提交 winner、广播全用户、无幂等和无事务。
- 我们应做 ELO、服务端权威结算、有效局、游客榜分离、分页 API、增量事件。

规则引擎：

- `sen-ltd/gomoku-ai` 的 15x15、不可变 board、lastMove 四方向扫描、nearby candidates 可迁移/改写。
- 当前项目已补齐 `isValidMove`、`getEmptyCells`、`getLegalMoves`、`getNearbyMoves`、`getWinLine`、`hasWon`、`getGameResult`。
- 当前 `checkWin` 已改为通过 `getWinLine` 保留五连或以上的完整连续胜线。

AI 引擎：

- `sen-ltd/gomoku-ai` 的 minimax + alpha-beta + pattern scoring 可作为阶段 1/6 主要参考。
- `yyjhao/HTML5-Gomoku` 的 Worker、增量评分、cache、NegaScout 可作为后期思路。
- 阶段 1 先做 Easy/Normal，Hard 后续 Worker 化。

AI Worker 与设置持久化：

- `yyjhao/HTML5-Gomoku` 的 Worker 消息流和悔棋同步值得参考。
- 不能复制旧式全局 JS；我们应使用 `requestId + boardVersion` 防旧结果落子。
- 设置用 versioned JSON schema，语言/主题同步 cookie + localStorage。

多语言与主题：

- `sen-ltd/gomoku-ai` 的轻量字典和 dark class 模式可参考。
- 当前项目已建立 `[locale]` 路由、六语言字典、RTL、主题 token、主题切换和 `localStorage` 持久化。
- Aster 已完成独立浏览器验收；后续 UI/SEO 改动需要继续覆盖六语言、RTL 和主题持久化。

阶段 1 本地可玩增强：

- Ember 已完成本地双人/AI 模式切换、Easy/Normal AI、悔棋、重开和终局锁定。
- Atlas 已完成独立验证兼记录，确认 `/en` 桌面、`/ar` 移动端、六语言文案和浅色/黑暗模式通过。
- Iris 已完成交互热修复，Maris 已复验通过，确认“无法落子、AI 按钮点不动”在生产服务真实 Chrome 点击路径下不再复现。
- Lyra 已完成图标返工，Nora 已最终复验通过，确认恢复 lucide 图标后“无法落子、AI 按钮点不动”仍不复现，且图标不抢 pointer 命中。
- in-app Browser 插件本轮不可用，已用系统 Chrome + Playwright Core 完成真实浏览器验收。

## 10. 下一步派发表

| 优先级 | 子代理 | 目标 | 允许修改范围 | 禁止范围 | 输入文档 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 实现 SEO | 补多语言 metadata、`hreflang`、canonical/alternate 和 sitemap 基础 | `src/app/**`、必要配置、相关文档 | 不做广告、Socket、排行榜 | `WEBSITE_BUILD_PLAN.md`、`docs/logic/i18n-theme-module.md` | 六语言 SEO 链接正确，build 通过 |
| P2 | 实现 AI 测试补强 | 为 Normal AI 增加更完整的活二、活三、冲四、活四评分矩阵测试 | `src/game/**`、必要测试报告 | 不做 Hard AI Worker | `docs/logic/ai-engine-module.md`、`docs/STAGE_1_REPORT.md` | AI 测试覆盖关键棋型，`npm test` 通过 |
| P2 | 实现移动端手感细化 | 细化触摸目标、状态区信息密度和小屏视觉回归 | `src/components/**`、`src/app/globals.css`、必要文档 | 不做广告接入、在线服务 | `docs/STAGE_1_REPORT.md` | 390px 手机和 1024px 平板真实浏览器验收通过 |

建议先不要做：

- Socket.IO 在线对战。
- 排行榜。
- 真实广告。
- Hard AI。

这些属于后续阶段。当前 stage1-local-ai 已完成独立验证，可以进入 SEO、AI 测试补强或移动端手感细化等后续工作。

## 11. Risk Register

| 风险 | 严重级别 | 触发条件 | 缓解方案 | 阶段 |
| --- | --- | --- | --- | --- |
| 客户端伪造胜负或评分 | blocker | 在线对战、排行榜上线 | 服务端权威、幂等结算、事务 | 在线阶段 |
| 无许可证源码误复制 | blocker | 参考 `scheng20`、`minh100` 等许可证不清项目 | 只参考流程，不复制源码 | 全阶段 |
| 六语言/RTL 回归 | major | 新 UI 文案绕过字典或破坏 `dir` | 新增文案必须进字典，浏览器覆盖 `ar` | 全阶段 |
| 黑暗模式回归 | major | 新样式绕过 token 或只写浅色 | 使用主题 token，浏览器覆盖 light/dark | 全阶段 |
| 广告影响棋盘误触 | major | 广告靠近棋盘或按钮 | 广告位远离高频点击区，浏览器验收 | 商业化阶段 |
| AI 计算阻塞 UI | major | Hard AI 在主线程运行 | Worker 化、requestId、boardVersion | AI 阶段 |
| 共享文件并行冲突 | major | 多代理同时改 `src/app/**`、字典、全局 CSS | 主控指定 owner，串行合并 | 全阶段 |
| AI 棋型覆盖不足 | minor | Normal AI 后续被要求具备更稳定棋力 | 增加活二、活三、冲四、活四评分矩阵测试；Hard AI 阶段前补 Worker 设计 | AI 阶段 |
| 构建缓存文件锁 | note | Windows/OneDrive 下 `.next` 旧缓存被进程或属性锁住 | 停止本项目 Next 进程，确认路径后清理 `.next` 生成缓存再 build | 本地验证 |
| 旧 dev 进程/HMR 干扰交互验证 | note | 3000 端口残留旧 Next dev 进程、HMR WebSocket 异常或 Fast Refresh 状态异常 | 记录旧进程 PID 和启动时间；优先使用生产服务复验；必要时停止本项目旧 Next 进程后重试 | 本地验证 |

## 12. Do / Do Not

必须做：

- 每个阶段遵循 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`。
- 参考项目研究遵循 `docs/STANDARD_RESEARCH_WORKFLOW.md`。
- 每次阶段完成更新本文件。
- 每次使用子代理后，把子代理报告落到 `docs/subagents/`，并在本文件记录路径。
- 验证通过后，由验证兼记录子代理按授权更新验证矩阵、阶段报告、`docs/HANDOFF.md` 中的验证状态和报告路径。
- 验证失败时，验证兼记录子代理只记录问题和证据；blocker/major 由主控派返工子代理处理，复测仍由验证兼记录子代理完成。
- 每次代码改动做测试、lint、build。
- 每次 UI 改动做真实浏览器检查。
- 每次提交前检查 `git status --short --branch` 和 `git diff --check`。

禁止做：

- 不提交 `.ssh/`、`.research/`、APK、`.env`、日志。
- 不复制无 LICENSE 项目源码。
- 不提前做真实广告接入。
- 不提前做排行榜或在线评分。
- 不让客户端决定在线胜负、评分、房间状态。
- 不把广告放在棋盘或按钮附近。
- 不让验证兼记录子代理修代码或修改实现内容。
- 不再默认单独派验证后的文档收口角色；验证记录和文档状态收口归入验证兼记录角色。

## 13. 本轮子代理报告

stage0-redo：

- `docs/subagents/20260625-001746-stage0-redo-ui-实现-Vega.md`
- `docs/subagents/20260625-001746-stage0-redo-rules-实现-Slate.md`
- `docs/subagents/20260625-001746-stage0-redo-docs-实现-Quill.md`
- `docs/subagents/20260625-001746-stage0-redo-验证-Aster.md`
- `docs/subagents/20260625-001746-stage0-redo-verify-docs-实现-Lumen.md`
- `docs/subagents/20260625-001746-stage0-redo-snapshot-docs-实现-Mira.md`

流程规范补强：

- `docs/subagents/20260625-流程规范补强-实现-Hubble.md`
- `docs/subagents/20260625-流程规范补强-验证-Nova.md`

workflow-merge-verify-docs：

- `docs/subagents/20260625-workflow-merge-verify-docs-实现-Cedar.md`
- `docs/subagents/20260625-workflow-merge-verify-docs-验证兼记录-Orion.md`

stage1-local-ai：

- `docs/subagents/20260625-stage1-local-ai-实现-Ember.md`
- `docs/subagents/20260625-stage1-local-ai-验证兼记录-Atlas.md`
- `docs/subagents/20260625-stage1-interaction-hotfix-实现-Iris.md`
- `docs/subagents/20260625-stage1-interaction-hotfix-验证兼记录-Maris.md`
- `docs/subagents/20260625-stage1-interaction-hotfix-icon-refine-返工-Lyra.md`
- `docs/subagents/20260625-stage1-interaction-hotfix-final-验证兼记录-Nora.md`
- `docs/STAGE_1_REPORT.md`

## 14. 交接更新模板

每次阶段性完成后，把以下信息补进本文件：

```text
本轮目标：
实际完成：
修改文件：
本轮子代理报告文档路径：
验证命令和结果：
未验证项及原因：
最新提交：
是否已推送：
下一步建议：
风险变化：
```
