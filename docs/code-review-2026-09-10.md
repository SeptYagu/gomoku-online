# 代码评审报告 — gomoku-online `src/` 全量审查

- 日期：2026-09-10
- 范围：`src/` 全部业务代码（46 ts + 23 tsx，不含测试文件；server / game / components / i18n / app）
- 方式：静态扫描粗筛 + 四个模块并行人工深读 + 关键结论二次核查
- 基线提交：`aa9b142` (main)

## 修复进展（滚动更新）

| 项 | 状态 | 提交 | 落地方式 |
|---|---|---|---|
| M1 访客身份可冒充 | ✅ 已修 | `7be68a2` | 访客 id 由服务端签发 `guest_*`，客户端传值只作展示名 |
| M2 断线重连丢局 | ✅ 已修 | `7be68a2` | `connect` 补偿 rejoin + 全员掉线 60s 宽限期 |
| M3 AI 战术截断 | ✅ 已修 | `d69d0bd` | 必胜/必挡改在**全量候选池**上判定，截断只留给 α-β 搜索 |
| M4 聊天可重复发送 | ✅ 已修 | `f30e273` | emit 前 ref 闸门 + `isSending*` 禁用按钮 + 乐观清空 |
| M5 水合不一致 | ✅ 已修 | 同上 | 启动快照改走 `useSyncExternalStore`，见下 |
| M6 持久化无界增长 | ✅ 已修 | `2a2c2b6` | 抽 `jsonl-file.ts`（容错读 + 计数告警 + 原子重写）；两个 store 按**追加行数阈值**压缩，文件随 live 条目增长而非写入次数 |
| M7 XFF 可伪造绕过限流 | ✅ 已修 | `2a2c2b6` | 默认**不信任** XFF；`client-address.ts` 统一判定，只有显式 `GOMOKU_TRUST_PROXY=1` 且传输对端是 loopback 才采信 |
| m6 确认态被覆盖 | ✅ 已修 | 同上 | `pendingTransition` 期间锁定模式 pill 并忽略新点击 |
| m7 leaveRoom 无超时 | ✅ 已修 | 同上 | 8s 超时兜底，`onComplete` 必定被调用一次 |
| m3/m4/m5/m8/m10/m11/m14 | ✅ 已修 | `2a2c2b6` | 见下表 |
| 其余 Minor/Nit | ⏳ 未修 | — | 按迭代节奏推进（m1/m2/m9/m12/m13/m15/m16/m17 与架构拆分） |

### M3 复核更正（重要）

原文判断「五连点可能被截断线丢弃」**不成立**：`rankCandidateMoves` 的排序是 tier 优先，
`getCandidateTier` 里 `attack.wins > 0 → tier 0`、`defense.wins > 0 → tier 1`，
两条都排在所有四/三威胁之前，所以必胜/必挡点必然落在 top-14 内。

真正的价值在于「解耦」而不是「修一个必现 bug」：把战术判定从「依赖候选排序正确」改成
「只看棋盘事实」，此后任何人调整 `rootCandidates`、候选排序或分片策略，都不会再把
必胜/必挡手挤出去。原有的 `ai.ts:969` 二次切片属于无副作用的冗余保险（输入已是截断集），
本次未动。测试补了三条：拥挤局面下的必胜、必挡，以及分片一致性 + 密集随机局面的不变量。

### M5 实现说明

原方案的「挂载后 `setState` 恢复」被本仓 lint（`react-hooks/set-state-in-effect`，error）
直接拒绝，且会引入一次级联渲染。改为 `useSyncExternalStore` 方案：

- 新增 `src/components/client-boot-state.ts`：`useBootGameMode()` 提供 `?room=` 决定的初始模式；
- `useFriendRoom` 的 `accountStatus / playerName / joinTarget / isJoiningRoom` 改为
  「覆盖值 ?? 启动快照」：`useState` 只存程序显式设置过的值，未设置时回落到启动快照；
- 服务端快照固定为 `guest / "Player" / "" / false`，与旧的服务端渲染结果一致；
  hydration 阶段 React 用服务端快照，水合完成后再取客户端快照自动重渲染 → 不再有 mismatch。

### 本轮修复说明（`2a2c2b6`）

**M6 持久化无界增长** —— 原来 `persist()` 每写一次就 append 一行，文件大小跟**写入次数**成正比（账号的 last-seen 每 60s 一次、每条对局记录更新一次），长期运行必然吃满磁盘。修法：

