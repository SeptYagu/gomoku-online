# 访客身份持久化技术设计方案 · 第 1 轮独立审查交接单

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`d7ceff2`（`docs(plan): add persistent guest identity proposal and handoff`）；**基准** `d276991`；**实际 diff 范围** `d276991..d7ceff2`（4 文件，+355/−1，全为 `STATUS.md` / `docs/**` 文档，源码零改动）；工作区干净，`git pull --ff-only` 已是最新，`HEAD == d7ceff2` 一致。
- **通过项（极简）**：四大支柱（客户端 Storage 双写 / `GuestSessionStore` JSONL 落盘 / 30 天滑动 TTL / 全链路自愈）均已成文；§1.2 四条根因逐条与现状代码吻合（纯内存 Map、`GUEST_SESSION_TTL_MS = 6h`、`sessionStorage` 生命周期、`createRoom` 无自愈分支）；落盘路径 `data/accounts/guest-sessions.jsonl` 与既有 `accounts.jsonl` 同目录同约定、已被 `.gitignore` 的 `data/accounts/` 覆盖，`deploy/gomoku-online.service.example` 的 `WorkingDirectory=/srv/gomoku-online` 固定 ⇒ 落盘位置稳定；`room-store.ts` 单例确为 `online-server.ts:8/52` 实际使用者，注入点有效；`STATUS.md:11` 字段按「审查提交记直接父提交」先例取值正确（父 = 被审 `d7ceff2`），`docs/handoff/INDEX.md` 已登记新行。
- **独立验证**：自建探针跑通 3 个场景（真实 Socket.IO 双连接 2 个 + 按方案 §3.3 逐字实现的 Storage 契约模拟 1 个），其中 **2 个场景成功证伪方案核心机制**（见 P2-1/P2-2/P2-3），1 个场景（落盘路径/注入点/根因吻合）符合预期。临时探针已删除，`git status --porcelain` 为空。

---

## 二、审查发现与缺陷清单

### P2-1（高）：Storage 双写/读取契约自相矛盾，多标签隔离不可实现且会覆写主身份（验收标准 2 不满足）

- **文件与行号**：`docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:148-152`（`persistGuestToken` 无条件双写）、`:154-162`（`readGuestToken` 回退 `sessionStorage → localStorage → readRoomSession`）、`:164-170`（`clearGuestToken({ephemeralOnly})`）、`:52-53`（设计目标 4）、`:260`（§4 表格「单机多开对弈测试」行）、`:196-221`（§3.4-1 createRoom 自愈）。对照现状：`src/components/hooks/room-state-utils.ts:299-313`、`src/components/hooks/useRoomSocket.ts:325-346`、`:374-391`。
- **触发条件**：同一浏览器打开第二个标签页，进入第一个标签页的房间（多开自测 / 单机双人对弈）。
- **实际行为**：`persistGuestToken` **无 ephemeral 变体、只有全局双写**，因此"仅在 `sessionStorage` 生成临时分身"在方案给定的 API 集合内**无法表达**；退一步按 §4 的写法先 `clearGuestToken({ephemeralOnly:true})`，`readGuestToken()` 会立刻从 `localStorage` 取回同一个主 token，分身拿到的仍是主身份。若按现状 join 重试路径（唯一实际处理 `duplicate-player` 的地方）执行"清空 + 重发"，新 token 又会经 `applyRoomAck → persistGuestToken` 双写覆盖 `localStorage`，把主身份替换成一次性分身身份。
- **期望行为**：第二标签页获得独立对弈身份并成功入房；`localStorage` 主凭据（token + playerId）在整个过程中保持不变（§2-4 明确"严禁抹除 localStorage 中主访客凭据"）。
- **根因**：三处契约互相冲突——(a) 写侧只有"双写"，(b) 读侧优先级为 `sessionStorage → localStorage`，(c) 隔离机制却要求"只写 sessionStorage"。此外方案误判了 `duplicate-player` 的触发源：服务端对访客**完全忽略客户端 `playerId`**（`src/server/accounts.ts:466-472` 明确注释"client-supplied playerId is never trusted"），真实触发源是**共享 `guestToken` 解出的同一服务端会话身份**，因此 §3.3 把 `getOrCreatePlayerId` 改为落 `localStorage` 对本条隔离目标没有贡献（反而增加多标签串号面）。方案 §3.4 也未列出任何"检测 `duplicate-player` → 走 ephemeral"的代码位置。
- **复现方法/证据**（临时探针场景 3，按方案 §3.3 逐字实现三个函数 + 同源 localStorage/独立 sessionStorage 模拟，运行后已删除）：

  ```
  [3] Tab B 读取到的 token（未做任何隔离动作）: T-main
  [3] ephemeralOnly 清理后 Tab B 读取到的 token: T-main     ← ephemeralOnly 完全无效
  [3] 分身拿到新 token 双写后，localStorage 主凭据: T-throwaway  ← 主身份被覆写
  [3] Tab A 关闭重开后（sessionStorage 清空）读取到的身份 token: T-throwaway
  ```
  真实 Socket.IO 双连接侧亦实测 `duplicate-player`（见 P2-2 场景 2 输出）。
