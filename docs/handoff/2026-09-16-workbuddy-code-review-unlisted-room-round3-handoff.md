# 不公开房间创建/加入交互解耦（被审 `bca7674`）独立审查 — Round 3 复查

审查日期：2026-09-16
被审提交：`bca7674 fix(lobby): resolve round 2 review findings for unlisted room creation disambiguation`
基准提交：`165c56d`
审查结论：**未通过**（0×P0 / 0×P1 / 0×P2 / **1×P3**，需修复闭环后复审）

---

## 一、审查基本信息与通过项简述

- 版本核验：`git pull --ff-only`（Already up to date）后实际 HEAD = `bca7674d778d7db3494a2f5749e50b870dbc15fe`（等于待审 SHA），基准 `165c56d`，工作区干净；审查范围 `git diff 165c56d..bca7674`（12 文件，+729/−48），并单独复核本轮 `git diff 0dfce6b..bca7674`（5 文件）的实质改动。
- Round 2 四项 P3 **功能性修复全部真实生效**（逐项独立取证，详见下条与第二节证据）：`STATUS.md:11` 已按「审查提交记直接父提交、fix 类提交记被审产品交付」先例回填 `800a3cb`；小标题已为 `<h2>`（真实浏览器实测全站 heading 序列 `H1 → H2`，无跳级）；6 语种 `orJoinExisting` 已收敛为纯连接词且分隔带恢复 `aria-hidden="true"`（AX 全树中该文本已消失、`form` 仍有可读名）；`assertFriendsSectionStructure` 已补 `return null` 未就绪短路。
- 独立复跑门禁：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npx vitest run --pool=vmForks` **29 套 / 248 例全绿**、`npm run build` 成功（11 页预渲染）。
- 独立实跑 `tools/smoke-lobby-ui.ts`（本地 dev `PORT=3477`）：本轮改动的两处断言（`:99` 桌面、`:1316` 390px RTL）**均先于既有失败点通过**；套件在 `:233 → assertRoomError`（`:788`，离线模拟下离开房间超时）失败，属前两轮已 A/B 归因的既有环境问题，与本轮变更无调用关系。
- 独立真实浏览器取证（CDP 无头 Chrome）：`en@1280×900` 与 `ar@390×844` 各一轮，覆盖 heading 层级、`aria-describedby`/`aria-labelledby` 在 hydration 后的解析、AX `role/name/description`、`aria-hidden` 子树剪除、几何顺序与横向溢出（结果全部符合预期，详见第二节 P3 之外无异常）。
- **唯一缺陷**：Round 2 修复把 `orJoinExisting` 收敛为单字连接词后，本键的 2 处断言在其覆盖的 **2/2 语种**下退化为恒真（守门失效），属本轮以变异探针证伪的测试有效性缺陷（P3-1）。

---

## 二、审查发现与缺陷清单

### P3-1　`orJoinExisting` 收敛为单字连接词后，该键的 2 处断言在测试覆盖的 2/2 语种下恒真（守门失效）

- **文件与行号**：
  - 断言：`src/components/online/lobby/LobbyMatchmaking.test.ts:89`（六语种循环内 `expect(html).toContain(dictionary.room.orJoinExisting)`）、同源问题 `src/components/online/lobby/LobbyMatchmaking.test.ts:64-66`（`dividerSubstring` 150 字符窗口断言）；
  - 键值：`src/i18n/dictionaries.ts:585`（zh `orJoinExisting: "或"`）、`:1497`（ar `"أو"`）、`:1041`（es `"o"`）、`:357`（en `"or"`）；
  - 恒真来源：`src/i18n/dictionaries.ts:524`（zh `createOrJoin`，内含「或」）、`:1436`（ar `createOrJoin`，内含「أو」），该文案由**常驻渲染**的折叠按钮副标题 `src/components/online/lobby/LobbyMatchmaking.tsx:52` 输出，与分隔带同处一份 HTML。
- **触发条件**：分隔带不再渲染连接词——删除 `LobbyMatchmaking.tsx:81` 的 `<span>{labels.orJoinExisting}</span>`，或该键被误改成空串以外的任意重复串。
- **实际行为**（变异探针实测，未走仓库既有测试文件、不改产品代码）：按 `:89` 的断言式复算，并把 `<span>` 整体删除后逐语种重新求值：

  | 语种 | `orJoinExisting` | 未变异 | 删除分隔带 `<span>` 后 | 判定 |
  |---|---|---|---|---|
  | zh（`:89` 覆盖） | `或` | true | **true** | 恒真 ✗ |
  | ar（`:89` 覆盖） | `أو` | true | **true** | 恒真 ✗ |
  | es | `o` | true | **true** | 恒真 ✗（150 字符窗口内 `class="lobby-friend-divider"` 自身即含 `o`，`:66` 同样恒真） |
  | en / fr / ru | `or` / `ou` / `или` | true | false | 当前可检出 ✓（属侥幸，非设计） |

  即：断言声称校验「该语种连接词确实渲染」，但在 `:76` 实际遍历的 zh、ar 两语种下，连接词即使完全不渲染也仍然通过。
- **期望行为**：该断言仅应在分隔带自身确实渲染出 `orJoinExisting` 时通过。
- **根因**：断言作用域是整个文档（`toContain`），而键值在本轮被从整句收敛为 1 个字符后，已成为常驻同级文案 `createOrJoin` 的子串（zh「或」/ar「أو」）；`:66` 的 150 字符窗口又从 `class="lobby-friend-divider"` 起始，窗口内类名本身即可命中单字符键值。
- **影响范围**：门禁 3（唯一不依赖外部服务/浏览器即可运行的自动化层）对本键失去守门能力；删除连接词的结构性回退只能由非门禁项 `tools/smoke-lobby-ui.ts:1244`（`dividerText` 非空）兜底。属**本轮新引入**（上一版 `orJoinExisting` 为整句「或加入已有房间」，不与他键重叠），与 Round 1 P3-3「验收标准零自动化守门」同族。
- **复现方法**（可逆探针，约 20 秒；探针后 `git status --porcelain` 为空）：
  1. 建临时脚本渲染组件（与既有单测同法）：`renderToString(<LobbyMatchmaking dictionary={dictionaries.zh.game} isFriendsOpen onToggleFriends={() => {}} room={<mock>} />)`；
  2. 变异：`const mutated = html.replace(/(<div class="lobby-friend-divider" aria-hidden="true">)<span>[^<]*<\/span>/, "$1")`；
  3. 复算断言：`mutated.includes(dictionaries.zh.game.room.orJoinExisting)` → **true**（等价于 `:89` 通过）；ar 同法同为 true。
  4. 交叉验证（同一探针内的官方口径）：真实浏览器已确认分隔带文本确为该键值（en 渲染为 `OR`、ar 为 `أو`，`text-transform: uppercase`），故变异删除后文本确已消失，断言仍通过。
- **修复建议**（择一，均不改变产品行为）：
  - (a) 断言收窄到分隔带子树，替换 `:64-66` 与 `:89` 的全文 `toContain`：
    ```ts
    const dividerMatch = html.match(/<div class="lobby-friend-divider" aria-hidden="true"><span>([^<]*)<\/span><\/div>/);
    expect(dividerMatch?.[1]).toBe(dictionary.room.orJoinExisting);
    ```
  - (b) 若需保留循环结构，则对每语种均使用上述单元素捕获值断言（而非整份 HTML）。
- **修复后验收标准**：把 `LobbyMatchmaking.tsx:81` 的连接词 span 删除（或把键值改为不与他键重叠的任意串）后，`npx vitest run --pool=vmForks` **必然失败**并指回该断言；未变异时 29 套 / 248 例全绿；`npx tsc --noEmit`、`npm run lint`、`npm run build` 全绿。

---

## 三、待确认风险与未验证项

- **待确认风险**：无（未发现其他有合理怀疑依据的隐患）。
- **既有非缺陷项**：`npm run smoke:lobby-ui` 在本机红于 `tools/smoke-lobby-ui.ts:233 → :788 assertRoomError`（`Network.emulateNetworkConditions offline` 后离开房间的超时提示）。本轮实跑确认失败点位于本轮两处新断言之后，且该断言与本轮变更无调用关系；沿用前两轮的基线 A/B 归因，不计入缺陷统计。
- **未验证项**：
  1. 真机读屏软件（NVDA/JAWS/VoiceOver）实际播报；本次无障碍结论基于 CDP 计算的 AX 树 `role/name/description/level` 与全树 `StaticText` 存在性；
  2. `npm run verify:online` / `smoke:lobby` / `smoke:matchmaking` 未复跑（`STATUS.md:26` 相关基线按自述采信）；
  3. 本轮仅覆盖 `en` 与 `ar` 两种语言的真实浏览器取景（`fr/es/ru/zh` 由 Node 端 SSR 渲染探针覆盖结构，未做浏览器 AX 取证）。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-1 断言收窄**（唯一缺陷，单文件单处改动）：按 (a) 方案把 `LobbyMatchmaking.test.ts` 对 `orJoinExisting` 的两处断言改为对分隔带 `<span>` 捕获值的等值断言；`zh/ar` 循环保持覆盖。
2. **门禁回归**：`npx tsc --noEmit` / `npm run lint` / `npx vitest run --pool=vmForks` / `npm run build` 全绿；建议附一次变异探针结果（删除 span 后测试必红）作为守门有效性证据。
3. **交接沉淀**：在 `docs/handoff/` 生成修复交接单并追加 `docs/handoff/INDEX.md`；按先例把 `STATUS.md:11` 回填为本轮被审交付 `bca7674`（本次审查提交自身已按「审查提交记直接父提交」规则把该字段置为 `bca7674`）。
4. **复审验收标准**：逐字复核断言是否已收窄至分隔带子树；复审方将重跑「删除 span ⇒ 测试失败」的变异探针、`--pool=vmForks` 全套单测与真实浏览器 AX 取证（heading 层级 / 创建按钮 `description` / `form` 可读名 / 分隔带子树不在 AX 树内应保持不变）。
