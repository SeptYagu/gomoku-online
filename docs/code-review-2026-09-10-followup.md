# 代码评审（复审）— 最新修复提交 `7be68a2` / `d69d0bd` / `f30e273`

- 日期：2026-09-10
- 范围：`aa9b142..f30e273` 三个修复提交（M1/M2、M3、M4/M5/m6/m7）+ 工作区未提交改动
- 方式：diff 精读 + 调用链回溯 + 依赖源码核对（React 19.2.7 / socket.io-client 4.8.3）
- 结论：**无 Critical**。M1/M2/M3 修复扎实且带测试；M4/M5/m6/m7 的修法引入了 **2 个新的 Major 级副作用**（R1 模式被 URL 反向改写、R2 聊天在途闸门可永久锁死），建议在下一迭代优先处理。
- 当前状态（滚动）：R1/R2（`e14ec7e`）、R3/R4/R5 + R7（`5056016`）、R8（`2a2c2b6`）均已修复并通过变异复核；R6 为有意取舍（部分保留）；只剩 R9（超时后的服务端/客户端短暂不一致）一项未修，属 R4 的既定取舍。

## 修复进展（滚动更新）

| 项 | 状态 | 落地方式 |
|---|---|---|
| R1 模式快照被 URL 反向改写 | ✅ 已修 | `readGameModeFromUrl` 补 `bootGameModeCache ??=`，与另外四个 `boot*Cache` 对齐；「启动快照」真正只读一次，`clearRoomUrl()` 不再反向改模式 |
| R2 聊天在途闸门可永久锁死 | ✅ 已修 | 新增 `src/components/chat-send-gate.ts`：同步闸门 + 8s 看门狗，房间聊天与公聊共用；配 4 条单测 |
| R3 超时文案硬编码英文 | ✅ 已修 | `GameShell` 将六语种 dictionary 中的聊天/离房超时文案注入 `useFriendRoom`，hook 保留英文默认值供独立调用 |
| R4 超时后迟到 ack 与 `left=false` 冲突 | ✅ 已修 | 新增一次性 `leave-room-attempt`；只有首次 `settle()` 能应用 ack 副作用，超时后的迟到 ack 直接忽略 |
| R5 leaveRoom 计时器无卸载清理 | ✅ 已修 | hook 卸载时 settle 当前离房尝试并清掉看门狗，同时清理两个聊天闸门 |
| R6 启动快照缓存为模块级 `let` | 🟡 部分（有意） | boot mode 已改成 `createBootGameModeReader()` 的实例闭包（可注入搜索串、可测）；`useFriendRoom` 里另外四个 `boot*Cache`（`:1446-1483`）仍是模块级 `let`，同一页面生命周期内只读一次是刻意取舍 |
| R7 新代码零测试 | 🟡 已修（模块级） | 聊天闸门 4 条、离房尝试 3 条、boot mode 快照 3 条单测，覆盖重入、超时/迟到 ack、URL 变更后的快照稳定性。**注意**：覆盖的是三个纯函数模块自身的语义；hook 里的接线（谁调用 `settle()`、卸载时是否真的 settle）因仓库无 jsdom / testing-library 仍无测试 |
| R8 连接/加入失败文案仍是英文 | ✅ 已修 | `2a2c2b6`：`connectionFailed`（含 `{message}` 占位符）/`connectionFailedXhr`/`roomCodeRequired`/`joinTargetRequired`/`roomError` 进 `dictionary.room` 六语种；socket 建一次用 `messagesRef` 跟随语言。另补 `dictionaries.test.ts` 断言 key 与占位符六语种一致 |
| R9 超时后「服务端已离开、客户端仍认为在房间」 | ⏳ 未修（取舍） | R4 改成忽略迟到 ack 之后，若丢的只是 ack 而服务端其实已处理，本地房间状态会滞留到用户再次点离开；重试会重新 emit 并自愈，期间 UI 与服务端短暂不一致 |

### 复核（提交 `5056016`，2026-09-10）

**复核方式：变异测试** —— 把每条修复逐条「改回坏的样子」，新测试必须失败，否则断言为空转。三处变异都在 `.tmp/` 里临时改一处源码、跑单测、再 `git checkout --` 还原（复核后 `git status` 干净）：

