# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名技术设计方案 · 独立代码审查报告（Round 1）

- **审查日期**：2026-09-23
- **审查类型**：纯技术方案 / 架构设计审查（Round 1）
- **被审 HEAD SHA**：`0c792ff`（`docs(plan): add technical design plan for online PVP naming, leaderboard search, account login, and guest spoofing prevention`）
- **基准 SHA**：`b2c6383`
- **实际审查范围**：`git diff b2c6383..0c792ff`（4 文件，+474/−0，全为 `.md`；源码零改动）
- **判定结论**：**未通过**（1×P1 / 4×P2 / 3×P3，无 P0）

---

## 一、审查基本信息与通过项简述

工作区干净，`git pull --ff-only` 后 HEAD 与待审提交一致（`0c792ff`），无本地改动。需求四项在方案中均有对应章节，且四项落点与真实代码耦合点一致：`modes.room`/`room.panelLabel` 在 6 语种共 12 处（`dictionaries.ts:280/381/529/630/778/879/1027/1128/1276/1377/1525/1626`）确为方案所述旧文案，未遗漏其它面向用户的模块名（`playWithFriends` 属"邀请好友"分区标签，非模块名）；排行榜按钮遮挡根因（`.icon-button` 的 `min-width: 56px`，`globals.css:196-219`）与方案诊断一致，`max-width: 280px` + 20px 重置的写法有同文件先例（`globals.css:1069-1074`）；身份裁决点唯一（`resolvePlayerIdentity` 由 `room-socket.ts:660` 单点调用，后续事件全部使用服务端绑定的 `socket.data.playerId`），门禁位置选型正确；`StoredAccount` 新增可选字段可无损兼容既有 JSONL（`parsePersistedAccountEntry` 仅校验 `type`/`account.id`，`loadFromFile` 以展开复制保留新字段）；`dictionaries.test.ts:8-14` 的六语种结构一致性守门确实存在，方案对它的依赖成立。已独立执行 1 项负向/边界验证（自建探针，用后即删，工作区复原为干净），发现守门可被绕过（见 P2-3）。

---

## 二、审查发现与缺陷清单

### P1-1 旧账号"无密码平滑认领"分支无任何所有权证明，构成对全部历史账号的任意接管，且使原主永久失去账号

- **级别**：P1（若按此方案实现即为可复现的身份接管，因尚处设计阶段且修复面收敛于该分支契约，故不升为 P0）
- **文件与行号**：方案 `docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md:216-217`（认领分支）与 `:221-223`（会话签发即轮换 `tokenHash`）；关联 `src/server/accounts.ts:60`（单一 `tokenHash` 字段）、`:190`（唯一精确匹配）、`src/server/online-server.ts:66`（现有账号路由全集）
- **触发条件**：任意未认证请求 `POST /api/account/login { identifier: "<他人已注册昵称或公开代号>", password: "任意≥6位" }`。该账号只要没有 `passwordHash`（方案自述 `accounts.jsonl` 中 80+ 条历史记录均无，`方案:361-363`），即被"认领"。
- **实际行为与期望行为**：
  - 方案实际行为：命中 `!account.passwordHash` 分支后，直接把调用方提供的密码绑定落盘、签发合法 `accountToken` 并返回完整 `AccountSession`（方案 `:216-223`），全程不要求任何所有权证据。
  - 期望行为：认领必须绑定"仅账号本人可提供"的证据（例如原 `token`、或一次性认领码），或由产品明确限定认领窗口并公示风险；不得仅凭公开可得的昵称/代号完成接管。
- **根因**：认领分支的判定条件只有"账号无密码"这一**服务端状态**，没有任何**调用方身份**约束；而该分支与同一份方案 1.4 节"禁止访客冒用已注册昵称"守门（方案 `:39-45`、`:261-265`）构成直接矛盾——攻击者只需换一条路（认领账号），就能合法取得被守门保护的昵称，需求 1.4 的保证对全部无密码历史账号归零。
- **影响范围**：
  1. **前提由系统自身提供**：注册账号的 `displayName` 是公开数据——`/api/leaderboard` 条目含玩家显示名（`game-records.ts:226/335/640-648`），`/api/presence` 在线列表含 `name`（`presence-tracker.ts:20/44/91/98`），且两者均无需鉴权（`online-server.ts:152-184`）。攻击者无需猜测即可枚举目标。
  2. **不可逆**：方案 `:223` 的登录会以新令牌覆盖唯一的 `account.tokenHash`（`accounts.ts:60/190`），原主浏览器中的旧令牌随即失效；而现有路由全集只有 `register` / `session`（`online-server.ts:66`），**不存在任何密码重置或找回入口**，原主此后既不能用旧令牌、也无法重置被他人设定的密码，账号被永久夺取。
  3. 服务端已存在成熟的强绑定与令牌轮换语义，本方案却把"轮换"提前到了**认证之前**，使接管者获得破坏原主会话的能力。

