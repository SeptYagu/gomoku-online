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

## 18. 2026-06-25 页面底部版本号

本轮目标：

- 在页面底部添加一行版本号，方便通过真实服务器页面确认当前实装提交。

实际完成：

- `next.config.ts` 在构建时读取版本号，优先级为 `NEXT_PUBLIC_APP_VERSION`、`APP_VERSION`、`VERCEL_GIT_COMMIT_SHA`、`GITHUB_SHA`，最后回退到 `git rev-parse --short HEAD`。
- `src/components/GameShell.tsx` 在主页面底部渲染 `version: <短提交>`。
- `src/app/globals.css` 增加底部版本号样式，保持低干扰、不遮挡棋盘。

修改文件：

- `next.config.ts`
- `src/components/GameShell.tsx`
- `src/app/globals.css`
- `docs/HANDOFF.md`

验证命令和结果：

- `npm test`：通过，4 个测试文件、45 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3021 npm start` 后，浏览器访问 `http://127.0.0.1:3021/en`，页面底部显示 `version: 047d7dd`。

未验证项及原因：

- 未验证真实服务器页面底部版本号；服务器需要先部署包含本条改动的新提交。

最新提交：

```text
随本条 handoff 追加提交一起生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 35. 2026-06-25 阶段 3 小步 3 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 3 房间列表 API 和 lobby socket channel 的真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 3 标记为完成并通过真实服务器验证。

实际结果：

- 小步 3 房间列表 API 和 lobby socket channel 已提交：
  - `e0e0253 Implement stage 3 lobby room list channel`
- 已推送到 `origin/main`。
- 推送后等待 90 秒，第一次线上版本检查仍为 `612ec19`。
- 再等待 90 秒后，运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net e0e0253
```

验证结果：

- 页面加载通过。
- 页面底部版本号显示 `version e0e0253`。
- Socket.IO polling handshake 返回 sid。
- Socket.IO websocket 连接通过。

真实服务器 lobby 冒烟：

```bash
npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net
```

结果：

- REST `/api/rooms` 初始列表通过。
- `lobby:join` 初始列表通过。
- 创建房间后收到 `lobby:room-updated`。
- REST 房间列表包含新建房间。
- 加入房间后 lobby 玩家数更新。
- 双方 ready 开局后 lobby 状态更新为 `playing`。
- 认输结束后 lobby 收到删除/隐藏事件。
- REST 默认列表隐藏 finished 房。

回归验证：

- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，三客户端三局好友房流程无回归。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 下一步：小步 4，房间列表 UI：Join / Watch。

## 37. 2026-06-25 阶段 3 小步 4：房间列表 UI Join / Watch

本轮目标：

- 按阶段 3 build plan 推进小步 4。
- 在好友房面板中显示房间列表。
- waiting 房显示 Join，点击后加入为第二名玩家。
- playing 或满员房显示 Watch，点击后进入观战席。
- 列表随 lobby 增量事件更新。

实际完成：

- `src/components/useFriendRoom.ts`：
  - 新增 `lobbyRooms`、`lobbyStatus`、`refreshLobby()`、`joinListedRoom(roomCode)`。
  - 监听 `lobby:room-updated` / `lobby:room-deleted` 并更新列表。
  - `refreshLobby()` 通过 `lobby:join` 获取初始列表。
- `src/components/GameShell.tsx`：
  - 新增 `RoomLobbyList`。
  - 列表行显示房主、房间号、状态、玩家数和观战人数。
  - 根据 `canJoin` / `canWatch` 显示 Join 或 Watch。
- `src/i18n/dictionaries.ts`：
  - 六语言新增房间列表 UI 文案。
- `src/app/globals.css`：
  - 新增房间列表布局和移动端单列布局。
- `tools/smoke-lobby-ui.ts`：
  - 新增系统 Chrome 冒烟，预置 waiting / playing 两个房间，验证列表 Join 和 Watch。
- `package.json`、`README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/lobby-matchmaking-module.md`：
  - 记录小步 4 脚本、能力和验证结果。

验证命令和结果：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3031 npm start` 后运行 `npm run smoke:lobby-ui -- http://127.0.0.1:3031`，通过。
  - `PASS lobby waiting row join - 9T5GXQ`
  - `PASS lobby playing row watch - Z6WZUB`
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3031`，通过。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 32. 2026-06-25 阶段 3 小步 2 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 2 观战席提交后的真实服务器验证结果。
- 不回改第 31 段提交前留下的“待提交/待推送”状态，保留窗口工作时间线。

实际结果：

- 小步 2 观战席实现已提交：
  - `99b4b03 Implement stage 3 spectator seats`
- 已推送到 `origin/main`。
- 推送后等待 90 秒，运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net 99b4b03
```

验证结果：

- 页面加载通过。
- 页面底部版本号显示 `version 99b4b03`。
- Socket.IO polling handshake 返回 sid。
- Socket.IO websocket 连接通过。

真实服务器三客户端冒烟：

```bash
npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net
```

结果：

- host / guest / spectator 均通过 websocket 连接。
- 第三人进入观战席，不挤掉黑白玩家。
- 观战者 ready 和落子均被拒绝，返回 `not-room-player`。
- 观战者能收到落子广播。
- 三局连续流程通过：ready 自动开局、重开换先、悔棋拒绝/允许、同局面拒绝后禁止连续悔棋、认输收尾。

分享链接回归冒烟：

```bash
npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net
```

结果：

- 创建房间后 URL 带 room code。
- Copy invite 复制当前 URL。
- Leave 后 URL 清理 room 参数。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 下一步可进入小步 3：房间列表 API 和 lobby socket channel。

## 30. 2026-06-25 阶段 3 文档口径提交后的线上验证补记

本轮目标：

- 按 handoff 追加规则，补记上一段文档口径澄清提交后的推送和线上验证结果。
- 不回改第 29 段提交前留下的“待提交/待推送”状态，保留窗口工作时间线。

实际结果：

- 第 29 段对应文档口径澄清已提交：
  - `a9b2c8f Clarify stage 3 game record analysis scope`
- 已推送到 `origin/main`。
- 推送后等待 90 秒，运行线上验证：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net a9b2c8f
```

验证结果：

- 页面加载通过。
- 页面底部版本号显示 `version a9b2c8f`。
- Socket.IO polling handshake 返回 sid。
- Socket.IO websocket 连接通过。

当前阶段 3 状态：

- 小步 1：真实分享链接，已实现、推送并通过真实服务器验证。
- 棋谱提交/游客棋谱/本地分析/开局库数据口径，已写入 build plan、stage 3 plan、progress 和 rating/leaderboard 模块设计。
- 下一步可进入阶段 3 小步 2：房间成员模型扩展，支持第三人及之后进入观战席。

下一步建议：

- 部署后直接看页面底部 `version:`，或让 Codex 读取真实页面 DOM 来确认服务器实际跑到哪个提交。

风险变化：

- 版本号取构建时 HEAD。若服务器用环境变量覆盖 `NEXT_PUBLIC_APP_VERSION` 或 `APP_VERSION`，页面会显示覆盖值。

## 19. 2026-06-25 好友房 ready 自动开局与联机悔棋请求

本轮目标：

- 好友房双方都 Ready 后自动开局，移除额外 Start 操作。
- Ready / Unready 按钮使用绿色 / 红色状态。
- 将单机顶部悔棋和新局按钮移入功能栏；好友房中原 Start 位置改为悔棋。
- 联机悔棋必须向对手发送请求，对手棋盘中央弹框确认后才可回退。
- 悔棋请求弹框必须选择拒绝或允许才消失；拒绝按钮带 10 秒倒计时，超时自动拒绝。
- 每人每局只有 3 次悔棋请求机会；同一局面被拒后不能连续重发悔棋请求。

实际完成：

- `RoomStore` 增加服务端权威悔棋请求状态：
  - `undoRequest` 快照包含请求方、目标方、moveSeq、请求时间和过期时间。
  - 每个玩家快照包含 `undoRequestsRemaining`。
  - 只允许最后一手落子者发起悔棋请求。
  - 请求挂起时禁止继续落子，避免倒计时和棋局推进竞争。
  - 对手同意后回退最后一手；拒绝或 10 秒过期后保留局面。
  - 同一 `moveSeq` 被拒后，请求方不能在棋局未变化前连续重发。
  - 重开房间会重置 ready、悔棋次数、拒绝局面和挂起请求。
- Socket.IO 事件从直接 `game:undo` 改为：
  - `game:undo-request`
  - `game:undo-respond`
- 好友房 UI：
  - 双方 Ready 后直接进入 playing，不再需要 Start。
  - Ready 按钮为绿色，Unready 为红色。
  - 好友房功能栏显示 `Undo (剩余次数)`。
  - 对手收到悔棋请求时，在棋盘中央显示不可关闭弹框，包含 Reject 倒计时和 Allow。
  - 10 秒未处理时客户端自动发送拒绝，服务端也会在快照/操作时兜底过期。
- 文档同步：
  - 更新 `WEBSITE_BUILD_PLAN.md` 阶段 2 当前状态和验收标准。
  - 更新 `docs/STAGE_2_REPORT.md`。
  - 更新 `docs/logic/realtime-room-module.md`。

修改文件：

- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/STAGE_2_REPORT.md`
- `docs/logic/realtime-room-module.md`
- `src/app/globals.css`
- `src/components/GameShell.tsx`
- `src/components/useFriendRoom.ts`
- `src/i18n/dictionaries.ts`
- `src/server/room-socket.test.ts`
- `src/server/room-socket.ts`
- `src/server/rooms.test.ts`
- `src/server/rooms.ts`

验证命令和结果：

- `npm test`：通过，4 个测试文件、49 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3022 npm start` 后，用无头 Chrome + CDP + Socket.IO 客户端验证：
  - 浏览器 Guest 加入 Host 创建的房间。
  - 双方 Ready 后自动进入 `playing`。
  - Host 落黑后发起悔棋请求。
  - Guest 棋盘中央出现 `Undo request` 弹框，Reject 按钮显示 `Reject (10)`，Allow 可见。
  - 弹框中心与棋盘中心偏差在验证阈值内。
  - Guest 点击 Allow 后，服务端快照回退到空棋盘，`currentTurn` 回到 black。
  - Host 再次落子并请求悔棋，Guest 不操作，10 秒后自动拒绝；棋子保留，弹框消失。
  - 同一局面再次请求返回 `undo-request-rejected-position`。

未验证项及原因：

- 未验证真实服务器 `gomoku.yagu.ddns-ip.net`；真实服务器需要先部署本轮最新代码并重新 `npm run build && npm start`。
- 本轮浏览器验收覆盖 English UI；六语言文案已补齐，但未逐语言跑浏览器回归。

最新提交：

```text
本段记录所在提交，见 git log 最新提交。
```

是否已推送：

```text
本段记录提交后推送到 origin/main。
```

下一步建议：

- 部署最新版后，先确认页面底部 `version:` 是本轮提交号，再用两台电脑复测好友房 ready 自动开局和联机悔棋请求。
- 真实服务器仍要继续关注 `/socket.io/` 代理和 `npm start` 自定义 online server；如果版本号正确但仍有 `xhr poll error`，优先查反向代理。

风险变化：

- 联机悔棋现在依赖房间内存状态；服务重启会清空挂起请求和次数记录，这与当前房间状态单进程内存限制一致。
- 客户端会主动 10 秒自动拒绝；如果目标客户端断线，服务端会在下一次快照读取或房间操作时兜底过期，但不会主动向已断线客户端弹框。

## 20. 2026-06-25 真实服务器部署后验证

本轮目标：

- 用户已部署最新版后，验证真实服务器 `gomoku.yagu.ddns-ip.net` 是否确实运行本轮提交，并复测好友房关键链路。

实际完成：

- 访问 `http://gomoku.yagu.ddns-ip.net/en`，页面底部显示 `version: 9b6041e`。
- 访问 `http://gomoku.yagu.ddns-ip.net/socket.io/?EIO=4&transport=polling`，返回 200 和 Socket.IO `sid`，说明真实服务器已跑自定义 online server，`/socket.io/` 代理可用。
- 使用真实域名运行无头 Chrome + CDP + Socket.IO 客户端验收：
  - Host 通过 Socket.IO 创建房间，Guest 通过浏览器 UI 加入。
  - 双方 Ready 后自动进入 `playing`，不需要 Start。
  - Host 落黑后 Guest 页面进入 `Your move`。
  - Host 发起悔棋请求，Guest 棋盘中央出现 `Undo request` 弹框。
  - 弹框显示 Allow，Reject 带倒计时，实测为 `Reject (9)`。
  - 弹框中心与棋盘中心对齐，验证坐标：board center `(475, 831)`，modal center `(476, 831)`。
  - Guest 点击 Allow 后，服务端快照回退到空棋盘，`currentTurn` 回到 black。
  - 再次落黑并发起悔棋请求后，Guest 不操作，10 秒后自动拒绝；弹框消失，棋子保留。
  - 同一局面再次请求返回 `undo-request-rejected-position`。

验证命令和结果：

- `Invoke-WebRequest http://gomoku.yagu.ddns-ip.net/en`：页面包含 `version: 9b6041e`。
- `Invoke-WebRequest http://gomoku.yagu.ddns-ip.net/socket.io/?EIO=4&transport=polling`：HTTP 200，返回 sid。
- Node/CDP 真实域名验收脚本：通过。房间码 `S8GF78`，Socket.IO 客户端连接 transport 为 `polling`。

