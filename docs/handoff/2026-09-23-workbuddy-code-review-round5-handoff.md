# 反馈入口按钮文字标签 + Windows 文件重写锁容错 · 独立代码审查 Round 5 报告

> **审查日期**：2026-09-23
> **审查轮次**：Round 5（针对 Round 4 缺陷修复的增量复查）
> **被审 HEAD**：`81bc3c7281540d8b8f69db9a579b2df17adab07c`（`fix(feedback): resolve Round 4 review findings P2-1, P3-1`）
> **基准提交**：`f5d33ae`
> **审查范围**：全量 `git diff f5d33ae..81bc3c7`（19 文件，+993/−47）；本轮修复增量 `d2e9bcb..81bc3c7`（`src/` 4 文件 +83/−24，文档 4 文件）
> **判定结论**：**未通过**（0×P0，0×P1，0×P2，**2×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

已逐文件阅读全部变更（`src/server/jsonl-file{.ts,.test.ts}`、`accounts{.ts,.test.ts}`、`game-records.ts`、`globals.css`、`GameShell.tsx`、`dictionaries.ts`、STATUS/INDEX 与 9 份 handoff），并追踪调用链 `persist()→compactFile()→rewriteJsonlFile→atomicRenameSync`（`accounts.ts:306/316/323`、`game-records.ts:463/473/480`）与 `online-server.ts:25-47` 的无兜底 HTTP 入口。

通过项极简确认：①UI 需求侧经新构建产物独立复核 6 语种 `aria-label === .feedback-nav-label` 文本（en/zh/fr/es/ru/ar 全等）、`ar` RTL、`.feedback-nav-label` 规则零硬编码 `left/right`；②Round 4 **P2-1 核心诉求真正闭环** —— 外部 holder 子进程 busy-spin 精确释放实测 **16/18/20/24/30/40ms 六档全部 5/5 恢复落盘**（`hold≥60ms` 才 0/5），持续占用下安全失败、旧文件逐字节未损、`.compact.tmp` 零残留；③"彻底杜绝 CPU 忙等"定量确认：裸 `Atomics.wait(5)`×200 **CPU 0.00%**、注入式重试 ×150 **CPU 0.45%**（`Atomics.wait` 确为线程挂起）；④四道门禁独立复跑全绿 —— `npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npm run build` 18/18、`npm run smoke:persistence -- http://127.0.0.1:3111`（干净端口、自带起服）5/5；**`npm test` 连跑 10 次 10/10 全绿（35 套 / 336 例）**；⑤**4 组变异探针**中 3 组如期变红（默认 `maxAttempts` 4→1 变红 3 例、删 `unlinkSync` 清理变红 1 例、`Atomics.wait` 替换为忙等变红 1 例）。

---

## 二、审查发现与缺陷清单

### P3-1 Round 4 P3-1 第③项验收未闭环：docstring 仍保留被实测证伪的绝对上界措辞「bounded to ~45ms」，且未附 n 与采样口径

- **文件与行号**：
  - `src/server/jsonl-file.ts:80` —— `while keeping persistent-lock stalls bounded to ~45ms (idle p50 ~45ms, p90 ~48ms) and avoiding CPU busy-wait loops.`
  - `STATUS.md:35` —— `③P3-1 代码 docstring 与交接单全面对齐实测分位数（单次微休眠 ~15.1ms，持续锁停顿 ~45ms），彻底消除绝对化断言`
  - `docs/handoff/INDEX.md:18`（同义声明「持续锁停顿 ~45ms」）
- **触发条件**：对同一 JSONL 目标文件持续 EPERM（外部进程/同进程持句柄），重复采样 `rewriteJsonlFile` 或 `atomicRenameSync` 端到端墙钟。
- **实际行为**（本轮独立实测，脚本见 §五）：
  - 空闲、`n=150`（真实持锁 + 真实文件 I/O）：`min 41.85 / p50 46.66 / p90 49.73 / p99 74.09 / max 94.51ms` —— **max 已越出「~45ms」2.10 倍**（p50/p90 与声明吻合，尾部不符）。
  - 6 核机器 8 路 CPU 超订、`n=360`：`min 40.1 / p50 140.6 / p90 222.3 / p99 657.8 / max 1034.8ms` —— **max 越出 23 倍**，且 `>300ms` 占 22/360（6.1%）。
  - 另一次独立运行（`n=360`，同负载）三档 max 分别为 `273.5 / 343.8 / 329.8ms`。
  - 对照组：Round 3/4 的旧默认 `maxAttempts=2`（1 次休眠）在**同一超订负载**下同样越线（`>300ms` 3/120，max 588.5ms）→ 说明"饱和下无上界"是同步 `Atomics.wait` 的固有性质，不是本轮新引入。
