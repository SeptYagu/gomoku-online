# IX-06 终局历史与牌桌内复盘验证

验证日期：2026-07-10

结论：通过。finished 当前局和仍有 moves 的 abandoned 局面可直接在原牌桌逐手复盘；双方再战或兼容 restart 清空当前 moves 后，当前房间成员可按 `previousGameId` 读取上一局权威 record。复盘只改变客户端 inspection state，不改写 socket、房间或权威棋盘，退出后立即回到实时牌桌。

## 权威记录与可见性边界

- `RoomState/RoomSnapshot` 新增 `previousGameId`；rematch 与兼容 restart 都在递增 gameId 前保存旧 gameId，跨局边界由服务端决定。
- `GameRecordStore.getRoomRecord(gameId, roomCode)` 返回去身份化 `RoomGameRecordSnapshot`：棋盘、moves、结果、玩家姓名/座位和 visibility；不返回 playerId、token、审计提交或冲突详情。
- 新增 socket `game-record:get { gameId }`。请求者必须仍是当前 roomCode 的 player 或 spectator，且 record.roomCode 必须匹配；房外 socket 返回 `not-room-member`，错误 roomCode 返回 `game-record-not-found`。
- public 与 unlisted 都可由当前房间成员读取上一局，保证 unlisted 连续桌可复盘；unlisted 仍不进入 Profile/排行榜。只有 public 上一局且当前连接是 seated player 时，侧栏才链接该玩家自己的 Profile/Game records。

## 牌桌复盘交互

- 当前 finished 局从 `RoomSnapshot.moves` 打开；新局/刷新后的上一局从 controller 加载的授权 record 打开，不从聊天文本或易失本地缓存推测棋谱。
- `table-replay.ts` 复用 `replayBoardAtMove`，打开时定位最后一步；Previous、Next 和 range 均做边界 clamp，并每次重建只读棋盘。
- 复盘期间主棋盘替换为 replay frame，225 个交点禁用，普通 task/action bar 隐藏；专用 replay bar 显示 gameId、当前手数、前后步、滑块和 Exit replay。
- Exit replay 只清本地 replay state，权威 snapshot 不变；离房、成功切模式也会清 replay，避免把旧棋谱带入其他工作区。
- History 页签在 finished 显示当前局 Replay；新局显示 Previous game、gameId、手数和 Replay。移动端 replay bar 转为纵向，range 保持至少 44px 高；六种语言均有 Replay/Exit/Previous game/loading 文案。

## 自动化与浏览器结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 17 个测试文件、170 个测试通过 |
| replay / table state / records / RoomStore / socket 定向测试 | 5 个文件、101 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:lobby-ui` | 真实 Chrome 完成终局 1 -> 0 -> 1、Exit、双方再战、Arabic/English 刷新重连、上一局 1 -> 0 -> 1 与 Profile 链接 |
| 核心回归 smoke | share-url、online-room、room-lifecycle、game-records、profile-records、profile-page、account、leaderboard、Presence 均通过 |
| `git diff --check` | 通过 |

Profile page 首次与多个注册 smoke 共用同一生产进程并行执行，正确触发既有同 IP 注册限流 429；没有放宽产品限流。重启独立生产服务、使用单独临时数据后 profile-page 与 Presence 均通过。

## 浏览器证据

系统 Chrome/CDP 保存未跟踪证据：

- `.codex/validation/ix06/terminal-replay.png`
- `.codex/validation/ix06/previous-game-replay.png`
- `.codex/validation/ix06/rematch-open.png`
- `.codex/validation/ix06/rematch-ready.png`
- `.codex/validation/ix06/confirmation-rtl-390x844.png`
- `.codex/validation/ix06/undo-1440x900.png`
- `.codex/validation/ix06/undo-1280x720.png`
- `.codex/validation/ix06/undo-390x844.png`

人工确认两张复盘主证据在 1280×720 下均同时显示 replay bar、完整棋盘、玩家/历史侧栏和退出入口；终局图来自当前 snapshot，上一局图来自刷新重连后的权威 record。棋盘石子和 last-move 标记随步数变化，无覆盖或横向溢出。

应用内 Browser 仍受当前任务标签会话附着故障影响；交互和截图使用隔离系统 Chrome/CDP。当前执行环境未开放子代理派发，本报告由主控执行，不声称独立子代理验收。

## 未实现边界与下一步

- 当前只保留一个 `previousGameId`，不是无限多局桌内档案；完整历史仍由 Profile/Game records 承担。
- 成员 record 查询依赖当前单进程房间成员关系；房间销毁后不提供私有/unlisted 的公开回放 URL。
- 没有在牌桌内加入 SGF 下载、评论或分析工具；这些不属于 IX-06 的连续桌交互闭环。
- activity summary、`matchConfig`、点名挑战和赛事没有混入；高熵邀请授权也仍未实现。

下一步按计划进入 `IX-07`，实现单进程可验证的大厅 activity summary，并明确多实例前的共享状态边界。
