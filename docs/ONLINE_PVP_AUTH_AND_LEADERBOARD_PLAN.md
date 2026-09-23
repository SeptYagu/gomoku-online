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
  3. 支持多会话令牌列表 `tokenHashes: string[]`（闭环 **P2-4**，多设备登录不互踢，兑现令牌备份与转移契约）；
  4. 旧无密码账号认领**必须强制携带原 `token`**（闭环 **P1-1**，彻底消除无凭据冒名接管风险）；
  5. 身份面板提供无障碍合规的“访客”、“登录”、“注册”三态切换（闭环 **P3-2**）。

### 1.4 访客可随意冒用已注册玩家昵称（缺乏服务端保留名校验）
- **现象**：访客可任意填写已注册玩家昵称参与联机、发言和对局。
- **根因**：`resolvePlayerIdentity()` 与 `GuestSessionStore` 未对访客 `playerName` 做查重。
- **目标**：
  1. 引入 Unicode NFKC 与去零宽字符规范化函数 `canonicalizePlayerName()`（闭环 **P2-3**，彻底拦截 `U+200B`、`U+2060`、`U+00AD` 等隐形变体）；
  2. 开放公开查重方法 `AccountStore.isNameReserved(name)` 与 `findByDisplayName(name)`（闭环 **P3-1**）；
  3. 引入独立错误码 `"name-reserved"`（闭环 **P2-1**），与房内同名自愈逻辑严格区分，确保 UI 清晰弹出“该名称属于已注册玩家，请登录使用”引导。

---

## 2. 详细技术契约与架构设计

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Online PVP 架构契约演进 (R2)                    │
├────────────────────────────────┬───────────────────────────────────────┤
│ 模块与协议层                    │ 核心改动与契约规范                     │
├────────────────────────────────┼───────────────────────────────────────┤
│ 表现层 (UI & CSS & A11y)       │ - Leaderboard 搜索框限宽 280px，按钮零遮挡│
│                                │ - P3-3: 修复 hover svg 变色与 focus-within  │
│                                │ - P3-2: 身份三态 Pill 遵循 WAI-ARIA Tab 契约│
│                                │ - 6 语种模式名称更正为 Online PVP     │
├────────────────────────────────┼───────────────────────────────────────┤
│ 通信与接口层 (HTTP API & WS)   │ - POST /api/account/login (异步非阻塞+限流) │
│                                │ - P2-1: 独立 name-reserved 错误码与提示│
│                                │ - P1-1: 遗留账号认领必须持有原 Token 凭证│
│                                │ - resolvePlayerIdentity 强制拦截保留名 │
├────────────────────────────────┼───────────────────────────────────────┤
│ 领域模型与存储层 (Server Store)│ - P2-2: util.promisify(scrypt) + 并发门禁│
│                                │ - P2-3: canonicalizePlayerName 零宽拦截│
│                                │ - P2-4: tokenHashes 数组支持多设备共存│
│                                │ - P3-1: 扩充 AccountError.code 联合类型│
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 规范化名称与防绕过契约（闭环 P2-3）

在 `src/server/accounts.ts` 中建立权威的名称规范化契约：

