# 独立代码审查报告：Phase 4 服务端领域解耦（Round 5）

- **审查日期**：2026-09-13
- **审查角色**：独立代码审查员（WorkBuddy Independent Code Auditor）
- **被审 HEAD SHA**：`23b03fb12ff528359af293c7a9d048f2e7860bce`
- **基准提交 SHA**：`eb10c4e3696d6e5b10c188249752a571cfaf35d8`
- **实际审查 diff 范围**：`eb10c4e..23b03fb`（7 文件，+2821 / −2281；产品代码 5 文件、文档 2 文件）
- **工作区状态**：干净（`git status --porcelain` 为空；`git pull --ff-only` = Already up to date；HEAD 与待审 SHA 逐字符一致）
- **审查结论**：**0×P0 / 0×P1 / 0×P2；1×P3；不满足"审查通过条件"**。三大微领域服务功能等价性经 691 项差分断言与 116 项版本契约断言独立证实**零行为回归**，四道门禁与三套联机烟测独立复跑全绿；唯一遗留为 `STATUS.md:11` 阶段交付提交字段再次滞后一拍（Round-3 P3-2 / Round-4 P3-1 同类问题第三次复发，Round 4 明确建议的双字段收敛方案仍未落地，Phase 4 handoff 未予记载）。

---

## 1. 需求与实现对应关系

| # | 验收标准 | 实现位置 | 独立核验结论 |
| :- | :--- | :--- | :--- |
| 1 | 落地 `src/server/domain/` 三大微领域服务并各司其职 | `domain/room-state-machine.ts`（2130 行）、`domain/presence-tracker.ts`（280 行）、`domain/leaderboard-service.ts`（87 行） | ✅ 职责切分与 base 单类的字段/方法族一一对应（见 §4-V2）：房间生命周期 41 方法 + 公共聊天 + 大厅版本 → RSM；`presences`/`presenceVersion`/`presenceRetentionMs` → PresenceTracker；`gameRecordStore` → LeaderboardService。**无状态被漏拆或重复持有** |
| 2 | `rooms.ts` 蜕变为 Facade，代理全部公开方法并重导出全部 31 个公开类型；`room-socket.ts` / `rooms.test.ts`（43 项）/ `online-server.ts` 零改动兼容 | `rooms.ts`（324 行，`export class RoomStore` + `export type {...}` + `export { createRoomCode }`） | ✅ 41/41 方法逐签名转发、31/31 类型重导出 + `createRoomCode`；全仓 17 个调用方实际使用的 23 个符号 100% 可解析（见 §4-V1）；diff 证明三个调用方文件**零字节改动** |
| 3 | 维护大厅版本单调递增协议 | `nextLobbyVersion()`、`markRoomListed()`、`getLobbyActivitySummary()`（缓存 + `cached.version + 1`）、`PresenceTracker.listPresence()`（`presenceVersion + getLobbyVersion()`） | ✅ 116 项断言：`lobbyActivity.version` 内容变更时严格 +1、无跳号、内容不变时不自增；`presence.version` 内容变更时严格递增、永不回退；跨域注入 `getLobbyVersion` 生效（见 §4-V4） |
| 4 | 四道门禁 + 三套联机烟测全绿 | — | ✅ 全部独立复跑通过（见 §4-V5/V6）。注：`verify:online` 的 `page` 项在 Next dev 冷编译下首次超时（10s 上限），页面预热后 4/4 PASS，属环境时序而非缺陷 |
| 5 | 产出 Phase 4 handoff 并规范提交推送 | `docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`、`docs/handoff/INDEX.md`、`STATUS.md` | ⚠️ handoff/INDEX 齐备且**全部行数与量化声明逐项属实**（见 §4-V7）；但 `STATUS.md:11` 未随本次交付刷新（见 §5-P3-1） |
| 6 | 零缺陷容忍：无任何未解决 P0/P1/P2/P3 缺陷 | — | ❌ 存在 1×P3 未闭环（§5-P3-1） |

### 1.1 前序审查遗留项在本轮的闭合核对

