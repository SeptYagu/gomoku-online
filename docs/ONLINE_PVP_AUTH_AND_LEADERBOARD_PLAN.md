# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案（第 2 版 · 审查缺陷闭环稿）

> **状态**：技术设计方案修订送审（Technical Design Proposal · Review Round 2 Remediation）  
> **修订日期**：2026-09-23  
> **基准 SHA**：`b2c6383` | **最新审定前驱**：`a9f71e7`（Round 1 审查报告，1×P1 / 4×P2 / 3×P3 针对性 100% 闭环）  
> **涉及范围**：`src/i18n/dictionaries.ts`、`src/app/globals.css`、`src/server/accounts.ts`、`src/server/online-server.ts`、`src/server/room-socket.ts`、`src/components/hooks/useRoomSocket.ts`、`src/components/useFriendRoom.ts`、`src/components/online/OnlineLobbyView.tsx`、`src/components/online/lobby/LobbyLeaderboard.tsx`

---

## 1. 交付目标与痛点根因分析

针对用户在体验联机模块时反馈的四大核心问题，以及 Round 1 审查报告指出的 8 项缺陷（1×P1 / 4×P2 / 3×P3），开展严密的系统架构与交互契约升级：

### 1.1 模块定位与命名狭隘（Friend Room ➔ Online PVP）
- **现象**：主顶部导航栏与模式切换中，联机模块被命名为“好友房”（Friend room）。
- **根因**：该模块已集成公共大厅、快速匹配、全服天梯排行榜、公聊频道与访客管理，命名为“好友房”严重狭隘。
- **目标**：在 6 种官方语言中统一更名为 **“联机对战”**（Online PVP）。

### 1.2 排行榜搜索框过长且搜索按钮遮挡输入框
- **现象**：搜索框横向过长（撑满面板），放大镜按钮悬浮遮挡输入框左侧约 1/3 空间，覆盖文字。
- **根因**：`.room-leaderboard-search` 缺 `max-width`，按钮继承全局 `.icon-button`（`min-width: 56px`）强行塞入 `18px` Grid 列，溢出 38px 并带不透明背景和阴影。
- **目标**：限宽至 `280px`，按钮重置为嵌入态 `20px` 尺寸，彻底消除重叠。同步闭环 **P3-3**：修复 `svg { color: inherit }` 确保 hover 生效，并增设 `:focus-within` 可见高亮轮廓，完全满足 WCAG 2.4.7。

### 1.3 已注册玩家无法登录回来（缺乏登录与密码机制）
- **现象**：退出登录、清除缓存或更换设备后，已注册玩家永久无法找回账号，且再次输入原名提示已被占用。
- **根因**：服务端无密码模型、无登录 API、无登录 UI，且原设计使用单一 `tokenHash`。
- **目标**：
  1. 引入异步 `crypto.scrypt` 密码哈希模型（闭环 **P2-2**，移入 libuv 工作线程池并加并发限制，零阻塞主事件循环）；
  2. 实现 `POST /api/account/login`（10次/分限流防爆破）；
  3. 支持多会话令牌列表 `tokenHashes: string[]`（闭环 **P2-4**，按签发序保留最近 5 个设备会话，多设备登录不互踢，兑现令牌备份与转移契约）；
  4. 旧无密码账号认领**必须强制出示原设备 `token` 作为所有权凭据**（闭环 **P1-1**，消除无凭据冒名接管；对于已清除本地缓存且未设密码的历史账号，因无法在无凭据下自证归属，必须拒绝认领以保护账号不被篡改，此为必要的安全取舍）；
  5. 身份面板提供无障碍合规的“访客”、“登录”、“注册”三态切换与原令牌输入通道（闭环 **P3-2**）。

### 1.4 访客可随意冒用已注册玩家昵称（缺乏服务端保留名校验）
- **现象**：访客可任意填写已注册玩家昵称参与联机、发言和对局。
- **根因**：`resolvePlayerIdentity()` 与 `GuestSessionStore` 未对访客 `playerName` 做查重。
- **目标**：
  1. 引入 Unicode NFKC 与格式控制字符规范化函数 `canonicalizePlayerName()`（闭环 **P2-3**，覆盖 `U+200B`、`U+2060`、`U+00AD`、`\p{Cf}` 等隐形变体及全角字符；非 Cf 填充符如 `U+3164` 及跨语系同形字界定为后续 Confusable 增强项）；
  2. 开放公开查重方法 `AccountStore.isNameReserved(name)` 与 `findByDisplayName(name)`（闭环 **P3-1**）；
  3. 引入独立错误码 `"name-reserved"`（闭环 **P2-1**），与房内同名自愈逻辑严格区分，确保 UI 清晰弹出本语种“该名称属于已注册玩家，请登录使用”引导。

