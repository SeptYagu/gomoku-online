# 独立代码审查 Round 1 交接单（对局持久化 / 语言平滑切换 / 外观保持 技术设计方案）

> 审查日期：2026-09-16
> 审查员：WorkBuddy 独立代码审查员
> 被审 HEAD：`52c17a6`（`docs(plan): game persistence, locale switching fix, and appearance preservation design`）
> 基准提交：`29058c0`（`fix(lobby): resolve round 3 review findings for unlisted room creation disambiguation`）
> 实际审查范围：`git diff 29058c0..52c17a6`（4 文件 / +257 −1，纯文档）
> 判定结论：**审查未通过**（0×P0 / 0×P1 / **2×P2** / **3×P3**，全部必须闭环后方可复核通过）

---

## 一、审查基本信息与通过项简述

- **版本偏差声明（重要，先读）**：派发单给出的待审 SHA `52c17a6f272a8fe7ae2cb9486c2fc18df7b0d10b` 在本仓库**不是合法对象**（`git cat-file -t` 返回 `fatal: could not get object info`）；其 7 位前缀 `52c17a6` 经 `git rev-parse --disambiguate` 唯一解析为 `52c17a6ebeccf794dc7e9776931c99249e9ee38a`，提交信息与本次任务描述完全一致，故按此提交审查。**审查期间工作区被并发提交推进**：`52c17a6` 之后出现 `1fe244f docs(workflow): add classified review round limits and branch c convergence`（仅改 `AGENTS.md` 与 `docs/templates/DUAL_AGENT_REVIEW_WORKFLOW.md`，**未触碰被审方案文档**），故本轮结论严格对应 `52c17a6`，审查方未做任何 checkout/reset/rebase。
- **通过项（极简）**：需求目标与三模式+设置四类场景拆解完整；两处 Bug 根因与代码事实相符（`src/components/LocaleSwitcher.tsx:30` 确为 `href={`/${locale}`}` 硬编码；`src/components/hooks/useRoomSocket.ts:469-492` 的自动 `room:rejoin` 以 `?room=`/stored session 为前提，且 `useFriendRoom` 的 `enabled` 由模式门控，故丢参数即脱离房间链成立）；方案 §3.4/§4.1 引用的现存机制（`DISCONNECT_GRACE_MS = 60_000`、`gomoku-theme`/`gomoku-theme-change`、`useSyncExternalStore`、Cookie 双写）逐项与代码一致。
- **独立验证（真机 CDP，共 3 组）**：① 软导航性质与对局状态（符合方案前提）；② 在线房间 `?room=` 丢失与工作区跌落（符合方案前提）；③ **暗色下切语言的 `data-theme` 剥离（证伪方案 §4.1 断言，详见 P2-1，dev + prod 双模式复现）**。
- **测试审查**：方案 §5.1 提议的 3 组单测方向成立、非同义反复；但**缺失"软导航重挂载后恢复"与"切语言主题保持"两类守门**，已在 P2-1/P2-2 中要求补入。

---

## 二、审查发现与缺陷清单

### P2-1：切换语言会把外观主题剥离（`data-theme` 丢失，暗色→浅色翻转），方案 §4.1 断言与实测不符且遗漏该实现项

