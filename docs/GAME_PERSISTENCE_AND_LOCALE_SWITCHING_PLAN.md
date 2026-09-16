# 对局持久化、语言平滑切换与外观保持方案设计

更新日期：2026-09-16  
状态：方案设计与规划，待评审

---

## 1. 目标与问题背景

### 1.1 现状与用户痛点
当前在线五子棋项目在用户体验上存在以下两个关联的痛点：
1. **刷新网页或切换语言丢局**：
   - 本地双人对战（Local）和人机对战（AI）的状态保存在 React 运行时状态（`GameShell.tsx`）中。用户一旦刷新浏览器或切换页面语言，组件卸载重载导致对局状态清空，棋盘重置为空盘。
2. **切换语言跳回首页且丢失联机对局（Bug 定位）**：
   - 在 `src/components/LocaleSwitcher.tsx` 中，语言链接写死了 `href={`/${locale}`}`。
   - 当用户在子页面（例如个人主页 `/[locale]/profile/[playerId]`）切换语言时，会被强制导航回首页 `/[newLocale]`。
   - 当用户在进行在线对局（`/[locale]?room=XXXXXX`）时切换语言，查询参数 `?room=...` 被完全抹除。
   - 因为 URL 中失去了房间标识，页面重新挂载后启动模式从 `room` 跌落回默认的 `local`，导致玩家断开房间且看不到正在进行的联机对局，产生“数据全部丢失”的假象。

### 1.2 预期目标
1. **全模式对局防丢（刷新 & 切换语言）**：
   - **双人本地对战**：刷新或切换语言后，完整恢复棋盘、所有落子历史与当前轮次。
   - **人机对战**：刷新或切换语言后，完整恢复落子历史、AI 难度与先后手设置；若在 AI 思考期间刷新，恢复后自动唤醒 Web Worker 重新开始思考，实现无感续弈。
   - **在线好友房**：修正语言切换时的 URL 保留逻辑，配合现有的 60 秒服务端断线宽限期与 `room:rejoin` 机制，实现刷新与切语言均不脱离房间。
2. **语言与外观设置完备保留**：
   - 外观主题（`light` / `dark`）在刷新、切换语言和跨会话访问时始终保持，首屏无样式闪烁（FOUC）。
   - 切换语言时保留当前路径（Pathname）与查询参数（Search Params），并在 Storage 与 Cookie 中同步持久化，再次访问根目录 `/` 时精准直达目标语言。

---

## 2. 根因剖析与架构解法

### 2.1 语言切换跳回首页的根因
`src/components/LocaleSwitcher.tsx` 现有实现：
```tsx
// 现有代码：硬编码了仅包含语言代码的根路径
<Link
  href={`/${locale}`}
  onClick={() => persistLocale(locale)}
>
```
由于缺少对当前 `pathname` 和 `searchParams` 的提取与替换，导致用户当前路由上下文被无条件丢弃。

**解法**：
引入纯函数 `computeLocaleSwitchHref(currentPathname, currentSearch, targetLocale)`：
- 识别并替换开头的 `/${currentLocale}` 语言前缀为 `/${targetLocale}`，保持后续路径（如 `/profile/xxx`）不变；
- 继承现有的查询字符串（如 `?room=AB12CD` 或其它诊断参数）；
- 生成目标 URL：`/${targetLocale}/subpath?room=AB12CD`。

### 2.2 本地与人机对战易失性根因
在 `GameShell.tsx` 中，`board`、`moves`、`status`、`nextPlayer` 均为 `useState` 内存状态，页面卸载即消亡。

**解法（基于纯函数回放的极简持久化）**：
- **存储选型**：使用 `sessionStorage`（键名：`gomoku-active-game`）。
  - *为什么是 sessionStorage*：提供标签页隔离能力（单浏览器多开不冲突），并在关闭标签页时自然销毁，最贴合“防误触刷新/切换语言”的使用预期。
- **单一真源设计**：
  - 严禁保存庞大的二维 `board` 数组或冗余的派生状态；
  - 仅需保存最小落子列表 `moves: Move[]` 以及元配置；
  - 恢复时调用领域核心纯函数 `replayMoves(moves)`，几毫秒内确定性回放得到完全一致的棋盘与胜负判决。

---

## 3. 详细设计与数据契约

### 3.1 对局持久化数据结构（Session Schema）
在 `src/components/hooks/game-persistence.ts`（新建独立模块）中定义：

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

### 3.2 启动与水合安全（React 19 / SSR 契约）
为避免直接读取 Storage 造成 Next.js SSR 水合不匹配警告（Hydration Error），统一通过 `useSyncExternalStore` 与 `useBootSnapshot` 模式读取启动快照：
1. 服务端快照 `getServerSnapshot` 返回 `null`；
2. 客户端首屏渲染读取 Storage 对应快照；
3. 启动模式判定优先级：
   - 优先级 1：URL 带有 `?room=` $\rightarrow$ 强制启动为 `"room"`；
   - 优先级 2：`sessionStorage` 存在活跃单机对局 $\rightarrow$ 启动为对应模式（`"ai"` 或 `"local"`）；
   - 优先级 3：默认兜底 $\rightarrow$ `"local"`。

### 3.3 各模式对局恢复时序流