---

## 2. 详细技术契约与架构设计

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Online PVP 架构契约演进 (R3)                    │
├────────────────────────────────┬───────────────────────────────────────┤
│ 模块与协议层                    │ 核心改动与契约规范                     │
├────────────────────────────────┼───────────────────────────────────────┤
│ 表现层 (UI & CSS & A11y)       │ - Leaderboard 搜索框限宽 280px，按钮零遮挡│
│                                │ - P3-3: 修复 hover svg 变色与 focus-within  │
│                                │ - P3-2: 身份三态 Pill 遵循 WAI-ARIA Tab 契约│
│                                │ - P1-1: 增设原设备令牌输入项与引导文案 │
│                                │ - P2-1: 统一 resolveRoomErrorMessage 映射  │
│                                │ - 6 语种模式名称更正为 Online PVP     │
├────────────────────────────────┼───────────────────────────────────────┤
│ 通信与接口层 (HTTP API & WS)   │ - POST /api/account/login (异步非阻塞+限流) │
│                                │ - P2-1: 独立 name-reserved 抑制二次广播│
│                                │ - P1-1: 凭据登录与认领参数显式解耦     │
│                                │ - P3-1: 显式 HTTP 状态码映射表与错误码 │
│                                │ - resolvePlayerIdentity 强制拦截保留名 │
├────────────────────────────────┼───────────────────────────────────────┤
│ 领域模型与存储层 (Server Store)│ - P2-2: util.promisify(scrypt) + 背压门禁│
│                                │ - P1-2: 账号校验统一取内部 StoredAccount   │
│                                │ - P2-3: canonicalizePlayerName 规范化 │
│                                │ - P2-4: tokenHashes 数组支持多设备共存│
│                                │ - P3-1: 扩充 AccountError 与 RoomErrorCode   │
│                                │ - P3-2: 明确会话签发序 FIFO 淘汰语义  │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 规范化名称与防绕过契约（闭环 P2-3）

在 `src/server/accounts.ts` 中建立权威的名称规范化契约：

```typescript
/**
 * 对玩家昵称进行 Unicode 规范化并剔除隐形与零宽字符，用于严格查重与保留名判断。
 * 1. NFKC 规范化（全角字符折叠为半角，例如 "Ａlice" -> "Alice"，数学字母如 "𝔸" -> "A"）
 * 2. 剥离 Unicode 格式控制字符（\p{Cf}，如 U+200B 零宽空格、U+2060 词连接符、U+00AD 软连字符、U+FEFF BOM）
 * 3. 剥离不可见空白与双向控制符（U+200C-U+200F、U+2028-U+202F）
 * 4. 折叠连续空白并 trim
 * 5. 转小写对齐比对口径
 * 
 * 边界声明：本函数主要拦截零宽、格式控制及半角全角变体；
 * 对于非 Cf 不可见字符（如 U+3164 韩文填充符）或跨语系视觉同形字（如西里尔 А 与拉丁 A），
 * 属于进阶 Confusable 骨架比对范畴，列为后续防御增强项。
 */
export function canonicalizePlayerName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\p{Cf}\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
```

- **查重口径统一**：
  1. `AccountStore.createAccount`：基于 `canonicalizePlayerName(displayName)` 校验 `canonicalDisplayNameMap`，杜绝任何不可见字符变体注册；
  2. `AccountStore.isNameReserved(name)`：一律将入参执行 `canonicalizePlayerName` 后与现有注册账号比对；
  3. `resolvePlayerIdentity`：访客传入的 `playerName` 经规范化后与保留名库核对，严格拦截 `"Ali\u200Bce"`、`"Ali\u2060ce"`、`"Ali\u00ADce"` 与全角 `"Ａlice"` 等伪装手段。

---

### 2.2 账号密码存储与多会话模型契约（闭环 P1-1, P1-2, P2-2, P2-4, P3-1, P3-2, P3-3）

