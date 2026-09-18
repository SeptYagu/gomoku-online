# 访客身份持久化、30天滑动TTL与全链路静默自愈 · 独立代码审查 Round 1 报告（源码实现）

> **审查日期**：2026-09-18
> **审查轮次**：Round 1（源码实现审查）
> **被审 HEAD**：`cbb44e3`（`feat(accounts): implement persistent guest identity, 30-day sliding TTL and silent self-healing`）
> **基准提交**：`cb01d11`
> **审查范围**：`git diff cb01d11..cbb44e3`（12 文件，+853/−42）
> **判定结论**：**未通过**（1×P2 + 4×P3，均需修复闭环）

---

## 一、审查基本信息与通过项简述

- 版本核对：`git pull --ff-only` 后 HEAD = `cbb44e3b8e336779846dfd1977c6c43e899a18a2`（与指定被审 SHA 一致），基准 `cb01d110ff9a28ca38fb9119e6fb8b3a6c4bdc26`（`cb01d11`），工作区干净；本轮未修改任何产品代码/测试，临时探针已删除（`git status --porcelain` 为空）。
- 通过项极简：验收标准 1/2/3 的服务端侧（30 天滑动 TTL、JSONL 落盘与跨实例恢复、坏行容错、`lastSeenAt` LRU、60s 节流计数）与客户端侧（双写、`shouldBeEphemeral` 双重守卫、分身不写 localStorage）经代码核验 + 11 项独立探针均成立；验收标准 4 的 6 条鉴权入口（建房/加房/join-target/重连/匹配/大厅）抑制与自愈均已闭环（仅公共聊天遗漏，见 P3-1）。
- 被审测试实测：3 个变更测试文件 44 例全绿（`accounts` 15 / `room-socket` 23 / `room-state-utils` 6）；`npx tsc --noEmit` 0 错误。

---

## 二、审查发现与缺陷清单

### P2-1 压缩记账口径错误：文件行数达到阈值后，**每次落盘都全量重写整份日志**（写放大 O(n)，容量上限时单次阻塞 ≈60ms）

**文件与行号**
- `src/server/accounts.ts:442` — `GuestSessionStore.loadFromFile()` 内 `this.compaction.reset(lineCount);`
- `src/server/accounts.ts:476-478` — `GuestSessionStore.persist()` 内 `if (this.compaction.noteAppend()) { this.compactFile(); }`
- `src/server/accounts.ts:481-495` — `compactFile()` 末尾 `this.compaction.reset(this.sessionsByPlayerId.size);`
- `src/server/jsonl-file.ts:86-95` — `JsonlCompactionTracker.noteAppend()` / `reset()` 语义

**触发条件**：`data/accounts/guest-sessions.jsonl` 行数（≈ 存活会话数，压缩后与存活数相等）≥ `GUEST_SESSION_COMPACT_AFTER_LINES`(2,000) 后，发生任意一次落盘（`createSession()`，或 60s 节流到期的 `authenticate()`）。

**实际行为**：`reset(liveLines)` 把计数写成"当前文件总行数"，而 `noteAppend()` 把同一个计数器与"阈值"比较——`liveLines ≥ threshold` 时 `noteAppend()` 恒为 `true`，于是**每次落盘都触发 `compactFile()` 重写全部存活会话**，而重写后的 `reset(size)` 又把计数留在阈值之上，形成永久写放大。实测（本机临时目录，SSD）：

| 文件行数 | 3 次 `createSession()` 触发的 `rewriteJsonlFile` 次数 | 单次 `createSession()` 均耗时 |
| --- | --- | --- |
| 1,200（< 阈值） | 0（纯追加） | 1.94ms |
| 2,100（> 阈值） | 3（每次重写整份 385KB） | 9.82ms |
| 6,000 | 3（每次重写 1.1MB） | — |
| 50,000 | 3（每次重写 9.9MB） | 63.32ms |

