# 访客身份持久化、30天滑动TTL与全链路静默自愈 · 独立代码审查 Round 3 报告（源码实现复查）

> **审查日期**：2026-09-18
> **审查轮次**：Round 3（针对 Round 2 缺陷修复的增量复查）
> **被审 HEAD**：`663a001c78e21d21a9de635fafebdb711bc37555`（`fix(accounts): resolve round 2 code review findings for public chat and compaction gate`）
> **基准提交**：`cb01d110ff9a28ca38fb9119e6fb8b3a6c4bdc26`（`cb01d11`）
> **审查范围**：`git diff cb01d11..663a001`（21 文件，+1823/−54）；本轮复查增量 `2c1fba6..663a001`（11 文件，+564/−11）
> **判定结论**：**未通过**（0×P0/P1/P2，**1×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

- 版本核对：`git pull --ff-only` 后 HEAD = `663a001c78e21d21a9de635fafebdb711bc37555`（与指定被审 SHA 一致），基准 `cb01d11`；工作区干净，本轮未修改任何产品代码/正式测试（3 项变异探针均已 100% 复原，临时探针文件已删除，`git status --porcelain` 为空）。
- **Round 2 四项 P3 的代码修复经独立探针证实均真实有效**：P3-1 压缩守门改为观测 `rewriteJsonlFile` 真实调用次数并补死行超阈值边界用例，变异后**两用例均变红**（实测 5 次 rewrite），Round 1 复审验收标准达成；P3-2 重发 payload 已改为显式构造、不再经 `getActivePlayer()` 复活 localStorage 死 token；P3-3 重发已重新 `gate.begin()` 挂看门狗、ack 到达时 `gate.settle()`；P3-4 `PublicChatAck` 已回传 `guestToken` 且客户端落盘，实测"公聊自愈后换发新 token → 新连接复用该 token → `guest-sessions.jsonl` 恒 1 行"成立，`public-chat:messages` 广播不含 token（无泄漏）。
- 门禁独立复跑（全绿）：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`vitest run` **32 套 / 302 例全绿**（连续 3 次）、`npm run build` 生产构建 11/11 页面通过。
- 独立验证：自建 **1 项端到端运行时探针**（真实 Socket.IO + 真实落盘 store，覆盖死 token 失败 ack 无 token 字段、`room:error` 抑制计数 0、自愈换发、跨连接复用、广播字段白名单、`resetGuestIdentity`+有效 token 边界）+ **3 项变异探针**；其中 2 项变异**成功证伪**（见 §二）。

---

## 二、审查发现与缺陷清单

### P3-1 本轮三项客户端自愈修复（P3-2/P3-3/P3-4）在 `useRoomChat` 全链路**零守门**：新增用例与产品代码解耦，Round 2 明文要求的变异探针全部不变红

**严重级别**：P3（测试有效性缺陷：断言缺失 / 同义反复；Round 1 与 Round 2 同类问题均按此级判定）

**文件与行号（被守护的实现）**
- `src/components/hooks/useRoomChat.ts:146-153` — P3-2 修复点：`clearGuestToken({ ephemeralOnly: isEphemeral })` 后**显式构造** `freshPlayer`（不携带 `guestToken`，`resetGuestIdentity: true`）
- `src/components/hooks/useRoomChat.ts:155-165` — P3-3 修复点：重发前重新 `gate.begin(onTimeout)` 并挂 `CHAT_ACK_TIMEOUT_MS` 看门狗
- `src/components/hooks/useRoomChat.ts:170-182` — P3-3/P3-4 修复点：重发 ack 到达时 `gate.settle()`；`persistGuestToken(retryResponse.value.guestToken, { ephemeralOnly: isEphemeral })`
- `src/components/hooks/useRoomChat.ts:197-201` — P3-4 修复点：首发成功分支写回 `response.value.guestToken`

**关联（声称覆盖上述修复的）新增用例**
- `src/components/chat-send-gate.test.ts:74-101` — `guards self-healing retry so an un-acked retry resets the gate instead of permanently locking`
- `src/components/hooks/room-state-utils.test.ts:203-239` — `protects ephemeral tabs from reviving dead primary localStorage token during chat self-healing`
- `src/components/hooks/` 目录下**不存在 `useRoomChat.test.ts`**；全仓 `grep -rl useRoomChat src/` 命中数 = 2（`useRoomChat.ts` 自身与 `useFriendRoom.ts` 生产调用方），**测试文件 0 个**。

