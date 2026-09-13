# 独立代码审查报告：Phase 3 联机大厅与表现层组件化（Round 3）

- **审查日期**：2026-09-13
- **审查角色**：独立代码审查员（WorkBuddy Independent Code Auditor）
- **被审 HEAD SHA**：`b45e3fba53b6e593606457bf5800ff99a551ad59`
- **基准提交 SHA**：`3492dc99c003e07c62ecbe711ac4c33a50374a8d`
- **实际审查 diff 范围**：`3492dc9..b45e3fb`（23 文件，+1900 / −1272）
- **工作区状态**：干净（`git status --porcelain` 空；`git pull --ff-only` = Already up to date；HEAD 与待审 SHA 一致）
- **审查结论**：**0×P0 / 0×P1；1×P2；3×P3；不满足"审查通过条件"**。P2 为 `dictionary.ai.thinking` 侧栏文案被静默移除的行为回归，成本极低、阻塞通过。修复后即可复审。

---

## 1. 需求与实现对应关系

| # | 验收标准 | 实现位置 | 结论 |
| :- | :--- | :--- | :--- |
| 1 | 从 `GameShell.tsx` 抽离 `useAiGame.ts` 并补单测，行数显著缩减 | `src/components/hooks/useAiGame.ts`(485)、`useAiGame.test.ts`(176)、`GameShell.tsx`(591) | ⚠️ 抽离完成、行数 **972 → 591**（−381，−39.2%）成立；但**丢失一处 UI 行为**（见 **P2-1**） |
| 2 | 新建 `RoomContext.tsx` 改造下游，支持 Context 与 Props 平滑兼容 | `RoomContext.tsx`(36)、`GameShell.tsx:426-464`、`GameTableView/TableSidebar/TableSidebarTabs/TableRoomChat` | ✅ 达成（`useOptionalRoomContext(roomProp)` = `roomProp ?? context`；全仓 11 处消费点均在 Provider 内或显式传 props） |
| 3 | `OnlineLobbyView.tsx` 拆为 6 面板，保留全部 `data-lobby-*` 契约 | `src/components/online/lobby/` 6 文件、`OnlineLobbyView.tsx`(191) | ✅ 达成（选择器集合**逐项一致**，见 §3-V2） |
| 4 | 收敛 Phase 2 审查 6 项 P3 | 见 §1.1 | ⚠️ 4/6 完全闭环；P3-1 部分（提交号可达但已过期）；P3-2 主体闭环但基线行数仍 +1 |
| 5 | 四道门禁 + 联机烟测全绿 | — | ⚠️ 独立复验 `tsc`=0、`lint`=0/0、`build`=成功（11/11 预渲染）；**`npm test` 本环境无法运行**（见 §6-R1）；三项烟测未复跑（见 §7） |
| 6 | 产出 Phase 3 handoff 并规范提交推送 | `docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md`、`docs/handoff/INDEX.md`、`STATUS.md`、`b45e3fb` | ⚠️ 交付单与收录完成、提交已推送；但**行数声明系统性 +1**（见 **P3-1**）、`STATUS.md:11` 提交号过期（见 **P3-2**） |

### 1.1 Phase 2 六项 P3 闭环核对

| 编号 | Round 2 结论 | 本轮实测 | 闭环 |
| :--- | :--- | :--- | :--- |
| **P3-1** | STATUS 提交号为游离提交、行数偏差 | `STATUS.md:11` = `785c8d4`，`git log main` 可达 ✅；装配器行数 441 ✅；但 `785c8d4` 已非最新交付（HEAD=`b45e3fb`） | ⚠️ 部分 |
| **P3-2** | Phase 2 handoff 行数表与实测不符 | `785c8d4` 实测：`room-state-utils`=397、`useRoomSocket`=539、`useLobbyPresence`=501、`useRoomChat`=180、`useRoomGame`=133、`useFriendRoom`=441 —— **六项全部吻合** ✅；但 §2.4 基线"1776 行"实测为 **1775**（仍 +1） | ⚠️ 主体闭环 |
| **P3-3** | `createRoom` 守卫弱化 | `useRoomSocket.ts:279` 恢复 `!enabled`；`:283` 追加 `canCreate()`；`canCreateRoom = enabled && identityReady && !room && !isCreatingRoom && matchmakingStatus !== "searching"`（`useLobbyPresence.ts:100`） | ✅ 闭环 |
| **P3-4** | `clearClosedRoom` 无条件清理 | `useRoomSocket.ts:130-149`：先算 `isCurrentRoom`，回调携带 `(roomCode, isCurrentRoom)`，非当前房直接 return；装配层用**事件房间码**过滤大厅、仅当前房才清聊天草稿（`useFriendRoom.ts:162-167`） | ✅ 闭环 |
| **P3-5** | `constants.test.ts` 同义反复 | 棋盘用例改为字面量 4/5（`constants.test.ts:52-64`）；新增真实产品代码断言（`AccountStore` 截断至 24、`RoomStore` 160 接受 / 161 拒绝） | ✅ 闭环（见 §4-V1/V2/V3 独立复现） |
| **P3-6** | `client-boot-state.ts` 陈旧注释 | 注释已指向 `room-state-utils.ts` 的 `useBootSnapshot` | ✅ 闭环 |

