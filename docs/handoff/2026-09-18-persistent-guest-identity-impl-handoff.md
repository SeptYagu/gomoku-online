# 访客身份持久化、30天滑动TTL与全链路静默自愈 · 源码实现与交付交接单

> **交接日期**：2026-09-18  
> **交接类型**：功能实现与待审交付（Feature Implementation & Push for Review · Round 1）  
> **审查基线 (Base SHA)**：`cb01d11`（设计方案收敛定稿提交）  
> **涉及模块与文件范围**：
> - 服务端博弈网络与账户：`src/server/accounts.ts`、`src/server/room-store.ts`、`src/server/room-socket.ts`
> - 客户端凭据管理与状态机：`src/components/hooks/room-state-utils.ts`、`src/components/hooks/useRoomSocket.ts`、`src/components/hooks/useLobbyPresence.ts`
> - 自动化测试套件：`src/server/accounts.test.ts`、`src/server/room-socket.test.ts`、`src/components/hooks/room-state-utils.test.ts`

---

## 一、核心变更与实现全貌 (Implementation Details)

### 1. 服务端：长效持久化与会话生命周期
- **30天滑动活跃 TTL**：
  - `GUEST_SESSION_TTL_MS` 升级为 `30 * 24 * 60 * 60 * 1000`（30天），容量上限扩展至 `50,000` 条；
  - 每次收到有效请求（`authenticate()`）时，自动滑动刷新 `session.lastSeenAt`；只要 30 天内有一次访问，访客身份永久延续。
- **文件落盘与重启恢复 (JSONL)**：
  - 单例挂载生产落盘路径 `data/accounts/guest-sessions.jsonl`（环境变量 `GOMOKU_GUEST_SESSIONS_PATH` 支持测试覆盖）；
  - 采用安全单向哈希 `hashToken(token)` 存盘，保障凭据安全；
  - 启动阶段执行 `loadFromFile()`，内建损坏行容错与过期条目自动过滤；
  - 实现基于 `lastSeenAt` 的精确 LRU 淘汰机制。
- **60秒节流落盘与日志压缩协同**：
  - `authenticate()` 仅在 `now - session.persistedLastSeenAt >= 60,000ms` 时追加写入更新，避免高频网络请求引起磁盘 I/O 风暴；
  - 每次追加落盘严格调用 `this.compaction.noteAppend()`，在达到压缩阈值时触发单向文件紧缩（Compaction）。
- **网络层抑制与重置协议扩展**：
  - 服务端协议 `PlayerAuthPayload` 扩充 `resetGuestIdentity?: boolean`；
  - `resolveSocketPlayer` 检测到 `resetGuestIdentity: true` 或现有凭据失效时，强制清除 socket 上的脏凭据缓存；
  - `acknowledgeAndBroadcast`、`acknowledgeAndBroadcastRoomOnly` 与 `presence:join` 抑制 `guest-session-invalid` 向客户端广播 `room:error`，将错误收敛在单播 ACK 内，交由客户端驱动静默自愈。

### 2. 客户端：凭据双写、分身隔离与全链路静默自愈
- **主身份持久保留与防死 Token 复活**：
  - `getOrCreatePlayerId`、`persistGuestToken`、`persistPlayerName` 在正常状态下执行 `sessionStorage` + `localStorage` 双写；
  - `readGuestToken` 严格优先读取 `sessionStorage`，回退读取 `localStorage`，**彻底移除旧代码回退读取 `readRoomSession()?.guestToken` 的死 Token 泄漏路径**；
  - `clearGuestToken` 联动清空 localStorage、sessionStorage 以及房间会话中的残留 token。
- **标签页级 Ephemeral 状态机（杜绝 P2-1 分身污染）**：
  - 引入 `EPHEMERAL_SESSION_KEY = "gomoku:ephemeral_session"` 显式标签页会话旗标；
  - 导出 `isEphemeralSession()`、`markEphemeralSession()`、`clearEphemeralSession()` 与内部双重守卫 `shouldBeEphemeral(options)`；
  - 一旦标签页由于多开冲突触发分身重试并标记为 Ephemeral，底层所有持久化函数（`persistGuestToken`、`getOrCreatePlayerId`、`createAndPersistPlayerId`、`clearGuestToken`）强行短路仅操作 `sessionStorage`；
  - `getActivePlayer()` 显式传入 `ephemeralOnly: isEphemeralSession()`，杜绝深层调用链中的回写提升漏洞。
