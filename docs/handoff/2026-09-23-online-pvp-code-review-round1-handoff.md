# 独立代码审查 Round 1 复查交接单 —— 联机对战命名 / 排行榜搜索框 / 账号登录与防冒名

> 被审提交：`5c03b7b`　基准提交：`b2c6383`　审查范围：`b2c6383..5c03b7b`（24 文件，+2905/−119）
> 判定：**未通过**　缺陷统计：0×P0 / 0×P1 / **2×P2** / **2×P3**

---

## 一、审查基本信息与通过项简述

- 工作区干净，`git pull --ff-only` 后实际 HEAD = `5c03b7b5e74f66f45abad00bce32a9b97a76a476`，与待审 SHA 一致；基准 `b2c6383` 为父链 8 代前。
- 需求 1（6 语种命名）：`friend room`/`好友房`/`Salon ami`/`Sala de amigos`/`Комната друга`/`غرفة صديق` 在 `src/` 内**零残留**，`room` 与 `panelLabel` 两键 6 语种全部落地。
- 需求 2（搜索框）：遮挡根因属实（`.icon-button` 为 `position: relative`，`:204-216` 的 `min-width:56px` 在 `18px` 固定列内溢出并覆盖输入区），本提交以 `position: static` + 20px 覆盖 + `max-width:280px` 消除，未新增硬编码 `left/right`，RTL 安全。
- 需求 4 的**文案上屏链路真闭环**：`GameShell.tsx:229` 已装配 `nameReservedError` → `useFriendRoom` → `useRoomSocket.ts:81/111` `messagesRef` → `applyRoomAck:227` 与 `room:error:183` 统一经 `resolveRoomErrorMessage` 映射；`room:error` 二次广播抑制（`room-socket.ts:1026/1041`）不吞 ACK 文案，Round 3 方案期 P2-2 死键问题确已消除。
- 独立探针（临时 vitest 文件，用后即删、工作区已复原）共 6 组：FIFO 5 会话边界（第 6 次登录仅淘汰最旧 1 枚）、遗留无密码账号凭原令牌认领、`QUEUE_TIMEOUT` 真可达（Round 3 P2-1 的死闭包已闭环）、`password:""` 显式空串返回 `invalid-password` 共 4 组符合预期；**2 组构造出反例（见 P2-1、P2-2）**。
- 门禁复跑（仅受影响面）：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`accounts.test.ts` + `room-state-utils.test.ts` 38/38 通过。全量 `npm test` 与 `npm run build` 未复跑（见第三节）。
- 测试有效性：新增 18 例断言均针对真实返回值（非调用计数），`ScryptConcurrencyGate` 三例对 `QUEUE_FULL`/`QUEUE_TIMEOUT` 做 `rejects.toMatchObject` 实质断言，无假阳性；**但缺并发注册用例与满长名称用例**，正是 P2-1/P2-2 遗漏的守门（见修复要求）。

---

## 二、审查发现与缺陷清单

### P2-1　`createAccount` 新增的异步密码分支引入 TOCTOU 竞态：同名可建双账号、公开代号被覆盖遮蔽