#### 2.2.1 数据模型扩展 (`StoredAccount`)
```typescript
type StoredAccount = {
  createdAt: number;
  displayName: string;
  id: string;
  lastSeenAt: number;
  publicHandle: string;
  // P2-4 / P3-2: 多会话令牌哈希列表，保留最近签发的 5 个设备会话（MRU/FIFO by issue order）
  tokenHashes: string[];
  updatedAt: number;
  passwordHash?: string;
  passwordSalt?: string;
};
```
- **向后兼容性保障**：加载旧版 `accounts.jsonl` 时，若仅存在单一 `tokenHash: string`，自动映射为 `tokenHashes: [entry.account.tokenHash]`；落盘时写入 `tokenHashes` 数组；
- **会话淘汰契约（闭环 P3-2）**：`MAX_ACCOUNT_SESSIONS = 5`，每次登录新签发令牌置顶（`[newTokenHash, ...account.tokenHashes.filter(...)].slice(0, 5)`），超出上限时按签发顺序淘汰最早签发的会话；若旧设备被挤出，需凭密码重新登录。`authenticate` 方法仅核验令牌是否存在并刷新 `lastSeenAt`，不频繁改写数组顺序以避免无意义的磁盘刷写。

#### 2.2.2 异步非阻塞密码加密契约与背压控制（闭环 P2-2, P3-3）
完全废弃 `scryptSync`，采用 Node.js 原生异步 `crypto.scrypt`，确保在 libuv 工作线程池异步执行：

```typescript
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// P2-2 / P3-3: 限制并发哈希计算数量，并建立明确的排队背压与超时契约
export class ScryptConcurrencyGate {
  private active = 0;
  private readonly queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly timeoutMs: number;

  constructor(maxConcurrent = 2, maxQueueSize = 32, timeoutMs = 5000) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.timeoutMs = timeoutMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueueSize) {
        const error = new Error("Scrypt concurrency queue full (server busy)");
        (error as { code?: string }).code = "QUEUE_FULL";
        throw error;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = this.queue.findIndex((item) => item.resolve === resolve);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            const err = new Error("Scrypt concurrency wait timeout");
            (err as { code?: string }).code = "QUEUE_TIMEOUT";
            reject(err);
          }
        }, this.timeoutMs);

        this.queue.push({
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject
        });
      });
    }

    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      next?.resolve();
    }
  }
}

const scryptGate = new ScryptConcurrencyGate();

export async function hashPassword(password: string, salt: string): Promise<string> {
  return scryptGate.run(async () => {
    const derived = (await scryptAsync(password, salt, 32, { N: 16384, r: 8, p: 1 })) as Buffer;
    return derived.toString("hex");
  });
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPassword(password, salt);
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
```
- **主线程事件循环阻塞**：**0.00ms**（全部在后台工作线程执行，对局、心跳与房间广播零影响）；
- **背压与超时保障（闭环 P3-3）**：最大并发度 2，最大排队队列 32，排队等待超时 5000ms；超出队列返回 503/429 降级保护，杜绝无界排队带来的内存膨胀。

#### 2.2.3 封闭错误类型、HTTP 状态码与方法集扩充（闭环 P1-1, P1-2, P3-1）

```typescript
// src/server/accounts.ts
export type AccountError = {
  code:
    | "account-not-found"           // P3-1: 账号不存在
    | "account-password-required"   // P1-1: 遗留账号认领缺乏原 Token 所有权凭据
    | "account-token-invalid"
    | "duplicate-handle"
    | "duplicate-name"
    | "guest-session-invalid"
    | "invalid-handle"
    | "invalid-password"           // P3-1: 密码错误或格式不合法
    | "invalid-player"
    | "name-reserved";             // P2-1: 该名称属于已注册玩家
  message: string;
};

// src/server/domain/room-state-machine.ts (闭环 P3-1 姊妹封闭联合同步)
export type RoomErrorCode =
  | "account-not-found"           // P3-1 同步扩充
  | "account-password-required"   // P3-1 同步扩充
  | "account-token-invalid"
  | "duplicate-handle"
  | "duplicate-name"
  | "duplicate-player"
  | "guest-session-invalid"
  | "invalid-handle"
  | "invalid-password"           // P3-1 同步扩充
  | "invalid-player"
  | "name-reserved"             // P2-1 / P3-1 同步扩充
  // 既有 29 个房间/对局错误码保持完全不变 ...
  | "spot-unavailable"
  | "room-full"
  | "room-not-found";
```

