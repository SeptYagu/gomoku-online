# 大厅与匹配模块逻辑

更新日期：2026-06-23

## 参考来源

- `minh100/Gomoku`：无仓库级 LICENSE，只参考大厅、房间列表、私密房和随机找局流程。

## 学到的逻辑

`minh100/Gomoku` 的大厅模块包含这些产品路径：

- 用户可以查看房间列表。
- 房间显示名称、玩家数、是否需要密码、加入按钮或进行中状态。
- 房间列表支持搜索过滤。
- 用户可以创建自定义房间。
- 房间可以设置可选密码。
- 用户可以点击“找一局”，有空房就加入，没有空房就自动创建。
- 大厅通过 Socket.IO 事件实时刷新。

这些功能很符合我们阶段 3，但它的实现方式需要调整。

## 我们要采用的设计

大厅数据结构：

- `roomId`：内部 ID。
- `roomCode`：邀请用短码。
- `displayName`：展示名，可自动生成。
- `locale`：房主当前语言，用于默认展示。
- `isPrivate`：是否私密。
- `hasPassword`：是否需要密码。
- `playerCount`：当前玩家数。
- `capacity`：默认 2。
- `status`：`waiting`、`playing`、`finished`。
- `createdAt`、`updatedAt`。

大厅视图：

- 可加入房间优先显示。
- 空位房间排在进行中房间前面。
- 支持按房间名、房间码、玩家昵称搜索。
- 移动端用紧凑列表，不做大卡片堆叠。
- 所有状态文案进入六语种字典。

随机找局：

- 优先进入匹配队列，而不是让客户端直接挑第一间房。
- 服务端匹配条件：
  - 相同规则模式。
  - 相近等级或游客池。
  - 非私密房。
  - 未满员。
  - 避免短时间重复匹配同一个对手。
- 如果等待超时，可以自动创建公开房并继续等待。

私密房：

- 不在公开匹配队列出现。
- 可通过邀请链接加入。
- 密码只在服务端校验，不能明文保存在可读客户端状态里。
- 数据库存密码哈希，不存明文。

## 必须改进的地方

参考项目中有两个不适合直接沿用的点：

- 客户端直接修改 `playerArray` 再提交给服务端。
- 客户端可决定加入哪个具体空房。

我们的改法：

- 客户端只发送 `matchmaking:join`、`room:create`、`room:join`。
- 服务端修改玩家列表和房间状态。
- 服务端返回完整房间快照。
- 大厅刷新使用分页或增量事件，避免每次广播全量房间和全量用户。

## 推荐事件

- `lobby:subscribe`
- `lobby:rooms`
- `lobby:room-created`
- `lobby:room-updated`
- `lobby:room-removed`
- `matchmaking:join`
- `matchmaking:leave`
- `matchmaking:matched`
- `room:create`
- `room:join`
- `room:password-required`
- `room:join-rejected`

## 不复制边界

- 不复制 `minh100/Gomoku` 的 React 组件或 Mongo schema。
- 只学习房间列表、密码房、找局按钮、实时大厅刷新这些产品逻辑。
