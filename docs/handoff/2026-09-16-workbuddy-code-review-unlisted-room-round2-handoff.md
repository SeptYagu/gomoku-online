# 不公开房间创建/加入交互解耦（被审 `800a3cb`）独立审查 — Round 2 复查

审查日期：2026-09-16
被审提交：`800a3cb fix(lobby): resolve round 1 review findings for unlisted room creation disambiguation`
基准提交：`165c56d`
审查结论：**未通过**（0×P0 / 0×P1 / 0×P2 / **4×P3**，需修复闭环后复审）

---

## 一、审查基本信息与通过项简述

- 版本核验：`git pull --ff-only` 后实际 HEAD = `800a3cbfadbe94e6e47da4efd77fac744bb6eff0`（等于待审 SHA），基准 `165c56d`，工作区干净；实际审查范围 `git diff 165c56d..800a3cb`（10 文件，+558/−48），已逐文件阅读并单独复核本轮 `git diff bb3be08..800a3cb` 的 5 个代码/测试文件。
- Round 1 四项 P3 的功能性修复均**真实生效**：① `joinExistingRoom` 已渲染（`LobbyMatchmaking.tsx:87`），`grep` 命中渲染点；② CDP AX 实测创建按钮 `description` = hint 文案（`Allocates a random room code and a share link.`）、join 表单 `role=form/name=Join existing room`、输入框 `name` 未回归；③ 组件整体回退到 `165c56d` 后新增单测 **2/3 失败**（守门有效）；④ 6 语种 hint 已无访问保护暗示词。
- 独立复跑门禁：`npx tsc --noEmit`/`npm run lint` 0 问题（按自述采信）、`npx vitest run --pool=vmForks` **29 套 / 248 例全绿**、`npm run build` **成功（11 页预渲染）**；`npm run smoke:lobby-ui` 在本机实跑两次（dev 3000 / prod 3031），本轮新增的两处断言均通过。
- 独立负向/边界验证：真实浏览器 AX 树取证（含 `aria-hidden` A/B 对照）、注入后 ID 解析与 hydration 控制台零 error/warning 检查、390px RTL 几何与截图实测、结构性回退证伪、既有烟测失败点的基线 A/B 归因（详见第二节与第三节）。

---

## 二、审查发现与缺陷清单

### P3-1　`STATUS.md:11` 记录了审查提交而非被审产品交付

- **文件与行号**：`STATUS.md:11`。
- **触发条件**：任何读者依据该字段回溯「上一阶段交付」；下一次阶段交付的回填基准。
- **实际行为**：字段值 = `` `30410c7 docs(review): round 1 independent review of unlisted room creation disambiguation` ``，即本提交的**直接父提交**，且属**审查类**提交（非产品交付）。
- **期望行为**：`` `bb3be08 fix(lobby): disambiguate unlisted room creation and join flow` `` —— 本轮所修复的**被审产品交付**。`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md:91` 已明确指令：「提交时按双字段规则把 `STATUS.md:11` 回填为被审交付 `bb3be08`」。
- **根因**：未按本仓「fix 类提交跳过紧邻的审查提交、记录被审产品交付」的实测惯例回填，而是机械取了直接父提交（恰为审查提交）。
- **影响范围**：`STATUS.md` 是本仓唯一权威动态事实基准；该字段历史上已因同类偏差在 Round 3（P3-2）、Round 4（P3-1）、Round 5（P3-1）、Round 7 被反复判为缺陷，本次为同一模式的再次复发，会让后续读者把 Round 1 审查文档误认为产品交付基线。
- **复现方法**（逐条实测，均取各自提交版本的 `STATUS.md:11`）：
  | 提交（类型） | 直接父提交（类型） | 字段实际值 | 判定 |
  |---|---|---|---|
  | `165c56d` fix | `8adc826` docs(review) | `3a226f1` feat（被审产品） | 跳过审查提交 ✓ |
  | `3e201ec` fix | `a22a708` docs(review) | `b45e3fb` feat（被审产品） | 跳过审查提交 ✓ |
  | `87ae2e6` fix | `1465051` docs(review) | `ea0c0b9` feat（被审产品） | 跳过审查提交 ✓ |
  | `655c667` fix | `fb21dbb` docs(review) | `ea0c0b9` feat（被审产品） | 跳过审查提交 ✓ |
  | `bb3be08` fix | `165c56d` fix（交付） | `165c56d` | 直接前驱交付 ✓ |
  | **`800a3cb` fix** | **`30410c7` docs(review)** | **`30410c7`** | **记录了审查提交 ✗** |
  复核命令：`git show <sha>:STATUS.md | sed -n '11p'`。
