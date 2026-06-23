# 实时好友房模块逻辑

更新日期：2026-06-23

## 参考来源

- `scheng20/gomoku-online`：无仓库级 LICENSE，只参考房间流程和事件模型。
- Socket.IO Rooms 官方文档：https://socket.io/docs/v4/rooms/

## 学到的逻辑

`scheng20/gomoku-online` 的好友房核心路径很短：

- 用户创建房间，服务端生成短房间码。
- 第二个用户用房间码加入。
- 服务端把第一个加入者分配为黑棋，第二个加入者分配为白棋。
- 房间满员时拒绝继续加入。
- 用户名在同一房间内不能重复。
- 双方都在同一个 Socket.IO room 中，落子后广播给房内双方。
- 游戏开始、落子、结束、对手离开都用 socket event 推送。
- 最后一名用户离开后移除房间。

Socket.IO 官方文档确认的关键点：

- room 是服务端概念，客户端不能直接读取自己加入过哪些 room。
- `socket.join(roomId)` 订阅房间，`io.to(roomId).emit(...)` 广播给房间内 socket。
- `socket.to(roomId).emit(...)` 可以广播给房间内除发送者以外的 socket。
- socket 断开时会自动离开所有 Socket.IO room。
- 多服务实例部署时需要 Redis Adapter，否则 room 映射只存在于单个进程。

## 我们要采用的设计

房间码：

- 使用 6-8 位大写字母数字码。
- 服务端生成并检查冲突。
- 好友邀请链接形如 `/en/room/ABC123`。
- 房间码只用于加入入口，不作为数据库主键。

房间状态：

- `waiting`：只有房主或尚未满员。
- `ready`：两名玩家都在，等待开始。
- `playing`：对局进行中。
- `finished`：已有胜负、平局或认输。
- `abandoned`：超时、断线过久或房间被清理。

玩家座位：

- `black`：默认先手。
- `white`：默认后手。
- 如果未来加入 Swap2 或禁手规则，座位分配需要由规则模块决定。

事件命名建议：

- `room:create`
- `room:join`
- `room:leave`
- `room:ready`
- `room:state`
- `game:start`
- `game:move`
- `game:resign`
- `game:restart-request`
- `game:restart-accept`
- `connection:lost`
- `connection:recovered`

## 必须改进的地方

参考项目里客户端会提交整块 board，服务端再广播。我们不能这样做。

我们的原则：

- 服务端是权威状态。
- 客户端只提交落子意图：`roomId`、`row`、`col`、客户端本地序号。
- 服务端校验房间、座位、回合、坐标、是否已结束。
- 服务端计算新棋盘、胜负、下一手，再广播快照。
- 客户端收到快照后覆盖本地状态，不能自己决定胜负。

断线逻辑：

- 短暂断线保留座位，例如 60-120 秒。
- 玩家重连需要通过 session token 绑定回原座位。
- 超过保留时间后可判负、变成 abandoned，或给对手选择继续等待。

多实例部署：

- MVP 单实例可用进程内房间表。
- 正式上线随机匹配或多服务器时，必须使用 Redis 保存在线状态和匹配队列。
- Socket.IO 多实例广播使用 Redis Adapter。

## 不复制边界

- 不复制 `scheng20/gomoku-online` 的源码。
- 不使用它的服务端 board 信任模式。
- 只保留“短房间码 + 两人房 + room broadcast + 对手离开提示”的流程思想。