- **修复建议**：① 增加 `persistGuestToken(token, { ephemeralOnly?: boolean })`（ephemeral 时**只写** `sessionStorage`，绝不触碰 `localStorage`）；② 将 `useRoomSocket.ts:325-346 / 374-391` 的 `duplicate-player` 分支改为 ephemeral 分身（禁止调用全局 `clearGuestToken()`），`guest-session-invalid` 才走全局清理；③ 明确 `getActivePlayer()`（`useRoomSocket.ts:114-128`）的读取契约与 ephemeral 优先级；④ 文档补上"分身身份只在当前标签页存活"的显式生命周期说明。
- **修复后验收标准**：新增自动化守门用例——同一 `guestToken` 由两个 socket 分别认证后，第二个 socket 在 `duplicate-player` 后能拿到**不同**的 `playerId` 并成功入房；同时断言 `localStorage` 主 token/playerId 与隔离前逐字节一致。

### P2-2（高）：清空本地凭据后重试无法换发新身份——服务端 `socket.data.guestToken` 回退使自愈二次失败

- **文件与行号**：`src/server/room-socket.ts:613-647`（`:621` `const guestToken = payload.guestToken?.trim() || socket.data.guestToken;`、`:643` 成功后回写 `socket.data.guestToken`）；方案侧 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:196-221`（createRoom 自愈）、`:226-246`（reconnect 自愈）、`:249-250`（大厅 presence 自愈）——三处**均未涉及该服务端契约**。
- **触发条件**：连接上已成功认证过（`socket.data.guestToken` 已写入）后该 token 失效——超过 30 天 TTL 被 `pruneExpiredSessions` 回收，或被 `maxEntries` LRU 淘汰（`src/server/accounts.ts:82 / 391-403`）。
- **实际行为**：客户端按方案"清空本地凭据 → 不带 token 重发"后，服务端因 `payload.guestToken` 为空而**回退复用同一个已失效的 `socket.data.guestToken`**，身份解析再次返回 `guest-session-invalid`，自愈重试必然二次失败（且方案只允许一次重试）。多标签分身路径同理：Tab B 已经用共享 token 完成过 `presence:join`（`socket.data.guestToken` 已绑定主身份），"不带 token 重发"仍解析为主身份 ⇒ 再报 `duplicate-player`。
- **期望行为**：§2-5 承诺"检测到 `guest-session-invalid` 时自动无感重新签发新 Session 并平滑重试，**永不再向用户弹窗或展示报错**"；§4 表格承诺服务重启后"Token 验证 100% 成功、玩家无感知"。
- **根因**：自愈被设计成**纯客户端状态机**，但"能否换发新身份"的裁决权在服务端：只要该 socket 上留存的 `socket.data.guestToken` 仍参与回退，客户端清空本地存储对服务端身份解析没有任何影响。方案缺少服务端侧配套改动（清除/忽略 `socket.data.guestToken`，或为自愈请求提供显式 `forceNewIdentity` 语义）。
- **复现方法/证据**（临时探针场景 1/2：`GuestSessionStore({ ttlMs: 60_000, now })` + 真实 Socket.IO + 推进时钟触发 prune）：

  ```
  [1] 首次建房: {"ok":true,"code":"HM444U"}
  [1] 方案自愈重试（不带 guestToken，模拟已清空本地凭据）ack:
      {"ok":false,"error":{"code":"guest-session-invalid","message":"Guest session is invalid. Start a new guest session."}}
  [2] Tab B 用共享 token 做 presence:join: true
  [2] Tab B 加入 Tab A 房间: {"ok":false,"error":{"code":"duplicate-player",...}}
  [2] 分身重试（不带 guestToken）: {"ok":false,"error":{"code":"duplicate-player",...}}   ← 分身无法脱离主身份
  ```
- **修复建议**：在 `resolveSocketPlayer` 增加"显式重置身份"通路（例如 payload 标记 `resetGuestIdentity: true` 或自愈专用事件），命中时**先清除 `socket.data.guestToken` 再走 `createSession`**；或让服务端在 `guest-session-invalid` 且 payload 明确未携带 token 时忽略 `socket.data.guestToken` 并签发新会话。方案 §3 需相应新增"服务端契约改动"章节。
- **修复后验收标准**：新增 socket 级自动化用例——同一连接先成功认证，令其 token 失效后，用自愈重试（空 token）断言 `ok:true` 且返回的 `playerId` 与旧身份不同；`duplicate-player` 后重试断言 `ok:true` 且为不同 `playerId`。

### P2-3（高）：自愈后错误仍会外溢到 UI——服务端对失败 ack 无条件发射 `room:error`

- **文件与行号**：`src/server/room-socket.ts:988-1002`（`acknowledgeAndBroadcast` 在 `!response.ok` 时 `socket.emit("room:error", response.error)`，即 `:997`）、`:364-376`（`presence:join` 失败时额外 `socket.emit("room:error", player.error)`，即 `:369`）；客户端监听 `src/components/hooks/useRoomSocket.ts:179-181`（`room:error → setError`），该 `error` 即 `useFriendRoom.ts:180/195/387` 暴露给好友房与大厅的同一错误态。方案侧 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:236`（"不调用 applyRoomAck 污染 UI 报错"）、`:250`（"消除大厅顶部红字"）。
- **触发条件**：任一 `room:create / room:join / matchmaking:find / presence:join` 失败 ack。
- **实际行为**：错误文案由**socket 事件通道**独立送入 `setError`，与客户端是否调用 `applyRoomAck` 无关。因此按方案实现的重连自愈（§3.4-2 刻意不调用 `applyRoomAck`）与大厅自愈（§3.4-3"静默清空")，**仍会在 UI 上留下红字报错**；只有"重试恰好成功并由 `applyRoomAck` 置 `setError(null)`"才能清除（createRoom 路径如此，重连/大厅路径不会）。
- **期望行为**：§2-5 与验收标准 1 的"全链路静默自愈 / 永不再展示报错"。
- **根因**：§1.2 第 4 点把报错出口**只归因于 `applyRoomAck`**，遗漏了服务端 `room:error` 这条既有通道；方案未包含任何服务端抑制或客户端错误态收口动作。
- **复现方法/证据**（探针场景 1，客户端仅做 ack 回调、全程未调用 `applyRoomAck`）：

  ```
  [1] 期间客户端收到的 room:error 事件:
      [{"code":"guest-session-invalid","message":"Guest session is invalid. Start a new guest session."}]
  ```