- **修复建议**：将 `STATUS.md:11` 的值与括注改为被审产品交付 `bb3be08`（`fix(lobby): disambiguate unlisted room creation and join flow`）。
- **修复后验收标准**：`git show HEAD:STATUS.md | sed -n '11p'` 的 SHA 为 `bb3be08`，且括注与该 SHA 的主题一致。

### P3-2　新增 `<h3>` 造成全站标题层级跳跃（h1 → h3）

- **文件与行号**：`src/components/online/lobby/LobbyMatchmaking.tsx:86`（`<h3 className="lobby-friend-subtitle" id={joinExistingHeadingId}>`）；样式 `src/app/globals.css:538-544`；对照 `src/components/GameShell.tsx:319`（全站唯一 `<h1>`）。
- **触发条件**：任意语言进入联机大厅并展开 friends 面板；任何读屏器按标题导航或 axe 类审计。
- **实际行为**（真实浏览器实测，`/en` 页面 DOM 顺序）：
  `Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))` → `[H1 "Play Gomoku Online", H3 "Join existing room"]`；AX 树同样只有 `level=1` 与 `level=3` 两个 heading。全仓 `src/**/*.tsx` 检索 `<h1|<h2|<h3|<h4` 仅 3 处命中（`GameShell.tsx:319` h1、`LobbyMatchmaking.tsx:86` h3、`PlayerProfilePage.tsx:118` h1），**不存在任何 `<h2>`**。
- **期望行为**：标题层级连续（`h1` → `h2`），或该视觉小标题不承载 heading 语义。
- **根因**：为解决 Round 1 P3-2「join 区需要可读标签」而直接选用 `<h3>`，但该文本实为折叠面板内的**视觉小标题**（`0.8125rem`、`--muted`、位于卡片内部），且其所在页面层级只有 `h1`。
- **影响范围**：axe `heading-order`（impact: moderate，"Heading levels should only increase by one"）判罚；读屏用户按标题快速导航时会得到断裂的文档大纲。改动前该面板无任何标题，故属本轮**新引入**的无障碍回归。
- **复现方法**：进入 `/en` → 切到联机大厅 → 展开 friends 面板 → 执行上述 `querySelectorAll` 语句，输出 `["H1","H3"]`。
- **修复建议**：二选一并保持 `aria-labelledby` 引用有效（被引用元素不要求是 heading）：
  (a) 改为 `<h2 className="lobby-friend-subtitle" id={joinExistingHeadingId}>`（层级连续）；
  (b) 改为 `<p className="lobby-friend-subtitle" id={joinExistingHeadingId}>`（caption 语义，避免为视觉小标题引入大纲节点）。
- **修复后验收标准**：展开面板后全站 heading 序列无跳级（h1 之后出现的是 h2 或非标题元素）；`LobbyMatchmaking.test.ts` 与 `dictionaries.test.ts` 全绿。

### P3-3　分隔带文案与加入卡片小标题在 6 语种下语义完全重复

