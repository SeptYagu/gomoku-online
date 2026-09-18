# 访客身份持久化、30天有效期与全链路自愈技术设计方案（第 2 版 · 闭环修订）

> **状态**：技术设计方案已收敛修订（Technical Design Proposal · Round 2）  
> **修订日期**：2026-09-18  
> **涉及范围**：`src/server/accounts.ts`、`src/server/room-store.ts`、`src/server/room-socket.ts`、`src/components/hooks/room-state-utils.ts`、`src/components/hooks/useRoomSocket.ts`、`src/components/hooks/useLobbyPresence.ts`

---

## 1. 交付目标与痛点根因分析

### 1.1 问题现象
在联机好友房、大厅与快速匹配交互中，用户频繁遇到以下阻断性报错：
> `"Guest session is invalid. Start a new guest session."`

### 1.2 根因深度剖析
经过全链路代码排查与探针验证，该报错由四层缺陷叠加导致：

1. **服务端存储纯内存化（重启即失忆）**：
   - 在 `src/server/accounts.ts` 中，正式注册账号（`AccountStore`）具有成熟的 JSONL 文件持久化机制；
   - 但访客会话（`GuestSessionStore`）为纯内存结构（`Map<string, StoredGuestSession>`），未配置持久化存储；
   - 一旦开发环境热重载、服务器进程重启或生产版本重新发布，服务端内存中所有访客凭证即刻丢失；
   - 此时客户端携带重启前颁发的旧 `guestToken` 发起请求，服务端查无此 token，立即返回 `guest-session-invalid`。
2. **服务端 TTL 偏短（6 小时清理）与容量模型脱节**：
   - `GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000`（6 小时），放置过夜或休眠即失效；
   - 现有容量上限 `GUEST_SESSION_MAX_ENTRIES = 10_000` 在 30 天长周期下，若未经容量扩容与滑动活跃权重保护，易触发 LRU 误淘汰。
3. **客户端凭证生命周期断裂与回退污染**：
   - 客户端 `persistGuestToken` 仅将 `guestToken` 写入 `window.sessionStorage`，标签页关闭即丢失；
   - `readGuestToken` 存在从 `readRoomSession()?.guestToken` 取回死 token 的旧回退路径，导致失效凭证反复复活。
4. **客户端缺乏自愈闭环与服务端错误通道外溢**：
   - `createRoom`、`reconnectHandlerRef` 与 `findMatch` 缺少对 `guest-session-invalid` 的自动捕获与重试；
   - 服务端 `socket.data.guestToken` 回退机制导致客户端空 token 重发自愈时被强制复用旧失效 token；
   - 服务端在请求失败时无条件向 `room:error` 广播错误，无论客户端是否使用 `applyRoomAck`，均会导致 UI 冒出红字报错。

---

## 2. 核心设计目标与用户体验契约

1. **长效设备主身份保持**：
   - 只要是同一台机器、同一浏览器且未手动清除浏览器数据，首次访问拿到的访客主身份（`playerId`、`playerName`、`guestToken`）长期保持一致；
   - 跨会话、重启浏览器或次日访问，自动继承 `localStorage` 中的主访客身份。
2. **1 个月（30 天）滑动过期续期**：
   - 服务端会话 TTL 设定为 30 天（`30 * 24 * 60 * 60 * 1000` 毫秒）；
   - 访客在 30 天内只要有任何再次访问或发包动作，自动刷新 `lastSeenAt`，重置 30 天生命周期时钟；
   - 连续 30 天完全未再次访问，会话才自然失效被回收。
3. **服务端落盘持久化与容量保障**：
   - `GuestSessionStore` 接入 JSONL 文件落盘（存储于 `data/accounts/guest-sessions.jsonl`，受 `.gitignore` 保护）；
   - 服务端重启、代码发布更新后，未过期的访客 Session 完整恢复；
   - `GUEST_SESSION_MAX_ENTRIES` 扩充至 `50_000`（稳态支持 1,600+ 日增访客），LRU 严格按 `lastSeenAt` 淘汰最久未活跃会话。