- **期望行为**：Round 4 报告 §P3-1「修复后验收标准」明确要求：**「不再存在任何形式的『绝对上界』承诺，或存在且有 n≥120 实测分位数背书」**，并要求「交接单给出可复现的采样命令与 n 值」。当前 docstring 仍以 `bounded to ~45ms` 作绝对上界陈述，且未标注样本量/负载条件；`STATUS.md:35` 却宣称"彻底消除绝对化断言"，属自相矛盾。本条亦对应本轮验收标准 4「重试与停顿预算**实测有界受控**」——空闲尾部即 2.1 倍、饱和下无界，按字面不成立。
- **根因**：修复方仅以单次/少量采样的 `p50/p90` 覆盖了旧的 `<20ms strictly` 措辞，但未删除"bounded to"这一绝对化框架，也未按要求固化采样命令与 n；Windows 15.625ms 定时器量化 + 调度抢占使同步休眠的分布存在跨 2~N 个时钟中断的长尾，任何"绝对上界"表述在同一物理机制下必然被证伪（Round 2/3/4 已三次踩同一坑）。
- **影响范围**：`online-server.ts` 单进程托管 Next.js + Socket.IO，`persist()→compactFile()` 在请求线程同步执行 ⇒ 该措辞会让后续轮次继续以"已达 <45ms"结案，掩盖持续锁 + 高负载下真实可达 ~1s 的全服冻结；文档口径错误是本任务链条上反复出现且已被连续三轮判为缺陷的同一类问题。
- **复现方法 / 运行证据**：`openSync(dest,"r")` 持句柄 → 循环调用 `rewriteJsonlFile(dest,[...])` 并 `hrtime` 计时，`n≥120` 统计分位数与越界计数；饱和组以 `spawn(process.execPath,["-e","const t=Date.now(); while(Date.now()-t<600000){}"])` ×8 起燃，并用固定工作量膨胀比 `2.71x` 自证燃机生效。原始输出：空闲 `{"n":150,"min":41.85,"p50":46.66,"p90":49.73,"p99":74.09,"max":94.51}`；饱和 `p50 140.6 / p90 222.3 / p99 657.8 / max 1034.8, >300ms=22/360`。
- **修复建议**：删除绝对化框架，改为纯分位数 + 负载条件口径，例如：`stall = 3 × one sleep; measured idle (n=150): p50 ≈47ms, p90 ≈50ms, tail up to ≈95ms; under CPU oversubscription the tail is unbounded (measured max ≈1.0s over n=360) — do not treat ~45ms as a hard bound.` 同步修正 `STATUS.md:35` 与 `INDEX.md` 对应行，并在 docstring 内注明样本量与采样口径（引用本轮脚本即可）。
- **修复后验收标准**：①docstring 与 STATUS/INDEX 中不存在任何形式的绝对上界承诺（"bounded"/"严格"/"≤"式表述），或该类表述旁附 n 与实测分位数；②文档数值与本轮实测分位数逐项一致；③持续锁下的停顿以"空闲 p50/p90 + 饱和尾部无界"双口径表述。

### P3-2 本轮新增的三处 `compactFile` 异常兜底零守门：把 `catch` 改回 rethrow 后全量 35 套 / 336 例仍全绿

