# 实时好友房模块逻辑

更新日期：2026-07-10

## 参考来源

- `scheng20/gomoku-online`：无仓库级 LICENSE，只参考房间流程和事件模型。
- Socket.IO Rooms 官方文档：https://socket.io/docs/v4/rooms/

## 关键文件和证据

`scheng20/gomoku-online`：

- `.research/scheng20-gomoku-online/server/index.js:21-24`：`createRoom` socket 事件。
- `.research/scheng20-gomoku-online/server/index.js:26-47`：`join` socket 事件。
- `.research/scheng20-gomoku-online/server/index.js:49-54`：`startGame` socket 事件。
- `.research/scheng20-gomoku-online/server/index.js:56-77`：`play` socket 事件。
- `.research/scheng20-gomoku-online/server/index.js:79-92`：`disconnect` 处理。
- `.research/scheng20-gomoku-online/server/rooms.js:1-35`：进程内房间数组、房间码生成和删除。
- `.research/scheng20-gomoku-online/server/users.js:1-58`：用户数组、房间人数、重名、颜色分配。
- `.research/scheng20-gomoku-online/server/game.js:1-95`：19x19 全盘胜负检测。
- `.research/scheng20-gomoku-online/client/src/components/Lobby.js:31-40`：创建房间 ack 后立即加入。
- `.research/scheng20-gomoku-online/client/src/components/Lobby.js:57-61`：收到 `joinPlayer` 后更新对手。
- `.research/scheng20-gomoku-online/client/src/components/Lobby.js:70-72`：收到 `startGame` 后切换开始状态。
- `.research/scheng20-gomoku-online/client/src/components/Lobby.js:96-115`：`join` ack 设置颜色、用户列表和对手名。
- `.research/scheng20-gomoku-online/client/src/components/Game.js:41-50`：监听 `play` 与 `endGame`。
- `.research/scheng20-gomoku-online/client/src/components/Game.js:70-88`：客户端本地校验后提交落子。

授权边界：

- `.research/scheng20-gomoku-online/server/package.json:11-12` 的 server 子包写了 `ISC`，但仓库没有顶层 LICENSE/NOTICE，客户端也是 private 包。
- 因此按仓库级授权不清晰处理，只学习流程，不复制源码。

## 参考实现细节

### createRoom

客户端无业务入参，只传 ack 回调。

服务端：

- 调用 `createRoom()`。
- `rooms.js` 通过 `crypto.randomBytes(3).toString("hex").toUpperCase()` 生成 6 位大写十六进制码。
- 用当前进程内 `rooms[]` 做冲突检查。
- 把房间码 push 到 `rooms[]`。
- ack 返回 `{ room: roomCode }`。

客户端：

- 收到 room code 后立刻调用自己的 join 流程。

风险：

- 房间码空间是 `16^6`，不是完整 A-Z/0-9。
- 房间只存在当前进程，服务重启会丢失。
- 横向扩容时各实例不共享房间。
- 创建后如果用户不加入，会留下空房。
- 没有 TTL。

### join

入参：

- `{ name, room }`
- ack callback

服务端流程：

- `room.trim()`。
- 如果 `getRoom(room)` 不存在，ack `{ joinError: "Room does not exist!" }`。
- 调用 `addUser({ id: socket.id, name, room })`。
- `addUser` 内部先 `name.trim()`。
- 如果房间已有 2 人，返回满员错误。
- 如果同房间已有同名用户，返回重名错误。
- 房间没人时分配黑棋 `1`。
- 房间已有一人时分配另一个颜色，白棋 `2`。
- 给房间内已有 socket 广播 `joinPlayer { name }`。
- 当前 socket `join(user.room)`。
- ack 给加入者 `{ color, users }`。

风险：

- `users` 里包含 socket id，不应暴露给客户端。
- 名字重名区分大小写，体验和防冒名都不完善。
- 颜色分配绑定加入顺序，未来 Swap2/Renju 需要更复杂的座位策略。

### startGame

入参：

- `{ room }`

服务端流程：

- 不校验发起者。
- 不校验房间人数。
- 不校验房间状态。
- 直接 `io.sockets.in(room).emit("startGame")`。

风险：

- 房间未满也能开始。
- 非房间玩家如果知道 room code 也可能伪造事件。
- 没有幂等状态。

### play

入参：

