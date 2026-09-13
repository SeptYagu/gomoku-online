# 交接文档：Phase 3 联机大厅与表现层组件化交付单 (Phase 3 Handoff)

- **交付日期**：2026-09-13
- **交付角色**：Phase 3 独立开发与验证工程师
- **所属阶段**：Phase 3（联机大厅与表现层组件化）
- **关联总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **输入审计**：[`docs/handoff/2026-09-13-workbuddy-code-review-round2-handoff.md`](2026-09-13-workbuddy-code-review-round2-handoff.md)

---

## 1. 交付目标与背景

在重构蓝图 Phase 3 中，前端两大核心表现层巨石组件面临高耦合、巨量 Props 逐层钻透与维护困难的问题：
1. **`GameShell.tsx`（原 973 行）**：深度内联了大量 AI 编排逻辑（Worker 调度、分片分发、看门狗超时、结果择优、开局预算与难度/先手状态），使得本地对战与联机路由被 AI 细节严重干扰；
2. **`OnlineLobbyView.tsx`（原 889 行）**：单文件内联了 6 个功能异质的子面板，全部通过 Props 接收完整的 79 字段 `FriendRoomController`，导致组件体量巨大；
3. **Props 逐层钻透（Props Drilling）**：从 `GameShell` → `OnlineLobbyView` / `GameTableView` → `TableSidebar` → `TableSidebarTabs` / `TableRoomChat` 逐层传递 `room: FriendRoomController`；
4. **Phase 2 审查建议（P3）**：Round 2 审查报告提出了 `createRoom` 守卫弱化、`clearClosedRoom` 未校验房间码、测试同义反复以及文档数据偏差等问题需要闭环。

本次交付严格按照 Master Plan 第 3.3 节与工单要求，完成了 `useAiGame` 独立 Hook 抽取、`RoomContext` 建立、`OnlineLobbyView` 6 面板组件化拆解，并完整闭环了 Phase 2 的全部审查建议。

---

## 2. 核心改动与架构落地

### 2.1 完整收敛 Phase 2 审查建议（P3 闭环）

| 编号 | 审计问题 | 修复方案与代码落地 | 验证结果 |
| :--- | :--- | :--- | :--- |
| **P3-1** | `STATUS.md` 最新提交与行数统计偏差 | 刷新最新提交 SHA 为可达提交，使用实测行数精确更新各模块声明 | 动态事实基准完全吻合 |
| **P3-2** | Phase 2 handoff 行数声明与实测偏差 | 校正 `docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md` 中的表格与正文规模声明 | 全部声明值与实际一致 |
| **P3-3** | `createRoom` 内部守卫弱化 | 在 `useRoomSocket` 中恢复 `enabled` 与 `canCreate`（检查 `matchmakingStatus !== "searching"`）完整判定，与旧 `canCreateRoom` 严格等价 | 消除防御性回归 |
| **P3-4** | `clearClosedRoom` 提早清理聊天草稿 | 仅当当前房间码匹配事件房间码时才置空房间与聊天草稿；将 `roomCode` 透传给 `onRoomCleared(roomCode, isCurrentRoom)` 供大厅精确过滤 | 彻底杜绝非当前房间关闭误清聊天草稿 |
| **P3-5** | `constants.test.ts` 存在同义反复 | 棋盘断言改为固定 4 子不赢 / 5 子获胜判定；新增直接调用 `AccountStore` 昵称规范化截断与 `RoomStore` 160/161 字符超长拒绝的真实产品代码断言 | 变异与点位修改具备真实捕获能力 |
| **P3-6** | `client-boot-state.ts` 注释指向旧 `boot*Cache` | 更新注释，准确引用 `room-state-utils.ts` 的 `useBootSnapshot` 实现与设计理念 | 注释与现实代码一致 |

---

### 2.2 Phase 3.1: 抽离 `useAiGame` Hook (`GameShell.tsx` 瘦身)

新建 `src/components/hooks/useAiGame.ts`（486 行）与配套单元测试 `useAiGame.test.ts`（177 行，7 项单测）：
- **职责收敛**：
  - AI Worker 线程复用池调度（acquire/release/terminateBusy）；
  - 根节点候选分片并行搜索（rootCandidateShard）；
  - 看门狗应急降级超时（Watchdog Timeout）；
  - 纯函数结果择优判定（`isBetterAiWorkerResult`, `isDecisiveAiWorkerResult`, `normalizeAiWorkerResult`）；
  - 难度与先手设置状态及推迟切换机制（`handleDifficultyChange`, `handleFirstPlayerChange`, `handleAiReset`）；
  - AI 走子提交（`commitAiTurn`）与取消（`cancelAiTurn`）。
- **`GameShell.tsx` 效果**：
  - 从 **972 行** 缩减至 **593 行**（净减 379 行，降幅 39.0%）；
  - 彻底移除了所有 Web Worker、线程池管理、AI 分片逻辑与纯函数辅助代码；
  - 严格遵守 React 19 `react-hooks/refs` 规范，杜绝在 render 阶段访问或写入 ref。

---

### 2.3 Phase 3.2: 建立 `RoomContext` 消除 Props 逐层钻透

新建 `src/components/online/RoomContext.tsx`（36 行）：
- 提供 `RoomContext`、`RoomProvider`、`useRoomContext()` 以及灵活的 `useOptionalRoomContext(roomProp)` 兼容解析函数；
- **自适应兼容**：
  - 组件既可以在 `<RoomProvider value={friendRoom}>` 内直接消费上下文，也可通过 props 显式传入 `room` 保持向下兼容；
  - `GameShell.tsx` 联机工作区用 `<RoomProvider value={friendRoom}>` 统一包裹；
  - `GameTableView.tsx`、`TableSidebar.tsx`、`TableSidebarTabs.tsx`、`TableRoomChat.tsx` 均支持可选 `room?: FriendRoomController` 并无缝支持 Context。

