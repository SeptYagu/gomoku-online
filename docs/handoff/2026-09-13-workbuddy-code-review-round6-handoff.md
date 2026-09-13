# 独立代码审查报告：Phase 5 五子棋核心算法分层与 AI 引擎解耦（Round 6）

- **审查日期**：2026-09-13
- **审查角色**：独立代码审查员（WorkBuddy Independent Code Auditor）
- **被审 HEAD SHA**：`ea0c0b964a295db3aab29a1391e40b83b22270c9`
- **基准提交 SHA**：`860d9ce3b441fae917b18c041009b063569bd7da`
- **实际审查 diff 范围**：`860d9ce..ea0c0b9`（8 文件，+2900 / −2582；产品代码 4 文件、工具 1 文件、文档 3 文件）
- **工作区状态**：干净（`git status --porcelain` 为空；`git pull --ff-only` = Already up to date；HEAD 与待审 SHA 逐字符一致）
- **审查结论**：**0×P0 / 0×P1 / 0×P2；1×P3；不满足"审查通过条件"**。核心算法分层为**可证明零行为漂移**的等价重构：base 单体 134 个顶层声明全部落地（0 缺失），仅 2 处声明体变更且均可证明语义等价；新增 36 项端到端差分 + 4500+ 项纯函数差分断言零差异；四道门禁与 Arena 独立复跑全绿。唯一遗留为交付文档的**行数量化数据失真（4 项）**，违反验收标准 #5。

---

## 1. 需求与实现对应关系

| # | 验收标准 | 实现位置 | 独立核验结论 |
| :- | :--- | :--- | :--- |
| 1 | 落地 `ai-evaluator.ts`（静态评估与威胁判定）、`ai-search.ts`（α-β 搜索与状态机）、`ai-scheduler.ts`（策略调度与开局库）三大微领域模块，职责清晰高内聚 | `src/game/ai-evaluator.ts`（564 行）、`src/game/ai-search.ts`（1270 行）、`src/game/ai-scheduler.ts`（823 行） | ✅ 声明级字节比对（§4-V2）：base 134 个顶层声明**逐一落地、0 缺失**；依赖方向严格单向 `scheduler → search → evaluator → board/types`，**无环**；3 个模块间**无同名符号冲突**（`uniq -d` 为空），无状态重复持有 |
| 2 | `src/game/ai.ts` 蜕变为 24 行透明门面，完整重导出 11 项公开 API 与核心类型，全仓调用方零改动兼容 | `src/game/ai.ts`（27 行；`git diff --numstat` = `27 2574`） | ✅ 运行时 `Object.keys` 证明 base **7/7 值导出**（`chooseAiMove`/`chooseAiMoveResult`/`evaluateBoard`/`getAiTimeLimitMs`/`getAiWorkerCount`/`getThreatSummaryAfterMove`/`scoreAiMove`）100% 保留；base 4 个公开类型 + 新增 2 个（`ThreatSummary`/`ChooseAiMoveOptions`，base 内部类型，纯增量非破坏）。全仓 9 个调用方文件**零字节改动**。⚠️ 行数声明失真见 §5-P3-1 |
| 3 | `tools/engine-arena.ts` 适配新领域依赖与历史 commit 容错机制 | `engine-arena.ts:130-138`（`SOURCE_FILES`）、`:292-304`（`try-catch` + `stdio` 抑制） | ✅ 实测 `npm run arena -- --games 2 --difficulty normal`：基线 `HEAD^`（缺三个新模块）经 `catch` 容错**成功加载**并对弈。**且经独立反证**：改动前的 `SOURCE_FILES` 缺 `opening-book.ts`，而历史 `ai.ts` 导入 `./opening-book`，同构复制后 `import()` 抛 `MODULE_NOT_FOUND` —— 证明本次扩充为**必要修复**而非装饰 |
| 4 | 四道本地门禁 + 天梯 Arena 评测全绿，棋力零衰减 | — | ✅ 门禁 1-4 独立复跑全绿（§4-V5）；Arena（normal，2 局）1-1 平、均 48 步（§4-V6）。**棋力零衰减由 V2（声明级等价）+ V3（运行时差分零差异）直接证实**，强于「同名引擎自战 2-2」这一弱证据 |
| 5 | handoff/INDEX/STATUS 文档完备，量化数据属实 | 三份文档 | ❌ 结构完备，但 `ai.ts`/`ai-scheduler.ts`/`engine-arena.ts`/总计 **4 项行数失真**（§5-P3-1） |
| 6 | 零缺陷容忍：无任何未解决 P0/P1/P2/P3 | — | ❌ 存在 1×P3 未闭环（§5-P3-1） |

