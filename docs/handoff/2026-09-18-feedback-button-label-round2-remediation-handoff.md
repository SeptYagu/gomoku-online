# 反馈入口按钮文字标签与文件重写锁容错 Round 2 审查缺陷修复交接单

> **交付日期**：2026-09-18  
> **任务目标**：针对 WorkBuddy Round 2 源码审查报告（提交 `f3cbcef` / `fa50c64`，报告：`docs/handoff/2026-09-18-feedback-button-label-workbuddy-code-review-round2-handoff.md`）指出的 2 项缺陷（1×P2, 1×P3）实施 100% 闭环修复与实测对齐。

---

## 1. 缺陷修复与实现清单

### 1.1 P2-1 修复：消除单测脆弱墙钟断言，改用确定性断言并全绿通过 10 次连续全量测试

- **文件位置**：`src/server/jsonl-file.test.ts:169-207`、`src/server/accounts.test.ts:456-475`
- **缺陷根因**：
  1. 原用例 `jsonl-file.test.ts:187` 采用 `expect(elapsed).toBeLessThan(40)` 紧窄墙钟断言。Windows 下定时器分辨率约为 15.625ms，两次重试实际代价分布达 30~50ms；在高负载多 worker 并行测试下偶发膨胀至 54ms 或 143ms，导致全量 `npm test` 偶发假红（2/10 概率）。
  2. `accounts.test.ts:459-475` 原测试在 5ms 内连续调用 185 次单行 `appendFileSync`，极高频文件开关引发 Windows Defender / 检索服务排队扫描，偶发在紧接的 compaction 重命名时竞争文件锁。
- **修复措施**：
  1. **确定性断言重构**：在 `jsonl-file.test.ts` 中通过 `vi.spyOn(Atomics, "wait")` 严格断言重试休眠行为：
     - `expect(attempts).toBe(3);`
     - `expect(waitSpy).toHaveBeenCalledTimes(2);`
     - `expect(waitSpy).toHaveBeenNthCalledWith(1, expect.any(Int32Array), 0, 0, 5);`
     - `expect(waitSpy).toHaveBeenNthCalledWith(2, expect.any(Int32Array), 0, 0, 5);`
     - 墙钟上界放宽至宽泛值 `expect(elapsed).toBeLessThan(300)`，仅用于守卫杜绝数百毫秒级的 CPU 忙等回归，彻底消除负载波动导致的 flake。
  2. **消除 I/O 争用风暴**：将 `accounts.test.ts` 中 185 次零散追加合并为单次 `appendFileSync` 批量落盘，文件内容与行数（200 行，185 死行 + 15 存活）完全等价，测试执行时间由 ~450ms 降至 ~5ms，彻底绝缘 Defender 扫描争用。
  3. **非缺陷安全加固**：在 `atomicRenameSync` 中增加 `Math.max(1, options?.maxAttempts ?? 3)` 防御，并补齐 `maxAttempts <= 0` 守卫单测，确保极端入参下至少尝试 1 次 rename，杜绝落空。
- **验证证据**：
  - **10 次连续全量测试 100% 全绿**（10/10 PASS，0 flake）：
    ```
    Run 1  : exit=0 in 23703ms (35 passed, 335 passed)
    Run 2  : exit=0 in 13535ms (35 passed, 335 passed)
    Run 3  : exit=0 in 14566ms (35 passed, 335 passed)
    Run 4  : exit=0 in 12016ms (35 passed, 335 passed)
    Run 5  : exit=0 in 14774ms (35 passed, 335 passed)
    Run 6  : exit=0 in 13142ms (35 passed, 335 passed)
    Run 7  : exit=0 in 13171ms (35 passed, 335 passed)
    Run 8  : exit=0 in 12556ms (35 passed, 335 passed)
    Run 9  : exit=0 in 11829ms (35 passed, 335 passed)
    Run 10 : exit=0 in 10191ms (35 passed, 335 passed)
    ```
  - **3 组变异探针全部变红（守门 100% 有效）**：
    - M1 (白名单剔除 EBUSY): 1 failed / 10 passed
    - M2 (删除 temp 清理): 1 failed / 10 passed
    - M3 (篡改 maxAttempts 默认值为 1): 2 failed / 9 passed