**触发条件**：任何一次"变异 P3-2/P3-3/P3-4 任一修复点后运行 `npm test`"。

**实际行为（实测证据，全部于本机 `d:\OneDrive\AiPrograms\gomoku-online` 执行）**

| 变异 | 变异内容 | 全量测试结果 |
| --- | --- | --- |
| M-1（P3-3 + P3-4） | 删除 `useRoomChat.ts:155-163` 的 `gate.begin(...)` 重发看门狗；删除 `:170` 的 `gate.settle()` 与 `:178-182` 的 `persistGuestToken` 写回 | **32 套 / 302 例全部通过**（零拦截） |
| M-2（P3-2） | 将 `:149-153` 的显式 `freshPlayer` 回退为 `const freshPlayer: PlayerAuthPayload = getActivePlayer();`（即 Round 2 判定为 P3-2 的缺陷原文） | **32 套 / 302 例全部通过**（零拦截） |

即：把 Round 2 报告中被判定为 P3-2/P3-3/P3-4 的**缺陷代码原样回退**，本项目全量门禁依旧全绿。

**期望行为**：Round 2 §四 复审验收标准明文要求"新增/修正用例须通过变异探针（ephemeral 重发 payload、ack 超时复位、公聊 token 写回）"，即上述三个变异各自必须使至少一个用例变红。

**根因**：新增的两个用例与产品代码**没有调用关系**——
1. `chat-send-gate.test.ts:74-101` 直接 `createChatSendGate()` 并手工 `begin()`/`settle()` 两次，**从未 import 或渲染 `useRoomChat`**；`useRoomChat` 无论是否调用 `gate.begin()`，该用例结果完全相同（它只重测了闸门类本身，而闸门类在 Round 1 前就已有 4 个同类用例）。它断言的是 `gate.isInFlight()`，而不是 Round 2 验收标准要求的 `isSendingPublicChat === false` / 按钮恢复可点 / 草稿回填。
2. `room-state-utils.test.ts:203-239` 只验证 `clearGuestToken({ephemeralOnly})` / `createAndPersistPlayerId` / `persistGuestToken` 三个存储函数的语义，随后在**用例内部手工重建**了一份 payload（`:226-230`），并断言 `expect((freshPlayer as { guestToken?: string }).guestToken).toBeUndefined()`——该断言对象是本地对象字面量，**恒真**，与 `useRoomChat.ts:149-153` 是否真的这样构造无关（与被 Round 1 判定为 P3-3 的 `expect(store).toBeDefined()` 属同一类同义反复断言）。
3. 首发分支的写回（`:197-201`）与重发 ack 的写回（`:178-182`）无任何用例覆盖。

**影响范围**：Round 2 的 P3-2（分身标签页公聊必失败 + 红字）、P3-3（ack 静默丢弃 → 发送按钮永久锁死）、P3-4（自愈后身份无处落盘 → 身份漂移 + 每轮 `guest-sessions.jsonl` +1 行）三个用户可感缺陷的**回归守门全部为空**。本轮代码本身正确（§一已实测），但任何一次后续重构/合并都可能把这三个缺陷静默复活（与 Round 2 的 P3-1 完全同构），且 302 例测试全绿、无任何红灯提示。验收标准 4（"绝不向用户展示 guest-session-invalid 红字"、防锁死）在自动化层面仍处于无守护状态。

**复现方法**
1. M-2：将 `useRoomChat.ts:149-153` 替换为 `const freshPlayer: PlayerAuthPayload = getActivePlayer();` → `npx vitest run` → `Test Files 32 passed (32) | Tests 302 passed (302)`。
2. M-1：删除 `:155-163` 的 `gate.begin`/`if (!gate.begin(...)) return;` 整段 + 删除 `:170` 的 `gate.settle()` 与 `:178-182` 的写回块 → `npx vitest run` → 同样 32 套 / 302 例全绿。
3. 恢复原始实现（`git checkout HEAD -- src/components/hooks/useRoomChat.ts`）→ `git status --porcelain` 为空、302 例全绿。