未验证项及原因：

- 本轮只用一台机器模拟真实域名双端流程；用户两台真实电脑的手动复测仍建议做一轮。
- Socket.IO 客户端最终连接显示 transport 为 `polling`；功能已正常，但如需确认 WebSocket upgrade，可单独加代理日志或强制 websocket 测试。

最新提交：

```text
本段记录所在提交，见 git log 最新提交。
```

是否已推送：

```text
本段记录提交后推送到 origin/main。
```

下一步建议：

- 用两台电脑打开 `http://gomoku.yagu.ddns-ip.net/en` 手动确认好友房体验，重点看移动端/不同浏览器下弹框遮罩和倒计时。
- 若线上仍偶发 `xhr poll error`，优先采集浏览器 Network 的 `/socket.io/` 状态码和服务器反向代理日志。

风险变化：

- 真实服务器已确认不再是 `/socket.io` 404 或旧版本问题。
- 由于当前线上连接可用但 transport 记录为 `polling`，性能和稳定性目前足够 MVP 使用；公开测试前仍建议确认 WebSocket upgrade 是否按预期工作。

## 21. 2026-06-25 M3 公开测试准备：房间生命周期加固

本轮目标：

- 按网站 build plan 进入 M3 公开测试准备。
- 优先补齐公开测试前最影响线上稳定性的房间生命周期能力：房间 TTL、空房清理、断线宽限期和超时判负。

实际完成：

- `RoomStore` 增加房间生命周期配置：
  - `disconnectGraceMs`：默认 2 分钟。
  - `emptyRoomTtlMs`：默认 5 分钟。
  - `completedRoomTtlMs`：默认 30 分钟。
  - `roomTtlMs`：默认 2 小时。
- 玩家快照增加 `disconnectDeadline`：
  - playing 中断线会设置 deadline。
  - 同 `playerId` 在 deadline 前 `room:rejoin` 可恢复座位，并清空 deadline。
- 断线超时处理：
  - playing 中一名玩家断线超过宽限期，在线对手自动胜，房间进入 `finished`。
  - 若没有在线玩家可判胜，房间进入 `abandoned`。
  - 断线会清掉挂起悔棋请求，避免请求阻塞棋局。
- 房间清理：
  - 空 waiting 房超过 TTL 后从内存 Map 删除。
  - finished / abandoned 房超过 TTL 后删除。
  - 长时间无活动 playing 房进入 `abandoned`。
- Socket.IO 层增加轻量 lifecycle sweep：
  - 默认每 10 秒推进一次过期状态。
  - 发生断线超时判负时向房间广播最新 `room:state`，在线玩家无需点击任何按钮即可收到结果。
  - 测试 harness 默认关闭 interval，专项测试用短间隔打开，避免测试挂起。
- UI 状态补齐：
  - 六语言字典增加 `roomClosed`。
  - `GameShell` 对 `abandoned` 房间显示房间关闭，而不是继续显示当前回合。
- 文档同步：
  - 更新 `WEBSITE_BUILD_PLAN.md`，将 TTL、空房清理、断线宽限期、超时判负标为基础版完成。
  - 更新 `docs/STAGE_2_REPORT.md`。
  - 更新 `docs/logic/realtime-room-module.md`。

修改文件：

- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/STAGE_2_REPORT.md`
- `docs/logic/realtime-room-module.md`
- `src/components/GameShell.tsx`
- `src/i18n/dictionaries.ts`
- `src/server/room-socket.test.ts`
- `src/server/room-socket.ts`
- `src/server/rooms.test.ts`
- `src/server/rooms.ts`

验证命令和结果：

- `npm test`：通过，4 个测试文件、54 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。

新增自动化覆盖：

- 断线玩家超过 deadline 后，对手自动获胜。
- deadline 前重连可保留座位并继续 playing。
- 空 waiting 房 TTL 后返回 `room-not-found`。
- finished 房 TTL 后返回 `room-not-found`。
- `sweepExpiredRooms()` 返回需要广播的生命周期快照。
- Socket.IO lifecycle sweep 会把断线超时胜负广播给在线玩家。

未验证项及原因：

- 未部署到真实服务器验证；需要用户部署本轮最新提交后再确认页面底部 version 和线上断线超时广播。
- UI 尚未展示断线倒计时，只在快照里提供 `disconnectDeadline`。
- 正式 reconnect token、Redis Adapter、多实例共享状态仍未实现。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

下一步建议：

- 部署后做两台电脑实测：一方开局后断网/关闭浏览器，等待 2 分钟，确认另一方自动看到胜负结果。
- 下一刀可继续做线上运行说明和 WebSocket upgrade 确认，或补 SEO 基础页面。

风险变化：

- 房间生命周期仍是单进程内存实现；服务重启仍会丢房间。
- lifecycle sweep 是进程内定时器；多实例部署前必须接 Redis Adapter 或持久层，否则不同实例间不会共享房间状态。

## 22. 2026-06-25 M3 小步 1：断线 60 秒与线上验证入口

本轮目标：

- 先完成 M3 公开测试准备，再进入 build plan 阶段 3。
- 按用户要求将联机断线宽限期从 2 分钟改为 60 秒。
- 补一个可重复执行的真实服务器验证入口，方便每次部署后确认版本、Socket.IO polling 和 WebSocket upgrade。

实际完成：

- `src/server/rooms.ts` 默认 `DISCONNECT_GRACE_MS` 改为 `60 * 1000`。
- 新增 `tools/verify-online-server.ts`：
  - 默认真实站点为 `http://gomoku.yagu.ddns-ip.net`。
  - 检查 `/en` 页面是否可访问。
  - 检查 `/api/version` 返回的部署版本，可传 `<expected-version>` 校验是否实装到指定提交。
  - 检查 `/socket.io/?EIO=4&transport=polling` 是否返回 sid。
  - 强制 `transports: ["websocket"]` 连接，确认反向代理 WebSocket upgrade 可用。
- 新增 `npm run verify:online`。
- 新增 `src/app/api/version/route.ts`，返回当前 `NEXT_PUBLIC_APP_VERSION` / `APP_VERSION`，避免只依赖客户端渲染 footer。
- 更新 `README.md`、`docs/STAGE_2_REPORT.md`、`docs/logic/realtime-room-module.md` 和 `WEBSITE_BUILD_PLAN.md`。

修改文件：

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/STAGE_2_REPORT.md`
- `docs/logic/realtime-room-module.md`
- `package.json`
- `src/app/api/version/route.ts`
- `src/server/rooms.ts`
- `tools/verify-online-server.ts`

验证命令和结果：

- `npm test`：通过，4 个测试文件、54 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过，产物包含 `/api/version`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net`：
  - page：通过。
  - version：失败，当前真实服务器尚未部署带 `/api/version` 的本轮提交，也没有可从静态 HTML 读取的版本 footer。
  - Socket.IO polling：通过，返回 sid。
  - Socket.IO websocket：通过，强制 WebSocket transport 连接成功。

真实服务器当前判断：

- `http://gomoku.yagu.ddns-ip.net` 的 Socket.IO polling 和 WebSocket upgrade 当前都可用。
- 下一次用户部署本轮提交后，先运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
```

未验证项及原因：

- 本轮 60 秒断线规则尚未在真实服务器验证，因为需要用户先部署最新版。
- `/api/version` 也需要部署后才能在线上通过。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

下一步建议：

- M3 小步 2：补公开测试清单和问题记录模板，重点覆盖两台电脑、手机浏览器、移动端误触、断线/重连、ready 自动开局、联机悔棋弹框。
- 完成 M3 后再进入 build plan 阶段 3：随机匹配、账号/游客身份、排行榜和离开惩罚。

风险变化：

- 线上代理层已从“只确认 polling”推进到“强制 WebSocket 也已确认可连”。
- 版本确认入口从页面 footer 扩展为 `/api/version`，后续部署检查更稳定。

## 23. 2026-06-25 M3 小步 2：公开测试清单与问题日志

本轮目标：

- 先完成 M3 公开测试准备，再进入 build plan 阶段 3。
- 把 M3 从一句“部署测试站、邀请试玩、记录问题”拆成可执行清单。
- 给真实服务器、两台电脑和手机测试建立统一问题记录格式。

实际完成：

- 新增 `docs/M3_PUBLIC_TEST_PLAN.md`：
  - 明确 M3 与 build plan 阶段 3 的边界。
  - 记录真实测试站 `http://gomoku.yagu.ddns-ip.net`。
  - 定义部署验证命令：`npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>`。
  - 列出 M3 完成门槛。
  - 拆出设备矩阵、双电脑好友房流程、联机悔棋流程、刷新/断线流程、移动端误触流程。
  - 定义 P0/P1/P2/P3 阻塞等级。
  - 写明公测问题只追加记录，不删除旧记录。
- 新增 `docs/M3_PUBLIC_TEST_LOG.md`：
  - 提供标准问题模板。
  - 记录已知线上观察：
    - 当前服务器部署前缺少 `/api/version`，等待部署后复测。
    - 当前服务器强制 WebSocket upgrade 已确认通过。
- 更新 `README.md` 的项目文档索引。
- 更新 `WEBSITE_BUILD_PLAN.md` 的 M3 里程碑，指向 M3 清单和日志。

修改文件：

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/M3_PUBLIC_TEST_LOG.md`
- `docs/M3_PUBLIC_TEST_PLAN.md`

验证命令和结果：

- `git diff --check`：待运行。
- 本轮为文档和流程资产变更，不需要重新跑 Next build；上一小步已完成 `npm test`、`npm run lint`、`npm run build`。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

下一步建议：

- M3 小步 3：按 `docs/M3_PUBLIC_TEST_PLAN.md` 执行当前可在本地/线上完成的检查；需要用户部署后才能完成的项明确标成 external pending。
- 若用户已部署新提交，先运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>`。

风险变化：

- M3 的完成标准已从口头目标变成可执行 checklist。
- 后续阶段 3 的随机匹配/排行榜不会和 M3 公测问题混在一起。

## 24. 2026-06-25 M3 小步 3：三局好友房冒烟与重开换先

本轮目标：

- 按用户要求：两个人玩的时候，一局结束后下一局换先。
- 将 `smoke:online-room` 从单局冒烟扩展为连续三局。
- 冒烟脚本需要覆盖换着人悔棋、换着人认输、悔棋不允许、以及同一局面被拒后不能连续悔棋。

实际完成：

- `RoomStore` 增加内部 `nextStartingSeat`：
  - 初始为黑方先手。
  - 每次 `game:restart` 后切换下一局先手。
  - 双方 ready 自动开局时使用 `nextStartingSeat`，不再固定黑方先。
  - 房主权限仍由 `hostSeat` 控制，不随先手变化。
- `game:restart` 收紧为只允许 `finished` 房间调用，避免房主在对局中直接重置棋盘。
- `src/server/rooms.test.ts` 补充重开换先断言：
  - 第 2 局白方先。
  - 第 3 局黑方先。
- `tools/smoke-online-room.ts` 改为三局真实 Socket.IO 客户端冒烟：
  - 第 1 局黑先，白方非最后落子者请求悔棋被拒，黑方请求悔棋被白方拒绝，同局面再次请求被拒，黑方认输。
  - 第 2 局白先，黑方非最后落子者请求悔棋被拒，白方请求悔棋被黑方允许，白方重新落子后认输。
  - 第 3 局黑先，黑白各落一手，白方请求悔棋被黑方拒绝，同局面再次请求被拒，黑方认输。
- 更新 `README.md`、`WEBSITE_BUILD_PLAN.md`、`docs/STAGE_2_REPORT.md`、`docs/logic/realtime-room-module.md`、`docs/M3_PUBLIC_TEST_PLAN.md`、`docs/M3_PUBLIC_TEST_LOG.md`。

修改文件：

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/M3_PUBLIC_TEST_LOG.md`
- `docs/M3_PUBLIC_TEST_PLAN.md`
- `docs/STAGE_2_REPORT.md`
- `docs/logic/realtime-room-module.md`
- `package.json`
- `src/server/rooms.test.ts`
- `src/server/rooms.ts`
- `tools/smoke-online-room.ts`

验证命令和结果：

- `npm test`：通过，4 个测试文件、54 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3025 npm start` 后运行 `npm run smoke:online-room -- http://127.0.0.1:3025`，通过。

本地三局冒烟重点输出：

```text
PASS game 1 ready - black starts
PASS game 1 white undo denied - not-last-move-player
PASS game 1 rejected position blocks repeat - undo-request-rejected-position
PASS restart - game 2 queued for white
PASS game 2 ready - white starts
PASS game 2 black accepted undo
PASS restart - game 3 queued for black
PASS game 3 ready - black starts
PASS game 3 rejected position blocks repeat - undo-request-rejected-position
```

未验证项及原因：

- 真实服务器三局冒烟尚未运行；需要本轮提交推送并部署后，用新版本重跑 `verify:online` 和 `smoke:online-room`。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

下一步建议：

- 提交并推送后，若真实服务器自动更新或用户部署完成，运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net
```

- 之后继续 M3 收口：两台真实电脑和手机手动公测项仍需用户参与确认。

风险变化：

- 重开换先已进入服务端状态机和自动化冒烟，不再只是人工测试口头要求。
- 由于未交换玩家座位，第二局表现为白方先手；房主权限稳定保留给原房主。

## 25. 2026-06-25 M3 小步 3 线上复测状态：等待部署

本轮目标：

- 推送 `8e17d25` 后确认真实服务器是否已经更新。
- 若真实服务器已更新，继续运行三局线上好友房冒烟。

实际结果：

- 已运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net 8e17d25
```