---

### 2.4 Phase 3.3: `OnlineLobbyView.tsx` 拆解为 6 个独立子面板

在 `src/components/online/lobby/` 目录下创建 6 个职责高度内聚的独立面板组件：

```
src/components/online/
├── RoomContext.tsx                   [NEW 36 行] RoomContext / RoomProvider
├── OnlineLobbyView.tsx               [MODIFY 191 行] 纯容器组件（原 888 行）
└── lobby/
    ├── LobbyUsersPanel.tsx           [NEW 83 行] 在线用户列表与 Presence 刷新（原 OnlineUsersPanel）
    ├── LobbyProfilePanel.tsx         [NEW 154 行] 个人对局战绩与历史记录（原 RoomProfilePanel）
    ├── LobbyLeaderboard.tsx          [NEW 220 行] 天梯排行榜、分页、搜索与身份切换（原 LeaderboardPanel）
    ├── LobbyPublicChat.tsx           [NEW 76 行] 公共大厅聊天与消息发送（原 PublicChatPanel）
    ├── LobbyMatchmaking.tsx          [NEW 100 行] 快速匹配按钮与好友私密房面板（原 RoomMatchmakingPanel）
    └── LobbyRoomList.tsx             [NEW 180 行] 可用房间列表、大厅活动条与空状态（原 LobbyPanel）
```

- **兼容性与 Smoke 测试选择器 100% 保障**：
  - 完整保留全部数据属性选择器：`data-online-view="lobby"`、`data-lobby-section="identity"`、`data-lobby-section="friends"`、`data-lobby-section="community"`、`data-lobby-section="progress"`、`data-lobby-action="quick-match"`、`data-lobby-action="create-unlisted"`、`data-lobby-empty-state` 等；
  - `OnlineLobbyView.tsx` 保留子面板的别名导出（如 `export { LobbyUsersPanel as OnlineUsersPanel }`），对外部任何可能的旧导入实现零破坏。

---

## 3. 本地工程门禁与验证指标

本次交付依次执行并全绿通过四道门禁与三套在线烟测：

| 门禁项 | 命令 | 指标要求 | 执行结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1: TypeScript 编译** | `npx tsc --noEmit` | 0 错误 | 0 错误，严格类型推导全绿 | ✅ 通过 |
| **门禁 2: ESLint 规范扫描** | `npm run lint` | 0 错误 0 警告 | 0 错误 0 警告，严格遵守 React 19 Hooks 规则 | ✅ 通过 |
| **门禁 3: 单元测试套件** | `npm test` | 全部通过 | 28 个测试套件 / 242 项用例 100% 通过（+1 套件 +7 用例） | ✅ 通过 |
| **门禁 4: 生产构建打包** | `npm run build` | 打包成功 | Next.js Turbopack 编译成功，11/11 页面预渲染正常 | ✅ 通过 |
| **自动化联机验证** | `npm run verify:online` | 全部通过 | HTTP 页面加载、版本号匹配、Socket.IO WebSocket 握手全部 PASS | ✅ 通过 |
| **大厅 Presence 烟测** | `npm run smoke:lobby` | 全部通过 | 房间创建、加入、更新、注销增量同步全部 PASS | ✅ 通过 |
| **在线匹配队列烟测** | `npm run smoke:matchmaking` | 全部通过 | 双人匹配撮合、防溢出、取消匹配全部 PASS | ✅ 通过 |

---

## 4. 文件清单与变更统计

```
新增文件 (8):
  src/components/hooks/useAiGame.ts (485 行)
  src/components/hooks/useAiGame.test.ts (176 行)
  src/components/online/RoomContext.tsx (36 行)
  src/components/online/lobby/LobbyLeaderboard.tsx (220 行)
  src/components/online/lobby/LobbyMatchmaking.tsx (100 行)
  src/components/online/lobby/LobbyProfilePanel.tsx (154 行)
  src/components/online/lobby/LobbyPublicChat.tsx (76 行)
  src/components/online/lobby/LobbyRoomList.tsx (180 行)
  src/components/online/lobby/LobbyUsersPanel.tsx (83 行)

重构修改文件 (9):
  src/components/GameShell.tsx (972 -> 593 行, -379 行)
  src/components/online/OnlineLobbyView.tsx (888 -> 191 行, -697 行)
  src/components/online/GameTableView.tsx
  src/components/online/TableSidebar.tsx
  src/components/online/TableSidebarTabs.tsx
  src/components/online/TableRoomChat.tsx
  src/components/hooks/useRoomSocket.ts
  src/components/useFriendRoom.ts
  src/components/client-boot-state.ts
  src/lib/constants.test.ts
  docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md
```

---

## 5. 后续阶段建议 (Phase 4 Handoff)

进入 **Phase 4: 服务端领域服务解耦 (`src/server/rooms.ts`)**：
- `src/server/rooms.ts`（2415 行）是当前服务端最大单体文件，建议按业务职责拆分为：
  1. `PresenceTracker`（在线人数与用户活跃聚合）；
  2. `LeaderboardService`（天梯分数结算与榜单查询）；
  3. `RoomStateMachine`（房间生命周期、准备与走子状态转移）。
