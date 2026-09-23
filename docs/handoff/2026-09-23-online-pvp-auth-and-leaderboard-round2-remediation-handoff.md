# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名设计方案 Round 2 审查缺陷闭环交接单

- **交接日期**：2026-09-23
- **交接主题**：针对 WorkBuddy Round 2 独立方案审查报告（提交 `f3737e6`）指出的 6 项缺陷（2×P1 / 1×P2 / 3×P3）实施 100% 深度闭环修复与最终定稿
- **修订文档**：[`docs/ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md`](../ONLINE_PVP_AUTH_AND_LEADERBOARD_PLAN.md)
- **审查报告**：[`docs/handoff/2026-09-23-workbuddy-code-review-round2-handoff.md`](2026-09-23-workbuddy-code-review-round2-handoff.md)
- **基准提交 SHA**：`b2c6383`
- **被审提交 SHA**：`fb17609`
- **最新阶段审查提交**：`f3737e6`

---

## 1. 缺陷修复闭环概览

针对 WorkBuddy Round 2 独立代码审查报告中的 6 条缺陷（2×P1 / 1×P2 / 3×P3）实施逐项彻底的闭环修复：

### P1-1 闭环：路径 A/B 显式分流，彻底消除无密码账号认领死代码
- **缺陷表现**：Round 1 修复中在 `loginAccount` 头部设置了 `if (input.token?.trim()) { ... return success(...) }`，导致任何出示原令牌的认领请求直接在路径 A 早返回，路径 B 的认领分支（`:254-274`）`input.token` 恒为空、`isOwner` 恒假，正向认领用例无法执行。
- **修复方案**：
  1. 重新定义 `LoginAccountInput` 接口，显式引入 `ownershipToken?: string`（出示原设备令牌作为所有权凭据），与纯令牌快速恢复的 `token?: string` 解耦；
  2. 路径 A 设定严格的分流断言：`if (input.token?.trim() && !input.identifier?.trim())`，仅在“携带令牌且未提供任何账号标识”时作为会话快速恢复；
  3. 路径 B 读取 `ownershipToken = input.ownershipToken?.trim() || input.token?.trim()` 作为所有权凭据，合法原主出示令牌即可 100% 命中密码设置分支；
  4. 登录面板（§2.5）与六语种字典（§3）同步增设原令牌输入项 `room.accountTokenInput` / `room.accountTokenPlaceholder`，闭环用户引导。

### P1-2 闭环：严格区分只读快照与内部活实体，消除数据抹除与 TS2339 类型报错
- **缺陷表现**：方案原按 `findByPublicHandle` / `findByDisplayName` 返回的 `AccountSnapshot` 对象进行密码比对与 `persist(account)` 落盘，因快照无 `passwordHash`/`tokenHashes` 导致 TypeScript 门禁 1 红灯（`TS2339`），且字面执行时会覆写 JSONL 账号行抹除密码与会话。
- **修复方案**：
  1. `AccountStore` 确立清晰的实体边界：新增私有活对象检索方法 `findLiveAccountByIdentifier(identifier: string): StoredAccount | null`，按账号 ID、公开代号、规范化昵称统一返回内部活对象；
  2. `findByDisplayName` / `findByPublicHandle` 严格保持为只读公开快照查询方法（`getAccountSnapshot`）；
  3. `loginAccount` 全程基于 `StoredAccount` 活对象进行密码哈希比对与追加新令牌，落盘确保持久化完整的 `StoredAccount` 结构，坚决杜绝任何抹除风险；`tsc` 类型 100% 严密。

### P2-1 闭环：抑制服务端二次广播，统一客户端本地化错误映射层
- **缺陷表现**：服务端在 `ack(response)` 后通过 `socket.emit("room:error")` 发送英文错误，导致客户端在 ACK 渲染多语言文本后被后序事件覆盖为英文；且客户端各路径直接上屏 `error.message` 缺少错误码字典映射。
- **修复方案**：
  1. 在 `room-socket.ts` 的 `acknowledgeAndBroadcast` 中，对 `name-reserved` 错误码（同 `guest-session-invalid`）**抑制二次 `room:error` 事件广播**，仅通过直接 ACK 响应单通道派发，消除事件覆盖竞态；
  2. 在 `room-state-utils.ts` 中新增 `resolveRoomErrorMessage(error, messages)` 统领映射，检查 `name-reserved` 对应 `messages.nameReservedError`、`duplicate-name` 对应 `messages.duplicateNameError`，回退英文原句；
  3. 客户端 `applyRoomAck` 与 `room:error` 监听器统一消费该函数，确保 6 语种本地化文案 100% 准确上屏。

### P3-1 闭环：`RoomErrorCode` 姊妹联合同步扩充与显式 HTTP 状态码映射表
- **缺陷表现**：`src/server/domain/room-state-machine.ts` 中独立的 `RoomErrorCode` 联合类型未同步扩充 4 个新错误码，导致 `room-socket.ts` 编译报错（`TS2322`）；且 HTTP 状态码映射在方案内缺少显式契约。
- **修复方案**：
  1. 在 `RoomErrorCode` 中同步新增 `"account-not-found" | "account-password-required" | "invalid-password" | "name-reserved"` 4 个成员；
  2. 在 §2.2.3 中给出显式的 HTTP 状态码决策函数 `mapAccountErrorToStatusCode`：`duplicate-*` / `name-reserved` → 409 Conflict，`account-*` / `invalid-password` → 401 Unauthorized，`invalid-handle/player` → 400 Bad Request，限流 → 429 Too Many Requests，闸门过载 → 503 Service Unavailable。

### P3-2 闭环：会话淘汰语义统一为按签发序 FIFO 截断
- **修复方案**：将文档表述由“最久未活跃”统一修正为“保留最近签发的 5 个设备会话（MRU/FIFO by issue order: 新签发令牌置顶，超出 5 个时淘汰最早签发的会话；若设备被挤出需凭密码重新登录）”。`authenticate` 仅验证哈希并更新全局 `lastSeenAt`，不频繁改写数组顺序以避免无意义磁盘刷写。

### P3-3 闭环：`ScryptConcurrencyGate` 增设最大排队深度与超时背压契约
- **修复方案**：在 `ScryptConcurrencyGate` 中增设 `maxQueueSize = 32` 与 `timeoutMs = 5000`。超出队列深度时立即抛出 `QUEUE_FULL` 触发 503/429 降级保护；排队超过 5 秒时抛出 `QUEUE_TIMEOUT` 拒绝，杜绝无界排队带来的内存膨胀。

---

## 2. 待确认风险与安全边界客观化说明

1. **名称规范化防御边界**：`canonicalizePlayerName` 专注于 Unicode NFKC 折叠、`\p{Cf}` 格式控制符（`U+200B` 零宽空格、`U+2060` 词连接符、`U+00AD` 软连字符、BOM）与多余空白消除。非 Cf 不可见字符（如 `U+3164`）及跨语系同形字（如西里尔 А）列为进阶 Confusable 增强项，删除方案中“彻底斩断一切”等绝对化用词；
2. **遗留无密码账号取舍说明**：对于原浏览器缓存已被完全清除、且未曾设置过密码的历史无密码账号，因无法在缺乏有效令牌凭据下自证所有权，必须严格拒绝认领，以保障全量玩家账号不被通过公开昵称恶意篡改。

---

## 3. 本地工程门禁验证基线

1. `npx tsc --noEmit`：0 错误（严格类型推导通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量规范扫描通过）
3. `npm test`：35 个测试套件 / 339 项单元测试全绿通过
4. `npm run build`：Next.js 生产构建打包通过（18/18 静态页面生成成功）
