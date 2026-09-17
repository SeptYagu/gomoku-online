# 对局持久化与语言平滑切换 Round 3 审查缺陷修复（1×P1 + 1×P3 闭环）交接单

> **交付日期**：2026-09-16  
> **审查对象**：WorkBuddy Round 3 审查报告（`ff57ac8` / `docs/handoff/2026-09-16-workbuddy-code-review-persistence-impl-round3-handoff.md`）  
> **修复主题**：闭环 P1-1（水合首轮 layout effect 提前消费恢复守卫致 F5 恢复与自愈失效）与 P3-1（同义反复单测修正），落地浏览器级 CDP 冒烟守门（`smoke:persistence`）  

---

## 一、审查缺陷定性与根因深度剖析

WorkBuddy 在 Round 3 代码审查中进行了基于 React 19 源码级核证与真机 CDP 独立检验，确认了关键缺陷：
- **P1-1 缺陷根因**：
  React 19 的 `useSyncExternalStore` 在水合阶段首先返回 `getServerSnapshot()`（此时 `bootActiveGame = null`）。水合 commit 时，`useIsomorphicLayoutEffect` 同步执行，先于检测 client snapshot 差异的 Passive effect（`updateStoreInstance`）。因此 layout effect 首轮必然看到 `bootActiveGame = null`，落入无条件 fallback 分支提前置位了 `hasRestoredBootRef.current = true` 与 `hasHealedRef.current = true`。后续 React 检测到 client snapshot 差异触发重渲染时，layout effect 因 `hasRestoredBootRef` 守卫早退，导致恢复逻辑被永久跳过（F5 刷新恢复为 0 子，思考中刷新自愈为 0 次）。
- **P3-1 缺陷根因**：
  原单测断言重述了 fixture 常量，并未直接针对产品级恢复判定条件进行变异守门。

---

## 二、精准修复与架构闭环方案

### 1. 客户端真实生命周期感知 Hook（`src/components/client-boot-state.ts`）
- 引入 `useIsHydrated` Hook：
  ```typescript
  export function useIsHydrated(): boolean {
    return useSyncExternalStore(
      subscribeToBootState,
      () => true,
      () => false
    );
  }
  ```
  在 SSR 及首轮水合阶段，`getServerSnapshot` 稳定返回 `false`；在客户端挂载后，React 调度 `updateStoreInstance` 检测到 `getSnapshot` 为 `true`，触发重渲染并稳定返回 `true`。软导航则直接由客户端调度，恒稳定返回 `true`。

### 2. 纯函数化恢复判定先决条件（`src/components/client-boot-state.ts`）
- 抽取纯函数 `canRestoreBootGame`，形成恢复条件的 Single Source of Truth：
  ```typescript
  export function canRestoreBootGame(
    activeGame: StoredActiveGame | null | undefined,
    bootMode: GameMode
  ): activeGame is StoredActiveGame {
    return Boolean(
      activeGame &&
      activeGame.mode === bootMode &&
      activeGame.moves.length > 0
    );
  }
  ```

### 3. 组件层水合时序守卫与恢复逻辑统一（`src/components/GameShell.tsx`）
- **时序守卫**：在 `useIsomorphicLayoutEffect` 开头检查 `if (!isHydrated) return;`。在水合首轮直接返回，**绝不提前置位任何 ref 守卫**，将真正的恢复与失配置位裁决完整保留到真实的客户端渲染轮次；
- **口径一致**：`initialSnapshot`（`useMemo`）与 `useIsomorphicLayoutEffect` 统一使用 `canRestoreBootGame(bootActiveGame, bootMode)`，杜绝守卫口径分裂。

### 4. 单元测试重构与变异守门（`src/components/client-boot-state.test.ts`）
- 移除同义反复断言与误导性注释；
- 增设针对 `canRestoreBootGame` 的独立测试套件，全面覆盖模式匹配、失配隔离（`?room=` 链接加载存量 AI 局）、空棋谱与空指针等边界场景。

### 5. 固化浏览器级 CDP 冒烟自动化测试（`tools/smoke-persistence.ts`）
- 新增 `smoke:persistence` 工具脚本，调用无头 Chrome CDP 完整覆盖 WorkBuddy 审查报告中指出的 4 大真机验证场景：
  - **S-A**：本地 3 手局 F5 刷新后 3 颗棋子完整恢复；
  - **S-E**：软导航切换语言（`/en` -> `/fr`）无损保持 3 颗棋子；
  - **S-B**：人机对战轮到 AI 思考时刷新，恢复 1 颗黑子并自动走子（棋子增至 2 颗）；
  - **S-C**：存量 AI 对局通过 `?room=` 邀请链接访问，联机模式干净隔离（模式按钮未被禁用，存储未被污染）。

---

## 三、四道本地门禁验证结果

| 门禁项 | 命令 | 判定标准 | 执行结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1** | `npx tsc --noEmit` | 0 错误（严格类型检查） | 0 error | **PASS** |
| **门禁 2** | `npm run lint` | 0 错误 0 警告（ESLint 代码规范扫描） | 0 error, 0 warning | **PASS** |
| **门禁 3** | `npm test` | 全部通过（Vitest 单元测试套件） | 31 suites / 282 tests passed | **PASS** |
| **门禁 4** | `npm run build` | 0 报错（Next.js 生产构建与 11 SSG 页面预渲染） | 编译打包通过，0 error | **PASS** |

---

## 四、改动文件清单

- `src/components/client-boot-state.ts`：导出 `useIsHydrated` 与 `canRestoreBootGame`。
- `src/components/GameShell.tsx`：引入 `useIsHydrated` 拦截水合首轮提前消费，统一使用 `canRestoreBootGame`。
- `src/components/client-boot-state.test.ts`：重构守卫测试，增设针对 `canRestoreBootGame` 的多维度断言。
- `tools/smoke-persistence.ts`：新增浏览器级 E2E CDP 冒烟测试脚本。
- `package.json`：配置 `smoke:persistence` 脚本命令。
- `docs/handoff/2026-09-16-game-persistence-round3-remediation-handoff.md`：本交接文档。
- `docs/handoff/INDEX.md`：更新交接单索引。
- `STATUS.md`：更新版本快照与最新交付里程碑。
