# 对局持久化与语言平滑切换 Round 2 审查缺陷修复（1×P2 闭环）交接单

> **交付日期**：2026-09-16  
> **审查对象**：WorkBuddy Round 2 审查报告（`c37c328` / `docs/handoff/2026-09-16-workbuddy-code-review-persistence-impl-round2-handoff.md`）  
> **修复主题**：闭环 P2-1/R2（`?room=` 链接加载时模式不匹配分支幽灵恢复存量 AI 对局、幽灵搜索与模式切换按钮锁死问题），建立在线与本地生命周期严格隔离与双层深度防御  

---

## 一、审查缺陷定性与根因回顾

WorkBuddy 在 Round 2 代码审查中对 `8ed958f` 进行了真机 CDP 独立检验：
- **Round 1 缺陷闭环确认**：P1-1（F5 刷新恢复对局状态与 AI 配置、胜负线保持）与 P2-1（常规走子与刷新自愈握手搜索契约）**100% 验证通过**，`postMessage` 与 `terminate` 严格守约。
- **Round 2 新增发现（1×P2）**：
  - **P2-1/R2**：`GameShell.tsx:127-171` 的 `useIsomorphicLayoutEffect` 水合恢复逻辑中，缺少 `bootActiveGame.mode === bootMode` 模式匹配守卫。
  - **复现路径**：用户在本地/人机中存有一局活跃对局，随后通过分享链接访问带有 `?room=PHNTOM` 的 URL。`resolveBootGameMode` 正确裁决 `bootMode = "room"`，但 layout effect 仅检查 `bootActiveGame && bootActiveGame.moves.length > 0`，强行将 AI 对局的 moves 和 status 恢复到房间模式，导致调用 `commitAiTurn` 触发 `postMessage=1` 幽灵搜索，将 `isAiThinking` 置为 true，进而锁死顶部工作区模式切换按钮（禁用类名 `opacity-50 cursor-not-allowed`）。

---

## 二、精准修复与深度防御实现

### 1. 恢复契约模式对齐与自愈标记清算 (`src/components/GameShell.tsx`)
- **模式严格匹配**：在 `useIsomorphicLayoutEffect` 恢复分支中补充 `bootActiveGame.mode === bootMode` 守卫，与 `initialSnapshot` 的求值逻辑完全对齐：
  ```typescript
  if (bootActiveGame && bootActiveGame.mode === bootMode && bootActiveGame.moves.length > 0) {
    hasRestoredBootRef.current = true;
    bootMovesBaselineRef.current = bootActiveGame.moves.length;
    // ...恢复对局
    if (bootActiveGame.mode === "ai" && mode === "ai") {
      aiGame.restoreSettings(...);
    }
  }
  ```
- **失配/空状态客户端挂载即时决议**：若模式失配（例如从人机对局通过 `?room=` 链接进入房间），或无活跃对局需要恢复，挂载后立即置位：
  ```typescript
  if (typeof window !== "undefined") {
    hasRestoredBootRef.current = true;
    hasHealedRef.current = true;
  }
  ```
  彻底杜绝后续生命周期中误触发幽灵自愈握手，模式切换按钮保持完全解锁可用状态。

### 2. 人机调度核心层深度防御 (`src/components/hooks/useAiGame.ts`)
- 在 `useAiGame` 的 `commitAiTurn` 调度核心入口处，增加模式深度防御守卫：
  ```typescript
  if (mode !== "ai") {
    return;
  }
  ```
  并在 `useCallback` 依赖项中补充 `mode`。无论上层组件如何调用或由于时序延迟触发何种事件，只要当前所处工作区不是 `"ai"`，坚决不派发任何 Worker 搜索请求，彻底断绝 `postMessage` 泄漏至房间或本地双人对局的可能性。

### 3. 单元测试增补与不变量固化 (`src/components/client-boot-state.test.ts`)
- 在四级启动判定单测套件中，增补针对 `?room=` 链接加载存量 AI 对局时的失配断言：
  ```typescript
  const bootMode = resolveBootGameMode("?room=ABC123", activeAiGame, "local");
  expect(bootMode).toBe("room");
  expect(activeAiGame.mode === bootMode).toBe(false);
  ```

---

## 三、四道本地门禁验证结果

| 门禁项 | 命令 | 判定标准 | 执行结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1** | `npx tsc --noEmit` | 0 错误（严格类型检查） | 0 error | **PASS** |
| **门禁 2** | `npm run lint` | 0 错误 0 警告（ESLint 全量代码规范扫描） | 0 error, 0 warning | **PASS** |
| **门禁 3** | `npm test` | 全部通过（Vitest 单元测试套件） | 31 suites / 278 tests passed | **PASS** |
| **门禁 4** | `npm run build` | 0 报错（Next.js 生产构建与 11 SSG 页面预渲染） | 编译打包通过，0 error | **PASS** |

---

## 四、改动文件清单

- `src/components/GameShell.tsx`：`useIsomorphicLayoutEffect` 增加 `bootActiveGame.mode === bootMode` 与 `mode === "ai"` 守卫，失配分支置位 `hasHealedRef` 释放模式按钮。
- `src/components/hooks/useAiGame.ts`：`commitAiTurn` 增加 `if (mode !== "ai") return;` 深度防御守卫并纳入依赖。
- `src/components/client-boot-state.test.ts`：增加模式失配防污染单测断言。
- `docs/handoff/2026-09-16-game-persistence-round2-remediation-handoff.md`：本交接文档。
- `docs/handoff/INDEX.md`：交接索引更新。
- `STATUS.md`：阶段状态与指标更新。
