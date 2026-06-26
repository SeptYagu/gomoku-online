# 评分与排行榜模块逻辑

更新日期：2026-06-23

## 参考来源

- `minh100/Gomoku`：无仓库级 LICENSE，只参考评分、排行榜刷新和离开惩罚思路。

## 关键文件和证据

数据模型：

- `.research/minh100-Gomoku/server/Models/userModel.js:4-23`：用户字段，含 `rating`。
- `.research/minh100-Gomoku/server/Models/roomModel.js:14-29`：房间 `playerArray`、`ratingWin`、`ratingLose`。
- `.research/minh100-Gomoku/server/Models/roomModel.js:30-58`：内嵌 game 的 `winner`、`draw` 等字段。

胜负与离开：

- `.research/minh100-Gomoku/client/src/Engine/Game.js:3-24`：Game 运行时结构。
- `.research/minh100-Gomoku/client/src/Engine/Game.js:106-114`：客户端胜负/平局状态。
- `.research/minh100-Gomoku/client/src/Engine/Game.js:212-220`：客户端落子后的胜负判定。
- `.research/minh100-Gomoku/server/socketServer.js:59-99`：`updateWinner` / `updateLoser`。
- `.research/minh100-Gomoku/server/socketServer.js:120-137`：`handleLeaveGame`。
- `.research/minh100-Gomoku/server/index.js:97-114`：`updateGame` 与 `updateWinAndLose`。
- `.research/minh100-Gomoku/server/index.js:119-144`：`deleteGameRoom` 与 `leftGame`。
- `.research/minh100-Gomoku/client/src/Components/GameRoom/GameBoard.js:22-42`：客户端胜负后触发结算和删房。
- `.research/minh100-Gomoku/client/src/Components/BlockingForm/BlockForm.js:47-51`：未结束离开惩罚触发。
- `.research/minh100-Gomoku/client/src/Components/BlockingForm/LeaveForm.js:47-50`：未开局离开只删房。

排行榜：

- `.research/minh100-Gomoku/client/src/Components/Leaderboard/Leaderboard.js:7-32`：排行榜拉取、搜索、socket 更新。
- `.research/minh100-Gomoku/client/src/Components/Leaderboard/Leaderboard.js:71-104`：客户端排序和展示。
- `.research/minh100-Gomoku/client/src/Components/Navbar.js:21-39`：Navbar 监听 lobby 更新用户信息。
- `.research/minh100-Gomoku/client/src/Components/Navbar.js:154-157`：Navbar 展示当前 rating。
- `.research/minh100-Gomoku/client/src/Global/GlobalUser/GlobalUserState.js:12-16`：全量用户获取。
- `.research/minh100-Gomoku/server/Controller/userControls.js:8-15`：服务端全量用户返回。
- `.research/minh100-Gomoku/server/Routes/userRoute.js:8`：用户列表路由。

## 参考实现细节

### 数据模型

`User`：

- `username`
- `lowerUsername`
- `password`
- `rating`，Number，默认 0。
- `avatar`

缺失：

- `wins`
- `losses`
- `draws`
- `ratedGames`
- `provisional`
- `ratingUpdatedAt`

`Room`：

- 顶层 `playerArray` 是玩家快照数组，含 `username`、`rating`、`avatar`。
- 顶层 `ratingWin` 和 `ratingLose` 是 Number。
- 内嵌 `game` 包含 `board`、`currentTurn`、`turnNumber`、`winner`、`draw`、`win1`、`win2`。
- `winner` 默认 -1。
- `draw` 默认 false。

`Game` 类：

- 在客户端构造运行时 game。
- 本地判胜成功时把 `winner` 设为当前玩家索引。
- 棋盘满时设置 `draw = true`。
- Game 类本身没有 rating 字段。

### 胜负结算

`updateWinner(gameModel,currentRoom)`：

- 从 `currentRoom.playerArray[gameModel.winner]` 找 winner。
- 用 winner username 查 User。
- 新 rating = 当前 rating + `currentRoom.ratingWin`。
- `findOneAndUpdate` 写回。

`updateLoser(gameModel,currentRoom)`：

- 如果 winner 是 0，输家取 `playerArray[1]`。
- 否则输家取 `playerArray[0]`。
- 用 loser username 查 User。
- 新 rating = 当前 rating - `currentRoom.ratingLose`。
- 写回。

`updateWinAndLose` socket 事件：

