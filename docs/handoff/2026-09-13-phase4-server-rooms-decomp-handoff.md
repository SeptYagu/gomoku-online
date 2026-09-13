# 交接文档：Phase 4 服务端领域解耦交付单 (Phase 4 Handoff)

- **交付日期**：2026-09-13
- **交付角色**：Phase 4 独立开发与验证工程师
- **所属阶段**：Phase 4（服务端领域服务解耦）
- **关联总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **前序交接**：[`docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md`](2026-09-13-phase3-frontend-ui-decomp-handoff.md)
- **前序复审**：[`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`](2026-09-13-workbuddy-code-review-round4-handoff.md)

---

## 1. 交付目标与背景

在重构蓝图 Phase 4 中，服务端核心单文件 `src/server/rooms.ts`（原 **2414 行**）是全仓仅存的上帝巨石模块之一。该文件同时承担了：
1. **房间生命周期与博弈时序**：房间创建、撮合匹配、入座、准备、走子、悔棋（请求/响应/超时）、认输、重开、重赛协商、断线看门狗与过期清扫；
2. **大厅与公共聊天**：公共聊天池限流与广播、大厅房间列表过滤、实时动态版本化汇总（`lobbyVersion` / `lobbyActivity.version`）；
3. **在线 Presence 追踪**：用户生命周期（连接/断开/更新/清扫）、用户状态映射（`online`/`in_room`/`playing`/`spectating`/`offline`）及增量版本号（`presenceVersion`）；
4. **战绩结算与天梯榜单**：对局权威存盘、客户端记录校验、战绩列表、单房对局查询、天梯排行与玩家战绩档案。

本次交付严格执行 Master Plan §3.4 与工单契约，将 `rooms.ts` 解耦为三大高内聚微领域服务，并改造 `rooms.ts` 为标准 Facade 门面，实现外部消费者 100% 零改动、零破坏兼容。

---

## 2. 核心改动与微领域服务架构

### 2.1 架构分层设计

```
src/server/
├── domain/
│   ├── room-state-machine.ts   [NEW 2130 行] 房间生命周期、博弈时序、公共聊天与大厅版本汇总
│   ├── presence-tracker.ts     [NEW  280 行] 在线 Presence 追踪、用户状态机与生命周期
│   └── leaderboard-service.ts  [NEW   87 行] 战绩持久化编排、天梯排行与档案查询
└── rooms.ts                    [MODIFY 324 行] Facade 门面层（原 2414 行，净减 2090 行，-86.6%）
```

### 2.2 三大微领域服务职责与落地细节

#### 1. `RoomStateMachine` (`src/server/domain/room-state-machine.ts`, 2130 行)
- **核心职责**：
  - 维护房间映射集合 `rooms: Map<string, RoomState>`、宿主绑定 `roomCodeByHostAccountId` / `hostAccountIdByRoomCode`；
  - 完整承载全部房间生命周期方法：`createRoom`, `findMatch`, `joinRoom`, `sitPlayer`, `reconnectRoom`, `setPlayerReady`, `startGame`, `applyMove`, `resignGame`, `requestUndo`, `respondToUndo`, `restartGame`, `setRematchReady`, `markDisconnected`, `leaveRoom`, `sendRoomChat`, `restoreConnection`, `getSnapshot`, `listRooms`, `sweepExpiredRooms`, `deleteRoom`；
  - 维护公共聊天池 `publicChatMessages`、发送频控 `publicChatLastSentAt`、方法 `sendPublicChat`, `listPublicChatMessages`；
  - 维护辅助查询：`getPlayerSeat`, `getParticipantRole`, `leaveParticipantRooms`, `leaveDisposableWaitingRoomsByParticipantName`, `resolveHostRoom`, `getRoomListItem`, `listRoomCodes`；
  - 单调版本控制：`lobbyVersion`、大厅活动增量缓存与版本化计算 `getLobbyActivitySummary()`；
  - 提供 `buildRoomPresenceIndex(): Map<string, RoomPresenceLocation>` 供 PresenceTracker 高效（$O(1)$ 查找）映射成员所在房间与角色；
  - 导出房间编码生成纯函数 `createRoomCode()` 与结果辅助 `success()`, `failure()`。

#### 2. `PresenceTracker` (`src/server/domain/presence-tracker.ts`, 280 行)
- **核心职责**：
  - 管理在线 Presence 状态映射 `presences: Map<string, PresenceEntry>` 与版本号 `presenceVersion`；
  - 承载在线用户生命周期方法：`connectPresence`, `updatePresence`, `disconnectPresence`, `listPresence`；
  - 提供在线用户计数 `getOnlineUserCount()` 供 `RoomStateMachine.getLobbyActivitySummary()` 消费；
  - 纯函数导出状态计算与排序：`getPresenceStatus()`, `getPresenceStatusRank()`, `comparePresence()`；
  - 跨领域版本聚合：`version = presenceVersion + getLobbyVersion()`，严格满足 AGENTS.md 1.2 节对网络单调递增包时序的刚性约束。

#### 3. `LeaderboardService` (`src/server/domain/leaderboard-service.ts`, 87 行)
- **核心职责**：
  - 内部持有 `gameRecordStore: GameRecordStore`；
  - 承载战绩提交、查询与档案方法：`submitGameRecord`, `listGameRecords`, `getRoomGameRecord`, `getLeaderboard`, `getPlayerProfile`；
  - 承载对局结算权威存盘：`recordAuthoritative(game: AuthoritativeGameRecord)`，由 `RoomStateMachine` 对局结束钩子（`onGameFinished`）驱动。

