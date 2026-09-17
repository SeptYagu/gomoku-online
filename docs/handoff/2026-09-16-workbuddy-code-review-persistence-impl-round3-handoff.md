# WorkBuddy 独立代码审查 Round 3 复查 — 对局持久化/语言切换/外观保持（实现交付）

> 特性限定命名说明：`2026-09-16-workbuddy-code-review-round3-handoff.md` 已被方案阶段 Round 3 审查占用，为避免覆盖历史归档，本文档沿用实现审查线特性限定名（`persistence-impl`）。

---

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`0fc7bb6`（工作区干净，`git pull --ff-only` 后 HEAD 与待审提交一致）
- **基准提交**：`9763c09`；实际审查范围：`git diff 9763c09..0fc7bb6`（23 文件，+1499/−121），本轮修复增量 `git diff c37c328..0fc7bb6`（源码 3 文件 + 文档）
- **通过项（极简）**：Round 2 P2-1 的目标场景（room URL 隔离）经真机 CDP 复验通过——存量 AI 局 + `?room=` 整页加载 `post=0/term=0`、模式徽标 `room`、模式切换按钮全部可用、存储完好；`commitAiTurn` 的 `mode !== "ai"` 纵深防御守卫正确且依赖数组完整；验收标准 1/2 相关文件本轮零改动，R1 已验证结论维持。独立设计 4 组真机边界探针，其中 2 组构造出 P1 级回归反例（见下）。

---

## 二、审查发现与缺陷清单

### P1-1（修复引入的回归）：水合首轮 layout effect 以 server snapshot 落入失配分支并无条件置位恢复守卫，F5 恢复与思考中刷新自愈全部静默失效（R1-P1-1 完整回归）

- **严重级别**：P1
- **文件与行号**：`src/components/GameShell.tsx:167-172`（本轮修复新增的无条件置位分支）；`:127-130`（`hasRestoredBootRef` 守卫早退）；根因配合点 `src/components/client-boot-state.ts:62-77`（`useBootSnapshot` 经 `useSyncExternalStore` 的水合语义）
- **触发条件**：local 或 ai 模式下存在活跃对局（`gomoku-active-game` 有棋谱），执行硬刷新（F5 / `Page.reload`）。**任何**水合启动路径均触发，无需 room URL——即 Round 2 修复在堵住 room 幽灵恢复的同时，把正常恢复路径一并堵死。
- **实际行为**：硬刷新后棋盘 0 子、恢复永不发生、思考中刷新自愈握手 0 次（期望 1 次）；存储幸存但用户随后首次落子即以全新对局覆盖存储（与 R1-P1-1 相同的数据丢失路径）。真机实测（CDP，生产构建 + `online-server.ts`，探针脚本置于仓库外）：
  - **S-A**：local 3 手局 → `Page.reload` → `stones=0`（期望 3），存储 3 手完好，模式徽标正确为 local（证明客户端 snapshot 已读到存储，仅恢复 effect 被跳过）；
  - **S-B**：ai 1 手局（人类黑先、轮到 AI）→ reload → `stones=0`、`post=0`、`term=0`（期望恢复 + 自愈握手 `post=1`）；
  - **对照组 S-E**：同一 3 手局经切语言**软导航** → `stones=3` 完整恢复——软导航是纯客户端挂载（非水合），`getSnapshot` 直接返回 client 值，layout effect 首轮即看到真实对局并正常恢复。软/硬路径分裂精确锁定根因在水合时序，而非恢复逻辑本身。
- **期望行为**：验收标准 3（F5 后基于 sessionStorage 完整恢复棋子/轮次/胜负线/AI 参数）与验收标准 4（思考中刷新自愈握手恰 1 次）——两者在 `8ed958f` 已验证闭环，本轮被重新打破。
- **根因**（React 19.2.7 源码级核证 + 真机复现双重确认）：`useSyncExternalStore` 水合渲染取 `getServerSnapshot()`（`bootActiveGame=null`），client snapshot 差异检测 `updateStoreInstance` 是 **Passive effect**（`react-dom-client.development.js:8109-8150` 水合取 server 值、`:8238-8241` 检测后 `forceStoreRerender`），在水合 commit 的**全部 layout effects 之后**才运行。因此恢复 `useIsomorphicLayoutEffect` 首轮必然看到 `bootActiveGame=null` → 落入本轮修复新增的失配分支 → `hasRestoredBootRef.current = true` 被无条件置位；随后 Passive effect 检测到 client snapshot 差异触发重渲染，effect 重跑却在 `:128` 被 `hasRestoredBootRef` 守卫早退——**恢复窗口在真实数据就绪前就被一次性消费**。`8ed958f` 的失配分支只置位 `hasHealedRef` 不置位 `hasRestoredBootRef`，故当时恢复仍能发生；本轮为修 R2-P2-1 加上 `hasRestoredBootRef` 置位后引爆。S-C（room 隔离）的"通过"同样由此造成——不是隔离正确，而是一切恢复都被跳过。
- **影响范围**：所有 local/ai 玩家的刷新场景（验收标准 3 整体失效，P1）；思考中刷新自愈失效（验收标准 4 部分失效）；用户已保存棋谱面临被新对局覆盖的数据丢失；R2-P2-1 的修复验证结论失效。
- **复现方法**：见 S-A/S-B/S-E 探针（脚本留存于审查环境 `%TEMP%`，可复跑）。
- **修复建议**：失配分支的置位必须等到 client 真实快照就绪后裁决，而非在水合首轮（server snapshot 轮）提前消费。可选方案（任一即可，保持 room 失配分支语义不变）：
  1. 在 `useBootSnapshot` 暴露"是否已离开 server 值"（或返回带 `isHydrated` 标记的包装），恢复 effect 在 `!hydrated` 时直接 `return`（不置位任何 ref），待 client 轮再走完整守卫链；
  2. 或恢复 effect 改为只在 `bootActiveGame` 为 client 真实值时执行一次性裁决（例如比较快照与 `DEFAULT_GAME_MODE`/`null` 的 server 哨兵值）。
  注意：修复时不得回退 R2-P2-1 的模式守卫（`bootActiveGame.mode === bootMode`）与 `commitAiTurn` 的 mode 防御；`hasHealedRef` 在 room 失配分支的置位保留。