- `{ i, j, board, color, room }`

客户端先做：

- 是否已有赢家。
- 是否轮到自己。
- 目标格是否为空。

服务端做：

- 浅拷贝客户端传来的 board。
- 写入 `newBoard[i][j] = color`。
- 根据 color 切换下一手。
- `io.sockets.in(room).emit("play", { newBoard, newColor })`。
- 用全盘胜负检测判断是否结束。
- 若结束，广播 `endGame { winningColor: color }`。

重大风险：

- 服务端信任客户端提交的整块 board。
- 服务端信任客户端提交的 color。
- 服务端信任客户端提交的 room。
- 没有校验 socket 是否在该房间。
- 没有校验坐标、占位、回合、对局状态、move 序号。
- 恶意客户端可伪造棋盘、替对方落子、跳过回合、向任意房间发 move。

### disconnect

流程：

- 按 `socket.id` 从 `users[]` 删除。
- 如果房间剩余用户为 0，删除房间码。
- 向房间广播 `opponentLeft { name }`。

特点：

- Socket.IO 会自动让断开的 socket 离开所有 room。
- 参考实现没有重连保留期，断线即离席。

风险：

- 移动网络短断会直接破坏对局。
- 没有 session token 恢复座位。
- 没有断线宽限期、判负规则、对手选择。

## Socket.IO 房间语义

官方文档确认：

- room 是服务端概念，客户端不能直接读取自己加入过哪些 room。
- `socket.join(roomId)` 订阅房间。
- `io.to(roomId).emit(...)` 或 `io.in(roomId).emit(...)` 向房间广播。
- `socket.to(roomId).emit(...)` 向房间内除发送者外的 socket 广播。
- socket 断开时会自动 leave 所有 room。
- 多服务器部署需要 Redis Adapter，否则 room 映射只存在单进程内。

## 本项目采用方案

Socket.IO room 只做投递通道，不做游戏状态来源。

当前 Stage 2 MVP 与 Stage 3 小步 2 已落地：

- `src/server/rooms.ts`：纯 TypeScript 房间核心，不依赖 Socket.IO、不依赖数据库，负责房间码、玩家座位、观战席、ready 自动开局、服务端权威落子、胜负判定、联机悔棋请求、认输、重开和连接状态标记。
- `src/server/room-socket.ts`：Socket.IO 事件层，只把客户端事件转换为 `RoomStore` 调用，并广播返回的 `RoomSnapshot`；不在 Socket handler 里重新实现棋盘规则。
- `src/server/online-server.ts`：Next + Socket.IO 自定义在线服务，开发时用 `npm run dev:online` 启动。
- `src/components/useFriendRoom.ts`：浏览器端好友房状态、localStorage session、重连、邀请链接、ready、落子和联机悔棋 socket 事件封装。
- `src/components/GameShell.tsx`：只编排模式和互斥工作区；好友房牌桌由 `src/components/online/GameTableView.tsx` 承载。

房间对象：

- `roomId`：内部 ID，用于存储和广播。
- `roomCode`：邀请用短码，只做入口。
- `players`：黑白玩家座位、昵称、用户 ID、连接状态。
- `spectators`：观战者昵称、连接状态、加入时间；公开快照不暴露用户 ID。
- `status`：`waiting`、`playing`、`finished`、`abandoned`；`ready` 仍保留在类型中作为兼容状态，但当前 UI 规则是双方 ready 后直接进入 `playing`。
- `board`：服务端权威棋盘。
- `currentTurn`：当前座位。
- `moveSeq`：服务端递增手数。
- `ruleset`：规则模式。
- `createdAt`、`updatedAt`。

状态机：

- `waiting`：一名玩家或空位存在。
- `ready`：玩家个人准备状态；两名玩家都 ready 后自动开局。
- `playing`：对局中。
- `finished`：胜负、平局、认输。
- `abandoned`：断线超时、房间过期或异常关闭。

断线路径：

- 断线先标记座位 `disconnected`。
- 设置 `reconnectDeadline`。
- 宽限期内可用 session token 恢复座位。
- 超时后按规则判负、弃局或转 abandoned。

### 2026-07-10 IX-00/IX-01 客户端状态与连接边界

