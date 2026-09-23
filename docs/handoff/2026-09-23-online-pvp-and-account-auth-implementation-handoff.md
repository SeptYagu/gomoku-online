# 联机对战命名、排行榜搜索框修复、账号登录与防冒名代码落地交付交接单

> 交付日期：2026-09-23  
> 关联主题：联机对战命名演进、排行榜搜索框样式修复、账号密码注册登录与多端轮换、访客冒名防御闭环  
> 对应提交：待推送待审提交（Push for Review）  
> 基准提交（Audit Base SHA）：`b2c6383`（保持双智能体代码审查锚点固定）

---

## 1. 交付目标与核心变更范围

依据用户反馈与已终审收敛的技术设计方案，在全栈实施以下四大模块功能及自愈防护机制：

1. **命名演进（Friend Room ➔ Online PVP）**：
   - 在 6 语种字典（`en`, `zh`, `fr`, `es`, `ru`, `ar`）中，将 `modes.room` 与 `room.panelLabel` 全量更新为规范的“联机对战”（en: "Online PVP", zh: "联机对战", fr: "PVP en ligne", es: "PVP online", ru: "Онлайн PVP", ar: "مبارزة عبر الإنترنت"）。
   - 保留向后兼容的 URL 参数与路由契约，零破坏现有连接。

2. **排行榜搜索框布局与遮挡修复**：
   - 修复 `.room-leaderboard-search` 在大屏幕下拉伸过长问题，显式限制 `max-width: 280px` 与 `padding: 6px 10px`。
   - 彻底重置搜索框内提交按钮样式（尺寸重置为 `20px × 20px`，静态流式定位 `position: static`，取消 56px 强制拉伸与全局阴影），解决按钮悬浮遮挡输入文字缺陷。
   - 修复 SVG 颜色穿透与 `:focus-within` 轮廓高亮，适配明暗主题与 RTL 镜像排版。

3. **账号密码注册、多端登录与遗留账号认领**：
   - `src/server/accounts.ts`：
     - 引入原生 `crypto.scrypt` 异步哈希与加盐模型（N=16384, r=8, p=1），配套 `ScryptConcurrencyGate`（最大并发 2，排队上限 32，等待超时 5000ms），彻底杜绝事件循环阻塞与 DoS 风险。
     - 支持密码创建账号（`createAccount` 兼容同步无密码与异步带密码重载）。
     - 新增 `loginAccount` 接口：支持按账号 ID、公开代号（`@handle`）或昵称登录；支持多端登录会话 FIFO 轮换（保留最新 5 个活跃会话，第 6 次登录淘汰最早会话）。
     - 支持遗留无密码账号安全认领：必须持有原设备令牌（`ownershipToken`）验证通过后方可设置新密码；无所有权凭据尝试直接登录被拦截（`account-password-required`）。
   - `src/server/online-server.ts`：
     - 新增 `POST /api/account/login` 端点，配置独立 IP 速率限制（10次/分钟）。
     - 捕获并发闸门背压异常（`QUEUE_FULL`/`QUEUE_TIMEOUT`）返回 HTTP 503。
     - 导出 `mapAccountErrorToStatusCode` 规范映射 400/401/409/503。

4. **访客冒用已注册玩家昵称漏洞封堵（Anti-Spoofing）**：
   - `canonicalizePlayerName`：采用 Unicode NFKC 规范化、去除 `\p{Cf}` 零宽隐形字符（`\u200B`, `\u2060`, `\u00AD` 等）、折叠多余空白并转小写。
   - `isNameReserved`：全量检查注册账号昵称与公开代号规范化变体。
   - `resolvePlayerIdentity`：访客尝试使用已被注册的名称时直接拒绝并返回 `name-reserved`。
   - `room-socket.ts`：在 `acknowledgeAndBroadcast` 中抑制 `name-reserved` 的二次 `socket.emit("room:error")`，确保客户端收到 ACK 中的精准错误。
   - `room-state-utils.ts` & `useRoomSocket.ts`：新增 `resolveRoomErrorMessage`，打通六语种 `nameReservedError` 本地化文案精确上屏通道。
   - 客户端自愈保护：将 `name-reserved` 排除在静默改名重试列表外，确保用户明确获知错误。