- 新增 `src/server/jsonl-file.ts`：`readJsonlFile`（容错读 + 统计跳过行数）、`appendJsonlLine`、`rewriteJsonlFile`（写同目录临时文件后 `rename` 原子替换，崩在中间不会截断日志）、`JsonlCompactionTracker`（计数 + 阈值判定）。
- 两个 store 的 `loadFromFile` 改成走 `readJsonlFile`，把读到的行数灌给 tracker；`persist()` 追加后问 tracker「该压缩了吗」，到了就把内存里最新的 Map 整体重写成一行一条（内存里的 Map 本来就是「后写覆盖先写」的投影，所以重写无损）。
- 效果：文件规模 = `live 条目数 + 阈值`，与写入次数**解耦**。阈值默认各 2000 行，可用 `compactAfterLines` 注入（0 = 关闭，测试用）。

**M7 XFF 可伪造** —— 原实现「只要传输对端是 loopback 就采信 `x-forwarded-for`」，而本机直连时对端就是 loopback，客户端随手伪造一个 XFF 就能每次换一个限流 key，注册限流（5/10min）与 join 限流（20/min）形同虚设，还叠加放大 M6 的存储压力。修法：判定逻辑抽到 `src/server/client-address.ts`（同时消掉 `online-server.ts` 与 `room-socket.ts` 两份重复实现），默认**不信任** XFF，只有显式设了 `GOMOKU_TRUST_PROXY=1`（`1/true/yes/on`）且传输对端确为 loopback 才取 XFF 末段。

> ⚠️ **部署须知**：若线上确实挂在 Nginx/Caddy 之类的可信反代之后，必须设 `GOMOKU_TRUST_PROXY=1`，否则所有请求会被算作同一个 key（`127.0.0.1`）而互相限流。反代务必**覆盖**而非追加客户端传入的 XFF。

**m3/m4/m5/m8/m10/m11/m14**：

| # | 修法 |
|---|---|
| m3 | `profile?.stats?.games/wins/losses/draws`（4 处），`stats` 缺失不再 TypeError |
| m4 | `escapeSgfValue` 增加控制字符剔除（改为先转义、后 `stripControlCharacters`）。**未**按原建议转义 `(` `)` `;`——按 SGF FF[4]，这三个字符只在属性值**之外**有结构含义，值转义它们只会往玩家可见文本里塞无谓反斜杠；测试里加了一个最小属性读取器，证明 `Bob](;B[aa])\evil` 这类名字无法逃出属性 |
| m5 | `undo-response-required` 的操作列表补 `leave`（toolbar），被请求方不再被一个卡住的悔棋请求堵死 |
| m8 | worker 载荷校验抽成纯模块 `ai-worker-request.ts`（`describeInvalidAiWorkerRequest`），非法 board/stone/difficulty/timeLimit/shard 直接回 `type:"error"` 并 return；`chooseAiMoveResult` 外包 try/catch 同样回 error。`GameShell` 侧把 `error` 当作「这个 shard 结束」处理，立刻走应急着法，而不用干等看门狗 |
| m10 | `listPresence` 先前对**每个** presence 都 `[...this.rooms.values()]` 扫一遍全部房间（O(users×rooms) 且每次新分配数组）；改成先建 `playerId → {role, room}` 索引一次，再 O(1) 查表。索引构建保持「先出现的房间获胜」，与原线性扫描语义一致（有测试兜底） |
| m11 | `prune` 原来每次 `consume` 都全表扫 + 超限时 `sort` 取最旧（O(n) + O(n log n)）。改成：① 全表清扫按 `pruneIntervalMs`（默认 = windowMs）节流——过期的 entry 本就在读取时被当作新窗口，清扫只是内存卫生；② 超限时用一次线性扫描找 `resetAt` 最小者（避免 sort）。**保留**「正在被 consume 的 key 永不驱逐」这条守卫，否则等于白送一个新窗口 |
| m14 | 两个 store 的坏行不再静默丢弃，改为统计后各发一条 `console.warn`（`skipped N unreadable line(s)`） |

**R8 连接/加入失败文案** —— `formatConnectionError()` 的英文串、`:464`/`:516` 的入参校验文案、以及 `room:error` 的畸形回退「Room error.」全部进 `dictionary.room`（六语种）：`connectionFailed`（带 `{message}` 占位符）、`connectionFailedXhr`、`roomCodeRequired`、`joinTargetRequired`、`roomError`。hook 保留英文默认值供独立调用。socket 处理器建一次（空 deps），所以用 `messagesRef` 跟随当前语言，避免把 `messages` 塞进每个 callback 的依赖而重建 socket。

