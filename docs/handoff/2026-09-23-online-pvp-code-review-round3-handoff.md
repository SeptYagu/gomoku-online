# 独立代码审查 Round 3 复查交接单 —— 联机对战账号登录与防冒名（Round 2 两项缺陷闭环复核）

> 被审提交：`83a2aab`　基准提交：`b2c6383`　审查范围：`b2c6383..83a2aab`（29 文件，+3561/−148）
> 判定：**未通过**　缺陷统计：0×P0 / 0×P1 / **1×P2** / 0×P3
> 说明：本文件名沿用本特性实现期审查的既有命名（`…-online-pvp-code-review-roundN-handoff.md`），以避免与**方案期**同名文档 [`2026-09-23-workbuddy-code-review-round3-handoff.md`](2026-09-23-workbuddy-code-review-round3-handoff.md) 覆盖。

---

## 一、审查基本信息与通过项简述

工作区干净（探针用后即删、变异探针已复原，`git status` 复核为空），`git pull --ff-only` 后实际 HEAD = `83a2aab4556fd469452ed82a6a4462e0c1631bf3`，与被审 SHA 一致；本轮增量（相对 Round 2 被审 `eac1b95`）为 6 文件 / +187/−27，其中源码仅 `accounts.ts` 17 行。**P3-1（自动派生代号并发误报）确已闭环**：独立并发探针实测 3 路同基名不同显示名（`Dana!`/`Dana?`/`Dana#`）并发注册全部 `ok:true` 且代号互异（`dana`/`dana_7tzl4o`/`dana_6ootde`）、显式同代号并发仍正确拒绝、`findByPublicHandle` 一致性命中对应账号。**`U+0130` 冒名窗口确已关闭**（24 单元末位 `İ` 的同名提交返回 `name-reserved`），且本轮两条新守门单测经变异探针自证有效（还原 `:146-147` 顺序 → P2-1 用例红；还原 `:317-319` 重派生 → P3-1 用例红）。四道本地门禁实跑全绿（见下），但 **P2-1 的幂等性闭环不成立**，详见第二节。

---

## 二、审查发现与缺陷清单

### P2-1　Round 2 P2-1 修复不完整：`canonicalizePlayerName` 仍非幂等（剥离 `\p{Cf}` 早于 NFKC、`toLowerCase()` 早于 NFKC），守门点二次规范化 ⇒「格式字符 + 组合附加符」型注册名仍可被访客完整冒用

- **严重级别**：**P2**（与 Round 2 P2-1 同一验收标准「拒绝访客使用已注册显示名」在另一输入子集上仍不成立；影响面同为完整冒名，触发窗口同为窄窗，故与上轮同级定级）
- **文件与行号**：
  - 非幂等本体：`src/server/accounts.ts:140-148`（管线为 `normalize("NFKC")`（`:142`）→ 剥离 `\p{Cf}` 等（`:143`）→ 折叠空白/`trim`（`:144-145`）→ `toLowerCase()`（`:146`）→ `slice(0, MAX_PLAYER_NAME_LENGTH)`（`:147`））
  - 守门点双重应用：`src/server/accounts.ts:897`（`canonicalizePlayerName(normalizeDisplayName(input.playerName))`）→ `:898` `isNameReserved(requestedName)`；而 `isNameReserved` 内部 `:484` **再规范化一次**；账号侧 `:487` 仅规范化**一次**
  - 单点裁决处：`src/server/accounts.ts:869-937`（`resolvePlayerIdentity`，全仓唯一调用点 `src/server/room-socket.ts:660`）
  - 新守门单测的语料缺口：`src/server/accounts.test.ts:968-1006`（幂等断言语料 8 条，`:970-980`）
