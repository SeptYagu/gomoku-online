# 反馈入口按钮文字标签 + Windows 文件重写锁容错 · 独立代码审查 Round 6 报告

> **审查日期**：2026-09-23
> **审查轮次**：Round 6（针对 Round 5 缺陷修复的增量复查）
> **被审 HEAD**：`cb347c8165ba06026a5f100b6c5548f0599c48e8`（`fix(feedback): resolve Round 5 review findings P3-1, P3-2`）
> **基准提交**：`f5d33ae`
> **审查范围**：全量 `git diff f5d33ae..cb347c8`（21 文件，+1208/−48）；本轮修复增量 `81bc3c7..cb347c8`（9 文件；`src/` 4 文件 +60/−11，其余为文档）
> **判定结论**：**未通过**（0×P0，0×P1，0×P2，**1×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

工作区干净，`git pull --ff-only` 无更新，实际 HEAD `cb347c8` 与待审 SHA 一致。已逐文件阅读本轮增量与全量变更（`src/server/jsonl-file{.ts,.test.ts}`、`accounts{.ts,.test.ts}`、`game-records.ts`、`globals.css`、`GameShell.tsx`、`dictionaries.ts`、STATUS/INDEX 与 11 份 handoff），并追踪 `persist()→compactFile()→rewriteJsonlFile→atomicRenameSync`（`accounts.ts:299/307/316/473/481/485`、`game-records.ts:457/464/473`）。

通过项极简确认（不展开）：①Round 5 **P3-1 文档口径闭环** —— `jsonl-file.ts:73-85` 已删除 `bounded to ~45ms` 绝对化框架，改为「空闲 n=150 分位数 + 饱和尾部无界（n=360，max ~1.0s）」双口径，与 `STATUS.md`、`INDEX.md` 逐项一致，与本次独立实测相符；②**验收标准 4 经独立外部 holder 探针证实** —— 真实 `renameSync` + 外部持锁子进程精确释放实测 `16/20/30/40ms → 5/5 恢复`、`45ms → 4/5`、`50ms → 2/5`、`55/60ms → 0/5`（恢复窗口 ≈45~50ms，docstring 的「~45ms 窗口，可靠吸收 20/30ms」成立）；持续持锁下规范抛 `EPERM`（停顿 63ms）、旧文件逐字节不变、`.compact.tmp` 零残留，释放后 7ms 内自愈落盘；③验收标准 1/2/3 结构核验通过（6 语种 `navLabel` 齐全、`aria-label` 与可见文本同源同值、`ar` RTL、新增 CSS 零硬编码 `left/right`；这三个文件本轮未改动，沿用前轮结论）；④门禁独立复跑：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告。

---

## 二、审查发现与缺陷清单

### P3-1 Round 5 P3-2 仅 1/3 闭环：`AccountStore` 与 `GameRecordStore` 的 `compactFile` 异常兜底仍零守门

- **严重级别**：P3
- **文件与行号**：
  - `src/server/accounts.ts:332`（`AccountStore.compactFile` 的 `catch` 兜底体）—— **仍无守门**
  - `src/server/game-records.ts:489`（`GameRecordStore.compactFile` 的 `catch` 兜底体）—— **仍无守门**
  - `src/server/accounts.ts:501`（`GuestSessionStore.compactFile`）—— 已由 `src/server/accounts.test.ts:538` 新用例覆盖（**唯一被闭环的一处**）
- **触发条件**：分别把上述三处 `catch (error) { console.warn(...) }` 的兜底体替换为 `throw error;`（等价回到修复前行为），执行全量 `npx vitest run`。
- **实际行为与期望行为**：
  - 变异 `AccountStore.compactFile`（`accounts.ts:332`）→ 全量 **`Test Files 35 passed (35)` / `Tests 337 passed (337)`，exit=0**。
  - 变异 `GameRecordStore.compactFile`（`game-records.ts:489`）→ 全量 **35 套 / 337 例全绿，exit=0**。
  - 变异 `GuestSessionStore.compactFile`（`accounts.ts:501`）→ `accounts.test.ts` **1 failed / 17 passed**（`AssertionError: expected [Function] to not throw`），守门有效。
  - 期望行为：三个 store 的「压缩失败绝不冒泡到业务层」这一行为承诺都应可测；Round 5 §二 P3-2 明文枚举的就是**三处** `compactFile`（`accounts.ts:331/501`、`game-records.ts:488`）零守门，本轮只补了其中一处。