| 变异 | 新测试 | 证据 |
|---|---|---|
| `client-boot-state.ts` 的 `cache ??=` 改回 `cache =`（退化成每次重读 URL） | ❌ 1 失败 / 3 | `keeps the first browser snapshot after the URL changes` → `expected 'local' to be 'room'` |
| `chat-send-gate.ts` 不挂看门狗 | ❌ 2 失败 / 4 | `resets and reports the timeout once when the server never acks` 等 → `onTimeout` 被调用 0 次 |
| `leave-room-attempt.ts` 去掉 `pending` 守卫（`settle()` 恒返回 true） | ❌ 2 失败 / 3 | `settles once when the ack arrives before the timeout` → `expected true to be false` |

结论：**R1/R2/R3/R4/R5 的修法成立，无假修复、无新回归**；三处新测试在坏代码上确实会失败，不是空转断言。R4 的调用侧守卫还额外扛住了「迟到 ack 毒害下一次请求」——ack 回调同时校验 `leaveRoomRequestRef.current === request` 与 `settle()`，已被替换的旧请求不会改写新请求的状态。

### R1 修法说明

只做了一件事：把 `readGameModeFromUrl` 的读取结果缓存住（`bootGameModeCache ??=`）。这样「启动快照」= 页面加载时的 URL，之后 `syncRoomUrl` / `clearRoomUrl` 的 `history.replaceState` 不再反向改写模式，行为回到 M5 重构之前的语义（旧实现在 `useState` 初始化器里读一次 URL，之后固定），同时保留 `useSyncExternalStore` 带来的水合一致性。

**没有**再加「离开房间时显式 `setMode("room")`」：快照定住之后，`pendingTransition.nextMode = null` 的语义自然成立（留在 online-lobby），多写一处反而多一个状态来源。

### R2 修法说明

`socket.io` 的 ack 只有 `.timeout()` 产出的才带 `withError`，断线时其余的会被 `_clearAcks()` 直接丢弃 —— 所以「emit 前置在途闸门」必须自带看门狗，否则一次网络抖动就能把发送按钮永久锁死。闸门抽成 `createChatSendGate()`：`begin(onTimeout)` 同步判重入并挂看门狗，`settle()` 幂等复位。超时回调负责复位按钮状态、把内容放回输入框并提示，尽量不丢用户输入。

语义说明：若 socket 处于断开状态，socket.io 会把包缓冲到 `sendBuffer`，重连后仍会发出并回调 ack；看门狗 8s 对这种情况属「可能偏早」，但换来的是「绝不可能永久锁死」，取舍明确。

## 验证

| 项 | 结果 |
|---|---|
| `npx vitest run` | 20 文件 / **188 测试全通过**（复核时复现，6.5s） |
| `npx tsc --noEmit` | ✅ 已复跑：**恰好 8 条基线错误**（`game-record-export.test.ts` 1 / `game-record-opening-analysis.test.ts` 1 / `room-socket.test.ts` 6），分布未变、无新增 |
| `npx eslint`（本次改动的 8 个文件） | ✅ 退出码 0，无输出 |
| 变异测试（见上一节） | ✅ 三处新测试在坏代码上均失败，无空转断言 |
| 浏览器冒烟 | ⚠️ 仍无法执行（sandbox 阻止本机端口 / `next dev` 起不来），需人工确认：① `/?room=XXXXXX` 进房后点「离开房间」应留在联机大厅而非被丢到本地棋盘；② 断网发一条聊天，8s 内按钮自恢复且内容回填输入框；③ 断网点「离开房间」，8s 后应提示超时且**不**出现「房间已退但提示失败」的矛盾 |

### 验证（R8 轮，`2a2c2b6`）

| 项 | 结果 |
|---|---|
| `npx vitest run` | ✅ **24 文件 / 221 测试全通过**（本轮新增 6 文件 33 条：jsonl-file 5 / client-address 6 / dictionaries 3 / ai-worker-request 10 / accounts +2 / game-records +2 / rate-limit +3 / sgf +2 / table-ui-state 改 1 条） |
| `npx tsc --noEmit` | ✅ 仍是**恰好 8 条基线错误**，分布未变、无新增 |
| `npx eslint`（本轮改动的 25 个文件） | ✅ 退出码 0，零警告 |
| 浏览器冒烟 | ✅ 公开站实测通过：阿拉伯语页面真实离房超时后 `room-error` 使用当前语言；被请求悔棋时 Leave 存在且启用。OpenResty 已确认，`GOMOKU_TRUST_PROXY=1` 仍需登录主机核实 |

---

## Major

