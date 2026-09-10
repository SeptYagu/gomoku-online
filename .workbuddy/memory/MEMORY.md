# gomoku-online 项目长期备忘

## 测试环境（Windows 本机）
- **vitest 必须在大写盘符目录下运行**：cwd 为 `d:/...`（小写）时 vitest 4.1.9 所有测试报 `Cannot read properties of undefined (reading 'config')`（vitest#10692）。先 `cd "D:/OneDrive/AiPrograms/gomoku-online"` 再 `npx vitest run`。
- `npx tsc --noEmit` 基线遗留 8 条错误（game-record-export.test.ts / game-record-opening-analysis.test.ts 的 `visibility`、room-socket.test.ts 测试 helper 的 unknown 参数类型），均在与业务无关的测试文件里；跑 tsc 对比时以"是否新增"为准。
- `npx tsc` / `eslint` 单次约 3~10 分钟，建议 run_in_background。
- **sandbox 限制（agent 环境）**：本机端口 curl 恒 000（127.0.0.1:3000/3030/3210 全失败）、`npm run dev`（next dev）起不来、`npm run build` 被工作机 safe-delete 批量删除保护拦在 `.next/trace`（SAFE_DELETE_BULK_CONFIRM_REQUIRED）。**不要在 agent 里指望跑真实浏览器冒烟**，只能靠 vitest + tsc + eslint，浏览器验证交给人工。
- **一次消息里对同一文件发多个 Edit 会静默丢改动**（实测 3 个 Edit 只落地 1 个，且都报 success）。改同一文件必须一条一条来，改完用 grep 复核。

## 项目约定
- 每次开任务先 `git pull --ff-only`；单人项目直接提交 main，阶段完成即 commit + push。
- **useSyncExternalStore 的 getSnapshot 必须自带缓存**：若 getSnapshot 每次渲染重读 URL/storage（如 `new URLSearchParams(location.search).has(...)`），它就不是「启动快照」而是活值——React 19 在非水合路径每次都重读并比较 `hook.memoizedState`，值一变立即以新值渲染；而本仓有 `history.replaceState`（syncRoomUrl/clearRoomUrl）在订阅之外改 URL，会造成静默状态跳变。参考 `client-boot-state.ts` 与 `useFriendRoom.ts` 的 `boot*Cache ??=` 写法，新增快照一律照抄。
- **socket.io 普通 ack 断线即丢**：不加 `.timeout()` 的 `emit(ev, payload, cb)`，在断线/服务端重启时 cb 不会被调用（socket.io-client 4.8 `_clearAcks` 只回调 withError 的 ack）。任何「emit 前置 ref 闸门」都配看门狗，实现见 `src/components/chat-send-gate.ts`（`createChatSendGate`：同步判重入 + 8s 超时复位）。
- **eslint 禁止 effect 内同步 setState**（`react-hooks/set-state-in-effect` 为 error）。首屏要读 URL/localStorage/sessionStorage 时，统一用「覆盖值 ?? 启动快照」：`useState<T|null>(null)` 存程序显式设置的值，未设置时回落到 `useSyncExternalStore` 提供的启动快照（服务端快照=固定默认值）。参考 `src/components/client-boot-state.ts`、`useFriendRoom` 的 `accountStatus/playerName/joinTarget/isJoiningRoom`、`GameShell` 的 `mode`。
- 代码评审报告在 docs/code-review-2026-09-10.md 与 docs/code-review-2026-09-10-followup.md（两份都含滚动修复进展表）。已完成：M1+M2（7be68a2）、M3（d69d0bd）、M4/M5/m6/m7（f30e273）、复审 R1+R2（e14ec7e）、R3/R4/R5+R7（5056016，Codex 修的，已做变异复核 87b457d）。未完成：R8 连接/加入失败文案仍是英文（`useFriendRoom.ts:464`、`:516`、`formatConnectionError()` :1700-1707，同样渲染进 `room-error`）、R9 超时后「服务端已离开、客户端仍认为在房间」（R4 忽略迟到 ack 的取舍，重试会自愈）、R6 部分保留（boot mode 已实例化闭包，四个 `boot*Cache` 仍模块级）；以及 M6 持久化无界增长、M7 XFF 可伪造绕过限流（**需先确认线上是否部署在可信反向代理之后，否则改默认值会误伤现有限流**）、m10/m11。
- **核实「已修复」的手法**：本仓无 jsdom / testing-library，hook 层测不了，用「单模块变异复核」——临时把修复改回坏的样子、只跑对应单测、再 `git checkout --` 还原（`;` 串联保证无条件还原）；坏代码上仍全绿的断言即空转断言。变异脚本放临时目录且用完即删（**`.tmp/` 并未被 .gitignore 覆盖**，只匹配了里面的 `*.log`）。详见用户级技能 `verify-claimed-fix`。
- RoomStore 语义（改前先懂）：waiting/ready 玩家断线=直接移除；playing 玩家断线=标记 connected=false + disconnectDeadline（60s），到期未回→对手判胜（对方在线）或整房 abandon（全员掉线）。
- 版本库约定：**`.workbuddy/memory/` 已纳入版本库**（`.gitignore` 用 `.workbuddy/*` + `!.workbuddy/memory/` 放行，父目录不排除才能反向放行子目录），项目记忆随仓库跨机器同步，改动后照常提交推送；`.codex/`（1.9M 证据截图，HANDOFF 明写不进库）、`.codex-remote-attachments/`、`tsconfig.tsbuildinfo`、`.arena-cache|results/`、`.research/`、`data/accounts|game-records`、`*.apk`、日志仍忽略。`docs/HANDOFF.md` 的 IX-07 步骤 1 记录已提交（f753020）。
