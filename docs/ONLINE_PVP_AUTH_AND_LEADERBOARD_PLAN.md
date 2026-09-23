# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案（第 1 版 · 送审稿）

> **状态**：技术设计方案送审中（Technical Design Proposal · Review Round 1）  
> **日期**：2026-09-23  
> **涉及范围**：`src/i18n/dictionaries.ts`、`src/app/globals.css`、`src/server/accounts.ts`、`src/server/online-server.ts`、`src/server/room-socket.ts`、`src/components/useFriendRoom.ts`、`src/components/online/OnlineLobbyView.tsx`、`src/components/online/lobby/LobbyLeaderboard.tsx`

---

## 1. 交付目标与痛点根因分析

针对用户在体验联机模块时反馈的四大核心问题，开展端到端的技术架构与交互契约设计：

### 1.1 模块定位与命名狭隘（Friend Room ➔ Online PVP）
- **现象**：主顶部导航栏与模式切换中，联机模块被命名为“好友房”（Friend room）。
- **根因**：早期该模块仅支持通过链接邀请好友。随着系统演进，该模块已集成了公共房间大厅、快速匹配队列、全网在线排行榜（Rankings/Leaderboard）、全服公聊（Public Chat）以及在线访客列表，已成为完整的多人在线对战中枢。继续使用“好友房”会严重误导用户认知。
- **目标**：在全站 6 种官方语言中，将模式名称统一修正为 **“联机对战”**（Online PVP），准确反映其完整多人对战功能。

### 1.2 排行榜搜索框过长且搜索按钮遮挡输入框
- **现象**：在排行榜（Rankings）面板中，搜索框宽度横向过长（撑满整个面板），且放大镜搜索按钮悬浮遮挡了输入框左侧约 1/3 的空间，遮盖了 placeholder 与用户输入的文本。
- **根因**：
  1. `.room-leaderboard-search` 在 `globals.css` 中仅设置了 `display: grid; grid-template-columns: 18px minmax(0, 1fr);`，未设置 `max-width`，导致其在面板中强制横向 100% 延展；
  2. 提交按钮使用了通用类名 `<button className="icon-button" ...>`。而全局 `.icon-button` 定义了 `min-width: 56px; min-height: 44px; background: var(--panel); box-shadow: var(--panel-shadow); z-index: 2;`。
  3. 由于按钮强制占据 56px 宽度，被塞入宽度仅 18px 的第 1 列 Grid 单元格时，按钮溢出 38px 强行骑跨在第 2 列 `<input>` 上，其不透明背景与阴影完全遮挡了输入框内部文字。
- **目标**：为 `.room-leaderboard-search` 设定合适的紧凑最大宽度（如 `280px`），并彻底重置其内嵌搜索按钮的样式，消除多余的 `min-width`、背景与阴影，使图标按钮精确嵌入 20px 单元格内，零遮挡且支持键盘/点击交互。

### 1.3 已注册玩家无法登录回来（缺乏登录与密码机制）
- **现象**：已注册的玩家在退出登录、更换浏览器、无痕浏览或清除缓存后，无法重新登录自己的账号。
- **根因**：
  1. 目前系统仅提供了 `POST /api/account/register` 与 `GET /api/account/session`（仅支持 Bearer token 校验）；
  2. `StoredAccount` 仅保存 `tokenHash`、`displayName`、`publicHandle`、`id`，**完全没有密码哈希与密码认证体系**；
  3. 客户端在注册成功后仅将服务端签发的 `token` 写入浏览器 `localStorage`；一旦 `signOutAccount()` 或更换设备，`token` 丢失，由于**服务端没有登录接口（Login API）、没有密码校验、客户端也没有登录 UI**，玩家被永久锁在账号之外；再次输入原昵称点击注册时，服务端则返回 409 Conflict（`duplicate-name`），导致玩家既不能注册也不能登录。