---

## 2. 阅读过的关键文件与调用链

**逐文件完整阅读（变更文件）**：`src/components/hooks/useAiGame.ts`(485)、`useAiGame.test.ts`(176)、`src/components/online/RoomContext.tsx`(36)、`src/components/online/OnlineLobbyView.tsx`(191)、`src/components/online/lobby/LobbyRoomList.tsx`(180)、`LobbyMatchmaking.tsx`(100)、`LobbyUsersPanel.tsx`(83)、`LobbyProfilePanel.tsx`(154)、`LobbyLeaderboard.tsx`(220)、`LobbyPublicChat.tsx`(76)、`src/components/GameShell.tsx`(591)、`src/components/online/GameTableView.tsx`、`TableSidebar.tsx`、`TableSidebarTabs.tsx`、`TableRoomChat.tsx`、`src/components/hooks/useRoomSocket.ts`(555)、`src/components/useFriendRoom.ts`(447)、`src/components/client-boot-state.ts`、`src/lib/constants.test.ts`、`docs/handoff/*`、`STATUS.md`。

**为对照/辐射影响额外阅读**：基线 `3492dc9:src/components/GameShell.tsx`(972)、`3492dc9:src/components/online/OnlineLobbyView.tsx`(888)、`src/components/hooks/useLobbyPresence.ts`(501)、`src/components/play/AiGameView.tsx`、`src/i18n/dictionaries.ts`（`ai.thinking` 六语种）、`src/server/accounts.ts`、`src/server/rooms.ts`(sendRoomChat/常量)、`tools/smoke-lobby-ui.ts`、`tools/smoke-share-url.ts`、`vitest.config.ts`、`package.json`。

**关键调用链（已追踪）**：

- **AI 编排**：`GameShell.tsx:71 useAiGame` → `useAiGame.commitAiTurn` → `requestAiMove` → `AiWorkerPool.acquire/releaseAll` → 看门狗 `setTimeout` + `terminateAiWorkers`；`cancelAiTurn` ← `resetGame`/`completeModeChange`/`handleUndo`。
- **AI 设置收敛**：`AiGameView` → `aiGame.handleDifficultyChange/handleFirstPlayerChange/handleAiReset` → `onResetGameRef.current` → `GameShell.handleResetFromAi` → `resetGameRef.current` → `resetGame` → `aiGame.createInitialSnapshot`。
- **房间关闭**：服务端 `room:closed` → `useRoomSocket.ts:201` → `clearClosedRoom(roomCode)` → `roomRef.current?.snapshot.code === roomCode` → `onRoomCleared(roomCode, isCurrentRoom)` → `useFriendRoom.ts:162-167` → `resetLobbyOnRoomClosed(roomCode)` + 条件 `resetChatOnRoomClosed()`。
- **Context 解析**：`GameShell.tsx:426/458 <RoomProvider value={friendRoom}>` → `OnlineLobbyView:46`/`GameTableView:46`/`TableSidebar:17`/`TableSidebarTabs:25`/`TableRoomChat:16` → `useOptionalRoomContext(roomProp)`。
- **大厅选择器**：`smoke-lobby-ui.ts:654-663,1228-1233,1464,1500-1558` ↔ 6 面板 DOM。

---

## 3. 测试代码审查