- **严重级别**：P2（明显回归：改动前该方法是全同步的，查重与写入同处一个 tick，不可竞态）
- **文件与行号**：`src/server/accounts.ts:276`（`hasDisplayName` 查重）、`:293`（`playerIdByPublicHandle.has` 查重）、`:297-329`（密码分支）、`:305`（`await hashPassword`）、`:320-321`（`accounts.set` / `playerIdByPublicHandle.set`）；对照同步路径 `:331-345`
- **触发条件**：两个注册请求携带**相同 `displayName`** 且**均带 `password`**，在 `hashPassword` 的 await 窗口内并发进入（两个不同客户端同时抢注同名；或同一客户端双击/并行 POST）。
- **实际行为**：两个请求**都成功**，各自拿到 `acct_*` 与**同一个 `publicHandle`**；`playerIdByPublicHandle` 被后写者覆盖，先建账号的 `publicHandle` 字段仍写着该代号却已不可解析。
- **期望行为**：第二个请求必须返回 `duplicate-name`（409），`displayName` 与 `publicHandle` 在账号集合内保持唯一（这是防冒名守门 `isNameReserved` / `findByDisplayName` 唯一性的前置不变量）。
- **根因**：密码分支在「查重」与「写入 Map」之间插入了 `await hashPassword(...)`（`:305`）。Node 单线程下 await 是让出点，另一请求可完整走完同一段前置校验；而同步分支（无密码）无让出点，故不受影响。
- **影响范围**：账号唯一性不变量破坏；`findByDisplayName` 只回第一个匹配，`findByPublicHandle` 只回被覆盖后的账号 ⇒ 同名双账号中有一个**无法用 `@handle` 登录**（会解析到另一个账号，密码不同则永久登录失败），且两账号在资料页/排行榜上共用同一 `@handle`。重启 `loadFromFile` 会靠 `:565-567` 的代权重建部分自愈代号，但**同名双账号不会自愈**。
- **复现方法与证据**（模块级探针，逐字调用真实 `AccountStore`，用后已删）：
  ```
  const [a, b] = await Promise.all([
    store.createAccount({ displayName: "Race Name", password: "password123" }),
    store.createAccount({ displayName: "Race Name", password: "password123" })
  ]);
  → R1 a.ok= true  b.ok= true
  → R2 a: acct_8fDcHplTkr4 race_name
  → R3 b: acct_bsGjCsiyW4s race_name
  → R4 findByDisplayName: acct_8fDcHplTkr4
  → R5 findByPublicHandle(race_name): acct_bsGjCsiyW4s   ← 覆盖遮蔽
  → R7 第三次串行请求才正确返回 duplicate-name
  ```
  对照组（无密码、同步路径）同构并发：`a.ok= true, b.ok= false` —— 证明竞态由本提交新增的异步密码分支引入。
- **修复建议**：把「校验 → 占用 → 落盘」收进单一 tick。最小改法：先 `await hashPassword(...)` 得到 `passwordHash`，**再**同步执行 `hasDisplayName` / `publicHandle` 有效性 / `playerIdByPublicHandle.has` 三项校验并立即写入 Map 与落盘；或先同步在 `playerIdByPublicHandle` 中做占位（sentinel）占用、失败时回滚。若希望统一口径，也可让 `createAccount` 整体走 `defaultScryptGate`（已有并发门禁）串行化。
- **修复后验收标准**：新增一条并发守门单测——`Promise.all` 两个同名同 handle 的带密码注册，断言**恰一个 `ok:true`、另一个 `error.code === "duplicate-name"`**；并断言 `findByPublicHandle(handle)` 指向成功那一个、`accounts` 内不存在两个同名账号。该用例在回退修复后必须变红。

### P2-2　保留名守门与实际生效名长度口径不一致，24 字符注册名可被访客截断绕过冒用