- **目标**：
  1. 引入密码认证体系（Node.js 原生 `crypto.scryptSync` / 加盐哈希）；
  2. 新增 `POST /api/account/login` 服务端接口与 `AccountStore.loginAccount()` 方法；
  3. 支持凭“用户名/公开代号 + 密码”或“账号令牌（Token）”登录并重新签发有效会话；
  4. 支持旧无密码账号在首次登录时认领并设定密码，实现无缝向下兼容；
  5. 客户端大厅身份面板提供清爽的“登录”与“注册”切换界面，并提供账号令牌导出备份能力。

### 1.4 访客可随意冒用已注册玩家昵称（缺乏服务端保留名校验）
- **现象**：访客可以把自己的昵称修改为与已注册玩家一模一样，只要不点击“注册”，就可以在房间、对局和公聊中一直冒名使用。
- **根因**：
  1. `AccountStore.createAccount` 虽然包含 `hasDisplayName()` 查重逻辑，但该方法为 `private`，且**仅在注册新正式账号时调用**；
  2. 当访客通过 WebSocket 连接或更新昵称时，`resolvePlayerIdentity()` 与 `GuestSessionStore.authenticate()` / `createSession()` **完全未与 `AccountStore` 进行比对**；
  3. 服务端权威身份判定放任访客将 `playerName` 设置为任意已注册账号的 `displayName` 或 `publicHandle`，形成了极大的身份伪造漏洞。
- **目标**：在 `AccountStore` 开放 `isNameReserved(name)` 校验接口；在 `resolvePlayerIdentity()` 中增设强制守门：未携带有效注册凭证（`accountToken`）的访客若尝试使用已注册账号的名称或代号，服务端坚决拒绝并返回 `duplicate-name` 错误，彻底斩断冒名通道。

---

## 2. 详细技术契约与架构设计

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Online PVP 架构契约演进                          │
├────────────────────────────────┬───────────────────────────────────────┤
│ 模块与协议层                    │ 核心改动与契约规范                     │
├────────────────────────────────┼───────────────────────────────────────┤
│ 表现层 (UI & CSS)              │ - Leaderboard 搜索框限宽 280px，按钮零遮挡│
│                                │ - 身份面板拆分: 访客设置 / 登录 / 注册 │
│                                │ - 6 语种模式名称全面演进为 Online PVP  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 通信与接口层 (HTTP API & WS)   │ - 新增 POST /api/account/login (带限流)│
│                                │ - POST /api/account/register 支持密码  │
│                                │ - resolvePlayerIdentity 拦截访客冒名   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 领域模型与存储层 (Server Store)│ - StoredAccount 扩充 passwordHash/salt │
│                                │ - AccountStore.loginAccount 登录与认领 │
│                                │ - AccountStore.isNameReserved 保留名查重│
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 六语种国际化与命名契约 (`src/i18n/dictionaries.ts`)

#### 2.1.1 模式名称替换（对齐全部 6 种官方语言）
- `modes.room` 与 `room.panelLabel`：
  - `en`：`"Online PVP"`（替代 `"Friend room"`）
  - `zh`：`"联机对战"`（替代 `"好友房"`）
  - `fr`：`"PVP en ligne"`（替代 `"Salon ami"`）
  - `es`：`"PVP online"`（替代 `"Sala de amigos"`）
  - `ru`：`"Онлайн PVP"`（替代 `"Комната друга"`）
  - `ar`：`"مبارزة عبر الإنترنت"`（替代 `"غرفة صديق"`，保持 RTL 兼容）

#### 2.1.2 新增账号登录与身份交互文案
在 `RoomDictionary` 接口中扩充以下字段，并在 6 语种字典中完整同步：
```typescript
export type RoomDictionary = {
  // ...既存字段保持不变
  loginAccount: string;                // "Log in" / "登录"
  loginTab: string;                    // "Log in" / "登录"
  registerTab: string;                 // "Register" / "注册"
  accountPassword: string;             // "Password" / "密码"
  accountPasswordPlaceholder: string;  // "Enter password (min 6 chars)" / "输入密码 (至少6位)"
  accountIdentifier: string;           // "Account or Handle" / "账号或公开代号"
  accountIdentifierPlaceholder: string;// "Display name or @handle" / "输入昵称或 @公开代号"
  copyAccountToken: string;            // "Copy token" / "复制令牌"
  accountTokenCopied: string;          // "Token copied" / "令牌已复制"
  nameReservedError: string;           // "This name is registered to an account. Please log in." / "该名称属于已注册玩家，请登录使用。"
};
```

