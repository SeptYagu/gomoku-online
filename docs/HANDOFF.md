# 当前任务交接文档

更新日期：2026-06-23

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

最近已确认推送点：

```text
0b6a74c docs: define agent workflow and handoff process
```

说明：本文件会随着后续提交继续变化。接手时以 `git log --oneline -1` 和 `git status --short --branch` 的实时输出为准。

本轮补全文档前确认：

```text
git status --short --branch
## main...origin/main
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

- 将参考项目研究流程升级为标准流程。
- 按模块派子代理深读参考项目。
- 将每个模块的研究结果细化到 `docs/logic/*.md`。
- 建立主控 + 研究子代理 + 实现子代理 + 独立验证子代理的标准开发制度。
- 建立可接手、可执行、可复盘的任务交接文档制度。
- 验证并补全两个 workflow 和本 handoff。

## 5. 已完成

- 初始化 Next.js 16 + React 19 + TypeScript 项目。
- 实现 15x15 棋盘、本地双人落子、基础胜负检测。
- 推送初始阶段 0。
- 增加“默认英语 + 联合国六种官方语言 + 黑暗模式”硬性要求。
- 建立 `docs/logic/` 模块研究目录。
- 派出多个研究子代理，每个研究一个模块。
- 已收到并整合以下模块研究：
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

## 6. Verification Matrix

| 范围 | 命令 | 状态 | 说明 |
| --- | --- | --- | --- |
| 阶段 0 代码基线 | `npm test` | 通过 | 阶段 0 完整验证时通过 |
| 阶段 0 代码基线 | `npm run lint` | 通过 | 阶段 0 完整验证时通过 |
| 阶段 0 代码基线 | `npm run build` | 通过 | 阶段 0 完整验证时通过 |
| 阶段 0 代码基线 | `npm audit --omit=dev` | 通过 | 阶段 0 完整验证时通过 |
| workflow/handoff 文档基线 | `git diff --check` | 通过 | 提交 `0b6a74c` 前通过 |
| 本轮文档完整性补全 | `git diff --check` | 通过 | 文档-only 改动，完整前端构建非必需 |

代码改动后必须重新运行完整门禁。UI 改动还必须做真实浏览器检查。

## 7. 当前代码地图

| 领域 | 文件 |
| --- | --- |
| App 入口 | `src/app/page.tsx` |
| HTML metadata/layout | `src/app/layout.tsx` |
| 全局样式 | `src/app/globals.css` |
| 游戏容器 | `src/components/GameShell.tsx` |
| 棋盘组件 | `src/components/GomokuBoard.tsx` |
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
- 当前项目已有基础规则，但需要补 `isValidMove`、`getEmptyCells`、`getNearbyMoves`、`getGameResult`。
- 当前 `checkWin` 六连 `slice(0,5)` 可能截掉 lastMove，需要修正语义。

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
- 当前项目仍有 `html lang="zh-CN"`、中文 UI、英文 aria 和浅色-only CSS。
- 下一阶段应优先建立 `[locale]` 路由、字典、RTL、`data-theme` 和防闪烁。

## 10. 下一步派发表

| 优先级 | 子代理 | 目标 | 允许修改范围 | 禁止范围 | 输入文档 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 实现 A | 建立 i18n 路由和字典基础设施，默认英语，支持 `en/zh/fr/es/ru/ar` | `src/app/**`、新建 `src/i18n/**`、必要测试 | 不做 Socket、广告、排行榜 | `docs/logic/i18n-theme-module.md`、`STANDARD_DEVELOPMENT_WORKFLOW.md` | 默认英文；六语言可切换；`ar` RTL；棋盘不镜像 |
| P0 | 实现 B | 建立主题 token、黑暗模式切换和持久化 | `src/app/globals.css`、主题相关组件或工具 | 不改规则和在线服务 | `docs/logic/i18n-theme-module.md` | 浅色/黑暗可切换；刷新保持；无闪烁或记录限制 |
| P0 | 实现 C | 补齐规则模块 API 和测试 | `src/game/board.ts`、`src/game/types.ts`、`src/game/board.test.ts` | 不改 UI、i18n、主题 | `docs/logic/rules-engine-module.md` | `isValidMove/getEmptyCells/getNearbyMoves/getGameResult` 可测；六连语义明确 |
| P0 | 验证 D | 独立验证 A/B/C 的集成结果 | 默认不写文件，可提交验证报告 | 不修代码 | 两个 workflow、handoff、相关模块文档 | `npm test`、`npm run lint`、`npm run build`、浏览器桌面/移动/六语言/主题检查 |

建议先不要做：

- Socket.IO 在线对战。
- 排行榜。
- 真实广告。
- Hard AI。

这些属于后续阶段。当前基础 UI 还没完成六语言和黑暗模式，用户已明确要求这些是硬性基础要求。

## 11. Risk Register

| 风险 | 严重级别 | 触发条件 | 缓解方案 | 阶段 |
| --- | --- | --- | --- | --- |
| 客户端伪造胜负或评分 | blocker | 在线对战、排行榜上线 | 服务端权威、幂等结算、事务 | 在线阶段 |
| 无许可证源码误复制 | blocker | 参考 `scheng20`、`minh100` 等许可证不清项目 | 只参考流程，不复制源码 | 全阶段 |
| 六语言/RTL 后补导致大改 | major | 先写大量中文硬编码 UI | 阶段 1 先做 i18n | 阶段 1 |
| 黑暗模式后补导致样式返工 | major | 继续使用浅色-only CSS | 先建立 token 和 `data-theme` | 阶段 1 |
| 广告影响棋盘误触 | major | 广告靠近棋盘或按钮 | 广告位远离高频点击区，浏览器验收 | 商业化阶段 |
| AI 计算阻塞 UI | major | Hard AI 在主线程运行 | Worker 化、requestId、boardVersion | AI 阶段 |
| 共享文件并行冲突 | major | 多代理同时改 `src/app/**`、字典、全局 CSS | 主控指定 owner，串行合并 | 全阶段 |

## 12. Do / Do Not

必须做：

- 每个阶段遵循 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`。
- 参考项目研究遵循 `docs/STANDARD_RESEARCH_WORKFLOW.md`。
- 每次阶段完成更新本文件。
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

## 13. 交接更新模板

每次阶段性完成后，把以下信息补进本文件：

```text
本轮目标：
实际完成：
修改文件：
验证命令和结果：
未验证项及原因：
最新提交：
是否已推送：
下一步建议：
风险变化：
```
