# 反馈入口按钮文字标签 + Windows 文件重写锁容错 · 第 2 轮独立审查交接单

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`57a73f1 fix(feedback): resolve Round 1 review findings P2-1, P3-1, P3-2`；**基准** `f5d33ae`；**实际 diff 范围** `f5d33ae..57a73f1`（10 文件，+417/−9，含 Round 1 审查文档）；工作区干净，`HEAD == 57a73f1` 一致（`git pull --ff-only` 首跑遇 SSH `Connection ... aborted`，改用 `git ls-remote` 确认远端 `main` 亦为 `57a73f1`，本地无落后）。
- **需求实现无遗漏**：生产构建产物的 6 个预渲染 HTML（`.next/server/app/{en,zh,fr,es,ru,ar}.html`）中，反馈链接 `aria-label` 与 `.feedback-nav-label` 可见文本**逐语种完全相等**（en/zh/fr/es/ru/ar 全真），`title` 仅作悬浮提示保留；新增 CSS 零硬编码 `left`/`right`，`ar` 为 `dir="rtl"`；`navLabel` 6 语种齐全，`dictionaries.test.ts` 3 项断言实测通过。
- **Round 1 P3-1 / P3-2 确属真闭环（非表面完成）**：3 组变异探针（白名单剔除 `EBUSY` / 删除 temp 清理 / `maxAttempts` 默认值改 1）全部使 `jsonl-file.test.ts` 变红（1 failed、1 failed、2 failed）；a11y 改用**生产预渲染产物**逐语种核验（未采信原实现者描述）。
- **重试语义本身真实生效（独立端到端，非 mock）**：外部进程持有目标文件句柄后 —— (a) 20ms 释放 → 重试恢复、新内容落盘、无残留 temp；(b) 持续占用 → 抛 `EPERM`、**旧文件内容未被破坏**、`.compact.tmp` 已清理；(c) 无锁 → 单次 rename，无 temp。
- **门禁**：`tsc` 0 错误 / `lint` 0 错误 0 警告 / `build` 18/18 页面 SSG 全绿；`npm run smoke:persistence`（干净端口）5/5 场景通过。**但 `npm test` 不满足"100% 通过"**（见 P2-1）。
- **判定未通过**：0×P0 / 0×P1 / **1×P2 / 1×P3**。

---

## 二、审查发现与缺陷清单

### P2-1 新增时序守门用例在全量 `npm test` 下不稳定变红，验收标准 6「四道门禁全绿」不可复现

- **文件与行号**：`src/server/jsonl-file.test.ts:169-188`（断言在 `:187 expect(elapsed).toBeLessThan(40)`）；被测实现 `src/server/jsonl-file.ts:61-65`（`sleepSync`）、`:96-98`（`sleep(5 * attempt)`）。
- **触发条件**：任一次全量 `npm test`（35 套并行，vitest 默认按 CPU 数开 worker 池；本机 6 核）在 worker 被抢占的窗口内执行该用例。单跑该文件（`npx vitest run src/server/jsonl-file.test.ts`）恒绿（10/10，实测 3 次）。
- **实际行为**：本机连续 10 次全量 `npm test` 中 **2 次红、8 次绿**（红均出现在会话最早期两次运行）：

  ```
  第 1 次  exit=1  AssertionError: expected 54  to be less than 40
  第 6 次  exit=1  AssertionError: expected 143 to be less than 40
  其余 8 次 exit=0（334/334 通过）
  ```

  即 STATUS.md / 修复交接单声明的「35 套 / 334 项用例 100% 通过」在本机不可稳定复现。
