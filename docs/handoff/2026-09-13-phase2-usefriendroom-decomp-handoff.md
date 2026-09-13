# 交接文档：Phase 2 前端状态 Hook 解耦与代码卫生收敛交付单 (Phase 2 Handoff)

- **交付日期**：2026-09-13
- **交付角色**：Phase 2 独立开发与验证工程师
- **所属阶段**：Phase 2（前端状态 Hook 解耦）
- **关联总纲**：[`docs/handoff/2026-09-13-comprehensive-refactoring-master-plan-handoff.md`](2026-09-13-comprehensive-refactoring-master-plan-handoff.md)
- **输入审计**：[`docs/handoff/2026-09-13-workbuddy-code-review-round1-handoff.md`](2026-09-13-workbuddy-code-review-round1-handoff.md)

---

## 1. 交付目标与背景

在重构蓝图 Phase 2 中，前端最庞大的上帝 Hook `src/components/useFriendRoom.ts`（原 1776 行，导出 79 个字段，管理 10 个业务域）面临严重的高耦合与状态污染风险：
1. **模块级快照缺陷（R6）**：4 个启动快照缓存（`bootAccountStatusCache`, `bootPlayerNameCache`, `bootJoinTargetCache`, `bootIsJoiningRoomCache`）以模块级全局 `let` 变量形式常驻内存，导致 HMR、多会话及单测之间状态残留污染；
2. **多业务域混杂**：Socket 生命周期、大厅 Presence、天梯排行、个人 Profile、对局记录回放/提交、房间聊天、公共聊天、棋局走子与权限判断强行捆绑在单一巨大 Hook 内；
3. **Phase 1 遗留代码卫生项（P3）**：审查报告指出 `BOARD_SIZE` 双源、`WIN_STONE_COUNT` 未消费、测试用例有效性不足以及 STATUS 事实指标偏差等问题。

本次交付严格按照 Master Plan 第 3.2 节规划，将 `useFriendRoom.ts` 解耦为 4 个专注领域子 Hook + 1 个共享工具模块，彻底消除 R6 缺陷，并顺手完整收敛全部 P3 建议。

---

## 2. 核心改动与架构落地

### 2.1 收敛 Phase 1 审查建议（P3 闭环）

| 编号 | 问题描述 | 修复方案与代码落地 | 验证结果 |
| :--- | :--- | :--- | :--- |
| **P3-1** | `BOARD_SIZE` 出现双源定义（`constants.ts` 与 `board.ts` 各自声明） | `src/lib/constants.ts` 改为从底层纯领域核心 `@/game/board` 再导出：`export { BOARD_SIZE, WIN_STONE_COUNT } from "@/game/board"`，单一本源 | 编译无循环依赖，引用源唯一 |
| **P3-2** | `WIN_STONE_COUNT` 导出但核心规则未消费 | `src/game/board.ts:4,140`（`line.length >= WIN_STONE_COUNT`）与 `src/game/ai.ts:2,1634`（`hasFiveAt: count >= WIN_STONE_COUNT`）统一消费领域常量 | 胜负规则由常量统一驱动 |
| **P3-3** | `constants.test.ts` 缺少行为级守护 | 补充 2 项行为级测试用例，真实验证 `BOARD_SIZE` 与 `WIN_STONE_COUNT` 在棋盘初始化和五连珠获胜判决中的行为，以及聊天与昵称截断边界守护 | 单测全绿（7/7 通过） |
| **P3-4** | `STATUS.md` 最新提交与行数存在事实偏差 | 刷新最新交付提交 SHA、精准更新所有重构后文件行数及单测用例统计 | 动态事实基准 100% 对齐 |

### 2.2 拆解创建 4 个专注子 Hook + 共享工具模块

在 `src/components/hooks/` 目录下创建专注的领域子 Hook：

```
src/components/
├── hooks/
│   ├── room-state-utils.ts   [NEW 397 行] 共享存储、URL、会话辅助与 useBootSnapshot Hook
│   ├── useRoomSocket.ts      [NEW 539 行] 专注 Socket 连接生命周期、房间基础状态与创建/加入/退出流
│   ├── useLobbyPresence.ts   [NEW 501 行] 专注大厅房间列表、在线 Presence、排行榜、Profile 与匹配
│   ├── useRoomChat.ts        [NEW 180 行] 专注房间聊天、公共大厅聊天与聊天发送闸门
│   └── useRoomGame.ts        [NEW 133 行] 专注棋局对弈交互（落子、准备、认输、悔棋、坐下）及权限守卫
└── useFriendRoom.ts          [MODIFY 441 行] 蜕变为顶层轻量装配器
```

1. **`room-state-utils.ts`**：
   - 提取会话存储操作（`readRoomSession`, `persistRoomSession`, `clearRoomSession` 等）；
   - 提取 URL 与房间码处理（`normalizeRoomCode`, `getRoomUrl`, `syncRoomUrl`, `clearRoomUrl` 等）；
   - 提取连接错误格式化与类型守卫。
2. **`useRoomSocket.ts`**：
   - 托管底层 `io` 连接、自动重连恢复、网络断开告警；
   - 管理当前房间实体 `room` 与全局连接错误 `error`；
   - 托管 `createRoom`, `joinRoomByCode`, `joinRoomByTarget`, `joinListedRoom`, `leaveRoom`；
   - 暴露 `updateEventHandlers` 同步分发器，解耦外部监听。
