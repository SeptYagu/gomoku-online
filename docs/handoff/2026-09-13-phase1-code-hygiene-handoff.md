# 交接文档：Phase 1 全局常量中枢与代码卫生治理交付报告

- **交付日期**：2026-09-13
- **执行阶段**：Phase 1（全局常量中枢与代码卫生治理）
- **依据总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **风险等级**：Low Risk (Foundation)
- **状态**：✅ 已完成交付并通过全部工程门禁

---

## 1. 交付目标与背景

根据重构总纲 3.1 节，本阶段作为全量重构的基石阶段，目标是彻底解决代码审查中指出的分散魔法值、内联脚本重复、部署诊断文案硬编码、默认玩家名分散与自由五子棋规则未文档化等全部代码气味（Nit）项，为 Phase 2~5 的大型巨石拆解建立规范的常量与组件基座，确保零业务逻辑破损与零时序回归。

---

## 2. 关键变更与落地内容

### 2.1 新建 `src/lib/constants.ts` 与单元测试
集中定义五大类常量并严格冻结：
- **棋盘与规则**：`BOARD_SIZE = 15`、`WIN_STONE_COUNT = 5`
- **长度限制**：`MAX_CHAT_MESSAGE_LENGTH = 160`、`MAX_PLAYER_NAME_LENGTH = 24`
- **默认配置**：`DEFAULT_PLAYER_NAME = "Player"`
- **分页配置**：`PAGINATION = { LOBBY_ROOMS: 20, PRESENCE_USERS: 30, LEADERBOARD: 10, PLAYER_PROFILE_RECORDS: 50, DEFAULT_PROFILE_RECORDS: 20 } as const`
- **时序与超时**：`LIFECYCLE_SWEEP_INTERVAL_MS = 10_000`、`COPY_FEEDBACK_DURATION_MS = 1_800`、`DISCONNECT_GRACE_MS = 60_000`、`EMPTY_ROOM_GRACE_MS = 60_000`
- **单元测试**：新建 `src/lib/constants.test.ts`，验证所有导出的类型与数值完备性（5 项单测全绿）。

### 2.2 魔法值点位精确替换
按照蓝图 3.1.1 替换表逐项替换：
1. `src/server/rooms.ts`：移除局部 `DISCONNECT_GRACE_MS`，`MAX_ROOM_CHAT_TEXT_LENGTH = MAX_CHAT_MESSAGE_LENGTH`，`hostName` 默认回退 `DEFAULT_PLAYER_NAME`。
2. `src/components/online/OnlineLobbyView.tsx`：玩家名字输入 `maxLength={MAX_PLAYER_NAME_LENGTH}`，公共聊天输入 `maxLength={MAX_CHAT_MESSAGE_LENGTH}`。
3. `src/components/online/TableRoomChat.tsx`：房间聊天输入 `maxLength={MAX_CHAT_MESSAGE_LENGTH}`。
4. `src/server/accounts.ts`：`MAX_DISPLAY_NAME_LENGTH = MAX_PLAYER_NAME_LENGTH`。
5. `src/components/useFriendRoom.ts`：
   - 大厅房间拉取 limit 采用 `PAGINATION.LOBBY_ROOMS`；
   - 在线用户 Presence 拉取 limit 采用 `PAGINATION.PRESENCE_USERS`；
   - 排行榜分页大小采用 `PAGINATION.LEADERBOARD`，请求参数使用 `String(PAGINATION.LEADERBOARD)`；
   - 复制邀请成功反馈定时器使用 `COPY_FEEDBACK_DURATION_MS`；
   - 默认名称采用 `DEFAULT_PLAYER_NAME`，`createGuestPlayerName` 收敛为 `${DEFAULT_PLAYER_NAME} ${createRandomNumber(...)}`。
6. `src/components/profile/PlayerProfilePage.tsx`：档案请求参数使用 `String(PAGINATION.PLAYER_PROFILE_RECORDS)`。
7. `src/server/game-records.ts`：
   - `listRecords` 默认 limit 采用 `PAGINATION.PLAYER_PROFILE_RECORDS`；
   - `getPlayerProfile` 默认 limit 采用 `PAGINATION.DEFAULT_PROFILE_RECORDS`，displayName 默认值使用 `DEFAULT_PLAYER_NAME`；
   - `listRecordsForPlayer` 默认 limit 采用 `PAGINATION.PLAYER_PROFILE_RECORDS`；
   - 参数显式声明 `: number` 守卫，杜绝 TypeScript `as const` 导致的字面量类型逆变收窄。