- **期望行为**：门禁用例在目标平台（Windows）**确定性**通过；或至少其上界显著高于真实代价分布。当前上界与该用例的合格实现代价之间余量不足 10ms（见下）。
- **根因**（两层，均有独立探针证据）：
  1. **余量不足**：该重试路径的真实代价实测 **p50 = 30.5ms**（`sleep(5)`+`sleep(10)`），而断言上界仅 40ms。根因是 `Atomics.wait` 的休眠粒度受 Windows 默认系统定时器分辨率支配 —— 探针 `atomicwait-granularity.mjs`（node v25.8.0 / win32 10.0.19044，各 40~60 采样）：

     ```
     Atomics.wait(5ms)   min=10.94 p50=15.26 p90=16.03 max=17.00
     Atomics.wait(10ms)  min=12.14 p50=15.20 p90=16.99 max=23.59
     请求 5+10=15ms 的实测总耗时 = 30.67 (p50) / 33.01 (max)
     ```
  2. **高负载下墙钟膨胀**：`contention-probe.mjs`（worker 线程内测量，6 核机器）—— 空闲 `p50=30.5 max=32.1`；挂 6 个 CPU burner 后 `p50=31.3 **p90=48.6 max=51.3**`。即**上界 40ms 本身就低于 CPU 饱和时的典型分布**，vitest 的并行 worker 池恰好构成该饱和场景；观测到的 54ms / 143ms 即由此产生。
  - 深层：该用例的耗时不是确定性常量，同时被「系统定时器粒度（其他进程可临时改变）」「线程被抢占」两个外部因素支配，属于**本质上不适合做墙钟断言**的对象。
