# 五子棋交互重构计划

更新日期：2026-07-10

状态：待实施；事实性断言已于 2026-07-10 逐条核验

文档性质：竞品研究与现有代码对照后的实施计划，不包含本轮产品代码修改

真实性核验报告：`docs/INTERACTION_REDESIGN_PLAN_VERIFICATION.md`

## 结论先行

当前项目最值得改的不是按钮颜色，也不是继续增加功能按钮，而是重新划分页面工作区：

1. 在线大厅和在线牌桌必须成为两个互斥界面；进入牌桌后不再显示创建、加入、公共聊天、排行榜等大厅内容。
2. 牌桌必须由明确的前端状态机决定任务提示和动作，隐藏无关操作，不长期陈列一排禁用按钮。
3. 当前棋盘右侧已经预留 280–320px 栏位，但联机核心信息仍堆在棋盘上方；应把右栏改成真正的桌边区。
4. 快速匹配、朋友邀请和按房间码加入应按使用频率分层，房间码不应是普通用户开始在线对局前必须理解的概念。
5. 绝大多数第一阶段改动只是重组已有且有测试覆盖的前端/服务端能力，不应顺手重写房间协议、服务端权威落子或身份系统。

建议先完成 P0 的“工作区分离 + 牌桌状态机”，再做桌面/移动端布局。`matchConfig`、点名挑战和赛事属于后续能力，不能阻塞本轮交互主线。

## 研究与代码依据

本计划完整通读了竞品研究，并核对了下列项目文档中与当前能力、完成状态和流程边界直接相关的章节：

- `docs/COMPETITOR_INTERACTION_RESEARCH.md`：PlayOK、scheng20、minh100、sen、gkoos、BGA、FlyOrDie、PaperGames、Vint.ee 共 9 个产品的交互逻辑、横向结论和验收清单。
- `docs/logic/lobby-matchmaking-module.md`：当前大厅、匹配、观战、公共聊天和房间列表的设计与落地状态。
- `docs/logic/realtime-room-module.md`：当前房间成员、准备、权威落子、悔棋、认输、重开、断线和重连语义。
- `docs/STAGE_3_PLAN.md` 与 `docs/STAGE_3_PROGRESS.md`：Stage 3 已完成能力和线上验证边界。
- `docs/HANDOFF.md`：最近安全审核、竞品研究和部署记录。

对照的主要实现文件：

- `src/components/GameShell.tsx:92`：当前页面总编排。
- `src/components/GameShell.tsx:127`：模式切换及离开房间逻辑。
- `src/components/GameShell.tsx:427`：当前模式栏、控制条、联机面板、棋盘和右栏的渲染顺序。
- `src/components/GameShell.tsx:721`：当前巨型 `FriendRoomControls`。
- `src/components/GameShell.tsx:1386`：当前大厅房间列表。
- `src/components/useFriendRoom.ts:55`：联机控制器公开状态和动作。
- `src/components/useFriendRoom.ts:172`：当前权限布尔值推导。
- `src/components/useFriendRoom.ts:323`：创建、加入和快速匹配流程。
- `src/components/useFriendRoom.ts:889`：邀请链接自动进入和 session 恢复。
- `src/server/rooms.ts:16`：服务端房间状态、角色和快照类型。
- `src/server/rooms.ts:341`：创建、匹配、加入与观战语义。
- `src/server/rooms.ts:808`：终局重开并交换下一局先手。
- `src/app/globals.css:102`：当前主区 + 固定右栏布局。
- `src/app/globals.css:304`：当前房间面板样式。
- `src/app/globals.css:1453`、`src/app/globals.css:1545`：当前右侧状态栏及响应式降级。

## 当前项目的真实能力

当前项目已经实现了主要联机闭环；本计划所针对的核心缺口是这些能力的页面组织，而不是从零补齐联机协议。

