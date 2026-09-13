# 独立代码审查报告：Phase 2 前端状态 Hook 解耦与代码卫生收敛（Round 2）

- **审查日期**：2026-09-13
- **审查角色**：独立代码审查员（WorkBuddy Independent Code Auditor）
- **被审 HEAD SHA**：`785c8d4fdd4bcfc5c9490e73cdf409767b3c7f03`
- **基准提交 SHA**：`b65aa133df1cf317eaa4cb9acf66d65238452732`
- **实际审查 diff 范围**：`b65aa13..785c8d4`（13 文件，+2195 / −1602）
- **工作区状态**：干净（`git status --porcelain` 空；`git pull --ff-only` = Already up to date；HEAD 与待审 SHA 一致）
- **审查结论**：**无 P0 / P1 / P2；存在 6 项 P3；不阻塞发布**。可进入 Phase 3，建议顺手收敛 P3-1、P3-3。

---

## 1. 需求与实现对应关系

| # | 验收标准 | 实现位置 | 结论 |
| :- | :--- | :--- | :--- |
| 1 | `useFriendRoom.ts` 拆为 4 子 Hook + 顶层装配器，`FriendRoomController` 79 字段 100% 兼容，6 个消费组件零改动 | `src/components/hooks/{room-state-utils,useRoomSocket,useLobbyPresence,useRoomChat,useRoomGame}.ts`、`src/components/useFriendRoom.ts:360-440` | ✅ 达成（见 §4-V2/V4：旧新 return 键集合逐键一致；6 个消费组件 diff 为空） |
| 2 | 消除 R6 模块级 `boot*Cache`，改用实例作用域守护 | `room-state-utils.ts:158-173` `useBootSnapshot`（`useRef` 缓存 + `useSyncExternalStore`） | ✅ 达成（见 §4-V3：生产代码中 `boot*Cache`/`let boot` 归零） |
| 3 | 收敛 Phase 1 P3（`BOARD_SIZE` 单一本源、`WIN_STONE_COUNT` 规则绑定与单测补充） | `src/lib/constants.ts:7`、`src/game/board.ts:4,141`、`src/game/ai.ts:2,1634`、`src/lib/constants.test.ts:45-78` | ⚠️ 部分达成：规则绑定已落地且经独立复验为真（§4-V1），但新增单测存在同义反复，未满足 Round-1 P3-3 的 mutation 可检测要求（见 P3-5） |
| 4 | 四道门禁 + 联机烟测全绿 | — | ⚠️ 部分独立复验：`tsc` 0 错误、`lint` 0 错误 0 警告（本轮复跑）；`npm test` **本环境无法运行**（见 §6-R1）；`build` 与三项烟测未复跑（见 §7） |
| 5 | 生成 Phase 2 handoff 并规范提交推送 | `docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md`、`docs/handoff/INDEX.md`、`STATUS.md`、`785c8d4` | ✅ 达成（提交已推送，`main` 与 `origin/main` 同步；但文档事实项存在偏差，见 P3-1/P3-2） |

### 1.1 逐函数等价性核对（旧 1775 行 → 新 5 模块）

对基线 `src/components/useFriendRoom.ts` 与新版 5 个模块做了逐函数比对，**状态机与调用契约未发现语义漂移**：

