# STATUS.md

> 本文件是本仓库唯一权威的动态事实基准（Single Source of Truth），随时反映当前分支的最新工程状态。

---

## 1. 当前版本与环境快照

- **当前分支与 HEAD**：`main`（以 `git rev-parse --short HEAD` 实时为准；双字段规则：「`当前 HEAD` 以 `git rev-parse` 实时为准；`最新阶段交付提交` 记录本字段所在提交的直接前驱阶段交付，每次阶段交付在下一次提交回填」）
- **上游远端**：`git@github.com:SeptYagu/gomoku-online.git`
- **最新阶段交付提交**：`bca7674 fix(lobby): resolve round 2 review findings for unlisted room creation disambiguation`（本字段记录本字段所在提交的直接前驱阶段交付；本提交为 Round 3 复查缺陷修复交付，其 SHA 由下一次交付回填）
- **环境基准**：
  - Node.js v24.x
  - npm 11.x
  - TypeScript 5.8.x
  - Next.js 16.2.9
  - React 19.2.7
  - Socket.IO 4.8.3

---

## 2. 门禁基线指标（当前全绿）

- **TypeScript 编译检查** (`npx tsc --noEmit`)：0 错误（严格类型推导，无逆变与缺少属性）
- **代码规范检查** (`npm run lint`)：0 错误，0 警告（严格遵守 React 19 Hooks 规则）
- **单元测试** (`npm test`)：29 个测试套件 / 248 项用例 100% 通过（新增 LobbyMatchmaking 3 项组件结构与 A11y 测试全绿）
- **生产构建** (`npm run build`)：打包成功，所有多语言路由静态预渲染正常
- **联机时序烟测** (`npm run verify:online` + `smoke:lobby` + `smoke:matchmaking`)：全绿通过

---

## 3. 近期已交付里程碑

