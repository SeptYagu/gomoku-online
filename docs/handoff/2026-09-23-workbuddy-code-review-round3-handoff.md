# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案 · 独立代码审查报告（Round 3 终审复查）

- **审查日期**：2026-09-23
- **审查类型**：纯技术方案 / 架构设计审查（Round 3 复查，diff 全为 `.md`，源码零改动）
- **被审 HEAD SHA**：`4d9bdfce1c40fd1efe5118ccdac2980133d8d872`（`docs(plan): remediate Round 2 review findings for online PVP auth, naming, and leaderboard plan`）
- **基准 SHA**：`b2c6383`
- **实际审查范围**：`git diff b2c6383..4d9bdfc`（8 文件，+1290/−0）；本轮增量 `git diff fb17609..4d9bdfc`
- **判定结论**：**未通过**（0×P0 / 0×P1 / **2×P2** / **1×P3**）

---

## 一、审查基本信息与通过项简述

工作区干净（探针写于仓库外，用后即删，`git status` 复核为空），`git pull --ff-only` 后 HEAD 与被审提交一致（`4d9bdfc`），无本地改动。Round 2 六项中 **P1-1 / P1-2 / P3-1 / P3-2 实质闭环**：路径 A/B 显式分流后（方案 `:346`）路径 B 的 `ownershipToken`（`:367`）与绑定密码块（`:381-388`）在 `identifier + token` 输入下**确实可达**（不再有早返回遮蔽）；`findLiveAccountByIdentifier`（`:285-312`）统一返回 `StoredAccount` 活对象、`findByDisplayName` 仅回快照，`tsc` 类型面与落盘抹除面均已消除；`RoomErrorCode`（`room-state-machine.ts:166-201`，35 成员）新增 4 码后与 `AccountError.code` 的子集关系恢复，`mapAccountErrorToStatusCode`（`:252-270`）覆盖新联合全部 10 码；会话淘汰口径已全文统一为签发序 FIFO（`:118/:126/:700`）。已独立执行 3 组负向/边界验证：**闸门超时 1 组被证伪（见 P2-1）**、队列上限与身份比较对照 2 组符合预期。另核实 Round 2 曾指出的"4 处 `room:error` 发射点仅 1 处被抑制"**不构成新的用户可见缺陷**（`roomSocket.setError` 被 `useFriendRoom.ts:176/192/202` 共享给 presence/chat/game 各 hook，映射后的本地化文本在 ack 之后到达并最终生效），故未据此立项。

---

## 二、审查发现与缺陷清单

### P2-1 `ScryptConcurrencyGate` 超时分支恒不可达：`QUEUE_TIMEOUT` 永不触发，闸门不被释放时排队请求无限挂起（本轮新引入死代码）

- **级别**：P2
- **文件与行号**：方案 `docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md:159-167`（超时回调内 `const idx = this.queue.findIndex((item) => item.resolve === resolve)`，`:160`）与 `:169-175`（`queue.push({ resolve: () => { clearTimeout(timer); resolve(); }, reject })`）；契约声明 `:210`（"排队等待超时 5000ms"）与 `:701`（§4 P3-3 验收行"超时触发 `QUEUE_TIMEOUT`"）；释放侧 `:184-185`
- **触发条件**：`active >= maxConcurrent` 且 `queue.length < maxQueueSize` 进入等待；只要前序 `fn()` 迟迟不结束（libuv 线程池被其它工作占满、哈希耗时异常拉长），排队者等待时间超过 `timeoutMs`。
- **实际行为与期望行为**：
  - 期望（`:210` / `:701` / 交接单 P3-3 自述）：排队超过 5000ms 抛 `QUEUE_TIMEOUT` → 503 降级，杜绝无界等待。
  - 实际：`findIndex` 的比较对象是 `:169-175` 新构造的**包装闭包** `resolve`，而 `resolve` 是 Promise executor 的原生 resolve，两者**永不相等** ⇒ `idx === -1` ⇒ `if (idx !== -1)` 恒假 ⇒ 定时器回调为空操作，promise 永不 reject；`:174` 压入的 `reject` 亦**无任何调用点**。即超时保障整条链路是从未被触发的死代码。
