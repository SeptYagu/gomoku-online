# 访客身份持久化、30天有效期与全链路自愈技术设计方案

> **状态**：技术设计方案交付待审（Technical Design Proposal）  
> **设计日期**：2026-09-18  
> **涉及范围**：`src/server/accounts.ts`、`src/server/room-store.ts`、`src/server/room-socket.ts`、`src/components/hooks/room-state-utils.ts`、`src/components/hooks/useRoomSocket.ts`、`src/components/hooks/useLobbyPresence.ts`

---

## 1. 交付目标与痛点根因分析

### 1.1 问题现象
在联机好友房或大厅交互中，用户频繁遇到以下报错提示：
> `"Guest session is invalid. Start a new guest session."`

### 1.2 根因深度剖析
经过全链路代码排查，该报错由四层设计缺陷叠加导致：

1. **服务端存储纯内存化（重启即失忆）**：
   - 在 `src/server/accounts.ts` 中，正式注册账号（`AccountStore`）具有成熟的 JSONL 文件持久化机制；
   - 但访客会话（`GuestSessionStore`）为纯内存结构（`Map<string, StoredGuestSession>`），未配置任何持久化存储；
   - 一旦开发环境热重载、服务器进程重启或生产版本重新发布，服务端内存中所有访客凭证即刻丢失；
   - 此时客户端携带重启前由旧进程颁发的 `guestToken` 发起请求，服务端在内存中查无此 token，立即报 `guest-session-invalid`。

2. **服务端 TTL 偏短（6小时清理）**：
   - `GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000`（6 小时）；
   - 用户稍微放置页面、电脑休眠或次日再次访问时，会话早被服务端 `pruneExpiredSessions` 清理。

3. **客户端凭证生命周期断裂（`sessionStorage` 限制）**：
   - 客户端 `persistGuestToken` 将 `guestToken` 写入 `window.sessionStorage`，标签页关闭或浏览器关闭后即刻销毁；
   - 但 `localStorage` 中却留存了旧的 `playerName`，导致身份标识与凭据状态脱节。

4. **客户端缺乏自愈闭环（直接抛错弹窗）**：
   - 在 `joinRoomByCode`（加入房间）中，代码虽然实现了针对 `guest-session-invalid` 的自动清理与重试（`retryWithFreshIdentity`）；
   - **但在 `createRoom`（创建房间）中**：`useRoomSocket.ts` 直接调用 `applyRoomAck(response)`，未对 `guest-session-invalid` 做任何拦截或重试，直接把错误字符串通过 `setError` 渲染在好友房 UI 上；
   - **在 `reconnectHandlerRef`（Socket 重连）中**：虽然执行了 `clearGuestToken()`，紧接着依然调用了 `applyRoomAck(response)`，直接将重连失败暴露给用户；
   - **在 `refreshPresence`（大厅活跃）中**：收到错误直接调用 `setError`，大厅顶部出现红字报错。

---

## 2. 核心设计目标与用户体验契约

1. **长效设备身份保持**：
   - 只要是同一台机器、同一浏览器且未手动清除浏览器数据，首次访问拿到的访客身份（`playerId`、`playerName`、`guestToken`）长期保持一致；
   - 关闭浏览器、重启电脑、次日或下周再次进入，仍然沿用既有访客身份。
2. **1 个月（30天）滑动过期续期**：
   - 服务端会话 TTL 设定为 30 天（`30 * 24 * 60 * 60 * 1000` 毫秒）；
   - 访客在 30 天内只要有任何再次访问或连接动作，自动刷新 `lastSeenAt`，重置 30 天生命周期时钟；
   - 连续 30 天完全未再次访问，会话才自然失效被回收。
3. **服务端落盘持久化**：
   - `GuestSessionStore` 支持 JSONL 文件落盘（存储于 `data/accounts/guest-sessions.jsonl`，在 `.gitignore` 内自动受保）；
   - 服务端重启、代码发布更新后，未过期的访客 Session 完整恢复。