- 先 updateWinner。
- 再 updateLoser。
- 再读取全部 users。
- 广播 `updateLeaderboard`，携带全量 users。

风险：

- winner 由客户端提交。
- currentRoom 由客户端提交。
- ratingWin/ratingLose 由客户端创建房间时带入。
- 没有服务端重新验证棋局。
- 加分和扣分不是事务。
- 没有幂等，重复触发会重复加扣分。

### 离开惩罚

`handleLeaveGame(userLeft,currentRoom)`：

- 用客户端传入的 profile username 查用户。
- 扣 `currentRoom.ratingLose`。
- 删除房间。

触发方式：

- 依赖 React Router 导航阻塞确认。
- 等待对手阶段离开只删房，不扣分。

风险：

- 断网、关标签页、刷新不一定触发。
- 没有断线重连宽限。
- 没有判断是否达到有效局门槛。
- 对手不一定获得胜利奖励。
- 平局后仍可能被误判为未完成。

### Leaderboard

首屏：

- 客户端 `getAllUsers()`。
- REST `GET /users`。
- 服务端 `UserModel.find()` 返回全量用户。

搜索：

- 客户端按 `username` substring 过滤。

排序：

- render 中 `sort((a,b) => b.rating - a.rating)`。
- 会原地修改数组。

socket 更新：

- 收到 `updateLeaderboard` 后再次 `getAllUsers()`。
- 同时 `setAllUsers(allNewUsers)`。
- 但 `allUsers` state 不是主要渲染来源，主要依赖 context users。

Navbar：

- 不监听 `updateLeaderboard`。
- 通过 `lobby` 事件里的 `userArray` 找当前用户并刷新 rating。
- 如果删房/lobby 与 rating 更新顺序错位，可能短暂显示旧分。

## 当前实现风险

- 随机加减分，非零和，容易通胀和操控。
- 客户端提交 winner、playerArray、ratingWin/ratingLose。
- 服务端不重新验证棋局和玩家身份。
- 广播全用户，可能泄露 password hash、lowerUsername、avatar 等字段。
- 无幂等。
- 非事务。
- 平局没有完整结算路径。
- 离开惩罚过于简单。
- 排行榜无分页、无服务端排序、无搜索索引。
- 使用 username 定位用户，而不是 immutable userId。

## 本项目采用方案

### 服务端权威结算

客户端只发送：

- 落子意图。
- 认输意图。
- 离开意图。

服务端负责：

- 验证回合。
- 验证棋盘。
- 判断胜负和平局。
- 计算 rating delta。
- 落库 rating events。

服务端不接受：

- 客户端 winner。
- 客户端 rating delta。
- 客户端 currentRoom 快照。

### ELO 规则

默认 rating：

- 注册用户：1200。
- 游客：临时 rating，可独立池。

公式：

- `expected = 1 / (1 + 10 ** ((Rb - Ra) / 400))`
- 胜：1。
- 负：0。
- 平：0.5。

K 值：

- 新手期：32。
- 稳定后：16 或 24。

要求：

- 同一局双方 delta 保持零和。
- 落库 `ratingBefore`、`ratingAfter`、`delta`。

### 有效局

计分条件：

- ranked 模式。
- 双方不同玩家。
- 服务端确认开始。
- 达到最低手数或最低时长。

不计分：

- 未开始取消。
- 过早退出。
- 异常重复刷局。

平局：

- 计有效局。
- 按 0.5 计算 delta。

### 离开和断线

- 显式认输立即结算。
- 断线给 30-60 秒重连窗口。
- 超时后按 forfeit 结算。
- 对手按胜局拿分。
- 未开局离开不扣分。

### 游客榜

- 注册用户榜和游客榜分离。
- 游客用 `guestId/session` 维护临时 rating 与昵称。
- 游客默认不进入注册用户总榜。
- 游客数据可设置过期时间。
- 游客在线对局棋谱也提交服务器，保存为匿名/guest game record；进入服务器棋谱池，用于后续导出到本地/离线分析流程、开局库生成和总体统计，但默认不展示在公开注册用户 Profile。

### Profile、状态和 Game Records

阶段 3 需要覆盖 PlayOK 同类产品的 Profile、Ranking、Game records 和用户状态能力：

- 用户状态：online、in_room、playing、spectating、offline。
- Profile：昵称、头像、Rating、胜负统计、最近对局、Game records 入口。
- Ranking：总榜、每日榜、连胜榜，榜单行可进入 Profile。
- Game records：注册玩家可查看自己的历史在线对局棋谱；游客记录以匿名/guest 方式保存。

