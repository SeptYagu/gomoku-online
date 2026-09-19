# 反馈入口按钮文字标签 + Windows 文件重写锁容错 · 独立代码审查 Round 4 报告

> **审查日期**：2026-09-18
> **审查轮次**：Round 4（针对 Round 3 缺陷修复的增量复查）
> **被审 HEAD**：`d2e9bcb5be69fbc8f13a13a9c5473544f62d2f18`（`fix(feedback): resolve Round 3 review finding P3-1`）
> **基准提交**：`f5d33ae`（`docs: record feedback system Round 3 review PASS verdict in STATUS.md`）
> **审查范围**：全量 `git diff f5d33ae..d2e9bcb`（15 文件，+785/−26）；本轮修复增量 `5562ecc..d2e9bcb`（`src/` 2 文件 +26/−15，文档 4 文件）
> **判定结论**：**未通过**（0×P0，0×P1，**1×P2**，**1×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

已逐文件阅读全部变更（`src/app/globals.css`、`src/components/GameShell.tsx`、`src/i18n/dictionaries.ts`、`src/server/jsonl-file{.ts,.test.ts}`、`src/server/accounts.test.ts`、STATUS/INDEX/5 份 handoff），并核对调用链 `persist()→compactFile()→rewriteJsonlFile→atomicRenameSync`（`accounts.ts:294/316/323`、`game-records.ts:452/473/480`）。

通过项极简确认：①需求侧无遗漏 —— 独立核验新构建产物 `.next/server/app/{en,zh,fr,es,ru,ar}.html` 六个语种反馈链接**同时**渲染 `<svg>` 图标与 `.feedback-nav-label` 文本，`aria-label === 可见文本`（WCAG 2.5.3 全达标），`ar` 为 `<html lang="ar" dir="rtl">`，新增 CSS 规则零硬编码 `left/right`；②本地门禁独立复跑全绿 —— `npm test` 连跑 **3/3 全绿**（35 套）、`npm run build` 18/18 页面、`npm run smoke:persistence -- http://127.0.0.1:3111`（干净端口、自带起服）**5/5 场景通过**；③守门有效性经 **5 组变异探针全部变红**（默认 `2→1`、默认 `2→3`、白名单剔 `EPERM`、忙等替身替换 `Atomics.wait`、删 temp 清理）；④「彻底杜绝 CPU 忙等」经独立定量确认闭环：持续 EPERM 下 200 次 `atomicRenameSync` 墙钟 3099ms / CPU 占用 **0.00%**（挂起线程，非空转）。

---

## 二、审查发现与缺陷清单

### P2-1 默认 `maxAttempts=2` 把瞬态锁恢复窗口腰斩至实测 ≤17.8ms，交接单声称的「20ms 释放锁仍可恢复」实测 0/5

- **文件与行号**：
  - `src/server/jsonl-file.ts:88`（`const maxAttempts = Math.max(1, options?.maxAttempts ?? 2);`）、`:99`（`sleep(5);`）
  - `src/server/jsonl-file.test.ts:142-166`、`:169-195`
  - 声明出处：`docs/handoff/2026-09-18-feedback-button-label-round3-remediation-handoff.md:21`、`STATUS.md:35`、`docs/handoff/INDEX.md:18`
- **触发条件**：目标 JSONL 文件被外部进程（Windows Defender 扫描 / OneDrive 索引）在 rename 时刻持有句柄 ≥16ms，且 `rewriteJsonlFile` 走默认重试参数（生产唯一调用点 `jsonl-file.ts:115` 不传 options）。
- **实际行为**：
  - 注入 `renameFn` 记录两次尝试的时间戳（n=60）：尝试 1 → 尝试 2 的间隔 = **min 11.54 / p50 15.09 / p90 15.96 / max 17.84ms**；即持锁超过 ~17.8ms 时，末次尝试已在持锁期内耗尽，**不存在任何后续重试**。
  - 外部 holder 子进程 busy-spin 精确释放（每档 5 次，`atomicRenameSync` 实测）：释放 **16ms → 1/5**、**18ms → 1/5**、**20ms → 0/5**、**24ms → 0/5**、**30ms → 0/5** 恢复落盘。
  - 同探针下**修复前**的默认值 `maxAttempts=3`（即 `5562ecc` 状态）：释放 **12/14/16/18/20/24ms → 5/5**、**30ms → 4/5** 全部恢复。