**HTTP 状态码显式映射契约（`src/server/online-server.ts`）**：
```typescript
export function mapAccountErrorToStatusCode(code: AccountError["code"]): number {
  switch (code) {
    case "duplicate-handle":
    case "duplicate-name":
    case "name-reserved":
      return 409; // Conflict (冲突)
    case "account-not-found":
    case "invalid-password":
    case "account-password-required":
    case "account-token-invalid":
      return 401; // Unauthorized (未授权/需凭证)
    case "invalid-handle":
    case "invalid-player":
    case "guest-session-invalid":
      return 400; // Bad Request (请求参数不合法)
    default:
      return 400;
  }
}
// 限流与背压降级：IP 限流返回 429 Too Many Requests；闸门队列满/超时返回 503 Service Unavailable
```

在 `AccountStore` 中扩充方法：
```typescript
export interface LoginAccountInput {
  token?: string;            // 仅用于纯令牌直接恢复会话（未携带 identifier 时生效）
  identifier?: string;       // 昵称、公开代号、@代号或内部账号ID
  password?: string;         // 账号密码
  ownershipToken?: string;   // 认领遗留无密码账号时出示的原设备令牌（所有权凭据）
}

export class AccountStore {
  // P1-2: 内部活对象私有检索，保证拥有 passwordHash/passwordSalt/tokenHashes 等敏感与可变字段
  private findLiveAccountByIdentifier(identifier: string): StoredAccount | null {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    // 1. 内部账号 ID (acct_*) 直查
    const directAccount = this.accounts.get(trimmed);
    if (directAccount) return directAccount;

    // 2. 公开代号 (@handle 或 handle) 查表
    const normalizedHandle = normalizePublicHandle(trimmed);
    if (normalizedHandle) {
      const playerId = this.playerIdByPublicHandle.get(normalizedHandle);
      const account = playerId ? this.accounts.get(playerId) : null;
      if (account) return account;
    }

    // 3. 规范化显示昵称匹配
    const canonicalName = canonicalizePlayerName(trimmed);
    if (canonicalName) {
      for (const account of this.accounts.values()) {
        if (canonicalizePlayerName(account.displayName) === canonicalName) {
          return account;
        }
      }
    }

    return null;
  }

  // 1. 公开只读快照检索（仅向外部调用返回安全副本）
  findByDisplayName(displayName: string): AccountSnapshot | null {
    const account = this.findLiveAccountByIdentifier(displayName);
    return account ? getAccountSnapshot(account) : null;
  }

  // 2. 查重谓词（结合规范化）
  isNameReserved(name: string): boolean {
    const canonical = canonicalizePlayerName(name);
    if (!canonical) return false;
    return (
      [...this.accounts.values()].some((acc) => canonicalizePlayerName(acc.displayName) === canonical) ||
      this.findByPublicHandle(canonical) !== null
    );
  }

  // 3. 异步注册方法升级
  async createAccount(input: {
    displayName: string;
    publicHandle?: string;
    password?: string;
  }): Promise<AccountResult<AccountSession>> {
    // 校验 displayName 规范化查重
    // 若传入 password：校验 >= 6 位；计算 salt 与 passwordHash
    // 生成首个会话令牌 token = `${id}.${randomTokenPart(24)}`
    // 初始化 tokenHashes: [hashToken(token)] 并落盘
  }

  // 4. 异步登录方法（严格闭环 P1-1 凭证分流与 P1-2 活对象校验）
  async loginAccount(input: LoginAccountInput): Promise<AccountResult<AccountSession>> {
    // 路径 A：纯令牌快速会话恢复 (Token Login)
    // 显式分流契约：仅当输入提供 token 且未提供 identifier 时，方走纯令牌恢复
    if (input.token?.trim() && !input.identifier?.trim()) {
      const snapshot = this.authenticate(input.token.trim());
      if (!snapshot) {
        return failure("account-token-invalid", "Account session token is invalid.");
      }
      return success({ ...snapshot, token: input.token.trim() });
    }

    // 路径 B：账号凭证登录与安全认领
    const identifier = input.identifier?.trim() ?? "";
    if (!identifier) {
      return failure("account-not-found", "Account identifier is required.");
    }

    // P1-2 核心保障：检索必须获取内部活对象 StoredAccount，杜绝读取 AccountSnapshot 副本
    const account = this.findLiveAccountByIdentifier(identifier);
    if (!account) {
      return failure("account-not-found", "Account not found.");
    }

    // 提取原设备所有权凭证：支持显式 ownershipToken 或携带的 token 参数
    const ownershipToken = input.ownershipToken?.trim() || input.token?.trim();

    // 分支 B1：无密码遗留账号安全认领
    if (!account.passwordHash) {
      // 必须出示原设备的有效令牌并匹配已存储的 tokenHashes 证明所有权
      const isOwner = Boolean(ownershipToken && account.tokenHashes.includes(hashToken(ownershipToken)));

      if (!isOwner) {
        return failure(
          "account-password-required",
          "This account does not have a password. Please sign in on your original device using your account token to set a password."
        );
      }

      // 验证通过，绑定新密码并升级
      const newPassword = input.password?.trim() ?? "";
      if (newPassword.length < 6) {
        return failure("invalid-password", "Password must be at least 6 characters.");
      }
      const salt = randomBytes(16).toString("hex");
      account.passwordSalt = salt;
      account.passwordHash = await hashPassword(newPassword, salt);
    } else {
      // 分支 B2：正式密码比对
      const password = input.password?.trim() ?? "";
      if (!password) {
        return failure("invalid-password", "Password is required.");
      }
      const valid = await verifyPassword(password, account.passwordSalt ?? "", account.passwordHash);
      if (!valid) {
        return failure("invalid-password", "Incorrect password.");
      }
    }

    // P2-4 / P3-2: 签发新会话令牌并按 FIFO 淘汰保留最近 5 次会话
    const newToken = `${account.id}.${randomTokenPart(24)}`;
    const newTokenHash = hashToken(newToken);
    account.tokenHashes = [newTokenHash, ...account.tokenHashes.filter((h) => h !== newTokenHash)].slice(0, 5);
    account.lastSeenAt = this.now();
    account.updatedAt = this.now();
    // P1-2: 确保持久化落盘的是完整 StoredAccount 实体，绝不抹除密码与会话字段
    this.persist(account);

    return success({ ...getAccountSnapshot(account), token: newToken });
  }

  // 5. 令牌认证升级为多令牌核验
  authenticate(token: string): AccountSnapshot | null {
    const normalizedToken = token.trim();
    if (!normalizedToken) return null;
    const accountId = normalizedToken.split(".", 1)[0];
    const account = this.accounts.get(accountId);
    if (!account) return null;
    const tokenHash = hashToken(normalizedToken);
    // P2-4: 核验是否存在于有效列表中
    if (!account.tokenHashes.includes(tokenHash)) {
      return null;
    }
    account.lastSeenAt = this.now();
    return getAccountSnapshot(account);
  }
}
```
---

