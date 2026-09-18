# 访客身份持久化、30天有效期与全链路自愈技术设计方案交接单

- **交接日期**：2026-09-18
- **交接主题**：访客身份持久化（解决 Guest session is invalid 报错）、30 天（1 个月）有效期、服务端 JSONL 落盘与全链路自愈技术设计方案
- **设计文档**：[`docs/PERSISTENT_GUEST_IDENTITY_PLAN.md`](../PERSISTENT_GUEST_IDENTITY_PLAN.md)
- **交付类型**：**需求与技术设计方案（Technical Design / Proposal）**，本次交付仅包含设计规范、交接单与状态表同步，源码尚未进入实现阶段。
- **基准提交 SHA**：`d276991`（`docs(review): add workbuddy round5 review pass for persistence implementation`）

---

## 1. 交付目标与背景

针对用户在好友房与大厅中频繁遇到的“`Guest session is invalid. Start a new guest session.`”阻断性报错，以及期望“只要在同一台机器/浏览器上未清空数据就持久保留该访客身份，1 个月未再次访问才失效”的核心诉求，开展全链路系统架构设计：

1. **痛点根因深度剖析**：
   - **服务端纯内存存储**：`GuestSessionStore` 为纯内存 Map 映射，服务重启/热重载/部署发布即丢失全部会话；浏览器携带旧 Token 请求即被拒绝；
   - **TTL 仅 6 小时**：`GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000` 过短，过夜或挂起即失效；
   - **客户端存储局限于 `sessionStorage`**：关标签页丢 Token，与 `localStorage` 保留的名称产生状态脱节；
   - **客户端缺乏自愈闭环**：`createRoom`、`reconnectHandlerRef` 以及大厅 `refreshPresence` 缺少对 `guest-session-invalid` 的自动捕获与重试，错误直接穿透渲染至 UI。

2. **核心方案设计（四大支柱）**：
   - **长效设备身份保持**：客户端将 `guestToken` 与 `playerId` 主凭证沉淀至 `localStorage`，跨会话与重启浏览器稳定复用；
   - **服务端 JSONL 磁盘持久化**：`GuestSessionStore` 接入 `jsonl-file.ts` 架构，存储于 `data/accounts/guest-sessions.jsonl`，实现服务重启零丢失，配合 60 秒节流落盘削峰；
   - **30 天滑动过期时钟**：`GUEST_SESSION_TTL_MS` 扩充至 30 天，每次访客连接或发包自动续期；
   - **全链路静默自愈兜底**：建房、大厅同步、断线重连全覆盖拦截 `guest-session-invalid`，遇到超期失效自动无感重新签发并重试，彻底消灭 UI 报错。
   - **多标签对局隔离兼顾**：通过 `ephemeralOnly` 保护机制，多开自测仅在 `sessionStorage` 分支临时身份，不污染 `localStorage` 主凭据。

---

## 2. 关键架构与数据契约设计

详见技术设计方案全文：[`docs/PERSISTENT_GUEST_IDENTITY_PLAN.md`](../PERSISTENT_GUEST_IDENTITY_PLAN.md)。

### 2.1 服务端数据模型与持久化契约
- **TTL 调整**：`GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`（30 天）。
- **`GuestSessionStore` 构造参数扩充**：支持 `filePath`、`compactAfterLines`、`lastSeenPersistIntervalMs`、`ttlMs`、`now`。
- **持久化路径**：`data/accounts/guest-sessions.jsonl`（受 `.gitignore` 保护）。
- **防雪崩节流**：`lastSeenAt` 写入磁盘间隔 $\ge 60$ 秒。

### 2.2 客户端 Storage 双写与优先级契约
- `persistGuestToken(guestToken)`：双写 `localStorage` 与 `sessionStorage`；
- `readGuestToken()`：优先级 `sessionStorage`（标签页临时覆盖） $\to$ `localStorage`（长效设备身份） $\to$ `readRoomSession()?.guestToken`；
- `clearGuestToken({ ephemeralOnly?: boolean })`：支持仅清当前标签页隔离分身，保护全局主身份；
- `getOrCreatePlayerId()`：同样落地 `localStorage` 保持长效连续性。

### 2.3 客户端自愈状态机
- `useRoomSocket.createRoom`：收到 `guest-session-invalid` 时，清空失效凭证并重新生成身份后静默重试 `room:create`；
- `useRoomSocket.reconnectHandlerRef`：收到 `guest-session-invalid` 时清空并静默退出，不再调用 `applyRoomAck` 污染 UI；
- `useLobbyPresence.refreshPresence`：同样静默清空并自愈重连。

---

## 3. 本地门禁基线验证

本次交付仅包含技术设计规范文档、交接单与状态表更新，源码零改动。基线门禁验证状态：

1. `npx tsc --noEmit`：0 错误（严格类型推导通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量扫描通过）
3. `npm test`：全套单元测试通过
4. `npm run build`：生产构建完全成功（SSG 11 页面通过）

---

## 4. 下一步与实施路线

设计方案经 WorkBuddy 双智能体独立审查通过并收敛定稿后，正式推进至代码实现阶段：
1. 升级 `src/server/accounts.ts` 中的 `GuestSessionStore` 实现 JSONL 落盘与 30 天滑动过期，并补齐 `accounts.test.ts` 单测；
2. 在 `src/server/room-store.ts` 注入持久化路径；
3. 改造 `src/components/hooks/room-state-utils.ts` 完善 Storage 读写与 `ephemeralOnly` 隔离；
4. 改造 `useRoomSocket.ts` 与 `useLobbyPresence.ts` 实现全链路静默自愈；
5. 运行完整工程门禁与端到端模拟测试。