- **期望行为**：Round 3 修复交接单 §1.1 明确声称「瞬态文件锁（20ms 释放）场景下，第 2 次重试成功恢复落盘（`recovered: true`），瞬态锁自愈容错能力完全保留」；验收标准 4 要求「瞬态锁可成功恢复」。
- **根因**：单次 5ms `Atomics.wait` 被 Windows 15.625ms 定时器粒度向上量化（本轮独立实测 `Atomics.wait(buf,0,0,5)` n=40：min 7.88 / p50 15.18 / max 22.06ms）⇒ **恢复窗口 ≡ (maxAttempts − 1) × ~15.1ms**，与"停顿 ≈ (maxAttempts − 1) × ~15.4ms"是同一个量。把默认 `3` 降到 `2` 在把停顿减半的同时**必然**把窗口减半；交接单以单次采样（不可复现）断言"恢复语义未丢"，属未经验证的声明。**在同步 `Atomics.wait` 语义下不存在同时满足「停顿 < 20ms」与「窗口 > 20ms」的 `maxAttempts` 取值**（`maxAttempts=1` 窗口为 0；`=2` 窗口 ~15ms；`=3` 窗口 ~30ms 但停顿 ~30ms）。
- **影响范围**：`src/server/online-server.ts` 单进程同时托管 Next.js 与 Socket.IO，`persist()→compactFile()` 在请求/心跳线程同步执行。窗口由 ~31ms 缩到 ~15ms 意味着**真实 Defender/OneDrive 数十毫秒量级的短暂占用从"被静默吸收"退回"压缩失败"**，而每次失败仍要付出 ~15.4ms 全服冻结；同时重试耗尽后的抛出概率相对上一版明显上升（抛出路径见 §三-1）。
- **复现方法 / 运行证据**：
  1. 窗口大小（确定性，无外部进程）：`atomicRenameSync(a,b,{ renameFn: 记录 hrtime 后抛 EPERM })`，取两次调用时间差，n=60 → `p50 15.09ms / max 17.84ms`。
  2. 恢复语义（真实锁）：holder 子进程 `openSync(dest,"r")` → 打印 `HELD` → busy-spin 到目标毫秒后 `closeSync`；父进程据此调用被测函数，取 5 次 → 上表数据（16ms 起断崖式失效）。
  3. 对照：同一探针把 `maxAttempts` 显式设为 `3` → 24ms 档 5/5 恢复，证明差异由本轮默认值改动引入，而非环境。
- **修复建议**：把锁等待**移出主线程**，不要再在同步路径上堆 `maxAttempts`。两条可选路径：
  - **方案 A（推荐）**：请求线程零休眠 —— `rewriteJsonlFile` 内不再同步重试（`maxAttempts=1`，失败 rename 单次实测 p50 2.17ms），失败时**保留** `.compact.tmp` 并把"重新压缩"交给事件循环（`setTimeout(~50ms)` 起的 2~3 次异步退避，或按 `setImmediate`/定时器队列串行化同一文件的压缩任务）；append 日志本身是数据真值源，压缩延后不影响完整性，`compaction.reset()` 的记账需同步调整为"待完成/已完成"两态。这样单次 persist 墙钟回到未加锁基线（无锁 p50 5.06ms），且恢复窗口可由退避次数自由放大到数百毫秒。
  - **方案 B（保底，仅口径对齐）**：若坚持同步语义，则必须把验收线改写为实测可达口径（如「空闲 p90 ≤ 20ms」）并在 docstring/STATUS/INDEX/handoff 明确写出「单次 `Atomics.wait` 实付 ≈15.1ms，窗口 ≡ (maxAttempts−1)×15.1ms，无法同时满足停顿 <20ms 与窗口 >20ms」，同时就"要低停顿还是要长窗口"取得用户明确取舍。
- **修复后验收标准**：①外部 holder 释放 **20ms 与 30ms** 两档各 ≥5/5 恢复落盘（异步通道可放宽到 ≤50ms 档仍 ≥5/5）；②请求线程在该场景下的同步停顿回到无锁量级（p99 < 10ms）；③"持续占用安全失败、旧文件不损坏、无 `.compact.tmp` 残留、CPU 0%"四项不变；④交接单不再出现未经重复采样验证的"恢复语义未丢"类断言，修复文档需附**脚本化可复现**的测量命令与样本量。

### P3-1 「事件循环停顿 < 20ms」与「单次休眠 ~11-16ms」的声明与放宽采样实测不符（空闲首超 20ms，饱和下上界完全失效）

- **文件与行号**：`src/server/jsonl-file.ts:76-80`（docstring：`measured ~11-16ms real elapsed time`、`bounding event-loop stall to < 20ms on idle systems`）；同 P2-1 的三处文档声明出处。
- **触发条件**：空闲系统（无 CPU burner）下对同一文件持续 EPERM，重复采样 `rewriteJsonlFile` 端到端墙钟。
- **实际行为**：
  - 空闲 n=120（独立进程、单轮）：**p50 15.44 / p90 16.55 / max 30.9ms，>20ms 占 5/120（4.2%）**。
  - 同口径另两轮 n=120：**p90 25.12 / max 40.36ms（15/120 = 12.5%）**、**p90 26.44 / max 145.61ms（20/120 = 16.7%）**。
  - 6 核机器挂 6 路 CPU burner 饱和（n=40）：**min 15.90 / p50 133.43 / p90 549.04 / max 1337.94ms**。
  - 单次休眠本身 n=40：**p50 15.18 / max 22.06ms**（已越 20ms）。