- **严重级别**：P2（验收标准 4“拒绝访客使用已注册显示名”在特定场景下不成立）
- **文件与行号**：`src/server/accounts.ts:878-881`（守门谓词）、`:140-148`（`canonicalizePlayerName`，**无长度截断**）、`:134`（`MAX_DISPLAY_NAME_LENGTH = MAX_PLAYER_NAME_LENGTH = 24`）、`:970-972`（`normalizeDisplayName` 末尾 `slice(0, 24)`）、`:903-906`（以原始 `input.playerName` 建访客会话，落库名经 `normalizeDisplayName` 截断）
- **触发条件**：被冒充账号的注册名**恰好为 24 字符**（上限长度）；访客提交 `playerName = 该 24 字符名 + 任意可见追加字符`（总长 > 24），例如 `"ABCDEFGHIJKLMNOPQRSTUVWX" + "ZZZ"`。
- **实际行为**：守门对**未截断**的 27 字符串求 canonical（`"abcdefghijklmnopqrstuvwxzzz"`）与注册名（`"abcdefghijklmnopqrstuvwx"`）不相等 ⇒ 判定未保留；随后生效名经 `normalizeDisplayName` 截断为前 24 字符 ⇒ **访客以完整注册名入座**。
- **期望行为**：守门谓词与生效名必须使用同一变换口径；该请求应返回 `name-reserved`。
- **根因**：本提交只在谓词侧引入 `canonicalizePlayerName`，未与生效名侧既有的 `normalizeDisplayName`（trim → `\s+` 折叠 → `slice(0,24)`）对齐。二者的唯一非对称点就是 `slice`：NFKC / `\p{Cf}` 剥离 / 大小写 / 空白折叠四个方向都是「守门侧更严格」，无法被反向利用；只有 `slice` 是「生效侧丢信息、守门侧保留」，从而开出一个宽度 = `len(输入) − 24` 的绕过窗口（因此仅注册名恰为 24 字符时可命中；公开代号上限 20 字符，同法不可利用）。
- **影响范围**：访客可完整冒用 24 字符注册名的身份（进房名、房间内展示名、对局记录与大厅 Presence 均使用该名）。原始 socket 客户端可直接提交任意长度，正式客户端 `maxLength={24}` 仅挡 UI 层。
- **复现方法与证据**（模块级探针，用后已删）：
  ```
  const created = accountStore.createAccount({ displayName: "ABCDEFGHIJKLMNOPQRSTUVWX" }); // 24 字符
  canonicalizePlayerName(spoof)          → "abcdefghijklmnopqrstuvwxzzz"
  accountStore.isNameReserved(spoof)     → false
  resolvePlayerIdentity({ playerName: spoof }, …)
  → { ok: true, value: { identity: "guest", playerName: "ABCDEFGHIJKLMNOPQRSTUVWX", … } }   ← 冒名成功
  ```
- **修复建议**：在 `resolvePlayerIdentity` 内先对**生效名**取口径：`const effectiveName = normalizeDisplayName(input.playerName)`（`normalizeDisplayName` 为模块内私有函数，可从守门点同文件调用），再以 `canonicalizePlayerName(effectiveName)` 作为守门入参；或直接令 `canonicalizePlayerName` 自身在末尾 `slice(0, MAX_DISPLAY_NAME_LENGTH)`，使两处口径天然一致（同时保留现有 `isNameReserved` 的重复规范化幂等性）。
- **修复后验收标准**：新增负向单测——注册 24 字符名后，以「该名 + 追加字符」提交 `resolvePlayerIdentity`，断言 `error.code === "name-reserved"`；并断言 `canonicalizePlayerName` 与 `normalizeDisplayName` 对同一超长输入产生同一比对口径（可加一条守恒断言）。回退修复后该用例必须变红。

### P3-1　登录令牌输入框承诺的 “recovery” 通道在 UI 上不可达（纯令牌路径被 identifier 非空硬门挡住）

