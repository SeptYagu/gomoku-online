# STATUS.md

> 本文件是本仓库唯一权威的动态事实基准（Single Source of Truth），随时反映当前分支的最新工程状态。

---

## 1. 当前版本与环境快照

- **当前分支**：`main`
- **上游远端**：`git@github.com:SeptYagu/gomoku-online.git`
- **最新交付提交**：`19f2974 docs: establish AGENTS.md prompt hub, STATUS.md, and decouple handoffs with zero information loss`
- **环境基准**：
  - Node.js v24.x
  - npm 11.x
  - TypeScript 5.8.x
  - Next.js 16.2.9
  - React 19.2.7
  - Socket.IO 4.8.3

---

## 2. 门禁基线指标（当前全绿）

- **TypeScript 编译检查** (`npx tsc --noEmit`)：0 错误（已彻底清除测试环境类型逆变与缺失属性）
- **代码规范检查** (`npm run lint`)：0 错误，0 警告
- **单元测试** (`npm test`)：27 个测试套件 / 233 项用例 100% 通过
- **生产构建** (`npm run build`)：打包成功，所有多语言路由静态预渲染正常

---

## 3. 近期已交付里程碑

- ✅ **P1-P4 基线消除与规范统一**：消除 TS 逆变与 `visibility` 缺失错误、SGF 统一转义规范、弹窗 A11y 键盘焦点优化。
- ✅ **AI Worker 线程复用池** (`src/game/ai-worker-pool.ts`)：构建 idle/busy 双队列复用机制，彻底解决频繁创建销毁 Worker 引起的 GC 抖动。
- ✅ **开局库 4 档难度分级与加权选择** (`src/game/opening-book.ts`)：Normal/Hard/Expert/Insane 分级，引擎支持难度门控加权对局。
- ✅ **IX-07 精确大厅实时汇总**：在线人数、空台数、对局数、观战人数实现单调版本化增量同步，多语言与自适应样式补齐。
- ✅ **提示词中枢与交接解耦落地**：建立 `AGENTS.md` 规则中枢、`STATUS.md` 动态状态表与 `docs/handoff/` 增量归档体系，历史 5152 行记录无损迁移至 `docs/archive/LEGACY_HANDOFF_ARCHIVE.md`。
- ✅ **双智能体协同与代码审查闭环挂载**：在 `AGENTS.md` 完整集成 Antigravity ↔ WorkBuddy 独立审查派发、提示词模板与 3 轮自愈闭环协议。
- ✅ **全量技术债分阶段重构蓝图落地**：基于审查文档制定 5 阶段渐进解耦规划交接单，支持后续单阶段独立执行。
- ✅ **Phase 1: 全局常量中枢与代码卫生治理**：提取 `src/lib/constants.ts` 与单测、封装 `ThemeScript.tsx` 消除布局内联脚本重复、全仓替换魔法值并补充自由五子棋规则说明。

---

## 4. 当前技术债与架构路线图（Roadmap）

> 详细分阶段执行方案与边界请查阅：[`2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)

1. ✅ ~~**Phase 1: 全局常量中枢与代码卫生治理**~~（已完成）
2. **Phase 2: 前端状态 Hook 解耦**（`useFriendRoom.ts` 1772 行拆分为 4 个专注子 Hook，消除 R6 模块级快照）
3. **Phase 3: 联机大厅与表现层组件化**（`GameShell.tsx` 抽离 `useAiGame`，`OnlineLobbyView.tsx` 拆分子视图并引入 `RoomContext`）
4. **Phase 4: 服务端领域服务解耦**（`rooms.ts` 2415 行拆分为 PresenceTracker、LeaderboardService、RoomStateMachine）
5. **Phase 5: 五子棋核心算法分层**（`ai.ts` 2574 行拆分为评估器、$\alpha\text{-}\beta$ 搜索器、开局调度器，并通过 Arena 自动化天梯评测）

---

## 5. 交接文档索引

- 详细交接单索引请查阅：[`docs/handoff/INDEX.md`](docs/handoff/INDEX.md)
- **全局分阶段重构总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- 最新单阶段交付单：[`docs/handoff/2026-09-13-phase1-code-hygiene-handoff.md`](docs/handoff/2026-09-13-phase1-code-hygiene-handoff.md)
- 原始全量档案：[`docs/archive/LEGACY_HANDOFF_ARCHIVE.md`](docs/archive/LEGACY_HANDOFF_ARCHIVE.md)