- 新增测试仅 `src/components/hooks/useAiGame.test.ts`（7 条）+ 改造 `src/lib/constants.test.ts`。
- **`useAiGame.test.ts` 只覆盖纯函数**（`getHumanStone/getAiStone/createOpeningSeed/normalizeAiWorkerResult/isDecisiveAiWorkerResult/isBetterAiWorkerResult/getCenterDistance/replayMoves/createInitialGameState`），**未覆盖 Hook 本身**（`commitAiTurn`/`cancelAiTurn`/`requestAiMove` 的竞态、看门狗超时、Worker 池归还路径）。这与"抽离 Hook"这一验收标准的守护强度不匹配（见 §6-R2）。
- **断言有效性**：新增断言确实消费真实产品代码，非同义反复——`constants.test.ts:52-64` 用独立字面量 4/5 判定；`:68-99` 直连 `AccountStore.createAccount` 与 `RoomStore.sendRoomChat`。**该点优于 Round 2**。
- **无 mock 掩盖**：未使用 mock。
- **本次变更引入的行为**（P2-1）**无任何测试守护**：`GameShell` 无组件测试，回归不可能被现有套件捕获。

## 4. 独立设计的验证场景及执行结果

> 由于本机 vitest runner 故障（§6-R1），采用**临时 `tsx` 脚本直连产品代码**复现（脚本已于提交前删除，工作区干净）。

| # | 场景（现有测试未直接覆盖） | 结果 |
| :- | :--- | :--- |
| **V1** | `RoomStore` 房间聊天 ASCII 边界：160 接受 / 161 拒绝 `chat-message-too-long`（复现新增单测） | **PASS** |
| **V2** | 聊天长度**码点/UTF-16 语义**边界：160 个 emoji（320 UTF-16 单元）→ 接受；161 个 emoji → 拒绝（现有测试仅用 ASCII，未覆盖多码元） | **PASS**，证实 `rooms.ts:1027 [...text].length` 按码点计数 |
| **V3** | `AccountStore` 昵称截断：50 串 → 24 且内容等于 `"a"×24`（复现新增单测） | **PASS** |
| **V4** | `useAiGame` 纯函数负向/边界：`next.point=null` 对 `null`/有效 current 均非更优；完全同分同深度同节点同距 → 非更优；`source` 缺省 → 非决定性；`opening` 带点 → 决定性；`error` 归一为 `none`/`-Inf` | **5/5 PASS** |
| **V5** | `createInitialGameState` 负向路径：`room` 模式即便 `firstPlayer="ai"` 仍空盘；`ai`+`ai` 恰 1 手黑子且落在盘内、`nextPlayer="white"`；`ai`+`human` 空盘 | **5/5 PASS** |
| **V6** | `replayMoves` 负向：占用点重放抛错（确认"非法落子抛错"契约，上上层 `handlePointSelect` 以 `try/catch` 静默吞掉） | **PASS** |
| **V7** | 选择器契约比对：`git show 3492dc9:OnlineLobbyView.tsx` 的 `data-*` 集合 vs 新 `OnlineLobbyView + lobby/*` 的集合并集 | **完全一致**（14 项，含布尔属性 `data-lobby-empty-state`） |
| **V8** | 门禁复跑：`npx tsc --noEmit`；`npm run lint`；`npm run build` | tsc **0 错误**；lint **0 错误 0 警告**；build **成功，11/11 页面预渲染** |

> **共 22 项断言全部 PASS**，脚本 `/.review-verify.ts` 与临时基线导出文件均已删除，`git status --porcelain` 为空。

---

## 5. 缺陷清单（按严重级别排序）

### P0 — 0 项｜P1 — 0 项

### P2-1：AI 模式下侧栏「AI 思考中」文案被静默移除（UI 行为回归）
- **严重级别**：P2（用户可见的行为回归；无编译/类型/测试告警）
- **文件与行号**：`src/components/GameShell.tsx:473-477`（基线为 `3492dc9:src/components/GameShell.tsx:738-744`）
- **触发条件**：进入 AI 模式 → 人类落子 → AI 进入计算（`isAiThinking === true`）。
- **实际行为**：侧栏 `.status-copy` 渲染 `getStatusText(activeStatus, dictionary)`，显示"轮到白棋/黑棋"一类的走子提示。
- **期望行为**：渲染 `dictionary.ai.thinking`（"AI 思考中" / "AI thinking" / 六语种），与重构前一致。
- **根因**：抽离 `useAiGame` 时，把原三元表达式
  `mode === "room" ? getRoomStatusText(...) : isAiThinking ? dictionary.ai.thinking : getStatusText(status, ...)`
  改写为 `mode === "room" ? getRoomStatusText(...) : getStatusText(activeStatus, ...)`，`isAiThinking` 分支被整体删除（diff 中体现为 `- ? dictionary.ai.thinking`）。