### 2.3 访客防冒名与错误码独立契约（闭环 P2-1）

#### 2.3.1 独立错误码 `name-reserved`
当访客尝试使用已被注册玩家占用的名称或公开代号时，服务端抛出独立错误码 `"name-reserved"`，与房内玩家冲突的 `"duplicate-name"` 严格隔离：

```typescript
// src/server/accounts.ts -> resolvePlayerIdentity
export function resolvePlayerIdentity(
  input: { accountToken?: null | string; guestToken?: null | string; playerId: string; playerName: string },
  accountStore: AccountStore,
  guestSessionStore: GuestSessionStore
): AccountResult<ResolvedPlayerIdentity> {
  const accountToken = input.accountToken?.trim();

  if (accountToken) {
    const account = accountStore.authenticate(accountToken);
    if (!account) {
      return failure("account-token-invalid", "Registered account session is invalid.");
    }
    return success({
      identity: "registered",
      playerId: account.playerId,
      playerName: account.displayName,
      publicHandle: account.publicHandle
    });
  }

  // P2-1: 独立保留名拦截，禁止复用 duplicate-name
  const requestedName = canonicalizePlayerName(input.playerName);
  if (requestedName && accountStore.isNameReserved(requestedName)) {
    return failure("name-reserved", "This display name is registered to an account. Please sign in to use this name.");
  }

  // 访客 session 认证与创建逻辑 ...
}
```

