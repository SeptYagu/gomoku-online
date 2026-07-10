# 交互重构计划真实性核验报告

核验日期：2026-07-10

核验对象：`docs/INTERACTION_REDESIGN_PLAN.md`

状态：完成；发现的问题已同步更正到计划文件

## 1. 核验目标与口径

本报告不把计划文档或竞品研究文档自身当成当前项目事实的证明。核验按以下证据优先级执行：

1. 当前仓库源码与类型。
2. 当前单元/Socket 测试及本轮实际 `npm test` 结果。
3. 当前 smoke 脚本真实断言内容。
4. Stage 3 完成记录与标准工作流，仅用于补充已验证范围和文档流程。
5. 竞品官方页面、官方帮助或锁定的本地研究仓库，仅用于确认设计灵感来源。

判定标签：

- **已证实**：当前源码或测试可以直接证明。
- **已更正**：原计划存在错误、过度概括或遗漏，已经改文档。
- **设计决策**：是将来要实现的目标，不是当前事实，不能用“真实/虚假”描述。
- **待实现验证**：方案可由现有结构支持，但必须在实现后通过测试和浏览器验收。
- **外部证据有限**：上一轮研究有记录，但本轮官方文本证据不足，不把它当成关键事实。

“逐条”按语义原子核验：同一个表格单元或段落中相互依赖的描述合并为一条；当前能力、问题诊断、状态规格、各 Phase 前提和测试可执行性均单独列出。

## 2. 总体结果

- 计划的主方向成立：当前最高价值缺口确实是大厅/牌桌混排、状态动作组织不完整和移动端优先级错误。
- 当前服务端能力的描述大部分成立，并有 `rooms.test.ts`、`room-socket.test.ts` 和 smoke 脚本证据。
- 计划不是可以原样执行的“零错误版本”。本轮发现并修正了 22 组问题，包括错误行号、过度概括、状态机漏项、公开链接房误称朋友私密桌、不可达取消匹配按钮、可观战分组、socket 离房竞态、版本缺口检测误写、跨局历史来源和多实例统计边界。
- 优先级、组件命名和未来模型属于设计决策，不应伪装成从源码推导出的唯一答案。
- 本轮 `npm test` 实际通过：13 个测试文件、109 个测试用例。
- 后续竞品复核把“最多一个主动作”收紧为“一个主任务、1–2 个决策动作、全部不超过 4”，并新增双方再战和非阻塞悔棋响应任务；这些是基于已核实竞品模式的本项目设计决策。
- 统一房间入口方案可行，但现有 `acct_...` 不具备可读性，也不能替换规范房间码；已把 `@publicHandle`、服务端原子解析、显式房主索引和 unlisted/授权边界拆成独立 P1 任务。

## 3. 研究范围和文件指针核验

| ID | 原计划断言 | 判定 | 证据与处理 |
| --- | --- | --- | --- |
| V-01 | 竞品研究覆盖 9 个产品 | 已证实 | `docs/COMPETITOR_INTERACTION_RESEARCH.md:1092-1102` 的横向矩阵列出 PlayOK、scheng20、minh100、sen、gkoos、BGA、FlyOrDie、PaperGames、Vint.ee。 |
| V-02 | 所列项目文档均被“完整通读” | 已更正 | 上一轮完整通读的是竞品研究；其他逻辑/进度文档是按相关章节核对。计划已改为准确的核对范围，不再声称全部逐行完整通读。 |
| V-03 | `GameShell.tsx` 行号指向准确 | 已证实 | 总编排 92、模式切换 127、渲染 427、`FriendRoomControls` 721、`RoomLobbyList` 1386 均准确。 |
| V-04 | `useFriendRoom.ts` 原四个行号指向准确 | 已更正 | 原 40/164/341/891 有三处落在错误语义上。已改为 controller 55、权限 172、创建/加入/匹配 323、auto rejoin 889。 |
| V-05 | `rooms.ts` 与 CSS 行号指向准确 | 已证实并补强 | `RoomStatus` 16、创建 341、重开 808、网格 102、房间面板 304、右栏 1453 均准确；响应式入口另补 `globals.css:1545`。 |
| V-06 | 计划文件中的能力是当前 checkout，而不是旧 handoff 推测 | 已证实 | 本轮直接读取当前 `main` 源码；开始时 `main` 与 `origin/main` 同步，只有既有未跟踪 `.codex/`。 |