- **影响范围**：AI 模式对局中丢失"AI 正在思考"的显式反馈（`AiGameView` 仅将 `isAiThinking` 用于 `disabled`，无替代提示，见 `AiGameView.tsx:61,70,84,117`）；同时使 6 个语种的 `ai.thinking` 文案成为孤儿键（见 P3-3）。
- **验证证据**：
  - `git diff 3492dc9..b45e3fb -- src/components/GameShell.tsx | grep thinking` → 仅一行删除：`-                ? dictionary.ai.thinking`；
  - 全仓 `grep -rn "ai\.thinking|thinking"` → 除 `dictionaries.ts` 的 1 处类型声明 + 6 处取值外，**无任何消费点**；
  - `getStatusText(activeStatus, …)` 中 `activeStatus === status`（该分支已排除 `mode === "room"`），故并非等价替换。
- **修复建议**：恢复分支判定：
  ```tsx
  {mode === "room"
    ? getRoomStatusText(friendRoom, dictionary)
    : aiGame.isAiThinking
      ? dictionary.ai.thinking
      : getStatusText(status, dictionary)}
  ```
- **修复后验收标准**：AI 模式下 `isAiThinking` 为真时侧栏渲染 `dictionary.ai.thinking`；六语种均可显示；`grep` 存在真实消费点。

### P3-1：Phase 3 交付单与 STATUS 的行数声明系统性 +1 偏差（Round-2 P3-2 同类问题复现）
- **严重级别**：P3（文档准确性）
- **文件与行号**：`docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md:49-50,73-80,107-131`、`STATUS.md:43`；同类残留 `docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md:107`
- **触发条件**：后续阶段以交付单规模数据评估工作量或做基线对比。
- **实际行为**（声明 vs `wc -l` 实测，全部文件均以换行结尾）：

  | 文件 | 声明 | 实测 |
  | :--- | ---: | ---: |
  | `GameShell.tsx`（新/旧） | 592 / 973 | **591 / 972** |
  | `hooks/useAiGame.ts` | 486 | **485** |
  | `hooks/useAiGame.test.ts` | 177 | **176** |
  | `online/RoomContext.tsx` | 37 | **36** |
  | `online/OnlineLobbyView.tsx`（新/旧） | 192 / 889 | **191 / 888** |
  | `lobby/LobbyLeaderboard.tsx` | 221 | **220** |
  | `lobby/LobbyMatchmaking.tsx` | 101 | **100** |
  | `lobby/LobbyProfilePanel.tsx` | 155 | **154** |
  | `lobby/LobbyPublicChat.tsx` | 77 | **76** |
  | `lobby/LobbyRoomList.tsx` | 181 | **180** |
  | `lobby/LobbyUsersPanel.tsx` | 84 | **83** |
  | `STATUS.md:43` GameShell | 592 | **591** |
  | phase2 handoff §2.4 基线 | 1776 | **1775** |

- **期望行为**：文档规模数据来自交付后的 `wc -l` 实测（同一次修复在 Phase 2 handoff 的 6 个目标文件上已用实测值，证明该口径可行）。
- **根因**：Phase 3 文档行数改用"编辑器视图行数"口径（恒比 `wc -l` 多 1），未与 Phase 2 统一的实测口径对齐。
- **影响范围**：仅文档可信度与阶段基线对比，无功能影响。
- **验证证据**：对 11 个新/改文件与 2 个基线文件逐个 `wc -l`；phase2 六个目标文件在 `785c8d4` 实测与文档一致（反证口径差异确实存在于 Phase 3 文档）。
- **修复建议**：以 `wc -l` 重算并更新上述表格与正文，同时修正 phase2 handoff 的基线值 1775。
- **修复后验收标准**：全部声明行数与 `wc -l` 一致（含基线值）。

