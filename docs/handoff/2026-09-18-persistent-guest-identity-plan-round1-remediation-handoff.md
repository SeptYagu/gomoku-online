# 访客身份持久化技术设计方案 · Round 1 审查缺陷修复与设计定稿交接单

- **交接日期**：2026-09-18
- **交接主题**：访客身份持久化设计方案 Round 1 审查缺陷闭环（3×P2 + 3×P3 100% 收敛）
- **设计文档**：[`docs/PERSISTENT_GUEST_IDENTITY_PLAN.md`](../PERSISTENT_GUEST_IDENTITY_PLAN.md)
- **审查输入**：WorkBuddy Round 1 审查报告（提交 `2610c4d`，报告：[`docs/handoff/2026-09-18-workbuddy-code-review-round1-handoff.md`](2026-09-18-workbuddy-code-review-round1-handoff.md)）
- **基准提交 SHA**：`d276991`（锚定自第 1 轮起始基准，防止范围漂移）
- **交付类型**：**方案修复与设计定稿（Proposal Remediation）**，纯设计文档与交接单更新，源码尚未进入实现阶段。

---

## 1. 缺陷清单与 100% 闭环修复方案

针对 WorkBuddy Round 1 审查报告指出的 3 项 P2 与 3 项 P3 缺陷，逐项完成闭环修订：

### 1.1 P2-1 闭环：Storage 双写/读取契约自洽与多标签 Ephemeral 分身隔离
- **缺陷表现**：`persistGuestToken` 无条件双写且 `readGuestToken` 回退 `localStorage`，导致分身无法仅在 `sessionStorage` 生效，双写会覆盖 `localStorage` 主身份，`duplicate-player` 隔离失效。
- **闭环方案**：
  1. 升级 `persistGuestToken(token, { ephemeralOnly?: boolean })`：当 `ephemeralOnly: true` 时，**严格仅写入 `sessionStorage`**，绝对不触碰 `localStorage`；
  2. 升级 `readGuestToken()`：优先级固定为 `sessionStorage`（当前标签页分身） $\to$ `localStorage`（长效主身份），彻底移除导致死 token 复活的第三优先级；
  3. 改造 `joinRoomByCode` 与 `joinRoomByTarget` 的重试状态机：精确区分 `duplicate-player`/`duplicate-name` 与 `guest-session-invalid`。遇到重复玩家时，传入 `{ ephemeralOnly: true }`，生成仅存在于 `sessionStorage` 的临时分身入房，`localStorage` 中的全局主身份凭据保持 100% 完好无损。

### 1.2 P2-2 闭环：服务端 `socket.data.guestToken` 缓存剥离与显式重置机制
- **缺陷表现**：服务端 `resolveSocketPlayer` 回退 `payload.guestToken || socket.data.guestToken`，客户端清空本地后不带 token 重发自愈时，服务端强制复用旧失效 token 导致二次失败。
- **闭环方案**：
  1. 扩展 `PlayerAuthPayload` 增加 `resetGuestIdentity?: boolean` 字段；
  2. 在 `resolveSocketPlayer` 中：若 `resetGuestIdentity: true`，立即置空 `socket.data.guestToken = undefined`，并不再执行 `socket.data` 回退；
  3. 服务端深度防御：在 `resolvePlayerIdentity` 返回 `guest-session-invalid` 时，主动清空该 socket 上的 `socket.data.guestToken`，确保下一次请求绝不产生死循环。

### 1.3 P2-3 闭环：切断服务端失败无条件发射 `room:error`，消除 UI 红字外溢
- **缺陷表现**：服务端在请求失败时无条件向 `room:error` 发射事件，客户端被动监听写入 `setError`，重连/大厅自愈即便未调 `applyRoomAck` 仍会残留红字报错。
- **闭环方案**：
  1. 服务端契约：针对 `guest-session-invalid` 可自愈错误，仅由 Ack 返回错误对象驱动客户端自愈，不再通过 `socket.emit("room:error")` 发射全局错误；
  2. 客户端自愈：在 `useRoomSocket.ts` 与 `useLobbyPresence.ts` 自愈重试入口显式调用 `setError(null)` 收口，消除竞态下红字残留。

### 1.4 P3-1 闭环：在线匹配入口（`findMatch`）纳入自愈状态机
- **缺陷表现**：`useLobbyPresence.ts:327-342`（`findMatch`）缺少 `guest-session-invalid` 自愈处理。
- **闭环方案**：将 `matchmaking:find` 纳入统一自愈流，收到失效错误时清空凭证并携带 `{ resetGuestIdentity: true }` 换发新身份并重新进入匹配队列。

### 1.5 P3-2 闭环：30 天长周期容量扩容与活跃 LRU 淘汰策略
- **缺陷表现**：`GUEST_SESSION_MAX_ENTRIES = 10_000` 在 30 天滑动窗口下，仅需 ≈333 新访客/日即可触发 LRU 淘汰，误杀未过期会话。
- **闭环方案**：
  1. 容量扩容：`GUEST_SESSION_MAX_ENTRIES` 提升 5 倍至 `50_000`，稳态支持 1,600+ 日增独立访客；
  2. 淘汰策略：严格按 `lastSeenAt` 排序淘汰最久未活跃会话；
  3. 内存与磁盘平衡：Per-Session 维护 `lastPersistedSeenAt`，60 秒节流落盘，兼顾高性能与长效持久。

### 1.6 P3-3 闭环：切断房间会话死 Token 复活链路
- **缺陷表现**：`readGuestToken()` 第三优先级 `readRoomSession()?.guestToken` 会将刚清理的失效 Token 重新取出。
- **闭环方案**：
  1. `readGuestToken()` 彻底移除 `readRoomSession()` 回退；
  2. `clearGuestToken()` 全量清理时同步清理 `StoredRoomSession` 中的 `guestToken`。

---

## 2. 本地门禁基线验证

本次交付为纯方案文档修订，四道门禁保持全绿：

1. `npx tsc --noEmit`：0 错误（严格类型检查通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量扫描通过）
3. `npm test`：31 个测试套件 / 282 项用例 100% 通过
4. `npm run build`：生产构建完全成功（SSG 11 页面通过）

---

## 3. 下一步规划

提交本轮修复交接单并派发 WorkBuddy Round 2 复查。经复查确认闭环后，依据 Rule 11 / Branch C 推进至源码落地与自动化测试阶段。