- **修复建议**：二者取其一并写入方案——(a) 服务端对可自愈的 `guest-session-invalid` 分类不再发射 `room:error`（`acknowledgeAndBroadcast` / `presence:join` 各一处），由 ack 返回值驱动客户端自愈；(b) 客户端自愈成功后显式 `setError(null)` 收口。建议 (a)+(b) 同时做，避免竞态下残留红字。
- **修复后验收标准**：自动化用例断言"失效 token → 自愈 → 最终 `error === null` 且房间/大厅状态正常"，并在 `room:error` 事件监听处断言自愈场景不会推送该事件。

### P3-1（中低）：验收标准 1 的"全链路"遗漏在线匹配入口

- **文件与行号**：`src/components/hooks/useLobbyPresence.ts:327-342`（`findMatch` 直接 `applyRoomAck`，无任何 `guest-session-invalid` 处理）；方案 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:249-250` 与 §2-5 仅列"创建房间、加入房间、大厅状态同步、重连"。
- **触发条件**：大厅点击"寻找匹配"时携带失效 token。
- **实际行为**：直接落到 `applyRoomAck` 报错（并经 P2-3 通道二次外溢），与"全链路"表述不符。
- **修复建议**：将 `matchmaking:find` 纳入自愈状态机，与 createRoom 同一模式（ephemeral 语义按 P2-1 结论处理）。
- **验收标准**：失效 token 下点击匹配能自动换发身份并进入匹配队列，UI 无报错。

### P3-2（中低）：30 天 TTL 与 `maxEntries = 10_000` 的 LRU 淘汰冲突，未过期会话可被静默淘汰

- **文件与行号**：`src/server/accounts.ts:82`（`GUEST_SESSION_MAX_ENTRIES = 10_000`）、`:342-346`（`createSession` 前调用 `evictOldestSessions`）、`:391-403`（按 `lastSeenAt` 淘汰最旧会话）；方案 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:45-48`（"连续 30 天完全未再次访问，会话才自然失效被回收"）、`:259`。
- **触发条件**：30 天窗口内新增访客超过 1 万（稳态 ≈ 333 新访客/日 即开始淘汰）。
- **实际行为**：仍处于 30 天有效期的会话会因容量上限被静默淘汰，其持有者下次访问拿到 `guest-session-invalid`，经自愈后**静默换成新身份**（`playerId` 变化、对局记录断开），与"长效设备身份保持"目标冲突；方案未给出容量预估、淘汰策略调整或可观测指标。
- **修复建议**：在方案中显式给出容量模型（预估日新增访客 × 30 天 vs `maxEntries`），必要时随 TTL 同步上调 `maxEntries`，并增加淘汰计数日志/指标。
- **验收标准**：方案包含容量测算与超限处理策略；单测覆盖"容量上限下的淘汰不会误伤活跃会话"（如按 `lastSeenAt` 而非 `createdAt` 淘汰的断言）。

