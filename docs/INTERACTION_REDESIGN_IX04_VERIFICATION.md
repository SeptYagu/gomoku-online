# IX-04 在线大厅入口与低活跃降级验证

验证日期：2026-07-10

结论：通过。在线大厅已从“所有能力同时展开”改为任务分层入口；快速匹配保持一次点击，朋友、身份、社区和战绩按意图展开，公开房列表按 Join/Watch 分组，空大厅和单人等待均有真实退出路径。

## 实现范围

- 快速匹配：大厅唯一大型主动作；游客身份恢复后无需先理解房间码或账户。
- 和朋友玩：一次展开后提供创建当前公开房和按房间码加入，并明确房间仍出现在公开大厅。
- 身份与次级内容：昵称/账号仅在编辑身份后挂载；公共聊天/Presence、Profile/排行榜位于房间列表后的次级展开区。
- 房间列表：使用现有 `canJoin` / `canWatch` 分为可加入和可观战；每行一个动作，状态继续显示真实 waiting/playing。
- 空大厅：提供快速匹配、创建房间、转 AI 三个真实出口，不展示静态在线人数。
- 取消等待：`seated-waiting-opponent` 通过既有 `matchmaking:cancel` 显示明确 Cancel waiting；没有新增 socket 事件或 RoomStore 语义。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、144 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:lobby-ui` | 通过；一次点击快速匹配、单人等待取消、渐进展开、手动按码一次提交、Join/Watch 分组、三视口牌桌和 390×844 RTL 大厅 |
| `smoke:share-url` | 通过；朋友区创建、邀请 URL 自动进入、复制当前 URL、取消等待清 URL、空房关闭和注册身份恢复 |
| 大厅/房间协议 smoke | `lobby`、`matchmaking`、`online-room`、`room-lifecycle`、公共/房间聊天、Presence、账户和排行榜均通过 |

## 浏览器与截图

系统 Chrome/CDP 验证保存未跟踪证据：

- `.codex/validation/ix04/lobby-rtl-390x844.png`
- `.codex/validation/ix04/table-rtl-390x844.png`
- `.codex/validation/ix04/undo-1440x900.png`
- `.codex/validation/ix04/undo-1280x720.png`
- `.codex/validation/ix04/undo-390x844.png`

真实页面断言包括：

- 空大厅只有一个首屏 quick-match 主动作，朋友/身份/社区/战绩默认不挂载。
- 空状态同时存在 Match、Create room、AI 三个可执行按钮。
- 点击一次 Find match 进入单人 waiting；任务栏 Cancel waiting 可清除 room URL 并回到大厅。
- 手动朋友加入只需展开朋友区、输入一次房间码、提交一次。
- waiting 空座桌位于 joinable 组；playing 桌位于 watchable 组。
- 390×844 `/ar` 中大厅顺序为主动作 -> 朋友 -> 房间列表 -> 次级入口，关键触摸目标不小于 44px，document 无横向溢出。

人工检查确认移动大厅的快速匹配和朋友入口在房间列表之前，身份编辑不再占据默认首屏；现有牌桌布局未被大厅样式回归。

应用内 Browser 仍受当前任务标签会话附着故障影响；本阶段没有冒充该通道成功，交互、几何和截图继续使用隔离系统 Chrome/CDP。

## 失败驱动修正

1. 首次 share-url 回归仍按旧 UI 文本查找 `Leave`；单人等待现在按设计显示 `Cancel waiting`。测试改为使用稳定 `data-table-action` 并接受 cancel-wait/leave 两个合法等待退出态，随后全流程通过。
2. 原 lobby UI smoke 只从列表加入，不能证明朋友手动路径。最终改为先验证 waiting 房属于 joinable 组，再真实展开朋友区、输入房间码并提交一次。
3. 为防止服务端残留房影响空大厅断言，最终浏览器验收使用单一干净 3050 生产进程，先验证空状态和随机匹配取消，再动态创建 Join/Watch 测试桌。

## 协议与产品边界

- 当前创建房仍是 public，并继续出现在大厅；本阶段没有 visibility、invite token 或访问授权。
- 房间码仍是唯一规范键；输入仍只支持现有房间码，统一 URL/handle/account-ID 解析属于 IX-04A。
- 当前只使用已加载的房间明细，没有把 20 条列表或 Presence 样本宣传为全站统计；精确汇总属于 IX-07。
- 单人等待房没有记录来自快速匹配还是朋友创建，因此统一使用“取消等待”，不武断显示“取消匹配”。
- 对局中模式切换保护、双方再战、完整回放、比赛配置和挑战均未在本阶段实现。
- 当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收。

下一步进入 `IX-04B`，独立实现服务端执行的 public/unlisted 可见性；不通过前端隐藏伪装私密房。