| 旧实现域 | 新归属 | 核对结论 |
| :--- | :--- | :--- |
| `getPlayerBySeat` / `hasOpenPlayerSeat` / 7 个 `is*` 类型守卫 / `upsertLobbyRoom` / `sortLobbyRooms` | `room-state-utils.ts` | 逐行一致，纯搬迁 |
| 38 个 storage / URL / 昵称 / 随机数 / 连接错误格式化工具 | `room-state-utils.ts` | 逐行一致 |
| 4 个 `boot*Cache`（模块级 `let`） | `room-state-utils.ts:useBootSnapshot` | 由模块级改为实例级 `useRef`；`null` 哨兵对 `false` 不误判 |
| `ensureSocket`（11 个监听器）/ `applyRoomAck` / 重连处理器 / `createRoom` / `join*` / `leaveRoom` / room 与 error 状态 | `useRoomSocket.ts` | 监听器集合一致；`lobby:*`、`public-chat:*`、`presence:*` 改为经 `eventHandlersRef` 委派 |
| 大厅 / Presence / 排行榜 / Profile / 上一局记录 / 对局上报 / 匹配 / 4 个入口守卫 | `useLobbyPresence.ts` | 逐行一致；`refreshLeaderboard` 仍由消费方 `useEffect([refreshLeaderboard])` 触发，依赖链未断（`OnlineLobbyView.tsx:411-413`） |
| 房间聊天 / 公共聊天 / 两个 `ChatSendGate` / `refreshPublicChat` | `useRoomChat.ts` | 逐行一致，8 秒看门狗语义保留 |
| `playMove`/`toggleReady`/`resignGame`/`setRematchReady`/`respondUndoRequest`/`undoMove`/`sitRoom` + 8 个衍生守卫 | `useRoomGame.ts` | 逐行一致 |
| account 登录/注册/登出、邀请链接复制、`playerName`/`joinTarget`/`registrationHandle` 覆盖状态、account session 校验 effect | `useFriendRoom.ts`（装配器） | 逐行一致 |

**发现的两处语义偏差**（见 P3-3、P3-4）：`createRoom` 内部守卫弱化；`clearClosedRoom` 改为无条件触发 `onRoomCleared`。

### 1.2 关键调用链（已追踪）

- **Socket 生命周期**：`GameShell.tsx:99 useFriendRoom` → `useFriendRoom.ts:151 useRoomSocket` → `ensureSocket()` 惰性创建 → 监听器注册 → `updateEventHandlers`（`useFriendRoom.ts:203-211`，无依赖数组的 effect）→ `lobbyPresence.handle*` / `roomChat.handlePublicChatMessages`。
- **房间关闭**：服务端 `room-socket.ts:1140 io.to(roomCode).emit("room:closed")`（+ `:1142` 公共房另发 `lobby:room-deleted`）→ `useRoomSocket.ts:190-194` → `clearClosedRoom`（`:124-138`）→ `onRoomClearedRef`（`useFriendRoom.ts:159-164`）→ `roomChat.resetChatOnRoomClosed` + `lobbyPresence.resetLobbyOnRoomClosed`。
- **R6 快照**：`room-state-utils.ts:useBootSnapshot` → `subscribeToBootState`（`client-boot-state.ts:31`，空订阅）+ `useRef` 缓存 → `useFriendRoom.ts:139-144` 与 `useRoomSocket.ts:91-94`。
- **规则常量**：`lib/constants.ts:7 export { BOARD_SIZE, WIN_STONE_COUNT } from "@/game/board"` → 消费方 `board.ts:141`、`ai.ts:1634`、`GomokuBoard.tsx`。
- **聊天长度两端**：客户端 `maxLength`（`OnlineLobbyView`/`TableRoomChat`）↔ 服务端 `rooms.ts` 码点判定；本轮未改动该链路。

---

## 2. 阅读过的关键文件

**变更文件（逐文件完整阅读）**：`src/components/hooks/room-state-utils.ts`(397)、`useRoomSocket.ts`(539)、`useLobbyPresence.ts`(501)、`useRoomChat.ts`(180)、`useRoomGame.ts`(133)、`src/components/useFriendRoom.ts`(441)、`src/game/board.ts`、`src/game/ai.ts`(变更段)、`src/lib/constants.ts`、`src/lib/constants.test.ts`、`docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md`、`docs/handoff/INDEX.md`、`STATUS.md`。

**为验证辐射影响额外阅读**：基线 `b65aa13:src/components/useFriendRoom.ts`(1775)、`src/components/GameShell.tsx`、`src/components/online/OnlineLobbyView.tsx`、`src/components/online/GameTableView.tsx`、`src/components/online/TableRoomChat.tsx`、`src/components/chat-send-gate.ts`、`src/components/leave-room-attempt.ts`、`src/components/account-identity.ts`、`src/components/client-boot-state.ts`、`src/server/room-socket.ts`(room:closed / socket.join / socket.leave 段)、`docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md`、`vitest.config.ts`、`package.json`、`package-lock.json`(vite 条目)。

