# 对局持久化与语言平滑切换 Round 4 审查缺陷修复（1×P3 闭环与 S-F 冒烟守门）交接单

> **交付日期**：2026-09-16  
> **审查对象**：WorkBuddy Round 4 审查报告（`e6bdbce` / `docs/handoff/2026-09-16-workbuddy-code-review-persistence-impl-round4-handoff.md`）  
> **修复主题**：闭环 P3-1（React StrictMode 双调用下切语言软导航重挂载恢复「AI 回合」活跃对局永久死锁），在 `smoke:persistence` 补齐 Scenario S-F 真机冒烟守门  

---

## 一、审查缺陷定性与根因深度剖析

WorkBuddy 在 Round 4 代码审查中，通过对 `9763c09..d68a8de` 实施生产构建 vs 开发模式（StrictMode）差分探针实测，核实定性了如下缺陷：
- **P3-1 缺陷根因**：
  在开发环境（`npm run dev`）下，Next.js App Router 默认启用 React StrictMode。当存在轮到 AI 落子的活跃人机对局时，通过 `LocaleSwitcher` 切换语言触发 `GameShell` 软导航**重挂载**（Mount 1 $\rightarrow$ Unmount $\rightarrow$ Mount 2）：
  1. Mount 1 挂载阶段由恢复 layout effect 触发 `commitAiTurn` 发起异步 worker 搜索；
  2. StrictMode 模拟 Unmount 清理时，原 `useAiGame` 卸载清理仅调用 `terminateAll` 与 `clearAiWorkerTimeout`，**既未 settle 正在进行的 `requestAiMove` Promise，也未重置 `isAiThinking` 状态**；
  3. Mount 2 重新挂载时，`hasRestoredBootRef.current` 因 Mount 1 已被置为 `true` 而早退，不再重新发起搜索；
  4. Mount 1 的 `commitAiTurn` 陷入永不返回的 `await requestAiMove` 死锁，导致 `isAiThinking` 永久保持为 `true`，进而锁死模式切换（`isModeSwitchLocked`）、重开、撤销以及棋盘交互，整个 AI 工作区处于死锁状态。

---

## 二、精准修复与架构闭环方案

### 1. `useAiGame` 显式 Promise 决议与卸载状态复位（`src/components/hooks/useAiGame.ts`）
- **引入未决请求引用**：新增 `pendingAiResolveRef = useRef<((point: Point | null) => void) | null>(null)`；
- **发起搜索拦截与接管**：在 `requestAiMove` 中，若存在前驱未决 Promise，立即主动决议为 `null` 并安全释放，随后绑定新的 `resolve`；
- **正常完成清理**：`finishAiRequest` 中决议时将 `pendingAiResolveRef.current` 置空；
- **取消与卸载全面复位**：在 `cancelAiTurn` 中，主动决议并清除 `pendingAiResolveRef.current?.(null)`，递增 `aiRequestIdRef.current`，同步重置 `isAiThinking = false`、清除倒计时、停止调度器并终止 worker；
- **组件卸载守卫**：将 `useAiGame` 的卸载 `useEffect` 清理对齐调用 `cancelAiTurn()` 与 `terminateAll()`，确保组件卸载或模拟重挂载时状态与运行时彻底归零。

### 2. `GameShell` 引用解耦与 StrictMode 重挂载自愈（`src/components/GameShell.tsx`）
- **引用解耦**：引入 `aiGameRef` 存放最新 `aiGame`，消除对 layout effect 依赖项的抖动影响，依赖项精简稳定为 `[isHydrated, bootActiveGame, bootMode]`，杜绝非必要的重复触发；
- **重挂载清理与复位**：在 `useIsomorphicLayoutEffect` 中增加清理函数，当组件被卸载（包含 StrictMode 模拟 Unmount）时，显式调用 `aiGameRef.current.cancelAiTurn()` 并将 `hasRestoredBootRef.current = false` 与 `hasHealedRef.current = false` 重置，使得 StrictMode 的 Mount 2 能够干净、确定地重新执行恢复并启动首手 AI 搜索。

### 3. 冒烟测试补齐 S-F 场景与自启动服务（`tools/smoke-persistence.ts`）
- **新增 Scenario S-F**：在无头 Chrome CDP 测试中模拟注入活跃 AI 对局（1 步黑棋，human 先手，即轮到 AI），通过点击界面中的语言切换链接（如 `/fr`）触发软导航重挂载，验证恢复后 AI 自动落子（棋子自 1 增至 2）且模式按钮保持解锁（`disabled = false`）；
- **自启动服务容错**：新增 `ensureServerRunning` 与 `killProcessTree`，若执行冒烟测试时目标端口（如 3000）未运行服务，自动化测试将自启动服务、执行测试并在退出时利用 `spawnSync` 彻底清理进程树，使 `smoke:persistence` 具备完全独立的自闭环测试能力。

---

## 三、四道本地门禁与自动化烟测验证结果

| 门禁 / 验证项 | 命令 | 判定标准 | 执行结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1** | `npx tsc --noEmit` | 0 错误（严格类型检查） | 0 error | **PASS** |
| **门禁 2** | `npm run lint` | 0 错误 0 警告（ESLint 代码规范扫描） | 0 error, 0 warning | **PASS** |
| **门禁 3** | `npm test` | 全部通过（Vitest 单元测试套件） | 31 suites / 282 tests passed | **PASS** |
| **门禁 4** | `npm run build` | 0 报错（Next.js 生产构建与 11 SSG 页面预渲染） | 编译打包通过，0 error | **PASS** |
| **自动化烟测** | `npm run smoke:persistence` | S-A、S-E、S-B、S-C、S-F 全通过 | 5/5 全部通过（S-F 顺利走子且按钮解锁） | **PASS** |

---

## 四、改动文件清单

- `src/components/hooks/useAiGame.ts`：增加 `pendingAiResolveRef`，在取消与卸载时主动决议未决 Promise 并彻底复位 `isAiThinking`；
- `src/components/GameShell.tsx`：引入 `aiGameRef`，在 layout effect 卸载清理中取消 AI 回合并复位恢复守卫，允许 StrictMode 第二次 mount 重新启动搜索；
- `tools/smoke-persistence.ts`：补齐 Scenario S-F（切语言软导航 + AI 回合恢复），增强自启动服务与可靠进程清理；
- `docs/handoff/2026-09-16-game-persistence-round4-remediation-handoff.md`：本交接文档；
- `docs/handoff/INDEX.md`：更新交接单索引；
- `STATUS.md`：更新版本快照与最新交付里程碑。
