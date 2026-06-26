# Stage 3 Progress

更新日期：2026-06-25

本文件记录阶段 3 的小步骤进度。每个小步骤都必须完成实现、文档、验证、GitHub 推送，并在推送后等待 90 秒检查线上版本。

阶段 3 的棋谱数据口径：注册玩家和游客的在线对局棋谱都提交服务器，形成服务器棋谱池。后续“本地分析”指用户把服务器收集来的棋谱导出到本地/离线分析流程，用于统计、筛选和生成自有开局库；不是只保存在游客浏览器本地，也不是当前阶段要在浏览器里做分析。

## 小步 1：真实分享链接

状态：完成，已推送并通过真实服务器验证。

目标：

- 创建房间成功后，当前地址变为包含房间号的 URL。
- 加入房间成功后，当前地址同步为该房间 URL。
- 刷新恢复房间时，当前地址保持和房间一致。
- 分享按钮复制当前浏览器地址。
- 离开房间成功后清理 URL 上的 `room` 参数。

实现：

- `src/components/useFriendRoom.ts`
  - room ack 成功后调用 URL 同步。
  - Copy invite 先同步当前房间 URL，再复制 `window.location.href`。
  - Clipboard API 不可用时使用 `execCommand("copy")` 备用路径。
  - Leave 成功后清理 room 参数。
- `src/components/room-url.ts`
  - 抽出纯 URL helper，便于单测。
- `src/components/room-url.test.ts`
  - 覆盖设置 room、更新 room、保留其他 query、清理 room。
- `tools/smoke-share-url.ts`
  - 使用系统 Chrome 和 Chrome DevTools Protocol 打开真实页面，验证 Friend room、Create room、Copy invite、Leave 的 URL 行为。

验证：

- `npm test`：通过，5 个测试文件、57 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3028 npm start` 后运行 `npm run smoke:share-url -- http://127.0.0.1:3028`，通过。
- 推送后等待 90 秒，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net b6faf9e`：通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - E8VJ9U`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 小步 2：观战席

状态：完成，已推送并通过真实服务器验证。

目标：

- 第三个及之后加入同一房间的人进入观战席，不挤掉黑白玩家座位。
- 房间快照新增 `spectators`，包含观战者昵称、连接状态和加入时间。
- 观战者能看到棋盘、玩家列表、胜负、重开状态和观战人数。
- 观战者不能 ready、落子、认输、请求悔棋、响应悔棋或重开。

实现：

- `src/server/rooms.ts`
  - 新增 `RoomParticipantRole`、`RoomSpectatorSnapshot` 和 `spectators` 房间状态。
  - `room:join` 前两名成员进入黑白座位；第三人及之后进入 `spectators`。
  - `room:rejoin` 可恢复玩家座位或观战身份。
  - 观战者触发玩家动作时返回 `not-room-player`。
  - 观战者点击 Leave 时从观战席移除；断线时只标记观战连接状态。
- `src/server/room-contract.ts`、`src/server/room-socket.ts`
  - Room ack 返回 `role`、`seat` 和当前成员 `name`。
  - Socket 层区分玩家动作和房间成员动作。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`
  - 前端识别 `player` / `spectator` 身份。
  - 观战者显示为 Spectator，功能栏玩家动作自动禁用。
  - 房间摘要显示观战人数，并列出观战者。
- `tools/smoke-online-room.ts`
  - 冒烟脚本升级为三客户端：host、guest、spectator。
  - 继续覆盖三局换先、悔棋拒绝/允许、连续悔棋拒绝和认输收尾。

验证：

- `npm test`：通过，5 个测试文件、59 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3029 npm start` 后运行 `npm run smoke:online-room -- http://127.0.0.1:3029`，通过。
  - `PASS room:join spectator - watcher seated without displacing players`
  - `PASS spectator move sync - watcher saw game 1 black center`
  - `PASS spectator move denied - not-room-player`
  - 三局 ready / restart 换先 / 悔棋 / 认输流程均通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3029`，通过。
  - `PASS create room URL - BP4KH6`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://127.0.0.1:3029/en`
