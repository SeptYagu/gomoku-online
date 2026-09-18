# 反馈入口按钮文字标签 + Windows 文件重写重试 · 第 1 轮独立审查交接单

## 一、审查基本信息与通过项简述

- **被审 HEAD**：`d317764 feat(ui): add text label to feedback button in navigation`；**基准** `f5d33ae`；**实际 diff 范围** `f5d33ae..d317764`（7 文件，+105/−2）；工作区干净，`git pull --ff-only` 已是最新，`HEAD == d317764` 一致。
- **需求实现无遗漏**：`navLabel` 已在 `FeedbackDictionary` 类型 + 6 语种补齐，真实浏览器实测 6 语种均渲染出图标与对应译文；新增 CSS 零硬编码 `left`/`right`，`ar` 下 `dir=rtl` 且图标镜像到文本右侧。
- **独立设计的边界验证**：真实无头 Chrome（CDP）跑 6 语种 × 2 视口（1265px / 360px）× 2 布局（含注入 `.table-shell` 复现 `≤640px` 的 `flex-wrap: nowrap` 分支）共 24 组，标签均 `painted=true`、页面与 `.top-actions` 横向溢出均为 `false`；`dictionaries.test.ts` 的扁平化键集/占位符/空值三断言确实能覆盖新增键。
- **四道门禁独立复跑全绿**：`tsc` 0 错误 / `lint` 0 错误 0 警告 / `vitest` 35 套 329 例 / `build` 18/18 页面 SSG。
- **判定未通过**：0×P0 / 0×P1 / **1×P2 / 2×P3**（详见第二节；本轮 diff 未新增任何测试，两项新增行为均无守门）。

---

## 二、审查发现与缺陷清单

### P2-1 `atomicRenameSync` 同步忙等阻塞共享事件循环，最长约 700ms 全进程冻结

- **文件与行号**：`src/server/jsonl-file.ts:61-76`（忙等 `while` 在 `:71`），调用点 `src/server/jsonl-file.ts:88`；上游同步调用链 `src/server/accounts.ts:294-334`（`persist`→`this.persist(...)` @`:172`/`:200`/`:393`/`:425`，含 `authenticate(token)` 鉴权路径）与 `src/server/game-records.ts:452-490`。
- **触发条件**：Windows 下 `renameSync(tempPath, filePath)` 因目标文件被占用返回 `EPERM`/`EBUSY`/`EACCES`，且在重试窗口内占用未释放。本机实测该错误码是**目标文件被任一进程持有句柄时的确定性结果**（含只读句柄），且本仓数据目录位于 OneDrive 同步目录内，属该重试逻辑自身声明要覆盖的高概率场景。
- **实际行为**：10 次尝试之间为纯 CPU 空转忙等，累计 `15×(1+2+…+9) = 675ms`；实测单次 `rewriteJsonlFile` 调用**同步占用 697ms**，期间 30ms 定时器一次都未触发、10ms 间隔的采样器一次都未获得执行机会（事件循环完全停摆），随后抛出 `EPERM`。
- **期望行为**：重试等待必须让出事件循环（或至少把停顿压到毫秒级）。`src/server/online-server.ts` 单进程同时托管 Next.js 与 Socket.IO，文件锁重试不得冻结 HTTP/WebSocket 服务。
- **根因**：在同步函数中用 `while (Date.now() - start < 15 * attempt) {}` 实现退避，属 CPU 忙等；`rewriteJsonlFile` 保持同步签名，而全部调用链都在请求处理线程上同步执行，故停顿直接落在服务主线程，波及所有在途请求、房间广播与心跳。
- **影响范围**：所有联机客户端在该窗口内无任何响应（延迟尖峰）；相对基线（单次 `renameSync` 快速失败，耗时 ~ms）属**明显延迟回归**；同时 100% 占满一个 CPU 核心。次生问题：`EACCES` 通常非瞬态（如目标只读），纳入重试只会把必然失败的调用拖长 675ms。
- **复现方法 / 验证证据**（临时探针，已置于仓库外临时目录，未污染仓库）：

  ```
  # 直接 import 真实模块，用句柄占住目标文件制造确定性 EPERM
  const held = openSync(dest, "r");           // 目标文件保持打开
  setInterval(sample, 10); setTimeout(30ms);
  t0 = Date.now(); rewriteJsonlFile(dest, [{id:"fresh"}]); elapsed = Date.now()-t0;
  ```

  实测输出：`{"elapsedMs":697,"thrownCode":"EPERM","maxEventLoopGapMs":0,
  "shortTimerFiredDuringCall":false,"destContentAfter":"old","tempLeftBehind":true}`
  —— `shortTimerFiredDuringCall=false` 与采样器零执行共同证明整段 697ms 内事件循环未被让出。