| 能力 | 当前状态 | 结论 |
| --- | --- | --- |
| 本地双人、AI、在线房间 | 已有三种模式 | 保留能力，重构为互斥工作区 |
| 游客随机昵称与免注册第一局 | 已有 | 保留，不新增注册前置门槛 |
| 快速匹配 | 已有服务端原子单进程基础版 | 提升为在线大厅主动作 |
| 创建房间、房间码加入、邀请 URL | 已有，URL 可自动加入并恢复身份；当前没有 visibility/private 字段，创建房会进入公开大厅 | 保留协议并重新分层入口，但不能把当前链接房宣传成私密朋友桌 |
| 公开房间列表 | 已有 waiting/playing、Join/Watch 和增量更新 | 改成大厅主体，不再嵌在牌桌上方 |
| 观战、空座补位 | 已有 `spectator` / `room:sit` | 显式纳入牌桌状态机 |
| 准备、落子、悔棋、认输、重开 | 已有服务端权限约束 | 用状态替换动作，不改协议 |
| 房间聊天、公共聊天 | 已有 | 分别归属牌桌侧栏和大厅页签 |
| 在线用户与状态 | 已有 online/in_room/playing/spectating | 归入大厅；精确汇总需补充统计口径 |
| Profile、棋谱、回放、SGF、排行榜 | 已有基础版；Profile 已有独立路由，但 Profile 摘要和排行榜仍内嵌在巨型房间面板 | 保留 Profile 独立页，移除首屏重复摘要；排行榜改为大厅次级入口或独立视图 |
| 多局、计时、规则、是否计分 | 未建模 | 后续新增 `matchConfig`，不混入 P0 |
| 点名挑战、忙碌/拒绝挑战 | 未实现 | 后续新增事件和状态，不混入 P0 |
| 完整赛事 | 未实现 | 明确延期，只预留数据关系 |

## 当前交互问题

### 1. 大厅和牌桌没有边界

`GameShell` 在 `mode === "room"` 时始终先渲染 `FriendRoomControls`，再渲染棋盘。`FriendRoomControls` 又始终包含：

- 昵称和房间码输入；
- 账号、注册、Profile；
- 快速匹配、创建、加入；
- 公共聊天、在线用户、排行榜、房间列表；
- 进入房间后的房间摘要、玩家、观战者、房间聊天和所有牌桌动作。

因此用户进入房间后，大厅没有退出；棋盘反而被推到整组控制之后。这与竞品研究文档总结的“大厅负责找桌、牌桌负责当前对局”原则冲突。直接支持这一原则的主要是 PlayOK、BGA、FlyOrDie、Vint.ee 等在线平台；AI/本地类项目提供的是独立棋盘工作区的补充证据，不能表述成 9 个产品逐一达成同一结论。

### 2. 权限推导已经存在，但状态驱动不完整

`useFriendRoom` 已经推导 `canReady`、`canPlay`、`canResign`、`canRestart`、`canSit`、`canUndo` 等权限。当前 UI 已经对准备和坐下做了条件渲染，但仍长期渲染悔棋、认输、重开、离开等按钮，并主要用 disabled 表达前三者不可用。

权限布尔值应继续作为安全边界，但需要再向上推导一个语义化 `TableUiState`，由它决定当前任务、主动作和次动作。禁用状态只用于“动作暂时等待”，不用于承载整个状态机。

### 3. 页面已有侧栏，联机信息却没有进入侧栏

桌面布局已经是主区 + 280–320px 右栏，右栏目前只有状态、步数和广告。与此同时，玩家、观战者、房间聊天和房间摘要全部放在棋盘上方。

这不是缺少布局基础，而是内容归属错误。首轮不需要重新发明网格系统，只需让在线牌桌接管现有右栏。

### 4. 在线入口没有主次

当前快速匹配、创建房间、按码加入并列出现，昵称和房间码输入也始终展开。对普通新用户而言，“快速匹配”应是主动作，“和朋友玩”是第二意图，“按码加入”是朋友流程里的次级入口。

邀请 URL 已经能自动入房，所以房间码不应继续成为在线模式的视觉中心。

### 5. 模式和设置切换会静默丢弃上下文

- 从在线模式切换到本地或 AI 时会直接调用 `leaveRoom()`；对局中离开在服务端等价于断线处理，但 UI 没有清楚解释后果。
- AI 先手或难度变化会立即 reset 当前棋局，用户可能误触丢失进行中的局面。

