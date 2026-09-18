# 访客身份持久化、30天滑动TTL与全链路静默自愈 · 独立代码审查 Round 2 报告（源码实现复查）

> **审查日期**：2026-09-18
> **审查轮次**：Round 2（针对 Round 1 缺陷修复的增量复查）
> **被审 HEAD**：`2c1fba6`（`fix(accounts): resolve round 1 code review findings for guest identity and compaction`）
> **基准提交**：`cb01d11`
> **审查范围**：`git diff cb01d11..2c1fba6`（17 文件，+1265/−49）；复查增量 `cbb44e3..2c1fba6`（修复提交）
> **判定结论**：**未通过**（0×P0/P1/P2，**4×P3**，均需修复闭环）

---

## 一、审查基本信息与通过项简述

- 版本核对：`git pull --ff-only` 后 HEAD = `2c1fba69f6be42ae016705bfe9982c7574627378`（与指定被审 SHA 一致），基准 `cb01d110ff9a28ca38fb9119e6fb8b3a6c4bdc26`；工作区干净，本轮未修改任何产品代码/测试（变异探针已 100% 复原，`git status --porcelain` 为空）。
- **Round 1 缺陷修复有效性（代码层面均成立）**：P2-1 压缩记账语义修复经独立 spy 探针实测有效（存活 15 行 / 阈值 10 下 5 次落盘 = 5 次纯追加、**0 次 rewrite**；死行 185 行超阈值时仍**恰 1 次** rewrite 且行数自 200 收拢至 20，即"写放大消除"未把压缩一并关掉）；P3-1 服务端抑制（`room-socket.ts:1092-1096`）与 P3-2 重连改走 `clearClosedRoom`（`useRoomSocket.ts:273`）、P3-3 坏行容忍用例重写（`accounts.test.ts:433-465`，已改为"真实 token 反向鉴权 + 未知 token 返回 null"）经代码路径核验与探针均闭环；P3-4 `presence:join` 回传并客户端落盘经探针实测成立（3 次模拟匿名页面加载 → `guest-sessions.jsonl` 恒为 **1 行**、token 三次一致）。
- 门禁独立复跑：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`vitest run` **32 套 / 297 例全绿**（与交接单声明一致）；`npm run build` 本轮**未**复跑（见 §三-3）。
- 本轮独立验证：自建 **4 项运行时探针 + 1 项变异探针 + 1 项压缩边界探针**，其中 3 项成功触发反例（见 §二）。

---

## 二、审查发现与缺陷清单

### P3-1 新增的 P2-1 压缩守门单测为恒真断言：变异探针不变红，写放大回归处于零守门状态

**文件与行号**
- `src/server/accounts.test.ts:401-431`（新用例 `does not rewrite file on every persist after loading a file with entries >= compaction threshold`；关键断言在 `:426-427`）
- 被守护的实现：`src/server/accounts.ts:461`（`this.compaction.reset(this.sessionsByPlayerId.size, lineCount)`）、`src/server/accounts.ts:476-478`、`src/server/accounts.ts:494`、`src/server/jsonl-file.ts:98-111`

**触发条件**：将 `JsonlCompactionTracker.reset()` 回退为 Round 1 P2-1 的缺陷语义（`appended` 恒等于文件总行数 / 存活行数），即"文件行数 ≥ 阈值后每次落盘都全量重写整份日志"。

**实际行为**：该用例**仍然通过**；`accounts.test.ts` 全量 16 例亦全部通过。Round 1 报告 §四 的复审验收标准明文要求"变异探针（把 `reset(0)` 改回 `reset(lineCount)`）必须使该用例变红"，该条件**未达成**。

**期望行为**：压缩守门量必须对"压缩触发频率"敏感——回退语义后用例变红。

**根因**：断言的物理量选错。用例只断言"5 次 `createSession` 后文件行数 = `initialLines + 5`"，而**该等式在压缩与不压缩两种实现下恒成立**：`compactFile()` 重写的永远是"存活会话集合"，每次 `createSession` 恰使存活数 +1，因此即便每次落盘都全量重写，末态行数仍是 20。换言之，该断言只能发现"压缩丢行/多行"，对"压缩频率（写放大）"零敏感度——与被 Round 1 判定为 P3-3 的 `expect(store).toBeDefined()` 属同一类恒真断言。

