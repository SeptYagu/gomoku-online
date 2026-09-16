# Round 1 审查缺陷修复与定时器调度器接缝抽取交付单

> 交付日期：2026-09-16
> 对应审查：`8adc826`（Round 1 独立代码审查，5×P3）
> 修复范围：倒计时纯调度器接缝抽取与生命周期测试守门、计算函数定义域与非有限值收敛、AiGameView 活区可访问性降噪、STATUS 双字段规则契约对齐

---

## 一、交付目标与背景

在 Round 1 独立代码审查中，WorkBuddy 提出了 5 项 P3 缺陷（0×P0/P1/P2）。本交付单记录对该 5 项 P3 缺陷的系统性修复与测试闭环：
1. **P3-1（STATUS.md 双字段规则回填契约）**：按 `STATUS.md:9` 契约回填前驱阶段交付 SHA 并重写当前提交括注；
2. **P3-2（屏幕阅读器活区每秒播报降噪）**：在 `AiGameView.tsx` 活区设置稳定的 `aria-label={dictionary.ai.thinking}`，并将高频跳动的倒计时文本置于 `aria-hidden="true"` 内部节点，确保单轮思考内活区状态跃迁 ≤ 2 次，消灭读屏噪音；
3. **P3-3（`commitAiTurn` finally 定时器清理守卫）**：将 `clearAiCountdownInterval` / `scheduler.stop(countdownId)` 纳入 `if (aiRequestIdRef.current === requestId)` 守卫，杜绝旧请求 settle 误杀新请求定时器；
4. **P3-4（生命周期契约可测性改造与测试守门）**：抽取不依赖 DOM 的 `createAiCountdownScheduler` 纯调度器接缝，通过可控可注入时钟为定时器启停、每秒递减、取消与旧请求被取代（P3-3）场景建立完备的自动化测试守门；
5. **P3-5（`computeAiThinkingSeconds` 上界约束与非有限值防御）**：补齐负 elapsed（墙钟回拨）、NaN、Infinity 等边界的截断与类型防御，确保返回值恒落在 `[1, max(1, ceil(timeLimitMs/1000))]`。

---

## 二、关键变更与落地内容

### 1. P3-5：`computeAiThinkingSeconds` 定义域收敛 (`src/components/hooks/useAiGame.ts`)
- 将非有限 `timeLimitMs` 安全收敛为 `Math.max(0, timeLimitMs)`；
- 对 `elapsedMs` 进行非有限与上下界判定：`elapsedMs > 0 ? safeLimit : 0`（处理 `Infinity`），有限值截断在 `[0, safeLimit]`（彻底消除负值回拨返回偏大秒数的问题）；
- 返回值双向截断：`Math.min(maxSeconds, Math.max(1, Math.ceil(remainingMs / 1000)))`。

### 2. P3-3 与 P3-4：纯调度器抽离与生命周期测试守门
- **`createAiCountdownScheduler` 纯调度器** (`src/components/hooks/useAiGame.ts`)：
  - 支持注入 `setInterval`、`clearInterval`、`now` 与 `samplingIntervalMs`；
  - 内部维护 `activeRequestId`，`start()` 返回唯一 `countdownId`；`stop(requestId)` 具备归属守卫，非活动请求调用自动无害忽略；
- **Hook 调度集成** (`src/components/hooks/useAiGame.ts`)：
  - `commitAiTurn` 的 `finally` 仅在 `aiRequestIdRef.current === requestId` 时调用 `scheduler.stop(countdownId)`，消除清理非对称缺陷；
- **自动化测试守门** (`src/components/hooks/useAiGame.test.ts`)：
  - 新增 `manages countdown timer lifecycle, ticks, and guards against supersession` 测试；
  - 构造模拟时钟验证：启动立即下发初始秒数、推进 1000ms 下发递减秒数、250ms 重采样防抖不重复下发、新请求启动后旧请求调用 `stop(req1)` 不影响新请求继续推进、新请求显式 `stop(req2)` 彻底清理定时器句柄（0 泄漏）。

### 3. P3-2：可访问性活区语义收敛 (`src/components/play/AiGameView.tsx`)
- 外层 `role="status"` 与 `aria-live="polite"` 挂载固定 `aria-label={dictionary.ai.thinking}`；
- 内部动态秒数包裹 `<span aria-hidden="true">`；
- 兼顾视觉实时倒计时与读屏用户的单次有效提示，杜绝每秒刷屏。

### 4. P3-1：STATUS.md 与交接单索引更新 (`STATUS.md`, `docs/handoff/INDEX.md`)
- `STATUS.md:11` 回填 `3a226f1 feat(ai): add countdown timer prompt during AI thinking in PvE mode`，更新括注为描述本次修复提交；
- 登记本次修复交接单至 `docs/handoff/INDEX.md`。

---

## 三、本地门禁与验证数据

本地四道工程门禁已按序完整执行并通过：
1. **TypeScript 严格类型检查**：`npx tsc --noEmit` ➔ **0 错误**
2. **ESLint 全量代码规范扫描**：`npm run lint` ➔ **0 错误 0 警告**
3. **Vitest 单元测试套件**：`npm test` ➔ **28 个测试文件全通，245 项用例全部通过（100% 通过）**
4. **Next.js 生产构建**：`npm run build` ➔ **0 报错，全量路由静态预渲染打包成功**

---

## 四、后续流程

推送到远端后，将立即调用 WorkBuddy 进行 Round 2 独立复审。