- **文件与行号**：`src/app/[locale]/layout.tsx:28-31`（`<head><ThemeScript /></head>`）、`src/components/ThemeScript.tsx:3-15`（初始化脚本）、`src/components/ThemeToggle.tsx:60-71`（主题值仅在点击时写入 DOM）、`src/components/LocaleSwitcher.tsx:30`（触发软导航的链接）；对应方案 `docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:128-139`（§4.1）与 `:171`（§5.3 场景 6）。
- **触发条件**：暗色主题（用户手选或系统 `prefers-color-scheme: dark`）下，点击语言切换链接（任一语种）。
- **实际行为**：`document.documentElement` 上的 `data-theme` 属性被移除（`hasAttribute('data-theme') === false`），`<body>` 背景由暗色 `rgb(18, 20, 23)` 变为浅色 `rgb(246, 247, 242)`，此后**持续保持浅色**（直到整页刷新或再次手动切换）。
- **期望行为**：切换语言后主题不变（方案 §4.1：「浅色/暗色无论如何刷新或切语言均零闪烁」；§5.3 场景 6：「暗色模式下刷新和切换语言 → 验证无白屏闪烁，保持暗色」）。
- **根因**：语言切换是 Next.js App Router 的**客户端软导航**（实测 `window.__probeLoads` 恒为 1，无整页加载，模块不重新求值），但 `[locale]` 段的 RSC 根节点被重新应用，React 重渲染 `<html>` 时将该**非受控**属性 `data-theme` 移除（MutationObserver 捕获到一次 `attributes` 变更后值即为 `null`）；而唯一写入该属性的 `ThemeScript` 只在整页加载时以同步脚本执行——软导航下 React 不会执行组件内的 `<script>`（控制台同时报出 `Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client.`）。因此现有实现中**不存在**任何在切语言后重建主题属性的机制。
- **影响范围**：任务目标 1.2 第 2 条与验收标准 4（「外观主题在刷新、切换语言和跨会话访问时始终保持，首屏无样式闪烁」）在"切换语言"路径上不成立；方案 §5.3 场景 6 若按字面执行会判定失败。方案将该机制描述为"已完备、无需实现"，因此该缺陷不会被实现阶段自然修复。
- **复现方法/证据**（无头 Chrome CDP + `Emulation.setEmulatedMedia(prefers-color-scheme: dark)`；探针 40ms 高频采样）：
  - 生产构建（`npm run build` + `online-server.ts` 生产模式）：切换前 `{"theme":"dark","has":true,"bg":"rgb(18, 20, 23)","loads":1}` → 点击 `/fr` 链接后 **t≈144ms**：`{"theme":"null","has":false,"bg":"rgb(246, 247, 242)"}` → 4.5s 后仍为 `has:false / bg=rgb(246,247,242)`，`loads` 恒为 1。
  - dev 模式（`online-server.ts --dev`）同点复现：同一翻转发生在 `t≈1229ms`，`loads` 恒为 1。
  - 命令入口（可复跑）：起服务后 `GET /en` → `Emulation.setEmulatedMedia{dark}` → `document.querySelector('.locale-links a[lang="fr"]').click()` → 采样 `getAttribute('data-theme')` 与 `getComputedStyle(document.body).backgroundColor`。
- **修复建议**：方案必须补入实现项与守门（三者取其一或组合）：① 在客户端按挂载/语言变更重新应用主题（例如与 `src/components/DocumentLocaleSync.tsx:9-12` 同类的 effect，或把主题快照经 `useSyncExternalStore` 在每次挂载时写回 `documentElement.dataset.theme`）；② 用 CSS 兜底（`color-scheme` + `@media (prefers-color-scheme: dark)` 的 `:root` 回退），使 `data-theme` 缺失时不致跌落浅色；③ 让 `[locale]` 根布局在软导航下不重写根节点属性。并同步修正 §4.1/§5.3 场景 6 的结论（当前描述与实测相反）。
- **修复后验收标准**：暗色下点击任一语言链接并在 4s 内高频采样，`document.documentElement.getAttribute('data-theme')` 全程恒为 `dark`，`body` 背景采样中**不出现**任何浅色值；重启整页后仍为暗色。

---

### P2-2：启动模式快照的求值粒度未定义——沿用现有 `client-boot-state.ts` 的模块级缓存会使"切语言恢复对局"整链静默失效

