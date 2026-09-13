# Round 7 独立代码审查交接单（被审 `948d239`）

> 审查日期：2026-09-13
> 审查依据：`C:\Users\12915\.gemini\config\plugins\workbuddy-plugin\skills\workbuddy-bridge\code-review-prompt.md`
> 审查员：WorkBuddy 独立代码审查员

---

## 一、审查基本信息与通过项简述

- **被审 HEAD SHA**：`948d239338cb254224bf1d7a66d3d0288c00243f`（分支 `main`，上游 `origin/main`，`git pull --ff-only` 已同步，工作区干净）
- **基准 SHA**：`1465051f314ca6905d1e8feeac803d3a5c2ab6af`；实际 diff 范围含两个提交：`87ae2e6`（P3 修复与反代契约文档）+ `948d239`（Push for Review 契约与状态机固化），共 8 个文件、+173/-20。
- **通过项极简概况**：验收标准 2、3 已逐字核验落地（`room-state-machine.ts:798` 死分支确已移除；`IV-07` 全仓 0 命中、无孤儿引用）；独立复跑 `npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npx vitest run --pool=vmForks` 28 套 / 242 项全绿；独立设计并运行 6 项负向/边界探针（探针 A~F，含可控时钟跨超时边界、nginx XFF 变量语义仿真），其中 3 项证伪了本次改动的既有声明（见第二节），临时探针已删除、未污染工作区。
- **判定**：**审查未通过**，4×P3（详见下节）。

---

## 二、审查发现与缺陷清单

### 缺陷 1（P3-1）：单级反代 XFF 风险论证与代码策略自相矛盾，属技术性错误

- **严重级别**：P3
- **标题**：README/OpenResty 示例声称单级代理用 `$proxy_add_x_forwarded_for` 会让"攻击者伪造 XFF 绕过速率限制"，与同段声明的"末位 IP 采信"策略直接矛盾，结论不成立
- **文件与行号**：`README.md:91`（单级代理条目）、`deploy/openresty-gomoku.conf.example:8-10`（`Single-hop proxy` 注释块）
- **触发条件**：运维人员按该段文档理解反代安全性（无运行时触发，纯文档正确性缺陷）。
- **实际行为与期望行为**：
  - **实际行为**：`README.md:91` 明确写"**绝不能**使用会拼接客户端传入值的 `$proxy_add_x_forwarded_for`；否则攻击者可通过伪造 XFF 绕过速率限制"；`deploy/openresty-gomoku.conf.example:9-10` 更写成 "client-address.ts picks the last hop (split(',').at(-1)), and appending would allow client spoofing"。而同一段 `README.md:89` 已声明服务端采信**末位** IP。
  - **期望行为**：`$proxy_add_x_forwarded_for` 的 nginx 官方定义是「`$http_x_forwarded_for` 后**追加** `$remote_addr`，逗号分隔；无该头时即等于 `$remote_addr`」。因此其**末位元素恒为该层代理观测到的 `$remote_addr`（单级部署下即真实客户端 IP）**，客户端伪造值只能落在数组前部、永远被 `split(',').at(-1)` 丢弃。故单级部署下该变量**不构成伪造绕过**，文档所给因果链与其自身前提相反。
- **根因**：文档改造时把"防御性更强的写法"与"该写法的真实理由"混同——由 `$remote_addr` 覆盖是合理的纵深防御（消除歧义），但把风险归因于"可伪造"属事实错误，且未察觉与新增的末位采信说明冲突。
- **影响范围**：仅文档/运维认知层。实际部署配置（`proxy_set_header X-Forwarded-For $remote_addr`）本身安全，无运行时回归；但错误论证会误导后续审查与二次开发（例如某次"优化"改为采信首位 IP 以"防伪造"，反而立即引入真实绕过）。
- **复现方法/验证证据**：探针 D（临时 vitest，已删除）：以 nginx 语义合成头 `"203.0.113.77, 198.51.100.9"`（前段为客户端伪造、后段为 `$remote_addr` 真实客户端），`resolveClientAddress({ forwardedFor, remoteAddress: "127.0.0.1", trustProxy: true })` 返回 `198.51.100.9`（真实客户端），**非**伪造值 `203.0.113.77`。与仓库既有断言同向：`src/server/client-address.test.ts:25-32`。
- **修复建议**：改写 `README.md:91` 与 `deploy/openresty-gomoku.conf.example:8-10`：保留"用 `$remote_addr` 覆盖"的推荐，但把理由改为——(a) 语义明确、避免多层链路歧义；(b) 与多级架构保持一致。删除"否则攻击者可通过伪造 XFF 绕过速率限制"及 "appending would allow client spoofing" 两项不成立结论；可补一句**真实**风险说明：单级部署下 `$proxy_add_x_forwarded_for` 末位仍为真实客户端，风险出现在多级链路（见 P3-2）。
- **修复后验收标准**：两处文档不再出现"单级 + `$proxy_add_x_forwarded_for` ⇒ 可伪造绕过"的表述；修改后文档与 `client-address.ts:35-40` 的末位采信策略一致，且不再自相矛盾。