- **根因**：把"队列项"与"executor resolvers"混为同一引用——`:{resolve: wrapper}` 入队后再用 executor 的 `resolve` 去回查队列项，缺少具名 item 引用。
- **影响范围**：P3-3 承诺的两项背压中仅"最大排队深度 32"生效；"排队超时"为零。闸门在前序任务不结束时退化为**无界等待**（该场景正是超时机制存在的唯一理由）；§4 P3-3 明文要求的验收（"超时触发 `QUEUE_TIMEOUT`"）无法通过。属限制在登录/注册哈希路径的健壮性缺陷，未观测到并发上界被突破，故不升 P1。
- **复现方法 / 运行证据**：独立 Node 探针（逐字转写方案 `:138-188` 的 JS 版，置于仓库外临时目录，用后已删）：
  ```
  Test A (timeoutMs=150, waiter queued behind 600ms job): { settled: 'resolved', ms: 621 }
  Test B (maxConcurrent=1, maxQueueSize=2, 3 extra waiters): [ 'ok', 'ok', 'QUEUE_FULL' ]
  Test C (timeoutMs=120, in-flight job never settles): { settled: null, waitedMs: 401, queueLength: 1 }
  item.resolve === executor resolve ? false      # 对照组
  ```
  A 组：排队者未在 150ms 抛 `QUEUE_TIMEOUT`，而是等前序结束后于 621ms 正常 resolve；B 组证明 `maxQueueSize` 生效（第 3 个排队者抛 `QUEUE_FULL`）；C 组：配置 120ms 超时、前序任务永不 settle，400ms 后该 promise 仍未 settle 且仍留在队列（**无限挂起**）；对照组证明 `item.resolve === resolve` 恒为 `false`。
- **修复建议**：给队列项建立具名引用后再回查，例如
  ```ts
  const waiter = { resolve, reject };
  const timer = setTimeout(() => {
    const idx = this.queue.indexOf(waiter);
    if (idx !== -1) { this.queue.splice(idx, 1); reject(timeoutError()); }
  }, this.timeoutMs);
  this.queue.push(waiter);
  ```
  或改用 `Promise.race([waiterPromise, timeoutPromise])` 并在超时分支按 `indexOf(waiter)` 出队。同时把 `QUEUE_FULL / QUEUE_TIMEOUT → 503` 的映射落点写进 §2.2.3（现仅存在于 `:271` 注释）。
- **修复后验收标准**：(1) `maxConcurrent=1`、`timeoutMs=50`、前序任务 500ms 时，第二个请求在 ~50ms 以 `QUEUE_TIMEOUT` 拒绝；(2) 前序任务永不结束时该请求不悬挂；(3) 队列满仍抛 `QUEUE_FULL`；(4) 上述三条有对应自动化单测且全绿。

---

### P2-2 P2-1 修复的本地化文案仍缺"提供侧"：`messages.nameReservedError` 在方案内无来源，`duplicateNameError` / `accountTokenInvalidError` 无字典键

