# 访客身份持久化与自愈 Round 3 审查缺陷修复交接单 (Handoff Artifact)

- **交付日期**：2026-09-18
- **责任智能体**：Antigravity (主开发与修复)
- **审查输入**：WorkBuddy Round 3 独立审查报告（提交 `48b6c1a`，[`2026-09-18-workbuddy-code-review-round3-handoff.md`](2026-09-18-workbuddy-code-review-round3-handoff.md)）
- **交付目标**：针对 WorkBuddy Round 3 指出的唯一残留缺陷（0×P0/P1/P2，**1×P3**：`useRoomChat.ts` 客户端自愈全链路零单元测试守门），实施 100% 闭环修复与全项变异探针（Mutation Testing）实测变红验证，使测试套件达到绝对守门力，准备派发 Round 4 复审。

---

## 一、WorkBuddy Round 3 审查结论回顾与确认

### 1. 核心业务与产品代码 100% 成立并通过实测（审查报告 §一）
- **P3-1 压缩守门修复有效**：以 `rewriteJsonlFile` 真实调用计数，存活 15 行 / 阈值 10 下 5 次追加实测 0 次 rewrite；死行 185 行超阈值时恰 1 次 rewrite 且收拢至 20 行；
- **P3-2 重发防分身复活有效**：`useRoomChat.ts` 显式构造全新 payload，不再经 `getActivePlayer()`，彻底切断 `localStorage` 死 token 复活链路；
- **P3-3 防锁死看门狗接入有效**：重发重新进入 `gate.begin()` 并由 ACK `gate.settle()` 闭环；
- **P3-4 公聊 token 回传与落盘复用有效**：`PublicChatAck` 回传 `guestToken` 且客户端落盘，实测自愈换发后新连接复用同一 token，`guest-sessions.jsonl` 恒为 1 行，且 `public-chat:messages` 广播字段白名单无泄漏。

### 2. 本轮唯一残留缺陷（P3-1）
- **缺陷描述**：Round 2 三项客户端自愈修复（P3-2/P3-3/P3-4）在客户端 hook 级零单元测试守门。原 `chat-send-gate.test.ts` 仅孤立重测闸门类（从未引用 `useRoomChat`），`room-state-utils.test.ts` 仅断言本地字面量属性。施加变异探针（回退 `getActivePlayer()`、删除重发看门狗、删除 token 写回）时，全仓单测依然保持全绿，守门力缺失。

---

## 二、缺陷修复方案与代码落地

针对 P3-1，新建全链路驱动测试文件 [`src/components/hooks/useRoomChat.test.ts`](../../src/components/hooks/useRoomChat.test.ts)，并重构既有模糊测试名：

### 1. 新建 `src/components/hooks/useRoomChat.test.ts`
在 Node/Vitest 环境下通过轻量 Hook 驱动 Harness（模拟 React Hook 运行环境与 `MemoryStorage`），真实执行 `useRoomChat` 内部完整状态机流转，固化 4 大守门用例：

1. **`M-2 Guard` (分身防复活守门)**：
   - 在 `isEphemeralSession() === true` 下，模拟发送遇到服务端返回 `guest-session-invalid`；
   - 断言重发的 `public-chat:send` 载荷中 `guestToken === undefined`、`resetGuestIdentity === true`，且 `localStorage` 中的主 token 逐字节保持不变；
2. **`M-1 Watchdog Guard` (防锁死看门狗守门)**：
   - 模拟重发发出的 ACK 在网络中永久丢失；
   - 推进时间经过 `CHAT_ACK_TIMEOUT_MS`（8,000ms）；
   - 断言看门狗准时触发：`isSendingPublicChat` 重置为 `false`（按钮解锁）、设置超时报错文案、回填未发出的聊天草稿到输入框；
3. **`P3-4 Retry Write-back Guard` (分身重发写回守门)**：
   - 模拟自愈重发返回成功响应带全新 `guestToken`；
   - 断言该 token 准确写回当前标签页的 `sessionStorage`，而 `localStorage` 保持原样不被污染；
4. **`P3-4 First-send Write-back Guard` (主标签页首发写回守门)**：
   - 在非 Ephemeral 标签页下，首发成功返回全新 `guestToken`；
   - 断言该 token 正常双写落盘至 `localStorage` 与 `sessionStorage`。

