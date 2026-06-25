# 阶段 2 好友房在线对战报告

更新日期：2026-06-25

本报告记录阶段 2 好友房在线对战 MVP 与 M3 公开测试准备加固状态。目标是让两个浏览器窗口可以通过房间码或邀请链接进入同一房间，并由服务端权威状态同步准备、自动开局、落子、联机悔棋请求、认输、断线提示、断线超时处理、刷新恢复和房主重开。

## 本轮完成项

- 新增 Socket.IO 依赖，并提供带实时服务的自定义 Next server。当前 `npm run dev` / `npm start` 默认使用该服务，`dev:next` / `start:next` 只保留给纯 Next 调试。
- 新增 `src/server/online-server.ts` 和 `src/server/room-socket.ts`，Socket handler 只调用 `RoomStore`，不信任客户端棋盘或胜负结果。
- 扩展 `src/server/rooms.ts`：支持同 `playerId` 重连、查询座位、双方 ready 自动开局、房主终局后重开并换先、联机悔棋请求确认、60 秒断线宽限期、超时判负、房间 TTL、空房清理。
- 新增 `src/server/room-contract.ts`，共享客户端房间状态和 ack 类型。
- 新增 `src/components/useFriendRoom.ts`，封装创建、加入、重连、准备、自动开局、落子、悔棋请求/响应、认输、重开、离开、邀请链接和 localStorage session。
- `src/components/GameShell.tsx` 接入好友房模式，房间状态驱动棋盘、状态栏、按钮可用性和当前回合。
- 六语言字典补齐好友房核心文案。
- CSS 补齐好友房面板、表单、玩家列表、错误提示和移动端布局。
- 新增 `src/server/room-socket.test.ts`，用真实 Socket.IO server/client 验证双客户端事件路径和断线超时广播。

## 命令验证

| 命令 | 状态 | 结果 |
| --- | --- | --- |
| `npm test` | 通过 | 4 个测试文件、54 个测试用例通过 |
| `npm run lint` | 通过 | ESLint 无报错 |
| `npm run build` | 通过 | Next 生产构建和 TypeScript 检查通过 |

## 浏览器验收

本地服务：

```powershell
$env:PORT='3010'; npm run dev:online
```

公开测试网址：

```text
http://gomoku.yagu.ddns-ip.net
```

生产服务器必须用 `npm run build && npm start` 启动当前版本。若使用 `next start` 或反向代理没有把 `/socket.io/` 转发到 Node 进程，好友房会出现 `xhr poll error` 或 `/socket.io` 404。

部署后可用脚本确认真实服务器页面、`/api/version`、Socket.IO polling 入口和 WebSocket upgrade：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
```

验收环境：

- URL：`http://127.0.0.1:3010/en`
- 系统 Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`
- Playwright 使用两个独立 browser context 模拟两名玩家。

覆盖结果：

| 场景 | 状态 | 证据摘要 |
| --- | --- | --- |
| 创建房间 | 通过 | Host 进入 Friend room 后创建房间并得到 6 位 room code |
| 邀请链接加入 | 通过 | Guest 打开 `/en?room={code}` 后房间码自动填入，并成功加入同一房间 |
| 双方可见 | 通过 | Host 页面玩家列表实时出现 Guest |
| 双方 ready 自动开局 | 通过 | 双方 Ready 后不需要 Start，对局直接进入 playing |
| 实时落子 | 通过 | Host 在中心落黑，Guest 页面同一坐标实时出现黑子 |
| 联机悔棋允许 | 通过 | Host 请求悔棋后，Guest 棋盘中央出现弹框；Guest Allow 后棋盘回退到空棋盘，轮到黑棋 |
| 联机悔棋自动拒绝 | 通过 | Guest 弹框拒绝按钮显示 `Reject (10)`；10 秒后自动拒绝，棋子保留，同一局面再次请求返回 `undo-request-rejected-position` |
| 非当前回合禁点 | 通过 | Host 落黑后下一手未轮到 Host，棋盘空点禁用 |
| 刷新恢复 | 通过 | Host 刷新后进入 Friend room，localStorage session 自动恢复房间和已有棋子 |
| 断线提示 | 通过 | Guest context 关闭后，Host 玩家列表显示 Guest disconnected |
| 断线超时判负 | 自动化覆盖 | Guest 断线超过宽限期后，RoomStore 标记 finished，Socket.IO 广播 Host 获胜 |
| 桌面布局 | 通过 | 1440x950 截图未见好友房面板文字溢出或组件重叠 |
| 移动布局 | 通过 | 390x844 截图未见好友房面板文字溢出或组件重叠 |

截图证据：

```text
.codex-logs/stage2-room-desktop.png
.codex-logs/stage2-room-mobile.png
```

## 当前限制

- 房间状态仍为单进程内存，服务重启会丢房间。
- 断线后已能标记座位，并通过同 `playerId` 在 60 秒宽限期内刷新恢复；宽限期倒计时尚未在 UI 上展示，正式 reconnect token 未实现。
- 尚未接 Redis Adapter，多实例部署时 Socket.IO room 映射和房间状态不会共享。
- 房间 TTL、空房清理、断线超时判负已完成单进程基础版；多实例共享仍需 Redis/持久层。
- 好友房没有密码、观战、聊天、棋谱保存、排行榜结算或账号绑定。
- 联机悔棋次数和拒绝局面规则已由内存房间状态维护；服务重启仍会丢失这些临时状态。
- 当前验证覆盖 English UI；其他语言文案已进入字典，但好友房六语言浏览器回归仍可在公开测试前补一轮。

## 下一主线阶段

阶段 2 已达到主计划中的好友房 MVP 验收标准，并已开始 M3 公开测试准备加固。下一步继续公开测试准备：邀请真实用户试玩，记录移动端误触、断线恢复和在线服务稳定性问题；同时补 SEO 基础、Redis Adapter、正式 reconnect token、WebSocket upgrade 确认和线上运行说明。
