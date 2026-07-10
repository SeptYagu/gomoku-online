# IX-02 牌桌任务栏与状态动作模型验证

验证日期：2026-07-10

结论：通过。13 类牌桌状态现在由纯动作模型驱动；无关动作被隐藏，悔棋决策不再遮住棋盘，`IX-03` 可以在这一稳定动作契约上重排桌面和移动布局。

## 实现范围

- `getTableActions(state, capabilities)`：把既有 controller 权限转换为有序、可见的 task/toolbar 动作。
- `TableTaskBar`：显示一个当前主任务和最多两个当前决策；悔棋响应同时显示 Reject 倒计时与 Allow。
- `TableActionBar`：只显示当前可用次动作，不再长期陈列 disabled Undo/Resign/Restart。
- `TablePlayers`：从 `GameTableView` 提取玩家和观战者呈现，为 IX-03 迁入桌边栏建立边界。
- `GameTableView`：删除阻塞棋盘的 undo modal；保留原 controller、URL/session、RoomStore 和 socket 事件。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、144 个测试通过；动作模型新增 14 个用例 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:lobby-ui` | 通过；覆盖 Guest Ready、Host Ready/落子/悔棋请求、Guest Allow、spectator、无 disabled 动作、无 modal、总动作不超过 4 |
| `smoke:online-room` | 通过；三局、悔棋拒绝/接受、认输、重开换先未回归 |
| `smoke:room-lifecycle`、`smoke:matchmaking` | 通过 |
| `smoke:room-chat`、`smoke:public-chat`、`smoke:presence` | 通过 |
| `smoke:share-url` | 与生命周期 smoke 并行时首次在等待空房清理处超时；其他并行用例结束后单独重跑通过，完整覆盖创建 URL、邀请直达、复制、离房清 URL、空房关闭和注册身份恢复 |

首次 share-url 超时没有被记成通过；隔离重跑证明它来自并发生命周期测试污染，本轮没有修改空房清理或分享协议。

## 三目标视口与视觉检查

扩展后的系统 Chrome/CDP smoke 在悔棋响应态分别设置并验证：

- 1440×900；
- 1280×720；
- 390×844。

每个视口均断言任务栏和棋盘在同一 viewport 内、二者不重叠、Reject/Allow 均至少 32px、没有 `aria-modal`。可选截图模式生成并人工检查了：

- `.codex/validation/ix02/undo-1440x900.png`
- `.codex/validation/ix02/undo-1280x720.png`
- `.codex/validation/ix02/undo-390x844.png`

截图显示桌面和移动端均可同时辨认请求者、倒计时、Allow 和棋盘；390×844 下按钮改为任务提示下方双列，没有遮挡棋子。截图属于本地验证资产，不进入 Git。

应用内 Browser 已成功选择，但新标签两次报告不属于当前任务会话；按 Browser 技能恢复流程检查后仍不能导航，因此没有把该通道冒充为成功证据。实际交互、布局几何和截图均来自项目既有的隔离系统 Chrome/CDP 路径。

## 边界与下一步

- 房间摘要、玩家、观战者和聊天目前仍在棋盘上方；这是 `IX-03` 的桌边栏/移动重排范围。
- 六语种新文案通过类型、lint 和 build；阿拉伯语 RTL 的完整桌边栏与触摸验收在 `IX-03` 一并执行，不在本报告中虚构已完成。
- 对局中 Leave 仍沿用旧行为，确认保护属于 `IX-05`。
- finished 仍沿用房主 restart，双方 rematch 属于 `IX-06A`。
- 当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收；保留完整自动化、截图和未覆盖项作为可追溯证据。