- 推送 `99b4b03` 后等待 90 秒，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net 99b4b03`：通过。
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS connect spectator - websocket`
  - `PASS spectator ready denied - not-room-player`
  - `PASS room:join spectator - watcher seated without displacing players`
  - `PASS spectator move sync - watcher saw game 1 black center`
  - `PASS spectator move denied - not-room-player`
  - 三局 ready / restart 换先 / 悔棋 / 认输流程均通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - WEV6FZ`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 小步 3：房间列表 API 和 lobby socket channel

状态：完成，已推送并通过真实服务器验证。

目标：

- 提供公开房间列表 REST API，供后续大厅 UI 读取。
- 提供 lobby socket channel，客户端可加入大厅并接收房间列表增量更新。
- 房间列表显示 waiting 房和可观战 playing 房。
- 每项至少包含房主昵称、房间号、状态、玩家数、观战人数、创建时间、最近活动时间和 Join / Watch 能力。
- 房间创建、加入、ready 开局、结束或隐藏时，大厅收到增量事件。

实现：

- `src/server/room-store.ts`
  - 新增共享 `roomStore`，让自定义在线服务器的 REST API 和 Socket.IO 共用同一份房间状态。
- `src/server/rooms.ts`
  - 新增 `RoomListItem`、`RoomListQuery`、`RoomListSnapshot`、`LobbyRoomUpdatedEvent`、`LobbyRoomDeletedEvent`。
  - RoomStore 新增 `listRooms()`、`getRoomListItem()` 和 lobby version。
  - 房间创建、加入、ready、开局、落子、认输、重开、断线、观战离开、生命周期清理时更新列表版本。
  - 默认列表只展示 `waiting` / `playing`，`finished` 可通过 `status=finished` 查询。
- `src/server/online-server.ts`
  - 拦截 `GET /api/rooms`，返回当前 `roomStore.listRooms()`。
  - 保持 Socket.IO 与 REST 使用同一个 `roomStore`。
- `src/server/room-socket.ts`
  - 新增 `lobby:join`、`lobby:list`、`lobby:leave`。
  - 新增 `lobby:room-updated`、`lobby:room-deleted`。
  - 房间状态变化后向 lobby channel 广播增量事件。
- `tools/smoke-lobby.ts`
  - 覆盖 REST 初始列表、lobby 初始列表、创建房间增量、REST 包含新房间、加入更新、ready 开局更新、结束隐藏和 REST 隐藏 finished 房。
- `package.json`
  - 新增 `npm run smoke:lobby`。

验证：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3030 npm start` 后运行 `npm run smoke:lobby -- http://127.0.0.1:3030`，通过。
  - `PASS REST room list - version 0`
  - `PASS lobby:join - 0 rooms`
  - `PASS lobby room created - AMW5XG`
  - `PASS REST room list includes created room`
  - `PASS lobby room joined - player count updated`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
  - `PASS REST room list hides finished room`
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3030`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3030`，通过。
- 推送 `e0e0253` 后等待 90 秒，第一次检查真实服务器仍为 `612ec19`；再等待 90 秒后，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net e0e0253`：通过。
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS REST room list - version 0`
  - `PASS lobby:join - 0 rooms`
  - `PASS lobby room created - 3L246K`
  - `PASS REST room list includes created room`
  - `PASS lobby room joined - player count updated`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
  - `PASS REST room list hides finished room`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。

## 小步 4：房间列表 UI：Join / Watch

状态：完成，已推送并通过真实服务器验证。

目标：

- 在好友房面板中显示房间列表。
- 列表读取小步 3 的 REST / lobby socket 数据。
- waiting 房显示 Join，点击后加入为第二名玩家。
- playing 或满员房显示 Watch，点击后进入观战席。
- 列表能随 lobby 增量事件更新。

