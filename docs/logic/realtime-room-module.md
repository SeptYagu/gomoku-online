# 实时好友房模块逻辑

更新日期：2026-06-25

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

当前 Stage 2 MVP 已落地：

- `src/server/rooms.ts`：纯 TypeScript 房间核心，不依赖 Socket.IO、不依赖数据库，负责房间码、座位、ready/start、服务端权威落子、胜负判定、认输、重开和连接状态标记。
- `src/server/room-socket.ts`：Socket.IO 事件层，只把客户端事件转换为 `RoomStore` 调用，并广播返回的 `RoomSnapshot`；不在 Socket handler 里重新实现棋盘规则。
- `src/server/online-server.ts`：Next + Socket.IO 自定义在线服务，开发时用 `npm run dev:online` 启动。
- `src/components/useFriendRoom.ts`：浏览器端好友房状态、localStorage session、重连、邀请链接和 socket 事件封装。
- `src/components/GameShell.tsx`：好友房 UI 接入棋盘、状态栏和控制按钮。

房间对象：

- `roomId`：内部 ID，用于存储和广播。
- `roomCode`：邀请用短码，只做入口。
- `players`：座位、昵称、用户 ID、连接状态。
- `status`：`waiting`、`ready`、`playing`、`finished`、`abandoned`。
- `board`：服务端权威棋盘。
- `currentTurn`：当前座位。
- `moveSeq`：服务端递增手数。
- `ruleset`：规则模式。
- `createdAt`、`updatedAt`。

状态机：

- `waiting`：一名玩家或空位存在。
- `ready`：两名玩家已入座。
- `playing`：对局中。
- `finished`：胜负、平局、认输。
- `abandoned`：断线超时、房间过期或异常关闭。

断线路径：

- 断线先标记座位 `disconnected`。
- 设置 `reconnectDeadline`。
- 宽限期内可用 session token 恢复座位。
- 超时后按规则判负、弃局或转 abandoned。

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

- `game:start`
- `game:move`
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
- 实现房间 TTL 和空房清理。未完成，公开测试前补。
- `room:create` 的核心状态操作已实现：创建房间并加入黑棋房主。
- `room:join` 的核心状态操作已实现：容量、昵称、重复玩家校验；密码未做。
- `room:rejoin` 已实现：同 `playerId` 可恢复原座位并刷新昵称、连接状态。
- `game:start` 的核心状态操作已实现：只允许两名玩家 ready 后触发。
- `game:move` 的核心状态操作已实现：服务端按成员、回合、坐标、占位和 moveSeq 校验，复用 `src/game/board.ts` 判定胜负。
- `game:resign` 的核心状态操作已实现：对局中认输后直接 finished，胜方为对手。
- `game:restart` 已实现：只允许房主在 finished 后重置房间，双方需重新 ready/start。
- 断线/重连的核心连接状态标记已实现；刷新恢复通过 localStorage `playerId` + `roomCode` 完成。
- 宽限期、正式 reconnect token、房间 TTL、空房清理和超时判负仍未做。
- 多实例上线前接 Redis Adapter。

## 测试清单

- 创建房间返回唯一 room code。已覆盖：`src/server/rooms.test.ts`。
- 重复 room code 能重试。已覆盖：`src/server/rooms.test.ts`。
- 房间不存在加入失败。已覆盖：`src/server/rooms.test.ts`。
- 房间满员加入失败。已覆盖：`src/server/rooms.test.ts`。
- 同名策略符合预期。已覆盖：`src/server/rooms.test.ts`。
- 第一位玩家黑棋、第二位白棋。已覆盖：`src/server/rooms.test.ts`。
- 未满员不能开始。已覆盖：`src/server/rooms.test.ts`。
- 非房间玩家不能开始或落子。已覆盖：`src/server/rooms.test.ts`。
- 非当前回合不能落子。已覆盖：`src/server/rooms.test.ts`。
- 客户端伪造 board/color 无效。当前 API 不接收客户端 board/color，只接收 `MoveIntent`；成员、回合、坐标和 `moveSeq` 校验已覆盖。
- Socket.IO 双客户端创建、加入、ready、start、落子广播、非法连走和断线提示。已覆盖：`src/server/room-socket.test.ts`。
- 浏览器双上下文创建、邀请 URL 加入、实时落子、非当前回合禁点、刷新恢复和断线提示。已手动验证。
- 断线宽限期内可恢复。基础刷新恢复已验证；正式 token + deadline 未实现。
- 宽限期后按规则处理。未完成，公开测试前补。

## 许可证边界

`scheng20/gomoku-online` 仓库级授权不清晰：

- 不复制源码。
- 不复制正则胜负检测。
- 不复制客户端提交 board 的模式。
- 只吸收短房间码、两人房、Socket.IO room 广播、对手离开提示、任一玩家开始这些产品/状态机思想。