## 4. 当前能力矩阵逐条核验

| ID | 能力断言 | 判定 | 当前证据 |
| --- | --- | --- | --- |
| C-01 | 存在本地、AI、在线三种模式 | 已证实 | `GameShell.tsx:58` 定义 `local/ai/room`，`GameShell.tsx:446-474` 渲染三入口。 |
| C-02 | 游客可免注册开始在线路径并获得随机昵称 | 已证实 | `account-identity.ts` 仅在 loading 时阻塞；`useFriendRoom.ts:205-219` 构造 guest payload；`useFriendRoom.ts:1339-1340` 生成随机 `Player ####`。 |
| C-03 | 快速匹配已有单进程服务端实现 | 已证实 | `rooms.ts:398-420` 在同一个 `RoomStore` 中查最早 waiting 房或创建新房；`smoke-matchmaking.ts` 覆盖创建、加入、不超员和取消。这里只能称单进程原子路径，不代表多实例分布式原子性。 |
| C-04 | 创建、按码加入、邀请 URL 和身份恢复已实现 | 已证实 | `useFriendRoom.ts:323-413` 创建/加入/匹配；`889-947` URL/stored session rejoin；`smoke-share-url.ts:181-187` 的真实断言覆盖 URL、自动加入、复制、离房清理和注册身份恢复。 |
| C-05 | 大厅展示 waiting/playing，支持 Join/Watch 与增量事件 | 已证实 | `rooms.ts:1695-1712` 默认列表只保留 waiting/playing；`GameShell.tsx:1412-1446` 选择 Join/Watch；`useFriendRoom.ts:264-276` 消费 updated/deleted。 |
| C-06 | 第三人观战且可在允许状态补位 | 已证实 | `rooms.ts:449-459` 第三人/对局中加入 spectator；`481-542` sit；`rooms.test.ts:172`、`:259` 和 `room-socket.test.ts:947` 覆盖。 |
| C-07 | 准备后自动开局 | 已证实 | `rooms.ts:578-595` 更新 ready，`1615-1623` 双方 ready 直接把状态设为 playing；`rooms.test.ts:474` 和 socket 测试覆盖。`RoomStatus` 虽保留 `ready` 类型，当前自动流程不长期停在该状态。 |
| C-08 | 服务端权威落子、悔棋、认输、重开 | 已证实 | `rooms.ts:623-671` 落子；`699-805` 悔棋；`674-697` 认输；`808-848` 重开；对应单元和 socket 测试均存在。 |
| C-09 | 只有房主能重开，且重开交换下一局先手 | 已证实 | `rooms.ts:817-830` 检查 host 并交换 `nextStartingSeat`；`rooms.test.ts:887-923` 断言非房主失败、回到 waiting、先手轮换和重新 ready。 |
| C-10 | 房间聊天和公共聊天均已实现 | 已证实 | `GameShell.tsx:1268-1384` 两个独立面板；`useFriendRoom.ts:661-711` 两组 socket 动作；room/public chat smoke 均存在。 |
| C-11 | Presence 有 online/in_room/playing/spectating/offline | 已证实 | `rooms.ts:66` 类型，`1753-1770` 从连接与房间事实推导；默认 UI 请求只返回在线样本。 |
| C-12 | Profile、棋谱回放、SGF 和排行榜已有基础版 | 已证实并澄清 | `PlayerProfilePage.tsx:182-249` 逐手回放；`record-replay.ts` 纯函数；`game-record-sgf.ts` 导出；`game-records.ts` Profile/Leaderboard 类型和查询。Profile 已有 `src/app/[locale]/profile/[playerId]/page.tsx` 独立路由，但巨型房间面板仍重复渲染 Profile 摘要和排行榜。 |
| C-13 | 当前没有 matchConfig、点名挑战和赛事模型 | 已证实 | 对 `src` 搜索 `matchConfig/seriesLength/acceptingChallenges/challenge/tournament/pairing` 无对应实现；现有 `RoomSnapshot` 也没有这些字段。 |
| C-14 | 当前固定规则相当于长连也获胜的 freestyle 语义 | 已证实并澄清 | `board.ts:138-141` 使用 `line.length >= 5`，`board.test.ts:147-152` 明确六连也胜。计划已写明 `freestyle` 是候选命名及其对应语义。 |
| C-15 | 当前“创建朋友桌”是私密房 | 已否定并更正 | `CreateRoomInput`、`RoomSnapshot`、`RoomListItem` 没有 visibility/private/inviteCode，默认 waiting/playing 房会进入大厅。当前只有可分享链接房，不具备私密发现/加入语义。 |