**影响范围**：Round 1 P2-1 的代码修复本身有效（§一 已实测），但其唯一回归守门无效。任何后续改动（例如丢掉 `reset` 的第二参数、或在 `compactFile()` 传 `totalLines`）都能让 50k 规模下单次 ≈60ms 的事件循环阻塞静默复活，且现有 297 例测试全绿、无任何红灯。

**复现方法 / 运行证据**（全部实测于本机 `D:\OneDrive\AiPrograms\gomoku-online`）
1. 临时把 `src/server/jsonl-file.ts` 的 `reset()` 覆写为修复前语义 `this.appended = Math.max(0, Math.floor(liveLines));`（语义验证：`threshold=10` 下 `reset(15,15)` 后连续 3 次 `noteAppend()` 返回 `[true,true,true]`，与 Round 1 报告实测完全同形）。
2. `npx vitest run src/server/accounts.test.ts -t "does not rewrite file on every persist"` → **`1 passed`（未拦截）**。
3. `npx vitest run src/server/accounts.test.ts` → **`16 passed`（未拦截）**。
4. 同一变异下改换守门量（`vi.mock` 包裹 `rewriteJsonlFile` 计数）→ 断言 `rewrites === 0` **变红**，实收 `rewrites = 5`（证明"重写次数"才是有效观测量）。
5. 恢复原实现（`diff` 与 HEAD 逐字节一致）后 → 32 套 / 297 例全绿。

**修复建议**
- 守门量改为"重写次数"：`vi.mock("./jsonl-file", ...)` 包裹 `rewriteJsonlFile`（或对该模块命名空间 spy），在"加载 ≥ 阈值文件后连续 5 次 `createSession`"场景断言 `rewrites === 0` 且 `appends === 5`。
- 同步补一条反向边界用例，防止"消除写放大"演变为"彻底关闭压缩"：构造 live=15 / `lineCount`=200 / threshold=10 的文件，断言恰 1 次 rewrite 且末态行数为 20（本轮 PROBE-BOUNDARY 实测该实现满足此性质，可直接固化为用例）。

**修复后验收标准**：将 `reset()` 回退为 `appended = liveLines` 时，新增/改写用例必须变红；恢复正常实现后全绿；边界用例在"死行超阈值"时断言恰 1 次重写且文件被收拢。

---

### P3-2 公聊自愈重发分支在 Ephemeral 标签页**必然二次失败**，仍向用户上屏 `guest-session-invalid` 红字（Round 1 P3-1 未真正闭环）

**文件与行号**
- `src/components/hooks/useRoomChat.ts:143-163`（重发分支，问题在 `:144-149`：`clearGuestToken()` 后重新调用 `getActivePlayer()` 组装 payload）
- `src/components/hooks/room-state-utils.ts:384-396`（`clearGuestToken` 在 ephemeral 下**故意**跳过 localStorage）、`:372-382`（`readGuestToken` 回落读取 localStorage）
- `src/components/hooks/useRoomSocket.ts:127-131`（`getActivePlayer()` → `guestToken: readGuestToken() ?? undefined`）
- `src/server/room-socket.ts:634-641`（`resetGuestIdentity` 时**只采信** payload 的 `guestToken`，不铸造新会话）

**触发条件**：① 标签页已被 `markEphemeralSession()` 标记（多开 `duplicate-player` 冲突后由 `useRoomSocket.ts:365/428` 置位；`clearEphemeralSession()` 全仓 0 引用，故该标记在标签页生命周期内不可逆）；② 服务端会话整体失效（部署未挂载 `data/`、50k LRU 淘汰、30 天过期）；③ 用户在公聊面板发送消息。

**实际行为**：首发带回落的 localStorage 主 token 发送 → `guest-session-invalid` → `clearGuestToken()` 因 `shouldBeEphemeral()` 为真**只清 sessionStorage** → `getActivePlayer()` → `readGuestToken()` **再次回落读出刚被"清掉"的失效主 token** → 重发 payload 携带**同一个死 token** 且 `resetGuestIdentity: true` → 服务端按 `room-socket.ts:639-641` 只采信 payload token、不铸新会话 → 二次返回 `guest-session-invalid` → `useRoomChat.ts:153` `setError(retryResponse.error.message)` → 界面显示 `Guest session is invalid. Start a new guest session.` 红字。**验收标准 4 的"绝不向用户展示 guest-session-invalid 红字"在该场景不成立，且用户无法自行恢复（该标签页后续每次公聊都会重复此循环）。**