- 🔄 **Round 3 审查缺陷修复与分隔带断言精准化（2026-09-16）**：针对 Round 3 复查指出的 1 项 P3 缺陷完成闭环：P3-1 将 `LobbyMatchmaking.test.ts` 中针对分隔带单字连接词 `orJoinExisting` 的宽泛 `toContain` 断言重构为精确的 HTML 正则标签捕获（`/<div class="lobby-friend-divider" aria-hidden="true"><span>([^<]*)<\/span><\/div>/`），精准校验 `dividerMatch[1]` 与当前语言字典的完全一致性，并对 HTML 实体转义进行反转义处理；彻底消除单字连接词在包含该字符的类名或常驻标题中引发的恒真守门失效；变异探针测试确认删除分隔带 `<span>` 会立即引发 2/3 测试失败，守门严格生效；四道门禁全绿（29 套 / 248 项单测 100% 通过，生产构建打包完全成功）。详见 [`docs/handoff/2026-09-16-unlisted-room-round3-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round3-findings-remediation-handoff.md)。
- ⚠️ **不公开房间创建/加入交互解耦 Round 3 复查（被审 `bca7674`）**：**审查未通过**。0×P0/P1/P2；**1×P3**（P3-1 Round 2 把 `orJoinExisting` 收敛为单字连接词后，`LobbyMatchmaking.test.ts:89` 的整文档 `toContain` 断言在 `:76` 覆盖的 zh「或」/ar「أو」两语种下恒真——两键均为常驻折叠按钮副标题 `createOrJoin` 的子串，删除分隔带 `<span>`（`LobbyMatchmaking.tsx:81`）后断言仍通过；`:64-66` 的 150 字符窗口自 `class="lobby-friend-divider"` 起始，窗口内类名即含 `o`，故 es 亦恒真，属本轮新引入的守门失效）。Round 2 四项 P3 经独立取证确认**全部真实闭环**（`STATUS.md:11` 已按先例记 `800a3cb`；真实浏览器实测全站 heading 序列 `H1→H2` 无跳级；AX 全树中分隔带文本已消失且 `form` 仍具可读名 `Join existing room`；`assertFriendsSectionStructure` 已补 `return null` 未就绪短路）；审查方独立复跑 `tsc`/`lint` 0 问题、`vitest --pool=vmForks` **29 套 / 248 例全绿**、`npm run build` 成功（11 页），并本地实跑 `smoke:lobby-ui` 确认本轮两处新断言先于既有 `assertRoomError` 失败点通过。详见 [`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md)。
- 🔄 **Round 2 审查缺陷修复与标题大纲连续化（2026-09-16）**：针对 Round 2 复查指出的 4 项 P3 缺陷完成闭环：P3-1 按规则将 `STATUS.md:11` 回填为被审产品交付 `800a3cb`（跳过紧邻的 review 提交）；P3-2 加入卡片小标题升级为 `<h2 className="lobby-friend-subtitle">`，消除全站 h1→h3 标题层级跳跃，文档大纲规范连续；P3-3 6 语种 `orJoinExisting` 收敛为纯连接词（or/或/ou/o/или/أو），分隔带恢复 `aria-hidden="true"` 纯视觉分隔，彻底消除与加入小标题的语义重叠与重复播报；P3-4 `tools/smoke-lobby-ui.ts` 的 `assertFriendsSectionStructure` 回调增加元素缺失立即 `return null` 分支，恢复 20s 轮询等待契约；四道门禁全绿（29 套 / 248 项单测 100% 通过，生产构建打包完全成功）。详见 [`docs/handoff/2026-09-16-unlisted-room-round2-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round2-findings-remediation-handoff.md)。
- ⚠️ **不公开房间创建/加入交互解耦 Round 2 复查（被审 `800a3cb`）**：**审查未通过**。0×P0/P1/P2；**4×P3**（P3-1 `STATUS.md:11` 记录的是审查提交 `30410c7` 而非被审产品交付 `bb3be08`，与 `165c56d`/`3e201ec`/`87ae2e6`/`655c667` 四项先例及 Round 1 交接单 §4 的明确指令相悖；P3-2 `LobbyMatchmaking.tsx:86` 新增 `<h3>` 造成全站标题层级跳跃 h1→h3（全仓无任何 `<h2>`），axe `heading-order` 判罚，属本轮新引入无障碍回归；P3-3 `.lobby-friend-divider` 文案与新增小标题在 **6/6 语种**下语义完全重复（仅差一个连接词，如 ar `أو الانضمام إلى غرفة موجودة`/`الانضمام إلى غرفة موجودة`），视觉与 AX 树双通道重复播报；P3-4 `tools/smoke-lobby-ui.ts:1210` 误用 `waitForValue`，回调恒返回非 null 致 20s 等待退化为单次求值，慢渲染下会误报失败）。Round 1 四项 P3 的功能修复经独立证伪确认**真实生效**（组件回退到 `165c56d` 后新增单测 2/3 失败；CDP AX 实测创建按钮 `description` = hint 文案、表单 `role=form/name` 正确；6 语种去私有化文案齐备）；审查方独立复跑 `vitest --pool=vmForks` **29 套 / 248 例全绿**、`npm run build` 成功（11 页），并实跑 `smoke:lobby-ui` 于 dev/prod 两模式确认本轮新增断言通过（该套件既有 `assertRoomError` 离线超时断言失败，已以基线 A/B 证伪归因为既有环境问题）。详见 [`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round2-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round2-handoff.md)。
- 🔄 **Round 1 审查缺陷修复与大厅交互自动化守门（2026-09-16）**：针对 Round 1 审查指出的 4 项 P3 缺陷完成闭环：P3-1 接入 `joinExistingRoom` 消除 6 语种死键并作为加入卡片可见标题；P3-2 创建按钮接入 `aria-describedby` 关联 hint，移除 divider 上的 `aria-hidden` 保障无障碍可达，表单绑定 `aria-labelledby`；P3-3 新增 `LobbyMatchmaking.test.ts` 纯 Node 服务端渲染单元测试及 `tools/smoke-lobby-ui.ts` 展开态结构与 390px RTL 移动端无横向溢出断言，硬性守门结构性回退；P3-4 6 语种 `createUnlistedRoomHint` 去除 "private/专属" 访问保护暗示词与免责声明对齐；四道门禁全绿（29 套 / 248 项单测 100% 通过，生产构建打包完全成功）。详见 [`docs/handoff/2026-09-16-unlisted-room-round1-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round1-findings-remediation-handoff.md)。
- ⚠️ **不公开房间创建/加入交互解耦独立审查（Round 1，被审 `bb3be08`）**：**审查未通过**。0×P0/P1/P2；**4×P3**（P3-1 `joinExistingRoom` 六语种文案已扩充但从未渲染，`src/` 内除 `dictionaries.ts` 外零引用，交接单 §2.1 却称其已交付；P3-2 承载区分语义的 `.lobby-friend-divider` 被 `aria-hidden` 整体移出无障碍树（AX `role=none`/`name=null`），创建按钮的 `.lobby-friend-hint` 无 `aria-describedby`（AX `description=null`），读屏焦点导航下本次解耦文案失效；P3-3 验收标准 1 零自动化守门——把 `LobbyMatchmaking.tsx` 整体回退到 `165c56d` 后 28 套 / 245 例仍 100% 通过；P3-4 `createUnlistedRoomHint` 的 "private share link/приватную ссылку" 与同面板 `unlistedRoomNotice`「这不是访问保护」语义相悖）。审查方以 CDP 无头 Chrome 在 `en/zh/ar/ru × 390/641/1280` 共 8 组视口实测完成独立验证（DOM/几何顺序一致、无横向溢出、RTL 正常），并独立复跑 `tsc`/`lint` 0 问题、`vitest --pool=vmForks` 28 套 / 245 例全绿；`npm run build` 与联机烟测未复跑。详见 [`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md)。
- 🧩 **不公开房间创建与加入交互解耦及文案歧义消除（2026-09-16）**：针对用户反馈的大厅输入框被误认为“可自定义不公开房间字段/房间码”的问题，将“与好友游玩”面板重构为独立创建卡片与独立加入卡片，增加横向分隔带与微文案提示；6 语种字典同步扩充 `createUnlistedRoomHint`、`joinExistingRoom` 与 `orJoinExisting` 并优化 `createOrJoin` 副标题；四道门禁全绿（28 套 / 245 项单测 100% 通过，生产构建全通）。详见 [`docs/handoff/2026-09-16-unlisted-room-creation-disambiguation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-creation-disambiguation-handoff.md)。
- 🔄 **Round 1 审查缺陷修复与定时器调度器接缝抽取（2026-09-16）**：针对 Round 1 审查指出的 5 项 P3 缺陷完成闭环：P3-1 按契约回填 `STATUS.md:11` 前驱交付并重写括注；P3-2 `AiGameView` 活区采用 `aria-label` 稳定标签与内部 `aria-hidden`，消除每秒读屏播报；P3-3 `commitAiTurn` 的 `finally` 清理纳入 `requestId` 归属守卫；P3-4 抽出无 DOM 依赖的 `createAiCountdownScheduler` 纯调度器，补充可控时钟生命周期与防误杀自动化测试；P3-5 `computeAiThinkingSeconds` 补齐上界与非有限值截断；四道门禁全绿（28 套 / 245 项单测 100% 通过，Next 生产构建成功）。详见 [`docs/handoff/2026-09-16-round1-findings-remediation-handoff.md`](docs/handoff/2026-09-16-round1-findings-remediation-handoff.md)。
- ⚠️ **AI 思考倒计时提示功能独立审查（Round 1，被审 `3a226f1`）**：**审查未通过**。0×P0/P1/P2；**5×P3**（P3-1 `STATUS.md:11` 双字段规则未回填、括注残留上一交付说明；P3-2 `AiGameView.tsx:125/128` 每秒跳动的数值被置于 `role="status"`+`aria-live="polite"` 活区，读屏逐秒播报且与本仓 `TableTaskBar.tsx:75` 既有惯例相悖；P3-3 `useAiGame.ts:304-309` `finally` 清理未按 `requestId` 守卫，被取代请求会误杀新请求的倒计时定时器（当前被 UI 守卫遮蔽）；P3-4 验收标准 2「无定时器泄漏」零测试守门，删除 `setInterval`/任一 `clearInterval` 后 244 项测试仍全绿；P3-5 `computeAiThinkingSeconds` 无上界约束，负 elapsed 实测返回 6/8/65 秒、`NaN` 入参返回 `NaN`）。独立复跑 `tsc`/`lint`/`build` 全绿，`vitest` 243/244（唯一失败为 `game-records.test.ts` Windows EPERM 环境 flake，单跑 10/10 通过），并以真实模块执行 15 组边界探针完成证伪。详见 [`docs/handoff/2026-09-16-workbuddy-code-review-round1-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-round1-handoff.md)。
- ⏱️ **人机对战 AI 思考倒计时提示（2026-09-16）**：为 PvE AI 思考状态建立毫秒级周期采样与防抖机制，新增 `computeAiThinkingSeconds` 纯函数计算与 `aiThinkingCountdown` 秒级倒计时状态；在 6 语种字典同步补齐 `thinkingCountdown`（`{seconds}`）；侧边栏状态卡片与棋盘上方 action-bar 双通道展示带有脉冲微动画与 A11y 属性的倒计时指示器；四道门禁全绿（28 套 / 244 项单测 100% 通过，生产构建全通）。详见 [`docs/handoff/2026-09-16-ai-thinking-countdown-handoff.md`](docs/handoff/2026-09-16-ai-thinking-countdown-handoff.md)。
- 📋 **Feedback 与日志采集计划审查（2026-09-15，需求文档审查，源码零改动）**：审查 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md`（251 行，自述「需求计划，尚未实施」）。结论：该计划承担 build plan 阶段 4 的 Contact 合规页职责，对匿名公开站点并非过度设计，但存在 **2×P0**（`.gitignore` 未覆盖 `data/feedback/`+`data/runtime-logs/` 且 `.jsonl` 绕过 `*.log` 规则 → 用户邮箱/日志进版库风险；线上为纯 HTTP 而计划以 HTTPS 为前提却未列为前置条件）、**6×P1**（同步工具目标/算法/验收三者互斥、保留期无承接者、验收不含隐私政策与 consent、图像处理与 multipart 解析零选型、未剥离 EXIF/GPS、Origin 基准未定义）、**13×P2** 与 **6×P3**。按用户决策记录「首版取消图片上传支持」并分离该决策消解/未消解的缺陷。全部技术断言附 `文件:行号` 实测证据。详见 [`docs/handoff/2026-09-15-feedback-plan-review-handoff.md`](docs/handoff/2026-09-15-feedback-plan-review-handoff.md)。
- ✅ **P1-P4 基线消除与规范统一**：消除 TS 逆变与 `visibility` 缺失错误、SGF 统一转义规范、弹窗 A11y 键盘焦点优化。
- ✅ **AI Worker 线程复用池** (`src/game/ai-worker-pool.ts`)：构建 idle/busy 双队列复用机制，彻底解决频繁创建销毁 Worker 引起的 GC 抖动。
- ✅ **开局库 4 档难度分级与加权选择** (`src/game/opening-book.ts`)：Normal/Hard/Expert/Insane 分级，引擎支持难度门控加权对局。
- ✅ **IX-07 精确大厅实时汇总**：在线人数、空台数、对局数、观战人数实现单调版本化增量同步，多语言与自适应样式补齐。
- ✅ **提示词中枢与交接解耦落地**：建立 `AGENTS.md` 规则中枢、`STATUS.md` 动态状态表与 `docs/handoff/` 增量归档体系，历史 5152 行记录无损迁移至 `docs/archive/LEGACY_HANDOFF_ARCHIVE.md`。
- ✅ **双智能体协同与代码审查闭环挂载**：在 `AGENTS.md` 完整集成 Antigravity ↔ WorkBuddy 独立审查派发、提示词模板与 3 轮自愈闭环协议。
- ✅ **全量技术债分阶段重构蓝图落地**：基于审查文档制定 5 阶段渐进解耦规划交接单，支持后续单阶段独立执行。
- ✅ **Phase 1: 全局常量中枢与代码卫生治理**：提取 `src/lib/constants.ts` 与单测、封装 `ThemeScript.tsx` 消除布局内联脚本重复、全仓替换魔法值并补充自由五子棋规则说明。
- ✅ **Phase 2: 前端状态 Hook 解耦与代码卫生收敛**：`useFriendRoom.ts` 拆解为 4 个专注子 Hook（441 行装配器），根除 R6 模块级全局快照缺陷，收敛 Phase 1 全部 4 项 P3 审查建议，外部 API 零破坏。
- ✅ **Phase 3: 联机大厅与表现层组件化**：`GameShell.tsx` 抽离 `useAiGame` 领域 Hook（593 行，-39.0%），建立 `RoomContext` 消除 Props 逐层透传，`OnlineLobbyView.tsx` 拆解为 6 个高内聚独立子面板（191 行纯容器），收敛 Phase 2 全部 6 项 P3 审查建议。
- ✅ **Phase 3 缺陷修复与复审收敛**：解决 Round 3 审查指出的 P2-1（恢复侧栏 `dictionary.ai.thinking` 状态文案，消除 6 语种孤儿键）、P3-1（以 `wc -l` 精确校准 Phase 2 与 Phase 3 handoff 全部行数）与 P3-2（同步刷新权威基准提交 SHA）。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md)。
- ✅ **Phase 3 修复独立复审（Round 4，被审 `3e201ec`）**：**审查通过**。0×P0/P1/P2；1×P3（`STATUS.md:11` 最新交付提交相对修复交付滞后一拍，Round-3 P3-2 同类问题的结构性复发，建议采用「当前 HEAD 指引 + 阶段交付提交」双字段收敛）。Round 3 全部 4 项发现确认闭环。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md)。
- ✅ **Phase 4: 服务端领域服务解耦**：将 2414 行的服务端巨石单文件 `src/server/rooms.ts` 拆解为三大微领域服务（`RoomStateMachine` 2130 行、`PresenceTracker` 280 行、`LeaderboardService` 87 行），`rooms.ts` 蜕变为 324 行轻量 Facade 门面类，完整代理 41 个公开方法，重导出 31 个公开类型与 `createRoomCode`，外部调用方 `room-socket.ts`、`rooms.test.ts`（43 项用例）与 `online-server.ts` 100% 零改动兼容，四道门禁+全套联机烟测全绿通过。详见 [`docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`](docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md)。
- ✅ **Phase 4 领域解耦独立复审（Round 5，被审 `23b03fb`）**：**审查未通过**。0×P0/P1/P2；**1×P3**（`STATUS.md:11` 阶段交付提交滞后一拍，Round-3 P3-2 / Round-4 P3-1 同类问题第三次复发，双字段收敛方案仍未落地）。功能等价性经 98 块块级字节比对 + 691 项差分断言 + 116 项版本契约断言独立证实**零行为回归**，四道门禁与三套联机烟测独立复跑全绿，handoff 全部量化声明逐项属实。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md)。
- ✅ **Phase 5: 五子棋核心算法分层与 AI 引擎解耦**：将 2574 行的 AI 启发式引擎巨石 `src/game/ai.ts` 解耦为纯函数式分层体系，拆分为静态评估器 `ai-evaluator.ts`（564 行）、α-β 搜索引擎 `ai-search.ts`（1270 行）与策略调度器 `ai-scheduler.ts`（823 行），`ai.ts` 蜕变为 27 行轻量 Facade 门面，11 个公开方法与类型 100% 零破坏兼容，四道门禁全绿（28 套 / 242 项测试全绿），通过快速 Arena 天梯对抗评测（2-2 平局胜率对等稳定）。详见 [`docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md`](docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md)。
- ✅ **Phase 5 AI 引擎分层独立复审（Round 6，被审 `ea0c0b9`）**：0×P0/P1/P2；**1×P3**（Phase 5 交付文档 4 项行数量化数据失真）。功能等价性经声明级字节比对（base 134 声明 0 缺失/1 新增/2 等价变更）+ 36 项搜索差分 + 4500+ 项纯函数与配置边界差分独立证实**零行为漂移**，四道门禁、Arena 与 `verify:online` 独立复跑全绿；所报 4 项行数失真已在 `3d4a1a1` 统一校准闭环。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round6-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round6-handoff.md)。
- ✅ **全量项目独立代码审查（Full Codebase Audit Review，被审 `3d4a1a1`）**：依据 WorkBuddy 规范与证伪方法完成全仓无盲区审计。追踪四大关键业务调用链，设计并独立运行 11 项负向/极端边界验证场景，四道门禁基线全绿（28 套 / 242 项测试 100% 通过，生产构建全通）。0×P0/1/2，**2×P3**（P3-1: `room-state-machine.ts:798` 悔棋超时死分支；P3-2: `client-address.ts:38` 多级反代 XFF 采信策略配置约束）；**已全部修复闭环**（P3-1 移除死分支，P3-2 完善 README 与 OpenResty 反代契约文档）。详见 [`docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md`](docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md)。
- ⚠️ **全量审计 P3 修复与工作流契约固化独立复审（Round 7，被审 `948d239`）**：**审查未通过**。0×P0/P1/P2；**4×P3**（P3-1 `README.md:91`/`openresty-gomoku.conf.example:8-10` 单级反代 XFF 可伪造论证与末位采信策略自相矛盾；P3-2 `README.md:94`/`openresty-gomoku.conf.example:16-17` 的 `$http_cf_connecting_ip` 备选方案缺 CDN 源站白名单前置条件、源站可直连时限流键可任意铸造；P3-3 `room-state-machine.ts:798` 移除超时分支非严格行为等价（跨 `expiresAt` 边界语义由拒变收）且该路径 242 项测试零覆盖；P3-4 新增 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md` 为孤儿文档、全仓零入站引用）。独立复跑 `tsc`/`lint`/`vitest`(28 套 242 项) 全绿，并以可控时钟与 nginx XFF 变量语义仿真探针完成证伪。详见 [`docs/handoff/2026-09-13-workbuddy-code-review-round7-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round7-handoff.md)。
- 🔄 **Round 7 审查缺陷修复与规范索引挂载**：针对 Round 7 审查提出的 4 项 P3（单级 XFF 论证、`$http_cf_connecting_ip` CDN 回源白名单前置条件、悔棋超时边界原子语义与测试守门、消除规范文档孤儿引用）完成定向修复与文档对齐，四道门禁全绿（243 项测试通过），准备送审 Round 8。详见 [`docs/handoff/2026-09-13-round7-findings-remediation-handoff.md`](docs/handoff/2026-09-13-round7-findings-remediation-handoff.md)。

---

## 4. 当前技术债与架构路线图（Roadmap）

> 详细分阶段执行方案与边界请查阅：[`2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)