- **触发条件**：任一**已注册账号**的显示名中，存在「被 `:143` 正则剥离的格式字符（`\p{Cf}`／`\u200B-\u200F`／`\u2028-\u202F`／`\u2060-\u206F`／`\uFEFF`）**紧跟**一个可与前邻字符做规范合成的组合附加符（`Mn`，如 `U+0301`）」，访客以**与该注册名逐字节相同**的字符串提交加入（无需追加、修改任何字符）。
- **实际行为与期望行为**：
  - 期望（Round 2 P2-1 验收标准 + 本轮交接单自述「对任意输入天然恒等」「彻底消除二次规范化发散漏洞」）：`canon(canon(x)) === canon(x)` 对任意输入成立；上述同名提交返回 `name-reserved`。
  - 实际：`isNameReserved(注册名) === true`（谓词自身认为已保留），但守门实际取值 `isNameReserved(canon(注册名)) === false` ⇒ `resolvePlayerIdentity` 返回 `ok:true`，访客**以完整注册名入座**（房间展示名、大厅 Presence、公聊、对局记录均使用该名，且与服务端存储的注册名逐字节相同）。
- **根因（三条独立事实叠加，前两条与上轮已修的 `slice`/`toLowerCase` 顺序问题无关）**：
  1. **剥离时机错误**：NFKC 的规范合成会被夹在基字符与组合附加符之间的 `Cf` **阻塞**（实测 `"a\u200D\u0301b".normalize("NFKC")` 不变），而 `:143` 的剥离发生在 `:142` 的 NFKC **之后** ⇒ 一次调用产出「基字符 + 裸附加符」的**分解**序列，二次调用才由 NFKC 合成 ⇒ `canon` 非幂等。例：`"a\u200D\u0301bcdefghij"` → `canon = "a\u0301bcdefghij"`（11 单元）、`canon² = "ábcdefghij"`（10 单元）。
  2. **`toLowerCase()` 时机错误**：小写映射可**新产出**可合成序列（如 `"a\u03AA\u0301b"` → `canon = "a\u03CA\u0301b"`、`canon² = "a\u0390b"`），故即使把剥离移到 NFKC 之前，非幂等仍残留（实测 13 例 `\u03AA` 类）。
  3. **守门点双重应用**：`:897` 先规范化一次，`isNameReserved` 内部 `:484` 再规范化一次，而账号侧 `:487` 只一次 ⇒ 两侧口径相差一次规范化，恰在上条任意非幂等输入上发散。
- **影响范围**：访客可完整冒用该类注册名（与 Round 2 P2-1 影响面完全相同）；且 `resolvePlayerIdentity` 是房间入座/重连、`presence:join`、`public-chat:send` 等**全部身份裁决的唯一入口**，冒名在所有这些面上同时成立。附带：本次交接单与 `STATUS.md` 中「100% 规范化幂等性（`canon(canon(x)) === canon(x)`）」的表述与实现不符。
- **复现方法与证据**：
  - **独立探针 1（非幂等扫描，临时 `tsx` 直调真实模块，用后即删）**：遍历码点 `0x20..0x2FFFF`（跳过代理区）各以 5 种拼接模式构名（`ch`、`a+ch+U+0301+b`、`a+U+200D+ch+b`、`A+ch`、`a+ch+U+0301` ×3），**当前实现 101 例非幂等**（样本：`"a\u200D\u0301b"`、`"a\u200B\u0301b"`、`"a\u2060\u0301b"`、`"a\u00AD\u0301b"`、`"a\u2028\u0301b"`、`"a\u03AA\u0301b"`）。
  - **独立探针 2（端到端冒名，同一探针）**：
    ```
    createAccount({displayName:"a\u200D\u0301bcdefghij"})       => ok:true
    isNameReserved("a\u200D\u0301bcdefghij")                   => true     ← 谓词判为已保留
    isNameReserved(canon("a\u200D\u0301bcdefghij"))            => false    ← 守门实际取值
    resolvePlayerIdentity({playerName:"a\u200D\u0301bcdefghij"}) =>
      {"ok":true,"value":{…,"identity":"guest","playerName":"a\u200D\u0301bcdefghij"}}   ← 冒名成功
    ```
    对照（均为预期行为）：`"A"*23 + "İ"`（上轮窗口）→ `name-reserved` **已拦截**；`"Zed\u200B\u0301zz"`（剥离后无可合成对）→ 幂等、已拦截；`"Alice"` → 已拦截。
  - **可达性核实**：注册接口对显示名无字符集校验（`src/server/online-server.ts:108-112` 仅透传 `displayName`；`createAccount` 仅做 `normalizeDisplayName`），`resolveSocketPlayer`（`src/server/room-socket.ts:634-677`）亦无名字校验即调用 `resolvePlayerIdentity` ⇒ 受害者可正常注册该类名字、攻击者可直连 Socket.IO 提交逐字节同名（客户端非权威）。
  - **测试有效性反证**：把上述冒名名加入 `accounts.test.ts:970-980` 的语料后，`:981-983` 的幂等断言即变红（探针实测 `canon ≠ canon²`）⇒ 现有 8 条手挑语料对残留非幂等**失效**，该断言当前提供的是虚假保证。