**期望行为**：与其他 6 条自愈链路一致——重发时**显式构造**不带 `guestToken` 的新身份 payload（`{ playerId: createAndPersistPlayerId(...), playerName, resetGuestIdentity: true }`），由服务端铸造新会话并静默完成；不因 ephemeral 清理短路而复用刚被判废的凭证。

**根因**：`useRoomChat` 是全部自愈点中**唯一**用 `getActivePlayer()` 重建重发 payload 的一处（其余 `useRoomSocket.ts:310-314`、`:368-372`、`:431-435`、`useLobbyPresence.ts:185-189`、`:388-392` 均为显式构造）。`getActivePlayer()` 会重新读存储，恰好把 ephemeral 语义下"故意不清理"的 localStorage 主凭证复活，与 `clearGuestToken()` 的语义直接冲突。

**影响范围**：分身标签页（本项目刻意支持的"同机双开对弈"路径）在服务端会话失效后，公聊永久无法自愈并持续外溢红字；主标签页不受影响（清理会同时清掉两处存储，实测可正常自愈），故问题被"单标签页测试"天然掩盖。

**复现方法 / 运行证据**
- PROBE-2（存储层，实测）：ephemeral 标记 + localStorage `gomoku-guest-token = dead-primary-token` + sessionStorage 分身 token → `clearGuestToken()` → `readGuestToken()` 返回 **`'dead-primary-token'`**（localStorage 中原值仍在）。即重发 payload 必然携带失效凭证。
- PROBE-3（真实 Socket.IO 服务端实测）：`public-chat:send` 无 token + `resetGuestIdentity:true` → `{ ok: true }`（可自愈）；携带失效 token + `resetGuestIdentity:true` → `{ ok: false, error: { code: 'guest-session-invalid' } }`（**自愈失败**）。两半拼合即"必然二次失败 + 红字上屏"。

**修复建议**：将 `useRoomChat.ts:144-149` 改为显式构造 payload（对齐 `useRoomSocket.ts:310-314` 写法），并复用 `createAndPersistPlayerId` / `isEphemeralSession`；`clearGuestToken()` 的调用保留即可。

**修复后验收标准**：ephemeral 标签页（sessionStorage 无 token、localStorage 留存失效主 token）+ 服务端会话失效场景下发送公聊：`room:error` 计数 0、**重发成功且 `setError` 未被调用**、消息写入快照；变异探针（把 payload 改回 `getActivePlayer()`）必须变红。

---

### P3-3 公聊自愈重发绕过 `ChatSendGate`：ack 被静默丢弃时发送按钮**永久锁死**

**文件与行号**
- `src/components/hooks/useRoomChat.ts:146`（`setIsSendingPublicChat(true)`）与 `:147-162`（重发 emit 既未 `gate.begin()`、也无任何超时兜底）；对照 `:139` 已 `gate.settle()`
- 契约来源：`src/components/chat-send-gate.ts:1-13`（该文件存在的唯一理由即"防永久锁死"）
- 用户可感后果：`src/components/online/lobby/LobbyPublicChat.tsx:61-64`（按钮 `disabled` 依赖 `room.isSendingPublicChat`）

**触发条件**：公聊首发失败进入自愈分支后，**重发 emit 的 ack 永不到达**（服务端重启、网络抖动、丢包 —— `chat-send-gate.ts:9-12` 明确记录"Socke.IO 断线时会静默丢弃普通 ack 回调"）。

**实际行为**：`:139` 的 `gate.settle()` 已取消首发看门狗并使闸门复位，重发不经 `begin()` 因而**无任何超时兜底**；`isSendingPublicChat` 保持 `true`，公聊发送按钮 `disabled` 恒为真。`refreshPublicChat()` 与 `resetChatOnRoomClosed()` 均不复位该 state，重连也不会恢复——即用户必须刷新页面。