- 输出摘要：

```text
PASS page - loaded
FAIL version - found version 299fc13, expected 8e17d25
PASS socket.io polling - handshake returned sid
PASS socket.io websocket - connected with websocket
```

判断：

- 真实服务器仍运行 `299fc13`，尚未部署 `8e17d25`。
- 因服务器版本未对上，本轮没有运行真实站点三局冒烟，避免旧服务结果误导。

下一步：

- 用户部署 `8e17d25` 或后续更新提交后，先运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
```

- 版本通过后再运行：

```bash
npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net
```

M3 当前剩余外部项：

- 部署 `8e17d25` 到真实服务器。
- 真实服务器三局好友房冒烟。
- 两台真实电脑手动走完好友房流程。
- 手机竖屏误触和弹框遮挡检查。

## 26. 2026-06-25 阶段 3 范围补充：分享、观战、聊天、房间列表

本轮目标：

- 按用户要求，把以下问题全部纳入 build plan 阶段 3：
  - 分享按钮不能是假的。
  - 创建/加入房间后 URL 应该变成带房间号的可分享地址。
  - 分享按钮复制当前 URL 到剪贴板。
  - 超过两人加入同一房间时，第三人及之后进入观战席。
  - 增加房间聊天频道。
  - 增加公共聊天频道。
  - 增加房间列表，让玩家看到当前谁在开房间。
  - 参考 PlayOK 的大厅、房间、聊天、排行榜等成熟产品方向。
- 记录新流程：每次推送 GitHub 后，等待 60 秒再检查线上服务器版本。

参考资料：

- PlayOK gomoku 页面：记录其公开展示的 live opponents、game rooms、rankings、stats、profiles、contacts、private messaging、game records、mobile support。
- PlayOK 社交结构研究资料：记录大厅中的活动桌列表、房间在线用户列表和文本聊天；进桌后有成员列表、玩家位和聊天区。

实际完成：

- 新增 `docs/STAGE_3_PLAN.md`：
  - 明确阶段 3 先做分享链接、观战席、房间列表、房间聊天、公共聊天，再做随机匹配、对局持久化、排行榜和账号。
  - 把每个功能拆成验收标准。
  - 写入每个小步都要文档、验证、提交推送，推送后 sleep 60 秒再检查线上版本。
- 更新 `WEBSITE_BUILD_PLAN.md`：
  - 阶段 3 标题改为“大厅、观战、聊天、随机匹配与账号/排行榜”。
  - 新增真实分享链接、观战席、房间列表/大厅、房间聊天、公共聊天。
  - 阶段 3 指向 `docs/STAGE_3_PLAN.md`。
- 更新 `docs/logic/lobby-matchmaking-module.md`：
  - 增加 PlayOK 参考边界。
  - 增加分享、观战、房间列表、聊天的阶段 3 结构设计。
  - 增加相关六语言文案 key。
- 更新 `README.md` 和 `docs/M3_PUBLIC_TEST_PLAN.md`：
  - 写入推送 GitHub 后等待 60 秒再检查线上版本。
  - README 文档索引加入阶段 3 计划。

修改文件：

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/M3_PUBLIC_TEST_PLAN.md`
- `docs/STAGE_3_PLAN.md`
- `docs/logic/lobby-matchmaking-module.md`

验证命令和结果：

- `git diff --check`：通过。
- 本轮是阶段计划和文档更新，不改运行时代码。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

下一步建议：

- 推送后 sleep 60 秒，再运行：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
```

- 若真实服务器仍未更新，记录为部署等待；不进入误判。

## 27. 2026-06-25 阶段 3 范围补充：用户状态、Profile、Ranking、Game records 和棋谱提交

本轮目标：

- 按用户要求，阶段 3 继续补齐 PlayOK 同类平台能力：
  - 用户状态。
  - Profile。
  - Ranking。
  - Game records。
  - 每一局在线玩家对局结束后提交棋谱到服务器。
  - 胜负双方都提交，双方都收到后服务端去重。
  - 注册玩家可通过个人游戏记录回看。
  - 游客棋谱也要提交服务器。
- 将推送后线上版本等待时间从 60 秒改为 90 秒。

实际完成：

- 更新 `docs/STAGE_3_PLAN.md`：
  - 增加用户状态、Profile、Ranking、Game records。
  - 增加在线棋谱提交、去重、partial / verified / conflicted 状态。
  - 明确注册玩家棋谱进入个人 Profile / Game records。
  - 明确游客棋谱也提交服务器，保存为匿名/guest game record，进入服务器棋谱池，用于后续离线分析、开局库生成和总体统计；默认不挂到公开 Profile，不进入正式注册用户 Ranking。
  - 每个小步推送后等待 90 秒再查线上版本。
- 更新 `WEBSITE_BUILD_PLAN.md`：
  - 阶段 3 功能范围加入用户状态、Profile、Game records、在线棋谱提交/去重/保存/回看。
  - 技术任务加入 `GameRecord`、`GameRecordSubmission` 和提交去重 API。
- 更新 `docs/logic/rating-leaderboard-module.md`：
  - 增加 Profile、状态、Game records 和棋谱提交设计。
  - 增加游客棋谱保存策略。
- 更新 `README.md` 和 `docs/M3_PUBLIC_TEST_PLAN.md`：
  - 推送 GitHub 后等待 90 秒再检查线上版本。

修改文件：

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/HANDOFF.md`
- `docs/M3_PUBLIC_TEST_PLAN.md`
- `docs/STAGE_3_PLAN.md`
- `docs/logic/rating-leaderboard-module.md`

验证命令和结果：

- `git diff --check`：通过。
- 本轮是阶段计划和文档更新，不改运行时代码。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 28. 2026-06-25 阶段 3 小步 1：真实分享链接

本轮目标：

- 开始实现阶段 3。
- 第一小步修正分享链接：
  - 创建房间成功后 URL 带 room code。
  - 加入房间成功后 URL 带 room code。
  - 刷新恢复房间时 URL 与房间一致。
  - 分享按钮复制当前浏览器地址。
  - 离开房间成功后清理 URL 上的 `room` 参数。

实际完成：

- `src/components/useFriendRoom.ts`：
  - `applyRoomAck` 成功后同步 `window.history`，把当前地址更新为 `?room=<code>`。
  - `copyInvite` 先同步当前房间 URL，再复制 `window.location.href`。
  - clipboard 不可用或失败时，把可复制链接写入页面错误提示。
  - `leaveRoom` 成功后清理 URL 上的 `room` 参数。
- 新增 `src/components/room-url.ts`：
  - `getRoomUrlFromHref`。
  - `clearRoomUrlFromHref`。
- 新增 `src/components/room-url.test.ts`：
  - 覆盖添加房间号、替换已有房间号、保留其他查询参数、清理房间号。
- 新增 `tools/smoke-share-url.ts`：
  - 使用系统 Chrome 和 Chrome DevTools Protocol 打开真实页面。
  - 验证进入 Friend room、Create room 后 URL 出现 room code。
  - 验证 Copy invite 报告复制成功。
  - 验证 Leave 后 URL 清理 room 参数。
- 新增 `docs/STAGE_3_PROGRESS.md`，记录阶段 3 小步骤进度。
- 更新 `README.md` 文档索引。
- 更新 `docs/STAGE_3_PLAN.md`，指向进度文档。

修改文件：

- `README.md`
- `docs/HANDOFF.md`
- `docs/STAGE_3_PLAN.md`
- `docs/STAGE_3_PROGRESS.md`
- `src/components/room-url.test.ts`
- `src/components/room-url.ts`
- `src/components/useFriendRoom.ts`
- `tools/smoke-share-url.ts`

验证命令和结果：

- `npm test`：通过，5 个测试文件、57 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3028 npm start` 后运行 `npm run smoke:share-url -- http://127.0.0.1:3028`，通过。
  - `PASS create room URL - 5ZDTN5`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://127.0.0.1:3028/en`
- 推送 `b6faf9e` 后等待 90 秒，运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net b6faf9e`，通过。
- 真实服务器运行 `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - E8VJ9U`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

最新提交：

```text
b6faf9e
```

是否已推送：

```text
已推送到 origin/main。
```

## 29. 2026-06-25 阶段 3 棋谱收集与本地分析口径澄清

本轮目标：

- 按用户澄清，明确“本地分析”的含义。
- 保持 handoff 追加记录规则：不修改过去窗口内容，只在末尾追加本窗口记录。

实际完成：

- `docs/STAGE_3_PLAN.md`：
  - 明确游客棋谱和注册玩家棋谱都进入服务器棋谱池。
  - 明确“本地分析”是后续把服务器收集到的棋谱导出到本地/离线分析流程，用于统计、筛选、训练/评估开局线和生成自有开局库。
  - 明确这不是只保存在游客浏览器本地。
- `WEBSITE_BUILD_PLAN.md`：
  - 阶段 3 棋谱提交范围补充同样的数据口径。
- `docs/logic/rating-leaderboard-module.md`：
  - 评分、排行榜、Game records 模块设计补充服务器棋谱池和本地/离线分析流程边界。
- `docs/STAGE_3_PROGRESS.md`：
  - 在阶段 3 进度文件顶部补充棋谱数据口径，避免后续小步误解。

验证命令和结果：

- `git diff --check`：通过，仅有 Windows 工作副本 LF/CRLF 提示。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 31. 2026-06-25 阶段 3 小步 2：观战席

本轮目标：

- 按阶段 3 build plan 推进小步 2。
- 第三个及之后加入同一房间的人进入观战席，不挤掉黑白座位。
- 观战者能看到棋盘、玩家列表、胜负、重开状态和观战人数。
- 观战者不能 ready、落子、认输、请求悔棋、响应悔棋或重开。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `RoomParticipantRole`、`RoomSpectatorSnapshot` 和 `spectators` 房间状态。
  - `room:join` 前两名成员进入黑白座位，第三人及之后进入 `spectators`。
  - `room:rejoin` 可恢复玩家座位或观战身份。
  - 玩家动作只允许黑白玩家执行，观战者返回 `not-room-player`。
  - 观战者点击 Leave 时从观战席移除；断线时只标记观战连接状态。
- `src/server/room-contract.ts`、`src/server/room-socket.ts`：
  - Room ack 返回 `role`、`seat` 和当前成员 `name`。
  - Socket 层区分玩家动作和房间成员动作。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`：
  - 前端识别 `player` / `spectator` 身份。
  - 观战者显示为 Spectator，功能栏玩家动作自动禁用。
  - 房间摘要显示观战人数，并列出观战者。
- `src/i18n/dictionaries.ts`、`src/app/globals.css`：
  - 六语言补充观战席/观战者文案。
  - 补充观战列表样式。
- `tools/smoke-online-room.ts`：
  - 冒烟脚本升级为三客户端：host、guest、spectator。
  - 继续覆盖三局换先、悔棋拒绝/允许、连续悔棋拒绝和认输收尾。
- `docs/STAGE_3_PROGRESS.md`、`docs/logic/realtime-room-module.md`：
  - 记录小步 2 实现与验证结果。

验证命令和结果：

- `npm test`：通过，5 个测试文件、59 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3029 npm start` 后运行 `npm run smoke:online-room -- http://127.0.0.1:3029`，通过。
  - `PASS room:join spectator - watcher seated without displacing players`
  - `PASS spectator move sync - watcher saw game 1 black center`
  - `PASS spectator move denied - not-room-player`
  - 三局 ready / restart 换先 / 悔棋 / 认输流程均通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3029`，通过。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 33. 2026-06-25 阶段 3 小步 2 末尾追加校正记录

本轮目标：

- 保持 handoff 规则：后续交接记录只从文件末尾追加。
- 补记本窗口最终截止点，避免只看文件末尾时漏掉小步 2 的线上验证结果。

实际结果：

- 阶段 3 小步 2 观战席实现提交：`99b4b03 Implement stage 3 spectator seats`。
- `99b4b03` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器 `http://gomoku.yagu.ddns-ip.net` 已显示 `version 99b4b03`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 99b4b03`：通过。
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，覆盖 host / guest / spectator 三客户端、观战者不能 ready/落子、观战者收到落子、三局换先、悔棋拒绝/允许、连续悔棋拒绝和认输。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 2 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 下一步：小步 3，房间列表 API 和 lobby socket channel。

## 34. 2026-06-25 阶段 3 小步 3：房间列表 API 和 lobby socket channel

本轮目标：

- 按阶段 3 build plan 推进小步 3。
- 提供公开房间列表 API，供后续大厅 UI 读取。
- 提供 lobby socket channel，客户端可加入大厅并接收房间列表增量更新。
- 房间创建、加入、ready 开局、结束或隐藏时，大厅收到增量事件。

实际完成：

- `src/server/room-store.ts`：
  - 新增共享 `roomStore`，让 REST API 和 Socket.IO 共用同一份内存房间状态。
- `src/server/rooms.ts`：
  - 新增 `RoomListItem`、`RoomListQuery`、`RoomListSnapshot`、`LobbyRoomUpdatedEvent`、`LobbyRoomDeletedEvent`。
  - `RoomStore` 新增 `listRooms()`、`getRoomListItem()` 和 lobby version。
  - 默认列表展示 `waiting` / `playing` 房；`finished` 可通过 `status=finished` 查询。
