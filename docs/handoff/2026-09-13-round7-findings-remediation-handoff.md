# Round 7 审查缺陷修复与规范索引闭环交接单

> 交付日期：2026-09-13
> 对应审查：`fb21dbb`（Round 7 独立代码审查，4×P3）
> 修复范围：反代 XFF 文档与配置、悔棋超时边界原子语义与测试守门、工作流规范索引挂载

---

## 一、交付目标与背景

在 Round 7 独立代码审查中，WorkBuddy 提出了 4 项 P3 缺陷（0×P0/P1/P2）。本交接单记录对该 4 项 P3 缺陷的定向修复与闭环验证：
1. **P3-1（单级反代 XFF 论证自洽）**：纠正单级代理中 `$proxy_add_x_forwarded_for` 会导致伪造绕过的错误因果论述，明确 `$remote_addr` 覆盖的真实理由为消除格式歧义与统一多层契约；
2. **P3-2（多级代理备选方案补齐 CDN 回源前置条件）**：在 `README.md` 与配置示例中明确 `$http_cf_connecting_ip` 仅在源站已配置严格 CDN 回源 IP 防火墙白名单时可用，否则推荐首选自带 CIDR 白名单检验的 `ngx_http_realip_module`；
3. **P3-3（悔棋超时原子语义与测试守门）**：在 `room-state-machine.ts:796` 补充存活判定由 `getRoom()` 原子负责的架构注释，并在 `rooms.test.ts` 中补充超时响应 `undo-request-missing` 断言与可控时钟跨边界调用测试；
4. **P3-4（消除孤儿文档引用）**：在 `AGENTS.md` §4.2、`README.md` 文档索引与 `docs/handoff/INDEX.md` 中挂载 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md` 入站链接。

---

## 二、关键变更与落地内容

### 1. P3-1 与 P3-2：反代 XFF 规范与安全约束校准
- **`README.md:88-110`**：
  - 单级代理部分：阐明服务端采信末位 IP，`$proxy_add_x_forwarded_for` 追加的末位虽仍为真实客户端，但直接覆盖可消除客户端伪造前缀/格式异常带来的歧义；
  - 多级代理部分：将方案区分标明为「首选方案（自带来源白名单校验：realip 模块）」与「备选方案（必须强制前置防火墙限制：仅允许 CDN 回源 IP）」；
- **`deploy/openresty-gomoku.conf.example:8-22`**：
  - 同步更新英文注释，澄清单级代理追加末位与直接覆盖的区别；
  - 增加 CDN 回源安全告警注释：若源站允许公网直连，严禁直接使用 `$http_cf_connecting_ip` 覆盖。

### 2. P3-3：悔棋超时边界原子语义说明与测试守门
- **`src/server/domain/room-state-machine.ts:794-797`**：
  - 补充关键注释：存活状态统一由 `getRoom()` 入口处的 `advanceRoomLifecycle()` 推进；一旦判定请求有效且存活，本次同步操作内视为原子有效，不再重复校验 TTL，避免时钟微秒级漂移导致决策分歧。
- **`src/server/rooms.test.ts:786-847`**：
  - 测试用例 1：`expires pending undo requests as rejected after ten seconds and rejects late response`，断言超期后调用 `respondToUndo` 返回 `{ ok: false, error: { code: "undo-request-missing" } }`，且棋盘与历史完全保留不回滚；
  - 测试用例 2：`atomically processes respondToUndo when request was active upon entering lifecycle advance`，利用每次调用时钟步进 1ms 的 mock 模拟在 `expiresAt - 2` 边界跨越，断言只要进入 `getRoom` 时存活即可原子完成悔棋。

### 3. P3-4：挂载工作流规范文档入站索引
- **`AGENTS.md:83`**：在 §4.2 增加对 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md` 的链接；
- **`README.md:324`**：在文档索引列表中登记 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md`；
- **`docs/handoff/INDEX.md:50`**：在规范与流程中登记 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md`；
- 验证：`git grep "DUAL_AGENT_REVIEW_WORKFLOW"` 在三大项目入口均命中。

---

## 三、本地门禁与验证数据

本地四道工程门禁已按序完整执行并通过：
1. **TypeScript 严格类型检查**：`npx tsc --noEmit` ➔ **0 错误**
2. **ESLint 全量代码规范扫描**：`npm run lint` ➔ **0 错误 0 警告**
3. **Vitest 单元测试套件**：`npm test` ➔ **28 个测试文件全通，243 项用例全部通过**（新增 1 项边界测试）
4. **Next.js 生产构建**：`npm run build` ➔ **0 报错，SSG 与 API 路由全量预渲染构建成功**

---

## 四、遗留事项与后续流程

本阶段提交推送到远端（`Push for Review`）后，将立即调用 WorkBuddy 执行 Round 8 独立复审，待复审通过后向用户报告闭环。
