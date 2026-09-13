# 独立代码审查报告：Phase 1 全局常量中枢与代码卫生治理（Round 1）

- **审查日期**：2026-09-13
- **审查角色**：独立代码审查员（WorkBuddy Independent Code Auditor）
- **被审 HEAD SHA**：`1e6ef36c6fd2ed87dd6532bd495932b7474c0b1f`
- **基准提交 SHA**：`dd0b427a007d1eef38e37638e2788e88647b5c41`
- **实际审查 diff 范围**：`dd0b427..1e6ef36`（18 文件，+253 / −42）
- **工作区状态**：干净（`git pull --ff-only` = Already up to date）
- **审查结论**：**无 P0 / P1 / P2；存在 4 项 P3；不阻塞发布**，可进入下一阶段（建议按推荐顺序顺手收敛 P3-1、P3-2）。

---

## 1. 需求与实现对应关系

| # | 验收标准 | 实现位置 | 结论 |
| :- | :--- | :--- | :--- |
| 1 | 新建 `src/lib/constants.ts` 集中魔法值，无运行时/类型错误 | `src/lib/constants.ts`（32 行）、`src/lib/constants.test.ts` | ✅ 达成，`npx tsc --noEmit` 独立复跑 0 错误 |
| 2 | 新建 `ThemeScript.tsx` 消除两处 layout 内联脚本重复 | `src/components/ThemeScript.tsx`、`src/app/(root)/layout.tsx:18`、`src/app/[locale]/layout.tsx:29` | ✅ 达成，两处内联脚本均已移除，抽取后脚本字符串与原文**逐字节一致** |
| 3 | 9 处魔法值点位精准替换且业务逻辑不变 | 见 §2 逐点核对 | ✅ 达成，全部 16 个替换点位（对应 9 个文件域）取值零漂移 |
| 4 | `README.md` 明示 Freestyle Gomoku 规则 | `README.md`（新增「## 对弈规则（Freestyle Gomoku）」） | ✅ 达成，行号引用 `board.ts:140` / `ai.ts:1633` 经核对**准确** |
| 5 | 本地四门禁 + 联机烟测全绿 | §5 未验证项 | ⚠️ 部分独立复验（tsc、单测已复跑全绿；lint/build/烟测依赖交付方声明） |
| 6 | 提交规范并产出 Phase 1 handoff | `1e6ef36`、`docs/handoff/2026-09-13-phase1-code-hygiene-handoff.md`、INDEX/STATUS | ✅ 达成 |

### §2 魔法值替换点位逐点取值核对（值漂移核验）

| 点位 | 原值 | 新引用 | 实际值 | 漂移 |
| :--- | :--- | :--- | :--- | :--- |
| `rooms.ts:333` `MAX_ROOM_CHAT_TEXT_LENGTH` | `160` | `MAX_CHAT_MESSAGE_LENGTH` | 160 | 无 |
| `rooms.ts:375` `disconnectGraceMs ??` | `60 * 1000` | `DISCONNECT_GRACE_MS` | 60000 | 无 |
| `rooms.ts:1855` `hostName` 回退 | `"Player"` | `DEFAULT_PLAYER_NAME` | "Player" | 无 |
| `OnlineLobbyView.tsx:97` `maxLength` | `24` | `MAX_PLAYER_NAME_LENGTH` | 24 | 无 |
| `OnlineLobbyView.tsx:596` `maxLength` | `160` | `MAX_CHAT_MESSAGE_LENGTH` | 160 | 无 |
| `TableRoomChat.tsx:44` `maxLength` | `160` | `MAX_CHAT_MESSAGE_LENGTH` | 160 | 无 |
| `accounts.ts:84` `MAX_DISPLAY_NAME_LENGTH` | `24` | `MAX_PLAYER_NAME_LENGTH` | 24 | 无 |
| `useFriendRoom.ts:640` `lobby:join` limit | `20` | `PAGINATION.LOBBY_ROOMS` | 20 | 无 |
| `useFriendRoom.ts:683` `presence:join` limit | `30` | `PAGINATION.PRESENCE_USERS` | 30 | 无 |
| `useFriendRoom.ts:173/701/761` 排行榜分页 | `10` / `"10"` | `PAGINATION.LEADERBOARD` | 10 / "10" | 无 |
| `useFriendRoom.ts:1334` 复制反馈 `setTimeout` | `1800` | `COPY_FEEDBACK_DURATION_MS` | 1800 | 无 |
| `useFriendRoom.ts:1746` `createGuestPlayerName` | `Player ${n}` | `${DEFAULT_PLAYER_NAME} ${n}` | "Player n" | 无 |
| `PlayerProfilePage.tsx:51` 请求 `limit` | `"50"` | `String(PAGINATION.PLAYER_PROFILE_RECORDS)` | "50" | 无 |
| `game-records.ts:200/367` `limit = 50` | `50` | `PAGINATION.PLAYER_PROFILE_RECORDS` | 50 | 无 |
| `game-records.ts:320` `limit = 20` | `20` | `PAGINATION.DEFAULT_PROFILE_RECORDS` | 20 | 无 |
| `game-records.ts:319/335` `"Player"` | `"Player"` | `DEFAULT_PLAYER_NAME` | "Player" | 无 |
| `GomokuBoard.tsx:240-241` `/ 15` | `15` | `BOARD_SIZE` | 15 | 无 |
| `room-socket.ts:198/204` | `10_000` / `60_000` | `LIFECYCLE_SWEEP_INTERVAL_MS` / `EMPTY_ROOM_GRACE_MS` | 10000 / 60000 | 无 |