- **影响范围**：门禁 3 变为随机假红 —— 任何以「四道门禁全绿」为前提的交付/复审判定与 CI 复跑都可能被无理由阻断（本轮 2/10）。次生风险：若为消除 flake 而放宽或删除该用例，将立刻回退到 Round 1 P3-1 的「重试逻辑零守门」状态（该用例是当前唯一守门）。
- **复现方法 / 验证证据**：探针均置于仓库外（`%TEMP%\gomoku-review-r2\`，未污染仓库，收工 `git status --porcelain` 为空）。
  - `npm test` × 10（日志 `test-run-*.log`）→ 2 红 8 绿，红值为 54 / 143。
  - `node atomicwait-granularity.mjs`、`node contention-probe.mjs` → 上述两段输出。
- **修复建议**（推荐 ①）：
  ① **改为确定性断言**（零 flake）：注入 `sleepFn` 记录休眠参数，断言 `attempts === 3`、`sleeps === [5, 10]`（与 `:142-167` 用例同构）；墙钟只保留一个**宽**上界（如 `< 300ms`）用于捕获「忙等回归」这一量级（Round 1 的 697ms 仍会被捕获），并补一条「实现未使用 CPU 忙等」的守门（例如断言 `sleepFn` 被调用而非空转，或对 `Atomics.wait`/`setTimeout` 做 spy）。
  ② 若坚持墙钟断言，上界须取实测分布的数倍（本机高负载 max 51.3ms ⇒ 至少 300ms），但该阈值已无法守住 Round 1 的 <20ms 目标，故不推荐单独采用。
- **修复后验收标准**：`npm test` **连续 10 次全绿**（附 10 次摘要）；注入「恢复 675ms 忙等」变异后该用例仍变红；注入 `maxAttempts` 默认值改 1 的变异后仍变红（不回退 Round 1 P3-1）。

### P3-1 重试路径真实同步停顿 ~30ms，与代码注释及三处交付文档声明的「≤15ms／远低于 20ms 门限」不符，未达 Round 1 自设的 <20ms 修复验收线

- **文件与行号**：`src/server/jsonl-file.ts:63-65`（`sleepSync`）、`:96-98`（`sleep(5 * attempt)`）、`:73-80`（docstring「`blocking the event loop for more than ~15ms total`」）；声明出处：`docs/handoff/2026-09-18-feedback-button-label-round1-remediation-handoff.md:15`、`STATUS.md:37`、`docs/handoff/INDEX.md:19`。
- **触发条件**：Windows 下目标文件被占用返回 `EPERM`/`EBUSY` 且锁在重试窗口内未释放 —— 本机用 `openSync(dest, "r")` 即可确定性制造（只读句柄亦 EPERM）；数据目录位于 OneDrive 同步目录，正是该逻辑声明要覆盖的场景。
- **实际行为**：单次 `rewriteJsonlFile` 在持续 `EPERM` 下**同步占用 34.86ms**，期间 10ms 采样器零次获得执行、30ms 短定时器一次未触发：

  ```
  {"label":"(b) lock held 5s -> all retries exhausted","elapsedMs":34.86,"thrown":"EPERM",
   "contentAfter":"{\"id\":\"old\"}|","tempLeft":false,
   "maxEventLoopGapMs":34.89,"shortTimerFiredDuringCall":false,"samplerTicksDuringCall":0}
  ```
- **期望行为**：Round 1 为该缺陷设定的修复验收标准为「强制 EPERM 下事件循环最大停顿 **< 20ms**」；交付文档进一步声明「总睡眠预算严格控制在 ≤ 15ms（**远低于 20ms 门限**，绝不阻塞 Socket.IO 心跳与 HTTP 响应）」。实测 34.86ms 同时越过 15ms 与 20ms 两条线。
- **根因**：`Atomics.wait` 的休眠粒度被 Windows 默认系统定时器分辨率（15.625ms）支配 —— 实测 `Atomics.wait(5)` 实睡 **15.26ms(p50)**、`Atomics.wait(10)` 实睡 **15.20ms(p50)**，两个「5ms/10ms」请求各自被向上取整到约 15.6ms，故「请求预算 15ms」的真实代价是 **~30.5ms**，被系统性低估约 2 倍；交付侧仅在 `elapsed < 40` 的宽阈值下看到"通过"（且该阈值本身还不稳定，见 P2-1），未察觉真实预算已翻倍并越过 20ms 线。
  （补充：Linux/macOS 定时器粒度通常为 1ms，`Atomics.wait(5)` 实睡约 5ms ⇒ 本项**只在 Windows 暴露**，与任务的 Windows 定位一致，但也意味着它不会被非 Windows CI 捕获。）
- **影响范围**：`src/server/online-server.ts` 单进程同时托管 Next.js 与 Socket.IO，`accounts.ts:307→316→323`、`accounts.ts:477→481→488`（访客会话）、`game-records.ts:464→473→480` 的 `persist()→compactFile()` 均在请求线程同步执行 ⇒ 一次持续锁占用即冻结全服约 30~35ms（相对基线"单次 rename 快速失败"约 5ms，属约 30ms 的**有界**回归）；压缩受阈值门控，非每次写入触发，故频率有限。结论：Round 1 P2-1 属**部分闭环** —— CPU 忙等已彻底消除 ✅、白名单已收敛为 EPERM/EBUSY ✅、停顿有界 ✅，但**未达成其自设的 <20ms 验收线** ❌。
- **复现方法 / 验证证据**：`probe-rewrite.mts`（tsx 直连仓库源码，外部 holder 进程持句柄），三条路径输出：

  ```
  {"label":"(c) no lock -> single rename baseline","elapsedMs":5.64,"thrown":null,"tempLeft":false}
  {"label":"(a) lock released after 20ms -> should recover","elapsedMs":23.90,"thrown":null,"tempLeft":false}
  {"label":"(b) lock held 5s -> all retries exhausted","elapsedMs":34.86,"thrown":"EPERM","tempLeft":false}
  ```
- **修复建议**：把真实预算压回 20ms 以内 —— ①最小改动：`maxAttempts` 保持 3 但把休眠数组降为单次 `sleep(5)`（Windows 上实睡 ≈15.6ms，总停顿 ≈16ms < 20ms），或直接把 `sleep(5 * attempt)` 改为固定 `sleep(5)`；②若确需多次退避，则必须改**异步**退避（`await new Promise(r => setTimeout(r, ms))`，`rewriteJsonlFile`→`compactFile`→`persist` 转 `async`，调用链均在 async 请求路径，改造成本可控），此时停顿不再阻塞事件循环；③无论选哪条，须把 `jsonl-file.ts:77-78` 的 docstring 与三处交付文档（remediation handoff / STATUS.md / INDEX.md）的数值改为**实测值**，避免再次以错误预算作为验收依据。
- **修复后验收标准**：强制 EPERM 下事件循环最大停顿 **< 20ms**（附 10ms 采样器 + 30ms 短定时器的实测输出，`shortTimerFiredDuringCall` 应为 true 或 gap < 20ms）；重试语义保持生效（外部进程 20ms 释放锁后可成功落盘，本轮已验证）；`npm test` 稳定全绿。

---

## 三、待确认风险与未验证项

- **未验证：外部进程（OneDrive / 杀软）释放文件锁的时间分布**。本机仅证实「有句柄即 EPERM」是确定性行为、且 20ms 释放可成功恢复，未量化真实释放延迟，因此**无法给出重试窗口的合理长度**（沿用 Round 1 残余风险）。→ 这也是 P3-1 的修复只应"压缩预算"而非"加大预算"的原因。
- **未验证：`npm run verify:online` / `smoke:lobby` / `smoke:matchmaking`**。本轮未改动房间/大厅/匹配代码，且 `atomicRenameSync` 仅被 accounts 与 game-records 的持久化路径调用，风险低。
- **环境提示（非缺陷，但会制造假红）**：本机 3000 端口存在一个 16:59 启动的**陈旧** `tsx src/server/online-server.ts` 进程（PID 52960，早于本轮 `npm run build`）。`tools/smoke-persistence.ts:193` 的 `isServerRunning` 会直接复用该进程，此时页面与新构建产物不匹配 → **S-A 稳定假红 3/3**；改用 `npm run smoke:persistence -- http://127.0.0.1:3111` 另起干净服务后 **5/5 全通过**。跑烟测前建议确认 3000 端口无陈旧进程。（未终止该进程，避免影响既有会话。）
- **未验证：P2-1 的 flake 频率在其他负载画像下的取值**。本机 10 次观测为 2 红，红值 54ms / 143ms；受机器负载影响，频率可能偏离，但"上界 40ms 不足 10ms 余量"的结构性缺陷与负载无关。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**（P2-1 与 P3-1 同源，建议一并处理）：

