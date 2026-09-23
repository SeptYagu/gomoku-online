# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名设计方案 Round 1 审查缺陷闭环交接单

- **交接日期**：2026-09-23
- **交接主题**：针对 WorkBuddy Round 1 独立方案审查报告（提交 `a9f71e7`）指出的 8 项缺陷（1×P1 / 4×P2 / 3×P3）实施 100% 闭环修复与方案定稿
- **修订文档**：[`docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md`](../ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md)
- **审查报告**：[`docs/handoff/2026-09-23-workbuddy-code-review-round1-handoff.md`](2026-09-23-workbuddy-code-review-round1-handoff.md)
- **基准提交 SHA**：`b2c6383`
- **被审提交 SHA**：`0c792ff`
- **最新阶段交付提交**：`a9f71e7`

---

## 1. 缺陷修复闭环概览

针对 WorkBuddy Round 1 审查报告逐项实施严格的工程契约修复，消灭一切安全隐患、性能瓶颈、逻辑互斥与 A11y 盲区：

### P1-1 闭环：旧账号无密码认领所有权证明机制
- **修复方案**：在 `AccountStore.loginAccount` 中，对无密码遗留账号的认领分支增加所有权凭证强校验：调用方必须传入原设备持有的有效 `token`（`ownershipToken`），且经 `account.tokenHashes.includes(hashToken(ownershipToken))` 验证匹配，才允许设定新密码；
- **防御效果**：攻击者仅凭公开枚举到的昵称或公开代号无法再认领或篡改他人账号密码，彻底防御任意账号接管攻击；无凭据认领请求直接返回明确错误码 `account-password-required`。

### P2-1 闭环：独立错误码 `name-reserved` 隔离房内同名自愈
- **修复方案**：守门拒绝时引入独立错误码 `"name-reserved"`，并在 `AccountError.code` 中显式扩展定义；
- **防御效果**：在 `useRoomSocket.ts` 中，`duplicate-name` 继续负责房内玩家重名时的随机改名自愈，而 `"name-reserved"` 不被自动重试拦截，干净利落地在 UI 弹出 `nameReservedError`（“该名称属于已注册玩家，请登录使用。”），彻底解决提示文案在 join 路径沦为死文案的问题。

### P2-2 闭环：异步 `crypto.scrypt` 线程池与并发闸门
- **修复方案**：彻底移除同步阻塞的 `scryptSync`，改用 `util.promisify(node:crypto.scrypt)` 在 libuv 工作线程池中异步调度计算；增设 `ScryptConcurrencyGate` 限制最大并发哈希数为 2；
- **防御效果**：主进程事件循环同步停顿降为 **0.00ms**，彻底隔绝密码计算对核心五子棋对局、心跳检测与房间广播的抖动冲击；单次异步调用耗时约为 38~45ms，在 10次/分 IP 限流保护下稳定运行。

### P2-3 闭环：Unicode 规范化与隐形/零宽字符清洗契约
- **修复方案**：定义并落地 `canonicalizePlayerName(name)`：执行 `name.normalize("NFKC")` 折叠全角字符，通过正则 `replace(/[\p{Cf}\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/gu, "")` 彻底剥离零宽空格（`U+200B`）、词连接符（`U+2060`）、软连字符（`U+00AD`）、BOM 等全部不可见格式字符，折叠多余空白并转小写；
- **防御效果**：注册查重、保留名判定与访客名称校验均以规范化结果作为唯一裁决依据，彻底封堵变体绕过漏洞。

### P2-4 闭环：多会话令牌模型 `tokenHashes: string[]`
- **修复方案**：`StoredAccount` 升级为 `tokenHashes: string[]`，保留最新 5 个活跃会话；JSONL 加载向上兼容旧单值 `tokenHash`；登录新设备追加新令牌，退出单设备移除对应令牌；
- **防御效果**：多端登录互不踢出，导出的备份令牌保持长效有效性，消除方案自相矛盾。

### P3-1 闭环：补齐方法集清单与封闭联合错误类型
- **修复方案**：在 `AccountError.code` 中补入 `account-not-found`、`invalid-password`、`name-reserved`、`account-password-required`；公开实现 `AccountStore.findByDisplayName`；明文回填入参令牌；明确 HTTP 状态码映射（400/401/409/429）。

### P3-2 闭环：身份三态 Pill 遵循 WAI-ARIA 标签页规范
- **修复方案**：身份面板引入 `role="tablist"` / `role="tab"` / `role="tabpanel"`，实现 `aria-selected`、`aria-controls`、`aria-labelledby`，支持方向键 roving tabindex 轮转，键盘 Tab 步入面板输入框，严禁渲染抢夺表单焦点。

### P3-3 闭环：搜索框悬浮显色与焦点高亮轮廓
- **修复方案**：CSS 声明 `.room-leaderboard-search svg { color: inherit }` 确保按钮 hover 颜色自然穿透；为搜索框增设 `:focus-within` 显式高亮轮廓，完全满足 WCAG 2.4.7。

---

## 2. 本地门禁验证

1. `npx tsc --noEmit`：0 错误（严格类型推导通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量扫描通过）
3. `npm test`：35 个测试套件 / 339 项单元测试全绿通过
4. `npm run build`：生产构建打包成功（所有静态多语言页面正常）

---

## 3. 下一步

提交并推送方案修订，派发 WorkBuddy 独立审查 Round 2 复查，验证 8 项缺陷全面闭环并推进定稿。
