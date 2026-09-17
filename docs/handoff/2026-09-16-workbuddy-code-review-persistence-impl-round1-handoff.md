# WorkBuddy 独立代码审查 Round 1 — 对局持久化/语言切换/外观保持（实现交付）

> 特性限定命名说明：`2026-09-16-workbuddy-code-review-round1-handoff.md` 已被本日方案阶段 Round 1 审查占用，为避免覆盖历史归档，本文档采用特性限定名。

---

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`1ff7501`（工作区干净，`git pull --ff-only` 后 HEAD 与待审提交一致）
- **基准提交**：`9763c09`；实际审查范围：`git diff 9763c09..1ff7501`，19 文件（+1035/-120）
- **通过项**：需求实现无遗漏——路由参数保持（`computeLocaleSwitchHref` + `LocaleSwitcher` href 预计算）、主题零闪（161 帧采样 0 缺失帧/0 翻白帧）、四级启动优先级（大厅 0 手与人机 0 手刷新/切语言均不跌落 local）、邀请链接 `?room=` 刷新保持均经真机 CDP（生产构建 + `online-server.ts`）逐项验证通过；在线对局中切语言 URL/视图/Socket 会话完整存活且服务端后续推送可达（`/fr?room=<code>`，table 视图，主机续落子客机棋盘 +1）。本地门禁四道全绿。独立设计 12 项负向/边界验证，其中 2 项成功构造缺陷反例（见下）。

---

## 二、审查发现与缺陷清单

### P1-1 硬刷新（F5）后本地/人机活跃对局恢复静默失效，后续交互以新对局覆盖存储

- **严重级别**：P1
- **文件与行号**：`src/components/GameShell.tsx:50-80`（`useBootActiveGame`/`useBootGameMode` 结果被 `useState` 惰性初始化器消费）；`src/components/client-boot-state.ts:23-38`（`useBootSnapshot` 经 `useSyncExternalStore` 在水合首轮返回 `serverSnapshot`）
- **触发条件**：在 local 或 ai 对局进行中（sessionStorage 已存棋谱）执行硬刷新（浏览器刷新 / `Page.reload`）。
- **实际行为**：棋盘从 0 子重新开始；`gomoku-active-game` 中棋谱完好但从未被消费（刷新后 2.5s+ 仍 0 子）。用户随后首次落子即以全新对局覆盖存储（moveNumber 从 1 重计、AI 场景 `openingSeed` 重新生成），已保存对局被永久静默丢弃。`bootMode` 本身恢复正常（mode 徽标正确显示 local/ai），仅棋面/棋谱/轮次状态未恢复。
- **期望行为**：验收标准 3——本地与人机对局在刷新后基于 sessionStorage 完整恢复（棋子、轮次、胜负线、AI 参数）。
- **根因**：SSR 水合首轮 `useSyncExternalStore` 返回 `getServerSnapshot()`（`null`/默认值），`GameShell` 的 `useState<Board>(() => initialSnapshot.board)` 等惰性初始化器在该轮即以空快照落定；水合完成后 `bootActiveGame` 更新、`initialSnapshot` useMemo 重算，但 `useState` 初始值不会重新采纳，恢复数据被静默丢弃。**对称性证据**：软导航（切语言）重挂载无水合期，首轮即取 client snapshot，故同一条 `initialSnapshot` 恢复链在切语言路径完整生效（含胜负线与状态翻译）——软/硬路径行为分裂正是该根因的直接证据。
- **影响范围**：所有 local/ai 对局玩家的刷新场景（验收标准 3 的"刷新"半边完全失效）；用户数据丢失（保存的棋局被覆盖）。
- **复现方法/运行证据**（CDP，生产构建 `NODE_ENV=production` + `online-server.ts`，探针脚本位于仓库外）：
  1. local 局 3 手 → `Page.reload`（`performance.navigation.type=reload`，`__probeLoads` 1→2）→ 棋盘 0 子，storage 仍为 3 手完整棋谱；
  2. ai 局 2 手（difficulty=normal, firstPlayer=human, openingSeed=1014370461）→ reload → 0 子，storage 原样；点击空点 → 全新开局（openingSeed=3631876348，moveNumber 重计）覆盖 storage；
  3. 同一 ai 局改走切语言软导航 → 2 子完整恢复（对照组，证明软/硬路径分裂）。
- **修复建议**：在水合完成后一次性采纳恢复快照——例如以 layout effect + ref 守卫（`board` 处于本会话未交互的初始态时）将 `bootActiveGame` 重放的棋面/棋谱/状态/下一手一次性 commit 进状态，并在该路径按需置位自愈握手；注意该采纳必须先于 AI 自愈握手 effect 执行，且不得破坏软导航路径（现状已正确）。
- **修复后验收标准**：CDP 复验——① local 3 手 F5 后 3 子恢复、轮次正确、续落子 moveNumber=4；② ai 2 手 F5 后棋子/AI 难度/先手/openingSeed 完整恢复且 AI 参数未漂移；③ 带胜负线的已完局 F5 后胜负线与终局状态保留；④ 切语言软导航路径与在线房间场景无回归。

