# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名设计方案 · 方案终审收敛与落地推进交接单

- **交接日期**：2026-09-23
- **交接主题**：双智能体方案审查已达第 3 轮上限，依工程协议（Rule 7 & Rule 11）宣告技术方案正式收敛定稿，推进源码实现与自动化测试落地
- **最终方案文档**：[`docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md`](../ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md)
- **审查历史报告**：
  - Round 1 报告：[`docs/handoff/2026-09-23-workbuddy-code-review-round1-handoff.md`](2026-09-23-workbuddy-code-review-round1-handoff.md)（提交 `a9f71e7`）
  - Round 2 报告：[`docs/handoff/2026-09-23-workbuddy-code-review-round2-handoff.md`](2026-09-23-workbuddy-code-review-round2-handoff.md)（提交 `f3737e6`）
  - Round 3 报告：[`docs/handoff/2026-09-23-workbuddy-code-review-round3-handoff.md`](2026-09-23-workbuddy-code-review-round3-handoff.md)（提交 `ef37cfa`）
- **基准提交 SHA**：`b2c6383`
- **方案终审提交 SHA**：`4d9bdfc`
- **审查归档提交 SHA**：`ef37cfa`

---

## 1. 方案审查收敛说明（Convergence Protocol）

依据仓库《双智能体协同规范》（`AGENTS.md` 第 4.3 节）与全局协作规则（Rule 7 & Rule 11）：
> “在纯技术方案/文档审查阶段，审查轮次上限严格控制在最多 3 轮（Capped at at most 3 rounds）。到达第 3 轮时，若核心架构、可行性与接口契约已具备实质闭环，且审查员报告亦指明可转入实现阶段，主智能体必须果断判定方案收敛定稿，坚决终止文档复审循环，直接推进至源码实现与自动化测试落地阶段。真实代码实现将进入独立的对抗性代码审查闭环（最多 10 轮）。”

在 Round 3 独立终审中，WorkBuddy 审查报告明确证实：
1. **P1-1（无密码遗留账号安全认领）实质闭环**：路径 A/B 显式分流后，路径 B 的 `ownershipToken` 与认领绑定新密码分支完全可达，彻底消除死代码；
2. **P1-2（只读快照与内部活对象严格隔离）实质闭环**：`findLiveAccountByIdentifier` 确保取到 `StoredAccount` 内部活对象，彻底消除了 `TS2339` 报错与覆写抹除风险；
3. **P3-1（类型联合与状态码映射）实质闭环**：`RoomErrorCode` 扩充 4 码后子集关系恢复，HTTP 状态码显式映射表完备；
4. **P3-2（会话淘汰语义）实质闭环**：全仓统一为签发序 FIFO 淘汰（最多 5 个会话）；
5. **P2-2 / P2-3 / P2-4（异步 scrypt、Unicode 规范化、多设备令牌）实质闭环**。

针对 Round 3 指出的 3 项细节问题，已在方案文档中完成针对性固化：
- **P2-1 闸门等待超时闭包**：在 `ScryptConcurrencyGate` 中为 `waiter` 赋予具名引用对象，`indexOf(waiter)` 确保超时判定 100% 匹配并准时触发 `QUEUE_TIMEOUT`；
- **P2-2 本地化文案提供侧装配**：在方案 §2.3.3 明确补入 `GameShell.tsx:223-230` 的 `messages` 字面量装配与 `UseFriendRoomOptions.messages` 类型扩展；
- **P3-1 令牌字段映射唯一口径**：在方案 §2.5 明确规范客户端表单提交口径（仅填令牌提交 `{ token }` 走路径 A；填全字段提交 `{ identifier, password, ownershipToken }` 走认领分支 B1）。

至此，技术方案完全具备指导源码实施与测试驱动开发的充足细节与确定性契约，文档阶段正式定稿关闭。

---

## 2. 下一阶段实施拆解与落地路线图

根据已定稿的方案，代码实现分为四个清晰可验证的实施里程碑：