### P3-2：`STATUS.md`「最新交付提交」仍指向 Phase 2 提交，与本次 Phase 3 交付不一致
- **严重级别**：P3（权威基准失真；Round-2 P3-1 同类问题的新形态）
- **文件与行号**：`STATUS.md:11`
- **触发条件**：任何人以 `STATUS.md` 作为"唯一权威动态事实基准"核对最新交付版本时。
- **实际行为**：`STATUS.md:11` 声明最新交付为 `785c8d4`（Phase 2）；而本次交付提交为 `b45e3fb`（Phase 3），且 `STATUS.md:43` 与 §4 已记载"Phase 3 已完成"，文档内部自相矛盾。
- **期望行为**：`最新交付提交` 指向该阶段实际交付提交，且在 `git log main` 可达。
- **根因**：同一提交无法自引用自身 SHA，交付时未采用"随提交后补 / 引用阶段标签"的收敛方式，直接沿用了上一阶段 SHA。
- **影响范围**：仅文档与协作可信度；`785c8d4` 本身可达（已不再是 Round 2 的游离提交问题）。
- **验证证据**：`git rev-parse HEAD` = `b45e3fb`；`STATUS.md:11` 文本；`STATUS.md:43` 已列 Phase 3 里程碑。
- **修复建议**：将 `STATUS.md:11` 更新为 `b45e3fb` 并在后续提交中固化；或在 §1 增加"当前 HEAD（以 `git rev-parse HEAD` 为准）"与"阶段交付提交"双字段以消除自引用死结。
- **修复后验收标准**：`最新交付提交` 与该阶段实际交付提交一致且可达，文档内部无矛盾。

### P3-3：i18n `ai.thinking` 在 6 个语种中成为孤儿键（与 P2-1 同源）
- **严重级别**：P3（死翻译条目 / 维护误导）
- **文件与行号**：`src/i18n/dictionaries.ts:38`（类型）、`:267`(en)、`:491`(zh)、`:715`(fr)、`:939`(es)、`:1163`(ru)、`:1387`(ar)
- **触发条件**：开发者检索 `ai.thinking` 的用途，或执行 i18n 键收敛时。
- **实际行为**：6 个语种均定义了该键，但全仓无任何组件消费（P2-1 删除唯一消费点）。
- **期望行为**：键与消费点一致（要么恢复 UI 展示，要么移除键）。
- **根因**：P2-1 的行为删除未同步处理 i18n 资产。
- **影响范围**：翻译资产冗余；不影响功能。
- **验证证据**：`grep -rn "ai\.thinking|thinking" src/` 仅命中 `dictionaries.ts`。
- **修复建议**：优先按 P2-1 恢复消费；若确认该提示不再需要，则从 6 个语种与类型声明中一并删除（需保持六语种齐备，符合 `AGENTS.md` §1.2）。
- **修复后验收标准**：不存在无消费点的 i18n 键，六语种键集一致。

---

## 6. 待确认风险