4. **多标签页对弈隔离保护（Ephemeral 分身）**：
   - 同一浏览器打开多个标签页自测或同房间对局时，当检测到 `duplicate-player` 或 `duplicate-name`，第二标签页通过 `ephemeralOnly` 模式仅在 `sessionStorage` 生成临时对弈身份；
   - 严禁触碰或覆写 `localStorage` 中的主访客凭据。
5. **全链路静默自愈闭环（永不展示报错）**：
   - 无论因 30 天超期或极端淘汰导致 Token 失效，客户端在建房、加入房间、大厅同步、快速匹配、重连中检测到 `guest-session-invalid` 时，自动无感清除旧凭证并请求服务端换发新 Session 平滑重试，彻底消灭 UI 报错。

---

## 3. 详细架构与关键数据契约

```
┌────────────────────────────────────────────────────────┐
│                   客户端 (Browser)                     │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │     localStorage      │   │    sessionStorage    │  │
│  │ (长效主访客身份保持) │   │ (单标签页临时分身)   │  │
│  └──────────┬────────────┘   └──────────┬───────────┘  │
│             │                           │ (优先覆盖)   │
│             └─────────────┬─────────────┘              │
│                           ▼                            │
│                  readGuestToken()                      │
│        [sessionStorage ?? localStorage]                │
└───────────────────────────┬────────────────────────────┘
                            │ (Socket.IO payload: guestToken, resetGuestIdentity?)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   服务端 (Node Server)                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ GuestSessionStore (TTL = 30 Days, Max = 50,000)  │  │
│  │ - resetGuestIdentity: 清理 socket.data.guestToken │  │
│  │ - guest-session-invalid 时自动剥离 socket.data   │  │
│  │ - 抑制 room:error 广播，由 ack 驱动自愈          │  │
│  │ - 60s 节流落盘写入 data/accounts/guest-sessions.jsonl│
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 3.1 服务端数据模型与持久化契约 (`src/server/accounts.ts`)

```typescript
// 1. 常量升级：30 天 TTL 与 50,000 容量
export const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const GUEST_SESSION_MAX_ENTRIES = 50_000;
export const GUEST_SESSION_LAST_SEEN_PERSIST_INTERVAL_MS = 60_000;
export const GUEST_SESSION_COMPACT_AFTER_LINES = 2_000;

export type GuestSessionStoreOptions = {
  compactAfterLines?: number;
  filePath?: false | string;
  lastSeenPersistIntervalMs?: number;
  maxEntries?: number;
  now?: () => number;
  ttlMs?: number;
};

type PersistedGuestSessionEntry = {
  session: StoredGuestSession;
  type: "guest-session";
  writtenAt: number;
};
```

**方法行为规范**：
1. `constructor(options)`：
   - 初始化持久化路径 `filePath`（支持 `false` 供单元测试纯内存运行）、`JsonlCompactionTracker` 与时钟；
   - 执行 `this.loadFromFile()`。
2. `loadFromFile()`：
   - 调用 `readJsonlFile(this.filePath, parsePersistedGuestSessionEntry)`；
   - 过滤 `entry.session.lastSeenAt < this.now() - this.ttlMs` 的超期记录；
   - 填充 `this.sessionsByPlayerId` 与 `this.playerIdByTokenHash`；
   - 使用 `this.lastPersistedSeenAt: Map<string, number>` 独立维护每条会话的落盘时刻。
3. `createSession(input)`：
   - 校验成功后生成 Session，更新内存映射；
   - 追加写入 JSONL 并通过 `this.compaction.noteAppend()` 判断压缩；
   - 容量超限时按 `lastSeenAt` 排序逐出最久未活跃会话（LRU）。
4. `authenticate(token, playerName)`：
   - 验证通过后更新内存 `session.lastSeenAt = this.now()`；
   - **Per-Session 节流落盘**：若 `now - lastPersistedSeenAt.get(id) > 60_000`，追加一条更新日志并刷新落盘时间戳，平抑对局中频繁发包压力。
5. `pruneExpiredSessions()`：
   - 惰性清理 `lastSeenAt < now - ttlMs` 的过期会话。

### 3.2 服务端组装注入与协议协议改动 (`src/server/room-socket.ts` & `room-store.ts`)

#### 1. 单例持久化路径挂载 (`src/server/room-store.ts`)
```typescript
const guestSessionFilePath =
  process.env.GOMOKU_GUEST_SESSIONS_PATH ?? "data/accounts/guest-sessions.jsonl";