> 仓库内不存在 `docs/review-checklist.md`，该项跳过。

---

## 3. 测试代码审查

- 本次提交唯一新增测试：`src/lib/constants.test.ts`（+2 条，`describe` 共 7 条）。
- **无任何针对本次重构主体（`useFriendRoom` 及 4 个子 Hook）的测试**。`find src -name "*.test.ts*"` 中不存在 hook 级测试文件；`vitest.config.ts` 仅 `environment: "node"`，且 `package.json` 未引入 jsdom / @testing-library，因此 79 字段装配、`useBootSnapshot` 订阅语义、`eventHandlersRef` 委派时序、`onRoomCleared` 装配均无自动化守护（见 §6-R2）。
- **断言有效性评估**：
  - `constants.test.ts:45-66`（棋盘/胜负行为级）确实调用真实产品代码（`createBoard/placeStone/getGameResult`），这点优于 Round 1；但循环上界与最终断言都以 `WIN_STONE_COUNT` 表达，而规则实现消费的是**同一个绑定**，两侧同步移动，故该用例无法检出「规则回退为字面量 5」这一 P3-2 原始缺陷。
  - `constants.test.ts:68-78`（长度边界）断言 `"a".repeat(n).length === n`，只检验了 `String.repeat`，**未消费任何产品代码**，无法检出任何替换点位被改错。
  - 结论：Round-1 P3-3 要求的「任一替换点位被改错可被测试捕获」**未闭环**（见 P3-5）。
- **无 mock 掩盖问题**：新增测试未使用 mock。

---

## 4. 独立设计的验证场景及执行结果

| # | 场景（现有测试未直接覆盖） | 方法 | 结果 |
| :- | :--- | :--- | :--- |
| **V1** | 规则常量绑定的**负向/边界**行为 | 临时 `tsx` 脚本直连 `src/game/board.ts` 真实实现，构造 18 项断言：4 子 →`playing`、第 5 子→`won`、自由规则长连（6 连）仍胜且 `line.length===6`、三方向独立取胜、**间隔一格不误判**、交替异色不误判、越界/占位落子抛错、空盘非满 | **18/18 PASS**，`WIN_STONE_COUNT` 确实驱动胜负判定，`BOARD_SIZE` 确实驱动建盘 |
| **V2** | 79 字段 API 兼容性 | 对基线与新版的 `FriendRoomController` 类型字段集、以及 `return { ... }` 键集合做逐键双向比对 | **完全一致（79/79）**，无新增/缺失字段 |
| **V3** | R6 模块级快照是否彻底消除 | 全仓 `grep -n "boot[A-Z]\w*Cache\|let boot"` | 生产代码 **0 命中**；仅 `client-boot-state.ts:20` 的注释仍提及旧机制（见 P3-6） |
| **V4** | 6 个消费组件是否零改动 | `git diff --stat <base>..<head> -- GameShell/GameTableView/OnlineLobbyView/TableRoomChat/TableSidebar/TableSidebarTabs` | **输出为空**，零改动成立 |
| **V5** | 门禁复跑 | `npx tsc --noEmit`；`npm run lint`；`npm test` | tsc **0 错误**；lint **0 错误 0 警告**；`npm test` **本环境 runner 故障，无法执行**（见 §6-R1） |
| **V6** | `createRoom` 守卫等价性（故障/边界态推演） | 将旧 `canCreateRoom` 与 `useRoomSocket.ts:268` 新守卫展开为真值表，枚举 6 个布尔量 | 二者在 `matchmakingStatus==="searching"` 与 `enabled===false` 两种态下分歧（见 P3-3） |

> V1/V3/V5 已实际执行；V6 为对纯布尔判定的静态推演，未改动产品代码。临时脚本 `tools/__review-verify.ts` 已删除，提交前工作区干净。

---

## 5. 缺陷清单（按严重级别排序）

### P0 — 0 项｜P1 — 0 项｜P2 — 0 项

