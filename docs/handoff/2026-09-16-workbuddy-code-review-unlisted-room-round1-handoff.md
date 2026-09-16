# 不公开房间创建/加入交互解耦（被审 `bb3be08`）独立审查 — Round 1

审查日期：2026-09-16
被审提交：`bb3be08 fix(lobby): disambiguate unlisted room creation and join flow`
基准提交：`165c56d`
审查结论：**未通过**（0×P0 / 0×P1 / 0×P2 / **4×P3**，需修复闭环后复审）

---

## 一、审查基本信息与通过项简述

- 版本核验：`git pull --ff-only` 后实际 HEAD = `bb3be08f7d967929e1066f42baecab30fe4573a6`（等于待审 SHA），基准 = `165c56d`，工作区干净；实际审查范围 `git diff 165c56d..bb3be08`（6 文件，+198/−47），已逐文件阅读并追踪调用方（`LobbyMatchmaking` 由 room 模式渲染；`room.createRoom/joinRoom/canCreateRoom/canJoinRoom` 契约未变；`labels.createOrJoin` 的第二消费点 `GameShell.tsx:580 getRoomStatusNote` 一并核验）。
- 需求覆盖：验收标准 2（6 语种字典扩充）无遗漏——`createUnlistedRoomHint`/`joinExistingRoom`/`orJoinExisting` 三键在 en/zh/fr/es/ru/ar 齐备、字母序正确、非空且无占位符，`dictionaries.test.ts` 3 例通过；验收标准 1（UI 分离）真实浏览器实测成立（见下）。
- 独立验证：仓库无 jsdom，故以 CDP 无头 Chrome 驱动真实页面，在 `en/zh/ar/ru × 390/641/1280` 共 8 组视口实测：创建按钮 → 提示 → 分隔带 → 加入输入框 → 加入按钮的 DOM 顺序与几何顺序一致、无横向溢出、无元素重叠、`ar` 下 `dir=rtl` 镜像正常；`createOrJoin` 加长后在第二消费点（侧边栏状态注记，390px `ru`）实测正常换行且页面无 overflow 元素。
- 门禁独立复跑：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npx vitest run --pool=vmForks` 28 套 / 245 例 100% 通过（与 `STATUS.md:26` 声称一致）；`STATUS.md:11` 双字段按先例判定合规（`bb3be08` 为交付/修复类提交，记录其直接前驱交付 `165c56d`）。`npm run build` 与联机烟测未复跑（见第三节）。

---

## 二、审查发现与缺陷清单

### P3-1　`joinExistingRoom` 六语种文案已扩充但从未渲染（死键），交接单却声称其已交付

- **文件与行号**：`src/i18n/dictionaries.ts:81`（类型声明）与 `:313` / `:541` / `:769` / `:997` / `:1225` / `:1453`（en/zh/fr/es/ru/ar 取值）；对照实际消费点 `src/components/online/lobby/LobbyMatchmaking.tsx:74-76`（只用 `labels.orJoinExisting`）。
- **触发条件**：任意语言进入大厅 → 展开「与好友游玩」面板。
- **实际行为**：字典内存在 6 条 "Join existing room / 加入已有房间 / Rejoindre un salon existant / Unirse a una sala existente / Войти в существующую комнату / الانضمام إلى غرفة موجودة" 文案，但渲染 DOM 与无障碍树中**不存在**该文本（实测 `rendersJoinExistingRoom=false`，8 组视口/语言全部为假）；`src/` 内除 `dictionaries.ts` 外对该键零引用。
- **期望行为**：新增字典键必须被渲染；若不需要则不应新增。
- **根因**：join 卡（`.lobby-friend-join-card`）最终没有标题，区段文案改由 `aria-hidden` 分隔带承载，为此准备的 `joinExistingRoom` 未接线即合入。
- **影响范围**：6 语种各 1 条永不展示的文案（翻译与审校维护成本）；`docs/handoff/2026-09-16-unlisted-room-creation-disambiguation-handoff.md` §2.1 第 3 条与 `docs/handoff/INDEX.md` 把该键描述为已交付的「区段分隔/加入指示文案」，与实现不符——后续读者会误以为 join 区已有标题。
- **复现方法**：`grep -rn "joinExistingRoom" src/` → 仅命中字典文件；浏览器探针在面板展开后对 `document.body.innerText` 匹配该串 → 恒为 false。
- **修复建议**：二选一，均须保持 `dictionaries.test.ts` 全绿——(a) 用 `labels.joinExistingRoom` 作为 `.lobby-friend-join-card` 的可见小标题（同时消解 P3-2 的 join 区无标签问题）；(b) 从 `GameDictionary` 类型与 6 语种中删除该键。
- **修复后验收标准**：`grep -rn joinExistingRoom src/` 要么命中 `LobbyMatchmaking.tsx` 中的渲染点、要么零命中；四道门禁全绿。

### P3-2　本次交付的解耦文案对读屏用户未生效：承载区分语义的分隔文案被整体移出无障碍树，创建按钮的说明文案未与按钮建立程序化关联

- **文件与行号**：`LobbyMatchmaking.tsx:74-76`（`<div className="lobby-friend-divider" aria-hidden="true"><span>{labels.orJoinExisting}</span></div>`）；`LobbyMatchmaking.tsx:70`（`.lobby-friend-hint`）与 `:60-69`（创建按钮，无 `aria-describedby`）。
- **触发条件**：读屏用户（NVDA / JAWS / VoiceOver）以 **Tab 焦点导航**（而非虚拟光标浏览）遍历该面板。
- **实际行为**（CDP `Accessibility.getPartialAXTree` 实测，en @1280×900）：
  - `.lobby-friend-divider` → `role="none"`、`name=null`；
  - `.lobby-friend-divider > span` → `role="none"`、`name=null`（被整体剪除，文本不可达）；
  - 创建按钮 → `name="Create unlisted room"`、**`description=null`**（说明文案未关联）；
  - 对照：`.lobby-friend-hint` → `role="paragraph"`（虚拟光标下可读到）、join 输入框 → `name="Room link, code, or @handle"`、join 按钮 → `name="Join room"`（均正常）。
- **期望行为**：用于隔离「创建」与「加入」的语义应对无障碍技术可见（join 区有可读标签；创建按钮聚焦时可听到「自动分配随机码」的说明）。
- **根因**：把承载语义（非纯装饰）的区段文案整体 `aria-hidden`，改用视觉相邻的 `<p>` 表达创建说明却未用 `aria-describedby` 建立程序化关联。
- **影响范围**：读屏用户拿到的恰是本次任务要消除的原始模糊心智模型（创建按钮无说明 + 加入区无引导语）。因 hint 在虚拟光标下仍可读，属局部失效而非完全不可达。
- **复现方法**：`DOM.querySelector` → `DOM.describeNode` → `Accessibility.getPartialAXTree` 逐个取值，结果如上。
- **修复建议**：为创建按钮加 `id`、以 `aria-describedby` 指向 `.lobby-friend-hint`；join 区改用可读标签（把 `joinExistingRoom` 作为小标题，或用 `aria-labelledby` / `fieldset + legend`），不要将承载语义的文字整体置为 `aria-hidden`（纯装饰线可由伪元素承担）。
- **修复后验收标准**：AX 中创建按钮 `description` 等于 hint 文案；join 区存在可读标签（非 `role=none`/`name=null`）；四道门禁全绿。

### P3-3　验收标准 1（UI 清晰分离创建/加入卡片）零自动化守门：整块组件回退到基准后全部测试仍绿

- **文件与行号**：`src/i18n/dictionaries.test.ts:7-33`（仅校验键同构、占位符一致、非空，无法发现未使用键）；`tools/smoke-lobby-ui.ts:1208-1254`（RTL 移动端大厅断言的选择器集合为 `.lobby-primary-action` / `[data-lobby-section-toggle="friends"]` / `.room-lobby` / `.lobby-secondary-actions` 与 2 个 `criticalTargets`，不含任何新元素）；`tools/smoke-lobby-ui.ts:1496-1514`（仅按 `[data-lobby-section="friends"] input` 写房间码）。
- **触发条件**：把 `LobbyMatchmaking.tsx` 整体回退到基准版本，或仅删除 hint / divider 两个新元素。
- **实际行为**（实测）：
  1. `git checkout 165c56d -- src/components/online/lobby/LobbyMatchmaking.tsx` 后 `npx vitest run --pool=vmForks` → **28 套 / 245 例 100% 通过**；
  2. 仅移除 `<p className="lobby-friend-hint">` 与 `.lobby-friend-divider` 后 → 同样 **245/245 通过**；
  3. `tools/` 内对新类名（`lobby-friend-hint|divider|create-card|join-card`）与新键的引用为 **0**（检索无命中）。
- **期望行为**：至少存在一项自动化断言能在此类结构性回退时失败。
- **根因**：仓库无 jsdom / 组件测试（`vitest` 为 node 环境），本次为纯 JSX/CSS 结构变更，既无单测覆盖，也不在既有烟测的断言选择器集合内。
- **影响范围**：任何后续重构删除卡片/提示/分隔带均无回归信号；当前「创建与加入清晰分离」仅由人工目视保障。
- **复现方法**：上述第 1、2 条命令即可证伪（可逆，探针后 `git checkout HEAD -- .` 复原）。
- **修复建议**：在既有 CDP 烟测 `tools/smoke-lobby-ui.ts` 中补断言：展开 friends 面板后 `.lobby-friend-hint` 文本非空；DOM 顺序 `createBtn < divider < joinInput`；390px 下**面板展开态**无横向溢出（现有 RTL 移动端断言未覆盖展开态）。
- **修复后验收标准**：制造同等的结构性回退（删除 hint/divider 或还原组件）时烟测必须失败；烟测与四道门禁全绿。

### P3-4　新增 `createUnlistedRoomHint` 的 "private share link" 与同面板 `unlistedRoomNotice`「这不是访问保护」语义相悖

- **文件与行号**：`src/i18n/dictionaries.ts:299`（en "…and private share link."）、`:755`（fr "lien d'invitation privé"）、`:983`（es "enlace de invitación privado"）、`:1211`（ru "приватную ссылку-приглашение"）；对照同面板即时可见的 `:421`（en `unlistedRoomNotice`：任意拿到房间码或链接的人都能加入，**这不是访问保护**）。
- **触发条件**：任意语言展开「与好友游玩」面板（两段文案同屏相邻）。
- **实际行为**：创建卡提示称系统分配「私有的分享链接」，正下方即 `unlistedRoomNotice` 明示房间不受访问保护。
- **期望行为**：提示只说明「分配随机房间码与分享/邀请链接」，不引入访问保护暗示。
- **根因**：新增微文案时未复用既有 notice 的措辞口径（zh/ar 的「专属/خاصًا」偏向"专享"、语气较轻，en/fr/es/ru 的 "private/приватную" 直接指向访问控制）。
- **影响范围**：用户可能基于"链接是私有的"产生错误安全预期（把不公开房间的链接投向不可信对象）；与同面板免责声明形成相反印象。
- **复现方法**：真实浏览器（en/ar/ru）展开面板，两段文案同屏可见。
- **修复建议**：4 个语种 hint 改为中性表述，例如 en `Allocates a random room code and a share link.`、zh 保持「系统将自动分配随机房间码与邀请链接。」（去掉"专属/private/приватную"类访问保护暗示）。
- **修复后验收标准**：6 语种 hint 不再含访问保护暗示用词；`dictionaries.test.ts` 全绿。

---

## 三、待确认风险与未验证项

- **未复跑项**：`npm run build`、`npm run verify:online` / `smoke:lobby` / `smoke:matchmaking` 未由审查方复跑（本轮以真实浏览器探针替代，已覆盖本次受影响的 UI 面）。因此生产构建与联机时序基线的独立性未验证，作者「门禁 4 全绿」结论按自述采信；需要一次 4~10 分钟本地构建窗口方可闭环。
- **残余观察（不构成缺陷，不计入缺陷统计）**：`.lobby-friend-divider` 使用 `letter-spacing: 0.04em`（`src/app/globals.css:517`），与本仓既有"显式归零"惯例（`globals.css:148` `.eyebrow`、`:155` `h1`）不同。审查方以 4× DPR 截取阿拉伯语分隔带前后对比图实测字距 146.48px → 144.56px，**未观察到阿拉伯文连写断开或视觉劣化**，故不列为缺陷；若后续在更小字号或其它阿拉伯字体下出现连写断裂，可作为样式一致性候选修复点。
- **未验证项**：真机读屏软件（NVDA / VoiceOver）的实际播报行为未验证（环境无读屏器）。P3-2 的结论基于 CDP 无障碍树计算出的 `role` / `name` / `description` 值，若需推翻需以真机播报为反证。

---

## 四、推荐修复顺序与复审验收标准

1. **P3-1 + P3-2 合并修复（同一处改动）**：给 join 卡加可见标题（复用 `joinExistingRoom`），并为创建按钮补 `aria-describedby` 指向 hint——一次改动即可同时闭环"死键"与"无障碍语义缺失"。
2. **P3-3 补测试守门**：在既有 `tools/smoke-lobby-ui.ts` 内补展开态断言（依赖第 1 步定稿的类名与 DOM 顺序）。
3. **P3-4 文案口径收敛**：4 个语种 hint 去私有化用词，与 `unlistedRoomNotice` 对齐。
4. **回归与交接**：本地四道门禁 + 联机烟测全绿；提交时按双字段规则把 `STATUS.md:11` 回填为被审交付 `bb3be08`，并在 `docs/handoff/INDEX.md` 追加修复交接单。

复审验收标准：逐项对照上述各缺陷的「修复后验收标准」；重点复核 P3-2 的 AX `description` 与 join 区标签是否真实生效、P3-3 的"结构回退即失败"是否可证伪（复审方将复跑该证伪步骤）。