- **严重级别**：P3
- **文件与行号**：`src/components/online/OnlineLobbyView.tsx:321`（提交按钮 `disabled={… || !loginIdentifier.trim()}`）、`:269-273`（`onSubmit` 在 `!loginIdentifier.trim()` 时直接 `return`）、`:305-315`（令牌输入框，占位文案 `accountTokenPlaceholder`）；服务端 `src/server/accounts.ts:354-360`（路径 A：仅 `token` 且无 `identifier` 才走纯令牌恢复）
- **触发条件**：用户**只持有账号令牌**（或只填令牌框），标识符留空后提交。
- **实际行为**：提交按钮被 `disabled` 挡住；键盘 Enter 提交被 `onSubmit` 早返回吞掉，界面**零反馈**（无 error、无 loading、无提示）；即使绕过 UI 直接带 `identifier + token`（无密码），服务端对**已有密码**账号返回 `invalid-password`（“Password is required.”），令牌不被当作凭据（探针 B2）。
- **期望行为**：占位文案 `accountTokenPlaceholder`（“原设备令牌 (认领或找回时填)”）承诺的**找回**通道应可用，或至少给出可操作反馈；否则该文案属超范围承诺。
- **根因**：方案期 Round 3 的 P3-1 要求的「客户端→API 令牌字段映射」只做了一半——本提交把令牌**同时**映射到 `token` 与 `ownershipToken`（`OnlineLobbyView.tsx:275-277`），但标识符必填的存在性硬门未放开，路径 A 的前置条件 `!input.identifier?.trim()` 永远无法成立 ⇒ 端到端仍不可达（服务端路径 A 本身可达，探针 B1 `ok=true`，故定 P3 而非 P1）。
- **影响范围**：仅影响「只记得令牌、不记得昵称/代号」的找回场景与文案准确性；遗留账号认领（标识符 + 令牌 + 新密码）主流程经探针验证可用，不受影响。
- **复现方法与证据**：静态路径核验（`disabled` 与早返回双门）+ 探针 B2 输出 `{"ok":false,"error":{"code":"invalid-password","message":"Password is required."}}`；探针 B1 输出 `pathA(token only) ok= true`。
- **修复建议**：放开「令牌非空即允许提交」（`disabled = loading || (!loginIdentifier.trim() && !loginToken.trim())`，`onSubmit` 同步放宽），使仅含令牌的提交落到服务端路径 A；并据实际能力收敛文档/文案（已有密码账号不接受令牌作凭据，占位文案建议改为“原设备令牌（用于认领无密码账号）”）。
- **修复后验收标准**：存在一条客户端测试或手工验证记录：标识符留空 + 令牌非空提交 → 请求体 `{ token }` 命中服务端路径 A 并成功回填会话；同时占位文案不再承诺未实现的找回语义。

### P3-2　本提交新增的 `guestSessionError` 消息键为死键：消费侧已接、提供侧从未装配

- **严重级别**：P3（无相对基线的可见回归，但新增契约分支恒不可达）
- **文件与行号**：`src/components/hooks/room-state-utils.ts:51`（声明）、`:480-481`、`:492-493`（`guest-session-invalid` 的本地化分支）；提供侧 `src/components/GameShell.tsx:223-232`（仅装配 7 个键，**不含** `guestSessionError`，且 `src/i18n/dictionaries.ts` 的 `GameDictionary.room` 也未声明该键 ⇒ 无处可取）
- **触发条件**：任意 `guest-session-invalid` 失败（加入/重连/聊天自愈失败）在非英文语种下展示。
- **实际行为**：`messages?.guestSessionError` 恒为 `undefined`，分支恒落到 `err.message`，即服务端英文 “Guest session is invalid. Start a new guest session.”。
- **期望行为**：与同批新增的 `nameReservedError` 一样具备 6 语种本地化上屏通道；或明确不引入该键，避免死契约。
- **根因**：与方案期 Round 3 P2-2 完全同型的「消费侧先行、提供侧漏配」，本提交修好了 `nameReservedError`，却把同类的 `guestSessionError` 留在 `Partial<…>`（可选 ⇒ TS 静默）状态。
- **影响范围**：5 个非英文语种下会话失效提示仍为英文（与基线行为一致，故非回归）；同时 `resolveRoomErrorMessage` 的两条 `guestSessionError` 分支属不可达代码。
- **复现方法与证据**：`grep -rn "guestSessionError" src/` 仅命中 `room-state-utils.ts`（声明 + 两处消费）与新增单测的入参，**`GameShell.tsx` 与 `dictionaries.ts` 零命中**；`room-state-utils.test.ts:256-259` 的“本地化”断言是**手工注入 messages** 后成立，不反映真实装配 ⇒ 测试与实现共享了「键一定存在」的错误假设。
- **修复建议**：二选一并择一收敛——①补齐 `GameDictionary.room.guestSessionError` 6 语种文案并在 `GameShell.tsx:223-232` 装配；②删除 `guestSessionError` 键与两条分支，仅保留 `nameReservedError`。推荐 ①，与 P2-1 一致性地把「文案键必须由真实装配点提供」纳入验收。
- **修复后验收标准**：若选 ①，须新增「提供侧装配」守门（断言 `GameShell` 传入的 `messages` 键集合覆盖 `UseFriendRoomOptions.messages` 的全部成员，或对 6 语种字典取值路径做一次穿透断言），并保证该用例在删除 `GameShell.tsx` 中该键后变红；若选 ②，`resolveRoomErrorMessage` 不得再保留不可达分支。