在线对局棋谱提交：

- 对局结束后，胜负双方客户端都提交 game record。
- 服务端使用 `gameId` / `roomId` / 服务端签名 record id 进行幂等去重。
- 只收到一方时保存 partial。
- 双方都收到时进行一致性校验，合并为 verified。
- 双方不一致时以服务端权威快照为准，标记 conflicted。
- 保存格式需要能无损转成 SGF，便于后续开局库生成和玩家回看。
- “本地分析”指后续用户把服务器棋谱池导出到本地或离线分析流程，用于统计、筛选、训练/评估开局线和生成自有开局库；不是客户端浏览器本地保存策略，也不是当前阶段的浏览器内分析功能。

当前小步 8 已实现第一版：

- `RoomSnapshot.gameId` 按同一房间内局号递增，例如 `ABC123-1`、`ABC123-2`。
- `RoomSnapshot.finishReason` 标记 `five`、`draw`、`resign`、`disconnect`、`abandoned`。
- 客户端玩家看到 finished/abandoned 快照后自动提交 `game-record:submit`。
- 服务端用 finalized server snapshot 作为权威棋谱，客户端提交只参与一致性校验和双方到齐去重。
- `GameRecordStore` 以 append-only JSONL 保存记录状态更新，默认路径为 `data/game-records/records.jsonl`，可用 `GOMOKU_GAME_RECORDS_PATH` 覆盖。
- 当前没有注册系统，保存的玩家身份为 `guest`。

当前小步 9 已实现第一版 Profile / Game records 读回：

- `GET /api/profile?playerId=...&name=...&limit=...` 返回当前玩家资料快照。
- `GET /api/game-records?playerId=...&name=...&limit=...` 当前作为同一读回接口别名，后续可拆成独立棋谱列表。
- `PlayerProfileSnapshot` 包含 `identity`、`displayName`、胜负/和棋/verified/partial/conflicted 统计和最近棋谱摘要。
- 好友房面板显示当前游客 Profile、胜负统计和最近在线棋谱摘要。
- 当前身份仍为 `guest`；注册系统接入后，保留接口形状，把 identity 与 playerId 映射升级为注册账号。

当前小步 10 已实现第一版用户状态 / Presence：

- `GET /api/presence?limit=...&includeOffline=...` 返回当前在线用户状态快照。
- Socket.IO 新增 `presence:join`、`presence:list`、`presence:leave` 和 `presence:users`。
- Presence 状态由服务端当前连接和房间事实推导：`online`、`in_room`、`playing`、`spectating`、`offline`。
- 好友房面板显示在线用户列表、状态和房号。
- 当前仍以 guest/current-session playerId 为身份；后续账号系统接入后可把同一接口挂到注册用户身份。

### 排行榜 API

推荐：

```text
GET /api/leaderboard?scope=registered|guest&page=1&pageSize=50&search=abc
```

服务端排序：

- rating desc。
- games desc。
- updatedAt desc。

返回字段：

- `id`
- `displayName`
- `avatar`
- `rating`
- `rank`
- `stats`

禁止返回：

- password hash。
- private profile。
- email。
- internal auth fields。

### 增量事件

socket 不广播全用户。

事件：

- `leaderboard:ratingChanged`
- `user:ratingChanged`

payload：

- `gameId`
- affected user ids。
- rating。
- delta。
- stats。
- leaderboardVersion。

排行榜页：

- 只更新可见行。
- 或按 version 重新拉当前页。

Navbar：

- 订阅当前用户专属 `user:ratingChanged`。
- 或结算后拉 `/api/me`。
- 不依赖 lobby 全量用户刷新。

### 幂等与审计

Game 增加：

- `status`
- `result`
- `ratedAt`
- `ratingApplied`
- `ratingEvents[]`

数据库：

- 结算在事务里完成。
- 唯一约束 `gameId + ratingApplied` 或 `gameId + userId` 防重复。

## 实现任务清单

