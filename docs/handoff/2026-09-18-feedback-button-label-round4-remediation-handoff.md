# 反馈入口按钮文字标签与文件重写锁容错 Round 4 审查缺陷修复交接单

> **交付日期**：2026-09-18  
> **任务目标**：针对 WorkBuddy Round 4 独立源码审查报告（提交 `68213dd`，报告：[`docs/handoff/2026-09-18-feedback-button-label-workbuddy-code-review-round4-handoff.md`](2026-09-18-feedback-button-label-workbuddy-code-review-round4-handoff.md)）指出的缺陷（1×P2, 1×P3）与非阻断建议实施 100% 闭环修复与科学对齐。

---

## 1. 缺陷修复与实现清单

### 1.1 P2-1 修复：默认 `maxAttempts` 调优为 4，恢复窗口扩充至 ~45ms，确保 20ms 与 30ms 释放锁 100% 恢复落盘；增加压缩异常捕获兜底

- **文件位置**：`src/server/jsonl-file.ts:73-89`、`src/server/accounts.ts:323-333, 490-500`、`src/server/game-records.ts:479-489`、`src/server/jsonl-file.test.ts:154-235`
- **缺陷根因**：
  1. Windows 操作系统默认时钟中断晶振粒度为 15.625ms，单次 5ms 的 `Atomics.wait` 休眠在物理上会被向上量化为 ~15.1ms。
  2. Round 3 中将 `maxAttempts` 默认值降为 2（仅 1 次休眠），虽然将持续锁停顿压到了 ~15ms，但也导致瞬态文件锁恢复窗口被物理腰斩至 ≤17.8ms。外部杀毒软件/索引服务持锁 20ms 或 30ms 时末次尝试已耗尽，实测恢复率为 0/5。
  3. 审查员同时指出（§三-1）：`rewriteJsonlFile` 重试耗尽后直接 `throw`，该异常沿 `compactFile() -> persist()` 上行至 HTTP/Socket 接口层缺乏 `try/catch` 捕获，持久锁下可能波及前端请求。
- **修复措施**：
  1. **将默认 `maxAttempts` 调优为 4**：
     - 在 `src/server/jsonl-file.ts` 中：
       ```typescript
       const rawAttempts = options?.maxAttempts;
       const maxAttempts = Number.isFinite(rawAttempts) ? Math.max(1, Math.floor(rawAttempts!)) : 4;
       ```
     - 提供了 ~45ms 的充足安全容错窗口（3 次 ~15.1ms 微休眠），在外部进程持锁 20ms 与 30ms 场景下**均实现 5/5 完美恢复落盘**。
     - 持久占用下安全失败抛出 `EPERM`，自动清理 `.compact.tmp` 临时文件，且 200 次调用 CPU 占用恒为 **0.00%**（挂起线程，彻底杜绝忙等）。
  2. **在 `compactFile` 增加异常捕获兜底防崩**：
     - 在 `AccountStore.compactFile`、`GuestSessionStore.compactFile` 与 `GameRecordStore.compactFile` 中将 `rewriteJsonlFile` 包装在 `try { ... } catch { ... }` 块内。
     - JSONL 追加日志（append log）是系统数据真值源（在 compact 之前数据已安全写入），压缩仅为死行清理维护。若遇持续锁导致重试耗尽，安全降级跳过本次压缩，绝不让底层文件系统异常冒泡至业务接口层破坏服务可用性。
  3. **非阻断防御项落实**：
     - 增加 `Number.isFinite(rawAttempts)` 校验，防御 `options.maxAttempts` 传入 `NaN` 或非法非数字时的静默跳过漏洞，非法入参一律回退为安全默认值 4。

### 1.2 P3-1 修复：代码 docstring 与交接文档指标全面对齐实测分位数，彻底删除绝对化断言

- **文件位置**：`src/server/jsonl-file.ts:73-82`、`STATUS.md`、`docs/handoff/INDEX.md`
- **处理内容**：
  - 更新 `atomicRenameSync` 上方 docstring 注释，明确记录真实物理测量值：
    - Windows 15.625ms 时钟中断粒度下单次休眠实测 ~15.1ms；
    - 4 次尝试（3 次休眠）提供 ~45ms 恢复窗口，可靠覆盖 20ms 与 30ms 瞬态锁释放；
    - 持续锁占用下停顿有界受控在 ~45ms 范围（空闲系统实测 p50 ~45ms, p90 ~48ms；高 CPU 饱和下受线程调度影响会有所上浮）；
    - 彻底删除“绝对保证 < 20ms”等脱离物理现实的断言，客观如实呈现指标。

---

## 2. 本地工程门禁验证数据

| 门禁项 | 执行命令 | 验证结果 | 备注 |
| :--- | :--- | :--- | :--- |
| **1. 类型系统检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格类型检查完全通过 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量扫描通过 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，336/336 用例)** | 全量单测通过，补齐 NaN 防御用例 |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种静态预渲染通过 |
| **5. 冒烟测试** | `npm run smoke:persistence -- http://127.0.0.1:3111` | **PASS (5/5 场景)** | S-A/S-E/S-B/S-C/S-F 全场景验证通过 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: `7a85bbd` (fix(feedback): resolve Round 4 review findings P2-1, P3-1)
- **轮次 (ROUND)**: 5