- **根因**：修复方只在 `accounts.test.ts` 增补了针对 `GuestSessionStore` 的单条用例（用 `compactAfterLines: 1` + `openSync(filePath,"r")` 制造 EPERM），未为 `AccountStore`（`accounts.test.ts` 现有压缩用例 `:130`/`:411` 均在无锁环境成功，永不进入 `catch`）与 `GameRecordStore`（`game-records.test.ts` 同理）各补一条同构用例。由于 Round 5 的验收表述为「**新增用例**在把 catch 改回 rethrow 的变异下必须变红」（单数），字面上可被判为满足，掩盖了「2/3 处仍无守门」的事实。
- **影响范围**：`AccountStore`（账号注册 / 登录）与 `GameRecordStore`（对局记录）两条持久化链路的压缩失败兜底。这两处若在后续迭代被改回 rethrow 或重构抹掉，四道门禁仍会全绿；而 `online-server.ts` 的 HTTP 入口无 `try/catch`、全仓无 `uncaughtException` 兜底 ⇒ 一旦兜底失效，底层 `EPERM` 将直接升级为进程级未捕获异常（Round 4 §三-1、Round 5 §三-2 已确认该风险路径）。
- **复现方法 / 运行证据**（本次独立执行，脚本经 `git status` 确认工作区复原干净）：
  ```
  # 1) 变异 AccountStore（accounts.ts:332）→ npx vitest run
  Test Files  35 passed (35)      Tests  337 passed (337)     exit=0
  # 2) 变异 GameRecordStore（game-records.ts:489）→ npx vitest run
  Test Files  35 passed (35)      Tests  337 passed (337)     exit=0
  # 3) 变异 GuestSessionStore（accounts.ts:501）→ npx vitest run src/server/accounts.test.ts
  Test Files  1 failed (1)        Tests  1 failed | 17 passed (18)   ← 对照，证明探针手法有效
  ```
  变异方式：仅在该行前插入 `throw error;` 并把原 `console.warn(...)` 注释掉，不改变其他任何字符（`git diff` 逐次核对为 1 行改动，跑完即 `git checkout` 复原）。
- **修复建议**：比照 `accounts.test.ts:538` 的现成范式各补一条确定性用例（同一手法，不引入任何墙钟断言）：
  1. `accounts.test.ts` 增补 `AccountStore` 版本（`new AccountStore({ compactAfterLines: N, filePath })` + `openSync(filePath,"r")` 持句柄 → `createAccount` 不抛 / 追加行不丢 / 无 `.compact.tmp` / 捕获 `[AccountStore] file compaction deferred` 日志 → `closeSync` 后再写一次断言自愈压平）。
  2. `game-records.test.ts` 增补 `GameRecordStore` 版本（同上，改用 `recordGame`/对应写入方法 + `[GameRecordStore]` 日志）。
  > 若判断为「一例足以代表三处同构兜底」，则必须同步**修正 Round 5 P3-2 的验收口径**并在交接单中说明取舍，不得以「字面满足」结案。
- **修复后验收标准**：①分别变异 `accounts.ts:332`、`game-records.ts:489` 时对应用例**必须变红**（两处各自独立变红，不接受仅一处）；②正常代码下全量 `npm test` 全绿且新增用例不含墙钟断言；③三处 `console.warn` 诊断日志保持存在；④门禁 `npx tsc --noEmit` / `npm run lint` / `npm test` / `npm run build` 全绿。

---

## 三、待确认风险与未验证项