5. **Lobby UI 身份交互演进与无障碍增强**：
   - `OnlineLobbyView.tsx`：未登录状态下渲染 WAI-ARIA 规范的三态 Tab 切签（游客 / 登录 / 注册），支持键盘左右箭头方向键巡航切换（roving tabIndex）；
   - 已登录状态下展示账号信息、个人主页跳转、Token 复制按钮（带 1.8s 成功反馈定时器）与退出按钮。

---

## 2. 本地工程门禁验证证据（四道硬指标全绿）

本地终端依序执行并 100% 验证通过：

```bash
# 门禁 1: TypeScript 类型检查 (0 错误)
npx tsc --noEmit
# 结果: 0 错误 (Exit 0)

# 门禁 2: ESLint 规范扫描 (0 错误 0 警告)
npm run lint
# 结果: 0 错误, 0 警告 (Exit 0)

# 门禁 3: Vitest 单元测试套件 (全通过)
npm test
# 结果: 35 个测试套件，351 项用例全部通过 (Exit 0, 耗时 6.5s)
# 包含新增的 12 项高覆盖度单测：
#  - canonicalizePlayerName (全角/零宽/隐形/大小写)
#  - ScryptConcurrencyGate (并发上限/队列饱和背压/等待超时)
#  - hashPassword & verifyPassword (正确验证/错误密码/长度异常)
#  - 账号密码登录与代号登录
#  - 会话 FIFO 轮换 (5令牌上限，第6次驱逐最老)
#  - 遗留账号认领 (无凭据阻断/有凭据绑定密码/密码后续登录)
#  - 昵称保留与访客冒用拦截
#  - mapAccountErrorToStatusCode HTTP状态码映射
#  - resolveRoomErrorMessage 本地化错误解析

# 门禁 4: Next.js 生产构建与页面预渲染 (全通过)
npm run build
# 结果: 18 个页面全部预渲染成功，0 错误 (Exit 0, 耗时 12.2s)
```

---

## 3. 修改文件清单

- `src/i18n/dictionaries.ts`：6 语种新增 12 个本地化文案键，同步更名 `modes.room` 与 `room.panelLabel`
- `src/app/globals.css`：排行榜搜索框限宽 280px、内嵌按钮样式重置、Tab 与跨列栅格辅助类
- `src/server/domain/room-state-machine.ts`：扩展 `RoomErrorCode` 联合类型新增 4 码
- `src/server/accounts.ts`：`canonicalizePlayerName`、`ScryptConcurrencyGate`、密码哈希与核验、多令牌轮换、账号登录与认领、防冒名守门谓词、HTTP 状态码映射
- `src/server/online-server.ts`：新增 `/api/account/login` 路由、登录 IP 限流与背压保护
- `src/server/room-socket.ts`：抑制 `name-reserved` 二次广播
- `src/components/hooks/room-state-utils.ts`：定义 `resolveRoomErrorMessage`、扩展 messages 接口
- `src/components/hooks/useRoomSocket.ts`：接入 `resolveRoomErrorMessage`，排除 `name-reserved` 自动静默改名
- `src/components/GameShell.tsx`：为 `useFriendRoom` 装配 `nameReservedError` 字典
- `src/components/useFriendRoom.ts`：控制器导出 `loginAccount`，`registerAccount` 支持传入密码
- `src/components/online/OnlineLobbyView.tsx`：三态 Tab 身份切换面板、密码登录/注册表单、Token 复制与 A11y 键盘导航
- `src/server/accounts.test.ts`：新增 11 项深度覆盖测试
- `src/components/hooks/room-state-utils.test.ts`：新增 1 项本地化错误解析测试

---

## 4. 后续流转契约（WorkBuddy 代码审查）

依据 AGENTS.md 规范：
1. 提交并推送至 `origin/main`；
2. 保持 `--base-sha b2c6383` 锚点不变；
3. 立即调用 WorkBuddy CLI 触发 Round 1 源码审查（`workbuddy_cli.py review`）；
4. 挂起等待 WorkBuddy 独立审查判定。
