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

- 状态：open
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
- 复测记录：待补。

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