| 编号 | 前序结论 | 本轮实测 | 闭环 |
| :--- | :--- | :--- | :--- |
| Round 4 **P3-1** | `STATUS.md:11`「最新交付提交」相对实际交付滞后一拍，建议改为「当前 HEAD（`git rev-parse` 实时）/ 阶段交付提交」双字段以终止无限复发 | 方案未落地：`STATUS.md:9` 仍是「当前分支与 HEAD：`main`（以 `git rev-parse --short HEAD` 实时为准）」这一**指向性说明**，而非承载实际 SHA 的字段；`STATUS.md:11` 仍为 `3e201ec`，而 HEAD 已是 `23b03fb`。问题类第三次复发 | ❌ 未闭环 |
| Round 4 其余 0×P0/1/2 | — | 本轮 Phase 4 为全新交付面，无遗留 P0/P1/P2 | ✅ |

---

## 2. 阅读过的关键文件与调用链

**逐文件完整阅读**：`src/server/domain/presence-tracker.ts`（280 行全文）、`src/server/domain/leaderboard-service.ts`（87 行全文）、`src/server/rooms.ts`（324 行全文）、`docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`、`STATUS.md`、`docs/handoff/INDEX.md`。

**`src/server/domain/room-state-machine.ts`（2130 行）**：对全部 2130 行执行**结构化归一化块级比对**（剥离注释/缩进后按 `方法名 → 函数体` 建索引，与 base `rooms.ts` 逐块做字节比较）——这比人工浏览更强：base 的 98 个代码块（41 公开方法 + 全部私有方法 + 44 个模块级函数）在新实现中**逐一存在且块体字节等价**，仅 14 处受控 delta，全部为语义等价的机械改写（见 §4-V2）。另**直接通读**的类型/字段/构造器区（`:255-342`）与关键路径：`createRoom`、`applyMove`、`getLobbyActivitySummary`（`:1091-1133`）、`listRooms`、`sweepExpiredRooms`（`:1291-1321`）、`leaveDisposableWaitingRoomsByParticipantName`、`resolveHostRoom`、`getRoomListItem`、`deleteRoom`、`captureFinishedGame`（`:1579`）、`markRoomListed`（`:1528`）、`pruneTransientChatRateLimits`（`:1615`）。

**为辐射影响额外阅读**：`src/server/room-socket.ts`（模块导入面 + `game:move` 载荷装配 `:440-444` + `WeakMap` 用法）、`src/server/rooms.test.ts`（43 项用例清单与断言风格）、`src/server/room-store.ts`（单例装配：真实 `GameRecordStore{filePath}` 注入）、`src/server/online-server.ts`、`src/server/room-contract.ts`、`src/components/hooks/*`、`src/game/types.ts`、`src/server/game-records.ts`；`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`（复核遗留项）。

**关键调用链（已追踪并验证）**：

- **门面装配顺序链**：`new RoomStore(opts)`（`rooms.ts:112-140`）→ `leaderboardService`（先建）→ `roomStateMachine`（注入 `getOnlineUserCount: () => this.presenceTracker.getOnlineUserCount()`、`onGameFinished: (g) => this.leaderboardService.recordAuthoritative(g)`）→ `presenceTracker`（注入 `getLobbyVersion: () => this.roomStateMachine.getLobbyVersion()`、`getRoomPresenceIndex: () => this.roomStateMachine.buildRoomPresenceIndex()`）。两个跨域回调均为**惰性闭包**，实际触发时刻必在构造器返回之后，故「先建 RSM、后赋 presenceTracker」不构成 TDZ/undefined 缺陷；已用 V3/V4 实测证实（`onlineUsers` 恒等于在线 presence 条数）。
- **对局结算链**：`applyMove`/`resignGame` → `applyGameResult` → `captureFinishedGame`（`room-state-machine.ts:1579`）→ `this.onGameFinished?.(...)` → 门面闭包 → `LeaderboardService.recordAuthoritative` → `GameRecordStore.recordAuthoritative`。V3 实测：完成对局后 `listGameRecords()` 产出 1 条权威记录、`getLeaderboard()` 产出 Alice 胜 1 局（rating 1216）/ Bob 负 1 局，且 `submitGameRecord` 首次 `duplicate:false`、重复提交 `duplicate:true`、非本局玩家被拒——与 base 逐字节一致。
- **大厅版本链**：房间变更 → `markRoomListed` → `nextLobbyVersion()`（`room-state-machine.ts:1610`）→ 客户端经 `getLobbyActivitySummary()` 增量消费；presence 快照版本经 `presenceTracker.listPresence()` 聚合 lobbyVersion，跳号触发客户端全量 resync（与 AGENTS.md §1.2 契约一致）。
- **`buildRoomPresenceIndex` 数据形态改造链**：base `{ role, room: RoomState }` → 新 `{ code, role, status, visibility }`（`room-state-machine.ts` + `presence-tracker.ts:254-272`）。消费点 `roomCode: roomPresence?.visibility === "public" ? roomPresence.code : null` 与原 `roomPresence?.room.visibility === "public" ? roomPresence.room.code : null` 在 `null`/可选链语义下恒等（V2 块级比对 + V3 差分双重证实）。

