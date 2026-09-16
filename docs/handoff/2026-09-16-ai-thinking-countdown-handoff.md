# 人机对战 AI 思考倒计时提示功能交付单

> 交付日期：2026-09-16
> 交付主题：人机对战 AI 思考倒计时提示（PvE AI Thinking Countdown）
> 变更范围：AI 状态 Hook、多语言字典、棋盘表现层与桌面端侧边栏、全局样式与动画、自动化测试

---

## 一、交付目标与背景

在人机对战（PvE）模式下，AI 在中高难度（困难 5s、专家 10s、疯狂 30s）计算最佳选点时需要数秒至数十秒的极小极大搜索时间。此前界面仅在侧边栏静态展示 `AI 思考中`，且棋盘上方交互区缺乏思考状态反馈，导致用户无法获知预计剩余时间，易产生界面卡死疑问。

本次交付为 AI 思考状态增加了**实时秒级倒计时提示**，让用户直观掌握 AI 思考进度与预期落子时机。

---

## 二、关键变更与落地内容

### 1. 领域状态与生命周期管理 (`src/components/hooks/useAiGame.ts`)
- **纯函数计算辅助**：新增并导出 `computeAiThinkingSeconds(timeLimitMs, elapsedMs)`，计算剩余毫秒对应的向上取整秒数，且在超期结算阶段保底截断在 `>= 1` 秒，便于单测独立证邪。
- **倒计时状态与定时器管理**：
  - 新增 `aiThinkingCountdown: number | null` 状态；
  - 维护 `aiCountdownIntervalRef` 定时器引用，在 `commitAiTurn` 启动时依据当前难度（`getAiTimeLimitMs(targetDifficulty)`）初始化秒数并启动 250ms 周期采样；
  - 采用防抖更新机制 `setAiThinkingCountdown((prev) => (prev !== remainingSec ? remainingSec : prev))`，仅在秒数整数发生变化时触发 React 状态重置，杜绝高频无效重渲染；
  - 在 `finally` 块、`cancelAiTurn` 以及组件卸载 `useEffect` 清理中原子执行 `clearAiCountdownInterval` 并重置 `aiThinkingCountdown` 为 `null`，确保无论正常落子、胜负突变提前返回、异常或用户主动重置/取消时，均无定时器泄漏。

### 2. 六语种国际化字典更新 (`src/i18n/dictionaries.ts`)
- 在 `GameDictionary.ai` 类型接口中补充 `thinkingCountdown: string;`；
- 在全部 6 种官方语言中补齐翻译并确保 `{seconds}` 占位符结构统一：
  - `en`: `"AI thinking ({seconds}s)"`
  - `zh`: `"AI 思考中（{seconds}秒）"`
  - `fr`: `"L'IA réfléchit ({seconds}s)"`
  - `es`: `"La IA piensa ({seconds}s)"`
  - `ru`: `"ИИ думает ({seconds} с)"`
  - `ar`: `"الذكاء الاصطناعي يفكر ({seconds} ث)"`

### 3. UI 双通道呈现与无障碍支持
- **侧边栏状态卡片 (`src/components/GameShell.tsx`)**：
  - `.status-copy` 在 `isAiThinking` 为 true 时，优先通过 `dictionary.ai.thinkingCountdown.replace("{seconds}", String(aiGame.aiThinkingCountdown))` 渲染动态倒计时文案，并在回退情况下显示 `dictionary.ai.thinking`。
- **棋盘上方交互条 (`src/components/play/AiGameView.tsx`)**：
  - `AiGameViewProps` 增加 `aiThinkingCountdown: number | null`；
  - 在 `game-actions` 区域内，当 `isAiThinking` 为 true 时渲染带有 `role="status"` 与 `aria-live="polite"` 的 `ai-thinking-pill` 指示器，并包含 `Bot` 图标与多语言倒计时文字；
  - 解决窄屏/移动端（<= 900px）下侧边栏折叠于棋盘下方导致用户无法即时察觉倒计时的问题。

### 4. 样式与 RTL 兼容 (`src/app/globals.css`)
- 新增 `.ai-thinking-pill` 样式，继承 `.mode-pill` 的统一高度与外观排版，设置 `cursor: default` 与 `user-select: none`；
- 新增 `.ai-thinking-icon` 呼吸灯微动画 `@keyframes ai-pulse`；
- 全量采用 flexbox 逻辑属性排版，严格兼容阿拉伯语 RTL 镜像布局。

### 5. 自动化测试用例 (`src/components/hooks/useAiGame.test.ts`)
- 针对 `computeAiThinkingSeconds` 补充全覆盖测试用例（包括 0ms 初始、区间折算、超时保底 1s、不同难度上限 1s/5s/30s 等场景）。

---

## 三、本地门禁与验证数据

本地四道工程门禁已按序完整执行并通过：
1. **TypeScript 严格类型检查**：`npx tsc --noEmit` ➔ **0 错误**
2. **ESLint 全量代码规范扫描**：`npm run lint` ➔ **0 错误 0 警告**
3. **Vitest 单元测试套件**：`npm test` ➔ **28 个测试文件全通，244 项用例全部通过（100% 通过）**
4. **Next.js 生产构建**：`npm run build` ➔ **0 报错，Turbopack 生产打包与多语言静态预渲染完全通过**

---

## 四、遗留事项与后续流程

本阶段提交推送到远端（`Push for Review`）后，将立即调用 WorkBuddy 执行独立审查，待审查判定后向用户汇报最终成果。