---

### 2.2 排行榜搜索框布局与无障碍契约 (`src/app/globals.css` & `LobbyLeaderboard.tsx`)

#### 2.2.1 CSS 规则修复
```css
/* 约束搜索条宽度，避免无序拉伸 */
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
}

/* 消除全局 .icon-button 导致的 56px 强制拉伸与背景遮挡 */
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

.room-leaderboard-search .icon-button:hover,
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

#### 2.2.2 视觉与交互保障
- **零像素重叠**：搜索图标按钮尺寸收敛至 `20px × 20px`，完全匹配 Grid 第 1 列，与 `<input>` 之间保持 `8px` 干净间隙；
- **RTL 完美兼容**：Grid 布局在阿拉伯语 `dir="rtl"` 视口下自动自右向左排列，零硬编码 `left`/`right`。

---

### 2.3 服务端账号密码存储与登录认证契约 (`src/server/accounts.ts`)

#### 2.3.1 数据模型扩展 (`StoredAccount`)
```typescript
type StoredAccount = {
  createdAt: number;
  displayName: string;
  id: string;
  lastSeenAt: number;
  publicHandle: string;
  tokenHash: string;
  updatedAt: number;
  // 新增可选密码哈希与盐值，对已有 accounts.jsonl 文件 100% 向下兼容
  passwordHash?: string;
  passwordSalt?: string;
};
```

#### 2.3.2 密码哈希与校验算法
采用 Node.js 原生内置 `node:crypto` 实现安全加密，无需任何外部 npm 依赖：
```typescript
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt);
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
```

#### 2.3.3 `AccountStore` 方法集演化
1. **`createAccount` 升级**：
   - 增加可选入参 `password?: string`；
   - 若传入密码，校验长度需 $\ge 6$ 位；生成 16 字节随机 `salt`，计算 `passwordHash` 并同数据落盘。
2. **新增 `loginAccount` 方法**：
   ```typescript
   loginAccount(input: {
     identifier?: string;
     password?: string;
     token?: string;
   }): AccountResult<AccountSession>
   ```
   - **路径 A（通过令牌登录）**：若传入 `token`，直接调用 `authenticate(token)`。验证成功则返回会话；
   - **路径 B（通过凭证与密码登录）**：
     - 通过 `findByPublicHandle(identifier)`、`findByDisplayName(identifier)` 或 `accounts.get(identifier)` 检索账号；
     - 若未找到账号：返回 `failure("account-not-found", "Account not found.")`；
     - **旧账号认领分支（Legacy Migration）**：若账号未设定密码（`!account.passwordHash`）：
       - 若用户提供了有效的新密码（$\ge 6$ 位），自动为该账号绑定此密码并持久化落盘，成功登录并认领账号；
     - **正式密码校验分支**：
       - 若账号已存在密码，调用 `verifyPassword` 核验；
       - 若密码不匹配，返回 `failure("invalid-password", "Incorrect password.")`；
     - **会话签发**：核验通过后，服务器为该客户端签发新的安全会话令牌：
       `const token = `${account.id}.${randomTokenPart(24)}`;`
       更新 `account.tokenHash = hashToken(token)`、`account.lastSeenAt = now`，执行增量落盘，返回携带明文 `token` 的完整 `AccountSession`。
3. **新增公开查重方法 `isNameReserved(name: string): boolean`**：
   ```typescript
   isNameReserved(name: string): boolean {
     const trimmed = name.trim();
     if (!trimmed) return false;
     return this.hasDisplayName(trimmed) || this.findByPublicHandle(trimmed) !== null;
   }
   ```

---

### 2.4 访客防冒名与身份裁决契约 (`src/server/accounts.ts` & `room-socket.ts`)

#### 2.4.1 `resolvePlayerIdentity` 裁决守门
在 `src/server/accounts.ts` 中增强身份解析逻辑：
```typescript
export function resolvePlayerIdentity(
  input: { accountToken?: null | string; guestToken?: null | string; playerId: string; playerName: string },
  accountStore: AccountStore,
  guestSessionStore: GuestSessionStore
): AccountResult<ResolvedPlayerIdentity> {
  const accountToken = input.accountToken?.trim();

  // 1. 若携带 accountToken，走正式账号认证
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

  // 2. 访客身份安全守门：严禁冒用已注册账号名称或公开代号
  const requestedName = normalizeDisplayName(input.playerName);
  if (requestedName && accountStore.isNameReserved(requestedName)) {
    return failure("duplicate-name", "This display name is registered to an account. Please sign in to use this name.");
  }

  // 3. 访客 Session 恢复或新签发
  const guestToken = input.guestToken?.trim();
  if (guestToken) {
    const guestSession = guestSessionStore.authenticate(guestToken, input.playerName);
    if (!guestSession) {
      return failure("guest-session-invalid", "Guest session is invalid. Start a new guest session.");
    }
    // 双重防御：防止已有访客在运行中篡改名字为已注册名称
    if (accountStore.isNameReserved(guestSession.playerName)) {
      return failure("duplicate-name", "This display name is registered to an account. Please sign in to use this name.");
    }
    return success({
      guestToken: guestSession.token,
      identity: "guest",
      playerId: guestSession.playerId,
      playerName: guestSession.playerName
    });
  }

  // 4. 创建新访客
  const guestSession = guestSessionStore.createSession({
    playerId: createGuestPlayerId(),
    playerName: input.playerName
  });
  if (!guestSession.ok) {
    return guestSession;
  }
  return success({
    guestToken: guestSession.value.token,
    identity: "guest",
    playerId: guestSession.value.playerId,
    playerName: guestSession.value.playerName
  });
}
```

#### 2.4.2 错误传播与 UI 展现
当访客尝试以已被注册的昵称建房、入房、匹配或发言时，服务端立即通过 ACK 返回 `duplicate-name` 错误，客户端 Hook 自动将其挂载至 `room.error` 提示用户：“该名称属于已注册玩家，请登录使用。”

---

### 2.5 HTTP 路由与防爆破限流契约 (`src/server/online-server.ts`)

#### 2.5.1 新增登录端点
- **路径**：`POST /api/account/login`
- **安全防爆破**：为登录独立挂载 `FixedWindowRateLimiter({ limit: 10, windowMs: 60_000 })`（每 IP 每分钟最多尝试 10 次），超限返回 HTTP 429 与 `retry-after` 响应头；
- **请求体**：
  ```json
  {
    "identifier": "Alice",
    "password": "mySecurePassword123"
  }
  ```
  *(或提供 `{ "token": "acct_xxx.yyy" }`)*
- **成功响应**：HTTP 200，返回完整的 `AccountSession` JSON；
- **失败响应**：HTTP 401，返回 `{ "error": "Incorrect password." }` 或 `{ "error": "Account not found." }`。

#### 2.5.2 注册端点升级
- **路径**：`POST /api/account/register`
- **请求体扩展**：支持可选 `password` 字段（建议密码 $\ge 6$ 位）；
- **响应**：创建成功后自动包含密码哈希落盘，返回 HTTP 200 与会话数据。

---

### 2.6 客户端大厅交互与状态机设计 (`useFriendRoom.ts` & `OnlineLobbyView.tsx`)

#### 2.6.1 身份管理状态机
在 `useFriendRoom.ts` 中新增以下状态与方法：
- `authMode: "guest" | "login" | "register"`（默认依据当前是否有账号自适应呈现）；
- `loginAccount(identifier: string, password?: string, token?: string): Promise<void>`：
  - 调用 `fetch("/api/account/login")`；
  - 成功时更新 `account` 状态、持久化 `token`、设置 `accountStatus = "registered"`，清空错误；
  - 失败时将服务端错误信息置入 `room.error`。

#### 2.6.2 界面布局演进（`OnlineLobbyView.tsx`）
在用户点击“编辑身份”（Edit Identity）展开面板中：
1. **未登录状态**：
   - 顶部提供 3 项紧凑切换 Pill：`[ 访客设置 ]  [ 登录账号 ]  [ 注册新账号 ]`；
   - **访客设置**：仅包含“玩家昵称”输入框，支持随改随存；若输入已注册名称，实时给予友好校验警告；
   - **登录账号**：包含“昵称或公开代号”输入框、“密码”输入框，以及“登录”按钮；
   - **注册新账号**：包含“玩家昵称”、“公开代号（可选）”、“设置密码（至少6位）”，以及“注册”按钮；
2. **已登录状态**：
   - 显示已认证标识、当前玩家昵称、`@publicHandle`；
   - 提供“个人主页”链接；
   - 提供“复制账号令牌”按钮（便于跨浏览器快速转移账号凭据）；
   - 提供“退出登录”按钮（清空凭据并安全切回访客身份）。

---

## 3. 安全性、性能与向下兼容性保障

1. **防彩虹表与碰撞攻击**：使用 16 字节高熵加盐 + `scryptSync` 强力密码哈希，杜绝明文与弱哈希泄露；
2. **防时序攻击**：密码匹配使用 `timingSafeEqual`，杜绝通过网络响应时间反推字符；
3. **防暴力破解**：登录接口施加 1 分钟 10 次的严密 IP 速率限制；
4. **历史数据向下兼容**：
   - `accounts.jsonl` 中既存的 80+ 条测试及已有账号记录由于缺少 `passwordHash` 字段，加载时将安全反序列化为 `undefined`；
   - 具有合法所有权的玩家在首次输入原用户名并设定密码时，通过“无密码平滑认领”通道自动补全密码哈希，零数据断代；
5. **性能无感**：
   - 密码哈希仅在用户主动发起登录/注册时计算一次（单次计算时间约为 10~20ms），核心对局、Socket 通信和长连接握手继续依赖高效的高熵 Token SHA-256 哈希认证，完全不增加对局事件循环负担；
6. **无障碍与国际化合规**：
   - 6 种语言文案齐全，通过 `dictionaries.test.ts` 严格比对；
   - RTL 镜像排版严格测试，输入框与按钮在阿拉伯语视口下保持逻辑自洽。

---

## 4. 本地门禁与验证矩阵

| 验证项 | 验证命令 | 验收指标 |
| :--- | :--- | :--- |
| **类型检查** | `npx tsc --noEmit` | **0 错误**（严格类型推导，无 any 逃逸） |
| **代码规范** | `npm run lint` | **0 错误，0 警告**（ESLint 全量通过） |
| **单元测试** | `npm test` | **全部通过**（覆盖密码注册、登录、防冒充守门与字典同步） |
| **生产构建** | `npm run build` | **0 报错**（所有多语言 SSG 预渲染完全正常） |
| **持久化冒烟**| `npm run smoke:persistence` | **5/5 全通过** |

---

## 5. 实施路线图

1. **阶段 1：字典与国际化规范** ➔ 落实 6 语种 `modes.room` 与 `panelLabel` 为 `Online PVP` / `联机对战`，扩充账号字典文案并通过 `dictionaries.test.ts`；
2. **阶段 2：CSS 样式与排行榜搜索框修复** ➔ 约束 `.room-leaderboard-search` 宽度至 280px，彻底重置内嵌按钮样式，消除悬浮重叠；
3. **阶段 3：服务端密码认证与防冒名守门** ➔ 升级 `AccountStore` 增设密码存储与 `loginAccount`，实现 `isNameReserved`，在 `resolvePlayerIdentity` 彻底封堵访客冒名漏洞；
4. **阶段 4：HTTP 登录路由与限流** ➔ 在 `online-server.ts` 实现 `POST /api/account/login` 并配置防刷限流器；
5. **阶段 5：客户端交互与大厅登录/注册整合** ➔ 升级 `useFriendRoom.ts` 与 `OnlineLobbyView.tsx`，落地登录/注册/访客三态切换与 Token 备份；
6. **阶段 6：自动化守门测试与全面门禁验证** ➔ 在 `accounts.test.ts`、`room-socket.test.ts` 增补防冒充、密码验证与边界单测，确保本地四道门禁 100% 全绿并推进送审。
