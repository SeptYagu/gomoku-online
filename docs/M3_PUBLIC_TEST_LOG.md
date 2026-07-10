# M3 Public Test Log

更新日期：2026-06-25

本文件记录 M3 公开测试发现的问题、验证结果和关闭证据。不要删除旧记录；修复后在同一条下追加“修复记录”和“复测记录”。

## 当前基线

| 字段 | 值 |
| --- | --- |
| 测试站 | `http://gomoku.yagu.ddns-ip.net` |
| 部署验证版本 | 部署时填写页面 footer 或 `/api/version` 返回的短提交号 |
| 当前测试重点 | M3 公开测试准备 |
| 完成门槛 | 见 `docs/M3_PUBLIC_TEST_PLAN.md` |

## 记录模板

```markdown
### M3-YYYYMMDD-NNN：标题

- 状态：open / fixed / verified / wontfix
- 等级：P0 / P1 / P2 / P3
- 版本：页面或 `/api/version` 显示的短提交号
- 时间：
- 设备：
- 浏览器：
- 网络：
- 场景：
- 复现步骤：
- 期望结果：
- 实际结果：
- 截图/日志：
- 初步判断：
- 修复记录：
- 复测记录：
```

## 已记录项

### M3-20260625-001：部署前真实站点缺少版本 API

- 状态：verified
- 等级：P2
- 版本：真实服务器尚未部署 `c116620`
- 时间：2026-06-25
- 设备：开发机
- 浏览器：命令行验证脚本
- 网络：公网
- 场景：运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net`
- 复现步骤：
  1. 本地执行线上验证脚本。
  2. 脚本检查 `/en`、`/api/version`、Socket.IO polling 和强制 WebSocket。
- 期望结果：部署最新版后 `/api/version` 返回预期短提交号。
- 实际结果：`/en` 通过；polling 通过；websocket 通过；version 失败，提示无 `/api/version` 且静态 HTML 中没有版本 footer。
- 截图/日志：命令输出记录在 handoff 第 22 节。
- 初步判断：当前真实服务器尚未部署 `c116620`，不是本地代码失败。
- 修复记录：等待用户部署 `c116620` 或更新版本后重新验证。
- 复测记录：2026-07-10 只读运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net`，真实服务器返回版本 `e8b0771`，页面、版本 API、Socket.IO polling 和 WebSocket 全部通过；该部署前问题已被后续版本覆盖并关闭。

### M3-20260625-002：真实站点 WebSocket upgrade 已确认可用

- 状态：verified
- 等级：P3
- 版本：真实服务器当前版本，尚未部署 `c116620`
- 时间：2026-06-25
- 设备：开发机
- 浏览器：命令行验证脚本
- 网络：公网
- 场景：强制 `transports: ["websocket"]` 连接 `http://gomoku.yagu.ddns-ip.net/socket.io`
- 复现步骤：
  1. 执行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net`。
  2. 查看 `socket.io websocket` 检查项。
- 期望结果：强制 WebSocket 能连接成功。
- 实际结果：通过，脚本输出 `connected with websocket`。
- 截图/日志：命令输出记录在 handoff 第 22 节。
- 初步判断：此前只确认 polling 的风险已降低，当前代理支持 WebSocket upgrade。
- 修复记录：无需修复。
- 复测记录：每次部署后继续用 `verify:online` 回归。

### M3-20260625-003：真实站点版本和 Socket.IO 部署验证通过

- 状态：verified
- 等级：P3
- 版本：`299fc13`
- 时间：2026-06-25
- 设备：开发机
- 浏览器：命令行验证脚本
- 网络：公网
- 场景：运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 299fc13`
- 复现步骤：
  1. 确认 `origin/main` 已推送到 `299fc13`。
  2. 执行线上验证脚本并传入期望版本。
- 期望结果：页面、版本、polling 和 websocket 全部通过。
- 实际结果：全部通过；`/api/version` 返回 `299fc13`。
- 截图/日志：命令输出记录在 handoff 第 24 节。
- 初步判断：真实服务器已部署 `299fc13`，Socket.IO polling 和 WebSocket upgrade 均可用。
- 修复记录：无需修复。
- 复测记录：后续提交部署后需用新短提交号重跑。

### M3-20260625-004：本地生产三局好友房冒烟通过

- 状态：verified
- 等级：P3
- 版本：工作区未提交版本，基于 `299fc13` 后续改动
- 时间：2026-06-25
- 设备：开发机
- 浏览器：命令行 Socket.IO 客户端
- 网络：本地 `127.0.0.1:3025`
- 场景：运行 `npm run smoke:online-room -- http://127.0.0.1:3025`
- 复现步骤：
  1. `npm run build`。
  2. `PORT=3024 npm start`。
  3. 执行三局好友房冒烟脚本。
- 期望结果：第 1 局黑先，第 2 局白先，第 3 局黑先；双方都覆盖悔棋请求、拒绝、允许、同局面拒绝后禁止连续请求和认输收尾。
- 实际结果：全部通过。
- 截图/日志：命令输出记录在 handoff 第 24 节。
- 初步判断：服务端重开换先规则和三局冒烟脚本在本地生产服务通过。
- 修复记录：无需修复。
- 复测记录：待本轮提交部署到真实服务器后，用真实站点重跑 `smoke:online-room`。

### M3-20260625-005：真实服务器尚未部署三局冒烟版本

- 状态：verified
- 等级：P2
- 版本：真实服务器 `299fc13`，期望 `8e17d25`
- 时间：2026-06-25
- 设备：开发机
- 浏览器：命令行验证脚本
- 网络：公网
- 场景：运行 `npm run verify:online -- http://gomoku.yagu.ddns-ip.net 8e17d25`
- 复现步骤：
  1. 推送 `8e17d25` 到 `origin/main`。
  2. 执行线上版本验证脚本。
- 期望结果：`/api/version` 返回 `8e17d25`。
- 实际结果：页面、polling、websocket 均通过；版本仍为 `299fc13`。
- 截图/日志：命令输出记录在 handoff 第 25 节。
- 初步判断：真实服务器尚未部署本轮三局冒烟和重开换先版本。
- 修复记录：等待用户部署 `8e17d25` 或更新后的提交。
- 复测记录：后续版本已多次完成真实服务器 `verify:online` 和三局 `smoke:online-room`。2026-07-10 当前线上版本为 `e8b0771`，本轮修复前只读线上检查仍确认页面、版本、polling 和 WebSocket 通过；该旧部署等待项关闭。