- **期望行为**：docstring 的 `bounding event-loop stall to < 20ms on idle systems`，以及 round3 修复交接单 §1.1/§1.2 的「空闲基线下**严格达成** < 20ms 验收红线」「单次微休眠实测耗时约为 11~16ms」。
- **根因**：同 P2-1 的定时器量化 —— 单次请求 5ms 实付 ~15.2ms，且**在空载下亦会出现跨 2 个时钟中断（≥31.25ms）的尾部分布**；docstring 与交接单的数值来自单次/极少数采样，未覆盖分位数与尾部，故"11~16ms""严格达成"两头都不成立（实测下限 12.1ms、上限 30.9~40.4ms 都已在区间外）。
- **影响范围**：验收标准 4 的「停顿预算实测有界受控（<20ms）」作为**绝对上界**不成立；文档口径错误会让后续轮次反复以"已达成"结案。
- **复现方法 / 运行证据**：`rewriteJsonlFile(dest, [...])` 前置 `openSync(dest,"r")` 持锁，`hrtime` 逐次计时，n≥120 统计分位数与 >20ms 计数（本轮 3 次独立运行数据见上）。
- **修复建议**：随 P2-1 的方案取向一并落定 —— 若采纳方案 A（异步退避），停顿预算应改写为"无锁路径 p99 < 10ms，锁等待在事件循环外完成"；若采纳方案 B，则把 docstring 与三处文档改为分位数口径（如「空闲 p50 ≈15.4ms、p90 ≈16.6ms，尾部可达 ~31ms；饱和负载下无上界」），并删除"严格达成 < 20ms"「有界控制在 < 20ms」等绝对化表述。
- **修复后验收标准**：docstring 与 STATUS/INDEX/handoff 中的停顿数值与修复后实测分位数逐项一致；交接单给出可复现的采样命令与 n 值；不再存在任何形式的"绝对上界"承诺，或存在且有 n≥120 实测分位数背书。

---

## 三、待确认风险与未验证项

1. **（有代码路径依据，本轮未端到端验证）重试耗尽后的抛出路径无兜底**：`rewriteJsonlFile` 在重试耗尽时 `throw`（`jsonl-file.ts:116-123`），该异常沿 `compactFile()→persist()` 上行至 `src/server/online-server.ts:27` 的 `handleAccountApi(request, response)` —— 该调用点与整个 HTTP 入口均**无 try/catch**，全仓亦无 `process.on("uncaughtException")` 兜底，因此同步抛出会升级为进程级未捕获异常（单进程内 Next.js + Socket.IO 同时受影响）。该路径自 Round 1 起即存在，本轮改动使其触发域由"持锁 >~31ms"扩到"持锁 >~15ms"。未做端到端造锁验证的原因：需触发压缩阈值（注册接口受 5 次/10 分钟限流保护）。建议修复方在 P2-1 落地时顺带明确该异常的兜底归属（catch 后降级为"本次压缩跳过"）。
2. **非阻断建议（不计入 P0~P3，不阻断复审）**：
   - `options.maxAttempts` 传入 `NaN` 时 `Math.max(1, NaN) === NaN`，`for` 循环零次迭代 ⇒ 既不执行 rename 也不抛错（实测 `renamed=false, threw=false`），静默跳过压缩。当前唯一生产调用点不传 options，故不可达；可考虑在循环后补一个防御性 `throw`。
   - round3 修复交接单 §3「双智能体审查指引」中的 `HEAD_SHA` 写作 `68403a4`，该提交是 amend 前的孤儿提交（`git merge-base --is-ancestor 68403a4 HEAD` 为假），实际交付为 `d2e9bcb`（两者内容仅差该行本身），建议回填。

---

## 四、推荐修复顺序与复审验收标准

1. **P2-1（设计取舍，必须先定方案）**：与用户就"低停顿 vs 长恢复窗口"取得明确结论；推荐方案 A（锁等待移出请求线程，异步退避 + `.compact.tmp` 保留重排），落地后 `maxAttempts` 同步重试可整体移除。
2. **P3-1（文档与指标口径）**：随方案 A/B 定稿同步改写 `jsonl-file.ts:76-80` docstring 与 STATUS/INDEX/round4 交接单中的停顿、窗口、休眠三组数值，全部按分位数给出并附采样命令与 n。
3. **非阻断建议项**（NaN 防御、SHA 回填）可一并处理。

**复审验收标准**：①20ms 与 30ms 释放档位恢复 ≥5/5、持续占用仍安全失败且无 temp 残留、CPU 忙等仍为 0%；②请求线程同步停顿回到无锁量级（p99 < 10ms）或按新口径给出 n≥120 的分位数实测（两者择一，写清口径）；③文档与代码数值逐项一致，无绝对化断言；④`npm test`（含新增确定性断言与保留的 5 组变异探针全红）、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`npm run smoke:persistence`（干净端口）全绿；⑤round4 修复交接单需给出可复现的探针脚本与原始采样数据。

---

**审查依据提交**：本报告提交于 `d2e9bcb` 之上的文档提交（仅含本报告与 STATUS.md / INDEX.md 更新，不含产品代码或测试改动）。