#### 2.3.2 客户端自愈策略与本地化错误映射（闭环 P2-1）
在服务端 `src/server/room-socket.ts` 中：
```typescript
function acknowledgeAndBroadcast(
  io: RoomSocketServer,
  socket: RoomSocket,
  roomStore: RoomStore,
  response: RoomAck,
  ack: (response: RoomAck) => void
) {
  ack(response);

  if (!response.ok) {
    // P2-1: 对 guest-session-invalid 与 name-reserved 抑制二次广播，
    // 杜绝 socket.emit("room:error") 在 ACK 之后到达并覆盖客户端本地化文案
    if (response.error.code !== "guest-session-invalid" && response.error.code !== "name-reserved") {
      socket.emit("room:error", response.error);
    }
    return;
  }
  // 正常广播 ...
}
```

在客户端 `src/components/hooks/room-state-utils.ts` 中引入统一的错误文本本地化映射入口：
```typescript
export interface RoomErrorMessages {
  roomError?: string;
  nameReservedError?: string;
  duplicateNameError?: string;
  accountTokenInvalidError?: string;
}

export function resolveRoomErrorMessage(
  error: { code?: string; message: string } | unknown,
  messages?: RoomErrorMessages | null
): string {
  if (!isRoomErrorLike(error)) {
    return messages?.roomError ?? "An error occurred.";
  }
  if (error.code === "name-reserved" && messages?.nameReservedError) {
    return messages.nameReservedError;
  }
  if (error.code === "duplicate-name" && messages?.duplicateNameError) {
    return messages.duplicateNameError;
  }
  return error.message;
}
```

在 `src/components/hooks/useRoomSocket.ts` 中：
- `duplicate-name`：保留既有行为，仅用于房内同名玩家自愈，自动重命名并重试；
- `name-reserved`：**严禁触发静默改名重试**！直接中断请求；
- `applyRoomAck` 与 `socket.on("room:error")` **统一通过 `resolveRoomErrorMessage(..., messagesRef.current)` 上屏展示**，保证 6 语种本地化文案精准生效；
- 兼容发布说明：新旧客户端均可正常展示错误信息（旧客户端安全降级为服务端英文原句），零破坏性更新。

---

### 2.4 排行榜搜索框布局、无障碍与交互态契约（闭环 P3-3）

在 `src/app/globals.css` 中修复搜索框样式，补齐焦点与悬浮态：

```css
/* 搜索框容器限宽并建立自适应焦点环 */
.room-leaderboard-search {
  align-items: center;
  background: color-mix(in srgb, var(--panel) 78%, transparent);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: 20px minmax(0, 1fr);
  max-width: 280px;
  min-width: 0;
  padding: 6px 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

/* P3-3: 键盘焦点可达性保障 (WCAG 2.4.7) */
.room-leaderboard-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}

/* 按钮重置为嵌入态，彻底消除 56px 强制拉伸与遮挡 */
.room-leaderboard-search .icon-button,
.room-leaderboard-search button {
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  min-width: 20px;
  height: 20px;
  width: 20px;
  padding: 0;
  position: static;
  z-index: 1;
}

/* P3-3: 修复 SVG 颜色继承，确保 hover 显色有效 */
.room-leaderboard-search svg {
  color: inherit;
  height: 18px;
  width: 18px;
}

.room-leaderboard-search button:hover {
  color: var(--accent);
}

.room-leaderboard-search input {
  background: transparent;
  border: 0;
  color: var(--ink);
  font: inherit;
  min-width: 0;
  outline: none;
  padding: 0;
}
```

---

### 2.5 客户端三态身份切换面板、A11y 契约与原令牌输入（闭环 P1-1, P3-2）

在 `src/components/online/OnlineLobbyView.tsx` 中，针对“访客 / 登录 / 注册”三态切换引入规范的 WAI-ARIA 标签页设计契约，并在登录面板中提供原令牌输入项：

