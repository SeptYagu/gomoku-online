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

当前已确认功能推送点：

```text
ee7d3e4 Implement generated opening book runtime
```

当前已确认交接文档推送点：

```text
b8e4a35 Update handoff for opening book runtime
```

说明：本文件会随着后续提交继续变化。接手时以 `git log --oneline -1` 和 `git status --short --branch` 的实时输出为准。

本轮 handoff 二次校准前确认：

```text
git status --short --branch
## main...origin/main

git log -1 --oneline --decorate
b8e4a35 (HEAD -> main, origin/main) Update handoff for opening book runtime
```

历史 stage0-redo 文档更新前状态（保留作追溯，不代表当前工作区）：

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

当前功能基线已完成阶段 1 本地可玩增强、交互热修复和 opening-book-runtime 接入。下一轮可进入 SEO、强开局库生成与精选、AI 测试补强或移动端手感细化等后续派发：

- 阶段 1 已完成本地双人/AI 模式切换、悔棋、重开、终局锁定、六语言新增文案、黑暗模式兼容和移动端布局增强。
- Ember 实现报告已落档：`docs/subagents/20260625-stage1-local-ai-实现-Ember.md`。
- Atlas 独立验证兼记录已通过完整命令门禁和真实 Chrome 浏览器验收。
- Iris 交互热修复已完成：补强按钮、棋盘点位和触控命中规则。
- Lyra 返工已完成：恢复核心交互区 lucide SVG 图标，并保留 SVG `pointer-events: none`、`aria-hidden`、`focusable=false` 和 pointer/touch 加固。
- Nora 最终独立验证兼记录已通过 Lyra 返工后的最终状态，确认 `/en` 桌面棋盘落子、AI 按钮、Easy/Normal、AI 不覆盖玩家、Undo/New game、lucide 图标不抢 pointer 命中，以及 `/ar` 390x844 移动端 AI 按钮和棋盘点击均可用。
- 本轮阶段报告已落档：`docs/STAGE_1_REPORT.md`。
- 后续仍默认使用“独立验证兼记录子代理”完成验证执行、验证报告、阶段报告和 `docs/HANDOFF.md` 的验证状态收口；该角色不能修代码，不能修改实现内容。
- 最新 AI/开局库工作已完成并推送到 `ee7d3e4`：运行时只使用 `data/openings/generated/standard-26-insane-8ply-1s.sgf` 这一套生成开局库，不再混入旧手写库。
- 当前开局库配置：同一套 26 条标准开局、每条 8 手；Normal/Hard/Expert/Insane 分别最多使用 2/4/6/8 手。
- 当前 AI 仍是项目内自写 TypeScript 引擎，可按商业发布方向继续闭源使用；未引入 GPL/AGPL 外部引擎、WASM、权重或第三方开局数据库。

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
- AI 引擎和开局库近期工作已完成：
  - Insane 搜索深度保留 8 层，最大思考预算 30 秒。
  - Normal/Hard/Expert/Insane 最大思考预算分别为 1/5/10/30 秒，提前完成、命中开局库或战术立即返回。
  - Hard/Expert/Insane 支持浏览器 Worker 根候选分片并行搜索，按用户设备核心数最多使用 2/3/4 个 Worker。
  - 搜索超时路径使用 best-so-far；页面硬超时也有 50ms 主线程应急搜索兜底。
  - `tools/engine-arena.ts` 已支持新旧引擎自动对弈、随机开局、胜率和胜方前 8 手开局线统计。
  - `tools/generate-opening-book.ts` 已支持从标准 26 开局前三手出发，用当前引擎推演 SGF 开局库。
  - `docs/OPENING_BOOK_GENERATION_PLAN.md` 已记录 16 手、每开局 3 变体、10 秒/步的强开局库生成计划。
  - `data/openings/generated/standard-26-insane-8ply-1s.sgf` 已作为当前正式 SGF 源资产。
  - `src/game/opening-book.ts` 已作为当前运行时开局库数据。
  - `src/game/ai.ts` 已移除旧手写开局库，运行时只引用 `GENERATED_OPENING_BOOK_LINES`。

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
| opening-book-runtime | `npm test` | 通过 | `ee7d3e4` 提交前通过，2 个测试文件、34 个测试用例；新增生成开局库加载和难度深度门控测试 |
| opening-book-runtime | `npm run lint` | 通过 | `ee7d3e4` 提交前通过 |
| opening-book-runtime | `npm run build` | 通过 | 首次因旧 Next dev 进程锁住 `.next/static/...` EPERM 失败；停止本项目 3000 端口 Next 进程、确认路径后清理 `.next`，重试通过 |
| opening-book-runtime | `git diff --check` | 通过 | 仅有 LF/CRLF 工作副本提示 |
| opening-book-runtime 浏览器验收 | 系统 Chrome/Chromium + Chrome DevTools Protocol | 通过 | `/zh` 人机模式、玩家先手、疯狂档；点击中心后出现 1 黑 1 白，状态回到“黑棋回合”，控制台无阻断错误 |