- **修复后验收标准**：CDP 复验四组探针全过——① S-A：local 3 手局 F5 后 `stones=3`、续落第 4 手入库；② S-B：ai 局轮到 AI 时刷新后恢复 + 自愈握手 `post=1/term=0`、AI 参数零漂移；③ S-C：存量 AI 局 + `?room=` 整页加载 `post=0`、按钮解锁、存储完好；④ S-E：软导航恢复无回归。四道本地门禁全绿。

### P3-1（本轮新增测试断言同义反复，宣称守卫模式失配但验证力为零）

- **严重级别**：P3
- **文件与行号**：`src/components/client-boot-state.test.ts:30-33`
- **触发条件**：静态阅读本轮修复增补的测试。
- **实际行为**：新增三行 `const bootMode = resolveBootGameMode(...); expect(bootMode).toBe("room"); expect(activeAiGame.mode === bootMode).toBe(false);`——第一条与同用例上方既有断言（`:26-27`）完全重复；第二条断言的是**fixture 常量性质**（`activeAiGame.mode === "ai"` 与 `bootMode === "room"` 均为构造时已定的事实），与被测产品守卫（`GameShell.tsx:132` 的恢复分支判断）无任何因果关联——把恢复守卫整行删除该断言依然通过。测试注释宣称 "Guard against mode mismatch"，实际守卫力为零，与真实缺陷（P1-1）同属"纯函数单测无法覆盖组件层恢复逻辑"的缺口。
- **期望行为**：测试应验证守卫逻辑本身，或明确降级为普通优先级断言、删除误导性注释。
- **根因**：以"补断言"的形式回应审查验收标准 ④（"单测为恢复守卫口径补齐用例"），但组件层守卫在纯函数层不可达。
- **影响范围**：仅测试有效性；不直接产生生产缺陷。
- **复现方法**：变异探针思路——将 `GameShell.tsx:132` 的 `bootActiveGame.mode === bootMode` 条件删除，`npm test` 仍全绿（该守卫无任何测试可达路径；与 P1-1 的集成缺口同源）。
- **修复建议**：随 P1-1 修复一并处理——若采纳"浏览器级/CDP 冒烟固化恢复语义"的建议，则覆盖面自然包含本守卫；至少应将上述断言修正为有意义的形式或删除重复断言与误导注释。
- **修复后验收标准**：守卫条件存在变异（删除/恒真化）时测试套件出现失败，或测试中不再存在宣称守卫该逻辑的无效断言。

---

## 三、待确认风险与未验证项

1. **水合/挂载集成时序连续第三次无自动化守门**：R1-P1-1、R2-P2-1、本轮 P1-1 三次缺陷全部源于同一集成缺口（纯函数单测 + 四道门禁均无法捕获水合时序问题，三轮审查均只能以人工 CDP 探针取证）。本轮修复必须一并固化至少一条浏览器级恢复语义守门（CDP 冒烟脚本或等价物），否则第 4 次回归概率极高。此项建议升级为本轮修复的验收组成（对应 P1-1 修复建议）。
2. **验收标准 1/2（路由参数保持/外观保持）本轮未重测**：相关文件（`LocaleSwitcher.tsx`/`ThemeToggle.tsx`/`globals.css`/`locale-navigation.ts`）在 `c37c328..0fc7bb6` 增量中零改动，沿用 R1 已验证结论；残余风险与 R1 记录一致（ar/RTL 逐帧取证未做）。

---

## 四、推荐修复顺序与复审验收标准

1. 仅一项 P1 + 一项 P3，且 P3 与 P1 同源：按 P1-1「修复建议」一次修复（水合轮跳过置位 + client 轮完整守卫链），同步按 P3-1 修正无效断言，并强烈建议一并落地恢复语义自动化守门。
2. 复审验收：P1-1「修复后验收标准」①~④ 逐条 CDP 复验通过（审查方将直接复跑 S-A/S-B/S-C/S-E 探针组）；四道本地门禁全绿。
3. 特别提示：本轮修复不可采用"无条件信任 bootActiveGame 非空即恢复"的写法（会回退 R2-P2-1 的 room 隔离），必须在 client 真实快照就绪后执行 `mode === bootMode` 完整守卫链。