实现：

- `src/components/useFriendRoom.ts`
  - 新增 `lobbyRooms`、`lobbyStatus`、`refreshLobby()`、`joinListedRoom(roomCode)`。
  - 监听 `lobby:room-updated` / `lobby:room-deleted` 并更新本地列表。
  - `refreshLobby()` 通过 `lobby:join` 获取初始列表。
- `src/components/GameShell.tsx`
  - 好友房面板新增 `RoomLobbyList`。
  - 列表行显示房主、房间号、waiting/playing 状态、玩家数、观战人数。
  - 根据 `canJoin` / `canWatch` 显示 Join 或 Watch。
- `src/i18n/dictionaries.ts`
  - 六语言新增房间列表 UI 文案。
- `src/app/globals.css`
  - 新增房间列表布局和移动端单列布局。
- `tools/smoke-lobby-ui.ts`
  - 使用 Socket.IO 预置一个 waiting 房和一个 playing 房。
  - 使用系统 Chrome 打开真实页面，点击列表中的 Join 和 Watch，并验证 URL 与 Spectator 状态。
- `package.json`
  - 新增 `npm run smoke:lobby-ui`。

验证：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3031 npm start` 后运行 `npm run smoke:lobby-ui -- http://127.0.0.1:3031`，通过。
  - `PASS lobby waiting row join - 9T5GXQ`
  - `PASS lobby playing row watch - Z6WZUB`
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3031`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3031`，通过。
- 推送 `9c12bef` 后等待 90 秒，第一次检查真实服务器仍为 `14d85e8`；再等待 90 秒后，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net 9c12bef`：通过。
- 真实服务器：`npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS lobby waiting row join - PF6LH7`
  - `PASS lobby playing row watch - VPSRUN`
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS REST room list - version 12`
  - `PASS lobby:join - 2 rooms`
  - `PASS lobby room created - 686LJ3`
  - `PASS REST room list includes created room`
  - `PASS lobby room joined - player count updated`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
  - `PASS REST room list hides finished room`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。

## 小步 8：在线棋谱提交、去重和匿名/注册记录保存

状态：完成，已推送并通过真实服务器验证。

目标：

- 在线对局结束后，双方客户端都向服务器提交 game record。
- 服务端保存服务器权威棋谱，不信任客户端棋盘作为最终事实。
- 只收到一方时记录为 `partial`。
- 双方都提交且一致时合并为 `verified`。
- 客户端提交不一致时保留服务器权威棋谱，并标记 `conflicted`。
- 当前无注册系统，先以 `guest` 身份保存游客棋谱，进入服务器棋谱池。
- 棋谱持久化保存，后续可导出做本地/离线分析和开局库。

实现：

- `src/server/game-records.ts`
  - 新增 `GameRecordStore`。
  - 使用 append-only JSONL 保存 game record 状态更新。
  - 启动时可从 JSONL 重建最新记录状态。
  - 记录状态包括 `partial`、`verified`、`conflicted`。
- `src/server/rooms.ts`
  - `RoomSnapshot` 新增 `gameId` 和 `finishReason`。
  - 同一房间重开时递增 `gameId`，避免连续多局互相覆盖。
  - 对五连、和棋、认输、断线超时和 abandoned 记录终局原因。
  - 终局时捕获 finalized server snapshot，作为后续提交校验的权威棋谱。
  - 新增 `submitGameRecord()` 和 `listGameRecords()`。
- `src/server/room-socket.ts`、`src/server/room-contract.ts`
  - 新增 `game-record:submit`。
  - socket 层使用当前 socket 的 `playerId`，避免客户端伪造提交者。
- `src/components/useFriendRoom.ts`
  - 玩家端看到 finished/abandoned 房间快照后自动提交一次棋谱。
  - 使用 `playerId + gameId` 防止同一客户端重复提交。
- `src/server/room-store.ts`
  - 生产端默认写入 `data/game-records/records.jsonl`。
  - 可用 `GOMOKU_GAME_RECORDS_PATH` 覆盖保存路径。