- 新增纯前端 `deriveTableUiState()`，完整枚举 13 个牌桌语义状态，但只组织后续 UI，不替代服务端 `can*` 权限和权威快照。
- `GameShell` 用 workspace selector 保证在线大厅、joining gate、在线牌桌三者互斥；有 room ack 时牌桌优先于可能残留的 joining 标志。
- `useFriendRoom({ enabled })` 在 local/AI 模式禁止新的自动 rejoin；从活跃房切换模式时仍先发既有 `room:leave`，没有为了门控提前断开 socket 或改变 leave ack 语义。
- 邀请 URL 和 stored session 恢复期间进入 `OnlineJoiningView`；ack 成功仍以服务端 `snapshot.code` 同步 URL/session，失败仍走原错误与重新加入路径。
- `GameTableView` 本批保留 ready、undo、resign、restart、sit、leave 和当前 undo dialog 的兼容行为；非阻塞任务栏、有序动作和终局再战属于后续 `IX-02`/`IX-06A`。
- 新增状态与真实 Chrome smoke 覆盖视图互斥及 local/AI 不建立 Socket.IO 资源；本批没有修改本节列出的任何房间/对局事件。

## 推荐事件

房间：

- `room:create`
- `room:join`
- `room:leave`
- `room:ready`
- `room:rejoin`
- `room:state`
- `room:error`

对局：

- `game:start`（兼容保留，当前 UI 不展示）
- `game:move`
- `game:undo-request`
- `game:undo-respond`
- `game:resign`
- `game:restart`

连接：

- Socket.IO `connect`
- Socket.IO `disconnect`
- Socket.IO `connect_error`

## 服务端权威落子流程

客户端只提交：

- `roomCode`
- `point`
- 上一手 `moveSeq`，当前字段为 `expectedMoveSeq`

服务端从 socket/session 推导：

- 用户身份。
- 所在房间。
- 座位。
- 棋色。

服务端校验：

- 房间存在。
- socket/session 属于该房间。
- 对局状态是 `playing`。
- 当前座位轮到该玩家。
- 坐标在棋盘内。
- 目标格为空。
- move 序号未过期且幂等。

服务端更新：

- 调用规则引擎 `applyMove`。
- 从最后一步检测胜负。
- 更新 `moveSeq`、`currentTurn`、`status`、`winner`、`winLine`。
- 广播完整 `room:state`。

客户端处理：

- 用服务端快照覆盖本地状态。
- 不自行决定胜负。
- 本地乐观 UI 可做，但必须能被服务端快照纠正。

## 实现任务清单

- `RoomState`、`PlayerSeat`、`MoveIntent`、`RoomSnapshot` 类型已在 `src/server/rooms.ts` 初版实现。
- 房间码生成已实现，默认 6 位 A-Z/0-9 去歧义字符，并带冲突重试。
- 实现房间 TTL 和空房清理。已完成单进程基础版：空 waiting 房清理、finished/abandoned 房延迟清理、长期无活动 playing 房 abandoned。
- `room:create` 的核心状态操作已实现：创建房间并加入黑棋房主。
- `room:join` 的核心状态操作已实现：昵称、重复玩家校验；前两名成员进入黑白座位，第三人及之后进入 `spectators` 观战席；密码未做。
- `room:rejoin` 已实现：同 `playerId` 可恢复原玩家座位或观战身份，并刷新昵称、连接状态。
- `room:sit` 已实现：观战者可在非 `playing` 状态下补入空玩家座位；对局进行中不能抢座位。
- 观战权限已实现：观战者可以收到 `RoomSnapshot` 和棋盘变化，但不能 ready、落子、认输、请求悔棋、响应悔棋或重开。
- `game:start` 保留为兼容事件；当前产品 UI 不再展示 Start，双方 ready 后由 `RoomStore` 自动进入 `playing`。
- `game:move` 的核心状态操作已实现：服务端按成员、回合、坐标、占位和 moveSeq 校验，复用 `src/game/board.ts` 判定胜负。
- `game:undo-request` / `game:undo-respond` 已实现：只允许最后一手落子者请求悔棋；对手确认后回退，拒绝或 10 秒超时后保留局面；每人每局 3 次请求机会，同一局面被拒后不能连续重发。
- `game:resign` 的核心状态操作已实现：对局中认输后直接 finished，胜方为对手。
- `game:restart` 已实现：只允许房主在 finished 后重置房间，双方需重新 ready；每次重开都会切换下一局先手，房主权限不随先手变化。
- 断线/重连的核心连接状态标记已实现；刷新恢复通过 sessionStorage `playerId` + `roomCode` + 服务器签发的 `guestToken` 完成，并兼容读取旧 localStorage 记录。
- 显式 `room:leave`、同一 socket 创建新房、同一 socket 加入其他房间都会释放非 `playing` 旧座位；房间没有玩家和观战者时立即关闭。
- `room:create` 前端增加同步 in-flight 锁，防止创建 ack 返回前连点发出多个创建请求。
- Socket.IO 进房前会清理没有任何 socket 仍在房间频道里的僵尸房；即使服务端还残留房间记录，只要真实房间里没人，也会广播 `room:closed` 并从大厅列表移除。
- 断线宽限期和超时判负已完成基础版：`playing` 中断线会设置 `disconnectDeadline`，默认宽限期 60 秒，宽限期内可重连，超时后在线对手胜；双方均无在线玩家则 abandoned，并在无人状态下清理房间。
- 邀请链接已支持根路径保留房间参数：`/?room=ABC123` 会重定向为 `/en?room=ABC123`，前端加载后自动加入房间。
- Guest reconnect token 已完成：公开 playerId 不能直接重连；registered 用户继续使用 account token。Token 当前随单进程房间生命周期存在，多实例共享 session 留给 Redis/正式账号基础设施。
- 同一已认证玩家可以有多个活动 socket；只有最后一个房间 socket 断开才把座位标记为 disconnected，避免刷新/多标签旧连接误触发判负。
- 多实例上线前接 Redis Adapter。