这两处需要明确的“当前局处理策略”：未开局可直接切换；已开局则确认、延迟到下一局生效，或提供明确退出动作。

### 6. 移动端只是顺序堆叠，不是优先级重排

900px 以下现有双栏会转为单栏，640px 以下大量网格变单列。这能防止横向溢出，但不会保证用户先看到当前任务和棋盘；巨型房间面板仍会排在棋盘之前。

移动端必须采用“任务条 → 棋盘 → 必要动作 → 折叠次要信息”的顺序，而不是把桌面所有区块依次拉直。

## 值得改动的优先级

| 改动 | 价值 | 优先级 | 服务端影响 | 决策 |
| --- | --- | --- | --- | --- |
| 在线大厅与牌桌互斥 | 极高 | P0 | 无 | 立即做 |
| 语义化牌桌状态机与动作替换 | 极高 | P0 | 无 | 立即做 |
| 固定任务栏、桌边栏、移动端紧凑布局 | 极高 | P0 | 无 | 紧随状态机完成 |
| 快速匹配/链接房/按码加入分层 | 高 | P1 | 仅入口分层无影响；真正私密朋友桌需要协议扩展 | 视图分离后先做真实入口 |
| 离房和 AI 设置切换保护 | 高 | P1 | 无 | 与工作区切换同时做 |
| 空大厅降级与真实活跃度摘要 | 高 | P1 | 单进程精确总数是小幅扩展；多实例全站总数需要共享状态 | 分两步做，不伪造热度 |
| 房内棋谱/事件历史与终局复盘入口 | 中高 | P1 | 可先复用现有 moves/records | 牌桌稳定后做 |
| 排行榜/Profile 从大厅主流程下沉 | 中 | P1 | 无 | 配合大厅整理做 |
| `matchConfig`（规则/计时/多局/计分） | 中 | P2 | 需要协议和存储扩展 | 另立后端任务 |
| 点名挑战与 busy 状态 | 中 | P2 | 需要 presence/邀请事件 | 另立后端任务 |
| 完整赛事系统 | 低（当前阶段） | 延期 | 大 | 只预留关系，不实现 |
| 仅调整按钮颜色 | 低 | 非独立任务 | 无 | 只作为视觉收口 |

## 目标信息架构

```text
应用壳
├─ 本地双人工作区 LocalGameView
├─ AI 工作区 AiGameView
└─ 在线工作区
   ├─ 在线大厅 OnlineLobbyView（room === null）
   │  ├─ 快速匹配
   │  ├─ 和朋友玩（创建当前公开链接房 / 邀请 / 按码加入）
   │  ├─ 可加入 / 可观战牌桌
   │  └─ 在线用户 / 公共聊天 / 排行榜入口
   └─ 在线牌桌 GameTableView（room !== null）
      ├─ TableTaskBar：当前任务与最多 1 个主动作
      ├─ GomokuBoard：直接落子
      ├─ TableActionBar：最多 3 个必要次动作
      └─ TableSidebar
         ├─ 玩家与座位
         ├─ 聊天
         ├─ 历史 / 棋谱
         └─ 房间信息 / 规则
```

在线 URL 仍保持现有 `?room=CODE` 约定。URL 自动加入成功后直接进入 `GameTableView`，不先闪现完整大厅。

## 牌桌前端状态规格

服务端 `RoomStatus`、`role`、`seat`、`ready`、`currentTurn` 和 `undoRequest` 保持不变；新增纯前端派生状态：

