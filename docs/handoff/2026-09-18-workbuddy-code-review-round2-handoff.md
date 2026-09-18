# 访客身份持久化技术设计方案 · 第 2 轮独立审查交接单

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`a6b7975`（`docs(plan): resolve round 1 review findings for persistent guest identity plan`）；**基准** `d276991`；**实际 diff 范围** `d276991..a6b7975`（6 文件，+669/−1，全为 `STATUS.md` / `docs/**`，源码零改动）；工作区干净，`git pull --ff-only` 已是最新，`HEAD == a6b7975` 一致。
- **通过项（极简）**：Round 1 的 6 项缺陷中 **5 项在方案层面闭环成立**——P2-2（`resetGuestIdentity` 语义与服务端 `resolveSocketPlayer`（`room-socket.ts:613-647`）现状契约自洽：置空缓存后空 token 走 `createSession` 换发新身份，失效时剥离缓存的双保险成立）、P2-3（`acknowledgeAndBroadcast` 在 `:994` 先发 ack、`:997` 后发 `room:error`，抑制点覆盖 `matchmaking:find:322` / `presence:join:369` 两条入口，客户端 `setError(null)` 配合成立）、P3-1（`findMatch` 纳入自愈，服务端失败通路确认走 `acknowledgeAndBroadcast`）、P3-2（50,000 容量与 §1.2 根因"10_000 在 30 天下易误淘汰"匹配，LRU 排序口径与现状 `accounts.ts:391-394` 的 `lastSeenAt → createdAt` 完全一致）、P3-3（`readGuestToken` 移除第三优先级后，`applyRoomAck` 内 `existingSession?.guestToken` 回退经核验**不可达**——`handleJoinedRoom`（`room-socket.ts:858-891`）对 guest 恒回填 `guestToken`，`resolvePlayerIdentity`（`accounts.ts:449-483`）也恒返回 token，故死 token 无复活入口）。
- **交接规范**：`STATUS.md:11` 字段按「审查/交付提交记直接父提交」先例取值正确（父 = 被审基准 `2610c4d`），`docs/handoff/INDEX.md` 三行登记齐全，`npm test` 宣称的 31 套与仓库实际 31 个 `*.test.ts` 相符。
- **独立验证**：自建 2 项探针（① 按方案 §3.3 逐字实现 Storage 契约 + 现状 `applyRoomAck`/`getActivePlayer` 语义的分身隔离全链路模拟；② 以仓库 `tsc` 复现客户端 payload 类型契约），**2 项均成功证伪本轮修复**（见 P2-1 / P3-1）；临时探针位于仓库外并已删除，`git status --porcelain` 为空。

---

## 二、审查发现与缺陷清单（文档核心主体）

### P2-1（高）：Round 1 P2-1 未真正闭环——分身隔离仍被两条主身份写路径打破，`localStorage` 主凭据实测被分身覆写（验收标准 2 不满足）

- **文件与行号**：
  - 方案（本轮新增/修订文本）：`docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:203-277`（§3.3 写侧 API）、`:247-264`（`getOrCreatePlayerId` 内的 `localStorage` 回写，即 `:256-258`）、`:212-219`（`persistGuestToken`）、`:314-352`（§3.4-2 分身重试；`:326` 清分身、`:329` 建分身、`:342-345` 仅存 sessionStorage、`:346` 紧接 `applyRoomAck`）、`:49-51`（§2-4 「严禁触碰或覆写 `localStorage` 中的主访客凭据」）、`:391`（§4 表格「Tab 1 与后续新窗口的 `localStorage` 主身份完好无损」）、`:410-413`（§5.1-3 测试规范）。
  - 对照**未被本方案改动**的既有源码：`src/components/hooks/useRoomSocket.ts:246-248`（`applyRoomAck` 内 `persistGuestToken(acknowledgedGuestToken)`，**不传 options ⇒ 走非 ephemeral 分支**）、`:230-232`（同一函数内 `acknowledgedGuestToken` 取值）、`:114-128`（`getActivePlayer` 内 `getOrCreatePlayerId()`，**同样不传 options**）。