## 5. 当前交互问题逐条核验

| ID | 问题断言 | 判定 | 当前证据与更正 |
| --- | --- | --- | --- |
| I-01 | 在线时房间面板先于棋盘渲染 | 已证实 | `GameShell.tsx:529` 渲染面板，`:531-545` 才渲染棋盘。 |
| I-02 | 进入牌桌后大厅内容仍存在 | 已证实 | `FriendRoomControls` 不以 snapshot 区分整个工作区；公共聊天、用户、Profile、排行榜和列表在 `821-829` 无条件渲染，桌内内容从 `831` 继续追加。 |
| I-03 | 昵称和房间码在在线模式始终展开 | 已证实 | `GameShell.tsx:738-759` 没有 room/snapshot 条件。 |
| I-04 | 快速匹配、创建、按码加入并列 | 已证实 | 未进房时 `GameShell.tsx:797-817` 同一区域渲染三动作。 |
| I-05 | 所有牌桌动作都只靠 disabled | 已更正 | 不是全部。准备和坐下分别在 `907`、`929` 条件渲染；悔棋、认输、重开在 `917-928` 常驻并 disabled；离开常驻。计划已改为“状态驱动不完整”。 |
| I-06 | 右栏只有状态、步数和广告 | 已证实 | `GameShell.tsx:548-591` 正好是三块；玩家、观战者和聊天都在主区面板。 |
| I-07 | 桌面右栏固定 320px | 已更正 | 宽桌面是 320px（`globals.css:102-105`），901–1400px 是 280px（`:1562-1566`）。计划已统一写 280–320px。 |
| I-08 | 从在线切到本地/AI 会直接调用 leave | 已证实 | `GameShell.tsx:127-140` 无确认调用 `friendRoom.leaveRoom()`，随后立即切模式并 reset。 |
| I-09 | 对局中 leave 等价于立即删除席位 | 已更正 | `rooms.ts:925-927` 对局中 leave 调 `markDisconnected`；默认 60 秒宽限来自 `rooms.ts:291`。非对局玩家和观战者才立即释放。计划已写清。 |
| I-10 | AI 难度/先手变化立即重置棋局 | 已证实 | `GameShell.tsx:142-150` 两个 handler 均直接调用 `resetGame()`，没有已有落子确认。 |
| I-11 | 900px 以下变单栏，640px 以下多区块继续堆叠 | 已证实 | `globals.css:1545-1560` 主网格改单栏，`:1577-1637` 房间网格和侧栏继续单列。由于房间面板 DOM 在棋盘前，顺序问题仍在。 |
| I-12 | 棋盘当前完全没有高度约束 | 已更正 | 当前已有 `globals.css:1137-1143` 的 `78vh` 和中宽桌面的 `76vh`。未来任务应保留并按新增任务栏校准，而不是从零新增。 |
| I-13 | “9 个产品逐一形成大厅/牌桌共识” | 已更正 | AI-only 产品没有大厅，不能这样概括。计划已改为：在线平台直接支持，大厅外的 AI/本地项目只支持独立棋盘工作区。 |
| I-14 | 当前 Cancel Match 按钮在单人匹配等待时可用 | 已否定并补计划 | `canCancelMatch` 需要 `room`/snapshot 存在，但按钮只位于 `snapshot` 为 false 的分支，因此 UI 不可达。服务端 cancel 事件和 smoke 存在，不等于按钮路径工作。新牌桌等待态需提供可达的取消等待/退出。 |