- **文件与行号**：`src/components/client-boot-state.ts:30`（注释「启动快照只在页面加载时读一次」）、`:36-49`（`createBootGameModeReader` 内 `let cache` 闭包）、`:52-54`（`readGameModeFromUrl` 为**模块级**单例）、`src/components/GameShell.tsx:50-52`（`mode = modeOverride ?? bootMode`，`modeOverride` 为内存 state，重挂载即丢）；对照正例 `src/components/hooks/room-state-utils.ts:154-173`（实例级 `useRef` 缓存，注释明确「杜绝模块级变量污染与 HMR 状态残留」）；对应方案 `docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:87-94`（§3.2）与 `:96-116`（§3.3）。
- **触发条件**：任意"切换语言"操作（软导航，组件树重挂载）。
- **实测事实**：`/en` 点击棋盘 3 手 → 点击法语链接：`window.__probeLoads` 仍为 1（非整页刷新），但落子计数 **3 → 0**、棋盘清空、模式回落 `local` → 证明 **GameShell 确实重挂载**，而 **JS 模块并未重新求值**。
- **实际行为/风险**：方案 §3.2 要求启动模式按「`?room=` → sessionStorage 活跃对局 → `local`」判定，但未规定快照**按组件挂载粒度**求值。若实现者按 §2.2「统一通过 `useSyncExternalStore` 与 `useBootSnapshot` 模式」就地扩展现有 `useBootGameMode`（其缓存是**页面生命周期级**、软导航不重算），则切语言重挂载后 `bootMode` 返回**首屏缓存值**（页面首屏无 `?room=` 时为 `local`），sessionStorage 中的本地/人机对局既不会被识别为启动模式、也不会触发 §3.3 的回放与自愈握手 → 方案 §5.3 场景 3（人机对战切语言保持对局）与场景 4 之外的全部"切语言不丢局"承诺**静默失效**，且现有单测（只覆盖 `createBootGameModeReader` 纯函数）无法发现。
- **期望行为**：切语言重挂载后，启动模式与对局快照按**当次挂载**重新求值：`?room=` 重新读取、Storage 对局重新识别并回放。
- **根因**：方案把"启动快照"表述为一个页面级概念（`getServerSnapshot` → 客户端首屏），与仓库既有 `client-boot-state.ts` 的模块级粘性缓存叠加后，语义在"软导航重挂载"这一路径上产生分歧；方案未写明粒度要求，也未把 `useBootGameMode` 的缓存迁移列为改动点。
- **修复建议**：在方案 §3.2 明确写出：(a) 启动模式/对局快照一律采用实例级（`useBootSnapshot` 的 `useRef`）语义，**按 GameShell 每次挂载重新求值**；(b) 将 `useBootGameMode` 自 `client-boot-state.ts:52-54` 的模块级单例迁出（保留 `useBootSnapshot` 正例语义）；(c) 增补 §5.1 守门项：以"软导航重挂载"为场景断言模式与落子恢复，并使其在缓存退回模块级时失败。
- **修复后验收标准**：存在活跃人机/本地对局时切换语言，重挂载后模式仍为原模式、落子与轮次完全一致；新增守门用例在把缓存改回模块级后必定失败。

---

### P3-1：语言切换所需的 `pathname/searchParams` 读取方式未规定，最自然的实现会破坏门禁 4

- **文件与行号**：方案 §2.1（`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:44-48`）与 §3.3.C（`:112-116`）；`src/app/[locale]/page.tsx:12-14`（`generateStaticParams`）；`src/components/GameShell.tsx:322`（`LocaleSwitcher` 位于该静态预渲染树内）；`next.config.ts`（未启用 PPR / Cache Components）。
- **触发条件**：实现阶段在 `LocaleSwitcher` 内按最自然方式调用 `useSearchParams()`（可能连带 `usePathname()`）计算 targetHref。
- **证据**：① `npm run build` 输出 `● /[locale] ├ /en ├ /zh ├ /fr …`（`prerendered as static HTML, uses generateStaticParams`）；② Next 16.2.9 `node_modules/next/dist/server/app-render/dynamic-rendering.js:586-596`：`workUnitStore.type` 为 `prerender-legacy` / `prerender-ppr` 时 `throw new BailoutToCSRError('useSearchParams()')`；③ `node_modules/next/dist/server/app-render/app-render.js:1967-1972`：CSR bailout 未被 Suspense 边界接住时先 `log.error` 再 `throw err`（文案即 `useSearchParams() should be wrapped in a suspense boundary at page "..."`）→ **构建失败**；④ 全仓检索 `useSearchParams|usePathname|useRouter` 在 `src/` 中 **0 处**使用，既有范式是 `window.location` + 启动快照（`client-boot-state.ts:52-53`、`room-state-utils.ts:197/268-273`）。
- **实际/期望行为**：按字面实现将导致 `npm run build` 失败，与方案 §5.2 承诺的"门禁 4 全绿"直接冲突；期望方案显式规定一种不破坏 SSG 的读取方式。
- **修复建议**：在 §2.1 写明实现契约：优先沿用仓库既有范式（在客户端经 `window.location.pathname + window.location.search` 求值，配合实例级启动快照），或为组件包一层 `<Suspense>` 边界；明确禁止在 `/[locale]` 静态预渲染树中裸调 `useSearchParams()`。
- **修复后验收标准**：方案文本给出确定的读取方式与 Suspense 结论；落地实现后 `npm run build` 通过且 `/[locale]` 仍为 SSG（构建输出仍标 `●`）。