### 阶段一：领域模型、异步密码与数据存储（`src/server/`）
1. `src/server/accounts.ts`：
   - 实现 `canonicalizePlayerName(name)`（NFKC + 格式字符清洗 + trim + 小写）；
   - 实现 `ScryptConcurrencyGate`（并发度 2、排队上限 32、超时 5000ms）；
   - 实现异步非阻塞 `hashPassword` 与 `verifyPassword`；
   - 扩充 `StoredAccount`（`tokenHashes: string[]`、`passwordHash`、`passwordSalt`）；
   - 升级 `AccountStore`：实现 `findLiveAccountByIdentifier`、`findByDisplayName`、`isNameReserved`、`createAccount`（异步）、`loginAccount`（异步分流）、`authenticate`；
   - 扩充 `AccountError.code` 联合类型。
2. `src/server/domain/room-state-machine.ts`：
   - 在 `RoomErrorCode` 联合类型中同步补齐 4 个新错误码。
3. `src/server/online-server.ts`：
   - 落地 `POST /api/account/login` 端点，接入 10次/分 IP 限流；
   - 接入 `mapAccountErrorToStatusCode` 状态码映射与 503 闸门背压保护。

### 阶段二：网络通信、防冒名拦截与错误映射（`src/server/` & `src/components/`）
1. `src/server/room-socket.ts`：
   - 在 `resolvePlayerIdentity` 中强制执行 `isNameReserved` 校验；
   - 在 `acknowledgeAndBroadcast` 中对 `name-reserved` 抑制二次广播。
2. `src/components/hooks/room-state-utils.ts`：
   - 扩充 `UseFriendRoomOptions.messages` 与 `RoomErrorMessages`；
   - 实现 `resolveRoomErrorMessage` 错误映射函数。
3. `src/components/useFriendRoom.ts` & `src/components/GameShell.tsx`：
   - 在 `GameShell.tsx` 装配 `nameReservedError: dictionary.room.nameReservedError` 并透传。
4. `src/components/hooks/useRoomSocket.ts`：
   - 区分 `name-reserved`（直接中断并映射本地化文案）与 `duplicate-name`（房内改名自愈）。

### 阶段三：表现层无障碍、排行榜搜索框与多语言文案（`src/app/` & `src/i18n/`）
1. `src/app/globals.css`：
   - 排行榜搜索框限宽 `280px`，重置嵌入按钮与 `:focus-within` 焦点光晕；
   - 修复 `.room-leaderboard-search svg { color: inherit }`。
2. `src/components/online/OnlineLobbyView.tsx`：
   - 实现“访客 / 登录 / 注册”三态切换 Pill（WAI-ARIA Tab 规范与 roving tabindex）；
   - 登录面板提供账号标识、密码及原令牌输入控件。
3. `src/i18n/dictionaries.ts`：
   - 6 语种全面同步“Online PVP”（联机对战）及账号登录、原令牌、保留名提示等 14 组词条。

### 阶段四：全量测试套件构建与工程门禁全绿
1. 单元测试覆盖：
   - 异步密码加盐、比对与闸门背压/超时单测；
   - 遗留账号持令牌认领成功正向用例与无凭据拒绝负向用例；
   - 规范化函数 13 类字符变体（含零宽、格式控制、全角）拦截单测；
   - 多设备 `tokenHashes` 签发序 FIFO 淘汰单测；
   - `RoomErrorCode` 与 HTTP 状态码映射单测；
2. 确保四道门禁全绿（`tsc` 0 错误、`lint` 0 错误 0 警告、`npm test` 全通过、`npm run build` 全通过）。

---

## 3. 本地门禁验证基线

1. `npx tsc --noEmit`：0 错误
2. `npm run lint`：0 错误，0 警告
3. `npm test`：35 个测试套件 / 339 项单元测试全绿通过
4. `npm run build`：Next.js 生产构建通过（18/18 页面静态预渲染正常）