## 6. 牌桌状态规格逐条核验

| ID | 状态规格 | 判定 | 证据与处理 |
| --- | --- | --- | --- |
| S-01 | role/seat/status/ready/currentTurn/undoRequest 足以派生主要 UI 状态 | 已证实 | 字段存在于 `RoomClientState` 和 `RoomSnapshot`；`useFriendRoom.ts:172-196` 已用同组字段推导权限。 |
| S-02 | spectator 可根据空座显示 Sit | 已证实并收紧 | 当前正确入口是 controller 的 `canSit`；计划判定已改为直接使用 `canSit=true`，避免复制 `hasOpenPlayerSeat` 规则。 |
| S-03 | 一人等待、两人未准备、自己已准备可以区分 | 已证实 | `players.length` 与每个 player 的 `ready` 都在快照中；双方 ready 后立即 playing。 |
| S-04 | 我的回合/对手回合可以区分 | 已证实 | `currentTurn` 与自己的 `seat` 可直接比较，现有 `getRoomStatusText` 已这样做。 |
| S-05 | 待回应悔棋需要覆盖普通回合 | 已证实 | `rooms.ts:636-638` 待处理请求阻止落子；现有 target modal 位于 `GameShell.tsx:1458-1543`。 |
| S-06 | 原状态表覆盖了完整悔棋流程 | 已更正 | 原表只有 target 的 `undo-response-required`，漏了 requester 等待。已新增 `undo-request-pending`，并让普通 playing 状态排除待处理悔棋。 |
| S-07 | 可准确显示“取消匹配” | 已更正 | controller 没有保存 room origin；`canCancelMatch` 只检查单人 waiting 房，朋友桌也可能满足。未新增可恢复 entry intent 前统一写“取消等待/退出”。 |
| S-08 | 房主点击重开会立即开始下一局 | 已更正 | 重开只回到 waiting、清 ready，双方重新 ready 后才开局。计划主动作已改为“重置为下一局等待”。 |
| S-09 | abandoned 可作为牌桌终止状态 | 已证实但可能短暂 | 类型和状态文案存在；部分全断线路径会马上删房，因此 UI 是否看见取决于广播/连接时机，不能依赖该状态长期展示。返回大厅仍是安全降级。 |
| S-10 | 连接状态适合做覆盖层而非第二套业务状态 | 设计决策 | 当前已有 idle/connecting/connected/disconnected，可作为派生 UI 输入；最终表现需实现后验证。 |
| S-11 | 状态表可以忽略 `RoomStatus="ready"` | 已更正 | 当前 `updateRoomStatus` 确实直接从 waiting 进入 playing，但类型和现有文案仍保留 ready。计划已新增 `ready-compat` fallback，并明确不能重新引入 Start。 |

## 7. 各实施阶段的真实性与可行性

