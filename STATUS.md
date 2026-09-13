# STATUS.md

> 本文件是本仓库唯一权威的动态事实基准（Single Source of Truth），随时反映当前分支的最新工程状态。

---

## 1. 当前版本与环境快照

- **当前分支与 HEAD**：`main`（以 `git rev-parse --short HEAD` 实时为准）
- **上游远端**：`git@github.com:SeptYagu/gomoku-online.git`
- **最新阶段交付提交**：`3e201ec fix(refactor): restore ai thinking indicator in GameShell and converge review findings`
- **环境基准**：
  - Node.js v24.x
  - npm 11.x
  - TypeScript 5.8.x
  - Next.js 16.2.9
  - React 19.2.7
  - Socket.IO 4.8.3

---

## 2. 门禁基线指标（当前全绿）

- **TypeScript 编译检查** (`npx tsc --noEmit`)：0 错误（严格类型推导，无逆变与缺少属性）
- **代码规范检查** (`npm run lint`)：0 错误，0 警告（严格遵守 React 19 Hooks 规则）
- **单元测试** (`npm test`)：28 个测试套件 / 242 项用例 100% 通过
- **生产构建** (`npm run build`)：打包成功，所有多语言路由静态预渲染正常
- **联机时序烟测** (`npm run verify:online` + `smoke:lobby` + `smoke:matchmaking`)：全绿通过

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
- ✅ **Phase 2: 前端状态 Hook 解耦与代码卫生收敛**：`useFriendRoom.ts` 拆解为 4 个专注子 Hook（441 行装配器），根除 R6 模块级全局快照缺陷，收敛 Phase 1 全部 4 项 P3 审查建议，外部 API 零破坏。
- ✅ **Phase 3: 联机大厅与表现层组件化**：`GameShell.tsx` 抽离 `useAiGame` 领域 Hook（593 行，-39.0%），建立 `RoomContext` 消除 Props 逐层透传，`OnlineLobbyView.tsx` 拆解为 6 个高内聚独立子面板（191 行纯容器），收敛 Phase 2 全部 6 项 P3 审查建议。
- ✅ **Phase 3 缺陷修复与复审收敛**：解决 Round 3 审查指出的 P2-1（恢复侧栏 `dictionary.ai.thinking` 状态文案，消除 6 语种孤儿键）、P3-1（以 `wc -l` 精确校准 Phase 2 与 Phase 3 handoff 全部行数）与 P3-2（同步刷新权威基准提交 SHA）。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md)。
- ✅ **Phase 3 修复独立复审（Round 4，被审 `3e201ec`）**：**审查通过**。0×P0/P1/P2；1×P3（`STATUS.md:11` 最新交付提交相对修复交付滞后一拍，Round-3 P3-2 同类问题的结构性复发，建议采用「当前 HEAD 指引 + 阶段交付提交」双字段收敛）。Round 3 全部 4 项发现确认闭环。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md)。
- ✅ **Phase 4: 服务端领域服务解耦**：将 2414 行的服务端巨石单文件 `src/server/rooms.ts` 拆解为三大微领域服务（`RoomStateMachine` 2130 行、`PresenceTracker` 280 行、`LeaderboardService` 87 行），`rooms.ts` 蜕变为 324 行轻量 Facade 门面类，完整代理 41 个公开方法，重导出 31 个公开类型与 `createRoomCode`，外部调用方 `room-socket.ts`、`rooms.test.ts`（43 项用例）与 `online-server.ts` 100% 零改动兼容，四道门禁+全套联机烟测全绿通过。详见 [`docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`](docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md)。
- ✅ **Phase 4 领域解耦独立复审（Round 5，被审 `23b03fb`）**：**审查未通过**。0×P0/P1/P2；**1×P3**（`STATUS.md:11` 阶段交付提交滞后一拍，Round-3 P3-2 / Round-4 P3-1 同类问题第三次复发，双字段收敛方案仍未落地）。功能等价性经 98 块块级字节比对 + 691 项差分断言 + 116 项版本契约断言独立证实**零行为回归**，四道门禁与三套联机烟测独立复跑全绿，handoff 全部量化声明逐项属实。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md)。

---

## 4. 当前技术债与架构路线图（Roadmap）

> 详细分阶段执行方案与边界请查阅：[`2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)

1. ✅ ~~**Phase 1: 全局常量中枢与代码卫生治理**~~（已完成）
2. ✅ ~~**Phase 2: 前端状态 Hook 解耦**~~（已完成：`useFriendRoom.ts` 拆解为 `useRoomSocket`、`useLobbyPresence`、`useRoomChat`、`useRoomGame` 与 `room-state-utils`，消除 R6 模块级快照）
3. ✅ ~~**Phase 3: 联机大厅与表现层组件化**~~（已完成：`GameShell.tsx` 抽离 `useAiGame`，建立 `RoomContext`，`OnlineLobbyView.tsx` 拆解为 6 个独立子面板，收敛 Phase 2 全部审查建议）
4. ✅ ~~**Phase 4: 服务端领域服务解耦**~~（已完成：`rooms.ts` 拆解为 PresenceTracker、LeaderboardService、RoomStateMachine 三大微领域服务与 Facade 门面，外部 API 零破坏）
5. **Phase 5: 五子棋核心算法分层**（`ai.ts` 拆分为评估器、$\alpha\text{-}\beta$ 搜索器、开局调度器，并通过 Arena 自动化天梯评测）

---

## 5. 交接文档索引

- 详细交接单索引请查阅：[`docs/handoff/INDEX.md`](docs/handoff/INDEX.md)
- **全局分阶段重构总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **最新单阶段交付单**：[`docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`](docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md`](docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md`](docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md)
- **最新独立审查（Round 5，被审 `23b03fb`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md)（0×P0/1/2，**1×P3**，**审查未通过**，待修复后 Round 6 复审）
- **前序独立审查（Round 4，被审 `3e201ec`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md)（0×P0/1/2，1×P3，**审查通过**，Round 3 全部 4 项闭环）
- **前序独立审查（Round 3，被审 `b45e3fb`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md)（0×P0/1，**1×P2**，3×P3，已在 Round 4 闭环）
- **前序独立审查（Round 2，被审 `785c8d4`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round2-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round2-handoff.md)（0×P0/1/2，6×P3，其中 4 项已在 Phase 3 完全闭环、2 项部分闭环）
- **前序独立审查（Round 1，被审 `1e6ef36`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md)（P3 建议已在 Phase 2 全部收敛）
- 原始全量档案：[`docs/archive/LEGACY_HANDOFF_ARCHIVE.md`](docs/archive/LEGACY_HANDOFF_ARCHIVE.md)
