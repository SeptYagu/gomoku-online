# IX-06A 双方再战意愿与自动续局验证

验证日期：2026-07-10

结论：通过。终局不再由房主单方面重置；任一 seated player 可独立选择或取消“再来一局”，双方意愿达成且都在线后，服务端只创建一个下一局、轮换先手并立即进入 playing。双方同意前，权威终局棋盘、moves、winner 和上一局 record 均保持不变。

## 权威状态与协议

- `RoomSnapshot/RoomState` 新增 `rematch { readySeats, requestedAt }`，意愿以 black/white seat 为权威键并稳定排序。
- 新增 `game:rematch-ready { roomCode, ready }`；只接受 finished 房内 seated player，spectator 返回 `not-room-player`，其他状态返回 `game-not-playing`。
- 单方 ready 只写入 seat 与时间；取消只清除本人 seat。双方 ready 且两个玩家均 connected 时，服务端原子递增 gameNumber/gameId、清棋盘/moves/undo/rematch、轮换先手并直接进入 playing。
- 新局沿用成员、房间聊天、visibility 和房间码；上一局已由现有权威 record 保存，不因清当前 snapshot moves 而丢失。
- Node 单线程 RoomStore 操作和 finished 状态门控保证同时事件只创建一次。第二个重复 rematch 或与旧 restart 竞争的事件会因状态已改变而失败，不再递增 gameId。

## 断线、离开与座位边界

- finished 玩家短暂断线不再立即 remove；seat、rematch 意愿和 disconnectDeadline 保留到既有宽限期，双方同时短断也不会在 grace 前被立即删房。
- 一方离线时即使双方意愿已齐，房间仍保持 finished；`room:rejoin` / restore 恢复连接后才重新检查并原子开局。
- 显式 Leave、断线宽限到期或 spectator 补入断线 seat 都会清除该 seat 意愿，防止新玩家继承旧玩家投票；hostSeat 随既有 remove/补位规则转移。
- finished 宽限到期只移除离线 seat，不改写已经完成的 winner/finishReason；无参与者后仍按现有清理路径删除。

## 旧客户端兼容

- `game:restart` 和 `RoomStore.restartGame` 保留；仍仅 host 可用，返回 waiting，双方需重新 Ready。
- 新 UI 不再暴露 canRestart/restartGame，也不显示 host-only Restart；兼容事件只是迁移边界，不与新终局主任务并列。
- restart 与 rematch 共用下一局 reset 核心，均正确递增 gameId、清 undo/rematch、轮换先手；差异只在目标状态和 player.ready。

## 前端状态与文案

- `finished-host/finished-guest` 被 `finished-rematch-open/finished-rematch-ready` 替换，host 与 guest 享有同一流程。
- open 状态显示 Play again + Leave；ready 状态显示 Cancel rematch + Leave。task 决策始终 1 个，全部动作 2 个，不超过既有上限。
- 任务栏分别说明“要再来一局吗”和“等待对手选择再战”；终局棋盘始终保持可见，不使用阻塞 modal。
- 六语种新增 rematch、cancel、prompt、waiting 文案；旧 host restart 文案从新 UI 字典接口移除。

## 测试与浏览器结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、160 个测试通过 |
| table state / RoomStore / socket 定向测试 | 3 个文件、91 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:online-room` | mutual rematch 直接开始 game 2；旧 restart + Ready 仍开始 game 3 |
| `smoke:lobby-ui` | 真实 Chrome open -> ready -> 双方同意 -> playing；原大厅、悔棋、三视口与 RTL 回归通过 |
| 其他核心 smoke | share-url、lobby、matchmaking、room-lifecycle、Presence、records、account、leaderboard 均通过 |
| `git diff --check` | 通过 |

socket 测试显式覆盖刷新：guest ready 后断线，host ready 仍保持 finished；新 socket 带服务器 guest token rejoin 后才创建 game 2。RoomStore 还覆盖取消、显式 leave、seat replacement、断线到期、spectator 拒绝、兼容 restart 竞争和上一局 record 保留。

## 浏览器证据

系统 Chrome/CDP 保存未跟踪证据：

- `.codex/validation/ix06a/rematch-open.png`
- `.codex/validation/ix06a/rematch-ready.png`
- `.codex/validation/ix06a/undo-1440x900.png`
- `.codex/validation/ix06a/undo-1280x720.png`
- `.codex/validation/ix06a/undo-390x844.png`
- `.codex/validation/ix06a/table-rtl-390x844.png`
- `.codex/validation/ix06a/lobby-rtl-390x844.png`

首轮 ready 截图只拍到任务条，没有作为合格完整证据。固定 1280×720、滚动到牌桌顶部并等待浏览器完成绘制后重拍；人工确认两张图都同时显示终局棋盘、当前任务、Play again / Cancel rematch 和 Leave。

应用内 Browser 仍受当前任务标签会话附着故障影响；交互和截图使用隔离系统 Chrome/CDP，没有冒充应用内通道成功。当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收。

## 未实现边界与下一步

- IX-06 已在此 record 边界上补齐当前终局与刷新后上一局的牌桌内逐手复盘。
- 局中离桌/模式切换确认和 AI 设置下一局生效仍属于 IX-05。
- rematch 状态随单进程房间存在，不是跨实例共享状态；多实例前仍需 Redis Adapter/共享房间存储。
- activity summary、matchConfig、点名挑战和赛事没有混入本阶段。

后续状态（2026-07-10）：`IX-05` 与 `IX-06` 已完成，安全切换和跨局复盘均不改变双方再战的权威门控。详见对应验证报告。下一步进入 `IX-07`。