- **文件与行号**：`src/components/online/lobby/LobbyMatchmaking.tsx:80-82`（`<div className="lobby-friend-divider"><span>{labels.orJoinExisting}</span></div>`）与 `:84-89`（新增 h3 小标题）；文案 `src/i18n/dictionaries.ts` 的 `orJoinExisting`（`:357/:585/:813/:1041/:1269/:1497`）与 `joinExistingRoom`（`:313/:541/:769/:997/:1225/:1453`）。
- **触发条件**：任意语言展开 friends 面板——两条文案在 DOM 与视觉上**相邻**渲染（分隔带紧邻小标题）。
- **实际行为**：6/6 语种的两条文案仅相差一个连接词：
  | 语言 | 分隔带 `orJoinExisting` | 加入卡片小标题 `joinExistingRoom` |
  |---|---|---|
  | en | `Or join an existing room` | `Join existing room` |
  | zh | `或加入已有房间` | `加入已有房间` |
  | fr | `Ou rejoindre un salon existant` | `Rejoindre un salon existant` |
  | es | `O unirse a una sala existente` | `Unirse a una sala existente` |
  | ru | `Или войти в существующую комнату` | `Войти в существующую комнату` |
  | ar | `أو الانضمام إلى غرفة موجودة` | `الانضمام إلى غرفة موجودة` |
- **期望行为**：同一屏内只出现一次「加入已有房间」引导语；分隔带承担纯视觉分隔职责。
- **根因**：Round 1 的 P3-1（要求渲染 `joinExistingRoom`，否则为死键）与 P3-2（要求 join 区存在无障碍可达标签）被同时以「保留分隔带文案 **且** 新增小标题」的方式实现，两条近似文案叠加。
- **影响范围**：视觉与读屏双通道重复播报同一指令（AX 树实测两者均在树内：`StaticText "OR JOIN AN EXISTING ROOM"` 与 `heading level=3 "Join existing room"`）；与本次任务「清晰区分创建/加入、消除歧义」的目标相悖。桌面 en/ru 与 390px ar 截图均可见两行重复文案直接相邻。
- **复现方法**：`/en`、`/ru`（1280×900）与 `/ar`（390×844）展开面板后截图；或读取 AX 树中两者并存。
- **修复建议**（择一，均须保持 6 语种同构与 `dictionaries.test.ts` 全绿）：
  (a) 分隔带恢复为纯装饰（重新 `aria-hidden="true"`），并把 `orJoinExisting` 六语种改为**纯连接词**（en `or` / zh `或` / fr `ou` / es `o` / ru `или` / ar `أو`）——此时 join 区标签由 h3 提供，Round 1 P3-2 的验收条件仍满足；
  (b) 删除 join 卡片的 h3，将分隔带 `<span>` 加 `id` 并作为 `lobby-join-form` 的 `aria-labelledby` 目标（文案可见且可达，`orJoinExisting` 不再是死键）。
- **修复后验收标准**：任意语言展开面板后，同屏不存在两条语义重复的引导文案；AX 树中 join 区仍存在可读标签（非 `role=none`/`name=null`）；创建按钮 `description` 保持为 hint 文案。

### P3-4　`assertFriendsSectionStructure` 误用 `waitForValue`，声明的 20s 等待实际退化为单次求值

- **文件与行号**：`tools/smoke-lobby-ui.ts:1210`（`const result = await waitForValue(async () => {`）、`:1241`（回调 `return { ... }`）、`:1251`（`}, STEP_TIMEOUT_MS);`）；契约定义 `tools/smoke-lobby-ui.ts:1667-1681`。
- **触发条件**：被断言的元素尚未渲染完成时（React 未 flush、首次编译/慢渲染、移动端切换 device metrics 后重排）。
- **实际行为**：`waitForValue` 仅在回调返回 `null` 时重试（`:1673 if (value !== null) return value;`），而本函数的回调**恒返回对象**（元素缺失时字段为 `false`/空串），故 `:1210` 只求值一次并立即进入 `:1253` 的失败分支抛出异常——`STEP_TIMEOUT_MS`（20s）参数完全失效。
- **期望行为**：与文件内其他调用一致（如 `:1276` 的 `return current.viewport.width === 390 ? current : null`），未就绪时返回 `null` 以在超时窗口内轮询重试。
- **根因**：未遵循 `waitForValue` 的「返回 `null` 表示未就绪」契约，把一次性快照直接作为返回值。
- **影响范围**：本轮新增的端到端守门在慢渲染场景下会**误报失败（假阴性）**，削弱烟测稳定性；不会造成假阳性放行。本机 dev(3000)/prod(3031) 两次实跑均未触发（`clickLobbySection` 到断言之间存在 CDP 往返，React 已完成 flush），故属健壮性缺陷而非当前实害。
- **复现方法**：代码路径确定（回调不存在 `return null` 分支）；构造方式为把断言调用移至 `button.click()` 之后立即执行且不做 CDP 往返。
- **修复建议**：在回调开头补未就绪短路，例如
  `if (!createBtn || !hint || !divider || !joinHeading || !joinInput || !joinForm) return null;`
  并保持超时后抛出 `Friends section structure assertion failed` 的既有失败语义。
