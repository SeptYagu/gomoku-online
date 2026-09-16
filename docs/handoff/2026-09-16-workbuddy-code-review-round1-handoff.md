# 独立代码审查 Round 1 交接单（人机对战 AI 思考倒计时提示）

> 审查日期：2026-09-16
> 审查员：WorkBuddy 独立代码审查员
> 被审 HEAD：`3a226f19284aa2907a161f04f6736d4b0ffb3872`
> 基准提交：`31e6e7921f3c72dc3a0d717015f39d49511310b5`
> 判定结论：**审查未通过**（0×P0 / 0×P1 / 0×P2 / **5×P3**，全部 P3 必须闭环后方可复核通过）

---

## 一、审查基本信息与通过项简述

- 版本确认：`git pull --ff-only` 后实际 HEAD = `3a226f1`（与派发目标一致），上游 `origin/main` 已同步，工作区提交前干净。
- 实际审查范围：`git diff 31e6e79..3a226f1`，9 文件 / +209 −29（4 源码 + 2 测试 + 3 文档），已逐文件全文阅读，并追踪 `GameShell → useAiGame.commitAiTurn → requestAiMove`、`AiGameView` 双通道渲染与 `dictionaries` 词条契约。
- 需求覆盖：验收标准 1/3/4/5 未发现偏差（`computeAiThinkingSeconds` 语义正确、6 语种 `thinkingCountdown` 与 `{seconds}` 占位符一致、双通道渲染无 RTL 物理属性引入、四道门禁独立复跑全绿：`tsc` 0 错误、`lint` 0 错误 0 警告、`npm run build` 成功、`vitest --pool=vmForks` 243/244 通过且唯一失败项 `game-records.test.ts` EPERM 单跑复现为环境性 flake）。
- 独立负向验证：以真实模块（非重写）执行 15 组极端边界探针，其中 3 组（负 elapsed）返回超出难度上限的秒数、2 组（NaN 入参）返回 `NaN` → 见 P3-5。
- 核心发现：**验收标准 2（倒计时生命周期无定时器泄漏）完全无测试守门**，且 `finally` 清理守卫存在非对称缺陷（P3-3）；另有 a11y 活区语义与 STATUS.md 双字段规则未回填两项问题。

---

## 二、审查发现与缺陷清单

### P3-1｜STATUS.md「最新阶段交付提交」双字段规则未按既定契约回填

- **文件与行号**：`STATUS.md:11`（规则定义见 `STATUS.md:9`）
- **触发条件**：任意一次「阶段交付」提交写入 `STATUS.md` 后检查 `STATUS.md:11`。
- **实际行为**：本次交付提交 `3a226f1` 未修改 `STATUS.md:11`，该字段仍为 `655c667 fix(review): resolve round 7 review findings (P3-1 through P3-4)`，且行尾括注仍保留上一交付的说明「本提交为 Feedback 计划审查交接单，其 SHA 由下一次交付回填」。
- **期望行为**：按 `STATUS.md:9` 明文规则「`最新阶段交付提交` 记录**本字段所在提交的直接前驱阶段交付**，每次阶段交付在下一次提交回填」，本次交付提交应把该字段回填为上一阶段交付提交 `e735801 docs(review): audit feedback and log collection plan`（`git log --oneline -3 -- docs/handoff/2026-09-15-feedback-plan-review-handoff.md` 证实该 handoff 由 `e735801` 落地，`31e6e79` 仅为 `.workbuddy/memory/` 单文件记忆提交、不构成阶段交付），并把括注改为描述本提交（`3a226f1`，其 SHA 由下一次交付回填）。
- **根因**：交付流程漏执行 `STATUS.md:9` 的自定义回填契约——该契约正是为收敛 Round 4 P3-1 / Round 5 P3-1 同一问题第三次复发而设立的，本次为该规则生效后**首次交付即未被执行**。
- **影响范围**：`STATUS.md` 作为仓库唯一权威动态事实基准（Single Source of Truth）的字段可信度；不改动任何运行时代码行为。
- **复现方法与验证证据**：
  ```
  git diff 31e6e79..3a226f1 -- STATUS.md    # 仅改动第 26、34、74-75 行，第 11 行零改动
  git log --oneline -3 -- docs/handoff/2026-09-15-feedback-plan-review-handoff.md  # e735801
  git show --stat e735801 | head            # 阶段交付：handoff + STATUS.md + INDEX.md
  git show --stat 31e6e79 | head            # 仅 .workbuddy/memory/2026-09-15.md
  ```