**期望行为**：任何一次 emits 都必须在闸门内（`begin()` 挂 `CHAT_ACK_TIMEOUT_MS` 看门狗），超时后复位 `isSendingPublicChat` 并给出可重试状态。

**根因**：修复分支只关注"重发能成功"，跳过了本仓库为该故障模式专门建立的不变量（`chat-send-gate.ts` 头部注释所述"没有看门狗的话闸门会永久为 true，发送按钮从此点不动，重连也不会恢复"）。

**影响范围**：仅公聊面板发送按钮被锁死（房间内聊天 `sendChatMessage` 仍走闸门，不受影响）；触发窗口窄，但后果为用户可感且不可自愈。

**复现方法 / 运行证据**：代码路径核验（`setIsSendingPublicChat` 全仓仅 5 处赋值：`:130` 置 true 后有 `gate.begin` 兜底、`:140`/`:151` 复位、`:146` 置 true **无兜底**、`:122` 超时兜底）。受环境限制**未**做真实浏览器断线复现（见 §三-3）。

**修复建议**：重发前重新 `gate.begin(onTimeout)`（且仅在返回 `true` 时 `setIsSendingPublicChat(true)`），或为重发单独挂一枚 `CHAT_ACK_TIMEOUT_MS` 看门狗并在超时分支复位 state + 还原输入文本。

**修复后验收标准**：新增用例断言"重发 emit 期间 ack 不返回 → 超时后 `isSendingPublicChat === false`、按钮恢复可点、草稿回填"；变异探针（移除看门狗）必须变红。

---

### P3-4 公聊自愈重发成功后新签发的访客身份**无处落盘**：下次加载身份重置并重新铸造不可复用会话

**文件与行号**
- `src/server/room-contract.ts:43-51`（`PublicChatAck` 成功分支仅含 `PublicChatSnapshot`，无 `guestToken` 字段）
- `src/components/hooks/useRoomChat.ts:143-161`（重发前 `clearGuestToken()`，成功后 `:158-160` 仅更新 messages/status，不写回任何凭证）
- 对照已修复路径：`src/server/room-socket.ts:377-388`（`presence:join` 回传 `guestToken`）+ `src/components/hooks/useLobbyPresence.ts:220-224`（客户端落盘）

**触发条件**：同 P3-2（失效会话下发送公聊并触发自愈重发，且重发成功）。

**实际行为**：重发前本地凭证已被 `clearGuestToken()` 清空；`PublicChatAck` 契约**无法回传**新 token，`useRoomChat` 也不写回。于是新铸会话的 token 仅存在于服务端 `socket.data.guestToken`（连接级缓存）：同一 socket 上后续发送因 `room-socket.ts:641` 缓存回退而侥幸复用（掩盖问题），但**下一次页面加载建立新连接时无 token → 服务端再次铸造一条新会话**。后果有二：① `playerId` 变更，验收标准 1「同机同浏览器未清数据下长期保持」在该路径断裂；② `guest-sessions.jsonl` 每次多一行，即 Round 1 P3-4 所要抑制的"每次新连接铸 1 条不可复用会话"在该路径复现。

**期望行为**：与 `presence:join` 同构——`PublicChatAck` 回传 `guestToken`（仅访客身份），客户端在重发成功分支 `persistGuestToken(token, { ephemeralOnly: isEphemeralSession() })` 写回，使身份与文件行数收敛。

**根因**：Round 1 P3-4 的修复只覆盖 `presence:join` 单条回传路径，未同步扩展 `PublicChatAck` 契约与 `public-chat:send` 自愈链路；`acknowledgeAndBroadcastPublicChat`（`room-socket.ts:1084-1100`）当前只接收 `response`，看不到 `player.value.guestToken`。

**影响范围**：受限场景下的身份漂移 + 每 (会话失效 × 公聊自愈 × 页面重载) 一次 1 行 JSONL 增长；无数据损坏、无安全影响。

**复现方法 / 运行证据**：`room-contract.ts:43-51` 契约核验（无 token 字段，客户端无从写回）；PROBE-3 证实无 token 请求必由服务端铸造新会话；PROBE-4 证实"只有客户端携带 token 才能复用"（3 次模拟页面加载 → 文件恒 1 行、token 三次一致）。