---

### P3-2：§3.4 存储清理触发点与 `GameShell` 实际控制流不匹配，存在脏对局复活

- **文件与行号**：方案 §3.4（`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:118-122`）；`src/components/interaction-guards.ts:29-33`（`local → room` 且 `localMoveCount > 0` 时返回 `direct`，**不弹确认框**）；`src/components/GameShell.tsx:113-118`（进入 `room` 模式只 `setMode`，不调用 `resetGame`）、`:180`（`direct` 分支直接 `completeModeChange`）、`:91-107`（`resetGame` 是唯一初始化入口）；`src/components/hooks/room-state-utils.ts:446-447`（退房仅清联机 session 与 URL）。
- **触发条件**：本地（或人机）对局进行中（`moves.length > 0`）点击"联机"→ 决策为 `direct`（无确认弹窗）→ 进入联机大厅；随后在大厅（URL 无 `?room=`）执行整页刷新。
- **实际行为（按方案规则推演）**：§3.4 将清理绑定在「确认弹窗点击离开/切换模式」与「点击重新开始/再来一局」两个触发点上，而该路径**既无确认弹窗、也不调用 `resetGame`**，故旧对局 session 不会被清；刷新后 §3.2 优先级 2 命中该陈旧 session，页面复活已放弃的单机/人机对局，而非回到联机大厅工作区。
- **期望行为**：与 §3.4 自述目标（「必须保持严密的生命周期闭环，防止脏对局滞留」）一致——切换模式时即失效**非当前模式**的对局存储。
- **根因**：方案以"确认弹窗"这一 UI 事件描述清理时机，但代码里的模式切换存在多个绕过弹窗的入口（`getModeChangeDecision` 的 `direct` 分支、`completeModeChange("room")` 的提前 return），两套模型未对齐；且 `resetGame` 同时被"重开"与"切模式"复用，方案未说明它该清哪个 key。
- **修复建议**：把清理锚定到状态机入口而非 UI 回调：在 `completeModeChange` / `setMode("room")` 等真实路径上统一失效非目标模式的 session；在方案中给出与 `getModeChangeDecision` 四个取值（`noop`/`confirm-ai`/`confirm-online`/`direct`）一一对应的**清理矩阵**，并明确 `resetGame` 的清理职责与目标 key。
- **修复后验收标准**：上述路径下整页刷新后进入联机大厅（不复活旧局）；清理矩阵覆盖 `getModeChangeDecision` 全部分支且每分支的清理归属唯一确定。

---

### P3-3：AI 自愈握手的"恢复设置注入时序"未定义，AI 先手场景会以默认设置触发