1. **P2-1** 把 `jsonl-file.test.ts:169-188` 改为确定性断言（`sleepFn` 注入 + 断言 `[5, 10]` + `attempts===3`），墙钟上界放宽到仅能捕获忙等量级（≥300ms），并保住 Round 1 P3-1 的守卫力。
2. **P3-1** 将真实停顿压到 <20ms（推荐固定单次 `sleep(5)`，或改异步退避），同步修正 `jsonl-file.ts:77-78` docstring 与三处交付文档的数值。
3. 二者完成后重跑门禁 + 干净端口烟测，再派发 Round 3。

**复审验收标准**：

- `npm test` **连续 10 次全绿**（附 10 次摘要），且 3 组变异（白名单剔除 EBUSY / 删除 temp 清理 / `maxAttempts` 默认值改 1）后仍**全部变红**；
- 强制 EPERM 下事件循环最大停顿 **< 20ms**（附采样器 + 30ms 短定时器实测输出），且锁释放后可成功恢复落盘的语义不回归；
- 6 语种（en/zh/fr/es/ru/ar）生产预渲染产物中 `aria-label === .feedback-nav-label` 可见文本（回归确认，本轮已通过）；
- `npm run smoke:persistence`（**干净端口**）5/5 通过；
- 代码注释与交付文档中的睡眠预算数值与实测一致。

---

### 附：非缺陷建议（不计入分级）

- `docs/handoff/2026-09-18-feedback-button-label-round1-remediation-handoff.md:53` 的「待审提交 (HEAD_SHA)」仍为占位文字「本轮修复提交」，未回填 `57a73f1`（与 Round 1 对 feature handoff 的同类建议一致，纯文书细节）。
- `src/server/jsonl-file.ts:90` 的循环在 `maxAttempts <= 0` 时会直接落空返回（既未 rename 也不抛错，调用方会误判成功且残留 `.compact.tmp`）。该缺口自 Round 1 引入且本轮未触碰、仓库内无任何调用方传入该值，故按防漂移规则**不计入分级**；若顺手修复，一行 `Math.max(1, ...)` 即可。
