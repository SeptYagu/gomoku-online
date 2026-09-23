# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案 · 独立代码审查报告（Round 2 复查）

- **审查日期**：2026-09-23
- **审查类型**：纯技术方案 / 架构设计审查（Round 2 复查，diff 全为 `.md`，源码零改动）
- **被审 HEAD SHA**：`fb17609caca73d3f50807c9745d4e93657429e03`（`docs(plan): remediate Round 1 review findings for online PVP auth, naming, and leaderboard plan`）
- **基准 SHA**：`b2c6383`
- **实际审查范围**：`git diff b2c6383..fb17609`（6 文件，+875/−0）
- **判定结论**：**未通过**（0×P0 / **2×P1** / **1×P2** / **3×P3**）

---

## 一、审查基本信息与通过项简述

工作区干净（审查探针用后即删，`git status` 复核为空），`git pull --ff-only` 后 HEAD 与被审提交一致（`fb17609`），无本地改动；`npx tsc --noEmit` 在基线树上实测 0 错误。Round 1 八项缺陷中 **P2-2/P2-3/P2-4 的技术面确已闭环**：异步 `scrypt` + 2 并发门禁的写法成立（未能构造出并发越界反例，见三.2）；`canonicalizePlayerName` 经独立探针实测，对 Round 1 枚举的全部 4 类变体（`U+200B` / `U+2060` / `U+00AD` / 全角 `Ａ`，另加数学粗体 `𝔸`）均折叠为 `"alice"` 命中拦截；`tokenHashes: string[]` + 旧单值回填的多会话模型自洽。**P2-1 的"错误码与 join 自愈解耦"亦已成立**——客户端自愈是显式白名单（`useRoomSocket.ts:357-359`、`:420-422` 仅 `duplicate-player` / `duplicate-name` / `guest-session-invalid`），新码天然不被吞掉。但 **P1-1 与 P3-1 两项的闭环存在实质缺口，且新修复本身引入了新的契约断裂与死代码**，详见下节。

---

## 二、审查发现与缺陷清单

### P1-1 路径 A 前置短路使"凭原 Token 绑定密码"分支恒不可达，P1-1 的核心修复按方案字面实现即为死代码

- **级别**：P1
- **文件与行号**：方案 `docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md:229-237`（路径 A 早返回）与 `:254-274`（认领分支，尤其 `:257` `const ownershipToken = input.token?.trim();`、`:258` `isOwner` 校验、`:267-274` 绑定新密码）；交接单 `docs/handoff/2026-09-23-online-pvp-auth-and-leaderboard-round1-remediation-handoff.md:18`；Round 1 验收条款 `docs/handoff/2026-09-23-workbuddy-code-review-round1-handoff.md:39`
- **触发条件**：任何一次"遗留无密码账号认领"请求——即同时携带 `identifier`（昵称/代号）、`password`（新密码）与 `token`（原设备令牌）的 `loginAccount` 调用。
- **实际行为与期望行为**：
  - 期望（方案 §1.3-目标4、交接单 P1-1 闭环描述、Round 1 修复后验收标准）：持有原令牌的合法原主可以"出示令牌 → 校验通过 → 绑定新密码"，并保留该正向用例。
  - 实际：`loginAccount` 的第一段就是 `if (input.token?.trim()) { ... return success(...) }`。因此进入路径 B 时 **`input.token` 必然为空**（非空已在 `:236` 早返回），`:257` 的 `ownershipToken` 恒为 `undefined`、`:258` 的 `isOwner` 恒为假 → `:260-265` **恒返回 `account-password-required`**，`:267-274` 的"绑定新密码"代码块在任何输入下都不可达（死代码）。合法原主与冒名者得到完全相同的结局。
  - 连带：`account-password-required` 的提示语要求用户"在原设备用账号令牌登录"，但路径 A（令牌登录）需要用户**粘贴令牌**，而方案 §2.5 的登录面板与 §3 的六语种键表只提供了 `room.copyAccountToken` / `room.accountTokenCopied`（复制当前令牌），**没有任何令牌输入项的键**，该引导语在方案内无对应可操作入口。