4. **多标签页对弈隔离保护**：
   - 同一浏览器打开多个标签页自测或对局时，若第二标签页加入第一标签页房间触发 `duplicate-player`，仅第二标签页通过 `sessionStorage` 生成临时分身，严禁抹除 `localStorage` 中主访客凭据。
5. **全链路静默自愈兜底**：
   - 即使访客因超过 30 天未访问导致 Token 失效，客户端在创建房间、加入房间、大厅状态同步、重连中检测到 `guest-session-invalid` 时，自动无感重新签发新 Session 并平滑重试，**永不再向用户弹窗或展示报错**。

---

## 3. 详细架构与关键数据契约

```
┌────────────────────────────────────────────────────────┐
│                   客户端 (Browser)                     │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │     localStorage      │   │    sessionStorage    │  │
│  │ (长效主访客身份保持) │   │ (单标签页临时覆盖)   │  │
│  └──────────┬────────────┘   └──────────┬───────────┘  │
│             └─────────────┬─────────────┘              │
│                           ▼                            │
│                  readGuestToken()                      │
└───────────────────────────┬────────────────────────────┘
                            │ (Socket.IO with guestToken)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   服务端 (Node Server)                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ GuestSessionStore (TTL = 30 Days)                │  │
│  │ - sessionsByPlayerId (Map)                       │  │
│  │ - playerIdByTokenHash (Map)                      │  │
│  │ - 60s 节流落盘写入                               │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│         data/accounts/guest-sessions.jsonl             │
│        (重启恢复 / 自动压缩 / 超期30天修剪)            │
└────────────────────────────────────────────────────────┘
```

### 3.1 服务端 `GuestSessionStore` 持久化契约

在 `src/server/accounts.ts` 中升级 `GuestSessionStore`：

```typescript
// 1. 常量升级：30天 TTL (毫秒)
export const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

**方法与时序契约**：
1. `constructor(options)`：
   - 初始化持久化路径 `filePath`、压缩追踪器 `JsonlCompactionTracker` 与时钟；
   - 调用 `this.loadFromFile()`。
2. `loadFromFile()`：
   - 调用 `readJsonlFile(this.filePath, parsePersistedGuestSessionEntry)`；
   - 自动过滤 `entry.session.lastSeenAt < this.now() - this.ttlMs` 的过期记录；
   - 将有效记录注入 `this.sessionsByPlayerId` 与 `this.playerIdByTokenHash`；
   - 初始化 `this.lastPersistedSeenAt`。
3. `createSession(input)`：
   - 校验成功后生成 Session，更新内存映射；
   - 调用 `this.persist(session)` 追加写入 JSONL；
   - 达到压缩阈值时异步调用 `this.compactFile()`。
4. `authenticate(token, playerName)`：
   - 验证成功后，更新内存 `session.lastSeenAt = this.now()`；
   - **节流落盘**：比对 `session.lastSeenAt - lastPersistedSeenAt > lastSeenPersistIntervalMs`，若超过 60 秒则写入增量追加日志，避免对局期间高频写入；
   - 续期成功，重新激活 30 天有效期。
5. `pruneExpiredSessions()`：
   - 每次读写操作时惰性扫描，移除 `lastSeenAt < now - ttlMs` 的会话。

### 3.2 服务端组装注入：`src/server/room-store.ts`

```typescript
const guestSessionFilePath =
  process.env.GOMOKU_GUEST_SESSIONS_PATH ?? "data/accounts/guest-sessions.jsonl";

export const guestSessionStore = new GuestSessionStore({
  filePath: guestSessionFilePath
});
```

### 3.3 客户端存储双写与长效保持：`src/components/hooks/room-state-utils.ts`

```typescript
export function persistGuestToken(guestToken: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
  window.sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
}

export function readGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    readRoomSession()?.guestToken ??
    null
  );
}

