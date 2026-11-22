# 联机大厅在线人数复查与修复交接（2026-11-22）

## 目标与基线

- 基准提交：`a53575fc7d7af75f4ad87c2f12cfe535ad5067f5`。
- 目标：复查上一轮前后端修复及线上实际页面，继续查找正常使用中可复现的逻辑或交互问题；按用户要求不派发 WorkBuddy。
- 前置同步：工作区原本干净。配置的 SSH 私钥缺失使默认 `git pull --ff-only` 失败；随后通过相同 GitHub 仓库的 HTTPS 地址执行 `git pull --ff-only`，确认已是最新提交。
- 线上 `/api/version` 和页脚均为 `0596ec1`，仍未部署上一轮 `a53575f` 及本轮修复。

## 发现与修复

### P2：大厅在线人数取决于是否打开“在线用户”面板

线上英文移动页面正常进入联机大厅后，活动栏显示 `0 Online`。仅打开“公共聊天 / 在线用户”面板，同一浏览器连接立即显示 `1 Online`。代码中 `LobbyUsersPanel` 挂载才调用 `refreshPresence()`，而服务端在线人数来自 Presence 连接计数，因此默认大厅会漏计正常在线的玩家。

现在由 `OnlineLobbyView` 在进入大厅时登记 Presence，面板仅展示已有在线用户列表和手动刷新按钮。用户进入房间后服务端沿用同一 Presence 身份，不会重复计数。

### P3：离开联机模式后仍被计为在线

原 `useRoomSocket` 仅在整个组件卸载时断开 Socket；从联机大厅切换到本地或 AI 工作区并不会卸载控制器。服务端于是保留该连接的 Presence 与大厅订阅。现在在联机模式关闭且已无房间时断开 Socket，服务器的断线处理释放 Presence。再次进入联机模式会创建新连接；大厅版本与订阅标记同时清零，避免用旧版本拒绝新快照。

## 验证与复查

- `npx tsc --noEmit`、`npm run lint`、`npm test`（35 套 / 362 项）、`npm run build`（18/18 静态页）均通过。
- 本地生产统一入口 `npm start`：`verify:online`、`smoke:lobby`、`smoke:matchmaking` 均通过。
- 两个独立浏览器源（`127.0.0.1` 与 `localhost`）同时进入联机大厅时显示 `2 Online`；一方切换到本地模式后另一方实时显示 `1 Online`；返回联机后恢复 `2 Online`。打开在线用户面板后计数保持 2，列表显示两人。
- 停止并重启本地生产服务：先观察到连接错误，恢复后大厅自动重订阅并显示 `2 Online`，旧错误提示消失。
- 本轮未部署到线上；线上版本仍需在部署后复查。

## 交付范围

修改 `OnlineLobbyView`、`LobbyUsersPanel`、`useRoomSocket`、`useLobbyPresence`，并更新本交接单、索引与状态文档。未引入依赖或改变服务端协议。