| `TableUiState` | 判定要点 | 主提示 | 主动作 | 可见次动作 |
| --- | --- | --- | --- | --- |
| `spectating` | role=spectator，无空座或 playing | 正在观战 | 无 | 退出；聊天/历史 |
| `spectating-can-sit` | `canSit=true` | 有空座可加入 | 坐下 | 退出 |
| `seated-waiting-opponent` | player，只有一名玩家 | 等待对手 | 复制邀请 | 取消等待或退出 |
| `seated-not-ready` | 两名玩家，自己未准备 | 准备后开始 | 准备 | 退出 |
| `seated-ready` | 自己已准备，对手未准备 | 等待对手准备 | 取消准备 | 退出 |
| `ready-compat` | status=ready | 双方已准备，等待服务端进入对局 | 无 | 退出；不显示 Start |
| `playing-my-turn` | playing、无待处理悔棋且 currentTurn=seat | 轮到你落子 | 棋盘落子 | 悔棋（仅 `canUndo` 时）、认输 |
| `playing-opponent-turn` | playing、无待处理悔棋且非自己回合 | 等待对手 | 无 | 悔棋（仅 `canUndo` 时）、认输 |
| `undo-request-pending` | undoRequest.requesterSeat=seat | 等待对手回应悔棋 | 无 | 认输可下沉，不允许继续落子/再次请求 |
| `undo-response-required` | undoRequest.targetSeat=seat | 对手请求悔棋 | 接受 / 拒绝 | 暂停其他协商动作 |
| `finished-host` | finished 且 seat=hostSeat | 本局结束 | 重置为下一局等待 | 复盘、退出 |
| `finished-guest` | finished 且非 host | 本局结束 | 等待房主重开 | 复盘、退出 |
| `abandoned` | status=abandoned | 对局已关闭 | 返回大厅 | 复盘（若有记录） |

约束：

- 每个状态只有一个明确主任务；悔棋请求需要响应时覆盖普通任务。
- 同一区域不超过 4 个动作，普通落子不生成额外按钮。
- `can*` 权限仍由 controller/server 决定；`TableUiState` 只负责组织显示，不能绕过权限。
- “断线重连中”作为连接覆盖状态，不新增第二套房间状态。
- 双方准备后服务端自动开局，UI 不重新引入 Start 按钮。
- 当前 controller 没有记录房间来自“快速匹配”还是“朋友桌”；在新增可恢复的 entry intent 之前，单人等待房统一使用“取消等待/退出”，不能武断显示“取消匹配”。
- 当前 `canCancelMatch` 虽然能在单人 waiting 房为 true，但按钮位于 `snapshot ? copyInvite : ...` 的无房分支，因此实际不可达；新任务栏必须显式提供可达的“取消等待/退出”，不能把现有按钮当成已工作的 UI。
- 当前 `game:restart` 由房主触发后只把房间重置到 waiting，双方仍需重新 ready；它不是立即开始下一局。
- `RoomStatus="ready"` 目前只是兼容类型，当前 `updateRoomStatus` 会在双方 ready 时直接进入 playing；派生函数仍必须提供安全 fallback，但不能因此重新引入 Start。

## 实施阶段

### Phase 0：冻结交互契约与回归基线（P0）

任务 ID：`IX-00`

目标：在移动组件前固定当前已工作的在线能力，避免交互重构破坏房间协议。

允许修改：

- `docs/INTERACTION_REDESIGN_PLAN.md`
- 新增前端状态单元测试所需文件
- 必要的现有 smoke 断言

动作：

1. 为上述 `TableUiState` 建立表驱动单元测试矩阵。
2. 记录桌面 1440×900、低高度 1280×720、移动端 390×844 三种验收视口。
3. 将以下路径列为不可回归基线：邀请 URL 自动加入、刷新恢复身份、Join/Watch、准备自动开局、落子、悔棋响应、认输、重开换先、观战补位、离房清 URL。

验收：

- 状态矩阵覆盖 player/spectator、waiting/ready/playing/finished/abandoned、我的回合/对手回合、悔棋请求方与响应方。
- 现有 socket 和 server 测试不因 UI 重构而修改业务期望。

### Phase 1：拆分互斥工作区（P0）

任务 ID：`IX-01`

目标：先改变页面逻辑，再改变视觉布局。

建议文件边界：

- `src/components/GameShell.tsx`：只保留全局壳、模式选择和工作区编排。
- `src/components/play/LocalGameView.tsx`
- `src/components/play/AiGameView.tsx`
- `src/components/online/OnlineLobbyView.tsx`
- `src/components/online/GameTableView.tsx`
- `src/components/online/table-ui-state.ts`
- `src/components/useFriendRoom.ts`：仍是联机 controller，本阶段不拆 socket 逻辑。