- `.gitignore`
  - 忽略 `data/game-records/`，避免真实棋谱进入代码仓库。
- `tools/smoke-game-records.ts`
  - 覆盖双方提交、partial -> verified、重复提交去重。

验证：

- `npm test`：通过，6 个测试文件、73 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3036 npm start` 后运行 `npm run smoke:game-records -- http://127.0.0.1:3036`，通过。
  - `PASS first submit partial - PDP52X-1`
  - `PASS second submit verified - PDP52X-1`
  - `PASS duplicate submit deduped - PDP52X-1`
- 本地确认 JSONL 写入：`data/game-records/records.jsonl` 产生 2 行状态更新，第一行 partial，第二行 verified；本地 smoke 数据已清理。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:matchmaking -- http://127.0.0.1:3036`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3036`，通过。

线上验证：

- 本轮提交：`7511cd7 Implement stage 3 game record submission`。
- `7511cd7` 已推送到 `origin/main`。
- 第一次等待 90 秒后，真实服务器仍显示 `version 688904f`；第二次等待 90 秒后，真实服务器显示 `version 7511cd7`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 7511cd7`：通过。
- 真实服务器：`npm run smoke:game-records -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS first submit partial - Y7VH6Q-1`
  - `PASS second submit verified - Y7VH6Q-1`
  - `PASS duplicate submit deduped - Y7VH6Q-1`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - P9XLNN`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，顺序重跑通过。
  - `PASS lobby room created - PNHC6E`
  - `PASS lobby room joined - player count updated`
  - `PASS lobby room playing - status updated`
  - `PASS lobby room deleted - finished room hidden`
- 真实服务器：`npm run smoke:matchmaking -- http://gomoku.yagu.ddns-ip.net`，顺序重跑通过。
  - `PASS first find creates waiting room - A7VZMM`
  - `PASS second find joins waiting room - A7VZMM`
  - `PASS third find does not overfill - DQWKQX`
  - `PASS cancel closes solo waiting match - DQWKQX`
- 真实服务器：`npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS repeated create closes previous room - QLEM57 -> Y2XM6H`
  - `PASS spectator sits in open seat - 3XWUJG`
  - `PASS disconnect timeout forfeit - A38XDV`
- 备注：第一次将 `smoke:lobby`、`smoke:matchmaking`、`smoke:share-url` 并行跑时，lobby/matchmaking 因测试脚本之间共享线上 waiting 房而互相干扰；随后顺序重跑通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - W5H8F2`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 小步 5：房间聊天频道

状态：完成，已推送并通过真实服务器验证。

目标：

- 同一房间内玩家和观战者可以发送房间聊天消息。
- 非房间成员不能向房间发送聊天消息。
- 服务端限制空消息、超长消息和发送频率。
- 消息以纯文本进入房间 snapshot，第一版只保留短期内存历史。
- 好友房面板显示最近房间消息和发送输入框。

实现：

- `src/server/rooms.ts`
  - 新增 `RoomChatMessage` 和 `RoomSnapshot.chatMessages`。
  - `RoomStore.sendRoomChat()` 允许房间玩家/观战者发言。
  - 服务端限制空消息、160 字符上限、800ms 发送间隔。
  - 每房间保留最近 50 条内存消息。
- `src/server/room-socket.ts`
  - 新增 `room:chat-send`。
  - 聊天只广播 `room:state` 到同房间，不刷新 lobby 房间列表。
- `src/components/useFriendRoom.ts`
  - 新增 `chatText`、`setChatText()`、`sendChatMessage()`。
- `src/components/GameShell.tsx`
  - 好友房面板新增房间聊天区域、最近消息列表、发送输入框和发送按钮。
- `src/i18n/dictionaries.ts`
  - 六语言新增房间聊天 UI 文案。
- `tools/smoke-room-chat.ts`
  - 覆盖玩家发言、观战者发言、房内广播、频率限制、空/超长消息和非成员拒绝。
- `package.json`
  - 新增 `npm run smoke:room-chat`。

验证：

- `npm test`：通过，5 个测试文件、61 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3032 npm start` 后运行 `npm run smoke:room-chat -- http://127.0.0.1:3032`，通过。
  - `PASS room chat setup - 886QF7`
  - `PASS room chat spectator broadcast`
  - `PASS room chat rate limit - chat-rate-limited`
  - `PASS room chat player broadcast`
  - `PASS empty chat rejected - chat-message-empty`
  - `PASS long chat rejected - chat-message-too-long`
  - `PASS stranger chat rejected - not-room-member`
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3032`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3032`，通过。
- 推送 `c05ebfd` 后等待 90 秒，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net c05ebfd`：通过。
- 真实服务器：`npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS room chat setup - HKRXXW`
  - `PASS room chat spectator broadcast`
  - `PASS room chat rate limit - chat-rate-limited`
  - `PASS room chat player broadcast`
  - `PASS empty chat rejected - chat-message-empty`
  - `PASS long chat rejected - chat-message-too-long`
  - `PASS stranger chat rejected - not-room-member`
- 真实服务器：`npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS lobby waiting row join - AK5KN5`
  - `PASS lobby playing row watch - EUKYRR`
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - U34VLW`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 小步 6：公共聊天频道