- **验证证据**：`online-server.ts` 全量路由枚举（`/api/account/register`、`/api/account/session`、`/api/rooms`、`/api/presence`、`/api/leaderboard`、`/api/profile`、`/api/game-records`、`/api/feedback`）证明无任何找回路径；`accounts.ts:60/190` 证明单令牌语义；方案 `:216-223` 证明认领无需证据且签发即轮换。
- **修复建议**：
  1. 认领分支增加所有权证据前置条件（持有原 `token` 时允许绑定密码；无证据时拒绝，返回独立错误码），或将其改为"限时 + 一次性认领码 + 可撤销"流程；
  2. 若产品坚持无凭据认领，则登录**不得**覆盖原 `tokenHash`，且必须提供找回通道与风险公示；
  3. 在方案中显式写明威胁模型与该分支的取舍（当前 1.4 节与 2.3.3 节的保证互斥，必须二选一或给出分层条件）。
- **修复后验收标准**：新增负向单测——对一条无 `passwordHash` 的历史账号，仅提供公开昵称 + 新密码（无原令牌）时 `loginAccount` 必须失败且账号 `passwordHash` 保持 `undefined`、原 `tokenHash` 不变；同时保留"持有原令牌可绑定密码"的正向用例。方案文本中 1.4 节与 2.3.3 节的保证不再互相否定。

---

### P2-1 守门错误码复用 `duplicate-name`，与既有"房内同名"语义及客户端自愈路径冲突，方案 §2.4.2 承诺的提示文案在两条主路径上是死文案

- **级别**：P2
- **文件与行号**：方案 `:264`、`:276`（返回 `duplicate-name`）与 `:304`（§2.4.2 承诺客户端提示"该名称属于已注册玩家，请登录使用。"）；冲突点 `src/server/domain/room-state-machine.ts:460`、`src/components/hooks/useRoomSocket.ts:329/356-375`、`:395/419-437`
- **触发条件**：访客把昵称填成某已注册昵称/代号后，点击"按房间码加入"或"按邀请目标加入"（`joinRoomByCode`/`joinRoomByTarget`，二者 `retryWithFreshIdentity` 默认 `true`）。
- **实际行为与期望行为**：
  - 方案期望：ACK 返回 `duplicate-name`，客户端把"该名称属于已注册玩家，请登录使用。"挂到 `room.error` 展示。
  - 实际行为：客户端在错误落地前拦截——`setError(null)`（提示被清空）、`clearGuestToken()`、`playerName: createGuestPlayerName()`（随机名）、`resetGuestIdentity: true` 后自动重试（`useRoomSocket.ts:361-375`、`:424-437`）。用户不会被提示"应去登录"，而是被**静默改名**为一个随机访客名并照常入房；方案新增的 6 语种 `nameReservedError` 文案在这两条路径上永远不显示。
