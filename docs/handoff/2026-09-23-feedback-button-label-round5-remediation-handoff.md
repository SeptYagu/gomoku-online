# 反馈入口按钮文字标签与文件重写锁容错 Round 5 审查缺陷修复交接单

> **交付日期**：2026-09-23  
> **任务目标**：针对 WorkBuddy Round 5 独立源码审查报告（提交 `0596ec1`，报告：[`docs/handoff/2026-09-23-workbuddy-code-review-round5-handoff.md`](2026-09-23-workbuddy-code-review-round5-handoff.md)）指出的缺陷（0×P0, 0×P1, 0×P2, 2×P3）与非阻断建议实施 100% 闭环修复与守门单测覆盖。

---

## 1. 缺陷修复与实现清单

### 1.1 P3-1 修复：彻底清除 docstring 中的绝对化停顿上界断言，全面对齐实测分位数分布与采样口径

- **文件位置**：`src/server/jsonl-file.ts:77-84`
- **缺陷根因**：
  - Round 5 审查员指出：`src/server/jsonl-file.ts:80` 注释中保留了 `while keeping persistent-lock stalls bounded to ~45ms` 这一绝对化上限断言。
  - 实测空闲系统（n=150）`min 41.85 / p50 46.66 / p90 49.73 / p99 74.09 / max 94.51ms`（尾部为 45ms 的 2.1 倍），而在 6 核 8 路超订 CPU 饱和场景下（n=360）`p50 140.6 / p90 222.3 / p99 657.8 / max 1034.8ms`（>300ms 达 6.1%）。
  - 在未附采样口径的情况下做出 `bounded to ~45ms` 的绝对化声称，与 `STATUS.md`「彻底消除绝对化断言」自相矛盾。饱和下的尾部延迟是同步 `Atomics.wait` 受 OS 调度器抢占的固有物理特征。
- **修复措施**：
  - 彻底删除 `bounded to ~45ms` 等任何形式的数学上界绝对化断言。
  - 在 docstring 中客观记录实测统计分位数与采样口径：
    ```typescript
    * Persistent-lock stall equals (maxAttempts - 1) * single sleep; empirical measurements on idle systems
    * (n=150): p50 ~47ms, p90 ~50ms, with idle tails up to ~95ms; under CPU saturation the tail is unbounded
    * (measured max ~1.0s over n=360) due to OS scheduler preemption.
    ```

### 1.2 P3-2 修复：为 `compactFile` 异常捕获兜底补充自动化守门测试与运行时诊断日志，变异探针确定性变红

- **文件位置**：`src/server/accounts.ts:328-333, 497-503`、`src/server/game-records.ts:484-489`、`src/server/accounts.test.ts:538-585`
- **缺陷根因**：
  - Round 5 审查员指出：Round 4 引入的三处 `compactFile` 兜底（`AccountStore`、`GuestSessionStore`、`GameRecordStore`）缺乏自动化测试守门，变异探针将 `catch` 替换为 `throw` 时全量 336 项单测依然全绿，无守门拦截能力。
  - 另外，三处 `catch` 原先静默吃掉异常，缺乏运行时可观测性。
- **修复措施**：
  1. **运行时可观测性增强**：
     - 在三处 `compactFile` 的 `catch` 块中增加结构化 `console.warn`：
       ```typescript
       console.warn(`[GuestSessionStore] file compaction deferred due to lock on ${this.filePath}:`, (error as Error)?.message ?? error);
       ```
  2. **新增确定性守门自动化单测**：
     - 在 `src/server/accounts.test.ts` 中新增测试：
       `"gracefully catches compaction failure under file lock, retains append log, and self-heals when lock releases"`
     - 设置 `compactAfterLines: 1`：
       - 第 1 次会话写入（unlocked）：触发压缩并重置追加计数；
       - 持有句柄 `const fd = openSync(filePath, "r")` 锁定目标文件，触发第 2 次会话写入；
       - `noteAppend()` 满足阈值，在目标文件锁定状态下执行 `compactFile()`；
       - `atomicRenameSync` 尝试耗尽抛出 `EPERM`，进入 `catch` 块；
       - 断言写入不抛错、会话创建成功（`ok: true`）、追加日志完整保留（2 行）、临时文件 `.compact.tmp` 零残留、`console.warn` 捕获到目标错误信息；
       - 释放句柄 `closeSync(fd)`，第 3 次会话写入成功自愈压平至 3 行。
  3. **变异探针双向验证（RED / GREEN 闭环）**：
     - 将 `catch (error) { ... }` 替换为 `catch (error) { throw error; }`：
       - 执行 `npx vitest run src/server/accounts.test.ts` **确定性变红（1 failed, AssertionError: expected [Function] to not throw an error but 'Error: EPERM: operation not permitted...' was thrown）**。
     - 恢复 `catch` 块后：
       - 执行 `npx vitest run src/server/accounts.test.ts` **确定性全绿（18 passed）**。

### 1.3 非阻断项修复：回填 Round 4 修复交接单中的真实提交 SHA

- **文件位置**：`docs/handoff/2026-09-18-feedback-button-label-round4-remediation-handoff.md:59`
- **处理内容**：将占位/孤儿 SHA `7a85bbd` 修正回填为真实 Git 待审提交 `81bc3c7`。

---

## 2. 本地工程门禁验证数据

| 门禁项 | 执行命令 | 验证结果 | 备注 |
| :--- | :--- | :--- | :--- |
| **1. 类型系统检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格类型检查完全通过 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量扫描通过 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，337/337 用例)** | 全量单测全绿，新增 compaction 守门单测，变异探针确认变红 |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种静态预渲染通过 |
| **5. 冒烟测试** | `npm run smoke:persistence` | **PASS (5/5 场景)** | S-A/S-E/S-B/S-C/S-F 全场景验证通过 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: 本次待审提交（由 Round 6 审查命令传入的 HEAD_SHA 动态指定，对应提交 `fix(feedback): resolve Round 5 review findings P3-1, P3-2`）
- **轮次 (ROUND)**: 6