状态：完成，已推送并通过真实服务器验证。

目标：

- 好友房/大厅范围提供公共聊天频道。
- 游客和玩家可以使用当前昵称发送公共消息。
- 服务端限制空消息、超长消息和发送频率。
- 消息以纯文本进入公共聊天短期内存历史。
- 好友房面板显示公共聊天最近消息和发送输入框。

实现：

- `src/server/rooms.ts`
  - 新增 `PublicChatMessage`、`PublicChatSnapshot`。
  - `RoomStore.listPublicChatMessages()` 返回公共聊天短期历史。
  - `RoomStore.sendPublicChat()` 写入公共聊天并复用 160 字符上限、800ms 发送间隔和最近 50 条保留策略。
- `src/server/room-contract.ts`
  - 新增 `PublicChatAck`。
- `src/server/room-socket.ts`
  - 新增 `public-chat:join`、`public-chat:leave`、`public-chat:send`。
  - 新增 `public-chat:messages` 广播。
- `src/components/useFriendRoom.ts`
  - 新增 `publicChatMessages`、`publicChatText`、`refreshPublicChat()`、`sendPublicChatMessage()`。
- `src/components/GameShell.tsx`
  - 好友房面板新增公共聊天区域、最近消息列表、发送输入框和发送按钮。
- `src/i18n/dictionaries.ts`
  - 六语言新增公共聊天 UI 文案。
- `tools/smoke-public-chat.ts`
  - 覆盖公共频道 join、广播、频率限制、空/超长消息。
- `package.json`
  - 新增 `npm run smoke:public-chat`。

验证：

- `npm test`：通过，5 个测试文件、62 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3033 npm start` 后运行 `npm run smoke:public-chat -- http://127.0.0.1:3033`，通过。
  - `PASS public chat join - 0 messages`
  - `PASS public chat broadcast`
  - `PASS public chat rate limit - chat-rate-limited`
  - `PASS public empty chat rejected - chat-message-empty`
  - `PASS public long chat rejected - chat-message-too-long`
- 本地生产服务：`npm run smoke:room-chat -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3033`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3033`，通过。
- 推送 `3c37afb` 后等待 90 秒，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net 3c37afb`：通过。
- 真实服务器：`npm run smoke:public-chat -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS public chat join - 0 messages`
  - `PASS public chat broadcast`
  - `PASS public chat rate limit - chat-rate-limited`
  - `PASS public empty chat rejected - chat-message-empty`
  - `PASS public long chat rejected - chat-message-too-long`