export const guestSessionStore = new GuestSessionStore({
  filePath: guestSessionFilePath
});
```

#### 2. 服务端重置身份协议与缓存剥离 (`src/server/room-socket.ts`)
为断绝 P2-2（服务端回退 `socket.data.guestToken` 导致自愈二次失败），扩充认证荷载并优化 `resolveSocketPlayer`：

```typescript
export type PlayerAuthPayload = {
  accountToken?: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
  resetGuestIdentity?: boolean; // 显式重置标记：清除该连接上缓存的旧 guestToken
};

function resolveSocketPlayer(
  socket: RoomSocket,
  payload: PlayerAuthPayload,
  accountStore: AccountStore,
  guestSessionStore: GuestSessionStore,
  allowGuestSessionCreation = true
) {
  // 若客户端显式请求换发新身份，或主动不传 guestToken，清理 socket 缓存
  if (payload.resetGuestIdentity) {
    socket.data.guestToken = undefined;
  }

  const accountToken = payload.accountToken?.trim();
  const guestToken = payload.resetGuestIdentity
    ? payload.guestToken?.trim()
    : payload.guestToken?.trim() || socket.data.guestToken;

  if (!accountToken && !guestToken && !allowGuestSessionCreation) {
    return {
      ok: false as const,
      error: {
        code: "guest-session-invalid" as const,
        message: "Guest session is required to reconnect."
      }
    };
  }

  const player = resolvePlayerIdentity(
    { ...payload, guestToken },
    accountStore,
    guestSessionStore
  );

  if (player.ok) {
    socket.data.guestToken = player.value.guestToken;
  } else if (player.error.code === "guest-session-invalid") {
    // 关键自愈保障：一旦 token 失效，立即清除 socket 缓存，防止下一次重发继续回退死 token
    socket.data.guestToken = undefined;
  }

  return player;
}
```

#### 3. 抑制全局 `room:error` 外溢 (解决 P2-3)
- 在 `acknowledgeAndBroadcast`（`:997`）与 `presence:join`（`:369`）中，当错误为 `guest-session-invalid` 时，**仅通过 Ack 回调告知客户端**，**不再无条件向 socket 发射 `room:error` 事件**，避免 UI 弹出红字。

---

### 3.3 客户端存储双写与分身隔离 (`src/components/hooks/room-state-utils.ts`)

彻底解决 P2-1 与 P3-3，严格区分主身份与临时分身：

```typescript
export type StorageOptions = {
  ephemeralOnly?: boolean;
};

// 1. 写凭证：ephemeralOnly 仅写当前标签页 sessionStorage，主身份才写 localStorage
export function persistGuestToken(guestToken: string, options: StorageOptions = {}): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
  if (!options.ephemeralOnly) {
    window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
  }
}

// 2. 读凭证：sessionStorage (临时分身) 优先；无分身则回退 localStorage (主身份)
// 移除旧有 readRoomSession()?.guestToken 回退，彻底杜绝死 token 复活 (P3-3)
export function readGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    null
  );
}