### R1. 模式快照其实是「活的」：离开房间后 URL 变化会把 mode 从 room 静默改成 local
- 位置：`src/components/client-boot-state.ts:35-43`（`readGameModeFromUrl`，**唯一没有 `??=` 缓存**的快照）、`src/components/useFriendRoom.ts:926`（`leaveRoom` 成功分支调用 `clearRoomUrl()`）、`useFriendRoom.ts:1528-1537`、`useFriendRoom.ts:283-300`（`clearClosedRoom` 同样调 `clearRoomUrl()`）、`src/components/GameShell.tsx:234-247`（`handleOnlineLeaveRequest` → `nextMode: null`）
- 问题：文件头注释写「启动快照只在页面加载时读一次」，但只有另外四个快照用 `boot*Cache ??=` 做了缓存；`readGameModeFromUrl()` 是**每次渲染都重读** `window.location.search`。React 19 的 `updateSyncExternalStore` 在非水合路径下会执行 `getSnapshot()` 并与 `hook.memoizedState` 比较，不同就立刻以新值渲染（`react-dom-client.development.js:8176-8192`）。
- 触发链（无需用户切模式）：
  1. 用户从 `/?room=ABC123` 进房（`modeOverride === null`，`mode = bootMode = "room"`）；
  2. 房间内点「离开房间」→ `pendingTransition = { kind:"online", nextMode: null }` → 确认 → `leaveRoom`；
  3. 服务端 ack 成功 → `clearRoomUrl()` 把 `?room=` 从地址栏抹掉 → `setRoom(null)` 触发重渲染；
  4. 该次渲染中 `readGameModeFromUrl()` 返回 `"local"` ≠ 上一快照 `"room"` → **mode 变成 local**。
     `deriveGameWorkspace` 随之返回 `"local"`（`workspace-state.ts:11-21`），用户被丢到本地棋盘。
- 后果：① 与 `nextMode: null`（「只离开房间、留在联机工作区」）的语义直接冲突，用户看不到设计好的 `online-lobby`（创建/加入房间入口）；② 未走 `completeModeChange`，不重置棋盘、不走确认流程，属于静默状态跳变；③ 对手关房触发的 `room:closed` → `clearClosedRoom` 路径同样中招。
- 建议（任选其一）：
  ```ts
  // client-boot-state.ts —— 与另外四个快照保持一致
  let bootGameModeCache: GameMode | null = null;
  function readGameModeFromUrl(): GameMode {
    bootGameModeCache ??= /* 原实现 */;
    return bootGameModeCache;
  }
  ```
  或反向修：离开房间时显式固定模式（`GameShell` 在 `nextMode === null` 的分支里 `setMode("room")`），让「留在联机工作区」成为显式决策而不是 URL 副产物。二者建议都做。

### R2. 聊天在途闸门没有 ack 超时 → 断线一次就永久禁用发送
- 位置：`src/components/useFriendRoom.ts:809-834`（`sendChatMessage`）、`useFriendRoom.ts:838-871`（`sendPublicChatMessage`）；闸门即 `chatSendInFlightRef` / `publicChatSendInFlightRef`（`:212-213`）
- 问题：`ensureSocket().emit(ev, payload, cb)` 不带 ack 超时（全仓 `grep '\.timeout('` 无命中）。socket.io-client 4.8.3 的 `Socket#_clearAcks()` 在断线时只回调**带错误参数的** ack（`.timeout()` 产生的 `withError`），普通 ack 回调被**静默丢弃**（`node_modules/socket.io-client/build/cjs/socket.js:480-490`）。
- 触发：emit 之后、ack 之前发生断线 / 服务端重启 / 网络抖动丢包 —— `chatSendInFlightRef.current` 永远停在 `true`，`isSendingChat` 同样停在 `true`，发送按钮 **永久禁用且重连不恢复**，只能刷新页面。公聊同病。
- 这是 M4「可重复发送」修法的反面：从「多发一条」变成「彻底发不出去」，且 `leaveRoom`（m7）已经加了 8s 兜底，此处缺同一道保险，属明显不一致。
- 建议：
  ```ts
  ensureSocket()
    .timeout(CHAT_ACK_TIMEOUT_MS)          // socket.io >= 4.4
    .emit("room:chat-send", payload, (err: Error | null, response: RoomAck) => {
      chatSendInFlightRef.current = false;
      setIsSendingChat(false);
      if (err) { setError(...); setChatText((c) => (c ? c : text)); return; }
      applyRoomAck(response);
      if (!response.ok) setChatText((c) => (c ? c : text));
    });
  ```
  注意 `.timeout()` 会让回调多出首个 `err` 参数，现有 `(response: RoomAck) =>` 签名与 `RoomSocket` 类型需同步放宽。也可退一步：用看门狗计时器 + `socket.on("disconnect")` 复位这两个 ref/state。
