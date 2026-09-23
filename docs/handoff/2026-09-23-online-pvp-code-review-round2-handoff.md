# 独立代码审查 Round 2 复查交接单 —— 联机对战账号登录与防冒名（Round 1 四项缺陷闭环复核）

> 被审提交：`eac1b95`　基准提交：`b2c6383`　审查范围：`b2c6383..eac1b95`（26 文件，+3267/−128）
> 判定：**未通过**　缺陷统计：0×P0 / 0×P1 / **1×P2** / **1×P3**
> 说明：本文件名沿用本特性实现期审查的既有命名（`…-online-pvp-code-review-roundN-handoff.md`），以避免与**方案期**同名文档 [`2026-09-23-workbuddy-code-review-round2-handoff.md`](2026-09-23-workbuddy-code-review-round2-handoff.md) 覆盖。

---

## 一、审查基本信息与通过项简述

- 工作区干净；`git pull --ff-only` 后实际 HEAD = `eac1b95ec9d2540b84057d29ff3b8696b066e9a9`，与待审 SHA 一致；基准 `b2c6383` 为其父链第 8 代。本轮增量（相对 Round 1 被审 `5c03b7b`）为 11 文件 / +377/−24，改动集中在 `accounts.ts`（+22）、`OnlineLobbyView.tsx`（6 行）、`room-state-utils.ts`（+27）、`dictionaries.ts`（+19）与两份测试。
- **P2-1 竞态已实质闭环**：二次查重与 `accounts.set`/`persist` 已收进 `await hashPassword` 之后的同一同步 tick（`accounts.ts:308-336`），3 路同名并发、密码/无密码混合并发两种更强交错下均**恰一个成功**（证据见第二节 P3-1 对照），回退前序实现 `5c03b7b` 实测 `[true,true]` 双双成功，证明守门有效。
- **P3-1 服务端路径 A 已打通**：`OnlineLobbyView.tsx:271/321` 双门放宽为「令牌非空即可提交」，`identifier` 留空时 `JSON.stringify` 丢弃 `undefined` ⇒ 请求体仅含 `token`/`ownershipToken`，命中 `accounts.ts:368-374` 路径 A；占位文案 6 语种已收敛为「令牌登录或认领无密码账号」，不再承诺未实现的找回语义。
- **P3-2 死键已闭环**：`guestSessionError` 已进入 `GameDictionary.room` 必填成员 + 6 语种实值，`buildRoomMessages`（`room-state-utils.ts:69-83`）为唯一装配点且被 `GameShell.tsx:224` 使用（全仓仅此一处构造 `messages`），缺键即 `tsc` 红。
- 独立复算：本轮新增的**全部 44 条断言**（P2-1 6 条 / P2-2 5 条 / P3-1 5 条 / P3-2 28 条）以 `tsx` 逐条重放**全部 PASS**（因本机 vitest 无法启动，见第三节），另设计 4 组负向/边界探针，其中 **2 组构造出反例（见第二节）**。
- 门禁复跑：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npm run build` 18/18 路由成功（exit 0）；`npm test` 本机**无法运行**（环境级，非本次提交引入，见第三节）。

---

## 二、审查发现与缺陷清单

### P2-1　P2-2 修复不完整：`canonicalizePlayerName` 非幂等 + 守门点二次规范化，24 字符注册名末位为 U+0130 时访客仍可完整冒名

- **严重级别**：P2（与 Round 1 P2-2 同族、同一验收标准「拒绝访客使用已注册显示名」在特定场景下仍不成立）
- **文件与行号**：
  - 守门入参：`src/server/accounts.ts:892`（`canonicalizePlayerName(normalizeDisplayName(input.playerName))`）
  - 谓词内再次规范化：`src/server/accounts.ts:479`（`isNameReserved` 对已规范化的入参**再规范化一次**）；账号侧仅规范化一次：`:482`
  - 非幂等根因：`src/server/accounts.ts:146-147`（`.slice(0, MAX_PLAYER_NAME_LENGTH)` 在 `.toLowerCase()` **之前**）
- **触发条件**：被冒充账号的注册名**恰为 24 个 UTF-16 单元**，且其第 24 位是 `U+0130`（`İ`，LATIN CAPITAL LETTER I WITH DOT ABOVE）；访客以**完全相同**的字符串提交加入（无需追加任何字符）。
- **实际行为**：`isNameReserved(该注册名)` 自身返回 `true`（守门判据认为已保留），但经 `resolvePlayerIdentity` 的**二次规范化**后判据变为 `false`，访客**以完整注册名入座**。
- **期望行为**：`requestedName` 已是规范化结果，谓词对其再规范化必须**幂等**；该请求应返回 `name-reserved`。
- **根因（两条独立事实叠加）**：
  1. `canonicalizePlayerName` **非幂等**：`U+0130` 的 `toLowerCase()` 展开为 `i` + `U+0307`（长度 +1，且 `U+0307` 属 `Mn` 非 `Cf`，不被 `\p{Cf}` 剥离）；由于 `slice` 位于 `toLowerCase` **之前**，第一次规范化的结果长度为 25，第二次规范化把末尾组合点**截掉** ⇒ `canon(canon(x)) = "…i"`（24）而 `canon(x) = "…i̇"`（25）。
  2. 守门点 `:892` 已先规范化一次，`isNameReserved` 内部 `:479` 又规范化一次 ⇒ 属于**双重应用**；账号侧 `:482` 只应用一次 ⇒ 两侧口径相差一次规范化，恰在非幂等输入上发散。
- **影响范围**：访客可完整冒用该类注册名（房间展示名、大厅 Presence、对局记录均使用该名）；与 Round 1 P2-2 的影响面完全相同，仅触发输入集合收窄。
- **复现方法与证据**（临时 `tsx` 探针，直调真实模块，用后即删、工作区已复原）：
  ```
  registeredName = "A"*23 + "\u0130"（24 单元），createAccount ok = true
  canon(x)            => "aaaaaaaaaaaaaaaaaaaaaaai̇"   len 25
  canon(canon(x))     => "aaaaaaaaaaaaaaaaaaaaaaai"     len 24   ← 非幂等
  isNameReserved(registeredName)        => true    ← 谓词自身认为已保留
  isNameReserved(canon(registeredName)) => false   ← 守门实际取值
  resolvePlayerIdentity({playerName: registeredName}) =>
    {"ok":true,"value":{…,"identity":"guest","playerName":"AAAAAAAAAAAAAAAAAAAAAAAİ"}}   ← 冒名成功
  ```
  对照组（同一探针）：注册名 `"ABCDEFGHIJKLMNOPQRSTUVWX"`（24 ASCII）+ 追加 `"ZZZ"` ⇒ `name-reserved` **已拦截**（证明 Round 1 的截断绕过确已修复）；末位 `İ` 但长度为 23 或 11 时同样**已拦截**（`canon` 长度 ≤24，无截断发生，幂等成立）⇒ 漏洞仅在「长度恰为 24 且第 24 位为 `U+0130`」这一个窄窗口成立。
- **修复建议（择一，均为单点改动）**：
  1. **推荐**：交换 `accounts.ts:146-147` 顺序，使 `toLowerCase()` 先于 `slice(0, MAX_PLAYER_NAME_LENGTH)`。此时函数**对任意输入幂等**，二次应用天然无害，且 24 字符截断口径完全保持（探针模拟实测：`İ` 用例与 ASCII 用例均幂等、`24+追加` 仍判保留、守门形与账号形相等）。
  2. 或取消 `:892` 的预规范化（改回传 `input.playerName`），使规范化只发生一次；但需自行保证与 `normalizeDisplayName` 的截断口径一致，脆弱性更高。
- **修复后验收标准**：新增负向单测——注册 24 单元末位 `U+0130` 的名字，以该名本身提交 `resolvePlayerIdentity`，断言 `error.code === "name-reserved"`；并补一条**幂等守恒断言**（含 `U+0130` 在内的语料上 `canon(canon(x)) === canon(x)`）。两条断言在回退本修复后必须变红。

---

### P3-1　本轮新增的并发二次查重把「自动派生代号冲突」误判为 `duplicate-handle`，与已等待路径的回退语义不一致

- **严重级别**：P3（不破坏唯一性不变量，属可重试的瞬时误报；但错误语义与调用方未指定代号的事实不符）
- **文件与行号**：`src/server/accounts.ts:308-313`（`await` 之后新增的二次查重）；对照派生与回退路径 `:283-285`、`:534-555`（`createAvailablePublicHandle` 的 `_suffix` 兜底）；异步分支 `:304-306`；同步（无密码）分支 `:345-365`
- **触发条件**：两个注册请求**显示名不同**但 `createPublicHandleBase` 归一到**同一代号基名**（如 `Dana!` / `Dana?`、`Anna Maria` / `Anna-Maria`、`José` / `Jose`），且调用方**未显式指定 `publicHandle`**（正式客户端的注册表单默认留空，即 `publicHandle: undefined`），两者在 `hashPassword` 的 await 窗口内重叠进入。
- **实际行为**：后到者返回 `409 duplicate-handle`「This public handle is already registered.」——而该用户**从未选择过任何代号**。
- **期望行为**：与「先到者已落库后再注册」的同一场景保持一致——由 `createAvailablePublicHandle` 派生唯一代号（实测 `dana` / `dana_29ysna`）并成功注册。
- **根因**：`await` 之前的代号派生走的是**「找可用变体」**语义（`:283-285` → `:534-555` 的基名 + 后缀兜底），而 `await` 之后新增的二次查重走的是**「拒绝」**语义（`:311-313`）；await 让出期间基名被他请求占用后，代码不再重新派生，而是直接失败。同理，`accountId` 碰撞自愈循环（`:315-318`）落定后也未重算派生代号（此时派生代号用的仍是 `await` 前的旧 `id`）。
- **影响范围**：并发窗口内不同显示名的合法注册被瞬时拒绝，用户需重试（重试时基名已被占用，会走后缀兜底成功）；提示文案指向用户未指定的代号，可操作性差。**账号唯一性不变量未被破坏**（优于修复前的「同名共用代号」），故定 P3 而非 P2。
- **复现方法与证据**（同批探针）：
  ```
  F1 串行（先 await 再注册）: s1 ok handle="bob" / s2 ok handle="bob_29ysna"     ← 回退路径生效
  F2 同步无密码路径（同上）  : "cara" / "cara_axthki"                            ← 回退路径生效
  F3 并发重叠（Promise.all） : a ok handle="dana" / b FAIL duplicate-handle      ← 误报
  F4 显式同代号并发          : b FAIL duplicate-handle                            ← 语义正确（用户确实指定了代号）
  ```
- **修复建议**：`await` 之后仅对**调用方显式指定**的代号保留「拒绝」语义；未指定时在 `accountId` 碰撞循环落定后重算派生代号：
  ```ts
  let accountId = id;
  while (this.accounts.has(accountId)) accountId = this.createUniqueAccountId();
  const finalHandle = requestedHandle ? publicHandle : this.createAvailablePublicHandle(displayName, accountId);
  ```
  （`requestedHandle` 即 `:282` 已计算的 `input.publicHandle?.trim() ?? ""`，无需新增状态；`:315-318` 之后与 `:334-336` 的写入仍处于同一同步 tick，不会引入新的竞态。）
- **修复后验收标准**：新增并发守门单测——两个**不同显示名、同基名、均不带 `publicHandle`** 的带密码注册并发提交，断言**两者均 `ok:true` 且 `publicHandle` 互不相同**；回退为「仅二次查重、不重派生」后该用例必须变红。同时保留 P2-1 的同名并发用例为绿（同名必须先到 `duplicate-name`）。

---

## 三、待确认风险与未验证项

**待确认风险（均为前序提交既有行为，本轮未改动该路径，按多轮防漂移规则不计为缺陷）**

1. `isNameReserved`（`accounts.ts:478-485`）对全部账号做 `O(n)` 全表规范化扫描，而 `resolvePlayerIdentity` 经 `room-socket.ts:660` 被 `presence:join`、`public-chat:send` 等事件调用 ⇒ 访客**每条公共聊天消息**都会触发一次「账号数 × NFKC/正则/小写」的扫描。怀疑依据：调用点与循环体均已确认；未采样真实账号规模下的耗时，故不定级。建议：维护规范化名到账号的索引（或在 `createAccount`/`deleteAccount` 时增量维护 `Set<string>`）。
2. 访客在持有**有效访客会话令牌**时，若其名事后被某账号注册，`resolvePlayerIdentity` 会先撞上保留名守门（`:892-895`，位于 `guestToken` 分支 `:899` 之前）而返回 `name-reserved`；客户端自愈白名单（`useRoomSocket.ts:356-358`、`:419-421`）不含该错误码 ⇒ 该访客只能改名后重连。该行为与 Round 1 被审版本一致（守门位置未变，仅入参口径收窄），非本轮回归；仅记录，不阻断。

**未验证项（受环境限制）**

1. **`npm test` 无法在本机复跑**（含本轮全部 355 例）。原因：`vitest 4.1.9 + vite 8.0.16 + node v25.8.0` 组合下，**任何**测试文件（含本次完全未改动的既有 `accounts.test.ts`）均在首个 `describe(` 处抛 `TypeError: Cannot read properties of undefined (reading 'config')`，与 `--pool=threads/forks` 无关 ⇒ 属环境/依赖组合问题，**不可归因于 `eac1b95`**。所需条件：可用的 Node/Vite/Vitest 版本组合。补偿措施：以 `tsx` 直调真实模块逐条重放本轮新增的全部 44 条断言（全部 PASS）+ `tsc`/`lint`/`build` 三道门禁实跑通过。残余风险：新增测试在 runner 层的实际通过性与既有 351 例的回归情况**未经本轮独立背书**。
2. **客户端纯令牌提交门（`OnlineLobbyView.tsx:271`、`:321`）仅做静态路径核验**，未做浏览器端 E2E（仓库无 jsdom/无头浏览器基建）。已核实：`identifier: loginIdentifier.trim() || undefined` 经 `JSON.stringify` 丢弃后请求体不含 `identifier`，命中服务端路径 A。残余风险：React 受控态与真实提交链路未在运行时取证。
3. **6 语种新增文案未在真实渲染下取样**（仅程序化断言键存在与非空、装配与映射不回退）。残余风险：RTL 镜像与窄屏破版未见实测证据。

---

## 四、推荐修复顺序与复审验收标准

1. **P2-1（守门幂等性，安全语义）**：优先。改法为 `accounts.ts:146-147` 两行顺序调换（或撤销 `:892` 的预规范化），风险极低、影响面为安全守门完整性。
2. **P3-1（并发误报，可用性语义）**：其次。改法为 `:315-318` 之后按「调用方是否指定代号」分支重派生，需保证仍在同一同步 tick 内完成「校验 → 写入」。

**复审验收标准（须逐条给出证据）**

- 24 单元、末位 `U+0130` 的注册名，访客以同名提交 ⇒ `name-reserved`；且 `canon(canon(x)) === canon(x)` 在含 `U+0130` 语料上恒成立；两条断言回退修复后必须变红。
- 两个不同显示名、同基名、均不带 `publicHandle` 的并发注册 ⇒ 两者均成功且代号互不相同；回退为「仅拒绝」后必须变红。
- 既有 P2-1 同名并发用例（`accounts.test.ts:889`）与 P2-2 截断用例（`:913`）保持绿。
- 四道本地门禁全绿（含**可运行的** `npm test` 全量套件与 `npm run build`），并说明本机 vitest 环境问题的处置结果（修复环境或提供可复现的运行方式）。