---

### 缺陷 2（P3-2）：多级代理备选方案 `$http_cf_connecting_ip` 缺少 CDN 源站白名单前置条件，可被直接伪造

- **严重级别**：P3
- **标题**：文档将"用 `$http_cf_connecting_ip` 覆盖 XFF"作为多级代理等价方案推荐，但未要求把入站限制为 CDN 回源地址，源站可直连时该头完全由客户端控制
- **文件与行号**：`README.md:94`（多级代理解决方案第 2 条）、`deploy/openresty-gomoku.conf.example:16-17`
- **触发条件**：采用该备选方案，且 Nginx 监听公网、未对入站来源做 CDN 网段白名单（示例配置 `listen 80;` 公网可达，Node 虽绑定 loopback，但 Nginx 本身无来源限制）。
- **实际行为与期望行为**：
  - **实际行为**：攻击者绕过 CDN 直连源站 Nginx，自行发送 `CF-Connecting-IP: <任意值>`；Nginx 依示例用该头覆盖 `X-Forwarded-For`；服务端取末位 → 限流键 `= <任意值>`，可逐请求轮换，**每请求获得全新限流桶**，速率限制形同失效（注册/聊天/枚举等所有按 IP 限流的能力）。`CF-Connecting-IP` 仅由 Cloudflare 边缘写入，源站若不做来源校验则该头等效不可信用户输入。
  - **期望行为**：文档必须显式声明该备选方案的**前置条件**——源站仅接受 CDN 回源网段（防火墙/安全组白名单），或改用第 1 条 `set_real_ip_from <CDN_CIDR>;` 方案（该方案本身自带来源白名单语义，无此问题）。
- **根因**：多级方案第 1 条（realip + `set_real_ip_from`）自带受信来源约束，第 2 条被写成"或"的等价替代，但丢掉了来源约束这一必要条件，导致安全强度不等价。
- **影响范围**：运维安全配置层。按文档原样部署该备选方案且源站未白名单时，限流防刷整体失效（非数据泄露，但属可被脚本化滥用的健壮性缺口）。
- **复现方法/验证证据**：探针 F（临时 vitest，已删除）：模拟直连源站并自设头，`resolveClientAddress({ forwardedFor: "203.0.113.77", remoteAddress: "127.0.0.1", trustProxy: true })` 返回 `203.0.113.77`（攻击者可控、可轮换），证实限流键可被任意铸造。对照探针 E：多级链路 `"198.51.100.9, 10.0.0.5"` → 返回 `10.0.0.5`（CDN 节点），证实 `README.md:92` 的"限流桶共享"论断成立（该条正确）。
- **修复建议**：`README.md:94` 该条补齐前置条件，例如改为"**仅当源站已限制为 CDN 回源网段时**，可直接用受信头覆盖：`proxy_set_header X-Forwarded-For $http_cf_connecting_ip;`；否则必须改用第 1 条的 `ngx_http_realip_module` 方案"；`deploy/openresty-gomoku.conf.example:16-17` 同步加注该前置条件（建议直接注释掉该行，或补 `# requires inbound allowlist to CDN ranges`）。
- **修复后验收标准**：两处文档明确写出"源站需限制为 CDN 网段"这一前置条件，且不再把两个安全强度不等的方案并列成无差别"或"。

---

### 缺陷 3（P3-3）：移除 `|| now >= undoRequest.expiresAt` 并非严格行为等价，超时边界语义被改变且无测试守门