- **修复建议**：在下一次交付提交中把 `STATUS.md:11` 回填为 `3a226f1 feat(ai): add countdown timer prompt during AI thinking in PvE mode`（本轮审查员已在自身审查提交中按规则把该字段更新为本轮被审交付 `3a226f1` 并重写括注，交付方需在其修复提交中按同一规则继续回填）。
- **修复后验收标准**：`STATUS.md:11` 的 SHA + 提交标题与 `git log --format='%h %s'` 中「本字段所在提交的直接前驱阶段交付」逐字一致，且行尾括注描述的是本字段所在提交自身。

---

### P3-2｜每秒跳动的倒计时被放入 `role="status"` + `aria-live="polite"` 活区，造成屏幕阅读器逐秒连续播报

- **文件与行号**：`src/components/play/AiGameView.tsx:123-135`（关键行：`:125 aria-live="polite"`、`:128 role="status"`、`:131-133` 动态秒数文本）
- **触发条件**：读屏软件（NVDA/JAWS/VoiceOver）用户在困难/专家/疯狂难度下落子，AI 进入思考状态。
- **实际行为**：活区文本每 1 秒变化一次（`useAiGame.ts:267-270` 每 250ms 采样，整数秒变化时 setState；`AiGameView.tsx:132` 用 `String(aiThinkingCountdown)` 渲染），`aria-live="polite"` 会对每次变更排队播报，疯狂难度（30s）将产生约 30 次连续播报（"AI thinking 29s" → "AI thinking 28s" → …），持续占用语音通道，压制用户的其他导航播报；同时侧边栏 `GameShell.tsx:478-479` 已在非活区重复展示同一数值。
- **期望行为**：活区只播报「状态跃迁」级信息（开始思考/结束思考），不应把每秒跳动的数值放在活区内逐秒播报；这与本仓库既有实现惯例一致——`src/components/online/TableTaskBar.tsx:37/45/75` 的悔棋倒计时 `secondsLeft` 每 250ms 重算，却**刻意只把非跳动的 `taskCopy` 放进 `aria-live="polite"`**（`:75`），跳动值只出现在活区之外的动作按钮内；`AiGameView.tsx:95` 既有的 `role="status"` 亦只用于极少变动的待生效设置横幅。
- **根因**：新增指示器直接复用了「状态横幅」的活区语义，未区分「状态跃迁」与「高频数值刷新」两类可访问性语义。
- **影响范围**：仅 a11y/读屏体验；视觉用户不受影响，属可用性回归（该指示器为本次新增，此前该位置无任何活区）。
- **复现方法与验证证据**：
  ```
  # 活区与跳动值同处一个节点
  AiGameView.tsx:125 aria-live="polite"  +  131-133 渲染每秒变化的秒数
  # 仓库既有对照：跳动值被排除在活区之外
  TableTaskBar.tsx:37 secondsLeft = Math.max(0, Math.ceil((undoRequest.expiresAt - nowMs)/1000))
  TableTaskBar.tsx:45 window.setInterval(() => setNowMs(Date.now()), 250)
  TableTaskBar.tsx:75 <strong aria-live="polite">{taskCopy}</strong>   # taskCopy 不含 secondsLeft
  # secondsLeft 仅经 TableActionButton(secondsLeft) 传入按钮，位于活区之外
  ```
- **修复建议**：两者择一——(a) 移除跳动指示器的活区语义（去掉 `role="status"`/`aria-live`，或显式 `aria-live="off"`），把「AI 开始/结束思考」的播报交给一个内容稳定的隐藏 `role="status"` 节点；(b) 保留活区但只放稳定文本（如 `dictionary.ai.thinking`），秒数用 `aria-hidden="true"` 或 `aria-label` 覆盖，使可见数值不参与活区更新。
- **修复后验收标准**：AI 思考期间活区节点的文本在整轮思考内变化次数 ≤ 2（开始/结束）；系统仍能向读屏用户传达「AI 正在思考」；秒数对读屏可访问（可通过 `aria-label` 按需查询）但不会被逐秒播报。

---

### P3-3｜`commitAiTurn` 的 `finally` 清理未按 `requestId` 守卫，被取代的旧请求会清掉新请求的倒计时定时器

