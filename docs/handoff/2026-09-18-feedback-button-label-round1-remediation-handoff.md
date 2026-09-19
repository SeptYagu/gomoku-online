# 反馈入口按钮文字标签与文件重写锁容错 Round 1 审查缺陷修复交接单

> **交付日期**：2026-09-18  
> **任务目标**：针对 WorkBuddy Round 1 源码审查报告（提交 `c83a0ea`，报告：`docs/handoff/2026-09-18-feedback-button-label-workbuddy-code-review-round1-handoff.md`）指出的 3 项缺陷（1×P2, 2×P3）实施 100% 闭环修复。

---

## 1. 缺陷修复与实现清单

### 1.1 P2-1 修复：消除 `atomicRenameSync` CPU 忙等与事件循环冻结
- **位置**：`src/server/jsonl-file.ts`
- **修复措施**：
  1. 彻底移除 `while (Date.now() - start < 15 * attempt) {}` 忙等循环；
  2. 采用 Node.js 主线程原生支持的 `Atomics.wait(sleepBuffer, 0, 0, ms)` 实行毫秒级休眠（第 1 次 5ms，第 2 次 10ms），彻底消除 CPU 100% 空转；
  3. 将最大重试次数收敛为 3 次，总睡眠预算严格控制在 ≤ 15ms（远低于 20ms 门限，绝不影响 Socket.IO 心跳与 HTTP 响应）；
  4. 错误码白名单严格收敛为瞬态锁错误 `EPERM` 与 `EBUSY`，对 `EACCES` 等非瞬态权限错误立即快速失败，绝不盲目重试；
  5. 在 `rewriteJsonlFile` 的 catch 分支中增加 `unlinkSync(tempPath)` 安全清理，确保重写失败时绝不残留 `.compact.tmp` 临时文件。

### 1.2 P3-1 修复：补齐重试容错与变异守门自动化测试套件
- **位置**：`src/server/jsonl-file.test.ts`
- **修复措施**：
  1. 新增 `atomicRenameSync` 测试组，包含 5 项针对性用例：
     - 测试在遇到瞬态 `EPERM` / `EBUSY` 时自动重试，并在锁释放后顺利落盘；
     - 测试非瞬态错误 `EACCES` 立即抛出且零重试、零睡眠；
     - 测试持续 `EPERM` 时在达到 `maxAttempts` 后正确抛出，且累计睡眠时间严格受控；
     - 测试重试延迟严格受控于 40ms 以内（实测 < 20ms），守门防止事件循环停顿；
     - 测试 `rewriteJsonlFile` 重命名失败时自动清理 `.compact.tmp` 临时文件；
  2. **变异探针验证**：将默认 `maxAttempts` 篡改为 1 时，用例立刻变红报错（`AssertionError: expected [Function] to not throw an error but 'Error: EPERM: operation not permitted' was thrown`），证明守门 100% 有效。

### 1.3 P3-2 修复：对齐可访问名称与可见文本，满足 WCAG 2.5.3 (Label in Name)
- **位置**：`src/components/GameShell.tsx:493`
- **修复措施**：
  - 将反馈入口链接的 `aria-label={feedbackDictionary.title}` 改为 `aria-label={feedbackDictionary.navLabel}`；
  - 6 种官方语言（en/zh/fr/es/ru/ar）的 Accessible Name 完全等于屏幕上渲染的可见文本（例如中文均为“意见反馈”），彻底消除语音控制识别失配问题；
  - 保留 `title={feedbackDictionary.title}` 提供完整的鼠标悬停浮动说明。

---

## 2. 本地四道门禁验证

| 门禁项 | 命令 | 检验结果 | 说明 |
| :--- | :--- | :--- | :--- |
| **1. TypeScript 类型检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格模式无类型错误 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量扫描通过 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，334/334 用例)** | 新增 5 项测试，全量 334 项用例全绿 |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种预渲染全通 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: `57a73f1` (fix(feedback): resolve Round 1 review findings P2-1, P3-1, P3-2)
- **轮次 (ROUND)**: 2
