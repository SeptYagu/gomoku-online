# 对局持久化与语言切换 Round 1 审查缺陷修复交接单（P1-1 与 P2-1 闭环）

---

## 1. 修复概览与问题溯源

在 WorkBuddy 对代码实现交付（提交 `1ff7501`）进行的 Round 1 独立对抗性代码审查（报告：`docs/handoff/2026-09-16-workbuddy-code-review-persistence-impl-round1-handoff.md`）中，发现了两项关键缺陷：

1. **P1-1（严重度 P1）**：硬刷新（F5 / Full Page Reload）后本地/人机活跃对局恢复静默失效，后续交互以新对局覆盖存储。
   - **根因分析**：在 SSR 水合首轮，`useBootSnapshot` 经 `useSyncExternalStore` 返回 `serverSnapshot`（`null` / 默认值）。`GameShell.tsx` 中的 `useState(() => initialSnapshot.board)` 等惰性初始化器在首轮即以空快照落定；水合完成后，`useBootActiveGame` 虽成功返回存储值并使 `initialSnapshot` 重算，但 React `useState` 初始值在后续渲染中不会再次采纳，导致棋盘显示为 0 子空盘；当用户后续首次落子时，`commitGameState` 生成全新 1 手对局并直接覆盖 `gomoku-active-game` 存储，造成历史数据丢失。
2. **P2-1（严重度 P2）**：Boot 恢复进入 AI 模式后，首次人类落子触发重复 AI 搜索请求（自愈握手误触发）。
   - **根因分析**：`hasHealedRef` 初始为 `false`，且此前仅在 `completeModeChange`（点击模式切换标签）或握手真正执行时置位。当从 Boot 恢复进入 AI 模式且当前恰轮到人类落子（或 0 手人机局）时，自愈握手在挂载时不执行，`hasHealedRef.current` 保持为 `false`；当人类落子触发 `handlePointSelect` 时，点击路径已发出请求 #1（`postMessage`），随后落子状态改变触发 React 重渲染，自愈握手 `useEffect` 误判为“恢复残留局面需自愈”，追加请求 #2 并杀死请求 #1、重建 Worker，产生双倍搜索计算与 Worker churn。

---

## 2. 核心架构修复措施

### 2.1 纯函数接缝与完整回放：`restoreBootActiveGameSnapshot`
- 在 `src/components/client-boot-state.ts` 中抽象并导出了纯函数 `restoreBootActiveGameSnapshot(activeGame)`：
  - 基于 `activeGame.moves` 确定性回放棋盘（`placeStone`）；
  - 调用 `getGameResult` 推导终局状态（含 `state: "won"` 的 5 子连线 `line` 与 `winner`，或平局）；
  - 导出 `nextPlayer` 颜色；
- 为 `restoreBootActiveGameSnapshot` 补充 4 项单测，全面覆盖空局面、本地 3 手局、人机 2 手局与五连珠终局胜负线保留。

### 2.2 水合后快照一次性同步与 AI 参数注入（彻底闭环 P1-1）
- 在 `src/components/hooks/useAiGame.ts` 暴露 `restoreSettings(difficulty, player, seed)`，允许外部在水合后同步重置 AI 难度、先手与 `openingSeedRef.current`；
- 在 `src/components/GameShell.tsx` 中引入 `useIsomorphicLayoutEffect`：
  - 首轮水合完成后，若检测到 `bootActiveGame` 且包含有效落子数（`moves.length > 0`），使用 `hasRestoredBootRef` 守卫进行**一次性同步 commit**；
  - 同步更新 `board`、`moves`、`status`、`nextPlayer`；
  - 在 AI 模式下同步调用 `aiGame.restoreSettings(...)`，确保 `openingSeed` 与难度绝不漂移；
  - 保证用户在硬刷新（F5）后，本地对局（如 3 子、轮次正确、续落子 `moveNumber=4`）、人机对局（如 2 子、AI 难度/先手/`openingSeed` 不漂移）、以及已完局胜负线与终局状态 100% 完整保留。

### 2.3 恢复基线锁定与全生命周期握手守卫（彻底闭环 P2-1）
- **双重防御机制**：
  1. **Boot 阶段即时裁决**：
     - 在 `useIsomorphicLayoutEffect` 中采纳快照时：
       - 若属于 AI 模式且当前局面恰好轮到 AI 落子（`restored.status.state === "playing" && restored.nextPlayer === targetAiStone`），触发单次自愈 `aiGame.commitAiTurn` 并立即置位 `hasHealedRef.current = true`；
       - 若轮到人类落子（或游戏已结束，或 0 步开局），立即置位 `hasHealedRef.current = true`，绝不允许残留为 `false`；
     - 若当前会话无活跃对局（或 0 步），在挂载时直接置位 `hasHealedRef.current = true`；
  2. **基线步数比对守卫（Baseline Count Guard）**：
     - 记录 Boot 恢复时局面的步数基线 `bootMovesBaselineRef.current = bootActiveGame.moves.length`；
     - 在兜底的自愈握手 `useEffect` 中追加 `moves.length === bootMovesBaselineRef.current` 强约束，任何由人类在本会话中产生的新落子（`moves.length > baseline`）数学上绝不可能触发该 effect；
  3. **交互路径主动防渗透**：
     - `commitGameState`、`resetGame`、`completeModeChange`、`handleUndo` 均显式标记 `hasHealedRef.current = true` 与 `hasRestoredBootRef.current = true`；
     - 彻底消除人类落子窗口的重复搜索（保证 `postMessage` 恰好 1 次、`terminate` 0 次）。

---

## 3. 门禁验证结果

四道本地工程门禁按序全绿通过：
1. `npx tsc --noEmit`：0 错误（严格类型推导，无 `any` 绕过）
2. `npm run lint`：0 错误 0 警告（ESLint 全量代码规范扫描）
3. `npm test`：31 个测试套件 / 278 项测试用例全部通过（覆盖 `client-boot-state.test.ts` 12 项测试）
4. `npm run build`：生产打包成功，所有多语言路由静态预渲染正常（SSG 保持为 `● (SSG)`）

---

## 4. 变更文件清单

- `src/components/client-boot-state.ts`：导出 `restoreBootActiveGameSnapshot` 纯函数与 `RestoredGameSnapshot` 类型
- `src/components/client-boot-state.test.ts`：新增 4 项单测（覆盖空局、本地局、人机局、终局胜负线恢复）
- `src/components/hooks/useAiGame.ts`：导出 `restoreSettings` 回调与类型，同步更新内部 `openingSeedRef` 与难度设置
- `src/components/GameShell.tsx`：接入 `useIsomorphicLayoutEffect` 实施水合后状态采纳，补齐 `hasHealedRef`、`hasRestoredBootRef` 与 `bootMovesBaselineRef` 守卫