- **触发条件**：同一浏览器多标签（或同标签重复加入自己房间）触发 `duplicate-player`（来源 `src/server/domain/room-state-machine.ts:455`）→ 走 §3.4-2 的 ephemeral 分身重试成功入房；此后该标签页发生任意一次 `createRoom` / `joinRoomByCode` / `joinRoomByTarget` / `findMatch`（即任何调用 `getActivePlayer()` 的动作）。
- **实际行为**：分身重试成功后的**同一轮回调**内即把分身 token 写成主身份；随后任一次 `getActivePlayer()` 再把分身 `playerId` 写成主身份。探针实测（`localStorage` = 主身份，`sessionStorage` = 每标签页独立）：

  ```
  主身份（Tab A 引导后 localStorage）: token = tok-guest-1 / playerId = pid-1-440863
  Tab B 首次入房: {"ok":false,"error":{"code":"duplicate-player",...}}
  applyRoomAck 以非 ephemeral 写回: ["tok-guest-2"]                      ← 泄漏路径 (a)
  Tab B 分身重试 ack: {"ok":true,...,"guestToken":"tok-guest-2","playerId":"guest-2"}
  Tab B 之后一次 getActivePlayer() -> {"guestToken":"tok-guest-2","playerId":"pid-1-6866c6"}
  localStorage 终态:  token = tok-guest-2   *** OVERWRITTEN ***
                      playerId = pid-1-6866c6 *** OVERWRITTEN ***        ← 泄漏路径 (b)
  随后新开标签页 C 继承到: token = tok-guest-2 / playerId = pid-1-6866c6 ← 与 Round 1 P2-1 复现输出同形
  === VERDICT === token preserved: false / playerId preserved: false
  ```
- **期望行为**：§2-4「严禁触碰或覆写 `localStorage` 中的主访客凭据」、§4「Tab 1 与后续新窗口的 `localStorage` 主身份完好无损」，以及 Round 1 P2-1 明确下达的修复验收「断言 `localStorage` 主 token/playerId 与隔离前**逐字节一致**」。
- **根因**：方案把 ephemeral 建模成**单次调用的参数**，而非**标签页级身份状态**，因此总有写路径收不到该参数：
  1. **泄漏路径 (a)**：§3.4-2 分身链路在 `:346` 调用 `applyRoomAck(retryAck)`，而 `applyRoomAck` 自身在 `useRoomSocket.ts:246-248` 无条件 `persistGuestToken(token)`；按 §3.3 新签名（`options` 默认 `{}`）即非 ephemeral ⇒ 双写 `localStorage`。`:342-345` 的「严格只存 sessionStorage」被紧随其后的这一行完整抵消。方案全文未对 `applyRoomAck` 做任何改动或参数透传。
  2. **泄漏路径 (b)**：§3.3-4 读侧优先级为 `sessionStorage → localStorage`（分身值在 `sessionStorage`），但回写侧为 `if (!options.ephemeralOnly) localStorage.setItem(...)`；`getActivePlayer()`（`:125`）调用 `getOrCreatePlayerId()` **不传参**，因此该守卫恒真，把刚从 `sessionStorage` 读到的分身 `playerId` **提升并覆盖** `localStorage` 主身份（Round 1 修复建议 ③「明确 `getActivePlayer()` 的读取契约与 ephemeral 优先级」未被落实）。