**`docs/review-checklist.md` 不存在**，无逐项执行项。

---

## 3. 测试代码审查

- **本次变更未新增/修改任何测试**：`rooms.test.ts`（1319 行）、`room-socket.test.ts`（1672 行）在 `eb10c4e..23b03fb` 范围内**零字节改动**。这是「零破坏兼容」的直接证据，但也意味着**新增的领域边界（三个 domain 类的独立构造、跨域注入契约、`RoomStateMachine` 直连用法）完全无测试守护**。
- **断言有效性（正向评估）**：`rooms.test.ts` 43 项用例驱动门面端到端，断言的是**结果快照与错误码**（`expectOk(...)` 后核对 `status`/`players`/`gameId`/`recordStatus`/`entries[0]` 等），而非「方法被调用」；覆盖了非法 visibility、重复 join、无权限操作、undo 三态、10s 超时、TTL 清扫、断线宽限与重赛席位等失败/边界路径。未发现 mock 掩盖真实接口、也未见测试与实现共享同一错误假设。
- **本次派生的测试覆盖盲区**（**属测试基建现状，不构成本次交付缺陷**，但削弱回归网）：
  1. 无任何用例直接构造 `RoomStateMachine` / `PresenceTracker` / `LeaderboardService`，故「跨域回调未注入时的静默降级」不被守护（见 §6-R2）。
  2. 无差分/黄金样本测试固化 base 与 refactor 的行为等价，本轮等价性只能由审查方一次性证明。
- **本机环境**：`npm test` 现已可运行（28 套 / 242 例全通过）。历史记忆中「Node 25 导致 vitest runner 故障」的记录**已失效**，本轮起门禁 3 可正常独立复验（已同步修正记忆）。

---

## 4. 独立设计的验证场景及执行结果

> 全部为**独立设计**（非复用仓库既有测试），使用临时 `tsx` 脚本直连产品代码；脚本与临时基线副本已于验证后全部删除，`git status --porcelain` 复核为空。

### V0 — 版本确认
`git rev-parse HEAD` = `23b03fb12ff528359af293c7a9d048f2e7860bce`（与待审 SHA 逐字符一致）；`git pull --ff-only` = Already up to date；工作区干净。**结论：审查结论对应上述确切代码版本。**