- **级别**：P2
- **文件与行号**：方案 `:493-517`（`RoomErrorMessages` 与 `resolveRoomErrorMessage`）、`:522`（`resolveRoomErrorMessage(..., messagesRef.current)`）、`:685`（§3 键表仅补 `room.nameReservedError`）、`:6`（§1 涉及范围文件清单）；对端 `src/components/hooks/room-state-utils.ts:42-54`（`UseFriendRoomOptions.messages` 仅 7 个既有键）、`src/components/GameShell.tsx:221-232`（**全仓唯一** `messages` 字面量构造点）、`src/components/useFriendRoom.ts:129/154/193`（messages 透传）、`src/components/hooks/useRoomSocket.ts:82/112/183-184/228`
- **触发条件**：按方案字面实现（§1 涉及范围不含 `GameShell.tsx`，方案全文未出现 `messages` 装配描述）后，触发任一保留名冲突（`room:join` / `room:create` / `matchmaking:find` / `presence:join` / `public-chat:send`）。
- **实际行为与期望行为**：
  - 期望（`:522` 与 §4 P2-1 验收）："保证 6 语种本地化文案精准生效"，验收断言"最终展示文本为各语种 `nameReservedError`，非英文"。
  - 实际：`resolveRoomErrorMessage` 只有在第二个参数**实际带上** `nameReservedError` 时才返回本地化文本，否则回落 `error.message`（服务端英文）。而 `messages` 对象唯一的构造点是 `GameShell.tsx:223-230`，其字面量仅含 `chatSendTimeout / connectionFailed / connectionFailedXhr / joinTargetRequired / leaveRoomTimeout / roomCodeRequired / roomError` 七个既有键；`UseFriendRoomOptions.messages` 的类型亦未被方案扩展。由于新增键全部为**可选**，即使实现者补全了类型，`GameShell` 不传该键也**不会触发任何 TS 报错**（缺可选属性合法）⇒ 静默回落英文。叠加本方案已在 `:484` 抑制 `room:join` 的 `room:error` 二次广播，用户最终只剩服务端英文 ack 文案 ⇒ **Round 2 P2-1 的原始症状（本地化提示不显示）整体复发**，新增的 `room.nameReservedError` 仍是无人消费的死键。
  - 连带：`RoomErrorMessages`（`:495-500`）声明了 `duplicateNameError` / `accountTokenInvalidError`，但 §3 六语种键表（`:668-685`）**无对应键**，方案内亦无提供侧 ⇒ 两个悬空契约成员。
- **根因**：修复闭环只完成"映射函数（`resolveRoomErrorMessage`）+ 消费侧（`useRoomSocket` 两处上屏）"，未指定**提供侧**——dictionary 键到 `messages` 对象的装配点与类型扩展；Round 2 验收要求的能力（文案真正上屏）缺少最后一环。
- **影响范围**：全部 5 条触发路径的本地化文案；§4 P2-1 的验收断言不可能通过（映射函数单测可过，端到端不可过）。
- **复现方法 / 运行证据**：静态核验——`grep -rn "messages: {" src/` 仅命中 `GameShell.tsx:223`；`messages` 的 7 键与 `RoomErrorMessages` 字段集（4 键）无交集覆盖；方案全文（含 §2.3.2 与 §3）零处提及 `GameShell` 或"messages 装配"。本轮源码零改动，字典键 `nameReservedError` 在 `src/` 内零命中。
- **修复建议**：在 §2.3.2 补"装配契约"三件套：① `UseFriendRoomOptions.messages`（`room-state-utils.ts:44-53`）扩展 `nameReservedError`（并按需扩展 `duplicateNameError` / `accountTokenInvalidError`），或明确以 `RoomErrorMessages` 为其唯一类型；② 把 `src/components/GameShell.tsx` 写入 §1 涉及范围，并在 `:223-230` 字面量补 `nameReservedError: dictionary.room.nameReservedError`；③ §3 键表补齐 `RoomErrorMessages` 中出现的每一个键（或删掉无键的悬空字段），杜绝"接口有字段、键表无键"。
- **修复后验收标准**：方案文本可检出"提供侧"落点（文件 + 行号）与类型扩展条目；§3 键表与 `RoomErrorMessages` 字段集一一对应；实现后新增断言——"指定 `name-reserved` 且 `messages` 含本语种文案时，共享 error state 的最终值 === `dictionary.room.nameReservedError`"，6 语种逐一成立。

---

### P3-1 路径 A（纯令牌恢复）在方案 UI 上不可达：唯一令牌输入绑定 `ownershipToken`，而路径 A 只认 `input.token`

