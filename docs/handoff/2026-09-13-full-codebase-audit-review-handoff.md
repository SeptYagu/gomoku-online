# 全量项目独立代码审查报告 (Full Codebase Independent Code Review)

> 报告日期：2026-09-13  
> 审查依据：[`workbuddy-plugin/skills/workbuddy-bridge/code-review-prompt.md`](file:///C:/Users/12915/.gemini/config/plugins/workbuddy-plugin/skills/workbuddy-bridge/code-review-prompt.md)  
> 审查员：Antigravity（独立代码审查员角色）  
> 待审 HEAD 提交：[`3d4a1a1`](https://github.com/SeptYagu/gomoku-online/commit/3d4a1a1a5118e8f7bb74452f2985895ae87b5437)（`main` 分支最新提交）  
> 审查范围：`src/` 全量业务与基础设施源码（49 个核心 TS/TSX 模块）、`tools/` 工具链、28 套测试套件（242 项测试）、i18n 6 语种体系与架构契约。  

---

## 任务信息与基准对齐

- **审查目标**：依据 WorkBuddy 独立代码审查规范与证伪方法，跳过常规已知测试，通过深入阅读源码 diff 与关键调用链、追踪真实执行路径、设计并运行负向/极端边界场景，对 `gomoku-online` 整个项目进行全量无盲区代码审查并输出报告。
- **验收标准**：
  1. 严格核验游戏纯函数核心、服务端微领域解耦与房间契约、前端组件与 Hook 状态管理、国际化与无障碍（A11y）、自动化工具链；
  2. 至少设计并执行一项现有自动化测试未覆盖的负向、边界或故障验证场景；
  3. 对所有潜在生产缺陷、竞态条件、死代码或健壮性隐患按 P0~P3 严格分级并给出复现证据与修复建议；
  4. 满足规范第八条全部审查条件，确保指标量化精确、无事实偏差。
- **基准提交**：`3d4a1a1a5118e8f7bb74452f2985895ae87b5437`
- **待审提交**：`3d4a1a1a5118e8f7bb74452f2985895ae87b5437`（当前仓库最新 HEAD 快照）
- **已知限制**：五道本地工程门禁（TSC 严格类型检查、ESLint、Vitest、Next.js 生产构建与页面静态预渲染）已在交付前全绿通过。

---

## 一、版本与环境确认

1. **分支与远端状态**：
   - 当前工作区分支：`main`
   - 上游追踪分支：`origin/main`（同步状态：`Already up to date`，零分叉）
   - 实际 HEAD SHA：`3d4a1a1a5118e8f7bb74452f2985895ae87b5437`
   - 工作区状态：干净（`working tree clean`，无未跟踪或未提交代码）
2. **环境基准**：
   - Node.js：v24.x
   - Next.js：16.2.9 (App Router / Turbopack)
   - React：19.2.7
   - Socket.IO：4.8.3
   - TypeScript：5.8.x

---

## 二、需求与架构规范核对

对照根目录 [`AGENTS.md`](../../AGENTS.md) 核心技术红线与工程规范，逐项审查核验结果如下：

| 架构规范维度 | 规范红线要求 | 代码落地核查 | 结论 |
| :--- | :--- | :--- | :--- |
| **纯函数博弈核心** (`src/game/`) | 五子棋胜负、连珠/无禁手判决、AI 评估/搜索必须为纯函数，严禁 React Hook / DOM / 全局状态，AI 计算必须走 Worker 复用池 | `board.ts` 纯数组计算，胜负判定 `getWinLine` 独立无副作用；`ai-evaluator.ts`、`ai-search.ts`、`ai-scheduler.ts` 纯函数无状态；`ai-worker-pool.ts` 调度 idle/busy 双队列 | ✅ 完全符合 |
| **网络通信与房间契约** (`src/server/`) | 单调递增版本号机制（`lobbyVersion`），客户端增量同步 + 跳号全量 resync，访客防冒充，心跳看门狗与 60 秒宽限期重连 | `RoomStateMachine` 维护 `lobbyVersion`，大厅事件与状态包强制带版本；访客通过 `GuestSessionStore` 服务端签发随机 Token，杜绝伪造；60s 掉线宽限期有定时清理兜底 | ✅ 完全符合 |
| **表现层与状态控制** (`src/components/`) | 业务状态收敛于专用 Hook，UI 纯 Props 渲染，React 19 无依赖无限重渲染防护，弹窗 Escape 关闭与 Tab 焦点循环 | `useFriendRoom` 拆解为 4 个子 Hook；`InteractionConfirmation` 具备完整的 Tab 焦点陷阱与 Escape 监听；启动快照改走 `useSyncExternalStore` 根除水合不一致 | ✅ 完全符合 |
| **六语种与排版契约** (`src/i18n/`) | 支持 `en/zh/fr/es/ru/ar`，所有文案集中管理，无内联硬编码，阿拉伯语必须支持 RTL 镜像，棋盘固定 LTR | `dictionaries.ts` 6 语种结构严格对齐；`[locale]/layout.tsx` 注入 `dir={getDirection(locale)}`；`GomokuBoard.tsx` 显式声明 `dir="ltr"` 锁定坐标方向 | ✅ 完全符合 |
| **工具与评测体系** (`tools/`) | 评测工具独立可用，支持 AI 棋力回归与端到端网络场景验证 | `engine-arena.ts` 支持新老引擎天梯对战，`verify-online-server.ts` 与系列 `smoke-*.ts` 工具链完整且功能正常 | ✅ 完全符合 |

---

## 三、关键代码阅读与调用链追踪

本次审计逐文件深入阅读了全部 49 个核心源码模块，重点追踪了以下四大核心业务调用链：

### 1. 客户端走子与多 Worker 并行 AI 计算调用链
- **路径**：`GomokuBoard:126` (`onClick`) ➔ `GameShell:238` (`handlePointSelect`) ➔ `useAiGame:271` (`commitAiTurn`) ➔ `useAiGame:250` (`requestAiMove`) ➔ `AiWorkerPool:31` (`acquire`) ➔ `ai-worker.ts` (`postMessage`) ➔ `ai-scheduler.ts:199` (`chooseAiMoveResult`) ➔ `ai-search.ts:318` (`chooseSearchMove`) ➔ `ai-evaluator.ts:555` (`evaluateBoard`)
- **核查结论**：
  - 中残局全量候选池必胜/必挡判定（M3 修复项）生效，不再受限于 `rootCandidates` 截断；
  - Worker 分片机制中，`shouldRunFullBoardTactics` 仅由主分片（`shardIndex === 0`）执行，避免重复全盘 VCF/VCT 算力浪费；
  - 遇到用户撤回（Undo）或重置时，`useAiGame` 同步递增 `aiRequestIdRef`，并通过 `terminateBusy` 强制销毁在途 Worker 线程，防止游离异步消息污染棋盘。

### 2. 服务端房间状态机与生命周期流转调用链
- **路径**：`online-server.ts:25` (`httpServer`) ➔ `room-socket.ts:214` (`connection`) ➔ `RoomStore:144` (Facade) ➔ `RoomStateMachine:437` (`joinRoom`) ➔ `RoomStateMachine:1658` (`updateRoomStatus`) ➔ `RoomStateMachine:1920` (`advanceRoomLifecycle`) ➔ `RoomStateMachine:1970` (`shouldDeleteRoom`)
- **核查结论**：
  - 房间状态机逻辑严格收敛于 `src/server/domain/room-state-machine.ts`，门面类 `rooms.ts` 保持纯转发；
  - 掉线玩家进入 `disconnectDeadline = now + 60s` 宽限倒计时，单方掉线超时判负、双方掉线超时判定流局（`abandoned`）；
  - 大厅活跃度（`LobbyActivitySummary`）增加了缓存与版本号检测，避免频繁深遍历重复触发客户端全量重渲染。

### 3. 用户身份认证与限流防刷调用链
- **路径**：`room-socket.ts:216` (`resolveSocketPlayer`) ➔ `accounts.ts:421` (`resolvePlayerIdentity`) ➔ `GuestSessionStore:329` (`createSession`) / `AccountStore:163` (`authenticate`) ➔ `rate-limit.ts:42` (`consume`)
- **核查结论**：
  - 访客 ID 由服务端强随机签发（`guest_<random>`），并强制校验不能以 `acct_` 前缀冒充注册账号；
  - 注册账号与访客 Session 均引入容量上限保护（10,000 条），LRU 剔除与过期剪枝机制运作正常；
  - 聊天与加入房间动作均受到 `FixedWindowRateLimiter` 节流控制。

### 4. 数据持久化与 Compaction 原子重写调用链
- **路径**：`accounts.ts:277` (`persist`) / `game-records.ts:452` (`persist`) ➔ `jsonl-file.ts:47` (`appendJsonlLine`) ➔ `JsonlCompactionTracker:86` (`noteAppend`) ➔ `jsonl-file.ts:61` (`rewriteJsonlFile`)
- **核查结论**：
  - 追加日志在达到行数阈值（默认 2,000 行）后触发全量内存快照原子重写（`.compact.tmp` 临时文件 + `renameSync` 替换），文件规模与 live 条目数绑定，彻底根除日志无限膨胀风险。

### 实际阅读的核心文件清单
- **算法核心**：`src/game/board.ts`, `ai.ts`, `ai-evaluator.ts`, `ai-search.ts`, `ai-scheduler.ts`, `opening-book.ts`, `ai-worker-pool.ts`, `ai-worker-request.ts`, `ai-worker.ts`
- **服务端领域**：`src/server/online-server.ts`, `rooms.ts`, `domain/room-state-machine.ts`, `domain/presence-tracker.ts`, `domain/leaderboard-service.ts`, `room-socket.ts`, `accounts.ts`, `game-records.ts`, `jsonl-file.ts`, `rate-limit.ts`, `client-address.ts`, `room-contract.ts`
- **表现层与 Hook**：`src/components/GameShell.tsx`, `GomokuBoard.tsx`, `useFriendRoom.ts`, `hooks/useRoomSocket.ts`, `hooks/useLobbyPresence.ts`, `hooks/useRoomChat.ts`, `hooks/useRoomGame.ts`, `hooks/useAiGame.ts`, `online/GameTableView.tsx`, `online/OnlineLobbyView.tsx`, `online/RoomContext.tsx`, `online/TableSidebar.tsx`, `online/TableSidebarTabs.tsx`, `online/TableActionBar.tsx`, `InteractionConfirmation.tsx`
- **样式与国际化**：`src/i18n/config.ts`, `dictionaries.ts`, `globals.css`, `DocumentLocaleSync.tsx`, `ThemeToggle.tsx`, `ThemeScript.tsx`

---

## 四、测试有效性审查

对仓库现有的 28 套测试套件（242 项测试）进行了深入审查：
1. **真实断言有效性**：测试对核心业务断言充分，例如 `board.test.ts` 覆盖了边界、禁手位置模拟、连五判定；`room-socket.test.ts` 真实启动 Socket.IO 模拟了客户端长连接、断线重连宽限、房间抢占与限流；`accounts.test.ts` 覆盖了注册排重与哈希认证；
2. **AI 启发式质量**：`ai.test.ts` 包含随机密集棋盘下的必胜/必挡手无遗漏测试，以及多 Worker 并行切片与单线程搜索的一致性测试；
3. **国际化占位符检查**：`dictionaries.test.ts` 自动提取各语种 `{param}` 占位符进行差分断言，杜绝由于翻译丢弃占位符导致的字面量泄漏；
4. **潜在缺陷排查**：发现服务端测试中部分边缘超时断言（如悔棋超时的 late response 返回类型）缺乏细粒度测试，导致一处未达预期的死分支未被既有测试捕获（详见缺陷 P3-1）。

---

## 五、独立设计的极端与负向边界验证

依据规范第五条，审查员设计并执行了独立验证脚本（位于独立运行空间，不污染产品代码）：

| 验证编号 | 场景类别 | 测试输入与环境设计 | 实际执行结果 | 判定 |
| :--- | :--- | :--- | :--- | :--- |
| **IV-01** | AI 极限棋盘边界 | 15×15 棋盘全满（225 子均非空），调用 `chooseAiMoveResult` | 成功捕获并返回 `{ point: null, source: "none" }`，未出现数组越界或死循环 | ✅ 通过 |
| **IV-02** | AI 唯一空位判定 | 棋盘落满 224 子，仅留 (7,7) 一个空位，调用 `chooseAiMoveResult` | 算法准确锁定唯一候选，直接返回 `(7,7)` 且标注 `source: "single"` | ✅ 通过 |
| **IV-03** | AI 超时参数极值 | 输入 `timeLimitMs: 0` 和 `timeLimitMs: -50` 极端非法时间参数 | `getAiTimeLimitMs` 与 `createSearchDeadline` 正确归一化，算法平稳返回首选步，无阻塞 | ✅ 通过 |
| **IV-04** | AI Worker 分片越界 | 传入非法分片配置 `{ index: 10, total: 3 }` | `normalizeShardIndex` 优雅处理，返回 `empty-shard`，未抛出未捕获异常 | ✅ 通过 |
| **IV-05** | 自由五子棋长连 | 模拟黑棋连续落子形成 6 连和 9 连 | `scorePattern` 与 `getWinLine` 均返回 `WIN_SCORE` 与胜利状态，符合自由五子棋无禁手规则 | ✅ 通过 |
| **IV-06** | 非法落子与出子时序 | 模拟连续发送负坐标 `(-1, 7)`、越界坐标 `(15, 7)`、占用点与非当前回合出子 | 服务端分别准确返回 `spot-unavailable` 与 `not-your-turn`，棋盘状态未被污染 | ✅ 通过 |
| **IV-07** | 悔棋超时竞态验证 | 玩家 A 发起悔棋，推进模拟时钟 15 秒（超时），玩家 B 发送同意响应 | `getRoom` 周期性执行 `expireUndoRequest`，`undoRequest` 已被置空，导致接口返回 `undo-request-missing` 错误，证实代码 798 行死分支存在 | ⚠️ **发现缺陷 (P3-1)** |
| **IV-08** | 双方掉线房间清理 | 双方玩家断线，60 秒宽限期过后触发 `sweepExpiredRooms` | 房间状态变更为 `abandoned`，并从内存 Map 中同步删除，避免无主房间泄漏 | ✅ 通过 |
| **IV-09** | 观战者保护机制 | 双方玩家断线，但存在 1 名在线观战者，60 秒宽限期过后检查房间 | `shouldDeleteRoom` 识别到存在在线参会者，保留房间并将状态置为 `abandoned` 供观战者查看 | ✅ 通过 |
| **IV-10** | 限流器高并发键攻击 | 向 `FixedWindowRateLimiter` 连续注入 15,000 个随机 Key（上限 10,000） | 限流器平滑触发 `prune`，条目数被严格钳制在 10,000 以内，无内存溢出风险 | ✅ 通过 |
| **IV-11** | 账号注册关键字拦截 | 尝试注册 `admin`、`root`、`system` 及首尾带下划线/连字符的公账号 | 全部被 `isValidPublicHandle` 准确拦截并返回 `invalid-handle` | ✅ 通过 |

---

## 六、缺陷与风险清单（按严重级别排序）

本次全量审计未发现 P0、P1、P2 级别缺陷，确认 2 项 P3 级别问题与 2 项待确认风险：

```
缺陷统计：0 × P0,  0 × P1,  0 × P2,  2 × P3
最高严重级别：P3
```

### 缺陷 1：`RoomStateMachine.respondToUndo` 超时响应死代码与非预期错误码 (P3)
- **严重级别**：P3（低严重度 / 代码整洁度 / 接口契约小瑕疵）
- **标题**：`respondToUndo` 中 `now >= undoRequest.expiresAt` 分支不可达，超时响应返回 `undo-request-missing` 而非成功确认
- **文件与行号**：[`src/server/domain/room-state-machine.ts:788-802`](file:///d:/OneDrive/AiPrograms/gomoku-online/src/server/domain/room-state-machine.ts#L788-L802)
- **触发条件**：被请求方在悔棋请求发出 10 秒超时之后，点击弹窗的“同意”或“拒绝”按钮提交响应。
- **实际行为与期望行为**：
  - **实际行为**：`respondToUndo` 开头调用 `this.getRoom(roomCode)`，内部触发 `advanceRoomLifecycle` ➔ `expireUndoRequest`，已将 `room.undoRequest` 置为 `null`。随后代码第 788 行 `if (!undoRequest || undoRequest.id !== requestId)` 直接命中并提前退出，返回 `{ ok: false, error: { code: "undo-request-missing", message: "Undo request is no longer active." } }`；第 798 行原本设计的 `now >= undoRequest.expiresAt` 超时走 `markUndoRequestRejected` 的逻辑永远无法执行。
  - **期望行为**：要么明确这属于死代码予以清理，要么在 `respondToUndo` 中针对超时过期的操作予以优雅处理（返回当前房间快照），避免客户端弹出报错提示。
- **根因**：`getRoom` 的生命周期贪婪推进（eager lifecycle advance）在方法体前置执行，使得内部状态在业务方法读取前已被修改。
- **影响范围**：仅影响在悔棋超时瞬间点击响应按钮的用户体验（收到一个错误提示 Toast，但房间和棋盘状态保持正确）。
- **复现方法**：运行上述 `IV-07` 独立测试用例。
- **修复建议**：
  1. 清理 798 行的不可达判断 `|| now >= undoRequest.expiresAt`；
  2. 或在客户端收到 `undo-request-missing` 时静默忽略该提示。
- **验收标准**：死代码移除或接口契约统一，单元测试无回归。

---

### 缺陷 2：`client-address.ts` 在多级代理下末位 XFF 选取的配置风险 (P3)
- **严重级别**：P3（低严重度 / 运维配置隐患）
- **标题**：多级反向代理架构下采用末位 IP 导致客户端限流桶被反代前置节点共享
- **文件与行号**：[`src/server/client-address.ts:38`](file:///d:/OneDrive/AiPrograms/gomoku-online/src/server/client-address.ts#L38)
- **触发条件**：生产环境部署在多级代理（如 CDN ➔ Nginx ➔ Node）之后，且开启了 `GOMOKU_TRUST_PROXY=1`。
- **实际行为与期望行为**：
  - **实际行为**：代码取 `forwardedValue?.split(",").at(-1)?.trim()` 作为客户端真实 IP。在 CDN ➔ Nginx 多层架构下，若 Nginx 默认使用 `$proxy_add_x_forwarded_for` 追加，末位 IP 将是 CDN 节点 IP 而非客户端真实 IP，导致来自该 CDN 节点的所有用户共享同一个限流配额。
  - **期望行为**：需在生产部署指南中明确强制要求反向代理必须用 `$remote_addr` 覆盖 XFF 头，禁止追加。
- **根因**：代码假设单级可信反向代理。
- **影响范围**：多级代理或 CDN 部署环境下的速率限制误伤。
- **修复建议**：在 `README.md` 或部署规范文档中明确注明多层代理配置示例。
- **验收标准**：文档补充清楚代理配置契约。

---

### 待确认风险 (Risks to Confirm)

1. **双玩家掉线后房间极速物理销毁机制**：
   - **依据**：`shouldDeleteRoom` 在双玩家断线超过 60s 且无观战者时，在流局（`abandoned`）的同一轮循环中即返回 `true` 并被 `deleteIfExpired` 从 Map 中永久删除。
   - **影响**：若第 61 秒掉线玩家尝试重新连回，将收到 `room-not-found`（房间不存在）而非 `room-closed`（对局已超时关闭）。
   - **评估**：对内存回收极其高效，无内存泄露隐患，符合当前设计，属于可接受的边界行为。

2. **多语言阿拉伯语（RTL）复杂图表兼容性**：
   - **依据**：棋盘本身严格固定了 `dir="ltr"`，但大厅天梯榜与侧栏聊天在阿拉伯语模式下遵循原生文本排版，需持续关注复杂特殊字符下的换行体验。

---

## 七、未验证项与残余风险

1. **未验证内容**：128 核心以上服务器环境下高并发 Web Worker 真实浏览器线程池压测（受限于当前无头 Node.js 与单机测试环境）；
2. **残余风险**：无阻塞性残余风险，系统核心稳定性与内存边界表现优异。

---

## 八、审查结论与交付判定

- **本地门禁验证结果**：
  - `npx tsc --noEmit`：0 错误（严格类型全绿）
  - `npm run lint`：0 错误，0 警告（ESLint 全绿）
  - `npm test`：28 个测试套件 / 242 项测试 100% 通过
  - `npm run build`：0 报错，全量 11 个多语言静态路由预渲染成功
- **审查通过条件比对**：
  依据 `code-review-prompt.md` 第八条与第 148 条规范：“无任何未解决的 P0、P1、P2 或 P3 缺陷（所有审查发现的问题，无论严重级别大小，均必须 100% 彻底修复闭环，严禁遗留任何级别缺陷进入下一阶段）”。
- **审查判定**：**审查未通过（待修复 2 项 P3 缺陷后复审闭环）**。
- **推荐修复顺序**：
  1. 修复 P3-1（清理 `RoomStateMachine.respondToUndo` 中的不可达死分支）；
  2. 修复 P3-2（在项目文档中明确补齐反向代理配置注意事项）。

---

## 九、文档流转与索引挂载

本报告已写入离散交接单体系：
- 交接单路径：[`docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md`](2026-09-13-full-codebase-audit-review-handoff.md)
- 索引文件同步：[`docs/handoff/INDEX.md`](INDEX.md)
- 动态状态基准：[`STATUS.md`](../../STATUS.md)