`rewriteJsonlFile` 的 spy 计数与目标文件 inode 变更次数完全一致（3/3），可排除计时误差；`JsonlCompactionTracker` 语义直接验证：`threshold=2000` 下 `reset(3000)` 之后连续 5 次 `noteAppend()` 返回 `[true,true,true,true,true]`。

**期望行为**：压缩应由"自上次重写以来的新增行数"（或"文件行数相对存活数的增长预算"）驱动；达到容量上限时，单次落盘的摊还成本应与新增行数相关，而非与整库规模相关（即 ≤ 文件规模/阈值）。

**根因**：`JsonlCompactionTracker` 的"计数器"同时承担了两种语义——"当前文件行数"（`reset` 写入）与"待压缩增量/增长预算"（`noteAppend` 递增并比较阈值）；两语义混用导致阈值只起一次作用。

**影响范围**：访客会话是全站最高频的鉴权对象（`presence:join`、建房、加房、匹配、公共聊天都会落盘），且 30 天 TTL 让会话只增不减；按 P3-4 的实测，**无 token 的匿名页面加载每次铸造 1 条会话**，2,000 行门槛极易越过。越过后每次建会话都变成整库重写，且 `appendJsonlFile/rewriteJsonlFile` 均为同步 API，50k 容量时单次 ≈60ms 直接阻塞 Node 事件循环（同进程 Socket.IO 全部请求被拖慢）；磁盘写入量被放大 O(n) 倍（本仓库位于 OneDrive 目录，放大更敏感）。无数据丢失风险（重写内容取自内存投影，且走 temp+rename）。

**复现方法**：构造含 N 行的 `guest-sessions.jsonl` → `new GuestSessionStore({ filePath })` → 连续 `createSession()`；spy `./jsonl-file` 的 `rewriteJsonlFile` 或比对文件 inode。

**修复建议**：修正压缩计数语义——`loadFromFile()` 后 `reset(0)`（或把 `reset` 语义改为"仅记录上次重写后的基线"，让阈值表示增量预算），重写后归零，使每条 append 的摊还写入 ≤ 文件规模/阈值。同时建议为访客库下调阈值或改为按增量触发。`AccountStore`（`accounts.ts:270` / `:306` / `:329`）为同源模式，当前账号规模不可达，**非本轮阻断项**，但建议同批修复以免后续踩同一坑。

**修复后验收标准**：新增守门单测——加载 ≥ 阈值行数的文件后，连续 N 次落盘只允许发生 1 次 `rewriteJsonlFile`（spy 计数断言）；50k 存活会话下 `createSession()` 单次耗时回到与存活规模无关的量级（如 < 5ms）；变异探针（把 `reset(0)` 改回 `reset(lineCount)`）必须使该用例变红。

---

### P3-1 公共聊天（`public-chat:send`）未纳入自愈/抑制链路，仍会向用户展示 `guest-session-invalid` 红字

**文件与行号**
- `src/server/room-socket.ts:1073-1084` — `acknowledgeAndBroadcastPublicChat()` 无条件 `socket.emit("room:error", response.error)`（`:1082`）
- `src/components/hooks/useRoomChat.ts:116-151` — 发送时携带 `getActivePlayer()` 的 `guestToken`；失败分支仅 `setError(response.error.message)`（`:142`），无清凭据/`resetGuestIdentity` 重发
- `src/components/hooks/useRoomSocket.ts:183-185` — `room:error` → `setError()` 上屏
- 可达性前提：`room-state-utils.ts:384-396`（Ephemeral 页 `clearGuestToken()` 跳过 localStorage）+ `:372-382`（`readGuestToken()` 回退读 localStorage）

**触发条件**：客户端在"本地仍持有失效 guest token"时发送公共聊天消息。现实路径：标签页已被标记 Ephemeral（多开分身冲突后），自愈清空 sessionStorage 后 `clearGuestToken()` 因 `shouldBeEphemeral()` 跳过 localStorage，而 `readGuestToken()` 会回退读取 localStorage 中的失效主 token；服务端数据被重建（新部署未挂载 `data/` 卷）或主会话被 LRU 淘汰时即命中。