- **根因**：`duplicate-name` 在本仓库已有既定语义——"房间内已有同名玩家"（`room-state-machine.ts:460`，属**可自愈**的瞬时冲突，故客户端设计为自动换身份重试）。方案把**不可自愈**的"保留名"冲突复用了同一错误码，未区分两类语义，客户端的既有自愈策略因此对本方案的核心提示需求反向生效。
- **影响范围**：需求 1.4 的**拦截效果仍成立**（冒名名不会生效），但其用户引导完全失效：用户既看不到"请登录"的指引，也无法理解自己为何被改名；同时 `markEphemeralSession()` 会把该会话标记为临时身份，连带影响 localStorage 持久化语义（`room-state-utils.ts` 既有约定）。`room:create`（`useRoomSocket.ts:302-308` 仅自愈 `guest-session-invalid`）、`matchmaking:find`、`public-chat:send`、`presence:join` 仍会正常上抛，即方案 §2.4.2 的"建房、入房、匹配或发言一律提示"只对其中一部分成立。
- **验证证据**：`room-state-machine.ts:460` 与 `useRoomSocket.ts:362/425` 的 `duplicate-name` 判定同源比对；`joinRoomByCode`/`joinRoomByTarget` 的默认参数 `retryWithFreshIdentity = true`（`:329`/`:395`）。
- **修复建议**：为守门引入独立错误码（如 `name-reserved`）并纳入 `AccountError.code` 联合（见 P3-1），客户端仅在 `duplicate-name`（房内同名）时保留自愈、在 `name-reserved` 时上抛提示；或在方案中明确收窄 §2.4.2 的适用范围并给出 join 路径的替代交互（如弹出登录面板）。
- **修复后验收标准**：新增用例——以已注册昵称执行 `room:join` 时，ACK 错误码为 `name-reserved`，UI 显示 `nameReservedError` 文案，且 `playerName` 不被静默替换、不产生 `resetGuestIdentity` 重试；同时保留"房内同名 → 自愈换名"的既有用例不变。

---

### P2-2 `scryptSync` 同步阻塞单进程事件循环，方案"10~20ms / 完全不增加对局事件循环负担"的时长与结论均被实测证伪

- **级别**：P2
- **文件与行号**：方案 `:183-197`（同步 `scryptSync` 算法）、`:312`（登录限流 10 次/分/IP）、`:364-365`（§3.5 性能结论）；承载点 `src/server/online-server.ts:26-57`（同一 Node 进程联合托管 Next.js 与 Socket.IO）
- **触发条件**：任意登录/注册请求（密码哈希路径）；攻击者按限流上限持续打满，或以多 IP 放大。
- **实际行为与期望行为**：
  - 方案声称：单次约 10~20ms，"完全不增加对局事件循环负担"。
  - 实测（本机 Node v25.8.0 / 6 核，方案原始算法 `scryptSync(password, salt, 32)`，n=15）：**min 39.0ms / p50 40.7ms / max 44.0ms**，即方案自述值的 2~4 倍；单 IP 在一个限流窗口内打满 10 次即产生 **≈400ms 的主线程连续阻塞**。
  - 期望行为：密码哈希不得占用对局事件循环。
- **根因**：`scryptSync` 是同步 API，而 `online-server.ts:26-57` 把 HTTP API 与 Socket.IO 放在**同一个**事件循环中；方案 §3.5 的"无感"结论建立在"哈希很快 + 只在登录时算一次"之上，既低估了默认参数（N=16384, r=8）的成本，也忽略了同步调用会**串行阻塞**所有对局/长连接事件。限流按 IP 计（`online-server.ts:227-233`，XFF 仅在 `GOMOKU_TRUST_PROXY` 且对端为回环时才采信），只能限制单 IP 频次，无法阻止多 IP 持续轰击。
- **影响范围**：登录/注册接口成为对局延迟的放大器（掉帧式卡顿、房间广播与心跳延迟）；对局中任一玩家触发登录即可影响全服所有房间；与方案 §3.5 的安全性/性能论证相矛盾，若照此实现将把一份"性能无感"的承诺变成负载隐患。
- **验证证据**：本机 `node -e` 计时（上述分位数）；`online-server.ts:26-57` 的单进程托管结构。
- **修复建议**：改用异步 `crypto.scrypt`（走 libuv 线程池）或 worker（项目已有 `src/game/ai-worker-pool.ts` 范式可复用）；对在途哈希加全局并发闸（如最多 1~2 个）；把 §3.5 的时间与结论改写为实测口径，并说明与对局事件的隔离方式。
- **修复后验收标准**：方案给出异步实现契约 + 全局并发上限，并以可执行的测量方法（样本量、分位数、硬件口径）记录哈希耗时；实现在 10 次/窗口并发登录时对局事件循环无同步阻塞（可用事件循环延迟采样佐证）。

---

### P2-3 守门谓词未定义名称规范化契约，可被零宽/隐形字符绕过，"彻底斩断冒名通道"不成立