- **根因**：同一入参 `token` 被赋予两种互斥语义——路径 A 视其为"已有会话凭据"并抢先返回，认领分支又视其为"所有权证据"；方案未对"携带 identifier 的认领请求"与"纯令牌登录"做分流（也未引入独立字段如 `ownershipToken`）。
- **影响范围**：Round 1 的 P1-1 只闭环了"拒绝无凭据接管"（拒绝侧成立），"合法原主可认领"（正向侧）在方案内**不可达**；需求 §1.3「已注册玩家无法登录回来」的认领通道实际不存在。实施者若照字面实现，将得到一条永远返回 `account-password-required` 的分支与一段永久死代码，且 P1-1 的正向守门用例无法编写通过。
- **验证证据**：纯控制流推导（`:230` 的早返回与 `:258` 的 `input.token` 读取互斥）——同一方法内 `input.token` 非空即在 `:236` 返回，故 `:257` 处必然为空。方案全文无任何其它写入 `passwordHash` 的路径（`createAccount` 除外，仅覆盖新注册账号）。
- **修复建议**：二选一并写入方案——(a) 分流条件改为「`input.token` 非空 **且** `input.identifier` 为空」才走路径 A，否则进入路径 B 并把 `token` 当所有权证据；(b) 拆分字段（`loginAccount({ identifier, password, ownershipToken })`），HTTP 层显式区分；同时补 §2.5/§3 的令牌输入项键（如 `room.accountTokenInput` / `room.accountTokenPlaceholder`）以支撑提示语。
- **修复后验收标准**：新增正向单测——对一条无 `passwordHash` 的历史账号，传入 `identifier + 新密码 + 有效原令牌`，断言 `ok:true` 且落盘 `passwordHash` 非空、`tokenHashes` 追加新会话；同时保留负向用例：仅 `identifier + 新密码` 时失败且 `passwordHash` 保持 `undefined`、原 `tokenHashes` 不变。

---

### P1-2 `loginAccount` 混用快照与活对象：按昵称/代号登录恒落入"无密码认领"分支，且持久化会写坏账号行

- **级别**：P1
- **文件与行号**：方案 `:245-248`（`this.findByPublicHandle(identifier) ?? this.findByDisplayName(identifier) ?? this.accounts.get(identifier)`）、`:193-199`（`findByDisplayName` 返回 `getAccountSnapshot(account)`）、`:255`、`:278`、`:287`、`:290`（`this.persist(account)`）；对端 `src/server/accounts.ts:212-216`（`findByPublicHandle` 返回 `AccountSnapshot`）、`:601-613`（`getAccountSnapshot` 仅 7 个字段，**不含** `passwordHash` / `passwordSalt` / `tokenHash(es)`）、`:294-300`（`persist` 把入参对象原样写入 JSONL）、`:150-160`（`loadFromFile` 以最新行覆盖同 id 账号）
- **触发条件**：(a) 已注册用户按**昵称或公开代号**（即方案 §3 字典中 `room.accountIdentifier` = "Name or Handle" / 占位符 "Name or @handle" 所明示的两种标识）提交密码登录；(b) 认领分支一旦可达（修复 P1-1 后）即触发 `:287` 与 `:290`。
- **实际行为与期望行为**：
  - 期望：`identifier` 命中账号后，用落盘的 `passwordSalt` / `passwordHash` 做密码比对，成功则签发新会话。
  - 实际（语义面）：`findByPublicHandle` / 方案新增的 `findByDisplayName` **都返回 `AccountSnapshot`**（`accounts.ts:601-613` 的字段副本，无密码字段）。因而 `:255` 的 `!account.passwordHash` 对**任何**有密码账号也恒为真 → 走"无密码认领"分支 → 因 P1-1 所述 `isOwner` 恒假 → **按昵称/代号登录 100% 返回 `account-password-required`**，`:278` 的 `verifyPassword` 不可达。唯一能走到密码比对的输入是**内部账号 id（`acct_*`）**（`:248` 第三分支取到活对象），而该输入方式方案从未面向用户开放。
  - 实际（类型面）：按字面实现无法通过门禁 1。独立探针实测：`Property 'passwordHash' does not exist on type 'AccountSnapshot'`（`TS2339`）、`Property 'tokenHashes' does not exist on type 'AccountSnapshot'`（`TS2339`），`this.persist(account: StoredAccount)` 亦无法接受快照类型——三处 `tsc` 红。
  - 实际（数据面，修复 P1-1 后暴露）：若实施者为绕过类型而断言/展开快照，`:287` 的 `account.tokenHashes.filter(...)` 会在 `undefined` 上抛 `TypeError`（快照无该字段）；`:290` 的 `persist(account)` 会把**缺 `tokenHash` / `tokenHashes` / `passwordHash` / `passwordSalt` 的行**追加进 `accounts.jsonl`，而 `loadFromFile` 以"同 id 最新行胜出"（`accounts.ts:150-160`）→ 重载后该账号的密码与全部会话令牌被静默抹除（`authenticate` 随后在 `tokenHashes.includes` 上崩溃），属数据丢失级陷阱。
