# 访客身份持久化与自愈 · Round 1 审查缺陷修复交接单（1×P2 + 4×P3 全闭环）

> **交接日期**：2026-09-18  
> **交接类型**：代码审查缺陷闭环（Review Remediation · Round 2 Review）  
> **审查基准 (Base SHA)**：`cb01d11`（依据 Rule 10 恒定锚定初始基线）  
> **审查报告来源**：WorkBuddy Round 1 代码审查报告（提交 `92b46aa`，详见 [`docs/handoff/2026-09-18-workbuddy-code-review-round1-impl-handoff.md`](2026-09-18-workbuddy-code-review-round1-impl-handoff.md)）  
> **当前状态**：1×P2 + 4×P3 共 5 项缺陷已 100% 完成修复与测试守门，本地四道门禁全绿。

---

## 一、Round 1 审查缺陷闭环说明 (100% 解决)

| 缺陷编号 | 级别 | 审查指出的核心根因 | 修复方案与具体代码路径 | 验证与测试守门 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P2-1** | **高** | **压缩记账口径错误，文件 ≥ 阈值后每次落盘均重写整库**：`reset(liveLines)` 将存活行数写入增量计数器，与 `threshold` 比对语义混用，导致 2,000 行后每次写盘触发全量重写（50k 行单次阻塞 ≈63ms）。 | 1. 升级 `JsonlCompactionTracker.reset(liveLines, totalLines)`：当 `liveLines >= threshold` 时，文件物理不可压缩至阈值以下，计数器切换为追踪**自上次压缩以来的净增量预算**（`deadLines`）；<br>2. `loadFromFile` 传入 `(liveLines, lineCount)`，精准初始化既有死行增量；<br>3. `compactFile` 传入 `(liveLines)`，重写后死行归零。 | 新增单测 `does not rewrite file on every persist after loading a file with entries >= compaction threshold`，断言加载 15 行文件（阈值 10）后连续 5 次 `createSession` 纯追加（行数恰增 5），0 次重写；变异探针变红。 | **已闭环** |
| **P3-1** | **低** | **公共聊天未纳入自愈与抑制链路**：`acknowledgeAndBroadcastPublicChat` 无条件发射 `room:error`，且 `useRoomChat.ts` 收到错误后直接弹窗上屏，未做重签重试。 | 1. `src/server/room-socket.ts:1081` 增加 `if (response.error.code !== "guest-session-invalid")` 抑制广播；<br>2. `src/components/hooks/useRoomChat.ts` 引入 `clearGuestToken`，在 `sendPublicChatMessage` 收到 `guest-session-invalid` 时清空脏凭据，带 `resetGuestIdentity: true` 静默重试并清空错误。 | 新增单测 `suppresses room:error when public-chat:send fails with guest-session-invalid`，断言死 token 发送公聊 0 次 `room:error` 泄漏。 | **已闭环** |
| **P3-2** | **低** | **重连自愈未清内存房间态，导致滞留幽灵房间**：`useRoomSocket.ts:270-275` 在 `guest-session-invalid` 时仅清理存储，未清 `room` 状态与 URL，后续操作均报 `not-room-member`。 | 将 `useRoomSocket.ts:273` 的 `clearRoomSession()` 替换为 `clearClosedRoom(storedSession.roomCode)`，与 `room-not-found` 分支严格对齐，彻底重置 `setRoom(null)`、清除 URL 参数并通知 `onRoomCleared`。 | 客户端重连时序与现有 `clearClosedRoom` 测试路径完全对齐，四道门禁通过。 | **已闭环** |
| **P3-3** | **低** | **坏行容错单测断言恒真**：`accounts.test.ts:422` 仅断言 `expect(store).toBeDefined()`，既不验证有效行是否加载，也不验证坏行跳过。 | 重构该单测：先由 store 真实签发会话写入合法带哈希条目，再注入非法 JSON 坏行，重载新 store 实例后严格断言 `store.authenticate(guest.token)` 必须成功返回有效身份，且不存在的 token 必须返回 `null`。 | 变异探针：若解析器恒返回 null 或丢弃 entries，该用例必失败（变红）。 | **已闭环** |
| **P3-4** | **低** | **匿名大厅事件铸造并落盘不可复用会话**：`presence:join` ACK 不回传 guestToken，每次刷新生成新会话且客户端无法复用，导致 JSONL 行数线性递增。 | 1. `src/server/domain/presence-tracker.ts` 的 `PresenceSnapshot` 扩展可选 `guestToken?: string`；<br>2. 服务端 `presence:join` 在签发访客时通过 ACK 回传 `guestToken`；<br>3. 客户端 `useLobbyPresence.ts` 在收到该 token 时执行 `persistGuestToken`；后续连接自动复用，不再生成新会话。 | 新增单测 `returns guestToken in presence:join and reuses the session without creating new ones`，断言第二次连接成功复用会话。 | **已闭环** |

---

## 二、测试套件与本地工程门禁 (Verification)

### 1. 单元测试增量与结果
- **`src/server/accounts.test.ts` (16/16 全部通过)**：
  - 新增 `does not rewrite file on every persist after loading a file with entries >= compaction threshold`（守门 P2-1）
  - 增强 `safely ignores corrupt lines in guest sessions JSONL`（守门 P3-3）
- **`src/server/room-socket.test.ts` (25/25 全部通过)**：
  - 新增 `suppresses room:error when public-chat:send fails with guest-session-invalid`（守门 P3-1）
  - 新增 `returns guestToken in presence:join and reuses the session without creating new ones`（守门 P3-4）
- **`src/server/jsonl-file.test.ts` (5/5 全部通过)**
- **全库单元测试结果**：32 个测试套件，297 项用例全部通过（100% 全绿）。

### 2. 四道工程门禁验证 (100% 全绿)
| 门禁项目 | 命令 | 检查结果 | 状态 |
| :--- | :--- | :--- | :--- |
| **门禁 1: 类型安全** | `npx tsc --noEmit` | 0 错误 (严格类型检查全通过) | **PASS** |
| **门禁 2: 代码规范** | `npm run lint` | 0 错误 0 警告 (ESLint 全量无告警) | **PASS** |
| **门禁 3: 单元测试** | `npm test` | 32 套件 / 297 用例 全部通过 | **PASS** |
| **门禁 4: 生产构建** | `npm run build` | Next.js 16.2.9 Turbopack 打包与预渲染成功 | **PASS** |

---

## 三、后续流程 (Next Steps)
1. 提交本次修复改动并推送到 `origin/main`；
2. 依据 Rule 8 & 9，使用 `workbuddy_cli.py review` 机械命令派发 WorkBuddy 独立复审（Round 2）；
3. 挂起等待裁决通知。