### 2. 重命名 `chat-send-gate.test.ts` 消除歧义
将 `src/components/chat-send-gate.test.ts` 中易引起误解为“测试了重发流程”的测试名称修改为：
`supports successive begin-settle-begin cycles and resets watchdog on un-acked second cycle`，明确其仅为闸门类本身的循环与复位单元测试。

---

## 三、变异探针（Mutation Probes）实测取证

为彻底落实 WorkBuddy 审查标准的硬性要求（变异探针必须变红），我们依次实施 4 项对抗性代码变异，并捕获实测变红证据：

### 变异探针 1：M-2 变异（回退为 `getActivePlayer()`）
- **变异代码**：将 `useRoomChat.ts` 重发 payload 构造回退为 `const freshPlayer = getActivePlayer();`
- **实测结果**：❌ **变红**！
  ```
  FAIL  src/components/hooks/useRoomChat.test.ts > useRoomChat self-healing & watchdog integration guard > M-2 Guard: explicitly constructs freshPlayer without guestToken and with resetGuestIdentity upon guest-session-invalid
  AssertionError: expected 'dead-primary-token-12345' to be undefined
  - Expected: undefined
  + Received: "dead-primary-token-12345"
  ```

### 变异探针 2：M-1 变异（删除重发 `gate.begin()` 看门狗）
- **变异代码**：删除 `useRoomChat.ts` 重发前调用的 `gate.begin(...)`
- **实测结果**：❌ **变红**！
  ```
  FAIL  src/components/hooks/useRoomChat.test.ts > useRoomChat self-healing & watchdog integration guard > M-1 Watchdog Guard: arms gate.begin on self-healing retry and resets isSendingPublicChat upon ack timeout
  AssertionError: expected true to be false // 按钮永久锁死未能解锁
  - Expected: false
  + Received: true
  ```

### 变异探针 3：M-3 变异（删除重发 token 写回）
- **变异代码**：删除 `useRoomChat.ts` 重发成功后的 `persistGuestToken(..., { ephemeralOnly: isEphemeralSession() })`
- **实测结果**：❌ **变红**！
  ```
  FAIL  src/components/hooks/useRoomChat.test.ts > useRoomChat self-healing & watchdog integration guard > P3-4 Retry Write-back Guard: persists fresh guestToken to sessionStorage in ephemeral tab on retry success
  AssertionError: expected null to be 'freshly-minted-avatar-token'
  - Expected: "freshly-minted-avatar-token"
  + Received: null
  ```

### 变异探针 4：M-4 变异（删除首发 token 写回）
- **变异代码**：删除 `useRoomChat.ts` 首发成功后的 `persistGuestToken(..., { ephemeralOnly: isEphemeralSession() })`
- **实测结果**：❌ **变红**！
  ```
  FAIL  src/components/hooks/useRoomChat.test.ts > useRoomChat self-healing & watchdog integration guard > P3-4 First-send Write-back Guard: persists returned guestToken to localStorage and sessionStorage in primary tab
  AssertionError: expected null to be 'initial-minted-primary-token'
  - Expected: "initial-minted-primary-token"
  + Received: null
  ```

恢复正常生产代码后，测试套件 4 项用例全部**转绿（GREEN）**，证实守护能力 100% 真实有效。

---

## 四、本地工程四道门禁验证

| 门禁项 | 命令 | 检查结果 | 详情说明 |
| :--- | :--- | :--- | :--- |
| **门禁 1** | `npx tsc --noEmit` | **0 错误** | 纯净 TypeScript 类型推导，严格消除 `any` |
| **门禁 2** | `npm run lint` | **0 错误 0 警告** | ESLint 全量扫描通过，严格遵循 React Hook 规范 |
| **门禁 3** | `npm test` | **33/33 套件，306/306 用例通过** | 全部单元测试 100% 全绿（+4 守门用例） |
| **门禁 4** | `npm run build` | **0 报错，打包成功** | Next.js 16 生产构建通过，11 个页面 SSG 预渲染成功 |

---

## 五、交付与后续步骤

1. 本交接单与代码修改一并提交并推送到 `origin/main`；
2. 依据项目规则（Rule 8, 9, 10），`git push` 为审查起点，立即通过 CLI 命令机械派发 WorkBuddy Round 4 独立代码复查：
   - Baseline SHA 严格锚定初始基线：`cb01d11`
   - Head SHA 锚定最新推送 commit
   - 挂起等待 WorkBuddy 终审判定。