### P3-1：`STATUS.md`「最新交付提交」指向游离提交，且行数声明偏差（Round-1 P3-4 未真正闭环）
- **严重级别**：P3（文档准确性 / 权威基准失真）
- **文件与行号**：`STATUS.md:11`、`STATUS.md:42`
- **触发条件**：任何人以 STATUS.md 作为「唯一权威动态事实基准」核对当前版本或回退/发布时。
- **实际行为**：`STATUS.md:11` 声明最新交付提交为 `401db34`；但 `git merge-base --is-ancestor 401db34 HEAD` 返回**非祖先**、`git branch -a --contains 401db34` 为**空**，即 `401db34` 是**游离提交（dangling commit，作者 Codex，2026-09-13 11:58:34）**，在 `main` 上不可达；`main` 真实 HEAD/交付提交为 `785c8d4`（11:58:46）。另 `STATUS.md:42` 称装配器「407 行」，实测 `wc -l src/components/useFriendRoom.ts` = **441**。
- **期望行为**：STATUS 的提交号与行数与实际 HEAD / 实测一致。
- **根因**：Phase 2 交付在修订（amend/重建）过程中产生了被替换的游离提交，文档记录沿用了被替换对象；这恰是 Round-1 P3-4 要求修复的同一类问题——修复后从「旧提交号」变成了「游离提交号」。
- **影响范围**：仅文档与协作可信度，无产品影响。
- **验证证据**：`git log --oneline -1 401db34`、`git merge-base --is-ancestor 401db34 HEAD`(非 0)、`git branch -a --contains 401db34`(空)、`git rev-parse HEAD`(=785c8d4)、`wc -l`。
- **修复建议**：将 `STATUS.md:11` 更新为 `785c8d4`（或直接使用 `git rev-parse HEAD` 生成）；行数改为实测值。
- **修复后验收标准**：`STATUS.md` 中提交号在 `git log main` 中可检索到，行数与 `wc -l` 一致。

### P3-2：Phase 2 handoff 文件行数表与实测不符
- **严重级别**：P3（文档准确性）
- **文件与行号**：`docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md:40-45`、`:107`
- **触发条件**：后续阶段（Phase 3~5）以 handoff 的规模数据评估工作量或做基线对比时。
- **实际行为**：声明值与实测（`wc -l`）逐项偏差：

  | 文件 | handoff 声明 | 实测 |
  | :--- | ---: | ---: |
  | `room-state-utils.ts` | 316 | **397** |
  | `useRoomSocket.ts` | 457 | **539** |
  | `useLobbyPresence.ts` | 434 | **501** |
  | `useRoomChat.ts` | 153 | **180** |
  | `useRoomGame.ts` | 113 | **133** |
  | `useFriendRoom.ts` | 407 | **441** |

- **期望行为**：文档规模数据来自提交后的实测。
- **根因**：文档按早期草稿的中间规模填写，交付前未按最终文件重算。
- **影响范围**：文档可信度；不影响功能。
- **验证证据**：`wc -l` 六文件实测。
- **修复建议**：按实测更新表格与 §2.4 的「407 行」表述。
- **修复后验收标准**：handoff 中全部行数声明与 `wc -l` 一致。

### P3-3：`createRoom` 内部守卫被弱化，与旧 `canCreateRoom` 不再等价
- **严重级别**：P3（防御性回归；当前经 UI 不可达）
- **文件与行号**：`src/components/hooks/useRoomSocket.ts:268`
- **触发条件**：在 `enabled === false` 或 `matchmakingStatus === "searching"` 且满足 `identityReady && !room && !createRequestInFlight` 时调用 `createRoom()`。
- **实际行为**：新守卫为 `if (!identityReady || createRequestInFlightRef.current || room) return;`；旧守卫为 `if (!canCreateRoom || createRequestInFlightRef.current) return;`，其中 `canCreateRoom = enabled && identityReady && !room && !isCreatingRoom && matchmakingStatus !== "searching"`。即新守卫**丢弃了 `enabled` 与 `matchmakingStatus !== "searching"` 两个判定**（`isCreatingRoom` 由同步 `ref` 兜住，无实际分歧）。
- **期望行为**：守卫能力不弱于重构前。
- **根因**：`useRoomSocket` 不持有 `enabled` 开关与 `matchmakingStatus`（后者位于 `useLobbyPresence`），迁移时以「最少参数」重建守卫，未回传完整判定。
- **影响范围**：当前两个调用点均为 `disabled={!room.canCreateRoom}` 的按钮（`OnlineLobbyView.tsx:186`、`:702`），且 `enabled=false` 时该视图不挂载，故 UI 路径不可达；风险限于将来新增消费方或程序化调用。
- **验证证据**：§4-V6 真值表；`OnlineLobbyView.tsx:156/186/692/702` 的 disabled 绑定；旧实现 `b65aa13:src/components/useFriendRoom.ts:475-492` 对照。
- **修复建议**：向 `useRoomSocket` 透传 `enabled` 与 `matchmakingStatus`（或直接透传 `canCreateRoom`），恢复完整守卫。
- **修复后验收标准**：`createRoom` 的进入条件与旧 `canCreateRoom` 等价，UI 与内部守卫不再存在分歧态。