> 校验方法：以 `git diff dd0b427..1e6ef36` 逐行比对「被删除字面量」与「新常量定义字面量」，并结合 `grep` 全仓复核常量消费点与 1:1 取值一致性。**结论：零取值漂移，重构对业务逻辑保持语义等价。**

### §2.1 关键调用链（已追踪）

- 主题初始化：`app/(root)/layout.tsx` / `app/[locale]/layout.tsx` → `ThemeScript` → `themeStorageKey`（`src/lib/theme.ts`）→ 生成 `dangerouslySetInnerHTML` 脚本 → `document.documentElement.dataset.theme`；写侧 `ThemeToggle.tsx:69` 亦使用同一 `themeStorageKey`，读写键名一致。
- 玩家默认名：`useFriendRoom.ts` 读取 `DEFAULT_PLAYER_NAME` ↔ 服务端 `rooms.ts:1855`（房间列表 hostName）、`game-records.ts:319/335`（档案名回退）同源，SSR/CSR 首屏名一致性由共享常量保证。
- 聊天长度：客户端 `maxLength`（`OnlineLobbyView` 公共聊天 / `TableRoomChat` 房间聊天）↔ 服务端 `rooms.ts:1027/1291` `[...text].length > MAX_ROOM_CHAT_TEXT_LENGTH`，两端共享同一 160 常量。
- 档案分页：`PlayerProfilePage.tsx:51`（URL `limit=50`）→ `online-server.ts:200-209` 解析 → `rooms.ts:1367` → `game-records.ts:317 getPlayerProfile` → `listRecordsForPlayer`（clamp `[1,200]`）；`limit` 缺省时落入 `DEFAULT_PROFILE_RECORDS=20`，与基线 20 一致。
- 断线/空房时序：`rooms.ts:375` `disconnectGraceMs ?? DISCONNECT_GRACE_MS`；`room-socket.ts:198/204` 清扫周期与空房宽限。

---

## 3. 阅读过的关键文件与调用链

`src/lib/constants.ts`、`src/lib/constants.test.ts`、`src/lib/theme.ts`、`src/components/ThemeScript.tsx`、`src/app/(root)/layout.tsx`、`src/app/[locale]/layout.tsx`、`src/components/GomokuBoard.tsx`、`src/components/online/OnlineLobbyView.tsx`、`src/components/online/TableRoomChat.tsx`、`src/components/profile/PlayerProfilePage.tsx`、`src/components/useFriendRoom.ts`、`src/components/ThemeToggle.tsx`、`src/server/accounts.ts`、`src/server/game-records.ts`、`src/server/room-socket.ts`、`src/server/rooms.ts`、`src/server/online-server.ts`、`src/game/board.ts`、`src/game/ai.ts`、`README.md`、`STATUS.md`、`docs/handoff/INDEX.md`、`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`。

---

## 4. 独立设计的验证场景及执行结果

| # | 场景（现有测试未直接覆盖） | 方法 | 结果 |
| :- | :--- | :--- | :--- |
| V1 | 主题初始化脚本文本等价性（防首屏主题闪烁回归） | 用 Node 以 `themeStorageKey` 复原模板字面量，与基线字面量做逐字节 `===` | **IDENTICAL: true**，无回归 |
| V2 | 聊天长度「客户端 UTF-16 码元 vs 服务端码点」边界一致性 | 构造 BMP 160 字符 / 80 emoji（160 码元）/ 81 emoji（162 码元）三组边界输入，比较客户端 `maxLength` 与服务端 `[...s].length>160` 判定 | 客户端（码元）恒 ≤ 服务端（码点）上界，**客户端永不会提交被服务端拒绝的串**；160 边界两端交界一致 |
| V3 | 玩家名 UTF-16 截断边界 | 13 emoji（26 码元）输入 vs 服务端 `slice(0,24)` | 客户端 24 码元更严格，服务端截断为空操作，**无截断不一致** |
| V4 | 常量消费点穷举（发现 P3-1/P3-2） | 全仓 `grep` 常量名所有引用点，区分「定义 / 测试 / 生产消费」 | `WIN_STONE_COUNT` 生产零消费；`BOARD_SIZE` 存在双源（见 P3-1/P3-2） |
| V5 | 类型与单测独立复跑 | `npx tsc --noEmit`；`npx vitest run src/lib/constants.test.ts` | tsc **0 错误**；constants 单测 **5/5 通过** |

