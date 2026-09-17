# WorkBuddy 独立代码审查 Round 2 复查 — 对局持久化/语言切换/外观保持（实现交付）

> 特性限定命名说明：`2026-09-16-workbuddy-code-review-game-persistence-round2-handoff.md` 已被方案阶段 Round 2 审查占用，为避免覆盖历史归档，本文档沿用实现审查线特性限定名（`persistence-impl`）。

---

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`8ed958f`（工作区干净，`git pull --ff-only` 后 HEAD 与待审提交一致）
- **基准提交**：`9763c09`；实际审查范围：`git diff 9763c09..8ed958f`（21 文件，+1357/−120），其中 Round 1 修复增量为 `git diff 1ff7501..8ed958f`（源码 4 文件）
- **通过项（极简）**：Round 1 两项缺陷经真机 CDP（生产构建 + `online-server.ts`，探针置于仓库外）确认 100% 闭环——P1-1（F5 恢复）：本地 3 手局刷新后 3 子/轮次白/续落第 4 手入库、人机 4 子局刷新后完整恢复且 AI 参数（seed/先手/难度）零漂移、已完局刷新后 9 子与 5 子胜负线及 "Black wins" 状态保留；P2-1（重复搜索）：常规进 AI 每手 `postMessage` 恰 1 次/`terminate` 0 次、刷新后首手恰 1 次/0 次、思考中刷新自愈握手恰 1 次并正确落子。独立设计 9 项边界/负向验证，1 项构造出缺陷反例（见下）。门禁未重复机械重跑（协议豁免）；`npm run build` 为验证目的重跑通过；`verify:online` 远端 ws 失败经本地 ws 握手实测排除产品因素（环境网络限制）。

---

## 二、审查发现与缺陷清单

### P2-1（Round 2 新增，修复引入）：恢复 layout effect 缺少模式匹配守卫，`?room=` 整页加载会把存量 AI 对局幽灵恢复进联机模式并触发幽灵 AI 搜索

- **严重级别**：P2
- **文件与行号**：`src/components/GameShell.tsx:127-171`（新增的水合恢复 `useIsomorphicLayoutEffect`，守卫缺失点在 `:132`）；对照 `GameShell.tsx:60-61`（`initialSnapshot` memo 显式要求 `bootActiveGame.mode === bootMode`）；关联 `src/components/client-boot-state.ts:86-104`（`resolveBootGameMode` 优先级 1：URL `?room=` 强制 `bootMode="room"`，但 `useBootActiveGame` 仍返回存量对局）；`src/components/hooks/useAiGame.ts:257-311`（`commitAiTurn` 无 mode 守卫）。
- **触发条件**：同一标签页存在活跃对局（`gomoku-active-game` 有棋谱），随后**整页加载**携带 `?room=` 的邀请链接 URL（或在该 URL 上刷新）。`bootActiveGame.mode !== bootMode`（如 ai 对局 + room URL）即触发。
- **实际行为**：`:132` 的恢复分支只检查 `moves.length > 0`，不检查 `bootActiveGame.mode === bootMode`（与 `:61` 的 `initialSnapshot` 守卫不一致）。room 模式下把 AI 对局棋面/棋谱同步进组件状态；且当恢复局面恰轮到 AI 时（`:150`）调用 `aiGame.commitAiTurn` —— 真实 worker 搜索启动、`isAiThinking=true`，AI 落子经 `onCommitGameState` 写入 room 模式的隐藏状态（因 `mode==="room"` 不落盘，存储幸免）。实测探针（S4）：整页加载 `/en?room=PHNTOM` + 存量 1 手 AI 局（AI 执白待落）→ 加载后 400ms 内 `postMessage=1`、`terminate=0`，模式徽标为 `room`，存储保持 1 手未损。
- **期望行为**：验收标准 5「在线与本地生命周期隔离」——room 启动参数下不应消费单机活跃对局，`postMessage` 应为 0 次；恢复只应发生在 `bootActiveGame.mode === bootMode` 的模式匹配场景。
- **根因**：修复 P1-1 时把恢复路径从带模式守卫的 `useState` 惰性初始化器（`initialSnapshot` memo）迁移到 layout effect，新路径**遗漏了原有的模式匹配条件**；两处守卫口径分裂。`useAiGame.commitAiTurn` 亦无 mode 防御，幽灵调用直达 worker 层。
- **影响范围**：① 幽灵 AI 搜索浪费计算（局面越深、难度越高代价越大，insane 最长 30s）；② 搜索期间 `isAiThinking=true` → `isModeSwitchLocked`（`GameShell.tsx:447-448`）将三个模式切换按钮全部禁用，用户在联机大厅被锁至搜索结束；③ room 模式下 `board/moves/status` 被存量对局污染（`local` 存量变体经 S4b 实测无搜索但仍污染状态，进而影响 `handleModeChange` 的 `localMoveCount` 决策输入）；④ 违背验收标准 5。当前已部署的远端生产（版本 `8ed958f`）同样携带该缺陷。
- **复现方法/验证证据**（CDP，生产构建，探针脚本置于仓库外 `%TEMP%`）：
  1. `/en` 正常游玩制造 1 手 AI 局（或直接以 `Runtime.evaluate` 写入合法 `gomoku-active-game`：1 手黑棋、`firstPlayer:"human"`、AI 执白待落）；
  2. `Page.navigate` 至 `/en?room=PHNTOM`（整页加载，`__probeLoads` 递增）；
  3. 读探针计数：`post=1, term=0`，`document.querySelector(".mode-pill.active").dataset.gameMode === "room"`；
  4. 对照组 S4b（存量 local 局 + 同 URL）：`post=0`（local 恢复无搜索路径，仅状态污染）——证明缺陷聚焦 AI 恢复分支的 `commitAiTurn` 调用。