- 补充建议：把「在途闸门 + settle-once + 超时」抽成纯函数 helper（本仓已有 `interaction-guards.test.ts` 这类纯函数测试范式），否则这两处竞态永远拿不到回归测试。

---

## Minor

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| R3 | `useFriendRoom.ts:902` | 超时文案硬编码英文 `"Leaving the room timed out. Please try again."`，会直接渲染到 `room-error`（`OnlineLobbyView.tsx:56,257`、`TableSidebar.tsx:35`），六语种应用里是明显破窗 | 进 `dictionary.room`，与 `dictionary.controls.cancel` 等同级 |
| R4 | `useFriendRoom.ts:894-919` | 超时后**迟到的 ack 仍会执行清理**（`clearRoomSession/clearRoomUrl/setRoom(null)`），但 `finish()` 已 settled → 调用方收到 `left=false`、`pendingTransition` 保留（弹窗仍开着），而房间其实已退。UI 与实际状态相反 | 把副作用一并纳入 settled 判断，或超时后只提示、把清理留到 ack（`finish` 里再加 `if (settled) return` 的等价守卫） |
| R5 | `useFriendRoom.ts:916` | 8s 计时器无卸载清理，组件在窗口期内卸载会触发一次迟到的 `onComplete`（React 18+ 已不告警，低危） | 用 `useEffect` 持有并在 cleanup 里 `clearTimeout`，或接受现状并注释说明 |
| R6 | `useFriendRoom.ts:1404-1440` | 四个启动快照缓存是**模块级 `let`**：生命周期 = 整个页面（客户端路由跳转不重置），测试之间也不隔离；`bootIsJoiningRoom` 缓存的是「首次读取时的 URL 状态」，而 `getRoomCodeFromCurrentUrl()` 是活的，URL 变化后两者可能长期不一致 | 挪进实例（`useRef`）或在订阅/清理时重置；至少补注释说明「同一页面生命周期内只读一次」是有意为之 |
| R7 | 新增代码整体 | M4/m6/m7 + `client-boot-state.ts` **零测试覆盖**，而 M1/M2/M3 都补了测试 | 至少覆盖：闸门重入（同一 tick 连点只发一次）、超时 settle-once、`readGameModeFromUrl` 在 URL 变更后的取值 |

## Nit

- `aria-busy` 加在 `<form>` 上、输入框仍可编辑，语义上更像「提交中」而非「忙碌」；现状可接受。
- `DEFAULT_PLAYER_NAME`（新）与 `useFriendRoom.ts:1482` 的硬编码多语言默认名列表并存，建议收敛到一处（承接上一轮 Nit）。
- `.gitignore` 未覆盖 `.workbuddy/`、`.codex/`、`.codex-remote-attachments/`、`tsconfig.tsbuildinfo` → `git status` 长期噪声，建议补四条忽略规则。

## 对上一轮报告结论的复核

- **M3 更正成立**：`rankCandidateMoves`/`getCandidateTier` 把 `attack.wins/defense.wins` 锁在 tier 0/1，必胜/必挡点必然落在 top-N 内，原「被截断丢弃」不成立。改为在全量 `candidatePool` 上做战术判定的价值确在**解耦**（战术判定不再依赖排序/截断/分片），代码正确、代价可忽略（`findWinningMoves` 仅逐点试五连）。
- **M5 方向正确**：`useSyncExternalStore` + 「覆盖值 ?? 启动快照」确实消除了水合不一致，且没有 effect 内 setState（符合本仓 `react-hooks/set-state-in-effect` 约束）；`getOrCreatePlayerId()` 等 storage 读取已全部退到回调内（`:270`），渲染期不再有 `window` 副作用。问题在 R1 的缓存实现细节。
- **m6/m7 判定正确**：`pendingTransition` 期间 pill 禁用 + `handleModeChange` 早退；`confirmPendingTransition` 走的是独立分支，不会被该早退误伤。

## 建议优先级

1. **R2**（聊天永久锁死，一行 `.timeout()` 即可修，风险最低收益最高）；
2. **R1**（离开房间被踢到本地棋盘，属用户可见的状态跳变；建议缓存 + 显式 `setMode("room")` 双管齐下）；
3. R4/R3（超时语义与文案）；
4. R7（给闸门/超时补测试，防止下次重构再踩）；
5. R6/R5 + Nit。