1. **（本轮未修改的既有断言；Round 5 已量化并明确判定为非阻断残余，本轮依《多轮复查防漂移规则》不回溯新立 P0~P3）验收标准 5 中「彻底消除高负载 / 多 worker 下的 flake 假红」本次**未能证实**：`src/server/jsonl-file.test.ts:192` 的 `expect(elapsed).toBeLessThan(300)` 仍是绝对墙钟上界。本次独立复现其**同一操作数**（`atomicRenameSync` 注入 `EBUSY` 的 `renameFn` + 真实 `Atomics.wait(5)` × 3，即该用例唯一被断言的量）：6 逻辑核 + 8 路 CPU 超订下 `n=300` 实测 `min 44 / p50 141 / p90 224 / p99 298 / max 632ms`，`≥300ms` 占 **3/300（1.0%）**（Round 5 同法测得 6.1%）。
   - **未闭环程度**：本轮 `src/` 增量未触碰该断言（`git diff 81bc3c7..cb347c8 -- src/server/jsonl-file.test.ts` 为空），故该风险与 Round 5 完全同源，既非回归也未改善。
   - **建议**（与 Round 5 §三-1 一致）：直接删除该墙钟上界，或放宽为「仅捕获忙等量级」——同用例内的 `waitSpy` 三条确定性断言（调用 3 次、每次 `(buf,0,0,5)`、`attempts===4`）已足以守门。
   - **STATUS.md 口径**：`STATUS.md:35` 的「全绿通过（100% 稳定，连续全量运行 PASS，0 flake）」在高负载条件下不成立（见下条），建议在高负载口径上收敛表述。
2. **（既有测试的负载敏感性，非本轮引入）全量套件在极端超订下会出现确定性红点**：6 逻辑核 + 8 路超订下首轮全量运行即红，失败点为 `src/server/accounts.test.ts:130`「compacts the append log so file growth follows live accounts, not writes」，报错 `Error: Test timed out in 5000ms.`（vitest 默认 `testTimeout`）。同一测试文件空闲时 18 例合计仅 ~254ms（`accounts.test.ts:130` 是 Round 1 引入的既有用例，本轮未修改）。判定为负载/调度饥饿产物而非代码缺陷，但说明「高负载下 0 flake」不能仅靠四道门禁空闲复跑背书。
3. **未验证项**：①未在 25 逻辑核以上的 CI 主机、以及 `--pool=vmForks/forks` 混合 worker 池配置下复测越界率；②本轮未复跑 `npm run build` 与 `npm run smoke:persistence`（依据：`src/` 增量仅涉及 `jsonl-file.ts` 注释、三处 catch 日志与新增单测，不触及构建产物与运行时时序契约；如需可在复审轮补跑）。
4. **非阻断建议**：`src/server/jsonl-file.ts:76-83` 的分位数数据（`n=150` / `n=360`）沿用 Round 5 审查员实测值，docstring 未标注采样来源；如需可补一行「measured via external-holder probe」以便后人复现。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-1（补守门，唯一阻断项）**：在 `accounts.test.ts` 与 `game-records.test.ts` 各补一条 `compactFile` 兜底守门用例（结构照抄 `accounts.test.ts:538`），并**分别**以变异探针自证：变异 `accounts.ts:332` → `AccountStore` 用例红；变异 `game-records.ts:489` → `GameRecordStore` 用例红。
2. **非阻断（建议同轮处理）**：按 Round 5 §三-1 既定建议删除 / 放宽 `jsonl-file.test.ts:192` 的 `<300ms` 墙钟上界，使验收标准 5 的「彻底消除高负载 flake」有实际代码动作背书；同步收敛 `STATUS.md:35`「0 flake」的表述口径（或补「空闲口径」限定）。
3. **复审验收标准**：
   - ① `accounts.ts:332`、`game-records.ts:489`、`accounts.ts:501` 三处兜底在各自变异下**均**确定性变红；
   - ② Round 5 已闭环项保持不回退（`20ms`/`30ms` 释放各 ≥5/5 恢复、持续锁安全失败且旧文件逐字节不损、`.compact.tmp` 零残留、CPU 忙等 0%、docstring 无绝对上界承诺）；
   - ③ `npx tsc --noEmit` / `npm run lint` / `npm test`（空闲连跑 10 次）/ `npm run build` / `npm run smoke:persistence`（干净端口）全绿；
   - ④ 修复交接单给出可复现的变异探针命令与原始输出。

---

**审查依据提交**：本报告提交于 `cb347c8` 之上的文档提交（仅含本报告与 `STATUS.md` / `docs/handoff/INDEX.md` 更新，不含产品代码或测试改动）。
