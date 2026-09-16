# 对局持久化、语言平滑切换与外观保持方案设计交接单

- **交接日期**：2026-09-16
- **交接主题**：对局持久化（刷新/切语言不丢局）、语言平滑切换（修复跳回首页与丢房间号 Bug）与外观设置保持技术设计方案
- **设计文档**：[`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)
- **交付类型**：**需求与技术设计方案（Technical Design / Proposal）**，本次交付仅包含设计规范与交接单，源码尚未进入实现阶段。
- **基准提交 SHA**：`29058c0`（`fix(lobby): resolve round 3 review findings for unlisted room creation disambiguation`）

---

## 1. 交付目标与背景

针对用户提出的“刷新网页不丢弃对局（覆盖单机、人机、在线好友房三模式）”与“切换语言时跳回首页且疑似玩家数据丢失”的体验痛点，开展全链路根因剖析并制定工程设计规范：

1. **Bug 定位（语言切换跳回首页与丢失在线对局）**：
   - 根因：`src/components/LocaleSwitcher.tsx:30` 硬编码了 `href={`/${locale}`}`。
   - 后果 1（子路由跌回根目录）：在个人主页（`/[locale]/profile/[playerId]`）等非首页路径点击语言切换，强制回退至首页 `/[newLocale]`。
   - 后果 2（丢房间参数脱离联机）：在在线房间（`/[locale]?room=XXXXXX`）切换语言时，查询参数 `?room=...` 被完全抹除；路由更新触发 `GameShell` 重新挂载后，启动模式误判跌落回默认的 `local` 模式，导致房间断开脱离，给用户造成“在线数据全丢了”的严重假象。
   - 后果 3（单机状态被重置）：由于本地双人与人机对战仅存在于 React 状态内存中，路由跳转重挂载时内存状态被清空，棋局重置为空盘。
2. **三模式对局刷新与切语言防丢目标**：
   - **在线对战好友房**：现有架构已具备服务端 60 秒断线宽限期（`DISCONNECT_GRACE_MS = 60_000`）与 `sessionStorage` 凭据。只需修复语言切换保留 `?room=` 参数，即可零服务端改动天然实现刷新与切语言无缝重连恢复。
   - **双人本地对战**：通过 `sessionStorage` 持久化最小落子列表 `moves: Move[]`，利用现有的纯领域核心函数 `replayMoves(moves)` 在毫秒级内确定性还原棋盘与落子轮次。
   - **人机对战**：持久化 `moves`、`aiDifficulty`、`firstPlayer` 与 `openingSeed`；特别覆盖**AI 思考中被刷新/切语言**的边缘场景，恢复挂载后根据当前轮次自动触发 `commitAiTurn` 唤醒 Web Worker 接续思考，无感续弈。
3. **外观与语言设置长期保持**：
   - 外观主题（`light` / `dark`）维持 `localStorage` + `<head>` 预加载防闪烁脚本（`ThemeScript.tsx`），保证刷新与跨语言切换 100% 零白屏/无闪烁。
   - 语言设置维持 `localStorage` + Cookie 双写，根路径访问根据 Cookie 自动重定向至首选语言。

---

## 2. 关键架构与数据契约设计

### 2.1 语言切换路由计算（纯函数解耦）
在 `src/components/locale-switch.ts` 中提取纯函数 `computeLocaleSwitchHref(pathname, search, targetLocale)`：
- 识别开头语言前缀并替换为目标语言代码（例如 `/zh/profile/123` $\rightarrow$ `/en/profile/123`）；
- 透传并拼接现有查询字符串（例如 `?room=AB12CD`）；
- 杜绝硬编码根路径导航。

### 2.2 活跃对局持久化契约
在 `src/components/hooks/game-persistence.ts` 中定义 `sessionStorage` 数据结构（Key: `gomoku-active-game`）：
```ts
export type StoredLocalGameSession = {
  mode: "local";
  moves: Move[];
  updatedAt: number;
};

export type StoredAiGameSession = {
  mode: "ai";
  moves: Move[];
  aiDifficulty: AiDifficulty;
  firstPlayer: FirstPlayer;
  openingSeed: number;
  updatedAt: number;
};

export type StoredActiveGame = StoredLocalGameSession | StoredAiGameSession;
```
- **纯函数单一真源**：不存储任何二维数组 `board` 或派生状态，100% 通过 `replayMoves` 纯计算重建。
- **水合安全性**：基于现有 `useSyncExternalStore` 与 `useBootSnapshot` 模式，避免客户端直接读取 Storage 引发 React 19 SSR Hydration Mismatch。
- **状态销毁闭环**：主动重置、确认切换模式、退出房间时清空 Storage，杜绝脏数据跨局污染。

---

## 3. 本地门禁基线验证

本次提交仅包含技术设计规范文档与交接索引，未修改源码。基线门禁全绿：

1. `npx tsc --noEmit`：0 错误（TypeScript 严格检查通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量扫描通过）
3. `npm test`：29 个测试套件 / 248 项用例 100% 通过
4. `npm run build`：生产构建完全成功（11 个静态路由全通）
5. `npm run verify:online`：在线房间与时序烟测全绿

---

## 4. 下一步与实施计划

设计经审查闭环后，按以下顺序开展代码落地与测试守门：
1. 编写 `locale-switch.ts` 纯函数与覆盖各种路径组合的单元测试；
2. 接入 `LocaleSwitcher.tsx` 消除硬编码跳转；
3. 编写 `game-persistence.ts` 纯存储工具模块与单元测试；
4. 改造 `client-boot-state.ts`、`useAiGame.ts` 与 `GameShell.tsx` 接入对局自愈与回放机制；
5. 执行四道门禁与关键场景人工走查验证。