动作：

1. 把 `FriendRoomControls` 按 `room === null` / `room !== null` 拆成大厅和牌桌，不允许两者同时渲染。
2. 本地、AI、在线大厅、在线牌桌各自拥有自己的控制区；棋盘不再由一个页面同时承载所有模式控制。
3. 保持现有 URL、local/session storage 和 socket 事件名不变。
4. 邀请 URL 自动加入时直接落到牌桌；加入失败才回到大厅并显示错误。
5. 为 `useFriendRoom` 增加在线工作区启用门控，或把自动 rejoin/socket 建连约束在在线工作区；当前 hook 即使页面处于本地模式，只要仍有 stored room session，也可能自动 rejoin 并创建 socket。门控只能阻止新的后台 rejoin/订阅，不能在 `room:leave` ack 返回前提前断开活跃 socket；模式切换需要等待 leave 完成，或让 `leaveRoom` 返回可等待的结果。

验收：

- 在线大厅完全不显示对局内的准备、悔棋、认输和重开动作。
- 进入任何牌桌后完全不显示创建房间、按码加入、公共聊天、排行榜和大厅房间列表。
- 本地/AI 切换不创建 socket；在线工作区仍只使用一个 controller 实例。
- `GameShell.tsx` 不再包含全部大厅和牌桌子面板实现。

### Phase 2：建立牌桌任务栏与状态动作模型（P0）

任务 ID：`IX-02`

依赖：`IX-01`

建议新增：

- `src/components/online/TableTaskBar.tsx`
- `src/components/online/TableActionBar.tsx`
- `src/components/online/TablePlayers.tsx`
- `src/components/online/table-ui-state.test.ts`

动作：

1. 用纯函数 `deriveTableUiState(room)` 生成语义状态。
2. 用纯函数 `getTableActions(state, capabilities)` 返回有序动作，不在 JSX 中散落复杂条件。
3. 当前任务栏固定在棋盘附近，显示房间状态、当前回合和一个主动作；在 `matchConfig` 落地前不虚构系列赛轮次。
4. 悔棋请求复用现有明确 modal 或进入任务栏；响应方可接受/拒绝，请求方显示等待，对请求未解决前暂停落子和冲突动作。
5. 终局保留棋盘、最后一步、玩家和聊天；房主可重开，其他人明确等待或退出。

验收：

- 任一牌桌状态的高频操作区不超过 4 个按钮。
- 无关动作被隐藏，而不是长期 disabled。
- 观战者有空座时看见“坐下”；对局中不出现该入口。
- 双方准备、我的回合、对手回合、终局和悔棋响应可在 1 秒内从任务栏辨认。

### Phase 3：重排桌面牌桌与移动端优先级（P0/P1）

任务 ID：`IX-03`

依赖：`IX-02`

建议新增：

- `src/components/online/TableSidebar.tsx`
- `src/components/online/TableSidebarTabs.tsx`

主要修改：

- `src/app/globals.css`
- `src/components/online/GameTableView.tsx`

动作：

1. 桌面端复用现有 280–320px 右栏，优先放双方玩家和连接/准备状态。
2. 聊天、历史、房间信息改为侧栏页签或折叠层；广告不插入棋盘和主动作之间。
3. 移动端顺序固定为：任务条 → 棋盘 → 主动作 → 玩家紧凑条 → 折叠次要信息。
4. 保留现有 `width: min(100%, 820px, 78vh)` / `76vh` 高度约束，并根据新增任务栏占用进一步校准；该能力不是从零新增。
5. RTL 语言保持信息优先级和可触达性，不用绝对 left/right 假设排列。

验收：

- 1440×900 下棋盘、任务栏、双方玩家和主动作首屏可见。
- 1280×720 下无需滚动即可完成一次落子。
- 390×844 下先看到任务和可操作棋盘，公共聊天/排行榜不会排在棋盘前。
- 关键触摸目标接近 40–44px，其他可操作目标不低于 32px。