- **修复建议**：在 `GameShell.tsx:132` 恢复分支补齐与 `:61` 一致的模式守卫（`bootActiveGame.mode === bootMode`，即 room URL 下跳过恢复），或在守卫后显式排除 `bootMode === "room"`；同时在 `useAiGame.commitAiTurn` 入口增加 `mode !== "ai"` 早退作为纵深防御。注意保持 `hasRestoredBootRef`/`bootMovesBaselineRef`/`hasHealedRef` 三 ref 的置位语义在「不恢复」分支仍然成立（不恢复时也应置位，防止兜底握手 effect 在 room 模式误触发）。
- **修复后验收标准**：CDP 复验——① 存量 AI 局（AI 待落）+ `?room=` 整页加载：`postMessage=0`、模式徽标 `room`、存储完整、加载后 1s 内模式切换按钮可用；② 存量 local 局 + `?room=` 同场景无任何 AI 搜索且 `moves` 状态保持空；③ 正常刷新恢复路径（无 `?room=`）S1/S2b/S3/S6 全组回归通过；④ 单测为 `resolveBootGameMode` 与恢复守卫口径补齐「URL room + 存量对局」用例。

---

## 三、待确认风险与未验证项

1. **水合/挂载集成时序仍无自动化测试**：`client-boot-state.test.ts` 12 项与 `game-persistence.test.ts` 均为纯函数层，本轮 P1-1/P2-1 的闭环证据依赖人工 CDP 探针（不可进门禁）。本缺陷（P2-1/R2）正是纯函数单测无法捕获的集成缺口再现。建议以浏览器级测试或最少一条 CDP 冒烟脚本固化「刷新恢复 + 恰一次搜索」语义，防止下一轮回归。
2. **`verify:online` 的 websocket 通道在本审查环境不可达**：远端 `gomoku.yagu.ddns-ip.net`（已部署 `8ed958f`）polling 握手正常但 ws 升级失败；经本地生产服务实测 ws 握手 `open`，判定为审查环境网络限制而非产品回归。残余风险：远端 ws 通道健康度需在正常网络环境下复跑确认。

---

## 四、推荐修复顺序与复审验收标准

1. 仅一项 P2，按缺陷项「修复建议」一次修复即可（恢复守卫 + commitAiTurn 纵深防御 + 不恢复分支的 ref 置位语义），无需分批。
2. 复审验收：上述「修复后验收标准」①~④ 逐条通过；四道本地门禁全绿；`npm run verify:online` 在可用网络环境下通过。
3. 复审时审查方将重跑 S4/S4b 反例探针与 S1/S2b/S3/S5b/S6 回归组（脚本已留存于审查环境）。