- **根因**：方案把"对外返回的快照副本"与"内部可变记录 `StoredAccount`"当成同一实体：既用快照做凭证读取，又对快照做字段赋值与落盘。既有代码的快照/活对象边界（`getAccountSnapshot` 副本语义、`persist(StoredAccount)` 私有签名）在方案中未被承认。
- **影响范围**：登录这一核心功能的**主用标识（昵称/代号）100% 不可用**；按字面实现直接违背 §5「`npx tsc --noEmit` 0 错误」；绕过类型后演变为账号数据丢失。未定为 P0 的唯一原因是当前该持久化/赋值路径被 P1-1 的早返回遮蔽（尚不可达），一旦按建议修好 P1-1 即立即可达。
- **验证证据**：独立探针（真实类型，用后已删）→ `src/…/__r2_probe_types.ts(27,52): error TS2339 … 'passwordHash' does not exist on type 'AccountSnapshot'`、`(28,55) … 'tokenHashes' …`；对照组（现有 6 码 `AccountError` 赋给 `RoomError`）无报错，证明探针敏感。`accounts.ts:601-613` 字段清单与 `:294-300` 原样落盘逐行比对。
- **修复建议**：在方案中明确"**账号检索统一走内部活对象**"：新增私有 `findLiveByDisplayName` / 以 `playerId` 取 `this.accounts.get(id)` 后再做密码比对与变更；`findByPublicHandle` / `findByDisplayName` 保持只读快照语义仅供 HTTP 返回；`persist` 前断言目标为 `StoredAccount`（或改为按 id 重新取活对象落盘）。
- **修复后验收标准**：单测覆盖——(1) 用**昵称**、用**公开代号**、用 `@代号` 三种 `identifier` 分别登录一个有密码账号，均返回 `ok:true` 并命中 `verifyPassword` 成功分支；(2) 错误密码返回 `invalid-password`；(3) 认领成功落盘后，用新进程/新 store 重新 `loadFromFile`，`passwordHash` 与 `tokenHashes` 仍存在且旧令牌可 `authenticate`；(4) `npx tsc --noEmit` 0 错误。

---

### P2-1 `room.nameReservedError` 六语种文案无上屏通道：`room:error` 广播在 ACK 之后覆盖本地化提示，方案未定义错误码→字典映射层

- **级别**：P2
- **文件与行号**：方案 `:352-356`（§2.3.2 要求 `setError(dictionary.room.nameReservedError)`）、`:507`（§3 六语种 `room.nameReservedError`）；对端 `src/server/room-socket.ts:1016-1035`（`acknowledgeAndBroadcast` 先 `ack(response)`，再对非 `guest-session-invalid` 的失败 `socket.emit("room:error", response.error)`）、`:247-262`（`room:join` 把 `player` 失败原样交给它）、`src/components/hooks/useRoomSocket.ts:183-185`（`room:error` 监听器 `setError(roomError.message)`）、`:228`（`applyRoomAck` 失败分支 `setError(response.error.message)`）、`src/components/hooks/room-state-utils.ts:114-116`（`isRoomErrorLike` 只校验 `message`，无错误码白名单）；同类路径 `useLobbyPresence.ts:152/216/500`、`useRoomChat.ts:63/192`
- **触发条件**：访客以已注册玩家的昵称/代号执行 `room:join` / `room:join-target`（或 `room:create`、匹配、公聊、`presence:join`）。
- **实际行为与期望行为**：
  - 期望（Round 1 P2-1 修复后验收标准：「UI 显示 `nameReservedError` 文案」，方案 §2.3.2「确保提示文案准确上屏」）：用户看到本语种的"该名称属于已注册玩家，请登录使用。"。
  - 实际：服务端在 `ack(error)` 之后**紧跟**一条 `room:error` 事件（同一 socket、同一连接、FIFO）；客户端 `room:error` 监听器随后执行 `setError(roomError.message)`，把 ACK 回调里刚设置的字典文案**覆盖**为服务端英文 `message`。独立探针实测派发顺序恒为 `ack callback → event room:error`（见下证据）。此外 `applyRoomAck`（`:228`）与 lobby/chat/presence 各失败路径**全部**上屏 `response.error.message`，仓库内不存在任何"错误码 → 字典"的映射层，故新增的六语种 `room.nameReservedError` 无论走哪条路径都不会成为最终展示文本。