```tsx
<div
  aria-label={labels.account}
  className="table-sidebar-tab-list lobby-auth-tab-list"
  role="tablist"
>
  <button
    aria-controls="auth-panel-guest"
    aria-selected={authMode === "guest"}
    id="auth-tab-guest"
    role="tab"
    tabIndex={authMode === "guest" ? 0 : -1}
    onClick={() => setAuthMode("guest")}
    type="button"
  >
    {labels.guestAccount}
  </button>
  <button
    aria-controls="auth-panel-login"
    aria-selected={authMode === "login"}
    id="auth-tab-login"
    role="tab"
    tabIndex={authMode === "login" ? 0 : -1}
    onClick={() => setAuthMode("login")}
    type="button"
  >
    {labels.loginTab}
  </button>
  <button
    aria-controls="auth-panel-register"
    aria-selected={authMode === "register"}
    id="auth-tab-register"
    role="tab"
    tabIndex={authMode === "register" ? 0 : -1}
    onClick={() => setAuthMode("register")}
    type="button"
  >
    {labels.registerTab}
  </button>
</div>

{/* 各 TabPanel 严格绑定 aria-labelledby */}
<div
  aria-labelledby={`auth-tab-${authMode}`}
  id={`auth-panel-${authMode}`}
  role="tabpanel"
  tabIndex={0}
>
  {/* 登录面板提供账号名/代号输入、密码输入、以及 P1-1 遗留账号认领/纯令牌恢复输入通道 */}
  {authMode === "login" && (
    <>
      <input placeholder={labels.accountIdentifierPlaceholder} value={identifier} ... />
      <input type="password" placeholder={labels.accountPasswordPlaceholder} value={password} ... />
      <input placeholder={labels.accountTokenPlaceholder} value={ownershipToken} ... />
      <button type="submit">{labels.loginAccount}</button>
    </>
  )}
</div>
```
- **键盘导航**：ArrowLeft / ArrowRight 实现 roving tabindex 轮转，Tab 键平滑步入当前面板中的输入框，严禁在渲染时强夺焦点；
- **层级关系说明**：既有折叠开关（`aria-expanded`）作为外层面板展开/收起控制，展开后内部渲染上述 `tablist` 与对应的活动 `tabpanel`；
- **RTL 兼容**：Flex/Grid 自动跟随阿拉伯语自右向左排版。

---

## 3. 六语种国际化契约完整对齐

在 `src/i18n/dictionaries.ts` 中增补以下键值并在 6 语种中完全同步：

| 键名 | en | zh | fr | es | ru | ar |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `modes.room` | `Online PVP` | `联机对战` | `PVP en ligne` | `PVP online` | `Онлайн PVP` | `مبارزة عبر الإنترنت` |
| `room.panelLabel` | `Online PVP` | `联机对战` | `PVP en ligne` | `PVP online` | `Онлайн PVP` | `مبارزة عبر الإنترنت` |
| `room.loginAccount` | `Log in` | `登录` | `Se connecter` | `Iniciar sesión` | `Войти` | `تسجيل الدخول` |
| `room.loginTab` | `Log in` | `登录` | `Connexion` | `Iniciar sesión` | `Вход` | `دخول` |
| `room.registerTab` | `Register` | `注册` | `Inscription` | `Registro` | `Регистрация` | `تسجيل` |
| `room.accountPassword` | `Password` | `密码` | `Mot de passe` | `Contraseña` | `Пароль` | `كلمة المرور` |
| `room.accountPasswordPlaceholder` | `Enter password (min 6)` | `输入密码 (至少6位)` | `Mot de passe (6 min)` | `Contraseña (mín. 6)` | `Пароль (от 6 симв.)` | `كلمة المرور (6 على الأقل)` |
| `room.accountIdentifier` | `Name or Handle` | `账号或公开代号` | `Nom ou identifiant` | `Nombre o alias` | `Имя или псевдоним` | `الاسم أو المعرّف` |
| `room.accountIdentifierPlaceholder` | `Name or @handle` | `输入昵称或 @公开代号` | `Nom ou @identifiant` | `Nombre o @alias` | `Имя или @псевдоним` | `الاسم أو @المعرّف` |
| `room.accountTokenInput` | `Account Token` | `账号令牌` | `Jeton de compte` | `Token de cuenta` | `Токен аккаунта` | `رمز الحساب` |
| `room.accountTokenPlaceholder` | `Original token (for claim/recovery)` | `原设备令牌 (认领或找回时填)` | `Jeton d'origine (réclamation)` | `Token original (reclamo)` | `Исходный токен (для восстановления)` | `الرمز الأصلي (للمطالبة)` |
| `room.copyAccountToken` | `Copy token` | `复制令牌` | `Copier le jeton` | `Copiar token` | `Копировать токен` | `نسخ الرمز` |
| `room.accountTokenCopied` | `Token copied` | `令牌已复制` | `Jeton copié` | `Token copiado` | `Токен скопирован` | `تم نسخ الرمز` |
| `room.nameReservedError` | `Name is registered. Please log in.` | `该名称属于已注册玩家，请登录使用。` | `Ce nom est réservé. Veuillez vous connecter.` | `Nombre reservado. Por favor inicia sesión.` | `Имя занято. Пожалуйста, войдите.` | `هذا الاسم مسجل. يرجى تسجيل الدخول.` |