- 真实服务器：`npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS room chat setup - Z2YV9E`
  - `PASS room chat spectator broadcast`
  - `PASS room chat rate limit - chat-rate-limited`
  - `PASS room chat player broadcast`
  - `PASS empty chat rejected - chat-message-empty`
  - `PASS long chat rejected - chat-message-too-long`
  - `PASS stranger chat rejected - not-room-member`
- 真实服务器：`npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS lobby waiting row join - 9ZDZ9G`
  - `PASS lobby playing row watch - ZTXSPV`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - PN24UH`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 阶段 3 联机回归修复：房间生命周期、补位和邀请链接

状态：完成，已推送并通过真实服务器验证。

触发问题：

- 一台电脑多用户测试时，对局中离开后再加入提示房间不存在。
- 对局中断线后 60 秒没有判胜负，断线玩家仍占座。
- 观战席不能补入空玩家座位。
- 邀请链接根路径先进入首页，未自动跳转并加入房间。
- 房间里没有人时没有关房，同一个用户可以连续创建多个新房。

实现：

- `src/server/rooms.ts`
  - 新增 `RoomStore.sitPlayer()`，允许观战者在非 `playing` 状态下补入空玩家座位。
  - `markDisconnected()` 对观战者和非对局玩家立即释放席位；对局中玩家保留 60 秒断线宽限期。
  - `leaveRoom()` 在非对局状态释放玩家/观战者，并在无人时立即删除房间。
  - 同一房间无玩家、无观战者时立即从房间表和 lobby 中清理。
  - `playing` 中断线超时后仍按在线对手胜、双方均离线则 abandoned 的规则结算。
- `src/server/room-socket.ts`
  - 新增 `room:sit` socket 事件。
  - `room:create`、`room:join`、`room:rejoin` 在切换房间前先释放当前 socket 的旧房间身份，避免重复创建空房。
- `src/app/(root)/page.tsx`
  - 根路径重定向保留 query，支持 `/?room=ABC123` 进入 `/en?room=ABC123`。
- `src/components/useFriendRoom.ts`
  - URL 上带 `room` 时自动加入房间。
  - 同浏览器多标签使用 session 级玩家身份，避免本机多游客互相挤掉身份。
  - 加入遇到重复身份/重名时自动刷新游客身份后重试一次。
  - 新增 `sitRoom()` 和 `canSit`。
- `src/components/GameShell.tsx`
  - URL 带 `room` 时首屏直接进入好友房模式。
  - 房间工具栏新增入座按钮。
- `tools/smoke-room-lifecycle.ts`
  - 新增房间生命周期冒烟：重复创建关闭旧房、观战者补位、对局中断线 60 秒后判负。
- `tools/smoke-share-url.ts`
  - 新增根路径邀请链接自动进房验证。

本地验证：

- `npm test`：通过，5 个测试文件、66 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3034 npm start` 后运行 `npm run smoke:room-lifecycle -- http://127.0.0.1:3034`，通过。
  - `PASS repeated create closes previous room - 63UE44 -> WYT2WW`
  - `PASS spectator sits in open seat - 2ZGJPM`
  - `PASS disconnect timeout forfeit - NNGYDS`
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3034`，通过。
  - `PASS create room URL - DBPRJ7`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://127.0.0.1:3034/en`
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:room-chat -- http://127.0.0.1:3034`，通过。
- 本地生产服务：`npm run smoke:public-chat -- http://127.0.0.1:3034`，通过。

线上验证：

- 本轮提交：`93ac3a5 Fix room lifecycle and invite joins`。
- `93ac3a5` 已推送到 `origin/main`。
- 第一次等待 90 秒后，真实服务器仍显示 `version 036e40d`；第二次等待 90 秒后，真实服务器显示 `version 93ac3a5`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 93ac3a5`：通过。
- 真实服务器：`npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS repeated create closes previous room - U4P4VG -> 3XR2TN`
  - `PASS spectator sits in open seat - YWMS3U`
  - `PASS disconnect timeout forfeit - CRSTWY`
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - 6N9LDX`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS lobby waiting row join - 6FKKJ7`
  - `PASS lobby playing row watch - XB9Q2P`
- 真实服务器：`npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:public-chat -- http://gomoku.yagu.ddns-ip.net`，通过。