---

## 5. 缺陷清单（按严重级别排序）

### P0 — 0 项
### P1 — 0 项
### P2 — 0 项

### P3-1：`BOARD_SIZE` 出现「双真源」，常量中枢与领域层各自独立
- **严重级别**：P3（健壮性/单一真源，当前无功能影响）
- **文件与行号**：`src/lib/constants.ts:7`（`export const BOARD_SIZE = 15`）与 `src/game/board.ts:3`（`export const BOARD_SIZE = 15`）；消费侧 `src/components/GomokuBoard.tsx:5,240,241` 取前者，`src/game/board.ts`、`src/game/ai.ts`、`src/game/ai-worker-request.ts` 取后者。
- **触发条件**：任一处的棋盘尺寸被单独修改（例如将来支持 19 路盘）而另一处未同步。
- **实际行为**：仓库同时存在两个互相独立、数值相同的 15；`lib/constants.BOARD_SIZE` 仅驱动 `GomokuBoard` 星位百分比定位。
- **期望行为**：全局常量中枢应作为棋盘尺寸的单一权威来源，或直接复用领域层既有常量。
- **根因**：抽离常量时未复用 `src/game/board.ts` 已有的同义导出，而是新增了第二个定义。
- **影响范围**：潜在视觉/规则不一致（星位错位、README 规则失真）；当前值为 15/15，无现实缺陷。
- **验证证据**：V4 全仓 grep（两处 `export const BOARD_SIZE = 15`；`GomokuBoard` 唯一消费 `@/lib/constants` 版本）。
- **修复建议**：`src/lib/constants.ts` 改为再导出 —— `export { BOARD_SIZE } from "@/game/board";`，消除第二定义。
- **修复后验收标准**：全仓 `BOARD_SIZE` 定义唯一，`GomokuBoard` 星位仍与棋盘网格一致，四门禁全绿。

### P3-2：`WIN_STONE_COUNT` 被导出并被单测断言，但无任何生产消费方，属「非权威常量」
- **严重级别**：P3（单一真源误导，当前无功能影响）
- **文件与行号**：`src/lib/constants.ts:8`；引用点仅 `src/lib/constants.test.ts:12,18`；核心规则仍硬编码 —— `src/game/board.ts:140`（`line.length >= 5`）与 `src/game/ai.ts:1633`（`forward.count + backward.count + 1 >= 5`）。
- **触发条件**：有人依据「全局常量中枢」修改 `WIN_STONE_COUNT`（例如改为 4）以期改变胜负规则。
- **实际行为**：改动 `WIN_STONE_COUNT` 不产生任何行为变化，胜负仍由字面量 5 决定。
- **期望行为**：要么核心规则消费该常量，要么不导出（避免制造「已统一」的错觉）。
- **根因**：常量抽离覆盖了本不属于「既有魔法值点位」的规则数字，但未回接领域层。
- **影响范围**：可维护性/文档一致性；`README.md` 的 `>=5` 规则声明与实现之间缺少常量绑定。
- **验证证据**：V4 grep —— `WIN_STONE_COUNT` 全仓仅出现在 `constants.ts` 与 `constants.test.ts`。
- **修复建议**：将 `board.ts:140`、`ai.ts:1633` 改为 `>= WIN_STONE_COUNT`；若担忧 `src/game` 纯函数层的依赖方向，则在 `constants.ts` 中直接再导出领域常量或删除该未消费导出。
- **修复后验收标准**：`WIN_STONE_COUNT` 被核心规则实际读取（改动即生效），或已移除且 README 引用实现字面量。

### P3-3：`constants.test.ts` 测试有效性不足（同义反复，未守护「9 处替换点位」）
- **严重级别**：P3（测试有效性缺口）
- **文件与行号**：`src/lib/constants.test.ts:14-43`
- **触发条件**：任一被替换调用点被误改为错误常量（或回退为字面量、或在未来重构中丢失引用）。
- **实际行为**：该测试仅断言常量模块自身的字面量（`expect(BOARD_SIZE).toBe(15)` 等），**未断言任何调用点实际消费常量，也未断言行为不变**；此类回归不会被任何测试捕获。
- **期望行为**：至少一个集成级断言覆盖关键替换点位（聊天长度上界、昵称截断、档案分页默认值）。
- **根因**：测试为「常量值快照」，与验收标准 #3（精准替换且逻辑不变）之间无因果绑定。
- **影响范围**：验收标准 #3 缺少自动化守护；不构成当前功能缺陷。
- **验证证据**：V4/V5 —— 通读测试文件确认断言范围仅限常量自身。
- **修复建议**：补充 1~2 条行为级用例，例如：`RoomStore` 接收 161 码点消息返回 `chat-message-too-long`（共享 160 常量）；或 `normalizeDisplayName` 对超长输入截断到 `MAX_PLAYER_NAME_LENGTH`。
- **修复后验收标准**：将任一替换点位人为改错会使至少 1 条测试失败（mutation 可检测）。