// 3. 清理凭证：支持纯分身清理或全量注销清理
export function clearGuestToken(options: StorageOptions = {}): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  if (!options.ephemeralOnly) {
    window.localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
    // 同步清空房间会话中的 guestToken，防止残留污染 (P3-3)
    const currentSession = readRoomSession();
    if (currentSession?.guestToken) {
      persistRoomSession({ ...currentSession, guestToken: undefined });
    }
  }
}

// 4. Player ID 长效管理与分身支持
export function getOrCreatePlayerId(options: StorageOptions = {}): string {
  if (typeof window === "undefined") return createGuestPlayerId();

  const storedPlayerId =
    window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    window.localStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    readRoomSession()?.playerId;

  if (storedPlayerId && isValidPlayerId(storedPlayerId)) {
    if (!options.ephemeralOnly) {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    }
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    return storedPlayerId;
  }

  return createAndPersistPlayerId(options);
}

export function createAndPersistPlayerId(options: StorageOptions = {}): string {
  const playerId =
    globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
  if (!options.ephemeralOnly) {
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
  }

  return playerId;
}
```

---

### 3.4 客户端静默自愈状态机 (`useRoomSocket.ts` & `useLobbyPresence.ts`)

#### 1. `createRoom` 自愈闭环 (`useRoomSocket.ts`)
```typescript
socket.emit("room:create", { ...player, visibility }, (response: RoomAck) => {
  if (
    !response.ok &&
    !player.accountToken &&
    response.error.code === "guest-session-invalid"
  ) {
    // 1. 全量清理本地失效凭据并收口错误
    clearGuestToken();
    setError(null);
    const freshPlayer = {
      playerId: createAndPersistPlayerId(),
      playerName: player.playerName,
      resetGuestIdentity: true // 通知服务端清除 socket.data.guestToken 缓存
    };
    // 2. 静默重发建房请求
    socket.emit("room:create", { ...freshPlayer, visibility }, (retryResponse: RoomAck) => {
      createRequestInFlightRef.current = false;
      setIsCreatingRoom(false);
      applyRoomAck(retryResponse);
    });
    return;
  }

  createRequestInFlightRef.current = false;
  setIsCreatingRoom(false);
  applyRoomAck(response);
});
```

#### 2. `joinRoomByCode` / `joinRoomByTarget` 分身与自愈解耦 (`useRoomSocket.ts`)
```typescript
// 区分处理 duplicate-player (走分身) 与 guest-session-invalid (走全量重置)
if (!response.ok && !player.accountToken && retryWithFreshIdentity) {
  const isDuplicate =
    response.error.code === "duplicate-player" || response.error.code === "duplicate-name";
  const isInvalidSession = response.error.code === "guest-session-invalid";

  if (isDuplicate || isInvalidSession) {
    setError(null);
    // duplicate-player 启用 ephemeralOnly 保护主身份！(P2-1 闭环)
    const ephemeralMode = isDuplicate;
    clearGuestToken({ ephemeralOnly: ephemeralMode });

    player = {
      playerId: createAndPersistPlayerId({ ephemeralOnly: ephemeralMode }),
      playerName: createGuestPlayerName(),
      resetGuestIdentity: true
    };
    setPlayerNameState(player.playerName);
    if (!ephemeralMode) {
      persistPlayerName(player.playerName);
    }

    socket.emit(
      "room:join",
      { ...player, roomCode: nextRoomCode },
      (retryAck: RoomAck) => {
        if (retryAck.ok && ephemeralMode && retryAck.value.guestToken) {
          // 分身 token 严格只存入 sessionStorage
          persistGuestToken(retryAck.value.guestToken, { ephemeralOnly: true });
        }
        applyRoomAck(retryAck);
      }
    );
    return;
  }
}
```

#### 3. `reconnectHandlerRef` 断线重连收口 (`useRoomSocket.ts`)
```typescript
ensureSocket().emit("room:rejoin", storedSession, (response: RoomAck) => {
  if (response.ok) {
    applyRoomAck(response);
    return;
  }

  if (response.error.code === "guest-session-invalid") {
    clearGuestToken();
    createAndPersistPlayerId();
    clearRoomSession();
    setError(null); // 显式置空，不外溢红字报错 (P2-3 闭环)
    return;
  }

  if (response.error.code === "room-not-found") {
    clearClosedRoom(storedSession.roomCode);
    return;
  }

  applyRoomAck(response);
});
```

#### 4. 大厅 Presence 与匹配对战自愈 (`useLobbyPresence.ts`)
- **`refreshPresence`**：收到 `guest-session-invalid` 时，静默调用 `clearGuestToken()` 并携带 `{ resetGuestIdentity: true }` 重新调用 `presence:join`，清空 `error`；
- **`findMatch` (快速匹配，解决 P3-1)**：收到 `guest-session-invalid` 时，清空 token 并携带新身份重试一次 `matchmaking:find`，全链路消灭报错。

---

## 4. 边界与边缘场景处理矩阵

| 场景 | 行为表现 | 设计保证 |
| :--- | :--- | :--- |
| **服务端重启 / 重新部署** | 访客带着旧 Token 建房/加入 | 服务端自 `guest-sessions.jsonl` 恢复会话，验证 100% 成功，玩家无感知 |
| **超期 30 天未访问** | 用户在第 31 天首次访问 | 服务端返回 `guest-session-invalid` 并剥离 socket 缓存，客户端 `resetGuestIdentity` 自动换发新 Token 重试成功，零红字报错 |
| **单机多开同房对弈** | Tab 1 建房，Tab 2 输码加入 | Tab 2 检测到 `duplicate-player`，启用 `ephemeralOnly` 仅在 `sessionStorage` 生成独立对战身份入房，**Tab 1 与后续新窗口的 `localStorage` 主身份完好无损** |
| **同一长连发生 Token 失效** | 长时间开着网页发生 Session 失效 | 客户端重试带 `resetGuestIdentity: true`，服务端强制清空 `socket.data.guestToken`，换发新 ID 成功入房 |
| **高频走子 / 发包续期** | 玩家频繁走子或切大厅 | 每会话 `lastSeenAt` 落盘引入 60 秒节流锁，避免频繁同步写盘 |
| **并发访客超限 (50,000)** | 极高并发涌入新用户 | 按 `lastSeenAt` 逐出最久未活跃会话，容量提升 5 倍，活跃用户永不被误踢 |

---

## 5. 验收标准与验证方案

### 5.1 自动化测试规范
1. **服务端单测 (`src/server/accounts.test.ts`)**：
   - 验证 `GuestSessionStore` 支持 JSONL 持久化写入与跨实例重启恢复；
   - 验证 30 天过期时钟与活跃续期机制；
   - 验证 50,000 容量上限下按 `lastSeenAt` 淘汰最久未活跃会话；
   - 验证坏行自动跳过与文件自动压缩。
2. **Socket 联机测试 (`src/server/room-socket.test.ts`)**：
   - 验证在同一 socket 上认证失效后，重发自愈请求能成功换发新身份并清理 `socket.data.guestToken`；
   - 验证双 socket 携带同一 guestToken 接入后，第二 socket 触发 `duplicate-player` 能够换发独立身份并成功加入房间；
   - 验证 `guest-session-invalid` 不向全局广播 `room:error`。
3. **客户端状态单测 (`src/components/hooks/room-state-utils.test.ts`)**：
   - 验证 `persistGuestToken({ ephemeralOnly: true })` 严格只写 `sessionStorage`，断言 `localStorage` 零变更；
   - 验证 `readGuestToken()` 优先读取分身，无分身读取主身份，且移除死会话回退；
   - 验证全量清理时同步清除 `readRoomSession` 中的凭证。

### 5.2 门禁基线
- 四道本地门禁（TypeScript 严格检查、ESLint 全绿、Vitest 全绿、Next.js 生产构建通过）保持 100% 通过。