## 小步 7：随机匹配

状态：完成，已推送并通过真实服务器验证。

目标：

- Find Match 优先加入可用公开 waiting 房。
- 没有可用 waiting 房时创建公开 waiting 房。
- 第三个匹配者不能挤进已满员房。
- Cancel Match 能释放单人等待房，并从大厅移除空房。
- 前端好友房面板提供 Find match / Cancel match 按钮。

实现：

- `src/server/rooms.ts`
  - 新增 `RoomStore.findMatch()`。
  - 服务端按最早创建的 waiting 房匹配，跳过满员、playing、finished、abandoned、同玩家和同名冲突房。
  - 没有可用房时创建新的 waiting 房。
- `src/server/room-socket.ts`
  - 新增 `matchmaking:find`。
  - 新增 `matchmaking:cancel`。
  - `matchmaking:find` 会先释放当前 socket 的旧房间身份，再进入服务端匹配。
- `src/components/useFriendRoom.ts`
  - 新增 `findMatch()`、`cancelMatch()`、`matchmakingStatus`、`canFindMatch`、`canCancelMatch`。
- `src/components/GameShell.tsx`
  - 好友房工具栏新增 Find match / Cancel match 按钮。
- `src/i18n/dictionaries.ts`
  - 六语言新增随机匹配文案。
- `tools/smoke-matchmaking.ts`
  - 覆盖第一个匹配创建等待房、第二个匹配加入同房、第三个匹配不超员、取消匹配关闭单人等待房。
- `README.md`、`docs/logic/lobby-matchmaking-module.md`
  - 增加随机匹配命令和当前单进程实现边界说明。

验证：

- `npm test`：通过，5 个测试文件、69 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3035 npm start` 后运行 `npm run smoke:matchmaking -- http://127.0.0.1:3035`，通过。
  - `PASS first find creates waiting room - MCYBBV`
  - `PASS second find joins waiting room - MCYBBV`
  - `PASS third find does not overfill - Y9K6LD`
  - `PASS cancel closes solo waiting match - Y9K6LD`
- 本地生产服务：`npm run smoke:lobby -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3035`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3035`，通过。

线上验证：

- 本轮提交：`c7e4f6b Implement stage 3 random matchmaking`。
- `c7e4f6b` 已推送到 `origin/main`。
- 推送后等待 90 秒，真实服务器显示 `version c7e4f6b`。
- `npm run verify:online -- http://gomoku.yagu.ddns-ip.net c7e4f6b`：通过。
- 真实服务器：`npm run smoke:matchmaking -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS first find creates waiting room - BGGTCB`
  - `PASS second find joins waiting room - BGGTCB`
  - `PASS third find does not overfill - 8EMSJY`
  - `PASS cancel closes solo waiting match - 8EMSJY`
- 真实服务器：`npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net`，通过。
- 真实服务器：`npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS lobby waiting row join - FWU5NW`
  - `PASS lobby playing row watch - MYX36G`
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - Q6RHFZ`
  - `PASS invite link auto join - root URL preserved room`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`
- 真实服务器：`npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net`，通过，继续覆盖三客户端三局流程、换先、观战、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。

## 小步 9：Profile / Game records 读回第一版 + 空房生命周期补强

状态：本地完成，待提交、推送并通过真实服务器验证。

目标：

- 当前没有注册系统，先实现 guest/current-session 的 Profile 和 Game records 读回。
- 在线对局结束并提交棋谱后，当前玩家能看到胜负统计和最近棋谱摘要。
- 保持接口形状兼容后续注册玩家 Profile、Ranking、Game records。
- 修复同一游客/同一玩家可以在不同连接里反复创建多个活房间的问题。
- 房间没有连接中的参与者时关闭房间，避免空房和断线席位长期占用大厅。