**实际行为**（探针 PROBE-1：8 条鉴权入口统一携带 `guestToken: "dead-token-…"`，监听 `room:error`）：

```
room:create          ack=guest-session-invalid room:error=[]          ← 已抑制
room:join            ack=guest-session-invalid room:error=[]          ← 已抑制
room:join-target     ack=guest-session-invalid room:error=[]          ← 已抑制
room:rejoin          ack=guest-session-invalid room:error=[]          ← 已抑制
matchmaking:find     ack=guest-session-invalid room:error=[]          ← 已抑制
presence:join        ack=guest-session-invalid room:error=[]          ← 已抑制
public-chat:send     ack=guest-session-invalid room:error=[guest-session-invalid]   ← 泄漏
```

**期望行为**：验收标准 4 —— "抑制 `room:error` 广播，绝不向用户展示 `guest-session-invalid` 红字"，且消息应在静默重签身份后成功发出。

**根因**：服务端抑制白名单只落在 `acknowledgeAndBroadcast` / `acknowledgeAndBroadcastRoomOnly` / `presence:join` 三处，遗漏 `acknowledgeAndBroadcastPublicChat`；客户端自愈只覆盖 6 条房间/大厅路径，公共聊天不在其中（即便服务端补上抑制，`useRoomChat.ts:142` 仍会用 ack 内错误 `setError` 上屏）。

**影响范围**：分身标签页 / 服务端数据重置后，公共聊天发送失败并外溢红字；其余 6 条链路已闭环，不影响建房/加房/重连/匹配/大厅。

**复现方法**：死 token 下 `emit("public-chat:send", { guestToken: "dead-token-…", playerId, playerName, text })`，监听 `room:error` 计数（实测 1）。

**修复建议**：① `acknowledgeAndBroadcastPublicChat` 增加 `response.error.code !== "guest-session-invalid"` 判断；② `useRoomChat.sendPublicChatMessage` 复用现有自愈状态机（`clearGuestToken()` + `resetGuestIdentity: true` 重发一次 + `setError(null)`）。

**验收标准**：新增用例覆盖死 token 下的 `public-chat:send`：`room:error` 计数为 0、自愈重发后消息写入成功、界面无红字；变异探针（移除抑制判断 / 移除重发）必须变红。

---

### P3-2 重连自愈分支只清存储会话、未清内存房间态，用户停留在"幽灵房间"

**文件与行号**：`src/components/hooks/useRoomSocket.ts:270-275`
**相关**：`src/server/room-socket.ts:918-926`、`:967-975`（`runForCurrentPlayer/Member` 依赖 `socket.data.playerId`+`roomCode`）

**触发条件**：用户已入房 → socket 断开重连（`hasConnectedOnceRef`）→ `room:rejoin` 因 `guest-session-invalid` 失败（会话被淘汰 / 服务端数据重建）。

**实际行为**：该分支执行 `clearGuestToken(); createAndPersistPlayerId(); clearRoomSession(); setError(null); return;` 后直接返回——React 的 `room` 状态、URL 中的 `?room=` 与父级 `onRoomCleared` 回调均未处理，界面继续显示该房间；而新连接上 `socket.data.playerId/roomCode` 为空，用户后续任何操作（`room:ready`/`room:sit`/`game:*`）都会返回 `not-room-member` 并经 `acknowledgeAndBroadcast` 触发 `room:error` 红字，同时 `room:leave` 也无法收敛该视图。

**期望行为**：静默自愈后应回到一致状态——与下方 `room-not-found` 分支一致地调用 `clearClosedRoom(storedSession.roomCode)`（清 URL、清内存房间态并通知父级），静默退回大厅。