### P3-4：`clearClosedRoom` 改为无条件触发 `onRoomCleared`，且房间码来源由「事件码」改为「当前房间码」
- **严重级别**：P3（潜在状态不一致；当前经服务端广播范围约束不可达）
- **文件与行号**：`src/components/hooks/useRoomSocket.ts:124-138`（`:125` 为无条件调用点）；`src/components/useFriendRoom.ts:159-164`
- **触发条件**：收到 `room:closed` 且其 `code` 与当前 `room.snapshot.code` **不一致**时（或 `room` 为 `null` 时经 `room:not-found` 重连分支调用）。
- **实际行为**：旧实现把「清理聊天草稿 / 大厅列表 / 匹配状态」放在 `currentRoom?.snapshot.code === roomCode` 的判定**之内**；新实现把 `onRoomClearedRef.current?.()` 提到 `setRoom` 之外**无条件执行**——因此即便关闭的不是当前房间，也会 `setChatText("")`（清空正在输入的聊天草稿）并调用 `resetLobbyOnRoomClosed(roomSocket.room.snapshot.code)`（用**当前**房间码而非**事件**房间码过滤大厅）。此外当 `room === null` 时 `resetLobbyOnRoomClosed` 被跳过，而旧实现仍会置 `lobbyStatus="ready"`/`matchmakingStatus="idle"`。
- **期望行为**：仅当关闭的房间即当前房间时清理聊天/房间；大厅过滤使用事件携带的房间码。
- **根因**：为让 `useRoomSocket` 不直接依赖 chat/lobby 状态，改用 `onRoomCleared` 回调，但回调未携带 `roomCode`，且调用位置从「判定内」移到了「判定外」。
- **影响范围**：可达性低——服务端 `room:closed` 仅向该房间频道广播（`room-socket.ts:1140`），且客户端在同一时刻至多只在一个房间频道内（切换/离开时先 `socket.leave`，`room-socket.ts:346/739/881`）。故当前不构成现实缺陷，但属结构性不一致：一旦频道与 `room` 状态出现偏差（如重连 `room-not-found` 分支），会出现「草稿被清但房间仍在」或「大厅未重置」。
- **验证证据**：新旧 `clearClosedRoom` 逐行对照（`b65aa13:src/components/useFriendRoom.ts:317-334` vs `useRoomSocket.ts:124-138`）；服务端广播与 `socket.join/leave` 位置。
- **修复建议**：`clearClosedRoom(roomCode)` 应把 `roomCode` 传给 `onRoomCleared?.(roomCode)`，由装配层用该码做大厅过滤；并将聊天清理收敛到「事件码 === 当前房间码」判定内（或明确注释论证无条件清理的安全性）。
- **修复后验收标准**：关闭非当前房间不会清空聊天草稿；关闭当前房间时聊天、房间、大厅、匹配状态按旧语义一次性收敛。

