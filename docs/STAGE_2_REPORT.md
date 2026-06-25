# 阶段 2 好友房在线对战报告

更新日期：2026-06-25

本报告记录阶段 2 好友房在线对战 MVP 的完成状态。目标是让两个浏览器窗口可以通过房间码或邀请链接进入同一房间，并由服务端权威状态同步准备、开局、落子、认输、断线提示、刷新恢复和房主重开。

## 本轮完成项

- 新增 Socket.IO 依赖，并提供 `npm run dev:online` / `npm run start:online` 启动带实时服务的自定义 Next server。
- 新增 `src/server/online-server.ts` 和 `src/server/room-socket.ts`，Socket handler 只调用 `RoomStore`，不信任客户端棋盘或胜负结果。
- 扩展 `src/server/rooms.ts`：支持同 `playerId` 重连、查询座位、房主终局后重开。
- 新增 `src/server/room-contract.ts`，共享客户端房间状态和 ack 类型。
- 新增 `src/components/useFriendRoom.ts`，封装创建、加入、重连、准备、开局、落子、认输、重开、离开、邀请链接和 localStorage session。
- `src/components/GameShell.tsx` 接入好友房模式，房间状态驱动棋盘、状态栏、按钮可用性和当前回合。
- 六语言字典补齐好友房核心文案。
- CSS 补齐好友房面板、表单、玩家列表、错误提示和移动端布局。
- 新增 `src/server/room-socket.test.ts`，用真实 Socket.IO server/client 验证双客户端事件路径。

## 命令验证

| 命令 | 状态 | 结果 |
| --- | --- | --- |
| `npm test` | 通过 | 4 个测试文件、45 个测试用例通过 |
| `npm run lint` | 通过 | ESLint 无报错 |
| `npm run build` | 通过 | Next 生产构建和 TypeScript 检查通过 |

## 浏览器验收

本地服务：

```powershell
$env:PORT='3010'; npm run dev:online
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
| 双方 ready/start | 通过 | 双方 Ready 后 Host 可 Start，对局进入 playing |
| 实时落子 | 通过 | Host 在中心落黑，Guest 页面同一坐标实时出现黑子 |
| 非当前回合禁点 | 通过 | Host 落黑后下一手未轮到 Host，棋盘空点禁用 |
| 刷新恢复 | 通过 | Host 刷新后进入 Friend room，localStorage session 自动恢复房间和已有棋子 |
| 断线提示 | 通过 | Guest context 关闭后，Host 玩家列表显示 Guest disconnected |
| 桌面布局 | 通过 | 1440x950 截图未见好友房面板文字溢出或组件重叠 |
| 移动布局 | 通过 | 390x844 截图未见好友房面板文字溢出或组件重叠 |

截图证据：

```text
.codex-logs/stage2-room-desktop.png
.codex-logs/stage2-room-mobile.png
```

## 当前限制

- 房间状态仍为单进程内存，服务重启会丢房间。
- 断线后已能标记座位并通过同 `playerId` 刷新恢复，但还没有正式 reconnect token、宽限期倒计时、超时判负或 abandoned 自动流转。
- 尚未接 Redis Adapter，多实例部署时 Socket.IO room 映射和房间状态不会共享。
- 房间没有 TTL 和空房清理。
- 好友房没有密码、观战、聊天、棋谱保存、排行榜结算或账号绑定。
- 当前验证覆盖 English UI；其他语言文案已进入字典，但好友房六语言浏览器回归仍可在公开测试前补一轮。

## 下一主线阶段

阶段 2 已达到主计划中的好友房 MVP 验收标准。下一主线应进入 M3 公开测试准备：部署测试站、邀请真实用户试玩，记录移动端误触、断线恢复和在线服务稳定性问题；同时补 SEO 基础、房间 TTL、超时判负、Redis Adapter 和线上运行说明。