`docs/review-checklist.md` **不存在**，无逐项执行项。

---

## 2. 阅读过的关键文件与调用链

**逐文件完整阅读**：
- `src/game/ai.ts`（27 行全文）；
- `src/game/ai-evaluator.ts`（564 行全文）；
- `src/game/ai-search.ts`（1270 行全文）；
- `src/game/ai-scheduler.ts`（823 行全文）；
- `tools/engine-arena.ts`（变更区 `:127-138`、`:280-310` 全文精读 + `loadEngine`/`chooseEngineMove`/`chooseParallelEngineMove` 调用链追踪）；
- `src/game/ai.test.ts`（590 行全文，评估测试有效性）；
- `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md`、`docs/handoff/INDEX.md`、`STATUS.md`（逐行核对量化声明）。

**为辐射影响额外阅读**：`src/game/ai-worker.ts`、`src/game/ai-worker-request.ts`、`src/game/ai-worker-pool.ts`、`src/components/hooks/useAiGame.ts`、`src/components/GameShell.tsx`、`src/components/play/AiGameView.tsx`、`src/components/interaction-guards.ts`、`tools/generate-opening-book.ts`（全部调用方导入面）；`src/game/board.ts`（`WIN_STONE_COUNT = 5` 语义核对）；`docs/handoff/2026-09-13-workbuddy-code-review-round5-handoff.md`（前序遗留项）。

**关键调用链（已追踪并验证）**：
- **门面转发链**：`@/game/ai` → `ai.ts` re-export → `ai-scheduler.chooseAiMove/chooseAiMoveResult` → `ai-search.chooseSearchMove` → `ai-evaluator` 评分/威胁原语。单一入口，无旁路。
- **调度决策主链**：`chooseAiMoveResult` → `getCandidateMoves`（search）→ `orderCandidateMoves` → 全量候选池上的 `findWinningMoves`+`chooseBestMove`（必胜/必挡）→ `chooseOpeningBookMove`（开局库）→ `findForcedThreatMove`/`canForceThreatWin`（VCF/VCT）→ `findBestForkMove` → `shardRootCandidates` → `chooseSearchMove`。
- **Worker 线程链**：`useAiGame` → `ai-worker-pool` → `ai-worker.ts:1`（`import { chooseAiMoveResult } from "./ai"`）→ 门面 → scheduler。门面缺失任一符号都会在编译期暴露（`tsc` 已证 0 错误）。
- **Arena 动态加载链**：`tools/engine-arena.ts` → `import("src/game/ai.ts")`（current）/ `.arena-cache/<spec>/src/game/ai.ts`（历史 spec）。历史 spec 的依赖解析依赖 `SOURCE_FILES` 复制集，`try-catch` 处理缺失文件。

---

## 3. 测试代码审查

- **本次变更未新增/修改任何测试**（`git diff --name-only 860d9ce..ea0c0b9` 不含任何 `*.test.ts`）。对于一次**纯机械等价重构**，这是合理的——`ai.test.ts`（24 例）保持零字节改动，本身就是「公开 API 与行为契约零破坏」的间接证据。
- **断言有效性（正向评估）**：`ai.test.ts` 断言的是**行为结果**而非「函数被调用」——例如「取胜手落地后 `getGameResult(...).state === "won"`」「在候选池被 19 个散点撑爆时仍返回 `source === "winning"`」「并行 4 分片均报同一战术手」「开局库按难度挡位与 seed 变体」「密集随机盘面胜/挡保证（并断言 `tacticalCases > 0` 防空跑）」。**未发现 mock 掩盖接口、未发现与实现共享同一错误假设、未发现"功能无效仍通过"的断言**。这解释了为何该套件在重构前（单体）与重构后（门面）都全绿——它测的是外部可观测行为，与内部模块划分解耦。
- **覆盖盲区（属测试基建现状，不构成本次交付缺陷，但削弱回归网）**：现有测试**无法守护模块级等价性**——它不能证明 `ai-search.ts` 的 `minimax` 与 base 的 `minimax` 逐字节同构，也无法捕捉「某私有函数搬家时被微改」这类漂移。因此本轮**必须由审查方以差分手段一次性证明**（见 §4-V2/V3），这也正是本次审查的核心价值。
- **本机环境**：`npm test` = 28 套 / 242 例全通过（与 handoff 声明一致），门禁 3 可独立复验。