- **文件与行号**：`src/components/hooks/useAiGame.ts:304-309`（`finally` 块），关联 `:282-284`（早返回）、`:264-270`（定时器创建）、`:102-107`（`clearAiCountdownInterval` 仅清引用不校验归属）
- **触发条件**：同一 Hook 实例上先后存在两个在途 `commitAiTurn` 调用——旧请求 A 处于 `await requestAiMove` 期间，新的 `commitAiTurn` B 启动（`aiRequestIdRef` 递增并重新写入 `aiCountdownIntervalRef`），A 的 await 随后 settle。
- **实际行为**：A 在 `:282` 检测到 `aiRequestIdRef.current !== requestId` 后 `return`，但 `finally`（`:305`）**无条件**调用 `clearAiCountdownInterval()`；此刻引用指向的是 B 刚创建的定时器，于是 **B 的倒计时被误杀**，UI 冻结在 B 的初始秒数（如 30s）不再递减，直到 B 结束。紧随其后的 `setAiThinkingCountdown(null)`（`:306-308`）却正确带了 `requestId` 守卫，形成同一代码块内「状态更新有守卫、定时器清理无守卫」的语义非对称。
- **期望行为**：清理也应限定归属（如 `if (aiRequestIdRef.current === requestId) clearAiCountdownInterval();`，或让定时器句柄与 `requestId` 绑定后再比对释放），保证被取代请求的收尾不触碰新请求的资源——这与 `:282` 处为「取代语义」专门设置的早返回路径是同一设计意图。
- **根因**：定时器句柄为共享 `ref` 单槽（`:72`），清理由「谁在跑 finally」而非「定时器属于谁」决定。
- **影响范围**：当前无用户可达路径——AI 思考期间棋盘 `disabled`（`GomokuBoard.tsx:124`）、悔棋 `canUndo=false`（`GameShell.tsx:302`）、重置/难度/先后手按钮 `disabled={isAiThinking}`（`AiGameView.tsx:63/86/119`）、模式切换 `isModeSwitchLocked`（`GameShell.tsx:309-310`）全部被锁死，且 `cancelAiTurn` 路径的 `clearAiCountdownInterval()` 已先行清理，故不产生定时器泄漏。属**潜在**缺陷：一旦将来放宽任一守卫（例如允许思考中悔棋/切换模式）即显形为「倒计时卡死」。
- **复现方法与验证证据**：环境限制无法做 Hook 运行时注入（见第三节）。证据为确定性控制流追踪（逐行）：`267` 写入共享 ref → `282-284` 早返回（在 `try` 内） → `304` `finally` 无条件执行 → `305` 清掉当前 ref（= B 的定时器） → `306` 状态清理反而有守卫。可达性排除证据：上列 4 处 UI 守卫 + `commitAiTurn` 唯一调用点 `GameShell.tsx:271` 及其前置守卫 `:250-252`、`:306`。
- **修复建议**：将 `:304-309` 的 `clearAiCountdownInterval()` 纳入 `requestId` 守卫（与 `:306` 合并为同一条件）；或在 `commitAiTurn` 内改用局部变量持有本次定时器句柄，`finally` 仅清理该句柄。
- **修复后验收标准**：`finally` 内不存在对共享定时器 ref 的无条件清理；新增测试用例覆盖「旧请求 settle 于新请求启动之后」场景，断言新请求的倒计时仍持续递减（见 P3-4 的可测性改造要求）。

---

### P3-4｜验收标准 2（倒计时生命周期无泄漏）零测试守门，现有测试在功能完全失效时仍会全绿

