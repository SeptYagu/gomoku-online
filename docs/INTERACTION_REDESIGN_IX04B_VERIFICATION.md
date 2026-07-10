# IX-04B 非公开列出房与邀请边界验证

验证日期：2026-07-10

结论：通过。`public | unlisted` 已成为服务端权威房间属性；unlisted 房不会通过公开列表、lobby 增量/删除事件或 Presence roomCode 被发现，但规范房间码和现有邀请 URL 仍可直接加入。产品文案明确说明这不是访问授权保护。

## 权威模型与兼容性

- `RoomVisibility = "public" | "unlisted"` 进入 `CreateRoomInput`、内部 `RoomState`、`RoomSnapshot` 和 `RoomListItem`。
- 旧 `room:create` 调用省略 visibility 时继续默认为 public；未知值由 RoomStore 返回 `invalid-room-visibility`。
- `matchmaking:find` 只搜索 public waiting 房，没有候选时显式创建 public。
- `room:join`、`room:rejoin`、stored session、`?room=CODE` 和后续桌内动作继续使用规范 roomCode，不新增另一个房间主键。
- 同一连接重复创建只有在当前 disposable waiting 房 visibility 相同时才复用；切换类型会释放旧房并创建新房。

## 服务端发现面

| 发现面 | unlisted 行为 |
| --- | --- |
| `GET /api/rooms` / `lobby:join` / `lobby:list` | RoomStore 过滤，不返回明细 |
| `lobby:room-updated` | 不广播 unlisted create/update |
| `lobby:room-deleted` | 使用删除前 snapshot visibility，仅 public 广播；不泄漏 unlisted code |
| Presence REST/socket | 保留 online/in_room/playing/spectating 状态，但 `roomCode = null` |
| Profile / 排行榜 | unlisted 权威记录内部保留，但不进入公开 recent records 或排名计算，不返回 roomCode/gameId |
| lobby version | unlisted create/update/delete 不推进公共版本 |
| roomCode / 邀请 URL | 仍可加入；这证明 unlisted 是发现边界，不是访问控制 |

清理与生命周期结果新增 `deletedSnapshots`，同时保留原 `deletedRoomCodes` 兼容字段，使删除后仍能依据权威 visibility 决定是否发送公共 deletion。终局权威记录同样保存 visibility；旧 JSONL 记录无字段时按 public 迁移。

## 客户端与文案

- “和朋友玩”和空大厅创建出口显式发送 `visibility: "unlisted"`，按钮为 Create unlisted room。
- 说明文案明确：房间不出现在大厅；任何知道房间码或链接的人仍能加入；这不是访问保护。
- Table Room info 新增 Visibility，直接显示权威 snapshot 的 Public/Unlisted。
- 快速匹配仍创建 public，公开大厅的 Join/Watch 行为不变。
- 六语种均新增 create-unlisted、Visibility、Public、Unlisted 和边界说明。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、149 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| records / RoomStore / socket 定向测试 | 62 个通过；覆盖默认 public、非法值、列表/Presence/version/公开记录隔离、直接加入、匹配忽略、增量/删除不泄漏和 visibility 切换不复用 |
| `smoke:share-url` | 通过；UI 创建 unlisted、REST 不可见、Room info 标记、邀请直达、复制、清 URL 和注册身份恢复 |
| `smoke:lobby-ui` | 通过；IX-04 主路径、手动按码、Join/Watch、三视口与 RTL 未回归 |
| 核心协议 smoke | `lobby`、`matchmaking`、`online-room`、`room-lifecycle`、Presence、公共/房间聊天、账户、记录和排行榜均通过 |

## 浏览器与截图

系统 Chrome/CDP 保存未跟踪证据：

- `.codex/validation/ix04b/unlisted-friend-entry.png`
- `.codex/validation/ix04b/unlisted-room-info.png`
- `.codex/validation/ix04b/lobby-rtl-390x844.png`
- `.codex/validation/ix04b/table-rtl-390x844.png`
- `.codex/validation/ix04b/undo-1440x900.png`
- `.codex/validation/ix04b/undo-1280x720.png`
- `.codex/validation/ix04b/undo-390x844.png`

首次两张 unlisted 截图虽然生成成功，但朋友说明被视口底部截断，移动下排的 Room info 没有入镜。没有把它们计为合格证据；截图前增加目标元素 `scrollIntoView` 后重拍并人工确认：

- 朋友区完整显示“not access protection”，没有 private/protected 承诺。
- Room info 明确显示规范 roomCode 和 `Visibility: Unlisted`。

应用内 Browser 仍受当前任务标签会话附着故障影响；没有冒充该通道成功，交互和截图使用隔离系统 Chrome/CDP。

## 未实现边界

- unlisted 不是高熵 invite token，不校验邀请接收者，不支持撤销/轮换，因此不能命名为 private 或 invite-protected。内部管理员导出仍可包含 unlisted 权威记录，不属于公开发现接口。
- IX-04A 尚未实现，`@handle` / 原始 account ID 没有解析入口；这两种标识无法旁路加入 unlisted 房。
- public handle 唯一索引、显式 hostAccountId -> roomCode 目标和查询限流均属于下一阶段。
- 精确大厅汇总、对局中模式保护、双方再战、完整复盘、比赛配置、挑战和赛事仍未实现。
- 当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收。

下一步进入 `IX-04A`，实现统一加入标识与公开 handle，同时保持 unlisted 默认关闭房主别名发现。