### P3-4：交付文档存在事实性偏差（低价值但影响 STATUS 作为权威基准）
- **严重级别**：P3（文档准确性）
- **文件与行号**：
  1. `STATUS.md:11` 「最新交付提交」仍为 `19f2974`（实际 HEAD 为 `1e6ef36`），Phase 1 提交未刷新。
  2. `STATUS.md:49,51,52` 行数声明 `1772 / 2415 / 2574` 与实际不符（实测 `useFriendRoom.ts` 1775、`rooms.ts` 2414、`ai.ts` 2573）。
  3. `docs/handoff/2026-09-13-phase1-code-hygiene-handoff.md` §2.4「全仓替换魔法值」为过度声称：`OnlineLobbyView.tsx:109/204/468` 仍存在 `maxLength={20/256/64}`，`accounts.ts:80`、`rooms.ts:337,341` 等仍存在 `60_000`/`10_000` 字面量（属 9 点位范围之外，未替换本身不违规）。
- **触发条件**：任何人以 STATUS.md 作为「唯一权威动态事实基准」判断当前版本/规模时。
- **期望行为**：STATUS 的最新提交与行数与实际一致；handoff 措辞与替换边界一致（「按蓝图 9 点位替换」而非「全仓替换」）。
- **影响范围**：仅文档可信度，无产品影响。
- **验证证据**：`git cat-file`/`git log` 确认 `19f2974` 为旧提交；`wc -l`/Node 统计行数；grep 剩余字面量。
- **修复建议**：更新 STATUS 提交号与行数；将 handoff 措辞限定为「按蓝图精确点位替换」。
- **修复后验收标准**：STATUS 事实项与 `HEAD`/实测一致。

---

## 6. 待确认风险

| # | 风险描述 | 怀疑依据 | 缺失证据 | 建议验证方法 |
| :- | :--- | :--- | :--- | :--- |
| R1 | `ThemeScript` 抽取在真实浏览器中的首屏防闪烁与 RTL（`ar`）场景未做端到端验证 | 仓库内无任何引用 `ThemeScript` 的测试；验收标准未含浏览器级验证 | 浏览器 SSR HTML + 视觉回归证据 | 用 Playwright 打开 `ar` 与 `en` 首屏，断言 `<head>` 含脚本且 `data-theme` 在首帧前设置、无 FOUC |

> R1 残余风险经 §4-V1 判定为**低**：脚本字符串与基线逐字节一致，抽取未改变渲染产物。

---

## 7. 未验证项与残余风险

- **未独立执行**：`npm run lint`、`npm run build`、`npm run verify:online`（依据交付方门禁声明，未在本轮复跑）。原因：审查聚焦 diff 语义与替换精确性；条件：本地完整构建/起服务环境。
- **已独立执行**：`npx tsc --noEmit`（0 错误）、`npx vitest run src/lib/constants.test.ts`（5/5）。
- **残余风险**：上述未复跑门禁若存在与本次改动相关的失败，本轮结论不覆盖；给定改动为纯常量/组件抽取且 tsc+单测通过，判定风险低。

---

## 8. 推荐修复顺序

1. **P3-1 / P3-2**（单一真源，建议合并为一次「常量中枢回接领域层」的小提交，Phase 2 前顺手完成）。
2. **P3-3**（补 1~2 条行为级测试，为后续 Phase 2~5 提供守护）。
3. **P3-4**（文档校正，可与下次交付一并提交）。

> 以上均为非阻塞项；**不影响本提交发布与进入 Phase 2**。

---

## 9. 下一轮复审验收标准

1. `BOARD_SIZE` 全仓唯一定义，`GomokuBoard` 星位与棋盘网格仍一致。
2. `WIN_STONE_COUNT` 被核心规则消费（或已移除），`README` 规则与实现绑定一致。
3. 新增行为级测试：任一替换点位被改错可被测试捕获（mutation 可检测）。
4. `STATUS.md` 提交号/行数与 `HEAD` 一致，handoff 措辞与替换边界一致。
5. 四门禁（tsc / lint / test / build）全绿。