顺带把 m2 的建议落成 `src/i18n/dictionaries.test.ts`：遍历六语种断言 key 结构一致、`{...}` 占位符集合一致（`satisfies` 只校验 key，漏写占位符会静默渲染字面量）、无空串。

**R9 维持取舍**：本轮未改「超时后客户端短暂仍认为在房间」的语义（R4 已定），重试会自愈。

### 验证状态

- `npx vitest run`：**24 文件 / 221 passed**（本轮新增 6 个测试文件、33 条用例）。
- `npx tsc --noEmit`：8 条错误，全部是既有基线（`game-record-export.test.ts` 1 +
  `game-record-opening-analysis.test.ts` 1 + `room-socket.test.ts` 6），无新增。
- `npx eslint`：本轮改动的 25 个文件零错误零警告（exit 0）。
- ⚠️ **未做**：真实浏览器冒烟（sandbox 阻止本机端口 / `next dev` 起不来），
  建议人工确认：① 连续收发聊天与离开房间后 `room-error` 文案随语言切换；② 被请求悔棋时能点到「离开房间」；
  ③ 线上若在反代之后，确认 `GOMOKU_TRUST_PROXY=1` 已设置。

## 总体结论

核心功能（房间对战、AI 引擎、复盘、SGF 导出、i18n、限流）实现完整，服务端有大量测试覆盖（rooms.test.ts 1288 行、room-socket.test.ts 1591 行），需求符合度良好，未发现 Critical 级缺陷。主要风险集中在三处：**访客身份可冒充污染天梯**、**断线重连后对局丢失**、**AI 候选截断漏判必胜/必挡手**。另有明显的上帝组件技术债（rooms.ts 2330 行 / useFriendRoom.ts 1507 行 / ai.ts 2571 行 / GameShell.tsx 939 行 / OnlineLobbyView.tsx 873 行）。

---

## Major（按优先级排序）

### M1. 访客 playerId 客户端可控，可冒充身份污染战绩/天梯
- 位置：`src/server/accounts.ts:418-433`（guest 分支）、`accounts.ts:302-313`（createSession）、`src/server/rooms.ts:1692`、`src/server/game-records.ts:565`
- 问题：无 token 时服务端直接用客户端传入的 `playerId` 创建访客会话，`createSession` 只拒绝"已存在的会话"，不校验是否与已注册账号 ID（`acct_*`，见 `accounts.ts:71,192`）或其他访客冲突。`normalizePlayerId`（`accounts.ts:482-484`）仅 trim + 截断。战绩/天梯一律以 `playerId` 为权威键落库，攻击者可用任意 `playerId`（包括猜中的注册 ID 或任意访客 ID）开房对弈，把胜场写进别人名下。
- 建议：访客 playerId 由服务端生成（如 `guest_<random>`），客户端传入值仅作展示名；或至少拒绝 `acct_` 前缀与已注册 ID，并将战绩写入绑定到会话 token 而非裸 playerId。

### M2. 断线重连后不重新订阅/不重新 rejoin，对局会被服务端定时清扫删除
- 位置：`src/components/useFriendRoom.ts:274-276`（connect 处理只 set 状态）、`useFriendRoom.ts:980-1035`（`room:rejoin` 只在挂载 effect 里发）、`src/server/room-socket.ts:774-788`（`closeRoomsWithoutSocketMembers` 每 10s 扫描）
- 问题：socket.io 自动重连成功后，客户端不会重新 `room:rejoin`，房间在 socket.io adapter 里已无人；服务端 sweep 看到房间无 socket 成员就直接 `deleteRoom`。网络抖动超过一个清扫周期（10s）后重连，房间已被删，对局丢失。已核验：rejoin 只由 mount effect 触发，connect 回调无补偿逻辑。
- 建议：在 `socket.on("connect")` 中若有 `room`/storedSession 则自动 `emit("room:rejoin", ...)`；服务端 sweep 改为"房间无 socket 成员且超过 N 秒无人重连"才删（宽限期），或对含未结束对局的房间延长保留。

### M3. AI 根节点候选截断，可能漏判必胜手/唯一防守手（normal 难度最严重）
- 位置：`src/game/ai.ts:291`（`slice(0, profile.rootCandidates)`）、`ai.ts:307,314`（winning/blocking 检测只在截断集合内找）、`ai.ts:969`（`chooseSearchMove` 再次切片）
- 问题：制胜手检测 `findWinningMoves` 只在评分排序后前 14~26 个候选里做。中残局空点密集时，真正的五连点或唯一堵四点可能排到截断线之外被丢弃；`normal` 难度 `depth=1`，子搜索无法补救 → "该赢没赢、该挡没挡"。
- 建议：把必胜/必挡检测放到**全量候选池**（`candidatePool`）上单独做一遍（代价极低，只是逐点试五连），截断只用于后续 α-β 搜索。