- **影响范围**：验收标准 2「分身隔离机制」整体失效；多标签隔离目标（§2-4 / §4）落空，主身份被降级为一次性分身，后续新标签页与重开浏览器继承分身身份（实测尾部行），与 §2-1「长效设备主身份保持」直接冲突。此外 **§5.1-3 的守门用例无法拦截**：它只断言 `persistGuestToken({ephemeralOnly:true})` 单函数不写 `localStorage`，而缺陷发生在函数被**以缺省参数**调用的集成路径上 ⇒ 按当前测试规范实现，用例必然为绿而缺陷仍在（Round 1 P2-1 要求的集成级守门用例在 §5.1 中缺失）。
- **复现方法/证据**：仓库外临时 Node 探针（已删除）——以 `Map` 模拟「共享 `localStorage` + 每标签页独立 `sessionStorage`」，逐字实现方案 §3.3 五个函数与 §3.4-2 判分/重试分支，并**原样复用** `useRoomSocket.ts:114-128 / 220-249` 的行为（含 `applyRoomAck` 的 `persistGuestToken` 与 `getActivePlayer` 的 `getOrCreatePlayerId()`），服务端按现状 `resolveSocketPlayer` + `room-state-machine` 的 `duplicate-player` 语义建模。输出见上。
- **修复建议**（任一单点修复均不足，建议 ①+③ 组合）：
  1. **把 ephemeral 提升为标签页级状态**（例如 `sessionStorage` 旗标或 hook 内 ref），并让**所有**面向上层存储的写入口（`persistGuestToken`、`getOrCreatePlayerId` 的 `localStorage` 回写、`applyRoomAck`）统一受该状态约束；这是唯一能封死后续新增写路径的做法。
  2. 若坚持参数式方案，则必须为 `applyRoomAck` 增加 options 透传（`applyRoomAck(ack, {ephemeralOnly})`）并在 §3.4-2、`joinRoomByTarget` 两处链路显式传入。
  3. `getOrCreatePlayerId` 的 `localStorage` 回写在 ephemeral 状态下必须**短路**（当前守卫在调用方不传参时恒真）；同时明确「分身标签页永不回写主身份」为不变量。
  4. §5.1 补齐 Round 1 要求的集成级守门用例：分身重试成功后断言 `localStorage` 主 token/playerId 与隔离前**逐字节一致**，且新开标签页读到的仍是主身份（纯函数级单测不作为该缺陷的验收证据）。
- **修复后验收标准**：上述集成级用例全绿；且在多标签真实/模拟时序下，分身标签页的任意后续动作（建房、加入、匹配、重连）均不再改写 `localStorage`。

### P3-1（低）：客户端 `PlayerAuthPayload` 未同步扩展 `resetGuestIdentity`，方案按字面落地必然卡住第 1 道门禁