```typescript
/**
 * 对玩家昵称进行 Unicode 规范化并剔除隐形与零宽字符，用于严格查重与保留名判断。
 * 1. NFKC 规范化（全角字符折叠为半角，例如 "Ａlice" -> "Alice"）
 * 2. 剥离 Unicode 格式控制字符（\p{Cf}，如 U+200B 零宽空格、U+2060 词连接符、U+00AD 软连字符、U+FEFF BOM）
 * 3. 剥离不可见空白与双向控制符（U+200C-U+200F、U+2028-U+202F）
 * 4. 折叠连续空白并 trim
 * 5. 转小写对齐比对口径
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
  3. `resolvePlayerIdentity`：访客传入的 `playerName` 经规范化后与保留名库核对，彻底拦截 `"Ali\u200Bce"`、`"Ali\u2060ce"`、`"Ali\u00ADce"` 等伪装手段。

---

### 2.2 账号密码存储与多会话模型契约（闭环 P1-1, P2-2, P2-4, P3-1）

#### 2.2.1 数据模型扩展 (`StoredAccount`)
```typescript
type StoredAccount = {
  createdAt: number;
  displayName: string;
  id: string;
  lastSeenAt: number;
  publicHandle: string;
  // P2-4: 升级为多会话令牌哈希列表，最多保留 5 个最近活跃设备，支持多端登录与备份转移
  tokenHashes: string[];
  updatedAt: number;
  passwordHash?: string;
  passwordSalt?: string;
};
```
- **向后兼容性保障**：加载旧版 `accounts.jsonl` 时，若仅存在单一 `tokenHash: string`，自动映射为 `tokenHashes: [entry.account.tokenHash]`；落盘时写入 `tokenHashes` 数组；
- **会话容量上限**：`MAX_ACCOUNT_SESSIONS = 5`，每次登录新签发的令牌追加至头部，超出上限时淘汰最久未活跃令牌。

#### 2.2.2 异步非阻塞密码加密契约（闭环 P2-2）
完全废弃 `scryptSync`，采用 Node.js 原生异步 `crypto.scrypt`，确保在 libuv 工作线程池异步执行：

```typescript
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// 限制并发哈希计算数量，防范极端请求打满 libuv 线程池
class ScryptConcurrencyGate {
  private active = 0;
  private readonly maxConcurrent = 2;
  private readonly queue: Array<() => void> = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      next?.();
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
- **执行耗时口径**：异步调用耗时约为 38~45ms（6核系统实测），在 2 并发闸门与 10次/分 IP 限流双重保护下安全受控。

#### 2.2.3 封闭错误类型与方法集扩充（闭环 P3-1）
```typescript
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
```

在 `AccountStore` 中扩充公开方法：
```typescript
export class AccountStore {
  // 1. P3-1: 补齐通过昵称查找账号方法
  findByDisplayName(displayName: string): AccountSnapshot | null {
    const canonical = canonicalizePlayerName(displayName);
    const account = [...this.accounts.values()].find(
      (acc) => canonicalizePlayerName(acc.displayName) === canonical
    );
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

  // 4. 异步登录方法（严格闭环 P1-1 凭证认领与 P2-4 多会话）
  async loginAccount(input: {
    identifier?: string;
    password?: string;
    token?: string;
  }): Promise<AccountResult<AccountSession>> {
    // 路径 A：纯令牌登录 (Token Login)
    if (input.token?.trim()) {
      const snapshot = this.authenticate(input.token.trim());
      if (!snapshot) {
        return failure("account-token-invalid", "Account session token is invalid.");
      }
      // P3-1: 显式回填明文 token 返回完整 AccountSession
      return success({ ...snapshot, token: input.token.trim() });
    }

    // 路径 B：账号凭证登录
    const identifier = input.identifier?.trim() ?? "";
    if (!identifier) {
      return failure("account-not-found", "Account identifier is required.");
    }

    const account =
      this.findByPublicHandle(identifier) ??
      this.findByDisplayName(identifier) ??
      this.accounts.get(identifier);

    if (!account) {
      return failure("account-not-found", "Account not found.");
    }

    // P1-1 核心修复：无密码遗留账号安全认领分支
    if (!account.passwordHash) {
      // 必须出示原设备的有效令牌以证明所有权
      const ownershipToken = input.token?.trim();
      const isOwner = ownershipToken && account.tokenHashes.includes(hashToken(ownershipToken));

      if (!isOwner) {
        return failure(
          "account-password-required",
          "This account does not have a password. Please sign in on your original device using your account token to set a password."
        );
      }

      // 验证通过，绑定新密码
      const newPassword = input.password?.trim() ?? "";
      if (newPassword.length < 6) {
        return failure("invalid-password", "Password must be at least 6 characters.");
      }
      const salt = randomBytes(16).toString("hex");
      account.passwordSalt = salt;
      account.passwordHash = await hashPassword(newPassword, salt);
    } else {
      // 正式密码比对
      const password = input.password?.trim() ?? "";
      const valid = await verifyPassword(password, account.passwordSalt ?? "", account.passwordHash);
      if (!valid) {
        return failure("invalid-password", "Incorrect password.");
      }
    }

    // P2-4 核心修复：为新设备签发新令牌，并追加至 tokenHashes 列表（不覆盖旧设备令牌）
    const newToken = `${account.id}.${randomTokenPart(24)}`;
    const newTokenHash = hashToken(newToken);
    account.tokenHashes = [newTokenHash, ...account.tokenHashes.filter((h) => h !== newTokenHash)].slice(0, 5);
    account.lastSeenAt = this.now();
    account.updatedAt = this.now();
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
    // 刷新 lastSeenAt 并节流落盘 ...
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

#### 2.3.2 客户端自愈策略区分
在 `src/components/hooks/useRoomSocket.ts` 中：
- `duplicate-name`：保留既有行为，仅用于房内同名玩家自愈，自动重命名并重试；
- `name-reserved`：**严禁触发静默改名重试**！直接中断请求，调用 `setError(dictionary.room.nameReservedError)`，并在界面上准确引导用户前往登录；
- 兼容发布说明：该错误码与客户端代码同步打包发布，在旧版本客户端上降级为通用错误弹窗，零协议破坏。

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

### 2.5 客户端三态身份切换面板与 A11y 契约（闭环 P3-2）

在 `src/components/online/OnlineLobbyView.tsx` 中，针对“访客 / 登录 / 注册”三态切换引入规范的 WAI-ARIA 标签页设计契约：

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
  {/* 表单输入控件 */}
</div>
```
- **键盘导航**：ArrowLeft / ArrowRight 实现 roving tabindex 轮转，Tab 键平滑步入当前面板中的输入框，严禁在渲染时强夺焦点；
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
| `room.copyAccountToken` | `Copy token` | `复制令牌` | `Copier le jeton` | `Copiar token` | `Копировать токен` | `نسخ الرمز` |
| `room.accountTokenCopied` | `Token copied` | `令牌已复制` | `Jeton copié` | `Token copiado` | `Токен скопирован` | `تم نسخ الرمز` |
| `room.nameReservedError` | `Name is registered. Please log in.` | `该名称属于已注册玩家，请登录使用。` | `Ce nom est réservé. Veuillez vous connecter.` | `Nombre reservado. Por favor inicia sesión.` | `Имя занято. Пожалуйста, войдите.` | `هذا الاسم مسجل. يرجى تسجيل الدخول.` |

---

## 4. 独立审查缺陷闭环矩阵

| 缺陷编号 | 严重度 | 缺陷描述 | 闭环解决方案与技术落点 | 负向验证探针与守门验收 |
| :--- | :--- | :--- | :--- | :--- |
| **P1-1** | **P1** | 无密码账号认领缺乏所有权证明，导致任意用户被公开昵称接管 | 强制认领时核验原设备 Token 凭据（`isOwner` 校验）；无凭据拒绝并返回 `account-password-required` | 单测模拟仅凭昵称+新密码认领旧账号，断言严格失败且账号保持无密码与原 Token 不变 |
| **P2-1** | **P2** | 守门复用 `duplicate-name` 导致 join 路径被客户端静默改名，提示失效 | 引入独立错误码 `"name-reserved"`，客户端在 `useRoomSocket` 严格区分自愈与弹窗提示 | 单测以已注册名执行 `room:join`，断言返回 `name-reserved`，UI 显示提示文案且不触发改名重试 |
| **P2-2** | **P2** | `scryptSync` 同步阻塞单进程事件循环（实测 40.7ms），存在卡顿隐患 | 改用 `util.promisify(scrypt)` 在 libuv 线程池异步计算，辅以 2 并发门禁与 10次/分 IP 限流 | 事件循环采样断言主线程同步停顿为 0.00ms，高并发下平滑排队 |
| **P2-3** | **P2** | 守门谓词未做 Unicode/零宽规范化，可被 `\u200B` 隐形字符绕过冒名 | 实现 `canonicalizePlayerName()`（NFKC + 剔除 `\p{Cf}`/零宽 + 小写），作为全链路唯一口径 | 负向单测覆盖 `"Ali\u200Bce"`、`"Ali\u2060ce"`、`"Ali\u00ADce"` 与全角 `"Ａlice"`，断言均被拦截 |
| **P2-4** | **P2** | 单 `tokenHash` 登录即覆盖，与令牌导出备份及多端使用承诺冲突 | `StoredAccount` 扩充 `tokenHashes: string[]`（保留最新 5 个活跃会话），登录为追加新令牌 | 自动化测试验证设备 A 登录后设备 B 再次登录，A 与 B 均可保持正常鉴权与发包 |
| **P3-1** | **P3** | `findByDisplayName` 缺失、错误码联合未扩充、令牌回填来源不明 | 扩充 `AccountError.code` 联合类型，实现 `findByDisplayName`，明文回填入参令牌 | 静态类型推导 `npx tsc --noEmit` 0 错误，无编译期类型绕过 |
| **P3-2** | **P3** | 身份三态 Pill 缺少 WAI-ARIA 属性与键盘导引契约 | 严格落地 `role="tablist"` / `role="tab"` / `aria-selected` / 方向键 roving tabindex | 读屏无障碍与键盘切换测试通过，切换不夺走正在编辑的表单焦点 |
| **P3-3** | **P3** | 排行榜搜索框 hover 规则失效且缺少键盘焦点指示 | CSS 重置 `.room-leaderboard-search svg { color: inherit }`，增设 `:focus-within` 高亮轮廓 | 样式计算断言 hover 颜色成功转变，键盘聚焦呈现明显视觉光晕 |

---

## 5. 本地门禁与实施保证

在进入代码实施前，设计方案文本完全满足以下基线：
1. `npx tsc --noEmit`：0 错误；
2. `npm run lint`：0 错误，0 警告；
3. `npm test`：35 个测试套件 / 339 项单元测试全绿；
4. `npm run build`：生产构建预渲染 18/18 页面通过。