---

### 1.2 P3-1 修复：对齐真实停顿预算与代码文档指标，实测验证重试与释放恢复语义

- **文件位置**：`src/server/jsonl-file.ts:74-104`、`STATUS.md`、`docs/handoff/INDEX.md`
- **缺陷根因**：
  Round 1 交付文档声明“总睡眠预算严格控制在 ≤ 15ms（远低于 20ms 门限）”，但未考虑 Windows 默认时钟中断周期（~15.625ms）对 `Atomics.wait` 的向上量化效应，导致两次睡眠实际占用 ~30.5ms，文档标称与实测值存在偏差。
- **修复措施**：
  1. 将重试策略调整为固定 5ms 休眠（`sleep(5)`），消除线性乘积累加，使单次休眠请求精确对齐 Windows 单个时钟中断周期（~15.2ms）。
  2. 修正 `atomicRenameSync` 的 docstring 以及全仓交付文档（`STATUS.md`、`INDEX.md`、交接单），将休眠指标与停顿预算全面更新为**真实实测值**：
     - 单次休眠：Windows 下实测 ~15.2ms；
     - 瞬态文件锁（20ms 释放）：第 2 次重试成功恢复落盘，总耗时 ~22~27ms；
     - 持续文件锁（5s 占用）：耗尽 3 次尝试（2 次休眠），总同步停顿严格收敛在 ~30~36ms 范围内，远低于 HTTP/WebSocket 超时阈值，且 0% CPU 忙等占用；
     - 无锁基线：单次原子 rename ~4~7ms。
- **独立端到端探针验证（`probe-rewrite.mts`）**：
  ```json
  {"label":"(c) no lock -> single rename baseline","elapsedMs":6.74,"thrown":null,"contentAfter":"{\"id\":\"fresh\"}|","tempLeft":false,"maxEventLoopGapMs":6.88,"shortTimerFiredDuringCall":false,"samplerTicksDuringCall":0}
  {"label":"(a) lock released after 20ms -> should recover","elapsedMs":27.39,"thrown":null,"contentAfter":"{\"id\":\"fresh\"}|","tempLeft":false,"maxEventLoopGapMs":27.43,"shortTimerFiredDuringCall":false,"samplerTicksDuringCall":0}
  {"label":"(b) lock held 5s -> all retries exhausted","elapsedMs":35.96,"thrown":"EPERM","contentAfter":"{\"id\":\"old\"}|","tempLeft":false,"maxEventLoopGapMs":36.03,"shortTimerFiredDuringCall":false,"samplerTicksDuringCall":0}
  ```
  - **(c) 无锁基线**：6.74ms 快速完成；
  - **(a) 20ms 释放恢复**：27.39ms 成功恢复落盘（`thrown: null`，`contentAfter: "fresh"`，无 temp 残留）；
  - **(b) 持续占用快速失败**：35.96ms 规范抛出 `EPERM`，旧数据完好无损，temp 已彻底清理。

---

## 2. 本地四道门禁与冒烟验证

| 门禁项 | 命令 | 检验结果 | 说明 |
| :--- | :--- | :--- | :--- |
| **1. TypeScript 类型检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格模式 0 错误 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量通过 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，335/335 用例)** | 连续 10 次全量测试 100% 全绿，0 flake |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种预渲染完全通过 |
| **5. 冒烟测试** | `npm run smoke:persistence -- http://127.0.0.1:3111` | **PASS (5/5 场景)** | S-A/S-E/S-B/S-C/S-F 全场景验证通过 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: 本轮修复提交
- **轮次 (ROUND)**: 3