| ID | Phase 前提或动作 | 判定 | 核验结论 |
| --- | --- | --- | --- |
| P-01 | `room === null` / 非 null 可互斥大厅与牌桌 | 待实现验证 | 数据边界真实且清晰；建议新增纯函数 selector 后用 node Vitest 测，不假设当前已有组件测试环境。 |
| P-02 | 现有 URL 自动加入可直接落到新牌桌 | 待实现验证 | URL/rejoin 能力真实；为避免大厅闪现需要增加 joining gate，这是新 UI 行为。 |
| P-03 | 本地/AI 模式不会创建 socket | 已更正为待实现 | 当前不绝对成立：`useFriendRoom` 总是挂载，只要 stored room session 存在，`889-947` 可能在本地模式 auto rejoin。计划已新增 enabled gate，并补充门控不能在 `room:leave` ack 前提前断开活跃 socket，否则会制造新的离房竞态。 |
| P-04 | `deriveTableUiState` / `getTableActions` 可做纯函数 | 待实现验证 | 输入均是序列化快照和 capabilities，不依赖 DOM；适合当前 node Vitest。函数尚不存在。 |
| P-05 | 当前已有明确悔棋 modal 可复用 | 已证实 | `RoomUndoRequestOverlay/Dialog` 已实现 target 响应与倒计时；请求方等待提示仍要新增。 |
| P-06 | 可复用现有 280–320px 右栏 | 已证实 | CSS 网格已有；是否适合全部桌边内容仍需三个视口的浏览器验收。 |
| P-07 | 现有 UI 已验证 1440×900、1280×720、390×844 | 未实现，计划没有冒充已完成 | 现有 smoke 没有设置这些 viewport；它们是 IX-00 要新增的基线。 |
| P-08 | 当前列表是 20，presence 样本是 30 | 已证实 | `useFriendRoom.ts:440` 与 `:480`。因此不能直接标成全站总数。 |
| P-09 | 精确汇总只需“小幅服务端改动” | 已更正并限定 | 对当前单进程 store 是小改；多实例全站精确值需要 Redis/PostgreSQL 等共享状态，不能沿用单实例计数冒充全站。 |
| P-10 | lobby client 已有版本缺口 full resync | 已更正 | 服务端 ack/event 有 version，但 `useFriendRoom.ts:264-276` 忽略 version，只做 upsert/delete。Phase 7 必须新增客户端版本跟踪和缺口 resync。 |
| P-11 | `onlineUsers` 等于所有网站访客 | 已更正并定义 | 当前 Presence 只统计加入 presence channel 的身份。计划已定义为已加入 presence 且连接数大于 0 的去重身份；若要全部访客需另加连接级统计。 |
| P-12 | 当前 `RoomSnapshot.moves` 足够提供跨重开历史 | 已更正 | `restartGame` 清空 moves 并更新 gameId；跨局历史必须从已保存 game record 读回。聊天和玩家在重开中确实未清空。 |
| P-13 | 当前已有逐手回放逻辑可复用 | 已证实 | `record-replay.ts` 和 `PlayerProfilePage.tsx` 已使用；接入牌桌是新工作，不等于零成本。 |
| P-14 | `matchConfig` 可以只做前端表单 | 已否定，计划原本已正确隔离 | RoomSnapshot/RoomState/socket/记录均需扩展；计划放在独立 P2 全栈任务是正确边界。 |
| P-15 | 点名挑战/busy 可以只移动按钮 | 已否定，计划原本已正确隔离 | 当前没有挑战邀请状态、过期/接受/拒绝/限流；必须是独立后端任务。 |
| P-16 | 赛事应在 P0/P1 实现 | 已否定，计划原本已延期 | 当前没有 tournament/round/pairing；延期不会阻塞核心交互重构。 |
| P-17 | “可观战”等同于“正在进行” | 已更正 | `getRoomListItem` 在 playing **或玩家已满**时给 `canWatch=true`；满员 waiting 房也可观战。计划已把分组改成“可加入/可观战”，并要求显示真实 waiting/playing 状态。 |
| P-18 | Profile 还没有独立入口 | 已更正 | Profile 已有 locale 路由；真正需要移除的是房间面板里的重复 Profile 摘要，并把排行榜从主开局流程下沉。 |
| P-19 | activity summary 可直接复用 lobby room version | 已更正 | 在线人数由 presence 变化驱动，room lobby version 不覆盖全部变化。候选 summary 已增加独立 version，并要求 summary 整份替换/缺口重拉。 |
| P-20 | “和朋友玩”入口可以在不改后端时承诺私密 | 已更正 | 入口分层本身是前端改动，但私密性不是。IX-04 只能如实称链接房；visibility、邀请授权和大厅隐藏必须另立全栈任务。 |
| P-21 | 从客户端列表隐藏房间即可成为私密房 | 已否定 | 服务端 `listRooms`、`joinRoom` 和房间快照都需要共同执行可见性/授权；仅隐藏 UI 不能防止按码加入或 API 枚举。 |

## 8. 竞品依据的独立抽查

计划中的组件名和优先级是本项目设计决策；竞品只能证明某种交互模式真实存在，不能证明它是唯一正确答案。本轮抽查结果如下：

