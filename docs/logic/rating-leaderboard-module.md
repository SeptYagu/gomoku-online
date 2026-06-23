# 评分与排行榜模块逻辑

更新日期：2026-06-23

## 参考来源

- `minh100/Gomoku`：无仓库级 LICENSE，只参考评分、排行榜刷新和离开惩罚思路。

## 学到的逻辑

参考项目的评分逻辑包含：

- 用户资料有 `username`、`rating`、`avatar`。
- 房间里存本局胜利加分和失败扣分。
- 对局结束后更新赢家和输家评分。
- 用户中途离开未完成对局时扣分。
- 排行榜按 rating 降序排序。
- 排行榜支持用户名搜索。
- 胜负更新后通过 socket 广播排行榜刷新。

## 我们要采用的设计

评分模型：

- 不采用随机 `ratingWin/ratingLose`。
- 使用 ELO 或 Glicko 风格公式，阶段 3 先实现 ELO。
- 游客可以有临时评分，但默认不进入正式排行榜。
- 正式排行榜只统计登录用户和有效局。

有效局规则：

- 至少达到最小手数，例如 8 手。
- 双方不是同一账号、同一设备或异常相近 IP 组合。
- 对局时长不能明显异常。
- 重复互刷需要降权或排除。

离开惩罚：

- 游戏未开始前离开不扣分。
- 游戏开始后主动离开，默认判负。
- 短暂断线进入宽限期，不立刻惩罚。
- 宽限期过后仍未重连，再判负或扣分。

排行榜维度：

- 总评分榜。
- 每日胜场榜。
- 连胜榜。
- 可选规则模式榜：普通五子棋、禁手、Swap2。
- 可选语言/地区展示，但排名本身不按语言切分。

## 数据模型草案

`User`：

- `id`
- `displayName`
- `rating`
- `avatarUrl`
- `createdAt`
- `lastActiveAt`

`Game`：

- `id`
- `ruleset`
- `status`
- `blackUserId`
- `whiteUserId`
- `winnerUserId`
- `resultReason`
- `startedAt`
- `endedAt`
- `isRated`

`RatingChange`：

- `id`
- `gameId`
- `userId`
- `before`
- `after`
- `delta`
- `reason`

`LeaderboardSnapshot`：

- `id`
- `kind`
- `period`
- `rows`
- `generatedAt`

## 推荐事件/API

Socket events：

- `leaderboard:subscribe`
- `leaderboard:updated`
- `rating:changed`

HTTP API：

- `GET /api/leaderboards/rating`
- `GET /api/leaderboards/daily-wins`
- `GET /api/users/:id/rating-history`

## 必须改进的地方

参考项目会在胜负后广播全量用户列表。我们不建议这样做。

我们的改法：

- 排行榜用分页 HTTP API 读取。
- socket 只广播轻量变更：榜单类型、版本号、受影响用户。
- 客户端根据需要刷新当前页。
- 排行榜搜索走服务端查询，避免大用户量时把全量用户推给客户端。

## 不复制边界

- 不复制 `minh100/Gomoku` 的 schema、组件或评分代码。
- 只保留“胜负后变更评分、离开未完成局惩罚、榜单实时刷新”的产品逻辑。