- **修复建议**：
  1. **首选（1 行，最小且彻底，与幂等性解耦）**：守门只规范化一次——`accounts.ts:897` 改为 `const requestedName = normalizeDisplayName(input.playerName);`（或直接 `if (accountStore.isNameReserved(input.playerName))`）。此后守门判据与账号侧 `:487` 同为「对 `normalizeDisplayName` 产物做单次 canon」，两侧口径完全一致，**无论 canon 是否幂等都不再发散**。探针验证：对上述全部边界名，`isNameReserved(normalizeDisplayName(raw))` 恒为 `true`。
  2. **备选（消除非幂等本体，须同时做两处 + 固定点，单独改一处不成立）**：把剥离置于 NFKC **之前**，并让 NFKC 位于 `toLowerCase()` **之后**，或对管线做有界固定点迭代。实测单点改动的残余：`strip→NFKC→lower` 剩 13 例（`\u03AA` 类）；`strip→lower→NFKC` 因 `U+00A8` 兼容分解出前导空格反而恶化至 3331 例；3 次固定点迭代剩 1 例。**故不建议只调顺序而不配方案 1 的单次规范化守门。**
  3. **测试**：把 `accounts.test.ts:976-983` 的手挑幂等语料改为**行为断言**——对一组对抗性名字（`\p{Cf}`+组合附加符、`U+0130` 类展开字符、零宽、全角、`U+03AA` 类）逐一断言 `isNameReserved(该注册名) === true` 且 `resolvePlayerIdentity` 返回 `name-reserved`；若采用备选修复，再补幂等守恒断言。
- **修复后验收标准**：
  1. 以 `"a\u200D\u0301bcdefghij"`、`"alice\u200D\u030C"` 等注册账号后，访客以**逐字节同名**提交 `resolvePlayerIdentity`，断言 `error.code === "name-reserved"`；
  2. 断言守门判据与账号侧判据同口径（`isNameReserved(该注册名) === isNameReserved(canon(该注册名))`）；
  3. 回退本次修复（还原 `:897` 的预规范化或还原顺序）后上述断言必须确定性变红；
  4. 保留上轮已闭环项不回退：`"A"*23 + "İ"` 仍被拦截、24 ASCII + 追加字符仍被拦截、P3-1 并发用例（`accounts.test.ts:1009-1039`）保持绿。

---

## 三、待确认风险与未验证项

**待确认风险**