- **修复建议**：把退避改为非阻塞（`await new Promise((r) => setTimeout(r, delay))`），`rewriteJsonlFile` 改 `async`，`compactFile`/`persist` 随之改 `async`（调用方均位于 async 请求处理路径，改造成本低）；`atomicRenameSync` 同理改 async 或并入同一重试循环。若确需保留同步签名，退而求其次：把总等待预算压到 ≤ 数十毫秒，并用 `Atomics.wait` 替代忙等以免空转 CPU。同时建议把重试白名单收敛为 `EPERM`/`EBUSY`，不重试 `EACCES`。
- **修复后验收标准**：强制 EPERM 的重试路径下，事件循环最大停顿 < 20ms（10ms 采样器持续获得执行机会、30ms 定时器按约期触发）；重试语义仍生效（瞬态占用释放后可成功落盘且内容正确）；重试次数与总预算有明确上限；`npm run verify:online` / `smoke:*` 零回归。

### P3-1 新增的 Windows 重试容错零测试覆盖（删掉重试后全部门禁仍绿）

- **文件与行号**：`src/server/jsonl-file.test.ts:53-71`（唯一 rewrite 用例 `"rewrites the log in place and leaves no temp file behind"` 只走无障碍快乐路径）；被测实现 `src/server/jsonl-file.ts:61-76`。
- **触发条件**：任意一次 `npm test`；或把重试实现整体删除。
- **实际行为**：变异探针——将 `src/server/jsonl-file.ts:62` 的 `const maxAttempts = 10` 改为 `1`（等价于完全退回基线的单次 `renameSync`），`npx vitest run src/server/jsonl-file.test.ts` 仍 **5/5 全绿**；全仓测试对 `atomicRenameSync` 零引用（grep 零命中），全量 35 套 329 例中无任何用例能因重试被删除而变红。本次 diff 的 7 个文件亦未含任何测试文件。
- **期望行为**：验收标准 ④「Windows 下重试容错保护」应有一条能在重试逻辑缺失/失效时变红的用例。
- **根因**：现有 rewrite 用例仅在空闲临时目录中执行 rename，永远不会进入 `catch` 分支；本次交付只改产品代码、未补守门用例。
- **影响范围**：四道门禁对该新增行为**完全失明**——`maxAttempts`、错误码白名单、退避上限、甚至整段重试被删除或写错码，四绿都不会报警；验收标准 ④ 实际上无法由门禁证明。
- **复现方法 / 验证证据**：`sed -i 's/maxAttempts = 10/maxAttempts = 1/' src/server/jsonl-file.ts && npx vitest run src/server/jsonl-file.test.ts` → `Test Files 1 passed / Tests 5 passed`（探针后已按备份原样还原，`git status` 干净）。
- **修复建议**：新增用例，强制前 N 次 `renameSync` 抛 `EPERM`（可用 `vi.mock("node:fs")` 包装 `renameSync`，或按本报告手法用真实句柄占用目标文件），断言：①瞬态失败 N 次后最终成功、落盘内容逐字符正确、无残留 `.compact.tmp`；②超过重试上限时抛出且不静默丢数据。建议再加一条「重试期间事件循环未被阻塞」的断言（记录重试期间定时器回调时间戳），即可同时守住 P2-1 不复发。
- **修复后验收标准**：新用例在重试被移除或 `maxAttempts` 被改为 1 时**必须变红**；用例不依赖 Windows 平台特性，可在任意平台稳定通过。

### P3-2 可见标签与可访问名称不一致，zh/fr/ru 三语种违反 WCAG 2.5.3 Label in Name

- **文件与行号**：`src/components/GameShell.tsx:493`（`aria-label={feedbackDictionary.title}`）配合 `:496` 新增的可见文本 `<span className="feedback-nav-label">{feedbackDictionary.navLabel}</span>`；文案来源 `src/i18n/dictionaries.ts:495/744/993/1242/1491/1740`（`navLabel`）与 `:502/751/1000/1249/1498/1747`（`title`）。
- **触发条件**：任一语种访问顶部操作栏，且用户使用语音/声控（Speech Input）以可见文案呼唤该控件。
- **实际行为**：真实浏览器实测（AX 树 `Accessibility.getPartialAXTree` + `getComputedStyle`），6 语种可见文本 vs 可访问名称：

  | 语种 | 可见文本 (`navLabel`) | 可访问名称 (`title`) | 名称是否包含可见文本 |
  |---|---|---|---|
  | en | `Feedback` | `Feedback & Suggestions` | 是 |
  | zh | `意见反馈` | `用户反馈与建议` | **否** |
  | fr | `Commentaires` | `Retours et suggestions` | **否** |
  | es | `Comentarios` | `Comentarios y sugerencias` | 是 |
  | ru | `Обратная связь` | `Отзывы и предложения` | **否** |
  | ar | `الملاحظات` | `الملاحظات والاقتراحات` | 是 |

  `ar` 的 AX 取证：`{"role":"link","name":"الملاحظات والاقتراحات","description":"الملاحظات والاقتراحات"}` —— 名称取自 `aria-label`/`title`，而非可见标签。