---

## 4. 独立设计的验证场景及执行结果

> 全部为**独立设计**（非复用仓库既有测试）。使用临时 `tsx` 脚本与临时基线副本直连产品代码；临时目录位于仓库之外（`%TEMP%/gomoku-review`），验证后删除，`git status --porcelain` 复核为空。

### V0 — 版本确认
`git rev-parse HEAD` = `ea0c0b964a295db3aab29a1391e40b83b22270c9`（与待审 SHA 逐字符一致）；基准 `860d9ce3b441fae917b18c041009b063569bd7da`；`git pull --ff-only` = Already up to date；工作区干净。**结论：审查结论对应上述确切代码版本。**

### V1 — API 面严格等价（静态 + 运行时）
- 运行时加载门面导出清单一并打印：base 单体与当前门面**值导出完全一致**（7 个，见 §1-2）。
- 全仓扫描 `from "@/game/ai"` / `"./ai"` / `"../src/game/ai"`：**9 个调用方文件**（`useAiGame.ts`、`GameShell.tsx`、`AiGameView.tsx`、`interaction-guards.ts`、`ai-worker.ts`、`ai-worker-request.ts`、`ai.test.ts`、`generate-opening-book.ts`、`engine-arena.ts`），实际引用的全部符号均可解析。
- **结论：PASS**（7/7 值导出零破坏 + 9 调用方零改动）。

### V2 — 声明级结构化等价（最强静态证据）
将 base `ai.ts`（2574 行）与三新文件拼接物各自以「括号配对」解析出**全部顶层声明**（`function`/`class`/`const`/`type`/`interface`），剥离注释与空白后按 `名称 → 声明体` 建索引逐一同名比对：

- base **134 个顶层声明** → 新集合 **135 个**；
- **缺失：0**；
- **新增：1** —— `SearchMoveResult`（新命名类型，取代 base 中 `chooseSearchMove` 的内联返回类型标注，结构等价）；
- **变更：2** —— 均已逐语句核对为语义等价：
  1. `chooseSearchMove`（`ai-search.ts:1165-1270`）：返回类型 `AiMoveResult` → `SearchMoveResult`，且两处 `return createAiMoveResult(...)` 改写为**字面量对象**。逐字段核对：`{point:null, score:-Inf, completedDepth:0, nodes:0, source:"empty-shard"}` 与 `{point:bestMove, score:..., completedDepth, nodes:searchState.nodes, source:"search"}` 与 base 工厂函数产物**逐字段相同**；`SearchMoveResult` 的 `source` 为 `"search"|"empty-shard"`，是 `AiMoveSource` 的子集，**可赋值给门面的 `AiMoveResult`**（`tsc` 0 错误佐证）。
  2. `getThreatSummaryForPlacedStone`（`ai-evaluator.ts:495`）：`if (total >= 5)` → `if (total >= WIN_STONE_COUNT)`。已核对 `board.ts:4` `WIN_STONE_COUNT = 5`，**常量等价**。
- 其余 131 个声明（含 `SearchPosition` 类、`minimax`、全部 Zobrist/威胁/开局库辅助）**字节等价**（仅新增 `export` 提权）。
- **结论：PASS**（逐声明等价，无隐性逻辑漂移）。

### V3 — 运行时差分等价（base 单体 vs 重构门面，同进程并列）
将 `860d9ce:src/game/{ai,board,types,opening-book}.ts` 作为临时基线副本，与当前产品代码**同进程并列导入**，驱动完全相同的确定性输入：