- **根因**：方案只声明"调用 `setError(dictionary.…)`"，未承认既有错误上屏通道是"服务端英文 `message` 直通"，也未处理同一失败会被**双通道**（ACK + `room:error` 广播）投递、后者覆盖前者的事实。
- **影响范围**：Round 1 P2-1「提示文案沦为死文案」仅被**部分**修复——从"完全不显示"变为"显示英文服务端文案"。非英语用户（该仓库 6 语种硬约束，`AGENTS.md` 1.2）无法获得本语种引导；新增的 6 个语种文案键成为无人消费的死键（`dictionaries.test.ts` 结构守门只保证键齐全，不保证被渲染）。
- **验证证据**：独立 Socket.IO 探针（同进程临时 HTTP+Socket.IO 服务端，复刻 `ack(...)` 后 `socket.emit("room:error", …)` 的服务端写法，用后即删），客户端派发顺序输出：
  ```
  client dispatch order:
    ack callback -> "This display name is registered to an account."
    event room:error -> "This display name is registered to an account."
  ```
  即 ACK 回调先执行、`room:error` 后执行，最终文本由后者决定（英文）。
- **修复建议**：在方案中明确"错误码 → 字典"映射的唯一入口（例如 `room-state-utils.ts` 新增 `resolveRoomErrorText(code, messages)`），并规定 ACK 回调与 `room:error` 监听器**共用**该函数；或对 `name-reserved` 抑制服务端 `room:error` 广播（与 `guest-session-invalid` 同等对待），保证 ACK 单通道投递。
- **修复后验收标准**：以 6 语种分别触发 `room:join` 保留名冲突，断言最终展示文本为对应语种的 `nameReservedError`（而非服务端英文）；断言 `room:error` 广播不再二次覆盖；`room:create` / `matchmaking:find` / `public-chat:send` 路径文案一致。

---

### P3-1 Round 1 P3-1 闭环不彻底：`RoomErrorCode` 姊妹封闭联合未同步扩充（实现即门禁 1 红），且承诺的 HTTP 状态码映射在方案中零处出现

- **级别**：P3
- **文件与行号**：方案 `:171-187`（仅扩充 `AccountError.code`）、`:528-532`（§5 声称基线 0 错误）；对端 `src/server/domain/room-state-machine.ts:166-201`（`RoomErrorCode`，35 个成员的**独立**封闭联合，其中 6 个账号错误码与 `AccountError.code` 手工重复）、`:203-206`（`RoomError`）、`src/server/room-contract.ts:23-44`（`RoomAck` 的失败分支为 `RoomError`）、`src/server/room-socket.ts:219-221/250-251/269-270/300-304`（`if (!player.ok) acknowledgeAndBroadcast(..., player, ack)`）；Round 1 修复建议 `docs/handoff/2026-09-23-workbuddy-code-review-round1-handoff.md:127`；交接单自述 `…round1-remediation-handoff.md:38`
- **触发条件**：按方案 §2.2.3 扩充 `AccountError.code` 后编译；以及实现登录端点时按交接单声称"明确 HTTP 状态码映射"。
- **实际行为与期望行为**：
  - 期望：方案文本中出现的每个标识符都可在"现状"或"本方案新增"中检出；实现后 `tsc` 0 错误（Round 1 P3-1 验收标准）。
  - 实际：`room-socket.ts` 的多处 `if (!player.ok) acknowledgeAndBroadcast(..., player, ack)` 之所以今天能编译，唯一原因是 `AccountError["code"] ⊆ RoomErrorCode`（两个联合的手工同步）。新增 `account-not-found` / `account-password-required` / `invalid-password` / `name-reserved` 后该子集关系破裂，且 `AccountError` 的失败联合**无法按码收窄**，故即使只由 `resolvePlayerIdentity` 产生 `name-reserved`，这些调用点也会整体失配。方案全文未出现 `RoomErrorCode` / `room-state-machine.ts` / `room-contract.ts` 任何一处（grep 0 命中）。
  - 另一处：交接单声称已"明确 HTTP 状态码映射（400/401/409/429）"，但方案全文（含 §2.2.2/§2.2.3/§4）**零处**出现 401/409/429/状态码字样（grep 0 命中）；Round 1 明示要求的 UNAUTHORIZED/CONFLICT 映射在方案中缺失，而现有 `online-server.ts:101-110` 的状态码决策是 `duplicate-* → 409 : 400` 的内联写法，新增 4 码必然需要同处扩展。