### Phase 4：简化在线大厅入口和低活跃降级（P1）

任务 ID：`IX-04`

依赖：`IX-01`

动作：

1. 在线大厅首屏把快速匹配设为主动作。
2. “和朋友玩”作为第二入口，进入后才显示创建链接房、复制邀请说明和按码加入；第一版必须说明该房仍会出现在公开大厅，不能使用“私密房”文案。
3. 昵称沿用随机游客身份；只有用户主动编辑身份时才展开账号区域。
4. 房间列表分“可加入”和“可观战”，每行只显示一个上下文动作；可观战组同时容纳满员 waiting 房和 playing 房，并明确显示真实状态，不能把满员等待桌误标成进行中。
5. 空列表时显示快速匹配、创建朋友桌、转到 AI 三个真实出口，不展示孤立的“暂无房间”。
6. Profile 和排行榜改为全局/大厅次级入口，不与开局动作争夺首屏。
7. 快速匹配创建单人 waiting 房后进入牌桌等待态，并提供可达的“取消等待”；第一版可复用非对局 `leaveRoom`，不要继续依赖当前不可达的 Cancel Match 分支。

活跃度口径分两步：

- 第一步可显示“当前已加载列表”的开放桌/进行中桌数量，并明确不是全站总数。
- 第二步由服务端返回 `onlineUsers`、`openTables`、`playingTables` 的无分页汇总；在此之前不把 20 条房间列表或 30 名 presence 样本伪装成全站数字。当前单进程 store 只能给出该进程的精确值，多实例部署前不能宣称为跨实例全站总数。

私密朋友桌边界：

- 当前 `CreateRoomInput`、`RoomSnapshot`、`RoomListItem` 都没有 visibility/private/inviteCode。
- 如果产品要求“只有拿到邀请链接的人才能发现或加入”，必须另立全栈任务，新增服务端可见性和授权语义；不能在 IX-04 里只通过隐藏前端列表伪装私密。

验收：

- 已恢复游客身份时，从进入在线大厅到开始快速匹配只需 1 次点击。
- 新用户无需理解房间码即可开始普通在线对局。
- 朋友可继续通过现有一个 URL 进入正确牌桌；本阶段不把该 URL 承诺为私密邀请。
- 没有开放桌时仍有明确下一步，且不使用虚假在线人数或静态热度。

### Phase 5：保护模式切换和局中设置（P1）

任务 ID：`IX-05`

动作：

1. 在线未开局/纯观战可直接离开；在线对局中切换模式前说明会断开当前席位及断线宽限后果。
2. 对局中优先提供明确“退出牌桌”，而不是让顶部模式按钮承担离房副作用。
3. AI 难度和先手在空棋盘立即生效；已有落子时选择“下一局生效”或经确认后重开。
4. 刷新/rejoin 不弹确认，继续遵循现有恢复流程。

验收：

- 模式切换不会无提示丢弃在线或 AI 对局上下文。
- 用户确认退出后 URL 和本地 session 按现有回调清理；非对局玩家/观战者立即离房，对局中玩家在服务端被标记断线并进入默认 60 秒重连宽限，而不是立即删除席位。
- 键盘、触摸和 RTL 下确认界面均可操作。

### Phase 6：终局历史与回放入口（P1）

任务 ID：`IX-06`

依赖：`IX-02`、`IX-03`

动作：

1. 先用现有 `RoomSnapshot.moves` 生成重开前的当前局结构化步骤列表，不另建客户端文本日志。
2. 终局提供“复盘”入口，优先复用现有 record replay 逻辑。
3. 已保存 game record 时链接到 Profile/Game records；记录尚未可读回时仍可查看本局 moves。
4. 当前服务端重开会清空 `RoomSnapshot.moves`、更新 gameId，但不会清空房间聊天和玩家。因此跨局历史不能只依赖当前 snapshot，必须从已保存 game record 读回上一局，再按 gameId 分局。

验收：

- 终局不强制返回大厅。
- 用户可从最后一步逐手回看本局，退出复盘后回到原牌桌。
- 刷新后当前局面的最后一步与待处理动作保持一致。
- 不把聊天文本当成棋谱事件来源。

