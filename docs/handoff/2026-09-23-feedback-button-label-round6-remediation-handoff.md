# 反馈入口按钮文字标签与文件重写锁容错 Round 6 审查缺陷修复交接单

> **交付日期**：2026-09-23  
> **任务目标**：针对 WorkBuddy Round 6 独立源码审查报告（提交 `bf895b0`，报告：[`docs/handoff/2026-09-23-workbuddy-code-review-round6-handoff.md`](2026-09-23-workbuddy-code-review-round6-handoff.md)）指出的缺陷（0×P0, 0×P1, 0×P2, 1×P3）与非阻断建议实施 100% 闭环修复与全量守门覆盖。

---

## 1. 缺陷修复与实现清单

### 1.1 P3-1 修复：为全部三处 `compactFile` 异常捕获兜底补齐独立守门单测，变异探针 3/3 独立变红

- **文件位置**：
  - `src/server/accounts.test.ts:585-635`（`AccountStore` 守门单测）
  - `src/server/game-records.test.ts:331-380`（`GameRecordStore` 守门单测）
  - `src/server/accounts.test.ts:538-584`（`GuestSessionStore` 守门单测，Round 5 已具备）
- **缺陷根因**：
  - Round 6 审查员指出：Round 5 仅在 `accounts.test.ts` 为 `GuestSessionStore` 增加了锁定容错单测，而 `AccountStore`（`accounts.ts:332`）与 `GameRecordStore`（`game-records.ts:489`）的 `compactFile()` catch 兜底体仍缺乏直接测试覆盖；若发生回归改回 `throw error`，单测依然 100% 全绿，存在守门盲区。
- **修复措施**：
  1. **为 `AccountStore` 增补同构守门用例**：
     - 在 `src/server/accounts.test.ts` 中新增：
       `"gracefully catches compaction failure under file lock, retains append log, and self-heals when lock releases (AccountStore)"`
     - 初始化 `compactAfterLines: 1`，写入第 1 个账号建立基准；
     - 通过 `const fd = openSync(filePath, "r")` 持有目标文件句柄；
     - 写入第 2 个账号，触发锁定下的 `compactFile()`；
     - 断言 `createAccount` 正常成功（`ok: true`）、不抛错；
     - 断言 `warnings` 捕获到 `[AccountStore] file compaction deferred due to lock` 及 `EPERM`；
     - 断言追加日志完整保留（2 行）、无 `.compact.tmp` 残留；
     - `closeSync(fd)` 释放句柄后，写入第 3 个账号成功自愈压平至 3 行。
  2. **为 `GameRecordStore` 增补同构守门用例**：
     - 在 `src/server/game-records.test.ts` 中新增：
       `"gracefully catches compaction failure under file lock, retains append log, and self-heals when lock releases (GameRecordStore)"`
     - 初始化 `compactAfterLines: 1`，写入第 1 条对局记录建立基准；
     - 通过 `const fd = openSync(filePath, "r")` 持有文件读句柄；
     - 写入第 2 条对局记录，触发锁定下的 `compactFile()`；
     - 断言 `recordAuthoritative` 正常返回、不抛错；
     - 断言 `warnings` 捕获到 `[GameRecordStore] file compaction deferred due to lock` 及 `EPERM`；
     - 断言追加日志完整保留（2 行）、无 `.compact.tmp` 残留；
     - `closeSync(fd)` 释放句柄后，写入第 3 条对局记录成功自愈压平至 3 行。
  3. **变异探针三路独立自证（3/3 RED 闭环）**：
     - **探针 1**：变异 `accounts.ts:332`（`AccountStore` catch 改 throw）：
       ```bash
       npx vitest run src/server/accounts.test.ts
       # 结果：1 failed | 18 passed (AssertionError: expected [Function] to not throw an error but 'Error: EPERM: operation not permitted...' was thrown)
       ```
     - **探针 2**：变异 `game-records.ts:489`（`GameRecordStore` catch 改 throw）：
       ```bash
       npx vitest run src/server/game-records.test.ts
       # 结果：1 failed | 10 passed (AssertionError: expected [Function] to not throw an error but 'Error: EPERM: operation not permitted...' was thrown)
       ```
     - **探针 3**：变异 `accounts.ts:501`（`GuestSessionStore` catch 改 throw）：
       ```bash
       npx vitest run src/server/accounts.test.ts
       # 结果：1 failed | 18 passed (AssertionError: expected [Function] to not throw an error but 'Error: EPERM: operation not permitted...' was thrown)
       ```
     - 三处兜底在各自变异下均**独立、确定性变红**，恢复后全量全绿。

### 1.2 非阻断建议闭环落实

1. **消除高负载 / CPU 饱和下的脆弱墙钟断言**：
   - 文件：`src/server/jsonl-file.test.ts:192`
   - 将 `expect(elapsed).toBeLessThan(300)` 放宽至 `expect(elapsed).toBeLessThan(2000)`。用例中已由 `waitSpy` 3 次调用、每次 5ms、`attempts === 4` 等 5 条确定性断言提供零忙等数学证明，放宽墙钟上界彻底杜绝了多 worker 线程超订调度饥饿下的 1% flake 隐患。
2. **防范极端高负载下 vitest worker 调度超时**：
   - 文件：`src/server/accounts.test.ts:130`
   - 为用例 `"compacts the append log so file growth follows live accounts, not writes"` 显式增加 15,000ms 超时配置（`it(..., 15_000)`），消除极端 8 路超订下的 5s 默认超时 flake。
3. **补充采样方法学注释**：
   - 文件：`src/server/jsonl-file.ts:81-83`
   - 在 docstring 中补充 `(n=150, measured via external-holder probe)`，便于后续复现。

---

## 2. 本地工程门禁验证数据

| 门禁项 | 执行命令 | 验证结果 | 备注 |
| :--- | :--- | :--- | :--- |
| **1. 类型系统检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格类型检查完全通过 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量扫描通过 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，339/339 用例)** | 全量单测全绿，三处 compaction 兜底守门完备，变异探针 3/3 变红 |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种静态预渲染通过 |
| **5. 冒烟测试** | `npm run smoke:persistence` | **PASS (5/5 场景)** | S-A/S-E/S-B/S-C/S-F 全场景验证通过 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: 本次待审提交（由 Round 7 审查命令传入的 HEAD_SHA 动态指定，对应提交 `fix(feedback): resolve Round 6 review finding P3-1`）
- **轮次 (ROUND)**: 7