### V1 — API 面严格等价（静态 + 运行时）
- 基准 `rooms.ts` 导出 31 个 type + `RoomStore` + `createRoomCode`；新门面重导出 **31 个 type**（逐一比对 base 导出清单）+ 新增 `PlayerIdentityKind`（base 未导出，**纯增量、非破坏**）+ `createRoomCode`。
- 基准 `RoomStore` 公开方法 **41 个**，门面 **41 个**，签名逐一相同（含默认参数 `ready = true`、`query: RoomListQuery = {}`、可选参 `requestedSeat?` / `keepRoomCode?` / `limit?` / `identity?`）。
- 全仓扫描 `from "@/server/rooms"` / `"./rooms"` 的 **17 个文件、实际引用 23 个符号**（含 `RoomStore`、`createRoomCode`、`RoomResult`、`RoomCleanupResult`、`PresenceListQuery`、`RoomListQuery` …）——**100% 可解析**。
- `RoomStoreOptions` 在 base 中为**非导出**内部类型，门面改为 `export type`：增量、非破坏；10 个可选项与 base **完全同名同类型**，且已逐一确认全部转发至对应服务（`codeGenerator`/`codeLength`/`completedRoomTtlMs`/`disconnectGraceMs`/`emptyRoomTtlMs`/`roomTtlMs` → RSM；`gameRecordStore` → LeaderboardService；`now` → 三者共用同一函数引用；`presenceRetentionMs` → PresenceTracker；`transientIdentityLimit` → RSM + PresenceTracker）。
- **结论：PASS**（41 方法 / 31 类型 / 23 个真实消费符号零破坏）。

### V2 — 结构化块级等价（最强静态证据）
将 base `rooms.ts` 与新三文件拼接物各自归一化（剥离注释与缩进）后按 `名称 → 块体` 建索引比对：

- base **98 个代码块**（41 公开方法 + 全部私有方法 + 44 个模块级函数，含 `createRoomCode`、`advanceRoomLifecycle`、`shouldDeleteRoom`、`maybeStartRematch`、`replayRoomMoves`、`getRoomSnapshot` 等）→ **0 个缺失**。
- 新增仅 **4 个**：`buildRoomPresenceIndex`（改为 RSM 方法）、`getOnlineUserCount`、`getPresenceVersion`、`recordAuthoritative`（后三者为纯粹的可见性/归属搬运）。
- 变更仅 **14 处**，逐一人工核对全部为语义等价：
  1. `export` 关键字补加（`success`/`failure`/`evictOldestMapEntries`/`normalizePlayerInput`/`comparePresence`/`getPresenceStatus`/`getPresenceStatusRank`/`RoomPlayer`/`RoomState`/`RoomSpectator`/`RoomLifecycleLimits`/`PresenceEntry`/`DEFAULT_ROOM_CODE_LENGTH`）——签名与体不变，仅提权。
  2. `listPresence`：`buildRoomPresenceIndex([...this.rooms.values()])` → `this.getRoomPresenceIndex()`（注入）；`this.presenceVersion + this.lobbyVersion` → `+ this.getLobbyVersion()`——**等价**。
  3. `buildRoomPresenceIndex` / `getPresenceSnapshotForEntry` / `getPresenceStatus`：`RoomPresenceLocation` 由 `{role, room}` 扁平化为 `{code, role, status, visibility}`——**取值语义等价**（已由 V3 差分实证）。
  4. `getLobbyActivitySummary`：内联在线计数 → `this.getOnlineUserCount()`（注入 PresenceTracker，用同一 `connectionCount > 0` 判据）——**等价**。
  5. `pruneTransientIdentityState` 拆分：presence 剪枝留在 PresenceTracker（调用点 `connectPresence`/`updatePresence`/`listPresence` 与 base 一致），chat 频控剪枝移入 RSM 的新私有方法 `pruneTransientChatRateLimits`（调用点 `sendPublicChat`，base 亦为 `sendPublicChat`），两者体分别与 base 中对应片段逐字节相同——**唯一行为差**：`sendPublicChat` 不再顺带剪枝 presence 表（presence 剪枝仍由三个 presence 入口高频触发），无实际影响，且不影响任何可观测状态（V3 全量状态 dump 逐点相同）。
  6. `captureFinishedGame`：`this.gameRecordStore.recordAuthoritative({...})` → `this.onGameFinished?.({...})`（门面闭包转发至同一 `LeaderboardService.recordAuthoritative`）——**等价**。
- **结论：PASS**（逐块字节等价，无隐性逻辑漂移）。