### P3-5：新增行为级测试未闭环 Round-1 P3-3（存在同义反复）
- **严重级别**：P3（测试有效性缺口）
- **文件与行号**：`src/lib/constants.test.ts:68-78`（长度边界）、`:45-66`（棋盘行为）
- **触发条件**：任一「替换点位」被误改（聊天长度上界、昵称截断、档案分页默认值），或胜负规则被回退为字面量 `5`。
- **实际行为**：`:68-78` 仅断言 `"a".repeat(MAX_CHAT_MESSAGE_LENGTH)` 的长度等于其自身，**未调用任何产品代码**（未覆盖 `RoomStore` 对 161 码点的拒绝、`normalizeDisplayName` 的截断等），mutation 不可检测；`:45-66` 的循环上界 `col < WIN_STONE_COUNT - 1` 与最终断言 `line.length >= WIN_STONE_COUNT` 都与规则实现消费同一个绑定，二者同步变化，因此**无法检出「`board.ts` 规则改回字面量 5 而常量不变」**——而这正是 Round-1 P3-2 的原始缺陷形态。常量值本身由 `:18 expect(WIN_STONE_COUNT).toBe(5)` 钉住。
- **期望行为**：至少一条断言消费真实产品代码；规则用例与常量解耦。
- **根因**：以「常量参与断言」代替「产品代码消费常量」。
- **影响范围**：验收标准 #3 的自动化守护仍不完整；不构成功能缺陷（§4-V1 已独立确认规则绑定真实生效）。
- **验证证据**：通读 `constants.test.ts`；§4-V1 独立复跑确认规则行为正确；Round-1 handoff §5 P3-3 的原始要求。
- **修复建议**：补一条消费产品代码的用例（例如 `RoomStore` 收 161 码点返回 `chat-message-too-long`，或 `normalizeDisplayName` 超长截断到 `MAX_PLAYER_NAME_LENGTH`）；棋盘用例改为显式「4 子不赢 / 5 子赢」的固定字面量断言，不将常量用作循环上界。
- **修复后验收标准**：将任一替换点位或规则字面量人为改错，至少 1 条测试失败（mutation 可检测）。

### P3-6：`client-boot-state.ts` 注释仍指向已被移除的 `useFriendRoom` 的 `boot*Cache`
- **严重级别**：P3（注释陈旧，误导维护者）
- **文件与行号**：`src/components/client-boot-state.ts:20-21`、`:51`
- **触发条件**：后续开发者按注释去 `useFriendRoom` 中查找 `boot*Cache` 以理解缓存契约时。
- **实际行为**：注释称「快照函数必须自带缓存（下面的 `bootGameModeCache ??=`，或 useFriendRoom 里的 `boot*Cache`）」，但 `useFriendRoom` 中的 `boot*Cache` 已被 `useBootSnapshot` 的 `useRef` 缓存取代（该文件不在本次 diff 内，故未同步）。
- **期望行为**：注释引用现存的缓存实现。
- **根因**：重构未更新跨文件引用注释。
- **影响范围**：仅文档/注释可读性；缓存契约本身仍被 `useBootSnapshot` 正确满足。
- **验证证据**：§4-V3 全仓 grep；`room-state-utils.ts:158-173`。
- **修复建议**：将该处示例改为 `room-state-utils.ts 的 useBootSnapshot`，或抽去具体文件名。
- **修复后验收标准**：注释引用的实现存在且语义一致。

---

## 6. 待确认风险