---

### 2.3 `rooms.ts` 蜕变为 Facade 门面（324 行）

- **完全零破坏兼容签名**：
  - 保留 `export class RoomStore`，构造函数参数签名 `RoomStoreOptions` 100% 不变；
  - 完整重导出全部 **31 个公开类型**：`RoomStatus`, `RoomPlayerSeat`, `RoomParticipantRole`, `RoomPlayerSnapshot`, `RoomSpectatorSnapshot`, `UndoRequestSnapshot`, `RematchStateSnapshot`, `RoomChatMessage`, `PublicChatMessage`, `PublicChatSnapshot`, `PresenceStatus`, `UserPresenceSnapshot`, `PresenceListQuery`, `PresenceSnapshot`, `RoomSnapshot`, `RoomListStatus`, `RoomVisibility`, `RoomListItem`, `RoomListQuery`, `LobbyActivitySummary`, `RoomListSnapshot`, `LobbyRoomUpdatedEvent`, `LobbyRoomDeletedEvent`, `RoomCleanupResult`, `CreateRoomInput`, `JoinRoomInput`, `MoveIntent`, `RoomErrorCode`, `RoomError`, `RoomResult`, `RoomLifecycleSweep` 以及 `PlayerIdentityKind`；
  - 完整重导出公开函数 `createRoomCode`；
  - 完整代理转发全部 **41 个公开方法** 至三大微领域服务，无任何逻辑旁路。

---

## 3. 消费者影响分析与零感知验证

| 外部消费者 | 交互方式 | 影响评估 | 验证方式与结论 |
| :--- | :--- | :--- | :--- |
| `src/server/room-socket.ts` (1307 行) | 调用 `roomStore.xxx()`（35+ 方法）及 `WeakMap<RoomStore, number>` | **完全零改动、零感知** | `npm test`（`room-socket.test.ts` 22 项单测全绿）+ 3 套端到端 smoke 脚本通过 |
| `src/server/rooms.test.ts` (1320 行) | `new RoomStore(...)` 实例化与直接调用 | **完全零改动、零感知** | `npm test`（`rooms.test.ts` 43 项用例 100% PASS） |
| `src/server/online-server.ts` | `roomStore.listRooms(...)`, `listPresence(...)` | **完全零改动、零感知** | `npm run verify:online` 联机握手与 HTTP 状态全绿 |
| `src/server/room-store.ts` | `new RoomStore({ gameRecordStore: ... })` | **完全零改动、零感知** | 运行时与单例装配行为完全等价 |
| `src/components/useFriendRoom.ts` / `room-state-utils.ts` | `import type { ... } from "@/server/rooms"` | **完全零改动、零感知** | TypeScript 严格编译无报错 |

---

## 4. 本地工程门禁与验证指标（全绿）

本次交付在本地环境依次完整执行四道工程门禁与全套联机烟测：

| 门禁项 | 命令 | 检查要求 | 执行结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1: TypeScript 编译** | `npx tsc --noEmit` | 0 错误 | 0 错误，严格模式无逆变 | ✅ 通过 |
| **门禁 2: ESLint 规范扫描** | `npm run lint` | 0 错误 0 警告 | 0 错误 0 警告，代码规范全合规 | ✅ 通过 |
| **门禁 3: 单元测试套件** | `npm test` | 全部通过 | 28 个测试套件 / 242 项用例 100% 通过（`rooms.test.ts` 43 项全绿） | ✅ 通过 |
| **门禁 4: 生产构建打包** | `npm run build` | 打包成功 | Turbopack 生产编译成功，11/11 页面静态预渲染正常 | ✅ 通过 |
| **联机时序握手验证** | `npm run verify:online` | 全部通过 | 页面加载、版本号检查、Socket.IO WebSocket 握手全部 PASS | ✅ 通过 |
| **大厅增量同步烟测** | `npm run smoke:lobby` | 全部通过 | 房间创建/加入/对局/结束隐藏/Presence 增量同步全部 PASS | ✅ 通过 |
| **在线匹配队列烟测** | `npm run smoke:matchmaking` | 全部通过 | 双人撮合、防溢出隔离、取消匹配时序全部 PASS | ✅ 通过 |

---

## 5. 文件清单与规模统计

```
新增文件 (3):
  src/server/domain/room-state-machine.ts   2130 行
  src/server/domain/presence-tracker.ts      280 行
  src/server/domain/leaderboard-service.ts    87 行

重构文件 (1):
  src/server/rooms.ts                      2414 -> 324 行 (-2090 行, 降幅 86.6%)

交付文档 (2):
  docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md
  docs/handoff/INDEX.md
  STATUS.md
```

---

## 6. 后续阶段建议 (Phase 5 Handoff)

进入 **Phase 5: 五子棋核心算法分层 (`src/game/ai.ts`)**：
- `src/game/ai.ts`（2574 行）为最后一个上帝巨石模块，混杂了棋盘静态评估、$\alpha\text{-}\beta$ 极小极大搜索与开局库加权调度；
- 建议按 Master Plan §3.5 拆解为：
  1. `ai-evaluator.ts`（静态棋盘估值、威胁识别、Zobrist 哈希与候选点生成）；
  2. `ai-search.ts`（极小极大搜索、置换表缓存、截断规则与战术拓展）；
  3. `ai-scheduler.ts`（多难度预算控制、开局库匹配与多线程 Worker 分片调度）；
  4. `ai.ts`（保留为轻量 Facade 门面，特别保证 `tools/engine-arena.ts` 棋力天梯评测工具链的 100% 兼容性）。
