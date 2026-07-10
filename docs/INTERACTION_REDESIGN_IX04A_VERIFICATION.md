# IX-04A 统一加入标识与公开 handle 验证

验证日期：2026-07-10

结论：通过。注册账户现在拥有当前 AccountStore 内唯一、不可变的 `publicHandle`；朋友区同一输入框可接受本站邀请 URL、裸房间码、`@publicHandle` 和原始 `acct_...`，服务端原子解析后仍只以权威 `snapshot.code` 驱动 URL、session、socket room 和后续桌内动作。

## 账户模型与迁移

- `AccountSnapshot`、session 和 JSONL `StoredAccount` 新增 `publicHandle`；注册可一次性提交自选值，省略时由展示名生成。
- handle 规范为 3–20 位 ASCII 小写，首尾必须为字母或数字，中间允许 `_` / `-`；拒绝保留词。查找大小写无关，`displayName` 仍只负责展示。
- AccountStore 维护 handle -> playerId 唯一索引；重复 handle 返回 409，非法 handle 返回 400。
- 旧 JSONL 账户缺少 handle 时，以 displayName 和账户 ID 确定性补齐；冲突追加稳定后缀，极端兜底使用账户 ID 哈希而不是时间值，重复加载结果一致。
- token 身份解析只采用服务端账户记录中的 handle；游客和客户端 payload 不能伪造 registered handle。

## 显式房主目标

- RoomStore 维护 `hostAccountId -> roomCode` 和反向索引，不在查询时扫描 rooms，也不依据更新时间猜测目标。
- public 房默认允许别名目标；unlisted 默认关闭。直接规范 roomCode / 同源邀请 URL 仍能加入 unlisted，handle/account ID 不能旁路发现。
- 只有当前 hostSeat 对应的已注册、在线玩家可建立目标。房主转移、离开、删除、过期、对局中断线和恢复都会同步清除或重绑。
- 同一账户显式创建新 public 房会把目标原子重绑到新房；旧房普通状态变化不能抢回。finished 房在保留窗口内继续解析，加入者按既有规则成为 spectator。
- `RoomSnapshot` 只公开可解析 public 房主的 `hostPublicHandle`，不公开内部 playerId；Room info 据权威 snapshot 显示 Host handle。

## 统一协议与安全边界

| 输入 | 处理 |
| --- | --- |
| 同源 `http(s)://.../?room=ABC123` | 校验 socket Origin/Host，提取 room 参数 |
| 裸 roomCode | 仅此分支转大写 |
| `@handle` | 大小写无关查账户，再查显式房主目标 |
| 原始 `acct_...` | 保留原值和大小写，精确查账户与显式目标 |

- 新增向后兼容的 `room:join-target`；旧 `room:join` 继续用于可信房间列表、自动邀请和 session 恢复路径。
- 不存在账户、没有当前目标、策略关闭、跨域 URL 和别名限流都统一返回 `room-not-found` / `No joinable room was found`，不暴露账户是否存在或在线。
- handle/account-ID 查询按来源地址限制为 20 次/分钟；只有远端为本机 loopback 反向代理时才信任 `X-Forwarded-For`，直连客户端不能伪造 header 绕过窗口。
- 当前账户唯一索引、房主索引和限流都在单进程内存/JSONL边界内；多实例上线前需要共享账户唯一约束、共享目标索引和共享限流，不能宣称全站唯一可用。

## 客户端与浏览器结果

- controller 将 `joinCode` / `setJoinCode` 全量改为 `joinTarget` / `setJoinTarget`，移除整体大写和 8 字符限制；朋友输入允许 256 字符并只提交一次。
- 注册区新增可选 public handle；注册成功后只显示不可变 `@handle`。六语种新增统一目标、public handle 和 Host handle 文案。
- 最终生产构建上的 `smoke:share-url` 依次用小写 roomCode、同源 URL、混合大小写 `@handle` 和原始混合大小写 account ID 加入同一房间；四次离房后 URL 和保留输入均收敛到同一规范 roomCode。
- `smoke:lobby-ui` 继续通过快速匹配、朋友加入、Join/Watch、大厅/牌桌互斥、1440×900、1280×720、390×844 和阿拉伯语 RTL 回归。

系统 Chrome/CDP 保存未跟踪证据：

- `.codex/validation/ix04a/public-handle-registration.png`
- `.codex/validation/ix04a/public-host-handle.png`
- `.codex/validation/ix04a/unlisted-friend-entry.png`
- `.codex/validation/ix04a/unlisted-room-info.png`

人工确认注册后 handle 输入消失并显示 `@handle`；public Room info 显示 Host handle；unlisted 仍只显示 Visibility，不显示或解析房主别名。应用内 Browser 受当前任务标签附着故障影响，交互和截图使用隔离系统 Chrome/CDP，没有冒充应用内通道成功。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 15 个测试文件、156 个测试通过 |
| 账户 / RoomStore / socket 定向测试 | 3 个文件、65 个测试通过 |
| `npm run build` | 通过；编译、TypeScript 和 11 个页面生成成功 |
| `npm audit --omit=dev` | 通过，0 个漏洞 |
| 浏览器 smoke | `share-url`、`lobby-ui` 通过 |
| 核心协议 smoke | lobby、matchmaking、online-room、room-lifecycle、公共/房间聊天、Presence、账户、记录、Profile 和排行榜均通过 |
| `git diff --check` | 通过 |

第一次浏览器扩展流程因两个标签共享同一注册账户 token，被服务端正确拒绝同一账户再次加入自己的房间；测试改为注册截图后 Sign out，再以两个真实独立身份验证邀请。两次账户相关 smoke 曾因同一测试进程一分钟内完成过多注册收到 429；均通过重启测试进程清空内存窗口后单独复跑，产品注册限流没有放宽。

## 未实现边界与下一步

- publicHandle 当前不可编辑；没有邮箱/密码/OAuth、找回或 handle 变更流程。
- unlisted 仍不是高熵邀请授权；它不公开列出，但任何知道 roomCode/URL 的人仍可加入。
- 多实例共享唯一索引、共享 host target 和分布式限流未实现。
- 双方再战、局中安全切换、完整复盘、精确 activity summary、比赛配置、挑战和赛事均未混入本阶段。
- 当前执行环境未开放子代理派发，本报告由主控执行，不声称为独立子代理验收。

后续状态（2026-07-10）：`IX-06A` 已完成，房主单方面 restart 已从新 UI 移除，双方分别表达意愿且都在线后才创建下一局。详见 `docs/INTERACTION_REDESIGN_IX06A_VERIFICATION.md`。下一步进入 `IX-05`。