### Phase 7：精确大厅汇总（P1，含小幅服务端改动）

任务 ID：`IX-07`

依赖：`IX-04`

建议协议：

```ts
type LobbyActivitySummary = {
  generatedAt: number;
  onlineUsers: number;
  openTables: number;
  playingTables: number;
  spectators: number;
  version: number;
};
```

动作：

1. 服务端从当前单进程的 room/presence store 计算无分页汇总；`onlineUsers` 定义为已加入 presence 且 connectionCount > 0 的去重身份数，`openTables` 定义为 waiting 且可加入的桌，`playingTables` 定义为 playing 桌，`spectators` 定义为当前连接中的观战席总数。这些值不等同于全部网站访客或跨实例全站统计。
2. room list 的 lobby 初始 ack 和后续变更当前已经携带版本，但客户端只做 upsert/delete、没有保存或检查版本；本阶段需要新增房间列表版本缺口检测，检测到缺口后调用 full resync。
3. activity summary 需要自己的单调 `version`（或明确的 room/presence 双版本），因为在线人数会随 presence 变化，不能只复用 lobby room version。summary 更新使用整份替换；发现版本缺口时重新拉取。
4. 文案明确区分“在线用户”“开放桌”“进行中桌”，不合并成含糊总数。

验收：

- 汇总不受客户端 `limit=20/30` 影响。
- 创建、开局、结束、观战、离线和清理后数字同步更新。
- 汇总异常时隐藏或标记暂不可用，不回退到伪造数字。
- 多实例部署但尚无 Redis/PostgreSQL 等共享状态时，指标必须标明实例范围，不能宣称全站精确。

### Phase 8：比赛配置 `matchConfig`（P2，独立后端任务）

任务 ID：`IX-08`

候选模型：

```ts
type MatchConfig = {
  rules: "freestyle"; // 候选命名；对应当前“连续不少于五子即胜”的语义
  clock: null | { initialSeconds: number; incrementSeconds: number };
  seriesLength: 1 | 3 | 5;
  rated: boolean;
};
```

边界：

- 当前规则引擎只有“连续不少于五子即胜、长连也获胜”的固定语义，没有规则配置。第一版只能暴露这套已实现规则；不能先显示 Renju/Swap2 再用当前规则执行。
- 配置在首局开始后锁定，重开沿用同一 match 配置。
- `rated` 必须依赖可信身份、权威结算和反刷规则，不能只是 UI 开关。
- 多局需要独立 matchId、gameId、局分和先手轮换，不复用单个 `winner` 冒充系列赛结果。

该阶段必须另写服务端数据迁移、协议兼容和专项测试计划，不在交互重构提交中顺带完成。

### Phase 9：点名挑战与忙碌状态（P2，独立后端任务）

任务 ID：`IX-09`

目标：学习 FlyOrDie/Vint.ee 的上下文动作，而不是在大厅常驻 Challenge 按钮。

动作：

1. 用户选中某个可挑战在线用户后才显示挑战动作。
2. presence 增加 `acceptingChallenges` 或等价状态。
3. 邀请包含过期、接受、拒绝、取消和重复请求去重。
4. 选中进行中桌后才显示 Watch；继续复用现有 join-as-spectator 语义。

边界：

- 不在没有持久好友关系、邀请防骚扰和限流前实现好友通知流。
- 不把用户列表中的 `in_room/playing` 简单视为可挑战。

### 延期：赛事层

只预留 `tournament -> round -> pairing -> match -> game` 关系。当前不做赛事大厅、报名、赛程、奖品、正式验证身份或第二套棋盘客户端。

赛事未来必须复用 `GameTableView`；赛事系统只负责配对、配置和积分。

## 文件改动边界

### P0/P1 允许范围

- `src/components/GameShell.tsx`
- `src/components/GomokuBoard.tsx`（仅必要的尺寸/可访问性接口，不改规则）
- `src/components/useFriendRoom.ts`（仅暴露已有状态或安全的 UI 派生输入）
- 新增 `src/components/play/*`
- 新增 `src/components/online/*`
- `src/app/globals.css`
- `src/i18n/dictionaries.ts`
- 对应组件/纯函数测试与 `tools/smoke-*.ts`
- 相关 README、逻辑、进度和 handoff 文档

