# 当前任务交接文档

更新日期：2026-06-23

## 当前状态

项目路径：

```text
D:\OneDrive\AiPrograms\gomoku-online
```

远程仓库：

```text
git@github.com:SeptYagu/gomoku-online.git
```

当前目标：

- 将参考项目研究流程升级为标准流程。
- 按模块派子代理深读参考项目。
- 将每个模块的研究结果细化到 `docs/logic/*.md`。
- 建立主控 + 实现子代理 + 独立验证子代理的标准开发制度。
- 建立任务交接文档制度。

## 已完成

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
- 新增 `docs/STANDARD_RESEARCH_WORKFLOW.md`。
- 新增 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`。
- 新增本交接文档 `docs/HANDOFF.md`。

## 子代理结果摘要

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

## 当前文档入口

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

## 下一步建议

优先做阶段 1 前置基础：

1. 派实现子代理 A：负责 i18n 路由和字典基础设施。
2. 派实现子代理 B：负责主题 token、黑暗模式切换和持久化。
3. 派实现子代理 C：负责规则模块补齐 `isValidMove/getNearbyMoves/getGameResult` 和测试。
4. 派验证子代理：独立运行测试、构建，并做浏览器检查。

建议先不要做：

- Socket.IO 在线对战。
- 排行榜。
- 真实广告。
- Hard AI。

原因：

- 当前基础 UI 还没完成六语言和黑暗模式。
- 用户已明确要求这些是硬性基础要求。

## 验证状态

上一次完整验证是在阶段 0：

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

均通过。

本轮主要是文档和流程更新，完成后至少运行：

```bash
git diff --check
```

如果后续开始改代码，需要重新跑完整门禁。

## 注意事项

- `.research/` 是参考仓库目录，已被 `.gitignore` 忽略，不要提交。
- `.ssh/` 是 deploy key，已被忽略，不要提交。
- APK 只作体验参考，不提交，不复用代码/素材。
- 无 LICENSE 项目不能复制源码。
- MIT 项目如迁移代码，需要补 `THIRD_PARTY_NOTICES.md`。
- 每次阶段性完成都要更新本文件，方便新窗口接手。