### V3 — 差分等价（base 单体 vs 重构门面，端到端黑盒）
将 `eb10c4e:src/server/rooms.ts` 作为临时基线副本与新产品代码**同进程并列实例化**（同一 `now` 时钟、同一确定性 `codeGenerator`），驱动**完全相同的脚本化序列**，逐步比对「每步返回值 + 每步全量状态 dump（`getLobbyActivitySummary`/`getLobbyVersion`/`listRooms`×2/`listPresence(includeOffline)`/`listPublicChatMessages`/`listRoomCodes`/`listGameRecords`/`getLeaderboard`）」的深度 JSON 等价：

- **主场景 95 步**：含 3 种 visibility、重复/非法 join、观战席位、就绪→开局、错误回合/越界/占用/`expectedMoveSeq` 过期着法、undo 请求-拒绝-受位锁定-接受、房间聊天与公共聊天（超长/冷却/旁观者）、观战者进出、完整 9 手取胜对局、`listGameRecords`/`getLeaderboard`/`getPlayerProfile`、`submitGameRecord`（首次/重复/非本局玩家/未知对局）、重赛就绪与非法重开、断线/重连、`leaveParticipantRooms`、`leaveDisposableWaitingRoomsByParticipantName`、`sweepExpiredRooms`。
- **时序场景 ×2**（每步推进 30 分钟 / 1 秒，各 6 轮）：驱动 TTL、断线宽限、撤销 10s 超时、房间过期与清扫。
- **边界参数场景 ×3**（`transientIdentityLimit` = 1 / 2 / 3，`presenceRetentionMs` = 1s / 1h）：6 个身份并发 connect/update/公共聊天/断开，跨越保留窗口，专门靶向被拆分的双表剪枝与 `evictOldestMapEntries` 阈值行为。
- **结果：691 项断言（返回值 + 状态 dump）全部零差异；两实现的 `createRoomCode`（默认与自定义长度、200 次抽样、字符集/长度分布）等价。**
- **非空洞性自证（防"双方同错"）**：主场景独立复跑统计 = 95 步中 `ok:true` 39 次、`ok:false` 22 次；终态 room 1 个、presence 2 条、公共聊天 1 条、权威战绩 1 条、天梯含 Alice(胜,1216)/Bob(负)、`lobbyActivity` = `{onlineUsers:1, openTables:0, playingTables:1, spectators:1, version:4}` —— 证明序列真实走通了对局结算与天梯链路，而非对称空转。
- **结论：PASS**（生产路径行为零回归）。

### V4 — 大厅/在线版本单调递增契约（验收标准 #3）
对门面执行 30 步混合变更（建房/单位置观战/就绪开局/9 手对局/存在感连接-更新-断开/断线重连/TTL 清扫），每步观测并断言：

1. `lobbyActivity.version` 永不回退；
2. **内容变更时严格 `prev + 1`（无跳号）**；
3. **内容不变时版本不自增**（缓存生效，重复读取返回同一版本）；
4. `presence.version` 永不回退，且内容变更时严格递增；
5. 跨域接线正确性：`lobbyActivity.onlineUsers` **恒等于** `listPresence({includeOffline:true})` 中 `connected === true` 的条数。

- **结果：116 项断言 0 失败。**
- **结论：PASS**。

### V5 — 四道本地工程门禁独立复跑

| 门禁 | 命令 | 实测结果 |
| :--- | :--- | :--- |
| 1 | `npx tsc --noEmit` | **0 错误**（exit 0） |
| 2 | `npm run lint` | **0 错误 0 警告**（exit 0，无输出） |
| 3 | `npm test` | **28 套 / 242 例全部通过**（含 `rooms.test.ts` 43 例、`room-socket.test.ts` 22 例含真实 Socket.IO 双人对局） |
| 4 | `npm run build` | **成功**（11/11 页面静态预渲染，exit 0） |

### V6 — 联机烟测独立复跑（本地全栈服务，版本端点回报 `23b03fb`）