- **文件与行号**：`src/server/accounts.ts:331`（`AccountStore.compactFile`）、`src/server/accounts.ts:501`（`GuestSessionStore.compactFile`）、`src/server/game-records.ts:488`（`GameRecordStore.compactFile`）；对应测试面 `src/server/accounts.test.ts`、`src/server/game-records.test.ts`。
- **触发条件**：把三处 `} catch {` 的兜底体替换为 `throw new Error("mutated-compaction-throw");`（等价回到修复前行为），执行全量 `npx vitest run`。
- **实际行为**：`Test Files 35 passed (35)` / `Tests 336 passed (336)`，**vitest exit=0（零红）**。即"压缩失败不冒泡到业务层"这一本轮新增的行为承诺，**没有任何自动化用例守门**——功能若在未来被改回 rethrow（或被重构抹掉），门禁依旧全绿。
- **期望行为**：本轮修复交接单 §1.1-2 明确承诺"若遇持续锁导致重试耗尽，安全降级跳过本次压缩，**绝不让底层文件系统异常冒泡至业务接口层破坏服务可用性**"，且验收标准 4 要求"compactFile 具备异常捕获兜底"。该项属可测行为，应有用例覆盖。行为本身经本轮独立端到端验证**确实正确**（见下"复现方法"第 2 段），缺陷仅在于零守门。
- **根因**：修复方把兜底写成不可观测的 `catch {}`，未同步补测试；现有 `accounts.test.ts:137/354`、`game-records.test.ts:287` 虽会触发压缩，但均在无锁环境下成功，永不进入 catch 分支；同时该 catch 静默无日志/无计数，持续锁下压缩永久失败也无法观测（建议一并补 `console.warn` 或失败计数）。
- **影响范围**：三个持久化 store（账号 / 访客会话 / 对局记录）的全部压缩失败路径；`online-server.ts:25-47` 的 HTTP 入口与全仓均无 `try/catch`/`uncaughtException` 兜底，一旦该兜底被误删，异常将直接升级为进程级未捕获异常（Round 4 §三-1 已确认该风险路径）。
- **复现方法 / 运行证据**：
  1. 变异探针（`sed` 改兜底体 → 跑全量 → `cp` 还原 → `git status --short` 干净）：全量 **35 套 / 336 例全绿，exit=0**（对照组：同一 `sed` 手法把默认 `maxAttempts` 4→1 时 `jsonl-file.test.ts` 变红 3 例、删 `unlinkSync` 清理变红 1 例、`Atomics.wait` 换忙等变红 1 例 → 探针手法本身有效）。
  2. 行为正确性独立验证（证明"该补测试、而非改代码"）：`new AccountStore({ filePath, compactAfterLines: 2 })`，`openSync(filePath,"r")` 持句柄后连续 `createAccount` → `createAccountThrew:null`、追加行数不丢、`tempLeftover:false`、锁内墙钟 51.3ms；`closeSync` 后再 `createAccount` → 压缩在 6.2ms 内自动恢复、文件行数收敛为 5（=5 个活账号）。
- **修复建议**：在 `src/server/accounts.test.ts` 增补一条确定性用例，覆盖兜底与自愈两段：持句柄 → 越过 `compactAfterLines` 触发压缩 → 断言 ①`createAccount` 不抛；②文件追加日志仍写入（真值源不丢）；③无 `.compact.tmp`；④释放句柄后再 append 一次，断言文件被重新压平（行数 == 活条目数）。可顺带把三处 `catch {}` 改为记录 `console.warn`（含文件路径）以便线上观测。
- **修复后验收标准**：①新增用例在"把 catch 改回 rethrow"的变异下必须变红；②该用例在正常代码下全绿且不引入墙钟断言（用"文件行数收敛 / 是否抛出"等确定性事实判定）；③全量 `npm test` 仍 10/10 全绿。

---

## 三、待确认风险与未验证项

1. **（有代码路径依据，非本轮引入，本轮未成功复现）`jsonl-file.test.ts:192` 的墙钟断言 `expect(elapsed).toBeLessThan(300)` 在高负载下仍可能越界**：本轮等价探针（`atomicRenameSync` + 注入 EPERM，与测试断言同一操作数）在 6 核 8 路超订下 `n=360` 出现 `>300ms` **22/360（6.1%）**，`max 1034.8ms`；另一次独立运行 `n=360` 三档 max `273.5 / 343.8 / 329.8ms`。**但对照组证明这不是本轮回归**：把 `maxAttempts` 显式设为修复前的 2 时，同负载下同样越界 `3/120`（max 588.5ms），与该断言现有的 ~1.8 倍余量评估一致。**判定为既存残余风险**（Round 4 已就同一断言给出同类量化结论并未计为缺陷），本轮**不据此阻断**；仅提示：该断言在本机空闲 `10/10 全绿`、真实 `npm test` 也 10/10 全绿，故当前门禁可复现；若后续要进一步降噪，应把该断言的墙体上界改为"仅捕获忙等量级"或直接删除（`waitSpy` 三条确定性断言已足以守门）。
   - **未验证项**：本机为 6 逻辑核；25 核以上 CI 主机与 vitest `--pool=vmForks/forks` 混合 worker 池下的越界率未覆盖。
   - **残余风险**：极高负载 + 多 worker 并发时，全量 `npm test` 存在低频假红可能（本机实测概率量级 ≤6%/次/该用例）。