代码改动后必须重新运行完整门禁。UI 改动还必须做真实浏览器检查。

## 7. 当前代码地图

| 领域 | 文件 |
| --- | --- |
| 根路径重定向 | `src/app/(root)/page.tsx` |
| 根路径 layout | `src/app/(root)/layout.tsx` |
| 语言路由页面 | `src/app/[locale]/page.tsx` |
| 语言路由 layout | `src/app/[locale]/layout.tsx` |
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
| AI Worker | `src/game/ai-worker.ts` |
| AI 测试 | `src/game/ai.test.ts` |
| 运行时开局库 | `src/game/opening-book.ts` |
| 正式 SGF 开局库源资产 | `data/openings/generated/standard-26-insane-8ply-1s.sgf` |
| 引擎对战评测 | `tools/engine-arena.ts` |
| SGF 开局库推演 | `tools/generate-opening-book.ts` |
| Vitest 配置 | `vitest.config.ts` |
| Next 配置 | `next.config.ts` |

## 8. 当前文档入口

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/REUSE_EVALUATION.md`
- `docs/STAGE_0_REPORT.md`
- `docs/STAGE_1_REPORT.md`
- `docs/OPENING_BOOK_GENERATION_PLAN.md`
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
- `yyjhao/HTML5-Gomoku` 的 Worker、增量评分、cache、NegaScout 已作为后续思路参考；当前项目已用自写 TypeScript 实现四档 AI、Worker 根候选分片、置换表、威胁搜索和 generated opening book。
- 当前 UI 暴露 Normal/Hard/Expert/Insane 四档；Normal 1 秒，Hard 5 秒，Expert 10 秒，Insane 30 秒。

AI Worker 与设置持久化：

- `yyjhao/HTML5-Gomoku` 的 Worker 消息流和悔棋同步值得参考。
- 不能复制旧式全局 JS；当前 `GameShell` 用 request id 取消过期 AI 请求，后续在线或持久化状态再引入 boardVersion 类防旧结果机制。
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

AI 引擎和开局库：

- 当前引擎是项目内自写 TypeScript 引擎，不是成熟第三方引擎；商业发布方向可控。
- 已参考传统引擎思路实现迭代加深、置换表、候选排序、VCF/VCT 威胁搜索、战术扩展、best-so-far 超时返回和浏览器 Worker 根候选并行搜索。
- 当前运行时开局库只使用 `data/openings/generated/standard-26-insane-8ply-1s.sgf` 派生出的 `src/game/opening-book.ts`，旧手写库已从 `src/game/ai.ts` 移除。
- 当前同一套生成库对所有难度开放，难度差异由 `OPENING_BOOK_PLIES` 控制：Normal 2 手、Hard 4 手、Expert 6 手、Insane 8 手。
- 现有生成库是 26 条标准开局、每条 8 手、每步 1 秒推演的 starter book；还没有完成 16 手、每开局 3 变体、10 秒/步的强库生成和筛选。
- 目前没有把 GPL/AGPL 引擎、Pikafish、Gomocup 引擎二进制、WASM、权重或第三方开局库打包进前端。
- `ee7d3e4` 已通过测试、lint、build 和真实浏览器点击验收，并已推送到 `origin/main`。

## 10. 下一步派发表

| 优先级 | 子代理 | 目标 | 允许修改范围 | 禁止范围 | 输入文档 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 实现 SEO | 补多语言 metadata、`hreflang`、canonical/alternate 和 sitemap 基础 | `src/app/**`、必要配置、相关文档 | 不做广告、Socket、排行榜 | `WEBSITE_BUILD_PLAN.md`、`docs/logic/i18n-theme-module.md` | 六语言 SEO 链接正确，build 通过 |
| P1 | 实现强开局库生成 | 按计划生成 16 手、每标准开局至少 3 变体、10 秒/步 SGF，并做结构校验 | `data/openings/generated/**`、`.arena-results/**`、必要文档 | 不提交未筛选的运行时大库，不引入第三方未授权库 | `docs/OPENING_BOOK_GENERATION_PLAN.md`、`tools/generate-opening-book.ts` | SGF 至少 78 条 game tree、每条 16 手、前三手符合标准 26 开局、无非法落子 |
| P1 | 实现开局库精选转换 | 增加 SGF 校验/精选/转 `src/game/opening-book.ts` 的脚本，并用 arena 胜率回灌权重 | `tools/**`、`src/game/opening-book.ts`、`src/game/ai.test.ts`、必要文档 | 不手工长期维护大段运行时数据，不绕过 arena 筛选 | `docs/OPENING_BOOK_GENERATION_PLAN.md`、`tools/engine-arena.ts` | 转换脚本可重复生成运行时库，测试覆盖库加载和难度深度门控 |
| P2 | 实现 AI 测试补强 | 为 Normal/Hard/Expert/Insane 增加更完整的活二、活三、冲四、活四评分矩阵和超时回归测试 | `src/game/**`、必要测试报告 | 不引入外部闭源或不明许可证引擎 | `docs/logic/ai-engine-module.md`、`docs/STAGE_1_REPORT.md` | AI 测试覆盖关键棋型和预算路径，`npm test` 通过 |
| P2 | 实现移动端手感细化 | 细化触摸目标、状态区信息密度和小屏视觉回归 | `src/components/**`、`src/app/globals.css`、必要文档 | 不做广告接入、在线服务 | `docs/STAGE_1_REPORT.md` | 390px 手机和 1024px 平板真实浏览器验收通过 |

建议先不要做：

- Socket.IO 在线对战。
- 排行榜。
- 真实广告。

可以继续做的 AI 工作：

- 长时间 arena 对战，用旧版本、当前版本和不同开局库版本对比胜率。
- 强开局库生成、校验、精选、权重回灌和运行时转换。
- 更系统的活二、活三、冲四、活四棋型测试矩阵。

这些属于后续阶段。当前 stage1-local-ai、交互热修复和 opening-book-runtime 均已完成验证，可以进入 SEO、强开局库、AI 测试补强或移动端手感细化等后续工作。

## 11. Risk Register

| 风险 | 严重级别 | 触发条件 | 缓解方案 | 阶段 |
| --- | --- | --- | --- | --- |
| 客户端伪造胜负或评分 | blocker | 在线对战、排行榜上线 | 服务端权威、幂等结算、事务 | 在线阶段 |
| 无许可证源码误复制 | blocker | 参考 `scheng20`、`minh100` 等许可证不清项目 | 只参考流程，不复制源码 | 全阶段 |
| 六语言/RTL 回归 | major | 新 UI 文案绕过字典或破坏 `dir` | 新增文案必须进字典，浏览器覆盖 `ar` | 全阶段 |
| 黑暗模式回归 | major | 新样式绕过 token 或只写浅色 | 使用主题 token，浏览器覆盖 light/dark | 全阶段 |
| 广告影响棋盘误触 | major | 广告靠近棋盘或按钮 | 广告位远离高频点击区，浏览器验收 | 商业化阶段 |
| AI 计算阻塞 UI | major | Worker 不可用、设备核心数少、强档搜索超时或应急主线程兜底过重 | Worker 根候选分片、request id 取消旧请求、best-so-far 超时返回、保留 50ms 应急搜索预算 | AI 阶段 |
| 共享文件并行冲突 | major | 多代理同时改 `src/app/**`、字典、全局 CSS | 主控指定 owner，串行合并 | 全阶段 |
| AI 棋型覆盖不足 | minor | 四档 AI 后续被要求具备更稳定棋力 | 增加活二、活三、冲四、活四评分矩阵测试；补强强档搜索、超时和 Worker 分片回归测试 | AI 阶段 |
| 开局库源资产和运行时数据脱节 | major | 替换 SGF 后忘记同步 `src/game/opening-book.ts` | 保持 SGF 为源资产；补 SGF 转 TS 脚本；测试固定校验生成库数量和代表线命中 | AI/开局库阶段 |
| 开局库未经足量对战筛选 | major | 直接把长推演结果塞进运行时 | 用 arena 快速样本和较高预算样本筛选，剔除快速失败线，记录胜方前 8 手开局线 | AI/开局库阶段 |
| 第三方引擎或开局库许可证不满足商业发布 | blocker | 引入 Pikafish、Gomocup 引擎、第三方 book、WASM 或权重 | 商业发布默认只用项目内自写引擎和自生成开局库；外部资产必须先确认许可证 | 商业化阶段 |
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

opening-book-runtime：

- 无子代理报告。本轮由主控直接实现、验证、提交和推送。
- 相关提交：`ee7d3e4 Implement generated opening book runtime`
- 相关计划：`docs/OPENING_BOOK_GENERATION_PLAN.md`

## 14. 最近一次交接：opening-book-runtime

本轮目标：

- 按用户要求实装生成开局库。
- 只使用 `data/openings/generated/standard-26-insane-8ply-1s.sgf` 这一套开局库，不再使用之前的手写库。

实际完成：

- 新增正式 SGF 源资产 `data/openings/generated/standard-26-insane-8ply-1s.sgf`。
- 新增运行时开局库 `src/game/opening-book.ts`，包含标准 26 开局、每条 8 手。
- `src/game/ai.ts` 移除旧手写 `OPENING_BOOK_LINES`，只引用 `GENERATED_OPENING_BOOK_LINES`。
- 运行时同一套生成库对所有难度开放，Normal/Hard/Expert/Insane 分别最多使用 2/4/6/8 手。
- `src/game/ai.test.ts` 增加生成库加载和不同难度开局库深度门控测试。
- README 和 `docs/logic/ai-engine-module.md` 已同步当前策略。

修改文件：

- `README.md`
- `docs/logic/ai-engine-module.md`
- `src/game/ai.ts`
- `src/game/ai.test.ts`
- `src/game/opening-book.ts`
- `data/openings/generated/standard-26-insane-8ply-1s.sgf`

验证命令和结果：

- `npm test`：通过，2 个测试文件、34 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过；首次因旧 Next dev 进程锁 `.next/static/...` 失败，停止本项目 3000 端口进程并清理 `.next` 后重试通过。
- `git diff --check`：通过，仅有 LF/CRLF 工作副本提示。
- 真实浏览器/CDP：`/zh` 人机模式、玩家先手、疯狂档，中心落子后 AI 正常回应，页面出现 1 黑 1 白，状态回到“黑棋回合”，无阻断控制台错误。

未验证项及原因：

- 未跑长时间 arena 胜率评测；本轮是开局库接入，不是质量筛选。
- 未生成 16 手、每开局 3 变体、10 秒/步强库；该任务耗时约 1.5 到 3 小时，已在 `docs/OPENING_BOOK_GENERATION_PLAN.md` 计划。
- 未引入第三方成熟开局库或外部引擎；商业发布风险优先，当前保持自写引擎和自生成库。

最新提交：

```text
功能提交：ee7d3e4 Implement generated opening book runtime
交接文档提交：b8e4a35 Update handoff for opening book runtime
```

是否已推送：

```text
已推送到 origin/main
```

下一步建议：

- 先补 SGF 校验和 SGF 转 `src/game/opening-book.ts` 的可重复脚本。
- 生成 16 手、3 变体强库前先做小样本冒烟，确认脚本、非法落子检查和输出结构。
- 生成后用 arena 跑快速样本和较高预算样本，按胜率和快速失败情况筛选/降权，再进入运行时。
- 若继续优化引擎，优先补棋型矩阵测试和 arena 回归，避免只凭体感判断棋力。

风险变化：

- 现在运行时没有旧手写库兜底，所有开局多样性来自这 26 条生成线及 8 种对称变换；若用户觉得重复，需要扩大生成库变体并做权重筛选。
- SGF 和 `src/game/opening-book.ts` 目前是两个文件，后续必须用脚本保持同步，避免源资产和运行时数据脱节。
- Windows/OneDrive 下旧 dev 进程仍可能锁 `.next`，build 前先确认本项目 3000 端口进程。

## 15. 交接更新模板

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

## 16. 2026-06-25 交接文档追加规则

从本条开始，`docs/HANDOFF.md` 按窗口/任务追加记录使用：

- 本文件用于保留每个窗口、每个分支任务做了什么，以及停在什么位置。
- 更新时只在文件末尾追加新内容，不改写、删除、重排过去窗口的内容。
- 如果过去记录有错误或已经过期，用新的更正记录说明原段落和新事实，不直接覆盖原文。
- 每条追加记录应写清本轮目标、实际完成、修改文件、验证结果、最新提交、是否推送、下一步建议和风险变化。
- 子代理报告路径仍必须记录在追加段落中，方便后续窗口按时间线追溯。

## 17. 2026-06-25 真实服务器 Socket.IO 修复与游客随机名

本轮目标：

- 处理真实服务器 `gomoku.yagu.ddns-ip.net` 上创建好友房失败、浏览器提示 `xhr poll error` 的问题。
- 给游客默认昵称改成随机 `Player ####`。
- 明确 room code 是服务端随机生成，不显示固定示例码。
- 记录真实测试网址和部署注意事项。

实际完成：

- `npm run dev` / `npm start` 默认改为启动 `src/server/online-server.ts` 自定义 Next + Socket.IO server。
- 保留 `npm run dev:next` / `npm run start:next` 给纯 Next 调试；生产好友房不要用 `next start`。
- `tsx` 移到生产依赖，避免服务器只安装生产依赖时 `npm start` 找不到运行器。
- `npm run build` 加 `node --max-old-space-size=4096`，避免 TypeScript 阶段随机 OOM。
- 新游客默认名改为随机 `Player 1000-9999`，旧缓存里的纯 `Player` 会自动升级。
- 六语言 room code placeholder 从 `ABC123` 改为随机码含义，避免误解为固定房间码。
- 连接失败时对 `xhr poll error` 给出部署提示：确认使用 `npm run build && npm start`，并让反向代理转发 `/socket.io/`。
- README 和阶段 2 报告记录真实测试网址：`http://gomoku.yagu.ddns-ip.net`。

修改文件：

- `README.md`
- `docs/STAGE_2_REPORT.md`
- `package.json`
- `package-lock.json`
- `src/components/useFriendRoom.ts`
- `src/i18n/dictionaries.ts`
- `src/server/online-server.ts`

验证命令和结果：

- `npm test`：通过，4 个测试文件、45 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过；第一次旧脚本在 TypeScript 阶段 Node heap OOM，加入 `--max-old-space-size=4096` 后通过。
- `npm audit --omit=dev`：通过，0 vulnerabilities。
- `git diff --check`：通过，仅有 LF/CRLF 工作副本提示。
- 本地生产服务：`PORT=3020 npm start` 后 `/en` 返回 200，`/socket.io/?EIO=4&transport=polling` 返回 200 和 sid。
- 浏览器验证：`http://127.0.0.1:3020/en` 默认名为 `Player 5558` 形式，创建房间得到随机 6 位码 `NLTDJJ` 形式。
- 真实服务器当前预更新状态：`http://gomoku.yagu.ddns-ip.net` 页面返回 200；`/socket.io/?EIO=4&transport=polling` 返回 404；HTTPS 当前 SSL 连接失败。该结果只说明服务器尚未部署本提交，不作为最新版验收。

未验证项及原因：

- 未对 `gomoku.yagu.ddns-ip.net` 做最终好友房验收；用户说明真实服务器必须先更新到最新版，本地代码与服务器当前不同步。

最新提交：

```text
功能提交：90cdf97 Fix production room socket startup
```

是否已推送：

```text
随 handoff 追加提交一起推送到 origin/main。
```

下一步建议：

- 服务器更新到 `90cdf97` 之后，运行 `npm run build && npm start`，不要使用 `next start`。
- OpenResty/Nginx 需要确保 `/socket.io/` 代理到同一个 Node 端口，并带 WebSocket upgrade headers。
- 部署后复测：
  - `http://gomoku.yagu.ddns-ip.net/socket.io/?EIO=4&transport=polling` 应返回 200 和 sid。
  - 两台电脑分别进入 `http://gomoku.yagu.ddns-ip.net/en`，创建房间、复制链接、加入、ready、start、落子同步。
- HTTPS 目前没有通过，后续公开测试前需要配置证书或明确只用 HTTP。

风险变化：

- 好友房线上失败的主要风险从代码状态机转为部署入口和反向代理配置；`/socket.io` 404 基本表示没有跑自定义 online server 或代理没转发 Socket.IO 路径。
- 服务器未部署最新版前，线上测试仍会继续复现 `xhr poll error`。
