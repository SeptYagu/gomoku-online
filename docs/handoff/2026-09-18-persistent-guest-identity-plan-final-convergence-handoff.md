# 访客身份持久化设计方案 · 第 3 轮收敛定稿与转入实现交接单

> **交接日期**：2026-09-18  
> **交接类型**：技术方案收敛定稿（Technical Design Proposal Final Convergence · Round 3）  
> **审查基准**：`371ac83`（WorkBuddy Round 2 审查报告）  
> **核心状态**：设计方案完成 3 轮审查迭代，所有 P2 与 P3 审查缺陷全部闭环，达成设计收敛（Design Convergence），正式转入源码开发阶段。

---

## 一、Round 2 审查缺陷闭环说明 (100% 解决)

| 缺陷编号 | 严重级 | 审查指出的问题根因 | 方案修订与最终闭环方案 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **P2-1** | **高** | **分身隔离被两条主身份写路径打破**：<br>① `applyRoomAck` 内部调用 `persistGuestToken` 缺省参数导致分身 token 漏写 `localStorage`；<br>② `getActivePlayer` 调用 `getOrCreatePlayerId` 缺省参数导致 `sessionStorage` 的分身 `playerId` 回写并提升覆盖 `localStorage` 主身份。 | **将 Ephemeral 提升为标签页级 Session 显式状态**（`sessionStorage` 旗标 `GOMOKU_ONLINE_EPHEMERAL_SESSION`）：<br>1. 引入 `isEphemeralSession()`、`markEphemeralSession()`、`clearEphemeralSession()` 与内部双重守卫 `shouldBeEphemeral(options)`；<br>2. `persistGuestToken`、`getOrCreatePlayerId`、`createAndPersistPlayerId`、`clearGuestToken` 全部受该状态强行短路保护，**分身标签页任何写路径绝对无法触碰 `localStorage`**；<br>3. `applyRoomAck` 与 `getActivePlayer` 显式注入该状态；<br>4. 在 §5.1 增加集成级守门测试断言（`localStorage` 主 token/playerId 逐字节不变）。 | **已闭环** |
| **P3-1** | **低** | 客户端 `room-state-utils.ts:30-35` 的 `PlayerAuthPayload` 未同步声明 `resetGuestIdentity?: boolean`，导致实现期 `npx tsc --noEmit` 触发 `TS2353` 报错。 | 在方案 §3.2-2 与 §3.3 明确：**服务端与客户端两处同名 `PlayerAuthPayload` 必须保持严格同步**，均扩展 `resetGuestIdentity?: boolean` 字段。 | **已闭环** |
| **建议 1** | 建议 | §3.4-2 仅给出了 `joinRoomByCode` 的伪代码，未给出 `joinRoomByTarget` 变体。 | 在 §3.4-2 明确补齐 `joinRoomByTarget`（`room:join-target` + `target` 入参）对应的分身隔离与自愈代码。 | **已吸收** |
| **建议 2** | 建议 | 服务端 `lastSeenAt` 60s 节流追加未明确是否计入 `this.compaction.noteAppend()`。 | 在 §3.1-4 明确：节流写盘时同步调用 `this.compaction.noteAppend()`，与 `AccountStore` 口径严格对齐，保证文件日志压缩正常触发。 | **已吸收** |

---

## 二、方案收敛判定依据 (Rule 7, Rule 11 & AGENTS.md §4.3 分支 C)

依据仓库智能体协作协议与 WorkBuddy 协作规则：
1. **轮次上限与收敛规则**：技术方案设计与文档审查严格限制最多 3 轮（`Round <= 3`）。当前已完成 Round 1 与 Round 2 两轮高强度审查，方案历经 3 个版本迭代；
2. **零技术遗留债**：Round 2 指出的所有问题（P2-1、P3-1、建议 1、建议 2）已在 `docs/PERSISTENT_GUEST_IDENTITY_PLAN.md`（第 3 版 · 收敛定稿）中给出具体且可落地的架构定义与代码方案；
3. **收敛结论**：主开发智能体（Antigravity）正式判定设计方案达成**收敛定稿（Design Convergence）**，终止纯文档审查循环，立即转入源码落地与自动化测试开发阶段。

---

## 三、源码落地阶段执行规划 (Implementation Plan)

方案收敛后，立即按以下依赖拓扑分步实现与自测：

### 阶段 1：服务端持久化与协议扩展
1. **`src/server/accounts.ts`**：
   - 升级 `GUEST_SESSION_TTL_MS` 为 30 天，`GUEST_SESSION_MAX_ENTRIES` 为 50,000；
   - `GuestSessionStore` 增加 JSONL 文件持久化（`filePath`，支持测试环境内存运行）、`loadFromFile()`、LRU 按 `lastSeenAt` 逐出；
   - `authenticate` 增加 60 秒 per-session 节流落盘，并调用 `this.compaction.noteAppend()`；
   - 编写 `src/server/accounts.test.ts` 专项持久化、恢复、清理测试。
2. **`src/server/room-store.ts`**：
   - 为单例 `guestSessionStore` 注入生产落盘路径 `data/accounts/guest-sessions.jsonl`（环境变量 `GOMOKU_GUEST_SESSIONS_PATH` 支持覆盖）。
3. **`src/server/room-socket.ts`**：
   - `PlayerAuthPayload` 增加 `resetGuestIdentity?: boolean`；
   - `resolveSocketPlayer` 支持 `resetGuestIdentity` 强制清空 `socket.data.guestToken`，且在 session 失效时自动清除 socket 缓存；
   - `acknowledgeAndBroadcast` 与 `presence:join` 抑制 `guest-session-invalid` 向全局发射 `room:error`。

### 阶段 2：客户端存储隔离与全链路自愈
1. **`src/components/hooks/room-state-utils.ts`**：
   - `PlayerAuthPayload` 同步扩展 `resetGuestIdentity?: boolean`；
   - 新增 `EPHEMERAL_SESSION_KEY` 与 `isEphemeralSession` / `markEphemeralSession` / `clearEphemeralSession`；
   - 重构 `persistGuestToken`、`readGuestToken`、`clearGuestToken`、`getOrCreatePlayerId`、`createAndPersistPlayerId`，全面受 `shouldBeEphemeral()` 双重守卫约束；
   - 移除 `readRoomSession()?.guestToken` 死 token 回退；
   - 编写 `src/components/hooks/room-state-utils.test.ts` 单元测试与集成级分身隔离守门测试。
2. **`src/components/hooks/useRoomSocket.ts`** & **`useLobbyPresence.ts`**：
   - `applyRoomAck` 扩展 `options?: StorageOptions` 并透传 `ephemeralOnly: isEphemeralSession()`；
   - `getActivePlayer` 注入 `isEphemeralSession()`；
   - `createRoom`、`joinRoomByCode`、`joinRoomByTarget`、`reconnectHandlerRef`、`refreshPresence`、`findMatch` 全链路捕获 `guest-session-invalid`，静默重置凭据并自动重试，彻底消除 UI 报错。

### 阶段 3：全量门禁与 WorkBuddy 代码级正式审查
1. 本地运行四道门禁（`tsc`、`lint`、`test`、`build`）确保全绿；
2. 运行 `npm run verify:online` 确保联机网络时序无回归；
3. 提交并推送代码；
4. 派发 WorkBuddy 独立代码审查（代码实现阶段最多支持 10 轮高强度审查自愈循环）。