### M4. 聊天消息可重复发送
- 位置：`src/components/online/TableRoomChat.tsx:47-54`（发送按钮仅 `!chatText.trim()` 禁用）、`src/components/useFriendRoom.ts:754-756`（ack 成功才清空 `chatText`）；`OnlineLobbyView.tsx:599-606` 公聊面板同理
- 问题：从 emit 到服务端 ack 之间按钮仍可点，连点会重复发同一条消息。
- 建议：加 `sending` 状态在 emit 前置为 true、ack 后复位；或 emit 前乐观清空输入框。

### M5. SSR/CSR hydration 不一致：初始状态在 useState 初始化器里读 window/localStorage
- 位置：`src/components/useFriendRoom.ts:157-161,185`、`src/components/GameShell.tsx:857-863`（`getInitialGameMode` 读 `window.location.search`）、`useFriendRoom.ts:1289`（读 sessionStorage/localStorage）
- 问题：服务端渲染走默认分支（guest / local / "Player"），客户端首屏可能不同，产生 React 水合告警与首屏闪烁。
- 建议：初始值用固定默认值，挂载后（`useEffect`）再从存储/URL 恢复；或用 `useSyncExternalStore`/懒初始化标志。

### M6. 账号与对局记录持久化只追加不压缩，磁盘无界增长
- 位置：`src/server/accounts.ts:270-285`、`src/server/game-records.ts:446-461`（`appendFileSync`）、`:229/:417`（启动全量读取）
- 问题：无 compaction、无上限清理（访客会话有 1 万上限，但账号/对局文件没有），长期运行资源耗尽。
- 建议：定期（如每 N 千条或每日）重写压缩文件；或改用 SQLite。

### M7. 限流键可被 XFF 伪造，限速可绕过
- 位置：`src/server/online-server.ts:220-233`、`src/server/room-socket.ts:1175-1187`（loopback 直接取 `x-forwarded-for` 末段作 key）
- 问题：直连场景下客户端可伪造 XFF 每次换 key，绕过注册限流（5/10min）与 join 限流（20/min），与 M6 叠加放大存储压力。
- 建议：仅在确认部署于可信反向代理后（环境变量开关）才信任 XFF，否则用 `socket.handshake.address`。

---

## Minor

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| m1 | `ai.ts:1908,1967` | 威胁统计里五连被方向扫描+窗口扫描重复计数，`summary.score` 被放大 | 五连只由方向扫描判定，窗口扫描只管四/三形状 |
| m2 | `i18n/dictionaries.ts:1482` | `satisfies` 只校验 key，不校验 `{count}` 等占位符；漏写时 `.replace` 静默失败，用户看到字面量 | 写占位符校验工具/测试，遍历 locale 断言占位符集合一致 |
| m3 | `OnlineLobbyView.tsx:331-334` | `profile?.stats.games` 若 `profile` 存在而 `stats` 缺失会 TypeError | 改 `profile?.stats?.games`（4 处） |
| m4 | `game-record-export.ts:98-100` | SGF 转义不完整（未处理 `(` `)` `;`），玩家名/gameId 可注入或解析失败 | 补全转义或校验白名单字符 |
| m5 | `table-ui-state.ts:150-151` | `undo-response-required` 状态下被请求方没有"离开"操作，可能被卡住 | 该状态的操作列表补 leave |
| m6 | `GameShell.tsx:556-608` | 切换确认弹窗打开时模式 pill 未禁用、无遮罩，可再次触发 `handleModeChange` 覆盖确认态 | `pendingTransition` 时禁用 pill 或加 backdrop |
| m7 | `GameShell.tsx:144-159` | `leaveRoom` 无超时，服务端不响应则 `isTransitioning` 永久 true，模式被锁死 | 加超时兜底复位 |
| m8 | `ai-worker.ts:28-29` | worker 消息直接解构使用，无结构/枚举校验，非法数据可致崩溃 | 校验 board 尺寸/stone/difficulty + try/catch 回传错误 |
| m9 | `GameShell.tsx:415-419` | 每手 AI 行棋 new Worker→terminate，重复初始化 Zobrist 表 + 3600 窗口 | 常驻 worker 池复用 |
| m10 | `rooms.ts:1207-1214,1899` | `listPresence` 对每个 presence 遍历全部房间，O(presence×rooms) | 建 playerId→room 反查索引 |
| m11 | `rate-limit.ts:52-57` | `prune` 每次 consume 全表扫描，高基数下 O(n²) | 概率抽样或惰性删除 |
| m12 | `useFriendRoom.ts:1042` | 自动加入 effect 依赖 `room`，每次快照推送都重跑（靠 ref 早退） | 只依赖原始字段（code/enabled/identityReady） |
| m13 | `OnlineLobbyView.tsx:286,345,488` | 加载中复用按钮文案（"Refresh presence"…），用户误以为可点 | 独立 loading 文案 |
| m14 | `accounts.ts:264`、`game-records.ts:440` | `catch {}` 静默丢弃损坏行，无告警 | 至少 console.warn 计数 |
| m15 | `rooms.ts:1778` vs `:664` | 两条"开始对局"路径（ready 自动开局 / startGame），状态机冗余易歧义 | 合并为单一入口 |
| m16 | `opening-book.ts:20` 等 | 26 条线 `weight:16`、`minDifficulty:"normal"` 全相同，加权与难度过滤均为死代码 | 删字段或真正赋值 |
| m17 | `PlayerProfilePage.tsx:53-109` | 首次 fetch 与 refreshProfile 复制同一段逻辑 | 首载直接调 refreshProfile |

