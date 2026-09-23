# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案交接单

- **交接日期**：2026-09-23
- **交接主题**：联机对战命名规范（Online PVP）、排行榜搜索框限宽与按钮遮挡修复、已注册账号密码体系与登录（Login API）、访客防冒名服务端裁决技术设计方案
- **设计文档**：[`docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md`](../ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md)
- **交付类型**：**需求与技术设计方案（Technical Design / Proposal）**，本次交付仅包含设计规范、交接单与状态表同步，源码尚未进入实现阶段。
- **基准提交 SHA**：`b2c6383`（`docs: record feedback button label Round 7 review PASS verdict in STATUS.md`）

---

## 1. 交付目标与背景

针对用户在体验联机模块时反馈的四大核心问题，开展端到端的技术架构与交互契约设计：

1. **“Friend room” 命名更正为 “Online PVP”**：
   - 现有名词“好友房”过于狭隘，无法涵盖模块现已具备的大厅对局列表、全网实时匹配队列、全服天梯排行榜、公聊频道与访客列表；
   - 在 `dictionaries.ts` 6 种官方语言中将 `modes.room` 与 `room.panelLabel` 统一演进为“联机对战”（Online PVP）；
2. **排行榜搜索框横向过长与放大镜按钮遮挡修复**：
   - `.room-leaderboard-search` 无宽度上限导致横向被撑满整个面板；
   - 搜索按钮套用全局 `.icon-button`（`min-width: 56px`）后塞入 `18px` Grid 列，溢出 38px 并带不透明底色直接遮盖输入框与文字；
   - 规范 `.room-leaderboard-search` 限宽至 280px，彻底重置内嵌按钮样式至 20px 嵌入态，消除遮盖并保障键盘与鼠标点击无障碍；
3. **已注册玩家登录体系（Login API + 密码认证）**：
   - 当前账号体系仅有注册与 Bearer 令牌校验，无密码与登录机制，客户端清理缓存或更换设备即永久丢失账号；
   - 引入原生 `node:crypto` 加盐与 `scryptSync` 密码哈希模型；
   - 升级 `AccountStore` 支持密码存储，新增 `loginAccount` 方法；
   - 新增 `POST /api/account/login`（挂载 10 次/分钟防爆破限流器）；
   - 支持无密码旧账号在首次登录时认领并设定密码，平滑向下兼容；
   - 大厅身份展开面板提供清晰的“访客”、“登录”、“注册”三态切换以及令牌备份导出；
4. **访客冒用已注册玩家昵称漏洞封堵**：
   - 现有系统允许访客在输入框随意填写已注册玩家昵称并正常参与联机、发言与对局；
   - 在 `AccountStore` 开放 `isNameReserved(name)` 查重；
   - 在 `resolvePlayerIdentity` 裁决守门：未携带合法注册凭据的访客若尝试以已注册账号名称或代号建立会话，直接返回 `duplicate-name` 错误拦截，彻底杜绝冒名顶替。

---

## 2. 关键架构与数据契约设计

详见技术设计方案全文：[`docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md`](../ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md)。

### 2.1 六语种国际化契约
- 模式名称与面板标题：`en`: "Online PVP" / `zh`: "联机对战" / `fr`: "PVP en ligne" / `es`: "PVP online" / `ru`: "Онлайн PVP" / `ar`: "مبارزة عبر الإنترنت"；
- `RoomDictionary` 扩充：`loginAccount`, `loginTab`, `registerTab`, `accountPassword`, `accountPasswordPlaceholder`, `accountIdentifier`, `accountIdentifierPlaceholder`, `copyAccountToken`, `accountTokenCopied`, `nameReservedError`。

### 2.2 排行榜搜索框样式契约
- `.room-leaderboard-search`：`max-width: 280px; width: 100%; grid-template-columns: 20px minmax(0, 1fr); padding: 6px 10px;`；
- `.room-leaderboard-search .icon-button`：重置为背景透明、无边框、无阴影、宽高均为 20px 的居中按钮，完全贴合 Grid 单元格，消除悬浮重叠。

### 2.3 服务端账号密码与防冒名契约
- `StoredAccount` 扩充可选 `passwordHash` 与 `passwordSalt`；
- `AccountStore.createAccount` 支持输入可选密码并加盐哈希落盘；
- `AccountStore.loginAccount` 支持凭名称/代号/ID+密码或令牌进行登录，支持无密码遗留账号认领；
- `AccountStore.isNameReserved` 提供公开查重；
- `resolvePlayerIdentity` 严格校验访客 `playerName`，对命中保留名者坚决抛出 `duplicate-name` 错误阻断。

### 2.4 登录接口与速率限制
- `POST /api/account/login`：接收 `{ identifier, password?, token? }`；
- 独立配置 `FixedWindowRateLimiter` 限制 10 次/分钟/IP，防御暴力枚举。

---

## 3. 本地门禁基线验证

本次交付仅包含技术设计规范文档、交接单与状态表更新，源码零改动。基线门禁验证状态：

1. `npx tsc --noEmit`：0 错误（严格类型推导通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量扫描通过）
3. `npm test`：35 个测试套件 / 339 项单元测试全绿通过（100% 稳定）
4. `npm run build`：生产构建完全成功（所有多语言 SSG 预渲染页面正常）

---

## 4. 下一步与实施路线

设计方案经 WorkBuddy 双智能体独立审查通过并收敛定稿后，正式推进至代码实现与自动化测试落地阶段：
1. 阶段 1：字典与国际化规范落地；
2. 阶段 2：CSS 样式修复与排行榜搜索框优化；
3. 阶段 3：服务端密码认证与防冒名裁决逻辑实现；
4. 阶段 4：HTTP 登录路由与限流挂接；
5. 阶段 5：客户端交互与大厅登录/注册整合；
6. 阶段 6：自动化守门单测与四道门禁复跑交付。