3. **`useLobbyPresence.ts`**：
   - 增量接收并管理 `lobbyActivity`, `lobbyRooms`, `presenceUsers`；
   - 排行榜查询、作用域切换、搜索、分页（带 AbortController 防乱序）；
   - 玩家战绩 Profile 查询、上一局对局记录自动获取；
   - 游戏结束自动上报对局结果（`game-record:submit`）；
   - 在线快速匹配（`findMatch`, `cancelMatch`）；
   - 房间入口守卫（`canCreateRoom`, `canFindMatch`, `canJoinRoom`, `canCancelMatch`）。
4. **`useRoomChat.ts`**：
   - 房间聊天与公共大厅聊天状态管理；
   - 集成 `ChatSendGate` 防重复提交与 8 秒看门狗超时恢复未发送文本。
5. **`useRoomGame.ts`**：
   - 纯净的对局操作方法：`playMove`, `toggleReady`, `resignGame`, `setRematchReady`, `respondUndoRequest`, `undoMove`, `sitRoom`；
   - 权限守卫衍生：`canPlay`, `canReady`, `canRematch`, `canResign`, `canSit`, `canUndo`, `ready`, `rematchReady`。

### 2.3 根治 R6 模块级快照缺陷

原代码中：
```typescript
// useFriendRoom.ts 旧实现：4 个模块级全局变量
let bootAccountStatusCache: FriendRoomController["accountStatus"] | null = null;
let bootPlayerNameCache: string | null = null;
let bootJoinTargetCache: string | null = null;
let bootIsJoiningRoomCache: boolean | null = null;
```

**改造为实例级 Hook**：在 `room-state-utils.ts` 中封装 `useBootSnapshot`：
```typescript
export function useBootSnapshot<T>(
  computeClientSnapshot: () => T,
  serverSnapshot: T
): T {
  const cacheRef = useRef<T | null>(null);
  const getSnapshot = useCallback(() => {
    if (cacheRef.current === null) {
      cacheRef.current = computeClientSnapshot();
    }
    return cacheRef.current;
  }, [computeClientSnapshot]);

  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot]);

  return useSyncExternalStore(subscribeToBootState, getSnapshot, getServerSnapshot);
}
```
- **消除全局可变状态**：每个 Hook 实例拥有独立的 `useRef`，生命周期与组件实例绑定；
- **消除 HMR 与跨测试污染**：组件卸载后 ref 自动释放；
- **保持水合安全性**：服务端固定渲染默认快照，客户端首屏水合一致，绝无 React 19 水合告警。

### 2.4 顶层装配器蜕变与 API 零破坏保证

`src/components/useFriendRoom.ts` 从 1776 行精简至 441 行，保留账户登录/注册/登出以及邀请链接复制等轻量状态，组合调用上述 4 个子 Hook，组装并返回类型完全一致的 `FriendRoomController`（79 个字段无缝保持）。

**所有 6 个外部消费组件无需改动任何代码**：
- `GameShell.tsx`
- `GameTableView.tsx`
- `OnlineLobbyView.tsx`
- `TableRoomChat.tsx`
- `TableSidebar.tsx`
- `TableSidebarTabs.tsx`

---

## 3. 本地工程门禁与验证指标

| 门禁项 | 命令 | 指标要求 | 执行结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **门禁 1: TypeScript 编译** | `npx tsc --noEmit` | 0 错误 | 0 错误，严格类型推导全绿 | ✅ 通过 |
| **门禁 2: ESLint 规范扫描** | `npm run lint` | 0 错误 0 警告 | 0 错误 0 警告，严格遵守 React 19 Hooks 规则 | ✅ 通过 |
| **门禁 3: 单元测试套件** | `npm test` | 全部通过 | 27 个测试套件 / 235 项用例 100% 通过 | ✅ 通过 |
| **门禁 4: Next.js 生产构建** | `npm run build` | 打包成功 | Compiled in 3.2s，全语言静态路由生成成功 | ✅ 通过 |
| **联机验证: 综合服务烟测** | `npm run verify:online` | 全部 PASS | 页面、版本、Socket.IO WebSocket 握手通过 | ✅ 通过 |
| **联机验证: 大厅 Presence** | `npm run smoke:lobby` | 全部 PASS | 房间生命周期、在场用户同步增量一致性通过 | ✅ 通过 |
| **联机验证: 匹配队列** | `npm run smoke:matchmaking` | 全部 PASS | 匹配寻找、进入房间、满员隔离、取消匹配通过 | ✅ 通过 |

---

## 4. 下一步建议与后续交接

随着 Phase 2（前端状态 Hook 解耦）与 P3 卫生点的圆满落地，前端表现层与大 Hook 的技术债已消除最核心的第一层。
推荐下一步推进 **Phase 3：联机大厅与表现层组件化**：
1. 从 `GameShell.tsx`（973 行）中抽离 `useAiGame` Hook（~190 行 AI Worker 调度与开局策略）；
2. 将 `OnlineLobbyView.tsx`（888 行）中的内联面板拆分为独立文件树，并引入 `RoomContext` 消除万能数据包多层 Props 钻透。
