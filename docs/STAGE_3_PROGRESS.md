# Stage 3 Progress

更新日期：2026-06-25

本文件记录阶段 3 的小步骤进度。每个小步骤都必须完成实现、文档、验证、GitHub 推送，并在推送后等待 90 秒检查线上版本。

阶段 3 的棋谱数据口径：注册玩家和游客的在线对局棋谱都提交服务器，形成服务器棋谱池。后续“本地分析”指把收集来的棋谱导出到本地/离线分析流程，用于统计、筛选和生成自有开局库，不是只保存在游客浏览器本地。

## 小步 1：真实分享链接

状态：完成，已推送并通过真实服务器验证。

目标：

- 创建房间成功后，当前地址变为包含房间号的 URL。
- 加入房间成功后，当前地址同步为该房间 URL。
- 刷新恢复房间时，当前地址保持和房间一致。
- 分享按钮复制当前浏览器地址。
- 离开房间成功后清理 URL 上的 `room` 参数。

实现：

- `src/components/useFriendRoom.ts`
  - room ack 成功后调用 URL 同步。
  - Copy invite 先同步当前房间 URL，再复制 `window.location.href`。
  - Clipboard API 不可用时使用 `execCommand("copy")` 备用路径。
  - Leave 成功后清理 room 参数。
- `src/components/room-url.ts`
  - 抽出纯 URL helper，便于单测。
- `src/components/room-url.test.ts`
  - 覆盖设置 room、更新 room、保留其他 query、清理 room。
- `tools/smoke-share-url.ts`
  - 使用系统 Chrome 和 Chrome DevTools Protocol 打开真实页面，验证 Friend room、Create room、Copy invite、Leave 的 URL 行为。

验证：

- `npm test`：通过，5 个测试文件、57 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3028 npm start` 后运行 `npm run smoke:share-url -- http://127.0.0.1:3028`，通过。
- 推送后等待 90 秒，`npm run verify:online -- http://gomoku.yagu.ddns-ip.net b6faf9e`：通过。
- 真实服务器：`npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net`，通过。
  - `PASS create room URL - E8VJ9U`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://gomoku.yagu.ddns-ip.net/en`

## 小步 2：观战席

状态：实现完成，本地验证通过；等待提交推送后做真实服务器验证。

目标：

- 第三个及之后加入同一房间的人进入观战席，不挤掉黑白玩家座位。
- 房间快照新增 `spectators`，包含观战者昵称、连接状态和加入时间。
- 观战者能看到棋盘、玩家列表、胜负、重开状态和观战人数。
- 观战者不能 ready、落子、认输、请求悔棋、响应悔棋或重开。

实现：

- `src/server/rooms.ts`
  - 新增 `RoomParticipantRole`、`RoomSpectatorSnapshot` 和 `spectators` 房间状态。
  - `room:join` 前两名成员进入黑白座位；第三人及之后进入 `spectators`。
  - `room:rejoin` 可恢复玩家座位或观战身份。
  - 观战者触发玩家动作时返回 `not-room-player`。
  - 观战者点击 Leave 时从观战席移除；断线时只标记观战连接状态。
- `src/server/room-contract.ts`、`src/server/room-socket.ts`
  - Room ack 返回 `role`、`seat` 和当前成员 `name`。
  - Socket 层区分玩家动作和房间成员动作。
- `src/components/useFriendRoom.ts`、`src/components/GameShell.tsx`
  - 前端识别 `player` / `spectator` 身份。
  - 观战者显示为 Spectator，功能栏玩家动作自动禁用。
  - 房间摘要显示观战人数，并列出观战者。
- `tools/smoke-online-room.ts`
  - 冒烟脚本升级为三客户端：host、guest、spectator。
  - 继续覆盖三局换先、悔棋拒绝/允许、连续悔棋拒绝和认输收尾。

验证：

- `npm test`：通过，5 个测试文件、59 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- 本地生产服务：`PORT=3029 npm start` 后运行 `npm run smoke:online-room -- http://127.0.0.1:3029`，通过。
  - `PASS room:join spectator - watcher seated without displacing players`
  - `PASS spectator move sync - watcher saw game 1 black center`
  - `PASS spectator move denied - not-room-player`
  - 三局 ready / restart 换先 / 悔棋 / 认输流程均通过。
- 本地生产服务：`npm run smoke:share-url -- http://127.0.0.1:3029`，通过。
  - `PASS create room URL - BP4KH6`
  - `PASS copy invite - copied current URL`
  - `PASS leave room URL clear - http://127.0.0.1:3029/en`