- **文件与行号**：方案 §3.3.B（`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:104-110`）；`src/components/hooks/useAiGame.ts:62-63`（`aiDifficulty`/`firstPlayer` 硬编码初值 `"normal"`/`"human"`，**无任何入参可注入初值**）、`:74`（`openingSeedRef` 由 `createOpeningSeed()` 随机初始化，同样不可注入）、`:85-86` 与 `:594-600`（`aiStone` 由 `firstPlayer` 派生）、`:251-255`（`commitAiTurn(currentBoard, currentMoves, targetDifficulty = aiDifficulty, targetFirstPlayer = firstPlayer)`）、`:305`（`useCallback` 依赖 `[aiDifficulty, firstPlayer, requestAiMove]`）、`:289-298`（据此颜色落子并用 `getGameResult` 判胜负）。
- **触发条件**：存储的对局为 **AI 先手**（`firstPlayer: "ai"`，人类执白），玩家落子后（转为轮到 AI）刷新或切换语言。
- **实际行为/风险**：方案写「自动触发一次 `commitAiTurn(board, moves)`」（仅 2 个实参），第 3/4 参回落到 hook 内部 state。若恢复的设置不是**首次渲染即注入**（而是挂载后 setState——注意 `AGENTS.md §1.2` 明令禁止无守卫的 effect setState），则首帧 `firstPlayer` 仍为默认 `"human"` → `aiStone` 被算成 `"white"`，而该局真正轮到的是黑方 → ①握手条件 `status.nextPlayer === aiStone` 不成立，AI 不落子，棋局停在无人可走的死局；②同局更糟的路径是条件在其它组合下成立时，AI 会以**错误颜色**落子并按该颜色判定胜负，直接污染棋局。
- **期望行为**：恢复后的 `aiDifficulty`/`firstPlayer`（及其派生的 AI 颜色）自首帧起即与刷新前一致，握手以恢复后的设置触发。
- **根因**：方案 §3.1 已声明持久化 `aiDifficulty`/`firstPlayer`/`openingSeed`，但 §3.2 只定义了"启动模式"的注入，§3.3.B 又用一个不传设置的 `commitAiTurn(board, moves)` 表达握手，二者之间的注入时序与接口契约缺失。
- **修复建议**：在方案中写明接口契约——`useAiGame` 新增 `initialAiDifficulty / initialFirstPlayer / initialOpeningSeed` 选项，由 §3.2 的实例级启动快照在**首次渲染**注入；自愈握手**显式传入**恢复后的设置（不得依赖 hook 内部默认值）；并给出时序约束（注入先于握手判定，且禁止以挂载后 setState 实现注入）。
- **修复后验收标准**：AI 先手对局在 AI 回合刷新/切语言后，AI 的颜色与难度与刷新前一致、自动落子且胜负判定正确；补一条守门用例覆盖 `firstPlayer: "ai"` 的恢复握手。

---

## 三、待确认风险与未验证项

1. **未验证（环境限制）**：在线好友房"切语言后 60s 宽限内无缝重连"的完整链路需两名真实客户端与服务端时序配合，本轮仅完成单人侧验证（切语言后 `?room=` 被抹除、工作区由 `table` 跌落 `local`、`data-online-view="table"` 消失）；宽限期常量与 `room:rejoin` 路径已按代码逐行核对（`src/lib/constants.ts:28`、`src/components/hooks/useRoomSocket.ts:469-522`、`src/server/domain/room-state-machine.ts:914`）。**残余风险**：房间席位在 60s 内是否必然保留，取决于服务端清扫周期（`LIFECYCLE_SWEEP_INTERVAL_MS`）与实际连接状态，本轮未实测。
2. **未验证（方案尚未实现）**：`computeLocaleSwitchHref`、`game-persistence.ts` 与 `StoredActiveGame` 均为待实现设计，无法对其运行时行为证伪；本轮仅对方案所依赖的**现存**机制做了真机验证。P2-2 与 P3-1 属于"实现方式一旦选错即暴露"的契约缺口，不属已确认的运行期缺陷。
3. **契约缺口（建议一并明确）**：`replayMoves`（`src/components/hooks/useAiGame.ts:545-547`）底层 `placeStone` 对占点/非法落子会抛错。方案 §5.1.2 仅把"非法或损坏的 storage 容错回退"列为测试项，未定义校验契约。建议明确 `StoredActiveGame` 的运行时校验（对象形状、坐标范围、`stone` 枚举、`moveNumber` 单调性、颜色交替）与"校验失败即丢弃并回退默认局"的语义，避免损坏数据在启动路径抛出。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**：P2-1（实测回归，先补方案缺口与守门）→ P2-2（决定"切语言不丢局"链路是否成立）→ P3-1（决定门禁 4 是否可过）→ P3-3 → P3-2。

**复审验收标准**：
1. 方案文档补齐四项契约：`pathname/searchParams` 读取方式（P3-1）、启动快照求值粒度（P2-2）、存储清理矩阵（P3-2）、恢复设置注入时序与显式传参（P3-3）；
2. §4.1 与 §5.3 场景 6 的结论按实测修正，并给出"切语言保持主题"的可验证实现项（P2-1）；
3. §5.1 增补两类守门：软导航重挂载后的模式/落子恢复、切语言后主题属性保持；
4. 复审以实跑复现为准：审查方将按上文 P2-1 的复现命令在生产构建下重测 `data-theme` 全程恒为 `dark`。