1. ✅ ~~**Phase 1: 全局常量中枢与代码卫生治理**~~（已完成）
2. ✅ ~~**Phase 2: 前端状态 Hook 解耦**~~（已完成：`useFriendRoom.ts` 拆解为 `useRoomSocket`、`useLobbyPresence`、`useRoomChat`、`useRoomGame` 与 `room-state-utils`，消除 R6 模块级快照）
3. ✅ ~~**Phase 3: 联机大厅与表现层组件化**~~（已完成：`GameShell.tsx` 抽离 `useAiGame`，建立 `RoomContext`，`OnlineLobbyView.tsx` 拆解为 6 个独立子面板，收敛 Phase 2 全部审查建议）
4. ✅ ~~**Phase 4: 服务端领域服务解耦**~~（已完成：`rooms.ts` 拆解为 PresenceTracker、LeaderboardService、RoomStateMachine 三大微领域服务与 Facade 门面，外部 API 零破坏）
5. ✅ ~~**Phase 5: 五子棋核心算法分层**~~（已完成：`ai.ts` 拆分为评估器、α-β 搜索器、开局调度器与 Facade，并通过 Arena 自动化天梯评测）

---

## 5. 交接文档索引

- 详细交接单索引请查阅：[`docs/handoff/INDEX.md`](docs/handoff/INDEX.md)
- **全局分阶段重构总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **最新单阶段交付单**：[`docs/handoff/2026-09-16-unlisted-room-round3-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round3-findings-remediation-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-16-unlisted-room-round2-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round2-findings-remediation-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-16-unlisted-room-round1-findings-remediation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-round1-findings-remediation-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-16-unlisted-room-creation-disambiguation-handoff.md`](docs/handoff/2026-09-16-unlisted-room-creation-disambiguation-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-16-round1-findings-remediation-handoff.md`](docs/handoff/2026-09-16-round1-findings-remediation-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-16-ai-thinking-countdown-handoff.md`](docs/handoff/2026-09-16-ai-thinking-countdown-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md`](docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md`](docs/handoff/2026-09-13-phase4-server-rooms-decomp-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md`](docs/handoff/2026-09-13-phase3-frontend-ui-decomp-handoff.md)
- 前序阶段交付单：[`docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md`](docs/handoff/2026-09-13-phase2-usefriendroom-decomp-handoff.md)
- **最新独立复审（Round 3，被审 `bca7674`，不公开房间创建/加入交互解耦）**：[`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md)（0×P0/P1/2，**1×P3**，**审查未通过**，待修复闭环）
- 前序独立复审（Round 2，被审 `800a3cb`，不公开房间创建/加入交互解耦）：[`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round2-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round2-handoff.md)（0×P0/P1/2，**4×P3**，已由 `bca7674` 完成功能性修复闭环）
- 前序独立复审（Round 1，被审 `bb3be08`，不公开房间创建/加入交互解耦）：[`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md)（0×P0/P1/2，**4×P3**，已由 `800a3cb` 完成功能性修复，其遗留项由 Round 2 复查承接并已由 `bca7674` 闭环）
- 前序独立复审（Round 1，被审 `3a226f1`，AI 思考倒计时提示）：[`docs/handoff/2026-09-16-workbuddy-code-review-round1-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-round1-handoff.md)（0×P0/P1/2，**5×P3**，已由 `165c56d` 全部闭环）
- **最新独立复审（Round 7，被审 `948d239`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round7-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round7-handoff.md)（0×P0/1/2，**4×P3**，**审查未通过**，待修复闭环）
- **全量项目独立代码审查报告（被审 `3d4a1a1`）**：[`docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md`](docs/handoff/2026-09-13-full-codebase-audit-review-handoff.md)（0×P0/1/2，**2×P3**，**已全部修复闭环**）
- **Phase 5 独立复审（Round 6，被审 `ea0c0b9`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round6-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round6-handoff.md)（0×P0/1/2，**1×P3**，已在 `3d4a1a1` 校准行数指标闭环）
- 前序独立审查（Round 5，被审 `23b03fb`）：[`docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md)（0×P0/1/2，1×P3，审查未通过；其 P3 已由 `860d9ce` 落地双字段规则收敛）
- **前序独立审查（Round 4，被审 `3e201ec`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round4-handoff.md)（0×P0/1/2，1×P3，**审查通过**，Round 3 全部 4 项闭环）
- **前序独立审查（Round 3，被审 `b45e3fb`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round3-handoff.md)（0×P0/1，**1×P2**，3×P3，已在 Round 4 闭环）
- **前序独立审查（Round 2，被审 `785c8d4`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round2-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round2-handoff.md)（0×P0/1/2，6×P3，其中 4 项已在 Phase 3 完全闭环、2 项部分闭环）
- **前序独立审查（Round 1，被审 `1e6ef36`）**：[`docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md`](docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md)（P3 建议已在 Phase 2 全部收敛）
- 原始全量档案：[`docs/archive/LEGACY_HANDOFF_ARCHIVE.md`](docs/archive/LEGACY_HANDOFF_ARCHIVE.md)