- **级别**：P3
- **文件与行号**：方案 `:346`（`if (input.token?.trim() && !input.identifier?.trim())`）、`:367`（`input.ownershipToken?.trim() || input.token?.trim()`）、`:277/280`（两字段的语义注释）、`:649-655`（§2.5 令牌输入 `<input placeholder={labels.accountTokenPlaceholder} value={ownershipToken} ... />`）、`:682`（`room.accountTokenPlaceholder` = "Original token (for claim/**recovery**)"）、`:693`（§4 P1-1 验收仅覆盖认领正向与无凭据拒绝）
- **触发条件**：用户持原设备令牌、无昵称/无密码，走 §1.3 目标 5 承诺的"原令牌输入通道"以恢复会话。
- **实际行为与期望行为**：
  - 期望：该唯一令牌输入同时服务"认领"与"纯令牌恢复"（占位文案明示 claim/recovery；`:649` 注释亦写"认领/纯令牌恢复输入通道"）。
  - 实际：方案未定义客户端→API 的字段映射。按 §2.5 的字面绑定（`value={ownershipToken}`，与 `identifier` / `password` 同为 API 字段名）提交则 `input.token` 恒空、`input.identifier` 亦空 ⇒ 路径 A（`:346`）**永不被选中**，落入路径 B 后于 `:356-358` 以 `account-not-found`（"Account identifier is required."）失败 ⇒ "找回"通道为空；`account-password-required` 的引导语（`:377`）要求用户"在原设备用账号令牌登录"，而方案内不存在能触发路径 A 的 UI 入口。
  - 定级 P3 而非更高的理由（已做证伪尝试）：路径 A 在 **API 层**可达（`{ token }`），且若实现者把该单一输入框映射为 `token`，则两条链路自洽（认领仍由 `:367` 的 `|| input.token?.trim()` 兜底生效）；故属"设计口径未定义"而非"必然失效"。
- **根因**：本轮为兑现 P1-1 引入 `ownershipToken` 与 `token` 两个字段，但未同步定义二者在客户端的唯一映射口径（同一输入框承担两种语义）。
- **影响范围**：§1.3 目标 5 的"纯令牌恢复"能力；§4 P1-1 验收矩阵无覆盖（正向仅覆盖认领）。
- **复现方法 / 运行证据**：`grep -n "ownershipToken|input.token|accountTokenPlaceholder|纯令牌"` 全文命中仅 `:277/:280/:344-351/:366-372/:649/:654/:682/:693`——`input.token` 只出现在路径 A 判定与 `authenticate` 调用处，**无任何"客户端提交 `token`"的表述**；§2.5 的输入框是唯一令牌入口且绑定 `ownershipToken`。
- **修复建议**：三选一并写入 §2.5 / §2.2.3——(a) 明确该单一输入框提交为 `token`（路径 A 生效，认领走 `:367` 兜底）；(b) 令路径 A 同时接受 `ownershipToken`（`const sessionToken = input.token?.trim() || input.ownershipToken?.trim()`，且仅在无 `identifier` 时生效）；(c) 面板拆为"认证令牌 / 所有权令牌"两个输入框并各自标注（§3 需补对应键）。同时把路径 A 的正向用例补进 §4 P1-1 的验收列。
- **修复后验收标准**：方案给出唯一映射口径；补单测——`loginAccount({ token })` 纯令牌恢复成功并返回 `AccountSession`；`loginAccount({ ownershipToken })`（无 `identifier`）行为与文档写死的一致（成功或明确拒绝，二者取其一）；既有认领正/负向用例不回退。

---

## 三、待确认风险与未验证项

**待确认风险**

1. **`authenticate` 重写丢弃既有"节流落盘"行为（本轮改动引入）**：Round 2 文本为 `// 刷新 lastSeenAt 并节流落盘 ...`，本轮改为裸赋值 `account.lastSeenAt = this.now();`（方案 `:425`）；对端 `accounts.ts:196-201` 的既有语义是"`lastSeenAt` 变化且距上次落盘 ≥60s 时 `persist`"。改动后账号 `lastSeenAt` 仅内存刷新、进程重启即回退到上次落盘值。全仓未发现消费该字段的 UI 或接口（除快照原样返回），暂无可观测影响，故未定级；若后续新增"最后活跃时间"展示需回补该节流逻辑。
2. **多设备并发淘汰时序未定义**：同一账号短时间内第 6 次登录（含并发 `authenticate`）时，被挤出设备的令牌立即失效，方案仅给出"需凭密码重新登录"的说明，未定义 UI 提示与并发竞态处理。无代码可证伪，仅记为实现期验证点。
3. **`RoomErrorCode` 示意枚举的计数冗余**：方案 `:232-247` 列出 11 个成员 + "既有 29 个" + 3 个，与"新增 4 + 既有 35"的基线存在表述冗余（属伪代码省略写法）。提示实现时以 `room-state-machine.ts:166-201` 的既有 35 成员为唯一基线，勿按示意枚举手抄。