| 烟测 | 结果 |
| :--- | :--- |
| `smoke:lobby` | **11/11 PASS**（WebSocket 连接 ×3、REST 房间列表、创建/加入/对局/结束隐藏/增量版本） |
| `smoke:matchmaking` | **8/8 PASS**（三人撮合、防溢出隔离、取消匹配） |
| `verify:online` | 冷启动首跑 `page` 项 `FAIL`（Next dev 首次编译 4.3s + 检查项 10s 上限，`This operation was aborted`），其余 3 项 PASS；**页面预热后复跑 4/4 PASS**（`page`/`version`/`socket.io polling`/`socket.io websocket`）。判定为**环境时序假阴性**，非交付缺陷。 |

### V7 — 交付文档声明逐项核对（靶向 Round-3 P3-1 的"行数虚报"问题类）

| 声明 | 实测 | 结论 |
| :--- | :--- | :--- |
| `room-state-machine.ts` 2130 行 | `wc -l` = 2130 | ✅ |
| `presence-tracker.ts` 280 行 | 280 | ✅ |
| `leaderboard-service.ts` 87 行 | 87 | ✅ |
| `rooms.ts` 324 行（原 2414，净减 2090，−86.6%） | 324；base 2414；2090/2414 = 86.58% | ✅ |
| 重导出 31 个公开类型 | 31（另 `PlayerIdentityKind` 增量） | ✅ |
| 代理 41 个公开方法 | 41 | ✅ |
| `room-socket.ts`「35+ 方法」 | 去重后 **36** 个 | ✅ |
| 28 套 / 242 例 | 28 / 242 | ✅ |
| diff 规模 | 7 文件 +2821/−2281 | ✅ |

**结论：handoff 与 INDEX 的量化声明 100% 属实**（与 Round 3 时期的虚报形成对照）。

---

## 5. 缺陷清单（按严重级别排序）

### P3-1：`STATUS.md:11`「最新阶段交付提交」第三次滞后一拍，Phase 4 交付未刷新且 handoff 未予记载

- **严重级别**：P3（文档基准可信度；无功能影响，但违反本项目"零缺陷容忍"验收标准 #6）
- **文件与行号**：`STATUS.md:11`
- **触发条件**：以 `STATUS.md`（自述为"本仓库唯一权威的动态事实基准 / Single Source of Truth"）核对当前最新交付版本时。
- **实际行为**：`STATUS.md:11` 仍声明「最新阶段交付提交：`3e201ec fix(refactor): restore ai thinking indicator in GameShell and converge review findings`」（Phase 3 修复提交），而本次审查 HEAD 为 `23b03fb`（Phase 4 交付），`STATUS.md:43/46` 已把 Phase 4 记为 ✅ 里程碑，形成与 Round-3 P3-2、Round-4 P3-1 **完全同构的第三次复发**。`docs/handoff/INDEX.md` 的 Phase 4 行同样未携带提交号。
- **期望行为**：`最新阶段交付提交` 与实际最新阶段交付一致；且该字段不再随每个后续交付无条件滞后（Round 4 明确建议的双字段收敛方案落地，或确立"每次交付提交把该字段指向**紧邻的前一个阶段交付 SHA**、从而收敛为可核对的固定语义"的显式规则）。
- **根因**：提交无法自引用自身 SHA（结构性自引用死结）。项目既有惯例（Phase 3 修复提交 `3e201ec` 把该字段更新为 `b45e3fb`）本可收敛——即在后续提交回填前一次阶段交付 SHA——但 Phase 4 交付未执行该回填，亦未在 handoff 中记载为由下一次提交补正，导致同一问题类持续复发。
- **影响范围**：仅文档与协作可信度。三个 SHA（`eb10c4e`/`23b03fb`）在 `git log main` 均可达，不存在游离提交；不影响构建、运行时或任何消费者。
- **复现方法**：
  ```bash
  git rev-parse HEAD          # 23b03fb12ff528359af293c7a9d048f2e7860bce
  sed -n '11p' STATUS.md      # 最新阶段交付提交：3e201ec ...
  ```