**修复建议**：`PublicChatAck` 成功分支扩展 `guestToken?: string`；`acknowledgeAndBroadcastPublicChat` 增加 identity 入参并按 `presence:join`（`room-socket.ts:378-388`）同法回传；`useRoomChat` 重发成功分支写回（注意 `{ ephemeralOnly: isEphemeralSession() }`，严禁污染 localStorage 主凭证）。

**修复后验收标准**：模拟"失效会话 → 公聊自愈成功 → 重新加载页面"3 次，`guest-sessions.jsonl` 恒为 1 行且本地 `gomoku-guest-token` 非空、三次 `playerId` 一致；变异探针（移除写回）必须变红。

---

## 三、待确认风险与未验证项

1. **`refreshPresence` 新增的凭证写回路径与房间 ack 的"后写覆盖"竞态（待确认风险）**：`useLobbyPresence.ts:220-224` 现在会把 `presence:join` 的 token 写入本地，而 `useRoomSocket.applyRoomAck`（`:249-253`）也会写入 `room:join` 的 token。二者来自不同 socket 轮次且无"单调/最新优先"保护，若自愈后的房间 ack（T2）先落盘、在途的 presence ack（自愈前的 T1）后到达，本地主凭证会回退为 T1，出现"大厅身份 guest_A / 房间身份 guest_B"的分裂。怀疑依据为代码路径（两条写路径同键、无版本号），**未复现**（需注入 acks 乱序）。建议验证方法：在 `useLobbyPresence` 侧断言"仅当响应 token 与当前 socket 绑定身份一致时写回"，或做一次 ack 乱序注入探针确认末态 token 与 `ROOM_SESSION_STORAGE_KEY.guestToken` 一致。
2. **Round 1 遗留待裁决项仍未处置（非本轮新增，不作缺陷计）**：`clearEphemeralSession()`（`room-state-utils.ts:77-82`）与 `readPlayerName()`（`:335-344`）在生产代码中仍为 0 引用（仅测试引用）；60s 节流落盘 × 进程重启的 TTL 边界窗口（≤60s）仍未在文档中登记为"有界行为"。另：因 `clearEphemeralSession()` 无调用点，P3-2 所述的 ephemeral 标记在标签页生命周期内不可逆，会放大 P3-2 的持续时长（修复 P3-2 时无需一并处置，但建议同批判决接线或删除）。
3. **本轮未覆盖的验证项与残余风险**：
   - `npm run build` 未独立复跑（本轮只独立复跑 `tsc` / `lint` / `vitest`；因变更未触及构建配置与路由，残余风险低）。
   - 真实无头浏览器（CDP）多标签"主凭证逐字节不变"端到端验收**仍无自动化守门**（本轮为服务端运行时探针 + 客户端存储层探针 + 代码走查；`smoke:lobby-ui` 未扩展该场景）。P3-2 的真实浏览器表现（红字是否上屏）本轮为"存储层 + 服务端"两段式拼接证据，未做整链浏览器复现。
   - P3-3 的"ack 静默丢弃 → 按钮锁死"为代码路径核验，未做真实断线复现。
   - 30 天 TTL × 跨进程重启的运行时复现本轮未做（第 2 轮已由单测覆盖滑动过期语义）。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-1**（先修守门，避免后续修复再次"无守门交付"）：改以重写次数为观测量，并补"死行超阈值必须压缩"的反向边界用例。
2. **P3-2**（自愈链路完整性，用户可感）：显式构造重发 payload，禁止在 ephemeral 下经由 `getActivePlayer()` 复活 localStorage 主凭证。
3. **P3-3**（健壮性）：重发送回 `ChatSendGate` 看门狗。
4. **P3-4**（身份与容量收敛）：扩展 `PublicChatAck` 回传 `guestToken` 并在客户端写回。

**复审验收标准**：四道门禁全绿（`tsc` / `lint` / `test` / `build`）；上述 4 项逐条给出"修复 diff 行号 + 实测输出"证据；新增/修正用例须通过变异探针（重写次数、ephemeral 重发 payload、ack 超时复位、公聊 token 写回）；不得新增任何 localStorage 主身份覆写路径（ephemeral 场景仍须逐字节不变）。