- 设计 `UserRating`、`RatingEvent`、`LeaderboardSnapshot`。
- 设计 `UserProfile`、`UserPresence`、`GameRecord`、`GameRecordSubmission`。
- 实现 ELO 计算函数。
- 实现有效局判定。
- 实现服务端权威结算。
- 实现认输/断线超时结算。
- 实现排行榜分页 API。
- 实现 `leaderboard:ratingChanged` 增量事件。
- 实现当前用户 rating 专属更新。
- 实现游客 rating 池。
- 实现在线对局棋谱提交、去重、partial/verified/conflicted 状态流。已完成第一版：`game-record:submit` + `GameRecordStore` JSONL。
- 实现注册玩家 Profile 和 Game records 查询 API。已完成第一版 guest/current-session 读回接口和 UI，注册账号绑定留到账号系统小步。
- 实现匿名/guest game record 保存策略。已完成第一版：在线玩家以 guest identity 写入服务器棋谱池。
- 实现用户状态 / Presence。已完成第一版：guest/current-session presence API、socket channel 和好友房在线用户面板。

## 测试清单

- 胜负 ELO 零和。
- 平局双方 delta 正确。
- 新手 K 值和稳定 K 值正确。
- 未开始离开不计分。
- 有效局内认输计负。
- 断线宽限期内重连不扣分。
- 超时断线判负且对手加分。
- 同一局重复结算无效。
- 排行榜分页排序稳定。
- 搜索不泄露敏感字段。
- 游客不进入注册用户总榜。
- 双方重复提交同一局不会产生重复棋谱。
- 只收到一方棋谱时记录为 partial。
- 双方一致时记录为 verified。
- 双方不一致时以服务端权威快照为准并标记 conflicted。
- 游客棋谱保存但不进入公开注册用户 Profile。

## 许可证边界

`minh100/Gomoku` 无仓库级 LICENSE。

因此：

- 不复制源码。
- 不复制组件结构。
- 不复制 schema。
- 不复制文案、样式或结算代码。
- 只借鉴评分、排行榜、离开惩罚、实时刷新这类业务思路和风险结论。

## 当前落地：Ranking 第一版（2026-06-25）

已完成第一版 guest/current-session 排行榜：

- 数据源只使用服务器端 `GameRecordStore` 内 `recordStatus=verified` 且 `status=finished` 的在线棋谱。
- 不接受客户端提交 rating、rank 或胜负统计。
- 通过重放 verified 棋谱计算：
  - `rating`
  - `games`
  - `wins`
  - `losses`
  - `draws`
  - `dailyWins`
  - `currentStreak`
  - `maxStreak`
  - `lastPlayedAt`
- 第一版 ELO：
  - 初始分 1200。
  - 前 10 局 K=32。
  - 之后 K=24。
- API：
  - `GET /api/leaderboard?scope=overall|daily|streak&limit=...`
  - `overall` 按 rating、wins、games、lastPlayedAt 排序。
  - `daily` 按当日胜局、rating、games、lastPlayedAt 排序。
  - `streak` 按当前连胜、最大连胜、rating、lastPlayedAt 排序。
- UI：
  - 好友房面板新增 Rankings 小面板。
  - 支持 Overall / Today / Streak 切换和刷新。

仍保留到后续小步：

- 注册账号。
- 注册玩家正式 Profile / Ranking。
- 排行榜分页、搜索和增量事件。
- 持久化 rating event 审计。
- 注册用户和游客榜单隔离策略。

## 当前落地：账号 / 注册玩家身份第一版（2026-06-25）

已完成轻账号第一版，用于先打通 registered identity，而不是一次性引入完整登录系统：

- 服务端新增 `AccountStore`：
  - `POST /api/account/register` 签发账号 token。
  - `GET /api/account/session` 校验 bearer token。
  - 默认 JSONL 持久化到 `data/accounts/accounts.jsonl`。
  - 只保存 token hash，不保存明文 token。
- Socket.IO 入口支持 `accountToken`：
  - `room:create`
  - `room:join`
  - `room:rejoin`
  - `matchmaking:find`
  - `presence:join`
  - `public-chat:send`
- 有效 token 由服务端解析为 registered `playerId` 和 `displayName`，忽略客户端伪造的 playerId/playerName。
- `RoomStore` 内玩家、观战者、presence、服务端权威棋谱都保留 `identity`。
- `GameRecordStore` 的 Profile 和 Leaderboard 读回会继承棋谱里的 `registered` / `guest` 身份。
- 前端好友房面板新增账号条：
  - 使用当前昵称注册轻账号。
  - token 存入浏览器 localStorage。
  - Sign out 后回到 guest。

仍保留到后续小步：

- 正式邮箱/密码/OAuth 登录。
- 注册玩家 Profile 页面独立入口。
- 游客榜和注册用户榜隔离策略。
- 账号改名、合并、注销和 token 轮换。