- **修复建议**（在**下一次**提交中执行，该提交可合法引用 `23b03fb`）：
  1. 将 `STATUS.md:11` 更新为 `23b03fb feat(refactor): phase 4 - decouple server rooms into micro domain services`；
  2. 在 `STATUS.md:9` 保留（或强化）当前 HEAD 指引字段，使其与 `最新阶段交付提交` 构成 Round 4 建议的**双字段语义**并写明规则：「`当前 HEAD` 以 `git rev-parse` 实时为准；`最新阶段交付提交` 记录本字段所在提交的**直接前驱阶段交付**，每次阶段交付在下一次提交回填」——使该字段的期望值唯一可判定，彻底终止复发；
  3. 在 `docs/handoff/INDEX.md` 的 Phase 4 行补注交付提交短 SHA。
- **修复后验收标准**：`sed -n '11p' STATUS.md` 显示的短 SHA 与 `git log --format=%h -1 <Phase 4 交付提交>` 一致且可在 `git log main` 中寻得；`STATUS.md:9` 的双字段规则表述自洽、可由第三人按字面判定真值；`INDEX.md` 中 Phase 4 行含提交号，与 Round 1–4 各行的记录粒度一致。

**P0 / P1 / P2 缺陷数：0 / 0 / 0。**

---

## 6. 待确认风险与观察（非已确认缺陷）

> 以下各项均**无当前可复现的实际影响**，依规范不计为缺陷，仅登记以备后续阶段。

- **R1｜未验证项：Next dev 冷编译下 `verify:online` 的 `page` 检查超时。** 已在页面预热后 4/4 PASS，故判定为环境时序；**残余风险**：在极慢 CI/冷缓存环境该检查可能持续假阴性。需在 Node 24 基准环境与冷缓存的 CI 上复跑一次以排除。
- **R2｜新公开类的可选协作者存在"静默降级"设计面（无当前调用方命中）。** `RoomStateMachineOptions.getOnlineUserCount` 默认 `() => 0`、`onGameFinished` 为可选：若未来直接 `new RoomStateMachine()` 而漏注入，则 `getLobbyActivitySummary().onlineUsers` 恒为 0、且**对局结束时权威战绩被静默丢弃**（base 因 `gameRecordStore` 总有默认实现，不存在该退化面）。**怀疑依据**：`domain/room-state-machine.ts:326-341` 的默认值与 `captureFinishedGame` 的 `this.onGameFinished?.(...)` 可选调用。**当前证据不足以判为缺陷**：`rooms.ts:120-131` 是唯一构造点且恒注入两者，全仓（`src` + `tools`）无任何其他 `new RoomStateMachine(` 调用。**建议验证**：补一条单测断言门面装配后 `onGameFinished` 与 `getOnlineUserCount` 均已接线；或把二者改为必填参数以让类型系统兜底。
- **R3｜新公开域服务暴露于门面（封装面扩大）。** `rooms.ts:108-110` 以 `readonly` 公开 `leaderboardService` / `roomStateMachine` / `presenceTracker`（base 无此三者）。全仓扫描确认**无任何外部调用方使用**（仅 `rooms.ts` 自身），故无当前影响；仅构成未来可绕过门面的入口。建议改 `private readonly` 或明确将其列为受支持的扩展点。
- **R4｜`PresenceTracker.getPresenceVersion()` 为新增公开 API 但无任何消费者**（`presence-tracker.ts:175`）。仅属未使用面，不影响行为。
- **R5｜`applyMove` 对结构缺失的 intent 抛异常而非返回 `RoomResult`（base 同构，非本次引入）。** 复现：`roomStore.applyMove(code, { playerId, point: undefined as never })` → `isValidMove` 内 `TypeError`（`board.ts:23`）。网络入口 `room-socket.ts:440-444` 直接透传客户端 `payload.point`，故畸形载荷的处置完全依赖 Socket.IO 对监听器异常的兜底。**关键限定**：该行为在 base 与重构实现中**逐字节相同**（V3 差分已证），**非 Phase 4 引入或加重**，故不计为本轮缺陷；登记供 Phase 5 及后续安全加固阶段评估。**建议验证**：向本地服务发送 `game:move` 且省略 `point`，观察进程是否存活。

---

## 7. 推荐修复顺序

