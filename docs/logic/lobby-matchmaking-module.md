# 大厅与匹配模块逻辑

更新日期：2026-07-10

## 参考来源

- `minh100/Gomoku`：无仓库级 LICENSE，只参考大厅、房间列表、私密房和随机找局流程。
- PlayOK gomoku 页面：只参考 live opponents、game rooms、rankings、stats、profiles、contacts、private messaging、game records、mobile support 等产品方向。
- PlayOK 社交结构研究资料：只参考大厅活动桌列表、房间在线用户列表、公共聊天、单桌成员/玩家位/聊天区这些结构性概念。

## 关键文件和证据

客户端：

- `.research/minh100-Gomoku/client/src/Components/Lobby/Lobby.js:18-39`：初始化大厅、发 `joinLobby`、监听 `lobby`。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Lobby.js:45-48`：向 `RoomForm` 和 `RoomList` 传 rooms/users。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:19-20`：随机 `ratingWin/ratingLose`。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:30-50`：`roomData` 初始状态。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:54-80`：Find Game 逻辑。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:86-109`：Custom Game 逻辑。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:114-132`：随机房名和清空表单。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomForm.js:196-269`：自定义房间弹窗表单。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomList.js:7-17`：搜索过滤状态。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/RoomList.js:54-83`：表头、排序、渲染房间。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/IndividualRoom.js:12-38`：密码校验和加入房间。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/IndividualRoom.js:47-107`：房间行展示与 Join/In Game 状态。
- `.research/minh100-Gomoku/client/src/Components/Lobby/Room/IndividualRoom.js:109-128`：Wrong Password 提示。

服务端：

- `.research/minh100-Gomoku/server/index.js:47-57`：`joinLobby`。
- `.research/minh100-Gomoku/server/index.js:61-73`：`gameCreated`。
- `.research/minh100-Gomoku/server/index.js:78-92`：`updateRoom`。
- `.research/minh100-Gomoku/server/index.js:119-127`：`deleteGameRoom`。
- `.research/minh100-Gomoku/server/index.js:134-144`：`leftGame`。
- `.research/minh100-Gomoku/server/socketServer.js:5-23`：读房间和构造房间。
- `.research/minh100-Gomoku/server/socketServer.js:25-45`：加人并更新 DB。
- `.research/minh100-Gomoku/server/Models/roomModel.js:4-29`：房间基础字段。
- `.research/minh100-Gomoku/server/Models/roomModel.js:30-85`：内嵌 game 默认结构。

## 参考实现细节

### 大厅订阅

`Lobby` 组件挂载时：

- 调用全局状态的 `getAllRooms` 和 `getAllUsers`。
- 发出 socket 事件 `joinLobby`。
- 监听服务端 `lobby` 事件。
- 收到 `{ roomArray, userArray }` 后设置本地 `allRooms` 和 `allUsers`。

服务端收到 `joinLobby`：

- 从 MongoDB 读取所有 rooms。
- 从 MongoDB 读取所有 users。
- `io.sockets.emit("lobby", { roomArray, userArray })` 广播给所有连接。

风险：

- 没有单独 lobby channel，全局广播给所有 socket。
- 每次变化广播完整 rooms/users。
- `Lobby` 的监听 effect 依赖房间状态，会造成不必要的重复注册。

### Find Game

客户端完成匹配决策：

- 从当前 `rooms` 过滤 `playerArray.length < 2 && password === ""`。
- 如果存在可加入房，取第一个。
- 直接把当前用户 push 到该 room 的 `playerArray`。
- 构造一个 `Game(15, ...)`。
- 发 socket `updateRoom`。
- 跳转 `/play/:roomName`。

没有可加入房：

- 调 random-word-api 取两个英文单词。
- 首字母大写后拼接成房名。
- 把当前用户放进 `playerArray`。
- REST 创建房间。
- 发 socket `gameCreated`。
- 跳转游戏页。

风险：

- 匹配完全由客户端决定。
- 客户端直接修改 room 对象。
- 随机房名没有服务端唯一性保证。
- REST 创建和 socket 广播之间可能有竞态。

### ratingWin/ratingLose

`RoomForm` 渲染时生成：

- `ratingWin = Math.floor(Math.random() * 6) + 20`
- `ratingLose = Math.floor(Math.random() * 6) + 20`

范围是 20-25。

这些值进入 `roomData`，服务端结算评分时使用。

风险：

- 加减分随机，不符合可解释评分系统。
- 客户端可篡改。
- 与对手强弱无关。

### Custom Game 与密码房

Custom Game：

- 弹窗表单。
- 房名必填，最大长度 26。
- 密码可选。
- 客户端遍历当前 rooms，用 `roomName.toLowerCase()` 检查重名。
- 不重名则创建房间、发 socket、跳转。

密码房：

- `IndividualRoom` 客户端判断 `passwordInput === room.password`。
- 大厅数据直接包含明文 `room.password`。
- 展示仅显示 Required/None。

风险：

- 明文密码随大厅数据下发。
- 密码校验在客户端，形同无保护。
- 数据库没有 `passwordHash`。
- 房名唯一性只做客户端提示，不可靠。

### RoomList / IndividualRoom

`RoomList`：

- 按 `roomName` 做大小写不敏感 substring 搜索。
- 用 `playerArray.length` 升序排序。
- 空房/一人房排在前面，满员房靠后。

边界问题：

- `.sort()` 原地修改 props/state。
- 搜索 effect 不依赖 `rooms`，实时更新时结果可能滞后。
- 搜索无结果时 fallback 到全部 rooms，用户会困惑。
- 刷新按钮只切本地状态，不请求服务端。

`IndividualRoom`：

- 展示房名。
- 展示玩家数 `x/2`。
- 展示 `A vs B` 或 `A vs ...`。
- 显示密码状态 Required/None。
- 登录且未满员显示 Join。
- 满员显示 In Game。
- 密码错误显示 Wrong Password。

## Socket 与数据库关系

`gameCreated`：

- 客户端同时走 REST POST 和 socket。
- REST 路径才真正 `newRoom.save()`。
- socket 路径里 `socketServer.createRoom(roomData)` 只是 `new RoomModel(roomData)`，没有保存。
- 服务端把未保存 room push 进当前 roomArray 并广播。

风险：

- 大厅可能先看到未保存房间。
- 真实持久化依赖另一路 REST 请求。
- 状态来源不统一。

`updateRoom`：

- 客户端提交 `{ gameToJoin, gameObject }`。
- 服务端校验 `gameToJoin._id` 格式。
- 用 `roomName` 执行 `findOneAndUpdate`。
- 更新 `playerArray` 和 `game`。
- 重读 rooms，替换 updatedRoom。
- 广播 `lobby`。
- 向游戏房间发 `toGameRoom`。

风险：

- 客户端提交完整 gameObject。
- 加人不是服务端原子匹配队列。
- 并发加入可能产生竞态。

`deleteGameRoom`：

- 游戏结束或离开时客户端提交 `{ currentRoom }`。
- 服务端按 `_id` 删除。
- 重读 rooms/users 并广播大厅。
- 存在 `roomname` / `roomName` 大小写不一致，`socket.leave` 可能无效。

## 本项目采用方案

匹配决策必须搬到服务端。

推荐接口：

- socket `matchmaking:find`
- socket `matchmaking:cancel`
- HTTP `GET /api/rooms`
- HTTP `POST /api/rooms`
- HTTP `POST /api/rooms/:id/join`

服务端匹配条件：

- `visibility = public`
- `status = waiting`
- `playerCount < 2`
- `hasPassword = false`
- 相同规则模式。
- 相近评分或游客池。
- 避免短时间重复匹配同一对手。

并发控制：

- PostgreSQL 事务 + 条件更新，或 Redis lock。
- “查找并加入”必须原子化。
- 没有空房时由服务端创建等待房。

私密房：

- `visibility: "private"`。
- `hasPassword: boolean`。
- `passwordHash` 服务端保存。
- 大厅只返回 `hasPassword`，绝不下发明文。
- 邀请链接使用 `inviteCode`。

大厅更新：

- 初始读取分页：`GET /api/rooms?cursor=&limit=&status=waiting&visibility=public&search=`
- socket 加入 lobby channel。
- 增量事件：
  - `room.created`
  - `room.updated`
  - `room.deleted`
- 每个事件带 `roomId`、`version`、`updatedAt`。
- 客户端发现版本缺口时 full resync。

### 阶段 3 补充：分享、观战和聊天

分享链接：

- 创建或加入房间成功后，客户端用 History API 把当前地址更新为含 room code 的 URL，例如 `/en?room=ABC123`。
- 分享按钮复制当前浏览器地址，避免复制和实际地址不一致。
- 离开房间后清理 URL 上的 room 参数。

观战席：

- 黑白两名玩家之外的加入者进入 spectators。
- 观战者可看棋盘、玩家列表、胜负、重开状态和房间聊天。
- 观战者不能 ready、落子、认输、请求或响应悔棋。
- 观战者可用明确 `room:sit` 动作在非 `playing` 状态下补入空玩家座位；对局进行中仍不能抢座位。

大厅/房间列表：

- 大厅展示公开 waiting 房和可观战 playing 房。
- 每项显示房主昵称、房间码、状态、玩家数、观战人数、创建时间或最近活动。
- waiting 房提供 Join，playing 房提供 Watch。
- 空房立即关闭；同一连接在当前一人等待房里重复创建会复用当前房间，创建或加入其他房间前会先释放旧的非对局房，避免一名用户连续创建多个空房残留在大厅。
- 当前生命周期补强还会在新入房前关闭同一游客昵称的一人等待房，并在定时 lifecycle sweep 中关闭没有任何 socket 成员的残留房。
- 当前小步 4 已实现前端入口：
  - 好友房面板内显示大厅房间列表。
  - 列表初次挂载时通过 `lobby:join` 读取初始房间。
  - 列表通过 `lobby:room-updated` / `lobby:room-deleted` 自动更新。
  - waiting 房显示 Join，点击后作为第二名玩家进入。
  - playing / 满员房显示 Watch，点击后作为观战者进入。
  - `tools/smoke-lobby-ui.ts` 使用系统 Chrome 验证列表 Join 和 Watch。
- 当前小步 3 已实现服务端能力：
  - `RoomListItem` / `RoomListQuery` / `RoomListSnapshot` / lobby 增量事件类型。
  - `GET /api/rooms?limit=20&status=waiting|playing|finished|all`。
  - `lobby:join` / `lobby:list` / `lobby:leave` socket 事件。
  - `lobby:room-updated` / `lobby:room-deleted` 增量事件。
  - `tools/smoke-lobby.ts` 覆盖 REST 全量列表、lobby 初始列表、创建/加入/开局/结束的增量更新。

随机匹配：

- 当前小步 7 已实现单进程基础版：
  - `RoomStore.findMatch()` 在服务端原子执行“找 waiting 房或创建 waiting 房”。
  - socket `matchmaking:find` 优先加入最早创建、未满员的 waiting 房；没有可用 waiting 房时创建新房。
  - socket `matchmaking:cancel` 释放当前等待房身份；若房间无人则立即从大厅移除。
  - 满员房、playing、finished、abandoned 房不会进入随机匹配。
  - 在线大厅以 Find match 为一次点击主动作；匹配成功进入单人 waiting 后，牌桌任务栏提供 Cancel waiting 并复用现有取消协议。
  - `tools/smoke-matchmaking.ts` 覆盖第一个匹配创建等待房、第二个匹配加入同房、第三个匹配不超员、取消匹配关闭单人等待房。
- 多实例部署前仍需把匹配队列迁移到 Redis/PostgreSQL 原子锁；当前真实服务器是单进程内存版。

聊天：

- 公共聊天频道：大厅范围。
- 房间聊天频道：同一房间内玩家和观战者可见。
- 服务端限制消息长度、空消息、发送频率，消息以纯文本传输。
- 第一版只保留短期内存历史，持久化留给账号/审计阶段。
- 当前小步 6 已实现公共聊天频道：
  - `public-chat:join` 读取公共聊天短期历史。
  - `public-chat:send` 允许游客/玩家用当前昵称发送公共消息。
  - `public-chat:messages` 向公共聊天频道广播最新短期历史。
  - 服务端拒绝空消息、超长消息和发送过快消息。
  - 好友房面板内显示公共聊天、最近消息和发送输入框。
  - `tools/smoke-public-chat.ts` 覆盖公共频道 join、广播、频率限制、空/超长消息。
- 当前小步 5 已实现房间聊天频道：
  - `RoomSnapshot.chatMessages` 保存最近房间消息。
  - `room:chat-send` 允许房间玩家和观战者发送消息。
  - 服务端拒绝空消息、超长消息、发送过快消息和非房间成员消息。
  - 好友房面板显示房间聊天、最近消息和发送输入框。
  - `tools/smoke-room-chat.ts` 覆盖玩家/观战者发言、房内广播、频率限制、空/超长消息和非成员拒绝。

## 六语种文案 key

### 2026-07-10 IX-01 前端工作区边界

- 在线大厅现在由 `OnlineLobbyView` 单独承载身份、快速匹配、创建/加入、公共聊天、Presence、Profile 摘要、排行榜和公开房间列表。
- 已进入房间后改为只渲染 `GameTableView`；大厅专属内容不再与房间摘要、玩家、房间聊天、桌内动作和棋盘同时出现。
- `OnlineJoiningView` 作为邀请 URL 和 stored-session 恢复期间的等待门；成功 ack 直接进入牌桌，失败才回到大厅并显示错误。
- `useFriendRoom({ enabled })` 的自动 rejoin 只在在线模式启用；真实 Chrome smoke 已验证应用初始 local 及切换 AI 时没有 `/socket.io` Resource Timing 记录，进入在线模式后才执行大厅订阅。
- 本阶段只重组既有入口，没有改变 `lobby:join`、`lobby:room-updated`、`lobby:room-deleted`、`matchmaking:find`、`room:join` 或 URL/session 契约。
- 入口主次、空大厅降级、Profile/排行榜下沉和真正的 unlisted 朋友桌仍分别属于 `IX-04`、`IX-04B`，不能把本次视图拆分描述成这些能力已经完成。

### 2026-07-10 IX-04 大厅入口分层

- 快速匹配是大厅唯一大型主动作；已恢复游客身份时，从大厅到 `matchmaking:find` 只需一次点击。
- “和朋友玩”按需展开后才挂载创建 unlisted 房和统一加入表单；说明明确“不公开列出”不等于私密或访问保护。
- 昵称和账号在“编辑身份”后展开；公共聊天/Presence 与 Profile/排行榜分别位于房间列表后的次级区，默认不建立对应读取 effect。
- 房间列表直接按服务端 `RoomListItem.canJoin` / `canWatch` 分为 joinable/watchable；满员 waiting 房可以出现在 watchable 组，但仍显示真实 waiting 状态。
- 空列表提供 `matchmaking:find`、`room:create` 和切换 AI 三条真实路径；不从分页列表或 Presence 样本推导全站热度。
- 单人 waiting 通过 `FriendRoomController.canCancelMatch` 在任务栏显示 Cancel waiting；该动作调用既有 `matchmaking:cancel`，成功后清 stored session、room URL 和客户端房间态。
- controller 尚未持久化房间入口意图，因此快速匹配和朋友创建的单人桌统一使用“取消等待”，不显示可能失真的“取消匹配”。
- 手动朋友路径经 Chrome smoke 验证为：展开一次 -> 输入一次目标 -> 提交一次；邀请 URL 继续自动直达 joining/table，不增加确认页。
- 后续 IX-04B 已加入 public/unlisted，IX-04A 已加入 handle/account-ID 解析；高熵 invite token 和 IX-07 汇总统计仍未实现。

IX-04 新增并接入的六语种 UI 文案 key：

- `playWithFriends`
- `publicRoomNotice`
- `editIdentity`
- `joinableRooms`
- `watchableRooms`
- `cancelWaiting`

### 2026-07-10 IX-04B public / unlisted 权威可见性

- `RoomVisibility` 只有 `public | unlisted`；省略值默认 public，未知值由 RoomStore 拒绝。
- `visibility` 写入权威 `RoomSnapshot`，客户端 Room info 不根据入口猜测房间类型。
- 快速匹配只搜索并创建 public 房；朋友创建显式发送 unlisted。
- unlisted 在服务端同时隔离：REST/socket 初始列表、lobby update、lobby deletion、Presence roomCode 和公共 lobby version；不能只依赖客户端过滤。
- unlisted 终局记录内部照常保存以支持一致性审计，但不进入公开 Profile recent records 或排行榜，避免从 roomCode/gameId 形成事后发现旁路；旧持久化记录默认迁移为 public。
- 删除前 snapshot 会随清理/生命周期结果返回，socket 层据其 visibility 决定是否发公共 deletion，避免房间删除后无法判断而泄漏 code。
- unlisted 仍可通过规范房间码、邀请 URL 和 stored session 加入/恢复；RoomStore、socket room、URL、gameId 和记录继续只使用规范 roomCode。
- 产品文案必须使用“不公开列出”，并说明知道 code/link 的任何人仍能加入；当前没有高熵 token、接收者授权、撤销/轮换或访问限流，不能称 private/protected。
- IX-04A 落地后，public 房默认可用 host handle/account ID 解析；unlisted 默认关闭该策略，因此这些别名不能旁路发现 unlisted。

IX-04B 新增并接入的六语种 UI 文案 key：

- `createUnlistedRoom`
- `roomVisibility`
- `publicRoom`
- `unlistedRoom`
- `unlistedRoomNotice`

### 2026-07-10 IX-04A 统一加入标识与公开 handle

- 注册账户新增当前 AccountStore 内大小写无关唯一、创建后不可变的 `publicHandle`；旧 JSONL 账户按 displayName + account ID 确定性迁移。
- 同一朋友输入框通过 `room:join-target` 接受本站邀请 URL、裸 roomCode、`@handle` 和原始 `acct_...`；只有裸 roomCode 转大写，成功后统一回写权威 `snapshot.code`。
- RoomStore 以显式双向索引维护一个注册房主的当前目标，不扫描 rooms 或猜测最新房间；转移、断线、恢复、删除与 finished 保留窗口均有测试。
- public 默认允许别名；unlisted 默认关闭。失败与限流统一伪装为 room-not-found，handle/account-ID 查询按来源地址 20 次/分钟限制。
- 当前索引和限流仍是单进程边界；多实例前需要共享账户唯一约束、共享房主目标和分布式限流。

IX-04A 新增并接入的六语种 UI 文案 key：

- `publicHandle`
- `publicHandlePlaceholder`
- `joinTarget`
- `joinTargetPlaceholder`
- `hostHandle`

大厅与匹配至少需要：

- `copyCurrentUrl`
- `shareRoom`
- `watch`
- `spectators`
- `publicChat`
- `roomChat`
- `messageTooLong`
- `messageRateLimited`
- `findGame`
- `customGame`
- `createGame`
- `randomizeName`
- `roomName`
- `roomNameTaken`
- `passwordOptional`
- `passwordRequired`
- `noPassword`
- `playerCount`
- `join`
- `inGame`
- `wrongPassword`
- `loginToPlay`
- `searchPlaceholder`
- `matchmakingSearching`
- `matchmakingCancel`
- `privateRoom`
- `publicRoom`

小步 5 已新增并接入的 UI 文案 key：

- `roomChat`
- `chatPlaceholder`
- `sendMessage`
- `noMessages`

小步 6 已新增并接入的 UI 文案 key：

- `publicChat`
- `publicChatPlaceholder`

小步 7 已新增并接入的 UI 文案 key：

- `findMatch`
- `cancelMatch`
- `matchmakingSearching`

小步 4 已新增并接入的 UI 文案 key：

- `availableRooms`
- `refreshRooms`
- `loadingRooms`
- `noRooms`
- `lobbyWaiting`
- `lobbyPlaying`
- `playersCount`
- `watchRoom`

语言集合必须使用项目要求：

- `en`
- `zh`
- `fr`
- `es`
- `ru`
- `ar`

## 实现任务清单

- 定义 `RoomSummary`、`LobbyQuery`、`MatchmakingRequest` 类型。`RoomListItem` / `RoomListQuery` 已完成；当前随机匹配第一版直接复用 `JoinRoomInput`。
- 实现服务端房间列表分页 API。已完成基础版：`GET /api/rooms` 支持 `limit` 和 `status`。
- 实现 lobby socket channel。已完成基础版：`lobby:join` / `lobby:list` / `lobby:leave`。
- 实现 room 增量事件和版本号。已完成基础版：`lobby:room-updated` / `lobby:room-deleted` 带全局 `version`，每个房间 item 带自身 `version`。
- 实现服务端随机匹配。已完成单进程基础版：`RoomStore.findMatch()` + socket `matchmaking:find` / `matchmaking:cancel`。
- 实现私密房 password hash。
- 实现房间名/房间码服务端唯一约束。
- 移除客户端直接修改玩家数组的模式。

## 测试清单

- 空大厅找局会创建等待房。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`、`tools/smoke-matchmaking.ts`。
- 有可用公开空房时加入该房。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`、`tools/smoke-matchmaking.ts`。
- 私密房不会进入随机匹配。
- 密码错误不能加入。
- 密码不下发到客户端。
- 并发两人找局不会超员。当前单进程版覆盖顺序并发不超员；多实例原子锁留到 Redis/PostgreSQL 阶段。
- 搜索无结果显示空状态。
- 公共聊天在大厅范围广播，空/超长/过快消息会被拒绝。已覆盖：`src/server/room-socket.test.ts`、`tools/smoke-public-chat.ts`。
- 房间聊天只在同房间内广播，玩家和观战者可发言，非成员不能发言。已覆盖：`src/server/room-socket.test.ts`、`tools/smoke-room-chat.ts`。
- 房间列表 UI 的 Join / Watch 可进入对应房间。已覆盖：`tools/smoke-lobby-ui.ts`。
- 房间更新只增量推送。已覆盖：`src/server/room-socket.test.ts`、`tools/smoke-lobby.ts`。
- 版本缺口触发全量同步。
- 六种语言下字段不溢出。

## 许可证边界

`minh100/Gomoku` 无仓库级 LICENSE。

因此：

- 不复制 React 组件。
- 不复制 Mongo schema。
- 不复制样式和弹窗实现。
- 只吸收大厅流程、房间列表、密码房、找局按钮和实时刷新经验。