- **纯函数差分**：5 个盘面（空盘、12 手 benchmark、白棋四连+19 散点密集盘、满盘、仅剩 1 空点的近满盘）× 2 视角 × 全 225 格，逐一比对 `evaluateBoard` / `scoreAiMove` / `getThreatSummaryAfterMove`（JSON 深度等价）→ **0 差异**。
- **配置边界差分**：`getAiTimeLimitMs`（4 难度 × `undefined/0/−5/3.9/1e9/NaN/+Infinity`）与 `getAiWorkerCount`（4 难度 × `1/0/−3/8/NaN/+Infinity`）→ **0 差异**（含 `NaN`/负值/`Infinity` 等非法输入）。
- **搜索差分**：3 个合法局面 × 2 难度（normal/hard，`timeLimitMs=20000`，无超时）× 6 种分片（`undefined`、`{0,1}`、`{3,4}`、`{−1,3}`、`{5,3}`、`{0,0}`）共 **36 组**，逐一比对 `{point, source, completedDepth, nodes}` → **0 差异**。
- **边界/负向锚点**：满盘 → base 与门面**均** `{point:null, source:"none"}`；近满盘 → **均**返回唯一合法点 `{row:14,col:14}, source:"single"`。
- **结论：PASS**（生产路径行为零回归；且覆盖了非法输入、非法分片、无子可落等失败/边界路径——这些正是现有测试未直接覆盖的面）。

### V4 — 交付文档量化声明逐项核对（靶向本任务验收标准 #5）
| 声明 | 出处 | 实测（提交态） | 结论 |
| :--- | :--- | :--- | :--- |
| `ai-evaluator.ts` 564 行 | handoff:50 | 564 | ✅ |
| `ai-search.ts` 1270 行 | handoff:51 | 1270 | ✅ |
| `ai-scheduler.ts` 820 行 | handoff:30/52/91；STATUS:48；INDEX:19 | **823** | ❌ 失真 +3 |
| `ai.ts` 24 行 | handoff:20/28/53/108；STATUS:48；INDEX:19 | **27** | ❌ 失真 +3 |
| base `ai.ts` 2574 行 | handoff:53/55 | 2574 | ✅ |
| `engine-arena.ts` 740 → 752 行 | handoff:54 | **739** → 752 | ❌ 前值失真 −1（后值 ✅） |
| 总计 2678 行（+104） | handoff:55 | **2684**（+110） | ❌ 失真 +6 / +6 |
| 28 套 / 242 例 | handoff:165；STATUS:48 | 28 / 242 | ✅ |
| `ai.test.ts` 24 例 | handoff:150/165 | 24 | ✅ |

### V5 — 四道本地工程门禁独立复跑
| 门禁 | 命令 | 实测结果 |
| :--- | :--- | :--- |
| 1 | `npx tsc --noEmit` | **0 错误**（exit 0） |
| 2 | `npm run lint` | **0 错误 0 警告**（exit 0，无输出） |
| 3 | `npm test` | **28 套 / 242 例全部通过**（含 `ai.test.ts` 24 例） |
| 4 | `npm run build` | **成功**（Turbopack 3.1s 编译，11/11 页面静态预渲染，exit 0） |

### V6 — Arena 天梯独立复跑
```
npm run arena -- --games 2 --difficulty normal
→ game 1/2: baseline won (moves=48, 1106ms)
→ game 2/2: candidate won (moves=48, 992ms)
→ candidate 1 - baseline 1 - draw 0；均 48 步、1049ms/局
```
- **关键验证点**：baseline = `HEAD^`（即 `860d9ce`，其 `ai.ts` 为缺少三个新模块的单体）经 `try-catch` 容错**成功加载**，证明新容错机制有效。
- **必要性反证**：将 base 的 `ai.ts/board.ts/types.ts`（**不含** `opening-book.ts`，即改动前的 `SOURCE_FILES`）同构复制后 `import()` → `MODULE_NOT_FOUND`；证明本次 `SOURCE_FILES` 扩充是历史基线可加载的**必要条件**。
- 注：base 与 candidate 逻辑等价，故 1-1（handoff 记录 2-2）为**确定性对称自战**的预期结果；零漂移的真正证据是 §4-V2/V3。

### V7 — 在线联机烟测
`npm run verify:online` → **4/4 PASS**（`page` 加载、`version` 回报 `ea0c0b9`、`socket.io polling` 握手、`socket.io websocket` 连接）。

---

## 5. 缺陷清单（按严重级别排序）

### P3-1：Phase 5 交付文档行数量化数据失真（4 项），违反验收标准 #5

- **严重级别**：P3（文档基准可信度；无功能影响，但违反验收标准 #5「量化数据属实」与 #6「零缺陷容忍」）
- **文件与行号**：
  - `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md:20`、`:28`、`:53`、`:108`（`ai.ts` 声明 24 行）
  - `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md:30`、`:52`、`:91`（`ai-scheduler.ts` 声明 820 行）
  - `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md:54`（`engine-arena.ts` 重构前声明 740 行）
  - `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md:55`（总计 2678 行 / 净 +104 行）
  - `STATUS.md:48`（`ai-scheduler.ts` 820 行、`ai.ts` 24 行）
  - `docs/handoff/INDEX.md:19`（`ai-scheduler.ts` 820 行、`ai.ts` 24 行）
