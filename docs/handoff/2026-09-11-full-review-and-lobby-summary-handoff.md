# 交接文档：全量代码审查与大厅实时汇总落地

- **交付日期**：2026-09-11
- **分支**：`main`
- **对应提交**：`9505216 feat: 修复UI焦点与Profile残留，落地AI Worker复用池、开局库分级与大厅实时统计`
- **前置归档**：历史全量 5000+ 行交接记录已归档至 [`docs/archive/LEGACY_HANDOFF_ARCHIVE.md`](../archive/LEGACY_HANDOFF_ARCHIVE.md)。

---

## 1. 交付目标与背景

本阶段基于 2026-09-10 全量代码审查与改进清单，完成全部 P1~P4 优先级缺陷与遗留改进项，并彻底落地阶段 7 未完成的 IX-07 大厅实时汇总特性，实现全仓零警告、零错误基线。

---

## 2. 关键变更与落地内容

### 2.1 修复 UI/A11y 焦点强夺与 Profile 状态残留
- **弹窗焦点强夺修复**：
  - `src/components/InteractionConfirmation.tsx`：将初次挂载自动聚焦 `cancelRef.current?.focus()` 解耦为独立 `useEffect(..., [])`，避免 `onCancel` 引用或组件重渲染时抢走正在编辑或浏览的元素焦点；
  - `src/components/GameShell.tsx`：使用 `useCallback` 稳定 `handleCancelPendingTransition` 回调引用。
- **Profile 页面状态残留修复**：
  - `src/app/[locale]/profile/[playerId]/page.tsx`：传入 `<PlayerProfilePage key={decodedPlayerId} ... />`，确保切换路由用户时自动完全重置组件树；
  - `src/components/profile/PlayerProfilePage.tsx`：在渲染期增加 `prevPlayerId !== playerId` 守卫，杜绝异地网络延迟造成的数据残留。

### 2.2 实现 AI Web Worker 线程复用池（P3-2 / 原 m9）
- **复用池架构**：新建 `src/game/ai-worker-pool.ts`，实现 `AiWorkerPool` 结构，统一管理 idle 闲置池与 busy 活跃 Worker。
- **调度策略**：AI 思考落子时优先复用 idle 实例，消除频繁 `new Worker()` 与垃圾回收抖动；只有在用户悔棋或重开取消思考时，精准 `terminateBusy()` 终止忙碌任务，其余正常对局保持线程常驻复用。
- **单测覆盖**：新增 `src/game/ai-worker-pool.test.ts`，验证复用获取、归还、忙碌终止和全量销毁。

### 2.3 实现开局库权重与四档难度差异化分级（P3-3 / 原 m16）
- **开局库分级**：`src/game/opening-book.ts` 将 26 条标准生成开局按风格与对策深度分为：
  - **Normal**（8 条平稳型，权重 24~30）
  - **Hard**（8 条平衡对攻型，权重 20~24）
  - **Expert**（8 条复杂攻防型，权重 16~18）
  - **Insane**（2 条高变数奇兵型，权重 14）
- **引擎调度**：`chooseOpeningBookMove` 根据难度门控只匹配该难度及其以下难度的合法开局，实现真正有层次的难度分级，并通过加权随机增强对局多样性。
- **测试覆盖**：在 `src/game/ai.test.ts` 中增补难度开局门控与权重分级校验用例。

### 2.4 落地 IX-07 精确大厅汇总
- **协议与聚合**：在 `src/server/rooms.ts` 中定义 `LobbyActivitySummary` 结构体并在 `RoomListSnapshot` 中携带；`RoomStore.getLobbyActivitySummary()` 聚合计算 `onlineUsers`、`openTables`、`playingTables`、`spectators`，并利用数值指纹缓存防频繁跳号。
- **Socket.IO 增量广播**：在 `src/server/room-socket.ts` 中定义 `"lobby:activity"` 事件声明与 `broadcastLobbyActivity`，联动公共房间变动、房间关闭、在线用户变动及生命周期扫描，并用 `WeakMap` 防重复广播。
- **客户端接入与 UI 渲染**：`src/components/useFriendRoom.ts` 接收并维护版本单调递增的 `lobbyActivity` 状态；`src/components/online/OnlineLobbyView.tsx` 在大厅房间列表头部呈现清晰的实时统计栏；`src/i18n/dictionaries.ts` 补齐 6 种官方语言文案，`src/app/globals.css` 补齐自适应样式。
- **测试覆盖**：`src/server/room-socket.test.ts` 增补大厅初始统计校验与创建房间时的实时广播断言；`src/i18n/dictionaries.test.ts` 验证 6 语言文案与占位符一致性。

### 2.5 代码卫生与工具抽取
- **时间格式化提取**：抽取 `src/lib/date-format.ts`，消除了 `TableRoomChat.tsx` 与 `OnlineLobbyView.tsx` 中重复声明的 `formatChatMessageTime` 函数；新增 `src/lib/date-format.test.ts` 单测。
- **Git 忽略规范**：确认 `.gitignore` 已包含 `.codex/`、`.codex-remote-attachments/`、`tsconfig.tsbuildinfo` 及 `.workbuddy/*`。

---

## 3. 门禁验证结果

- **TypeScript**：`npx tsc --noEmit` ➔ 0 错误
- **代码规范**：`npm run lint` ➔ 0 错误，0 警告
- **单元测试**：`npm test` ➔ 26 套测试套件、228 项测试全数通过
- **生产构建**：`npm run build` ➔ 打包成功，SSG 静态路由预渲染 100% 成功

---

## 4. 后续技术债与重构建议

1. **`rooms.ts` (2360 行)**：将 Presence 追踪、排行榜聚合、房间核心状态机分拆为独立模块。
2. **`useFriendRoom.ts` (1731 行)**：分拆出 `useRoomSocket`、`useRoomChat`、`useLobbyPresence` 等专注子 Hook。
3. **`ai.ts` (2575 行)**：按棋型评估器、$\alpha\text{-}\beta$ 搜索器、开局库调度器进行解耦分层。
