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

当前目标是收口 `20260625-001746-stage0-redo` 的阶段 0 重做结果，让阶段报告和交接文档反映实际状态：

- 阶段 0 重做版已补齐默认英语、六语言路由、字典和阿拉伯语 RTL。
- 阶段 0 重做版已补齐浅色/黑暗模式切换入口和 `localStorage` 持久化。
- 阶段 0 重做版已补齐规则模块接口和规则测试。
- Aster 独立验证已通过完整代码门禁和真实 Chrome/CDP 浏览器验收。
- 文档必须明确 UI/规则/文档子代理自测边界，以及最终通过状态来自 Aster 独立验证。
- 本轮验证后文档收口子代理不提交、不推送，不修改源码、package、workflow、git 配置或其他报告文档。

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
- 阶段 0 重做独立验证子代理 Aster 已完成：
  - `npm test` 通过。
  - `npm run lint` 通过。
  - `npm run build` 通过。
  - `npm audit --omit=dev` 通过，0 vulnerabilities。
  - `git diff --check` 通过，仅有 LF/CRLF 工作副本提示。
  - 真实 Chrome/CDP 浏览器验收覆盖 `/` 重定向 `/en`、六语言路由、桌面 1440x900、移动 390x844、棋盘落子、`/ar` RTL 且棋盘 LTR、主题切换和刷新持久化。
  - 验证报告：`docs/subagents/20260625-001746-stage0-redo-验证-Aster.md`
- 阶段 0 重做验证后文档收口子代理已更新：
  - `docs/STAGE_0_REPORT.md`
  - `docs/HANDOFF.md`
  - `docs/subagents/20260625-001746-stage0-redo-verify-docs-实现-Lumen.md`

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
| stage0-redo 验证后文档收口 | `git diff --check` | 通过 | Lumen 本轮实际运行；仅更新允许范围内文档 |

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
| Vitest 配置 | `vitest.config.ts` |
| Next 配置 | `next.config.ts` |

## 8. 当前文档入口

- `README.md`
- `WEBSITE_BUILD_PLAN.md`
- `docs/REUSE_EVALUATION.md`
- `docs/STAGE_0_REPORT.md`
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

## 10. 下一步派发表

| 优先级 | 子代理 | 目标 | 允许修改范围 | 禁止范围 | 输入文档 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 实现 SEO | 补多语言 metadata、`hreflang`、canonical/alternate 和 sitemap 基础 | `src/app/**`、必要配置、相关文档 | 不做广告、Socket、排行榜 | `WEBSITE_BUILD_PLAN.md`、`docs/logic/i18n-theme-module.md` | 六语言 SEO 链接正确，build 通过 |
| P1 | 实现 Game UX | 完善本地双人体验、悔棋、重开和状态流迁移到新版规则接口 | `src/components/**`、`src/game/**`、必要测试 | 不做在线服务、排行榜、真实广告 | `docs/logic/rules-engine-module.md`、`docs/logic/i18n-theme-module.md` | 完整下完一盘，悔棋/重开可用，规则测试通过 |
| P1 | 实现 AI Easy | 增加 Easy AI 初版 | `src/game/**`、必要 UI 接入和测试 | 不做 Hard AI Worker | `docs/logic/ai-engine-module.md` | 随机合法落子并优先基础补杀/防守，测试通过 |

建议先不要做：

- Socket.IO 在线对战。
- 排行榜。
- 真实广告。
- Hard AI。

这些属于后续阶段。当前 stage0-redo 已完成独立验证，可以进入 SEO、Game UX 和 Easy AI 等阶段 1 工作。

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

## 12. Do / Do Not

必须做：

- 每个阶段遵循 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`。
- 参考项目研究遵循 `docs/STANDARD_RESEARCH_WORKFLOW.md`。
- 每次阶段完成更新本文件。
- 每次使用子代理后，把子代理报告落到 `docs/subagents/`，并在本文件记录路径。
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
