# 反馈入口按钮文字标签 + Windows 文件重写退避重试 · 第 3 轮独立审查交接单

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`0398bdc fix(feedback): resolve Round 2 review findings P2-1, P3-1`；**基准** `f5d33ae`；**实际审查范围** 全量 `f5d33ae..0398bdc`（13 文件），增量重点 `57a73f1..0398bdc`（`src/` 4 文件 +30/−26，其余为审查/交接文档）；`git pull --ff-only` 已最新，工作区干净，`HEAD == 0398bdc` 一致。
- **通过项（极简）**：6 语种生产预渲染产物中 `aria-label` 与 `.feedback-nav-label` 可见文本**逐语种完全相等**（`ar` 为 `dir=rtl`，新增 CSS 块零硬编码 `left`/`right`）；删除 zh 一条 `navLabel` 后 `tsc` exit=2 且 `dictionaries.test.ts` 变红（多语种守门有效）；四道门禁独立复跑全绿（tsc 0 / lint 0 错误 0 警告 / build 18/18 / `smoke:persistence` 干净端口 5/5）；`npm test` **连跑 10 次 10/10 全绿**（35 套 / 335 例），并额外在 6 路 CPU 饱和下 4/4 全绿；**4 组变异探针全部变红**；真实 EPERM 端到端：无锁 4ms、20ms 释放成功恢复落盘、持续占用安全抛 `EPERM` 且旧数据完好无 temp 残留、200 次调用 CPU 占用 **0.76%**（CPU 忙等确已彻底消除）。
- **判定未通过**：0×P0 / 0×P1 / 0×P2 / **1×P3**。

---

## 二、审查发现与缺陷清单

### P3-1 第 2 轮 P3-1 的修复验收线（EPERM 停顿 < 20ms）仍未达成；本轮唯一功能改动对真实停顿零收益，替换新写入的 docstring 断言语义亦被实测证伪

- **文件与行号**：`src/server/jsonl-file.ts:73-81`（本轮新写入的 docstring）、`:87`（`Math.max(1, options?.maxAttempts ?? 3)`）、`:98`（`sleep(5)`）。声明出处：`docs/handoff/2026-09-18-feedback-button-label-round2-remediation-handoff.md:52-57`、`STATUS.md:26`、`docs/handoff/INDEX.md`。
- **触发条件**：Windows 下目标文件被占用返回 `EPERM`/`EBUSY` 且锁在重试窗口内未释放 —— 本机用外部子进程 `openSync(dest, "r")` 持句柄即可确定性制造（只读句柄亦 `EPERM`；数据目录位于 OneDrive 同步目录，正是该逻辑声明要覆盖的场景）。
- **实际行为**（三个层次，均有独立探针证据）：
  1. **停顿仍为 30~35ms，第 2 轮明示的 `< 20ms` 验收线未达成**：`atomicRenameSync({maxAttempts:3})` 真实 rename + 真实 `Atomics.wait`、外部进程持锁 5s → **30.3ms**；`rewriteJsonlFile` 端到端 → **33ms / 35ms**；200 次连续调用平均 **30.77ms**（`performance.now()` 计量）。
  2. **本轮唯一功能改动 `sleep(5 * attempt)` → `sleep(5)` 对真实停顿无任何压缩作用**：Windows 15.625ms 定时器粒度把 5ms 与 10ms 请求一并向上量化（实测每次均 ~15.2~15.6ms），故交付文档所称「消除线性乘积累加」不成立。修复前第 2 轮实测 30.5ms，修复后 30.77ms —— 请求预算由 15ms 降到 10ms，真实停顿**分毫未减**。本轮实质只改了注释与文档。
  3. **docstring 新写入的 `strictly bounding total synchronous pause to ~30-36ms` 在负载下被证伪**：同一代码路径在 6 路 CPU 饱和下 40 次采样为 `min 36 / p50 83 / p90 136 / max 170ms`（空闲同口径为 `min 22 / p50 31 / max 33ms`），超出文档标称上界约 5 倍。即该硬性上界只在空闲画像下成立。