- **级别**：P2
- **文件与行号**：方案 `:224-231`（`isNameReserved` 定义）、`:261-265`（守门判定）；依赖 `src/server/accounts.ts:232-234`（`hasDisplayName`）、`:700-702`（`namesMatch`）、`:651-653`（`normalizeDisplayName`）
- **触发条件**：访客把昵称填成"已注册昵称 + 一个不可见字符"，例如 `"Ali\u200Bce"`（零宽空格）、`"Ali\u2060ce"`（word joiner）、`"Ali\u00ADce"`（软连字符）。`MAX_PLAYER_NAME_LENGTH = 24`，长度受限不构成障碍。
- **实际行为与期望行为**：
  - 方案期望：命中保留名即"坚决拒绝"（方案 `:45`、`:264`），"彻底斩断冒名通道"。
  - 实际行为：`isNameReserved` 委托的 `hasDisplayName` 使用 `namesMatch`（`trim + toLocaleLowerCase` 全等比较，无 Unicode 规范化、不剥离 `Cf` 类不可见字符），上述变体判定为**不冲突**，守门放行；而它们在 UI 中与注册昵称**渲染完全相同**（终端复现亦显示为 `Alice`）。
- **根因**：守门比较只做了大小写折叠，缺少"名称规范化契约"（NFKC/NFC + 剥离零宽与不可见字符 + 折叠空白），且该契约需同时作用于 `createAccount` 查重、`isNameReserved`、访客名与展示名，方案仅复用了现有弱比较函数。
- **影响范围**：需求 1.4 的目标（禁止访客使用与注册玩家视觉一致的昵称）在低成本（一个不可见字符）下被绕过，冒名在观感上完全成功；同类问题也存在于注册查重路径（`createAccount`），故属方案必须一并定义的契约缺口而非单点瑕疵。
- **验证证据**：自建临时探针（真实模块 `AccountStore`/`GuestSessionStore`/`resolvePlayerIdentity`，用后已删除，`git status` 复原为干净）实测输出：
  ```
  [probe] exact duplicate           isNameReserved=true  allowable=false
  [probe] case variant              isNameReserved=true  allowable=false
  [probe] zero-width space U+200B   isNameReserved=false allowable=true
  [probe] word joiner U+2060        isNameReserved=false allowable=true
  [probe] soft hyphen U+00AD        isNameReserved=false allowable=true
  [probe] cyrillic homograph        isNameReserved=false allowable=true
  [probe] resolvePlayerIdentity(Ali\u200Bce) => {"ok":true,...,"playerName":"Alice"}
  ```
  末行 `playerName` 经终端渲染与注册名 `Alice` 视觉等同。
- **修复建议**：在方案中显式定义 `canonicalizeName()`（NFKC + 剥离 `\p{Cf}`/零宽与不可见字符 + 空白折叠 + `toLocaleLowerCase`），并规定注册查重、`isNameReserved`、访客名落库与展示一律以此为唯一口径；补负向单测。
- **修复后验收标准**：`isNameReserved(canonicalizeName(v))` 对 `"Ali\u200Bce"`、`"Ali\u2060ce"`、`"Ali\u00ADce"`、全角变体均返回 `true`；`resolvePlayerIdentity` 对上述输入返回 `duplicate-name`/`name-reserved` 失败；`createAccount` 亦拒绝同类变体。现有合法名称用例（大小写、前后空格）行为不变。

---

### P2-4 单 `tokenHash` + 登录即轮换，与方案自身"令牌导出备份 / 跨浏览器转移"目标互相矛盾

- **级别**：P2
- **文件与行号**：方案 `:221-223`（登录签发新令牌并 `account.tokenHash = hashToken(token)`）；关联 `src/server/accounts.ts:60`（唯一 `tokenHash`）、`:190`（精确匹配）、方案 `:351`（"复制账号令牌…便于跨浏览器快速转移账号凭据"）、`:37`（"提供账号令牌导出备份能力"）
- **触发条件**：同一账号在两处使用——设备 A 注册（或持有导出的备份令牌），设备 B 用"昵称/代号 + 密码"登录（方案路径 B）。
- **实际行为与期望行为**：
  - 方案期望：令牌可作为"导出备份 / 跨浏览器转移"的凭据，登录应在各设备保持有效会话。
  - 实际行为：路径 B 每次都以新哈希覆盖唯一 `tokenHash`，设备 A 的令牌**静默失效**（`authenticate` 为单值精确匹配，`accounts.ts:190`）；同时"备份令牌"一旦被使用即被覆盖，备份退化为一次性凭据——与 §1.3.5/§2.6.2 承诺的"备份"语义相悖。