1. **P3-1**（唯一阻塞项，且为纯文档改动，风险最低）：在紧接本轮的提交中回填 `STATUS.md:11` → `23b03fb`，并把「当前 HEAD / 最新阶段交付提交」双字段语义与回填规则写成可判定的明文，同步在 `INDEX.md` 的 Phase 4 行补注提交号。
2. （非阻塞、可与 1 同批或延后）R2/R3：将 `RoomStateMachine` 的两个关键协作者改为必填、或为门面装配补一条接线断言；`rooms.ts` 三处域服务引用改 `private`。
3. （延后至 Phase 5 或专项加固）R5：为 `game:move` 载荷增加结构校验，使畸形 `point` 返回 `spot-unavailable` 失败回执而非抛异常。

---

## 8. 下一轮（Round 6）复审验收标准

1. `git rev-parse HEAD` 为 P3-1 修复提交，且其父提交为 `23b03fb`；工作区干净。
2. `sed -n '11p' STATUS.md` 的短 SHA 等于 `git log --format=%h -1 23b03fb`，且该 SHA 在 `git log main` 可达。
3. `STATUS.md` 中「当前 HEAD」与「最新阶段交付提交」双字段语义表述自洽，可被第三人按字面独立判定真值（不再依赖对惯例的默契理解）。
4. `docs/handoff/INDEX.md` 中 Phase 4 交付行含提交短 SHA，记录粒度与 Round 1–4 各行一致。
5. 本轮 diff **只含审查文档所需改动**（`STATUS.md` `/` `docs/handoff/INDEX.md`，以及为修复 P3-1 而在**本次复审提交**中回填的 `STATUS.md:11`），不得混入产品代码或测试改动；`git diff 23b03fb..HEAD --stat` 不包含 `src/**` 与 `tools/**`。
6. 若修复方附带处理 R2/R3，需提供对应断言或类型约束证据；门禁 1–4 仍须全绿（本轮已验证 `npm test` 在本机可运行，门禁 3 不再适用"环境不可用"豁免）。
7. P0/P1/P2/P3 全级别缺陷数均为 0。

---

## 9. 本轮审查未验证项与残余风险

- **未验证项 1**：`verify:online` 的 `page` 检查在**冷缓存/慢环境**下的稳定性（本轮仅在预热后通过）。
- **未验证项 2**：`GameRecordStore` 的**磁盘持久化**路径（`data/game-records/records.jsonl`）在本轮差分中未覆盖——差分使用默认内存库；但门面按引用直传同一 `GameRecordStore` 实例，接线路径已静态确认（`room-store.ts` → `rooms.ts:115-118` → `LeaderboardService`）。
- **未验证项 3**：长时运行下的内存演化（presence/chat 频控表的剪枝阈值）仅以边界参数在有限步数内验证，未做小时级 soak。
- **残余风险**：R1–R5 五项；均为非阻塞、无当前可复现影响。
- **本轮已完成的独立验证总量**：代码块级等价比对（98 base 块 / 102 new 块 / 14 处受控 delta）、差分断言 **691** 项、版本契约断言 **116** 项、API 面等价核对（41 方法 / 31 类型 / 23 个真实消费符号 / 17 个调用方文件）、四道门禁复跑、三套联机烟测复跑、文档量化声明 9 项逐项核对。

---

## 10. 审查结论

Phase 4 的领域解耦在**功能等价性上无任何可证伪点**：三大微领域服务的代码块与 base 单体逐字节等价，仅有的 14 处改写均为可证明等价的机械搬运；41 个公开方法与 31 个公开类型零破坏；691 项端到端差分与 116 项版本契约断言零差异；四道门禁与三套联机烟测全绿；handoff 全部量化声明属实。这是一次**高质量的等价重构**。

唯一阻塞为 `STATUS.md:11` 阶段交付提交字段的第三次滞后一拍（P3，纯文档、修复成本极低、且 Round 4 已给出终止复发的方案）。依本项目"零缺陷容忍"验收标准 #6，本轮**不满足审查通过条件**，需由主开发智能体按 §7-1 修复后进入 Round 6 复审。