- `src/server/online-server.ts`：
  - 新增 `GET /api/rooms`，支持 `limit` 和 `status`。
  - Socket.IO 注册改用共享 `roomStore`。
- `src/server/room-socket.ts`：
  - 新增 `lobby:join`、`lobby:list`、`lobby:leave`。
  - 新增 `lobby:room-updated`、`lobby:room-deleted`。
  - 房间状态变化后广播 lobby 增量事件。
- `tools/smoke-lobby.ts`：
  - 新增 REST + lobby socket 冒烟脚本。
- `package.json`：
  - 新增 `npm run smoke:lobby`。
- `README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/lobby-matchmaking-module.md`：
  - 记录小步 3 能力、验证命令和当前边界。

验证命令和结果：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3030 npm start` 后运行 `npm run smoke:lobby -- http://127.0.0.1:3030`，通过。
  - REST 初始列表通过。
  - `lobby:join` 初始列表通过。
  - 创建房间、加入、ready 开局、结束隐藏的 lobby 增量事件均通过。
  - REST 包含新房间、隐藏 finished 房均通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3030`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3030`，通过。

最新提交：

```text
待本轮提交生成。
```

是否已推送：

```text
待提交后推送到 origin/main。
```

## 36. 2026-06-25 阶段 3 小步 3 末尾追加校正记录

本轮目标：

- 保持 handoff 后续交接记录只从文件末尾追加。
- 补记本窗口最终截止点，避免只看文件末尾时漏掉小步 3 的线上验证结果。

实际结果：

- 阶段 3 小步 3 房间列表 API 和 lobby socket channel 提交：`e0e0253 Implement stage 3 lobby room list channel`。
- `e0e0253` 已推送到 `origin/main`。
- 推送后等待 90 秒，第一次真实服务器版本检查仍为 `612ec19`；再等待 90 秒后，真实服务器显示 `version e0e0253`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net e0e0253`：通过。
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，覆盖 REST `/api/rooms`、`lobby:join` 初始列表、创建/加入/开局/结束的 lobby 增量事件、finished 房隐藏。
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，三客户端三局好友房流程无回归。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 3 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 下一步：小步 4，房间列表 UI：Join / Watch。

## 39. 2026-06-25 阶段 3 小步 4 本地完成与末尾追加校正

本轮目标：

- 保持 handoff 后续交接记录只从文件末尾追加。
- 补记小步 4 的真实本地完成状态，避免只看文件末尾时漏掉小步 4。
- 按用户澄清修正“本地分析”口径：服务器收集棋谱池，后续用户把收集来的棋谱导出到本地/离线流程，用于分析和开局库；不是浏览器本地保存或浏览器内分析。

实际完成：

- 阶段 3 小步 4 房间列表 UI Join / Watch 已实现。
- 好友房面板新增房间列表，初次挂载通过 `lobby:join` 取初始列表。
- 前端监听 `lobby:room-updated` / `lobby:room-deleted`，列表可随服务端增量事件更新。
- waiting 房显示 Join，点击后以第二名玩家加入。
- playing / 满员房显示 Watch，点击后进入观战席。
- 新增六语种房间列表文案和移动端单列布局。
- 新增 `tools/smoke-lobby-ui.ts` 和 `npm run smoke:lobby-ui`，用系统 Chrome 验证列表 Join / Watch。
- `docs/STAGE_3_PROGRESS.md`、`docs/STAGE_3_PLAN.md`、`docs/logic/lobby-matchmaking-module.md`、`docs/logic/rating-leaderboard-module.md` 已记录小步 4 和“本地分析”口径。

本地验证：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3031 npm start` 后运行 `npm run smoke:lobby-ui -- http://127.0.0.1:3031`，通过。
  - `PASS lobby waiting row join - 9T5GXQ`
  - `PASS lobby playing row watch - Z6WZUB`
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3031`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送小步 4，等待真实服务器更新后跑 `verify:online`、`smoke:lobby-ui`、`smoke:lobby`、`smoke:online-room` 和 `smoke:share-url`。

## 40. 2026-06-25 阶段 3 小步 4 线上验证补记

本轮目标：

- 保持 handoff 后续交接记录只从文件末尾追加。
- 补记小步 4 推送和真实服务器验证结果。

实际结果：

- 阶段 3 小步 4 房间列表 UI Join / Watch 提交：`9c12bef Implement stage 3 room list UI`。
- `9c12bef` 已推送到 `origin/main`。
- 推送后等待 90 秒，第一次真实服务器版本检查仍为 `14d85e8`；再等待 90 秒后，真实服务器显示 `version 9c12bef`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 9c12bef`：通过。
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - PF6LH7`
  - `PASS lobby playing row watch - VPSRUN`
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，覆盖 REST `/api/rooms`、`lobby:join` 初始列表、创建/加入/开局/结束的 lobby 增量事件、finished 房隐藏。
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，三客户端三局好友房流程无回归，覆盖换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 4 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 下一步：小步 5，房间聊天频道。

## 41. 2026-06-25 阶段 3 小步 5：房间聊天频道本地完成

本轮目标：

- 按阶段 3 build plan 推进小步 5。
- 实现房间聊天频道，让同房间玩家和观战者可发言。
- 服务端拒绝空消息、超长消息、发送过快消息和非房间成员消息。
- 好友房面板显示最近房间消息和发送输入框。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `RoomChatMessage` 和 `RoomSnapshot.chatMessages`。
  - 新增 `RoomStore.sendRoomChat()`。
  - 每房间保留最近 50 条内存消息。
  - 服务端限制空消息、160 字符上限和 800ms 发送间隔。
- `src/server/room-socket.ts`：
  - 新增 `room:chat-send`。
  - 聊天只广播同房间 `room:state`，不刷新 lobby 房间列表。
- `src/server/room-socket.test.ts`：
  - 覆盖观战者发言、房内广播、频率限制、空/超长消息和非成员拒绝。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`、`src/app/globals.css`：
  - 好友房面板新增房间聊天区域、最近消息列表、发送输入框和发送按钮。
- `src/i18n/dictionaries.ts`：
  - 六语言新增房间聊天文案。
- `tools/smoke-room-chat.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:room-chat` 及说明。

本地验证：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3032 npm start` 后运行 `npm run smoke:room-chat -- http://127.0.0.1:3032`，通过。
  - `PASS room chat setup - 886QF7`
  - `PASS room chat spectator broadcast`
  - `PASS room chat rate limit - chat-rate-limited`
  - `PASS room chat player broadcast`
  - `PASS empty chat rejected - chat-message-empty`
  - `PASS long chat rejected - chat-message-too-long`
  - `PASS stranger chat rejected - not-room-member`
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3032`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送小步 5，等待真实服务器更新后跑 `verify:online`、`smoke:room-chat`、`smoke:lobby-ui`、`smoke:lobby`、`smoke:online-room` 和 `smoke:share-url`。

## 42. 2026-06-25 阶段 3 小步 5 线上验证补记

本轮目标：

- 保持 handoff 后续交接记录只从文件末尾追加。
- 补记小步 5 推送和真实服务器验证结果。

实际结果：

- 阶段 3 小步 5 房间聊天频道提交：`c05ebfd Implement stage 3 room chat`。
- `c05ebfd` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version c05ebfd`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net c05ebfd`：通过。
- `npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS room chat setup - HKRXXW`
  - `PASS room chat spectator broadcast`
  - `PASS room chat rate limit - chat-rate-limited`
  - `PASS room chat player broadcast`
  - `PASS empty chat rejected - chat-message-empty`
  - `PASS long chat rejected - chat-message-too-long`
  - `PASS stranger chat rejected - not-room-member`
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - AK5KN5`
  - `PASS lobby playing row watch - EUKYRR`
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，覆盖 REST `/api/rooms`、`lobby:join` 初始列表、创建/加入/开局/结束的 lobby 增量事件、finished 房隐藏。
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，三客户端三局好友房流程无回归，覆盖换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 5 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 下一步：小步 6，公共聊天频道。

## 43. 2026-06-25 阶段 3 小步 6：公共聊天频道本地完成

本轮目标：

- 按阶段 3 build plan 推进小步 6。
- 实现大厅/好友房范围公共聊天频道。
- 服务端拒绝空消息、超长消息和发送过快消息。
- 好友房面板显示公共聊天最近消息和发送输入框。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `PublicChatMessage`、`PublicChatSnapshot`。
  - 新增 `RoomStore.listPublicChatMessages()` 和 `RoomStore.sendPublicChat()`。
  - 公共聊天复用最近 50 条内存消息、160 字符上限和 800ms 发送间隔。
- `src/server/room-contract.ts`：
  - 新增 `PublicChatAck`。
- `src/server/room-socket.ts`：
  - 新增 `public-chat:join`、`public-chat:leave`、`public-chat:send`。
  - 新增 `public-chat:messages` 广播。
- `src/server/room-socket.test.ts`：
  - 覆盖公共聊天 join、广播、频率限制、空/超长消息。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`：
  - 好友房面板新增公共聊天区域、最近消息列表、发送输入框和发送按钮。
- `src/i18n/dictionaries.ts`：
  - 六语言新增公共聊天文案。
- `tools/smoke-public-chat.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:public-chat` 及说明。

本地验证：

- `npm test`：通过，5 个测试文件、62 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3033 npm start` 后运行 `npm run smoke:public-chat -- http://127.0.0.1:3033`，通过。
  - `PASS public chat join - 0 messages`
  - `PASS public chat broadcast`
  - `PASS public chat rate limit - chat-rate-limited`
  - `PASS public empty chat rejected - chat-message-empty`
  - `PASS public long chat rejected - chat-message-too-long`
- 本地生产服务：`npm run smoke:room-chat -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3033`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送小步 6，等待真实服务器更新后跑 `verify:online`、`smoke:public-chat`、`smoke:room-chat`、`smoke:lobby-ui`、`smoke:online-room`、`smoke:lobby` 和 `smoke:share-url`。

## 44. 2026-06-25 阶段 3 小步 6 线上验证补记

本轮目标：

- 保持 handoff 后续交接记录只从文件末尾追加。
- 补记小步 6 推送和真实服务器验证结果。

实际结果：

- 阶段 3 小步 6 公共聊天频道提交：`3c37afb Implement stage 3 public chat`。
- `3c37afb` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version 3c37afb`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 3c37afb`：通过。
- `npm run smoke:public-chat -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS public chat join - 0 messages`
  - `PASS public chat broadcast`
  - `PASS public chat rate limit - chat-rate-limited`
  - `PASS public empty chat rejected - chat-message-empty`
  - `PASS public long chat rejected - chat-message-too-long`
- `npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`：通过，房间聊天无回归。
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过，房间列表 UI 无回归。
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，三客户端三局好友房流程无回归，覆盖换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，lobby REST/socket 无回归。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过，分享 URL 行为无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 6 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 下一步：小步 7，随机匹配。

## 45. 2026-06-25 阶段 3 联机回归修复：房间生命周期、补位和邀请链接

本轮触发：

- 真实服务器一台电脑三用户测试发现：
  - 对局中离开后再加入提示房间不存在。
  - 对局中断线后没有按 60 秒超时判胜负。
  - 掉线玩家占着座位。
  - 观战席不能补入空位。
  - 邀请链接没有从根路径自动进房，而是先到首页。
  - 房间无人后没有关闭，同一用户可以连续创建多个新房。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `RoomStore.sitPlayer()`，允许观战者在非 `playing` 状态下补入空玩家座位。
  - 观战者断线立即移除；非对局玩家离开或断线立即释放座位。
  - 对局中玩家断线保留 60 秒宽限期，超时后在线对手胜；双方都离线则 abandoned。
  - 房间无玩家、无观战者时立即删除并从 lobby 移除。
- `src/server/room-socket.ts`：
  - 新增 `room:sit`。
  - 同一 socket 创建新房、加入其他房间或重连其他房间前，会先释放当前旧房间身份，防止重复创建空房残留。
- `src/app/(root)/page.tsx`：
  - 根路径 `/` 重定向保留 query，`/?room=ABC123` 会进入 `/en?room=ABC123`。
- `src/components/useFriendRoom.ts`：
  - URL 带 `room` 时自动加入房间。
  - 玩家身份改为 session 级，兼容读取旧 localStorage 房间记录。
  - 加入遇到重复身份/重名时自动刷新游客身份后重试一次。
  - 新增 `canSit` 和 `sitRoom()`。
- `src/components/GameShell.tsx`：
  - URL 带 `room` 时首屏进入好友房模式。
  - 房间工具栏新增入座按钮。
- `tools/smoke-room-lifecycle.ts`：
  - 覆盖重复创建关闭旧房、观战者补位、对局中断线 60 秒后判负。
- `tools/smoke-share-url.ts`：
  - 增加根路径邀请链接自动进房验证。
- 文档：
  - `README.md` 增加 `npm run smoke:room-lifecycle`。
  - `docs/logic/realtime-room-module.md` 和 `docs/logic/lobby-matchmaking-module.md` 更新生命周期、补位和邀请链接规则。
  - `docs/STAGE_3_PROGRESS.md` 记录本次回归修复。

本地验证：