### P0/P1 默认禁止范围

- 不修改 `RoomStore` 的落子、胜负、悔棋、断线判负和重开业务语义。
- 不修改 socket 事件名、邀请 URL 参数、guest/account token 规则。
- 不把服务端权威状态复制成另一套客户端可写状态。
- 不在同一提交中加入 `matchConfig`、点名挑战、赛事或新规则。
- 不把广告插入棋盘、任务栏和高频动作之间。

`IX-07`、`IX-08`、`IX-09` 涉及后端时，应各自建立独立允许文件和迁移计划。

## 验证计划

### 单元测试

- `deriveTableUiState` 的全状态表。
- `getTableActions` 的动作数量、顺序、主次与隐藏规则。
- 用纯函数覆盖 room 为 null/非 null 时大厅与牌桌互斥；当前 Vitest 是 node 环境，没有现成的 Testing Library/jsdom 组件测试栈。
- AI 设置在空局/进行中局的应用策略。

### 现有回归

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run smoke:share-url -- <baseUrl>`
- `npm run smoke:lobby-ui -- <baseUrl>`
- `npm run smoke:matchmaking -- <baseUrl>`
- `npm run smoke:online-room -- <baseUrl>`
- `npm run smoke:room-lifecycle -- <baseUrl>`
- `npm run smoke:presence -- <baseUrl>`
- `npm run smoke:room-chat -- <baseUrl>`
- `npm run smoke:public-chat -- <baseUrl>`
- `npm run smoke:profile-page -- <baseUrl>`

### 新增 UI 冒烟断言

1. 大厅中存在快速匹配，且不存在牌桌动作。
2. Join、Watch、邀请 URL 进入后存在棋盘和任务栏，且不存在大厅创建/加入表单。
3. spectator → sit → ready → playing → finished → restart 的主动作按状态替换。
4. 悔棋请求出现时有明确接受/拒绝入口，其他冲突动作不抢主位。
5. 桌面、低高度桌面、移动端三种视口都能看见任务和可操作棋盘。
6. 退出牌桌后回到大厅并清理 room URL；刷新和 rejoin 仍恢复同一身份。

每个实现小步完成后都执行 `git diff --check`。产品代码阶段按标准开发流程完成测试、lint、build、提交、推送和部署后线上回归；纯文档阶段不运行无关的完整构建。

## 实施顺序与提交切分

推荐按以下顺序，每个编号独立提交，避免大爆炸重构：

1. `IX-00` + `IX-01`：状态测试骨架和工作区分离。
2. `IX-02`：牌桌状态机、任务栏和动作替换。
3. `IX-03`：桌面侧栏与移动端重排。
4. `IX-04` + `IX-05`：大厅入口、空状态和安全切换。
5. `IX-06`：终局历史与回放。
6. `IX-07`：精确大厅汇总，作为独立小型全栈提交。
7. `IX-08`、`IX-09`：分别重新研究、设计协议后实施。

任何一步发现需要改变服务端核心语义时停止扩张，先更新本计划和对应逻辑文档，再单独实施。

## 最终验收标准

- 新用户不理解房间码也能一键开始快速匹配。
- 朋友通过一个链接进入正确牌桌。
- 大厅与牌桌完全互斥，不再出现巨型联机控制面板压在棋盘上方。
- 任一牌桌状态都有明确当前任务，主动作唯一且位置稳定。
- 无关动作隐藏，高频动作总数受控。
- 终局留在原桌，可再战、复盘或退出。
- 桌面和移动端保持相同信息优先级，但采用适合各自空间的排版。
- 刷新、重连、邀请、观战、补位、悔棋、认输、重开等已有能力全部保留。
- 在线指标均可解释且来自真实状态；低活跃时不让空列表成为死路。
- 注册继续增强长期身份，不阻塞游客第一局。
- P0/P1 完成前不以赛事、挑战、多规则或视觉换肤分散主线。
