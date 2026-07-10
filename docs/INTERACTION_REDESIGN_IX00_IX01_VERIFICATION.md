# IX-00 + IX-01 交互重构验证报告

验证日期：2026-07-10

结论：通过。`IX-00` 的状态基线和 `IX-01` 的互斥工作区可以作为 `IX-02` 的实施起点；未发现房间协议或既有在线闭环回归。

## 验证范围

- workspace selector：local、AI、online lobby、joining gate、online table 五类工作区及优先级。
- table state selector：spectator、可坐下、等待对手、准备、兼容 ready、双方回合、悔棋请求/响应、终局 host/guest、abandoned 共 13 类状态。
- 页面互斥：大厅不显示棋盘和桌内动作；牌桌不显示公共聊天、Presence、排行榜和公开房间列表。
- 在线门控：local/AI 不创建新的 Socket.IO 连接；在线模式保留单一 controller，并继续使用原 URL、session 和 socket 事件。
- 既有闭环：邀请 URL、身份恢复、Join/Watch、准备自动开局、落子、悔棋、认输、重开换先、观战补位、聊天、Presence 和离房清 URL。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、130 个测试全部通过；比实施前新增 21 个状态测试 |
| `npm run build` | 通过；Next 编译、TypeScript 检查和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `npm run smoke:lobby-ui -- http://127.0.0.1:3050` | 通过；local/AI 无 `/socket.io` 资源，Join/Watch 与大厅/牌桌互斥均通过 |
| `smoke:share-url` | 通过；邀请 URL、直达、复制、离房清 URL、注册身份恢复未回归 |
| `smoke:online-room` | 通过；玩家/观战、ready、落子、悔棋拒绝/允许、认输、重开换先未回归 |
| `smoke:room-lifecycle`、`smoke:matchmaking` | 通过；空房清理、补位、断线判负、匹配和取消未回归 |
| `smoke:room-chat`、`smoke:public-chat`、`smoke:presence` | 通过 |

socket/server 测试的业务期望没有为了迁就 UI 重构而修改。本批没有改 RoomStore、socket 事件名、room contract、URL 参数或身份 token。

## 浏览器与视口证据

本计划固定的后续验收视口为 1440×900、1280×720、390×844。

- 1440×900：检查 local、online lobby 和 online table；local 棋盘正常，大厅没有牌桌，牌桌没有大厅专属模块。
- 390×844：检查 online lobby；互斥关系成立，同时确认当前顶部语言/模式/入口仍存在拥挤和纵向堆叠，这属于已计划的 `IX-03`，本批未顺手改样式掩盖问题。
- 1280×720 以及 390×844 的完整牌桌动作/悔棋同屏验收属于 `IX-02 + IX-03`，不在只改变页面逻辑的 IX-01 中宣称完成。

应用内 Browser webview 两次等待附着均超时，因此没有把该通道冒充为成功证据。回归行为由项目现有的真实系统 Chrome/CDP smoke 验证，静态视觉由隔离的 headless Chrome 截图人工检查；本地验证截图保存在未跟踪的 `.codex/validation/ix00-01/`，不进入仓库。

## 已知边界与下一步

- `GameTableView` 仍保留旧动作区中的 disabled 按钮和阻塞式悔棋 modal；这是明确留给 `IX-02` 的迁移边界，不是遗漏后声称完成。
- 桌面牌桌信息仍排在棋盘上方，移动端仍是既有顺序堆叠；由 `IX-03` 负责桌边栏和移动优先级。
- 模式切换保护、public handle、unlisted、双方再战等 P1 能力均未进入本次提交。
- 受当前执行环境的上级协作限制，本轮不能派独立子代理；本报告由主控复核并执行，不声称满足“实现者之外的独立代理验证”。为补偿这一偏差，保留了单元测试、完整构建、依赖审计、系统 Chrome smoke 和明确的未覆盖项。

下一步只进入 `IX-02`：基于现有 `TableUiState` 增加 `getTableActions`、非阻塞 `TableTaskBar` 和最多四个上下文动作，不扩大到 P1 协议。