#### A. 双人本地对战（Local）
1. 页面挂载，检测到 Storage 存在有效的 `StoredLocalGameSession` 且当前模式为 `local`；
2. 通过 `replayMoves(session.moves)` 还原 `board`；
3. 计算 `lastMove`，通过 `getGameResult` 计算 `status`；
4. 若对局未结束，`nextPlayer = getOpponent(lastMove.stone)`，玩家可直接落子。

#### B. 人机对战（AI）
1. 页面挂载，还原 `moves`、`board`、`aiDifficulty`、`firstPlayer`；
2. **AI 思考中刷新边缘恢复（Self-Healing Handshake）**：
   - 判断当前最后一手落子人与对局状态；
   - 若 `status.state === "playing"` 且当前轮到的落子方恰好为 `aiStone`（即玩家落子后立即刷新，或 AI 思考中被刷新）；
   - 页面初始化完成后，自动触发一次 `commitAiTurn(board, moves)`；
   - 重新从 `AiWorkerPool` 获取 Worker 并启动倒计时调度器，AI 无缝接管思考并落子。

#### C. 在线好友房（Online Room）
1. 语言切换时，`computeLocaleSwitchHref` 将 `?room=CODE` 完好透传至新语言 URL；
2. 路由导航完成，`useBootGameMode` 识别到 `?room=` 保持 `room` 工作区激活；
3. `useRoomSocket` 读取 `sessionStorage` 中的 `gomoku-room-session`，自动发起 `room:rejoin`；
4. 服务端由于 60 秒宽限期未超时，无缝回写 `room:state`，对局继续。

### 3.4 存储清理策略（State Invalidation）
必须保持严密的生命周期闭环，防止脏对局滞留：
1. **主动重置**：点击“重新开始/再来一局”时，清空存储并初始化空局；
2. **主动模式切换**：在确认弹窗点击“离开/切换模式”时，清空当前模式存储；
3. **在线退房**：点击退出房间完成退房后，清空联机 Session。

---

## 4. 语言与外观设置契约

### 4.1 外观设置（Theme Mode）
- **存储介质**：`localStorage`（Key: `gomoku-theme`）。
- **防闪烁机制**：根布局 `<head>` 内的 `ThemeScript.tsx` 在 DOM 渲染前同步阻塞读取并写入 `<html data-theme="...">`，确保浅色/暗色无论如何刷新或切语言均零闪烁。
- **响应机制**：`ThemeToggle.tsx` 通过 `useSyncExternalStore` 监听 `gomoku-theme-change` 与 `storage` 事件，支持多窗口同步。

### 4.2 语言设置（Locale Mode）
- **双写持久化**：
  - `localStorage`（Key: `gomoku-locale`）：用于客户端状态感知；
  - `document.cookie`（Key: `gomoku-locale`，`Max-Age=365天`，`Path=/`）：供 Next.js 服务端在用户访问根路径 `/` 时由 `(root)/page.tsx` 读取并 307 重定向。
- **路由无损切换**：
  - `LocaleSwitcher` 计算包含当前路径和所有参数的 targetHref；
  - 切换语言不会跳回根路径，不丢弃对局与查询参数。

---

## 5. 验证与回归测试计划

### 5.1 自动化单元测试
1. `computeLocaleSwitchHref` 纯函数测试：
   - 首页 `/zh` 切换到 `/en` $\rightarrow$ `/en`；
   - 子路径 `/zh/profile/p1` 切换到 `/en` $\rightarrow$ `/en/profile/p1`；
   - 带参路径 `/zh?room=ABC` 切换到 `/en` $\rightarrow$ `/en?room=ABC`；
   - 复杂参数 `/zh/profile/p1?tab=history&room=ABC` 切换到 `/fr` $\rightarrow$ `/fr/profile/p1?tab=history&room=ABC`。
2. `game-persistence` 序列化与校验测试：
   - 非法或损坏的 storage 容错回退；
   - `replayMoves` 状态完全一致性比对。
3. `client-boot-state` 启动测试：
   - 存在 Storage 时正确识别初始模式；
   - URL `?room=` 优先级高于 Storage。

### 5.2 本地工程门禁验证
1. `npx tsc --noEmit`：0 错误；
2. `npm run lint`：0 错误 0 警告；
3. `npm test`：全测试通过（包含新增测试用例）；
4. `npm run build`：生产构建通过；
5. `npm run verify:online`：在线联机时序烟测全绿。

### 5.3 关键场景手工冒烟走查
1. **场景 1**：本地双人对战走 5 步 $\rightarrow$ 刷新网页 $\rightarrow$ 验证 5 步依然存在、黑白轮次正确、落子可继续。
2. **场景 2**：人机对战人类落子 $\rightarrow$ AI 倒计时中立即按 F5 刷新 $\rightarrow$ 验证页面恢复且 AI 自动继续思考落子。
3. **场景 3**：人机对战中将语言从中文切换至法文 $\rightarrow$ 验证页面保持在人机模式、棋盘落子保留、界面文本变为法文。
4. **场景 4**：在个人主页 `/zh/profile/[id]` 切换为英文 $\rightarrow$ 验证跳转到 `/en/profile/[id]`，未跳回首页。
5. **场景 5**：在线好友房正在下棋中切换语言 $\rightarrow$ 验证房间号未丢、无缝重连成功，对局继续。
6. **场景 6**：暗色模式下刷新和切换语言 $\rightarrow$ 验证无白屏闪烁，保持暗色。