- **期望行为**：带可见文本的控件，其可访问名称必须**包含**该可见文本（WCAG 2.5.3，Level A）。
- **根因**：新增可见标签后仍沿用改动前的 `aria-label={title}`（图标按钮时代无障碍、无冲突）；而 `title` 是比 `navLabel` 更长的描述性文案，二者不构成包含关系。
- **影响范围**：zh/fr/ru 三语种下声控用户无法用可见标签定位反馈入口（说「意见反馈」无响应）；纯读屏用户不受损（听到的描述反而更完整）。改动前不存在该问题，属本次新增的合规倒退。
- **复现方法 / 验证证据**：CDP 探针在 6 语种页面读取 `link.getAttribute('aria-label')` 与 `.feedback-nav-label.textContent` 并做包含判定，输出 `prefixOK=false`（zh/fr/ru）；`ar` 的 AX 名称如上。探针脚本位于仓库外临时目录，未入库。
- **修复建议**：改为 `aria-label={feedbackDictionary.navLabel}`（可访问名称 = 可见文本，`title` 继续承担悬浮提示），与 en/es/ar 现状自然一致；或反向让 `title` 以 `navLabel` 为前缀。推荐前者（改动最小、语义最直白）。
- **修复后验收标准**：6 语种 AX 名称均包含可见标签文本；`aria-label` 非空；RTL 与窄屏布局零回归。

---

## 三、待确认风险与未验证项

- **未验证：真实在线房间内的 `table-shell` 布局**。P2 相关的窄屏规则 `.table-shell .top-actions { flex-wrap: nowrap }`（`src/app/globals.css:2243-2249`）由我用「在已渲染页面注入 `.app-shell.table-shell`」的方式复现（该规则仅由该 class 门控，注入等价）；未真正进入联机房间复测。残余风险：低，不改变结论（实测 6 语种在 360px 下均零横向溢出）。
- **未验证：外部进程（OneDrive / 杀软）释放文件锁的时间分布**。本机仅证实「有句柄即 `EPERM`」是确定性行为，未量化真实释放延迟，因此无法给出「重试窗口需要多长」的建议值。残余风险：低 —— P2-1 的结论不依赖该分布（忙等本身即为缺陷）。
- **未验证：键盘 Tab 顺序与焦点环**。仓库无 jsdom，未做键盘遍历取证；本次改动未触碰交互逻辑与焦点管理，故未列为风险项。
- **非缺陷建议（不计入分级）**：`docs/handoff/2026-09-18-feedback-button-label-handoff.md` 的 `待审提交 (HEAD_SHA)` 仍为占位文字「本轮待提交的 commit」，未回填 `d317764`；属文书细节，不计缺陷，建议顺手补齐。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**（P2 优先，P3-1 与 P2-1 同一处代码，建议一并完成）：

1. **P2-1** 改非阻塞退避（`rewriteJsonlFile` → `async`，`compactFile`/`persist` 随之 `async`）；若保留同步签名则压缩预算并改用 `Atomics.wait`；同时收敛重试白名单为 `EPERM`/`EBUSY`。
2. **P3-1** 补重试守门用例（瞬态失败后成功 + 超限抛出 + 重试期间事件循环未被阻塞）。
3. **P3-2** `aria-label` 改 `navLabel`，6 语种 AX 名称包含可见文本。

**复审验收标准**：

- 四道门禁独立复跑全绿（`tsc` / `lint` / `npm test` / `npm run build`），且**新增用例在重试被删除时变红**（请附变异探针自证）。
- 强制 `EPERM` 下事件循环最大停顿 < 20ms（附 10ms 采样器 + 30ms 定时器的实测输出）。
- 6 语种（en/zh/fr/es/ru/ar）AX 名称均包含顶部操作栏可见标签文本，附 AX 树取证。
- 6 语种 × 窄屏（360px）/ 宽屏 + `.table-shell` 分支零横向溢出，`ar` 图标保持 RTL 镜像。
- `npm run verify:online` / `smoke:lobby` / `smoke:feedback` 零回归。