- `npm test`：通过，5 个测试文件、66 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3034 npm start` 后运行 `npm run smoke:room-lifecycle -- http://127.0.0.1:3034`，通过。
  - `PASS repeated create closes previous room - 63UE44 -> WYT2WW`
  - `PASS spectator sits in open seat - 2ZGJPM`
  - `PASS disconnect timeout forfeit - NNGYDS`
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3034`，通过。
  - `PASS create room URL - DBPRJ7`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://127.0.0.1:3034/en`
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:room-chat -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:public-chat -- http://127.0.0.1:3034`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送本轮联机回归修复，等待真实服务器更新后跑 `verify:online`、`smoke:room-lifecycle`、`smoke:share-url`、`smoke:online-room`、`smoke:lobby-ui`、`smoke:lobby`、`smoke:room-chat` 和 `smoke:public-chat`。

## 46. 2026-06-25 阶段 3 联机回归修复线上验证补记

本轮目标：

- 按 handoff 规则只从文件末尾追加，不修改旧窗口记录。
- 补记房间生命周期、补位和邀请链接热修的推送与真实服务器验证结果。

实际结果：

- 热修提交：`93ac3a5 Fix room lifecycle and invite joins`。
- `93ac3a5` 已推送到 `origin/main`。
- 推送后第一次等待 90 秒，真实服务器仍显示 `version 036e40d`。
- 第二次等待 90 秒后，真实服务器显示 `version 93ac3a5`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 93ac3a5`：通过。
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - U4P4VG -> 3XR2TN`
  - `PASS spectator sits in open seat - YWMS3U`
  - `PASS disconnect timeout forfeit - CRSTWY`
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - 6N9LDX`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，lobby REST/socket 无回归。
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - 6FKKJ7`
  - `PASS lobby playing row watch - XB9Q2P`
- `npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`：通过，房间聊天无回归。
- `npm run smoke:public-chat -- http://gomoku.yagu.ddns-ip.net`：通过，公共聊天无回归。
- `docs/STAGE_3_PROGRESS.md` 已更新本轮联机回归修复为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 联机回归修复：房间生命周期、补位和邀请链接，完成并通过真实服务器验证。
- 下一步：回到阶段 3 小步 7，随机匹配。

## 47. 2026-06-25 阶段 3 小步 7：随机匹配本地完成

本轮目标：

- 回到阶段 3 主线，完成小步 7 随机匹配。
- 保持 handoff 只在文件末尾追加。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `RoomStore.findMatch()`。
  - 服务端优先匹配最早创建、未满员的 waiting 房。
  - 满员、playing、finished、abandoned 房不参与匹配。
  - 同玩家或同名冲突房会被跳过。
  - 没有可用 waiting 房时创建新的 waiting 房。
- `src/server/room-socket.ts`：
  - 新增 `matchmaking:find`。
  - 新增 `matchmaking:cancel`。
  - `matchmaking:find` 会先释放当前 socket 的旧房间身份，避免重复占房。
- `src/components/useFriendRoom.ts`：
  - 新增 `findMatch()`、`cancelMatch()`、`matchmakingStatus`、`canFindMatch`、`canCancelMatch`。
- `src/components/GameShell.tsx`：
  - 好友房工具栏新增 Find match / Cancel match 按钮。
- `src/i18n/dictionaries.ts`：
  - 六语言新增随机匹配文案。
- `src/server/rooms.test.ts`：
  - 覆盖空大厅匹配创建 waiting 房、第二人加入同房、第三人不超员、同名冲突跳过。
- `src/server/room-socket.test.ts`：
  - 覆盖 socket `matchmaking:find` / `matchmaking:cancel` 和 lobby 增量事件。
- `tools/smoke-matchmaking.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:matchmaking` 及说明。
- `docs/logic/lobby-matchmaking-module.md`、`docs/STAGE_3_PROGRESS.md`：
  - 记录小步 7 随机匹配实现和当前单进程边界。

本地验证：

- `npm test`：通过，5 个测试文件、69 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3035 npm start` 后运行 `npm run smoke:matchmaking -- http://127.0.0.1:3035`，通过。
  - `PASS first find creates waiting room - MCYBBV`
  - `PASS second find joins waiting room - MCYBBV`
  - `PASS third find does not overfill - Y9K6LD`
  - `PASS cancel closes solo waiting match - Y9K6LD`
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3035`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送小步 7，等待真实服务器更新后跑 `verify:online`、`smoke:matchmaking`、`smoke:lobby`、`smoke:lobby-ui`、`smoke:share-url` 和 `smoke:online-room`。

## 48. 2026-06-25 阶段 3 小步 7 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 7 随机匹配的推送和真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 7 标记为完成并通过真实服务器验证。

实际结果：

- 阶段 3 小步 7 随机匹配提交：`c7e4f6b Implement stage 3 random matchmaking`。
- `c7e4f6b` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version c7e4f6b`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net c7e4f6b`：通过。
- `npm run smoke:matchmaking -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS first find creates waiting room - BGGTCB`
  - `PASS second find joins waiting room - BGGTCB`
  - `PASS third find does not overfill - 8EMSJY`
  - `PASS cancel closes solo waiting match - 8EMSJY`
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过，lobby REST/socket 无回归。
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - FWU5NW`
  - `PASS lobby playing row watch - MYX36G`
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - Q6RHFZ`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 7 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 联机回归修复：房间生命周期、补位和邀请链接，完成并通过真实服务器验证。
- 下一步：阶段 3 小步 8，在线棋谱提交、去重和匿名/注册记录保存。

## 49. 2026-06-25 阶段 3 小步 8：在线棋谱提交本地完成

本轮目标：

- 按阶段 3 build plan 推进小步 8。
- 实现在线棋谱提交、服务端去重、partial/verified/conflicted 状态流和 guest 棋谱保存。
- 保持 handoff 只在文件末尾追加。

实际完成：

- `src/server/game-records.ts`：
  - 新增 `GameRecordStore`。
  - append-only JSONL 保存 game record 状态更新。
  - 启动时可从 JSONL 重建最新记录状态。
  - 记录状态包括 `partial`、`verified`、`conflicted`。
- `src/server/rooms.ts`：
  - `RoomSnapshot` 新增 `gameId` 和 `finishReason`。
  - 同一房间连续重开时递增 `gameId`，例如 `ROOM01-1`、`ROOM01-2`。
  - 终局原因覆盖五连、和棋、认输、断线超时和 abandoned。
  - 终局时捕获 finalized server snapshot，后续客户端提交只用于一致性校验和双方到齐去重。
  - 新增 `submitGameRecord()` 和 `listGameRecords()`。
- `src/server/room-socket.ts`、`src/server/room-contract.ts`：
  - 新增 `game-record:submit` 和 `GameRecordAck`。
  - socket 层用当前连接的 `playerId` 作为提交者，避免客户端伪造提交者。
- `src/components/useFriendRoom.ts`：
  - 玩家看到 finished/abandoned 快照后自动提交一次棋谱。
  - 用 `playerId + gameId` 防止同一客户端重复提交。
- `src/server/room-store.ts`：
  - 默认保存路径：`data/game-records/records.jsonl`。
  - 可用 `GOMOKU_GAME_RECORDS_PATH` 覆盖。
- `.gitignore`：
  - 忽略 `data/game-records/`，避免真实棋谱进入代码仓库。
- `src/server/rooms.test.ts`：
  - 覆盖 partial、verified、重复提交去重、conflicted 且保留服务器权威棋谱。
- `src/server/game-records.test.ts`：
  - 覆盖 JSONL 持久化和重启加载。
- `src/server/room-socket.test.ts`：
  - 覆盖 Socket.IO 双方提交和重复提交去重。
- `tools/smoke-game-records.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:game-records`。
- `docs/logic/rating-leaderboard-module.md`、`docs/STAGE_3_PROGRESS.md`：
  - 记录小步 8 第一版实现和当前 guest 保存边界。

本地验证：

- `npm test`：通过，6 个测试文件、73 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3036 npm start` 后运行 `npm run smoke:game-records -- http://127.0.0.1:3036`，通过。
  - `PASS first submit partial - PDP52X-1`
  - `PASS second submit verified - PDP52X-1`
  - `PASS duplicate submit deduped - PDP52X-1`
- 本地确认 JSONL 写入：`data/game-records/records.jsonl` 产生 2 行状态更新，第一行 partial，第二行 verified；本地 smoke 数据已清理。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:matchmaking -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3036`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送小步 8，等待真实服务器更新后跑 `verify:online`、`smoke:game-records`、`smoke:online-room`、`smoke:lobby`、`smoke:matchmaking` 和 `smoke:share-url`。

## 50. 2026-06-25 阶段 3 小步 8 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 8 在线棋谱提交的推送和真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 8 标记为完成并通过真实服务器验证。

实际结果：

- 阶段 3 小步 8 在线棋谱提交提交：`7511cd7 Implement stage 3 game record submission`。
- `7511cd7` 已推送到 `origin/main`。
- 推送后第一次等待 90 秒，真实服务器仍显示 `version 688904f`。
- 第二次等待 90 秒后，真实服务器显示 `version 7511cd7`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 7511cd7`：通过。
- `npm run smoke:game-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS first submit partial - Y7VH6Q-1`
  - `PASS second submit verified - Y7VH6Q-1`
  - `PASS duplicate submit deduped - Y7VH6Q-1`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - P9XLNN`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：顺序重跑通过。
  - `PASS lobby room created - PNHC6E`
  - `PASS lobby room joined - player count updated`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
- `npm run smoke:matchmaking -- http://gomoku.yagu.ddns-ip.net`：顺序重跑通过。
  - `PASS first find creates waiting room - A7VZMM`
  - `PASS second find joins waiting room - A7VZMM`
  - `PASS third find does not overfill - DQWKQX`
  - `PASS cancel closes solo waiting match - DQWKQX`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - QLEM57 -> Y2XM6H`
  - `PASS spectator sits in open seat - 3XWUJG`
  - `PASS disconnect timeout forfeit - A38XDV`
- 并行 smoke 备注：第一次将 `smoke:lobby`、`smoke:matchmaking`、`smoke:share-url` 并行跑时，lobby/matchmaking 因测试脚本之间共享线上 waiting 房而互相干扰；随后改为顺序重跑并通过。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 8 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 联机回归修复：房间生命周期、补位和邀请链接，完成并通过真实服务器验证。
- 下一步：阶段 3 小步 9，注册玩家 Profile 和 Game records 回看。

## 51. 2026-06-25 阶段 3 小步 9：Profile 读回和空房生命周期本地完成

本轮目标：

- 按阶段 3 build plan 推进小步 9。
- 在没有注册系统前，先完成 guest/current-session 的 Profile 和 Game records 读回。
- 修复用户实测发现的空房不关闭、同一游客/玩家可反复创建多个活房间的问题。
- 继续遵守 handoff 规则：不修改过去窗口内容，只在末尾追加。

实际完成：

- `src/server/game-records.ts`：
  - 新增 `PlayerProfileSnapshot`、`PlayerGameRecordSummary`、玩家视角结果统计。
  - 新增 `getPlayerProfile()` 和 `listRecordsForPlayer()`。
  - 玩家记录改为按 playerId 过滤全量内存记录，再按更新时间取最近 N 条。
- `src/server/online-server.ts`：
  - 新增 `GET /api/profile`。
  - 新增 `GET /api/game-records` 作为当前读回接口别名。
- `src/components/useFriendRoom.ts`：
  - 新增 `profile`、`profileStatus`、`refreshProfile()`。
  - 在线棋谱提交成功后刷新 Profile。
  - 监听 `room:closed`，旧房关闭时清理本地房间状态和 URL。
  - 创建房间请求未返回时禁用创建按钮，防止高延迟连点创建多个房。
- `src/components/GameShell.tsx`、`src/app/globals.css`：
  - 好友房面板新增 Profile / Game records 小面板。
  - 显示当前游客名、对局数、胜负和棋统计、最近棋谱结果、对手、房间号、手数和 verified/partial/conflicted 状态。
- `src/server/rooms.ts`：
  - 新增 `leaveParticipantRooms()`，按 playerId 清理进入新房前的旧房间身份。
  - 对局中若所有参与者都断线，房间立即 abandoned 并从房间表删除。
  - 空房和全员离线房间不再继续占大厅。
- `src/server/room-socket.ts`：
  - `room:create`、`room:join`、`room:rejoin`、`matchmaking:find` 进入新房前清理同一玩家旧房。
  - 新增 `room:closed`，让旧标签页/旧连接明确收到房间关闭事件。
- `tools/smoke-profile-records.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:profile-records`。
  - 覆盖在线对局结束、双方提交 verified 棋谱、Profile 胜负读回和 `/api/game-records` 别名。
- `tools/smoke-room-lifecycle.ts`：
  - 增加同一 playerId 在第二个 socket 创建新房会关闭旧房的线上/本地冒烟路径。
- `docs/logic/rating-leaderboard-module.md`、`docs/STAGE_3_PROGRESS.md`：
  - 记录小步 9 第一版 guest Profile/Game records 读回边界和本地验证结果。

本地验证：

- `npx vitest run src/server/game-records.test.ts src/server/rooms.test.ts src/server/room-socket.test.ts`：通过，3 个测试文件、40 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm test`：通过，6 个测试文件、77 个测试用例。
- 本地生产服务：`PORT=3037 npm start` 后运行 `npm run smoke:profile-records -- http://127.0.0.1:3037`，通过。
  - `PASS submitted verified record - UFHDLR-1`
  - `PASS profile readback - UFHDLR-1`