## Nit

- 重复代码：`formatChatMessageTime`（`OnlineLobbyView.tsx:868` ≡ `TableRoomChat.tsx:60`）、XFF/loopback 判定逻辑两份（`online-server.ts:220-233` ≡ `room-socket.ts:1175-1187`）、主题脚本两份（`(root)/layout.tsx:15-21` ≡ `[locale]/layout.tsx:26-32`，root 还硬编码 `lang="en"`）。
- 硬编码魔法值分散：分页 limit 20/30/10/50（`useFriendRoom.ts:519,559,637`、`PlayerProfilePage.tsx:42`）、聊天 160、名字 24、棋盘尺寸 15（`GomokuBoard.tsx:19-30,239-240`）、socket path `/socket.io`（`useFriendRoom.ts:271`）、sweep 周期 10s（`room-socket.ts:184`）、copiedInvite 1800ms（`useFriendRoom.ts:1136`）、`moves.slice(-20)`（`TableSidebarTabs.tsx:80`）。建议集中到 constants 模块。
- `InteractionConfirmation.tsx:27-29` 无 Escape 关闭/焦点陷阱。
- `useFriendRoom.ts:1316-1333` playerId 存 sessionStorage，多标签页各自生成，易触发 `duplicate-player` 重试。
- `useFriendRoom.ts:1503` 把长段部署说明硬编码进错误信息；`:1482` 硬编码多语言默认名列表。

## 架构评估

- **分层清晰**：`online-server`(装配) → `room-socket`(Socket 适配/权限) → `rooms.ts`(状态机) → `game-records`/`accounts`，依赖方向单向，测试覆盖足，这是优点。
- **上帝类/组件是最大技术债**：`rooms.ts`(2330 行) 混杂房间状态机+持久化编排+在场+聊天+天梯入口；`useFriendRoom.ts`(1507 行) 单 hook 返回 60+ 字段管 10 个域；`GameShell.tsx`(939 行) 编排 AI worker+模式状态机+房间+悔棋+回放；`OnlineLobbyView.tsx`(873 行) 内含约 12 个子组件，`FriendRoomController` 作为"万能数据包"props 钻透多层（`GameTableView.tsx` → `TableSidebarTabs.tsx:59`）。
- **建议拆分顺序**（收益/风险比从高到低）：① `useFriendRoom` 拆 socket 层 / lobby / leaderboard / profile / chat 子 hook；② `GameShell` 把 AI 编排抽 `useAiGame`；③ `OnlineLobbyView` 拆文件 + `RoomContext` 取代 props 钻透；④ `rooms.ts` 把聊天与在场（presence）抽独立模块。
- **规则假设**：全仓采用自由规则（无禁手），`board.ts:140`、`ai.ts:1630` 均以 `>=5` 判胜（长连也胜）。当前自洽；若将来引入连珠禁手规则，胜负判定与 AI 威胁识别需整体重写，建议在 README 里明示该假设。

## 修复优先级建议

1. **M1 + M2**（身份冒充、断线丢局）— 影响数据完整性与核心体验，先修；
2. **M3**（AI 漏判必胜/必挡）— 一处小改动（检测前移到全量候选池）；
3. **M4、M5、m6、m7**（交互层小竞态，改动小）；
4. **M6、M7、m10、m11**（长期运行的资源类问题，可放一个迭代）；
5. 其余 Minor/Nit 与架构拆分按迭代节奏推进。
