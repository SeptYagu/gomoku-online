# 访客身份持久化与自愈 Round 2 审查缺陷修复交接单（4×P3 全闭环）

> **交付日期**：2026-09-18  
> **基准提交 (BASE_SHA)**：`cb01d11`（恒定锚定初始基线，严禁漂移）  
> **前驱审查提交**：`d39a2dd`（WorkBuddy Round 2 独立代码复审报告）  
> **当前状态**：4 项 P3 缺陷 100% 修复完毕，本地四道门禁全绿（32 套 / 302 例单测），准备提交推送并派发 WorkBuddy 独立代码审查 Round 3。

---

## 一、Round 2 审查缺陷闭环实施清单

针对 WorkBuddy Round 2 审查报告（[`2026-09-18-workbuddy-code-review-round2-impl-handoff.md`](2026-09-18-workbuddy-code-review-round2-impl-handoff.md)）指出的 4 项 P3 缺陷，逐项实施严格的代码与测试闭环：

### 1. P3-1: 压缩守门单测变异敏感性与反向边界守门 (`src/server/accounts.test.ts`)
- **根因处置**：Round 1 引入的守门单测仅断言“5 次 `createSession` 后总行数 = `initialLines + 5`”，而在“每次全量重写”和“纯追加”两种实现下该等式恒成立，属于恒真断言（变异探针不变红）。
- **代码修复**：
  1. 引入 `vi.spyOn(jsonlFile, "rewriteJsonlFile")` 与 `vi.spyOn(jsonlFile, "appendJsonlLine")` 真实函数调用观测；
  2. 在 `does not rewrite file on every persist after loading a file with entries >= compaction threshold` 中，断言 5 次 `createSession` 触发 `appendSpy` 5 次，**`rewriteSpy` 0 次**；
  3. 新增反向边界用例 `triggers exactly one compaction when loaded file has dead lines exceeding threshold`：构造 15 条存活会话 + 185 条死/重写行（总行数 200，阈值 10），重启加载后执行 5 次 `createSession`，断言**恰触发 1 次 `rewriteSpy`**（第 1 次落盘即清理所有死行并重置预算），后续 4 次纯追加，最终文件行数自 200 准确收拢至 20 行；
  4. **变异探针实测**：将 `JsonlCompactionTracker.reset()` 回退为缺陷语义（`this.appended = liveLines`）后，上述两项测试**均立即变红**（`expected rewriteJsonlFile to be called 0 times, but got 5 times` 与 `expected 1 times, but got 5 times`）；恢复正确实现后全绿，回归守门坚实有效。

### 2. P3-2: Ephemeral 标签页公聊自愈防死 Token 复活 (`src/components/hooks/useRoomChat.ts`)
- **根因处置**：`useRoomChat.ts` 是全仓唯一调用 `getActivePlayer()` 重建重发 payload 的自愈点。分身标签页（`isEphemeralSession() === true`）下 `clearGuestToken()` 故意不清理 `localStorage` 主凭据，导致 `getActivePlayer()` 重新读取并复活了失效的主 token，带死 token 重试必然二次失败并向用户弹出红字。
- **代码修复**：
  1. 改造 `sendPublicChatMessage` 收到 `guest-session-invalid` 时的重试分支，与 `useRoomSocket`、`useLobbyPresence` 完全对齐，**显式构造**不含 `guestToken` 的全新凭据对象：
     ```ts
     const isEphemeral = isEphemeralSession();
     clearGuestToken({ ephemeralOnly: isEphemeral });
     const freshPlayer: PlayerAuthPayload = {
       playerId: createAndPersistPlayerId({ ephemeralOnly: isEphemeral }),
       playerName: player.playerName,
       resetGuestIdentity: true
     };
     ```
  2. 严格受 `isEphemeralSession()` 约束，在分身标签页下 `createAndPersistPlayerId` 仅写 `sessionStorage`，主凭据在 `localStorage` 中逐字节保持不变；重试时不携带任何 token，由服务端强制铸造新会话。
  3. 在 `room-state-utils.test.ts` 中增补测试，断言 ephemeral 标签页在公聊自愈重签时不读取/复活 `localStorage` 死 token，且 `localStorage` 主凭据不受任何影响。

### 3. P3-3: 公聊自愈重发接入 `ChatSendGate` 看门狗防锁死 (`src/components/hooks/useRoomChat.ts`)
- **根因处置**：首发响应返回时 `:139` 的 `gate.settle()` 已将闸门复位并解除了看门狗；自愈重发 emit 绕过了 `gate.begin()`，若遇到重发 ACK 丢失或 Socket.IO 静默断线，`isSendingPublicChat` 保持为 `true`，导致发送按钮永久锁死禁用。
- **代码修复**：
  1. 重发 emit 前重新调用 `gate.begin(onTimeout)`，挂接 `CHAT_ACK_TIMEOUT_MS` 超时看门狗：
     ```ts
     if (
       !gate.begin(() => {
         setIsSendingPublicChat(false);
         setError(messages?.chatSendTimeout ?? DEFAULT_CHAT_SEND_TIMEOUT_ERROR);
         setPublicChatText((current) => (current ? current : text));
       })
     ) {
       return;
     }
     setIsSendingPublicChat(true);
     ```
  2. 重发 ACK 正常到达时调用 `gate.settle()` 并复位 `isSendingPublicChat(false)`；若超时触发则在看门狗回调中释放按钮并还原草稿文本；
  3. 在 `chat-send-gate.test.ts` 中新增单元测试，断言连续两轮（首发 + 重发）闸门调度下，未响应的重发超时后闸门成功复位，绝不发生永久锁死。