### P2-1 boot 进入 AI 模式后的首次人类落子触发重复 AI 搜索请求（自愈握手误触发）

- **严重级别**：P2
- **文件与行号**：`src/components/GameShell.tsx:129-140`（自愈握手 effect）；`GameShell.tsx:88`（`hasHealedRef`）；`GameShell.tsx:179`（`hasHealedRef` 仅由 `completeModeChange` 置位）；`GameShell.tsx:346-349`（点击路径已调用 `commitAiTurn`）
- **触发条件**：刷新后（或任何 boot 路径）恢复为 ai 模式且轮到人类先手时，人类落第一子。
- **实际行为**：点击路径发出搜索请求 #1（`postMessage`×1）；落子引起 `moves`/`nextPlayer` 变化，自愈握手 effect 重跑——此时 `hasHealedRef.current` 仍为 `false`（boot 恢复路径从不经过 `completeModeChange`）、`nextPlayer === aiStone` 成立——误判为"恢复残留局面需自愈"，追加请求 #2 并 terminate #1、重建 worker。真机探针实测一次落子窗口 `post=2, terminate=1, ctor=2`；对照组（经模式徽标正常进入 AI，`completeModeChange` 已置位 healed）为 `post=1, terminate=0, ctor=0`。
- **期望行为**：一次人类落子恰好一次 AI 搜索；自愈握手仅在"恢复的静态局面恰轮到 AI"时触发一次。
- **根因**：`hasHealedRef` 的置位点不完整——boot 恢复进 AI 模式的会话没有任何路径将其置位，握手 effect 无法区分"boot 恢复的静态局面"与"本会话新产生的着法"。
- **影响范围**：每次刷新/切语言后进入 AI 对局的首手都产生双倍搜索计算（insane 难度下代价显著）与 worker 重建 churn；实测因请求 #2 的取消逻辑未产生错误落子，但该契约违背验收标准 3 中"AI 恢复首帧注入与思考中刷新自愈握手"的语义（应恢复时一次、非恢复时零次）。
- **复现方法/运行证据**：同上 CDP 环境，`Worker.prototype.postMessage/terminate` 与构造器探针：D1（刷新→AI 0 手→首手）与 D2（切语言恢复 AI 局→首手）均为 post2/term1/ctor2；D3（对照组正常进入）为 post1/term0/ctor0。
- **修复建议**：为 boot 恢复路径补齐 `hasHealedRef` 语义——例如记录恢复时棋谱基线（恢复局面的 moveNumber/长度），握手 effect 仅在"未 healed 且当前着法数等于恢复基线且轮到 AI"时触发；或 boot 采纳恢复快照时（P1-1 修复路径）按需执行一次握手并立即置位。
- **修复后验收标准**：CDP 探针复验——boot 进 AI 后首手窗口 `postMessage` 恰 1 次、`terminate` 0 次；"思考中刷新"场景（轮到 AI 时刷新）自愈握手仍恰好触发一次并正确落子；常规模式切换路径（D3 对照）无回归。

---

## 三、待确认风险与未验证项

1. **P2-1 的极端时序残留风险**：若请求 #1 的搜索在 terminate 生效前返回，理论上存在双落子窗口；实测多轮未复现（终局棋子数始终正确），但 insane 难度长搜索下的时序未穷尽。该风险与 P2-1 同源，修复后合并验证即可，不单独立项。
2. **ar/RTL 镜像布局**：本轮以代码审查确认 `DocumentLocaleSync` 的 `dir` 回写与无硬编码 left/right，未做浏览器级 RTL 逐帧取证（超出本轮变更核心风险面）。
3. **多标签页并发**：同源双标签页并发写 `gomoku-active-game` 的 last-writer-wins 竞态未测试（sessionStorage 本身为 per-tab，实际风险极低）。

---

## 四、推荐修复顺序与复审验收标准

1. **先修 P1-1**（水合后一次性采纳恢复快照，含 AI 参数注入路径），再修 **P2-1**（恢复基线 + healed 置位），二者在 `GameShell` 挂载时序上强耦合，建议同一提交内完成并互相验证。
2. 复审验收：上文两项"修复后验收标准"逐条 CDP 复验通过；四道本地门禁全绿；`npm run verify:online` 建议一并执行（涉及 GameShell 核心挂载路径）。
3. 补充测试建议：现有单测（`client-boot-state.test.ts` 8 项、`game-persistence.test.ts` 16 项）只覆盖纯函数层，无法捕获"useState 消费水合期空快照"这一集成缺口——建议以 jsdom/浏览器级测试固化"刷新恢复"语义，防止回归。