- **根因**：数据模型层只有单令牌槽位，而方案同时在产品目标中承诺了多设备/可备份的令牌语义，二者未对齐；方案也未声明"单会话/多会话"的产品决策。
- **影响范围**：多设备用户被静默登出且无解释；"复制账号令牌"按钮（方案 `:351`）提供的承诺不可兑现；与 P1-1 叠加时进一步放大伤害（轮换使接管者的登录成为对原主会话的破坏动作）。
- **验证证据**：`accounts.ts:60`（单字段）与 `:190`（`account.tokenHash !== hashToken(token)` 单值比较）证明一处登录必然使其它令牌失效；方案 `:221-223` 明确写入覆盖动作。
- **修复建议**：二选一并写入方案——(a) 扩展为多令牌/会话模型（令牌哈希列表 + 每会话元数据，`authenticate` 命中最新的有效项）；(b) 明确单会话语义，同步修正 §1.3.5/§2.6.2 的文案为"导出后原设备将退出登录"，删除"备份"表述并补充交互提示。
- **修复后验收标准**：按选定语义给出可执行契约与单测——方案 (a)：两处登录后两个令牌均可 `authenticate` 成功；方案 (b)：第二次登录后旧令牌返回失败，且 UI 文案与风险提示一致，无"备份/转移"误导表述。

---

### P3-1 方案引用的契约成员不存在或未纳入方法集演进清单，按字面实现将直接触发门禁 1 失败

- **级别**：P3
- **文件与行号**：方案 `:215`（`failure("account-not-found", …)`）、`:220`（`failure("invalid-password", …)`）、`:214`（`findByDisplayName(identifier)`）、`:210-223`（`loginAccount` 返回 `AccountResult<AccountSession>` / 路径 A）；对端 `src/server/accounts.ts:24-33`（封闭联合类型）、`:130/180/206/212`（现有公开方法集）
- **触发条件**：按方案字面实现 `loginAccount`。
- **实际行为与期望行为**：`AccountError.code` 是封闭联合（`accounts.ts:24-33`），不含 `account-not-found` / `invalid-password` → `failure()` 调用无法通过 `npx tsc --noEmit`（与方案 §4"门禁全绿"自相矛盾）；`AccountStore` 中**不存在** `findByDisplayName`，且 §2.3.3 的方法集演化清单只列了 `createAccount` 升级、`loginAccount`、`isNameReserved` 三项，未包含该检索方法，"凭昵称登录"按字面无法实现；路径 A（令牌登录）声称"返回携带明文 `token` 的完整 `AccountSession`"，但 `authenticate` 只返回 `AccountSnapshot`（无 `token`，`accounts.ts:180-204`），方案未说明明文 `token` 的来源。
- **根因**：新增登录契约时未同步更新既有封闭类型与查询方法清单。
- **影响范围**：实现阶段返工与门禁红灯；若实现者自行为未知错误码绕过类型，将吞掉编译期保护。
- **验证证据**：`accounts.ts:24-33` 的联合枚举逐项比对；`grep findByDisplayName src/server/accounts.ts` 无结果。
- **修复建议**：在 §2.3.3 中补齐"扩展 `AccountError.code`（新增 `account-not-found` / `invalid-password` / 建议的 `name-reserved`）+ 新增 `findByDisplayName`（明确大小写/规范化口径）+ 路径 A 的令牌回填方式（`{...snapshot, token: 入参 token}`）"，并写明 HTTP 状态码映射（401/409）。
- **修复后验收标准**：方案文本中出现的每个标识符都能在"现状"或"本方案新增"两处之一被检索到；实现后 `npx tsc --noEmit` 0 错误。

---

### P3-2 新增"访客 / 登录 / 注册"三态 Pill 缺少无障碍与焦点契约