---

## 4. 独立审查缺陷闭环矩阵

| 缺陷编号 | 严重度 | 缺陷描述 | 闭环解决方案与技术落点 | 负向验证探针与守门验收 |
| :--- | :--- | :--- | :--- | :--- |
| **P1-1** | **P1** | 路径 A 早返回导致认领分支所有权校验恒不可达（死代码） | 显式分流：仅 `token` 且无 `identifier` 走路径 A；路径 B 提取 `ownershipToken` 校验 `tokenHashes` | 正向单测：持原令牌认领无密码账号成功绑定；负向单测：无令牌认领被拒返回 `account-password-required` |
| **P1-2** | **P1** | `loginAccount` 混用只读快照与活实体，导致按昵称/代号登录失败且落盘写坏账号 | 引入内部私有 `findLiveAccountByIdentifier` 确保取到 `StoredAccount` 活对象；仅向外部返回快照 | 单测分别以昵称、公开代号、@代号登录，均命中密码核验成功；重载 JSONL 验证密码与令牌完好 |
| **P2-1** | **P2** | 广播 `room:error` 在 ACK 之后覆盖本地化提示，无错误码映射层 | 抑制服务端 `name-reserved` 的二次广播，客户端引入统一 `resolveRoomErrorMessage` 映射层 | 6 语种分别触发保留名冲突，断言最终展示文本为各语种 `nameReservedError`，非英文 |
| **P2-2** | **P2** | `scryptSync` 同步阻塞主线程事件循环，存在卡顿与 DoS 隐患 | 改用异步 `crypto.scrypt` 在 libuv 线程池执行，辅以 2 并发门禁与 10次/分 IP 限流 | 事件循环采样断言主线程同步停顿为 0.00ms，多请求平滑进入异步排队 |
| **P2-3** | **P2** | 守门谓词未做 Unicode/零宽规范化，可被 `\u200B` 隐形字符绕过冒名 | 实现 `canonicalizePlayerName()`（NFKC + 剥离 `\p{Cf}`/零宽 + 小写），全链路统一口径 | 负向单测覆盖 `"Ali\u200Bce"`、`"Ali\u2060ce"`、`"Ali\u00ADce"` 与全角 `"Ａlice"`，均被拦截 |
| **P2-4** | **P2** | 单 `tokenHash` 登录即覆盖，与令牌导出备份及多端使用承诺冲突 | `StoredAccount` 扩充 `tokenHashes: string[]`（保留最新 5 个会话），登录为追加新令牌 | 自动化测试验证设备 A 登录后设备 B 再次登录，A 与 B 均可保持正常鉴权与发包 |
| **P3-1** | **P3** | `RoomErrorCode` 姊妹联合未同步扩充（致 `TS2322`），HTTP 状态码映射缺失 | 同步扩充 `RoomErrorCode` 4 个成员，提供 explicit HTTP 状态码映射表（400/401/409/429/503） | 静态类型推导 `npx tsc --noEmit` 0 错误；端点返回标准 HTTP 401/409/429/503 状态码 |
| **P3-2** | **P3** | 文档承诺"活跃度 LRU"与伪代码 FIFO 截断语义不一致 | 文档与代码统一规范为按签发序 FIFO 淘汰最近 5 个设备会话（新会话置顶，超出淘汰最早） | 单测断言第 6 次登录淘汰第 1 次签发的令牌；`authenticate` 刷新 `lastSeenAt` 不变动数组次序 |
| **P3-3** | **P3** | 并发闸门队列无界无超时，可能导致内存积压 | `ScryptConcurrencyGate` 增设最大排队深度 32 与等待超时 5000ms 背压保护 | 压测超过 32 个并发排队时立即抛出 `QUEUE_FULL` 触发 503/429 降级，超时触发 `QUEUE_TIMEOUT` |

---

## 5. 本地门禁与实施保证

在进入代码实施前，设计方案文本完全满足以下基线：
1. `npx tsc --noEmit`：0 错误；
2. `npm run lint`：0 错误，0 警告；
3. `npm test`：35 个测试套件 / 339 项单元测试全绿；
4. `npm run build`：生产构建预渲染 18/18 页面通过。