- **修复后验收标准**：`assertFriendsSectionStructure` 的 `waitForValue` 回调存在 `return null` 未就绪分支；`npm run smoke:lobby-ui` 在 dev 与 prod 模式下新增断言仍通过。

---

## 三、待确认风险与未验证项

- **`npm run smoke:lobby-ui` 在本机为红，但不属本轮缺陷（已 A/B 归因）**：dev(`http://localhost:3000`) 与 prod(`PORT=3031 npm start`) 两次实跑均于 `tools/smoke-lobby-ui.ts:233 assertRoomError`（`Network.emulateNetworkConditions offline` 后离开房间的超时提示）超时失败；将本轮改动的 4 个文件（`globals.css`、`LobbyMatchmaking.tsx`、`dictionaries.ts`、`tools/smoke-lobby-ui.ts`）整体回退到本轮之前的 `bb3be08` 后，同一断言以完全相同的方式失败（`main:232`）。该断言与本轮变更无调用关系，判定为**既有环境/离线模拟问题**，不计入缺陷统计；本轮新增的两处断言（桌面 `:99`、390px RTL `:220`）在两次实跑中均先于该失败点通过。
- **未验证项**：真机读屏软件（NVDA/JAWS/VoiceOver）实际播报未验证（环境无读屏器）；P3-2/P3-3 的无障碍结论基于 CDP 计算出的 AX 树 `role/name/description/level`。`npm run verify:online` / `smoke:lobby` / `smoke:matchmaking` 未复跑（`STATUS.md:26` 相关基线按自述采信）。
- **残余观察（不构成缺陷）**：`assertFriendsSectionStructure` 的 `orderValid` 用 `compareDocumentPosition` 判定 DOM 顺序，未覆盖「视觉顺序与 DOM 顺序解耦」的布局；本轮布局为单列纵向流，实测几何 `top` 严格递增（create 706 < divider 788 < join 816 < form 842），两者一致。若未来改为多列布局，该断言需同步升级为几何顺序校验。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-3 文案重复消除（用户可见，优先级最高）**：先定稿分隔带与小标题的取舍（复用 `orJoinExisting` 为纯连接词，或让分隔带承担 `aria-labelledby` 目标），再动 CSS/DOM；需同步核对 6 语种并使 `dictionaries.test.ts` 全绿。
2. **P3-2 标题层级**：与第 1 步同一处改动，改为 `<h2>` 或非标题元素，确保 `aria-labelledby` 引用与样式不变。
3. **P3-1 `STATUS.md:11` 回填**：改为被审交付 `bb3be08`，并按双字段规则重写括注；本次提交的 SHA 由下一次交付回填。
4. **P3-4 烟测等待契约修复**：补 `return null` 未就绪短路；随后复跑 `npm run smoke:lobby-ui`（dev 与 prod 各一次）确认新增断言仍通过，并记录该套件既有 `assertRoomError` 失败为已知环境问题。
5. **回归与交接**：四道门禁全绿（`npx tsc --noEmit` / `npm run lint` / `npm test` / `npm run build`）；在 `docs/handoff/INDEX.md` 追加修复交接单。

复审验收标准：逐项对照上述各缺陷的「修复后验收标准」；复审方将复跑 P3-2/P3-3 的浏览器 AX 与截图取证、P3-4 的 dev/prod 烟测，并逐字比对 `STATUS.md:11`。