- **级别**：P3
- **文件与行号**：方案 `:343-352`（§2.6.2 三态 Pill 设计）、`:366-368`（§3.6 A11y 声明）；既有范式 `src/components/online/TableSidebarTabs.tsx:34-64`（`role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`/`role="tabpanel"`/`aria-labelledby`）、`src/components/online/OnlineLobbyView.tsx:62-72`（`aria-expanded` 折叠面板）
- **触发条件**：键盘/读屏用户进入"编辑身份"面板并在三态之间切换。
- **实际行为与期望行为**：方案只描述"3 项紧凑切换 Pill"的视觉切换，未定义 ARIA 角色与状态、左右方向键/Home‑End 的 roving focus、切换后焦点归属，以及与既有 `aria-expanded` 折叠开关的层级关系；验收标准 4 明确要求"6 语种国际化与 A11y/RTL 合规"。项目内已有可直接复用的 tab 契约（`TableSidebarTabs.tsx:34-64`），方案却未引用。
- **根因**：方案在 §2.6.2 只描述控件形态，未把新交互控件纳入 A11y 契约（本项目 `AGENTS.md` 1.2 明确要求模态/交互控制的可达性）。
- **影响范围**：实现者可能用三个普通 `<button>` 拼出"标签页"，导致读屏无法感知"当前标签"与面板从属关系；切换时焦点可能落到已卸载的输入框上（方案未定义焦点迁移）。
- **验证证据**：方案 `:343-352` 全文无 ARIA 角色/键盘描述；`TableSidebarTabs.tsx:34-64` 证明项目既有标准。
- **修复建议**：在 §2.6.2 增补 tab 契约（`role="tablist"/"tab"/"tabpanel"`、`aria-selected`、`aria-controls`/`aria-labelledby`、方向键与 Tab 顺序、切换后焦点落点），并同步"身份面板"与既有折叠开关的关系说明。
- **修复后验收标准**：方案文本含上述 ARIA/键盘契约条目；实现后逐语种（含 `ar` 的 RTL）验证标签可读、可选、可键盘切换，且切换不夺走用户正在输入的表单焦点。

---

### P3-3 排行榜搜索框的交互态样式契约两处不落地（hover 规则失效、键盘焦点指示缺失）

- **级别**：P3
- **文件与行号**：方案 `:140-143`（hover 变色）、`:145-153`（`input { outline: none }`）；对端 `src/app/globals.css:975-979`（`.room-leaderboard-search svg { color: var(--muted) }`）、`:2515-2516`（项目对文本输入 `:focus` 的既有做法）；组件 `src/components/online/lobby/LobbyLeaderboard.tsx:89-104`
- **触发条件**：(a) 鼠标悬停搜索按钮；(b) 键盘 Tab 聚焦搜索输入框。
- **实际行为与期望行为**：
  - (a) 方案希望按钮 hover 变 `var(--accent)`；实际 `svg` 自身声明了 `color: var(--muted)`（`globals.css:975-979`），**覆盖从按钮继承的颜色**，该 hover 规则对图标不产生效果（规则失效）。需改 `.room-leaderboard-search button:hover svg { color: inherit }` 或移除 svg 上的 `color` 声明。
  - (b) 方案重写了该组件样式块并原样保留 `outline: none`，但未提供替代的可见焦点指示；项目对文本输入有明确先例（`globals.css:2515-2516` 为 `.feedback-input:focus` 提供可见焦点态），本搜索框无任何等价规则（全文件仅 `.board-point` 有 `focus-visible`，`:2014`）。键盘用户获得的可见反馈弱于鼠标用户（WCAG 2.4.7），与验收标准 4 的 A11y 要求相抵；属被方案继承并固化的既有缺口。
- **根因**：CSS 生效性判断缺失（仅静态声明、未核对既有同域声明的优先级与继承关系）；重写样式块时未补齐替代焦点指示。
- **影响范围**：视觉反馈与承诺不符（P3，明确可规避）；键盘可达性存在可见性缺口。
- **验证证据**：`globals.css:975-979` 与方案 `:140-143` 的优先级分析（`svg` 自身声明的 `color` 优先于继承，与选择器优先级无关）；`globals.css:2014/2515-2516` 证明项目其余交互元素均有显式焦点态而本组件没有。
- **修复建议**：补 `button:hover svg { color: inherit }`；为搜索框补 `:focus-within` 边框高亮或 `input:focus-visible` 可见轮廓（对齐 `.feedback-input:focus` 口径）。
- **修复后验收标准**：hover 时图标颜色实际变化（可用计算样式取值佐证）；键盘 Tab 聚焦时存在可见焦点指示；`ar` 语种 RTL 下无硬编码 `left/right`。