## 测试清单

- 创建房间返回唯一 room code。已覆盖：`src/server/rooms.test.ts`。
- 重复 room code 能重试。已覆盖：`src/server/rooms.test.ts`。
- 房间不存在加入失败。已覆盖：`src/server/rooms.test.ts`。
- 第三人及之后加入同一房间进入观战席，不挤掉黑白座位。已覆盖：`src/server/rooms.test.ts`。
- 观战者可在非对局中补入空玩家座位。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`、`tools/smoke-room-lifecycle.ts`。
- 同名策略符合预期。已覆盖：`src/server/rooms.test.ts`。
- 第一位玩家黑棋、第二位白棋。已覆盖：`src/server/rooms.test.ts`。
- 未满员不能开始。已覆盖：`src/server/rooms.test.ts`。
- 非房间玩家不能开始或落子。已覆盖：`src/server/rooms.test.ts`。
- 观战者不能 ready、落子、认输、请求悔棋、响应悔棋或重开。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`。
- 非当前回合不能落子。已覆盖：`src/server/rooms.test.ts`。
- 客户端伪造 board/color 无效。当前 API 不接收客户端 board/color，只接收 `MoveIntent`；成员、回合、坐标和 `moveSeq` 校验已覆盖。
- Socket.IO 双客户端创建、加入、ready 自动开局、落子广播、悔棋请求确认、非法连走、断线提示和断线超时广播。已覆盖：`src/server/room-socket.test.ts`。
- Socket.IO 三客户端观战：第三人进入观战席、不能执行玩家动作、能收到落子广播。已覆盖：`src/server/room-socket.test.ts` 和 `tools/smoke-online-room.ts`。
- 浏览器双上下文创建、邀请 URL 加入、实时落子、非当前回合禁点、刷新恢复和断线提示。已手动验证。
- 断线宽限期内可恢复。Guest token、registered account token、同玩家多 socket 和最后连接断开语义已由 `src/server/accounts.test.ts`、`src/server/room-socket.test.ts` 覆盖。
- 宽限期后按规则处理。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`。
- 重复创建房间会释放旧房；空 waiting 房立即关闭；没有 socket 成员的僵尸房会在下一次进房前关闭；根路径邀请链接可自动进房。已覆盖：`src/server/rooms.test.ts`、`src/server/room-socket.test.ts`、`tools/smoke-room-lifecycle.ts`、`tools/smoke-share-url.ts`。

## 许可证边界

`scheng20/gomoku-online` 仓库级授权不清晰：

- 不复制源码。
- 不复制正则胜负检测。
- 不复制客户端提交 board 的模式。
- 只吸收短房间码、两人房、Socket.IO room 广播、对手离开提示、任一玩家开始这些产品/状态机思想。