### P3-3（中低）：失效 token 残留于房间会话快照，第三优先级回退会把死 token 重新取出

- **文件与行号**：`src/components/hooks/room-state-utils.ts:303-313`（`readGuestToken` 第三优先级 `readRoomSession()?.guestToken`）、`:315-344`（`clearRoomSession` 与 `readRoomSession` 同时读 `sessionStorage`/`localStorage` 的同一键）；方案 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:154-162` 保留同一回退顺序，但 `clearGuestToken`（`:164-170`）只清 token 键、不清房间会话。
- **触发条件**：P2-2 条件成立（自愈失败）后，后续任意一次身份解析（再次建房、加入、大厅 Presence 刷新）。
- **实际行为**：`sessionStorage`/`localStorage` 的 token 已清空，但 `readGuestToken()` 会从房间会话快照里重新取出**同一个已失效 token** 并再度上送，与 `socket.data.guestToken` 回退叠加形成"清不掉"的固定态——用户只能手动清除站点数据才能恢复，直接违背"平滑自愈"目标。
- **修复建议**：`clearGuestToken()` 同步清除房间会话中的 `guestToken` 字段（或在读侧去掉 `readRoomSession()?.guestToken` 这条已由 `localStorage` 主身份覆盖的旧回退）。
- **验收标准**：单测断言"失效→清理→再次读取 `readGuestToken()` 返回 `null`"，且"再次发起请求时不携带已失效 token"。

---

## 三、待确认风险与未验证项

1. **未验证（环境限制）**：真实浏览器双标签页下 `localStorage` 共享与并发写时序。本仓无 jsdom，本轮以两条独立证据链替代——真实 Socket.IO 双连接（场景 2，验证服务端身份复用导致的 `duplicate-player`）+ 按方案逐字实现的同源 Storage 语义模拟（场景 3，验证 ephemeral/双写语义）。**残余风险**：双标签各自自愈后并发写 `localStorage` 的 last-write-wins 竞争未在方案中讨论（怀疑依据：`persistGuestToken` 无版本号/时间戳仲裁，P2-1 修复时需一并定义）。
2. **未验证（信息缺失）**：生产部署对落盘的影响。仓库仅提供 `deploy/gomoku-online.service.example`（`WorkingDirectory=/srv/gomoku-online`，未声明数据卷/只读根文件系统策略），容器临时层或只读 FS 场景下 `data/accounts/guest-sessions.jsonl` 的持久性无法在本仓库内核验；该风险与既有 `accounts.jsonl` 同源，属存量风险。
3. **非阻塞补充（不计缺陷）**：方案 §3.1 只在 `createSession` 规定了压缩触发，未说明 60 秒节流追加是否计入 `JsonlCompactionTracker`（既有 `AccountStore` 为每次 append 均计数，见 `src/server/accounts.ts:277-292`）；另 `lastPersistedSeenAt` 建议沿用 `AccountStore` 的 per-id Map 语义而非单标量，以免多会话并存时落盘节流相互干扰。

---

## 四、推荐修复顺序与复审验收标准

1. **修复顺序**：P2-1 → P2-2 → P2-3（三者共同决定"多标签隔离"与"静默自愈"两大验收标准，且必须同期补齐方案中的「服务端契约改动」章节）→ P3-1 / P3-2 / P3-3。
2. **方案修订要求**：更新 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md` 中的 §2 目标、§3.1~§3.4 契约与 §4 边界表格，使「写侧 API」「读侧优先级」「隔离机制」「服务端回退/错误通道」四处语义自洽；同步刷新 `docs/handoff/INDEX.md` 与 `STATUS.md`。
3. **复审验收标准**：① 上述 6 项缺陷逐项给出方案级闭环证据（含最小改动点与代码位置）；② 方案 §5.1 测试规范补齐三条守门用例——storage ephemeral 只写 `sessionStorage`、socket 级"失效 token → 自愈后 `playerId` 变化"、双 socket 同 token 隔离；③ 明确 30 天 TTL 下的容量模型与淘汰策略；④ 纯文档改动仍保持四道门禁基线不受影响。
4. **轮次说明**：本轮为纯方案审查第 1 轮（`Round <= 3` 上限内），修复提交后进入第 2 轮复查，复查将聚焦"上一轮缺陷是否真正闭环 + 修复增量是否引入新缺陷"，不回溯翻找未改动文本。