- **文件与行号**：`src/components/hooks/useAiGame.test.ts:178-200`（本次新增全部测试内容）；被测实现 `src/components/hooks/useAiGame.ts:118-134`（`cancelAiTurn`、卸载清理）、`:251-310`（`commitAiTurn` 定时器启停）
- **触发条件**：把 `commitAiTurn` 中的 `window.setInterval(...)` 整段删除（即倒计时完全不递减），或删除 `cancelAiTurn`/卸载清理中的 `clearAiCountdownInterval()`。
- **实际行为**：244 项用例仍全部通过——新增测试只覆盖导出的纯函数 `computeAiThinkingSeconds`，`aiCountdownIntervalRef`、`clearAiCountdownInterval`、`commitAiTurn`、`cancelAiTurn` 在测试代码中零引用（`grep` 全仓测试文件无命中）；`vitest.config.ts:6` 为 `environment: "node"` 且未安装 jsdom/happy-dom/@testing-library，Hook 本身不可渲染测试。
- **期望行为**：验收标准 2 是本次交付的显式验收项，交付单第二节第 1 条亦以「无论正常落子、胜负突变提前返回、异常或用户主动重置/取消时均无定时器泄漏」作为承诺，却没有任何可执行断言或可证伪机制守门；本仓库已有先例要求此类路径必须有测试守门（Round 7 P3-3 即以「该路径零覆盖」定级 P3）。
- **根因**：实现把定时器生命周期与 React `useState/useRef` 强耦合在 Hook 内部，唯一的可测面被压缩到纯函数，导致生命周期契约不可测。
- **影响范围**：本次新增的 3 条清理路径（`finally`、`cancelAiTurn`、卸载 effect）与 P3-3 的守卫缺陷全部处于无覆盖状态；后续任何重构都可能静默破坏倒计时或引入定时器泄漏。
- **复现方法与验证证据**：
  ```
  grep -rn "commitAiTurn|clearAiCountdownInterval|aiCountdownIntervalRef|isAiThinking" \
       src/components/hooks/useAiGame.test.ts     # 0 命中
  cat vitest.config.ts                            # environment: "node"，include: src/**/*.test.ts
  ls node_modules | grep -iE "jsdom|happy-dom|testing-library"   # 0 命中
  ```
- **修复建议**：抽出不依赖 DOM 的可测接缝——例如把倒计时调度收敛为纯函数/类 `createAiThinkingCountdown({ setInterval, clearInterval, now })`，由 Hook 注入 `window.*` 与 `Date.now`；测试用 fake timers（本仓库 Round 7 已采用「可控时钟探针」先例）断言：启动即得初始秒数 → 推进 1s 后递减 → settle/cancel/卸载后不再有回调 → 旧请求 settle 不干扰新请求（覆盖 P3-3）。
- **修复后验收标准**：新增测试在「删除 `setInterval` 调用」「删除任一 `clearInterval` 调用」「破坏 P3-3 守卫」三种人为破坏下均**失败**（即测试具备真实的证伪能力），且不引入 jsdom 依赖。

---

### P3-5｜`computeAiThinkingSeconds` 无上界约束：负 elapsed（墙钟回拨）会返回超过难度上限的秒数，非法入参返回 `NaN`

- **文件与行号**：`src/components/hooks/useAiGame.ts:405-408`（函数体 `Math.max(1, Math.ceil(remainingMs / 1000))`），调用点 `:266-270`（`startTime = Date.now()` 与 `Date.now() - startTime` 为两次独立墙钟读取）
- **触发条件**：AI 思考期间系统墙钟向后步进（NTP 校时回拨、用户手动改时间、VM 快照恢复）发生在 `:266` 的 `startTime` 读取与 `:268` 的采样读取之间或之后；或未来以任何非有限值调用该纯函数。
- **实际行为**：实测（真实模块导入，非重写）`computeAiThinkingSeconds(5000, -1) = 6`、`(5000, -2500) = 8`、`(5000, -60000) = 65`——即困难难度（上限 5s）会向用户展示 6/8/65 秒；`(NaN, 0) = NaN`、`(5000, NaN) = NaN`，若被渲染则显示字面量 `NaNs`（`AiGameView.tsx:132`/`GameShell.tsx:479` 均直接 `String(...)` 插值）。
- **期望行为**：按验收标准 1，函数输出应落在 `[1, ceil(timeLimitMs/1000)]` 区间内（超期截断于 1s，且不超过难度上限）。当前实现只保证下界 `≥1`，无上界、无非有限值防御。
- **根因**：`remainingMs = Math.max(0, timeLimitMs - elapsedMs)` 仅对 `timeLimitMs - elapsedMs` 做下界截断，未把 `elapsedMs` 截断到 `[0, timeLimitMs]`；同时调用点用非单调的 `Date.now()` 计算 elapsed，使负值在真实路径上可达（对照：本仓库 `TableTaskBar.tsx:37` 的同类倒计时亦有相同墙钟敏感性，属仓库既有模式，但本函数作为导出纯函数、其契约应自洽）。
- **影响范围**：低概率、自恢复的显示异常（回拨期间显示偏大的秒数，钟步进恢复后自然归位），不影响 AI 决策、落子或胜负判定；`NaN` 分支当前不可达（`getAiTimeLimitMs` 返回静态有限常量，见 `src/game/ai-scheduler.ts:168/321`）。
- **复现方法与验证证据**：以真实模块导入执行 15 组边界探针（临时脚本置于系统临时目录，已删除，未污染仓库）：
  ```
  limit=5000  elapsed=-1      -> 6                 (期望 ≤5)
  limit=5000  elapsed=-2500   -> 8                 (期望 ≤5)
  limit=5000  elapsed=-60000  -> 65                (期望 ≤5)
  limit=NaN   elapsed=0       -> NaN
  limit=5000  elapsed=NaN     -> NaN
  # 其余 10 组（0/999/1000/4999/5000/1e9/29999/30000 各档、limit=0、limit=-5000）均在契约区间内，符合预期
  ```