| ID | 研究启发 | 判定 | 独立来源 |
| --- | --- | --- | --- |
| E-01 | PlayOK 具有游客入口、live opponents、game rooms、rankings、stats、profiles、messages、records、mobile | 官方证实 | [PlayOK Gomoku](https://www.playok.com/en/gomoku/) 与 [PlayOK 首页](https://www.playok.com/) 的官方功能说明。详细牌桌布局仍来自上一轮截图/客户端研究，不用官方功能列表替代布局证据。 |
| E-02 | BGA 使用稳定 Action Bar、最多四个动作、棋盘动作直接在棋盘完成、移动端目标至少 32px | 官方证实 | [BGA Studio Guidelines](https://en.doc.boardgamearena.com/BGA_Studio_Guidelines) 与 [官方 UX PDF](https://en.doc.boardgamearena.com/images/5/57/Guidelines_UX_new_compressed.pdf)。 |
| E-03 | FlyOrDie 把多局、棋盘、计时、开局规则、rated/unrated 建成比赛设置 | 官方证实 | [FlyOrDie Gomoku Help](https://www.flyordie.com/games/help/gomoku/en/)；官方锦标赛规则也证实 Tournament Room、挑战/自动配对两种模式。 |
| E-04 | PaperGames 支持 guest、朋友唯一链接、日赛和最高 512 人自建赛事 | 官方证实 | [PaperGames 官方平台页](https://papergames.io/en/)；这些只支持“入口按意图分流”和“朋友链接”方向，不决定本项目具体组件命名。 |
| E-05 | Vint.ee 有长期 rating、Gomoku 排行和正式赛事层 | 官方证实 | [Vint.ee Gomoku Rankings](https://www.vint.ee/en-gb/rankings/4/1/) 和 [2025/26 学生赛事](https://www.vint.ee/en-gb/event/1107)。 |
| E-06 | Vint.ee 当前 UI 一定有 `I am busy`，FlyOrDie 当前 Gomoku UI 一定按同样方式显示 Challenge/Watch | 外部证据有限 | 这些来自上一轮 live UI 观察/研究记录；本轮文本可索引的官方材料没有完整复现所有控件。Phase 9 仍可把它当设计灵感，但不能把具体控件当成已独立复核的事实。 |
| E-07 | scheng20/minh100/sen/gkoos 的研究 checkout 存在且版本固定 | 已证实 | `.research` 当前 commit：scheng20 `326a33d`、minh100 `41efe07`、sen `e24995d`、gkoos `fb28fc6`；本轮抽查其 Lobby、RoomForm、侧栏历史和开局锁定代码锚点。 |

## 9. 测试与验证命令真实性

| ID | 计划中的验证项 | 判定 | 证据 |
| --- | --- | --- | --- |
| T-01 | `npm test`、lint、build 命令存在 | 已证实 | `package.json` scripts 中均存在。 |
| T-02 | 计划列出的 share-url、lobby-ui、matchmaking、online-room、room-lifecycle、presence、chat、profile smoke 命令存在 | 已证实 | `package.json` 对应 scripts 与 `tools/smoke-*.ts` 文件均存在。 |
| T-03 | 现有 smoke 已覆盖计划中的新工作区互斥与三个 viewport | 未实现 | 当前 `smoke-lobby-ui.ts` 只验证 leaderboard 提交及 Join/Watch，没有设备尺寸模拟，也没有未来组件 selector；计划正确把它们列为新增断言。 |
| T-04 | 当前核心行为测试仍通过 | 已证实 | 本轮实际运行 `npm test`：13 个测试文件、109 个测试用例全部通过。 |
| T-05 | 文档-only 至少执行 diff check，不必完整 build | 已证实 | `STANDARD_DEVELOPMENT_WORKFLOW.md:455-462` 与 `STANDARD_RESEARCH_WORKFLOW.md:193-202`。本轮额外运行测试是为核验当前行为，不是文档提交门禁所强制。 |

## 10. 已同步到计划的更正清单

1. 把“所有支撑文档均完整通读”改成真实核对范围。
2. 修正 `useFriendRoom.ts` 四组证据行号。
3. 把“稳定系统”改成“已有且有测试覆盖”，避免把稳定性当绝对事实。
4. 删除“9 个竞品逐一形成相同共识”的过度概括。
5. 把“状态只控制 disabled”改为“状态驱动不完整”，承认 Ready/Sit 已条件渲染。
6. 把右栏宽度从固定 320px 更正为 280–320px。
7. 补上悔棋请求方的 `undo-request-pending` 状态。
8. 删除无来源的“取消匹配”判断，记录当前没有 room origin。
9. 写清 restart 只回到 waiting，双方必须重新 ready。
10. 写清本地模式残留 room session 仍可能 auto rejoin，需要 enabled gate。
11. 写清棋盘已经有 vh 高度约束，后续是校准而非从零增加。
12. 写清跨局历史不能只依赖会被 restart 清空的 `RoomSnapshot.moves`。
13. 写清客户端尚未实现 lobby version gap 检测/full resync。
14. 写清精确活跃度只在当前单进程范围成立，多实例需要共享状态，并定义 onlineUsers 口径。
15. 为兼容类型中的 `RoomStatus="ready"` 增加安全 fallback，不重新引入 Start。
16. 把“进行中可观战”改为“可观战”，避免漏掉满员 waiting 房。
17. 写清 Profile 已有独立路由，目标是移除重复摘要并下沉排行榜，不是重复新建 Profile 页面。
18. 为在线启用门控补上 leave ack 时序，避免门控本身造成断线竞态。
19. 为 activity summary 增加独立版本口径，不能把只覆盖房间变化的 lobby version 当成 presence 版本。
20. 把当前“朋友桌”更正为公开可发现的链接房，不承诺不存在的私密性。
21. 将真正私密朋友桌明确拆为服务端可见性/授权全栈任务，禁止只隐藏前端列表。
22. 记录当前 Cancel Match 按钮因渲染分支矛盾而不可达，并把可达的取消等待列为 IX-04 明确任务。

## 11. 再次与竞品对照后的增量核验

| ID | 原计划/新建议 | 判定 | 证据与处理 |
| --- | --- | --- | --- |
| E2-01 | 每个状态只能有一个主动作按钮 | 已更正 | BGA 直接证据是“上下文 + 最多四个按钮”（`COMPETITOR_INTERACTION_RESEARCH.md:653-661`），不是永远只能有一个按钮。计划已改为一个明确主任务、1–2 个当前决策动作、总数不超过 4。 |
| E2-02 | 普通落子不进入任务栏 | 保留 | BGA 的普通落子直接在棋盘完成，特殊确认才进入动作栏（`:655-660`）；这与本项目现有棋盘操作一致。 |
| E2-03 | 悔棋只能用当前阻塞 modal | 设计决策已调整 | 当前 modal 确实存在；BGA 研究同时给出“不使用阻塞式弹窗打断对局”（`:672-678`）。计划因此优先使用非阻塞任务栏响应，保留 modal 作为过渡/小屏 fallback，而不是谎称当前已经实现。 |
| E2-04 | 房主单方面 restart 足以表达再战 | 当前能力真实但产品逻辑偏弱 | PlayOK 研究直接支持终局留桌和连续再战（`:68-80`、`:112-154`）；横向结论的状态机另行提出 `rematch-ready`（`:1126-1137`）。当前源码只有 host restart；计划新增双方 readiness，属于本项目设计决策和后端新能力，不冒充 PlayOK 控件事实。 |
| E2-05 | 现有公开链接房足以等价朋友私密房 | 已否定并拆任务 | PaperGames 的公开产品路径强调朋友唯一链接（`:863-925`），但这只证明朋友入口值得做，不证明本项目当前链接房私密。计划继续把 unlisted/邀请授权作为独立全栈任务。 |

## 12. 注册玩家 ID 与统一加入框增量真实性核验

| ID | 断言或方案 | 判定 | 当前证据与处理 |
| --- | --- | --- | --- |
| A-01 | 当前注册 `playerId` 是可读的已注册 ID | 已否定 | `accounts.ts:63` 定义前缀，`:146-155` 生成 `acct_` + 8 字节随机 base64url；它稳定但仍是随机串，不能解决“方便记忆传播”。 |
| A-02 | 当前 `playerId` 全局绝对唯一 | 已收紧 | `accounts.ts:71` 只有当前 store 的 Map，`:146-155` 在该 Map 中尝试避碰；默认运行时写 JSONL（`room-store.ts:5-10`），但独立多实例之间没有共享唯一索引。只能称当前 store 内碰撞检查 + 高概率唯一，不能承诺全局绝对唯一。 |
| A-03 | 当前 displayName 可以直接当房间查找键 | 不建议 | `accounts.ts:88-100` 创建时检查重名，`:158-160` 在当前 store 内忽略大小写比较；但 displayName 是展示数据，允许空格/Unicode 且没有显式协议语法。计划新增独立 `@publicHandle`，不接受裸 displayName。 |
| A-04 | 当前加入框已经能接收账户 ID | 已否定 | `GameShell.tsx:749-757` 限长 8；`useFriendRoom.ts:809-811` 把输入整体大写；原始 `acct_...` 会被截断并改变大小写。 |
| A-05 | 只改前端输入框即可支持房主 ID | 已否定 | 当前 `room:join` 只接受 `{ roomCode }`（`room-socket.ts:69-72`），客户端也只规范化房间码并发该事件（`useFriendRoom.ts:342-393`）。需要服务端解析、索引、生命周期和隐私策略。 |
| A-06 | 可以让账户 ID 替换 roomCode | 已否定 | 创建房间独立生成 code（`rooms.ts:341-364`）；hostSeat 会转移（`:529-530`、`:1667-1669`）；进行中玩家 leave 只标记断线（`:903-939`）。账户身份与房间生命周期不是同一个键。 |
| A-07 | 成功解析后可以继续沿用现有 URL/session 契约 | 待实现但边界已证实 | `useFriendRoom.ts:305-317` 已从 ack 的 `snapshot.code` 更新 joinCode、URL 和 stored room session；新解析事件只要返回同一 RoomClientState，就能继续以规范 code 收敛。 |
| A-08 | 扫描所有房间按 host account ID 取任意一个即可 | 已否定 | `leaveParticipantRooms` 会遍历其他房间（`rooms.ts:1268-1297`），但 playing room leave 会保留断线席位。必须维护“每个注册账户最多一个可发布房主别名目标”的显式索引，不能依赖扫描或 newest 猜测。 |
| A-09 | 允许按房主 ID 查找没有隐私影响 | 已否定 | 房主 ID/handle 查询可被用于探测某人是否有活跃房间。计划要求统一模糊错误、限流、审计，并让 unlisted 房默认关闭房主别名查找；这是待实现安全边界。 |
| A-10 | 邀请 URL、房间码、handle、账户 ID 可以共用一个输入框 | 可行，待实现验证 | 采用带前缀的确定语法可以避免猜测：URL 解析 query、`@` 解析 handle、`acct_` 解析账户 ID，其余才按房间码；必须由服务端一次完成解析和加入，避免先 resolve 后 join 的竞态。 |

增量方案的最终职责划分：

- `roomCode`：规范房间键，继续进入 URL、session、socket room、gameId 和记录。
- `playerId`：内部注册身份；可作为兼容 join target，不主推给用户记忆。
- `publicHandle`：新增的可读、唯一、不可随 displayName 漂移的公开传播标识。
- `displayName`：展示名称，不直接承担路由协议。
- invite token：仅在未来承诺强邀请授权时引入；`unlisted` 本身只解决公开发现，不自动等于私密。

## 13. 核验后的最终判断

可以继续执行的第一批仍是 `IX-00 + IX-01`，但实现前必须采用本轮更正后的版本：

- 先实现纯函数工作区/牌桌状态选择器及 requester/target 两类悔棋状态测试。
- 再拆大厅与牌桌，并给 `useFriendRoom` 加在线模式启用门控。
- 保持现有 URL、room socket、权威落子、ready 自动开局和当前重开兼容语义不变。
- 不在第一批提交中实现统一加入 resolver、public handle、unlisted、双方 rematch、精确全站统计、matchConfig、挑战或赛事。

这份计划现在可以作为实施起点，但仍不是“代码尚未写就已经被证明正确”的规格。所有标为设计决策或待实现验证的条目，必须在对应 Phase 完成后用单元测试、三个 viewport 的浏览器检查和现有在线 smoke 再次验收。