- 本地生产服务：`npm run smoke:room-lifecycle -- http://127.0.0.1:3037`，通过。
  - `PASS repeated create closes previous room - JHKU84 -> MNNMQA`
  - `PASS same player create closes previous room - 4WL2Y4 -> HXJPUD`
  - `PASS spectator sits in open seat - 4WYFZB`
  - `PASS disconnect timeout forfeit - LVTYDU`
- 本地生产服务：`npm run smoke:game-records -- http://127.0.0.1:3037`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3037`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3037`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3037`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:profile-records`、`smoke:room-lifecycle`、`smoke:game-records`、`smoke:online-room`、`smoke:share-url` 和 `smoke:lobby-ui`。

## 52. 2026-06-25 阶段 3 小步 9 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 9 Profile/Game records 读回和空房生命周期补强的推送、真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 9 标记为完成并通过真实服务器验证。

实际结果：

- 阶段 3 小步 9 提交：`2731b61 Implement stage 3 profile records`。
- `2731b61` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version 2731b61`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 2731b61`：通过。
- `npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified record - VDNU89-1`
  - `PASS profile readback - VDNU89-1`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - TXFUAP -> A62UQ8`
  - `PASS same player create closes previous room - CCL3A2 -> M9LDH4`
  - `PASS spectator sits in open seat - E8M2WA`
  - `PASS disconnect timeout forfeit - NTLZPF`
- `npm run smoke:game-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS first submit partial - YB2EXJ-1`
  - `PASS second submit verified - YB2EXJ-1`
  - `PASS duplicate submit deduped - YB2EXJ-1`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - PB82PQ`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - D62KHR`
  - `PASS lobby playing row watch - R8ZHLS`
- `npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS REST room list - version 90`
  - `PASS lobby room created - QNTLP7`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
- `docs/STAGE_3_PROGRESS.md` 已更新小步 9 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 联机回归修复：房间生命周期、补位和邀请链接，完成并通过真实服务器验证。
- 下一步：继续阶段 3 剩余主线，账号/注册玩家身份、Ranking、用户状态和更完整的 Game records 回看仍未完成。

## 53. 2026-06-25 阶段 3 小步 10：用户状态 / Presence 本地完成

本轮目标：

- 按阶段 3 build plan 继续推进剩余主线。
- 在 Ranking 和账号系统之前，先完成用户状态 / Presence 第一版。
- 继续执行每个小步实现、验证、文档、提交推送和真实服务器验证的规则。

实际完成：

- `src/server/rooms.ts`：
  - 新增 `PresenceStatus`、`UserPresenceSnapshot`、`PresenceSnapshot`。
  - `RoomStore` 新增 presence 表、连接计数、`connectPresence()`、`updatePresence()`、`disconnectPresence()`、`listPresence()`。
  - Presence 状态由服务端事实推导：`online`、`in_room`、`playing`、`spectating`、`offline`。
  - `listPresence()` 默认只返回在线用户，`includeOffline=true` 时可返回离线快照。
- `src/server/room-socket.ts`、`src/server/room-contract.ts`：
  - 新增 `presence:join`、`presence:list`、`presence:leave`。
  - 新增 `presence:users` 实时广播。
  - 成功创建/加入/重连/匹配房间时自动绑定 socket presence。
  - 房间状态变化、断线、空房清理和公共聊天发送后广播最新 presence。
- `src/server/online-server.ts`：
  - 新增 `GET /api/presence`。
- `src/components/useFriendRoom.ts`：
  - 新增 `presenceUsers`、`presenceStatus`、`refreshPresence()`。
  - 监听 `presence:users` 实时更新在线用户。
- `src/components/GameShell.tsx`、`src/app/globals.css`：
  - 好友房面板新增 Online users 小面板。
  - 显示用户昵称、状态和房号。
- `src/i18n/dictionaries.ts`：
  - 六语言新增用户状态面板文案。
- `tools/smoke-presence.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:presence`。
  - 覆盖 Socket.IO presence channel 和 `GET /api/presence`。
- `docs/STAGE_3_PLAN.md`：
  - 建议小步顺序补入“用户状态 / Presence 第一版”，Ranking 顺延。
- `docs/logic/rating-leaderboard-module.md`、`docs/STAGE_3_PROGRESS.md`：
  - 记录小步 10 第一版设计边界和本地验证结果。

本地验证：

- `npx vitest run src/server/rooms.test.ts src/server/room-socket.test.ts`：通过，2 个测试文件、40 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm test`：通过，6 个测试文件、79 个测试用例。
- 本地生产服务：`PORT=3038 npm start` 后运行 `npm run smoke:presence -- http://127.0.0.1:3038`，通过。
  - `PASS presence lobby online`
  - `PASS presence host in room - T2559G`
  - `PASS presence playing and spectating`
  - `PASS presence REST readback`
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3038`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3038`，通过。
- 本地生产服务：`npm run smoke:profile-records -- http://127.0.0.1:3038`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:presence`、`smoke:online-room`、`smoke:lobby-ui` 和 `smoke:profile-records`。

## 54. 2026-06-25 阶段 3 小步 10 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 10 用户状态 / Presence 的推送和真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 10 标记为完成并通过真实服务器验证。

实际结果：

- 阶段 3 小步 10 提交：`2e7aa39 Implement stage 3 presence`。
- `2e7aa39` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version 2e7aa39`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 2e7aa39`：通过。
- `npm run smoke:presence -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS presence lobby online`
  - `PASS presence host in room - UBSJEB`
  - `PASS presence playing and spectating`
  - `PASS presence REST readback`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS lobby waiting row join - 85QVJX`
  - `PASS lobby playing row watch - 6TE53W`
- `npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified record - BYHKF4-1`
  - `PASS profile readback - BYHKF4-1`
- `docs/STAGE_3_PROGRESS.md` 已更新小步 10 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 下一步：阶段 3 小步 11，排行榜第一版。账号/注册玩家身份和更完整 Game records 回看仍在后续小步。

## 55. 2026-06-25 阶段 3 小步 11：排行榜第一版本地完成

本轮目标：

- 按阶段 3 build plan 继续推进 Ranking 第一版。
- 排行榜先做 guest/current-session 第一版，不提前引入账号密码系统。
- 只用双方提交后一致 verified 的在线棋谱作为排行榜数据源。
- 顺手修正用户反馈的创建房间入口：已在房间时前端禁用继续创建新房/随机匹配，服务端继续保证同一 player 进入新房前会清理旧房。

实际完成：

- `src/server/game-records.ts`：
  - 新增 `LeaderboardScope`、`LeaderboardEntry`、`LeaderboardSnapshot`。
  - `GameRecordStore.getLeaderboard()` 从 verified 在线棋谱重放胜负并计算排行榜。
  - 支持 `overall`、`daily`、`streak` 三个 scope。
  - 第一版 ELO：初始 1200，新手前 10 局 K=32，之后 K=24。
- `src/server/rooms.ts`、`src/server/online-server.ts`：
  - 新增 `RoomStore.getLeaderboard()`。
  - 新增 `GET /api/leaderboard?scope=overall|daily|streak&limit=...`。
- `src/components/useFriendRoom.ts`：
  - 新增 leaderboard 状态、刷新函数和 scope 切换。
  - `canCreateRoom`、`canFindMatch` 改为当前未在房间时才允许。
- `src/components/GameShell.tsx`、`src/app/globals.css`：
  - 好友房面板新增 Rankings 小面板。
  - 支持 Overall / Today / Streak 三个切换视图。
- `src/i18n/dictionaries.ts`：
  - 六语言新增排行榜面板文案。
- `tools/smoke-leaderboard.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:leaderboard`。
  - 覆盖打一局、双方提交 verified 棋谱、总榜/今日榜/连胜榜读回。
- `src/server/game-records.test.ts`：
  - 新增排行榜只使用 verified 棋谱的单元测试。

本地验证：

- `npm test`：通过，6 个测试文件、80 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3039 npm run start:online` 后运行 `npm run smoke:leaderboard -- http://127.0.0.1:3039`，通过。
  - `PASS submitted verified ranked record - 3AFPUQ-1`
  - `PASS leaderboard readback - 3AFPUQ-1`
- 本地生产服务：`npm run smoke:room-lifecycle -- http://127.0.0.1:3039`，通过。
  - `PASS repeated create closes previous room - C5LD46 -> B2TFUR`
  - `PASS same player create closes previous room - CV5ZQE -> RTBQSF`
  - `PASS spectator sits in open seat - WAL895`
  - `PASS disconnect timeout forfeit - 56CKLX`

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:leaderboard`、`smoke:room-lifecycle`，并按需要跑 `smoke:online-room` / `smoke:profile-records` 回归。

## 56. 2026-06-25 阶段 3 小步 11 线上验证补记

本轮目标：

- 按 handoff 追加规则，补记阶段 3 小步 11 排行榜第一版的推送和真实服务器验证结果。
- 更新阶段 3 进度文件，把小步 11 标记为完成并通过真实服务器验证。

实际结果：

- 阶段 3 小步 11 提交：`7aba938 Implement stage 3 leaderboard`。
- `7aba938` 已推送到 `origin/main`。
- 推送后第一次等待 90 秒，真实服务器仍显示 `version 8cb7e03`。
- 第二次等待 90 秒后，真实服务器显示 `version 7aba938`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 7aba938`：通过。
  - `PASS page - loaded`
  - `PASS version - version 7aba938`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:leaderboard -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified ranked record - K4B78K-1`
  - `PASS leaderboard readback - K4B78K-1`
- `npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified record - T5MYW5-1`
  - `PASS profile readback - T5MYW5-1`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - QKNR2E -> K8JV34`
  - `PASS same player create closes previous room - RGUVDQ -> YHAJNQ`
  - `PASS spectator sits in open seat - K5YP8W`
  - `PASS disconnect timeout forfeit - 4L6U9T`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- `docs/STAGE_3_PROGRESS.md` 已更新小步 11 为完成并通过真实服务器验证。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 用户刚反馈的“空房关闭、不能一直点创建新房”：本轮前端已禁用已在房间时继续创建/匹配，线上 `smoke:room-lifecycle` 已验证重复创建会关闭旧房。
- 下一步：阶段 3 后续小步继续推进账号/注册玩家身份、正式 Profile/Ranking、Game records 回看和更多 PlayOK 式用户功能。

## 57. 2026-06-25 阶段 3 小步 12：账号 / 注册玩家身份本地完成

本轮目标：

- 按阶段 3 build plan 继续推进账号/注册玩家身份第一版。
- 暂不接邮件 magic link、OAuth 或密码系统；先完成可用的服务器签发 token 轻账号。
- 注册玩家对局结束后，棋谱、Profile 和 Leaderboard 都应归属为 `registered`。
- 游客路径继续保持可玩，guest 棋谱继续提交和保存。

实际完成：

- `src/server/accounts.ts`：
  - 新增 `AccountStore`、`AccountSession`、`resolvePlayerIdentity()`。
  - 账号 JSONL 持久化，默认路径 `data/accounts/accounts.jsonl`。
  - 只保存 token hash，不保存明文 token。
- `src/server/room-store.ts`：
  - 新增生产 `accountStore` 单例。
  - 支持 `GOMOKU_ACCOUNTS_PATH` 覆盖账号持久化路径。
- `src/server/online-server.ts`：
  - 新增 `POST /api/account/register`。
  - 新增 `GET /api/account/session`。
  - `/api/profile` 支持 bearer token 验证 registered 身份。
  - `registerRoomSocketHandlers()` 传入 `accountStore`。
- `src/server/room-socket.ts`：
  - `room:create`、`room:join`、`room:rejoin`、`matchmaking:find`、`presence:join` 和 `public-chat:send` 支持 `accountToken`。
  - 有效 token 会由服务器解析账号 id/displayName/registered identity，忽略客户端伪造的 playerId/playerName。
  - Room ack 返回 `identity`。
- `src/server/rooms.ts`、`src/server/game-records.ts`：
  - 房间玩家、观战者、presence 和服务端权威棋谱保留 `identity`。
  - `getPlayerProfile()` 支持 registered fallback identity，并优先使用最近棋谱里的身份。
  - Leaderboard entry 继承棋谱身份。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`、`src/app/globals.css`：
  - 好友房面板新增账号条。
  - 可用当前昵称注册轻账号，token 存入 localStorage。
  - 创建、加入、匹配、presence、公共聊天和 Profile 刷新会使用 registered 身份。
  - Sign out 回到 guest 身份。
- `src/i18n/dictionaries.ts`：
  - 六语言新增账号条文案。
- `src/server/accounts.test.ts`、`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`：
  - 覆盖账号持久化、token hash、不接受坏 token、注册身份棋谱/Profile/Leaderboard、socket token 解析。
- `tools/smoke-account.ts`、`package.json`、`README.md`：
  - 新增 `npm run smoke:account`。
  - 覆盖真实服务器注册账号、账号 token、注册玩家棋谱、Profile 和 Leaderboard 归属。

本地验证：

- `npm test`：通过，7 个测试文件、84 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3040 npm run start:online` 后运行 `npm run smoke:account -- http://127.0.0.1:3040`，通过。
  - `PASS register host - acct_R2ng0dty0II`
  - `PASS register guest - acct_H6zhL_VhqcI`
  - `PASS account session verify`
  - `PASS registered record verified - BDFQD2-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`