---

## 三、待确认风险与未验证项

**待确认风险**

1. `canonicalizePlayerName`（`src/server/accounts.ts:146`）使用 `toLocaleLowerCase()`（无参，取运行时默认区域）。在 tr-TR / az-AZ 区域下 `"I"`→`"ı"`，会使守门口径与注册口径在同一进程内自洽、但**跨区域/跨部署不一致**（同一账号在不同区域服务器上可被不同变体命中）。怀疑依据：JS 规范明确无参 `toLocaleLowerCase` 使用默认区域。**本机（Windows，默认 en-US）以 `LC_ALL=tr_TR.UTF-8` / `az_AZ.UTF-8` 实测未能改变 Node 默认区域（仍输出 `alice`），故未定级为缺陷**。建议验证方法：在 Linux 容器内以 `LC_ALL=tr_TR.UTF-8` 启动服务端后重复 P2-2 探针；无论结论如何，改为 `toLowerCase()` 都是零成本且更严谨的收敛方向。

**未验证项（受环境/范围限制）**

1. 未复跑全量 `npm test`（351 例）与 `npm run build`（18 页）：本机长驻 ~40 个 node 进程，已知存在负载敏感性假红；本轮仅复跑受影响的两个套件（38/38）。残余风险：主控声称的 `351/351` 与 `18/18` 未经本轮独立背书。
2. P2-1 的竞态仅在 `AccountStore` 模块层以 `Promise.all` 复现，未在真实 HTTP `/api/account/register` 上以两个并发请求复现（需要可控并发窗口；`hashPassword` 单次约数十毫秒，窗口真实存在但未做线上链路取证）。残余风险：真实链路的触发概率未量化。
3. P2-2 的 CSS/UI 侧（需求 2）仅做静态样式核验（`position`/`min-width`/`max-width`/`grid-template-columns` 与 DOM 顺序），未用无头浏览器做命中区域（命中测试）取证；残余风险：其他层叠规则（`--panel-shadow`、`type="search"` 原生清除按钮）对点击区域的影响未经实测。
4. 6 语种新增文案未逐语种在真实渲染下取样（`dictionaries.ts` 的类型约束可保证键齐备，但不能保证语义/长度在 RTL 与窄屏下不破版）。

---

## 四、推荐修复顺序与复审验收标准

1. **P2-1（并发注册竞态）**：优先。改法集中于 `createAccount` 的检查/写入次序，风险低、影响面大（唯一性不变量 + 代号遮蔽）。
2. **P2-2（截断绕过）**：并列优先。统一守门与生效名的规范化口径；注意保持 `isNameReserved` 幂等（`canonicalizePlayerName` 幂等）。
3. **P3-1（令牌找回通道）**：放开 identifier 硬门 + 收敛占位文案。
4. **P3-2（`guestSessionError` 死键）**：在「补齐装配 + 守门」与「删除键与分支」中择一。

**复审验收标准（须逐条给出证据）**

- `Promise.all` 两个同名同代号带密码注册 ⇒ 恰一个成功、另一个 `duplicate-name`；`findByPublicHandle` 指向成功者；该用例回退修复后必须变红。
- 24 字符注册名 + 追加字符的访客提交 ⇒ `name-reserved`；该用例回退修复后必须变红。
- 标识符留空 + 令牌非空 ⇒ 命中服务端路径 A 并成功建立会话（或文案明确不再承诺该通道）。
- 文案正确性不再依赖「手工注入 messages」的测试：至少一条断言穿透真实装配点（`GameShell`）取值。
- 上述四条全部闭环后，连同四道本地门禁（含全量 `npm test`、`npm run build`）一并复跑，再由本轮复审确认。