---

## 三、待确认风险与未验证项

**待确认风险**

1. **同形异码（homoglyph）范围未定**：除 P2-3 的不可见字符外，全角拉丁（`Ａlice`）与西里尔同形字（`Аlice`）同样不被拦截。NFKC 可解决全角，但西里尔/希腊字母等同形字需 confusable-skeleton 比对，属更大范围的产品决策。建议在方案中明确"至少要挡住到什么程度"，否则"彻底斩断"的表述应下调为"显著提高冒名成本"。
2. **`accounts.jsonl` 实际历史规模**：方案称存在 80+ 条无密码记录（`:361-363`）；本次审查未读取该数据文件（不在仓库内，且读取生产数据不属本任务范围），故 P1-1 的实际受害面按方案自述口径引用，未独立核验。
3. **旧客户端兼容行为**：P2-1 已确认 join 路径会静默改名；对于已发版客户端与本次新增错误码之间的组合行为（如客户端仅识别 `duplicate-name` 的旧版本），本方案未给出兼容矩阵，建议在方案中补一句"新错误码需与客户端版本同时发布"的说明。

**未验证项**

1. **真实浏览器像素级/焦点态验证未执行**：P3-3 的 hover 与 focus 结论来自 CSS 优先级与继承的确定性推理，未在真实浏览器中取样计算样式（本仓库无 jsdom 环境，且本任务为文档审查）；如需铁证，建议实现阶段用既有 CDP 无头浏览器手法复核。
2. **四道门禁与 `smoke:persistence` 未复跑**：本 diff 全为 `.md`（源码零改动），门禁结果不受影响，故未重复执行；方案 §4 将 `smoke:persistence` 列为验收项，属实现阶段事项。
3. **`scryptSync` 计时口径**：实测为本机 6 核环境（Node v25.8.0）的单次同步调用耗时，未在部署机与并发条件下采样；P2-2 的结论（同步阻塞事件循环）不依赖具体数值，数值仅用于证伪方案自称的 10~20ms。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**

1. **P1-1（最高优先）**：先确定认领分支的所有权证据契约与 `tokenHash` 轮换语义，再据此回改 1.4 节与 2.3.3 节，消除方案内部的保证互斥。
2. **P2-1 / P2-3（守门契约）**：一并定稿"独立错误码 + 名称规范化契约 + 客户端提示分工"，三者互相咬合，宜同一轮修订。
3. **P2-2（性能与架构）**：把同步哈希改为异步/worker 契约，并同步改写 §3.5 的时间与结论口径。
4. **P2-4（令牌模型）**：确定单/多会话语义，回改 §1.3.5 与 §2.6.2 的产品表述。
5. **P3-1 / P3-2 / P3-3**：补齐契约成员清单、tab A11y 契约与样式交互态，属轻量但必须闭环项。

**复审验收标准**

1. 四项需求与验收标准 1~5 的映射无缺口，且方案文本内**不存在互相否定的条款**（重点核验 1.4 节 vs 2.3.3 节、§1.3.5 vs §2.3.3 的令牌轮换、§2.4.2 vs 客户端既有自愈策略）。
2. 方案中出现的每个标识符均可在"现状"或"本方案新增"两处之一检出（错误码、`findByDisplayName`、`canonicalizeName`、`token` 回填、HTTP 状态映射）。
3. 防冒名守门给出可执行的负向验收：不可见字符变体、大小写/空白变体、公开代号命中、旧账号无凭据认领、房内同名自愈共存。
4. 性能论证给出实测口径与异步隔离方案，且不再出现"完全不增加对局事件循环负担"式的未经证实断言。
5. A11y/RTL 契约覆盖新增 tab 控件与搜索框焦点态；6 语种新增文案在 `dictionaries.test.ts` 结构守门下齐备。
6. 本轮 8 项缺陷（1×P1 / 4×P2 / 3×P3）全部闭环，且每项附可执行的验证方法。