- **严重级别**：P3
- **标题**：`respondToUndo` 死分支移除改变了"恰好跨过 `expiresAt`"边界的行为，且该路径在全部 242 项测试中零覆盖
- **文件与行号**：`src/server/domain/room-state-machine.ts:798`
- **触发条件**：响应方在悔棋请求 TTL 边界处提交"同意"，且**墙钟在 `getRoom()` 内部读数与 `respondToUndo` 第 786 行读数之间跨过 `expiresAt`**。
- **实际行为与期望行为**：
  - **实际行为**：`getRoom()`（`:1404`）入口无条件执行 `advanceRoomLifecycle` → `expireUndoRequest`（`:1921`）。若在该读点上 `now < expiresAt`，请求仍存活；随后 `:786` 再次取 `this.now()`。改动前该行 `if (!accepted || now >= undoRequest.expiresAt)` 会在此时判超时 → `markUndoRequestRejected`（悔棋被拒、棋盘不变）；改动后仅判 `if (!accepted)` → **悔棋照常执行**。
  - **期望行为**：任务与上一轮 handoff 均将该行定性为"不可达死分支"，隐含"移除为零行为变更"。实测该前提不成立：分支可达（仅是概率极低），移除后边界语义由"拒绝"变为"接受"。二者都不算灾难，但"纯死代码清理"的结论必须修正——要么明确该边界接受语义为**有意**并加测试固化，要么保留一次显式 TTL 判决。
- **根因**：`now` 在同一同步方法内被多次读取（`getRoom` 内 2 次 + `:786` 1 次），而 `RoomStateMachineOptions.now` 是可注入时钟，两次读数之间不存在单调性/等值保证；代码以"读一次即恒定"的假设判定分支不可达。
- **影响范围**：仅超时边界那一瞬间的悔棋接受/拒绝语义。无数据损坏、无安全影响、无状态不一致（两条路径都会正确清理 `room.undoRequest`）。生产环境撞击概率极低（`Date.now()` 毫秒分辨率下需 `expiresAt` 恰好落在 `getRoom` 读数后的 1ms 边界），但非零，且属**语义变更**而非纯清理。
- **复现方法/验证证据**：探针 B（临时 vitest，已删除）：`now` 采用"每次调用 +1ms"的可控时钟，置于 `expiresAt - 2` 启动，使 `getRoom` 的两次读数分别为 `expiresAt-2`/`expiresAt-1`（存活），`:786` 读数为 `expiresAt`（已跨界）。实测结果 `{"ok":true}`、`board[7][7]=null`、`moveSeq=0` —— **悔棋被执行**；改动前该输入必走 `markUndoRequestRejected`。补充：探针 A（远超期）返回 `undo-request-missing`，探针 C（TTL 内正常同意）行为正确，二者与改动前一致；`git grep "undo-request-missing"` 显示该错误码在 `src/`、`tools/` 全部测试中**零断言**（仅定义于 `:198`）。
- **修复建议**（择一，推荐 a）：
  - a) 承认新语义为有意设计，在第 796-798 行加注释说明"请求存活判定统一由 `getRoom` 的生命周期推进负责，本方法不再重复判 TTL"，并补 1 条测试：可控时钟跨边界调用 `respondToUndo` 断言其行为（防止未来被"修回去"）；
  - b) 若需保留原语义，在 `respondToUndo` 内改为**单次** `const now = this.now()` 并用它同时做 TTL 判决与后续逻辑（消除多次读数），而非依赖 `getRoom` 的隐式副作用。
- **修复后验收标准**：`src/server/domain/room-state-machine.ts` 中该边界的预期语义有注释与测试共同固化；测试套件对超时后 `respondToUndo`（含 `undo-request-missing`）至少 1 条断言；`tsc`/`lint`/`test` 全绿。

---

### 缺陷 4（P3-4）：新增规范文件 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md` 为孤儿文档，零入站引用

- **严重级别**：P3
- **标题**：本轮新建的"标准工作流规范"无任何文件引用（AGENTS.md / README.md / INDEX.md 均未挂载），"固化"契约实际不可达
- **文件与行号**：`docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md:1`（全文 134 行，新增）
- **触发条件**：任何读者/智能体按项目既定入口（`AGENTS.md` → `docs/handoff/INDEX.md`）检索规范时。
- **实际行为与期望行为**：
  - **实际行为**：`git grep -n "DUAL_AGENT_REVIEW_WORKFLOW"` 在**全部受版本控制文件**中 0 命中；`AGENTS.md:83`、`docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md:4` 仍只指向仓库外的绝对路径 `…\workbuddy-bridge\code-review-prompt.md`。该文件所在的 `docs/templates/` 亦是**本轮新建、目录内仅此一个文件**、全仓无任何索引登记。
  - **期望行为**：按项目既有约定（`README.md:323` 对 `docs/STANDARD_DEVELOPMENT_WORKFLOW.md` 做文档索引登记；`AGENTS.md` §2 规定交接文档须在 `docs/handoff/INDEX.md` 挂载），新增的**规范性**文档必须有入站引用，否则其固化的生命周期状态机与 Push for Review 契约无法被检索，形同未固化。