- **根因**：与 Round 1 P3-1 同源——新增封闭联合成员时只更新了"直接对端"，未枚举全部需要手工同步的封闭联合与调用点；修复性文案更新（交接单）与方案文本未同步。
- **影响范围**：实施阶段门禁 1 必然红灯（返工），或实施者用 `as` 绕过类型从而吞掉编译期保护；HTTP 语义（错误码 → 状态码）在方案层面无契约，易出现 400/401/409 混用。
- **验证证据**：独立类型探针（真实类型，用后已删）：
  ```
  src/server/__r2_probe_types.ts(21,14): error TS2322: Type 'PlannedAccountError' is not assignable to type 'RoomError'.
    Type 'PlannedCode' is not assignable to type 'RoomErrorCode'.
      Type '"account-not-found"' is not assignable to type 'RoomErrorCode'.
  ```
  同文件对照组（现有 6 码 `AccountError` → `RoomError`）无任何报错 → 证明失配确由本轮新增的 4 码引起。另：`grep -n "401\|409\|429\|状态码" docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md` → 0 命中。
- **修复建议**：在 §2.2.3 的方法集演进清单中补入"`RoomErrorCode`（`room-state-machine.ts`）同步新增 `account-not-found` / `account-password-required` / `invalid-password` / `name-reserved`"，并给出一张显式状态码映射表（例：`account-not-found`/`invalid-password`/`account-password-required` → 401，`duplicate-*` → 409，限流 → 429，参数非法 → 400），标明落点为 `online-server.ts` 路由内联判断。
- **修复后验收标准**：方案文本内上述 4 码可在"本方案新增"（`AccountError` 与 `RoomErrorCode` 两处）检出，状态码映射表存在且与 `online-server.ts` 落点一致；实现后 `npx tsc --noEmit` 0 错误。

---

### P3-2 `tokenHashes` 淘汰语义与伪代码不一致：文档承诺"保留最新 5 个**最近活跃**设备"，代码按签发顺序截断，长期使用中的旧设备会被静默踢出

- **级别**：P3
- **文件与行号**：方案 `:110`（注释"最多保留 5 个**最近活跃**设备"）、`:117`（"超出上限时淘汰**最久未活跃**令牌"）与 `:287`（`account.tokenHashes = [newTokenHash, ...account.tokenHashes.filter(...)].slice(0, 5)`）、`:296-309`（`authenticate` 只更新 `lastSeenAt`，**不调整 `tokenHashes` 次序**）
- **触发条件**：同一账号累计登录过超过 5 台设备，且其中较早加入的设备仍在持续使用（例如常用手机 + 陆续登录过 5 个浏览器）。
- **实际行为与期望行为**：
  - 期望（文档口径）：淘汰"最久未活跃"的令牌，最活跃设备始终保留。
  - 实际（伪代码口径）：`:287` 是"新令牌置首 + 按既有数组位置截断到 5"，而 `authenticate` 不回写次序 → 淘汰依据是**签发先后**而非活跃度；一台仍在每日使用、但签发顺序排在第 6 位之后的设备会被下一次登录挤出数组，其令牌立即 `authenticate` 失败（静默登出）。
- **根因**：`tokenHashes` 只存哈希、无每令牌的活跃时间戳；文档按"活跃度 LRU"描述，伪代码实现的是"签发序 FIFO"，两者未对齐。
- **影响范围**：与 P2-4 要解决的"多端静默登出"同类，仅被 5 台阈值掩盖；文档与实际语义不符会让实施者与测试用例各按一套口径验收。
- **验证证据**：方案 `:117` 与 `:287` 逐字比对；`:304-306` 只做 `includes` 命中判断，未做 move-to-front（`authenticate` 亦无任何 `tokenHashes` 赋值）。
- **修复建议**：二选一——(a) 给每会话加 `lastActiveAt`（`{ hash, lastSeenAt }[]`）并按其排序淘汰；(b) 保留 FIFO 实现，把文档改为"保留最近 **5 次签发**的会话，更早的设备需重新登录"，并在 §2.2.1 注明不做活跃度刷新。
- **修复后验收标准**：按选定语义补单测——(a) 6 台设备依次登录且第 1 台持续调用 `authenticate` 后仍可用；(b) 第 6 次登录后第 1 台令牌失败，且文档描述与断言一致。