- 本地生产服务：`npm run smoke:leaderboard -- http://127.0.0.1:3040`，通过。
  - `PASS submitted verified ranked record - C5T2R5-1`
  - `PASS leaderboard readback - C5T2R5-1`
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3040`，通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:account`、`smoke:leaderboard` 和必要联机回归。

## 58. 2026-06-25 阶段 3 小步 12 补强：空房关闭和防重复创建

本轮新增用户反馈：

- 房间里没有人的话，需要关房。
- 当前可一直点创建新房，产生多个新房。

处理原则：

- 不修改过去 handoff 内容，只追加本段记录。
- 继续把这项并入阶段 3 小步 12 的本地完成内容，提交前一并验证。

实际完成：

- `.gitignore`
  - 忽略运行态 `data/accounts/`，避免本地账号 smoke 生成的账号 JSONL 数据误提交。
- `src/components/useFriendRoom.ts`
  - `room:create` 增加同步 `createRequestInFlightRef` 锁。
  - 在 ack 返回前，即使用户连续点击，后续点击也不会再发出新的 `room:create`。
- `src/server/rooms.ts`
  - 新增 `listRoomCodes()`。
  - 新增 `deleteRoom()`，给 Socket.IO transport 层显式关闭僵尸房使用。
- `src/server/room-socket.ts`
  - 每次 `room:create`、`room:join`、`room:rejoin`、`matchmaking:find` 进入新房前，扫描所有房间码。
  - 如果 Socket.IO adapter 中对应房间频道没有任何 socket 成员，则删除该房间记录。
  - 删除时广播 `room:closed` 和 `lobby:room-deleted`。
- `src/server/rooms.test.ts`
  - 新增显式删除房间记录的单元测试。
- `src/server/room-socket.test.ts`
  - 新增“服务端残留房间记录但没有 socket 成员时，下一次创建房间前自动关闭”的测试。
- `tools/smoke-room-lifecycle.ts`
  - 新增等待房创建者直接断开后，房间从 `/api/rooms` 消失的真实 Socket.IO/HTTP 检查。
- `docs/logic/realtime-room-module.md`
  - 补记防连点创建和 transport 僵尸房清理规则。
- `docs/logic/rating-leaderboard-module.md`
  - 补记账号 / registered identity 第一版。
- `docs/STAGE_3_PLAN.md`
  - 小步 12 改为账号 / 注册玩家身份第一版，并追加后续 Profile、榜单隔离、棋谱回看方向。

本地验证：

- `npm test`：通过，7 个测试文件、86 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3041 npm run start:online`。
- `npm run smoke:room-lifecycle -- http://127.0.0.1:3041`：通过。
  - `PASS repeated create closes previous room - RWQUYP -> R8PNJY`
  - `PASS same player create closes previous room - DV9H6W -> B25627`
  - `PASS empty waiting room closes on disconnect - YH89E5`
  - `PASS spectator sits in open seat - ZWKVMR`
  - `PASS disconnect timeout forfeit - 7MEY6S`
- `npm run smoke:account -- http://127.0.0.1:3041`：通过。
  - `PASS register host - acct_eQ20PWKdNuk`
  - `PASS register guest - acct_IvDmwRquGGQ`
  - `PASS account session verify`
  - `PASS registered record verified - GCPWX2-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`
- `npm run smoke:leaderboard -- http://127.0.0.1:3041`：通过。
  - `PASS submitted verified ranked record - B9PZVA-1`
  - `PASS leaderboard readback - B9PZVA-1`
- `npm run smoke:online-room -- http://127.0.0.1:3041`：通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:account`、`smoke:room-lifecycle`、`smoke:leaderboard` 和 `smoke:online-room`。

## 59. 2026-06-25 阶段 3 小步 12 线上验证补记

本轮目标：

- 记录阶段 3 小步 12 账号 / 注册玩家身份第一版的提交、推送和真实服务器验证结果。
- 记录用户反馈的空房关闭、防重复创建补强在真实服务器上的验证结果。

实际结果：

- 阶段 3 小步 12 提交：`2348f77 Implement stage 3 registered accounts`。
- `2348f77` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version 2348f77`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 2348f77`：通过。
  - `PASS page - loaded`
  - `PASS version - version 2348f77`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:account -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS register host - acct_WItn4PgZrdA`
  - `PASS register guest - acct_PLyWORKjA1k`
  - `PASS account session verify`
  - `PASS registered record verified - DAT7Q6-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`
- `npm run smoke:leaderboard -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified ranked record - WRGGWK-1`
  - `PASS leaderboard readback - WRGGWK-1`
- `npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified record - 75VS53-1`
  - `PASS profile readback - 75VS53-1`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - K65W2X -> TGX9AV`
  - `PASS same player create closes previous room - 4DPDAB -> AMY9Y6`
  - `PASS empty waiting room closes on disconnect - AT8QZ2`
  - `PASS spectator sits in open seat - ZRFFEN`
  - `PASS disconnect timeout forfeit - V2QJQ7`
- `npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`：通过，继续覆盖三客户端三局、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 小步 12：账号 / 注册玩家身份第一版，完成并通过真实服务器验证。
- 用户反馈的“房间里没人要关房、不能一直创建新房”：已补强并通过真实服务器 `smoke:room-lifecycle`。

下一步：

- 阶段 3 继续推进注册玩家正式 Profile / Game records 页面入口、注册用户和游客排行榜隔离、棋谱回看与开局库导出准备。

## 60. 2026-06-25 阶段 3 小步 13：Profile / Game records 页面入口本地完成

本轮目标：

- 按阶段 3 build plan 继续推进注册玩家正式 Profile / Game records 页面入口。
- 保持 handoff 追加规则，不修改过去窗口记录。
- 小步 13 先完成正式 URL、账号入口、排行榜入口和最近棋谱展示；棋谱逐手回放和导出留给后续小步。

实际完成：

- `src/app/[locale]/profile/[playerId]/page.tsx`
  - 新增正式 Profile 页面路由。
  - URL 形式为 `/{locale}/profile/{playerId}?name=...`。
- `src/components/profile/PlayerProfilePage.tsx`
  - 新增客户端 Profile 页面。
  - 通过 `/api/profile` 拉取资料。
  - 浏览器存在账号 token 时携带 bearer token。
  - 展示玩家名、identity、playerId、胜负统计、verified/partial 统计、最近 Game records。
  - 每条 Game record 展示 gameId、roomCode、对手、结果、手数、记录状态和最终盘面缩略图。
- `src/components/profile/profile-url.ts`
  - 新增 Profile URL 拼接 helper。
- `src/components/GameShell.tsx`
  - 账号条 registered 状态下新增 Profile 链接。
  - 排行榜条目改为链接到对应玩家 Profile。
- `src/app/globals.css`
  - 新增 Profile 页面、统计块、棋谱卡片和最终盘面缩略图样式。
- `tools/smoke-profile-page.ts`、`package.json`、`README.md`
  - 新增 `npm run smoke:profile-page`。
  - 冒烟覆盖注册账号、打一局、双方提交棋谱、打开 `/en/profile/<playerId>` 并确认页面读回 displayName 和 gameId。
- `docs/STAGE_3_PROGRESS.md`、`docs/logic/rating-leaderboard-module.md`
  - 补记小步 13 目标、实现和后续边界。

本地验证：

- `npm test`：通过，7 个测试文件、86 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过，Next 输出包含 `ƒ /[locale]/profile/[playerId]`。
- 本地生产服务：`PORT=3042 npm run start:online`。
- `npm run smoke:profile-page -- http://127.0.0.1:3042`：通过。
  - `PASS register host - acct_2qy9sTSbVts`
  - `PASS register guest - acct_7GV-slaHjn0`
  - `PASS profile page readback - 89YV5Z-1`
- `npm run smoke:account -- http://127.0.0.1:3042`：通过。
  - `PASS registered record verified - 723GPF-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`
- `npm run smoke:leaderboard -- http://127.0.0.1:3042`：通过。
  - `PASS submitted verified ranked record - 8UMT6H-1`
  - `PASS leaderboard readback - 8UMT6H-1`

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:profile-page`、`smoke:account` 和 `smoke:leaderboard`。

## 61. 2026-06-25 阶段 3 小步 13 线上验证补记

本轮目标：

- 记录阶段 3 小步 13 Profile / Game records 页面入口的提交、推送和真实服务器验证结果。

实际结果：

- 阶段 3 小步 13 提交：`400c82e Add stage 3 profile pages`。
- `400c82e` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version 400c82e`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 400c82e`：通过。
  - `PASS page - loaded`
  - `PASS version - version 400c82e`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:profile-page -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS register host - acct_JLGCuW-9tt8`
  - `PASS register guest - acct_eNDIItuJJJ8`
  - `PASS profile page readback - P4F2NF-1`
- `npm run smoke:account -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS registered record verified - CWPEAC-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`
- `npm run smoke:leaderboard -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified ranked record - MRJ2ND-1`
  - `PASS leaderboard readback - MRJ2ND-1`

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 小步 12：账号 / 注册玩家身份第一版，完成并通过真实服务器验证。
- 小步 13：Profile / Game records 页面入口第一版，完成并通过真实服务器验证。

下一步：

- 阶段 3 继续推进注册用户和游客排行榜隔离、棋谱逐手回放、棋谱导出与开局库准备。

## 62. 2026-06-25 阶段 3 小步 14 本地完成：注册/游客排行榜隔离与创建房 UI 收口

本轮目标：

- 按阶段 3 主线推进注册用户和游客排行榜隔离。
- 回应用户反馈：“房间里没有人的话需要关房；页面上可以一直点创建新房”。
- 保持 handoff 追加规则，不修改过去窗口记录。

实现记录：

- `src/server/game-records.ts`
  - 新增 `LeaderboardIdentity = registered | guest | all`。
  - `getLeaderboard()` 默认 `registered`，避免游客棋谱混入正式注册用户 Ranking。
  - `identity=guest` 返回游客榜，`identity=all` 返回合并榜。
- `src/server/online-server.ts`
  - `/api/leaderboard` 新增 `identity` 查询参数。
- `src/components/useFriendRoom.ts`
  - 新增 `leaderboardIdentity` 状态和 setter。
  - `refreshLeaderboard()` 带 `identity`。
- `src/components/GameShell.tsx`
  - Rankings 面板新增 Registered / Guests / All 分栏。
  - 入房后顶部入口区只显示 Copy invite；Create / Find / Join 只在未入房时显示。
  - 排行榜条目显示注册/游客来源身份，并继续链接到 Profile。
- `src/i18n/dictionaries.ts`
  - 六语言补齐排行榜身份分栏文案。
- `tools/smoke-leaderboard-audience.ts`
  - 新增注册/游客/全部榜隔离冒烟。
- `tools/smoke-share-url.ts`
  - 增强真实页面冒烟：创建后不能再次触发创建；同一 hostName 只保留一个房间；host 离开后空房从 `/api/rooms` 消失。
- `tools/smoke-leaderboard.ts`
  - 显式读取 `identity=guest`。
- `tools/smoke-account.ts`
  - 显式读取 `identity=registered`。
- `README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/rating-leaderboard-module.md`
  - 记录新 smoke 命令、排行榜身份参数和本地验证结果。

本地验证：

- `npm test`：通过，7 个测试文件、87 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3043 npm run start:online`。
- `npm run smoke:share-url -- http://127.0.0.1:3043`：通过。
  - `PASS create room locked while already in room`
  - `PASS empty room closed after leave - PXRK5F`
- `npm run smoke:room-lifecycle -- http://127.0.0.1:3043`：通过。
  - `PASS repeated create closes previous room - NZKE7A -> XCA6NV`
  - `PASS same player create closes previous room - XHHG7T -> 6A7ZZM`
  - `PASS empty waiting room closes on disconnect - 64BLJC`
  - `PASS disconnect timeout forfeit - RBAX78`
- `npm run smoke:leaderboard-audience -- http://127.0.0.1:3043`：通过。
  - `PASS leaderboard audience split`
- `npm run smoke:leaderboard -- http://127.0.0.1:3043`：通过。
- `npm run smoke:account -- http://127.0.0.1:3043`：通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:share-url`、`smoke:room-lifecycle`、`smoke:leaderboard-audience`、`smoke:leaderboard` 和 `smoke:account`。

## 63. 2026-06-25 阶段 3 小步 14 线上验证补记

本轮目标：

- 记录小步 14 的提交、推送和真实服务器验证结果。
- 明确用户反馈的“空房关闭 / 不要一直创建新房”已经通过真实页面和 Socket lifecycle 双路径验证。

提交与部署：

- 小步 14 提交：`a57dece Implement leaderboard audience filters`。
- 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器 `http://gomoku.yagu.ddns-ip.net` 显示 `version a57dece`。

真实服务器验证：

- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net a57dece`：通过。
  - `PASS page - loaded`
  - `PASS version - version a57dece`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - SLUJ3Z`
  - `PASS create room locked while already in room`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
  - `PASS empty room closed after leave - SLUJ3Z`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - PE6RRP -> AWNKLB`
  - `PASS same player create closes previous room - FLZ9RB -> A6GRYB`
  - `PASS empty waiting room closes on disconnect - 57KTTU`
  - `PASS spectator sits in open seat - CTENW5`
  - `PASS disconnect timeout forfeit - UEH6JX`
- `npm run smoke:leaderboard-audience -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS guest ranked record - 6YPBY3-1`
  - `PASS registered ranked record - AGNK2L-1`
  - `PASS leaderboard audience split`
- `npm run smoke:leaderboard -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified ranked record - U7LJXL-1`
  - `PASS leaderboard readback - U7LJXL-1`
- `npm run smoke:account -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS registered record verified - LBV7AW-1`
  - `PASS registered profile readback`
  - `PASS registered leaderboard readback`

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 小步 12：账号 / 注册玩家身份第一版，完成并通过真实服务器验证。
- 小步 13：Profile / Game records 页面入口第一版，完成并通过真实服务器验证。
- 小步 14：注册用户 / 游客排行榜隔离与创建房 UI 收口，完成并通过真实服务器验证。

下一步：

- 阶段 3 继续推进棋谱逐手回放、棋谱导出与开局库准备、以及后续账号完整化能力。

## 64. 2026-06-26 阶段 3 小步 15 本地完成：棋谱回看和开局库导出准备

本轮目标：

- 按阶段 3 计划继续推进小步 15：棋谱回看和开局库导出准备。
- 保持 HANDOFF 追加规则，不修改过去窗口记录。

实现记录：

- `src/game/record-replay.ts`
  - 新增按手数重放棋盘的 helper。
  - 回放手数会 clamp 到 `0..moves.length`。
- `src/components/profile/PlayerProfilePage.tsx`
  - Profile / Game records 页面每张棋谱卡片新增逐手回放。
  - 小棋盘根据当前手数重放，不再固定展示终局。
  - 增加上一手 / 下一手按钮、range 滑块、`Move {move} / {total}` 状态。
  - 当前最后一手高亮。
- `src/app/globals.css`
  - 新增棋谱回放控件样式和最后一手高亮。
- `src/i18n/dictionaries.ts`
  - 六语言新增 replay move / previous / next 文案。
- `src/server/game-record-export.ts`
  - 新增棋谱导出序列化模块。
  - 支持 SGF 和 JSONL。
  - 支持按 `verified|partial|conflicted|all` 过滤。
- `tools/export-game-records.ts`
  - 新增 `npm run export:game-records`。
  - 默认读取 `data/game-records/records.jsonl`，默认导出 verified 棋谱到 `.arena-results/game-records-export.sgf`。
- `tools/smoke-game-record-export.ts`
  - 新增本地导出 smoke。
- `tools/smoke-profile-page.ts`
  - 对局扩展为 3 手后认输。
  - 浏览器冒烟验证 Profile 页面回放从 `Move 3 / 3` 点击上一手变成 `Move 2 / 3`。
- `README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/rating-leaderboard-module.md`
  - 记录本小步命令、实现和验证。

本地验证：

- `npm test`：通过，9 个测试文件、91 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run smoke:game-record-export`：通过。
  - `PASS export verified records - EXPORT1-1`
  - `PASS export SGF and JSONL serialization`
- `npm run export:game-records -- --output .arena-results/game-records-export-check.sgf --limit 5`：通过。
  - `Exported 5 verified game records to .arena-results\game-records-export-check.sgf (sgf).`
- 本地生产服务：`PORT=3044 npm run start:online`。
- `npm run smoke:profile-page -- http://127.0.0.1:3044`：通过。
  - `PASS profile page readback - TF9NAV-1`
- `npm run smoke:profile-records -- http://127.0.0.1:3044`：通过。
  - `PASS profile readback - 7FMQVJ-1`

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:profile-page`、`smoke:profile-records` 和必要回归。

## 65. 2026-06-26 阶段 3 小步 15 线上验证补记

本轮目标：

- 记录小步 15 的提交、推送和真实服务器验证结果。
- 补记线上 smoke 暴露的脚本鲁棒性问题和修复。

提交与部署：

- 小步 15 提交：`801a0b5 Add game record replay and export`。
- 已推送到 `origin/main`。
- 推送后第一次等待 90 秒，真实服务器仍显示 `version b2521c0`。
- 第二次等待 90 秒后，真实服务器显示 `version 801a0b5`。

真实服务器验证：

- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 801a0b5`：通过。
  - `PASS page - loaded`
  - `PASS version - version 801a0b5`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:profile-page -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS register host - acct_cOL-w34ky1g`
  - `PASS register guest - acct_oy4N5jVmVr0`
  - `PASS profile page readback - RXBKZ4-1`
  - 脚本验证了 Profile 页面回放从 `Move 3 / 3` 点击上一手变成 `Move 2 / 3`。
- `npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS submitted verified record - BXQSJR-1`
  - `PASS profile readback - BXQSJR-1`

线上 smoke 修复：

- `tools/smoke-profile-page.ts`
  - `document.body` 可能在页面刚打开时为空，已改成空 body 安全读取。
  - 账号 displayName 最长 24 字符，长前缀会截断导致重复注册 409；已改成短唯一名，并在 409 时重试。
- `npm run lint`：修复后通过。

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 小步 12：账号 / 注册玩家身份第一版，完成并通过真实服务器验证。
- 小步 13：Profile / Game records 页面入口第一版，完成并通过真实服务器验证。
- 小步 14：注册用户 / 游客排行榜隔离与创建房 UI 收口，完成并通过真实服务器验证。
- 小步 15：棋谱回看和开局库导出准备，完成并通过真实服务器验证。

下一步：

- 阶段 3 继续推进账号完整化、棋谱下载入口、开局库分析流程接入，以及后续 PlayOK 式用户功能。

## 66. 2026-06-26 阶段 3 小步 16 本地完成：房间生命周期二次补强

本轮目标：

- 回应用户反馈：“房间里没有人的话，需要关房”“可以一直点创建新房，创好多个新房”。
- 不修改过去 handoff 内容，只追加本窗口记录。

实现记录：

- `src/server/rooms.ts`
  - 新增 `leaveDisposableWaitingRoomsByParticipantName()`。
  - 同名游客在不同标签页或连接里创建新房时，旧的一人等待房会被关闭。
  - 清理范围限定为一人等待房，避免误伤已有两名玩家或正在对局的同名房间。
- `src/server/room-socket.ts`
  - 进入新房前按 `playerId` 和游客昵称两层清理旧等待房。
  - 定时 lifecycle sweep 增加 `closeRoomsWithoutSocketMembers()`，主动关闭没有任何 Socket.IO 成员的残留房。
- `src/server/rooms.test.ts`
  - 覆盖同名一人等待房清理。
  - 覆盖已有两名玩家的等待房不会被同名清理误伤。
- `src/server/room-socket.test.ts`
  - 覆盖两个 socket、不同 `playerId`、同一游客昵称重复创建房间时旧房关闭。
- `tools/smoke-room-lifecycle.ts`
  - 新增真实服务器可复用断言：`PASS same guest name create closes previous room`。
- `README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/lobby-matchmaking-module.md`
  - 记录本轮补强范围和验证命令。

本地验证：

- `npx vitest run src/server/rooms.test.ts src/server/room-socket.test.ts`：通过，2 个测试文件、47 个测试用例。
- `npm run lint`：通过。
- `npm test`：通过，9 个测试文件、94 个测试用例。
- `npm run build`：通过。
- 本地生产服务：`PORT=3046 npm run start:online`。
- `npm run smoke:room-lifecycle -- http://127.0.0.1:3046`：通过。
  - `PASS repeated create closes previous room - 5RRH76 -> S3TXWW`
  - `PASS same player create closes previous room - V86LH3 -> G67LTS`
  - `PASS same guest name create closes previous room - 854PUP -> 9U8XE4`
  - `PASS empty waiting room closes on disconnect - MP2UQS`
  - `PASS spectator sits in open seat - ADL2CG`
  - `PASS disconnect timeout forfeit - BKA32W`
- `npm run smoke:share-url -- http://127.0.0.1:3046`：通过。
  - `PASS create room locked while already in room`
  - `PASS empty room closed after leave - UK3HDB`

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：等待真实服务器部署新版后，运行 `verify:online`、`smoke:room-lifecycle` 和 `smoke:share-url`。

## 67. 2026-06-26 阶段 3 小步 16 线上验证补记

本轮目标：

- 记录房间生命周期二次补强的提交、推送和真实服务器验证结果。
- 确认用户反馈的重复创建房间和空房关闭路径在真实站通过。

提交与部署：

- 小步 16 提交：`ad0fd9f Tighten room lifecycle cleanup`。
- 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version ad0fd9f`。

真实服务器验证：

- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net ad0fd9f`：通过。
  - `PASS page - loaded`
  - `PASS version - version ad0fd9f`
  - `PASS socket.io polling - handshake returned sid`
  - `PASS socket.io websocket - connected with websocket`
- `npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS repeated create closes previous room - WYBKU8 -> S6XU76`
  - `PASS same player create closes previous room - KPF4E8 -> DL3F69`
  - `PASS same guest name create closes previous room - PLG2MB -> YCDPBJ`
  - `PASS empty waiting room closes on disconnect - Z2WC43`
  - `PASS spectator sits in open seat - JUTEA2`
  - `PASS disconnect timeout forfeit - 9FNLHN`
- `npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`：通过。
  - `PASS create room URL - JKFSQX`
  - `PASS create room locked while already in room`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
  - `PASS empty room closed after leave - JKFSQX`

当前阶段 3 状态：

- 小步 1：真实分享链接，完成并通过真实服务器验证。
- 小步 2：观战席，完成并通过真实服务器验证。
- 小步 3：房间列表 API 和 lobby socket channel，完成并通过真实服务器验证。
- 小步 4：房间列表 UI：Join / Watch，完成并通过真实服务器验证。
- 小步 5：房间聊天频道，完成并通过真实服务器验证。
- 小步 6：公共聊天频道，完成并通过真实服务器验证。
- 小步 7：随机匹配，完成并通过真实服务器验证。
- 小步 8：在线棋谱提交、去重和 guest 棋谱保存，完成并通过真实服务器验证。
- 小步 9：Profile / Game records 读回第一版和空房生命周期补强，完成并通过真实服务器验证。
- 小步 10：用户状态 / Presence 第一版，完成并通过真实服务器验证。
- 小步 11：排行榜第一版，完成并通过真实服务器验证。
- 小步 12：账号 / 注册玩家身份第一版，完成并通过真实服务器验证。
- 小步 13：Profile / Game records 页面入口第一版，完成并通过真实服务器验证。
- 小步 14：注册用户 / 游客排行榜隔离与创建房 UI 收口，完成并通过真实服务器验证。
- 小步 15：棋谱回看和开局库导出准备，完成并通过真实服务器验证。
- 小步 16：房间生命周期二次补强，完成并通过真实服务器验证。

下一步：

- 阶段 3 继续推进棋谱下载入口、开局库分析流程接入、账号完整化，以及后续 PlayOK 式用户功能。

## 68. 2026-06-26 阶段 3 小步 17 本地完成：单局 SGF 下载入口

本轮目标：

- 按阶段 3 主线继续推进棋谱下载入口。
- Profile / Game records 页面每条棋谱都能下载单局 SGF。
- 保持 handoff 追加规则，不修改过去窗口记录。

实现记录：

- `src/game/game-record-sgf.ts`
  - 新增浏览器可用的单局 SGF 序列化 helper。
  - 从 `PlayerGameRecordSummary` 和当前 Profile 玩家名生成 SGF。
  - 按 `playerSeat` 推断 `PB` / `PW`。
  - 写入 `GN`、`EV`、`DT`、`RE` 和 record status / finish reason / moveSeq / playerSeat / result 注释。
  - 新增 SGF data URL 和安全 `.sgf` 文件名 helper。
- `src/game/game-record-sgf.test.ts`
  - 覆盖姓名推断、结果、坐标、注释字段、data URL 和文件名安全化。
- `src/components/profile/PlayerProfilePage.tsx`
  - Profile 棋谱卡片新增 `Download SGF` 入口。
  - 下载使用 anchor `download` 属性和 data URL，不依赖额外 API。
- `src/app/globals.css`
  - 新增棋谱卡片动作区和下载按钮样式。
- `src/i18n/dictionaries.ts`
  - 六语言新增 `downloadSgf` 文案。
- `tools/smoke-profile-page.ts`
  - 浏览器冒烟在 Profile 读回和逐手回放之外，验证 SGF 下载链接、`.sgf` 文件名和 data URL。
- `README.md`、`docs/STAGE_3_PROGRESS.md`、`docs/logic/rating-leaderboard-module.md`
  - 记录本小步范围和验证结果。

本地验证：

- `npx vitest run src/game/game-record-sgf.test.ts src/game/record-replay.test.ts`：通过，2 个测试文件、4 个测试用例。
- `npm run lint`：通过。
- `npm test`：通过，10 个测试文件、96 个测试用例。
- `npm run build`：通过。
- 本地生产服务：`PORT=3047 npm run start:online`。
- `npm run smoke:profile-page -- http://127.0.0.1:3047`：通过。
  - `PASS profile page readback - 5CYUK6-1`
  - 脚本验证了 Profile 页面回放从 `Move 3 / 3` 点击上一手变成 `Move 2 / 3`。
  - 脚本验证了 `Download SGF` 链接、`.sgf` 文件名和 `data:application/x-go-sgf` URL。
- `npm run smoke:profile-records -- http://127.0.0.1:3047`：通过。
  - `PASS profile readback - V5YWYR-1`

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：等待真实服务器部署新版后，运行 `verify:online`、`smoke:profile-page` 和 `smoke:profile-records`。