- **根因**：只创建文件、未同步任何入口索引；且本轮任务的验收标准第 3 条恰为"修复孤儿引用"，新文件却引入了同类问题的镜像形态（有文件、无引用）。
- **影响范围**：文档可发现性/一致性。`AGENTS.md` §1/§3/§4 与模板 §1/§4.1 存在同一契约的两份副本，无引用关系时极易长期分叉，后续智能体可能只读到 `AGENTS.md` 而继续按旧措辞执行。
- **复现方法/验证证据**：`git grep -n "DUAL_AGENT_REVIEW_WORKFLOW"`（0 命中）；`ls docs/templates/`（仅 1 个文件）；`git grep -n "code-review-prompt.md"` 显示唯一引用方为 `AGENTS.md:83` 与审查 handoff，均未指向新模板。
- **修复建议**：在 `AGENTS.md` §4 增加一行指向 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md`（与 §4.2 外部模板路径并列，标明"项目内标准工作流规范"）；并在 `README.md` 文档索引段与 `docs/handoff/INDEX.md` 各补 1 条登记。
- **修复后验收标准**：`git grep "DUAL_AGENT_REVIEW_WORKFLOW"` 至少命中 1 处项目入口文件（AGENTS.md 或 README.md），且 `docs/handoff/INDEX.md` 有对应条目。

---

## 三、待确认风险与未验证项

1. **未验证项：验收标准第 4 条中的"全局规则"载体**。该载体在本仓库中无受版本控制的对应文件（`.workbuddy/` 仅放行 `memory/`，`.agents/` 为空，`.codex/` 已被 `.gitignore` 忽略），其是否更新无法从本次 diff 与仓库现状核验。**需要什么条件才能验证**：提供该全局规则文件的实际路径。**残余风险**：若该载体未同步，生命周期状态机在仓库外仍可能保留"Push 即交付"的旧措辞。
2. **残余风险（低）**：`README.md` 中反代段落存在既有结构瑕疵——以冒号结尾的引导句（"…并保留 WebSocket upgrade："）后直接接入了 XFF 说明段落，句意未闭合。该项由 `1465051` 之前即存在，非本轮引入，未计入缺陷，仅记录。
3. 无 P0/P1/P2 级别风险；双玩家掉线即时销毁、RTL 复杂排版两项前序残余风险本轮未涉及，维持原评估。

---

## 四、推荐修复顺序与复审验收标准

**推荐修复顺序**（文档类可批量提交，代码类单独验证）：
1. **P3-2**（安全前置条件缺失，优先级最高）→ `README.md:94` + `deploy/openresty-gomoku.conf.example:16-17`；
2. **P3-1**（同一段落的错误论证，与 P3-2 同批修改）→ `README.md:91` + `deploy/openresty-gomoku.conf.example:8-10`；
3. **P3-3**（代码语义 + 测试守门）→ `src/server/domain/room-state-machine.ts:796-798` 与对应测试；
4. **P3-4**（索引挂载）→ `AGENTS.md` §4 / `README.md` 文档索引 / `docs/handoff/INDEX.md`。

**复审验收标准（Round 8 需逐项证伪）**：
1. 单级/多级两处文档不再出现与"末位采信"矛盾的可伪造结论，且多级备选方案带明确来源白名单前置条件；
2. `room-state-machine.ts:798` 的边界语义有注释说明，且测试套件对"超时后 `respondToUndo`"至少 1 条断言（须实际失败于旧实现方可视为有效守门）；
3. `git grep "DUAL_AGENT_REVIEW_WORKFLOW"` 在项目入口文件命中，`docs/handoff/INDEX.md` 有条目；
4. 四道门禁（`tsc`/`lint`/`test`/`build`）全绿；`STATUS.md`、`docs/handoff/INDEX.md` 同步刷新且量化数据经 `wc -l` 复核。