- **全链路静默自愈 (Silent Self-Healing)**：
  - **建房流程 (`createRoom`)**：捕获 `guest-session-invalid` ➔ 清除脏凭据 ➔ 携带 `resetGuestIdentity: true` 生成全新身份并静默重试建房；
  - **加房流程 (`joinRoomByCode` / `joinRoomByTarget`)**：捕获 `guest-session-invalid` ➔ 清空凭据与房间会话 ➔ 携带 `resetGuestIdentity: true` 静默换发新身份并重发加房请求；捕获 `duplicate-player`/`duplicate-name` ➔ 标记 `markEphemeralSession()` ➔ 传 `{ ephemeralOnly: true }` 隔离重发；
  - **长连接重连 (`reconnectHandlerRef`)**：捕获 `guest-session-invalid` ➔ 拦截红字报错，重置本地凭据为全新身份，阻断旧 Token 死循环重试；
  - **大厅 Presence (`refreshPresence`)**：捕获 `guest-session-invalid` ➔ 清空脏凭据，带 `resetGuestIdentity: true` 重新调用 `presence:join`，清空 `error`；
  - **匹配队列 (`findMatch`)**：捕获 `guest-session-invalid` ➔ 清空脏凭据，带 `resetGuestIdentity: true` 重新调用 `matchmaking:find`，全链路无缝自愈。

---

## 二、自动化测试与门禁验证报告 (Verification)

### 1. 自动化测试套件
- **`src/server/accounts.test.ts` (15/15 全部通过)**：
  - 验证 JSONL 文件落盘与跨实例热启动加载；
  - 验证 30 天滑动活跃续期（15天、35天活跃依然有效，31天无访问自然失效）；
  - 验证 60 秒节流写盘与压缩记账计数；
  - 验证基于 `lastSeenAt` 的容量溢出淘汰；
  - 验证文件损坏行跳过容错。
- **`src/server/room-socket.test.ts` (23/23 全部通过)**：
  - 验证 `guest-session-invalid` 不再发射 `room:error` 事件；
  - 验证携带 `resetGuestIdentity: true` 可成功签发新身份并入房。
- **`src/components/hooks/room-state-utils.test.ts` (6/6 全部通过)**：
  - 验证长效双写与跨会话读取；
  - 验证 `clearGuestToken` 深度清空；
  - **集成级分身隔离守门测试**：模拟真实多开加房、标记 Ephemeral、多次执行 `getActivePlayer()`，断言主标签页与 localStorage 中的主 Token / 主 PlayerId 逐字节保持一致，新开标签页仍然稳定继承主身份。
- **全库单元测试结果**：32 个测试套件，294 项用例，100% 全绿通过。

### 2. 四道工程门禁验证 (100% 全绿)
| 门禁项目 | 命令 | 检查结果 | 状态 |
| :--- | :--- | :--- | :--- |
| **门禁 1: 类型安全** | `npx tsc --noEmit` | 0 错误 (TS 严格逆变/泛型全通过) | **PASS** |
| **门禁 2: 代码规范** | `npm run lint` | 0 错误 0 警告 (ESLint 全量无告警) | **PASS** |
| **门禁 3: 单元测试** | `npm test` | 32 套件 / 294 用例 全部通过 | **PASS** |
| **门禁 4: 生产构建** | `npm run build` | Next.js 16.2.9 Turbopack 打包编译全通过 | **PASS** |

---

## 三、后续审查与自愈流程 (Next Steps)
按照双智能体协作规范与 WorkBuddy 审查协议：
1. 提交代码并推送至 `origin/main`（待审状态）；
2. 依据 Rule 8 & 9，使用 `workbuddy_cli.py review` 机械派发 WorkBuddy 独立代码审查（Round 1）；
3. 挂起等待裁决，若发现缺陷则进入自愈修复循环（最多 10 轮），若审查通过则正式向用户交付。