2. **（有代码路径依据，本轮复现失败）`appendJsonlLine` 位于三处新增 `try/catch` 之外，且 `online-server.ts:25-47` 无兜底、全仓无 `uncaughtException`**：`accounts.ts:299`、`accounts.ts:470`、`game-records.ts:457` 的 `appendJsonlLine` 调用均在兜底块之前，若主追加日志被外部进程持有且共享模式不允许写入，`appendFileSync` 抛出的 EPERM/EBUSY 将直接冒泡为进程级未捕获异常。本次修复把兜底范围限定在压缩（`rewriteJsonlFile`）路径，故该缺口仍在，与交接单"绝不让底层文件系统异常冒泡至业务接口层"的表述存在范围差。
   - **本轮复现结果（负面）**：用本仓制造 rename EPERM 的标准手法（`openSync(dest,"r")` 持句柄）测试 `appendJsonlLine`，**追加成功、不抛**（Node 的 `fs.open` 以 `FILE_SHARE_READ|WRITE|DELETE` 打开，同进程/同 Node 持有者不阻断追加）；仅"目标是目录"（EISDIR）与"父路径被文件占用"（EEXIST）能抛，两者均为非现实路径。
   - **需何条件才能验证**：需一个以受限共享模式（如 `FileShare.None`，PowerShell/.NET `FileStream`）持有该 `.jsonl` 的非 Node 进程，配合"追加期"注入（注册接口受 5 次/10 分钟限流，且需同步命中压缩阈值或直接对 store 单测）。
   - **残余风险**：若现实中存在此类持有者（OneDrive/Defender 均可能），持久化追加异常会导致单进程内 Next.js + Socket.IO 全部不可用；本轮**不据此阻断**，但建议后续在同一任务链内明确该异常的兜底归属（catch 后降级为"本次跳过持久化"或安装 `uncaughtException` 兜底并告警）。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-1（文档口径收口，先做）**：改 `jsonl-file.ts:73-82` docstring 为纯分位数 + 负载条件口径，删除 `bounded to ~45ms`；同步修正 `STATUS.md:35`、`docs/handoff/INDEX.md` 对应行，并附 n 与采样命令。
2. **P3-2（补守门）**：在 `accounts.test.ts` 增补"持句柄 → 压缩失败不抛 / 追加不丢 / 无 temp → 释放后自愈压平"用例，并给三处 catch 补 `console.warn`；以"改回 rethrow 必红"自证守门有效。
3. **非阻断建议（可一并处理）**：
   - `docs/handoff/2026-09-18-feedback-button-label-round4-remediation-handoff.md:59` 的 `HEAD_SHA` 仍写作 **`7a85bbd`**，该提交为 amend 前的孤儿提交（`git merge-base --is-ancestor 7a85bbd HEAD` 为假，与 `81bc3c7` 仅差该行本身），实际交付提交为 `81bc3c7`；Round 4 已就同类问题（round3 交接单写 `68403a4`）提过，建议回填。
   - 三处 `catch {}` 静默无日志，持续锁下压缩永久失败不可观测，建议补 `console.warn`。

**复审验收标准**：①`jsonl-file.ts` docstring 与 STATUS/INDEX 无绝对上界承诺，数值与实测分位数一致并附 n/采样口径；②新增兜底守门用例存在且在"catch→rethrow"变异下变红；③Round 4 已闭环项保持不回退（20ms/30ms 释放各 ≥5/5 恢复、持续锁安全失败无 temp 残留、旧文件不损、CPU 忙等 0%）；④`npx tsc --noEmit` / `npm run lint` / `npm test`（连跑 10 次）/ `npm run build` / `npm run smoke:persistence`（干净端口）全绿；⑤修复交接单给出可复现的探针脚本与原始采样数据。

---

**审查依据提交**：本报告提交于 `81bc3c7` 之上的文档提交（仅含本报告与 STATUS.md / INDEX.md 更新，不含产品代码或测试改动）。