- **期望行为**：达成第 2 轮明示的「强制 EPERM 下事件循环最大停顿 < 20ms」，或由实现者给出**经实测支撑**的重新定线依据并在文档中如实标注负载相关性；代码注释不得出现被自身实测证伪的绝对化上界措辞。
- **根因**：`maxAttempts` 默认 3 ⇒ 2 次睡眠，而 Windows 上每次请求 5ms 实付 ~15.6ms，单次「请求预算」（10ms）与「真实停顿」（~31ms）始终相差约 3 倍；修复者只按请求值（`sleeps` 数组求和）推断停顿，未对真实停顿做前后对比实测，因此未发现改动零收益。
- **影响范围**：`src/server/online-server.ts` 单进程同时托管 Next.js 与 Socket.IO，`accounts.ts`/`game-records.ts` 的 `persist()→compactFile()→rewriteJsonlFile()` 均在请求线程同步执行 ⇒ 一次持续锁占用即冻结全服 30~35ms（空闲）/ 最高约 170ms（CPU 饱和）。属**有界**回归（远小于第 1 轮的 697ms，且 CPU 忙等已彻底消除），压缩受阈值门控非每次写入触发，故定为 P3。
- **复现方法 / 验证证据**（探针置于仓库外 `%TEMP%\gomoku-review-r3\`，未污染仓库，收工 `git status --porcelain` 为空）：

  ```
  # 真实持锁进程 + rewriteJsonlFile 端到端（probe-eperm2.mts）
  {"label":"(c) no lock -> baseline","elapsedMs":4,"thrown":null,"tempLeft":false}
  {"label":"(a) lock released after 20ms","elapsedMs":35,"thrown":null,"contentAfter":"fresh","tempLeft":false}
  {"label":"(b) lock held 5000ms","elapsedMs":33,"thrown":"EPERM","contentAfter":"old","tempLeft":false}

  # CPU 占用与平均停顿（probe-cpu.mts，200 次调用）
  {"calls":200,"wallMs":6153,"cpuUserMs":47,"cpuSystemMs":0,"cpuPct":0.76,"avgStallMs":30.77}

  # maxAttempts 对比（probe-tradeoff.mts，真实 sleep + 真实 rename）
  {"label":"held@5s maxAttempts=3","stallMs":30.3,"thrown":"EPERM"}
  {"label":"held@5s maxAttempts=2","stallMs":11.6,"thrown":"EPERM"}          <-- 达 <20ms 线
  {"label":"release@20ms maxAttempts=2","stallMs":23.6,"thrown":null}         <-- 恢复语义未丢

  # 该路径耗时分布（probe-assertion-dist.mts，40 次采样）
  {"phase":"idle","min":22,"p50":31,"p90":32,"max":33}
  {"phase":"6x cpu burners","min":36,"p50":83,"p90":136,"max":170}
  ```
- **修复建议**：①最小改动 —— 默认 `maxAttempts` 由 3 降为 2（本机实测停顿 **11.6ms < 20ms**，且 20ms 释放场景仍可成功恢复，见上表）；或 ②按其第 2 轮建议②改真异步退避（`await new Promise((r) => setTimeout(r, ms))`，`rewriteJsonlFile`→`compactFile`→`persist` 转 `async`），可同时兼顾「低停顿」与「更长重试窗口」。无论选哪条，均须把 `:73-81` docstring 的数值改为**实测值**并去掉 `strictly bounding` 的绝对化措辞（注明该值与 CPU 负载相关）。
- **修复后验收标准**：强制 `EPERM` 下事件循环最大停顿 **< 20ms**（须附**空闲**与 **6 路 CPU 饱和**两组实测输出）；20ms 释放锁可成功恢复落盘、持续占用安全抛错、无 `.compact.tmp` 残留、CPU 占用 ~0% 四项不回归；docstring 数值与实测一致。

---

## 三、待确认风险与未验证项

- **待确认风险（不计为缺陷）**：`src/server/jsonl-file.test.ts:192` 仍保留一处墙钟断言 `expect(elapsed).toBeLessThan(300)`。该上界系第 2 轮审查**自行建议**（原话「宽上界（如 < 300ms）」），故按防漂移规则不新立缺陷；但其操作数本机实测为空闲 `p50 31ms`、6 路 CPU 饱和 `p50 83 / max 170ms`，观测余量仅约 1.8 倍。若在更重负载画像下运行仍可能偶发假红（本机 10 次常规 + 4 次 6 路饱和均未复现）。**非阻断建议**：既然 `waitSpy`（`toHaveBeenCalledTimes(2)` + `toHaveBeenNthCalledWith(..., 5)`）已确定性守住休眠路径，该墙钟断言可删除或保留为宽守卫，二者均可接受。
- **未验证：外部进程（OneDrive / Defender / 索引器）释放文件锁的时间分布** —— 本机仅证实「有句柄即 `EPERM`」为确定性行为，未量化真实释放延迟，故**无法给出重试窗口的合理长度**（沿用前两轮残余风险）。这也是本条 P3 建议「压缩预算」而非「加大预算」的原因。
- **未验证：`npm run verify:online` / `smoke:lobby` / `smoke:matchmaking`** —— 本轮未改动房间/大厅/匹配代码，`atomicRenameSync` 仅由 accounts 与 game-records 的持久化路径调用，风险低。
- **非缺陷建议（不计入分级）**：`docs/handoff/2026-09-18-feedback-button-label-round2-remediation-handoff.md:85` 的「待审提交 (HEAD_SHA)」仍为占位文字「本轮修复提交」，未回填 `0398bdc`（本轮已回填 round1 交接单的同名占位，round2 自身遗漏；纯文书细节）。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**：本轮仅 1 项 P3，单独处理即可。

1. **P3-1**：把默认 `maxAttempts` 降为 2，或改异步退避；同步修正 `src/server/jsonl-file.ts:73-81` docstring（去绝对化措辞 + 与实测对齐）。
2. 重跑四道门禁 + 干净端口 `smoke:persistence`，再派发 Round 4。

**复审验收标准**：

- 强制 `EPERM` 下事件循环最大停顿 **< 20ms**（附**空闲**与 **6 路 CPU 饱和**两组实测输出）；
- 瞬态释放恢复落盘 / 持续占用安全抛 `EPERM` / 无 `.compact.tmp` 残留 / CPU 占用 ~0% 四项不回归；
- `npm test` 连跑 10 次全绿，且 4 组变异探针（剔 `EBUSY` / 删 temp 清理 / `maxAttempts` 默认改 1 / 忙等替身）仍全部变红；
- 6 语种生产预渲染产物 `aria-label === 可见文本`、`ar` RTL、零硬编码 `left`/`right` 不回归；
- `smoke:persistence` 干净端口 5/5 通过；代码注释与交付文档中的停顿数值与实测一致。