- **修复建议**：在纯函数内收敛定义域，例如 `const clampedElapsed = Number.isFinite(elapsedMs) ? Math.min(Math.max(elapsedMs, 0), timeLimitMs) : 0;` 后再取剩余秒数；调用点可改用单调时钟 `performance.now()`（本仓库已有 `window.setInterval` 环境，无需新增依赖）。
- **修复后验收标准**：对任意有限/非有限入参，函数返回值恒落在 `[1, max(1, ceil(timeLimitMs/1000))]`；新增用例覆盖负 elapsed、`NaN`、`Infinity` 三类入参。

---

## 三、待确认风险与未验证项

1. **未验证项：Hook 级定时器生命周期的运行时实证**。`vitest.config.ts:6` 为 `environment: "node"`，仓库未安装 jsdom/happy-dom/@testing-library（已核实 `node_modules` 无命中），无法在不引入新依赖的前提下真实挂载 `useAiGame` 观察 `setInterval/clearInterval` 调用序列。因此 P3-3 的结论依据为确定性控制流追踪 + UI 守卫可达性排除（已在缺陷条目内逐行列出证据），**未做运行时注入复现**。需要条件：安装 jsdom（或引入 `react-test-renderer`/`@testing-library/react`）并允许在测试环境内连续调用两次 `commitAiTurn`。残余风险：若 P3-3 的静态判读有误，则该项实际不成立——但守卫非对称本身仍应修正。
2. **未验证项：真实浏览器 RTL（`ar`）下的视觉呈现**。仅完成静态核验（本次改动未引入任何 `left/right/margin-left` 等物理属性，`.ai-thinking-pill` 仅含 `cursor/font-weight/user-select`，`@keyframes ai-pulse` 仅含对称的 `opacity`/`scale`），未在 `dir="rtl"` 下做像素级回归。
3. **环境性风险（非本改动缺陷）**：`src/server/game-records.test.ts` 在整包并行运行时偶发 `EPERM: rename ...\records.jsonl.compact.tmp -> records.jsonl`（`src/server/jsonl-file.ts:68`，Windows 临时文件占用/杀软扫描），单文件复跑 10/10 通过；`STATUS.md:26` 声明的「244 项 100% 通过」据此判定为真实可信，但该 flake 会让门禁产生假阴性，建议后续为该测试加临时目录重试或串行化。
4. **未覆盖门禁**：`npm run verify:online` 未执行（本次改动不涉及联机房间/大厅逻辑；已按 AGENTS.md §3 的推荐条件判定为可选）。

---

## 四、推荐修复顺序与复审验收标准

推荐顺序（成本递增、依赖递增）：

1. **P3-5**（`computeAiThinkingSeconds` 定义域收敛，1 行 + 3 条用例）——独立、零风险。
2. **P3-2**（活区语义收敛，单文件 JSX 调整）——独立、零风险。
3. **P3-1**（`STATUS.md:11` 回填 + 括注重写）——纯文档。
4. **P3-3**（`finally` 清理纳入 `requestId` 守卫）+ **P3-4**（抽出可测接缝并补生命周期测试）——建议一并实施：先抽出 `createAiThinkingCountdown` 接缝，再让测试同时守门 P3-3 的取代场景，避免「先改实现、后补测试」导致守卫缺陷再次滑过。

复审验收标准（全部满足方可判通过）：

- 5 项 P3 全部闭环，且每项在提交中留有可直接核对的 diff 与证据；
- P3-4 的新测试须具备证伪能力：对「删除 `setInterval`」「删除任一 `clearInterval`」「破坏 `requestId` 守卫」三种人为破坏分别失败；
- 四道门禁独立复跑全绿（`tsc`/`lint`/`vitest`/`build`），测试总数与 `STATUS.md:26` 声明一致；
- `STATUS.md:11` 字段与本轮审查提交 SHA 逐字一致（延续双字段规则，不得再次滞后一拍）；
- 不得引入 jsdom/testing-library 等新增依赖（除非另行评估并记录）。