- **触发条件**：对交接文档 §2.1「各文件代码量统计（**`wc -l` 真实行数**）」做字面复核时。
- **实际行为**：`wc -l` / `git diff --numstat` 提交态实测为 —— `src/game/ai.ts` = **27**、`src/game/ai-scheduler.ts` = **823**、`git show 860d9ce:tools/engine-arena.ts | wc -l` = **739**、重构后四文件合计 = **2684**（净 **+110**）。文档分别声明 24 / 820 / 740 / 2678（+104）。**同一批失真数字在 handoff、`STATUS.md`、`INDEX.md` 三处文档间复用**，形成一致但错误的"事实基准"。
- **期望行为**：文档声明与提交态实测逐一相符；总计与净变化由实测行数导出。
- **根因**：行数在最终定稿/收尾格式化**之前**测记，未针对**提交态**复测；且三份文档共用同一来源数字，缺乏独立复核环节。（与 Round 2「handoff 行数失真」、Round 3「行数声明 +1」为**同一问题类**的再现。）
- **影响范围**：仅文档可信度与协作判断；不影响构建、运行时、Arena 或任何消费者。已确认失真项中**无一与代码行为相关的结论**被牵连（§1 的 ✅ 项均基于实测，不依赖文档数字）。
- **复现方法**：
  ```bash
  git rev-parse HEAD                                   # ea0c0b964a295db3aab29a1391e40b83b22270c9
  wc -l src/game/ai.ts src/game/ai-scheduler.ts        # 27 / 823
  git diff --numstat 860d9ce..ea0c0b9 -- src/game/ai.ts # 27  2574
  git show 860d9ce:tools/engine-arena.ts | wc -l        # 739
  echo $((564+1270+823+27))                             # 2684
  ```
- **修复建议**：以提交态为准统一订正三份文档：`ai.ts` → **27 行**、`ai-scheduler.ts` → **823 行**、`engine-arena.ts` 重构前 → **739 行**、重构后总计 → **2684 行（净 +110）**；并将 handoff §2.1 的「重构前行数」列口径与「重构后行数」保持一致（现表格"重构前"仅取 `ai.ts` 单体，而"重构后"为四文件之和，口径已自洽，仅数值需修正）。
- **修复后验收标准**：`handoff:20/28/30/52/53/54/55/91/108`、`STATUS.md:48`、`INDEX.md:19` 中每一处行数均与提交态 `wc -l`/`numstat` 一致；总计与净变化可由表中数字直接相加得到。

**P0 / P1 / P2 缺陷数：0 / 0 / 0。**

---

## 6. 待确认风险与观察（非已确认缺陷）

> 以下各项均**无当前可复现的实际影响**，依规范不计为缺陷，仅登记备查。

- **R1｜门面公开类型面轻微扩张（纯增量、非破坏）。** `ai.ts` 实际导出 **13** 个符号（7 值 + 6 类型），其中 `ThreatSummary`、`ChooseAiMoveOptions` 在 base 中为**非导出**内部类型（base 公开面恰为 11 项）。文档口径「11 项公开 API」指 base 的 11 项，二者不矛盾；扩张为向后兼容。**残余风险**：未来外部代码可能开始依赖此前不保证稳定的内部类型。建议在 handoff 中显式声明"新增导出 2 项内部类型"，或将其收回为非导出。
- **R2｜`engine-arena.ts` 的 `try-catch` 无差别吞错，弱化了错误诊断。** `tools/engine-arena.ts:301-303` 捕获**所有**异常：传入非法 `--baseline` ref 时，7 次 `git show` 全部静默失败，最终以指向 `.arena-cache` 的 `ERR_MODULE_NOT_FOUND` 报错，而非改动前更直接的 `fatal: invalid object name`。**当前证据不足以判为缺陷**：仍会明确失败而非静默产出错误引擎（`loadEngine` 每次 `rm -rf` 缓存目录后重建，无陈旧文件串味），且默认 `HEAD^` 合法。**建议**：仅对"对象/路径不存在"吞错，其余错误重抛；或对 `ai.ts` 单独保留强校验。
- **R3｜更早历史 commit（早于 `opening-book.ts` 引入）的 Arena 兼容未实测。** 本轮已实测 `HEAD^`（缺三个新模块）走 `catch` 成功；对"同时缺 `opening-book.ts`"的更早 ref 仅做了静态推理（其 `ai.ts` 不导入该文件，故路径应同样成立），未实跑。**残余风险**：极低。
- **R4｜`--difficulty insane` 的 Arena 端到端未复跑。** 本轮以 `--difficulty normal` 复跑（与 handoff 一致）；insane 搜索路径由 `ai.test.ts` 的 insane 用例（取胜手、算杀、预算耗尽回退）覆盖，且其代码在 V2 中逐字节等价。**残余风险**：低。

