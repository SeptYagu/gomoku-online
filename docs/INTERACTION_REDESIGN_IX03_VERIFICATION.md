# IX-03 桌边栏与移动端优先级验证

验证日期：2026-07-10

结论：通过。在线牌桌已从“房间面板堆在棋盘前”改为桌面右侧桌边栏；移动端主路径固定为任务、棋盘、动作、玩家、折叠次要信息，三目标视口和阿拉伯语 RTL 均通过真实 Chrome 验证。

## 实现范围

- `TableSidebar`：在线牌桌接管原 280–320px 通用状态/广告右栏，双方玩家和连接状态置顶。
- `TableSidebarTabs`：房间聊天、当前局最近 20 手、房间信息三个页签；Room info 保留复制邀请入口。
- `TableRoomChat`：从 `GameTableView` 提取房内聊天，不改变消息事件和限制。
- `GameTableView`：主区只保留 `TableTaskBar -> GomokuBoard -> TableActionBar`。
- `table-shell` 样式：桌面 sticky sidebar 和剩余视口棋盘约束；移动端紧凑顶部、单列顺序、44px 关键触摸目标和 RTL 无方向假设。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过；新增 `.codex/**` 全局 ignore，防止本地 Chrome profile 第三方脚本污染项目门禁 |
| `npm test` | 15 个测试文件、144 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| `smoke:lobby-ui` | 通过；sidebar 三页签、三目标视口、1280×720 可落子、390×844 `/ar` RTL 顺序、触摸目标和无根级横向溢出 |
| `smoke:online-room` | 通过；三局、观战、悔棋、认输和重开未回归 |
| `smoke:room-chat` | 通过；玩家/观战聊天与限制未回归 |
| `smoke:share-url` | 更新旧 UI 断言后隔离重跑通过；邀请直达、Room info 复制邀请、离房清 URL、空房关闭、注册身份恢复均通过 |

share-url 的旧 smoke 曾要求正文直接出现 `Your seat` / `{name} is in the room.`，并假定 Copy invite 永远在主区。IX-03 将这些内容移到 sidebar 后，测试改为等待稳定的 `data-online-view="table"`，再通过 `data-table-sidebar-tab="info"` 打开 Room info；产品协议未改变。

## 浏览器与截图

系统 Chrome/CDP 验证并保存未跟踪截图：

- `.codex/validation/ix03/undo-1440x900.png`
- `.codex/validation/ix03/undo-1280x720.png`
- `.codex/validation/ix03/undo-390x844.png`
- `.codex/validation/ix03/table-rtl-390x844.png`

最终人工检查确认：

- 1440×900：任务栏、棋盘、双方玩家和决策动作首屏可见，sidebar 无广告。
- 1280×720：scrollY=0 时存在可见可点击棋盘点，任务、棋盘和动作栏均在视口内。
- 390×844：顶部紧凑，任务和棋盘先于玩家/sidebar；聊天和排行榜不在棋盘前。
- `/ar`：`dir=rtl`，任务 -> 棋盘 -> Leave -> 玩家顺序不反转，三个 tab 目标合格且 document 无横向溢出。

应用内 Browser 在本轮目标开始时仍受标签会话附着故障影响，因此没有冒充该通道成功；交互、几何和截图继续使用项目既有隔离系统 Chrome/CDP。

## 失败驱动修正

1. 首次 1280×720 中 action bar 底部超出约 15px；棋盘上限从 `100vh - 250px` 收紧到 `100vh - 270px`，保持更严格首屏目标。
2. 首次 `/ar` 根页面横向溢出；诊断显示 table game-stage 隐式 grid 列被长文本 min-content 撑宽，改为 `minmax(0, 1fr)` 并约束顶部 flex 子项。
3. 截图发现桌边聊天 40px 列容纳 44px 按钮产生内部横向滚动，改为 44px 列和仅纵向 panel overflow；移动 top-actions 改为不换行。
4. 构建两次遇到 OneDrive `.next` EPERM；核对无本仓库服务进程、验证目标绝对路径后只清理工作区 `.next`，重建通过。
5. 清理了本轮多次 PTY 启停遗留的、命令行明确指向本仓库 `online-server.ts` 的子进程，再用单一干净 3050 服务完成最终回归。

## 边界与下一步

- Move history 仅是当前 snapshot 摘要，不提供复盘控制或跨局读取；完整能力仍在 IX-06。
- 对局中 Leave 确认仍在 IX-05；双方再战仍在 IX-06A。
- 移动语言列表采用组件内部横向滚动以保留六语言直接可达，不构成 document 横向溢出。
- 当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收。

下一步进入 `IX-04`，只简化在线大厅入口和低活跃降级。