### 4. P3-4: 公聊自愈成功回传 `guestToken` 与客户端落盘收敛 (`room-state-machine.ts` + `room-socket.ts` + `useRoomChat.ts`)
- **根因处置**：`PublicChatAck` 成功分支契约缺少 `guestToken` 字段，服务端未回传新铸造的访客 token，客户端亦未落盘；新身份仅存在于连接级缓存，下次刷新页面建立新连接时无 token 导致再次铸造新身份并增长文件行数。
- **代码修复**：
  1. `src/server/domain/room-state-machine.ts`: `PublicChatSnapshot` 扩展 `guestToken?: string;`，使 `PublicChatAck` 成功载荷支持携带新凭据；
  2. `src/server/room-socket.ts`:
     - `public-chat:send` 处理器提取 `guestToken = player.value.identity === "guest" ? player.value.guestToken : undefined`；
     - `acknowledgeAndBroadcastPublicChat` 增加 `guestToken` 参数，当 `response.ok && guestToken` 时将其合并进回送给调用方的 ACK；房间广播 `public-chat:messages` 依然发送纯净快照，杜绝私有 token 外泄；
  3. `src/components/hooks/useRoomChat.ts`:
     - 在首发与自愈重发的成功回调中，检查 `response.value.guestToken` 并持久化：
       ```ts
       if (retryResponse.value.guestToken) {
         persistGuestToken(retryResponse.value.guestToken, {
           ephemeralOnly: isEphemeral
         });
       }
       ```
  4. `src/server/room-socket.test.ts`: 增补 2 项测试：
     - `returns guestToken in public-chat:send and reuses the session without creating new ones`（断言初发回传 token，后续连接使用该 token 成功复用会话）；
     - `mints fresh guestToken on public-chat:send self-healing with resetGuestIdentity`（断言死 token 触发自愈重发时返回全新有效 token）。

---

## 二、本地工程门禁执行记录（四道门禁全绿）

根据项目规范依次执行并记录四道门禁：

1. **Gate 1: TypeScript 静态类型检查**
   ```bash
   npx tsc --noEmit
   # 输出：0 错误
   ```
2. **Gate 2: ESLint 代码规范检查**
   ```bash
   npm run lint
   # 输出：0 错误，0 警告
   ```
3. **Gate 3: Vitest 单元测试全量套件**
   ```bash
   npm test
   # 输出：Test Files 32 passed (32) | Tests 302 passed (302) | 100% 全绿（净增 5 项单测）
   ```
4. **Gate 4: Next.js 生产构建**
   ```bash
   npm run build
   # 输出：Compiled successfully in 8.1s, Turbopack 生产预渲染 11/11 页面全部通过
   ```

---

## 三、修改文件清单

| 文件路径 | 修改性质 | 说明 |
|---|---|---|
| `src/server/domain/room-state-machine.ts` | 契约扩展 | `PublicChatSnapshot` 扩展 `guestToken?: string` |
| `src/server/room-socket.ts` | 服务端通信 | `public-chat:send` 与 `acknowledgeAndBroadcastPublicChat` 透传并回传 `guestToken` |
| `src/server/accounts.test.ts` | 测试强化 | P3-1 守门用例接入 `rewriteJsonlFile` spy 断言，增补 200 行超阈值边界压缩用例 |
| `src/server/room-socket.test.ts` | 测试补充 | 增加公聊初发回传 `guestToken` 会话复用与重发自愈换发 token 2 项端到端测试 |
| `src/components/hooks/useRoomChat.ts` | 客户端逻辑 | P3-2 显式构造 freshPlayer，P3-3 接入 `gate.begin` 看门狗，P3-4 落盘 `guestToken` |
| `src/components/hooks/room-state-utils.test.ts` | 测试补充 | 增补 ephemeral 标签页自愈时不复活 `localStorage` 死 token 且保持隔离单测 |
| `src/components/chat-send-gate.test.ts` | 测试补充 | 增补连续两轮发送与重发超时不锁死单测 |
| `docs/handoff/2026-09-18-persistent-guest-identity-round2-remediation-handoff.md` | 交接文档 | 本交接文档 |
| `docs/handoff/INDEX.md` | 索引更新 | 追加本交接记录 |
| `STATUS.md` | 动态事实基准 | 更新版本与近期里程碑 |