**未验证项**

1. **四道门禁未复跑**：本 diff 全为 `.md`（源码零改动），仅复核 HEAD、工作区与文件内容；方案 §5 引用的"35 套 / 339 例 / 18 页面"取自交接单自述，未独立复核。
2. **`scrypt` 异步耗时与"主线程 0.00ms 停顿"未在真实服务采样**：本轮仅以 Node 探针验证闸门的**背压触发路径**（未测真实哈希耗时，也未做事件循环延迟采样）。
3. **6 语种文案的最终渲染未做端到端采样**：本仓库无 jsdom 且本轮为文档审查（源码零改动），P2-1 / P2-2 的结论来自调用链静态核验 + grep 证据，未在真实页面取样最终展示文本。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**

1. **P2-1（闸门超时，最高优先）**：纯逻辑缺陷、改法明确、可单测自证；先修它，避免把"永不触发的保护"带入实现期。
2. **P2-2（本地化文案的提供侧契约）**：类型扩展 + 装配点 + 键表补全三者同轮修订，决定 §4 P2-1 的验收能否成立。
3. **P3-1（令牌字段唯一映射口径）**：与 P1-1 的验收矩阵一并收口，明确 UI 字段 → API 字段的映射。

**复审验收标准（Round 4 / 实施前）**

1. **闸门契约可执行**：按 §2.2.2 逐字实现后，"排队超时"必须可被单测触发——前序任务长于 `timeoutMs` 时第二个请求以 `QUEUE_TIMEOUT` 拒绝；前序任务永不结束时请求不悬挂；`QUEUE_FULL` 语义不回退；`QUEUE_FULL / QUEUE_TIMEOUT → 503` 的映射落点写入 §2.2.3。
2. **本地化文案闭环**：方案给出 `messages` 的提供侧落点（含 `GameShell.tsx`）与 `UseFriendRoomOptions.messages` 类型扩展；§3 键表覆盖 `RoomErrorMessages` 中的**全部**字段，无"接口有字段、键表无键"的悬空成员；端到端断言（最终展示文本 === 本语种文案）可写。
3. **P1-1 双向可达**：令牌字段映射唯一，且"凭令牌认领"与"纯令牌恢复"两种意图均可从 UI 到达；§4 P1-1 验收补齐路径 A 的正向用例。
4. **无新的恒不可达分支**：方案中每一处"承诺的拒绝 / 超时 / 降级"路径都需有可执行的单测落点（本轮 P2-1 即为此类缺口）。
5. **上轮已闭环项不得回退**：`findLiveAccountByIdentifier` 的活对象契约、`RoomErrorCode` 4 码 + HTTP 状态码表、会话签发序 FIFO 口径、`duplicate-name` 自愈白名单与 `guest-session-invalid` 静默语义保持不变。

---

**审查结论**：本轮 **未通过**。Round 2 的 6 项缺陷中 P1-1 / P1-2 / P3-1 / P3-2 已实质闭环（路径 B 认领分支可达、活对象契约成立、4 码与状态码表齐备、FIFO 口径统一），但本轮新增的 `ScryptConcurrencyGate` 超时分支因引用比较错误**恒不可达**（P2-1，已用独立探针证伪），P2-1 的本地化修复缺少"提供侧"装配契约致原始症状可整体复发（P2-2），路径 A 的 UI 入口存在字段映射歧义（P3-1）。请按上述顺序修复后派发下一轮复查（或按文档收敛规则转入实现阶段，但 P2-1 必须在实现时同步修正）。
