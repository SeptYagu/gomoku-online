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
- **单元测试** (`npm test`)：26 个测试套件 / 228 项用例 100% 通过
- **生产构建** (`npm run build`)：打包成功，所有多语言路由静态预渲染正常

---

## 3. 近期已交付里程碑

- ✅ **P1-P4 基线消除与规范统一**：消除 TS 逆变与 `visibility` 缺失错误、SGF 统一转义规范、弹窗 A11y 键盘焦点优化。
- ✅ **AI Worker 线程复用池** (`src/game/ai-worker-pool.ts`)：构建 idle/busy 双队列复用机制，彻底解决频繁创建销毁 Worker 引起的 GC 抖动。
- ✅ **开局库 4 档难度分级与加权选择** (`src/game/opening-book.ts`)：Normal/Hard/Expert/Insane 分级，引擎支持难度门控加权对局。
- ✅ **IX-07 精确大厅实时汇总**：在线人数、空台数、对局数、观战人数实现单调版本化增量同步，多语言与自适应样式补齐。
- ✅ **提示词中枢与交接解耦落地**：建立 `AGENTS.md` 规则中枢、`STATUS.md` 动态状态表与 `docs/handoff/` 增量归档体系，历史 5152 行记录无损迁移至 `docs/archive/LEGACY_HANDOFF_ARCHIVE.md`。
- ✅ **双智能体协同与代码审查闭环挂载**：在 `AGENTS.md` 完整集成 Antigravity ↔ WorkBuddy 独立审查派发、提示词模板与 3 轮自愈闭环协议。

---

## 4. 当前技术债与架构路线图（Roadmap）

1. **`src/server/rooms.ts`（2360 行）模块解耦**：
   - 现状：房间生命周期、Presence 在线用户追踪、全服天梯排行榜与单调版本管理耦合在同一大文件中。
   - 目标：拆分为 `PresenceTracker`、`LeaderboardAggregator`、`RoomStateMachine` 三个子服务。
2. **`src/components/useFriendRoom.ts`（1731 行）Hook 瘦身**：
   - 现状：单个 Hook 承载了 Socket 握手重连、对局状态机、聊天同步、大厅列表与弹窗控制。
   - 目标：分拆出 `useRoomSocket`、`useRoomChat`、`useLobbyPresence` 等专注子 Hook。
3. **`src/game/ai.ts`（2575 行）算法分层**：
   - 现状：棋型评估模型、$\alpha\text{-}\beta$ 极大极小值搜索和开局引导逻辑混杂。
   - 目标：解耦为纯数学评估器、搜索器与开局策略调度器。

---

## 5. 交接文档索引

- 详细交接单索引请查阅：[`docs/handoff/INDEX.md`](docs/handoff/INDEX.md)
- 最新交接单：[`docs/handoff/2026-09-11-full-review-and-lobby-summary-handoff.md`](docs/handoff/2026-09-11-full-review-and-lobby-summary-handoff.md)
- 原始全量档案：[`docs/archive/LEGACY_HANDOFF_ARCHIVE.md`](docs/archive/LEGACY_HANDOFF_ARCHIVE.md)