**根因**：修复只覆盖了"存储层会话"，未覆盖"内存房间态/URL/父级通知"三层状态。

**影响范围**：仅重连且凭据失效时命中（持久化上线后概率降低，但仍由 LRU 淘汰、`data/` 丢失等触发）；命中后用户处在无法操作的房间视图，且产生 `not-room-member` 红字（与本次"静默自愈"目标相悖）。

**复现方法**：单测/烟测注入失效 `storedSession` → 触发 `reconnectHandlerRef` → 断言 `room` 状态与 URL。本轮为代码路径核验（未起真实浏览器断线重连）。

**修复建议**：将该分支改为 `clearClosedRoom(storedSession.roomCode)`（或显式 `setRoom(null)` + `clearRoomUrl()` + `onRoomClearedRef.current?.(...)`）。

**验收标准**：新增用例断言重连自愈后 `room === null`、URL 无 `room` 参数、未产生 `room:error`。

---

### P3-3 坏行容错用例断言恒真，无法拦截回归

**文件与行号**：`src/server/accounts.test.ts:401-424`（断言在 `:422` `expect(store).toBeDefined();`）

**触发条件**：任何一次运行——构造函数永远不会返回 `undefined`，该断言恒真。

**实际行为**：用例虽然写入了 `corrupt json`、结构非法行与一条"有效行"，但（1）构造用的"有效行" `tokenHash: "somehash"` 无法对应任何真实 token，**没有任何断言验证有效条目被加载**；（2）没有断言"坏行被跳过"的数量或行为。即使 `loadFromFile` 完全丢弃 `entries`（或 `parsePersistedGuestSessionEntry` 恒返回 `null`），该用例依旧全绿——而验收标准 3 明确要求"含坏行过滤"，这是唯一声称覆盖它的用例。

**期望行为**：应验证"坏行被跳过、好行被保留并可鉴权"。参照独立探针 PROBE-5：先用带 `filePath` 的 store 建真实会话取得真实 token，再向文件插入坏行，重载后断言 `authenticate(realToken)` 非空（并可断言 `console.warn` 的 `skipped=2`）。

**影响范围**：验收标准 3 的坏行容错实际处于无守门状态。

**修复建议**：按上述写法重写该用例，并使其可通过变异探针（令 parser 恒返回 `null` 或用例丢弃 entries 时必须变红）。

**验收标准**：变异探针下该用例必须失败；正常情况下保持全绿。

---

### P3-4 无 token 的匿名事件会铸造并落盘一次性会话，客户端从不回收 token

**文件与行号**
- `src/server/accounts.ts:573-590` — 无 guestToken 时由服务端生成 playerId 并 `createSession()`（客户端 playerId 不被采信）
- `src/server/room-socket.ts:365-379` — `presence:join` 的成功 ack 为 `PresenceAck`，**不含 guestToken**
- `src/components/hooks/useLobbyPresence.ts:162-217` — 首发与自愈分支均不落盘任何 token
- `src/server/room-store.ts:7,15-17` — 本次起单例启用磁盘持久化

**触发条件**：任何未持有 token 的客户端发起 `presence:join` / `public-chat:send`（首次访问、清数据后、自愈清空 token 后、Ephemeral 页每次重载）。

**实际行为**（探针 PROBE-6，接入真实 `GuestSessionStore({ filePath })` 的 socket 脚手架）：

```
page-load #1: presence:join ok=true -> guest-sessions.jsonl lines=1
page-load #2: presence:join ok=true -> lines=2
page-load #3: presence:join ok=true -> lines=3
same socket x2 presence:join         -> lines=4   ← 同一连接内复用 socket 缓存，不新增
```

即：**每次"无 token 的新连接"都会铸造并落盘 1 条会话，而该 token 从不回传客户端**，因此这些会话永不被复用，只能等 30 天 TTL 或 50k LRU 淘汰；会话表与文件行数随匿名访问线性增长（并直接构成 P2-1 阈值 2,000 行的可达路径）。同时意味着"只逛大厅、从未入房"的用户其服务端身份每次加载都会变化（验收标准 1"同机同浏览器长期保持"在该路径上实际未成立）。

