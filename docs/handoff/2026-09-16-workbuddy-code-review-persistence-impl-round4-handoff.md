# WorkBuddy 独立审查 Round 4 复查（对局持久化 / 语言切换 / 外观保持 实现交付）

> 审查日期：2026-09-16 · 审查轮次：Round 4（实现交付复查）· 结论：**未通过（1×P3）**

---

## 一、审查基本信息与通过项简述

- 基准提交 `9763c09` → 待审提交 `d68a8de`（`git pull --ff-only` 后 HEAD 与待审一致，工作区干净，diff 27 文件 +2094/−120）。
- Round 3 P1-1 修复核验成立：`useIsHydrated`（`client-boot-state.ts:74-82`）令恢复 layout effect 在水合首轮经 `getServerSnapshot()=>false` 早退（`GameShell.tsx:133-135`），post-hydration 同步 re-render 后一次性恢复，水合路径与软导航路径行为统一；真机 smoke S-A/S-B（dev 硬刷新路径）通过。
- Round 3 P3-1 闭环：同义反复断言已移除，替换为 `canRestoreBootGame` 独立变异守门套件；`resolveBootGameMode` 四级优先级、`restoreBootActiveGameSnapshot` 回放、`isValidActiveGame` 防御校验、`computeLocaleSwitchHref` 路由保持与测试均有效。
- 需求 1~5 映射至实现位置无遗漏；`commitAiTurn` 的 `mode !== "ai"` 纵深防御、`?room=` 隔离、`LocaleSwitcher` 点击实时兜底均正常。
- 独立验证：真机 CDP 差分探针 2 组（dev vs 生产，同场景对照）+ 负向构造，发现 1 项 P3（见下）。

## 二、审查发现与缺陷清单

### P3-1 dev(StrictMode) 下切语言软导航重挂载恢复「AI 回合」活跃对局永久死锁

- **严重级别**：P3（仅开发模式；生产构建实测正常；用户可 F5 恢复）
- **文件与行号**：
  - `src/components/GameShell.tsx:131-182` 恢复 layout effect（`:160-166` 在 mount effect 内调用 `aiGame.commitAiTurn`；`:137` `hasRestoredBootRef` 单次守卫）；
  - `src/components/hooks/useAiGame.ts:133-140` 卸载清理仅 `terminateAll` + `clearAiWorkerTimeout`，**不复位 `isAiThinking`、不 settle 搜索 Promise**；
  - `src/components/hooks/useAiGame.ts:142-255` `requestAiMove` 的 Promise 仅由 worker 消息或超时定时器 settle——两者在清理后均消失；
  - `src/components/hooks/useAiGame.ts:257-315` `commitAiTurn` `await` 永不返回。
- **触发条件**：`npm run dev`（Next.js App Router 未显式配置 `reactStrictMode` 时 dev 默认启用 StrictMode，`node_modules/next/dist/build/define-env.js:142-144` 将 `__NEXT_STRICT_MODE_APP` 置 `true`）＋ sessionStorage 存在轮到 AI 落子的活跃人机对局 ＋ 经 LocaleSwitcher 切换语言触发 GameShell 软导航**重挂载**（mount effect 被 StrictMode 双调用）。
- **实际行为**（本机 CDP 探针实测，dev server + headless Chrome）：切语言后棋盘恢复 1 子（首次 effect 的 `setBoard` 已生效），随后 StrictMode 模拟卸载清理终止全部 worker 并清除超时，第二次 effect 执行被 `hasRestoredBootRef` 早退不再重试；观测 12s：棋子恒为 1、AI 模式按钮 `disabled=true` 恒锁（`isAiThinking` 永久 `true` → `GameShell.tsx:458-459` `isModeSwitchLocked`），连带重开/撤销/棋盘点击全部不可用（`AiGameView.tsx:63/72/86/115/119` 均 `disabled={isAiThinking}`），整个 AI 工作区死锁。
- **期望行为**：与生产一致——恢复后 AI 在该难度超时上限内自动落子恰 1 次、按钮不锁死（生产构建同场景实测 1s 内 stones=2、按钮解锁）。
- **根因**：恢复路径在 mount effect 中发起异步 worker 搜索，而 `useAiGame` 的清理路径只终止 worker/清除定时器，既不 settle 已发出的搜索 Promise 也不复位 `isAiThinking`；布尔型单次守卫（`hasRestoredBootRef`）阻断 StrictMode 第二次 mount 的重试。
- **影响范围**：仅开发模式。破坏开发者本地验证「切语言 + AI 对局恢复」这一验收核心场景的体验；`tools/smoke-persistence.ts` 未覆盖该组合（S-E 用 local 对局、S-B 用硬刷新路径——硬刷新恢复发生在 post-hydration update 渲染上，StrictMode 不双调用 update effect，故 S-B 在 dev 仍通过），导致本轮与前三轮（均用生产构建探针）均未拦截。
- **复现方法**：`npm run dev` → 打开 `/en` → 注入 `gomoku-active-game`（`mode:"ai"`、1 手黑棋、`firstPlayer:"human"`，即轮到 AI）→ 点击 FR 语言链接 → `/fr` 观测：棋子停在 1、AI 按钮永久锁死。生产构建（`npm run build && npm start`）同场景 1s 内 AI 自动落子。
- **修复建议**（择一或组合）：
  1. `useAiGame` 卸载清理改调 `cancelAiTurn()`（其内部已复位 `isAiThinking`/倒计时）后再 terminate，保证清理与请求状态一致；
  2. `terminateAiWorkers` 时主动 settle 未决的 `requestAiMove` Promise（resolve `null`），`commitAiTurn` 捕获后复位状态；
  3. 恢复 effect 以 requestId 失效判定替代布尔单次守卫，允许 StrictMode 第二次 mount 重新发起恰一次搜索。
- **修复后验收标准**：dev（StrictMode 开启）与生产构建下，「AI 回合活跃对局 + 切语言软导航重挂载」均在超时上限内 AI 自动落子恰 1 次、`postMessage` 恰 1 次、模式/重开/撤销按钮不锁死；建议将「切语言 + AI 回合恢复」场景补入 `smoke:persistence`（新增 S-F）防止回归。

## 三、待确认风险与未验证项

- 水合恢复时序上，恢复状态生效于 post-hydration 同步 re-render（`useSyncExternalStore` passive 检测后 sync-lane 刷新）；理论上存在一帧 SSG prerendered 空板先绘可能。此为方案文档已明确接受的「三阶段 SSG 安全执行流」既有设计，本轮未做帧级采样取证，不构成缺陷。
- 其余未验证项：无。

## 四、推荐修复顺序与复审验收标准

1. 按 P3-1 修复建议 1（成本最低：清理路径改调 `cancelAiTurn`）落地，并补 `smoke:persistence` S-F 场景（切语言 + AI 回合恢复，dev 与生产各跑一轮）。
2. 复审验收：上述验收标准全满足 + 四道门禁全绿 + `npm run smoke:persistence` 全绿，即可判定本轮闭环。