---

### P3-3 `ScryptConcurrencyGate` 未定义队列上界与超时（方案声明"安全受控"缺少背压契约）

- **级别**：P3（无已证实的越界，属方案承诺与实现契约的缺口）
- **文件与行号**：方案 `:128-147`（`ScryptConcurrencyGate`）、`:168-169`（"在 2 并发闸门与 10次/分 IP 限流双重保护下安全受控"）
- **触发条件**：多 IP 并发登录/注册压测（限流按 IP 计数，`online-server.ts:29-33/88-96` 的 `FixedWindowRateLimiter` + `getRequestClientKey` 只能约束单 IP）。
- **实际行为与期望行为**：期望"安全受控"；实际伪代码的等待队列 `queue: Array<() => void>` 无长度上限、无等待超时、无 503 拒绝路径——请求只会在闸门前无限排队（单次约 38~45ms、并发 2 ⇒ 吞吐上限约 50 次/秒，超出部分按到达速率累积等待与内存）。方案未定义排队上限或降级响应。
- **根因**：闸门只约束并发度，未定义到达侧背压。
- **影响范围**：多 IP 场景下登录端点的排队延迟无上界；与方案"安全受控"的表述不符（属健壮性缺口，未观测到对局事件循环受影响，故不升 P2）。
- **验证证据**：方案 `:132`/`:136`（`queue` 无界 `push`）；`online-server.ts:29-33` 单 IP 限流口径。**未复现越界**：独立模拟探针尝试构造"唤醒后不复查条件"导致 `active > 2` 的反例未成功（微任务 FIFO 使 `active -= 1` 与唤醒在同一同步块内完成，新增到达只能来自后续宏任务）——故本条不主张并发上界被突破，仅主张"队列上界/超时未定义"。
- **修复建议**：在方案中补"队列上限（如 32）与超时（如 500ms）→ 返回 429/503"的背压契约，或注明"排队无上界但受 10次/分/IP 限流约束"的显式取舍。
- **修复后验收标准**：方案含明确的上界/超时/拒绝码条款；实现后有对应单测（超出上限返回 429/503）。

---

## 三、待确认风险与未验证项

**待确认风险**

1. **非 `Cf` 不可见字符与同形字仍可绕过保留名守门**：独立探针实测（复刻方案 `:82-89` 函数）——`"Alice\u3164"`（HANGUL FILLER）→ `"aliceᅠ"`、`"Alice\u115F"`（HANGUL CHOSEONG FILLER）→ `"aliceᅟ"`、`"Alice\u2800"`（BRAILLE BLANK）→ `"alice⠀"`，**均不命中 `"alice"`，守门放行**，而这三类字符在多数字体中不可见（NFKC 亦不消除，`U+3164` 仅映射为同样不可见的 `U+1160`）；西里尔 `А` / 希腊 `Α` 同理。Round 1 已把该范围列为产品取舍（`…round1-handoff.md:166`），本轮**不据此新立缺陷**，但方案 §2.1/§4 中"彻底封堵变体绕过漏洞""断言均被拦截"的绝对化表述应下调为"覆盖零宽与格式控制字符变体"，或显式扩展为 `\p{Default_Ignorable_Code_Point}` + 同形字骨架比对，并注明边界。
2. **遗留账号（无令牌）彻底不可找回且其显示名永久被占用**：按 §1.3-目标4 的取值，无 `passwordHash` 且原令牌已随缓存清除而丢失的账号，既无法认领（`account-password-required`），其昵称/代号又因 `isNameReserved` 对全部账号生效而永久不可被任何新账号使用——这正是用户报告的场景（'退出登录、清除缓存或更换设备后…'）。方案未公示该取舍、未提供改名释放/人工找回/一次性认领码等降级通道。建议在方案中显式写明取舍与后续入口，或提供"限定时间窗 + 一次性认领码"的折中。
3. **`accounts.jsonl` 实际历史规模**：方案与交接单沿用"80+ 条无密码记录"自述口径，本次审查未读取生产数据文件（不在仓库内），受害面未独立核验。
4. **错误码与客户端的发布顺序**：方案 §2.3.2-`:356` 声称旧客户端"降级为通用错误弹窗，零协议破坏"。已核实 `isRoomErrorLike` 只校验 `message`（`room-state-utils.ts:114-116`），旧客户端确实会展示服务端英文文案而非崩溃，该结论成立；但方案未给出版本兼容矩阵（新旧客户端 × 新旧服务端），建议补一行说明。