| # | 风险描述 | 怀疑依据 | 缺失证据 | 建议验证方法 |
| :- | :--- | :--- | :--- | :--- |
| **R1** | 门禁 3（`npm test`）在本审查环境**完全无法运行**，28 套件 / 242 用例全绿结论未获独立复验 | `npx vitest run` → **任意文件均失败**：`TypeError: Cannot read properties of undefined (reading 'config')`（连纯常量用例亦失败，与本次 diff 无关）；本机 Node **v25.8.0**，而 `STATUS.md:13` 声明 Node v24.x；vitest 4.1.9 + vite 8 在 Node 25 上疑似不兼容；`--pool=forks` / `--pool=threads --no-file-parallelism` 均失败 | 可复现的 runner 环境 | 在 Node 24 环境复跑 `npm test`；或先定位本机 runner（此为 Round-2 R1 的**未解决残留**） |
| **R2** | `clearClosedRoom` 由"setState updater 内 `currentRoom`"改为"`roomRef.current`（上次已提交渲染值）"判定 `isCurrentRoom`，理论存在判定滞后窗口 | `useRoomSocket.ts:131` 用 `roomRef.current`，而 `roomRef` 在 `:111` 的 effect 中于渲染提交后更新；旧实现用 updater 参数（保证最新） | 同一批次内 `room:closed` 与房间状态更新并发到达的实证 | 构造"先 `setRoom` 再同 tick 触发 `clearClosedRoom`"的集成用例；当前受服务端广播范围（`room:closed` 仅向该房频道）与 `socket.join/leave` 时序约束，判定为不可达，残余风险极低 |
| **R3** | `room?` 改为可选后，编译器不再强制提供 room；未来新增消费方若既不在 `RoomProvider` 内也不传 `room`，将在**运行时**抛错而非编译期报错 | `RoomContext.tsx:29-35` 的 `useOptionalRoomContext` | 该设计导致的真实事故样本 | 属验收标准 #2 显式要求的兼容设计，记录为设计权衡；如需强约束可在面板内改用必需的 `useRoomContext()` 并仅在最外层保留可选解析 |
| **R4** | `canCreate` 回退分支缺少 `matchmakingStatus !== "searching"` 判定 | `useFriendRoom.ts:168` 的 `?? (enabled && identityReady && !roomSocket.room)`，仅在 `lobbyPresenceRef.current` 为 null（首帧 effect 落地前）生效 | 首帧程序化调用 `createRoom` 的可行性 | 实际不可达（createRoom 由用户点击触发，首个 effect 必已提交）；如需确证可断言 ref 首帧已填充 |

## 7. 未验证项与残余风险

- **已独立执行**：`npx tsc --noEmit`（0 错误）、`npm run lint`（0 错误 0 警告）、`npm run build`（成功，11/11 静态页）、§4-V1~V8（22 项断言全 PASS，含 V2 码点边界、V4/V5/V6 负向路径、V7 选择器集合比对）。
- **未能独立执行**：
  - `npm test` —— 环境 runner 故障（见 R1）；残余风险：新增/改造测试的"全绿"未获独立复验（但已用等价的 `tsx` 断言逐条复现，覆盖新增用例的相同路径与更严边界）。
  - `npm run verify:online` / `smoke:lobby` / `smoke:matchmaking` / `smoke:lobby-ui` —— 需起服务未复跑；已用 V7 静态证明选择器集合与基线逐项一致，残余风险低；但**未做浏览器级 Context 渲染回归**（`OnlineLobbyView` 子面板同时经 props 与 Context 双路径解析，理论存在 provider/prop 不一致时的隐性问题，当前二者同源，无分歧）。
  - 浏览器级 Hook 渲染（无 jsdom / 无 @testing-library）—— 见 R2/R3。
- **残余风险总评**：**低**。唯一确定性行为回归为 P2-1（一处状态文案），其余为文档准确性；核心功能（AI 编排纯函数、房间关闭时序、选择器契约、门禁 build/type/lint）经独立核验无缺陷。

## 8. 推荐修复顺序

1. **P2-1**（恢复 `isThinking` 文案分支）—— 一处三元表达式，成本最低，直接消除唯一阻塞项。
2. **P3-3**（与 P2-1 同源：维持键-消费点一致）。
3. **P3-1**（以 `wc -l` 重算全部行数声明，含 phase2 基线 1775）。
4. **P3-2**（`STATUS.md:11` 收敛到本阶段交付提交，或引入"当前 HEAD / 阶段交付提交"双字段）。
5. **R1**（定位并修复本机 vitest runner，恢复门禁 3 可复跑性——已跨两轮遗留）。

## 9. 下一轮复审验收标准

1. AI 模式下 `isAiThinking` 为真时侧栏渲染 `dictionary.ai.thinking`（六语种），`grep` 存在真实消费点，或经明确决策移除该文案与 6 个语种键。
2. `docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md` 与 `STATUS.md:43` 的全部行数声明与 `wc -l` 一致；phase2 handoff 基线值修正为 1775。
3. `STATUS.md:11` 的 `最新交付提交` 与本阶段实际交付提交一致，且 `git log main` 可达、文档内部无矛盾。
4. `npx tsc --noEmit` / `npm run lint` / `npm run build` 保持全绿；并在**可复现环境**中复跑 `npm test`（定位 R1 runner 故障）与三项联机烟测。
5. P2-1 修复提交的 diff 不得夹带无关改动；如对 `useAiGame` 行为有进一步调整，需补充针对 Hook 竞态/看门狗的最小化测试。