**期望行为**：无身份复用需求的事件不应产生持久会话；或把签发的 token 回传客户端以便复用（与房间流程一致地双写）。

**影响范围**：磁盘/内存资源随匿名流量线性放大；LRU 上限下的淘汰压力；大厅场景的身份连续性缺口。

**修复建议**：`presence:join`/`public-chat:send` 走不落盘的临时身份（或仅在首次真正入房时把会话标记为持久），或在 `PresenceAck` 中回传 `guestToken` 并由客户端按 `ephemeralOnly` 规则落盘。

**验收标准**：连续 3 次无 token 的匿名页面加载后，`guest-sessions.jsonl` 行数不再逐次增长（或新增会话可被客户端复用、文件行数收敛）；补充对应守门用例。

---

## 三、待确认风险与未验证项

1. **`clearEphemeralSession()` 无任何调用点**（`room-state-utils.ts:77-82`）：Ephemeral 状态机实际单向不可逆，标签页一旦成为分身便永久不再回写 localStorage 主身份（主身份字节安全，符合验收标准 2），但其自身身份在关闭标签页后丢失。怀疑依据为静态检索（生产代码 0 引用），缺少真实浏览器多标签行为证据；建议用 CDP 多标签烟测验证"分身冲突结束/离开房间后旗标是否应复位"，再决定是接线还是删除该 API。
2. **60s 节流与重启的边界窗口（有界 ≤60s）**：`loadFromFile()` 以持久化的 `lastSeenAt` 判过期（`accounts.ts:443-448`），而 60s 节流允许最新一次活跃最晚 60s 才落盘；若进程重启恰好落在"TTL 边界 + 该 60s 窗口"内，一次真实活跃会被判为过期而静默重签身份（无红字）。属"60s 节流落盘"验收项引入的固有有界窗口，影响为身份重置而非数据损坏，**本轮未做跨重启运行时复现**。
3. **分身标签页显示名回退**：分身分支跳过 `persistPlayerName`（`useRoomSocket.ts:374-376`、`:437-439`），而新导出的 `readPlayerName()`（`room-state-utils.ts:335-344`）在生产代码中无调用点、`getInitialPlayerName()` 仍只读 room session + localStorage；分身页在"无房间会话"时重载会显示主身份名称。仅影响显示名，未在真实多开对局中验证其可感程度。
4. **未覆盖验证**：真实无头浏览器（CDP）多标签分身 Storage "逐字节不变"端到端验收本轮未执行（本轮为服务端运行时探针 + 客户端代码走查）；建议修复轮补一条 smoke（`smoke:lobby-ui` 同类手法）。

---

## 四、推荐修复顺序与复审验收标准

1. **P2-1**（压缩记账语义）——优先修复，附"加载 ≥ 阈值文件后 N 次落盘仅 1 次 rewrite"守门用例。
2. **P3-1**（公共聊天抑制 + 自愈）、**P3-2**（重连后房间态收敛）、**P3-3**（坏行容错守门用例有效性）。
3. **P3-4**（匿名会话铸造/落盘）与 P2-1 联动处理：至少让 `presence:join` 场景不再产生不可复用会话（或回传 token 落盘）。
4. 待确认风险 1/3 建议同批裁决（接线或删除），风险 2 建议在文档中显式登记为有界行为。

**复审验收标准**：四道门禁全绿（`tsc`/`lint`/`test`/`build`）；上述 5 项缺陷逐条给出"修复 diff 行号 + 实测输出"证据；新增/修正用例须通过变异探针（压缩重写次数、坏行容忍、`public-chat` 抑制与重发、重连后 `room` 状态、匿名会话行数收敛）；不得引入新的 localStorage 主身份写入路径。