实现：

- `src/server/game-records.ts`
  - 新增 `PlayerProfileSnapshot`、`PlayerGameRecordSummary` 和玩家视角胜负结果。
  - 新增 `getPlayerProfile()` 和 `listRecordsForPlayer()`。
  - 玩家记录按 playerId 过滤全量内存记录后再按更新时间取最近 N 条，避免长期运行后只扫最近总记录造成漏读。
- `src/server/online-server.ts`
  - 新增 `GET /api/profile`。
  - 新增 `GET /api/game-records` 作为当前读回接口别名。
- `src/components/useFriendRoom.ts`
  - 新增 `profile`、`profileStatus`、`refreshProfile()`。
  - 玩家提交棋谱成功后刷新 Profile。
  - 监听 `room:closed`，旧房被服务端关闭时清理本地房间状态和 URL。
  - 创建房间请求未返回时禁用创建按钮，避免高延迟下连点。
- `src/components/GameShell.tsx`
  - 好友房面板新增 Profile / Game records 小面板。
  - 显示当前游客名、对局数、胜/负/和统计和最近棋谱摘要。
- `src/server/rooms.ts`
  - 新增 `leaveParticipantRooms()`，按 playerId 清理进入新房前的旧房间身份。
  - 对局中如果所有参与者都断线，房间立即 abandoned 并从房间表删除。
  - 空房和全员离线房间不再继续显示或保留。
- `src/server/room-socket.ts`
  - `room:create`、`room:join`、`room:rejoin`、`matchmaking:find` 在进入新房前清理同一玩家旧房。
  - 新增 `room:closed` 事件，让旧标签页/旧连接明确知道房间已关闭。
- `tools/smoke-profile-records.ts`
  - 新增 `npm run smoke:profile-records`。
  - 覆盖在线对局结束、双方提交 verified 棋谱、host/guest Profile 胜负读回和 `/api/game-records` 别名。
- `tools/smoke-room-lifecycle.ts`
  - 增加同一 playerId 在第二个 socket 创建新房会关闭旧房的真实服务器冒烟路径。

本地验证：

- `npx vitest run src/server/game-records.test.ts src/server/rooms.test.ts src/server/room-socket.test.ts`：通过，3 个测试文件、40 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm test`：通过，6 个测试文件、77 个测试用例。
- 本地生产服务：`PORT=3037 npm start` 后运行 `npm run smoke:profile-records -- http://127.0.0.1:3037`，通过。
  - `PASS submitted verified record - UFHDLR-1`
  - `PASS profile readback - UFHDLR-1`
- 本地生产服务：`npm run smoke:room-lifecycle -- http://127.0.0.1:3037`，通过。
  - `PASS repeated create closes previous room - JHKU84 -> MNNMQA`
  - `PASS same player create closes previous room - 4WL2Y4 -> HXJPUD`
  - `PASS spectator sits in open seat - 4WYFZB`
  - `PASS disconnect timeout forfeit - LVTYDU`
- 本地生产服务：`npm run smoke:game-records -- http://127.0.0.1:3037`，通过。
- 本地生产服务：`npm run smoke:online-room -- http://127.0.0.1:3037`，通过，继续覆盖三客户端三局、换先、悔棋允许/拒绝、同局面拒绝后禁止连续请求和认输。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3037`，通过。
- 本地生产服务：`npm run smoke:lobby-ui -- http://127.0.0.1:3037`，通过。

当前截止：

- 最新提交：待本轮提交生成。
- 是否已推送：待提交后推送到 `origin/main`。
- 下一步：提交并推送，等待真实服务器更新后跑 `verify:online`、`smoke:profile-records`、`smoke:room-lifecycle`、`smoke:game-records`、`smoke:online-room`、`smoke:share-url` 和 `smoke:lobby-ui`。