**未验证项**

1. **四道门禁未全量复跑**：本 diff 全为 `.md`（源码零改动），故仅复跑 `npx tsc --noEmit`（基线 0 错误，已在探针删除后复核）；`lint` / `test` / `build` 未重复执行，结论不受影响。方案 §5 引用的"35 套 / 339 例 / 18 页面"取自交接单自述，未独立复核。
2. **`scrypt` 异步耗时（38~45ms）与"0.00ms 事件循环停顿"未在真实服务中采样**：本轮仅做了闸门语义的模拟探针；真实数值需在实现阶段用事件循环延迟采样（`perf_hooks.monitorEventLoopDelay`）复核，Round 1 的 40.7ms 同步实测（Node v25.8.0 / 6 核）仅用于对照。
3. **`room.nameReservedError` 的最终渲染**：P2-1 的结论基于静态调用链 + 独立 Socket.IO 派发顺序探针（同进程、非本项目服务端）；未在本项目真实服务端上做端到端像素/文案采样（本仓库无 jsdom，且本轮为文档审查）。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**

1. **P1-1 / P1-2（同一处方法重新定稿）**：先定"认领请求如何携带所有权证据"（分流条件或独立字段），再统一"账号检索必须返回内部活对象"的契约，并补令牌输入项的六语种键；两者互为前提，必须同轮修订。
2. **P2-1（错误文案上屏通道）**：确定"错误码 → 字典"的唯一映射入口，并明确 `room:error` 广播与 ACK 的优先级关系。
3. **P3-1（契约成员同步）**：`RoomErrorCode` 扩充 + HTTP 状态码映射表，落点写进 §2.2.3 演进清单。
4. **P3-2 / P3-3（会话与背压语义）**：统一"活跃度 LRU"与"签发序 FIFO"的口径，补队列上界/超时契约。

**复审验收标准（Round 3）**

1. 方案文本内**不存在互相否定的条款**：`loginAccount` 的路径 A/B 分流条件与认领分支的所有权证据来源唯一且可达；承诺"保留最新 5 个最近活跃会话"与 `tokenHashes` 的实际淘汰规则一致。
2. 逐项复核本次 6 条缺陷（2×P1 / 1×P2 / 3×P3），每条附可执行验收：新增正向认领用例（含落盘后重新加载）、按昵称/代号/`@代号` 三条登录路径均命中密码比对、6 语种 `nameReservedError` 最终展示文本断言、`RoomErrorCode` 与状态码映射表可检出、`tsc` 0 错误。
3. 方案对"遗留账号无令牌不可找回 + 名称永久保留"给出显式取舍说明或降级通道；对非 `Cf` 隐形字符与同形字给出边界声明，删除"彻底封堵/彻底斩断"类未加限定的绝对表述。
4. 上一轮已闭环项（P2-2 异步化、P2-3 四类变体拦截、P2-4 多会话结构、P2-1 错误码解耦）不得回退：`duplicate-name` 自愈白名单、`guest-session-invalid` 静默语义、既有 6 个错误码语义均保持不变。

---

**审查结论**：本轮 **未通过**。Round 1 的 8 项缺陷中 4 项（P2-1 解耦面 / P2-2 / P2-3 / P2-4）具备实质闭环，但 P1-1 的正向认领链路因路径 A 前置而不可达（P1-1）、`loginAccount` 的快照/活对象混用使按昵称与代号的登录整体失效并埋下数据丢失陷阱（P1-2）、`nameReservedError` 六语种文案仍无上屏通道（P2-1）、`RoomErrorCode` 与 HTTP 状态码映射两处契约成员仍缺（P3-1），另有会话淘汰语义与闸门背压两处契约缺口（P3-2 / P3-3）。请按上述顺序修复后派发 Round 3 复查。