| # | 风险描述 | 怀疑依据 | 缺失证据 | 建议验证方法 |
| :- | :--- | :--- | :--- | :--- |
| **R1** | 门禁 3（`npm test`）在本审查环境**完全无法运行**，故「27 套件 / 235 用例全绿」未获独立复验 | `npm test` → **27/27 文件全部失败**；连不含任何项目导入的空壳探针用例也失败（`Vitest failed to find the current suite`），项目用例报 `TypeError: Cannot read properties of undefined (reading 'config')`；`npx vitest run src/lib/constants.test.ts --pool=forks --no-file-parallelism` 同样失败 | 可复现的 runner 环境；`npm ci` 后的干净依赖树 | 在交付方环境复跑 `npm test`；或先排查本地 runner（实测 Node **v25.8.0**，而 `STATUS.md:13` 声明 Node v24.x；vitest 4.1.9 + vite 8.0.16 在 Node 25 上疑似不兼容）。**该失败与本次 diff 无关**：它在 `src/game/board.test.ts` 等未改动文件上同样发生 |
| **R2** | 本次重构主体（4 个子 Hook + 装配器 + `useBootSnapshot` 订阅替换 + `eventHandlersRef` 委派 + `onRoomCleared` 装配）**无任何单元测试覆盖**，行为等价性依赖人工逐函数比对与端到端烟测 | `find src -name "*.test.ts*"` 无 hook 级测试；`vitest.config.ts` 仅 node 环境且未引入 jsdom/@testing-library | hook 级测试或等价性回归证据 | 引入 jsdom + @testing-library/react，对 `useRoomSocket`/`useLobbyPresence`/`useRoomChat`/`useRoomGame` 各补最小渲染测试；或把守卫/派生式抽为纯函数并单测 |
| **R3** | `eventHandlersRef` 委派使 socket 监听器在首帧 effect 落地前指向空处理器 `{}`，理论上存在「首帧事件丢弃」窗口 | `useRoomSocket.ts:77` 初值 `{}`；`useFriendRoom.ts:203-211` 在 effect 中填充 | 该窗口内是否真的丢失过事件的证据 | 已论证为不可达（子组件 effect 先于父组件 effect，且网络事件为异步 I/O，落地前会先 flush effect），残余风险极低；如需确证可加集成测试断言首帧 `lobby:room-updated` 不丢 |

---

## 7. 未验证项与残余风险

- **已独立执行**：`npx tsc --noEmit`（0 错误）、`npm run lint`（0 错误 0 警告）、§4-V1/V2/V3/V4/V6 各项校验。
- **未能独立执行**：
  - `npm test` —— 环境 runner 故障（见 R1），残余风险：若交付方绿测结论有误或依赖其特有环境，本轮结论不覆盖。
  - `npm run build` —— 未复跑（未构建，残余风险：生产打包/预渲染差异，但 `tsc` 已 0 错误，风险低）。
  - `npm run verify:online` / `smoke:lobby` / `smoke:matchmaking` —— 未复跑（需起服务）；本次改动为前端状态层重排，未触碰 `src/server/*` 与 socket 契约，风险低。
  - 浏览器级 hook 渲染验证（无 jsdom / 无 @testing-library）—— 见 R2。
- **残余风险总评**：低。核心风险集中在「大规模手工搬迁缺少单元测试守护」与「本环境无法复跑测试门禁」，二者均非本次 diff 的功能缺陷。

---

## 8. 推荐修复顺序

1. **P3-1**（STATUS.md 提交号/行数校正）—— 成本最低，且直接关系到 Round-1 P3-4 的闭环。
2. **P3-3**（恢复 `createRoom` 完整守卫）—— 一行透传，消除防御性回归。
3. **P3-4**（`clearClosedRoom` 先判定房间码再清理，并把 `roomCode` 透传给 `onRoomCleared`）。
4. **P3-5**（补真实产品级行为测试；建议同时为 4 个子 Hook 补最小测试）。
5. **P3-2 / P3-6**（文档与注释校正，可与下次交付一并提交）。

> 以上均为非阻塞项；**不影响本提交发布与进入 Phase 3**。

---

## 9. 下一轮复审验收标准

1. `STATUS.md:11` 的提交号在 `git log main` 中可达，行数与 `wc -l` 实测一致；handoff 行数表同步校正。
2. `useRoomSocket.createRoom` 的进入条件与旧 `canCreateRoom`（含 `enabled`、`matchmakingStatus !== "searching"`）等价，UI disabled 与内部守卫无分歧态。
3. `room:closed` 关闭非当前房间时不清空聊天草稿；关闭当前房间时按旧语义一次性收敛聊天/房间/大厅/匹配；大厅过滤使用事件房间码。
4. 新增至少一条消费真实产品代码的行为断言（如 `RoomStore` 161 码点拒绝或 `normalizeDisplayName` 截断），且棋盘用例不再以 `WIN_STONE_COUNT` 作为循环上界。
5. `npx tsc --noEmit` / `npm run lint` / `npm test` / `npm run build` 全绿，并在**可复现**环境中复跑 `vitest`（当前本机 runner 故障需先定位，见 R1）。
6. 三阶段交付文档与代码实测数据一致（行数、提交号、门禁指标）。