**修复建议**
1. 新建 `src/components/hooks/useRoomChat.test.ts`（或对 `useFriendRoom` 做集成级测试），用假 socket + 假 React state 驱动真实 `sendPublicChatMessage`，至少覆盖：
   - **（M-2 守卫）** 首发 ack 返回 `guest-session-invalid` 时，断言**重发 emit 的实际 payload 不含 `guestToken` 键**且 `resetGuestIdentity === true`（禁止改回 `getActivePlayer()`）；
   - **（M-1 守卫）** 重发期间用 `vi.useFakeTimers()` + `vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS)` 模拟 ack 永不到达，断言 `isSendingPublicChat === false` 且草稿被回填（禁止移除 `gate.begin` 看门狗）；
   - **（P3-4 守卫）** 断言重发成功分支调用了 `persistGuestToken(newToken, { ephemeralOnly: true })`（ephemeral 标签页下 localStorage 逐字节不变），且**首发**成功分支同样触发写回。
2. 将 `chat-send-gate.test.ts:74-101` 改造为对 `useRoomChat` 的驱动式断言，或明确降级其命名（当前命名"guards self-healing retry…"会误导性地暗示已守住自愈重发）。
3. 三个变异各自必须至少使一个用例变红（按 §四 验收）。

**修复后验收标准**：单独施加 M-1、M-2 以及"移除首发分支写回"三个变异中的任意一个，`npm test` 必须出现至少 1 个红色用例并指向 `useRoomChat` 自愈链路；恢复原始实现后 32 套 / 302 例（+新增用例）全绿。

---

## 三、待确认风险与未验证项

1. **`useLobbyPresence` 凭证写回与房间 ack 的"后写覆盖"竞态（Round 2 已登记、本轮未复现，非本轮新增缺陷）**：`useLobbyPresence.ts:220-224` 与 `useRoomSocket.ts:249-253` 写入同一 `GUEST_TOKEN_STORAGE_KEY` 且无"单调/最新优先"保护。本轮静态推演结论为**在同一 socket 上不可达成"回退到旧 token"**：两请求均在服务端按到达序同步处理并原序回写 ack（客户端自愈重发由 ack 回调触发，故其 emit 时间必然晚于触发它的请求），最坏结果是产生一条被孤立的冗余会话行（≤1 行/次交织），不会把本地主凭证回退为失效值。**仍未做 ack 乱序注入探针**，故不排除其它交织路径；建议按 Round 2 建议补一次注入验证，或直接按"仅当响应 token 与当前 socket 绑定身份一致时写回"加固。
2. **全量门禁的一次性非确定性**：在一次包含我方额外临时测试文件（第 33 个文件，额外拉起 3 组 Socket.IO 服务）的 `npx vitest run` 中，`src/server/accounts.test.ts` 的 `throttles disk writes on high-frequency authentication and triggers compaction` 曾失败一次；该用例为纯假时钟、无真实定时器依赖，且在**被审树上连续 3 次全量运行 + 单文件运行均全绿**，无法复现。判定为环境/并行 I/O 抖动（本仓库位于 OneDrive 目录），**不作为缺陷计入**，仅登记为门禁可信度残余风险。
3. **未覆盖验证项**：真实无头浏览器（CDP）多标签"主凭证逐字节不变"端到端验收仍无自动化守门（本轮为服务端运行时探针 + 存储层用例 + 代码走查，`smoke:lobby-ui` 未扩展该场景）；`clearEphemeralSession()` 在生产代码中仍为 0 引用（Round 1 遗留待裁决项，未接线也未删除）。

---

## 四、推荐修复顺序与复审验收标准

1. **先补守门，再谈闭环（P3-1）**：新增 `useRoomChat` 自愈链路用例，使 M-1 / M-2 / 首发写回三个变异各自变红。不建议在守门缺位的情况下继续迭代该链路——Round 1、Round 2 均因同类"无守门交付"重复开单（Round 1 P3-3 → Round 2 P3-1 → 本轮 P3-1）。
2. 顺带裁决 §三-1（注入验证或加固）与 §三-3（`clearEphemeralSession()` 接线或删除），并在交接单中显式登记 §三-2 为环境残余风险。
3. **复审验收标准**：四道门禁全绿（`tsc` / `lint` / `test` / `build`）；上述三个变异逐条给出"变异命令 + 实测红色输出"证据；新增用例不得依赖真实计时器（须用 `vi.useFakeTimers()`）；不得新增任何 localStorage 主身份覆写路径（ephemeral 场景仍须逐字节不变）。