---

## 7. 推荐修复顺序

1. **P3-1**（唯一阻塞项，且为纯文档改动，风险最低）：以提交态实测统一订正 `docs/handoff/2026-09-13-phase5-ai-engine-decomp-handoff.md`、`STATUS.md:48`、`docs/handoff/INDEX.md:19` 中的 4 项行数。
2. （非阻塞、可与 1 同批或延后）R1：在 handoff 中标注门面新增的 2 项内部类型导出（或收回）。
3. （延后、非阻塞）R2：将 `engine-arena.ts` 的 `try-catch` 收窄为仅处理"文件不存在"，避免掩盖非法 ref 诊断。

---

## 8. 下一轮（Round 7）复审验收标准

1. `git rev-parse HEAD` 为 P3-1 修复提交，且其父提交为 `ea0c0b9`；工作区干净。
2. `handoff:20/28/30/52/53/54/55/91/108`、`STATUS.md:48`、`INDEX.md:19` 中每处行数与提交态 `wc -l`/`git diff --numstat` 逐一相符（`ai.ts`=27、`ai-scheduler.ts`=823、arena 前=739、总计=2684 净 +110）。
3. 本轮 diff **只含审查文档与 P3-1 所必需的文档订正**，不得混入产品代码或测试改动；`git diff ea0c0b9..HEAD --stat` 不包含 `src/**`（除纯文档）与 `tools/**` 的行为性改动。
4. 门禁 1–4 仍须全绿。
5. P0/P1/P2/P3 全级别缺陷数均为 0。

---

## 9. 本轮审查未验证项与残余风险

- **未验证项 1**：`--difficulty insane` 的 Arena 端到端对局（仅复跑 normal；insane 由单测 + V2 字节等价覆盖）。
- **未验证项 2**：小时级 soak / 长时内存演化（`searchState.cache` 的 `maxCacheEntries` 淘汰与 `threatCache` 上限在多局长时运行下的表现）——V3 差分均为单次决策，未做长时压力测试。
- **未验证项 3**：更早历史 commit（缺少 `opening-book.ts`）的 Arena 加载（见 R3）。
- **残余风险**：R1–R4 四项，均为非阻塞、无当前可复现影响。
- **本轮已完成的独立验证总量**：声明级等价比对（base 134 声明 → 新 135 声明，0 缺失 / 1 新增 / 2 等价变更）、运行时差分 **36 项搜索断言 + 4500+ 项纯函数断言 + 76 项配置边界断言**、API 面等价（7 值导出 + 9 调用方）、四道门禁复跑、Arena 复跑 + 历史加载必要性反证、`verify:online` 4/4、文档量化声明 9 项逐项核对。

---

## 10. 审查结论

Phase 5 的 AI 引擎分层在**功能等价性上无任何可证伪点**：base 单体的 134 个顶层声明全部落地且仅 2 处可证明等价的改写；门面 7/7 值导出零破坏、9 个调用方零改动；36 项搜索差分 + 4500+ 项纯函数差分（含非法输入、非法分片、满盘负向锚点）零差异；四道门禁、Arena 与 `verify:online` 全绿。这是一次**高质量的等价重构**，且顺带修复了 Arena 对历史基线（缺 `opening-book.ts`）长期失效的潜在缺陷——该修复经验证为必要。

唯一阻塞为交付文档的 **4 项行数量化数据失真**（P3，纯文档、修复成本极低，且与 Round 2/3 属同一问题类）。依本项目"零缺陷容忍"验收标准 #6，本轮**不满足审查通过条件**，需由主开发智能体按 §7-1 订正后进入 Round 7 复审。
