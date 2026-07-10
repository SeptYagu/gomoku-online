# IX-05 安全模式切换与局中设置验证

验证日期：2026-07-10

结论：通过。在线 playing player 切换模式或点击明确 Leave 前会看到非阻塞后果说明，只有 `room:leave` ack 成功后才清 URL/session 并切工作区；AI 已有落子时修改难度/先手不再清盘，而是明确标记为下一局生效。刷新/rejoin 不弹确认，并修复了普通动作 ack 擦除 guest rejoin token 导致刷新变 spectator 的旧缺陷。

## 模式切换决策

- 新增纯 `getModeChangeDecision`：点击当前 active mode 为 noop；AI 有落子切模式需确认；online playing seated player 需确认；waiting/finished/spectator/lobby 可直接离开。
- 顶部模式与 GameTable 明确 Leave 共用同一在线后果边界，不再让顶部按钮暗中承担离房副作用。
- 在线确认说明：seat 会断开、约 60 秒内可恢复，超过宽限可能因断线判负。确认前棋盘、任务栏和动作仍可见、可操作。
- `FriendRoomController.leaveRoom` 提供 completion 回调；跨工作区切换等待成功 ack。失败保留当前牌桌和错误，不产生“UI 已离开、服务端 seat 仍在”的分裂状态。
- 刷新、邀请 URL 和 stored-session rejoin 不经过点击决策，因此不弹确认。

## AI 下一局设置

- 空棋盘选择难度/先手立即应用；已有任一落子后只写入 pending difficulty/firstPlayer，不调用 reset 或取消当前局面。
- 当前生效设置继续显示 active；待生效按钮使用独立 pending 边框，status 条显示 `Next game: ...`，可 Cancel changes。
- New game 或下次进入 AI 工作区时一次性应用全部 pending 设置、清空 pending，并按目标先手建立新局。
- AI 有落子切换模式使用同一非阻塞确认条；Cancel 自动获焦，键盘 Enter 可取消并保留两手棋。

## 可访问确认条

- `InteractionConfirmation` 使用 `role=alertdialog`、显式 title/description 关联，不设置遮挡式 modal；Cancel 自动聚焦，Cancel 与危险确认均为原生 button。
- 桌面为图标/说明/动作三列；390×844 转两行，两个动作都至少 44px，继承文档 RTL，无根级横向溢出。
- 确认条始终位于当前工作区之前但不覆盖棋盘；用户可以取消并回到原操作位置。

## guest rejoin token 根因修复

真实 Chrome 刷新到阿拉伯语时最初两次都把原 seated guest 留为 disconnected，并以新游客进入 spectator。诊断确认：

1. 首次 join ack 含 guestToken，并写入 stored room session。
2. ready/move/rematch 使用 `runForCurrentPlayer`，旧 ack 不含 guestToken。
3. 客户端 `applyRoomAck` 每次重写 stored session，把 token 覆盖为 undefined。
4. 刷新 rejoin 只提交 stored session；失败后 URL fallback 用新游客正常 join，于是成为 spectator。

修复采用双层兼容：服务端 guest 的当前成员动作 ack 回传 `socket.data.guestToken`；客户端在 ack 缺字段时从现有 guest token / stored session 保留值。socket 测试验证 ready ack 与首次 join token 相同；修复后真实 `/ar?room=...` 刷新恢复原 playing seat，未出现确认。

## 自动化与浏览器结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 16 个测试文件、168 个测试通过 |
| interaction guards + table state | 2 个文件、36 个测试通过 |
| socket 定向测试 | 21 个测试通过，含动作 ack token 保留与 rematch rejoin |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:lobby-ui` | Expert + AI first 同时 pending，New game 后 AI 自动先手；AI 键盘取消、online 模式取消、明确 Leave ack、真实 Arabic refresh/RTL 均通过 |
| 核心回归 smoke | share-url、online-room、room-lifecycle、account 均通过 |
| `git diff --check` | 通过 |

首轮 lint 拒绝了 effect 内同步收起确认条；删除该非必要 effect 后通过，没有用禁用规则掩盖。首轮在线截图裁掉标题，修正取证滚动目标后重拍。RTL 首次失败则揭示上述真实 token 缺陷，未把 spectator 状态放宽为合法结果。

## 浏览器证据

系统 Chrome/CDP 保存未跟踪证据：

- `.codex/validation/ix05/ai-settings-next-game.png`
- `.codex/validation/ix05/ai-mode-switch-confirmation.png`
- `.codex/validation/ix05/online-mode-switch-confirmation.png`
- `.codex/validation/ix05/confirmation-rtl-390x844.png`
- `.codex/validation/ix05/undo-1440x900.png`
- `.codex/validation/ix05/undo-1280x720.png`
- `.codex/validation/ix05/undo-390x844.png`

人工确认：AI pending 图保留两手棋并显示 `AI first · Expert`；AI 确认图保留应用后的三手局面并完整显示 Cancel/Switch mode；在线确认图同时显示 60 秒后果、棋盘和 Resign/Leave；Arabic 移动图完整显示 RTL 说明、44px 按钮、棋盘和侧栏。

应用内 Browser 仍受当前任务标签会话附着故障影响；交互和截图使用隔离系统 Chrome/CDP。当前执行环境未开放子代理派发，本报告由主控执行，不声称独立子代理验收。

## 未实现边界与下一步

- pending AI 设置只存在于当前页面内存，刷新后不恢复；长期偏好持久化仍属于独立设置基础设施。
- 在线确认使用当前默认 60 秒文案；若服务端以后把不同房间的 grace 变为可配置，应把权威秒数加入 snapshot，而不是保留静态文案。
- IX-06 已完成当前终局与刷新后上一局的牌桌内逐手复盘；activity summary、比赛配置、挑战和赛事仍未混入。

后续状态（2026-07-10）：`IX-06` 已完成，详见 `docs/INTERACTION_REDESIGN_IX06_VERIFICATION.md`。下一步进入 `IX-07` 精确大厅汇总。