- **文件与行号**：方案 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md:143-195`（§3.2-2 仅扩展**服务端** `PlayerAuthPayload`，标题即注明 `src/server/room-socket.ts`）、`:296-299` 与 `:328-332`（§3.4 代码给 `player` 赋含 `resetGuestIdentity` 的对象字面量）、`:290-291` 行 `const freshPlayer = {...}` 同类写法；对照**未改动**源码 `src/components/hooks/room-state-utils.ts:30-35`（客户端同名的 `PlayerAuthPayload`，**当前不含该字段**）与 `src/server/room-socket.ts:36`（服务端自有的一份同名私有类型，二者相互独立）。
- **触发条件**：按方案实现 `useRoomSocket.ts` 的 `let player = getActivePlayer();`（`:316` / `:368`，类型由 `room-state-utils` 的 `PlayerAuthPayload` 决定）后，在回调内整体重赋含 `resetGuestIdentity` 的对象字面量。
- **实际行为**：对象字面量重赋值触发 TS 多余属性检查。以仓库自带 `tsc` 复现（临时文件置于仓库外，已删除）：

  ```
  $ npx tsc --noEmit --strict ... guest-payload-typecheck.ts
  guest-payload-typecheck.ts(18,5): error TS2353: Object literal may only specify known properties,
  and 'resetGuestIdentity' does not exist in type 'PlayerAuthPayload'.
  ```
- **期望行为**：方案「涉及范围」已含 `room-state-utils.ts`，且验收标准 2 要求「写侧 API…语义完全自洽」；客户端 payload 类型属写侧 API 的一部分，应在 §3.3 与 §3.2 同步声明 `resetGuestIdentity?: boolean`。
- **根因**：服务端与客户端各自维护了一份同名 `PlayerAuthPayload`，方案只改了服务端那一份；§3.3 仅新增了 `StorageOptions`，未增补 payload 字段。
- **影响范围**：实现期第 1 道门禁（`npx tsc --noEmit`，要求 0 错误）必然失败，属方案自洽性缺口而非产品运行期缺陷；不影响运行期语义（线上序列化不校验类型）。
- **复现方法/证据**：见上（`TS2353`），复现脚本已删除。
- **修复建议**：在 §3.2 或 §3.3 中补一行——同步为 `src/components/hooks/room-state-utils.ts:30-35` 的 `PlayerAuthPayload` 增加 `resetGuestIdentity?: boolean`，并在 §5.1 标注该类型须与 `room-socket.ts:36` 的同名字段保持一致。
- **修复后验收标准**：按方案字面实现后 `npx tsc --noEmit` 0 错误；两份 `PlayerAuthPayload` 字段集合一致。

---

## 三、待确认风险与未验证项

1. **伪代码变体覆盖不全（非阻塞建议，不计缺陷）**：§3.4-2 标题声明覆盖 `joinRoomByCode` **与** `joinRoomByTarget`，但片段仅给出 `socket.emit("room:join", {...player, roomCode: nextRoomCode })` 变体，未给出 `room:join-target` + `target` 变体。若实现期逐字复制到 `joinRoomByTarget`（`useRoomSocket.ts:373-389`）会造成事件名/入参错配。建议在方案内显式标注两处差异（对比 `:321-323` 与 `:373`）。
2. **残余风险（Round 1 已列为非阻塞补充，本轮仍未明确，仅登记）**：§3.1-4 的「60 秒节流追加」未说明是否计入 `this.compaction.noteAppend()`；若不计入，压缩阈值只能靠 `createSession` 的追加推进，高频活跃期 JSONL 体积可能显著超出预期。与既有 `AccountStore`（`accounts.ts:277-292` 每次 append 均计数）口径不一，建议实现期一并对齐。
3. **未验证（环境限制）**：真实浏览器双标签页下 `localStorage` 共享与并发写时序——本仓无 jsdom，本轮以「共享 `localStorage` + 每标签页独立 `sessionStorage`」的同源语义模拟替代（P2-1 探针）。**残余风险**：双标签并发写 `localStorage` 的 last-write-wins 竞争仍未被方案定义仲裁机制（Round 1 已提出，本轮方案未涉及）；在 P2-1 引入标签页级 ephemeral 状态后，主身份写入应改为幂等/受控，建议一并定义。
4. **未验证**：生产部署落盘策略（只读根文件系统 / 容器临时层）对 `data/accounts/guest-sessions.jsonl` 的影响，仓库内无该信息；与既有 `accounts.jsonl` 同源的存量风险。

---

## 四、推荐修复顺序与复审验收标准

1. **修复顺序**：P2-1（本轮唯一阻断项，决定验收标准 2）→ P3-1（同期补齐类型契约）→ 建议项 1/2/3 择要吸收。
2. **方案修订要求**：§3.3 写侧 API 需明确「ephemeral 为标签页级状态且约束全部写路径」或补齐 `applyRoomAck` 参数透传；§3.4-2 须体现 `applyRoomAck` 在分身链路中的行为；§5.1 须新增集成级守门用例（分身重试后 `localStorage` 逐字节不变 + 新标签页仍为主身份）。
3. **复审验收标准**：① P2-1 逐条给出方案级闭环证据（含 `applyRoomAck` 与 `getOrCreatePlayerId` 两处的具体改动点与代码位置）；② P3-1 明确两份 `PlayerAuthPayload` 同步扩展；③ §5.1 用例表可直接映射到「分身标签页任意后续动作都不改写 `localStorage`」这一不变量；④ 纯文档改动保持四道门禁基线不受影响。
4. **轮次说明**：本轮为纯方案审查第 2 轮（`Round <= 3` 上限内），复查仅聚焦「Round 1 缺陷是否真正闭环 + 本轮增量是否引入新缺陷」，未回溯翻找未改动文本。若下一轮修复仍有残留技术性缺陷，将触及第 3 轮上限并按要求收敛定稿、转入源码实现阶段。