8. `src/components/GomokuBoard.tsx`：星位绝对百分比定位公式中的 `/ 15` 替换为 `/ BOARD_SIZE`。
9. `src/server/room-socket.ts`：移除局部 `EMPTY_ROOM_GRACE_MS` 改为常量导入，清扫周期默认值采用 `LIFECYCLE_SWEEP_INTERVAL_MS`。

### 2.3 提取 `src/components/ThemeScript.tsx`
将 `src/app/(root)/layout.tsx` 和 `src/app/[locale]/layout.tsx` 中重复的 200+ 字符内联主题初始化脚本抽取为纯服务端组件 `ThemeScript`，引用 `themeStorageKey`，消除代码重复并防止首屏深浅色主题闪烁。

### 2.4 代码卫生与规则文档化
- **诊断文案收敛**：在 `useFriendRoom.ts` 中明确标注 `DEFAULT_CONNECTION_XHR_ERROR` 为无字典或开发态降级诊断信息（生产环境优先由 `dictionaries.ts` 6 种语言字典承载）。
- **多标签页访客隔离说明**：在 `useFriendRoom.ts:getOrCreatePlayerId` 补充架构说明文档，明确 `sessionStorage` 专用于同浏览器多开/分身隔离机制。
- **自由五子棋规则声明**：在 `README.md` 中新增「## 对弈规则（Freestyle Gomoku）」章节，明确 15x15、`>=5` 连珠即胜（含长连）、无黑棋禁手的对称规则（对应 `board.ts:140` 与 `ai.ts:1633`）。

---

## 3. 本地工程门禁验证数据（全部全绿）

依次完整运行本地四道门禁与联机验证：
1. **TypeScript 严格类型检查** (`npx tsc --noEmit`)：
   - 结果：`0 error`
2. **ESLint 规范扫描** (`npm run lint`)：
   - 结果：`0 error, 0 warning`
3. **Vitest 单元测试套件** (`npm test`)：
   - 结果：`27 passed (27 test files)`, `233 passed (233 tests)`（新增 5 项常量单测）
4. **Next.js 生产构建** (`npm run build`)：
   - 结果：`Compiled successfully in 4.2s`, `Generating static pages (11/11)`, `Exit code 0`
5. **联机服务时序烟测** (`npm run verify:online`)：
   - 结果：Page / Version / Polling / WebSocket 4 项全绿通过。

---

## 4. 变更文件清单

| 文件路径 | 变更性质 | 说明 |
| :--- | :--- | :--- |
| `src/lib/constants.ts` | **新建** | 全局常量中枢 |
| `src/lib/constants.test.ts` | **新建** | 常量定义完整性测试 |
| `src/components/ThemeScript.tsx` | **新建** | 可复用主题初始化防闪烁脚本组件 |
| `src/app/(root)/layout.tsx` | 修改 | 改用 `<ThemeScript />` |
| `src/app/[locale]/layout.tsx` | 修改 | 改用 `<ThemeScript />` |
| `src/components/GomokuBoard.tsx` | 修改 | 星位定位引用 `BOARD_SIZE` |
| `src/components/online/OnlineLobbyView.tsx` | 修改 | 输入框限制引用常量 |
| `src/components/online/TableRoomChat.tsx` | 修改 | 聊天框限制引用常量 |
| `src/components/profile/PlayerProfilePage.tsx` | 修改 | 战绩查询 limit 引用常量 |
| `src/components/useFriendRoom.ts` | 修改 | 分页、反馈定时、默认名称收敛与文档补充 |
| `src/server/accounts.ts` | 修改 | 昵称限制引用常量 |
| `src/server/game-records.ts` | 修改 | 战绩分页与默认档案名称引用常量并补充类型守卫 |
| `src/server/room-socket.ts` | 修改 | 空房宽限与清扫周期引用常量 |
| `src/server/rooms.ts` | 修改 | 断线宽限、聊天限制与房主默认名称引用常量 |
| `README.md` | 修改 | 补充自由五子棋（Freestyle Gomoku）规则明确章节 |

---

## 5. 后续接手协议（Handoff to Phase 2）

- **下一个阶段**：**Phase 2: 前端状态 Hook 解耦 (`src/components/useFriendRoom.ts`)**
- **核心任务**：
  1. 将 1772 行的 `useFriendRoom.ts` 拆解为 `useRoomSocket`、`useRoomChat`、`useLobbyPresence`、`useRoomGame` 4 个子 Hook；
  2. 将 4 个模块级 `let boot*Cache` 变量收敛到 Hook 实例级 `useRef`，消除 R6 跨实例生命周期污染；
  3. 保持顶层 `useFriendRoom.ts` 作为 Facade 门面与 79 字段 `FriendRoomController` 契约不变，确保 6 个消费组件零破坏。