export function clearGuestToken(options: { ephemeralOnly?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  if (!options.ephemeralOnly) {
    window.localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  }
}
```

**`getOrCreatePlayerId` 长效持久化**：
```typescript
export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return createGuestPlayerId();
  
  const storedPlayerId =
    window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    window.localStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    readRoomSession()?.playerId;

  if (storedPlayerId && isValidPlayerId(storedPlayerId)) {
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    return storedPlayerId;
  }

  return createAndPersistPlayerId();
}
```

### 3.4 客户端静默自愈状态机

#### 1. `createRoom` 自愈闭环：`src/components/hooks/useRoomSocket.ts`
```typescript
socket.emit("room:create", { ...player, visibility }, (response: RoomAck) => {
  if (
    !response.ok &&
    !player.accountToken &&
    response.error.code === "guest-session-invalid"
  ) {
    // 1. 清理本地无效凭据
    clearGuestToken();
    const freshPlayer = {
      playerId: createAndPersistPlayerId(),
      playerName: getActivePlayer().playerName
    };
    // 2. 静默无感重发建房请求
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

#### 2. `reconnectHandlerRef` 断线重连兜底：
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
    // 退出重连状态，不调用 applyRoomAck 污染 UI 报错
    return;
  }

  if (response.error.code === "room-not-found") {
    clearClosedRoom(storedSession.roomCode);
    return;
  }

  applyRoomAck(response);
});
```

#### 3. 大厅 Presence 同步自愈：`src/components/hooks/useLobbyPresence.ts`
在 `refreshPresence` 中，若返回 `guest-session-invalid`，静默执行 `clearGuestToken()` 并刷新获取新身份重新加入 Presence，消除大厅顶部红字。

---

## 4. 边界与边缘场景处理

| 场景 | 行为表现 | 设计保证 |
| :--- | :--- | :--- |
| **服务端重启 / 部署** | 访客带着旧 Token 创建/加入房间 | 服务端自 `guest-sessions.jsonl` 重建 Session，Token 验证 100% 成功，玩家无感知 |
| **超期 30 天未访问** | 用户在第 31 天首次访问 | 服务端判定 Token 过期返回 `guest-session-invalid`，客户端触发自愈重试，透明换发新 Token，玩家零报错 |
| **单机多开对弈测试** | Tab 1 建房，Tab 2 输入房间码加入 | Tab 2 检测到 `duplicate-player`，传入 `{ ephemeralOnly: true }` 仅在 `sessionStorage` 生成临时对弈身份，Tab 1 与后续新窗口的 `localStorage` 主身份完好无损 |
| **注册/登录账号** | 访客登录正式账号 | 优先级 `accountToken` 高于 `guestToken`，无缝升级为 Registered 身份，原 Guest 记录不干扰账号体系 |
| **注销账号** | 用户退出登录 | 自动平滑回落至本地 `localStorage` 保留的访客身份 |
| **高频网络请求 / 续期压力** | 玩家频繁走子或刷新大厅 | `lastSeenAt` 落盘引入 60 秒节流锁，仅内存更新活跃态，规避频繁磁盘 IO |

---

## 5. 验收标准与验证方案

### 5.1 自动化测试规范
1. **服务端单测 (`src/server/accounts.test.ts`)**：
   - 验证 `GuestSessionStore` 支持 JSONL 持久化写入与新实例重启加载恢复；
   - 验证 30 天过期时钟与活跃续期机制；
   - 验证损坏行跳过与文件自动压缩。
2. **Socket 联机测试 (`src/server/room-socket.test.ts`)**：
   - 验证落盘配置下访客进出房间与断线重连完整生命周期。
3. **客户端状态单测 (`src/components/hooks/room-state-utils.test.ts` 或现有套件)**：
   - 验证 `persistGuestToken` 与 `readGuestToken` 的跨 Storage 回退与优先级契约；
   - 验证 `ephemeralOnly` 保护主身份不被意外抹除。

### 5.2 门禁基线
- 四道本地门禁（TypeScript、ESLint、Vitest、Next.js Build）必须全绿。