1. **canon 非幂等的残余类别是「结构性问题」而非单例**：本案只是同一缺陷类别的一个输入子集。任何**将来新增**的「对同一名字应用两次 canon」调用点（或把 canon 结果再喂给 canon／`findByPublicHandle` 之类的规范化入口）都会重新引入同类守门发散（`isNameReserved:488` 已把 canon 结果当公开代号再规范化一次）。怀疑依据：实测 101 例非幂等输入分散在 `\p{Cf}`、`\u200B-\u200F`、`\u2028-\u202F`、`\u2060-\u206F`、`\uFEFF` 多个区段与 `Mn` 组合之上。建议把「canon 只允许单次应用」写成契约注释，或让 `isNameReserved` 对入参直接做幂等断言。未定级（当前仅一处发散，且已在 P2-1 中覆盖）。
2. `isNameReserved` 的 `O(n)` 全表规范化扫描仍位于 `presence:join` / `public-chat:send` 热路径（承 Round 2 记录，本轮未改动该路径，按多轮防漂移规则**不计缺陷、不重复要求修复**）。

**未验证项**

1. 未在真实 Socket.IO 服务端做端到端取证：本轮结论基于同进程直调真实模块（`tsx` 探针）+ 静态调用链（`room-socket.ts:660` 为全仓唯一裁决点）。残余风险低但存在——上报的 `playerName` 若在传输层被任何中间件改写，结论需重新采样。
2. 6 语种 `nameReservedError` 文案的真实渲染与 RTL 取样（承 Round 2 未验证项，本轮未改动该链路，风险不新增）。
3. 未复现项：无。四道门禁均实跑（见下），无需声明"未跑"。

**本轮门禁实测（实跑，非引用交接单）**：`npx tsc --noEmit` → exit 0；`npm run lint` → exit 0（0 错误 0 警告）；`npx vitest run` 与 `npx vitest run --pool=vmForks` → **均 35 套 / 357 例全绿**（上轮记录的「默认 pool 无法启动任何测试文件」在本机已不复现，`useRoomChat.test.ts` 4 例 Mock 修复后确定性通过）；`npm run build` → exit 0（18/18 路由，`/[locale]` 与 `/[locale]/feedback` 保持 `● (SSG)`）。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**

1. **P2-1（安全守门，唯一缺陷）**：先做方案 1 的单次规范化（1 行，立即可消除守门发散），再补行为断言型守门单测；是否进一步把 canon 做成真幂等（方案 2 的固定点）可作为 defense-in-depth 与本轮并行，但**不得以方案 2 单独替代方案 1**。

**复审验收标准（Round 4，须逐条给出证据）**

1. `resolvePlayerIdentity` 对「逐字节同名的已注册名」在以下语料上均返回 `name-reserved`：`"a\u200D\u0301bcdefghij"`、`"alice\u200D\u030C"`、`"a\u03AA\u0301b…"`、`"A"*23 + "İ"`、24 ASCII + 追加字符；且回退修复后必须变红。
2. 守门判据与账号侧判据同口径（单次规范化）有可执行断言或代码注释契约；
3. Round 2 已闭环项不得回退：`U+0130` 窗口拦截、P3-1 并发代号重派生（`accounts.test.ts:1009-1039`）、`U+200B/U+2060/U+00AD`/全角变体拦截；
4. 四道本地门禁全绿（可运行的 `npm test` 全量 357 例 + `npm run build`）；
5. 交接单/`STATUS.md` 中关于幂等性的表述与实现一致（不再声称「对任意输入恒等」，或改为已实测成立的固定点方案）。

---

**审查结论**：本轮 **未通过**。Round 2 的 P3-1（并发自动派生代号误报）已实质闭环，`U+0130` 冒名窗口亦已关闭，四道门禁实跑全绿；但 **P2-1 的幂等性闭环不成立**——`canonicalizePlayerName` 对「`\p{Cf}` + 组合附加符」输入仍非幂等（剥离早于 NFKC、`toLowerCase()` 早于 NFKC），叠加守门点双重规范化，访客仍可以**逐字节相同**的注册名完整冒名（已用真实模块探针端到端复现），且 `STATUS.md`/交接单中「100% 规范化幂等性」的表述与实现不符。请按上述顺序修复后派发 Round 4 复查。
